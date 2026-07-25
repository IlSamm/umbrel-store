var ACCOUNT_STATUS_URL = '/api/auth/status';
var ACCOUNT_REGISTER_URL = '/api/auth/register';
var ACCOUNT_LOGIN_URL = '/api/auth/login';
var ACCOUNT_RECOVER_URL = '/api/auth/recover';
var ACCOUNT_LOGOUT_URL = '/api/auth/logout';
var ACCOUNT_BACKUP_URL = '/api/backup';
var ACCOUNT_RESTORE_URL = '/api/backup/restore';
var ACCOUNT_BACKUPS_URL = '/api/backups';
var ACCOUNT_BACKUP_RESTORE_URL = '/api/backups/restore';
var ACCOUNT_STORAGE_URL = '/api/storage';
var ACCOUNT_ADMIN_URL = '/api/admin/accounts';
var ACCOUNT_ADMIN_ACCESS_URL = '/api/admin/access';
var ACCOUNT_ADMIN_RETURN_URL = '/api/admin/return';
var ACCOUNT_PASSKEYS_URL = '/api/auth/passkeys';
var ACCOUNT_PASSKEY_REGISTER_OPTIONS_URL = '/api/auth/passkeys/register/options';
var ACCOUNT_PASSKEY_REGISTER_VERIFY_URL = '/api/auth/passkeys/register/verify';
var ACCOUNT_PASSKEY_LOGIN_OPTIONS_URL = '/api/auth/passkeys/login/options';
var ACCOUNT_PASSKEY_LOGIN_VERIFY_URL = '/api/auth/passkeys/login/verify';
var STORAGE_ACTIVE_ACCOUNT = 'gestore-active-account-v1';
var STORAGE_ACCOUNT_CACHE_PREFIX = 'gestore-account-device-cache-v2:';
var STORAGE_PENDING_ONBOARDING = 'gestore-pending-onboarding-v1';
var accountCacheTimer = 0;

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
    backupBytes: 0,
    backups: 0,
    entries: 0,
    payslips: 0,
    updatedAt: 0,
    error: ''
  },
  backups: {
    loaded: false,
    loading: false,
    items: [],
    bytes: 0,
    error: ''
  },
  backupDecision: null,
  passkeys: {
    loaded: false,
    loading: false,
    items: [],
    error: ''
  },
  passkeyBusy: false,
  passkeyDeleteCandidate: null,
  adminAccounts: null,
  adminLoading: false,
  deleteCandidate: null
};

function getStoredActiveAccountId() {
  try { return String(localStorage.getItem(STORAGE_ACTIVE_ACCOUNT) || ''); }
  catch (err) { return ''; }
}

function readPendingAccountOnboarding() {
  try {
    var raw = localStorage.getItem(STORAGE_PENDING_ONBOARDING);
    var marker = raw ? JSON.parse(raw) : null;
    if (!marker || !marker.userId) return null;
    if (Date.now() - (Number(marker.createdAt) || 0) > 7 * 24 * 60 * 60 * 1000) {
      localStorage.removeItem(STORAGE_PENDING_ONBOARDING);
      return null;
    }
    return marker;
  } catch (err) {
    return null;
  }
}

function markPendingAccountOnboarding(userId) {
  var cleanId = String(userId || '').trim();
  if (!cleanId) return;
  try {
    localStorage.setItem(STORAGE_PENDING_ONBOARDING, JSON.stringify({
      userId: cleanId,
      createdAt: Date.now()
    }));
  } catch (err) {}
}

function clearPendingAccountOnboarding(userId) {
  var marker = readPendingAccountOnboarding();
  var cleanId = String(userId || '').trim();
  if (!marker || (cleanId && String(marker.userId) !== cleanId)) return;
  try { localStorage.removeItem(STORAGE_PENDING_ONBOARDING); } catch (err) {}
}

function maybeOpenRegistrationOnboarding() {
  var marker = readPendingAccountOnboarding();
  var accountId = String(state.account && state.account.user && state.account.user.id || '');
  if (!marker || !accountId || String(marker.userId) !== accountId) return false;
  if (!state.account.authenticated || !state.account.dataReady || state.onboardingOpen) return false;

  if (state.settings && state.settings.onboardingCompleted) {
    state.settings.onboardingCompleted = false;
    state.settingsDraft = Object.assign({}, state.settings);
    saveSettings();
  }

  window.setTimeout(function () {
    var currentId = String(state.account && state.account.user && state.account.user.id || '');
    if (currentId !== accountId || state.onboardingOpen || typeof openOnboarding !== 'function') return;
    openOnboarding();
  }, 0);
  return true;
}

function getAccountDeviceCacheKey(userId) {
  return STORAGE_ACCOUNT_CACHE_PREFIX + String(userId || '').trim();
}

function persistAccountDeviceCache(userId) {
  var cleanId = String(userId || '').trim();
  if (!cleanId || !state) return false;
  var pendingSync = null;
  var pendingPayslip = null;
  var shiftTimer = null;
  try {
    var pendingRaw = localStorage.getItem(STORAGE_PENDING_SYNC);
    pendingSync = pendingRaw ? JSON.parse(pendingRaw) : null;
  } catch (err) {}
  try {
    var payslipRaw = localStorage.getItem(STORAGE_PENDING_PAYSLIP);
    pendingPayslip = payslipRaw ? JSON.parse(payslipRaw) : null;
  } catch (err) {}
  try {
    var timerRaw = localStorage.getItem('gestore-shift-timer-v1');
    shiftTimer = timerRaw ? JSON.parse(timerRaw) : null;
  } catch (err) {}
  var payload = {
    accountId: cleanId,
    savedAt: Date.now(),
    entries: state.entries && typeof state.entries === 'object' ? state.entries : {},
    settings: state.settings && typeof state.settings === 'object' ? state.settings : {},
    payslips: compactPayslipsForDeviceStorage(Array.isArray(state.payslips) ? state.payslips : []),
    pendingSync: pendingSync,
    pendingPayslip: pendingPayslip,
    shiftTimer: shiftTimer
  };
  try {
    localStorage.setItem(getAccountDeviceCacheKey(cleanId), JSON.stringify(payload));
    return true;
  } catch (err) {
    return false;
  }
}

