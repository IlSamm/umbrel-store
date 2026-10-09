from __future__ import annotations

import re
import sys
from pathlib import Path


def apply_unified(text: str, patch: str, label: str) -> str:
    src = text.splitlines(keepends=True)
    out = []
    cursor = 0
    lines = patch.splitlines(keepends=True)
    i = 0
    while i < len(lines) and not lines[i].startswith('@@'):
        i += 1
    hunks = 0
    while i < len(lines):
        if not lines[i].startswith('@@'):
            i += 1
            continue
        m = re.match(r'@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@', lines[i])
        if not m:
            raise RuntimeError(f'{label}: invalid hunk header: {lines[i].rstrip()}')
        old_start = int(m.group(1)) - 1
        if old_start < cursor:
            raise RuntimeError(f'{label}: overlapping hunks')
        out.extend(src[cursor:old_start])
        cursor = old_start
        i += 1
        hunks += 1
        while i < len(lines) and not lines[i].startswith('@@'):
            line = lines[i]
            if line.startswith('\\ No newline'):
                i += 1
                continue
            prefix = line[:1]
            body = line[1:]
            if prefix == ' ':
                if cursor >= len(src) or src[cursor] != body:
                    raise RuntimeError(f'{label}: context mismatch at source line {cursor+1}')
                out.append(src[cursor]); cursor += 1
            elif prefix == '-':
                if cursor >= len(src) or src[cursor] != body:
                    raise RuntimeError(f'{label}: delete mismatch at source line {cursor+1}')
                cursor += 1
            elif prefix == '+':
                out.append(body)
            else:
                break
            i += 1
    out.extend(src[cursor:])
    if not hunks:
        raise RuntimeError(f'{label}: patch contained no hunks')
    return ''.join(out)

