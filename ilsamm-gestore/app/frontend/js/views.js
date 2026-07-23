function renderPayslipsLegacy() {
      ensurePayslipDraft();
      var draft = state.payslipDraft;
      var draftStatus = state.payslipStatus ? '<div class="payslip-status">' + escapeHtml(state.payslipStatus) + '</div>' : '';
      var archive = (state.payslips || []).map(function (item) {
        var status = getPayslipStatus(item);
        return '<button class="payslip-archive-card" data-open-payslip="' + item.id + '"><div class="payslip-archive-main"><div><div class="payslip-month">' + getPayslipMonthLabel(item) + '</div><div class="payslip-company">' + escapeHtml(item.company || 'Busta importata') + '</div></div><span class="payslip-badge ' + status.tone + '">' + status.label + '</span></div><div class="payslip-archive-meta"><span>Netto ' + formatMoneyEuro(item.netto) + '</span><span>Straordinari ' + formatHourValue(item.overtimeHours || 0) + '</span></div></button>';
      }).join('');
      var comparisons = getPayslipComparison(draft).filter(function (row) { return row.app || row.slip; });
      return '<div class="top top-centered page-top"><div class="title">Buste paga</div></div>' +
        '<div class="stack">' +
          '<div class="card payslip-hero"><div class="card-body"><div class="payslip-hero-title">Scatta una foto e controlla se torna tutto</div><div class="small muted">Legge la busta, estrae i dati principali e li confronta con il mese che hai già registrato in GestOre.</div><div class="small muted" style="margin-top:8px;">Per risultati migliori: foto dritta, luce buona e busta intera ben visibile.</div><div class="payslip-hero-actions"><button class="solid" data-trigger-payslip-camera="1" ' + (state.payslipBusy ? 'disabled' : '') + '>Scatta foto</button><button class="ghost" data-trigger-payslip-gallery="1" ' + (state.payslipBusy ? 'disabled' : '') + '>Galleria</button></div>' + draftStatus + '</div></div>' +
          '<div class="card"><div class="card-body payslip-form-body">' +
            '<div class="between"><div class="section-title" style="margin:0;">Nuova busta</div><button class="ghost mini-btn" data-reset-payslip="1" ' + (state.payslipBusy ? 'disabled' : '') + '>Nuova</button></div>' +
            (draft.imageData ? '<div class="payslip-preview"><img src="' + draft.imageData + '" alt="Anteprima busta paga"></div>' : '') +
            '<div class="payslip-form-grid">' +
              '<label class="payslip-field"><span>Mese</span><select id="payslipMonth">' + monthNames.map(function (name, idx) { return '<option value="' + (idx + 1) + '" ' + (Number(draft.month) === (idx + 1) ? 'selected' : '') + '>' + name + '</option>'; }).join('') + '</select></label>' +
              '<label class="payslip-field"><span>Anno</span><input id="payslipYear" type="number" inputmode="numeric" value="' + escapeHtml(draft.year || new Date().getFullYear()) + '"></label>' +
              '<label class="payslip-field payslip-field-full"><span>Azienda</span><input id="payslipCompany" type="text" value="' + escapeHtml(draft.company || '') + '" placeholder="Nome azienda"></label>' +
              '<label class="payslip-field"><span>Netto</span><input id="payslipNetto" type="text" inputmode="decimal" value="' + escapeHtml(formatEditorDecimal(draft.netto || 0)) + '"></label>' +
              '<label class="payslip-field"><span>Lordo</span><input id="payslipLordo" type="text" inputmode="decimal" value="' + escapeHtml(formatEditorDecimal(draft.lordo || 0)) + '"></label>' +
              '<label class="payslip-field"><span>Ore ordinarie</span><input id="payslipOrdinaryHours" type="text" inputmode="decimal" value="' + escapeHtml(formatEditorDecimal(draft.ordinaryHours || 0)) + '"></label>' +
              '<label class="payslip-field"><span>Straordinari</span><input id="payslipOvertimeHours" type="text" inputmode="decimal" value="' + escapeHtml(formatEditorDecimal(draft.overtimeHours || 0)) + '"></label>' +
              '<label class="payslip-field"><span>Ferie</span><input id="payslipFerieHours" type="text" inputmode="decimal" value="' + escapeHtml(formatEditorDecimal(draft.ferieHours || 0)) + '"></label>' +
              '<label class="payslip-field"><span>Permessi</span><input id="payslipPermessoHours" type="text" inputmode="decimal" value="' + escapeHtml(formatEditorDecimal(draft.permessoHours || 0)) + '"></label>' +
              '<label class="payslip-field"><span>Malattia</span><input id="payslipMalattiaHours" type="text" inputmode="decimal" value="' + escapeHtml(formatEditorDecimal(draft.malattiaHours || 0)) + '"></label>' +
              '<label class="payslip-field"><span>Giorni lavorati</span><input id="payslipWorkedDays" type="text" inputmode="numeric" value="' + escapeHtml(String(draft.workedDays || 0)) + '"></label>' +
              '<label class="payslip-field"><span>TFR</span><input id="payslipTfr" type="text" inputmode="decimal" value="' + escapeHtml(formatEditorDecimal(draft.tfr || 0)) + '"></label>' +
              '<label class="payslip-field payslip-field-full"><span>Testo estratto</span><textarea id="payslipSourceText" class="payslip-textarea" placeholder="Qui compare il testo letto dalla foto, così puoi controllarlo.">' + escapeHtml(draft.sourceText || '') + '</textarea></label>' +
            '</div><div class="payslip-actions-row"><button class="solid" data-save-payslip="1" ' + (state.payslipBusy ? 'disabled' : '') + '>Salva busta</button>' + (draft.id ? '<button class="ghost danger" data-delete-payslip="' + draft.id + '">Elimina</button>' : '') + '</div></div></div>' +
          '<div class="card"><div class="card-body"><div class="between"><div class="section-title" style="margin:0;">Confronto con GestOre</div><div class="small muted">' + getPayslipMonthLabel(draft) + '</div></div>' +
            (comparisons.length ? '<div class="payslip-compare-list">' + comparisons.map(function (row) { return '<div class="payslip-compare-row"><div><div class="payslip-compare-label">' + row.label + '</div><div class="small muted">App ' + row.app + row.unit + ' · Busta ' + row.slip + row.unit + '</div></div><div class="payslip-diff ' + (row.ok ? 'ok' : 'alert') + '">' + (row.ok ? 'OK' : ((row.diff > 0 ? '+' : '') + row.diff + row.unit)) + '</div></div>'; }).join('') + '</div>' : '<div class="small muted" style="margin-top:10px;">Carica una busta o compila i campi per vedere il confronto del mese.</div>') +
          '</div></div>' +
          '<div class="card"><div class="card-body"><div class="between"><div class="section-title" style="margin:0;">Archivio</div><div class="small muted">' + (state.payslips || []).length + ' salvate</div></div>' +
            ((state.payslips && state.payslips.length) ? '<div class="payslip-archive-list">' + archive + '</div>' : '<div class="small muted" style="margin-top:10px;">Ancora nessuna busta registrata.</div>') +
          '</div></div>' +
        '</div><input id="payslipFileInput" type="file" accept="image/*,application/pdf" hidden>';
    }

    function renderHome() {
      var now = new Date();
      var key = toISODate(now);
      var entry = getEntryForDate(now);
      var breakdown = getBreakdown(entry);
      var week = getWeekProgress(now);
      var monthStats = getMonthStats(state.currentMonth);
      var type = entry ? dayTypes[entry.type] : null;
      var dayLabel = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric' }).format(now);
      dayLabel = dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1);
      var statusText = entry ? currentHomeStatus(entry, breakdown) : 'Tocca per inserire la giornata';
      var todayTargetMinutes = Math.max(1, state.settings.dailyTarget * 60);
      var todayRemaining = Math.max(0, todayTargetMinutes - breakdown.total);
      var heroPercent = entry ? Math.min(100, (breakdown.total / todayTargetMinutes) * 100) : 0;
      if (entry && entry.type !== 'lavoro') heroPercent = 100;
      var weekTargetMinutes = Math.max(1, state.settings.weeklyTarget * 60);
      var weekRemaining = Math.max(0, weekTargetMinutes - week.totalMinutes);
      var monthAverageMinutes = monthStats.workedDays ? Math.round(monthStats.totalMinutes / monthStats.workedDays) : 0;
      var monthRecordedDays = monthStats.workedDays + monthStats.ferie + monthStats.malattia + monthStats.permesso + (monthStats.festivitaPagata || 0) + monthStats.riposo;
      var weekDays = getWeekDaysData(now);
      var weekEntriesCount = weekDays.filter(function (item) { return !!item.entry; }).length;
      var clampChartPercent = function (value) {
        var safe = Number(value);
        if (!Number.isFinite(safe)) return 0;
        return Math.max(0, Math.min(100, safe));
      };
      var formatDurationPadded = function (minutes) {
        var total = Math.max(0, Math.round(Number(minutes) || 0));
        return Math.floor(total / 60) + 'h ' + pad(total % 60) + 'm';
      };
      var buildProgressChartBackground = function (value, startColor, endColor, trackColor) {
        var safe = clampChartPercent(value);
        var sweep = (safe / 100) * 360;
        return 'conic-gradient(from -90deg, ' + startColor + ' 0deg, ' + endColor + ' ' + sweep.toFixed(2) + 'deg, ' + trackColor + ' ' + sweep.toFixed(2) + 'deg 360deg)';
      };
      var buildSegmentChartBackground = function (segments, trackColor) {
        var total = 0;
        var parts = [];
        var cursor = 0;
        (segments || []).forEach(function (segment) {
          total += Math.max(0, Number(segment.value) || 0);
        });
        if (!total) return 'conic-gradient(from -90deg, ' + trackColor + ' 0deg 360deg)';
        (segments || []).forEach(function (segment) {
          var value = Math.max(0, Number(segment.value) || 0);
          if (!value) return;
          var sweep = (value / total) * 360;
          var next = Math.min(360, cursor + sweep);
          parts.push(segment.color + ' ' + cursor.toFixed(2) + 'deg ' + next.toFixed(2) + 'deg');
          cursor = next;
        });
        if (cursor < 360) parts.push(trackColor + ' ' + cursor.toFixed(2) + 'deg 360deg');
        return 'conic-gradient(from -90deg, ' + parts.join(', ') + ')';
      };
      var headerMessage = '';
      var heroMessage = 'Tocca qui per registrare la giornata di oggi';
      if (entry) {
        if (isStateOnlyType(entry.type)) heroMessage = type.label + ' registrata per oggi';
        else if (breakdown.overtime > 0) heroMessage = 'Hai ' + formatDuration(breakdown.overtime) + ' di straordinario registrato';
        else if (todayRemaining > 0) heroMessage = 'Ti mancano ' + formatDuration(todayRemaining) + ' al target giornaliero';
        else heroMessage = 'Giornata completata';
      }
      var stateDayUi = entry && isStateOnlyType(entry.type) ? getHomeStateDayUi(entry.type, entry) : null;
      var heroInner = stateDayUi ? ('<div class="home-hero-panel is-state-day"><div class="hero-status-line"><span class="dot" style="background:' + (type ? type.dot : '#a78bfa') + '; width:10px; height:10px; margin-top:0;"></span><span>' + statusText + '</span></div>' +
        '<div class="hero-main-emoji">' + stateDayUi.emoji + '</div>' +
        '<div class="hero-state-copy">' + stateDayUi.title + '</div>' +
        '<div class="hero-state-sub">' + stateDayUi.message + '</div>' +
        '<div class="home-state-meta"><span class="home-meta-pill"><span class="home-meta-dot" style="background:' + (type ? type.dot : '#a78bfa') + '"></span>' + type.label + '</span>' + ((entry && entry.notes) ? '<span class="home-meta-pill state-soft">1 nota</span>' : '') + '</div>' +
        '<div class="home-accent-line"><div style="width:100%; background:linear-gradient(90deg, rgba(148,163,184,.85), rgba(139,92,246,.9)); box-shadow:none;"></div></div></div>') : ('<div class="home-hero-panel"><div class="hero-status-line"><span class="dot" style="background:' + (type ? type.dot : '#a78bfa') + '; width:10px; height:10px; margin-top:0;"></span><span>' + statusText + '</span></div>' +
        '<div class="hero-main-value">' + (entry ? formatDuration(breakdown.total) : '--') + '</div>' +
        '<div class="hero-tip">' + heroMessage + '</div>' +
        '<div class="home-meta"><span class="home-meta-pill"><span class="home-meta-dot" style="background:' + (type ? type.dot : '#a78bfa') + '"></span>' + (type ? type.label : 'Da compilare') + '</span>' +
        (entry ? ('<span class="home-meta-pill">' + (entry.start || '--:--') + ' → ' + (entry.end || '--:--') + '</span>') : '') +
        (entry && entry.breakHours ? ('<span class="home-meta-pill">Pausa ' + formatHourValue(entry.breakHours) + '</span>') : '') + '</div>' +
        '<div class="home-accent-line"><div style="width:' + heroPercent + '%;"></div></div>' +
        '<div class="home-kpis"><div class="home-kpi"><div class="home-kpi-value">' + (entry ? formatHourValue(minutesToHours(breakdown.normal)) : '--') + '</div><div class="home-kpi-label">Normali</div></div>' +
        '<div class="home-kpi"><div class="home-kpi-value">' + (entry ? formatHourValue(minutesToHours(breakdown.overtime)) : '--') + '</div><div class="home-kpi-label">Extra</div></div>' +
        '<div class="home-kpi"><div class="home-kpi-value">' + (entry && breakdown.leave ? formatHourValue(minutesToHours(breakdown.leave)) : (entry && entry.notes ? 1 : 0)) + '</div><div class="home-kpi-label">' + (entry && entry.type === 'lavoro_ferie' ? 'Ferie' : 'Note') + '</div></div></div></div>');
      var todayInsightValue = !entry ? formatDuration(todayTargetMinutes) : (isStateOnlyType(entry.type) ? type.label : (todayRemaining > 0 ? formatDuration(todayRemaining) : 'Ok'));
      var todayInsightSub = !entry ? 'target di oggi' : (isStateOnlyType(entry.type) ? 'giornata segnata' : (todayRemaining > 0 ? 'mancano al target' : 'giornata completa'));
      var monthAverageValue = monthStats.workedDays ? formatHourValue(minutesToHours(monthAverageMinutes)) : '--';
      var weekGoalSub = weekRemaining > 0 ? (formatDuration(weekRemaining) + ' per chiudere la settimana') : 'target già superato';
      var weekSummarySub = 'su ' + formatHourValue(state.settings.weeklyTarget) + ' target';
      var monthSummarySub = monthStats.workedDays ? (monthStats.overtimeMinutes > 0 ? (formatDuration(monthStats.overtimeMinutes) + ' extra · ' + monthStats.workedDays + ' giorni') : (monthStats.workedDays + ' giorni segnati')) : 'Nessun giorno salvato';
      var monthAverageSub = monthStats.workedDays ? 'media per giorno' : 'nessun dato';
      var registeredSub = weekEntriesCount === 1 ? 'giorno salvato' : 'giorni salvati';
      var weekBadgeLabel = Math.round(clampChartPercent(week.percent)) + '%';
      var weekMetaLabel = weekRemaining > 0 ? (formatDuration(weekRemaining) + ' mancanti') : 'Target chiuso';
      var monthBadgeLabel = String(monthRecordedDays || 0) + ' gg';
      var monthMetaLabel = monthStats.workedDays ? (monthAverageValue + ' media') : 'Nessuna media';
      var weekDeltaLabel = weekRemaining > 0 ? 'Mancano' : 'Extra';
      var weekDeltaValue = weekRemaining > 0 ? formatDuration(weekRemaining) : formatDuration(Math.max(0, week.totalMinutes - weekTargetMinutes));
      var monthOvertimeValue = monthStats.overtimeMinutes > 0 ? formatDuration(monthStats.overtimeMinutes) : '--';
      var weekChartBackground = buildProgressChartBackground(week.percent, '#7dd3fc', '#8b5cf6', 'rgba(255,255,255,.08)');
      var monthChartSegments = [
        { label: 'Lavoro', value: monthStats.workedDays, color: dayTypes.lavoro.dot },
        { label: 'Ferie', value: monthStats.ferie, color: dayTypes.ferie.dot },
        { label: 'Malattia', value: monthStats.malattia, color: dayTypes.malattia.dot },
        { label: 'Permesso', value: monthStats.permesso, color: dayTypes.permesso.dot },
        { label: 'Festivi', value: monthStats.festivitaPagata || 0, color: dayTypes.festivita_pagata.dot },
        { label: 'Riposi', value: monthStats.riposo, color: dayTypes.riposo.dot }
      ].filter(function (segment) { return segment.value > 0; });
      var monthChartBackground = buildSegmentChartBackground(monthChartSegments, 'rgba(255,255,255,.08)');
      var monthLegendHtml = monthChartSegments.length
        ? monthChartSegments.slice().sort(function (a, b) { return b.value - a.value; }).slice(0, 3).map(function (segment) {
            return '<span class="mini-legend-chip"><span class="mini-legend-dot" style="background:' + segment.color + '"></span>' + segment.label + ' ' + segment.value + '</span>';
          }).join('')
        : '<div class="chart-empty-note">Nessun giorno segnato per ora.</div>';
      monthSummarySub = monthRecordedDays ? (monthStats.overtimeMinutes > 0 ? (formatDuration(monthStats.overtimeMinutes) + ' extra · ' + monthRecordedDays + ' giorni') : (monthRecordedDays + ' giorni segnati')) : 'Nessun giorno salvato';
      var todayDisplayMinutes = entry && isStateOnlyType(entry.type) ? breakdown.covered : breakdown.total;
      var ordinaryDisplayMinutes = entry && isStateOnlyType(entry.type) ? breakdown.leave : breakdown.normal;
      var ordinaryLabel = entry && isStateOnlyType(entry.type) ? 'Coperte' : 'Normali';
      var isRestDay = entry && entry.type === 'riposo';
      var dayPrimaryText = entry ? formatDurationPadded(todayDisplayMinutes) : '0h 00m';
      var ordinaryText = entry ? formatDurationPadded(ordinaryDisplayMinutes) : '--';
      var overtimeText = entry ? formatDurationPadded(breakdown.overtime) : '--';
      var pauseMinutes = entry ? Math.round(parseDecimalInput(entry.breakHours || 0, 0) * 60) : 0;
      var pauseText = entry ? formatDurationPadded(pauseMinutes) : '--';
      var breakText = entry
        ? (isStateOnlyType(entry.type) ? (type ? type.label : 'Giornata') : (formatHourValue(entry.breakHours || 0) + ' pausa'))
        : 'Pausa --';
      var weekPercentRaw = (week.totalMinutes / weekTargetMinutes) * 100;
      var weekPercentValue = Math.round(Math.max(0, weekPercentRaw));
      var weekProgressStyle = clampChartPercent(weekPercentRaw).toFixed(2) + '%';
      var workdayIndexes = normalizeWeekdayList(state.settings.workdays || []);
      var todayWeekIndex = mondayIndex(now.getDay());
      var remainingWorkdays = workdayIndexes.filter(function (idx) { return idx > todayWeekIndex; }).length;
      var weekMissingTitle = weekRemaining > 0 ? ('Ti mancano <span>' + formatDuration(weekRemaining) + '</span>') : 'Target completato';
      var weekMissingSub = weekRemaining > 0 ? (remainingWorkdays + ' giorni rimasti') : 'Settimana in positivo';
      var weekOvertime = Math.max(0, week.totalMinutes - weekTargetMinutes);
      var weekResultTitle = weekRemaining > 0
        ? (formatDuration(weekRemaining) + ' mancanti')
        : (weekOvertime > 0 ? ('+' + formatDuration(weekOvertime) + ' oltre') : 'Target raggiunto');
      var weekResultSub = weekRemaining > 0
        ? (remainingWorkdays + (remainingWorkdays === 1 ? ' giorno lavorativo rimasto' : ' giorni lavorativi rimasti'))
        : (weekEntriesCount + (weekEntriesCount === 1 ? ' giorno registrato' : ' giorni registrati'));
      var weekDayMaximum = weekDays.reduce(function (maximum, item) {
        return Math.max(maximum, item.minutes || 0);
      }, todayTargetMinutes);
      var weekBarsHtml = weekDays.map(function (item) {
        var itemType = item.entry && dayTypes[item.entry.type] ? dayTypes[item.entry.type] : null;
        var fill = item.minutes > 0 ? clampChartPercent((item.minutes / Math.max(1, weekDayMaximum)) * 100) : 0;
        var value = item.minutes ? formatHourValue(minutesToHours(item.minutes)) : (item.entry ? 'Segn.' : '--');
        var color = itemType ? itemType.dot : 'rgba(116, 134, 177, .28)';
        return '<button class="go-week-day-v3' + (item.isToday ? ' is-today' : '') + (item.entry ? ' has-entry' : '') + '" data-open-date="' + item.key + '" style="--go-week-fill:' + fill.toFixed(2) + '%;--go-week-color:' + color + '" aria-label="' + escapeHtml(item.label + ': ' + value) + '">' +
          '<span class="go-week-day-value-v3">' + value + '</span>' +
          '<span class="go-week-bar-v3"><i></i><b></b></span>' +
          '<strong>' + escapeHtml(item.label.slice(0, 3)) + '</strong>' +
        '</button>';
      }).join('');
      var monthNormalMinutes = monthStats.normalMinutes || Math.max(0, monthStats.totalMinutes - (monthStats.overtimeMinutes || 0));
      var monthOvertimeMinutes = Math.max(0, monthStats.overtimeMinutes || 0);
      var monthHoursTotal = Math.max(0, monthNormalMinutes + monthOvertimeMinutes);
      var monthNormalShare = monthHoursTotal ? Math.round((monthNormalMinutes / monthHoursTotal) * 100) : 0;
      var monthOvertimeShare = monthHoursTotal ? 100 - monthNormalShare : 0;
      var monthHoursChartBackground = buildSegmentChartBackground([
        { value: monthNormalMinutes, color: '#59c8ff' },
        { value: monthOvertimeMinutes, color: '#9863ff' }
      ], 'rgba(255,255,255,.075)');
      var monthNormalValue = formatDuration(monthNormalMinutes);
      var monthPermessoValue = (monthStats.permesso || 0) + ' gg';
      var monthActivityHtml = monthChartSegments.length
        ? monthChartSegments.slice().sort(function (a, b) { return b.value - a.value; }).slice(0, 3).map(function (segment) {
            return '<span><i style="background:' + segment.color + '"></i>' + escapeHtml(segment.label) + ' <strong>' + segment.value + '</strong></span>';
          }).join('') + (monthChartSegments.length > 3 ? '<span class="is-more">+' + (monthChartSegments.length - 3) + '</span>' : '')
        : '<span class="is-empty">Nessun giorno registrato</span>';
      var dayMainLabel = isRestDay ? 'Giornata di riposo' : 'Totale lavorato oggi';
      var dayTargetCopy = 'su <strong>' + formatHourValue(state.settings.dailyTarget) + '</strong> previste';
      if (!entry) dayTargetCopy = 'tocca per inserire la giornata';
      if (entry && isStateOnlyType(entry.type)) dayTargetCopy = 'Giornata segnata';
      if (isRestDay) dayTargetCopy = 'Nessun turno previsto';
      var daySummaryClass = !entry ? ' is-empty-summary' : (stateDayUi ? (' is-state-summary' + (isRestDay ? ' is-rest-summary' : '')) : ' is-work-summary');
      var dayTitleLabel = dayLabel.replace(/\s+\d+\s*$/, '');
      var fullDateLabel = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }).format(now);
      var hideCoveredHoursForState = entry && ['ferie', 'malattia', 'riposo'].indexOf(entry.type) !== -1;
      var stateCoveredText = !hideCoveredHoursForState && todayDisplayMinutes > 0 ? (formatDurationPadded(todayDisplayMinutes) + ' coperte') : '';
      var stateFacts = [];
      if (stateCoveredText) stateFacts.push('<span class="go-state-fact">' + icons.clock + '<span>' + stateCoveredText + '</span></span>');
      if (entry && entry.notes) stateFacts.push('<span class="go-state-fact">' + icons.note + '<span>Nota presente</span></span>');
      var stateFactsHtml = stateFacts.length ? ('<div class="go-state-facts">' + stateFacts.join('') + '</div>') : '';
      var dayCardContent = stateDayUi
        ? ('<div class="go-state-hero">' +
            '<div class="go-state-emoji-shell"><span class="go-state-emoji" aria-hidden="true">' + stateDayUi.emoji + '</span></div>' +
            '<div class="go-state-eyebrow">' + escapeHtml(type ? type.label : 'Giornata') + '</div>' +
            '<div class="go-state-title">' + escapeHtml(stateDayUi.title) + '</div>' +
            '<div class="go-state-message">' + escapeHtml(stateDayUi.message) + '</div>' +
          '</div>' +
          stateFactsHtml)
        : ('<div class="go-hero-core">' +
            '<div class="go-label">' + dayMainLabel + '</div>' +
            '<div class="go-total-number">' + dayPrimaryText + '</div>' +
            '<div class="go-day-target-copy">' + dayTargetCopy + '</div>' +
          '</div>' +
          '<div class="go-stat-column">' +
            '<div class="go-stat-row go-stat-blue"><span class="go-stat-icon">' + icons.briefcase + '</span><span><em>' + ordinaryLabel + '</em><strong>' + ordinaryText + '</strong></span></div>' +
            '<div class="go-stat-row go-stat-violet"><span class="go-stat-icon">' + icons.activity + '</span><span><em>Extra</em><strong>' + overtimeText + '</strong></span></div>' +
            '<div class="go-stat-row go-stat-orange"><span class="go-stat-icon">' + icons.coffee + '</span><span><em>Pausa</em><strong>' + pauseText + '</strong></span></div>' +
          '</div>');
      return '<div class="top home-top gestore-static-top go-home-logo"><div class="gestore-static-title" aria-label="GestOre"><span class="gestore-word gestore-word-main">Gest</span><span class="gestore-word gestore-word-accent">Ore</span></div></div>' +
        '<div class="stack home-stack go-home-stack">' +
          '<button class="go-card go-day-card go-day-card-v2' + daySummaryClass + '" data-day-type="' + (entry ? escapeHtml(entry.type) : 'empty') + '" data-open-date="' + key + '">' +
            '<div class="go-day-head"><div class="go-day-title">' + dayTitleLabel + '</div><div class="go-day-date">' + fullDateLabel + '</div></div>' +
            dayCardContent +
          '</button>' +
          '<section class="go-card go-analytics-card go-analysis-card-v3 go-week-card">' +
            '<div class="go-card-head go-analysis-head-v3"><div><div class="go-kicker">Settimana</div><div class="go-card-title">Ritmo settimanale</div></div><div class="go-card-badge">' + weekPercentValue + '%</div></div>' +
            '<div class="go-week-summary-v3">' +
              '<div class="go-week-total-v3"><span>ORE REGISTRATE</span><strong>' + formatDuration(week.totalMinutes) + '</strong><small>su ' + formatHourValue(state.settings.weeklyTarget) + ' di target</small></div>' +
              '<div class="go-week-result-v3' + (weekRemaining > 0 ? '' : ' is-complete') + '"><span>' + (weekRemaining > 0 ? icons.target : icons.check) + '</span><div><strong>' + weekResultTitle + '</strong><small>' + weekResultSub + '</small></div></div>' +
            '</div>' +
            '<div class="go-week-progress-v3"><span style="width:' + weekProgressStyle + '"></span></div>' +
            '<div class="go-week-chart-v3" aria-label="Ore registrate nei sette giorni della settimana">' + weekBarsHtml + '</div>' +
            '<button class="go-analytics-link-v3" data-tab="stats"><span>Apri analisi settimana</span>' + icons.right + '</button>' +
          '</section>' +
          '<section class="go-card go-analytics-card go-analysis-card-v3 go-month-card">' +
            '<div class="go-card-head go-analysis-head-v3"><div><div class="go-kicker">Mese</div><div class="go-card-title">Composizione ore</div></div><div class="go-card-badge">' + monthBadgeLabel + '</div></div>' +
            '<div class="go-month-overview-v3">' +
              '<div class="go-month-ring-v3" style="background:' + monthHoursChartBackground + '"><div><strong>' + formatDuration(monthStats.totalMinutes) + '</strong><span>totali</span></div></div>' +
              '<div class="go-month-breakdown-v3">' +
                '<div class="go-month-metric-v3 is-normal"><div><span><i></i>Ordinarie</span><strong>' + monthNormalValue + '</strong></div><div class="go-month-share-v3"><span style="width:' + monthNormalShare + '%"></span></div><small>' + monthNormalShare + '% del totale</small></div>' +
                '<div class="go-month-metric-v3 is-extra"><div><span><i></i>Straordinarie</span><strong>' + formatDuration(monthOvertimeMinutes) + '</strong></div><div class="go-month-share-v3"><span style="width:' + monthOvertimeShare + '%"></span></div><small>' + monthOvertimeShare + '% del totale</small></div>' +
              '</div>' +
            '</div>' +
            '<div class="go-month-footer-v3"><div><span>MEDIA GIORNO</span><strong>' + monthAverageValue + '</strong></div><div class="go-month-activity-v3">' + monthActivityHtml + '</div></div>' +
            '<button class="go-analytics-link-v3" data-tab="stats"><span>Apri analisi mese</span>' + icons.right + '</button>' +
          '</section>' +
        '</div>';
      headerMessage = '';
      return '<div class="top home-top gestore-static-top"><div class="gestore-static-title" aria-label="GestOre"><span class="gestore-word gestore-word-main">Gest</span><span class="gestore-word gestore-word-accent">Ore</span></div></div>' +
        '<div class="stack home-stack">' +
          '<div class="card home-hero"><div class="card-body">' +
            '<div class="home-hero-head"><div class="home-hero-day">' + dayLabel + '</div>' + (headerMessage ? '<div class=\"hero-topline\">' + headerMessage + '</div>' : '') + '</div>' +
            '<button class="btn home-hero-btn" data-open-date="' + key + '">' + heroInner + '</button></div></div>' +
          '<div class="home-summary">' +
            '<div class="summary-card visual-widget visual-widget-week">' +
              '<div class="visual-widget-top"><div><div class="visual-widget-kicker">Settimana</div><div class="visual-widget-title">Ore e target</div></div><div class="visual-widget-note">' + formatHourValue(state.settings.weeklyTarget) + '</div></div>' +
              '<div class="visual-widget-body">' +
                '<div class="mini-donut" style="background:' + weekChartBackground + ';"><div class="mini-donut-inner"><strong>' + weekBadgeLabel + '</strong><span>target</span></div></div>' +
                '<div class="visual-widget-copy"><div class="visual-widget-value">' + formatDuration(week.totalMinutes) + '</div><div class="visual-widget-sub">' + weekSummarySub + '</div></div>' +
              '</div>' +
              '<div class="visual-widget-stats"><div class="visual-stat"><span>' + weekDeltaLabel + '</span><strong>' + weekDeltaValue + '</strong></div><div class="visual-stat"><span>Giorni</span><strong>' + weekEntriesCount + '</strong></div></div>' +
            '</div>' +
            '<div class="summary-card visual-widget visual-widget-month">' +
              '<div class="visual-widget-top"><div><div class="visual-widget-kicker">Mese</div><div class="visual-widget-title">Composizione</div></div><div class="visual-widget-note">' + monthBadgeLabel + '</div></div>' +
              '<div class="visual-widget-body">' +
                '<div class="mini-donut" style="background:' + monthChartBackground + ';"><div class="mini-donut-inner"><strong>' + (monthRecordedDays || 0) + '</strong><span>giorni</span></div></div>' +
                '<div class="visual-widget-copy"><div class="visual-widget-value">' + formatDuration(monthStats.totalMinutes) + '</div><div class="visual-widget-sub">' + monthSummarySub + '</div></div>' +
              '</div>' +
              '<div class="mini-legend-row">' + monthLegendHtml + '</div>' +
              '<div class="visual-widget-stats"><div class="visual-stat"><span>Media</span><strong>' + monthAverageValue + '</strong></div><div class="visual-stat"><span>Straord.</span><strong>' + monthOvertimeValue + '</strong></div></div>' +
            '</div>' +
          '</div>' +
          '<div class="card week-overview-card"><div class="card-body compact"><div class="week-card-head"><div class="home-section-title">Settimana</div></div><div class="week-strip">' + weekDays.map(function (item) {
            var fill = item.entry ? Math.max(16, Math.min(100, (item.minutes / todayTargetMinutes) * 100)) : 0;
            var footer = '—';
            var dotColor = 'rgba(255,255,255,.14)';
            if (item.entry) {
              dotColor = dayTypes[item.entry.type] ? dayTypes[item.entry.type].dot : '#a78bfa';
              footer = item.minutes ? formatHourValue(minutesToHours(item.minutes)) : 'Segn.';
            }
            return '<button class="week-day-card ' + (item.isToday ? 'today' : '') + '" data-open-date="' + item.key + '"><div><div class="week-day-name">' + item.label + '</div><span class="week-day-dot" style="background:' + dotColor + '"></span></div><div class="week-day-bar"><div style="height:' + fill + '%;"></div></div><div class="week-day-value">' + footer + '</div></button>';
          }).join('') + '</div></div></div>' +
        '</div>';
    }

    


