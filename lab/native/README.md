# Mythic, natively — as system services, no Docker daemon

Lab-only, authorised-use design. This is a prototype, not a verified
live Mythic install: the Go server code, the CLI manager interface, and
the service wiring below were read directly from upstream
`its-a-feature/Mythic` on 2026-10-24, but no native stack has been
booted end-to-end yet. The first live test is listed at the bottom.

## Why native is actually possible (and why it is not trivial)

Upstream's own code says the quiet part out loud:

- `Mythic_CLI/src/cmd/config/env.go`:
  `global_manager` defaults to `"docker"`, and the note says
  *"Valid options are currently: docker. Additional PRs can be made to
  implement the CLIManager Interface and provide more options."*
- `Mythic_CLI/src/cmd/manager/managerInterface.go` defines that
  interface (`CLIManager`) and `Initialize()` switches on
  `global_manager` — today only `docker` is registered, anything else
  is a fatal "Unknown manger".
- `mythic-docker/src/utils/config.go`: the server itself is a plain
  Go binary. It reads a `.env` file from the directory containing the
  executable, plus environment, and its defaults are
  `postgres_host=mythic_postgres`, `rabbitmq_host=mythic_rabbitmq`,
  `mythic_server_port=17443`, `mythic_server_grpc_port=17444`.
  Point those hosts at `127.0.0.1` and it has no idea it is not in a
  container.
- `mythic-docker/src/database/initialize.go`: on first start the
  server creates the schema itself if the `operator` table is missing,
  then applies SQL migrations from `database/migrations/` relative
  to its working directory. So a native binary needs that folder
  beside it, not a container volume.
- Mythic's own docs, quoted in earlier research: services connect
  via RabbitMQ and gRPC, and Mythic "doesn't really know if the
  connection is locally from Docker or remotely from somewhere else".

So there are two native paths, and they are not the same job:

### Path A — direct systemd stack (shippable now, in this folder)

Bypass `mythic-cli` for the core. Run each service as a systemd unit
(or a system package service) on one Linux host, with the same ports
and the same `.env` values the Docker stack uses:

| Service | Native form | Port / bind |
|---|---|---|
| Postgres | system `postgresql` package, DB `mythic_db`, user `mythic_user` | 127.0.0.1:5432 |
| RabbitMQ | system `rabbitmq-server` package, vhost `mythic_vhost` | 127.0.0.1:5672 |
| mythic-server | Go binary built from `mythic-docker/src` (`go 1.25`, `CGO_ENABLED=0`) | 127.0.0.1:17443, gRPC 17444, dynamic 7000-7010 |
| Hasura GraphQL | `graphql-engine` binary, metadata from upstream `hasura-docker/metadata/` | 127.0.0.1:8080 (or HASURA_PORT) |
| nginx | system `nginx`, config in `nginx/mythic-native.conf` | 7443 HTTPS (only externally exposed port, via Tailscale Serve) |
| React UI | built from upstream `MythicReactUI/` (`npm run build`), served by nginx at `/new/` | via nginx only |
| Documentation | Hugo site from `documentation-docker/`, optional | via nginx `/docs` |
| Jupyter | optional, omitted in the minimum stack | via nginx `/jupyter` if added |
| Agents / C2 | see below | via RabbitMQ + gRPC, not via Docker |

Start order (systemd `After=` / `Wants=` in the units):
postgres → rabbitmq → mythic-server → hasura → nginx.
`mythic-server` must wait for Postgres and RabbitMQ to accept
connections; the units use `ExecStartPre` health loops for that,
not just `After=`.

### Path B — a `systemd` manager for mythic-cli (the upstream-correct job)

Implement `CLIManager` in Go as a `SystemdManager`, register it in
`managerInterface.go` beside `docker`, and set
`global_manager=systemd` in `.env`. Then `./mythic-cli start`,
`stop`, `status`, `logs`, `install`, etc. work natively, with
systemd units instead of containers, volumes replaced by host
directories, and images replaced by binaries/packages.

That is the right long-term contribution (it is literally the PR
upstream invites), but it is a ~40-method interface, including
`BackupDatabase`, `RestoreDatabase`, `CopyIntoVolume`, and
`BuildUI`, and it cannot be honestly claimed from a skeleton.
This folder ships Path A as executable code and Path B as a design
note in `systemd-manager-design.md`, not as a fake implementation.

