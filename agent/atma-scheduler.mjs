// Project ATMA — scheduler tick (OpenForge scheduler pattern, simplified)
// Design rule borrowed from OpenForge's organism widening: a scheduler
// tick writes NO file any other writer writes. This tick owns ONLY
// docs/backend/status.json. Missions own docs/backend/missions/*,
// the key probe owns docs/backend/key-status.json, the briefing
// workflow owns docs/ai-briefing.json. That is what keeps concurrent
// ticks, missions, and probes from overwriting each other.
//
// What a tick does:
//   1. Reads the manifest (docs/backend/manifest.json) — seeded jobs only.
//   2. Updates status.json: last tick, next tick, enabled jobs, and a
//      note about whether the briefing is stale (>7 days) so a human
//      or the briefing workflow can refresh it. It does NOT burn Groq
//      quota on every tick.
// Usage: node agent/atma-scheduler.mjs
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const statusPath = "docs/backend/status.json";
const manifestPath = "docs/backend/manifest.json";
const briefingPath = "docs/ai-briefing.json";

let manifest = { jobs: [] };
try { if (existsSync(manifestPath)) manifest = JSON.parse(readFileSync(manifestPath, "utf8")); } catch {}
let briefingUpdated = null;
try { if (existsSync(briefingPath)) briefingUpdated = JSON.parse(readFileSync(briefingPath, "utf8")).updated || null; } catch {}
const briefingAgeDays = briefingUpdated
  ? Math.floor((Date.now() - new Date(briefingUpdated).getTime()) / 86400000)
  : null;

const now = new Date();
const status = {
  backend: "github-actions-serverless",
  last_tick: now.toISOString(),
  next_tick: new Date(now.getTime() + 86400000).toISOString(),
  jobs: manifest.jobs || [],
  briefing_updated: briefingUpdated,
  briefing_age_days: briefingAgeDays,
  briefing_stale: briefingAgeDays === null || briefingAgeDays > 7,
  note: "Serverless backend: GitHub Actions + git are the database. " +
    "Actions runs are async (minutes), not real-time. No persistent server, " +
    "no Mythic callbacks, no live C2. See agent/README.md.",
};
writeFileSync(statusPath, JSON.stringify(status, null, 2) + "\n");
console.log(`atma-scheduler: tick written to ${statusPath} (briefing stale: ${status.briefing_stale})`);
