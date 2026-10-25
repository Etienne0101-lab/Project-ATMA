#!/usr/bin/env bash
# Project ATMA — Termux setup (branch termux-android).
# Run inside Termux on Android. Installs client tooling ONLY:
# git, python, nodejs, and the openai/ollama Python packages.
# It does NOT install a Mythic server, Postgres, RabbitMQ, or any
# model — a phone cannot credibly run those (see termux/README.md).
# It never asks for, prints, or stores an API key in the repo.
set -euo pipefail
if [ -z "${TERMUX_VERSION:-}" ] && [ ! -d /data/data/com.termux ]; then
  echo "WARNING: this does not look like Termux. Continuing anyway —"
  echo "the pkg steps below are Termux-only and will fail elsewhere."
fi
echo "[*] Updating Termux packages..."
pkg update -y
pkg install -y git python nodejs
echo "[*] Python clients (openai for edge APIs, ollama for local-API shape)..."
pip install --upgrade pip
pip install openai ollama
echo "[*] Checking tools..."
python --version; node --version; git --version
echo
echo "[+] Termux client ready."
echo "    Next, set keys in this session (phone-private, never committed):"
echo "      export ATMA_EDGE_KEY=\"your-featherless-key\""
echo "      export ATMA_GATEWAY_URL=\"https://your-serve-name.ts.net\""
echo "      export ATMA_GATEWAY_TOKEN=\"your-gateway-token\""
echo "    Then:"
echo "      python termux/atma-termux.py chat \"Hello!\""
echo "      python termux/atma-termux.py mythic-list   # after mythic-login"
echo "    If you run a gateway in Termux, run 'termux-wake-lock' first"
echo "    or Android may kill it in the background."
