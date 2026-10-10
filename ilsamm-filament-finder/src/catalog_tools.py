"""Price and product parsing shared by live search and local monitoring."""
import json
import math
import re
from html import unescape
from urllib.parse import urljoin, urlparse, parse_qs


def price_number(value):
    if value is None or isinstance(value, bool):
        return None
    text = re.sub(r"[^\d.,+-]", "", str(value))
    if "," in text and "." in text:
        decimal = "," if text.rfind(",") > text.rfind(".") else "."
        text = text.replace("." if decimal == "," else ",", "").replace(decimal, ".")
    elif "," in text:
        text = text.replace(",", ".")
    try:
        number = float(text)
        return number if math.isfinite(number) and number >= 0 else None
    except ValueError:
        return None


def weight_kg(text):
    """Only explicit net sizes. Never use Shopify's gross shipping weight."""
    text = str(text or "")
    text = re.sub(r'\b(\d)[.](\d{3})\s*g\b', r'\1\2 g', text, flags=re.I)
    multi = re.search(r"\b(\d{1,2})\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(kg|g)\b", text, re.I)
    if multi:
        result = round(int(multi[1]) * float(multi[2].replace(",", ".")) / (1000 if multi[3].lower() == "g" else 1), 3)
        return result if 0.05 <= result <= 50 else None
    match = re.search(r"(?<![\d.])(\d+(?:[.,]\d+)?)\s*(kg|g)\b", text, re.I)
    if not match:
        return None
    result = float(match[1].replace(",", ".")) / (1000 if match[2].lower() == "g" else 1)
    pack = re.search(r"\b(?:pack\s*(?:of|da)?\s*|confezione\s*da\s*)(\d{1,2})\b", text, re.I)
    if pack:
        result *= int(pack[1])
    return round(result, 3) if 0.05 <= result <= 50 else None


def safe_product_url(value, base=""):
    url = urljoin(base, str(value or ""))
    parsed = urlparse(url)
    return url if parsed.scheme in ("https", "http") and parsed.hostname and not parsed.username else ""


def material_matches(material, title):
    target = re.sub(r"[-_/]", " ", material.upper())
    text = re.sub(r"[-_/]", " ", title.upper())
    if re.search(r"\b(NOZZLE|UGELLO|HOTEND|DRYER|SPOOL HOLDER|EMPTY SPOOL|BOBINA VUOTA|BUILD PLATE|SAMPLE|SWATCH)\b", text):
        return False
    families = r"PAHT|PA12|PA11|PA6|PPA|PPS|PETG|PCTG|PLA|ABS|ASA|TPU|TPE|HIPS|PVA|BVOH|PEEK|PEKK|PEI|PPSU|PC|PET|PP|PA|NYLON|PVB|CPE|PMMA|POM|TPC"
    wanted = re.search(r"\b(" + families + r")\b", target)
    found = set(re.findall(r"\b(" + families + r")\b", text))
    if wanted and wanted[1] not in found:
        if not (wanted[1] in ("PA", "NYLON") and found.intersection({"PA", "NYLON", "PA6", "PA12", "PA11", "PAHT"})):
            return False
    modifiers = {
        "basic": r"\b(BASIC|STANDARD)\b",
        "matte": r"\b(MATTE|MATT|OPACO)\b", "silk": r"\b(SILK|SETA)\b",
        "cf": r"\bCF\b|CARBON", "gf": r"\bGF\b|GLASS FIB",
        "wood": r"\b(WOOD|LEGNO)\b", "glow": r"\bGLOW\b",
        "marble": r"\b(MARBLE|STONE)\b", "esd": r"\bESD\b",
        "hf": r"\bHF\b|HIGH (FLOW|SPEED)", "plus": r"\b(PLUS|TOUGH)\b|PLA\s*\+",
    }
    for pattern in modifiers.values():
        if re.search(pattern, target) and not re.search(pattern, text):
            return False
    if "SUPPORT" not in target and "SUPPORT" in text:
        return False
    return bool(wanted) or material.casefold() in title.casefold()


def structured_offers(document, source, page_url, material):
    """Read a price only from its own Product/Offer record, never a nearby card."""
    rows = []

    def walk(node):
        if isinstance(node, list):
            for item in node:
                walk(item)
            return
        if not isinstance(node, dict):
            return
        types = node.get("@type", [])
        types = [types] if isinstance(types, str) else types
        if "Product" in types or "ProductGroup" in types:
            title = str(node.get("name") or "")
            if material_matches(material, title):
                offers = node.get("offers", [])
                offers = [offers] if isinstance(offers, dict) else offers
                for offer in offers:
                    if not isinstance(offer, dict) or offer.get("priceCurrency") != "EUR":
                        continue
                    # AggregateOffer lowPrice is not a purchasable variant price.
                    price = price_number(offer.get("price"))
                    url = safe_product_url(unescape(str(offer.get("url") or node.get("url") or "")), page_url)
                    if not price or not url:
                        continue
                    available = str(offer.get("availability") or "").split("/")[-1]
                    brand = node.get("brand") or source.get("brand")
                    if isinstance(brand, dict):
                        brand = brand.get("name")
                    size = str(node.get("size") or "")
                    for key, values in parse_qs(urlparse(url).query).items():
                        if 'weight' in key.lower() or 'peso' in key.lower():
                            size = values[0]
                    weight = weight_kg(size or title)
                    rows.append({"source_id": source["id"], "store": source["store"],
                                 "source_kind": source["kind"], "brand": brand,
                                 "product": title, "variant": str(node.get("sku") or ""),
                                 "color": node.get("color"), "weight_kg": weight,
                                 "price": price, "perkg": round(price / weight, 2) if weight else None,
                                 "available": True if available in ("InStock", "LimitedAvailability") else False if available in ("OutOfStock", "Discontinued", "SoldOut") else None,
                                 "url": url, "priority": source["priority"], "note": "Dati strutturati del prodotto"})
        for value in node.values():
            if isinstance(value, (dict, list)):
                walk(value)

    for match in re.finditer(r'<script\b[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', document, re.I | re.S):
        try:
            walk(json.loads(match[1]))
        except (ValueError, TypeError):
            continue
    return rows
