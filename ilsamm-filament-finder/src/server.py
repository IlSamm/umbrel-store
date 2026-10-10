from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs, quote, urljoin, unquote
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
import json, re, time, os, html as htmlmod, threading, uuid, tempfile, math
from catalog_tools import price_number, weight_kg, material_matches, structured_offers
from concurrent.futures import ThreadPoolExecutor, wait

APP_VERSION = '11.0.0'
STATIC_MATERIAL_COUNT = 67
STATIC_BRAND_COUNT = 18
PORT = int(os.getenv('FILAMENT_FINDER_PORT', '8765'))
CACHE = {}
CACHE_LOCK = threading.RLock()
CURRENCY_CACHE = {}
SEARCH_SLOTS = threading.BoundedSemaphore(3)
CACHE_TTL = int(os.getenv('FILAMENT_FINDER_CACHE_TTL', '900'))  # seconds
FETCH_TIMEOUT = float(os.getenv('FILAMENT_FINDER_FETCH_TIMEOUT', '6'))
PRICE_SEARCH_BUDGET = float(os.getenv('FILAMENT_FINDER_PRICE_SEARCH_BUDGET', '18'))
PRICE_SEARCH_WORKERS = max(1, min(16, int(os.getenv('FILAMENT_FINDER_PRICE_SEARCH_WORKERS', '8'))))
SOURCE_POOL = ThreadPoolExecutor(max_workers=PRICE_SEARCH_WORKERS, thread_name_prefix='price-source')
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36'

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WEB_DIR = os.path.join(BASE_DIR, 'web')
DATA_DIR = os.getenv('FILAMENT_FINDER_DATA_DIR', os.path.join(BASE_DIR, 'data'))
ALERTS_FILE = os.path.join(DATA_DIR, 'alerts.json')
HISTORY_FILE = os.path.join(DATA_DIR, 'history.json')
EVENTS_FILE = os.path.join(DATA_DIR, 'alert_events.json')
MONITOR_INTERVAL = int(os.getenv('FILAMENT_FINDER_MONITOR_INTERVAL', str(15 * 60)))
HISTORY_LIMIT_PER_VARIANT = 3000
EVENT_LIMIT = 1000
DATA_LOCK = threading.RLock()
MONITOR_LOCK = threading.Lock()
MONITOR_WAKE = threading.Event()

SOURCES = [
    {
        'id':'bambu','store':'Bambu Lab EU','brand':'Bambu Lab','kind':'official','engine':'shopify',
        'base':'https://eu.store.bambulab.com','search':'https://eu.store.bambulab.com/search?q={q}&type=product',
        'priority':10,'shipping':{'type':'checkout','label':'Calcolata al checkout'}
    },
    {
        'id':'sunlu','store':'SUNLU Italia','brand':'SUNLU','kind':'official','engine':'shopify',
        'base':'https://it.store.sunlu.com','search':'https://it.store.sunlu.com/search?q={q}&type=product',
        'priority':10,'shipping':{'type':'checkout','label':'Calcolata al checkout'}
    },
    {
        'id':'polymaker','store':'Polymaker EU','brand':'Polymaker','kind':'official','engine':'shopify',
        'base':'https://shop.polymaker.com/en-eu','search':'https://shop.polymaker.com/en-eu/search?q={q}&type=product',
        'priority':10,'shipping':{'type':'checkout','label':'Calcolata al checkout'}
    },
    {
        'id':'esun','store':'eSUN EU','brand':'eSUN','kind':'official','engine':'generic',
        'base':'https://eu.esun3dstore.com','search':'https://eu.esun3dstore.com/search?q={q}',
        'priority':10,'shipping':{'type':'checkout','label':'Calcolata al checkout'}
    },
    {
        'id':'amazon-it','store':'Amazon Italia','brand':None,'kind':'marketplace','engine':'amazon',
        'base':'https://www.amazon.it','search':'https://www.amazon.it/s?k={q}',
        'priority':24,'shipping':{'type':'parsed','label':'Dipende da Prime/venditore/indirizzo'}
    },
    {
        'id':'3djake','store':'3DJake Italia','brand':None,'kind':'reseller','engine':'generic',
        'base':'https://www.3djake.it','search':'https://www.3djake.it/search?keyword={q}',
        'priority':20,'shipping':{'type':'flat_threshold','flat':5.90,'free_from':49.90,'label':'€5,90; gratis da €49,90'}
    },
    {
        'id':'filament2print','store':'Filament2Print','brand':None,'kind':'reseller','engine':'generic',
        'base':'https://filament2print.com/en','search':'https://filament2print.com/en/search?controller=search&s={q}',
        'priority':22,'shipping':{'type':'free_threshold_unknown_below','free_from':99.00,'label':'Gratis UE da €99; sotto soglia al checkout'}
    },
    {
        'id':'3dstoreitalia','store':'3DStoreItalia','brand':None,'kind':'reseller','engine':'shopify',
        'base':'https://www.3dstoreitalia.com','search':'https://www.3dstoreitalia.com/search?q={q}&type=product',
        'priority':22,'shipping':{'type':'checkout','label':'Calcolata al checkout'}
    },
    {
        'id':'azurefilm','store':'AzureFilm EU','brand':'AzureFilm','kind':'official','engine':'generic',
        'base':'https://azurefilm.com/it','search':'https://azurefilm.com/it/?s={q}&post_type=product',
        'priority':12,'shipping':{'type':'checkout','label':'Calcolata al checkout'}
    },
    {
        'id':'formfutura','store':'FormFutura EU','brand':'FormFutura','kind':'official','engine':'generic',
        'base':'https://www.formfutura.com','search':'https://www.formfutura.com/shop?search={q}',
        'priority':12,'shipping':{'type':'checkout','label':'Calcolata al checkout'}
    },
    {
        'id':'3dprima','store':'3D Prima EU','brand':None,'kind':'reseller','engine':'generic',
        'base':'https://www.3dprima.com','search':'https://www.3dprima.com/search?search={q}',
        'priority':18,'shipping':{'type':'free_threshold_unknown_below','free_from':100.00,'label':'Gratis UE oltre €100; sotto soglia al checkout'}
    },
]

PRICE_RE = re.compile(r'(?:€|EUR\s*)\s*([0-9]{1,4}(?:[.,][0-9]{1,2})?)', re.I)
TAG_RE = re.compile(r'<[^>]+>')
LINK_RE = re.compile(r'<a\b[^>]*href=["\']([^"\']+)["\'][^>]*>(.*?)</a>', re.I|re.S)
PRODUCT_LINK_RE = re.compile(r'href=["\']([^"\']*/products/[^"\'#?]+(?:\?[^"\']*)?)["\']', re.I)
SPACE_RE = re.compile(r'\s+')
WEIGHT_RE = re.compile(r'(?<!\d)(\d+(?:[.,]\d+)?)\s*(kg|g)\b', re.I)
COLOR_LABELS = {'color','colour','colore','farbe','couleur','kleur','cor','kolor'}
TYPE_LABELS = {'type','tipo','typ','format','spool','bobina','carrete','refill'}
SIZE_LABELS = {'size','dimensione','weight','peso','gewicht','taille','poids'}
OUT_WORDS = ('sold out','out of stock','esaurito','non disponibile','unavailable','épuisé','agotado')
IN_WORDS = ('in stock','disponibile','available','auf lager','en stock')

