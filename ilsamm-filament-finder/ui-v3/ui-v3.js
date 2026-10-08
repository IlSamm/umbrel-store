(function(){
  state.currentView = localStorage.getItem('ff_view') || 'home';
  state.tracker = state.tracker || {alerts:[],events:[],unread_count:0,tracked_variants:0};
  state.notifiedEventIds = state.notifiedEventIds || new Set();
  state.editingAlertSignature = state.editingAlertSignature || null;
  state.editingAlertId = state.editingAlertId || null;

  const ICONS={
    home:'<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9 21v-7h6v7"/>',
    sparkles:'<path d="m12 3-1.2 3.2L7.5 7.5l3.3 1.3L12 12l1.2-3.2 3.3-1.3-3.3-1.3L12 3Z"/><path d="m5 14-.8 2.2L2 17l2.2.8L5 20l.8-2.2L8 17l-2.2-.8L5 14Z"/><path d="m19 13-.7 1.8-1.8.7 1.8.7L19 18l.7-1.8 1.8-.7-1.8-.7L19 13Z"/>',
    layers:'<path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/>',
    'badge-euro':'<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5A4 4 0 1 0 15.5 15.5"/><path d="M7 10h6M7 14h6"/>',
    columns:'<rect x="3" y="4" width="7" height="16" rx="1"/><rect x="14" y="4" width="7" height="16" rx="1"/>',
    calculator:'<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"/>',
    bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/>',
    printer:'<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/><path d="M18 12h.01"/>',
    settings:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.1a1.7 1.7 0 0 0-.4-1.1 1.7 1.7 0 0 0-1-.6 1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 3.8 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H2v-4h.1a1.7 1.7 0 0 0 1.1-.4 1.7 1.7 0 0 0 .6-1A1.7 1.7 0 0 0 3.46 6.3l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 8.2 3.8a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V2h4v.1a1.7 1.7 0 0 0 .4 1.1 1.7 1.7 0 0 0 1 .6 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 8.2c.12.38.33.72.6 1 .3.27.69.4 1.1.4h.1v4h-.1c-.41 0-.8.14-1.1.4-.27.28-.48.62-.6 1Z"/>',
    'chevron-right':'<path d="m9 18 6-6-6-6"/>','chevron-down':'<path d="m6 9 6 6 6-6"/>',
    'refresh-cw':'<path d="M20 11a8.1 8.1 0 0 0-15.5-2M4 4v5h5"/><path d="M4 13a8.1 8.1 0 0 0 15.5 2M20 20v-5h-5"/>',
    menu:'<path d="M4 7h16M4 12h16M4 17h16"/>',
    x:'<path d="M18 6 6 18M6 6l12 12"/>'
  };
  function svgIcon(name){return `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]||ICONS.menu}</svg>`}
  function paintIcons(root=document){root.querySelectorAll('[data-icon]').forEach(el=>{if(!el.dataset.iconPainted){el.innerHTML=svgIcon(el.dataset.icon);el.dataset.iconPainted='1';}})}

  function upgradeStaticDOM(){
    const navMap={home:'home',advisor:'sparkles',materials:'layers',prices:'badge-euro',compare:'columns',cost:'calculator',alerts:'bell',printers:'printer',settings:'settings'};
    $$('.sidebar .nav-item[data-tab]').forEach(b=>{
      const icon=b.querySelector('.nav-icon');
      if(icon){icon.textContent='';icon.dataset.icon=navMap[b.dataset.tab]||'menu';delete icon.dataset.iconPainted;}
    });
    const sectionLabels=$$('.sidebar .nav-section-label');
    if(sectionLabels[0])sectionLabels[0].textContent='Panoramica';
    if(sectionLabels[1])sectionLabels[1].textContent='Esplora';
    const brandMeta=$('.brandmeta');if(brandMeta)brandMeta.textContent='3D Material Intelligence';
    const sideArrow=$('.sidebar-printer > span:last-child');if(sideArrow){sideArrow.textContent='';sideArrow.className='sidebar-printer-arrow';sideArrow.dataset.icon='chevron-right';}
    if(!$('.sidebar-footer')) $('.sidebar').insertAdjacentHTML('beforeend','<div class="sidebar-footer"><span class="version-dot"></span><span>v3.0.0 · Umbrel</span></div>');
    if(!$('.desktop-topbar')){
      $('.main-column').insertAdjacentHTML('afterbegin','<header class="desktop-topbar"><div class="topbar-breadcrumb"><span id="topbarSection">Home</span><small id="topbarContext">Panoramica del workspace</small></div><div class="topbar-actions"><button class="topbar-printer" id="topbarPrinterBtn"><span data-icon="printer"></span><span id="topbarPrinterName">Stampante</span><span data-icon="chevron-down"></span></button></div></header>');
    }
    const mp=$('#mobilePrinterBtn');if(mp){mp.textContent='';mp.innerHTML='<span data-icon="printer"></span>';}
    const hero=$('#tab-home .hero-head');if(hero){
      const ey=hero.querySelector('.eyebrow');if(ey)ey.textContent='PANORAMICA';
      const h=hero.querySelector('h1');if(h)h.textContent='Buonasera.';
      const p=hero.querySelector('p');if(p)p.textContent='Controlla stampante, materiali, prezzi e alert da un’unica dashboard.';
      const cta=hero.querySelector('[data-tab="advisor"]');if(cta)cta.innerHTML='<span data-icon="sparkles"></span> Nuova analisi';
    }
    const ph=$('.printer-hero-icon');if(ph)ph.innerHTML='<span data-icon="printer"></span>';
    const status=$('.status-pill');if(status)status.innerHTML='<i></i> Motore pronto';
    const ha=$('#homeAnalyzeBtn');if(ha)ha.textContent='Analizza progetto';
    const launcherIcons={materials:'layers',prices:'badge-euro',compare:'columns',cost:'calculator'};
    $$('.launcher-grid button[data-tab]').forEach(b=>{const i=b.querySelector('.launcher-icon');if(i){i.textContent='';i.dataset.icon=launcherIcons[b.dataset.tab]||'menu';}});
    const eyebrowMap={advisor:'CONSIGLIATORE',materials:'MATERIALI',prices:'PREZZI LIVE',compare:'CONFRONTO',cost:'CALCOLATORE',alerts:'ALERT & STORICO',printers:'STAMPANTI',settings:'IMPOSTAZIONI'};
    Object.entries(eyebrowMap).forEach(([tab,label])=>{const e=$(`#tab-${tab} .eyebrow`);if(e)e.textContent=label;});
    const fr=$('#forceRefreshBtn');if(fr)fr.innerHTML='<span data-icon="refresh-cw"></span> Aggiorna';
    const nt=$('#notifyBtn');if(nt)nt.innerHTML='<span data-icon="bell"></span> Notifiche';
    const ca=$('#checkAlertsNowBtn');if(ca)ca.innerHTML='<span data-icon="refresh-cw"></span> Controlla ora';
    const versionTitle=$('#tab-settings .system-card h2');if(versionTitle)versionTitle.textContent='Filament Finder 3.0.0';
    const versionCopy=$('#tab-settings .system-card p');if(versionCopy)versionCopy.textContent='Interfaccia professionale, catalogo live multi-store, tracker locale e dati persistenti su Umbrel.';
    const bottomMap={home:'home',advisor:'sparkles',prices:'badge-euro',materials:'layers'};
    $$('.bottom-nav button[data-tab]').forEach(b=>{const sp=b.querySelector('span');if(sp){sp.textContent='';sp.dataset.icon=bottomMap[b.dataset.tab]||'menu';}});
    const more=$('#mobileMoreBtn');if(more){const sp=more.querySelector('span');if(sp){sp.textContent='';sp.dataset.icon='menu';}}
    const moreMap={compare:'columns',cost:'calculator',alerts:'bell',printers:'printer',settings:'settings'};
    $$('#mobileMoreModal [data-tab]').forEach(b=>{const sp=b.querySelector('span');if(sp){sp.textContent='';sp.dataset.icon=moreMap[b.dataset.tab]||'menu';}});
    $$('.closebtn').forEach(b=>{b.textContent='';b.innerHTML='<span data-icon="x"></span>';});
  }
  upgradeStaticDOM();
  paintIcons();

  const titles={
    home:['Home','Panoramica del workspace'],advisor:['Consigliatore','Trova il materiale giusto'],materials:['Materiali','Catalogo tecnico'],prices:['Prezzi live','Confronto offerte e costo finale'],compare:['Confronta','Materiali fianco a fianco'],cost:['Calcolatore','Costo reale e prezzo di vendita'],alerts:['Alert & storico','Monitoraggio prezzi e disponibilità'],printers:['Stampanti','Hardware e compatibilità'],settings:['Impostazioni','Preferenze e stato sistema']
  };

  const oldSetPrinter=setPrinter;
  setPrinter=function(id){
    oldSetPrinter(id);
    const p=currentPrinter();
    const name=`${p.brand} ${p.model}`;
    if($('#settingsPrinterName')) $('#settingsPrinterName').textContent=name;
    if($('#topbarPrinterName')) $('#topbarPrinterName').textContent=name;
    paintIcons();
  };

  switchTab=function(name){
    if(!$('#tab-'+name))name='home';
    state.currentView=name;
    localStorage.setItem('ff_view',name);
    if(name==='alerts')trackerFetch();
    $$('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===name));
    $$('.tabpane').forEach(p=>p.classList.toggle('active',p.id===`tab-${name}`));
    const meta=titles[name]||titles.home;
    if($('#topbarSection'))$('#topbarSection').textContent=meta[0];
    if($('#topbarContext'))$('#topbarContext').textContent=meta[1];
    if($('#mobileMoreBtn'))$('#mobileMoreBtn').classList.toggle('active',!['home','advisor','prices','materials'].includes(name));
    document.title=`${meta[0]} · Filament Finder`;
    window.scrollTo({top:0,behavior:'smooth'});
    requestAnimationFrame(()=>paintIcons());
  };

  const oldRenderTracker=renderTracker;
  renderTracker=function(){
    oldRenderTracker();
    const d=state.tracker||{alerts:[],events:[]};
    const alerts=d.alerts||[],events=d.events||[],unread=d.unread_count||0;
    if($('#sidebarAlertBadge')){ $('#sidebarAlertBadge').textContent=unread;$('#sidebarAlertBadge').classList.toggle('hidden',unread<=0); }
    if($('#homeAlertsCount'))$('#homeAlertsCount').textContent=alerts.filter(a=>a.enabled!==false).length;
    if($('#homeRecentEvents')){
      $('#homeRecentEvents').innerHTML=events.length?events.slice(0,4).map(e=>`<div class="home-event"><strong>${escapeHtml(e.title||eventTypeLabel(e.type))}</strong><span>${escapeHtml(e.message||'')} · ${formatDateTime(e.created_at)}</span></div>`).join(''):'<div class="empty-state compact">Nessun evento recente.</div>';
    }
    paintIcons();
  };

  setPrinter(state.printerId);
  if($('#homeMaterialsCount'))$('#homeMaterialsCount').textContent=MATERIALS.length;
  if($('#homePrintersCount'))$('#homePrintersCount').textContent=PRINTERS.length;

  ['#sidebarPrinterBtn','#mobilePrinterBtn','#homePrinterBtn','#settingsPrinterBtn','#topbarPrinterBtn'].forEach(sel=>{const el=$(sel);if(el)el.onclick=()=>openModal('printerModal')});
  if($('#mobileMoreBtn'))$('#mobileMoreBtn').onclick=()=>openModal('mobileMoreModal');
  $$('#mobileMoreModal [data-tab]').forEach(b=>b.onclick=()=>{switchTab(b.dataset.tab);closeModal('mobileMoreModal')});
  if($('#homeAnalyzeBtn'))$('#homeAnalyzeBtn').onclick=()=>{const q=$('#homeQuickInput').value.trim();if(!q){$('#homeQuickInput').focus();return;}$('#projectInput').value=q;switchTab('advisor');setTimeout(recommend,70)};
  $$('[data-quick]').forEach(b=>b.onclick=()=>{$('#homeQuickInput').value=b.dataset.quick});

  if(localStorage.getItem('ff_theme')==='light')document.body.classList.add('light');
  if($('#themeBtn'))$('#themeBtn').onclick=()=>{document.body.classList.toggle('light');localStorage.setItem('ff_theme',document.body.classList.contains('light')?'light':'dark')};
  if($('#settingsNotifyBtn'))$('#settingsNotifyBtn').onclick=()=>requestNotifications();

  const oldRequestNotifications=requestNotifications;
  requestNotifications=async function(){await oldRequestNotifications();if($('#settingsNotifyBtn')&&'Notification' in window)$('#settingsNotifyBtn').textContent=Notification.permission==='granted'?'Notifiche attive':'Configura notifiche'};
  const oldNotify=notifyNewEvents;
  notifyNewEvents=function(){state.notifiedEventIds=state.notifiedEventIds||new Set();return oldNotify()};

  const observer=new MutationObserver(()=>paintIcons());
  observer.observe(document.body,{childList:true,subtree:true});

  switchTab(state.currentView);
  trackerFetch();
})();