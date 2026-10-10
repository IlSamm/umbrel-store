(function(){
'use strict';

const VERSION='10.3.0';
window.FF103_MARKETPLACE_VERSION=VERSION;
const q=(s,r=document)=>r.querySelector(s);
const qa=(s,r=document)=>[...r.querySelectorAll(s)];
const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null;};
const euro=v=>{const n=num(v);return n===null?'—':new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(n);};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeUrl=v=>{try{const u=new URL(String(v||''),location.href);return /^https?:$/.test(u.protocol)?u.href:'';}catch{return'';}};
const storeKey=o=>String(o?.source_id||o?.store||'altro');
const storeName=o=>String(o?.store||o?.source_name||o?.source_id||'Negozio');
const productName=o=>String(o?.product||o?.title||o?.name||'Filamento');
const totalOf=o=>num(o?.final_total)??num(o?.price);
const productPriceOf=o=>num(o?.price);
const perKgOf=o=>num(o?.final_perkg)??num(o?.perkg);
const shippingKnown=o=>o?.shipping_known===true||num(o?.shipping_cost)!==null||(num(o?.final_total)!==null&&num(o?.price)!==null&&Math.abs(num(o.final_total)-num(o.price))>.001);
const state={data:null,sort:'total',store:'all',brand:'all',color:'all',query:'',shippingOnly:false,visible:16};
let mutationBusy=false;

function plausibleColor(v){
  const s=String(v||'').trim();
  return !!s&&s.length<=34&&!/^(unknown|n\/a|na|-|none|null)$/i.test(s)&&!/^\d+(?:[.,]\d+)?$/.test(s)&&!/^\d+\s*(?:g|kg|mm|cm|m)$/i.test(s);
}
function unique(values){return [...new Set(values.map(v=>String(v||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'it',{sensitivity:'base'}));}
function offersOf(data){
  const seen=new Set(),out=[];
  for(const o of (Array.isArray(data?.offers)?data.offers:[])){
    if(!o||o.available===false||totalOf(o)===null)continue;
    const key=[storeKey(o),o.brand||'',productName(o),o.variant||'',o.color||'',o.format||'',o.size||'',o.weight_kg||'',totalOf(o),safeUrl(o.url)].join('|').toLowerCase();
    if(seen.has(key))continue;
    seen.add(key);out.push(o);
  }
  return out;
}
function sourceMap(data){const m=new Map();for(const s of (data?.sources||[]))m.set(String(s.id||''),s);return m;}
function sourceClass(s){return s?.ok===false?'is-error':Number(s?.results||0)>0?'is-ok':'is-empty';}
function sourceLabel(s){
  const msg=String(s?.error_message||s?.error||'').trim();
  if(/429|too many/i.test(msg))return 'Limite richieste';
  if(/timeout|budget/i.test(msg))return 'Timeout';
  if(s?.ok===false)return msg?msg.slice(0,54):'Non raggiungibile';
  return Number(s?.results||0)>0?`${Number(s.results)} offerte`:'Nessuna offerta';
}
function filteredOffers(){
  if(!state.data)return [];
  const needle=state.query.trim().toLowerCase();
  const rows=offersOf(state.data).filter(o=>{
    if(state.store!=='all'&&storeKey(o)!==state.store)return false;
    if(state.brand!=='all'&&String(o.brand||'')!==state.brand)return false;
    if(state.color!=='all'&&String(o.color||'')!==state.color)return false;
    if(state.shippingOnly&&!shippingKnown(o))return false;
    if(needle&&!([storeName(o),o.brand,productName(o),o.variant,o.color,o.format,o.size].join(' ').toLowerCase().includes(needle)))return false;
    return true;
  });
  const sorters={
    total:(a,b)=>(totalOf(a)??1e9)-(totalOf(b)??1e9),
    perkg:(a,b)=>(perKgOf(a)??1e9)-(perKgOf(b)??1e9),
    product:(a,b)=>(productPriceOf(a)??1e9)-(productPriceOf(b)??1e9),
    store:(a,b)=>storeName(a).localeCompare(storeName(b),'it')||(totalOf(a)??1e9)-(totalOf(b)??1e9),
    brand:(a,b)=>String(a.brand||'').localeCompare(String(b.brand||''),'it')||(totalOf(a)??1e9)-(totalOf(b)??1e9)
  };
  return rows.sort(sorters[state.sort]||sorters.total);
}
function bestPicks(all){
  const byTotal=[...all].sort((a,b)=>((shippingKnown(a)?0:1)-(shippingKnown(b)?0:1))||(totalOf(a)-totalOf(b)))[0]||null;
  const byKg=[...all].filter(o=>perKgOf(o)!==null).sort((a,b)=>perKgOf(a)-perKgOf(b))[0]||null;
  const bambu=[...all].filter(o=>storeKey(o)==='bambu'||/bambu/i.test(storeName(o))).sort((a,b)=>totalOf(a)-totalOf(b))[0]||null;
  return {byTotal,byKg,bambu};
}
function pickCard(o,label,kg=false){
  if(!o)return `<article class="ff103-pick is-empty"><div class="ff103-pick-copy"><span>${esc(label)}</span><strong>—</strong><small>Nessun dato</small></div></article>`;
  const url=safeUrl(o.url),price=kg?perKgOf(o):totalOf(o);
  return `<article class="ff103-pick"><div class="ff103-pick-copy"><span>${esc(label)}</span><strong>${euro(price)}${kg?'/kg':''}</strong><small>${esc(storeName(o))} · ${esc(o.brand||productName(o))}</small></div>${url?`<a href="${esc(url)}" target="_blank" rel="noopener">↗</a>`:''}</article>`;
}
function overview(data,all){
  const active=(data.sources||[]).filter(s=>Number(s.results||0)>0).length,p=bestPicks(all);
  return `<section class="ff103-overview"><div class="ff103-overview-top"><div><span class="ff103-eyebrow">Risultato ricerca</span><h2>${all.length} offerte da ${active} negozi</h2><p>Confronto per prezzo finale, €/kg e disponibilità. La spedizione è indicata solo quando il dato è verificabile.</p></div><button class="ff103-refresh" type="button" data-market-refresh>↻ Aggiorna</button></div><div class="ff103-picks">${pickCard(p.byTotal,'Miglior totale')}${pickCard(p.byKg,'Miglior €/kg',true)}${pickCard(p.bambu,'Bambu ufficiale')}</div></section>`;
}
function sourceRail(data){
  const rows=[...(data.sources||[])].sort((a,b)=>Number(b.results||0)-Number(a.results||0));
  return `<div class="ff103-source-rail">${rows.map(s=>`<button type="button" class="ff103-source-chip ${sourceClass(s)}" data-source-id="${esc(s.id||'')}"><i></i><span>${esc(s.name||s.id||'Fonte')}</span><b>${Number(s.results||0)}</b></button>`).join('')}</div>`;
}
function filterPanel(data,all){
  const sources=sourceMap(data),stores=unique(all.map(storeKey)),brands=unique(all.map(o=>o.brand).filter(Boolean)),colors=unique(all.map(o=>o.color).filter(plausibleColor)).slice(0,80);
  const storeOpts=stores.map(v=>`<option value="${esc(v)}" ${state.store===v?'selected':''}>${esc(sources.get(v)?.name||all.find(o=>storeKey(o)===v)?.store||v)}</option>`).join('');
  const brandOpts=brands.map(v=>`<option value="${esc(v)}" ${state.brand===v?'selected':''}>${esc(v)}</option>`).join('');
  const colorOpts=colors.map(v=>`<option value="${esc(v)}" ${state.color===v?'selected':''}>${esc(v)}</option>`).join('');
  return `<section class="ff103-filter-panel"><div class="ff103-filter-head"><div><span class="ff103-eyebrow">Filtra e ordina</span><h3>Trova la bobina giusta</h3></div><button type="button" data-ff103-reset>Reset</button></div><div class="ff103-filter-grid">
  <label class="ff103-search"><span>Cerca nei risultati</span><input type="search" value="${esc(state.query)}" placeholder="es. Bambu, nero, matte…" data-ff103-query></label>
  <label><span>Ordina</span><select data-ff103-sort><option value="total" ${state.sort==='total'?'selected':''}>Prezzo finale</option><option value="perkg" ${state.sort==='perkg'?'selected':''}>€/kg</option><option value="product" ${state.sort==='product'?'selected':''}>Prezzo prodotto</option><option value="store" ${state.sort==='store'?'selected':''}>Negozio</option><option value="brand" ${state.sort==='brand'?'selected':''}>Marca</option></select></label>
  <label><span>Negozio</span><select data-ff103-store><option value="all">Tutti i negozi</option>${storeOpts}</select></label>
  <label><span>Marca</span><select data-ff103-brand><option value="all">Tutte le marche</option>${brandOpts}</select></label>
  <label><span>Colore</span><select data-ff103-color><option value="all">Tutti i colori</option>${colorOpts}</select></label>
  <label class="ff103-toggle"><input type="checkbox" ${state.shippingOnly?'checked':''} data-ff103-shipping><span><i></i>Solo totale/spedizione verificata</span></label></div></section>`;
}
function meta(o){const a=[];if(o.brand)a.push(o.brand);if(plausibleColor(o.color))a.push(o.color);if(o.format)a.push(o.format);if(o.size)a.push(o.size);if(o.weight_kg)a.push(`${o.weight_kg} kg`);return [...new Set(a.map(String))].slice(0,5);}
function shippingText(o){
  const c=num(o.shipping_cost);
  if(o.shipping_known===true)return c===null?'Spedizione verificata':c<=0?'Spedizione inclusa':`Spedizione ${euro(c)}`;
  if(num(o.final_total)!==null&&num(o.price)!==null&&Math.abs(num(o.final_total)-num(o.price))>.001)return `Totale consegnato ${euro(o.final_total)}`;
  return 'Spedizione da verificare';
}
function offerCard(o,i){
  const url=safeUrl(o.url),total=totalOf(o),product=productPriceOf(o),kg=perKgOf(o),known=shippingKnown(o);
  return `<article class="ff103-offer-card" data-store="${esc(storeKey(o))}"><div class="ff103-offer-rank">${i+1}</div><div class="ff103-offer-body"><div class="ff103-offer-source"><span>${esc(storeName(o))}</span><i class="is-in"></i><small>Disponibile</small></div><h3>${esc(productName(o))}</h3>${o.variant?`<p>${esc(o.variant)}</p>`:''}<div class="ff103-tags">${meta(o).map(x=>`<span>${esc(x)}</span>`).join('')}</div><div class="ff103-shipping ${known?'is-known':'is-unknown'}">${known?'✓':'!'} ${esc(shippingText(o))}</div></div><div class="ff103-offer-money"><span>${known?'Totale':'Prezzo'}</span><strong>${euro(total)}</strong>${kg!==null?`<b>${euro(kg)}/kg</b>`:''}${product!==null&&Math.abs(product-total)>.001?`<small>Prodotto ${euro(product)}</small>`:''}</div>${url?`<a class="ff103-shop-button" href="${esc(url)}" target="_blank" rel="noopener">Vai al negozio <span>↗</span></a>`:''}</article>`;
}
function resultsSection(){
  const filtered=filteredOffers(),all=offersOf(state.data),visible=filtered.slice(0,state.visible);
  return `<section class="ff103-results"><div class="ff103-results-head"><div><span class="ff103-eyebrow">Offerte</span><h2>${filtered.length} risultati</h2></div><small>${filtered.length!==all.length?`${all.length-filtered.length} filtrati`:`${all.length} totali`}</small></div>${visible.length?`<div class="ff103-offer-list">${visible.map(offerCard).join('')}</div>`:`<div class="ff103-empty"><strong>Nessuna offerta con questi filtri</strong><span>Prova a rimuovere marca, colore o negozio.</span></div>`}${filtered.length>visible.length?`<button class="ff103-more" type="button" data-ff103-more>Mostra altre ${Math.min(16,filtered.length-visible.length)} offerte</button>`:''}</section>`;
}
function diagnostics(data){
  const sources=data.sources||[],ok=sources.filter(s=>s.ok!==false).length,active=sources.filter(s=>Number(s.results||0)>0).length;
  return `<details class="ff103-diagnostics"><summary><span><b>Stato fonti</b><small>${ok}/${sources.length} raggiunte · ${active} con offerte</small></span><i>+</i></summary><div class="ff103-diagnostics-grid">${sources.map(s=>`<div class="ff103-source-row ${sourceClass(s)}"><i></i><span><b>${esc(s.name||s.id||'Fonte')}</b><small>${esc(sourceLabel(s))}</small></span><em>${Number.isFinite(Number(s.ms))?`${Math.round(Number(s.ms))} ms`:''}</em></div>`).join('')}</div></details>`;
}
function enhanceSearch(){
  const view=q('#ff10-view-prices'),panel=q('.ff10-market-controls',view)?.closest('.ff10-panel');
  if(!panel||panel.dataset.ff103)return;
  panel.dataset.ff103='1';panel.classList.add('ff103-search-panel');
  const btn=q('[data-market-run]',panel);if(btn){btn.innerHTML='⌕&nbsp;&nbsp;Cerca prezzi';btn.classList.add('ff103-run');}
  const status=q('.ff10-market-status',panel);if(status&&!q('.ff103-search-help',panel))status.insertAdjacentHTML('beforebegin','<p class="ff103-search-help">Interroga in parallelo Bambu Lab, SUNLU, Polymaker, 3DJake, 3DStoreItalia e le altre fonti configurate.</p>');
}
function renderMarketplace(data){
  const root=q('#ff10-market-results');
  if(!root||!data||!Array.isArray(data.sources))return false;
  state.data=data;
  const all=offersOf(data);
  if(state.store!=='all'&&!all.some(o=>storeKey(o)===state.store))state.store='all';
  if(state.brand!=='all'&&!all.some(o=>String(o.brand||'')===state.brand))state.brand='all';
  if(state.color!=='all'&&!all.some(o=>String(o.color||'')===state.color))state.color='all';
  root.innerHTML=all.length?(overview(data,all)+sourceRail(data)+filterPanel(data,all)+resultsSection()+diagnostics(data)):(sourceRail(data)+`<section class="ff103-empty big"><strong>Nessuna offerta trovata</strong><span>Apri “Stato fonti” per vedere quali negozi hanno risposto.</span><button class="ff103-refresh" type="button" data-market-refresh>↻ Riprova</button></section>`+diagnostics(data));
  root.dataset.ffMarketplace='103';
  const status=q('.ff10-market-status span:last-child');if(status){const good=data.sources.filter(s=>s.ok!==false).length,active=data.sources.filter(s=>Number(s.results||0)>0).length;status.textContent=`${good}/${data.sources.length} fonti raggiunte · ${active} negozi con offerte · ${all.length} offerte`;}
  enhanceSearch();return true;
}
window.FF103_RENDER_MARKETPLACE=renderMarketplace;
function rerenderResults(){const section=q('.ff103-results');if(section)section.outerHTML=resultsSection();else if(state.data)renderMarketplace(state.data);}
function bindEvents(){
  document.addEventListener('change',e=>{
    const t=e.target;
    if(t.matches('[data-ff103-sort]'))state.sort=t.value;else if(t.matches('[data-ff103-store]'))state.store=t.value;else if(t.matches('[data-ff103-brand]'))state.brand=t.value;else if(t.matches('[data-ff103-color]'))state.color=t.value;else if(t.matches('[data-ff103-shipping]'))state.shippingOnly=t.checked;else return;
    state.visible=16;rerenderResults();
  });
  document.addEventListener('input',e=>{if(!e.target.matches('[data-ff103-query]'))return;state.query=e.target.value;state.visible=16;clearTimeout(window.__ff103Q);window.__ff103Q=setTimeout(rerenderResults,120);});
  document.addEventListener('click',e=>{
    if(e.target.closest('[data-ff103-more]')){state.visible+=16;rerenderResults();return;}
    if(e.target.closest('[data-ff103-reset]')){Object.assign(state,{sort:'total',store:'all',brand:'all',color:'all',query:'',shippingOnly:false,visible:16});renderMarketplace(state.data);return;}
    const chip=e.target.closest('.ff103-source-chip.is-ok');if(chip){state.store=chip.dataset.sourceId||'all';state.visible=16;renderMarketplace(state.data);return;}
    if(e.target.closest('[data-market-run]'))Object.assign(state,{store:'all',brand:'all',color:'all',query:'',visible:16});
  });
}
function hookFetch(){
  if(window.__ff103PriceFetchHook)return;
  window.__ff103PriceFetchHook=true;
  const original=window.fetch.bind(window);
  window.fetch=async function(input,init){
    const response=await original(input,init);
    try{
      const url=typeof input==='string'?input:String(input?.url||'');
      if(/\/api\/(?:catalog|prices)(?:\?|$)/.test(url)){
        const data=await response.clone().json();
        state.visible=16;
        queueMicrotask(()=>renderMarketplace(data));
      }
    }catch(err){console.warn('FF103 marketplace hook:',err);}
    return response;
  };
}
function observe(){
  const ob=new MutationObserver(()=>{if(mutationBusy)return;mutationBusy=true;requestAnimationFrame(()=>{mutationBusy=false;enhanceSearch();const root=q('#ff10-market-results');if(state.data&&root&&root.dataset.ffMarketplace!=='103')renderMarketplace(state.data);});});
  ob.observe(document.body,{childList:true,subtree:true});
}
function init(){hookFetch();bindEvents();observe();enhanceSearch();window.FF103_MARKETPLACE_VERSION=VERSION;}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
