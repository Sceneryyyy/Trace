#!/usr/bin/env python3
"""Verify and restore the EBU archive for internal testing, without network access."""

import csv
import hashlib
import json
from pathlib import Path
import shutil
import tempfile
import zipfile


def digest(path):
    value = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            value.update(block)
    return value.hexdigest()


def require(condition, message):
    if not condition:
        raise ValueError(message)


def main():
    asset = Path(__file__).resolve().parent
    output = asset.parents[1] / "artifacts" / "ebu-loudness-v5"
    output.mkdir(parents=True, exist_ok=True)
    manifest = json.loads((asset / "archive-manifest.json").read_text())
    archive = output.parent / manifest["archive_name"]

    # Validate all source files before replacing a previously restored archive.
    for part in manifest["parts"]:
        require(Path(part["name"]).name == part["name"], "Invalid part name")
        path = asset / "archive-parts" / part["name"]
        require(path.stat().st_size == part["bytes"], f"Part size mismatch: {path.name}")
        require(digest(path) == part["sha256"], f"Part SHA-256 mismatch: {path.name}")
    for line in (asset / "SHA256SUMS.txt").read_text().splitlines():
        expected, name = line.split("  ", 1)
        require(digest(asset / name) == expected, f"Document SHA-256 mismatch: {name}")

    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=output.parent, delete=False) as target:
            temporary = Path(target.name)
            for part in manifest["parts"]:
                with (asset / "archive-parts" / part["name"]).open("rb") as source:
                    shutil.copyfileobj(source, target, length=1024 * 1024)
        require(temporary.stat().st_size == manifest["archive_bytes"], "Archive size mismatch")
        require(digest(temporary) == manifest["archive_sha256"], "Archive SHA-256 mismatch")
        with zipfile.ZipFile(temporary) as package:
            require(package.testzip() is None, "ZIP CRC mismatch")
            for name in package.namelist():
                destination = (output / name).resolve()
                require(destination.is_relative_to(output.resolve()), f"Unsafe archive path: {name}")
            package.extractall(output)
        with (asset / "WAV_inventory.csv").open(encoding="utf-8-sig", newline="") as source:
            rows = list(csv.DictReader(source))
        require(len(rows) == 70, "Expected 70 inventory entries")
        for row in rows:
            path = output / row["filename"]
            require(path.stat().st_size == int(row["file_bytes"]), f"WAV size mismatch: {path.name}")
            require(digest(path) == row["sha256"], f"WAV SHA-256 mismatch: {path.name}")
        require((output / "readme.txt").read_bytes() == (asset / "readme.txt").read_bytes(),
                "Original readme mismatch")
        temporary.replace(archive)
        temporary = None
        print("Verified 11 archive parts, 5 official PDFs, ZIP CRC, and 70 original WAV files.")
        print(f"Archive: {archive}")
        print(f"WAV directory: {output}")
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
