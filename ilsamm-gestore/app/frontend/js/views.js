    function renderHome() {
      var now = new Date();
      var homeProfileName = String(state.settingsDraft.userName || '').trim() || 'Utente';
      var homeProfileInitials = homeProfileName.split(/\s+/).slice(0, 2).map(function (part) {
        return part.charAt(0).toUpperCase();
      }).join('') || 'U';
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
      var dayCardActionLabel = entry ? 'Modifica giornata' : 'Inserisci giornata';
      var standardHomeDayCard = '<button type="button" class="go-card go-day-card go-day-card-v2 go-day-card-v13' + daySummaryClass + '" data-day-type="' + (entry ? escapeHtml(entry.type) : 'empty') + '" data-open-date="' + key + '" aria-label="' + escapeHtml(dayCardActionLabel + ': ' + dayTitleLabel) + '">' +
        '<div class="go-day-head"><div class="go-day-title">' + dayTitleLabel + '</div><div class="go-day-date">' + fullDateLabel + '</div></div>' +
        dayCardContent +
        '<span class="go-day-card-cue"><span>' + dayCardActionLabel + '</span>' + icons.right + '</span>' +
      '</button>';
      var homeDayCard = state.settings.timerEnabled && typeof renderOptionalTimerHomeCard === 'function'
        ? renderOptionalTimerHomeCard(now)
        : standardHomeDayCard;
      var homeShiftPresets = getShiftPresets();
      var primaryShiftPreset = homeShiftPresets[0];
      var primaryHomeAction = entry
        ? '<button data-open-date="' + key + '"><span class="go-home-action-icon is-blue">' + icons.note + '</span><span><strong>Modifica</strong><small>Giornata</small></span></button>'
        : '<button data-home-shift-preset="0" data-home-shift-date="' + key + '"><span class="go-home-action-icon is-green">' + icons.clock + '</span><span><strong>' + escapeHtml(primaryShiftPreset.label) + '</strong><small>' + escapeHtml(primaryShiftPreset.start + ' - ' + primaryShiftPreset.end) + '</small></span></button>';
      var homeQuickActions = '<section class="go-home-quick-actions" aria-label="Azioni rapide">' +
        primaryHomeAction +
        '<button data-home-quick-type="ferie" data-home-quick-date="' + key + '"><span class="go-home-action-icon is-violet">' + icons.umbrella + '</span><span><strong>Ferie</strong><small>Segna oggi</small></span></button>' +
        '<button data-tab="payslips"><span class="go-home-action-icon is-blue">' + icons.wallet + '</span><span><strong>Stipendio</strong><small>Stima netta</small></span></button>' +
      '</section>';
      var homeSalaryPreview = '';
      if (state.settings.homeShowSalaryPreview && typeof getPayrollNetEstimateForMonth === 'function') {
        var homeEstimate = getPayrollNetEstimateForMonth(now.getFullYear(), now.getMonth() + 1);
        var homeActualPayslip = (state.payslips || []).find(function (item) {
          return Number(item.year) === now.getFullYear() && Number(item.month) === now.getMonth() + 1;
        });
        var homeActualNet = homeActualPayslip ? parseDecimalInput(homeActualPayslip.netto, 0) : 0;
        var homeEstimateValue = homeEstimate.valid ? formatSalaryEstimateMoney(homeEstimate.estimatedMonthWithOvertimeNet) : '--';
        var homeEstimateMeta = homeActualNet > 0
          ? ('Ricevuto ' + formatSalaryEstimateMoney(homeActualNet))
          : (homeEstimate.valid ? 'In attesa del cedolino' : 'Completa prima i dati della stima');
        homeSalaryPreview = '<button class="home-salary-preview" data-tab="payslips"><span class="home-salary-preview-icon">' + icons.wallet + '</span><span><small>STIPENDIO DEL MESE</small><strong>' + homeEstimateValue + '</strong><em>' + escapeHtml(homeEstimateMeta) + '</em></span>' + icons.right + '</button>';
      }
      return '<header class="top home-top gestore-static-top go-home-logo go-home-header-v13"><div class="gestore-static-title" aria-label="GestOre"><span class="gestore-word gestore-word-main">Gest</span><span class="gestore-word gestore-word-accent">Ore</span></div><button class="home-profile-avatar" data-open-profile="1" aria-label="Apri il profilo di ' + escapeHtml(homeProfileName) + '">' + renderProfileAvatarMarkup('is-home', homeProfileInitials) + '</button></header>' +
        '<div class="stack home-stack go-home-stack go-home-v13">' +
          (typeof renderOnboardingInvite === 'function' ? renderOnboardingInvite() : '') +
          homeDayCard +
          (state.settings.homeShowQuickActions !== false ? homeQuickActions : '') +
          (typeof renderHomeCompletionCenter === 'function' ? renderHomeCompletionCenter() : '') +
          homeSalaryPreview +
          '<section class="go-card go-analytics-card go-analysis-card-v3 go-week-card' + (state.settings.homeShowWeeklyAnalytics === false ? ' is-home-hidden' : '') + '">' +
            '<div class="go-card-head go-analysis-head-v3"><div><div class="go-kicker">Settimana</div><div class="go-card-title">Ritmo settimanale</div></div><div class="go-card-badge">' + weekPercentValue + '%</div></div>' +
            '<div class="go-week-summary-v3">' +
              '<div class="go-week-total-v3"><span>ORE REGISTRATE</span><strong>' + formatDuration(week.totalMinutes) + '</strong><small>su ' + formatHourValue(state.settings.weeklyTarget) + ' di target</small></div>' +
              '<div class="go-week-result-v3' + (weekRemaining > 0 ? '' : ' is-complete') + '"><span>' + (weekRemaining > 0 ? icons.target : icons.check) + '</span><div><strong>' + weekResultTitle + '</strong><small>' + weekResultSub + '</small></div></div>' +
            '</div>' +
            '<div class="go-week-progress-v3"><span style="width:' + weekProgressStyle + '"></span></div>' +
            '<div class="go-week-chart-v3" aria-label="Ore registrate nei sette giorni della settimana">' + weekBarsHtml + '</div>' +
            '<button class="go-analytics-link-v3" data-tab="stats"><span>Apri analisi settimana</span>' + icons.right + '</button>' +
          '</section>' +
          '<section class="go-card go-analytics-card go-analysis-card-v3 go-month-card' + (state.settings.homeShowMonthlyAnalytics === false ? ' is-home-hidden' : '') + '">' +
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
      /* Legacy Home renderer intentionally disabled after the v3 return above.
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
      */
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

function getCalendarSelectedDateKey(month) {
      var selected = parseLocalDateKey(state.calendarSelectedDate);
      if (selected && selected.getFullYear() === month.getFullYear() && selected.getMonth() === month.getMonth()) {
        return toISODate(selected);
      }
      var today = new Date();
      if (today.getFullYear() === month.getFullYear() && today.getMonth() === month.getMonth()) return toISODate(today);
      var monthEntries = getMonthEntries(month);
      if (monthEntries.length) return monthEntries[0][0];
      return toISODate(new Date(month.getFullYear(), month.getMonth(), 1));
    }

    function getCalendarTypeVisual(entry) {
      if (!entry) return { label: 'Non compilato', className: 'is-empty', icon: icons.plus, color: '#7f95c8' };
      var type = dayTypes[entry.type] || { label: 'Giornata', dot: '#7f95c8' };
      if (entry.type === 'lavoro' || entry.type === 'lavoro_ferie') return { label: type.label, className: 'is-work', icon: icons.briefcase, color: type.dot };
      if (entry.type === 'ferie') return { label: type.label, className: 'is-vacation', icon: icons.umbrella, color: type.dot };
      if (entry.type === 'malattia') return { label: type.label, className: 'is-sick', icon: icons.activity, color: type.dot };
      if (entry.type === 'permesso') return { label: type.label, className: 'is-permission', icon: icons.clock, color: type.dot };
      if (entry.type === 'festivita_pagata') return { label: type.label, className: 'is-holiday', icon: icons.star, color: type.dot };
      return { label: type.label, className: 'is-rest', icon: icons.coffee, color: type.dot };
    }

    function getCalendarEntryTimeLabel(entry, dateKey) {
      if (!entry) return 'Tocca Inserisci per registrare la giornata';
      if (entry.type === 'lavoro' || entry.type === 'lavoro_ferie') {
        if (entry.start && entry.end) return escapeHtml(entry.start + ' - ' + entry.end);
        return 'Orario da completare';
      }
      if (entry.type === 'festivita_pagata') {
        return escapeHtml(getHolidayDisplayName(entry, dateKey) || 'Festivita italiana');
      }
      if (entry.notes) return escapeHtml(entry.notes);
      if (entry.type === 'riposo') return 'Giornata di riposo';
      return 'Giornata registrata';
    }

    function renderCalendarDayFocus(dateKey) {
      var date = parseLocalDateKey(dateKey);
      if (!date) return '';
      var entry = getEntryForDate(dateKey);
      var visual = getCalendarTypeVisual(entry);
      var breakdown = getBreakdown(entry);
      var displayMinutes = breakdown.total || breakdown.covered;
      var isWork = entry && (entry.type === 'lavoro' || entry.type === 'lavoro_ferie');
      var isStored = Boolean(state.entries[dateKey]);
      var dateLabel = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }).format(date);
      var primaryValue = entry ? (displayMinutes ? formatDuration(displayMinutes) : visual.label) : '--';
      var metrics = isWork
        ? '<div><span>Ordinarie</span><strong>' + formatDuration(breakdown.normal) + '</strong></div><div><span>Extra</span><strong>' + formatDuration(breakdown.overtime) + '</strong></div>'
        : '<div><span>Copertura</span><strong>' + (breakdown.covered ? formatDuration(breakdown.covered) : '--') + '</strong></div><div><span>Stato</span><strong>' + escapeHtml(visual.label) + '</strong></div>';
      var actionLabel = isStored ? 'Modifica' : (entry ? 'Personalizza' : 'Inserisci');
      return '<section class="calendar-day-focus ' + visual.className + '" style="--calendar-accent:' + visual.color + '">' +
        '<div class="calendar-day-focus-head"><div><small>GIORNO SELEZIONATO</small><h2>' + escapeHtml(dateLabel) + '</h2></div><div class="calendar-day-focus-head-actions"><span class="calendar-day-type-pill"><i></i>' + escapeHtml(visual.label) + '</span><button class="calendar-day-focus-close" data-close-calendar-detail="1" aria-label="Chiudi dettaglio">' + icons.x + '</button></div></div>' +
        '<div class="calendar-day-focus-main"><span class="calendar-day-focus-icon">' + visual.icon + '</span><div class="calendar-day-focus-copy"><strong>' + primaryValue + '</strong><span>' + getCalendarEntryTimeLabel(entry, dateKey) + '</span></div><button data-open-date="' + dateKey + '">' + actionLabel + icons.right + '</button></div>' +
        '<div class="calendar-day-focus-metrics">' + metrics + '</div>' +
      '</section>';
    }

    function renderCalendarAgenda(month, calendarFilter, selectedKey) {
      var rows = getMonthEntries(month).filter(function (pair) {
        return calendarFilter === 'all' || getCalendarEntryGroup(pair[1]) === calendarFilter;
      });
      if (!rows.length) {
        return '<section class="calendar-agenda-empty"><span>' + icons.calendar + '</span><strong>Nessuna giornata da mostrare</strong><p>Modifica il filtro oppure inserisci una nuova giornata dal calendario.</p></section>';
      }
      var previousWeekKey = '';
      return '<section class="calendar-agenda-card"><div class="calendar-agenda-head"><div><small>AGENDA DEL MESE</small><strong>' + rows.length + (rows.length === 1 ? ' giornata' : ' giornate') + '</strong></div><span>Seleziona per il dettaglio</span></div><div class="calendar-agenda-list">' + rows.map(function (pair) {
        var key = pair[0];
        var entry = pair[1];
        var date = parseLocalDateKey(key);
        var visual = getCalendarTypeVisual(entry);
        var breakdown = getBreakdown(entry);
        var minutes = breakdown.total || breakdown.covered;
        var weekday = new Intl.DateTimeFormat('it-IT', { weekday: 'short' }).format(date).replace('.', '').slice(0, 3);
        var monthLabel = new Intl.DateTimeFormat('it-IT', { month: 'short' }).format(date).replace('.', '');
        var value = minutes ? formatDuration(minutes) : (entry.type === 'riposo' ? 'Riposo' : '--');
        var weekStart = new Date(date);
        weekStart.setDate(date.getDate() - mondayIndex(date.getDay()));
        var weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        var weekKey = toISODate(weekStart);
        var weekHeading = '';
        if (weekKey !== previousWeekKey) {
          previousWeekKey = weekKey;
          var weekStartLabel = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' }).format(weekStart).replace('.', '');
          var weekEndLabel = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' }).format(weekEnd).replace('.', '');
          weekHeading = '<div class="calendar-agenda-week"><span>Settimana</span><strong>' + escapeHtml(weekStartLabel + ' - ' + weekEndLabel) + '</strong></div>';
        }
        return weekHeading + '<button class="calendar-agenda-row ' + visual.className + ' ' + (state.calendarDetailOpen && key === selectedKey ? 'is-selected' : '') + '" style="--calendar-accent:' + visual.color + '" data-calendar-pick-date="' + key + '">' +
          '<span class="calendar-agenda-date"><strong>' + date.getDate() + '</strong><small>' + escapeHtml(monthLabel) + '</small></span>' +
          '<span class="calendar-agenda-icon">' + visual.icon + '</span>' +
          '<span class="calendar-agenda-copy"><small>' + escapeHtml(weekday) + '</small><strong>' + escapeHtml(visual.label) + '</strong><em>' + getCalendarEntryTimeLabel(entry, key) + '</em></span>' +
          '<span class="calendar-agenda-value"><strong>' + value + '</strong>' + icons.right + '</span>' +
        '</button>';
      }).join('') + '</div></section>';
    }

    function renderCalendar() {
      var todayKey = toISODate(new Date());
      var grid = buildMonthGrid(state.currentMonth);
      var stats = getMonthStats(state.currentMonth);
      var recordedDays = stats.workedDays + stats.ferie + stats.malattia + stats.permesso + (stats.festivitaPagata || 0) + stats.riposo;
      var allowedFilters = ['all', 'work', 'absence', 'rest'];
      var calendarFilter = allowedFilters.indexOf(state.calendarFilter) !== -1 ? state.calendarFilter : 'all';
      var calendarView = state.calendarView === 'agenda' ? 'agenda' : 'month';
      var selectedKey = getCalendarSelectedDateKey(state.currentMonth);
      var detailOpen = Boolean(state.calendarDetailOpen);
      var selectedDates = Array.isArray(state.calendarSelectedDates) ? state.calendarSelectedDates : [];
      var filterCounts = getMonthEntries(state.currentMonth).reduce(function (counts, pair) {
        var group = getCalendarEntryGroup(pair[1]);
        counts.all += 1;
        if (group) counts[group] += 1;
        return counts;
      }, { all: 0, work: 0, absence: 0, rest: 0 });
      var calendarFilterHtml = [
        { key: 'all', label: 'Tutti' },
        { key: 'work', label: 'Lavoro' },
        { key: 'absence', label: 'Assenze' },
        { key: 'rest', label: 'Riposi' }
      ].map(function (item) {
        return '<button data-calendar-filter="' + item.key + '" class="' + (calendarFilter === item.key ? 'is-active' : '') + '" aria-pressed="' + (calendarFilter === item.key ? 'true' : 'false') + '"><span>' + item.label + '</span><strong>' + filterCounts[item.key] + '</strong></button>';
      }).join('');
      var monthContent = '<section class="calendar-v2-month-card"><div class="calendar-v2-grid-wrap">' +
        '<div class="week-grid">' + weekNames.map(function (name) { return '<div class="weekday">' + name + '</div>'; }).join('') + '</div>' +
        '<div class="calendar-grid">' + grid.map(function (date) {
          var key = toISODate(date);
          var entry = getEntryForDate(date);
          var isCurrent = date.getMonth() === state.currentMonth.getMonth();
          var isToday = key === todayKey;
          var entryGroup = getCalendarEntryGroup(entry);
          var isFilteredOut = entry && calendarFilter !== 'all' && entryGroup !== calendarFilter;
          var isBulkSelected = selectedDates.indexOf(key) !== -1;
          var isFocused = detailOpen && !state.calendarSelectionMode && key === selectedKey;
          var visual = getCalendarTypeVisual(entry);
          var actionAttribute = state.calendarSelectionMode ? 'data-calendar-select-date' : 'data-calendar-pick-date';
          var typeLabel = entry ? visual.label : 'non compilato';
          return '<button class="cell ' + (!isCurrent ? 'out ' : '') + (isToday ? 'today ' : '') + (entry ? 'has-entry ' + visual.className + ' ' : '') + (isFilteredOut ? 'is-filtered-out ' : '') + (isBulkSelected ? 'is-selected ' : '') + (isFocused ? 'is-focused ' : '') + '" style="--calendar-accent:' + visual.color + '" ' + actionAttribute + '="' + key + '" aria-label="' + escapeHtml(date.getDate() + ' ' + monthNames[date.getMonth()] + ', ' + typeLabel) + '" aria-pressed="' + (isBulkSelected || isFocused ? 'true' : 'false') + '"><span class="calendar-cell-number">' + date.getDate() + '</span>' + (entry ? '<span class="dot"></span>' : '') + (isBulkSelected ? '<span class="calendar-cell-check">' + icons.check + '</span>' : '') + '</button>';
        }).join('') + '</div></div></section>' +
        '<section class="card calendar-v2-summary-card"><div class="card-body"><div class="two">' +
          '<div class="mini center"><div class="big">' + formatDuration(stats.totalMinutes) + '</div><div class="small muted">Ore mese</div></div>' +
          '<div class="mini center"><div class="big">' + recordedDays + '</div><div class="small muted">Giorni segnati</div></div>' +
        '</div></div></section>' +
        '<details class="card calendar-v2-legend-card"><summary><span>Legenda</span>' + icons.right + '</summary><div class="calendar-v2-legend-body"><div class="legend-grid">' +
          Object.keys(dayTypes).map(function (key) { return '<div class="legend-item"><span class="legend-dot" style="background:' + dayTypes[key].dot + '"></span><span>' + dayTypes[key].label + '</span></div>'; }).join('') +
        '</div></div></details>';
      var selectionToolbar = typeof renderCalendarSelectionToolbar === 'function' ? renderCalendarSelectionToolbar() : '';
      var content = calendarView === 'agenda'
        ? renderCalendarAgenda(state.currentMonth, calendarFilter, selectedKey)
        : monthContent;
      return '<div class="month-page-top calendar-v2-header"><div><span>GESTIONE MENSILE</span><h1>Calendario</h1></div><div class="month-page-switch"><button data-calendar-prev="1" aria-label="Mese precedente">' + icons.left + '</button><strong>' + formatMonthYear(state.currentMonth) + '</strong><button data-calendar-next="1" aria-label="Mese successivo">' + icons.right + '</button></div></div>' +
        '<div class="calendar-v2-view-row"><div class="calendar-view-switch" role="group" aria-label="Vista calendario"><button data-calendar-view="month" class="' + (calendarView === 'month' ? 'is-active' : '') + '" aria-pressed="' + (calendarView === 'month') + '">Mese</button><button data-calendar-view="agenda" class="' + (calendarView === 'agenda' ? 'is-active' : '') + '" aria-pressed="' + (calendarView === 'agenda') + '">Agenda</button></div><div class="calendar-v2-top-actions"><button class="calendar-v2-today" data-calendar-today="1">Oggi</button><button class="calendar-v2-manage" data-open-calendar-actions="1" aria-label="Gestisci calendario">' + icons.settings + '</button></div></div>' +
        '<div class="stack calendar-v2-stack">' +
          (state.monthPlanNotice ? '<div class="calendar-plan-notice" role="status">' + escapeHtml(state.monthPlanNotice) + '</div>' : '') +
          '<div class="calendar-filter-bar calendar-v2-filter-bar" role="group" aria-label="Filtra giornate">' + calendarFilterHtml + '</div>' + selectionToolbar + content +
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
      var todayKey = toISODate(new Date());
      var hasAllowance = balance.allowanceDays > 0;
      var over = hasAllowance && balance.overMinutes > 0;
      var plannedMinutes = details.reduce(function (total, item) {
        return total + (item.key > todayKey ? item.minutes : 0);
      }, 0);
      var usedToDateMinutes = Math.max(0, balance.usedMinutes - plannedMinutes);
      var allowanceMinutes = balance.allowanceDays * balance.dailyMinutes;
      var availableTodayDays = hasAllowance ? ((allowanceMinutes - usedToDateMinutes) / balance.dailyMinutes) : 0;
      var plannedDays = plannedMinutes / balance.dailyMinutes;
      var projectedDays = hasAllowance ? ((allowanceMinutes - balance.usedMinutes) / balance.dailyMinutes) : 0;
      var nextVacation = details.filter(function (item) { return item.key > todayKey; }).sort(function (a, b) { return a.key.localeCompare(b.key); })[0] || null;
      var remainingValue = hasAllowance ? formatVacationDayValue(availableTodayDays) : '--';
      var remainingLabel = hasAllowance ? 'giorni disponibili oggi' : 'imposta il saldo annuale';
      var projectedCopy = !hasAllowance
        ? 'Imposta il totale per calcolare il saldo'
        : (projectedDays < 0
          ? formatVacationDayValue(Math.abs(projectedDays)) + ' gg oltre il saldo al 31 dicembre'
          : formatVacationDayValue(projectedDays) + ' gg previsti al 31 dicembre');
      var vacationInsightMarkup = '';
      if (nextVacation) {
        var nextVacationDate = parseLocalDateKey(nextVacation.key);
        var nextVacationLabel = nextVacationDate
          ? new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }).format(nextVacationDate)
          : nextVacation.key;
        vacationInsightMarkup = '<div class="vacation-page-insight"><span>' + icons.calendar + '</span><div><small>PROSSIMA ASSENZA</small><strong>' + escapeHtml(nextVacationLabel) + '</strong><p>' + formatDuration(nextVacation.minutes) + ' di ferie programmate</p></div><b>In programma</b></div>';
      } else {
        vacationInsightMarkup = '<div class="vacation-page-projection' + (projectedDays < 0 ? ' is-warning' : '') + '"><span>' + icons.activity + '</span><div><small>PROIEZIONE DI FINE ANNO</small><strong>' + escapeHtml(projectedCopy) + '</strong></div></div>';
      }
      var recentRows = details.slice(0, 4).map(function (item) {
        var date = parseLocalDateKey(item.key);
        var dayLabel = date ? new Intl.DateTimeFormat('it-IT', { weekday: 'long' }).format(date) : item.key;
        var fullDate = date ? new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long' }).format(date) : item.key;
        var typeLabel = item.entry.type === 'lavoro_ferie' ? 'Ferie parziali' : 'Giornata intera';
        var isPlanned = item.key > todayKey;
        return '<button class="vacation-page-history-row' + (isPlanned ? ' is-planned' : '') + '" data-open-vacation-date="' + item.key + '">' +
          '<span class="vacation-page-history-date"><strong>' + (date ? date.getDate() : '--') + '</strong><small>' + escapeHtml(date ? new Intl.DateTimeFormat('it-IT', { month: 'short' }).format(date).replace('.', '') : '') + '</small></span>' +
          '<span class="vacation-page-history-copy"><strong>' + escapeHtml(dayLabel) + '</strong><small>' + escapeHtml(fullDate + ' - ' + typeLabel) + '</small></span>' +
          '<span class="vacation-page-history-hours"><strong>' + formatDuration(item.minutes) + '</strong><small>' + (isPlanned ? 'Programmata' : 'Utilizzata') + '</small></span>' +
          icons.right +
        '</button>';
      }).join('');
      var status = state.vacationStatus ? '<div class="vacation-page-status">' + escapeHtml(state.vacationStatus) + '</div>' : '';
      return '<div class="vacation-page">' +
        '<div class="vacation-page-top"><div><span>GESTIONE ANNUALE</span><h1>Ferie</h1></div><div class="vacation-year-switch"><button data-vacation-year-prev="1" aria-label="Anno precedente">' + icons.left + '</button><strong>' + year + '</strong><button data-vacation-year-next="1" aria-label="Anno successivo">' + icons.right + '</button></div></div>' +
        '<section class="vacation-page-hero' + (over ? ' is-over' : '') + '">' +
          '<div class="vacation-page-hero-head"><div><span class="vacation-page-kicker">SALDO RESIDUO</span><h2>' + remainingValue + '</h2><p>' + remainingLabel + '</p></div>' +
          '<div class="vacation-page-ring" style="--vacation-progress:' + balance.percent + '%"><div><strong>' + balance.percent + '%</strong><span>impegnato</span></div></div></div>' +
          '<div class="vacation-page-metrics"><div><span>Totale anno</span><strong>' + (hasAllowance ? formatVacationDayValue(balance.allowanceDays) + ' gg' : '--') + '</strong></div><div><span>Utilizzate</span><strong>' + formatVacationDayValue(usedToDateMinutes / balance.dailyMinutes) + ' gg</strong></div><div><span>Pianificate</span><strong>' + formatVacationDayValue(plannedDays) + ' gg</strong></div></div>' +
          vacationInsightMarkup +
          '<div class="vacation-page-actions"><button class="vacation-page-add" data-open-vacation-range="' + year + '"><span>' + icons.plus + '</span><div><strong>Inserisci ferie</strong><small>Uno o pi&ugrave; giorni</small></div></button><button class="vacation-page-edit" data-open-vacation-allowance="' + year + '"><span>' + icons.settings + '</span><div><strong>Saldo annuale</strong><small>Modifica disponibilit&agrave;</small></div></button></div>' +
          status +
        '</section>' +
        '<div class="vacation-page-section-head"><div><span>STORICO ' + year + '</span><h2>Ferie registrate</h2></div>' + (details.length ? '<button data-open-vacation-history="' + year + '">Vedi tutte</button>' : '') + '</div>' +
        '<section class="vacation-page-history">' + (recentRows || '<div class="vacation-page-empty"><span>' + icons.calendar + '</span><strong>Nessuna ferie registrata</strong><small>Quando inserisci una giornata, la ritroverai qui.</small></div>') + '</section>' +
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
      // Include both plot gutters: without them the last day overflows the
      // calculated flex width and is clipped at the end of the scroller.
      var plotWidth = Math.max(312, (series.length * 50) + 24);
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
        return '<button type="button" class="analytics-daily-column" data-open-stats-day="' + item.key + '" aria-label="' + escapeHtml(weekday + ' ' + item.day + ': ' + (item.total ? formatDuration(item.total) : 'nessuna ora') + '. Tocca per il dettaglio') + '">' +
          '<span class="analytics-daily-value">' + formatStatsCompactDuration(item.total) + '</span>' +
          '<div class="analytics-daily-bar"><i class="is-normal" style="height:' + normalPercent.toFixed(2) + '%"></i><i class="is-extra" style="height:' + overtimePercent.toFixed(2) + '%"></i>' + stateDot + '</div>' +
          '<small>' + weekday + '</small><strong>' + item.day + '</strong>' +
        '</button>';
      }).join('');
      return '<div class="analytics-chart analytics-daily-readable-chart" role="img" aria-label="Ore lavorate per giorno, scorri orizzontalmente">' +
        '<div class="analytics-daily-scroll"><div class="analytics-daily-plot" style="width:' + plotWidth + 'px">' +
          (dailyTarget > 0 ? '<div class="analytics-daily-target-line" style="top:' + targetTop.toFixed(2) + 'px"><span>' + formatStatsCompactDuration(dailyTarget) + ' obiettivo</span></div>' : '') +
          columns +
        '</div></div>' +
        '<div class="analytics-daily-scroll-hint"><span>Scorri e tocca un giorno per il dettaglio</span>' + icons.right + '</div>' +
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
        var monthKey = item.date.getFullYear() + '-' + pad(item.date.getMonth() + 1);
        return '<g class="analytics-year-point" role="button" tabindex="0" data-open-stats-month="' + monthKey + '" aria-label="' + escapeHtml(monthNames[index] + ': ' + formatDuration(normal + overtime) + '. Apri dettaglio') + '"><title>' + monthNames[index] + ': ' + formatDuration(normal + overtime) + '</title>' +
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

    function renderStatsNarrative(totalMinutes, previousMinutes, averageMinutes, overtimeMinutes, periodLabel) {
      if (!totalMinutes) {
        return '<section class="analytics-narrative is-empty"><span>' + icons.activity + '</span><div><small>LETTURA RAPIDA</small><strong>Il periodo e pronto</strong><p>Inserisci le giornate e GestOre trasformera automaticamente i dati in un riepilogo leggibile.</p></div></section>';
      }
      var delta = totalMinutes - previousMinutes;
      var deltaCopy = delta === 0
        ? 'in linea con il periodo precedente'
        : ((delta > 0 ? '+' : '-') + formatDuration(Math.abs(delta)) + ' rispetto al periodo precedente');
      var overtimeShare = Math.round((Math.max(0, overtimeMinutes) / Math.max(1, totalMinutes)) * 100);
      var overtimeCopy = overtimeShare
        ? (overtimeShare + '% delle ore e straordinario')
        : 'nessuna ora straordinaria';
      return '<section class="analytics-narrative' + (delta > 0 ? ' is-positive' : (delta < 0 ? ' is-negative' : '')) + '">' +
        '<span>' + (delta >= 0 ? icons.arrowUp : icons.activity) + '</span><div><small>LETTURA RAPIDA</small><strong>' + escapeHtml(periodLabel) + ': ' + formatDuration(totalMinutes) + '</strong><p>Media ' + (averageMinutes ? formatDuration(averageMinutes) : '--') + ', ' + deltaCopy + '; ' + overtimeCopy + '.</p></div>' +
      '</section>';
    }

    function renderStatsSmartStrip(items) {
      return '<section class="analytics-smart-strip" aria-label="Indicatori principali">' + items.map(function (item) {
        return '<div><span class="' + item.tone + '">' + item.icon + '</span><small>' + item.label + '</small><strong>' + item.value + '</strong></div>';
      }).join('') + '</section>';
    }

    function renderStatsMore(content) {
      return '<details class="analytics-more-v13"><summary><span><small>APPROFONDIMENTI</small><strong>Composizione e confronti</strong></span><b>Mostra</b>' + icons.right + '</summary><div class="analytics-more-body-v13">' + content + '</div></details>';
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
        return '<button type="button" class="analytics-week-row" data-open-stats-period="1" data-stats-start="' + block.startKey + '" data-stats-end="' + block.endKey + '" data-stats-title="Settimana ' + (index + 1) + '">' +
          '<div class="analytics-week-copy"><span>SETTIMANA ' + (index + 1) + '</span><strong>' + (block.minutes ? formatDuration(block.minutes) : '--') + '</strong><small>giorni ' + block.label + ' &middot; ' + block.workedDays + ' registrati</small></div>' +
          '<div class="analytics-week-chart"><div><span class="is-normal" style="width:' + normalWidth.toFixed(2) + '%"></span><span class="is-extra" style="width:' + extraWidth.toFixed(2) + '%"></span><i style="left:' + targetPosition.toFixed(2) + '%"></i></div></div>' +
        '</button>';
      }).join('');
      var firstTime = focus.firstStart ? formatClockFromMinutes(focus.firstStart.minutes) : '--:--';
      var lastTime = focus.lastEnd ? formatClockFromMinutes(focus.lastEnd.minutes) : '--:--';
      var overtimeDays = dailySeries.filter(function (item) { return item.overtime > 0; }).length;
      var targetRemaining = Math.max(0, targetMinutes - stats.totalMinutes);
      var overtimeShare = stats.totalMinutes ? Math.round((stats.overtimeMinutes / stats.totalMinutes) * 100) : 0;
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
      renderStatsNarrative(stats.totalMinutes, previousStats.totalMinutes, average, stats.overtimeMinutes, monthNames[date.getMonth()]) +
      renderStatsSmartStrip([
        { icon: icons.target, tone: 'is-blue', label: targetRemaining ? 'Al target' : 'Obiettivo', value: targetRemaining ? formatDuration(targetRemaining) : 'Completato' },
        { icon: icons.star, tone: 'is-violet', label: 'Quota extra', value: overtimeShare + '%' },
        { icon: icons.calendar, tone: 'is-green', label: 'Giorni attivi', value: String(stats.workedDays || 0) }
      ]) +
      '<section class="analytics-card analytics-chart-card">' +
        '<div class="analytics-card-head"><div><span>ANDAMENTO GIORNALIERO</span><h3>Ore lavorate ogni giorno</h3></div><div class="analytics-chart-legend"><i class="is-normal"></i>Ord.<i class="is-extra"></i>Extra</div></div>' +
        '<div class="analytics-chart-wrap">' + buildStatsDailyChart(dailySeries) + (stats.totalMinutes ? '' : '<div class="analytics-chart-empty"><strong>Nessuna ora registrata</strong><span>Il grafico si riempie quando inserisci le giornate.</span></div>') + '</div>' +
        '<div class="analytics-chart-summary"><div><span>MEDIA GIORNO</span><strong>' + (average ? formatDuration(average) : '--') + '</strong></div><div><span>GIORNO MIGLIORE</span><strong>' + (focus.longest ? formatDuration(focus.longest.minutes) : '--') + '</strong></div><div><span>GIORNI CON EXTRA</span><strong>' + overtimeDays + '</strong></div></div>' +
      '</section>' +
      renderStatsMore(
        renderStatsHoursComposition(stats.normalMinutes, stats.overtimeMinutes) +
        '<section class="analytics-card analytics-weeks-card">' +
          '<div class="analytics-card-head"><div><span>CONFRONTO</span><h3>Settimane del mese</h3></div><small>linea = ' + formatHourValue(state.settings.weeklyTarget) + '</small></div>' +
          '<div class="analytics-week-list">' + weekRows + '</div>' +
        '</section>' +
        renderStatsInsightGrid(insights) +
        renderStatsDayDistribution(stats)
      );
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
        var monthKey = item.date.getFullYear() + '-' + pad(item.date.getMonth() + 1);
        return '<button type="button" class="analytics-month-row" data-open-stats-month="' + monthKey + '"><div class="analytics-month-copy"><span>' + monthNames[item.date.getMonth()].slice(0, 3) + '</span><div><strong>' + monthNames[item.date.getMonth()] + '</strong><small>Ord. ' + formatDuration(normal) + ' &middot; Extra ' + formatDuration(overtime) + '</small></div></div><div class="analytics-month-value"><strong>' + formatDuration(total) + '</strong><span><i style="width:' + ((total / maxMonth) * 100).toFixed(2) + '%"></i></span></div></button>';
      }).join('');
      var insights = [
        { icon: icons.star, tone: 'is-violet', label: 'Mese migliore', value: bestMonth && bestMonth.stats.totalMinutes ? monthNames[bestMonth.date.getMonth()] : '--', sub: bestMonth && bestMonth.stats.totalMinutes ? formatDuration(bestMonth.stats.totalMinutes) : 'nessun dato' },
        { icon: icons.activity, tone: 'is-blue', label: 'Media mensile', value: averageMonth ? formatDuration(averageMonth) : '--', sub: activeMonths.length + ' mesi con ore' },
        { icon: icons.arrowUp, tone: 'is-orange', label: 'Mese piu extra', value: extraMonth && extraMonth.stats.overtimeMinutes ? monthNames[extraMonth.date.getMonth()] : '--', sub: extraMonth && extraMonth.stats.overtimeMinutes ? formatDuration(extraMonth.stats.overtimeMinutes) : 'nessun extra' },
        { icon: icons.calendar, tone: 'is-green', label: 'Giorni lavorati', value: String(stats.workedDays || 0), sub: stats.recordedDays + ' giornate segnate' }
      ];
      var yearRemaining = Math.max(0, targetMinutes - stats.totalMinutes);
      var yearOvertimeShare = stats.totalMinutes ? Math.round((stats.overtimeMinutes / stats.totalMinutes) * 100) : 0;
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
      renderStatsNarrative(stats.totalMinutes, previousStats.totalMinutes, averageMonth, stats.overtimeMinutes, String(year)) +
      renderStatsSmartStrip([
        { icon: icons.target, tone: 'is-blue', label: yearRemaining ? 'Al target' : 'Obiettivo', value: yearRemaining ? formatDuration(yearRemaining) : 'Completato' },
        { icon: icons.star, tone: 'is-violet', label: 'Quota extra', value: yearOvertimeShare + '%' },
        { icon: icons.calendar, tone: 'is-green', label: 'Mesi attivi', value: String(activeMonths.length) }
      ]) +
      '<section class="analytics-card analytics-chart-card">' +
        '<div class="analytics-card-head"><div><span>ANDAMENTO ANNUALE</span><h3>Ore mese per mese</h3></div><div class="analytics-chart-legend"><i class="is-normal"></i>Ord.<i class="is-extra"></i>Extra</div></div>' +
        '<div class="analytics-chart-wrap">' + buildStatsYearChart(summaries, targetMinutes) + (stats.totalMinutes ? '' : '<div class="analytics-chart-empty"><strong>Nessuna ora registrata</strong><span>Il grafico annuale si aggiorna automaticamente.</span></div>') + '</div>' +
        (monthlyRows ? '<div class="analytics-month-list">' + monthlyRows + '</div>' : '') +
      '</section>' +
      renderStatsMore(
        renderStatsHoursComposition(stats.normalMinutes, stats.overtimeMinutes) +
        renderStatsInsightGrid(insights) +
        renderStatsDayDistribution(stats)
      );
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
        '<div class="analytics-stack analytics-v13">' + (range === 'year' ? renderStatsYear() : renderStatsMonth()) + '</div>';
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
      var editorShiftPresets = getShiftPresets();
      var editorShiftPresetsHtml = editorShiftPresets.map(function (preset, index) {
        var isActive = normalizeTimeInputValue(d.start || '') === preset.start &&
          normalizeTimeInputValue(d.end || '') === preset.end &&
          Math.abs(parseDecimalInput(d.breakHours || 0, 0) - preset.breakHours) < 0.01;
        return '<button type="button" data-apply-shift-preset="' + index + '" class="' + (isActive ? 'is-active' : '') + '" aria-pressed="' + (isActive ? 'true' : 'false') + '"><strong>' + escapeHtml(preset.label) + '</strong><small>' + escapeHtml(preset.start + ' - ' + preset.end) + '</small></button>';
      }).join('');
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
        dynamicSections = '<section class="day-editor-card day-editor-quantity-card"><div class="day-editor-kicker">QUANTITA</div><div class="day-editor-quantity-row"><span class="day-editor-round-icon is-blue">' + icons.clock + '</span><div class="day-editor-quantity-copy"><strong>' + getEditorQuantityLabel(d.type) + '</strong><small>' + getEditorQuantityHint(d.type) + '</small></div><div class="day-editor-number-field" data-editor-validation-field="quantityHours"><input id="editorQuantityHours" class="textual" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" value="' + formatEditorDecimal(d.quantityHours || 0) + '" aria-label="' + getEditorQuantityLabel(d.type) + '"><span>h</span></div></div></section>';
      } else {
        dynamicSections = '<section class="day-editor-card day-editor-schedule-card"><div class="day-editor-kicker">ORARIO</div><div class="day-editor-shift-presets" aria-label="Turni rapidi">' + editorShiftPresetsHtml + '</div><div class="day-editor-time-grid">' +
          '<label class="time-box day-editor-time-field ' + (normalizeTimeInputValue(d.start || '') ? 'has-time' : 'empty-time') + '" data-editor-validation-field="start"><span class="day-editor-round-icon is-green">' + icons.right + '</span><span class="day-editor-time-label">Entrata</span><span class="time-field"><input id="editorStart" class="time-input-big" type="time" step="60" value="' + normalizeTimeInputValue(d.start || '') + '" aria-label="Orario di entrata"><span class="time-placeholder" aria-hidden="true">--:--</span></span></label>' +
          '<label class="time-box day-editor-time-field ' + (normalizeTimeInputValue(d.end || '') ? 'has-time' : 'empty-time') + '" data-editor-validation-field="end"><span class="day-editor-round-icon is-violet">' + icons.left + '</span><span class="day-editor-time-label">Uscita</span><span class="time-field"><input id="editorEnd" class="time-input-big" type="time" step="60" value="' + normalizeTimeInputValue(d.end || '') + '" aria-label="Orario di uscita"><span class="time-placeholder" aria-hidden="true">--:--</span></span></label>' +
        '</div><div class="day-editor-inline-row" data-editor-validation-field="breakHours"><span class="day-editor-round-icon is-blue">' + icons.clock + '</span><div class="day-editor-inline-copy"><strong>Pausa</strong><small>Durata non lavorata</small></div><div class="day-editor-stepper"><button type="button" data-adjust-editor-hours="breakHours" data-editor-delta="-0.5" aria-label="Riduci pausa">-</button><div class="day-editor-step-value"><input id="editorBreakHours" class="textual" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" value="' + formatEditorDecimal(d.breakHours || 0) + '" aria-label="Ore di pausa"><span>h</span></div><button type="button" data-adjust-editor-hours="breakHours" data-editor-delta="0.5" aria-label="Aumenta pausa">+</button></div></div>' +
        (isMixed ? '<div class="day-editor-inline-row day-editor-leave-row" data-editor-validation-field="leaveHours"><span class="day-editor-round-icon is-blue">' + icons.calendar + '</span><div class="day-editor-inline-copy"><strong>Ferie</strong><small>Ore coperte nella giornata</small></div><div class="day-editor-stepper"><button type="button" data-adjust-editor-hours="leaveHours" data-editor-delta="-0.5" aria-label="Riduci ferie">-</button><div class="day-editor-step-value"><input id="editorLeaveHours" class="textual" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" value="' + formatEditorDecimal(d.leaveHours || 0) + '" aria-label="Ore di ferie"><span>h</span></div><button type="button" data-adjust-editor-hours="leaveHours" data-editor-delta="0.5" aria-label="Aumenta ferie">+</button></div></div>' : '') +
        (typeof renderEditorTimeline === 'function' ? renderEditorTimeline(d) : '') +
        '</section><details class="day-editor-card day-editor-overtime-card day-editor-overtime-v13"' + (d.overtimeManual || breakdown.overtime > 0 ? ' open' : '') + '><summary><span class="day-editor-round-icon is-violet">' + icons.star + '</span><span><small>STRAORDINARI</small><strong id="editorOvertimeSummary">' + formatDuration(breakdown.overtime) + '</strong></span>' + icons.right + '</summary><div class="day-editor-overtime-body-v13"><div class="day-editor-overtime-head"><div class="day-editor-inline-copy"><strong>Ore straordinarie</strong><small data-editor-overtime-mode>' + (d.overtimeManual ? 'Valore impostato manualmente' : 'Calcolate dagli orari inseriti') + '</small></div><button type="button" role="switch" class="day-editor-auto-toggle ' + (!d.overtimeManual ? 'is-on' : '') + '" data-toggle-editor-overtime-auto="1" aria-checked="' + (!d.overtimeManual ? 'true' : 'false') + '" aria-pressed="' + (!d.overtimeManual ? 'true' : 'false') + '" aria-label="Calcolo automatico straordinari"><span></span></button></div><div class="day-editor-overtime-stepper" data-editor-validation-field="overtimeHours"><button type="button" data-adjust-editor-hours="overtimeHours" data-editor-delta="-0.5" aria-label="Riduci straordinari">-</button><div class="day-editor-overtime-value"><input id="editorOvertimeHours" class="textual" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" value="' + formatEditorDecimal(d.overtimeHours || 0) + '" aria-label="Ore straordinarie"><span>h</span></div><button type="button" data-adjust-editor-hours="overtimeHours" data-editor-delta="0.5" aria-label="Aumenta straordinari">+</button></div></div></details>';
      }

      var holidayBadge = holidayName ? '<span class="day-editor-holiday-badge">' + escapeHtml(holidayName) + '</span>' : '';
      var canClear = hasMeaningfulDayData(d) || Boolean(state.entries[toISODate(date)]);

      return '<div class="overlay open editor-overlay editor-overlay-v3 editor-v13" role="dialog" aria-modal="true" aria-label="Inserisci giornata"><header class="day-editor-header"><button class="day-editor-back" data-close-editor="1" aria-label="Torna indietro">' + icons.left + '</button><div class="day-editor-header-copy"><div class="day-editor-title">Inserisci giornata</div><div class="day-editor-date">' + editorDateLabel + '</div></div><span class="day-editor-autosave-v13" data-editor-autosave data-status="ready" role="status" aria-live="polite"><i></i><span data-editor-autosave-label></span></span></header>' +
        '<div class="day-editor-scroll"><main class="day-editor-stack">' +
          '<section class="day-editor-type-section"><button class="day-editor-type-card" data-toggle-type-open="1"><span class="day-editor-type-icon" style="background:' + typeIconBg(d.type) + '">' + typeIconSvg(d.type) + '</span><span class="day-editor-type-copy"><strong>' + currentType.label + '</strong><small>' + escapeHtml(typeSubtitle) + '</small>' + holidayBadge + '</span><span class="day-editor-chevron">' + icons.right + '</span></button>' +
          (state.typeOpen ? '<div class="day-editor-type-options">' + others.map(function (pair) { return '<button class="day-editor-type-option" data-select-type="' + pair[0] + '"><span class="day-editor-type-option-icon" style="background:' + typeIconBg(pair[0]) + '">' + typeIconSvg(pair[0]) + '</span><span>' + pair[1].label + '</span><small>Scegli</small></button>'; }).join('') + '</div>' : '') + '</section>' +
          dynamicSections +
          '<div id="editorValidationSlot">' + (typeof renderEditorValidationIssues === 'function' ? renderEditorValidationIssues(getDayDraftValidationIssues(d)) : '') + '</div>' +
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
      return '<div class="payvault-viewer" role="dialog" aria-modal="true" aria-label="Foto cedolino">' +
        '<button class="payvault-viewer-backdrop" data-close-payslip-viewer="1" aria-label="Chiudi foto"></button>' +
        '<div class="payvault-viewer-stage">' +
          '<div class="payvault-viewer-head"><div><em>' + viewerMode + '</em><strong>Foto ' + (index + 1) + ' di ' + photos.length + '</strong><span>' + escapeHtml(photo.fileName || 'Cedolino') + '</span></div><button data-close-payslip-viewer="1">' + icons.x + '</button></div>' +
          '<div class="payvault-viewer-image" data-payslip-zoom-surface="1">' +
            '<img data-payslip-zoom-image="1" src="' + photo.data + '" alt="Foto ingrandita del cedolino">' +
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
      var title = deletingPhoto ? 'Rimuovere questa foto?' : 'Eliminare il cedolino?';
      var text = deletingPhoto
        ? 'La foto verra rimossa dalla galleria. Le altre foto e l\'importo resteranno salvati.'
        : 'Stai per eliminare ' + escapeHtml(payslip ? getPayslipMonthLabel(payslip) : 'questo cedolino') + '. Questa azione non puo essere annullata.';
      return '<div class="payvault-decision" role="alertdialog" aria-modal="true">' +
        '<button class="payvault-decision-backdrop" data-close-payslip-decision="1" aria-label="Annulla"></button>' +
        '<div class="payvault-decision-card"><div class="payvault-decision-icon">' + icons.trash + '</div><div class="payvault-decision-title">' + title + '</div><div class="payvault-decision-text">' + text + '</div><div class="payvault-decision-actions"><button class="ghost" data-close-payslip-decision="1">Annulla</button><button class="ghost danger" data-confirm-payslip-decision="1">' + (deletingPhoto ? 'Rimuovi foto' : 'Elimina cedolino') + '</button></div></div>' +
      '</div>';
    }

    function renderPayrollPhotoGrid(photos, source, payslipId, editable) {
      return (photos || []).map(function (photo, index) {
        return '<div class="payroll-photo-tile">' +
          '<button class="payroll-photo-open" data-view-payslip-photo="' + index + '" data-payslip-source="' + source + '" data-payslip-id="' + escapeHtml(payslipId || '') + '" aria-label="Visualizza foto ' + (index + 1) + '"><img loading="lazy" decoding="async" src="' + (photo.thumbnail || photo.data) + '" alt="Foto ' + (index + 1) + ' del cedolino"><span>' + (index + 1) + '</span></button>' +
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
      return '<div class="profile-subpage-top payroll-page-top payroll-stats-top"><button data-close-payslip-stats="1" aria-label="Torna a Stipendio">' + icons.left + '</button><div><span>STIPENDIO</span><h1>Statistiche</h1></div><i></i></div>' +
        '<div class="stack payroll-stats-stack">' +
          '<section class="payroll-stats-hero">' +
            '<div class="payroll-stats-hero-head"><div><small>NETTO RICEVUTO</small><h2>' + selectedYear + '</h2></div><div class="payroll-stats-year-control"><button data-payslip-stats-year="-1" aria-label="Anno precedente">' + icons.left + '</button><strong>' + selectedYear + '</strong><button data-payslip-stats-year="1" aria-label="Anno successivo">' + icons.right + '</button></div></div>' +
            '<strong class="payroll-stats-total">' + (filledMonths.length ? formatMoneyEuro(total) : '--') + '</strong><p>' + (filledMonths.length ? ('Totale di ' + filledMonths.length + (filledMonths.length === 1 ? ' mese con importo salvato' : ' mesi con importo salvato')) : 'Salva un cedolino per iniziare a vedere l\'andamento.') + '</p>' +
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
          '<p class="payroll-stats-disclaimer">Le statistiche usano soltanto il netto che hai inserito nei cedolini. Nessun dato viene stimato automaticamente.</p>' +
        '</div>';
    }

    function renderPayslipEstimateV2() {
      var selectedYear = Math.min(2200, Math.max(2000, Number(state.payslipEstimateYear) || new Date().getFullYear()));
      var selectedMonth = Math.min(12, Math.max(1, Number(state.payslipEstimateMonth) || (new Date().getMonth() + 1)));
      state.payslipEstimateYear = selectedYear;
      state.payslipEstimateMonth = selectedMonth;
      var rateMeta = getSalaryEstimateRates(selectedYear, selectedMonth);
      var estimate = getSalaryEstimateForMonth(selectedYear, selectedMonth, rateMeta);
      var periodLabel = monthNames[selectedMonth - 1] + ' ' + selectedYear;
      var sourceLabel = 'Inserisci le due tariffe lorde per iniziare';
      if (rateMeta.sourceType !== 'empty') {
        var sourcePeriod = monthNames[Math.max(0, Number(rateMeta.sourceMonth || selectedMonth) - 1)] + ' ' + (rateMeta.sourceYear || selectedYear);
        sourceLabel = rateMeta.inherited
          ? ('Proposte le tariffe di ' + sourcePeriod)
          : (rateMeta.sourceType === 'payslip' ? ('Tariffe lette dal cedolino di ' + sourcePeriod) : 'Tariffe salvate per questo mese');
      }
      var overtimeMetricLabel = rateMeta.overtimeLimitEnabled
        ? ('<b>' + formatDuration(estimate.overtimeMinutes) + '</b> su ' + formatDuration(estimate.overtimeRecordedMinutes) + ' straordinarie')
        : ('<b>' + formatDuration(estimate.overtimeMinutes) + '</b> straordinarie');
      var limitImpactText = estimate.overtimeExcludedMinutes > 0
        ? (formatDuration(estimate.overtimeExcludedMinutes) + ' di straordinario non entrano nella stima.')
        : 'Il limite non esclude ancora nessuna ora straordinaria.';
      var totalLabel = estimate.hasHours
        ? (estimate.complete ? formatSalaryEstimateMoney(estimate.total) : '--')
        : formatSalaryEstimateMoney(0);
      var totalNote = !estimate.hasHours
        ? 'Nessuna ora registrata in questo mese'
        : (estimate.complete ? (formatDuration(estimate.ordinaryMinutes + estimate.overtimeMinutes) + ' conteggiate nel calcolo') : 'Completa le tariffe per vedere il totale');
      var actualPayslip = estimate.actualPayslip;
      var actualGross = actualPayslip ? Math.max(0, parseDecimalInput(actualPayslip.lordo, 0)) : 0;
      var actualNet = actualPayslip ? Math.max(0, parseDecimalInput(actualPayslip.netto, 0)) : 0;
      return '<div class="profile-subpage-top payroll-page-top payroll-estimate-top"><button data-close-payslip-estimate="1" aria-label="Torna a Stipendio">' + icons.left + '</button><div><span>STIPENDIO</span><h1>Stima mensile</h1></div><i></i></div>' +
        '<div class="stack payroll-estimate-stack' + (estimate.hasHours && !estimate.complete ? ' is-incomplete' : '') + '" data-salary-estimate-page data-ordinary-hours="' + estimate.ordinaryHours.toFixed(4) + '" data-overtime-hours="' + estimate.overtimeHours.toFixed(4) + '" data-overtime-recorded-hours="' + estimate.overtimeRecordedHours.toFixed(4) + '">' +
          '<section class="payroll-estimate-hero">' +
            '<div class="payroll-estimate-hero-top"><div><small>STIMA LORDA</small><h2>' + escapeHtml(periodLabel) + '</h2></div><div class="payroll-estimate-period"><button data-payslip-estimate-month="-1" aria-label="Mese precedente">' + icons.left + '</button><span>' + escapeHtml(monthNames[selectedMonth - 1].slice(0, 3)) + '</span><button data-payslip-estimate-month="1" aria-label="Mese successivo">' + icons.right + '</button></div></div>' +
            '<strong class="payroll-estimate-total" data-salary-estimate-total aria-live="polite">' + totalLabel + '</strong>' +
            '<p data-salary-estimate-total-note>' + escapeHtml(totalNote) + '</p>' +
            '<div class="payroll-estimate-hero-metrics"><span><b>' + formatDuration(estimate.ordinaryMinutes) + '</b> ordinarie e coperte</span><span data-salary-estimate-overtime-metric>' + overtimeMetricLabel + '</span></div>' +
          '</section>' +
          '<section class="payroll-estimate-panel payroll-estimate-breakdown">' +
            '<div class="payroll-estimate-section-head"><div><small>CALCOLO</small><h2>Da ore a importo</h2></div><span>EUR</span></div>' +
            '<div class="payroll-estimate-row is-ordinary"><span class="payroll-estimate-row-icon">' + icons.briefcase + '</span><div><small>ORDINARIE E COPERTE</small><strong>' + formatDuration(estimate.ordinaryMinutes) + '</strong><em data-salary-estimate-ordinary-formula>' + estimate.ordinaryHours.toLocaleString('it-IT', { maximumFractionDigits: 2 }) + ' h × ' + (rateMeta.hourlyRate ? formatSalaryEstimateMoney(rateMeta.hourlyRate) : '--') + '</em></div><b data-salary-estimate-ordinary-total>' + (rateMeta.hourlyRate || estimate.ordinaryMinutes <= 0 ? formatSalaryEstimateMoney(estimate.ordinaryAmount) : '--') + '</b></div>' +
            '<div class="payroll-estimate-row is-overtime"><span class="payroll-estimate-row-icon">' + icons.star + '</span><div><small>STRAORDINARIE CONTEGGIATE</small><strong data-salary-estimate-overtime-duration>' + formatDuration(estimate.overtimeMinutes) + '</strong><em data-salary-estimate-overtime-formula>' + estimate.overtimeHours.toLocaleString('it-IT', { maximumFractionDigits: 2 }) + ' h × ' + (rateMeta.overtimeRate ? formatSalaryEstimateMoney(rateMeta.overtimeRate) : '--') + '</em></div><b data-salary-estimate-overtime-total>' + (rateMeta.overtimeRate || estimate.overtimeMinutes <= 0 ? formatSalaryEstimateMoney(estimate.overtimeAmount) : '--') + '</b></div>' +
            '<div class="payroll-estimate-limit-impact' + (rateMeta.overtimeLimitEnabled ? ' is-visible' : '') + '" data-salary-estimate-limit-impact><span>' + icons.clock + '</span><div><strong>Limite straordinari applicato</strong><p data-salary-estimate-limit-impact-text>' + escapeHtml(limitImpactText) + '</p></div></div>' +
          '</section>' +
          '<section class="payroll-estimate-panel payroll-estimate-rates">' +
            '<div class="payroll-estimate-section-head"><div><small>TARIFFE DEL MESE</small><h2>Quanto vale un’ora?</h2></div></div>' +
            '<div class="payroll-estimate-rate-source"><span>' + icons.history + '</span><p>' + escapeHtml(sourceLabel) + '</p></div>' +
            '<div class="payroll-estimate-rate-grid"><label><span>ORDINARIA LORDA</span><div><b>€</b><input id="salaryEstimateHourlyRate" type="text" inputmode="decimal" autocomplete="off" value="' + escapeHtml(formatEditorDecimal(rateMeta.hourlyRate || 0)) + '" placeholder="0,00"><em>/h</em></div></label><label><span>STRAORDINARIA LORDA</span><div><b>€</b><input id="salaryEstimateOvertimeRate" type="text" inputmode="decimal" autocomplete="off" value="' + escapeHtml(formatEditorDecimal(rateMeta.overtimeRate || 0)) + '" placeholder="0,00"><em>/h</em></div></label></div>' +
            '<div class="payroll-estimate-limit-setting' + (rateMeta.overtimeLimitEnabled ? ' is-enabled' : '') + '" data-salary-estimate-limit-setting><div class="payroll-estimate-limit-head"><span class="payroll-estimate-limit-icon">' + icons.star + '</span><div><strong>Limite ore straordinarie</strong><p>Scegli quante ore extra includere nella stima del mese.</p></div><button type="button" role="switch" aria-checked="' + (rateMeta.overtimeLimitEnabled ? 'true' : 'false') + '" aria-pressed="' + (rateMeta.overtimeLimitEnabled ? 'true' : 'false') + '" data-salary-estimate-limit-toggle><i></i></button></div><label><span>STRAORDINARIE MASSIME CONTEGGIATE</span><div><input id="salaryEstimateOvertimeHoursLimit" type="text" inputmode="decimal" autocomplete="off" value="' + escapeHtml(rateMeta.overtimeHoursLimit ? formatEditorDecimal(rateMeta.overtimeHoursLimit) : '') + '" placeholder="es. 10"><em>h</em></div></label></div>' +
            '<p class="payroll-estimate-live-note" data-salary-estimate-live-note>' + (estimate.complete ? (rateMeta.overtimeLimitEnabled ? 'Stima aggiornata con tariffe e limite straordinari.' : 'Stima aggiornata con le tariffe inserite.') : 'Inserisci le tariffe mancanti per completare la stima.') + '</p>' +
            '<button class="solid payroll-estimate-save" data-save-payslip-estimate="1">' + icons.check + '<span>Salva calcolo del mese</span></button>' +
            '<div class="payroll-estimate-status' + (state.payslipEstimateStatus ? ' is-visible' : '') + '" data-payslip-estimate-status role="status">' + escapeHtml(state.payslipEstimateStatus || '') + '</div>' +
          '</section>' +
          (actualPayslip ? '<section class="payroll-estimate-actual"><span class="payroll-estimate-actual-icon">' + icons.receipt + '</span><div><small>CEDOLINO SALVATO</small><strong>' + escapeHtml(getPayslipMonthLabel(actualPayslip)) + '</strong><p>' + (actualGross ? ('Lordo indicato ' + formatSalaryEstimateMoney(actualGross) + ' · ') : '') + 'Netto ricevuto ' + formatSalaryEstimateMoney(actualNet) + '</p></div><button data-open-payslip="' + escapeHtml(actualPayslip.id) + '" aria-label="Apri cedolino">' + icons.right + '</button></section>' : '') +
          '<p class="payroll-estimate-disclaimer">Stima lorda basata su tutte le ore ordinarie e sulle straordinarie che scegli di conteggiare. Il limite non modifica calendario e ore salvate. Tasse, contributi, premi, tredicesima e altre voci dipendono dal cedolino reale.</p>' +
        '</div>';
    }

    function renderPayrollNetCalculatorV3() {
      var selectedYear = Math.min(2200, Math.max(2000, Number(state.payslipEstimateYear) || new Date().getFullYear()));
      var selectedMonth = Math.min(12, Math.max(1, Number(state.payslipEstimateMonth) || (new Date().getMonth() + 1)));
      state.payslipEstimateYear = selectedYear;
      state.payslipEstimateMonth = selectedMonth;
      var api = getPayrollCalculatorApi();
      var config = getPayrollEstimateConfig(selectedYear, selectedMonth);
      var estimate = getPayrollNetEstimateForMonth(selectedYear, selectedMonth, config);
      var periodLabel = monthNames[selectedMonth - 1] + ' ' + selectedYear;
      var money = api && api.formatCurrency ? api.formatCurrency : formatSalaryEstimateMoney;
      var moneyFromCents = api && api.formatCurrencyFromCents
        ? api.formatCurrencyFromCents
        : function (value) { return formatSalaryEstimateMoney((Number(value) || 0) / 100); };
      var negativeMoney = function (value) {
        return Number(value) > 0 ? ('- ' + moneyFromCents(value)) : moneyFromCents(0);
      };
      var positiveMoney = function (value) {
        return Number(value) > 0 ? ('+ ' + moneyFromCents(value)) : moneyFromCents(0);
      };
      var sourceLabel = 'Inserisci i tuoi dati per iniziare';
      if (config.sourceType === 'saved') {
        var sourcePeriod = monthNames[Math.max(0, Number(config.sourceMonth || selectedMonth) - 1)] + ' ' + (config.sourceYear || selectedYear);
        sourceLabel = config.inherited
          ? ('Valori ripresi da ' + sourcePeriod)
          : 'Configurazione salvata per questo mese';
      }
      var monthBreakdown = estimate.valid ? estimate.monthlyBreakdown.withOvertime : {
        contributionCents: 0,
        irpefCents: 0,
        regionalCents: 0,
        municipalCents: 0,
        otherDeductionsCents: 0,
        reimbursementsCents: 0
      };
      var actualPayslip = estimate.actualPayslip || null;
      var actualGross = actualPayslip ? Math.max(0, parseDecimalInput(actualPayslip.lordo, 0)) : 0;
      var actualNet = actualPayslip ? Math.max(0, parseDecimalInput(actualPayslip.netto, 0)) : 0;
      var recordedOvertimeMinutes = getMonthEntries(new Date(selectedYear, selectedMonth - 1, 1)).reduce(function (sum, pair) {
        return sum + Math.max(0, getBreakdown(pair[1]).overtime || 0);
      }, 0);
      var recordedOvertimeHours = minutesToHours(recordedOvertimeMinutes);
      var privateEnabled = config.privateReconciliationEnabled === true;
      var privateUnlocked = Boolean(state.payrollPrivateUnlocked || privateEnabled);
      var privateRemainingHours = Math.max(0, recordedOvertimeHours - Math.max(0, config.overtimeHoursMonthly));
      var privateHourlyRate = Math.max(0, Number(config.privateReconciliationHourlyRate) || 0);
      var privateAmount = Math.round(privateRemainingHours * privateHourlyRate * 100) / 100;
      var regions = api && Array.isArray(api.ITALIAN_REGIONS) ? api.ITALIAN_REGIONS : ['Lombardia'];
      var regionOptions = '<option value=""' + (!config.region ? ' selected' : '') + '>Seleziona Regione</option>' + regions.map(function (region) {
        return '<option value="' + escapeHtml(region) + '"' + (region === config.region ? ' selected' : '') + '>' + escapeHtml(region) + '</option>';
      }).join('');
      var taxConfigs = (typeof globalThis !== 'undefined' && globalThis.GestOreTaxConfigs) || {};
      var yearOptions = Object.keys(taxConfigs).map(Number).filter(Boolean).sort(function (a, b) {
        return b - a;
      }).map(function (year) {
        return '<option value="' + year + '"' + (year === Number(config.taxYear) ? ' selected' : '') + '>' + year + '</option>';
      }).join('');
      var estimateTotal = estimate.valid ? money(estimate.estimatedMonthWithOvertimeNet) : '--';
      var completeness = estimate.valid
        ? (estimate.incomplete ? 'Stima parziale: alcune addizionali non sono incluse' : 'Stima completa con le tabelle selezionate')
        : 'Inserisci retribuzione e dati fiscali per calcolare la stima';
      var municipalityValue = estimate.valid && estimate.municipalityConfig
        ? negativeMoney(monthBreakdown.municipalCents)
        : 'Non calcolata';
      var municipalityFeedback = getPayrollMunicipalityFeedback(estimate);
      var configOpen = Boolean(state.payslipEstimateConfigOpen);
      var irpefRows = estimate.valid ? estimate.irpefBreakdown.map(function (row) {
        var range = row.to === null
          ? ('oltre ' + money(row.from))
          : (money(row.from) + ' - ' + money(row.to));
        return '<span><i>' + escapeHtml(range) + ' · ' + row.rate + '%</i><b>' +
          escapeHtml(moneyFromCents(row.taxCents)) + '</b></span>';
      }).join('') : '';
      var html = [];

      html.push(
        '<div class="profile-subpage-top payroll-page-top payroll-estimate-top"><button ' +
        (configOpen
          ? 'data-close-payroll-config="1" aria-label="Torna alla stima stipendio"'
          : 'data-close-payslip-estimate="1" aria-label="Torna a Stipendio"') +
        '>' + icons.left + '</button><div><span>' +
        (configOpen ? 'CALCOLO STIPENDIO' : 'STIPENDIO') +
        '</span><h1' + (configOpen ? ' data-payroll-secret-trigger="1"' : '') + '>' +
        (configOpen ? 'Dati per la stima' : 'Stima stipendio') +
        '</h1></div><i></i></div>'
      );
      html.push('<div class="stack payroll-estimate-stack payroll-calculator-stack' +
        (!estimate.valid ? ' is-invalid' : '') +
        (configOpen ? ' is-configuring' : '') +
        '" data-payroll-calculator-page data-recorded-overtime-hours="' +
        recordedOvertimeHours.toFixed(4) + '">');
      html.push(
        '<section class="payroll-estimate-panel payroll-calculator-config-intro">' +
          '<div class="payroll-estimate-hero-top"><div><small>CONFIGURAZIONE DEL MESE</small><h2>' + escapeHtml(periodLabel) + '</h2></div><div class="payroll-estimate-period"><button data-payslip-estimate-month="-1" aria-label="Mese precedente">' + icons.left + '</button><span>' + escapeHtml(monthNames[selectedMonth - 1].slice(0, 3)) + '</span><button data-payslip-estimate-month="1" aria-label="Mese successivo">' + icons.right + '</button></div></div>' +
          '<div class="payroll-calculator-config-preview"><span><small>NETTO STIMATO</small><strong data-payroll-value="netMonth">' + escapeHtml(estimateTotal) + '</strong></span><p>' + escapeHtml(sourceLabel) + '</p></div>' +
        '</section>'
      );
      html.push(
        '<section class="payroll-estimate-hero payroll-calculator-hero">' +
          '<div class="payroll-estimate-hero-top"><div><small>NETTO STIMATO DEL MESE</small><h2>' + escapeHtml(periodLabel) + '</h2></div><div class="payroll-estimate-period"><button data-payslip-estimate-month="-1" aria-label="Mese precedente">' + icons.left + '</button><span>' + escapeHtml(monthNames[selectedMonth - 1].slice(0, 3)) + '</span><button data-payslip-estimate-month="1" aria-label="Mese successivo">' + icons.right + '</button></div></div>' +
          '<strong class="payroll-estimate-total" data-payroll-value="netMonth" aria-live="polite">' + escapeHtml(estimateTotal) + '</strong>' +
          '<p class="payroll-calculator-completeness' + (estimate.valid && !estimate.incomplete ? ' is-complete' : '') + '" data-payroll-estimate-completeness>' + escapeHtml(completeness) + '</p>' +
          '<div class="payroll-estimate-hero-metrics payroll-calculator-hero-metrics">' +
            '<span><small>LORDO MESE</small><b data-payroll-value="totalMonthlyGross">' + escapeHtml(estimate.valid ? money(estimate.totalMonthlyGross) : '--') + '</b></span>' +
            '<span><small>NETTO ANNUO</small><b data-payroll-value="annualNet">' + escapeHtml(estimate.valid ? money(estimate.estimatedAnnualNet) : '--') + '</b></span>' +
            '<span><small>RAL BASE</small><b data-payroll-value="baseAnnualGross">' + escapeHtml(estimate.valid ? money(estimate.baseAnnualGross) : '--') + '</b></span>' +
          '</div>' +
        '</section>'
      );
      html.push(
        '<button class="payroll-estimate-panel payroll-calculator-config-entry" type="button" data-open-payroll-config="1">' +
          '<span class="payroll-calculator-config-entry-icon">' + icons.settings + '</span>' +
          '<span class="payroll-calculator-config-entry-copy"><small>DATI PER LA STIMA</small><strong>Retribuzione e dati fiscali</strong><p>' +
            escapeHtml(config.baseMonthlyGross > 0
              ? (money(config.baseMonthlyGross) + ' · ' + config.salaryMonths + ' mensilità · ' + config.overtimeHoursMonthly.toLocaleString('it-IT', { maximumFractionDigits: 2 }) + ' h extra')
              : 'Nessun dato precompilato: imposta i tuoi valori') +
          '</p><em>' + escapeHtml(config.region ? (config.region + (config.municipality ? (' · ' + config.municipality) : ' · Comune da inserire')) : 'Residenza da configurare') + '</em></span>' +
          '<span class="payroll-calculator-config-entry-arrow">' + icons.right + '</span>' +
        '</button>' +
        '<div class="payroll-estimate-status payroll-calculator-summary-status' +
          (state.payslipEstimateStatus ? ' is-visible' : '') +
          '" role="status">' + escapeHtml(state.payslipEstimateStatus || '') + '</div>'
      );
      if (privateUnlocked && privateEnabled) {
        html.push(
          '<section class="payroll-estimate-panel payroll-private-summary">' +
            '<span class="payroll-private-summary-icon">' + icons.lock + '</span>' +
            '<span class="payroll-private-summary-copy"><small>NERO · DA REGOLARIZZARE</small><strong>' +
              escapeHtml(privateRemainingHours.toLocaleString('it-IT', { maximumFractionDigits: 2 }) + ' h · ' + money(privateAmount)) +
            '</strong><p>Ore registrate non incluse nel cedolino stimato.</p></span>' +
          '</section>'
        );
      }
      html.push(
        '<section class="payroll-estimate-panel payroll-calculator-breakdown">' +
          '<div class="payroll-estimate-section-head"><div><small>QUESTO MESE</small><h2>Dal lordo al netto</h2></div><span>STIMA</span></div>' +
          '<div class="payroll-calculator-rows">' +
            '<div><span>Lordo base</span><b data-payroll-value="baseMonthlyGross">' + escapeHtml(estimate.valid ? money(estimate.baseMonthlyGross) : '--') + '</b></div>' +
            '<div><span>Straordinari lordi</span><b data-payroll-value="overtimeMonthlyGross">' + escapeHtml(estimate.valid ? money(estimate.overtimeMonthlyGross) : '--') + '</b></div>' +
            '<div class="is-total"><span>Lordo totale mensile</span><b data-payroll-value="totalMonthlyGross">' + escapeHtml(estimate.valid ? money(estimate.totalMonthlyGross) : '--') + '</b></div>' +
            '<div><span>Contributi INPS</span><b data-payroll-value="monthlyContributions">' + escapeHtml(estimate.valid ? negativeMoney(monthBreakdown.contributionCents) : '--') + '</b></div>' +
            '<div><span>IRPEF netta</span><b data-payroll-value="monthlyIrpef">' + escapeHtml(estimate.valid ? negativeMoney(monthBreakdown.irpefCents) : '--') + '</b></div>' +
            '<div><span>Addizionale regionale</span><b data-payroll-value="monthlyRegionalTax">' + escapeHtml(estimate.valid ? (estimate.regionalAvailable ? negativeMoney(monthBreakdown.regionalCents) : 'Non calcolata') : '--') + '</b></div>' +
            '<div><span>Addizionale comunale</span><b data-payroll-value="monthlyMunicipalTax">' + escapeHtml(municipalityValue) + '</b></div>' +
            '<div><span>Altre trattenute</span><b data-payroll-value="monthlyOtherDeductions">' + escapeHtml(estimate.valid ? negativeMoney(monthBreakdown.otherDeductionsCents) : '--') + '</b></div>' +
            '<div><span>Rimborsi</span><b class="is-positive" data-payroll-value="monthlyReimbursements">' + escapeHtml(estimate.valid ? positiveMoney(monthBreakdown.reimbursementsCents) : '--') + '</b></div>' +
            '<div class="is-net"><span>Netto stimato</span><b data-payroll-value="netMonth">' + escapeHtml(estimateTotal) + '</b></div>' +
          '</div>' +
          '<p class="payroll-calculator-notice' + (estimate.valid && estimate.incompleteReasons.length ? ' is-visible' : '') + '" data-payroll-municipal-notice>' + escapeHtml(estimate.valid ? estimate.incompleteReasons.join(' ') : '') + '</p>' +
        '</section>'
      );
      html.push(
        '<details class="payroll-estimate-panel payroll-calculator-form" open>' +
          '<summary><span><small>DATI PRINCIPALI</small><strong>Retribuzione e straordinari</strong></span>' + icons.right + '</summary>' +
          '<div class="payroll-estimate-rate-source"><span>' + icons.history + '</span><p>' + escapeHtml(sourceLabel) + '</p></div>' +
          '<div class="payroll-calculator-grid">' +
            '<label class="payroll-calculator-field"><span>LORDO MENSILE ORDINARIO</span><div><b>€</b><input data-payroll-field="baseMonthlyGross" data-payroll-money type="text" inputmode="decimal" autocomplete="off" value="' + escapeHtml(formatEditorDecimal(config.baseMonthlyGross)) + '"></div></label>' +
            '<label class="payroll-calculator-field"><span>MENSILITÀ CONTRATTUALI</span><div class="is-select"><select data-payroll-field="salaryMonths"><option value="12"' + (config.salaryMonths === 12 ? ' selected' : '') + '>12 mensilità</option><option value="13"' + (config.salaryMonths === 13 ? ' selected' : '') + '>13 · con tredicesima</option><option value="14"' + (config.salaryMonths === 14 ? ' selected' : '') + '>14 · con tredicesima e quattordicesima</option></select></div><small>Le mensilità aggiuntive non includono automaticamente gli straordinari.</small></label>' +
            '<label class="payroll-calculator-field"><span>ORE STRAORDINARIE AL MESE</span><div><input data-payroll-field="overtimeHoursMonthly" data-payroll-decimal type="text" inputmode="decimal" autocomplete="off" value="' + escapeHtml(formatEditorDecimal(config.overtimeHoursMonthly)) + '"><em>h</em></div></label>' +
            '<label class="payroll-calculator-field"><span>PAGA STRAORDINARIA LORDA</span><div><b>€</b><input data-payroll-field="overtimeHourlyRate" data-payroll-money type="text" inputmode="decimal" autocomplete="off" value="' + escapeHtml(formatEditorDecimal(config.overtimeHourlyRate)) + '"><em>/h</em></div></label>' +
            '<label class="payroll-calculator-field"><span>MESI CON STRAORDINARI</span><div><input data-payroll-field="monthsWithOvertime" data-payroll-integer type="number" inputmode="numeric" min="0" max="12" value="' + escapeHtml(String(config.monthsWithOvertime)) + '"><em>mesi</em></div></label>' +
            '<label class="payroll-calculator-field"><span>ALTRI COMPENSI LORDI ANNUI</span><div><b>€</b><input data-payroll-field="otherAnnualGross" data-payroll-money type="text" inputmode="decimal" autocomplete="off" value="' + escapeHtml(formatEditorDecimal(config.otherAnnualGross)) + '"></div></label>' +
          '</div>' +
          (recordedOvertimeHours > 0 ? '<button class="payroll-calculator-recorded" type="button" data-use-recorded-overtime="' + recordedOvertimeHours.toFixed(4) + '">' + icons.clock + '<span><b>Usa le ore registrate nell’app</b><small>' + escapeHtml(formatDuration(recordedOvertimeMinutes)) + ' in ' + escapeHtml(periodLabel) + '</small></span>' + icons.right + '</button>' : '') +
        '</details>'
      );
      html.push(
        '<details class="payroll-estimate-panel payroll-calculator-form payroll-calculator-tax-form">' +
          '<summary><span><small>FISCO E CONTRIBUTI</small><strong>Impostazioni della stima</strong></span>' + icons.right + '</summary>' +
          '<div class="payroll-calculator-grid">' +
            '<label class="payroll-calculator-field"><span>ALIQUOTA INPS LAVORATORE</span><div><input data-payroll-field="employeeContributionRate" data-payroll-decimal type="text" inputmode="decimal" autocomplete="off" value="' + escapeHtml(formatEditorDecimal(config.employeeContributionRate)) + '"><em>%</em></div><small>Configurabile: varia per CCNL, qualifica, azienda e agevolazioni.</small></label>' +
            '<label class="payroll-calculator-field"><span>ANNO FISCALE</span><div class="is-select"><select data-payroll-field="taxYear">' + yearOptions + '</select></div></label>' +
            '<label class="payroll-calculator-field"><span>GIORNI DI LAVORO NELL’ANNO</span><div><input data-payroll-field="employmentDays" data-payroll-integer type="number" inputmode="numeric" min="1" max="366" value="' + escapeHtml(String(config.employmentDays)) + '"><em>gg</em></div></label>' +
            '<label class="payroll-calculator-field"><span>CONTRATTO</span><div class="is-select"><select data-payroll-field="employmentType"><option value="permanent"' + (config.employmentType === 'permanent' ? ' selected' : '') + '>Tempo indeterminato</option><option value="fixed-term"' + (config.employmentType === 'fixed-term' ? ' selected' : '') + '>Tempo determinato</option></select></div></label>' +
            '<label class="payroll-calculator-field payroll-region-field"><span>REGIONE DI RESIDENZA</span><div class="is-select"><select data-payroll-field="region">' + regionOptions + '</select></div></label>' +
            '<div class="payroll-calculator-field payroll-municipality-field"><span>COMUNE DI RESIDENZA</span><div class="payroll-municipality-control"><input id="payrollMunicipalityInput" data-payroll-field="municipality" type="text" autocomplete="off" autocapitalize="words" spellcheck="false" value="' + escapeHtml(config.municipality) + '" placeholder="Cerca il Comune" aria-label="Comune di residenza" aria-autocomplete="list" aria-controls="payrollMunicipalityResults" aria-expanded="false"></div><div class="payroll-municipality-results" id="payrollMunicipalityResults" data-payroll-municipality-results role="listbox" hidden></div><small class="payroll-municipality-feedback ' + escapeHtml(municipalityFeedback.state) + '" data-payroll-municipality-feedback>' + escapeHtml(municipalityFeedback.text) + '</small></div>' +
            '<label class="payroll-calculator-field"><span>ALTRE TRATTENUTE ANNUE</span><div><b>€</b><input data-payroll-field="otherAnnualDeductions" data-payroll-money type="text" inputmode="decimal" autocomplete="off" value="' + escapeHtml(formatEditorDecimal(config.otherAnnualDeductions)) + '"></div></label>' +
            '<label class="payroll-calculator-field"><span>RIMBORSI ANNUI</span><div><b>€</b><input data-payroll-field="annualReimbursements" data-payroll-money type="text" inputmode="decimal" autocomplete="off" value="' + escapeHtml(formatEditorDecimal(config.annualReimbursements)) + '"></div></label>' +
          '</div>' +
        '</details>'
      );
      if (privateUnlocked) {
        html.push(
          '<section class="payroll-estimate-panel payroll-private-config' + (privateEnabled ? ' is-enabled' : '') + '" data-payroll-private-section>' +
            '<input type="hidden" data-payroll-field="privateReconciliationEnabled" value="' + (privateEnabled ? 'true' : 'false') + '">' +
            '<div class="payroll-private-head"><span class="payroll-private-icon">' + icons.lock + '</span><div><small>VOCE PRIVATA</small><h2>Nero</h2><p>Anticipo da regolarizzare a fine mese.</p></div><button type="button" role="switch" aria-checked="' + (privateEnabled ? 'true' : 'false') + '" aria-pressed="' + (privateEnabled ? 'true' : 'false') + '" data-payroll-private-toggle><i></i></button></div>' +
            '<div class="payroll-private-content">' +
              '<div class="payroll-private-equation"><span><small>REGISTRATE</small><b>' + escapeHtml(recordedOvertimeHours.toLocaleString('it-IT', { maximumFractionDigits: 2 })) + ' h</b></span><i>−</i><span><small>IN CEDOLINO</small><b data-payroll-private-included>' + escapeHtml(config.overtimeHoursMonthly.toLocaleString('it-IT', { maximumFractionDigits: 2 })) + ' h</b></span><i>=</i><span class="is-result"><small>RESIDUE</small><b data-payroll-private-hours>' + escapeHtml(privateRemainingHours.toLocaleString('it-IT', { maximumFractionDigits: 2 })) + ' h</b></span></div>' +
              '<div class="payroll-private-rate-row"><label class="payroll-calculator-field"><span>QUANTO VENGONO PAGATE</span><div><b>€</b><input data-payroll-field="privateReconciliationHourlyRate" data-payroll-money type="text" inputmode="decimal" autocomplete="off" value="' + escapeHtml(formatEditorDecimal(privateHourlyRate)) + '"><em>/h</em></div></label><span class="payroll-private-total"><small>TOTALE DA REGOLARIZZARE</small><strong data-payroll-private-amount>' + escapeHtml(money(privateAmount)) + '</strong></span></div>' +
              '<p class="payroll-private-warning">Questa voce non entra nel netto fiscale stimato e deve essere riconciliata con il cedolino definitivo.</p>' +
            '</div>' +
          '</section>'
        );
      } else if (configOpen) {
        html.push(
          '<input type="hidden" data-payroll-field="privateReconciliationEnabled" value="' + (privateEnabled ? 'true' : 'false') + '">' +
          '<input type="hidden" data-payroll-field="privateReconciliationHourlyRate" value="' + escapeHtml(formatEditorDecimal(privateHourlyRate)) + '">'
        );
      }
      html.push(
        '<section class="payroll-estimate-panel payroll-calculator-periods">' +
          '<div class="payroll-estimate-section-head"><div><small>MENSILITA</small><h2>Quanto potresti ricevere</h2></div><span>NETTO</span></div>' +
          '<div class="payroll-calculator-period-grid">' +
            '<div><small>MESE SENZA EXTRA</small><strong data-payroll-value="ordinaryMonthNet">' + escapeHtml(estimate.valid ? money(estimate.estimatedOrdinaryMonthNet) : '--') + '</strong></div>' +
            '<div class="is-highlight"><small>MESE CON EXTRA</small><strong data-payroll-value="monthWithOvertimeNet">' + escapeHtml(estimateTotal) + '</strong></div>' +
            '<div><small>TREDICESIMA</small><strong data-payroll-value="thirteenthNet">' + escapeHtml(estimate.valid && config.salaryMonths >= 13 ? money(estimate.estimatedThirteenthNet) : 'Non prevista') + '</strong></div>' +
            '<div><small>QUATTORDICESIMA</small><strong data-payroll-value="fourteenthNet">' + escapeHtml(estimate.valid && config.salaryMonths >= 14 ? money(estimate.estimatedFourteenthNet) : 'Non prevista') + '</strong></div>' +
          '</div>' +
        '</section>'
      );
      html.push(
        '<details class="payroll-estimate-panel payroll-calculator-details">' +
          '<summary><span><small>TRASPARENZA</small><strong>Come è stato calcolato</strong></span>' + icons.right + '</summary>' +
          '<div class="payroll-calculator-annual">' +
            '<div><span>RAL ordinaria</span><b data-payroll-value="baseAnnualGross">' + escapeHtml(estimate.valid ? money(estimate.baseAnnualGross) : '--') + '</b><small data-payroll-value="calcBaseAnnual">' + escapeHtml(estimate.valid ? (money(estimate.baseMonthlyGross) + ' × ' + config.salaryMonths + ' = ' + money(estimate.baseAnnualGross)) : '') + '</small></div>' +
            '<div><span>Straordinari annui</span><b data-payroll-value="overtimeAnnualGross">' + escapeHtml(estimate.valid ? money(estimate.overtimeAnnualGross) : '--') + '</b><small data-payroll-value="calcOvertimeAnnual">' + escapeHtml(estimate.valid ? (config.overtimeHoursMonthly.toLocaleString('it-IT', { maximumFractionDigits: 2 }) + ' h × ' + money(config.overtimeHourlyRate) + ' × ' + config.monthsWithOvertime + ' = ' + money(estimate.overtimeAnnualGross)) : '') + '</small></div>' +
            '<div class="is-total"><span>Reddito lordo annuo stimato</span><b data-payroll-value="totalAnnualGross">' + escapeHtml(estimate.valid ? money(estimate.totalAnnualGross) : '--') + '</b></div>' +
            '<div><span>Contributi INPS</span><b data-payroll-value="annualContributions">' + escapeHtml(estimate.valid ? negativeMoney(estimate.annualBreakdownCents.contributionsCents) : '--') + '</b><small data-payroll-value="calcContributions">' + escapeHtml(estimate.valid ? (money(estimate.totalAnnualGross) + ' × ' + config.employeeContributionRate.toLocaleString('it-IT', { maximumFractionDigits: 2 }) + '% = ' + money(estimate.annualContributions)) : '') + '</small></div>' +
            '<div><span>Imponibile fiscale</span><b data-payroll-value="annualTaxableIncome">' + escapeHtml(estimate.valid ? money(estimate.annualTaxableIncome) : '--') + '</b><small data-payroll-value="calcTaxable">' + escapeHtml(estimate.valid ? (money(estimate.totalAnnualGross) + ' - ' + money(estimate.annualContributions) + ' = ' + money(estimate.annualTaxableIncome)) : '') + '</small></div>' +
            '<div><span>IRPEF lorda</span><b data-payroll-value="annualGrossIrpef">' + escapeHtml(estimate.valid ? money(estimate.annualGrossIrpef) : '--') + '</b></div>' +
            '<div class="payroll-calculator-brackets" data-payroll-irpef-brackets>' + irpefRows + '</div>' +
            '<div><span>Detrazione lavoro dipendente</span><b data-payroll-value="employeeDeduction">' + escapeHtml(estimate.valid ? negativeMoney(estimate.annualBreakdownCents.employeeDeductionCents) : '--') + '</b></div>' +
            '<div><span>IRPEF netta</span><b data-payroll-value="annualNetIrpef">' + escapeHtml(estimate.valid ? money(estimate.annualNetIrpef) : '--') + '</b><small data-payroll-value="calcIrpef">' + escapeHtml(estimate.valid ? (money(estimate.annualGrossIrpef) + ' - ' + money(estimate.employeeDeduction) + ' = ' + money(estimate.annualNetIrpef)) : '') + '</small></div>' +
            '<div><span>Addizionale regionale</span><b data-payroll-value="annualRegionalTax">' + escapeHtml(estimate.valid ? (estimate.regionalAvailable ? money(estimate.annualRegionalTax) : 'Non calcolata') : '--') + '</b></div>' +
            '<div><span>Addizionale comunale</span><b data-payroll-value="annualMunicipalTax">' + escapeHtml(estimate.valid && estimate.municipalityConfig ? money(estimate.annualMunicipalTax) : 'Non calcolata') + '</b><small data-payroll-value="calcMunicipal">' + escapeHtml(estimate.valid && estimate.municipalityConfig ? ('Acconto ' + money(estimate.annualMunicipalAdvance) + ' · saldo ' + money(estimate.annualMunicipalBalance)) : '') + '</small></div>' +
            '<div><span>Altre trattenute</span><b data-payroll-value="annualOtherDeductions">' + escapeHtml(estimate.valid ? money(estimate.annualOtherDeductions) : '--') + '</b></div>' +
            '<div><span>Rimborsi</span><b data-payroll-value="annualReimbursements">' + escapeHtml(estimate.valid ? money(estimate.annualReimbursements) : '--') + '</b></div>' +
            '<div class="is-net"><span>Netto annuale stimato</span><b data-payroll-value="annualNet">' + escapeHtml(estimate.valid ? money(estimate.estimatedAnnualNet) : '--') + '</b></div>' +
            '<p class="payroll-calculator-source">' + escapeHtml(estimate.valid ? estimate.taxConfig.sourceLabel : '') + '</p>' +
          '</div>' +
        '</details>'
      );
      html.push(
        '<section class="payroll-estimate-panel payroll-calculator-save-panel">' +
          '<div class="payroll-calculator-save-copy"><small>CONFIGURAZIONE DEL MESE</small><p>Le ore e i cedolini gia salvati non vengono modificati.</p></div>' +
          '<button class="solid payroll-estimate-save" data-save-payslip-estimate="1">' + icons.check + '<span>Salva dati della stima</span></button>' +
          '<div class="payroll-estimate-status' + (state.payslipEstimateStatus ? ' is-visible' : '') + '" data-payslip-estimate-status role="status">' + escapeHtml(state.payslipEstimateStatus || '') + '</div>' +
        '</section>'
      );
      if (actualPayslip) {
        html.push(
          '<section class="payroll-estimate-actual"><span class="payroll-estimate-actual-icon">' + icons.receipt + '</span><div><small>BUSTA SALVATA</small><strong>' + escapeHtml(getPayslipMonthLabel(actualPayslip)) + '</strong><p>' +
          (actualGross ? ('Lordo indicato ' + formatSalaryEstimateMoney(actualGross) + ' · ') : '') +
          'Netto ricevuto ' + formatSalaryEstimateMoney(actualNet) + '</p></div><button data-open-payslip="' + escapeHtml(actualPayslip.id) + '" aria-label="Apri cedolino">' + icons.right + '</button></section>'
        );
      }
      html.push('<p class="payroll-estimate-disclaimer">Il risultato è una stima e può differire dal cedolino reale. Il netto effettivo dipende dal CCNL, dalle aliquote contributive applicate, dalle detrazioni personali, dal Comune di residenza, dai conguagli, dai giorni lavorati e da eventuali voci retributive.</p>');
      html.push('</div>');
      return html.join('');
    }

    function renderSalaryHubV2() {
      var items = (state.payslips || []).slice();
      var currentEstimateDate = state.salaryMonth instanceof Date ? state.salaryMonth : new Date();
      currentEstimateDate = new Date(currentEstimateDate.getFullYear(), currentEstimateDate.getMonth(), 1);
      state.salaryMonth = currentEstimateDate;
      var currentYear = currentEstimateDate.getFullYear();
      var currentMonth = currentEstimateDate.getMonth() + 1;
      var currentMonthName = monthNames[currentMonth - 1];
      var currentEstimate = getPayrollNetEstimateForMonth(
        currentYear,
        currentMonth
      );
      var currentEstimateValue = currentEstimate.valid
        ? formatSalaryEstimateMoney(currentEstimate.estimatedMonthWithOvertimeNet)
        : 'Configura stima';
      var currentEstimateHint = currentEstimate.valid
        ? (currentEstimate.incomplete
          ? 'Stima parziale: completa i dati fiscali per maggiore precisione.'
          : 'Calcolo aggiornato con imposte e contributi.')
        : 'Inserisci i dati retributivi e fiscali per iniziare.';
      var currentEstimateStatus = currentEstimate.valid
        ? (currentEstimate.incomplete ? 'Stima parziale' : 'Stima completa')
        : 'Da configurare';
      var currentEstimateStatusClass = currentEstimate.valid
        ? (currentEstimate.incomplete ? ' is-partial' : ' is-complete')
        : ' is-missing';
      var monthBreakdown = currentEstimate.valid && currentEstimate.monthlyBreakdown
        ? currentEstimate.monthlyBreakdown.withOvertime
        : null;
      var monthGross = monthBreakdown ? Math.max(0, Number(monthBreakdown.grossCents) || 0) / 100 : 0;
      var monthNet = monthBreakdown ? Math.max(0, Number(monthBreakdown.netCents) || 0) / 100 : 0;
      var monthDeductions = Math.max(0, monthGross - monthNet);
      var currentMonthPayslip = items.find(function (item) {
        return Number(item.year) === currentYear && Number(item.month) === currentMonth;
      }) || null;
      var currentActualNet = currentMonthPayslip ? Math.max(0, parseDecimalInput(currentMonthPayslip.netto, 0)) : 0;
      var currentPredictedNet = currentEstimate.valid ? Math.max(0, Number(currentEstimate.estimatedMonthWithOvertimeNet) || 0) : 0;
      var comparisonDelta = currentActualNet - currentPredictedNet;
      var comparisonPercent = currentPredictedNet > 0 ? Math.round((comparisonDelta / currentPredictedNet) * 100) : 0;
      var comparisonTone = comparisonDelta < 0 ? ' is-lower' : ' is-higher';
      var monthReviewMarkup = currentActualNet > 0
        ? '<button class="salary-month-review' + (currentPredictedNet > 0 ? comparisonTone : '') + '" data-open-payslip="' + escapeHtml(currentMonthPayslip.id) + '">' +
            '<span class="salary-month-review-icon">' + icons.receipt + '</span>' +
            '<span class="salary-month-review-copy"><small>CEDOLINO DI ' + escapeHtml(currentMonthName.toUpperCase()) + '</small><strong>' + formatSalaryEstimateMoney(currentActualNet) + ' ricevuti</strong></span>' +
            (currentPredictedNet > 0
              ? '<span class="salary-month-review-delta"><strong>' + (comparisonDelta >= 0 ? '+' : '-') + formatMoneyEuro(Math.abs(comparisonDelta)) + '</strong><small>' + (comparisonDelta >= 0 ? '+' : '') + comparisonPercent + '% dalla stima</small></span>'
              : '<span class="salary-month-review-delta is-action"><strong>Apri</strong><small>Dettaglio</small></span>') +
            '<i>' + icons.right + '</i>' +
          '</button>'
        : '<button class="salary-month-review is-empty" data-new-payslip="1">' +
            '<span class="salary-month-review-icon">' + icons.receipt + '</span>' +
            '<span class="salary-month-review-copy"><small>CEDOLINO DI ' + escapeHtml(currentMonthName.toUpperCase()) + '</small><strong>Aggiungi il netto ricevuto</strong></span>' +
            '<span class="salary-month-review-delta is-action"><strong>Confronta</strong><small>con la stima</small></span>' +
            '<i>' + icons.right + '</i>' +
          '</button>';
      var yearItems = items.filter(function (item) {
        return Number(item.year) === currentYear;
      });
      var monthTotals = {};
      yearItems.forEach(function (item) {
        var month = Math.min(12, Math.max(1, Number(item.month) || 1));
        monthTotals[month] = (monthTotals[month] || 0) + Math.max(0, parseDecimalInput(item.netto, 0));
      });
      var yearMonths = Object.keys(monthTotals).map(Number).sort(function (a, b) { return a - b; });
      var yearTotal = yearMonths.reduce(function (sum, month) { return sum + monthTotals[month]; }, 0);
      var yearAverage = yearMonths.length ? yearTotal / yearMonths.length : 0;
      var chartMonths = yearMonths.slice(-6);
      var chartMaximum = chartMonths.reduce(function (maximum, month) {
        return Math.max(maximum, monthTotals[month]);
      }, 1);
      var yearBars = chartMonths.map(function (month) {
        var height = Math.max(18, Math.round((monthTotals[month] / chartMaximum) * 100));
        return '<span class="salary-year-bar" style="--salary-bar:' + height + '%"><i></i><small>' + escapeHtml(monthNames[month - 1].slice(0, 3)) + '</small></span>';
      }).join('');
      var trendValue = 0;
      var trendLabel = yearMonths.length > 1 ? 'rispetto al mese precedente' : 'servono almeno due mesi';
      if (yearMonths.length > 1) {
        trendValue = monthTotals[yearMonths[yearMonths.length - 1]] - monthTotals[yearMonths[yearMonths.length - 2]];
      }
      var annualValue = yearMonths.length
        ? formatMoneyEuro(yearTotal)
        : (currentEstimate.valid ? formatSalaryEstimateMoney(currentEstimate.estimatedAnnualNet) : '--');
      var annualLabel = yearMonths.length ? 'Netto archiviato' : 'Proiezione netta';
      var trendText = yearMonths.length > 1
        ? ((trendValue >= 0 ? '+' : '-') + formatMoneyEuro(Math.abs(trendValue)))
        : '--';
      var yearChartMarkup = yearMonths.length > 1
        ? '<div class="salary-year-chart" aria-label="Andamento degli ultimi mesi">' + yearBars + '</div>'
        : (yearMonths.length === 1
          ? '<div class="salary-year-chart-note"><span>' + icons.activity + '</span><div><strong>Primo mese registrato</strong><small>Il trend comparir&agrave; dal prossimo cedolino.</small></div></div>'
          : '<div class="salary-year-chart is-empty"><span></span><span></span><span></span><span></span><span></span><span></span></div>');
      return '<div class="salary-hub-page">' +
        '<header class="salary-hub-top"><div><span>FINANZE PERSONALI</span><h1>Stipendio</h1></div><div class="salary-hub-month-switch" aria-label="Mese visualizzato"><button data-salary-month="-1" aria-label="Mese precedente">' + icons.left + '</button><span><small>' + escapeHtml(currentMonthName) + '</small><strong>' + escapeHtml(String(currentYear)) + '</strong></span><button data-salary-month="1" aria-label="Mese successivo">' + icons.right + '</button></div></header>' +
        '<div class="stack payroll-stack salary-hub-stack">' +
          '<section class="salary-hub-hero">' +
            '<div class="salary-hub-hero-head"><span class="salary-hub-wallet">' + icons.wallet + '</span><div><small>STIMA · ' + escapeHtml(currentMonthName.toUpperCase()) + ' ' + escapeHtml(String(currentYear)) + '</small><h2>Netto previsto</h2></div><span class="salary-estimate-status' + currentEstimateStatusClass + '">' + escapeHtml(currentEstimateStatus) + '</span></div>' +
            '<div class="salary-hub-amount"><strong class="salary-hub-estimate' + (currentEstimate.valid ? '' : ' is-setup') + '">' + currentEstimateValue + '</strong><p>' + escapeHtml(currentEstimateHint) + '</p></div>' +
            '<div class="salary-hub-breakdown" aria-label="Riepilogo della stima"><div><span>LORDO MESE</span><strong>' + (currentEstimate.valid ? formatSalaryEstimateMoney(monthGross) : '--') + '</strong></div><div><span>TRATTENUTE</span><strong>' + (currentEstimate.valid ? ('-' + formatSalaryEstimateMoney(monthDeductions)) : '--') + '</strong></div><div><span>NETTO</span><strong>' + (currentEstimate.valid ? formatSalaryEstimateMoney(monthNet) : '--') + '</strong></div></div>' +
            monthReviewMarkup +
          '</section>' +
          '<section class="salary-hub-actions" aria-label="Azioni stipendio">' +
            '<button data-open-payslip-estimate="1"><span class="is-violet">' + icons.target + '</span><strong>Calcolo</strong><small>Dettaglio</small></button>' +
            '<button data-new-payslip="1"><span class="is-blue">' + icons.plus + '</span><strong>Nuovo</strong><small>Cedolino</small></button>' +
            '<button data-open-payslip-archive="1"><span class="is-cyan">' + icons.history + '</span><strong>Archivio</strong><small>' + items.length + (items.length === 1 ? ' salvato' : ' salvati') + '</small></button>' +
          '</section>' +
          '<section class="salary-year-card"><div class="salary-year-head"><div><small>QUEST\'ANNO</small><h2>' + annualLabel + '</h2></div><button data-open-payslip-stats="1">Analisi ' + icons.right + '</button></div>' +
            '<div class="salary-year-body"><div class="salary-year-total"><strong>' + annualValue + '</strong><span>' + (yearMonths.length ? (yearMonths.length + (yearMonths.length === 1 ? ' mese registrato' : ' mesi registrati')) : 'basata sulla configurazione attuale') + '</span></div>' +
            yearChartMarkup + '</div>' +
            '<div class="salary-year-metrics"><div><span>MEDIA MESE</span><strong>' + (yearMonths.length ? formatMoneyEuro(yearAverage) : '--') + '</strong></div><div><span>CEDOLINI</span><strong>' + yearItems.length + '</strong></div><div class="' + (trendValue < 0 ? 'is-down' : 'is-up') + '"><span>VARIAZIONE</span><strong>' + trendText + '</strong><small>' + trendLabel + '</small></div></div>' +
          '</section>' +
        '</div></div>';
    }

    function renderPayslipArchiveGroups(items) {
      var grouped = {};
      items.forEach(function (item) {
        var year = String(Number(item.year) || new Date().getFullYear());
        if (!grouped[year]) grouped[year] = [];
        grouped[year].push(item);
      });
      return Object.keys(grouped).sort(function (a, b) {
        return Number(b) - Number(a);
      }).map(function (year) {
        var rows = sortPayslipsByPeriod(grouped[year]).map(function (item) {
          var photos = normalizePayslipPhotos(item);
          var photoCount = getPayslipPhotoCount(item);
          var cover = photos[0] || null;
          return '<button class="payroll-archive-row" data-open-payslip="' + escapeHtml(item.id) + '">' +
            '<span class="payroll-archive-thumb' + (cover ? '' : ' is-empty') + '">' +
              (cover
                ? '<img loading="lazy" decoding="async" src="' + (cover.thumbnail || cover.data) + '" alt="Anteprima cedolino">'
                : icons.receipt) +
              (photoCount > 1 ? '<b>' + photoCount + '</b>' : '') +
            '</span>' +
            '<span class="payroll-archive-copy"><strong>' + escapeHtml(getPayslipMonthLabel(item)) + '</strong><small>' +
              photoCount + (photoCount === 1 ? ' foto salvata' : ' foto salvate') +
            '</small></span>' +
            '<span class="payroll-archive-amount">' + formatMoneyEuro(item.netto) + '</span>' +
            '<span class="payroll-archive-chevron">' + icons.right + '</span>' +
          '</button>';
        }).join('');
        return '<section class="payroll-year-group"><div class="payroll-year-head"><span>' + year + '</span><small>' +
          grouped[year].length + (grouped[year].length === 1 ? ' cedolino' : ' cedolini') +
          '</small></div><div class="payroll-archive-list">' + rows + '</div></section>';
      }).join('');
    }

    function renderPayslipArchiveV2() {
      var items = sortPayslipsByPeriod(state.payslips || []);
      var totalAmount = items.reduce(function (sum, item) {
        return sum + Math.max(0, parseDecimalInput(item.netto, 0));
      }, 0);
      return '<div class="salary-archive-page">' +
        '<div class="profile-subpage-top payroll-page-top salary-archive-top"><button data-close-payslip-archive="1" aria-label="Torna a Stipendio">' + icons.left + '</button><div><span>STIPENDIO</span><h1>Archivio cedolini</h1></div><i></i></div>' +
        '<div class="stack payroll-stack salary-archive-stack">' +
          '<section class="salary-archive-summary"><span class="salary-archive-summary-icon">' + icons.history + '</span><div><small>DOCUMENTI SALVATI</small><strong>' + items.length + '</strong><p>' + (items.length === 1 ? '1 cedolino nel tuo archivio' : items.length + ' cedolini nel tuo archivio') + '</p></div><span class="salary-archive-summary-total"><small>NETTO ARCHIVIATO</small><strong>' + (items.length ? formatMoneyEuro(totalAmount) : '--') + '</strong></span></section>' +
          '<div class="salary-archive-title"><div><span>ARCHIVIO</span><h2>Tutti i cedolini</h2></div><button data-new-payslip="1">' + icons.plus + '<span>Aggiungi</span></button></div>' +
          (items.length
            ? renderPayslipArchiveGroups(items)
            : '<section class="payroll-empty salary-archive-empty"><span>' + icons.receipt + '</span><h2>Archivio ancora vuoto</h2><p>Aggiungi il primo cedolino: bastano una foto e l\'importo ricevuto.</p><button class="solid" data-new-payslip="1">Aggiungi il primo cedolino</button></section>') +
        '</div></div>';
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
      return '<div class="profile-subpage-top payroll-page-top"><button data-close-payslip-detail="1" aria-label="Torna indietro">' + icons.left + '</button><div><span>CEDOLINI</span><h1>Dettaglio</h1></div><i></i></div>' +
        '<div class="stack payroll-stack payroll-detail-stack">' +
          '<section class="payroll-detail-hero"><div><small>CEDOLINO</small><h2>' + escapeHtml(getPayslipMonthLabel(payslip)) + '</h2><span>Salvato il ' + escapeHtml(createdLabel) + '</span></div><strong>' + formatMoneyEuro(payslip.netto) + '</strong></section>' +
          '<section class="payroll-panel payroll-documents"><div class="payroll-section-head"><div><small>DOCUMENTI</small><h2>' + (photosLoading ? 'Carico le foto...' : (photoCount + (photoCount === 1 ? ' foto salvata' : ' foto salvate'))) + '</h2></div><span class="payroll-readonly-badge">Sola lettura</span></div>' +
            (photos.length ? '<div class="payroll-photo-grid is-readonly">' + renderPayrollPhotoGrid(photos, 'archive', payslip.id, false) + '</div>' : '') +
            '<p class="payroll-help">' + (photosLoading ? 'Recupero solo i documenti di questo cedolino dal database.' : 'Tocca una foto per aprirla a schermo intero. Da questa vista non puoi modificare o cancellare immagini.') + '</p>' +
          '</section>' +
          '<section class="payroll-detail-info"><div><span>PERIODO</span><strong>' + escapeHtml(getPayslipMonthLabel(payslip)) + '</strong></div><div><span>IMPORTO RICEVUTO</span><strong>' + formatMoneyEuro(payslip.netto) + '</strong></div></section>' +
          '<section class="payroll-panel payroll-detail-compensation"><div class="payroll-section-head"><div><small>DATI DEL MESE</small><h2>Tariffe e note</h2></div></div>' +
            '<div class="payroll-detail-rate-grid"><div><span>PAGA ORARIA</span><strong>' + (hourlyRate > 0 ? (formatMoneyEuro(hourlyRate) + '/h') : '--') + '</strong></div><div><span>ORA STRAORDINARIA</span><strong>' + (overtimeRate > 0 ? (formatMoneyEuro(overtimeRate) + '/h') : '--') + '</strong></div></div>' +
            '<div class="payroll-detail-notes"><span>NOTE</span><p>' + (payslipNotes ? escapeHtml(payslipNotes) : 'Nessuna nota per questo mese.') + '</p></div>' +
          '</section>' +
          '<div class="payroll-detail-actions"><button class="solid" data-edit-payslip="' + escapeHtml(payslip.id) + '">Modifica cedolino</button><button class="ghost danger" data-delete-payslip="' + escapeHtml(payslip.id) + '">Elimina</button></div>' +
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
      return '<div class="profile-subpage-top payroll-page-top"><button data-close-payslip-editor="1" aria-label="Annulla e torna indietro">' + icons.left + '</button><div><span>' + (editing ? 'MODIFICA' : 'NUOVO CEDOLINO') + '</span><h1>' + (editing ? 'Modifica cedolino' : 'Aggiungi cedolino') + '</h1></div><i></i></div>' +
        '<div class="stack payroll-stack payroll-editor-stack">' +
          '<section class="payroll-editor-intro"><span>' + icons.receipt + '</span><div><h2>' + (editing ? escapeHtml(getPayslipMonthLabel(draft)) : 'Nuovo cedolino') + '</h2><p>Salva foto, importo e riferimenti del mese in un unico posto.</p></div></section>' +
          '<section class="payroll-panel"><div class="payroll-section-head"><div><small>1. PERIODO</small><h2>A quale mese appartiene?</h2></div></div><div class="payroll-period-grid"><label><span>Mese</span><select id="payslipMonth">' + monthNames.map(function (name, index) { return '<option value="' + (index + 1) + '" ' + (Number(draft.month) === index + 1 ? 'selected' : '') + '>' + name + '</option>'; }).join('') + '</select></label><label><span>Anno</span><input id="payslipYear" type="number" min="2000" max="2100" inputmode="numeric" value="' + escapeHtml(draft.year || new Date().getFullYear()) + '"></label></div></section>' +
          '<section class="payroll-panel"><div class="payroll-section-head"><div><small>2. FOTO</small><h2>' + (photos.length ? (photos.length + (photos.length === 1 ? ' foto aggiunta' : ' foto aggiunte')) : 'Aggiungi il cedolino') + '</h2></div><span>' + photos.length + '/' + MAX_PAYSLIP_PHOTOS + '</span></div>' +
            (photos.length ? '<div class="payroll-photo-grid">' + renderPayrollPhotoGrid(photos, 'draft', '', true) + '</div>' : '<div class="payroll-photo-empty"><span>' + icons.receipt + '</span><strong>Nessuna foto</strong><p>Fotografa tutte le pagine oppure sceglile dalla galleria.</p></div>') +
            '<div class="payroll-upload-actions"><button class="solid" data-trigger-payslip-camera="1" ' + (state.payslipBusy ? 'disabled' : '') + '>Scatta foto</button><button class="ghost" data-trigger-payslip-gallery="1" ' + (state.payslipBusy ? 'disabled' : '') + '>Apri galleria</button></div>' +
          '</section>' +
          '<section class="payroll-panel"><div class="payroll-section-head"><div><small>3. IMPORTO</small><h2>Quanto hai ricevuto?</h2></div></div><label class="payroll-net-input"><span>EUR</span><input id="payslipNetto" type="text" inputmode="decimal" autocomplete="off" value="' + escapeHtml(formatEditorDecimal(draft.netto || 0)) + '" placeholder="0,00"></label><p class="payroll-help">Inserisci il netto effettivamente accreditato.</p></section>' +
          '<section class="payroll-panel payroll-rates-panel"><div class="payroll-section-head"><div><small>4. TARIFFE E NOTE</small><h2>Dettagli del mese</h2></div></div>' +
            '<button type="button" role="switch" class="payroll-rate-reuse ' + (reuseRates ? 'is-on' : '') + '" data-toggle-payslip-rate-reuse="1" aria-checked="' + (reuseRates ? 'true' : 'false') + '" aria-pressed="' + (reuseRates ? 'true' : 'false') + '" ' + (!previousRates && !reuseRates ? 'disabled' : '') + '><span class="payroll-rate-reuse-icon">' + icons.activity + '</span><span class="payroll-rate-reuse-copy"><strong>Usa le tariffe del mese precedente</strong><small>' + escapeHtml(reuseHelp) + '</small></span><span class="payroll-rate-switch"><i></i></span></button>' +
            '<div class="payroll-rate-grid"><label class="payroll-rate-field"><span>PAGA ORARIA</span><div><b>EUR</b><input id="payslipHourlyRate" type="text" inputmode="decimal" autocomplete="off" value="' + escapeHtml(formatEditorDecimal(draft.hourlyRate || 0)) + '" placeholder="0,00" ' + (reuseRates ? 'readonly' : '') + '><em>/h</em></div></label><label class="payroll-rate-field"><span>STRAORDINARIO</span><div><b>EUR</b><input id="payslipOvertimeRate" type="text" inputmode="decimal" autocomplete="off" value="' + escapeHtml(formatEditorDecimal(draft.overtimeRate || 0)) + '" placeholder="0,00" ' + (reuseRates ? 'readonly' : '') + '><em>/h</em></div></label></div>' +
            '<label class="payroll-notes-field"><span>NOTE DEL MESE</span><textarea id="payslipNotes" rows="3" maxlength="1000" placeholder="Aggiungi una nota sul cedolino...">' + escapeHtml(draft.notes || '') + '</textarea></label>' +
          '</section>' +
          statusHtml +
          '<button class="solid payroll-editor-save" data-save-payslip="1" ' + (state.payslipBusy ? 'disabled' : '') + '>' + (state.payslipBusy ? busyLabel : (editing ? 'Salva modifiche' : 'Salva cedolino')) + '</button>' +
        '</div><input id="payslipFileInput" type="file" accept="image/*" multiple hidden>';
    }

    function renderPayslips() {
      if (state.payslipEstimateOpen) return renderPayrollNetCalculatorV3();
      if (state.payslipStatsOpen) return renderPayslipStatsV2();
      if (state.payslipEditorOpen) return renderPayslipEditorV2();
      if (state.payslipDetailId) {
        var detail = (state.payslips || []).find(function (item) { return item.id === state.payslipDetailId; });
        if (detail) return renderPayslipDetailV2(detail);
      }
      if (state.payslipArchiveOpen) return renderPayslipArchiveV2();
      return renderSalaryHubV2();
    }

    function getProfileAvatarPresetAsset(preset) {
      var avatars = {
        nova: { label: 'Nova', src: '/assets/avatars/nova.webp' },
        byte: { label: 'Byte', src: '/assets/avatars/byte.webp' },
        milo: { label: 'Milo', src: '/assets/avatars/milo.webp' },
        lumi: { label: 'Lumi', src: '/assets/avatars/lumi.webp' },
        pico: { label: 'Pico', src: '/assets/avatars/pico.webp' },
        nori: { label: 'Nori', src: '/assets/avatars/nori.webp' },
        aria: { label: 'Aria', src: '/assets/avatars/aria.png' },
        zed: { label: 'Zed', src: '/assets/avatars/zed.png' },
        orbit: { label: 'Orbit', src: '/assets/avatars/orbit.png' },
        rex: { label: 'Rex', src: '/assets/avatars/rex.png' },
        kira: { label: 'Kira', src: '/assets/avatars/kira.png' },
        mocha: { label: 'Mocha', src: '/assets/avatars/mocha.png' }
      };
      return avatars[preset] || avatars.nova;
    }

    function renderAvatarImage(avatar, lazy) {
      return '<img class="avatar-image" src="' + avatar.src + '" alt="" decoding="async" loading="' + (lazy ? 'lazy' : 'eager') + '">';
    }

    function renderProfileAvatarMarkup(extraClass, fallbackInitials) {
      var settings = state.settingsDraft || state.settings || {};
      var mode = String(settings.profileAvatarMode || 'preset');
      var preset = String(settings.profileAvatarPreset || 'nova');
      var className = 'go-profile-avatar ' + (extraClass || '') + ' is-' + escapeHtml(mode);
      if (mode === 'photo' && /^data:image\//i.test(String(settings.profileAvatarData || ''))) {
        return '<span class="' + className + '"><img src="' + escapeHtml(settings.profileAvatarData) + '" alt=""></span>';
      }
      if (mode === 'initials') {
        return '<span class="' + className + '"><b>' + escapeHtml(fallbackInitials || 'U') + '</b></span>';
      }
      var avatar = getProfileAvatarPresetAsset(preset);
      return '<span class="' + className + ' is-preset is-preset-' + escapeHtml(preset) + '" role="img" aria-label="Mascotte ' + escapeHtml(avatar.label) + '">' + renderAvatarImage(avatar, false) + '</span>';
    }

    function renderProfileAvatarPicker() {
      if (!state.avatarPickerOpen) return '';
      var presets = [
        { key: 'nova', label: 'Nova' },
        { key: 'byte', label: 'Byte' },
        { key: 'milo', label: 'Milo' },
        { key: 'lumi', label: 'Lumi' },
        { key: 'pico', label: 'Pico' },
        { key: 'nori', label: 'Nori' },
        { key: 'aria', label: 'Aria' },
        { key: 'zed', label: 'Zed' },
        { key: 'orbit', label: 'Orbit' },
        { key: 'rex', label: 'Rex' },
        { key: 'kira', label: 'Kira' },
        { key: 'mocha', label: 'Mocha' }
      ];
      var selected = String((state.settingsDraft || {}).profileAvatarPreset || 'nova');
      return '<div class="avatar-picker-overlay" role="dialog" aria-modal="true" aria-labelledby="avatarPickerTitle">' +
        '<button class="avatar-picker-backdrop" data-close-avatar-picker="1" aria-label="Chiudi"></button>' +
        '<section class="avatar-picker-dialog"><div class="avatar-picker-head"><div><small>IL TUO PROFILO</small><h2 id="avatarPickerTitle">Scegli il tuo personaggio</h2><p>Usa una mascotte GestOre oppure una tua foto.</p></div><button data-close-avatar-picker="1" aria-label="Chiudi">' + icons.x + '</button></div>' +
        '<div class="avatar-picker-presets">' + presets.map(function (item) {
          var avatar = getProfileAvatarPresetAsset(item.key);
          return '<button class="avatar-preset is-' + item.key + (selected === item.key ? ' is-selected' : '') + '" data-select-avatar-preset="' + item.key + '" aria-label="Scegli ' + item.label + '"><span class="avatar-preset-art">' + renderAvatarImage(avatar, true) + '</span><small>' + item.label + '</small></button>';
        }).join('') + '</div>' +
        '<div class="avatar-picker-actions"><button data-trigger-avatar-gallery="1">' + icons.download + '<span><strong>Scegli dalla galleria</strong><small>JPG, PNG o WebP</small></span></button><button data-trigger-avatar-camera="1">' + icons.camera + '<span><strong>Scatta una foto</strong><small>Usa la fotocamera</small></span></button></div>' +
        '<button class="avatar-picker-initials" data-select-avatar-initials="1">Usa le iniziali del nome</button>' +
        '<input id="profileAvatarGalleryInput" type="file" accept="image/*" hidden><input id="profileAvatarCameraInput" type="file" accept="image/*" capture="user" hidden>' +
        '</section></div>';
    }

    function renderProfile() {
      var rawName = String(state.settingsDraft.userName || '').trim() || 'Utente';
      var safeName = escapeHtml(rawName);
      var initials = rawName.split(/\s+/).slice(0, 2).map(function (part) { return part.charAt(0).toUpperCase(); }).join('') || 'U';
      var todayLabel = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
      var savedCount = (state.payslips || []).length;
      var dailyTarget = Math.max(0, Number(state.settingsDraft.dailyTarget) || 0).toLocaleString('it-IT', { maximumFractionDigits: 1 }) + 'h';
      var weeklyTarget = Math.max(0, Number(state.settingsDraft.weeklyTarget) || 0).toLocaleString('it-IT', { maximumFractionDigits: 1 }) + 'h';
      return '<div class="profile-page profile-page-v2">' +
        '<header class="profile-v2-top profile-v2-top-with-back"><button data-close-profile="1" aria-label="Torna alla Home">' + icons.left + '</button><div><div class="profile-v2-wordmark">Profilo</div></div><button class="profile-search-button" data-open-global-search="1" aria-label="Cerca nell&apos;archivio">' + icons.search + '</button></header>' +
        '<section class="profile-v2-hero">' +
          '<div class="profile-v2-identity"><button class="profile-v2-avatar-button" data-open-avatar-picker="1" aria-label="Cambia foto profilo">' + renderProfileAvatarMarkup('is-profile', initials) + '<i>' + icons.plus + '</i></button><div class="profile-v2-copy"><h1>Ciao, ' + safeName + '</h1><p>' + escapeHtml(todayLabel) + '</p></div></div>' +
        '</section>' +
        '<section class="profile-v2-summary" aria-label="Riepilogo profilo">' +
          '<div><span>OGGI</span><strong>' + dailyTarget + '</strong></div>' +
          '<div><span>SETTIMANA</span><strong>' + weeklyTarget + '</strong></div>' +
          '<div><span>CEDOLINI</span><strong>' + savedCount + '</strong></div>' +
        '</section>' +
        '<div class="profile-section-title">Preferenze</div>' +
        '<section class="profile-group profile-v2-group">' +
          '<button class="profile-row" data-open-profile-section="settings"><span class="profile-row-icon is-blue">' + icons.settings + '</span><span class="profile-row-copy"><strong>Impostazioni dell&apos;app</strong></span><span class="profile-row-value">Personalizza</span><span class="profile-row-chevron">' + icons.right + '</span></button>' +
        '</section>' +
        '<div class="profile-section-title">Account, dati e documenti</div>' +
        '<section class="profile-group profile-v2-group">' +
          '<button class="profile-row" data-open-profile-section="settings" data-settings-section="data"><span class="profile-row-icon is-green">' + icons.lock + '</span><span class="profile-row-copy"><strong>Account e backup</strong></span><span class="profile-row-chevron">' + icons.right + '</span></button>' +
          '<button class="profile-row" data-open-profile-section="settings" data-settings-section="history"><span class="profile-row-icon is-blue">' + icons.history + '</span><span class="profile-row-copy"><strong>Cronologia dati</strong></span><span class="profile-row-chevron">' + icons.right + '</span></button>' +
          '<button class="profile-row" data-open-profile-section="exports"><span class="profile-row-icon is-violet">' + icons.download + '</span><span class="profile-row-copy"><strong>Report ed esportazioni</strong></span><span class="profile-row-value">4 PDF</span><span class="profile-row-chevron">' + icons.right + '</span></button>' +
          '<button class="profile-row" data-open-profile-section="settings" data-settings-section="privacy"><span class="profile-row-icon is-blue">' + icons.lock + '</span><span class="profile-row-copy"><strong>Privacy e sicurezza</strong></span><span class="profile-row-chevron">' + icons.right + '</span></button>' +
        '</section>' +
        '<div class="profile-app-footer"><strong>GestOre v' + escapeHtml(state.settings.version) + '</strong><nav aria-label="Informazioni legali"><button data-open-legal="privacy">Privacy</button><button data-open-legal="terms">Termini</button><button data-open-legal="support">Supporto</button></nav></div>' +
      '</div>';
    }

    function renderExports() {
      var monthLabel = escapeHtml(monthNames[state.currentMonth.getMonth()]);
      var yearLabel = escapeHtml(String(state.currentMonth.getFullYear()));
      var monthPrefix = String(state.currentMonth.getFullYear()) + '-' + String(state.currentMonth.getMonth() + 1).padStart(2, '0') + '-';
      var yearPrefix = String(state.currentMonth.getFullYear()) + '-';
      var entryKeys = Object.keys(state.entries || {});
      var monthEntriesCount = entryKeys.filter(function (key) { return key.indexOf(monthPrefix) === 0; }).length;
      var yearEntriesCount = entryKeys.filter(function (key) { return key.indexOf(yearPrefix) === 0; }).length;
      return '<div class="exports-page">' +
        '<div class="profile-subpage-top exports-top"><button data-back-profile="1" aria-label="Torna al profilo">' + icons.left + '</button><div><span>DATI E DOCUMENTI</span><h1>Report</h1></div><i></i></div>' +
        '<section class="exports-period-card">' +
          '<div class="exports-period-heading"><span class="exports-period-icon">' + icons.calendar + '</span><div><small>PERIODO SELEZIONATO</small><strong>' + monthLabel + ' ' + yearLabel + '</strong></div><div class="exports-period-controls"><button data-export-month="-1" aria-label="Mese precedente">' + icons.left + '</button><button data-export-month="1" aria-label="Mese successivo">' + icons.right + '</button></div></div>' +
          '<div class="exports-period-metrics"><div><span>MESE</span><strong>' + monthEntriesCount + '</strong><small>giornate</small></div><div><span>ANNO</span><strong>' + yearEntriesCount + '</strong><small>giornate</small></div></div>' +
        '</section>' +
        '<div class="exports-section-head"><span>CREA UN FILE</span><small>Scegli formato e contenuto</small></div>' +
        '<section class="exports-action-grid">' +
          '<button class="exports-action-card is-green" data-export-csv="1"><span>' + icons.activity + '</span><b>.CSV</b><strong>Foglio Excel</strong><small>Ore e giornate complete</small>' + icons.right + '</button>' +
          '<button class="exports-action-card is-blue" data-export-calendar="1"><span>' + icons.calendar + '</span><b>.ICS</b><strong>Calendario</strong><small>Scegli le categorie</small>' + icons.right + '</button>' +
          '<button class="exports-action-card is-cyan" data-export-report="1"><span>' + icons.note + '</span><b>PDF</b><strong>Report mensile</strong><small>' + monthLabel + ' ' + yearLabel + '</small>' + icons.right + '</button>' +
          '<button class="exports-action-card is-violet" data-export-report-year="1"><span>' + icons.download + '</span><b>PDF</b><strong>Report annuale</strong><small>Tutto il ' + yearLabel + '</small>' + icons.right + '</button>' +
          '<button class="exports-action-card is-amber" data-export-report-complete-year="1"><span>' + icons.activity + '</span><b>PDF+</b><strong>Annuale completo</strong><small>Ore, ferie e stipendi</small>' + icons.right + '</button>' +
          '<button class="exports-action-card is-pink" data-export-report-salaries="1"><span>' + icons.wallet + '</span><b>PDF</b><strong>Report stipendi</strong><small>Cedolini e andamento</small>' + icons.right + '</button>' +
        '</section>' +
        '<p class="exports-safe-note">' + icons.lock + '<span>I file sono copie: il tuo archivio GestOre non viene modificato.</span></p>' +
      '</div>';
    }

    function renderPdfExportDialog() {
      if (!state.pdfExportOpen) return '';
      var spec = typeof getPdfReportSpec === 'function' ? getPdfReportSpec(state.pdfExportKind) : null;
      if (!spec) return '';
      var icon = spec.kind === 'salaries' ? icons.wallet : (spec.kind === 'completeYearly' ? icons.activity : icons.note);
      var busy = Boolean(state.pdfExportBusy);
      return '<div class="pdf-export-overlay" role="dialog" aria-modal="true" aria-labelledby="pdfExportDialogTitle">' +
        '<button class="pdf-export-backdrop" data-close-pdf-export="1" aria-label="Chiudi"></button>' +
        '<section class="pdf-export-dialog is-' + escapeHtml(spec.tone || 'blue') + '">' +
          '<header><span class="pdf-export-dialog-icon">' + icon + '</span><div><small>REPORT PDF</small><h2 id="pdfExportDialogTitle">' + escapeHtml(spec.title) + '</h2><p>' + escapeHtml(spec.copy) + '</p></div><button data-close-pdf-export="1" aria-label="Chiudi"' + (busy ? ' disabled' : '') + '>' + icons.x + '</button></header>' +
          '<div class="pdf-export-file"><span>' + icons.note + '</span><div><small>FILE PRONTO DA CREARE</small><strong>' + escapeHtml(spec.filename) + '</strong><p>' + escapeHtml(spec.period) + '</p></div></div>' +
          '<div class="pdf-export-actions">' +
            '<button data-preview-pdf-report="1"' + (busy ? ' disabled' : '') + '><span>' + icons.search + '</span><strong>' + (busy ? 'Preparazione...' : 'Mostra anteprima') + '</strong><small>Controlla tutte le pagine</small></button>' +
            '<button class="is-primary" data-download-pdf-report="1"' + (busy ? ' disabled' : '') + '><span>' + icons.download + '</span><strong>' + (busy ? 'Preparazione...' : 'Scarica PDF') + '</strong><small>Salva o condividi il file</small></button>' +
          '</div>' +
          '<p class="pdf-export-hint">' + icons.lock + '<span>La creazione del report non modifica i dati salvati.</span></p>' +
        '</section>' +
      '</div>';
    }

    function renderPdfPreview() {
      if (!state.pdfPreviewOpen || !state.pdfPreviewBlob) return '';
      return '<div class="pdf-preview-overlay" role="dialog" aria-modal="true" aria-label="Anteprima PDF">' +
        '<section class="pdf-preview-shell">' +
          '<header><button data-close-pdf-preview="1" aria-label="Chiudi anteprima">' + icons.left + '</button><div><small>ANTEPRIMA PDF</small><strong>' + escapeHtml(state.pdfPreviewName || 'Report GestOre') + '</strong></div><button data-download-pdf-preview="1" aria-label="Scarica PDF">' + icons.download + '</button></header>' +
          '<div class="pdf-preview-stage" data-pdf-zoom-surface>' +
            '<div class="pdf-preview-frame" data-pdf-zoom-viewport>' +
              '<div class="pdf-preview-status" data-pdf-preview-status role="status"><span></span><strong>Preparo le pagine</strong><p>Il report resta sul dispositivo.</p></div>' +
              '<div class="pdf-preview-pages" data-pdf-preview-pages aria-live="polite" aria-busy="true"></div>' +
            '</div>' +
            '<div class="pdf-preview-zoom-tools" role="toolbar" aria-label="Zoom anteprima PDF">' +
              '<button data-pdf-zoom-out type="button" aria-label="Riduci zoom">&minus;</button>' +
              '<button class="pdf-preview-zoom-value" data-pdf-zoom-reset type="button" aria-label="Ripristina zoom"><span data-pdf-zoom-label>100%</span></button>' +
              '<button data-pdf-zoom-in type="button" aria-label="Aumenta zoom">+</button>' +
            '</div>' +
          '</div>' +
        '</section>' +
      '</div>';
    }

    function renderCalendarExportDialog() {
      if (!state.calendarExportOpen) return '';
      var selectedYear = Number(state.calendarExportYear) || state.currentMonth.getFullYear();
      var selectedTypes = Array.isArray(state.calendarExportTypes) ? state.calendarExportTypes : [];
      var options = [
        { key: 'lavoro', label: 'Lavoro', copy: 'Giornate con orario', icon: icons.briefcase, tone: 'green' },
        { key: 'lavoro_ferie', label: 'Lavoro + ferie', copy: 'Giornate miste', icon: icons.activity, tone: 'blue' },
        { key: 'ferie', label: 'Ferie', copy: 'Assenze programmate', icon: icons.umbrella, tone: 'cyan' },
        { key: 'malattia', label: 'Malattia', copy: 'Giornate registrate', icon: icons.plus, tone: 'amber' },
        { key: 'permesso', label: 'Permessi', copy: 'Ore o giorni coperti', icon: icons.clock, tone: 'violet' },
        { key: 'festivita_pagata', label: 'Festivit&agrave;', copy: 'Festivit&agrave; pagate', icon: icons.star, tone: 'pink' },
        { key: 'riposo', label: 'Riposi', copy: 'Giornate non lavorative', icon: icons.coffee, tone: 'slate' }
      ];
      var counts = {};
      Object.keys(state.entries || {}).forEach(function (key) {
        var entry = state.entries[key];
        if (key.slice(0, 4) !== String(selectedYear) || !entry || !entry.type) return;
        counts[entry.type] = (counts[entry.type] || 0) + 1;
      });
      var selectedCount = options.reduce(function (total, option) {
        return total + (selectedTypes.indexOf(option.key) !== -1 ? (counts[option.key] || 0) : 0);
      }, 0);
      var optionRows = options.map(function (option) {
        var checked = selectedTypes.indexOf(option.key) !== -1;
        return '<button class="calendar-export-option is-' + option.tone + (checked ? ' is-selected' : '') + '" data-calendar-export-type="' + option.key + '" aria-pressed="' + (checked ? 'true' : 'false') + '"><span class="calendar-export-option-icon">' + option.icon + '</span><span><strong>' + option.label + '</strong><small>' + option.copy + '</small></span><b>' + (counts[option.key] || 0) + '</b><i>' + icons.check + '</i></button>';
      }).join('');
      return '<div class="calendar-export-overlay" role="dialog" aria-modal="true" aria-label="Esporta calendario">' +
        '<button class="calendar-export-backdrop" data-close-calendar-export="1" aria-label="Chiudi"></button>' +
        '<section class="calendar-export-dialog">' +
          '<header><span class="calendar-export-dialog-icon">' + icons.calendar + '</span><div><small>CALENDARIO GESTORE</small><h2>Scegli cosa esportare</h2><p>Il file conterr&agrave; soltanto le categorie selezionate.</p></div><button data-close-calendar-export="1" aria-label="Chiudi">' + icons.x + '</button></header>' +
          '<div class="calendar-export-year"><button data-calendar-export-year="-1" aria-label="Anno precedente">' + icons.left + '</button><div><span>ANNO DEL CALENDARIO</span><strong>' + selectedYear + '</strong></div><button data-calendar-export-year="1" aria-label="Anno successivo">' + icons.right + '</button></div>' +
          '<div class="calendar-export-select-head"><span>CATEGORIE</span><button data-calendar-export-all="1">' + (selectedTypes.length === options.length ? 'Deseleziona tutte' : 'Seleziona tutte') + '</button></div>' +
          '<div class="calendar-export-options">' + optionRows + '</div>' +
          '<footer><div><strong>' + selectedCount + '</strong><span>' + (selectedCount === 1 ? 'evento pronto' : 'eventi pronti') + '</span></div><button class="solid" data-confirm-calendar-export="1"' + (!selectedTypes.length || !selectedCount ? ' disabled' : '') + '>Crea calendario .ICS</button></footer>' +
        '</section></div>';
    }

    function renderSettings() {
      var section = state.settingsSection || '';
      if (section === 'timer') section = 'home';
      var workdays = normalizeWeekdayList(state.settingsDraft.workdays || []);
      var restDays = normalizeWeekdayList(state.settingsDraft.autoRestDays || []);
      var holidayHelper = escapeHtml(getHolidaySettingsHelperText(state.settingsDraft));
      var reminderHelper = escapeHtml(getReminderHelperText());
      var reminderStatus = state.settings.remindersEnabled ? ('Attivo alle ' + state.settings.reminderTime) : 'Disattivato';
      var shiftPresets = getShiftPresets(state.settingsDraft);
      var shiftStatus = shiftPresets.length + (shiftPresets.length === 1 ? ' turno' : ' turni');
      var weeklyTemplate = typeof getWeeklyTemplate === 'function' ? getWeeklyTemplate(state.settingsDraft) : [0, 0, 0, 0, 0, null, null];
      var plannedTemplateDays = weeklyTemplate.filter(function (choice) { return choice !== null && choice !== undefined && choice !== ''; }).length;
      var templateStatus = plannedTemplateDays ? (plannedTemplateDays + ' giorni') : 'Da configurare';
      var targetStatus = (Number(state.settingsDraft.dailyTarget) || 0).toLocaleString('it-IT', { maximumFractionDigits: 1 }) + 'h al giorno';
      var homeSectionsEnabled = [
        state.settingsDraft.homeShowQuickActions,
        state.settingsDraft.homeShowActionCenter,
        state.settingsDraft.homeShowWeeklyAnalytics,
        state.settingsDraft.homeShowMonthlyAnalytics,
        state.settingsDraft.homeShowSalaryPreview
      ].filter(Boolean).length;
      var topBar = function (title, isDetail) {
        return '<div class="settings-v2-top"><button ' + (isDetail ? 'data-back-settings="1"' : 'data-back-profile="1"') + ' aria-label="Torna al profilo">' + icons.left + '</button><div><h1>' + title + '</h1></div><i></i></div>';
      };
      if (section === 'home') {
        var homeOption = function (key, tone, icon, title) {
          var enabled = Boolean(state.settingsDraft[key]);
          return '<div class="settings-v2-toggle-row"><span class="settings-v2-icon is-' + tone + '">' + icon + '</span><span class="settings-v2-copy"><strong>' + title + '</strong></span><button role="switch" class="toggle-btn ' + (enabled ? 'on' : '') + '" data-toggle-home-section="' + key + '" aria-label="' + title + '" aria-checked="' + (enabled ? 'true' : 'false') + '" aria-pressed="' + (enabled ? 'true' : 'false') + '"><span class="knob"></span></button></div>';
        };
        var timerRunning = Boolean(state.shiftTimer && state.shiftTimer.active);
        var timerHelper = timerRunning
          ? 'Termina o annulla il turno in corso prima di disattivarlo.'
          : (state.settings.timerEnabled ? 'La Home usa il timer del turno.' : 'Mantieni l\'inserimento manuale attuale.');
        return '<div class="settings-modern-page settings-page-v2 settings-detail-page">' +
          topBar('Personalizza Home', true) +
          '<div class="settings-v2-section-title">Contenuti</div>' +
          '<section class="settings-v2-group home-layout-settings">' +
            homeOption('homeShowQuickActions', 'green', icons.clock, 'Azioni rapide') +
            '<div class="settings-v2-divider"></div>' +
            homeOption('homeShowActionCenter', 'blue', icons.check, 'Da completare') +
            '<div class="settings-v2-divider"></div>' +
            homeOption('homeShowWeeklyAnalytics', 'violet', icons.activity, 'Ritmo settimanale') +
            '<div class="settings-v2-divider"></div>' +
            homeOption('homeShowMonthlyAnalytics', 'blue', icons.target, 'Composizione del mese') +
            '<div class="settings-v2-divider"></div>' +
            homeOption('homeShowSalaryPreview', 'violet', icons.wallet, 'Anteprima stipendio') +
          '</section>' +
          '<div class="settings-v2-section-title">Inserimento ore</div>' +
          '<section class="settings-v2-group"><div class="settings-v2-toggle-row"><span class="settings-v2-icon is-violet">' + icons.play + '</span><span class="settings-v2-copy"><strong>Timer del turno</strong><small>' + escapeHtml(timerHelper) + '</small></span><button role="switch" class="toggle-btn ' + (state.settings.timerEnabled ? 'on' : '') + '" data-toggle-shift-timer="1" aria-label="Timer del turno" aria-checked="' + (state.settings.timerEnabled ? 'true' : 'false') + '" aria-pressed="' + (state.settings.timerEnabled ? 'true' : 'false') + '"><span class="knob"></span></button></div></section>' +
        '</div>';
      }

      if (section === 'profile') {
        return '<div class="settings-modern-page settings-page-v2 settings-detail-page">' +
          topBar('Profilo e obiettivi', true) +
          '<div class="settings-v2-section-title">Identit&agrave;</div>' +
          '<section class="settings-v2-group"><label class="settings-v2-input-row"><span class="settings-v2-icon is-blue">' + icons.user + '</span><span><strong>Nome utente</strong></span><input id="userNameInput" type="text" maxlength="24" placeholder="Il tuo nome" value="' + escapeHtml(state.settingsDraft.userName || '') + '"></label></section>' +
          '<div class="settings-v2-section-title">Obiettivi ore</div>' +
          '<section class="settings-v2-targets"><label><span>GIORNALIERO</span><div><input id="dailyTargetInput" type="number" inputmode="decimal" min="0" step="0.5" value="' + state.settingsDraft.dailyTarget + '"><b>ore</b></div></label><label><span>SETTIMANALE</span><div><input id="weeklyTargetInput" type="number" inputmode="decimal" min="0" step="0.5" value="' + state.settingsDraft.weeklyTarget + '"><b>ore</b></div></label></section>' +
        '</div>';
      }

      if (section === 'calendar') {
        return '<div class="settings-modern-page settings-page-v2 settings-detail-page">' +
          topBar('Calendario di lavoro', true) +
          '<div class="settings-v2-section-title">Giorni lavorativi</div>' +
          '<section class="settings-v2-group settings-v2-days-card"><div class="settings-v2-row-heading"><span class="settings-v2-icon is-blue">' + icons.briefcase + '</span><span><strong>Settimana attiva</strong></span></div><div class="settings-v2-days">' + weekNames.map(function (label, index) { return '<button class="' + (workdays.indexOf(index) !== -1 ? 'is-active' : '') + '" data-toggle-workday="' + index + '" aria-pressed="' + (workdays.indexOf(index) !== -1 ? 'true' : 'false') + '"><span>' + label.slice(0, 1) + '</span><small>' + label + '</small></button>'; }).join('') + '</div></section>' +
          '<div class="settings-v2-section-title">Riposo automatico</div>' +
          '<section class="settings-v2-group settings-v2-days-card"><div class="settings-v2-row-heading"><span class="settings-v2-icon is-amber">' + icons.coffee + '</span><span><strong>Giorni di riposo</strong></span></div><div class="settings-v2-days is-rest">' + weekNames.map(function (label, index) { return '<button class="' + (restDays.indexOf(index) !== -1 ? 'is-active' : '') + '" data-toggle-auto-rest-day="' + index + '" aria-pressed="' + (restDays.indexOf(index) !== -1 ? 'true' : 'false') + '"><span>' + label.slice(0, 1) + '</span><small>' + label + '</small></button>'; }).join('') + '</div><p>I dati inseriti manualmente hanno sempre la precedenza.</p></section>' +
          '<div class="settings-v2-section-title">Festivit&agrave;</div>' +
          '<section class="settings-v2-group"><div class="settings-v2-toggle-row"><span class="settings-v2-icon is-violet">' + icons.star + '</span><span class="settings-v2-copy"><strong>Ore nei giorni non lavorativi</strong><small>' + holidayHelper + '</small></span><button role="switch" class="toggle-btn ' + (state.settingsDraft.holidayHoursOnOffDays ? 'on' : '') + '" data-toggle-holiday-offdays="1" aria-label="Ore festive nei giorni non lavorativi" aria-checked="' + (state.settingsDraft.holidayHoursOnOffDays ? 'true' : 'false') + '" aria-pressed="' + (state.settingsDraft.holidayHoursOnOffDays ? 'true' : 'false') + '"><span class="knob"></span></button></div></section>' +
        '</div>';
      }

      if (section === 'notifications') {
        return '<div class="settings-modern-page settings-page-v2 settings-detail-page">' +
          topBar('Notifiche', true) +
          '<div class="settings-v2-section-title">Promemoria giornaliero</div>' +
          '<section class="settings-v2-group">' +
            '<div class="settings-v2-toggle-row"><span class="settings-v2-icon is-violet">' + icons.bell + '</span><span class="settings-v2-copy"><strong>Promemoria locale</strong><small>' + reminderHelper + '</small></span><button role="switch" class="toggle-btn ' + (state.settings.remindersEnabled ? 'on' : '') + '" data-toggle-reminders="1" aria-label="Promemoria locale" aria-checked="' + (state.settings.remindersEnabled ? 'true' : 'false') + '" aria-pressed="' + (state.settings.remindersEnabled ? 'true' : 'false') + '"><span class="knob"></span></button></div>' +
            '<div class="settings-v2-divider"></div>' +
            '<div class="settings-v2-time-row"><label><span>ORARIO</span><input id="reminderTimeInput" type="time" value="' + state.settings.reminderTime + '" aria-label="Orario promemoria"></label><button data-test-notification="1">' + icons.bell + '<span>Invia notifica di prova</span></button></div>' +
          '</section>' +
          '<div class="settings-v2-section-title">Quando avvisarti</div>' +
          '<section class="settings-v2-group smart-reminder-group">' +
            '<div class="settings-v2-toggle-row"><span class="settings-v2-icon is-blue">' + icons.calendar + '</span><span class="settings-v2-copy"><strong>Giornata mancante</strong><small>Solo nei giorni lavorativi ancora da compilare</small></span><button role="switch" class="toggle-btn ' + (state.settings.smartReminderMissingDays ? 'on' : '') + '" data-toggle-smart-reminder="missing" aria-label="Promemoria giornata mancante" aria-checked="' + (state.settings.smartReminderMissingDays ? 'true' : 'false') + '" aria-pressed="' + (state.settings.smartReminderMissingDays ? 'true' : 'false') + '"><span class="knob"></span></button></div>' +
            '<div class="settings-v2-divider"></div>' +
            '<div class="settings-v2-toggle-row"><span class="settings-v2-icon is-violet">' + icons.activity + '</span><span class="settings-v2-copy"><strong>Controllo settimanale</strong><small>Sabato o luned&igrave;, soltanto se manca qualcosa</small></span><button role="switch" class="toggle-btn ' + (state.settings.smartReminderWeeklyReview ? 'on' : '') + '" data-toggle-smart-reminder="weekly" aria-label="Promemoria controllo settimanale" aria-checked="' + (state.settings.smartReminderWeeklyReview ? 'true' : 'false') + '" aria-pressed="' + (state.settings.smartReminderWeeklyReview ? 'true' : 'false') + '"><span class="knob"></span></button></div>' +
            '<div class="settings-v2-divider"></div>' +
            '<div class="settings-v2-toggle-row"><span class="settings-v2-icon is-green">' + icons.receipt + '</span><span class="settings-v2-copy"><strong>Cedolino assente</strong><small>Dal giorno 10, se manca quello del mese precedente</small></span><button role="switch" class="toggle-btn ' + (state.settings.smartReminderPayslips ? 'on' : '') + '" data-toggle-smart-reminder="payslips" aria-label="Promemoria cedolino" aria-checked="' + (state.settings.smartReminderPayslips ? 'true' : 'false') + '" aria-pressed="' + (state.settings.smartReminderPayslips ? 'true' : 'false') + '"><span class="knob"></span></button></div>' +
          '</section>' +
          (typeof renderPlatformPushSettings === 'function' ? renderPlatformPushSettings() : '') +
          (state.settings.remindersEnabled ? '<div class="settings-v2-note"><span>' + icons.bell + '</span><p>Se non ricevi avvisi, consenti le notifiche nelle impostazioni di iPhone.</p></div>' : '') +
        '</div>';
      }

      if (section === 'privacy') {
        return '<div class="settings-modern-page settings-page-v2 settings-detail-page">' +
          topBar('Privacy e sicurezza', true) +
          '<div class="settings-v2-section-title">Protezione app</div>' +
          '<section class="settings-v2-group"><div class="settings-v2-toggle-row settings-v2-privacy-toggle"><span class="settings-v2-icon is-green">' + icons.lock + '</span><span class="settings-v2-copy"><strong>Schermata privacy</strong><small>Nasconde ore, ferie e importi quando riapri l&apos;app</small></span><button role="switch" class="toggle-btn ' + (state.settings.lockApp ? 'on' : '') + '" data-toggle-lock="1" aria-label="Schermata privacy" aria-checked="' + (state.settings.lockApp ? 'true' : 'false') + '" aria-pressed="' + (state.settings.lockApp ? 'true' : 'false') + '"><span class="knob"></span></button></div></section>' +
          (typeof renderAccountSecuritySettings === 'function' ? renderAccountSecuritySettings() : '') +
        '</div>';
      }

      if (section === 'shifts') {
        var shiftCards = shiftPresets.map(function (preset, index) {
          return '<section class="shift-preset-settings-card">' +
            '<div class="shift-preset-settings-head"><span>' + icons.clock + '</span><label><small>NOME TURNO</small><input type="text" maxlength="18" value="' + escapeHtml(preset.label) + '" data-shift-preset-label="' + index + '" aria-label="Nome turno ' + (index + 1) + '"></label><b>' + (index + 1) + '</b></div>' +
            '<div class="shift-preset-settings-fields">' +
              '<label><span>ENTRATA</span><input type="time" value="' + escapeHtml(preset.start) + '" data-shift-preset-start="' + index + '"></label>' +
              '<label><span>USCITA</span><input type="time" value="' + escapeHtml(preset.end) + '" data-shift-preset-end="' + index + '"></label>' +
              '<label><span>PAUSA</span><div><input type="number" inputmode="decimal" min="0" max="12" step="0.25" value="' + escapeHtml(String(preset.breakHours)) + '" data-shift-preset-break="' + index + '"><b>h</b></div></label>' +
            '</div>' +
          '</section>';
        }).join('');
        return '<div class="settings-modern-page settings-page-v2 settings-detail-page shift-settings-page">' +
          topBar('Turni rapidi', true) +
          '<div class="settings-v2-section-title">Modelli disponibili</div>' +
          '<div class="shift-preset-settings-list">' + shiftCards + '</div>' +
        '</div>';
      }

      if (section === 'planning') {
        var templateRows = weekNamesFull.map(function (label, index) {
          var choice = weeklyTemplate[index];
          var options = '<option value="" ' + (choice === null || choice === undefined || choice === '' ? 'selected' : '') + '>Non pianificato</option>' +
            '<option value="rest" ' + (choice === 'rest' ? 'selected' : '') + '>Riposo</option>' +
            shiftPresets.map(function (preset, presetIndex) {
              return '<option value="' + presetIndex + '" ' + (Number(choice) === presetIndex && choice !== null && choice !== '' ? 'selected' : '') + '>' + escapeHtml(preset.label + ' · ' + preset.start + ' - ' + preset.end) + '</option>';
            }).join('');
          var choiceLabel = typeof getTemplateChoiceLabel === 'function' ? getTemplateChoiceLabel(choice) : 'Non pianificato';
          return '<label class="weekly-template-row"><span><strong>' + escapeHtml(label) + '</strong><small>' + escapeHtml(choiceLabel) + '</small></span><select data-weekly-template-day="' + index + '" aria-label="Pianificazione ' + escapeHtml(label) + '">' + options + '</select></label>';
        }).join('');
        return '<div class="settings-modern-page settings-page-v2 settings-detail-page weekly-template-page">' +
          topBar('Settimana tipo', true) +
          '<div class="settings-v2-section-title">Modello settimanale</div>' +
          '<section class="weekly-template-card">' + templateRows + '</section>' +
          '<button class="weekly-template-preview" data-open-month-plan="1"><span>' + icons.calendar + '</span><div><small>ANTEPRIMA DEL MESE</small><strong>Prepara ' + escapeHtml(formatMonthYear(state.currentMonth)) + '</strong><p>Le giornate gi&agrave; presenti non verranno modificate.</p></div>' + icons.right + '</button>' +
        '</div>';
      }

      if (section === 'data') {
        return '<div class="settings-modern-page settings-page-v2 settings-detail-page">' +
          topBar('Account e backup', true) +
          (typeof renderAccountDataSettings === 'function' ? renderAccountDataSettings() : '') +
          '<section class="settings-v2-version"><div><span>VERSIONE INSTALLATA</span><strong>GestOre ' + escapeHtml(state.settings.version) + '</strong></div><span>' + icons.check + '</span></section>' +
        '</div>';
      }

      if (section === 'history') {
        return '<div class="settings-modern-page settings-page-v2 settings-detail-page">' +
          topBar('Cronologia dati', true) +
          (typeof renderDataHistorySettings === 'function' ? renderDataHistorySettings() : '') +
        '</div>';
      }

      return '<div class="settings-modern-page settings-page-v2 settings-hub-page">' +
        topBar('Impostazioni', false) +
          '<div class="settings-v2-section-title">Esperienza e lavoro</div>' +
          '<section class="settings-hub-group">' +
          '<button class="settings-hub-row" data-open-settings-section="home"><span class="settings-v2-icon is-violet">' + icons.home + '</span><span class="settings-v2-copy"><strong>Home</strong></span><span class="settings-hub-value">' + homeSectionsEnabled + ' blocchi</span><span class="settings-v2-chevron">' + icons.right + '</span></button>' +
          '<button class="settings-hub-row" data-open-settings-section="profile"><span class="settings-v2-icon is-blue">' + icons.user + '</span><span class="settings-v2-copy"><strong>Profilo e obiettivi</strong></span><span class="settings-hub-value">' + escapeHtml(targetStatus) + '</span><span class="settings-v2-chevron">' + icons.right + '</span></button>' +
          '<button class="settings-hub-row" data-open-settings-section="calendar"><span class="settings-v2-icon is-blue">' + icons.calendar + '</span><span class="settings-v2-copy"><strong>Calendario di lavoro</strong></span><span class="settings-hub-value">' + workdays.length + ' giorni</span><span class="settings-v2-chevron">' + icons.right + '</span></button>' +
          '<button class="settings-hub-row" data-open-settings-section="shifts"><span class="settings-v2-icon is-green">' + icons.clock + '</span><span class="settings-v2-copy"><strong>Turni rapidi</strong></span><span class="settings-hub-value">' + escapeHtml(shiftStatus) + '</span><span class="settings-v2-chevron">' + icons.right + '</span></button>' +
          '<button class="settings-hub-row" data-open-settings-section="planning"><span class="settings-v2-icon is-blue">' + icons.calendar + '</span><span class="settings-v2-copy"><strong>Settimana tipo</strong></span><span class="settings-hub-value">' + escapeHtml(templateStatus) + '</span><span class="settings-v2-chevron">' + icons.right + '</span></button>' +
        '</section>' +
        '<div class="settings-v2-section-title">Avvisi</div>' +
        '<section class="settings-hub-group">' +
          '<button class="settings-hub-row" data-open-settings-section="notifications"><span class="settings-v2-icon is-violet">' + icons.bell + '</span><span class="settings-v2-copy"><strong>Notifiche</strong></span><span class="settings-hub-value">' + escapeHtml(reminderStatus) + '</span><span class="settings-v2-chevron">' + icons.right + '</span></button></section>' +
        '<div class="settings-v2-footer"><strong>GestOre v' + escapeHtml(state.settings.version) + '</strong></div>' +
      '</div>';
    }

    function renderCalendarDetailDialog() {
      if (state.activeTab !== 'calendar' || !state.calendarDetailOpen) return '';
      var selectedKey = getCalendarSelectedDateKey(state.currentMonth);
      return '<div class="calendar-detail-overlay" role="dialog" aria-modal="true" aria-label="Dettaglio giorno selezionato">' +
        '<button class="calendar-detail-backdrop" data-close-calendar-detail="1" aria-label="Chiudi dettaglio"></button>' +
        '<div class="calendar-detail-dialog">' + renderCalendarDayFocus(selectedKey) + '</div>' +
      '</div>';
    }

    function renderLegalOverlay() {
      var page = String(state.legalPage || '');
      if (!page) return '';
      var pages = {
        privacy: {
          kicker: 'I TUOI DATI',
          title: 'Privacy e dati',
          sections: [
            ['Dati del tuo account', 'GestOre conserva nome utente, credenziali protette, preferenze e le informazioni tecniche necessarie per mantenere attivo il tuo accesso. Password e codici di recupero non vengono salvati in chiaro.'],
            ['Ore e informazioni lavorative', 'Giornate, orari, ferie, malattie, permessi, note, obiettivi e configurazioni stipendio vengono usati per calendario, statistiche, stime e report.'],
            ['Cedolini e fotografie', 'Importi, annotazioni e immagini vengono archiviati soltanto quando scegli di caricarli. Restano associati esclusivamente al tuo account.'],
            ['Sincronizzazione e backup', 'Il database personale viene sincronizzato con il server per permettere recupero e cambio dispositivo. Puoi creare copie protette o scaricare un file personale dal Profilo.'],
            ['Condivisione e pubblicit&agrave;', 'GestOre non vende i dati, non mostra pubblicit&agrave; e non utilizza tracker pubblicitari. I contenuti transitano soltanto sui servizi tecnici necessari al funzionamento.'],
            ['Sicurezza e responsabilit&agrave;', 'Gli account usano archivi separati e sessioni protette. Proteggi password, codice di recupero e file esportati: nessun sistema pu&ograve; garantire sicurezza assoluta.'],
            ['I tuoi controlli', 'Da Profilo > Account e backup puoi verificare la sincronizzazione, scaricare una copia, ripristinare un salvataggio o eliminare definitivamente account e contenuti.']
          ]
        },
        terms: {
          kicker: 'CONDIZIONI DI UTILIZZO',
          title: 'Termini di utilizzo',
          sections: [
            ['Uso corretto', 'Sei responsabile della correttezza delle informazioni inserite e dell&apos;uso dei file generati. Non caricare documenti di terzi senza autorizzazione.'],
            ['Stime e calcoli', 'Ore, ferie, imposte e stipendio sono stime informative. Non sostituiscono cedolino, contratto, consulenza fiscale, legale o del lavoro.'],
            ['Account e accesso', 'Mantieni riservati password e codice di recupero. Le azioni eseguite con il tuo account vengono considerate autorizzate finch&eacute; non segnali un accesso anomalo.'],
            ['Disponibilit&agrave; del servizio', 'Aggiornamenti e manutenzioni possono interrompere temporaneamente alcune funzioni. Prima di operazioni importanti &egrave; consigliata una copia personale.'],
            ['Aggiornamenti', 'Funzioni e condizioni possono cambiare per sicurezza, requisiti tecnici o miglioramenti. Le modifiche importanti vengono comunicate nell&apos;app.'],
            ['Chiusura dell&apos;account', 'Puoi eliminare account e contenuti da Account e backup. La procedura richiede una conferma esplicita e non pu&ograve; essere annullata.']
          ]
        },
        support: {
          kicker: 'AIUTO GESTORE',
          title: 'Supporto',
          sections: [
            ['Dati mancanti o caricamento lento', 'Controlla la connessione, poi apri Profilo > Account e backup e attendi che compaia Database aggiornato. Non uscire dall&apos;account durante una sincronizzazione.'],
            ['Prima di un ripristino', 'Crea un punto di ripristino o scarica una copia personale. Lo storico protetto permette di recuperare versioni precedenti senza confonderle con i report PDF.'],
            ['Problemi con i cedolini', 'Verifica che il caricamento sia terminato prima di chiudere la schermata. Nell&apos;archivio puoi aprire e ingrandire ogni fotografia salvata.'],
            ['Notifiche non ricevute', 'Controlla sia le preferenze dentro GestOre sia le autorizzazioni di iPhone. La modalit&agrave; risparmio energetico pu&ograve; ritardare alcuni avvisi.'],
            ['Segnalare un problema', 'Annota versione dell&apos;app, modello del dispositivo, schermata interessata e passaggi che causano l&apos;errore. Non condividere password, codice di recupero o cedolini personali.'],
            ['Verifiche fiscali e lavorative', 'Per contestazioni, contributi o controlli sul cedolino rivolgiti al datore di lavoro, a un CAF o a un professionista abilitato.']
          ]
        }
      };
      var content = pages[page] || pages.support;
      return '<div class="legal-app-overlay" role="dialog" aria-modal="true" aria-labelledby="legalAppTitle"><section class="legal-app-page">' +
        '<header><button data-close-legal="1" aria-label="Torna al profilo">' + icons.left + '</button><div><small>' + content.kicker + '</small><h1 id="legalAppTitle">' + content.title + '</h1></div><i></i></header>' +
        '<div class="legal-app-sections">' + content.sections.map(function (section) { return '<article><h2>' + section[0] + '</h2><p>' + section[1] + '</p></article>'; }).join('') + '</div>' +
        '<p class="legal-app-updated">Ultimo aggiornamento: 22 agosto 2026</p>' +
      '</section></div>';
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
        { key: 'payslips', label: 'Stipendio', icon: icons.wallet }
      ];
      var navActiveTab = getPrimaryNavTab(state.activeTab);
      var activeIndex = Math.max(0, items.findIndex(function (item) { return item.key === navActiveTab; }));
      var previousIndex = Number.isFinite(Number(state.navPreviousIndex)) ? Math.max(0, Math.min(4, Number(state.navPreviousIndex))) : activeIndex;
      var animatedClass = state.tabSwitchFx && previousIndex !== activeIndex ? ' nav-animated' : '';
      return '<nav class="bottom-nav nav-motion-v2 nav-v13" aria-label="Navigazione principale"><div class="nav-grid nav-grid-v2' + animatedClass + '" style="--nav-x:' + (activeIndex * 100) + '%;--nav-from-x:' + (previousIndex * 100) + '%">' +
        '<span class="nav-active-indicator" aria-hidden="true"></span>' + items.map(function (i, index) {
        var className = 'nav-btn nav-btn-v2' + (i.key === 'home' ? ' nav-home' : '') + (navActiveTab === i.key ? ' active' : '') + (state.tabSwitchFx && previousIndex === index && previousIndex !== activeIndex ? ' was-active' : '');
        return '<button class="' + className + '" data-tab="' + i.key + '" aria-label="' + i.label + '" aria-current="' + (navActiveTab === i.key ? 'page' : 'false') + '"><span class="nav-icon-shell">' + i.icon + '</span><span class="nav-label">' + i.label + '</span></button>';
      }).join('') + '</div></nav>';
    }

    function renderActiveScreen(switchClass) {
      var screens = {
        home: { className: 'home-screen', render: renderHome },
        calendar: { className: 'calendar-screen', render: renderCalendar },
        stats: { className: 'stats-screen', render: renderStats },
        vacations: { className: 'vacations-screen', render: renderVacationScreen },
        profile: { className: 'profile-screen', render: renderProfile },
        payslips: { className: 'payslips-screen', render: renderPayslips },
        exports: { className: 'exports-screen', render: renderExports },
        settings: { className: 'settings-screen', render: renderSettings }
      };
      var active = screens[state.activeTab] || screens.home;
      var layoutClass = state.activeTab === 'settings' && !state.settingsSection ? ' settings-hub-screen' : '';
      return '<section class="screen ' + active.className + layoutClass + ' active' + switchClass + '" data-go-screen="' + escapeHtml(state.activeTab || 'home') + '">' + active.render() + '</section>';
    }

    function captureRenderPosition(app) {
      var screen = app.querySelector('.screen.active');
      var active = document.activeElement;
      var focus = null;
      if (active && app.contains(active) && /^(INPUT|TEXTAREA|SELECT)$/.test(String(active.tagName || ''))) {
        focus = {
          id: String(active.id || ''),
          name: String(active.getAttribute('name') || ''),
          tag: String(active.tagName || '').toLowerCase(),
          start: typeof active.selectionStart === 'number' ? active.selectionStart : null,
          end: typeof active.selectionEnd === 'number' ? active.selectionEnd : null
        };
      }
      return {
        tab: screen ? String(screen.getAttribute('data-go-screen') || '') : '',
        scrollTop: screen ? screen.scrollTop : 0,
        focus: focus
      };
    }

    function restoreRenderPosition(saved, screen) {
      if (!saved || !screen || saved.tab !== String(screen.getAttribute('data-go-screen') || '')) return;
      screen.scrollTop = saved.scrollTop || 0;
      if (!saved.focus) return;
      var target = saved.focus.id ? document.getElementById(saved.focus.id) : null;
      if (!target && saved.focus.name) {
        target = screen.querySelector(saved.focus.tag + '[name="' + saved.focus.name.replace(/"/g, '\\"') + '"]');
      }
      if (!target || typeof target.focus !== 'function') return;
      try { target.focus({ preventScroll: true }); } catch (error) { target.focus(); }
      if (saved.focus.start !== null && typeof target.setSelectionRange === 'function') {
        try { target.setSelectionRange(saved.focus.start, saved.focus.end); } catch (error) {}
      }
      screen.scrollTop = saved.scrollTop || 0;
    }

    function replaceMarkup(current, markup, app) {
      if (current && current.__goMarkup === markup) return current;
      var template = document.createElement('template');
      template.innerHTML = markup.trim();
      var next = template.content.firstElementChild;
      if (!next) return current;
      if (current) current.replaceWith(next);
      else app.appendChild(next);
      next.__goMarkup = markup;
      return next;
    }

    function renderOverlayMarkup() {
      return renderOverlay() + renderConfirmModal() + renderVacationManager() + renderVacationHistory() + renderCalendarExportDialog() + renderPdfExportDialog() + renderPdfPreview() + renderPayslipViewer() + renderPayslipDecisionModal() + renderPrivacyLock() + renderProfileAvatarPicker() + renderLegalOverlay() + renderCalendarDetailDialog() +
        (typeof renderFeatureOverlays === 'function' ? renderFeatureOverlays() : '') +
        (typeof renderPlanningOverlays === 'function' ? renderPlanningOverlays() : '') +
        (typeof renderStatsInsightOverlay === 'function' ? renderStatsInsightOverlay() : '') +
        (typeof renderAccountGate === 'function' ? renderAccountGate() : '') +
        (typeof renderPasskeyOverlay === 'function' ? renderPasskeyOverlay() : '') +
        (typeof renderAdminSessionUi === 'function' ? renderAdminSessionUi() : '') +
        (typeof renderPlatformOverlays === 'function' ? renderPlatformOverlays() : '');
    }

    function getRenderMotionKey() {
      var activeTab = state.activeTab || 'home';
      var key = [activeTab];
      var currentMonth = state.currentMonth instanceof Date ? state.currentMonth : new Date();
      var monthKey = currentMonth.getFullYear() + '-' + String(currentMonth.getMonth() + 1).padStart(2, '0');

      if (activeTab === 'calendar') key.push(state.calendarView || 'month', monthKey);
      if (activeTab === 'stats') key.push(state.statsRange || 'month', monthKey);
      if (activeTab === 'vacations') key.push(String(Number(state.vacationScreenYear) || new Date().getFullYear()));
      if (activeTab === 'exports') key.push(monthKey);
      if (activeTab === 'settings') key.push(state.settingsSection || 'hub');
      if (activeTab === 'payslips') {
        var salaryMonth = state.salaryMonth instanceof Date ? state.salaryMonth : new Date();
        var salaryMonthKey = salaryMonth.getFullYear() + '-' + String(salaryMonth.getMonth() + 1).padStart(2, '0');
        var payslipMode = state.payslipEditorOpen ? 'editor'
          : (state.payslipEstimateConfigOpen ? 'estimate-config'
            : (state.payslipEstimateOpen ? 'estimate'
              : (state.payslipStatsOpen ? 'stats'
                : (state.payslipArchiveOpen ? 'archive'
                  : (state.payslipDetailId ? ('detail-' + state.payslipDetailId) : 'hub')))));
        key.push(payslipMode, salaryMonthKey);
      }
      return key.join(':');
    }

    function render() {
      var app = document.getElementById('app');
      if (!app) return;
      var savedPosition = captureRenderPosition(app);
      var switchClass = state.tabSwitchFx ? (' screen-switch screen-switch-' + (state.tabSwitchDir || 'forward')) : '';
      var motionDirection = state.tabSwitchFx ? (state.tabSwitchDir || 'forward') : 'forward';
      var motionKey = getRenderMotionKey();
      var showPrimaryNav = ['home', 'calendar', 'stats', 'vacations', 'payslips'].indexOf(state.activeTab) !== -1;

      var status = document.getElementById('goA11yStatus');
      if (!status) {
        app.insertAdjacentHTML('afterbegin', '<div id="goA11yStatus" class="go-sr-only" aria-live="polite" aria-atomic="true"></div>');
      }

      var screen = replaceMarkup(app.querySelector('.screen[data-go-screen]'), renderActiveScreen(switchClass), app);
      var nav = app.querySelector('.bottom-nav');
      if (showPrimaryNav) {
        nav = replaceMarkup(nav, renderNav(), app);
      } else if (nav) {
        nav.remove();
      }

      var overlayHost = document.getElementById('goOverlayHost');
      if (!overlayHost) {
        overlayHost = document.createElement('div');
        overlayHost.id = 'goOverlayHost';
        overlayHost.style.display = 'contents';
        app.appendChild(overlayHost);
      }
      var overlayMarkup = renderOverlayMarkup();
      if (overlayHost.__goMarkup !== overlayMarkup) {
        overlayHost.innerHTML = overlayMarkup;
        overlayHost.__goMarkup = overlayMarkup;
      }

      bindEvents();
      if (typeof bindAccountEvents === 'function') bindAccountEvents();
      if (typeof bindPlatformEvents === 'function') bindPlatformEvents();
      if (state.pdfPreviewOpen && typeof queuePdfPreviewRender === 'function') queuePdfPreviewRender();
      if (state.activeTab === 'home') initHomeTitleMorph();
      if (window.GestOreMotion && typeof window.GestOreMotion.render === 'function') {
        window.GestOreMotion.render(screen, { key: motionKey, direction: motionDirection });
      }
      restoreRenderPosition(savedPosition, screen);
      if (window.requestAnimationFrame) {
        window.requestAnimationFrame(function () { restoreRenderPosition(savedPosition, screen); });
      }
      state.tabSwitchFx = false;
    }
