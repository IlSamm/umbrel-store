var ACCOUNT_STATUS_URL = '/api/auth/status';
var ACCOUNT_REGISTER_URL = '/api/auth/register';
var ACCOUNT_LOGIN_URL = '/api/auth/login';
var ACCOUNT_LOGOUT_URL = '/api/auth/logout';
var ACCOUNT_BACKUP_URL = '/api/backup';
var ACCOUNT_RESTORE_URL = '/api/backup/restore';
var ACCOUNT_STORAGE_URL = '/api/storage';
var ACCOUNT_ADMIN_URL = '/api/admin/accounts';
var ACCOUNT_ADMIN_ACCESS_URL = '/api/admin/access';
var ACCOUNT_ADMIN_RETURN_URL = '/api/admin/return';
var STORAGE_ACTIVE_ACCOUNT = 'gestore-active-account-v1';

function beginAccountTransfer(title, message) {
  if (!window.GestOreLoading) return '';
  return window.GestOreLoading.begin({
    title: title,
    message: message,
    kind: 'account',
    delay: 0,
    minVisible: 620,
    dismissKeyboard: true
  });
}

function endAccountTransfer(token) {
  if (token && window.GestOreLoading) window.GestOreLoading.end(token);
}

state.account = {
  loaded: false,
  dataReady: false,
  dataError: '',
  authenticated: false,
  setupRequired: false,
  hasAccounts: false,
  hasLegacyData: false,
  user: null,
  mode: 'login',
  busy: false,
  error: '',
  notice: '',
  storage: {
    loaded: false,
    loading: false,
    bytes: 0,
    databaseBytes: 0,
    journalBytes: 0,
    entries: 0,
    payslips: 0,
    updatedAt: 0,
    error: ''
  },
  adminAccounts: null,
  adminLoading: false,
  deleteCandidate: null
};

function clearGestOreDeviceCache() {
  try {
    var keys = [];
    for (var i = 0; i < localStorage.length; i += 1) keys.push(localStorage.key(i));
    keys.forEach(function (key) {
      if (key && key.indexOf('gestore-') === 0) localStorage.removeItem(key);
    });
  } catch (err) {}
}

function resetRuntimeAccountData() {
  state.entries = {};
  state.settings = normalizeRuntimeSettings({});
  state.settingsDraft = Object.assign({}, state.settings);
  state.payslips = [];
  state.payslipDraft = null;
  state.payslipDetailId = '';
  state.payslipEditorOpen = false;
  state.privacyLocked = false;
  state.syncStatus = 'In attesa di accesso';
  state.lastSyncedAt = 0;
  if (state.account && state.account.storage) {
    state.account.storage = {
      loaded: false,
      loading: false,
      bytes: 0,
      databaseBytes: 0,
      journalBytes: 0,
      entries: 0,
      payslips: 0,
      updatedAt: 0,
      error: ''
    };
  }
}

function activateAccountOnDevice(userId) {
  clearGestOreDeviceCache();
  try { localStorage.setItem(STORAGE_ACTIVE_ACCOUNT, String(userId || '')); } catch (err) {}
  resetRuntimeAccountData();
}

function prepareDeviceForAuthenticatedUser(user) {
  var nextId = String(user && user.id || '');
  var previousId = '';
  try { previousId = String(localStorage.getItem(STORAGE_ACTIVE_ACCOUNT) || ''); } catch (err) {}
  if (!nextId) return;
  if (previousId !== nextId) activateAccountOnDevice(nextId);
}

async function readJsonResponse(response) {
  var payload = {};
  try { payload = await response.json(); } catch (err) {}
  if (!response.ok) {
    var error = new Error(payload.error || 'Operazione non riuscita.');
    error.code = payload.code || '';
    error.status = response.status;
    throw error;
  }
  return payload;
}

function formatAccountStorageBytes(value) {
  var bytes = Math.max(0, Number(value) || 0);
  if (bytes < 1024) return Math.round(bytes) + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toLocaleString('it-IT', { maximumFractionDigits: 1 }) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toLocaleString('it-IT', { maximumFractionDigits: 2 }) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toLocaleString('it-IT', { maximumFractionDigits: 2 }) + ' GB';
}

