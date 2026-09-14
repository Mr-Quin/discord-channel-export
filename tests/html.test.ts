import type { Message } from "../src/core/model";
import { embedJson, escapeHtml, renderHtml } from "../src/outputs/html";

const msg: Message = {
  id: "1",
  sortKey: "1".padStart(20, "0"),
  timestamp: "2026-01-01T00:00:00.000Z",
  author: { id: "a", name: "alice" },
  content: "</script><b>x</b>",
  attachments: [],
  raw: { id: "1", content: "</script>" },
};
const ctx = {
  conversation: { source: "discord", id: "22", name: "gen <x>", groupName: "Srv" },
  exportedAt: new Date("2026-09-13T12:34:56.789Z"),
};

describe("html output", () => {
  it("escapes text", () => {
    expect(escapeHtml('<a href="x">&</a>')).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;");
  });
  it("embeds JSON that cannot close the script element", () => {
    const out = embedJson({ s: "</script>" });
    expect(out).not.toContain("</");
    expect(JSON.parse(out)).toEqual({ s: "</script>" });
  });
  it("renders a self-contained page with the data and viewer", () => {
    const html = renderHtml([msg], ctx);
    expect(html).toContain("<title>#gen &lt;x&gt;</title>");
    expect(html).toContain("Srv · #gen &lt;x&gt;");
    expect(html).toContain('id="dce-data" type="application/json"');
    expect(html).not.toContain("<script src=");
    expect(html).toContain("<style>:root");
    const data = /<script id="dce-data" type="application\/json">(.*?)<\/script>/s.exec(html);
    expect(data).not.toBeNull();
    const payload = JSON.parse(data?.[1] ?? "") as { messages: Message[] };
    expect(payload.messages[0]?.content).toBe("</script><b>x</b>");
  });
});
