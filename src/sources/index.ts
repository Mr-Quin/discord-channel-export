import { discord } from "./discord";
import type { Source } from "./types";

export const sources: Source[] = [discord];

export function sourceById(id: string): Source | undefined {
  return sources.find((s) => s.id === id);
}

const escape = (s: string) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&");

/** Chrome match pattern semantics: `*.host` covers subdomains, and ports are not part of the host. */
export function matchPattern(pattern: string, url: string): boolean {
  const m = /^(\*|https?|file|ftp):\/\/([^/]*)(\/.*)$/.exec(pattern);
  if (!m?.[1] || m[2] === undefined || !m[3]) return false;
  const scheme = m[1] === "*" ? "https?" : m[1];
  const host =
    m[2] === "*"
      ? "[^/]*"
      : m[2].startsWith("*.")
        ? `(?:[^/]+\\.)?${escape(m[2].slice(2))}`
        : escape(m[2]);
  const path = escape(m[3]).replace(/\*/g, ".*");
  return new RegExp(`^${scheme}://${host}(?::\\d+)?${path}$`).test(url);
}

/**
 * The source whose patterns own the URL. Extra patterns (test builds pointing at a
 * local harness) fall back to the first source, which is what the harness imitates.
 */
export function sourceFor(url: string, extra: string[] = []): Source | undefined {
  const own = sources.find((s) => s.matches.some((p) => matchPattern(p, url)));
  if (own) return own;
  if (extra.some((p) => matchPattern(p, url))) return sources[0];
  return undefined;
}
