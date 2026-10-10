from __future__ import annotations

import shutil
import sys
from pathlib import Path

APP_VERSION = "10.6.0"
JS_ASSET = "v106-source-status.js"
CSS_ASSET = "v106-source-status.css"


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: patch_runtime_v106.py <app-store-root> <runtime-dir>")

    root = Path(sys.argv[1]).resolve()
    out = Path(sys.argv[2]).resolve()
    app_root = root / "ilsamm-filament-finder"
    if not out.is_dir():
        raise RuntimeError(f"runtime directory missing: {out}")

    js_source = app_root / "ui-v106" / "source-status.js"
    css_source = app_root / "ui-v106" / "source-status.css"
    if not js_source.is_file() or not css_source.is_file():
        raise RuntimeError("10.6 source status assets missing")
    shutil.copyfile(js_source, out / JS_ASSET)
    shutil.copyfile(css_source, out / CSS_ASSET)

    server_path = out / "server.py"
    server = server_path.read_text(encoding="utf-8")
    old = "APP_VERSION = '10.5.0'"
    new = f"APP_VERSION = '{APP_VERSION}'"
    if new not in server:
        if old not in server:
            raise RuntimeError("10.6 backend version marker missing")
        server = server.replace(old, new, 1)
    compile(server, "server.py", "exec")
    server_path.write_text(server, encoding="utf-8")

    index_path = out / "index.html"
    index = index_path.read_text(encoding="utf-8")

    css_marker = '<link rel="stylesheet" href="v105-deal-engine.css?v=1050">'
    css_tag = f'<link rel="stylesheet" href="{CSS_ASSET}?v=1060">'
    if css_tag not in index:
        if css_marker not in index:
            raise RuntimeError("10.6 CSS insertion marker missing")
        index = index.replace(css_marker, css_marker + "\n  " + css_tag, 1)

    js_marker = '<script src="v105-deal-engine.js?v=1050"></script>'
    js_tag = f'<script src="{JS_ASSET}?v=1060"></script>'
    if js_tag not in index:
        if js_marker not in index:
            raise RuntimeError("10.6 JS insertion marker missing")
        index = index.replace(js_marker, js_marker + "\n" + js_tag, 1)
    index_path.write_text(index, encoding="utf-8")

    js = (out / JS_ASSET).read_text(encoding="utf-8")
    css = (out / CSS_ASSET).read_text(encoding="utf-8")
    if "FF106_SOURCE_STATUS_VERSION" not in js or "FF106_ENRICH_SOURCE_STATUS" not in js:
        raise RuntimeError("10.6 source status JS validation failed")
    for marker in ("Nessun risultato", "Timeout", "Errore", "status_label", "source_status_summary"):
        if marker not in js:
            raise RuntimeError(f"10.6 source status marker missing: {marker}")
    if ".ff106-source-status-panel" not in css or ".is-timeout" not in css:
        raise RuntimeError("10.6 source status CSS validation failed")
    if js_tag not in index or css_tag not in index:
        raise RuntimeError("10.6 runtime assets not mounted")
    if new not in server:
        raise RuntimeError("10.6 backend version patch failed")

    print("Filament Finder 10.6 source-status patch: OK", flush=True)


if __name__ == "__main__":
    main()
