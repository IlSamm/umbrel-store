#!/usr/bin/env python3
"""Jarvis per Umbrel: server senza dipendenze esterne.

- Comandi della casa capiti in locale e eseguiti su Home Assistant (niente internet).
- Domande vere a Google Gemini (piano gratuito) solo quando servono, con strumenti per casa e memoria.
- Voce: edge-tts (voci neurali Microsoft, online) con Piper locale come riserva (protocollo Wyoming).
- Ascolto: Whisper locale (protocollo Wyoming).
- Memoria, spese e conversazione salvate in /data.
"""
import datetime
import hashlib
import io
import json
import math
import os
import re
import secrets
import shutil
import socket
import struct
import subprocess
import tempfile
import threading
import time
import unicodedata
import urllib.error
import urllib.request
import uuid
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, quote, urlparse

DATA = os.environ.get("JARVIS_DATA", "/data")
PUBLIC = os.environ.get("JARVIS_PUBLIC", os.path.join(os.path.dirname(os.path.abspath(__file__)), "public"))
PORT = int(os.environ.get("PORT", "8080"))
WHISPER = os.environ.get("WHISPER_HOST", "whisper:10300")
PIPER = os.environ.get("PIPER_HOST", "piper:10200")
PIPER_VOICE = os.environ.get("PIPER_VOICE", "it_IT-paola-medium")
GEMINI_BASE = os.environ.get("GEMINI_BASE", "https://generativelanguage.googleapis.com/v1beta")
EDGE_BIN = os.environ.get("EDGE_TTS_BIN", "edge-tts")
VERSION = "1.2.0"
METEO_BASE = os.environ.get("METEO_BASE", "https://api.open-meteo.com/v1")
GEO_BASE = os.environ.get("GEO_BASE", "https://geocoding-api.open-meteo.com/v1")
WIKI_BASE = os.environ.get("WIKI_BASE", "https://it.wikipedia.org")

os.makedirs(os.path.join(DATA, "cache"), exist_ok=True)
LOCK = threading.RLock()

DEFAULT_CONFIG = {
    "gemini_key": "",
    "gemini_model": "auto",
    "citta": "",
    "ha_url": "http://host.docker.internal:8123",
    "ha_token": "",
    "voce": "it-IT-DiegoNeural",
    "velocita": "+6%",
    "ollama_url": "",
    "ollama_model": "",
    "titolo": "Signore",
    "device_key": "",
}
SECRET_FIELDS = ("gemini_key", "ha_token")
VOCI = [
    ["it-IT-DiegoNeural", "Diego · maschile, profonda"],
    ["it-IT-GiuseppeMultilingualNeural", "Giuseppe · maschile, naturale"],
    ["it-IT-IsabellaNeural", "Isabella · femminile"],
    ["it-IT-ElsaNeural", "Elsa · femminile"],
    ["piper", "Piper · senza internet (sul server)"],
]


# ------------------------------------------------------------------ utilità
def norm(s):
    s = unicodedata.normalize("NFD", str(s or "").lower())
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", "".join(c for c in s if unicodedata.category(c) != "Mn"))).strip()


def now():
    return datetime.datetime.now()


def today():
    return now().date().isoformat()


def month_start(d=None):
    d = d or now().date()
    return d.replace(day=1).isoformat()


def read_json(name, default):
    p = os.path.join(DATA, name)
    try:
        with open(p, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return json.loads(json.dumps(default))


def write_json(name, obj):
    p = os.path.join(DATA, name)
    tmp = p + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)
    os.replace(tmp, p)


def get_config():
    with LOCK:
        c = dict(DEFAULT_CONFIG)
        c.update(read_json("config.json", {}))
        if not c.get("device_key"):
            c["device_key"] = secrets.token_hex(8)
            write_json("config.json", c)
        return c


def save_config(upd):
    with LOCK:
        c = get_config()
        for k, v in (upd or {}).items():
            if k not in DEFAULT_CONFIG or k == "device_key":
                continue
            if k in SECRET_FIELDS and (v is None or v == "" or "•" in str(v)):
                continue  # campo segreto lasciato vuoto: si tiene quello vecchio
            c[k] = str(v).strip()
        if upd.get("cancella_gemini"):
            c["gemini_key"] = ""
        if upd.get("cancella_ha"):
            c["ha_token"] = ""
        write_json("config.json", c)
        return c


def public_config():
    c = get_config()
    out = {k: v for k, v in c.items() if k not in SECRET_FIELDS}
    for k in SECRET_FIELDS:
        out[k + "_impostata"] = bool(c.get(k))
    out["voci"] = VOCI
    out["versione"] = VERSION
    return out


def http_json(url, data=None, headers=None, timeout=10, method=None):
    body = None if data is None else json.dumps(data).encode("utf-8")
    h = {"Content-Type": "application/json", "User-Agent": "Jarvis-Umbrel/" + VERSION}
    h.update(headers or {})
    req = urllib.request.Request(url, data=body, headers=h, method=method or ("POST" if body is not None else "GET"))
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read()
        return json.loads(raw.decode("utf-8")) if raw else {}


# ------------------------------------------------------------------ memoria
CATEGORIE = ["Casa", "Cibo", "Trasporti", "Svago", "Salute", "Abbonamenti", "Shopping", "Tasse", "Entrate", "Altro"]
KW = [
    ("Trasporti", r"benzin|carburant|diesel|gasolio|treno|bus\b|autobus|metro|taxi|uber|parchegg|autostrad|pedagg|volo|meccanic|gomme|tagliando"),
    ("Cibo", r"supermercat|\bbar\b|caffe|ristorant|pizz|pranzo|cena|colazion|aperitiv|sushi|kebab|panin|alimentar|gelat|forno|macell|mercato|spesa"),
    ("Casa", r"affitto|bollett|\bluce\b|\bgas\b|acqua|internet|wifi|condomin|mobili|ikea|pulizi|riparazion|elettricist|idraulic"),
    ("Svago", r"cinema|concert|libr|videogioc|gioco|palestra|viaggio|hotel|discotec|teatro|museo|partita|stadio|uscita"),
    ("Salute", r"farmac|medic|dentist|visita|ottico|analisi|fisioterap|psicolog"),
    ("Abbonamenti", r"netflix|spotify|abbonament|streaming|disney|prime video|cloud|icloud|telefon|ricarica|dazn|youtube"),
    ("Shopping", r"vestit|scarpe|maglia|giacca|amazon|zalando|regalo|profum|negozio|elettronic|cuffie"),
    ("Tasse", r"tass|bollo|multa|\bimu\b|\btari\b|f24|canone"),
]
TIPI = ["spesa", "entrata", "impegno", "promemoria", "nota", "contatto", "preferenza", "idea", "documento", "lavoro", "casa"]


def guess_cat(text):
    s = norm(text)
    for cat, rx in KW:
        if re.search(rx, s):
            return cat
    return "Altro"


def mem_all():
    with LOCK:
        return read_json("memoria.json", {"ricordi": [], "chat": []})


def mem_save(m):
    with LOCK:
        write_json("memoria.json", m)


