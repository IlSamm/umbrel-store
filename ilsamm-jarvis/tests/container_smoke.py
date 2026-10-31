"""Controllo del container: pagina, API e memoria che sopravvive al riavvio.

Uso: python container_smoke.py http://127.0.0.1:18791 [--verify-persistence]
"""
import json
import sys
import time
import urllib.request

BASE = sys.argv[1].rstrip("/")
PERSIST = "--verify-persistence" in sys.argv


def req(path, data=None, method=None):
    body = None if data is None else json.dumps(data).encode()
    r = urllib.request.Request(BASE + path, data=body, method=method or ("POST" if body else "GET"),
                               headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(r, timeout=20) as x:
        raw = x.read()
        return x.headers.get("Content-Type", ""), raw


def wait():
    for _ in range(60):
        try:
            if json.loads(req("/api/ping")[1])["ok"]:
                return
        except Exception:
            time.sleep(1)
    sys.exit("il server non parte")


wait()
ctype, html = req("/")
assert ctype.startswith("text/html") and b"Jarvis" in html, "pagina mancante"
assert req("/fonts/rajdhani-Medium.woff")[0] == "font/woff", "carattere mancante"
st = json.loads(req("/api/status")[1])
assert st["edge_tts"] and st["ffmpeg"], "edge-tts o ffmpeg mancanti nell'immagine: %s" % st
if not PERSIST:
    r = json.loads(req("/api/ask", {"text": "ho speso 12,50 euro al bar"})[1])
    assert r["via"] == "locale" and r["memorie"], r
    print("OK prima esecuzione:", r["reply"])
else:
    m = json.loads(req("/api/mem")[1])
    assert any(abs(float(x.get("importo") or 0) - 12.5) < 0.001 for x in m["ricordi"]), "la memoria non è sopravvissuta al riavvio"
    print("OK memoria conservata dopo il riavvio")
