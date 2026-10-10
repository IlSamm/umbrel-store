from __future__ import annotations

import sys
from pathlib import Path


PROMO_SEARCH_HELPER = r'''
def _ff105_decode_embedded_text(value):
    value=str(value or '')
    def repl(match):
        try:
            return chr(int(match.group(1),16))
        except Exception:
            return match.group(0)
    value=re.sub(r'\\u([0-9a-fA-F]{4})',repl,value)
    value=value.replace('\\/','/').replace('\\"','"').replace("\\'", "'")
    return value


def _ff105_promo_search_text(html):
    # Keep normal visible text, but also inspect embedded storefront JSON/scripts.
    # Shopify discount widgets often hydrate quantity tiers from script payloads;
    # executing that JavaScript is unnecessary and unsafe, we only normalize the
    # inert text and run the same conservative discount regexes over it.
    plain=_ff105_plain_text(html)
    raw=htmlmod.unescape(str(html or ''))
    raw=_ff105_decode_embedded_text(raw)
    embedded=re.sub(r'<[^>]+>', ' ', raw)
    embedded=SPACE_RE.sub(' ', embedded).strip()
    return SPACE_RE.sub(' ', plain+' '+embedded).strip()
'''


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: patch_runtime_v105_embedded_promos.py <runtime-dir>")

    out=Path(sys.argv[1]).resolve()
    server_path=out/'server.py'
    if not server_path.is_file():
        raise RuntimeError(f"server.py missing: {server_path}")
    server=server_path.read_text(encoding='utf-8')

    parse_marker="def _ff105_parse_promotions(html):\n    text=_ff105_plain_text(html)"
    parse_replacement="def _ff105_parse_promotions(html):\n    text=_ff105_promo_search_text(html)"
    if parse_replacement not in server:
        if parse_marker not in server:
            raise RuntimeError('10.5 embedded-promo parse marker missing')
        helper_marker='def _ff105_parse_promotions(html):'
        server=server.replace(helper_marker,PROMO_SEARCH_HELPER+'\n\n'+helper_marker,1)
        server=server.replace(parse_marker,parse_replacement,1)

    compile(server,'server.py','exec')
    if 'def _ff105_promo_search_text(html):' not in server:
        raise RuntimeError('10.5 embedded promo helper missing')
    if parse_replacement not in server:
        raise RuntimeError('10.5 promo parser is not using embedded text')
    server_path.write_text(server,encoding='utf-8')
    print('Filament Finder 10.5 embedded storefront promotion patch: OK',flush=True)


if __name__=='__main__':
    main()
