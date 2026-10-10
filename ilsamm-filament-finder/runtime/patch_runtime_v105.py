from __future__ import annotations

import shutil
import sys
from pathlib import Path

APP_VERSION = "10.5.0"
JS_ASSET = "v105-deal-engine.js"
CSS_ASSET = "v105-deal-engine.css"

PROMO_HELPERS = r'''
# Filament Finder 10.5: verified promotion extraction for Shopify product pages.
# The parser is deliberately conservative: a promotion changes the calculated
# total only when quantity and discount are explicitly present on the page.
def _ff105_plain_text(html):
    text=re.sub(r'<script\b[^>]*>.*?</script>', ' ', html or '', flags=re.I|re.S)
    text=re.sub(r'<style\b[^>]*>.*?</style>', ' ', text, flags=re.I|re.S)
    text=re.sub(r'<[^>]+>', ' ', text)
    text=htmlmod.unescape(text)
    return SPACE_RE.sub(' ', text).strip()


def _ff105_promo_windows(text):
    low=text.lower()
    anchors=(
        'più acquisti', 'piu acquisti', 'più bobine', 'piu bobine',
        'more you buy', 'buy more', 'bulk discount', 'quantity discount',
        'da 3 bobine', 'da 4 bobine', 'from 3 spools', 'from 4 spools',
        'al prezzo di', 'for the price of'
    )
    windows=[]
    for anchor in anchors:
        start=0
        while True:
            pos=low.find(anchor,start)
            if pos<0: break
            a=max(0,pos-220); b=min(len(text),pos+1500)
            windows.append(text[a:b]); start=pos+len(anchor)
            if len(windows)>=8: break
        if len(windows)>=8: break
    if not windows:
        windows=[text[:12000]]
    return windows


def _ff105_add_tier(tiers, tier):
    if not tier: return
    min_qty=int(tier.get('min_qty') or 0)
    if min_qty<2 or min_qty>100: return
    key=(tier.get('kind'),min_qty,round(float(tier.get('discount_pct') or 0),3),round(float(tier.get('unit_price_perkg') or 0),3),int(tier.get('buy_qty') or 0),int(tier.get('pay_qty') or 0))
    if any(x.get('_key')==key for x in tiers): return
    item=dict(tier); item['_key']=key; item['verified']=True
    tiers.append(item)


def _ff105_parse_promotions(html):
    text=_ff105_plain_text(html)
    tiers=[]
    for window in _ff105_promo_windows(text):
        # Common SUNLU-style table: "Da 3 bobine / Da 6 bobine / Da 10 bobine"
        # followed by "4% OFF / 8% OFF / 10% OFF".
        qtys=[int(x) for x in re.findall(r'(?:\bda\b|\bfrom\b|\ba partire da\b)\s*(\d{1,2})\s*(?:bobine|spools?|rolls?|rotoli)',window,re.I)]
        discounts=[float(x.replace(',','.')) for x in re.findall(r'(\d{1,2}(?:[.,]\d+)?)\s*%\s*(?:off|di\s+sconto|sconto)',window,re.I)]
        if 1<=len(qtys)<=6 and len(discounts)>=len(qtys):
            for min_qty,pct in zip(qtys,discounts[:len(qtys)]):
                if 0<pct<95:
                    _ff105_add_tier(tiers,{'kind':'percent','min_qty':min_qty,'discount_pct':pct,'label':f'{min_qty}+ bobine · -{pct:g}%'})

        # Direct language: "30% di sconto su 4 bobine".
        for pct,min_qty in re.findall(r'(\d{1,2}(?:[.,]\d+)?)\s*%\s*(?:off|di\s+sconto|sconto)[^0-9%]{0,90}?(?:su|da|per|con|on|from)?\s*(\d{1,2})\s*(?:bobine|spools?|rolls?|rotoli)',window,re.I):
            p=float(pct.replace(',','.')); n=int(min_qty)
            if 0<p<95:_ff105_add_tier(tiers,{'kind':'percent','min_qty':n,'discount_pct':p,'label':f'{n}+ bobine · -{p:g}%'})
        for min_qty,pct in re.findall(r'(\d{1,2})\s*(?:bobine|spools?|rolls?|rotoli)[^%]{0,100}?(\d{1,2}(?:[.,]\d+)?)\s*%\s*(?:off|di\s+sconto|sconto)?',window,re.I):
            p=float(pct.replace(',','.')); n=int(min_qty)
            if 0<p<95:_ff105_add_tier(tiers,{'kind':'percent','min_qty':n,'discount_pct':p,'label':f'{n}+ bobine · -{p:g}%'})

        # Exact per-kg tiers. Values prefixed with "Da/From" are kept as
        # informative only because they may refer to the cheapest colour.
        perkg=[]
        for m in re.finditer(r'\b(da|from)?\s*€\s*([0-9]+(?:[.,][0-9]{1,2})?)\s*/\s*kg\b',window,re.I):
            perkg.append((float(m.group(2).replace(',','.')),bool(m.group(1))))
        if qtys and len(perkg)>=len(qtys):
            for min_qty,(price,approx) in zip(qtys,perkg[:len(qtys)]):
                if 2<price<500:
                    _ff105_add_tier(tiers,{'kind':'perkg','min_qty':min_qty,'unit_price_perkg':price,'approximate':approx,'label':f'{min_qty}+ bobine · {price:.2f} €/kg'+(' da' if approx else '')})

        # Buy X, pay Y / X al prezzo di Y.
        for buy,pay in re.findall(r'(\d{1,2})\s*(?:bobine|spools?|rolls?)?\s*(?:al\s+prezzo\s+di|for\s+the\s+price\s+of)\s*(\d{1,2})',window,re.I):
            b=int(buy); p=int(pay)
            if b>1 and 0<p<b:_ff105_add_tier(tiers,{'kind':'buyx','min_qty':b,'buy_qty':b,'pay_qty':p,'label':f'{b} al prezzo di {p}'})

    # Coupon codes are surfaced but not assumed stackable with quantity promos.
    promo_code=None; promo_code_discount_pct=None
    code_patterns=(
        r'(?:usa|use|applica|apply)\s+(?:il\s+)?(?:codice|code|coupon)\s*[:\-]?\s*([A-Z0-9][A-Z0-9_-]{2,20})[^%]{0,80}?(\d{1,2}(?:[.,]\d+)?)\s*%',
        r'(\d{1,2}(?:[.,]\d+)?)\s*%[^.]{0,80}?(?:con\s+il\s+codice|with\s+(?:code|coupon))\s*[:\-]?\s*([A-Z0-9][A-Z0-9_-]{2,20})'
    )
    m=re.search(code_patterns[0],text,re.I)
    if m:
        promo_code=m.group(1).upper(); promo_code_discount_pct=float(m.group(2).replace(',','.'))
    else:
        m=re.search(code_patterns[1],text,re.I)
        if m:
            promo_code=m.group(2).upper(); promo_code_discount_pct=float(m.group(1).replace(',','.'))

    # Explicit free-shipping thresholds.
    threshold=None
    shipping_patterns=(
        r'(?:spedizione|consegna)\s+(?:gratuita|gratis)[^€0-9]{0,90}?(?:oltre|sopra|da)\s*€?\s*([0-9]+(?:[.,][0-9]{1,2})?)',
        r'(?:free\s+shipping|free\s+delivery)[^€0-9]{0,90}?(?:over|above|from)\s*€?\s*([0-9]+(?:[.,][0-9]{1,2})?)',
        r'(?:oltre|sopra|over|above)\s*€\s*([0-9]+(?:[.,][0-9]{1,2})?)[^.] {0,90}(?:spedizione\s+(?:gratuita|gratis)|free\s+shipping)'
    )
    for rx in shipping_patterns:
        m=re.search(rx,text,re.I)
        if m:
            try:
                value=float(m.group(1).replace(',','.'))
                if 5<=value<=1000: threshold=value; break
            except Exception: pass

    for tier in tiers:tier.pop('_key',None)
    tiers.sort(key=lambda x:(int(x.get('min_qty') or 0),str(x.get('kind') or '')))
    summary=' · '.join(str(x.get('label')) for x in tiers[:8] if x.get('label'))
    return {'tiers':tiers[:12],'promo_code':promo_code,'promo_code_discount_pct':promo_code_discount_pct,'free_shipping_threshold':threshold,'promo_text':summary}


def _ff105_enrich_shopify_promotions(source, offers):
    if not offers:return offers
    # Fetch only a few distinct, cheapest candidate pages. This gives quantity
    # promos to the deal engine without turning one store into the search bottleneck.
    urls=[]
    for offer in sorted(offers,key=lambda o:float(o.get('price') or 1e9)):
        url=str(offer.get('url') or '').split('?',1)[0]
        if url and url not in urls:urls.append(url)
        if len(urls)>=4:break
    metadata={}
    for url in urls:
        try:
            html,_,_=fetch(url)
            metadata[url]=_ff105_parse_promotions(html)
        except Exception:
            metadata[url]={'tiers':[],'promo_code':None,'promo_code_discount_pct':None,'free_shipping_threshold':None,'promo_text':''}
    for offer in offers:
        url=str(offer.get('url') or '').split('?',1)[0]
        meta=metadata.get(url)
        if not meta:continue
        if meta.get('tiers'):
            offer['promo_tiers']=meta['tiers']; offer['promotion_verified']=True
        if meta.get('promo_code'):
            offer['promo_code']=meta['promo_code']; offer['promo_code_discount_pct']=meta.get('promo_code_discount_pct'); offer['promo_code_required']=True
        if meta.get('free_shipping_threshold') is not None:
            offer['free_shipping_threshold']=meta['free_shipping_threshold']
        if meta.get('promo_text'):offer['promo_text']=meta['promo_text']
        offer['promo_page_checked']=True
    return offers
'''


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: patch_runtime_v105.py <app-store-root> <runtime-dir>")

    root = Path(sys.argv[1]).resolve()
    out = Path(sys.argv[2]).resolve()
    app_root = root / "ilsamm-filament-finder"
    if not out.is_dir():
        raise RuntimeError(f"runtime directory missing: {out}")

    js_source = app_root / "ui-v105" / "deal-engine.js"
    css_source = app_root / "ui-v105" / "deal-engine.css"
    if not js_source.is_file() or not css_source.is_file():
        raise RuntimeError("10.5 deal engine assets missing")
    shutil.copyfile(js_source, out / JS_ASSET)
    shutil.copyfile(css_source, out / CSS_ASSET)

    server_path = out / "server.py"
    server = server_path.read_text(encoding="utf-8")

    insert_marker = "def shopify_product_variants(source, product_url, query):"
    if "def _ff105_parse_promotions(html):" not in server:
        if insert_marker not in server:
            raise RuntimeError("10.5 Shopify insertion marker missing")
        server = server.replace(insert_marker, PROMO_HELPERS + "\n\n" + insert_marker, 1)

    price_marker = "        price=normalize_price(v.get('price'))\n        if price is None or price < 2 or price > 500: continue"
    price_replacement = "        price=normalize_price(v.get('price'))\n        compare_at_price=normalize_price(v.get('compare_at_price'))\n        if price is None or price < 2 or price > 500: continue"
    if price_replacement not in server:
        if price_marker not in server:
            raise RuntimeError("10.5 compare-at price marker missing")
        server = server.replace(price_marker, price_replacement, 1)

    dict_marker = "            'available':available,'url':url,'note':'variante ufficiale' if source['kind']=='official' else 'variante negozio',\n            'priority':source['priority']"
    dict_replacement = "            'available':available,'url':url,'note':'variante ufficiale' if source['kind']=='official' else 'variante negozio',\n            'list_price':compare_at_price if compare_at_price is not None and compare_at_price>price else None,\n            'priority':source['priority']"
    if dict_replacement not in server:
        if dict_marker not in server:
            raise RuntimeError("10.5 offer dictionary marker missing")
        server = server.replace(dict_marker, dict_replacement, 1)

    scrape_marker = """def scrape_shopify(source, query):
    search_url=source['search'].format(q=quote(query))
    html, final, _ = fetch(search_url)
    links=canonical_product_links(html, source['base'], limit=7)
    offers=[]
    for link in links:
        try: offers.extend(shopify_product_variants(source, link, query))
        except Exception: pass
        if len(offers)>100: break
    return offers
"""
    scrape_replacement = """def scrape_shopify(source, query):
    search_url=source['search'].format(q=quote(query))
    html, final, _ = fetch(search_url)
    links=canonical_product_links(html, source['base'], limit=7)
    offers=[]
    for link in links:
        try: offers.extend(shopify_product_variants(source, link, query))
        except Exception: pass
        if len(offers)>100: break
    return _ff105_enrich_shopify_promotions(source, offers)
"""
    if scrape_replacement not in server:
        if scrape_marker not in server:
            raise RuntimeError("10.5 scrape_shopify marker missing")
        server = server.replace(scrape_marker, scrape_replacement, 1)

    old_version = "APP_VERSION = '10.4.0'"
    new_version = f"APP_VERSION = '{APP_VERSION}'"
    if new_version not in server:
        if old_version not in server:
            raise RuntimeError("10.5 backend version marker missing")
        server = server.replace(old_version, new_version, 1)
    compile(server, "server.py", "exec")
    server_path.write_text(server, encoding="utf-8")

    index_path = out / "index.html"
    index = index_path.read_text(encoding="utf-8")
    css_marker = '<link rel="stylesheet" href="v102-prices.css?v=1030">'
    css_tag = f'<link rel="stylesheet" href="{CSS_ASSET}?v=1050">'
    if css_tag not in index:
        if css_marker not in index:
            raise RuntimeError("10.5 marketplace CSS marker missing")
        index = index.replace(css_marker, css_marker + "\n  " + css_tag, 1)

    js_marker = '<script src="v102-prices.js?v=1030"></script>'
    js_tag = f'<script src="{JS_ASSET}?v=1050"></script>'
    if js_tag not in index:
        if js_marker not in index:
            raise RuntimeError("10.5 marketplace JS marker missing")
        # Load after the marketplace renderer exists, but before the capture
        # controller owns the search click. The upstream fetch is already the
        # 10.4 quality-normalized wrapper at this point.
        index = index.replace(js_marker, js_marker + "\n" + js_tag, 1)
    index_path.write_text(index, encoding="utf-8")

    js = (out / JS_ASSET).read_text(encoding="utf-8")
    css = (out / CSS_ASSET).read_text(encoding="utf-8")
    if "FF105_DEAL_ENGINE_VERSION" not in js or "FF105_BEST_TIER_PLAN" not in js:
        raise RuntimeError("10.5 deal engine validation failed")
    if ".ff105-deals-panel" not in css or ".ff105-badge.hot" not in css:
        raise RuntimeError("10.5 deal CSS validation failed")
    if "_ff105_enrich_shopify_promotions" not in server or "compare_at_price" not in server:
        raise RuntimeError("10.5 promotion backend validation failed")
    if js_tag not in index or css_tag not in index:
        raise RuntimeError("10.5 assets not mounted")
    if new_version not in server:
        raise RuntimeError("10.5 backend version patch missing")

    print("Filament Finder 10.5 smart-deals patch: OK", flush=True)


if __name__ == "__main__":
    main()
