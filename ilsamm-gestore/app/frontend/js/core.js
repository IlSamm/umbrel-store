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
    var ENTRY_BACKUP_KEYS = ['gestore-entries-backup-v1', 'gestore-entries-backup-v2'];
    var SETTINGS_BACKUP_KEYS = ['gestore-settings-backup-v1', 'gestore-settings-backup-v2'];
    var STORAGE_SAFETY_BUNDLE = 'gestore-safety-bundle-v1';
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
      reminderTime: '20:00',
      userName: 'Utente',
      lockApp: false,
      workdays: [1,2,3,4,5],
      autoRestDays: [],
      version: '1.1.0',
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
      riposo: { label: 'Riposo', dot: '#64748b' }
    };

    var icons = {
      calendar: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"></rect><path d="M16 2v4M8 2v4M3 10h18"></path></svg>',
      activity: '<svg viewBox="0 0 24 24"><path d="M3 12h4l2-4 4 8 2-4h6"></path></svg>',
      left: '<svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"></path></svg>',
      right: '<svg viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"></path></svg>',
      target: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"></circle><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M22 12h-2M12 22v-2M2 12h2"></path></svg>',
      settings: '<svg viewBox="0 0 24 24"><path d="M12 15.5A3.5 3.5 0 1 0 12 8.5a3.5 3.5 0 0 0 0 7z"></path><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.08V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-.4-1.08 1.7 1.7 0 0 0-1-.6 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.08-.4H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.08-.4 1.7 1.7 0 0 0 .6-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.08V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 .4 1.08 1.7 1.7 0 0 0 1 .6 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.26.3.46.64.6 1 .1.32.25.63.46.88.3.26.68.4 1.08.4H21a2 2 0 1 1 0 4h-.09c-.4 0-.78.14-1.08.4-.21.25-.36.56-.46.88-.14.36-.34.7-.6 1Z"></path></svg>',
      home: '<svg viewBox="0 0 24 24"><path d="M3 10.5 12 3l9 7.5"></path><path d="M5 9.5V21h14V9.5"></path></svg>',
      x: '<svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"></path></svg>',
      lock: '<svg viewBox="0 0 24 24"><rect x="4" y="11" width="16" height="10" rx="2"></rect><path d="M8 11V8a4 4 0 1 1 8 0v3"></path></svg>',
      bell: '<svg viewBox="0 0 24 24"><path d="M15 17H5l2-2v-4a5 5 0 1 1 10 0v4l2 2h-4"></path><path d="M10 21a2 2 0 0 0 4 0"></path></svg>',
      check: '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"></path></svg>'
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
    function persistJson(primaryKey, backupKeys, value) {
      var raw = JSON.stringify(value);
      try { localStorage.setItem(primaryKey, raw); } catch (err) {}
      if (backupKeys && backupKeys.length) {
        for (var i = 0; i < backupKeys.length; i += 1) {
          try { localStorage.setItem(backupKeys[i], raw); } catch (err) {}
        }
      }
    }
    function saveSafetyBundle() {
      try {
        localStorage.setItem(STORAGE_SAFETY_BUNDLE, JSON.stringify({
          entries: state && state.entries ? state.entries : {},
          settings: state && state.settings ? state.settings : {},
          savedAt: Date.now(),
          version: 1
        }));
      } catch (err) {}
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
    function saveEntries() { persistJson(STORAGE_ENTRIES, ENTRY_BACKUP_KEYS, state.entries); saveSafetyBundle(); }
    function saveSettings() { persistJson(STORAGE_SETTINGS, SETTINGS_BACKUP_KEYS, state.settings); saveSafetyBundle(); }
    function savePayslips() {
      try { localStorage.setItem(STORAGE_PAYSLIPS, JSON.stringify(state.payslips || [])); } catch (err) {}
    }
    function pad(v) { return String(v).padStart(2, '0'); }
    function toISODate(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
    function mondayIndex(jsDay) { return (jsDay + 6) % 7; }
    function normalizeWeekdayList(arr) {
      return Array.isArray(arr) ? arr.map(function (v) { return Number(v); }).filter(function (v) { return Number.isInteger(v) && v >= 0 && v <= 6; }).sort(function (a, b) { return a - b; }) : [];
    }
    function getAutoRestDays(source) {
      var settingsSource = source || (state && state.settings) || defaultSettings;
      return normalizeWeekdayList(settingsSource.autoRestDays || []);
    }
    function getEntryForDate(dateOrKey) {
      var key = typeof dateOrKey === 'string' ? dateOrKey : toISODate(dateOrKey);
      var manual = state.entries[key];
      if (manual) return manual;
      var current = typeof dateOrKey === 'string' ? new Date(key + 'T00:00:00') : new Date(dateOrKey);
      if (getAutoRestDays().indexOf(mondayIndex(current.getDay())) !== -1) {
        return { type: 'riposo', start: '', end: '', breakHours: 0, overtimeHours: 0, leaveHours: 0, quantityHours: 0, notes: '', autoRest: true };
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
      var userName = getDisplayUserName();
      var greeting = 'Bentornato';
      if (hour < 12) greeting = 'Buongiorno';
      else if (hour >= 18) greeting = 'Buonasera';
      return greeting + ' ' + userName;
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
      return { type: 'lavoro', start: '', end: '', breakHours: 0, overtimeHours: 0, leaveHours: 0, quantityHours: 0, notes: '' };
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
      if (s === null || en === null || en <= s) return 0;
      return Math.max(0, en - s - b);
    }
    function isStateOnlyType(type) {
      return type === 'ferie' || type === 'malattia' || type === 'permesso' || type === 'riposo';
    }
    function isMixedType(type) {
      return type === 'lavoro_ferie';
    }
    function getBreakdown(e) {
      if (!e) return { total: 0, normal: 0, overtime: 0, leave: 0, covered: 0 };
      var total = 0;
      var leave = 0;
      if (e.type === 'lavoro' || e.type === 'lavoro_ferie') {
        total = calcWorkedMinutes(e);
        if (e.type === 'lavoro_ferie') leave = hoursToMinutes(e.leaveHours || 0);
      } else if (e.type === 'ferie' || e.type === 'malattia' || e.type === 'permesso') {
        leave = hoursToMinutes(e.quantityHours || 0);
      }
      var over = Math.min(Math.max(0, hoursToMinutes(e.overtimeHours || 0)), total);
      return { total: total, normal: Math.max(0, total - over), overtime: over, leave: leave, covered: total + leave };
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
    function getMonthStats(date) {
      var arr = getMonthEntries(date);
      var totalMinutes = 0, normalMinutes = 0, overtimeMinutes = 0, workedDays = 0, ferie = 0, malattia = 0, permesso = 0, riposo = 0;
      arr.forEach(function (pair) {
        var e = pair[1];
        var b = getBreakdown(e);
        totalMinutes += b.total;
        normalMinutes += b.normal;
        overtimeMinutes += b.overtime;
        if (e.type === 'ferie') ferie += 1;
        else if (e.type === 'malattia') malattia += 1;
        else if (e.type === 'permesso') permesso += 1;
        else if (e.type === 'riposo') riposo += 1;
        else if (b.total > 0 || e.type === 'lavoro_ferie') workedDays += 1;
      });
      return { totalMinutes: totalMinutes, normalMinutes: normalMinutes, overtimeMinutes: overtimeMinutes, workedDays: workedDays, ferie: ferie, malattia: malattia, permesso: permesso, riposo: riposo };
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
    function downloadTextFile(filename, content, mime) {
      var blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
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
    function exportReport() {
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
    async function testNotification() {
      if (!('Notification' in window)) { alert('Notifiche non disponibili in questo browser.'); return; }
      var permission = Notification.permission;
      if (permission !== 'granted') permission = await Notification.requestPermission();
      if (permission !== 'granted') { alert('Permesso notifiche non concesso.'); return; }
      new Notification(state.settings.appName, { body: 'Promemoria alle ' + state.settings.reminderTime });
    }
    function typeIconSvg(type) {
      if (type === 'lavoro') return '<span class="type-emoji">💼</span>';
      if (type === 'lavoro_ferie') return '<span class="type-emoji">🧳</span>';
      if (type === 'ferie') return '<span class="type-emoji">🏖️</span>';
      if (type === 'malattia') return '<span class="type-emoji">🤒</span>';
      if (type === 'permesso') return '<span class="type-emoji">📄</span>';
      return '<span class="type-emoji">😴</span>';
    }
    function typeIconBg(type) {
      if (type === 'lavoro') return '#18c48f';
      if (type === 'lavoro_ferie') return '#4f7cff';
      if (type === 'ferie') return '#43b9f4';
      if (type === 'malattia') return '#ffb000';
      if (type === 'permesso') return '#cf48eb';
      return '#7f90ad';
    }
    function currentHomeStatus(entry, breakdown) {
      if (!entry) return 'Aggiungi giornata';
      if (entry.type === 'riposo') return 'Giornata di riposo';
      if (entry.type === 'ferie') return 'Giornata di ferie';
      if (entry.type === 'malattia') return 'Giornata di malattia';
      if (entry.type === 'permesso') return 'Giornata di permesso';
      var pieces = [];
      if (entry.start && entry.end) pieces.push(entry.start + ' - ' + entry.end);
      if (entry.type === 'lavoro_ferie' && breakdown.leave > 0) pieces.push(formatHourValue(minutesToHours(breakdown.leave)) + ' ferie');
      if (breakdown.overtime > 0) pieces.push(formatHourValue(minutesToHours(breakdown.overtime)) + ' extra');
      return pieces.length ? pieces.join(' • ') : 'Giornata registrata';
    }
    function getHomeStateDayUi(typeKey) {
      if (typeKey === 'ferie') return { emoji: '🏖️', title: 'Giornata di ferie', message: 'Oggi niente lavoro, ti godi un po\' di stacco.' };
      if (typeKey === 'malattia') return { emoji: '🤒', title: 'Giornata di malattia', message: 'Oggi si rallenta e si recuperano le energie.' };
      if (typeKey === 'permesso') return { emoji: '📄', title: 'Giornata di permesso', message: 'Hai segnato un permesso per questa giornata.' };
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
      return 'Ore';
    }
    function getEditorQuantityHint(type) {
      if (type === 'ferie') return 'Segna quante ore di ferie coprono la giornata.';
      if (type === 'malattia') return 'Segna quante ore copre la malattia.';
      if (type === 'permesso') return 'Segna quante ore copre il permesso.';
      return 'Puoi scrivere 0,5 oppure 1,5.';
    }
    function runInlineTests() {
      var tests = [];
      function add(name, passed) { tests.push({ name: name, passed: Boolean(passed) }); }
      add('hoursToMinutes converte 0.5h in 30 minuti', hoursToMinutes(0.5) === 30);
      add('minutesToHours converte 90 minuti in 1.5h', minutesToHours(90) === 1.5);
      add('calcWorkedMinutes calcola 8-18 con 1h pausa = 540 minuti', calcWorkedMinutes({ start:'08:00', end:'18:00', breakHours:1 }) === 540);
      add('buildMonthGrid restituisce 35 celle', buildMonthGrid(new Date()).length === 35);
      add('migrazione dati attiva', typeof loadWithMigration === 'function');
      return tests;
    }
