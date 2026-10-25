# Project ATMA — Edge Ollama, no host install

**Constraint, recorded 2026-10-24: Stephen will not install anything
on a host device.** No Ollama binary on his phone, laptop, or Linux
box, no systemd service, no gateway host. This folder is the route
that respects that. The same-host module in `lab/native/` stays in
the repo as an option for other operators — it is NOT Stephen's
route and must not be presented as the only way.

## The edge route that needs zero install

The Pages console already talks to a provider's edge/GPU fleet
directly from the browser (new backend in `docs/deephat.js`,
bundle serverless-7):

1. Create an account with an OpenAI-compatible edge provider that
   lists DeepHat/DeepHat-V1-7B — e.g. Featherless, whose API is
   documented at `https://api.featherless.ai/v1` with
   `/chat/completions` and Bearer auth. Check the model ID in the
   provider's own catalog before first use, and check its pricing
   there too — do not trust a price quoted from memory.
2. Copy the provider API key into the console: DeepHat AI view →
   Backend: **Edge API** → Edge endpoint, Edge API key, Edge model
   (`DeepHat/DeepHat-V1-7B`).
3. Chat. The key lives only in this browser's localStorage and is
   sent only to the endpoint you entered. It is never in the repo,
   never in the bundle, and never sent to any ATMA server (there
   is no ATMA server in this route).
4. Same for the floating bubble — it shares the DeepHat history
   and the backend you chose.

That is the whole install: an account + a key. No device, no VM,
no Tailscale, no gateway.

## If you want your OWN Ollama on the edge (still no host device)

These are provider-managed, deployed from a browser/CLI, and
destroyable when done. They are NOT a host install — the provider
runs the container on its fleet:

- **Fly.io Machines (GPU, scale-to-zero):** `fly.toml` in this
  folder. `ollama/ollama` image, a volume at `/root/.ollama` so
  the model survives scale-to-zero, auto-stop. Caveat, stated
  plainly: Fly has no built-in auth for Ollama, so a public Fly
  URL is an open Ollama unless you put an auth proxy in front of
  it. For browser use, prefer the hosted-API route above, or a
  RunPod pod whose proxy URL you keep private. Do not publish
  an unauthenticated Ollama URL.
- **RunPod pod (GPU, on-demand):** use RunPod's Ollama template,
  a network volume for models, stop the pod when idle. The pod's
  proxy URL is the Ollama URL in the console's Ollama backend.
  Same auth caveat as Fly.
- **RunPod Serverless / Modal / Cloud Run GPU:** Ollama in a
  container that scales to zero. These need container/auth setup
  and have cold starts; they are the cheapest fast option for
  bursty use, but they are NOT a drop-in for the browser's
  Ollama `/api/chat` call — check the provider's request shape
  before choosing one.

## Mythic on the edge — the honest limit

Mythic itself cannot run serverless or on a pure edge function:
it needs a persistent Go server + Postgres + RabbitMQ + disk.
The edge equivalent that still involves **no device of yours**
is a rented cloud VM (Hetzner/Vultr/DO hourly, or a RunPod pod):
the provider owns the hardware, you rent it, you run the
`lab/native/` stack on it, and you destroy it when done. That is
a cloud instance, not a host install — but it IS a server you
rent, with a bill and a token to protect, and it is a different
decision from DeepHat-on-edge, which needs no server at all.
Do not claim Mythic runs on serverless edge. The Pages console
works with a rented Mythic VM the same way it works with a
gateway host: via the Live Mythic tab and a token, never by
exposing Mythic publicly.