## Agents and C2 profiles, natively

This is the part that breaks most "just run it natively" plans:

- An agent/C2 service is *not* a Mythic core service. It is a
  Python program (`main.py`, `pip install mythic-container`) or a
  Go program that connects to RabbitMQ and to mythic-server's gRPC
  port, with a `rabbitmq_config.json` pointing at the host.
  Upstream documents running a service natively from a VM for exactly
  this case.
- So each installed agent/C2 gets its own systemd unit
  (`mythic-agent@<name>.service` template in `systemd/`), running
  its `main.py`/`main` binary with the same RabbitMQ/gRPC config
  the container version would have had.
- Payload *building* is the hard edge: agents need their build
  toolchains on the host (.NET SDK for Apollo/Athena, Go for
  Poseidon, Python for Medusa, macOS SDK for Apfell — Apfell
  cannot be built on Linux at all, same as in Docker on Linux).
  A native host must install those toolchains; there is no
  container to hide them in. Test one agent at a time, starting
  with Poseidon (Go) or Medusa (Python), not Apollo.

## What Docker was doing that systemd must replace

- **Networking:** Docker's bridge network gave services the
  hostnames `mythic_postgres`, `mythic_rabbitmq`, etc. Natively,
  those become `127.0.0.1` in `.env`, and `mythic_server_host`,
  `postgres_host`, `rabbitmq_host`, `hasura_host` must all be
  `127.0.0.1` (or the host's tailnet name for remote services).
  `mythic_docker_networking` is irrelevant natively; set it to
  `host` in the native `.env` so dynamic ports behave as host ports.
- **Volumes → directories:** `mythic_server_use_volume=false` in
  Docker meant host bind-mounts; natively, uploads/downloads live
  in `/var/lib/mythic/server/` (configurable in the units), Postgres
  data in the system Postgres data dir, RabbitMQ data in
  `/var/lib/rabbitmq/`.
- **Healthchecks → systemd:** Docker healthchecks become
  `ExecStartPre` loops (`pg_isready`, `rabbitmqctl ping`,
  `curl http://127.0.0.1:17443/health`) and `Restart=on-failure`.
- **Secrets → `.env` + file permissions:** the native `.env`
  beside the `mythic_server` binary holds the same passwords
  Docker's `.env` held (`postgres_password`,
  `rabbitmq_password`, `jwt_secret`, `mythic_admin_password`).
  It must be `0600`, owned by the mythic user, and never committed.
  The installer generates it with `openssl rand -hex 32` per value
  — it does not reuse the example passwords in upstream Makefiles.
- **TLS:** nginx on 7443 needs a cert. The installer generates a
  self-signed cert with `openssl` (same purpose as mythic-cli's
  generated certs in `nginx-docker/ssl/`), or you point nginx at a
  Tailscale Serve termination instead and keep nginx on localhost.

## Install (Ubuntu/Debian host, lab-only)

```bash
git clone https://github.com/Etienne0101-lab/Project-ATMA
cd Project-ATMA/lab/native
sudo bash atma-native.sh check     # Go, Postgres, RabbitMQ, nginx, node — reports what's missing
sudo bash atma-native.sh install   # packages + mythic user + directories (no services started yet)
sudo bash atma-native.sh build     # builds mythic_server from upstream, downloads Hasura, builds React UI
sudo bash atma-native.sh env       # generates /opt/mythic/bin/.env (0600) — record the admin password it prints once
sudo bash atma-native.sh start     # postgres → rabbitmq → mythic-server → hasura → nginx, then applies Hasura metadata
bash atma-native.sh status         # systemd status + port checks + /health
# UI: https://127.0.0.1:7443  (or via Tailscale Serve — see server/README.md)
sudo bash atma-native.sh stop
```

The installer never opens a firewall port and never binds nginx
to `0.0.0.0:7443` by default — the shipped nginx config binds
`127.0.0.1:7443`. Expose it only through Tailscale Serve, or by
changing that bind deliberately.

## Deployability corrections (2026-10-24, Path A made real)

These were found by reading upstream source, not by guessing, and are
already in `atma-native.sh` and the units in this folder:

