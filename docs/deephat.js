/* Project ATMA — DeepHat AI chat (Ollama, DeepHat/DeepHat-V1-7B)
 *
 * What this is, plainly:
 * - DeepHat is Kindo's finetune of Qwen2.5-Coder-7B (7.61B params),
 *   published on Ollama as DeepHat/DeepHat-V1-7B and on Hugging Face
 *   as DeepHat/DeepHat-V1-7B. It is NOT a deephat.ai website import:
 *   there is no deephat.ai chat API to import — the model is the
 *   product, and it runs through Ollama.
 * - This module adds two surfaces that share one history
 *   (localStorage, atma_deephat_history, last 50):
 *   1. A DeepHat AI view in the main pane (nav button, added here).
 *   2. A floating chat bubble, bottom-right, on every view.
 * - Backends (chosen in the panel / in Connect):
 *   ollama  — POST {ollamaUrl}/api/chat, model DeepHat/DeepHat-V1-7B,
 *             stream: true (Ollama NDJSON). Default ollamaUrl is
 *             http://localhost:11434. Works when the browser can
 *             reach that Ollama (same machine, or a LAN host).
 *   gateway — POST {gatewayUrl}/ollama/api/chat, with x-atma-token.
 *             The gateway (agent/atma-gateway.mjs) forwards to its
 *             OLLAMA_URL (default http://127.0.0.1:11434). This is
 *             the route for a phone on Tailscale Serve: Pages (HTTPS)
 *             -> Serve (HTTPS) -> gateway -> Ollama (localhost).
 *   demo    — offline answers, clearly labelled, no model call.
 *   edge    — NO HOST INSTALL. POST {edgeUrl}/chat/completions,
 *             OpenAI-compatible SSE, with a Bearer key the user
 *             pastes in this panel (localStorage only, sent only
 *             to that endpoint). This is the route for Featherless
 *             (base https://api.featherless.ai/v1, model
 *             DeepHat/DeepHat-V1-7B) and any other OpenAI-compatible
 *             edge/serverless provider. No Ollama binary, no server,
 *             no gateway, no device of the user's is touched — the
 *             provider runs the model on its edge/GPU fleet and the
 *             browser talks to it directly. The same-host module
 *             (lab/native/) remains in the repo as an option, but
 *             it is NOT this route and is not required for edge.
 * - Code edits are PROPOSALS ONLY, never automatic admin writes:
 *   DeepHat may output a block ```atma-edit:path/to/file\n<full new
 *   file content>\n```. That block becomes a proposal card with a
 *   preview, a Download patch button, and an Apply button. Apply
 *   is disabled unless: (a) the user turned on "Allow code-edit
 *   proposals" in this panel, (b) a GitHub token is saved in
 *   Connect (localStorage only, sent only to api.github.com), and
 *   (c) the user clicks Apply AND confirms the dialog. Apply
 *   replaces one whole file in the configured repo (default
 *   Etienne0101-lab/Project-ATMA) via the GitHub contents API,
 *   using the file's current SHA. It never deletes, never touches
 *   a path outside the allowlist (docs/, agent/, lab/, server/),
 *   and never runs on its own from a chat reply. If "maripo" meant
 *   a different repo, change owner/repo in Connect — the default
 *   here is the Project-ATMA repo this console lives in.
 * - No key, token, or model is ever committed to this repo.
 *   Run Ollama on a host that can hold a 7B model first:
 *   see server/deephat-ollama-setup.sh and agent/deephat_ollama.py.
 *   This VM (2 CPU, ~310 MB RAM free at build time) cannot run
 *   DeepHat locally — that is a host requirement, not a bug here.
 */