def memorizza(tipo="nota", titolo="", categoria="", importo=None, data="", dettagli=""):
    tipo = norm(tipo) or "nota"
    if tipo not in TIPI:
        tipo = "spesa" if re.search(r"spes|pagat|comprat", tipo) else "nota"
    titolo = (str(titolo or "").strip() or tipo.capitalize())[:80]
    titolo = titolo[0].upper() + titolo[1:]
    imp = None
    if importo not in (None, ""):
        try:
            imp = abs(float(str(importo).replace(",", ".").replace("€", "").strip()))
        except ValueError:
            imp = None
    if tipo == "spesa":
        categoria = categoria or guess_cat(titolo + " " + str(dettagli or ""))
    elif tipo == "entrata":
        categoria = "Entrate"
    else:
        categoria = categoria or {"impegno": "Impegni", "promemoria": "Promemoria", "contatto": "Contatti", "preferenza": "Preferenze",
                                  "idea": "Idee", "documento": "Documenti", "lavoro": "Lavoro", "casa": "Casa"}.get(tipo, "Note")
    d = data if re.match(r"^\d{4}-\d{2}-\d{2}$", str(data or "")) else today()
    r = {"id": uuid.uuid4().hex[:10], "tipo": tipo, "titolo": titolo, "categoria": str(categoria)[:30], "importo": imp,
         "data": d, "dettagli": str(dettagli or "")[:300], "creato": now().isoformat(timespec="seconds")}
    with LOCK:
        m = mem_all()
        m["ricordi"].append(r)
        mem_save(m)
    return r


def dimentica(rid):
    with LOCK:
        m = mem_all()
        n = len(m["ricordi"])
        m["ricordi"] = [r for r in m["ricordi"] if r["id"] != rid]
        mem_save(m)
        return len(m["ricordi"]) < n


def spese(da=None, a=None, categoria=None):
    da = da or month_start()
    a = a or today()
    cn = norm(categoria) if categoria else ""
    tot = ent = 0.0
    by = {}
    voci = []
    for r in mem_all()["ricordi"]:
        if r["tipo"] not in ("spesa", "entrata") or r.get("importo") is None:
            continue
        if not (da <= r["data"] <= a):
            continue
        if cn and cn not in norm(r["categoria"]):
            continue
        if r["tipo"] == "entrata":
            ent += r["importo"]
            continue
        tot += r["importo"]
        by[r["categoria"]] = by.get(r["categoria"], 0) + r["importo"]
        voci.append(r)
    voci.sort(key=lambda r: r["data"], reverse=True)
    return {"da": da, "a": a, "totale": round(tot, 2), "entrate": round(ent, 2),
            "per_categoria": [{"categoria": k, "totale": round(v, 2)} for k, v in sorted(by.items(), key=lambda x: -x[1])],
            "voci": voci}


def cerca_ricordi(parole, limite=8):
    t = [w for w in norm(parole).split() if len(w) > 2]
    out = []
    for r in mem_all()["ricordi"]:
        hay = norm(" ".join(str(r.get(k, "")) for k in ("titolo", "categoria", "dettagli", "tipo", "data")))
        sc = sum(1 for w in t if w in hay)
        if sc:
            out.append((sc, r))
    out.sort(key=lambda x: -x[0])
    return [r for _, r in out[:limite]]


def digest():
    rs = sorted(mem_all()["ricordi"], key=lambda r: r.get("creato", ""), reverse=True)[:40]
    lines = ["- [%s] %s%s · %s · %s" % (r["tipo"], r["titolo"], (" · %.2f €" % r["importo"]) if r.get("importo") is not None else "", r["data"], r["categoria"]) for r in rs]
    s = spese()
    return "Ricordi dell'utente (%d):\n%s\nSpese di questo mese: %.2f €." % (len(mem_all()["ricordi"]), "\n".join(lines) or "nessuno", s["totale"])


def eur(x):
    return ("%.2f" % x).replace(".", ",") + " €"


# ------------------------------------------------------------------ Home Assistant
HA_CACHE = {"t": 0, "states": [], "err": ""}
CONTROL_DOMAINS = ("light", "switch", "fan", "cover", "media_player", "input_boolean", "climate", "scene", "script", "vacuum", "humidifier")
DOMAIN_WORDS = {"light": "luce luci lampada lampadina led", "switch": "presa interruttore", "fan": "ventilatore ventola",
                "cover": "tapparella tapparelle tenda tende persiana serranda", "media_player": "tv televisione musica casse",
                "climate": "termostato riscaldamento clima condizionatore", "vacuum": "aspirapolvere robot"}


def ha_cfg():
    c = get_config()
    return c["ha_url"].rstrip("/"), c["ha_token"]


def ha_call(path, data=None, timeout=8):
    url, tok = ha_cfg()
    if not tok:
        raise RuntimeError("Home Assistant non è ancora collegato: inserisci indirizzo e token nelle impostazioni di Jarvis.")
    return http_json(url + path, data, {"Authorization": "Bearer " + tok}, timeout=timeout)


def ha_states(force=False):
    if not force and time.time() - HA_CACHE["t"] < 15 and HA_CACHE["states"]:
        return HA_CACHE["states"]
    try:
        st = ha_call("/api/states")
        HA_CACHE.update(t=time.time(), states=st if isinstance(st, list) else [], err="")
    except Exception as e:
        HA_CACHE.update(t=time.time(), err=str(e))
    return HA_CACHE["states"]


def ha_devices():
    out = []
    for s in ha_states():
        eid = s.get("entity_id", "")
        dom = eid.split(".")[0]
        if dom not in CONTROL_DOMAINS + ("sensor", "binary_sensor", "todo", "calendar", "weather", "person", "lock", "alarm_control_panel"):
            continue
        a = s.get("attributes") or {}
        if dom == "sensor" and not a.get("unit_of_measurement"):
            continue
        out.append({"id": eid, "nome": a.get("friendly_name") or eid, "dominio": dom, "stato": s.get("state"),
                    "unita": a.get("unit_of_measurement", "")})
    return out


def ha_find(query, domains=CONTROL_DOMAINS):
    q = norm(query)
    q = re.sub(r"\b(la|il|lo|le|i|gli|l|del|della|dello|dei|delle|in|nel|nella|di|da|a|al|alla|per|favore|jarvis|tutta|tutto)\b", " ", q)
    qt = [w for w in q.split() if w]
    if not qt:
        return []
    best = []
    for s in ha_states():
        eid = s.get("entity_id", "")
        dom = eid.split(".")[0]
        if dom not in domains:
            continue
        name = norm((s.get("attributes") or {}).get("friendly_name") or eid.split(".")[1].replace("_", " "))
        words = set(name.split()) | set(DOMAIN_WORDS.get(dom, "").split())
        hit = sum(1 for w in qt if w in words or any(x.startswith(w[:5]) for x in name.split() if len(w) >= 5))
        if hit == 0:
            continue
        name_hit = sum(1 for w in qt if w in name.split() or any(x.startswith(w[:5]) for x in name.split() if len(w) >= 5))
        score = name_hit * 2 + hit - 0.05 * len(name.split())
        if norm(eid) == q or eid == query:
            score += 10
        best.append((score, name_hit, s))
    best.sort(key=lambda x: -x[0])
    if not best:
        return []
    top = best[0][0]
    return [s for sc, nh, s in best if sc >= top - 0.01 and nh > 0] or [best[0][2]]


AZIONI = {
    "accendi": "turn_on", "attiva": "turn_on", "avvia": "turn_on", "accendere": "turn_on",
    "spegni": "turn_off", "disattiva": "turn_off", "ferma": "turn_off", "spegnere": "turn_off",
    "apri": "open", "alza": "open", "chiudi": "close", "abbassa": "close",
}


