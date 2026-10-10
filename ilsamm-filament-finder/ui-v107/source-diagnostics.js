(function(){
'use strict';

const VERSION='10.7.0';
window.FF107_SOURCE_DIAGNOSTICS_VERSION=VERSION;
const q=(s,r=document)=>r.querySelector(s);
const qa=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null;};
const retrying=new Set();
let renderQueued=false;
let observer=null;

function statusOf(source){
  if(typeof window.FF106_STATUS_OF==='function')return window.FF106_STATUS_OF(source);
  const results=Math.max(0,Number(source?.results)||0);
  const raw=clean(source?.diagnostic_error||source?.error_message||source?.error);
  if(source?.ok===false){
    if(/timeout|timed out|deadline|budget|tempo scaduto/i.test(raw))return {code:'timeout',label:'Timeout',detail:raw||'Timeout'};
    return {code:'error',label:'Errore',detail:raw||'Errore durante la ricerca'};
  }
  return results>0?{code:'ok',label:'OK',detail:`${results} ${results===1?'offerta':'offerte'} trovate`}:{code:'empty',label:'Nessun risultato',detail:'Fonte raggiunta, ma nessuna offerta corrispondente'};
}

function currentData(){return window.FF106_LAST_DATA||window.FF105_LAST_DATA||null;}
function currentContext(){
  return {
    material:q('#ff10-price-material')?.value||'PLA',
    brand:'all',
    qty:q('#ff10-price-qty')?.value||'1'
  };
}
function errorText(source,status){
  const raw=clean(source?.diagnostic_error||source?.error_message||source?.error);
  if(raw)return raw;
  if(status.code==='timeout')return 'Timeout senza ulteriore dettaglio restituito dal backend.';
  if(status.code==='error')return 'Errore senza ulteriore dettaglio restituito dal backend.';
  return '—';
}
function displayUrl(source){return clean(source?.request_url||source?.final_url||source?.url||source?.search_url)||'—';}
function httpText(source){const v=num(source?.http_status);return v===null?'—':String(Math.round(v));}
function latencyText(source){const v=num(source?.ms)??num(source?.http_ms);return v===null?'—':`${Math.round(v)} ms`;}
function requestLatencyText(source){const v=num(source?.http_ms);return v===null?'—':`${Math.round(v)} ms`;}
function sourceRows(data){return Array.isArray(data?.sources)?data.sources:[];}

function retryButton(source,status){
  if(!['error','timeout'].includes(status.code))return '';
  const id=String(source?.id||'');
  const busy=retrying.has(id);
  return `<button class="ff107-retry" type="button" data-ff107-retry="${esc(id)}" ${busy?'disabled':''}>${busy?'↻ Riprovo…':'↻ Riprova fonte'}</button>`;
}

function card(source){
  const status=statusOf(source);
  const url=displayUrl(source);
  const results=Math.max(0,Number(source?.results)||0);
  const requests=Math.max(0,Number(source?.request_count)||0);
  return `<article class="ff107-card is-${esc(status.code)}" data-ff107-source="${esc(source?.id||'')}">
    <div class="ff107-card-head">
      <div class="ff107-title-wrap"><strong>${esc(source?.name||source?.id||'Fonte')}</strong><span class="ff107-badge is-${esc(status.code)}"><i></i>${esc(status.label)}</span></div>
      ${retryButton(source,status)}
    </div>
    <div class="ff107-diagnostic-grid">
      <div class="ff107-field is-url"><span>URL chiamato</span><code title="${esc(url)}">${esc(url)}</code></div>
      <div class="ff107-field"><span>HTTP</span><strong>${esc(httpText(source))}</strong></div>
      <div class="ff107-field"><span>Tempo fonte</span><strong>${esc(latencyText(source))}</strong></div>
      <div class="ff107-field"><span>Tempo HTTP</span><strong>${esc(requestLatencyText(source))}</strong></div>
      <div class="ff107-field"><span>Risultati</span><strong>${results}</strong></div>
      <div class="ff107-field"><span>Richieste HTTP</span><strong>${requests||'—'}</strong></div>
    </div>
    <div class="ff107-error ${['error','timeout'].includes(status.code)?'is-visible':''}"><span>${['error','timeout'].includes(status.code)?'Motivo preciso':'Esito'}</span><p>${esc(['error','timeout'].includes(status.code)?errorText(source,status):status.detail)}</p></div>
  </article>`;
}

function render(){
  const root=q('#ff10-market-results');
  const data=currentData();
  if(!root||!data||!Array.isArray(data.sources))return;
  let panel=q('.ff107-diagnostics-panel',root);
  const html=`<div class="ff107-panel-head"><div><span>Diagnostica avanzata</span><h2>Dettaglio tecnico per fonte</h2><p>URL realmente chiamato, risposta HTTP, tempi, risultati e causa del fallimento.</p></div><div class="ff107-count"><strong>${data.sources.length}</strong><span>fonti</span></div></div><div class="ff107-grid">${data.sources.map(card).join('')}</div>`;
  if(!panel){
    panel=document.createElement('section');
    panel.className='ff107-diagnostics-panel';
    const anchor=q('.ff106-source-status-panel',root)||q('.ff103-source-rail',root)||root.firstElementChild;
    if(anchor)anchor.insertAdjacentElement('afterend',panel);else root.prepend(panel);
  }
  if(panel.dataset.signature===JSON.stringify(data.sources.map(s=>[s.id,s.ok,s.results,s.error,s.error_message,s.diagnostic_error,s.request_url,s.http_status,s.ms,s.http_ms,retrying.has(String(s.id||''))])))return;
  panel.innerHTML=html;
  panel.dataset.signature=JSON.stringify(data.sources.map(s=>[s.id,s.ok,s.results,s.error,s.error_message,s.diagnostic_error,s.request_url,s.http_status,s.ms,s.http_ms,retrying.has(String(s.id||''))]));
}

function mergeSingleSource(base,retry,sourceId){
  if(!base||!retry)return base;
  const retrySources=sourceRows(retry);
  const replacement=retrySources.find(s=>String(s?.id||'')===String(sourceId))||retrySources[0]||null;
  const sources=sourceRows(base).map(s=>String(s?.id||'')===String(sourceId)&&replacement?replacement:s);
  if(replacement&&!sources.some(s=>String(s?.id||'')===String(sourceId)))sources.push(replacement);
  const kept=(Array.isArray(base.offers)?base.offers:[]).filter(o=>String(o?.source_id||'')!==String(sourceId));
  const incoming=(Array.isArray(retry.offers)?retry.offers:[]).filter(o=>String(o?.source_id||sourceId)===String(sourceId));
  return {...base,sources,offers:[...kept,...incoming]};
}

async function retrySource(sourceId){
  sourceId=String(sourceId||'');
  if(!sourceId||retrying.has(sourceId))return;
  const base=currentData();
  if(!base)return;
  retrying.add(sourceId);render();
  const ctx=currentContext();
  try{
    const url=`/api/catalog?material=${encodeURIComponent(ctx.material)}&brand=${encodeURIComponent(ctx.brand)}&qty=${encodeURIComponent(ctx.qty)}&refresh=1&source=${encodeURIComponent(sourceId)}`;
    const response=await window.fetch(url,{cache:'no-store'});
    if(!response.ok)throw new Error(`HTTP ${response.status} durante il retry della fonte`);
    const retry=await response.json();
    const merged=mergeSingleSource(base,retry,sourceId);
    window.FF105_LAST_DATA=merged;
    window.FF106_LAST_DATA=typeof window.FF106_ENRICH_SOURCE_STATUS==='function'?window.FF106_ENRICH_SOURCE_STATUS(merged):merged;
    if(typeof window.FF103_RENDER_MARKETPLACE==='function')window.FF103_RENDER_MARKETPLACE(window.FF106_LAST_DATA);
    requestAnimationFrame(render);
  }catch(err){
    const sources=sourceRows(base).map(s=>String(s?.id||'')===sourceId?{...s,ok:false,results:0,error_message:clean(err?.message||err),diagnostic_error:clean(err?.message||err)}:s);
    const merged={...base,sources};
    window.FF105_LAST_DATA=merged;
    window.FF106_LAST_DATA=typeof window.FF106_ENRICH_SOURCE_STATUS==='function'?window.FF106_ENRICH_SOURCE_STATUS(merged):merged;
    if(typeof window.FF103_RENDER_MARKETPLACE==='function')window.FF103_RENDER_MARKETPLACE(window.FF106_LAST_DATA);
  }finally{
    retrying.delete(sourceId);requestAnimationFrame(render);
  }
}
window.FF107_RETRY_SOURCE=retrySource;

function onClick(event){
  const btn=event.target.closest?.('[data-ff107-retry]');
  if(!btn)return;
  event.preventDefault();event.stopPropagation();
  retrySource(btn.getAttribute('data-ff107-retry'));
}
document.addEventListener('click',onClick,true);

function schedule(){if(renderQueued)return;renderQueued=true;requestAnimationFrame(()=>{renderQueued=false;render();});}
function boot(){
  if(observer)observer.disconnect();
  observer=new MutationObserver(mutations=>{
    if(mutations.some(m=>[...m.addedNodes,...m.removedNodes].some(n=>n?.nodeType===1&&!n.classList?.contains('ff107-diagnostics-panel'))))schedule();
  });
  observer.observe(document.body,{childList:true,subtree:true});
  schedule();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
