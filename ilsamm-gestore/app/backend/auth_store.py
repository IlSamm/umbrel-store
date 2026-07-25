from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import shutil
import sqlite3
import threading
import time
import unicodedata
import uuid
from contextlib import closing
from pathlib import Path


SESSION_TTL_MS = 180 * 24 * 60 * 60 * 1000
SESSION_TOUCH_INTERVAL_MS = 60 * 1000
PBKDF2_ROUNDS = 260_000
USERNAME_RE = re.compile(r"^[a-z0-9._-]{3,24}$")
RECOVERY_CODE_RE = re.compile(r"[^A-Z2-9]")


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
        self._schema_lock = threading.Lock()
        self._schema_ready = False

    def _connect(self) -> sqlite3.Connection:
        self.data_dir.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(self.accounts_db, timeout=15)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA synchronous=NORMAL")
        conn.execute("PRAGMA foreign_keys=ON")
        if self._schema_ready:
            return conn
        with self._schema_lock:
            if self._schema_ready:
                return conn
            conn.execute("PRAGMA journal_mode=WAL")
            self._initialize_schema(conn)
            self._schema_ready = True
        return conn

    @staticmethod
    def _initialize_schema(conn: sqlite3.Connection) -> None:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                username TEXT NOT NULL,
                username_key TEXT NOT NULL UNIQUE,
                password_salt BLOB NOT NULL,
                password_hash BLOB NOT NULL,
                recovery_salt BLOB,
                recovery_hash BLOB,
                role TEXT NOT NULL DEFAULT 'user',
                created_at INTEGER NOT NULL
            )
            """
        )
        user_columns = {str(row[1]) for row in conn.execute("PRAGMA table_info(users)")}
        if "role" not in user_columns:
            conn.execute("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'")
        if "recovery_salt" not in user_columns:
            conn.execute("ALTER TABLE users ADD COLUMN recovery_salt BLOB")
        if "recovery_hash" not in user_columns:
            conn.execute("ALTER TABLE users ADD COLUMN recovery_hash BLOB")
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
                id TEXT,
                user_id TEXT NOT NULL,
                admin_user_id TEXT,
                device_label TEXT,
                user_agent TEXT,
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
        if "id" not in session_columns:
            conn.execute("ALTER TABLE sessions ADD COLUMN id TEXT")
        if "device_label" not in session_columns:
            conn.execute("ALTER TABLE sessions ADD COLUMN device_label TEXT")
        if "user_agent" not in session_columns:
            conn.execute("ALTER TABLE sessions ADD COLUMN user_agent TEXT")
        rows_without_id = conn.execute("SELECT token_hash FROM sessions WHERE id IS NULL OR id = ''").fetchall()
        for row in rows_without_id:
            conn.execute("UPDATE sessions SET id = ? WHERE token_hash = ?", (uuid.uuid4().hex, row[0]))
        conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS sessions_id_idx ON sessions(id)")
        conn.execute("CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS sessions_admin_idx ON sessions(admin_user_id)")
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS audit_log (
                id TEXT PRIMARY KEY,
                actor_user_id TEXT,
                target_user_id TEXT,
                action TEXT NOT NULL,
                detail_json TEXT,
                created_at INTEGER NOT NULL
            )
            """
        )
        conn.execute("CREATE INDEX IF NOT EXISTS audit_log_created_idx ON audit_log(created_at DESC)")
        conn.execute("CREATE INDEX IF NOT EXISTS audit_log_actor_idx ON audit_log(actor_user_id)")
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS push_subscriptions (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                endpoint TEXT NOT NULL UNIQUE,
                subscription_json TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                last_success_at INTEGER NOT NULL DEFAULT 0,
                failure_count INTEGER NOT NULL DEFAULT 0,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            )
            """
        )
        conn.execute("CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON push_subscriptions(user_id)")
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS push_deliveries (
                delivery_key TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                kind TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS passkey_credentials (
                credential_id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                public_key BLOB NOT NULL,
                sign_count INTEGER NOT NULL DEFAULT 0,
                transports_json TEXT NOT NULL DEFAULT '[]',
                name TEXT NOT NULL,
                aaguid TEXT NOT NULL DEFAULT '',
                device_type TEXT NOT NULL DEFAULT '',
                backed_up INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL,
                last_used_at INTEGER NOT NULL DEFAULT 0,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            )
            """
        )
        conn.execute("CREATE INDEX IF NOT EXISTS passkey_credentials_user_idx ON passkey_credentials(user_id)")
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS webauthn_challenges (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                kind TEXT NOT NULL,
                challenge BLOB NOT NULL,
                rp_id TEXT NOT NULL,
                origin TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                expires_at INTEGER NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            )
            """
        )
        conn.execute("CREATE INDEX IF NOT EXISTS webauthn_challenges_expiry_idx ON webauthn_challenges(expires_at)")
        conn.commit()

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
    def _normalize_recovery_code(value: str) -> str:
        return RECOVERY_CODE_RE.sub("", str(value or "").upper())

    @classmethod
    def _hash_recovery_code(cls, recovery_code: str, salt: bytes) -> bytes:
        normalized = cls._normalize_recovery_code(recovery_code)
        return hashlib.pbkdf2_hmac("sha256", normalized.encode("ascii"), salt, PBKDF2_ROUNDS)

    @staticmethod
    def _new_recovery_code() -> str:
        alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
        raw = "".join(secrets.choice(alphabet) for _ in range(20))
        return "-".join(raw[index:index + 5] for index in range(0, len(raw), 5))

    @staticmethod
    def _device_label(user_agent: str, supplied_label: str = "") -> str:
        supplied = str(supplied_label or "").strip()
        if supplied:
            return supplied[:80]
        agent = str(user_agent or "")
        if "iPhone" in agent:
            return "iPhone"
        if "iPad" in agent:
            return "iPad"
        if "Android" in agent:
            return "Android"
        if "Windows" in agent:
            return "PC Windows"
        if "Macintosh" in agent or "Mac OS" in agent:
            return "Mac"
        return "Dispositivo"

    @staticmethod
    def _hash_token(token: str) -> str:
        return hashlib.sha256(str(token or "").encode("utf-8")).hexdigest()

    @staticmethod
    def encode_credential_id(value: bytes) -> str:
        return base64.urlsafe_b64encode(bytes(value or b"")).rstrip(b"=").decode("ascii")

    @staticmethod
    def decode_credential_id(value: str) -> bytes:
        clean = str(value or "").strip()
        if not clean:
            raise AuthError("Credenziale passkey non valida.", code="invalid_passkey")
        try:
            return base64.urlsafe_b64decode(clean + ("=" * (-len(clean) % 4)))
        except (ValueError, TypeError) as exc:
            raise AuthError("Credenziale passkey non valida.", code="invalid_passkey") from exc

    @staticmethod
    def _public_user(row: sqlite3.Row) -> dict:
        return {
            "id": str(row["id"]),
            "username": str(row["username"]),
            "role": str(row["role"] or "user"),
            "createdAt": int(row["created_at"] or 0),
        }

    def get_account_by_username(self, username: str) -> dict | None:
        _, key = self.normalize_username(username)
        with closing(self._connect()) as conn:
            row = conn.execute("SELECT * FROM users WHERE username_key = ?", (key,)).fetchone()
        return self._public_user(row) if row else None

    def get_account_by_id(self, user_id: str) -> dict | None:
        with closing(self._connect()) as conn:
            row = conn.execute("SELECT * FROM users WHERE id = ?", (str(user_id or ""),)).fetchone()
        return self._public_user(row) if row else None

    def has_accounts(self) -> bool:
        with closing(self._connect()) as conn:
            row = conn.execute("SELECT 1 FROM users LIMIT 1").fetchone()
        return bool(row)

    def account_count(self) -> int:
        with closing(self._connect()) as conn:
            row = conn.execute("SELECT COUNT(*) AS count FROM users").fetchone()
        return int(row["count"] or 0)

    def create_account(
        self,
        username: str,
        password: str,
        user_agent: str = "",
        device_label: str = "",
    ) -> tuple[dict, str, bool, str]:
        display, key = self.normalize_username(username)
        password = self.validate_password(password)
        now = int(time.time() * 1000)
        user_id = uuid.uuid4().hex
        salt = os.urandom(16)
        password_hash = self._hash_password(password, salt)
        recovery_code = self._new_recovery_code()
        recovery_salt = os.urandom(16)
        recovery_hash = self._hash_recovery_code(recovery_code, recovery_salt)
        with closing(self._connect()) as conn:
            conn.execute("BEGIN IMMEDIATE")
            first_account = int(conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] or 0) == 0
            role = "owner" if first_account else "user"
            try:
                conn.execute(
                    """
                    INSERT INTO users (
                        id, username, username_key, password_salt, password_hash,
                        recovery_salt, recovery_hash, role, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (user_id, display, key, salt, password_hash, recovery_salt, recovery_hash, role, now),
                )
                conn.commit()
            except sqlite3.IntegrityError as exc:
                conn.rollback()
                raise AuthError("Questo nome utente esiste gia.", status=409, code="username_exists") from exc
            row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        token = self.create_session(user_id, user_agent=user_agent, device_label=device_label)
        self.log_audit(user_id, user_id, "account.created", {"role": role})
        return self._public_user(row), token, first_account, recovery_code

    def login(self, username: str, password: str, user_agent: str = "", device_label: str = "") -> tuple[dict, str]:
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
        token = self.create_session(str(row["id"]), user_agent=user_agent, device_label=device_label)
        self.log_audit(str(row["id"]), str(row["id"]), "session.login", {"device": self._device_label(user_agent, device_label)})
        return self._public_user(row), token

    def create_session(self, user_id: str, user_agent: str = "", device_label: str = "") -> str:
        token = secrets.token_urlsafe(40)
        token_hash = self._hash_token(token)
        session_id = uuid.uuid4().hex
        now = int(time.time() * 1000)
        expires_at = now + SESSION_TTL_MS
        label = self._device_label(user_agent, device_label)
        with closing(self._connect()) as conn:
            conn.execute("DELETE FROM sessions WHERE expires_at <= ?", (now,))
            conn.execute(
                """
                INSERT INTO sessions (
                    token_hash, id, user_id, admin_user_id, device_label, user_agent,
                    created_at, expires_at, last_seen_at
                ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?)
                """,
                (token_hash, session_id, user_id, label, str(user_agent or "")[:512], now, expires_at, now),
            )
            conn.commit()
        return token

    def create_webauthn_challenge(
        self,
        user_id: str,
        kind: str,
        challenge: bytes,
        rp_id: str,
        origin: str,
        ttl_ms: int = 120_000,
    ) -> str:
        clean_kind = str(kind or "").strip()
        if clean_kind not in {"register", "authenticate"}:
            raise AuthError("Tipo di richiesta passkey non valido.", code="invalid_passkey_request")
        now = int(time.time() * 1000)
        challenge_id = uuid.uuid4().hex
        with closing(self._connect()) as conn:
            conn.execute("DELETE FROM webauthn_challenges WHERE expires_at <= ?", (now,))
            conn.execute(
                """
                INSERT INTO webauthn_challenges (
                    id, user_id, kind, challenge, rp_id, origin, created_at, expires_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    challenge_id,
                    str(user_id or ""),
                    clean_kind,
                    bytes(challenge),
                    str(rp_id or ""),
                    str(origin or ""),
                    now,
                    now + max(30_000, int(ttl_ms or 120_000)),
                ),
            )
            conn.commit()
        return challenge_id

    def consume_webauthn_challenge(
        self,
        challenge_id: str,
        kind: str,
        user_id: str | None = None,
    ) -> dict:
        clean_id = str(challenge_id or "").strip()
        now = int(time.time() * 1000)
        with closing(self._connect()) as conn:
            conn.execute("BEGIN IMMEDIATE")
            row = conn.execute(
                "SELECT * FROM webauthn_challenges WHERE id = ?",
                (clean_id,),
            ).fetchone()
            conn.execute("DELETE FROM webauthn_challenges WHERE id = ? OR expires_at <= ?", (clean_id, now))
            conn.commit()
        if not row or int(row["expires_at"] or 0) <= now:
            raise AuthError("La richiesta passkey e scaduta. Riprova.", status=409, code="passkey_challenge_expired")
        if str(row["kind"] or "") != str(kind or ""):
            raise AuthError("Richiesta passkey non valida.", status=409, code="invalid_passkey_request")
        if user_id is not None and str(row["user_id"] or "") != str(user_id or ""):
            raise AuthError("La passkey non appartiene a questo account.", status=403, code="passkey_user_mismatch")
        return {
            "id": str(row["id"]),
            "userId": str(row["user_id"]),
            "challenge": bytes(row["challenge"]),
            "rpId": str(row["rp_id"]),
            "origin": str(row["origin"]),
        }

    def passkey_descriptors(self, user_id: str) -> list[dict]:
        with closing(self._connect()) as conn:
            rows = conn.execute(
                "SELECT credential_id, transports_json FROM passkey_credentials WHERE user_id = ? ORDER BY created_at ASC",
                (str(user_id or ""),),
            ).fetchall()
        descriptors = []
        for row in rows:
            try:
                transports = json.loads(str(row["transports_json"] or "[]"))
            except json.JSONDecodeError:
                transports = []
            descriptors.append({
                "id": self.decode_credential_id(str(row["credential_id"])),
                "transports": transports if isinstance(transports, list) else [],
            })
        return descriptors

    def save_passkey(
        self,
        user_id: str,
        credential_id: bytes,
        public_key: bytes,
        sign_count: int,
        transports: list[str] | None = None,
        name: str = "",
        aaguid: str = "",
        device_type: str = "",
        backed_up: bool = False,
    ) -> dict:
        account = self.get_account_by_id(user_id)
        if not account:
            raise AuthError("Account non trovato.", status=404, code="account_not_found")
        encoded_id = self.encode_credential_id(credential_id)
        now = int(time.time() * 1000)
        clean_name = str(name or "Passkey").strip()[:80] or "Passkey"
        clean_transports = [
            str(item)[:32] for item in (transports or [])
            if str(item) in {"ble", "cable", "hybrid", "internal", "nfc", "smart-card", "usb"}
        ]
        try:
            with closing(self._connect()) as conn:
                conn.execute(
                    """
                    INSERT INTO passkey_credentials (
                        credential_id, user_id, public_key, sign_count, transports_json,
                        name, aaguid, device_type, backed_up, created_at, last_used_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
                    """,
                    (
                        encoded_id,
                        str(user_id),
                        bytes(public_key),
                        max(0, int(sign_count or 0)),
                        json.dumps(clean_transports),
                        clean_name,
                        str(aaguid or "")[:80],
                        str(device_type or "")[:40],
                        1 if backed_up else 0,
                        now,
                    ),
                )
                conn.commit()
        except sqlite3.IntegrityError as exc:
            raise AuthError("Questa passkey e gia registrata.", status=409, code="passkey_exists") from exc
        self.log_audit(str(user_id), str(user_id), "security.passkey_added", {"name": clean_name})
        return {
            "id": encoded_id,
            "name": clean_name,
            "createdAt": now,
            "lastUsedAt": 0,
            "backedUp": bool(backed_up),
        }

    def get_passkey(self, credential_id: str) -> dict | None:
        clean_id = str(credential_id or "").strip()
        with closing(self._connect()) as conn:
            row = conn.execute(
                """
                SELECT passkey_credentials.*, users.username, users.role, users.created_at AS user_created_at
                FROM passkey_credentials
                JOIN users ON users.id = passkey_credentials.user_id
                WHERE passkey_credentials.credential_id = ?
                """,
                (clean_id,),
            ).fetchone()
        if not row:
            return None
        return {
            "id": str(row["credential_id"]),
            "userId": str(row["user_id"]),
            "publicKey": bytes(row["public_key"]),
            "signCount": int(row["sign_count"] or 0),
            "user": {
                "id": str(row["user_id"]),
                "username": str(row["username"]),
                "role": str(row["role"] or "user"),
                "createdAt": int(row["user_created_at"] or 0),
            },
        }

    def mark_passkey_used(self, credential_id: str, sign_count: int) -> None:
        with closing(self._connect()) as conn:
            conn.execute(
                "UPDATE passkey_credentials SET sign_count = ?, last_used_at = ? WHERE credential_id = ?",
                (
                    max(0, int(sign_count or 0)),
                    int(time.time() * 1000),
                    str(credential_id or ""),
                ),
            )
            conn.commit()

    def list_passkeys(self, token: str) -> list[dict]:
        session_user = self.get_user_for_token(token)
        if not session_user:
            raise AuthError("Accedi per gestire le passkey.", status=401, code="authentication_required")
        with closing(self._connect()) as conn:
            rows = conn.execute(
                """
                SELECT credential_id, name, backed_up, created_at, last_used_at
                FROM passkey_credentials
                WHERE user_id = ?
                ORDER BY created_at DESC
                """,
                (str(session_user["id"]),),
            ).fetchall()
        return [
            {
                "id": str(row["credential_id"]),
                "name": str(row["name"] or "Passkey"),
                "backedUp": bool(row["backed_up"]),
                "createdAt": int(row["created_at"] or 0),
                "lastUsedAt": int(row["last_used_at"] or 0),
            }
            for row in rows
        ]

    def delete_passkey(self, token: str, credential_id: str) -> dict:
        session_user = self.get_user_for_token(token)
        if not session_user:
            raise AuthError("Accedi per gestire le passkey.", status=401, code="authentication_required")
        clean_id = str(credential_id or "").strip()
        with closing(self._connect()) as conn:
            row = conn.execute(
                "SELECT credential_id, name FROM passkey_credentials WHERE credential_id = ? AND user_id = ?",
                (clean_id, str(session_user["id"])),
            ).fetchone()
            if not row:
                raise AuthError("Passkey non trovata.", status=404, code="passkey_not_found")
            conn.execute("DELETE FROM passkey_credentials WHERE credential_id = ?", (clean_id,))
            conn.commit()
        self.log_audit(str(session_user["id"]), str(session_user["id"]), "security.passkey_removed", {
            "name": str(row["name"] or "Passkey"),
        })
        return {"id": clean_id, "name": str(row["name"] or "Passkey")}

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
                       sessions.last_seen_at AS session_last_seen_at,
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
            if now - int(row["session_last_seen_at"] or 0) >= SESSION_TOUCH_INTERVAL_MS:
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

    def list_all_accounts_internal(self) -> list[dict]:
        with closing(self._connect()) as conn:
            rows = conn.execute("SELECT * FROM users ORDER BY created_at ASC").fetchall()
        return [self._public_user(row) for row in rows]

    def log_audit(
        self,
        actor_user_id: str | None,
        target_user_id: str | None,
        action: str,
        detail: dict | None = None,
    ) -> None:
        clean_action = str(action or "").strip()
        if not clean_action:
            return
        with closing(self._connect()) as conn:
            conn.execute(
                """
                INSERT INTO audit_log (id, actor_user_id, target_user_id, action, detail_json, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    uuid.uuid4().hex,
                    str(actor_user_id or "") or None,
                    str(target_user_id or "") or None,
                    clean_action[:80],
                    json.dumps(detail or {}, ensure_ascii=False),
                    int(time.time() * 1000),
                ),
            )
            conn.execute(
                """
                DELETE FROM audit_log
                WHERE id IN (
                    SELECT id FROM audit_log ORDER BY created_at DESC LIMIT -1 OFFSET 500
                )
                """
            )
            conn.commit()

    def list_audit(self, token: str, limit: int = 50) -> list[dict]:
        session_user = self.get_user_for_token(token)
        if not session_user or session_user.get("role") != "owner" or session_user.get("impersonating"):
            raise AuthError("Solo il Proprietario puo vedere il registro.", status=403, code="owner_required")
        safe_limit = max(1, min(200, int(limit or 50)))
        with closing(self._connect()) as conn:
            rows = conn.execute(
                """
                SELECT audit_log.*, actor.username AS actor_username, target.username AS target_username
                FROM audit_log
                LEFT JOIN users AS actor ON actor.id = audit_log.actor_user_id
                LEFT JOIN users AS target ON target.id = audit_log.target_user_id
                ORDER BY audit_log.created_at DESC
                LIMIT ?
                """,
                (safe_limit,),
            ).fetchall()
        return [
            {
                "id": str(row["id"]),
                "action": str(row["action"]),
                "actor": str(row["actor_username"] or "Sistema"),
                "target": str(row["target_username"] or ""),
                "detail": json.loads(str(row["detail_json"] or "{}")),
                "createdAt": int(row["created_at"] or 0),
            }
            for row in rows
        ]

    def list_sessions(self, token: str) -> list[dict]:
        session_user = self.get_user_for_token(token)
        if not session_user:
            raise AuthError("Accedi per vedere le sessioni.", status=401, code="authentication_required")
        token_hash = self._hash_token(token)
        now = int(time.time() * 1000)
        with closing(self._connect()) as conn:
            rows = conn.execute(
                """
                SELECT id, token_hash, device_label, created_at, expires_at, last_seen_at
                FROM sessions
                WHERE user_id = ? AND expires_at > ?
                ORDER BY last_seen_at DESC
                """,
                (str(session_user["id"]), now),
            ).fetchall()
        return [
            {
                "id": str(row["id"] or ""),
                "device": str(row["device_label"] or "Dispositivo"),
                "createdAt": int(row["created_at"] or 0),
                "expiresAt": int(row["expires_at"] or 0),
                "lastSeenAt": int(row["last_seen_at"] or 0),
                "current": hmac.compare_digest(str(row["token_hash"]), token_hash),
            }
            for row in rows
        ]

    def revoke_session(self, token: str, session_id: str) -> dict:
        session_user = self.get_user_for_token(token)
        if not session_user:
            raise AuthError("Accedi per gestire le sessioni.", status=401, code="authentication_required")
        clean_id = str(session_id or "").strip()
        token_hash = self._hash_token(token)
        with closing(self._connect()) as conn:
            row = conn.execute(
                "SELECT * FROM sessions WHERE id = ? AND user_id = ?",
                (clean_id, str(session_user["id"])),
            ).fetchone()
            if not row:
                raise AuthError("Sessione non trovata.", status=404, code="session_not_found")
            if hmac.compare_digest(str(row["token_hash"]), token_hash):
                raise AuthError("Per uscire da questo dispositivo usa Esci dall'account.", status=409, code="current_session")
            conn.execute("DELETE FROM sessions WHERE id = ?", (clean_id,))
            conn.commit()
        self.log_audit(str(session_user["id"]), str(session_user["id"]), "session.revoked", {
            "device": str(row["device_label"] or "Dispositivo"),
        })
        return {"id": clean_id, "device": str(row["device_label"] or "Dispositivo")}

    def issue_recovery_code(self, token: str) -> str:
        session_user = self.get_user_for_token(token)
        if not session_user:
            raise AuthError("Accedi per creare un codice di recupero.", status=401, code="authentication_required")
        recovery_code = self._new_recovery_code()
        recovery_salt = os.urandom(16)
        recovery_hash = self._hash_recovery_code(recovery_code, recovery_salt)
        with closing(self._connect()) as conn:
            conn.execute(
                "UPDATE users SET recovery_salt = ?, recovery_hash = ? WHERE id = ?",
                (recovery_salt, recovery_hash, str(session_user["id"])),
            )
            conn.commit()
        self.log_audit(str(session_user["id"]), str(session_user["id"]), "security.recovery_code_issued")
        return recovery_code

    def recover_account(
        self,
        username: str,
        recovery_code: str,
        new_password: str,
        user_agent: str = "",
        device_label: str = "",
    ) -> tuple[dict, str, str]:
        _, key = self.normalize_username(username)
        password = self.validate_password(new_password)
        normalized_code = self._normalize_recovery_code(recovery_code)
        with closing(self._connect()) as conn:
            row = conn.execute("SELECT * FROM users WHERE username_key = ?", (key,)).fetchone()
        if not row or not row["recovery_salt"] or not row["recovery_hash"] or len(normalized_code) != 20:
            raise AuthError("Codice di recupero non valido.", status=401, code="invalid_recovery_code")
        actual = self._hash_recovery_code(normalized_code, bytes(row["recovery_salt"]))
        if not hmac.compare_digest(bytes(row["recovery_hash"]), actual):
            raise AuthError("Codice di recupero non valido.", status=401, code="invalid_recovery_code")

        password_salt = os.urandom(16)
        password_hash = self._hash_password(password, password_salt)
        next_recovery_code = self._new_recovery_code()
        next_recovery_salt = os.urandom(16)
        next_recovery_hash = self._hash_recovery_code(next_recovery_code, next_recovery_salt)
        user_id = str(row["id"])
        with closing(self._connect()) as conn:
            conn.execute("BEGIN IMMEDIATE")
            conn.execute(
                """
                UPDATE users
                SET password_salt = ?, password_hash = ?, recovery_salt = ?, recovery_hash = ?
                WHERE id = ?
                """,
                (password_salt, password_hash, next_recovery_salt, next_recovery_hash, user_id),
            )
            conn.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
            conn.commit()
            refreshed = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        token = self.create_session(user_id, user_agent=user_agent, device_label=device_label)
        self.log_audit(user_id, user_id, "security.account_recovered")
        return self._public_user(refreshed), token, next_recovery_code

    def save_push_subscription(self, token: str, subscription: dict) -> dict:
        session_user = self.get_user_for_token(token)
        if not session_user:
            raise AuthError("Accedi per attivare le notifiche.", status=401, code="authentication_required")
        endpoint = str((subscription or {}).get("endpoint") or "").strip()
        keys = (subscription or {}).get("keys")
        if not endpoint.startswith("https://") or not isinstance(keys, dict) or not keys.get("p256dh") or not keys.get("auth"):
            raise AuthError("Sottoscrizione push non valida.", code="invalid_push_subscription")
        now = int(time.time() * 1000)
        subscription_id = uuid.uuid4().hex
        with closing(self._connect()) as conn:
            conn.execute(
                """
                INSERT INTO push_subscriptions (
                    id, user_id, endpoint, subscription_json, created_at, last_success_at, failure_count
                ) VALUES (?, ?, ?, ?, ?, 0, 0)
                ON CONFLICT(endpoint) DO UPDATE SET
                    user_id=excluded.user_id,
                    subscription_json=excluded.subscription_json,
                    failure_count=0
                """,
                (
                    subscription_id,
                    str(session_user["id"]),
                    endpoint,
                    json.dumps(subscription, ensure_ascii=False),
                    now,
                ),
            )
            row = conn.execute("SELECT id FROM push_subscriptions WHERE endpoint = ?", (endpoint,)).fetchone()
            conn.commit()
        self.log_audit(str(session_user["id"]), str(session_user["id"]), "push.enabled")
        return {"id": str(row["id"]), "endpoint": endpoint}

    def remove_push_subscription(self, token: str, endpoint: str) -> None:
        session_user = self.get_user_for_token(token)
        if not session_user:
            raise AuthError("Accedi per gestire le notifiche.", status=401, code="authentication_required")
        with closing(self._connect()) as conn:
            conn.execute(
                "DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?",
                (str(session_user["id"]), str(endpoint or "")),
            )
            conn.commit()
        self.log_audit(str(session_user["id"]), str(session_user["id"]), "push.disabled")

    def list_push_subscriptions(self, user_id: str) -> list[dict]:
        with closing(self._connect()) as conn:
            rows = conn.execute(
                "SELECT * FROM push_subscriptions WHERE user_id = ? ORDER BY created_at DESC",
                (str(user_id or ""),),
            ).fetchall()
        subscriptions = []
        for row in rows:
            try:
                payload = json.loads(str(row["subscription_json"] or "{}"))
            except json.JSONDecodeError:
                payload = {}
            if isinstance(payload, dict) and payload.get("endpoint"):
                payload["_subscriptionId"] = str(row["id"])
                subscriptions.append(payload)
        return subscriptions

    def mark_push_result(self, subscription_id: str, success: bool, permanent_failure: bool = False) -> None:
        with closing(self._connect()) as conn:
            if permanent_failure:
                conn.execute("DELETE FROM push_subscriptions WHERE id = ?", (str(subscription_id or ""),))
            elif success:
                conn.execute(
                    "UPDATE push_subscriptions SET last_success_at = ?, failure_count = 0 WHERE id = ?",
                    (int(time.time() * 1000), str(subscription_id or "")),
                )
            else:
                conn.execute(
                    "UPDATE push_subscriptions SET failure_count = failure_count + 1 WHERE id = ?",
                    (str(subscription_id or ""),),
                )
            conn.commit()

    def register_push_delivery(self, user_id: str, delivery_key: str, kind: str) -> bool:
        try:
            with closing(self._connect()) as conn:
                conn.execute(
                    "INSERT INTO push_deliveries (delivery_key, user_id, kind, created_at) VALUES (?, ?, ?, ?)",
                    (str(delivery_key), str(user_id), str(kind), int(time.time() * 1000)),
                )
                conn.execute(
                    "DELETE FROM push_deliveries WHERE created_at < ?",
                    (int(time.time() * 1000) - (120 * 24 * 60 * 60 * 1000),),
                )
                conn.commit()
            return True
        except sqlite3.IntegrityError:
            return False

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
        self.log_audit(owner_id, target_id, "admin.account_opened")
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
        self.log_audit(str(session_user["id"]), target_id, "account.deleted", {"username": public_target["username"]})
        return public_target

    def logout(self, token: str) -> None:
        if not token:
            return
        current = self.get_user_for_token(token)
        with closing(self._connect()) as conn:
            conn.execute("DELETE FROM sessions WHERE token_hash = ?", (self._hash_token(token),))
            conn.commit()
        if current:
            self.log_audit(str(current["id"]), str(current["id"]), "session.logout")

    def user_db_path(self, user_id: str) -> Path:
        safe_id = str(user_id or "")
        if not re.fullmatch(r"[a-f0-9]{32}", safe_id):
            raise AuthError("Account non valido.", status=401, code="invalid_account")
        directory = self.users_dir / safe_id
        directory.mkdir(parents=True, exist_ok=True)
        return directory / "gestore_data.sqlite3"
