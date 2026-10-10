from __future__ import annotations

import shutil
import sys
from pathlib import Path

APP_VERSION = "10.4.0"
ASSET_NAME = "v104-price-quality.js"


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: patch_runtime_v104.py <app-store-root> <runtime-dir>")

    root = Path(sys.argv[1]).resolve()
    out = Path(sys.argv[2]).resolve()
    app_root = root / "ilsamm-filament-finder"

    source = app_root / "ui-v104" / "price-quality.js"
    if not source.is_file():
        raise RuntimeError(f"10.4 price quality asset missing: {source}")
    if not out.is_dir():
        raise RuntimeError(f"runtime directory missing: {out}")

    target = out / ASSET_NAME
    shutil.copyfile(source, target)

    index_path = out / "index.html"
    index = index_path.read_text(encoding="utf-8")
    marker = '<script src="v102-prices.js?v=1030"></script>'
    quality_tag = f'<script src="{ASSET_NAME}?v=1040"></script>'
    if quality_tag not in index:
        if marker not in index:
            raise RuntimeError("10.4 marketplace script marker missing")
        # The quality layer must wrap fetch before the 10.3 marketplace installs
        # its own fetch hook. This guarantees both renderers receive cleaned data.
        index = index.replace(marker, quality_tag + "\n" + marker, 1)
    index_path.write_text(index, encoding="utf-8")

    server_path = out / "server.py"
    server = server_path.read_text(encoding="utf-8")
    old = "APP_VERSION = '10.3.0'"
    new = f"APP_VERSION = '{APP_VERSION}'"
    if new not in server:
        if old not in server:
            raise RuntimeError("10.4 backend version marker missing")
        server = server.replace(old, new, 1)
    compile(server, "server.py", "exec")
    server_path.write_text(server, encoding="utf-8")

    quality = target.read_text(encoding="utf-8")
    if "FF104_PRICE_QUALITY_VERSION" not in quality or "FF104_CLEAN_CATALOG" not in quality:
        raise RuntimeError("10.4 price quality validation failed")
    index = index_path.read_text(encoding="utf-8")
    if quality_tag not in index or index.index(quality_tag) > index.index(marker):
        raise RuntimeError("10.4 quality layer is not loaded before marketplace renderer")
    if new not in server:
        raise RuntimeError("10.4 backend version patch missing")

    print("Filament Finder 10.4 price-quality patch: OK", flush=True)


if __name__ == "__main__":
    main()