var homeMorphController = null;
function initHomeTitleMorph() {
  if (homeMorphController && homeMorphController.destroy) {
    homeMorphController.destroy();
    homeMorphController = null;
  }

  var container = document.getElementById('homeMorphTitle');
  var textA = document.getElementById('homeMorphTextA');
  var textB = document.getElementById('homeMorphTextB');
  if (!container || !textA || !textB) return;

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var destroyed = false;
  var cycleTimer = null;
  var measureNode = null;
  var stateKey = 'a';
  var holdMs = 4300;
  var morphMs = 1550;

  function clearTimers() {
    if (cycleTimer) {
      window.clearTimeout(cycleTimer);
      cycleTimer = null;
    }
  }

  function getMeasureNode() {
    if (measureNode && document.body.contains(measureNode)) return measureNode;
    measureNode = document.createElement('span');
    measureNode.setAttribute('aria-hidden', 'true');
    measureNode.style.cssText = 'position:fixed;left:-9999px;top:-9999px;visibility:hidden;white-space:nowrap;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display",Inter,"Segoe UI",sans-serif;font-weight:800;letter-spacing:-0.05em;line-height:1;pointer-events:none;';
    document.body.appendChild(measureNode);
    return measureNode;
  }

  function getWords() {
    return ['GestOre', getDynamicWelcomeLabel()];
  }

  function fitFontSize(words) {
    var wrap = container.parentElement || container;
    var available = Math.max(220, Math.floor((wrap.clientWidth || container.clientWidth || window.innerWidth || 320) - 12));
    var node = getMeasureNode();
    var size = Math.min(50, Math.max(32, Math.floor((window.innerWidth || 390) * 0.105)));
    for (; size >= 30; size -= 1) {
      node.style.fontSize = size + 'px';
      var maxWidth = 0;
      for (var i = 0; i < words.length; i++) {
        node.textContent = words[i] || '';
        maxWidth = Math.max(maxWidth, Math.ceil(node.getBoundingClientRect().width));
      }
      if (maxWidth <= available) break;
    }
    size = Math.max(30, size);
    textA.style.fontSize = size + 'px';
    textB.style.fontSize = size + 'px';
  }

  function setWords() {
    var words = getWords();
    textA.textContent = words[0];
    textB.textContent = words[1];
    fitFontSize(words);
  }

  function applyState(nextState) {
    stateKey = nextState === 'b' ? 'b' : 'a';
    container.classList.remove('morph-state-a', 'morph-state-b', 'morph-static', 'morph-v2', 'morphing');
    container.classList.add('morph-clean');
    container.classList.add(stateKey === 'b' ? 'morph-state-b' : 'morph-state-a');
    textA.style.visibility = 'visible';
    textB.style.visibility = 'visible';
    container.style.visibility = 'visible';
  }

  function scheduleNext() {
    if (destroyed || reduceMotion) return;
    cycleTimer = window.setTimeout(function () {
      if (destroyed) return;
      setWords();
      applyState(stateKey === 'a' ? 'b' : 'a');
      scheduleNext();
    }, holdMs + morphMs);
  }

  function restart() {
    if (destroyed) return;
    clearTimers();
    setWords();
    applyState('a');
    scheduleNext();
  }

  var onVisibility = function () {
    if (!document.hidden) restart();
  };
  var onResize = function () {
    restart();
  };

  document.addEventListener('visibilitychange', onVisibility, { passive: true });
  window.addEventListener('orientationchange', onResize, { passive: true });
  window.addEventListener('resize', onResize, { passive: true });

  setWords();
  if (reduceMotion) {
    applyState('a');
    container.classList.add('morph-static');
  } else {
    restart();
  }

  homeMorphController = {
    destroy: function () {
      destroyed = true;
      clearTimers();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('orientationchange', onResize);
      window.removeEventListener('resize', onResize);
      if (measureNode && measureNode.parentNode) measureNode.parentNode.removeChild(measureNode);
      container.classList.remove('morph-clean', 'morph-state-a', 'morph-state-b', 'morph-static', 'morph-v2', 'morphing');
    }
  };
}

