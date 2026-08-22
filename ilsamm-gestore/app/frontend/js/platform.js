var PLATFORM_BUILD = '1.8.1-20260822b';
var PLATFORM_HISTORY_URL = '/api/history';
var PLATFORM_DIAGNOSTICS_URL = '/api/diagnostics';
var PLATFORM_SESSIONS_URL = '/api/auth/sessions';
var PLATFORM_AUDIT_URL = '/api/admin/audit';
var PLATFORM_PUSH_URL = '/api/push';
var PLATFORM_RECOVERY_URL = '/api/auth/recovery-code';
var PLATFORM_RELEASE_STORAGE = 'gestore-release-seen-v1';
var PLATFORM_PENDING_RECOVERY = 'gestore-recovery-code-pending-v1';

var platformState = {
  serviceWorker: null,
  updateWorker: null,
  updateAvailable: false,
  updateBusy: false,
  releaseOpen: false,
  recoveryCode: '',
  recoveryOpen: false,
  message: '',
  online: navigator.onLine !== false,
  history: { loading: false, loaded: false, error: '', items: [], busyId: '' },
  diagnostics: { loading: false, loaded: false, error: '', value: null },
  sessions: { loading: false, loaded: false, error: '', items: [], busyId: '' },
  audit: { loading: false, loaded: false, error: '', items: [] },
  push: { loading: false, loaded: false, error: '', available: false, publicKey: '', subscriptions: 0, busy: false }
};

var PLATFORM_RELEASE_NOTES = [
  'Profilo e Impostazioni ora restano fissi, piu leggibili e senza aree account duplicate.',
  'Puoi scegliere tra dodici nuove mascotte GestOre, oltre a foto, fotocamera e iniziali.',
  'Stipendio permette di cambiare mese direttamente dal titolo e Report ha quattro esportazioni piu chiare.',
  'Privacy, Termini e Supporto sono completi, leggibili e si aprono sempre dentro GestOre.'
];

async function readPlatformJson(response) {
  var payload = {};
  try { payload = await response.json(); } catch (err) { payload = {}; }
  if (!response.ok) {
    var error = new Error(payload.error || ('Richiesta non riuscita (' + response.status + ').'));
    error.code = payload.code || '';
    throw error;
  }
  return payload;
}

function formatPlatformDate(timestamp, fallback) {
  var value = Number(timestamp) || 0;
  if (!value) return fallback || 'Non disponibile';
  try {
    return new Intl.DateTimeFormat('it-IT', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(value));
  } catch (err) {
    return fallback || 'Registrato';
  }
}

function formatPlatformBytes(value) {
  var bytes = Math.max(0, Number(value) || 0);
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0) + ' MB';
}

function platformActionLabel(action) {
  var labels = {
    created: 'Creata',
    updated: 'Modificata',
    deleted: 'Eliminata'
  };
  return labels[action] || 'Modificata';
}

function platformAuditLabel(action) {
  var labels = {
    'account.created': 'Account creato',
    'account.deleted': 'Account eliminato',
    'session.login': 'Accesso effettuato',
    'session.login_failed': 'Accesso non riuscito',
    'session.logout': 'Disconnessione',
    'session.revoked': 'Sessione revocata',
    'admin.account_opened': 'Profilo aperto dal proprietario',
    'backup.created': 'Backup creato',
    'backup.restored': 'Backup ripristinato',
    'backup.file_restored': 'Backup del telefono ripristinato',
    'backup.deleted': 'Backup eliminato',
    'history.restored': 'Modifica annullata',
    'security.recovery_code_issued': 'Codice di recupero rinnovato',
    'security.account_recovered': 'Account recuperato',
    'security.passkey_added': 'Passkey aggiunta',
    'security.passkey_removed': 'Passkey rimossa',
    'session.passkey_login': 'Accesso con passkey',
    'session.passkey_failed': 'Accesso passkey non riuscito',
    'push.enabled': 'Notifiche server attivate',
    'push.disabled': 'Notifiche server disattivate',
    'push.sent': 'Notifica server inviata'
  };
  return labels[action] || String(action || 'Attivita');
}

function showPlatformMessage(message) {
  platformState.message = String(message || '');
  if (typeof render === 'function') render();
  window.setTimeout(function () {
    if (platformState.message === message) {
      platformState.message = '';
      if (typeof render === 'function') render();
    }
  }, 3600);
}

