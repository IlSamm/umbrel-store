#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import posixpath
import sqlite3
import tempfile
import time
from contextlib import closing
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

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
BUILD_VERSION = "1.1.128"
BUILD_CACHE = "20260722i"
AUTH_STORE = AuthStore(DATA_DIR)

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


def get_db(db_path: Path = DB_PATH) -> sqlite3.Connection:
    db_path = Path(db_path).resolve()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path, timeout=20)
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


def save_snapshot(
    snapshot: dict,
    profile_id: str = PROFILE_ID,
    db_path: Path = DB_PATH,
    force_replace: bool = False,
) -> dict:
    existing = load_snapshot(profile_id, db_path)
    entries = snapshot.get("entries")
    settings = snapshot.get("settings")
    payslips = snapshot.get("payslips")
    sync_meta = snapshot.get("syncMeta") or {}
    updated_at = int(snapshot.get("updatedAt") or time.time() * 1000)

    entries = entries if isinstance(entries, dict) else {}
    settings = settings if isinstance(settings, dict) else None
    payslips = payslips if isinstance(payslips, list) else []
    sync_meta = sync_meta if isinstance(sync_meta, dict) else {}

    # A blank Safari cache must not erase a populated server database.
    allow_empty = force_replace or snapshot.get("allowEmptyEntries") is True
    if existing.get("entries") and not entries and not allow_empty:
        entries = existing["entries"]

    now_ms = int(time.time() * 1000)
    sync_meta = {
        **DEFAULT_SYNC_META,
        **sync_meta,
        "entriesUpdatedAt": updated_at if snapshot.get("entries") is not None else int(sync_meta.get("entriesUpdatedAt") or 0),
        "settingsUpdatedAt": updated_at if snapshot.get("settings") is not None else int(sync_meta.get("settingsUpdatedAt") or 0),
        "payslipsUpdatedAt": updated_at if snapshot.get("payslips") is not None else int(sync_meta.get("payslipsUpdatedAt") or 0),
        "lastServerSyncAt": now_ms,
    }

    with closing(get_db(db_path)) as conn:
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
    return load_snapshot(profile_id, db_path)


def snapshot_has_data(snapshot: dict) -> bool:
    return bool(snapshot.get("entries") or snapshot.get("payslips") or snapshot.get("settings"))


def account_snapshot_summary(account: dict) -> dict:
    snapshot = load_snapshot(db_path=AUTH_STORE.user_db_path(account["id"]))
    return {
        **account,
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
            self._send_json({
                "authenticated": bool(user),
                "user": user,
                "hasAccounts": account_count > 0,
                "setupRequired": account_count == 0,
                "hasLegacyData": snapshot_has_data(load_snapshot(db_path=DB_PATH)),
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
        if parsed.path == "/api/snapshot":
            db_path = self._snapshot_db_for_request()
            if db_path is not None:
                self._send_json(load_snapshot(db_path=db_path))
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
            self._send_json(save_snapshot(payload, db_path=db_path))
        except ValueError as exc:
            self._send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
        except Exception as exc:
            self._send_json({"error": f"Errore interno: {exc}"}, HTTPStatus.INTERNAL_SERVER_ERROR)

    def do_PUT(self) -> None:
        if self._reject_cross_origin():
            return
        if urlparse(self.path).path != "/api/snapshot":
            self.send_error(HTTPStatus.NOT_FOUND, "Endpoint non trovato")
            return
        self._handle_snapshot_write()

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
