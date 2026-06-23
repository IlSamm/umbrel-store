function bindEvents() {
      document.querySelectorAll('[data-tab]').forEach(function (btn) {
        btn.onclick = function () {
          if (state.privacyLocked) return;
          var nextTab = btn.dataset.tab;
          if (!nextTab || state.activeTab === nextTab) return;
          var order = ['home', 'calendar', 'stats', 'payslips', 'settings'];
          var currentIndex = order.indexOf(state.activeTab);
          var nextIndex = order.indexOf(nextTab);
          var navGrid = btn.closest('.nav-grid');
          document.querySelectorAll('.nav-btn.nav-press').forEach(function (node) { node.classList.remove('nav-press'); });
          if (navGrid) navGrid.classList.add('nav-switching');
          btn.classList.add('nav-press');
          setTimeout(function () {
            state.tabSwitchFx = true;
            state.tabSwitchDir = (nextIndex >= currentIndex ? 'forward' : 'back');
            state.activeTab = nextTab;
            render();
          }, 120);
        };
      });
      document.querySelectorAll('[data-open-date]').forEach(function (btn) {
        btn.onclick = function () { openEditor(new Date(btn.dataset.openDate + 'T12:00:00')); };
      });
      var unlockBtn = document.querySelector('[data-unlock-app]');
      if (unlockBtn) unlockBtn.onclick = unlockPrivacyScreen;
      document.querySelectorAll('[data-trigger-payslip-camera], [data-trigger-payslip-gallery]').forEach(function (btn) {
        btn.onclick = function () {
          if (state.privacyLocked) return;
          if (state.payslipBusy) return;
          var input = document.getElementById('payslipFileInput');
          if (!input) return;
          if (btn.hasAttribute('data-trigger-payslip-camera')) input.setAttribute('capture', 'environment');
          else input.removeAttribute('capture');
          input.value = '';
          input.click();
        };
      });
      var payslipInput = document.getElementById('payslipFileInput');
      if (payslipInput) payslipInput.onchange = function (e) {
        var file = e.target.files && e.target.files[0];
        processPayslipFile(file);
      };
      var resetPayslip = document.querySelector('[data-reset-payslip]');
      if (resetPayslip) resetPayslip.onclick = function () { resetPayslipDraft(); render(); };
      document.querySelectorAll('[data-open-payslip]').forEach(function (btn) {
        btn.onclick = function () {
          var found = (state.payslips || []).find(function (item) { return item.id === btn.dataset.openPayslip; });
          if (!found) return;
          state.payslipDraft = Object.assign({}, found);
          state.payslipStatus = '';
          render();
        };
      });
      document.querySelectorAll('[data-open-payslip-archive]').forEach(function (btn) {
        btn.onclick = function () {
          state.activeTab = 'payslips';
          render();
        };
      });
      document.querySelectorAll('[data-open-home-payslip]').forEach(function (btn) {
        btn.onclick = function () {
          var found = (state.payslips || []).find(function (item) { return item.id === btn.dataset.openHomePayslip; });
          if (!found) return;
          state.payslipDraft = Object.assign({}, found);
          state.payslipStatus = '';
          state.activeTab = 'payslips';
          render();
        };
      });
      var savePayslipBtn = document.querySelector('[data-save-payslip]');
      if (savePayslipBtn) savePayslipBtn.onclick = function () { if (!state.payslipBusy) savePayslipDraft(); }; 
      document.querySelectorAll('[data-delete-payslip]').forEach(function (btn) {
        btn.onclick = function () { if (confirm('Eliminare questa busta paga?')) deletePayslip(btn.dataset.deletePayslip); };
      });
      var updatePayslipLiveSummary = function () {
        var draft = ensurePayslipDraft();
        var score = Math.max(0, Math.min(5, getPayslipCoreFieldScore(draft)));
        var percent = Math.round((score / 5) * 100);
        var status = getPayslipStatus(draft);
        var missing = getPayslipMissingCoreFields(draft);
        var statusNode = document.querySelector('[data-payslip-status-label]');
        if (statusNode) {
          statusNode.textContent = status.label;
          statusNode.className = 'paydesk-badge paydesk-badge-' + status.tone;
        }
        document.querySelectorAll('[data-payslip-score-count]').forEach(function (node) {
          node.textContent = score + '/5 dati';
        });
        document.querySelectorAll('[data-payslip-period-value]').forEach(function (node) {
          node.textContent = getPayslipMonthLabel(draft);
        });
        var companyText = String(draft.company || '').trim() || 'Ditta da confermare';
        document.querySelectorAll('[data-payslip-company-value]').forEach(function (node) {
          node.textContent = companyText;
        });
        document.querySelectorAll('[data-payslip-progress-fill]').forEach(function (node) {
          node.style.width = percent + '%';
        });
        document.querySelectorAll('[data-payslip-progress-copy]').forEach(function (node) {
          node.textContent = missing.length ? ('Controlla ancora: ' + missing.join(', ') + '.') : 'Mese, anno, ditta, netto e lordo sono pronti.';
        });
        document.querySelectorAll('[data-payslip-guide-text]').forEach(function (node) {
          node.textContent = state.payslipStatus || (missing.length ? ('Controlla ancora: ' + missing.join(', ') + '.') : 'Foto e campi pronti. Puoi salvare.');
        });
        document.querySelectorAll('[data-payslip-netto-value]').forEach(function (node) {
          node.textContent = formatMoneyEuro(draft.netto);
        });
        document.querySelectorAll('[data-payslip-lordo-value]').forEach(function (node) {
          node.textContent = formatMoneyEuro(draft.lordo);
        });
      };
      [
        ['payslipMonth', 'month'],
        ['payslipYear', 'year'],
        ['payslipCompany', 'company'],
        ['payslipNetto', 'netto'],
        ['payslipLordo', 'lordo']
      ].forEach(function (pair) {
        var el = document.getElementById(pair[0]);
        if (!el) return;
        var key = pair[1];
        var syncFieldValue = function (rawValue) {
          ensurePayslipDraft();
          if (key === 'company') state.payslipDraft[key] = String(rawValue || '').slice(0, 60);
          else if (key === 'month' || key === 'year') state.payslipDraft[key] = Math.max(0, parseInt(rawValue || '0', 10) || 0);
          else state.payslipDraft[key] = parseDecimalInput(rawValue, 0);
          updatePayslipLiveSummary();
        };
        if (key === 'month') {
          el.onchange = function (e) { syncFieldValue(e.target.value); };
          return;
        }
        el.oninput = function (e) { syncFieldValue(e.target.value); };
        if (key === 'company') {
          el.onblur = function (e) {
            ensurePayslipDraft();
            state.payslipDraft.company = String(state.payslipDraft.company || '').trim().slice(0, 60);
            e.target.value = state.payslipDraft.company;
            updatePayslipLiveSummary();
          };
          return;
        }
        if (key === 'year') {
          el.onblur = function (e) {
            ensurePayslipDraft();
            state.payslipDraft.year = Math.max(0, parseInt(e.target.value || '0', 10) || new Date().getFullYear());
            e.target.value = state.payslipDraft.year;
            updatePayslipLiveSummary();
          };
          return;
        }
        el.onfocus = function (e) {
          if (isZeroLikeDecimalText(e.target.value)) e.target.value = '';
          requestAnimationFrame(function () { e.target.setSelectionRange(e.target.value.length, e.target.value.length); });
        };
        el.onblur = function (e) {
          ensurePayslipDraft();
          state.payslipDraft[key] = parseDecimalInput(e.target.value, 0);
          e.target.value = formatEditorDecimal(state.payslipDraft[key] || 0);
          updatePayslipLiveSummary();
        };
      });
      var sourceText = document.getElementById('payslipSourceText');
      if (sourceText) sourceText.oninput = function (e) { ensurePayslipDraft(); state.payslipDraft.sourceText = String(e.target.value || ''); };

      var calToday = document.querySelector('[data-calendar-today]');
      if (calToday) calToday.onclick = function () { var now = new Date(); state.currentMonth = new Date(now.getFullYear(), now.getMonth(), 1); render(); };
      var calPrev = document.querySelector('[data-calendar-prev]');
      if (calPrev) calPrev.onclick = function () { state.currentMonth = new Date(state.currentMonth.getFullYear(), state.currentMonth.getMonth() - 1, 1); render(); };
      var calNext = document.querySelector('[data-calendar-next]');
      if (calNext) calNext.onclick = function () { state.currentMonth = new Date(state.currentMonth.getFullYear(), state.currentMonth.getMonth() + 1, 1); render(); };
      var stPrev = document.querySelector('[data-stats-prev]');
      if (stPrev) stPrev.onclick = function () { state.currentMonth = new Date(state.currentMonth.getFullYear(), state.currentMonth.getMonth() - 1, 1); render(); };
      var stNext = document.querySelector('[data-stats-next]');
      if (stNext) stNext.onclick = function () { state.currentMonth = new Date(state.currentMonth.getFullYear(), state.currentMonth.getMonth() + 1, 1); render(); };

      var settingsAutosaveTimer = 0;
      var commitSettingsDraft = function () {
        state.settings = normalizeRuntimeSettings(Object.assign({}, state.settings, state.settingsDraft));
        state.settingsDraft = Object.assign({}, state.settings);
        saveSettings();
      };
      var queueSettingsAutosave = function (delay) {
        if (settingsAutosaveTimer) clearTimeout(settingsAutosaveTimer);
        settingsAutosaveTimer = setTimeout(function () {
          settingsAutosaveTimer = 0;
          commitSettingsDraft();
        }, typeof delay === 'number' ? delay : 140);
      };

      var userName = document.getElementById('userNameInput');
      if (userName) userName.oninput = function (e) {
        state.settingsDraft.userName = String(e.target.value || '').slice(0, 24);
        queueSettingsAutosave(180);
      };
      var weekly = document.getElementById('weeklyTargetInput');
      if (weekly) weekly.oninput = function (e) {
        state.settingsDraft.weeklyTarget = Number(e.target.value) || 0;
        queueSettingsAutosave(120);
      };
      var daily = document.getElementById('dailyTargetInput');
      if (daily) daily.oninput = function (e) {
        state.settingsDraft.dailyTarget = Number(e.target.value) || 0;
        queueSettingsAutosave(120);
      };
      var holidayOffDaysToggle = document.querySelector('[data-toggle-holiday-offdays]');
      if (holidayOffDaysToggle) holidayOffDaysToggle.onclick = function () {
        state.settingsDraft.holidayHoursOnOffDays = !Boolean(state.settingsDraft.holidayHoursOnOffDays);
        commitSettingsDraft();
        render();
      };

      document.querySelectorAll('[data-toggle-workday]').forEach(function (btn) {
        btn.onclick = function () {
          var index = Number(btn.dataset.toggleWorkday);
          state.settingsDraft.workdays = normalizeWeekdayList(state.settingsDraft.workdays || []);
          var pos = state.settingsDraft.workdays.indexOf(index);
          if (pos !== -1) state.settingsDraft.workdays.splice(pos, 1);
          else { state.settingsDraft.workdays.push(index); state.settingsDraft.workdays.sort(function (a, b) { return a - b; }); }
          commitSettingsDraft();
          render();
        };
      });

      document.querySelectorAll('[data-toggle-auto-rest-day]').forEach(function (btn) {
        btn.onclick = function () {
          var index = Number(btn.dataset.toggleAutoRestDay);
          var list = normalizeWeekdayList(state.settingsDraft.autoRestDays || []);
          var pos = list.indexOf(index);
          if (pos !== -1) list.splice(pos, 1);
          else { list.push(index); list.sort(function (a, b) { return a - b; }); }
          state.settingsDraft.autoRestDays = list;
          commitSettingsDraft();
          render();
        };
      });
      var csvBtn = document.querySelector('[data-export-csv]');
      if (csvBtn) csvBtn.onclick = exportCSV;
      var repBtn = document.querySelector('[data-export-report]');
      if (repBtn) repBtn.onclick = exportReport;
      var repYearBtn = document.querySelector('[data-export-report-year]');
      if (repYearBtn) repYearBtn.onclick = exportYearReport;

      var reminderToggle = document.querySelector('[data-toggle-reminders]');
      if (reminderToggle) reminderToggle.onclick = async function () {
        state.settings.remindersEnabled = !state.settings.remindersEnabled;
        state.settingsDraft.remindersEnabled = state.settings.remindersEnabled;
        saveSettings();
        if (state.settings.remindersEnabled) await ensureNotificationPermission(true);
        updateReminderSchedule();
        render();
      };
      var reminderTime = document.getElementById('reminderTimeInput');
      if (reminderTime) reminderTime.onchange = function (e) {
        state.settings.reminderTime = e.target.value;
        state.settingsDraft.reminderTime = e.target.value;
        saveSettings();
        updateReminderSchedule();
        render();
      };
      var testBtn = document.querySelector('[data-test-notification]');
      if (testBtn) testBtn.onclick = testNotification;

      var lockToggle = document.querySelector('[data-toggle-lock]');
      if (lockToggle) lockToggle.onclick = function () {
        state.settings.lockApp = !state.settings.lockApp;
        state.settingsDraft.lockApp = state.settings.lockApp;
        if (!state.settings.lockApp) state.privacyLocked = false;
        saveSettings(); render();
      };

      document.querySelectorAll('[data-select-type]').forEach(function (btn) {
        btn.onclick = function () {
          if (!state.draft) return;
          var nextType = btn.dataset.selectType;
          state.draft.type = nextType;
          if (nextType === 'riposo') {
            state.draft.start = '';
            state.draft.end = '';
            state.draft.breakHours = 0;
            state.draft.overtimeHours = 0;
            state.draft.overtimeManual = false;
            state.draft.leaveHours = 0;
            state.draft.quantityHours = 0;
            delete state.draft.holidayName;
          } else if (isStateOnlyType(nextType)) {
            state.draft.start = '';
            state.draft.end = '';
            state.draft.breakHours = 0;
            state.draft.overtimeHours = 0;
            state.draft.overtimeManual = false;
            state.draft.leaveHours = 0;
            if (nextType === 'festivita_pagata') {
              state.draft.quantityHours = getAutoHolidayHours(state.editingDate || new Date());
              var holidayInfo = state.editingDate ? getItalianHolidayInfo(state.editingDate) : null;
              state.draft.holidayName = holidayInfo && holidayInfo.name ? holidayInfo.name : (state.draft.holidayName || '');
            } else {
              delete state.draft.holidayName;
            }
          } else {
            state.draft.quantityHours = 0;
            delete state.draft.holidayName;
            if (!state.draft.overtimeManual) state.draft.overtimeHours = minutesToHours(getAutoOvertimeMinutes(state.draft));
          }
          state.typeOpen = false;
          render();
        };
      });
      var toggleType = document.querySelector('[data-toggle-type-open]');
      if (toggleType) toggleType.onclick = function () { state.typeOpen = !state.typeOpen; render(); };
      var toggleNotes = document.querySelector('[data-toggle-notes-open]');
      if (toggleNotes) toggleNotes.onclick = function () { state.notesOpen = !state.notesOpen; render(); };
      var closeBtn = document.querySelector('[data-close-editor]');
      if (closeBtn) closeBtn.onclick = closeEditor;
      var saveDay = document.querySelector('[data-save-day]');
      if (saveDay) saveDay.onclick = saveEditor;
      var start = document.getElementById('editorStart');
      if (start) {
        var syncStart = function (value) {
          syncTimeFieldState(start);
          if (!state.draft) return;
          state.draft.start = normalizeTimeInputValue(value);
          syncDraftAutoOvertime();
          updateEditorSummaryUI();
        };
        syncTimeFieldState(start);
        start.oninput = function (e) { syncStart(e.target.value); };
        start.onchange = function (e) { syncStart(e.target.value); };
        start.onblur = function (e) {
          var normalized = normalizeTimeInputValue(e.target.value);
          e.target.value = normalized;
          syncStart(normalized);
        };
      }
      var end = document.getElementById('editorEnd');
      if (end) {
        var syncEnd = function (value) {
          syncTimeFieldState(end);
          if (!state.draft) return;
          state.draft.end = normalizeTimeInputValue(value);
          syncDraftAutoOvertime();
          updateEditorSummaryUI();
        };
        syncTimeFieldState(end);
        end.oninput = function (e) { syncEnd(e.target.value); };
        end.onchange = function (e) { syncEnd(e.target.value); };
        end.onblur = function (e) {
          var normalized = normalizeTimeInputValue(e.target.value);
          e.target.value = normalized;
          syncEnd(normalized);
        };
      }
      var breakH = document.getElementById('editorBreakHours');
      if (breakH) {
        breakH.onfocus = function (e) {
          if (isZeroLikeDecimalText(e.target.value)) e.target.value = '';
          requestAnimationFrame(function () { e.target.setSelectionRange(e.target.value.length, e.target.value.length); });
        };
        breakH.oninput = function (e) {
          if (!state.draft) return;
          var clean = sanitizeDecimalTyping(e.target.value);
          if (e.target.value !== clean) e.target.value = clean;
          state.draft.breakHours = parseDecimalInput(clean, 0);
          syncDraftAutoOvertime();
          updateEditorSummaryUI();
        };
        breakH.onblur = function (e) {
          if (!state.draft) return;
          state.draft.breakHours = parseDecimalInput(e.target.value, 0);
          e.target.value = formatEditorDecimal(state.draft.breakHours || 0);
          syncDraftAutoOvertime();
          updateEditorSummaryUI();
        };
      }
      var overtime = document.getElementById('editorOvertimeHours');
      if (overtime) {
        overtime.onfocus = function (e) {
          if (!state.draft) return;
          if (!state.draft.overtimeManual || isZeroLikeDecimalText(e.target.value)) e.target.value = '';
          requestAnimationFrame(function () { e.target.setSelectionRange(e.target.value.length, e.target.value.length); });
        };
        overtime.oninput = function (e) {
          if (!state.draft) return;
          var clean = sanitizeDecimalTyping(e.target.value);
          if (e.target.value !== clean) e.target.value = clean;
          state.draft.overtimeManual = Boolean(clean);
          state.draft.overtimeHours = parseDecimalInput(clean, 0);
          updateEditorSummaryUI();
        };
        overtime.onblur = function (e) {
          if (!state.draft) return;
          var raw = String(e.target.value || '').trim();
          if (!raw) {
            state.draft.overtimeManual = false;
            syncDraftAutoOvertime(true);
            updateEditorSummaryUI();
            return;
          }
          state.draft.overtimeManual = true;
          state.draft.overtimeHours = parseDecimalInput(raw, 0);
          e.target.value = formatEditorDecimal(state.draft.overtimeHours || 0);
          updateEditorSummaryUI();
        };
      }
      var leaveInput = document.getElementById('editorLeaveHours');
      if (leaveInput) {
        leaveInput.onfocus = function (e) { if (isZeroLikeDecimalText(e.target.value)) e.target.value = ''; requestAnimationFrame(function () { e.target.setSelectionRange(e.target.value.length, e.target.value.length); }); };
        leaveInput.oninput = function (e) { if (!state.draft) return; var clean = sanitizeDecimalTyping(e.target.value); if (e.target.value !== clean) e.target.value = clean; state.draft.leaveHours = parseDecimalInput(clean, 0); updateEditorSummaryUI(); };
        leaveInput.onblur = function (e) { if (!state.draft) return; state.draft.leaveHours = parseDecimalInput(e.target.value, 0); e.target.value = formatEditorDecimal(state.draft.leaveHours || 0); };
      }
      var quantityInput = document.getElementById('editorQuantityHours');
      if (quantityInput) {
        quantityInput.onfocus = function (e) { if (isZeroLikeDecimalText(e.target.value)) e.target.value = ''; requestAnimationFrame(function () { e.target.setSelectionRange(e.target.value.length, e.target.value.length); }); };
        quantityInput.oninput = function (e) { if (!state.draft) return; var clean = sanitizeDecimalTyping(e.target.value); if (e.target.value !== clean) e.target.value = clean; state.draft.quantityHours = parseDecimalInput(clean, 0); updateEditorSummaryUI(); };
        quantityInput.onblur = function (e) {
          if (!state.draft) return;
          state.draft.quantityHours = parseDecimalInput(e.target.value, 0);
          e.target.value = formatEditorDecimal(state.draft.quantityHours || 0);
          updateEditorSummaryUI();
        };
      }
      var clearDay = document.querySelector('[data-clear-day]');
      if (clearDay) clearDay.onclick = function () {
        if (!state.editingDate) return;
        if (!hasMeaningfulDayData(state.draft) && !state.entries[toISODate(state.editingDate)]) return;
        state.confirmClearOpen = true;
        render();
      };
      var closeConfirm = document.querySelector('[data-close-confirm]');
      if (closeConfirm) closeConfirm.onclick = function () { state.confirmClearOpen = false; render(); };
      var confirmClear = document.querySelector('[data-confirm-clear]');
      if (confirmClear) confirmClear.onclick = function () { clearEditorDay(); };
      var notes = document.getElementById('editorNotes');
      if (notes) notes.oninput = function (e) { if (state.draft) state.draft.notes = e.target.value; };
    }