function showRecoveryCode(code) {
  platformState.recoveryCode = String(code || '');
  platformState.recoveryOpen = Boolean(platformState.recoveryCode);
  if (typeof render === 'function') render();
}

function cachePendingRecoveryCode(code) {
  try {
    if (code) sessionStorage.setItem(PLATFORM_PENDING_RECOVERY, String(code));
  } catch (err) {}
}

function readPendingRecoveryCode() {
  try {
    var code = sessionStorage.getItem(PLATFORM_PENDING_RECOVERY) || '';
    if (code) sessionStorage.removeItem(PLATFORM_PENDING_RECOVERY);
    return code;
  } catch (err) {
    return '';
  }
}

async function registerGestOreServiceWorker() {
  if (window.GestOreNative && window.GestOreNative.isNative) return null;
  if (!('serviceWorker' in navigator)) return null;
  try {
    var registration = await navigator.serviceWorker.register('/service-worker.js', {
      scope: '/',
      updateViaCache: 'none'
    });
    platformState.serviceWorker = registration;
    var setWaiting = function (worker) {
      if (!worker || !navigator.serviceWorker.controller) return;
      platformState.updateWorker = worker;
      platformState.updateAvailable = true;
      if (typeof render === 'function') render();
    };
    if (registration.waiting) setWaiting(registration.waiting);
    registration.addEventListener('updatefound', function () {
      var installing = registration.installing;
      if (!installing) return;
      installing.addEventListener('statechange', function () {
        if (installing.state === 'installed') setWaiting(installing);
      });
    });
    var reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    });
    try {
      if ('periodicSync' in registration) {
        await registration.periodicSync.register('gestore-refresh', { minInterval: 12 * 60 * 60 * 1000 });
      }
    } catch (err) {}
    registration.update().catch(function () {});
    return registration;
  } catch (err) {
    return null;
  }
}

function applyGestOreUpdate() {
  if (!platformState.updateWorker || platformState.updateBusy) return;
  platformState.updateBusy = true;
  platformState.updateWorker.postMessage({ type: 'SKIP_WAITING' });
  if (typeof render === 'function') render();
}

function initializeReleaseNotes() {
  var previous = '';
  try { previous = localStorage.getItem(PLATFORM_RELEASE_STORAGE) || ''; } catch (err) {}
  if (previous && previous !== PLATFORM_BUILD) platformState.releaseOpen = true;
  try { localStorage.setItem(PLATFORM_RELEASE_STORAGE, PLATFORM_BUILD); } catch (err) {}
}

function handlePlatformDeepLink() {
  var params;
  try { params = new URLSearchParams(window.location.search || ''); } catch (err) { return; }
  var target = params.get('open');
  if (!target || typeof state === 'undefined') return;
  if (target === 'today') {
    state.activeTab = 'home';
    window.setTimeout(function () { if (typeof openEditor === 'function') openEditor(new Date()); }, 300);
  } else if (target === 'calendar') {
    state.activeTab = 'calendar';
  } else if (target === 'payslips') {
    state.activeTab = 'payslips';
  }
  if (typeof render === 'function') render();
  try {
    params.delete('open');
    var clean = window.location.pathname + (params.toString() ? ('?' + params.toString()) : '');
    window.history.replaceState({}, '', clean);
  } catch (err) {}
}

function initializePlatformServices() {
  registerGestOreServiceWorker();
  if (navigator.storage && typeof navigator.storage.persist === 'function') {
    navigator.storage.persist().catch(function () {});
  }
  window.addEventListener('online', function () {
    platformState.online = true;
    if (typeof bootstrapServerState === 'function') bootstrapServerState();
    if (typeof render === 'function') render();
  });
  window.addEventListener('offline', function () {
    platformState.online = false;
    if (typeof render === 'function') render();
  });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && platformState.serviceWorker) {
      platformState.serviceWorker.update().catch(function () {});
    }
  });
  initializeReleaseNotes();
  var pendingCode = readPendingRecoveryCode();
  if (pendingCode) showRecoveryCode(pendingCode);
  window.addEventListener('gestore:account-ready', function () {
    if (!(window.GestOreNative && window.GestOreNative.isNative)) loadPlatformPushConfig(true);
    handlePlatformDeepLink();
  });
  if (typeof state !== 'undefined' && state.account && state.account.authenticated && !(window.GestOreNative && window.GestOreNative.isNative)) {
    loadPlatformPushConfig(true);
  }
}

