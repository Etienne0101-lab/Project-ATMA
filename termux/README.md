# Project ATMA on Android via Termux — branch `termux-android`

**This branch is the Android install.** Main stays the Pages console
+ native Linux stack. This branch adds only Termux files, on top of
main — it does not change the console, the gateway, or the Linux
stack.

## One-command install (in Termux on your phone)

```sh
pkg update -y && pkg install -y git
git clone -b termux-android https://github.com/Etienne0101-lab/Project-ATMA.git ~/Project-ATMA
cd ~/Project-ATMA
bash termux/setup.sh
```

`setup.sh` installs git, python, nodejs (Termux packages), then
`pip install openai ollama` (for the edge clients), and prints
the next steps. It installs **no Mythic server, no Ollama model,
no database** — see the honest limits below. It never asks for,
prints, or stores a key in the repo.

## What you can actually do from Termux

| From Termux | How | Works? |
|---|---|---|
| DeepHat chat (Featherless Edge) | `python termux/atma-termux.py chat "Hello!"` with `ATMA_EDGE_KEY` set | Yes — provider runs the model, phone is only a client |
| DeepHat via NVIDIA NIM / Ollama Cloud | Same CLI, `--provider nvidia` / `--provider ollama-cloud` | Yes — same client, different endpoint/key |
| Mythic list / task (chat operator) | `python termux/atma-termux.py mythic-list`, `mythic-task <id> <cmd>` | Yes, **only if** a Mythic server is reachable via your gateway (see below) |
| Run the ATMA gateway in Termux | `node agent/atma-gateway.mjs` | Yes, for forwarding — it still needs a Mythic server somewhere to forward to |
| Run a full Mythic server on the phone | Postgres + RabbitMQ + Go + Hasura + agents | **No, not credibly** — see limits |

## Honest limits — read before expecting a phone server

- **No 7B model on the phone.** A Galaxy S24-class phone cannot
  credibly run DeepHat/DeepHat-V1-7B locally in Termux, and
  Termux has no GPU passthrough for Ollama. DeepHat here is
  **edge only**: Featherless / NVIDIA NIM / Ollama Cloud, exactly
  as in `lab/edge/README.md`.
- **No Mythic server on the phone.** Mythic needs a persistent
  Go server, Postgres, RabbitMQ, and disk, plus agent/C2 services.
  Termux can run some of those pieces individually, but not the
  whole stack reliably, and Android will kill background services
  (battery optimisation, no wakelock by default). Do not present
  Termux as a Mythic host.
- **Mythic from Termux = client to a rented VM.** The pattern
  that works: Mythic runs on a rented cloud VM (provider hardware,
  not your phone, not a host install in the earlier sense), the
  gateway runs there behind Tailscale Serve, and Termux — like
  the Pages console — talks to that gateway with a token + your
  operator JWT. Your phone is the operator terminal, not the server.
- **Background work dies.** If you run the gateway in Termux,
  run `termux-wake-lock` first and keep Termux in the foreground
  or exempt it from battery optimisation, or Android will stop it.
  For anything that must stay up, the gateway belongs on the VM,
  not in Termux.

## Keys — Termux private storage only

Set keys in the Termux session, or in `~/.bashrc` (phone-private,
never committed):

```sh
export ATMA_EDGE_KEY="your-featherless-key"        # Featherless Edge
export ATMA_NVIDIA_KEY="your-nvidia-nim-key"       # optional
export ATMA_OLLAMA_CLOUD_KEY="your-ollama-key"     # optional
export ATMA_GATEWAY_URL="https://your-serve-name.ts.net"
export ATMA_GATEWAY_TOKEN="your-gateway-token"
```

Then:

```sh
python termux/atma-termux.py chat "Explain the http C2 profile"
python termux/atma-termux.py chat --provider nvidia "Hello!"
python termux/atma-termux.py mythic-login   # prompts user/pass, JWT to ~/.atma/ (phone only), logout deletes it
python termux/atma-termux.py mythic-list
python termux/atma-termux.py mythic-task 2 config
```

`mythic-task` asks for confirmation before sending, exactly like
the console's Mythic operator card. The model never sees your
JWT and never runs a task on its own — you type the command.

## Keeping this branch current

This branch was cut from main. To bring in later main changes,
from a machine with git (or Termux itself):

```sh
git fetch origin
git merge origin/main
git push origin termux-android
```

Resolve conflicts in favour of keeping `termux/` intact; do not
merge Termux-only files back into main unless you deliberately
want them there.
