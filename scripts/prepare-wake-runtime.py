#!/usr/bin/env python3
"""Prepare pinned Android wake dependencies; no runtime downloads or package manager needed."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tarfile

ROOT = Path(__file__).resolve().parents[1]
MODEL = "sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01"
DEPENDENCIES = {
    "sherpa.aar": {
        "url": "https://github.com/k2-fsa/sherpa-onnx/releases/download/v1.13.8/sherpa-onnx-static-link-onnxruntime-1.13.8.aar",
        "sha256": "b22c3fc1b6a45666d28892bb2f7694beeb77a8362d7ebd77c1a5431ec9435471",
        "size": 38691998,
    },
    "kws-model.tar.bz2": {
        "url": f"https://github.com/k2-fsa/sherpa-onnx/releases/download/kws-models/{MODEL}.tar.bz2",
        "sha256": "f170013b4716e41b62b9bfd809687c207cef798ef9bc6534d524e17af9b6561a",
        "size": 17626723,
    },
}
MEMBERS = {
    "encoder.onnx": ("encoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx", 4807159),
    "decoder.onnx": ("decoder-epoch-12-avg-2-chunk-16-left-64.onnx", 1063189),
    "joiner.onnx": ("joiner-epoch-12-avg-2-chunk-16-left-64.int8.onnx", 163380),
    "tokens.txt": ("tokens.txt", 5006),
    "MODEL-README.md": ("README.md", 726),
}
# Encoded with this model's bpe.model (SentencePiece); checked against its tokens.txt.
KEYWORD = "▁HE Y ▁A R G US @hey_argus\n"


def digest(path):
    with path.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


def verified(path, spec):
    return path.is_file() and path.stat().st_size == spec["size"] and digest(path) == spec["sha256"]


def dependency(cache, name, spec):
    target = cache / name
    if target.exists():
        if not verified(target, spec):
            raise ValueError(f"Cached {name} failed verification. Remove that cache file and retry.")
        return target
    temporary = cache / (name + ".part")
    try:
        subprocess.run(["curl", "--fail", "--location", "--silent", "--show-error",
                        "--proto", "=https", "--proto-redir", "=https", "--connect-timeout", "15",
                        "--max-time", "180", "--max-filesize", str(spec["size"]),
                        "--output", str(temporary), spec["url"]], check=True)
        if not verified(temporary, spec):
            raise ValueError(f"Downloaded {name} failed size/SHA-256 verification.")
        temporary.replace(target)
    finally:
        temporary.unlink(missing_ok=True)
    return target


def model_files(archive):
    # Read only exact regular-file members. No archive paths are used as output paths.
    output = {}
    with tarfile.open(archive, "r:bz2") as source:
        names = source.getnames()
        for destination, (name, size) in MEMBERS.items():
            full_name = f"{MODEL}/{name}"
            if names.count(full_name) != 1:
                raise ValueError(f"Missing or duplicated model member: {name}")
            member = source.getmember(full_name)
            if not member.isfile() or member.size != size:
                raise ValueError(f"Unexpected model member: {name}")
            with source.extractfile(member) as data:
                output[destination] = data.read(size + 1)
            if len(output[destination]) != size:
                raise ValueError(f"Truncated model member: {name}")
    tokens = {line.rsplit(" ", 1)[0] for line in output["tokens.txt"].decode("utf-8").splitlines()}
    if not set(KEYWORD.split()[:-1]).issubset(tokens):
        raise ValueError("Wake phrase contains tokens unavailable in this model.")
    output["keywords.txt"] = KEYWORD.encode("utf-8")
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache-dir", type=Path, default=ROOT / "native-android/.wake-cache")
    args = parser.parse_args()
    args.cache_dir.mkdir(parents=True, exist_ok=True)
    paths = {name: dependency(args.cache_dir, name, spec) for name, spec in DEPENDENCIES.items()}
    output = model_files(paths["kws-model.tar.bz2"])
    assets = ROOT / "native-android/app/src/main/assets/wake-model"
    assets.mkdir(parents=True, exist_ok=True)
    for name, data in output.items():
        (assets / name).write_bytes(data)
    provenance = {"engine": "sherpa-onnx 1.13.8", "model": MODEL, "phrase": "Hey Argus",
                  "dependencies": DEPENDENCIES,
                  "assets": {name: {"size": len(data), "sha256": hashlib.sha256(data).hexdigest()}
                             for name, data in output.items()}}
    (assets / "model-info.json").write_text(json.dumps(provenance, indent=2) + "\n", encoding="utf-8")
    library = ROOT / "native-android/app/libs/sherpa-onnx.aar"
    library.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(paths["sherpa.aar"], library)
    print(f"Verified offline wake runtime and {len(output)} model/support assets ready (ARM64 Android).")


if __name__ == "__main__":
    main()
