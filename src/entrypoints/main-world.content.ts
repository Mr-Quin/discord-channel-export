import { PING_EVENT } from "../core/capture";
import { installHook, postBatch, postHandshake } from "../core/hook";
import { contentMatches } from "../core/matches";
import { sources } from "../sources";

export default defineContentScript({
  matches: contentMatches(),
  world: "MAIN",
  runAt: "document_start",
  main() {
    installHook(
      sources.map((s) => ({ sourceId: s.id, matcher: s.matcher })),
      postBatch,
    );
    window.addEventListener("message", (event) => {
      if (event.source !== window) return;
      if ((event.data as { __dce?: string } | null)?.__dce === PING_EVENT) postHandshake();
    });
    postHandshake();
  },
});
