(function (root, factory) {
  'use strict';

  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
    return;
  }
  root.GestOreMonthlyReview = api;
  api.install(root);
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function calculateCompletionScore(checks) {
    var applicable = (Array.isArray(checks) ? checks : []).filter(function (check) {
      return check && check.applicable !== false;
    });
    if (!applicable.length) return { score: 100, ready: 0, total: 0, pending: 0 };
    var ready = applicable.filter(function (check) { return check.ready === true; }).length;
    return {
      score: Math.round((ready / applicable.length) * 100),
      ready: ready,
      total: applicable.length,
      pending: Math.max(0, applicable.length - ready)
    };
  }

  function calculateSalaryComparison(estimatedNet, actualNet) {
    var estimated = Math.max(0, Number(estimatedNet) || 0);
    var actual = Math.max(0, Number(actualNet) || 0);
    var delta = actual - estimated;
    return {
      estimated: estimated,
      actual: actual,
      delta: delta,
      percent: estimated > 0 ? Math.round((delta / estimated) * 100) : 0,
      tone: delta < 0 ? 'lower' : (delta > 0 ? 'higher' : 'equal')
    };
  }

  function shiftMonthDate(value, delta) {
    var source = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(source.getTime())) source = new Date();
    var offset = Number.isFinite(Number(delta)) ? Math.trunc(Number(delta)) : 0;
    return new Date(source.getFullYear(), source.getMonth() + offset, 1, 12, 0, 0, 0);
  }

  function install(global) {
    var api = global.GestOreMonthlyReview;
    var document = global.document;
    if (!document) return;
    var monthSwitchLocked = false;
    var monthSwitchTimer = 0;

    function appState() {
      return global.state || {};
    }

    function html(value) {
      if (typeof global.escapeHtml === 'function') return global.escapeHtml(value);
      return String(value === null || value === undefined ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    function monthDate(value) {
      var source = value instanceof Date ? value : new Date();
      if (Number.isNaN(source.getTime())) source = new Date();
      return new Date(source.getFullYear(), source.getMonth(), 1, 12, 0, 0, 0);
    }

    function dateIndex(value) {
      return value.getFullYear() * 12 + value.getMonth();
    }

    function formatMonth(value) {
      return new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' }).format(value);
    }

    function formatShortDate(key) {
      var date = typeof global.parseLocalDateKey === 'function'
        ? global.parseLocalDateKey(key)
        : new Date(String(key) + 'T12:00:00');
      if (!date || Number.isNaN(date.getTime())) return key;
      return new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: 'numeric', month: 'short' }).format(date);
    }

    function formatDays(minutes, dailyMinutes) {
      var days = Math.max(0, Number(minutes) || 0) / Math.max(1, Number(dailyMinutes) || 1);
      var rounded = Math.round(days * 10) / 10;
      return String(rounded).replace('.', ',') + ' gg';
    }

    function formatMoney(value) {
      if (typeof global.formatSalaryEstimateMoney === 'function') return global.formatSalaryEstimateMoney(value);
      return Math.max(0, Number(value) || 0).toLocaleString('it-IT', {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
    }

    function haptic(style) {
      if (!global.GestOreNative || typeof global.GestOreNative.haptic !== 'function') return;
      global.GestOreNative.haptic(style || 'light').catch(function () {});
    }

    function announce(message) {
      if (typeof global.announceAppStatus === 'function') {
        global.announceAppStatus(message);
        return;
      }
      var node = document.getElementById('goA11yStatus');
      if (node) node.textContent = String(message || '');
    }

    function getSelectedDate() {
      var state = appState();
      return monthDate(state.monthlyReviewDate || state.currentMonth || new Date());
    }

    function collectReview(requestedDate) {
      var state = appState();
      var selected = monthDate(requestedDate || getSelectedDate());
      var now = new Date();
      var today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
      var selectedPosition = dateIndex(selected);
      var currentPosition = dateIndex(today);
      var isFuture = selectedPosition > currentPosition;
      var isCurrent = selectedPosition === currentPosition;
      var isPast = selectedPosition < currentPosition;
      var daysInMonth = new Date(selected.getFullYear(), selected.getMonth() + 1, 0).getDate();
      var limitDay = isFuture ? 0 : (isCurrent ? Math.max(0, now.getDate() - (now.getHours() >= 20 ? 0 : 1)) : daysInMonth);
      var expectedKeys = [];
      var completedKeys = [];
      var missingKeys = [];
      var autoRestDays = typeof global.getAutoRestDays === 'function' ? global.getAutoRestDays() : [];

      for (var day = 1; day <= limitDay; day += 1) {
        var date = new Date(selected.getFullYear(), selected.getMonth(), day, 12, 0, 0, 0);
        var weekday = typeof global.mondayIndex === 'function' ? global.mondayIndex(date.getDay()) : ((date.getDay() + 6) % 7);
        // Weekend work is occasional overtime in GestOre and must never become mandatory.
        if (weekday >= 5) continue;
        if (autoRestDays.indexOf(weekday) !== -1) continue;
        if (typeof global.isConfiguredWorkday === 'function' && !global.isConfiguredWorkday(date)) continue;
        if (typeof global.getItalianHolidayInfo === 'function' && global.getItalianHolidayInfo(date)) continue;
        var key = typeof global.toISODate === 'function'
          ? global.toISODate(date)
          : date.toISOString().slice(0, 10);
        expectedKeys.push(key);
        if (state.entries && Object.prototype.hasOwnProperty.call(state.entries, key)) completedKeys.push(key);
        else missingKeys.push(key);
      }

      var stats = typeof global.getMonthStats === 'function'
        ? global.getMonthStats(selected)
        : {
            totalMinutes: 0,
            normalMinutes: 0,
            overtimeMinutes: 0,
            coveredMinutes: 0,
            vacationMinutes: 0,
            sicknessMinutes: 0,
            permissionMinutes: 0,
            paidHolidayMinutes: 0,
            workedDays: 0
          };
      var dailyMinutes = Math.max(1, typeof global.getDailyTargetMinutes === 'function'
        ? global.getDailyTargetMinutes()
        : 480);
      var estimate = { valid: false, estimatedMonthWithOvertimeNet: 0, incomplete: false };
      if (typeof global.getPayrollNetEstimateForMonth === 'function') {
        try {
          estimate = global.getPayrollNetEstimateForMonth(selected.getFullYear(), selected.getMonth() + 1) || estimate;
        } catch (error) {}
      }
      var payslip = (state.payslips || []).find(function (item) {
        return Number(item.year) === selected.getFullYear() && Number(item.month) === selected.getMonth() + 1;
      }) || null;
      var actualNet = payslip && typeof global.parseDecimalInput === 'function'
        ? global.parseDecimalInput(payslip.netto, 0)
        : Math.max(0, Number(payslip && payslip.netto) || 0);
      var estimatedNet = estimate.valid ? Math.max(0, Number(estimate.estimatedMonthWithOvertimeNet) || 0) : 0;
      var comparison = calculateSalaryComparison(estimatedNet, actualNet);
      var hasMonthActivity = Math.max(0, Number(stats.coveredMinutes) || 0) > 0 || Math.max(0, Number(stats.totalMinutes) || 0) > 0;
      var payslipRequired = isPast && hasMonthActivity;
      var syncError = String(global.serverSyncLastError || '');
      var syncReady = !state.syncPending && !syncError;
      var calendarReady = missingKeys.length === 0;
      var icons = global.icons || {};
      var checks = [
        {
          key: 'calendar',
          title: 'Giornate del mese',
          copy: isFuture
            ? 'Il controllo iniziera quando comincia il mese.'
            : (calendarReady
              ? (expectedKeys.length ? completedKeys.length + ' giornate previste risultano registrate.' : 'Nessuna giornata obbligatoria da controllare.')
              : missingKeys.length + (missingKeys.length === 1 ? ' giornata lavorativa manca.' : ' giornate lavorative mancano.')),
          status: isFuture ? 'Futuro' : (calendarReady ? 'Completo' : 'Da completare'),
          tone: isFuture ? 'neutral' : (calendarReady ? 'ready' : 'warning'),
          icon: icons.calendar || '',
          target: missingKeys.length ? 'missing' : 'calendar',
          value: missingKeys[0] || '',
          applicable: !isFuture,
          ready: calendarReady
        },
        {
          key: 'salary',
          title: 'Stima stipendio',
          copy: estimate.valid
            ? ('Netto previsto ' + formatMoney(estimatedNet) + (estimate.incomplete ? ', da precisare.' : '.'))
            : (hasMonthActivity ? 'Completa i dati retributivi per ottenere la stima.' : 'Sara disponibile quando registri le prime ore.'),
          status: estimate.valid ? (estimate.incomplete ? 'Parziale' : 'Calcolata') : 'Da configurare',
          tone: estimate.valid ? (estimate.incomplete ? 'warning' : 'ready') : 'neutral',
          icon: icons.wallet || '',
          target: 'salary',
          value: '',
          applicable: !isFuture && hasMonthActivity,
          ready: estimate.valid && !estimate.incomplete
        },
        {
          key: 'payslip',
          title: 'Cedolino reale',
          copy: payslip
            ? ('Netto archiviato ' + formatMoney(actualNet) + '.')
            : (payslipRequired ? 'Non risulta ancora un cedolino per questo mese.' : 'Potrai confrontarlo quando lo ricevi.'),
          status: payslip ? 'Archiviato' : (payslipRequired ? 'Mancante' : 'In attesa'),
          tone: payslip ? 'ready' : (payslipRequired ? 'warning' : 'neutral'),
          icon: icons.receipt || '',
          target: 'payslip',
          value: payslip ? String(payslip.id || '') : '',
          applicable: Boolean(payslip || payslipRequired),
          ready: Boolean(payslip)
        },
        {
          key: 'sync',
          title: 'Database personale',
          copy: syncReady
            ? (typeof global.getSyncStatusMessage === 'function' ? global.getSyncStatusMessage() : 'Dati salvati.')
            : (syncError || 'Le modifiche attendono la conferma del server.'),
          status: state.syncPending ? 'In attesa' : (syncError ? 'Offline' : 'Salvato'),
          tone: syncReady ? 'ready' : 'warning',
          icon: icons.cloud || '',
          target: 'sync',
          value: '',
          applicable: true,
          ready: syncReady
        }
      ];
      var completion = calculateCompletionScore(checks);
      var status = isFuture
        ? 'Pianificazione'
        : (completion.pending === 0 ? (isCurrent ? 'In ordine' : 'Mese chiuso') : 'Da completare');
      var tone = isFuture ? 'neutral' : (completion.pending === 0 ? 'ready' : 'warning');

      return {
        date: selected,
        label: formatMonth(selected),
        isCurrent: isCurrent,
        isPast: isPast,
        isFuture: isFuture,
        expectedKeys: expectedKeys,
        completedKeys: completedKeys,
        missingKeys: missingKeys,
        stats: stats,
        dailyMinutes: dailyMinutes,
        estimate: estimate,
        payslip: payslip,
        estimatedNet: estimatedNet,
        actualNet: actualNet,
        comparison: comparison,
        checks: checks,
        completion: completion,
        status: status,
        tone: tone
      };
    }

    function renderHomeCard() {
      var state = appState();
      if (!state.settings || state.settings.homeShowMonthlyReview === false) return '';
      var review = collectReview(new Date());
      var stats = review.stats;
      var actionCopy = review.completion.pending
        ? (review.completion.pending + (review.completion.pending === 1 ? ' controllo da completare' : ' controlli da completare'))
        : 'Tutto aggiornato per ora';
      return '<button class="home-month-review is-' + review.tone + '" data-open-month-review="1" aria-label="Apri il riepilogo di ' + html(review.label) + '">' +
        '<span class="home-month-review-ring" style="--month-review-score:' + review.completion.score + '%"><span><b>' + review.completion.score + '%</b><small>pronto</small></span></span>' +
        '<span class="home-month-review-copy"><small>CENTRO MESE</small><strong>' + html(review.label) + '</strong><em>' + html(actionCopy) + '</em></span>' +
        '<span class="home-month-review-metrics"><small>ORE</small><b>' + html(global.formatDuration ? global.formatDuration(stats.totalMinutes || 0) : '0h 0m') + '</b><em>' + html(global.formatDuration ? global.formatDuration(stats.overtimeMinutes || 0) : '0h 0m') + ' extra</em></span>' +
        '<i>' + (global.icons ? global.icons.right : '') + '</i>' +
      '</button>';
    }

    function renderCheck(check) {
      var action = ' data-month-review-target="' + html(check.target) + '"';
      if (check.value) action += ' data-month-review-value="' + html(check.value) + '"';
      return '<button class="month-review-check is-' + html(check.tone) + '"' + action + '>' +
        '<span class="month-review-check-icon">' + check.icon + '</span>' +
        '<span class="month-review-check-copy"><strong>' + html(check.title) + '</strong><small>' + html(check.copy) + '</small></span>' +
        '<span class="month-review-check-status">' + html(check.status) + '</span>' +
        (global.icons ? global.icons.right : '') +
      '</button>';
    }

    function renderOverlay() {
      var state = appState();
      if (!state.monthlyReviewOpen) return '';
      var review = collectReview(getSelectedDate());
      var stats = review.stats;
      var missingRows = review.missingKeys.slice(0, 5).map(function (key) {
        return '<button data-month-review-target="missing" data-month-review-value="' + html(key) + '"><span>' + (global.icons ? global.icons.calendar : '') + '</span><strong>' + html(formatShortDate(key)) + '</strong><small>Apri e completa</small>' + (global.icons ? global.icons.right : '') + '</button>';
      }).join('');
      var missingMarkup = review.missingKeys.length
        ? '<section class="month-review-panel month-review-missing"><div class="month-review-section-head"><div><small>GIORNATE MANCANTI</small><h2>Completa il calendario</h2></div><b>' + review.missingKeys.length + '</b></div><div>' + missingRows + (review.missingKeys.length > 5 ? '<p>Altre ' + (review.missingKeys.length - 5) + ' giornate sono visibili nel Calendario.</p>' : '') + '</div></section>'
        : '';
      var salaryMarkup = '';
      if (review.estimatedNet > 0 || review.actualNet > 0) {
        var comparison = review.comparison;
        var deltaLabel = comparison.estimated > 0 && comparison.actual > 0
          ? ((comparison.delta >= 0 ? '+' : '-') + formatMoney(Math.abs(comparison.delta)))
          : '--';
        var comparisonCopy = comparison.estimated > 0 && comparison.actual > 0
          ? ((comparison.delta >= 0 ? '+' : '') + comparison.percent + '% rispetto alla stima')
          : 'Il confronto apparira quando sono presenti entrambi i valori.';
        salaryMarkup = '<section class="month-review-panel month-review-salary is-' + comparison.tone + '">' +
          '<div class="month-review-section-head"><div><small>STIMA E REALTA</small><h2>Confronto stipendio</h2></div><span>' + (global.icons ? global.icons.wallet : '') + '</span></div>' +
          '<div class="month-review-salary-grid"><div><span>PREVISTO</span><strong>' + (review.estimatedNet ? html(formatMoney(review.estimatedNet)) : '--') + '</strong></div><div><span>RICEVUTO</span><strong>' + (review.actualNet ? html(formatMoney(review.actualNet)) : '--') + '</strong></div><div class="is-delta"><span>DIFFERENZA</span><strong>' + html(deltaLabel) + '</strong><small>' + html(comparisonCopy) + '</small></div></div>' +
          '<button data-month-review-target="salary"><span>Apri dettaglio stipendio</span>' + (global.icons ? global.icons.right : '') + '</button>' +
        '</section>';
      }
      var absenceMinutes = (stats.vacationMinutes || 0) + (stats.sicknessMinutes || 0) + (stats.permissionMinutes || 0) + (stats.paidHolidayMinutes || 0);
      var absenceMarkup = absenceMinutes > 0
        ? '<section class="month-review-panel month-review-absence"><div class="month-review-section-head"><div><small>ASSENZE E COPERTURE</small><h2>Composizione del mese</h2></div><button data-month-review-target="stats">Dettaglio</button></div><div class="month-review-absence-grid">' +
            '<div class="is-vacation"><span>Ferie</span><strong>' + html(formatDays(stats.vacationMinutes || 0, review.dailyMinutes)) + '</strong></div>' +
            '<div class="is-sickness"><span>Malattia</span><strong>' + html(formatDays(stats.sicknessMinutes || 0, review.dailyMinutes)) + '</strong></div>' +
            '<div class="is-permission"><span>Permessi</span><strong>' + html(global.formatDuration ? global.formatDuration(stats.permissionMinutes || 0) : '0h 0m') + '</strong></div>' +
            '<div class="is-holiday"><span>Festivi</span><strong>' + html(formatDays(stats.paidHolidayMinutes || 0, review.dailyMinutes)) + '</strong></div>' +
          '</div></section>'
        : '';
      var heroCopy = review.completion.pending
        ? (review.completion.pending + (review.completion.pending === 1 ? ' controllo richiede attenzione' : ' controlli richiedono attenzione'))
        : 'Ore, documenti e database risultano aggiornati';

      return '<div class="month-review-overlay" role="dialog" aria-modal="true" aria-labelledby="monthReviewTitle">' +
        '<section class="month-review-sheet">' +
          '<header class="month-review-top"><button data-close-month-review="1" aria-label="Torna alla Home">' + (global.icons ? global.icons.left : '') + '</button><div><small>RIEPILOGO INTELLIGENTE</small><h1 id="monthReviewTitle">Centro mese</h1></div><i></i></header>' +
          '<div class="month-review-scroll">' +
            '<div class="month-review-period"><button data-month-review-month="-1" aria-label="Mese precedente">' + (global.icons ? global.icons.left : '') + '</button><div><span>PERIODO</span><strong>' + html(review.label) + '</strong></div><button data-month-review-month="1" aria-label="Mese successivo">' + (global.icons ? global.icons.right : '') + '</button></div>' +
            '<section class="month-review-hero is-' + review.tone + '">' +
              '<div class="month-review-ring" style="--month-review-score:' + review.completion.score + '%"><div><strong>' + review.completion.score + '%</strong><span>pronto</span></div></div>' +
              '<div class="month-review-hero-copy"><small>' + html(review.status.toUpperCase()) + '</small><h2>' + html(heroCopy) + '</h2><p>' + review.completion.ready + ' di ' + review.completion.total + ' controlli completati</p></div>' +
            '</section>' +
            '<section class="month-review-kpis" aria-label="Numeri principali del mese">' +
              '<div class="is-work"><span>ORE LAVORATE</span><strong>' + html(global.formatDuration ? global.formatDuration(stats.totalMinutes || 0) : '0h 0m') + '</strong><small>' + (stats.workedDays || 0) + ' giorni</small></div>' +
              '<div class="is-extra"><span>STRAORDINARI</span><strong>' + html(global.formatDuration ? global.formatDuration(stats.overtimeMinutes || 0) : '0h 0m') + '</strong><small>registrati</small></div>' +
              '<div class="is-covered"><span>ORE COPERTE</span><strong>' + html(global.formatDuration ? global.formatDuration(stats.coveredMinutes || 0) : '0h 0m') + '</strong><small>lavoro e assenze</small></div>' +
              '<div class="is-vacation"><span>FERIE</span><strong>' + html(formatDays(stats.vacationMinutes || 0, review.dailyMinutes)) + '</strong><small>nel periodo</small></div>' +
            '</section>' +
            '<section class="month-review-panel month-review-checklist"><div class="month-review-section-head"><div><small>CONTROLLO GUIDATO</small><h2>Cosa manca per chiudere</h2></div><span>' + review.completion.pending + '</span></div><div>' + review.checks.map(renderCheck).join('') + '</div></section>' +
            missingMarkup +
            salaryMarkup +
            absenceMarkup +
            '<section class="month-review-actions"><button data-month-review-export="1"><span>' + (global.icons ? global.icons.note : '') + '</span><div><small>REPORT DEL MESE</small><strong>Anteprima o scarica PDF</strong></div>' + (global.icons ? global.icons.right : '') + '</button><button data-month-review-target="stats"><span>' + (global.icons ? global.icons.activity : '') + '</span><div><small>ANALISI</small><strong>Apri statistiche complete</strong></div>' + (global.icons ? global.icons.right : '') + '</button></section>' +
            '<p class="month-review-footnote">Il Centro mese legge soltanto i dati gia presenti in GestOre. Non modifica giornate, cedolini o impostazioni.</p>' +
          '</div>' +
        '</section>' +
      '</div>';
    }

    function closeReview() {
      appState().monthlyReviewOpen = false;
      document.documentElement.classList.remove('month-review-open');
      document.body.classList.remove('month-review-open');
      monthSwitchLocked = false;
      if (monthSwitchTimer) global.clearTimeout(monthSwitchTimer);
      haptic('light');
      if (typeof global.render === 'function') global.render();
    }

    function openReview(date) {
      var state = appState();
      state.monthlyReviewDate = monthDate(date || new Date());
      state.monthlyReviewOpen = true;
      document.documentElement.classList.add('month-review-open');
      document.body.classList.add('month-review-open');
      haptic('light');
      if (typeof global.render === 'function') global.render();
      global.requestAnimationFrame(function () {
        var close = document.querySelector('[data-close-month-review]');
        if (close && typeof close.focus === 'function') close.focus({ preventScroll: true });
      });
    }

    function openTarget(target, value) {
      var state = appState();
      var selected = getSelectedDate();
      state.monthlyReviewOpen = false;
      document.documentElement.classList.remove('month-review-open');
      document.body.classList.remove('month-review-open');
      if (target === 'missing' && value && typeof global.openEditor === 'function') {
        global.openEditor(new Date(value + 'T12:00:00'));
        return;
      }
      if (target === 'calendar') {
        state.currentMonth = monthDate(selected);
        state.calendarSelectedDate = value || (typeof global.toISODate === 'function' ? global.toISODate(selected) : '');
        state.activeTab = 'calendar';
      } else if (target === 'stats') {
        state.currentMonth = monthDate(selected);
        state.statsRange = 'month';
        state.activeTab = 'stats';
      } else if (target === 'salary') {
        state.salaryMonth = monthDate(selected);
        state.payslipEstimateYear = selected.getFullYear();
        state.payslipEstimateMonth = selected.getMonth() + 1;
        state.payslipDetailId = '';
        state.payslipEditorOpen = false;
        state.payslipStatsOpen = false;
        state.payslipArchiveOpen = false;
        state.payslipEstimateOpen = true;
        state.activeTab = 'payslips';
      } else if (target === 'payslip') {
        state.salaryMonth = monthDate(selected);
        state.payslipDetailId = value || '';
        state.payslipEditorOpen = false;
        state.payslipStatsOpen = false;
        state.payslipEstimateOpen = false;
        state.payslipArchiveOpen = Boolean(value);
        state.activeTab = 'payslips';
      } else if (target === 'sync') {
        state.settingsSection = 'data';
        state.settingsReturnTarget = 'profile';
        state.activeTab = 'settings';
      }
      haptic('light');
      if (typeof global.render === 'function') global.render();
    }

    function switchReviewMonth(delta) {
      var offset = Number(delta) || 0;
      if (!offset || monthSwitchLocked) return;
      var state = appState();
      var currentScroll = document.querySelector('.month-review-scroll');
      state.monthlyReviewDate = shiftMonthDate(getSelectedDate(), offset);
      haptic('light');

      if (!currentScroll) {
        if (typeof global.render === 'function') global.render();
        return;
      }

      monthSwitchLocked = true;
      var previousTop = currentScroll.scrollTop;
      var template = document.createElement('template');
      template.innerHTML = renderOverlay().trim();
      var nextScroll = template.content.querySelector('.month-review-scroll');
      if (!nextScroll) {
        monthSwitchLocked = false;
        return;
      }

      currentScroll.innerHTML = nextScroll.innerHTML;
      currentScroll.scrollTop = Math.min(previousTop, Math.max(0, currentScroll.scrollHeight - currentScroll.clientHeight));
      currentScroll.classList.remove('is-month-back', 'is-month-forward');
      void currentScroll.offsetWidth;
      currentScroll.classList.add(offset < 0 ? 'is-month-back' : 'is-month-forward');
      bindEvents();

      var focusTarget = currentScroll.querySelector('[data-month-review-month="' + (offset < 0 ? '-1' : '1') + '"]');
      if (focusTarget && typeof focusTarget.focus === 'function') {
        try { focusTarget.focus({ preventScroll: true }); } catch (error) { focusTarget.focus(); }
      }
      announce('Riepilogo di ' + formatMonth(state.monthlyReviewDate));

      if (monthSwitchTimer) global.clearTimeout(monthSwitchTimer);
      monthSwitchTimer = global.setTimeout(function () {
        currentScroll.classList.remove('is-month-back', 'is-month-forward');
        monthSwitchLocked = false;
        monthSwitchTimer = 0;
      }, 180);
    }

    function bindEvents() {
      document.querySelectorAll('[data-open-month-review]').forEach(function (button) {
        button.onclick = function () { openReview(new Date()); };
      });
      document.querySelectorAll('[data-close-month-review]').forEach(function (button) {
        button.onclick = closeReview;
      });
      document.querySelectorAll('[data-month-review-month]').forEach(function (button) {
        button.onclick = function () {
          switchReviewMonth(Number(button.dataset.monthReviewMonth) || 0);
        };
      });
      document.querySelectorAll('[data-month-review-target]').forEach(function (button) {
        button.onclick = function () {
          openTarget(String(button.dataset.monthReviewTarget || ''), String(button.dataset.monthReviewValue || ''));
        };
      });
      document.querySelectorAll('[data-month-review-export]').forEach(function (button) {
        button.onclick = function () {
          var state = appState();
          state.currentMonth = monthDate(getSelectedDate());
          state.monthlyReviewOpen = false;
          document.documentElement.classList.remove('month-review-open');
          document.body.classList.remove('month-review-open');
          haptic('medium');
          announce('Preparazione del report mensile');
          if (typeof global.openPdfExportDialog === 'function') global.openPdfExportDialog('monthly');
        };
      });
    }

    api.collectReview = collectReview;
    api.renderHomeCard = renderHomeCard;
    api.renderOverlay = renderOverlay;
    api.bindEvents = bindEvents;
    api.open = openReview;
    api.close = closeReview;
    api.switchMonth = switchReviewMonth;

    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape' || !appState().monthlyReviewOpen) return;
      event.preventDefault();
      closeReview();
    });
  }

  return {
    calculateCompletionScore: calculateCompletionScore,
    calculateSalaryComparison: calculateSalaryComparison,
    shiftMonthDate: shiftMonthDate,
    install: install
  };
});