function scheduleCurrentAccountDeviceCache() {
  if (accountCacheTimer) window.clearTimeout(accountCacheTimer);
  accountCacheTimer = window.setTimeout(function () {
    accountCacheTimer = 0;
    persistAccountDeviceCache(getStoredActiveAccountId());
  }, 180);
}

function restoreAccountDeviceCache(userId) {
  var cleanId = String(userId || '').trim();
  if (!cleanId) return false;
  var cache = null;
  try {
    var raw = localStorage.getItem(getAccountDeviceCacheKey(cleanId));
    cache = raw ? JSON.parse(raw) : null;
  } catch (err) {}
  if (!cache || typeof cache !== 'object' || String(cache.accountId || '') !== cleanId) return false;
  try {
    localStorage.setItem(STORAGE_ENTRIES, JSON.stringify(cache.entries && typeof cache.entries === 'object' ? cache.entries : {}));
    ENTRY_BACKUP_KEYS.forEach(function (key) {
      localStorage.setItem(key, JSON.stringify(cache.entries && typeof cache.entries === 'object' ? cache.entries : {}));
    });
    localStorage.setItem(STORAGE_SETTINGS, JSON.stringify(cache.settings && typeof cache.settings === 'object' ? cache.settings : {}));
    SETTINGS_BACKUP_KEYS.forEach(function (key) {
      localStorage.setItem(key, JSON.stringify(cache.settings && typeof cache.settings === 'object' ? cache.settings : {}));
    });
    localStorage.setItem(STORAGE_PAYSLIPS, JSON.stringify(Array.isArray(cache.payslips) ? cache.payslips : []));
    localStorage.setItem(STORAGE_SAFETY_BUNDLE, JSON.stringify({
      entries: cache.entries && typeof cache.entries === 'object' ? cache.entries : {},
      settings: cache.settings && typeof cache.settings === 'object' ? cache.settings : {},
      payslips: Array.isArray(cache.payslips) ? cache.payslips : [],
      savedAt: Math.max(0, Number(cache.savedAt) || Date.now()),
      version: 2
    }));
    if (cache.pendingSync && typeof cache.pendingSync === 'object') localStorage.setItem(STORAGE_PENDING_SYNC, JSON.stringify(cache.pendingSync));
    if (cache.pendingPayslip && typeof cache.pendingPayslip === 'object') localStorage.setItem(STORAGE_PENDING_PAYSLIP, JSON.stringify(cache.pendingPayslip));
    if (cache.shiftTimer && typeof cache.shiftTimer === 'object') localStorage.setItem('gestore-shift-timer-v1', JSON.stringify(cache.shiftTimer));
    return true;
  } catch (err) {
    return false;
  }
}

function removeAccountDeviceCache(userId) {
  try { localStorage.removeItem(getAccountDeviceCacheKey(userId)); } catch (err) {}
}

function clearGestOreDeviceCache(options) {
  var opts = options || {};
  var preserveAccountCaches = opts.preserveAccountCaches !== false;
  try {
    var keys = [];
    for (var i = 0; i < localStorage.length; i += 1) keys.push(localStorage.key(i));
    keys.forEach(function (key) {
      if (!key || key.indexOf('gestore-') !== 0) return;
      if (preserveAccountCaches && key.indexOf(STORAGE_ACCOUNT_CACHE_PREFIX) === 0) return;
      localStorage.removeItem(key);
    });
  } catch (err) {}
}

function resetRuntimeAccountData(options) {
  var opts = options || {};
  state.entries = opts.reloadFromDevice ? loadEntriesWithRecovery() : {};
  state.settings = normalizeRuntimeSettings(opts.reloadFromDevice
    ? loadWithMigration(STORAGE_SETTINGS, LEGACY_SETTINGS_KEYS, SETTINGS_BACKUP_KEYS, {}, 'settings')
    : {});
  state.settingsDraft = Object.assign({}, state.settings);
  state.payslips = opts.reloadFromDevice ? normalizePayslipCollection(loadPayslipsWithRecovery()) : [];
  state.payslipDraft = opts.reloadFromDevice && typeof loadPendingPayslipDraft === 'function' ? loadPendingPayslipDraft() : null;
  state.payslipDetailId = '';
  state.payslipEditorOpen = false;
  state.payslipStatsOpen = false;
  state.privacyLocked = false;
  state.syncPending = opts.reloadFromDevice && typeof readPendingSyncRecord === 'function' ? Boolean(readPendingSyncRecord()) : false;
  state.syncStatus = opts.reloadFromDevice && state.syncPending ? 'In attesa di sincronizzazione' : 'In attesa di accesso';
  state.syncConflictNotice = '';
  state.lastSyncedAt = 0;
  serverSnapshotUpdatedAt = 0;
  if (typeof loadShiftTimerState === 'function') state.shiftTimer = opts.reloadFromDevice ? loadShiftTimerState() : loadShiftTimerState(true);
  if (state.account && state.account.storage) {
    state.account.storage = {
      loaded: false,
      loading: false,
      bytes: 0,
      databaseBytes: 0,
      journalBytes: 0,
      backupBytes: 0,
      backups: 0,
      entries: 0,
      payslips: 0,
      updatedAt: 0,
      error: ''
    };
  }
  if (state.account && state.account.backups) {
    state.account.backups = {
      loaded: false,
      loading: false,
      items: [],
      bytes: 0,
      error: ''
    };
    state.account.backupDecision = null;
  }
  if (state.account && state.account.passkeys) {
    state.account.passkeys = {
      loaded: false,
      loading: false,
      items: [],
      error: ''
    };
    state.account.passkeyBusy = false;
    state.account.passkeyDeleteCandidate = null;
  }
}

