# Athena WinExe from Linux — brainstorm and build record

## The limit that was actually there
- Athena's Mythic builder never builds `Agent.sln`. That sln fails with
  a missing `Agent.Crypto` reference because `AthenaCore` starts with
  no command/profile/crypto references. The builder adds them per
  selected command (`dotnet add AthenaCore reference <cmd>/<cmd>.csproj`),
  plus one profile and one crypto project, then `dotnet build
  Agent.Models`, then `dotnet publish AthenaCore -r win-x64`.
- Apollo is a different problem: monolithic, net451 (.NET Framework).
  Linux dotnet 8 restores it but cannot compile net451 without
  reference assemblies or Mono.

## Options ranked (2026-10-24 brainstorm)
1. Athena modular publish, standalone first — DONE, see
   `athena-build-win.sh`. Dotnet publishes a Windows RID from Linux;
   the binary need not run on Linux.
2. Apollo on Linux via `Microsoft.NETFramework.ReferenceAssemblies.net451`
   (conditional on non-Windows hosts), building only `Apollo.csproj`,
   not the whole sln; fallback Mono + msbuild.
3. Windows build farm (GitHub Actions windows-latest) as a guaranteed
   fallback — slower, external, removes all cross-compilation doubt.
4. Apollo net8 fork — long-term, cleanest, biggest. Do after 1 and 2.
Not recommended: Wine for compilation, or fixing the whole Athena sln
(which fights the builder's design).

## What athena-build-win.sh does (builder order)
1. Gather Files — copy agent_code to a temp dir
2. Configure C2 — Http: Base.txt -> HttpProfile.cs, callback_host
   (no port) / callback_port / get_uri / post_uri / query substituted
3. Configure Agent — AgentConfig.cs: %UUID%, %PSK%, interval, jitter, killdate
4. Add Tasks — `dotnet add AthenaCore reference` per command, plus
   profile + crypto (Aes if --aes-psk, else None), Roots.xml assembly lines
5. Compile Models DLL — dotnet build Agent.Models
6. Compile — dotnet publish AthenaCore -r win-x64, self-contained,
   single-file, HandlerOS=windows (pulls Agent.Managers.Windows)
7. Zip — publish folder zipped, bare .exe copied out

## Verified run (2026-10-24, Linux, dotnet SDK 8.0.132)
- Commands: shell,ls,ps,config,exit; profile Http; callback
  http://127.0.0.1:18080; uuid 366b1aa2-dcd1-490e-9474-33df1e0ea643
- Output: `athena-win-x64.exe`, 37,571,461 bytes,
  `PE32+ executable (console) x86-64, for MS Windows, 10 sections`
- Zip: single file, AthenaCore.exe, 31 MB compressed
- Bug found on first run and fixed: a relative --output resolved
  inside the temp build dir and was deleted with it. The script now
  resolves --output to an absolute path before cd-ing.
- The exe was NOT executed on Linux (it is a Windows binary) and
  was NOT pushed to the public repo by default — see below.

## What is NOT in the repo, and why
The compiled agent exe itself is reproducible from this script in
~2 minutes and is not committed to the public repo. Publishing a
live post-exploitation agent binary to a public repo is a different
decision from publishing the build script that creates it. If the
operator wants the binary in the repo, say so and it can be added
as a release asset or a separate private store — the script, the
verification, and the exact build parameters are the permanent record.
