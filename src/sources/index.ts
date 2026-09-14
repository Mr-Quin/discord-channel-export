import { discord } from "./discord";
import type { Source } from "./types";

export const sources: Source[] = [discord];

export function sourceFor(url: string): Source | undefined {
  return sources.find((s) => s.matches.some((pattern) => matchPattern(pattern, url)));
}

export function sourceById(id: string): Source | undefined {
  return sources.find((s) => s.id === id);
}

export function matchPattern(pattern: string, url: string): boolean {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`).test(url);
}
