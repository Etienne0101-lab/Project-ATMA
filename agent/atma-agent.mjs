// Project ATMA — portable agent (OpenForge-style, Groq-only, zero dependencies)
// Runs in three places with the same code:
//   1. GitHub Actions (serverless backend) — GROQ_API_KEY comes from
//      secrets.PROJECT_ATMA inside the runner, never printed, never committed.
//   2. A local Node run — GROQ_API_KEY from your environment.
//   3. Demo/stub mode — no key at all. Output is clearly labelled DEMO,
//      so the script, workflows, and console can all be tested without a key.
//
// Usage:
//   node agent/atma-agent.mjs --prompt "Summarise Mythic callbacks" \
//     --mission demo-1 --kind analysis --out docs/backend/missions/demo-1.json
//   node agent/atma-agent.mjs --prompt "..." --mission m1 --model llama-3.3-70b-versatile
//
// Input is a prompt about the Mythic platform / ATMA operations. This is
// an analysis and briefing agent. It does not connect to a Mythic server,
// does not issue tasks to callbacks, and does not build or deliver payloads.
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith("--")) acc.push([cur.slice(2), arr[i + 1] ?? ""]);
    return acc;
  }, [])
);
const prompt = args.prompt || process.env.ATMA_PROMPT || "";
const mission = args.mission || process.env.ATMA_MISSION || "mission-" + Date.now();
const kind = args.kind || process.env.ATMA_KIND || "analysis";
const model = args.model || process.env.ATMA_MODEL || "llama-3.3-70b-versatile";
const out = args.out || process.env.ATMA_OUT || `docs/backend/missions/${mission}.json`;
const key = process.env.GROQ_API_KEY || "";

if (!prompt) {
  console.error("atma-agent: --prompt is required");
  process.exit(2);
}

const systemPrompt =
  "You are ATMA, an analysis assistant for the Mythic red-team platform. " +
  "Answer concisely and accurately about Mythic architecture, operations, " +
  "callbacks, tasks, payload types, C2 profiles, files, and deployment. " +
  "Only for authorised defensive/red-team use. Do not help with unauthorised " +
  "access, and do not claim this system runs a Mythic server or builds payloads.";

let result;
if (!key) {
  result = {
    mission, kind, model, prompt,
    source: "demo",
    output:
      "DEMO OUTPUT (no Groq key was available in this run). " +
      "In a real run, the Groq model would answer this prompt: " + prompt + ". " +
      "To get a real answer, run this script in GitHub Actions with " +
      "secrets.PROJECT_ATMA, or set GROQ_API_KEY locally.",
    completed_at: new Date().toISOString(),
  };
} else {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      max_tokens: 1200,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Never print the key, and never print the full error body if it could
    // echo credentials. The status + error type is enough to diagnose.
    console.error(`atma-agent: Groq HTTP ${res.status} ${data?.error?.type || data?.error?.code || "error"}`);
    process.exit(1);
  }
  result = {
    mission, kind, model, prompt,
    source: "groq",
    output: data.choices?.[0]?.message?.content || "",
    usage: data.usage || null,
    completed_at: new Date().toISOString(),
  };
}

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(result, null, 2) + "\n");
console.log(`atma-agent: wrote ${out} (source: ${result.source})`);