def ha_do(entity, azione, valore=None):
    """Esegue un'azione su un dispositivo trovato per nome. Restituisce (ok, testo, entity_ids)."""
    targets = [s for s in ha_states() if s.get("entity_id") == entity] or ha_find(entity)
    if not targets:
        return False, "Non trovo «%s» in casa." % entity, []
    az = AZIONI.get(norm(azione).split(" ")[0], norm(azione))
    done = []
    for s in targets[:6]:
        eid = s["entity_id"]
        dom = eid.split(".")[0]
        svc, data = None, {"entity_id": eid}
        if dom == "cover":
            svc = {"open": "open_cover", "turn_on": "open_cover", "close": "close_cover", "turn_off": "close_cover"}.get(az)
            if valore is not None:
                svc, data["position"] = "set_cover_position", max(0, min(100, int(valore)))
        elif dom in ("scene", "script"):
            svc = "turn_on"
        elif dom == "climate" and valore is not None:
            svc, data["temperature"] = "set_temperature", float(valore)
        elif dom == "light" and valore is not None and az in ("turn_on", "imposta", "set", "open"):
            svc, data["brightness_pct"] = "turn_on", max(1, min(100, int(valore)))
        elif dom == "vacuum":
            svc = "start" if az in ("turn_on", "open") else "return_to_base"
        else:
            svc = {"turn_on": "turn_on", "open": "turn_on", "turn_off": "turn_off", "close": "turn_off", "imposta": "turn_on"}.get(az)
        if not svc:
            continue
        ha_call("/api/services/%s/%s" % (dom, svc), data)
        done.append(eid)
    if not done:
        return False, "Non so fare «%s» su quel dispositivo." % azione, []
    HA_CACHE["t"] = 0
    names = [((s.get("attributes") or {}).get("friendly_name") or s["entity_id"]) for s in targets if s["entity_id"] in done]
    return True, ", ".join(names), done


def ha_todo_add(items):
    todos = [s for s in ha_states() if s.get("entity_id", "").startswith("todo.")]
    if not todos:
        raise RuntimeError("In Home Assistant non c'è nessuna lista (to-do).")
    pick = next((s for s in todos if re.search(r"spesa|shopping", norm((s.get("attributes") or {}).get("friendly_name", "") + " " + s["entity_id"]))), todos[0])
    for it in items:
        ha_call("/api/services/todo/add_item", {"entity_id": pick["entity_id"], "item": str(it)[:100]})
    return (pick.get("attributes") or {}).get("friendly_name") or pick["entity_id"]


def ha_calendar(da=None, a=None):
    cals = [s for s in ha_states() if s.get("entity_id", "").startswith("calendar.")]
    start = (da or today()) + "T00:00:00"
    end = (a or (now().date() + datetime.timedelta(days=7)).isoformat()) + "T23:59:59"
    out = []
    for c in cals[:8]:
        try:
            evs = ha_call("/api/calendars/%s?start=%s&end=%s" % (c["entity_id"], quote(start), quote(end)))
            for e in evs or []:
                st = e.get("start", {})
                out.append({"titolo": e.get("summary"), "inizio": st.get("dateTime") or st.get("date"),
                            "calendario": (c.get("attributes") or {}).get("friendly_name", c["entity_id"])})
        except Exception:
            pass
    out.sort(key=lambda x: str(x["inizio"]))
    return out[:40]


# ------------------------------------------------------------------ comandi locali (senza internet)
NUMWORDS = {"uno": 1, "una": 1, "due": 2, "tre": 3, "quattro": 4, "cinque": 5, "sei": 6, "sette": 7, "otto": 8, "nove": 9, "dieci": 10,
            "venti": 20, "trenta": 30, "quaranta": 40, "cinquanta": 50, "cento": 100}


# ------------------------------------------------------------------ internet: meteo e ricerca
WMO = {0: "sereno", 1: "quasi sereno", 2: "poco nuvoloso", 3: "coperto", 45: "nebbia", 48: "nebbia con brina", 51: "pioviggine leggera",
       53: "pioviggine", 55: "pioviggine intensa", 56: "pioviggine gelata", 57: "pioviggine gelata", 61: "pioggia leggera", 63: "pioggia",
       65: "pioggia forte", 66: "pioggia gelata", 67: "pioggia gelata forte", 71: "neve leggera", 73: "neve", 75: "neve forte", 77: "nevischio",
       80: "rovesci leggeri", 81: "rovesci", 82: "rovesci violenti", 85: "rovesci di neve", 86: "forti rovesci di neve", 95: "temporale",
       96: "temporale con grandine", 99: "temporale con grandine forte"}
GEO_CACHE = {}


def geocode(nome):
    k = norm(nome)
    if k in GEO_CACHE:
        return GEO_CACHE[k]
    out = http_json("%s/search?name=%s&count=1&language=it&format=json" % (GEO_BASE, quote(nome)), timeout=8)
    r = (out.get("results") or [None])[0]
    if not r:
        raise RuntimeError("non trovo il luogo «%s»" % nome)
    GEO_CACHE[k] = (r["latitude"], r["longitude"], r.get("name") or nome)
    return GEO_CACHE[k]


def casa_posizione():
    c = get_config()
    if c.get("citta"):
        return geocode(c["citta"])
    if "casa" in GEO_CACHE:
        return GEO_CACHE["casa"]
    if c.get("ha_token"):
        try:
            hc = ha_call("/api/config", timeout=5)
            if hc.get("latitude") is not None:
                GEO_CACHE["casa"] = (hc["latitude"], hc["longitude"], hc.get("location_name") or "casa")
                return GEO_CACHE["casa"]
        except Exception:
            pass
    raise RuntimeError("non so dove si trova casa: scriva la sua città nelle impostazioni (⚙)")


def meteo(luogo=None, giorno=0):
    lat, lon, nome = geocode(luogo) if luogo else casa_posizione()
    out = http_json("%s/forecast?latitude=%s&longitude=%s&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,precipitation"
                    "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=7" % (METEO_BASE, lat, lon), timeout=8)
    cur, d = out.get("current") or {}, out.get("daily") or {}
    giorno = max(0, min(int(giorno or 0), len(d.get("time") or [1]) - 1))
    g = lambda k: (d.get(k) or [None] * 7)[giorno]
    return {"luogo": nome, "giorno": (d.get("time") or [today()])[giorno],
            "adesso": {"temperatura": cur.get("temperature_2m"), "percepita": cur.get("apparent_temperature"), "cielo": WMO.get(cur.get("weather_code"), "variabile"),
                       "vento_kmh": cur.get("wind_speed_10m")} if giorno == 0 else None,
            "previsione": {"cielo": WMO.get(g("weather_code"), "variabile"), "massima": g("temperature_2m_max"), "minima": g("temperature_2m_min"),
                           "probabilita_pioggia": g("precipitation_probability_max")}}


def meteo_frase(m, titolo):
    gr = lambda x: "%d" % round(x) if x is not None else "?"
    p = m["previsione"]
    pioggia = p.get("probabilita_pioggia")
    coda = (", probabilità di pioggia %d%%" % pioggia) if pioggia is not None and pioggia >= 20 else ""
    if m.get("adesso"):
        a = m["adesso"]
        dove = "Qui fuori" if norm(m["luogo"]) in ("casa", "home", "") else "A " + m["luogo"]
        return "%s ora ci sono %s gradi, %s. Oggi massima %s e minima %s%s, %s." % (dove, gr(a["temperatura"]), a["cielo"], gr(p["massima"]), gr(p["minima"]), coda, titolo)
    giorni = {1: "Domani", 2: "Dopodomani"}
    try:
        dd = (datetime.date.fromisoformat(m["giorno"]) - now().date()).days
    except Exception:
        dd = 1
    quando = giorni.get(dd) or ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"][datetime.date.fromisoformat(m["giorno"]).weekday()]
    dove = "" if norm(m["luogo"]) in ("casa", "home", "") else " a " + m["luogo"]
    return "%s%s: %s, massima %s e minima %s%s, %s." % (quando, dove, p["cielo"], gr(p["massima"]), gr(p["minima"]), coda, titolo)