COMMON_COLORS = {
    'black':['black','nero','schwarz','noir'],
    'white':['white','bianco','weiss','weiß','blanc'],
    'gray':['gray','grey','grigio','grau','gris'],
    'red':['red','rosso','rot','rouge'],
    'blue':['blue','blu','blau','bleu'],
    'green':['green','verde','grün','gruen','vert'],
    'yellow':['yellow','giallo','gelb','jaune'],
    'orange':['orange','arancio','arancione'],
    'purple':['purple','violet','viola','lila'],
    'pink':['pink','rosa'],
    'brown':['brown','marrone','braun','brun'],
    'beige':['beige'],
    'gold':['gold','oro'],
    'silver':['silver','argento'],
    'transparent':['transparent','clear','trasparente','natural']
}
FORMAT_WORDS = {
    'refill':['refill','ricarica','spoolless'],
    'spool':['spool','bobina','reel','with spool','con bobina']
}


MATERIAL_ALIASES = {
    'pla':'PLA', 'pla+ / tough pla':'PLA Plus', 'pla matte':'PLA Matte', 'pla silk':'PLA Silk',
    'pla wood':'Wood PLA', 'pla-cf':'PLA CF', 'petg':'PETG', 'pctg':'PCTG', 'petg-cf':'PETG CF',
    'tpu 95a':'TPU 95A', 'tpu 85a / tpe':'TPU 85A', 'abs':'ABS', 'asa':'ASA',
    'pc / policarbonato':'PC', 'pa / nylon':'Nylon PA', 'pa6-cf / paht-cf':'PA CF',
    'pet-cf':'PET CF', 'ppa-cf':'PPA CF', 'pps-cf':'PPS CF', 'pp / polipropilene':'PP',
    'pva':'PVA', 'hips':'HIPS', 'support for pla/petg':'Support PLA PETG',
    'pla metal-filled':'Metal PLA', 'glow in the dark':'Glow PLA',
    'rpla / pla riciclato':'rPLA', 'htpla / pla annealable':'HTPLA', 'lw-pla / pla espandente':'LW PLA',
    'pla marble / stone':'Marble PLA', 'pla glitter / sparkle':'Glitter PLA', 'pla-gf':'PLA GF',
    'pla conduttivo':'Conductive PLA', 'pla esd':'ESD PLA', 'petg high flow / high speed':'PETG',
    'petg traslucido / clear':'PETG transparent', 'petg-gf':'PETG GF', 'petg esd':'PETG ESD',
    'pet':'PET filament', 'pvb':'PVB', 'tpu 98a':'TPU 98A', 'tpu 90a':'TPU 90A',
    'tpc / copoliestere elastomerico':'TPC flexible', 'abs+ / easy abs':'ABS Plus', 'abs-gf':'ABS GF',
    'asa-cf':'ASA CF', 'asa-gf':'ASA GF', 'pc-abs':'PC ABS', 'pc-cf':'PC CF',
    'pc-fr / flame retardant':'PC FR', 'pa6 / nylon 6':'PA6 Nylon', 'pa12 / nylon 12':'PA12 Nylon',
    'pa11':'PA11 Nylon', 'pa-gf':'PA GF', 'pa12-cf':'PA12 CF', 'ppa':'PPA', 'pps':'PPS',
    'pps-gf':'PPS GF', 'pp-gf':'PP GF', 'bvoh':'BVOH', 'support for pa / engineering':'support PA',
    'cpe / co-polyester':'CPE', 'pmma / acrylic':'PMMA', 'pom / acetal':'POM',
    'pei / ultem':'PEI ULTEM', 'peek':'PEEK', 'pekk':'PEKK', 'ppsu':'PPSU'
}



def _ensure_data_dir():
    os.makedirs(DATA_DIR, exist_ok=True)


def _read_json_file(path, default):
    _ensure_data_dir()
    try:
        with open(path, 'r', encoding='utf-8') as f:
            value=json.load(f)
            return value
    except FileNotFoundError:
        return default


def _write_json_file(path, value):
    _ensure_data_dir()
    directory=os.path.dirname(path)
    fd,tmp=tempfile.mkstemp(prefix='.ff_',suffix='.json.tmp',dir=directory)
    try:
        with os.fdopen(fd,'w',encoding='utf-8') as f:
            json.dump(value,f,ensure_ascii=False,indent=2)
        os.replace(tmp,path)
    finally:
        try:
            if os.path.exists(tmp): os.unlink(tmp)
        except Exception:
            pass


def load_alerts():
    with DATA_LOCK:
        data=_read_json_file(ALERTS_FILE, [])
        return data if isinstance(data,list) else []


def save_alerts(alerts):
    with DATA_LOCK:
        _write_json_file(ALERTS_FILE, alerts)


def load_events():
    with DATA_LOCK:
        data=_read_json_file(EVENTS_FILE, [])
        return data if isinstance(data,list) else []


def save_events(events):
    with DATA_LOCK:
        _write_json_file(EVENTS_FILE, events[-EVENT_LIMIT:])


def load_history_all():
    with DATA_LOCK:
        data=_read_json_file(HISTORY_FILE, {})
        return data if isinstance(data,dict) else {}


def save_history_all(history):
    with DATA_LOCK:
        _write_json_file(HISTORY_FILE, history)


def iso_now():
    return time.strftime('%Y-%m-%dT%H:%M:%S%z')


def group_snapshot(group, material=None, brand='all', qty=1, ts=None):
    offers=group.get('offers') or []
    available_any=any(o.get('available') is True for o in offers)
    known=[o for o in offers if o.get('available') is True and o.get('final_total') is not None]
    best_final=min(known,key=lambda o:o.get('final_total',1e18)) if known else None
    product_known=[o for o in offers if o.get('available') is True and o.get('price') is not None]
    best_product=min(product_known,key=lambda o:o.get('price',1e18)) if product_known else None
    return {
        'ts':ts or iso_now(),
        'signature':group.get('signature'),
        'material':material or group.get('material'),
        'brand':group.get('brand') or brand,
        'color':group.get('color'),
        'format':group.get('format'),
        'weight_kg':group.get('weight_kg'),
        'stores':group.get('stores',len({o.get('store') for o in offers})),
        'offer_count':len(offers),
        'available_any':available_any,
        'best_product_price':best_product.get('price') if best_product else None,
        'best_product_store':best_product.get('store') if best_product else None,
        'best_product_url':best_product.get('url') if best_product else None,
        'best_final_total':best_final.get('final_total') if best_final else None,
        'best_final_perkg':best_final.get('final_perkg') if best_final else None,
        'best_final_store':best_final.get('store') if best_final else None,
        'best_final_url':best_final.get('url') if best_final else None,
        'quantity':qty
    }


