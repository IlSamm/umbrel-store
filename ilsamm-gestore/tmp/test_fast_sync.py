from __future__ import annotations

import json
import os
import sys
import tempfile
import threading
import time
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "app" / "backend"
sys.path.insert(0, str(BACKEND))


def make_payslip(index: int, payload: str) -> dict:
    return {
        "id": f"payslip-{index}",
        "month": (index % 12) + 1,
        "year": 2026,
        "netto": 1500 + index,
        "hourlyRate": 10.5,
        "overtimeRate": 15.75,
        "notes": f"Nota {index}",
        "photos": [{"id": f"photo-{index}", "data": payload, "fileName": f"busta-{index}.jpg"}],
        "imageData": payload,
        "fileName": f"busta-{index}.jpg",
        "createdAt": 1_700_000_000_000 + index,
    }


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="gestore-fast-sync-") as temp_dir:
        os.environ["GESTORE_DATA_DIR"] = temp_dir
        import server

        db_path = Path(temp_dir) / "profile.sqlite3"
        photo_payload = "data:image/jpeg;base64," + ("A" * (384 * 1024))
        original = [make_payslip(index, photo_payload) for index in range(6)]
        server.save_snapshot(
            {
                "entries": {"2026-07-21": {"type": "lavoro", "start": "08:00", "end": "17:00"}},
                "settings": {"userName": "Samuele"},
                "payslips": original,
                "updatedAt": int(time.time() * 1000),
            },
            db_path=db_path,
            force_replace=True,
        )

        full = server.load_snapshot(db_path=db_path)
        compact = server.load_compact_snapshot(db_path=db_path)
        full_bytes = len(json.dumps(full, ensure_ascii=False).encode("utf-8"))
        compact_raw = json.dumps(compact, ensure_ascii=False).encode("utf-8")
        legacy_payload_bytes = len(json.dumps(original, ensure_ascii=False).encode("utf-8"))
        assert len(compact_raw) < legacy_payload_bytes // 20
        assert b"data:image" not in json.dumps(full, ensure_ascii=False).encode("utf-8")
        assert b"data:image" not in compact_raw
        assert all(item.get("photosDeferred") for item in compact["payslips"])

        compact_update = {
            "entries": {
                **compact["entries"],
                "2026-07-22": {"type": "lavoro", "start": "08:00", "end": "18:00"},
            },
            "settings": compact["settings"],
            "payslips": compact["payslips"],
            "payslipsDeferred": True,
            "updatedAt": int(time.time() * 1000),
        }
        server.save_snapshot(compact_update, db_path=db_path)
        after_compact_sync = server.load_snapshot(db_path=db_path)
        assert len(after_compact_sync["payslips"]) == len(original)
        hydrated = server.load_payslip_record("payslip-0", db_path=db_path)
        assert hydrated["photos"][0]["data"] == photo_payload

        failures: list[BaseException] = []

        def generic_sync_worker() -> None:
            try:
                for index in range(12):
                    current = server.load_compact_snapshot(db_path=db_path)
                    current["entries"][f"2026-08-{index + 1:02d}"] = {
                        "type": "lavoro",
                        "start": "08:00",
                        "end": "17:00",
                    }
                    current["payslipsDeferred"] = True
                    server.save_snapshot(current, db_path=db_path)
            except BaseException as exc:
                failures.append(exc)

        def payslip_worker() -> None:
            try:
                for index in range(6, 10):
                    server.save_payslip_record(make_payslip(index, photo_payload), db_path)
            except BaseException as exc:
                failures.append(exc)

        threads = [threading.Thread(target=generic_sync_worker), threading.Thread(target=payslip_worker)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=30)
        assert not failures, failures
        assert all(not thread.is_alive() for thread in threads)

        final = server.load_snapshot(db_path=db_path)
        final_ids = {item.get("id") for item in final["payslips"]}
        assert final_ids == {f"payslip-{index}" for index in range(10)}
        assert all(item.get("photosDeferred") and item.get("photoCount") == 1 for item in final["payslips"])
        assert all(
            server.load_payslip_record(f"payslip-{index}", db_path=db_path)["photos"][0]["data"] == photo_payload
            for index in range(10)
        )
        assert len(final["entries"]) == 14

        assert server.resolve_auto_backup_interval_ms({"settings": {"protectedHistoryFrequency": "off"}}) is None
        assert server.resolve_auto_backup_interval_ms({"settings": {"protectedHistoryFrequency": "daily"}}) == 24 * 60 * 60 * 1000
        assert server.resolve_auto_backup_interval_ms({"settings": {"protectedHistoryFrequency": "every3days"}}) == 3 * 24 * 60 * 60 * 1000
        assert server.resolve_auto_backup_interval_ms({"settings": {"protectedHistoryFrequency": "weekly"}}) == 7 * 24 * 60 * 60 * 1000
        assert server.resolve_auto_backup_interval_ms({"settings": {"protectedHistoryFrequency": "monthly"}}) == 30 * 24 * 60 * 60 * 1000

        schedule_dir = Path(temp_dir) / "schedule-test"
        schedule_dir.mkdir(parents=True, exist_ok=True)
        schedule_db = schedule_dir / "profile.sqlite3"
        schedule_snapshot = {
            "entries": {},
            "settings": {"protectedHistoryFrequency": "off"},
            "payslips": [],
            "updatedAt": int(time.time() * 1000),
        }
        server.save_snapshot(schedule_snapshot, db_path=schedule_db, force_replace=True)
        assert server.create_scheduled_backup(schedule_db, schedule_snapshot) is None
        assert server.list_versioned_backups(schedule_db) == []

        schedule_snapshot["settings"]["protectedHistoryFrequency"] = "daily"
        first_scheduled = server.create_scheduled_backup(schedule_db, schedule_snapshot)
        second_scheduled = server.create_scheduled_backup(schedule_db, schedule_snapshot)
        assert first_scheduled is not None
        assert second_scheduled is not None
        assert first_scheduled["id"] == second_scheduled["id"]
        assert len(server.list_versioned_backups(schedule_db)) == 1

        compact_started = time.perf_counter()
        for _ in range(40):
            server.load_compact_snapshot(db_path=db_path)
        compact_ms = (time.perf_counter() - compact_started) * 1000

        print(json.dumps({
            "ok": True,
            "legacyPayloadBytes": legacy_payload_bytes,
            "metadataBytes": full_bytes,
            "compactBytes": len(compact_raw),
            "sizeReductionPercent": round((1 - len(compact_raw) / legacy_payload_bytes) * 100, 2),
            "compactLoads40Ms": round(compact_ms, 2),
            "payslips": len(final["payslips"]),
            "entries": len(final["entries"]),
            "concurrentWritesPreserved": True,
            "protectedHistoryScheduleVerified": True,
        }))


if __name__ == "__main__":
    main()