async function loadPlatformHistory(force) {
  var bucket = platformState.history;
  if (bucket.loading || (!force && (bucket.loaded || bucket.error))) return;
  bucket.loading = true;
  bucket.error = '';
  if (typeof render === 'function') render();
  try {
    var payload = await readPlatformJson(await fetch(PLATFORM_HISTORY_URL + '?limit=24', { cache: 'no-store' }));
    bucket.items = Array.isArray(payload.items) ? payload.items : [];
    bucket.loaded = true;
  } catch (err) {
    bucket.error = err.message || 'Cronologia non disponibile.';
  } finally {
    bucket.loading = false;
    if (typeof render === 'function') render();
  }
}

async function undoPlatformHistory(historyId) {
  var bucket = platformState.history;
  if (bucket.busyId) return;
  bucket.busyId = String(historyId || '');
  var loadingToken = window.GestOreLoading ? window.GestOreLoading.begin({
    title: 'Ripristino modifica',
    message: 'Ricostruisco i dati senza perdere lo stato attuale',
    delay: 180,
    minVisible: 520
  }) : '';
  if (typeof render === 'function') render();
  try {
    await readPlatformJson(await fetch(PLATFORM_HISTORY_URL + '/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ historyId: historyId })
    }));
    if (typeof bootstrapServerState === 'function') await bootstrapServerState();
    bucket.loaded = false;
    await loadPlatformHistory(true);
    showPlatformMessage('Modifica annullata. I dati precedenti sono stati ripristinati.');
  } catch (err) {
    bucket.error = err.message || 'Impossibile annullare la modifica.';
  } finally {
    bucket.busyId = '';
    if (loadingToken && window.GestOreLoading) window.GestOreLoading.end(loadingToken);
    if (typeof render === 'function') render();
  }
}

async function loadPlatformDiagnostics(force) {
  var bucket = platformState.diagnostics;
  if (bucket.loading || (!force && (bucket.loaded || bucket.error))) return;
  bucket.loading = true;
  bucket.error = '';
  if (typeof render === 'function') render();
  try {
    bucket.value = await readPlatformJson(await fetch(PLATFORM_DIAGNOSTICS_URL, { cache: 'no-store' }));
    bucket.loaded = true;
  } catch (err) {
    bucket.error = err.message || 'Diagnostica non disponibile.';
  } finally {
    bucket.loading = false;
    if (typeof render === 'function') render();
  }
}

async function loadPlatformSessions(force) {
  var bucket = platformState.sessions;
  if (bucket.loading || (!force && (bucket.loaded || bucket.error))) return;
  bucket.loading = true;
  bucket.error = '';
  if (typeof render === 'function') render();
  try {
    var payload = await readPlatformJson(await fetch(PLATFORM_SESSIONS_URL, { cache: 'no-store' }));
    bucket.items = Array.isArray(payload.sessions) ? payload.sessions : [];
    bucket.loaded = true;
  } catch (err) {
    bucket.error = err.message || 'Sessioni non disponibili.';
  } finally {
    bucket.loading = false;
    if (typeof render === 'function') render();
  }
}

async function revokePlatformSession(sessionId) {
  var bucket = platformState.sessions;
  if (bucket.busyId) return;
  bucket.busyId = String(sessionId || '');
  if (typeof render === 'function') render();
  try {
    await readPlatformJson(await fetch(PLATFORM_SESSIONS_URL, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ sessionId: sessionId })
    }));
    bucket.loaded = false;
    await loadPlatformSessions(true);
    showPlatformMessage('Accesso revocato dal dispositivo.');
  } catch (err) {
    bucket.error = err.message || 'Impossibile revocare la sessione.';
  } finally {
    bucket.busyId = '';
    if (typeof render === 'function') render();
  }
}

async function issuePlatformRecoveryCode() {
  try {
    var payload = await readPlatformJson(await fetch(PLATFORM_RECOVERY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: '{}'
    }));
    showRecoveryCode(payload.recoveryCode || '');
  } catch (err) {
    showPlatformMessage(err.message || 'Codice di recupero non disponibile.');
  }
}