def add_event(events, alert, event_type, title, message, current=None, previous=None):
    event={
        'id':uuid.uuid4().hex,
        'alert_id':alert.get('id'),
        'signature':alert.get('signature'),
        'type':event_type,
        'title':title,
        'message':message,
        'created_at':iso_now(),
        'read':False,
        'label':alert.get('label'),
        'current':current or {},
        'previous':previous or {}
    }
    events.append(event)
    return event


def _pct_change(old,new):
    if old is None or new is None:
        return None
    try:
        old=float(old); new=float(new)
        if old==0:return None
        return ((new-old)/old)*100.0
    except Exception:
        return None


def evaluate_alert(alert, previous, current, events):
    cfg=alert.get('config') or {}
    state=alert.setdefault('state',{})
    if not alert.get('enabled',True):
        state.update({
            'last_available':current.get('available_any'),
            'last_product_price':current.get('best_product_price'),
            'last_final_total':current.get('best_final_total')
        })
        return []

    created=[]
    label=alert.get('label') or current.get('material') or 'Filamento'
    current_final=current.get('best_final_total')
    current_product=current.get('best_product_price')
    current_available=current.get('available_any')

    # Maximum delivered total: fire on crossing into the desired range.
    if cfg.get('max_final_enabled') and current_final is not None:
        threshold=float(cfg.get('max_final_value') or 0)
        condition=current_final <= threshold
        old_condition=state.get('max_final_condition')
        if condition and old_condition is not True:
            created.append(add_event(
                events,alert,'max_final',
                f'Prezzo obiettivo raggiunto: {label}',
                f'Totale consegnato €{current_final:.2f}, sotto la soglia di €{threshold:.2f}.',
                current,previous
            ))
        state['max_final_condition']=condition

    # Product price drop between observations.
    old_product=state.get('last_product_price')
    if old_product is None and previous:
        old_product=previous.get('best_product_price')
    if cfg.get('drop_enabled') and old_product is not None and current_product is not None:
        change=_pct_change(old_product,current_product)
        threshold=float(cfg.get('drop_pct') or 0)
        if change is not None and change <= -abs(threshold):
            created.append(add_event(
                events,alert,'price_drop',
                f'Ribasso {abs(change):.1f}%: {label}',
                f'Miglior prezzo prodotto da €{float(old_product):.2f} a €{float(current_product):.2f}.',
                current,previous
            ))

    # Back in stock transition.
    old_available=state.get('last_available')
    if old_available is None and previous:
        old_available=previous.get('available_any')
    if cfg.get('back_in_stock') and old_available is False and current_available is True:
        created.append(add_event(
            events,alert,'back_in_stock',
            f'Di nuovo disponibile: {label}',
            'Almeno un’offerta della variante deduplicata è tornata disponibile.',
            current,previous
        ))

    # Delivered total cost variation in either direction.
    old_final=state.get('last_final_total')
    if old_final is None and previous:
        old_final=previous.get('best_final_total')
    if cfg.get('final_change_enabled') and old_final is not None and current_final is not None:
        change=_pct_change(old_final,current_final)
        threshold=float(cfg.get('final_change_pct') or 0)
        if change is not None and abs(change) >= abs(threshold):
            direction='sceso' if change<0 else 'salito'
            created.append(add_event(
                events,alert,'final_change',
                f'Costo finale {direction} del {abs(change):.1f}%: {label}',
                f'Totale consegnato da €{float(old_final):.2f} a €{float(current_final):.2f}, spedizione inclusa.',
                current,previous
            ))

    state['last_available']=current_available
    state['last_product_price']=current_product
    state['last_final_total']=current_final
    state['last_checked_at']=current.get('ts') or iso_now()
    alert['updated_at']=iso_now()
    return created


def record_groups_and_evaluate(groups, material, brand, qty, ts=None):
    ts=ts or iso_now()
    with DATA_LOCK:
        history=load_history_all()
        alerts=load_alerts()
        events=load_events()
        alert_map={}
        for a in alerts:
            alert_map.setdefault(a.get('signature'),[]).append(a)

        changed=False
        for group in groups:
            sig=group.get('signature')
            if not sig: continue
            snap=group_snapshot(group,material,brand,qty,ts)
            entries=history.setdefault(sig,[])
            previous=next((entry for entry in reversed(entries) if entry.get('quantity',1)==qty),None)

            # Keep every observed snapshot, but avoid exact duplicate writes inside the same minute.
            should_append=True
            if previous:
                comparable=('available_any','best_product_price','best_final_total','best_final_perkg','offer_count','stores')
                same=all(previous.get(k)==snap.get(k) for k in comparable)
                try:
                    prev_min=previous.get('ts','')[:16]
                    now_min=snap.get('ts','')[:16]
                    if same and prev_min==now_min: should_append=False
                except Exception:
                    pass
            if should_append:
                entries.append(snap)
                if len(entries)>HISTORY_LIMIT_PER_VARIANT:
                    history[sig]=entries[-HISTORY_LIMIT_PER_VARIANT:]
                changed=True

            for alert in alert_map.get(sig,[]):
                if int(alert.get('quantity',1)) != qty:
                    continue
                if evaluate_alert(alert,previous,snap,events):
                    changed=True

        if changed:
            save_history_all(history)
            save_alerts(alerts)
            save_events(events)


def get_history(signature, limit=500):
    history=load_history_all()
    entries=history.get(signature,[])
    return entries[-max(1,min(int(limit or 500),HISTORY_LIMIT_PER_VARIANT)):]


def get_alert_payload():
    alerts=load_alerts()
    events=load_events()
    unread=sum(1 for e in events if not e.get('read'))
    tracked=len({a.get('signature') for a in alerts if a.get('enabled',True)})
    return {
        'alerts':alerts,
        'events':list(reversed(events[-250:])),
        'unread_count':unread,
        'tracked_variants':tracked,
        'monitor_interval_seconds':MONITOR_INTERVAL
    }


def upsert_alert(payload):
    validate_alert(payload)
    with DATA_LOCK:
        alerts=load_alerts()
        events=load_events()
        alert_id=payload.get('id')
        signature=payload.get('signature')
        found=None
        if alert_id:
            found=next((a for a in alerts if a.get('id')==alert_id),None)
        if found is None and signature:
            found=next((a for a in alerts if a.get('signature')==signature),None)

        now=iso_now()
        if found is None:
            found={
                'id':uuid.uuid4().hex,
                'created_at':now,
                'enabled':True,
                'state':{}
            }
            alerts.append(found)

        for key in ('signature','material','brand','quantity','label','enabled','config'):
            if key in payload:
                found[key]=payload[key]
        found.setdefault('brand','all')
        found.setdefault('quantity',1)
        found.setdefault('config',{})
        found['updated_at']=now

        current=payload.get('current')
        if isinstance(current,dict):
            # Baseline transition fields without generating historical drop/back-stock noise.
            st=found.setdefault('state',{})
            st['last_available']=current.get('available_any')
            st['last_product_price']=current.get('best_product_price')
            st['last_final_total']=current.get('best_final_total')
            if found.get('config',{}).get('max_final_enabled') and current.get('best_final_total') is not None:
                threshold=float(found['config'].get('max_final_value') or 0)
                condition=float(current['best_final_total']) <= threshold
                st['max_final_condition']=condition
                if condition:
                    add_event(
                        events,found,'max_final',
                        f'Prezzo obiettivo già raggiunto: {found.get("label") or "Filamento"}',
                        f'Totale consegnato €{float(current["best_final_total"]):.2f}, sotto la soglia di €{threshold:.2f}.',
                        current,None
                    )
        save_alerts(alerts)
        save_events(events)
        MONITOR_WAKE.set()
        return found


