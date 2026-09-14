import { BATCH_EVENT, type CaptureBatch, type CaptureMatcher, HANDSHAKE_EVENT } from "./capture";

type SourceMatcher = { sourceId: string; matcher: CaptureMatcher };

type Emit = (batch: CaptureBatch) => void;

function resolveUrl(input: unknown): string {
  if (typeof input === "string") return new URL(input, location.href).href;
  if (input instanceof Request) return input.url;
  if (input instanceof URL) return input.href;
  return String(input);
}

function methodOf(input: unknown, init?: RequestInit): string {
  return (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
}

function handle(
  sources: SourceMatcher[],
  method: string,
  url: string,
  body: () => unknown,
  emit: Emit,
) {
  for (const { sourceId, matcher } of sources) {
    const request = matcher.match(method, url);
    if (!request) continue;
    let raw: unknown[] | null = null;
    try {
      raw = matcher.parse(body());
    } catch {
      return;
    }
    if (raw) emit({ sourceId, request, raw });
    return;
  }
}

export function installHook(sources: SourceMatcher[], emit: Emit): void {
  const w = window as Window & { __dceHooked?: boolean };
  if (w.__dceHooked) return;
  w.__dceHooked = true;

  const originalFetch = window.fetch;
  window.fetch = function (this: unknown, input: RequestInfo | URL, init?: RequestInit) {
    const result = originalFetch.call(this, input, init);
    let method: string;
    let url: string;
    try {
      method = methodOf(input, init);
      url = resolveUrl(input);
    } catch {
      return result;
    }
    result.then(
      (response) => {
        if (!response.ok) return;
        const hit = sources.some(({ matcher }) => matcher.match(method, url));
        if (!hit) return;
        response
          .clone()
          .text()
          .then((text) => handle(sources, method, url, () => text, emit))
          .catch(() => {});
      },
      () => {},
    );
    return result;
  } as typeof window.fetch;

  const proto = XMLHttpRequest.prototype;
  const originalOpen = proto.open;
  const originalSend = proto.send;
  type Tagged = XMLHttpRequest & { __dceMethod?: string; __dceUrl?: string };
  proto.open = function (this: Tagged, method: string, url: string | URL, ...rest: unknown[]) {
    this.__dceMethod = String(method).toUpperCase();
    try {
      this.__dceUrl = resolveUrl(url);
    } catch {
      this.__dceUrl = undefined;
    }
    return (originalOpen as (...args: unknown[]) => void).call(this, method, url, ...rest);
  } as typeof proto.open;
  proto.send = function (this: Tagged, body?: Document | XMLHttpRequestBodyInit | null) {
    const method = this.__dceMethod ?? "GET";
    const url = this.__dceUrl;
    if (url && sources.some(({ matcher }) => matcher.match(method, url))) {
      this.addEventListener("load", () => {
        if (this.status < 200 || this.status >= 300) return;
        const read = () => {
          if (this.responseType === "" || this.responseType === "text") return this.responseText;
          return this.response;
        };
        handle(sources, method, url, read, emit);
      });
    }
    return originalSend.call(this, body);
  };
}

export function postBatch(batch: CaptureBatch): void {
  window.postMessage({ __dce: BATCH_EVENT, batch }, location.origin);
}

export function postHandshake(): void {
  window.postMessage({ __dce: HANDSHAKE_EVENT }, location.origin);
}
