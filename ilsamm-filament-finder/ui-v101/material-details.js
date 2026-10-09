(function(){
'use strict';

const VERSION='10.1.0';
window.FILAMENT_FINDER_VERSION=VERSION;

const q=(s,r=document)=>r.querySelector(s);
const qa=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const first=(obj,keys,fallback='')=>{for(const k of keys){if(obj&&obj[k]!==undefined&&obj[k]!==null&&obj[k]!=='')return obj[k];}return fallback;};
const compact=(arr)=>arr.filter(Boolean);
const directGlobal=(name)=>{try{return eval(name);}catch{return undefined;}};
const clamp=(n,a=0,b=100)=>Math.max(a,Math.min(b,Number(n)||0));

function matName(m){return String(first(m,['name','material','title','label','id'],'Materiale'));}
function matFamily(m){return String(first(m,['family','category','base','type'],matName(m).split(/[ +\-/]/)[0]||'Materiale'));}
function matDesc(m){return String(first(m,['summary','description','desc','short','note'],'Profilo tecnico per stampa 3D.'));}
function familyKey(m){return (matName(m)+' '+matFamily(m)).toUpperCase();}

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
    const key=matName(m).toLowerCase();
    if(!key||seen.has(key))return false;
    seen.add(key);return true;
  });
}

function accentFor(m){
  const s=familyKey(m);
  if(/TPU|TPE|FLEX/.test(s))return '#ad8cff';
  if(/ASA|ABS/.test(s))return '#ffad63';
  if(/NYLON|\bPA\b|PEEK|PEKK/.test(s))return '#ff7c84';
  if(/PC|POLYCARB/.test(s))return '#ffd36a';
  if(/PETG|PCTG/.test(s))return '#73e4b1';
  if(/PLA/.test(s))return '#7eb3ff';
  if(/PVA|HIPS|SUPPORT/.test(s))return '#a4ada7';
  if(/CF|CARBON|GF|GLASS/.test(s))return '#b9c0ba';
  return '#76e48c';
}

