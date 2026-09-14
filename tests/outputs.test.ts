import type { Message } from "../src/core/model";
import { CSV_HEADER, csvField, csvOutput } from "../src/outputs/csv";
import { renderFilename, sanitize, stamp } from "../src/outputs/filename";
import { jsonOutput } from "../src/outputs/json";

const conv = { source: "discord", id: "22", url: "u", name: "gen/eral", groupName: "Srv" };
const msg = (id: string, content: string): Message => ({
  id,
  sortKey: id.padStart(20, "0"),
  timestamp: "2026-01-01T00:00:00.000Z",
  author: { id: "a", name: "alice" },
  content,
  attachments: [{ id: "x", name: "f", url: "https://x/f" }],
  raw: { id, content, extra: true },
});
const ctx = { conversation: conv, exportedAt: new Date("2026-09-13T12:34:56.789Z") };

describe("json", () => {
  it("emits raw objects untouched", () => {
    expect(JSON.parse(jsonOutput.serialize([msg("1", "a")], ctx))).toEqual([
      { id: "1", content: "a", extra: true },
    ]);
  });
});

describe("csv", () => {
  it("quotes only when needed", () => {
    expect(csvField("plain")).toBe("plain");
    expect(csvField('say "hi", ok\nnext')).toBe('"say ""hi"", ok\nnext"');
  });
  it("writes header and rows with CRLF", () => {
    const out = csvOutput.serialize([msg("1", "a,b")], ctx);
    expect(out).toBe(`${CSV_HEADER}\r\n1,2026-01-01T00:00:00.000Z,a,alice,"a,b",https://x/f\r\n`);
  });
});

describe("filename", () => {
  it("formats the stamp in UTC", () => {
    expect(stamp(ctx.exportedAt)).toBe("20260913T123456Z");
  });
  it("sanitises names", () => {
    expect(sanitize(' a/b:c*?"<>| ')).toBe("a_b_c______");
    expect(sanitize("..hidden")).toBe("hidden");
    expect(sanitize("")).toBe("untitled");
  });
  it("renders the template and forces the extension", () => {
    expect(renderFilename("{name}-{id}-{stamp}.{ext}", conv, "json", ctx.exportedAt)).toBe(
      "gen_eral-22-20260913T123456Z.json",
    );
    expect(renderFilename("{group}/{name}", conv, "csv", ctx.exportedAt)).toBe("Srv/gen_eral.csv");
    expect(renderFilename("{unknown}", conv, "csv", ctx.exportedAt)).toBe("{unknown}.csv");
  });
});