SERVER_PATCH = '''@@ -4,6 +4,9 @@
 from urllib.error import HTTPError, URLError
 import json, re, time, os, html as htmlmod, threading, uuid, tempfile
 
+APP_VERSION = '9.0.0'
+STATIC_MATERIAL_COUNT = 67
+STATIC_BRAND_COUNT = 18
 PORT = int(os.getenv('FILAMENT_FINDER_PORT', '8765'))
 CACHE = {}
 CACHE_TTL = int(os.getenv('FILAMENT_FINDER_CACHE_TTL', '900'))  # seconds
@@ -62,6 +65,21 @@
         'base':'https://www.3dstoreitalia.com','search':'https://www.3dstoreitalia.com/search?q={q}&type=product',
         'priority':22,'shipping':{'type':'checkout','label':'Calcolata al checkout'}
     },
+    {
+        'id':'azurefilm','store':'AzureFilm EU','brand':'AzureFilm','kind':'official','engine':'generic',
+        'base':'https://azurefilm.com/it','search':'https://azurefilm.com/it/?s={q}&post_type=product',
+        'priority':12,'shipping':{'type':'checkout','label':'Calcolata al checkout'}
+    },
+    {
+        'id':'formfutura','store':'FormFutura EU','brand':'FormFutura','kind':'official','engine':'generic',
+        'base':'https://www.formfutura.com','search':'https://www.formfutura.com/search?q={q}',
+        'priority':12,'shipping':{'type':'checkout','label':'Calcolata al checkout'}
+    },
+    {
+        'id':'3dprima','store':'3D Prima EU','brand':None,'kind':'reseller','engine':'generic',
+        'base':'https://www.3dprima.com','search':'https://www.3dprima.com/search?search={q}',
+        'priority':18,'shipping':{'type':'free_threshold_unknown_below','free_from':100.00,'label':'Gratis UE oltre €100; sotto soglia al checkout'}
+    },
 ]
@@ -106,7 +124,19 @@
     'pc / policarbonato':'PC', 'pa / nylon':'Nylon PA', 'pa6-cf / paht-cf':'PA CF',
     'pet-cf':'PET CF', 'ppa-cf':'PPA CF', 'pps-cf':'PPS CF', 'pp / polipropilene':'PP',
     'pva':'PVA', 'hips':'HIPS', 'support for pla/petg':'Support PLA PETG',
-    'pla metal-filled':'Metal PLA', 'glow in the dark':'Glow PLA'
+    'pla metal-filled':'Metal PLA', 'glow in the dark':'Glow PLA',
+    'rpla / pla riciclato':'rPLA', 'htpla / pla annealable':'HTPLA', 'lw-pla / pla espandente':'LW PLA',
+    'pla marble / stone':'Marble PLA', 'pla glitter / sparkle':'Glitter PLA', 'pla-gf':'PLA GF',
+    'pla conduttivo':'Conductive PLA', 'pla esd':'ESD PLA', 'petg high flow / high speed':'PETG',
+    'petg traslucido / clear':'PETG transparent', 'petg-gf':'PETG GF', 'petg esd':'PETG ESD',
+    'pet':'PET filament', 'pvb':'PVB', 'tpu 98a':'TPU 98A', 'tpu 90a':'TPU 90A',
+    'tpc / copoliestere elastomerico':'TPC flexible', 'abs+ / easy abs':'ABS Plus', 'abs-gf':'ABS GF',
+    'asa-cf':'ASA CF', 'asa-gf':'ASA GF', 'pc-abs':'PC ABS', 'pc-cf':'PC CF',
+    'pc-fr / flame retardant':'PC FR', 'pa6 / nylon 6':'PA6 Nylon', 'pa12 / nylon 12':'PA12 Nylon',
+    'pa11':'PA11 Nylon', 'pa-gf':'PA GF', 'pa12-cf':'PA12 CF', 'ppa':'PPA', 'pps':'PPS',
+    'pps-gf':'PPS GF', 'pp-gf':'PP GF', 'bvoh':'BVOH', 'support for pa / engineering':'support PA',
+    'cpe / co-polyester':'CPE', 'pmma / acrylic':'PMMA', 'pom / acetal':'POM',
+    'pei / ultem':'PEI ULTEM', 'peek':'PEEK', 'pekk':'PEKK', 'ppsu':'PPSU'
 }
@@ -703,7 +733,7 @@
 def canonical_brand(offer, requested_brand='all'):
     b=(offer.get('brand') or '').strip()
     title=(offer.get('product') or '')+' '+(offer.get('variant') or '')
-    known=['Bambu Lab','SUNLU','eSUN','Polymaker','Elegoo','Creality','Prusament','Prusa','Fiberlogy','Spectrum','FormFutura','colorFabb','AzureFilm','Overture','ERYONE','Geeetech','Anycubic']
+    known=['Bambu Lab','SUNLU','eSUN','Polymaker','Elegoo','Creality','Prusament','Prusa','Fiberlogy','Spectrum','FormFutura','colorFabb','AzureFilm','Overture','ERYONE','Geeetech','Anycubic','Fillamentum','3DJake','PrimaValue','PrimaCreator','Copymaster3D','Fiberon']
@@ -842,10 +872,15 @@
         if words and not any(w in low for w in words): continue
         pos=m.start()
         nearby=clean_html(html[max(0,pos-1400):min(len(html),m.end()+3200)])
-        pm=PRICE_RE.search(nearby)
-        if not pm: continue
-        price=parse_price(pm.group(1))
-        if price is None or price<4 or price>500: continue
+        price_candidates=[]
+        for pm in PRICE_RE.finditer(nearby):
+            pv=parse_price(pm.group(1))
+            if pv is not None and 4 <= pv <= 500:
+                price_candidates.append(pv)
+        if not price_candidates: continue
+        price=min(price_candidates)
@@ -923,15 +958,16 @@
-def live_catalog(material, brand='all', force=False, qty=1):
+def live_catalog(material, brand='all', force=False, qty=1, source_filter=None):
     qty=max(1,min(50,int(qty or 1)))
-    key=f'{material}|{brand}|q{qty}'.lower()
+    key=f'{material}|{brand}|q{qty}|src:{source_filter or "all"}'.lower()
@@ -929,6 +965,7 @@
     all_offers=[]; statuses=[]
     for source in SOURCES:
+        if source_filter and source.get('id') != source_filter: continue
         if not source_matches(source,brand): continue
@@ -960,7 +997,7 @@
-                'shipping':source.get('shipping',{}).get('label',''),'error':type(e).__name__
+                'shipping':source.get('shipping',{}).get('label',''),'error':type(e).__name__,'error_message':str(e)[:180]
@@ -969,7 +1006,7 @@
-        'material':material,'brand':brand,'quantity':qty,'updated_at':updated_at,
+        'version':APP_VERSION,'material':material,'brand':brand,'quantity':qty,'source_filter':source_filter,'updated_at':updated_at,
@@ -997,17 +1034,25 @@
             force=qs.get('refresh',['0'])[0] in ('1','true','yes')
+            source_filter=unquote(qs.get('source',[''])[0]).strip() or None
@@ -1003,7 +1048,14 @@
-                return self.send_json(live_catalog(unquote(material),unquote(brand),force,qty))
+                return self.send_json(live_catalog(unquote(material),unquote(brand),force,qty,source_filter))
@@ -1007,7 +1059,13 @@
+        if parsed.path=='/api/health':
+            return self.send_json({
+                'ok':True,'version':APP_VERSION,'materials':STATIC_MATERIAL_COUNT,'brands':STATIC_BRAND_COUNT,
+                'sources':len(SOURCES),'cache_seconds':CACHE_TTL,'monitor_interval_seconds':MONITOR_INTERVAL,
+                'data_dir':DATA_DIR,'time':iso_now()
+            })
+
         if parsed.path=='/api/sources':
-            return self.send_json({'sources':[{k:v for k,v in s.items() if k not in ('search',)} for s in SOURCES],'cache_seconds':CACHE_TTL})
+            return self.send_json({'version':APP_VERSION,'sources':[{k:v for k,v in s.items() if k not in ('search',)} for s in SOURCES],'cache_seconds':CACHE_TTL})
@@ -1084,8 +1142,8 @@
-    print(f'Filament Finder Pro -> http://127.0.0.1:{PORT}')
-    print('Fonti live: Bambu Lab EU, SUNLU Italia, Polymaker EU, eSUN EU, Amazon Italia, 3DJake Italia, Filament2Print, 3DStoreItalia')
+    print(f'Filament Finder {APP_VERSION} -> http://127.0.0.1:{PORT}')
+    print('Fonti live: ' + ', '.join(x['store'] for x in SOURCES))
'''

