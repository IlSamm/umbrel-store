from __future__ import annotations

import json
import re
import sys
import urllib.parse
import urllib.request

BASE = sys.argv[1].rstrip('/') if len(sys.argv) > 1 else 'http://127.0.0.1:18765'

CASES = [
    ('PLA Basic', 'PLA BASIC'),
    ('PLA Matte', 'PLA MATTE'),
    ('PETG HF', 'PETG HF'),
]

REFILL_RX = re.compile(r'\b(refill|ricarica|without\s+spool|senza\s+bobina)\b', re.I)
SPOOL_RX = re.compile(r'\b(with\s+spool|spool|bobina)\b', re.I)


def get(path: str, timeout: int = 35) -> dict:
    url = BASE + path
    try:
        with urllib.request.urlopen(url, timeout=timeout) as response:
            payload = response.read().decode('utf-8', errors='replace')
            if response.status != 200:
                raise RuntimeError(f'HTTP {response.status} da {url}: {payload[:500]}')
            return json.loads(payload)
    except Exception as exc:
        raise RuntimeError(f'Richiesta fallita per {url}: {exc.__class__.__name__}: {exc}') from exc


def offer_text(offer: dict) -> str:
    return ' '.join(str(offer.get(key) or '') for key in (
        'product', 'title', 'name', 'variant', 'format', 'size', 'note'
    ))


def variant_type(offer: dict) -> str:
    text = offer_text(offer)
    if REFILL_RX.search(text):
        return 'REFILL'
    if SPOOL_RX.search(text):
        return 'SPOOL'
    return 'SCONOSCIUTO'


def price_value(offer: dict):
    value = offer.get('price')
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    value = float(value)
    return value if value > 0 else None


def variant_label(offer: dict, index: int) -> str:
    name = offer.get('variant') or offer.get('title') or offer.get('product') or offer.get('name')
    return str(name or f'variante #{index + 1}')


def fail_reason_for_variant(offer: dict) -> list[str]:
    reasons: list[str] = []
    if price_value(offer) is None:
        reasons.append('prezzo mancante/non numerico/non positivo')
    if 'available' not in offer:
        reasons.append('campo available mancante')
    elif not isinstance(offer.get('available'), bool):
        reasons.append(f'available non booleano ({offer.get("available")!r})')
    return reasons


def log_variant(family: str, offer: dict, index: int) -> None:
    kind = variant_type(offer)
    price = offer.get('price')
    available = offer.get('available', '<mancante>')
    reasons = fail_reason_for_variant(offer)
    status = 'FAIL' if reasons else 'OK'
    print(
        f'BAMBU_VARIANT {status} | famiglia={family} | tipo={kind} | '
        f'variante={variant_label(offer, index)!r} | prezzo={price!r} | '
        f'disponibile={available!r} | motivo={"; ".join(reasons) if reasons else "-"}',
        flush=True,
    )


def validate_family(material: str, label: str) -> list[str]:
    failures: list[str] = []
    path = '/api/catalog?' + urllib.parse.urlencode({
        'material': material,
        'brand': 'all',
        'qty': '1',
        'refresh': '1',
        'source': 'bambu',
    })

    print(f'\n===== BAMBU LIVE CHECK: {label} =====', flush=True)
    try:
        data = get(path)
    except Exception as exc:
        message = str(exc)
        print(f'BAMBU_FAMILY FAIL | famiglia={label} | motivo={message}', flush=True)
        return [message]

    sources = [source for source in data.get('sources', []) if str(source.get('id')) == 'bambu']
    offers = [offer for offer in data.get('offers', []) if str(offer.get('source_id')) == 'bambu']

    if len(sources) != 1:
        failures.append(f'attesa esattamente 1 fonte Bambu, ricevute {len(sources)}')
        source = sources[0] if sources else {}
    else:
        source = sources[0]

    print(
        'BAMBU_SOURCE | '
        f'famiglia={label} | ok={source.get("ok")!r} | results={source.get("results")!r} | '
        f'http={source.get("http_status")!r} | tempo_ms={source.get("ms")!r} | '
        f'url={source.get("request_url")!r} | errore={source.get("diagnostic_error") or source.get("error_message") or source.get("error") or "-"}',
        flush=True,
    )

    for index, offer in enumerate(offers):
        log_variant(label, offer, index)
        for reason in fail_reason_for_variant(offer):
            failures.append(f'{variant_label(offer, index)}: {reason}')

    if source.get('ok') is not True:
        failures.append(
            'fonte Bambu non OK: ' + str(
                source.get('diagnostic_error') or source.get('error_message') or source.get('error') or 'motivo backend non disponibile'
            )
        )

    result_count = int(source.get('results') or 0) if source else 0
    if result_count <= 0:
        failures.append('Bambu ha restituito zero risultati')
    if not offers:
        failures.append('nessuna offerta Bambu presente nella risposta')
    if source and result_count != len(offers):
        failures.append(f'conteggio incoerente: source.results={result_count}, offerte={len(offers)}')

    refill = [offer for offer in offers if variant_type(offer) == 'REFILL']
    spool = [offer for offer in offers if variant_type(offer) == 'SPOOL']

    if not refill:
        failures.append('nessuna variante Refill riconosciuta')
    if not spool:
        failures.append('nessuna variante With Spool/bobina riconosciuta')
    if offers and not any(offer.get('available') is True for offer in offers):
        failures.append('nessuna variante Bambu risulta acquistabile')
    if refill and not any(offer.get('available') is True and price_value(offer) is not None for offer in refill):
        failures.append('nessun Refill disponibile con prezzo valido')
    if spool and not any(offer.get('available') is True and price_value(offer) is not None for offer in spool):
        failures.append('nessuna variante spool disponibile con prezzo valido')

    if failures:
        print(f'BAMBU_FAMILY FAIL | famiglia={label} | errori={len(failures)}', flush=True)
        for reason in failures:
            print(f'  - {reason}', flush=True)
    else:
        prices = [price_value(offer) for offer in offers if price_value(offer) is not None]
        print(
            f'BAMBU_FAMILY OK | famiglia={label} | offerte={len(offers)} | '
            f'refill={len(refill)} | spool={len(spool)} | '
            f'disponibili={sum(offer.get("available") is True for offer in offers)} | '
            f'prezzo_min={min(prices) if prices else None}',
            flush=True,
        )

    return failures


def main() -> None:
    all_failures: list[tuple[str, str]] = []
    for material, label in CASES:
        for reason in validate_family(material, label):
            all_failures.append((label, reason))

    print('\n===== BAMBU REQUIRED GATE SUMMARY =====', flush=True)
    if all_failures:
        print(f'BAMBU_REQUIRED_LIVE_GATE FAIL | errori={len(all_failures)}', flush=True)
        for family, reason in all_failures:
            print(f'  [{family}] {reason}', flush=True)
        raise SystemExit(1)

    print('BAMBU_REQUIRED_LIVE_GATE OK | PLA BASIC, PLA MATTE, PETG HF', flush=True)


if __name__ == '__main__':
    main()