async function loadPlatformAudit(force) {
  var bucket = platformState.audit;
  if (bucket.loading || (!force && (bucket.loaded || bucket.error))) return;
  bucket.loading = true;
  bucket.error = '';
  if (typeof render === 'function') render();
  try {
    var payload = await readPlatformJson(await fetch(PLATFORM_AUDIT_URL + '?limit=40', { cache: 'no-store' }));
    bucket.items = Array.isArray(payload.items) ? payload.items : [];
    bucket.loaded = true;
  } catch (err) {
    bucket.error = err.message || 'Registro non disponibile.';
  } finally {
    bucket.loading = false;
    if (typeof render === 'function') render();
  }
}

function urlBase64ToUint8Array(base64String) {
  var padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  var rawData = window.atob(base64);
  return Uint8Array.from(Array.prototype.map.call(rawData, function (char) { return char.charCodeAt(0); }));
}

async function loadPlatformPushConfig(force) {
  var bucket = platformState.push;
  if (bucket.loading || (!force && (bucket.loaded || bucket.error))) return;
  if (typeof state === 'undefined' || !state.account || !state.account.authenticated) return;
  bucket.loading = true;
  bucket.error = '';
  try {
    var payload = await readPlatformJson(await fetch(PLATFORM_PUSH_URL + '/config', { cache: 'no-store' }));
    bucket.available = Boolean(payload.available && payload.publicKey);
    bucket.publicKey = String(payload.publicKey || '');
    bucket.subscriptions = Math.max(0, Number(payload.subscriptions) || 0);
    bucket.loaded = true;
  } catch (err) {
    bucket.error = err.message || 'Notifiche server non disponibili.';
  } finally {
    bucket.loading = false;
    if (typeof render === 'function') render();
  }
}

async function enablePlatformPush() {
  var bucket = platformState.push;
  if (bucket.busy) return;
  bucket.busy = true;
  bucket.error = '';
  if (typeof render === 'function') render();
  try {
    if (!bucket.loaded) await loadPlatformPushConfig(true);
    if (!bucket.available) throw new Error('Il server non dispone ancora del servizio Web Push.');
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      throw new Error('Le notifiche non sono supportate su questo dispositivo.');
    }
    var permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error('Permesso notifiche non concesso.');
    var registration = platformState.serviceWorker || await navigator.serviceWorker.ready;
    var subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(bucket.publicKey)
      });
    }
    await readPlatformJson(await fetch(PLATFORM_PUSH_URL + '/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ subscription: subscription.toJSON() })
    }));
    state.settings.remindersEnabled = true;
    state.settings.pushEnabled = true;
    state.settingsDraft.remindersEnabled = true;
    state.settingsDraft.pushEnabled = true;
    if (typeof saveSettings === 'function') saveSettings();
    bucket.loaded = false;
    await loadPlatformPushConfig(true);
    showPlatformMessage('Notifiche dal server attivate.');
  } catch (err) {
    bucket.error = err.message || 'Attivazione notifiche non riuscita.';
  } finally {
    bucket.busy = false;
    if (typeof render === 'function') render();
  }
}

async function disablePlatformPush() {
  var bucket = platformState.push;
  if (bucket.busy) return;
  bucket.busy = true;
  bucket.error = '';
  if (typeof render === 'function') render();
  try {
    var registration = platformState.serviceWorker || await navigator.serviceWorker.ready;
    var subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await readPlatformJson(await fetch(PLATFORM_PUSH_URL + '/subscribe', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ endpoint: subscription.endpoint })
      }));
      await subscription.unsubscribe();
    }
    state.settings.pushEnabled = false;
    state.settingsDraft.pushEnabled = false;
    if (typeof saveSettings === 'function') saveSettings();
    bucket.loaded = false;
    await loadPlatformPushConfig(true);
    showPlatformMessage('Notifiche dal server disattivate.');
  } catch (err) {
    bucket.error = err.message || 'Disattivazione non riuscita.';
  } finally {
    bucket.busy = false;
    if (typeof render === 'function') render();
  }
}

