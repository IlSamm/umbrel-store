function getPlanningMonth(value) {
  var source = value instanceof Date ? value : new Date();
  return new Date(source.getFullYear(), source.getMonth(), 1);
}

function makePlannedWorkEntry(preset) {
  if (!preset) return null;
  return {
    type: 'lavoro',
    start: preset.start,
    end: preset.end,
    breakHours: preset.breakHours,
    overtimeHours: 0,
    overtimeManual: false,
    leaveHours: 0,
    quantityHours: 0,
    notes: ''
  };
}

function makePlannedStateEntry(type) {
  if (type === 'riposo') {
    return {
      type: 'riposo',
      start: '',
      end: '',
      breakHours: 0,
      overtimeHours: 0,
      overtimeManual: false,
      leaveHours: 0,
      quantityHours: 0,
      notes: ''
    };
  }
  if (['ferie', 'malattia', 'permesso'].indexOf(type) !== -1) {
    return {
      type: type,
      start: '',
      end: '',
      breakHours: 0,
      overtimeHours: 0,
      overtimeManual: false,
      leaveHours: 0,
      quantityHours: getDefaultPaidDayHours(),
      notes: ''
    };
  }
  return null;
}

function hasCalendarEntryForPlanning(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return true;
  return Boolean(getEntryForDate(date));
}

function getMonthlyTemplatePreview(month) {
  var targetMonth = getPlanningMonth(month);
  var template = getWeeklyTemplate();
  var presets = getShiftPresets();
  var daysInMonth = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0).getDate();
  var candidates = [];
  var skipped = [];
  var unplanned = 0;

  for (var day = 1; day <= daysInMonth; day += 1) {
    var date = new Date(targetMonth.getFullYear(), targetMonth.getMonth(), day);
    var choice = template[mondayIndex(date.getDay())];
    if (choice === null || choice === undefined || choice === '') {
      unplanned += 1;
      continue;
    }
    if (hasCalendarEntryForPlanning(date)) {
      skipped.push(toISODate(date));
      continue;
    }
    var entry = choice === 'rest'
      ? makePlannedStateEntry('riposo')
      : makePlannedWorkEntry(presets[Number(choice)]);
    if (!entry) {
      unplanned += 1;
      continue;
    }
    candidates.push({ key: toISODate(date), date: date, entry: entry, choice: choice });
  }

  return {
    month: targetMonth,
    candidates: candidates,
    skipped: skipped,
    unplanned: unplanned
  };
}

function openMonthPlanPreview(month) {
  state.calendarActionsOpen = false;
  state.monthPlanMonth = getPlanningMonth(month || state.currentMonth);
  state.monthPlanPreviewOpen = true;
  state.monthPlanNotice = '';
  render();
}

function closeMonthPlanPreview() {
  state.monthPlanPreviewOpen = false;
  render();
}

function applyMonthlyTemplate() {
  var preview = getMonthlyTemplatePreview(state.monthPlanMonth || state.currentMonth);
  preview.candidates.forEach(function (item) {
    state.entries[item.key] = item.entry;
  });
  if (preview.candidates.length) saveEntries();
  state.currentMonth = getPlanningMonth(preview.month);
  state.activeTab = 'calendar';
  state.monthPlanPreviewOpen = false;
  state.monthPlanNotice = preview.candidates.length
    ? (preview.candidates.length + (preview.candidates.length === 1 ? ' giornata preparata.' : ' giornate preparate.') + (preview.skipped.length ? (' ' + preview.skipped.length + ' gia presenti non modificate.') : ''))
    : 'Nessuna giornata da aggiungere: il mese e gia organizzato.';
  render();
}

function getTemplateChoiceLabel(choice) {
  if (choice === 'rest') return 'Riposo';
  if (choice === null || choice === undefined || choice === '') return 'Non pianificato';
  var preset = getShiftPresets()[Number(choice)];
  return preset ? preset.label : 'Non pianificato';
}

