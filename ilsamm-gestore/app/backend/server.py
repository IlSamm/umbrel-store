#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
import binascii
import gzip
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
from history_store import (
    list_history,
    mark_reverted,
    read_history_item,
    record_payslip_change,
    record_snapshot_changes,
)
from push_service import PushService
from webauthn import (
    generate_authentication_options,
    generate_registration_options,
    options_to_json,
    verify_authentication_response,
    verify_registration_response,
)
from webauthn.helpers.structs import (
    AuthenticatorSelectionCriteria,
    AuthenticatorTransport,
    PublicKeyCredentialDescriptor,
    ResidentKeyRequirement,
    UserVerificationRequirement,
)


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
MAX_PAYSLIP_ASSET_BYTES = 24 * 1024 * 1024
MAX_PAYSLIP_ASSETS = 12
LEGAL_VERSION = "2026-08-21"
BUILD_VERSION = "1.8.7"
BUILD_CACHE = "20260823e"
DEPLOYMENT_MODE = str(os.environ.get("GESTORE_DEPLOYMENT_MODE", "private")).strip().lower()
if DEPLOYMENT_MODE not in {"private", "public"}:
    DEPLOYMENT_MODE = "private"
PUBLIC_MODE = DEPLOYMENT_MODE == "public"
_configured_origins = {
    value.strip().rstrip("/")
    for value in str(os.environ.get("GESTORE_ALLOWED_ORIGINS", "")).split(",")
    if value.strip()
}
ALLOWED_APP_ORIGINS = _configured_origins | ({"capacitor://localhost"} if PUBLIC_MODE else set())
AUTH_STORE = AuthStore(DATA_DIR, public_mode=PUBLIC_MODE)
PUSH_SERVICE = PushService(AUTH_STORE, DATA_DIR)

_DB_SCHEMA_LOCK = threading.Lock()
_DB_SCHEMA_READY: set[str] = set()
_SNAPSHOT_LOCKS_GUARD = threading.Lock()
_SNAPSHOT_LOCKS: dict[str, threading.RLock] = {}
_VERSIONED_BACKUP_LOCK = threading.RLock()
AUTO_BACKUP_DEFAULT_FREQUENCY = "daily"
AUTO_BACKUP_INTERVALS_MS = {
    "daily": 24 * 60 * 60 * 1000,
    "every3days": 3 * 24 * 60 * 60 * 1000,
    "weekly": 7 * 24 * 60 * 60 * 1000,
    "monthly": 30 * 24 * 60 * 60 * 1000,
}
AUTO_BACKUP_LIMIT = 14
MANUAL_BACKUP_LIMIT = 8
RESTORE_BACKUP_LIMIT = 4
AUTH_RATE_WINDOW_MS = 10 * 60 * 1000
AUTH_RATE_MAX_ATTEMPTS = 6
_AUTH_RATE_LOCK = threading.Lock()
_AUTH_RATE_ATTEMPTS: dict[str, list[int]] = {}

DEFAULT_SYNC_META = {
    "entriesUpdatedAt": 0,
    "settingsUpdatedAt": 0,
    "payslipsUpdatedAt": 0,
    "lastServerSyncAt": 0,
}


def _rate_limit_key(scope: str, client: str, identity: str = "") -> str:
    return f"{scope}:{str(client or 'unknown')[:120]}:{str(identity or '').casefold()[:80]}"


def check_auth_rate_limit(key: str) -> int:
    now = int(time.time() * 1000)
    cutoff = now - AUTH_RATE_WINDOW_MS
    with _AUTH_RATE_LOCK:
        attempts = [value for value in _AUTH_RATE_ATTEMPTS.get(key, []) if value > cutoff]
        _AUTH_RATE_ATTEMPTS[key] = attempts
        if len(attempts) < AUTH_RATE_MAX_ATTEMPTS:
            return 0
        return max(1, int((attempts[0] + AUTH_RATE_WINDOW_MS - now + 999) / 1000))


def register_auth_failure(key: str) -> None:
    now = int(time.time() * 1000)
    cutoff = now - AUTH_RATE_WINDOW_MS
    with _AUTH_RATE_LOCK:
        attempts = [value for value in _AUTH_RATE_ATTEMPTS.get(key, []) if value > cutoff]
        attempts.append(now)
        _AUTH_RATE_ATTEMPTS[key] = attempts[-AUTH_RATE_MAX_ATTEMPTS:]


