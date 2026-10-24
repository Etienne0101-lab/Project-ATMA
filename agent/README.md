# Project ATMA — serverless backend (OpenForge infrastructure, replicated)

This is the OpenForge pattern, adapted to ATMA and to Groq:

| OpenForge piece | ATMA equivalent |
|---|---|
| Portable zero-dependency Node agent (browser / Actions / companion) | `agent/atma-agent.mjs` — same script runs in Actions, locally, or in demo mode |
| GitHub Actions as off-tab execution plane, git as transport/database | `atma-agent.yml` — mission output committed to `docs/backend/missions/` |
| Scheduler (`*/30` cron + dispatch, manifest state, one writer per file) | `atma-scheduler.yml` + `atma-scheduler.mjs` — daily tick, writes only `status.json` |
| Key probe (one read-only call per key, verdict only, never prints the key) | `atma-key-probe.mjs` + `atma-key-probe.yml` — Groq models + tiny chat, verdict in `key-status.json` |
| Self-hosted gateway (OpenAI-compatible, keys by env var) | `atma-gateway.mjs` — optional companion on your host, Groq-only, localhost-only |
| Backend-hosting ladder, Tier 1 = Actions, Tier 2 = companion | This folder: Tier 1 is the default; the gateway is Tier 2, optional |

## Architecture, in one paragraph

The Pages app is static, so there is no persistent server. Instead,
GitHub Actions is the borrowed, ephemeral backend and git is the
database: a workflow run does work (calls Groq with
`secrets.PROJECT_ATMA` inside the runner), writes a JSON file, and
commits it. The Pages app then reads that JSON file like any other
static asset. That is the whole trick — and also the whole limit.

## What this backend can and cannot do

Can: async AI missions (analysis, briefings), scheduled ticks,
briefing refreshes, key health checks, catalog refreshes — all as
committed JSON the console displays.

Cannot: real-time chat (a workflow takes minutes), persistent
connections, Mythic callbacks, live C2, payload builds, or anything
that needs a server listening for agents. For that you still need
your own Mythic server (see `../server/`).

## Install the workflows (one manual step, per file)

GitHub Apps cannot create workflow files directly, so copy each file
from `../github-workflows/` to `.github/workflows/` in this repo:

- `atma-agent.yml` — mission runner
- `atma-scheduler.yml` — daily tick
- `atma-key-probe.yml` — key health
- `groq-briefing.yml` — briefing refresh (already in that folder)

After that, dispatch them from the Actions tab, from `gh workflow run`,
or from the ATMA console's Missions tab (which needs a GitHub token
saved locally in the browser, with `actions:write` on this repo).

## Dispatch a mission

Actions tab: "ATMA agent mission" → Run workflow → mission_id, prompt,
kind, model. Or:

```
gh workflow run atma-agent.yml \
  -f mission_id=mythic-overview \
  -f prompt="Summarise Mythic operations and roles for a new operator" \
  -f kind=analysis
```

Wait a few minutes, then open the console's Missions tab — the mission
output appears there once the workflow commits it.

## Test the scripts locally (no key needed)

```
node agent/atma-agent.mjs --prompt "What is a Mythic callback?" --mission demo-1
node agent/atma-key-probe.mjs   # -> ABSENT, without a key; no failure
node agent/atma-scheduler.mjs   # -> writes docs/backend/status.json
```

Demo outputs are labelled DEMO. Real outputs say `source: "groq"`.

## Files

- `atma-agent.mjs` — mission runner
- `atma-key-probe.mjs` — key health
- `atma-scheduler.mjs` — scheduler tick (owns only `status.json`)
- `atma-gateway.mjs` — optional local companion gateway (not serverless). Streams: if the chat request has `stream:true`, Groq's SSE stream is relayed verbatim, so the Pages assistant streams tokens in real time. To connect it to the Pages console over Tailscale: run it on your host (`GROQ_API_KEY=... node agent/atma-gateway.mjs`), expose it with `tailscale serve --bg --https=443 http://127.0.0.1:8787`, then paste that Serve HTTPS URL in the console's Connect tab and set the assistant backend to Gateway (host). Your phone must be on the same Tailscale network to reach the Serve name. Never expose port 8787 publicly, and never put the Groq key in the browser.