function renderCalendarPlanningSuggestion() {
  if (state.calendarSelectionMode) return '';
  var preview = getMonthlyTemplatePreview(state.currentMonth);
  var notice = state.monthPlanNotice
    ? '<div class="calendar-plan-notice" role="status">' + escapeHtml(state.monthPlanNotice) + '</div>'
    : '';
  if (!preview.candidates.length) return notice;
  return notice + '<section class="calendar-plan-suggestion">' +
    '<span>' + icons.calendar + '</span><div><small>SETTIMANA TIPO</small><strong>' + preview.candidates.length + ' giornate pronte</strong><p>Controlla l&apos;anteprima prima di aggiungerle a ' + escapeHtml(formatMonthYear(preview.month)) + '.</p></div>' +
    '<button data-open-month-plan="1">Anteprima</button>' +
  '</section>';
}

function renderMonthPlanDialog() {
  if (!state.monthPlanPreviewOpen) return '';
  var preview = getMonthlyTemplatePreview(state.monthPlanMonth || state.currentMonth);
  var workCount = preview.candidates.filter(function (item) { return item.entry.type === 'lavoro'; }).length;
  var restCount = preview.candidates.filter(function (item) { return item.entry.type === 'riposo'; }).length;
  var template = getWeeklyTemplate();
  var dayRows = weekNamesFull.map(function (label, index) {
    return '<div><span>' + escapeHtml(label) + '</span><strong>' + escapeHtml(getTemplateChoiceLabel(template[index])) + '</strong></div>';
  }).join('');
  return '<div class="planning-dialog-overlay" role="dialog" aria-modal="true" aria-labelledby="monthPlanTitle">' +
    '<section class="planning-dialog month-plan-dialog">' +
      '<button class="planning-dialog-close" data-close-month-plan="1" aria-label="Chiudi">' + icons.x + '</button>' +
      '<span class="planning-dialog-icon is-blue">' + icons.calendar + '</span><small>ANTEPRIMA SICURA</small><h2 id="monthPlanTitle">Prepara ' + escapeHtml(formatMonthYear(preview.month)) + '</h2>' +
      '<p>Nessun dato viene scritto finche non confermi. Le giornate gia compilate o automatiche vengono sempre saltate.</p>' +
      '<div class="month-plan-metrics"><div><span>Da aggiungere</span><strong>' + preview.candidates.length + '</strong></div><div><span>Lavoro</span><strong>' + workCount + '</strong></div><div><span>Riposi</span><strong>' + restCount + '</strong></div><div><span>Protette</span><strong>' + preview.skipped.length + '</strong></div></div>' +
      '<div class="month-plan-week">' + dayRows + '</div>' +
      '<div class="planning-dialog-actions"><button data-close-month-plan="1">Annulla</button><button class="is-primary" data-apply-month-plan="1" ' + (!preview.candidates.length ? 'disabled' : '') + '>Conferma ' + preview.candidates.length + '</button></div>' +
    '</section>' +
  '</div>';
}

function startCalendarSelection() {
  state.calendarActionsOpen = false;
  state.calendarSelectionMode = true;
  state.calendarSelectedDates = [];
  state.calendarBulkDialogOpen = false;
  render();
}

function stopCalendarSelection() {
  state.calendarSelectionMode = false;
  state.calendarSelectedDates = [];
  state.calendarBulkDialogOpen = false;
  render();
}

function toggleCalendarSelectedDate(key) {
  var cleanKey = String(key || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanKey)) return;
  var selected = Array.isArray(state.calendarSelectedDates) ? state.calendarSelectedDates.slice() : [];
  var index = selected.indexOf(cleanKey);
  if (index === -1) selected.push(cleanKey);
  else selected.splice(index, 1);
  selected.sort();
  state.calendarSelectedDates = selected;
  render();
}

function openCalendarBulkDialog() {
  if (!state.calendarSelectedDates || !state.calendarSelectedDates.length) return;
  state.calendarBulkChoice = state.calendarBulkChoice || 'preset:0';
  state.calendarBulkDialogOpen = true;
  render();
}

function getCalendarBulkPreview(choice) {
  var selected = Array.isArray(state.calendarSelectedDates) ? state.calendarSelectedDates : [];
  var writable = [];
  var skipped = [];
  selected.forEach(function (key) {
    var date = parseLocalDateKey(key);
    if (!date || hasCalendarEntryForPlanning(date)) {
      skipped.push(key);
      return;
    }
    var entry = null;
    if (String(choice || '').indexOf('preset:') === 0) {
      var presetIndex = Number(String(choice).split(':')[1]);
      entry = makePlannedWorkEntry(getShiftPresets()[presetIndex]);
    } else {
      entry = makePlannedStateEntry(String(choice || ''));
    }
    if (entry) writable.push({ key: key, entry: entry });
    else skipped.push(key);
  });
  return { writable: writable, skipped: skipped };
}

