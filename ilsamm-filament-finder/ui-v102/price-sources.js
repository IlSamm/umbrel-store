(function(){
'use strict';

const VERSION='10.2.0';
window.FILAMENT_FINDER_VERSION=VERSION;
const esc=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const q=(s,r=document)=>r.querySelector(s);
const euro=(v)=>{const n=Number(v);return Number.isFinite(n)?new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(n):'—';};
const num=(v)=>{const n=Number(v);return Number.isFinite(n)?n:null;};
const safeUrl=(v)=>{try{const u=new URL(String(v||''),location.href);return /^https?:$/.test(u.protocol)?u.href:'';}catch{return'';}};
const priceOf=(o)=>num(o?.final_total)??num(o?.price);
const perKgOf=(o)=>num(o?.final_perkg)??num(o?.perkg);

function errorLabel(source){
  const msg=String(source?.error_message||source?.error||'').trim();
  if(/429|too many requests/i.test(msg))return 'Limite richieste (429)';
  if(/budget|timeout/i.test(msg))return 'Timeout';
  if(source?.ok===false)return msg?msg.slice(0,46):'Non raggiungibile';
  if(Number(source?.results||0)===0)return '0 offerte';
  return `${source.results} offerte`;
}
function sourceState(source){
  if(source?.ok===false)return 'is-error';
  if(Number(source?.results||0)===0)return 'is-empty';
  return 'is-ok';
}
function sourceSummary(data){
  const sources=Array.isArray(data?.sources)?data.sources:[];
  if(!sources.length)return '';
  const ok=sources.filter(s=>s.ok!==false).length;
  const withResults=sources.filter(s=>Number(s.results||0)>0).length;
  return `<section class="ff102-price-sources">
    <div class="ff102-price-section-head">
      <div><span>Fonti controllate</span><h2>${ok}/${sources.length} raggiunte</h2></div>
      <small>${withResults} negozi con offerte</small>
    </div>
    <div class="ff102-source-grid">${sources.map(s=>`<article class="ff102-source ${sourceState(s)}" data-source-id="${esc(s.id||'')}">
      <div class="ff102-source-top"><i></i><strong>${esc(s.name||s.id||'Fonte')}</strong></div>
      <b>${esc(errorLabel(s))}</b>
      <small>${Number.isFinite(Number(s.ms))?`${Math.round(Number(s.ms))} ms`:esc(s.shipping||'')}</small>
    </article>`).join('')}</div>
  </section>`;
}
function normalizeOffers(data){
  return (Array.isArray(data?.offers)?data.offers:[])
    .filter(o=>o&&o.available!==false&&priceOf(o)!==null)
    .sort((a,b)=>(priceOf(a)??1e9)-(priceOf(b)??1e9));
}
function sourceLookup(data){
  const m=new Map();
  for(const s of (Array.isArray(data?.sources)?data.sources:[]))m.set(String(s.id||''),s);
  return m;
}
function offerMeta(o){
  const items=[];
  if(o.brand)items.push(o.brand);
  if(o.color&&String(o.color).toLowerCase()!=='unknown')items.push(o.color);
  if(o.format)items.push(o.format);
  if(o.size)items.push(o.size);
  if(o.shipping_known===true)items.push(`sped. ${euro(o.shipping_cost||0)}`);
  else if(o.shipping_note)items.push('spedizione al checkout');
  return [...new Set(items.map(String))].slice(0,5);
}
function compactOffer(o,featured=false){
  const url=safeUrl(o.url);const total=priceOf(o);const perkg=perKgOf(o);
  return `<article class="ff102-offer${featured?' is-featured':''}">
    <div class="ff102-offer-main"><span>${esc(o.store||o.source_id||'Negozio')}</span><h3>${esc(o.product||'Filamento')}</h3>${o.variant?`<p>${esc(o.variant)}</p>`:''}<div class="ff102-offer-meta">${offerMeta(o).map(x=>`<small>${esc(x)}</small>`).join('')}</div></div>
    <div class="ff102-offer-price"><strong>${euro(total)}</strong>${perkg!==null?`<small>${euro(perkg)}/kg</small>`:''}${o.final_total!=null&&o.price!=null&&Number(o.final_total)!==Number(o.price)?`<em>prodotto ${euro(o.price)}</em>`:''}</div>
    ${url?`<a href="${esc(url)}" target="_blank" rel="noopener">Apri offerta ↗</a>`:''}
  </article>`;
}
function bestOverall(offers){
  const o=offers[0];if(!o)return '';
  return `<section class="ff102-best"><div class="ff102-best-label">Migliore offerta complessiva</div>${compactOffer(o,true)}</section>`;
}
function bestByStore(data,offers){
  if(!offers.length)return '';
  const sources=sourceLookup(data);const grouped=new Map();
  for(const o of offers){const key=String(o.source_id||o.store||'altro');if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(o);}
  const entries=[...grouped.entries()].map(([key,rows])=>({key,rows,best:rows[0],source:sources.get(key)}));
  entries.sort((a,b)=>(priceOf(a.best)??1e9)-(priceOf(b.best)??1e9));
  return `<section class="ff102-store-best"><div class="ff102-price-section-head"><div><span>Confronto negozi</span><h2>Il migliore di ogni fonte</h2></div><small>${entries.length} negozi</small></div>
    <div class="ff102-store-strip">${entries.map(({key,rows,best,source})=>`<article class="ff102-store-card">
      <div><span>${esc(source?.name||best.store||key)}</span><small>${rows.length} ${rows.length===1?'offerta':'offerte'}</small></div>
      <strong>${euro(priceOf(best))}</strong><small>${perKgOf(best)!==null?`${euro(perKgOf(best))}/kg`:'miglior totale'}</small>
    </article>`).join('')}</div></section>`;
}
function groupedOffers(data,offers){
  const sources=sourceLookup(data);const grouped=new Map();
  for(const o of offers){const key=String(o.source_id||o.store||'altro');if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(o);}
  const ordered=[];
  for(const s of (Array.isArray(data?.sources)?data.sources:[]))if(grouped.has(String(s.id)))ordered.push([String(s.id),grouped.get(String(s.id))]);
  for(const e of grouped)if(!ordered.some(x=>x[0]===e[0]))ordered.push(e);
  if(!ordered.length)return '';
  return `<section class="ff102-all-offers"><div class="ff102-price-section-head"><div><span>Tutte le offerte</span><h2>Divise per negozio</h2></div><small>${offers.length} totali</small></div>
    <div class="ff102-store-groups">${ordered.map(([key,rows],i)=>{const source=sources.get(key);const name=source?.name||rows[0]?.store||key;return `<details class="ff102-store-group"${i<2?' open':''}><summary><span><b>${esc(name)}</b><small>${rows.length} offerte</small></span><strong>da ${euro(priceOf(rows[0]))}</strong><i></i></summary><div class="ff102-store-offers">${rows.slice(0,20).map(o=>compactOffer(o)).join('')}${rows.length>20?`<p class="ff102-more-note">Mostrate le prime 20 di ${rows.length} offerte di ${esc(name)}.</p>`:''}</div></details>`;}).join('')}</div></section>`;
}
function renderTransparentMarket(data){
  const root=q('#ff10-market-results');
  if(!root||!data||!Array.isArray(data.sources))return;
  const offers=normalizeOffers(data);
  if(!offers.length){
    root.innerHTML=`${sourceSummary(data)}<section class="ff102-no-offers"><h2>Nessuna offerta disponibile</h2><p>Le fonti controllate sono mostrate sopra: puoi vedere subito quale negozio ha risposto e quale ha avuto un errore.</p><button class="ff10-button secondary" data-market-refresh>Aggiorna</button></section>`;
  }else{
    root.innerHTML=sourceSummary(data)+bestOverall(offers)+bestByStore(data,offers)+groupedOffers(data,offers);
  }
  const status=q('.ff10-market-status span:last-child');
  if(status){const good=data.sources.filter(s=>s.ok!==false).length;const resultSources=data.sources.filter(s=>Number(s.results||0)>0).length;status.textContent=`${good}/${data.sources.length} fonti raggiunte · ${resultSources} con offerte · ${offers.length} offerte`;}
  root.dataset.ff102Sources='1';
}

function hookFetch(){
  if(window.__ff102PriceFetchHook)return;
  window.__ff102PriceFetchHook=true;
  const original=window.fetch.bind(window);
  window.fetch=async function(input,init){
    const response=await original(input,init);
    try{
      const url=typeof input==='string'?input:String(input?.url||'');
      if(/\/api\/(?:catalog|prices)(?:\?|$)/.test(url)){
        response.clone().json().then(data=>setTimeout(()=>renderTransparentMarket(data),80)).catch(()=>{});
      }
    }catch{}
    return response;
  };
}
function init(){hookFetch();window.FILAMENT_FINDER_VERSION=VERSION;}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
