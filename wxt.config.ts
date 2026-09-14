import { defineConfig } from "wxt";

// Test builds point the content scripts at the local harness as well.
const extraMatches = (process.env.WXT_EXTRA_MATCHES ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export default defineConfig({
  srcDir: "src",
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "Discord Channel Export",
    description:
      "Export a Discord channel as JSON, HTML or CSV, from what your own client already loaded.",
    permissions: ["storage", "downloads", "offscreen"],
  },
  vite: () => ({
    define: { __DCE_EXTRA_MATCHES__: JSON.stringify(extraMatches) },
  }),
  hooks: {
    "build:manifestGenerated": (_wxt, manifest) => {
      if (!extraMatches.length) return;
      for (const cs of manifest.content_scripts ?? []) {
        cs.matches = [...new Set([...(cs.matches ?? []), ...extraMatches])];
      }
      for (const war of manifest.web_accessible_resources ?? []) {
        if (typeof war === "object" && "matches" in war && war.matches) {
          war.matches = [...new Set([...war.matches, ...extraMatches])];
        }
      }
    },
  },
});