def clear_auth_failures(key: str) -> None:
    with _AUTH_RATE_LOCK:
        _AUTH_RATE_ATTEMPTS.pop(key, None)


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
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS payslip_assets (
                        profile_id TEXT NOT NULL,
                        payslip_id TEXT NOT NULL,
                        asset_index INTEGER NOT NULL,
                        asset_id TEXT NOT NULL,
                        mime_type TEXT NOT NULL,
                        file_name TEXT,
                        created_at INTEGER NOT NULL,
                        data BLOB NOT NULL,
                        PRIMARY KEY (profile_id, payslip_id, asset_index)
                    )
                    """
                )
                conn.execute(
                    "CREATE INDEX IF NOT EXISTS payslip_assets_record_idx ON payslip_assets(profile_id, payslip_id)"
                )
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
    with _snapshot_lock(db_path):
        with closing(get_db(db_path)) as conn:
            _migrate_legacy_payslip_assets(conn, profile_id)
            conn.commit()
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
    photo_field_was_provided = "photos" in record or "imageData" in record
    photos_deferred = record.pop("photosDeferred", False) is True
    source_deferred = record.pop("sourceTextDeferred", False) is True
    declared_photo_count = max(0, int(record.pop("photoCount", 0) or 0))

    if photos_deferred:
        previous_photos = previous.get("photos") if isinstance(previous.get("photos"), list) else []
        previous_image = str(previous.get("imageData") or "")
        if not previous_photos and previous_image:
            previous_photos = [{
                "id": f"legacy-{_payslip_key(previous, 'photo')}",
                "data": previous_image,
                "fileName": str(previous.get("fileName") or "busta-paga.jpg"),
            }]
        if previous_photos:
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
    else:
        record.pop("photos", None)
        record.pop("imageData", None)
        if photo_field_was_provided and not photos_deferred:
            record["_clearPhotos"] = True
        preserved_count = max(declared_photo_count, int(previous.get("photoCount") or 0)) if photos_deferred else declared_photo_count
        if preserved_count:
            record["photoCount"] = preserved_count
            record["photosDeferred"] = True
    return record


def _decode_payslip_asset(value: str) -> tuple[str, bytes]:
    raw = str(value or "").strip()
    if not raw:
        raise ValueError("Immagine del cedolino vuota.")
    mime_type = "image/jpeg"
    payload = raw
    if raw.startswith("data:"):
        header, separator, payload = raw.partition(",")
        if not separator or ";base64" not in header.lower():
            raise ValueError("Formato immagine del cedolino non valido.")
        mime_type = str(header[5:].split(";", 1)[0] or mime_type).lower()[:120]
    try:
        decoded = base64.b64decode(payload, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ValueError("Immagine del cedolino danneggiata.") from exc
    if not decoded:
        raise ValueError("Immagine del cedolino vuota.")
    if len(decoded) > MAX_PAYSLIP_ASSET_BYTES:
        raise ValueError("Una foto del cedolino supera il limite consentito.")
    return mime_type, decoded


def _asset_count(conn: sqlite3.Connection, profile_id: str, payslip_id: str) -> int:
    row = conn.execute(
        "SELECT COUNT(*) FROM payslip_assets WHERE profile_id = ? AND payslip_id = ?",
        (profile_id, payslip_id),
    ).fetchone()
    return int(row[0] or 0) if row else 0


def _persist_payslip_assets(
    conn: sqlite3.Connection,
    profile_id: str,
    record: dict,
) -> dict:
    stored = dict(record if isinstance(record, dict) else {})
    payslip_id = _payslip_key(stored)
    if not payslip_id:
        return stored

    raw_photos = stored.get("photos") if isinstance(stored.get("photos"), list) else []
    legacy_image = str(stored.get("imageData") or "")
    if not raw_photos and legacy_image:
        raw_photos = [{
            "id": f"legacy-{payslip_id}-0",
            "data": legacy_image,
            "fileName": str(stored.get("fileName") or "busta-paga.jpg"),
            "createdAt": int(stored.get("createdAt") or time.time() * 1000),
        }]
    photos_with_data = [
        photo for photo in raw_photos
        if isinstance(photo, dict) and str(photo.get("data") or photo.get("imageData") or photo.get("dataUrl") or "").strip()
    ]
    explicit_empty = stored.pop("_clearPhotos", False) is True or (("photos" in stored or "imageData" in stored) and not photos_with_data)
    deferred = stored.get("photosDeferred") is True

    if len(photos_with_data) > MAX_PAYSLIP_ASSETS:
        raise ValueError(f"Puoi salvare al massimo {MAX_PAYSLIP_ASSETS} foto per cedolino.")
    if photos_with_data:
        conn.execute(
            "DELETE FROM payslip_assets WHERE profile_id = ? AND payslip_id = ?",
            (profile_id, payslip_id),
        )
        for index, photo in enumerate(photos_with_data):
            data_value = str(photo.get("data") or photo.get("imageData") or photo.get("dataUrl") or "")
            mime_type, blob = _decode_payslip_asset(data_value)
            conn.execute(
                """
                INSERT INTO payslip_assets (
                    profile_id, payslip_id, asset_index, asset_id,
                    mime_type, file_name, created_at, data
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    profile_id,
                    payslip_id,
                    index,
                    str(photo.get("id") or f"photo-{payslip_id}-{index}")[:180],
                    mime_type,
                    str(photo.get("fileName") or f"cedolino-{index + 1}.jpg")[:260],
                    int(photo.get("createdAt") or stored.get("createdAt") or time.time() * 1000),
                    sqlite3.Binary(blob),
                ),
            )
    elif explicit_empty and not deferred:
        conn.execute(
            "DELETE FROM payslip_assets WHERE profile_id = ? AND payslip_id = ?",
            (profile_id, payslip_id),
        )

    photo_count = _asset_count(conn, profile_id, payslip_id)
    stored.pop("photos", None)
    stored.pop("imageData", None)
    stored.pop("thumbnail", None)
    stored["photoCount"] = photo_count
    stored["photosDeferred"] = photo_count > 0
    if photos_with_data:
        stored["fileName"] = str(photos_with_data[0].get("fileName") or stored.get("fileName") or "")
    return stored


def _persist_payslip_collection(
    conn: sqlite3.Connection,
    profile_id: str,
    items: list,
    cleanup: bool = True,
) -> list:
    stored_items = []
    retained_ids = []
    for index, item in enumerate(items if isinstance(items, list) else []):
        if not isinstance(item, dict):
            continue
        record = dict(item)
        if not record.get("id"):
            record["id"] = f"legacy-{index}"
        record = _persist_payslip_assets(conn, profile_id, record)
        stored_items.append(record)
        retained_ids.append(_payslip_key(record))
    if cleanup:
        if retained_ids:
            placeholders = ",".join("?" for _ in retained_ids)
            conn.execute(
                f"DELETE FROM payslip_assets WHERE profile_id = ? AND payslip_id NOT IN ({placeholders})",
                (profile_id, *retained_ids),
            )
        else:
            conn.execute("DELETE FROM payslip_assets WHERE profile_id = ?", (profile_id,))
    return stored_items


def _migrate_legacy_payslip_assets(conn: sqlite3.Connection, profile_id: str) -> None:
    row = conn.execute(
        "SELECT payslips_json FROM app_state WHERE profile_id = ?",
        (profile_id,),
    ).fetchone()
    if not row:
        return
    items = _parse_json(row[0], [])
    if not isinstance(items, list):
        return
    has_embedded_assets = any(
        isinstance(item, dict) and (
            bool(item.get("imageData")) or
            any(isinstance(photo, dict) and bool(photo.get("data") or photo.get("imageData") or photo.get("dataUrl")) for photo in (item.get("photos") or []))
        )
        for item in items
    )
    if not has_embedded_assets:
        return
    migrated = _persist_payslip_collection(conn, profile_id, items)
    compact = compact_payslip_records(migrated)
    conn.execute(
        "UPDATE app_state SET payslips_json = ?, payslips_compact_json = ? WHERE profile_id = ?",
        (
            json.dumps(migrated, ensure_ascii=False),
            json.dumps(compact, ensure_ascii=False),
            profile_id,
        ),
    )