function baseProfile(m){
  const s=familyKey(m);let p={ease:66,strength:66,heat:60,finish:72};
  if(/PLA/.test(s))p={ease:94,strength:58,heat:34,finish:91};
  if(/PLA\+|TOUGH/.test(s))p={ease:88,strength:72,heat:40,finish:88};
  if(/PETG/.test(s))p={ease:81,strength:74,heat:58,finish:80};
  if(/PCTG/.test(s))p={ease:72,strength:82,heat:66,finish:80};
  if(/ASA/.test(s))p={ease:54,strength:78,heat:80,finish:77};
  if(/ABS/.test(s))p={ease:52,strength:76,heat:74,finish:74};
  if(/TPU|TPE|FLEX/.test(s))p={ease:45,strength:86,heat:55,finish:72};
  if(/NYLON|\bPA\b/.test(s))p={ease:38,strength:92,heat:84,finish:69};
  if(/\bPC\b|POLYCARB/.test(s))p={ease:33,strength:92,heat:93,finish:74};
  if(/PEEK|PEKK|ULTEM|PEI/.test(s))p={ease:12,strength:97,heat:99,finish:67};
  if(/PVA|SUPPORT/.test(s))p={ease:45,strength:20,heat:25,finish:55};
  if(/SILK/.test(s))p.finish=98;
  if(/CF|CARBON|GF|GLASS/.test(s)){p.strength=Math.max(p.strength,91);p.heat=Math.max(p.heat,78);p.ease=Math.min(p.ease,52);}
  return p;
}
function scoreValue(v,fallback){
  if(v===undefined||v===null||v==='')return fallback;
  if(typeof v==='number')return clamp(v<=10?v*10:v);
  const s=String(v).toLowerCase();
  if(/molto alta|excellent|eccellente|estrema/.test(s))return 95;
  if(/alta|high|ottima/.test(s))return 82;
  if(/media|medium|buona/.test(s))return 62;
  if(/bassa|low|scarsa/.test(s))return 35;
  const n=parseFloat(s.replace(',','.'));return Number.isFinite(n)?clamp(n<=10?n*10:n):fallback;
}
function profile(m){
  const p=baseProfile(m);
  p.ease=scoreValue(first(m,['ease','printability','difficulty_score']),p.ease);
  p.strength=scoreValue(first(m,['strength','mechanical','toughness','impact']),p.strength);
  p.heat=scoreValue(first(m,['heat','heat_resistance','temperature_resistance']),p.heat);
  p.finish=scoreValue(first(m,['finish','surface','aesthetic']),p.finish);
  return p;
}
function rating(v){return v>=88?'Eccellente':v>=74?'Alta':v>=58?'Buona':v>=42?'Media':'Bassa';}
function tempText(m,type){
  const keys=type==='bed'?['bed','bed_temp','bedTemp','bed_temperature']:['nozzle','nozzle_temp','nozzleTemp','print_temp','temperature'];
  let v=first(m,keys,'—');if(Array.isArray(v))v=v.join('–');v=String(v);
  if(v!=='—'&&!/[°C]/i.test(v)&&/\d/.test(v))v+='°';return v;
}
function speedText(m){return String(first(m,['speed','print_speed','max_speed'],'—'));}
function densityText(m){const v=first(m,['density','specific_gravity'],'—');return String(v)==='—'?'—':String(v).includes('g/')?String(v):`${v} g/cm³`;}
function tags(m){
  let v=first(m,['uses','use_cases','applications','ideal_for','tags'],[]);
  if(typeof v==='string')v=v.split(/[,;|]/).map(x=>x.trim()).filter(Boolean);
  if(Array.isArray(v)&&v.length)return v.slice(0,8);
  const s=familyKey(m);
  if(/PLA/.test(s))return ['Statuine','Prototipi','Decorazione'];
  if(/PETG|PCTG/.test(s))return ['Pezzi funzionali','Contenitori','Uso quotidiano'];
  if(/ASA/.test(s))return ['Outdoor','Automotive','UV'];
  if(/ABS/.test(s))return ['Funzionale','Involucri','Post-processing'];
  if(/TPU|TPE/.test(s))return ['Flessibile','Cover','Paracolpi'];
  if(/NYLON|\bPA\b/.test(s))return ['Meccanica','Ingranaggi','Carichi'];
  if(/PC/.test(s))return ['Meccanica','Calore','Parti resistenti'];
  return ['Tecnico','Funzionale'];
}
function normalizeValue(v){
  if(Array.isArray(v))return v.join(' · ');
  if(typeof v==='boolean')return v?'Sì':'No';
  if(v&&typeof v==='object')return String(first(v,['value','label','name'],'—'));
  return String(v??'—');
}
function exactField(m,keys){
  const value=first(m,keys,null);return value===null?null:{value:normalizeValue(value),estimated:false};
}
function estimated(value){return {value,estimated:true};}

