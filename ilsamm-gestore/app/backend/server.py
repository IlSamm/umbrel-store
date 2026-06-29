#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import posixpath
import sqlite3
import time
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BACKEND_DIR.parent.parent
FRONTEND_DIR = PROJECT_ROOT / "app" / "frontend"
DEFAULT_DATA_DIR = PROJECT_ROOT / "data"
DATA_DIR = Path(os.environ.get("GESTORE_DATA_DIR", str(DEFAULT_DATA_DIR))).resolve()
DB_PATH = DATA_DIR / "gestore_data.sqlite3"
PROFILE_ID = "default"
BUILD_VERSION = "1.1.97"
BUILD_CACHE = "20260629i"

DEFAULT_SNAPSHOT = {
    "entries": {},
    "settings": None,
    "payslips": [],
    "syncMeta": {
        "entriesUpdatedAt": 0,
        "settingsUpdatedAt": 0,
        "payslipsUpdatedAt": 0,
        "lastServerSyncAt": 0,
    },
    "updatedAt": 0,
}


def get_db() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS app_state (
            profile_id TEXT PRIMARY KEY,
            entries_json TEXT NOT NULL,
            settings_json TEXT,
            payslips_json TEXT,
            sync_meta_json TEXT NOT NULL,
            updated_at INTEGER NOT NULL
        )
        """
    )
    columns = {row[1] for row in conn.execute("PRAGMA table_info(app_state)")}
    if "payslips_json" not in columns:
        conn.execute("ALTER TABLE app_state ADD COLUMN payslips_json TEXT")
    conn.commit()
    return conn


def load_snapshot(profile_id: str = PROFILE_ID) -> dict:
    with get_db() as conn:
        row = conn.execute(
            "SELECT entries_json, settings_json, payslips_json, sync_meta_json, updated_at FROM app_state WHERE profile_id = ?",
            (profile_id,),
        ).fetchone()
    if not row:
        return {
            "entries": {},
            "settings": None,
            "payslips": [],
            "syncMeta": dict(DEFAULT_SNAPSHOT["syncMeta"]),
            "updatedAt": 0,
        }
    entries_json, settings_json, payslips_json, sync_meta_json, updated_at = row
    try:
        entries = json.loads(entries_json) if entries_json else {}
    except json.JSONDecodeError:
        entries = {}
    try:
        settings = json.loads(settings_json) if settings_json else None
    except json.JSONDecodeError:
        settings = None
    try:
        payslips = json.loads(payslips_json) if payslips_json else []
    except json.JSONDecodeError:
        payslips = []
    try:
        sync_meta = json.loads(sync_meta_json) if sync_meta_json else {}
    except json.JSONDecodeError:
        sync_meta = {}
    return {
        "entries": entries if isinstance(entries, dict) else {},
        "settings": settings if isinstance(settings, dict) else None,
        "payslips": payslips if isinstance(payslips, list) else [],
        "syncMeta": {
            **DEFAULT_SNAPSHOT["syncMeta"],
            **(sync_meta if isinstance(sync_meta, dict) else {}),
        },
        "updatedAt": int(updated_at or 0),
    }


def save_snapshot(snapshot: dict, profile_id: str = PROFILE_ID) -> dict:
    entries = snapshot.get("entries")
    settings = snapshot.get("settings")
    payslips = snapshot.get("payslips")
    sync_meta = snapshot.get("syncMeta") or {}
    updated_at = int(snapshot.get("updatedAt") or time.time() * 1000)

    entries = entries if isinstance(entries, dict) else {}
    settings = settings if isinstance(settings, dict) else None
    payslips = payslips if isinstance(payslips, list) else []
    if not isinstance(sync_meta, dict):
        sync_meta = {}

    now_ms = int(time.time() * 1000)
    sync_meta = {
        **DEFAULT_SNAPSHOT["syncMeta"],
        **sync_meta,
        "entriesUpdatedAt": updated_at if snapshot.get("entries") is not None else int(sync_meta.get("entriesUpdatedAt") or 0),
        "settingsUpdatedAt": updated_at if snapshot.get("settings") is not None else int(sync_meta.get("settingsUpdatedAt") or 0),
        "payslipsUpdatedAt": updated_at if snapshot.get("payslips") is not None else int(sync_meta.get("payslipsUpdatedAt") or 0),
        "lastServerSyncAt": now_ms,
    }

    with get_db() as conn:
        conn.execute(
            """
            INSERT INTO app_state (profile_id, entries_json, settings_json, payslips_json, sync_meta_json, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(profile_id) DO UPDATE SET
                entries_json=excluded.entries_json,
                settings_json=excluded.settings_json,
                payslips_json=excluded.payslips_json,
                sync_meta_json=excluded.sync_meta_json,
                updated_at=excluded.updated_at
            """,
            (
                profile_id,
                json.dumps(entries, ensure_ascii=False),
                json.dumps(settings, ensure_ascii=False) if settings is not None else None,
                json.dumps(payslips, ensure_ascii=False),
                json.dumps(sync_meta, ensure_ascii=False),
                updated_at,
            ),
        )
        conn.commit()

    return load_snapshot(profile_id)


class GestOreHandler(SimpleHTTPRequestHandler):
    server_version = "GestOreHTTP/2.0"

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def _send_json(self, payload: dict, status: int = HTTPStatus.OK) -> None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _read_json_body(self) -> dict:
        length = int(self.headers.get("Content-Length", "0") or 0)
        raw = self.rfile.read(length) if length > 0 else b"{}"
        try:
            payload = json.loads(raw.decode("utf-8"))
        except Exception as exc:
            raise ValueError(f"JSON non valido: {exc}") from exc
        if not isinstance(payload, dict):
            raise ValueError("Il body deve essere un oggetto JSON.")
        return payload

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/build":
            self._send_json({
                "ok": True,
                "app": "GestOre",
                "version": BUILD_VERSION,
                "cache": BUILD_CACHE,
                "ts": int(time.time() * 1000),
            })
            return
        if parsed.path == "/api/ping":
            self._send_json({"ok": True, "ts": int(time.time() * 1000)})
            return
        if parsed.path == "/api/snapshot":
            self._send_json(load_snapshot())
            return
        return super().do_GET()

    def do_PUT(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path != "/api/snapshot":
            self.send_error(HTTPStatus.NOT_FOUND, "Endpoint non trovato")
            return
        try:
            payload = self._read_json_body()
            saved = save_snapshot(payload)
            self._send_json(saved)
        except ValueError as exc:
            self._send_json({"error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
        except Exception as exc:
            self._send_json({"error": f"Errore interno: {exc}"}, status=HTTPStatus.INTERNAL_SERVER_ERROR)

    def do_POST(self) -> None:
        return self.do_PUT()

    def translate_path(self, path: str) -> str:
        parsed_path = urlparse(path).path
        parsed_path = unquote(parsed_path)
        parsed_path = posixpath.normpath(parsed_path)
        words = [word for word in parsed_path.split('/') if word and word not in ('.', '..')]
        candidate = FRONTEND_DIR
        for word in words:
            candidate = candidate / word
        if parsed_path in ('', '/'):
            return str(FRONTEND_DIR / 'index.html')
        if candidate.is_dir():
            index = candidate / 'index.html'
            if index.exists():
                return str(index)
        return str(candidate)


def main() -> int:
    parser = argparse.ArgumentParser(description="Server GestOre con struttura ordinata")
    parser.add_argument("--host", default="0.0.0.0", help="Host di ascolto")
    parser.add_argument("--port", type=int, default=8080, help="Porta HTTP")
    args = parser.parse_args()

    os.chdir(FRONTEND_DIR)
    httpd = ThreadingHTTPServer((args.host, args.port), GestOreHandler)
    print(f"GestOre attivo su http://{args.host}:{args.port}")
    print(f"Frontend: {FRONTEND_DIR}")
    print(f"Database: {DB_PATH}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nChiusura server...")
    finally:
        httpd.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