def load_payslip_record(
    payslip_id: str,
    profile_id: str = PROFILE_ID,
    db_path: Path = DB_PATH,
) -> dict | None:
    clean_id = str(payslip_id or "").strip()
    if not clean_id:
        return None
    with _snapshot_lock(db_path):
        snapshot = load_snapshot(profile_id=profile_id, db_path=db_path)
        record = next(
            (dict(item) for item in snapshot.get("payslips") or [] if _payslip_key(item) == clean_id),
            None,
        )
        if record is None:
            return None
        with closing(get_db(db_path)) as conn:
            rows = conn.execute(
                """
                SELECT asset_index, asset_id, mime_type, file_name, created_at, data
                FROM payslip_assets
                WHERE profile_id = ? AND payslip_id = ?
                ORDER BY asset_index
                """,
                (profile_id, clean_id),
            ).fetchall()
        photos = []
        for row in rows:
            encoded = base64.b64encode(bytes(row[5])).decode("ascii")
            photos.append({
                "id": str(row[1] or f"photo-{clean_id}-{row[0]}"),
                "data": f"data:{str(row[2] or 'image/jpeg')};base64,{encoded}",
                "fileName": str(row[3] or f"cedolino-{int(row[0]) + 1}.jpg"),
                "createdAt": int(row[4] or 0),
            })
        record["photos"] = photos
        record["photoCount"] = len(photos)
        record["photosDeferred"] = False
        record["imageData"] = photos[0]["data"] if photos else ""
        if photos:
            record["fileName"] = photos[0]["fileName"]
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
            _migrate_legacy_payslip_assets(conn, profile_id)
            conn.commit()
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
                payslips = _persist_payslip_collection(conn, profile_id, payslips)
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
    backups = list_versioned_backups(db_path)
    backup_bytes = sum(int(item.get("bytes") or 0) for item in backups)
    with closing(get_db(db_path)) as conn:
        asset_summary = conn.execute(
            "SELECT COUNT(*), COALESCE(SUM(LENGTH(data)), 0) FROM payslip_assets WHERE profile_id = ?",
            (PROFILE_ID,),
        ).fetchone()
    return {
        "bytes": database_bytes + wal_bytes + shm_bytes + backup_bytes,
        "databaseBytes": database_bytes,
        "journalBytes": wal_bytes + shm_bytes,
        "backupBytes": backup_bytes,
        "backups": len(backups),
        "entries": len(snapshot.get("entries") or {}),
        "payslips": len(snapshot.get("payslips") or []),
        "payslipPhotos": int(asset_summary[0] or 0) if asset_summary else 0,
        "payslipPhotoBytes": int(asset_summary[1] or 0) if asset_summary else 0,
        "updatedAt": int(snapshot.get("updatedAt") or 0),
    }


