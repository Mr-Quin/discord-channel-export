import { matchPattern, sourceFor } from "../src/sources";

describe("matchPattern", () => {
  it("follows Chrome match pattern rules", () => {
    expect(matchPattern("https://discord.com/*", "https://discord.com/channels/1/2")).toBe(true);
    expect(matchPattern("https://*.discord.com/*", "https://ptb.discord.com/x")).toBe(true);
    expect(matchPattern("https://*.discord.com/*", "https://discord.com/x")).toBe(true);
    expect(matchPattern("https://discord.com/*", "https://notdiscord.com/x")).toBe(false);
    expect(matchPattern("https://discord.com/*", "http://discord.com/x")).toBe(false);
    expect(matchPattern("http://127.0.0.1/*", "http://127.0.0.1:8787/channels/1/2")).toBe(true);
    expect(matchPattern("*://example.org/a/*", "http://example.org/a/b")).toBe(true);
    expect(matchPattern("nonsense", "https://discord.com/")).toBe(false);
  });
});

describe("sourceFor", () => {
  it("picks discord for discord and falls back to it only for extra patterns", () => {
    expect(sourceFor("https://discord.com/channels/1/2")?.id).toBe("discord");
    expect(sourceFor("http://127.0.0.1:1/channels/1/2")).toBeUndefined();
    expect(sourceFor("http://127.0.0.1:1/channels/1/2", ["http://127.0.0.1/*"])?.id).toBe(
      "discord",
    );
  });
});