function applyCalendarBulkChoice() {
  var preview = getCalendarBulkPreview(state.calendarBulkChoice);
  preview.writable.forEach(function (item) {
    state.entries[item.key] = item.entry;
  });
  if (preview.writable.length) saveEntries();
  state.calendarSelectionMode = false;
  state.calendarSelectedDates = [];
  state.calendarBulkDialogOpen = false;
  state.monthPlanNotice = preview.writable.length
    ? (preview.writable.length + (preview.writable.length === 1 ? ' giornata aggiornata.' : ' giornate aggiornate.') + (preview.skipped.length ? (' ' + preview.skipped.length + ' protette e non modificate.') : ''))
    : 'Nessuna giornata modificata: quelle selezionate contengono gia dati.';
  render();
}

function renderCalendarSelectionToolbar() {
  if (!state.calendarSelectionMode) return '';
  var count = Array.isArray(state.calendarSelectedDates) ? state.calendarSelectedDates.length : 0;
  return '<section class="calendar-selection-toolbar" role="region" aria-label="Azioni sui giorni selezionati">' +
    '<button data-cancel-calendar-selection="1" aria-label="Annulla selezione">' + icons.x + '</button>' +
    '<div><small>SELEZIONE MULTIPLA</small><strong>' + count + (count === 1 ? ' giorno' : ' giorni') + '</strong></div>' +
    '<button class="is-primary" data-open-calendar-bulk="1" ' + (!count ? 'disabled' : '') + '>Applica</button>' +
  '</section>';
}

function renderCalendarBulkDialog() {
  if (!state.calendarBulkDialogOpen) return '';
  var choice = state.calendarBulkChoice || 'preset:0';
  var presets = getShiftPresets();
  var preview = getCalendarBulkPreview(choice);
  var choices = presets.map(function (preset, index) {
    return '<button data-calendar-bulk-choice="preset:' + index + '" class="' + (choice === 'preset:' + index ? 'is-active' : '') + '"><span class="is-green">' + icons.clock + '</span><strong>' + escapeHtml(preset.label) + '</strong><small>' + escapeHtml(preset.start + ' - ' + preset.end) + '</small></button>';
  }).join('') + [
    { key: 'ferie', label: 'Ferie', icon: icons.umbrella, tone: 'is-blue' },
    { key: 'malattia', label: 'Malattia', icon: icons.activity, tone: 'is-amber' },
    { key: 'permesso', label: 'Permesso', icon: icons.note, tone: 'is-violet' },
    { key: 'riposo', label: 'Riposo', icon: icons.coffee, tone: 'is-slate' }
  ].map(function (item) {
    return '<button data-calendar-bulk-choice="' + item.key + '" class="' + (choice === item.key ? 'is-active' : '') + '"><span class="' + item.tone + '">' + item.icon + '</span><strong>' + item.label + '</strong><small>Giornata intera</small></button>';
  }).join('');
  return '<div class="planning-dialog-overlay" role="dialog" aria-modal="true" aria-labelledby="bulkCalendarTitle">' +
    '<section class="planning-dialog calendar-bulk-dialog">' +
      '<button class="planning-dialog-close" data-close-calendar-bulk="1" aria-label="Chiudi">' + icons.x + '</button>' +
      '<span class="planning-dialog-icon is-violet">' + icons.calendar + '</span><small>AZIONE DI GRUPPO</small><h2 id="bulkCalendarTitle">Cosa vuoi applicare?</h2>' +
      '<p>I giorni che contengono gia ore, ferie, festivita o riposo restano invariati.</p>' +
      '<div class="calendar-bulk-options">' + choices + '</div>' +
      '<div class="calendar-bulk-result"><span>Verranno aggiornati</span><strong>' + preview.writable.length + '</strong><small>' + preview.skipped.length + ' protetti</small></div>' +
      '<div class="planning-dialog-actions"><button data-close-calendar-bulk="1">Indietro</button><button class="is-primary" data-apply-calendar-bulk="1" ' + (!preview.writable.length ? 'disabled' : '') + '>Conferma</button></div>' +
    '</section>' +
  '</div>';
}

