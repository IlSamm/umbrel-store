const BUILD = '1.7.0-20260821g';
const STATIC_CACHE = `gestore-static-${BUILD}`;
const PAGE_CACHE = `gestore-pages-${BUILD}`;
const APP_SHELL = [
  '/',
  '/index.html',
  '/style.css?v=20260821g',
  '/site.webmanifest?v=20260821g',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png',
  '/assets/icons/apple-touch-icon.png',
  '/legal/legal.css',
  '/legal/privacy.html',
  '/legal/terms.html',
  '/legal/support.html',
  '/styles/design-system.css?v=20260821g',
  '/styles/base.css?v=20260821g',
  '/styles/shared-ui.css?v=20260821g',
  '/styles/editor.css?v=20260821g',
  '/styles/home-visuals.css?v=20260821g',
  '/styles/payslips.css?v=20260821g',
  '/styles/shell-nav.css?v=20260821g',
  '/styles/compact-tuning.css?v=20260821g',
  '/styles/home-final.css?v=20260821g',
  '/styles/home-final-shell.css?v=20260821g',
  '/styles/home-final-day-card.css?v=20260821g',
  '/styles/home-final-analytics.css?v=20260821g',
  '/styles/editor-final.css?v=20260821g',
  '/styles/payslips-final.css?v=20260821g',
  '/styles/payslips-archive-v2.css?v=20260821g',
  '/styles/payslip-statistics.css?v=20260821g',
  '/styles/payslip-estimate.css?v=20260821g',
  '/styles/vacations-final.css?v=20260821g',
  '/styles/vacations-screen-final.css?v=20260821g',
  '/styles/vacation-dialogs-final.css?v=20260821g',
  '/styles/calendar-stats-header-final.css?v=20260821g',
  '/styles/statistics-final.css?v=20260821g',
  '/styles/profile-final.css?v=20260821g',
  '/styles/profile-hub-final.css?v=20260821g',
  '/styles/settings-pages-final.css?v=20260821g',
  '/styles/account-backup.css?v=20260821g',
  '/styles/splash-final.css?v=20260821g',
  '/styles/dialogs-final.css?v=20260821g',
  '/styles/operation-loader.css?v=20260821g',
  '/styles/nav-motion-final.css?v=20260821g',
  '/styles/features-final.css?v=20260821g',
  '/styles/professional-upgrades.css?v=20260821g',
  '/styles/planning-tools.css?v=20260821g',
  '/styles/experience-tools.css?v=20260821g',
  '/styles/platform-final.css?v=20260821g',
  '/styles/validation-final.css?v=20260821g',
  '/styles/v13-foundation.css?v=20260821g',
  '/styles/v13-home.css?v=20260821g',
  '/styles/v13-statistics.css?v=20260821g',
  '/styles/v13-editor.css?v=20260821g',
  '/styles/v13-nav.css?v=20260821g',
  '/styles/v13-account.css?v=20260821g',
  '/styles/salary-hub.css?v=20260821g',
  '/styles/calendar-v2.css?v=20260821g',
  '/styles/switches-final.css?v=20260821g',
  '/js/runtime-config.js',
  '/js/native-runtime.js',
  '/js/native-bridge.js',
  '/js/loading.js?v=20260821g',
  '/js/payroll/currency-utils.js?v=20260821g',
  '/js/payroll/payroll-types.js?v=20260821g',
  '/js/tax-config/municipal-taxes.generated.js?v=20260821g',
  '/js/tax-config/2025.js?v=20260821g',
  '/js/tax-config/2026.js?v=20260821g',
  '/js/payroll/progressive-tax-calculator.js?v=20260821g',
  '/js/payroll/contribution-calculator.js?v=20260821g',
  '/js/payroll/employee-deduction-calculator.js?v=20260821g',
  '/js/payroll/regional-tax-calculator.js?v=20260821g',
  '/js/payroll/municipal-tax-calculator.js?v=20260821g',
  '/js/payroll/payroll-validation.js?v=20260821g',
  '/js/payroll/payroll-calculator.js?v=20260821g',
  '/js/core.js?v=20260821g',
  '/js/validation.js?v=20260821g',
  '/js/pdf/engine.js?v=20260821g',
  '/js/pdf/monthly.js?v=20260821g',
  '/js/pdf/yearly.js?v=20260821g',
  '/js/payslips.js?v=20260821g',
  '/js/account.js?v=20260821g',
  '/js/platform.js?v=20260821g',
  '/js/features.js?v=20260821g',
  '/js/planning.js?v=20260821g',
  '/js/experience.js?v=20260821g',
  '/js/views.js?v=20260821g',
  '/js/bindings.js?v=20260821g',
  '/js/editor.js?v=20260821g'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith('gestore-') && ![STATIC_CACHE, PAGE_CACHE].includes(key))
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request) {
  const cache = await caches.open(PAGE_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    return (await cache.match(request)) || (await caches.match('/index.html'));
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response && response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);
  return cached || network || Response.error();
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }
  event.respondWith(staleWhileRevalidate(request));
});

self.addEventListener('periodicsync', (event) => {
  if (event.tag !== 'gestore-refresh') return;
  event.waitUntil(
    fetch('/api/ping', { cache: 'no-store', credentials: 'same-origin' }).catch(() => null)
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (error) {
    payload = { title: 'GestOre', body: event.data ? event.data.text() : '' };
  }
  const title = payload.title || 'GestOre';
  const options = {
    body: payload.body || 'Hai un aggiornamento da controllare.',
    icon: '/assets/icons/icon-192.png',
    badge: '/assets/icons/icon-192.png',
    tag: payload.tag || 'gestore-notification',
    renotify: false,
    data: { url: payload.url || '/' }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      return self.clients.openWindow ? self.clients.openWindow(targetUrl) : undefined;
    })
  );
});
