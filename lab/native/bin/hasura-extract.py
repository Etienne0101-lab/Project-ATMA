#!/usr/bin/env python3
"""Extract the Hasura graphql-engine binary from the Docker Hub image
without a Docker daemon.

Why this exists: Hasura v2 GitHub releases contain ONLY the CLI
(cli-hasura-*). The server binary is distributed only as a Docker image
(hasura/graphql-engine). A native (no-Docker) install therefore cannot
`curl` the binary — it must pull the image layers from the registry
and extract the binary. This script does exactly that, with no Docker,
no crane, no skopeo: anonymous Docker Hub token, manifest list ->
arch manifest -> layer blobs, streaming tar extraction of the single
graphql-engine file.

Usage: python3 hasura-extract.py --tag v2.46.0 --arch amd64 --out /opt/mythic/bin/graphql-engine
"""
import argparse, io, json, sys, tarfile, urllib.request

REGISTRY = "https://registry-1.docker.io"
TOKEN_URL = "https://auth.docker.io/token?service=registry.docker.io&scope=repository:hasura/graphql-engine:pull"

def get_token():
    with urllib.request.urlopen(TOKEN_URL) as r:
        return json.load(r)["token"]

def api(token, path, accept=None):
    req = urllib.request.Request(REGISTRY + path, headers={"Authorization": f"Bearer {token}"})
    if accept:
        req.add_header("Accept", accept)
    with urllib.request.urlopen(req) as r:
        return r.read()

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tag", default="v2.46.0")
    ap.add_argument("--arch", default="amd64")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    token = get_token()
    accept = "application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json, application/vnd.docker.distribution.manifest.list.v2+json"
    manifest_raw = api(token, f"/v2/hasura/graphql-engine/manifests/{args.tag}", accept)
    manifest = json.loads(manifest_raw)
    if manifest.get("mediaType", "").endswith("manifest.list.v2+json") or "manifests" in manifest:
        digest = None
        for m in manifest["manifests"]:
            p = m.get("platform", {})
            if p.get("architecture") == args.arch and p.get("os") == "linux":
                digest = m["digest"]; break
        if not digest:
            print(f"[-] no {args.arch} manifest in list", file=sys.stderr); return 1
        manifest = json.loads(api(token, f"/v2/hasura/graphql-engine/manifests/{digest}", accept))
    layers = [l["digest"] for l in manifest.get("layers", [])]
    print(f"[*] {len(layers)} layers, searching for graphql-engine binary...", file=sys.stderr)
    for digest in layers:
        # Stream the layer blob; urllib follows the registry redirect.
        req = urllib.request.Request(REGISTRY + f"/v2/hasura/graphql-engine/blobs/{digest}",
                                     headers={"Authorization": f"Bearer {token}"})
        with urllib.request.urlopen(req) as resp:
            tf = tarfile.open(fileobj=resp, mode="r|gz")
            for member in tf:
                name = member.name.lstrip("./")
                if name.endswith("/graphql-engine") or name == "graphql-engine":
                    print(f"[*] found {member.name} ({member.size} bytes) in layer {digest[:19]}", file=sys.stderr)
                    with open(args.out, "wb") as out:
                        f = tf.extractfile(member)
                        while True:
                            chunk = f.read(1024 * 1024)
                            if not chunk: break
                            out.write(chunk)
                    import os; os.chmod(args.out, 0o755)
                    print(f"[*] wrote {args.out}", file=sys.stderr)
                    return 0
    print("[-] graphql-engine binary not found in any layer", file=sys.stderr)
    return 1

if __name__ == "__main__":
    raise SystemExit(main())