async function testPlatformPush() {
  var bucket = platformState.push;
  if (bucket.busy) return;
  bucket.busy = true;
  bucket.error = '';
  if (typeof render === 'function') render();
  try {
    var payload = await readPlatformJson(await fetch(PLATFORM_PUSH_URL + '/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: '{}'
    }));
    if (!payload.sent) throw new Error('Nessun dispositivo ha ricevuto la notifica.');
    showPlatformMessage('Notifica di prova inviata.');
  } catch (err) {
    bucket.error = err.message || 'Invio di prova non riuscito.';
  } finally {
    bucket.busy = false;
    if (typeof render === 'function') render();
  }
}

function renderDataHistorySettings() {
  var diagnostics = platformState.diagnostics;
  var value = diagnostics.value || {};
  var integrityTone = diagnostics.loaded && value.ok ? ' is-ok' : (diagnostics.error ? ' is-error' : '');
  var pending = typeof state !== 'undefined' && Boolean(state.syncPending);
  var diagnosticsHtml =
    '<div class="settings-v2-section-title">Controllo database</div>' +
    '<section class="platform-diagnostics' + integrityTone + '">' +
      '<span class="platform-diagnostics-icon">' + icons.activity + '</span>' +
      '<div><small>INTEGRITA E SINCRONIZZAZIONE</small><strong>' +
        (diagnostics.loading ? 'Controllo in corso...' : (diagnostics.loaded ? (value.ok ? 'Database integro' : 'Controllo necessario') : 'Verifica i tuoi dati')) +
      '</strong><p>' +
        (diagnostics.error ? escapeHtml(diagnostics.error) : (diagnostics.loaded
          ? ('SQLite ' + escapeHtml(String(value.integrity || '--')) + ' - ' + escapeHtml(formatPlatformBytes(value.bytes)) + ' - ' + escapeHtml(String(value.historyItems || 0)) + ' modifiche protette - ' + (pending ? 'invio locale in attesa' : 'sincronizzato'))
          : 'Controlla database, revisione server e coda locale in un unico passaggio.')) +
      '</p></div>' +
      '<button data-platform-diagnostics="1" ' + (diagnostics.loading ? 'disabled' : '') + '>' + icons.check + '<span>Verifica</span></button>' +
    '</section>';

  var history = platformState.history;
  var historyBody = history.loading
    ? '<div class="platform-empty">Carico la cronologia...</div>'
    : (history.error
      ? '<div class="platform-empty is-error">' + escapeHtml(history.error) + '</div>'
      : (history.items.length
        ? history.items.slice(0, 12).map(function (item) {
            return '<article class="platform-history-row' + (item.revertedAt ? ' is-reverted' : '') + '">' +
              '<span>' + (item.kind === 'payslip' ? icons.receipt : (item.kind === 'settings' ? icons.settings : icons.calendar)) + '</span>' +
              '<div><strong>' + escapeHtml(item.label || 'Modifica') + '</strong><small>' + escapeHtml(platformActionLabel(item.action)) + ' - ' + escapeHtml(formatPlatformDate(item.createdAt)) + (item.actor ? (' - ' + escapeHtml(item.actor)) : '') + '</small></div>' +
              (item.undoable ? '<button data-platform-history-undo="' + escapeHtml(item.id) + '" ' + (history.busyId ? 'disabled' : '') + '>' + icons.history + '<span>' + (history.busyId === item.id ? 'Ripristino...' : 'Annulla') + '</span></button>' : '<b>ANNULLATA</b>') +
            '</article>';
          }).join('')
        : '<div class="platform-empty">La cronologia iniziera dalla prossima modifica.</div>'));
  return diagnosticsHtml +
    '<div class="settings-v2-section-title">Cronologia e annullamento</div>' +
    '<section class="platform-history-card"><div class="platform-card-head"><div><strong>Ultime modifiche</strong><small>Puoi recuperare giornate, impostazioni e cedolini</small></div><button data-platform-history-refresh="1" aria-label="Aggiorna cronologia">' + icons.activity + '</button></div>' +
      '<div class="platform-history-list">' + historyBody + '</div>' +
    '</section>';
}

