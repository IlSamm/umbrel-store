from __future__ import annotations

import shutil
import sys
from pathlib import Path

APP_VERSION = "10.7.0"
JS_ASSET = "v107-source-diagnostics.js"
CSS_ASSET = "v107-source-diagnostics.css"

TELEMETRY_CODE = r'''
# Filament Finder 10.7: per-source HTTP diagnostics.
# Telemetry is thread-local because marketplace sources run concurrently.
import threading as _ff107_threading
import time as _ff107_time
import urllib.request as _ff107_urllib_request

_ff107_tls = _ff107_threading.local()
_ff107_original_fetch = fetch
_ff107_original_urlopen = globals().get('urlopen')
_ff107_original_module_urlopen = _ff107_urllib_request.urlopen


def _ff107_trim_error(exc):
    if exc is None:
        return None
    text=f'{exc.__class__.__name__}: {exc}'.strip()
    return text[:700]


def _ff107_request_url(value):
    try:
        if hasattr(value,'full_url'):
            return str(value.full_url)
        return str(value)
    except Exception:
        return ''


def _ff107_record_http(url, status=None, elapsed_ms=None, final_url=None, error=None):
    tele=getattr(_ff107_tls,'telemetry',None)
    if not isinstance(tele,dict):
        return
    item={
        'url':str(url or '')[:1800],
        'http_status':int(status) if isinstance(status,(int,float)) and 100<=int(status)<=599 else None,
        'ms':round(float(elapsed_ms),1) if elapsed_ms is not None else None,
        'final_url':str(final_url or '')[:1800] or None,
        'error':str(error or '')[:700] or None,
    }
    tele.setdefault('requests',[]).append(item)
    if not tele.get('request_url') and item['url']:
        tele['request_url']=item['url']
    if tele.get('http_status') is None and item['http_status'] is not None:
        tele['http_status']=item['http_status']
    if tele.get('http_ms') is None and item['ms'] is not None:
        tele['http_ms']=item['ms']
    if not tele.get('final_url') and item['final_url']:
        tele['final_url']=item['final_url']
    if not tele.get('diagnostic_error') and item['error']:
        tele['diagnostic_error']=item['error']


def _ff107_urlopen(*args, **kwargs):
    url=_ff107_request_url(args[0] if args else kwargs.get('url',''))
    started=_ff107_time.perf_counter()
    try:
        response=_ff107_original_module_urlopen(*args,**kwargs)
        elapsed=(_ff107_time.perf_counter()-started)*1000
        status=getattr(response,'status',None)
        if status is None:
            status=getattr(response,'code',None)
        try: final_url=response.geturl()
        except Exception: final_url=url
        _ff107_record_http(url,status,elapsed,final_url,None)
        return response
    except Exception as exc:
        elapsed=(_ff107_time.perf_counter()-started)*1000
        status=getattr(exc,'code',None)
        final_url=getattr(exc,'url',None) or url
        _ff107_record_http(url,status,elapsed,final_url,_ff107_trim_error(exc))
        raise


# Cover both styles used by the runtime: `urlopen(...)` and
# `urllib.request.urlopen(...)`.
if callable(_ff107_original_urlopen):
    urlopen=_ff107_urlopen
_ff107_urllib_request.urlopen=_ff107_urlopen


def _ff107_fetch(url, *args, **kwargs):
    tele=getattr(_ff107_tls,'telemetry',None)
    before=len(tele.get('requests',[])) if isinstance(tele,dict) else 0
    started=_ff107_time.perf_counter()
    try:
        result=_ff107_original_fetch(url,*args,**kwargs)
        if isinstance(tele,dict) and len(tele.get('requests',[]))==before:
            elapsed=(_ff107_time.perf_counter()-started)*1000
            status=None; final_url=None
            if isinstance(result,(tuple,list)):
                for value in result[1:]:
                    if status is None and isinstance(value,(int,float)) and 100<=int(value)<=599:
                        status=int(value)
                    if final_url is None and isinstance(value,str) and value.startswith(('http://','https://')):
                        final_url=value
            _ff107_record_http(url,status,elapsed,final_url,None)
        return result
    except Exception as exc:
        if isinstance(tele,dict) and len(tele.get('requests',[]))==before:
            elapsed=(_ff107_time.perf_counter()-started)*1000
            _ff107_record_http(url,getattr(exc,'code',None),elapsed,getattr(exc,'url',None),_ff107_trim_error(exc))
        raise


fetch=_ff107_fetch
_ff107_original_collect_source=_collect_source


def _ff107_attach_diagnostics(obj, source, tele):
    sid=str(source.get('id') or '')
    attached=False
    def walk(value):
        nonlocal attached
        if isinstance(value,dict):
            value_sid=str(value.get('id') or value.get('source_id') or '')
            looks_status=('results' in value and ('ok' in value or 'error' in value or 'error_message' in value))
            if looks_status and (not value_sid or value_sid==sid):
                value['request_url']=tele.get('request_url')
                value['final_url']=tele.get('final_url')
                value['http_status']=tele.get('http_status')
                value['http_ms']=tele.get('http_ms')
                value['request_count']=len(tele.get('requests') or [])
                # Keep the backend's precise source error when it exists; otherwise
                # use the exception captured at the HTTP boundary.
                raw=value.get('error_message') or value.get('error') or tele.get('diagnostic_error')
                value['diagnostic_error']=str(raw)[:700] if raw else None
                value['request_trace']=(tele.get('requests') or [])[:12]
                attached=True
            for child in list(value.values()):
                if isinstance(child,(dict,list,tuple)):
                    walk(child)
        elif isinstance(value,(list,tuple)):
            for child in value:
                walk(child)
    walk(obj)
    return attached


def _ff107_collect_source(source, material, brand, qty):
    tele={
        'source_id':str(source.get('id') or ''),
        'request_url':None,'final_url':None,'http_status':None,'http_ms':None,
        'diagnostic_error':None,'requests':[]
    }
    _ff107_tls.telemetry=tele
    started=_ff107_time.perf_counter()
    try:
        result=_ff107_original_collect_source(source,material,brand,qty)
        _ff107_attach_diagnostics(result,source,tele)
        return result
    except Exception as exc:
        tele['diagnostic_error']=tele.get('diagnostic_error') or _ff107_trim_error(exc)
        raise
    finally:
        tele['source_elapsed_ms']=round((_ff107_time.perf_counter()-started)*1000,1)
        _ff107_tls.telemetry=None


_collect_source=_ff107_collect_source
'''


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: patch_runtime_v107.py <app-store-root> <runtime-dir>")

    root=Path(sys.argv[1]).resolve()
    out=Path(sys.argv[2]).resolve()
    app_root=root/'ilsamm-filament-finder'
    server_path=out/'server.py'
    if not server_path.is_file():
        raise RuntimeError(f"server.py missing: {server_path}")

    js_source=app_root/'ui-v107'/'source-diagnostics.js'
    css_source=app_root/'ui-v107'/'source-diagnostics.css'
    if not js_source.is_file() or not css_source.is_file():
        raise RuntimeError('10.7 source diagnostic assets missing')
    shutil.copyfile(js_source,out/JS_ASSET)
    shutil.copyfile(css_source,out/CSS_ASSET)

    server=server_path.read_text(encoding='utf-8')
    marker='class Handler'
    if '_ff107_collect_source' not in server:
        pos=server.find(marker)
        if pos<0:
            raise RuntimeError('10.7 Handler insertion marker missing')
        server=server[:pos]+TELEMETRY_CODE+'\n\n'+server[pos:]

    old="APP_VERSION = '10.6.0'"
    new=f"APP_VERSION = '{APP_VERSION}'"
    if new not in server:
        if old not in server:
            raise RuntimeError('10.7 backend version marker missing')
        server=server.replace(old,new,1)
    compile(server,'server.py','exec')
    server_path.write_text(server,encoding='utf-8')

    index_path=out/'index.html'
    index=index_path.read_text(encoding='utf-8')
    css_marker='<link rel="stylesheet" href="v106-source-status.css?v=1060">'
    css_tag=f'<link rel="stylesheet" href="{CSS_ASSET}?v=1070">'
    if css_tag not in index:
        if css_marker not in index: raise RuntimeError('10.7 CSS marker missing')
        index=index.replace(css_marker,css_marker+'\n  '+css_tag,1)
    js_marker='<script src="v106-source-status.js?v=1060"></script>'
    js_tag=f'<script src="{JS_ASSET}?v=1070"></script>'
    if js_tag not in index:
        if js_marker not in index: raise RuntimeError('10.7 JS marker missing')
        index=index.replace(js_marker,js_marker+'\n'+js_tag,1)
    index_path.write_text(index,encoding='utf-8')

    js=(out/JS_ASSET).read_text(encoding='utf-8')
    css=(out/CSS_ASSET).read_text(encoding='utf-8')
    for token in ('FF107_SOURCE_DIAGNOSTICS_VERSION','FF107_RETRY_SOURCE','request_url','http_status','Riprova fonte'):
        if token not in js: raise RuntimeError(f'10.7 JS marker missing: {token}')
    if '.ff107-retry' not in css or '.ff107-diagnostic-grid' not in css:
        raise RuntimeError('10.7 CSS validation failed')
    if '_ff107_urlopen' not in server or "APP_VERSION = '10.7.0'" not in server:
        raise RuntimeError('10.7 backend telemetry validation failed')
    print('Filament Finder 10.7 source diagnostics patch: OK',flush=True)


if __name__=='__main__':
    main()
