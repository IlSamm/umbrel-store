from __future__ import annotations

import base64
import gzip
import hashlib
import shutil
import sys
import tempfile
import zipfile
from pathlib import Path

EXPECTED_BUNDLE_SHA256 = "1764fe238c7197691d59a8bb728fce3bcc1961c9f4827f4317b80cb1aa226e68"


def decode_b64gz(source: Path) -> bytes:
    print(f"Decoding asset: {source}", flush=True)
    try:
        encoded = source.read_bytes()
        raw = base64.b64decode(encoded, validate=True)
        output = gzip.decompress(raw)
    except Exception as exc:
        raise RuntimeError(f"Failed to decode {source}: {exc}") from exc
    if not output:
        raise RuntimeError(f"Decoded asset is empty: {source}")
    print(f"Decoded OK: {source} -> {len(output)} bytes", flush=True)
    return output


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: build_runtime.py <app-store-root> <output-dir>")

    root = Path(sys.argv[1]).resolve()
    out = Path(sys.argv[2]).resolve()
    app_root = root / "ilsamm-filament-finder"

    parts = [(app_root / "bundle" / f"app.b64.{i:02d}").read_bytes() for i in range(6)]
    encoded_bundle = b"".join(parts)
    raw_zip = base64.b64decode(encoded_bundle, validate=True)
    actual = hashlib.sha256(raw_zip).hexdigest()
    if actual != EXPECTED_BUNDLE_SHA256:
        raise RuntimeError(f"Bundle SHA256 mismatch: {actual}")

    with tempfile.TemporaryDirectory(prefix="ff-build-") as temp_dir:
        temp = Path(temp_dir)
        archive = temp / "app.zip"
        archive.write_bytes(raw_zip)
        with zipfile.ZipFile(archive) as zf:
            zf.extractall(temp)

        source = temp / "Filament_Finder_Studio"
        if not (source / "server.py").is_file():
            raise RuntimeError("server.py missing from verified bundle")

        if out.exists():
            shutil.rmtree(out)
        shutil.copytree(source, out)

    # Recovery 8.0.2 deliberately uses the last verified professional UI (v7).
    # The v8 HTML archive in the store is corrupt and previously crashed startup.
    overlays = {
        "materials-v5-data.js": app_root / "ui-v5" / "materials-v5-data.js.b64gz",
        "techsheet-v51-data.js": app_root / "ui-v51" / "techsheet-v51-data.js.b64gz",
        "index.html": app_root / "ui-v7" / "index.html.b64gz",
        "v7.css": app_root / "ui-v7" / "v7.css.b64gz",
        "v7.js": app_root / "ui-v7" / "v7.js.b64gz",
    }

    for destination, source in overlays.items():
        (out / destination).write_bytes(decode_b64gz(source))

    # app.js from the stable backend expects #printerBtn. v7 originally omitted it,
    # so keep a hidden compatibility element without changing the visible design.
    index_path = out / "index.html"
    index = index_path.read_text(encoding="utf-8")
    if 'id="printerBtn"' not in index:
        marker = '<div class="app-shell" id="app">'
        hook = '<button id="printerBtn" type="button" hidden aria-hidden="true" tabindex="-1"></button>'
        if marker not in index:
            raise RuntimeError("Cannot insert printerBtn compatibility hook")
        index = index.replace(marker, marker + hook, 1)
        index_path.write_text(index, encoding="utf-8")
        print("Inserted printerBtn compatibility hook", flush=True)

    server = (out / "server.py").read_text(encoding="utf-8")
    if "ThreadingHTTPServer(('0.0.0.0',PORT),Handler).serve_forever()" not in server:
        raise RuntimeError("server.py is not configured to listen on 0.0.0.0")

    index = index_path.read_text(encoding="utf-8")
    required = ["v7.css", "materials-v5-data.js", "techsheet-v51-data.js", "app.js", "v7.js", 'id="printerBtn"']
    missing = [name for name in required if name not in index]
    if missing:
        raise RuntimeError("Recovery index missing runtime assets/hooks: " + ", ".join(missing))

    print(f"Runtime assembled at {out}")
    print(f"Bundle SHA256: {actual}")
    print("UI recovery source: v7 + compatibility hook", flush=True)


if __name__ == "__main__":
    main()