function renderAccountSecuritySettings() {
  var push = platformState.push;
  var pushEnabled = Boolean(typeof state !== 'undefined' && state.settings && state.settings.pushEnabled && push.subscriptions);
  var pushHelp = push.error
    ? escapeHtml(push.error)
    : (push.loading ? 'Controllo disponibilita...' : (push.available
      ? (pushEnabled ? 'Attive anche quando GestOre e chiusa' : 'Ricevi riepiloghi anche con l app chiusa')
      : 'Disponibili dopo il prossimo aggiornamento del server'));
  return (typeof renderPasskeySettings === 'function' ? renderPasskeySettings() : '') +
    '<div class="settings-v2-section-title">Notifiche dal server</div>' +
    '<section class="settings-v2-group platform-push-card">' +
      '<div class="settings-v2-toggle-row"><span class="settings-v2-icon is-violet">' + icons.bell + '</span><span class="settings-v2-copy"><strong>Avvisi anche ad app chiusa</strong><small>' + pushHelp + '</small></span><button role="switch" class="toggle-btn ' + (pushEnabled ? 'on' : '') + '" data-platform-push-toggle="1" aria-label="Avvisi anche ad app chiusa" aria-checked="' + (pushEnabled ? 'true' : 'false') + '" aria-pressed="' + (pushEnabled ? 'true' : 'false') + '" ' + (push.busy || !push.available ? 'disabled' : '') + '><span class="knob"></span></button></div>' +
      (pushEnabled ? '<div class="settings-v2-divider"></div><button class="platform-inline-action" data-platform-push-test="1" ' + (push.busy ? 'disabled' : '') + '>' + icons.bell + '<span>Invia una notifica di prova</span>' + icons.right + '</button>' : '') +
    '</section>' +
    '<div class="settings-v2-section-title">Recupero account</div>' +
    '<section class="platform-security-action"><span>' + icons.lock + '</span><div><strong>Codice di recupero</strong><p>Genera un codice nuovo e conservalo fuori da GestOre. Quello precedente verra disattivato.</p></div><button data-platform-recovery-code="1">Genera codice</button></section>';
}

function renderOwnerAuditSettings() {
  var audit = platformState.audit;
  var body = audit.loading
    ? '<div class="platform-empty">Carico il registro...</div>'
    : (audit.error
      ? '<div class="platform-empty is-error">' + escapeHtml(audit.error) + '</div>'
      : (audit.items.length
        ? audit.items.slice(0, 24).map(function (item) {
            return '<article class="platform-audit-row"><span>' + icons.history + '</span><div><strong>' + escapeHtml(platformAuditLabel(item.action)) + '</strong><small>' + escapeHtml(item.actor || 'Sistema') + (item.target && item.target !== item.actor ? (' su ' + escapeHtml(item.target)) : '') + ' - ' + escapeHtml(formatPlatformDate(item.createdAt)) + '</small></div></article>';
          }).join('')
        : '<div class="platform-empty">Nessuna attivita registrata.</div>'));
  return '<div class="settings-v2-section-title">Registro proprietario</div>' +
    '<section class="platform-audit-card"><div class="platform-card-head"><div><strong>Attivita e sicurezza</strong><small>Accessi, backup e operazioni amministrative</small></div><button data-platform-audit-refresh="1" aria-label="Aggiorna registro proprietario">' + icons.activity + '</button></div><div>' + body + '</div></section>';
}