async function loadAccountStorageUsage(force) {
  var storage = state.account && state.account.storage;
  if (!storage || storage.loading || (!force && storage.loaded) || !state.account.authenticated) return;
  storage.loading = true;
  storage.error = '';
  if (typeof render === 'function') render();
  try {
    var response = await fetch(ACCOUNT_STORAGE_URL, { cache: 'no-store' });
    var payload = await readJsonResponse(response);
    state.account.storage = {
      loaded: true,
      loading: false,
      bytes: Math.max(0, Number(payload.bytes) || 0),
      databaseBytes: Math.max(0, Number(payload.databaseBytes) || 0),
      journalBytes: Math.max(0, Number(payload.journalBytes) || 0),
      entries: Math.max(0, Number(payload.entries) || 0),
      payslips: Math.max(0, Number(payload.payslips) || 0),
      updatedAt: Math.max(0, Number(payload.updatedAt) || 0),
      error: ''
    };
  } catch (err) {
    storage.loading = false;
    storage.loaded = false;
    storage.error = err.message || 'Spazio database non disponibile.';
  }
  if (typeof render === 'function') render();
}

async function bootstrapAccountSession() {
  state.account.dataReady = false;
  state.account.dataError = '';
  try {
    var response = await fetch(ACCOUNT_STATUS_URL, { cache: 'no-store' });
    var payload = await readJsonResponse(response);
    state.account.loaded = true;
    state.account.authenticated = Boolean(payload.authenticated && payload.user);
    state.account.setupRequired = Boolean(payload.setupRequired);
    state.account.hasAccounts = Boolean(payload.hasAccounts);
    state.account.hasLegacyData = Boolean(payload.hasLegacyData);
    state.account.user = payload.user || null;
    state.account.mode = payload.setupRequired ? 'register' : 'login';
    state.account.error = '';

    if (state.account.authenticated) {
      prepareDeviceForAuthenticatedUser(state.account.user);
      var databaseReady = await bootstrapServerState();
      if (!databaseReady) {
        state.account.dataError = getServerSyncFailureMessage();
        if (typeof render === 'function') render();
        return;
      }
      if (String(state.settings.userName || '') === 'Utente' && state.account.user.username) {
        state.settings.userName = state.account.user.username;
        state.settingsDraft = Object.assign({}, state.settings);
        saveSettings();
      }
      state.account.dataReady = true;
      state.account.dataError = '';
      return;
    }

    serverSyncReady = false;
    if (state.account.hasAccounts) {
      clearGestOreDeviceCache();
      resetRuntimeAccountData();
    }
    state.account.dataReady = true;
    if (typeof render === 'function') render();
  } catch (err) {
    // Older/offline installations keep the existing single-user behavior.
    state.account.loaded = true;
    state.account.authenticated = true;
    state.account.user = null;
    state.account.notice = 'Server account non disponibile: modalita locale attiva.';
    await bootstrapServerState();
    state.account.dataReady = true;
  } finally {
    var splashStatus = document.getElementById('splashStatusText');
    if (splashStatus) splashStatus.textContent = state.account.dataReady ? 'Dati pronti' : 'Connessione da riprovare';
    if (typeof render === 'function') render();
    window.dispatchEvent(new CustomEvent('gestore:account-ready'));
  }
}

async function retryAccountDataLoad() {
  if (!state.account.authenticated || state.account.busy) return;
  setAccountUiState({ busy: true, dataReady: false, dataError: '', error: '' });
  var ready = await bootstrapServerState();
  setAccountUiState({
    busy: false,
    dataReady: Boolean(ready),
    dataError: ready ? '' : getServerSyncFailureMessage()
  });
}

function setAccountUiState(values) {
  state.account = Object.assign({}, state.account, values || {});
  if (typeof render === 'function') render();
}

