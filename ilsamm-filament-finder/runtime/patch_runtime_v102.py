from __future__ import annotations

import re
import sys
from pathlib import Path


BAMBU_CODE = r'''
# Filament Finder 10.2: dedicated Bambu Lab EU connector.
# Bambu's public storefront is now Next.js and no longer exposes classic Shopify
# search/product links reliably. The official EU Shopify backend still exposes
# localized structured product .js payloads with variants, stock and EUR prices.
BAMBU_EU_BACKEND = 'https://bambulab-eu.myshopify.com/it'
BAMBU_EU_PUBLIC = 'https://eu.store.bambulab.com/it'
BAMBU_HANDLES = {
    'PLA_BASIC': ['pla-basic-filament'],
    'PLA_MATTE': ['pla-matte'],
    'PLA_SILK': ['pla-silk-upgrade'],
    'PLA_TRANSLUCENT': ['pla-translucent'],
    'PLA_CF': ['pla-cf'],
    'PLA_WOOD': ['pla-wood'],
    'PLA_MARBLE': ['pla-marble'],
    'PLA_METAL': ['pla-metal'],
    'PLA_SPARKLE': ['pla-sparkle'],
    'PLA_GALAXY': ['pla-galaxy'],
    'PLA_GLOW': ['pla-glow'],
    'PLA_AERO': ['pla-aero'],
    'PLA_GRADIENT': ['pla-basic-gradient'],
    'PETG_HF': ['petg-hf'],
    'PETG_TRANSLUCENT': ['petg-translucent'],
    'PETG_CF': ['petg-cf'],
    'ABS': ['abs-filament'],
    'ASA': ['asa-filament'],
    'ASA_CF': ['asa-cf'],
    'ASA_AERO': ['asa-aero'],
    'PC': ['pc-filament'],
    'TPU_95A': ['tpu-95a-hf'],
    'TPU_AMS': ['tpu-for-ams'],
    'PA6_CF': ['pa6-cf'],
    'PAHT_CF': ['paht-cf'],
    'PET_CF': ['pet-cf'],
    'PPA_CF': ['ppa-cf'],
    'PPS_CF': ['pps-cf'],
}


def bambu_handles_for_query(query):
    q=normalize_text_key(query).upper().replace('-', ' ').replace('_', ' ')
    def has(*parts): return all(p in q for p in parts)
    if 'PETG' in q:
        if 'CF' in q: return BAMBU_HANDLES['PETG_CF']
        if 'TRANSLUCENT' in q or 'TRASPARENT' in q: return BAMBU_HANDLES['PETG_TRANSLUCENT']
        return BAMBU_HANDLES['PETG_HF'] + BAMBU_HANDLES['PETG_TRANSLUCENT'] + BAMBU_HANDLES['PETG_CF']
    if re.search(r'\bPLA\b', q):
        if 'MATTE' in q: return BAMBU_HANDLES['PLA_MATTE']
        if 'SILK' in q: return BAMBU_HANDLES['PLA_SILK']
        if 'TRANSLUCENT' in q or 'TRASPARENT' in q: return BAMBU_HANDLES['PLA_TRANSLUCENT']
        if 'CF' in q: return BAMBU_HANDLES['PLA_CF']
        if 'WOOD' in q or 'LEGNO' in q: return BAMBU_HANDLES['PLA_WOOD']
        if 'MARBLE' in q or 'MARMO' in q: return BAMBU_HANDLES['PLA_MARBLE']
        if 'METAL' in q: return BAMBU_HANDLES['PLA_METAL']
        if 'SPARKLE' in q: return BAMBU_HANDLES['PLA_SPARKLE']
        if 'GALAXY' in q: return BAMBU_HANDLES['PLA_GALAXY']
        if 'GLOW' in q: return BAMBU_HANDLES['PLA_GLOW']
        if 'AERO' in q or 'LIGHTWEIGHT' in q or 'LW PLA' in q: return BAMBU_HANDLES['PLA_AERO']
        if 'GRADIENT' in q: return BAMBU_HANDLES['PLA_GRADIENT']
        # Keep the broad PLA lookup bounded so one official source cannot consume
        # the whole price-search budget. These cover the major Bambu PLA families.
        return (BAMBU_HANDLES['PLA_BASIC'] + BAMBU_HANDLES['PLA_MATTE'] +
                BAMBU_HANDLES['PLA_SILK'] + BAMBU_HANDLES['PLA_TRANSLUCENT'] +
                BAMBU_HANDLES['PLA_CF'])
    if re.search(r'\bABS\b', q): return BAMBU_HANDLES['ABS']
    if re.search(r'\bASA\b', q):
        if 'CF' in q: return BAMBU_HANDLES['ASA_CF']
        if 'AERO' in q: return BAMBU_HANDLES['ASA_AERO']
        return BAMBU_HANDLES['ASA'] + BAMBU_HANDLES['ASA_CF']
    if re.search(r'\bPC\b', q) or 'POLYCARB' in q: return BAMBU_HANDLES['PC']
    if 'TPU' in q:
        if 'AMS' in q: return BAMBU_HANDLES['TPU_AMS']
        return BAMBU_HANDLES['TPU_95A'] + BAMBU_HANDLES['TPU_AMS']
    if 'PA6' in q and 'CF' in q: return BAMBU_HANDLES['PA6_CF']
    if 'PAHT' in q and 'CF' in q: return BAMBU_HANDLES['PAHT_CF']
    if re.search(r'\bPET\b', q) and 'CF' in q: return BAMBU_HANDLES['PET_CF']
    if 'PPA' in q and 'CF' in q: return BAMBU_HANDLES['PPA_CF']
    if 'PPS' in q and 'CF' in q: return BAMBU_HANDLES['PPS_CF']
    return []


def scrape_bambu_eu(source, query):
    handles=bambu_handles_for_query(query)
    if not handles:
        return []
    backend=dict(source)
    backend['base']=BAMBU_EU_BACKEND
    offers=[]
    attempted=0
    for handle in handles:
        attempted += 1
        product_url=f'{BAMBU_EU_BACKEND}/products/{handle}'
        try:
            rows=shopify_product_variants(backend, product_url, query)
        except Exception:
            rows=[]
        for offer in rows:
            old_url=str(offer.get('url') or '')
            variant=''
            m=re.search(r'[?&]variant=([^&#]+)', old_url)
            if m: variant='?variant='+m.group(1)
            offer['url']=f'{BAMBU_EU_PUBLIC}/products/{handle}{variant}'
            offer['store']='Bambu Lab EU'
            offer['brand']='Bambu Lab'
            offer['source_id']='bambu'
            offer['source_kind']='official'
            offer['note']='catalogo ufficiale Bambu Lab EU'
        offers.extend(rows)
        if len(offers) >= 160:
            break
    if attempted and not offers:
        # Do not report a false green "OK / 0" when a known Bambu product family
        # could not be read (rate limit, endpoint change, network failure, etc.).
        raise RuntimeError('Catalogo Bambu Lab EU non disponibile o senza varianti leggibili')
    return offers
'''


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit('usage: patch_runtime_v102.py <runtime-dir>')
    root=Path(sys.argv[1])
    server_path=root/'server.py'
    text=server_path.read_text(encoding='utf-8')

    insert_marker='def scrape_shopify(source, query):'
    if 'def scrape_bambu_eu(source, query):' not in text:
        if insert_marker not in text:
            raise RuntimeError('scrape_shopify marker missing')
        text=text.replace(insert_marker, BAMBU_CODE+'\n\n'+insert_marker, 1)

    old="if source['engine']=='shopify': offers=scrape_shopify(source,q)"
    new="if source.get('id')=='bambu': offers=scrape_bambu_eu(source,q)\n        elif source['engine']=='shopify': offers=scrape_shopify(source,q)"
    if new not in text:
        if old not in text:
            raise RuntimeError('_collect_source Shopify dispatch marker missing')
        text=text.replace(old,new,1)

    compile(text,'server.py','exec')
    if 'BAMBU_EU_BACKEND' not in text or "source.get('id')=='bambu'" not in text:
        raise RuntimeError('Bambu 10.2 patch validation failed')
    server_path.write_text(text,encoding='utf-8')
    print('Patched server.py with Bambu Lab EU connector')


if __name__=='__main__':
    main()
