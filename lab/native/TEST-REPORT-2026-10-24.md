# Path A real functional test — 2026-10-24, sandbox (Ubuntu 24.04, systemd)

This is NOT a simulation. Every service below is the real upstream
binary/package, started via the systemd units in this folder (except
where noted), on a disposable sandbox VM. No passwords, tokens, or
secrets are in this report.

## Host and versions (verified by running them)

- Go 1.25.1 (from go.dev, apt Go is too old for go.mod)
- Postgres 16.15, RabbitMQ 3.12.1 (Erlang/OTP 25), nginx 1.24.0
- mythic_server 3.4.36, built from upstream `mythic-docker/src`
  (`GOEXPERIMENT=jsonv2 CGO_ENABLED=0 go build -tags="nomsgpack"`,
  34 MB binary) — build succeeded, modules downloaded from proxy.golang.org
- Hasura graphql-engine v2.46.0, extracted from Docker Hub image
  (`bin/hasura-extract.py`, 30 MB, `usr/bin/graphql-engine` in the image)
  + Hasura CLI v2.46.0 (GitHub release, the only v2 asset that exists)
- React UI built from upstream `MythicReactUI` (`npm run build`,
  main bundle 2.44 MB, "hosted at /new/" — matches nginx `/new`)
- Poseidon agent service, built from `MythicAgents/poseidon`
  (`Payload_Type/poseidon/main.go`, 21 MB binary)

## Test results — 9/9 core checks passed (final run)

Run with the production script (`atma-native.sh build/env/start`) plus
the endpoint checker in `test-real.sh` (login/GraphQL parts):

1. PASS — mythic_server `/health` → 200
2. PASS — Hasura `/healthz` → 200
3. PASS — nginx `https://127.0.0.1:7443/new/login` → 200, React UI HTML
4. PASS — nginx `https://127.0.0.1:7443/` → 301 to `/new/login`
   (upstream rewrite, verified with curl no-follow)
5. PASS — login via nginx `POST /auth` with `mythic_admin` → 200,
   `access_token` returned (241 chars, JWT)
6. PASS — nginx `/auth_services` via mythic_server → 200
   (`{"status":"success","error":"","idps":[]}`)
7. PASS — Hasura metadata apply via `atma-native.sh hasura-metadata`
   → "Metadata applied" (after the corrections in README §10–12)
8. PASS — GraphQL via nginx `POST /graphql/` with JWT:
   `{ operator { username } }` →
   `{"data":{"operator":[{"username":"operation-chimera-bot"},
   {"username":"mythic_admin"}]}}`
9. PASS — server `/me` with JWT → 200, `user_id: 1, operation_id: 1`

All five systemd units active at end of test:
`postgresql`, `rabbitmq-server`, `nginx`, `mythic-server`,
`mythic-hasura`, plus `mythic-agent@poseidon`.

## Agent test — Poseidon, real

- Built and run natively (no Docker): log shows
  "RabbitMQ Initialized", "Started listening for messages" on
  `poseidon_*` queues, "Syncing payload type … poseidon",
  "Successfully synced payload type!", "All services initialized!"
- GraphQL after sync: `{ payloadtype { name } }` →
  `{"data":{"payloadtype":[{"name":"poseidon"}]}}`
- RabbitMQ management API (15672) with `mythic_user` now returns
  queues (100 queues, including `poseidon_*`) — previously 401
  "Not management user" before the management-tag fix.
- Before the service-directory fix, the agent logged
  "Failed to open script file: poseidon/browserscripts/…" and
  "Failed to find agent icon". After copying the full service
  directory, a restart logs no such failures (DEBUG_LEVEL=warning
  in `agent.env` suppresses INFO logs, so silence + active status +
  queues present is the expected signal).

## What was found and fixed by this test (not by reading code alone)

Every item below was a real failure in the first boot, fixed in the
scripts/units in this folder, and re-verified:

