var STORAGE_SHIFT_TIMER = 'gestore-shift-timer-v1';
var STORAGE_WEEKLY_REVIEW = 'gestore-weekly-review-v1';
var featureRuntimeStarted = false;
var shiftTimerTick = 0;

function emptyShiftTimerState() {
  return {
    active: false,
    status: 'idle',
    workDate: '',
    startedAt: 0,
    pausedAt: 0,
    totalPausedMs: 0
  };
}

function loadShiftTimerState(clearStored) {
  if (clearStored) {
    try { localStorage.removeItem(STORAGE_SHIFT_TIMER); } catch (err) {}
    return emptyShiftTimerState();
  }
  try {
    var raw = localStorage.getItem(STORAGE_SHIFT_TIMER);
    var parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || parsed.active !== true || !Number(parsed.startedAt)) return emptyShiftTimerState();
    return {
      active: true,
      status: parsed.status === 'paused' ? 'paused' : 'running',
      workDate: String(parsed.workDate || toISODate(new Date(Number(parsed.startedAt)))),
      startedAt: Math.max(0, Number(parsed.startedAt) || 0),
      pausedAt: Math.max(0, Number(parsed.pausedAt) || 0),
      totalPausedMs: Math.max(0, Number(parsed.totalPausedMs) || 0)
    };
  } catch (err) {
    return emptyShiftTimerState();
  }
}

function persistShiftTimerState() {
  if (!state || !state.shiftTimer) return;
  try { localStorage.setItem(STORAGE_SHIFT_TIMER, JSON.stringify(state.shiftTimer)); } catch (err) {}
  if (typeof scheduleCurrentAccountDeviceCache === 'function') scheduleCurrentAccountDeviceCache();
}

function getShiftTimerElapsedMs(atTime) {
  var timer = state && state.shiftTimer ? state.shiftTimer : emptyShiftTimerState();
  if (!timer.active || !timer.startedAt) return 0;
  var endAt = timer.status === 'paused' && timer.pausedAt ? timer.pausedAt : (Number(atTime) || Date.now());
  return Math.max(0, endAt - timer.startedAt - Math.max(0, Number(timer.totalPausedMs) || 0));
}

function getShiftTimerPauseMs(atTime) {
  var timer = state && state.shiftTimer ? state.shiftTimer : emptyShiftTimerState();
  var currentPause = timer.active && timer.status === 'paused' && timer.pausedAt
    ? Math.max(0, (Number(atTime) || Date.now()) - timer.pausedAt)
    : 0;
  return Math.max(0, Number(timer.totalPausedMs) || 0) + currentPause;
}

function formatLiveTimer(ms) {
  var totalSeconds = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  var hours = Math.floor(totalSeconds / 3600);
  var minutes = Math.floor((totalSeconds % 3600) / 60);
  var seconds = totalSeconds % 60;
  return pad(hours) + ':' + pad(minutes) + ':' + pad(seconds);
}

function formatClockTime(date) {
  var value = date instanceof Date ? date : new Date(date);
  return pad(value.getHours()) + ':' + pad(value.getMinutes());
}

function startShiftTimer() {
  if (!state.settings.timerEnabled || (state.shiftTimer && state.shiftTimer.active)) return;
  var now = new Date();
  var key = toISODate(now);
  if (Object.prototype.hasOwnProperty.call(state.entries || {}, key)) {
    state.timerNotice = 'La giornata di oggi e gia registrata. Aprila per modificarla.';
    render();
    return;
  }
  state.shiftTimer = {
    active: true,
    status: 'running',
    workDate: key,
    startedAt: now.getTime(),
    pausedAt: 0,
    totalPausedMs: 0
  };
  state.timerNotice = '';
  persistShiftTimerState();
  render();
}

function pauseShiftTimer() {
  var timer = state.shiftTimer;
  if (!timer || !timer.active || timer.status === 'paused') return;
  timer.status = 'paused';
  timer.pausedAt = Date.now();
  persistShiftTimerState();
  render();
}

function resumeShiftTimer() {
  var timer = state.shiftTimer;
  if (!timer || !timer.active || timer.status !== 'paused') return;
  timer.totalPausedMs += Math.max(0, Date.now() - timer.pausedAt);
  timer.pausedAt = 0;
  timer.status = 'running';
  persistShiftTimerState();
  render();
}

