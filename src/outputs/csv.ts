import type { Message } from "../core/model";
import type { Output } from "./types";

export function csvField(value: string): string {
  if (!/[",\r\n]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

export function csvRow(m: Message): string {
  return [
    m.id,
    m.timestamp,
    m.author.id,
    m.author.name,
    m.content,
    m.attachments.map((a) => a.url).join(" "),
  ]
    .map(csvField)
    .join(",");
}

export const CSV_HEADER = "id,timestamp,author_id,author,content,attachments";

export const csvOutput: Output = {
  id: "csv",
  label: "CSV",
  ext: "csv",
  mime: "text/csv",
  serialize: (messages) => `${[CSV_HEADER, ...messages.map(csvRow)].join("\r\n")}\r\n`,
};
