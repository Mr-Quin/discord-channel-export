import {
  BATCH_EVENT,
  type CaptureBatch,
  HANDSHAKE_EVENT,
  PING_EVENT,
  reachedStart,
} from "../core/capture";
import { type BatchEvent, runDriver } from "../core/driver";
import type { Conversation, Message, StoredConversation } from "../core/model";
import {
  type ExportRange,
  type ExportReply,
  type OutputId,
  type StoreReply,
  send,
} from "../core/protocol";
import type { DriveState, Rule, StopReason } from "../core/rules";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  onSettingsChange,
  type Settings,
  saveSettings,
} from "../core/settings";
import type { Source } from "../sources/types";

export type PanelState = {
  conversation?: Conversation;
  stats?: StoredConversation;
  hook: "unknown" | "ok" | "missing";
  running?: { rule: Rule; progress: DriveState };
  lastStop?: { reason: StopReason; loaded: number };
  lastExport?: { filename: string; count: number };
  busy?: "export" | "clear";
  error?: string;
  settings: Settings;
};

type Listener = () => void;
type BatchWaiter = { conversationId: string; resolve: (b: BatchEvent) => void };

function minKey(a: string | undefined, b: string | undefined): string | undefined {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return a < b ? a : b;
}

export class Controller {
  private state: PanelState = { hook: "unknown", settings: DEFAULT_SETTINGS };
  private listeners = new Set<Listener>();
  private waiters = new Set<BatchWaiter>();
  private abort?: AbortController;
  private sessionStart = new Set<string>();

  constructor(readonly source: Source) {}

  subscribe = (fn: Listener): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = (): PanelState => this.state;

  private set(patch: Partial<PanelState>) {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn();
  }

  async init(): Promise<void> {
    this.set({ settings: await loadSettings() });
    onSettingsChange((settings) => this.set({ settings }));
    window.addEventListener("message", this.onWindowMessage);
    this.ping();
    setTimeout(() => {
      if (this.state.hook === "unknown") this.set({ hook: "missing" });
    }, 2000);
  }

  ping(): void {
    window.postMessage({ __dce: PING_EVENT }, location.origin);
  }

  private onWindowMessage = (event: MessageEvent) => {
    if (event.source !== window) return;
    const data = event.data as { __dce?: string; batch?: CaptureBatch } | null;
    if (!data?.__dce) return;
    if (data.__dce === HANDSHAKE_EVENT) {
      if (this.state.hook !== "ok") this.set({ hook: "ok" });
    } else if (data.__dce === BATCH_EVENT && data.batch) {
      void this.onBatch(data.batch);
    }
  };

  private async onBatch(batch: CaptureBatch): Promise<void> {
    if (batch.sourceId !== this.source.id) return;
    const messages: Message[] = [];
    for (const raw of batch.raw) {
      try {
        const m = this.source.normalize(raw, batch.request);
        if (m) messages.push(m);
      } catch {
        // A malformed message must not take down the capture listener.
      }
    }
    let oldestKey: string | undefined;
    for (const m of messages)
      if (oldestKey === undefined || m.sortKey < oldestKey) oldestKey = m.sortKey;
    const current = this.state.conversation;
    const conversation: Conversation =
      current && current.id === batch.request.conversationId
        ? current
        : { source: this.source.id, id: batch.request.conversationId };
    const short = reachedStart(batch.request, batch.raw.length);
    if (short) this.sessionStart.add(conversation.id);
    let reply: StoreReply;
    try {
      reply = await send<StoreReply>({ type: "store", conversation, messages });
    } catch (err) {
      this.set({ error: `storing failed: ${String(err)}` });
      return;
    }
    if (this.state.conversation?.id === conversation.id)
      this.set({ stats: reply.stats, error: undefined });
    const event: BatchEvent = {
      conversationId: conversation.id,
      length: batch.raw.length,
      reachedStart: short,
      oldestKey,
      stats: reply.stats,
    };
    let taken = false;
    for (const w of [...this.waiters]) {
      if (w.conversationId === event.conversationId) {
        this.waiters.delete(w);
        w.resolve(event);
        taken = true;
      }
    }
    if (!taken) {
      const held = this.unseen.get(event.conversationId);
      this.unseen.set(event.conversationId, {
        ...event,
        length: event.length + (held?.length ?? 0),
        reachedStart: event.reachedStart || (held?.reachedStart ?? false),
        oldestKey: minKey(event.oldestKey, held?.oldestKey),
      });
    }
  }

  // A batch that lands between two waits would otherwise be lost to the driver's
  // progress count, so it is held until the next wait asks for one.
  private unseen = new Map<string, BatchEvent>();

