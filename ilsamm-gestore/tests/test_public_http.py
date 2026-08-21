import http.client
import json
import os
import socket
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
NATIVE_ORIGIN = "capacitor://localhost"


def find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


class PublicHttpLifecycleTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix="gestore-public-http-")
        cls.port = find_free_port()
        env = os.environ.copy()
        env.update({
            "GESTORE_DATA_DIR": cls.temp.name,
            "GESTORE_DEPLOYMENT_MODE": "public",
            "GESTORE_ALLOWED_ORIGINS": NATIVE_ORIGIN,
            "PYTHONUNBUFFERED": "1",
        })
        cls.process = subprocess.Popen(
            [
                sys.executable,
                str(ROOT / "app" / "backend" / "server.py"),
                "--host",
                "127.0.0.1",
                "--port",
                str(cls.port),
            ],
            cwd=ROOT,
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            text=True,
        )
        deadline = time.time() + 15
        while time.time() < deadline:
            if cls.process.poll() is not None:
                stderr = cls.process.stderr.read() if cls.process.stderr else ""
                raise RuntimeError(f"Public test server stopped early: {stderr}")
            try:
                status, _, _ = cls.request("GET", "/api/ping", origin="")
                if status == 200:
                    return
            except OSError:
                time.sleep(0.05)
        raise RuntimeError("Public test server did not start")

    @classmethod
    def tearDownClass(cls):
        if cls.process.poll() is None:
            cls.process.terminate()
            try:
                cls.process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                cls.process.kill()
                cls.process.wait(timeout=5)
        cls.temp.cleanup()

    @classmethod
    def request(cls, method, path, payload=None, cookie="", origin=NATIVE_ORIGIN):
        connection = http.client.HTTPConnection("127.0.0.1", cls.port, timeout=8)
        headers = {}
        if origin:
            headers["Origin"] = origin
        if cookie:
            headers["Cookie"] = cookie
        body = None
        if payload is not None:
            body = json.dumps(payload).encode("utf-8")
            headers["Content-Type"] = "application/json"
        connection.request(method, path, body=body, headers=headers)
        response = connection.getresponse()
        raw = response.read()
        response_headers = {key.lower(): value for key, value in response.getheaders()}
        connection.close()
        data = json.loads(raw.decode("utf-8")) if raw else {}
        return response.status, response_headers, data

    def test_public_registration_cors_isolation_and_self_deletion(self):
        status, headers, _ = self.request("OPTIONS", "/api/auth/register")
        self.assertEqual(status, 204)
        self.assertEqual(headers.get("access-control-allow-origin"), NATIVE_ORIGIN)
        self.assertEqual(headers.get("access-control-allow-credentials"), "true")

        status, _, payload = self.request("GET", "/api/auth/status")
        self.assertEqual(status, 200)
        self.assertEqual(payload["deploymentMode"], "public")

        status, _, payload = self.request("POST", "/api/auth/register", {
            "username": "samuele",
            "password": "Password-123",
        })
        self.assertEqual(status, 400)
        self.assertEqual(payload["code"], "terms_required")

        status, headers, payload = self.request("POST", "/api/auth/register", {
            "username": "samuele",
            "password": "Password-123",
            "acceptedTerms": True,
            "termsVersion": "2026-08-21",
        })
        self.assertEqual(status, 201)
        self.assertEqual(payload["user"]["role"], "user")
        self.assertFalse(payload["importedLegacyData"])
        set_cookie = headers.get("set-cookie", "")
        self.assertIn("SameSite=None", set_cookie)
        self.assertIn("Secure", set_cookie)
        cookie = set_cookie.split(";", 1)[0]

        status, _, _ = self.request("GET", "/api/admin/accounts", cookie=cookie)
        self.assertEqual(status, 403)

        status, headers, payload = self.request("DELETE", "/api/auth/account", {
            "password": "Password-123",
            "confirmation": "samuele",
        }, cookie=cookie)
        self.assertEqual(status, 200)
        self.assertTrue(payload["ok"])
        self.assertIn("Max-Age=0", headers.get("set-cookie", ""))

        status, _, payload = self.request("GET", "/api/auth/status")
        self.assertEqual(status, 200)
        self.assertFalse(payload["hasAccounts"])


if __name__ == "__main__":
    unittest.main()