function getPlanningWeekMonday(value) {
  var date = value instanceof Date ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - mondayIndex(date.getDay()));
  return date;
}

function getDefaultCalendarCopyMonday(month) {
  var targetMonth = getPlanningMonth(month || state.currentMonth);
  var now = new Date();
  if (targetMonth.getFullYear() === now.getFullYear() && targetMonth.getMonth() === now.getMonth()) {
    return getPlanningWeekMonday(now);
  }
  return getPlanningWeekMonday(new Date(targetMonth.getFullYear(), targetMonth.getMonth(), 1));
}

function getCalendarCopySourceEntry(key) {
  var entries = state && state.entries && typeof state.entries === 'object' ? state.entries : {};
  if (!Object.prototype.hasOwnProperty.call(entries, key)) return null;
  var source = entries[key];
  if (!source || typeof source !== 'object') return null;
  if (source.type === 'riposo') return makePlannedStateEntry('riposo');
  if (source.type !== 'lavoro' && source.type !== 'lavoro_ferie') return null;
  var start = normalizeTimeInputValue(source.start || '');
  var end = normalizeTimeInputValue(source.end || '');
  if (!start || !end) return null;
  return makePlannedWorkEntry({
    start: start,
    end: end,
    breakHours: Math.max(0, parseDecimalInput(source.breakHours, 0))
  });
}

function getCalendarWeekCopyPreview(targetMonday) {
  var targetStart = getPlanningWeekMonday(targetMonday || state.calendarCopyTargetMonday || getDefaultCalendarCopyMonday(state.currentMonth));
  var sourceStart = new Date(targetStart);
  sourceStart.setDate(sourceStart.getDate() - 7);
  var writable = [];
  var protectedDates = [];
  var unavailable = [];
  var rows = [];

  for (var index = 0; index < 7; index += 1) {
    var sourceDate = new Date(sourceStart);
    var targetDate = new Date(targetStart);
    sourceDate.setDate(sourceStart.getDate() + index);
    targetDate.setDate(targetStart.getDate() + index);
    var sourceKey = toISODate(sourceDate);
    var targetKey = toISODate(targetDate);
    var entry = getCalendarCopySourceEntry(sourceKey);
    var targetProtected = hasCalendarEntryForPlanning(targetDate);
    var status = 'empty';
    if (targetProtected) {
      protectedDates.push(targetKey);
      status = 'protected';
    } else if (entry) {
      writable.push({ key: targetKey, entry: entry, sourceKey: sourceKey });
      status = 'ready';
    } else {
      unavailable.push(targetKey);
    }
    var sourceStored = state.entries && state.entries[sourceKey];
    var sourceLabel = 'Nessun turno';
    if (sourceStored && sourceStored.type === 'riposo') sourceLabel = 'Riposo';
    else if (sourceStored && (sourceStored.type === 'lavoro' || sourceStored.type === 'lavoro_ferie')) {
      sourceLabel = normalizeTimeInputValue(sourceStored.start || '') && normalizeTimeInputValue(sourceStored.end || '')
        ? (normalizeTimeInputValue(sourceStored.start || '') + ' - ' + normalizeTimeInputValue(sourceStored.end || ''))
        : 'Turno incompleto';
    } else if (sourceStored) {
      sourceLabel = (dayTypes[sourceStored.type] && dayTypes[sourceStored.type].label) || 'Non copiabile';
    }
    rows.push({
      weekday: weekNames[index],
      sourceDate: sourceDate,
      targetDate: targetDate,
      sourceLabel: sourceLabel,
      status: status
    });
  }

  return {
    sourceStart: sourceStart,
    sourceEnd: new Date(sourceStart.getFullYear(), sourceStart.getMonth(), sourceStart.getDate() + 6),
    targetStart: targetStart,
    targetEnd: new Date(targetStart.getFullYear(), targetStart.getMonth(), targetStart.getDate() + 6),
    writable: writable,
    protectedDates: protectedDates,
    unavailable: unavailable,
    rows: rows
  };
}

