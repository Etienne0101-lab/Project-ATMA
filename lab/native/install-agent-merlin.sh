#!/usr/bin/env bash
# Project ATMA — install Merlin (Go agent) natively, no Docker.
# Full infrastructure: service binary (container/main.go) + agent_code
# (agent/) + commands + merlin.svg, with two native adaptations:
#   - WorkingDirectory is .../merlin/container, because the service
#     loads its icon from ../merlin.svg relative to cwd.
#   - The payload builder hard-codes /Mythic/agent (a Docker path).
#     Natively, /Mythic is a symlink to the install dir, so
#     /Mythic/agent resolves to .../merlin/agent.
#   - Go build temp/cache are kept off /tmp (tmpfs, 512 MB in the
#     sandbox) via GOTMPDIR/GOCACHE under /opt/mythic/go.
# Usage: sudo bash install-agent-merlin.sh
set -euo pipefail
MYTHIC_HOME="${MYTHIC_HOME:-/opt/mythic}"
INSTALL_DIR="$MYTHIC_HOME/InstalledServices/merlin"
[ "$(id -u)" = "0" ] || { echo "[-] run with sudo" >&2; exit 1; }
[ -f "$MYTHIC_HOME/bin/.env" ] || { echo "[-] no $MYTHIC_HOME/bin/.env — run atma-native.sh env first" >&2; exit 1; }
declare -A ENV
while IFS= read -r _line || [ -n "$_line" ]; do
  case "$_line" in ''|'#'*) continue ;; *=*) ENV["${_line%%=*}"]="${_line#*=}" ;; esac
done < "$MYTHIC_HOME/bin/.env"
: "${ENV[rabbitmq_password]:?rabbitmq_password missing from bin/.env}"
systemctl stop "mythic-agent@merlin" 2>/dev/null || true
# Note: mythic-agent@.service expects <dir>/main + <dir>/agent.env.
# Merlin's unit is separate (see systemd/mythic-merlin.service) because
# its working directory is the container/ subdirectory.
systemctl stop mythic-merlin 2>/dev/null || true
echo "[*] Cloning merlin..."
rm -rf /tmp/merlin-build
git clone --depth 1 https://github.com/MythicAgents/merlin /tmp/merlin-build
mkdir -p "$INSTALL_DIR" /opt/mythic/go/tmp /opt/mythic/go/cache
cp -r /tmp/merlin-build/Payload_Type/merlin/. "$INSTALL_DIR/"
echo "[*] Building Merlin container binary (Go, toolchain auto)..."
cd "$INSTALL_DIR/container"
GOTOOLCHAIN=auto GOTMPDIR=/opt/mythic/go/tmp GOCACHE=/opt/mythic/go/cache go mod download
GOTOOLCHAIN=auto GOTMPDIR=/opt/mythic/go/tmp GOCACHE=/opt/mythic/go/cache go build -o main .
chmod +x "$INSTALL_DIR/container/main"
cat > "$INSTALL_DIR/container/agent.env" <<EOF
# Merlin native agent env — generated, 0600, never commit.
DEBUG_LEVEL=warning
RABBITMQ_HOST=127.0.0.1
RABBITMQ_PORT=5672
RABBITMQ_USER=mythic_user
RABBITMQ_PASSWORD=${ENV[rabbitmq_password]}
RABBITMQ_VHOST=mythic_vhost
MYTHIC_SERVER_HOST=127.0.0.1
MYTHIC_SERVER_GRPC_PORT=17444
EOF
chmod 600 "$INSTALL_DIR/container/agent.env"
for _v in HTTP_PROXY HTTPS_PROXY http_proxy https_proxy NO_PROXY no_proxy; do
  if [ -n "${!_v:-}" ] && [[ "${!_v}" != *"@"* ]]; then
    printf '%s=%s\n' "$_v" "${!_v}" >> "$INSTALL_DIR/container/agent.env"
  fi
done
# /Mythic/agent hard-coded in the builder (Docker path). /Mythic is
# a directory of per-agent symlinks (not a single symlink), so other
# agents that expect /Mythic/<name>/... (e.g. Athena) can coexist.
mkdir -p /Mythic
ln -sfn "$INSTALL_DIR/agent" /Mythic/agent
ln -sfn "$INSTALL_DIR" /Mythic/merlin
chown mythic:mythic "$MYTHIC_HOME/InstalledServices"; chmod 750 "$MYTHIC_HOME/InstalledServices"
chown -R mythic:mythic "$INSTALL_DIR"
cp "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/systemd/mythic-merlin.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now mythic-merlin
sleep 8
systemctl is-active mythic-merlin
echo "[*] Merlin installed (service + agent_code + builder)."
echo "[*] Verify in GraphQL: { payloadtype { name } } — should include merlin"
