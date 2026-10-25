// Project ATMA — companion gateway (OpenForge gateway pattern)
// OPTIONAL Tier 2 companion, NOT serverless and NOT required by the Pages app.
// Run it on your own host, then point the ATMA console's Connect tab at it.
// Two jobs, both localhost-only by design:
//   1. Groq chat proxy (existing): POST /v1/chat/completions, GET /v1/models
//      forwarded to Groq with the key from YOUR environment. The key never
//      leaves your host except to api.groq.com. Streaming SSE passthrough.
//   2. Mythic proxy (NEW, the web-app <-> real-backend link): POST
//      /mythic/graphql and POST /mythic/auth, forwarded to your own
//      Mythic server (default https://127.0.0.1:7443, the native nginx
//      front end from lab/native/). This is how the static Pages console
//      talks to a real backend without the browser ever talking to
//      Mythic directly (which Pages' HTTPS origin + CORS would block).
//      Security, stated plainly:
//        - The gateway itself is protected by ATMA_GATEWAY_TOKEN. The
//          browser must send it (Authorization: Bearer <token> or
//          x-atma-token) or the /mythic/* routes return 401. Without
//          that token, a public Pages visitor cannot use your gateway.
//        - The operator's Mythic credentials / JWT are NEVER stored by
//          the gateway: /mythic/auth forwards username+password to
//          Mythic and returns its JWT to the browser; /mythic/graphql
//          forwards whatever Authorization header the browser sent.
//          The gateway holds no operator token in memory or on disk.
//        - Mythic's nginx uses a self-signed certificate in the lab
//          setup, so set MYTHIC_INSECURE_TLS=1 for lab use only. On a
//          host with a real certificate, leave it unset.
// Usage: GROQ_API_KEY=... ATMA_GATEWAY_TOKEN=... MYTHIC_URL=https://127.0.0.1:7443 MYTHIC_INSECURE_TLS=1 node agent/atma-gateway.mjs [port]
// Default port: 8787. Bind: localhost only, by design.
// Groq routes require GROQ_API_KEY; Mythic routes do not — the gateway
// can run Mythic-only with no Groq key at all.
// To reach it from your phone over Tailscale, expose it with Tailscale
// Serve on the host (e.g. tailscale serve --bg --https=443 http://127.0.0.1:8787)
// and point Connect at that Serve HTTPS name — never expose 8787 publicly.
import { createServer } from "node:http";

const port = Number(process.argv[2] || process.env.ATMA_GATEWAY_PORT || 8787);
const groqKey = process.env.GROQ_API_KEY || "";
const gatewayToken = process.env.ATMA_GATEWAY_TOKEN || "";
const mythicUrl = (process.env.MYTHIC_URL || "https://127.0.0.1:7443").replace(/\/$/, "");
// DeepHat / Ollama proxy (NEW): POST /ollama/* forwards to the host's
// Ollama (default http://127.0.0.1:11434, override with OLLAMA_URL).
// Same gateway-token rule as Mythic: x-atma-token required, never
// stored. The Pages DeepHat chat uses this route over Tailscale Serve
// so a phone can reach a host Ollama without exposing Ollama itself.
// Ollama itself has no auth on localhost by default — the gateway
// token is the only gate, and the gateway binds localhost only.
const ollamaUrl = (process.env.OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/$/, "");
// Lab-only: Mythic's nginx uses a self-signed cert, so Node must be told
// to accept it. This is the standard Node flag, set by the gateway itself
// only when the host explicitly opted in with MYTHIC_INSECURE_TLS=1.
if (process.env.MYTHIC_INSECURE_TLS === "1") process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const mythicFetch = (url, opts) => fetch(url, opts);

