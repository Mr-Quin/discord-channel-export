(() => {
  const scroller = document.getElementById("scroller");
  const list = document.getElementById("list");
  const spinner = document.getElementById("spinner");
  const status = document.getElementById("status");
  const useXhr = new URLSearchParams(location.search).get("xhr") === "1";

  let channelId = null;
  let oldest = null;
  let done = false;
  let loading = false;

  function request(url) {
    if (!useXhr) return fetch(url).then((r) => r.json());
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("GET", url);
      xhr.responseType = "json";
      xhr.onload = () => resolve(xhr.response);
      xhr.onerror = reject;
      xhr.send();
    });
  }

  function render(m) {
    const li = document.createElement("li");
    li.className = "item";
    li.dataset.id = m.id;
    li.textContent = `${m.author.username}: ${m.content}`;
    return li;
  }

  async function load(before) {
    if (loading || done) return;
    loading = true;
    spinner.hidden = false;
    const query = before ? `before=${before}&limit=50` : "limit=50";
    // Simulates network latency so a run has to wait like it would on the real site.
    await new Promise((r) => setTimeout(r, 150));
    const batch = await request(`/api/v9/channels/${channelId}/messages?${query}`);
    if (batch.length < 50) done = true;
    const heightBefore = scroller.scrollHeight;
    const frag = document.createDocumentFragment();
    for (const m of batch.slice().reverse()) frag.prepend(render(m));
    list.prepend(frag);
    if (batch.length) oldest = batch[batch.length - 1].id;
    if (before) scroller.scrollTop += scroller.scrollHeight - heightBefore;
    else scroller.scrollTop = scroller.scrollHeight;
    spinner.hidden = true;
    loading = false;
    status.textContent = `${list.children.length} rendered`;
  }

  scroller.addEventListener("scroll", () => {
    if (scroller.scrollTop < 200 && oldest) void load(oldest);
  });

  function open() {
    const m = /\/channels\/(@me|\d+)\/(\d+)/.exec(location.pathname);
    if (!m) return;
    channelId = m[2];
    oldest = null;
    done = false;
    loading = false;
    list.innerHTML = "";
    document.title = `Discord | #harness-${channelId} | Harness Server`;
    void load(null);
  }

  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[data-nav]");
    if (!a) return;
    e.preventDefault();
    history.pushState({}, "", a.getAttribute("href"));
    open();
  });
  window.addEventListener("popstate", open);
  open();
})();
