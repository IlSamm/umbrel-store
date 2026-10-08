(() => {
  const onReady = (fn) => document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', fn) : fn();
  onReady(() => {
    if (document.querySelector('.mobile-nav')) return;

    const nav = document.createElement('nav');
    nav.className = 'mobile-nav';
    nav.setAttribute('aria-label', 'Navigazione mobile');
    nav.innerHTML = `
      <button class="mobile-nav-btn active" data-mobile-home><span class="mobile-nav-icon">⌂</span><span>Home</span></button>
      <button class="mobile-nav-btn" data-mobile-tab="materials"><span class="mobile-nav-icon">◉</span><span>Materiali</span></button>
      <button class="mobile-nav-btn" data-mobile-tab="prices"><span class="mobile-nav-icon">€</span><span>Prezzi</span></button>
      <button class="mobile-nav-btn" data-mobile-tab="printers"><span class="mobile-nav-icon">▣</span><span>Stampanti</span></button>
      <button class="mobile-nav-btn" data-mobile-tab="alerts"><span class="mobile-nav-icon">♢</span><span>Alert</span><i id="mobileAlertBadge" class="mobile-alert-badge hidden">0</i></button>`;
    document.body.appendChild(nav);

    const buttons = [...nav.querySelectorAll('.mobile-nav-btn')];
    const setActive = (name) => {
      buttons.forEach((b) => b.classList.toggle('active', name === 'home' ? b.hasAttribute('data-mobile-home') : b.dataset.mobileTab === name));
    };

    nav.querySelector('[data-mobile-home]').addEventListener('click', () => {
      setActive('home');
      window.scrollTo({top: 0, behavior: 'smooth'});
    });

    nav.querySelectorAll('[data-mobile-tab]').forEach((b) => b.addEventListener('click', () => {
      const name = b.dataset.mobileTab;
      if (typeof window.switchTab === 'function') {
        window.switchTab(name);
      } else {
        document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x.dataset.tab === name));
        document.querySelectorAll('.tabpane').forEach((x) => x.classList.toggle('active', x.id === `tab-${name}`));
        document.querySelector('.workspace')?.scrollIntoView({behavior: 'smooth', block: 'start'});
      }
      setActive(name);
    }));

    document.querySelectorAll('.tab,[data-tab]:not(.tab)').forEach((b) => b.addEventListener('click', () => {
      const name = b.dataset.tab;
      if (name && ['materials','prices','printers','alerts'].includes(name)) setActive(name);
      else if (name) buttons.forEach((x) => x.classList.remove('active'));
    }));

    const sourceBadge = document.getElementById('alertBadge');
    const mobileBadge = document.getElementById('mobileAlertBadge');
    const syncBadge = () => {
      if (!sourceBadge || !mobileBadge) return;
      mobileBadge.textContent = sourceBadge.textContent || '0';
      mobileBadge.classList.toggle('hidden', sourceBadge.classList.contains('hidden'));
    };
    syncBadge();
    if (sourceBadge) new MutationObserver(syncBadge).observe(sourceBadge, {subtree:true, childList:true, attributes:true, attributeFilter:['class']});
  });
})();
