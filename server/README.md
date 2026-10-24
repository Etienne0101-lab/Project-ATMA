# Project ATMA — your own Mythic server

This folder is the server half of the ATMA architecture. The Pages app
(`../docs/`) is the console. This folder is how you actually run Mythic.

**Lab-only rule, stated once:** run Mythic on your own host, against
systems you own or are explicitly authorised to test. Nothing in this
repo targets, scans, or executes on any other host.

## Brainstorm: how to launch Mythic “natively from the repo”

“Native” here has two different meanings, and they have very different
costs. Ranked by feasibility:

### Option A — Official path: build `mythic-cli` natively, let it run Docker (RECOMMENDED)

- What it is: clone `its-a-feature/Mythic`, run root `make`.
  That `Makefile` does `cd Mythic_CLI && make build_linux`, which
  pulls the official builder image
  `ghcr.io/its-a-feature/mythic_cli:v3.4.0.61` and copies the
  `mythic-cli` binary out. No local Go toolchain needed for this path.
  (`make local` in `Mythic_CLI/` is the Go-from-source alternative.)
- Then: `sudo ./mythic-cli start` brings up the Docker containers —
  mythic server (Go), Postgres, RabbitMQ, React UI, and whatever
  agents/C2 profiles you install.
- Why it's recommended: it's the only path upstream actually ships
  and tests. The CLI generates the docker-compose file, manages
  `.env`, installs services, and handles updates.
- Cost: one Linux host with Docker + Docker Compose plugin, a few GB
  of images, several minutes on first start.
- **This is what `atma-mythic.sh` implements.**

### Option B — Truly Docker-free native (EXPERIMENT, not recommended yet)

- What it would mean: run the Go server, Postgres, RabbitMQ, and the
  React UI as native processes, with your own supervisor, env files,
  database migrations, and health checks.
- Why it's hard: upstream ships no such supervisor. You would be
  re-implementing what `mythic-cli` + docker-compose already do, and
  every upstream change could break your wiring. It also needs
  Postgres and RabbitMQ installed natively, plus a Node build for
  the UI.
- Verdict: only worth it if you have a hard no-Docker constraint on a
  dedicated host. If you pick this, the next step is a supervisor
  spec (systemd units + env template + readiness probes), not a
  one-line script — say so and I'll draft that as a separate,
  clearly-labelled experiment.

### Option C — Mythic on a VPS / droplet

- Same as Option A, just on rented hardware instead of your laptop.
  Best if you want phone access without SSH tunnels.
- Extra work, not extra code: firewall the UI to localhost/Tailscale
  only, never expose 7443 to the internet, use a reverse proxy with
  real TLS if you ever need remote browser access.

### Option D — This Muse VM, or your Android phone (NOT FEASIBLE)

- Checked: this VM has no Docker, no Go, no Postgres, and it is
  ephemeral. A phone cannot run Docker containers. Neither can host
  Mythic. The launcher must run on a real Linux host.

## Recommended sequence

1. **Host:** a Linux machine you control (laptop, homelab box, or VPS)
   with Docker + Compose plugin. `atma-mythic.sh check` tells you
   what's missing.
2. **Build:** `bash server/atma-mythic.sh build`
3. **Start:** `bash server/atma-mythic.sh start`
   - UI: https://127.0.0.1:7443 (self-signed cert — expect a warning)
   - Admin: `mythic_admin`, password generated on first start and
     stored in `Mythic/.env` on that host only.
4. **Install lab tools:** `bash server/atma-mythic.sh install-lab`
   - Agents: Apollo, Poseidon, Medusa, Apfell (override with
     `ATMA_AGENTS="Apollo Poseidon"`)
   - C2: http (override with `ATMA_C2="http"`)
   - Then: `cd <mythic-dir> && sudo ./mythic-cli restart`
5. **Connect ATMA:** open the Pages console on the *same* machine and
   use Connect with `https://127.0.0.1:7443`. From a phone, first
   SSH-forward (`ssh -L 7443:127.0.0.1:7443 user@host`) or use
   Tailscale — Pages over https cannot reach your host's localhost
   directly, and will block plain-http / self-signed cross-origin
   calls. The console's Test Connection button reports the real
   result either way.
6. **Operate:** create an operation in Mythic's own UI, add operators
   with roles, then use callbacks/tasks there. The ATMA console in
   demo mode is for planning and learning; real tasking happens
   through your Mythic instance, under its auth.

## Useful mythic-cli commands (all run inside the Mythic checkout)

```
sudo ./mythic-cli status          # container status
sudo ./mythic-cli stop            # stop all services
sudo ./mythic-cli restart         # stop + start
sudo ./mythic-cli start <service> # start one service
sudo ./mythic-cli logs <container>
sudo ./mythic-cli install github https://github.com/MythicAgents/Apollo
sudo ./mythic-cli install github https://github.com/MythicC2Profiles/http
sudo ./mythic-cli update          # check for updates (does not apply them)
sudo ./mythic-cli config get      # dump config; config set <var> <value>
```

Remote bind, only if you explicitly want it (not the default):

```
sudo ./mythic-cli config set mythic_server_bind_localhost_only false
sudo ./mythic-cli config set rabbitmq_bind_localhost_only false
sudo ./mythic-cli restart
```

Do not do that on a public IP without a firewall / VPN in front of it.

## Files

- `atma-mythic.sh` — the launcher (check / build / start / install-lab /
  status / stop / logs). Lab-only, localhost-first, no credentials
  written to the repo.
- This README — the brainstorm, the recommended sequence, and the
  honest limits.

## What this does NOT do

- It does not start Mythic on GitHub Pages (impossible — Pages is static).
- It does not start Mythic in this sandbox (no Docker/Go, ephemeral).
- It does not build, deliver, or execute payloads against any target.
- It does not open firewall ports, bypass Mythic auth, or contact any
  server you have not configured.