function formatPlanningWeekRange(start, end) {
  if (!(start instanceof Date) || !(end instanceof Date)) return '';
  var startText = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' }).format(start).replace('.', '');
  var endText = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' }).format(end).replace('.', '');
  return startText + ' - ' + endText;
}

function formatPlanningDayLabel(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' }).format(date).replace('.', '');
}

function openCalendarWeekCopy() {
  state.calendarActionsOpen = false;
  state.calendarCopyTargetMonday = getDefaultCalendarCopyMonday(state.currentMonth);
  state.calendarCopyWeekOpen = true;
  render();
}

function closeCalendarWeekCopy() {
  state.calendarCopyWeekOpen = false;
  render();
}

function shiftCalendarCopyWeek(days) {
  var monday = getPlanningWeekMonday(state.calendarCopyTargetMonday || getDefaultCalendarCopyMonday(state.currentMonth));
  monday.setDate(monday.getDate() + (Number(days) || 0));
  state.calendarCopyTargetMonday = monday;
  render();
}

function applyCalendarWeekCopy() {
  var preview = getCalendarWeekCopyPreview(state.calendarCopyTargetMonday);
  preview.writable.forEach(function (item) {
    state.entries[item.key] = item.entry;
  });
  if (preview.writable.length) saveEntries();
  state.currentMonth = getPlanningMonth(preview.targetStart);
  state.calendarCopyWeekOpen = false;
  state.monthPlanNotice = preview.writable.length
    ? (preview.writable.length + (preview.writable.length === 1 ? ' turno copiato.' : ' turni copiati.') + (preview.protectedDates.length ? (' ' + preview.protectedDates.length + (preview.protectedDates.length === 1 ? ' giornata protetta non modificata.' : ' giornate protette non modificate.')) : ''))
    : 'Nessun turno copiato: la settimana e vuota oppure le destinazioni sono gia compilate.';
  render();
}

function renderCalendarWeekCopyAction() {
  if (state.calendarSelectionMode) return '';
  return '<section class="calendar-copy-week-action">' +
    '<span>' + icons.activity + '</span><div><small>AZIONE RAPIDA</small><strong>Copia la settimana scorsa</strong></div>' +
    '<button data-open-calendar-week-copy="1">Copia</button>' +
  '</section>';
}

function renderCalendarWeekCopyDialog() {
  if (!state.calendarCopyWeekOpen) return '';
  var preview = getCalendarWeekCopyPreview(state.calendarCopyTargetMonday);
  var statusLabels = {
    ready: 'Pronto',
    protected: 'Protetto',
    empty: 'Non copiato'
  };
  var rows = preview.rows.map(function (item) {
    return '<div class="week-copy-row is-' + item.status + '">' +
      '<span>' + escapeHtml(item.weekday) + '</span><div><strong>' + escapeHtml(item.sourceLabel) + '</strong><small>' + escapeHtml(formatPlanningDayLabel(item.sourceDate)) + ' &rarr; ' + escapeHtml(formatPlanningDayLabel(item.targetDate)) + '</small></div>' +
      '<em>' + statusLabels[item.status] + '</em>' +
    '</div>';
  }).join('');
  return '<div class="planning-dialog-overlay" role="dialog" aria-modal="true" aria-labelledby="weekCopyTitle">' +
    '<section class="planning-dialog week-copy-dialog">' +
      '<button class="planning-dialog-close" data-close-calendar-week-copy="1" aria-label="Chiudi">' + icons.x + '</button>' +
      '<span class="planning-dialog-icon is-blue">' + icons.activity + '</span><small>COPIA SICURA</small><h2 id="weekCopyTitle">Copia la settimana prima</h2>' +
      '<p>Vengono copiati solo turni e riposi. Ferie, malattie, permessi, festivita e giornate gia presenti restano intatti.</p>' +
      '<div class="week-copy-switch"><button data-shift-calendar-week-copy="-7" aria-label="Settimana precedente">' + icons.left + '</button><div><small>SETTIMANA DI DESTINAZIONE</small><strong>' + escapeHtml(formatPlanningWeekRange(preview.targetStart, preview.targetEnd)) + '</strong></div><button data-shift-calendar-week-copy="7" aria-label="Settimana successiva">' + icons.right + '</button></div>' +
      '<div class="week-copy-list">' + rows + '</div>' +
      '<div class="calendar-bulk-result"><span>Turni da copiare</span><strong>' + preview.writable.length + '</strong><small>' + preview.protectedDates.length + ' protetti</small></div>' +
      '<div class="planning-dialog-actions"><button data-close-calendar-week-copy="1">Annulla</button><button class="is-primary" data-apply-calendar-week-copy="1" ' + (!preview.writable.length ? 'disabled' : '') + '>Conferma</button></div>' +
    '</section>' +
  '</div>';
}