function inferredSetup(m){
  const s=familyKey(m);
  const abrasive=/CF|CARBON|GF|GLASS|GLOW|METAL/.test(s);
  const wood=/WOOD/.test(s);
  let enclosure='Non necessaria',fan='60–100%',drying='45–55 °C · 4–6 h',moisture='Bassa',nozzle='Standard';
  if(/PETG|PCTG/.test(s)){fan='20–50%';drying='55–65 °C · 4–6 h';moisture='Media';}
  if(/ASA|ABS/.test(s)){enclosure='Consigliata';fan='0–30%';drying='65–75 °C · 4–6 h';moisture='Media';}
  if(/TPU|TPE|FLEX/.test(s)){fan='30–60%';drying='45–55 °C · 4–6 h';moisture='Alta';nozzle='Percorso filamento regolare';}
  if(/NYLON|\bPA\b/.test(s)){enclosure='Consigliata';fan='0–20%';drying='70–90 °C · 6–12 h';moisture='Molto alta';}
  if(/\bPC\b|POLYCARB/.test(s)){enclosure='Consigliata';fan='0–20%';drying='70–90 °C · 6–8 h';moisture='Alta';}
  if(/PEEK|PEKK|ULTEM|PEI/.test(s)){enclosure='Camera calda / macchina dedicata';fan='0%';drying='120–150 °C · secondo produttore';moisture='Alta';nozzle='Setup high-temperature dedicato';}
  if(/PVA|SUPPORT/.test(s)){fan='50–100%';drying='45–55 °C · 6–10 h';moisture='Molto alta';}
  if(abrasive)nozzle='Ugello resistente all’abrasione consigliato';
  if(wood)nozzle='Ugello ≥ 0,6 mm consigliato';
  return {enclosure,fan,drying,moisture,nozzle};
}
function setupFields(m){
  const inf=inferredSetup(m);
  return [
    ['Enclosure',exactField(m,['enclosure','chamber','closed_chamber'])||estimated(inf.enclosure)],
    ['Ventola',exactField(m,['fan','cooling','part_cooling','fan_speed'])||estimated(inf.fan)],
    ['Asciugatura',exactField(m,['drying','drying_temp','dry_temp','dry_temperature','drying_temperature'])||estimated(inf.drying)],
    ['Sensibilità umidità',exactField(m,['moisture','hygroscopic','humidity_sensitivity'])||estimated(inf.moisture)],
    ['Ugello',exactField(m,['nozzle_requirement','nozzle_type','hardened_nozzle'])||estimated(inf.nozzle)],
    ['Densità',exactField(m,['density','specific_gravity'])||{value:densityText(m),estimated:densityText(m)==='—'}],
  ];
}
function advice(m){
  const s=familyKey(m),good=[],avoid=[],issues=[];
  if(/PLA/.test(s)){good.push('qualità estetica e dettagli','stampe semplici e veloci');avoid.push('parti lasciate in forte calore','impieghi strutturali pesanti');issues.push('heat creep o deformazione se l’ambiente è troppo caldo','stringing se il filamento è umido o la retrazione non è regolata');}
  if(/PETG|PCTG/.test(s)){good.push('pezzi funzionali e resistenti','uso quotidiano e contenitori');avoid.push('superfici dove serve estrema rigidità','ponti molto puliti senza tuning');issues.push('stringing e fili sottili','adesione eccessiva su alcuni piatti');}
  if(/ASA/.test(s)){good.push('esterno, UV e automotive','pezzi funzionali resistenti al calore');avoid.push('stampa senza gestione di correnti d’aria','ambienti poco ventilati');issues.push('warping e distacco degli angoli','ritiro dimensionale sui pezzi grandi');}
  if(/ABS/.test(s)){good.push('involucri e parti funzionali','post-processing');avoid.push('pezzi grandi senza enclosure','ambienti poco ventilati');issues.push('warping','delaminazione tra layer se la camera è fredda');}
  if(/TPU|TPE|FLEX/.test(s)){good.push('cover, paracolpi e guarnizioni','parti elastiche');avoid.push('stampe molto veloci','percorsi filamento con molto attrito');issues.push('sottoestrusione se la velocità è alta','filamento che si piega nel percorso di alimentazione');}
  if(/NYLON|\bPA\b/.test(s)){good.push('ingranaggi e parti meccaniche','componenti soggetti a urti e fatica');avoid.push('stampa con filamento umido','pezzi dimensionalmente critici senza calibrazione');issues.push('assorbimento rapido di umidità','warping e variazioni dimensionali');}
  if(/\bPC\b|POLYCARB/.test(s)){good.push('parti robuste e resistenti al calore','componenti meccanici');avoid.push('stampanti con margine termico limitato','pezzi grandi senza ambiente stabile');issues.push('warping importante','adesione tra layer insufficiente se la temperatura è bassa');}
  if(/CF|CARBON|GF|GLASS/.test(s)){good.push('rigidità e stabilità dimensionale');avoid.push('ugelli delicati o non adatti all’abrasione');issues.push('usura dell’ugello','possibili intasamenti con diametri piccoli');}
  if(/PVA|SUPPORT/.test(s)){good.push('supporti solubili e geometrie complesse');avoid.push('conservazione senza essiccante');issues.push('degrado rapido con umidità','estrusione irregolare se non asciutto');}
  if(!good.length)good.push('pezzi funzionali coerenti con il suo profilo tecnico');
  if(!avoid.length)avoid.push('usi fuori dai limiti termici e meccanici del materiale');
  if(!issues.length)issues.push('umidità del filamento','temperatura o velocità non calibrate');
  return {good:[...new Set(good)].slice(0,4),avoid:[...new Set(avoid)].slice(0,4),issues:[...new Set(issues)].slice(0,4)};
}
function compatibility(m){
  const printer=localStorage.getItem('ff10_active_printer')||'Stampante attiva';
  const s=familyKey(m);
  let label='Compatibilità da verificare',tone='neutral',note='Controlla temperature, ugello e profilo del produttore prima della stampa.';
  if(/PLA|PETG|PCTG/.test(s)){label='Setup generalmente semplice';tone='good';note='Materiale normalmente gestibile con un profilo corretto e filamento asciutto.';}
  if(/ASA|ABS|NYLON|\bPA\b|\bPC\b|POLYCARB/.test(s)){label='Richiede setup adeguato';tone='warn';note='Prima di stampare verifica soprattutto temperatura, ambiente di stampa e adesione.';}
  if(/PEEK|PEKK|ULTEM|PEI/.test(s)){label='Materiale specialistico';tone='danger';note='Richiede hardware e gestione termica dedicati: non dare per scontata la compatibilità.';}
  if(/CF|CARBON|GF|GLASS|GLOW|METAL/.test(s)){label='Controlla l’ugello';tone='warn';note='La variante può essere abrasiva: verifica materiale e diametro dell’ugello.';}
  return {printer,label,tone,note};
}
function metric(label,value){return `<div class="ff101-score"><div><span>${esc(label)}</span><strong>${esc(rating(value))}</strong></div><div class="ff101-score-track"><i style="--value:${Math.round(value)}%"></i></div></div>`;}
function techField(label,item){return `<div class="ff101-tech-item"><span>${esc(label)}${item.estimated?'<small>indicativo</small>':''}</span><strong>${esc(item.value)}</strong></div>`;}
function listHtml(items){return `<ul>${items.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`;}