  async setConversation(next: Conversation | undefined): Promise<void> {
    const prev = this.state.conversation;
    if (prev?.id === next?.id) {
      if (next && (prev?.name !== next.name || prev?.groupName !== next.groupName)) {
        this.set({ conversation: next });
      }
      return;
    }
    if (this.abort) this.stop("navigated");
    this.set({
      conversation: next,
      stats: undefined,
      lastStop: undefined,
      lastExport: undefined,
      error: undefined,
    });
    if (!next) return;
    // Reaching the channel start is evidence only about the pagination session that saw
    // it. Opening the channel again is a new session that has loaded only the newest page,
    // so the reached-start seed must be dropped or a later run would stop before filling
    // any history the client has not paginated to this time.
    this.sessionStart.delete(next.id);
    await this.refreshStats();
  }

  async refreshStats(): Promise<void> {
    const c = this.state.conversation;
    if (!c) return;
    const stats = await send<StoredConversation | undefined>({
      type: "stats",
      source: c.source,
      id: c.id,
    });
    if (this.state.conversation?.id === c.id) this.set({ stats });
  }

  private waitForBatch = (conversationId: string, timeoutMs: number, signal: AbortSignal) =>
    new Promise<BatchEvent | null>((resolve) => {
      const held = this.unseen.get(conversationId);
      if (held) {
        this.unseen.delete(conversationId);
        resolve(held);
        return;
      }
      const waiter: BatchWaiter = {
        conversationId,
        resolve: (b) => {
          cleanup();
          resolve(b);
        },
      };
      const timer = setTimeout(() => {
        cleanup();
        resolve(null);
      }, timeoutMs);
      const onAbort = () => {
        cleanup();
        resolve(null);
      };
      const cleanup = () => {
        clearTimeout(timer);
        this.waiters.delete(waiter);
        signal.removeEventListener("abort", onAbort);
      };
      signal.addEventListener("abort", onAbort);
      this.waiters.add(waiter);
    });

  private sleep = (ms: number, signal: AbortSignal) =>
    new Promise<void>((resolve) => {
      const timer = setTimeout(done, ms);
      function done() {
        clearTimeout(timer);
        signal.removeEventListener("abort", done);
        resolve();
      }
      signal.addEventListener("abort", done);
    });

  private runSeq = 0;
  private stoppedAs?: StopReason;

  async run(rule: Rule): Promise<void> {
    const c = this.state.conversation;
    if (!c || this.abort) return;
    const abort = new AbortController();
    this.abort = abort;
    // A later run owns the panel state. An earlier run that finishes after being stopped
    // and replaced must not clear the new run's progress, so updates are keyed by seq.
    const seq = ++this.runSeq;
    this.stoppedAs = undefined;
    this.unseen.delete(c.id);
    this.set({
      running: {
        rule,
        progress: { loaded: 0, idleRounds: 0, reachedStart: this.sessionStart.has(c.id) },
      },
      lastStop: undefined,
      error: undefined,
    });
    let reason: StopReason = "stopped";
    try {
      reason = await runDriver(
        {
          conversationId: c.id,
          rule,
          speed: this.state.settings.speed,
          idleRounds: this.state.settings.idleRounds,
          initial: { reachedStart: this.sessionStart.has(c.id) },
        },
        {
          page: this.source.page,
          waitForBatch: this.waitForBatch,
          sleep: this.sleep,
          onProgress: (progress) => {
            if (this.runSeq === seq && this.state.running) {
              this.set({ running: { ...this.state.running, progress } });
            }
          },
        },
        abort.signal,
      );
    } finally {
      if (this.abort === abort) this.abort = undefined;
      if (this.runSeq === seq) {
        const loaded = this.state.running?.progress.loaded ?? 0;
        this.set({ running: undefined, lastStop: { reason: this.stoppedAs ?? reason, loaded } });
        this.stoppedAs = undefined;
      }
    }
  }

  stop(reason: StopReason = "stopped"): void {
    if (!this.abort) return;
    this.stoppedAs = reason;
    this.abort.abort();
    this.abort = undefined;
  }

  async exportNow(output: OutputId, range: ExportRange): Promise<void> {
    const c = this.state.conversation;
    if (!c || this.state.busy) return;
    this.set({ busy: "export", error: undefined });
    try {
      const reply = await send<ExportReply>({
        type: "export",
        request: { conversation: c, output, range },
      });
      this.set({ lastExport: reply });
      await this.refreshStats();
    } catch (err) {
      this.set({ error: `export failed: ${String(err)}` });
    } finally {
      this.set({ busy: undefined });
    }
  }

  async clear(): Promise<void> {
    const c = this.state.conversation;
    if (!c || this.state.busy) return;
    this.stop();
    this.set({ busy: "clear" });
    try {
      await send({ type: "clear", source: c.source, id: c.id });
      this.sessionStart.delete(c.id);
      await this.refreshStats();
    } finally {
      this.set({ busy: undefined, lastStop: undefined, lastExport: undefined });
    }
  }

  async updateSettings(patch: Partial<Settings>): Promise<void> {
    this.set({ settings: await saveSettings(patch) });
  }
}
