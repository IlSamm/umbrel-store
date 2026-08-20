from __future__ import annotations

import hashlib
import json
import sqlite3
import time
import uuid
import zlib
from contextlib import closing
from pathlib import Path


HISTORY_LIMIT = 240
HISTORY_MAX_BLOB_BYTES = 64 * 1024 * 1024


def _connect(db_path: Path) -> sqlite3.Connection:
    path = Path(db_path).resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, timeout=20)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS change_history (
            id TEXT PRIMARY KEY,
            kind TEXT NOT NULL,
            entity_id TEXT,
            action TEXT NOT NULL,
            label TEXT NOT NULL,
            before_blob BLOB,
            after_digest TEXT,
            mutation_id TEXT,
            actor TEXT,
            created_at INTEGER NOT NULL,
            reverted_at INTEGER NOT NULL DEFAULT 0
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS change_history_created_idx ON change_history(created_at DESC)")
    conn.execute("CREATE INDEX IF NOT EXISTS change_history_entity_idx ON change_history(kind, entity_id)")
    conn.commit()
    return conn


def _encode(value) -> bytes:
    raw = json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return zlib.compress(raw, level=6)


def _decode(value: bytes | None):
    if value is None:
        return None
    return json.loads(zlib.decompress(bytes(value)).decode("utf-8"))


def _digest(value) -> str:
    raw = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def _insert(
    conn: sqlite3.Connection,
    *,
    kind: str,
    entity_id: str,
    action: str,
    label: str,
    before,
    after,
    mutation_id: str = "",
    actor: str = "",
) -> str:
    history_id = uuid.uuid4().hex
    conn.execute(
        """
        INSERT INTO change_history (
            id, kind, entity_id, action, label, before_blob, after_digest,
            mutation_id, actor, created_at, reverted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
        """,
        (
            history_id,
            str(kind or "")[:30],
            str(entity_id or "")[:160],
            str(action or "updated")[:40],
            str(label or "Modifica")[:180],
            _encode(before),
            _digest(after),
            str(mutation_id or "")[:160],
            str(actor or "")[:80],
            int(time.time() * 1000),
        ),
    )
    return history_id


def _prune(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        DELETE FROM change_history
        WHERE id IN (
            SELECT id FROM change_history ORDER BY created_at DESC LIMIT -1 OFFSET ?
        )
        """,
        (HISTORY_LIMIT,),
    )
    while True:
        summary = conn.execute(
            "SELECT COUNT(*) AS count, COALESCE(SUM(LENGTH(before_blob)), 0) AS bytes FROM change_history"
        ).fetchone()
        if int(summary["count"] or 0) <= 1 or int(summary["bytes"] or 0) <= HISTORY_MAX_BLOB_BYTES:
            break
        oldest = conn.execute(
            "SELECT id FROM change_history ORDER BY created_at ASC LIMIT 1"
        ).fetchone()
        if not oldest:
            break
        conn.execute("DELETE FROM change_history WHERE id = ?", (str(oldest["id"]),))


def record_snapshot_changes(
    db_path: Path,
    before: dict,
    after: dict,
    *,
    mutation_id: str = "",
    actor: str = "",
) -> list[str]:
    before = before if isinstance(before, dict) else {}
    after = after if isinstance(after, dict) else {}
    before_entries = before.get("entries") if isinstance(before.get("entries"), dict) else {}
    after_entries = after.get("entries") if isinstance(after.get("entries"), dict) else {}
    changed_ids = []

    with closing(_connect(db_path)) as conn:
        conn.execute("BEGIN IMMEDIATE")
        for date_key in sorted(set(before_entries) | set(after_entries)):
            previous = before_entries.get(date_key)
            current = after_entries.get(date_key)
            if previous == current:
                continue
            action = "created" if previous is None else ("deleted" if current is None else "updated")
            changed_ids.append(_insert(
                conn,
                kind="entry",
                entity_id=date_key,
                action=action,
                label=f"Giornata {date_key}",
                before={"exists": previous is not None, "value": previous},
                after={"exists": current is not None, "value": current},
                mutation_id=mutation_id,
                actor=actor,
            ))

        previous_settings = before.get("settings") if isinstance(before.get("settings"), dict) else {}
        current_settings = after.get("settings") if isinstance(after.get("settings"), dict) else {}
        if previous_settings != current_settings:
            changed_ids.append(_insert(
                conn,
                kind="settings",
                entity_id="settings",
                action="updated",
                label="Impostazioni",
                before={"exists": True, "value": previous_settings},
                after={"exists": True, "value": current_settings},
                mutation_id=mutation_id,
                actor=actor,
            ))
        _prune(conn)
        conn.commit()
    return changed_ids


def record_payslip_change(
    db_path: Path,
    *,
    payslip_id: str,
    before,
    after,
    mutation_id: str = "",
    actor: str = "",
) -> str | None:
    def without_photo_payload(value):
        if not isinstance(value, dict):
            return value
        compact = dict(value)
        photos = compact.pop("photos", []) if isinstance(compact.get("photos"), list) else []
        count = max(int(compact.get("photoCount") or 0), len(photos), 1 if compact.get("imageData") else 0)
        compact.pop("imageData", None)
        compact.pop("thumbnail", None)
        compact["photoCount"] = count
        compact["photosDeferred"] = count > 0
        return compact

    before = without_photo_payload(before)
    after = without_photo_payload(after)
    if before == after:
        return None
    action = "created" if before is None else ("deleted" if after is None else "updated")
    month = (after or before or {}).get("month")
    year = (after or before or {}).get("year")
    period = f"{month:02d}/{year}" if isinstance(month, int) and isinstance(year, int) else str(payslip_id)
    with closing(_connect(db_path)) as conn:
        conn.execute("BEGIN IMMEDIATE")
        history_id = _insert(
            conn,
            kind="payslip",
            entity_id=str(payslip_id),
            action=action,
            label=f"Busta paga {period}",
            before={"exists": before is not None, "value": before},
            after={"exists": after is not None, "value": after},
            mutation_id=mutation_id,
            actor=actor,
        )
        _prune(conn)
        conn.commit()
    return history_id


def list_history(db_path: Path, limit: int = 30) -> list[dict]:
    safe_limit = max(1, min(100, int(limit or 30)))
    with closing(_connect(db_path)) as conn:
        rows = conn.execute(
            """
            SELECT id, kind, entity_id, action, label, mutation_id, actor, created_at, reverted_at
            FROM change_history
            ORDER BY created_at DESC
            LIMIT ?
            """,
            (safe_limit,),
        ).fetchall()
    return [
        {
            "id": str(row["id"]),
            "kind": str(row["kind"]),
            "entityId": str(row["entity_id"] or ""),
            "action": str(row["action"]),
            "label": str(row["label"]),
            "mutationId": str(row["mutation_id"] or ""),
            "actor": str(row["actor"] or ""),
            "createdAt": int(row["created_at"] or 0),
            "revertedAt": int(row["reverted_at"] or 0),
            "undoable": not bool(row["reverted_at"]),
        }
        for row in rows
    ]


def read_history_item(db_path: Path, history_id: str) -> dict:
    with closing(_connect(db_path)) as conn:
        row = conn.execute("SELECT * FROM change_history WHERE id = ?", (str(history_id or ""),)).fetchone()
    if not row:
        raise ValueError("Modifica non trovata.")
    if int(row["reverted_at"] or 0):
        raise ValueError("Questa modifica e gia stata annullata.")
    return {
        "id": str(row["id"]),
        "kind": str(row["kind"]),
        "entityId": str(row["entity_id"] or ""),
        "action": str(row["action"]),
        "label": str(row["label"]),
        "before": _decode(row["before_blob"]),
        "createdAt": int(row["created_at"] or 0),
    }


def mark_reverted(db_path: Path, history_id: str) -> None:
    with closing(_connect(db_path)) as conn:
        conn.execute(
            "UPDATE change_history SET reverted_at = ? WHERE id = ? AND reverted_at = 0",
            (int(time.time() * 1000), str(history_id or "")),
        )
        conn.commit()
