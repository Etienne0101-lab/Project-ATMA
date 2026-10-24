#!/usr/bin/env bash
# Project ATMA — Mythic natively as system services, no Docker daemon.
# Lab-only, authorised use. See README.md in this folder before running.
# Usage: sudo bash atma-native.sh check|install|build|env|start|stop|status|logs
# This script is a prototype: it installs packages, builds mythic_server
# from upstream, and wires systemd units. It has NOT been verified end
# to end on a live host yet — see README.md "What is NOT yet verified".
set -euo pipefail

MYTHIC_HOME="${MYTHIC_HOME:-/opt/mythic}"
MYTHIC_USER="${MYTHIC_USER:-mythic}"
MYTHIC_REPO="${MYTHIC_REPO:-https://github.com/its-a-feature/Mythic}"
MYTHIC_SRC="$MYTHIC_HOME/src"
HASURA_VERSION="${HASURA_VERSION:-v2.46.0}"
HASURA_URL="https://github.com/hasura/graphql-engine/releases/download/${HASURA_VERSION}/graphql-engine"

die() { echo "[-] $*" >&2; exit 1; }
info() { echo "[*] $*"; }
need_root() { [ "$(id -u)" = "0" ] || die "run with sudo"; }

check() {
  echo "--- atma-native check ---"
  for cmd in go psql rabbitmq-server nginx openssl curl git node npm; do
    if command -v "$cmd" >/dev/null 2>&1; then echo "OK   $cmd: $(command -v "$cmd")"; else echo "MISS $cmd"; fi
  done
  echo "--- ports (should be free before first start, except postgres/rabbitmq if already installed) ---"
  for p in 5432 5672 17443 17444 8080 7443; do
    if (exec 3<>"/dev/tcp/127.0.0.1/$p") 2>/dev/null; then echo "OPEN 127.0.0.1:$p"; else echo "free  127.0.0.1:$p"; fi
  done
  echo "--- note ---"
  echo "Go 1.25+ is required for mythic-docker/src (go.mod says go 1.25.1)."
  echo "Postgres 15+ and RabbitMQ 3.x are the versions Mythic's Docker images are based on; newer majors may need a metadata/config check."
}

install() {
  need_root
  info "Installing system packages (Ubuntu/Debian)..."
  apt-get update
  apt-get install -y postgresql rabbitmq-server nginx openssl curl git nodejs npm golang-go || \
    apt-get install -y postgresql rabbitmq-server nginx openssl curl git nodejs npm golang
  id "$MYTHIC_USER" >/dev/null 2>&1 || useradd --system --home-dir "$MYTHIC_HOME" --shell /usr/sbin/nologin "$MYTHIC_USER"
  mkdir -p "$MYTHIC_HOME" "$MYTHIC_HOME"/{src,bin,files,logs} /var/lib/mythic/server /etc/mythic
  chown -R "$MYTHIC_USER:$MYTHIC_USER" "$MYTHIC_HOME" /var/lib/mythic
  chmod 750 "$MYTHIC_HOME" /var/lib/mythic
  info "Packages installed. Next: build, then env, then start."
}

