(function(){
'use strict';

const VERSION='10.4.0';
window.FF104_PRICE_QUALITY_VERSION=VERSION;

const nativeFetch=window.fetch.bind(window);
const num=v=>{
  if(v===null||v===undefined||v==='')return null;
  const n=Number(String(v).replace(',','.').replace(/[^0-9.+-]/g,''));
  return Number.isFinite(n)?n:null;
};
const cleanText=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[×]/g,'x').replace(/[_/]+/g,' ').replace(/\s+/g,' ').trim();
const upper=v=>cleanText(v).toUpperCase();
const round=(v,d=2)=>{const p=10**d;return Math.round(v*p)/p;};

const FAMILY_TESTS=[
  ['PAHT',/\bPAHT\b|HIGH[ -]?TEMP(?:ERATURE)?\s+NYLON/],
  ['PA12',/\bPA12\b/],['PA6',/\bPA6\b/],['PPA',/\bPPA\b/],['PPS',/\bPPS\b/],
  ['PETG',/\bPETG\b/],['PCTG',/\bPCTG\b/],['PLA',/\bPLA\b/],['ABS',/\bABS\b/],['ASA',/\bASA\b/],
  ['TPU',/\bTPU\b/],['TPE',/\bTPE\b/],['HIPS',/\bHIPS\b/],['PVA',/\bPVA\b/],
  ['PEEK',/\bPEEK\b/],['PEI',/\bPEI\b/],['PC',/\bPC\b|POLYCARBONATE|POLICARBONATO/],
  ['PET',/\bPET\b/],['PP',/\bPP\b|POLYPROPYLENE|POLIPROPILENE/],
  ['PA',/\bNYLON\b|\bPOLYAMIDE\b|\bPOLIAMMIDE\b|\bPA\b/]
];
const FAMILY_RX=new RegExp(FAMILY_TESTS.map(([,r])=>r.source).join('|'),'i');

const MODS={
  basic:/\bBASIC\b|\bSTANDARD\b/,
  matte:/\bMATTE\b|\bMATT\b|\bOPACO\b/,
  silk:/\bSILK\b|\bSETA\b/,
  plus:/\bPLUS\b|\bPRO\b|PLA\s*\+/,
  cf:/\bCF\b|CARBON[ -]?FIB(?:ER|RE)|FIBRA\s+DI\s+CARBONIO/,
  gf:/\bGF\b|GLASS[ -]?FIB(?:ER|RE)|FIBRA\s+DI\s+VETRO/,
  wood:/\bWOOD\b|\bLEGNO\b/,
  marble:/\bMARBLE\b|\bMARMO\b/,
  metal:/\bMETAL(?:LIC)?\b|\bMETALLO\b/,
  glow:/\bGLOW\b|GLOW[ -]?IN[ -]?THE[ -]?DARK|FOSFORESC/,
  galaxy:/\bGALAXY\b/,
  sparkle:/\bSPARKLE\b|GLITTER/,
  aero:/\bAERO\b|LIGHT[ -]?WEIGHT|\bLW\b/,
  translucent:/\bTRANSLUCENT\b|\bTRANSPARENT\b|\bTRASPARENT/,
  highspeed:/\bHF\b|HIGH[ -]?SPEED|RAPID(?:O)?/,
  support:/\bSUPPORT\b|SUPPORTO/,
  esd:/\bESD\b/,
  flame:/\bFR\b|FLAME[ -]?RETARD|AUTOESTINGUENTE/
};
const EXCLUSIVE_MODS=['basic','matte','silk','plus','cf','gf','wood','marble','metal','glow','galaxy','sparkle','aero','translucent','highspeed','support','esd','flame'];

const ACCESSORY_RX=/\b(?:NOZZLE|UGELLO|HOTEND|BUILD\s*PLATE|PIATTO\s+DI\s+STAMPA|DRYER|DRY\s*BOX|ESSICCATORE|SPOOL\s*HOLDER|PORTA\s*BOBINA|EMPTY\s*SPOOL|BOBINA\s+VUOTA|FILAMENT\s+SENSOR|SENSORE\s+FILAMENTO|PTFE\s*TUBE|TUBO\s*PTFE|EXTRUDER|GEAR|INGRANAGGIO|ADAPTER|ADATTATORE|DESICCANT|SILICA\s*GEL|VACUUM\s+BAG|SACCHETT[OI]\s+SOTTOVUOTO|GLUE\s*STICK|COLLA\s+PER\s+PIATTO|PURGE\s+WIPER|CUTTER\s+BLADE)\b/i;
const SAMPLE_RX=/\b(?:SAMPLE|CAMPIONE|TESTER|SWATCH)\b/i;
const REFILL_RX=/\b(?:REFILL|RICARICA|SENZA\s+BOBINA|WITHOUT\s+SPOOL)\b/i;

function familyOf(value){
  const text=upper(value);
  for(const [name,rx] of FAMILY_TESTS)if(rx.test(text))return name;
  return '';
}
function modsOf(value){
  const text=upper(value),set=new Set();
  for(const [name,rx] of Object.entries(MODS))if(rx.test(text))set.add(name);
  return set;
}
function offerText(o){
  return cleanText([o?.product,o?.title,o?.name,o?.variant,o?.brand,o?.color,o?.format,o?.size,o?.note].filter(Boolean).join(' '));
}
function offerPrice(o){return num(o?.price)??num(o?.product_price)??num(o?.amount);}
function originalTotal(o){return num(o?.final_total)??num(o?.delivered_total)??num(o?.total)??offerPrice(o);}
function sourceKey(o){return String(o?.source_id||o?.store||o?.source_name||'altro');}
function safeUrl(v){try{const u=new URL(String(v||''),location.href);if(/^https?:$/.test(u.protocol)){u.hash='';return u.href;}}catch{}return '';}

function parseWeight(o,text){
  const t=cleanText(text);
  let packCount=1,eachKg=null,totalKg=null,explicit=false;
  const multi=t.match(/\b(\d{1,2})\s*x\s*(\d+(?:[.,]\d+)?)\s*(kg|g)\b/i);
  if(multi){
    packCount=Math.max(1,Number(multi[1]));
    const raw=Number(multi[2].replace(',','.'));
    eachKg=multi[3].toLowerCase()==='g'?raw/1000:raw;
    totalKg=eachKg*packCount;explicit=true;
  }
  if(!multi){
    const pack=t.match(/(?:\bPACK\s*(?:OF|DA)?\s*(\d{1,2})\b|\bCONFEZIONE\s*(?:DA)?\s*(\d{1,2})\b|\b(\d{1,2})\s*(?:PACK|BOBINE|SPOOLS?|ROLLS?|ROTOLI)\b)/i);
    if(pack)packCount=Math.max(1,Number(pack[1]||pack[2]||pack[3]||1));
    const masses=[...t.matchAll(/\b(\d+(?:[.,]\d+)?)\s*(kg|g)\b/ig)].map(m=>{
      const raw=Number(m[1].replace(',','.'));return m[2].toLowerCase()==='g'?raw/1000:raw;
    }).filter(v=>v>=0.05&&v<=25);
    if(masses.length){
      eachKg=masses.find(v=>v<=3)??masses[0];
      totalKg=packCount>1&&eachKg<=3?eachKg*packCount:eachKg;
      explicit=true;
    }
  }
  const directKg=num(o?.weight_kg);
  const directG=num(o?.weight_g);
  if(!explicit&&directKg!==null&&directKg>=0.05&&directKg<=25){totalKg=directKg;eachKg=packCount>1?directKg/packCount:directKg;explicit=true;}
  if(!explicit&&directG!==null&&directG>=50&&directG<=25000){totalKg=directG/1000;eachKg=packCount>1?totalKg/packCount:totalKg;explicit=true;}
  const fieldText=cleanText([o?.size,o?.format,o?.variant].filter(Boolean).join(' '));
  if(!explicit&&fieldText&&fieldText!==t){
    const m=fieldText.match(/\b(\d+(?:[.,]\d+)?)\s*(kg|g)\b/i);
    if(m){const raw=Number(m[1].replace(',','.'));eachKg=m[2].toLowerCase()==='g'?raw/1000:raw;if(eachKg>=0.05&&eachKg<=25){totalKg=eachKg;explicit=true;}}
  }
  if(totalKg!==null&&(totalKg<0.05||totalKg>50)){totalKg=null;eachKg=null;explicit=false;}
  return {packCount,eachKg,totalKg,explicit};
}

function materialMatch(target,text){
  const targetFamily=familyOf(target),candidateFamily=familyOf(text);
  const targetMods=modsOf(target),candidateMods=modsOf(text);
  if(ACCESSORY_RX.test(upper(text)))return {ok:false,score:0,reason:'accessorio'};
  if(targetFamily&&candidateFamily&&targetFamily!==candidateFamily)return {ok:false,score:0,reason:'materiale diverso'};
  if(targetFamily&&!candidateFamily&&FAMILY_RX.test(upper(text)))return {ok:false,score:0,reason:'materiale ambiguo'};
  if(targetMods.size){
    const conflicts=[...candidateMods].filter(x=>EXCLUSIVE_MODS.includes(x)&&!targetMods.has(x));
    if(conflicts.length)return {ok:false,score:0,reason:'variante diversa'};
  }
  let score=18;
  if(targetFamily&&candidateFamily===targetFamily)score+=48;
  else if(targetFamily&&!candidateFamily)score+=14;
  const targetUpper=upper(target);
  if(targetUpper&&upper(text).includes(targetUpper))score+=14;
  for(const wanted of targetMods){if(candidateMods.has(wanted))score+=9;else score-=7;}
  if(REFILL_RX.test(upper(text)))score-=2;
  return {ok:score>=28,score,reason:score>=28?'':'poco pertinente'};
}

function inferShipping(o,unitPrice,backendQty){
  const explicit=num(o?.shipping_cost)??num(o?.shipping)??num(o?.delivery_cost);
  if(explicit!==null&&explicit>=0&&explicit<300)return {value:explicit,known:true};
  const total=originalTotal(o);
  if(total!==null&&unitPrice!==null&&backendQty>0){
    const inferred=round(total-unitPrice*backendQty,2);
    if(inferred>=0&&inferred<150)return {value:inferred,known:o?.shipping_known===true||inferred>0.001};
  }
  return {value:0,known:false};
}

function sanitizeOffer(o,target,targetKg,backendQty){
  if(!o||o.available===false)return {keep:false,reason:'non disponibile'};
  const text=offerText(o),match=materialMatch(target,text);
  if(!match.ok)return {keep:false,reason:match.reason};
  const unitPrice=offerPrice(o);
  if(unitPrice===null||unitPrice<=0.5||unitPrice>5000)return {keep:false,reason:'prezzo non valido'};
  const weight=parseWeight(o,text);
  if(SAMPLE_RX.test(upper(text))&&(weight.totalKg===null||weight.totalKg<0.45))return {keep:false,reason:'campione'};

  let assumedWeight=false;
  if(weight.totalKg===null){
    // Most consumer filament listings are 1 kg. Keep unknown-weight rows only as
    // lower-confidence fallbacks instead of letting them beat measured products.
    weight.totalKg=1;weight.eachKg=1;weight.packCount=Math.max(1,weight.packCount||1);assumedWeight=true;
  }
  if(weight.totalKg<0.1||weight.totalKg>25)return {keep:false,reason:'peso non plausibile'};

  const packages=Math.max(1,Math.ceil(targetKg/weight.totalKg-1e-9));
  const purchasedKg=round(packages*weight.totalKg,3);
  const ship=inferShipping(o,unitPrice,backendQty);
  let finalTotal=round(unitPrice*packages+(ship.known?ship.value:0),2);
  if(!ship.known&&packages===backendQty){
    const old=originalTotal(o);
    if(old!==null&&old>=unitPrice*packages&&old<unitPrice*packages+150)finalTotal=round(old,2);
  }
  const finalPerKg=purchasedKg>0?round(finalTotal/purchasedKg,2):null;
  const rawPerKg=purchasedKg>0?round((unitPrice*packages)/purchasedKg,2):null;
  if(finalPerKg!==null&&finalPerKg<3)return {keep:false,reason:'€/kg sospetto'};

  let score=match.score;
  if(!assumedWeight)score+=18;else score-=12;
  const overshoot=purchasedKg-targetKg;
  if(overshoot<=0.05)score+=12;else if(overshoot<=0.5)score+=6;else score-=Math.min(16,Math.round(overshoot*4));
  if(ship.known)score+=4;
  if(o?.source_kind==='official')score+=2;
  score=Math.max(0,Math.min(100,score));

  const copy={...o};
  copy.weight_kg=round(weight.totalKg,3);
  copy.final_total=finalTotal;
  copy.final_perkg=finalPerKg;
  if(num(copy.perkg)===null&&rawPerKg!==null)copy.perkg=rawPerKg;
  copy.match_score=score;
  copy.ff104_weight_assumed=assumedWeight;
  copy.ff104_packages=packages;
  copy.ff104_purchased_kg=purchasedKg;
  copy.ff104_target_kg=targetKg;
  copy.ff104_refill=REFILL_RX.test(upper(text));
  const purchaseTag=packages>1?`${packages} confezioni`:'';
  const weightTag=purchasedKg!==targetKg?`${purchasedKg} kg acquistati`:'';
  const refillTag=copy.ff104_refill?'Refill':'';
  copy.format=[copy.format,purchaseTag,weightTag,refillTag].filter(Boolean).join(' · ');
  if(assumedWeight)copy.size=[copy.size,'peso stimato 1 kg'].filter(Boolean).join(' · ');
  if(ship.known){copy.shipping_cost=ship.value;copy.shipping_known=true;}
  return {keep:true,offer:copy,score};
}

function canonicalOfferKey(o){
  const url=safeUrl(o?.url);
  if(url){
    try{
      const u=new URL(url);u.hash='';
      // Tracking parameters must not make the same offer look unique.
      for(const key of [...u.searchParams.keys()])if(/^utm_|^(?:fbclid|gclid|ref|source)$/i.test(key))u.searchParams.delete(key);
      return `${sourceKey(o)}|${u.origin}${u.pathname}|${u.searchParams.get('variant')||''}|${upper(o?.color||'')}|${num(o?.weight_kg)||''}`;
    }catch{}
  }
  return [sourceKey(o),upper(o?.brand),upper(o?.product||o?.title||o?.name),upper(o?.variant),upper(o?.color),num(o?.weight_kg),offerPrice(o)].join('|');
}

function cleanCatalog(data,context){
  if(!data||!Array.isArray(data.offers))return data;
  const target=cleanText(context.material||data.material||'');
  const targetKg=Math.max(0.25,num(context.qty)||1);
  const backendQty=Math.max(1,Math.round(num(context.qty)||1));
  const reasons={},kept=[];
  for(const raw of data.offers){
    const r=sanitizeOffer(raw,target,targetKg,backendQty);
    if(!r.keep){reasons[r.reason]=(reasons[r.reason]||0)+1;continue;}
    kept.push(r.offer);
  }
  const byKey=new Map();
  for(const o of kept){
    const key=canonicalOfferKey(o),prev=byKey.get(key);
    if(!prev||num(o.match_score)>num(prev.match_score)||(num(o.match_score)===num(prev.match_score)&&originalTotal(o)<originalTotal(prev)))byKey.set(key,o);
  }
  const offers=[...byKey.values()].sort((a,b)=>(num(b.match_score)||0)-(num(a.match_score)||0)||(originalTotal(a)??1e9)-(originalTotal(b)??1e9));
  const counts=new Map();
  for(const o of offers)counts.set(sourceKey(o),(counts.get(sourceKey(o))||0)+1);
  const sources=Array.isArray(data.sources)?data.sources.map(s=>({...s,raw_results:Number(s?.results||0),results:counts.get(String(s?.id||''))||0})):[];
  return {...data,offers,sources,quality:{version:VERSION,target_material:target,target_kg:targetKg,raw_offers:data.offers.length,relevant_offers:offers.length,excluded:data.offers.length-offers.length,reasons}};
}

function contextFromRequest(input){
  try{
    const raw=typeof input==='string'?input:String(input?.url||'');
    const u=new URL(raw,location.href);
    if(!/\/api\/(?:catalog|prices)$/.test(u.pathname))return null;
    return {material:u.searchParams.get('material')||'',qty:u.searchParams.get('qty')||'1'};
  }catch{return null;}
}

window.fetch=async function(input,init){
  const context=contextFromRequest(input);
  const response=await nativeFetch(input,init);
  if(!context||!response.ok)return response;
  try{
    const data=await response.clone().json();
    const cleaned=cleanCatalog(data,context);
    window.FF104_PRICE_QUALITY_LAST=cleaned?.quality||null;
    const headers=new Headers(response.headers);
    headers.delete('content-length');headers.delete('content-encoding');headers.delete('transfer-encoding');
    headers.set('content-type','application/json; charset=utf-8');
    return new Response(JSON.stringify(cleaned),{status:response.status,statusText:response.statusText,headers});
  }catch(err){
    console.warn('FF104 price quality:',err);
    return response;
  }
};

function relabelQuantity(){
  const select=document.querySelector('#ff10-price-qty');
  if(!select)return;
  const field=select.closest('.ff10-field');
  const label=field?.querySelector('label');
  if(label)label.textContent='Quantità di materiale';
  for(const option of select.options){
    const n=num(option.value);if(n!==null)option.textContent=`${String(n).replace('.',',')} kg`;
  }
  if(field&&!field.querySelector('.ff104-qty-help')){
    const help=document.createElement('small');help.className='ff104-qty-help';help.textContent='Confronto normalizzato sul peso reale delle confezioni';
    help.style.display='block';help.style.marginTop='6px';help.style.opacity='.66';help.style.fontSize='11px';
    field.appendChild(help);
  }
}
function decorateQuality(){
  const quality=window.FF104_PRICE_QUALITY_LAST;
  const p=document.querySelector('#ff10-market-results .ff103-overview p');
  if(!quality||!p||p.dataset.ff104)return;
  p.dataset.ff104='1';
  const excluded=Number(quality.excluded||0);
  p.textContent=`Confronto normalizzato per ${quality.target_kg} kg, prezzo reale e peso confezione.${excluded?` ${excluded} risultati non confrontabili esclusi.`:''}`;
}

const observer=new MutationObserver(()=>{relabelQuantity();decorateQuality();});
function init(){
  relabelQuantity();decorateQuality();
  if(document.body)observer.observe(document.body,{childList:true,subtree:true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();

window.FF104_CLEAN_CATALOG=cleanCatalog;
})();
