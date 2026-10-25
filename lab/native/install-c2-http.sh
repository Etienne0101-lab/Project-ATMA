#!/usr/bin/env bash
# Project ATMA — install the http C2 profile natively, no Docker.
# Same pattern as install-agent-poseidon.sh, with the extra C2 pieces:
#   - service binary (C2_Profiles/http/main.go) -> InstalledServices/http/main
#   - C2 server binary (http/c2_code) -> http/c2_code/mythic_http_server
#     (ServerBinaryPath in the C2 definition, relative to the service dir)
#   - http/c2_code/config.json with a LAB instance on 127.0.0.1:18080,
#     no SSL, so payloads can use callback_host http://127.0.0.1:18080
#     without needing port 80 (privileged, and already used by nginx's
#     default site) or a certificate.
# Usage: sudo bash install-c2-http.sh
set -euo pipefail
MYTHIC_HOME="${MYTHIC_HOME:-/opt/mythic}"
INSTALL_DIR="$MYTHIC_HOME/InstalledServices/http"
C2_PORT="${C2_PORT:-18080}"
[ "$(id -u)" = "0" ] || { echo "[-] run with sudo" >&2; exit 1; }
[ -f "$MYTHIC_HOME/bin/.env" ] || { echo "[-] no $MYTHIC_HOME/bin/.env — run atma-native.sh env first" >&2; exit 1; }
declare -A ENV
while IFS= read -r _line || [ -n "$_line" ]; do
  case "$_line" in ''|'#'*) continue ;; *=*) ENV["${_line%%=*}"]="${_line#*=}" ;; esac
done < "$MYTHIC_HOME/bin/.env"
: "${ENV[rabbitmq_password]:?rabbitmq_password missing from bin/.env}"
systemctl stop "mythic-agent@http" 2>/dev/null || true
echo "[*] Cloning http C2 profile..."
rm -rf /tmp/http-c2-build
git clone --depth 1 https://github.com/MythicC2Profiles/http /tmp/http-c2-build
echo "[*] Building http C2 service binary (Go)..."
cd /tmp/http-c2-build/C2_Profiles/http
CGO_ENABLED=0 go mod download
CGO_ENABLED=0 go build -o main .
echo "[*] Building http C2 server binary (Go, c2_code)..."
cd http/c2_code
CGO_ENABLED=0 go build -o mythic_http_server .
cd ../..
mkdir -p "$INSTALL_DIR"
# Copy the whole service directory (like Poseidon: relative paths matter),
# then overwrite the two binaries with the freshly built ones.
cp -r . "$INSTALL_DIR/"
cp main "$INSTALL_DIR/main"
cp http/c2_code/mythic_http_server "$INSTALL_DIR/http/c2_code/mythic_http_server"
chmod +x "$INSTALL_DIR/main" "$INSTALL_DIR/http/c2_code/mythic_http_server"
cat > "$INSTALL_DIR/http/c2_code/config.json" <<EOF
{
    "instances": [
        {
            "port": $C2_PORT,
            "key_path": "privkey.pem",
            "cert_path": "fullchain.pem",
            "debug": false,
            "use_ssl": false,
            "bind_ip": "127.0.0.1",
            "ServerHeaders": {
                "Cache-Control": "max-age=0, no-cache",
                "Connection": "keep-alive",
                "Content-Type": "application/javascript; charset=utf-8",
                "Pragma": "no-cache",
                "Server": "NetDNA-cache/2.2"
            },
            "error_file_path": "",
            "error_status_code": 404,
            "payloads": {}
        }
    ]
}
EOF
cat > "$INSTALL_DIR/agent.env" <<EOF
# http C2 native agent env — generated, 0600, never commit.
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
chown mythic:mythic "$MYTHIC_HOME/InstalledServices"
chmod 750 "$MYTHIC_HOME/InstalledServices"
chown -R mythic:mythic "$INSTALL_DIR"
cp "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/systemd/mythic-agent@.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now "mythic-agent@http"
sleep 5
systemctl is-active "mythic-agent@http"
echo "[*] http C2 installed and started on 127.0.0.1:$C2_PORT (no SSL)."
echo "[*] Verify in GraphQL: { c2profile { name } } — should include http"
echo "[*] Payloads must use callback_host http://127.0.0.1:$C2_PORT"
echo "    and callback_port $C2_PORT to match this instance."
