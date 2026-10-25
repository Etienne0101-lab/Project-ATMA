// Project ATMA — edge provider test (runs ONLY inside GitHub Actions).
// Reads keys from environment (repo secrets, via the workflow), calls
// each provider once with a tiny prompt, and writes a PUBLIC status
// file with ONLY: provider name, ok/fail, model used, latency, and a
// short error class (401/429/404/timeout) — NEVER a key, token, or
// full response body. If a provider's key is absent, it reports
// ABSENT, not FAIL, so a missing secret is not confused with a bad one.
//
// Providers (all OpenAI-compatible /chat/completions):
//   nvidia       https://integrate.api.nvidia.com/v1
//                keys tried, in order: NVIDIA_NIM_API_KEY, NVIDIABUILD
//                (the repo's existing NVIDIA Build secret). Model:
//                first Nemotron model from /v1/models, preferring
//                nemotron-3.5-lightning, else the first listed model.
//                NVIDIA NIM is NOT DeepHat — it is the fast fallback.
//   ollama-cloud https://api.ollama.com/v1
//                keys tried: OLLAMA_API_KEY, OLLAMA_CLOUD_API_KEY.
//                Model: OLLAMA_CLOUD_MODEL env, else gpt-oss:20b.
//                Ollama Cloud's catalog is NOT necessarily DeepHat.
//   featherless  https://api.featherless.ai/v1 — SKIPPED unless
//                FEATHERLESS_API_KEY is set in the runner. The user
//                did NOT put a Featherless key in repo secrets, so
//                in the normal run this reports ABSENT and the
//                browser route (key pasted in the DeepHat panel) is
//                the Featherless test route. Do NOT put a Featherless
//                key in a workflow_dispatch input — inputs are not secrets.
//
// Usage in Actions: node agent/edge-test.mjs docs/backend/edge-status.json
// Local stub test: set *_API_KEY=test and *_BASE_URL to a stub server.
import { writeFileSync } from "node:fs";

const outPath = process.argv[2] || "edge-status.json";
const prompt = "Reply with exactly: edge ok";

function firstKey(names) {
  for (const n of names) if (process.env[n]) return n;
  return null;
}
async function chat(base, key, model, timeoutMs = 60000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  const t0 = Date.now();
  try {
    const r = await fetch(base.replace(/\/$/, "") + "/chat/completions", {
      method: "POST", signal: ctl.signal,
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
      body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], stream: false, max_tokens: 20 }),
    });
    const j = await r.json().catch(() => ({}));
    const txt = j.choices?.[0]?.message?.content || "";
    return { ok: r.ok, status: r.status, latency_ms: Date.now() - t0, text: txt.slice(0, 60), error: r.ok ? null : (j.error?.message || "HTTP " + r.status).slice(0, 120) };
  } catch (e) {
    return { ok: false, status: 0, latency_ms: Date.now() - t0, text: "", error: e.name === "AbortError" ? "timeout" : String(e.message).slice(0, 120) };
  } finally { clearTimeout(t); }
}
async function listModels(base, key) {
  try {
    const r = await fetch(base.replace(/\/$/, "") + "/models", { headers: { Authorization: "Bearer " + key } });
    const j = await r.json();
    return (j.data || []).map((m) => m.id).filter(Boolean);
  } catch { return []; }
}

const providers = [];
// NVIDIA NIM
{
  const keyName = firstKey(["NVIDIA_NIM_API_KEY", "NVIDIABUILD"]);
  if (!keyName) providers.push({ name: "nvidia", ok: false, status: "ABSENT", model: null, error: "no NVIDIA secret set in repo" });
  else {
    const base = process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1";
    const models = await listModels(base, process.env[keyName]);
    const model = models.find((m) => m.includes("nemotron-3.5-lightning")) || models.find((m) => m.includes("nemotron")) || models[0] || "nvidia/nemotron-3.5-lightning-30b-a3b";
    const r = await chat(base, process.env[keyName], model);
    providers.push({ name: "nvidia", ok: r.ok, status: r.status, model, latency_ms: r.latency_ms, error: r.error, secret_name: keyName });
  }
}
// Ollama Cloud
{
  const keyName = firstKey(["OLLAMA_API_KEY", "OLLAMA_CLOUD_API_KEY"]);
  if (!keyName) providers.push({ name: "ollama-cloud", ok: false, status: "ABSENT", model: null, error: "no Ollama secret set in repo" });
  else {
    const base = process.env.OLLAMA_CLOUD_BASE_URL || "https://api.ollama.com/v1";
    const model = process.env.OLLAMA_CLOUD_MODEL || "gpt-oss:20b";
    const r = await chat(base, process.env[keyName], model);
    providers.push({ name: "ollama-cloud", ok: r.ok, status: r.status, model, latency_ms: r.latency_ms, error: r.error, secret_name: keyName });
  }
}
// Featherless — only if a key is in the runner env (not expected normally)
{
  const keyName = firstKey(["FEATHERLESS_API_KEY"]);
  if (!keyName) providers.push({ name: "featherless", ok: false, status: "ABSENT", model: "DeepHat/DeepHat-V1-7B", error: "no Featherless key in repo secrets — use the browser panel key for Featherless testing" });
  else {
    const base = process.env.FEATHERLESS_BASE_URL || "https://api.featherless.ai/v1";
    const r = await chat(base, process.env[keyName], "DeepHat/DeepHat-V1-7B");
    providers.push({ name: "featherless", ok: r.ok, status: r.status, model: "DeepHat/DeepHat-V1-7B", latency_ms: r.latency_ms, error: r.error, secret_name: keyName });
  }
}

const out = { generated_at: new Date().toISOString(), note: "Repo-secret test only. No keys, tokens, or full responses are in this file.", providers };
writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");
console.log(JSON.stringify(out, null, 2));