build() {
  need_root
  info "Fetching upstream Mythic source (sparse: server, CLI config, React UI, Hasura metadata)..."
  if [ ! -d "$MYTHIC_SRC/.git" ]; then
    git clone --depth 1 --filter=blob:none --sparse "$MYTHIC_REPO" "$MYTHIC_SRC"
  fi
  cd "$MYTHIC_SRC"
  git sparse-checkout set mythic-docker Mythic_CLI MythicReactUI hasura-docker nginx-docker postgres-docker rabbitmq-docker 2>/dev/null || true
  info "Building mythic_server (Go, CGO_ENABLED=0, as in mythic-docker/Makefile)..."
  cd "$MYTHIC_SRC/mythic-docker/src"
  GOEXPERIMENT=jsonv2 CGO_ENABLED=0 go build -o "$MYTHIC_HOME/bin/mythic_server" -tags="nomsgpack" . || \
    die "mythic_server build failed — check Go version (need 1.25+) and network for go modules"
  cp -r "$MYTHIC_SRC/mythic-docker/src/database" "$MYTHIC_HOME/bin/database" 2>/dev/null || true
  # mythic_server reads database/migrations relative to its working directory;
  # the systemd unit sets WorkingDirectory to the bin dir, so migrations must sit beside it.
  mkdir -p "$MYTHIC_HOME/bin/database"
  cp -r "$MYTHIC_SRC/mythic-docker/src/database/migrations" "$MYTHIC_HOME/bin/database/" 2>/dev/null || true
  info "Downloading Hasura graphql-engine $HASURA_VERSION (verify against hasura-docker/Dockerfile if metadata import fails)..."
  curl -fsSL -o "$MYTHIC_HOME/bin/graphql-engine" "$HASURA_URL" || \
    die "Hasura download failed — check HASURA_VERSION and network"
  chmod +x "$MYTHIC_HOME/bin/graphql-engine" "$MYTHIC_HOME/bin/mythic_server"
  info "Building React UI (MythicReactUI) — this takes a while and needs network for npm..."
  cd "$MYTHIC_SRC/MythicReactUI"
  npm ci --no-audit --no-fund 2>/dev/null || npm install --no-audit --no-fund
  npm run build 2>/dev/null || echo "[!] React build step name may differ — check MythicReactUI/package.json scripts and build manually"
  mkdir -p /var/www/mythic-new
  cp -r build/* /var/www/mythic-new/ 2>/dev/null || cp -r "$MYTHIC_SRC/MythicReactUI/build"/* /var/www/mythic-new/ 2>/dev/null || echo "[!] React build output not found in build/ — check the UI build step"
  chown -R "$MYTHIC_USER:$MYTHIC_USER" "$MYTHIC_HOME/bin" "$MYTHIC_HOME/src"
  info "Build done. Next: env (generates /opt/mythic/.env, 0600)."
}

gen_env() {
  need_root
  local envfile="$MYTHIC_HOME/.env"
  if [ -f "$envfile" ]; then
    echo "[!] $envfile already exists — refusing to overwrite. Delete it deliberately if you want a fresh one."
    exit 1
  fi
  local pg_pw rmq_pw jwt admin_pw hasura_secret
  pg_pw="$(openssl rand -hex 32)"; rmq_pw="$(openssl rand -hex 32)"
  jwt="$(openssl rand -hex 32)"; admin_pw="$(openssl rand -hex 24)"
  hasura_secret="$(openssl rand -hex 32)"
  cat > "$envfile" <<EOF
# ATMA native Mythic — generated $(date -u +%F). KEEP THIS FILE 0600, NEVER COMMIT IT.
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
  # Postgres + RabbitMQ accounts from the same passwords (idempotent-ish: re-running will fail on existing user, which is safe to ignore manually)
  sudo -u postgres psql -c "CREATE USER mythic_user WITH PASSWORD '$pg_pw';" 2>/dev/null || true
  sudo -u postgres psql -c "CREATE DATABASE mythic_db OWNER mythic_user;" 2>/dev/null || true
  rabbitmqctl add_user mythic_user "$rmq_pw" 2>/dev/null || true
  rabbitmqctl add_vhost mythic_vhost 2>/dev/null || true
  rabbitmqctl set_permissions -p mythic_vhost mythic_user ".*" ".*" ".*" 2>/dev/null || true
  echo "=== RECORD THIS ONCE (it is also in $envfile, 0600) ==="
  echo "Mythic admin user: mythic_admin"
  echo "Mythic admin password: $admin_pw"
  echo "Hasura admin secret: $hasura_secret"
  echo "Postgres/RabbitMQ passwords are in $envfile only."
}

start() {
  need_root
  cp "$(dirname "$0")/systemd/mythic-server.service" /etc/systemd/system/ 2>/dev/null || cp ./systemd/mythic-server.service /etc/systemd/system/
  cp "$(dirname "$0")/systemd/mythic-hasura.service" /etc/systemd/system/ 2>/dev/null || cp ./systemd/mythic-hasura.service /etc/systemd/system/
  cp "$(dirname "$0")/nginx/mythic-native.conf" /etc/nginx/sites-available/mythic-native 2>/dev/null || cp ./nginx/mythic-native.conf /etc/nginx/sites-available/mythic-native
  ln -sf /etc/nginx/sites-available/mythic-native /etc/nginx/sites-enabled/mythic-native
  # Self-signed cert for 7443 if none exists (mirrors mythic-cli's generated certs)
  mkdir -p /etc/mythic/ssl
  if [ ! -f /etc/mythic/ssl/mythic-cert.crt ]; then
    openssl req -x509 -newkey rsa:2048 -keyout /etc/mythic/ssl/mythic-ssl.key -out /etc/mythic/ssl/mythic-cert.crt -days 365 -nodes -subj "/O=Mythic" 2>/dev/null
    chmod 600 /etc/mythic/ssl/mythic-ssl.key
  fi
  systemctl daemon-reload
  systemctl enable --now postgresql rabbitmq-server || true
  systemctl enable --now mythic-server mythic-hasura nginx || systemctl enable --now mythic-server.service mythic-hasura.service nginx
  sleep 3
  "$0" status || true
}

stop() {
  need_root
  systemctl stop mythic-server mythic-hasura nginx 2>/dev/null || true
  echo "Postgres/RabbitMQ left running (they are shared system services). Stop them manually if desired: systemctl stop postgresql rabbitmq-server"
}

status() {
  for u in postgresql rabbitmq-server mythic-server mythic-hasura nginx; do
    systemctl is-active "$u" 2>/dev/null | sed "s/^/$u: /"
  done
  echo "--- ports ---"
  for p in 5432 5672 17443 17444 8080 7443; do
    if (exec 3<>"/dev/tcp/127.0.0.1/$p") 2>/dev/null; then echo "OPEN 127.0.0.1:$p"; else echo "closed 127.0.0.1:$p"; fi
  done
  echo "--- mythic_server health ---"
  curl -sk -o /dev/null -w "https://127.0.0.1:7443/ -> %{http_code}\n" https://127.0.0.1:7443/ 2>/dev/null || true
  curl -s -o /dev/null -w "http://127.0.0.1:17443/health -> %{http_code}\n" http://127.0.0.1:17443/health 2>/dev/null || true
}

logs() {
  journalctl -u mythic-server -u mythic-hasura --no-pager -n "${2:-100}" 2>/dev/null || journalctl -u mythic-server --no-pager -n 100
}

case "${1:-}" in
  check) check ;;
  install) install ;;
  build) build ;;
  env) gen_env ;;
  start) start ;;
  stop) stop ;;
  status) status ;;
  logs) logs "$@" ;;
  *) echo "Usage: $0 check|install|build|env|start|stop|status|logs"; exit 1 ;;
esac