function handleAccountUnauthorized() {
  serverSyncReady = false;
  state.account = Object.assign({}, state.account, {
    loaded: true,
    dataReady: true,
    dataError: '',
    authenticated: false,
    hasAccounts: true,
    setupRequired: false,
    user: null,
    mode: 'login',
    busy: false,
    notice: '',
    error: 'La sessione e scaduta. I dati presenti sul dispositivo sono rimasti intatti: accedi di nuovo per sincronizzarli.'
  });
  if (typeof render === 'function') render();
}

async function submitAccountRegistration(form) {
  if (state.account.busy) return;
  var username = String(form.querySelector('[name="username"]').value || '').trim();
  var password = String(form.querySelector('[name="password"]').value || '');
  var confirmPassword = String(form.querySelector('[name="confirmPassword"]').value || '');
  if (password !== confirmPassword) {
    setAccountUiState({ error: 'Le due password non coincidono.' });
    return;
  }
  setAccountUiState({ busy: true, error: '', notice: 'Creazione del database personale...' });
  try {
    var response = await fetch(ACCOUNT_REGISTER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ username: username, password: password, snapshot: buildStateSnapshot({ includePayslipPhotos: true }) })
    });
    var payload = await readJsonResponse(response);
    activateAccountOnDevice(payload.user && payload.user.id);
    window.location.reload();
  } catch (err) {
    setAccountUiState({ busy: false, notice: '', error: err.message || 'Registrazione non riuscita.' });
  }
}

async function submitAccountLogin(form) {
  if (state.account.busy) return;
  var username = String(form.querySelector('[name="username"]').value || '').trim();
  var password = String(form.querySelector('[name="password"]').value || '');
  setAccountUiState({ busy: true, error: '', notice: 'Apertura del tuo database...' });
  try {
    var response = await fetch(ACCOUNT_LOGIN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ username: username, password: password })
    });
    var payload = await readJsonResponse(response);
    activateAccountOnDevice(payload.user && payload.user.id);
    window.location.reload();
  } catch (err) {
    setAccountUiState({ busy: false, notice: '', error: err.message || 'Accesso non riuscito.' });
  }
}

async function logoutAccount() {
  if (state.account.busy) return;
  setAccountUiState({ busy: true, error: '', notice: 'Salvataggio in corso...' });
  var confirmed = false;
  try { confirmed = await flushServerSyncNow(); } catch (err) {}
  if (!confirmed) {
    setAccountUiState({ busy: false, notice: '', error: 'Non esco finche il database non conferma l\'ultimo salvataggio. Riprova tra un momento.' });
    return;
  }
  try {
    await fetch(ACCOUNT_LOGOUT_URL, { method: 'POST', cache: 'no-store' });
  } catch (err) {}
  clearGestOreDeviceCache();
  resetRuntimeAccountData();
  window.location.reload();
}

function getDownloadFilename(response, fallback) {
  var disposition = String(response.headers.get('Content-Disposition') || '');
  var match = disposition.match(/filename="?([^";]+)"?/i);
  return match && match[1] ? match[1] : fallback;
}

async function downloadAccountBackup() {
  if (state.account.busy) return;
  setAccountUiState({ busy: true, error: '', notice: 'Preparazione del database...' });
  var loadingToken = beginAccountTransfer('Preparo il backup', 'Raccolgo e verifico tutti i dati del profilo');
  try {
    if (!await flushServerSyncNow()) throw new Error(getServerSyncFailureMessage());
    var response = await fetch(ACCOUNT_BACKUP_URL, { cache: 'no-store' });
    if (!response.ok) await readJsonResponse(response);
    var blob = await response.blob();
    var filename = getDownloadFilename(response, 'GestOre_Backup.sqlite3');
    downloadBlobFile(filename, blob);
    setAccountUiState({ busy: false, error: '', notice: 'Backup scaricato sul telefono.' });
  } catch (err) {
    setAccountUiState({ busy: false, notice: '', error: err.message || 'Impossibile creare il backup.' });
  } finally {
    endAccountTransfer(loadingToken);
  }
}

