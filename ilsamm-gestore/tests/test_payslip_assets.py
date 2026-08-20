import base64
import json
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "app" / "backend"))

import server  # noqa: E402


def data_url(payload: bytes, mime_type: str = "image/jpeg") -> str:
    return f"data:{mime_type};base64,{base64.b64encode(payload).decode('ascii')}"


class PayslipAssetStorageTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="gestore-assets-")
        self.db_path = Path(self.temp.name) / "account.sqlite3"

    def tearDown(self):
        self.temp.cleanup()

    def seed_legacy_record(self):
        legacy = [{
            "id": "cedolino-legacy",
            "month": 7,
            "year": 2026,
            "netto": 1500,
            "photos": [{
                "id": "foto-legacy",
                "data": data_url(b"legacy-photo"),
                "fileName": "luglio.jpg",
            }],
        }]
        conn = server.get_db(self.db_path)
        conn.execute(
            """
            INSERT INTO app_state (
                profile_id, entries_json, settings_json, payslips_json,
                payslips_compact_json, sync_meta_json, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            ("default", "{}", "{}", json.dumps(legacy), None, "{}", 1),
        )
        conn.commit()
        conn.close()

    def test_legacy_base64_is_migrated_without_losing_the_photo(self):
        self.seed_legacy_record()

        snapshot = server.load_snapshot(db_path=self.db_path)
        record = snapshot["payslips"][0]
        self.assertEqual(record["photoCount"], 1)
        self.assertTrue(record["photosDeferred"])
        self.assertNotIn("photos", record)
        self.assertNotIn("imageData", record)

        hydrated = server.load_payslip_record("cedolino-legacy", db_path=self.db_path)
        self.assertIsNotNone(hydrated)
        encoded = hydrated["photos"][0]["data"].split(",", 1)[1]
        self.assertEqual(base64.b64decode(encoded), b"legacy-photo")

        raw_json = self.db_path.read_bytes()
        self.assertNotIn(data_url(b"legacy-photo").encode("ascii"), raw_json)

    def test_multiple_photos_are_lazy_loaded_and_deleted_with_the_record(self):
        photos = [
            {"id": "foto-1", "data": data_url(b"first"), "fileName": "prima.jpg"},
            {"id": "foto-2", "data": data_url(b"second", "image/png"), "fileName": "seconda.png"},
        ]
        saved = server.save_payslip_record({
            "id": "cedolino-multiplo",
            "month": 8,
            "year": 2026,
            "netto": 1600,
            "photos": photos,
        }, self.db_path)

        compact = next(item for item in saved["payslips"] if item["id"] == "cedolino-multiplo")
        self.assertEqual(compact["photoCount"], 2)
        self.assertTrue(compact["photosDeferred"])
        self.assertNotIn("photos", compact)

        hydrated = server.load_payslip_record("cedolino-multiplo", db_path=self.db_path)
        self.assertEqual([item["fileName"] for item in hydrated["photos"]], ["prima.jpg", "seconda.png"])
        self.assertEqual(server.database_storage_summary(self.db_path)["payslipPhotos"], 2)

        server.delete_payslip_record("cedolino-multiplo", self.db_path)
        self.assertIsNone(server.load_payslip_record("cedolino-multiplo", db_path=self.db_path))
        with server.closing(server.get_db(self.db_path)) as conn:
            count = conn.execute("SELECT COUNT(*) FROM payslip_assets").fetchone()[0]
        self.assertEqual(count, 0)

    def test_deferred_update_preserves_photos_and_explicit_clear_removes_them(self):
        server.save_payslip_record({
            "id": "cedolino-editato",
            "month": 9,
            "year": 2026,
            "netto": 1500,
            "photos": [{"id": "foto-1", "data": data_url(b"keep-me"), "fileName": "settembre.jpg"}],
        }, self.db_path)

        server.save_payslip_record({
            "id": "cedolino-editato",
            "month": 9,
            "year": 2026,
            "netto": 1550,
            "photoCount": 1,
            "photosDeferred": True,
        }, self.db_path)
        preserved = server.load_payslip_record("cedolino-editato", db_path=self.db_path)
        self.assertEqual(preserved["netto"], 1550)
        self.assertEqual(len(preserved["photos"]), 1)

        cleared = server.save_payslip_record({
            "id": "cedolino-editato",
            "month": 9,
            "year": 2026,
            "netto": 1550,
            "photos": [],
            "imageData": "",
        }, self.db_path)
        compact = next(item for item in cleared["payslips"] if item["id"] == "cedolino-editato")
        self.assertEqual(compact["photoCount"], 0)
        hydrated = server.load_payslip_record("cedolino-editato", db_path=self.db_path)
        self.assertEqual(hydrated["photos"], [])


if __name__ == "__main__":
    unittest.main()
