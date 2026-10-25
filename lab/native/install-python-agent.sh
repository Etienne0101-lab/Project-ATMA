#!/usr/bin/env bash
# Project ATMA — install a REAL Python Mythic agent natively, no Docker.
# This is the full infrastructure, not just a definition sync:
#   - the agent service source (Payload_Type/<name>, incl. agent_code,
#     browserscripts, icon, and the builder that assembles payloads)
#   - a venv with mythic-container (+ the agent's own requirements)
#   - rabbitmq_config.json generated from bin/.env (0600, never commit)
#   - a systemd unit that runs `venv/bin/python main.py` with
#     WorkingDirectory = the service dir (builders use relative paths)
# Usage: sudo bash install-python-agent.sh <repo> <payloadtype> [mythic-container-version]
#   repo: GitHub repo under MythicAgents, e.g. Medusa, apfell, nemesis
#   payloadtype: directory under Payload_Type, e.g. medusa, apfell
#   Example: sudo bash install-python-agent.sh Medusa medusa 0.6.14
#   Example: sudo bash install-python-agent.sh apfell apfell 0.6.13
set -euo pipefail
REPO="${1:?repo, e.g. Medusa}"; PT="${2:?payloadtype, e.g. medusa}"; MCVER="${3:-0.6.14}"
MYTHIC_HOME="${MYTHIC_HOME:-/opt/mythic}"
INSTALL_DIR="$MYTHIC_HOME/InstalledServices/$PT"
[ "$(id -u)" = "0" ] || { echo "[-] run with sudo" >&2; exit 1; }
[ -f "$MYTHIC_HOME/bin/.env" ] || { echo "[-] no $MYTHIC_HOME/bin/.env — run atma-native.sh env first" >&2; exit 1; }
declare -A ENV
while IFS= read -r _line || [ -n "$_line" ]; do
  case "$_line" in ''|'#'*) continue ;; *=*) ENV["${_line%%=*}"]="${_line#*=}" ;; esac
done < "$MYTHIC_HOME/bin/.env"
: "${ENV[rabbitmq_password]:?rabbitmq_password missing from bin/.env}"
systemctl stop "mythic-python-agent@$PT" 2>/dev/null || true
echo "[*] Cloning $REPO..."
rm -rf "/tmp/pyagent-$PT-build"
git clone --depth 1 "https://github.com/MythicAgents/$REPO" "/tmp/pyagent-$PT-build"
SRC="/tmp/pyagent-$PT-build/Payload_Type/$PT"
[ -f "$SRC/main.py" ] || { echo "[-] no $SRC/main.py — check repo/payloadtype" >&2; exit 1; }
mkdir -p "$INSTALL_DIR"
cp -r "$SRC/." "$INSTALL_DIR/"
# venv + mythic-container (+ agent requirements if it ships any)
python3 -m venv "$INSTALL_DIR/venv"
"$INSTALL_DIR/venv/bin/pip" install --quiet --upgrade pip
"$INSTALL_DIR/venv/bin/pip" install --quiet "mythic-container==$MCVER"
if [ -f "$INSTALL_DIR/requirements.txt" ]; then
  "$INSTALL_DIR/venv/bin/pip" install --quiet -r "$INSTALL_DIR/requirements.txt" || echo "[!] requirements.txt install had errors — continuing, service sync will report them"
fi
if [ -f "$INSTALL_DIR/.docker/requirements.txt" ]; then
  "$INSTALL_DIR/venv/bin/pip" install --quiet -r "$INSTALL_DIR/.docker/requirements.txt" || echo "[!] .docker/requirements.txt install had errors — continuing"
fi
# Agent-specific imports that are NOT in a requirements file, found by
# scanning the agent_functions imports (2026-10-24, operator-approved
# native compose). PyPI 'donut' is the WRONG package (dotfiles tool);
# the Mythic one is the Donut shellcode C extension, built from source.
# Apollo: mslex + impacket + toml + donut-shellcode.
# Athena: donut-shellcode only (pefile/py2app come from requirements.txt).
if [ "$PT" = "apollo" ]; then
  "$INSTALL_DIR/venv/bin/pip" install --quiet mslex impacket toml
  "$INSTALL_DIR/venv/bin/pip" install "git+https://github.com/MEhrn00/donut.git@v2.0.0"
fi
if [ "$PT" = "athena" ]; then
  "$INSTALL_DIR/venv/bin/pip" install "git+https://github.com/MEhrn00/donut.git@v2.0.0"
fi
# rabbitmq_config.json — mythic_container reads this file from cwd.
# Placeholders in the shipped file (mythic_password etc.) are replaced
# with the real values from bin/.env, exactly as mythic-cli does in Docker.
cat > "$INSTALL_DIR/rabbitmq_config.json" <<EOF
{
    "username": "mythic_user",
    "password": "${ENV[rabbitmq_password]}",
    "virtual_host": "mythic_vhost",
    "host": "127.0.0.1",
    "name": "hostname",
    "rabbitmq_password": "${ENV[rabbitmq_password]}",
    "rabbitmq_host": "127.0.0.1",
    "mythic_server_host": "127.0.0.1",
    "mythic_server_port": 17443,
    "mythic_server_grpc_port": 17444,
    "container_files_path": "$INSTALL_DIR/"
}
EOF
chmod 600 "$INSTALL_DIR/rabbitmq_config.json"
# proxy for any build-time downloads (unauthenticated only, never a password)
for _v in HTTP_PROXY HTTPS_PROXY http_proxy https_proxy NO_PROXY no_proxy; do
  if [ -n "${!_v:-}" ] && [[ "${!_v}" != *"@"* ]]; then
    printf '%s=%s\n' "$_v" "${!_v}" >> "$INSTALL_DIR/agent.env" 2>/dev/null || true
  fi
done
[ -f "$INSTALL_DIR/agent.env" ] && chmod 600 "$INSTALL_DIR/agent.env" || true
chown mythic:mythic "$MYTHIC_HOME/InstalledServices"; chmod 750 "$MYTHIC_HOME/InstalledServices"
chown -R mythic:mythic "$INSTALL_DIR"
cp "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/systemd/mythic-python-agent@.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now "mythic-python-agent@$PT"
sleep 8
systemctl is-active "mythic-python-agent@$PT"
echo "[*] $PT installed (service + agent_code + builder + venv)."
echo "[*] Verify in GraphQL: { payloadtype { name } } — should include $PT"
echo "[*] Payload building for $PT runs in this service (see its builder.py);"
echo "    for macOS-target agents (medusa, apfell) the built payload still"
echo "    needs a macOS host to RUN — the service/build side is native Linux."