def delete_alert(alert_id):
    with DATA_LOCK:
        alerts=load_alerts()
        before=len(alerts)
        alerts=[a for a in alerts if a.get('id')!=alert_id]
        save_alerts(alerts)
        return len(alerts)<before


def set_alert_enabled(alert_id, enabled):
    with DATA_LOCK:
        alerts=load_alerts()
        found=None
        for a in alerts:
            if a.get('id')==alert_id:
                a['enabled']=bool(enabled); a['updated_at']=iso_now(); found=a; break
        save_alerts(alerts)
        MONITOR_WAKE.set()
        return found


def mark_events_read(event_ids=None):
    with DATA_LOCK:
        events=load_events()
        ids=set(event_ids or [])
        changed=0
        for e in events:
            if not ids or e.get('id') in ids:
                if not e.get('read'):
                    e['read']=True; changed+=1
        save_events(events)
        return changed


def clear_events():
    save_events([])
    return True


def monitor_tracked_alerts(force=True):
    if not MONITOR_LOCK.acquire(blocking=False):
        return {'running':True,'checked':0}
    try:
        alerts=[a for a in load_alerts() if a.get('enabled',True) and a.get('signature')]
        queries={}
        for a in alerts:
            key=(a.get('material') or 'PLA',a.get('brand') or 'all',int(a.get('quantity') or 1))
            queries[key]=True
        checked=0
        errors=[]
        for material,brand,qty in queries.keys():
            try:
                live_catalog(material,brand,force,qty)
                checked+=1
            except Exception as e:
                errors.append({'material':material,'brand':brand,'error':type(e).__name__})
        return {'running':False,'checked':checked,'errors':errors,'at':iso_now()}
    finally:
        MONITOR_LOCK.release()


def monitor_loop():
    # Short startup delay lets the HTTP server come up first.
    MONITOR_WAKE.wait(20)
    while True:
        try:
            if any(a.get('enabled',True) for a in load_alerts()):
                monitor_tracked_alerts(True)
        except Exception as e:
            print('Monitor alert error:',type(e).__name__,str(e)[:120])
        MONITOR_WAKE.clear()
        MONITOR_WAKE.wait(MONITOR_INTERVAL)


def clean_html(s):
    s = re.sub(r'<script.*?</script>|<style.*?</style>', ' ', s, flags=re.I|re.S)
    s = TAG_RE.sub(' ', s)
    s = htmlmod.unescape(s)
    return SPACE_RE.sub(' ', s).strip()


def parse_price(value):
    return price_number(value)


def normalize_price(value):
    # Shopify .js uses cents as integers; some shops expose string decimal values.
    if value is None: return None
    try:
        if isinstance(value, int): return round(value / 100.0, 2)
        v = float(str(value).replace(',', '.'))
        if v > 500: v /= 100.0
        return round(v, 2)
    except Exception: return None


def weight_kg_from_text(text):
    return weight_kg(text)


def fetch(url, accept='text/html,*/*'):
    started=time.perf_counter()
    req=Request(url, headers={
        'User-Agent':UA,
        'Accept-Language':'it-IT,it;q=0.9,en;q=0.7',
        'Accept':accept,
        'Cache-Control':'no-cache'
    })
    with urlopen(req, timeout=FETCH_TIMEOUT) as r:
        raw=r.read(4_500_000)
        enc=r.headers.get_content_charset() or 'utf-8'
        _ff107_record_http(url, r.status, (time.perf_counter()-started)*1000, r.geturl(), None)
        return raw.decode(enc, errors='ignore'), r.geturl(), r.headers.get('Content-Type','')


def fetch_json(url):
    text, final, ctype = fetch(url, 'application/json,text/javascript,*/*')
    return json.loads(text), final


def require_eur(source):
    base=source['base'].rstrip('/')
    with CACHE_LOCK:
        cached=CURRENCY_CACHE.get(base)
    if cached and time.time()-cached[0] < CACHE_TTL:
        currency=cached[1]
    else:
        cart,_=fetch_json(base+'/cart.js')
        currency=cart.get('currency')
        with CACHE_LOCK:
            CURRENCY_CACHE[base]=(time.time(),currency)
    if currency != 'EUR':
        raise ValueError('Valuta EUR non verificata per questo negozio')


def canonical_product_links(html, base, limit=8):
    seen=[]
    for raw in PRODUCT_LINK_RE.findall(html):
        u=urljoin(base, htmlmod.unescape(raw))
        u=u.split('#')[0].split('?')[0]
        if '/products/' not in u: continue
        if u not in seen: seen.append(u)
        if len(seen)>=limit: break
    return seen


def shopify_js_candidates(product_url, source):
    p=urlparse(product_url)
    path=p.path.rstrip('/')
    cands=[]
    # Use the market whose currency was checked, including its locale prefix.
    m=re.search(r'/products/([^/]+)$', path)
    if m:
        cands.append(source['base'].rstrip('/') + '/products/' + m.group(1) + '.js')
    out=[]
    for x in cands:
        if x not in out: out.append(x)
    return out


def extract_variant_options(product, variant):
    option_names=product.get('options') or []
    # Shopify may return [{name:'Color',...}] rather than ['Color',...]
    normalized=[]
    for x in option_names:
        normalized.append(str(x.get('name','')) if isinstance(x,dict) else str(x))
    vals=[]
    for i in range(1,4):
        v=variant.get(f'option{i}')
        vals.append('' if v is None else str(v))
    mapping={normalized[i].strip().lower(): vals[i] for i in range(min(len(normalized),3))}
    color=None; kind=None; size=None
    for k,v in mapping.items():
        if k in COLOR_LABELS or any(w in k for w in COLOR_LABELS): color=v
        if k in TYPE_LABELS or any(w in k for w in TYPE_LABELS): kind=v
        if k in SIZE_LABELS or any(w in k for w in SIZE_LABELS): size=v
    # Heuristic fallback for Bambu/SUNLU where option labels can vary by locale.
    title=str(variant.get('title') or '')
    parts=[x.strip() for x in title.split(' / ') if x.strip()]
    if not color and parts:
        candidates=[x for x in parts if not WEIGHT_RE.search(x) and not any(z in x.lower() for z in ('refill','spool','bobina','filament with'))]
        if candidates: color=candidates[0]
    if not size:
        for x in parts:
            if WEIGHT_RE.search(x): size=x; break
    if not kind:
        for x in parts:
            if any(z in x.lower() for z in ('refill','spool','bobina','filament with')): kind=x; break
    return color,kind,size