function finishShiftTimer() {
  var timer = state.shiftTimer;
  if (!timer || !timer.active || !timer.startedAt) return;
  var finishedAt = Date.now();
  var elapsedMinutes = Math.max(0, Math.round(getShiftTimerElapsedMs(finishedAt) / 60000));
  var pauseMinutes = Math.max(0, Math.round(getShiftTimerPauseMs(finishedAt) / 60000));
  var key = String(timer.workDate || toISODate(new Date(timer.startedAt)));
  var previous = state.entries[key] && typeof state.entries[key] === 'object' ? state.entries[key] : {};
  var entry = Object.assign({}, previous, {
    type: 'lavoro',
    start: formatClockTime(timer.startedAt),
    end: formatClockTime(finishedAt),
    breakHours: minutesToHours(pauseMinutes),
    overtimeHours: 0,
    overtimeManual: false,
    leaveHours: 0,
    quantityHours: 0
  });
  entry.overtimeHours = minutesToHours(getAutoOvertimeMinutes(entry));
  if (elapsedMinutes === 0 && entry.start === entry.end) entry.end = formatClockTime(finishedAt + 60000);
  state.entries[key] = entry;
  state.shiftTimer = emptyShiftTimerState();
  state.timerNotice = 'Turno salvato nella giornata.';
  persistShiftTimerState();
  saveEntries();
  render();
}

function discardShiftTimer() {
  state.shiftTimer = emptyShiftTimerState();
  state.timerDiscardConfirm = false;
  state.timerNotice = '';
  persistShiftTimerState();
  render();
}

function updateShiftTimerDom() {
  if (!state || !state.shiftTimer || !state.shiftTimer.active) return;
  var now = Date.now();
  var elapsedMs = getShiftTimerElapsedMs(now);
  var pauseMs = getShiftTimerPauseMs(now);
  var elapsedMinutes = Math.floor(elapsedMs / 60000);
  var targetMinutes = Math.max(1, Number(state.settings.dailyTarget || 0) * 60);
  var percent = Math.max(0, Math.min(100, elapsedMinutes / targetMinutes * 100));
  document.querySelectorAll('[data-shift-timer-elapsed]').forEach(function (node) {
    node.textContent = formatLiveTimer(elapsedMs);
  });
  document.querySelectorAll('[data-shift-timer-pause]').forEach(function (node) {
    node.textContent = formatDuration(Math.round(pauseMs / 60000));
  });
  document.querySelectorAll('[data-shift-timer-progress]').forEach(function (node) {
    node.style.setProperty('--timer-progress', percent.toFixed(2) + '%');
  });
}

function initializeFeatureServices() {
  if (featureRuntimeStarted) return;
  featureRuntimeStarted = true;
  shiftTimerTick = window.setInterval(updateShiftTimerDom, 1000);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) {
      updateShiftTimerDom();
      maybeOpenWeeklyReview();
    }
    else persistShiftTimerState();
  });
  window.addEventListener('gestore:account-ready', function () {
    window.setTimeout(maybeOpenWeeklyReview, 80);
  });
  window.addEventListener('pagehide', persistShiftTimerState);
  window.setTimeout(maybeOpenWeeklyReview, 120);
}

