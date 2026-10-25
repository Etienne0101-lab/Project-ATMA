#!/usr/bin/env bash
# Real (not simulated) Path A test, for a host WITHOUT systemd or for a
# sandbox check. On a normal systemd host, use atma-native.sh start instead.
# This script runs the SAME binaries, SAME .env location, SAME working
# directory and SAME ports as the systemd units — it only replaces the
# process supervisor (systemd) with direct background processes, so a
# sandbox without systemd can still prove the stack actually boots.
# Usage: sudo bash test-real.sh [build|run|test|cleanup]
#   build   — run atma-native.sh build (Go build, Hasura, React UI)
#   run     — start postgres/rabbitmq (via service/init), then
#             mythic_server, hasura (via wrapper), nginx (via config)
#   test    — HTTP checks: /health, /auth login, /new/login, /healthz, /graphql
#   cleanup — stop the background processes started by run
set -euo pipefail
export MYTHIC_HOME="${MYTHIC_HOME:-/opt/mythic}"
SCRIPT_DIR="$(dirname "$(readlink -f "$0")")"
PIDDIR="/tmp/atma-test-pids"; mkdir -p "$PIDDIR"
LOGDIR="/tmp/atma-test-logs"; mkdir -p "$LOGDIR"

tcp_open() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }
wait_tcp() { local i; for i in $(seq 1 "$2"); do tcp_open "$1" && return 0; sleep 2; done; return 1; }

start_system_services() {
  # Postgres: pg_ctlcluster is the Debian way without systemd.
  pg_lsclusters 2>/dev/null || true
  pg_ctlcluster "$(pg_lsclusters --no-header 2>/dev/null | awk '{print $1, $2}' | head -1)" start 2>/dev/null || service postgresql start 2>/dev/null || true
  wait_tcp 5432 30 || { echo "[-] postgres did not come up"; exit 1; }
  # RabbitMQ: start the server daemon directly if service init is unavailable.
  if ! tcp_open 5672; then
    service rabbitmq-server start 2>/dev/null || rabbitmq-server -detached 2>/dev/null || true
  fi
  wait_tcp 5672 30 || { echo "[-] rabbitmq did not come up"; exit 1; }
  echo "[*] postgres + rabbitmq up"
}

run_stack() {
  [ -f "$MYTHIC_HOME/bin/.env" ] || { echo "[-] no $MYTHIC_HOME/bin/.env — run: sudo bash atma-native.sh env (after starting postgres/rabbitmq)"; exit 1; }
  [ -x "$MYTHIC_HOME/bin/mythic_server" ] || { echo "[-] no mythic_server — run test-real.sh build first"; exit 1; }
  start_system_services
  # mythic_server: WorkingDirectory MUST be bin (migrations + .env + static).
  cd "$MYTHIC_HOME/bin"
  set -a; . "$MYTHIC_HOME/bin/.env"; set +a
  nohup ./mythic_server > "$LOGDIR/mythic_server.log" 2>&1 &
  echo $! > "$PIDDIR/mythic_server.pid"
  wait_tcp 17443 30 || { echo "[-] mythic_server did not come up"; tail -50 "$LOGDIR/mythic_server.log"; exit 1; }
  # Hasura via the same wrapper the systemd unit uses.
  HASURA_ENVFILE="$MYTHIC_HOME/bin/.env" nohup "$MYTHIC_HOME/bin/hasura-wrapper.sh" > "$LOGDIR/hasura.log" 2>&1 &
  echo $! > "$PIDDIR/hasura.pid"
  wait_tcp 8080 30 || { echo "[-] hasura did not come up"; tail -50 "$LOGDIR/hasura.log"; exit 1; }
  # nginx with the same config file the systemd host uses.
  cp "$SCRIPT_DIR/nginx/mythic-native.conf" /etc/nginx/sites-available/mythic-native
  ln -sf /etc/nginx/sites-available/mythic-native /etc/nginx/sites-enabled/mythic-native
  mkdir -p /etc/mythic/ssl
  [ -f /etc/mythic/ssl/mythic-cert.crt ] || openssl req -x509 -newkey rsa:2048 -keyout /etc/mythic/ssl/mythic-ssl.key -out /etc/mythic/ssl/mythic-cert.crt -days 365 -nodes -subj "/O=Mythic" 2>/dev/null
  chmod 600 /etc/mythic/ssl/mythic-ssl.key 2>/dev/null || true
  nginx -t || { echo "[-] nginx -t failed"; exit 1; }
  nginx 2>/dev/null || nginx -s reload 2>/dev/null || true
  wait_tcp 7443 15 || { echo "[-] nginx did not come up on 7443"; exit 1; }
  echo "[*] stack up: mythic_server 17443, hasura 8080, nginx 7443"
}