(function () {
  var $ = function (s) { return document.querySelector(s); };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); };
  var MODEL = "DeepHat/DeepHat-V1-7B";
  var SYS = "You are DeepHat, a DevSecOps assistant inside Project ATMA, a Mythic red-team console. Answer concisely about Mythic, DevOps, and code. Use only for systems the user owns or is authorised to test. When the user asks you to change a file, do not claim you changed it — output the full new file in a block marked ```atma-edit:path/to/file followed by the file content and a closing ```, then explain the change in plain words. Never claim admin access you do not have.";
  function cfg(k, d) { try { return localStorage.getItem(k) || d; } catch (e) { return d; } }
  function history() { try { return JSON.parse(localStorage.getItem("atma_deephat_history") || "[]"); } catch (e) { return []; } }
  function saveHistory(msgs) { try { localStorage.setItem("atma_deephat_history", JSON.stringify(msgs.slice(-50))); } catch (e) {} }
  function parseEdits(text) {
    var out = [], re = /```atma-edit:([^\n`]+)\n([\s\S]*?)```/g, m;
    while ((m = re.exec(text))) out.push({ path: m[1].trim(), content: m[2] });
    return out;
  }
  function renderMsgs(el) {
    el.innerHTML = "";
    history().forEach(function (m) {
      var d = document.createElement("div"); d.className = "msg" + (m.who === "you" ? " me" : "");
      d.innerHTML = "<div class=\"who\">" + (m.who === "you" ? "You" : "DeepHat") + "</div><div>" + esc(m.text).replace(/\n/g, "<br>") + "</div>";
      el.appendChild(d);
    });
    el.scrollTop = el.scrollHeight;
  }
  function proposalCard(edit) {
    var allow = cfg("atma_deephat_allow_edits", "") === "1";
    var hasTok = !!cfg("atma_gh_token", "");
    var repo = cfg("atma_gh_repo", "Etienne0101-lab/Project-ATMA");
    var allowed = /^(docs|agent|lab|server)\//.test(edit.path);
    var warn = !allowed ? "<p><b>Blocked:</b> path outside docs/, agent/, lab/, server/ — download only.</p>"
      : !allow ? "<p>Code-edit proposals are off. Turn them on in the DeepHat panel, then re-send, to enable Apply.</p>"
      : !hasTok ? "<p>No GitHub token saved in Connect — download the patch instead, or save a token (localStorage only, sent only to api.github.com).</p>" : "";
    var id = "dhprop" + Math.random().toString(36).slice(2, 8);
    return "<div class=\"card\" id=\"" + id + "\"><h3>Proposed file change (review required)</h3><p><code>" + esc(edit.path) + "</code> · repo <code>" + esc(repo) + "</code> · " + edit.content.split("\n").length + " lines</p><pre>" + esc(edit.content.slice(0, 2000)) + (edit.content.length > 2000 ? "\n… (truncated in preview, full content in download)" : "") + "</pre>" + warn +
      "<button class=\"btn2\" onclick=\"dhDownload('" + id + "')\">Download patch</button> " +
      (allowed && allow && hasTok ? "<button class=\"btn\" onclick=\"dhApply('" + id + "')\">Apply to repo (confirm)</button> " : "") +
      "<button class=\"btn2\" onclick=\"this.parentElement.remove()\">Discard</button>" +
      "<div style=\"display:none\" data-path=\"" + esc(edit.path) + "\">" + esc(edit.content) + "</div></div>";
  }
  window.dhDownload = function (id) {
    var el = document.getElementById(id); if (!el) return;
    var path = el.querySelector("[data-path]").getAttribute("data-path");
    var content = el.querySelector("[data-path]").textContent;
    var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([content], { type: "text/plain" })); a.download = path.split("/").pop(); a.click();
  };
  window.dhApply = async function (id) {
    var el = document.getElementById(id); if (!el) return;
    var path = el.querySelector("[data-path]").getAttribute("data-path");
    var content = el.querySelector("[data-path]").textContent;
    var repo = cfg("atma_gh_repo", "Etienne0101-lab/Project-ATMA");
    var token = cfg("atma_gh_token", "");
    if (!confirm("Apply this whole-file replacement to " + repo + " : " + path + " ? This commits to main. Review the preview first.")) return;
    try {
      var get = await fetch("https://api.github.com/repos/" + repo + "/contents/" + path, { headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json" } });
      var cur = get.ok ? await get.json() : null;
      var put = await fetch("https://api.github.com/repos/" + repo + "/contents/" + path, { method: "PUT", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token, Accept: "application/vnd.github+json" },
        body: JSON.stringify({ message: "DeepHat proposal (user-approved): update " + path, content: btoa(unescape(encodeURIComponent(content))), sha: cur ? cur.sha : undefined, branch: "main" }) });
      var j = await put.json();
      el.insertAdjacentHTML("beforeend", put.ok ? "<p><b>Applied.</b> Commit: " + esc(j.commit && j.commit.sha ? j.commit.sha.slice(0, 10) : "?") + "</p>" : "<p>Apply failed: HTTP " + put.status + " — " + esc(JSON.stringify(j).slice(0, 300)) + "</p>");
    } catch (e) { el.insertAdjacentHTML("beforeend", "<p>Apply error: " + esc(e.message) + "</p>"); }
  };
  async function askDeepHat(q, outEl, msgsEl) {
    var backend = cfg("atma_deephat_backend", "gateway");
    var ollamaUrl = (cfg("atma_ollama_url", "http://localhost:11434") || "").replace(/\/$/, "");
    var gw = (cfg("atma_gateway_url", "") || "").replace(/\/$/, "");
    var gwTok = cfg("atma_gateway_token", "");
    var msgs = history(); msgs.push({ who: "you", text: q }); saveHistory(msgs);
    renderMsgs(msgsEl);
    var edgeUrl = (cfg("atma_edge_url", "https://api.featherless.ai/v1") || "").replace(/\/$/, "").replace(/\/chat\/completions$/, "");
    var edgeKey = cfg("atma_edge_key", "");
    var edgeModel = cfg("atma_edge_model", MODEL);
    if (backend === "demo" || (backend === "ollama" && !ollamaUrl) || (backend === "gateway" && !gw) || (backend === "edge" && !edgeUrl)) {
      var why = backend === "gateway" ? " No gateway URL saved in Connect — add your Tailscale Serve URL there, or switch to Ollama local." : backend === "ollama" ? " No Ollama URL saved — set it in Connect (default http://localhost:11434) and run Ollama on that host first." : backend === "edge" ? " No edge endpoint saved — set it in the DeepHat panel (e.g. https://api.featherless.ai/v1) with your provider key. No host install is needed for this route." : "";
      var ans = "DeepHat demo answer: DeepHat/DeepHat-V1-7B runs through Ollama on your own host (see server/deephat-ollama-setup.sh). It is not running inside GitHub Pages. For a live answer, run Ollama with that model pulled, then choose Ollama local or Gateway in this panel." + why;
      msgs.push({ who: "assistant", text: ans }); saveHistory(msgs); renderMsgs(msgsEl); return;
    }
    var url, headers = { "Content-Type": "application/json" }, reqBody;
    if (backend === "edge") { url = edgeUrl + "/chat/completions"; if (edgeKey) headers["Authorization"] = "Bearer " + edgeKey; reqBody = JSON.stringify({ model: edgeModel, messages: chatMsgs, stream: true }); }
    else if (backend === "gateway") { url = gw + "/ollama/api/chat"; if (gwTok) headers["x-atma-token"] = gwTok; reqBody = JSON.stringify({ model: MODEL, messages: chatMsgs, stream: true }); }
    else { url = ollamaUrl + "/api/chat"; reqBody = JSON.stringify({ model: MODEL, messages: chatMsgs, stream: true }); }
    var chatMsgs = [{ role: "system", content: SYS }].concat(msgs.slice(-10).map(function (m) { return { role: m.who === "you" ? "user" : "assistant", content: m.text }; }));
    var thinking = document.createElement("div"); thinking.className = "msg"; thinking.innerHTML = "<div class=\"who\">DeepHat</div><div>Thinking…</div>"; msgsEl.appendChild(thinking); msgsEl.scrollTop = msgsEl.scrollHeight;
    try {
      var r = await fetch(url, { method: "POST", headers: headers, body: reqBody });
      if (!r.ok || !r.body) { thinking.querySelector("div:last-child").textContent = "DeepHat error (" + r.status + "): " + (await r.text()).slice(0, 300) + ". Check Ollama is running with DeepHat/DeepHat-V1-7B pulled, or the gateway URL/token."; return; }
      var reader = r.body.getReader(), dec = new TextDecoder(), buf = "", full = "";
      while (true) {
        var step = await reader.read(); if (step.done) break;
        buf += dec.decode(step.value, { stream: true });
        var lines = buf.split("\n"); buf = lines.pop();
        lines.forEach(function (line) { var t = line.trim(); if (!t) return; if (t.indexOf("data:") === 0) t = t.slice(5).trim(); if (t === "[DONE]") return; try { var j = JSON.parse(t); var tok = (j.message && j.message.content) ? j.message.content : (j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content) ? j.choices[0].delta.content : (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) ? j.choices[0].message.content : ""; if (tok) { full += tok; thinking.querySelector("div:last-child").textContent = full; msgsEl.scrollTop = msgsEl.scrollHeight; } } catch (e) {} });
      }
      if (!full) { thinking.querySelector("div:last-child").textContent = "Stream completed without text — check the model name and Ollama logs."; return; }
      msgs.push({ who: "assistant", text: full }); saveHistory(msgs); renderMsgs(msgsEl);
      var edits = parseEdits(full);
      if (edits.length && outEl) outEl.innerHTML = edits.map(proposalCard).join("") + outEl.innerHTML;
    } catch (e) {
      thinking.querySelector("div:last-child").textContent = "Network error: " + e.message + ". If you chose Gateway, check the host gateway is running and the Serve URL is reachable from this device; if Ollama local, check http://localhost:11434 is reachable from this browser.";
    }
  }
  function panelHTML() {
    var backend = cfg("atma_deephat_backend", "gateway"), ollamaUrl = cfg("atma_ollama_url", "http://localhost:11434"), gw = cfg("atma_gateway_url", ""), edgeUrl = cfg("atma_edge_url", "https://api.featherless.ai/v1"), edgeModel = cfg("atma_edge_model", MODEL), hasEdgeKey = !!cfg("atma_edge_key", ""), allow = cfg("atma_deephat_allow_edits", "") === "1", repo = cfg("atma_gh_repo", "Etienne0101-lab/Project-ATMA"), hasTok = !!cfg("atma_gh_token", "");
    return "<h1>DeepHat AI</h1><p class=\"muted\">DeepHat/DeepHat-V1-7B via Ollama — Kindo's Qwen2.5-Coder-7B finetune for DevSecOps. It runs on <b>your host's Ollama</b>, not inside GitHub Pages. Pull it there first: <code>ollama pull DeepHat/DeepHat-V1-7B</code> (see <code>server/deephat-ollama-setup.sh</code>). This VM cannot run a 7B model, so a live answer here requires your host.</p>" +
      "<div class=\"card\"><label>Backend</label><select class=\"field\" id=\"dhBackend\"><option value=\"gateway\"" + (backend === "gateway" ? " selected" : "") + ">Gateway (host Ollama via Tailscale)</option><option value=\"ollama\"" + (backend === "ollama" ? " selected" : "") + ">Ollama local</option><option value=\"edge\"" + (backend === "edge" ? " selected" : "") + ">Edge API (no host install — Featherless / OpenAI-compatible)</option><option value=\"demo\"" + (backend === "demo" ? " selected" : "") + ">Demo only</option></select>" +
      "<label>Edge endpoint (base URL, no /chat/completions)</label><input class=\"field\" id=\"dhEdge\" value=\"" + esc(edgeUrl) + "\" placeholder=\"https://api.featherless.ai/v1\">" +
      "<label>Edge API key (browser only, sent only to that endpoint)</label><input class=\"field\" type=\"password\" id=\"dhEdgeKey\" placeholder=\"" + (hasEdgeKey ? "saved in this browser — leave blank to keep it" : "paste provider key here") + "\">" +
      "<label>Edge model</label><input class=\"field\" id=\"dhEdgeModel\" value=\"" + esc(edgeModel) + "\">" +
      "<p class=\"muted\">Edge = no install on any device of yours. Create an account with the provider, copy its API key here, and the console talks to the provider's edge/GPU fleet directly. Check the model ID in the provider's catalog before first use — e.g. Featherless lists DeepHat/DeepHat-V1-7B.</p>" +
      "<label>Ollama URL</label><input class=\"field\" id=\"dhOllama\" value=\"" + esc(ollamaUrl) + "\">" +
      "<label>Gateway URL</label><input class=\"field\" id=\"dhGw\" value=\"" + esc(gw) + "\" placeholder=\"https://your-host.tailnet-xxxx.ts.net\">" +
      "<label>Repo for code-edit proposals (owner/repo)</label><input class=\"field\" id=\"dhRepo\" value=\"" + esc(repo) + "\">" +
      "<label><input type=\"checkbox\" id=\"dhAllow\" " + (allow ? "checked" : "") + "> Allow code-edit proposals (review required — nothing applies without your click + confirm)</label>" +
      "<p class=\"muted\">Repo for proposals: <code>" + esc(repo) + "</code> · GitHub token: <b>" + (hasTok ? "saved in this browser" : "not saved — set it in Connect") + "</b> · Apply is whole-file only, allowlisted to docs/, agent/, lab/, server/. If you meant a different repo than Project-ATMA, change it in Connect.</p>" +
      "<button class=\"btn\" onclick=\"dhSave()\">Save DeepHat settings</button></div>" +
      "<div class=\"card\"><div class=\"chat\" id=\"dhChat\" style=\"min-height:200px\"></div><div class=\"chatbox\"><textarea id=\"dhInput\" placeholder=\"Ask DeepHat… e.g. Explain how the http C2 profile works\"></textarea><button class=\"btn\" id=\"dhSend\">Send</button></div><div id=\"dhProps\" style=\"margin-top:12px\"></div></div>";
  }
  window.dhSave = function () {
    localStorage.setItem("atma_deephat_backend", $("#dhBackend").value);
    localStorage.setItem("atma_ollama_url", $("#dhOllama").value.trim());
    localStorage.setItem("atma_gateway_url", $("#dhGw").value.trim().replace(/\/$/, ""));
    localStorage.setItem("atma_edge_url", $("#dhEdge").value.trim().replace(/\/$/, ""));
    localStorage.setItem("atma_edge_model", $("#dhEdgeModel").value.trim() || MODEL);
    if ($("#dhEdgeKey").value.trim()) localStorage.setItem("atma_edge_key", $("#dhEdgeKey").value.trim());
    localStorage.setItem("atma_gh_repo", $("#dhRepo").value.trim() || "Etienne0101-lab/Project-ATMA");
    localStorage.setItem("atma_deephat_allow_edits", $("#dhAllow").checked ? "1" : "");
    showDeepHat();
  };
  window.showDeepHat = function () {
    var main = $("#main"); if (!main) return;
    document.querySelectorAll("nav button[data-view]").forEach(function (b) { b.classList.toggle("active", b.dataset.view === "deephat"); });
    main.innerHTML = panelHTML();
    var msgsEl = $("#dhChat"); renderMsgs(msgsEl);
    $("#dhSend").addEventListener("click", function () { var v = $("#dhInput").value.trim(); if (!v) return; $("#dhInput").value = ""; askDeepHat(v, $("#dhProps"), msgsEl); });
    $("#dhInput").addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("#dhSend").click(); } });
  };
  // Nav button + floating bubble, added after the main app loads.
  document.addEventListener("DOMContentLoaded", function () {
    var nav = document.querySelector("nav"); if (nav) {
      var b = document.createElement("button"); b.dataset.view = "deephat"; b.textContent = "DeepHat AI"; b.addEventListener("click", showDeepHat); nav.appendChild(b);
    }
    var bubble = document.createElement("div"); bubble.id = "dhBubble";
    bubble.innerHTML = "<button id=\"dhBubbleBtn\" style=\"position:fixed;right:18px;bottom:18px;z-index:9999;border-radius:999px;padding:12px 16px;cursor:pointer\">💬 DeepHat</button>" +
      "<div id=\"dhBubblePanel\" style=\"display:none;position:fixed;right:18px;bottom:70px;z-index:9999;width:340px;max-width:90vw;background:var(--bg,#fff);border:1px solid #888;border-radius:12px;padding:12px;box-shadow:0 8px 30px rgba(0,0,0,.3)\">" +
      "<div style=\"display:flex;justify-content:space-between\"><b>DeepHat</b><button id=\"dhBubbleClose\">✕</button></div>" +
      "<div class=\"chat\" id=\"dhBubbleChat\" style=\"min-height:160px;max-height:300px;overflow:auto\"></div>" +
      "<div class=\"chatbox\"><textarea id=\"dhBubbleInput\" placeholder=\"Ask DeepHat…\"></textarea><button class=\"btn\" id=\"dhBubbleSend\">Send</button></div>" +
      "<p class=\"muted\" style=\"font-size:12px\">Same history as the DeepHat AI view. Backend: set in that view / Connect. Code edits here are proposals only — open the DeepHat view to review and apply.</p></div>";
    document.body.appendChild(bubble);
    $("#dhBubbleBtn").addEventListener("click", function () { var p = $("#dhBubblePanel"); p.style.display = p.style.display === "none" ? "block" : "none"; if (p.style.display === "block") renderMsgs($("#dhBubbleChat")); });
    $("#dhBubbleClose").addEventListener("click", function () { $("#dhBubblePanel").style.display = "none"; });
    $("#dhBubbleSend").addEventListener("click", function () { var v = $("#dhBubbleInput").value.trim(); if (!v) return; $("#dhBubbleInput").value = ""; askDeepHat(v, null, $("#dhBubbleChat")); });
  });
})();
