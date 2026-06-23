function openEditor(date) {
      var key = toISODate(date);
      var current = getEntryForDate(date) || makeEmptyDayDraft();
      state.editingDate = date;
      state.draft = Object.assign({}, current);
      delete state.draft.autoRest;
      delete state.draft.autoHoliday;
      if (state.draft.leaveHours === undefined) state.draft.leaveHours = 0;
      if (state.draft.quantityHours === undefined) state.draft.quantityHours = 0;
      if (state.draft.type === 'festivita_pagata' && (current.quantityHours === undefined || current.quantityHours === null || current.quantityHours === '')) state.draft.quantityHours = getAutoHolidayHours(date);
      if (state.draft.overtimeManual === undefined) state.draft.overtimeManual = parseDecimalInput(state.draft.overtimeHours, 0) > 0;
      if (!state.draft.overtimeManual) state.draft.overtimeHours = minutesToHours(getAutoOvertimeMinutes(state.draft));
      state.typeOpen = false;
      state.notesOpen = Boolean(current.notes);
      state.confirmClearOpen = false;
      document.body.classList.add('editor-open');
      render();
    }
    function closeEditor() {
      var activeEl = document.activeElement;
      if (activeEl && typeof activeEl.blur === 'function') activeEl.blur();
      document.body.classList.remove('editor-open');
      document.body.classList.remove('keyboard-open');
      state.editingDate = null;
      state.draft = null;
      state.typeOpen = false;
      state.notesOpen = false;
      state.confirmClearOpen = false;
      render();
    }
    function syncTimeFieldState(input) {
      if (!input || !input.closest) return;
      var box = input.closest('.time-box');
      if (!box) return;
      var hasValue = Boolean(normalizeTimeInputValue(input.value));
      box.classList.toggle('has-time', hasValue);
      box.classList.toggle('empty-time', !hasValue);
    }
    function syncDraftAutoOvertime(force) {
      if (!state.draft) return;
      if (isStateOnlyType(state.draft.type) || state.draft.type === 'riposo') {
        state.draft.overtimeHours = 0;
        state.draft.overtimeManual = false;
      } else if (force || !state.draft.overtimeManual) {
        state.draft.overtimeManual = false;
        state.draft.overtimeHours = minutesToHours(getAutoOvertimeMinutes(state.draft));
      }
      var overtimeInput = document.getElementById('editorOvertimeHours');
      if (overtimeInput) overtimeInput.value = formatEditorDecimal(state.draft.overtimeHours || 0);
    }
    function updateEditorSummaryUI() {
      if (!state.draft) return;
      var breakdown = getBreakdown(state.draft);
      var totalEl = document.getElementById('editorSummaryTotal');
      var normalEl = document.getElementById('editorSummaryNormal');
      var overtimeEl = document.getElementById('editorSummaryExtra');
      var leaveEl = document.getElementById('editorSummaryLeave');
      var coveredEl = document.getElementById('editorSummaryCovered');
      if (totalEl) totalEl.textContent = formatDuration(breakdown.total);
      if (normalEl) normalEl.textContent = formatHourValue(minutesToHours(breakdown.normal));
      if (overtimeEl) overtimeEl.textContent = formatHourValue(minutesToHours(breakdown.overtime));
      if (leaveEl) leaveEl.textContent = formatHourValue(minutesToHours(breakdown.leave));
      if (coveredEl) coveredEl.textContent = formatHourValue(minutesToHours(breakdown.leave));
    }
    function clearEditorDay() {
      if (!state.editingDate) return;
      var key = toISODate(state.editingDate);
      delete state.entries[key];
      saveEntries();
      state.draft = makeEmptyDayDraft();
      state.typeOpen = false;
      state.notesOpen = false;
      state.confirmClearOpen = false;
      document.body.classList.add('editor-open');
      render();
    }
    function saveEditor() {
      if (!state.editingDate || !state.draft) return;
      var key = toISODate(state.editingDate);
      var sanitizedDraft = Object.assign({}, state.draft, {
        start: normalizeTimeInputValue(state.draft.start),
        end: normalizeTimeInputValue(state.draft.end),
        breakHours: parseDecimalInput(state.draft.breakHours, 0),
        overtimeHours: parseDecimalInput(state.draft.overtimeHours, 0),
        overtimeManual: Boolean(state.draft.overtimeManual),
        leaveHours: parseDecimalInput(state.draft.leaveHours, 0),
        quantityHours: parseDecimalInput(state.draft.quantityHours, 0)
      });
      delete sanitizedDraft.autoRest;
      delete sanitizedDraft.autoHoliday;
      if (sanitizedDraft.type === 'riposo') { sanitizedDraft.start=''; sanitizedDraft.end=''; sanitizedDraft.breakHours=0; sanitizedDraft.overtimeHours=0; sanitizedDraft.overtimeManual=false; sanitizedDraft.leaveHours=0; sanitizedDraft.quantityHours=0; delete sanitizedDraft.holidayName; }
      if (isStateOnlyType(sanitizedDraft.type)) { sanitizedDraft.start=''; sanitizedDraft.end=''; sanitizedDraft.breakHours=0; sanitizedDraft.overtimeHours=0; sanitizedDraft.overtimeManual=false; sanitizedDraft.leaveHours=0; }
      if (sanitizedDraft.type === 'lavoro') { sanitizedDraft.leaveHours=0; sanitizedDraft.quantityHours=0; }
      if (sanitizedDraft.type === 'lavoro_ferie') { sanitizedDraft.quantityHours=0; }
      if (sanitizedDraft.type === 'festivita_pagata') {
        if (!sanitizedDraft.holidayName) {
          var holidayInfo = getItalianHolidayInfo(state.editingDate);
          if (holidayInfo && holidayInfo.name) sanitizedDraft.holidayName = holidayInfo.name;
        }
      } else {
        delete sanitizedDraft.holidayName;
      }

      if (!hasMeaningfulDayData(sanitizedDraft)) {
        delete state.entries[key];
      } else {
        state.entries[key] = sanitizedDraft;
      }
      saveEntries();
      closeEditor();
    }

    var failed = runInlineTests().filter(function (t) { return !t.passed; });
    if (failed.length) showError('Test falliti: ' + failed.map(function (t) { return t.name; }).join(', '));

    render();
    initializeRuntimeServices();

    (function startSplashScreen() {
  var splash = document.getElementById('splashScreen');
  var body = document.body;
  if (!splash || !body) {
    if (body) body.classList.remove('app-booting');
    return;
  }

  var minVisibleMs = 1480;
  var fadeMs = 500;
  var startedAt = Date.now();
  var closed = false;
  var closeTimer = null;

  function removeSplashNode() {
    if (splash && splash.parentNode) splash.parentNode.removeChild(splash);
  }

  function closeSplash() {
    if (closed) return;
    closed = true;
    window.requestAnimationFrame(function () {
      splash.classList.add('hidden');
    });
    window.setTimeout(function () {
      body.classList.remove('app-booting');
    }, 140);
    window.setTimeout(removeSplashNode, fadeMs + 120);
  }

  function scheduleClose() {
    if (closed || closeTimer) return;
    var elapsed = Date.now() - startedAt;
    var wait = Math.max(0, minVisibleMs - elapsed);
    closeTimer = window.setTimeout(closeSplash, wait);
  }

  if (document.readyState === 'complete') {
    scheduleClose();
  } else {
    window.addEventListener('load', scheduleClose, { once: true });
    window.setTimeout(scheduleClose, minVisibleMs + 650);
  }

  window.addEventListener('pageshow', function (event) {
    if (event.persisted) {
      if (closeTimer) window.clearTimeout(closeTimer);
      body.classList.remove('app-booting');
      removeSplashNode();
    }
  }, { once: true });
})();