run_tests() {
  local fail=0
  check() { # check <name> <curl args...>
    local name="$1"; shift
    if curl -s -o /tmp/atma-test-out.txt -w "%{http_code}" "$@" | grep -qE "^(200|302|301)$"; then
      echo "PASS $name ($(curl -s -o /dev/null -w '%{http_code}' "$@"))"
    else
      echo "FAIL $name ($(curl -s -o /dev/null -w '%{http_code}' "$@" 2>/dev/null || echo 'no response'))"
      fail=1
    fi
  }
  echo "--- endpoint checks ---"
  check "mythic_server /health" http://127.0.0.1:17443/health
  check "hasura /healthz" http://127.0.0.1:8080/healthz
  check "nginx /new/login" -k https://127.0.0.1:7443/new/login
  check "nginx / -> /new/login redirect" -k https://127.0.0.1:7443/
  # Login: POST /auth via nginx (upstream route is /auth on mythic_server).
  # Credentials come from bin/.env, never printed here.
  set -a; . "$MYTHIC_HOME/bin/.env"; set +a
  local code
  code=$(curl -sk -o /tmp/atma-login.json -w "%{http_code}" -X POST https://127.0.0.1:7443/auth \
    -H 'Content-Type: application/json' \
    -d "{\"username\":\"$mythic_admin_user\",\"password\":\"$mythic_admin_password\"}" || echo "000")
  if [ "$code" = "200" ] && grep -q "access_token" /tmp/atma-login.json 2>/dev/null; then
    echo "PASS login via nginx /auth (200, access_token present)"
  else
    echo "FAIL login via nginx /auth (HTTP $code)"; head -c 500 /tmp/atma-login.json 2>/dev/null; echo; fail=1
  fi
  # Hasura metadata apply via the production script (which builds a real
  # CLI project from upstream metadata — see atma-native.sh hasura-metadata).
  if bash "$SCRIPT_DIR/atma-native.sh" hasura-metadata >/tmp/atma-hasura-meta.log 2>&1; then
    echo "PASS hasura metadata apply"
  else
    echo "FAIL hasura metadata apply (see /tmp/atma-hasura-meta.log)"; tail -20 /tmp/atma-hasura-meta.log; fail=1
  fi
  # GraphQL via nginx, if login gave a token and metadata applied.
  if [ -f /tmp/atma-login.json ] && grep -q access_token /tmp/atma-login.json 2>/dev/null; then
    local token
    token=$(python3 -c "import json; print(json.load(open('/tmp/atma-login.json')).get('access_token',''))" 2>/dev/null || echo "")
    if [ -n "$token" ]; then
      code=$(curl -sk -o /tmp/atma-gql.json -w "%{http_code}" https://127.0.0.1:7443/graphql/ \
        -H 'Content-Type: application/json' -H "Authorization: Bearer $token" \
        -d '{"query":"{ operator { username } }"}' || echo "000")
      echo "GraphQL via nginx /graphql/ -> HTTP $code (body head:)"; head -c 300 /tmp/atma-gql.json 2>/dev/null; echo
    fi
  fi
  [ "$fail" = "0" ] && echo "ALL CHECKS PASSED" || echo "SOME CHECKS FAILED (see above)"
  return "$fail"
}

cleanup() {
  for p in mythic_server hasura; do
    [ -f "$PIDDIR/$p.pid" ] && kill "$(cat "$PIDDIR/$p.pid")" 2>/dev/null || true
  done
  nginx -s stop 2>/dev/null || true
  pkill -f mythic_server 2>/dev/null || true
  pkill -f graphql-engine 2>/dev/null || true
  echo "[*] test processes stopped (postgres/rabbitmq left running)"
}

case "${1:-}" in
  build) bash "$SCRIPT_DIR/atma-native.sh" build ;;
  run) run_stack ;;
  test) run_tests ;;
  cleanup) cleanup ;;
  *) echo "Usage: $0 build|run|test|cleanup"; exit 1 ;;
esac
