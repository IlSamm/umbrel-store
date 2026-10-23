#!/usr/bin/env python3
"""Filament Finder: independent, persistent price watch utility.

Only records verified prices from public JSON-LD Product/Offer data.
Run periodically (e.g. cron every 15 minutes); no fabricated prices.
Standard library only. Python 3.11+.
"""
import argparse
import datetime as dt
import json
import os
import sqlite3
import urllib.parse
import urllib.request
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS watches (
 id INTEGER PRIMARY KEY, name TEXT NOT NULL, url TEXT NOT NULL UNIQUE,
 target_eur REAL NOT NULL, enabled INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS observations (
 id INTEGER PRIMARY KEY, watch_id INTEGER NOT NULL, checked_at TEXT NOT NULL,
 price_eur REAL, currency TEXT, availability TEXT, status TEXT NOT NULL,
 error TEXT, FOREIGN KEY(watch_id) REFERENCES watches(id)
);
CREATE TABLE IF NOT EXISTS notifications (
 watch_id INTEGER NOT NULL PRIMARY KEY, last_price REAL NOT NULL,
 notified_at TEXT NOT NULL
);
"""

def database(path):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path)
    db.executescript(SCHEMA)
    return db

def jsonld_objects(value):
    if isinstance(value, list):
        for item in value:
            yield from jsonld_objects(item)
    elif isinstance(value, dict):
        yield value
        for key in ("@graph", "mainEntity"):
            if key in value:
                yield from jsonld_objects(value[key])

def extract_offer(html):
    from html.parser import HTMLParser
    class Scripts(HTMLParser):
        def __init__(self):
            super().__init__()
            self.active = False
            self.data = []
            self.parts = []
        def handle_starttag(self, tag, attrs):
            attrs = dict(attrs)
            self.active = tag == "script" and "ld+json" in attrs.get("type", "").lower()
            if self.active:
                self.parts = []
        def handle_data(self, data):
            if self.active:
                self.parts.append(data)
        def handle_endtag(self, tag):
            if tag == "script" and self.active:
                self.data.append("".join(self.parts))
                self.active = False
    parser = Scripts()
    parser.feed(html)
    for script in parser.data:
        try:
            obj = json.loads(script)
        except (ValueError, TypeError):
            continue
        for node in jsonld_objects(obj):
            if not str(node.get("@type", "")).lower().endswith("product"):
                continue
            offers = node.get("offers", [])
            if isinstance(offers, dict):
                offers = [offers]
            for offer in offers:
                if not isinstance(offer, dict):
                    continue
                currency = offer.get("priceCurrency")
                raw = offer.get("price")
                if raw is None and isinstance(offer.get("priceSpecification"), dict):
                    spec = offer["priceSpecification"]
                    raw = spec.get("price")
                    currency = currency or spec.get("priceCurrency")
                try:
                    price = float(str(raw).replace(",", "."))
                except (ValueError, TypeError):
                    continue
                if currency == "EUR" and 0 < price < 100000:
                    return price, str(offer.get("availability", "unknown"))
    raise ValueError("Nessuna offerta EUR verificabile in JSON-LD")

def fetch(url):
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != "https" or not parsed.hostname:
        raise ValueError("Solo URL HTTPS pubblici")
    # DNS-level private network protections require deployment network policy.
    req = urllib.request.Request(url, headers={"User-Agent": "FilamentFinderPriceWatch/1.0", "Accept": "text/html"})
    with urllib.request.urlopen(req, timeout=12) as response:
        if urllib.parse.urlparse(response.url).scheme != "https":
            raise ValueError("Redirect non HTTPS")
        if int(response.headers.get("Content-Length", "0")) > 2_000_000:
            raise ValueError("Pagina troppo grande")
        html = response.read(2_000_001)
        if len(html) > 2_000_000:
            raise ValueError("Pagina troppo grande")
    return extract_offer(html.decode("utf-8", errors="replace"))

def notify_telegram(message):
    token = os.getenv("FF_TELEGRAM_BOT_TOKEN")
    chat = os.getenv("FF_TELEGRAM_CHAT_ID")
    if not token or not chat:
        return False
    body = urllib.parse.urlencode({"chat_id": chat, "text": message}).encode()
    req = urllib.request.Request(f"https://api.telegram.org/bot{token}/sendMessage", data=body)
    with urllib.request.urlopen(req, timeout=12) as resp:
        result = json.load(resp)
        if not result.get("ok"):
            raise RuntimeError("Telegram API rejected notification")
    return True

def check_all(db):
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    for wid, name, url, target in db.execute("SELECT id,name,url,target_eur FROM watches WHERE enabled=1").fetchall():
        try:
            price, availability = fetch(url)
            status, error = "ok", None
        except Exception as exc:
            price, availability, status, error = None, None, "unavailable", str(exc)[:300]
        db.execute("INSERT INTO observations(watch_id,checked_at,price_eur,currency,availability,status,error) VALUES (?,?,?,?,?,?,?)",
                   (wid, now, price, "EUR" if price is not None else None, availability, status, error))
        db.commit()
        if price is None:
            print(f"{name}: prezzo non verificabile ({error})")
            continue
        print(f"{name}: €{price:.2f} (soglia €{target:.2f})")
        previous = db.execute("SELECT last_price FROM notifications WHERE watch_id=?", (wid,)).fetchone()
        in_stock = "outofstock" not in availability.lower()
        if price <= target and in_stock and (previous is None or price < previous[0]):
            try:
                if notify_telegram(f"Filament Finder: {name} a €{price:.2f} (soglia €{target:.2f})\n{url}"):
                    db.execute("INSERT INTO notifications(watch_id,last_price,notified_at) VALUES (?,?,?) ON CONFLICT(watch_id) DO UPDATE SET last_price=excluded.last_price, notified_at=excluded.notified_at", (wid, price, now))
                    db.commit()
            except Exception as exc:
                print(f"Notifica non inviata: {exc}")

def main():
    p = argparse.ArgumentParser(description="Filament Finder price watch")
    p.add_argument("--db", default=os.getenv("FF_PRICE_DB", "/data/price-watch.sqlite3"))
    sub = p.add_subparsers(dest="cmd", required=True)
    add = sub.add_parser("add")
    add.add_argument("name")
    add.add_argument("url")
    add.add_argument("target", type=float)
    sub.add_parser("check")
    sub.add_parser("list")
    args = p.parse_args()
    db = database(args.db)
    if args.cmd == "add":
        if urllib.parse.urlparse(args.url).scheme != "https" or args.target <= 0:
            p.error("URL HTTPS e soglia positiva obbligatori")
        db.execute("INSERT INTO watches(name,url,target_eur) VALUES(?,?,?) ON CONFLICT(url) DO UPDATE SET name=excluded.name,target_eur=excluded.target_eur,enabled=1", (args.name, args.url, args.target))
        db.commit()
    elif args.cmd == "list":
        for row in db.execute("SELECT id,name,url,target_eur FROM watches"):
            print(row)
    else:
        check_all(db)

if __name__ == "__main__":
    main()