# Filament Finder 10.5: verified promotion extraction for Shopify product pages.
# The parser is deliberately conservative: a promotion changes the calculated
# total only when quantity and discount are explicitly present on the page.
def shopify_product_variants(source, product_url, query):
    data=None
    for candidate in shopify_js_candidates(product_url, source):
        try:
            data,_=fetch_json(candidate)
            if isinstance(data,dict) and data.get('variants'): break
        except Exception:
            data=None
    if not data: return []
    title=str(data.get('title') or 'Filamento')
    vendor=str(data.get('vendor') or source.get('brand') or source['store'])
    out=[]
    for v in data.get('variants',[]):
        price=normalize_price(v.get('price'))
        compare_at_price=normalize_price(v.get('compare_at_price'))
        if price is None or price < 2 or price > 500: continue
        color,kind,size=extract_variant_options(data,v)
        weight = weight_kg_from_text(' '.join(filter(None,[size, str(v.get('title','')), title])))
        # Net filament weight must be explicit; shipping grams include the spool.
        perkg=round(price/weight,2) if weight else None
        available=v.get('available') if isinstance(v.get('available'), bool) else None
        variant_id=v.get('id')
        url=product_url + (('&' if '?' in product_url else '?') + 'variant=' + str(variant_id) if variant_id else '')
        out.append({
            'source_id':source['id'],'store':source['store'],'brand':source.get('brand') or vendor,
            'source_kind':source['kind'],'product':title,'variant':str(v.get('title') or ''),
            'color':color,'format':kind,'size':size,'weight_kg':weight,'price':price,'perkg':perkg,
            'available':available,'url':url,'note':'variante ufficiale' if source['kind']=='official' else 'variante negozio',
            'list_price':compare_at_price if compare_at_price is not None and compare_at_price>price else None,
            'priority':source['priority']
        })
    return out



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
    require_eur(backend)
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


def scrape_shopify(source, query):
    require_eur(source)
    search_url=source['search'].format(q=quote(query))
    html, final, _ = fetch(search_url)
    links=canonical_product_links(html, source['base'], limit=7)
    offers=[]
    for link in links:
        try: offers.extend(shopify_product_variants(source, link, query))
        except Exception: pass
        if len(offers)>100: break
    return offers


def infer_availability(text):
    low=(text or '').lower()
    if any(w in low for w in OUT_WORDS): return False
    if any(w in low for w in IN_WORDS): return True
    return None



def normalize_text_key(s):
    s=(s or '').lower()
    s=htmlmod.unescape(s)
    s=re.sub(r'[^a-z0-9à-ÿ+]+',' ',s)
    return SPACE_RE.sub(' ',s).strip()


def infer_color_from_text(text):
    low=normalize_text_key(text)
    for canonical, words in COMMON_COLORS.items():
        for w in words:
            if re.search(r'(?<![a-z0-9])'+re.escape(w)+r'(?![a-z0-9])', low):
                return canonical
    return None


def infer_format_from_text(text):
    low=normalize_text_key(text)
    for canonical, words in FORMAT_WORDS.items():
        if any(w in low for w in words): return canonical
    return None


def canonical_brand(offer, requested_brand='all'):
    b=(offer.get('brand') or '').strip()
    title=(offer.get('product') or '')+' '+(offer.get('variant') or '')
    known=['Bambu Lab','SUNLU','eSUN','Polymaker','Elegoo','Creality','Prusament','Prusa','Fiberlogy','Spectrum','FormFutura','colorFabb','AzureFilm','Overture','ERYONE','Geeetech','Anycubic','Fillamentum','3DJake','PrimaValue','PrimaCreator','Copymaster3D','Fiberon']
    if b and b.lower() not in ('none','generic',''):
        return b
    for k in known:
        if k.lower() in title.lower(): return k
    if requested_brand and requested_brand.lower() not in ('all','tutte le marche'):
        return requested_brand
    return 'Altro'


def canonical_variant_signature(offer, material, requested_brand='all'):
    brand=canonical_brand(offer, requested_brand)
    text=' '.join(filter(None,[offer.get('product'),offer.get('variant')]))
    color=(offer.get('color') or infer_color_from_text(text) or 'unknown').lower()
    fmt=(offer.get('format') or infer_format_from_text(text) or 'unknown').lower()
    weight=offer.get('weight_kg')
    weight_key=f'{round(float(weight),2):.2f}' if isinstance(weight,(int,float)) and weight else 'unknown'

    base=normalize_text_key(text)
    remove_tokens=[
        normalize_text_key(brand), normalize_text_key(material), color, fmt,
        'filament','filamento','1 75 mm','1.75 mm','175 mm','3d printer','stampa 3d',
        'with spool','without spool','bobina','reel','spool','refill','ricarica',
        '1000 g','1 kg','750 g','500 g'
    ]
    for tok in sorted([x for x in remove_tokens if x], key=len, reverse=True):
        base=base.replace(tok,' ')
    for canon,words in COMMON_COLORS.items():
        for w in words:
            base=re.sub(r'(?<![a-z0-9])'+re.escape(w)+r'(?![a-z0-9])',' ',base)
    base=SPACE_RE.sub(' ',base).strip()
    words=[w for w in base.split() if len(w)>1 and w not in {'standard'}]
    series=' '.join(words[:5]) or normalize_text_key(material)
    return '|'.join([normalize_text_key(brand),normalize_text_key(material),series,color,fmt,weight_key])


def parse_shipping_from_text(text):
    low=(text or '').lower()
    if any(x in low for x in ('consegna gratuita','spedizione gratuita','free delivery','free shipping')) and 'non gratuita' not in low:
        return 0.0, True, 'Spedizione gratuita indicata'
    m=re.search(r'(?:spedizione|shipping|delivery)[^€]{0,40}€\s*([0-9]+(?:[.,][0-9]{1,2})?)', text or '', re.I)
    if not m:
        m=re.search(r'€\s*([0-9]+(?:[.,][0-9]{1,2})?)\s*(?:di\s+spedizione|shipping|delivery)', text or '', re.I)
    if m:
        try:return float(m.group(1).replace(',','.')), True, 'Spedizione rilevata nella pagina'
        except Exception:pass
    return None, False, 'Spedizione da verificare'


def shipping_for_offer(source, offer, qty=1):
    qty=max(1,int(qty or 1))
    subtotal=round(float(offer.get('price') or 0)*qty,2)
    rule=source.get('shipping') or {'type':'checkout'}
    typ=rule.get('type')
    if typ=='flat_threshold':
        if subtotal >= float(rule.get('free_from',1e9)):
            return 0.0, True, f"Gratis da €{rule.get('free_from'):.2f}"
        return float(rule.get('flat',0)), True, f"Tariffa standard €{rule.get('flat',0):.2f}"
    if typ=='free_threshold_unknown_below':
        if subtotal >= float(rule.get('free_from',1e9)):
            return 0.0, True, f"Gratis da €{rule.get('free_from'):.2f}"
        return None, False, f"Sotto €{rule.get('free_from'):.2f}: calcolata al checkout"
    if typ=='parsed':
        if offer.get('shipping_known'):
            return offer.get('shipping_cost'), True, offer.get('shipping_note') or 'Rilevata dalla pagina'
        return None, False, rule.get('label','Dipende dal checkout')
    return None, False, rule.get('label','Calcolata al checkout')


