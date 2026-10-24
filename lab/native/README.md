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
sudo bash atma-native.sh env       # generates /opt/mythic/.env (0600) — record the admin password it prints once
sudo bash atma-native.sh start     # postgres → rabbitmq → mythic-server → hasura → nginx
bash atma-native.sh status         # systemd status + port checks + /health
# UI: https://127.0.0.1:7443  (or via Tailscale Serve — see server/README.md)
sudo bash atma-native.sh stop
```

The installer never opens a firewall port and never binds nginx
to `0.0.0.0:7443` by default — the shipped nginx config binds
`127.0.0.1:7443`. Expose it only through Tailscale Serve, or by
changing that bind deliberately.

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
  `install`, `build`, `env`, `start`, `stop`, `status`, `logs`.
- `systemd/mythic-server.service` — mythic-server unit.
- `systemd/mythic-hasura.service` — Hasura unit.
- `systemd/mythic-agent@.service` — template for native
  agent/C2 services.
- `nginx/mythic-native.conf` — nginx reverse proxy (7443 → React,
  Hasura, mythic-server, docs), localhost-only by default.
- `systemd-manager-design.md` — Path B design: the CLIManager
  methods a systemd manager must implement, and what to map each
  one to.
