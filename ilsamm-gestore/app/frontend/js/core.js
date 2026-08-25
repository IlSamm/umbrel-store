var errorBox = document.getElementById('errorBox');
    function showError(message) {
      if (!errorBox) return;
      errorBox.style.display = 'block';
      errorBox.textContent = message;
    }
    window.addEventListener('error', function (e) { showError('Errore JS: ' + e.message); });

    var STORAGE_ENTRIES = 'gestore-entries';
    var STORAGE_SETTINGS = 'gestore-settings';
    var STORAGE_PAYSLIPS = 'gestore-payslips';
    var STORAGE_PENDING_PAYSLIP = 'gestore-payslip-pending-v1';
    var STORAGE_PENDING_SYNC = 'gestore-pending-sync-v2';
    var SERVER_SYNC_URL = '/api/snapshot';
    var PAYSLIP_RECORD_URL = '/api/payslip';
    var ENTRY_BACKUP_KEYS = ['gestore-entries-backup-v1', 'gestore-entries-backup-v2'];
    var SETTINGS_BACKUP_KEYS = ['gestore-settings-backup-v1', 'gestore-settings-backup-v2'];
    var STORAGE_SAFETY_BUNDLE = 'gestore-safety-bundle-v1';
    var STORAGE_ENTRIES_CLEARED_AT = 'gestore-entries-cleared-at-v1';
    var serverSyncTimer = 0;
    var serverSyncInFlight = false;
    var serverSyncRevision = 0;
    var serverSyncConfirmedRevision = 0;
    var serverSyncReady = false;
    var serverSyncAllowEmptyEntries = false;
    var serverSyncLastError = '';
    var serverSyncRetryTimer = 0;
    var serverSyncRetryAttempt = 0;
    var serverSnapshotUpdatedAt = 0;
    var runtimeServicesStarted = false;
    var reminderTimer = 0;
    var reminderLastSentKey = '';
    var LEGACY_ENTRY_KEYS = [
      'gestore-entries',
      'gestore-iphone-simple-v11',
      'gestore-iphone-server-entries-v2',
      'gestore-iphone-html-entries-v1',
      'gestore-iphone-full-html-v2',
      'gestore-iphone-react-entries-v1'
    ];
    var LEGACY_SETTINGS_KEYS = [
      'gestore-settings',
      'gestore-iphone-simple-settings-v11',
      'gestore-iphone-server-settings-v2',
      'gestore-iphone-html-settings-v1',
      'gestore-iphone-full-settings-v2',
      'gestore-iphone-react-settings-v1'
    ];

    var defaultSettings = {
      weeklyTarget: 40,
      dailyTarget: 8,
      remindersEnabled: false,
      pushEnabled: false,
      reminderTime: '20:00',
      userName: 'Utente',
      profileAvatarMode: 'preset',
      profileAvatarPreset: 'nova',
      profileAvatarData: '',
      lockApp: false,
      workdays: [0,1,2,3,4],
      autoRestDays: [],
      holidayHoursOnOffDays: false,
      timerEnabled: false,
      onboardingCompleted: false,
      smartReminderMissingDays: true,
      smartReminderWeeklyReview: true,
      smartReminderPayslips: true,
      protectedHistoryFrequency: 'daily',
      homeShowQuickActions: true,
      homeShowActionCenter: true,
      homeShowMonthlyReview: true,
      homeShowWeeklyAnalytics: true,
      homeShowMonthlyAnalytics: true,
      homeShowSalaryPreview: false,
      shiftPresets: [
        { id: 'standard', label: 'Standard', start: '08:00', end: '17:00', breakHours: 1 },
        { id: 'mattina', label: 'Mattina', start: '06:00', end: '14:00', breakHours: 0.5 },
        { id: 'pomeriggio', label: 'Pomeriggio', start: '14:00', end: '22:00', breakHours: 0.5 }
      ],
      weeklyTemplate: [0, 0, 0, 0, 0, null, null],
      vacationAllowanceByYear: {},
      salaryRatesByMonth: {},
      payrollEstimateByMonth: {},
      defaultPayslipCompany: '',
      weekdayMode: 'monday',
      version: '1.8.16',
      build: '20260825g',
      appName: 'GestOre'
    };

    var weekNames = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
    var weekNamesFull = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
    var workdayLabels = ['L','M','M','G','V','S','D'];
    var monthNames = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
    var dayTypes = {
      lavoro: { label: 'Lavoro', dot: '#10b981' },
      lavoro_ferie: { label: 'Lavoro + ferie', dot: '#60a5fa' },
      ferie: { label: 'Ferie', dot: '#38bdf8' },
      malattia: { label: 'Malattia', dot: '#f59e0b' },
      permesso: { label: 'Permesso', dot: '#d946ef' },
      festivita_pagata: { label: 'Festivita pagata', dot: '#fb7185' },
      riposo: { label: 'Riposo', dot: '#64748b' }
    };

    function getCalendarEntryGroup(entry) {
      if (!entry) return '';
      if (entry.type === 'lavoro' || entry.type === 'lavoro_ferie') return 'work';
      if (entry.type === 'ferie' || entry.type === 'malattia' || entry.type === 'permesso') return 'absence';
      if (entry.type === 'riposo' || entry.type === 'festivita_pagata') return 'rest';
      return '';
    }

    var icons = {
      calendar: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"></rect><path d="M16 2v4M8 2v4M3 10h18"></path></svg>',
      activity: '<svg viewBox="0 0 24 24"><path d="M3 12h4l2-4 4 8 2-4h6"></path></svg>',
      left: '<svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"></path></svg>',
      right: '<svg viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"></path></svg>',
      target: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"></circle><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M22 12h-2M12 22v-2M2 12h2"></path></svg>',
      settings: '<svg viewBox="0 0 24 24"><path d="M12 15.5A3.5 3.5 0 1 0 12 8.5a3.5 3.5 0 0 0 0 7z"></path><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.08V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-.4-1.08 1.7 1.7 0 0 0-1-.6 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.08-.4H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.08-.4 1.7 1.7 0 0 0 .6-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.08V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 .4 1.08 1.7 1.7 0 0 0 1 .6 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.26.3.46.64.6 1 .1.32.25.63.46.88.3.26.68.4 1.08.4H21a2 2 0 1 1 0 4h-.09c-.4 0-.78.14-1.08.4-.21.25-.36.56-.46.88-.14.36-.34.7-.6 1Z"></path></svg>',
      home: '<svg viewBox="0 0 24 24"><path d="M3 10.5 12 3l9 7.5"></path><path d="M5 9.5V21h14V9.5"></path></svg>',
      receipt: '<svg viewBox="0 0 24 24"><path d="M7 3h10v18l-2-1.5L12 21l-3-1.5L7 21V3Z"></path><path d="M9 8h6M9 12h6M9 16h4"></path></svg>',
      briefcase: '<svg viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="13" rx="2"></rect><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M12 11v2"></path></svg>',
      star: '<svg viewBox="0 0 24 24"><path d="m12 3 2.7 5.47 6.03.88-4.36 4.25 1.03 6-5.4-2.84L6.6 19.6l1.03-6-4.36-4.25 6.03-.88L12 3Z"></path></svg>',
      coffee: '<svg viewBox="0 0 24 24"><path d="M6 8h10v6a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4V8Z"></path><path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16M8 4v2M12 4v2M16 4v2M5 20h13"></path></svg>',
      note: '<svg viewBox="0 0 24 24"><path d="M7 3h8l4 4v14H7V3Z"></path><path d="M15 3v5h5M9 12h6M9 16h5"></path></svg>',
      clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path></svg>',
      arrowUp: '<svg viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7"></path></svg>',
      trash: '<svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15M10 10v7M14 10v7"></path></svg>',
      x: '<svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"></path></svg>',
      lock: '<svg viewBox="0 0 24 24"><rect x="4" y="11" width="16" height="10" rx="2"></rect><path d="M8 11V8a4 4 0 1 1 8 0v3"></path></svg>',
      bell: '<svg viewBox="0 0 24 24"><path d="M15 17H5l2-2v-4a5 5 0 1 1 10 0v4l2 2h-4"></path><path d="M10 21a2 2 0 0 0 4 0"></path></svg>',
      check: '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"></path></svg>',
      plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"></path></svg>'
      ,umbrella: '<svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 0 1 18 0c-2-1.6-4-1.6-6 0-2-1.6-4-1.6-6 0-2-1.6-4-1.6-6 0Z"></path><path d="M12 3v15a3 3 0 0 0 6 0"></path></svg>'
      ,user: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"></circle><path d="M4 21a8 8 0 0 1 16 0"></path></svg>'
      ,download: '<svg viewBox="0 0 24 24"><path d="M12 3v12M7 10l5 5 5-5"></path><path d="M5 21h14"></path></svg>'
      ,search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-4-4"></path></svg>'
      ,play: '<svg viewBox="0 0 24 24"><path d="m8 5 11 7-11 7V5Z"></path></svg>'
      ,pause: '<svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"></path></svg>'
      ,stop: '<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"></rect></svg>'
      ,cloud: '<svg viewBox="0 0 24 24"><path d="M7 18h10a4 4 0 0 0 .8-7.92A6 6 0 0 0 6.3 8.2 5 5 0 0 0 7 18Z"></path><path d="m9 13 2 2 4-4"></path></svg>'
      ,history: '<svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"></path><path d="M3 3v5h5M12 7v5l3 2"></path></svg>'
      ,wallet: '<svg viewBox="0 0 24 24"><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H18a2 2 0 0 1 2 2v2H7a3 3 0 0 0 0 6h13v4a2 2 0 0 1-2 2H6.5A2.5 2.5 0 0 1 4 17.5v-11Z"></path><path d="M20 8H7a3 3 0 0 0 0 6h13V8Z"></path><circle cx="8" cy="11" r=".8"></circle></svg>'
      ,camera: '<svg viewBox="0 0 24 24"><path d="M4 7h4l1.5-2h5L16 7h4a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z"></path><circle cx="12" cy="13" r="4"></circle></svg>'
    };

    function loadStorage(key, fallback) {
      try { var raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
      catch (err) { return fallback; }
    }
    function readParsedStorage(key) {
      if (!key) return null;
      try {
        var raw = localStorage.getItem(key);
        if (!raw) return null;
        return { raw: raw, parsed: JSON.parse(raw) };
      } catch (err) {
        return null;
      }
    }
    function normalizeEntryMap(value) {
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    }
    function countEntryMap(value) {
      return Object.keys(normalizeEntryMap(value)).length;
    }
    function loadEntriesWithRecovery() {
      var primary = readParsedStorage(STORAGE_ENTRIES);
      var primaryEntries = normalizeEntryMap(primary && primary.parsed);
      if (countEntryMap(primaryEntries) > 0) return primaryEntries;

      var explicitlyClearedAt = 0;
      try { explicitlyClearedAt = Math.max(0, Number(localStorage.getItem(STORAGE_ENTRIES_CLEARED_AT) || 0) || 0); }
      catch (err) {}
      if (primary && explicitlyClearedAt > 0) return primaryEntries;

      var bestEntries = primaryEntries;
      var bestCount = 0;
      var seenKeys = {};
      var recoveryKeys = ENTRY_BACKUP_KEYS.concat(LEGACY_ENTRY_KEYS);
      for (var i = 0; i < recoveryKeys.length; i += 1) {
        var key = recoveryKeys[i];
        if (!key || key === STORAGE_ENTRIES || seenKeys[key]) continue;
        seenKeys[key] = true;
        var candidate = readParsedStorage(key);
        var candidateEntries = normalizeEntryMap(candidate && candidate.parsed);
        var candidateCount = countEntryMap(candidateEntries);
        if (candidateCount > bestCount) {
          bestEntries = candidateEntries;
          bestCount = candidateCount;
        }
      }

      var safetyBundle = readParsedStorage(STORAGE_SAFETY_BUNDLE);
      var bundledEntries = normalizeEntryMap(safetyBundle && safetyBundle.parsed && safetyBundle.parsed.entries);
      if (countEntryMap(bundledEntries) > bestCount) bestEntries = bundledEntries;

      if (countEntryMap(bestEntries) > 0) {
        try { localStorage.setItem(STORAGE_ENTRIES, JSON.stringify(bestEntries)); } catch (err) {}
      }
      return bestEntries;
    }
    function persistJson(primaryKey, backupKeys, value) {
      var raw = JSON.stringify(value);
      try { localStorage.setItem(primaryKey, raw); } catch (err) {}
      if (backupKeys && backupKeys.length) {
        for (var i = 0; i < backupKeys.length; i += 1) {
          try { localStorage.setItem(backupKeys[i], raw); } catch (err) {}
        }
      }
    }
    function persistEntriesLocally(options) {
      var entries = normalizeEntryMap(state && state.entries);
      var raw = JSON.stringify(entries);
      var hasEntries = countEntryMap(entries) > 0;
      try { localStorage.setItem(STORAGE_ENTRIES, raw); } catch (err) {}
      if (hasEntries) {
        for (var i = 0; i < ENTRY_BACKUP_KEYS.length; i += 1) {
          try { localStorage.setItem(ENTRY_BACKUP_KEYS[i], raw); } catch (err) {}
        }
        try { localStorage.removeItem(STORAGE_ENTRIES_CLEARED_AT); } catch (err) {}
      } else if (options && options.explicitEmpty === true) {
        try { localStorage.setItem(STORAGE_ENTRIES_CLEARED_AT, String(Date.now())); } catch (err) {}
      }
    }
    function compactPayslipsForDeviceStorage(items) {
      return (Array.isArray(items) ? items : []).map(function (item) {
        var record = Object.assign({}, item && typeof item === 'object' ? item : {});
        var photos = Array.isArray(record.photos) ? record.photos : [];
        var photoCount = Math.max(photos.length, Number(record.photoCount) || (record.imageData ? 1 : 0));
        var hasSourceText = Boolean(record.sourceText || record.sourceTextDeferred);
        delete record.photos;
        delete record.imageData;
        delete record.sourceText;
        record.photoCount = Math.max(0, photoCount);
        record.photosDeferred = record.photoCount > 0;
        record.sourceTextDeferred = hasSourceText;
        return record;
      });
    }
    function persistSettingsLocally() { persistJson(STORAGE_SETTINGS, SETTINGS_BACKUP_KEYS, state.settings); }
    function persistPayslipsLocally() {
      try { localStorage.setItem(STORAGE_PAYSLIPS, JSON.stringify(compactPayslipsForDeviceStorage(state.payslips || []))); } catch (err) {}
    }
    function loadPayslipsWithRecovery() {
      var primary = readParsedStorage(STORAGE_PAYSLIPS);
      if (primary && Array.isArray(primary.parsed)) return primary.parsed;
      var safetyBundle = readParsedStorage(STORAGE_SAFETY_BUNDLE);
      var bundledPayslips = safetyBundle && safetyBundle.parsed && safetyBundle.parsed.payslips;
      if (Array.isArray(bundledPayslips)) {
        try { localStorage.setItem(STORAGE_PAYSLIPS, JSON.stringify(bundledPayslips)); } catch (err) {}
        return bundledPayslips;
      }
      return [];
    }
    function areSettingsEffectivelyDefault(settings) {
      var candidate = normalizeRuntimeSettings(settings || {});
      return Number(candidate.weeklyTarget) === Number(defaultSettings.weeklyTarget) &&
        Number(candidate.dailyTarget) === Number(defaultSettings.dailyTarget) &&
        Boolean(candidate.remindersEnabled) === Boolean(defaultSettings.remindersEnabled) &&
        Boolean(candidate.pushEnabled) === Boolean(defaultSettings.pushEnabled) &&
        String(candidate.reminderTime || '') === String(defaultSettings.reminderTime || '') &&
        String(candidate.userName || '') === String(defaultSettings.userName || '') &&
        String(candidate.profileAvatarMode || '') === String(defaultSettings.profileAvatarMode || '') &&
        String(candidate.profileAvatarPreset || '') === String(defaultSettings.profileAvatarPreset || '') &&
        String(candidate.profileAvatarData || '') === String(defaultSettings.profileAvatarData || '') &&
        Boolean(candidate.lockApp) === Boolean(defaultSettings.lockApp) &&
        normalizeWeekdayList(candidate.workdays || []).join(',') === normalizeWeekdayList(defaultSettings.workdays || []).join(',') &&
        normalizeWeekdayList(candidate.autoRestDays || []).join(',') === normalizeWeekdayList(defaultSettings.autoRestDays || []).join(',') &&
        Boolean(candidate.holidayHoursOnOffDays) === Boolean(defaultSettings.holidayHoursOnOffDays) &&
        Boolean(candidate.timerEnabled) === Boolean(defaultSettings.timerEnabled) &&
        Boolean(candidate.onboardingCompleted) === Boolean(defaultSettings.onboardingCompleted) &&
        Boolean(candidate.smartReminderMissingDays) === Boolean(defaultSettings.smartReminderMissingDays) &&
        Boolean(candidate.smartReminderWeeklyReview) === Boolean(defaultSettings.smartReminderWeeklyReview) &&
        Boolean(candidate.smartReminderPayslips) === Boolean(defaultSettings.smartReminderPayslips) &&
        Boolean(candidate.homeShowQuickActions) === Boolean(defaultSettings.homeShowQuickActions) &&
        Boolean(candidate.homeShowActionCenter) === Boolean(defaultSettings.homeShowActionCenter) &&
        Boolean(candidate.homeShowMonthlyReview) === Boolean(defaultSettings.homeShowMonthlyReview) &&
        Boolean(candidate.homeShowWeeklyAnalytics) === Boolean(defaultSettings.homeShowWeeklyAnalytics) &&
        Boolean(candidate.homeShowMonthlyAnalytics) === Boolean(defaultSettings.homeShowMonthlyAnalytics) &&
        Boolean(candidate.homeShowSalaryPreview) === Boolean(defaultSettings.homeShowSalaryPreview) &&
        JSON.stringify(candidate.shiftPresets || []) === JSON.stringify(defaultSettings.shiftPresets || []) &&
        JSON.stringify(candidate.weeklyTemplate || []) === JSON.stringify(defaultSettings.weeklyTemplate || []) &&
        JSON.stringify(candidate.vacationAllowanceByYear || {}) === JSON.stringify(defaultSettings.vacationAllowanceByYear || {}) &&
        String(candidate.weekdayMode || '') === String(defaultSettings.weekdayMode || '') &&
        String(candidate.version || '') === String(defaultSettings.version || '') &&
        String(candidate.appName || '') === String(defaultSettings.appName || '');
    }
    function saveSafetyBundle() {
      try {
        var nextBundle = {
          entries: state && state.entries ? state.entries : {},
          settings: state && state.settings ? state.settings : {},
          payslips: compactPayslipsForDeviceStorage(state && Array.isArray(state.payslips) ? state.payslips : []),
          version: 2
        };
        var previous = readParsedStorage(STORAGE_SAFETY_BUNDLE);
        var previousBundle = previous && previous.parsed ? previous.parsed : null;
        var previousSignature = previousBundle ? JSON.stringify({
          entries: previousBundle.entries || {},
          settings: previousBundle.settings || {},
          payslips: Array.isArray(previousBundle.payslips) ? previousBundle.payslips : []
        }) : '';
        var nextSignature = JSON.stringify({
          entries: nextBundle.entries,
          settings: nextBundle.settings,
          payslips: nextBundle.payslips
        });
        nextBundle.savedAt = previousBundle && previousSignature === nextSignature
          ? Math.max(0, Number(previousBundle.savedAt || 0) || 0)
          : Date.now();
        if (!nextBundle.savedAt) nextBundle.savedAt = Date.now();
        localStorage.setItem(STORAGE_SAFETY_BUNDLE, JSON.stringify(nextBundle));
      } catch (err) {}
    }
    function getLocalBundleTimestamp() {
      var bundle = readParsedStorage(STORAGE_SAFETY_BUNDLE);
      if (!bundle || !bundle.parsed) return 0;
      return Math.max(0, Number(bundle.parsed.savedAt || 0) || 0);
    }
    function loadWithMigration(primaryKey, legacyKeys, backupKeys, fallback, bundleField) {
      try {
        var keysToTry = [primaryKey].concat(legacyKeys || []).concat(backupKeys || []);
        for (var i = 0; i < keysToTry.length; i += 1) {
          var found = readParsedStorage(keysToTry[i]);
          if (!found) continue;
          if (keysToTry[i] !== primaryKey) {
            try { localStorage.setItem(primaryKey, found.raw); } catch (err) {}
          }
          return found.parsed;
        }
        if (bundleField) {
          var bundle = readParsedStorage(STORAGE_SAFETY_BUNDLE);
          if (bundle && bundle.parsed && bundle.parsed[bundleField] !== undefined) {
            var bundleRaw = JSON.stringify(bundle.parsed[bundleField]);
            try { localStorage.setItem(primaryKey, bundleRaw); } catch (err) {}
            return bundle.parsed[bundleField];
          }
        }
        return fallback;
      } catch (err) {
        return fallback;
      }
    }
    function saveEntries() {
      var isExplicitlyEmpty = countEntryMap(state && state.entries) === 0;
      persistEntriesLocally({ explicitEmpty: isExplicitlyEmpty });
      if (isExplicitlyEmpty) serverSyncAllowEmptyEntries = true;
      saveSafetyBundle();
      if (typeof scheduleCurrentAccountDeviceCache === 'function') scheduleCurrentAccountDeviceCache();
      queueServerSync();
    }
    function saveSettings() {
      if (state && state.settings) {
        state.settings = normalizeRuntimeSettings(state.settings);
        state.settingsDraft = Object.assign({}, state.settings);
      }
      persistSettingsLocally();
      saveSafetyBundle();
      if (typeof scheduleCurrentAccountDeviceCache === 'function') scheduleCurrentAccountDeviceCache();
      queueServerSync();
    }
    function savePayslips() {
      persistPayslipsLocally();
      saveSafetyBundle();
      if (typeof scheduleCurrentAccountDeviceCache === 'function') scheduleCurrentAccountDeviceCache();
      queueServerSync();
    }
    function pad(v) { return String(v).padStart(2, '0'); }
    function toISODate(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
    function mondayIndex(jsDay) { return (jsDay + 6) % 7; }
    function normalizeWeekdayList(arr) {
      return Array.isArray(arr) ? arr.map(function (v) { return Number(v); }).filter(function (v) { return Number.isInteger(v) && v >= 0 && v <= 6; }).sort(function (a, b) { return a - b; }) : [];
    }
    function remapLegacyWeekdayList(arr) {
      return Array.isArray(arr)
        ? normalizeWeekdayList(arr.map(function (v) { return mondayIndex(Number(v)); }))
        : [];
    }
    function shouldMigrateLegacyWeekdaySettings(source) {
      if (!source || typeof source !== 'object') return false;
      if (String(source.weekdayMode || '') === String(defaultSettings.weekdayMode || '')) return false;
      var workdaySignature = normalizeWeekdayList(source.workdays || []).join(',');
      return workdaySignature === '1,2,3,4,5' || workdaySignature === '1,2,3,4,5,6';
    }
    function normalizeShiftPresetTime(value, fallback) {
      var match = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
      if (!match) return fallback;
      var hours = Number(match[1]);
      var minutes = Number(match[2]);
      if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return fallback;
      return pad(hours) + ':' + pad(minutes);
    }
    function normalizeShiftPresets(value) {
      var source = Array.isArray(value) && value.length ? value : defaultSettings.shiftPresets;
      return source.slice(0, 4).map(function (item, index) {
        var fallback = defaultSettings.shiftPresets[index] || defaultSettings.shiftPresets[0];
        var current = item && typeof item === 'object' ? item : {};
        var label = String(current.label || fallback.label || ('Turno ' + (index + 1))).trim().slice(0, 18);
        var breakHours = Number(current.breakHours);
        if (!Number.isFinite(breakHours)) breakHours = Number(fallback.breakHours) || 0;
        return {
          id: String(current.id || fallback.id || ('turno-' + (index + 1))).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24) || ('turno-' + (index + 1)),
          label: label || ('Turno ' + (index + 1)),
          start: normalizeShiftPresetTime(current.start, fallback.start || '08:00'),
          end: normalizeShiftPresetTime(current.end, fallback.end || '17:00'),
          breakHours: Math.min(12, Math.max(0, Math.round(breakHours * 4) / 4))
        };
      });
    }
    function normalizeWeeklyTemplate(value) {
      var source = Array.isArray(value) && value.length === 7 ? value : defaultSettings.weeklyTemplate;
      return source.map(function (item) {
        if (item === 'rest') return 'rest';
        if (item === null || item === undefined || item === '') return null;
        var index = Number(item);
        return Number.isInteger(index) && index >= 0 && index < 4 ? index : null;
      });
    }
    function normalizeRuntimeSettings(source) {
      var raw = source && typeof source === 'object' ? source : {};
      var merged = Object.assign({}, defaultSettings, raw);
      if (shouldMigrateLegacyWeekdaySettings(raw)) {
        merged.workdays = remapLegacyWeekdayList(raw.workdays || []);
        if (Array.isArray(raw.autoRestDays)) merged.autoRestDays = remapLegacyWeekdayList(raw.autoRestDays || []);
      }
      merged.workdays = normalizeWeekdayList(merged.workdays || defaultSettings.workdays || []);
      merged.autoRestDays = normalizeWeekdayList(merged.autoRestDays || []);
      merged.holidayHoursOnOffDays = Boolean(merged.holidayHoursOnOffDays);
      merged.timerEnabled = Boolean(merged.timerEnabled);
      merged.pushEnabled = Boolean(merged.pushEnabled);
      merged.onboardingCompleted = Boolean(merged.onboardingCompleted);
      merged.smartReminderMissingDays = merged.smartReminderMissingDays !== false;
      merged.smartReminderWeeklyReview = merged.smartReminderWeeklyReview !== false;
      merged.smartReminderPayslips = merged.smartReminderPayslips !== false;
      if (['off', 'daily', 'every3days', 'weekly', 'monthly'].indexOf(String(merged.protectedHistoryFrequency || '')) === -1) {
        merged.protectedHistoryFrequency = defaultSettings.protectedHistoryFrequency;
      }
      merged.homeShowQuickActions = merged.homeShowQuickActions !== false;
      merged.homeShowActionCenter = merged.homeShowActionCenter !== false;
      merged.homeShowMonthlyReview = merged.homeShowMonthlyReview !== false;
      merged.homeShowWeeklyAnalytics = merged.homeShowWeeklyAnalytics !== false;
      merged.homeShowMonthlyAnalytics = merged.homeShowMonthlyAnalytics !== false;
      merged.homeShowSalaryPreview = merged.homeShowSalaryPreview === true;
      merged.profileAvatarMode = ['preset', 'photo', 'initials'].indexOf(String(merged.profileAvatarMode || '')) !== -1
        ? String(merged.profileAvatarMode)
        : defaultSettings.profileAvatarMode;
      var avatarPresetAliases = {
        hours: 'byte',
        work: 'milo',
        focus: 'lumi',
        vacation: 'pico',
        pay: 'nori'
      };
      var requestedAvatarPreset = String(merged.profileAvatarPreset || '');
      requestedAvatarPreset = avatarPresetAliases[requestedAvatarPreset] || requestedAvatarPreset;
      merged.profileAvatarPreset = ['nova', 'byte', 'milo', 'lumi', 'pico', 'nori', 'aria', 'zed', 'orbit', 'rex', 'kira', 'mocha'].indexOf(requestedAvatarPreset) !== -1
        ? requestedAvatarPreset
        : defaultSettings.profileAvatarPreset;
      var avatarData = typeof merged.profileAvatarData === 'string' ? merged.profileAvatarData : '';
      merged.profileAvatarData = /^data:image\/(?:jpeg|png|webp);base64,/i.test(avatarData) && avatarData.length <= 500000
        ? avatarData
        : '';
      if (merged.profileAvatarMode === 'photo' && !merged.profileAvatarData) merged.profileAvatarMode = 'preset';
      merged.defaultPayslipCompany = String(merged.defaultPayslipCompany || '').trim().slice(0, 120);
      merged.shiftPresets = normalizeShiftPresets(merged.shiftPresets);
      merged.weeklyTemplate = normalizeWeeklyTemplate(merged.weeklyTemplate);
      var rawVacationAllowances = merged.vacationAllowanceByYear && typeof merged.vacationAllowanceByYear === 'object' && !Array.isArray(merged.vacationAllowanceByYear)
        ? merged.vacationAllowanceByYear
        : {};
      merged.vacationAllowanceByYear = Object.keys(rawVacationAllowances).reduce(function (result, yearKey) {
        var year = Number(yearKey);
        var days = parseDecimalInput(rawVacationAllowances[yearKey], 0);
        if (Number.isInteger(year) && year >= 2000 && year <= 2200 && days >= 0) result[String(year)] = Math.min(366, days);
        return result;
      }, {});
      var rawSalaryRates = merged.salaryRatesByMonth && typeof merged.salaryRatesByMonth === 'object' && !Array.isArray(merged.salaryRatesByMonth)
        ? merged.salaryRatesByMonth
        : {};
      merged.salaryRatesByMonth = Object.keys(rawSalaryRates).reduce(function (result, monthKey) {
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey)) return result;
        var rateSource = rawSalaryRates[monthKey] && typeof rawSalaryRates[monthKey] === 'object' ? rawSalaryRates[monthKey] : {};
        var hourlyRate = Math.min(10000, Math.max(0, parseDecimalInput(rateSource.hourlyRate, 0)));
        var overtimeRate = Math.min(10000, Math.max(0, parseDecimalInput(rateSource.overtimeRate, 0)));
        var legacyHoursLimit = Math.min(744, Math.max(0, parseDecimalInput(rateSource.ordinaryHoursLimit, 0)));
        var overtimeHoursLimit = Math.min(744, Math.max(0, parseDecimalInput(
          rateSource.overtimeHoursLimit !== undefined ? rateSource.overtimeHoursLimit : legacyHoursLimit,
          0
        )));
        var overtimeLimitEnabled = (
          rateSource.overtimeLimitEnabled === true ||
          (rateSource.overtimeLimitEnabled === undefined && rateSource.limitEnabled === true)
        ) && overtimeHoursLimit > 0;
        if (!hourlyRate && !overtimeRate && !overtimeLimitEnabled) return result;
        result[monthKey] = {
          hourlyRate: hourlyRate,
          overtimeRate: overtimeRate,
          overtimeHoursLimit: overtimeHoursLimit,
          overtimeLimitEnabled: overtimeLimitEnabled,
          updatedAt: Math.max(0, Number(rateSource.updatedAt) || 0)
        };
        return result;
      }, {});
      var rawPayrollEstimates = merged.payrollEstimateByMonth && typeof merged.payrollEstimateByMonth === 'object' && !Array.isArray(merged.payrollEstimateByMonth)
        ? merged.payrollEstimateByMonth
        : {};
      var payrollApi = typeof globalThis !== 'undefined' ? globalThis.GestOrePayroll : null;
      merged.payrollEstimateByMonth = Object.keys(rawPayrollEstimates).reduce(function (result, monthKey) {
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey)) return result;
        var sourceConfig = rawPayrollEstimates[monthKey] && typeof rawPayrollEstimates[monthKey] === 'object'
          ? rawPayrollEstimates[monthKey]
          : {};
        var normalizedConfig = payrollApi && typeof payrollApi.normalizePayrollInput === 'function'
          ? payrollApi.normalizePayrollInput(sourceConfig)
          : Object.assign({}, sourceConfig);
        if (!(Number(normalizedConfig.baseMonthlyGross) > 0)) return result;
        normalizedConfig.updatedAt = Math.max(0, Number(sourceConfig.updatedAt) || 0);
        result[monthKey] = normalizedConfig;
        return result;
      }, {});
      merged.weekdayMode = defaultSettings.weekdayMode;
      merged.version = defaultSettings.version;
      merged.build = defaultSettings.build;
      return merged;
    }
    function getShiftPresets(source) {
      var settingsSource = normalizeRuntimeSettings(source || (state && state.settings) || defaultSettings);
      return settingsSource.shiftPresets.map(function (item) { return Object.assign({}, item); });
    }
    function getWeeklyTemplate(source) {
      var settingsSource = normalizeRuntimeSettings(source || (state && state.settings) || defaultSettings);
      return settingsSource.weeklyTemplate.slice();
    }
    function getAutoRestDays(source) {
      var settingsSource = normalizeRuntimeSettings(source || (state && state.settings) || defaultSettings);
      return settingsSource.autoRestDays.slice();
    }
    function getConfiguredWorkdays(source) {
      var settingsSource = normalizeRuntimeSettings(source || (state && state.settings) || defaultSettings);
      return settingsSource.workdays.slice();
    }
    function isConfiguredWorkday(dateOrKey, source) {
      var current = typeof dateOrKey === 'string' ? new Date(dateOrKey + 'T12:00:00') : new Date(dateOrKey);
      if (!current || Number.isNaN(current.getTime())) return false;
      return getConfiguredWorkdays(source).indexOf(mondayIndex(current.getDay())) !== -1;
    }
    function getDefaultPaidDayHours(source) {
      var settingsSource = normalizeRuntimeSettings(source || (state && state.settings) || defaultSettings);
      var raw = Number(settingsSource.dailyTarget);
      if (Number.isFinite(raw) && raw >= 0) return raw;
      return Math.max(0, Number(defaultSettings.dailyTarget) || 0);
    }
    function shouldHolidayCoverHoursOnDate(dateOrKey, source) {
      var settingsSource = normalizeRuntimeSettings(source || (state && state.settings) || defaultSettings);
      if (Boolean(settingsSource.holidayHoursOnOffDays)) return true;
      var current = typeof dateOrKey === 'string' ? new Date(dateOrKey + 'T12:00:00') : new Date(dateOrKey);
      if (!current || Number.isNaN(current.getTime())) return false;
      var weekdayIndex = mondayIndex(current.getDay());
      if (weekdayIndex >= 5) return false;
      return isConfiguredWorkday(dateOrKey, settingsSource);
    }
    function getAutoHolidayHours(dateOrKey, source) {
      return shouldHolidayCoverHoursOnDate(dateOrKey, source) ? getDefaultPaidDayHours(source) : 0;
    }
    function getHolidaySettingsHelperText(source) {
      var settingsSource = normalizeRuntimeSettings(source || (state && state.settings) || defaultSettings);
      if (Boolean(settingsSource.holidayHoursOnOffDays)) return 'I festivi coprono il target anche su sabato, domenica e fuori dai giorni attivi.';
      return 'I festivi si vedono sempre, ma sabato e domenica non coprono mai ore. Negli altri giorni seguono i giorni attivi.';
    }
    function getEasterSunday(year) {
      var a = year % 19;
      var b = Math.floor(year / 100);
      var c = year % 100;
      var d = Math.floor(b / 4);
      var e = b % 4;
      var f = Math.floor((b + 8) / 25);
      var g = Math.floor((b - f + 1) / 3);
      var h = (19 * a + b - d - g + 15) % 30;
      var i = Math.floor(c / 4);
      var k = c % 4;
      var l = (32 + (2 * e) + (2 * i) - h - k) % 7;
      var m = Math.floor((a + (11 * h) + (22 * l)) / 451);
      var month = Math.floor((h + l - (7 * m) + 114) / 31);
      var day = ((h + l - (7 * m) + 114) % 31) + 1;
      return new Date(year, month - 1, day);
    }
    function getItalianHolidayInfo(dateOrKey) {
      var current = typeof dateOrKey === 'string' ? new Date(dateOrKey + 'T12:00:00') : new Date(dateOrKey);
      if (!current || Number.isNaN(current.getTime())) return null;
      var fixed = {
        '1-1': 'Capodanno',
        '1-6': 'Epifania',
        '4-25': 'Festa della Liberazione',
        '5-1': 'Festa del Lavoro',
        '6-2': 'Festa della Repubblica',
        '8-15': 'Ferragosto',
        '11-1': 'Ognissanti',
        '12-8': 'Immacolata Concezione',
        '12-25': 'Natale',
        '12-26': 'Santo Stefano'
      };
      var fixedName = fixed[(current.getMonth() + 1) + '-' + current.getDate()];
      if (fixedName) return { name: fixedName };
      var easter = getEasterSunday(current.getFullYear());
      if (easter.getMonth() === current.getMonth() && easter.getDate() === current.getDate()) return { name: 'Pasqua' };
      var easterMonday = new Date(easter);
      easterMonday.setDate(easter.getDate() + 1);
      if (easterMonday.getMonth() === current.getMonth() && easterMonday.getDate() === current.getDate()) return { name: 'Lunedi dell\'Angelo' };
      return null;
    }
    function getHolidayDisplayName(entry, dateOrKey) {
      if (entry && entry.holidayName) return String(entry.holidayName);
      var holidayInfo = getItalianHolidayInfo(dateOrKey);
      return holidayInfo && holidayInfo.name ? holidayInfo.name : '';
    }
    function getEntryForDate(dateOrKey) {
      var key = typeof dateOrKey === 'string' ? dateOrKey : toISODate(dateOrKey);
      var manual = state.entries[key];
      if (manual) return manual;
      var current = typeof dateOrKey === 'string' ? new Date(key + 'T12:00:00') : new Date(dateOrKey);
      var holidayInfo = getItalianHolidayInfo(current);
      if (holidayInfo) {
        return {
          type: 'festivita_pagata',
          start: '',
          end: '',
          breakHours: 0,
          overtimeHours: 0,
          overtimeManual: false,
          leaveHours: 0,
          quantityHours: getAutoHolidayHours(current),
          notes: '',
          autoHoliday: true,
          holidayName: holidayInfo.name
        };
      }
      if (getAutoRestDays().indexOf(mondayIndex(current.getDay())) !== -1) {
        return { type: 'riposo', start: '', end: '', breakHours: 0, overtimeHours: 0, overtimeManual: false, leaveHours: 0, quantityHours: 0, notes: '', autoRest: true };
      }
      return null;
    }
    function formatMonthYear(d) { return monthNames[d.getMonth()] + ' ' + d.getFullYear(); }
    function getDisplayUserName() {
      var raw = state && state.settings && state.settings.userName ? String(state.settings.userName) : '';
      raw = raw.trim().slice(0, 24);
      return raw || 'Utente';
    }
    function getDynamicWelcomeLabel() {
      var hour = new Date().getHours();
      var fullName = getDisplayUserName();
      var firstName = fullName.split(/\s+/).filter(Boolean)[0] || fullName;
      firstName = firstName.trim().slice(0, 10);
      var greeting = 'Bentornato';
      if (hour < 12) greeting = 'Buongiorno';
      else if (hour >= 18) greeting = 'Buonasera';
      var label = greeting + ' ' + firstName;
      if (label.length > 16) label = greeting;
      return label;
    }
    function parseDecimalInput(value, fallback) {
      if (typeof value === 'number') return Math.max(0, value);
      var raw = value === null || value === undefined ? '' : String(value).trim();
      if (!raw) return fallback === undefined ? 0 : fallback;
      raw = raw.replace(/\s+/g, '').replace(',', '.').replace(/[^\d.\-]/g, '');
      var firstDot = raw.indexOf('.');
      if (firstDot !== -1) raw = raw.slice(0, firstDot + 1) + raw.slice(firstDot + 1).replace(/\./g, '');
      var parsed = parseFloat(raw);
      if (!Number.isFinite(parsed)) return fallback === undefined ? 0 : fallback;
      return Math.max(0, parsed);
    }
    function sanitizeDecimalTyping(value) {
      var raw = value === null || value === undefined ? '' : String(value);
      raw = raw.replace(/\s+/g, '').replace(/[^\d,\.]/g, '');
      var separatorIndex = raw.search(/[\.,]/);
      if (separatorIndex !== -1) {
        var head = raw.slice(0, separatorIndex + 1);
        var tail = raw.slice(separatorIndex + 1).replace(/[\.,]/g, '');
        raw = head + tail;
      }
      return raw;
    }
    function isZeroLikeDecimalText(value) {
      return /^0([\.,]0*)?$/.test(String(value === null || value === undefined ? '' : value).trim());
    }
    function sanitizeTimeTyping(value) {
      var raw = value === null || value === undefined ? '' : String(value);
      raw = raw.replace(/\s+/g, '').replace(/[^\d:.,]/g, '').replace(/[.,]/g, ':');
      raw = raw.replace(/:{2,}/g, ':');
      var firstColon = raw.indexOf(':');
      if (firstColon !== -1) raw = raw.slice(0, firstColon + 1) + raw.slice(firstColon + 1).replace(/:/g, '');
      if (firstColon === -1) return raw.slice(0, 4);
      var hours = raw.slice(0, firstColon).slice(0, 2);
      var minutes = raw.slice(firstColon + 1).slice(0, 2);
      return hours + ':' + minutes;
    }
    function normalizeTimeInputValue(value) {
      var raw = value === null || value === undefined ? '' : String(value).trim();
      if (!raw) return '';
      raw = raw.replace(/\s+/g, '').replace(/[.,]/g, ':');
      var h = null, m = 0;
      if (/^\d{1,2}$/.test(raw)) {
        h = Number(raw);
        m = 0;
      } else if (/^\d{3}$/.test(raw)) {
        h = Number(raw.slice(0, 1));
        m = Number(raw.slice(1));
      } else if (/^\d{4}$/.test(raw)) {
        h = Number(raw.slice(0, 2));
        m = Number(raw.slice(2));
      } else if (/^\d{1,2}:\d{1,2}$/.test(raw)) {
        var parts = raw.split(':');
        h = Number(parts[0]);
        m = Number(parts[1]);
      } else {
        return '';
      }
      if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) return '';
      return pad(h) + ':' + pad(m);
    }
    function hoursToMinutes(h) { return Math.max(0, Math.round(parseDecimalInput(h, 0) * 60)); }
    function minutesToHours(m) { return Math.max(0, Number(m) || 0) / 60; }
    function formatDuration(min) { var t = Math.max(0, Number(min) || 0); return Math.floor(t / 60) + 'h ' + (t % 60) + 'm'; }
    function formatHourValue(h) { var v = Math.max(0, parseDecimalInput(h, 0)); return Number.isInteger(v) ? (v + 'h') : (v.toFixed(1).replace(/\.0$/, '') + 'h'); }
    function formatEditorDecimal(h) {
      var v = Math.max(0, Math.round(parseDecimalInput(h, 0) * 100) / 100);
      return Number.isInteger(v) ? String(v) : String(v).replace('.', ',');
    }
    function makeEmptyDayDraft() {
      return { type: 'lavoro', start: '', end: '', breakHours: 0, overtimeHours: 0, overtimeManual: false, leaveHours: 0, quantityHours: 0, notes: '' };
    }
    function hasMeaningfulDayData(draft) {
      if (!draft) return false;
      return Boolean(draft.start || draft.end || parseDecimalInput(draft.breakHours, 0) || parseDecimalInput(draft.overtimeHours, 0) || parseDecimalInput(draft.leaveHours, 0) || parseDecimalInput(draft.quantityHours, 0) || (draft.notes && draft.notes.trim()) || draft.type !== 'lavoro');
    }
    function escapeHtml(v) {
      var value = v === null || v === undefined ? '' : String(v);
      return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }
    function escapeCsvCell(v) {
      var s = v === null || v === undefined ? '' : String(v);
      var needsQuotes = s.indexOf(',') !== -1 || s.indexOf('"') !== -1 || s.indexOf('\n') !== -1;
      return needsQuotes ? ('"' + s.replace(/"/g, '""') + '"') : s;
    }
    function parseTimeToMinutes(v) {
      var normalized = normalizeTimeInputValue(v);
      if (!normalized) return null;
      var parts = normalized.split(':').map(Number);
      if (parts.length !== 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) return null;
      return parts[0] * 60 + parts[1];
    }
    function calcWorkedMinutes(e) {
      var entry = e || {};
      var s = parseTimeToMinutes(entry.start);
      var en = parseTimeToMinutes(entry.end);
      var b = hoursToMinutes(entry.breakHours || 0);
      if (s === null || en === null) return 0;
      var gross = en - s;
      if (gross <= 0) gross += 1440;
      return Math.max(0, gross - b);
    }
    function isStateOnlyType(type) {
      return type === 'ferie' || type === 'malattia' || type === 'permesso' || type === 'festivita_pagata' || type === 'riposo';
    }
    function isMixedType(type) {
      return type === 'lavoro_ferie';
    }
    function getDailyTargetMinutes() {
      return Math.max(0, hoursToMinutes(getDefaultPaidDayHours()));
    }
    function getStateOnlyCoveredHours(entry) {
      if (!entry) return 0;
      if (entry.quantityHours !== undefined && entry.quantityHours !== null && String(entry.quantityHours).trim() !== '') {
        return parseDecimalInput(entry.quantityHours, 0);
      }
      if (entry.type === 'ferie' || entry.type === 'malattia' || entry.type === 'permesso' || entry.type === 'festivita_pagata') {
        return getDefaultPaidDayHours();
      }
      return 0;
    }
    function hasManualOvertime(entry) {
      if (!entry) return false;
      if (entry.overtimeManual === true) return true;
      if (entry.overtimeManual === false) return false;
      return parseDecimalInput(entry.overtimeHours, 0) > 0;
    }
    function getAutoOvertimeMinutes(entry) {
      if (!entry || (entry.type !== 'lavoro' && entry.type !== 'lavoro_ferie')) return 0;
      var total = calcWorkedMinutes(entry);
      var target = getDailyTargetMinutes();
      if (!target) return 0;
      return Math.max(0, total - target);
    }
    function getBreakdown(e) {
      if (!e) return { total: 0, normal: 0, overtime: 0, leave: 0, covered: 0 };
      var total = 0;
      var leave = 0;
      if (e.type === 'lavoro' || e.type === 'lavoro_ferie') {
        total = calcWorkedMinutes(e);
        if (e.type === 'lavoro_ferie') leave = hoursToMinutes(e.leaveHours || 0);
      } else if (e.type === 'ferie' || e.type === 'malattia' || e.type === 'permesso' || e.type === 'festivita_pagata') {
        leave = hoursToMinutes(getStateOnlyCoveredHours(e));
      }
      var usesManualOvertime = hasManualOvertime(e);
      var manualOver = usesManualOvertime ? Math.min(Math.max(0, hoursToMinutes(e.overtimeHours || 0)), total) : 0;
      var autoOver = getAutoOvertimeMinutes(e);
      var over = usesManualOvertime ? manualOver : Math.min(autoOver, total);
      return { total: total, normal: Math.max(0, total - over), overtime: over, leave: leave, covered: total + leave };
    }
    function getVacationAllowanceDays(year, source) {
      var settingsSource = normalizeRuntimeSettings(source || (state && state.settings) || defaultSettings);
      var selectedYear = String(Number(year) || new Date().getFullYear());
      return Math.max(0, parseDecimalInput((settingsSource.vacationAllowanceByYear || {})[selectedYear], 0));
    }
    function setVacationAllowanceDays(year, days) {
      if (!state || !state.settings) return;
      var selectedYear = String(Number(year) || new Date().getFullYear());
      var next = Object.assign({}, state.settings.vacationAllowanceByYear || {});
      next[selectedYear] = Math.min(366, Math.max(0, parseDecimalInput(days, 0)));
      state.settings.vacationAllowanceByYear = next;
      state.settingsDraft = Object.assign({}, state.settings, { vacationAllowanceByYear: Object.assign({}, next) });
      saveSettings();
    }
    function calculateVacationBalance(entries, settingsSource, year) {
      var selectedYear = Number(year) || new Date().getFullYear();
      var normalizedSettings = normalizeRuntimeSettings(settingsSource || defaultSettings);
      var dailyMinutes = Math.max(1, hoursToMinutes(getDefaultPaidDayHours(normalizedSettings)));
      var usedMinutes = Object.keys(normalizeEntryMap(entries)).reduce(function (sum, key) {
        if (String(key).slice(0, 4) !== String(selectedYear)) return sum;
        var entry = entries[key];
        if (!entry || (entry.type !== 'ferie' && entry.type !== 'lavoro_ferie')) return sum;
        var leaveMinutes = getBreakdown(entry).leave;
        if (!leaveMinutes && entry.type === 'ferie') leaveMinutes = dailyMinutes;
        return sum + Math.max(0, leaveMinutes);
      }, 0);
      var allowanceDays = getVacationAllowanceDays(selectedYear, normalizedSettings);
      var totalMinutes = Math.round(allowanceDays * dailyMinutes);
      var remainingMinutes = Math.max(0, totalMinutes - usedMinutes);
      var overMinutes = Math.max(0, usedMinutes - totalMinutes);
      return {
        year: selectedYear,
        allowanceDays: allowanceDays,
        dailyMinutes: dailyMinutes,
        totalMinutes: totalMinutes,
        usedMinutes: usedMinutes,
        remainingMinutes: remainingMinutes,
        overMinutes: overMinutes,
        usedDays: usedMinutes / dailyMinutes,
        remainingDays: remainingMinutes / dailyMinutes,
        percent: totalMinutes ? Math.min(100, Math.round((usedMinutes / totalMinutes) * 100)) : 0
      };
    }
    function getVacationBalanceForYear(year) {
      return calculateVacationBalance((state && state.entries) || {}, (state && state.settings) || defaultSettings, year);
    }
    function parseLocalDateKey(value) {
      var match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!match) return null;
      var date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0);
      return Number.isNaN(date.getTime()) ? null : date;
    }
    function getVacationRangePreview(startKey, endKey) {
      var start = parseLocalDateKey(startKey);
      var end = parseLocalDateKey(endKey);
      var emptyReasons = { weekend: 0, holiday: 0, rest: 0, notWorkday: 0, occupied: 0 };
      if (!start || !end || end.getTime() < start.getTime()) return { ok: false, reason: 'date', eligibleKeys: [], skipped: 0, skippedReasons: emptyReasons, spanDays: 0 };
      var spanDays = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
      if (spanDays > 366) return { ok: false, reason: 'range', eligibleKeys: [], skipped: 0, skippedReasons: emptyReasons, spanDays: spanDays };
      var eligibleKeys = [];
      var skipped = 0;
      var skippedReasons = { weekend: 0, holiday: 0, rest: 0, notWorkday: 0, occupied: 0 };
      var autoRestDays = getAutoRestDays();
      for (var current = new Date(start); current.getTime() <= end.getTime(); current.setDate(current.getDate() + 1)) {
        var currentKey = toISODate(current);
        var weekday = mondayIndex(current.getDay());
        var isWeekend = weekday >= 5;
        var isRest = autoRestDays.indexOf(weekday) !== -1;
        var isHoliday = Boolean(getItalianHolidayInfo(current));
        var skipReason = '';
        if (isWeekend) skipReason = 'weekend';
        else if (isHoliday) skipReason = 'holiday';
        else if (state.entries[currentKey]) skipReason = 'occupied';
        else if (isRest) skipReason = 'rest';
        else if (!isConfiguredWorkday(current)) skipReason = 'notWorkday';
        if (skipReason) {
          skipped += 1;
          skippedReasons[skipReason] += 1;
          continue;
        }
        eligibleKeys.push(currentKey);
      }
      return { ok: true, eligibleKeys: eligibleKeys, skipped: skipped, skippedReasons: skippedReasons, spanDays: spanDays };
    }
    function addVacationRange(startKey, endKey) {
      var preview = getVacationRangePreview(startKey, endKey);
      if (!preview.ok) return { ok: false, reason: preview.reason, added: 0, skipped: preview.skipped || 0 };
      var dailyHours = getDefaultPaidDayHours();
      preview.eligibleKeys.forEach(function (currentKey) {
        state.entries[currentKey] = {
          type: 'ferie',
          start: '',
          end: '',
          breakHours: 0,
          overtimeHours: 0,
          overtimeManual: false,
          leaveHours: 0,
          quantityHours: dailyHours,
          notes: ''
        };
      });
      var added = preview.eligibleKeys.length;
      if (added) saveEntries();
      return { ok: true, added: added, skipped: preview.skipped };
    }
    function getMonthEntries(date) {
      var rows = [];
      var daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
      for (var day = 1; day <= daysInMonth; day += 1) {
        var current = new Date(date.getFullYear(), date.getMonth(), day);
        var key = toISODate(current);
        var entry = getEntryForDate(current);
        if (entry) rows.push([key, entry]);
      }
      return rows;
    }
    function calculatePeriodStats(arr) {
      var totalMinutes = 0, normalMinutes = 0, overtimeMinutes = 0, leaveMinutes = 0, coveredMinutes = 0;
      var vacationMinutes = 0, sicknessMinutes = 0, permissionMinutes = 0, paidHolidayMinutes = 0;
      var workedDays = 0, ferie = 0, malattia = 0, permesso = 0, festivitaPagata = 0, riposo = 0;
      arr.forEach(function (pair) {
        var e = pair[1];
        var b = getBreakdown(e);
        totalMinutes += b.total;
        normalMinutes += b.normal;
        overtimeMinutes += b.overtime;
        leaveMinutes += b.leave;
        coveredMinutes += b.covered;
        if (e.type === 'ferie' || e.type === 'lavoro_ferie') vacationMinutes += b.leave;
        else if (e.type === 'malattia') sicknessMinutes += b.leave;
        else if (e.type === 'permesso') permissionMinutes += b.leave;
        else if (e.type === 'festivita_pagata') paidHolidayMinutes += b.leave;
        if (e.type === 'ferie') ferie += 1;
        else if (e.type === 'malattia') malattia += 1;
        else if (e.type === 'permesso') permesso += 1;
        else if (e.type === 'festivita_pagata') festivitaPagata += 1;
        else if (e.type === 'riposo') riposo += 1;
        else if (b.total > 0 || e.type === 'lavoro_ferie') workedDays += 1;
      });
      return {
        totalMinutes: totalMinutes,
        normalMinutes: normalMinutes,
        overtimeMinutes: overtimeMinutes,
        leaveMinutes: leaveMinutes,
        coveredMinutes: coveredMinutes,
        vacationMinutes: vacationMinutes,
        sicknessMinutes: sicknessMinutes,
        permissionMinutes: permissionMinutes,
        paidHolidayMinutes: paidHolidayMinutes,
        workedDays: workedDays,
        ferie: ferie,
        malattia: malattia,
        permesso: permesso,
        festivitaPagata: festivitaPagata,
        riposo: riposo
      };
    }
    function getMonthStats(date) {
      return calculatePeriodStats(getMonthEntries(date));
    }
    function getRecordedDaysFromStats(stats) {
      var source = stats || {};
      return (source.workedDays || 0) + (source.ferie || 0) + (source.malattia || 0) + (source.permesso || 0) + (source.festivitaPagata || 0) + (source.riposo || 0);
    }
    function getYearMonthSummaries(date) {
      var reportDate = date instanceof Date ? date : new Date();
      var year = reportDate.getFullYear();
      return Array.from({ length: 12 }, function (_, monthIndex) {
        var monthDate = new Date(year, monthIndex, 1);
        var stats = getMonthStats(monthDate);
        return {
          date: monthDate,
          stats: stats,
          recordedDays: getRecordedDaysFromStats(stats)
        };
      });
    }
    function getYearStats(date) {
      return getYearMonthSummaries(date).reduce(function (acc, item) {
        acc.totalMinutes += item.stats.totalMinutes || 0;
        acc.normalMinutes += item.stats.normalMinutes || 0;
        acc.overtimeMinutes += item.stats.overtimeMinutes || 0;
        acc.leaveMinutes += item.stats.leaveMinutes || 0;
        acc.coveredMinutes += item.stats.coveredMinutes || 0;
        acc.vacationMinutes += item.stats.vacationMinutes || 0;
        acc.sicknessMinutes += item.stats.sicknessMinutes || 0;
        acc.permissionMinutes += item.stats.permissionMinutes || 0;
        acc.paidHolidayMinutes += item.stats.paidHolidayMinutes || 0;
        acc.workedDays += item.stats.workedDays || 0;
        acc.ferie += item.stats.ferie || 0;
        acc.malattia += item.stats.malattia || 0;
        acc.permesso += item.stats.permesso || 0;
        acc.festivitaPagata += item.stats.festivitaPagata || 0;
        acc.riposo += item.stats.riposo || 0;
        acc.recordedDays += item.recordedDays || 0;
        if (item.recordedDays > 0) acc.monthsWithEntries += 1;
        return acc;
      }, {
        totalMinutes: 0,
        normalMinutes: 0,
        overtimeMinutes: 0,
        leaveMinutes: 0,
        coveredMinutes: 0,
        vacationMinutes: 0,
        sicknessMinutes: 0,
        permissionMinutes: 0,
        paidHolidayMinutes: 0,
        workedDays: 0,
        ferie: 0,
        malattia: 0,
        permesso: 0,
        festivitaPagata: 0,
        riposo: 0,
        recordedDays: 0,
        monthsWithEntries: 0
      });
    }
    function getYearEntries(date) {
      var rows = [];
      getYearMonthSummaries(date).forEach(function (item) {
        rows = rows.concat(getMonthEntries(item.date));
      });
      return rows;
    }
    function getWeekProgress(baseDate) {
      var start = new Date(baseDate);
      start.setDate(start.getDate() - mondayIndex(start.getDay()));
      var totalMinutes = 0;
      for (var i = 0; i < 7; i += 1) {
        var d = new Date(start);
        d.setDate(start.getDate() + i);
        totalMinutes += getBreakdown(getEntryForDate(d)).total;
      }
      return { totalMinutes: totalMinutes, percent: Math.min(100, (totalMinutes / Math.max(1, state.settings.weeklyTarget * 60)) * 100) };
    }
    function buildMonthGrid(date) {
      var first = new Date(date.getFullYear(), date.getMonth(), 1);
      var off = mondayIndex(first.getDay());
      var start = new Date(date.getFullYear(), date.getMonth(), 1 - off);
      return Array.from({ length: 35 }, function (_, i) {
        var c = new Date(start);
        c.setDate(start.getDate() + i);
        return c;
      });
    }
    function downloadBlobFile(filename, blob) {
      function browserDownload() {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        window.setTimeout(function () { URL.revokeObjectURL(url); }, 1200);
      }
      var nativeBridge = window.GestOreNative;
      if (nativeBridge && nativeBridge.isNative && typeof nativeBridge.shareBlob === 'function') {
        nativeBridge.shareBlob(filename, blob).then(function (shared) {
          if (!shared) browserDownload();
        }).catch(browserDownload);
        return;
      }
      browserDownload();
    }
    function downloadTextFile(filename, content, mime) {
      var blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
      downloadBlobFile(filename, blob);
    }
    function sanitizeFilenamePart(value) {
      var text = String(value || '');
      try { text = text.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (err) {}
      text = text.replace(/[^A-Za-z0-9_-]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
      return text || 'report';
    }
    function getMonthlyReportPdfFilename(date) {
      var current = date instanceof Date ? date : new Date();
      var appName = sanitizeFilenamePart((state && state.settings && state.settings.appName) || defaultSettings.appName || 'GestOre');
      return appName + '_Report_' + current.getFullYear() + '-' + pad(current.getMonth() + 1) + '_' + sanitizeFilenamePart(monthNames[current.getMonth()]) + '.pdf';
    }
    function getYearlyReportPdfFilename(date) {
      var current = date instanceof Date ? date : new Date();
      var appName = sanitizeFilenamePart((state && state.settings && state.settings.appName) || defaultSettings.appName || 'GestOre');
      return appName + '_Report_Anno_' + current.getFullYear() + '.pdf';
    }
    function getCompleteYearlyReportPdfFilename(date) {
      var current = date instanceof Date ? date : new Date();
      var appName = sanitizeFilenamePart((state && state.settings && state.settings.appName) || defaultSettings.appName || 'GestOre');
      return appName + '_Report_Annuale_Completo_' + current.getFullYear() + '.pdf';
    }
    function getSalaryReportPdfFilename(date) {
      var current = date instanceof Date ? date : new Date();
      var appName = sanitizeFilenamePart((state && state.settings && state.settings.appName) || defaultSettings.appName || 'GestOre');
      return appName + '_Report_Stipendi_' + current.getFullYear() + '.pdf';
    }
    function toPdfSafeText(value) {
      var text = String(value === undefined || value === null ? '' : value);
      try { text = text.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (err) {}
      return text
        .replace(/[•·]/g, '-')
        .replace(/[–—]/g, '-')
        .replace(/[→]/g, '>')
        .replace(/[“”]/g, '"')
        .replace(/[‘’]/g, '\'')
        .replace(/[^\x20-\x7E]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }
    function escapePdfText(value) {
      return toPdfSafeText(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
    }
    function truncatePdfText(value, maxLength) {
      var text = toPdfSafeText(value);
      var limit = Math.max(4, Number(maxLength) || 0);
      if (text.length <= limit) return text;
      return text.slice(0, limit - 3).trim() + '...';
    }
    function pdfColorToArray(color) {
      if (Array.isArray(color)) return color.slice(0, 3).map(function (v) { return Math.max(0, Math.min(1, Number(v) || 0)); });
      var text = String(color || '').trim();
      if (!text) return [0, 0, 0];
      if (text.charAt(0) === '#') text = text.slice(1);
      if (text.length === 3) text = text.split('').map(function (part) { return part + part; }).join('');
      if (text.length !== 6) return [0, 0, 0];
      return [
        parseInt(text.slice(0, 2), 16) / 255,
        parseInt(text.slice(2, 4), 16) / 255,
        parseInt(text.slice(4, 6), 16) / 255
      ];
    }
    function createMonthlyReportPdfBlobLegacy(date) {
      var reportMonth = new Date(date.getFullYear(), date.getMonth(), 1);
      var stats = getMonthStats(reportMonth);
      var monthRecordedDays = getRecordedDaysFromStats(stats);
      var rows = getMonthEntries(reportMonth).sort(function (a, b) { return a[0].localeCompare(b[0]); }).map(function (pair) {
        var dateKey = pair[0];
        var entry = pair[1];
        var current = new Date(dateKey + 'T12:00:00');
        var breakdown = getBreakdown(entry);
        var typeLabel = dayTypes[entry.type] ? dayTypes[entry.type].label : entry.type;
        if (entry.type === 'festivita_pagata') {
          var holidayLabel = getHolidayDisplayName(entry, current);
          if (holidayLabel) typeLabel = holidayLabel;
        }
        return {
          date: pad(current.getDate()) + '/' + pad(current.getMonth() + 1),
          day: weekNames[mondayIndex(current.getDay())],
          type: truncatePdfText(typeLabel, 28),
          time: entry.start && entry.end ? (entry.start + '-' + entry.end) : '--',
          work: breakdown.total ? formatHourValue(minutesToHours(breakdown.total)) : '--',
          cover: breakdown.leave ? formatHourValue(minutesToHours(breakdown.leave)) : '--',
          extra: breakdown.overtime ? formatHourValue(minutesToHours(breakdown.overtime)) : '--',
          color: dayTypes[entry.type] && dayTypes[entry.type].dot ? dayTypes[entry.type].dot : '#64748b'
        };
      });
      var PAGE_W = 595.28;
      var PAGE_H = 841.89;
      var MARGIN_X = 40;
      var MARGIN_BOTTOM = 36;
      var encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
      function byteLength(text) { return encoder ? encoder.encode(text).length : String(text || '').length; }
      function pdfNumber(value) { return (Math.round((Number(value) || 0) * 100) / 100).toFixed(2).replace(/\.00$/, ''); }
      function pdfY(top) { return pdfNumber(PAGE_H - top); }
      function pdfColorCommand(mode, color) {
        var rgb = pdfColorToArray(color);
        return pdfNumber(rgb[0]) + ' ' + pdfNumber(rgb[1]) + ' ' + pdfNumber(rgb[2]) + ' ' + mode;
      }
      function addRect(page, x, top, width, height, fill, stroke, lineWidth) {
        var parts = [];
        if (fill) parts.push(pdfColorCommand('rg', fill));
        if (stroke) parts.push(pdfColorCommand('RG', stroke));
        if (stroke) parts.push(pdfNumber(lineWidth || 1) + ' w');
        parts.push(pdfNumber(x) + ' ' + pdfNumber(PAGE_H - top - height) + ' ' + pdfNumber(width) + ' ' + pdfNumber(height) + ' re ' + (fill && stroke ? 'B' : (fill ? 'f' : 'S')));
        page.commands.push(parts.join('\n'));
      }
      function addLine(page, x1, top1, x2, top2, color, lineWidth) {
        page.commands.push([pdfColorCommand('RG', color || '#d8e0ee'), pdfNumber(lineWidth || 1) + ' w', pdfNumber(x1) + ' ' + pdfY(top1) + ' m', pdfNumber(x2) + ' ' + pdfY(top2) + ' l', 'S'].join('\n'));
      }
      function addText(page, text, x, top, size, fontKey, color) {
        var safe = escapePdfText(text);
        if (!safe) return;
        page.commands.push(['BT', '/' + (fontKey || 'F1') + ' ' + pdfNumber(size || 10) + ' Tf', pdfColorCommand('rg', color || '#071022'), '1 0 0 1 ' + pdfNumber(x) + ' ' + pdfY(top) + ' Tm', '(' + safe + ') Tj', 'ET'].join('\n'));
      }
      function drawSummaryCard(page, x, top, width, height, label, value, accent) {
        addRect(page, x, top, width, height, '#f6f8fc', '#d8e0ee', 1);
        addRect(page, x + 14, top + 12, 34, 4, accent || '#5b7cff');
        addText(page, label, x + 14, top + 30, 10, 'F1', '#5b6b86');
        addText(page, value, x + 14, top + 54, 18, 'F2', '#071022');
      }
      function drawHeader(page) {
        var appName = toPdfSafeText((state && state.settings && state.settings.appName) || 'GestOre');
        var cardWidth = ((PAGE_W - (MARGIN_X * 2)) - 14) / 2;
        addRect(page, MARGIN_X, 40, PAGE_W - (MARGIN_X * 2), 84, '#0b1637', '#0b1637', 1);
        addText(page, appName, 56, 68, 11, 'F2', '#8fb3ff');
        addText(page, 'Report Mensile', 56, 94, 24, 'F2', '#ffffff');
        addText(page, formatMonthYear(reportMonth), 56, 116, 12, 'F1', '#d9e5ff');
        addText(page, 'Generato il ' + pad(new Date().getDate()) + '/' + pad(new Date().getMonth() + 1) + '/' + new Date().getFullYear(), 392, 68, 9, 'F1', '#d9e5ff');
        addText(page, 'Target giorno ' + formatHourValue(state.settings.dailyTarget) + ' | Target settimana ' + formatHourValue(state.settings.weeklyTarget), 272, 94, 9, 'F1', '#d9e5ff');
        addText(page, 'Riepilogo e dettaglio giornaliero del mese selezionato', 272, 114, 9, 'F1', '#d9e5ff');
        drawSummaryCard(page, MARGIN_X, 148, cardWidth, 58, 'Ore totali', formatDuration(stats.totalMinutes), '#5b7cff');
        drawSummaryCard(page, MARGIN_X + cardWidth + 14, 148, cardWidth, 58, 'Ore normali', formatHourValue(minutesToHours(stats.normalMinutes)), '#38bdf8');
        drawSummaryCard(page, MARGIN_X, 218, cardWidth, 58, 'Straordinarie', formatHourValue(minutesToHours(stats.overtimeMinutes)), '#fb7185');
        drawSummaryCard(page, MARGIN_X + cardWidth + 14, 218, cardWidth, 58, 'Giorni segnati', String(monthRecordedDays), '#64748b');
        addText(page, 'Distribuzione: lavoro ' + stats.workedDays + ' | ferie ' + stats.ferie + ' | malattia ' + stats.malattia + ' | permesso ' + stats.permesso + ' | festivita ' + (stats.festivitaPagata || 0) + ' | riposo ' + stats.riposo, MARGIN_X, 302, 9, 'F1', '#5b6b86');
      }
      function drawContinuationHeader(page) {
        addText(page, 'Report Mensile - ' + formatMonthYear(reportMonth), MARGIN_X, 58, 15, 'F2', '#071022');
        addText(page, 'Dettaglio giornaliero (continuazione)', MARGIN_X, 78, 9, 'F1', '#5b6b86');
        addLine(page, MARGIN_X, 88, PAGE_W - MARGIN_X, 88, '#d8e0ee', 1);
      }
      function drawTableHeader(page, top) {
        addText(page, 'Dettaglio giornaliero', MARGIN_X, top - 10, 11, 'F2', '#071022');
        addRect(page, MARGIN_X, top, PAGE_W - (MARGIN_X * 2), 20, '#eef3fb', '#d8e0ee', 1);
        addText(page, 'Data', 48, top + 14, 9, 'F2', '#334155');
        addText(page, 'Giorno', 94, top + 14, 9, 'F2', '#334155');
        addText(page, 'Tipo', 140, top + 14, 9, 'F2', '#334155');
        addText(page, 'Fascia', 302, top + 14, 9, 'F2', '#334155');
        addText(page, 'Lavoro', 390, top + 14, 9, 'F2', '#334155');
        addText(page, 'Coperto', 448, top + 14, 9, 'F2', '#334155');
        addText(page, 'Extra', 506, top + 14, 9, 'F2', '#334155');
        return top + 28;
      }
      function drawTableRow(page, row, top, index) {
        addRect(page, MARGIN_X, top, PAGE_W - (MARGIN_X * 2), 18, index % 2 ? '#ffffff' : '#f9fbfe', '#e5ebf4', 0.8);
        addRect(page, 42, top + 2, 3, 14, row.color, null, 0);
        addText(page, row.date, 48, top + 13, 9, 'F1', '#071022');
        addText(page, row.day, 94, top + 13, 9, 'F1', '#475569');
        addText(page, row.type, 140, top + 13, 9, 'F1', '#071022');
        addText(page, row.time, 302, top + 13, 9, 'F1', '#475569');
        addText(page, row.work, 390, top + 13, 9, 'F1', '#071022');
        addText(page, row.cover, 448, top + 13, 9, 'F1', '#071022');
        addText(page, row.extra, 506, top + 13, 9, 'F1', '#071022');
      }
      var pages = [];
      function createPage(isFirst) {
        var page = { commands: [] };
        pages.push(page);
        if (isFirst) {
          drawHeader(page);
          page.cursorTop = drawTableHeader(page, 320);
        } else {
          drawContinuationHeader(page);
          page.cursorTop = drawTableHeader(page, 100);
        }
        return page;
      }
      var page = createPage(true);
      if (!rows.length) {
        addRect(page, MARGIN_X, page.cursorTop, PAGE_W - (MARGIN_X * 2), 44, '#ffffff', '#d8e0ee', 1);
        addText(page, 'Nessun giorno registrato per questo mese.', 52, page.cursorTop + 26, 11, 'F1', '#475569');
      } else {
        rows.forEach(function (row, index) {
          if (page.cursorTop + 18 > PAGE_H - MARGIN_BOTTOM - 16) page = createPage(false);
          drawTableRow(page, row, page.cursorTop, index);
          page.cursorTop += 18;
        });
      }
      pages.forEach(function (currentPage, pageIndex) {
        addLine(currentPage, MARGIN_X, PAGE_H - 34, PAGE_W - MARGIN_X, PAGE_H - 34, '#d8e0ee', 1);
        addText(currentPage, 'Export PDF generato da GestOre', MARGIN_X, PAGE_H - 18, 8, 'F1', '#5b6b86');
        addText(currentPage, 'Pagina ' + (pageIndex + 1) + '/' + pages.length, PAGE_W - 96, PAGE_H - 18, 8, 'F1', '#5b6b86');
      });
      var objects = [];
      objects[0] = '<< /Type /Catalog /Pages 2 0 R >>';
      objects[1] = '<< /Type /Pages /Count ' + pages.length + ' /Kids [' + pages.map(function (_, pageIndex) { return (5 + (pageIndex * 2)) + ' 0 R'; }).join(' ') + '] >>';
      objects[2] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
      objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>';
      pages.forEach(function (currentPage, pageIndex) {
        var pageId = 5 + (pageIndex * 2);
        var contentId = pageId + 1;
        var content = currentPage.commands.join('\n');
        objects[pageId - 1] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + pdfNumber(PAGE_W) + ' ' + pdfNumber(PAGE_H) + '] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ' + contentId + ' 0 R >>';
        objects[contentId - 1] = '<< /Length ' + byteLength(content) + ' >>\nstream\n' + content + '\nendstream';
      });
      var parts = ['%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'];
      var offsets = [0];
      var currentOffset = byteLength(parts[0]);
      objects.forEach(function (body, index) {
        offsets[index + 1] = currentOffset;
        var chunk = (index + 1) + ' 0 obj\n' + body + '\nendobj\n';
        parts.push(chunk);
        currentOffset += byteLength(chunk);
      });
      var xrefOffset = currentOffset;
      var xref = 'xref\n0 ' + (objects.length + 1) + '\n0000000000 65535 f \n';
      for (var i = 1; i <= objects.length; i += 1) xref += String(offsets[i] || 0).padStart(10, '0') + ' 00000 n \n';
      var trailer = 'trailer\n<< /Size ' + (objects.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xrefOffset + '\n%%EOF';
      return new Blob(parts.concat([xref, trailer]), { type: 'application/pdf' });
    }
    function createYearlyReportPdfBlobLegacy(date) {
      var reportYear = new Date((date instanceof Date ? date : new Date()).getFullYear(), 0, 1);
      var monthSummaries = getYearMonthSummaries(reportYear);
      var yearStats = getYearStats(reportYear);
      var monthRows = monthSummaries.map(function (item) {
        return {
          month: monthNames[item.date.getMonth()],
          normalHours: minutesToHours(item.stats.normalMinutes || 0),
          overtimeHours: minutesToHours(item.stats.overtimeMinutes || 0),
          totalHours: minutesToHours(item.stats.totalMinutes || 0),
          recordedDays: item.recordedDays || 0
        };
      });
      var topMonth = monthRows.reduce(function (best, row) {
        if (!best || row.totalHours > best.totalHours) return row;
        return best;
      }, null) || { month: monthNames[0], totalHours: 0 };
      var absenceTotals = { ferie: 0, malattia: 0, festivita: 0 };
      getYearEntries(reportYear).forEach(function (pair) {
        var entry = pair[1];
        var breakdown = getBreakdown(entry);
        var coveredHours = minutesToHours(breakdown.leave || 0);
        if (!coveredHours) return;
        if (entry.type === 'ferie' || entry.type === 'lavoro_ferie') absenceTotals.ferie += coveredHours;
        else if (entry.type === 'malattia') absenceTotals.malattia += coveredHours;
        else if (entry.type === 'festivita_pagata') absenceTotals.festivita += coveredHours;
      });
      var PAGE_W = 595.28;
      var PAGE_H = 841.89;
      var MARGIN_X = 36;
      var MARGIN_BOTTOM = 28;
      var encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
      function byteLength(text) { return encoder ? encoder.encode(text).length : String(text || '').length; }
      function pdfNumber(value) { return (Math.round((Number(value) || 0) * 100) / 100).toFixed(2).replace(/\.00$/, ''); }
      function pdfY(top) { return pdfNumber(PAGE_H - top); }
      function formatPdfNumber(value, decimals) {
        var precision = decimals === 2 ? 100 : 10;
        var safe = Math.round(Math.max(0, Number(value) || 0) * precision) / precision;
        var fixed = safe.toFixed(decimals === 2 ? 2 : 1).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
        return fixed.replace('.', ',');
      }
      function formatPdfHours(value, decimals) {
        return formatPdfNumber(value, decimals || 1) + 'h';
      }
      function pdfColorCommand(mode, color) {
        var rgb = pdfColorToArray(color);
        return pdfNumber(rgb[0]) + ' ' + pdfNumber(rgb[1]) + ' ' + pdfNumber(rgb[2]) + ' ' + mode;
      }
      function addRect(page, x, top, width, height, fill, stroke, lineWidth) {
        var parts = [];
        if (fill) parts.push(pdfColorCommand('rg', fill));
        if (stroke) parts.push(pdfColorCommand('RG', stroke));
        if (stroke) parts.push(pdfNumber(lineWidth || 1) + ' w');
        parts.push(pdfNumber(x) + ' ' + pdfNumber(PAGE_H - top - height) + ' ' + pdfNumber(width) + ' ' + pdfNumber(height) + ' re ' + (fill && stroke ? 'B' : (fill ? 'f' : 'S')));
        page.commands.push(parts.join('\n'));
      }
      function addLine(page, x1, top1, x2, top2, color, lineWidth) {
        page.commands.push([pdfColorCommand('RG', color || '#d8e0ee'), pdfNumber(lineWidth || 1) + ' w', pdfNumber(x1) + ' ' + pdfY(top1) + ' m', pdfNumber(x2) + ' ' + pdfY(top2) + ' l', 'S'].join('\n'));
      }
      function addText(page, text, x, top, size, fontKey, color) {
        var safe = escapePdfText(text);
        if (!safe) return;
        page.commands.push(['BT', '/' + (fontKey || 'F1') + ' ' + pdfNumber(size || 10) + ' Tf', pdfColorCommand('rg', color || '#071022'), '1 0 0 1 ' + pdfNumber(x) + ' ' + pdfY(top) + ' Tm', '(' + safe + ') Tj', 'ET'].join('\n'));
      }
      function drawCard(page, x, top, width, height, fill, stroke) {
        addRect(page, x, top, width, height, fill || '#ffffff', stroke || '#d8e0ee', 1);
      }
      function drawMetricCard(page, x, top, width, height, label, value, meta) {
        drawCard(page, x, top, width, height, '#f7f9fc', '#dce5f0');
        addText(page, label, x + 12, top + 19, 9, 'F2', '#516074');
        addText(page, value, x + 12, top + 45, 18, 'F2', '#071022');
        if (meta) addText(page, meta, x + 12, top + 62, 8, 'F1', '#6b7a90');
      }
      function drawHeader(page) {
        drawCard(page, MARGIN_X, 34, PAGE_W - (MARGIN_X * 2), 84, '#0f172e', '#0f172e');
        addText(page, 'Report anno • ' + reportYear.getFullYear(), MARGIN_X + 18, 66, 24, 'F2', '#ffffff');
        addText(page, String(reportYear.getFullYear()), PAGE_W - 92, 54, 14, 'F1', '#d9e5ff');
      }
      function drawTrendChart(page) {
        var chartX = MARGIN_X;
        var chartTop = 222;
        var chartW = 328;
        var chartH = 214;
        var maxTotal = monthRows.reduce(function (best, row) { return Math.max(best, row.totalHours || 0); }, 1);
        drawCard(page, chartX, chartTop, chartW, chartH, '#ffffff', '#dce5f0');
        addText(page, 'Trend mensile (ore + STR)', chartX + 16, chartTop + 20, 11, 'F2', '#071022');
        monthRows.forEach(function (row, index) {
          var rowTop = chartTop + 34 + (index * 14);
          var barX = chartX + 92;
          var barW = 152;
          var totalW = Math.max(0, (row.totalHours / Math.max(1, maxTotal)) * barW);
          var normalW = Math.max(0, (row.normalHours / Math.max(1, maxTotal)) * barW);
          var extraW = Math.max(0, totalW - normalW);
          addText(page, row.month, chartX + 14, rowTop + 9, 8, 'F1', '#334155');
          addRect(page, barX, rowTop + 2, barW, 8, '#edf2f8', '#edf2f8', 0);
          if (normalW > 0) addRect(page, barX, rowTop + 2, normalW, 8, '#1f2937', null, 0);
          if (extraW > 0) addRect(page, barX + normalW, rowTop + 2, extraW, 8, '#3b82f6', null, 0);
          addText(page, formatPdfHours(row.totalHours, 1), chartX + 252, rowTop + 9, 8, 'F2', '#071022');
        });
        addText(page, 'Barra scura = ore normali  •  Barra blu = straordinari', chartX + 16, chartTop + chartH - 14, 8, 'F1', '#5b6b86');
      }
      function drawAbsencePanel(page) {
        var panelX = MARGIN_X + 344;
        var panelTop = 222;
        var panelW = PAGE_W - MARGIN_X - panelX;
        var cardH = 46;
        var ferieDays = absenceTotals.ferie > 0 ? ('≈ ' + formatPdfNumber(absenceTotals.ferie / Math.max(1, state.settings.dailyTarget || 8), 1) + ' giorni') : '';
        drawCard(page, panelX, panelTop, panelW, 214, '#ffffff', '#dce5f0');
        addText(page, 'Assenze (totale anno)', panelX + 16, panelTop + 20, 11, 'F2', '#071022');
        [
          { label: 'FERIE', value: formatPdfHours(absenceTotals.ferie, 1), meta: ferieDays },
          { label: 'MALATTIA', value: formatPdfHours(absenceTotals.malattia, 1), meta: '' },
          { label: 'FESTIVI PAGATI', value: formatPdfHours(absenceTotals.festivita, 1), meta: '' }
        ].forEach(function (item, index) {
          var top = panelTop + 38 + (index * 56);
          drawCard(page, panelX + 14, top, panelW - 28, cardH, '#f7f9fc', '#e5edf5');
          addText(page, item.label, panelX + 26, top + 18, 10, 'F2', '#516074');
          addText(page, item.value, panelX + 26, top + 35, 15, 'F2', '#071022');
          if (item.meta) addText(page, item.meta, panelX + 96, top + 35, 8, 'F1', '#6b7a90');
        });
      }
      function drawSummaryTable(page) {
        var tableX = MARGIN_X;
        var tableTop = 454;
        var tableW = PAGE_W - (MARGIN_X * 2);
        drawCard(page, tableX, tableTop, tableW, 304, '#ffffff', '#dce5f0');
        addText(page, 'Riepilogo mesi', tableX + 16, tableTop + 20, 11, 'F2', '#071022');
        addRect(page, tableX + 14, tableTop + 30, tableW - 28, 18, '#eef3fb', '#e2e8f0', 1);
        addText(page, 'MESE', tableX + 24, tableTop + 42, 8, 'F2', '#516074');
        addText(page, 'ORE', tableX + 276, tableTop + 42, 8, 'F2', '#516074');
        addText(page, 'STR', tableX + 362, tableTop + 42, 8, 'F2', '#516074');
        addText(page, 'TOTALE', tableX + 444, tableTop + 42, 8, 'F2', '#516074');
        monthRows.concat([{
          month: 'Totale anno',
          normalHours: minutesToHours(yearStats.normalMinutes || 0),
          overtimeHours: minutesToHours(yearStats.overtimeMinutes || 0),
          totalHours: minutesToHours(yearStats.totalMinutes || 0)
        }]).forEach(function (row, index) {
          var top = tableTop + 50 + (index * 18);
          addRect(page, tableX + 14, top, tableW - 28, 18, index % 2 ? '#ffffff' : '#f9fbfe', '#edf2f7', 0.8);
          addText(page, row.month, tableX + 24, top + 12, 9, index === 12 ? 'F2' : 'F1', '#071022');
          addText(page, formatPdfNumber(row.normalHours, 1), tableX + 276, top + 12, 9, index === 12 ? 'F2' : 'F1', '#071022');
          addText(page, formatPdfNumber(row.overtimeHours, 1), tableX + 362, top + 12, 9, index === 12 ? 'F2' : 'F1', '#071022');
          addText(page, formatPdfNumber(row.totalHours, 1), tableX + 444, top + 12, 9, index === 12 ? 'F2' : 'F1', '#071022');
        });
      }
      var page = { commands: [] };
      drawHeader(page);
      var cardWidth = (PAGE_W - (MARGIN_X * 2) - 16) / 5;
      var topMetrics = [
        { label: 'ORE', value: formatPdfHours(minutesToHours(yearStats.normalMinutes || 0), 1) },
        { label: 'STRAORDINARI', value: formatPdfHours(minutesToHours(yearStats.overtimeMinutes || 0), 1) },
        { label: 'TOTALE', value: formatPdfHours(minutesToHours(yearStats.totalMinutes || 0), 1) },
        { label: 'MEDIA/MESE', value: formatPdfHours(minutesToHours(yearStats.totalMinutes || 0) / 12, 2) },
        { label: 'TOP MESE', value: topMonth.month, meta: '(' + formatPdfHours(topMonth.totalHours || 0, 1) + ')' }
      ];
      topMetrics.forEach(function (item, index) {
        drawMetricCard(page, MARGIN_X + (index * (cardWidth + 4)), 132, cardWidth, 70, item.label, item.value, item.meta || '');
      });
      drawTrendChart(page);
      drawAbsencePanel(page);
      drawSummaryTable(page);
      addText(page, 'REALIZZATA DA', MARGIN_X, PAGE_H - 40, 8, 'F2', '#6b7a90');
      addText(page, ((state && state.settings && state.settings.appName) || 'GestOre') + ' v' + ((state && state.settings && state.settings.version) || '1.0.0') + ' • ' + pad(new Date().getDate()) + '/' + pad(new Date().getMonth() + 1) + '/' + new Date().getFullYear() + ', ' + pad(new Date().getHours()) + ':' + pad(new Date().getMinutes()) + ':' + pad(new Date().getSeconds()) + ' • Utente: ' + getDisplayUserName(), MARGIN_X, PAGE_H - 27, 8, 'F1', '#5b6b86');
      addText(page, getDisplayUserName(), PAGE_W - 122, PAGE_H - 18, 12, 'F3', '#9ca3af');
      var objects = [];
      objects[0] = '<< /Type /Catalog /Pages 2 0 R >>';
      objects[1] = '<< /Type /Pages /Count 1 /Kids [6 0 R] >>';
      objects[2] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
      objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>';
      objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique >>';
      var content = page.commands.join('\n');
      objects[5] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + pdfNumber(PAGE_W) + ' ' + pdfNumber(PAGE_H) + '] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents 7 0 R >>';
      objects[6] = '<< /Length ' + byteLength(content) + ' >>\nstream\n' + content + '\nendstream';
      var parts = ['%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'];
      var offsets = [0];
      var currentOffset = byteLength(parts[0]);
      objects.forEach(function (body, index) {
        offsets[index + 1] = currentOffset;
        var chunk = (index + 1) + ' 0 obj\n' + body + '\nendobj\n';
        parts.push(chunk);
        currentOffset += byteLength(chunk);
      });
      var xrefOffset = currentOffset;
      var xref = 'xref\n0 ' + (objects.length + 1) + '\n0000000000 65535 f \n';
      for (var i = 1; i <= objects.length; i += 1) xref += String(offsets[i] || 0).padStart(10, '0') + ' 00000 n \n';
      var trailer = 'trailer\n<< /Size ' + (objects.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xrefOffset + '\n%%EOF';
      return new Blob(parts.concat([xref, trailer]), { type: 'application/pdf' });
    }
    function exportCSV() {
      var rows = Object.entries(state.entries).sort(function (a, b) { return a[0].localeCompare(b[0]); }).map(function (pair) {
        var date = pair[0], e = pair[1], b = getBreakdown(e);
        return [date, dayTypes[e.type] ? dayTypes[e.type].label : e.type, e.start || '', e.end || '', e.breakHours || 0, e.leaveHours || e.quantityHours || 0, minutesToHours(b.normal), minutesToHours(b.overtime), minutesToHours(b.total), e.notes || ''];
      });
      var head = ['Data', 'Tipo', 'Inizio', 'Fine', 'Pausa (ore)', 'Ore non lavorative', 'Ore lavoro', 'Ore straordinarie', 'Ore totali lavoro', 'Note'];
      var content = [head].concat(rows).map(function (r) { return r.map(escapeCsvCell).join(','); }).join('\n');
      downloadTextFile('gestore-export.csv', content, 'text/csv;charset=utf-8');
    }
    function escapeIcsText(value) {
      return String(value || '')
        .replace(/\\/g, '\\\\')
        .replace(/\r?\n/g, '\\n')
        .replace(/,/g, '\\,')
        .replace(/;/g, '\\;');
    }
    function formatIcsTimestamp(date) {
      var value = date instanceof Date ? date : new Date(date);
      return value.getUTCFullYear() + pad(value.getUTCMonth() + 1) + pad(value.getUTCDate()) + 'T' +
        pad(value.getUTCHours()) + pad(value.getUTCMinutes()) + pad(value.getUTCSeconds()) + 'Z';
    }
    function addDaysToDateKey(dateKey, amount) {
      var date = parseLocalDateKey(dateKey);
      if (!date) return String(dateKey || '').replace(/-/g, '');
      date.setDate(date.getDate() + (Number(amount) || 0));
      return toISODate(date).replace(/-/g, '');
    }
    function exportCalendarIcs(options) {
      var config = options && typeof options === 'object' ? options : {};
      var exportYear = Math.max(2000, Math.min(2100, Number(config.year) || state.currentMonth.getFullYear()));
      var availableTypes = ['lavoro', 'lavoro_ferie', 'ferie', 'malattia', 'permesso', 'festivita_pagata', 'riposo'];
      var selectedTypes = Array.isArray(config.types)
        ? config.types.filter(function (type) { return availableTypes.indexOf(type) !== -1; })
        : availableTypes.slice();
      var stamp = formatIcsTimestamp(new Date());
      var rows = Object.keys(state.entries || {}).sort().reduce(function (events, dateKey) {
        var entry = state.entries[dateKey];
        if (dateKey.slice(0, 4) !== String(exportYear) || !entry || typeof entry !== 'object' || selectedTypes.indexOf(entry.type) === -1) return events;
        var type = dayTypes[entry.type] || { label: entry.type || 'Giornata' };
        var breakdown = getBreakdown(entry);
        var dateValue = dateKey.replace(/-/g, '');
        var timed = (entry.type === 'lavoro' || entry.type === 'lavoro_ferie') && /^\d{2}:\d{2}$/.test(entry.start || '') && /^\d{2}:\d{2}$/.test(entry.end || '');
        var lines = [
          'BEGIN:VEVENT',
          'UID:' + escapeIcsText(dateKey + '-' + String(entry.type || 'giornata')) + '@gestore.local',
          'DTSTAMP:' + stamp,
          'SUMMARY:' + escapeIcsText(type.label)
        ];
        if (timed) {
          var start = parseLocalDateKey(dateKey);
          var end = parseLocalDateKey(dateKey);
          var startParts = entry.start.split(':').map(Number);
          var endParts = entry.end.split(':').map(Number);
          start.setHours(startParts[0], startParts[1], 0, 0);
          end.setHours(endParts[0], endParts[1], 0, 0);
          if (end.getTime() <= start.getTime()) end.setDate(end.getDate() + 1);
          var localStamp = function (value) {
            return value.getFullYear() + pad(value.getMonth() + 1) + pad(value.getDate()) + 'T' + pad(value.getHours()) + pad(value.getMinutes()) + '00';
          };
          lines.push('DTSTART;TZID=Europe/Rome:' + localStamp(start));
          lines.push('DTEND;TZID=Europe/Rome:' + localStamp(end));
        } else {
          lines.push('DTSTART;VALUE=DATE:' + dateValue);
          lines.push('DTEND;VALUE=DATE:' + addDaysToDateKey(dateKey, 1));
        }
        var details = [];
        if (timed) details.push('Orario: ' + entry.start + ' - ' + entry.end);
        if (Number(entry.breakHours) > 0) details.push('Pausa: ' + formatHourValue(entry.breakHours));
        if (breakdown.total > 0) details.push('Totale: ' + formatDuration(breakdown.total));
        if (breakdown.overtime > 0) details.push('Straordinario: ' + formatDuration(breakdown.overtime));
        if (entry.notes) details.push('Note: ' + entry.notes);
        if (details.length) lines.push('DESCRIPTION:' + escapeIcsText(details.join('\n')));
        lines.push('CATEGORIES:' + escapeIcsText(type.label));
        lines.push('END:VEVENT');
        events.push(lines.join('\r\n'));
        return events;
      }, []);
      var calendar = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//GestOre//Calendario personale//IT',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        'X-WR-CALNAME:GestOre ' + exportYear,
        'X-WR-TIMEZONE:Europe/Rome'
      ].concat(rows).concat(['END:VCALENDAR', '']).join('\r\n');
      downloadTextFile('GestOre_Calendario_' + exportYear + '.ics', calendar, 'text/calendar;charset=utf-8');
      return rows.length;
    }
    function exportTextReportLegacy() {
      var rows = getMonthEntries(state.currentMonth).sort(function (a, b) { return a[0].localeCompare(b[0]); }).map(function (pair) {
        var date = pair[0], e = pair[1], b = getBreakdown(e);
        var extraBits = [];
        if (b.total) extraBits.push(formatDuration(b.total));
        if (b.leave) extraBits.push('coperto ' + formatHourValue(minutesToHours(b.leave)));
        return date + ' | ' + (dayTypes[e.type] ? dayTypes[e.type].label : e.type) + ' | ' + (e.start || '--') + '-' + (e.end || '--') + ' | ' + (extraBits.join(' • ') || 'nessun orario');
      });
      var content = [state.settings.appName + ' - ' + formatMonthYear(state.currentMonth), ''].concat(rows).join('\n');
      downloadTextFile('gestore-report.txt', content, 'text/plain;charset=utf-8');
    }
    var pdfReportModulesPromise = null;
    var pdfPreviewRendererPromise = null;
    var pdfPreviewRenderSequence = 0;
    function loadExternalScript(source) {
      return new Promise(function (resolve, reject) {
        var existing = document.querySelector('script[data-gestore-module="' + source + '"]');
        if (existing) {
          if (existing.dataset.loaded === 'true') resolve();
          else {
            existing.addEventListener('load', resolve, { once: true });
            existing.addEventListener('error', reject, { once: true });
          }
          return;
        }
        var script = document.createElement('script');
        script.src = source;
        script.async = false;
        script.dataset.gestoreModule = source;
        script.addEventListener('load', function () {
          script.dataset.loaded = 'true';
          resolve();
        }, { once: true });
        script.addEventListener('error', function () {
          reject(new Error('Impossibile caricare il generatore PDF.'));
        }, { once: true });
        document.head.appendChild(script);
      });
    }
    function hasAllPdfReportModules() {
      return Boolean(
        window.GestOrePdfReports &&
        typeof window.GestOrePdfReports.monthly === 'function' &&
        typeof window.GestOrePdfReports.yearly === 'function' &&
        typeof window.GestOrePdfReports.completeYearly === 'function' &&
        typeof window.GestOrePdfReports.salaries === 'function'
      );
    }
    function loadPdfReportModules() {
      if (hasAllPdfReportModules()) {
        return Promise.resolve(window.GestOrePdfReports);
      }
      if (pdfReportModulesPromise) return pdfReportModulesPromise;
      var buildMeta = document.querySelector('meta[name="gestore-build"]');
      var buildValue = String(buildMeta && buildMeta.content || '');
      var cacheToken = buildValue.indexOf('-') >= 0 ? buildValue.slice(buildValue.lastIndexOf('-') + 1) : buildValue;
      var query = cacheToken ? ('?v=' + encodeURIComponent(cacheToken)) : '';
      pdfReportModulesPromise = loadExternalScript('js/pdf/engine.js' + query)
        .then(function () { return loadExternalScript('js/pdf/monthly.js' + query); })
        .then(function () { return loadExternalScript('js/pdf/yearly.js' + query); })
        .then(function () { return loadExternalScript('js/pdf/annual-complete.js' + query); })
        .then(function () { return loadExternalScript('js/pdf/salaries.js' + query); })
        .then(function () {
          if (!hasAllPdfReportModules()) {
            throw new Error('Il generatore PDF non e disponibile.');
          }
          return window.GestOrePdfReports;
        })
        .catch(function (error) {
          pdfReportModulesPromise = null;
          throw error;
        });
      return pdfReportModulesPromise;
    }
    function getPdfAssetQuery() {
      var buildMeta = document.querySelector('meta[name="gestore-build"]');
      var buildValue = String(buildMeta && buildMeta.content || '');
      var cacheToken = buildValue.indexOf('-') >= 0 ? buildValue.slice(buildValue.lastIndexOf('-') + 1) : buildValue;
      return cacheToken ? ('?v=' + encodeURIComponent(cacheToken)) : '';
    }
    function loadPdfPreviewRenderer() {
      if (pdfPreviewRendererPromise) return pdfPreviewRendererPromise;
      var query = getPdfAssetQuery();
      var moduleUrl = new URL('vendor/pdfjs/pdf.min.mjs' + query, document.baseURI).href;
      var workerUrl = new URL('vendor/pdfjs/pdf.worker.min.mjs' + query, document.baseURI).href;
      pdfPreviewRendererPromise = import(moduleUrl).then(function (pdfjsLib) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
        return pdfjsLib;
      }).catch(function (error) {
        pdfPreviewRendererPromise = null;
        throw error;
      });
      return pdfPreviewRendererPromise;
    }
    async function renderPdfPreviewPages() {
      var host = document.querySelector('[data-pdf-preview-pages]');
      var status = document.querySelector('[data-pdf-preview-status]');
      var blob = state.pdfPreviewBlob;
      if (!host || !state.pdfPreviewOpen || !blob) return;
      var previewKey = String(state.pdfPreviewName || 'report') + ':' + String(blob.size || 0);
      if (host.dataset.previewKey === previewKey && host.dataset.previewState === 'ready') return;
      var sequence = ++pdfPreviewRenderSequence;
      host.dataset.previewKey = previewKey;
      host.dataset.previewState = 'loading';
      host.setAttribute('aria-busy', 'true');
      host.replaceChildren();
      if (status) {
        status.hidden = false;
        status.classList.remove('is-error');
        var statusTitle = status.querySelector('strong');
        var statusCopy = status.querySelector('p');
        if (statusTitle) statusTitle.textContent = 'Preparo le pagine';
        if (statusCopy) statusCopy.textContent = 'Il report resta sul dispositivo.';
      }
      try {
        var pdfjsLib = await loadPdfPreviewRenderer();
        var data = new Uint8Array(await blob.arrayBuffer());
        var loadingTask = pdfjsLib.getDocument({ data: data, isEvalSupported: false, useSystemFonts: true });
        var pdfDocument = await loadingTask.promise;
        if (sequence !== pdfPreviewRenderSequence || !state.pdfPreviewOpen) {
          await pdfDocument.destroy();
          return;
        }
        var availableWidth = Math.max(260, (host.clientWidth || 360) - 16);
        var pixelRatio = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
        for (var pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
          if (sequence !== pdfPreviewRenderSequence || !state.pdfPreviewOpen) {
            await pdfDocument.destroy();
            return;
          }
          var page = await pdfDocument.getPage(pageNumber);
          var baseViewport = page.getViewport({ scale: 1 });
          var cssScale = availableWidth / baseViewport.width;
          var renderViewport = page.getViewport({ scale: cssScale * pixelRatio });
          var canvas = document.createElement('canvas');
          var pageCard = document.createElement('article');
          var pageLabel = document.createElement('span');
          var displayWidth = Math.round(baseViewport.width * cssScale);
          var displayHeight = Math.round(baseViewport.height * cssScale);
          var previewScale = Math.max(1, Math.min(4, Number(host.dataset.pdfZoomScale) || 1));
          pageCard.className = 'pdf-preview-page';
          pageLabel.textContent = 'Pagina ' + pageNumber + ' di ' + pdfDocument.numPages;
          canvas.width = Math.ceil(renderViewport.width);
          canvas.height = Math.ceil(renderViewport.height);
          canvas.dataset.pdfBaseWidth = String(displayWidth);
          canvas.dataset.pdfBaseHeight = String(displayHeight);
          canvas.style.width = Math.round(displayWidth * previewScale) + 'px';
          canvas.style.height = Math.round(displayHeight * previewScale) + 'px';
          canvas.setAttribute('aria-label', 'Pagina ' + pageNumber + ' del report');
          pageCard.appendChild(pageLabel);
          pageCard.appendChild(canvas);
          host.appendChild(pageCard);
          var context = canvas.getContext('2d', { alpha: false });
          await page.render({ canvasContext: context, viewport: renderViewport, background: '#ffffff' }).promise;
          page.cleanup();
        }
        host.dataset.previewState = 'ready';
        host.setAttribute('aria-busy', 'false');
        if (status) status.hidden = true;
      } catch (error) {
        if (sequence !== pdfPreviewRenderSequence) return;
        host.dataset.previewState = 'error';
        host.setAttribute('aria-busy', 'false');
        if (status) {
          status.hidden = false;
          status.classList.add('is-error');
          var errorTitle = status.querySelector('strong');
          var errorCopy = status.querySelector('p');
          if (errorTitle) errorTitle.textContent = 'Anteprima non disponibile';
          if (errorCopy) errorCopy.textContent = 'Puoi comunque scaricare il PDF dal pulsante in alto.';
        }
      }
    }
    function queuePdfPreviewRender() {
      if (!state.pdfPreviewOpen || !state.pdfPreviewBlob) return;
      var schedule = window.requestAnimationFrame || function (callback) { return window.setTimeout(callback, 0); };
      schedule(function () { schedule(renderPdfPreviewPages); });
    }
    function getPdfReportSpec(kind) {
      var reportMonth = new Date(state.currentMonth.getFullYear(), state.currentMonth.getMonth(), 1);
      var reportYear = new Date(state.currentMonth.getFullYear(), 0, 1);
      var specs = {
        monthly: {
          kind: 'monthly',
          title: 'Report mensile',
          copy: 'Registro completo di ore e giornate del mese.',
          period: formatMonthYear(reportMonth),
          filename: getMonthlyReportPdfFilename(reportMonth),
          builder: 'monthly',
          date: reportMonth,
          tone: 'cyan'
        },
        yearly: {
          kind: 'yearly',
          title: 'Report annuale',
          copy: 'Riepilogo compatto delle ore registrate nell\'anno.',
          period: 'Anno ' + reportYear.getFullYear(),
          filename: getYearlyReportPdfFilename(reportYear),
          builder: 'yearly',
          date: reportYear,
          tone: 'violet'
        },
        completeYearly: {
          kind: 'completeYearly',
          title: 'Report annuale completo',
          copy: 'Ore, ferie, assenze, cedolini e stipendi mese per mese.',
          period: 'Anno ' + reportYear.getFullYear(),
          filename: getCompleteYearlyReportPdfFilename(reportYear),
          builder: 'completeYearly',
          date: reportYear,
          tone: 'amber'
        },
        salaries: {
          kind: 'salaries',
          title: 'Report stipendi',
          copy: 'Cedolini, importi netti e lordi, stime e andamento annuale.',
          period: 'Anno ' + reportYear.getFullYear(),
          filename: getSalaryReportPdfFilename(reportYear),
          builder: 'salaries',
          date: reportYear,
          tone: 'green'
        }
      };
      return specs[kind] || null;
    }
    function cleanupPdfPreview() {
      pdfPreviewRenderSequence += 1;
      if (state.pdfPreviewUrl) {
        try { URL.revokeObjectURL(state.pdfPreviewUrl); } catch (error) {}
      }
      state.pdfPreviewUrl = '';
      state.pdfPreviewName = '';
      state.pdfPreviewBlob = null;
      state.pdfPreviewOpen = false;
    }
    function openPdfExportDialog(kind) {
      if (!getPdfReportSpec(kind)) return;
      state.pdfExportKind = kind;
      state.pdfExportOpen = true;
      state.pdfExportBusy = false;
      render();
    }
    function closePdfExportDialog() {
      if (state.pdfExportBusy) return;
      state.pdfExportOpen = false;
      state.pdfExportKind = '';
      render();
    }
    async function buildSelectedPdfReport() {
      var spec = getPdfReportSpec(state.pdfExportKind);
      if (!spec) throw new Error('Scegli un report valido.');
      var reports = await loadPdfReportModules();
      var builder = reports[spec.builder];
      if (typeof builder !== 'function') throw new Error('Il report selezionato non e disponibile.');
      return {
        spec: spec,
        blob: builder(spec.date)
      };
    }
    async function previewSelectedPdfReport() {
      if (state.pdfExportBusy) return;
      state.pdfExportBusy = true;
      render();
      try {
        var artifact = await buildSelectedPdfReport();
        cleanupPdfPreview();
        state.pdfExportOpen = false;
        state.pdfExportKind = artifact.spec.kind;
        state.pdfExportBusy = false;
        state.pdfPreviewName = artifact.spec.filename;
        state.pdfPreviewBlob = artifact.blob;
        state.pdfPreviewOpen = true;
        render();
        queuePdfPreviewRender();
      } catch (error) {
        state.pdfExportBusy = false;
        render();
        toast(error && error.message ? error.message : 'Non riesco a creare l\'anteprima PDF.');
      }
    }
    async function downloadSelectedPdfReport() {
      if (state.pdfExportBusy) return;
      state.pdfExportBusy = true;
      render();
      try {
        var artifact = await buildSelectedPdfReport();
        state.pdfExportOpen = false;
        state.pdfExportBusy = false;
        downloadBlobFile(artifact.spec.filename, artifact.blob);
        render();
      } catch (error) {
        state.pdfExportBusy = false;
        render();
        toast(error && error.message ? error.message : 'Non riesco a scaricare il PDF.');
      }
    }
    function closePdfPreview() {
      cleanupPdfPreview();
      render();
    }
    function downloadCurrentPdfPreview() {
      if (!state.pdfPreviewBlob || !state.pdfPreviewName) return;
      downloadBlobFile(state.pdfPreviewName, state.pdfPreviewBlob);
    }
    function exportReport() {
      openPdfExportDialog('monthly');
    }
    function exportYearReport() {
      openPdfExportDialog('yearly');
    }
    function exportCompleteYearReport() {
      openPdfExportDialog('completeYearly');
    }
    function exportSalaryReport() {
      openPdfExportDialog('salaries');
    }
    function normalizeServerSnapshot(payload) {
      var source = payload && typeof payload === 'object' ? payload : {};
      return {
        entries: source.entries && typeof source.entries === 'object' && !Array.isArray(source.entries) ? source.entries : {},
        settings: source.settings && typeof source.settings === 'object' && !Array.isArray(source.settings) ? source.settings : {},
        payslips: Array.isArray(source.payslips) ? source.payslips : [],
        syncMeta: source.syncMeta && typeof source.syncMeta === 'object' ? source.syncMeta : {},
        updatedAt: Math.max(0, Number(source.updatedAt || 0) || 0)
      };
    }
    function hasMeaningfulSnapshotData(snapshot) {
      var normalized = normalizeServerSnapshot(snapshot);
      return Object.keys(normalized.entries).length > 0 ||
        normalized.payslips.length > 0 ||
        !areSettingsEffectivelyDefault(normalized.settings || {});
    }
    function buildStateSnapshot(options) {
      var opts = options || {};
      var payslips = state && Array.isArray(state.payslips) ? state.payslips : [];
      if (typeof serializePayslipsForSnapshot === 'function') {
        payslips = serializePayslipsForSnapshot(payslips, opts.includePayslipPhotos === true);
      }
      return {
        entries: state && state.entries && typeof state.entries === 'object' ? state.entries : {},
        settings: state && state.settings && typeof state.settings === 'object' ? normalizeRuntimeSettings(state.settings) : {},
        payslips: payslips,
        payslipsDeferred: opts.includePayslipPhotos !== true,
        baseUpdatedAt: Math.max(0, Number(serverSnapshotUpdatedAt) || 0),
        updatedAt: Date.now(),
        allowEmptyEntries: opts.allowEmptyEntries === true
      };
    }
    function getActiveSyncAccountId() {
      var accountId = state && state.account && state.account.user ? String(state.account.user.id || '') : '';
      if (accountId) return accountId;
      try { return String(localStorage.getItem('gestore-active-account-v1') || ''); }
      catch (err) { return ''; }
    }
    function readPendingSyncRecord() {
      var stored = readParsedStorage(STORAGE_PENDING_SYNC);
      var record = stored && stored.parsed;
      if (!record || typeof record !== 'object' || !record.snapshot || typeof record.snapshot !== 'object') return null;
      var activeAccountId = getActiveSyncAccountId();
      var recordAccountId = String(record.accountId || '');
      if (activeAccountId && recordAccountId && activeAccountId !== recordAccountId) return null;
      return {
        accountId: recordAccountId,
        savedAt: Math.max(0, Number(record.savedAt) || 0),
        revision: Math.max(0, Number(record.revision) || 0),
        snapshot: record.snapshot
      };
    }
    function persistPendingSyncRecord() {
      if (!state) return null;
      var record = {
        accountId: getActiveSyncAccountId(),
        savedAt: Date.now(),
        revision: Math.max(1, serverSyncRevision),
        snapshot: buildStateSnapshot({ allowEmptyEntries: serverSyncAllowEmptyEntries })
      };
      try { localStorage.setItem(STORAGE_PENDING_SYNC, JSON.stringify(record)); }
      catch (err) {}
      state.syncPending = true;
      return record;
    }
    function clearPendingSyncRecord(confirmedRevision) {
      var record = readPendingSyncRecord();
      if (record && confirmedRevision !== undefined && record.revision > Number(confirmedRevision || 0)) return;
      try { localStorage.removeItem(STORAGE_PENDING_SYNC); } catch (err) {}
      if (state) state.syncPending = false;
    }
    function mergePendingSnapshotWithServer(serverSnapshot, pendingRecord) {
      var server = normalizeServerSnapshot(serverSnapshot);
      var pendingSource = pendingRecord && pendingRecord.snapshot && typeof pendingRecord.snapshot === 'object'
        ? pendingRecord.snapshot
        : {};
      var pending = normalizeServerSnapshot(pendingSource);
      var mergedEntries = pendingSource.allowEmptyEntries === true
        ? pending.entries
        : Object.assign({}, server.entries, pending.entries);
      var payslipsById = {};
      (server.payslips || []).forEach(function (item, index) {
        var id = String(item && item.id || ('server-' + index));
        payslipsById[id] = item;
      });
      (pending.payslips || []).forEach(function (item, index) {
        var id = String(item && item.id || ('pending-' + index));
        payslipsById[id] = Object.assign({}, payslipsById[id] || {}, item);
      });
      return {
        entries: mergedEntries,
        settings: Object.keys(pending.settings || {}).length ? pending.settings : server.settings,
        payslips: Object.keys(payslipsById).map(function (id) { return payslipsById[id]; }),
        syncMeta: Object.assign({}, server.syncMeta, pending.syncMeta),
        updatedAt: Math.max(server.updatedAt, pending.updatedAt, Number(pendingRecord && pendingRecord.savedAt) || 0)
      };
    }
    function applySnapshotLocally(snapshot, options) {
      var normalized = normalizeServerSnapshot(snapshot);
      var opts = options || {};
      var preserveLockState = opts.preserveLockState === true;
      var wasLocked = state && typeof state.privacyLocked === 'boolean' ? state.privacyLocked : false;
      state.entries = normalized.entries;
      state.settings = normalizeRuntimeSettings(normalized.settings || {});
      state.settingsDraft = Object.assign({}, state.settings);
      state.payslips = typeof normalizePayslipCollection === 'function'
        ? normalizePayslipCollection(normalized.payslips)
        : normalized.payslips.slice();
      state.privacyLocked = Boolean(state.settings.lockApp) && (preserveLockState ? wasLocked : true);
      persistEntriesLocally();
      persistSettingsLocally();
      persistPayslipsLocally();
      saveSafetyBundle();
    }
    function setSyncStatus(label, syncedAt) {
      if (!state) return;
      state.syncStatus = label || 'Solo sul dispositivo';
      state.lastSyncedAt = syncedAt ? Math.max(0, Number(syncedAt) || 0) : 0;
      refreshSyncStatusIndicators();
    }
    function refreshSyncStatusIndicators() {
      if (!state || typeof document === 'undefined') return;
      var message = getSyncStatusMessage();
      document.querySelectorAll('[data-sync-status-label]').forEach(function (node) {
        node.textContent = message;
      });
      document.querySelectorAll('[data-sync-status-state]').forEach(function (node) {
        node.setAttribute('data-state', state.syncPending ? 'pending' : (serverSyncLastError ? 'offline' : 'synced'));
        node.textContent = state.syncPending ? 'IN ATTESA' : (serverSyncLastError ? 'OFFLINE' : 'SALVATO');
      });
    }
    function clearServerSyncRetry() {
      if (!serverSyncRetryTimer) return;
      window.clearTimeout(serverSyncRetryTimer);
      serverSyncRetryTimer = 0;
    }
    function scheduleServerSyncRetry() {
      clearServerSyncRetry();
      serverSyncRetryAttempt = Math.min(serverSyncRetryAttempt + 1, 8);
      var delay = Math.min(60000, 900 * Math.pow(2, Math.max(0, serverSyncRetryAttempt - 1)));
      serverSyncRetryTimer = window.setTimeout(function () {
        serverSyncRetryTimer = 0;
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
          scheduleServerSyncRetry();
          return;
        }
        if (!serverSyncReady && state && state.account && state.account.authenticated) {
          bootstrapServerState();
          return;
        }
        syncStateToServer();
      }, delay);
    }
    function getSyncStatusMessage() {
      var label = state && state.syncStatus ? state.syncStatus : 'Solo sul dispositivo';
      if (!state || !state.lastSyncedAt) return label + '.';
      var when = new Date(state.lastSyncedAt);
      return label + ' alle ' + pad(when.getHours()) + ':' + pad(when.getMinutes()) + '.';
    }
    var appStatusAnnouncementTimer = 0;
    function announceAppStatus(message) {
      var node = document.getElementById('goA11yStatus');
      if (!node) return;
      if (appStatusAnnouncementTimer) window.clearTimeout(appStatusAnnouncementTimer);
      node.textContent = '';
      window.requestAnimationFrame(function () {
        node.textContent = String(message || '');
        appStatusAnnouncementTimer = window.setTimeout(function () {
          node.textContent = '';
          appStatusAnnouncementTimer = 0;
        }, 2800);
      });
    }
    function confirmImportantAction(message, hapticStyle) {
      announceAppStatus(message);
      var nativeBridge = window.GestOreNative;
      if (nativeBridge && typeof nativeBridge.haptic === 'function') {
        Promise.resolve(nativeBridge.haptic(hapticStyle || 'medium')).catch(function () {});
      }
    }
    function makeServerMutationId(prefix) {
      return String(prefix || 'sync') + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
    }
    function getServerSyncFailureMessage() {
      return serverSyncLastError || 'Il server non ha confermato il salvataggio.';
    }
    async function pushSnapshotToServer(snapshot, options) {
      var opts = options || {};
      var mutationId = String(opts.mutationId || makeServerMutationId('snapshot'));
      var controller = typeof AbortController === 'function' ? new AbortController() : null;
      var timeout = controller ? window.setTimeout(function () { controller.abort(); }, Math.max(5000, Number(opts.timeoutMs) || 15000)) : 0;
      try {
        var response = await fetch(SERVER_SYNC_URL, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'X-GestOre-Mutation-Id': mutationId,
            'Prefer': opts.minimal === true ? 'return=minimal' : 'return=representation'
          },
          cache: 'no-store',
          body: JSON.stringify(snapshot),
          signal: controller ? controller.signal : undefined
        });
        if (response.status === 401 && typeof handleAccountUnauthorized === 'function') handleAccountUnauthorized();
        var payload = {};
        try { payload = await response.json(); } catch (parseError) {}
        if (!response.ok) {
          var responseError = new Error(payload.error || 'Il server ha rifiutato il salvataggio.');
          responseError.status = response.status;
          responseError.code = String(payload.code || '');
          if (payload.serverSnapshot && typeof payload.serverSnapshot === 'object') {
            responseError.serverSnapshot = normalizeServerSnapshot(payload.serverSnapshot);
          }
          throw responseError;
        }
        if (opts.minimal === true) {
          if (!payload.ok || String(payload.mutationId || '') !== mutationId) throw new Error('Conferma del server non valida.');
          if (snapshot.payslipsDeferred !== true && Number(payload.payslips) !== (Array.isArray(snapshot.payslips) ? snapshot.payslips.length : 0)) {
            throw new Error('Il numero di buste nel database non coincide.');
          }
          serverSnapshotUpdatedAt = Math.max(serverSnapshotUpdatedAt, Number(payload.updatedAt) || 0);
          return payload;
        }
        var normalizedPayload = normalizeServerSnapshot(payload);
        serverSnapshotUpdatedAt = Math.max(serverSnapshotUpdatedAt, normalizedPayload.updatedAt);
        return normalizedPayload;
      } catch (err) {
        if (err && err.name === 'AbortError') throw new Error('Il server sta impiegando troppo tempo. Riprova.');
        throw err;
      } finally {
        if (timeout) window.clearTimeout(timeout);
      }
    }
    async function pushSnapshotWithConflictRecovery(snapshot, options) {
      var outgoing = snapshot && typeof snapshot === 'object' ? snapshot : buildStateSnapshot();
      var opts = options || {};
      for (var attempt = 0; attempt < 2; attempt += 1) {
        try {
          return await pushSnapshotToServer(outgoing, opts);
        } catch (err) {
          if (!err || err.code !== 'snapshot_conflict' || !err.serverSnapshot || attempt > 0) throw err;
          var serverSnapshot = normalizeServerSnapshot(err.serverSnapshot);
          serverSnapshotUpdatedAt = serverSnapshot.updatedAt;
          var latestLocal = buildStateSnapshot({
            includePayslipPhotos: outgoing.payslipsDeferred !== true,
            allowEmptyEntries: outgoing.allowEmptyEntries === true
          });
          var merged = mergePendingSnapshotWithServer(serverSnapshot, {
            snapshot: latestLocal,
            savedAt: Date.now(),
            revision: serverSyncRevision
          });
          applySnapshotLocally(merged, { preserveLockState: true });
          if (state) {
            state.syncConflictNotice = 'Due dispositivi hanno salvato insieme: GestOre ha unito i dati senza eliminare le giornate presenti.';
          }
          setSyncStatus('Modifiche unite, conferma sul server', 0);
          outgoing = buildStateSnapshot({
            includePayslipPhotos: latestLocal.payslipsDeferred !== true,
            allowEmptyEntries: latestLocal.allowEmptyEntries === true
          });
        }
      }
      throw new Error('Impossibile completare la sincronizzazione.');
    }
    async function syncStateToServer() {
      if (!serverSyncReady || serverSyncInFlight || !window.fetch) return false;
      var pendingRecord = readPendingSyncRecord();
      if (pendingRecord && serverSyncRevision <= serverSyncConfirmedRevision) {
        serverSyncRevision = Math.max(serverSyncConfirmedRevision + 1, pendingRecord.revision || 1);
      }
      serverSyncInFlight = true;
      var syncRevision = serverSyncRevision;
      var succeeded = false;
      try {
        var allowEmptyEntries = serverSyncAllowEmptyEntries;
        var outgoing = buildStateSnapshot({ allowEmptyEntries: allowEmptyEntries });
        state.syncPending = true;
        setSyncStatus('Salvataggio sul server', 0);
        await pushSnapshotWithConflictRecovery(outgoing, { minimal: true });
        // The compact ACK confirms SQLite without replacing newer in-memory edits.
        if (syncRevision === serverSyncRevision) {
          if (allowEmptyEntries) serverSyncAllowEmptyEntries = false;
        }
        serverSyncLastError = '';
        serverSyncConfirmedRevision = Math.max(serverSyncConfirmedRevision, syncRevision);
        serverSyncRetryAttempt = 0;
        clearServerSyncRetry();
        if (syncRevision === serverSyncRevision) clearPendingSyncRecord(syncRevision);
        setSyncStatus('Salvato sul server', Date.now());
        succeeded = true;
      } catch (err) {
        serverSyncLastError = err && err.message ? err.message : 'Server non raggiungibile.';
        state.syncPending = true;
        setSyncStatus('Offline, dati protetti sul dispositivo', 0);
        scheduleServerSyncRetry();
      } finally {
        serverSyncInFlight = false;
        if (serverSyncRevision > syncRevision) {
          if (serverSyncTimer) window.clearTimeout(serverSyncTimer);
          serverSyncTimer = window.setTimeout(function () {
            serverSyncTimer = 0;
            syncStateToServer();
          }, 0);
        }
        if (state && state.activeTab === 'settings' && typeof render === 'function') render();
      }
      return succeeded;
    }
    async function flushServerSyncNow() {
      if (!window.fetch) return false;
      var readyStartedAt = Date.now();
      while (!serverSyncReady) {
        if (state && state.account && state.account.loaded && !state.account.authenticated) {
          serverSyncLastError = 'Accedi al tuo account prima di salvare.';
          return false;
        }
        if (Date.now() - readyStartedAt > 15000) {
          serverSyncLastError = 'Il database del profilo non e ancora pronto.';
          return false;
        }
        await new Promise(function (resolve) { window.setTimeout(resolve, 50); });
      }
      if (!serverSyncInFlight && !serverSyncTimer && serverSyncRevision === serverSyncConfirmedRevision && !readPendingSyncRecord()) return true;
      for (var attempt = 0; attempt < 8; attempt += 1) {
        var waitStartedAt = Date.now();
        while (serverSyncInFlight) {
          if (Date.now() - waitStartedAt > 22000) return false;
          await new Promise(function (resolve) { window.setTimeout(resolve, 25); });
        }
        if (serverSyncTimer) {
          window.clearTimeout(serverSyncTimer);
          serverSyncTimer = 0;
        }
        var targetRevision = serverSyncRevision;
        var succeeded = await syncStateToServer();
        if (!succeeded) {
          if (attempt >= 2 || (state && state.account && state.account.loaded && !state.account.authenticated)) return false;
          await new Promise(function (resolve) { window.setTimeout(resolve, 250 * (attempt + 1)); });
          continue;
        }
        if (!serverSyncInFlight && serverSyncRevision === targetRevision) return true;
      }
      return false;
    }
    function queueServerSync() {
      serverSyncRevision += 1;
      persistPendingSyncRecord();
      setSyncStatus('In attesa di sincronizzazione', 0);
      if (!serverSyncReady || !window.fetch) return;
      if (serverSyncTimer) window.clearTimeout(serverSyncTimer);
      serverSyncTimer = window.setTimeout(function () {
        serverSyncTimer = 0;
        syncStateToServer();
      }, 120);
    }
    function persistPendingSnapshotOnPageHide() {
      saveSafetyBundle();
      if (serverSyncRevision !== serverSyncConfirmedRevision) persistPendingSyncRecord();
      if (!serverSyncReady || serverSyncRevision === serverSyncConfirmedRevision) return;
      if (state && state.account && state.account.loaded && !state.account.authenticated) return;
      var snapshot = buildStateSnapshot({ allowEmptyEntries: serverSyncAllowEmptyEntries });
      var raw = JSON.stringify(snapshot);
      if (raw.length > 60000) return;
      try {
        if (navigator.sendBeacon) {
          navigator.sendBeacon(SERVER_SYNC_URL, new Blob([raw], { type: 'application/json' }));
        }
      } catch (err) {}
    }
    function mergeServerSnapshotWithDeviceCache(serverSnapshot, localSnapshot) {
      var server = normalizeServerSnapshot(serverSnapshot);
      var local = normalizeServerSnapshot(localSnapshot);
      var mergedEntries = Object.assign({}, local.entries, server.entries);
      var localPayslipsById = {};
      (local.payslips || []).forEach(function (item) {
        var id = String(item && item.id || '');
        if (id) localPayslipsById[id] = item;
      });
      var seen = {};
      var mergedPayslips = (server.payslips || []).map(function (serverItem) {
        var id = String(serverItem && serverItem.id || '');
        var localItem = id ? localPayslipsById[id] : null;
        if (id) seen[id] = true;
        if (!localItem) return serverItem;
        var merged = Object.assign({}, localItem, serverItem);
        var cachedPhotos = typeof normalizePayslipPhotos === 'function' ? normalizePayslipPhotos(localItem) : [];
        if (cachedPhotos.length && serverItem.photosDeferred) {
          merged.photos = cachedPhotos;
          merged.imageData = cachedPhotos[0].data;
          merged.fileName = cachedPhotos[0].fileName;
          merged.photoCount = Math.max(cachedPhotos.length, Number(serverItem.photoCount) || 0);
        }
        if (serverItem.sourceTextDeferred && localItem.sourceText) merged.sourceText = localItem.sourceText;
        return merged;
      });
      var recoveredPayslips = false;
      (local.payslips || []).forEach(function (item) {
        var id = String(item && item.id || '');
        if (!id || seen[id]) return;
        seen[id] = true;
        recoveredPayslips = true;
        mergedPayslips.push(item);
      });
      return {
        snapshot: {
          entries: mergedEntries,
          settings: server.settings,
          payslips: mergedPayslips,
          syncMeta: server.syncMeta,
          updatedAt: server.updatedAt
        },
        recoveredEntries: Object.keys(mergedEntries).length > Object.keys(server.entries).length,
        recoveredPayslips: recoveredPayslips
      };
    }
    async function bootstrapServerState() {
      if (!window.fetch) {
        setSyncStatus('Solo sul dispositivo', 0);
        serverSyncReady = true;
        return true;
      }
      var completed = false;
      try {
        if (window.GestOreSplash && typeof window.GestOreSplash.update === 'function') {
          window.GestOreSplash.update('Carico i dati del tuo profilo', .56, 'loading');
        } else {
          var splashStatus = document.getElementById('splashStatusText');
          if (splashStatus) splashStatus.textContent = 'Carico i dati del tuo profilo';
        }
        var response = null;
        var bootstrapError = null;
        for (var requestAttempt = 0; requestAttempt < 3; requestAttempt += 1) {
          var bootstrapController = typeof AbortController === 'function' ? new AbortController() : null;
          var bootstrapTimeout = bootstrapController ? window.setTimeout(function () { bootstrapController.abort(); }, 12000) : 0;
          try {
            response = await fetch(SERVER_SYNC_URL + '?compact=1', {
              cache: 'no-store',
              signal: bootstrapController ? bootstrapController.signal : undefined
            });
            if (!response.ok) throw new Error('Database del profilo non disponibile.');
            bootstrapError = null;
            break;
          } catch (err) {
            bootstrapError = err;
            if (requestAttempt < 2) await new Promise(function (resolve) { window.setTimeout(resolve, 300 * (requestAttempt + 1)); });
          } finally {
            if (bootstrapTimeout) window.clearTimeout(bootstrapTimeout);
          }
        }
        if (!response || bootstrapError) throw bootstrapError || new Error('Database del profilo non disponibile.');
        var serverSnapshot = normalizeServerSnapshot(await response.json());
        serverSnapshotUpdatedAt = serverSnapshot.updatedAt;
        var localSnapshot = buildStateSnapshot({ includePayslipPhotos: true });
        var pendingRecord = readPendingSyncRecord();
        var localHasData = hasMeaningfulSnapshotData(localSnapshot);
        var serverHasData = hasMeaningfulSnapshotData(serverSnapshot);
        var pendingIsNewer = Boolean(pendingRecord && pendingRecord.savedAt >= serverSnapshot.updatedAt);
        if (pendingIsNewer) {
          var pendingMergedSnapshot = mergePendingSnapshotWithServer(serverSnapshot, pendingRecord);
          applySnapshotLocally(pendingMergedSnapshot, { preserveLockState: true });
          serverSyncRevision = Math.max(serverSyncRevision, pendingRecord.revision || 1);
          await pushSnapshotWithConflictRecovery(
            buildStateSnapshot({ allowEmptyEntries: pendingRecord.snapshot.allowEmptyEntries === true }),
            { minimal: true, timeoutMs: 30000 }
          );
          serverSyncConfirmedRevision = serverSyncRevision;
          clearPendingSyncRecord(serverSyncRevision);
          setSyncStatus('Modifiche locali recuperate e salvate', Date.now());
        } else if (serverHasData) {
          if (pendingRecord) clearPendingSyncRecord(pendingRecord.revision);
          var merged = mergeServerSnapshotWithDeviceCache(serverSnapshot, localSnapshot);
          applySnapshotLocally(merged.snapshot);
          if (merged.recoveredEntries || merged.recoveredPayslips) {
            await pushSnapshotWithConflictRecovery(
              buildStateSnapshot({ includePayslipPhotos: merged.recoveredPayslips }),
              { minimal: true, timeoutMs: 30000 }
            );
            setSyncStatus('Dati locali recuperati e sincronizzati', Date.now());
          } else {
            setSyncStatus('Dati ripristinati dal server', Date.now());
          }
        } else if (localHasData) {
          await pushSnapshotWithConflictRecovery(localSnapshot, { minimal: true, timeoutMs: 30000 });
          applySnapshotLocally(localSnapshot, { preserveLockState: true });
          if (pendingRecord) clearPendingSyncRecord(pendingRecord.revision);
          setSyncStatus('Dati recuperati dal dispositivo', Date.now());
        } else {
          setSyncStatus('Pronto per la sync locale', 0);
        }
        serverSyncLastError = '';
        serverSyncRetryAttempt = 0;
        clearServerSyncRetry();
        completed = true;
      } catch (err) {
        serverSyncLastError = err && err.message ? err.message : 'Database del profilo non disponibile.';
        if (hasMeaningfulSnapshotData(buildStateSnapshot()) || readPendingSyncRecord()) {
          state.syncPending = Boolean(readPendingSyncRecord());
          setSyncStatus('Offline, uso la copia protetta sul dispositivo', 0);
          scheduleServerSyncRetry();
        } else {
          setSyncStatus('Solo sul dispositivo', 0);
        }
      } finally {
        var hasRemoteAccount = Boolean(state && state.account && state.account.authenticated && state.account.user);
        serverSyncReady = completed || !hasRemoteAccount;
        if (typeof render === 'function') render();
      }
      return completed;
    }
    async function ensureNotificationPermission(requestIfNeeded) {
      var nativeBridge = window.GestOreNative;
      if (nativeBridge && nativeBridge.isNative && typeof nativeBridge.requestNotifications === 'function') {
        if (!requestIfNeeded && nativeBridge.notificationPermission === 'prompt') return 'default';
        return nativeBridge.requestNotifications();
      }
      if (!('Notification' in window)) return 'unsupported';
      var permission = Notification.permission;
      if (permission !== 'granted' && requestIfNeeded) permission = await Notification.requestPermission();
      return permission;
    }
    function getReminderTimeValue() {
      return normalizeTimeInputValue((state && state.settings && state.settings.reminderTime) || defaultSettings.reminderTime || '20:00');
    }
    function getNextReminderDate(baseDate) {
      var reminderTime = getReminderTimeValue();
      if (!reminderTime) return null;
      var now = baseDate ? new Date(baseDate) : new Date();
      var parts = reminderTime.split(':').map(Number);
      if (parts.length !== 2) return null;
      var target = new Date(now);
      target.setHours(parts[0], parts[1], 0, 0);
      if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1);
      return target;
    }
    function clearReminderSchedule() {
      if (reminderTimer) {
        window.clearTimeout(reminderTimer);
        reminderTimer = 0;
      }
    }
    function getSmartReminderContent(referenceDate) {
      var now = referenceDate instanceof Date ? new Date(referenceDate.getTime()) : new Date();
      var settingsSource = state && state.settings ? state.settings : defaultSettings;
      var weekday = now.getDay();

      if (settingsSource.smartReminderWeeklyReview !== false && (weekday === 6 || weekday === 1)) {
        var weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
        weekStart.setDate(weekStart.getDate() - mondayIndex(weekStart.getDay()));
        if (weekday === 1) weekStart.setDate(weekStart.getDate() - 7);
        var missingWeekDays = [];
        for (var offset = 0; offset < 7; offset += 1) {
          var weekDate = new Date(weekStart);
          weekDate.setDate(weekStart.getDate() + offset);
          if (!isConfiguredWorkday(weekDate, settingsSource)) continue;
          if (!getEntryForDate(weekDate)) missingWeekDays.push(weekDate);
        }
        if (missingWeekDays.length) {
          return {
            kind: 'weekly',
            title: 'Riepilogo settimanale',
            body: missingWeekDays.length + (missingWeekDays.length === 1 ? ' giornata lavorativa da controllare.' : ' giornate lavorative da controllare.')
          };
        }
      }

      if (settingsSource.smartReminderMissingDays !== false && isConfiguredWorkday(now, settingsSource) && !getEntryForDate(now)) {
        return {
          kind: 'missing-day',
          title: settingsSource.appName || 'GestOre',
          body: 'La giornata di oggi non e ancora registrata.'
        };
      }

      if (settingsSource.smartReminderPayslips !== false && now.getDate() >= 10) {
        var previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        var payslipFound = (state && Array.isArray(state.payslips) ? state.payslips : []).some(function (item) {
          return Number(item && item.year) === previousMonth.getFullYear() &&
            Number(item && item.month) === previousMonth.getMonth() + 1;
        });
        if (!payslipFound) {
          return {
            kind: 'payslip',
            title: 'Archivio cedolini',
            body: 'Il cedolino di ' + monthNames[previousMonth.getMonth()] + ' non e ancora presente.'
          };
        }
      }
      return null;
    }
    function sendReminderNotification(source) {
      var reminderTime = getReminderTimeValue();
      if (!reminderTime) return false;
      var content = source === 'manual'
        ? { kind: 'test', title: state.settings.appName, body: 'Notifiche attive. GestOre ti avvisera solo quando serve.' }
        : getSmartReminderContent(new Date());
      if (!content) return false;
      var reminderKey = toISODate(new Date()) + '|' + reminderTime + '|' + content.kind;
      if (source !== 'manual' && reminderLastSentKey === reminderKey) return false;
      if (source !== 'manual') reminderLastSentKey = reminderKey;
      var nativeBridge = window.GestOreNative;
      if (nativeBridge && nativeBridge.isNative && typeof nativeBridge.notifyNow === 'function') {
        nativeBridge.notifyNow({
          id: 91001,
          title: content.title || state.settings.appName,
          body: content.body,
          extra: { kind: content.kind }
        }).catch(function () {});
        return true;
      }
      if (!('Notification' in window) || Notification.permission !== 'granted') return false;
      new Notification(content.title || state.settings.appName, {
        body: content.body,
        tag: 'gestore-' + content.kind
      });
      return true;
    }
    function updateReminderSchedule() {
      clearReminderSchedule();
      if (!state || !state.settings || !state.settings.remindersEnabled) return;
      var nativeBridge = window.GestOreNative;
      if (nativeBridge && nativeBridge.isNative && typeof nativeBridge.scheduleNotification === 'function') {
        var nativeNextReminder = getNextReminderDate(new Date());
        var nativeContent = getSmartReminderContent(new Date()) || {
          kind: 'daily-check',
          title: state.settings.appName || 'GestOre',
          body: 'Controlla che la giornata sia registrata correttamente.'
        };
        nativeBridge.cancelNotification(91002).then(function () {
          if (!nativeNextReminder) return;
          return nativeBridge.scheduleNotification({
            id: 91002,
            title: nativeContent.title,
            body: nativeContent.body,
            at: nativeNextReminder,
            extra: { kind: nativeContent.kind }
          });
        }).catch(function () {});
        return;
      }
      if (!('Notification' in window) || Notification.permission !== 'granted') return;
      var nextReminder = getNextReminderDate(new Date());
      if (!nextReminder) return;
      var delay = Math.max(1000, Math.min(2147483647, nextReminder.getTime() - Date.now()));
      reminderTimer = window.setTimeout(function () {
        sendReminderNotification('scheduled');
        updateReminderSchedule();
      }, delay);
    }
    function getReminderHelperText() {
      var nativeBridge = window.GestOreNative;
      if (nativeBridge && nativeBridge.isNative) {
        if (!state || !state.settings || !state.settings.remindersEnabled) return 'Attiva il promemoria per ricevere una notifica locale anche quando GestOre e chiusa.';
        var nativeNext = getNextReminderDate(new Date());
        if (!nativeNext) return 'Imposta un orario valido per il promemoria.';
        return 'Prossimo controllo alle ' + pad(nativeNext.getHours()) + ':' + pad(nativeNext.getMinutes()) + ', anche con app chiusa.';
      }
      if (!('Notification' in window)) return 'Notifiche non disponibili in questo browser.';
      if (!state || !state.settings || !state.settings.remindersEnabled) return 'Attiva il promemoria per ricevere una notifica locale quando GestOre resta aperta.';
      if (Notification.permission !== 'granted') return 'Serve il permesso notifiche per far partire il promemoria automatico.';
      var nextReminder = getNextReminderDate(new Date());
      if (!nextReminder) return 'Imposta un orario valido per il promemoria.';
      return "Controllo alle " + pad(nextReminder.getHours()) + ':' + pad(nextReminder.getMinutes()) + ": la notifica appare solo se c'e qualcosa da completare.";
    }
    function unlockPrivacyScreen() {
      if (!state) return;
      state.privacyLocked = false;
      if (typeof render === 'function') render();
    }
    function initializeRuntimeServices() {
      if (runtimeServicesStarted) return;
      runtimeServicesStarted = true;
      if (state && state.settings && state.settings.lockApp) state.privacyLocked = true;
      document.addEventListener('visibilitychange', function () {
        if (!state || !state.settings) return;
        if (document.visibilityState === 'hidden') {
          if (state.settings.lockApp) state.privacyLocked = true;
          persistPendingSnapshotOnPageHide();
          return;
        }
        updateReminderSchedule();
        if (readPendingSyncRecord()) {
          if (serverSyncReady) syncStateToServer();
          else if (state.account && state.account.authenticated) bootstrapServerState();
        }
        if (state.settings.lockApp && state.privacyLocked && typeof render === 'function') render();
      });
      window.addEventListener('pagehide', persistPendingSnapshotOnPageHide);
      window.addEventListener('online', function () {
        clearServerSyncRetry();
        if (serverSyncReady) syncStateToServer();
        else if (state && state.account && state.account.authenticated) bootstrapServerState();
      });
      window.addEventListener('offline', function () {
        if (!state) return;
        state.syncPending = Boolean(readPendingSyncRecord());
        setSyncStatus('Offline, dati protetti sul dispositivo', 0);
      });
      if (typeof bootstrapAccountSession === 'function') bootstrapAccountSession();
      else bootstrapServerState();
      updateReminderSchedule();
      if (typeof initializeFeatureServices === 'function') initializeFeatureServices();
      if (typeof initializePlatformServices === 'function') initializePlatformServices();
    }
    async function testNotification() {
      var permission = await ensureNotificationPermission(true);
      if (permission === 'unsupported') { alert('Notifiche non disponibili in questo browser.'); return; }
      if (permission !== 'granted') { alert('Permesso notifiche non concesso.'); return; }
      sendReminderNotification('manual');
      updateReminderSchedule();
    }
    function typeIconSvg(type) {
      if (type === 'lavoro') return '<span class="type-emoji">💼</span>';
      if (type === 'lavoro_ferie') return '<span class="type-emoji">🧳</span>';
      if (type === 'ferie') return '<span class="type-emoji">🏖️</span>';
      if (type === 'malattia') return '<span class="type-emoji">🤒</span>';
      if (type === 'permesso') return '<span class="type-emoji">📄</span>';
      if (type === 'festivita_pagata') return '<span class="type-emoji">🎉</span>';
      return '<span class="type-emoji">😴</span>';
    }
    function typeIconBg(type) {
      if (type === 'lavoro') return '#18c48f';
      if (type === 'lavoro_ferie') return '#4f7cff';
      if (type === 'ferie') return '#43b9f4';
      if (type === 'malattia') return '#ffb000';
      if (type === 'permesso') return '#cf48eb';
      if (type === 'festivita_pagata') return '#fb7185';
      return '#7f90ad';
    }
    function currentHomeStatus(entry, breakdown) {
      if (!entry) return 'Aggiungi giornata';
      if (entry.type === 'riposo') return 'Giornata di riposo';
      if (entry.type === 'ferie') return 'Giornata di ferie';
      if (entry.type === 'malattia') return 'Giornata di malattia';
      if (entry.type === 'permesso') return 'Giornata di permesso';
      if (entry.type === 'festivita_pagata') {
        var holidayName = getHolidayDisplayName(entry);
        return holidayName ? (holidayName + ' • Festivita pagata') : 'Festivita pagata';
      }
      var pieces = [];
      if (entry.start && entry.end) pieces.push(entry.start + ' - ' + entry.end);
      if (entry.type === 'lavoro_ferie' && breakdown.leave > 0) pieces.push(formatHourValue(minutesToHours(breakdown.leave)) + ' ferie');
      if (breakdown.overtime > 0) pieces.push(formatHourValue(minutesToHours(breakdown.overtime)) + ' extra');
      return pieces.length ? pieces.join(' • ') : 'Giornata registrata';
    }
    function getHomeStateDayUi(typeKey, entry) {
      if (typeKey === 'ferie') return { emoji: '🏖️', title: 'Giornata di ferie', message: 'Oggi niente lavoro, ti godi un po\' di stacco.' };
      if (typeKey === 'malattia') return { emoji: '🤒', title: 'Giornata di malattia', message: 'Oggi si rallenta e si recuperano le energie.' };
      if (typeKey === 'permesso') return { emoji: '📄', title: 'Giornata di permesso', message: 'Hai segnato un permesso per questa giornata.' };
      if (typeKey === 'festivita_pagata') {
        var holidayName = getHolidayDisplayName(entry);
        return { emoji: '🎉', title: holidayName || 'Festivita pagata', message: 'Giornata coperta in automatico come festivita pagata.' };
      }
      return { emoji: '😴', title: 'Giornata di riposo', message: 'Oggi niente lavoro, si riposa.' };
    }
    function getWeekDaysData(baseDate) {
      var start = new Date(baseDate);
      start.setDate(start.getDate() - mondayIndex(start.getDay()));
      var todayKey = toISODate(baseDate);
      return Array.from({ length: 7 }, function (_, i) {
        var d = new Date(start);
        d.setDate(start.getDate() + i);
        var key = toISODate(d);
        var entry = getEntryForDate(d);
        var breakdown = getBreakdown(entry);
        return {
          key: key,
          label: weekNames[i],
          entry: entry,
          minutes: breakdown.total,
          isToday: key === todayKey
        };
      });
    }
    function getEditorQuantityLabel(type) {
      if (type === 'ferie') return 'Ore ferie';
      if (type === 'malattia') return 'Ore malattia';
      if (type === 'permesso') return 'Ore permesso';
      if (type === 'festivita_pagata') return 'Ore coperte';
      return 'Ore';
    }
    function getEditorQuantityHint(type) {
      if (type === 'ferie') return 'Segna quante ore di ferie coprono la giornata.';
      if (type === 'malattia') return 'Segna quante ore copre la malattia.';
      if (type === 'permesso') return 'Segna quante ore copre il permesso.';
      if (type === 'festivita_pagata') return 'Si imposta da sola sul target giornaliero, ma puoi correggerla se serve.';
      return 'Puoi scrivere 0,5 oppure 1,5.';
    }
    function runInlineTests() {
      var tests = [];
      function add(name, passed) { tests.push({ name: name, passed: Boolean(passed) }); }
      add('hoursToMinutes converte 0.5h in 30 minuti', hoursToMinutes(0.5) === 30);
      add('minutesToHours converte 90 minuti in 1.5h', minutesToHours(90) === 1.5);
      add('calcWorkedMinutes calcola 8-18 con 1h pausa = 540 minuti', calcWorkedMinutes({ start:'08:00', end:'18:00', breakHours:1 }) === 540);
      add('getAutoOvertimeMinutes usa il target giornaliero', getAutoOvertimeMinutes({ type:'lavoro', start:'08:00', end:'18:00', breakHours:1, overtimeHours:0, overtimeManual:false }) === 60);
      add('getBreakdown usa l extra automatico quando non e manuale', getBreakdown({ type:'lavoro', start:'08:00', end:'18:00', breakHours:1, overtimeHours:0, overtimeManual:false }).overtime === 60);
      add('getBreakdown rispetta zero extra impostato manualmente', getBreakdown({ type:'lavoro', start:'08:00', end:'18:00', breakHours:1, overtimeHours:0, overtimeManual:true }).overtime === 0);
      add('festivita italiane includono il 25 aprile', (getItalianHolidayInfo(new Date(2026, 3, 25)) || {}).name === 'Festa della Liberazione');
      add('festivita italiane includono Pasqua 2026', (getItalianHolidayInfo(new Date(2026, 3, 5)) || {}).name === 'Pasqua');
      add('festivita pagata copre il target giornaliero', getBreakdown({ type:'festivita_pagata', quantityHours:getDefaultPaidDayHours() }).leave === getDailyTargetMinutes());
      add('migra i vecchi giorni lavorativi lun-ven nel formato nuovo', normalizeRuntimeSettings({ workdays:[1,2,3,4,5], autoRestDays:[0] }).workdays.join(',') === '0,1,2,3,4' && normalizeRuntimeSettings({ workdays:[1,2,3,4,5], autoRestDays:[0] }).autoRestDays.join(',') === '6');
      add('normalizza la frequenza dello storico protetto', normalizeRuntimeSettings({ protectedHistoryFrequency:'weekly' }).protectedHistoryFrequency === 'weekly' && normalizeRuntimeSettings({ protectedHistoryFrequency:'casuale' }).protectedHistoryFrequency === 'daily');
      add('festivita pagata usa il target passato nelle impostazioni', getAutoHolidayHours(new Date(2026, 3, 6), { workdays:[0,1,2,3,4], holidayHoursOnOffDays:false, dailyTarget:6 }) === 6);
      add('festivita su sabato attivo senza override non copre ore', getAutoHolidayHours(new Date(2026, 7, 15), { workdays:[0,1,2,3,4,5], holidayHoursOnOffDays:false, dailyTarget:8 }) === 0);
      add('festivita su domenica senza override non copre ore', getAutoHolidayHours(new Date(2026, 3, 5), { workdays:[0,1,2,3,4], holidayHoursOnOffDays:false, dailyTarget:8 }) === 0);
      var vacationFixture = calculateVacationBalance({
        '2026-07-01': { type:'ferie', quantityHours:8 },
        '2026-07-02': { type:'lavoro_ferie', start:'08:00', end:'12:00', breakHours:0, leaveHours:4 }
      }, { dailyTarget:8, vacationAllowanceByYear:{ '2026':20 } }, 2026);
      add('saldo ferie conta giornate intere e parziali', vacationFixture.usedMinutes === 720 && vacationFixture.remainingMinutes === 8880);
      add('ferie storiche senza quantita coprono il target giornaliero', getBreakdown({ type:'ferie' }).leave === getDailyTargetMinutes());
      var statisticsFixture = calculatePeriodStats([
        ['2026-07-01', { type:'lavoro', start:'08:00', end:'17:00', breakHours:1 }],
        ['2026-07-02', { type:'ferie' }],
        ['2026-07-03', { type:'lavoro_ferie', start:'08:00', end:'12:00', breakHours:0, leaveHours:4 }]
      ]);
      add('statistiche separano lavoro e ferie ma sommano la copertura', statisticsFixture.totalMinutes === 720 && statisticsFixture.vacationMinutes === 720 && statisticsFixture.coveredMinutes === 1440);
      add('buildMonthGrid restituisce 35 celle', buildMonthGrid(new Date()).length === 35);
      add('migrazione dati attiva', typeof loadWithMigration === 'function');
      return tests;
    }