def enrich_final_cost(offer, source, qty=1):
    o=dict(offer)
    qty=max(1,int(qty or 1))
    subtotal=round(float(o.get('price') or 0)*qty,2)
    ship,known,note=shipping_for_offer(source,o,qty)
    o['quantity']=qty
    o['subtotal']=subtotal
    o['shipping_cost']=ship
    o['shipping_known']=known
    o['shipping_note']=note
    o['final_total']=round(subtotal+ship,2) if known and ship is not None else None
    total_weight=(float(o.get('weight_kg'))*qty) if o.get('weight_kg') else None
    o['final_perkg']=round(o['final_total']/total_weight,2) if o.get('final_total') is not None and total_weight else None
    return o


def amazon_scrape(source, query):
    url=source['search'].format(q=quote(query))
    html, final, _=fetch(url)
    offers=[]
    chunks=re.split(r'(?=<div[^>]+data-asin=["\'][A-Z0-9]{10}["\'])', html, flags=re.I)
    for chunk in chunks[1:45]:
        am=re.search(r'data-asin=["\']([A-Z0-9]{10})["\']',chunk,re.I)
        if not am: continue
        asin=am.group(1)
        tm=re.search(r'<h2[^>]*>.*?<span[^>]*>(.*?)</span>.*?</h2>',chunk,re.I|re.S)
        if not tm:
            tm=re.search(r'class=["\'][^"\']*a-size-base-plus[^"\']*["\'][^>]*>(.*?)</span>',chunk,re.I|re.S)
        title=clean_html(tm.group(1)) if tm else ''
        if len(title)<5: continue
        whole=re.search(r'class=["\'][^"\']*a-price-whole[^"\']*["\'][^>]*>([0-9.]+)',chunk,re.I)
        frac=re.search(r'class=["\'][^"\']*a-price-fraction[^"\']*["\'][^>]*>([0-9]{2})',chunk,re.I)
        if whole:
            num=whole.group(1).replace('.','')
            price=float(num)+(float(frac.group(1))/100 if frac else 0)
        else:
            pm=PRICE_RE.search(clean_html(chunk))
            price=parse_price(pm.group(1)) if pm else None
        if not price or price<4 or price>500: continue
        txt=clean_html(chunk)
        kg=weight_kg_from_text(title+' '+txt)
        ship,ship_known,ship_note=parse_shipping_from_text(txt)
        color=infer_color_from_text(title)
        fmt=infer_format_from_text(title)
        available=not any(x in txt.lower() for x in ('attualmente non disponibile','temporaneamente non disponibile'))
        offers.append({
            'source_id':source['id'],'store':source['store'],'brand':None,'source_kind':source['kind'],
            'product':title[:180],'variant':'','color':color,'format':fmt,
            'size':f'{kg:g} kg' if kg else None,'weight_kg':kg,'price':round(price,2),
            'perkg':round(price/kg,2) if kg else None,'available':available,
            'url':f"https://www.amazon.it/dp/{asin}",'note':'Marketplace Amazon.it',
            'priority':source['priority'],'shipping_cost':ship,'shipping_known':ship_known,'shipping_note':ship_note
        })
        if len(offers)>=20: break
    return offers


def generic_scrape(source, query):
    url=source['search'].format(q=quote(query))
    document, final, _=fetch(url)
    offers=structured_offers(document,source,final,query)
    if not offers:
        links=[]
        for match in LINK_RE.finditer(document):
            title=clean_html(match.group(2))
            link=urljoin(final,htmlmod.unescape(match.group(1)))
            parsed=urlparse(link)
            if (material_matches(query,title) and parsed.scheme=='https'
                    and parsed.hostname==urlparse(final).hostname
                    and not re.search(r'/search|/recherche|/filaments?/|/filamenti-per-',parsed.path)
                    and link not in links):
                links.append(link)
            if len(links)>=4:
                break
        for link in links:
            try:
                product,product_url,_=fetch(link)
                offers.extend(structured_offers(product,source,product_url,query))
            except (OSError, ValueError):
                continue
    if not offers:
        raise RuntimeError('Nessun prezzo EUR associato a un prodotto verificabile. Apri il negozio per la ricerca manuale.')
    return offers


def source_matches(source, brand):
    if not brand or brand.lower() in ('all','tutte le marche'): return True
    b=brand.lower()
    if source['kind']=='official': return (source.get('brand') or '').lower()==b
    return True  # retailer can carry any requested brand


def query_for_source(material, brand, source):
    base=MATERIAL_ALIASES.get(material.lower(),material)
    if source['kind']=='official': return base
    if brand and brand.lower() not in ('all','tutte le marche'): return f'{brand} {base} 1kg'
    return f'{base} filament 1kg'


def dedupe_offers(offers, material, requested_brand='all'):
    seen=set(); clean=[]
    for o in offers:
        key=(o.get('source_id'),normalize_text_key(o.get('product')),normalize_text_key(o.get('variant')),
             normalize_text_key(o.get('color')),o.get('price'),o.get('weight_kg'))
        if key in seen: continue
        seen.add(key); clean.append(o)

    groups={}
    for o in clean:
        sig=canonical_variant_signature(o,material,requested_brand)
        o['variant_signature']=sig
        groups.setdefault(sig,[]).append(o)

    out=[]
    for sig,items in groups.items():
        def rank(o):
            known=0 if o.get('shipping_known') and o.get('final_total') is not None else 1
            avail=0 if o.get('available') is True else 1 if o.get('available') is None else 2
            total=o.get('final_perkg') if o.get('final_perkg') is not None else o.get('perkg')
            return (avail,known,total if total is not None else 99999,o.get('priority',99),o.get('price',99999))
        items=sorted(items,key=rank)
        best=items[0]
        out.append({
            'signature':sig,
            'brand':canonical_brand(best,requested_brand),
            'material':material,
            'product_family':best.get('product'),
            'color':best.get('color') or infer_color_from_text((best.get('product') or '')+' '+(best.get('variant') or '')),
            'format':best.get('format') or infer_format_from_text((best.get('product') or '')+' '+(best.get('variant') or '')),
            'weight_kg':best.get('weight_kg'),
            'offers':items,
            'stores':len({x.get('store') for x in items}),
            'best_final_total':next((x.get('final_total') for x in items if x.get('final_total') is not None),None),
            'best_final_perkg':next((x.get('final_perkg') for x in items if x.get('final_perkg') is not None),None),
            'best_product_price':min([x.get('price') for x in items if x.get('price') is not None] or [None])
        })
    out.sort(key=lambda g: (
        0 if g.get('best_final_perkg') is not None else 1,
        g.get('best_final_perkg') if g.get('best_final_perkg') is not None else 99999,
        g.get('best_product_price') if g.get('best_product_price') is not None else 99999
    ))
    return out