- Git dubious-ownership on clone into a pre-created, mythic-owned dir
- `$0` relative-path bug: `script_dir()` resolved inside
  `mythic-docker/src` after a `cd`, so `build` looked for `bin/`
  in the wrong place — now `SCRIPT_DIR` is captured before any `cd`
- Hasura download URL 404 (v2 releases have no server binary) →
  registry extraction in `bin/hasura-extract.py`
- Hasura `libpcre.so.3` and `libodbc.so.2` missing → `libpcre3`
  + `libodbc2` in `install`
- `.env` shell-sourcing crash on `Operation Chimera` → literal
  KEY=VALUE parsing in wrapper, metadata, and agent installer
- MITRE `attack.json` missing → copied to `bin/utils/files/`
- RabbitMQ management plugin + user tag + `enabled_plugins`
  ownership → all three fixed in `install`/`env`/`start`
- Hasura metadata project shape + `MYTHIC_ACTIONS_URL_BASE` →
  temp CLI project + wrapper env, metadata now applies cleanly
- nginx reload (not just enable) → 7443 now listens after config change
- Agent parent-dir ownership (`200/CHDIR`) + full service-directory
  copy + stop-before-overwrite (`Text file busy`) → all fixed in
  `install-agent-poseidon.sh`

## Dynamic payload build — Poseidon, proven 2026-10-24 20:58 EDT

After the core test, the http C2 profile was installed natively
(`install-c2-http.sh`: service binary + `http/c2_code/mythic_http_server`,
lab config 127.0.0.1:18080, no SSL; `c2profile` in GraphQL now includes
`http`), and a real payload was created via the GraphQL
`createPayload` mutation (Linux, poseidon, `poseidon-lab.bin`,
commands shell/sleep/ls/ps/download/upload/exit/config, egress
`["http"]`, http callback_host `http://127.0.0.1`, callback_port
18080, interval 10, jitter 23).

- PASS — payload UUID `4c5765a1-a559-46b8-908f-2b4e021b1d58`,
  `build_phase: success` (~50s, mostly Go module downloads).
- PASS — artifact `/build/4c5765a1-…-linux-amd64`: ELF 64-bit
  x86-64, stripped, 6.7 MB, same BuildID as the server's copy in
  `bin/files/` (the file the UI downloads).
- PASS — **dynamic proof, not a static binary:** `strings` on the
  artifact shows the Go `-X` ldflags baked in at build time —
  `profiles.UUID=<payload UUID>`, `egress_order` base64 = `["http"]`,
  and `http_initial_config` base64 decodes to exactly the submitted
  parameters (callback_host, callback_port 18080, interval 10,
  jitter 23, post_uri `data`).
- Failures found on the way, all fixed in the scripts (see README
  §15–16): `bin/files` missing → "Failed to create file on disk";
  `/build` missing → "Failed to find final payload"; OPSEC check
  rejects `callback_host` with a port (host must be port-less,
  port goes in `callback_port`); agent service with no proxy env →
  Go module downloads fail with "tls: first record does not look
  like a TLS handshake" (installer now carries unauthenticated
  proxy vars into `agent.env`).

## What is NOT yet proven

- **Payload execution / live callback:** the built payload was
  NOT run as a callback. Build + artifact verification is proven;
  end-to-end tasking to a live callback is the next test, not a
  claim made here.
- **Other agents/C2:** Poseidon (Go) and the http C2 profile are
  installed natively. Apollo/Athena (.NET), Medusa (Python),
  Apfell (macOS-only build) and other C2 profiles (websocket, tcp,
  dynamichttp, etc.) still need their own native installs.
- **Production host:** this test ran on a disposable sandbox VM.
  A real host (e.g. Oracle A1, or Stephen's Linux host) still needs
  `atma-native.sh install/build/env/start` run there, with its own
  generated `.env` — the sandbox `.env` and passwords are sandbox-only
  and are not in this repo.
- **mythic-cli Path B:** `mythic-cli start/stop/install` still
  does not manage the native stack. Path A units are the manager
  for now; Path B (`systemd-manager-design.md`) remains design only.
