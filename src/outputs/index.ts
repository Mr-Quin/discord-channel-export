import { csvOutput } from "./csv";
import { htmlOutput } from "./html";
import { jsonOutput } from "./json";
import type { Output } from "./types";

export const outputs: Output[] = [jsonOutput, htmlOutput, csvOutput];

export function outputById(id: string): Output | undefined {
  return outputs.find((o) => o.id === id);
}