async function restoreAccountBackup(file) {
  if (!file || state.account.busy) return;
  if (!window.confirm('Ripristinare questo backup? I dati attuali dell\'account verranno sostituiti.')) return;
  setAccountUiState({ busy: true, error: '', notice: 'Controllo e ripristino del database...' });
  var loadingToken = beginAccountTransfer('Ripristino del backup', 'Verifico il file e ricostruisco il database');
  try {
    var response = await fetch(ACCOUNT_RESTORE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/vnd.sqlite3' },
      cache: 'no-store',
      body: file
    });
    await readJsonResponse(response);
    var activeId = state.account.user && state.account.user.id;
    activateAccountOnDevice(activeId);
    window.location.reload();
  } catch (err) {
    setAccountUiState({ busy: false, notice: '', error: err.message || 'Ripristino non riuscito.' });
  } finally {
    endAccountTransfer(loadingToken);
  }
}

async function loadAdminAccounts() {
  var user = state.account.user || {};
  if (!user.canManageAccounts || state.account.adminLoading) return;
  setAccountUiState({ adminLoading: true, error: '' });
  try {
    var response = await fetch(ACCOUNT_ADMIN_URL, { cache: 'no-store' });
    var payload = await readJsonResponse(response);
    setAccountUiState({ adminLoading: false, adminAccounts: payload.accounts || [], error: '' });
  } catch (err) {
    setAccountUiState({ adminLoading: false, adminAccounts: [], error: err.message || 'Impossibile caricare gli account.' });
  }
}

async function openManagedAccount(userId) {
  if (!userId || state.account.busy) return;
  setAccountUiState({ busy: true, error: '', notice: 'Apertura del database selezionato...' });
  var loadingToken = beginAccountTransfer('Cambio profilo', 'Salvo i dati attuali e apro il database selezionato');
  try {
    if (!await flushServerSyncNow()) throw new Error(getServerSyncFailureMessage());
    var response = await fetch(ACCOUNT_ADMIN_ACCESS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ userId: userId })
    });
    var payload = await readJsonResponse(response);
    activateAccountOnDevice(payload.user && payload.user.id);
    window.location.reload();
  } catch (err) {
    setAccountUiState({ busy: false, notice: '', error: err.message || 'Impossibile aprire questo account.' });
  } finally {
    endAccountTransfer(loadingToken);
  }
}

async function returnToOwnerAccount() {
  if (state.account.busy) return;
  setAccountUiState({ busy: true, error: '', notice: 'Ritorno al profilo Proprietario...' });
  var loadingToken = beginAccountTransfer('Torno al Proprietario', 'Confermo i dati e riapro il tuo profilo');
  try {
    if (!await flushServerSyncNow()) throw new Error(getServerSyncFailureMessage());
    var response = await fetch(ACCOUNT_ADMIN_RETURN_URL, { method: 'POST', cache: 'no-store' });
    var payload = await readJsonResponse(response);
    activateAccountOnDevice(payload.user && payload.user.id);
    window.location.reload();
  } catch (err) {
    setAccountUiState({ busy: false, notice: '', error: err.message || 'Impossibile tornare al Proprietario.' });
  } finally {
    endAccountTransfer(loadingToken);
  }
}

function chooseAccountForDeletion(userId) {
  var account = (state.account.adminAccounts || []).find(function (item) { return item.id === userId; });
  if (!account || account.role === 'owner') return;
  setAccountUiState({ deleteCandidate: account, error: '', notice: '' });
}

async function deleteManagedAccount(form) {
  var account = state.account.deleteCandidate;
  if (!account || state.account.busy) return;
  var confirmation = String(form.querySelector('[name="accountConfirmation"]').value || '').trim();
  if (confirmation !== String(account.username || '')) {
    setAccountUiState({ error: 'Scrivi esattamente ' + account.username + ' per confermare.' });
    return;
  }
  setAccountUiState({ busy: true, error: '', notice: 'Eliminazione definitiva in corso...' });
  try {
    var response = await fetch(ACCOUNT_ADMIN_URL, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ userId: account.id, confirmation: confirmation })
    });
    await readJsonResponse(response);
    state.account.deleteCandidate = null;
    state.account.adminAccounts = null;
    setAccountUiState({ busy: false, notice: 'Account ' + account.username + ' eliminato definitivamente.', error: '' });
    loadAdminAccounts();
  } catch (err) {
    setAccountUiState({ busy: false, notice: '', error: err.message || 'Eliminazione non riuscita.' });
  }
}

