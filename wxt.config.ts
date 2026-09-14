import { defineConfig } from "wxt";

export default defineConfig({
  srcDir: "src",
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "Discord Channel Export",
    description:
      "Export a Discord channel as JSON, HTML or CSV, from what your own client already loaded.",
    permissions: ["storage", "downloads", "offscreen"],
  },
});
