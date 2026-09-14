import type { Conversation, ConversationStats, Message, StoredConversation } from "./model";
import type { ExportRange } from "./protocol";

const DB_NAME = "discord-channel-export";
const DB_VERSION = 1;
const MESSAGES = "messages";
const CONVERSATIONS = "conversations";

type MessageRow = Message & { source: string; conversationId: string };

let dbPromise: Promise<IDBDatabase> | undefined;

export function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore(MESSAGES, { keyPath: ["source", "conversationId", "sortKey"] });
        db.createObjectStore(CONVERSATIONS, { keyPath: ["source", "id"] });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

export function resetDbForTests(): void {
  dbPromise = undefined;
}

function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

const LOW = "";
const HIGH = "￿";

function rangeFor(source: string, id: string, fromKey = LOW, toKey = HIGH): IDBKeyRange {
  return IDBKeyRange.bound([source, id, fromKey], [source, id, toKey]);
}

async function edge(
  store: IDBObjectStore,
  source: string,
  id: string,
  direction: IDBCursorDirection,
): Promise<{ sortKey: string; timestamp: string } | undefined> {
  const cursor = await promisify(store.openCursor(rangeFor(source, id), direction));
  if (!cursor) return undefined;
  const row = cursor.value as MessageRow;
  return { sortKey: row.sortKey, timestamp: row.timestamp };
}

async function computeStats(
  messages: IDBObjectStore,
  source: string,
  id: string,
): Promise<Pick<ConversationStats, "count" | "oldest" | "newest">> {
  const [count, oldest, newest] = await Promise.all([
    promisify(messages.count(rangeFor(source, id))),
    edge(messages, source, id, "next"),
    edge(messages, source, id, "prev"),
  ]);
  return { count, oldest, newest };
}

export async function putMessages(
  conversation: Conversation,
  batch: Message[],
): Promise<{ added: number; stats: StoredConversation }> {
  const db = await openDb();
  const tx = db.transaction([MESSAGES, CONVERSATIONS], "readwrite");
  const messages = tx.objectStore(MESSAGES);
  const conversations = tx.objectStore(CONVERSATIONS);
  let added = 0;
  for (const m of batch) {
    const key = [conversation.source, conversation.id, m.sortKey];
    const exists = (await promisify(messages.count(IDBKeyRange.only(key)))) > 0;
    if (!exists) added += 1;
    messages.put({
      ...m,
      source: conversation.source,
      conversationId: conversation.id,
    } satisfies MessageRow);
  }
  const previous = (await promisify(conversations.get([conversation.source, conversation.id]))) as
    | StoredConversation
    | undefined;
  const stats = await computeStats(messages, conversation.source, conversation.id);
  const next: StoredConversation = {
    ...previous,
    ...conversation,
    name: conversation.name ?? previous?.name,
    groupName: conversation.groupName ?? previous?.groupName,
    ...stats,
    updatedAt: Date.now(),
  };
  conversations.put(next);
  await done(tx);
  return { added, stats: next };
}

export async function getStats(
  source: string,
  id: string,
): Promise<StoredConversation | undefined> {
  const db = await openDb();
  const tx = db.transaction(CONVERSATIONS, "readonly");
  return (await promisify(tx.objectStore(CONVERSATIONS).get([source, id]))) as
    | StoredConversation
    | undefined;
}

export async function listConversations(): Promise<StoredConversation[]> {
  const db = await openDb();
  const tx = db.transaction(CONVERSATIONS, "readonly");
  const rows = (await promisify(tx.objectStore(CONVERSATIONS).getAll())) as StoredConversation[];
  return rows.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
}

export async function clearConversation(source: string, id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction([MESSAGES, CONVERSATIONS], "readwrite");
  tx.objectStore(MESSAGES).delete(rangeFor(source, id));
  tx.objectStore(CONVERSATIONS).delete([source, id]);
  await done(tx);
}

export async function markExported(source: string, id: string, newestKey: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(CONVERSATIONS, "readwrite");
  const store = tx.objectStore(CONVERSATIONS);
  const row = (await promisify(store.get([source, id]))) as StoredConversation | undefined;
  if (!row) return;
  if (row.newestExported === undefined || newestKey > row.newestExported) {
    store.put({ ...row, newestExported: newestKey });
  }
  await done(tx);
}

function keyAbove(key: string): string {
  return `${key} `;
}

/** Messages in the range, oldest first. */
export async function readMessages(
  source: string,
  id: string,
  range: ExportRange,
  newestExported?: string,
): Promise<Message[]> {
  const db = await openDb();
  const tx = db.transaction(MESSAGES, "readonly");
  const store = tx.objectStore(MESSAGES);
  const strip = (rows: MessageRow[]): Message[] =>
    rows.map(({ source: _s, conversationId: _c, ...m }) => m);
  switch (range.kind) {
    case "all":
      return strip((await promisify(store.getAll(rangeFor(source, id)))) as MessageRow[]);
    case "between":
      return strip(
        (await promisify(
          store.getAll(rangeFor(source, id, range.fromKey, range.toKey)),
        )) as MessageRow[],
      );
    case "sinceExport": {
      const from = newestExported === undefined ? LOW : keyAbove(newestExported);
      return strip((await promisify(store.getAll(rangeFor(source, id, from)))) as MessageRow[]);
    }
    case "newest": {
      const rows: MessageRow[] = [];
      let cursor = await promisify(store.openCursor(rangeFor(source, id), "prev"));
      while (cursor && rows.length < range.count) {
        rows.push(cursor.value as MessageRow);
        cursor.continue();
        cursor = await promisify(cursor.request as IDBRequest<IDBCursorWithValue | null>);
      }
      return strip(rows.reverse());
    }
  }
}