def wiki(domanda):
    """Riassunto da Wikipedia in italiano: funziona anche senza Gemini."""
    q = re.sub(r"^(chi e|chi era|chi sono|cos e|che cos e|cosa e|cosa sono|cos era|dov e|dove si trova|parlami di|dimmi qualcosa su|spiegami)\s+", "", norm(domanda)).strip()
    q = re.sub(r"^(il|lo|la|i|gli|le|l|un|una|uno)\s+", "", q)
    if not q:
        return None
    out = http_json("%s/w/api.php?action=query&list=search&srlimit=1&format=json&srsearch=%s" % (WIKI_BASE, quote(q)), timeout=8)
    hits = (out.get("query") or {}).get("search") or []
    if not hits:
        return None
    title = hits[0]["title"]
    s = http_json("%s/api/rest_v1/page/summary/%s" % (WIKI_BASE, quote(title.replace(" ", "_"))), timeout=8)
    txt = (s.get("extract") or "").strip()
    if not txt:
        return None
    frasi = re.split(r"(?<=[.!?])\s+", txt)
    return {"titolo": title, "testo": " ".join(frasi[:2]), "link": ((s.get("content_urls") or {}).get("desktop") or {}).get("page", "")}


def local_intent(text, titolo):
    s = norm(text)
    s = re.sub(r"^(ehi |hey |ok )?jarvis\b ?", "", s)
    raw = unicodedata.normalize("NFD", str(text).lower())
    raw = "".join(ch for ch in raw if unicodedata.category(ch) != "Mn")
    raw = re.sub(r"^\W*(ehi |hey |ok )?jarvis\W*", "", raw).strip(" ?!.")
    res = {"azioni": [], "casa": [], "memorie": []}
    # ora e data
    if re.search(r"\b(che ore sono|che ora e|dimmi l ora)\b", s):
        return dict(res, reply="Sono le %s, %s." % (now().strftime("%H:%M"), titolo))
    if re.search(r"\b(che giorno e|che data e|quanti ne abbiamo)\b", s):
        g = ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"][now().weekday()]
        m = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"][now().month - 1]
        return dict(res, reply="Oggi è %s %d %s, %s." % (g, now().day, m, titolo))
    # meteo: Open-Meteo, gratis e senza chiave
    if re.search(r"\b(che tempo (fa|fara|ce)|meteo|previsioni|piove|piovera|nevica|nevichera|ombrello|fa freddo|fa caldo)\b", s) and not re.search(r"\b(in|del|della|nel|nella) (salotto|soggiorno|camera|cucina|bagno|studio|casa)\b", s):
        giorno = 2 if "dopodomani" in s else 1 if "domani" in s else 0
        mm = re.search(r"\b(?:a|ad|su|per|in)\s+([a-z][a-z' ]{1,40}?)(?:\s+(?:oggi|domani|dopodomani|stasera|stanotte|questo|questa|adesso|ora)\b|\s*$)", s)
        luogo = mm.group(1).strip() if mm and mm.group(1) not in ("casa", "che", "ora", "oggi") else None
        try:
            return dict(res, reply=meteo_frase(meteo(luogo, giorno), titolo), via="internet")
        except Exception as e:
            return dict(res, reply="Non riesco a leggere il meteo, %s: %s." % (titolo, str(e)[:120]))
    # lista della spesa su Home Assistant
    m = re.match(r"^(?:aggiungi|metti|segna)\s+(.+?)\s+(?:alla|nella|in)\s+(?:lista (?:della )?spesa|spesa|lista)$", raw)
    if m:
        items = [x.strip(" .") for x in re.split(r",|\be\b", m.group(1)) if x.strip(" .")]
        try:
            lista = ha_todo_add(items)
            return dict(res, reply="Aggiunto a %s: %s, %s." % (lista, ", ".join(items), titolo), azioni=[{"tipo": "lista", "ok": True}])
        except Exception as e:
            return dict(res, reply=str(e))
    # spese
    m = re.search(r"\b(?:ho\s+)?(speso|pagato|comprato|preso|guadagnato|incassato|ricevuto)\b.*?(\d+(?:[.,]\d{1,2})?)\s*(?:euro|eur|€)?(.*)$", raw)
    if m and re.search(r"\d", raw):
        imp = float(m.group(2).replace(",", "."))
        rest = re.sub(r"^\s*(?:euro|eur|€)?\s*", "", m.group(3)).strip(" .,!?")
        rest = re.sub(r"^(di|per|al|alla|allo|ai|in|da|dal|dalla|del|della|il|la|un|una)\s+", "", rest.strip())
        rest = re.sub(r"\b(oggi|ieri|stamattina|stasera|adesso)\b", "", rest).strip()
        ent = m.group(1) in ("guadagnato", "incassato", "ricevuto")
        r = memorizza("entrata" if ent else "spesa", rest or ("Entrata" if ent else "Spesa"), importo=imp,
                      data=(now().date() - datetime.timedelta(days=1)).isoformat() if "ieri" in s else today())
        return dict(res, reply="Registrato, %s: %s · %s." % (titolo, eur(imp), r["categoria"]), memorie=[r["id"]])
    if re.search(r"\bquanto (ho )?speso\b|\b(le )?mie spese\b|\briepilogo spese\b", s):
        if "settimana" in s:
            r = spese((now().date() - datetime.timedelta(days=now().weekday())).isoformat())
        elif "oggi" in s:
            r = spese(today(), today())
        else:
            r = spese()
        if not r["totale"]:
            return dict(res, reply="Non ho ancora spese registrate in questo periodo, %s." % titolo)
        cats = ", ".join("%s %s" % (c["categoria"], eur(c["totale"])) for c in r["per_categoria"][:4])
        return dict(res, reply="Ha speso %s, %s: %s." % (eur(r["totale"]), titolo, cats), memorie=[v["id"] for v in r["voci"][:10]])
    m = re.match(r"^(?:ricorda(?:ti)?|memorizza|segnati|annota)\s+(?:che\s+)?(.+)$", s)
    if m and not re.search(r"\b(alle|domani|tra|fra)\b", s):
        r = memorizza("nota", text.split(" ", 1)[1] if " " in text else text)
        return dict(res, reply="Me lo ricorderò, %s." % titolo, memorie=[r["id"]])
    # casa: accendi / spegni / apri / chiudi / imposta
    m = re.match(r"^(accendi|spegni|apri|chiudi|alza|abbassa|attiva|disattiva|avvia|ferma)\s+(.+?)(?:\s+(?:al|a)\s+(\d+|%s)\s*(?:per cento|percento|gradi)?)?$" % "|".join(NUMWORDS), s)
    if m:
        verb, what, val = m.group(1), m.group(2), m.group(3)
        if val is not None and not val.isdigit():
            val = NUMWORDS.get(val)
        tutte = re.match(r"^(?:tutte le |tutti i |tutte |tutti )?(luci|luce)$", what) and re.search(r"tutt", what)
        try:
            if tutte:
                ids = [x["entity_id"] for x in ha_states() if x["entity_id"].startswith("light.")]
                if not ids:
                    return dict(res, reply="Non trovo luci in casa, %s." % titolo)
                ha_call("/api/services/light/%s" % ("turn_on" if AZIONI[verb] in ("turn_on", "open") else "turn_off"), {"entity_id": ids})
                HA_CACHE["t"] = 0
                return dict(res, reply="Fatto, %s: ho %s tutte le luci." % (titolo, "acceso" if AZIONI[verb] == "turn_on" else "spento"),
                            azioni=[{"tipo": "casa", "ok": True}], casa=ids)
            if not ha_cfg()[1]:
                return None
            ok, nomi, ids = ha_do(what, verb, int(val) if val is not None else None)
            if ok:
                fatto = {"turn_on": "ho acceso", "turn_off": "ho spento", "open": "ho aperto", "close": "ho chiuso"}.get(AZIONI.get(verb, ""), "ho regolato")
                return dict(res, reply="Fatto, %s: %s %s." % (titolo, fatto, nomi) if val is None else "Fatto, %s: ho impostato %s al %s%%." % (titolo, nomi, val),
                            azioni=[{"tipo": "casa", "ok": True}], casa=ids)
            return None  # non trovato: ci pensa il cervello
        except Exception as e:
            return dict(res, reply="Home Assistant non risponde: %s" % str(e)[:120])
    return None


