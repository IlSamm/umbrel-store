from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "app" / "frontend"


def fail(message: str) -> None:
    raise AssertionError(message)


def local_asset_path(reference: str) -> Path | None:
    value = reference.split("?", 1)[0].strip()
    if not value or value.startswith(("http://", "https://", "data:", "#")):
        return None
    if value == "/":
        return FRONTEND / "index.html"
    return FRONTEND / value.lstrip("/")


server_source = (ROOT / "app" / "backend" / "server.py").read_text(encoding="utf-8")
version_match = re.search(r'^BUILD_VERSION\s*=\s*"([^"]+)"', server_source, re.MULTILINE)
cache_match = re.search(r'^BUILD_CACHE\s*=\s*"([^"]+)"', server_source, re.MULTILINE)
if not version_match or not cache_match:
    fail("BUILD_VERSION or BUILD_CACHE is missing from server.py")

version = version_match.group(1)
cache = cache_match.group(1)
build = f"{version}-{cache}"

required_files = [
    "index.html",
    "style.css",
    "service-worker.js",
    "site.webmanifest",
    "js/core.js",
    "js/platform.js",
    "js/validation.js",
    "js/views.js",
    "styles/design-system.css",
    "styles/platform-final.css",
    "styles/validation-final.css",
]
for relative in required_files:
    if not (FRONTEND / relative).is_file():
        fail(f"Required frontend file is missing: {relative}")

index_source = (FRONTEND / "index.html").read_text(encoding="utf-8")
style_source = (FRONTEND / "style.css").read_text(encoding="utf-8")
worker_source = (FRONTEND / "service-worker.js").read_text(encoding="utf-8")
manifest_source = (FRONTEND / "site.webmanifest").read_text(encoding="utf-8")
core_source = (FRONTEND / "js" / "core.js").read_text(encoding="utf-8")
platform_source = (FRONTEND / "js" / "platform.js").read_text(encoding="utf-8")
views_source = (FRONTEND / "js" / "views.js").read_text(encoding="utf-8")

if f'content="{build}"' not in index_source:
    fail(f"index.html does not expose build {build}")
if f"version: '{version}'" not in core_source or f"build: '{cache}'" not in core_source:
    fail("core.js default version is not aligned with the backend")
if f"var PLATFORM_BUILD = '{build}'" not in platform_source:
    fail("platform.js build is not aligned with the backend")
if f"const BUILD = '{build}'" not in worker_source:
    fail("service-worker.js build is not aligned with the backend")

versioned_sources = {
    "index.html": index_source,
    "style.css": style_source,
    "service-worker.js": worker_source,
    "site.webmanifest": manifest_source,
}
for css_file in sorted((FRONTEND / "styles").glob("*.css")):
    css_source = css_file.read_text(encoding="utf-8")
    if "?v=" in css_source:
        versioned_sources[str(css_file.relative_to(FRONTEND))] = css_source
for name, source in versioned_sources.items():
    tokens = set(re.findall(r"\?v=([0-9A-Za-z._-]+)", source))
    if tokens != {cache}:
        fail(f"{name} has inconsistent cache tokens: {sorted(tokens)} (expected {cache})")

references: set[str] = set()
references.update(re.findall(r'(?:href|src)="([^"]+)"', index_source))
references.update(re.findall(r'@import\s+url\("([^"]+)"\)', style_source))
references.update(re.findall(r"'(/[^']+\?v=[^']+)'", worker_source))
for reference in sorted(references):
    asset = local_asset_path(reference)
    if asset is not None and not asset.is_file():
        fail(f"Referenced asset does not exist: {reference}")

style_assets: set[str] = set()
for css_file in [FRONTEND / "style.css", *sorted((FRONTEND / "styles").glob("*.css"))]:
    css_source = css_file.read_text(encoding="utf-8")
    for reference in re.findall(r'@import\s+url\("([^"]+)"\)', css_source):
        imported_path = (css_file.parent / reference.split("?", 1)[0]).resolve()
        try:
            relative_path = imported_path.relative_to(FRONTEND.resolve()).as_posix()
        except ValueError:
            fail(f"CSS import escapes the frontend directory: {reference}")
        if not imported_path.is_file():
            fail(f"Referenced CSS asset does not exist: {relative_path}")
        references.add("/" + relative_path + "?" + cache)
        style_assets.add("/" + relative_path)
worker_assets = {
    reference.split("?", 1)[0]
    for reference in re.findall(r"'(/[^']+\?v=[^']+)'", worker_source)
}
missing_worker_styles = sorted(style_assets - worker_assets)
if missing_worker_styles:
    fail(f"Styles missing from the offline app shell: {missing_worker_styles}")

legacy_renderers = [
    "renderHomeLegacy",
    "renderCalendarLegacy",
    "renderStatsLegacy",
    "renderVacationsLegacy",
    "renderPayslipsLegacy",
    "renderSettingsLegacy",
]
remaining_legacy = [name for name in legacy_renderers if re.search(rf"\b{name}\b", views_source)]
if remaining_legacy:
    fail(f"Legacy renderers are still present: {remaining_legacy}")

manifest = json.loads(manifest_source)
if manifest.get("display") != "standalone":
    fail("PWA manifest must use standalone display mode")
if not manifest.get("id") or not manifest.get("start_url"):
    fail("PWA manifest must define id and start_url")

required_api_markers = [
    "/api/auth/recover",
    "/api/auth/sessions",
    "/api/diagnostics",
    "/api/history",
    "/api/push/subscribe",
    "/api/admin/audit",
]
missing_api = [marker for marker in required_api_markers if marker not in server_source]
if missing_api:
    fail(f"Required backend routes are missing: {missing_api}")

print(
    json.dumps(
        {
            "ok": True,
            "version": version,
            "cache": cache,
            "assets": len(references),
            "offlineStyles": len(style_assets),
            "legacyRenderers": 0,
        },
        ensure_ascii=False,
    )
)