function activateAccountOnDevice(userId, options) {
  var opts = options || {};
  var nextId = String(userId || '').trim();
  var previousId = getStoredActiveAccountId();
  if (accountCacheTimer) {
    window.clearTimeout(accountCacheTimer);
    accountCacheTimer = 0;
  }
  if (previousId && !opts.discardCurrentCache) persistAccountDeviceCache(previousId);
  if (opts.removeTargetCache && nextId) removeAccountDeviceCache(nextId);
  clearGestOreDeviceCache({ preserveAccountCaches: true });
  try { localStorage.setItem(STORAGE_ACTIVE_ACCOUNT, nextId); } catch (err) {}
  if (opts.restoreCache !== false) restoreAccountDeviceCache(nextId);
  resetRuntimeAccountData({ reloadFromDevice: opts.restoreCache !== false });
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

function supportsAccountPasskeys() {
  return Boolean(
    window.isSecureContext &&
    window.PublicKeyCredential &&
    navigator.credentials &&
    typeof navigator.credentials.create === 'function' &&
    typeof navigator.credentials.get === 'function'
  );
}

function accountBase64UrlToBuffer(value) {
  var clean = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  while (clean.length % 4) clean += '=';
  var binary = window.atob(clean);
  var bytes = new Uint8Array(binary.length);
  for (var index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

function accountBufferToBase64Url(value) {
  if (!value) return '';
  var bytes = new Uint8Array(value);
  var binary = '';
  for (var index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function normalizePasskeyCredentialDescriptor(item) {
  var descriptor = Object.assign({}, item || {});
  descriptor.id = accountBase64UrlToBuffer(descriptor.id);
  return descriptor;
}

function normalizePasskeyCreationOptions(options) {
  var normalized = Object.assign({}, options || {});
  normalized.challenge = accountBase64UrlToBuffer(normalized.challenge);
  normalized.user = Object.assign({}, normalized.user || {}, {
    id: accountBase64UrlToBuffer(normalized.user && normalized.user.id)
  });
  normalized.excludeCredentials = (normalized.excludeCredentials || []).map(normalizePasskeyCredentialDescriptor);
  return normalized;
}

function normalizePasskeyRequestOptions(options) {
  var normalized = Object.assign({}, options || {});
  normalized.challenge = accountBase64UrlToBuffer(normalized.challenge);
  normalized.allowCredentials = (normalized.allowCredentials || []).map(normalizePasskeyCredentialDescriptor);
  return normalized;
}

function serializeAccountPasskeyCredential(credential) {
  var response = credential && credential.response;
  var serializedResponse = {
    clientDataJSON: accountBufferToBase64Url(response && response.clientDataJSON)
  };
  if (response && response.attestationObject) {
    serializedResponse.attestationObject = accountBufferToBase64Url(response.attestationObject);
    if (typeof response.getTransports === 'function') serializedResponse.transports = response.getTransports();
  } else {
    serializedResponse.authenticatorData = accountBufferToBase64Url(response && response.authenticatorData);
    serializedResponse.signature = accountBufferToBase64Url(response && response.signature);
    serializedResponse.userHandle = accountBufferToBase64Url(response && response.userHandle);
  }
  return {
    id: String(credential && credential.id || ''),
    rawId: accountBufferToBase64Url(credential && credential.rawId),
    type: String(credential && credential.type || 'public-key'),
    authenticatorAttachment: credential && credential.authenticatorAttachment || null,
    response: serializedResponse,
    clientExtensionResults: credential && typeof credential.getClientExtensionResults === 'function'
      ? credential.getClientExtensionResults()
      : {}
  };
}

function getPasskeyErrorMessage(error, fallback) {
  if (error && (error.name === 'NotAllowedError' || error.name === 'AbortError')) {
    return 'Operazione annullata. Puoi riprovare quando vuoi.';
  }
  if (error && error.name === 'InvalidStateError') {
    return 'Questa passkey risulta gia collegata al profilo.';
  }
  return error && error.message ? error.message : fallback;
}

async function loginWithAccountPasskey() {
  if (state.account.passkeyBusy || state.account.busy) return;
  if (!supportsAccountPasskeys()) {
    setAccountUiState({ error: 'Le passkey richiedono Safari aggiornato e una connessione HTTPS.' });
    return;
  }
  var usernameInput = document.querySelector('[data-account-form="login"] [name="username"]');
  var username = String(usernameInput && usernameInput.value || '').trim();
  if (!username) {
    setAccountUiState({ error: 'Inserisci prima il nome utente, poi usa Face ID o Touch ID.' });
    if (usernameInput) usernameInput.focus();
    return;
  }
  setAccountUiState({ passkeyBusy: true, error: '', notice: 'Conferma l accesso sul dispositivo...' });
  try {
    var optionsResponse = await fetch(ACCOUNT_PASSKEY_LOGIN_OPTIONS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ username: username })
    });
    var optionsPayload = await readJsonResponse(optionsResponse);
    var credential = await navigator.credentials.get({
      publicKey: normalizePasskeyRequestOptions(optionsPayload.options)
    });
    if (!credential) throw new Error('Nessuna passkey selezionata.');
    var verifyResponse = await fetch(ACCOUNT_PASSKEY_LOGIN_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({
        challengeId: optionsPayload.challengeId,
        credential: serializeAccountPasskeyCredential(credential)
      })
    });
    var payload = await readJsonResponse(verifyResponse);
    activateAccountOnDevice(payload.user && payload.user.id);
    window.location.reload();
  } catch (err) {
    setAccountUiState({
      passkeyBusy: false,
      notice: '',
      error: getPasskeyErrorMessage(err, 'Accesso con passkey non riuscito.')
    });
  }
}

async function loadAccountPasskeys(force) {
  var passkeys = state.account && state.account.passkeys;
  if (!state.account.authenticated || !passkeys || passkeys.loading || (!force && passkeys.loaded)) return;
  passkeys.loading = true;
  passkeys.error = '';
  if (typeof render === 'function') render();
  try {
    var response = await fetch(ACCOUNT_PASSKEYS_URL, { cache: 'no-store' });
    var payload = await readJsonResponse(response);
    state.account.passkeys = {
      loaded: true,
      loading: false,
      items: Array.isArray(payload.passkeys) ? payload.passkeys : [],
      error: ''
    };
  } catch (err) {
    state.account.passkeys = {
      loaded: false,
      loading: false,
      items: [],
      error: err.message || 'Passkey non disponibili.'
    };
  }
  if (typeof render === 'function') render();
}

async function registerAccountPasskey() {
  if (state.account.passkeyBusy || state.account.busy || !state.account.authenticated) return;
  if (!supportsAccountPasskeys()) {
    setAccountUiState({ error: 'Le passkey richiedono Safari aggiornato e una connessione HTTPS.' });
    return;
  }
  setAccountUiState({ passkeyBusy: true, error: '', notice: '' });
  try {
    var optionsResponse = await fetch(ACCOUNT_PASSKEY_REGISTER_OPTIONS_URL, {
      method: 'POST',
      cache: 'no-store'
    });
    var optionsPayload = await readJsonResponse(optionsResponse);
    var credential = await navigator.credentials.create({
      publicKey: normalizePasskeyCreationOptions(optionsPayload.options)
    });
    if (!credential) throw new Error('Nessuna passkey creata.');
    var verifyResponse = await fetch(ACCOUNT_PASSKEY_REGISTER_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({
        challengeId: optionsPayload.challengeId,
        credential: serializeAccountPasskeyCredential(credential)
      })
    });
    var payload = await readJsonResponse(verifyResponse);
    state.account.passkeys = {
      loaded: true,
      loading: false,
      items: Array.isArray(payload.passkeys) ? payload.passkeys : [],
      error: ''
    };
    setAccountUiState({
      passkeyBusy: false,
      notice: 'Passkey aggiunta. Ora puoi entrare con Face ID o Touch ID.',
      error: ''
    });
  } catch (err) {
    setAccountUiState({
      passkeyBusy: false,
      notice: '',
      error: getPasskeyErrorMessage(err, 'Non e stato possibile aggiungere la passkey.')
    });
  }
}