function formatAccountActivity(timestamp) {
  var value = Number(timestamp) || 0;
  if (!value) return 'Mai aperto';
  try {
    return 'Ultimo accesso ' + new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
  } catch (err) {
    return 'Accesso registrato';
  }
}

function renderAccountGate() {
  if (state.account.authenticated && state.account.dataReady) return '';
  if (state.account.authenticated && state.account.dataError) {
    return '<div class="account-gate"><div class="account-gate-panel account-data-loading"><div class="account-brand"><span class="account-brand-icon">' + icons.user + '</span><div><span>DATABASE PERSONALE</span><div>Gest<strong>Ore</strong></div></div></div><div class="account-gate-copy"><span>CONNESSIONE</span><h1>I dati sono al sicuro</h1><p>' + escapeHtml(state.account.dataError) + ' Non mostro una Home vuota: riproviamo ad aprire il database corretto.</p></div><button class="account-primary" type="button" data-retry-account-data="1" ' + (state.account.busy ? 'disabled' : '') + '>' + (state.account.busy ? 'Riprovo...' : 'Riprova ora') + '</button></div></div>';
  }
  if (state.account.authenticated && !state.account.dataReady) {
    return '<div class="account-gate"><div class="account-gate-panel account-data-loading"><div class="account-brand"><span class="account-brand-icon">' + icons.user + '</span><div><span>DATABASE PERSONALE</span><div>Gest<strong>Ore</strong></div></div></div><div class="account-gate-copy"><span>CARICAMENTO</span><h1>Recupero i tuoi dati</h1><p>Ore e buste restano protette mentre apro il profilo corretto.</p></div><div class="account-admin-loading"><span></span><strong>Sincronizzazione sicura</strong><small>Non chiudere l\'app</small></div></div></div>';
  }
  if (!state.account.loaded) return '';
  var registerMode = state.account.mode === 'register';
  var firstSetup = state.account.setupRequired;
  var title = registerMode ? (firstSetup ? 'Crea il tuo account' : 'Nuovo account') : 'Bentornato';
  var copy = registerMode
    ? (firstSetup && state.account.hasLegacyData ? 'I dati gia presenti verranno collegati automaticamente a questo primo account.' : 'Ogni account usa un database personale e separato.')
    : 'Accedi con il tuo nome utente per aprire il database corretto.';
  var status = state.account.error
    ? '<div class="account-form-message is-error">' + escapeHtml(state.account.error) + '</div>'
    : (state.account.notice ? '<div class="account-form-message">' + escapeHtml(state.account.notice) + '</div>' : '');
  return '<div class="account-gate"><div class="account-gate-panel">' +
    '<div class="account-brand"><span class="account-brand-icon">' + icons.user + '</span><div><span>GESTORE PERSONALE</span><div>Gest<strong>Ore</strong></div></div></div>' +
    '<div class="account-gate-copy"><span>' + (registerMode ? 'REGISTRAZIONE' : 'ACCESSO') + '</span><h1>' + title + '</h1><p>' + copy + '</p></div>' +
    '<form class="account-form" data-account-form="' + (registerMode ? 'register' : 'login') + '">' +
      '<label><span>Nome utente</span><input name="username" type="text" minlength="3" maxlength="24" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="es. samuele" required></label>' +
      '<label><span>Password</span><input name="password" type="password" minlength="8" maxlength="128" autocomplete="' + (registerMode ? 'new-password' : 'current-password') + '" placeholder="Almeno 8 caratteri" required></label>' +
      (registerMode ? '<label><span>Ripeti password</span><input name="confirmPassword" type="password" minlength="8" maxlength="128" autocomplete="new-password" placeholder="Ripeti la password" required></label>' : '') +
      status +
      '<button class="account-primary" type="submit" ' + (state.account.busy ? 'disabled' : '') + '>' + (state.account.busy ? 'Attendi...' : (registerMode ? 'Crea account' : 'Accedi')) + '</button>' +
    '</form>' +
    (firstSetup ? '' : '<button class="account-mode-switch" data-account-mode="' + (registerMode ? 'login' : 'register') + '">' + (registerMode ? 'Hai gia un account? Accedi' : 'Non hai un account? Registrati') + '</button>') +
    '<div class="account-security-note">' + icons.lock + '<span>Password protetta e database separato per ogni utente.</span></div>' +
  '</div></div>';
}

