(() => {
  var data = JSON.parse(document.getElementById("dce-data").textContent);
  var messages = data.messages;
  var isDiscord = data.conversation.source === "discord";

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function pad(n) {
    return n < 10 ? `0${n}` : `${n}`;
  }

  function fmtTime(d) {
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function fmtDay(d) {
    return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  }

  function fmtSize(n) {
    if (typeof n !== "number") return "";
    var units = ["B", "KB", "MB", "GB"];
    var i = 0;
    while (n >= 1024 && i < units.length - 1) {
      n /= 1024;
      i++;
    }
    return `${i ? n.toFixed(1) : n} ${units[i]}`;
  }

  var mentionNames = {};
  messages.forEach((m) => {
    var raw = m.raw || {};
    (raw.mentions || []).forEach((u) => {
      if (u?.id) mentionNames[u.id] = u.global_name || u.username || u.id;
    });
    if (m.author?.id) mentionNames[m.author.id] = m.author.displayName || m.author.name;
  });

  // A small subset of Discord markdown. Text is escaped first, then patterns are
  // replaced on the escaped string, so nothing in the message can inject markup.
  function md(text) {
    var s = esc(text);
    var blocks = [];
    s = s.replace(/```(?:[\w-]*\n)?([\s\S]*?)```/g, (_, code) => {
      blocks.push(`<pre><code>${code.replace(/^\n+|\n+$/g, "")}</code></pre>`);
      return `\uE000${blocks.length - 1}\uE000`;
    });
    s = s.replace(/`([^`\n]+)`/g, (_, code) => {
      blocks.push(`<code>${code}</code>`);
      return `\uE000${blocks.length - 1}\uE000`;
    });
    s = s.replace(/\|\|([\s\S]+?)\|\|/g, '<span class="spoiler">$1</span>');
    s = s.replace(/\*\*\*([\s\S]+?)\*\*\*/g, "<b><i>$1</i></b>");
    s = s.replace(/\*\*([\s\S]+?)\*\*/g, "<b>$1</b>");
    s = s.replace(/__([\s\S]+?)__/g, "<u>$1</u>");
    s = s.replace(/(^|[^*\w])\*([^*\n]+?)\*(?!\w)/g, "$1<i>$2</i>");
    s = s.replace(/(^|[^_\w])_([^_\n]+?)_(?!\w)/g, "$1<i>$2</i>");
    s = s.replace(/~~([\s\S]+?)~~/g, "<s>$1</s>");
    s = s.replace(
      /&lt;a?:(\w+):(\d+)&gt;/g,
      (_, name, id) =>
        `<img class="emoji" alt=":${name}:" title=":${name}:" src="https://cdn.discordapp.com/emojis/${id}.webp">`,
    );
    s = s.replace(
      /&lt;@!?(\d+)&gt;/g,
      (_, id) => `<span class="mention">@${esc(mentionNames[id] || id)}</span>`,
    );
    s = s.replace(/&lt;#(\d+)&gt;/g, '<span class="mention">#$1</span>');
    s = s.replace(/&lt;@&amp;(\d+)&gt;/g, '<span class="mention">@role</span>');
    s = s.replace(
      /&lt;t:(\d+)(?::[tTdDfFR])?&gt;/g,
      (_, unix) => `<span class="mention">${new Date(unix * 1000).toLocaleString()}</span>`,
    );
    s = s.replace(
      /(^|[^"=])(https?:\/\/[^\s<]+[^\s<.,;:!?)"'])/g,
      '$1<a href="$2" target="_blank" rel="noreferrer">$2</a>',
    );
    s = s.replace(/(^|\n)&gt; ?(.*)/g, "$1<blockquote>$2</blockquote>");
    s = s.replace(/\uE000(\d+)\uE000/g, (_, i) => blocks[Number(i)]);
    return s;
  }

  function isImage(a) {
    return /^image\//.test(a.contentType || "") || /\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(a.url);
  }

  function isVideo(a) {
    return /^video\//.test(a.contentType || "") || /\.(mp4|webm|mov)(\?|$)/i.test(a.url);
  }

  function attachmentHtml(a) {
    if (isImage(a))
      return `<a href="${esc(a.url)}" target="_blank" rel="noreferrer"><img src="${esc(a.url)}" alt="${esc(a.name)}" loading="lazy"></a>`;
    if (isVideo(a)) return `<video src="${esc(a.url)}" controls preload="metadata"></video>`;
    return `<a class="file" href="${esc(a.url)}" target="_blank" rel="noreferrer">📄 ${esc(a.name || "file")} <span class="size">${esc(fmtSize(a.size))}</span></a>`;
  }

  function embedHtml(e) {
    var img = e.image || e.thumbnail;
    // A bare link preview of a picture or clip is shown as the media itself, not a card.
    var bare = !e.title && !e.description && !e.provider?.name;
    if (bare && e.type === "image" && img?.url)
      return `<div class="embed media"><a href="${esc(img.url)}" target="_blank" rel="noreferrer"><img src="${esc(img.proxy_url || img.url)}" alt="" loading="lazy"></a></div>`;
    if (bare && (e.type === "video" || e.type === "gifv") && e.video?.url)
      return `<div class="embed media"><video src="${esc(e.video.proxy_url || e.video.url)}" controls preload="metadata"></video></div>`;
    var out = '<div class="embed">';
    if (e.provider?.name) out += `<div class="provider">${esc(e.provider.name)}</div>`;
    if (e.title)
      out += `<div class="title">${e.url ? `<a href="${esc(e.url)}" target="_blank" rel="noreferrer">${esc(e.title)}</a>` : esc(e.title)}</div>`;
    if (e.description) out += `<div class="desc">${md(e.description)}</div>`;
    if (e.type === "video" && e.video && e.video.url)
      out += `<video src="${esc(e.video.url)}" controls preload="metadata"></video>`;
    else if (img?.url)
      out += `<a href="${esc(img.url)}" target="_blank" rel="noreferrer"><img src="${esc(img.proxy_url || img.url)}" alt="" loading="lazy"></a>`;
    out += "</div>";
    return out;
  }

  function reactionHtml(r) {
    var emoji = r.emoji || {};
    var face = emoji.id
      ? `<img class="emoji" src="https://cdn.discordapp.com/emojis/${emoji.id}.webp" alt=":${esc(emoji.name)}:">`
      : esc(emoji.name || "");
    return `<span class="reaction">${face} ${r.count || 0}</span>`;
  }

  function systemText(raw) {
    switch (raw.type) {
      case 6:
        return "pinned a message";
      case 7:
        return "joined the server";
      case 18:
        return "started a thread";
      default:
        return null;
    }
  }

  function render(list) {
    var html = [];
    var prev = null;
    list.forEach((m) => {
      var raw = isDiscord && m.raw ? m.raw : {};
      var when = new Date(m.timestamp);
      var sameDay = prev && new Date(prev.timestamp).toDateString() === when.toDateString();
      if (!sameDay) html.push(`<div class="day">${esc(fmtDay(when))}</div>`);
      var grouped =
        prev &&
        sameDay &&
        prev.author.id === m.author.id &&
        !raw.referenced_message &&
        !raw.message_reference &&
        when - new Date(prev.timestamp) < 7 * 60 * 1000 &&
        !systemText(raw);
      var name = m.author.displayName || m.author.name || "unknown";
      html.push(
        `<div class="msg${grouped ? "" : " first"}" id="m${esc(m.id)}" data-text="${esc(`${m.content} ${name}`.toLowerCase())}">`,
      );
      html.push(
        `<div class="avatar">${m.author.avatarUrl ? `<img src="${esc(m.author.avatarUrl)}" alt="" loading="lazy">` : ""}</div>`,
      );
      html.push("<div>");
      if (!grouped) {
        if (raw.referenced_message) {
          const ref = raw.referenced_message;
          const refAuthor = ref.author ? ref.author.global_name || ref.author.username : "";
          html.push(
            `<div class="reply">↰ <b>${esc(refAuthor)}</b> ${esc((ref.content || "").slice(0, 120))}</div>`,
          );
        }
        html.push(
          `<div class="head"><span class="author">${esc(name)}</span><span class="time" title="${esc(when.toISOString())}">${esc(fmtTime(when))}</span></div>`,
        );
      }
      var sys = systemText(raw);
      if (sys) html.push(`<div class="system">${esc(sys)}</div>`);
      else if (m.content)
        html.push(
          `<div class="content">${md(m.content)}${raw.edited_timestamp ? ' <span class="edited">(edited)</span>' : ""}</div>`,
        );
      if (m.attachments?.length)
        html.push(`<div class="attachments">${m.attachments.map(attachmentHtml).join("")}</div>`);
      if (raw.embeds?.length)
        html.push(`<div class="embeds">${raw.embeds.map(embedHtml).join("")}</div>`);
      if (raw.reactions?.length)
        html.push(`<div class="reactions">${raw.reactions.map(reactionHtml).join("")}</div>`);
      html.push("</div></div>");
      prev = m;
    });
    return html.join("") || '<div class="empty">No messages.</div>';
  }

  var main = document.querySelector("main");
  main.innerHTML = render(messages);

  // Media points at Discord's CDN and third-party hosts; links expire and hosts block
  // hotlinking, so anything that fails to load collapses instead of leaving a blank box.
  main.addEventListener(
    "error",
    (e) => {
      var el = e.target;
      if (!(el instanceof HTMLImageElement) && !(el instanceof HTMLVideoElement)) return;
      var box = el.closest(".embed.media, .avatar");
      if (box) box.classList.add("broken");
      else if (el.closest(".attachments"))
        el.replaceWith(
          Object.assign(document.createElement("span"), {
            className: "muted",
            textContent: el.alt || "image unavailable",
          }),
        );
    },
    true,
  );

  main.addEventListener("click", (e) => {
    var t = e.target.closest(".spoiler");
    if (t) t.classList.toggle("open");
  });

  var search = document.getElementById("search");
  var count = document.getElementById("count");
  search.addEventListener("input", () => {
    var q = search.value.trim().toLowerCase();
    var shown = 0;
    main.querySelectorAll(".msg").forEach((el) => {
      var hit = !q || el.getAttribute("data-text").indexOf(q) >= 0;
      el.classList.toggle("hidden", !hit);
      if (hit) shown++;
    });
    count.textContent = q ? `${shown} of ${messages.length}` : `${messages.length} messages`;
  });

  document.getElementById("theme").addEventListener("click", () => {
    var root = document.documentElement;
    root.setAttribute("data-theme", root.getAttribute("data-theme") === "light" ? "dark" : "light");
  });
})();