APP_PATCH = '''@@ -61,8 +61,10 @@
-  if(p.brand==="Bambu Lab" && ["A1","A1 mini"].includes(p.model) && ["abs","asa","pc","pa","pa-cf","pet-cf","petg-cf","pla-cf","ppa-cf","pps-cf"].includes(m.id)){
-    score-=20; issues.push("Bambu classifica questa famiglia come non consigliata sulla A1 Series per uso generale.");
+  if(p.brand==="Bambu Lab" && ["A1","A1 mini"].includes(p.model) &&
+     (["abs","asa","pc","pa","pa-cf","pet-cf","petg-cf","pla-cf","ppa-cf","pps-cf"].includes(m.id) ||
+      m.enclosure>0 || m.abrasive || ((m.group||[]).includes("engineering") && m.t[0]>=245))){
+    score-=20; issues.push("Questa famiglia richiede più controllo termico/hardware rispetto all’uso tipico della A1 Series.");
@@ -235,6 +237,9 @@
     "3DStoreItalia":"https://www.3dstoreitalia.com/search?q="+encodeURIComponent(q)+"&type=product",
+    "AzureFilm":"https://azurefilm.com/it/?s="+encodeURIComponent(q)+"&post_type=product",
+    "FormFutura":"https://www.formfutura.com/search?q="+encodeURIComponent(q),
+    "3DPrima":"https://www.3dprima.com/search?search="+encodeURIComponent(q),
@@ -370,7 +375,7 @@
-    box.innerHTML=`<div class="offline-note"><b>Apri l'app con START_WINDOWS.bat</b> per avere prezzi, disponibilità e colori automatici. Aprendo solo index.html il browser blocca le richieste dirette ai negozi per sicurezza (CORS).</div>
+    box.innerHTML=`<div class="offline-note"><b>Il motore prezzi non ha risposto.</b> I dati tecnici restano disponibili; riprova tra poco o apri direttamente uno dei negozi qui sotto.</div>
@@ -380,6 +385,9 @@
         <button onclick="openShopSearch('3DStoreItalia','${encodeURIComponent(q)}')">3DStoreItalia</button>
+        <button onclick="openShopSearch('AzureFilm','${encodeURIComponent(q)}')">AzureFilm</button>
+        <button onclick="openShopSearch('FormFutura','${encodeURIComponent(q)}')">FormFutura</button>
+        <button onclick="openShopSearch('3DPrima','${encodeURIComponent(q)}')">3D Prima</button>
'''

