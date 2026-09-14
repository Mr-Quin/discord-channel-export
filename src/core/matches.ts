import { sources } from "../sources";

// Test builds add the local harness origin through WXT_EXTRA_MATCHES.
export function contentMatches(): string[] {
  const extra = String(import.meta.env.WXT_EXTRA_MATCHES ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set([...sources.flatMap((s) => s.matches), ...extra])];
}
