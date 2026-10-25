#!/usr/bin/env bash
# Project ATMA — Mythic natively as system services, no Docker daemon.
# Lab-only, authorised use. See README.md in this folder before running.
# Usage: sudo bash atma-native.sh check|install|build|env|start|stop|status|logs|hasura-metadata
#
# Corrections applied 2026-10-24 (see README "Deployability corrections"):
#  1. mythic_server reads .env from the EXECUTABLE's directory (utils/config.go:
#     getCwdFromExe), and database/migrations relative to its WORKING directory.
#     So the canonical .env is /opt/mythic/bin/.env, and the systemd unit sets
#     WorkingDirectory=/opt/mythic/bin. The old /opt/mythic/.env location was wrong.
#  2. env must run AFTER Postgres/RabbitMQ are up, or account creation silently fails.
#  3. Hasura's upstream image is cli-migrations-v2, not the plain server binary:
#     metadata must be APPLIED with the Hasura CLI after Hasura starts (hasura-metadata).
#  4. systemd does not reliably expand ${VAR} from EnvironmentFile inside
#     Environment= lines, so Hasura runs via hasura-wrapper.sh, which sources
#     bin/.env in shell and exports the constructed URLs itself.
#  5. mythic-server unit health checks use TCP probes, not rabbitmqctl/pg_isready
#     as the mythic user (rabbitmqctl needs the Erlang cookie and fails there).
#  6. React build failure is now fatal, and build output is verified, not echoed away.
#  7. Apt's Go is usually too old for go.mod (go 1.25.1): install() installs Go 1.25
#     from go.dev when the installed Go is missing or < 1.25.
set -euo pipefail

MYTHIC_HOME="${MYTHIC_HOME:-/opt/mythic}"
MYTHIC_USER="${MYTHIC_USER:-mythic}"
MYTHIC_REPO="${MYTHIC_REPO:-https://github.com/its-a-feature/Mythic}"
MYTHIC_SRC="$MYTHIC_HOME/src"
MYTHIC_BIN="$MYTHIC_HOME/bin"
# Capture the script's own directory BEFORE any cd: $0 is often relative
# ("atma-native.sh"), and readlink -f "$0" after a cd would resolve to the
# wrong directory (this bug once made build() look for bin/ inside mythic-docker/src).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
HASURA_VERSION="${HASURA_VERSION:-v2.46.0}"
GO_VERSION="${GO_VERSION:-1.25.1}"
# Hasura server binary is NOT a GitHub release asset in v2 (releases contain
# only the CLI). It is extracted from the Docker Hub image by
# bin/hasura-extract.py — see the correction note in README.md.
HASURA_CLI_URL="https://github.com/hasura/graphql-engine/releases/download/${HASURA_VERSION}/cli-hasura-linux-amd64"

die() { echo "[-] $*" >&2; exit 1; }
info() { echo "[*] $*"; }
need_root() { [ "$(id -u)" = "0" ] || die "run with sudo"; }
tcp_open() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }
wait_tcp() { # wait_tcp <port> <tries>
  local i
  for i in $(seq 1 "$2"); do tcp_open "$1" && return 0; sleep 2; done
  return 1
}

check() {
  echo "--- atma-native check ---"
  for cmd in psql rabbitmq-server nginx openssl curl git node npm systemctl; do
    if command -v "$cmd" >/dev/null 2>&1; then echo "OK   $cmd: $(command -v "$cmd")"; else echo "MISS $cmd"; fi
  done
  if command -v go >/dev/null 2>&1; then
    echo "OK   go: $(go version)"
    go version | grep -qE "go1\.(2[5-9]|[3-9][0-9])" || echo "WARN go is < 1.25 — install() will replace it from go.dev"
  else echo "MISS go (install() will fetch $GO_VERSION from go.dev)"; fi
  echo "--- ports (should be free before first start, except postgres/rabbitmq if already installed) ---"
  for p in 5432 5672 17443 17444 8080 7443; do
    if tcp_open "$p"; then echo "OPEN 127.0.0.1:$p"; else echo "free  127.0.0.1:$p"; fi
  done
}

