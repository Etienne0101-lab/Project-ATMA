// Project ATMA — key probe (OpenForge key-probe pattern, Groq-only)
// One read-only check per run: GET /models, then one tiny chat call.
// Verdict is written to docs/backend/key-status.json. The key itself is
// NEVER printed, logged, or committed — only its verdict and, on success,
// the model count. On failure, only the HTTP status + error type.
// Usage: GROQ_API_KEY=... node agent/atma-key-probe.mjs
//        (no key)      node agent/atma-key-probe.mjs   -> ABSENT
import { writeFileSync, mkdirSync } from "node:fs";

const key = process.env.GROQ_API_KEY || "";
const out = process.env.ATMA_KEY_OUT || "docs/backend/key-status.json";
let verdict = { key: "PROJECT_ATMA", provider: "groq", checked_at: new Date().toISOString() };

if (!key) {
  verdict.status = "ABSENT";
  verdict.detail = "No GROQ_API_KEY in this run. In Actions, set secrets.PROJECT_ATMA.";
} else {
  try {
    const modelsRes = await fetch("https://api.groq.com/openai/v1/models", {
      headers: { Authorization: "Bearer " + key },
    });
    if (!modelsRes.ok) {
      const d = await modelsRes.json().catch(() => ({}));
      verdict.status = "FAIL";
      verdict.detail = `models HTTP ${modelsRes.status} ${d?.error?.type || d?.error?.code || ""}`.trim();
    } else {
      const models = await modelsRes.json();
      const chatRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          max_tokens: 1,
          messages: [{ role: "user", content: "ok" }],
        }),
      });
      if (!chatRes.ok) {
        const d = await chatRes.json().catch(() => ({}));
        verdict.status = "FAIL";
        verdict.detail = `chat HTTP ${chatRes.status} ${d?.error?.type || d?.error?.code || ""}`.trim();
      } else {
        verdict.status = "OK";
        verdict.detail = `models listed: ${(models.data || []).length}; tiny chat call succeeded`;
      }
    }
  } catch (e) {
    verdict.status = "FAIL";
    verdict.detail = `network error: ${e.message}`;
  }
}
mkdirSync("docs/backend", { recursive: true });
writeFileSync(out, JSON.stringify(verdict, null, 2) + "\n");
console.log(`atma-key-probe: ${verdict.status} — ${verdict.detail}`);
