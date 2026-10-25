#!/usr/bin/env python3
"""Project ATMA — DeepHat via Ollama (Python client).

This is the exact call the operator asked for, plus the useful
wrapping around it (streaming, a CLI, and a health check). It does
NOT embed any key: Ollama on localhost needs no key, and the model
runs on your own host.

The requested snippet, verbatim in shape:
    from ollama import chat
    response = chat(
        model='DeepHat/DeepHat-V1-7B',
        messages=[{'role': 'user', 'content': 'Hello!'}],
    )
    print(response.message.content)

Setup first (on a host that can hold a 7B model — not the 2-CPU
Muse VM, which cannot run it):
    bash server/deephat-ollama-setup.sh   # installs Ollama, pulls the model
    pip install ollama

Usage:
    python agent/deephat_ollama.py "Hello!"
    python agent/deephat_ollama.py --stream "Explain the http C2 profile"
    python agent/deephat_ollama.py --check
    python agent/deephat_ollama.py --interactive
    OLLAMA_HOST=http://192.168.1.10:11434 python agent/deephat_ollama.py "Hi"

DeepHat is Kindo's finetune of Qwen2.5-Coder-7B, Apache-2.0 plus the
DeepHat Extended licence (no military use, no harming minors, no
false information to harm others, etc.). Use it for systems you own
or are authorised to test, as with the rest of ATMA.
"""
import argparse
import os
import sys

MODEL = os.environ.get("DEEPHAT_MODEL", "DeepHat/DeepHat-V1-7B")
SYSTEM = (
    "You are DeepHat, a DevSecOps assistant inside Project ATMA, a Mythic "
    "red-team console. Answer concisely about Mythic, DevOps, and code. "
    "Use only for systems the user owns or is authorised to test. When "
    "asked to change a file, do not claim you changed it — output the "
    "full new file in a block marked ```atma-edit:path/to/file, then "
    "explain the change in plain words."
)


def _client():
    try:
        from ollama import chat, list as ollama_list, ChatResponse  # noqa: F401
    except ImportError:
        print("[-] ollama python package not found. Install: pip install ollama", file=sys.stderr)
        sys.exit(1)
    from ollama import chat, list as ollama_list
    return chat, ollama_list


def check(model):
    chat, ollama_list = _client()
    try:
        models = [m.model for m in ollama_list().models]
    except Exception as e:
        print(f"[-] Cannot reach Ollama (OLLAMA_HOST={os.environ.get('OLLAMA_HOST', 'http://localhost:11434')}): {e}")
        print("    Start Ollama, then: bash server/deephat-ollama-setup.sh")
        return 1
    print(f"[+] Ollama reachable. Models: {', '.join(models) or '(none)'}")
    if model not in models and not any(m.startswith("DeepHat/DeepHat-V1-7B") for m in models):
        print(f"[-] {model} is not pulled yet. Run: ollama pull {model}")
        return 2
    print(f"[+] {model} is available.")
    return 0


def ask(prompt, stream=False, model=MODEL):
    chat, _ = _client()
    messages = [{"role": "system", "content": SYSTEM}, {"role": "user", "content": prompt}]
    if stream:
        out = []
        for part in chat(model=model, messages=messages, stream=True):
            text = part.message.content or ""
            print(text, end="", flush=True)
            out.append(text)
        print()
        return "".join(out)
    response = chat(model=model, messages=messages)
    print(response.message.content)
    return response.message.content


def main():
    p = argparse.ArgumentParser(description="DeepHat via Ollama")
    p.add_argument("prompt", nargs="?", help="Prompt to send")
    p.add_argument("--stream", action="store_true", help="Stream tokens")
    p.add_argument("--check", action="store_true", help="Check Ollama + model availability")
    p.add_argument("--interactive", action="store_true", help="REPL loop")
    p.add_argument("--model", default=MODEL, help=f"Model (default {MODEL})")
    args = p.parse_args()
    if args.check:
        return check(args.model)
    if args.interactive:
        print(f"DeepHat ({args.model}) — type a prompt, empty line to quit.")
        while True:
            try:
                q = input("you> ").strip()
            except EOFError:
                break
            if not q:
                break
            ask(q, stream=True, model=args.model)
        return 0
    if not args.prompt:
        p.print_help()
        return 2
    ask(args.prompt, stream=args.stream, model=args.model)
    return 0


if __name__ == "__main__":
    sys.exit(main())
