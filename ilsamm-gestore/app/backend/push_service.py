from __future__ import annotations

import base64
import json
import os
import threading
import time
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

try:
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import ec
    from pywebpush import WebPushException, webpush
except ImportError:
    serialization = None
    ec = None
    WebPushException = Exception
    webpush = None


def _b64url(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


class PushService:
    def __init__(self, auth_store, data_dir: Path) -> None:
        self.auth_store = auth_store
        self.data_dir = Path(data_dir).resolve()
        self.private_key_path = self.data_dir / "gestore-vapid-private.pem"
        self.public_key_path = self.data_dir / "gestore-vapid-public.txt"
        try:
            self.timezone = ZoneInfo(os.environ.get("GESTORE_TIMEZONE", "Europe/Rome"))
        except Exception:
            self.timezone = datetime.now().astimezone().tzinfo
        self._stop_event = threading.Event()
        self._thread: threading.Thread | None = None
        self._snapshot_loader = None
        self._db_path_for_user = None
        self.available = bool(webpush and ec and serialization)
        self.public_key = ""
        if self.available:
            try:
                self.public_key = self._ensure_vapid_keys()
            except Exception:
                self.available = False
                self.public_key = ""

    def _ensure_vapid_keys(self) -> str:
        self.data_dir.mkdir(parents=True, exist_ok=True)
        if self.private_key_path.exists() and self.public_key_path.exists():
            public_key = self.public_key_path.read_text(encoding="ascii").strip()
            if public_key:
                return public_key
        private_key = ec.generate_private_key(ec.SECP256R1())
        private_pem = private_key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        )
        public_bytes = private_key.public_key().public_bytes(
            serialization.Encoding.X962,
            serialization.PublicFormat.UncompressedPoint,
        )
        self.private_key_path.write_bytes(private_pem)
        public_key = _b64url(public_bytes)
        self.public_key_path.write_text(public_key, encoding="ascii")
        return public_key

    def configuration(self, user_id: str = "") -> dict:
        subscriptions = self.auth_store.list_push_subscriptions(user_id) if user_id else []
        return {
            "available": self.available,
            "publicKey": self.public_key,
            "subscriptions": len(subscriptions),
        }

    def send_to_user(self, user_id: str, payload: dict) -> dict:
        subscriptions = self.auth_store.list_push_subscriptions(user_id)
        result = {"sent": 0, "failed": 0, "subscriptions": len(subscriptions)}
        if not self.available:
            result["error"] = "Servizio Web Push non disponibile."
            return result
        for subscription in subscriptions:
            subscription_id = str(subscription.pop("_subscriptionId", ""))
            try:
                webpush(
                    subscription_info=subscription,
                    data=json.dumps(payload, ensure_ascii=False),
                    vapid_private_key=str(self.private_key_path),
                    vapid_claims={"sub": "mailto:admin@gestore.local"},
                    ttl=60 * 60 * 12,
                    timeout=12,
                )
                self.auth_store.mark_push_result(subscription_id, True)
                result["sent"] += 1
            except WebPushException as exc:
                status = int(getattr(getattr(exc, "response", None), "status_code", 0) or 0)
                self.auth_store.mark_push_result(subscription_id, False, status in (404, 410))
                result["failed"] += 1
            except Exception:
                self.auth_store.mark_push_result(subscription_id, False)
                result["failed"] += 1
        return result

    def start(self, snapshot_loader, db_path_for_user) -> None:
        self._snapshot_loader = snapshot_loader
        self._db_path_for_user = db_path_for_user
        if self._thread and self._thread.is_alive():
            return
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._run, name="gestore-web-push", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop_event.set()

    def _run(self) -> None:
        while not self._stop_event.wait(30):
            try:
                self._dispatch_due_notifications()
            except Exception:
                continue

    @staticmethod
    def _entry_exists(entries: dict, date_key: str) -> bool:
        entry = entries.get(date_key)
        return isinstance(entry, dict) and bool(entry.get("type") or entry.get("start") or entry.get("end"))

    @staticmethod
    def _previous_month(now: datetime) -> tuple[int, int]:
        previous = now.replace(day=1) - timedelta(days=1)
        return previous.month, previous.year

    def _notification_for_user(self, account: dict, snapshot: dict, now: datetime) -> tuple[str, dict] | None:
        settings = snapshot.get("settings") if isinstance(snapshot.get("settings"), dict) else {}
        if not settings.get("pushEnabled") or not settings.get("remindersEnabled"):
            return None
        reminder_time = str(settings.get("reminderTime") or "20:00")
        try:
            reminder_hour, reminder_minute = [int(value) for value in reminder_time.split(":", 1)]
        except (TypeError, ValueError):
            reminder_hour, reminder_minute = 20, 0
        if now.hour != reminder_hour or now.minute != reminder_minute:
            return None

        entries = snapshot.get("entries") if isinstance(snapshot.get("entries"), dict) else {}
        payslips = snapshot.get("payslips") if isinstance(snapshot.get("payslips"), list) else []
        today_key = now.strftime("%Y-%m-%d")
        weekday = now.weekday()
        workdays = [int(value) for value in settings.get("workdays", [0, 1, 2, 3, 4]) if str(value).isdigit()]

        if settings.get("smartReminderMissingDays", True) and weekday in workdays and not self._entry_exists(entries, today_key):
            return "missing-day", {
                "title": "Giornata da completare",
                "body": "Manca ancora la registrazione di oggi.",
                "url": "/?open=today",
                "tag": f"missing-{today_key}",
            }

        if settings.get("smartReminderWeeklyReview", True) and weekday in (0, 5):
            reference = now - timedelta(days=7) if weekday == 0 else now
            monday = reference - timedelta(days=reference.weekday())
            missing = []
            for day_index in workdays:
                date_value = monday + timedelta(days=day_index)
                if date_value.date() <= now.date() and not self._entry_exists(entries, date_value.strftime("%Y-%m-%d")):
                    missing.append(date_value)
            if missing:
                return "weekly-review", {
                    "title": "Controllo della settimana",
                    "body": f"Mancano {len(missing)} giornate da verificare.",
                    "url": "/?open=calendar",
                    "tag": f"weekly-{monday.strftime('%Y-%m-%d')}",
                }

        if settings.get("smartReminderPayslips", True) and now.day >= 10:
            month, year = self._previous_month(now)
            found = any(int(item.get("month") or 0) == month and int(item.get("year") or 0) == year for item in payslips)
            if not found:
                return "payslip", {
                    "title": "Busta paga da archiviare",
                    "body": "Non hai ancora salvato la busta paga del mese scorso.",
                    "url": "/?open=payslips",
                    "tag": f"payslip-{year}-{month:02d}",
                }
        return None

    def _dispatch_due_notifications(self) -> None:
        if not self.available or not self._snapshot_loader or not self._db_path_for_user:
            return
        now = datetime.now(self.timezone)
        for account in self.auth_store.list_all_accounts_internal():
            user_id = str(account.get("id") or "")
            if not user_id or not self.auth_store.list_push_subscriptions(user_id):
                continue
            snapshot = self._snapshot_loader(db_path=self._db_path_for_user(user_id))
            candidate = self._notification_for_user(account, snapshot, now)
            if not candidate:
                continue
            kind, payload = candidate
            delivery_key = f"{user_id}:{kind}:{payload.get('tag', now.strftime('%Y-%m-%d'))}"
            if not self.auth_store.register_push_delivery(user_id, delivery_key, kind):
                continue
            result = self.send_to_user(user_id, payload)
            if result.get("sent"):
                self.auth_store.log_audit(user_id, user_id, "push.sent", {"kind": kind})
