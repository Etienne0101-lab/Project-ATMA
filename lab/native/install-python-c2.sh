#!/usr/bin/env bash
# Project ATMA — install a REAL Python Mythic C2 profile natively.
# Same pattern as install-python-agent.sh, for C2_Profiles/<name>:
#   - service source (main.py + profile package + c2_code server.py
#     where present, e.g. tcp/dynamichttp)
#   - venv with mythic-container
#   - rabbitmq_config.json generated from bin/.env (0600)
#   - systemd unit mythic-python-agent@<name> (main.py in service dir)
# Usage: sudo bash install-python-c2.sh <repo> <c2name> [mythic-container-version]
#   Example: sudo bash install-python-c2.sh websocket websocket 0.6.14
set -euo pipefail
REPO="${1:?repo, e.g. websocket}"; C2="${2:?c2name, e.g. websocket}"; MCVER="${3:-0.6.14}"
MYTHIC_HOME="${MYTHIC_HOME:-/opt/mythic}"
INSTALL_DIR="$MYTHIC_HOME/InstalledServices/$C2"
[ "$(id -u)" = "0" ] || { echo "[-] run with sudo" >&2; exit 1; }
[ -f "$MYTHIC_HOME/bin/.env" ] || { echo "[-] no $MYTHIC_HOME/bin/.env — run atma-native.sh env first" >&2; exit 1; }
declare -A ENV
while IFS= read -r _line || [ -n "$_line" ]; do
  case "$_line" in ''|'#'*) continue ;; *=*) ENV["${_line%%=*}"]="${_line#*=}" ;; esac
done < "$MYTHIC_HOME/bin/.env"
: "${ENV[rabbitmq_password]:?rabbitmq_password missing from bin/.env}"
systemctl stop "mythic-python-agent@$C2" 2>/dev/null || true
echo "[*] Cloning $REPO C2..."
rm -rf "/tmp/pyc2-$C2-build"
git clone --depth 1 "https://github.com/MythicC2Profiles/$REPO" "/tmp/pyc2-$C2-build"
SRC="/tmp/pyc2-$C2-build/C2_Profiles/$C2"
[ -f "$SRC/main.py" ] || { echo "[-] no $SRC/main.py" >&2; exit 1; }
mkdir -p "$INSTALL_DIR"
cp -r "$SRC/." "$INSTALL_DIR/"
python3 -m venv "$INSTALL_DIR/venv"
"$INSTALL_DIR/venv/bin/pip" install --quiet --upgrade pip
"$INSTALL_DIR/venv/bin/pip" install --quiet "mythic-container==$MCVER"
if [ -f "$INSTALL_DIR/requirements.txt" ]; then "$INSTALL_DIR/venv/bin/pip" install --quiet -r "$INSTALL_DIR/requirements.txt" || echo "[!] requirements install had errors — continuing"; fi
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
chown mythic:mythic "$MYTHIC_HOME/InstalledServices"; chmod 750 "$MYTHIC_HOME/InstalledServices"
chown -R mythic:mythic "$INSTALL_DIR"
cp "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/systemd/mythic-python-agent@.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now "mythic-python-agent@$C2"
sleep 8
systemctl is-active "mythic-python-agent@$C2"
echo "[*] C2 $C2 installed (service + c2_code where present)."
echo "[*] Verify in GraphQL: { c2profile { name } } — should include $C2"