1. **`.env` location is the binary directory.** `mythic_server` reads
   `.env` from the executable's directory (`utils/config.go`,
   `getCwdFromExe`), and `database/migrations` relative to its
   working directory (`database/initialize.go`). So the canonical
   file is `/opt/mythic/bin/.env`, the unit's `WorkingDirectory` is
   `/opt/mythic/bin`, and `database/migrations` + `static/` are
   copied there by `build`. The earlier `/opt/mythic/.env` location
   would have worked only via systemd's `EnvironmentFile`, and
   broken on any direct binary run.
2. **`env` runs after Postgres/RabbitMQ are up.** The old order
   created accounts before the services started and swallowed the
   failure with `|| true`. Now `env` starts and waits for both,
   then verifies a TCP password login to Postgres as `mythic_user`
   before proceeding.
3. **Hasura metadata is a separate, required step.** Upstream's
   Hasura image is `cli-migrations-v2`; the plain `graphql-engine`
   binary does not auto-apply `/metadata`. `build` now downloads
   the Hasura CLI, and `start` runs `hasura-metadata` (also
   runnable standalone) to apply upstream's metadata to the running
   Hasura. Without it, login works but the React UI's GraphQL
   queries fail.
4. **Hasura env construction is in a shell wrapper, not systemd.**
   `bin/hasura-wrapper.sh` sources `bin/.env` and exports the
   Postgres URLs itself, because systemd does not reliably expand
   `${VAR}` from `EnvironmentFile` inside `Environment=` lines.
5. **Unit health checks are TCP probes, not `rabbitmqctl`.**
   `rabbitmqctl ping` needs the Erlang cookie and fails as the
   `mythic` user; a TCP connect to 5432/5672 is enough to gate
   startup, and the server fails loudly if auth is wrong.
6. **React build failure is fatal.** The old script echoed a
   warning and continued with no UI. Now `build` dies if
   `npm run build` fails or `build/index.html` is missing.
7. **Go version is enforced.** Apt's Go is usually too old for
   `go.mod` (go 1.25.1). `install` fetches Go 1.25 from go.dev when
   the installed Go is missing or < 1.25.
8. **Hasura server binary is extracted, not downloaded.** Hasura v2
   GitHub releases contain only the CLI — the old
   `.../graphql-engine` download URL 404s. `build` now runs
   `bin/hasura-extract.py`, which pulls the `hasura/graphql-engine`
   image from Docker Hub (anonymous token, manifest list → arch
   manifest → layer blobs) and extracts only `usr/bin/graphql-engine`
   (30 MB, v2.46.0 verified in sandbox). No Docker daemon is used.
   The binary needs `libpcre.so.3`, so `install` adds `libpcre3`.
9. **npm must not break the whole install.** Ubuntu's `npm` package
   conflicts with a nodesource Node 24 install. `install` now
   installs the core packages without `npm`, then tries `npm`
   separately only if it is missing.
10. **`.env` is never shell-sourced.** `default_operation_name=
    Operation Chimera` is valid for viper/systemd but fatal for
    shell sourcing (`Chimera: command not found`, which killed
    Hasura on every restart). `hasura-wrapper.sh`,
    `hasura-metadata`, and the agent installer now parse
    `KEY=VALUE` lines literally.
11. **MITRE data and RabbitMQ management are real requirements.**
    `build` copies `utils/files/attack.json` to `bin/utils/files/`
    (otherwise the attack table stays empty), and `install`/`start`
    enable `rabbitmq_management` — upstream's image is
    `rabbitmq:3-management-alpine`, and mythic_server polls 15672.
    A `rabbitmqctl`-created user has no tags, so `env` sets the
    `management` tag on `mythic_user` (otherwise 401 every 10s).
    `rabbitmq-plugins` run as root creates `enabled_plugins`
    root-owned 0600, which breaks the next rabbitmq restart with
    `eacces` — the scripts chown it to `rabbitmq:rabbitmq` 0644.