install_go_if_needed() {
  if command -v go >/dev/null 2>&1 && go version | grep -qE "go1\.(2[5-9]|[3-9][0-9])"; then
    info "Go already >= 1.25: $(go version)"; return 0
  fi
  info "Installing Go $GO_VERSION from go.dev (apt Go is too old for mythic-docker go.mod)..."
  local arch
  case "$(uname -m)" in x86_64) arch=amd64 ;; aarch64|arm64) arch=arm64 ;; *) die "unsupported arch $(uname -m) for Go download" ;; esac
  curl -fsSL -o "/tmp/go-$GO_VERSION.linux-$arch.tar.gz" "https://go.dev/dl/go$GO_VERSION.linux-$arch.tar.gz"
  rm -rf /usr/local/go
  tar -C /usr/local -xzf "/tmp/go-$GO_VERSION.linux-$arch.tar.gz"
  ln -sf /usr/local/go/bin/go /usr/local/bin/go
  go version
}

install() {
  need_root
  info "Installing system packages (Ubuntu/Debian)..."
  apt-get update
  # libpcre3 + libodbc2: required by the extracted Hasura binary
  # (libpcre.so.3, libodbc.so.2 — check with ldd if Hasura fails to start).
  # npm is tried separately: Ubuntu's npm package conflicts with a
  # nodesource Node 24 install (held broken packages), and must not
  # fail the whole install when npm is already present another way.
  apt-get install -y postgresql rabbitmq-server nginx libpcre3 libodbc2 openssl curl git nodejs python3
  if ! command -v npm >/dev/null 2>&1; then apt-get install -y npm || echo "[!] npm install failed — install npm manually before building the React UI"; fi
  # Upstream RabbitMQ image is rabbitmq:3-management-alpine: mythic_server
  # polls the management API on 15672 for container/queue status. Without
  # this plugin it logs a connection-refused error every 10s forever.
  # The enabled_plugins file must be readable by the rabbitmq user:
  # rabbitmq-plugins run as root creates it root-owned 0600, which
  # makes rabbitmq-server fail to start with eacces on next restart.
  rabbitmq-plugins enable rabbitmq_management 2>/dev/null || echo "[!] could not enable rabbitmq_management — run: rabbitmq-plugins enable rabbitmq_management"
  chown rabbitmq:rabbitmq /etc/rabbitmq/enabled_plugins 2>/dev/null || true
  chmod 644 /etc/rabbitmq/enabled_plugins 2>/dev/null || true
  install_go_if_needed
  id "$MYTHIC_USER" >/dev/null 2>&1 || useradd --system --home-dir "$MYTHIC_HOME" --shell /usr/sbin/nologin "$MYTHIC_USER"
  mkdir -p "$MYTHIC_HOME" "$MYTHIC_HOME"/{src,bin,files,logs} /var/lib/mythic/server /etc/mythic /var/www/mythic-new
  chown -R "$MYTHIC_USER:$MYTHIC_USER" "$MYTHIC_HOME" /var/lib/mythic
  chmod 750 "$MYTHIC_HOME" /var/lib/mythic
  info "Packages installed. Next: build, then env, then start."
}

