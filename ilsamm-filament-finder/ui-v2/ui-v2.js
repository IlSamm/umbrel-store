(function(){
  state.currentView = localStorage.getItem('ff_view') || 'home';
  state.tracker = state.tracker || {alerts:[],events:[],unread_count:0,tracked_variants:0};
  state.notifiedEventIds = state.notifiedEventIds || new Set();
  state.editingAlertSignature = state.editingAlertSignature || null;
  state.editingAlertId = state.editingAlertId || null;

  const oldSetPrinter = setPrinter;
  setPrinter = function(id){
    oldSetPrinter(id);
    const p=currentPrinter();
    const name=`${p.brand} ${p.model}`;
    if($('#settingsPrinterName')) $('#settingsPrinterName').textContent=name;
  };

  function viewTitle(name){
    return ({home:'Home',advisor:'Consigliatore',materials:'Materiali',prices:'Prezzi live',compare:'Confronta',cost:'Calcolatore',alerts:'Alert & storico',printers:'Stampanti',settings:'Impostazioni'})[name] || 'Filament Finder';
  }
  switchTab = function(name){
    if(!$('#tab-'+name)) name='home';
    state.currentView=name;
    localStorage.setItem('ff_view',name);
    if(name==='alerts') trackerFetch();
    $$('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===name));
    $$('.tabpane').forEach(p=>p.classList.toggle('active',p.id===`tab-${name}`));
    document.title=`${viewTitle(name)} · Filament Finder`;
    window.scrollTo({top:0,behavior:'smooth'});
  };

  const oldRenderTracker = renderTracker;
  renderTracker = function(){
    oldRenderTracker();
    const d=state.tracker||{alerts:[],events:[]};
    const alerts=d.alerts||[], events=d.events||[], unread=d.unread_count||0;
    if($('#sidebarAlertBadge')){
      $('#sidebarAlertBadge').textContent=unread;
      $('#sidebarAlertBadge').classList.toggle('hidden',unread<=0);
    }
    if($('#homeAlertsCount')) $('#homeAlertsCount').textContent=alerts.filter(a=>a.enabled!==false).length;
    if($('#homeRecentEvents')){
      $('#homeRecentEvents').innerHTML=events.length ? events.slice(0,4).map(e=>`<div class="home-event"><strong>${escapeHtml(e.title||eventTypeLabel(e.type))}</strong><span>${escapeHtml(e.message||'')} · ${formatDateTime(e.created_at)}</span></div>`).join('') : '<div class="empty-state compact">Nessun evento recente.</div>';
    }
  };

  setPrinter(state.printerId);
  if($('#homeMaterialsCount')) $('#homeMaterialsCount').textContent=MATERIALS.length;
  if($('#homePrintersCount')) $('#homePrintersCount').textContent=PRINTERS.length;

  ['#sidebarPrinterBtn','#mobilePrinterBtn','#homePrinterBtn','#settingsPrinterBtn'].forEach(sel=>{
    const el=$(sel); if(el) el.onclick=()=>openModal('printerModal');
  });
  if($('#mobileMoreBtn')) $('#mobileMoreBtn').onclick=()=>openModal('mobileMoreModal');
  $$('#mobileMoreModal [data-tab]').forEach(b=>b.onclick=()=>{switchTab(b.dataset.tab);closeModal('mobileMoreModal');});

  if($('#homeAnalyzeBtn')) $('#homeAnalyzeBtn').onclick=()=>{
    const q=$('#homeQuickInput').value.trim();
    if(!q){$('#homeQuickInput').focus();return;}
    $('#projectInput').value=q;
    switchTab('advisor');
    setTimeout(recommend,80);
  };
  $$('[data-quick]').forEach(b=>b.onclick=()=>{$('#homeQuickInput').value=b.dataset.quick;});

  if(localStorage.getItem('ff_theme')==='light') document.body.classList.add('light');
  if($('#themeBtn')) $('#themeBtn').onclick=()=>{
    document.body.classList.toggle('light');
    localStorage.setItem('ff_theme',document.body.classList.contains('light')?'light':'dark');
  };
  if($('#settingsNotifyBtn')) $('#settingsNotifyBtn').onclick=()=>requestNotifications();

  const oldRequestNotifications=requestNotifications;
  requestNotifications=async function(){
    await oldRequestNotifications();
    if($('#settingsNotifyBtn') && 'Notification' in window){
      $('#settingsNotifyBtn').textContent=Notification.permission==='granted'?'Notifiche attive':'Configura notifiche';
    }
  };

  const oldNotify=notifyNewEvents;
  notifyNewEvents=function(){
    state.notifiedEventIds=state.notifiedEventIds||new Set();
    return oldNotify();
  };

  switchTab(state.currentView);
  trackerFetch();
})();