12. **Hasura needs `libodbc2` and `MYTHIC_ACTIONS_URL_BASE`.**
    The extracted binary fails with `libodbc.so.2: cannot open`
    without `libodbc2` (now in `install`), and metadata apply
    fails for every action without `MYTHIC_ACTIONS_URL_BASE`
    (now exported by the wrapper, matching upstream's Hasura env).
    Metadata also needs a real CLI project: upstream's
    `hasura-docker/metadata/` is not one, so `hasura-metadata`
    builds a temp project (metadata copied in, root `config.yaml`
    written) and applies that.
13. **nginx must be reloaded, not just enabled.** `enable --now`
    is a no-op if nginx is already running, so a config added
    after first boot was never loaded and 7443 refused connections.
    `start` now reloads (or restarts) nginx explicitly.
14. **Agent install copies the whole service directory.**
    Poseidon reads `poseidon/browserscripts/*.js` and
    `poseidon/agentfunctions/poseidon.svg` relative to its working
    directory (Docker `WORKDIR /Mythic/` with the service contents
    copied in). Copying only the binary syncs the payload type but
    leaves browserscripts/icon missing. `install-agent-poseidon.sh`
    copies the full directory, and the agent unit's parent dir
    must be `mythic`-owned or systemd fails with `200/CHDIR`.
15. **Payload building needs three more native directories.**
    The builder writes to hard-coded `/build/<uuid>-linux-amd64`
    (a Docker volume upstream) and the server writes payload files
    to `files/<uuid>` relative to its working directory (`bin/`).
    Neither exists natively: `install-agent-poseidon.sh` now
    creates `/build` (mythic-owned) and `atma-native.sh build`
    creates `bin/files`, or `createPayload` fails with
    "Failed to create file on disk" / "Failed to find final payload".
16. **Payload builds need the host's egress environment.**
    The builder runs `go build` as a child of the agent service,
    which runs with only `agent.env` — no shell proxy. On a
    proxy-only host, module downloads fail with
    "tls: first record does not look like a TLS handshake".
    The Poseidon installer now carries unauthenticated
    `HTTP(S)_PROXY`/`NO_PROXY` from the installer shell into
    `agent.env` (never a proxy password). On a direct-internet
    host this is a no-op.

## What is NOT yet verified (do not skip this)

1. **Full native boot:** Postgres + RabbitMQ + mythic-server +
   Hasura + nginx + React UI, in that order, with a real login as
   `mythic_admin`, has not been run yet. The first test must be
   exactly that, on a disposable VM (the Oracle Always Free A1
   from the free-host research is the obvious $0 host: 2 OCPU /
   12 GB ARM, full VM, no Docker needed at all on this path).
2. **Hasura metadata version:** the metadata in
   `hasura-docker/metadata/` was written for the Hasura version
   Mythic's Docker image pins. The installer downloads a recent
   Hasura v2 binary; if metadata import fails, pin the Hasura
   version to the one in Mythic's `hasura-docker/Dockerfile`.
3. **Agent parity:** core first, then one agent (Poseidon or
   Medusa). Apollo/Athena need .NET on the host; Apfell needs macOS.
4. **Jupyter/documentation:** omitted from the minimum stack.
   Add them as separate units only after the core logs in.
5. **mythic-cli parity:** Path A does not use mythic-cli, so
   `mythic-cli install/start/status` do not apply to a native
   stack. That is a feature (no Docker), not a bug — but do not
   mix the two managers on one host.

## Files

- `atma-native.sh` — installer / builder / starter, with `check`,
  `install`, `build`, `env`, `hasura-metadata`, `start`, `stop`,
  `status`, `logs`.
- `bin/hasura-wrapper.sh` — Hasura launcher that parses `bin/.env`
  literally (never shell-sources it) and exports the constructed
  Postgres URLs + `MYTHIC_ACTIONS_URL_BASE`.
- `bin/hasura-extract.py` — extracts the Hasura server binary from
  the Docker Hub image, no Docker daemon.
- `install-agent-poseidon.sh` — builds and installs the Poseidon
  agent service natively, with a systemd agent unit.
- `install-c2-http.sh` — builds and installs the http C2 profile
  natively (service binary + `http/c2_code/mythic_http_server` +
  lab `config.json` on 127.0.0.1:18080, no SSL). Payloads must use
  `callback_host` WITHOUT a port (`http://127.0.0.1`) and
  `callback_port` 18080 — the OPSEC check rejects a host that
  includes a port.
- `test-real.sh` — endpoint checker for a real stack (health,
  login, GraphQL, metadata) — for a host without systemd, or as a
  checklist on a systemd host.
- `TEST-REPORT-2026-10-24.md` — the real functional test run:
  9/9 core checks + Poseidon sync, with every failure found and fixed.
- `systemd/mythic-server.service` — mythic-server unit.
- `systemd/mythic-hasura.service` — Hasura unit.
- `systemd/mythic-agent@.service` — template for native
  agent/C2 services.
- `nginx/mythic-native.conf` — nginx reverse proxy (7443 → React,
  Hasura, mythic-server, docs), localhost-only by default.
- `systemd-manager-design.md` — Path B design: the CLIManager
  methods a systemd manager must implement, and what to map each
  one to.

## §17 — All other agents + C2 profiles, native (2026-10-24 evening)

This is the full infrastructure, not a definition sync: each entry below
is a service that runs in the stack, with its agent_code / c2_code,
its builder, and its dependencies — verified by GraphQL
`{ payloadtype { name } c2profile { name } }` against the live sandbox.

**Payload types live (6):** poseidon (Go, pre-existing), medusa
(Python, install-python-agent.sh), apfell (Python service, same
installer — payloads run on macOS only, service/build side is Linux),
nemesis (Python, same installer), arachne (Python, same installer —
also brought the webshell C2), merlin (Go, install-agent-merlin.sh —
working dir is container/, builder hard-codes /Mythic/agent, so
/Mythic is a directory of per-agent symlinks, not a single symlink;
Go build temp/cache are under /opt/mythic/go, NOT /tmp, because
/tmp is a 512 MB tmpfs in the sandbox and a Merlin build overflows it).

**C2 profiles live (8):** http (pre-existing), webshell (via arachne),
websocket, tcp, dynamichttp, smb (Python, install-python-c2.sh),
httpx, dns (Go, install-go-c2.sh).

**Paused, awaiting the operator's plain-words decision (§18):**
apollo and athena. Their service source + agent_code are installed
(/opt/mythic/InstalledServices/apollo, .../athena, units
mythic-python-agent@apollo / @athena, currently stopped), and dotnet
SDK 8.0 is installed on the host — but both services fail at import
with `ModuleNotFoundError: No module named 'donut'` in their
agent_functions. The upstream file that named that dependency did
not pass a safety check, so Muse did NOT install it on its own.
Until Stephen says, in plain words, to proceed with that dependency,
apollo/athena stay paused and are NOT claimed as synced. This is a
deliberate stop, not a bug to work around silently.

**Not built on Linux, honestly:** apfell payloads need macOS
(Swift/JXA); Apollo/Athena payloads are Windows .NET (service side
is Linux, payload runs on Windows); the remaining MythicAgents
repos are exercises, wrappers, translators, or niche agents
(hercules exercises, forge, ghostwriter, etc.) — not production
payload types, and not installed. The "all other agents" in this
run means the production payload types above, plus the C2 set.

## §18 — Web app <-> real backend link

`agent/atma-gateway.mjs` now has a second job besides Groq:
POST /mythic/auth and POST /mythic/graphql, forwarded to
MYTHIC_URL (default https://127.0.0.1:7443). Gateway auth is
x-atma-token (ATMA_GATEWAY_TOKEN on the host); the browser's
Mythic operator JWT travels in Authorization and is forwarded,
never stored by the gateway. MYTHIC_INSECURE_TLS=1 is lab-only
(self-signed nginx cert). The Pages console's new "Live Mythic"
tab (docs/app-v5.js, Bundle serverless-5) logs in via the
gateway and refreshes payloadtype / c2profile / callback / task
from the real server. Verified in the sandbox: wrong gateway token
→ 401, auth → JWT (241 chars), GraphQL via gateway → the same
6 payload types + 8 C2 profiles + 2 lab callbacks as a direct
query. To use it on a real host: run the gateway on the host,
expose it with Tailscale Serve, paste the Serve URL + gateway
token + operator login in the Live tab. Demo mode remains the
default; nothing in Live mode is faked.

## §19 — Apollo + Athena natively composed (2026-10-24, operator-approved)

After Stephen's "natively compose" approval, the paused .NET agents
were composed natively:
- Missing dependencies, found by scanning agent_functions imports
  (not by guessing): Apollo — mslex, impacket, toml, donut-shellcode;
  Athena — donut-shellcode only (pefile/py2app already from
  requirements.txt). PyPI 'donut' is the WRONG package (dotfiles
  tool, no create()); the correct one is the Donut shellcode C
  extension (donut-shellcode 2.0.0, compiled from source, no
  network code in its Python wrapper, original author TheWover).
- Fix found on first start: newly pip-installed packages landed
  root-owned 660/770, so the mythic service user could not read
  the donut .so (Permission denied). Fix is chown -R
  mythic:mythic on the service dirs; install-python-agent.sh
  already does this at the end, so a fresh install does not hit it.
- Verified: both services active, GraphQL payloadtype now 8 —
  poseidon, medusa, apfell, nemesis, arachne, merlin, apollo,
  athena. Apollo commands synced (80+, incl. shell, mimikatz,
  execute_assembly, socks, inject).
- dotnet restore: Apollo Apollo.sln exit 0, Athena Agent.sln
  exit 0 (Athena: SSH.NET 2024.2.0 known-vulnerability warnings
  NU1903, upstream package, noted not fixed here).
- Honest build limits: Apollo agent_code targets net451 (.NET
  Framework) — Linux dotnet 8 can restore it but cannot compile
  that target; a WinExe build needs Windows/Mono. Athena targets
  net8.0, but a raw `dotnet build Agent.sln` fails with 1 error
  (AthenaCore missing Agent.Crypto reference) — the Mythic
  builder builds selected plugins with obfuscation files
  (agent.obfs/common.obfs), not the whole sln, so a Mythic
  payload build was NOT claimed from this. Services, commands,
  and restores are the verified compose; a Windows payload build
  remains a Windows-host step.

## §20 — Athena WinExe from Linux, modular publish (2026-10-24)

Script: `lab/native/athena-build-win.sh` (permanent in this repo).
It replicates Athena's Mythic builder staged flow, standalone:
temp copy -> Http profile from Base.txt -> AgentConfig substitution
-> `dotnet add AthenaCore reference` per command + profile + crypto
-> build Agent.Models -> `dotnet publish AthenaCore -r win-x64`
(self-contained, single-file, HandlerOS=windows) -> zip.
Verified: commands shell,ls,ps,config,exit, http 127.0.0.1:18080,
exe 37,571,461 bytes, `PE32+ executable (console) x86-64, for MS
Windows, 10 sections`, zip contains single AthenaCore.exe.
Bug fixed in the script: relative --output used to resolve inside
the temp build dir and be deleted with it; output is now resolved
to an absolute path before cd. Full record:
`lab/native/athena-win-build-brainstorm.md`. The compiled exe
itself is NOT committed to the public repo by default — it is
reproducible from the script; see the brainstorm doc for why.

## §21 — Full rebuild after VM replacement (2026-10-24, evening)

The sandbox stack from earlier in the day vanished on a VM
replacement (~21:47); only ~/workspace persisted. The full native
stack was rebuilt on the new host from this repo alone:
atma-native.sh install -> build -> env -> start, then
install-agent-poseidon.sh, install-c2-http.sh, install-python-agent.sh
(medusa, apfell, nemesis, arachne, apollo, athena),
install-agent-merlin.sh, install-python-c2.sh (websocket, tcp,
dynamichttp, smb), install-go-c2.sh (httpx, dns).
Verified after rebuild: 5 core services active (postgresql,
rabbitmq-server, mythic-server, mythic-hasura, nginx), auth JWT,
React UI /new/login 200, Hasura metadata applied, GraphQL
payloadtype 8 (poseidon, medusa, apfell, nemesis, arachne, merlin,
apollo, athena) and c2profile 8 (http, webshell, websocket, tcp,
dynamichttp, smb, httpx, dns), Apollo 81 commands, Athena 125
commands, Poseidon payload build success (ELF 6.7 MB, same size
class as the original run).
Rebuild fixes now in the installers (not manual-only):
- atma-native.sh is executable again (its start() self-call to
  status failed with "Permission denied" when the file lost +x;
  the stack itself was unaffected) and install() now creates
  /opt/mythic/go/{cache,tmp,pkg/mod} mythic-owned.
- install-agent-poseidon.sh now writes GOPATH/GOCACHE/GOTMPDIR
  (/opt/mythic/go/...) into agent.env, chowns /opt/mythic/go,
  and seeds the agent_code module cache; new standalone
  seed-poseidon-modules.sh does the same seeding on demand.
  Without this, payload builds failed twice: first "could not
  create module cache: permission denied" (root-owned go home),
  then module downloads timing out through the unauthenticated
  proxy. With the cache seeded, a Poseidon build completes in
  under 10 seconds.
- Payload build and callback/tasking verification for this
  rebuild are in TEST-REPORT-2026-10-24.md §Rebuild.
- NOT in the repo: /opt/mythic/bin/.env (generated, 0600,
  admin + service passwords) and any proxy credential — those
  stay on the host only. The repo holds everything needed to
  regenerate the stack, not the secrets that run it.

## §22 — DeepHat AI chat (Ollama, 2026-10-24)

DeepHat/DeepHat-V1-7B (Kindo, Qwen2.5-Coder-7B finetune) is wired
into the Pages console as docs/deephat.js (bundle serverless-6):
a DeepHat AI main-pane view + a floating chat bubble bottom-right,
sharing one localStorage history. Backends: Ollama local
(http://localhost:11434) or gateway (agent/atma-gateway.mjs now
proxies /ollama/* to OLLAMA_URL with the same x-atma-token gate;
stub-verified: wrong token 401, correct token returns the Ollama
reply). Python client: agent/deephat_ollama.py (the operator's
ollama chat snippet, plus --check/--stream/--interactive).
Host setup: server/deephat-ollama-setup.sh (install Ollama, pull
the model, verify). This VM cannot run a 7B model, so a live
DeepHat answer requires a host Ollama — Pages never runs the model.
Code edits are proposals only: a ```atma-edit:path block becomes
a review card (preview + download + Apply). Apply needs the
proposal toggle on, a GitHub token saved in Connect (localStorage
only, sent only to api.github.com), and a confirm click; it is
whole-file only, allowlisted to docs/, agent/, lab/, server/,
default repo Etienne0101-lab/Project-ATMA (changeable in the
panel — "maripo" was taken to mean this root project; correct the
repo field if a different repo was meant). No unconditional admin
write is granted to any model.

## §23 — Same-host module: Mythic + Ollama + gateway on one VM (2026-10-24)

One host, three services, one public door. This is the module
Stephen chose over a separate cloud GPU box or a hosted API.

  Mythic stack (atma-native.sh)   Ollama (install-ollama.sh)
    postgres, rabbitmq, nginx       127.0.0.1:11434, localhost only
    mythic-server, hasura           models in /opt/ollama/models
         \                            /
          \   atma-gateway.service  /
           \  localhost:8787, token /
            \______________________/
                     |
              Tailscale Serve :443
                     |
              Pages console (DeepHat AI view, Live Mythic tab)

Install order on the production host (as root, from a repo checkout):
  1. bash lab/native/atma-native.sh install/build/env/start  (Mythic)
  2. bash lab/native/install-ollama.sh
       — installs Ollama, pins OLLAMA_HOST=127.0.0.1:11434 via a
         systemd drop-in, models in /opt/ollama/models, pulls
         DeepHat/DeepHat-V1-7B unless --no-pull. It REFUSES to pull
         below 10 GB free disk or 8 GB RAM (16 GB recommended) —
         that guard is why the small Muse VM is not a DeepHat host.
  3. bash lab/native/install-gateway.sh [--serve]
       — copies agent/atma-gateway.mjs to /opt/atma/, installs
         systemd/atma-gateway.service, generates
         /opt/atma/atma-gateway.env (0600, host-only, never in the
         repo) with ATMA_GATEWAY_TOKEN, MYTHIC_URL, OLLAMA_URL.
         --serve also runs `tailscale serve --bg --https=443
         http://127.0.0.1:8787`. Copy the token into Connect.
  4. bash lab/native/check-same-host.sh [token]
       — services, Mythic /health, Ollama /api/tags, gateway
         /gateway/status, and the proxied /ollama route (401
         without a token is the passing result there).
  5. In the Pages console: DeepHat AI view -> Backend: Gateway,
     Gateway URL = Serve HTTPS name, token = the generated one.
     Live Mythic tab uses the same gateway + token.

Verified 2026-10-24 on the rebuilt sandbox host (Mythic services
active, real Ollama NOT installed there — RAM ~450 MB free, disk
5.3 GB, so a real DeepHat pull was correctly out of scope):
syntax for all three scripts + gateway JS, systemd-analyze
verify clean for atma-gateway.service, and a stub Ollama on
11434 behind the gateway: status shows mythic_proxy + ollama_proxy,
/ollama/api/tags 401 without token and the model list with it,
Mythic /health still 200 on the same host. Real DeepHat chat is
NOT claimed on this sandbox — it needs the production host above
with the model pulled. Supersedes server/deephat-ollama-setup.sh
as the install path for a Mythic host (that script remains valid
for a standalone Ollama-only host).
