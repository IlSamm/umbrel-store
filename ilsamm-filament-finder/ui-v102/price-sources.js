(function(){
'use strict';

const VERSION='10.3.0';
window.FILAMENT_FINDER_VERSION=VERSION;

const esc=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const q=(s,r=document)=>r.querySelector(s);
const qa=(s,r=document)=>[...r.querySelectorAll(s)];
const num=(v)=>{const n=Number(v);return Number.isFinite(n)?n:null;};
const euro=(v)=>{const n=num(v);return n===null?'—':new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(n);};
const safeUrl=(v)=>{try{const u=new URL(String(v||''),location.href);return /^https?:$/.test(u.protocol)?u.href:'';}catch{return'';}};
const productName=(o)=>String(o?.product||o?.title||o?.name||'Filamento');
const storeName=(o)=>String(o?.store||o?.source_name||o?.source_id||'Negozio');
const storeKey=(o)=>String(o?.source_id||o?.store||'altro');
const totalOf=(o)=>num(o?.final_total)??num(o?.price);
const productPriceOf=(o)=>num(o?.price);
const perKgOf=(o)=>num(o?.final_perkg)??num(o?.perkg);
const shippingKnown=(o)=>o?.shipping_known===true||num(o?.shipping_cost)!==null||(num(o?.final_total)!==null&&num(o?.price)!==null&&Math.abs(num(o.final_total)-num(o.price))>0.001);
const shippingCost=(o)=>num(o?.shipping_cost);

const state={data:null,sort:'total',store:'all',brand:'all',color:'all',query:'',shippingOnly:false,visible:16};
let renderQueued=false;

function sourceError(source){
  const msg=String(source?.error_message||source?.error||'').trim();
  if(/429|too many requests/i.test(msg))return 'Limite richieste';
  if(/budget|timeout/i.test(msg))return 'Timeout';
  if(source?.ok===false)return msg?msg.slice(0,62):'Non raggiungibile';
  if(Number(source?.results||0)===0)return 'Nessuna offerta';
  return `${Number(source.results)} offerte`;
}
function sourceClass(source){
  if(source?.ok===false)return 'is-error';
  if(Number(source?.results||0)>0)return 'is-ok';
  return 'is-empty';
}
function plausibleColor(v){
  const s=String(v||'').trim();
  if(!s||s.length>34||/^(unknown|n\/a|na|-|none|null)$/i.test(s))return false;
  if(/^\d+(?:[.,]\d+)?$/.test(s))return false;
  if(/^(\d+\s*(?:g|kg|mm|cm|m))$/i.test(s))return false;
  return true;
}
function normalizedOffers(data){
  const seen=new Set();
  const rows=[];
  for(const o of (Array.isArray(data?.offers)?data.offers:[])){
    if(!o||o.available===false||totalOf(o)===null)continue;
    const key=[storeKey(o),o.brand||'',productName(o),o.variant||'',o.color||'',o.format||'',o.size||'',o.weight_kg||'',totalOf(o),safeUrl(o.url)].join('|').toLowerCase();
    if(seen.has(key))continue;
    seen.add(key);rows.push(o);
  }
  return rows;
}
function sourceMap(data){
  const m=new Map();
  for(const s of (Array.isArray(data?.sources)?data.sources:[]))m.set(String(s.id||''),s);
  return m;
}
function uniqueSorted(values){return [...new Set(values.map(v=>String(v||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'it',{sensitivity:'base'}));}
function derivedFacets(offers){
  return {
    stores:uniqueSorted(offers.map(storeKey)),
    brands:uniqueSorted(offers.map(o=>o.brand).filter(Boolean)),
    colors:uniqueSorted(offers.map(o=>o.color).filter(plausibleColor)).slice(0,80)
  };
}
function filterOffers(data){
  let rows=normalizedOffers(data);
  const needle=state.query.trim().toLowerCase();
  rows=rows.filter(o=>{
    if(state.store!=='all'&&storeKey(o)!==state.store)return false;
    if(state.brand!=='all'&&String(o.brand||'')!==state.brand)return false;
    if(state.color!=='all'&&String(o.color||'')!==state.color)return false;
    if(state.shippingOnly&&!shippingKnown(o))return false;
    if(needle){
      const hay=[storeName(o),o.brand,productName(o),o.variant,o.color,o.format,o.size].join(' ').toLowerCase();
      if(!hay.includes(needle))return false;
    }
    return true;
  });
  const cmp={
    total:(a,b)=>(totalOf(a)??1e9)-(totalOf(b)??1e9),
    perkg:(a,b)=>(perKgOf(a)??1e9)-(perKgOf(b)??1e9),
    product:(a,b)=>(productPriceOf(a)??1e9)-(productPriceOf(b)??1e9),
    store:(a,b)=>storeName(a).localeCompare(storeName(b),'it')||(totalOf(a)??1e9)-(totalOf(b)??1e9),
    brand:(a,b)=>String(a.brand||'').localeCompare(String(b.brand||''),'it')||(totalOf(a)??1e9)-(totalOf(b)??1e9)
  }[state.sort]||((a,b)=>(totalOf(a)??1e9)-(totalOf(b)??1e9));
  rows.sort(cmp);return rows;
}
function bestPicks(offers){
  if(!offers.length)return {total:null,perkg:null,bambu:null};
  const known=offers.filter(shippingKnown).sort((a,b)=>(totalOf(a)??1e9)-(totalOf(b)??1e9));
  const byTotal=(known[0]||[...offers].sort((a,b)=>(totalOf(a)??1e9)-(totalOf(b)??1e9))[0]||null);
  const byKg=[...offers].filter(o=>perKgOf(o)!==null).sort((a,b)=>perKgOf(a)-perKgOf(b))[0]||null;
  const bambu=[...offers].filter(o=>storeKey(o)==='bambu'||/bambu/i.test(storeName(o))).sort((a,b)=>(totalOf(a)??1e9)-(totalOf(b)??1e9))[0]||null;
  return {total:byTotal,perkg:byKg,bambu};
}
function offerMeta(o){
  const meta=[];
  if(o.brand)meta.push(o.brand);
  if(plausibleColor(o.color))meta.push(o.color);
  if(o.format)meta.push(o.format);
  if(o.size)meta.push(o.size);
  if(o.weight_kg)meta.push(`${o.weight_kg} kg`);
  return [...new Set(meta.map(String))].slice(0,5);
}
function shippingText(o){
  if(o.shipping_known===true){const c=shippingCost(o);return c===null?'Spedizione inclusa/verificata':c<=0?'Spedizione inclusa':`Spedizione ${euro(c)}`;}
  if(num(o.final_total)!==null&&num(o.price)!==null&&num(o.final_total)!==num(o.price))return `Totale consegnato ${euro(o.final_total)}`;
  return 'Spedizione da verificare';
}
function stockText(o){return o.available===false?'Non disponibile':'Disponibile';}
function smallOffer(o,label=''){
  if(!o)return '<div class="ff103-pick is-empty"><span>—</span><strong>Nessun dato</strong></div>';
  const url=safeUrl(o.url);
  return `<article class="ff103-pick">
    <div class="ff103-pick-copy"><span>${esc(label)}</span><strong>${euro(label==='Miglior €/kg'?perKgOf(o):totalOf(o))}${label==='Miglior €/kg'?'/kg':''}</strong><small>${esc(storeName(o))} · ${esc(o.brand||productName(o))}</small></div>
    ${url?`<a href="${esc(url)}" target="_blank" rel="noopener" aria-label="Apri offerta">↗</a>`:''}
  </article>`;
}
function overview(data,offers){
  const sources=Array.isArray(data?.sources)?data.sources:[];
  const withResults=sources.filter(s=>Number(s.results||0)>0);
  const picks=bestPicks(offers);
  return `<section class="ff103-overview">
    <div class="ff103-overview-top">
      <div><span class="ff103-eyebrow">Risultato ricerca</span><h2>${offers.length} offerte da ${withResults.length} negozi</h2><p>Confronto normalizzato per prezzo, €/kg e costo finale quando la spedizione è nota.</p></div>
      <button class="ff103-refresh" type="button" data-market-refresh>↻ Aggiorna</button>
    </div>
    <div class="ff103-picks">
      ${smallOffer(picks.total,'Miglior totale')}
      ${smallOffer(picks.perkg,'Miglior €/kg')}
      ${smallOffer(picks.bambu,'Bambu ufficiale')}
    </div>
  </section>`;
}
function sourceRail(data){
  const sources=Array.isArray(data?.sources)?data.sources:[];
  if(!sources.length)return '';
  const sorted=[...sources].sort((a,b)=>Number(b.results||0)-Number(a.results||0));
  return `<div class="ff103-source-rail" aria-label="Fonti prezzo">${sorted.map(s=>`<div class="ff103-source-chip ${sourceClass(s)}" data-source-id="${esc(s.id||'')}"><i></i><span>${esc(s.name||s.id||'Fonte')}</span><b>${Number(s.results||0)}</b></div>`).join('')}</div>`;
}
function filterBar(data,allOffers){
  const facets=derivedFacets(allOffers);const sources=sourceMap(data);
  const storeOptions=facets.stores.map(k=>`<option value="${esc(k)}" ${state.store===k?'selected':''}>${esc(sources.get(k)?.name||allOffers.find(o=>storeKey(o)===k)?.store||k)}</option>`).join('');
  const brandOptions=facets.brands.map(v=>`<option value="${esc(v)}" ${state.brand===v?'selected':''}>${esc(v)}</option>`).join('');
  const colorOptions=facets.colors.map(v=>`<option value="${esc(v)}" ${state.color===v?'selected':''}>${esc(v)}</option>`).join('');
  return `<section class="ff103-filter-panel">
    <div class="ff103-filter-head"><div><span class="ff103-eyebrow">Filtra e ordina</span><h3>Trova la bobina giusta</h3></div><button type="button" data-ff103-reset>Reset</button></div>
    <div class="ff103-filter-grid">
      <label class="ff103-search"><span>Cerca nei risultati</span><input type="search" value="${esc(state.query)}" placeholder="es. Bambu, nero, matte…" data-ff103-query></label>
      <label><span>Ordina</span><select data-ff103-sort>
        <option value="total" ${state.sort==='total'?'selected':''}>Prezzo finale</option>
        <option value="perkg" ${state.sort==='perkg'?'selected':''}>€/kg</option>
        <option value="product" ${state.sort==='product'?'selected':''}>Prezzo prodotto</option>
        <option value="store" ${state.sort==='store'?'selected':''}>Negozio</option>
        <option value="brand" ${state.sort==='brand'?'selected':''}>Marca</option>
      </select></label>
      <label><span>Negozio</span><select data-ff103-store><option value="all">Tutti i negozi</option>${storeOptions}</select></label>
      <label><span>Marca</span><select data-ff103-brand><option value="all">Tutte le marche</option>${brandOptions}</select></label>
      <label><span>Colore</span><select data-ff103-color><option value="all">Tutti i colori</option>${colorOptions}</select></label>
      <label class="ff103-toggle"><input type="checkbox" ${state.shippingOnly?'checked':''} data-ff103-shipping><span><i></i>Solo totale/spedizione verificata</span></label>
    </div>
  </section>`;
}
function offerCard(o,index){
  const url=safeUrl(o.url);const total=totalOf(o);const product=productPriceOf(o);const perkg=perKgOf(o);
  const finalKnown=shippingKnown(o);
  return `<article class="ff103-offer-card" data-store="${esc(storeKey(o))}">
    <div class="ff103-offer-rank">${index+1}</div>
    <div class="ff103-offer-body">
      <div class="ff103-offer-source"><span>${esc(storeName(o))}</span><i class="${o.available===false?'is-out':'is-in'}"></i><small>${stockText(o)}</small></div>
      <h3>${esc(productName(o))}</h3>
      ${o.variant?`<p>${esc(o.variant)}</p>`:''}
      <div class="ff103-tags">${offerMeta(o).map(x=>`<span>${esc(x)}</span>`).join('')}</div>
      <div class="ff103-shipping ${finalKnown?'is-known':'is-unknown'}">${finalKnown?'✓':'!'} ${esc(shippingText(o))}</div>
    </div>
    <div class="ff103-offer-money">
      <span>${finalKnown?'Totale':'Prezzo'}</span><strong>${euro(total)}</strong>
      ${perkg!==null?`<b>${euro(perkg)}/kg</b>`:''}
      ${product!==null&&total!==null&&Math.abs(product-total)>0.001?`<small>Prodotto ${euro(product)}</small>`:''}
    </div>
    ${url?`<a class="ff103-shop-button" href="${esc(url)}" target="_blank" rel="noopener">Vai al negozio <span>↗</span></a>`:''}
  </article>`;
}
function offersSection(data){
  const filtered=filterOffers(data);const all=normalizedOffers(data);
  const visible=filtered.slice(0,state.visible);
  return `<section class="ff103-results">
    <div class="ff103-results-head"><div><span class="ff103-eyebrow">Offerte</span><h2>${filtered.length} risultati</h2></div><small>${filtered.length!==all.length?`${all.length-filtered.length} filtrati`:`${all.length} totali`}</small></div>
    ${visible.length?`<div class="ff103-offer-list">${visible.map(offerCard).join('')}</div>`:`<div class="ff103-empty"><strong>Nessuna offerta con questi filtri</strong><span>Prova a rimuovere marca, colore o negozio.</span></div>`}
    ${filtered.length>visible.length?`<button class="ff103-more" type="button" data-ff103-more>Mostra altre ${Math.min(16,filtered.length-visible.length)} offerte</button>`:''}
  </section>`;
}
function sourceDetails(data){
  const sources=Array.isArray(data?.sources)?data.sources:[];
  if(!sources.length)return '';
  const ok=sources.filter(s=>s.ok!==false).length;const active=sources.filter(s=>Number(s.results||0)>0).length;
  return `<details class="ff103-diagnostics"><summary><span><b>Stato fonti</b><small>${ok}/${sources.length} raggiunte · ${active} con offerte</small></span><i>+</i></summary><div class="ff103-diagnostics-grid">${sources.map(s=>`<div class="ff103-source-row ${sourceClass(s)}"><i></i><span><b>${esc(s.name||s.id||'Fonte')}</b><small>${esc(sourceError(s))}</small></span><em>${Number.isFinite(Number(s.ms))?`${Math.round(Number(s.ms))} ms`:''}</em></div>`).join('')}</div></details>`;
}
function renderMarketplace(data){
  const root=q('#ff10-market-results');
  if(!root||!data||!Array.isArray(data.sources))return;
  state.data=data;
  const offers=normalizedOffers(data);
  if(state.store!=='all'&&!offers.some(o=>storeKey(o)===state.store))state.store='all';
  if(state.brand!=='all'&&!offers.some(o=>String(o.brand||'')===state.brand))state.brand='all';
  if(state.color!=='all'&&!offers.some(o=>String(o.color||'')===state.color))state.color='all';
  if(!offers.length){
    root.innerHTML=`${sourceRail(data)}<section class="ff103-empty big"><strong>Nessuna offerta trovata</strong><span>Le fonti sono state interrogate. Apri “Stato fonti” per capire quali negozi hanno risposto.</span><button class="ff103-refresh" type="button" data-market-refresh>↻ Riprova</button></section>${sourceDetails(data)}`;
  }else{
    root.innerHTML=overview(data,offers)+sourceRail(data)+filterBar(data,offers)+offersSection(data)+sourceDetails(data);
  }
  root.dataset.ffMarketplace='103';
  const st=q('.ff10-market-status span:last-child');
  if(st){const good=data.sources.filter(s=>s.ok!==false).length;const active=data.sources.filter(s=>Number(s.results||0)>0).length;st.textContent=`${good}/${data.sources.length} fonti raggiunte · ${active} negozi con offerte · ${offers.length} offerte`;}
  enhancePriceChrome();
}
function rerenderOffersOnly(){if(!state.data)return;const section=q('.ff103-results');if(section)section.outerHTML=offersSection(state.data);else renderMarketplace(state.data);}
function enhancePriceChrome(){
  const view=q('#ff10-view-prices');if(!view)return;
  const panel=q('.ff10-market-controls',view)?.closest('.ff10-panel');
  if(panel&&!panel.dataset.ff103){
    panel.dataset.ff103='1';panel.classList.add('ff103-search-panel');
    const btn=q('[data-market-run]',panel);if(btn){btn.innerHTML='⌕&nbsp;&nbsp;Cerca prezzi';btn.classList.add('ff103-run');}
    const status=q('.ff10-market-status',panel);if(status&&!q('.ff103-search-help',panel))status.insertAdjacentHTML('beforebegin','<p class="ff103-search-help">Interroga Bambu Lab, SUNLU, Polymaker, 3DJake, 3DStoreItalia e le altre fonti configurate in parallelo.</p>');
  }
}
function handleControl(target){
  if(target.matches('[data-ff103-sort]'))state.sort=target.value;
  else if(target.matches('[data-ff103-store]'))state.store=target.value;
  else if(target.matches('[data-ff103-brand]'))state.brand=target.value;
  else if(target.matches('[data-ff103-color]'))state.color=target.value;
  else if(target.matches('[data-ff103-shipping]'))state.shippingOnly=target.checked;
  else return false;
  state.visible=16;rerenderOffersOnly();return true;
}
function bindEvents(){
  document.addEventListener('change',e=>handleControl(e.target));
  document.addEventListener('input',e=>{
    if(!e.target.matches('[data-ff103-query]'))return;
    state.query=e.target.value;state.visible=16;
    clearTimeout(window.__ff103QueryTimer);window.__ff103QueryTimer=setTimeout(rerenderOffersOnly,140);
  });
  document.addEventListener('click',e=>{
    const more=e.target.closest('[data-ff103-more]');if(more){state.visible+=16;rerenderOffersOnly();return;}
    const reset=e.target.closest('[data-ff103-reset]');if(reset){Object.assign(state,{sort:'total',store:'all',brand:'all',color:'all',query:'',shippingOnly:false,visible:16});renderMarketplace(state.data);return;}
    const chip=e.target.closest('.ff103-source-chip.is-ok');if(chip&&chip.dataset.sourceId){state.store=chip.dataset.sourceId;state.visible=16;renderMarketplace(state.data);return;}
    const run=e.target.closest('[data-market-run]');if(run){state.visible=16;state.store='all';state.brand='all';state.color='all';state.query='';}
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
        response.clone().json().then(data=>{state.visible=16;setTimeout(()=>renderMarketplace(data),60);}).catch(()=>{});
      }
    }catch{}
    return response;
  };
}
function observePriceView(){
  const observer=new MutationObserver(()=>{
    if(renderQueued)return;renderQueued=true;
    requestAnimationFrame(()=>{
      renderQueued=false;enhancePriceChrome();
      const root=q('#ff10-market-results');
      if(state.data&&root&&root.dataset.ffMarketplace!=='103')renderMarketplace(state.data);
    });
  });
  observer.observe(document.body,{subtree:true,childList:true});
}
function init(){hookFetch();bindEvents();observePriceView();enhancePriceChrome();window.FILAMENT_FINDER_VERSION=VERSION;}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
