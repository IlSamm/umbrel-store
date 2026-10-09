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

    # v10 is the rebuilt visible frontend.
    v10_css_source = app_root / "ui-v10" / "app.css"
    v10_js_source = app_root / "ui-v10" / "app.js"
    if not v10_css_source.is_file() or not v10_js_source.is_file():
        raise RuntimeError("Filament Finder 10 frontend assets are missing")
    v10_css = v10_css_source.read_bytes()
    v10_js = v10_js_source.read_bytes()
    (out / "v10.css").write_bytes(v10_css)
    (out / "v10.js").write_bytes(v10_js)

    # 10.1 progressive material detail base.
    v101_css_source = app_root / "ui-v101" / "material-details.css"
    v101_js_source = app_root / "ui-v101" / "material-details.js"
    if not v101_css_source.is_file() or not v101_js_source.is_file():
        raise RuntimeError("Filament Finder 10.1 material-detail assets are missing")
    v101_css = v101_css_source.read_bytes()
    v101_js = v101_js_source.read_bytes()
    (out / "v101.css").write_bytes(v101_css)
    (out / "v101.js").write_bytes(v101_js)

    # 10.2 reorganizes the technical sheet and makes price-source status explicit.
    v102_material_css_source = app_root / "ui-v102" / "material-accordions.css"
    v102_material_js_source = app_root / "ui-v102" / "material-accordions.js"
    v102_price_css_source = app_root / "ui-v102" / "price-sources.css"
    v102_price_js_source = app_root / "ui-v102" / "price-sources.js"
    for required_source in (v102_material_css_source, v102_material_js_source, v102_price_css_source, v102_price_js_source):
        if not required_source.is_file():
            raise RuntimeError(f"Filament Finder 10.2 asset missing: {required_source.name}")
    v102_material_css = v102_material_css_source.read_bytes()
    v102_material_js = v102_material_js_source.read_bytes()
    v102_price_css = v102_price_css_source.read_bytes()
    v102_price_js = v102_price_js_source.read_bytes()
    (out / "v102-material.css").write_bytes(v102_material_css)
    (out / "v102-material.js").write_bytes(v102_material_js)
    (out / "v102-prices.css").write_bytes(v102_price_css)
    (out / "v102-prices.js").write_bytes(v102_price_js)

    # Apply the verified backend/data expansion from v9.
    with tempfile.TemporaryDirectory(prefix="ff-v9-patch-") as patch_dir:
        patcher = Path(patch_dir) / "patch_runtime_v9.py"
        patcher.write_bytes(decode_b64gz(app_root / "runtime" / "patch_runtime_v9.py.b64gz"))
        subprocess.run([sys.executable, str(patcher), str(out)], check=True)

    # 10.2 backend patch: dedicated Bambu Lab EU connector over the official
    # localized Shopify product payloads. No search-page scraping is required.
    v102_backend_patcher = app_root / "runtime" / "patch_runtime_v102.py"
    if not v102_backend_patcher.is_file():
        raise RuntimeError("Filament Finder 10.2 backend patch is missing")
    subprocess.run([sys.executable, str(v102_backend_patcher), str(out)], check=True)

    # Keep one backend code path and bump the reported app version.
    server_path = out / "server.py"
    server_text = server_path.read_text(encoding="utf-8")
    if "APP_VERSION = '9.0.0'" not in server_text:
        raise RuntimeError("Cannot bump backend version: v9 APP_VERSION marker missing")
    server_text = server_text.replace("APP_VERSION = '9.0.0'", "APP_VERSION = '10.2.0'", 1)
    server_path.write_text(server_text, encoding="utf-8")

    # Compatibility scripts first, rebuilt UI after them, then focused 10.1/10.2 layers.
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

    if 'href="v101.css' not in index:
        marker = '<link rel="stylesheet" href="v10.css?v=1000">'
        if marker not in index:
            raise RuntimeError("v10.css link marker missing")
        index = index.replace(marker, marker + '\n  <link rel="stylesheet" href="v101.css?v=1010">', 1)

    if 'src="v101.js' not in index:
        marker = '<script src="v10.js?v=1000"></script>'
        if marker not in index:
            raise RuntimeError("v10.js script marker missing")
        index = index.replace(marker, marker + '\n<script src="v101.js?v=1010"></script>', 1)

    if 'href="v102-material.css' not in index:
        marker = '<link rel="stylesheet" href="v101.css?v=1010">'
        if marker not in index:
            raise RuntimeError("v101.css link marker missing")
        index = index.replace(marker, marker + '\n  <link rel="stylesheet" href="v102-material.css?v=1020">\n  <link rel="stylesheet" href="v102-prices.css?v=1020">', 1)

    if 'src="v102-material.js' not in index:
        marker = '<script src="v101.js?v=1010"></script>'
        if marker not in index:
            raise RuntimeError("v101.js script marker missing")
        index = index.replace(marker, marker + '\n<script src="v102-material.js?v=1020"></script>\n<script src="v102-prices.js?v=1020"></script>', 1)

    index_path.write_text(index, encoding="utf-8")

    # Fail image builds instead of shipping a half-mounted UI/backend.
    server_text = server_path.read_text(encoding="utf-8")
    compile(server_text, "server.py", "exec")
    if "APP_VERSION = '10.2.0'" not in server_text or "STATIC_MATERIAL_COUNT = 67" not in server_text:
        raise RuntimeError("10.2 backend/version patch missing")
    if "def scrape_bambu_eu(source, query):" not in server_text or "BAMBU_EU_BACKEND" not in server_text:
        raise RuntimeError("10.2 Bambu connector patch missing")
    if "ThreadingHTTPServer(('0.0.0.0',PORT),Handler).serve_forever()" not in server_text:
        raise RuntimeError("server.py is not configured to listen on 0.0.0.0")

    index = index_path.read_text(encoding="utf-8")
    required = ["v9.css", "v91.css", "v10.css", "v101.css", "v102-material.css", "v102-prices.css", "v9-data.js", "app.js", "v7.js", "v9.js", "v91.js", "v10.js", "v101.js", "v102-material.js", "v102-prices.js", 'id="printerBtn"']
    missing = [name for name in required if name not in index]
    if missing:
        raise RuntimeError("10.2 index missing runtime assets/hooks: " + ", ".join(missing))
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
    if b"const VERSION='10.1.0'" not in v101_js or b"ff101-technical" not in v101_js:
        raise RuntimeError("v10.1 material detail JS validation failed")
    if b".ff101-material-sheet" not in v101_css or b".ff101-technical-button" not in v101_css:
        raise RuntimeError("v10.1 material detail CSS validation failed")
    if b"const VERSION='10.2.0'" not in v102_material_js or b"ff102-accordion" not in v102_material_js:
        raise RuntimeError("v10.2 material accordion JS validation failed")
    if b".ff102-accordion" not in v102_material_css:
        raise RuntimeError("v10.2 material accordion CSS validation failed")
    if b"renderTransparentMarket" not in v102_price_js or b"ff102-price-sources" not in v102_price_js:
        raise RuntimeError("v10.2 price-source JS validation failed")
    if b".ff102-price-sources" not in v102_price_css or b".ff102-store-group" not in v102_price_css:
        raise RuntimeError("v10.2 price-source CSS validation failed")

    print(f"Runtime assembled at {out}")
    print(f"Bundle SHA256: {actual}")
    print("Filament Finder 10.2 build-time validation: OK", flush=True)


if __name__ == "__main__":
    main()
