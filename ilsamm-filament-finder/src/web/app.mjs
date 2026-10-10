import {money, printerName, safeUrl, compatibility, recommend, filterOffers, mergeSource, costEstimate} from './domain.mjs';

const $ = (selector, root = document) => root.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths = {
  home:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  materials:'<path d="m12 3 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 16l9 5 9-5"/>',
  prices:'<path d="M20 13 11 22 2 13V3h10l8 10Z"/><circle cx="7" cy="8" r="1.5"/>',
  advisor:'<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z"/>',
  compare:'<path d="M4 7h16l-4-4M20 17H4l4 4M20 7l-4 4M4 17l4-4"/>',
  cost:'<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M8 6h8M8 11h1m5 0h1m-7 4h1m5 0h1m-7 4h1m5 0h1"/>',
  alerts:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4"/>',
  settings:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 1v3m0 16v3M1 12h3m16 0h3"/>',
  printer:'<path d="M7 9V3h10v6M7 17H3V9h18v8h-4M7 14h10v7H7zM17 11h1"/>',
  arrow:'<path d="M4 12h15m-5-5 5 5-5 5"/>', search:'<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/>',
  external:'<path d="M14 3h7v7m0-7L10 14M10 3H3v18h18v-7"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.materials}</svg>`;
const routes = {home:'Panoramica', materials:'Materiali', prices:'Ricerca prezzi', advisor:'Consigliere', compare:'Confronta', cost:'Calcolo costi', alerts:'Alert prezzi', settings:'Impostazioni'};
const storage = {
  get(key, fallback = null) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { toast('Preferenze disponibili solo per questa sessione.'); } },
};
const state = {catalog:{materials:[],printers:[],brands:[]}, health:null, sources:[], printer:null, route:'home',
  materialQuery:'', group:'all', compatibleOnly:false, market:null, marketContext:null, marketError:'', busy:false,
  search:{material:'PLA',brand:'all',qty:1}, filters:{query:'',store:'',format:'',stock:true,sort:'price'}, page:1,
  alerts:[],events:[], alertsError:'', project:'', recommendations:[], compare:['pla','petg'],
  calc:{grams:120,price:20,hours:5,watts:120,energy:.30}, epoch:0, retrying:new Set()};
let searchController, toastTimer;
const materialById = id => state.catalog.materials.find(m => m.id === id);
const badge = (text, level='') => `<span class="badge ${esc(level)}">${esc(text)}</span>`;
const button = (text, action, kind='secondary') => `<button type="button" class="button ${kind}" data-action="${action}">${text}</button>`;
const link = (route, text, kind='text-link') => `<a class="${kind}" href="#${route}">${text}</a>`;
const header = (eyebrow,title,copy,extra='') => `<div class="page-heading"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p>${copy}</p></div>${extra}</div>`;
const empty = (title,copy,action='') => `<div class="empty">${icon('search')}<h3>${title}</h3><p>${copy}</p>${action}</div>`;
const options = (items, selected) => items.map(([value,label]) => `<option value="${esc(value)}" ${String(value)===String(selected)?'selected':''}>${esc(label)}</option>`).join('');
const range = values => Array.isArray(values) ? `${values.join('–')} °C` : '—';
const date = value => { const d=new Date(value); return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('it-IT',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}); };