async function deleteAccountPasskey() {
  var candidate = state.account.passkeyDeleteCandidate;
  if (!candidate || state.account.passkeyBusy) return;
  setAccountUiState({ passkeyBusy: true, error: '', notice: '' });
  try {
    var response = await fetch(ACCOUNT_PASSKEYS_URL, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ id: candidate.id })
    });
    var payload = await readJsonResponse(response);
    state.account.passkeys = {
      loaded: true,
      loading: false,
      items: Array.isArray(payload.passkeys) ? payload.passkeys : [],
      error: ''
    };
    setAccountUiState({
      passkeyBusy: false,
      passkeyDeleteCandidate: null,
      notice: 'Passkey rimossa.',
      error: ''
    });
  } catch (err) {
    setAccountUiState({
      passkeyBusy: false,
      error: err.message || 'Non e stato possibile rimuovere la passkey.'
    });
  }
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
      backupBytes: Math.max(0, Number(payload.backupBytes) || 0),
      backups: Math.max(0, Number(payload.backups) || 0),
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
      var cachedDataAvailable = hasMeaningfulSnapshotData(buildStateSnapshot()) || Boolean(readPendingSyncRecord());
      if (cachedDataAvailable) {
        state.account.dataReady = true;
        state.account.dataError = '';
        if (typeof render === 'function') render();
        window.dispatchEvent(new CustomEvent('gestore:account-ready'));
      }
      var databaseReady = await bootstrapServerState();
      if (!databaseReady) {
        if (cachedDataAvailable) {
          state.account.dataReady = true;
          state.account.dataError = '';
          state.account.notice = 'Sto usando la copia protetta sul dispositivo. La sincronizzazione ripartira automaticamente.';
          if (typeof render === 'function') render();
          return;
        }
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
      var previousAccountId = getStoredActiveAccountId();
      if (previousAccountId) persistAccountDeviceCache(previousAccountId);
      clearGestOreDeviceCache({ preserveAccountCaches: true });
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
    maybeOpenRegistrationOnboarding();
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
    var newAccountId = payload.user && payload.user.id;
    if (typeof cachePendingRecoveryCode === 'function') cachePendingRecoveryCode(payload.recoveryCode || '');
    activateAccountOnDevice(newAccountId);
    markPendingAccountOnboarding(newAccountId);
    window.location.reload();
  } catch (err) {
    setAccountUiState({ busy: false, notice: '', error: err.message || 'Registrazione non riuscita.' });
  }
}

async function submitAccountRecovery(form) {
  if (state.account.busy) return;
  var username = String(form.querySelector('[name="username"]').value || '').trim();
  var recoveryCode = String(form.querySelector('[name="recoveryCode"]').value || '').trim();
  var password = String(form.querySelector('[name="password"]').value || '');
  var confirmPassword = String(form.querySelector('[name="confirmPassword"]').value || '');
  if (password !== confirmPassword) {
    setAccountUiState({ error: 'Le due password non coincidono.' });
    return;
  }
  setAccountUiState({ busy: true, error: '', notice: 'Verifico il codice di recupero...' });
  try {
    var response = await fetch(ACCOUNT_RECOVER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({
        username: username,
        recoveryCode: recoveryCode,
        password: password
      })
    });
    var payload = await readJsonResponse(response);
    if (typeof cachePendingRecoveryCode === 'function') cachePendingRecoveryCode(payload.recoveryCode || '');
    activateAccountOnDevice(payload.user && payload.user.id);
    window.location.reload();
  } catch (err) {
    setAccountUiState({ busy: false, notice: '', error: err.message || 'Recupero account non riuscito.' });
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
  var activeAccountId = getStoredActiveAccountId();
  if (activeAccountId) persistAccountDeviceCache(activeAccountId);
  clearGestOreDeviceCache({ preserveAccountCaches: true });
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
    activateAccountOnDevice(activeId, { discardCurrentCache: true, restoreCache: false, removeTargetCache: true });
    window.location.reload();
  } catch (err) {
    setAccountUiState({ busy: false, notice: '', error: err.message || 'Ripristino non riuscito.' });
  } finally {
    endAccountTransfer(loadingToken);
  }
}

