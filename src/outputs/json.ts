import type { Output } from "./types";

export const jsonOutput: Output = {
  id: "json",
  label: "JSON (raw)",
  ext: "json",
  mime: "application/json",
  serialize: (messages) => JSON.stringify(messages.map((m) => m.raw)),
};