function openCalendarActions() {
  state.calendarActionsOpen = true;
  render();
}

function closeCalendarActions() {
  state.calendarActionsOpen = false;
  render();
}

function renderCalendarActionsDialog() {
  if (!state.calendarActionsOpen) return '';
  var preview = getMonthlyTemplatePreview(state.currentMonth);
  return '<div class="planning-dialog-overlay" role="dialog" aria-modal="true" aria-labelledby="calendarActionsTitle">' +
    '<section class="planning-dialog calendar-actions-dialog">' +
      '<button class="planning-dialog-close" data-close-calendar-actions="1" aria-label="Chiudi">' + icons.x + '</button>' +
      '<span class="planning-dialog-icon is-blue">' + icons.calendar + '</span><small>GESTIONE MESE</small><h2 id="calendarActionsTitle">Cosa vuoi fare?</h2>' +
      '<p>Le operazioni avanzate sono raccolte qui. I dati gia presenti non vengono mai sovrascritti senza conferma.</p>' +
      '<div class="calendar-actions-list">' +
        '<button data-toggle-calendar-selection="1"><span class="is-blue">' + icons.check + '</span><div><strong>Seleziona piu giorni</strong><small>Applica un turno, ferie, permesso o riposo</small></div>' + icons.right + '</button>' +
        '<button data-open-calendar-week-copy="1"><span class="is-violet">' + icons.activity + '</span><div><strong>Copia una settimana</strong><small>Riporta turni e riposi nella settimana successiva</small></div>' + icons.right + '</button>' +
        '<button data-open-month-plan="1"><span class="is-green">' + icons.calendar + '</span><div><strong>Prepara il mese</strong><small>' + preview.candidates.length + ' giornate disponibili dalla settimana tipo</small></div>' + icons.right + '</button>' +
      '</div>' +
    '</section>' +
  '</div>';
}

function shouldShowOnboardingInvite() {
  if (!state || !state.settings || state.settings.onboardingCompleted) return false;
  if (Object.keys(state.entries || {}).length) return false;
  if ((state.payslips || []).length) return false;
  return true;
}

function createOnboardingDraft() {
  var presets = getShiftPresets();
  var primary = presets[0] || { label: 'Standard', start: '08:00', end: '17:00', breakHours: 1 };
  var currentYear = new Date().getFullYear();
  return {
    userName: getDisplayUserName(),
    dailyTarget: Number(state.settings.dailyTarget) || 8,
    weeklyTarget: Number(state.settings.weeklyTarget) || 40,
    workdays: normalizeWeekdayList(state.settings.workdays || [0, 1, 2, 3, 4]),
    presetLabel: primary.label,
    presetStart: primary.start,
    presetEnd: primary.end,
    presetBreak: primary.breakHours,
    vacationDays: Number((state.settings.vacationAllowanceByYear || {})[String(currentYear)]) || 0,
    remindersEnabled: Boolean(state.settings.remindersEnabled),
    reminderTime: state.settings.reminderTime || '20:00'
  };
}

function openOnboarding() {
  state.onboardingStep = 0;
  state.onboardingDraft = createOnboardingDraft();
  state.onboardingOpen = true;
  render();
}

function closeOnboarding(markComplete) {
  state.onboardingOpen = false;
  if (markComplete) {
    state.settings.onboardingCompleted = true;
    state.settingsDraft = Object.assign({}, state.settings);
    saveSettings();
  }
  render();
}