build() {
  need_root
  info "Fetching upstream Mythic source (sparse: server, CLI config, React UI, Hasura metadata)..."
  # install() chowns $MYTHIC_HOME to the mythic user, so a root-run clone
  # into the pre-created src dir trips git's dubious-ownership check.
  # Own the dir for the build user and mark it safe before cloning.
  mkdir -p "$MYTHIC_SRC"; chown "$(id -u):$(id -g)" "$MYTHIC_SRC" 2>/dev/null || true
  git config --global --add safe.directory "$MYTHIC_SRC" 2>/dev/null || true
  if [ ! -d "$MYTHIC_SRC/.git" ]; then
    git clone --depth 1 --filter=blob:none --sparse "$MYTHIC_REPO" "$MYTHIC_SRC"
  fi
  cd "$MYTHIC_SRC"
  git sparse-checkout set mythic-docker Mythic_CLI MythicReactUI hasura-docker nginx-docker postgres-docker rabbitmq-docker
  [ -d "$MYTHIC_SRC/mythic-docker/src" ] || die "mythic-docker/src missing after sparse checkout"
  info "Building mythic_server (Go, CGO_ENABLED=0, as in mythic-docker/Makefile)..."
  cd "$MYTHIC_SRC/mythic-docker/src"
  GOEXPERIMENT=jsonv2 CGO_ENABLED=0 go build -o "$MYTHIC_BIN/mythic_server" -tags="nomsgpack" . || \
    die "mythic_server build failed — check Go version (need 1.25+) and network for go modules"
  rm -rf "$MYTHIC_BIN/database" "$MYTHIC_BIN/static" "$MYTHIC_BIN/utils"
  cp -r "$MYTHIC_SRC/mythic-docker/src/database" "$MYTHIC_BIN/database"
  cp -r "$MYTHIC_SRC/mythic-docker/src/static" "$MYTHIC_BIN/static"
  # MITRE ATT&CK data: database/initialize_mitre_attack.go reads
  # ./utils/files/attack.json relative to the working directory. Without
  # this copy the server logs "Failed to read attack file" and the
  # attack table stays empty (non-fatal, but a real functional gap).
  mkdir -p "$MYTHIC_BIN/utils/files"
  cp "$MYTHIC_SRC/mythic-docker/src/utils/files/attack.json" "$MYTHIC_BIN/utils/files/"
  # Payload/file storage: GetSaveFilePath writes "files/<uuid>" relative
  # to the server's working directory (bin/). In Docker that is a volume;
  # natively the directory must exist or createPayload fails with
  # "Failed to create file on disk" after 10 retries.
  mkdir -p "$MYTHIC_BIN/files"
  [ -d "$MYTHIC_BIN/database/migrations" ] || die "database/migrations missing after copy — mythic_server will fatal on boot"
  [ "$(ls "$MYTHIC_BIN/database/migrations" | wc -l)" -gt 0 ] || die "database/migrations is empty"
  info "Extracting Hasura graphql-engine $HASURA_VERSION from Docker Hub (no Docker daemon, see bin/hasura-extract.py)..."
  cp "$SCRIPT_DIR/bin/hasura-extract.py" "$MYTHIC_BIN/hasura-extract.py"
  python3 "$MYTHIC_BIN/hasura-extract.py" --tag "$HASURA_VERSION" --arch "$(uname -m | sed -e 's/x86_64/amd64/' -e 's/aarch64/arm64/')" --out "$MYTHIC_BIN/graphql-engine" || \
    die "Hasura extraction failed — check network to registry-1.docker.io and the tag $HASURA_VERSION"
  "$MYTHIC_BIN/graphql-engine" --version >/dev/null 2>&1 || echo "[!] graphql-engine runs but --version check failed (check libpcre3 is installed: apt-get install libpcre3)"
  info "Downloading Hasura CLI $HASURA_VERSION (for metadata apply)..."
  curl -fsSL -o "$MYTHIC_BIN/hasura" "$HASURA_CLI_URL" || echo "[!] Hasura CLI download failed — hasura-metadata step will need a manual CLI install; server binary is still present"
  chmod +x "$MYTHIC_BIN/graphql-engine" "$MYTHIC_BIN/mythic_server" "$MYTHIC_BIN/hasura" 2>/dev/null || true
  cp "$SCRIPT_DIR/bin/hasura-wrapper.sh" "$MYTHIC_BIN/hasura-wrapper.sh"
  chmod +x "$MYTHIC_BIN/hasura-wrapper.sh"
  info "Building React UI (MythicReactUI: npm run build -> react-app-rewired build)..."
  cd "$MYTHIC_SRC/MythicReactUI"
  if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; else npm install --no-audit --no-fund; fi
  npm run build || die "React UI build failed — do not proceed; the UI will not render"
  [ -f "$MYTHIC_SRC/MythicReactUI/build/index.html" ] || die "React build output missing build/index.html"
  rm -rf /var/www/mythic-new; mkdir -p /var/www/mythic-new
  cp -r "$MYTHIC_SRC/MythicReactUI/build/." /var/www/mythic-new/
  [ -f /var/www/mythic-new/index.html ] || die "failed to copy React build to /var/www/mythic-new"
  chown -R "$MYTHIC_USER:$MYTHIC_USER" "$MYTHIC_BIN" "$MYTHIC_SRC"
  chown -R www-data:www-data /var/www/mythic-new 2>/dev/null || true
  info "Build done. Next: env (generates $MYTHIC_BIN/.env, 0600)."
}

