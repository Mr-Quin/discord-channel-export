import { type CaptureBatch, PING_EVENT } from "../core/capture";
import { installHook, postBatch, postHandshake } from "../core/hook";
import { contentMatches } from "../core/matches";
import { sources } from "../sources";

// The first responses arrive before the isolated world script exists, so batches are
// held until it pings, then flushed in order.
const PENDING_LIMIT = 200;

export default defineContentScript({
  matches: contentMatches(),
  world: "MAIN",
  runAt: "document_start",
  main() {
    let ready = false;
    const pending: CaptureBatch[] = [];
    installHook(
      sources.map((s) => ({ sourceId: s.id, matcher: s.matcher })),
      (batch) => {
        if (ready) postBatch(batch);
        else if (pending.length < PENDING_LIMIT) pending.push(batch);
      },
    );
    window.addEventListener("message", (event) => {
      if (event.source !== window) return;
      if ((event.data as { __dce?: string } | null)?.__dce !== PING_EVENT) return;
      ready = true;
      postHandshake();
      for (const batch of pending.splice(0)) postBatch(batch);
    });
  },
});