async function completeOnboarding() {
  var draft = state.onboardingDraft || createOnboardingDraft();
  var workdays = normalizeWeekdayList(draft.workdays || []);
  var presets = getShiftPresets();
  var primary = presets[0] || {};
  primary.label = String(draft.presetLabel || 'Standard').trim().slice(0, 18) || 'Standard';
  primary.start = normalizeShiftPresetTime(draft.presetStart, '08:00');
  primary.end = normalizeShiftPresetTime(draft.presetEnd, '17:00');
  primary.breakHours = Math.min(12, Math.max(0, parseDecimalInput(draft.presetBreak, 0)));
  presets[0] = primary;
  var vacationAllowances = Object.assign({}, state.settings.vacationAllowanceByYear || {});
  var year = String(new Date().getFullYear());
  var vacationDays = Math.min(366, Math.max(0, parseDecimalInput(draft.vacationDays, 0)));
  vacationAllowances[year] = vacationDays;

  state.settings = normalizeRuntimeSettings(Object.assign({}, state.settings, {
    userName: String(draft.userName || '').trim().slice(0, 24) || 'Utente',
    dailyTarget: Math.max(0, parseDecimalInput(draft.dailyTarget, 8)),
    weeklyTarget: Math.max(0, parseDecimalInput(draft.weeklyTarget, 40)),
    workdays: workdays,
    autoRestDays: [0, 1, 2, 3, 4, 5, 6].filter(function (index) { return workdays.indexOf(index) === -1; }),
    shiftPresets: presets,
    weeklyTemplate: [0, 1, 2, 3, 4, 5, 6].map(function (index) { return workdays.indexOf(index) !== -1 ? 0 : 'rest'; }),
    vacationAllowanceByYear: vacationAllowances,
    remindersEnabled: Boolean(draft.remindersEnabled),
    reminderTime: normalizeTimeInputValue(draft.reminderTime || '') || '20:00',
    onboardingCompleted: true
  }));
  state.settingsDraft = Object.assign({}, state.settings);
  state.onboardingOpen = false;
  state.onboardingStep = 0;
  state.onboardingDraft = null;
  saveSettings();
  if (state.settings.remindersEnabled) await ensureNotificationPermission(true);
  updateReminderSchedule();
  state.activeTab = 'home';
  render();
}

function renderOnboardingInvite() {
  if (!shouldShowOnboardingInvite()) return '';
  return '<button class="onboarding-invite" data-open-onboarding="1">' +
    '<span>' + icons.check + '</span><div><small>PRIMA CONFIGURAZIONE</small><strong>Prepara GestOre per te</strong><p>Target, giorni lavorativi, turno e ferie in tre passaggi.</p></div>' + icons.right +
  '</button>';
}