# ------------------------------------------------------------------ cervello (Gemini, oppure Ollama)
def tools_decl():
    return [{"functionDeclarations": [
        {"name": "casa_comando", "description": "Accende, spegne, apre, chiude o regola un dispositivo di casa su Home Assistant (luci, prese, tapparelle, clima, scene).",
         "parameters": {"type": "OBJECT", "properties": {
             "dispositivo": {"type": "STRING", "description": "Nome del dispositivo come lo chiama l'utente, oppure il suo entity_id"},
             "azione": {"type": "STRING", "enum": ["accendi", "spegni", "apri", "chiudi", "imposta"]},
             "valore": {"type": "NUMBER", "description": "Facoltativo: percentuale di luminosità o posizione, oppure temperatura"}},
             "required": ["dispositivo", "azione"]}},
        {"name": "casa_stato", "description": "Legge lo stato attuale dei dispositivi e sensori di casa (temperature, luci accese, porte...). Senza parole: un riassunto.",
         "parameters": {"type": "OBJECT", "properties": {"cerca": {"type": "STRING"}}}},
        {"name": "memorizza", "description": "Salva per sempre un ricordo dell'utente: spesa, entrata, impegno, promemoria, nota, contatto, preferenza, idea. Una chiamata per ogni cosa.",
         "parameters": {"type": "OBJECT", "properties": {
             "tipo": {"type": "STRING", "enum": TIPI}, "titolo": {"type": "STRING"},
             "categoria": {"type": "STRING", "description": "Per le spese una tra: " + ", ".join(CATEGORIE)},
             "importo": {"type": "NUMBER"}, "data": {"type": "STRING", "description": "AAAA-MM-GG"}, "dettagli": {"type": "STRING"}},
             "required": ["tipo", "titolo"]}},
        {"name": "riepilogo_spese", "description": "Totale delle spese e delle entrate in un periodo, diviso per categoria. Senza date: il mese corrente.",
         "parameters": {"type": "OBJECT", "properties": {"da": {"type": "STRING"}, "a": {"type": "STRING"}, "categoria": {"type": "STRING"}}}},
        {"name": "cerca_ricordi", "description": "Cerca tra i ricordi salvati dell'utente.",
         "parameters": {"type": "OBJECT", "properties": {"parole": {"type": "STRING"}}, "required": ["parole"]}},
        {"name": "lista_spesa", "description": "Aggiunge cose alla lista della spesa di Home Assistant.",
         "parameters": {"type": "OBJECT", "properties": {"cose": {"type": "ARRAY", "items": {"type": "STRING"}}}, "required": ["cose"]}},
        {"name": "calendario", "description": "Legge gli eventi dei calendari collegati a Home Assistant in un intervallo (predefinito: prossimi 7 giorni).",
         "parameters": {"type": "OBJECT", "properties": {"da": {"type": "STRING"}, "a": {"type": "STRING"}}}},
        {"name": "cerca_web", "description": "Cerca su internet con Google e restituisce una risposta aggiornata con le fonti. Usalo per notizie, risultati sportivi, prezzi, orari di negozi, eventi, persone, fatti recenti e qualsiasi cosa che non sai con certezza.",
         "parameters": {"type": "OBJECT", "properties": {"domanda": {"type": "STRING", "description": "Cosa cercare, in italiano, completo di luogo e data se servono"}}, "required": ["domanda"]}},
        {"name": "meteo", "description": "Meteo attuale e previsioni fino a 7 giorni. Senza luogo: la casa dell'utente.",
         "parameters": {"type": "OBJECT", "properties": {"luogo": {"type": "STRING"}, "giorno": {"type": "NUMBER", "description": "0 oggi, 1 domani, fino a 6"}}}},
    ]}]


def run_tool(name, args, res):
    args = args or {}
    try:
        if name == "casa_comando":
            ok, nomi, ids = ha_do(args.get("dispositivo", ""), args.get("azione", "accendi"), args.get("valore"))
            res["casa"] += ids
            res["azioni"].append({"tipo": "casa", "ok": ok})
            return {"ok": ok, "dispositivi": nomi}
        if name == "casa_stato":
            devs = ha_devices()
            q = norm(args.get("cerca", ""))
            if q:
                qt = q.split()
                devs = [d for d in devs if any(w in norm(d["nome"] + " " + d["dominio"]) for w in qt)] or devs
            res["casa"] += [d["id"] for d in devs[:12]]
            return {"dispositivi": [{"nome": d["nome"], "stato": d["stato"] + (" " + d["unita"] if d["unita"] else "")} for d in devs[:40]]}
        if name == "memorizza":
            r = memorizza(**{k: args.get(k) for k in ("tipo", "titolo", "categoria", "importo", "data", "dettagli") if k in args})
            res["memorie"].append(r["id"])
            return {"ok": True, "salvato": r["titolo"], "categoria": r["categoria"]}
        if name == "riepilogo_spese":
            r = spese(args.get("da"), args.get("a"), args.get("categoria"))
            res["memorie"] += [v["id"] for v in r["voci"][:10]]
            return {k: r[k] for k in ("da", "a", "totale", "entrate", "per_categoria")} | {"voci": [{"titolo": v["titolo"], "importo": v["importo"], "data": v["data"]} for v in r["voci"][:15]]}
        if name == "cerca_ricordi":
            rs = cerca_ricordi(args.get("parole", ""))
            res["memorie"] += [r["id"] for r in rs]
            return {"ricordi": rs}
        if name == "lista_spesa":
            lista = ha_todo_add(args.get("cose") or [])
            return {"ok": True, "lista": lista}
        if name == "calendario":
            return {"eventi": ha_calendar(args.get("da"), args.get("a"))}
        if name == "cerca_web":
            r = cerca_web(args.get("domanda", ""))
            res["fonti"] += r.get("fonti", [])
            res["internet"] = True
            return r
        if name == "meteo":
            res["internet"] = True
            return meteo(args.get("luogo") or None, args.get("giorno") or 0)
    except Exception as e:
        return {"errore": str(e)[:200]}
    return {"errore": "strumento sconosciuto"}


def system_prompt(c):
    devs = ha_devices() if c.get("ha_token") else []
    dl = "; ".join("%s (%s: %s)" % (d["nome"], d["dominio"], d["stato"]) for d in devs[:60])
    g = ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"][now().weekday()]
    return ("Sei Jarvis, l'assistente personale dell'utente, come il Jarvis di Iron Man: elegante, sobrio, preciso, con un filo di ironia britannica. "
            "Parli sempre in italiano e chiami l'utente «%s». Rispondi in massimo 3 frasi brevi, adatte a essere lette ad alta voce: niente markdown, niente elenchi, niente emoji.\n"
            "Oggi è %s %s, ore %s.\n"
            "Dispositivi di casa su Home Assistant: %s.\n%s\n"
            "Usa gli strumenti per comandare la casa, leggere sensori e calendario, salvare ricordi e spese. Quando l'utente ti dice una spesa o qualcosa da ricordare, usa memorizza. "
            "Sei collegato a internet: per notizie, sport, prezzi, orari, persone, eventi e qualunque fatto recente o che non conosci con certezza usa cerca_web, senza chiedere il permesso; per il meteo usa meteo. "
            "Non dire mai che non puoi accedere a internet. Non inventare mai dati o importi: se non lo trovi, dillo." % (c.get("titolo") or "Signore", g, today(), now().strftime("%H:%M"), dl or "non collegati", digest()))


