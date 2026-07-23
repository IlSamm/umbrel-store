#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import posixpath
import sqlite3
import tempfile
import threading
import time
from contextlib import closing
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

from auth_store import AuthError, AuthStore


BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BACKEND_DIR.parent.parent
FRONTEND_DIR = PROJECT_ROOT / "app" / "frontend"
DEFAULT_DATA_DIR = PROJECT_ROOT / "data"
DATA_DIR = Path(os.environ.get("GESTORE_DATA_DIR", str(DEFAULT_DATA_DIR))).resolve()
DB_PATH = DATA_DIR / "gestore_data.sqlite3"
PROFILE_ID = "default"
SESSION_COOKIE = "gestore_session"
MAX_JSON_BYTES = 64 * 1024 * 1024
MAX_BACKUP_BYTES = 128 * 1024 * 1024
BUILD_VERSION = "1.1.137"
BUILD_CACHE = "20260723e"
AUTH_STORE = AuthStore(DATA_DIR)

_DB_SCHEMA_LOCK = threading.Lock()
_DB_SCHEMA_READY: set[str] = set()
_SNAPSHOT_LOCKS_GUARD = threading.Lock()
_SNAPSHOT_LOCKS: dict[str, threading.RLock] = {}

DEFAULT_SYNC_META = {
    "entriesUpdatedAt": 0,
    "settingsUpdatedAt": 0,
    "payslipsUpdatedAt": 0,
    "lastServerSyncAt": 0,
}


def empty_snapshot() -> dict:
    return {
        "entries": {},
        "settings": None,
        "payslips": [],
        "syncMeta": dict(DEFAULT_SYNC_META),
        "updatedAt": 0,
    }


def _db_key(db_path: Path) -> str:
    return str(Path(db_path).resolve())


def _snapshot_lock(db_path: Path) -> threading.RLock:
    key = _db_key(db_path)
    with _SNAPSHOT_LOCKS_GUARD:
        lock = _SNAPSHOT_LOCKS.get(key)
        if lock is None:
            lock = threading.RLock()
            _SNAPSHOT_LOCKS[key] = lock
        return lock


