#!/usr/bin/env bash
# Hasura wrapper for the native stack. systemd does not reliably expand
# ${VAR} from EnvironmentFile inside Environment= lines, so this shell
# wrapper sources bin/.env and constructs the Hasura URLs itself.
# Usage: ExecStart=/opt/mythic/bin/hasura-wrapper.sh
set -euo pipefail
ENVFILE="${HASURA_ENVFILE:-/opt/mythic/bin/.env}"
[ -f "$ENVFILE" ] || { echo "[-] no .env at $ENVFILE" >&2; exit 1; }
# Do NOT source this file with shell `.`: it contains
# default_operation_name=Operation Chimera (unquoted space, valid for
# viper/systemd, fatal for shell sourcing — "Chimera: command not found").
# Parse KEY=VALUE lines literally instead.
while IFS= read -r _line || [ -n "$_line" ]; do
  case "$_line" in ''|'#'*) continue ;; *=*) export "${_line%%=*}=${_line#*=}" ;; esac
done < "$ENVFILE"
: "${postgres_password:?postgres_password missing from .env}"
: "${hasura_admin_secret:?hasura_admin_secret missing from .env}"
export HASURA_GRAPHQL_DATABASE_URL="postgres://mythic_user:${postgres_password}@127.0.0.1:5432/mythic_db"
export HASURA_GRAPHQL_METADATA_DATABASE_URL="postgres://mythic_user:${postgres_password}@127.0.0.1:5432/mythic_db"
export HASURA_GRAPHQL_ENABLE_CONSOLE=true
export HASURA_GRAPHQL_DEV_MODE=false
export HASURA_GRAPHQL_ADMIN_SECRET="$hasura_admin_secret"
export HASURA_GRAPHQL_INSECURE_SKIP_TLS_VERIFY=true
export HASURA_GRAPHQL_SERVER_PORT=8080
export HASURA_GRAPHQL_LIVE_QUERIES_MULTIPLEXED_REFETCH_INTERVAL=1000
export HASURA_GRAPHQL_AUTH_HOOK=http://127.0.0.1:17443/graphql/webhook
export HASURA_GRAPHQL_AUTH_HOOK_MODE=POST
# Actions in upstream metadata use {{MYTHIC_ACTIONS_URL_BASE}} in handlers.
# Without this env var, metadata apply fails with "Value for environment
# variables not found: MYTHIC_ACTIONS_URL_BASE" for every action.
export MYTHIC_ACTIONS_URL_BASE=http://127.0.0.1:17443/api/v1.4
# Metadata is NOT auto-applied by the plain server binary (upstream uses
# cli-migrations-v2 for that). It is applied separately by:
#   bash atma-native.sh hasura-metadata
exec /opt/mythic/bin/graphql-engine serve
