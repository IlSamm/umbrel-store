var ACCOUNT_STATUS_URL = '/api/auth/status';
var ACCOUNT_REGISTER_URL = '/api/auth/register';
var ACCOUNT_LOGIN_URL = '/api/auth/login';
var ACCOUNT_LOGOUT_URL = '/api/auth/logout';
var ACCOUNT_BACKUP_URL = '/api/backup';
var ACCOUNT_RESTORE_URL = '/api/backup/restore';
var STORAGE_ACTIVE_ACCOUNT = 'gestore-active-account-v1';

state.account = {
  loaded: false,
  authenticated: false,
  setupRequired: false,
  hasAccounts: false,
  hasLegacyData: false,
  user: null,
  mode: 'login',
  busy: false,
  error: '',
  notice: ''
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

async function bootstrapAccountSession() {
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
      await bootstrapServerState();
      if (String(state.settings.userName || '') === 'Utente' && state.account.user.username) {
        state.settings.userName = state.account.user.username;
        state.settingsDraft = Object.assign({}, state.settings);
        saveSettings();
      }
      return;
    }

    serverSyncReady = false;
    if (state.account.hasAccounts) {
      clearGestOreDeviceCache();
      resetRuntimeAccountData();
    }
    if (typeof render === 'function') render();
  } catch (err) {
    // Older/offline installations keep the existing single-user behavior.
    state.account.loaded = true;
    state.account.authenticated = true;
    state.account.user = null;
    state.account.notice = 'Server account non disponibile: modalita locale attiva.';
    await bootstrapServerState();
  }
}

function setAccountUiState(values) {
  state.account = Object.assign({}, state.account, values || {});
  if (typeof render === 'function') render();
}

function handleAccountUnauthorized() {
  serverSyncReady = false;
  clearGestOreDeviceCache();
  resetRuntimeAccountData();
  state.account = Object.assign({}, state.account, {
    loaded: true,
    authenticated: false,
    hasAccounts: true,
    setupRequired: false,
    user: null,
    mode: 'login',
    busy: false,
    notice: '',
    error: 'La sessione e scaduta. Accedi di nuovo.'
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
      body: JSON.stringify({ username: username, password: password, snapshot: buildStateSnapshot() })
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
  try { await syncStateToServer(); } catch (err) {}
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
  try {
    await syncStateToServer();
    var response = await fetch(ACCOUNT_BACKUP_URL, { cache: 'no-store' });
    if (!response.ok) await readJsonResponse(response);
    var blob = await response.blob();
    var filename = getDownloadFilename(response, 'GestOre_Backup.sqlite3');
    downloadBlobFile(filename, blob);
    setAccountUiState({ busy: false, error: '', notice: 'Backup scaricato sul telefono.' });
  } catch (err) {
    setAccountUiState({ busy: false, notice: '', error: err.message || 'Impossibile creare il backup.' });
  }
}

async function restoreAccountBackup(file) {
  if (!file || state.account.busy) return;
  if (!window.confirm('Ripristinare questo backup? I dati attuali dell\'account verranno sostituiti.')) return;
  setAccountUiState({ busy: true, error: '', notice: 'Controllo e ripristino del database...' });
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
  }
}

function renderAccountGate() {
  if (state.account.authenticated) return '';
  if (!state.account.loaded) {
    return '<div class="account-gate is-loading"><div class="account-loading-mark">' + icons.user + '</div><strong>Controllo account</strong><span>Preparazione dei tuoi dati...</span></div>';
  }
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

function renderAccountDataSettings() {
  var user = state.account.user || {};
  var username = String(user.username || state.settings.userName || 'Utente');
  var initial = username.charAt(0).toUpperCase() || 'U';
  var message = state.account.error
    ? '<div class="account-settings-message is-error">' + escapeHtml(state.account.error) + '</div>'
    : (state.account.notice ? '<div class="account-settings-message">' + escapeHtml(state.account.notice) + '</div>' : '');
  return '<section class="account-current-card"><span>' + escapeHtml(initial) + '</span><div><small>ACCOUNT ATTIVO</small><strong>' + escapeHtml(username) + '</strong><p>Database personale collegato</p></div><i>' + icons.check + '</i></section>' +
    '<div class="settings-v2-section-title">Sincronizzazione</div>' +
    '<section class="settings-v2-group"><div class="settings-v2-sync-row"><span class="settings-v2-icon is-green">' + icons.check + '</span><span class="settings-v2-copy"><strong>Salvataggio automatico</strong><small>' + escapeHtml(getSyncStatusMessage()) + '</small></span><span>ATTIVO</span></div></section>' +
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
}
