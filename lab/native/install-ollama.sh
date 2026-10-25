#!/usr/bin/env bash
# Project ATMA — same-host Ollama module, part 1 of 2.
#
# What this does, on the SAME host that already runs the native
# Mythic stack (lab/native/atma-native.sh):
#   - installs Ollama if missing (official installer, creates the
#     `ollama` user + the vendor `ollama.service` unit),
#   - pins it to localhost only: OLLAMA_HOST=127.0.0.1:11434,
#     models in /opt/ollama/models (NOT under /usr/share, so a
#     reinstall does not wipe the model),
#   - enables + starts it, waits for /api/tags,
#   - pulls DeepHat/DeepHat-V1-7B unless --no-pull is given.
#
# What it does NOT do (on purpose):
#   - It never exposes 11434 to the network. Ollama has no auth by
#     default, so the only public door is the ATMA gateway
#     (agent/atma-gateway.mjs, /ollama/* with x-atma-token), run
#     behind Tailscale Serve. See install-gateway.sh, part 2.
#   - It never pulls a model on a host that cannot hold it: it
#     checks free disk (>= 10 GB for DeepHat) and total RAM
#     (>= 8 GB, 16 GB recommended) first, and refuses to pull —
#     with a plain message — instead of starting a download that
#     fills the disk or an inference run that OOMs. Use --no-pull
#     on a small host to install the service and pull later, or
#     --force-pull to override the guard knowingly.
#   - It does not touch any Mythic service. Mythic (17443/7443)
#     and Ollama (11434) are separate services on one host; the
#     gateway is the only thing that talks to both.
#
# Usage (from a repo checkout, as root):
#   bash lab/native/install-ollama.sh
#   bash lab/native/install-ollama.sh --no-pull
#   bash lab/native/install-ollama.sh --model DeepHat/DeepHat-V1-7B --test-chat
#   bash lab/native/install-ollama.sh --models-dir /data/ollama/models
set -euo pipefail
MODEL="${DEEPHAT_MODEL:-DeepHat/DeepHat-V1-7B}"
MODELS_DIR="/opt/ollama/models"
NO_PULL=0; FORCE_PULL=0; TEST_CHAT=0
while [ $# -gt 0 ]; do
  case "$1" in
    --model) MODEL="$2"; shift 2;;
    --models-dir) MODELS_DIR="$2"; shift 2;;
    --no-pull) NO_PULL=1; shift;;
    --force-pull) FORCE_PULL=1; shift;;
    --test-chat) TEST_CHAT=1; shift;;
    *) echo "Unknown arg: $1 (see header)"; exit 2;;
  esac
done
[ "$(id -u)" = "0" ] || { echo "Run as root (systemd + /opt)."; exit 1; }
command -v curl >/dev/null || apt-get install -y curl

if ! command -v ollama >/dev/null; then
  echo "[*] Installing Ollama (official installer)..."
  curl -fsSL https://ollama.com/install.sh | sh
else
  echo "[*] Ollama already installed: $(ollama --version 2>&1 | head -1)"
fi
mkdir -p "$MODELS_DIR"
# Official installer creates user `ollama`; fall back to root only if it did not.
if id ollama >/dev/null 2>&1; then chown ollama:ollama "$MODELS_DIR"; chmod 750 "$MODELS_DIR"; fi

# Localhost-only override — do NOT edit the vendor unit, it gets
# replaced on upgrade. This drop-in survives upgrades.
mkdir -p /etc/systemd/system/ollama.service.d
cat > /etc/systemd/system/ollama.service.d/atma-localhost.conf <<EOF
# ATMA same-host module: Ollama is localhost-only. Public access
# goes through the ATMA gateway (x-atma-token) over Tailscale Serve.
[Service]
Environment="OLLAMA_HOST=127.0.0.1:11434"
Environment="OLLAMA_MODELS=$MODELS_DIR"
Environment="OLLAMA_KEEP_ALIVE=30m"
EOF
systemctl daemon-reload
systemctl enable --now ollama.service

echo "[*] Waiting for Ollama on 127.0.0.1:11434..."
for i in $(seq 1 30); do
  curl -fsS http://127.0.0.1:11434/api/tags >/dev/null 2>&1 && break
  sleep 2
  [ "$i" = "30" ] && { echo "[-] Ollama did not answer on 11434. Check: systemctl status ollama journalctl -u ollama"; exit 1; }
done
echo "[+] Ollama up. Models dir: $MODELS_DIR"

if [ "$NO_PULL" = "1" ]; then
  echo "[*] --no-pull: service installed, model NOT pulled. Pull later with: ollama pull $MODEL"
  exit 0
fi
# Resource guard before a multi-GB pull.
FREE_GB=$(df --output=avail -BG "$MODELS_DIR" | tail -1 | tr -dc '0-9')
RAM_GB=$(free -g | awk '/^Mem:/{print $2}')
echo "[*] Host: ${FREE_GB} GB free on models disk, ${RAM_GB} GB RAM."
if [ "$FORCE_PULL" != "1" ]; then
  [ "$FREE_GB" -ge 10 ] || { echo "[-] Refusing to pull $MODEL: need >= 10 GB free, have ${FREE_GB} GB. Free space or re-run with --force-pull / --models-dir on a bigger disk."; exit 1; }
  [ "$RAM_GB" -ge 8 ] || { echo "[-] Refusing to pull $MODEL: need >= 8 GB RAM (16 GB recommended), have ${RAM_GB} GB. This host cannot run a 7B model credibly — use a GPU/cloud pod instead (see README §23) or --force-pull."; exit 1; }
fi
echo "[*] Pulling $MODEL (several GB — the long step)..."
ollama pull "$MODEL"
ollama list
if [ "$TEST_CHAT" = "1" ]; then
  echo "[*] One short test chat (loads the model — needs the RAM above)..."
  curl -fsS http://127.0.0.1:11434/api/chat -d "{\"model\":\"$MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"Reply with exactly: same-host ok\"}],\"stream\":false}" | head -c 500; echo
fi
echo "[+] Same-host Ollama ready. Next: bash lab/native/install-gateway.sh"
echo "    Then in the Pages console: DeepHat AI view -> Backend: Gateway,"
echo "    Gateway URL = your Tailscale Serve URL, token = ATMA_GATEWAY_TOKEN."