function renderOptionalTimerHomeCard(now) {
  var date = now instanceof Date ? now : new Date();
  var key = toISODate(date);
  var timer = state.shiftTimer || emptyShiftTimerState();
  var storedEntry = state.entries && state.entries[key] ? state.entries[key] : null;
  var dayName = new Intl.DateTimeFormat('it-IT', { weekday: 'long' }).format(date);
  dayName = dayName.charAt(0).toUpperCase() + dayName.slice(1);
  var dateLabel = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
  var notice = state.timerNotice ? '<div class="shift-timer-notice">' + escapeHtml(state.timerNotice) + '</div>' : '';

  if (!timer.active && storedEntry) {
    var existingBreakdown = getBreakdown(storedEntry);
    return '<section class="shift-timer-home is-recorded">' +
      '<div class="shift-timer-head"><div><span>TIMER TURNO</span><h2>' + escapeHtml(dayName) + '</h2><p>' + escapeHtml(dateLabel) + '</p></div><span class="shift-timer-state is-saved">' + icons.check + ' Salvata</span></div>' +
      '<div class="shift-timer-recorded-main"><span>GIORNATA REGISTRATA</span><strong>' + formatDuration(existingBreakdown.total) + '</strong><small>' + escapeHtml(dayTypes[storedEntry.type] ? dayTypes[storedEntry.type].label : 'Giornata') + '</small></div>' +
      '<button class="shift-timer-primary" data-open-date="' + key + '">' + icons.calendar + '<span>Apri e modifica la giornata</span></button>' +
      notice +
    '</section>';
  }

  if (!timer.active) {
    return '<section class="shift-timer-home is-ready">' +
      '<div class="shift-timer-head"><div><span>TIMER TURNO</span><h2>' + escapeHtml(dayName) + '</h2><p>' + escapeHtml(dateLabel) + '</p></div><span class="shift-timer-state"><i></i> Pronto</span></div>' +
      '<div class="shift-timer-dial" style="--timer-progress:0%"><div><small>ORE LAVORATE</small><strong>00:00:00</strong><span>Avvialo quando inizi il turno</span></div></div>' +
      '<button class="shift-timer-primary" data-timer-start="1">' + icons.play + '<span>Inizia turno</span></button>' +
      '<button class="shift-timer-manual" data-open-date="' + key + '">Inserisci manualmente</button>' +
      notice +
    '</section>';
  }

  var paused = timer.status === 'paused';
  var startedLabel = formatClockTime(timer.startedAt);
  return '<section class="shift-timer-home is-active ' + (paused ? 'is-paused' : 'is-running') + '">' +
    '<div class="shift-timer-head"><div><span>TIMER TURNO</span><h2>' + escapeHtml(dayName) + '</h2><p>Iniziato alle ' + startedLabel + '</p></div><span class="shift-timer-state"><i></i>' + (paused ? ' In pausa' : ' In corso') + '</span></div>' +
    '<div class="shift-timer-dial" data-shift-timer-progress="1" style="--timer-progress:0%"><div><small>TEMPO EFFETTIVO</small><strong data-shift-timer-elapsed="1">' + formatLiveTimer(getShiftTimerElapsedMs(Date.now())) + '</strong><span>Pausa <b data-shift-timer-pause="1">' + formatDuration(Math.round(getShiftTimerPauseMs(Date.now()) / 60000)) + '</b></span></div></div>' +
    '<div class="shift-timer-controls">' +
      '<button class="shift-timer-control is-secondary" data-timer-toggle-pause="1">' + (paused ? icons.play : icons.pause) + '<span>' + (paused ? 'Riprendi' : 'Pausa') + '</span></button>' +
      '<button class="shift-timer-control is-finish" data-timer-finish="1">' + icons.stop + '<span>Termina e salva</span></button>' +
    '</div>' +
    '<button class="shift-timer-discard" data-timer-discard-request="1">Annulla timer</button>' +
  '</section>';
}

