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
APP_VERSION = "10.3.0"


def decode_b64gz(source: Path) -> bytes:
    print(f"Decoding asset: {source}", flush=True)
    try:
        encoded = b"".join(source.read_bytes().split())
        output = gzip.decompress(base64.b64decode(encoded, validate=False))
    except Exception as exc:
        raise RuntimeError(f"Failed to decode {source}: {exc}") from exc
    if not output:
        raise RuntimeError(f"Decoded asset is empty: {source}")
    print(f"Decoded OK: {source} -> {len(output)} bytes", flush=True)
    return output


def require_file(path: Path, label: str) -> Path:
    if not path.is_file():
        raise RuntimeError(f"{label} missing: {path}")
    return path


def inject_once(text: str, marker: str, addition: str, label: str) -> str:
    if addition in text:
        return text
    if marker not in text:
        raise RuntimeError(f"{label} marker missing")
    return text.replace(marker, marker + addition, 1)


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
        require_file(source / "server.py", "server.py")
        if out.exists():
            shutil.rmtree(out)
        shutil.copytree(source, out)

    # Stable compatibility/data engine.
    (out / "index.html").write_bytes(decode_b64gz(app_root / "ui-v7" / "index.html.b64gz"))
    v7_css = decode_b64gz(app_root / "ui-v7" / "v7.css.b64gz")
    (out / "v7.js").write_bytes(decode_b64gz(app_root / "ui-v7" / "v7.js.b64gz"))

    v9_data = decode_b64gz(app_root / "ui-v9" / "v9-data.js.b64gz")
    v9_js = decode_b64gz(app_root / "ui-v9" / "v9.js.b64gz")
    v9_css_extra = decode_b64gz(app_root / "ui-v9" / "v9-extra.css.b64gz")
    (out / "v9-data.js").write_bytes(v9_data)
    (out / "v9.js").write_bytes(v9_js)
    (out / "v9.css").write_bytes(v7_css + b"\n\n/* Filament Finder 9 */\n" + v9_css_extra)

    # Mobile compatibility layer kept because the rebuilt UI still uses a few legacy hooks.
    v91_css = require_file(app_root / "ui-v91" / "mobile-fixes.css", "v9.1 CSS").read_bytes()
    v91_js = require_file(app_root / "ui-v91" / "mobile-fixes.js", "v9.1 JS").read_bytes()
    (out / "v91.css").write_bytes(v91_css)
    (out / "v91.js").write_bytes(v91_js)

    # Rebuilt v10 frontend.
    v10_css = require_file(app_root / "ui-v10" / "app.css", "v10 CSS").read_bytes()
    v10_js = require_file(app_root / "ui-v10" / "app.js", "v10 JS").read_bytes()
    (out / "v10.css").write_bytes(v10_css)
    (out / "v10.js").write_bytes(v10_js)

    # Progressive material sheet and 10.2 technical accordions.
    v101_css = require_file(app_root / "ui-v101" / "material-details.css", "v10.1 material CSS").read_bytes()
    v101_js = require_file(app_root / "ui-v101" / "material-details.js", "v10.1 material JS").read_bytes()
    v102_material_css = require_file(app_root / "ui-v102" / "material-accordions.css", "v10.2 accordion CSS").read_bytes()
    v102_material_js = require_file(app_root / "ui-v102" / "material-accordions.js", "v10.2 accordion JS").read_bytes()
    (out / "v101.css").write_bytes(v101_css)
    (out / "v101.js").write_bytes(v101_js)
    (out / "v102-material.css").write_bytes(v102_material_css)
    (out / "v102-material.js").write_bytes(v102_material_js)

    # 10.3 replaces the old source-debug-heavy price view with the marketplace UI.
    v103_price_css = require_file(app_root / "ui-v102" / "price-sources.css", "v10.3 marketplace CSS").read_bytes()
    v103_price_js = require_file(app_root / "ui-v102" / "price-sources.js", "v10.3 marketplace JS").read_bytes()
    (out / "v102-prices.css").write_bytes(v103_price_css)
    (out / "v102-prices.js").write_bytes(v103_price_js)

    # Apply backend/data expansion from v9.
    with tempfile.TemporaryDirectory(prefix="ff-v9-patch-") as patch_dir:
        patcher = Path(patch_dir) / "patch_runtime_v9.py"
        patcher.write_bytes(decode_b64gz(app_root / "runtime" / "patch_runtime_v9.py.b64gz"))
        subprocess.run([sys.executable, str(patcher), str(out)], check=True)

    # Dedicated Bambu Lab EU connector introduced in 10.2 remains part of 10.3.
    v102_backend_patcher = require_file(app_root / "runtime" / "patch_runtime_v102.py", "Bambu backend patch")
    subprocess.run([sys.executable, str(v102_backend_patcher), str(out)], check=True)

    server_path = out / "server.py"
    server_text = server_path.read_text(encoding="utf-8")
    if "APP_VERSION = '9.0.0'" not in server_text:
        raise RuntimeError("Cannot bump backend version: v9 APP_VERSION marker missing")
    server_text = server_text.replace("APP_VERSION = '9.0.0'", f"APP_VERSION = '{APP_VERSION}'", 1)
    server_path.write_text(server_text, encoding="utf-8")

    index_path = out / "index.html"
    index = index_path.read_text(encoding="utf-8")
    index = inject_once(index, '<script src="data.js"></script>', '\n<script src="v9-data.js?v=900"></script>', "v9 data")
    index = inject_once(index, '<link rel="stylesheet" href="v9.css?v=900">', '\n  <link rel="stylesheet" href="v91.css?v=910">', "v9.1 CSS")
    index = inject_once(index, '<script src="v9.js?v=900"></script>', '\n<script src="v91.js?v=910"></script>', "v9.1 JS")
    index = inject_once(index, '<link rel="stylesheet" href="v91.css?v=910">', '\n  <link rel="stylesheet" href="v10.css?v=1000">', "v10 CSS")
    index = inject_once(index, '<script src="v91.js?v=910"></script>', '\n<script src="v10.js?v=1000"></script>', "v10 JS")
    index = inject_once(index, '<link rel="stylesheet" href="v10.css?v=1000">', '\n  <link rel="stylesheet" href="v101.css?v=1010">', "v10.1 CSS")
    index = inject_once(index, '<script src="v10.js?v=1000"></script>', '\n<script src="v101.js?v=1010"></script>', "v10.1 JS")
    index = inject_once(index, '<link rel="stylesheet" href="v101.css?v=1010">', '\n  <link rel="stylesheet" href="v102-material.css?v=1020">\n  <link rel="stylesheet" href="v102-prices.css?v=1030">', "v10.2/10.3 CSS")
    index = inject_once(index, '<script src="v101.js?v=1010"></script>', '\n<script src="v102-material.js?v=1020"></script>\n<script src="v102-prices.js?v=1030"></script>', "v10.2/10.3 JS")
    index_path.write_text(index, encoding="utf-8")

    # Build-time validation: fail before publishing an incomplete image.
    server_text = server_path.read_text(encoding="utf-8")
    compile(server_text, "server.py", "exec")
    if f"APP_VERSION = '{APP_VERSION}'" not in server_text or "STATIC_MATERIAL_COUNT = 67" not in server_text:
        raise RuntimeError("10.3 backend/version patch missing")
    if "def scrape_bambu_eu(source, query):" not in server_text or "BAMBU_EU_BACKEND" not in server_text:
        raise RuntimeError("Bambu connector patch missing")
    if "ThreadingHTTPServer(('0.0.0.0',PORT),Handler).serve_forever()" not in server_text:
        raise RuntimeError("server.py is not configured to listen on 0.0.0.0")

    index = index_path.read_text(encoding="utf-8")
    required = [
        "v9.css", "v91.css", "v10.css", "v101.css", "v102-material.css", "v102-prices.css",
        "v9-data.js", "app.js", "v7.js", "v9.js", "v91.js", "v10.js", "v101.js",
        "v102-material.js", "v102-prices.js", 'id="printerBtn"'
    ]
    missing = [name for name in required if name not in index]
    if missing:
        raise RuntimeError("10.3 index missing runtime assets/hooks: " + ", ".join(missing))
    if "v102-prices.css?v=1030" not in index or "v102-prices.js?v=1030" not in index:
        raise RuntimeError("10.3 marketplace cache-busting markers missing")
    if b"FF9_DATA_VERSION" not in v9_data or b"FILAMENT_BRANDS" not in v9_data:
        raise RuntimeError("v9 material/brand dataset validation failed")
    if b"FILAMENT_FINDER_VERSION='10.0.0'" not in v10_js or b"ff10-mounted" not in v10_js:
        raise RuntimeError("v10 frontend validation failed")
    if b"const VERSION='10.1.0'" not in v101_js or b"ff101-technical" not in v101_js:
        raise RuntimeError("v10.1 material detail validation failed")
    if b"const VERSION='10.2.0'" not in v102_material_js or b"ff102-accordion" not in v102_material_js:
        raise RuntimeError("v10.2 material accordion validation failed")
    if b"const VERSION='10.3.0'" not in v103_price_js or b"renderMarketplace" not in v103_price_js or b"ff103-filter-panel" not in v103_price_js:
        raise RuntimeError("v10.3 marketplace JS validation failed")
    if b".ff103-overview" not in v103_price_css or b".ff103-offer-card" not in v103_price_css or b".ff103-diagnostics" not in v103_price_css:
        raise RuntimeError("v10.3 marketplace CSS validation failed")

    print(f"Runtime assembled at {out}")
    print(f"Bundle SHA256: {actual}")
    print("Filament Finder 10.3 build-time validation: OK", flush=True)


if __name__ == "__main__":
    main()