function renderPlatformOverlays() {
  var update = platformState.updateAvailable
    ? '<aside class="platform-update-toast" role="status"><span>' + icons.download + '</span><div><strong>Aggiornamento pronto</strong><small>Installa la nuova versione senza perdere dati</small></div><button data-platform-update="1" ' + (platformState.updateBusy ? 'disabled' : '') + '>' + (platformState.updateBusy ? 'Aggiorno...' : 'Aggiorna') + '</button></aside>'
    : '';
  var release = platformState.releaseOpen
    ? '<div class="platform-overlay" role="dialog" aria-modal="true" aria-labelledby="platformReleaseTitle"><section class="platform-release-dialog"><button data-platform-release-close="1" aria-label="Chiudi">' + icons.x + '</button><span class="platform-release-icon">' + icons.check + '</span><small>GESTORE ' + escapeHtml(PLATFORM_BUILD.split('-')[0]) + '</small><h2 id="platformReleaseTitle">Cosa c&apos;e di nuovo</h2><div>' + PLATFORM_RELEASE_NOTES.map(function (note) { return '<p><span>' + icons.check + '</span>' + escapeHtml(note) + '</p>'; }).join('') + '</div><button class="is-primary" data-platform-release-close="1">Continua</button></section></div>'
    : '';
  var recovery = platformState.recoveryOpen && platformState.recoveryCode
    ? '<div class="platform-overlay" role="dialog" aria-modal="true" aria-labelledby="platformRecoveryTitle"><section class="platform-recovery-dialog"><span class="platform-release-icon">' + icons.lock + '</span><small>CODICE PERSONALE</small><h2 id="platformRecoveryTitle">Salva questo codice</h2><p>Serve per recuperare l&apos;account se dimentichi la password. Viene mostrato soltanto ora.</p><strong data-platform-recovery-value>' + escapeHtml(platformState.recoveryCode) + '</strong><div><button data-platform-copy-recovery="1">' + icons.note + '<span>Copia codice</span></button><button class="is-primary" data-platform-recovery-close="1">L&apos;ho salvato</button></div></section></div>'
    : '';
  var message = platformState.message
    ? '<aside class="platform-message" role="status"><span>' + icons.check + '</span><p>' + escapeHtml(platformState.message) + '</p></aside>'
    : '';
  var offline = !platformState.online
    ? '<aside class="platform-offline" role="status"><span>' + icons.cloud + '</span><div><strong>Modalita offline</strong><small>Puoi continuare: sincronizzo appena torna la connessione.</small></div></aside>'
    : '';
  return update + release + recovery + message + offline;
}

function bindPlatformEvents() {
  document.querySelectorAll('[data-platform-update]').forEach(function (button) {
    button.onclick = applyGestOreUpdate;
  });
  document.querySelectorAll('[data-platform-release-close]').forEach(function (button) {
    button.onclick = function () { platformState.releaseOpen = false; render(); };
  });
  document.querySelectorAll('[data-platform-recovery-close]').forEach(function (button) {
    button.onclick = function () {
      platformState.recoveryOpen = false;
      platformState.recoveryCode = '';
      render();
    };
  });
  document.querySelectorAll('[data-platform-copy-recovery]').forEach(function (button) {
    button.onclick = async function () {
      try {
        await navigator.clipboard.writeText(platformState.recoveryCode);
        showPlatformMessage('Codice copiato.');
      } catch (err) {
        showPlatformMessage('Tieni premuto sul codice per copiarlo.');
      }
    };
  });
  document.querySelectorAll('[data-platform-diagnostics]').forEach(function (button) {
    button.onclick = function () { loadPlatformDiagnostics(true); };
  });
  document.querySelectorAll('[data-platform-history-refresh]').forEach(function (button) {
    button.onclick = function () { loadPlatformHistory(true); };
  });
  document.querySelectorAll('[data-platform-history-undo]').forEach(function (button) {
    button.onclick = function () { undoPlatformHistory(button.dataset.platformHistoryUndo); };
  });
  document.querySelectorAll('[data-platform-sessions-refresh]').forEach(function (button) {
    button.onclick = function () { loadPlatformSessions(true); };
  });
  document.querySelectorAll('[data-platform-session-revoke]').forEach(function (button) {
    button.onclick = function () { revokePlatformSession(button.dataset.platformSessionRevoke); };
  });
  document.querySelectorAll('[data-platform-recovery-code]').forEach(function (button) {
    button.onclick = issuePlatformRecoveryCode;
  });
  document.querySelectorAll('[data-platform-audit-refresh]').forEach(function (button) {
    button.onclick = function () { loadPlatformAudit(true); };
  });
  document.querySelectorAll('[data-platform-push-toggle]').forEach(function (button) {
    button.onclick = function () {
      var enabled = Boolean(state.settings && state.settings.pushEnabled && platformState.push.subscriptions);
      if (enabled) disablePlatformPush();
      else enablePlatformPush();
    };
  });
  document.querySelectorAll('[data-platform-push-test]').forEach(function (button) {
    button.onclick = testPlatformPush;
  });

  if (typeof state !== 'undefined' && state.activeTab === 'settings') {
    if (state.settingsSection === 'data') {
      loadPlatformHistory(false);
      loadPlatformDiagnostics(false);
    } else if (state.settingsSection === 'privacy') {
      loadPlatformSessions(false);
      loadPlatformPushConfig(false);
    } else if (state.settingsSection === 'accounts') {
      loadPlatformAudit(false);
    }
  }
}