function renderAdminAccountsSettings() {
  var user = state.account.user || {};
  if (!user.canManageAccounts || user.impersonating) {
    return '<section class="account-admin-empty">' + icons.lock + '<strong>Area riservata</strong><p>Solo il profilo Proprietario puo gestire gli account.</p></section>';
  }
  var accounts = state.account.adminAccounts;
  var message = state.account.error
    ? '<div class="account-settings-message is-error">' + escapeHtml(state.account.error) + '</div>'
    : (state.account.notice ? '<div class="account-settings-message">' + escapeHtml(state.account.notice) + '</div>' : '');
  if (state.account.adminLoading || accounts === null) {
    return '<section class="account-admin-loading"><span></span><strong>Carico gli account</strong><small>Nessun dato viene condiviso tra i profili</small></section>' + message;
  }
  var rows = accounts.map(function (account) {
    var isOwner = account.role === 'owner';
    var isCurrent = account.id === user.id;
    var initial = String(account.username || 'U').charAt(0).toUpperCase();
    return '<article class="account-admin-row ' + (isOwner ? 'is-owner' : '') + '">' +
      '<div class="account-admin-avatar">' + escapeHtml(initial) + '</div>' +
      '<div class="account-admin-copy"><div><strong>' + escapeHtml(account.username || 'Utente') + '</strong><span class="' + (isOwner ? 'is-owner' : '') + '">' + (isOwner ? 'PROPRIETARIO' : 'UTENTE') + '</span></div>' +
        '<p>' + escapeHtml(formatAccountActivity(account.lastSeenAt)) + '</p>' +
        '<div class="account-admin-stats"><span>' + Number(account.entries || 0) + ' giornate</span><span>' + Number(account.payslips || 0) + ' buste</span></div>' +
      '</div>' +
      '<div class="account-admin-actions">' +
        (isCurrent ? '<span class="account-admin-current">ATTIVO</span>' : '<button class="account-admin-open" data-admin-open-account="' + account.id + '">' + icons.right + '<span>Apri</span></button>') +
        (isOwner ? '' : '<button class="account-admin-delete" data-admin-delete-account="' + account.id + '" aria-label="Elimina ' + escapeHtml(account.username || 'account') + '">' + icons.trash + '</button>') +
      '</div>' +
    '</article>';
  }).join('');
  return '<section class="account-owner-card"><span>' + icons.lock + '</span><div><small>ACCESSO PROPRIETARIO</small><strong>Solo tu puoi entrare qui</strong><p>Le password non sono visibili. Quando apri un profilo usi una sessione amministrativa temporanea.</p></div></section>' +
    '<div class="settings-v2-section-title">Profili registrati</div>' +
    '<section class="account-admin-list">' + rows + '</section>' + message +
    '<section class="account-admin-warning">' + icons.lock + '<p>L&apos;eliminazione rimuove definitivamente profilo, sessioni e database. Il Proprietario non puo essere cancellato.</p></section>';
}

