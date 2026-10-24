# Project ATMA — Mythic Platform Console

A functional front-end GUI for the [Mythic platform](https://github.com/its-a-feature/Mythic), built as a zero-build static app for GitHub Pages, with an integrated AI assistant.

Live (Pages enabled 2026-10-24, verified loading): **https://etienne0101-lab.github.io/Project-ATMA/**

## What is in the app (`docs/`)

- **Dashboard** — Mythic architecture at a glance, demo callback counts, deployment checklist, and the latest AI briefing.
- **Callbacks** — Demo callback table (apollo, apfell, poseidon, athena, medusa) with search, per-agent command picker, and task history. Select one and issue demo tasks (`whoami`, `pwd`, `ls`, `ps`, `shell`, `download`, `screenshot`, `help`). All output is simulated and labelled as such.
- **Operations** — Roles (lead / operator / spectator), block lists, and alerting, as in real Mythic.
- **Payload Builder** — Configuration-only builder. It produces a JSON configuration summary and the `mythic-cli install github …` commands for your own Mythic instance. It does **not** compile, download, or deliver a real payload/agent.
- **C2 Profiles** — http, dynamichttp, smb, tcp, websocket, with direct vs peer-to-peer notes.
- **Files** — Demo file browser (downloads, screenshots, task output placeholders).
- **Catalog Import** — Fetches the public MythicAgents and MythicC2Profiles repo listings from GitHub (metadata only, no install/download/run) and saves them in the browser.
- **Connect / Mythic client mode** — Save your own Mythic URL, GraphQL path, and operator token locally (browser only) and run Test Connection, which reports the real HTTP/CORS/GraphQL result instead of faking a connection.
- **Mythic Guide** — How a real Mythic instance starts (`sudo make`, `sudo ./mythic-cli start`), core concepts, task lifecycle, connecting this console to your own server, and this app's security model.
- **ATMA Assistant (right panel)** — Ask about Mythic operations, task lifecycle, payloads, C2, files, deployment, and troubleshooting. Without a key it answers from a built-in knowledge base. With a Groq key saved in **Connect**, it answers live via Groq from your browser.
- **Missions + Backend (serverless, OpenForge-style)** — GitHub Actions is the borrowed backend and git is the database: `agent/atma-agent.mjs` runs missions, `atma-scheduler.mjs` ticks daily (owns only `status.json`), `atma-key-probe.mjs` checks the Groq key (verdict only), and `atma-gateway.mjs` is an optional local companion gateway. Workflows live in `github-workflows/` and must be copied once to `.github/workflows/` (GitHub Apps cannot create them). See `agent/README.md`. Limits, stated plainly: workflows take minutes, so this backend is async, not real-time — it cannot do live Mythic callbacks or C2.

## GitHub Pages

Enabled 2026-10-24: Settings → Pages → Deploy from a branch → `main` / `/docs`.

The site serves at https://etienne0101-lab.github.io/Project-ATMA/

## Groq / the `PROJECT_ATMA` secret — read this first

GitHub Pages serves static files only. There is no server to hide a key in, so **the secret is deliberately never put in the browser bundle**. Putting it in `app.js` would publish it to everyone who visits the public site.

So it is used in exactly two safe places:

1. **GitHub Actions (backend functionality).** Copy `github-workflows/groq-briefing.yml` to `.github/workflows/groq-briefing.yml` (GitHub Apps cannot create workflow files directly, so this copy is manual). On manual dispatch, the workflow reads `secrets.PROJECT_ATMA` as the Groq key *inside the runner*, asks Groq for a short public Mythic briefing, and commits only `docs/ai-briefing.json`. The key is never printed or committed.
2. **Your browser (live chat, optional).** In the app's **Connect** tab, paste a Groq key. It is stored only in that browser's `localStorage` and sent only from that browser to `api.groq.com`. Remove it any time from Connect. This can be the same Groq key value as the secret, entered by you — Muse never reads, copies, or embeds the secret value.

## Real Mythic vs this app

| | This Pages app | A real Mythic instance |
|---|---|---|
| Runs on | GitHub Pages (static) | Your own host, Docker (`mythic-cli start`) |
| Callbacks/tasks | Simulated demo records | Real agent sessions |
| Payloads | Configuration summaries only | Compiled agents, in Mythic's UI |
| AI | Demo knowledge base, or Groq via your browser key | — |
| Backend secret use | GitHub Actions workflow only | — |

Use Mythic only against systems you own or are explicitly authorised to test.

## Files

- `docs/index.html`, `docs/app.js`, `docs/styles.css` — the app
- `docs/ai-briefing.json` — briefing shown on the dashboard (starter until the workflow runs)
- `docs/404.html`, `docs/.nojekyll` — Pages helpers
- `github-workflows/groq-briefing.yml` — copy to `.github/workflows/` to enable the secret-backed briefing refresh
