#!/usr/bin/env python3
"""Project ATMA — Termux client (Android, branch termux-android).

Client only. No server, no model, no database on the phone.
- Chat: edge APIs only (Featherless DeepHat, NVIDIA NIM, Ollama Cloud)
  via OpenAI-compatible /chat/completions. Keys from environment,
  never printed, never written to the repo.
- Mythic: client to YOUR gateway (rented VM + Tailscale Serve).
  mythic-login prompts for operator user/pass, posts to
  /mythic/auth via the gateway, and stores ONLY the JWT in
  ~/.atma/jwt (Termux private storage, 0600). mythic-logout deletes it.
  mythic-task asks for confirmation before sending.

Usage (in Termux, after termux/setup.sh):
    export ATMA_EDGE_KEY=... ATMA_GATEWAY_URL=... ATMA_GATEWAY_TOKEN=...
    python termux/atma-termux.py chat "Hello!"
    python termux/atma-termux.py chat --provider nvidia "Hello!"
    python termux/atma-termux.py mythic-login
    python termux/atma-termux.py mythic-list
    python termux/atma-termux.py mythic-task 2 config
    python termux/atma-termux.py mythic-logout
"""
import argparse
import getpass
import json
import os
import sys
import urllib.request
from pathlib import Path

PROVIDERS = {
    "featherless": ("https://api.featherless.ai/v1", "ATMA_EDGE_KEY", "DeepHat/DeepHat-V1-7B"),
    "nvidia": ("https://integrate.api.nvidia.com/v1", "ATMA_NVIDIA_KEY", "nvidia/nemotron-3.5-lightning-30b-a3b"),
    "ollama-cloud": ("https://api.ollama.com/v1", "ATMA_OLLAMA_CLOUD_KEY", "gpt-oss:20b"),
}
JWT_FILE = Path.home() / ".atma" / "jwt"


def post_json(url, data, headers=None):
    req = urllib.request.Request(url, data=json.dumps(data).encode(),
                                 headers={"Content-Type": "application/json", **(headers or {})})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.load(r)


def cmd_chat(args):
    base, key_env, model = PROVIDERS[args.provider]
    key = os.environ.get(key_env, "")
    if not key:
        print(f"[-] Set {key_env} first (phone-private env, never commit it).", file=sys.stderr)
        return 2
    out = post_json(base.rstrip("/") + "/chat/completions",
                    {"model": args.model or model,
                     "messages": [{"role": "user", "content": args.prompt}],
                     "stream": False, "max_tokens": 1000},
                    {"Authorization": f"Bearer {key}"})
    print(out["choices"][0]["message"]["content"])
    return 0


def gateway():
    url = os.environ.get("ATMA_GATEWAY_URL", "").rstrip("/")
    tok = os.environ.get("ATMA_GATEWAY_TOKEN", "")
    if not url or not tok:
        print("[-] Set ATMA_GATEWAY_URL and ATMA_GATEWAY_TOKEN first.", file=sys.stderr)
        sys.exit(2)
    return url, tok


def cmd_mythic_login(_args):
    url, tok = gateway()
    user = input("Mythic operator username: ").strip()
    pw = getpass.getpass("Mythic operator password: ")
    out = post_json(url + "/mythic/auth", {"username": user, "password": pw},
                    {"x-atma-token": tok})
    jwt = out.get("access_token") or out.get("token")
    if not jwt:
        print("[-] Login failed:", json.dumps(out)[:300], file=sys.stderr)
        return 1
    JWT_FILE.parent.mkdir(parents=True, exist_ok=True)
    JWT_FILE.write_text(jwt)
    os.chmod(JWT_FILE, 0o600)
    print("[+] Logged in. JWT saved to ~/.atma/jwt (0600, phone only). Run mythic-logout to delete it.")
    return 0


def mythic_gql(query):
    url, tok = gateway()
    if not JWT_FILE.exists():
        print("[-] Not logged in. Run mythic-login first.", file=sys.stderr)
        sys.exit(2)
    return post_json(url + "/mythic/graphql", {"query": query},
                     {"x-atma-token": tok, "Authorization": "Bearer " + JWT_FILE.read_text().strip()})


def cmd_mythic_list(_args):
    out = mythic_gql("{ payloadtype { name } c2profile { name } callback { id display_id host user } task { id display_id command } }")
    print(json.dumps(out, indent=2))
    return 0


def cmd_mythic_task(args):
    params = args.params or "{}"
    ok = input(f"Create Mythic task on callback {args.callback_id}: {args.command} {params} ? [y/N] ").strip().lower()
    if ok != "y":
        print("Cancelled.")
        return 0
    out = mythic_gql(f'mutation {{ createTask(callback_id: {args.callback_id}, command: "{args.command}", params: "{params}") {{ id display_id status }} }}')
    print(json.dumps(out, indent=2))
    return 0


def cmd_mythic_logout(_args):
    if JWT_FILE.exists():
        JWT_FILE.unlink()
    print("[+] Logged out. JWT deleted.")
    return 0


def main():
    p = argparse.ArgumentParser(description="ATMA Termux client")
    sub = p.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("chat"); c.add_argument("prompt"); c.add_argument("--provider", choices=PROVIDERS, default="featherless"); c.add_argument("--model"); c.set_defaults(fn=cmd_chat)
    sub.add_parser("mythic-login").set_defaults(fn=cmd_mythic_login)
    sub.add_parser("mythic-list").set_defaults(fn=cmd_mythic_list)
    t = sub.add_parser("mythic-task"); t.add_argument("callback_id", type=int); t.add_argument("command"); t.add_argument("params", nargs="?"); t.set_defaults(fn=cmd_mythic_task)
    sub.add_parser("mythic-logout").set_defaults(fn=cmd_mythic_logout)
    args = p.parse_args()
    return args.fn(args)


if __name__ == "__main__":
    sys.exit(main())
