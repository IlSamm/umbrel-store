from __future__ import annotations

import base64
import gzip
import hashlib
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

EXPECTED_BUNDLE_SHA256 = "1764fe238c7197691d59a8bb728fce3bcc1961c9f4827f4317b80cb1aa226e68"


def decode_b64gz(source: Path) -> bytes:
    print(f"Decoding asset: {source}", flush=True)
    try:
        encoded = b"".join(source.read_bytes().split())
        raw = base64.b64decode(encoded, validate=False)
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
    raw_zip = base64.b64decode(b"".join(parts), validate=True)
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

    # Start from the last verified professional UI, then add v9 assets at BUILD time.
    (out / "index.html").write_bytes(decode_b64gz(app_root / "ui-v7" / "index.html.b64gz"))
    v7_css = decode_b64gz(app_root / "ui-v7" / "v7.css.b64gz")
    (out / "v7.js").write_bytes(decode_b64gz(app_root / "ui-v7" / "v7.js.b64gz"))

    v9_data = decode_b64gz(app_root / "ui-v9" / "v9-data.js.b64gz")
    v9_js = decode_b64gz(app_root / "ui-v9" / "v9.js.b64gz")
    v9_css_extra = decode_b64gz(app_root / "ui-v9" / "v9-extra.css.b64gz")
    (out / "v9-data.js").write_bytes(v9_data)
    (out / "v9.js").write_bytes(v9_js)
    (out / "v9.css").write_bytes(v7_css + b"\n\n/* Filament Finder 9 */\n" + v9_css_extra)

    # The patch payload itself is gzip+base64 and is decoded/verified only while
    # building the image. Umbrel never has to reconstruct or download UI assets.
    with tempfile.TemporaryDirectory(prefix="ff-v9-patch-") as patch_dir:
        patcher = Path(patch_dir) / "patch_runtime_v9.py"
        patcher.write_bytes(decode_b64gz(app_root / "runtime" / "patch_runtime_v9.py.b64gz"))
        subprocess.run([sys.executable, str(patcher), str(out)], check=True)

    # Stable data.js contains the original families. v9-data extends it to 67,
    # so load the expansion immediately before app.js.
    index_path = out / "index.html"
    index = index_path.read_text(encoding="utf-8")
    if 'src="v9-data.js' not in index:
        marker = '<script src="data.js"></script>'
        if marker not in index:
            raise RuntimeError("data.js script marker missing")
        index = index.replace(marker, marker + '\n<script src="v9-data.js?v=900"></script>', 1)
        index_path.write_text(index, encoding="utf-8")

    # Fail the image build instead of shipping a broken runtime.
    server_text = (out / "server.py").read_text(encoding="utf-8")
    compile(server_text, "server.py", "exec")
    if "APP_VERSION = '9.0.0'" not in server_text or "STATIC_MATERIAL_COUNT = 67" not in server_text:
        raise RuntimeError("v9 backend patch missing")
    if "ThreadingHTTPServer(('0.0.0.0',PORT),Handler).serve_forever()" not in server_text:
        raise RuntimeError("server.py is not configured to listen on 0.0.0.0")

    index = index_path.read_text(encoding="utf-8")
    required = ["v9.css", "v9-data.js", "app.js", "v7.js", "v9.js", 'id="printerBtn"']
    missing = [name for name in required if name not in index]
    if missing:
        raise RuntimeError("v9 index missing runtime assets/hooks: " + ", ".join(missing))
    if b"FF9_DATA_VERSION" not in v9_data or b"FILAMENT_BRANDS" not in v9_data:
        raise RuntimeError("v9 material/brand dataset validation failed")
    if b"FILAMENT_FINDER_VERSION" not in v9_js:
        raise RuntimeError("v9 UI validation failed")

    print(f"Runtime assembled at {out}")
    print(f"Bundle SHA256: {actual}")
    print("Filament Finder 9 build-time validation: OK", flush=True)


if __name__ == "__main__":
    main()