const server = createServer(async (req, res) => {
  const send = (code, obj) => {
    res.writeHead(code, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type,authorization,x-atma-token" });
    res.end(JSON.stringify(obj));
  };
  if (req.method === "OPTIONS") { res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type,authorization,x-atma-token" }); return res.end(); }
  if (req.url === "/gateway/status" || req.url === "/status") return send(200, { backend: "atma-gateway", provider: groqKey ? "groq" : "mythic-only", mythic_url: mythicUrl, mythic_proxy: true, ollama_url: ollamaUrl, ollama_proxy: true, ok: true });
  // ---- Ollama proxy (DeepHat chat): /ollama/api/chat, /ollama/api/tags, etc. ----
  if (req.url.startsWith("/ollama/")) {
    if (!gatewayToken) return send(500, { error: "gateway has no ATMA_GATEWAY_TOKEN set — Ollama proxy disabled until the host sets one" });
    if ((req.headers["x-atma-token"] || "") !== gatewayToken) return send(401, { error: "invalid or missing gateway token (send it as x-atma-token)" });
    let body = "";
    for await (const chunk of req) body += chunk;
    const target = ollamaUrl + req.url.slice("/ollama".length);
    try {
      const r = await fetch(target, { method: req.method, headers: { "Content-Type": "application/json" }, body: body || undefined });
      // Stream NDJSON / SSE through unchanged; non-streaming JSON too.
      if (r.body) {
        res.writeHead(r.status, { "Content-Type": r.headers.get("content-type") || "application/json", "Access-Control-Allow-Origin": "*" });
        for await (const chunk of r.body) res.write(chunk);
        return res.end();
      }
      return send(r.status, await r.json().catch(() => ({})));
    } catch (e) {
      return send(502, { error: "could not reach Ollama at " + ollamaUrl + ": " + e.message + " — is Ollama running and is DeepHat/DeepHat-V1-7B pulled?" });
    }
  }
  // ---- Mythic proxy (gateway-token protected, operator token forwarded, never stored) ----
  if (req.url === "/mythic/graphql" || req.url === "/mythic/auth") {
    if (!gatewayToken) return send(500, { error: "gateway has no ATMA_GATEWAY_TOKEN set — Mythic proxy disabled until the host sets one" });
    // Gateway auth is x-atma-token ONLY, so that Authorization can carry
    // the browser's Mythic operator JWT through to Mythic untouched.
    const presented = req.headers["x-atma-token"] || "";
    if (presented !== gatewayToken) return send(401, { error: "invalid or missing gateway token (send it as x-atma-token; Authorization carries the Mythic operator token)" });
    let body = "";
    for await (const chunk of req) body += chunk;
    const target = req.url === "/mythic/auth" ? mythicUrl + "/auth" : mythicUrl + "/graphql/";
    try {
      const headers = { "Content-Type": "application/json" };
      // Forward the browser's operator Authorization (JWT) if it sent one;
      // the gateway does not store it, it only passes it through.
      if (req.headers.authorization && req.url === "/mythic/graphql") headers["Authorization"] = req.headers.authorization;
      const r = await mythicFetch(target, { method: "POST", headers, body });
      const text = await r.text();
      res.writeHead(r.status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      return res.end(text);
    } catch (e) {
      return send(502, { error: "could not reach Mythic at " + mythicUrl + ": " + e.message });
    }
  }
  // ---- Groq proxy (unchanged) ----
  if (!groqKey) return send(404, { error: "not found (Groq key not configured on this gateway; Mythic proxy is at /mythic/*)" });
  if (req.url === "/v1/models" && req.method === "GET") {
    const r = await fetch("https://api.groq.com/openai/v1/models", { headers: { Authorization: "Bearer " + groqKey } });
    return send(r.status, await r.json().catch(() => ({})));
  }
  if (req.url === "/v1/chat/completions" && req.method === "POST") {
    let body = "";
    for await (const chunk of req) body += chunk;
    let parsed = {};
    try { parsed = JSON.parse(body); } catch {}
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + groqKey },
      body,
    });
    if (parsed.stream && r.body) {
      res.writeHead(r.status, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Access-Control-Allow-Origin": "*" });
      for await (const chunk of r.body) res.write(chunk);
      return res.end();
    }
    return send(r.status, await r.json().catch(() => ({})));
  }
  return send(404, { error: "not found" });
});
server.listen(port, "127.0.0.1", () => console.log(`atma-gateway: listening on http://127.0.0.1:${port} (localhost only) mythic=${mythicUrl} ollama=${ollamaUrl} groq=${groqKey ? "yes" : "no"}`));
