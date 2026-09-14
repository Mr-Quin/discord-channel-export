import { sources } from "../sources";

declare const __DCE_EXTRA_MATCHES__: string[] | undefined;

/** Match patterns a test build adds for the local harness; empty in normal builds. */
export function extraMatches(): string[] {
  return typeof __DCE_EXTRA_MATCHES__ === "undefined" ? [] : __DCE_EXTRA_MATCHES__;
}

export function contentMatches(): string[] {
  return [...new Set(sources.flatMap((s) => s.matches))];
}