INDEX_PATCH = '''@@ -8,10 +8,10 @@
-  <link rel="stylesheet" href="v7.css?v=700">
+  <link rel="stylesheet" href="v9.css?v=900">
@@ -12,7 +12,7 @@
-<div class="app-shell" id="app">
+<div class="app-shell" id="app"><button id="printerBtn" type="button" hidden aria-hidden="true" tabindex="-1"></button>
@@ -51,7 +51,7 @@
-          <div><div class="eyebrow">FILAMENT FINDER 2.0</div><h1>Il tuo centro di controllo<br>per la stampa 3D.</h1><p>Materiali, compatibilità, prezzi live e storico. Tutto organizzato in un unico workspace.</p></div>
+          <div><div class="eyebrow">FILAMENT FINDER 9</div><h1>Il tuo centro di controllo<br>per la stampa 3D.</h1><p>Materiali, compatibilità, prezzi live e storico. Tutto organizzato in un unico workspace.</p></div>
@@ -63,7 +63,7 @@
-          <article class="dashboard-card metric-card"><span>Fonti live</span><strong>8</strong><small>store e rivenditori</small></article>
+          <article class="dashboard-card metric-card"><span>Fonti live</span><strong id="homeSourcesCount">11</strong><small>store e rivenditori</small></article>
@@ -86,7 +86,7 @@
-            <button data-tab="materials"><span class="launcher-icon">◫</span><b>Catalogo</b><small>25+ materiali tecnici</small></button>
+            <button data-tab="materials"><span class="launcher-icon">◫</span><b>Catalogo</b><small>67 materiali tecnici</small></button>
@@ -193,7 +193,6 @@
 <script src="data.js"></script>
-<script src="materials-v5-data.js?v=700"></script>
-<script src="techsheet-v51-data.js?v=700"></script>
+<script src="v9-data.js?v=900"></script>
 <script src="app.js"></script>
 <script src="v7.js?v=700"></script>
+<script src="v9.js?v=900"></script>
'''


def main():
    if len(sys.argv) != 2:
        raise SystemExit('usage: patch_runtime_v9.py <runtime-dir>')
    root = Path(sys.argv[1])
    for name, patch in [('server.py', SERVER_PATCH), ('app.js', APP_PATCH), ('index.html', INDEX_PATCH)]:
        path = root / name
        path.write_text(apply_unified(path.read_text(encoding='utf-8'), patch, name), encoding='utf-8')
        print(f'Patched {name}', flush=True)

if __name__ == '__main__':
    main()