function renderOnboardingOverlay() {
  if (!state.onboardingOpen) return '';
  var draft = state.onboardingDraft || createOnboardingDraft();
  var step = Math.max(0, Math.min(2, Number(state.onboardingStep) || 0));
  var progress = ((step + 1) / 3) * 100;
  var content = '';
  if (step === 0) {
    content = '<div class="onboarding-step-copy"><small>PASSAGGIO 1 DI 3</small><h2>Partiamo dai tuoi obiettivi</h2><p>Questi valori alimentano Home, statistiche e riepiloghi.</p></div>' +
      '<div class="onboarding-fields"><label class="is-full"><span>COME VUOI ESSERE CHIAMATO</span><input data-onboarding-field="userName" type="text" maxlength="24" value="' + escapeHtml(draft.userName) + '"></label>' +
      '<label><span>ORE AL GIORNO</span><div><input data-onboarding-field="dailyTarget" type="number" inputmode="decimal" min="0" step="0.5" value="' + escapeHtml(String(draft.dailyTarget)) + '"><b>h</b></div></label>' +
      '<label><span>ORE A SETTIMANA</span><div><input data-onboarding-field="weeklyTarget" type="number" inputmode="decimal" min="0" step="0.5" value="' + escapeHtml(String(draft.weeklyTarget)) + '"><b>h</b></div></label></div>';
  } else if (step === 1) {
    content = '<div class="onboarding-step-copy"><small>PASSAGGIO 2 DI 3</small><h2>Costruiamo la settimana tipo</h2><p>Scegli i giorni lavorativi e il turno usato piu spesso.</p></div>' +
      '<div class="onboarding-workdays">' + weekNames.map(function (label, index) {
        var active = draft.workdays.indexOf(index) !== -1;
        return '<button data-onboarding-workday="' + index + '" class="' + (active ? 'is-active' : '') + '" aria-pressed="' + active + '"><strong>' + label.slice(0, 1) + '</strong><small>' + label + '</small></button>';
      }).join('') + '</div>' +
      '<div class="onboarding-shift-card"><label class="is-name"><span>NOME TURNO</span><input data-onboarding-field="presetLabel" type="text" maxlength="18" value="' + escapeHtml(draft.presetLabel) + '"></label><label><span>ENTRATA</span><input data-onboarding-field="presetStart" type="time" value="' + escapeHtml(draft.presetStart) + '"></label><label><span>USCITA</span><input data-onboarding-field="presetEnd" type="time" value="' + escapeHtml(draft.presetEnd) + '"></label><label><span>PAUSA</span><div><input data-onboarding-field="presetBreak" type="number" inputmode="decimal" min="0" step="0.25" value="' + escapeHtml(String(draft.presetBreak)) + '"><b>h</b></div></label></div>';
  } else {
    content = '<div class="onboarding-step-copy"><small>PASSAGGIO 3 DI 3</small><h2>Ultimi dettagli</h2><p>Imposta il saldo ferie e scegli se ricevere avvisi solo quando servono.</p></div>' +
      '<div class="onboarding-final-grid"><label><span>FERIE DISPONIBILI ' + new Date().getFullYear() + '</span><div><input data-onboarding-field="vacationDays" type="number" inputmode="decimal" min="0" step="0.5" value="' + escapeHtml(String(draft.vacationDays)) + '"><b>giorni</b></div></label>' +
      '<div class="onboarding-reminder"><span>' + icons.bell + '</span><div><strong>Promemoria intelligenti</strong><small>Solo giornate mancanti, riepiloghi e buste assenti</small></div><button data-onboarding-reminders="1" class="' + (draft.remindersEnabled ? 'is-on' : '') + '" aria-pressed="' + draft.remindersEnabled + '"><i></i></button></div>' +
      '<label class="is-time"><span>ORARIO PROMEMORIA</span><input data-onboarding-field="reminderTime" type="time" value="' + escapeHtml(draft.reminderTime) + '" ' + (!draft.remindersEnabled ? 'disabled' : '') + '></label></div>';
  }
  return '<div class="onboarding-overlay" role="dialog" aria-modal="true" aria-labelledby="onboardingTitle">' +
    '<section class="onboarding-card">' +
      '<header><div><span>Gest<span>Ore</span></span><small>CONFIGURAZIONE GUIDATA</small></div><button data-skip-onboarding="1" aria-label="Chiudi configurazione">' + icons.x + '</button></header>' +
      '<div class="onboarding-progress"><span style="width:' + progress.toFixed(2) + '%"></span></div>' +
      '<main id="onboardingTitle">' + content + '</main>' +
      '<footer>' + (step > 0 ? '<button data-onboarding-prev="1">' + icons.left + '<span>Indietro</span></button>' : '<button data-skip-onboarding="1">Salta</button>') +
        (step < 2 ? '<button class="is-primary" data-onboarding-next="1"><span>Continua</span>' + icons.right + '</button>' : '<button class="is-primary" data-complete-onboarding="1"><span>Completa</span>' + icons.check + '</button>') + '</footer>' +
    '</section>' +
  '</div>';
}

function renderPlanningOverlays() {
  return renderCalendarActionsDialog() + renderMonthPlanDialog() + renderCalendarBulkDialog() + renderCalendarWeekCopyDialog() + renderOnboardingOverlay();
}

state.monthPlanMonth = getPlanningMonth(state.currentMonth);
state.monthPlanPreviewOpen = false;
state.monthPlanNotice = '';
state.calendarSelectionMode = false;
state.calendarSelectedDates = [];
state.calendarBulkDialogOpen = false;
state.calendarBulkChoice = 'preset:0';
state.calendarActionsOpen = false;
state.calendarCopyWeekOpen = false;
state.calendarCopyTargetMonday = getDefaultCalendarCopyMonday(state.currentMonth);
state.onboardingOpen = false;
state.onboardingStep = 0;
state.onboardingDraft = null;
