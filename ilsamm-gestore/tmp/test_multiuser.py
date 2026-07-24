from __future__ import annotations

import http.cookiejar
import json
import os
import shutil
import socket
import sqlite3
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TEST_DIR = Path(tempfile.mkdtemp(prefix="gestore-account-qa-", dir=ROOT / "tmp"))
PORT = 8771
BASE = f"http://127.0.0.1:{PORT}"


def seed_legacy_database() -> None:
    db_path = TEST_DIR / "gestore_data.sqlite3"
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            """
            CREATE TABLE app_state (
                profile_id TEXT PRIMARY KEY,
                entries_json TEXT NOT NULL,
                settings_json TEXT,
                payslips_json TEXT,
                sync_meta_json TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            )
            """
        )
        conn.execute(
            "INSERT INTO app_state VALUES (?, ?, ?, ?, ?, ?)",
            (
                "default",
                json.dumps({"2026-07-01": {"type": "lavoro", "start": "08:00", "end": "17:00"}}),
                json.dumps({"userName": "Samuele", "dailyTarget": 8, "weeklyTarget": 40}),
                json.dumps([{"id": "legacy-slip", "month": 6, "year": 2026, "netto": 1700}]),
                json.dumps({}),
                1000,
            ),
        )
        conn.commit()


class Client:
    def __init__(self) -> None:
        jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

    def request(self, path: str, method: str = "GET", payload=None, raw: bytes | None = None):
        headers = {}
        data = raw
        if payload is not None:
            data = json.dumps(payload).encode("utf-8")
            headers["Content-Type"] = "application/json"
        elif raw is not None:
            headers["Content-Type"] = "application/vnd.sqlite3"
        request = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
        try:
            response = self.opener.open(request, timeout=10)
            body = response.read()
            return response.status, response.headers, body
        except urllib.error.HTTPError as exc:
            return exc.code, exc.headers, exc.read()

    def json(self, path: str, method: str = "GET", payload=None):
        status, headers, raw = self.request(path, method, payload=payload)
        body = json.loads(raw.decode("utf-8")) if raw else {}
        return status, headers, body


def wait_for_server() -> None:
    deadline = time.time() + 15
    while time.time() < deadline:
        try:
            with socket.create_connection(("127.0.0.1", PORT), timeout=.3):
                return
        except OSError:
            time.sleep(.1)
    raise RuntimeError("server not ready")


def assert_true(value, message: str) -> None:
    if not value:
        raise AssertionError(message)


seed_legacy_database()
env = dict(os.environ)
env["GESTORE_DATA_DIR"] = str(TEST_DIR)
server = subprocess.Popen(
    [sys.executable, str(ROOT / "app" / "backend" / "server.py"), "--host", "127.0.0.1", "--port", str(PORT)],
    cwd=ROOT,
    env=env,
    stdout=subprocess.DEVNULL,
    stderr=subprocess.PIPE,
)