async function api(path, {body, signal, timeout=30000}={}) {
  const deadline = new AbortController();
  const abort = () => deadline.abort();
  signal?.addEventListener('abort', abort, {once:true});
  if (signal?.aborted) deadline.abort();
  const timer = setTimeout(abort, timeout);
  try {
    const response=await fetch(path, {signal:deadline.signal,cache:'no-store',...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
    const data=await response.json();
    if(!response.ok) throw new Error(data.error || `Richiesta non riuscita (${response.status})`);
    return data;
  } catch(error) {
    if(error.name==='AbortError' && !signal?.aborted) throw new Error('Il server impiega troppo tempo. Riprova tra poco.');
    throw error;
  } finally { clearTimeout(timer); signal?.removeEventListener('abort',abort); }
}
function toast(message) { const node=$('#toast'); node.textContent=message; node.classList.add('visible'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>node.classList.remove('visible'),4000); }
function openDialog(title,html) { $('#dialog-title').textContent=title; $('#dialog-content').innerHTML=html; if(!$('#detail-dialog').open) $('#detail-dialog').showModal(); }
function closeDialog() { $('#detail-dialog').close(); }
function updatePrinter() { $('#printer-button').innerHTML=`${icon('printer')}<span>${esc(printerName(state.printer))}</span>`; }
function navigate() {
  const route=location.hash.slice(1);
  state.route=Object.hasOwn(routes,route)?route:'home';
  $('#page-name').textContent=routes[state.route];
  document.title=`${routes[state.route]} · Filament Finder`;
  document.querySelectorAll('[data-route]').forEach(a=>{ if(a.dataset.route===state.route) a.setAttribute('aria-current','page'); else a.removeAttribute('aria-current'); });
  closeDialog(); render(); window.scrollTo(0,0); $('#main').focus({preventScroll:true});
}
function render() { $('#main').innerHTML=({home:homeView,materials:materialsView,prices:pricesView,advisor:advisorView,compare:compareView,cost:costView,alerts:alertsView,settings:settingsView})[state.route](); }

function spoolArt() {
  return `<div class="hero-art" aria-hidden="true"><svg viewBox="0 0 370 290"><defs><linearGradient id="flange" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#718646"/><stop offset="1" stop-color="#293e29"/></linearGradient><linearGradient id="filament" x1="0" x2="1"><stop stop-color="#b8cf70"/><stop offset=".6" stop-color="#d4e29e"/><stop offset="1" stop-color="#92ad58"/></linearGradient></defs><g transform="translate(40 6) rotate(-15 150 145)"><ellipse cx="216" cy="127" rx="71" ry="96" fill="url(#flange)"/><path d="M84 46h111c38 0 68 37 68 85s-30 85-68 85H84Z" fill="url(#filament)"/><g stroke="#748f4f" opacity=".35" fill="none">${Array.from({length:22},(_,i)=>`<path d="M${97+i*5} 48c42 11 44 153 0 166"/>`).join('')}</g><ellipse cx="91" cy="131" rx="75" ry="99" fill="url(#flange)"/><ellipse cx="91" cy="131" rx="57" ry="78" fill="#354d2c" stroke="#8d9f5c" stroke-width="2"/><ellipse cx="91" cy="131" rx="24" ry="35" fill="#1f3628" stroke="#71884b" stroke-width="9"/><g fill="#afbc72" opacity=".8"><path d="m75 66 17-10 16 12-7 20-17 3Z"/><path d="m44 120 4-23 18 2 6 19-9 18Z"/><path d="m43 161 17-9 17 14-4 24-20-10Z"/><path d="m94 178 22-9 13 17-15 20-19-4Z"/><path d="m127 112 12-11 7 18-1 32-16 3-7-15Z"/></g></g><path d="M221 240c50 2 82 40 105 12s-4-48-20-26" fill="none" stroke="#99b264" stroke-width="3"/></svg><span class="art-caption">DAL MATERIALE ALL’IDEA.</span></div>`;
}
function homeView() {
  const featured=['pla','petg','asa'].map(materialById).filter(Boolean);
  return `${header('BENVENUTO NEL TUO LABORATORIO','Una buona stampa inizia qui.','Tutto quello che serve per scegliere il prossimo filamento.',`<span class="date-stamp">${new Date().toLocaleDateString('it-IT',{weekday:'long',day:'numeric',month:'long'})}</span>`)}
    <section class="hero"><div class="hero-copy"><div class="eyebrow">MENO TENTATIVI. PIÙ IDEE.</div><h1>Il materiale giusto.<br><em>Per la tua prossima idea.</em></h1><p>Confronta le caratteristiche, verifica la tua stampante e trova il prezzo che cerchi.</p><div class="hero-actions">${link('advisor',`${icon('advisor')} Trova il mio materiale`,'button primary')}${link('prices','Esplora i prezzi '+icon('arrow'),'button ghost')}</div></div>${spoolArt()}</section>
    <div class="stats"><div class="stat"><div class="stat-icon">${icon('materials')}</div><div><strong>${state.catalog.materials.length}</strong><span>Materiali da esplorare</span></div></div><div class="stat"><div class="stat-icon">${icon('prices')}</div><div><strong>${state.sources.length||'—'}</strong><span>Negozi configurati</span></div></div><div class="stat"><div class="stat-icon">${icon('printer')}</div><div><strong>${state.catalog.printers.length}</strong><span>Profili stampante</span></div></div></div>
    <div class="section-heading"><div><h2>Da dove vuoi iniziare?</h2><p>Tre materiali, tre modi diversi di dare forma alle idee.</p></div>${link('materials','Tutti i materiali '+icon('arrow'))}</div><div class="materials-grid featured">${featured.map(materialCard).join('')}</div>
    <div class="bottom-grid"><section class="panel setup"><div class="setup-icon">${icon('printer')}</div><div><div class="eyebrow">IL TUO SETUP</div><h3>${esc(printerName(state.printer))}</h3><p>${state.printer?`${state.printer.nozzleMax} °C ugello · ${state.printer.bedMax} °C piano`:'Attiva i consigli sulla compatibilità.'}</p></div><button class="text-link" data-action="printers">${state.printer?'Cambia':'Seleziona'} ${icon('arrow')}</button></section><section class="panel"><div class="eyebrow">UN OCCHIO AL BUDGET</div><h3>Quanto costa la tua prossima stampa?</h3><p>Filamento ed energia, con i tuoi consumi reali.</p>${link('cost','Apri il calcolatore '+icon('arrow'))}</section></div>`;
}
function materialCard(m) {
  const c=compatibility(m,state.printer);
  return `<button type="button" class="material-card" data-material="${esc(m.id)}" data-family="${esc(m.name.split(/[ +/]/)[0])}"><div class="material-top"><span class="material-mark">${esc(m.name.split(/[ +/]/)[0].slice(0,5))}</span>${badge(state.printer?c.level==='ok'?'Compatibile':c.level==='blocked'?'Setup da adattare':'Da calibrare':m.ease>=4?'Facile':m.ease<=2?'Avanzato':'Intermedio',state.printer?c.level:'')}</div><h3>${esc(m.name)}</h3><p>${esc(m.short)}</p><div class="material-specs"><span>${range(m.t)} ugello</span><span>·</span><span>${range(m.bed)} piano</span></div></button>`;
}
function selectedMaterials() {
  return state.catalog.materials.filter(m=>(state.group==='all'||m.group.includes(state.group)) && (!state.compatibleOnly||compatibility(m,state.printer).level==='ok') && `${m.name} ${m.short} ${m.uses}`.toLowerCase().includes(state.materialQuery.toLowerCase()));
}
function materialsView() {
  return `${header('LA BIBLIOTECA DEI MATERIALI','Conosci cosa stai stampando.','Proprietà, impostazioni e limiti: ogni materiale ha il suo posto nel laboratorio.')}
    <div class="catalog-toolbar"><input id="material-search" type="search" aria-label="Cerca materiale" placeholder="Cerca per nome, uso o proprietà…" value="${esc(state.materialQuery)}"><label class="check-label"><input id="compatible-only" type="checkbox" ${state.compatibleOnly?'checked':''} ${state.printer?'':'disabled'}>Compatibili con la mia stampante</label></div>
    <div class="filter-chips">${[['all','Tutti'],['easy','Facili'],['engineering','Tecnici'],['flex','Flessibili'],['outdoor','Outdoor'],['special','Speciali'],['support','Supporti']].map(([key,label])=>`<button class="chip" data-group="${key}" aria-pressed="${key===state.group}">${label}</button>`).join('')}</div><div id="catalog-results">${catalogResults()}</div>`;
}
function catalogResults() { const rows=selectedMaterials(); return `<p class="catalog-count" role="status">${rows.length} materiali trovati</p>${rows.length?`<div class="materials-grid">${rows.map(materialCard).join('')}</div>`:empty('Nessun materiale trovato','Prova un altro termine o rimuovi i filtri.',button('Azzera filtri','reset-materials'))}`; }
function showMaterial(id) {
  const m=materialById(id); if(!m) return;
  const c=compatibility(m,state.printer);
  openDialog(m.name,`<p class="detail-intro">${esc(m.short)}</p><div class="note ${c.level==='blocked'?'warning':''}"><strong>${esc(c.label)}</strong>${c.reasons.length?`<ul>${c.reasons.map(r=>`<li>${esc(r)}</li>`).join('')}</ul>`:''}</div>
    <div class="detail-specs">${[['Ugello',range(m.t)],['Piano',range(m.bed)],['Densità',m.density||'—'],['Resistenza al calore',m.hdt||'—']].map(([key,value])=>`<div class="detail-spec"><small>${key}</small><strong>${esc(value)}</strong></div>`).join('')}</div>
    <div class="detail-section"><h3>Profilo del materiale</h3>${[['Facilità',m.ease],['Resistenza',m.strength],['Calore',m.heat],['Dettagli',m.detail],['Flessibilità',m.flex]].map(([key,value])=>`<div class="metric"><span>${key}</span><progress max="5" value="${value}" aria-label="${key}"></progress><span>${value}/5</span></div>`).join('')}</div>
    ${[['Ideale per',m.uses],['Quando evitarlo',m.avoid],['Essiccazione',m.dry],['Ventilazione',m.vent],['Velocità e finitura',[m.speed,m.finish].filter(Boolean).join(' · ')]].map(([key,value])=>`<div class="detail-section"><h3>${key}</h3><p>${esc(value||'Consulta la scheda del produttore.')}</p></div>`).join('')}
    <p class="detail-text">Valori indicativi del catalogo. Verifica il profilo e la scheda tecnica della formulazione acquistata; la compatibilità non certifica la riuscita della stampa.</p><div class="hero-actions"><button class="button primary" data-material-prices="${esc(m.id)}">${icon('prices')} Cerca prezzi</button><button class="button secondary" data-add-compare="${esc(m.id)}">${icon('compare')} Confronta</button></div>`);
}
function showPrinters() {
  openDialog('La tua stampante',`<p class="detail-text">Il profilo viene usato per i consigli e le schede materiali. Considera gli eventuali upgrade della tua macchina.</p><input type="search" id="printer-search" aria-label="Cerca stampante" placeholder="Cerca marca o modello…"><div class="printer-list" id="printer-list">${printerRows('')}</div>`);
}
function printerRows(query) { return state.catalog.printers.filter(p=>printerName(p).toLowerCase().includes(query.toLowerCase())).map(p=>`<button class="printer-option" data-printer="${esc(p.id)}" aria-pressed="${p.id===state.printer?.id}"><strong>${esc(printerName(p))}</strong><small>${esc(p.volume.join(' × '))} mm · ${p.nozzleMax} °C ugello · ${p.bedMax} °C piano · ${p.chamber==='open'?'Aperta':p.chamber==='heated'?'Camera riscaldata':'Camera chiusa'}</small></button>`).join('')||empty('Nessuna stampante trovata','Prova a cercare per marca.'); }

function pricesView() {
  return `${header('IL MARKETPLACE DEL LABORATORIO','Il prezzo giusto, senza confusione.','Scegli il materiale e confronta prezzi, formati e disponibilità dei negozi.')}
    <form id="search-form" class="panel search-panel"><div class="form-grid"><div class="field"><label for="search-material">Materiale</label><select id="search-material" name="material">${options(state.catalog.materials.map(m=>[m.name,m.name]),state.search.material)}</select></div><div class="field"><label for="search-brand">Marca</label><select id="search-brand" name="brand">${options([['all','Tutte le marche'],...state.catalog.brands.map(b=>[b.name,b.name])],state.search.brand)}</select></div><div class="field"><label for="search-qty">Confezioni</label><input id="search-qty" name="qty" type="number" min="1" max="50" step="1" required value="${state.search.qty}"></div><button class="button primary" type="submit" ${state.busy?'disabled':''}>${icon('search')} ${state.busy?'Ricerca in corso…':'Cerca prezzi'}</button></div><p class="search-hint"><span>1 confezione può contenere una bobina o un multipack. Il peso è indicato su ogni offerta.</span><span>Prezzi in EUR</span></p></form>
    <div id="market-content">${marketContent()}</div>`;
}
function marketContent() {
  if(state.busy) return `<div class="loading" role="status">Sto interrogando i negozi…<br><small>Le fonti lente non bloccano i risultati disponibili.</small></div><div class="pagination">${button('Annulla ricerca','cancel-search')}</div>`;
  const error=state.marketError?`<div class="note error" role="alert">${esc(state.marketError)} ${button('Riprova','search-again')}</div>`:'';
  if(!state.market) return error||empty('La tua prossima bobina ti aspetta.','Avvia una ricerca per vedere prezzi e disponibilità.');
  return `${error}<div class="filters"><div class="field"><label for="offer-query">Prodotto o colore</label><input id="offer-query" type="search" placeholder="Es. nero, matte…" value="${esc(state.filters.query)}"></div><div class="field"><label for="offer-store">Negozio</label><select id="offer-store">${options([['','Tutti i negozi'],...state.market.sources.map(s=>[s.id,s.name])],state.filters.store)}</select></div><div class="field"><label for="offer-format">Formato</label><select id="offer-format">${options([['','Tutti i formati'],['refill','Refill'],['spool','Con bobina']],state.filters.format)}</select></div><div class="field"><label for="offer-sort">Ordina per</label><select id="offer-sort">${options([['price','Subtotale prodotti'],['kg','Prezzo prodotto / kg'],['total','Totale con spedizione']],state.filters.sort)}</select></div><label class="check-label"><input type="checkbox" id="offer-stock" ${state.filters.stock?'checked':''}>Solo disponibili</label></div>
    <div class="market-layout"><div id="offer-results">${offerResults()}</div><aside class="panel source-panel"><h2>Stato dei negozi</h2><p class="source-summary">${state.market.sources.filter(s=>s.ok).length} di ${state.market.sources.length} fonti raggiunte. I dettagli restano disponibili anche in caso di errore.</p><div class="source-list">${state.market.sources.map(sourceCard).join('')}</div></aside></div>`;
}
function offerResults() {
  const rows=filterOffers(state.market.offers,state.filters,state.marketContext.qty), pages=Math.max(1,Math.ceil(rows.length/24));
  state.page=Math.min(state.page,pages);
  const context=state.marketContext;
  return `<div class="results-heading"><h2>${rows.length} offerte · ${esc(context.material)}</h2><small>${context.qty} confezioni · ${date(state.market.updated_at)}${state.market.cached?' · dalla cache':''}</small></div>
    ${state.filters.sort==='total'?'<p class="note">Prima le offerte con spedizione nota. Quelle con spedizione da verificare seguono in fondo.</p>':''}
    ${rows.length?`<div class="offer-list">${rows.slice((state.page-1)*24,state.page*24).map(o=>offerCard(o)).join('')}</div>`:empty('Nessuna offerta con questi filtri.',state.market.offers.length?'Rimuovi i filtri o mostra anche i prodotti esauriti.':'Controlla lo stato dei negozi e prova un altro materiale.',button('Azzera filtri','reset-offers'))}
    ${pages>1?`<div class="pagination"><button class="button secondary" data-page="${state.page-1}" ${state.page===1?'disabled':''}>Precedente</button><span>${state.page} / ${pages}</span><button class="button secondary" data-page="${state.page+1}" ${state.page===pages?'disabled':''}>Successiva</button></div>`:''}`;
}
function offerCard(o) {
  const originalIndex=state.market.offers.findIndex(x=>x===o); // Domain returns a copy; use a stable signature + URL pair below.
  const index=originalIndex>=0?originalIndex:state.market.offers.findIndex(x=>x.url===o.url&&x.variant_signature===o.variant_signature);
  const stock=o.available===true?badge('Disponibile','ok'):o.available===false?badge('Esaurito','error'):badge('Disponibilità da verificare','unknown');
  return `<article class="offer"><div><span class="offer-store">${esc(o.store)}</span><h3>${esc(o.product)}</h3><div class="offer-meta">${esc([o.brand,o.color,o.format,o.variant].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(' · '))}<br>${o.weight?`${o.weight} kg / confezione · ${o.purchasedKg} kg complessivi`:'Peso netto non verificato'} · ${o.unitPerKg?`${money(o.unitPerKg)}/kg`:'€/kg non disponibile'}</div><div class="offer-actions">${stock}${o.variant_signature?`<button class="text-link" data-alert-offer="${index}">${icon('alerts')} Crea alert</button><button class="text-link" data-history="${index}">Storico</button>`:''}</div></div><div class="offer-price"><strong>${money(o.total??o.subtotal)}</strong>${Number(o.list_price)>o.price?`<small>Prezzo confezione precedente: <del>${money(o.list_price)}</del></small>`:""}<small>${o.total!==null?`Spedizione ${o.shipping===0?'inclusa':money(o.shipping)}`:'Subtotale · spedizione da verificare'}<br>${money(o.price)} / confezione</small><a class="button secondary small" href="${esc(o.href)}" target="_blank" rel="noopener noreferrer">Apri negozio ${icon('external')}</a></div></article>`;
}
function sourceCard(s) {
  const pending=state.retrying.has(s.id), failed=s.ok===false;
  const error=s.error_message||s.diagnostic_error||s.error||'';
  const label=failed?/timeout|budget|timed out/i.test(error)?'Timeout':'Errore':s.results?`${s.results} offerte`:'Nessun risultato';
  return `<div class="source-row"><div class="source-top"><strong>${esc(s.name)}</strong>${badge(pending?'Riprovo…':label,failed?'error':s.results?'ok':'unknown')}</div><details><summary>Dettagli fonte</summary><div class="source-detail">${failed?`<p>${esc(error)}</p>`:''}HTTP: ${esc(s.http_status??'—')} · ${s.ms??s.http_ms??'—'} ms<br><code>${esc(s.request_url||s.search_url||'')}</code>${safeUrl(s.search_url)?`<p><a href="${esc(safeUrl(s.search_url))}" target="_blank" rel="noopener noreferrer">Ricerca nel negozio ${icon('external')}</a></p>`:''}</div></details>${failed?`<button class="text-link" data-retry="${esc(s.id)}" ${pending?'disabled':''}>${pending?'Riprovo…':'Riprova fonte'}</button>`:''}</div>`;
}
function readSearch() { state.search={material:$('#search-material')?.value||state.search.material,brand:$('#search-brand')?.value||state.search.brand,qty:Number($('#search-qty')?.value||state.search.qty)}; }
async function searchMarket() {
  readSearch(); if(!Number.isInteger(state.search.qty)||state.search.qty<1||state.search.qty>50) { toast('Scegli da 1 a 50 confezioni.'); return; }
  searchController?.abort(); searchController=new AbortController(); const signal=searchController.signal;
  const epoch=++state.epoch, context={...state.search}; state.busy=true; state.marketError=''; state.retrying.clear();
  if(state.route==='prices') render();
  try {
    const data=await api('/api/catalog?'+new URLSearchParams({...context,refresh:'1'}),{signal});
    if(epoch!==state.epoch) return;
    state.market=data; state.marketContext=context; state.filters={query:'',store:'',format:'',stock:true,sort:'price'}; state.page=1;
  } catch(error) { if(epoch===state.epoch&&!signal.aborted) state.marketError=error.message; }
  finally { if(epoch===state.epoch) { state.busy=false; if(state.route==='prices') render(); } }
}
async function retrySource(id) {
  if(state.busy||state.retrying.has(id)||!state.marketContext) return;
  const epoch=state.epoch, context={...state.marketContext}; state.retrying.add(id); $('#market-content').innerHTML=marketContent();
  try {
    const data=await api('/api/catalog?'+new URLSearchParams({...context,source:id,refresh:'1'}));
    if(epoch===state.epoch) { state.market=mergeSource(state.market,data,id); toast('Fonte aggiornata.'); }
  } catch(error) { if(epoch===state.epoch) toast(error.message); }
  finally { if(epoch===state.epoch) { state.retrying.delete(id); if(state.route==='prices') $('#market-content').innerHTML=marketContent(); } }
}

function advisorView() {
  return `${header('DAL PROGETTO AL MATERIALE','Cosa vuoi realizzare?','Racconta uso, ambiente e proprietà che contano. Il consiglio considera il profilo della tua stampante.')}
    <div class="advisor-layout"><form id="advisor-form" class="panel"><div class="field"><label for="project">Il tuo progetto</label><textarea id="project" name="project" minlength="4" maxlength="2000" required placeholder="Es. una staffa per il telefono da tenere in auto, resistente al caldo e alle vibrazioni…">${esc(state.project)}</textarea></div><div class="filter-chips">${[['Una statuina dettagliata e facile da verniciare','Statuina'],['Un pezzo da esterno, resistente al sole e alla pioggia','Outdoor'],['Una staffa meccanica resistente agli urti','Meccanica'],['Una cover flessibile ed elastica','Flessibile']].map(([value,label])=>`<button class="chip" type="button" data-prompt="${esc(value)}">${label}</button>`).join('')}</div><button class="button primary" type="submit">${icon('advisor')} Trova i materiali</button></form><aside class="advisor-help"><div class="eyebrow">UN CONSIGLIO PIÙ UTILE</div><h3>Parti da come verrà usato.</h3><ul><li>Starà al caldo o all’aperto?</li><li>Deve reggere carichi o flettersi?</li><li>Contano di più estetica o resistenza?</li></ul><p>${state.printer?`Profilo attivo: <strong>${esc(printerName(state.printer))}</strong>`:'Seleziona una stampante per escludere i materiali che richiedono hardware diverso.'}</p><button class="text-link" type="button" data-action="printers">Cambia stampante ${icon('arrow')}</button></aside></div><div id="advisor-results">${advisorResults()}</div>`;
}
function advisorResults() {
  if(!state.recommendations.length) return '';
  return `<div class="section-heading"><div><h2>Le opzioni per il tuo progetto</h2><p>Confronto basato su regole e profili tecnici. Valida sempre il materiale sul tuo pezzo.</p></div></div>${state.recommendations.map((r,i)=>`<article class="recommendation"><span class="rank">0${i+1}</span><div><h3>${esc(r.material.name)}</h3><p>${esc(r.reasons.join(' · '))}</p>${badge(r.check.label,r.check.level)}</div><button class="text-link" data-material="${esc(r.material.id)}">Scheda ${icon('arrow')}</button></article>`).join('')}`;
}
function compareView() {
  const a=materialById(state.compare[0]),b=materialById(state.compare[1]);
  const rows=[['Ugello',m=>range(m.t)],['Piano',m=>range(m.bed)],['Facilità',m=>`${m.ease}/5`],['Resistenza',m=>`${m.strength}/5`],['Calore',m=>m.hdt||`${m.heat}/5`],['Flessibilità',m=>`${m.flex}/5`],['Essiccazione',m=>m.dry],['Ideale per',m=>m.uses],['Da evitare',m=>m.avoid],['La tua stampante',m=>compatibility(m,state.printer).label]];
  return `${header('FIANCO A FIANCO','Due materiali. Una scelta più chiara.','Confronta le caratteristiche che contano per il tuo progetto.')}<div class="compare-grid">${[0,1].map(i=>`<div class="field"><label for="compare-${i}">Materiale ${i===0?'A':'B'}</label><select id="compare-${i}" data-compare="${i}">${options(state.catalog.materials.map(m=>[m.id,m.name]),state.compare[i])}</select></div>`).join('')}</div><div class="comparison-wrap"><table><thead><tr><th scope="col">Caratteristica</th><th scope="col">${esc(a.name)}</th><th scope="col">${esc(b.name)}</th></tr></thead><tbody>${rows.map(([label,get])=>`<tr><th scope="row">${label}</th><td>${esc(get(a))}</td><td>${esc(get(b))}</td></tr>`).join('')}</tbody></table></div>`;
}
function costView() {
  return `${header('IL COSTO DELLE IDEE','Quanto costa stamparlo?','Una stima trasparente di materiale ed energia. Inserisci i dati dello slicer e la tua tariffa elettrica.')}<div class="compare-grid"><form id="cost-form" class="panel"><div class="form-grid">${[['grams','Filamento utilizzato (g)',1],['price','Prezzo filamento (€/kg)',.01],['hours','Durata (ore)',.1],['watts','Consumo medio (W)',1],['energy','Tariffa energia (€/kWh)',.01]].map(([key,label,step])=>`<div class="field"><label for="calc-${key}">${label}</label><input id="calc-${key}" name="${key}" type="number" min="0" step="${step}" max="1000000" required value="${state.calc[key]}"></div>`).join('')}</div><button class="button primary spaced" type="submit">Calcola costo</button><p class="form-error" id="cost-error" role="alert"></p></form><div id="cost-output">${costOutput()}</div></div>`;
}
function costOutput() { let r; try { r=costEstimate(state.calc); } catch(error) { return `<p class="note warning">${esc(error.message)}</p>`; } return `<section class="cost-result"><div class="eyebrow">COSTO STIMATO</div><strong>${money(r.total)}</strong><p>Per una stampa da ${state.calc.grams} g in ${state.calc.hours} ore.</p><dl><dt>Materiale</dt><dd>${money(r.material)}</dd></dl><dl><dt>Energia</dt><dd>${money(r.electricity)}</dd></dl><p class="spaced">Sono esclusi ammortamento, manutenzione, scarti e tempo di lavoro.</p></section>`; }

async function loadAlerts() {
  try { const data=await api('/api/alerts'); state.alerts=data.alerts; state.events=data.events; state.alertsError=''; }
  catch(error) { state.alertsError=error.message; }
}
function alertsView() {
  return `${header('TIENI D’OCCHIO LE TUE BOBINE','I prezzi cambiano. Tu resti aggiornato.','Alert locali su ribassi e ritorni in stock. Il controllo automatico continua mentre Umbrel è acceso.',button('Aggiorna elenco','reload-alerts'))}
    ${state.alertsError?`<p class="note error" role="alert">${esc(state.alertsError)}</p>`:''}
    ${state.alerts.length?state.alerts.map(a=>`<article class="alert-card"><div><h3>${esc(a.label||a.material)}</h3><p>${a.quantity||1} confezioni · ${a.config?.drop_enabled?`Ribassi da ${esc(a.config.drop_pct)}%`:'Monitoraggio variante'}${a.config?.max_final_enabled?` · Totale consegnato ≤ ${money(a.config.max_final_value)}`:''}${a.config?.back_in_stock?' · Ritorno in stock':''}</p>${badge(a.enabled?'Attivo':'In pausa',a.enabled?'ok':'unknown')}</div><div class="offer-actions"><button class="button secondary small" data-toggle-alert="${esc(a.id)}">${a.enabled?'Metti in pausa':'Riattiva'}</button><button class="button danger small" data-delete-alert="${esc(a.id)}">Elimina</button></div></article>`).join(''):empty('Ancora nessun alert.','Cerca un filamento, poi scegli “Crea alert” sull’offerta da seguire.',link('prices','Cerca un filamento','button primary'))}
    <div class="section-heading"><div><h2>Ultimi aggiornamenti</h2><p>Le notifiche vengono conservate sul tuo Umbrel.</p></div>${state.events.some(e=>!e.read)?button('Segna come letti','mark-read'):''}</div><div class="events">${state.events.length?state.events.slice(0,30).map(e=>`<article class="event"><strong>${esc(e.title)}</strong>${!e.read?' '+badge('Nuovo'):''}<p>${esc(e.message)}</p><small>${date(e.ts||e.created_at)}</small></article>`).join(''):'<p class="muted">Nessun evento da mostrare.</p>'}</div>`;
}
function showAlert(index) {
  const o=state.market?.offers[index]; if(!o) return;
  openDialog('Segui questo filamento',`<p class="detail-intro">${esc(o.product)} · ${esc(o.color||o.variant||'')}</p><form id="alert-form" data-offer-index="${index}" class="stack"><div class="field"><label for="alert-drop">Avvisami per un ribasso di almeno (%)</label><input id="alert-drop" name="drop" type="number" required min="1" max="100" value="5"></div><div class="field"><label for="alert-target">Prezzo obiettivo totale, spedizione inclusa (€)</label><input id="alert-target" name="target" type="number" min="0.01" max="100000" step=".01" placeholder="Facoltativo"><small>La soglia si applica solo quando la spedizione è nota.</small></div><label class="check-label"><input name="stock" type="checkbox" checked>Avvisami quando torna disponibile</label><p class="detail-text">Il monitoraggio confronta la variante tra negozi per ${state.marketContext.qty} confezioni. Troverai gli eventi nella pagina Alert prezzi.</p><button class="button primary" type="submit">Salva alert</button><p id="alert-error" class="form-error" role="alert"></p></form>`);
}
async function saveAlert(form) {
  const o=state.market.offers[Number(form.dataset.offerIndex)], fields=new FormData(form), submit=$('button[type=submit]',form);
  const target=fields.get('target'), payload={signature:o.variant_signature, material:state.marketContext.material,brand:state.marketContext.brand,quantity:state.marketContext.qty,label:[o.product,o.color,o.format].filter(Boolean).join(' · ').slice(0,500),enabled:true,config:{drop_enabled:true,drop_pct:Number(fields.get('drop')),back_in_stock:fields.get('stock')==='on',max_final_enabled:target!=='',max_final_value:target===''?0:Number(target)}};
  submit.disabled=true;
  try { const data=await api('/api/alerts',{body:{action:'upsert',alert:payload}}); state.alerts=data.alerts;state.events=data.events; closeDialog();toast('Alert salvato. Lo trovi in Alert prezzi.'); }
  catch(error) { if(form.isConnected) $('#alert-error',form).textContent=error.message; }
  finally { submit.disabled=false; }
}
async function alertAction(body) {
  try { const data=await api('/api/alerts',{body}); state.alerts=data.alerts;state.events=data.events; if(state.route==='alerts') render(); }
  catch(error) { toast(error.message); }
}
async function showHistory(index) {
  const o=state.market.offers[index]; if(!o) return;
  const signature=o.variant_signature;
  openDialog('Storico prezzi',`<div class="loading" role="status">Caricamento dello storico…</div>`);
  const dialogToken=Symbol(); state.historyToken=dialogToken;
  try {
    const data=await api('/api/history?'+new URLSearchParams({signature,limit:'40'}));
    if(state.historyToken!==dialogToken||!$('#detail-dialog').open) return;
    $('#dialog-content').innerHTML=`<p class="detail-intro">${esc(o.product)}</p><p class="detail-text">Prezzo minimo della confezione disponibile. I totali consegnati dipendono dalla quantità e dalla spedizione.</p>${data.history.length?`<div class="comparison-wrap"><table><thead><tr><th>Data</th><th>Prodotto</th><th>Confezioni</th><th>Totale consegnato</th></tr></thead><tbody>${[...data.history].reverse().map(h=>`<tr><td>${date(h.ts)}</td><td>${money(h.best_product_price)}</td><td>${h.quantity}</td><td>${money(h.best_final_total)}</td></tr>`).join('')}</tbody></table></div>`:empty('Lo storico inizia adesso.','Esegui nuove ricerche per registrare le variazioni.')}`;
  } catch(error) { if(state.historyToken===dialogToken&&$('#detail-dialog').open) $('#dialog-content').innerHTML=`<p class="note error">${esc(error.message)}</p>`; }
}
function settingsView() {
  return `${header('IL TUO LABORATORIO','Impostazioni e strumenti.','Informazioni sull’app, preferenze del browser e monitoraggio locale.')}<div class="compare-grid"><section class="panel"><h2>Filament Finder</h2><dl class="settings-list">${[['Versione',state.health?.version||'Non disponibile'],['Materiali',state.catalog.materials.length],['Stampanti',state.catalog.printers.length],['Fonti configurate',state.sources.length],['Aggiornamento alert',state.health?`Ogni ${Math.round(state.health.monitor_interval_seconds/60)} minuti`:'Non disponibile']].map(([key,value])=>`<div><dt>${key}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl></section><section class="panel"><h2>I tuoi dati</h2><p>Alert e storico prezzi sono salvati sul tuo Umbrel. La stampante selezionata rimane in questo browser.</p><button class="button secondary" data-action="export-alerts">Esporta alert e notifiche</button><div class="section-heading"><h2>Altri strumenti</h2></div><div class="stack">${link('compare',icon('compare')+' Confronta materiali','button secondary')}${link('cost',icon('cost')+' Calcola costo stampa','button secondary')}${link('alerts',icon('alerts')+' Gestisci alert','button secondary')}</div></section></div><p class="note spaced">Le ricerche dipendono dai siti dei negozi: blocchi, cambi di pagina o dati mancanti vengono segnalati per fonte. Nessun prezzo viene ricavato dai prodotti vicini e un peso sconosciuto non diventa automaticamente 1 kg.</p>`;
}

document.addEventListener('click',async event=>{
  const target=event.target.closest('button'); if(!target||target.disabled) return;
  if(target.dataset.material) return showMaterial(target.dataset.material);
  if(target.dataset.printer) { state.printer=state.catalog.printers.find(p=>p.id===target.dataset.printer);storage.set('ff11_printer',state.printer.id);updatePrinter();closeDialog();if(state.project)state.recommendations=recommend(state.catalog.materials,state.project,state.printer);render();return; }
  if(target.dataset.materialPrices) { state.search.material=materialById(target.dataset.materialPrices).name;closeDialog();location.hash='prices';if(state.route==='prices')render();return; }
  if(target.dataset.addCompare) { state.compare=[target.dataset.addCompare,state.compare[0]===target.dataset.addCompare?'petg':state.compare[0]];closeDialog();location.hash='compare';if(state.route==='compare')render();return; }
  if(target.dataset.group) { state.group=target.dataset.group;render();return; }
  if(target.dataset.page) { state.page=Number(target.dataset.page);$('#offer-results').innerHTML=offerResults();$('#offer-results').scrollIntoView({block:'start'});return; }
  if(target.dataset.retry) return retrySource(target.dataset.retry);
  if(target.dataset.alertOffer!==undefined) return showAlert(Number(target.dataset.alertOffer));
  if(target.dataset.history!==undefined) return showHistory(Number(target.dataset.history));
  if(target.dataset.prompt) { state.project=target.dataset.prompt;$('#project').value=state.project;$('#project').focus();return; }
  if(target.dataset.toggleAlert) { const a=state.alerts.find(a=>a.id===target.dataset.toggleAlert);target.disabled=true;await alertAction({action:'toggle',id:a.id,enabled:!a.enabled});target.disabled=false;return; }
  if(target.dataset.deleteAlert) { const a=state.alerts.find(a=>a.id===target.dataset.deleteAlert);openDialog('Eliminare questo alert?',`<p>${esc(a.label||a.material)}</p><p class="detail-text">Lo storico prezzi viene conservato.</p><button class="button danger" data-confirm-delete="${esc(a.id)}">Elimina alert</button>`);return; }
  if(target.dataset.confirmDelete) { target.disabled=true;await alertAction({action:'delete',id:target.dataset.confirmDelete});closeDialog();return; }
  switch(target.dataset.action) {
    case 'printers': return showPrinters();
    case 'reset-materials': state.group='all';state.materialQuery='';state.compatibleOnly=false;render();break;
    case 'reset-offers': state.filters={query:'',store:'',format:'',stock:false,sort:'price'};state.page=1;$('#market-content').innerHTML=marketContent();break;
    case 'search-again': return searchMarket();
    case 'cancel-search': searchController?.abort();state.epoch++;state.busy=false;render();break;
    case 'reload-alerts': target.disabled=true;await loadAlerts();if(state.route==='alerts')render();break;
    case 'mark-read': return alertAction({action:'mark_read'});
    case 'export-alerts': { await loadAlerts();if(state.alertsError){toast(state.alertsError);break;}const url=URL.createObjectURL(new Blob([JSON.stringify({exported_at:new Date().toISOString(),alerts:state.alerts,events:state.events},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='filament-finder-alerts.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);break; }
  }
});
document.addEventListener('input',event=>{
  const el=event.target;
  if(el.id==='material-search') {state.materialQuery=el.value;$('#catalog-results').innerHTML=catalogResults();}
  if(el.id==='printer-search') $('#printer-list').innerHTML=printerRows(el.value);
  if(el.id==='offer-query') {state.filters.query=el.value;state.page=1;$('#offer-results').innerHTML=offerResults();}
  if(el.id==='project') state.project=el.value;
  if(el.id==='search-qty') readSearch();
  if(el.id.startsWith('calc-')) state.calc[el.name]=el.value;
});
document.addEventListener('change',event=>{
  const el=event.target;
  if(el.id==='compatible-only') {state.compatibleOnly=el.checked;$('#catalog-results').innerHTML=catalogResults();}
  const key={'offer-store':'store','offer-format':'format','offer-sort':'sort','offer-stock':'stock'}[el.id];
  if(key) {state.filters[key]=key==='stock'?el.checked:el.value;state.page=1;$('#offer-results').innerHTML=offerResults();}
  if(el.id==='search-material'||el.id==='search-brand') readSearch();
  if(el.dataset.compare!==undefined) {state.compare[Number(el.dataset.compare)]=el.value;render();}
});
document.addEventListener('submit',async event=>{
  event.preventDefault();const form=event.target;if(!form.reportValidity())return;
  if(form.id==='search-form') return searchMarket();
  if(form.id==='advisor-form') {state.project=$('#project').value.trim();state.recommendations=recommend(state.catalog.materials,state.project,state.printer);$('#advisor-results').innerHTML=advisorResults()||empty('Nessun profilo adatto al setup.','Controlla la stampante selezionata e i requisiti del progetto.');return;}
  if(form.id==='cost-form') {try{state.calc=Object.fromEntries([...new FormData(form)].map(([k,v])=>[k,Number(v)]));$('#cost-output').innerHTML=costOutput();$('#cost-error').textContent='';}catch(error){$('#cost-error').textContent=error.message;}return;}
  if(form.id==='alert-form') return saveAlert(form);
});
$('#printer-button').addEventListener('click',showPrinters);
$('#close-dialog').addEventListener('click',closeDialog);
$('#detail-dialog').addEventListener('close',()=>{state.historyToken=null;});
window.addEventListener('hashchange',navigate);

async function init() {
  $('#navigation').innerHTML=Object.entries(routes).map(([key,label],i)=>`${i===4?'<div class="nav-separator"></div>':''}<a class="nav-link ${['compare','cost','alerts'].includes(key)?'secondary-nav':''}" data-route="${key}" href="#${key}">${icon(key)}<span>${key==='settings'?'Strumenti':label}</span></a>`).join('');
  try {
    state.catalog=await api('/catalog.json');
    const saved=storage.get('ff11_printer');
    let legacy=null;try{legacy=localStorage.getItem('ff10_active_printer');}catch{}
    state.printer=state.catalog.printers.find(p=>p.id===saved||printerName(p)===legacy)||null;
    updatePrinter();navigate();
    await Promise.allSettled([
      api('/api/health').then(h=>{state.health=h;$('#server-status').textContent='Laboratorio online';}).catch(()=>{$('#server-status').textContent='Server non disponibile';}),
      api('/api/sources').then(data=>{state.sources=data.sources;}),loadAlerts(),
    ]);
    if(['home','settings','alerts'].includes(state.route))render();
  } catch(error) { $('#main').innerHTML=empty('Il catalogo non è disponibile.',esc(error.message),'<button class="button primary" id="reload-app">Ricarica app</button>');$('#reload-app').addEventListener('click',()=>location.reload()); }
}
init();