function formatAccountBackupDate(value) {
  var date = new Date(Math.max(0, Number(value) || 0));
  if (!Number.isFinite(date.getTime())) return 'Data non disponibile';
  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function getAccountBackupKindLabel(kind) {
  if (kind === 'manual') return 'Salvataggio manuale';
  if (kind === 'pre-restore') return 'Prima del ripristino';
  return 'Copia automatica';
}

async function loadVersionedAccountBackups(force) {
  var backups = state.account && state.account.backups;
  if (!backups || backups.loading || (!force && backups.loaded) || !state.account.authenticated) return;
  backups.loading = true;
  backups.error = '';
  if (typeof render === 'function') render();
  try {
    var response = await fetch(ACCOUNT_BACKUPS_URL, { cache: 'no-store' });
    var payload = await readJsonResponse(response);
    state.account.backups = {
      loaded: true,
      loading: false,
      items: Array.isArray(payload.backups) ? payload.backups : [],
      bytes: Math.max(0, Number(payload.bytes) || 0),
      error: ''
    };
  } catch (err) {
    backups.loading = false;
    backups.loaded = false;
    backups.error = err.message || 'Salvataggi server non disponibili.';
  }
  if (typeof render === 'function') render();
}

async function createVersionedAccountBackup() {
  if (state.account.busy) return;
  setAccountUiState({ busy: true, error: '', notice: 'Creazione del punto di ripristino...' });
  var loadingToken = beginAccountTransfer('Salvo il profilo', 'Creo una copia verificata nel server');
  try {
    if (!await flushServerSyncNow()) throw new Error(getServerSyncFailureMessage());
    var response = await fetch(ACCOUNT_BACKUPS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: '{}'
    });
    await readJsonResponse(response);
    state.account.backups.loaded = false;
    state.account.storage.loaded = false;
    setAccountUiState({ busy: false, error: '', notice: 'Punto di ripristino creato.' });
    await loadVersionedAccountBackups(true);
  } catch (err) {
    setAccountUiState({ busy: false, notice: '', error: err.message || 'Impossibile creare il salvataggio.' });
  } finally {
    endAccountTransfer(loadingToken);
  }
}

function requestVersionedBackupAction(type, backupId) {
  var item = (state.account.backups.items || []).find(function (candidate) {
    return String(candidate.id || '') === String(backupId || '');
  });
  if (!item) return;
  state.account.backupDecision = { type: type === 'delete' ? 'delete' : 'restore', item: item };
  render();
}

async function confirmVersionedBackupAction() {
  var decision = state.account.backupDecision;
  if (!decision || !decision.item || state.account.busy) return;
  var isRestore = decision.type === 'restore';
  setAccountUiState({
    busy: true,
    error: '',
    notice: isRestore ? 'Ripristino del salvataggio...' : 'Eliminazione del salvataggio...'
  });
  var loadingToken = beginAccountTransfer(
    isRestore ? 'Ripristino dati' : 'Elimino la copia',
    isRestore ? 'Verifico il database e proteggo lo stato attuale' : 'Aggiorno lo storico dei salvataggi'
  );
  try {
    var response = await fetch(isRestore ? ACCOUNT_BACKUP_RESTORE_URL : ACCOUNT_BACKUPS_URL, {
      method: isRestore ? 'POST' : 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ backupId: decision.item.id })
    });
    await readJsonResponse(response);
    state.account.backupDecision = null;
    if (isRestore) {
      var activeId = state.account.user && state.account.user.id;
      activateAccountOnDevice(activeId, { discardCurrentCache: true, restoreCache: false, removeTargetCache: true });
      window.location.reload();
      return;
    }
    state.account.backups.loaded = false;
    state.account.storage.loaded = false;
    setAccountUiState({ busy: false, error: '', notice: 'Salvataggio eliminato.' });
    await loadVersionedAccountBackups(true);
  } catch (err) {
    state.account.backupDecision = null;
    setAccountUiState({ busy: false, notice: '', error: err.message || 'Operazione sul salvataggio non riuscita.' });
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
    removeAccountDeviceCache(account.id);
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
  var recoverMode = state.account.mode === 'recover';
  var firstSetup = state.account.setupRequired;
  var title = recoverMode
    ? 'Recupera account'
    : (registerMode ? (firstSetup ? 'Crea il tuo account' : 'Nuovo account') : 'Bentornato');
  var copy = recoverMode
    ? 'Inserisci il codice personale salvato durante la registrazione e scegli una nuova password.'
    : (registerMode
      ? (firstSetup && state.account.hasLegacyData ? 'I dati gia presenti verranno collegati automaticamente a questo primo account.' : 'Ogni account usa un database personale e separato.')
      : 'Accedi con il tuo nome utente per aprire il database corretto.');
  var status = state.account.error
    ? '<div class="account-form-message is-error">' + escapeHtml(state.account.error) + '</div>'
    : (state.account.notice ? '<div class="account-form-message">' + escapeHtml(state.account.notice) + '</div>' : '');
  return '<div class="account-gate"><div class="account-gate-panel">' +
    '<div class="account-brand"><span class="account-brand-icon">' + icons.user + '</span><div><span>GESTORE PERSONALE</span><div>Gest<strong>Ore</strong></div></div></div>' +
    '<div class="account-gate-copy"><span>' + (recoverMode ? 'RECUPERO SICURO' : (registerMode ? 'REGISTRAZIONE' : 'ACCESSO')) + '</span><h1>' + title + '</h1><p>' + copy + '</p></div>' +
    '<form class="account-form" data-account-form="' + (recoverMode ? 'recover' : (registerMode ? 'register' : 'login')) + '">' +
      '<label><span>Nome utente</span><input name="username" type="text" minlength="3" maxlength="24" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="es. samuele" required></label>' +
      (recoverMode ? '<label><span>Codice di recupero</span><input name="recoveryCode" type="text" minlength="20" maxlength="32" autocomplete="one-time-code" autocapitalize="characters" spellcheck="false" placeholder="XXXXX-XXXXX-XXXXX-XXXXX" required></label>' : '') +
      '<label><span>' + (recoverMode ? 'Nuova password' : 'Password') + '</span><input name="password" type="password" minlength="8" maxlength="128" autocomplete="' + (registerMode || recoverMode ? 'new-password' : 'current-password') + '" placeholder="Almeno 8 caratteri" required></label>' +
      (registerMode || recoverMode ? '<label><span>Ripeti password</span><input name="confirmPassword" type="password" minlength="8" maxlength="128" autocomplete="new-password" placeholder="Ripeti la password" required></label>' : '') +
      status +
      '<button class="account-primary" type="submit" ' + (state.account.busy ? 'disabled' : '') + '>' + (state.account.busy ? 'Attendi...' : (recoverMode ? 'Imposta nuova password' : (registerMode ? 'Crea account' : 'Accedi'))) + '</button>' +
      (!registerMode && !recoverMode && supportsAccountPasskeys()
        ? '<div class="account-passkey-divider"><span>oppure</span></div><button class="account-passkey-login" type="button" data-account-passkey-login="1" ' + (state.account.passkeyBusy ? 'disabled' : '') + '>' + icons.lock + '<span>' + (state.account.passkeyBusy ? 'Conferma sul dispositivo...' : 'Accedi con Face ID o passkey') + '</span></button>'
        : '') +
    '</form>' +
    (firstSetup ? '' : (
      recoverMode
        ? '<button class="account-mode-switch" data-account-mode="login">Torna all&apos;accesso</button>'
        : '<button class="account-mode-switch" data-account-mode="' + (registerMode ? 'login' : 'register') + '">' + (registerMode ? 'Hai gia un account? Accedi' : 'Non hai un account? Registrati') + '</button>' +
          (!registerMode ? '<button class="account-recovery-switch" data-account-mode="recover">Password dimenticata?</button>' : '')
    )) +
    '<div class="account-security-note">' + icons.lock + '<span>Password protetta, passkey opzionale e database separato per ogni utente.</span></div>' +
  '</div></div>';
}

