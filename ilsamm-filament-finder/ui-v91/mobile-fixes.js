(function(){
  'use strict';

  const q=(s,r=document)=>r.querySelector(s);
  const qa=(s,r=document)=>[...r.querySelectorAll(s)];

  window.FILAMENT_FINDER_VERSION='9.1.0';

  const icon=(name)=>{
    const paths={
      printer:'<path d="M7 9V4h10v5"/><path d="M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2"/><path d="M7 14h10v6H7z"/>',
      menu:'<path d="M4 7h16M4 12h16M4 17h16"/>',
      x:'<path d="M6 6l12 12M18 6L6 18"/>',
      compare:'<path d="M7 7h11l-3-3M18 7l-3 3M17 17H6l3 3M6 17l3-3"/>',
      calc:'<path d="M7 4h10M7 20h10M9 8l3 4-3 4M15 8h2M15 12h2M15 16h2"/>',
      bell:'<path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/>',
      settings:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21h-4v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H3v-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1L7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3h4a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.1v4H21a1.7 1.7 0 0 0-1.6 1z"/>',
      cost:'<path d="M8 5h8M9 9h6M9 13h6M8 17h8"/>',
      home:'<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10M9 20v-6h6v6"/>',
      spark:'<path d="M12 3l1.7 4.3L18 9l-4.3 1.7L12 15l-1.7-4.3L6 9l4.3-1.7L12 3z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z"/>',
      euro:'<path d="M18 7.5A7 7 0 1 0 18 16.5"/><path d="M5 10h9M5 14h8"/>',
      layers:'<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 12l9 5 9-5M3 16l9 5 9-5"/>'
    };
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name]||paths.menu}</svg>`;
  };

  function fixCopy(){
    const quick=q('.quick-analysis-card .status-pill');
    if(quick) quick.textContent='Regole intelligenti';

    const refresh=q('#forceRefreshBtn');
    if(refresh){
      refresh.textContent='↻ Aggiorna';
      refresh.setAttribute('aria-label','Aggiorna i prezzi dalle fonti live');
    }

    const settingsTitle=q('#tab-settings .system-card h2');
    if(settingsTitle) settingsTitle.textContent='Filament Finder 9.1';
    qa('#tab-settings .system-status span').forEach(s=>{
      if(/fonti configurate/i.test(s.textContent||'')) s.innerHTML='<i></i> 11 fonti configurate';
    });
  }

  function fixMaterialFilters(){
    qa('#materialFilters button').forEach(b=>b.classList.add('filter'));
  }

  function fixIcons(){
    const printer=q('#mobilePrinterBtn');
    if(printer){printer.innerHTML=icon('printer');printer.title='Stampante';}

    const more=q('#mobileMoreBtn span');
    if(more) more.innerHTML=icon('menu');

    qa('.closebtn').forEach(b=>{
      b.innerHTML=icon('x');
      b.setAttribute('aria-label','Chiudi');
      b.title='Chiudi';
    });

    const map={compare:'compare',cost:'calc',alerts:'bell',printers:'printer',settings:'settings'};
    qa('.mobile-menu-grid button[data-tab]').forEach(b=>{
      const span=b.querySelector('span');
      if(span) span.innerHTML=icon(map[b.dataset.tab]||'menu');
    });
  }

  function plausibleColor(value){
    const v=String(value||'').trim();
    if(!v || v.length>34) return false;
    if(/^\d+(?:[.,]\d+)?\s*(?:unit[aà]?|pcs?|pezzi?|pack|kg|g|mm)\b/i.test(v)) return false;
    if(/\b(?:bobina|spool|filament|filamento|3d\s*print|1\s*kg|1000\s*g|bundle|refill)\b/i.test(v)) return false;
    if((v.match(/\s+/g)||[]).length>4) return false;
    return true;
  }

  function repairPriceRenderer(){
    const base=window.renderLiveCatalog;
    if(typeof base!=='function' || base.__ff91wrapped) return;

    const wrapped=function(){
      const d=window.state?.liveCatalog;
      let originalColors=null;
      if(d && Array.isArray(d.colors)){
        originalColors=d.colors;
        d.colors=d.colors.filter(plausibleColor);
      }
      try{
        return base.apply(this,arguments);
      }finally{
        if(d && originalColors) d.colors=originalColors;
        requestAnimationFrame(()=>{
          qa('#colorPalette .color-chip').forEach(chip=>{
            const text=(chip.textContent||'').trim();
            if(!plausibleColor(text)) chip.remove();
          });
        });
      }
    };
    wrapped.__ff91wrapped=true;
    window.renderLiveCatalog=wrapped;

    if(window.state?.liveCatalog) window.renderLiveCatalog();
  }

  function repairBottomNav(){
    const nav=q('.bottom-nav');
    if(!nav) return;
    nav.setAttribute('aria-label','Navigazione principale');
    qa('.bottom-nav button').forEach(b=>{
      const label=b.querySelector('small')?.textContent?.trim();
      if(label) b.setAttribute('aria-label',label);
    });
  }

  function guardMobileWidth(){
    const root=document.documentElement;
    const apply=()=>{
      if(innerWidth<=760 && root.scrollWidth>innerWidth+2){
        document.body.classList.add('ff-overflow-guard');
      }else{
        document.body.classList.remove('ff-overflow-guard');
      }
    };
    apply();
    addEventListener('resize',apply,{passive:true});
  }

  function init(){
    fixCopy();
    fixMaterialFilters();
    fixIcons();
    repairPriceRenderer();
    repairBottomNav();
    guardMobileWidth();
  }

  init();

  /* Some screens are re-rendered by older code. Keep only tiny structural repairs
     in sync rather than replacing the whole application renderer again. */
  const observer=new MutationObserver((mutations)=>{
    let filters=false,icons=false;
    for(const m of mutations){
      if(m.target?.id==='materialFilters' || q('#materialFilters button:not(.filter)')) filters=true;
      if(m.target?.id==='mobileMoreModal') icons=true;
    }
    if(filters) fixMaterialFilters();
    if(icons) fixIcons();
  });
  observer.observe(document.body,{subtree:true,childList:true});
})();
