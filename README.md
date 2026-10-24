# Project ATMA — Mythic Platform Console

A functional front-end GUI for the [Mythic platform](https://github.com/its-a-feature/Mythic), built as a zero-build static app for GitHub Pages, with an integrated AI assistant.

Live (after Pages is enabled, below): **https://etienne0101-lab.github.io/Project-ATMA/**

## What is in the app (`docs/`)

- **Dashboard** — Mythic architecture at a glance, live demo callback counts, and the latest AI briefing.
- **Callbacks** — Demo callback table (apollo, apfell, poseidon, athena, medusa). Select one and issue demo tasks (`whoami`, `pwd`, `ls`, `ps`, `shell`, `download`, `screenshot`, `help`). All output is simulated and labelled as such.
- **Payload Builder** — Configuration-only builder. It produces a JSON configuration summary and the `mythic-cli install github …` commands for your own Mythic instance. It does **not** compile, download, or deliver a real payload/agent.
- **C2 Profiles** — http, dynamichttp, smb, tcp, websocket, with direct vs peer-to-peer notes.
- **Mythic Guide** — How a real Mythic instance starts (`sudo make`, `sudo ./mythic-cli start`), core concepts, and this app's security model.
- **ATMA Assistant (right panel)** — Ask about Mythic. Without a key it answers from a built-in demo knowledge base. With a Groq key saved in **Connect**, it answers live via Groq from your browser.

## Enable GitHub Pages (one manual step)

GitHub Pages is a repo setting, not a file:

1. Repo → **Settings → Pages**
2. **Build and deployment → Source: Deploy from a branch**
3. **Branch: `main`, folder: `/docs`** → Save

The site then serves at https://etienne0101-lab.github.io/Project-ATMA/

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
