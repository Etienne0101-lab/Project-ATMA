#!/usr/bin/env bash
# Project ATMA — same-host module health check. Read-only: it
# starts nothing, pulls nothing, and never prints a token.
# Usage: bash lab/native/check-same-host.sh [gateway-token]
#   Without a token, the /ollama/* proxy check is skipped (it
#   correctly returns 401) and everything else still runs.
set -u
TOKEN="${1:-}"
ok=0; fail=0
check() { # name, command...
  local name="$1"; shift
  if "$@" >/dev/null 2>&1; then echo "[ok] $name"; ok=$((ok+1)); else echo "[FAIL] $name"; fail=$((fail+1)); fi
}
echo "== services =="
for s in postgresql rabbitmq-server mythic-server mythic-hasura nginx ollama atma-gateway; do
  check "service $s active" systemctl is-active --quiet "$s"
done
echo "== endpoints (localhost) =="
check "Mythic /health (via nginx 7443, insecure lab cert)" curl -fsSk https://127.0.0.1:7443/health
check "Ollama /api/tags (11434)" curl -fsS http://127.0.0.1:11434/api/tags
check "Gateway /gateway/status (8787)" curl -fsS http://127.0.0.1:8787/gateway/status
echo "== Ollama models =="
curl -fsS http://127.0.0.1:11434/api/tags 2>/dev/null | head -c 400; echo
echo "== gateway -> Ollama proxy =="
if [ -n "$TOKEN" ]; then
  check "gateway /ollama/api/tags with token" curl -fsS -H "x-atma-token: $TOKEN" http://127.0.0.1:8787/ollama/api/tags
else
  # Expecting 401 here IS the pass: the proxy must refuse without a token.
  if curl -fsS http://127.0.0.1:8787/ollama/api/tags 2>/dev/null | grep -q .; then
    echo "[FAIL] gateway /ollama without token answered (should be 401)"; fail=$((fail+1))
  else
    echo "[ok] gateway /ollama without token refused (401, as designed)"; ok=$((ok+1))
  fi
  echo "[*] Re-run with the token to test the proxied route: bash $0 <token>"
fi
echo "== result: $ok ok, $fail fail =="
[ "$fail" = "0" ]