function formatAccountPasskeyDate(lastUsedAt, createdAt) {
  var lastUsed = Math.max(0, Number(lastUsedAt) || 0);
  var timestamp = lastUsed || Math.max(0, Number(createdAt) || 0);
  if (!timestamp) return 'Passkey attiva';
  try {
    return (lastUsed ? 'Usata ' : 'Aggiunta ') + new Date(timestamp).toLocaleDateString('it-IT', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  } catch (err) {
    return 'Passkey attiva';
  }
}

function renderPasskeySettings() {
  var available = supportsAccountPasskeys();
  var passkeys = state.account.passkeys || {};
  var items = Array.isArray(passkeys.items) ? passkeys.items : [];
  var body = '';
  if (!available) {
    body = '<div class="account-passkey-empty">' + icons.lock + '<div><strong>Non disponibile in questo browser</strong><small>Apri GestOre da Safari aggiornato tramite HTTPS per usare Face ID o Touch ID.</small></div></div>';
  } else if (passkeys.loading) {
    body = '<div class="account-passkey-loading"><span></span><div><strong>Controllo le passkey</strong><small>Solo pochi istanti</small></div></div>';
  } else if (passkeys.error) {
    body = '<div class="account-passkey-empty is-error">' + icons.lock + '<div><strong>Passkey non disponibili</strong><small>' + escapeHtml(passkeys.error) + '</small></div><button data-account-passkeys-refresh="1">Riprova</button></div>';
  } else if (items.length) {
    body = items.map(function (item) {
      return '<article class="account-passkey-row">' +
        '<span class="account-passkey-icon">' + icons.lock + '</span>' +
        '<div><strong>' + escapeHtml(item.name || 'Passkey') + '</strong><small>' + escapeHtml(formatAccountPasskeyDate(item.lastUsedAt, item.createdAt)) + (item.backedUp ? ' - sincronizzata' : '') + '</small></div>' +
        '<button data-account-passkey-delete="' + escapeHtml(item.id) + '" aria-label="Rimuovi ' + escapeHtml(item.name || 'passkey') + '">' + icons.trash + '</button>' +
      '</article>';
    }).join('');
  } else {
    body = '<div class="account-passkey-empty">' + icons.lock + '<div><strong>Accesso piu rapido e sicuro</strong><small>Conferma con Face ID, Touch ID o il codice del dispositivo. La password resta sempre disponibile.</small></div></div>';
  }
  return '<div class="settings-v2-section-title">Face ID e passkey</div>' +
    '<section class="account-passkey-card">' +
      '<div class="account-passkey-head"><div><strong>Accesso senza password</strong><small>' + (items.length ? items.length + (items.length === 1 ? ' passkey collegata' : ' passkey collegate') : 'Protetto dal tuo dispositivo') + '</small></div>' +
        (available ? '<button data-account-passkey-add="1" ' + (state.account.passkeyBusy ? 'disabled' : '') + '>' + icons.plus + '<span>' + (state.account.passkeyBusy ? 'Attendi...' : 'Aggiungi') + '</span></button>' : '') +
      '</div>' +
      '<div class="account-passkey-list">' + body + '</div>' +
    '</section>';
}

function renderPasskeyOverlay() {
  var candidate = state.account && state.account.passkeyDeleteCandidate;
  if (!candidate) return '';
  return '<div class="account-passkey-overlay" role="dialog" aria-modal="true" aria-labelledby="accountPasskeyDeleteTitle">' +
    '<section><span class="account-passkey-dialog-icon">' + icons.lock + '</span>' +
      '<small>SICUREZZA ACCOUNT</small><h2 id="accountPasskeyDeleteTitle">Rimuovere la passkey?</h2>' +
      '<p>Da questo dispositivo non potrai piu accedere con <strong>' + escapeHtml(candidate.name || 'questa passkey') + '</strong>. La password continuera a funzionare.</p>' +
      '<div><button data-account-passkey-delete-cancel="1">Annulla</button><button class="is-danger" data-account-passkey-delete-confirm="1" ' + (state.account.passkeyBusy ? 'disabled' : '') + '>' + (state.account.passkeyBusy ? 'Rimozione...' : 'Rimuovi') + '</button></div>' +
    '</section></div>';
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
  var backups = state.account.backups || {};
  var backupItems = Array.isArray(backups.items) ? backups.items : [];
  var isOnline = typeof navigator === 'undefined' || navigator.onLine !== false;
  var isSyncPending = Boolean(state.syncPending);
  var syncHealthTone = !isOnline ? ' is-offline' : (isSyncPending ? ' is-pending' : ' is-synced');
  var syncHealthTitle = !isOnline ? 'Connessione assente' : (isSyncPending ? 'Salvataggio in corso' : 'Database aggiornato');
  var lastSyncLabel = state.lastSyncedAt
    ? new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' }).format(new Date(state.lastSyncedAt))
    : 'Non ancora';
  var backupList = backups.loading
    ? '<div class="account-versioned-empty">Carico i punti di ripristino...</div>'
    : (backups.error
      ? '<div class="account-versioned-empty is-error">' + escapeHtml(backups.error) + '</div>'
      : (backupItems.length
        ? backupItems.map(function (item) {
            return '<div class="account-versioned-row"><span class="account-versioned-icon">' + (item.kind === 'manual' ? icons.cloud : icons.history) + '</span><span class="account-versioned-copy"><strong>' + escapeHtml(getAccountBackupKindLabel(item.kind)) + '</strong><small>' + escapeHtml(formatAccountBackupDate(item.createdAt)) + ' - ' + escapeHtml(formatAccountStorageBytes(item.bytes)) + '</small></span><button data-restore-versioned-backup="' + escapeHtml(item.id) + '" aria-label="Ripristina questo salvataggio">' + icons.history + '</button><button class="is-danger" data-delete-versioned-backup="' + escapeHtml(item.id) + '" aria-label="Elimina questo salvataggio">' + icons.trash + '</button></div>';
          }).join('')
        : '<div class="account-versioned-empty">Nessun punto di ripristino disponibile.</div>'));
  var backupDecision = state.account.backupDecision;
  var backupDecisionDialog = backupDecision && backupDecision.item
    ? '<div class="account-backup-decision-overlay" role="dialog" aria-modal="true" aria-labelledby="accountBackupDecisionTitle"><section class="account-backup-decision"><span>' + (backupDecision.type === 'restore' ? icons.history : icons.trash) + '</span><small>' + (backupDecision.type === 'restore' ? 'RIPRISTINO DATABASE' : 'ELIMINA COPIA') + '</small><h2 id="accountBackupDecisionTitle">' + (backupDecision.type === 'restore' ? 'Tornare a questo salvataggio?' : 'Eliminare questo salvataggio?') + '</h2><p>' + (backupDecision.type === 'restore' ? 'Prima del ripristino verra creata automaticamente una copia dei dati attuali.' : 'Viene eliminata soltanto questa copia. I dati attuali non cambiano.') + '</p><div><button data-cancel-versioned-backup="1">Annulla</button><button class="' + (backupDecision.type === 'delete' ? 'is-danger' : 'is-primary') + '" data-confirm-versioned-backup="1">' + (backupDecision.type === 'restore' ? 'Ripristina' : 'Elimina') + '</button></div></section></div>'
    : '';
  var message = state.account.error
    ? '<div class="account-settings-message is-error">' + escapeHtml(state.account.error) + '</div>'
    : (state.account.notice ? '<div class="account-settings-message">' + escapeHtml(state.account.notice) + '</div>' : '');
  var conflictNotice = state.syncConflictNotice
    ? '<section class="account-sync-conflict" role="status" aria-live="polite"><span>' + icons.activity + '</span><div><strong>Dati uniti in sicurezza</strong><p>' + escapeHtml(state.syncConflictNotice) + '</p></div><button data-retry-server-sync="1">Verifica ora</button><button data-dismiss-sync-conflict="1" aria-label="Chiudi avviso">' + icons.x + '</button></section>'
    : '';
  return '<section class="account-current-card"><span>' + escapeHtml(initial) + '</span><div><small>ACCOUNT ATTIVO</small><strong>' + escapeHtml(username) + '</strong><p>Database personale collegato</p></div><i>' + icons.check + '</i></section>' +
    '<div class="settings-v2-section-title">Stato dei dati</div>' +
    '<section class="account-sync-health' + syncHealthTone + '">' +
      '<div class="account-sync-health-head"><span>' + (isOnline ? icons.cloud : icons.activity) + '</span><div><small>SINCRONIZZAZIONE</small><strong>' + syncHealthTitle + '</strong><p data-sync-status-label aria-live="polite">' + escapeHtml(getSyncStatusMessage()) + '</p></div><b data-sync-status-state data-state="' + (isSyncPending ? 'pending' : (!isOnline ? 'offline' : 'synced')) + '">' + (isSyncPending ? 'IN ATTESA' : (!isOnline ? 'OFFLINE' : 'SALVATO')) + '</b></div>' +
      '<div class="account-sync-health-grid"><div><span>Server</span><strong>' + (isOnline ? 'Online' : 'Offline') + '</strong></div><div><span>Ultimo invio</span><strong>' + escapeHtml(lastSyncLabel) + '</strong></div><div><span>Copie protette</span><strong>' + backupItems.length + '</strong></div></div>' +
    '</section>' +
    conflictNotice +
    '<div class="settings-v2-section-title">Spazio sul server</div>' +
    '<section class="account-storage-card"><span class="account-storage-icon">' + icons.receipt + '</span><div class="account-storage-copy"><small>SPAZIO TOTALE OCCUPATO</small><strong>' + storageValue + '</strong><p>' + storageMeta + (storage.loaded && storage.backups ? (' - ' + storage.backups + ' copie protette') : '') + '</p></div><button type="button" data-refresh-account-storage="1" aria-label="Aggiorna spazio database" ' + (storage.loading ? 'disabled' : '') + '>' + icons.activity + '<span>Aggiorna</span></button></section>' +
    '<div class="settings-v2-section-title">Punti di ripristino</div>' +
    '<section class="account-versioned-card"><div class="account-versioned-head"><div><strong>Storico protetto</strong><small>Copie automatiche e manuali del tuo account</small></div><button data-create-versioned-backup="1" ' + (state.account.busy ? 'disabled' : '') + '>' + icons.cloud + '<span>Crea copia</span></button></div><div class="account-versioned-list">' + backupList + '</div></section>' +
    '<div class="settings-v2-section-title">Backup sul telefono</div>' +
    '<section class="account-backup-card"><div class="account-backup-copy"><span class="settings-v2-icon is-blue">' + icons.download + '</span><div><strong>Il tuo database, sempre con te</strong><p>Scarica un file SQLite con ore, ferie, impostazioni e buste del solo account ' + escapeHtml(username) + '.</p></div></div>' +
      '<button class="account-backup-primary" data-download-account-backup="1" ' + (state.account.busy ? 'disabled' : '') + '>' + icons.download + '<span>Scarica database</span></button>' +
      '<button class="account-backup-secondary" data-select-account-backup="1" ' + (state.account.busy ? 'disabled' : '') + '>' + icons.arrowUp + '<span>Ripristina un backup</span></button>' +
      '<input id="accountBackupFile" type="file" accept=".sqlite,.sqlite3,application/vnd.sqlite3,application/x-sqlite3" hidden>' +
    '</section>' +
    message +
    '<div class="settings-v2-section-title">Sessione</div>' +
    '<section class="settings-v2-group"><button class="account-logout-row" data-account-logout="1"><span class="settings-v2-icon is-violet">' + icons.user + '</span><span class="settings-v2-copy"><strong>Esci da ' + escapeHtml(username) + '</strong><small>Potrai accedere con un altro account</small></span><span class="settings-v2-chevron">' + icons.right + '</span></button></section>' +
    backupDecisionDialog;
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
      else if (form.dataset.accountForm === 'recover') submitAccountRecovery(form);
      else submitAccountLogin(form);
    };
  });
  var passkeyLogin = document.querySelector('[data-account-passkey-login]');
  if (passkeyLogin) passkeyLogin.onclick = loginWithAccountPasskey;
  var passkeyAdd = document.querySelector('[data-account-passkey-add]');
  if (passkeyAdd) passkeyAdd.onclick = registerAccountPasskey;
  var passkeyRefresh = document.querySelector('[data-account-passkeys-refresh]');
  if (passkeyRefresh) passkeyRefresh.onclick = function () { loadAccountPasskeys(true); };
  document.querySelectorAll('[data-account-passkey-delete]').forEach(function (button) {
    button.onclick = function () {
      var item = (state.account.passkeys.items || []).find(function (candidate) {
        return String(candidate.id) === String(button.dataset.accountPasskeyDelete);
      });
      if (item) setAccountUiState({ passkeyDeleteCandidate: item, error: '', notice: '' });
    };
  });
  var passkeyDeleteCancel = document.querySelector('[data-account-passkey-delete-cancel]');
  if (passkeyDeleteCancel) passkeyDeleteCancel.onclick = function () {
    setAccountUiState({ passkeyDeleteCandidate: null, error: '', notice: '' });
  };
  var passkeyDeleteConfirm = document.querySelector('[data-account-passkey-delete-confirm]');
  if (passkeyDeleteConfirm) passkeyDeleteConfirm.onclick = deleteAccountPasskey;
  var download = document.querySelector('[data-download-account-backup]');
  if (download) download.onclick = downloadAccountBackup;
  var select = document.querySelector('[data-select-account-backup]');
  var input = document.getElementById('accountBackupFile');
  if (select && input) select.onclick = function () { input.value = ''; input.click(); };
  if (input) input.onchange = function () { restoreAccountBackup(input.files && input.files[0]); };
  var logout = document.querySelector('[data-account-logout]');
  if (logout) logout.onclick = logoutAccount;
  var retrySync = document.querySelector('[data-retry-server-sync]');
  if (retrySync) retrySync.onclick = function () {
    state.syncConflictNotice = '';
    queueServerSync();
    render();
  };
  var dismissConflict = document.querySelector('[data-dismiss-sync-conflict]');
  if (dismissConflict) dismissConflict.onclick = function () {
    state.syncConflictNotice = '';
    render();
  };
  var refreshStorage = document.querySelector('[data-refresh-account-storage]');
  if (refreshStorage) refreshStorage.onclick = function () { loadAccountStorageUsage(true); };
  var createVersioned = document.querySelector('[data-create-versioned-backup]');
  if (createVersioned) createVersioned.onclick = createVersionedAccountBackup;
  document.querySelectorAll('[data-restore-versioned-backup]').forEach(function (button) {
    button.onclick = function () { requestVersionedBackupAction('restore', button.dataset.restoreVersionedBackup); };
  });
  document.querySelectorAll('[data-delete-versioned-backup]').forEach(function (button) {
    button.onclick = function () { requestVersionedBackupAction('delete', button.dataset.deleteVersionedBackup); };
  });
  document.querySelectorAll('[data-cancel-versioned-backup]').forEach(function (button) {
    button.onclick = function () { state.account.backupDecision = null; render(); };
  });
  var confirmVersioned = document.querySelector('[data-confirm-versioned-backup]');
  if (confirmVersioned) confirmVersioned.onclick = confirmVersionedBackupAction;
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
  if (state.activeTab === 'settings' && state.settingsSection === 'data' && state.account.authenticated && !state.account.backups.loaded && !state.account.backups.loading && !state.account.backups.error) {
    window.setTimeout(function () { loadVersionedAccountBackups(false); }, 0);
  }
  if (state.activeTab === 'settings' && state.settingsSection === 'privacy' && state.account.authenticated && !state.account.passkeys.loaded && !state.account.passkeys.loading && !state.account.passkeys.error) {
    window.setTimeout(function () { loadAccountPasskeys(false); }, 0);
  }
}
