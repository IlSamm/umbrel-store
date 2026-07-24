from __future__ import annotations

import shutil
import sqlite3
import sys
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "app" / "backend"))

from auth_store import AuthStore


test_dir = Path(tempfile.mkdtemp(prefix="gestore-auth-migration-", dir=ROOT / "tmp"))
try:
    db_path = test_dir / "accounts.sqlite3"
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            """
            CREATE TABLE users (
                id TEXT PRIMARY KEY,
                username TEXT NOT NULL,
                username_key TEXT NOT NULL UNIQUE,
                password_salt BLOB NOT NULL,
                password_hash BLOB NOT NULL,
                created_at INTEGER NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE sessions (
                token_hash TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                expires_at INTEGER NOT NULL,
                last_seen_at INTEGER NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            )
            """
        )
        conn.execute(
            "INSERT INTO users VALUES (?, ?, ?, ?, ?, ?)",
            ("a" * 32, "samuele", "samuele", b"salt", b"hash", 1000),
        )
        conn.commit()

    store = AuthStore(test_dir)
    assert store.account_count() == 1
    with sqlite3.connect(db_path) as conn:
        user_columns = {row[1] for row in conn.execute("PRAGMA table_info(users)")}
        session_columns = {row[1] for row in conn.execute("PRAGMA table_info(sessions)")}
        role = conn.execute("SELECT role FROM users WHERE id = ?", ("a" * 32,)).fetchone()[0]
    assert "role" in user_columns
    assert "admin_user_id" in session_columns
    assert role == "owner"
    print("auth-migration-ok")
finally:
    shutil.rmtree(test_dir, ignore_errors=True)
