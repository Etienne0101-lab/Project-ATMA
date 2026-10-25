#!/usr/bin/env bash
# Project ATMA — install Ollama + DeepHat/DeepHat-V1-7B on YOUR host.
# Run this on a host with real resources for a 7B model: at least
# 8 GB RAM free and ~6 GB disk free for the model alone. Do NOT run
# it expecting a result on the small Muse VM (2 CPU, ~310 MB RAM
# free at build time) — it will not run DeepHat there.
# Steps: install Ollama (official installer), start it, pull the
# model, then verify with the exact call from the operator:
#   python agent/deephat_ollama.py "Hello!"
# No API key is involved: Ollama on localhost needs no key.
set -euo pipefail
MODEL="${DEEPHAT_MODEL:-DeepHat/DeepHat-V1-7B}"
if ! command -v ollama >/dev/null; then
  echo "[*] Installing Ollama (official installer)..."
  curl -fsSL https://ollama.com/install.sh | sh
fi
if ! ollama list >/dev/null 2>&1; then
  echo "[*] Starting Ollama in the background..."
  (ollama serve >/tmp/ollama-serve.log 2>&1 &) ; sleep 3
fi
echo "[*] Pulling $MODEL (several GB — this is the long step)..."
ollama pull "$MODEL"
echo "[*] Models now available:"
ollama list
echo "[*] Verify:"
pip install -q ollama || pip install ollama
python3 agent/deephat_ollama.py "Hello!" || python3 "$(dirname "$0")/../agent/deephat_ollama.py" "Hello!"
echo "[*] Done. Point the ATMA console at this host:"
echo "    - In the console: DeepHat AI view -> Ollama local, URL http://localhost:11434 (same machine)"
echo "    - Or via gateway: run agent/atma-gateway.mjs with OLLAMA_URL=http://127.0.0.1:11434"
echo "      and ATMA_GATEWAY_TOKEN set, expose it with Tailscale Serve, and"
echo "      choose Gateway in the DeepHat panel."
