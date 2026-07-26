const BUILD = '1.5.3-20260727a';
const STATIC_CACHE = `gestore-static-${BUILD}`;
const PAGE_CACHE = `gestore-pages-${BUILD}`;
const APP_SHELL = [
  '/',
  '/index.html',
  '/style.css?v=20260727a',
  '/site.webmanifest?v=20260727a',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png',
  '/assets/icons/apple-touch-icon.png',
  '/styles/design-system.css?v=20260727a',
  '/styles/base.css?v=20260727a',
  '/styles/shared-ui.css?v=20260727a',
  '/styles/editor.css?v=20260727a',
  '/styles/home-visuals.css?v=20260727a',
  '/styles/payslips.css?v=20260727a',
  '/styles/shell-nav.css?v=20260727a',
  '/styles/compact-tuning.css?v=20260727a',
  '/styles/home-final.css?v=20260727a',
  '/styles/home-final-shell.css?v=20260727a',
  '/styles/home-final-day-card.css?v=20260727a',
  '/styles/home-final-analytics.css?v=20260727a',
  '/styles/editor-final.css?v=20260727a',
  '/styles/payslips-final.css?v=20260727a',
  '/styles/payslips-archive-v2.css?v=20260727a',
  '/styles/payslip-statistics.css?v=20260727a',
  '/styles/payslip-estimate.css?v=20260727a',
  '/styles/vacations-final.css?v=20260727a',
  '/styles/vacations-screen-final.css?v=20260727a',
  '/styles/vacation-dialogs-final.css?v=20260727a',
  '/styles/calendar-stats-header-final.css?v=20260727a',
  '/styles/statistics-final.css?v=20260727a',
  '/styles/profile-final.css?v=20260727a',
  '/styles/profile-hub-final.css?v=20260727a',
  '/styles/settings-pages-final.css?v=20260727a',
  '/styles/account-backup.css?v=20260727a',
  '/styles/splash-final.css?v=20260727a',
  '/styles/dialogs-final.css?v=20260727a',
  '/styles/operation-loader.css?v=20260727a',
  '/styles/nav-motion-final.css?v=20260727a',
  '/styles/features-final.css?v=20260727a',
  '/styles/professional-upgrades.css?v=20260727a',
  '/styles/planning-tools.css?v=20260727a',
  '/styles/experience-tools.css?v=20260727a',
  '/styles/platform-final.css?v=20260727a',
  '/styles/validation-final.css?v=20260727a',
  '/styles/v13-foundation.css?v=20260727a',
  '/styles/v13-home.css?v=20260727a',
  '/styles/v13-statistics.css?v=20260727a',
  '/styles/v13-editor.css?v=20260727a',
  '/styles/v13-nav.css?v=20260727a',
  '/styles/v13-account.css?v=20260727a',
  '/js/loading.js?v=20260727a',
  '/js/payroll/currency-utils.js?v=20260727a',
  '/js/payroll/payroll-types.js?v=20260727a',
  '/js/tax-config/2025.js?v=20260727a',
  '/js/tax-config/2026.js?v=20260727a',
  '/js/payroll/progressive-tax-calculator.js?v=20260727a',
  '/js/payroll/contribution-calculator.js?v=20260727a',
  '/js/payroll/employee-deduction-calculator.js?v=20260727a',
  '/js/payroll/regional-tax-calculator.js?v=20260727a',
  '/js/payroll/municipal-tax-calculator.js?v=20260727a',
  '/js/payroll/payroll-validation.js?v=20260727a',
  '/js/payroll/payroll-calculator.js?v=20260727a',
  '/js/core.js?v=20260727a',
  '/js/validation.js?v=20260727a',
  '/js/pdf/engine.js?v=20260727a',
  '/js/pdf/monthly.js?v=20260727a',
  '/js/pdf/yearly.js?v=20260727a',
  '/js/payslips.js?v=20260727a',
  '/js/account.js?v=20260727a',
  '/js/platform.js?v=20260727a',
  '/js/features.js?v=20260727a',
  '/js/planning.js?v=20260727a',
  '/js/experience.js?v=20260727a',
  '/js/views.js?v=20260727a',
  '/js/bindings.js?v=20260727a',
  '/js/editor.js?v=20260727a'
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