function renderAdminSessionUi() {
  var user = state.account.user || {};
  var candidate = state.account.deleteCandidate;
  var banner = user.impersonating && user.owner
    ? '<aside class="account-admin-session"><div><small>MODALITA PROPRIETARIO</small><strong>Stai gestendo ' + escapeHtml(user.username || 'un account') + '</strong></div><button data-admin-return="1">Torna a ' + escapeHtml(user.owner.username || 'Proprietario') + '</button></aside>'
    : '';
  if (!candidate) return banner;
  var error = state.account.error ? '<div class="account-delete-error">' + escapeHtml(state.account.error) + '</div>' : '';
  return banner + '<div class="account-delete-overlay" role="dialog" aria-modal="true" aria-labelledby="accountDeleteTitle"><form class="account-delete-dialog" data-admin-delete-form="1">' +
    '<button type="button" class="account-delete-close" data-admin-delete-cancel="1" aria-label="Chiudi">' + icons.x + '</button>' +
    '<span class="account-delete-icon">' + icons.trash + '</span><small>ELIMINAZIONE DEFINITIVA</small><h2 id="accountDeleteTitle">Eliminare ' + escapeHtml(candidate.username || 'questo account') + '?</h2>' +
    '<p>Verranno cancellati il profilo, tutte le sessioni e il suo database. Questa operazione non puo essere annullata.</p>' +
    '<label><span>Scrivi <b>' + escapeHtml(candidate.username || '') + '</b> per confermare</span><input name="accountConfirmation" type="text" autocomplete="off" autocapitalize="none" spellcheck="false" required></label>' +
    error + '<div class="account-delete-actions"><button type="button" data-admin-delete-cancel="1">Annulla</button><button type="submit" ' + (state.account.busy ? 'disabled' : '') + '>' + (state.account.busy ? 'Eliminazione...' : 'Elimina definitivamente') + '</button></div>' +
  '</form></div>';
}

function renderAccountDataSettings() {
  var user = state.account.user || {};
  var username = String(user.username || state.settings.userName || 'Utente');
  var initial = username.charAt(0).toUpperCase() || 'U';
  var storage = state.account.storage || {};
  var storageValue = storage.loading ? 'Calcolo...' : (storage.loaded ? formatAccountStorageBytes(storage.bytes) : '--');
  var storageMeta = storage.error
    ? escapeHtml(storage.error)
    : (storage.loaded
      ? (storage.entries + (storage.entries === 1 ? ' giornata' : ' giornate') + ' e ' + storage.payslips + (storage.payslips === 1 ? ' busta' : ' buste'))
      : 'Misurazione del database personale');
  var message = state.account.error
    ? '<div class="account-settings-message is-error">' + escapeHtml(state.account.error) + '</div>'
    : (state.account.notice ? '<div class="account-settings-message">' + escapeHtml(state.account.notice) + '</div>' : '');
  return '<section class="account-current-card"><span>' + escapeHtml(initial) + '</span><div><small>ACCOUNT ATTIVO</small><strong>' + escapeHtml(username) + '</strong><p>Database personale collegato</p></div><i>' + icons.check + '</i></section>' +
    '<div class="settings-v2-section-title">Sincronizzazione</div>' +
    '<section class="settings-v2-group"><div class="settings-v2-sync-row"><span class="settings-v2-icon is-green">' + icons.check + '</span><span class="settings-v2-copy"><strong>Salvataggio automatico</strong><small>' + escapeHtml(getSyncStatusMessage()) + '</small></span><span>ATTIVO</span></div></section>' +
    '<div class="settings-v2-section-title">Spazio sul server</div>' +
    '<section class="account-storage-card"><span class="account-storage-icon">' + icons.receipt + '</span><div class="account-storage-copy"><small>DATABASE OCCUPATO</small><strong>' + storageValue + '</strong><p>' + storageMeta + '</p></div><button type="button" data-refresh-account-storage="1" aria-label="Aggiorna spazio database" ' + (storage.loading ? 'disabled' : '') + '>' + icons.activity + '<span>Aggiorna</span></button></section>' +
    '<div class="settings-v2-section-title">Backup sul telefono</div>' +
    '<section class="account-backup-card"><div class="account-backup-copy"><span class="settings-v2-icon is-blue">' + icons.download + '</span><div><strong>Il tuo database, sempre con te</strong><p>Scarica un file SQLite con ore, ferie, impostazioni e buste del solo account ' + escapeHtml(username) + '.</p></div></div>' +
      '<button class="account-backup-primary" data-download-account-backup="1" ' + (state.account.busy ? 'disabled' : '') + '>' + icons.download + '<span>Scarica database</span></button>' +
      '<button class="account-backup-secondary" data-select-account-backup="1" ' + (state.account.busy ? 'disabled' : '') + '>' + icons.arrowUp + '<span>Ripristina un backup</span></button>' +
      '<input id="accountBackupFile" type="file" accept=".sqlite,.sqlite3,application/vnd.sqlite3,application/x-sqlite3" hidden>' +
    '</section>' +
    message +
    '<div class="settings-v2-section-title">Sessione</div>' +
    '<section class="settings-v2-group"><button class="account-logout-row" data-account-logout="1"><span class="settings-v2-icon is-violet">' + icons.user + '</span><span class="settings-v2-copy"><strong>Esci da ' + escapeHtml(username) + '</strong><small>Potrai accedere con un altro account</small></span><span class="settings-v2-chevron">' + icons.right + '</span></button></section>';
}

