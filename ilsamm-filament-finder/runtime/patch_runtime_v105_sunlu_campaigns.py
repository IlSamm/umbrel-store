from __future__ import annotations

import sys
from pathlib import Path


SUNLU_CAMPAIGN_CODE = r'''
FF105_SUNLU_DEALS_URL='https://it.store.sunlu.com/pages/offerte-speciali-del-mese'


def _ff105_campaign_family_ok(title, material):
    t=normalize_text_key(title).upper().replace('-', ' ')
    m=normalize_text_key(material).upper().replace('-', ' ')
    if 'PETG' in m: return 'PETG' in t
    if re.search(r'\bPLA\b',m): return bool(re.search(r'\bPLA(?:\+|\b)',t)) and 'PETG' not in t
    if re.search(r'\bABS\b',m): return bool(re.search(r'\bABS\b',t))
    if re.search(r'\bASA\b',m): return bool(re.search(r'\bASA\b',t))
    if 'TPU' in m: return 'TPU' in t
    if re.search(r'\bPC\b',m): return bool(re.search(r'\bPC\b',t))
    return False


def _ff105_parse_sunlu_campaigns(html, material):
    rows=[]
    # The SUNLU deal landing page is server-rendered and groups each campaign in
    # a heading followed by the 4-spool and 10-spool average price. Parsing the
    # exact average price is more trustworthy than inferring a percentage from a
    # generic "up to -40%" banner.
    headings=list(re.finditer(r'<h([1-4])\b[^>]*>(.*?)</h\1>',html or '',re.I|re.S))
    seen=set()
    for i,h in enumerate(headings):
        title=_ff105_plain_text(h.group(2))
        if not title or len(title)>90 or not _ff105_campaign_family_ok(title,material):
            continue
        end=headings[i+1].start() if i+1<len(headings) else min(len(html),h.end()+9000)
        segment=(html or '')[h.end():end]
        plain=_ff105_promo_search_text(segment)
        four=re.search(r'4\s*bobine\s*\|?\s*(?:media\s*)?€?\s*([0-9]+(?:[.,][0-9]{1,2})?)\s*€?\s*/\s*bobina',plain,re.I)
        ten=re.search(r'10\s*bobine\s*\|?\s*(?:media\s*)?€?\s*([0-9]+(?:[.,][0-9]{1,2})?)\s*€?\s*/\s*bobina',plain,re.I)
        if not four and not ten:
            continue
        four_price=float(four.group(1).replace(',','.')) if four else None
        ten_price=float(ten.group(1).replace(',','.')) if ten else None
        if four_price is not None and not (2<four_price<200): four_price=None
        if ten_price is not None and not (2<ten_price<200): ten_price=None
        if four_price is None and ten_price is None: continue

        # Current one-spool campaign price shown before the quantity table. This
        # is informational; exact quantity tiers below drive the Smart Deal total.
        before=(plain[:four.start()] if four else plain[:ten.start()])[:800]
        prices=[]
        for p in re.findall(r'(?:€\s*)?([0-9]+(?:[.,][0-9]{1,2})?)\s*€',before,re.I):
            try:
                value=float(p.replace(',','.'))
                if 2<value<200:prices.append(value)
            except Exception: pass
        single=prices[0] if prices else None
        if single is None:
            if four_price is not None: single=round(four_price/0.70,2)
            elif ten_price is not None: single=round(ten_price/0.60,2)
        if single is None or not (2<single<300): continue

        key=normalize_text_key(title)
        if key in seen: continue
        seen.add(key)
        tiers=[]
        if four_price is not None:
            tiers.append({'kind':'perkg','min_qty':4,'unit_price_perkg':four_price,'verified':True,'label':f'4 bobine · {four_price:.2f} €/bobina'})
        if ten_price is not None:
            tiers.append({'kind':'perkg','min_qty':10,'unit_price_perkg':ten_price,'verified':True,'label':f'10 bobine · {ten_price:.2f} €/bobina'})
        rows.append({
            'source_id':'sunlu','store':'SUNLU Italia','source_kind':'official','brand':'SUNLU',
            'product':title,'variant':'Campagna ufficiale 4/10 bobine','color':'Colori selezionabili',
            'format':'Offerta quantità','size':'1 kg per bobina','weight_kg':1.0,
            'price':round(single,2),'currency':'EUR','available':True,'url':FF105_SUNLU_DEALS_URL,
            'shipping':'Calcolata al checkout','note':'campagna ufficiale SUNLU · pagina Offerte speciali',
            'promo_tiers':tiers,'promotion_verified':True,'promo_page_checked':True,
            'promo_source':'SUNLU Offerte speciali','promo_url':FF105_SUNLU_DEALS_URL,
            'priority':24
        })
    return rows


def _ff105_sunlu_campaign_offers(material):
    try:
        html,_,_=fetch(FF105_SUNLU_DEALS_URL)
        return _ff105_parse_sunlu_campaigns(html,material)
    except Exception:
        return []
'''


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit('usage: patch_runtime_v105_sunlu_campaigns.py <runtime-dir>')
    out=Path(sys.argv[1]).resolve()
    server_path=out/'server.py'
    if not server_path.is_file(): raise RuntimeError(f'server.py missing: {server_path}')
    server=server_path.read_text(encoding='utf-8')

    collect_marker='def _collect_source(source, material, brand, qty):'
    if 'def _ff105_sunlu_campaign_offers(material):' not in server:
        if collect_marker not in server: raise RuntimeError('10.5 SUNLU campaign insertion marker missing')
        server=server.replace(collect_marker,SUNLU_CAMPAIGN_CODE+'\n\n'+collect_marker,1)

    dispatch_marker="""        if source.get('kind')=='official' or source.get('id')=='sunlu':
            offers=_ff105_enrich_official_promotions(source,offers)

        if source['kind'] in ('reseller','marketplace') and brand and brand.lower() not in ('all','tutte le marche'):
"""
    dispatch_replacement="""        if source.get('kind')=='official' or source.get('id')=='sunlu':
            offers=_ff105_enrich_official_promotions(source,offers)
        if source.get('id')=='sunlu':
            offers.extend(_ff105_sunlu_campaign_offers(material))

        if source['kind'] in ('reseller','marketplace') and brand and brand.lower() not in ('all','tutte le marche'):
"""
    if dispatch_replacement not in server:
        if dispatch_marker not in server: raise RuntimeError('10.5 SUNLU campaign dispatch marker missing')
        server=server.replace(dispatch_marker,dispatch_replacement,1)

    compile(server,'server.py','exec')
    if 'FF105_SUNLU_DEALS_URL' not in server or 'offers.extend(_ff105_sunlu_campaign_offers(material))' not in server:
        raise RuntimeError('10.5 SUNLU campaign feed validation failed')
    server_path.write_text(server,encoding='utf-8')
    print('Filament Finder 10.5 SUNLU official campaign feed: OK',flush=True)


if __name__=='__main__':
    main()
