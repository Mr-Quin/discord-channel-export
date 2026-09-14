export type CaptureKind = "latest" | "before" | "after" | "around";

export type CaptureRequest = {
  conversationId: string;
  kind: CaptureKind;
  limit: number;
};

export type CaptureMatcher = {
  match(method: string, url: string): CaptureRequest | null;
  parse(body: unknown): unknown[] | null;
};

export type CaptureBatch = {
  sourceId: string;
  request: CaptureRequest;
  raw: unknown[];
};

export const BATCH_EVENT = "dce:batch";
export const HANDSHAKE_EVENT = "dce:handshake";
export const PING_EVENT = "dce:ping";

export function reachedStart(request: CaptureRequest, batchLength: number): boolean {
  if (request.kind !== "before" && request.kind !== "latest") return false;
  return batchLength < request.limit;
}