GEM = {"ok": "", "lista": [], "t": 0, "err": ""}
GEM_PREF = ["gemini-flash-lite-latest", "gemini-2.5-flash", "gemini-flash-latest", "gemini-2.5-flash-lite"]


def gemini_models(key):
    """Modelli da provare: quello che ha funzionato l'ultima volta, poi i preferiti, poi quelli che Google elenca per la chiave."""
    c = get_config()
    scelto = (c.get("gemini_model") or "auto").strip()
    if time.time() - GEM["t"] > 6 * 3600:
        GEM["t"] = time.time()
        try:
            out = http_json("%s/models?pageSize=200&key=%s" % (GEMINI_BASE, quote(key)), timeout=10)
            nomi = []
            for m in out.get("models") or []:
                n = m.get("name", "").split("/")[-1]
                if "flash" in n and "generateContent" in (m.get("supportedGenerationMethods") or []) and not re.search(r"image|tts|live|audio|embedding|thinking|exp", n):
                    nomi.append(n)
            vers = lambda n: [float(x) for x in re.findall(r"\d+(?:\.\d+)?", n)[:1]] or [0]
            GEM["lista"] = sorted(nomi, key=lambda n: ("preview" in n, "lite" not in n, [-v for v in vers(n)]))
        except Exception:
            pass
    out = []
    for m in ([scelto] if scelto not in ("", "auto", "gemini-flash-latest") else []) + [GEM["ok"]] + GEM_PREF + GEM["lista"]:
        if m and m not in out:
            out.append(m)
    return out


def gemini_call(body, key):
    """Prova i modelli uno dopo l'altro: se uno è esaurito (429), non c'è (404) o è sovraccarico (5xx) passa al successivo."""
    errori = []
    for model in gemini_models(key):
        try:
            out = http_json("%s/models/%s:generateContent?key=%s" % (GEMINI_BASE, model, quote(key)), body, timeout=40)
            GEM.update(ok=model, err="")
            return out
        except urllib.error.HTTPError as e:
            try:
                msg = e.read().decode("utf-8", "ignore")[:300]
            except Exception:
                msg = ""
            errori.append(e.code)
            GEM["err"] = ", ".join("%s" % c for c in errori[-6:]) + " · ultimo: %s %s" % (model, msg[:120].replace("\n", " "))
            if GEM["ok"] == model:
                GEM["ok"] = ""
            if e.code == 400 and re.search(r"API key not valid|API_KEY_INVALID", msg):
                raise RuntimeError("chiave") from e
            if e.code in (403,) and "PERMISSION_DENIED" in msg and "API" in msg and "has not been used" in msg:
                raise RuntimeError("chiave") from e
            if e.code in (400, 403, 404, 429, 500, 502, 503, 504):
                continue
            raise
        except (urllib.error.URLError, OSError) as e:
            GEM["err"] = "rete: %s" % str(e)[:120]
            raise RuntimeError("rete") from e
    raise RuntimeError("limite" if errori and all(c == 429 for c in errori) else "gemini")


def cerca_web(domanda):
    domanda = str(domanda or "").strip()
    if not domanda:
        return {"errore": "domanda vuota"}
    key = get_config().get("gemini_key")
    if key:
        try:
            body = {"contents": [{"role": "user", "parts": [{"text": "Oggi è %s. %s\nRispondi in italiano in poche frasi, con i fatti principali, numeri e date." % (today(), domanda)}]}],
                    "tools": [{"google_search": {}}], "generationConfig": {"temperature": 0.3, "maxOutputTokens": 600}}
            out = gemini_call(body, key)
            cand = (out.get("candidates") or [{}])[0]
            txt = " ".join(p.get("text", "") for p in ((cand.get("content") or {}).get("parts") or [])).strip()
            fonti = []
            for ch in ((cand.get("groundingMetadata") or {}).get("groundingChunks") or [])[:5]:
                w = ch.get("web") or {}
                if w.get("uri"):
                    fonti.append({"titolo": w.get("title") or w.get("uri"), "link": w["uri"]})
            if txt:
                return {"risposta": txt, "fonti": fonti}
        except Exception:
            pass
    try:
        w = wiki(domanda)
        if w:
            return {"risposta": w["testo"], "fonti": [{"titolo": "Wikipedia: " + w["titolo"], "link": w["link"]}]}
    except Exception:
        pass
    return {"errore": "la ricerca non ha dato risultati"}


def gemini(question, history, res):
    c = get_config()
    key = c.get("gemini_key")
    if not key:
        raise RuntimeError("nokey")
    contents = []
    for h in history[-6:]:
        contents.append({"role": "user", "parts": [{"text": h["u"]}]})
        contents.append({"role": "model", "parts": [{"text": h["j"]}]})
    contents.append({"role": "user", "parts": [{"text": question}]})
    body = {"systemInstruction": {"parts": [{"text": system_prompt(c)}]}, "contents": contents, "tools": tools_decl(),
            "generationConfig": {"temperature": 0.6, "maxOutputTokens": 600}}
    for _ in range(5):
        out = gemini_call(body, key)
        cand = (out.get("candidates") or [{}])[0]
        parts = (cand.get("content") or {}).get("parts") or []
        calls = [p["functionCall"] for p in parts if "functionCall" in p]
        if not calls:
            txt = " ".join(p.get("text", "") for p in parts if not p.get("thought")).strip()
            return txt or "Fatto, %s." % (c.get("titolo") or "Signore")
        body["contents"].append({"role": "model", "parts": parts})
        body["contents"].append({"role": "user", "parts": [{"functionResponse": {"name": fc.get("name"), "response": {"risultato": run_tool(fc.get("name"), fc.get("args"), res)}}} for fc in calls]})
    return "Ho fatto quello che potevo, %s." % (c.get("titolo") or "Signore")


def ollama(question, history):
    c = get_config()
    if not c.get("ollama_url") or not c.get("ollama_model"):
        raise RuntimeError("noollama")
    msgs = [{"role": "system", "content": system_prompt(c)}]
    for h in history[-4:]:
        msgs += [{"role": "user", "content": h["u"]}, {"role": "assistant", "content": h["j"]}]
    msgs.append({"role": "user", "content": question})
    out = http_json(c["ollama_url"].rstrip("/") + "/api/chat", {"model": c["ollama_model"], "messages": msgs, "stream": False}, timeout=120)
    return (out.get("message") or {}).get("content", "").strip()


def ask(text):
    text = str(text or "").strip()[:600]
    c = get_config()
    titolo = c.get("titolo") or "Signore"
    res = {"reply": "", "via": "locale", "azioni": [], "casa": [], "memorie": [], "cerca": [], "fonti": [], "internet": False}
    if not text:
        res["reply"] = "La ascolto, %s." % titolo
        return res
    loc = None
    try:
        loc = local_intent(text, titolo)
    except Exception as e:
        loc = {"reply": "Errore: %s" % e}
    if loc:
        res.update(loc)
    else:
        m = mem_all()
        try:
            res["reply"] = gemini(text, m["chat"], res)
            res["via"] = "gemini"
        except Exception as e:
            why = str(e)
            try:
                res["reply"] = ollama(text, m["chat"])
                res["via"] = "ollama"
            except Exception:
                res["via"] = "offline"
                w = None
                if re.search(r"^(chi |cos|che cos|cosa |dov|dove |parlami|dimmi qualcosa|spiegami)", norm(text)):
                    try:
                        w = wiki(text)
                    except Exception:
                        w = None
                if w:
                    res.update(reply=w["testo"], via="internet", fonti=[{"titolo": "Wikipedia: " + w["titolo"], "link": w["link"]}])
                elif why == "chiave":
                    res["reply"] = "Google rifiuta la chiave di Gemini, %s: la ricontrolli nelle impostazioni (⚙). Deve iniziare con AIza." % titolo
                elif why == "rete":
                    res["reply"] = "Il server non riesce a uscire su internet in questo momento, %s. I comandi della casa funzionano comunque." % titolo
                elif why == "nokey":
                    res["reply"] = "Per le domande mi serve il cervello, %s: inserisca la chiave gratuita di Gemini nelle impostazioni (⚙). I comandi della casa e le spese funzionano già." % titolo
                elif why == "limite":
                    res["reply"] = "Tutti i modelli gratuiti di Gemini sono al limite in questo momento, %s. Riprovi tra un minuto." % titolo
                else:
                    res["reply"] = "Non riesco a raggiungere il mio cervello online in questo momento, %s. I comandi della casa funzionano comunque." % titolo
    res["cerca"] = [w for w in norm(text).split() if len(w) > 3][:6]
    with LOCK:
        m = mem_all()
        m["chat"] = (m.get("chat") or [])[-29:] + [{"u": text, "j": res["reply"], "t": now().isoformat(timespec="seconds")}]
        mem_save(m)
    return res