function renderCalendar() {

      var todayKey = toISODate(new Date());
      var grid = buildMonthGrid(state.currentMonth);
      var stats = getMonthStats(state.currentMonth);
      var recordedDays = stats.workedDays + stats.ferie + stats.malattia + stats.permesso + (stats.festivitaPagata || 0) + stats.riposo;
      return '<div class="month-page-top"><div><span>GESTIONE MENSILE</span><h1>Calendario</h1></div><div class="month-page-switch"><button data-calendar-prev="1" aria-label="Mese precedente">' + icons.left + '</button><strong>' + formatMonthYear(state.currentMonth) + '</strong><button data-calendar-next="1" aria-label="Mese successivo">' + icons.right + '</button></div></div>' +
        '<div class="stack">' +
          '<div class="card calendar-month-card"><div class="card-body compact">' +
            '<div class="week-grid">' + weekNames.map(function (n) { return '<div class="weekday">' + n + '</div>'; }).join('') + '</div>' +
            '<div class="calendar-grid">' + grid.map(function (date) {
              var key = toISODate(date);
              var entry = getEntryForDate(date);
              var isCurrent = date.getMonth() === state.currentMonth.getMonth();
              var isToday = key === todayKey;
              return '<button class="cell ' + (!isCurrent ? 'out' : '') + ' ' + (isToday ? 'today' : '') + '" data-open-date="' + key + '"><span>' + date.getDate() + '</span>' + (entry ? ('<span class="dot" style="background:' + ((dayTypes[entry.type] && dayTypes[entry.type].dot) ? dayTypes[entry.type].dot : '#a78bfa') + ';"></span>') : '') + '</button>';
            }).join('') + '</div>' +
          '</div></div>' +
          '<div class="card"><div class="card-body"><div class="two">' +
            '<div class="mini center"><div class="big">' + formatDuration(stats.totalMinutes) + '</div><div class="small muted">Ore mese</div></div>' +
            '<div class="mini center"><div class="big">' + recordedDays + '</div><div class="small muted">Giorni segnati</div></div>' +
          '</div></div></div>' +
          '<div class="card"><div class="card-body"><div class="section-title" style="margin-top:0">Legenda</div><div class="legend-grid">' +
            Object.keys(dayTypes).map(function (key) { return '<div class="legend-item"><span class="legend-dot" style="background:' + dayTypes[key].dot + '"></span><span>' + dayTypes[key].label + '</span></div>'; }).join('') +
          '</div></div></div>' +
        '</div>';
    }


    function formatShortDateLabel(dateKey) {
      if (!dateKey) return '--';
      var d = new Date(dateKey + 'T00:00:00');
      return new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' }).format(d).replace('.', '');
    }
    function formatClockFromMinutes(totalMinutes) {
      if (totalMinutes === null || totalMinutes === undefined || !Number.isFinite(totalMinutes)) return '--:--';
      var value = Math.max(0, Number(totalMinutes) || 0);
      var hours = Math.floor(value / 60) % 24;
      var minutes = Math.round(value % 60);
      return pad(hours) + ':' + pad(minutes);
    }
    function getMonthFocus(date) {
      var arr = getMonthEntries(date).sort(function (a, b) { return a[0].localeCompare(b[0]); });
      var longest = null, overtimePeak = null, firstStart = null, lastEnd = null;
      arr.forEach(function (pair) {
        var key = pair[0], e = pair[1], breakdown = getBreakdown(e);
        if (breakdown.total > 0 && (!longest || breakdown.total > longest.minutes)) longest = { key: key, minutes: breakdown.total };
        if (breakdown.overtime > 0 && (!overtimePeak || breakdown.overtime > overtimePeak.minutes)) overtimePeak = { key: key, minutes: breakdown.overtime };
        var startMinutes = parseTimeToMinutes(e && e.start);
        if (startMinutes !== null && (!firstStart || startMinutes < firstStart.minutes)) firstStart = { key: key, minutes: startMinutes };
        var endMinutes = parseTimeToMinutes(e && e.end);
        if (endMinutes !== null && (!lastEnd || endMinutes > lastEnd.minutes)) lastEnd = { key: key, minutes: endMinutes };
      });
      return { longest: longest, overtimePeak: overtimePeak, firstStart: firstStart, lastEnd: lastEnd };
    }
    function getMonthWeekBlocks(date) {
      var first = new Date(date.getFullYear(), date.getMonth(), 1);
      var last = new Date(date.getFullYear(), date.getMonth() + 1, 0);
      var cursor = new Date(first);
      var blocks = [];
      while (cursor <= last) {
        var blockStart = new Date(cursor);
        var daysLeftInWeek = 7 - mondayIndex(blockStart.getDay());
        var daysLeftInMonth = last.getDate() - blockStart.getDate() + 1;
        var blockLength = Math.min(daysLeftInWeek, daysLeftInMonth);
        var blockEnd = new Date(blockStart);
        blockEnd.setDate(blockStart.getDate() + blockLength - 1);
        var minutes = 0;
        var normalMinutes = 0;
        var overtimeMinutes = 0;
        var coveredMinutes = 0;
        var workedDays = 0;
        for (var i = 0; i < blockLength; i += 1) {
          var current = new Date(blockStart);
          current.setDate(blockStart.getDate() + i);
          var entry = getEntryForDate(current);
          var breakdown = getBreakdown(entry);
          minutes += breakdown.total;
          normalMinutes += breakdown.normal;
          overtimeMinutes += breakdown.overtime;
          coveredMinutes += breakdown.covered;
          if (entry) workedDays += 1;
        }
        blocks.push({
          label: blockStart.getDate() === blockEnd.getDate() ? String(blockStart.getDate()) : (blockStart.getDate() + '–' + blockEnd.getDate()),
          minutes: minutes,
          normalMinutes: normalMinutes,
          overtimeMinutes: overtimeMinutes,
          coveredMinutes: coveredMinutes,
          workedDays: workedDays,
          startKey: toISODate(blockStart),
          endKey: toISODate(blockEnd)
        });
        cursor = new Date(blockEnd);
        cursor.setDate(blockEnd.getDate() + 1);
      }
      return blocks;
    }

    function getMonthActivityCells(date) {
      var todayKey = toISODate(new Date());
      var targetMinutes = Math.max(1, state.settings.dailyTarget * 60);
      return buildMonthGrid(date).map(function (current) {
        var key = toISODate(current);
        var entry = getEntryForDate(current);
        var breakdown = getBreakdown(entry);
        var sameMonth = current.getMonth() === date.getMonth();
        var level = 0;
        var meta = '';
        var typeClass = '';
        if (entry && entry.type && entry.type !== 'lavoro') {
          level = 2;
          typeClass = ' type-' + entry.type;
          if (entry.type === 'ferie') meta = 'Fe';
          else if (entry.type === 'malattia') meta = 'Ma';
          else if (entry.type === 'permesso') meta = 'Pe';
          else if (entry.type === 'festivita_pagata') meta = 'FP';
          else if (entry.type === 'riposo') meta = 'Ri';
        } else if (breakdown.total > 0) {
          var ratio = breakdown.total / targetMinutes;
          level = ratio >= 1 ? 4 : (ratio >= .75 ? 3 : (ratio >= .4 ? 2 : 1));
          meta = formatHourValue(minutesToHours(breakdown.total));
        }
        return {
          key: key,
          day: current.getDate(),
          sameMonth: sameMonth,
          level: level,
          typeClass: typeClass,
          meta: meta,
          isToday: key === todayKey
        };
      });
    }

    function formatVacationDayValue(value) {
      var rounded = Math.round((Number(value) || 0) * 10) / 10;
      return String(rounded).replace('.', ',');
    }

    function getVacationDetailsForYear(year) {
      var selectedYear = Number(year) || new Date().getFullYear();
      var dailyMinutes = Math.max(1, getVacationBalanceForYear(selectedYear).dailyMinutes);
      return Object.keys(state.entries || {}).filter(function (key) {
        var entry = state.entries[key];
        return key.slice(0, 4) === String(selectedYear) && entry && (entry.type === 'ferie' || entry.type === 'lavoro_ferie');
      }).map(function (key) {
        var entry = state.entries[key];
        var minutes = getBreakdown(entry).leave;
        if (!minutes && entry.type === 'ferie') minutes = dailyMinutes;
        return { key: key, entry: entry, minutes: Math.max(0, minutes) };
      }).sort(function (a, b) { return b.key.localeCompare(a.key); });
    }

    function renderVacationCard(balance) {
      var hasAllowance = balance.allowanceDays > 0;
      var isOver = hasAllowance && balance.overMinutes > 0;
      var mainDays = isOver ? (balance.overMinutes / balance.dailyMinutes) : balance.remainingDays;
      var mainValue = hasAllowance ? formatVacationDayValue(mainDays) : '--';
      var mainLabel = isOver ? 'giorni oltre il saldo' : (hasAllowance ? 'giorni disponibili' : 'imposta il totale annuale');
      var usedLabel = formatVacationDayValue(balance.usedDays);
      var allowanceLabel = hasAllowance ? formatVacationDayValue(balance.allowanceDays) : '--';
      var status = state.vacationStatus ? '<div class="vacation-card-status">' + escapeHtml(state.vacationStatus) + '</div>' : '';
      return '<section class="card vacation-card"><div class="card-body vacation-card-body">' +
        '<div class="vacation-card-head"><div class="vacation-card-heading"><span class="vacation-card-icon">' + icons.umbrella + '</span><div><div class="vacation-kicker">FERIE ' + balance.year + '</div><div class="vacation-card-title">Disponibilita</div></div></div><button class="vacation-manage" data-open-vacation-allowance="' + balance.year + '">Modifica</button></div>' +
        '<div class="vacation-balance' + (isOver ? ' is-over' : '') + '">' +
          '<div class="vacation-balance-main"><strong>' + mainValue + '</strong><span>' + mainLabel + '</span></div>' +
          '<div class="vacation-progress-copy"><strong>' + balance.percent + '%</strong><span>' + (hasAllowance ? 'utilizzato' : 'da impostare') + '</span></div>' +
        '</div>' +
        '<div class="vacation-track"><span style="width:' + balance.percent + '%"></span></div>' +
        '<div class="vacation-metrics">' +
          '<button data-open-vacation-history="' + balance.year + '"><span>Usate</span><strong>' + usedLabel + ' gg</strong><small>Apri il dettaglio</small>' + icons.right + '</button>' +
          '<div><span>Totale anno</span><strong>' + allowanceLabel + (hasAllowance ? ' gg' : '') + '</strong><small>' + (hasAllowance ? 'Disponibilita impostata' : 'Non ancora impostato') + '</small></div>' +
        '</div>' +
        status +
        '<button class="vacation-add-button" data-open-vacation-range="' + balance.year + '"><span><strong>Inserisci un periodo di ferie</strong><small>Weekend e festivi esclusi automaticamente</small></span>' + icons.right + '</button>' +
      '</div></section>';
    }

    function renderVacationScreen() {
      var year = Number(state.vacationScreenYear) || new Date().getFullYear();
      var balance = getVacationBalanceForYear(year);
      var details = getVacationDetailsForYear(year);
      var hasAllowance = balance.allowanceDays > 0;
      var over = hasAllowance && balance.overMinutes > 0;
      var remainingValue = hasAllowance ? formatVacationDayValue(over ? (balance.overMinutes / balance.dailyMinutes) : balance.remainingDays) : '--';
      var remainingLabel = over ? 'giorni oltre il saldo' : (hasAllowance ? 'giorni disponibili' : 'imposta il saldo annuale');
      var recentRows = details.slice(0, 4).map(function (item) {
        var date = parseLocalDateKey(item.key);
        var dayLabel = date ? new Intl.DateTimeFormat('it-IT', { weekday: 'long' }).format(date) : item.key;
        var fullDate = date ? new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long' }).format(date) : item.key;
        var typeLabel = item.entry.type === 'lavoro_ferie' ? 'Ferie parziali' : 'Giornata intera';
        return '<button class="vacation-page-history-row" data-open-vacation-date="' + item.key + '">' +
          '<span class="vacation-page-history-date"><strong>' + (date ? date.getDate() : '--') + '</strong><small>' + escapeHtml(date ? new Intl.DateTimeFormat('it-IT', { month: 'short' }).format(date).replace('.', '') : '') + '</small></span>' +
          '<span class="vacation-page-history-copy"><strong>' + escapeHtml(dayLabel) + '</strong><small>' + escapeHtml(fullDate + ' · ' + typeLabel) + '</small></span>' +
          '<span class="vacation-page-history-hours"><strong>' + formatDuration(item.minutes) + '</strong><small>utilizzate</small></span>' +
          icons.right +
        '</button>';
      }).join('');
      var status = state.vacationStatus ? '<div class="vacation-page-status">' + escapeHtml(state.vacationStatus) + '</div>' : '';
      return '<div class="vacation-page">' +
        '<div class="vacation-page-top"><div><span>GESTIONE ANNUALE</span><h1>Ferie</h1></div><div class="vacation-year-switch"><button data-vacation-year-prev="1" aria-label="Anno precedente">' + icons.left + '</button><strong>' + year + '</strong><button data-vacation-year-next="1" aria-label="Anno successivo">' + icons.right + '</button></div></div>' +
        '<section class="vacation-page-hero' + (over ? ' is-over' : '') + '">' +
          '<div class="vacation-page-hero-head"><div><span class="vacation-page-kicker">IL TUO SALDO</span><h2>' + remainingValue + '</h2><p>' + remainingLabel + '</p></div>' +
          '<div class="vacation-page-ring" style="--vacation-progress:' + balance.percent + '%"><div><strong>' + balance.percent + '%</strong><span>usato</span></div></div></div>' +
          '<div class="vacation-page-metrics"><div><span>Totale</span><strong>' + (hasAllowance ? formatVacationDayValue(balance.allowanceDays) + ' gg' : '--') + '</strong></div><div><span>Usate</span><strong>' + formatVacationDayValue(balance.usedDays) + ' gg</strong></div><div><span>Ore usate</span><strong>' + formatDuration(balance.usedMinutes) + '</strong></div></div>' +
          '<button class="vacation-page-edit" data-open-vacation-allowance="' + year + '"><span>' + icons.settings + '</span><div><strong>Gestisci disponibilita</strong><small>Modifica il totale annuale</small></div>' + icons.right + '</button>' +
          status +
        '</section>' +
        '<button class="vacation-page-action" data-open-vacation-range="' + year + '"><span class="vacation-page-action-icon">' + icons.umbrella + '</span><span><span>NUOVO PERIODO</span><strong>Inserisci le ferie</strong><small>Scegli le date e controlla subito i giorni conteggiati</small></span><span class="vacation-page-action-arrow">' + icons.right + '</span></button>' +
        '<div class="vacation-page-section-head"><div><span>STORICO</span><h2>Ferie utilizzate</h2></div>' + (details.length ? '<button data-open-vacation-history="' + year + '">Vedi tutte</button>' : '') + '</div>' +
        '<section class="vacation-page-history">' + (recentRows || '<div class="vacation-page-empty"><span>' + icons.calendar + '</span><strong>Nessuna ferie registrata</strong><small>Quando inserisci una giornata, la ritroverai qui.</small></div>') + '</section>' +
      '</div>';
    }

    function renderStatsLegacy() {
      var s = getMonthStats(state.currentMonth);
      var focus = getMonthFocus(state.currentMonth);
      var weekBlocks = getMonthWeekBlocks(state.currentMonth);
      var activityCells = getMonthActivityCells(state.currentMonth);
      var monthDays = new Date(state.currentMonth.getFullYear(), state.currentMonth.getMonth() + 1, 0).getDate();
      var recordedDays = Math.min(monthDays, s.workedDays + s.ferie + s.malattia + s.permesso + (s.festivitaPagata || 0) + s.riposo);
      var monthAverage = s.workedDays ? Math.round(s.totalMinutes / s.workedDays) : 0;
      var bestDayValue = focus.longest ? formatDuration(focus.longest.minutes) : '--';
      var bestDaySub = focus.longest ? ('il ' + formatShortDateLabel(focus.longest.key)) : 'nessun giorno ancora';
      var coveragePercent = Math.min(100, Math.round((recordedDays / Math.max(1, monthDays)) * 100));
      var totalDays = Math.max(1, segmentsTotalDaysForStats(s));
      var segments = [
        { label:'Lavoro', value:s.workedDays, color:'#10b981' },
        { label:'Ferie', value:s.ferie, color:'#38bdf8' },
        { label:'Malattia', value:s.malattia, color:'#f59e0b' },
        { label:'Permesso', value:s.permesso, color:'#d946ef' },
        { label:'Festivita', value:s.festivitaPagata || 0, color:'#fb7185' },
        { label:'Riposo', value:s.riposo, color:'#64748b' }
      ].filter(function (item) { return item.value > 0; });
      var maxWeekMinutes = weekBlocks.reduce(function (max, block) { return Math.max(max, block.minutes); }, 0);
      return '<div class="month-page-top"><div><span>ANALISI MENSILE</span><h1>Statistiche</h1></div><div class="month-page-switch"><button data-stats-prev="1" aria-label="Mese precedente">' + icons.left + '</button><strong>' + formatMonthYear(state.currentMonth) + '</strong><button data-stats-next="1" aria-label="Mese successivo">' + icons.right + '</button></div></div>' +
        '<div class="stack">' +
          '<div class="card stats-overview"><div class="card-body">' +
            '<div class="stats-overview-top"><div class="stats-overview-copy"><div class="stats-kicker">Questo mese</div><div class="stats-main-value">' + (s.totalMinutes ? formatDuration(s.totalMinutes) : '--') + '</div><div class="stats-main-sub">' + (recordedDays ? (recordedDays + ' giorni registrati • media ' + (s.workedDays ? formatDuration(monthAverage) : '--')) : 'Appena inizi a compilare qui vedrai l’andamento del mese') + '</div></div><div class="stats-overview-side"><div class="stats-overview-side-value">' + coveragePercent + '%</div><div class="stats-overview-side-label">coperto</div></div></div>' +
            '<div class="stats-chip-grid">' +
              '<div class="stats-chip-card"><div class="stats-chip-value">' + s.workedDays + '</div><div class="stats-chip-label">giorni lavoro</div></div>' +
              '<div class="stats-chip-card"><div class="stats-chip-value">' + formatDuration(s.overtimeMinutes) + '</div><div class="stats-chip-label">straordinarie</div></div>' +
              '<div class="stats-chip-card"><div class="stats-chip-value">' + formatDuration(s.normalMinutes) + '</div><div class="stats-chip-label">normali</div></div>' +
            '</div></div></div>' +
          '<div class="card"><div class="card-body"><div class="stats-grid">' +
            '<div class="stats-card"><div class="stats-card-label">Media al giorno</div><div class="stats-card-value">' + (s.workedDays ? formatDuration(monthAverage) : '--') + '</div><div class="stats-card-sub">solo giorni lavorati</div></div>' +
            '<div class="stats-card"><div class="stats-card-label">Giornata top</div><div class="stats-card-value">' + bestDayValue + '</div><div class="stats-card-sub">' + bestDaySub + '</div></div>' +
            '<div class="stats-card"><div class="stats-card-label">Entrata più presto</div><div class="stats-card-value">' + (focus.firstStart ? formatClockFromMinutes(focus.firstStart.minutes) : '--:--') + '</div><div class="stats-card-sub">' + (focus.firstStart ? ('il ' + formatShortDateLabel(focus.firstStart.key)) : 'nessun dato') + '</div></div>' +
            '<div class="stats-card"><div class="stats-card-label">Uscita più tardi</div><div class="stats-card-value">' + (focus.lastEnd ? formatClockFromMinutes(focus.lastEnd.minutes) : '--:--') + '</div><div class="stats-card-sub">' + (focus.lastEnd ? ('il ' + formatShortDateLabel(focus.lastEnd.key)) : 'nessun dato') + '</div></div>' +
          '</div></div></div>' +
          '<div class="card"><div class="card-body"><div class="stats-month-head"><div class="section-title" style="margin:0;">Mese a colpo d’occhio</div><div class="small muted">' + monthDays + ' giorni</div></div><div class="week-grid">' +
            weekNames.map(function (name) { return '<div class="weekday">' + name.slice(0, 1) + '</div>'; }).join('') +
          '</div><div class="stats-month-grid">' +
            activityCells.map(function (cell) {
              var classes = 'stats-month-cell level-' + cell.level + (cell.sameMonth ? '' : ' out') + (cell.isToday ? ' today' : '') + cell.typeClass;
              return '<div class="' + classes + '"><div class="stats-month-day">' + cell.day + '</div><div class="stats-month-meta">' + (cell.meta || '—') + '</div></div>';
            }).join('') +
          '</div><div class="stats-legend-row">' +
            '<span class="stats-legend-chip"><span class="stats-legend-swatch" style="background:rgba(124,92,255,.2)"></span>giornata lavorata</span>' +
            '<span class="stats-legend-chip"><span class="stats-legend-swatch" style="background:rgba(56,189,248,.65)"></span>ferie</span>' +
            '<span class="stats-legend-chip"><span class="stats-legend-swatch" style="background:rgba(245,158,11,.65)"></span>malattia</span>' +
            '<span class="stats-legend-chip"><span class="stats-legend-swatch" style="background:rgba(251,113,133,.65)"></span>festivita pagata</span>' +
            '<span class="stats-legend-chip"><span class="stats-legend-swatch" style="background:rgba(100,116,139,.65)"></span>riposo</span>' +
          '</div></div></div>' +
          '<div class="card"><div class="card-body"><div class="between"><div class="section-title" style="margin-top:0">Settimane del mese</div><div class="small muted">' + weekBlocks.length + ' blocchi</div></div><div class="stats-week-list">' +
            weekBlocks.map(function (block) {
              var fill = maxWeekMinutes ? Math.max(0, Math.round((block.minutes / maxWeekMinutes) * 100)) : 0;
              var extraClass = block.minutes ? '' : ' stats-week-empty';
              var sub = block.workedDays ? (block.workedDays + ' giorni registrati') : 'nessun dato';
              return '<div class="stats-week-row' + extraClass + '"><div class="stats-week-head"><div><div class="stats-week-label">' + block.label + '</div><div class="stats-week-sub">' + sub + '</div></div><div class="stats-week-value">' + (block.minutes ? formatDuration(block.minutes) : '--') + '</div></div><div class="stats-week-track"><div class="stats-week-fill" style="width:' + fill + '%;"></div></div></div>';
            }).join('') +
          '</div></div></div>' +
          '<div class="card"><div class="card-body"><div class="section-title" style="margin-top:0">Distribuzione giorni</div><div class="stats-bar">' +
            (segments.length ? segments.map(function (seg) { return '<div class="stats-segment" style="width:' + ((seg.value / totalDays) * 100) + '%;background:' + seg.color + ';"></div>'; }).join('') : '<div class="stats-segment" style="width:100%;background:rgba(255,255,255,.1)"></div>') +
          '</div><div class="stack" style="margin-top:14px;">' +
            (segments.length ? segments : [{ label:'Nessun dato', value:0, color:'rgba(255,255,255,.2)' }]).map(function (seg) {
              return '<div class="detail"><div class="row"><span class="legend-dot" style="background:' + seg.color + '"></span><span>' + seg.label + '</span></div><span>' + seg.value + '</span></div>';
            }).join('') +
          '</div></div></div>' +
        '</div>';
    }

    function segmentsTotalDaysForStats(s) {
      return s.workedDays + s.ferie + s.malattia + s.permesso + (s.festivitaPagata || 0) + s.riposo;
    }

    function getStatsMonthTargetMinutes(date) {
      var dailyTarget = getDailyTargetMinutes();
      if (!dailyTarget) return 0;
      var configuredDays = getConfiguredWorkdays();
      var days = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
      var target = 0;
      for (var day = 1; day <= days; day += 1) {
        var current = new Date(date.getFullYear(), date.getMonth(), day);
        var weekday = mondayIndex(current.getDay());
        if (weekday < 5 && configuredDays.indexOf(weekday) !== -1) target += dailyTarget;
      }
      return target;
    }

    function getStatsYearTargetMinutes(date) {
      var total = 0;
      for (var month = 0; month < 12; month += 1) {
        total += getStatsMonthTargetMinutes(new Date(date.getFullYear(), month, 1));
      }
      return total;
    }

    function getStatsDailySeries(date) {
      var days = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
      return Array.from({ length: days }, function (_, index) {
        var current = new Date(date.getFullYear(), date.getMonth(), index + 1);
        var key = toISODate(current);
        var entry = getEntryForDate(current);
        var breakdown = getBreakdown(entry);
        return {
          key: key,
          day: index + 1,
          entry: entry,
          normal: breakdown.normal,
          overtime: breakdown.overtime,
          total: breakdown.total,
          covered: breakdown.covered
        };
      });
    }

    function getStatsDaySegments(stats) {
      return [
        { label: 'Lavoro', value: stats.workedDays || 0, color: '#24d39a' },
        { label: 'Ferie', value: stats.ferie || 0, color: '#56c7ff' },
        { label: 'Malattia', value: stats.malattia || 0, color: '#ffad4d' },
        { label: 'Permessi', value: stats.permesso || 0, color: '#bd6cff' },
        { label: 'Festivi', value: stats.festivitaPagata || 0, color: '#ff6f91' },
        { label: 'Riposo', value: stats.riposo || 0, color: '#72809e' }
      ];
    }

    function formatStatsDelta(minutes) {
      var value = Math.round(Number(minutes) || 0);
      if (!value) return 'In linea';
      return (value > 0 ? '+' : '-') + formatDuration(Math.abs(value));
    }

    function formatStatsCompactDuration(minutes) {
      var value = Math.max(0, Math.round(Number(minutes) || 0));
      if (!value) return '--';
      var hours = Math.floor(value / 60);
      var remaining = value % 60;
      return remaining ? (hours + 'h' + String(remaining).padStart(2, '0')) : (hours + 'h');
    }

    function buildStatsDailyChart(series) {
      var dailyTarget = getDailyTargetMinutes();
      var maxRecorded = series.reduce(function (max, item) { return Math.max(max, item.total); }, 0);
      var maxMinutes = Math.max(60, dailyTarget, maxRecorded);
      maxMinutes = Math.ceil((maxMinutes * 1.12) / 60) * 60;
      var barAreaHeight = 142;
      var targetTop = dailyTarget > 0 ? 26 + (barAreaHeight - ((dailyTarget / maxMinutes) * barAreaHeight)) : -1;
      var plotWidth = Math.max(312, series.length * 50);
      var columns = series.map(function (item) {
        var normalPercent = Math.max(0, Math.min(100, (item.normal / maxMinutes) * 100));
        var overtimePercent = Math.max(0, Math.min(100 - normalPercent, (item.overtime / maxMinutes) * 100));
        var date = new Date(item.key + 'T12:00:00');
        var weekday = new Intl.DateTimeFormat('it-IT', { weekday: 'short' }).format(date).replace('.', '').slice(0, 3).toUpperCase();
        var stateDot = '';
        if (item.entry && item.total === 0) {
          var type = dayTypes[item.entry.type] || { label: 'Segnato', dot: '#71809e' };
          stateDot = '<i class="analytics-daily-state" style="background:' + type.dot + '" title="' + escapeHtml(type.label) + '"></i>';
        }
        return '<div class="analytics-daily-column" aria-label="' + escapeHtml(weekday + ' ' + item.day + ': ' + (item.total ? formatDuration(item.total) : 'nessuna ora')) + '">' +
          '<span class="analytics-daily-value">' + formatStatsCompactDuration(item.total) + '</span>' +
          '<div class="analytics-daily-bar"><i class="is-normal" style="height:' + normalPercent.toFixed(2) + '%"></i><i class="is-extra" style="height:' + overtimePercent.toFixed(2) + '%"></i>' + stateDot + '</div>' +
          '<small>' + weekday + '</small><strong>' + item.day + '</strong>' +
        '</div>';
      }).join('');
      return '<div class="analytics-chart analytics-daily-readable-chart" role="img" aria-label="Ore lavorate per giorno, scorri orizzontalmente">' +
        '<div class="analytics-daily-scroll"><div class="analytics-daily-plot" style="width:' + plotWidth + 'px">' +
          (dailyTarget > 0 ? '<div class="analytics-daily-target-line" style="top:' + targetTop.toFixed(2) + 'px"><span>' + formatStatsCompactDuration(dailyTarget) + ' obiettivo</span></div>' : '') +
          columns +
        '</div></div>' +
        '<div class="analytics-daily-scroll-hint"><span>Scorri per vedere tutti i giorni</span>' + icons.right + '</div>' +
      '</div>';
    }

    function buildStatsYearChart(summaries, targetMinutes) {
      var width = 344;
      var height = 214;
      var left = 42;
      var top = 14;
      var plotWidth = 290;
      var plotHeight = 154;
      var bottom = top + plotHeight;
      var maxRecorded = summaries.reduce(function (max, item) { return Math.max(max, item.stats.totalMinutes || 0); }, 0);
      var monthTarget = targetMinutes / 12;
      var maxMinutes = Math.max(60, monthTarget, maxRecorded);
      maxMinutes = Math.ceil((maxMinutes * 1.12) / 600) * 600;
      var step = plotWidth / 12;
      var barWidth = Math.min(14, step * .62);
      var grid = [0, .5, 1].map(function (ratio) {
        var y = bottom - (plotHeight * ratio);
        var value = Math.round((maxMinutes * ratio) / 60);
        return '<line class="analytics-chart-grid" x1="' + left + '" y1="' + y.toFixed(1) + '" x2="' + (left + plotWidth) + '" y2="' + y.toFixed(1) + '"></line>' +
          '<text class="analytics-chart-y-label" x="' + (left - 8) + '" y="' + (y + 4).toFixed(1) + '">' + value + 'h</text>';
      }).join('');
      var bars = summaries.map(function (item, index) {
        var normal = item.stats.normalMinutes || 0;
        var overtime = item.stats.overtimeMinutes || 0;
        var x = left + (step * index) + ((step - barWidth) / 2);
        var normalHeight = (normal / maxMinutes) * plotHeight;
        var extraHeight = (overtime / maxMinutes) * plotHeight;
        var normalY = bottom - normalHeight;
        var extraY = normalY - extraHeight;
        return '<g><title>' + monthNames[index] + ': ' + formatDuration(normal + overtime) + '</title>' +
          (normalHeight ? '<rect class="analytics-chart-bar-normal" x="' + x.toFixed(2) + '" y="' + normalY.toFixed(2) + '" width="' + barWidth.toFixed(2) + '" height="' + normalHeight.toFixed(2) + '" rx="3"></rect>' : '') +
          (extraHeight ? '<rect class="analytics-chart-bar-extra" x="' + x.toFixed(2) + '" y="' + extraY.toFixed(2) + '" width="' + barWidth.toFixed(2) + '" height="' + extraHeight.toFixed(2) + '" rx="3"></rect>' : '') +
          '<text class="analytics-chart-x-label" x="' + (x + barWidth / 2).toFixed(2) + '" y="' + (height - 8) + '">' + monthNames[index].slice(0, 1) + '</text></g>';
      }).join('');
      var targetLine = '';
      if (monthTarget > 0) {
        var targetY = bottom - ((monthTarget / maxMinutes) * plotHeight);
        targetLine = '<line class="analytics-chart-target" x1="' + left + '" y1="' + targetY.toFixed(2) + '" x2="' + (left + plotWidth) + '" y2="' + targetY.toFixed(2) + '"></line>';
      }
      return '<svg class="analytics-chart analytics-year-chart" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="Ore lavorate per mese">' +
        '<defs><linearGradient id="analyticsYearNormalBar" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#438dff"></stop><stop offset="1" stop-color="#66d8ff"></stop></linearGradient><linearGradient id="analyticsYearExtraBar" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#7652ff"></stop><stop offset="1" stop-color="#bd6cff"></stop></linearGradient></defs>' +
        grid + targetLine + bars + '</svg>';
    }

    function renderStatsHero(options) {
      var targetPercent = options.target > 0 ? Math.round((options.total / options.target) * 100) : 0;
      var ringPercent = Math.max(0, Math.min(100, targetPercent));
      var trendTone = options.delta > 0 ? ' is-positive' : (options.delta < 0 ? ' is-negative' : '');
      var totalText = options.total ? formatDuration(options.total) : '0h 0m';
      var totalClass = totalText.length > 8 ? ' is-long' : '';
      return '<section class="analytics-hero">' +
        '<div class="analytics-hero-head"><div><span>' + options.kicker + '</span><h2>' + options.title + '</h2></div><div class="analytics-trend' + trendTone + '">' + icons.arrowUp + '<span><strong>' + formatStatsDelta(options.delta) + '</strong><small>' + options.deltaLabel + '</small></span></div></div>' +
        '<div class="analytics-hero-main"><div class="analytics-total' + totalClass + '"><span>ORE LAVORATE</span><strong>' + totalText + '</strong><small>' + options.recordedDays + ' giorni registrati</small></div>' +
          '<div class="analytics-target-ring" style="--analytics-progress:' + ringPercent + '%"><div><strong>' + targetPercent + '%</strong><span>target</span></div></div></div>' +
        '<div class="analytics-hero-target"><div><span><i></i>Obiettivo stimato</span><strong>' + (options.target ? formatDuration(options.target) : '--') + '</strong></div><div class="analytics-target-track"><span style="width:' + ringPercent + '%"></span></div></div>' +
        '<div class="analytics-hero-metrics">' +
          '<div><span class="is-blue">' + icons.briefcase + '</span><small>Ordinarie</small><strong>' + formatDuration(options.normal) + '</strong></div>' +
          '<div><span class="is-violet">' + icons.star + '</span><small>Straordinarie</small><strong>' + formatDuration(options.overtime) + '</strong></div>' +
          '<div><span class="is-green">' + icons.calendar + '</span><small>Giorni lavoro</small><strong>' + options.workedDays + '</strong></div>' +
        '</div>' +
      '</section>';
    }

    function renderStatsHoursComposition(normalMinutes, overtimeMinutes) {
      var total = Math.max(0, normalMinutes + overtimeMinutes);
      var normalPercent = total ? Math.round((normalMinutes / total) * 100) : 0;
      var overtimePercent = total ? 100 - normalPercent : 0;
      return '<section class="analytics-card analytics-composition-card">' +
        '<div class="analytics-card-head"><div><span>COMPOSIZIONE</span><h3>Come sono divise le ore</h3></div><small>' + (total ? formatDuration(total) : 'Nessun dato') + '</small></div>' +
        '<div class="analytics-composition">' +
          '<div class="analytics-hours-donut' + (total ? '' : ' is-empty') + '" style="--analytics-normal:' + normalPercent + '%"><div><strong>' + (total ? normalPercent + '%' : '--') + '</strong><span>ordinarie</span></div></div>' +
          '<div class="analytics-composition-list">' +
            '<div><span><i class="is-normal"></i>Ordinarie</span><strong>' + formatDuration(normalMinutes) + '</strong><small>' + normalPercent + '% del totale</small></div>' +
            '<div><span><i class="is-extra"></i>Straordinarie</span><strong>' + formatDuration(overtimeMinutes) + '</strong><small>' + overtimePercent + '% del totale</small></div>' +
          '</div>' +
        '</div>' +
      '</section>';
    }

    function renderStatsDayDistribution(stats) {
      var segments = getStatsDaySegments(stats);
      var total = segments.reduce(function (sum, segment) { return sum + segment.value; }, 0);
      var active = segments.filter(function (segment) { return segment.value > 0; });
      var bar = active.length ? active.map(function (segment) {
        return '<span style="width:' + ((segment.value / total) * 100).toFixed(2) + '%;background:' + segment.color + '"></span>';
      }).join('') : '<span class="is-empty" style="width:100%"></span>';
      return '<section class="analytics-card analytics-days-card">' +
        '<div class="analytics-card-head"><div><span>GIORNATE</span><h3>Distribuzione del periodo</h3></div><small>' + total + ' segnate</small></div>' +
        '<div class="analytics-days-bar">' + bar + '</div>' +
        '<div class="analytics-days-grid">' + segments.map(function (segment) {
          return '<div><span><i style="background:' + segment.color + '"></i>' + segment.label + '</span><strong>' + segment.value + '</strong></div>';
        }).join('') + '</div>' +
      '</section>';
    }

    function renderStatsInsightGrid(items) {
      return '<section class="analytics-card analytics-insights-card">' +
        '<div class="analytics-card-head"><div><span>INSIGHT</span><h3>Numeri da ricordare</h3></div></div>' +
        '<div class="analytics-insight-grid">' + items.map(function (item) {
          return '<div class="analytics-insight"><span class="' + item.tone + '">' + item.icon + '</span><div><small>' + item.label + '</small><strong>' + item.value + '</strong><em>' + item.sub + '</em></div></div>';
        }).join('') + '</div>' +
      '</section>';
    }

    function renderStatsMonth() {
      var date = state.currentMonth;
      var stats = getMonthStats(date);
      var previousDate = new Date(date.getFullYear(), date.getMonth() - 1, 1);
      var previousStats = getMonthStats(previousDate);
      var focus = getMonthFocus(date);
      var dailySeries = getStatsDailySeries(date);
      var weekBlocks = getMonthWeekBlocks(date);
      var targetMinutes = getStatsMonthTargetMinutes(date);
      var recordedDays = segmentsTotalDaysForStats(stats);
      var average = stats.workedDays ? Math.round(stats.totalMinutes / stats.workedDays) : 0;
      var weeklyTarget = Math.max(0, Number(state.settings.weeklyTarget) || 0) * 60;
      var maxWeek = weekBlocks.reduce(function (max, block) { return Math.max(max, block.minutes); }, Math.max(1, weeklyTarget));
      var weekRows = weekBlocks.map(function (block, index) {
        var normalWidth = Math.max(0, (block.normalMinutes / maxWeek) * 100);
        var extraWidth = Math.max(0, (block.overtimeMinutes / maxWeek) * 100);
        var targetPosition = Math.min(100, (weeklyTarget / maxWeek) * 100);
        return '<div class="analytics-week-row">' +
          '<div class="analytics-week-copy"><span>SETTIMANA ' + (index + 1) + '</span><strong>' + (block.minutes ? formatDuration(block.minutes) : '--') + '</strong><small>giorni ' + block.label + ' &middot; ' + block.workedDays + ' registrati</small></div>' +
          '<div class="analytics-week-chart"><div><span class="is-normal" style="width:' + normalWidth.toFixed(2) + '%"></span><span class="is-extra" style="width:' + extraWidth.toFixed(2) + '%"></span><i style="left:' + targetPosition.toFixed(2) + '%"></i></div></div>' +
        '</div>';
      }).join('');
      var firstTime = focus.firstStart ? formatClockFromMinutes(focus.firstStart.minutes) : '--:--';
      var lastTime = focus.lastEnd ? formatClockFromMinutes(focus.lastEnd.minutes) : '--:--';
      var overtimeDays = dailySeries.filter(function (item) { return item.overtime > 0; }).length;
      var insights = [
        { icon: icons.activity, tone: 'is-blue', label: 'Media lavorata', value: average ? formatDuration(average) : '--', sub: 'per giorno di lavoro' },
        { icon: icons.star, tone: 'is-violet', label: 'Giornata migliore', value: focus.longest ? formatDuration(focus.longest.minutes) : '--', sub: focus.longest ? formatShortDateLabel(focus.longest.key) : 'nessun dato' },
        { icon: icons.clock, tone: 'is-green', label: 'Finestra oraria', value: firstTime + ' - ' + lastTime, sub: 'prima entrata e ultima uscita' },
        { icon: icons.arrowUp, tone: 'is-orange', label: 'Picco straordinari', value: focus.overtimePeak ? formatDuration(focus.overtimePeak.minutes) : '--', sub: focus.overtimePeak ? formatShortDateLabel(focus.overtimePeak.key) : 'nessun extra' }
      ];
      return renderStatsHero({
        kicker: 'RIEPILOGO DEL MESE',
        title: formatMonthYear(date),
        total: stats.totalMinutes,
        target: targetMinutes,
        delta: stats.totalMinutes - previousStats.totalMinutes,
        deltaLabel: 'rispetto a ' + monthNames[previousDate.getMonth()],
        recordedDays: recordedDays,
        normal: stats.normalMinutes,
        overtime: stats.overtimeMinutes,
        workedDays: stats.workedDays
      }) +
      '<section class="analytics-card analytics-chart-card">' +
        '<div class="analytics-card-head"><div><span>ANDAMENTO GIORNALIERO</span><h3>Ore lavorate ogni giorno</h3></div><div class="analytics-chart-legend"><i class="is-normal"></i>Ord.<i class="is-extra"></i>Extra</div></div>' +
        '<div class="analytics-chart-wrap">' + buildStatsDailyChart(dailySeries) + (stats.totalMinutes ? '' : '<div class="analytics-chart-empty"><strong>Nessuna ora registrata</strong><span>Il grafico si riempie quando inserisci le giornate.</span></div>') + '</div>' +
        '<div class="analytics-chart-summary"><div><span>MEDIA GIORNO</span><strong>' + (average ? formatDuration(average) : '--') + '</strong></div><div><span>GIORNO MIGLIORE</span><strong>' + (focus.longest ? formatDuration(focus.longest.minutes) : '--') + '</strong></div><div><span>GIORNI CON EXTRA</span><strong>' + overtimeDays + '</strong></div></div>' +
      '</section>' +
      renderStatsHoursComposition(stats.normalMinutes, stats.overtimeMinutes) +
      '<section class="analytics-card analytics-weeks-card">' +
        '<div class="analytics-card-head"><div><span>CONFRONTO</span><h3>Settimane del mese</h3></div><small>linea = ' + formatHourValue(state.settings.weeklyTarget) + '</small></div>' +
        '<div class="analytics-week-list">' + weekRows + '</div>' +
      '</section>' +
      renderStatsInsightGrid(insights) +
      renderStatsDayDistribution(stats);
    }

    function renderStatsYear() {
      var date = state.currentMonth;
      var year = date.getFullYear();
      var stats = getYearStats(date);
      var previousStats = getYearStats(new Date(year - 1, 0, 1));
      var summaries = getYearMonthSummaries(date);
      var targetMinutes = getStatsYearTargetMinutes(date);
      var activeMonths = summaries.filter(function (item) { return item.stats.totalMinutes > 0; });
      var averageMonth = activeMonths.length ? Math.round(stats.totalMinutes / activeMonths.length) : 0;
      var bestMonth = summaries.reduce(function (best, item) {
        return !best || item.stats.totalMinutes > best.stats.totalMinutes ? item : best;
      }, null);
      var extraMonth = summaries.reduce(function (best, item) {
        return !best || item.stats.overtimeMinutes > best.stats.overtimeMinutes ? item : best;
      }, null);
      var monthlyRows = summaries.filter(function (item) {
        return item.stats.totalMinutes > 0;
      }).map(function (item) {
        var total = item.stats.totalMinutes || 0;
        var normal = item.stats.normalMinutes || 0;
        var overtime = item.stats.overtimeMinutes || 0;
        var maxMonth = Math.max(1, summaries.reduce(function (max, summary) { return Math.max(max, summary.stats.totalMinutes || 0); }, 0));
        return '<div class="analytics-month-row"><div class="analytics-month-copy"><span>' + monthNames[item.date.getMonth()].slice(0, 3) + '</span><div><strong>' + monthNames[item.date.getMonth()] + '</strong><small>Ord. ' + formatDuration(normal) + ' &middot; Extra ' + formatDuration(overtime) + '</small></div></div><div class="analytics-month-value"><strong>' + formatDuration(total) + '</strong><span><i style="width:' + ((total / maxMonth) * 100).toFixed(2) + '%"></i></span></div></div>';
      }).join('');
      var insights = [
        { icon: icons.star, tone: 'is-violet', label: 'Mese migliore', value: bestMonth && bestMonth.stats.totalMinutes ? monthNames[bestMonth.date.getMonth()] : '--', sub: bestMonth && bestMonth.stats.totalMinutes ? formatDuration(bestMonth.stats.totalMinutes) : 'nessun dato' },
        { icon: icons.activity, tone: 'is-blue', label: 'Media mensile', value: averageMonth ? formatDuration(averageMonth) : '--', sub: activeMonths.length + ' mesi con ore' },
        { icon: icons.arrowUp, tone: 'is-orange', label: 'Mese piu extra', value: extraMonth && extraMonth.stats.overtimeMinutes ? monthNames[extraMonth.date.getMonth()] : '--', sub: extraMonth && extraMonth.stats.overtimeMinutes ? formatDuration(extraMonth.stats.overtimeMinutes) : 'nessun extra' },
        { icon: icons.calendar, tone: 'is-green', label: 'Giorni lavorati', value: String(stats.workedDays || 0), sub: stats.recordedDays + ' giornate segnate' }
      ];
      return renderStatsHero({
        kicker: 'RIEPILOGO ANNUALE',
        title: String(year),
        total: stats.totalMinutes,
        target: targetMinutes,
        delta: stats.totalMinutes - previousStats.totalMinutes,
        deltaLabel: 'rispetto al ' + (year - 1),
        recordedDays: stats.recordedDays,
        normal: stats.normalMinutes,
        overtime: stats.overtimeMinutes,
        workedDays: stats.workedDays
      }) +
      '<section class="analytics-card analytics-chart-card">' +
        '<div class="analytics-card-head"><div><span>ANDAMENTO ANNUALE</span><h3>Ore mese per mese</h3></div><div class="analytics-chart-legend"><i class="is-normal"></i>Ord.<i class="is-extra"></i>Extra</div></div>' +
        '<div class="analytics-chart-wrap">' + buildStatsYearChart(summaries, targetMinutes) + (stats.totalMinutes ? '' : '<div class="analytics-chart-empty"><strong>Nessuna ora registrata</strong><span>Il grafico annuale si aggiorna automaticamente.</span></div>') + '</div>' +
        (monthlyRows ? '<div class="analytics-month-list">' + monthlyRows + '</div>' : '') +
      '</section>' +
      renderStatsHoursComposition(stats.normalMinutes, stats.overtimeMinutes) +
      renderStatsInsightGrid(insights) +
      renderStatsDayDistribution(stats);
    }

    function renderStats() {
      var range = state.statsRange === 'year' ? 'year' : 'month';
      var periodLabel = range === 'year' ? String(state.currentMonth.getFullYear()) : formatMonthYear(state.currentMonth);
      var periodName = range === 'year' ? 'Anno' : 'Mese';
      return '<div class="month-page-top analytics-page-top"><div><span>ANALISI ORE</span><h1>Statistiche</h1></div><div class="month-page-switch"><button data-stats-prev="1" aria-label="' + periodName + ' precedente">' + icons.left + '</button><strong>' + periodLabel + '</strong><button data-stats-next="1" aria-label="' + periodName + ' successivo">' + icons.right + '</button></div></div>' +
        '<div class="analytics-range" role="tablist" aria-label="Periodo statistiche">' +
          '<button data-stats-range="month" class="' + (range === 'month' ? 'active' : '') + '" role="tab" aria-selected="' + (range === 'month') + '">Mese</button>' +
          '<button data-stats-range="year" class="' + (range === 'year' ? 'active' : '') + '" role="tab" aria-selected="' + (range === 'year') + '">Anno</button>' +
        '</div>' +
        '<div class="analytics-stack">' + (range === 'year' ? renderStatsYear() : renderStatsMonth()) + '</div>';
    }

