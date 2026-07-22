from __future__ import annotations

import hashlib
import hmac
import os
import re
import secrets
import shutil
import sqlite3
import time
import unicodedata
import uuid
from contextlib import closing
from pathlib import Path


SESSION_TTL_MS = 180 * 24 * 60 * 60 * 1000
PBKDF2_ROUNDS = 260_000
USERNAME_RE = re.compile(r"^[a-z0-9._-]{3,24}$")


class AuthError(Exception):
    def __init__(self, message: str, status: int = 400, code: str = "auth_error") -> None:
        super().__init__(message)
        self.status = status
        self.code = code


class AuthStore:
    def __init__(self, data_dir: Path) -> None:
        self.data_dir = Path(data_dir).resolve()
        self.accounts_db = self.data_dir / "accounts.sqlite3"
        self.users_dir = self.data_dir / "users"

    def _connect(self) -> sqlite3.Connection:
        self.data_dir.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(self.accounts_db, timeout=15)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                username TEXT NOT NULL,
                username_key TEXT NOT NULL UNIQUE,
                password_salt BLOB NOT NULL,
                password_hash BLOB NOT NULL,
                role TEXT NOT NULL DEFAULT 'user',
                created_at INTEGER NOT NULL
            )
            """
        )
        user_columns = {str(row[1]) for row in conn.execute("PRAGMA table_info(users)")}
        if "role" not in user_columns:
            conn.execute("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'")
        conn.execute(
            """
            UPDATE users SET role = 'owner'
            WHERE id = (SELECT id FROM users ORDER BY created_at ASC, id ASC LIMIT 1)
              AND NOT EXISTS (SELECT 1 FROM users WHERE role = 'owner')
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                admin_user_id TEXT,
                created_at INTEGER NOT NULL,
                expires_at INTEGER NOT NULL,
                last_seen_at INTEGER NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY(admin_user_id) REFERENCES users(id) ON DELETE CASCADE
            )
            """
        )
        session_columns = {str(row[1]) for row in conn.execute("PRAGMA table_info(sessions)")}
        if "admin_user_id" not in session_columns:
            conn.execute("ALTER TABLE sessions ADD COLUMN admin_user_id TEXT")
        conn.execute("CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS sessions_admin_idx ON sessions(admin_user_id)")
        conn.commit()
        return conn

    @staticmethod
    def normalize_username(value: str) -> tuple[str, str]:
        display = unicodedata.normalize("NFKC", str(value or "")).strip()
        key = display.casefold()
        if not USERNAME_RE.fullmatch(key):
            raise AuthError(
                "Il nome utente deve avere 3-24 caratteri: lettere, numeri, punto, trattino o underscore.",
                code="invalid_username",
            )
        return display, key

    @staticmethod
    def validate_password(value: str) -> str:
        password = str(value or "")
        if len(password) < 8 or len(password) > 128:
            raise AuthError("La password deve contenere da 8 a 128 caratteri.", code="invalid_password")
        return password

    @staticmethod
    def _hash_password(password: str, salt: bytes) -> bytes:
        return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ROUNDS)

    @staticmethod
    def _hash_token(token: str) -> str:
        return hashlib.sha256(str(token or "").encode("utf-8")).hexdigest()

    @staticmethod
    def _public_user(row: sqlite3.Row) -> dict:
        return {
            "id": str(row["id"]),
            "username": str(row["username"]),
            "role": str(row["role"] or "user"),
            "createdAt": int(row["created_at"] or 0),
        }

    def has_accounts(self) -> bool:
        with closing(self._connect()) as conn:
            row = conn.execute("SELECT 1 FROM users LIMIT 1").fetchone()
        return bool(row)

    def account_count(self) -> int:
        with closing(self._connect()) as conn:
            row = conn.execute("SELECT COUNT(*) AS count FROM users").fetchone()
        return int(row["count"] or 0)

    def create_account(self, username: str, password: str) -> tuple[dict, str, bool]:
        display, key = self.normalize_username(username)
        password = self.validate_password(password)
        now = int(time.time() * 1000)
        user_id = uuid.uuid4().hex
        salt = os.urandom(16)
        password_hash = self._hash_password(password, salt)
        with closing(self._connect()) as conn:
            conn.execute("BEGIN IMMEDIATE")
            first_account = int(conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] or 0) == 0
            role = "owner" if first_account else "user"
            try:
                conn.execute(
                    "INSERT INTO users (id, username, username_key, password_salt, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (user_id, display, key, salt, password_hash, role, now),
                )
                conn.commit()
            except sqlite3.IntegrityError as exc:
                conn.rollback()
                raise AuthError("Questo nome utente esiste gia.", status=409, code="username_exists") from exc
            row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        token = self.create_session(user_id)
        return self._public_user(row), token, first_account

    def login(self, username: str, password: str) -> tuple[dict, str]:
        _, key = self.normalize_username(username)
        password = str(password or "")
        with closing(self._connect()) as conn:
            row = conn.execute("SELECT * FROM users WHERE username_key = ?", (key,)).fetchone()
        if not row:
            raise AuthError("Nome utente o password non corretti.", status=401, code="invalid_credentials")
        expected = bytes(row["password_hash"])
        actual = self._hash_password(password, bytes(row["password_salt"]))
        if not hmac.compare_digest(expected, actual):
            raise AuthError("Nome utente o password non corretti.", status=401, code="invalid_credentials")
        token = self.create_session(str(row["id"]))
        return self._public_user(row), token

    def create_session(self, user_id: str) -> str:
        token = secrets.token_urlsafe(40)
        token_hash = self._hash_token(token)
        now = int(time.time() * 1000)
        expires_at = now + SESSION_TTL_MS
        with closing(self._connect()) as conn:
            conn.execute("DELETE FROM sessions WHERE expires_at <= ?", (now,))
            conn.execute(
                "INSERT INTO sessions (token_hash, user_id, admin_user_id, created_at, expires_at, last_seen_at) VALUES (?, ?, NULL, ?, ?, ?)",
                (token_hash, user_id, now, expires_at, now),
            )
            conn.commit()
        return token

    def get_user_for_token(self, token: str) -> dict | None:
        if not token:
            return None
        token_hash = self._hash_token(token)
        now = int(time.time() * 1000)
        with closing(self._connect()) as conn:
            row = conn.execute(
                """
                SELECT users.*,
                       sessions.admin_user_id AS session_admin_user_id,
                       admin.id AS session_admin_id,
                       admin.username AS session_admin_username,
                       admin.role AS session_admin_role,
                       admin.created_at AS session_admin_created_at
                FROM sessions
                JOIN users ON users.id = sessions.user_id
                LEFT JOIN users AS admin ON admin.id = sessions.admin_user_id
                WHERE sessions.token_hash = ? AND sessions.expires_at > ?
                """,
                (token_hash, now),
            ).fetchone()
            if not row:
                conn.execute("DELETE FROM sessions WHERE token_hash = ? OR expires_at <= ?", (token_hash, now))
                conn.commit()
                return None
            conn.execute("UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?", (now, token_hash))
            conn.commit()
        user = self._public_user(row)
        admin_id = str(row["session_admin_id"] or "")
        admin_role = str(row["session_admin_role"] or "")
        user["impersonating"] = bool(admin_id and admin_id != user["id"])
        user["canManageAccounts"] = user["role"] == "owner" or admin_role == "owner"
        if admin_id:
            user["owner"] = {
                "id": admin_id,
                "username": str(row["session_admin_username"] or "Proprietario"),
                "role": admin_role or "owner",
                "createdAt": int(row["session_admin_created_at"] or 0),
            }
        return user

    def list_accounts(self, token: str) -> list[dict]:
        session_user = self.get_user_for_token(token)
        if not session_user or not session_user.get("canManageAccounts"):
            raise AuthError("Solo il Proprietario puo vedere gli account.", status=403, code="owner_required")
        with closing(self._connect()) as conn:
            rows = conn.execute(
                """
                SELECT users.*, COALESCE(MAX(sessions.last_seen_at), 0) AS last_seen_at
                FROM users
                LEFT JOIN sessions ON sessions.user_id = users.id
                GROUP BY users.id
                ORDER BY CASE users.role WHEN 'owner' THEN 0 ELSE 1 END, users.username_key ASC
                """
            ).fetchall()
        accounts = []
        for row in rows:
            account = self._public_user(row)
            account["lastSeenAt"] = int(row["last_seen_at"] or 0)
            accounts.append(account)
        return accounts

    def switch_admin_account(self, token: str, target_user_id: str) -> dict:
        session_user = self.get_user_for_token(token)
        if not session_user or not session_user.get("canManageAccounts"):
            raise AuthError("Solo il Proprietario puo aprire altri account.", status=403, code="owner_required")
        owner = session_user.get("owner") if session_user.get("impersonating") else session_user
        owner_id = str((owner or {}).get("id") or "")
        target_id = str(target_user_id or "")
        token_hash = self._hash_token(token)
        now = int(time.time() * 1000)
        with closing(self._connect()) as conn:
            owner_row = conn.execute("SELECT * FROM users WHERE id = ? AND role = 'owner'", (owner_id,)).fetchone()
            target_row = conn.execute("SELECT * FROM users WHERE id = ?", (target_id,)).fetchone()
            if not owner_row:
                raise AuthError("Sessione Proprietario non valida.", status=403, code="owner_required")
            if not target_row:
                raise AuthError("Account non trovato.", status=404, code="account_not_found")
            admin_user_id = None if target_id == owner_id else owner_id
            updated = conn.execute(
                """
                UPDATE sessions
                SET user_id = ?, admin_user_id = ?, last_seen_at = ?
                WHERE token_hash = ? AND expires_at > ?
                """,
                (target_id, admin_user_id, now, token_hash, now),
            ).rowcount
            conn.commit()
        if not updated:
            raise AuthError("La sessione e scaduta.", status=401, code="authentication_required")
        switched = self.get_user_for_token(token)
        if not switched:
            raise AuthError("Impossibile aprire l'account.", status=401, code="authentication_required")
        return switched

    def return_to_owner(self, token: str) -> dict:
        session_user = self.get_user_for_token(token)
        if not session_user or not session_user.get("impersonating") or not session_user.get("owner"):
            raise AuthError("Non stai gestendo un altro account.", status=409, code="not_impersonating")
        return self.switch_admin_account(token, str(session_user["owner"]["id"]))

    def delete_account(self, token: str, target_user_id: str, confirmation: str) -> dict:
        session_user = self.get_user_for_token(token)
        if not session_user or session_user.get("role") != "owner" or session_user.get("impersonating"):
            raise AuthError("Solo il Proprietario puo eliminare un account.", status=403, code="owner_required")
        target_id = str(target_user_id or "")
        with closing(self._connect()) as conn:
            target = conn.execute("SELECT * FROM users WHERE id = ?", (target_id,)).fetchone()
            if not target:
                raise AuthError("Account non trovato.", status=404, code="account_not_found")
            if str(target["role"] or "user") == "owner" or target_id == str(session_user["id"]):
                raise AuthError("L'account Proprietario non puo essere eliminato.", status=409, code="owner_delete_forbidden")
            if str(confirmation or "").strip() != str(target["username"] or ""):
                raise AuthError("Conferma il nome utente esatto prima di eliminare.", status=400, code="delete_confirmation_required")
            public_target = self._public_user(target)
            conn.execute("DELETE FROM users WHERE id = ?", (target_id,))
            conn.commit()

        users_root = self.users_dir.resolve()
        target_dir = (users_root / target_id).resolve()
        if target_dir.parent != users_root:
            raise AuthError("Percorso account non valido.", status=400, code="invalid_account")
        if target_dir.exists():
            shutil.rmtree(target_dir)
        return public_target

    def logout(self, token: str) -> None:
        if not token:
            return
        with closing(self._connect()) as conn:
            conn.execute("DELETE FROM sessions WHERE token_hash = ?", (self._hash_token(token),))
            conn.commit()

    def user_db_path(self, user_id: str) -> Path:
        safe_id = str(user_id or "")
        if not re.fullmatch(r"[a-f0-9]{32}", safe_id):
            raise AuthError("Account non valido.", status=401, code="invalid_account")
        directory = self.users_dir / safe_id
        directory.mkdir(parents=True, exist_ok=True)
        return directory / "gestore_data.sqlite3"