def _collect_source(source, material, brand, qty):
    q=query_for_source(material,brand,source)
    started=time.time()
    try:
        if source.get('id')=='bambu': offers=scrape_bambu_eu(source,q)
        elif source['engine']=='shopify': offers=scrape_shopify(source,q)
        elif source['engine']=='amazon': offers=amazon_scrape(source,q)
        else: offers=generic_scrape(source,q)

        offers=[o for o in offers if material_matches(material, (o.get('product') or '')+' '+(o.get('variant') or ''))]
        if source['kind'] in ('reseller','marketplace') and brand and brand.lower() not in ('all','tutte le marche'):
            offers=[o for o in offers if brand.lower() in ((o.get('product') or '')+' '+(o.get('brand') or '')).lower()]

        enriched=[]
        for o in offers:
            o['brand']=canonical_brand(o,brand)
            if not o.get('color'):
                o['color']=infer_color_from_text((o.get('product') or '')+' '+(o.get('variant') or ''))
            if not o.get('format'):
                o['format']=infer_format_from_text((o.get('product') or '')+' '+(o.get('variant') or ''))
            enriched.append(enrich_final_cost(o,source,qty))
        return enriched, {
            'id':source['id'],'name':source['store'],'kind':source['kind'],'ok':True,'results':len(enriched),
            'shipping':source.get('shipping',{}).get('label',''),'ms':int((time.time()-started)*1000)
        }
    except Exception as e:
        return [], {
            'id':source['id'],'name':source['store'],'kind':source['kind'],'ok':False,'results':0,
            'shipping':source.get('shipping',{}).get('label',''),'error':type(e).__name__,
            'error_message':str(e)[:180],'ms':int((time.time()-started)*1000)
        }


def live_catalog(material, brand='all', force=False, qty=1, source_filter=None):
    qty=max(1,min(50,int(qty or 1)))
    key=f'{material}|{brand}|q{qty}|src:{source_filter or "all"}'.lower()
    now=time.time()
    with CACHE_LOCK:
        if not force and key in CACHE and now-CACHE[key][0] < CACHE_TTL:
            cached=dict(CACHE[key][1]); cached['cached']=True; return cached

    selected=[s for s in SOURCES if (not source_filter or s.get('id')==source_filter) and source_matches(s,brand)]
    all_offers=[]; statuses=[]
    if selected:
        # Price sources are independent: query them concurrently and return partial
        # results inside a hard UI-friendly budget instead of blocking on every store.
        pool=SOURCE_POOL
        future_map={pool.submit(_collect_source,source,material,brand,qty):source for source in selected}
        done,pending=wait(future_map, timeout=PRICE_SEARCH_BUDGET)
        for future in done:
            offers,status=future.result()
            all_offers.extend(offers); statuses.append(status)
        for future in pending:
            source=future_map[future]
            future.cancel()
            statuses.append({
                'id':source['id'],'name':source['store'],'kind':source['kind'],'ok':False,'results':0,
                'shipping':source.get('shipping',{}).get('label',''),'error':'SearchBudgetExceeded',
                'error_message':f'Fonte oltre il budget di {PRICE_SEARCH_BUDGET:g}s'
            })
        # Do not wait for slow network threads; the HTTP response can be returned now.
        # Shared executor bounds network concurrency across all HTTP requests.

    source_order={s['id']:i for i,s in enumerate(selected)}
    statuses.sort(key=lambda x: source_order.get(x.get('id'),999))
    for status in statuses:
        source=next(s for s in selected if s['id']==status['id'])
        status['search_url']=source['search'].format(q=quote(query_for_source(material,brand,source)))
        status['results']=sum(o.get('source_id')==status['id'] for o in all_offers)
    groups=dedupe_offers(all_offers,material,brand)
    offers=[o for g in groups for o in g['offers']]
    for status in statuses:
        status['results']=sum(o.get('source_id')==status['id'] for o in offers)
    colors=sorted({str(o.get('color')).strip() for o in offers if o.get('color') and str(o.get('color')).strip().lower() not in ('default title','default','unknown')})
    known_final=[o for o in offers if o.get('available') is True and o.get('final_total') is not None]
    updated_at=iso_now()
    result={
        'version':APP_VERSION,'material':material,'brand':brand,'quantity':qty,'source_filter':source_filter,'updated_at':updated_at,
        'cache_seconds':CACHE_TTL,'cached':False,'sources':statuses,'colors':colors,
        'offers':offers,'groups':groups,
        'raw_offer_count':len(all_offers),'dedup_variant_count':len(groups),
        'available_count':sum(1 for o in offers if o.get('available') is True),
        'known_shipping_count':sum(1 for o in offers if o.get('shipping_known') is True),
        'best_final_total':min([o['final_total'] for o in known_final],default=None),
        'best_final_perkg':min([o['final_perkg'] for o in known_final if o.get('final_perkg') is not None],default=None),
        'elapsed_ms':int((time.time()-now)*1000),
        'partial':any(not s.get('ok') for s in statuses)
    }
    with CACHE_LOCK:
        if len(CACHE) >= 128:
            CACHE.pop(next(iter(CACHE)))
        CACHE[key]=(now,result)
    record_groups_and_evaluate(groups,material,brand,qty,updated_at)
    return result



# Filament Finder 10.7: per-source HTTP diagnostics.
# Telemetry is thread-local because marketplace sources run concurrently.
import threading as _ff107_threading
import time as _ff107_time

_ff107_tls = _ff107_threading.local()
_ff107_original_fetch = fetch


def _ff107_trim_error(exc):
    if exc is None:
        return None
    text=f'{exc.__class__.__name__}: {exc}'.strip()
    return text[:700]


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