gen_env() {
  need_root
  local envfile="$MYTHIC_BIN/.env"
  [ -d "$MYTHIC_BIN" ] || die "run build first — $MYTHIC_BIN does not exist"
  if [ -f "$envfile" ]; then
    echo "[!] $envfile already exists — refusing to overwrite. Delete it deliberately if you want a fresh one."
    exit 1
  fi
  # Postgres/RabbitMQ MUST be running before account creation (old code created
  # accounts first and silently swallowed the failure when they were down).
  info "Starting Postgres + RabbitMQ before creating accounts..."
  systemctl enable --now postgresql rabbitmq-server 2>/dev/null || service postgresql start 2>/dev/null || true
  wait_tcp 5432 30 || die "Postgres did not come up on 5432"
  wait_tcp 5672 30 || die "RabbitMQ did not come up on 5672"
  local pg_pw rmq_pw jwt admin_pw hasura_secret
  pg_pw="$(openssl rand -hex 32)"; rmq_pw="$(openssl rand -hex 32)"
  jwt="$(openssl rand -hex 32)"; admin_pw="$(openssl rand -hex 24)"
  hasura_secret="$(openssl rand -hex 32)"
  cat > "$envfile" <<EOF
# ATMA native Mythic — generated $(date -u +%F). KEEP THIS FILE 0600, NEVER COMMIT IT.
# Location matters: mythic_server reads .env from its executable's directory,
# which is $MYTHIC_BIN. Do NOT move this file to /opt/mythic/.env.
# Hosts are 127.0.0.1 because every service runs on this host, not in containers.
mythic_server_port=17443
mythic_server_grpc_port=17444
mythic_server_host=127.0.0.1
mythic_server_bind_localhost_only=true
mythic_server_dynamic_ports=7000-7010
mythic_server_dynamic_ports_bind_localhost_only=true
mythic_docker_networking=host
postgres_host=127.0.0.1
postgres_port=5432
postgres_db=mythic_db
postgres_user=mythic_user
postgres_password=$pg_pw
postgres_sslmode=disable
rabbitmq_host=127.0.0.1
rabbitmq_port=5672
rabbitmq_user=mythic_user
rabbitmq_password=$rmq_pw
rabbitmq_vhost=mythic_vhost
jwt_secret=$jwt
mythic_admin_user=mythic_admin
mythic_admin_password=$admin_pw
default_operation_name=Operation Chimera
debug_level=warning
allowed_ip_blocks=0.0.0.0/0
hasura_port=8080
hasura_host=127.0.0.1
hasura_admin_secret=$hasura_secret
nginx_port=7443
EOF
  chmod 600 "$envfile"; chown "$MYTHIC_USER:$MYTHIC_USER" "$envfile"
  ln -sf "$envfile" "$MYTHIC_HOME/.env" 2>/dev/null || true
  info "Creating Postgres user/database (fails loudly, not silently)..."
  sudo -u postgres psql -v ON_ERROR_STOP=1 -c "CREATE USER mythic_user WITH PASSWORD '$pg_pw';" 2>&1 | grep -v "already exists" || true
  sudo -u postgres psql -v ON_ERROR_STOP=1 -c "CREATE DATABASE mythic_db OWNER mythic_user;" 2>&1 | grep -v "already exists" || true
  PGPASSWORD="$pg_pw" psql -h 127.0.0.1 -U mythic_user -d mythic_db -c "SELECT 1;" >/dev/null || \
    die "TCP password login to Postgres as mythic_user failed — check pg_hba.conf host line for 127.0.0.1 (needs md5/scram, not peer/trust-only)"
  info "Creating RabbitMQ user/vhost..."
  rabbitmqctl add_user mythic_user "$rmq_pw" 2>&1 | grep -v "already exists" || true
  rabbitmqctl add_vhost mythic_vhost 2>&1 | grep -v "already exists" || true
  rabbitmqctl set_permissions -p mythic_vhost mythic_user ".*" ".*" ".*" || die "rabbitmqctl set_permissions failed"
  # Docker's default_user gets administrator (hence management API access).
  # A rabbitmqctl-created user gets NO tags, so mythic_server's management
  # API polling (15672) returns 401 "Not management user" every 10s.
  # management tag is the minimum that fixes it.
  rabbitmqctl set_user_tags mythic_user management || die "rabbitmqctl set_user_tags failed"
  echo "=== RECORD THIS ONCE (it is also in $envfile, 0600) ==="
  echo "Mythic admin user: mythic_admin"
  echo "Mythic admin password: $admin_pw"
  echo "Hasura admin secret is in $envfile only (hasura_admin_secret)."
  echo "Postgres/RabbitMQ passwords are in $envfile only."
}

