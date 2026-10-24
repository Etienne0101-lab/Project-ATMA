# Path B — a `systemd` manager for mythic-cli (design, not yet code)

This is the upstream-correct way to make `mythic-cli start` work
without Docker. It is a design note, not a claimed implementation.

## The hook (verified in upstream source)

- `Mythic_CLI/src/cmd/manager/managerInterface.go`:
  `CLIManager` interface, ~40 methods, and `Initialize()`:
  ```go
  switch envManager {
  case "docker":
      currentManager = &DockerComposeManager{...}
  default:
      log.Fatalf("[-] Unknown manger specified in .env for global_manager")
  }
  ```
- `Mythic_CLI/src/cmd/config/env.go`: `global_manager` default
  `"docker"`, note: *"Additional PRs can be made to implement the
  CLIManager Interface and provide more options."*
- So a native manager is: a new `SystemdManager` struct in
  `cmd/manager/`, a `case "systemd":` in `Initialize()`, and
  `global_manager=systemd` in `.env`. No fork of the server, no
  fork of the UI — only the manager changes.

## Method → systemd mapping (the whole interface, honestly)

| CLIManager method | systemd equivalent |
|---|---|
| `GetManagerName()` | return `"systemd"` |
| `IsServiceRunning(s)` | `systemctl is-active mythic-<s>` / `mythic-agent@<s>` |
| `IsServiceInternal(s)` | same host logic as Docker manager (reuse `GetIntendedMythicServiceNames`) |
| `CheckRequiredManagerVersion()` | check `systemctl --version`, Go, Postgres, RabbitMQ binaries exist |
| `GenerateRequiredConfig()` | write `/opt/mythic/.env` + unit files + nginx config, instead of `docker-compose.yml` |
| `DoesImageExist(s)` | no images natively — return "binary exists?" (`/opt/mythic/bin/<s>` or system package) |
| `RemoveImages()` / `SaveImages()` / `LoadImages()` | no-op / tar of `/opt/mythic/bin` + service dirs (documented as non-equivalent) |
| `RemoveContainers(s, keepVolume)` | `systemctl stop` + remove unit, keep data dir if `keepVolume` |
| `GetVolumes()` / `SetVolumes()` | map volume names → host directories (`/var/lib/mythic/...`) |
| `GetServiceConfiguration(s)` / `SetServiceConfiguration(s, cfg)` | read/write the unit's `Environment=` / drop-in, instead of compose service YAML |
| `StopServices(s, ...)` | `systemctl stop mythic-*` in reverse dependency order |
| `RemoveServices(s, ...)` | stop + `systemctl disable` + remove unit + optional data-dir removal |
| `StartServices(s, rebuild)` | `systemctl start` in dependency order; `rebuild` = rebuild Go binary / npm UI first |
| `BuildServices(s, ...)` | `go build` / `npm run build` / Hasura download, then start |
| `GetInstalled3rdPartyServicesOnDisk()` | list `/opt/mythic/InstalledServices/` |
| `GetAllInstalled3rdPartyServiceNames()` | list enabled `mythic-agent@*.service` units |
| `GetCurrentMythicServiceNames()` | list enabled `mythic-*.service` units |
| `GetPathTo3rdPartyServicesOnDisk()` | return `/opt/mythic/InstalledServices` |
| `GetHealthCheck(s)` | `pg_isready`, `rabbitmqctl ping`, `curl /health`, Hasura `/healthz` |
| `BuildUI()` | `npm run build` in `MythicReactUI`, copy to `/var/www/mythic-new` |
| `GetLogs(s, n, follow)` | `journalctl -u mythic-<s> -n n [-f]` |
| `TestPorts(s)` | same port-availability check as Docker manager, against host ports |
| `PrintConnectionInfo()` | same table as Docker manager, with host ports instead of container names |
| `Status(verbose)` | `systemctl status` + port table |
| `PrintAllServices()` | list units + on-disk services |
| `ResetDatabase(useVolume)` | drop/recreate `mythic_db` via `psql` (data dir if not volume) |
| `ResetRabbitmq(useVolume)` | `rabbitmqctl stop_app; reset; start_app` or wipe `/var/lib/rabbitmq` |
| `BackupDatabase(path, ...)` | `pg_dump mythic_db` to path |
| `RestoreDatabase(path, ...)` | `psql mythic_db < dump` |
| `BackupFiles(path, ...)` | tar `/var/lib/mythic/server` |
| `RestoreFiles(path, ...)` | untar to `/var/lib/mythic/server` |
| `PrintVolumeInformation()` | `du` on the host directories above |
| `RemoveVolume(name)` | remove the mapped host directory |
| `CopyIntoVolume(...)` / `CopyFromVolume(...)` | `cp` to/from the mapped host directory (no container exec needed) |

## Hard parts, stated plainly

1. **Service metadata is compose-shaped today.** `AddMythicService`
   builds compose YAML (`image`, `ports`, `volumes`, `depends_on`).
   A systemd manager must either translate that metadata to units
   or replace `AddMythicService`/`Add3rdPartyService` with a
   unit-generating equivalent. That is the largest single change.
2. **Backup/restore via Docker exec disappears.** The Docker
   manager runs `pg_dump` *inside* the Postgres container. Natively
   it is just `pg_dump` on the host — simpler, but the code path
   must change, not just the binary name.
3. **Payload building toolchains move to the host.** See README:
   .NET, Go, Python, and (impossibly on Linux) macOS SDKs.
4. **No upstream test suite for a second manager exists.**
   The first PR would need its own tests: start/stop/status/logs
   for the core, plus one agent install, on a clean VM.

## Why Path A first, Path B second

Path A (this folder, direct systemd units) proves the services
themselves run natively, without touching upstream code. Path B
proves `mythic-cli` can manage them. If Path A fails on Hasura
metadata or on the React build, Path B will fail the same way —
just with more code around it. Do A first, then port its working
units into B's `StartServices`/`GetServiceConfiguration`.
