(function(){
'use strict';

const VERSION='10.6.0';
window.FF106_SOURCE_STATUS_VERSION=VERSION;

const upstreamFetch=window.fetch.bind(window);
const q=(s,r=document)=>r.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function statusOf(source){
  const results=Math.max(0,Number(source?.results)||0);
  const raw=String(source?.error_message||source?.error||source?.message||'').trim();
  const timeout=/timeout|timed out|deadline|budget|tempo scaduto/i.test(raw);
  if(source?.ok===false){
    if(timeout)return {code:'timeout',label:'Timeout',detail:raw||'La fonte non ha risposto entro il tempo massimo'};
    return {code:'error',label:'Errore',detail:raw||'Errore durante la ricerca'};
  }
  if(results>0)return {code:'ok',label:'OK',detail:`${results} ${results===1?'offerta':'offerte'} trovate`};
  return {code:'empty',label:'Nessun risultato',detail:'Fonte raggiunta, ma nessuna offerta corrispondente'};
}

function enrichSources(data){
  if(!data||!Array.isArray(data.sources))return data;
  const sources=data.sources.map(source=>{
    const status=statusOf(source);
    return {...source,status:status.code,status_label:status.label,status_detail:status.detail};
  });
  const counts={ok:0,empty:0,error:0,timeout:0};
  for(const source of sources)counts[source.status]=(counts[source.status]||0)+1;
  const enriched={...data,sources,source_status_summary:{version:VERSION,total:sources.length,...counts}};
  window.FF106_LAST_DATA=enriched;
  return enriched;
}

window.FF106_ENRICH_SOURCE_STATUS=enrichSources;
window.FF106_STATUS_OF=statusOf;

window.fetch=async function(input,init){
  const raw=typeof input==='string'?input:String(input?.url||'');
  let isMarket=false;
  try{isMarket=/\/api\/(?:catalog|prices)(?:\?|$)/.test(new URL(raw,location.href).pathname+new URL(raw,location.href).search);}catch{}
  const response=await upstreamFetch(input,init);
  if(!isMarket||!response.ok)return response;
  try{
    const data=await response.clone().json();
    const enriched=enrichSources(data);
    const headers=new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('content-encoding');
    headers.delete('transfer-encoding');
    headers.set('content-type','application/json; charset=utf-8');
    return new Response(JSON.stringify(enriched),{status:response.status,statusText:response.statusText,headers});
  }catch(err){
    console.warn('FF106 source status:',err);
    return response;
  }
};

function badge(status){
  return `<span class="ff106-status-badge is-${esc(status.code)}"><i></i>${esc(status.label)}</span>`;
}

function sourceCard(source){
  const status=statusOf(source);
  const ms=Number(source?.ms);
  const latency=Number.isFinite(ms)&&ms>=0?`${Math.round(ms)} ms`:'—';
  return `<article class="ff106-source-card is-${esc(status.code)}" data-ff106-source="${esc(source?.id||'')}">
    <div class="ff106-source-main">
      <div class="ff106-source-name"><strong>${esc(source?.name||source?.id||'Fonte')}</strong>${badge(status)}</div>
      <p>${esc(status.detail)}</p>
    </div>
    <div class="ff106-source-meta"><span>${Math.max(0,Number(source?.results)||0)} risultati</span><span>${esc(latency)}</span></div>
  </article>`;
}

function summaryCard(code,label,count){
  return `<div class="ff106-summary-card is-${code}"><span>${esc(label)}</span><strong>${Number(count)||0}</strong></div>`;
}

function render(data){
  const root=q('#ff10-market-results');
  if(!root||!data||!Array.isArray(data.sources))return;
  const old=q('.ff106-source-status-panel',root);
  if(old)old.remove();

  const normalized=enrichSources(data);
  const s=normalized.source_status_summary||{total:0,ok:0,empty:0,error:0,timeout:0};
  const panel=document.createElement('section');
  panel.className='ff106-source-status-panel';
  panel.innerHTML=`
    <div class="ff106-head">
      <div><span class="ff106-eyebrow">Stato fonti</span><h2>Tutte le fonti della ricerca</h2><p>Ogni sito mostra sempre l'esito reale dell'ultimo tentativo.</p></div>
      <div class="ff106-total"><strong>${s.total}</strong><span>fonti interrogate</span></div>
    </div>
    <div class="ff106-summary">
      ${summaryCard('ok','OK',s.ok)}
      ${summaryCard('empty','Nessun risultato',s.empty)}
      ${summaryCard('error','Errore',s.error)}
      ${summaryCard('timeout','Timeout',s.timeout)}
    </div>
    <div class="ff106-source-grid">${normalized.sources.map(sourceCard).join('')}</div>`;

  const anchor=q('.ff103-source-rail',root)||q('.ff103-filter-panel',root)||root.firstElementChild;
  if(anchor)anchor.insertAdjacentElement('beforebegin',panel); else root.prepend(panel);

  for(const chip of root.querySelectorAll('.ff103-source-chip')){
    const id=chip.getAttribute('data-source-id')||'';
    const source=normalized.sources.find(x=>String(x?.id||'')===id);
    if(!source)continue;
    const status=statusOf(source);
    chip.classList.remove('is-ok','is-empty','is-error','is-timeout');
    chip.classList.add(`is-${status.code}`);
    chip.setAttribute('title',`${source.name||source.id}: ${status.label} — ${status.detail}`);
    chip.setAttribute('aria-label',`${source.name||source.id}: ${status.label}`);
  }
}

function scheduleRender(){
  const data=window.FF106_LAST_DATA||window.FF105_LAST_DATA;
  if(data&&Array.isArray(data.sources))requestAnimationFrame(()=>render(data));
}

const observer=new MutationObserver(()=>scheduleRender());
function boot(){
  const root=q('#ff10-market-results');
  if(root)observer.observe(root,{childList:true,subtree:true});
  scheduleRender();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true}); else boot();

window.addEventListener('popstate',scheduleRender);
})();
