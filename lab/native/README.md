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
