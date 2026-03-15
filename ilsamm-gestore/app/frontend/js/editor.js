function openEditor(date) {
      var key = toISODate(date);
      var current = getEntryForDate(date) || makeEmptyDayDraft();
      state.editingDate = date;
      state.draft = Object.assign({}, current);
      delete state.draft.autoRest;
      if (state.draft.leaveHours === undefined) state.draft.leaveHours = 0;
      if (state.draft.quantityHours === undefined) state.draft.quantityHours = 0;
      state.typeOpen = false;
      state.notesOpen = Boolean(current.notes);
      state.confirmClearOpen = false;
      render();
    }
    function closeEditor() {
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
        leaveHours: parseDecimalInput(state.draft.leaveHours, 0),
        quantityHours: parseDecimalInput(state.draft.quantityHours, 0)
      });
      delete sanitizedDraft.autoRest;
      if (sanitizedDraft.type === 'riposo') { sanitizedDraft.start=''; sanitizedDraft.end=''; sanitizedDraft.breakHours=0; sanitizedDraft.overtimeHours=0; sanitizedDraft.leaveHours=0; sanitizedDraft.quantityHours=0; }
      if (isStateOnlyType(sanitizedDraft.type)) { sanitizedDraft.start=''; sanitizedDraft.end=''; sanitizedDraft.breakHours=0; sanitizedDraft.overtimeHours=0; sanitizedDraft.leaveHours=0; }
      if (sanitizedDraft.type === 'lavoro') { sanitizedDraft.leaveHours=0; sanitizedDraft.quantityHours=0; }
      if (sanitizedDraft.type === 'lavoro_ferie') { sanitizedDraft.quantityHours=0; }

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

    (function startSplashScreen() {
      var splash = document.getElementById('splashScreen');
      if (!splash) { document.body.classList.remove('app-booting'); return; }
      var minVisibleMs = 1600;
      var fadeMs = 760;
      var startedAt = Date.now();
      var closed = false;

      function closeSplash() {
        if (closed) return;
        closed = true;
        splash.classList.add('hidden');
        window.setTimeout(function () {
          document.body.classList.remove('app-booting');
        }, 180);
        window.setTimeout(function () {
          if (splash && splash.parentNode) splash.parentNode.removeChild(splash);
        }, fadeMs + 220);
      }

      function finishWhenReady() {
        var elapsed = Date.now() - startedAt;
        var wait = Math.max(0, minVisibleMs - elapsed);
        window.setTimeout(closeSplash, wait);
      }

      if (document.readyState === 'complete') {
        finishWhenReady();
      } else {
        window.addEventListener('load', finishWhenReady, { once: true });
        window.setTimeout(finishWhenReady, minVisibleMs + 900);
      }
    })();

    (function preventIosZoom() {
      var lastSingleTapTime = 0;

      document.addEventListener('touchend', function (event) {
        if ((event.changedTouches && event.changedTouches.length > 1) || (event.touches && event.touches.length > 0)) {
          return;
        }

        if (event.target && event.target.closest && event.target.closest('input, textarea, select, option, [contenteditable="true"]')) {
          lastSingleTapTime = 0;
          return;
        }

        var now = Date.now();
        if (now - lastSingleTapTime <= 300) {
          event.preventDefault();
          lastSingleTapTime = 0;
          return;
        }

        lastSingleTapTime = now;
      }, { passive: false });

      ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (eventName) {
        document.addEventListener(eventName, function (event) {
          event.preventDefault();
        }, { passive: false });
      });
    })();
