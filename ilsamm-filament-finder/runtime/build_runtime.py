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

    # Keep the verified 9.x runtime as the compatibility/data engine.
    (out / "index.html").write_bytes(decode_b64gz(app_root / "ui-v7" / "index.html.b64gz"))
    v7_css = decode_b64gz(app_root / "ui-v7" / "v7.css.b64gz")
    (out / "v7.js").write_bytes(decode_b64gz(app_root / "ui-v7" / "v7.js.b64gz"))

    v9_data = decode_b64gz(app_root / "ui-v9" / "v9-data.js.b64gz")
    v9_js = decode_b64gz(app_root / "ui-v9" / "v9.js.b64gz")
    v9_css_extra = decode_b64gz(app_root / "ui-v9" / "v9-extra.css.b64gz")
    (out / "v9-data.js").write_bytes(v9_data)
    (out / "v9.js").write_bytes(v9_js)
    (out / "v9.css").write_bytes(v7_css + b"\n\n/* Filament Finder 9 */\n" + v9_css_extra)

    v91_css_source = app_root / "ui-v91" / "mobile-fixes.css"
    v91_js_source = app_root / "ui-v91" / "mobile-fixes.js"
    if not v91_css_source.is_file() or not v91_js_source.is_file():
        raise RuntimeError("Filament Finder 9.1 compatibility assets are missing")
    v91_css = v91_css_source.read_bytes()
    v91_js = v91_js_source.read_bytes()
    (out / "v91.css").write_bytes(v91_css)
    (out / "v91.js").write_bytes(v91_js)

    # v10 is a new visible frontend, stored as normal readable sources.
    v10_css_source = app_root / "ui-v10" / "app.css"
    v10_js_source = app_root / "ui-v10" / "app.js"
    if not v10_css_source.is_file() or not v10_js_source.is_file():
        raise RuntimeError("Filament Finder 10 frontend assets are missing")
    v10_css = v10_css_source.read_bytes()
    v10_js = v10_js_source.read_bytes()
    (out / "v10.css").write_bytes(v10_css)
    (out / "v10.js").write_bytes(v10_js)

    # Apply the verified backend/data expansion from v9.
    with tempfile.TemporaryDirectory(prefix="ff-v9-patch-") as patch_dir:
        patcher = Path(patch_dir) / "patch_runtime_v9.py"
        patcher.write_bytes(decode_b64gz(app_root / "runtime" / "patch_runtime_v9.py.b64gz"))
        subprocess.run([sys.executable, str(patcher), str(out)], check=True)

    # Keep one backend code path and only bump the reported app version.
    server_path = out / "server.py"
    server_text = server_path.read_text(encoding="utf-8")
    if "APP_VERSION = '9.0.0'" not in server_text:
        raise RuntimeError("Cannot bump backend version: v9 APP_VERSION marker missing")
    server_text = server_text.replace("APP_VERSION = '9.0.0'", "APP_VERSION = '10.0.0'", 1)
    server_path.write_text(server_text, encoding="utf-8")

    # Build script order deliberately leaves every legacy script intact first. v10.js
    # then moves the old DOM into a hidden compatibility root and mounts its own UI.
    index_path = out / "index.html"
    index = index_path.read_text(encoding="utf-8")
    if 'src="v9-data.js' not in index:
        marker = '<script src="data.js"></script>'
        if marker not in index:
            raise RuntimeError("data.js script marker missing")
        index = index.replace(marker, marker + '\n<script src="v9-data.js?v=900"></script>', 1)

    if 'href="v91.css' not in index:
        marker = '<link rel="stylesheet" href="v9.css?v=900">'
        if marker not in index:
            raise RuntimeError("v9.css link marker missing")
        index = index.replace(marker, marker + '\n  <link rel="stylesheet" href="v91.css?v=910">', 1)

    if 'src="v91.js' not in index:
        marker = '<script src="v9.js?v=900"></script>'
        if marker not in index:
            raise RuntimeError("v9.js script marker missing")
        index = index.replace(marker, marker + '\n<script src="v91.js?v=910"></script>', 1)

    if 'href="v10.css' not in index:
        marker = '<link rel="stylesheet" href="v91.css?v=910">'
        index = index.replace(marker, marker + '\n  <link rel="stylesheet" href="v10.css?v=1000">', 1)

    if 'src="v10.js' not in index:
        marker = '<script src="v91.js?v=910"></script>'
        index = index.replace(marker, marker + '\n<script src="v10.js?v=1000"></script>', 1)

    index_path.write_text(index, encoding="utf-8")

    # Fail image builds instead of shipping a half-mounted UI.
    server_text = server_path.read_text(encoding="utf-8")
    compile(server_text, "server.py", "exec")
    if "APP_VERSION = '10.0.0'" not in server_text or "STATIC_MATERIAL_COUNT = 67" not in server_text:
        raise RuntimeError("10.0 backend/version patch missing")
    if "ThreadingHTTPServer(('0.0.0.0',PORT),Handler).serve_forever()" not in server_text:
        raise RuntimeError("server.py is not configured to listen on 0.0.0.0")

    index = index_path.read_text(encoding="utf-8")
    required = ["v9.css", "v91.css", "v10.css", "v9-data.js", "app.js", "v7.js", "v9.js", "v91.js", "v10.js", 'id="printerBtn"']
    missing = [name for name in required if name not in index]
    if missing:
        raise RuntimeError("10.0 index missing runtime assets/hooks: " + ", ".join(missing))
    if b"FF9_DATA_VERSION" not in v9_data or b"FILAMENT_BRANDS" not in v9_data:
        raise RuntimeError("v9 material/brand dataset validation failed")
    if b"FILAMENT_FINDER_VERSION" not in v9_js:
        raise RuntimeError("v9 UI compatibility validation failed")
    if b"FILAMENT_FINDER_VERSION='9.1.0'" not in v91_js:
        raise RuntimeError("v9.1 compatibility validation failed")
    if b"FILAMENT_FINDER_VERSION='10.0.0'" not in v10_js or b"ff10-mounted" not in v10_js:
        raise RuntimeError("v10 frontend JS validation failed")
    if b"#ff10-app" not in v10_css or b".ff10-material" not in v10_css:
        raise RuntimeError("v10 frontend CSS validation failed")

    print(f"Runtime assembled at {out}")
    print(f"Bundle SHA256: {actual}")
    print("Filament Finder 10.0 build-time validation: OK", flush=True)


if __name__ == "__main__":
    main()