try:
    wait_for_server()
    sam = Client()
    status, _, auth = sam.json("/api/auth/status")
    assert_true(status == 200 and auth["setupRequired"] and auth["hasLegacyData"], "first setup not detected")

    status, _, legacy = sam.json("/api/snapshot")
    assert_true(status == 200 and "2026-07-01" in legacy["entries"], "legacy snapshot unavailable")

    device_snapshot = {
        "entries": {"2026-07-02": {"type": "ferie", "leaveHours": 8}},
        "settings": {"userName": "Samuele", "dailyTarget": 8, "weeklyTarget": 40},
        "payslips": [{"id": "device-slip", "month": 7, "year": 2026, "netto": 1800}],
        "updatedAt": 2000,
    }
    status, _, registered = sam.json(
        "/api/auth/register",
        "POST",
        {"username": "samuele", "password": "Password-123", "snapshot": device_snapshot},
    )
    assert_true(status == 201 and registered["importedLegacyData"], "first account not created")
    assert_true(registered["user"]["role"] == "owner", "first account is not owner")

    status, _, sam_snapshot = sam.json("/api/snapshot")
    assert_true(status == 200, "first user snapshot unavailable")
    assert_true(set(sam_snapshot["entries"]) == {"2026-07-01", "2026-07-02"}, "legacy/device merge failed")
    assert_true({item["id"] for item in sam_snapshot["payslips"]} == {"legacy-slip", "device-slip"}, "payslip merge failed")

    sam_snapshot["entries"]["2026-07-03"] = {"type": "lavoro", "start": "08:00", "end": "18:00"}
    status, _, saved = sam.json("/api/snapshot", "PUT", sam_snapshot)
    assert_true(status == 200 and "2026-07-03" in saved["entries"], "first user save failed")

    status, backup_headers, backup = sam.request("/api/backup")
    assert_true(status == 200 and backup.startswith(b"SQLite format 3\x00"), "backup download invalid")
    assert_true("samuele" in str(backup_headers.get("Content-Disposition", "")), "backup filename missing username")

    sam.json("/api/auth/logout", "POST", {})
    status, _, _ = sam.json("/api/snapshot")
    assert_true(status == 401, "anonymous access allowed after account setup")

    luca = Client()
    leaked_snapshot = {"entries": {"2099-01-01": {"type": "lavoro"}}, "settings": {}, "payslips": []}
    status, _, registered_luca = luca.json(
        "/api/auth/register",
        "POST",
        {"username": "luca", "password": "Password-456", "snapshot": leaked_snapshot},
    )
    assert_true(status == 201 and not registered_luca["importedLegacyData"], "second account not created")
    assert_true(registered_luca["user"]["role"] == "user", "second account has elevated privileges")
    status, _, _ = luca.json("/api/admin/accounts")
    assert_true(status == 403, "regular user can list accounts")
    status, _, luca_snapshot = luca.json("/api/snapshot")
    assert_true(status == 200 and not luca_snapshot["entries"], "second account inherited another user data")

    luca_snapshot["entries"] = {"2026-08-01": {"type": "lavoro", "start": "09:00", "end": "17:00"}}
    luca_snapshot["allowEmptyEntries"] = True
    status, _, _ = luca.json("/api/snapshot", "PUT", luca_snapshot)
    assert_true(status == 200, "second user save failed")
    luca.json("/api/auth/logout", "POST", {})

    sam_again = Client()
    status, _, _ = sam_again.json(
        "/api/auth/login",
        "POST",
        {"username": "samuele", "password": "Password-123"},
    )
    assert_true(status == 200, "first user login failed")
    status, _, account_list = sam_again.json("/api/admin/accounts")
    assert_true(status == 200 and len(account_list["accounts"]) == 2, "owner account list unavailable")
    sam_account = next(item for item in account_list["accounts"] if item["username"] == "samuele")
    luca_account = next(item for item in account_list["accounts"] if item["username"] == "luca")
    assert_true(sam_account["role"] == "owner" and luca_account["role"] == "user", "account roles incorrect")

    status, _, acting = sam_again.json("/api/admin/access", "POST", {"userId": luca_account["id"]})
    assert_true(status == 200 and acting["user"]["impersonating"], "owner cannot open user account")
    assert_true(acting["user"]["owner"]["username"] == "samuele", "owner session identity lost")
    status, _, acting_snapshot = sam_again.json("/api/snapshot")
    assert_true(status == 200 and "2026-08-01" in acting_snapshot["entries"], "owner opened the wrong database")
    status, _, _ = sam_again.json("/api/admin/accounts", "DELETE", {"userId": luca_account["id"], "confirmation": "luca"})
    assert_true(status == 403, "impersonated session can delete an account")
    status, _, returned = sam_again.json("/api/admin/return", "POST", {})
    assert_true(status == 200 and returned["user"]["id"] == sam_account["id"], "owner return failed")

    status, _, sam_again_snapshot = sam_again.json("/api/snapshot")
    assert_true("2026-08-01" not in sam_again_snapshot["entries"], "second user data leaked into first user")
    assert_true("2026-07-03" in sam_again_snapshot["entries"], "first user data disappeared")

    modified = dict(sam_again_snapshot)
    modified["entries"] = {"2099-12-31": {"type": "riposo"}}
    modified["allowEmptyEntries"] = True
    sam_again.json("/api/snapshot", "PUT", modified)
    status, _, restored = sam_again.request("/api/backup/restore", "POST", raw=backup)
    restored_json = json.loads(restored.decode("utf-8"))
    assert_true(status == 200 and restored_json["entries"] == 3, "backup restore failed")
    status, _, after_restore = sam_again.json("/api/snapshot")
    assert_true("2099-12-31" not in after_restore["entries"] and "2026-07-03" in after_restore["entries"], "restored data mismatch")

    user_databases = list((TEST_DIR / "users").glob("*/gestore_data.sqlite3"))
    assert_true(len(user_databases) == 2, "separate user databases not created")
    assert_true((TEST_DIR / "accounts.sqlite3").exists(), "accounts database missing")

    luca_again = Client()
    status, _, _ = luca_again.json("/api/auth/login", "POST", {"username": "luca", "password": "Password-456"})
    assert_true(status == 200, "second user login failed")
    status, _, _ = luca_again.json("/api/admin/accounts")
    assert_true(status == 403, "regular user gained owner access")

    status, _, _ = sam_again.json("/api/admin/accounts", "DELETE", {"userId": sam_account["id"], "confirmation": "samuele"})
    assert_true(status == 409, "owner account deletion was allowed")
    status, _, _ = sam_again.json("/api/admin/accounts", "DELETE", {"userId": luca_account["id"], "confirmation": "wrong"})
    assert_true(status == 400, "incorrect deletion confirmation was accepted")
    status, _, deleted = sam_again.json("/api/admin/accounts", "DELETE", {"userId": luca_account["id"], "confirmation": "luca"})
    assert_true(status == 200 and deleted["deleted"]["username"] == "luca", "owner could not delete user")
    status, _, remaining = sam_again.json("/api/admin/accounts")
    assert_true(status == 200 and len(remaining["accounts"]) == 1, "deleted account still listed")
    status, _, _ = luca_again.json("/api/snapshot")
    assert_true(status == 401, "deleted account session is still active")
    assert_true(not (TEST_DIR / "users" / luca_account["id"]).exists(), "deleted account database remains on disk")

    print(json.dumps({
        "ok": True,
        "users": 2,
        "databases": len(user_databases),
        "samEntries": len(after_restore["entries"]),
        "lucaEntries": 1,
        "backupBytes": len(backup),
        "legacyPreserved": True,
        "isolationVerified": True,
        "restoreVerified": True,
        "ownerAccessVerified": True,
        "regularUserBlocked": True,
        "deleteVerified": True,
    }))
finally:
    server.terminate()
    try:
        server.wait(timeout=5)
    except subprocess.TimeoutExpired:
        server.kill()
    server_error = server.stderr.read().decode("utf-8", errors="replace") if server.stderr else ""
    if server_error:
        print(server_error, file=sys.stderr)
    shutil.rmtree(TEST_DIR, ignore_errors=True)