function renderOverlayLegacy() {
      if (!state.editingDate || !state.draft) return '';
      var date = state.editingDate, d = state.draft;
      var breakdown = getBreakdown(d);
      var label = weekNamesFull[mondayIndex(date.getDay())];
      var currentType = dayTypes[d.type];
      var others = Object.entries(dayTypes).filter(function (pair) { return pair[0] !== d.type; });
      var isStateOnly = isStateOnlyType(d.type);
      var isMixed = isMixedType(d.type);
      var holidayName = d.type === 'festivita_pagata' ? getHolidayDisplayName(d, date) : '';
      var summaryHtml = '';
      if (d.type === 'riposo') {
        summaryHtml = '<div class="hours-card editor-total-card editor-total-card-single"><div class="editor-total-main"><div class="small muted">Stato</div><div class="large">Riposo</div></div></div>';
      } else if (isStateOnly) {
        summaryHtml = '<div class="hours-card editor-total-card"><div class="editor-total-main"><div class="small muted">Coperto</div><div id="editorSummaryCovered" class="large">' + formatHourValue(minutesToHours(breakdown.leave)) + '</div></div><div class="editor-total-side"><div class="editor-total-mini"><span>' + (holidayName ? 'Festivita' : 'Tipo') + '</span><strong class="' + (holidayName ? 'editor-holiday-name' : '') + '">' + escapeHtml(holidayName || currentType.label) + '</strong></div><div class="editor-total-mini"><span>Note</span><strong>' + (d.notes ? '1' : '0') + '</strong></div></div></div>';
      } else if (isMixed) {
        summaryHtml = '<div class="hours-card editor-total-card editor-total-card-mixed"><div class="editor-total-main"><div class="small muted">Totale</div><div id="editorSummaryTotal" class="large">' + formatDuration(breakdown.total) + '</div></div><div class="editor-total-side"><div class="editor-total-mini"><span>Normali</span><strong id="editorSummaryNormal">' + formatHourValue(minutesToHours(breakdown.normal)) + '</strong></div><div class="editor-total-mini"><span>Extra</span><strong id="editorSummaryExtra">' + formatHourValue(minutesToHours(breakdown.overtime)) + '</strong></div><div class="editor-total-mini"><span>Ferie</span><strong id="editorSummaryLeave">' + formatHourValue(minutesToHours(breakdown.leave)) + '</strong></div></div></div>';
      } else {
        summaryHtml = '<div class="hours-card editor-total-card"><div class="editor-total-main"><div class="small muted">Totale</div><div id="editorSummaryTotal" class="large">' + formatDuration(breakdown.total) + '</div></div><div class="editor-total-side"><div class="editor-total-mini"><span>Normali</span><strong id="editorSummaryNormal">' + formatHourValue(minutesToHours(breakdown.normal)) + '</strong></div><div class="editor-total-mini"><span>Extra</span><strong id="editorSummaryExtra">' + formatHourValue(minutesToHours(breakdown.overtime)) + '</strong></div></div></div>';
      }

      var dynamicSections = '';
      if (d.type === 'riposo') {
        dynamicSections += '<div><div class="hours-card"><div class="hours-stat"><div class="large">😴</div><div class="small muted" style="margin-top:8px;">Per il riposo non servono orari o quantità.</div></div></div></div>';
      } else if (isStateOnly) {
        dynamicSections += '<div><div class="hours-grid"><div class="sub-input-wrap editor-wide-input" style="grid-column:1/-1;"><div class="editor-card-icon editor-icon-blue">' + icons.clock + '</div><div class="sub-label">' + getEditorQuantityLabel(d.type) + '</div><input id="editorQuantityHours" class="sub-input textual" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" value="' + formatEditorDecimal(d.quantityHours || 0) + '"><div class="tiny-hint">' + getEditorQuantityHint(d.type) + '</div></div></div></div>';
      } else {
        dynamicSections += '<div><div class="editor-time-combo"><div class="time-box editor-time-card editor-time-slot ' + (normalizeTimeInputValue(d.start || '') ? 'has-time' : 'empty-time') + '"><div class="editor-card-icon editor-icon-blue">' + icons.right + '</div><div class="small muted">Entrata</div><div class="time-field"><input id="editorStart" class="time-input-big" type="time" step="60" value="' + normalizeTimeInputValue(d.start || '') + '"><div class="time-placeholder" aria-hidden="true">-- : --</div></div></div><div class="editor-time-bridge">' + icons.right + '</div><div class="time-box editor-time-card editor-time-slot ' + (normalizeTimeInputValue(d.end || '') ? 'has-time' : 'empty-time') + '"><div class="editor-card-icon editor-icon-violet">' + icons.left + '</div><div class="small muted">Uscita</div><div class="time-field"><input id="editorEnd" class="time-input-big" type="time" step="60" value="' + normalizeTimeInputValue(d.end || '') + '"><div class="time-placeholder" aria-hidden="true">-- : --</div></div></div></div></div>';
        dynamicSections += '<div><div class="editor-adjustments-card ' + (isMixed ? 'editor-adjustments-card-three' : '') + '">' +
          '<div class="sub-input-wrap editor-number-card editor-detail-slot"><div class="editor-card-icon editor-icon-green">' + icons.coffee + '</div><div class="sub-label">Pausa</div><input id="editorBreakHours" class="sub-input textual" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" value="' + formatEditorDecimal(d.breakHours || 0) + '"></div>' +
          (isMixed ? '<div class="sub-input-wrap editor-number-card editor-detail-slot"><div class="editor-card-icon editor-icon-blue">' + icons.calendar + '</div><div class="sub-label">Ferie</div><input id="editorLeaveHours" class="sub-input textual" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" value="' + formatEditorDecimal(d.leaveHours || 0) + '"></div>' : '') +
          '<div class="sub-input-wrap editor-number-card editor-detail-slot"><div class="editor-card-icon editor-icon-blue">' + icons.star + '</div><div class="sub-label">Extra</div><input id="editorOvertimeHours" class="sub-input textual" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" value="' + formatEditorDecimal(d.overtimeHours || 0) + '"></div>' +
        '</div></div>';
      }

      summaryHtml = summaryHtml.replace(/hours-card/g, 'hours-card editor-hours-card').replace(/hours-stat/g, 'hours-stat editor-hours-stat');
      var holidayBadge = holidayName ? '<div class="editor-holiday-badge"><span class="editor-holiday-badge-icon">🎉</span><span>' + escapeHtml(holidayName) + '</span></div>' : '';

      return '<div class="overlay open editor-overlay editor-overlay-v2"><div class="overlay-header editor-header"><button class="icon editor-close" data-close-editor="1">' + icons.x + '</button><div class="editor-header-center"><div class="editor-header-day">' + label + '</div><div class="editor-header-date">' + date.getDate() + ' ' + monthNames[date.getMonth()] + ' ' + date.getFullYear() + '</div></div><button class="ghost editor-save-btn" data-save-day="1">Salva</button></div>' +
        '<div class="overlay-scroll"><div class="stack editor-stack">' +
        '<div class="editor-section editor-type-section"><div class="type-picker-wrap"><div class="type-list"><button class="type-row editor-type-row-main" data-toggle-type-open="1"><div class="type-row-left"><div class="type-icon" style="background:' + typeIconBg(d.type) + '">' + typeIconSvg(d.type) + '</div><div><div class="type-main-label">' + currentType.label + '</div>' + holidayBadge + '</div></div><span>' + icons.right + '</span></button>' +
        (state.typeOpen ? '<div class="type-options">' + others.map(function (pair) { return '<button class="type-row editor-type-row-option" data-select-type="' + pair[0] + '"><div class="type-row-left"><div class="type-icon" style="background:' + typeIconBg(pair[0]) + '">' + typeIconSvg(pair[0]) + '</div><div class="type-secondary-label">' + pair[1].label + '</div></div><span class="editor-select-copy">Scegli</span></button>'; }).join('') + '</div>' : '') + '</div></div></div>' +
        '<div class="editor-section editor-input-section">' + dynamicSections + '</div>' +
        '<div class="editor-section editor-summary-section">' + summaryHtml + '</div>' +
        '<div class="editor-section editor-notes-section"><button class="collapse-btn editor-collapse-btn" data-toggle-notes-open="1"><div class="editor-notes-title"><span class="editor-card-icon editor-icon-blue">' + icons.note + '</span><div>Annotazioni</div></div><span>' + icons.right + '</span></button><div class="collapse-panel ' + (state.notesOpen ? 'open' : '') + '"><textarea id="editorNotes" class="notes" placeholder="Aggiungi una nota...">' + escapeHtml(d.notes) + '</textarea></div></div>' +
        '<div class="editor-section editor-danger-section"><div class="editor-actions"><button class="ghost danger editor-danger-btn" data-clear-day="1">' + icons.trash + 'Cancella giornata</button></div></div>' +
        '</div></div></div>';
    }

    function renderOverlay() {
      if (!state.editingDate || !state.draft) return '';
      var date = state.editingDate;
      var d = state.draft;
      var breakdown = getBreakdown(d);
      var label = weekNamesFull[mondayIndex(date.getDay())];
      var currentType = dayTypes[d.type];
      var others = Object.entries(dayTypes).filter(function (pair) { return pair[0] !== d.type; });
      var isStateOnly = isStateOnlyType(d.type);
      var isMixed = isMixedType(d.type);
      var holidayName = d.type === 'festivita_pagata' ? getHolidayDisplayName(d, date) : '';
      var editorDateLabel = label + ' ' + date.getDate() + ' ' + monthNames[date.getMonth()] + ' ' + date.getFullYear();
      var typeSubtitle = 'Giornata lavorativa';
      if (d.type === 'lavoro_ferie') typeSubtitle = 'Lavoro con ore di ferie';
      if (d.type === 'ferie') typeSubtitle = 'Giornata di ferie';
      if (d.type === 'malattia') typeSubtitle = 'Giornata di malattia';
      if (d.type === 'permesso') typeSubtitle = 'Giornata di permesso';
      if (d.type === 'festivita_pagata') typeSubtitle = holidayName || 'Festivita italiana pagata';
      if (d.type === 'riposo') typeSubtitle = 'Giornata di riposo';

      var summaryHtml = '';
      if (d.type === 'riposo') {
        summaryHtml = '<div class="day-editor-summary-state"><span class="day-editor-summary-state-icon">' + typeIconSvg(d.type) + '</span><div><span>Stato giornata</span><strong>Riposo</strong></div></div>';
      } else if (isStateOnly) {
        summaryHtml = '<div class="day-editor-summary-state"><span class="day-editor-summary-state-icon">' + typeIconSvg(d.type) + '</span><div><span>' + escapeHtml(currentType.label) + '</span><strong id="editorSummaryCovered">' + formatDuration(breakdown.leave) + '</strong></div></div>' +
          '<div class="day-editor-summary-total"><span>Ore coperte</span><strong id="editorSummaryTotal">' + formatDuration(breakdown.covered) + '</strong></div>';
      } else {
        summaryHtml = '<div class="day-editor-summary-grid ' + (isMixed ? 'is-mixed' : '') + '">' +
          '<div class="day-editor-summary-stat"><span class="day-editor-summary-icon is-blue">' + icons.clock + '</span><span>Normali</span><strong id="editorSummaryNormal">' + formatDuration(breakdown.normal) + '</strong></div>' +
          '<div class="day-editor-summary-stat"><span class="day-editor-summary-icon is-green">' + icons.coffee + '</span><span>Pausa</span><strong id="editorSummaryBreak">' + formatDuration(hoursToMinutes(d.breakHours || 0)) + '</strong></div>' +
          '<div class="day-editor-summary-stat"><span class="day-editor-summary-icon is-violet">' + icons.star + '</span><span>Extra</span><strong id="editorSummaryExtra">' + formatDuration(breakdown.overtime) + '</strong></div>' +
          (isMixed ? '<div class="day-editor-summary-stat"><span class="day-editor-summary-icon is-blue">' + icons.calendar + '</span><span>Ferie</span><strong id="editorSummaryLeave">' + formatDuration(breakdown.leave) + '</strong></div>' : '') +
        '</div><div class="day-editor-summary-total"><span>Totale lavorato</span><strong id="editorSummaryTotal">' + formatDuration(breakdown.total) + '</strong></div>';
      }

      var dynamicSections = '';
      if (d.type === 'riposo') {
        dynamicSections = '<section class="day-editor-card day-editor-state-card"><span class="day-editor-state-icon">' + typeIconSvg(d.type) + '</span><div><span class="day-editor-kicker">RIPOSO</span><strong>Nessun orario da inserire</strong><small>Puoi aggiungere una nota: la giornata si salva automaticamente.</small></div></section>';
      } else if (isStateOnly) {
        dynamicSections = '<section class="day-editor-card day-editor-quantity-card"><div class="day-editor-kicker">QUANTITA</div><div class="day-editor-quantity-row"><span class="day-editor-round-icon is-blue">' + icons.clock + '</span><div class="day-editor-quantity-copy"><strong>' + getEditorQuantityLabel(d.type) + '</strong><small>' + getEditorQuantityHint(d.type) + '</small></div><div class="day-editor-number-field"><input id="editorQuantityHours" class="textual" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" value="' + formatEditorDecimal(d.quantityHours || 0) + '" aria-label="' + getEditorQuantityLabel(d.type) + '"><span>h</span></div></div></section>';
      } else {
        dynamicSections = '<section class="day-editor-card day-editor-schedule-card"><div class="day-editor-kicker">ORARIO</div><div class="day-editor-time-grid">' +
          '<label class="time-box day-editor-time-field ' + (normalizeTimeInputValue(d.start || '') ? 'has-time' : 'empty-time') + '"><span class="day-editor-round-icon is-green">' + icons.right + '</span><span class="day-editor-time-label">Entrata</span><span class="time-field"><input id="editorStart" class="time-input-big" type="time" step="60" value="' + normalizeTimeInputValue(d.start || '') + '" aria-label="Orario di entrata"><span class="time-placeholder" aria-hidden="true">--:--</span></span></label>' +
          '<label class="time-box day-editor-time-field ' + (normalizeTimeInputValue(d.end || '') ? 'has-time' : 'empty-time') + '"><span class="day-editor-round-icon is-violet">' + icons.left + '</span><span class="day-editor-time-label">Uscita</span><span class="time-field"><input id="editorEnd" class="time-input-big" type="time" step="60" value="' + normalizeTimeInputValue(d.end || '') + '" aria-label="Orario di uscita"><span class="time-placeholder" aria-hidden="true">--:--</span></span></label>' +
        '</div><div class="day-editor-inline-row"><span class="day-editor-round-icon is-blue">' + icons.clock + '</span><div class="day-editor-inline-copy"><strong>Pausa</strong><small>Durata non lavorata</small></div><div class="day-editor-stepper"><button type="button" data-adjust-editor-hours="breakHours" data-editor-delta="-0.5" aria-label="Riduci pausa">-</button><div class="day-editor-step-value"><input id="editorBreakHours" class="textual" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" value="' + formatEditorDecimal(d.breakHours || 0) + '" aria-label="Ore di pausa"><span>h</span></div><button type="button" data-adjust-editor-hours="breakHours" data-editor-delta="0.5" aria-label="Aumenta pausa">+</button></div></div>' +
        (isMixed ? '<div class="day-editor-inline-row day-editor-leave-row"><span class="day-editor-round-icon is-blue">' + icons.calendar + '</span><div class="day-editor-inline-copy"><strong>Ferie</strong><small>Ore coperte nella giornata</small></div><div class="day-editor-stepper"><button type="button" data-adjust-editor-hours="leaveHours" data-editor-delta="-0.5" aria-label="Riduci ferie">-</button><div class="day-editor-step-value"><input id="editorLeaveHours" class="textual" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" value="' + formatEditorDecimal(d.leaveHours || 0) + '" aria-label="Ore di ferie"><span>h</span></div><button type="button" data-adjust-editor-hours="leaveHours" data-editor-delta="0.5" aria-label="Aumenta ferie">+</button></div></div>' : '') +
        '</section><section class="day-editor-card day-editor-overtime-card"><div class="day-editor-kicker">STRAORDINARI</div><div class="day-editor-overtime-head"><span class="day-editor-round-icon is-violet">' + icons.star + '</span><div class="day-editor-inline-copy"><strong>Ore straordinarie</strong><small data-editor-overtime-mode>' + (d.overtimeManual ? 'Valore impostato manualmente' : 'Calcolate dagli orari inseriti') + '</small></div><button type="button" class="day-editor-auto-toggle ' + (!d.overtimeManual ? 'is-on' : '') + '" data-toggle-editor-overtime-auto="1" aria-pressed="' + (!d.overtimeManual ? 'true' : 'false') + '" aria-label="Calcolo automatico straordinari"><span></span></button></div><div class="day-editor-overtime-stepper"><button type="button" data-adjust-editor-hours="overtimeHours" data-editor-delta="-0.5" aria-label="Riduci straordinari">-</button><div class="day-editor-overtime-value"><input id="editorOvertimeHours" class="textual" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" value="' + formatEditorDecimal(d.overtimeHours || 0) + '" aria-label="Ore straordinarie"><span>h</span></div><button type="button" data-adjust-editor-hours="overtimeHours" data-editor-delta="0.5" aria-label="Aumenta straordinari">+</button></div></section>';
      }

      var holidayBadge = holidayName ? '<span class="day-editor-holiday-badge">' + escapeHtml(holidayName) + '</span>' : '';
      var canClear = hasMeaningfulDayData(d) || Boolean(state.entries[toISODate(date)]);

      return '<div class="overlay open editor-overlay editor-overlay-v3" role="dialog" aria-modal="true" aria-label="Inserisci giornata"><header class="day-editor-header"><button class="day-editor-back" data-close-editor="1" aria-label="Torna indietro">' + icons.left + '</button><div class="day-editor-header-copy"><div class="day-editor-title">Inserisci giornata</div><div class="day-editor-date">' + editorDateLabel + '</div></div><span class="day-editor-header-spacer" aria-hidden="true"></span></header>' +
        '<div class="day-editor-scroll"><main class="day-editor-stack">' +
          '<section class="day-editor-type-section"><button class="day-editor-type-card" data-toggle-type-open="1"><span class="day-editor-type-icon" style="background:' + typeIconBg(d.type) + '">' + typeIconSvg(d.type) + '</span><span class="day-editor-type-copy"><strong>' + currentType.label + '</strong><small>' + escapeHtml(typeSubtitle) + '</small>' + holidayBadge + '</span><span class="day-editor-chevron">' + icons.right + '</span></button>' +
          (state.typeOpen ? '<div class="day-editor-type-options">' + others.map(function (pair) { return '<button class="day-editor-type-option" data-select-type="' + pair[0] + '"><span class="day-editor-type-option-icon" style="background:' + typeIconBg(pair[0]) + '">' + typeIconSvg(pair[0]) + '</span><span>' + pair[1].label + '</span><small>Scegli</small></button>'; }).join('') + '</div>' : '') + '</section>' +
          dynamicSections +
          '<section class="day-editor-card day-editor-summary-card"><div class="day-editor-kicker">RIEPILOGO GIORNATA</div>' + summaryHtml + '</section>' +
          '<section class="day-editor-card day-editor-notes-card"><div class="day-editor-kicker">NOTE (OPZIONALI)</div><label class="day-editor-notes-field"><span class="day-editor-round-icon is-blue">' + icons.note + '</span><textarea id="editorNotes" rows="1" placeholder="Aggiungi una nota alla giornata...">' + escapeHtml(d.notes) + '</textarea></label></section>' +
          (canClear ? '<section class="day-editor-danger-section"><button class="day-editor-danger" data-clear-day="1">' + icons.trash + '<span>Cancella giornata</span></button></section>' : '') +
        '</main></div></div>';
    }

    function renderConfirmModal() {
      if (!state.confirmClearOpen) return '';
      return '<div class="confirm-overlay open" role="alertdialog" aria-modal="true" aria-labelledby="clearDayTitle" aria-describedby="clearDayText"><div class="confirm-card"><div class="confirm-title" id="clearDayTitle">Cancella giornata</div><div class="confirm-text" id="clearDayText">Vuoi cancellare tutte le ore e i dati di questo giorno?</div><div class="confirm-actions"><button class="ghost" data-close-confirm="1">Annulla</button><button class="ghost danger" data-confirm-clear="1">Cancella</button></div></div></div>';
    }

    function renderVacationHistory() {
      if (!state.vacationHistoryOpen) return '';
      var year = Number(state.vacationHistoryYear) || state.currentMonth.getFullYear();
      var balance = getVacationBalanceForYear(year);
      var rows = getVacationDetailsForYear(year);
      var items = rows.map(function (item) {
        var date = parseLocalDateKey(item.key);
        var weekday = date ? new Intl.DateTimeFormat('it-IT', { weekday: 'long' }).format(date) : '';
        var dateLabel = date ? new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }).format(date) : item.key;
        var monthLabel = date ? new Intl.DateTimeFormat('it-IT', { month: 'short' }).format(date).replace('.', '') : '';
        var typeLabel = item.entry.type === 'lavoro_ferie' ? 'Ferie parziali' : 'Giornata di ferie';
        var notes = String(item.entry.notes || '').trim();
        return '<button class="vacation-history-row" data-open-vacation-date="' + item.key + '">' +
          '<span class="vacation-history-date"><strong>' + (date ? date.getDate() : '--') + '</strong><small>' + escapeHtml(monthLabel) + '</small></span>' +
          '<span class="vacation-history-copy"><strong>' + escapeHtml(weekday) + '</strong><small>' + escapeHtml(dateLabel + ' - ' + typeLabel + (notes ? (' - ' + notes) : '')) + '</small></span>' +
          '<span class="vacation-history-hours"><strong>' + formatDuration(item.minutes) + '</strong><small>ferie</small></span>' +
          '<span class="vacation-history-chevron">' + icons.right + '</span>' +
        '</button>';
      }).join('');
      return '<div class="vacation-history-overlay" role="dialog" aria-modal="true" aria-label="Ferie utilizzate">' +
        '<button class="vacation-overlay-backdrop" data-close-vacation-history="1" aria-label="Chiudi"></button>' +
        '<div class="vacation-history-sheet">' +
          '<div class="vacation-sheet-handle"></div>' +
          '<div class="vacation-sheet-head"><div><div class="vacation-kicker">FERIE ' + year + '</div><div class="vacation-sheet-title">Giorni utilizzati</div></div><button class="vacation-sheet-close" data-close-vacation-history="1">' + icons.x + '</button></div>' +
          '<div class="vacation-history-summary"><span class="vacation-history-summary-icon">' + icons.umbrella + '</span><div><span>Totale registrato</span><strong>' + formatDuration(balance.usedMinutes) + '</strong></div><b>' + rows.length + (rows.length === 1 ? ' giornata' : ' giornate') + '</b></div>' +
          (items ? '<div class="vacation-history-list">' + items + '</div>' : '<div class="vacation-history-empty"><span>' + icons.umbrella + '</span><strong>Nessuna ferie registrata</strong><small>Quando inserisci una giornata di ferie la ritrovi qui.</small></div>') +
        '</div>' +
      '</div>';
    }

    function renderVacationManager() {
      if (!state.vacationManagerOpen) return '';
      var year = state.vacationDraft && Number(state.vacationDraft.year) ? Number(state.vacationDraft.year) : state.currentMonth.getFullYear();
      var draft = state.vacationDraft || {};
      var balance = getVacationBalanceForYear(year);
      var mode = state.vacationManagerMode === 'range' ? 'range' : 'allowance';
      var hasAllowance = balance.allowanceDays > 0;
      var remainingLabel = hasAllowance ? (formatVacationDayValue(balance.remainingDays) + ' gg disponibili') : 'Da impostare';
      var error = state.vacationManagerError ? '<div class="vacation-flow-error">' + escapeHtml(state.vacationManagerError) + '</div>' : '';
      var headerIcon = mode === 'range' ? icons.calendar : icons.settings;
      var headerTitle = mode === 'range' ? 'Inserisci le ferie' : 'Disponibilita annuale';
      var headerText = mode === 'range' ? 'Scegli la durata, poi tocca le date.' : 'Imposta il monte ferie per il ' + year + '.';
      var content = '';

      if (mode === 'allowance') {
        var draftAllowance = Math.min(366, Math.max(0, parseDecimalInput(draft.allowanceDays, 0)));
        var projectedDifference = draftAllowance - balance.usedDays;
        var projectionTone = projectedDifference < 0 ? 'warning' : 'positive';
        var projectionLabel = formatVacationDayValue(Math.abs(projectedDifference)) + (projectedDifference < 0 ? ' gg oltre il saldo' : ' gg disponibili');
        content =
          '<div class="vacation-flow-balance">' +
            '<div><span>FERIE USATE</span><strong>' + formatVacationDayValue(balance.usedDays) + ' gg</strong></div>' +
            '<div><span>SALDO ATTUALE</span><strong>' + remainingLabel + '</strong></div>' +
          '</div>' +
          '<section class="vacation-allowance-editor">' +
            '<div class="vacation-flow-section-title"><span>MONTE ANNUALE</span><strong>Quanti giorni hai in totale?</strong></div>' +
            '<div class="vacation-allowance-control">' +
              '<button type="button" data-vacation-allowance-step="-1" aria-label="Riduci di un giorno"' + (draftAllowance <= 0 ? ' disabled' : '') + '>-</button>' +
              '<label><input id="vacationAllowanceInput" type="text" inputmode="decimal" data-used-days="' + escapeHtml(formatEditorDecimal(balance.usedDays)) + '" value="' + escapeHtml(formatEditorDecimal(draftAllowance)) + '"><span>giorni</span></label>' +
              '<button type="button" data-vacation-allowance-step="1" aria-label="Aumenta di un giorno"' + (draftAllowance >= 366 ? ' disabled' : '') + '>+</button>' +
            '</div>' +
            '<div class="vacation-allowance-projection"><span>Dopo il salvataggio</span><strong id="vacationAllowanceProjection" data-tone="' + projectionTone + '">' + projectionLabel + '</strong></div>' +
          '</section>' +
          '<div class="vacation-flow-note"><span>' + icons.check + '</span><p>Le giornate di ferie gia registrate non vengono modificate.</p></div>' +
          error +
          '<button class="solid vacation-flow-primary" data-save-vacation-allowance="1">Salva disponibilita</button>';
      } else {
        var rangeMode = draft.rangeMode === 'period' ? 'period' : 'single';
        var rangeEnd = rangeMode === 'period' ? draft.end : draft.start;
        var rangeStaysInYear = String(draft.start || '').slice(0, 4) === String(year) && String(rangeEnd || '').slice(0, 4) === String(year);
        var preview = rangeStaysInYear ? getVacationRangePreview(draft.start, rangeEnd) : { ok: false, reason: 'year', eligibleKeys: [], skipped: 0, skippedReasons: {} };
        var previewDays = preview.ok ? preview.eligibleKeys.length : 0;
        var previewMinutes = previewDays * balance.dailyMinutes;
        var exceedsBalance = hasAllowance && previewDays > balance.remainingDays;
        var previewTone = !preview.ok || !previewDays ? 'empty' : (exceedsBalance ? 'warning' : 'positive');
        var formatRequestDate = function (value) {
          var date = parseLocalDateKey(value);
          if (!date) return 'Scegli una data';
          var label = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }).format(date);
          return label.charAt(0).toUpperCase() + label.slice(1);
        };
        var reasonLabels = [];
        var skippedReasons = preview.skippedReasons || {};
        if (skippedReasons.weekend) reasonLabels.push(skippedReasons.weekend + ' weekend');
        if (skippedReasons.holiday) reasonLabels.push(skippedReasons.holiday + ' festivita');
        if (skippedReasons.rest) reasonLabels.push(skippedReasons.rest + (skippedReasons.rest === 1 ? ' riposo' : ' riposi'));
        if (skippedReasons.notWorkday) reasonLabels.push(skippedReasons.notWorkday + (skippedReasons.notWorkday === 1 ? ' giorno non lavorativo' : ' giorni non lavorativi'));
        if (skippedReasons.occupied) reasonLabels.push(skippedReasons.occupied + (skippedReasons.occupied === 1 ? ' giornata gia compilata' : ' giornate gia compilate'));
        var excludedLabel = preview.skipped ? ('Non conteggiati: ' + reasonLabels.join(', ')) : 'Tutti i giorni selezionati verranno conteggiati';
        var remainingAfter = balance.remainingDays - previewDays;
        var remainingAfterLabel = hasAllowance
          ? (remainingAfter >= 0 ? (formatVacationDayValue(remainingAfter) + ' gg') : (formatVacationDayValue(Math.abs(remainingAfter)) + ' gg oltre'))
          : 'Da impostare';
        var summaryTitle = !preview.ok
          ? (preview.reason === 'year' ? ('Scegli date del ' + year) : 'Controlla le date')
          : (previewDays ? 'Controlla il riepilogo' : 'Questa selezione non e disponibile');
        var summaryText = !preview.ok
          ? (preview.reason === 'year' ? ('Il periodo deve rimanere nel ' + year + '.') : 'La data finale deve essere successiva a quella iniziale.')
          : (previewDays ? 'Questi sono i giorni che verranno salvati.' : (excludedLabel + '.'));
        var actionLabel = previewDays ? ('Salva ' + previewDays + (previewDays === 1 ? ' giorno' : ' giorni')) : (rangeMode === 'single' ? 'Scegli un altro giorno' : 'Modifica il periodo');
        content =
          '<div class="vacation-request-balance"><span>' + icons.umbrella + '</span><div><small>DISPONIBILI</small><strong>' + remainingLabel + '</strong></div><div><small>GIA USATE</small><strong>' + formatVacationDayValue(balance.usedDays) + ' gg</strong></div></div>' +
          '<section class="vacation-request-editor">' +
            '<div class="vacation-request-mode" role="group" aria-label="Durata delle ferie"><button class="' + (rangeMode === 'single' ? 'active' : '') + '" data-vacation-range-mode="single">Un solo giorno</button><button class="' + (rangeMode === 'period' ? 'active' : '') + '" data-vacation-range-mode="period">Piu giorni</button></div>' +
            '<div class="vacation-request-date-list">' +
              '<label class="vacation-request-date"><span class="vacation-request-date-icon">' + icons.calendar + '</span><span class="vacation-request-date-copy"><small>' + (rangeMode === 'single' ? 'GIORNO DI FERIE' : 'DATA INIZIO') + '</small><strong>' + escapeHtml(formatRequestDate(draft.start)) + '</strong></span><span class="vacation-request-date-action">Modifica</span><input id="vacationStartInput" type="date" min="' + year + '-01-01" max="' + year + '-12-31" value="' + escapeHtml(draft.start || '') + '"></label>' +
              (rangeMode === 'period' ? '<label class="vacation-request-date"><span class="vacation-request-date-icon is-end">' + icons.calendar + '</span><span class="vacation-request-date-copy"><small>DATA FINE</small><strong>' + escapeHtml(formatRequestDate(draft.end)) + '</strong></span><span class="vacation-request-date-action">Modifica</span><input id="vacationEndInput" type="date" min="' + year + '-01-01" max="' + year + '-12-31" value="' + escapeHtml(draft.end || '') + '"></label>' : '') +
            '</div>' +
          '</section>' +
          '<section class="vacation-request-summary" data-tone="' + previewTone + '">' +
            '<div class="vacation-request-summary-head"><span>' + (previewDays ? icons.check : icons.calendar) + '</span><div><strong>' + summaryTitle + '</strong><small>' + summaryText + '</small></div></div>' +
            '<div class="vacation-request-total"><strong>' + (preview.ok ? previewDays : '--') + '</strong><span>' + (previewDays === 1 ? 'giorno di ferie' : 'giorni di ferie') + '<small>' + (previewDays ? formatDuration(previewMinutes) + ' totali' : 'Nessuna ora conteggiata') + '</small></span></div>' +
            '<div class="vacation-request-metrics"><div><span>NON CONTATI</span><strong>' + (preview.ok ? preview.skipped : '--') + '</strong></div><div><span>SALDO DOPO</span><strong>' + remainingAfterLabel + '</strong></div></div>' +
            '<div class="vacation-request-exclusions"><span>' + icons.check + '</span><p>' + escapeHtml(excludedLabel) + '</p></div>' +
          '</section>' +
          (exceedsBalance ? '<div class="vacation-flow-warning">Attenzione: superi il saldo disponibile di ' + formatVacationDayValue(previewDays - balance.remainingDays) + ' gg.</div>' : '') +
          error +
          '<button class="solid vacation-flow-primary" data-apply-vacation-range="1"' + (!preview.ok || !previewDays ? ' disabled' : '') + '>' + actionLabel + '</button>';
      }

      return '<div class="vacation-overlay open vacation-flow-overlay" role="dialog" aria-modal="true" aria-label="' + headerTitle + '">' +
        '<button class="vacation-overlay-backdrop" data-close-vacation-manager="1" aria-label="Chiudi"></button>' +
        '<div class="vacation-flow-sheet is-' + mode + '">' +
          '<div class="vacation-sheet-handle"></div>' +
          '<div class="vacation-flow-head"><span class="vacation-flow-head-icon">' + headerIcon + '</span><div><span>FERIE ' + year + '</span><strong>' + headerTitle + '</strong><small>' + headerText + '</small></div><button class="vacation-sheet-close" data-close-vacation-manager="1" aria-label="Chiudi">' + icons.x + '</button></div>' +
          content +
        '</div>' +
      '</div>';
    }

    function renderPayslipViewer() {
      if (!state.payslipViewer) return '';
      var source = state.payslipViewer.source === 'archive'
        ? (state.payslips || []).find(function (item) { return item.id === state.payslipViewer.payslipId; })
        : state.payslipDraft;
      var photos = normalizePayslipPhotos(source);
      if (!photos.length) return '';
      var index = Math.max(0, Math.min(photos.length - 1, Number(state.payslipViewer.index) || 0));
      var photo = photos[index];
      var viewerMode = state.payslipViewer.source === 'archive' ? 'Sola visualizzazione' : 'Anteprima foto';
      return '<div class="payvault-viewer" role="dialog" aria-modal="true" aria-label="Foto busta paga">' +
        '<button class="payvault-viewer-backdrop" data-close-payslip-viewer="1" aria-label="Chiudi foto"></button>' +
        '<div class="payvault-viewer-stage">' +
          '<div class="payvault-viewer-head"><div><em>' + viewerMode + '</em><strong>Foto ' + (index + 1) + ' di ' + photos.length + '</strong><span>' + escapeHtml(photo.fileName || 'Busta paga') + '</span></div><button data-close-payslip-viewer="1">' + icons.x + '</button></div>' +
          '<div class="payvault-viewer-image" data-payslip-zoom-surface="1">' +
            '<img data-payslip-zoom-image="1" src="' + photo.data + '" alt="Foto ingrandita della busta paga">' +
            '<span class="payvault-viewer-zoom-hint">Pizzica o fai doppio tocco</span>' +
            '<div class="payvault-viewer-zoom-tools" aria-label="Controlli zoom">' +
              '<button type="button" data-payslip-zoom-out="1" aria-label="Riduci zoom">-</button>' +
              '<button type="button" class="payvault-viewer-zoom-level" data-payslip-zoom-reset="1" aria-label="Reimposta zoom"><span data-payslip-zoom-label="1">100%</span></button>' +
              '<button type="button" data-payslip-zoom-in="1" aria-label="Aumenta zoom">+</button>' +
            '</div>' +
          '</div>' +
          (photos.length > 1 ? '<div class="payvault-viewer-nav"><button data-payslip-viewer-prev="1">' + icons.left + '<span>Precedente</span></button><div>' + (index + 1) + ' / ' + photos.length + '</div><button data-payslip-viewer-next="1"><span>Successiva</span>' + icons.right + '</button></div>' : '') +
        '</div>' +
      '</div>';
    }

    function renderPayslipDecisionModal() {
      var photoIndex = Number(state.payslipPhotoDeletePendingIndex);
      var deletingPhoto = Number.isInteger(photoIndex) && photoIndex >= 0;
      var payslipId = state.payslipDeletePendingId;
      if (!deletingPhoto && !payslipId) return '';
      var payslip = payslipId ? (state.payslips || []).find(function (item) { return item.id === payslipId; }) : null;
      var title = deletingPhoto ? 'Rimuovere questa foto?' : 'Eliminare la busta paga?';
      var text = deletingPhoto
        ? 'La foto verra rimossa dalla galleria. Le altre foto e l\'importo resteranno salvati.'
        : 'Stai per eliminare ' + escapeHtml(payslip ? getPayslipMonthLabel(payslip) : 'questa busta paga') + '. Questa azione non puo essere annullata.';
      return '<div class="payvault-decision" role="alertdialog" aria-modal="true">' +
        '<button class="payvault-decision-backdrop" data-close-payslip-decision="1" aria-label="Annulla"></button>' +
        '<div class="payvault-decision-card"><div class="payvault-decision-icon">' + icons.trash + '</div><div class="payvault-decision-title">' + title + '</div><div class="payvault-decision-text">' + text + '</div><div class="payvault-decision-actions"><button class="ghost" data-close-payslip-decision="1">Annulla</button><button class="ghost danger" data-confirm-payslip-decision="1">' + (deletingPhoto ? 'Rimuovi foto' : 'Elimina busta') + '</button></div></div>' +
      '</div>';
    }

    function renderPayslipsComplexLegacy() {
      ensurePayslipDraft();
      var draft = state.payslipDraft;
      var currentStatus = getPayslipStatus(draft);
      var completionScore = Math.max(0, Math.min(5, getPayslipCoreFieldScore(draft)));
      var completionPercent = Math.round((completionScore / 5) * 100);
      var missingFields = getPayslipMissingCoreFields(draft);
      var helperText = state.payslipStatus || (missingFields.length ? ('Controlla ancora: ' + missingFields.join(', ') + '.') : 'Foto e campi pronti. Puoi salvare.');
      var currentMonthLabel = getPayslipMonthLabel(draft);
      var currentCompany = String(draft.company || '').trim() || 'Ditta da confermare';
      var archive = (state.payslips || []).map(function (item) {
        var status = getPayslipStatus(item);
        return '<button class="paydesk-archive-card" data-open-payslip="' + item.id + '">' +
          '<div class="paydesk-archive-thumb' + (item.imageData ? '' : ' empty') + '">' +
            (item.imageData ? '<img src="' + item.imageData + '" alt="Anteprima ' + escapeHtml(getPayslipMonthLabel(item)) + '">' : icons.receipt) +
          '</div>' +
          '<div class="paydesk-archive-copy">' +
            '<div class="paydesk-archive-topline"><div><div class="paydesk-archive-month">' + getPayslipMonthLabel(item) + '</div><div class="paydesk-archive-company">' + escapeHtml(item.company || 'Ditta da controllare') + '</div></div><span class="paydesk-badge paydesk-badge-' + status.tone + '">' + status.label + '</span></div>' +
            '<div class="paydesk-archive-values"><div><span>Netto</span><strong>' + formatMoneyEuro(item.netto) + '</strong></div><div><span>Lordo</span><strong>' + formatMoneyEuro(item.lordo) + '</strong></div></div>' +
          '</div>' +
        '</button>';
      }).join('');
      return '<div class="top top-centered page-top"><div class="title">Buste paga</div></div>' +
        '<div class="stack paydesk-stack">' +
          '<div class="card paydesk-hero"><div class="card-body paydesk-hero-body">' +
            '<div class="paydesk-hero-copy">' +
              '<div class="paydesk-kicker">Foto + 5 dati</div>' +
              '<div class="paydesk-title">Scatta la busta, controlla e salva</div>' +
              '<div class="paydesk-copy">GestOre prova a leggere mese, anno, ditta, netto e lordo. Tu confermi i campi e tieni anche la foto nell\'archivio.</div>' +
              '<div class="paydesk-actions"><button class="solid" data-trigger-payslip-camera="1" ' + (state.payslipBusy ? 'disabled' : '') + '>' + (state.payslipBusy ? 'Lettura in corso...' : 'Scatta foto') + '</button><button class="ghost" data-trigger-payslip-gallery="1" ' + (state.payslipBusy ? 'disabled' : '') + '>Apri galleria</button></div>' +
              '<div class="paydesk-tip-row"><span>Foto dritta</span><span>Buona luce</span><span>Busta intera</span></div>' +
            '</div>' +
            '<div class="paydesk-summary-card">' +
              '<div class="paydesk-summary-label">Busta corrente</div>' +
              '<div class="paydesk-summary-month" data-payslip-period-value>' + escapeHtml(currentMonthLabel) + '</div>' +
              '<div class="paydesk-summary-company" data-payslip-company-value>' + escapeHtml(currentCompany) + '</div>' +
              '<div class="paydesk-progress"><span data-payslip-progress-fill style="width:' + completionPercent + '%;"></span></div>' +
              '<div class="paydesk-summary-meta"><span data-payslip-score-count>' + completionScore + '/5 dati</span><span>' + (state.payslips || []).length + ' archiviate</span></div>' +
            '</div>' +
          '</div></div>' +
          '<div class="card paydesk-editor"><div class="card-body paydesk-editor-body">' +
            '<div class="paydesk-head"><div><div class="section-title" style="margin:0;">Busta corrente</div><div class="small muted">Controlla i dati letti e salva tutto in un attimo.</div></div><button class="ghost mini-btn" data-reset-payslip="1" ' + (state.payslipBusy ? 'disabled' : '') + '>Nuova</button></div>' +
            '<div class="paydesk-assistant"><div class="paydesk-assistant-label">Assistente</div><div class="paydesk-assistant-text" data-payslip-guide-text>' + escapeHtml(helperText) + '</div></div>' +
            '<div class="paydesk-editor-grid">' +
              (draft.imageData
                ? '<div class="paydesk-photo-panel"><div class="paydesk-photo-head"><div class="paydesk-photo-label">Foto salvata</div><div class="small muted">Resta dentro la busta per ritrovarla quando vuoi.</div></div><div class="paydesk-photo"><img src="' + draft.imageData + '" alt="Anteprima busta paga"></div><div class="paydesk-file-row"><span>Foto pronta</span>' + (draft.fileName ? '<span>' + escapeHtml(draft.fileName) + '</span>' : '') + '</div></div>'
                : '<div class="paydesk-empty-panel"><div class="paydesk-empty-icon">' + icons.receipt + '</div><div class="paydesk-empty-title">Carica la tua busta</div><div class="paydesk-empty-copy">Scatta o scegli una foto e GestOre riempie i campi principali al posto tuo.</div><div class="paydesk-empty-actions"><button class="solid" data-trigger-payslip-camera="1" ' + (state.payslipBusy ? 'disabled' : '') + '>Scatta foto</button><button class="ghost" data-trigger-payslip-gallery="1" ' + (state.payslipBusy ? 'disabled' : '') + '>Apri galleria</button></div></div>') +
              '<div class="paydesk-form-column">' +
                '<div class="paydesk-insight-card">' +
                  '<div class="paydesk-insight-head"><div><div class="paydesk-insight-label">Stato lettura</div><strong class="paydesk-insight-title">' + escapeHtml(currentMonthLabel) + '</strong></div><span class="paydesk-badge paydesk-badge-' + currentStatus.tone + '" data-payslip-status-label>' + currentStatus.label + '</span></div>' +
                  '<div class="paydesk-progress"><span data-payslip-progress-fill style="width:' + completionPercent + '%;"></span></div>' +
                  '<div class="paydesk-progress-copy" data-payslip-progress-copy>' + escapeHtml(missingFields.length ? ('Controlla ancora: ' + missingFields.join(', ') + '.') : 'Mese, anno, ditta, netto e lordo sono pronti.') + '</div>' +
                  '<div class="paydesk-values">' +
                    '<div class="paydesk-value-card"><span>Netto</span><strong data-payslip-netto-value>' + formatMoneyEuro(draft.netto) + '</strong></div>' +
                    '<div class="paydesk-value-card"><span>Lordo</span><strong data-payslip-lordo-value>' + formatMoneyEuro(draft.lordo) + '</strong></div>' +
                  '</div>' +
                '</div>' +
                '<div class="paydesk-form-card">' +
                  '<div class="paydesk-fields">' +
                    '<label class="paydesk-field"><span>Mese</span><select id="payslipMonth">' + monthNames.map(function (name, idx) { return '<option value="' + (idx + 1) + '" ' + (Number(draft.month) === (idx + 1) ? 'selected' : '') + '>' + name + '</option>'; }).join('') + '</select></label>' +
                    '<label class="paydesk-field"><span>Anno</span><input id="payslipYear" type="number" inputmode="numeric" value="' + escapeHtml(draft.year || new Date().getFullYear()) + '"></label>' +
                    '<label class="paydesk-field paydesk-field-full"><span>Ditta</span><input id="payslipCompany" type="text" value="' + escapeHtml(draft.company || '') + '" placeholder="Nome azienda"></label>' +
                    '<label class="paydesk-field"><span>Netto</span><input id="payslipNetto" type="text" inputmode="decimal" value="' + escapeHtml(formatEditorDecimal(draft.netto || 0)) + '"></label>' +
                    '<label class="paydesk-field"><span>Lordo</span><input id="payslipLordo" type="text" inputmode="decimal" value="' + escapeHtml(formatEditorDecimal(draft.lordo || 0)) + '"></label>' +
                  '</div>' +
                  '<div class="paydesk-form-actions"><button class="solid" data-save-payslip="1" ' + (state.payslipBusy ? 'disabled' : '') + '>Salva busta</button>' + (draft.id ? '<button class="ghost danger" data-delete-payslip="' + draft.id + '">Elimina</button>' : '') + '</div>' +
                '</div>' +
              '</div>' +
            '</div>' +
          '</div></div>' +
          '<div class="card paydesk-archive"><div class="card-body paydesk-archive-body">' +
            '<div class="paydesk-head"><div><div class="section-title" style="margin:0;">Archivio</div><div class="small muted">Apri una busta per rivedere foto e dati.</div></div><div class="small muted">' + (state.payslips || []).length + ' salvate</div></div>' +
            ((state.payslips && state.payslips.length) ? '<div class="paydesk-archive-list">' + archive + '</div>' : '<div class="paydesk-empty-archive"><div class="small muted">Quando salvi una busta la ritrovi qui con foto, ditta, netto e lordo.</div></div>') +
          '</div></div>' +
        '</div><input id="payslipFileInput" type="file" accept="image/*" hidden>';
    }

    function renderPayslipsPayvaultLegacy() {
      ensurePayslipDraft();
      var draft = state.payslipDraft;
      var photos = normalizePayslipPhotos(draft);
      var hasPhoto = photos.length > 0;
      var hasAmount = parseDecimalInput(draft.netto, 0) > 0;
      var canReset = Boolean(draft.id || hasPhoto || hasAmount);
      var savedCount = (state.payslips || []).length;
      var statusHtml = state.payslipStatus
        ? '<div class="payvault-status">' + escapeHtml(state.payslipStatus) + '</div>'
        : '';
      var gallery = photos.map(function (photo, index) {
        return '<div class="payvault-gallery-item">' +
          '<button class="payvault-gallery-open" data-view-payslip-photo="' + index + '" aria-label="Apri foto ' + (index + 1) + '"><img src="' + photo.data + '" alt="Foto ' + (index + 1) + ' della busta paga"><span>' + (index + 1) + '</span></button>' +
          '<button class="payvault-gallery-remove" data-remove-payslip-photo="' + index + '" aria-label="Rimuovi foto ' + (index + 1) + '">' + icons.x + '</button>' +
        '</div>';
      }).join('');
      var archive = (state.payslips || []).map(function (item) {
        var itemPhotos = normalizePayslipPhotos(item);
        var firstPhoto = itemPhotos[0] || null;
        return '<button class="payvault-item" data-open-payslip="' + item.id + '">' +
          '<span class="payvault-thumb' + (firstPhoto ? '' : ' is-empty') + '">' +
            (firstPhoto ? '<img src="' + firstPhoto.data + '" alt="Busta paga ' + escapeHtml(getPayslipMonthLabel(item)) + '">' : icons.receipt) +
            (itemPhotos.length > 1 ? '<b>' + itemPhotos.length + '</b>' : '') +
          '</span>' +
          '<span class="payvault-item-copy"><strong>' + escapeHtml(getPayslipMonthLabel(item)) + '</strong><small>' + itemPhotos.length + (itemPhotos.length === 1 ? ' foto salvata' : ' foto salvate') + '</small></span>' +
          '<span class="payvault-item-amount">' + formatMoneyEuro(item.netto) + '</span>' +
          '<span class="payvault-chevron">' + icons.right + '</span>' +
        '</button>';
      }).join('');
      return '<div class="profile-subpage-top payvault-profile-top"><button data-back-profile="1" aria-label="Torna al profilo">' + icons.left + '</button><div><span>PROFILO</span><h1>Buste paga</h1></div><i></i></div>' +
        '<div class="stack payvault-stack">' +
          '<section class="card payvault-card"><div class="card-body payvault-body">' +
            '<div class="payvault-head">' +
              '<div class="payvault-heading"><span class="payvault-heading-icon">' + icons.receipt + '</span><div><div class="payvault-kicker">NUOVA BUSTA</div><div class="payvault-title">Salva il cedolino</div></div></div>' +
              (canReset ? '<button class="ghost mini-btn payvault-new-btn" data-reset-payslip="1" ' + (state.payslipBusy ? 'disabled' : '') + '>Nuova</button>' : '') +
            '</div>' +
            '<div class="payvault-flow" aria-hidden="true"><span class="is-current' + (hasPhoto ? ' is-complete' : '') + '"><b>1</b> Foto</span><i class="' + (hasPhoto ? 'is-complete' : '') + '"></i><span class="' + (hasPhoto ? 'is-current' : '') + (hasAmount ? ' is-complete' : '') + '"><b>2</b> Importo</span></div>' +
            (hasPhoto
              ? '<div class="payvault-gallery"><div class="payvault-gallery-head"><div><strong>' + photos.length + (photos.length === 1 ? ' foto pronta' : ' foto pronte') + '</strong><span>Tocca per visualizzare</span></div><span>' + photos.length + '/' + MAX_PAYSLIP_PHOTOS + '</span></div><div class="payvault-gallery-grid">' + gallery + '</div><div class="payvault-upload-actions payvault-gallery-actions"><button class="ghost" data-trigger-payslip-camera="1" ' + (state.payslipBusy ? 'disabled' : '') + '>Scatta ancora</button><button class="ghost" data-trigger-payslip-gallery="1" ' + (state.payslipBusy ? 'disabled' : '') + '>Aggiungi foto</button></div></div>'
              : '<div class="payvault-capture"><span class="payvault-upload-icon">' + icons.receipt + '</span><div class="payvault-capture-copy"><strong>Aggiungi la busta paga</strong><span>Fotografa il cedolino o scegli fino a ' + MAX_PAYSLIP_PHOTOS + ' immagini.</span></div><div class="payvault-upload-actions"><button class="solid" data-trigger-payslip-camera="1" ' + (state.payslipBusy ? 'disabled' : '') + '>' + (state.payslipBusy ? 'Caricamento...' : 'Scatta') + '</button><button class="ghost" data-trigger-payslip-gallery="1" ' + (state.payslipBusy ? 'disabled' : '') + '>Galleria</button></div></div>') +
            '<label class="payvault-amount"><span><b>Importo ricevuto</b><small>Inseriscilo manualmente</small></span><div class="payvault-amount-input"><b>EUR</b><input id="payslipNetto" type="text" inputmode="decimal" autocomplete="off" value="' + escapeHtml(formatEditorDecimal(draft.netto || 0)) + '" placeholder="0,00"></div></label>' +
            statusHtml +
            '<div class="payvault-actions"><button class="solid payvault-save" data-save-payslip="1" ' + (state.payslipBusy ? 'disabled' : '') + '>Salva busta paga</button>' +
              (draft.id ? '<button class="ghost danger" data-delete-payslip="' + draft.id + '">Elimina</button>' : '') +
            '</div>' +
          '</div></section>' +
          '<section class="card payvault-archive"><div class="card-body payvault-archive-body">' +
            '<div class="payvault-archive-head"><div><div class="payvault-kicker">ARCHIVIO</div><div class="section-title">Le tue buste</div></div><span>' + savedCount + '</span></div>' +
            ((state.payslips && state.payslips.length)
              ? '<div class="payvault-list">' + archive + '</div>'
              : '<div class="payvault-empty"><span class="payvault-empty-icon">' + icons.receipt + '</span><strong>Archivio vuoto</strong><span>La prima busta salvata apparira qui.</span></div>') +
          '</div></section>' +
        '</div><input id="payslipFileInput" type="file" accept="image/*" multiple hidden>';
    }

    function renderPayrollPhotoGrid(photos, source, payslipId, editable) {
      return (photos || []).map(function (photo, index) {
        return '<div class="payroll-photo-tile">' +
          '<button class="payroll-photo-open" data-view-payslip-photo="' + index + '" data-payslip-source="' + source + '" data-payslip-id="' + escapeHtml(payslipId || '') + '" aria-label="Visualizza foto ' + (index + 1) + '"><img src="' + photo.data + '" alt="Foto ' + (index + 1) + ' della busta paga"><span>' + (index + 1) + '</span></button>' +
          (editable ? '<button class="payroll-photo-remove" data-remove-payslip-photo="' + index + '" aria-label="Rimuovi foto ' + (index + 1) + '">' + icons.trash + '</button>' : '') +
        '</div>';
      }).join('');
    }

    function getPayslipStatsRows() {
      return (state.payslips || []).map(function (item) {
        return {
          item: item,
          year: Number(item.year) || 0,
          month: Math.min(12, Math.max(1, Number(item.month) || 1)),
          amount: Math.max(0, parseDecimalInput(item.netto, 0))
        };
      }).filter(function (row) {
        return row.year > 0;
      }).sort(function (a, b) {
        return (a.year - b.year) || (a.month - b.month);
      });
    }

    function formatPayslipChartValue(value) {
      var amount = Math.max(0, Number(value) || 0);
      return amount ? (Math.round(amount).toLocaleString('it-IT') + ' EUR') : '--';
    }

    function buildPayslipStatsChart(monthTotals, latestMonthIndex) {
      var maximum = Math.max.apply(null, monthTotals.concat([0]));
      var chartMaximum = Math.max(100, maximum);
      var columns = monthTotals.map(function (amount, index) {
        var height = amount > 0 ? Math.max(4, (amount / chartMaximum) * 100) : 0;
        return '<div class="payroll-stats-chart-month' + (index === latestMonthIndex ? ' is-latest' : '') + '" aria-label="' + escapeHtml(monthNames[index] + ': ' + (amount ? formatMoneyEuro(amount) : 'nessun importo')) + '">' +
          '<span>' + formatPayslipChartValue(amount) + '</span>' +
          '<div><i style="height:' + height.toFixed(2) + '%"></i></div>' +
          '<strong>' + monthNames[index].slice(0, 3).toUpperCase() + '</strong>' +
        '</div>';
      }).join('');
      return '<div class="payroll-stats-chart payroll-stats-readable-chart" role="img" aria-label="Andamento mensile degli importi netti">' +
        '<div class="payroll-stats-chart-scroll"><div class="payroll-stats-chart-plot">' + columns + '</div></div>' +
        '<div class="payroll-stats-chart-hint"><span>Scorri per vedere tutti i mesi</span>' + icons.right + '</div>' +
      '</div>';
    }

    function renderPayslipStatsV2() {
      var rows = getPayslipStatsRows();
      var availableYears = rows.map(function (row) { return row.year; }).filter(function (year, index, list) { return list.indexOf(year) === index; });
      var selectedYear = Number(state.payslipStatsYear) || (availableYears.length ? availableYears[availableYears.length - 1] : new Date().getFullYear());
      state.payslipStatsYear = selectedYear;
      var yearRows = rows.filter(function (row) { return row.year === selectedYear; });
      var monthTotals = monthNames.map(function () { return 0; });
      yearRows.forEach(function (row) { monthTotals[row.month - 1] += row.amount; });
      var filledMonths = monthTotals.map(function (amount, index) { return { amount: amount, index: index }; }).filter(function (month) { return month.amount > 0; });
      var total = filledMonths.reduce(function (sum, month) { return sum + month.amount; }, 0);
      var average = filledMonths.length ? total / filledMonths.length : 0;
      var best = filledMonths.slice().sort(function (a, b) { return b.amount - a.amount; })[0] || null;
      var latest = filledMonths[filledMonths.length - 1] || null;
      var previous = filledMonths.length > 1 ? filledMonths[filledMonths.length - 2] : null;
      var trendAmount = latest && previous ? latest.amount - previous.amount : 0;
      var trendClass = trendAmount > 0 ? 'is-positive' : (trendAmount < 0 ? 'is-negative' : 'is-neutral');
      var trendText = latest && previous
        ? ((trendAmount > 0 ? '+' : (trendAmount < 0 ? '-' : '')) + formatMoneyEuro(Math.abs(trendAmount)) + ' rispetto a ' + monthNames[previous.index])
        : (latest ? 'Aggiungi un altro mese per vedere il confronto' : 'Nessun importo salvato per questo anno');
      var recentRows = filledMonths.slice().reverse().slice(0, 4).map(function (month) {
        return '<div class="payroll-stats-month-row"><span><i style="--payroll-month-strength:' + Math.max(0.16, month.amount / Math.max(1, best ? best.amount : month.amount)).toFixed(2) + '"></i><strong>' + escapeHtml(monthNames[month.index]) + '</strong></span><b>' + formatMoneyEuro(month.amount) + '</b></div>';
      }).join('');
      return '<div class="profile-subpage-top payroll-page-top payroll-stats-top"><button data-close-payslip-stats="1" aria-label="Torna alle buste paga">' + icons.left + '</button><div><span>BUSTE PAGA</span><h1>Statistiche paga</h1></div><i></i></div>' +
        '<div class="stack payroll-stats-stack">' +
          '<section class="payroll-stats-hero">' +
            '<div class="payroll-stats-hero-head"><div><small>NETTO RICEVUTO</small><h2>' + selectedYear + '</h2></div><div class="payroll-stats-year-control"><button data-payslip-stats-year="-1" aria-label="Anno precedente">' + icons.left + '</button><strong>' + selectedYear + '</strong><button data-payslip-stats-year="1" aria-label="Anno successivo">' + icons.right + '</button></div></div>' +
            '<strong class="payroll-stats-total">' + (filledMonths.length ? formatMoneyEuro(total) : '--') + '</strong><p>' + (filledMonths.length ? ('Totale di ' + filledMonths.length + (filledMonths.length === 1 ? ' mese con importo salvato' : ' mesi con importo salvato')) : 'Salva una busta paga per iniziare a vedere l\'andamento.') + '</p>' +
          '</section>' +
          '<section class="payroll-stats-metrics" aria-label="Riepilogo statistiche paga">' +
            '<div><span>MEDIA MESE</span><strong>' + (average ? formatMoneyEuro(average) : '--') + '</strong><small>mesi presenti</small></div>' +
            '<div><span>MESE MIGLIORE</span><strong>' + (best ? escapeHtml(monthNames[best.index]) : '--') + '</strong><small>' + (best ? formatMoneyEuro(best.amount) : 'nessun dato') + '</small></div>' +
            '<div><span>BUSTE</span><strong>' + yearRows.length + '</strong><small>nel ' + selectedYear + '</small></div>' +
          '</section>' +
          '<section class="payroll-stats-panel payroll-stats-chart-panel">' +
            '<div class="payroll-stats-section-head"><div><small>ANDAMENTO</small><h2>Netto mese per mese</h2></div><span>EUR</span></div>' +
            '<div class="payroll-stats-chart-wrap">' + buildPayslipStatsChart(monthTotals, latest ? latest.index : -1) + (filledMonths.length ? '' : '<div class="payroll-stats-empty-chart"><strong>Grafico ancora vuoto</strong><span>Compariranno qui solo gli importi che hai inserito.</span></div>') + '</div>' +
          '</section>' +
          '<section class="payroll-stats-trend ' + trendClass + '"><span>' + icons.activity + '</span><div><small>ULTIMO CONFRONTO</small><strong>' + escapeHtml(trendText) + '</strong></div></section>' +
          (recentRows ? '<section class="payroll-stats-panel payroll-stats-months"><div class="payroll-stats-section-head"><div><small>ULTIMI MESI</small><h2>Importi archiviati</h2></div></div><div>' + recentRows + '</div></section>' : '') +
          '<p class="payroll-stats-disclaimer">Le statistiche usano soltanto il netto che hai inserito nelle buste paga. Nessun dato viene stimato automaticamente.</p>' +
        '</div>';
    }

    function renderPayslipArchiveV2() {
      var items = (state.payslips || []).slice();
      var totalAmount = items.reduce(function (sum, item) { return sum + Math.max(0, parseDecimalInput(item.netto, 0)); }, 0);
      var latest = items[0] || null;
      var grouped = {};
      items.forEach(function (item) {
        var year = String(Number(item.year) || new Date().getFullYear());
        if (!grouped[year]) grouped[year] = [];
        grouped[year].push(item);
      });
      var archiveHtml = Object.keys(grouped).sort(function (a, b) { return Number(b) - Number(a); }).map(function (year) {
        var rows = grouped[year].map(function (item) {
          var photos = normalizePayslipPhotos(item);
          var photoCount = getPayslipPhotoCount(item);
          var cover = photos[0] || null;
          return '<button class="payroll-archive-row" data-open-payslip="' + escapeHtml(item.id) + '">' +
            '<span class="payroll-archive-thumb' + (cover ? '' : ' is-empty') + '">' + (cover ? '<img src="' + cover.data + '" alt="Anteprima busta paga">' : icons.receipt) + (photoCount > 1 ? '<b>' + photoCount + '</b>' : '') + '</span>' +
            '<span class="payroll-archive-copy"><strong>' + escapeHtml(getPayslipMonthLabel(item)) + '</strong><small>' + photoCount + (photoCount === 1 ? ' foto' : ' foto') + ' salvate</small></span>' +
            '<span class="payroll-archive-amount">' + formatMoneyEuro(item.netto) + '</span><span class="payroll-archive-chevron">' + icons.right + '</span>' +
          '</button>';
        }).join('');
        return '<section class="payroll-year-group"><div class="payroll-year-head"><span>' + year + '</span><small>' + grouped[year].length + (grouped[year].length === 1 ? ' busta' : ' buste') + '</small></div><div class="payroll-archive-list">' + rows + '</div></section>';
      }).join('');
      return '<div class="profile-subpage-top payroll-page-top"><button data-back-profile="1" aria-label="Torna al profilo">' + icons.left + '</button><div><span>DOCUMENTI</span><h1>Buste paga</h1></div><i></i></div>' +
        '<div class="stack payroll-stack">' +
          '<section class="payroll-archive-hero"><div class="payroll-archive-hero-copy"><span class="payroll-hero-icon">' + icons.receipt + '</span><div><small>IL TUO ARCHIVIO</small><h2>Buste paga, senza confusione</h2><p>Ogni busta contiene soltanto le sue foto e l\'importo ricevuto.</p></div></div><div class="payroll-archive-actions"><button class="payroll-stats-button" data-open-payslip-stats="1"><span>' + icons.activity + '</span>Statistiche paga</button><button class="solid payroll-add-button" data-new-payslip="1"><b>+</b> Aggiungi busta</button></div></section>' +
          '<section class="payroll-overview" aria-label="Riepilogo archivio"><div><span>BUSTE</span><strong>' + items.length + '</strong><small>salvate</small></div><div><span>TOTALE</span><strong>' + (items.length ? formatMoneyEuro(totalAmount) : '--') + '</strong><small>importi archiviati</small></div><div><span>ULTIMA</span><strong>' + (latest ? escapeHtml(monthNames[Math.max(0, Number(latest.month || 1) - 1)].slice(0, 3)) : '--') + '</strong><small>' + (latest ? escapeHtml(String(latest.year || '')) : 'nessuna') + '</small></div></section>' +
          (items.length ? archiveHtml : '<section class="payroll-empty"><span>' + icons.receipt + '</span><h2>Archivio ancora vuoto</h2><p>Aggiungi la prima busta: bastano una foto e l\'importo ricevuto.</p><button class="solid" data-new-payslip="1">Aggiungi la prima busta</button></section>') +
        '</div>';
    }

    function renderPayslipDetailV2(payslip) {
      var photos = normalizePayslipPhotos(payslip);
      var photoCount = getPayslipPhotoCount(payslip);
      var photosLoading = Boolean(payslip.photosDeferred && state.payslipHydratingId === payslip.id);
      var created = new Date(Number(payslip.createdAt) || Date.now());
      var createdLabel = created.toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' });
      var payslipNotes = String(payslip.notes || '').trim();
      var hourlyRate = parseDecimalInput(payslip.hourlyRate, 0);
      var overtimeRate = parseDecimalInput(payslip.overtimeRate, 0);
      return '<div class="profile-subpage-top payroll-page-top"><button data-close-payslip-detail="1" aria-label="Torna all\'archivio">' + icons.left + '</button><div><span>ARCHIVIO</span><h1>Dettaglio busta</h1></div><i></i></div>' +
        '<div class="stack payroll-stack payroll-detail-stack">' +
          '<section class="payroll-detail-hero"><div><small>BUSTA PAGA</small><h2>' + escapeHtml(getPayslipMonthLabel(payslip)) + '</h2><span>Salvata il ' + escapeHtml(createdLabel) + '</span></div><strong>' + formatMoneyEuro(payslip.netto) + '</strong></section>' +
          '<section class="payroll-panel payroll-documents"><div class="payroll-section-head"><div><small>DOCUMENTI</small><h2>' + (photosLoading ? 'Carico le foto...' : (photoCount + (photoCount === 1 ? ' foto salvata' : ' foto salvate'))) + '</h2></div><span class="payroll-readonly-badge">Sola lettura</span></div>' +
            (photos.length ? '<div class="payroll-photo-grid is-readonly">' + renderPayrollPhotoGrid(photos, 'archive', payslip.id, false) + '</div>' : '') +
            '<p class="payroll-help">' + (photosLoading ? 'Recupero solo i documenti di questa busta dal database.' : 'Tocca una foto per aprirla a schermo intero. Da questa vista non puoi modificare o cancellare immagini.') + '</p>' +
          '</section>' +
          '<section class="payroll-detail-info"><div><span>PERIODO</span><strong>' + escapeHtml(getPayslipMonthLabel(payslip)) + '</strong></div><div><span>IMPORTO RICEVUTO</span><strong>' + formatMoneyEuro(payslip.netto) + '</strong></div></section>' +
          '<section class="payroll-panel payroll-detail-compensation"><div class="payroll-section-head"><div><small>DATI DEL MESE</small><h2>Tariffe e note</h2></div></div>' +
            '<div class="payroll-detail-rate-grid"><div><span>PAGA ORARIA</span><strong>' + (hourlyRate > 0 ? (formatMoneyEuro(hourlyRate) + '/h') : '--') + '</strong></div><div><span>ORA STRAORDINARIA</span><strong>' + (overtimeRate > 0 ? (formatMoneyEuro(overtimeRate) + '/h') : '--') + '</strong></div></div>' +
            '<div class="payroll-detail-notes"><span>NOTE</span><p>' + (payslipNotes ? escapeHtml(payslipNotes) : 'Nessuna nota per questo mese.') + '</p></div>' +
          '</section>' +
          '<div class="payroll-detail-actions"><button class="solid" data-edit-payslip="' + escapeHtml(payslip.id) + '">Modifica busta</button><button class="ghost danger" data-delete-payslip="' + escapeHtml(payslip.id) + '">Elimina</button></div>' +
        '</div>';
    }

    function renderPayslipEditorV2() {
      ensurePayslipDraft();
      var draft = state.payslipDraft;
      var photos = normalizePayslipPhotos(draft);
      var editing = Boolean(draft.id);
      var previousRates = findPreviousPayslipWithRates(draft);
      var reuseRates = Boolean(draft.reusePreviousRates);
      var reuseHelp = previousRates
        ? ('Copia da ' + getPayslipMonthLabel(previousRates))
        : 'Nessun mese precedente con tariffe salvate';
      var busyLabel = state.payslipStatus === 'Salvataggio nel database...' ? 'Salvataggio...' : 'Preparazione foto...';
      var statusHtml = state.payslipStatus ? '<div class="payroll-status">' + escapeHtml(state.payslipStatus) + '</div>' : '';
      return '<div class="profile-subpage-top payroll-page-top"><button data-close-payslip-editor="1" aria-label="Annulla e torna indietro">' + icons.left + '</button><div><span>' + (editing ? 'MODIFICA' : 'NUOVA BUSTA') + '</span><h1>' + (editing ? 'Modifica busta' : 'Aggiungi busta') + '</h1></div><i></i></div>' +
        '<div class="stack payroll-stack payroll-editor-stack">' +
          '<section class="payroll-editor-intro"><span>' + icons.receipt + '</span><div><h2>' + (editing ? escapeHtml(getPayslipMonthLabel(draft)) : 'Nuova busta paga') + '</h2><p>Salva foto, importo e riferimenti del mese in un unico posto.</p></div></section>' +
          '<section class="payroll-panel"><div class="payroll-section-head"><div><small>1. PERIODO</small><h2>A quale mese appartiene?</h2></div></div><div class="payroll-period-grid"><label><span>Mese</span><select id="payslipMonth">' + monthNames.map(function (name, index) { return '<option value="' + (index + 1) + '" ' + (Number(draft.month) === index + 1 ? 'selected' : '') + '>' + name + '</option>'; }).join('') + '</select></label><label><span>Anno</span><input id="payslipYear" type="number" min="2000" max="2100" inputmode="numeric" value="' + escapeHtml(draft.year || new Date().getFullYear()) + '"></label></div></section>' +
          '<section class="payroll-panel"><div class="payroll-section-head"><div><small>2. FOTO</small><h2>' + (photos.length ? (photos.length + (photos.length === 1 ? ' foto aggiunta' : ' foto aggiunte')) : 'Aggiungi il cedolino') + '</h2></div><span>' + photos.length + '/' + MAX_PAYSLIP_PHOTOS + '</span></div>' +
            (photos.length ? '<div class="payroll-photo-grid">' + renderPayrollPhotoGrid(photos, 'draft', '', true) + '</div>' : '<div class="payroll-photo-empty"><span>' + icons.receipt + '</span><strong>Nessuna foto</strong><p>Fotografa tutte le pagine oppure sceglile dalla galleria.</p></div>') +
            '<div class="payroll-upload-actions"><button class="solid" data-trigger-payslip-camera="1" ' + (state.payslipBusy ? 'disabled' : '') + '>Scatta foto</button><button class="ghost" data-trigger-payslip-gallery="1" ' + (state.payslipBusy ? 'disabled' : '') + '>Apri galleria</button></div>' +
          '</section>' +
          '<section class="payroll-panel"><div class="payroll-section-head"><div><small>3. IMPORTO</small><h2>Quanto hai ricevuto?</h2></div></div><label class="payroll-net-input"><span>EUR</span><input id="payslipNetto" type="text" inputmode="decimal" autocomplete="off" value="' + escapeHtml(formatEditorDecimal(draft.netto || 0)) + '" placeholder="0,00"></label><p class="payroll-help">Inserisci il netto effettivamente accreditato.</p></section>' +
          '<section class="payroll-panel payroll-rates-panel"><div class="payroll-section-head"><div><small>4. TARIFFE E NOTE</small><h2>Dettagli del mese</h2></div></div>' +
            '<button type="button" class="payroll-rate-reuse ' + (reuseRates ? 'is-on' : '') + '" data-toggle-payslip-rate-reuse="1" aria-pressed="' + (reuseRates ? 'true' : 'false') + '" ' + (!previousRates && !reuseRates ? 'disabled' : '') + '><span class="payroll-rate-reuse-icon">' + icons.activity + '</span><span class="payroll-rate-reuse-copy"><strong>Usa le tariffe del mese precedente</strong><small>' + escapeHtml(reuseHelp) + '</small></span><span class="payroll-rate-switch"><i></i></span></button>' +
            '<div class="payroll-rate-grid"><label class="payroll-rate-field"><span>PAGA ORARIA</span><div><b>EUR</b><input id="payslipHourlyRate" type="text" inputmode="decimal" autocomplete="off" value="' + escapeHtml(formatEditorDecimal(draft.hourlyRate || 0)) + '" placeholder="0,00" ' + (reuseRates ? 'readonly' : '') + '><em>/h</em></div></label><label class="payroll-rate-field"><span>STRAORDINARIO</span><div><b>EUR</b><input id="payslipOvertimeRate" type="text" inputmode="decimal" autocomplete="off" value="' + escapeHtml(formatEditorDecimal(draft.overtimeRate || 0)) + '" placeholder="0,00" ' + (reuseRates ? 'readonly' : '') + '><em>/h</em></div></label></div>' +
            '<label class="payroll-notes-field"><span>NOTE DEL MESE</span><textarea id="payslipNotes" rows="3" maxlength="1000" placeholder="Aggiungi una nota sulla busta paga...">' + escapeHtml(draft.notes || '') + '</textarea></label>' +
          '</section>' +
          statusHtml +
          '<button class="solid payroll-editor-save" data-save-payslip="1" ' + (state.payslipBusy ? 'disabled' : '') + '>' + (state.payslipBusy ? busyLabel : (editing ? 'Salva modifiche' : 'Salva busta paga')) + '</button>' +
        '</div><input id="payslipFileInput" type="file" accept="image/*" multiple hidden>';
    }

    function renderPayslips() {
      if (state.payslipStatsOpen) return renderPayslipStatsV2();
      if (state.payslipEditorOpen) return renderPayslipEditorV2();
      if (state.payslipDetailId) {
        var detail = (state.payslips || []).find(function (item) { return item.id === state.payslipDetailId; });
        if (detail) return renderPayslipDetailV2(detail);
      }
      return renderPayslipArchiveV2();
    }

    function renderProfile() {
      var rawName = String(state.settingsDraft.userName || '').trim() || 'Utente';
      var safeName = escapeHtml(rawName);
      var initials = rawName.split(/\s+/).slice(0, 2).map(function (part) { return part.charAt(0).toUpperCase(); }).join('') || 'U';
      var todayLabel = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
      var savedCount = (state.payslips || []).length;
      var dailyTarget = Math.max(0, Number(state.settingsDraft.dailyTarget) || 0).toLocaleString('it-IT', { maximumFractionDigits: 1 }) + 'h';
      var weeklyTarget = Math.max(0, Number(state.settingsDraft.weeklyTarget) || 0).toLocaleString('it-IT', { maximumFractionDigits: 1 }) + 'h';
      var accountUser = state.account && state.account.user ? state.account.user : {};
      var accountManagementRow = accountUser.role === 'owner' && !accountUser.impersonating
        ? '<button class="profile-row profile-owner-row" data-open-profile-section="settings" data-settings-section="accounts"><span class="profile-row-icon is-green">' + icons.lock + '</span><span class="profile-row-copy"><strong>Gestione account</strong><small>Visualizza, apri o elimina i profili registrati</small></span><span class="profile-row-value is-live">Proprietario</span><span class="profile-row-chevron">' + icons.right + '</span></button>'
        : '';
      return '<div class="profile-page profile-page-v2">' +
        '<header class="profile-v2-top"><div><span>AREA PERSONALE</span><div class="profile-v2-wordmark">Gest<span>Ore</span></div></div></header>' +
        '<section class="profile-v2-hero">' +
          '<div class="profile-v2-identity"><span class="profile-v2-avatar">' + escapeHtml(initials) + '</span><div class="profile-v2-copy"><span>IL TUO PROFILO</span><h1>Ciao, ' + safeName + '</h1><p>' + escapeHtml(todayLabel) + '</p></div></div>' +
          '<div class="profile-v2-safe"><span>' + icons.check + '</span><div><strong>Dati al sicuro</strong><small>' + escapeHtml(getSyncStatusMessage()) + '</small></div><i></i></div>' +
        '</section>' +
        '<section class="profile-v2-summary" aria-label="Riepilogo profilo">' +
          '<div><span>OGGI</span><strong>' + dailyTarget + '</strong><small>target</small></div>' +
          '<div><span>SETTIMANA</span><strong>' + weeklyTarget + '</strong><small>target</small></div>' +
          '<div><span>ARCHIVIO</span><strong>' + savedCount + '</strong><small>' + (savedCount === 1 ? 'busta' : 'buste') + '</small></div>' +
        '</section>' +
        '<div class="profile-section-title">Gestione personale</div>' +
        '<section class="profile-group profile-v2-group">' +
          accountManagementRow +
          '<button class="profile-row" data-open-profile-section="settings"><span class="profile-row-icon is-blue">' + icons.settings + '</span><span class="profile-row-copy"><strong>Impostazioni</strong><small>Profilo, calendario, notifiche, privacy e dati</small></span><span class="profile-row-value">5 sezioni</span><span class="profile-row-chevron">' + icons.right + '</span></button>' +
          '<button class="profile-row" data-open-profile-section="payslips"><span class="profile-row-icon is-violet">' + icons.receipt + '</span><span class="profile-row-copy"><strong>Buste paga</strong><small>' + savedCount + (savedCount === 1 ? ' busta salvata' : ' buste salvate') + '</small></span><span class="profile-row-value">Apri</span><span class="profile-row-chevron">' + icons.right + '</span></button>' +
          '<button class="profile-row" data-open-profile-section="exports"><span class="profile-row-icon is-blue">' + icons.download + '</span><span class="profile-row-copy"><strong>Report e file</strong><small>PDF mensile, PDF annuale ed Excel</small></span><span class="profile-row-chevron">' + icons.right + '</span></button>' +
        '</section>' +
        '<div class="profile-app-footer"><strong>GestOre v' + escapeHtml(state.settings.version) + '</strong><span>Le tue ore, sempre sotto controllo</span></div>' +
      '</div>';
    }

    function renderExports() {
      var monthLabel = escapeHtml(monthNames[state.currentMonth.getMonth()]);
      var yearLabel = escapeHtml(String(state.currentMonth.getFullYear()));
      var entriesCount = Object.keys(state.entries || {}).length;
      return '<div class="exports-page">' +
        '<div class="profile-subpage-top"><button data-back-profile="1" aria-label="Torna al profilo">' + icons.left + '</button><div><span>DATI E ARCHIVIO</span><h1>Esporta dati</h1></div><i></i></div>' +
        '<section class="exports-hero"><span class="exports-hero-icon">' + icons.download + '</span><div><span>ARCHIVIO GESTORE</span><h2>I tuoi dati, nel formato giusto</h2><p>' + entriesCount + (entriesCount === 1 ? ' giornata registrata' : ' giornate registrate') + ' disponibili per l\'esportazione.</p></div></section>' +
        '<div class="settings-modern-section-title">Tutti i dati</div>' +
        '<section class="exports-group"><button class="exports-row" data-export-csv="1"><span class="exports-row-icon is-green">' + icons.activity + '</span><span class="exports-row-copy"><strong>Esporta Excel</strong><small>Tutte le giornate e tutte le ore registrate</small></span><span class="exports-format">.CSV</span>' + icons.right + '</button></section>' +
        '<div class="settings-modern-section-title">Report PDF</div>' +
        '<section class="exports-group">' +
          '<button class="exports-row" data-export-report="1"><span class="exports-row-icon is-blue">' + icons.note + '</span><span class="exports-row-copy"><strong>' + monthLabel + ' ' + yearLabel + '</strong><small>Report completo del mese corrente</small></span><span class="exports-format">PDF</span>' + icons.right + '</button>' +
          '<button class="exports-row" data-export-report-year="1"><span class="exports-row-icon is-violet">' + icons.calendar + '</span><span class="exports-row-copy"><strong>Anno ' + yearLabel + '</strong><small>Riepilogo annuale nello stesso formato GestOre</small></span><span class="exports-format">PDF</span>' + icons.right + '</button>' +
        '</section>' +
        '<div class="exports-note"><span>' + icons.check + '</span><p>L\'esportazione crea una copia dei dati e non modifica nulla di ciò che hai salvato.</p></div>' +
      '</div>';
    }

    function renderSettingsLegacy() {
      var holidayHelper = escapeHtml(getHolidaySettingsHelperText(state.settingsDraft));
      var reminderHelper = escapeHtml(getReminderHelperText());
      var syncStatusMessage = escapeHtml(getSyncStatusMessage());
      var workdays = normalizeWeekdayList(state.settingsDraft.workdays || []);
      var restDays = normalizeWeekdayList(state.settingsDraft.autoRestDays || []);
      return '<div class="settings-modern-page">' +
        '<div class="profile-subpage-top"><button data-back-profile="1" aria-label="Torna al profilo">' + icons.left + '</button><div><span>PROFILO</span><h1>Impostazioni</h1></div><i></i></div>' +
        '<div class="settings-modern-section-title">Profilo e obiettivi</div>' +
        '<section class="settings-modern-group">' +
          '<label class="settings-modern-row settings-modern-input-row"><span class="settings-modern-icon is-blue">' + icons.user + '</span><span class="settings-modern-copy"><strong>Nome utente</strong><small>Come compari nell\'app</small></span><input id="userNameInput" type="text" maxlength="24" placeholder="Il tuo nome" value="' + escapeHtml(state.settingsDraft.userName || '') + '"></label>' +
          '<div class="settings-modern-divider"></div>' +
          '<div class="settings-target-grid"><label><span>Target settimana</span><div><input id="weeklyTargetInput" type="number" inputmode="decimal" min="0" step="0.5" value="' + state.settingsDraft.weeklyTarget + '"><b>h</b></div></label><label><span>Target giornaliero</span><div><input id="dailyTargetInput" type="number" inputmode="decimal" min="0" step="0.5" value="' + state.settingsDraft.dailyTarget + '"><b>h</b></div></label></div>' +
        '</section>' +
        '<div class="settings-modern-section-title">Calendario di lavoro</div>' +
        '<section class="settings-modern-group">' +
          '<div class="settings-modern-days"><div class="settings-modern-heading"><span class="settings-modern-icon is-blue">' + icons.calendar + '</span><div><strong>Giorni lavorativi</strong><small>Usati per target e riepiloghi</small></div></div><div class="workdays">' + workdayLabels.map(function (label, index) { return '<button class="day ' + (workdays.indexOf(index) !== -1 ? 'active' : '') + '" data-toggle-workday="' + index + '">' + label + '</button>'; }).join('') + '</div></div>' +
          '<div class="settings-modern-divider"></div>' +
          '<div class="settings-modern-days"><div class="settings-modern-heading"><span class="settings-modern-icon is-amber">R</span><div><strong>Riposo automatico</strong><small>I dati inseriti a mano hanno sempre precedenza</small></div></div><div class="workdays">' + workdayLabels.map(function (label, index) { return '<button class="day ' + (restDays.indexOf(index) !== -1 ? 'rest-active' : '') + '" data-toggle-auto-rest-day="' + index + '">' + label + '</button>'; }).join('') + '</div></div>' +
          '<div class="settings-modern-divider"></div>' +
          '<div class="settings-modern-toggle-row"><span class="settings-modern-icon is-violet">F</span><span class="settings-modern-copy"><strong>Festività nei weekend</strong><small>' + holidayHelper + '</small></span><button class="toggle-btn ' + (state.settingsDraft.holidayHoursOnOffDays ? 'on' : '') + '" data-toggle-holiday-offdays="1" aria-label="Festività nei weekend"><span class="knob"></span></button></div>' +
        '</section>' +
        '<div class="settings-modern-section-title">Notifiche e privacy</div>' +
        '<section class="settings-modern-group">' +
          '<div class="settings-modern-toggle-row"><span class="settings-modern-icon is-violet">' + icons.bell + '</span><span class="settings-modern-copy"><strong>Promemoria locale</strong><small>' + reminderHelper + '</small></span><button class="toggle-btn ' + (state.settings.remindersEnabled ? 'on' : '') + '" data-toggle-reminders="1" aria-label="Promemoria locale"><span class="knob"></span></button></div>' +
          '<div class="settings-modern-reminder"><label><span>Orario</span><input id="reminderTimeInput" type="time" value="' + state.settings.reminderTime + '"></label><button data-test-notification="1">Invia test</button></div>' +
          '<div class="settings-modern-divider"></div>' +
          '<div class="settings-modern-toggle-row"><span class="settings-modern-icon is-green">' + icons.lock + '</span><span class="settings-modern-copy"><strong>Schermata privacy</strong><small>Nasconde i dati quando riapri l\'app</small></span><button class="toggle-btn ' + (state.settings.lockApp ? 'on' : '') + '" data-toggle-lock="1" aria-label="Schermata privacy"><span class="knob"></span></button></div>' +
        '</section>' +
        '<div class="settings-modern-section-title">Dati e sicurezza</div>' +
        '<section class="settings-modern-group">' +
          '<div class="settings-sync-row"><span class="settings-modern-icon is-green">' + icons.check + '</span><span class="settings-modern-copy"><strong>Salvataggio automatico</strong><small>' + syncStatusMessage + '</small></span><span class="settings-sync-live">Attivo</span></div>' +
        '</section>' +
        '<div class="settings-modern-footer"><span>GestOre</span><strong>Versione ' + escapeHtml(state.settings.version) + '</strong></div>' +
      '</div>';
    }

    function renderSettings() {
      var section = state.settingsSection || '';
      var workdays = normalizeWeekdayList(state.settingsDraft.workdays || []);
      var restDays = normalizeWeekdayList(state.settingsDraft.autoRestDays || []);
      var holidayHelper = escapeHtml(getHolidaySettingsHelperText(state.settingsDraft));
      var reminderHelper = escapeHtml(getReminderHelperText());
      var syncStatusMessage = escapeHtml(getSyncStatusMessage());
      var activeWorkdays = workdays.length ? workdays.map(function (index) { return weekNames[index]; }).join(', ') : 'Nessuno';
      var activeRestDays = restDays.length ? restDays.map(function (index) { return weekNames[index]; }).join(', ') : 'Nessuno';
      var reminderStatus = state.settings.remindersEnabled ? ('Attivo alle ' + state.settings.reminderTime) : 'Disattivato';
      var privacyStatus = state.settings.lockApp ? 'Attiva' : 'Disattivata';
      var targetStatus = (Number(state.settingsDraft.dailyTarget) || 0).toLocaleString('it-IT', { maximumFractionDigits: 1 }) + 'h al giorno';
      var topBar = function (title, isDetail) {
        return '<div class="settings-v2-top"><button ' + (isDetail ? 'data-back-settings="1"' : 'data-back-profile="1"') + ' aria-label="Torna al profilo">' + icons.left + '</button><div><span>IMPOSTAZIONI</span><h1>' + title + '</h1></div><i></i></div>';
      };
      var intro = function (tone, icon, kicker, title, copy) {
        return '<section class="settings-detail-intro is-' + tone + '"><span class="settings-detail-intro-icon">' + icon + '</span><div><span>' + kicker + '</span><h2>' + title + '</h2><p>' + copy + '</p></div></section>';
      };

      if (section === 'profile') {
        return '<div class="settings-modern-page settings-page-v2 settings-detail-page">' +
          topBar('Profilo e obiettivi', true) +
          intro('blue', icons.user, 'PERSONALE', 'Il tuo profilo', 'Aggiorna il nome mostrato nell&apos;app e i target usati nei riepiloghi.') +
          '<div class="settings-v2-section-title">Identit&agrave;</div>' +
          '<section class="settings-v2-group"><label class="settings-v2-input-row"><span class="settings-v2-icon is-blue">' + icons.user + '</span><span><strong>Nome utente</strong><small>Viene mostrato nel tuo profilo</small></span><input id="userNameInput" type="text" maxlength="24" placeholder="Il tuo nome" value="' + escapeHtml(state.settingsDraft.userName || '') + '"></label></section>' +
          '<div class="settings-v2-section-title">Obiettivi ore</div>' +
          '<section class="settings-v2-targets"><label><span>GIORNALIERO</span><div><input id="dailyTargetInput" type="number" inputmode="decimal" min="0" step="0.5" value="' + state.settingsDraft.dailyTarget + '"><b>ore</b></div><small>Usato nella scheda di ogni giornata</small></label><label><span>SETTIMANALE</span><div><input id="weeklyTargetInput" type="number" inputmode="decimal" min="0" step="0.5" value="' + state.settingsDraft.weeklyTarget + '"><b>ore</b></div><small>Usato nel riepilogo settimanale</small></label></section>' +
          '<div class="settings-v2-note"><span>' + icons.check + '</span><p>Le modifiche vengono salvate automaticamente senza cancellare le ore registrate.</p></div>' +
        '</div>';
      }

      if (section === 'calendar') {
        return '<div class="settings-modern-page settings-page-v2 settings-detail-page">' +
          topBar('Calendario di lavoro', true) +
          intro('blue', icons.calendar, 'ORGANIZZAZIONE', 'La tua settimana', 'Decidi quali giorni contribuiscono ai target e quali diventano riposo automatico.') +
          '<div class="settings-v2-section-title">Giorni lavorativi</div>' +
          '<section class="settings-v2-group settings-v2-days-card"><div class="settings-v2-row-heading"><span class="settings-v2-icon is-blue">' + icons.briefcase + '</span><span><strong>Settimana attiva</strong><small>' + escapeHtml(activeWorkdays) + '</small></span></div><div class="settings-v2-days">' + weekNames.map(function (label, index) { return '<button class="' + (workdays.indexOf(index) !== -1 ? 'is-active' : '') + '" data-toggle-workday="' + index + '" aria-pressed="' + (workdays.indexOf(index) !== -1 ? 'true' : 'false') + '"><span>' + label.slice(0, 1) + '</span><small>' + label + '</small></button>'; }).join('') + '</div></section>' +
          '<div class="settings-v2-section-title">Riposo automatico</div>' +
          '<section class="settings-v2-group settings-v2-days-card"><div class="settings-v2-row-heading"><span class="settings-v2-icon is-amber">' + icons.coffee + '</span><span><strong>Giorni di riposo</strong><small>' + escapeHtml(activeRestDays) + '</small></span></div><div class="settings-v2-days is-rest">' + weekNames.map(function (label, index) { return '<button class="' + (restDays.indexOf(index) !== -1 ? 'is-active' : '') + '" data-toggle-auto-rest-day="' + index + '" aria-pressed="' + (restDays.indexOf(index) !== -1 ? 'true' : 'false') + '"><span>' + label.slice(0, 1) + '</span><small>' + label + '</small></button>'; }).join('') + '</div><p>I dati inseriti manualmente hanno sempre la precedenza.</p></section>' +
          '<div class="settings-v2-section-title">Festivit&agrave;</div>' +
          '<section class="settings-v2-group"><div class="settings-v2-toggle-row"><span class="settings-v2-icon is-violet">' + icons.star + '</span><span class="settings-v2-copy"><strong>Ore nei giorni non lavorativi</strong><small>' + holidayHelper + '</small></span><button class="toggle-btn ' + (state.settingsDraft.holidayHoursOnOffDays ? 'on' : '') + '" data-toggle-holiday-offdays="1" aria-label="Ore festive nei giorni non lavorativi"><span class="knob"></span></button></div></section>' +
        '</div>';
      }

      if (section === 'notifications') {
        return '<div class="settings-modern-page settings-page-v2 settings-detail-page">' +
          topBar('Notifiche', true) +
          intro('violet', icons.bell, 'PROMEMORIA', 'Non dimenticare le ore', 'Scegli se ricevere un avviso locale e a che ora mostrarlo.') +
          '<div class="settings-v2-section-title">Promemoria giornaliero</div>' +
          '<section class="settings-v2-group">' +
            '<div class="settings-v2-toggle-row"><span class="settings-v2-icon is-violet">' + icons.bell + '</span><span class="settings-v2-copy"><strong>Promemoria locale</strong><small>' + reminderHelper + '</small></span><button class="toggle-btn ' + (state.settings.remindersEnabled ? 'on' : '') + '" data-toggle-reminders="1" aria-label="Promemoria locale"><span class="knob"></span></button></div>' +
            '<div class="settings-v2-divider"></div>' +
            '<div class="settings-v2-time-row"><label><span>ORARIO</span><input id="reminderTimeInput" type="time" value="' + state.settings.reminderTime + '"></label><button data-test-notification="1">' + icons.bell + '<span>Invia notifica di prova</span></button></div>' +
          '</section>' +
          '<div class="settings-v2-note"><span>' + icons.bell + '</span><p>Le notifiche vengono gestite dal dispositivo. Potrebbe essere necessario consentirle nelle impostazioni di iPhone.</p></div>' +
        '</div>';
      }

      if (section === 'privacy') {
        return '<div class="settings-modern-page settings-page-v2 settings-detail-page">' +
          topBar('Privacy e sicurezza', true) +
          intro('green', icons.lock, 'PROTEZIONE', 'I tuoi dati restano privati', 'Puoi nascondere il contenuto ogni volta che lasci o riapri GestOre.') +
          '<div class="settings-v2-section-title">Protezione app</div>' +
          '<section class="settings-v2-group"><div class="settings-v2-toggle-row settings-v2-privacy-toggle"><span class="settings-v2-icon is-green">' + icons.lock + '</span><span class="settings-v2-copy"><strong>Schermata privacy</strong><small>Nasconde ore, ferie e importi quando riapri l&apos;app</small></span><button class="toggle-btn ' + (state.settings.lockApp ? 'on' : '') + '" data-toggle-lock="1" aria-label="Schermata privacy"><span class="knob"></span></button></div></section>' +
          '<section class="settings-v2-security-info"><span>' + icons.check + '</span><div><strong>Nessuna modifica ai dati</strong><p>Questa opzione oscura solo lo schermo. Le giornate e le buste paga restano salvate normalmente.</p></div></section>' +
        '</div>';
      }

      if (section === 'data') {
        return '<div class="settings-modern-page settings-page-v2 settings-detail-page">' +
          topBar('Account e backup', true) +
          intro('green', icons.lock, 'DATABASE PERSONALE', 'I dati giusti, per ogni utente', 'Il server mantiene un database separato per ogni account. Da qui puoi salvarne una copia sul telefono.') +
          (typeof renderAccountDataSettings === 'function' ? renderAccountDataSettings() : '') +
          '<section class="settings-v2-version"><div><span>VERSIONE INSTALLATA</span><strong>GestOre ' + escapeHtml(state.settings.version) + '</strong></div><span>' + icons.check + '</span></section>' +
        '</div>';
      }

      if (section === 'accounts') {
        return '<div class="settings-modern-page settings-page-v2 settings-detail-page account-admin-page">' +
          topBar('Gestione account', true) +
          intro('blue', icons.user, 'AREA PROPRIETARIO', 'Profili e database', 'Controlla chi usa GestOre e apri un database senza conoscere la password dell&apos;utente.') +
          (typeof renderAdminAccountsSettings === 'function' ? renderAdminAccountsSettings() : '') +
        '</div>';
      }

      return '<div class="settings-modern-page settings-page-v2 settings-hub-page">' +
        topBar('Impostazioni', false) +
        '<section class="settings-hub-hero"><span class="settings-hub-hero-icon">' + icons.settings + '</span><div><span>CENTRO DI CONTROLLO</span><h2>Tutto al suo posto</h2><p>Ogni preferenza ha ora una sezione dedicata.</p></div><b>v' + escapeHtml(state.settings.version) + '</b></section>' +
        '<div class="settings-v2-section-title">Preferenze personali</div>' +
        '<section class="settings-hub-group">' +
          '<button class="settings-hub-row" data-open-settings-section="profile"><span class="settings-v2-icon is-blue">' + icons.user + '</span><span class="settings-v2-copy"><strong>Profilo e obiettivi</strong><small>Nome, target giornaliero e settimanale</small></span><span class="settings-hub-value">' + escapeHtml(targetStatus) + '</span><span class="settings-v2-chevron">' + icons.right + '</span></button>' +
          '<button class="settings-hub-row" data-open-settings-section="calendar"><span class="settings-v2-icon is-blue">' + icons.calendar + '</span><span class="settings-v2-copy"><strong>Calendario di lavoro</strong><small>Giorni attivi, riposi e festivit&agrave;</small></span><span class="settings-hub-value">' + workdays.length + ' giorni</span><span class="settings-v2-chevron">' + icons.right + '</span></button>' +
          '<button class="settings-hub-row" data-open-settings-section="notifications"><span class="settings-v2-icon is-violet">' + icons.bell + '</span><span class="settings-v2-copy"><strong>Notifiche</strong><small>Promemoria per registrare la giornata</small></span><span class="settings-hub-value">' + escapeHtml(reminderStatus) + '</span><span class="settings-v2-chevron">' + icons.right + '</span></button>' +
          '<button class="settings-hub-row" data-open-settings-section="privacy"><span class="settings-v2-icon is-green">' + icons.lock + '</span><span class="settings-v2-copy"><strong>Privacy e sicurezza</strong><small>Protezione quando riapri l&apos;app</small></span><span class="settings-hub-value">' + privacyStatus + '</span><span class="settings-v2-chevron">' + icons.right + '</span></button>' +
        '</section>' +
        '<div class="settings-v2-section-title">Dati e app</div>' +
        '<section class="settings-hub-group"><button class="settings-hub-row" data-open-settings-section="data"><span class="settings-v2-icon is-green">' + icons.lock + '</span><span class="settings-v2-copy"><strong>Account e backup</strong><small>Database personale e salvataggi sul telefono</small></span><span class="settings-hub-value is-live">Protetto</span><span class="settings-v2-chevron">' + icons.right + '</span></button></section>' +
        '<div class="settings-v2-footer"><strong>GestOre</strong><span>Le tue preferenze si salvano automaticamente</span></div>' +
      '</div>';
    }

    function renderPrivacyLock() {
      if (!state.privacyLocked) return '';
      return '<div class="privacy-lock-overlay"><div class="privacy-lock-card"><div class="privacy-lock-icon">' + icons.lock + '</div><div class="privacy-lock-title">GestOre nascosta</div><div class="privacy-lock-text">La schermata privacy e attiva. Tocca qui sotto per tornare all\'app.</div><div class="privacy-lock-meta">' + escapeHtml(getSyncStatusMessage()) + '</div><button class="solid privacy-lock-btn" data-unlock-app="1">Sblocca</button></div></div>';
    }

    function renderNav() {
      var items = [
        { key: 'calendar', label: 'Calendario', icon: icons.calendar },
        { key: 'stats', label: 'Statistiche', icon: icons.activity },
        { key: 'home', label: 'Home', icon: icons.home },
        { key: 'vacations', label: 'Ferie', icon: icons.umbrella },
        { key: 'profile', label: 'Profilo', icon: icons.user }
      ];
      var navActiveTab = state.activeTab === 'payslips' || state.activeTab === 'settings' || state.activeTab === 'exports' ? 'profile' : state.activeTab;
      var activeIndex = Math.max(0, items.findIndex(function (item) { return item.key === navActiveTab; }));
      var previousIndex = Number.isFinite(Number(state.navPreviousIndex)) ? Math.max(0, Math.min(4, Number(state.navPreviousIndex))) : activeIndex;
      var animatedClass = state.tabSwitchFx && previousIndex !== activeIndex ? ' nav-animated' : '';
      return '<div class="bottom-nav nav-motion-v2"><div class="nav-grid nav-grid-v2' + animatedClass + '" style="--nav-x:' + (activeIndex * 100) + '%;--nav-from-x:' + (previousIndex * 100) + '%">' +
        '<span class="nav-active-indicator" aria-hidden="true"></span>' + items.map(function (i, index) {
        var className = 'nav-btn nav-btn-v2' + (i.key === 'home' ? ' nav-home' : '') + (navActiveTab === i.key ? ' active' : '') + (state.tabSwitchFx && previousIndex === index && previousIndex !== activeIndex ? ' was-active' : '');
        return '<button class="' + className + '" data-tab="' + i.key + '"><span class="nav-icon-shell">' + i.icon + '</span><span class="nav-label">' + i.label + '</span></button>';
      }).join('') + '</div></div>';
    }

    function render() {
      var app = document.getElementById('app');
      if (!app) return;
      var switchClass = state.tabSwitchFx ? (' screen-switch screen-switch-' + (state.tabSwitchDir || 'forward')) : '';
      app.innerHTML =
        '<section class="screen home-screen ' + (state.activeTab === 'home' ? ('active' + switchClass) : '') + '">' + renderHome() + '</section>' +
        '<section class="screen calendar-screen ' + (state.activeTab === 'calendar' ? ('active' + switchClass) : '') + '">' + renderCalendar() + '</section>' +
        '<section class="screen stats-screen ' + (state.activeTab === 'stats' ? ('active' + switchClass) : '') + '">' + renderStats() + '</section>' +
        '<section class="screen vacations-screen ' + (state.activeTab === 'vacations' ? ('active' + switchClass) : '') + '">' + renderVacationScreen() + '</section>' +
        '<section class="screen profile-screen ' + (state.activeTab === 'profile' ? ('active' + switchClass) : '') + '">' + renderProfile() + '</section>' +
        '<section class="screen payslips-screen ' + (state.activeTab === 'payslips' ? ('active' + switchClass) : '') + '">' + renderPayslips() + '</section>' +
        '<section class="screen exports-screen ' + (state.activeTab === 'exports' ? ('active' + switchClass) : '') + '">' + renderExports() + '</section>' +
        '<section class="screen settings-screen ' + (state.activeTab === 'settings' ? ('active' + switchClass) : '') + '">' + renderSettings() + '</section>' +
        renderNav() + renderOverlay() + renderConfirmModal() + renderVacationManager() + renderVacationHistory() + renderPayslipViewer() + renderPayslipDecisionModal() + renderPrivacyLock() + (typeof renderAccountGate === 'function' ? renderAccountGate() : '') + (typeof renderAdminSessionUi === 'function' ? renderAdminSessionUi() : '');
      bindEvents();
      if (typeof bindAccountEvents === 'function') bindAccountEvents();
      initHomeTitleMorph();
      state.tabSwitchFx = false;
    }
