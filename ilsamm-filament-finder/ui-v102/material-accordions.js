(function(){
'use strict';

const VERSION='10.2.0';
window.FILAMENT_FINDER_VERSION=VERSION;

const q=(s,r=document)=>r.querySelector(s);
const qa=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function cleanLabel(el){
  if(!el)return'';
  const clone=el.cloneNode(true);
  clone.querySelectorAll('small').forEach(x=>x.remove());
  return (clone.textContent||'').trim();
}
function pairFrom(el){
  if(!el)return null;
  const label=cleanLabel(el.querySelector(':scope > span'));
  const value=(el.querySelector(':scope > strong')?.textContent||'—').trim();
  const estimated=!!el.querySelector(':scope > span small');
  return {label,value,estimated};
}
function collectTech(sheet){
  const map=new Map();
  qa('#ff101-technical .ff101-tech-item',sheet).forEach(el=>{
    const item=pairFrom(el);if(item?.label)map.set(item.label.toLowerCase(),item);
  });
  return map;
}
function collectPrint(sheet){
  const map=new Map();
  qa('#ff101-basic .ff101-print-strip > div',sheet).forEach(el=>{
    const label=(el.querySelector('span')?.textContent||'').trim();
    const value=(el.querySelector('strong')?.textContent||'—').trim();
    if(label)map.set(label.toLowerCase(),{label,value,estimated:false});
  });
  return map;
}
function get(map,label,fallback='—'){
  return map.get(label.toLowerCase())||{label,value:fallback,estimated:true};
}
function technicalCard(item,label=item.label){
  return `<div class="ff102-tech-card"><span>${esc(label)}${item.estimated?'<small>indicativo</small>':''}</span><strong>${esc(item.value)}</strong></div>`;
}
function keyFact(label,value,accent=false){
  return `<div class="ff102-keyfact${accent?' is-accent':''}"><span>${esc(label)}</span><strong>${esc(value||'—')}</strong></div>`;
}
function accordion(id,title,summary,body,open=false){
  return `<details class="ff102-accordion" data-ff102-section="${esc(id)}"${open?' open':''}>
    <summary><span><b>${esc(title)}</b><small>${esc(summary)}</small></span><i aria-hidden="true"></i></summary>
    <div class="ff102-accordion-body">${body}</div>
  </details>`;
}
function storageGuidance(moisture){
  const s=String(moisture||'').toLowerCase();
  if(/molto alta|alta/.test(s))return 'Contenitore sigillato con essiccante; asciuga prima della stampa quando necessario.';
  if(/media/.test(s))return 'Conserva chiuso con essiccante e limita l’esposizione prolungata all’aria.';
  return 'Conserva chiuso e asciutto; usa essiccante per mantenere costante la qualità.';
}
function prepareMaterialSheet(sheet){
  if(!sheet||sheet.dataset.ff102Organized==='1')return;
  const technical=q('#ff101-technical',sheet);
  if(!technical)return;

  const print=collectPrint(sheet);
  const tech=collectTech(sheet);
  const nozzleTemp=get(print,'Ugello');
  const bedTemp=get(print,'Piano');
  const speed=get(print,'Velocità');
  const enclosure=get(tech,'Enclosure');
  const fan=get(tech,'Ventola');
  const drying=get(tech,'Asciugatura');
  const moisture=get(tech,'Sensibilità umidità');
  const nozzleHardware=get(tech,'Ugello');
  const density=get(tech,'Densità');

  const compat=q('.ff101-compat',sheet);
  const printer=(compat?.querySelector('span')?.textContent||'Stampante attiva').trim();
  const compatLabel=(compat?.querySelector('strong')?.textContent||'Compatibilità da verificare').trim();
  const compatNote=(compat?.querySelector('p')?.textContent||'Verifica il profilo della bobina specifica prima della stampa.').trim();

  const metrics=q('.ff101-advanced-metrics',technical)?.outerHTML||'';
  const advice=q('.ff101-advice-grid',technical)?.outerHTML||'';
  const problems=q('.ff101-problems',technical);
  const problemItems=problems?qa('li',problems).map(li=>(li.textContent||'').trim()).filter(Boolean):[];
  const problemBody=problemItems.length
    ? `<ul class="ff102-problem-list">${problemItems.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`
    : '<p class="ff102-copy">Controlla prima umidità del filamento, temperature, velocità e adesione al piano.</p>';

  const intro=`<div class="ff102-tech-intro"><div><span>Scheda tecnica</span><h3>Dati ordinati, senza sovraccarico.</h3></div><p>I dati marcati come <b>indicativi</b> sono linee guida della famiglia del materiale. Per la bobina specifica prevale sempre il profilo del produttore.</p></div>`;

  const keyFacts=`<div class="ff102-keyfacts" aria-label="Dati tecnici principali">
    ${keyFact('Ugello',nozzleTemp.value,true)}
    ${keyFact('Piano',bedTemp.value)}
    ${keyFact('Asciugatura',drying.value)}
    ${keyFact('Compatibilità',compatLabel)}
  </div>`;

  const printBody=`<div class="ff102-tech-grid">
    ${technicalCard(nozzleTemp,'Temperatura ugello')}
    ${technicalCard(bedTemp,'Temperatura piano')}
    ${technicalCard(speed,'Velocità')}
    ${technicalCard(fan,'Ventola')}
    ${technicalCard(enclosure,'Enclosure')}
    ${technicalCard(nozzleHardware,'Tipo ugello')}
  </div>`;

  const dryingBody=`<div class="ff102-tech-grid">
    ${technicalCard(drying,'Ciclo di asciugatura')}
    ${technicalCard(moisture,'Sensibilità umidità')}
    ${technicalCard({value:storageGuidance(moisture.value),estimated:true},'Conservazione')}
  </div>`;

  const compatibilityBody=`<div class="ff102-compat-detail">
      <div class="ff102-compat-head"><span>Stampante attiva</span><strong>${esc(printer)}</strong></div>
      <div class="ff102-compat-state"><b>${esc(compatLabel)}</b><p>${esc(compatNote)}</p></div>
      <div class="ff102-tech-grid compact">${technicalCard(nozzleHardware,'Ugello richiesto')}${technicalCard(enclosure,'Ambiente di stampa')}</div>
    </div>`;

  const propertiesBody=`${metrics}<div class="ff102-tech-grid single">${technicalCard(density,'Densità')}</div>${advice}`;

  technical.innerHTML=`${intro}${keyFacts}<div class="ff102-accordion-list">
    ${accordion('stampa','Stampa',`Ugello ${nozzleTemp.value} · Piano ${bedTemp.value}`,printBody,true)}
    ${accordion('asciugatura','Asciugatura',`${drying.value} · Umidità ${moisture.value}`,dryingBody)}
    ${accordion('compatibilita','Compatibilità',`${printer} · ${compatLabel}`,compatibilityBody)}
    ${accordion('proprieta','Proprietà',`Densità ${density.value} · profilo meccanico`,propertiesBody)}
    ${accordion('problemi','Problemi comuni',problemItems.slice(0,2).join(' · ')||'Controlli rapidi di stampa',problemBody)}
  </div>`;

  sheet.dataset.ff102Organized='1';
}
function patchVersionText(){
  qa('#ff10-view-settings h2').forEach(el=>{
    if(/^Versione\s+10\./.test(el.textContent.trim()))el.textContent='Versione 10.2.0';
  });
}
function patchAll(){
  qa('.ff101-material-sheet').forEach(prepareMaterialSheet);
  patchVersionText();
  window.FILAMENT_FINDER_VERSION=VERSION;
}
function init(){
  patchAll();
  const target=q('#ff10-app')||document.body;
  const observer=new MutationObserver(()=>patchAll());
  observer.observe(target,{childList:true,subtree:true});
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
