import pathlib
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.backend.auth_store import AuthError, AuthStore
from app.backend.history_store import (
    list_history,
    mark_reverted,
    read_history_item,
    record_payslip_change,
    record_snapshot_changes,
)


def expect_auth_error(callback, code):
    try:
        callback()
    except AuthError as exc:
        assert exc.code == code, (exc.code, code)
        return
    raise AssertionError(f"Expected AuthError {code}")


with tempfile.TemporaryDirectory(prefix="gestore-platform-test-") as temp_root:
    data_dir = pathlib.Path(temp_root)
    store = AuthStore(data_dir)
    owner, owner_token, first_account, recovery_code = store.create_account(
        "ownerqa",
        "password-qa-2026",
        user_agent="QA Browser",
        device_label="iPhone QA",
    )
    assert first_account is True
    assert owner["role"] == "owner"
    assert len(recovery_code.replace("-", "")) == 20

    _, second_token = store.login(
        "ownerqa",
        "password-qa-2026",
        user_agent="QA Desktop",
        device_label="Desktop QA",
    )
    sessions = store.list_sessions(owner_token)
    assert len(sessions) == 2
    assert sum(1 for item in sessions if item["current"]) == 1
    other_session = next(item for item in sessions if not item["current"])
    revoked = store.revoke_session(owner_token, other_session["id"])
    assert revoked["device"] == "Desktop QA"
    assert store.get_user_for_token(second_token) is None
    expect_auth_error(
        lambda: store.revoke_session(owner_token, next(item for item in store.list_sessions(owner_token) if item["current"])["id"]),
        "current_session",
    )

    next_code = store.issue_recovery_code(owner_token)
    recovered, recovered_token, rotated_code = store.recover_account(
        "ownerqa",
        next_code,
        "password-qa-2026-new",
        user_agent="Recovery QA",
        device_label="Recovered iPhone",
    )
    assert recovered["id"] == owner["id"]
    assert store.get_user_for_token(owner_token) is None
    assert store.get_user_for_token(recovered_token)["id"] == owner["id"]
    assert rotated_code != next_code

    subscription = {
        "endpoint": "https://push.example.test/qa",
        "keys": {"p256dh": "test-key", "auth": "test-auth"},
    }
    stored_subscription = store.save_push_subscription(recovered_token, subscription)
    listed_subscriptions = store.list_push_subscriptions(owner["id"])
    assert stored_subscription["id"] == listed_subscriptions[0]["_subscriptionId"]
    assert store.register_push_delivery(owner["id"], "qa:weekly:2026-30", "weekly") is True
    assert store.register_push_delivery(owner["id"], "qa:weekly:2026-30", "weekly") is False

    user_db = store.user_db_path(owner["id"])
    before = {"entries": {}, "settings": {"weeklyTarget": 40}}
    after = {
        "entries": {
            "2026-07-24": {
                "type": "lavoro",
                "start": "08:00",
                "end": "17:00",
                "breakHours": 1,
            }
        },
        "settings": {"weeklyTarget": 36},
    }
    changes = record_snapshot_changes(user_db, before, after, mutation_id="qa-snapshot", actor="ownerqa")
    assert len(changes) == 2
    payslip_history_id = record_payslip_change(
        user_db,
        payslip_id="qa-payslip",
        before=None,
        after={"id": "qa-payslip", "month": 7, "year": 2026, "netAmount": 1800},
        mutation_id="qa-payslip",
        actor="ownerqa",
    )
    history = list_history(user_db)
    assert len(history) == 3
    item = read_history_item(user_db, payslip_history_id)
    assert item["before"]["exists"] is False
    mark_reverted(user_db, payslip_history_id)
    assert next(row for row in list_history(user_db) if row["id"] == payslip_history_id)["undoable"] is False

    audit = store.list_audit(recovered_token, limit=100)
    actions = {item["action"] for item in audit}
    assert "account.created" in actions
    assert "security.account_recovered" in actions
    assert "session.revoked" in actions
    assert "push.enabled" in actions

    print(
        {
            "ok": True,
            "sessions": len(sessions),
            "history": len(history),
            "auditActions": len(actions),
            "recoveryRotated": rotated_code != next_code,
            "pushStored": bool(listed_subscriptions),
        }
    )