# ------------------------------------------------------------------ Wyoming (Whisper e Piper)
def wy_send(sock, etype, data=None, payload=b""):
    hdr = {"type": etype, "version": "1.5.4"}
    db = b""
    if data is not None:
        db = json.dumps(data).encode("utf-8")
        hdr["data_length"] = len(db)
    if payload:
        hdr["payload_length"] = len(payload)
    sock.sendall(json.dumps(hdr).encode("utf-8") + b"\n" + db + payload)


def wy_read(f):
    line = f.readline()
    if not line:
        return None
    hdr = json.loads(line.decode("utf-8"))
    data = hdr.get("data") or {}
    if hdr.get("data_length"):
        data.update(json.loads(f.read(hdr["data_length"]).decode("utf-8")))
    payload = f.read(hdr["payload_length"]) if hdr.get("payload_length") else b""
    return hdr.get("type"), data, payload


def hostport(s, default):
    h, _, p = s.partition(":")
    return h, int(p or default)


def wav_pcm16(raw):
    """Restituisce (pcm16 mono 16 kHz) da un WAV qualsiasi; se non è WAV prova ffmpeg."""
    try:
        w = wave.open(io.BytesIO(raw))
        ch, sw, rate, n = w.getnchannels(), w.getsampwidth(), w.getframerate(), w.getnframes()
        frames = w.readframes(n)
        if sw != 2:
            raise ValueError("width")
        samples = struct.unpack("<%dh" % (len(frames) // 2), frames)
        if ch > 1:
            samples = [sum(samples[i:i + ch]) // ch for i in range(0, len(samples), ch)]
        if rate != 16000:
            ratio = rate / 16000.0
            out_n = int(len(samples) / ratio)
            samples = [samples[min(len(samples) - 1, int(i * ratio))] for i in range(out_n)]
        return struct.pack("<%dh" % len(samples), *samples)
    except Exception:
        if not shutil.which("ffmpeg"):
            raise RuntimeError("Formato audio non supportato (serve WAV).")
        p = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-ac", "1", "-ar", "16000", "-f", "s16le", "pipe:1"],
                           input=raw, capture_output=True, timeout=30)
        if p.returncode != 0:
            raise RuntimeError("ffmpeg: " + p.stderr.decode("utf-8", "ignore")[:200])
        return p.stdout


def stt(raw):
    pcm = wav_pcm16(raw)
    h, p = hostport(WHISPER, 10300)
    with socket.create_connection((h, p), timeout=60) as s:
        f = s.makefile("rb")
        fmt = {"rate": 16000, "width": 2, "channels": 1}
        wy_send(s, "transcribe", {"language": "it"})
        wy_send(s, "audio-start", fmt)
        for i in range(0, len(pcm), 32000):
            wy_send(s, "audio-chunk", fmt, pcm[i:i + 32000])
        wy_send(s, "audio-stop", {})
        while True:
            ev = wy_read(f)
            if ev is None:
                raise RuntimeError("Whisper ha chiuso la connessione")
            if ev[0] == "transcript":
                return (ev[1].get("text") or "").strip()


def piper_tts(text):
    h, p = hostport(PIPER, 10200)
    with socket.create_connection((h, p), timeout=30) as s:
        f = s.makefile("rb")
        wy_send(s, "synthesize", {"text": text, "voice": {"name": PIPER_VOICE}})
        rate, width, ch, pcm = 22050, 2, 1, bytearray()
        while True:
            ev = wy_read(f)
            if ev is None:
                break
            t, d, pl = ev
            if t == "audio-start":
                rate, width, ch = d.get("rate", rate), d.get("width", width), d.get("channels", ch)
            elif t == "audio-chunk":
                pcm += pl
            elif t == "audio-stop":
                break
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(ch)
        w.setsampwidth(width)
        w.setframerate(rate)
        w.writeframes(bytes(pcm))
    return buf.getvalue()


def to_wav16(raw):
    pcm = wav_pcm16(raw)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(16000)
        w.writeframes(pcm)
    return buf.getvalue()


def tts(text, fmt="mp3", voce=None):
    c = get_config()
    voce = voce or c.get("voce") or "it-IT-DiegoNeural"
    text = re.sub(r"\s+", " ", str(text or "")).strip()[:900]
    if not text:
        raise RuntimeError("testo vuoto")
    key = hashlib.sha1(("%s|%s|%s|%s" % (voce, c.get("velocita"), fmt, text)).encode("utf-8")).hexdigest()
    cdir = os.path.join(DATA, "cache")
    for ext, mime in (("mp3", "audio/mpeg"), ("wav", "audio/wav")):
        p = os.path.join(cdir, key + "." + ext)
        if os.path.exists(p):
            with open(p, "rb") as f:
                return f.read(), mime
    data, mime, ext = None, None, None
    if voce != "piper" and shutil.which(EDGE_BIN):
        try:
            with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tf:
                tmp = tf.name
            r = subprocess.run([EDGE_BIN, "--voice", voce, "--rate", c.get("velocita") or "+0%", "--text", text, "--write-media", tmp],
                               capture_output=True, timeout=25)
            if r.returncode == 0 and os.path.getsize(tmp) > 200:
                with open(tmp, "rb") as f:
                    data, mime, ext = f.read(), "audio/mpeg", "mp3"
            os.unlink(tmp)
        except Exception:
            data = None
    if data is None:
        data, mime, ext = piper_tts(text), "audio/wav", "wav"
    if fmt == "wav16":
        data, mime, ext = to_wav16(data), "audio/wav", "wav"
    with open(os.path.join(cdir, key + "." + ext), "wb") as f:
        f.write(data)
    prune_cache(cdir)
    return data, mime


def prune_cache(cdir, keep=400):
    try:
        fs = sorted((os.path.getmtime(os.path.join(cdir, x)), x) for x in os.listdir(cdir))
        for _, x in fs[:-keep]:
            os.unlink(os.path.join(cdir, x))
    except Exception:
        pass


def tcp_ok(hp, default):
    try:
        h, p = hostport(hp, default)
        with socket.create_connection((h, p), timeout=1.5):
            return True
    except Exception:
        return False


HA_CANDIDATI = [u for u in os.environ.get("HA_CANDIDATES", "http://host.docker.internal:8123,http://home-assistant_server_1:8123,http://homeassistant.local:8123,http://umbrel.local:8123").split(",") if u]


def ha_errore(e, url):
    if isinstance(e, urllib.error.HTTPError):
        if e.code in (401, 403):
            return "il token non è valido: creane uno nuovo in Home Assistant"
        return "Home Assistant risponde con errore %d" % e.code
    if isinstance(e, (urllib.error.URLError, OSError)):
        return "non raggiungo %s: controlla l'indirizzo" % url
    return str(e)[:160]


def ha_trova(tok):
    """Se l'indirizzo salvato non risponde prova quelli tipici di Umbrel e salva il primo che funziona."""
    attuale = get_config()["ha_url"].rstrip("/")
    for u in HA_CANDIDATI:
        u = u.rstrip("/")
        if u == attuale:
            continue
        try:
            http_json(u + "/api/", None, {"Authorization": "Bearer " + tok}, timeout=3)
        except urllib.error.HTTPError:
            continue
        except Exception:
            continue
        save_config({"ha_url": u})
        HA_CACHE.update(t=0)
        return u
    return None


def status():
    c = get_config()
    ha = {"collegato": False, "errore": ""}
    if c.get("ha_token"):
        try:
            ha_call("/api/", timeout=5)
            ha["collegato"] = True
        except Exception as e:
            ha["errore"] = ha_errore(e, c["ha_url"])
            if not isinstance(e, urllib.error.HTTPError) and ha_trova(c["ha_token"]):
                ha.update(collegato=True, errore="", indirizzo_trovato=get_config()["ha_url"])
        if ha["collegato"]:
            ha["dispositivi"] = len(ha_devices())
    else:
        ha["errore"] = "token mancante"
    return {"versione": VERSION, "home_assistant": ha, "gemini": bool(c.get("gemini_key")), "gemini_modello": GEM["ok"], "gemini_errore": GEM["err"], "ollama": bool(c.get("ollama_url") and c.get("ollama_model")),
            "whisper": tcp_ok(WHISPER, 10300), "piper": tcp_ok(PIPER, 10200), "edge_tts": bool(shutil.which(EDGE_BIN)),
            "ffmpeg": bool(shutil.which("ffmpeg")), "voce": c.get("voce")}


# ------------------------------------------------------------------ HTTP
MIME = {".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml",
        ".json": "application/json", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json",
        ".woff": "font/woff", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8"}


class H(BaseHTTPRequestHandler):
    server_version = "Jarvis/" + VERSION
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *a):
        if os.environ.get("JARVIS_LOG"):
            super().log_message(fmt, *a)

    def send(self, code, body, ctype="application/json; charset=utf-8", extra=None):
        if isinstance(body, (dict, list)):
            body = json.dumps(body, ensure_ascii=False).encode("utf-8")
        elif isinstance(body, str):
            body = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store" if ctype.startswith("application/json") else "max-age=60")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def body(self, limit=12_000_000):
        n = int(self.headers.get("Content-Length") or 0)
        if n > limit:
            raise ValueError("troppo grande")
        return self.rfile.read(n) if n else b""

    def jbody(self):
        raw = self.body(200_000)
        return json.loads(raw.decode("utf-8")) if raw else {}

    def device_ok(self, q):
        k = (q.get("key") or [""])[0] or self.headers.get("X-Jarvis-Key", "")
        return bool(k) and secrets.compare_digest(k, get_config()["device_key"])

    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        u = urlparse(self.path)
        q = parse_qs(u.query)
        try:
            if u.path.startswith("/api/device/") and not self.device_ok(q):
                return self.send(401, {"errore": "chiave dispositivo errata"})
            if u.path == "/api/ping":
                return self.send(200, {"ok": True, "versione": VERSION})
            if u.path == "/api/status":
                return self.send(200, status())
            if u.path == "/api/config":
                return self.send(200, public_config())
            if u.path == "/api/mem":
                m = mem_all()
                return self.send(200, {"ricordi": m["ricordi"], "chat": m.get("chat", [])[-10:], "spese_mese": spese()["totale"]})
            if u.path == "/api/agenda":
                if not get_config().get("ha_token"):
                    return self.send(200, {"eventi": []})
                fine = (now().date() + datetime.timedelta(days=30)).isoformat()
                return self.send(200, {"eventi": ha_calendar(today(), fine)})
            if u.path == "/api/home":
                devs = ha_devices()
                return self.send(200, {"ok": not HA_CACHE["err"], "errore": HA_CACHE["err"][:160], "dispositivi": devs})
            if u.path in ("/api/tts", "/api/device/tts"):
                fmt = (q.get("fmt") or ["wav16" if u.path.startswith("/api/device/") else "mp3"])[0]
                data, mime = tts((q.get("text") or [""])[0], fmt, (q.get("voce") or [None])[0])
                return self.send(200, data, mime)
            if u.path == "/api/device/ask":
                return self.send(200, ask((q.get("text") or [""])[0]))
            if u.path == "/api/device/siri":
                return self.send(200, ask((q.get("text") or [""])[0])["reply"], "text/plain; charset=utf-8")
            return self.static(u.path)
        except Exception as e:
            return self.send(500, {"errore": str(e)[:300]})

    def do_POST(self):
        u = urlparse(self.path)
        q = parse_qs(u.query)
        try:
            if u.path.startswith("/api/device/") and not self.device_ok(q):
                return self.send(401, {"errore": "chiave dispositivo errata"})
            if u.path == "/api/ask":
                return self.send(200, ask(self.jbody().get("text", "")))
            if u.path == "/api/config":
                save_config(self.jbody())
                HA_CACHE["t"] = 0
                return self.send(200, public_config())
            if u.path == "/api/mem":
                b = self.jbody()
                r = memorizza(**{k: b.get(k) for k in ("tipo", "titolo", "categoria", "importo", "data", "dettagli") if k in b})
                return self.send(200, r)
            if u.path in ("/api/stt", "/api/device/stt"):
                return self.send(200, {"text": stt(self.body())})
            if u.path in ("/api/device/ask", "/api/device/siri"):
                raw = self.body(200_000)
                try:
                    j = json.loads(raw.decode("utf-8")) if raw else {}
                    text = (j.get("text") or j.get("testo") or "") if isinstance(j, dict) else str(j)
                except Exception:
                    text = raw.decode("utf-8", "ignore")
                text = text or (q.get("text") or [""])[0]
                res = ask(text)
                if u.path.endswith("/siri"):
                    return self.send(200, res["reply"], "text/plain; charset=utf-8")
                return self.send(200, res)
            if u.path == "/api/device/voice":
                text = stt(self.body())
                res = ask(text) if text else {"reply": "Non ho capito, %s." % (get_config().get("titolo") or "Signore")}
                res["text"] = text
                res["audio"] = "/api/device/tts?fmt=wav16&key=%s&text=%s" % (get_config()["device_key"], quote(res["reply"]))
                return self.send(200, res)
            return self.send(404, {"errore": "non trovato"})
        except Exception as e:
            return self.send(500, {"errore": str(e)[:300]})

    def do_DELETE(self):
        u = urlparse(self.path)
        m = re.match(r"^/api/mem/([a-f0-9]+)$", u.path)
        if m:
            return self.send(200, {"ok": dimentica(m.group(1))})
        return self.send(404, {"errore": "non trovato"})

    def static(self, path):
        if path in ("", "/"):
            path = "/index.html"
        p = os.path.normpath(os.path.join(PUBLIC, path.lstrip("/")))
        if not p.startswith(os.path.normpath(PUBLIC)) or not os.path.isfile(p):
            return self.send(404, "Non trovato", "text/plain; charset=utf-8")
        with open(p, "rb") as f:
            data = f.read()
        return self.send(200, data, MIME.get(os.path.splitext(p)[1], "application/octet-stream"))


def main():
    get_config()
    srv = ThreadingHTTPServer(("0.0.0.0", PORT), H)
    srv.daemon_threads = True
    print("Jarvis %s in ascolto sulla porta %d (dati in %s)" % (VERSION, PORT, DATA), flush=True)
    srv.serve_forever()


if __name__ == "__main__":
    main()