function materialSheet(m){
  const p=profile(m),a=accentFor(m),useTags=tags(m),setup=setupFields(m),tips=advice(m),compat=compatibility(m);
  return `<div class="ff101-material-sheet" style="--mat:${a}">
    <div class="ff10-sheet-top ff101-top"><div><div class="ff10-kicker">Scheda materiale</div><div class="ff101-view-label">Vista essenziale</div></div><button class="ff10-sheet-close" data-sheet-close aria-label="Chiudi">×</button></div>

    <section class="ff101-hero">
      <div class="ff101-family">${esc(matFamily(m))}</div>
      <div class="ff101-title-row"><div class="ff101-material-mark">${esc(matFamily(m).slice(0,3).toUpperCase())}</div><div><h2>${esc(matName(m))}</h2><p>${esc(matDesc(m))}</p></div></div>
    </section>

    <section class="ff101-compat ff101-${compat.tone}">
      <div><span>${esc(compat.printer)}</span><strong>${esc(compat.label)}</strong></div><p>${esc(compat.note)}</p>
    </section>

    <section class="ff101-summary" id="ff101-basic">
      <div class="ff101-section-heading"><span>In breve</span><small>quello che serve prima di stampare</small></div>
      <div class="ff101-score-grid">
        ${metric('Facilità',p.ease)}${metric('Resistenza',p.strength)}${metric('Calore',p.heat)}${metric('Finitura',p.finish)}
      </div>
      <div class="ff101-print-strip">
        <div><span>Ugello</span><strong>${esc(tempText(m,'nozzle'))}</strong></div>
        <div><span>Piano</span><strong>${esc(tempText(m,'bed'))}</strong></div>
        <div><span>Velocità</span><strong>${esc(speedText(m))}</strong></div>
      </div>
      <div class="ff101-use-block"><span>Ideale per</span><div>${useTags.map(t=>`<b>${esc(t)}</b>`).join('')}</div></div>
    </section>

    <div class="ff101-actions">
      <button class="ff101-technical-button" data-ff101-toggle aria-expanded="false"><span><b>Scheda tecnica completa</b><small>Setup, proprietà, problemi e consigli</small></span><i>⌄</i></button>
      <button class="ff10-button primary ff101-price" data-price-material="${esc(matName(m))}">Vedi prezzi live</button>
    </div>

    <section class="ff101-technical" id="ff101-technical" hidden>
      <div class="ff101-tech-intro"><div class="ff10-kicker">Dettagli avanzati</div><h3>Configurazione e comportamento</h3><p>I valori segnati come <b>indicativi</b> sono linee guida generali della famiglia del materiale; per la bobina specifica prevale sempre il profilo del produttore.</p></div>

      <div class="ff101-section-heading"><span>Setup di stampa</span><small>parametri e preparazione</small></div>
      <div class="ff101-tech-grid">${setup.map(([label,item])=>techField(label,item)).join('')}</div>

      <div class="ff101-section-heading ff101-gap"><span>Proprietà</span><small>profilo comparabile</small></div>
      <div class="ff101-advanced-metrics">
        ${metric('Facilità di stampa',p.ease)}${metric('Resistenza meccanica',p.strength)}${metric('Resistenza al calore',p.heat)}${metric('Qualità finitura',p.finish)}
      </div>

      <div class="ff101-advice-grid">
        <article><span>Quando sceglierlo</span>${listHtml(tips.good)}</article>
        <article><span>Quando evitarlo</span>${listHtml(tips.avoid)}</article>
      </div>

      <article class="ff101-problems"><div><span>Problemi comuni</span><small>cosa controllare se la stampa peggiora</small></div>${listHtml(tips.issues)}</article>

      <article class="ff101-printer-note"><span>Stampante attiva</span><strong>${esc(compat.printer)}</strong><p>${esc(compat.note)}</p></article>
    </section>
  </div>`;
}

