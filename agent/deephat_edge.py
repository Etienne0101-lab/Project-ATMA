#!/usr/bin/env python3
"""Project ATMA — DeepHat via an edge API, no Ollama install.

No Ollama binary, no host, no gateway. The provider runs the
model on its edge/GPU fleet; this client only talks OpenAI-
compatible chat completions to it.

Setup (once, in your shell — never commit the key):
    export DEEPHAT_EDGE_URL="https://api.featherless.ai/v1"
    export DEEPHAT_EDGE_KEY="your-provider-key"
    export DEEPHAT_EDGE_MODEL="DeepHat/DeepHat-V1-7B"
    pip install openai   # or use plain urllib (see --no-sdk)

Usage:
    python agent/deephat_edge.py "Hello!"
    python agent/deephat_edge.py --stream "Explain the http C2 profile"
    python agent/deephat_edge.py --no-sdk "Hello!"

Check the model ID in the provider's catalog before first use.
The key is read from the environment only, never printed.
"""
import argparse
import os
import sys

URL = os.environ.get("DEEPHAT_EDGE_URL", "https://api.featherless.ai/v1")
KEY = os.environ.get("DEEPHAT_EDGE_KEY", "")
MODEL = os.environ.get("DEEPHAT_EDGE_MODEL", "DeepHat/DeepHat-V1-7B")
SYSTEM = "You are DeepHat, a DevSecOps assistant inside Project ATMA. Answer concisely. Use only for systems the user owns or is authorised to test."


def ask_sdk(prompt, stream):
    from openai import OpenAI
    client = OpenAI(base_url=URL, api_key=KEY)
    messages = [{"role": "system", "content": SYSTEM}, {"role": "user", "content": prompt}]
    if stream:
        out = []
        for chunk in client.chat.completions.create(model=MODEL, messages=messages, stream=True):
            tok = chunk.choices[0].delta.content or ""
            print(tok, end="", flush=True)
            out.append(tok)
        print()
        return "".join(out)
    r = client.chat.completions.create(model=MODEL, messages=messages)
    print(r.choices[0].message.content)
    return r.choices[0].message.content


def ask_raw(prompt):
    import json
    import urllib.request
    req = urllib.request.Request(
        URL.rstrip("/") + "/chat/completions",
        data=json.dumps({"model": MODEL, "messages": [{"role": "system", "content": SYSTEM}, {"role": "user", "content": prompt}], "stream": False}).encode(),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {KEY}"},
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        data = json.load(resp)
    print(data["choices"][0]["message"]["content"])
    return data["choices"][0]["message"]["content"]


def main():
    p = argparse.ArgumentParser(description="DeepHat via edge API (no Ollama)")
    p.add_argument("prompt")
    p.add_argument("--stream", action="store_true")
    p.add_argument("--no-sdk", action="store_true", help="Use urllib instead of the OpenAI SDK")
    args = p.parse_args()
    if not KEY:
        print("[-] Set DEEPHAT_EDGE_KEY first (provider API key). Never commit it.", file=sys.stderr)
        return 2
    if args.no_sdk:
        return 0 if ask_raw(args.prompt) else 1
    ask_sdk(args.prompt, args.stream)
    return 0


if __name__ == "__main__":
    sys.exit(main())
