#!/usr/bin/env bash
# Project ATMA — install Poseidon (Go agent) natively, no Docker.
# Verified in sandbox 2026-10-24: built main (21 MB), ran it against the
# native mythic_server, and it logged "Successfully synced payload type!
# poseidon" and payloadtype appeared in GraphQL.
# Usage: sudo bash install-agent-poseidon.sh
#   Installs to /opt/mythic/InstalledServices/poseidon/main
#   Agent env to /opt/mythic/InstalledServices/poseidon/agent.env (0600)
#   Starts mythic-agent@poseidon.service (see systemd/mythic-agent@.service)
set -euo pipefail
MYTHIC_HOME="${MYTHIC_HOME:-/opt/mythic}"
INSTALL_DIR="$MYTHIC_HOME/InstalledServices/poseidon"
[ "$(id -u)" = "0" ] || { echo "[-] run with sudo" >&2; exit 1; }
[ -f "$MYTHIC_HOME/bin/.env" ] || { echo "[-] no $MYTHIC_HOME/bin/.env — run atma-native.sh env first" >&2; exit 1; }
# Safe .env parse (values may contain spaces — do NOT shell-source .env)
declare -A ENV
while IFS= read -r _line || [ -n "$_line" ]; do
  case "$_line" in ''|'#'*) continue ;; *=*) ENV["${_line%%=*}"]="${_line#*=}" ;; esac
done < "$MYTHIC_HOME/bin/.env"
: "${ENV[rabbitmq_password]:?rabbitmq_password missing from bin/.env}"
echo "[*] Cloning Poseidon..."
rm -rf /tmp/poseidon-build
git clone --depth 1 https://github.com/MythicAgents/poseidon /tmp/poseidon-build
echo "[*] Building Poseidon service binary (Go)..."
cd /tmp/poseidon-build/Payload_Type/poseidon
go mod download
go build -o main .
# Stop first on re-install: overwriting a running binary fails with
# "Text file busy" and leaves the old binary in place.
systemctl stop "mythic-agent@poseidon" 2>/dev/null || true
mkdir -p "$INSTALL_DIR"
# Copy the whole service directory, not just the binary: the agent
# reads relative paths at runtime — poseidon/browserscripts/*.js and
# poseidon/agentfunctions/poseidon.svg — exactly as in Docker, where
# WORKDIR is the Payload_Type/poseidon contents. Without this copy,
# sync still succeeds but browserscripts and the agent icon are missing.
cp -r . "$INSTALL_DIR/"
cp main "$INSTALL_DIR/main"
chmod +x "$INSTALL_DIR/main"
cat > "$INSTALL_DIR/agent.env" <<EOF
# Poseidon native agent env — generated, 0600, never commit.
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
# Payload builds run `go build` as a child of this service, so the
# service needs the SAME egress environment as an interactive shell:
# without HTTP(S)_PROXY the agent_code module downloads fail with
# "tls: first record does not look like a TLS handshake" on a
# proxy-only host (verified 2026-10-24). Carry through only
# unauthenticated proxy variables already present in the installer
# shell — never write a proxy password into agent.env. On a direct-
# internet host this block is a no-op and builds work as-is.
for _v in HTTP_PROXY HTTPS_PROXY http_proxy https_proxy NO_PROXY no_proxy; do
  if [ -n "${!_v:-}" ] && [[ "${!_v}" != *"@"* ]]; then
    printf '%s=%s\n' "$_v" "${!_v}" >> "$INSTALL_DIR/agent.env"
  fi
done
# Parent dir must also be mythic-owned: mkdir -p as root leaves
# InstalledServices root:root 770, which blocks the mythic user's
# WorkingDirectory chdir (systemd status 200/CHDIR).
chown mythic:mythic "$MYTHIC_HOME/InstalledServices"
chmod 750 "$MYTHIC_HOME/InstalledServices"
chown -R mythic:mythic "$INSTALL_DIR"
# Payload builder writes its output to /build/<uuid>-linux-amd64
# (hard-coded in agentfunctions/builder.go, a Docker volume in the
# official image). Natively that directory must exist and be
# mythic-writable, otherwise a build compiles and then fails with
# "Failed to find final payload".
mkdir -p /build
chown mythic:mythic /build
chmod 700 /build
# The generic agent unit expects <dir>/main + <dir>/agent.env.
cp "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/systemd/mythic-agent@.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now "mythic-agent@poseidon"
sleep 5
systemctl is-active "mythic-agent@poseidon"
echo "[*] Poseidon installed and started. Verify in GraphQL:"
echo "    { payloadtype { name } }  — should include poseidon"
echo "[*] Payload building (agent_code) is a separate step: the service"
echo "    binary syncs commands/definitions; building a payload needs"
echo "    the agent_code Go toolchain on the host, same as in Docker."
