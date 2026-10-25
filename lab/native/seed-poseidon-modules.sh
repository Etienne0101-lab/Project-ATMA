#!/usr/bin/env bash
# Project ATMA — seed the Poseidon Go module cache, natively.
# Run after install-agent-poseidon.sh, or any time a payload build
# fails with module-download timeouts. The module cache lives at
# /opt/mythic/go/pkg/mod (the mythic user's Go home) so the Poseidon
# service, running as user mythic, can build payloads from cache
# without downloading through a slow proxy on its first run.
# Usage: sudo bash lab/native/seed-poseidon-modules.sh
# Requires: Poseidon already installed, Go 1.25+ on PATH.
# No credentials are written by this script.
set -euo pipefail
MYTHIC_HOME="${MYTHIC_HOME:-/opt/mythic}"
INSTALL_DIR="$MYTHIC_HOME/InstalledServices/poseidon"
[ "$(id -u)" = "0" ] || { echo "[-] run with sudo" >&2; exit 1; }
[ -d "$INSTALL_DIR/poseidon/agent_code" ] || { echo "[-] no $INSTALL_DIR/poseidon/agent_code — run install-agent-poseidon.sh first" >&2; exit 1; }
mkdir -p "$MYTHIC_HOME/go/cache" "$MYTHIC_HOME/go/tmp" "$MYTHIC_HOME/go/pkg/mod"
chown -R mythic:mythic "$MYTHIC_HOME/go"
echo "[*] Downloading Poseidon agent_code modules into $MYTHIC_HOME/go/pkg/mod ..."
GOPATH="$MYTHIC_HOME/go" GOCACHE="$MYTHIC_HOME/go/cache" GOTMPDIR="$MYTHIC_HOME/go/tmp" \
  go mod download -C "$INSTALL_DIR/poseidon/agent_code"
chown -R mythic:mythic "$MYTHIC_HOME/go"
echo "[*] Seeded: $(du -sh "$MYTHIC_HOME/go/pkg/mod" | cut -f1) in $MYTHIC_HOME/go/pkg/mod"
echo "[*] Restart the Poseidon service so it picks up the cache, if it is running:"
echo "    systemctl restart mythic-agent@poseidon"
