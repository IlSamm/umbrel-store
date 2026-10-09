(function(){
'use strict';

window.FILAMENT_FINDER_VERSION='10.0.0';
const VERSION='10.0.0';
const q=(s,r=document)=>r.querySelector(s);
const qa=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clamp=(n,a=0,b=100)=>Math.max(a,Math.min(b,Number(n)||0));
const first=(obj,keys,fallback='')=>{for(const k of keys){if(obj&&obj[k]!==undefined&&obj[k]!==null&&obj[k]!=='' )return obj[k];}return fallback;};
const directGlobal=(name)=>{try{return eval(name);}catch{return undefined;}};
const compact=(arr)=>arr.filter(Boolean);

const ICONS={
 home:'<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5M9.5 20v-6h5v6"/>',
 spark:'<path d="m12 3 1.7 4.3L18 9l-4.3 1.7L12 15l-1.7-4.3L6 9l4.3-1.7L12 3Z"/><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z"/>',
 euro:'<path d="M18 7.5a7 7 0 1 0 0 9"/><path d="M5 10h9M5 14h8"/>',
 layers:'<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/>',
 menu:'<path d="M5 7h14M5 12h14M5 17h14"/>',
 printer:'<path d="M7 9V4h10v5"/><path d="M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2"/><path d="M7 14h10v6H7z"/>',
 chevron:'<path d="m9 10 3 3 3-3"/>',
 arrow:'<path d="M5 12h14M14 7l5 5-5 5"/>',
 search:'<circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/>',
 x:'<path d="m6 6 12 12M18 6 6 18"/>',
 back:'<path d="m15 18-6-6 6-6"/>',
 compare:'<path d="M7 7h11l-3-3M18 7l-3 3M17 17H6l3 3M6 17l3-3"/>',
 calc:'<path d="M7 4h10v16H7z"/><path d="M9 7h6M9 11h1M14 11h1M9 15h1M14 15h1"/>',
 bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/>',
 settings:'<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.6-2-3.4-2.5 1A8 8 0 0 0 15 6l-.4-2.6h-4L10 6a8 8 0 0 0-1.4 1L6 6 4 9.4 6 11a7 7 0 0 0 0 2l-2 1.6L6 18l2.6-1a8 8 0 0 0 1.4 1l.5 2.6h4L15 18a8 8 0 0 0 1.4-1l2.6 1 2-3.4-2-1.6a7 7 0 0 0 .1-1Z"/>',
 check:'<path d="m5 12 4 4L19 6"/>',
 refresh:'<path d="M20 7v5h-5"/><path d="M4 17v-5h5"/><path d="M18.5 9A7 7 0 0 0 6 6.5L4 9M5.5 15A7 7 0 0 0 18 17.5l2-2.5"/>',
 external:'<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6"/>',
 info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'
};
const icon=(name)=>`<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]||ICONS.info}</svg>`;

function rawMaterials(){
  const pools=[];
  for(const name of ['MATERIALS','FF9_MATERIALS','MATERIALS_V9','EXTENDED_MATERIALS','MATERIAL_CATALOG']){
    const v=directGlobal(name); if(Array.isArray(v)) pools.push(...v);
  }
  const legacyState=directGlobal('state');
  if(Array.isArray(legacyState?.materials)) pools.push(...legacyState.materials);
  const seen=new Set();
  return pools.filter(m=>{
    if(!m||typeof m!=='object') return false;
    const key=matName(m).toLowerCase(); if(!key||seen.has(key)) return false; seen.add(key); return true;
  });
}
function rawPrinters(){
  const pools=[];
  for(const name of ['PRINTERS','FF9_PRINTERS','PRINTER_CATALOG']){const v=directGlobal(name);if(Array.isArray(v))pools.push(...v);}
  const seen=new Set();
  return pools.filter(p=>{if(!p||typeof p!=='object')return false;const k=printerName(p).toLowerCase();if(!k||seen.has(k))return false;seen.add(k);return true;});
}
function matName(m){return String(first(m,['name','material','title','label','id'],'Materiale'));}
function matFamily(m){return String(first(m,['family','category','base','type'],matName(m).split(/[ +\-/]/)[0]||'Materiale'));}
function matDesc(m){return String(first(m,['summary','description','desc','short','note'],'Profilo tecnico per stampa 3D.'));}
function printerName(p){return String(first(p,['name','model','title','label','id'],'Stampante'));}
function printerDesc(p){
  const bits=compact([
    first(p,['volume','build_volume','buildVolume']),
    first(p,['max_temp','maxNozzle','nozzle_temp']),
    first(p,['bed_temp','maxBed']),
    first(p,['chamber'])
  ]).map(String);
  return bits.join(' · ')||String(first(p,['description','desc'],'Profilo stampante'));
}

function familyKey(m){return (matName(m)+' '+matFamily(m)).toUpperCase();}
function accentFor(m){
  const s=familyKey(m);
  if(/TPU|TPE|FLEX/.test(s))return '#ad8cff';
  if(/ASA|ABS/.test(s))return '#ffad63';
  if(/NYLON|\bPA\b|PEEK|PEKK/.test(s))return '#ff7c84';
  if(/PC|POLYCARB/.test(s))return '#ffd36a';
  if(/PETG|PCTG/.test(s))return '#73e4b1';
  if(/PLA/.test(s))return '#7eb3ff';
  if(/PVA|HIPS|SUPPORT/.test(s))return '#a4ada7';
  if(/CF|CARBON|GF|GLASS/.test(s))return '#b9c0ba';
  return '#76e48c';
}
function baseProfile(m){
  const s=familyKey(m);
  let p={ease:66,strength:66,heat:60,finish:72};
  if(/PLA/.test(s))p={ease:94,strength:58,heat:34,finish:91};
  if(/PLA\+|TOUGH/.test(s))p={ease:88,strength:72,heat:40,finish:88};
  if(/PETG/.test(s))p={ease:81,strength:74,heat:58,finish:80};
  if(/PCTG/.test(s))p={ease:72,strength:82,heat:66,finish:80};
  if(/ASA/.test(s))p={ease:54,strength:78,heat:80,finish:77};
  if(/ABS/.test(s))p={ease:52,strength:76,heat:74,finish:74};
  if(/TPU|TPE|FLEX/.test(s))p={ease:45,strength:86,heat:55,finish:72};
  if(/NYLON|\bPA\b/.test(s))p={ease:38,strength:92,heat:84,finish:69};
  if(/\bPC\b|POLYCARB/.test(s))p={ease:33,strength:92,heat:93,finish:74};
  if(/PEEK|PEKK|ULTEM|PEI/.test(s))p={ease:12,strength:97,heat:99,finish:67};
  if(/PVA|SUPPORT/.test(s))p={ease:45,strength:20,heat:25,finish:55};
  if(/SILK/.test(s))p.finish=98;
  if(/CF|CARBON|GF|GLASS/.test(s)){p.strength=Math.max(p.strength,91);p.heat=Math.max(p.heat,78);p.ease=Math.min(p.ease,52);}
  return p;
}
function scoreValue(v,fallback){
  if(v===undefined||v===null||v==='')return fallback;
  if(typeof v==='number')return clamp(v<=10?v*10:v);
  const s=String(v).toLowerCase();
  if(/molto alta|excellent|eccellente|estrema/.test(s))return 95;
  if(/alta|high|ottima/.test(s))return 82;
  if(/media|medium|buona/.test(s))return 62;
  if(/bassa|low|scarsa/.test(s))return 35;
  const n=parseFloat(s.replace(',','.'));return Number.isFinite(n)?clamp(n<=10?n*10:n):fallback;
}
function profile(m){
  const p=baseProfile(m);
  p.ease=scoreValue(first(m,['ease','printability','difficulty_score']),p.ease);
  p.strength=scoreValue(first(m,['strength','mechanical','toughness','impact']),p.strength);
  p.heat=scoreValue(first(m,['heat','heat_resistance','temperature_resistance']),p.heat);
  p.finish=scoreValue(first(m,['finish','surface','aesthetic']),p.finish);
  return p;
}
function tempText(m,type){
  const keys=type==='bed'?['bed','bed_temp','bedTemp','bed_temperature']:['nozzle','nozzle_temp','nozzleTemp','print_temp','temperature'];
  let v=first(m,keys,'—');
  if(Array.isArray(v))v=v.join('–');
  v=String(v);
  if(v!=='—'&&!/[°C]/i.test(v)&&/\d/.test(v))v+='°';
  return v;
}
function speedText(m){return String(first(m,['speed','print_speed','max_speed'],'—'));}
function densityText(m){const v=first(m,['density','specific_gravity'],'—');return String(v)==='—'?'—':String(v).includes('g/')?String(v):`${v} g/cm³`;}
function materialTags(m){
  let v=first(m,['uses','use_cases','applications','ideal_for','tags'],[]);
  if(typeof v==='string')v=v.split(/[,;|]/).map(x=>x.trim()).filter(Boolean);
  if(!Array.isArray(v))v=[];
  if(!v.length){
    const s=familyKey(m);
    if(/PLA/.test(s))v=['Statuine','Prototipi','Decorazione'];
    else if(/PETG/.test(s))v=['Funzionale','Contenitori','Uso quotidiano'];
    else if(/ASA/.test(s))v=['Outdoor','Automotive','UV'];
    else if(/TPU/.test(s))v=['Flessibile','Cover','Paracolpi'];
    else if(/NYLON|\bPA\b/.test(s))v=['Meccanica','Ingranaggi','Carichi'];
    else v=['Tecnico','Funzionale'];
  }
  return v.slice(0,6);
}
function categoryOf(m){
  const s=familyKey(m),p=profile(m);
  if(/TPU|TPE|FLEX/.test(s))return 'Flessibili';
  if(/ASA|ABS|PC|NYLON|\bPA\b|CF|GF|PEEK|PEKK|PEI/.test(s))return 'Engineering';
  if(/PVA|HIPS|SUPPORT/.test(s))return 'Supporti';
  if(/WOOD|MARBLE|SILK|METAL|GLOW/.test(s))return 'Speciali';
  if(p.ease>=80)return 'Facili';
  return 'Tecnici';
}

const appState={view:'home',materialFilter:'Tutti',materialSearch:'',priceMaterial:'PLA',priceBrand:'all',market:null,health:null,alerts:[],printer:null};
function getActivePrinter(){
  const saved=localStorage.getItem('ff10_active_printer'); if(saved)return saved;
  const legacy=q('#ff10-legacy');
  const candidates=legacy?qa('.printer-card-main h2,#activePrinterName,[data-active-printer]',legacy):[];
  for(const el of candidates){const t=(el.textContent||'').trim();if(t)return t;}
  return rawPrinters()[0]?printerName(rawPrinters()[0]):'Bambu Lab X2D';
}
function setActivePrinter(name){
  localStorage.setItem('ff10_active_printer',name);appState.printer=name;
  const legacy=q('#ff10-legacy');
  if(legacy){
    for(const sel of qa('select',legacy)){
      const opt=[...sel.options].find(o=>(o.textContent||'').toLowerCase().includes(name.toLowerCase())||String(o.value).toLowerCase()===name.toLowerCase());
      if(opt){sel.value=opt.value;sel.dispatchEvent(new Event('change',{bubbles:true}));break;}
    }
  }
  updateTopPrinter();renderHome();closeSheet();toast('Stampante aggiornata');
}

function buildShell(){
  const current=document.currentScript;
  const legacy=document.createElement('div');legacy.id='ff10-legacy';legacy.hidden=true;
  [...document.body.children].forEach(el=>{if(el!==current)legacy.appendChild(el);});
  document.body.insertBefore(legacy,current||null);
  document.body.classList.add('ff10-mounted');

  const app=document.createElement('div');app.id='ff10-app';
  app.innerHTML=`<div class="ff10-shell">
    <header class="ff10-topbar">
      <button class="ff10-brand" data-nav="home" aria-label="Filament Finder Home">
        <span class="ff10-logo">F</span><span class="ff10-brand-copy"><strong>Filament Finder</strong><small>Material intelligence</small></span>
      </button>
      <button class="ff10-printer-pill" id="ff10-printer-button" data-open-printers>${icon('printer')}<span></span>${icon('chevron')}</button>
    </header>
    <main class="ff10-main">
      <section class="ff10-view is-active" id="ff10-view-home" data-view="home"></section>
      <section class="ff10-view" id="ff10-view-advisor" data-view="advisor"></section>
      <section class="ff10-view" id="ff10-view-prices" data-view="prices"></section>
      <section class="ff10-view" id="ff10-view-materials" data-view="materials"></section>
      <section class="ff10-view" id="ff10-view-more" data-view="more"></section>
      <section class="ff10-view" id="ff10-view-compare" data-view="compare"></section>
      <section class="ff10-view" id="ff10-view-cost" data-view="cost"></section>
      <section class="ff10-view" id="ff10-view-alerts" data-view="alerts"></section>
      <section class="ff10-view" id="ff10-view-printers" data-view="printers"></section>
      <section class="ff10-view" id="ff10-view-settings" data-view="settings"></section>
    </main>
    <nav class="ff10-nav" aria-label="Navigazione principale">
      <button class="is-active" data-nav="home">${icon('home')}<small>Home</small></button>
      <button data-nav="advisor">${icon('spark')}<small>Consiglia</small></button>
      <button data-nav="prices">${icon('euro')}<small>Prezzi</small></button>
      <button data-nav="materials">${icon('layers')}<small>Materiali</small></button>
      <button data-nav="more">${icon('menu')}<small>Altro</small></button>
    </nav>
    <div class="ff10-sheet-backdrop" id="ff10-sheet-backdrop"><div class="ff10-sheet" id="ff10-sheet"><div class="ff10-sheet-grab"></div><div id="ff10-sheet-content"></div></div></div>
    <div class="ff10-toast" id="ff10-toast"></div>
  </div>`;
  document.body.insertBefore(app,current||null);
  bindShell();
}

function bindShell(){
  const app=q('#ff10-app');
  app.addEventListener('click',e=>{
    const nav=e.target.closest('[data-nav]');if(nav){navigate(nav.dataset.nav);return;}
    if(e.target.closest('[data-open-printers]')){openPrintersSheet();return;}
    const mat=e.target.closest('[data-material]');if(mat){openMaterial(mat.dataset.material);return;}
    const priceMat=e.target.closest('[data-price-material]');if(priceMat){appState.priceMaterial=priceMat.dataset.priceMaterial;navigate('prices');renderPrices();return;}
    const prompt=e.target.closest('[data-prompt]');if(prompt){const ta=q('#ff10-project');if(ta){ta.value=prompt.dataset.prompt;ta.focus();}return;}
    if(e.target.closest('[data-advisor-run]')){runAdvisor();return;}
    if(e.target.closest('[data-advisor-reset]')){const ta=q('#ff10-project');if(ta)ta.value='';q('#ff10-advisor-results').innerHTML='';return;}
    if(e.target.closest('[data-market-run]')){loadMarket(true);return;}
    if(e.target.closest('[data-market-refresh]')){loadMarket(true);return;}
    const tool=e.target.closest('[data-tool]');if(tool){navigate(tool.dataset.tool);return;}
    if(e.target.closest('[data-back-more]')){navigate('more');return;}
    const pp=e.target.closest('[data-printer-pick]');if(pp){setActivePrinter(pp.dataset.printerPick);return;}
    if(e.target.closest('[data-calc-run]')){calculateCost();return;}
    const close=e.target.closest('[data-sheet-close]');if(close){closeSheet();return;}
  });
  q('#ff10-sheet-backdrop').addEventListener('click',e=>{if(e.target===e.currentTarget)closeSheet();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeSheet();});
}

function navigate(view){
  const target=q(`#ff10-view-${view}`);if(!target)return;
  appState.view=view;
  qa('.ff10-view').forEach(v=>v.classList.toggle('is-active',v===target));
  const navKey=['compare','cost','alerts','printers','settings'].includes(view)?'more':view;
  qa('.ff10-nav button').forEach(b=>b.classList.toggle('is-active',b.dataset.nav===navKey));
  scrollTo({top:0,behavior:'instant'});
  if(view==='home')renderHome();
  if(view==='advisor')renderAdvisor();
  if(view==='prices')renderPrices();
  if(view==='materials')renderMaterials();
  if(view==='more')renderMore();
  if(view==='compare')renderCompare();
  if(view==='cost')renderCost();
  if(view==='alerts')renderAlerts();
  if(view==='printers')renderPrinters();
  if(view==='settings')renderSettings();
}

function updateTopPrinter(){
  appState.printer=appState.printer||getActivePrinter();
  const span=q('#ff10-printer-button span');if(span)span.textContent=appState.printer.replace('Bambu Lab ','').replace('Creality ','');
}
function pageHero(kicker,title,desc){return `<div class="ff10-hero"><div class="ff10-kicker">${esc(kicker)}</div><h1>${title}</h1><p>${esc(desc)}</p></div>`;}

function renderHome(){
  const mats=rawMaterials();appState.printer=appState.printer||getActivePrinter();
  const offers=appState.market?.offers?.length||0;
  const alerts=appState.alerts.length;
  const sources=appState.health?.sources||11;
  const featured=pickFeatured(mats);
  q('#ff10-view-home').innerHTML=`
    ${pageHero('Filament intelligence','Stampa giusto.<br><em>Al primo colpo.</em>','Materiali, compatibilità e prezzi reali in un’unica app. Meno tentativi, più stampe riuscite.')}
    <div class="ff10-action-grid">
      <button class="ff10-action primary" data-nav="advisor"><span class="ff10-action-icon">${icon('spark')}</span><span class="ff10-arrow">${icon('arrow')}</span><b>Trova il materiale</b><small>Descrivi il pezzo. Al resto pensiamo noi.</small></button>
      <button class="ff10-action secondary-action" data-nav="prices"><span class="ff10-action-icon">${icon('euro')}</span><span class="ff10-arrow">${icon('arrow')}</span><b>Prezzi live</b><small>Confronta gli store.</small></button>
    </div>
    <div class="ff10-section"><div class="ff10-section-head"><div><div class="ff10-kicker">Setup</div><h2>La tua stampante</h2></div><button class="ff10-link" data-open-printers>Cambia</button></div>
      <button class="ff10-printer-card" data-open-printers><span class="ff10-printer-visual">${icon('printer')}</span><span><h3>${esc(appState.printer)}</h3><p>${esc(activePrinterDescription())}</p></span><span class="ff10-state">Attiva</span></button>
    </div>
    <div class="ff10-section"><div class="ff10-stats">
      <div class="ff10-stat"><span>Materiali</span><strong>${mats.length||67}</strong><small>profili tecnici</small></div>
      <div class="ff10-stat"><span>Fonti live</span><strong>${esc(sources)}</strong><small>store monitorati</small></div>
      <div class="ff10-stat"><span>Alert</span><strong>${alerts}</strong><small>${offers?offers+' offerte viste':'monitoraggio prezzi'}</small></div>
    </div></div>
    <div class="ff10-section"><div class="ff10-section-head"><div><div class="ff10-kicker">Scelte rapide</div><h2>Materiali da conoscere</h2></div><button class="ff10-link" data-nav="materials">Tutti</button></div>
      <div class="ff10-card-row">${featured.map(miniMaterialHtml).join('')}</div>
    </div>`;
}
function activePrinterDescription(){
  const p=rawPrinters().find(x=>printerName(x).toLowerCase()===String(appState.printer).toLowerCase());
  return p?printerDesc(p):'Profilo attivo · compatibilità usata nei consigli';
}
function pickFeatured(mats){
  const wanted=['PLA','PETG','ASA'];
  const out=[];
  for(const w of wanted){const m=mats.find(x=>matName(x).toUpperCase()===w)||mats.find(x=>matName(x).toUpperCase().startsWith(w));if(m&&!out.includes(m))out.push(m);}
  for(const m of mats){if(out.length>=3)break;if(!out.includes(m))out.push(m);}return out;
}
function miniMaterialHtml(m){const p=profile(m),a=accentFor(m);return `<button class="ff10-mini-material" style="--mat:${a}" data-material="${esc(matName(m))}"><span class="ff10-material-dot">${esc(matFamily(m).slice(0,3).toUpperCase())}</span><h3>${esc(matName(m))}</h3><p>${esc(matDesc(m))}</p><span class="ff10-mini-foot"><b>${p.ease>=80?'Facile da stampare':p.heat>=75?'Resiste al calore':'Profilo tecnico'}</b><span>${tempText(m,'nozzle')} ugello</span></span></button>`;}

function renderAdvisor(){
  q('#ff10-view-advisor').innerHTML=`${pageHero('Material advisor','Dimmi cosa devi <em>stampare.</em>','Descrivilo come lo diresti a una persona: uso, ambiente, carico, aspetto e priorità.')}
    <div class="ff10-advisor-box">
      <div class="ff10-advisor-top"><div><h2>Il tuo progetto</h2><p>Più dettagli dai, più sensato sarà il ranking.</p></div><button class="ff10-reset" data-advisor-reset>Azzera</button></div>
      <textarea class="ff10-textarea" id="ff10-project" placeholder="Es. staffa per telefono da lasciare in auto d'estate: deve reggere caldo e vibrazioni, preferisco nero opaco..."></textarea>
      <div class="ff10-chips"><button class="ff10-chip" data-prompt="Statuina dettagliata da verniciare, priorità qualità estetica e facilità di stampa">Statuina</button><button class="ff10-chip" data-prompt="Componente automotive da usare in auto, resistente al caldo e alle vibrazioni">Automotive</button><button class="ff10-chip" data-prompt="Pezzo da usare all'aperto, sole, pioggia e raggi UV">Outdoor</button><button class="ff10-chip" data-prompt="Parte meccanica resistente, con carico e urti ripetuti">Meccanica</button><button class="ff10-chip" data-prompt="Pezzo flessibile, elastico e resistente agli urti">Flessibile</button></div>
      <div class="ff10-advisor-actions"><button class="ff10-button primary" data-advisor-run>${icon('spark')}Analizza progetto</button><button class="ff10-button secondary" data-nav="materials">Catalogo</button></div>
    </div><div id="ff10-advisor-results"></div>`;
}
function advisorScore(m,text){
  const p=profile(m),s=familyKey(m),t=text.toLowerCase();let score=p.ease*.29+p.strength*.25+p.heat*.22+p.finish*.24;
  const add=(rx,val)=>{if(rx.test(t))score+=val;};
  if(/cald|estate|auto|motore|temperatur/.test(t)){if(/ASA|PC|NYLON|\bPA\b|ABS|PCTG/.test(s))score+=25;if(/PLA/.test(s)&&!/HIGH|HT/.test(s))score-=28;score+=p.heat*.13;}
  if(/outdoor|estern|sole|uv|piogg/.test(t)){if(/ASA/.test(s))score+=34;if(/PETG|PCTG/.test(s))score+=14;if(/PLA/.test(s))score-=19;}
  if(/fless|elastic|gomma|cover|paracolp/.test(t)){if(/TPU|TPE|FLEX/.test(s))score+=50;else score-=22;}
  if(/statu|anime|decor|estetic|dettagl|miniatur|cosplay/.test(t)){if(/PLA|SILK/.test(s))score+=29;score+=p.finish*.14;}
  if(/meccan|ingran|carico|urti|resisten|staffa|support/.test(t)){if(/PETG|PCTG|NYLON|\bPA\b|PC|CF|GF/.test(s))score+=24;score+=p.strength*.14;}
  if(/facil|semplic|veloc|prototip/.test(t)){if(/PLA|PETG/.test(s))score+=25;score+=p.ease*.12;}
  if(/legger|lightweight/.test(t)&&/LW|LIGHT/.test(s))score+=40;
  if(/trasparen/.test(t)&&/PETG|PC|PCTG/.test(s))score+=18;
  if(/support|solubil/.test(t)&&/PVA|SUPPORT|HIPS/.test(s))score+=42;
  add(/econom|costo|risparm/,/PLA|PETG/.test(s)?15:0);
  return clamp(score,0,100);
}
function runAdvisor(){
  const text=(q('#ff10-project')?.value||'').trim();if(text.length<4){toast('Descrivi prima il progetto');return;}
  const mats=rawMaterials();
  const ranked=mats.map(m=>({m,score:advisorScore(m,text)})).sort((a,b)=>b.score-a.score).slice(0,4);
  const box=q('#ff10-advisor-results');
  box.innerHTML=`<div class="ff10-section"><div class="ff10-section-head"><div><div class="ff10-kicker">Risultato</div><h2>Le scelte più sensate</h2><p>Ranking tecnico basato sul progetto e sui profili materiali.</p></div></div><div class="ff10-results">${ranked.map((r,i)=>`<button class="ff10-result ${i===0?'is-best':''}" data-material="${esc(matName(r.m))}"><span><span class="ff10-result-rank">${i===0?'Migliore scelta':'Alternativa '+(i+1)}</span><h3>${esc(matName(r.m))}</h3><p>${esc(matDesc(r.m))}</p></span><span class="ff10-score">${Math.round(r.score)}</span></button>`).join('')}</div></div>`;
  box.scrollIntoView({behavior:'smooth',block:'start'});
}

function renderPrices(){
  const mats=rawMaterials();
  const names=mats.map(matName).sort((a,b)=>a.localeCompare(b,'it'));
  if(!names.includes(appState.priceMaterial))appState.priceMaterial=names.find(x=>x.toUpperCase().startsWith('PLA'))||names[0]||'PLA';
  const data=appState.market;
  q('#ff10-view-prices').innerHTML=`${pageHero('Marketplace','Prezzi chiari.<br><em>Niente casino.</em>','Cerca una bobina e confronta subito il costo reale tra le fonti disponibili.')}
    <div class="ff10-panel">
      <div class="ff10-market-controls">
        <div class="ff10-field"><label>Materiale</label><select class="ff10-select" id="ff10-price-material">${names.map(n=>`<option ${n===appState.priceMaterial?'selected':''}>${esc(n)}</option>`).join('')}</select></div>
        <div class="ff10-field"><label>Quantità</label><select class="ff10-select" id="ff10-price-qty"><option value="1">1 bobina</option><option value="2">2 bobine</option><option value="3">3 bobine</option><option value="5">5 bobine</option></select></div>
        <button class="ff10-button primary wide" data-market-run>${icon('search')}Cerca prezzi</button>
      </div>
      <div class="ff10-market-status"><span class="ff10-live-dot"></span><span>${data?marketStatusText(data):'11 fonti configurate · aggiornamento su richiesta'}</span></div>
    </div>
    <div id="ff10-market-results">${data?marketHtml(data):'<div class="ff10-section"><div class="ff10-empty">Scegli il materiale e avvia una ricerca. Ti mostro prima l’offerta più interessante, poi le alternative.</div></div>'}</div>`;
  const sel=q('#ff10-price-material');if(sel)sel.addEventListener('change',()=>{appState.priceMaterial=sel.value;});
}
function marketStatusText(data){
  const sources=Array.isArray(data.sources)?data.sources:[];const ok=sources.filter(s=>s.ok!==false).length;
  return `${ok||sources.length}/${sources.length||11} fonti raggiunte · ${Array.isArray(data.offers)?data.offers.length:0} offerte`;
}
function plausibleColor(v){const s=String(v||'').trim();return !!s&&s.length<35&&!/\b(?:kg|unit|pcs|spool|bobina|filament|filamento|bundle)\b/i.test(s)&&(s.match(/\s+/g)||[]).length<5;}
function num(v){const n=Number(String(v??'').replace(',','.').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:null;}
function money(v){const n=num(v);return n===null?'—':new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(n);}
function normalizeOffer(o){
  const price=first(o,['delivered_total','delivered','total','final_price','price_total','price'],null);
  const perkg=first(o,['price_per_kg','per_kg','eur_per_kg'],null);
  const storeObj=first(o,['source','store','shop','vendor'],'');
  const store=typeof storeObj==='object'?first(storeObj,['name','label','id'],'Store'):storeObj;
  return {
    title:String(first(o,['title','name','product','product_name'],'Filamento')),
    brand:String(first(o,['brand','manufacturer'],'')),
    store:String(first(o,['source_name','store_name'],store||'Store')),
    price,
    perkg,
    shipping:first(o,['shipping','shipping_cost','delivery_cost'],null),
    color:String(first(o,['color','colour','variant'],'')),
    url:String(first(o,['url','link','product_url'],'')),
    available:first(o,['available','in_stock','stock'],true)!==false
  };
}
function safeUrl(url){try{const u=new URL(url,location.href);return /^https?:$/.test(u.protocol)?u.href:'';}catch{return '';}}
function marketHtml(data){
  const offers=(Array.isArray(data.offers)?data.offers:[]).map(normalizeOffer).filter(o=>o.available!==false);
  offers.sort((a,b)=>(num(a.price)??1e9)-(num(b.price)??1e9));
  if(!offers.length)return '<div class="ff10-section"><div class="ff10-empty">Nessuna offerta utile trovata adesso. Prova ad aggiornare o cambia materiale.</div></div>';
  const best=offers[0],url=safeUrl(best.url);
  return `<div class="ff10-best-deal"><div class="ff10-best-label">Miglior prezzo trovato</div><h2>${esc(best.brand||appState.priceMaterial)} · ${esc(best.store)}</h2><p>${esc(best.title)}</p><div class="ff10-deal-price"><span><strong>${money(best.price)}</strong><small>${best.perkg?money(best.perkg)+'/kg':'prezzo mostrato dalla fonte'}</small></span>${url?`<a class="ff10-button primary" href="${esc(url)}" target="_blank" rel="noopener">Apri ${icon('external')}</a>`:''}</div></div>
    <div class="ff10-section"><div class="ff10-section-head"><div><div class="ff10-kicker">Alternative</div><h2>Confronta le offerte</h2></div><button class="ff10-link" data-market-refresh>Aggiorna</button></div><div class="ff10-offer-list">${offers.slice(1,31).map(offerHtml).join('')}</div></div>`;
}
function offerHtml(o){const url=safeUrl(o.url);const meta=compact([o.brand,plausibleColor(o.color)?o.color:'',o.shipping!==null&&o.shipping!==''?`sped. ${money(o.shipping)}`:'']);return `<article class="ff10-offer"><div><div class="ff10-offer-store">${esc(o.store)}</div><h3>${esc(o.title)}</h3><div class="ff10-offer-meta">${meta.map(x=>`<span>${esc(x)}</span>`).join('')}</div></div><div class="ff10-offer-price"><strong>${money(o.price)}</strong><small>${o.perkg?money(o.perkg)+'/kg':'totale indicato'}</small></div>${url?`<a href="${esc(url)}" target="_blank" rel="noopener">Apri offerta</a>`:''}</article>`;}
async function loadMarket(refresh=true){
  const mat=q('#ff10-price-material')?.value||appState.priceMaterial;const qty=q('#ff10-price-qty')?.value||'1';appState.priceMaterial=mat;
  const results=q('#ff10-market-results');if(results)results.innerHTML='<div class="ff10-section"><div class="ff10-empty ff10-skeleton">Ricerca prezzi in corso…</div></div>';
  try{
    const url=`/api/catalog?material=${encodeURIComponent(mat)}&brand=all&qty=${encodeURIComponent(qty)}&refresh=${refresh?1:0}`;
    const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw new Error('HTTP '+r.status);const data=await r.json();appState.market=data;
    if(results)results.innerHTML=marketHtml(data);const st=q('.ff10-market-status span:last-child');if(st)st.textContent=marketStatusText(data);
  }catch(err){if(results)results.innerHTML=`<div class="ff10-section"><div class="ff10-empty">Non riesco a completare la ricerca adesso.<br>${esc(err.message)}</div></div>`;}
}

function renderMaterials(){
  const mats=rawMaterials();const cats=['Tutti','Facili','Engineering','Flessibili','Speciali','Supporti'];
  const query=appState.materialSearch.toLowerCase();
  const shown=mats.filter(m=>{
    const cat=categoryOf(m);if(appState.materialFilter!=='Tutti'&&cat!==appState.materialFilter)return false;
    return !query||(matName(m)+' '+matDesc(m)+' '+materialTags(m).join(' ')).toLowerCase().includes(query);
  });
  q('#ff10-view-materials').innerHTML=`${pageHero('Catalogo materiali','Conosci davvero<br><em>cosa stai stampando.</em>','Schede pulite, dati utili e differenze leggibili senza trasformare tutto in una tabella.')}
    <div class="ff10-search-wrap">${icon('search')}<input class="ff10-input" id="ff10-material-search" placeholder="Cerca materiale, uso o proprietà…" value="${esc(appState.materialSearch)}"></div>
    <div class="ff10-chips" id="ff10-material-filters">${cats.map(c=>`<button class="ff10-chip ${c===appState.materialFilter?'is-active':''}" data-mat-filter="${c}">${c}</button>`).join('')}</div>
    <div class="ff10-section"><div class="ff10-section-head"><div><div class="ff10-kicker">${shown.length} profili</div><h2>${appState.materialFilter==='Tutti'?'Tutti i materiali':appState.materialFilter}</h2></div></div><div class="ff10-material-grid" id="ff10-material-grid">${shown.map(materialCardHtml).join('')}</div></div>`;
  const inp=q('#ff10-material-search');if(inp)inp.addEventListener('input',()=>{appState.materialSearch=inp.value;updateMaterialGrid();});
  q('#ff10-material-filters')?.addEventListener('click',e=>{const b=e.target.closest('[data-mat-filter]');if(!b)return;appState.materialFilter=b.dataset.matFilter;renderMaterials();});
}
function updateMaterialGrid(){
  const mats=rawMaterials();const query=appState.materialSearch.toLowerCase();const shown=mats.filter(m=>(appState.materialFilter==='Tutti'||categoryOf(m)===appState.materialFilter)&&(!query||(matName(m)+' '+matDesc(m)+' '+materialTags(m).join(' ')).toLowerCase().includes(query)));
  const grid=q('#ff10-material-grid');if(grid)grid.innerHTML=shown.map(materialCardHtml).join('');
}
function materialCardHtml(m){
  const p=profile(m),a=accentFor(m);return `<button class="ff10-material" style="--mat:${a}" data-material="${esc(matName(m))}"><span class="ff10-material-head"><span class="ff10-material-badge">${esc(matFamily(m).slice(0,3).toUpperCase())}</span><span class="ff10-compat">${p.ease>=80?'Facile':p.heat>=80?'Tecnico':'Profilo'}</span></span><h3>${esc(matName(m))}</h3><p>${esc(matDesc(m))}</p><span class="ff10-spec-row"><span class="ff10-spec">${esc(tempText(m,'nozzle'))} ugello</span><span class="ff10-spec">${esc(tempText(m,'bed'))} piano</span></span><span class="ff10-profile"><i style="--v:${p.ease}%"></i><i style="--v:${p.strength}%"></i><i style="--v:${p.heat}%"></i><i style="--v:${p.finish}%"></i></span></button>`;
}
function openMaterial(name){
  const m=rawMaterials().find(x=>matName(x)===name);if(!m)return;const p=profile(m),a=accentFor(m),tags=materialTags(m);
  openSheet(`<div class="ff10-sheet-top"><div class="ff10-kicker">Scheda materiale</div><button class="ff10-sheet-close" data-sheet-close>${icon('x')}</button></div>
    <div class="ff10-detail-hero" style="--mat:${a}"><div class="ff10-kicker">${esc(matFamily(m))}</div><h2>${esc(matName(m))}</h2><p>${esc(matDesc(m))}</p></div>
    <div class="ff10-detail-metrics"><div class="ff10-detail-metric"><small>Ugello</small><strong>${esc(tempText(m,'nozzle'))}</strong></div><div class="ff10-detail-metric"><small>Piano</small><strong>${esc(tempText(m,'bed'))}</strong></div><div class="ff10-detail-metric"><small>Velocità</small><strong>${esc(speedText(m))}</strong></div><div class="ff10-detail-metric"><small>Densità</small><strong>${esc(densityText(m))}</strong></div></div>
    <div class="ff10-detail-section"><h3>Profilo</h3>${metricHtml('Facilità di stampa',p.ease,a)}${metricHtml('Resistenza',p.strength,a)}${metricHtml('Calore',p.heat,a)}${metricHtml('Finitura',p.finish,a)}</div>
    <div class="ff10-detail-section"><h3>Ideale per</h3><div class="ff10-tags">${tags.map(t=>`<span class="ff10-tag">${esc(t)}</span>`).join('')}</div></div>
    <div class="ff10-detail-section"><button class="ff10-button primary" style="width:100%" data-price-material="${esc(matName(m))}">${icon('euro')}Vedi prezzi live</button></div>`);
}
function metricHtml(label,value,color){return `<div class="ff10-metric"><div class="ff10-metric-head"><span>${esc(label)}</span><span>${Math.round(value)}/100</span></div><div class="ff10-track"><span style="--value:${value}%;--metric:${color}"></span></div></div>`;}

function renderMore(){
  q('#ff10-view-more').innerHTML=`${pageHero('Strumenti','Tutto il resto.<br><em>Senza nasconderlo.</em>','Confronta materiali, calcola costi, gestisci alert e stampanti in un solo posto.')}
    <div class="ff10-tool-grid"><button class="ff10-tool" data-tool="compare"><span class="ff10-tool-icon">${icon('compare')}</span><b>Confronta</b><small>Due materiali faccia a faccia</small></button><button class="ff10-tool" data-tool="cost"><span class="ff10-tool-icon">${icon('calc')}</span><b>Costi</b><small>Materiale + energia</small></button><button class="ff10-tool" data-tool="alerts"><span class="ff10-tool-icon">${icon('bell')}</span><b>Alert</b><small>Ribassi e disponibilità</small></button><button class="ff10-tool" data-tool="printers"><span class="ff10-tool-icon">${icon('printer')}</span><b>Stampanti</b><small>Profilo attivo e compatibilità</small></button><button class="ff10-tool wide" data-tool="settings"><span class="ff10-tool-icon">${icon('settings')}</span><b>Impostazioni</b><small>Versione, dati e sorgenti</small></button></div>`;
}
function subhead(title){return `<div class="ff10-subhead"><button class="ff10-back" data-back-more>${icon('back')}</button><h1>${esc(title)}</h1></div>`;}
function renderCompare(){
  const mats=rawMaterials();const names=mats.map(matName);const a=names[0]||'PLA',b=names.find(n=>n!==a)||'PETG';
  q('#ff10-view-compare').innerHTML=`${subhead('Confronta')}<div class="ff10-panel"><div class="ff10-compare-grid"><div class="ff10-field"><label>Materiale A</label><select class="ff10-select" id="ff10-compare-a">${names.map((n,i)=>`<option ${i===0?'selected':''}>${esc(n)}</option>`).join('')}</select></div><div class="ff10-field"><label>Materiale B</label><select class="ff10-select" id="ff10-compare-b">${names.map(n=>`<option ${n===b?'selected':''}>${esc(n)}</option>`).join('')}</select></div></div></div><div id="ff10-compare-results" class="ff10-section"></div>`;
  const draw=()=>{const ma=mats.find(m=>matName(m)===q('#ff10-compare-a').value),mb=mats.find(m=>matName(m)===q('#ff10-compare-b').value);q('#ff10-compare-results').innerHTML=`<div class="ff10-compare-grid">${[ma,mb].map(compareCardHtml).join('')}</div>`;};
  q('#ff10-compare-a').addEventListener('change',draw);q('#ff10-compare-b').addEventListener('change',draw);draw();
}
function compareCardHtml(m){if(!m)return'';const p=profile(m),a=accentFor(m);return `<div class="ff10-compare-card"><span class="ff10-material-badge" style="--mat:${a};background:color-mix(in srgb,${a} 13%,transparent);color:${a}">${esc(matFamily(m).slice(0,3).toUpperCase())}</span><h3>${esc(matName(m))}</h3>${metricHtml('Facilità',p.ease,a)}${metricHtml('Resistenza',p.strength,a)}${metricHtml('Calore',p.heat,a)}${metricHtml('Finitura',p.finish,a)}<div class="ff10-spec-row"><span class="ff10-spec">${esc(tempText(m,'nozzle'))}</span><span class="ff10-spec">${esc(tempText(m,'bed'))}</span></div></div>`;}

function renderCost(){
  q('#ff10-view-cost').innerHTML=`${subhead('Calcola costo')}<div class="ff10-panel"><div class="ff10-market-controls"><div class="ff10-field"><label>Grammi usati</label><input class="ff10-input" id="ff10-calc-g" type="number" value="120" min="0"></div><div class="ff10-field"><label>Prezzo filamento €/kg</label><input class="ff10-input" id="ff10-calc-kg" type="number" value="20" min="0" step="0.1"></div><div class="ff10-field"><label>Ore di stampa</label><input class="ff10-input" id="ff10-calc-h" type="number" value="5" min="0" step="0.1"></div><div class="ff10-field"><label>Consumo medio W</label><input class="ff10-input" id="ff10-calc-w" type="number" value="120" min="0"></div><div class="ff10-field wide"><label>Energia €/kWh</label><input class="ff10-input" id="ff10-calc-kwh" type="number" value="0.30" min="0" step="0.01"></div><button class="ff10-button primary wide" data-calc-run>Calcola</button></div><div id="ff10-calc-output"></div></div>`;
  calculateCost();
}
function calculateCost(){
  const get=id=>Math.max(0,parseFloat(q(id)?.value)||0);const g=get('#ff10-calc-g'),kg=get('#ff10-calc-kg'),h=get('#ff10-calc-h'),w=get('#ff10-calc-w'),kwh=get('#ff10-calc-kwh');const material=g/1000*kg,energy=h*w/1000*kwh,total=material+energy;const out=q('#ff10-calc-output');if(out)out.innerHTML=`<div class="ff10-calc-result"><small>Costo stimato materiale + energia</small><strong>${money(total)}</strong><small>Materiale ${money(material)} · energia ${money(energy)}</small></div>`;
}

function renderAlerts(){
  q('#ff10-view-alerts').innerHTML=`${subhead('Alert prezzi')}<div class="ff10-section-head"><div><div class="ff10-kicker">Monitoraggio locale</div><h2>${appState.alerts.length} alert attivi</h2><p>Controllati dal backend senza cambiare la persistenza esistente.</p></div><button class="ff10-link" data-nav="prices">Prezzi</button></div><div>${appState.alerts.length?appState.alerts.map(alertHtml).join(''):'<div class="ff10-empty">Nessun alert attivo. Cerca un prodotto nei Prezzi per iniziare a monitorarlo.</div>'}</div>`;
}
function alertHtml(a){return `<div class="ff10-alert-item"><h3>${esc(first(a,['name','title','material','product'],'Alert'))}</h3><p>${esc(first(a,['description','target','type','condition'],'Monitoraggio prezzo/disponibilità'))}</p></div>`;}

function renderPrinters(){
  const ps=rawPrinters();q('#ff10-view-printers').innerHTML=`${subhead('Stampanti')}<div class="ff10-section-head"><div><div class="ff10-kicker">${ps.length||43} profili</div><h2>Scegli la macchina attiva</h2></div></div><div>${ps.slice(0,80).map(printerItemHtml).join('')||'<div class="ff10-empty">I profili stampante non sono disponibili nel frontend.</div>'}</div>`;
}
function printerItemHtml(p){const n=printerName(p),sel=n===appState.printer;return `<button class="ff10-printer-item ${sel?'is-selected':''}" style="width:100%;text-align:left" data-printer-pick="${esc(n)}"><h3>${esc(n)}</h3><p>${esc(printerDesc(p))}</p></button>`;}
function openPrintersSheet(){
  const ps=rawPrinters();openSheet(`<div class="ff10-sheet-top"><div><div class="ff10-kicker">Stampante attiva</div><h2 style="margin:6px 0 0;font-size:25px;letter-spacing:-.04em">${esc(appState.printer||getActivePrinter())}</h2></div><button class="ff10-sheet-close" data-sheet-close>${icon('x')}</button></div><div style="margin-top:14px">${ps.slice(0,60).map(printerItemHtml).join('')||'<div class="ff10-empty">Nessun profilo trovato.</div>'}</div>`);
}

function renderSettings(){
  const mats=rawMaterials(),ps=rawPrinters(),h=appState.health||{};
  q('#ff10-view-settings').innerHTML=`${subhead('Impostazioni')}<div class="ff10-panel"><div class="ff10-kicker">Filament Finder</div><h2 style="font-size:28px;letter-spacing:-.05em;margin:10px 0 6px">Versione ${VERSION}</h2><p style="color:var(--ff10-text-3);font-size:11px;line-height:1.5;margin:0">Nuovo frontend premium. Backend prezzi, alert, storico e dati persistenti restano separati e invariati.</p></div><div class="ff10-section"><div class="ff10-stats"><div class="ff10-stat"><span>Materiali</span><strong>${mats.length||67}</strong></div><div class="ff10-stat"><span>Stampanti</span><strong>${ps.length||43}</strong></div><div class="ff10-stat"><span>Fonti</span><strong>${h.sources||11}</strong></div></div></div><div class="ff10-section"><div class="ff10-alert-item"><h3>Dati locali</h3><p>Preferenze e dati persistenti continuano a usare il volume /data di Umbrel.</p></div><div class="ff10-alert-item"><h3>Motore prezzi</h3><p>${esc(h.ok===false?'Non disponibile':'Attivo')} · monitoraggio backend indipendente dalla nuova interfaccia.</p></div></div>`;
}

function openSheet(html){q('#ff10-sheet-content').innerHTML=html;q('#ff10-sheet-backdrop').classList.add('is-open');document.documentElement.style.overflow='hidden';}
function closeSheet(){q('#ff10-sheet-backdrop')?.classList.remove('is-open');document.documentElement.style.overflow='';}
let toastTimer;function toast(msg){const t=q('#ff10-toast');if(!t)return;t.textContent=msg;t.classList.add('is-show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('is-show'),1800);}

async function hydrate(){
  appState.printer=getActivePrinter();updateTopPrinter();
  await Promise.allSettled([
    fetch('/api/health',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(x=>{if(x)appState.health=x;}),
    fetch('/api/alerts',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(x=>{appState.alerts=Array.isArray(x)?x:Array.isArray(x?.alerts)?x.alerts:[];})
  ]);
  renderHome();
}

function init(){
  if(q('#ff10-app'))return;
  buildShell();appState.printer=getActivePrinter();updateTopPrinter();renderHome();renderAdvisor();renderPrices();renderMaterials();renderMore();hydrate();
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