function bindAccountEvents() {
  var retryData = document.querySelector('[data-retry-account-data]');
  if (retryData) retryData.onclick = retryAccountDataLoad;
  document.querySelectorAll('[data-account-mode]').forEach(function (button) {
    button.onclick = function () { setAccountUiState({ mode: button.dataset.accountMode, error: '', notice: '' }); };
  });
  document.querySelectorAll('[data-account-form]').forEach(function (form) {
    form.onsubmit = function (event) {
      event.preventDefault();
      if (form.dataset.accountForm === 'register') submitAccountRegistration(form);
      else submitAccountLogin(form);
    };
  });
  var download = document.querySelector('[data-download-account-backup]');
  if (download) download.onclick = downloadAccountBackup;
  var select = document.querySelector('[data-select-account-backup]');
  var input = document.getElementById('accountBackupFile');
  if (select && input) select.onclick = function () { input.value = ''; input.click(); };
  if (input) input.onchange = function () { restoreAccountBackup(input.files && input.files[0]); };
  var logout = document.querySelector('[data-account-logout]');
  if (logout) logout.onclick = logoutAccount;
  var refreshStorage = document.querySelector('[data-refresh-account-storage]');
  if (refreshStorage) refreshStorage.onclick = function () { loadAccountStorageUsage(true); };
  document.querySelectorAll('[data-admin-open-account]').forEach(function (button) {
    button.onclick = function () { openManagedAccount(button.dataset.adminOpenAccount); };
  });
  document.querySelectorAll('[data-admin-delete-account]').forEach(function (button) {
    button.onclick = function () { chooseAccountForDeletion(button.dataset.adminDeleteAccount); };
  });
  document.querySelectorAll('[data-admin-delete-cancel]').forEach(function (button) {
    button.onclick = function () { setAccountUiState({ deleteCandidate: null, error: '', notice: '' }); };
  });
  var deleteForm = document.querySelector('[data-admin-delete-form]');
  if (deleteForm) deleteForm.onsubmit = function (event) { event.preventDefault(); deleteManagedAccount(deleteForm); };
  var returnButton = document.querySelector('[data-admin-return]');
  if (returnButton) returnButton.onclick = returnToOwnerAccount;
  var adminUser = state.account.user || {};
  if (state.activeTab === 'settings' && state.settingsSection === 'accounts' && adminUser.canManageAccounts && !adminUser.impersonating && state.account.adminAccounts === null && !state.account.adminLoading) {
    window.setTimeout(loadAdminAccounts, 0);
  }
  if (state.activeTab === 'settings' && state.settingsSection === 'data' && state.account.authenticated && !state.account.storage.loaded && !state.account.storage.loading && !state.account.storage.error) {
    window.setTimeout(function () { loadAccountStorageUsage(false); }, 0);
  }
}
