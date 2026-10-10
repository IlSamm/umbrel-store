from __future__ import annotations

import sys
from pathlib import Path


OFFICIAL_PROMO_CODE = r'''
def _ff105_enrich_official_promotions(source, offers):
    """Enrich direct-brand store offers regardless of their scraper engine.

    Some brand stores (notably SUNLU) are currently handled by the generic
    connector even though their product pages expose structured quantity deals.
    Fetch a bounded set of product pages concurrently so those discounts can be
    compared without serially stalling the whole marketplace.
    """
    direct_brand = source.get('kind') == 'official' or source.get('id') == 'sunlu'
    if not offers or not direct_brand:
        return offers

    # Prefer cheaper offers because they are the most likely candidates for the
    # best-total ranking. Skip URLs already checked by the Shopify path.
    checked={str(o.get('url') or '').split('?',1)[0] for o in offers if o.get('promo_page_checked')}
    urls=[]
    for offer in sorted(offers,key=lambda o:float(o.get('price') or 1e9)):
        url=str(offer.get('url') or '').split('?',1)[0]
        if not url or url in checked or url in urls:
            continue
        urls.append(url)
        if len(urls)>=8:
            break
    if not urls:
        return offers

    def read_one(url):
        try:
            html,_,_=fetch(url)
            return url,_ff105_parse_promotions(html)
        except Exception:
            return url,{'tiers':[],'promo_code':None,'promo_code_discount_pct':None,'free_shipping_threshold':None,'promo_text':''}

    metadata={}
    workers=max(1,min(4,len(urls)))
    with ThreadPoolExecutor(max_workers=workers,thread_name_prefix='promo-page') as pool:
        futures=[pool.submit(read_one,url) for url in urls]
        for future in futures:
            try:
                url,meta=future.result()
                metadata[url]=meta
            except Exception:
                pass

    for offer in offers:
        url=str(offer.get('url') or '').split('?',1)[0]
        meta=metadata.get(url)
        if not meta:
            continue
        if meta.get('tiers'):
            offer['promo_tiers']=meta['tiers']
            offer['promotion_verified']=True
        if meta.get('promo_code'):
            offer['promo_code']=meta['promo_code']
            offer['promo_code_discount_pct']=meta.get('promo_code_discount_pct')
            offer['promo_code_required']=True
        if meta.get('free_shipping_threshold') is not None:
            offer['free_shipping_threshold']=meta['free_shipping_threshold']
        if meta.get('promo_text'):
            offer['promo_text']=meta['promo_text']
        offer['promo_page_checked']=True
    return offers
'''


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: patch_runtime_v105_official_promos.py <runtime-dir>")

    out = Path(sys.argv[1]).resolve()
    server_path = out / "server.py"
    if not server_path.is_file():
        raise RuntimeError(f"server.py missing: {server_path}")

    server = server_path.read_text(encoding="utf-8")

    collect_marker = "def _collect_source(source, material, brand, qty):"
    if "def _ff105_enrich_official_promotions(source, offers):" not in server:
        if collect_marker not in server:
            raise RuntimeError("10.5 official-promo _collect_source marker missing")
        server = server.replace(collect_marker, OFFICIAL_PROMO_CODE + "\n\n" + collect_marker, 1)

    dispatch_old = """        elif source['engine']=='amazon': offers=amazon_scrape(source,q)
        else: offers=generic_scrape(source,q)

        if source['kind'] in ('reseller','marketplace') and brand and brand.lower() not in ('all','tutte le marche'):
"""
    dispatch_new = """        elif source['engine']=='amazon': offers=amazon_scrape(source,q)
        else: offers=generic_scrape(source,q)

        # Quantity deals are a property of the product page, not of the scraper
        # implementation. SUNLU is explicitly included because its current
        # source is not tagged as official in every runtime configuration.
        if source.get('kind')=='official' or source.get('id')=='sunlu':
            offers=_ff105_enrich_official_promotions(source,offers)

        if source['kind'] in ('reseller','marketplace') and brand and brand.lower() not in ('all','tutte le marche'):
"""
    if dispatch_new not in server:
        if dispatch_old not in server:
            raise RuntimeError("10.5 official-promo dispatch marker missing")
        server = server.replace(dispatch_old, dispatch_new, 1)

    compile(server, "server.py", "exec")
    if "source.get('id')=='sunlu'" not in server or "_ff105_enrich_official_promotions(source,offers)" not in server:
        raise RuntimeError("10.5 SUNLU promotion dispatch missing")
    if "thread_name_prefix='promo-page'" not in server:
        raise RuntimeError("10.5 concurrent promotion reader missing")

    server_path.write_text(server, encoding="utf-8")
    print("Filament Finder 10.5 direct-brand promotion patch: OK", flush=True)


if __name__ == "__main__":
    main()