function openMaterial101(name){
  const m=rawMaterials().find(x=>matName(x)===name);if(!m)return;
  const content=q('#ff10-sheet-content'),backdrop=q('#ff10-sheet-backdrop'),sheet=q('#ff10-sheet');
  if(!content||!backdrop)return;
  content.innerHTML=materialSheet(m);
  backdrop.classList.add('is-open');
  document.documentElement.style.overflow='hidden';
  if(sheet)sheet.scrollTop=0;
}
function toggleTechnical(button){
  const section=q('#ff101-technical');if(!section)return;
  const opening=section.hasAttribute('hidden');
  if(opening)section.removeAttribute('hidden');else section.setAttribute('hidden','');
  button.setAttribute('aria-expanded',String(opening));
  const title=q('b',button),sub=q('small',button),arrow=q('i',button);
  if(title)title.textContent=opening?'Riduci dettagli':'Scheda tecnica completa';
  if(sub)sub.textContent=opening?'Torna alla vista essenziale':'Setup, proprietà, problemi e consigli';
  if(arrow)arrow.textContent=opening?'⌃':'⌄';
  button.classList.toggle('is-open',opening);
  if(opening)setTimeout(()=>section.scrollIntoView({behavior:'smooth',block:'nearest'}),60);
}
function patchVersionText(){
  qa('#ff10-view-settings h2').forEach(el=>{if(el.textContent.includes('Versione 10.0.0'))el.textContent='Versione 10.1.0';});
}
function closeSheetForPrice(){
  q('#ff10-sheet-backdrop')?.classList.remove('is-open');document.documentElement.style.overflow='';
}
function bind(){
  document.addEventListener('click',e=>{
    const toggle=e.target.closest('[data-ff101-toggle]');
    if(toggle){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();toggleTechnical(toggle);return;}
    const price=e.target.closest('#ff101-basic ~ .ff101-actions [data-price-material], .ff101-actions [data-price-material]');
    if(price){closeSheetForPrice();return;}
    const material=e.target.closest('#ff10-app [data-material]');
    if(material){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();openMaterial101(material.dataset.material);return;}
    setTimeout(patchVersionText,0);
  },true);
  const app=q('#ff10-app');
  if(app){const observer=new MutationObserver(patchVersionText);observer.observe(app,{childList:true,subtree:true});}
  patchVersionText();
}
function init(){
  window.FILAMENT_FINDER_VERSION=VERSION;
  if(q('#ff10-app'))bind();else setTimeout(init,20);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
