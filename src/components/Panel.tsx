import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ExportRange, OutputId } from "../core/protocol";
import { describeStop, type Rule } from "../core/rules";
import type { Controller } from "../page/controller";

type LoadMode = "start" | "count" | "date" | "sinceExport";
type RangeMode = "all" | "newest" | "sinceExport";

const OUTPUTS: { id: OutputId; label: string }[] = [
  { id: "json", label: "JSON" },
  { id: "html", label: "HTML" },
  { id: "csv", label: "CSV" },
];

function fmtDate(iso?: string): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export function Panel({ controller }: { controller: Controller }) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const { conversation, stats, settings, running, busy } = state;
  const [loadMode, setLoadMode] = useState<LoadMode>("count");
  const [count, setCount] = useState(settings.defaultCount);
  const [date, setDate] = useState("");
  const [output, setOutput] = useState<OutputId>(settings.defaultOutput);
  const [rangeMode, setRangeMode] = useState<RangeMode>("all");
  const [rangeCount, setRangeCount] = useState(500);
  const [pos, setPos] = useState(settings.panelPosition);
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => setCount(settings.defaultCount), [settings.defaultCount]);
  useEffect(() => setOutput(settings.defaultOutput), [settings.defaultOutput]);

  const onDragStart = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).tagName === "BUTTON") return;
    const box = boxRef.current?.getBoundingClientRect();
    if (!box) return;
    drag.current = { dx: e.clientX - box.left, dy: e.clientY - box.top };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onDrag = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setPos({ x: e.clientX - drag.current.dx, y: e.clientY - drag.current.dy });
  };
  const onDragEnd = () => {
    if (!drag.current) return;
    drag.current = null;
    if (pos) void controller.updateSettings({ panelPosition: pos });
  };

  const rule = (): Rule | null => {
    switch (loadMode) {
      case "start":
        return { kind: "start" };
      case "count":
        return { kind: "count", max: Math.max(1, count) };
      case "date": {
        if (!date) return null;
        const at = new Date(`${date}T00:00:00`);
        return {
          kind: "date",
          floorKey: controller.source.sortKeyForDate(at),
          iso: at.toISOString(),
        };
      }
      case "sinceExport":
        return stats?.newestExported
          ? { kind: "sinceExport", floorKey: stats.newestExported }
          : { kind: "start" };
    }
  };

  const range = (): ExportRange => {
    switch (rangeMode) {
      case "all":
        return { kind: "all" };
      case "newest":
        return { kind: "newest", count: Math.max(1, rangeCount) };
      case "sinceExport":
        return { kind: "sinceExport" };
    }
  };

  const style = pos ? { left: pos.x, top: pos.y, right: "auto", bottom: "auto" } : undefined;
  const title = conversation ? `#${conversation.name ?? conversation.id}` : "Channel Export";

  return (
    <div className={`dce${settings.panelCollapsed ? " collapsed" : ""}`} style={style} ref={boxRef}>
      <div
        className="dce-head"
        onPointerDown={onDragStart}
        onPointerMove={onDrag}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
      >
        <strong title={conversation?.url}>{title}</strong>
        {running && <span className="dce-note">loading…</span>}
        <button
          type="button"
          onClick={() => controller.updateSettings({ panelCollapsed: !settings.panelCollapsed })}
          title={settings.panelCollapsed ? "Expand" : "Collapse"}
        >
          {settings.panelCollapsed ? "+" : "–"}
        </button>
      </div>
      <div className="dce-body">
        {state.hook === "missing" && (
          <div className="dce-warn">Capture hook not active. Reload this tab.</div>
        )}
        {!conversation && <div className="dce-note">Open a channel to start.</div>}
        {conversation && (
          <>
            <div className="dce-stats">
              <span>captured</span>
              <b>{stats?.count ?? 0}</b>
              <span>oldest</span>
              <b>{fmtDate(stats?.oldest?.timestamp)}</b>
              <span>newest</span>
              <b>{fmtDate(stats?.newest?.timestamp)}</b>
              {stats?.newestExported && (
                <>
                  <span>exported up to</span>
                  <b>
                    {fmtDate(controller.source.dateForSortKey(stats.newestExported).toISOString())}
                  </b>
                </>
              )}
            </div>

            <div className="dce-section">
              <div className="dce-title">Load older</div>
              <div className="dce-row">
                <select
                  value={loadMode}
                  onChange={(e) => setLoadMode(e.target.value as LoadMode)}
                  disabled={!!running}
                >
                  <option value="count">a number of messages</option>
                  <option value="date">back to a date</option>
                  <option value="start">whole channel</option>
                  <option value="sinceExport">since last export</option>
                </select>
                {loadMode === "count" && (
                  <input
                    type="number"
                    min={1}
                    value={count}
                    onChange={(e) => setCount(Number(e.target.value))}
                    disabled={!!running}
                  />
                )}
                {loadMode === "date" && (
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    disabled={!!running}
                  />
                )}
              </div>
              <div className="dce-row">
                {!running ? (
                  <button
                    type="button"
                    className="primary"
                    disabled={state.hook !== "ok" || !!busy || (loadMode === "date" && !date)}
                    onClick={() => {
                      const r = rule();
                      if (r) void controller.run(r);
                    }}
                  >
                    Load
                  </button>
                ) : (
                  <button type="button" className="danger" onClick={() => controller.stop()}>
                    Stop
                  </button>
                )}
                <select
                  value={settings.speed}
                  onChange={(e) =>
                    controller.updateSettings({ speed: e.target.value as typeof settings.speed })
                  }
                  title="Scroll speed"
                >
                  <option value="slow">slow</option>
                  <option value="normal">normal</option>
                  <option value="fast">fast</option>
                </select>
                {running && (
                  <span className="dce-note">
                    +{running.progress.loaded}
                    {running.progress.idleRounds > 0 && ` · waiting ${running.progress.idleRounds}`}
                  </span>
                )}
                {!running && state.lastStop && (
                  <span className="dce-note">
                    {describeStop(state.lastStop.reason)} (+{state.lastStop.loaded})
                  </span>
                )}
              </div>
            </div>

            <div className="dce-section">
              <div className="dce-title">Export</div>
              <div className="dce-row">
                <select value={output} onChange={(e) => setOutput(e.target.value as OutputId)}>
                  {OUTPUTS.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <select
                  value={rangeMode}
                  onChange={(e) => setRangeMode(e.target.value as RangeMode)}
                >
                  <option value="all">everything captured</option>
                  <option value="newest">newest N</option>
                  <option value="sinceExport">since last export</option>
                </select>
                {rangeMode === "newest" && (
                  <input
                    type="number"
                    min={1}
                    value={rangeCount}
                    onChange={(e) => setRangeCount(Number(e.target.value))}
                  />
                )}
              </div>
              <div className="dce-row">
                <button
                  type="button"
                  className="primary"
                  disabled={!stats?.count || !!busy}
                  onClick={() => void controller.exportNow(output, range())}
                >
                  {busy === "export" ? "Exporting…" : "Export"}
                </button>
                <button
                  type="button"
                  className="danger"
                  disabled={!stats?.count || !!busy}
                  onClick={() => void controller.clear()}
                >
                  Clear
                </button>
                {state.lastExport && (
                  <span className="dce-note">
                    {state.lastExport.count} → {state.lastExport.filename}
                  </span>
                )}
              </div>
            </div>
            {state.error && <div className="dce-error">{state.error}</div>}
          </>
        )}
      </div>
    </div>
  );
}
