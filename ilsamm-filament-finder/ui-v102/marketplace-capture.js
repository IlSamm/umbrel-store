(function(){
'use strict';

const VERSION='10.3.0';
const q=(s,r=document)=>r.querySelector(s);
const esc=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
let running=false;

function setBusy(busy){
  const buttons=[...document.querySelectorAll('[data-market-run],[data-market-refresh]')];
  for(const btn of buttons){
    if(!btn.dataset.ff103Label) btn.dataset.ff103Label=btn.innerHTML;
    btn.disabled=busy;
    if(btn.matches('[data-market-run]')) btn.innerHTML=busy?'⌕&nbsp;&nbsp;Cerco prezzi…':'⌕&nbsp;&nbsp;Cerca prezzi';
  }
}

async function runMarketplaceSearch(refresh=true){
  if(running) return;
  running=true;
  const material=q('#ff10-price-material')?.value||'PLA';
  const qty=q('#ff10-price-qty')?.value||'1';
  const root=q('#ff10-market-results');
  if(root){
    root.innerHTML='<section class="ff103-results"><div class="ff103-empty big"><strong>Sto confrontando i negozi…</strong><span>Bambu Lab, SUNLU, Polymaker, 3DJake e le altre fonti vengono interrogate in parallelo.</span></div></section>';
    delete root.dataset.ffMarketplace;
  }
  setBusy(true);
  try{
    const url=`/api/catalog?material=${encodeURIComponent(material)}&brand=all&qty=${encodeURIComponent(qty)}&refresh=${refresh?1:0}`;
    const response=await window.fetch(url,{cache:'no-store'});
    if(!response.ok) throw new Error(`HTTP ${response.status}`);
    const data=await response.json();
    if(typeof window.FF103_RENDER_MARKETPLACE!=='function') throw new Error('Marketplace renderer non disponibile');
    window.FF103_RENDER_MARKETPLACE(data);
  }catch(err){
    if(root) root.innerHTML=`<section class="ff103-results"><div class="ff103-empty big"><strong>Ricerca non completata</strong><span>${esc(err?.message||'Errore di rete')}</span><button class="ff103-refresh" type="button" data-market-refresh>↻ Riprova</button></div></section>`;
  }finally{
    running=false;
    setBusy(false);
  }
}

function capturePriceAction(event){
  const trigger=event.target.closest?.('[data-market-run],[data-market-refresh]');
  if(!trigger) return;
  if(!trigger.closest('#ff10-app')) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  runMarketplaceSearch(true);
}

document.addEventListener('click',capturePriceAction,true);
window.FF103_RUN_MARKET_SEARCH=runMarketplaceSearch;
window.FF103_CAPTURE_VERSION=VERSION;
})();