function normalizeFeatureSearch(value) {
  return String(value || '').toLocaleLowerCase('it-IT').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function formatFeatureCurrency(value) {
  var amount = Number(value) || 0;
  return amount.toLocaleString('it-IT', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function getGlobalSearchResults(query) {
  var normalizedQuery = normalizeFeatureSearch(query);
  var results = [];
  Object.keys(state.entries || {}).sort().reverse().forEach(function (key) {
    var entry = state.entries[key];
    if (!entry || typeof entry !== 'object') return;
    var type = dayTypes[entry.type] || { label: entry.type || 'Giornata' };
    var breakdown = getBreakdown(entry);
    var date = new Date(key + 'T12:00:00');
    var title = new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(date);
    var searchable = normalizeFeatureSearch([key, title, type.label, entry.notes, entry.holidayName, entry.start, entry.end].join(' '));
    if (normalizedQuery && searchable.indexOf(normalizedQuery) === -1) return;
    results.push({
      kind: 'day',
      key: key,
      title: title,
      meta: type.label + (breakdown.total ? ' - ' + formatDuration(breakdown.total) : ''),
      icon: typeIconSvg(entry.type),
      tone: entry.type || 'lavoro'
    });
  });
  (state.payslips || []).forEach(function (item) {
    var month = Math.max(1, Math.min(12, Number(item.month) || 1));
    var year = Number(item.year) || new Date().getFullYear();
    var title = monthNames[month - 1] + ' ' + year;
    var searchable = normalizeFeatureSearch([title, item.company, item.notes, item.netto, 'busta paga'].join(' '));
    if (normalizedQuery && searchable.indexOf(normalizedQuery) === -1) return;
    results.push({
      kind: 'payslip',
      key: String(item.id || ''),
      title: title,
      meta: 'Busta paga' + (Number(item.netto) ? ' - ' + formatFeatureCurrency(item.netto) : ''),
      icon: icons.receipt,
      tone: 'payslip'
    });
  });
  return results.slice(0, normalizedQuery ? 40 : 12);
}

function renderGlobalSearchResultsMarkup(query) {
  var results = getGlobalSearchResults(query);
  if (!results.length) {
    return '<div class="global-search-empty">' + icons.search + '<strong>Nessun risultato</strong><span>Prova con una data, una nota, ferie o un mese.</span></div>';
  }
  return results.map(function (item) {
    var action = item.kind === 'payslip'
      ? ' data-search-open-payslip="' + escapeHtml(item.key) + '"'
      : ' data-search-open-date="' + escapeHtml(item.key) + '"';
    return '<button class="global-search-result is-' + escapeHtml(item.tone) + '"' + action + '>' +
      '<span class="global-search-result-icon">' + item.icon + '</span>' +
      '<span><strong>' + escapeHtml(item.title) + '</strong><small>' + escapeHtml(item.meta) + '</small></span>' +
      icons.right +
    '</button>';
  }).join('');
}

function renderGlobalSearchOverlay() {
  if (!state.globalSearchOpen) return '';
  var query = String(state.globalSearchQuery || '');
  return '<div class="global-search-overlay" role="dialog" aria-modal="true" aria-labelledby="globalSearchTitle">' +
    '<section class="global-search-panel">' +
      '<div class="global-search-top"><button data-close-global-search="1" aria-label="Chiudi ricerca">' + icons.left + '</button><div><span>ARCHIVIO GESTORE</span><h2 id="globalSearchTitle">Cerca</h2></div><i></i></div>' +
      '<label class="global-search-field">' + icons.search + '<input id="globalSearchInput" type="search" inputmode="search" autocomplete="off" placeholder="Data, nota, ferie, busta paga..." value="' + escapeHtml(query) + '"><button type="button" data-clear-global-search="1" aria-label="Cancella ricerca">' + icons.x + '</button></label>' +
      '<div class="global-search-caption" id="globalSearchCaption">' + (query ? 'RISULTATI' : 'ELEMENTI RECENTI') + '</div>' +
      '<div class="global-search-results" id="globalSearchResults">' + renderGlobalSearchResultsMarkup(query) + '</div>' +
    '</section>' +
  '</div>';
}

function getSmartAlerts(referenceDate) {
  var now = referenceDate instanceof Date ? new Date(referenceDate.getTime()) : new Date();
  var alerts = [];
  var missing = [];
  var workdays = normalizeWeekdayList(state.settings.workdays || []);
  for (var offset = 1; offset <= 14; offset += 1) {
    var day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset, 12);
    if (workdays.indexOf(mondayIndex(day.getDay())) === -1) continue;
    if (!getEntryForDate(day)) missing.push(toISODate(day));
  }
  if (missing.length) {
    alerts.push({
      tone: 'amber',
      icon: icons.calendar,
      title: missing.length + (missing.length === 1 ? ' giornata da controllare' : ' giornate da controllare'),
      copy: 'Negli ultimi 14 giorni lavorativi mancano alcune registrazioni.',
      action: 'date',
      value: missing[missing.length - 1]
    });
  }

  var currentStats = getMonthStats(new Date(now.getFullYear(), now.getMonth(), 1));
  var previousStats = getMonthStats(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  var overtimeDelta = currentStats.overtimeMinutes - previousStats.overtimeMinutes;
  if (currentStats.overtimeMinutes > 0) {
    alerts.push({
      tone: overtimeDelta > 0 ? 'violet' : 'blue',
      icon: icons.activity,
      title: formatDuration(currentStats.overtimeMinutes) + ' di straordinari',
      copy: overtimeDelta === 0 ? 'Stesso livello del mese precedente.' : (formatDuration(Math.abs(overtimeDelta)) + (overtimeDelta > 0 ? ' in piu' : ' in meno') + ' rispetto al mese scorso.'),
      action: 'tab',
      value: 'stats'
    });
  }

  var balance = getVacationBalanceForYear(now.getFullYear());
  if (balance.allowanceDays > 0 && balance.remainingDays <= Math.max(2, balance.allowanceDays * 0.2)) {
    alerts.push({
      tone: balance.remainingDays > 0 ? 'amber' : 'red',
      icon: icons.umbrella,
      title: formatVacationDayValue(balance.remainingDays) + ' gg di ferie rimasti',
      copy: 'Il saldo annuale sta terminando.',
      action: 'tab',
      value: 'vacations'
    });
  }

  var previousMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  var previousPayslipFound = (state.payslips || []).some(function (item) {
    return Number(item.year) === previousMonthDate.getFullYear() && Number(item.month) === previousMonthDate.getMonth() + 1;
  });
  if (now.getDate() >= 10 && !previousPayslipFound) {
    alerts.push({
      tone: 'blue',
      icon: icons.receipt,
      title: 'Busta di ' + monthNames[previousMonthDate.getMonth()] + ' non presente',
      copy: 'Puoi aggiungerla al tuo archivio quando la ricevi.',
      action: 'payslips',
      value: ''
    });
  }
  return alerts.slice(0, 4);
}

function getWeeklyReviewDescriptor(referenceDate) {
  var now = referenceDate instanceof Date ? new Date(referenceDate.getTime()) : new Date();
  now.setHours(12, 0, 0, 0);
  var day = now.getDay();
  if (day !== 6 && day !== 1) return null;

  var weekStart = new Date(now);
  weekStart.setDate(now.getDate() - mondayIndex(now.getDay()));
  if (day === 1) weekStart.setDate(weekStart.getDate() - 7);
  var weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  var sameMonth = weekStart.getMonth() === weekEnd.getMonth();
  var rangeLabel = sameMonth
    ? weekStart.getDate() + ' - ' + weekEnd.getDate() + ' ' + monthNames[weekEnd.getMonth()].toLowerCase()
    : weekStart.getDate() + ' ' + monthNames[weekStart.getMonth()].slice(0, 3).toLowerCase() + ' - ' + weekEnd.getDate() + ' ' + monthNames[weekEnd.getMonth()].slice(0, 3).toLowerCase();

  return {
    key: toISODate(weekStart),
    rangeLabel: rangeLabel,
    fallback: day === 1
  };
}

function getWeeklyReviewStorageKey(descriptor) {
  var accountId = state && state.account && state.account.user
    ? String(state.account.user.id || '')
    : (typeof getStoredActiveAccountId === 'function' ? getStoredActiveAccountId() : '');
  return STORAGE_WEEKLY_REVIEW + ':' + encodeURIComponent(accountId || 'locale') + ':' + descriptor.key;
}

function maybeOpenWeeklyReview(referenceDate, forceOpen) {
  if (!state || !state.account || state.account.authenticated !== true || state.account.dataReady !== true) return false;
  if (state.weeklyReviewOpen || state.globalSearchOpen || state.editingDate || state.vacationManagerOpen || state.payslipEditorOpen || state.privacyLocked) return false;
  var descriptor = getWeeklyReviewDescriptor(referenceDate);
  if (!descriptor) return false;
  var storageKey = getWeeklyReviewStorageKey(descriptor);
  if (!forceOpen) {
    try {
      if (localStorage.getItem(storageKey) === 'seen') return false;
    } catch (err) {}
  }
  state.weeklyReviewOpen = true;
  state.weeklyReviewDescriptor = descriptor;
  if (typeof render === 'function') render();
  return true;
}

function acknowledgeWeeklyReview(shouldRender) {
  var descriptor = state.weeklyReviewDescriptor || getWeeklyReviewDescriptor(new Date());
  if (descriptor) {
    try { localStorage.setItem(getWeeklyReviewStorageKey(descriptor), 'seen'); } catch (err) {}
  }
  state.weeklyReviewOpen = false;
  state.weeklyReviewDescriptor = null;
  if (shouldRender !== false && typeof render === 'function') render();
}

function renderSmartAlerts() {
  var alerts = getSmartAlerts();
  if (!alerts.length) {
    return '<section class="profile-smart-card is-clear"><span>' + icons.check + '</span><div><small>CONTROLLO RAPIDO</small><strong>Tutto in ordine</strong><p>Non ci sono giornate o documenti da controllare.</p></div></section>';
  }
  return '<section class="profile-smart-section"><div class="profile-smart-head"><div><span>CONTROLLO RAPIDO</span><h2>Da tenere d&apos;occhio</h2></div><b>' + alerts.length + '</b></div><div class="profile-smart-list">' +
    alerts.map(function (alert) {
      var action = alert.action === 'date'
        ? ' data-insight-date="' + escapeHtml(alert.value) + '"'
        : (alert.action === 'payslips' ? ' data-insight-payslips="1"' : ' data-insight-tab="' + escapeHtml(alert.value) + '"');
      return '<button class="profile-smart-row is-' + alert.tone + '"' + action + '><span>' + alert.icon + '</span><div><strong>' + escapeHtml(alert.title) + '</strong><small>' + escapeHtml(alert.copy) + '</small></div>' + icons.right + '</button>';
    }).join('') +
  '</div></section>';
}

function renderWeeklyReviewDialog() {
  if (!state.weeklyReviewOpen) return '';
  var descriptor = state.weeklyReviewDescriptor || getWeeklyReviewDescriptor(new Date());
  if (!descriptor) return '';
  var alerts = getSmartAlerts();
  var rows = alerts.length
    ? alerts.map(function (alert) {
      var action = alert.action === 'date'
        ? ' data-weekly-review-date="' + escapeHtml(alert.value) + '"'
        : (alert.action === 'payslips' ? ' data-weekly-review-payslips="1"' : ' data-weekly-review-tab="' + escapeHtml(alert.value) + '"');
      return '<button class="weekly-review-row is-' + alert.tone + '"' + action + '><span>' + alert.icon + '</span><div><strong>' + escapeHtml(alert.title) + '</strong><small>' + escapeHtml(alert.copy) + '</small></div>' + icons.right + '</button>';
    }).join('')
    : '<div class="weekly-review-clear"><span>' + icons.check + '</span><div><strong>Tutto in ordine</strong><small>Le giornate e i documenti risultano aggiornati.</small></div></div>';

  return '<div class="weekly-review-overlay" role="dialog" aria-modal="true" aria-labelledby="weeklyReviewTitle">' +
    '<section class="weekly-review-dialog">' +
      '<div class="weekly-review-head"><span class="weekly-review-icon">' + icons.bell + '</span><div><small>' + (descriptor.fallback ? 'CONTROLLO DEL LUNEDI' : 'FINE SETTIMANA') + '</small><h2 id="weeklyReviewTitle">Riepilogo settimanale</h2></div><button data-dismiss-weekly-review="1" aria-label="Chiudi">' + icons.x + '</button></div>' +
      '<div class="weekly-review-period"><span>SETTIMANA</span><strong>' + escapeHtml(descriptor.rangeLabel) + '</strong></div>' +
      '<p class="weekly-review-copy">' + (alerts.length ? 'Ci sono ' + alerts.length + (alerts.length === 1 ? ' elemento da controllare.' : ' elementi da controllare.') : 'Hai completato tutti i controlli importanti della settimana.') + '</p>' +
      '<div class="weekly-review-list">' + rows + '</div>' +
      '<button class="weekly-review-done" data-dismiss-weekly-review="1">Ho controllato</button>' +
    '</section>' +
  '</div>';
}

function renderTimerDiscardDialog() {
  if (!state.timerDiscardConfirm) return '';
  return '<div class="feature-dialog-overlay" role="dialog" aria-modal="true" aria-labelledby="timerDiscardTitle"><section class="feature-dialog">' +
    '<span class="feature-dialog-icon is-danger">' + icons.stop + '</span><small>TIMER ATTIVO</small><h2 id="timerDiscardTitle">Annullare il turno?</h2><p>Il tempo misurato non verra inserito nella giornata.</p>' +
    '<div><button data-timer-discard-cancel="1">Continua timer</button><button class="is-danger" data-timer-discard-confirm="1">Annulla</button></div>' +
  '</section></div>';
}

function renderFeatureOverlays() {
  return renderGlobalSearchOverlay() + renderTimerDiscardDialog() + renderWeeklyReviewDialog();
}

state.shiftTimer = loadShiftTimerState();
state.timerNotice = '';
state.timerDiscardConfirm = false;
state.globalSearchOpen = false;
state.globalSearchQuery = '';
state.weeklyReviewOpen = false;
state.weeklyReviewDescriptor = null;