def get_db(db_path: Path = DB_PATH) -> sqlite3.Connection:
    db_path = Path(db_path).resolve()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path, timeout=20)
    conn.execute("PRAGMA synchronous=NORMAL")
    key = _db_key(db_path)
    if key not in _DB_SCHEMA_READY:
        with _DB_SCHEMA_LOCK:
            if key not in _DB_SCHEMA_READY:
                conn.execute("PRAGMA journal_mode=WAL")
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS app_state (
                        profile_id TEXT PRIMARY KEY,
                        entries_json TEXT NOT NULL,
                        settings_json TEXT,
                        payslips_json TEXT,
                        payslips_compact_json TEXT,
                        sync_meta_json TEXT NOT NULL,
                        updated_at INTEGER NOT NULL
                    )
                    """
                )
                columns = {row[1] for row in conn.execute("PRAGMA table_info(app_state)")}
                if "payslips_json" not in columns:
                    conn.execute("ALTER TABLE app_state ADD COLUMN payslips_json TEXT")
                if "payslips_compact_json" not in columns:
                    conn.execute("ALTER TABLE app_state ADD COLUMN payslips_compact_json TEXT")
                conn.commit()
                _DB_SCHEMA_READY.add(key)
    return conn


def _parse_json(value: str | None, fallback):
    try:
        return json.loads(value) if value else fallback
    except (json.JSONDecodeError, TypeError):
        return fallback


def _snapshot_from_row(row) -> dict:
    if not row:
        return empty_snapshot()
    entries_json, settings_json, payslips_json, sync_meta_json, updated_at = row
    entries = _parse_json(entries_json, {})
    settings = _parse_json(settings_json, None)
    payslips = _parse_json(payslips_json, [])
    sync_meta = _parse_json(sync_meta_json, {})
    return {
        "entries": entries if isinstance(entries, dict) else {},
        "settings": settings if isinstance(settings, dict) else None,
        "payslips": payslips if isinstance(payslips, list) else [],
        "syncMeta": {
            **DEFAULT_SYNC_META,
            **(sync_meta if isinstance(sync_meta, dict) else {}),
        },
        "updatedAt": int(updated_at or 0),
    }


def load_snapshot(profile_id: str = PROFILE_ID, db_path: Path = DB_PATH) -> dict:
    with closing(get_db(db_path)) as conn:
        row = conn.execute(
            "SELECT entries_json, settings_json, payslips_json, sync_meta_json, updated_at FROM app_state WHERE profile_id = ?",
            (profile_id,),
        ).fetchone()
    return _snapshot_from_row(row)


def _payslip_key(payslip: dict, fallback: str = "") -> str:
    if not isinstance(payslip, dict):
        return fallback
    return str(payslip.get("id") or fallback).strip()


def _stored_payslip_record(incoming: dict, existing: dict | None = None) -> dict:
    record = dict(incoming) if isinstance(incoming, dict) else {}
    previous = existing if isinstance(existing, dict) else {}
    photos_deferred = record.pop("photosDeferred", False) is True
    source_deferred = record.pop("sourceTextDeferred", False) is True
    record.pop("photoCount", None)

    if photos_deferred:
        previous_photos = previous.get("photos") if isinstance(previous.get("photos"), list) else []
        previous_image = str(previous.get("imageData") or "")
        if not previous_photos and previous_image:
            previous_photos = [{
                "id": f"legacy-{_payslip_key(previous, 'photo')}",
                "data": previous_image,
                "fileName": str(previous.get("fileName") or "busta-paga.jpg"),
            }]
        record["photos"] = previous_photos
        record["fileName"] = str(previous.get("fileName") or record.get("fileName") or "")
    if source_deferred:
        record["sourceText"] = str(previous.get("sourceText") or "")
    photos = record.get("photos") if isinstance(record.get("photos"), list) else []
    legacy_image = str(record.get("imageData") or "")
    if not photos and legacy_image:
        photos = [{
            "id": f"legacy-{_payslip_key(record, 'photo')}",
            "data": legacy_image,
            "fileName": str(record.get("fileName") or "busta-paga.jpg"),
        }]
    if photos:
        record["photos"] = photos
        record.pop("imageData", None)
    return record


def merge_payslip_records(existing_items: list, incoming_items: list) -> list:
    existing_map = {
        _payslip_key(item): item
        for item in (existing_items if isinstance(existing_items, list) else [])
        if _payslip_key(item)
    }
    merged = []
    for index, item in enumerate(incoming_items if isinstance(incoming_items, list) else []):
        if not isinstance(item, dict):
            continue
        key = _payslip_key(item, f"legacy-{index}")
        record = _stored_payslip_record(item, existing_map.get(key))
        if key and not record.get("id"):
            record["id"] = key
        merged.append(record)
    return merged


def compact_payslip_records(items: list) -> list:
    compact_payslips = []
    for index, item in enumerate(items if isinstance(items, list) else []):
        if not isinstance(item, dict):
            continue
        record = dict(item)
        photos = record.get("photos") if isinstance(record.get("photos"), list) else []
        if not photos and record.get("imageData"):
            photos = [{"data": record.get("imageData"), "fileName": record.get("fileName", "")}]
        source_text = str(record.get("sourceText") or "")
        declared_photo_count = max(0, int(record.get("photoCount") or 0))
        record.pop("photos", None)
        record.pop("imageData", None)
        record.pop("sourceText", None)
        record["photoCount"] = max(len(photos), declared_photo_count)
        record["photosDeferred"] = bool(record["photoCount"] or record.get("photosDeferred"))
        record["sourceTextDeferred"] = bool(source_text or record.get("sourceTextDeferred"))
        if not record.get("id"):
            record["id"] = f"legacy-{index}"
        compact_payslips.append(record)
    return compact_payslips


def compact_snapshot(snapshot: dict) -> dict:
    compact = dict(snapshot if isinstance(snapshot, dict) else empty_snapshot())
    compact["payslips"] = compact_payslip_records(compact.get("payslips") or [])
    compact["compact"] = True
    return compact


def load_compact_snapshot(profile_id: str = PROFILE_ID, db_path: Path = DB_PATH) -> dict:
    """Load account metadata without materializing base64 payslip photos."""
    with _snapshot_lock(db_path):
        with closing(get_db(db_path)) as conn:
            row = conn.execute(
                """
                SELECT entries_json, settings_json, payslips_compact_json, sync_meta_json, updated_at
                FROM app_state WHERE profile_id = ?
                """,
                (profile_id,),
            ).fetchone()
            if not row:
                return {**empty_snapshot(), "compact": True}

            entries_json, settings_json, compact_json, sync_meta_json, updated_at = row
            compact_payslips = _parse_json(compact_json, None)
            if not isinstance(compact_payslips, list):
                full_row = conn.execute(
                    "SELECT payslips_json FROM app_state WHERE profile_id = ?",
                    (profile_id,),
                ).fetchone()
                full_payslips = _parse_json(full_row[0] if full_row else None, [])
                compact_payslips = compact_payslip_records(full_payslips)
                conn.execute(
                    "UPDATE app_state SET payslips_compact_json = ? WHERE profile_id = ?",
                    (json.dumps(compact_payslips, ensure_ascii=False), profile_id),
                )
                conn.commit()

        return {
            "entries": _parse_json(entries_json, {}),
            "settings": _parse_json(settings_json, None),
            "payslips": compact_payslips,
            "syncMeta": {
                **DEFAULT_SYNC_META,
                **(_parse_json(sync_meta_json, {}) or {}),
            },
            "updatedAt": int(updated_at or 0),
            "compact": True,
        }


def save_snapshot(
    snapshot: dict,
    profile_id: str = PROFILE_ID,
    db_path: Path = DB_PATH,
    force_replace: bool = False,
    _existing_snapshot: dict | None = None,
    _return_compact: bool = False,
) -> dict:
    snapshot = snapshot if isinstance(snapshot, dict) else {}
    preserve_payslips = not force_replace and snapshot.get("payslipsDeferred") is True
    with _snapshot_lock(db_path):
        existing = _existing_snapshot if isinstance(_existing_snapshot, dict) else (
            load_compact_snapshot(profile_id, db_path) if preserve_payslips else load_snapshot(profile_id, db_path)
        )
        entries = snapshot.get("entries")
        settings = snapshot.get("settings")
        payslips = snapshot.get("payslips")
        sync_meta = snapshot.get("syncMeta") or {}

        entries = entries if isinstance(entries, dict) else {}
        settings = settings if isinstance(settings, dict) else None
        payslips = payslips if isinstance(payslips, list) else []
        sync_meta = sync_meta if isinstance(sync_meta, dict) else {}

        if not preserve_payslips:
            payslips = merge_payslip_records(existing.get("payslips") or [], payslips)

        # A blank Safari cache must not erase a populated server database.
        allow_empty = force_replace or snapshot.get("allowEmptyEntries") is True
        if existing.get("entries") and not entries and not allow_empty:
            entries = existing["entries"]

        now_ms = int(time.time() * 1000)
        updated_at = max(now_ms, int(snapshot.get("updatedAt") or 0))
        sync_meta = {
            **DEFAULT_SYNC_META,
            **(existing.get("syncMeta") or {}),
            **sync_meta,
            "entriesUpdatedAt": updated_at if snapshot.get("entries") is not None else int(sync_meta.get("entriesUpdatedAt") or 0),
            "settingsUpdatedAt": updated_at if snapshot.get("settings") is not None else int(sync_meta.get("settingsUpdatedAt") or 0),
            "payslipsUpdatedAt": (
                int((existing.get("syncMeta") or {}).get("payslipsUpdatedAt") or 0)
                if preserve_payslips
                else updated_at
            ),
            "lastServerSyncAt": now_ms,
        }

        with closing(get_db(db_path)) as conn:
            if preserve_payslips:
                conn.execute(
                    """
                    INSERT INTO app_state (
                        profile_id, entries_json, settings_json, payslips_json,
                        payslips_compact_json, sync_meta_json, updated_at
                    ) VALUES (?, ?, ?, '[]', '[]', ?, ?)
                    ON CONFLICT(profile_id) DO UPDATE SET
                        entries_json=excluded.entries_json,
                        settings_json=excluded.settings_json,
                        sync_meta_json=excluded.sync_meta_json,
                        updated_at=excluded.updated_at
                    """,
                    (
                        profile_id,
                        json.dumps(entries, ensure_ascii=False),
                        json.dumps(settings, ensure_ascii=False) if settings is not None else None,
                        json.dumps(sync_meta, ensure_ascii=False),
                        updated_at,
                    ),
                )
            else:
                compact_payslips = compact_payslip_records(payslips)
                conn.execute(
                    """
                    INSERT INTO app_state (
                        profile_id, entries_json, settings_json, payslips_json,
                        payslips_compact_json, sync_meta_json, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(profile_id) DO UPDATE SET
                        entries_json=excluded.entries_json,
                        settings_json=excluded.settings_json,
                        payslips_json=excluded.payslips_json,
                        payslips_compact_json=excluded.payslips_compact_json,
                        sync_meta_json=excluded.sync_meta_json,
                        updated_at=excluded.updated_at
                    """,
                    (
                        profile_id,
                        json.dumps(entries, ensure_ascii=False),
                        json.dumps(settings, ensure_ascii=False) if settings is not None else None,
                        json.dumps(payslips, ensure_ascii=False),
                        json.dumps(compact_payslips, ensure_ascii=False),
                        json.dumps(sync_meta, ensure_ascii=False),
                        updated_at,
                    ),
                )
            conn.commit()
        return load_compact_snapshot(profile_id, db_path) if preserve_payslips or _return_compact else load_snapshot(profile_id, db_path)


def save_payslip_record(payslip: dict, db_path: Path, updated_at: int | None = None) -> dict:
    if not isinstance(payslip, dict):
        raise ValueError("Busta paga non valida.")
    payslip_id = _payslip_key(payslip)
    if not payslip_id:
        raise ValueError("Identificativo busta paga mancante.")
    with _snapshot_lock(db_path):
        existing = load_snapshot(db_path=db_path)
        items = list(existing.get("payslips") or [])
        existing_index = next((index for index, item in enumerate(items) if _payslip_key(item) == payslip_id), -1)
        previous = items[existing_index] if existing_index >= 0 else None
        stored = _stored_payslip_record(payslip, previous)
        stored["id"] = payslip_id
        if existing_index >= 0:
            items[existing_index] = stored
        else:
            items.insert(0, stored)
        saved = save_snapshot({
            "entries": existing.get("entries") or {},
            "settings": existing.get("settings"),
            "payslips": items,
            "syncMeta": existing.get("syncMeta") or {},
            "updatedAt": int(updated_at or time.time() * 1000),
        }, db_path=db_path, _existing_snapshot=existing, _return_compact=True)
        persisted = next((item for item in saved.get("payslips") or [] if _payslip_key(item) == payslip_id), None)
        if persisted is None:
            raise RuntimeError("La busta paga non risulta nel database dopo il salvataggio.")
        return saved


def delete_payslip_record(payslip_id: str, db_path: Path, updated_at: int | None = None) -> dict:
    clean_id = str(payslip_id or "").strip()
    if not clean_id:
        raise ValueError("Identificativo busta paga mancante.")
    with _snapshot_lock(db_path):
        existing = load_snapshot(db_path=db_path)
        items = [item for item in (existing.get("payslips") or []) if _payslip_key(item) != clean_id]
        return save_snapshot({
            "entries": existing.get("entries") or {},
            "settings": existing.get("settings"),
            "payslips": items,
            "syncMeta": existing.get("syncMeta") or {},
            "updatedAt": int(updated_at or time.time() * 1000),
        }, db_path=db_path, _existing_snapshot=existing, _return_compact=True)


def snapshot_has_data(snapshot: dict) -> bool:
    return bool(snapshot.get("entries") or snapshot.get("payslips") or snapshot.get("settings"))


def account_snapshot_summary(account: dict) -> dict:
    snapshot = load_compact_snapshot(db_path=AUTH_STORE.user_db_path(account["id"]))
    return {
        **account,
        "entries": len(snapshot.get("entries") or {}),
        "payslips": len(snapshot.get("payslips") or []),
        "updatedAt": int(snapshot.get("updatedAt") or 0),
    }


def database_storage_summary(db_path: Path) -> dict:
    db_path = Path(db_path).resolve()
    snapshot = load_compact_snapshot(db_path=db_path)
    database_bytes = db_path.stat().st_size if db_path.exists() else 0
    wal_path = Path(f"{db_path}-wal")
    shm_path = Path(f"{db_path}-shm")
    wal_bytes = wal_path.stat().st_size if wal_path.exists() else 0
    shm_bytes = shm_path.stat().st_size if shm_path.exists() else 0
    return {
        "bytes": database_bytes + wal_bytes + shm_bytes,
        "databaseBytes": database_bytes,
        "journalBytes": wal_bytes + shm_bytes,
        "entries": len(snapshot.get("entries") or {}),
        "payslips": len(snapshot.get("payslips") or []),
        "updatedAt": int(snapshot.get("updatedAt") or 0),
    }


def merge_snapshots(legacy: dict, device: dict | None) -> dict:
    device = device if isinstance(device, dict) else {}
    legacy = legacy if isinstance(legacy, dict) else empty_snapshot()
    legacy_entries = legacy.get("entries") if isinstance(legacy.get("entries"), dict) else {}
    device_entries = device.get("entries") if isinstance(device.get("entries"), dict) else {}
    entries = {**legacy_entries, **device_entries}

    legacy_payslips = legacy.get("payslips") if isinstance(legacy.get("payslips"), list) else []
    device_payslips = device.get("payslips") if isinstance(device.get("payslips"), list) else []
    payslip_map = {}
    for index, payslip in enumerate(legacy_payslips + device_payslips):
        if not isinstance(payslip, dict):
            continue
        key = str(payslip.get("id") or f"legacy-{index}")
        payslip_map[key] = payslip

    device_has_records = bool(device_entries or device_payslips)
    device_settings = device.get("settings") if isinstance(device.get("settings"), dict) else None
    legacy_settings = legacy.get("settings") if isinstance(legacy.get("settings"), dict) else None
    settings = device_settings if device_has_records and device_settings is not None else legacy_settings or device_settings
    now = int(time.time() * 1000)
    return {
        "entries": entries,
        "settings": settings,
        "payslips": list(payslip_map.values()),
        "syncMeta": device.get("syncMeta") if isinstance(device.get("syncMeta"), dict) else legacy.get("syncMeta") or {},
        "updatedAt": max(int(legacy.get("updatedAt") or 0), int(device.get("updatedAt") or 0), now),
        "allowEmptyEntries": True,
    }


def create_backup_bytes(db_path: Path) -> bytes:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    temp_handle = tempfile.NamedTemporaryFile(prefix="gestore-backup-", suffix=".sqlite3", dir=DATA_DIR, delete=False)
    temp_path = Path(temp_handle.name)
    temp_handle.close()
    try:
        with closing(get_db(db_path)) as source:
            with closing(sqlite3.connect(temp_path)) as destination:
                source.backup(destination)
                destination.commit()
        return temp_path.read_bytes()
    finally:
        temp_path.unlink(missing_ok=True)


def read_backup_snapshot(raw: bytes) -> dict:
    if not raw.startswith(b"SQLite format 3\x00"):
        raise ValueError("Il file selezionato non e un database SQLite valido.")
    temp_handle = tempfile.NamedTemporaryFile(prefix="gestore-restore-", suffix=".sqlite3", dir=DATA_DIR, delete=False)
    temp_path = Path(temp_handle.name)
    try:
        temp_handle.write(raw)
        temp_handle.close()
        uri = f"file:{temp_path.as_posix()}?mode=ro"
        with closing(sqlite3.connect(uri, uri=True)) as conn:
            check = conn.execute("PRAGMA quick_check").fetchone()
            if not check or str(check[0]).lower() != "ok":
                raise ValueError("Il database di backup risulta danneggiato.")
            table = conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='app_state'").fetchone()
            if not table:
                raise ValueError("Questo database non contiene un backup GestOre.")
            row = conn.execute(
                "SELECT entries_json, settings_json, payslips_json, sync_meta_json, updated_at FROM app_state WHERE profile_id = ?",
                (PROFILE_ID,),
            ).fetchone()
            if not row:
                row = conn.execute(
                    "SELECT entries_json, settings_json, payslips_json, sync_meta_json, updated_at FROM app_state LIMIT 1"
                ).fetchone()
            if not row:
                raise ValueError("Il backup GestOre e vuoto.")
            return _snapshot_from_row(row)
    finally:
        if not temp_handle.closed:
            temp_handle.close()
        temp_path.unlink(missing_ok=True)


class GestOreHandler(SimpleHTTPRequestHandler):
    server_version = "GestOreHTTP/3.0"

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def _send_json(self, payload: dict, status: int = HTTPStatus.OK, cookie: str | None = None) -> None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        if cookie:
            self.send_header("Set-Cookie", cookie)
        self.end_headers()
        self.wfile.write(data)

    def _send_bytes(self, data: bytes, content_type: str, filename: str) -> None:
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _read_body(self, maximum: int) -> bytes:
        length = int(self.headers.get("Content-Length", "0") or 0)
        if length < 0 or length > maximum:
            raise ValueError("File o richiesta troppo grande.")
        return self.rfile.read(length) if length else b""

    def _read_json_body(self) -> dict:
        raw = self._read_body(MAX_JSON_BYTES) or b"{}"
        try:
            payload = json.loads(raw.decode("utf-8"))
        except Exception as exc:
            raise ValueError(f"JSON non valido: {exc}") from exc
        if not isinstance(payload, dict):
            raise ValueError("Il body deve essere un oggetto JSON.")
        return payload

    def _session_token(self) -> str:
        raw = self.headers.get("Cookie", "")
        if not raw:
            return ""
        try:
            cookie = SimpleCookie()
            cookie.load(raw)
            morsel = cookie.get(SESSION_COOKIE)
            return morsel.value if morsel else ""
        except Exception:
            return ""

    def _session_cookie(self, token: str, clear: bool = False) -> str:
        value = "" if clear else token
        max_age = 0 if clear else 180 * 24 * 60 * 60
        cookie = f"{SESSION_COOKIE}={value}; Path=/; HttpOnly; SameSite=Lax; Max-Age={max_age}"
        forwarded_proto = str(self.headers.get("X-Forwarded-Proto", "")).lower()
        if forwarded_proto == "https":
            cookie += "; Secure"
        return cookie

    def _current_user(self) -> dict | None:
        return AUTH_STORE.get_user_for_token(self._session_token())

    def _require_user(self) -> dict | None:
        user = self._current_user()
        if not user:
            self._send_json({"error": "Accedi per continuare.", "code": "authentication_required"}, HTTPStatus.UNAUTHORIZED)
            return None
        return user

    def _snapshot_db_for_request(self) -> Path | None:
        user = self._current_user()
        if user:
            return AUTH_STORE.user_db_path(user["id"])
        if not AUTH_STORE.has_accounts():
            return DB_PATH
        self._send_json({"error": "Accedi per aprire i tuoi dati.", "code": "authentication_required"}, HTTPStatus.UNAUTHORIZED)
        return None

    def _same_origin(self) -> bool:
        origin = str(self.headers.get("Origin", "")).strip()
        if not origin:
            return True
        origin_host = urlparse(origin).netloc.lower()
        request_host = str(self.headers.get("Host", "")).lower()
        return bool(origin_host and origin_host == request_host)

    def _reject_cross_origin(self) -> bool:
        if self._same_origin():
            return False
        self._send_json({"error": "Origine richiesta non valida."}, HTTPStatus.FORBIDDEN)
        return True

    def _send_auth_error(self, exc: AuthError) -> None:
        self._send_json({"error": str(exc), "code": exc.code}, exc.status)

    def _snapshot_ack(self, saved: dict, mutation_id: str = "", **extra) -> dict:
        payload = {
            "ok": True,
            "mutationId": str(mutation_id or ""),
            "updatedAt": int(saved.get("updatedAt") or 0),
            "entries": len(saved.get("entries") or {}),
            "payslips": len(saved.get("payslips") or []),
        }
        payload.update(extra)
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
        if parsed.path == "/api/auth/status":
            user = self._current_user()
            account_count = AUTH_STORE.account_count()
            has_legacy_data = account_count == 0 and snapshot_has_data(load_compact_snapshot(db_path=DB_PATH))
            self._send_json({
                "authenticated": bool(user),
                "user": user,
                "hasAccounts": account_count > 0,
                "setupRequired": account_count == 0,
                "hasLegacyData": has_legacy_data,
            })
            return
        if parsed.path == "/api/admin/accounts":
            try:
                accounts = [account_snapshot_summary(account) for account in AUTH_STORE.list_accounts(self._session_token())]
                current = self._current_user()
                self._send_json({
                    "ok": True,
                    "accounts": accounts,
                    "activeUserId": str((current or {}).get("id") or ""),
                })
            except AuthError as exc:
                self._send_auth_error(exc)
            return
        if parsed.path == "/api/storage":
            user = self._require_user()
            if not user:
                return
            self._send_json(database_storage_summary(AUTH_STORE.user_db_path(user["id"])))
            return
        if parsed.path == "/api/snapshot":
            db_path = self._snapshot_db_for_request()
            if db_path is not None:
                query = parse_qs(parsed.query or "")
                snapshot = (
                    load_compact_snapshot(db_path=db_path)
                    if query.get("compact") == ["1"]
                    else load_snapshot(db_path=db_path)
                )
                self._send_json(snapshot)
            return
        if parsed.path == "/api/payslip":
            db_path = self._snapshot_db_for_request()
            if db_path is not None:
                query = parse_qs(parsed.query or "")
                payslip_id = str((query.get("id") or [""])[0]).strip()
                payslip = next(
                    (item for item in load_snapshot(db_path=db_path).get("payslips") or [] if _payslip_key(item) == payslip_id),
                    None,
                )
                if payslip is None:
                    self._send_json({"error": "Busta paga non trovata."}, HTTPStatus.NOT_FOUND)
                else:
                    self._send_json({"ok": True, "payslip": payslip})
            return
        if parsed.path == "/api/backup":
            user = self._require_user()
            if not user:
                return
            data = create_backup_bytes(AUTH_STORE.user_db_path(user["id"]))
            date_label = time.strftime("%Y-%m-%d")
            filename = f"GestOre_Backup_{user['username']}_{date_label}.sqlite3"
            self._send_bytes(data, "application/vnd.sqlite3", filename)
            return
        return super().do_GET()

    def _handle_snapshot_write(self) -> None:
        db_path = self._snapshot_db_for_request()
        if db_path is None:
            return
        try:
            payload = self._read_json_body()
            saved = save_snapshot(payload, db_path=db_path)
            prefer_minimal = "return=minimal" in str(self.headers.get("Prefer", "")).lower()
            if prefer_minimal:
                self._send_json(self._snapshot_ack(saved, self.headers.get("X-GestOre-Mutation-Id", "")))
            else:
                self._send_json(saved)
        except ValueError as exc:
            self._send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
        except Exception as exc:
            self._send_json({"error": f"Errore interno: {exc}"}, HTTPStatus.INTERNAL_SERVER_ERROR)

    def _handle_payslip_write(self) -> None:
        db_path = self._snapshot_db_for_request()
        if db_path is None:
            return
        try:
            payload = self._read_json_body()
            payslip = payload.get("payslip")
            mutation_id = str(payload.get("mutationId") or self.headers.get("X-GestOre-Mutation-Id", ""))
            saved = save_payslip_record(payslip, db_path, payload.get("updatedAt"))
            self._send_json(self._snapshot_ack(
                saved,
                mutation_id,
                payslipId=_payslip_key(payslip),
            ))
        except ValueError as exc:
            self._send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
        except Exception as exc:
            self._send_json({"error": f"Errore interno: {exc}"}, HTTPStatus.INTERNAL_SERVER_ERROR)

    def do_PUT(self) -> None:
        if self._reject_cross_origin():
            return
        path = urlparse(self.path).path
        if path == "/api/snapshot":
            self._handle_snapshot_write()
            return
        if path == "/api/payslip":
            self._handle_payslip_write()
            return
        if path != "/api/snapshot":
            self.send_error(HTTPStatus.NOT_FOUND, "Endpoint non trovato")
            return

    def do_POST(self) -> None:
        if self._reject_cross_origin():
            return
        parsed = urlparse(self.path)
        try:
            if parsed.path == "/api/auth/register":
                payload = self._read_json_body()
                user, token, first_account = AUTH_STORE.create_account(payload.get("username", ""), payload.get("password", ""))
                user_db = AUTH_STORE.user_db_path(user["id"])
                if first_account:
                    initial = merge_snapshots(load_snapshot(db_path=DB_PATH), payload.get("snapshot"))
                    save_snapshot(initial, db_path=user_db, force_replace=True)
                else:
                    get_db(user_db).close()
                self._send_json(
                    {"ok": True, "user": user, "importedLegacyData": first_account},
                    HTTPStatus.CREATED,
                    self._session_cookie(token),
                )
                return
            if parsed.path == "/api/auth/login":
                payload = self._read_json_body()
                user, token = AUTH_STORE.login(payload.get("username", ""), payload.get("password", ""))
                self._send_json({"ok": True, "user": user}, cookie=self._session_cookie(token))
                return
            if parsed.path == "/api/auth/logout":
                AUTH_STORE.logout(self._session_token())
                self._send_json({"ok": True}, cookie=self._session_cookie("", clear=True))
                return
            if parsed.path == "/api/admin/access":
                payload = self._read_json_body()
                user = AUTH_STORE.switch_admin_account(self._session_token(), payload.get("userId", ""))
                self._send_json({"ok": True, "user": user})
                return
            if parsed.path == "/api/admin/return":
                user = AUTH_STORE.return_to_owner(self._session_token())
                self._send_json({"ok": True, "user": user})
                return
            if parsed.path == "/api/backup/restore":
                user = self._require_user()
                if not user:
                    return
                raw = self._read_body(MAX_BACKUP_BYTES)
                restored = read_backup_snapshot(raw)
                restored["allowEmptyEntries"] = True
                saved = save_snapshot(restored, db_path=AUTH_STORE.user_db_path(user["id"]), force_replace=True)
                self._send_json({
                    "ok": True,
                    "entries": len(saved.get("entries") or {}),
                    "payslips": len(saved.get("payslips") or []),
                    "updatedAt": saved.get("updatedAt", 0),
                })
                return
            if parsed.path == "/api/snapshot":
                self._handle_snapshot_write()
                return
            self.send_error(HTTPStatus.NOT_FOUND, "Endpoint non trovato")
        except AuthError as exc:
            self._send_auth_error(exc)
        except ValueError as exc:
            self._send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
        except Exception as exc:
            self._send_json({"error": f"Errore interno: {exc}"}, HTTPStatus.INTERNAL_SERVER_ERROR)

    def do_DELETE(self) -> None:
        if self._reject_cross_origin():
            return
        parsed = urlparse(self.path)
        try:
            if parsed.path == "/api/payslip":
                db_path = self._snapshot_db_for_request()
                if db_path is None:
                    return
                payload = self._read_json_body()
                mutation_id = str(payload.get("mutationId") or self.headers.get("X-GestOre-Mutation-Id", ""))
                payslip_id = str(payload.get("payslipId") or "").strip()
                saved = delete_payslip_record(payslip_id, db_path, payload.get("updatedAt"))
                self._send_json(self._snapshot_ack(saved, mutation_id, payslipId=payslip_id, deleted=True))
                return
            if parsed.path != "/api/admin/accounts":
                self.send_error(HTTPStatus.NOT_FOUND, "Endpoint non trovato")
                return
            payload = self._read_json_body()
            deleted = AUTH_STORE.delete_account(
                self._session_token(),
                payload.get("userId", ""),
                payload.get("confirmation", ""),
            )
            self._send_json({"ok": True, "deleted": deleted})
        except AuthError as exc:
            self._send_auth_error(exc)
        except ValueError as exc:
            self._send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
        except Exception as exc:
            self._send_json({"error": f"Errore interno: {exc}"}, HTTPStatus.INTERNAL_SERVER_ERROR)

    def translate_path(self, path: str) -> str:
        parsed_path = urlparse(path).path
        parsed_path = unquote(parsed_path)
        parsed_path = posixpath.normpath(parsed_path)
        words = [word for word in parsed_path.split("/") if word and word not in (".", "..")]
        candidate = FRONTEND_DIR
        for word in words:
            candidate = candidate / word
        if parsed_path in ("", "/"):
            return str(FRONTEND_DIR / "index.html")
        if candidate.is_dir():
            index = candidate / "index.html"
            if index.exists():
                return str(index)
        return str(candidate)


def main() -> int:
    parser = argparse.ArgumentParser(description="Server GestOre con account e database separati")
    parser.add_argument("--host", default="0.0.0.0", help="Host di ascolto")
    parser.add_argument("--port", type=int, default=8080, help="Porta HTTP")
    args = parser.parse_args()

    os.chdir(FRONTEND_DIR)
    httpd = ThreadingHTTPServer((args.host, args.port), GestOreHandler)
    print(f"GestOre attivo su http://{args.host}:{args.port}")
    print(f"Frontend: {FRONTEND_DIR}")
    print(f"Database legacy: {DB_PATH}")
    print(f"Account: {AUTH_STORE.accounts_db}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nChiusura server...")
    finally:
        httpd.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
