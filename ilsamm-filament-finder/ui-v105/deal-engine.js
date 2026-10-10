(function(){
'use strict';

const VERSION='10.5.0';
window.FF105_DEAL_ENGINE_VERSION=VERSION;

const upstreamFetch=window.fetch.bind(window);
const q=(s,r=document)=>r.querySelector(s);
const qa=(s,r=document)=>[...r.querySelectorAll(s)];
const num=v=>{
  if(v===null||v===undefined||v==='')return null;
  const n=Number(String(v).replace(',','.').replace(/[^0-9.+-]/g,''));
  return Number.isFinite(n)?n:null;
};
const round=(v,d=2)=>{const p=10**d;return Math.round((Number(v)||0)*p)/p;};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const euro=v=>{const n=num(v);return n===null?'—':new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(n);};
const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
const normalize=v=>clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const safeUrl=v=>{try{const u=new URL(String(v||''),location.href);return /^https?:$/.test(u.protocol)?u.href:'';}catch{return'';}};
const sourceKey=o=>String(o?.source_id||o?.store||'altro');
const storeName=o=>String(o?.store||o?.source_name||o?.source_id||'Negozio');
const productName=o=>String(o?.product||o?.title||o?.name||'Filamento');

function contextFromRequest(input){
  try{
    const raw=typeof input==='string'?input:String(input?.url||'');
    const u=new URL(raw,location.href);
    if(!/\/api\/(?:catalog|prices)$/.test(u.pathname))return null;
    return {material:u.searchParams.get('material')||'',qty:num(u.searchParams.get('qty'))||1};
  }catch{return null;}
}

function packCountOf(o){
  const text=clean([o?.product,o?.variant,o?.format,o?.size].filter(Boolean).join(' '));
  const multi=text.match(/\b(\d{1,2})\s*[x×]\s*\d+(?:[.,]\d+)?\s*(?:kg|g)\b/i);
  if(multi)return Math.max(1,Number(multi[1]));
  const pack=text.match(/(?:\bpack\s*(?:of|da)?\s*(\d{1,2})\b|\bconfezione\s*(?:da)?\s*(\d{1,2})\b|\b(\d{1,2})\s*(?:bobine|spools?|rolls?|rotoli)\b)/i);
  if(pack)return Math.max(1,Number(pack[1]||pack[2]||pack[3]||1));
  return 1;
}

function normalizeTiers(o){
  const rows=Array.isArray(o?.promo_tiers)?o.promo_tiers:[];
  const out=[];
  for(const raw of rows){
    if(!raw||raw.verified===false)continue;
    const minQty=Math.max(1,Math.round(num(raw.min_qty)||0));
    if(!minQty)continue;
    const discount=num(raw.discount_pct);
    const unitPerKg=num(raw.unit_price_perkg);
    const payQty=Math.max(0,Math.round(num(raw.pay_qty)||0));
    const buyQty=Math.max(0,Math.round(num(raw.buy_qty)||0));
    if(discount!==null&&discount>0&&discount<95)out.push({kind:'percent',minQty,discountPct:discount,verified:true,label:raw.label||`${minQty}+ bobine · -${discount}%`});
    else if(unitPerKg!==null&&unitPerKg>2&&unitPerKg<500)out.push({kind:'perkg',minQty,unitPerKg,approximate:raw.approximate===true,verified:true,label:raw.label||`${minQty}+ bobine · ${euro(unitPerKg)}/kg`});
    else if(buyQty>1&&payQty>0&&payQty<buyQty)out.push({kind:'buyx',minQty:Math.max(minQty,buyQty),buyQty,payQty,verified:true,label:raw.label||`${buyQty} al prezzo di ${payQty}`});
  }
  const seen=new Set();
  return out.filter(t=>{const k=[t.kind,t.minQty,t.discountPct,t.unitPerKg,t.buyQty,t.payQty].join('|');if(seen.has(k))return false;seen.add(k);return true;}).sort((a,b)=>a.minQty-b.minQty);
}

function shippingState(o,baseSubtotal){
  const explicit=num(o?.shipping_cost)??num(o?.shipping)??num(o?.delivery_cost);
  if(explicit!==null&&explicit>=0&&explicit<300)return {cost:explicit,known:true};
  const final=num(o?.final_total);
  if(o?.shipping_known===true&&final!==null&&baseSubtotal!==null){
    const inferred=round(final-baseSubtotal,2);
    if(inferred>=0&&inferred<150)return {cost:inferred,known:true};
  }
  return {cost:0,known:false};
}

function bestTierPlan(o,targetKg){
  const unitPrice=num(o?.price);
  const packageKg=num(o?.weight_kg)||1;
  const packages=Math.max(1,Math.round(num(o?.ff104_packages)||Math.ceil(targetKg/packageKg-1e-9)));
  const purchasedKg=num(o?.ff104_purchased_kg)||round(packages*packageKg,3);
  const packCount=packCountOf(o);
  const spoolCount=Math.max(1,packages*packCount);
  const baseSubtotal=round((unitPrice||0)*packages,2);
  const shipping=shippingState(o,baseSubtotal);
  const currentTotal=num(o?.final_total)??round(baseSubtotal+(shipping.known?shipping.cost:0),2);
  const listPrice=num(o?.list_price);
  const listSubtotal=listPrice!==null&&listPrice>unitPrice?round(listPrice*packages,2):null;
  const tiers=normalizeTiers(o);
  let best={subtotal:baseSubtotal,tier:null};

  for(const tier of tiers){
    if(spoolCount<tier.minQty)continue;
    let subtotal=null;
    if(tier.kind==='percent')subtotal=round(baseSubtotal*(1-tier.discountPct/100),2);
    else if(tier.kind==='perkg'&&!tier.approximate)subtotal=round(tier.unitPerKg*purchasedKg,2);
    else if(tier.kind==='buyx'&&packCount===1){
      const full=Math.floor(spoolCount/tier.buyQty),rest=spoolCount%tier.buyQty;
      subtotal=round((full*tier.payQty+rest)*(unitPrice||0),2);
    }
    if(subtotal!==null&&subtotal>=0&&subtotal<best.subtotal-0.005)best={subtotal,tier};
  }

  const freeThreshold=num(o?.free_shipping_threshold);
  let shipCost=shipping.cost,shipKnown=shipping.known,freeShipping=false;
  if(freeThreshold!==null&&freeThreshold>0&&best.subtotal>=freeThreshold){shipCost=0;shipKnown=true;freeShipping=true;}
  const effectiveTotal=round(best.subtotal+(shipKnown?shipCost:0),2);
  const regularTotal=round(baseSubtotal+(shipping.known?shipping.cost:0),2);
  const listTotal=listSubtotal!==null?round(listSubtotal+(shipping.known?shipping.cost:0),2):null;
  const bulkSavings=Math.max(0,round(regularTotal-effectiveTotal,2));
  const saleSavings=listTotal!==null?Math.max(0,round(listTotal-regularTotal,2)):0;
  const totalSavings=listTotal!==null?Math.max(0,round(listTotal-effectiveTotal,2)):bulkSavings;
  const bulkPct=regularTotal>0?round(bulkSavings/regularTotal*100,1):0;
  const salePct=listTotal&&listTotal>0?round(saleSavings/listTotal*100,1):0;

  return {packages,purchasedKg,packCount,spoolCount,baseSubtotal,regularTotal,listTotal,effectiveTotal,shippingKnown:shipKnown,shippingCost:shipCost,freeShipping,tier:best.tier,tiers,bulkSavings,bulkPct,saleSavings,salePct,totalSavings};
}

function enrichOffer(o,targetKg){
  if(!o||num(o.price)===null)return o;
  const plan=bestTierPlan(o,targetKg);
  const copy={...o};
  copy.ff105_plan=plan;
  copy.ff105_regular_total=plan.regularTotal;
  copy.ff105_list_total=plan.listTotal;
  copy.ff105_bulk_savings=plan.bulkSavings;
  copy.ff105_sale_savings=plan.saleSavings;
  copy.ff105_total_savings=plan.totalSavings;
  copy.ff105_spool_count=plan.spoolCount;
  copy.ff105_promo_applied=!!plan.tier;
  copy.ff105_promo_label=plan.tier?.label||'';
  copy.ff105_free_shipping=plan.freeShipping;
  if(plan.tier){
    copy.final_total=plan.effectiveTotal;
    copy.final_perkg=plan.purchasedKg>0?round(plan.effectiveTotal/plan.purchasedKg,2):copy.final_perkg;
    if(plan.shippingKnown){copy.shipping_known=true;copy.shipping_cost=plan.shippingCost;}
  }
  return copy;
}

function enrichCatalog(data,context){
  if(!data||!Array.isArray(data.offers))return data;
  const targetKg=Math.max(0.1,num(context?.qty)??num(data.quantity)??1);
  const offers=data.offers.map(o=>enrichOffer(o,targetKg));
  const dealOffers=offers.filter(o=>o?.ff105_promo_applied||num(o?.ff105_sale_savings)>0||o?.ff105_free_shipping||normalizeTiers(o).length);
  const best=[...offers].filter(o=>num(o?.final_total)!==null).sort((a,b)=>num(a.final_total)-num(b.final_total)||((num(b.match_score)||0)-(num(a.match_score)||0)))[0]||null;
  const promoBest=[...dealOffers].filter(o=>num(o?.final_total)!==null).sort((a,b)=>num(a.final_total)-num(b.final_total))[0]||null;
  const enriched={...data,offers,deals:{version:VERSION,target_kg:targetKg,promo_offer_count:dealOffers.length,best_source:best?sourceKey(best):null,best_total:best?num(best.final_total):null,best_promo_source:promoBest?sourceKey(promoBest):null,best_promo_total:promoBest?num(promoBest.final_total):null}};
  window.FF105_LAST_DATA=enriched;
  return enriched;
}

window.fetch=async function(input,init){
  const context=contextFromRequest(input);
  const response=await upstreamFetch(input,init);
  if(!context||!response.ok)return response;
  try{
    const data=await response.clone().json();
    const enriched=enrichCatalog(data,context);
    const headers=new Headers(response.headers);
    headers.delete('content-length');headers.delete('content-encoding');headers.delete('transfer-encoding');
    headers.set('content-type','application/json; charset=utf-8');
    return new Response(JSON.stringify(enriched),{status:response.status,statusText:response.statusText,headers});
  }catch(err){
    console.warn('FF105 deal engine:',err);
    return response;
  }
};

function dealBadges(o){
  const badges=[];
  const plan=o?.ff105_plan;
  if(o?.ff105_promo_applied)badges.push(`<span class="ff105-badge hot">${esc(o.ff105_promo_label||'Sconto quantità')}</span>`);
  else if(plan?.tiers?.length)badges.push('<span class="ff105-badge">Promo quantità disponibile</span>');
  if(num(o?.ff105_sale_savings)>0)badges.push(`<span class="ff105-badge sale">Prezzo promo · -${esc(plan?.salePct||'')}%</span>`);
  if(o?.ff104_refill)badges.push('<span class="ff105-badge refill">Refill</span>');
  if(o?.ff105_free_shipping)badges.push('<span class="ff105-badge shipping">Spedizione gratis</span>');
  if(clean(o?.promo_code))badges.push(`<span class="ff105-badge code">Codice ${esc(o.promo_code)}</span>`);
  return badges.join('');
}

function promoRuleText(o){
  const tiers=normalizeTiers(o);
  if(!tiers.length)return '';
  return tiers.map(t=>esc(t.label)).join(' · ');
}

function dealCard(o,rank){
  const plan=o?.ff105_plan||bestTierPlan(o,num(window.FF105_LAST_DATA?.deals?.target_kg)||1);
  const url=safeUrl(o?.url);
  const save=num(o?.ff105_total_savings)||0;
  return `<article class="ff105-deal-card">
    <div class="ff105-deal-rank">${rank}</div>
    <div class="ff105-deal-main">
      <div class="ff105-deal-store">${esc(storeName(o))}</div>
      <h3>${esc(productName(o))}</h3>
      <div class="ff105-badges">${dealBadges(o)}</div>
      ${promoRuleText(o)?`<p class="ff105-rule">${promoRuleText(o)}</p>`:''}
      <small>${plan.spoolCount} ${plan.spoolCount===1?'bobina':'bobine'} · ${plan.purchasedKg} kg acquistati${plan.shippingKnown?' · spedizione calcolata':' · spedizione da verificare'}</small>
    </div>
    <div class="ff105-deal-money">
      ${plan.listTotal!==null&&plan.listTotal>plan.effectiveTotal?`<del>${euro(plan.listTotal)}</del>`:''}
      <strong>${euro(plan.effectiveTotal)}</strong>
      <b>${euro(plan.purchasedKg?plan.effectiveTotal/plan.purchasedKg:null)}/kg</b>
      ${save>0?`<span>Risparmi ${euro(save)}</span>`:''}
    </div>
    ${url?`<a class="ff105-open" href="${esc(url)}" target="_blank" rel="noopener">Apri offerta ↗</a>`:''}
  </article>`;
}

function renderDealPanel(data){
  const root=q('#ff10-market-results');
  if(!root||!data||!Array.isArray(data.offers))return;
  q('.ff105-deals-panel',root)?.remove();
  const targetKg=num(data?.deals?.target_kg)??num(data?.quantity)??1;
  const rows=[...data.offers].filter(o=>num(o?.final_total)!==null).sort((a,b)=>num(a.final_total)-num(b.final_total));
  if(!rows.length)return;
  const promos=rows.filter(o=>o?.ff105_promo_applied||num(o?.ff105_sale_savings)>0||normalizeTiers(o).length||o?.ff104_refill||o?.ff105_free_shipping);
  const featured=[];
  const pushUnique=o=>{if(o&&!featured.some(x=>safeUrl(x.url)===safeUrl(o.url)&&sourceKey(x)===sourceKey(o)))featured.push(o);};
  pushUnique(rows[0]);
  pushUnique(promos[0]);
  const bestSaving=[...promos].sort((a,b)=>(num(b?.ff105_total_savings)||0)-(num(a?.ff105_total_savings)||0))[0];
  pushUnique(bestSaving);
  const cards=featured.slice(0,3).map((o,i)=>dealCard(o,i+1)).join('');
  const promoCount=promos.length;
  const checked=(data.sources||[]).length;
  const active=(data.sources||[]).filter(s=>Number(s.results||0)>0).length;
  const panel=document.createElement('section');
  panel.className='ff105-deals-panel';
  panel.innerHTML=`<div class="ff105-deals-head"><div><span>Acquisto intelligente</span><h2>Migliore combinazione per ${String(targetKg).replace('.',',')} kg</h2><p>Confronta singole bobine, multipack, refill, prezzi barrati, sconti quantità e spedizione. Le promo incidono sul totale solo se rilevate come regole verificabili.</p></div><div class="ff105-deals-stats"><b>${promoCount}</b><small>offerte/promo utili</small><em>${active}/${checked} fonti attive</em></div></div><div class="ff105-deal-list">${cards}</div>`;
  const anchor=q('.ff103-overview',root);
  if(anchor)anchor.insertAdjacentElement('afterend',panel);else root.prepend(panel);
}

function decorateOfferCards(){
  const data=window.FF105_LAST_DATA;
  if(!data?.offers)return;
  for(const card of qa('.ff103-offer-card')){
    if(card.dataset.ff105==='1')continue;
    const text=normalize(card.textContent);
    const candidates=data.offers.filter(o=>text.includes(normalize(storeName(o)))&&text.includes(normalize(productName(o)).slice(0,48)));
    const offer=candidates.sort((a,b)=>(num(a.final_total)||1e9)-(num(b.final_total)||1e9))[0];
    if(!offer)continue;
    const badges=dealBadges(offer);
    if(badges){
      const body=q('.ff103-offer-body',card);
      const tags=q('.ff103-tags',card);
      const box=document.createElement('div');box.className='ff105-inline-badges';box.innerHTML=badges;
      if(tags)tags.insertAdjacentElement('afterend',box);else body?.appendChild(box);
    }
    const save=num(offer.ff105_total_savings)||0;
    if(save>0){
      const money=q('.ff103-offer-money',card);
      if(money&&!q('.ff105-saving',money))money.insertAdjacentHTML('beforeend',`<em class="ff105-saving">Risparmio ${euro(save)}</em>`);
    }
    card.dataset.ff105='1';
  }
}

function upgradeQuantityControl(){
  const select=q('#ff10-price-qty');
  if(!select)return;
  const wanted=[1,2,3,4,5,6,10,20,25,50];
  const current=num(select.value)||1;
  for(const n of wanted){
    if(![...select.options].some(o=>num(o.value)===n)){
      const option=document.createElement('option');option.value=String(n);option.textContent=`${n} kg`;select.appendChild(option);
    }
  }
  if(wanted.includes(current))select.value=String(current);
  const field=select.closest('.ff10-field');
  if(field&&!q('.ff105-qty-note',field)){
    const note=document.createElement('small');note.className='ff105-qty-note';note.textContent='Per 3/4/6/10+ kg vengono valutati anche gli sconti quantità rilevati.';field.appendChild(note);
  }
}

function wrapRenderer(){
  const original=window.FF103_RENDER_MARKETPLACE;
  if(typeof original!=='function'||original.ff105Wrapped)return false;
  const wrapped=function(data){
    window.FF105_LAST_DATA=data;
    const result=original(data);
    queueMicrotask(()=>{renderDealPanel(data);decorateOfferCards();upgradeQuantityControl();});
    return result;
  };
  wrapped.ff105Wrapped=true;
  window.FF103_RENDER_MARKETPLACE=wrapped;
  return true;
}

let observerBusy=false;
const observer=new MutationObserver(()=>{
  if(observerBusy)return;observerBusy=true;
  requestAnimationFrame(()=>{
    observerBusy=false;
    upgradeQuantityControl();wrapRenderer();
    if(window.FF105_LAST_DATA){
      if(!q('#ff10-market-results .ff105-deals-panel'))renderDealPanel(window.FF105_LAST_DATA);
      decorateOfferCards();
    }
  });
});
function init(){
  upgradeQuantityControl();wrapRenderer();
  if(document.body)observer.observe(document.body,{childList:true,subtree:true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();

window.FF105_ENRICH_CATALOG=enrichCatalog;
window.FF105_BEST_TIER_PLAN=bestTierPlan;
})();
