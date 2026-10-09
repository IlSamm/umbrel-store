(function(){
'use strict';

const VERSION='10.2.0';
window.FILAMENT_FINDER_VERSION=VERSION;

const q=(s,r=document)=>r.querySelector(s);
const qa=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const first=(obj,keys,fallback='')=>{for(const k of keys){if(obj&&obj[k]!==undefined&&obj[k]!==null&&obj[k]!=='')return obj[k];}return fallback;};
const directGlobal=(name)=>{try{return eval(name);}catch{return undefined;}};

const EXPLANATIONS={
  'Ugello':'Temperatura o requisito dell’ugello. Influenza fusione, adesione tra layer e rischio di sottoestrusione.',
  'Piano':'Temperatura del piano. Serve a far aderire il primo layer e a limitare sollevamenti e warping.',
  'Velocità':'Velocità di stampa consigliata. Più è alta, più diventano importanti portata, raffreddamento e tuning.',
  'Enclosure':'Indica se conviene stampare in ambiente chiuso per mantenere stabile la temperatura e ridurre il warping.',
  'Ventola':'Percentuale di raffreddamento del pezzo. Cambia qualità dei dettagli, ponti e adesione tra layer.',
  'Asciugatura':'Temperatura e tempo indicativi per rimuovere l’umidità assorbita prima della stampa.',
  'Sensibilità umidità':'Quanto rapidamente il materiale assorbe acqua dall’aria. Un valore alto richiede più attenzione a essiccazione e stoccaggio.',
  'Densità':'Massa del materiale a parità di volume. Incide sul peso finale del pezzo e sul costo reale per volume stampato.',
  'Facilità di stampa':'Quanto il materiale è tollerante a temperatura, adesione, raffreddamento e calibrazione non perfetti.',
  'Resistenza meccanica':'Capacità generale di sopportare carichi, urti e sollecitazioni senza rompersi o deformarsi.',
  'Resistenza al calore':'Quanto il materiale mantiene forma e proprietà quando la temperatura del pezzo aumenta.',
  'Qualità finitura':'Quanto facilmente si ottengono superfici pulite, dettagli definiti e un buon risultato estetico.'
};

const PROFILE_KEYS={
  'Facilità di stampa':['ease','printability','difficulty_score'],
  'Resistenza meccanica':['strength','mechanical','toughness','impact'],
  'Resistenza al calore':['heat','heat_resistance','temperature_resistance'],
  'Qualità finitura':['finish','surface','aesthetic']
};

const BASIC_KEYS={
  'Ugello':['nozzle','nozzle_temp','nozzleTemp','print_temp','temperature'],
  'Piano':['bed','bed_temp','bedTemp','bed_temperature'],
  'Velocità':['speed','print_speed','max_speed']
};

function rawMaterials(){
  const pools=[];
  for(const name of ['MATERIALS','FF9_MATERIALS','MATERIALS_V9','EXTENDED_MATERIALS','MATERIAL_CATALOG']){
    const v=directGlobal(name);if(Array.isArray(v))pools.push(...v);
  }
  const legacyState=directGlobal('state');
  if(Array.isArray(legacyState?.materials))pools.push(...legacyState.materials);
  const seen=new Set();
  return pools.filter(m=>{
    if(!m||typeof m!=='object')return false;
    const key=String(first(m,['name','material','title','label','id'],'')).toLowerCase();
    if(!key||seen.has(key))return false;
    seen.add(key);return true;
  });
}
function findOpenMaterial(root){
  const name=q('.ff101-title-row h2',root)?.textContent?.trim();
  if(!name)return null;
  return rawMaterials().find(m=>String(first(m,['name','material','title','label','id'],'')).trim()===name)||null;
}
function hasValue(m,keys){return !!m&&keys.some(k=>m[k]!==undefined&&m[k]!==null&&m[k]!=='');}
function badge(status){
  const label=status==='exact'?'Dato profilo':status==='estimated'?'Indicativo':'Non disponibile';
  return `<span class="ff102-confidence ff102-${status}"><i></i>${esc(label)}</span>`;
}
function explanation(label){return EXPLANATIONS[label]||'Parametro tecnico utile per capire come preparare il materiale e impostare correttamente la stampa.';}

function addLegend(root){
  const intro=q('.ff101-tech-intro',root);if(!intro||q('.ff102-data-legend',intro))return;
  intro.insertAdjacentHTML('beforeend',`<div class="ff102-data-legend" aria-label="Legenda affidabilità dati">
    <div>${badge('exact')}<small>Valore presente nel profilo tecnico del materiale.</small></div>
    <div>${badge('estimated')}<small>Linea guida ricavata dalla famiglia del materiale.</small></div>
    <div>${badge('unavailable')}<small>Il database non contiene un valore utilizzabile.</small></div>
  </div><p class="ff102-tds-note">Per una bobina specifica, il datasheet del produttore resta sempre il riferimento finale.</p>`);
}

function enhanceSetup(root){
  qa('.ff101-tech-item',root).forEach(item=>{
    if(item.dataset.ff102Ready)return;
    item.dataset.ff102Ready='1';
    const labelEl=q(':scope > span',item),valueEl=q(':scope > strong',item);
    if(!labelEl||!valueEl)return;
    const label=(labelEl.firstChild?.textContent||labelEl.textContent||'').trim();
    const wasEstimated=!!q('small',labelEl);
    q('small',labelEl)?.remove();
    const value=valueEl.textContent.trim();
    const status=value==='—'?'unavailable':wasEstimated?'estimated':'exact';
    item.classList.add(`ff102-card-${status}`);
    labelEl.insertAdjacentHTML('beforeend',badge(status));
    valueEl.insertAdjacentHTML('afterend',`<p class="ff102-explain">${esc(explanation(label))}</p>`);
  });
}

function enhanceProperties(root,m){
  qa('.ff101-advanced-metrics .ff101-score',root).forEach(card=>{
    if(card.dataset.ff102Ready)return;
    card.dataset.ff102Ready='1';
    const label=q(':scope > div:first-child span',card)?.textContent?.trim();
    if(!label)return;
    const status=hasValue(m,PROFILE_KEYS[label]||[])?'exact':'estimated';
    card.classList.add(`ff102-card-${status}`);
    const track=q('.ff101-score-track',card);
    track?.insertAdjacentHTML('afterend',`<div class="ff102-metric-meta">${badge(status)}<p>${esc(explanation(label))}</p></div>`);
  });
}

function enhanceBasicParameters(root,m){
  qa('.ff101-print-strip > div',root).forEach(card=>{
    if(card.dataset.ff102Ready)return;
    card.dataset.ff102Ready='1';
    const label=q('span',card)?.textContent?.trim();
    const value=q('strong',card)?.textContent?.trim()||'—';
    if(!label)return;
    const status=value==='—'?'unavailable':hasValue(m,BASIC_KEYS[label]||[])?'exact':'estimated';
    card.classList.add(`ff102-card-${status}`);
    card.insertAdjacentHTML('beforeend',`<div class="ff102-basic-meta">${badge(status)}<p>${esc(explanation(label))}</p></div>`);
  });
}

function enhanceMaterialSheet(root){
  if(!root||root.dataset.ff102Enriched)return;
  root.dataset.ff102Enriched='1';
  const m=findOpenMaterial(root);
  addLegend(root);
  enhanceSetup(root);
  enhanceProperties(root,m);
  enhanceBasicParameters(root,m);
}

function patchVersion(){
  window.FILAMENT_FINDER_VERSION=VERSION;
  qa('#ff10-view-settings h2').forEach(el=>{
    if(/Versione 10\.[01]\.0/.test(el.textContent))el.textContent='Versione 10.2.0';
  });
}

function scan(){
  patchVersion();
  const root=q('.ff101-material-sheet');
  if(root)enhanceMaterialSheet(root);
}

function init(){
  patchVersion();scan();
  const target=q('#ff10-app')||document.body;
  const observer=new MutationObserver(()=>scan());
  observer.observe(target,{childList:true,subtree:true});
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
