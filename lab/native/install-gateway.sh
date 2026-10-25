#!/usr/bin/env bash
# Project ATMA — same-host Ollama module, part 2 of 2: gateway service.
#
# Installs the companion gateway as a systemd service on the same
# host as Mythic + Ollama, so one host serves the whole platform:
#   Pages console (HTTPS, public) --Tailscale Serve--> gateway :8787
#     -> Mythic https://127.0.0.1:7443  (/mythic/*)
#     -> Ollama  http://127.0.0.1:11434  (/ollama/*)
# The gateway binds localhost only (see atma-gateway.mjs). The only
# public door is Tailscale Serve on the host, and the only key to
# it is ATMA_GATEWAY_TOKEN, which the browser sends as x-atma-token.
#
# Secrets: this script GENERATES /opt/atma/atma-gateway.env on the
# host (0600, root). It never prints the token after generation,
# never writes it to the repo, and never commits it. If the env
# file already exists, it is left untouched — rotate by editing it
# and restarting the service.
#
# Usage (from a repo checkout, as root):
#   bash lab/native/install-gateway.sh
#   bash lab/native/install-gateway.sh --repo-dir /path/to/Project-ATMA
#   bash lab/native/install-gateway.sh --serve   # also run `tailscale serve`
set -euo pipefail
REPO_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
SERVE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --repo-dir) REPO_DIR="$2"; shift 2;;
    --serve) SERVE=1; shift;;
    *) echo "Unknown arg: $1"; exit 2;;
  esac
done
[ "$(id -u)" = "0" ] || { echo "Run as root."; exit 1; }
command -v node >/dev/null || { echo "Node is required (mythic stack hosts already have it)."; exit 1; }
[ -f "$REPO_DIR/agent/atma-gateway.mjs" ] || { echo "Gateway source not found in $REPO_DIR/agent/atma-gateway.mjs"; exit 1; }
node --check "$REPO_DIR/agent/atma-gateway.mjs"

mkdir -p /opt/atma
cp "$REPO_DIR/agent/atma-gateway.mjs" /opt/atma/atma-gateway.mjs
cp "$REPO_DIR/lab/native/systemd/atma-gateway.service" /etc/systemd/system/atma-gateway.service
# Node path: the unit uses /usr/bin/node; fix it if node is elsewhere.
NODE_BIN="$(command -v node)"
sed -i "s|ExecStart=/usr/bin/node|ExecStart=$NODE_BIN|" /etc/systemd/system/atma-gateway.service

if [ ! -f /opt/atma/atma-gateway.env ]; then
  TOKEN="$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  cat > /opt/atma/atma-gateway.env <<EOF
# ATMA gateway env — HOST ONLY, never commit. 0600 root.
ATMA_GATEWAY_TOKEN=$TOKEN
MYTHIC_URL=https://127.0.0.1:7443
OLLAMA_URL=http://127.0.0.1:11434
MYTHIC_INSECURE_TLS=1
# GROQ_API_KEY=   # optional, only if you use the Groq chat backend
EOF
  chmod 600 /opt/atma/atma-gateway.env
  echo "[*] Generated ATMA_GATEWAY_TOKEN — it is in /opt/atma/atma-gateway.env (0600)."
  echo "    Copy that token into the Pages console Connect tab (Gateway token field)."
  echo "    It is NOT printed here again and NOT in the repo."
else
  chmod 600 /opt/atma/atma-gateway.env
  echo "[*] /opt/atma/atma-gateway.env already exists — left untouched."
fi

systemctl daemon-reload
systemctl enable --now atma-gateway.service
sleep 2
systemctl is-active --quiet atma-gateway.service || { echo "[-] Gateway service failed. Check: journalctl -u atma-gateway -n 50"; exit 1; }
curl -fsS http://127.0.0.1:8787/gateway/status; echo
echo "[+] Gateway service up on localhost:8787."
if [ "$SERVE" = "1" ]; then
  command -v tailscale >/dev/null || { echo "[-] tailscale not found — install it, then run: tailscale serve --bg --https=443 http://127.0.0.1:8787"; exit 1; }
  tailscale serve --bg --https=443 http://127.0.0.1:8787
  echo "[+] Tailscale Serve on. Use the Serve HTTPS name as the Gateway URL in Connect."
else
  echo "[*] To expose it to your phone (same tailnet only):"
  echo "    tailscale serve --bg --https=443 http://127.0.0.1:8787"
  echo "    Then set that Serve HTTPS name as Gateway URL in the console."
fi
echo "[*] Verify everything with: bash lab/native/check-same-host.sh"