def database_diagnostics(db_path: Path) -> dict:
    path = Path(db_path).resolve()
    started = time.perf_counter()
    with closing(get_db(path)) as conn:
        integrity_row = conn.execute("PRAGMA quick_check").fetchone()
        journal_row = conn.execute("PRAGMA journal_mode").fetchone()
        history_row = conn.execute(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'change_history'"
        ).fetchone()
        history_count = 0
        history_bytes = 0
        if history_row and int(history_row[0] or 0):
            history_summary = conn.execute(
                "SELECT COUNT(*) AS count, COALESCE(SUM(LENGTH(before_blob)), 0) AS bytes FROM change_history"
            ).fetchone()
            history_count = int(history_summary[0] or 0)
            history_bytes = int(history_summary[1] or 0)
    storage = database_storage_summary(path)
    return {
        "ok": str((integrity_row or [""])[0]).lower() == "ok",
        "integrity": str((integrity_row or ["unknown"])[0]),
        "journalMode": str((journal_row or ["unknown"])[0]),
        "checkedAt": int(time.time() * 1000),
        "durationMs": round((time.perf_counter() - started) * 1000, 2),
        "historyItems": history_count,
        "historyBytes": history_bytes,
        "serverVersion": BUILD_VERSION,
        "serverCache": BUILD_CACHE,
        **storage,
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


def _versioned_backup_directory(db_path: Path) -> Path:
    database = Path(db_path).resolve()
    directory = (database.parent / "backups").resolve()
    if directory.parent != database.parent:
        raise ValueError("Percorso backup non valido.")
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def _versioned_backup_metadata(path: Path) -> dict | None:
    name = path.name
    if not name.endswith(".sqlite3"):
        return None
    backup_id = name[:-8]
    separator = backup_id.find("-")
    if separator <= 0:
        return None
    created_text = backup_id[:separator]
    kind = backup_id[separator + 1:]
    if not created_text.isdigit() or kind not in {"auto", "manual", "pre-restore"}:
        return None
    try:
        size = path.stat().st_size
    except OSError:
        return None
    return {
        "id": backup_id,
        "kind": kind,
        "createdAt": int(created_text),
        "bytes": max(0, int(size)),
    }


def list_versioned_backups(db_path: Path) -> list[dict]:
    directory = _versioned_backup_directory(db_path)
    backups = []
    for path in directory.glob("*.sqlite3"):
        metadata = _versioned_backup_metadata(path)
        if metadata:
            backups.append(metadata)
    backups.sort(key=lambda item: int(item["createdAt"]), reverse=True)
    return backups


def _prune_versioned_backups(db_path: Path) -> None:
    limits = {
        "auto": AUTO_BACKUP_LIMIT,
        "manual": MANUAL_BACKUP_LIMIT,
        "pre-restore": RESTORE_BACKUP_LIMIT,
    }
    directory = _versioned_backup_directory(db_path)
    grouped: dict[str, list[dict]] = {kind: [] for kind in limits}
    for item in list_versioned_backups(db_path):
        grouped[item["kind"]].append(item)
    for kind, items in grouped.items():
        for stale in items[limits[kind]:]:
            (directory / f"{stale['id']}.sqlite3").unlink(missing_ok=True)


def resolve_auto_backup_frequency(snapshot: dict | None) -> str:
    source = snapshot if isinstance(snapshot, dict) else {}
    settings = source.get("settings") if isinstance(source.get("settings"), dict) else {}
    frequency = str(settings.get("protectedHistoryFrequency") or AUTO_BACKUP_DEFAULT_FREQUENCY).strip().lower()
    return frequency if frequency in {"off", *AUTO_BACKUP_INTERVALS_MS.keys()} else AUTO_BACKUP_DEFAULT_FREQUENCY


def resolve_auto_backup_interval_ms(snapshot: dict | None) -> int | None:
    frequency = resolve_auto_backup_frequency(snapshot)
    return None if frequency == "off" else AUTO_BACKUP_INTERVALS_MS[frequency]


def create_versioned_backup(
    db_path: Path,
    kind: str = "manual",
    force: bool = False,
    auto_interval_ms: int | None = None,
) -> dict | None:
    kind = str(kind or "manual")
    if kind not in {"auto", "manual", "pre-restore"}:
        raise ValueError("Tipo di backup non valido.")
    database = Path(db_path).resolve()
    if not database.exists():
        return None
    with _VERSIONED_BACKUP_LOCK:
        existing = list_versioned_backups(database)
        if kind == "auto" and not force:
            interval_ms = max(60 * 60 * 1000, int(auto_interval_ms or AUTO_BACKUP_INTERVALS_MS[AUTO_BACKUP_DEFAULT_FREQUENCY]))
            latest_auto = next((item for item in existing if item["kind"] == "auto"), None)
            if latest_auto and int(time.time() * 1000) - int(latest_auto["createdAt"]) < interval_ms:
                return latest_auto
        if not force and not snapshot_has_data(load_compact_snapshot(db_path=database)):
            return None
        created_at = int(time.time() * 1000)
        directory = _versioned_backup_directory(database)
        backup_id = f"{created_at}-{kind}"
        while (directory / f"{backup_id}.sqlite3").exists():
            created_at += 1
            backup_id = f"{created_at}-{kind}"
        target = directory / f"{backup_id}.sqlite3"
        temporary = directory / f".{backup_id}.tmp"
        try:
            temporary.write_bytes(create_backup_bytes(database))
            os.replace(temporary, target)
        finally:
            temporary.unlink(missing_ok=True)
        _prune_versioned_backups(database)
        return _versioned_backup_metadata(target)


def create_scheduled_backup(db_path: Path, snapshot: dict | None = None) -> dict | None:
    interval_ms = resolve_auto_backup_interval_ms(snapshot)
    if interval_ms is None:
        return None
    return create_versioned_backup(db_path, "auto", auto_interval_ms=interval_ms)


def delete_versioned_backup(db_path: Path, backup_id: str) -> dict:
    clean_id = str(backup_id or "").strip()
    directory = _versioned_backup_directory(db_path)
    target = (directory / f"{clean_id}.sqlite3").resolve()
    if target.parent != directory or _versioned_backup_metadata(target) is None:
        raise ValueError("Backup non trovato.")
    target.unlink(missing_ok=False)
    return {"id": clean_id}


def restore_versioned_backup(db_path: Path, backup_id: str) -> dict:
    clean_id = str(backup_id or "").strip()
    directory = _versioned_backup_directory(db_path)
    target = (directory / f"{clean_id}.sqlite3").resolve()
    if target.parent != directory or _versioned_backup_metadata(target) is None:
        raise ValueError("Backup non trovato.")
    create_versioned_backup(db_path, "pre-restore", force=True)
    restored = read_backup_snapshot(target.read_bytes())
    restored["allowEmptyEntries"] = True
    return save_snapshot(restored, db_path=db_path, force_replace=True)


class GestOreHandler(SimpleHTTPRequestHandler):
    server_version = "GestOreHTTP/3.0"

    def end_headers(self) -> None:
        path = urlparse(self.path).path
        cors_origin = self._cors_origin() if path.startswith("/api/") else ""
        if cors_origin:
            self.send_header("Access-Control-Allow-Origin", cors_origin)
            self.send_header("Access-Control-Allow-Credentials", "true")
            self.send_header("Vary", "Origin")
        if path.startswith("/api/") or path in ("", "/", "/index.html"):
            self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
            self.send_header("Pragma", "no-cache")
            self.send_header("Expires", "0")
        elif path == "/service-worker.js":
            self.send_header("Cache-Control", "no-cache, must-revalidate")
            self.send_header("Service-Worker-Allowed", "/")
        elif path.endswith(".webmanifest"):
            self.send_header("Cache-Control", "no-cache, must-revalidate")
        elif any(path.endswith(extension) for extension in (".css", ".js", ".png", ".svg")):
            self.send_header("Cache-Control", "public, max-age=31536000, immutable")
        else:
            self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "same-origin")
        self.send_header(
            "Content-Security-Policy",
            "default-src 'self'; connect-src 'self' https: wss:; img-src 'self' data: blob:; "
            "media-src 'self' blob:; font-src 'self' data:; script-src 'self' 'unsafe-inline'; "
            "style-src 'self' 'unsafe-inline'; worker-src 'self' blob:; object-src 'none'; "
            "base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
        )
        self.send_header("Permissions-Policy", "camera=(self), fullscreen=(self), geolocation=(), microphone=(), publickey-credentials-get=(self)")
        if str(self.headers.get("X-Forwarded-Proto", "")).lower() == "https":
            self.send_header("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        super().end_headers()

    def _send_json(self, payload: dict, status: int = HTTPStatus.OK, cookie: str | None = None) -> None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        accepts_gzip = "gzip" in str(self.headers.get("Accept-Encoding", "")).lower()
        compressed = accepts_gzip and len(data) >= 1024
        if compressed:
            data = gzip.compress(data, compresslevel=5)
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Vary", "Accept-Encoding")
        if compressed:
            self.send_header("Content-Encoding", "gzip")
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

    def _client_identifier(self) -> str:
        forwarded = str(self.headers.get("X-Forwarded-For", "")).split(",", 1)[0].strip()
        if forwarded:
            return forwarded[:120]
        return str((self.client_address or ("unknown", 0))[0])[:120]

    def _device_label(self) -> str:
        return str(self.headers.get("X-GestOre-Device", "")).strip()[:80]

    def _webauthn_context(self) -> tuple[str, str]:
        forwarded_host = str(self.headers.get("X-Forwarded-Host", "")).split(",", 1)[0].strip()
        request_host = forwarded_host or str(self.headers.get("Host", "")).strip()
        host_name = urlparse(f"//{request_host}").hostname or ""
        if not host_name:
            raise AuthError("Dominio passkey non valido.", status=400, code="invalid_passkey_domain")
        forwarded_proto = str(self.headers.get("X-Forwarded-Proto", "")).split(",", 1)[0].strip().lower()
        scheme = forwarded_proto if forwarded_proto in {"http", "https"} else "http"
        origin_header = str(self.headers.get("Origin", "")).strip().rstrip("/")
        origin = origin_header or f"{scheme}://{request_host}"
        return host_name, origin

    @staticmethod
    def _passkey_descriptors(items: list[dict]) -> list[PublicKeyCredentialDescriptor]:
        descriptors = []
        for item in items:
            transports = []
            for value in item.get("transports") or []:
                try:
                    transports.append(AuthenticatorTransport(str(value)))
                except ValueError:
                    continue
            descriptors.append(PublicKeyCredentialDescriptor(
                id=bytes(item.get("id") or b""),
                transports=transports or None,
            ))
        return descriptors

    def _session_cookie(self, token: str, clear: bool = False) -> str:
        value = "" if clear else token
        max_age = 0 if clear else 180 * 24 * 60 * 60
        native_cross_origin = bool(self._cors_origin())
        same_site = "None" if native_cross_origin else "Lax"
        cookie = f"{SESSION_COOKIE}={value}; Path=/; HttpOnly; SameSite={same_site}; Max-Age={max_age}"
        forwarded_proto = str(self.headers.get("X-Forwarded-Proto", "")).lower()
        if forwarded_proto == "https" or native_cross_origin:
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

    def _cors_origin(self) -> str:
        origin = str(self.headers.get("Origin", "")).strip().rstrip("/")
        return origin if origin in ALLOWED_APP_ORIGINS else ""

    def _same_origin(self) -> bool:
        origin = str(self.headers.get("Origin", "")).strip().rstrip("/")
        if not origin:
            return True
        if origin in ALLOWED_APP_ORIGINS:
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

    def do_OPTIONS(self) -> None:
        parsed = urlparse(self.path)
        if not parsed.path.startswith("/api/"):
            self.send_error(HTTPStatus.NOT_FOUND, "Endpoint non trovato")
            return
        origin = str(self.headers.get("Origin", "")).strip().rstrip("/")
        if origin and not self._same_origin():
            self._send_json({"error": "Origine richiesta non valida."}, HTTPStatus.FORBIDDEN)
            return
        self.send_response(HTTPStatus.NO_CONTENT)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header(
            "Access-Control-Allow-Headers",
            "Content-Type, X-GestOre-Device, X-GestOre-Mutation-Id, X-Requested-With",
        )
        self.send_header("Access-Control-Max-Age", "600")
        self.end_headers()

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
                "deploymentMode": DEPLOYMENT_MODE,
            })
            return
        if parsed.path == "/api/auth/sessions":
            try:
                sessions = AUTH_STORE.list_sessions(self._session_token())
                self._send_json({"ok": True, "sessions": sessions})
            except AuthError as exc:
                self._send_auth_error(exc)
            return
        if parsed.path == "/api/auth/passkeys":
            try:
                self._send_json({"ok": True, "passkeys": AUTH_STORE.list_passkeys(self._session_token())})
            except AuthError as exc:
                self._send_auth_error(exc)
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
        if parsed.path == "/api/admin/audit":
            try:
                query = parse_qs(parsed.query or "")
                limit = int((query.get("limit") or ["50"])[0])
                self._send_json({"ok": True, "items": AUTH_STORE.list_audit(self._session_token(), limit)})
            except (AuthError, ValueError) as exc:
                if isinstance(exc, AuthError):
                    self._send_auth_error(exc)
                else:
                    self._send_json({"error": "Limite non valido."}, HTTPStatus.BAD_REQUEST)
            return
        if parsed.path == "/api/storage":
            user = self._require_user()
            if not user:
                return
            self._send_json(database_storage_summary(AUTH_STORE.user_db_path(user["id"])))
            return
        if parsed.path == "/api/diagnostics":
            user = self._require_user()
            if not user:
                return
            self._send_json(database_diagnostics(AUTH_STORE.user_db_path(user["id"])))
            return
        if parsed.path == "/api/history":
            user = self._require_user()
            if not user:
                return
            query = parse_qs(parsed.query or "")
            try:
                limit = int((query.get("limit") or ["30"])[0])
            except ValueError:
                limit = 30
            self._send_json({
                "ok": True,
                "items": list_history(AUTH_STORE.user_db_path(user["id"]), limit),
            })
            return
        if parsed.path == "/api/push/config":
            user = self._require_user()
            if not user:
                return
            self._send_json({"ok": True, **PUSH_SERVICE.configuration(str(user["id"]))})
            return
        if parsed.path == "/api/backups":
            user = self._require_user()
            if not user:
                return
            backups = list_versioned_backups(AUTH_STORE.user_db_path(user["id"]))
            self._send_json({
                "ok": True,
                "backups": backups,
                "bytes": sum(int(item.get("bytes") or 0) for item in backups),
            })
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
                payslip = load_payslip_record(payslip_id, db_path=db_path)
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
            mutation_id = str(payload.get("mutationId") or self.headers.get("X-GestOre-Mutation-Id", ""))
            current_user = self._current_user() or {}
            with _snapshot_lock(db_path):
                existing = load_snapshot(db_path=db_path)
                base_updated_at = max(0, int(payload.get("baseUpdatedAt") or 0))
                current_updated_at = max(0, int(existing.get("updatedAt") or 0))
                if base_updated_at and current_updated_at > base_updated_at:
                    self._send_json({
                        "error": "Il database e cambiato su un altro dispositivo.",
                        "code": "snapshot_conflict",
                        "serverSnapshot": existing,
                    }, HTTPStatus.CONFLICT)
                    return
                schedule_snapshot = {
                    "settings": payload.get("settings")
                    if isinstance(payload.get("settings"), dict)
                    else existing.get("settings", {})
                }
                create_scheduled_backup(db_path, schedule_snapshot)
                saved = save_snapshot(payload, db_path=db_path, _existing_snapshot=existing)
                record_snapshot_changes(
                    db_path,
                    existing,
                    saved,
                    mutation_id=mutation_id,
                    actor=str(current_user.get("username") or "Dispositivo"),
                )
            prefer_minimal = "return=minimal" in str(self.headers.get("Prefer", "")).lower()
            if prefer_minimal:
                self._send_json(self._snapshot_ack(saved, mutation_id))
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
            payslip_id = _payslip_key(payslip)
            before_snapshot = load_snapshot(db_path=db_path)
            before_payslip = next(
                (item for item in before_snapshot.get("payslips") or [] if _payslip_key(item) == payslip_id),
                None,
            )
            create_scheduled_backup(db_path, before_snapshot)
            saved = save_payslip_record(payslip, db_path, payload.get("updatedAt"))
            after_snapshot = load_snapshot(db_path=db_path)
            after_payslip = next(
                (item for item in after_snapshot.get("payslips") or [] if _payslip_key(item) == payslip_id),
                None,
            )
            current_user = self._current_user() or {}
            record_payslip_change(
                db_path,
                payslip_id=payslip_id,
                before=before_payslip,
                after=after_payslip,
                mutation_id=mutation_id,
                actor=str(current_user.get("username") or "Dispositivo"),
            )
            self._send_json(self._snapshot_ack(
                saved,
                mutation_id,
                payslipId=payslip_id,
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
            if parsed.path == "/api/auth/passkeys/register/options":
                user = self._require_user()
                if not user:
                    return
                rp_id, origin = self._webauthn_context()
                descriptors = self._passkey_descriptors(AUTH_STORE.passkey_descriptors(str(user["id"])))
                options = generate_registration_options(
                    rp_id=rp_id,
                    rp_name="GestOre",
                    user_id=bytes.fromhex(str(user["id"])),
                    user_name=str(user["username"]),
                    user_display_name=str(user["username"]),
                    timeout=120_000,
                    authenticator_selection=AuthenticatorSelectionCriteria(
                        resident_key=ResidentKeyRequirement.PREFERRED,
                        user_verification=UserVerificationRequirement.REQUIRED,
                    ),
                    exclude_credentials=descriptors,
                )
                challenge_id = AUTH_STORE.create_webauthn_challenge(
                    str(user["id"]),
                    "register",
                    options.challenge,
                    rp_id,
                    origin,
                )
                self._send_json({
                    "ok": True,
                    "challengeId": challenge_id,
                    "options": json.loads(options_to_json(options)),
                }, HTTPStatus.CREATED)
                return
            if parsed.path == "/api/auth/passkeys/register/verify":
                user = self._require_user()
                if not user:
                    return
                payload = self._read_json_body()
                challenge = AUTH_STORE.consume_webauthn_challenge(
                    payload.get("challengeId", ""),
                    "register",
                    str(user["id"]),
                )
                credential = payload.get("credential")
                if not isinstance(credential, dict):
                    raise AuthError("Risposta passkey non valida.", code="invalid_passkey")
                try:
                    verified = verify_registration_response(
                        credential=credential,
                        expected_challenge=challenge["challenge"],
                        expected_rp_id=challenge["rpId"],
                        expected_origin=challenge["origin"],
                        require_user_verification=True,
                    )
                except Exception as exc:
                    raise AuthError("Non e stato possibile verificare la passkey.", status=401, code="passkey_verification_failed") from exc
                response_payload = credential.get("response") if isinstance(credential.get("response"), dict) else {}
                passkey = AUTH_STORE.save_passkey(
                    str(user["id"]),
                    verified.credential_id,
                    verified.credential_public_key,
                    verified.sign_count,
                    transports=response_payload.get("transports") if isinstance(response_payload.get("transports"), list) else [],
                    name=payload.get("name") or self._device_label() or "Passkey",
                    aaguid=str(verified.aaguid or ""),
                    device_type=str(getattr(verified.credential_device_type, "value", verified.credential_device_type) or ""),
                    backed_up=bool(verified.credential_backed_up),
                )
                self._send_json({
                    "ok": True,
                    "passkey": passkey,
                    "passkeys": AUTH_STORE.list_passkeys(self._session_token()),
                }, HTTPStatus.CREATED)
                return
            if parsed.path == "/api/auth/passkeys/login/options":
                payload = self._read_json_body()
                username = str(payload.get("username") or "")
                rate_key = _rate_limit_key("passkey", self._client_identifier(), username)
                retry_after = check_auth_rate_limit(rate_key)
                if retry_after:
                    self._send_json({
                        "error": f"Troppi tentativi. Riprova tra {retry_after} secondi.",
                        "code": "rate_limited",
                        "retryAfter": retry_after,
                    }, HTTPStatus.TOO_MANY_REQUESTS)
                    return
                account = AUTH_STORE.get_account_by_username(username)
                descriptors = AUTH_STORE.passkey_descriptors(str((account or {}).get("id") or "")) if account else []
                if not account or not descriptors:
                    register_auth_failure(rate_key)
                    raise AuthError("Nessuna passkey disponibile per questo account.", status=404, code="passkey_not_available")
                rp_id, origin = self._webauthn_context()
                options = generate_authentication_options(
                    rp_id=rp_id,
                    timeout=120_000,
                    allow_credentials=self._passkey_descriptors(descriptors),
                    user_verification=UserVerificationRequirement.REQUIRED,
                )
                challenge_id = AUTH_STORE.create_webauthn_challenge(
                    str(account["id"]),
                    "authenticate",
                    options.challenge,
                    rp_id,
                    origin,
                )
                self._send_json({
                    "ok": True,
                    "challengeId": challenge_id,
                    "options": json.loads(options_to_json(options)),
                })
                return
            if parsed.path == "/api/auth/passkeys/login/verify":
                payload = self._read_json_body()
                challenge = AUTH_STORE.consume_webauthn_challenge(
                    payload.get("challengeId", ""),
                    "authenticate",
                )
                credential = payload.get("credential")
                if not isinstance(credential, dict):
                    raise AuthError("Risposta passkey non valida.", code="invalid_passkey")
                credential_id = str(credential.get("id") or "")
                saved_passkey = AUTH_STORE.get_passkey(credential_id)
                if not saved_passkey or str(saved_passkey["userId"]) != str(challenge["userId"]):
                    raise AuthError("Passkey non riconosciuta.", status=401, code="passkey_not_found")
                try:
                    verified = verify_authentication_response(
                        credential=credential,
                        expected_challenge=challenge["challenge"],
                        expected_rp_id=challenge["rpId"],
                        expected_origin=challenge["origin"],
                        credential_public_key=saved_passkey["publicKey"],
                        credential_current_sign_count=saved_passkey["signCount"],
                        require_user_verification=True,
                    )
                except Exception as exc:
                    AUTH_STORE.log_audit(None, str(challenge["userId"]), "session.passkey_failed")
                    raise AuthError("Passkey non valida o scaduta.", status=401, code="passkey_verification_failed") from exc
                AUTH_STORE.mark_passkey_used(credential_id, verified.new_sign_count)
                token = AUTH_STORE.create_session(
                    str(saved_passkey["userId"]),
                    user_agent=self.headers.get("User-Agent", ""),
                    device_label=self._device_label(),
                )
                AUTH_STORE.log_audit(
                    str(saved_passkey["userId"]),
                    str(saved_passkey["userId"]),
                    "session.passkey_login",
                    {"device": self._device_label() or "Dispositivo"},
                )
                clear_auth_failures(_rate_limit_key(
                    "passkey",
                    self._client_identifier(),
                    str(saved_passkey["user"]["username"]),
                ))
                self._send_json({
                    "ok": True,
                    "user": saved_passkey["user"],
                }, cookie=self._session_cookie(token))
                return
            if parsed.path == "/api/auth/register":
                payload = self._read_json_body()
                register_key = _rate_limit_key("register", self._client_identifier(), payload.get("username", ""))
                retry_after = check_auth_rate_limit(register_key)
                if retry_after:
                    self._send_json({
                        "error": f"Troppi tentativi. Riprova tra {retry_after} secondi.",
                        "code": "rate_limited",
                        "retryAfter": retry_after,
                    }, HTTPStatus.TOO_MANY_REQUESTS)
                    return
                try:
                    user, token, first_account, recovery_code = AUTH_STORE.create_account(
                        payload.get("username", ""),
                        payload.get("password", ""),
                        self.headers.get("User-Agent", ""),
                        self._device_label(),
                        bool(payload.get("acceptedTerms")),
                        str(payload.get("termsVersion") or LEGAL_VERSION),
                    )
                except AuthError:
                    register_auth_failure(register_key)
                    raise
                clear_auth_failures(register_key)
                user_db = AUTH_STORE.user_db_path(user["id"])
                if first_account and not PUBLIC_MODE:
                    initial = merge_snapshots(load_snapshot(db_path=DB_PATH), payload.get("snapshot"))
                    save_snapshot(initial, db_path=user_db, force_replace=True)
                else:
                    get_db(user_db).close()
                self._send_json(
                    {
                        "ok": True,
                        "user": user,
                        "importedLegacyData": first_account and not PUBLIC_MODE,
                        "recoveryCode": recovery_code,
                    },
                    HTTPStatus.CREATED,
                    self._session_cookie(token),
                )
                return
            if parsed.path == "/api/auth/login":
                payload = self._read_json_body()
                login_key = _rate_limit_key("login", self._client_identifier(), payload.get("username", ""))
                retry_after = check_auth_rate_limit(login_key)
                if retry_after:
                    self._send_json({
                        "error": f"Troppi tentativi. Riprova tra {retry_after} secondi.",
                        "code": "rate_limited",
                        "retryAfter": retry_after,
                    }, HTTPStatus.TOO_MANY_REQUESTS)
                    return
                try:
                    user, token = AUTH_STORE.login(
                        payload.get("username", ""),
                        payload.get("password", ""),
                        self.headers.get("User-Agent", ""),
                        self._device_label(),
                    )
                except AuthError:
                    register_auth_failure(login_key)
                    AUTH_STORE.log_audit(None, None, "session.login_failed", {
                        "username": str(payload.get("username", ""))[:24],
                    })
                    raise
                clear_auth_failures(login_key)
                self._send_json({"ok": True, "user": user}, cookie=self._session_cookie(token))
                return
            if parsed.path == "/api/auth/recover":
                payload = self._read_json_body()
                recover_key = _rate_limit_key("recover", self._client_identifier(), payload.get("username", ""))
                retry_after = check_auth_rate_limit(recover_key)
                if retry_after:
                    self._send_json({
                        "error": f"Troppi tentativi. Riprova tra {retry_after} secondi.",
                        "code": "rate_limited",
                        "retryAfter": retry_after,
                    }, HTTPStatus.TOO_MANY_REQUESTS)
                    return
                try:
                    user, token, recovery_code = AUTH_STORE.recover_account(
                        payload.get("username", ""),
                        payload.get("recoveryCode", ""),
                        payload.get("password", ""),
                        self.headers.get("User-Agent", ""),
                        self._device_label(),
                    )
                except AuthError:
                    register_auth_failure(recover_key)
                    raise
                clear_auth_failures(recover_key)
                self._send_json(
                    {"ok": True, "user": user, "recoveryCode": recovery_code},
                    cookie=self._session_cookie(token),
                )
                return
            if parsed.path == "/api/auth/recovery-code":
                recovery_code = AUTH_STORE.issue_recovery_code(self._session_token())
                self._send_json({"ok": True, "recoveryCode": recovery_code}, HTTPStatus.CREATED)
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
                user_db_path = AUTH_STORE.user_db_path(user["id"])
                create_versioned_backup(user_db_path, "pre-restore", force=True)
                saved = save_snapshot(restored, db_path=user_db_path, force_replace=True)
                AUTH_STORE.log_audit(str(user["id"]), str(user["id"]), "backup.file_restored", {
                    "entries": len(saved.get("entries") or {}),
                    "payslips": len(saved.get("payslips") or []),
                })
                self._send_json({
                    "ok": True,
                    "entries": len(saved.get("entries") or {}),
                    "payslips": len(saved.get("payslips") or []),
                    "updatedAt": saved.get("updatedAt", 0),
                })
                return
            if parsed.path == "/api/backups":
                user = self._require_user()
                if not user:
                    return
                backup = create_versioned_backup(AUTH_STORE.user_db_path(user["id"]), "manual", force=True)
                AUTH_STORE.log_audit(str(user["id"]), str(user["id"]), "backup.created", {
                    "backupId": str((backup or {}).get("id") or ""),
                })
                self._send_json({"ok": True, "backup": backup}, HTTPStatus.CREATED)
                return
            if parsed.path == "/api/backups/restore":
                user = self._require_user()
                if not user:
                    return
                payload = self._read_json_body()
                saved = restore_versioned_backup(AUTH_STORE.user_db_path(user["id"]), payload.get("backupId", ""))
                AUTH_STORE.log_audit(str(user["id"]), str(user["id"]), "backup.restored", {
                    "backupId": str(payload.get("backupId") or ""),
                })
                self._send_json({
                    "ok": True,
                    "entries": len(saved.get("entries") or {}),
                    "payslips": len(saved.get("payslips") or []),
                    "updatedAt": saved.get("updatedAt", 0),
                })
                return
            if parsed.path == "/api/history/restore":
                user = self._require_user()
                if not user:
                    return
                payload = self._read_json_body()
                db_path = AUTH_STORE.user_db_path(user["id"])
                history_item = read_history_item(db_path, payload.get("historyId", ""))
                current = load_snapshot(db_path=db_path)
                next_snapshot = {
                    "entries": dict(current.get("entries") or {}),
                    "settings": current.get("settings"),
                    "payslips": list(current.get("payslips") or []),
                    "syncMeta": current.get("syncMeta") or {},
                    "updatedAt": int(time.time() * 1000),
                    "allowEmptyEntries": True,
                }
                before = history_item.get("before") or {}
                kind = history_item.get("kind")
                entity_id = str(history_item.get("entityId") or "")
                if kind == "entry":
                    if before.get("exists"):
                        next_snapshot["entries"][entity_id] = before.get("value")
                    else:
                        next_snapshot["entries"].pop(entity_id, None)
                elif kind == "settings":
                    next_snapshot["settings"] = before.get("value") if before.get("exists") else None
                elif kind == "payslip":
                    next_snapshot["payslips"] = [
                        item for item in next_snapshot["payslips"] if _payslip_key(item) != entity_id
                    ]
                    if before.get("exists") and isinstance(before.get("value"), dict):
                        next_snapshot["payslips"].insert(0, before["value"])
                else:
                    raise ValueError("Tipo di modifica non supportato.")
                create_versioned_backup(db_path, "pre-restore", force=True)
                saved = save_snapshot(next_snapshot, db_path=db_path, force_replace=True)
                record_snapshot_changes(
                    db_path,
                    current,
                    saved,
                    mutation_id=f"undo-{history_item['id']}",
                    actor=str(user.get("username") or "Utente"),
                )
                if kind == "payslip":
                    before_current = next(
                        (item for item in current.get("payslips") or [] if _payslip_key(item) == entity_id),
                        None,
                    )
                    after_current = next(
                        (item for item in saved.get("payslips") or [] if _payslip_key(item) == entity_id),
                        None,
                    )
                    record_payslip_change(
                        db_path,
                        payslip_id=entity_id,
                        before=before_current,
                        after=after_current,
                        mutation_id=f"undo-{history_item['id']}",
                        actor=str(user.get("username") or "Utente"),
                    )
                mark_reverted(db_path, history_item["id"])
                AUTH_STORE.log_audit(str(user["id"]), str(user["id"]), "history.restored", {
                    "historyId": history_item["id"],
                    "kind": kind,
                    "entityId": entity_id,
                })
                self._send_json({"ok": True, "snapshot": compact_snapshot(saved)})
                return
            if parsed.path == "/api/push/subscribe":
                user = self._require_user()
                if not user:
                    return
                payload = self._read_json_body()
                stored = AUTH_STORE.save_push_subscription(
                    self._session_token(),
                    payload.get("subscription") or {},
                )
                self._send_json({"ok": True, "subscription": stored}, HTTPStatus.CREATED)
                return
            if parsed.path == "/api/push/test":
                user = self._require_user()
                if not user:
                    return
                result = PUSH_SERVICE.send_to_user(str(user["id"]), {
                    "title": "GestOre e pronto",
                    "body": "Le notifiche dal server funzionano correttamente.",
                    "url": "/",
                    "tag": f"test-{int(time.time())}",
                })
                self._send_json({"ok": bool(result.get("sent")), **result})
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
            if parsed.path == "/api/auth/account":
                payload = self._read_json_body()
                deleted = AUTH_STORE.delete_own_account(
                    self._session_token(),
                    payload.get("password", ""),
                    payload.get("confirmation", ""),
                )
                self._send_json(
                    {"ok": True, "deleted": deleted},
                    cookie=self._session_cookie("", clear=True),
                )
                return
            if parsed.path == "/api/auth/sessions":
                payload = self._read_json_body()
                revoked = AUTH_STORE.revoke_session(self._session_token(), payload.get("sessionId", ""))
                self._send_json({"ok": True, "revoked": revoked})
                return
            if parsed.path == "/api/auth/passkeys":
                payload = self._read_json_body()
                deleted = AUTH_STORE.delete_passkey(self._session_token(), payload.get("credentialId", ""))
                self._send_json({
                    "ok": True,
                    "deleted": deleted,
                    "passkeys": AUTH_STORE.list_passkeys(self._session_token()),
                })
                return
            if parsed.path == "/api/push/subscribe":
                payload = self._read_json_body()
                AUTH_STORE.remove_push_subscription(self._session_token(), payload.get("endpoint", ""))
                self._send_json({"ok": True})
                return
            if parsed.path == "/api/payslip":
                db_path = self._snapshot_db_for_request()
                if db_path is None:
                    return
                payload = self._read_json_body()
                mutation_id = str(payload.get("mutationId") or self.headers.get("X-GestOre-Mutation-Id", ""))
                payslip_id = str(payload.get("payslipId") or "").strip()
                before_snapshot = load_snapshot(db_path=db_path)
                before_payslip = next(
                    (item for item in before_snapshot.get("payslips") or [] if _payslip_key(item) == payslip_id),
                    None,
                )
                create_scheduled_backup(db_path, before_snapshot)
                saved = delete_payslip_record(payslip_id, db_path, payload.get("updatedAt"))
                current_user = self._current_user() or {}
                record_payslip_change(
                    db_path,
                    payslip_id=payslip_id,
                    before=before_payslip,
                    after=None,
                    mutation_id=mutation_id,
                    actor=str(current_user.get("username") or "Dispositivo"),
                )
                self._send_json(self._snapshot_ack(saved, mutation_id, payslipId=payslip_id, deleted=True))
                return
            if parsed.path == "/api/backups":
                user = self._require_user()
                if not user:
                    return
                payload = self._read_json_body()
                deleted = delete_versioned_backup(AUTH_STORE.user_db_path(user["id"]), payload.get("backupId", ""))
                AUTH_STORE.log_audit(str(user["id"]), str(user["id"]), "backup.deleted", {
                    "backupId": str(payload.get("backupId") or ""),
                })
                self._send_json({"ok": True, "deleted": deleted})
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
    PUSH_SERVICE.start(load_compact_snapshot, AUTH_STORE.user_db_path)
    print(f"GestOre attivo su http://{args.host}:{args.port}")
    print(f"Frontend: {FRONTEND_DIR}")
    print(f"Database legacy: {DB_PATH}")
    print(f"Account: {AUTH_STORE.accounts_db}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nChiusura server...")
    finally:
        PUSH_SERVICE.stop()
        httpd.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