def validate_alert(payload):
    if not isinstance(payload, dict):
        raise ValueError('Alert non valido')
    for key in ('signature', 'material', 'label'):
        if not isinstance(payload.get(key), str) or not 1 <= len(payload[key].strip()) <= 500:
            raise ValueError(f'{key}: valore mancante o troppo lungo')
    qty=payload.get('quantity', 1)
    if isinstance(qty, bool) or not isinstance(qty, int) or not 1 <= qty <= 50:
        raise ValueError('Quantità: scegli da 1 a 50 confezioni')
    if 'enabled' in payload and not isinstance(payload['enabled'], bool):
        raise ValueError('Stato alert non valido')
    config=payload.get('config', {})
    if not isinstance(config, dict):
        raise ValueError('Configurazione alert non valida')
    for key in ('max_final_enabled', 'drop_enabled', 'back_in_stock', 'final_change_enabled'):
        if key in config and not isinstance(config[key], bool):
            raise ValueError('Opzione alert non valida')
    for flag, key, maximum in [('max_final_enabled', 'max_final_value', 100000), ('drop_enabled', 'drop_pct', 100), ('final_change_enabled', 'final_change_pct', 100)]:
        value=config.get(key)
        if config.get(flag) and (isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not 0 < value <= maximum):
            raise ValueError('Soglia alert non valida')
    if 'brand' in payload and (not isinstance(payload['brand'], str) or len(payload['brand']) > 100):
        raise ValueError('Marca non valida')
    if 'current' in payload and not isinstance(payload['current'], dict):
        raise ValueError('Stato iniziale non valido')


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WEB_DIR, **kwargs)

    def list_directory(self, path):
        self.send_error(404)
        return None

    def end_headers(self):
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'")
        if not urlparse(self.path).path.startswith('/api/'):
            self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def do_GET(self):
        try:
            return self.handle_get()
        except (OSError, ValueError, TypeError):
            return self.send_json({'error':'Impossibile leggere i dati locali. Controlla i file persistenti senza eliminarli.'},500)

    def handle_get(self):
        parsed=urlparse(self.path)
        if parsed.path in ('/api/prices','/api/catalog'):
            qs=parse_qs(parsed.query)
            material=qs.get('material',[None])[0]
            brand=qs.get('brand',['all'])[0]
            if not material:
                q=qs.get('q',['PLA'])[0]
                material=re.sub(r'(?i)\b(filamento|filament|1\s*kg|bambu lab|sunlu|esun|polymaker)\b',' ',q)
                material=SPACE_RE.sub(' ',material).strip() or 'PLA'
                for b in ('Bambu Lab','SUNLU','eSUN','Polymaker'):
                    if b.lower() in q.lower(): brand=b; break
            force=qs.get('refresh',['0'])[0] in ('1','true','yes')
            source_filter=unquote(qs.get('source',[''])[0]).strip() or None
            try:
                qty=int(qs.get('qty',['1'])[0])
                if not 1 <= qty <= 50:
                    raise ValueError()
            except Exception:
                return self.send_json({'error':'Quantità: scegli da 1 a 50 confezioni'},400)
            if len(material)>120 or len(brand)>100 or (source_filter and source_filter not in {s['id'] for s in SOURCES}):
                return self.send_json({'error':'Parametri di ricerca non validi'},400)
            if not SEARCH_SLOTS.acquire(blocking=False):
                return self.send_json({'error':'Ricerche in corso. Riprova tra qualche secondo.'},429)
            try:
                return self.send_json(live_catalog(unquote(material),unquote(brand),force,qty,source_filter))
            except Exception as e:
                return self.send_json({'error':str(e),'offers':[],'sources':[]},500)
            finally:
                SEARCH_SLOTS.release()

        if parsed.path=='/api/health':
            return self.send_json({
                'ok':True,'version':APP_VERSION,'materials':STATIC_MATERIAL_COUNT,'brands':STATIC_BRAND_COUNT,
                'sources':len(SOURCES),'cache_seconds':CACHE_TTL,'monitor_interval_seconds':MONITOR_INTERVAL,
                'time':iso_now()
            })

        if parsed.path=='/api/sources':
            return self.send_json({'version':APP_VERSION,'sources':[{k:v for k,v in s.items() if k not in ('search',)} for s in SOURCES],'cache_seconds':CACHE_TTL})

        if parsed.path=='/api/alerts':
            return self.send_json(get_alert_payload())

        if parsed.path=='/api/history':
            qs=parse_qs(parsed.query)
            signature=unquote(qs.get('signature',[''])[0])
            try: limit=int(qs.get('limit',['500'])[0])
            except Exception: limit=500
            if not signature:
                return self.send_json({'error':'signature mancante','history':[]},400)
            return self.send_json({'signature':signature,'history':get_history(signature,limit)})

        if parsed.path=='/api/monitor/status':
            payload=get_alert_payload()
            return self.send_json({
                'active_alerts':sum(1 for a in payload['alerts'] if a.get('enabled',True)),
                'unread_count':payload['unread_count'],
                'monitor_interval_seconds':MONITOR_INTERVAL
            })

        if parsed.path.startswith('/api/'):
            return self.send_json({'error':'Endpoint non trovato'},404)
        return super().do_GET()

    def do_POST(self):
        parsed=urlparse(self.path)
        if not parsed.path.startswith('/api/'):
            return self.send_json({'error':'endpoint non valido'},404)
        # Umbrel authenticates the app at its proxy. Reject cross-site mutations.
        if self.headers.get('Sec-Fetch-Site') == 'cross-site':
            return self.send_json({'error':'Origine non consentita'},403)
        origin=self.headers.get('Origin')
        if origin and urlparse(origin).netloc != self.headers.get('Host'):
            return self.send_json({'error':'Origine non consentita'},403)
        if self.headers.get_content_type() != 'application/json':
            return self.send_json({'error':'Usa application/json'},415)
        try:
            length=int(self.headers.get('Content-Length','0') or 0)
            if not 0 <= length <= 65536:
                return self.send_json({'error':'Richiesta troppo grande'},413)
            raw=self.rfile.read(length) if length else b'{}'
            body=json.loads(raw.decode('utf-8') or '{}')
            if not isinstance(body,dict):
                raise ValueError()
        except Exception:
            return self.send_json({'error':'JSON non valido'},400)

        if parsed.path=='/api/alerts':
            action=body.get('action','upsert')
            try:
                if action=='upsert':
                    alert=upsert_alert(body.get('alert') or {})
                    return self.send_json({'ok':True,'alert':alert,**get_alert_payload()})
                if action=='delete':
                    ok=delete_alert(body.get('id'))
                    return self.send_json({'ok':ok,**get_alert_payload()})
                if action=='toggle':
                    if not isinstance(body.get('enabled'),bool):
                        raise ValueError('Stato alert non valido')
                    alert=set_alert_enabled(body.get('id'),body.get('enabled',True))
                    return self.send_json({'ok':alert is not None,'alert':alert,**get_alert_payload()})
                if action=='mark_read':
                    n=mark_events_read(body.get('event_ids'))
                    return self.send_json({'ok':True,'changed':n,**get_alert_payload()})
                if action=='clear_events':
                    clear_events()
                    return self.send_json({'ok':True,**get_alert_payload()})
                return self.send_json({'error':'azione alert non valida'},400)
            except (ValueError, TypeError) as e:
                return self.send_json({'error':str(e)},400)
            except Exception as e:
                return self.send_json({'error':str(e)},500)

        if parsed.path=='/api/monitor/run':
            try:
                result=monitor_tracked_alerts(True)
                return self.send_json({'ok':True,'result':result,**get_alert_payload()})
            except Exception as e:
                return self.send_json({'error':str(e)},500)

        return self.send_json({'error':'endpoint non valido'},404)

    def send_json(self,obj,status=200):
        data=json.dumps(obj,ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type','application/json; charset=utf-8')
        self.send_header('Cache-Control','no-store')
        self.send_header('Content-Length',str(len(data)))
        self.end_headers()
        try:
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass

if __name__=='__main__':
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    print(f'Filament Finder {APP_VERSION} -> http://127.0.0.1:{PORT}')
    print('Fonti live: ' + ', '.join(x['store'] for x in SOURCES))
    print(f'Price tracker: controlli automatici ogni {MONITOR_INTERVAL//60} minuti finché il server resta aperto')
    threading.Thread(target=monitor_loop,name='filament-alert-monitor',daemon=True).start()
    ThreadingHTTPServer(('0.0.0.0',PORT),Handler).serve_forever()
