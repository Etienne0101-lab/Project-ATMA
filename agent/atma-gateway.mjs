// Project ATMA — companion gateway (OpenForge gateway pattern, Groq-only)
// OPTIONAL Tier 2 companion, NOT serverless and NOT required by the Pages app.
// Run it on your own host, then point the ATMA console's Connect tab at it.
// It is a tiny OpenAI-compatible proxy: POST /v1/chat/completions and
// GET /v1/models are forwarded to Groq with the key from YOUR environment.
// The key never leaves your host except to api.groq.com.
// Usage: GROQ_API_KEY=... node agent/atma-gateway.mjs [port]
// Default port: 8787. Bind: localhost only, by design.
import { createServer } from "node:http";

const port = Number(process.argv[2] || process.env.ATMA_GATEWAY_PORT || 8787);
const key = process.env.GROQ_API_KEY || "";
if (!key) { console.error("atma-gateway: GROQ_API_KEY is required"); process.exit(2); }

const server = createServer(async (req, res) => {
  const send = (code, obj) => {
    res.writeHead(code, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify(obj));
  };
  if (req.method === "OPTIONS") { res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type,authorization" }); return res.end(); }
  if (req.url === "/gateway/status" || req.url === "/status") return send(200, { backend: "atma-gateway", provider: "groq", ok: true });
  if (req.url === "/v1/models" && req.method === "GET") {
    const r = await fetch("https://api.groq.com/openai/v1/models", { headers: { Authorization: "Bearer " + key } });
    return send(r.status, await r.json().catch(() => ({})));
  }
  if (req.url === "/v1/chat/completions" && req.method === "POST") {
    let body = "";
    for await (const chunk of req) body += chunk;
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
      body,
    });
    return send(r.status, await r.json().catch(() => ({})));
  }
  return send(404, { error: "not found" });
});
server.listen(port, "127.0.0.1", () => console.log(`atma-gateway: listening on http://127.0.0.1:${port} (localhost only)`));
