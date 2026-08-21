import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "app" / "backend"))

from auth_store import AuthError, AuthStore  # noqa: E402


class PublicAccountLifecycleTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="gestore-public-accounts-")
        self.store = AuthStore(Path(self.temp.name), public_mode=True)

    def tearDown(self):
        self.temp.cleanup()

    def test_public_accounts_never_receive_owner_permissions(self):
        first, first_token, first_account, _ = self.store.create_account(
            "samuele", "Password-123", accepted_terms=True, terms_version="2026-08-21"
        )
        second, _, _, _ = self.store.create_account(
            "luca", "Password-456", accepted_terms=True, terms_version="2026-08-21"
        )

        self.assertTrue(first_account)
        self.assertEqual(first["role"], "user")
        self.assertEqual(second["role"], "user")
        self.assertFalse(self.store.get_user_for_token(first_token)["canManageAccounts"])
        with self.assertRaisesRegex(AuthError, "Gestione account non disponibile"):
            self.store.list_accounts(first_token)

    def test_user_can_delete_only_their_account_with_password_and_exact_name(self):
        user, token, _, _ = self.store.create_account(
            "samuele", "Password-123", accepted_terms=True, terms_version="2026-08-21"
        )
        user_db = self.store.user_db_path(user["id"])
        user_db.write_bytes(b"personal-data")

        with self.assertRaisesRegex(AuthError, "nome utente esatto"):
            self.store.delete_own_account(token, "Password-123", "wrong")
        with self.assertRaisesRegex(AuthError, "Password non corretta"):
            self.store.delete_own_account(token, "wrong-password", "samuele")

        deleted = self.store.delete_own_account(token, "Password-123", "samuele")
        self.assertEqual(deleted["id"], user["id"])
        self.assertEqual(self.store.account_count(), 0)
        self.assertIsNone(self.store.get_user_for_token(token))
        self.assertFalse((Path(self.temp.name) / "users" / user["id"]).exists())


class PrivateAccountLifecycleTests(unittest.TestCase):
    def test_private_owner_deletion_promotes_oldest_remaining_account(self):
        with tempfile.TemporaryDirectory(prefix="gestore-private-accounts-") as temp:
            store = AuthStore(Path(temp), public_mode=False)
            owner, owner_token, _, _ = store.create_account("samuele", "Password-123")
            member, _, _, _ = store.create_account("luca", "Password-456")

            self.assertEqual(owner["role"], "owner")
            store.delete_own_account(owner_token, "Password-123", "samuele")

            promoted = store.get_account_by_id(member["id"])
            self.assertIsNotNone(promoted)
            self.assertEqual(promoted["role"], "owner")


if __name__ == "__main__":
    unittest.main()