hasura_metadata() {
  need_root
  local envfile="$MYTHIC_BIN/.env"
  [ -f "$envfile" ] || die "no $envfile — run env first"
  [ -x "$MYTHIC_BIN/hasura" ] || die "no Hasura CLI at $MYTHIC_BIN/hasura — run build first (or install the CLI manually)"
  # Safe .env parse (see hasura-wrapper.sh): do NOT shell-source this file.
  while IFS= read -r _line || [ -n "$_line" ]; do
    case "$_line" in ''|'#'*) continue ;; *=*) export "${_line%%=*}=${_line#*=}" ;; esac
  done < "$envfile"
  wait_tcp 8080 30 || die "Hasura did not come up on 8080 — start it before applying metadata"
  info "Applying Hasura metadata (upstream cli-migrations-v2 equivalent)..."
  # Upstream hasura-docker/metadata/ is NOT a CLI project: its config.yaml
  # lives INSIDE metadata/ and says metadata_directory: metadata, so
  # --project hasura-docker fails with "cannot find [config.yaml]".
  # Build a real CLI project in /tmp: metadata files copied in, plus a
  # root config.yaml. The wrapper must export MYTHIC_ACTIONS_URL_BASE
  # (Hasura server env) or apply fails for every action handler.
  local proj="/tmp/atma-hasura-project"
  rm -rf "$proj"; mkdir -p "$proj/metadata"
  cp -r "$MYTHIC_SRC/hasura-docker/metadata/." "$proj/metadata/"
  rm -f "$proj/metadata/config.yaml"
  cat > "$proj/config.yaml" <<'EOF'
version: 2
endpoint: http://127.0.0.1:8080
metadata_directory: metadata
actions:
  kind: synchronous
  handler_webhook_baseurl: "http://127.0.0.1:17443/api/v1.4"
EOF
  "$MYTHIC_BIN/hasura" metadata apply --endpoint "http://127.0.0.1:8080" --admin-secret "$hasura_admin_secret" --project "$proj" || \
    die "hasura metadata apply failed — check that mythic-hasura was started via hasura-wrapper.sh (MYTHIC_ACTIONS_URL_BASE) and the CLI/server versions match"
  info "Hasura metadata applied."
}

