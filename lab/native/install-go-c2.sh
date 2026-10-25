#!/usr/bin/env bash
# Project ATMA — install a REAL Go Mythic C2 profile natively.
#   - service source (C2_Profiles/<name>, incl. c2functions)
#   - Go binary built from main.go (GOTMPDIR/GOCACHE off /tmp)
#   - agent.env with RabbitMQ/Mythic settings from bin/.env (0600)
#   - generic mythic-agent@.service unit (main + agent.env in dir)
# Usage: sudo bash install-go-c2.sh <repo> <c2name>
#   Example: sudo bash install-go-c2.sh httpx httpx
set -euo pipefail
REPO="${1:?repo, e.g. httpx}"; C2="${2:?c2name, e.g. httpx}"
MYTHIC_HOME="${MYTHIC_HOME:-/opt/mythic}"
INSTALL_DIR="$MYTHIC_HOME/InstalledServices/$C2"
[ "$(id -u)" = "0" ] || { echo "[-] run with sudo" >&2; exit 1; }
[ -f "$MYTHIC_HOME/bin/.env" ] || { echo "[-] no $MYTHIC_HOME/bin/.env — run atma-native.sh env first" >&2; exit 1; }
declare -A ENV
while IFS= read -r _line || [ -n "$_line" ]; do
  case "$_line" in ''|'#'*) continue ;; *=*) ENV["${_line%%=*}"]="${_line#*=}" ;; esac
done < "$MYTHIC_HOME/bin/.env"
: "${ENV[rabbitmq_password]:?rabbitmq_password missing from bin/.env}"
systemctl stop "mythic-agent@$C2" 2>/dev/null || true
echo "[*] Cloning $REPO C2..."
rm -rf "/tmp/goc2-$C2-build"
git clone --depth 1 "https://github.com/MythicC2Profiles/$REPO" "/tmp/goc2-$C2-build"
SRC="/tmp/goc2-$C2-build/C2_Profiles/$C2"
[ -f "$SRC/main.go" ] || { echo "[-] no $SRC/main.go" >&2; exit 1; }
mkdir -p "$INSTALL_DIR" /opt/mythic/go/tmp /opt/mythic/go/cache
cp -r "$SRC/." "$INSTALL_DIR/"
echo "[*] Building Go C2 binary..."
cd "$INSTALL_DIR"
GOTOOLCHAIN=auto GOTMPDIR=/opt/mythic/go/tmp GOCACHE=/opt/mythic/go/cache go mod download
GOTOOLCHAIN=auto GOTMPDIR=/opt/mythic/go/tmp GOCACHE=/opt/mythic/go/cache go build -o main .
chmod +x "$INSTALL_DIR/main"
cat > "$INSTALL_DIR/agent.env" <<EOF
DEBUG_LEVEL=warning
RABBITMQ_HOST=127.0.0.1
RABBITMQ_PORT=5672
RABBITMQ_USER=mythic_user
RABBITMQ_PASSWORD=${ENV[rabbitmq_password]}
RABBITMQ_VHOST=mythic_vhost
MYTHIC_SERVER_HOST=127.0.0.1
MYTHIC_SERVER_GRPC_PORT=17444
EOF
chmod 600 "$INSTALL_DIR/agent.env"
for _v in HTTP_PROXY HTTPS_PROXY http_proxy https_proxy NO_PROXY no_proxy; do
  if [ -n "${!_v:-}" ] && [[ "${!_v}" != *"@"* ]]; then
    printf '%s=%s\n' "$_v" "${!_v}" >> "$INSTALL_DIR/agent.env"
  fi
done
chown mythic:mythic "$MYTHIC_HOME/InstalledServices"; chmod 750 "$MYTHIC_HOME/InstalledServices"
chown -R mythic:mythic "$INSTALL_DIR"
systemctl daemon-reload
systemctl enable --now "mythic-agent@$C2"
sleep 8
systemctl is-active "mythic-agent@$C2"
echo "[*] C2 $C2 installed (Go service)."
echo "[*] Verify in GraphQL: { c2profile { name } } — should include $C2"
