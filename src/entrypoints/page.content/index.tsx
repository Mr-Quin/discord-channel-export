import ReactDOM from "react-dom/client";
import { Panel } from "../../components/Panel";
import { contentMatches } from "../../core/matches";
import { Controller } from "../../page/controller";
import { sourceFor } from "../../sources";
import "./panel.css";

export default defineContentScript({
  matches: contentMatches(),
  runAt: "document_idle",
  cssInjectionMode: "ui",
  async main(ctx) {
    const source = sourceFor(location.href);
    if (!source) return;
    const controller = new Controller(source);
    await controller.init();

    let lastHref = "";
    let lastTitle = "";
    const track = () => {
      if (location.href === lastHref && document.title === lastTitle) return;
      lastHref = location.href;
      lastTitle = document.title;
      void controller.setConversation(
        source.conversationFromPage(location.href, document.title) ?? undefined,
      );
    };
    track();
    ctx.setInterval(track, 500);

    const ui = await createShadowRootUi(ctx, {
      name: "dce-panel",
      position: "overlay",
      anchor: "body",
      onMount: (container) => {
        const app = document.createElement("div");
        container.append(app);
        const root = ReactDOM.createRoot(app);
        root.render(<Panel controller={controller} />);
        return root;
      },
      onRemove: (root) => root?.unmount(),
    });
    ui.mount();
  },
});