start() {
  need_root
  [ -f "$MYTHIC_BIN/.env" ] || die "no $MYTHIC_BIN/.env — run env first"
  [ -x "$MYTHIC_BIN/mythic_server" ] || die "no mythic_server binary — run build first"
  [ -d "$MYTHIC_BIN/database/migrations" ] || die "no database/migrations beside the binary — run build first"
  [ -f /var/www/mythic-new/index.html ] || die "no React build at /var/www/mythic-new/index.html — run build first"
  cp "$SCRIPT_DIR/systemd/mythic-server.service" /etc/systemd/system/
  cp "$SCRIPT_DIR/systemd/mythic-hasura.service" /etc/systemd/system/
  cp "$SCRIPT_DIR/bin/hasura-wrapper.sh" "$MYTHIC_BIN/hasura-wrapper.sh"; chmod +x "$MYTHIC_BIN/hasura-wrapper.sh"
  cp "$SCRIPT_DIR/nginx/mythic-native.conf" /etc/nginx/sites-available/mythic-native
  ln -sf /etc/nginx/sites-available/mythic-native /etc/nginx/sites-enabled/mythic-native
  mkdir -p /etc/mythic/ssl
  if [ ! -f /etc/mythic/ssl/mythic-cert.crt ]; then
    openssl req -x509 -newkey rsa:2048 -keyout /etc/mythic/ssl/mythic-ssl.key -out /etc/mythic/ssl/mythic-cert.crt -days 365 -nodes -subj "/O=Mythic" 2>/dev/null
    chmod 600 /etc/mythic/ssl/mythic-ssl.key
  fi
  nginx -t || die "nginx config test failed — fix mythic-native.conf before starting"
  # enable --now is a no-op if nginx is already running, so a config
  # added after first boot would never be loaded. Reload explicitly.
  systemctl reload nginx 2>/dev/null || systemctl restart nginx 2>/dev/null || true
  systemctl daemon-reload
  systemctl enable --now postgresql rabbitmq-server
  # Management plugin must be on before mythic_server starts polling 15672.
  if ! rabbitmq-plugins list -e 2>/dev/null | grep -q rabbitmq_management; then
    rabbitmq-plugins enable rabbitmq_management
    chown rabbitmq:rabbitmq /etc/rabbitmq/enabled_plugins 2>/dev/null || true
    chmod 644 /etc/rabbitmq/enabled_plugins 2>/dev/null || true
    systemctl restart rabbitmq-server
    wait_tcp 15672 30 || echo "[!] RabbitMQ management API (15672) did not come up — mythic_server will log polling errors until it does"
  fi
  systemctl enable --now mythic-server mythic-hasura nginx
  info "Waiting for mythic_server /health..."
  wait_tcp 17443 30 || die "mythic_server did not come up on 17443 — check: journalctl -u mythic-server"
  curl -sf "http://127.0.0.1:17443/health" >/dev/null || die "mythic_server /health failed"
  info "mythic_server is healthy. Applying Hasura metadata (critical for the UI)..."
  hasura_metadata || echo "[!] WARNING: Hasura metadata apply failed — the server will log in, but the React UI's GraphQL queries will fail until metadata is applied. Fix and re-run: bash $0 hasura-metadata"
  sleep 2
  "$0" status || true
}

stop() {
  need_root
  systemctl stop mythic-server mythic-hasura nginx 2>/dev/null || true
  echo "Postgres/RabbitMQ left running (they are shared system services). Stop them manually if desired: systemctl stop postgresql rabbitmq-server"
}

status() {
  for u in postgresql rabbitmq-server mythic-server mythic-hasura nginx; do
    systemctl is-active "$u" 2>/dev/null | sed "s/^/$u: /" || echo "$u: unknown (no systemd?)"
  done
  echo "--- ports ---"
  for p in 5432 5672 17443 17444 8080 7443; do
    if tcp_open "$p"; then echo "OPEN 127.0.0.1:$p"; else echo "closed 127.0.0.1:$p"; fi
  done
  echo "--- endpoints ---"
  curl -s -o /dev/null -w "http://127.0.0.1:17443/health -> %{http_code}\n" http://127.0.0.1:17443/health 2>/dev/null || true
  curl -s -o /dev/null -w "http://127.0.0.1:8080/healthz -> %{http_code}\n" http://127.0.0.1:8080/healthz 2>/dev/null || true
  curl -sk -o /dev/null -w "https://127.0.0.1:7443/new/login -> %{http_code}\n" https://127.0.0.1:7443/new/login 2>/dev/null || true
  curl -sk -o /dev/null -w "https://127.0.0.1:7443/auth_services -> %{http_code}\n" https://127.0.0.1:7443/auth_services 2>/dev/null || true
}

logs() {
  journalctl -u mythic-server -u mythic-hasura --no-pager -n "${2:-100}" 2>/dev/null || journalctl -u mythic-server --no-pager -n 100
}

case "${1:-}" in
  check) check ;;
  install) install ;;
  build) build ;;
  env) gen_env ;;
  hasura-metadata) hasura_metadata ;;
  start) start ;;
  stop) stop ;;
  status) status ;;
  logs) logs "$@" ;;
  *) echo "Usage: $0 check|install|build|env|hasura-metadata|start|stop|status|logs"; exit 1 ;;
esac
