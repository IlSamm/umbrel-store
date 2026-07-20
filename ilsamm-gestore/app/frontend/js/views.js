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
      var weekPercentValue = Math.round(clampChartPercent(week.percent));
      var weekProgressStyle = clampChartPercent(week.percent).toFixed(2) + '%';
      var workdayIndexes = normalizeWeekdayList(state.settings.workdays || []);
      var todayWeekIndex = mondayIndex(now.getDay());
      var remainingWorkdays = workdayIndexes.filter(function (idx) { return idx > todayWeekIndex; }).length;
      var weekMissingTitle = weekRemaining > 0 ? ('Ti mancano <span>' + formatDuration(weekRemaining) + '</span>') : 'Target completato';
      var weekMissingSub = weekRemaining > 0 ? (remainingWorkdays + ' giorni rimasti') : 'Settimana in positivo';
      var monthNormalValue = formatDuration(monthStats.normalMinutes || Math.max(0, monthStats.totalMinutes - (monthStats.overtimeMinutes || 0)));
      var monthPermessoValue = (monthStats.permesso || 0) + ' gg';
      var dayProgressStyle = clampChartPercent(entry ? heroPercent : 0).toFixed(2) + '%';
      var dayMainLabel = isRestDay ? 'Giornata di riposo' : 'Totale lavorato oggi';
      var targetDurationText = formatDurationPadded(todayTargetMinutes);
      var dayTargetCopy = 'su <strong>' + formatHourValue(state.settings.dailyTarget) + '</strong> previste';
      if (!entry) dayTargetCopy = 'tocca per inserire la giornata';
      if (entry && isStateOnlyType(entry.type)) dayTargetCopy = 'Giornata segnata';
      if (isRestDay) dayTargetCopy = 'Nessun turno previsto';
      var daySummaryClass = !entry ? ' is-empty-summary' : (isRestDay ? ' is-rest-summary' : ' is-work-summary');
      var dayTitleLabel = dayLabel.replace(/\s+\d+\s*$/, '');
      var fullDateLabel = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }).format(now);
      var progressEndLabel = entry ? formatDurationPadded(todayDisplayMinutes) : '0h 00m';
      return '<div class="top home-top gestore-static-top go-home-logo"><div class="gestore-static-title" aria-label="GestOre"><span class="gestore-word gestore-word-main">Gest</span><span class="gestore-word gestore-word-accent">Ore</span></div></div>' +
        '<div class="stack home-stack go-home-stack">' +
          '<button class="go-card go-day-card go-day-card-v2' + daySummaryClass + '" data-open-date="' + key + '">' +
            '<div class="go-day-head"><div class="go-day-meta"><span class="go-day-kicker">Oggi</span><span class="go-day-date">' + fullDateLabel + '</span></div><div class="go-day-title">' + dayTitleLabel + '</div></div>' +
            '<div class="go-hero-core">' +
              '<div class="go-label">' + dayMainLabel + '</div>' +
              '<div class="go-total-number">' + dayPrimaryText + '</div>' +
              '<div class="go-day-target-copy">' + dayTargetCopy + '</div>' +
              '<div class="go-day-timeline"><span style="width:' + dayProgressStyle + ';"></span></div>' +
              '<div class="go-progress-captions"><span><strong>' + targetDurationText + '</strong><em>Previsto</em></span><span><strong>' + progressEndLabel + '</strong><em>Registrato</em></span></div>' +
            '</div>' +
            '<div class="go-stat-column">' +
              '<div class="go-stat-row go-stat-blue"><span class="go-stat-icon">' + icons.briefcase + '</span><span><em>' + ordinaryLabel + '</em><strong>' + ordinaryText + '</strong></span></div>' +
              '<div class="go-stat-row go-stat-violet"><span class="go-stat-icon">' + icons.activity + '</span><span><em>Extra</em><strong>' + overtimeText + '</strong></span></div>' +
              '<div class="go-stat-row go-stat-orange"><span class="go-stat-icon">' + icons.coffee + '</span><span><em>Pausa</em><strong>' + pauseText + '</strong></span></div>' +
            '</div>' +
          '</button>' +
          '<section class="go-card go-analytics-card go-week-card">' +
            '<div class="go-card-head"><div><div class="go-kicker">Settimana</div><div class="go-card-title">Ore e target</div></div><div class="go-card-badge">' + formatHourValue(state.settings.weeklyTarget) + ' target</div></div>' +
            '<div class="go-week-layout">' +
              '<div class="go-donut go-week-donut" style="background:' + weekChartBackground + ';"><div class="go-donut-inner"><strong>' + weekPercentValue + '%</strong><span>del target</span></div></div>' +
              '<div class="go-week-copy"><div class="go-week-ratio"><strong>' + formatDuration(week.totalMinutes) + '</strong><span>/ ' + formatHourValue(state.settings.weeklyTarget) + '</span></div><div class="go-progress"><span style="width:' + weekProgressStyle + ';"></span></div><div class="go-missing-box"><span class="go-missing-icon">' + icons.target + '</span><div><strong>' + weekMissingTitle + '</strong><em>' + weekMissingSub + '</em></div></div></div>' +
            '</div>' +
          '</section>' +
          '<section class="go-card go-analytics-card go-month-card">' +
            '<div class="go-card-head"><div><div class="go-kicker">Mese</div><div class="go-card-title">Composizione</div></div><div class="go-card-badge">' + monthBadgeLabel + '</div></div>' +
            '<div class="go-month-layout">' +
              '<div class="go-donut go-month-donut" style="background:' + monthChartBackground + ';"><div class="go-donut-inner"><strong>' + formatDuration(monthStats.totalMinutes) + '</strong><span>Totali</span></div></div>' +
              '<div class="go-month-list">' +
                '<button class="go-month-row" data-tab="stats"><span><i class="go-row-dot go-row-blue"></i>Ordinarie</span><strong>' + monthNormalValue + '</strong>' + icons.right + '</button>' +
                '<button class="go-month-row" data-tab="stats"><span><i class="go-row-dot go-row-violet"></i>Straordinarie</span><strong>' + formatDuration(monthStats.overtimeMinutes || 0) + '</strong>' + icons.right + '</button>' +
                '<button class="go-month-row" data-tab="stats"><span><i class="go-row-dot go-row-green"></i>Permessi</span><strong>' + monthPermessoValue + '</strong>' + icons.right + '</button>' +
              '</div>' +
            '</div>' +
            '<button class="go-detail-btn" data-tab="stats"><span>' + icons.activity + '</span>Vedi statistiche dettagliate' + icons.right + '</button>' +
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
      return '<div class="top top-centered page-top"><div class="title">Calendario</div></div>' +
        '<div class="stack">' +
          '<div class="card"><div class="card-body compact">' +
            '<div class="month-head"><button class="icon" data-calendar-prev="1">' + icons.left + '</button><div class="large" style="font-weight:700;">' + formatMonthYear(state.currentMonth) + '</div><button class="icon" data-calendar-next="1">' + icons.right + '</button></div>' +
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
        var workedDays = 0;
        for (var i = 0; i < blockLength; i += 1) {
          var current = new Date(blockStart);
          current.setDate(blockStart.getDate() + i);
          var entry = getEntryForDate(current);
          var breakdown = getBreakdown(entry);
          minutes += breakdown.total;
          if (entry) workedDays += 1;
        }
        blocks.push({
          label: blockStart.getDate() === blockEnd.getDate() ? String(blockStart.getDate()) : (blockStart.getDate() + '–' + blockEnd.getDate()),
          minutes: minutes,
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

    function renderStats() {
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
      return '<div class="top top-centered page-top"><div class="title">Statistiche</div></div>' +
        '<div class="stack">' +
          '<div class="card"><div class="card-body compact"><div class="month-head"><button class="icon" data-stats-prev="1">' + icons.left + '</button><div class="large" style="font-weight:700;">' + formatMonthYear(state.currentMonth) + '</div><button class="icon" data-stats-next="1">' + icons.right + '</button></div></div></div>' +
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

    function renderSettings() {
      var draftName = escapeHtml((state.settingsDraft.userName || '').trim() || 'Utente');
      var workdaysCount = normalizeWeekdayList(state.settingsDraft.workdays || []).length;
      var autoRestCount = normalizeWeekdayList(state.settingsDraft.autoRestDays || []).length;
      return '<div class="top settings-top settings-top-refined settings-top-centered"><div class="title">Impostazioni</div></div>' +
        '<div class="stack">' +
          '<div class="card settings-hero settings-hero-clean"><div class="card-body">' +
            '<div class="settings-hero-headline">Tutto sotto controllo</div>' +
            '<div class="small muted settings-hero-subcopy">Qui sistemi nome, obiettivi, giorni lavorativi e riposi automatici. Tutto si salva in automatico appena fai una modifica.</div>' +
            '<div class="settings-hero-grid">' +
              '<div class="settings-stat"><strong>' + draftName + '</strong><span class="tiny muted">Profilo</span></div>' +
              '<div class="settings-stat"><strong>' + state.settingsDraft.weeklyTarget + 'h</strong><span class="tiny muted">Target settimana</span></div>' +
              '<div class="settings-stat"><strong>' + workdaysCount + '</strong><span class="tiny muted">Giorni attivi</span></div>' +
              '<div class="settings-stat"><strong>' + autoRestCount + '</strong><span class="tiny muted">Riposi auto</span></div>' +
            '</div>' +
          '</div></div>' +

          '<div><div class="section-title">Profilo</div><div class="card settings-card"><div class="card-body">' +
            '<div class="settings-field">' +
              '<div class="settings-field-head"><div class="chip">' + icons.home + '</div><div class="settings-field-copy"><div class="settings-label">Nome utente</div><div class="settings-name">Come vuoi comparire nell’app</div></div></div>' +
              '<input id="userNameInput" class="settings-input" type="text" maxlength="24" placeholder="Inserisci il tuo nome" value="' + escapeHtml(state.settingsDraft.userName || '') + '">' +
              '<div class="settings-help">Nome mostrato nelle parti personalizzate dell’app.</div>' +
            '</div>' +
          '</div></div></div>' +

          '<div><div class="section-title">Obiettivi</div><div class="card settings-card"><div class="card-body">' +
            '<div class="settings-split">' +
              '<div class="settings-field">' +
                '<div class="settings-field-head"><div class="chip">' + icons.target + '</div><div class="settings-field-copy"><div class="settings-label">Settimana</div><div class="settings-name">Ore target</div></div></div>' +
                '<input id="weeklyTargetInput" class="settings-input settings-target-input" type="number" inputmode="decimal" min="0" step="0.5" value="' + state.settingsDraft.weeklyTarget + '">' +
                '<div class="settings-help">Quante ore vuoi raggiungere ogni settimana.</div>' +
              '</div>' +
              '<div class="settings-field">' +
                '<div class="settings-field-head"><div class="chip">' + icons.activity + '</div><div class="settings-field-copy"><div class="settings-label">Giorno</div><div class="settings-name">Ore target</div></div></div>' +
                '<input id="dailyTargetInput" class="settings-input settings-target-input" type="number" inputmode="decimal" min="0" step="0.5" value="' + state.settingsDraft.dailyTarget + '">' +
                '<div class="settings-help">Valore usato per i confronti giornalieri.</div>' +
              '</div>' +
            '</div>' +
          '</div></div></div>' +

          '<div><div class="section-title">Settimana lavorativa</div><div class="card settings-card"><div class="card-body">' +
            '<div class="settings-field">' +
              '<div class="settings-field-head"><div class="chip">' + icons.calendar + '</div><div class="settings-field-copy"><div class="settings-label">Giorni attivi</div><div class="settings-name">Tocca per attivare o disattivare</div></div></div>' +
              '<div class="workdays">' +
                workdayLabels.map(function (label, index) {
                  var active = state.settingsDraft.workdays.indexOf(index) !== -1;
                  return '<button class="day ' + (active ? 'active' : '') + '" data-toggle-workday="' + index + '">' + label + '</button>';
                }).join('') +
              '</div>' +
              '<div class="settings-help settings-workdays-note">I giorni selezionati vengono usati per target e riepiloghi.</div>' +
            '</div>' +
          '</div></div></div>' +

          '<div><div class="section-title">Riposo automatico</div><div class="card settings-card"><div class="card-body">' +
            '<div class="settings-field">' +
              '<div class="settings-field-head"><div class="chip">😴</div><div class="settings-field-copy"><div class="settings-label">Giorni di riposo</div><div class="settings-name">Per esempio domenica o sabato + domenica</div></div></div>' +
              '<div class="workdays">' +
                workdayLabels.map(function (label, index) {
                  var active = normalizeWeekdayList(state.settingsDraft.autoRestDays || []).indexOf(index) !== -1;
                  return '<button class="day ' + (active ? 'rest-active' : '') + '" data-toggle-auto-rest-day="' + index + '">' + label + '</button>';
                }).join('') +
              '</div>' +
              '<div class="settings-help settings-workdays-note">Se il giorno è vuoto, viene mostrato automaticamente come riposo. I dati inseriti a mano hanno sempre la precedenza.</div>' +
            '</div>' +
          '</div></div></div>' +

          '<div><div class="section-title">Promemoria</div><div class="card settings-card"><div class="card-body">' +
            '<div class="settings-group">' +
              '<div class="settings-field">' +
                '<div class="between"><div class="row"><div class="chip">' + icons.bell + '</div><div><div class="settings-name">Promemoria giornaliero</div><div class="tiny muted">Questa opzione si aggiorna subito</div></div></div><button class="toggle-btn ' + (state.settings.remindersEnabled ? 'on' : '') + '" data-toggle-reminders="1"><span class="knob"></span></button></div>' +
              '</div>' +
              '<div class="settings-split">' +
                '<div class="settings-field">' +
                  '<div class="settings-label">Orario</div>' +
                  '<input id="reminderTimeInput" class="settings-input time" type="time" value="' + state.settings.reminderTime + '">' +
                '</div>' +
                '<div class="settings-field">' +
                  '<div class="settings-label">Notifica</div>' +
                  '<button class="solid" data-test-notification="1">Invia prova</button>' +
                '</div>' +
              '</div>' +
            '</div>' +
          '</div></div></div>' +

          '<div><div class="section-title">Dati e sicurezza</div><div class="card settings-card"><div class="card-body">' +
            '<div class="settings-group">' +
              '<div class="settings-field">' +
                '<div class="between"><div class="row"><div class="chip">' + icons.lock + '</div><div><div class="settings-name">Blocco app</div><div class="tiny muted">Richiede autenticazione all’apertura</div></div></div><button class="toggle-btn ' + (state.settings.lockApp ? 'on' : '') + '" data-toggle-lock="1"><span class="knob"></span></button></div>' +
              '</div>' +
              '<div class="settings-actions-grid">' +
                '<button class="ghost" data-export-csv="1">Esporta Excel</button>' +
                '<button class="ghost" data-export-report="1">Esporta PDF</button>' +
              '</div>' +
              '<div class="settings-inline-note"><div class="chip">' + icons.check + '</div><div><div class="small" style="font-weight:700;">Salvataggio automatico</div><div class="small muted">Profilo, obiettivi, giorni attivi, riposi automatici, promemoria e blocco app si aggiornano subito.</div></div></div>' +
            '</div>' +
          '</div></div></div>' +

          '<div><div class="section-title">Info app</div><div class="card settings-card"><div class="card-body">' +
            '<div class="settings-tile-grid">' +
              '<div class="settings-mini-detail"><div><div class="settings-label">Versione</div><strong>' + state.settings.version + '</strong></div><span class="muted">Attiva</span></div>' +
              '<div class="settings-mini-detail"><div><div class="settings-label">Build</div><strong>' + (state.settings.build || 'n/d') + '</strong></div><span class="muted">Cache</span></div>' +
              '<div class="settings-mini-detail"><div><div class="settings-label">Nome app</div><strong>' + state.settings.appName + '</strong></div><span class="muted">GestOre</span></div>' +
            '</div>' +
          '</div></div></div>' +
          '<div class="settings-footer-space"></div>' +
        '</div>';
    }


function renderOverlay() {
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

    function renderConfirmModal() {
      if (!state.confirmClearOpen) return '';
      return '<div class="confirm-overlay open"><div class="confirm-card"><div class="confirm-title">Cancella giornata</div><div class="confirm-text">Vuoi cancellare tutte le ore e i dati di questo giorno?</div><div class="confirm-actions"><button class="ghost" data-close-confirm="1">Annulla</button><button class="ghost danger" data-confirm-clear="1">Cancella</button></div></div></div>';
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

    function renderPayslips() {
      ensurePayslipDraft();
      var draft = state.payslipDraft;
      var hasPhoto = Boolean(draft.imageData);
      var hasAmount = parseDecimalInput(draft.netto, 0) > 0;
      var canReset = Boolean(draft.id || hasPhoto || hasAmount);
      var statusHtml = state.payslipStatus
        ? '<div class="payvault-status">' + escapeHtml(state.payslipStatus) + '</div>'
        : '';
      var archive = (state.payslips || []).map(function (item) {
        return '<button class="payvault-item" data-open-payslip="' + item.id + '">' +
          '<span class="payvault-thumb' + (item.imageData ? '' : ' is-empty') + '">' +
            (item.imageData ? '<img src="' + item.imageData + '" alt="Busta paga ' + escapeHtml(getPayslipMonthLabel(item)) + '">' : icons.receipt) +
          '</span>' +
          '<span class="payvault-item-copy"><span class="payvault-item-period">' + escapeHtml(getPayslipMonthLabel(item)) + '</span><strong>' + formatMoneyEuro(item.netto) + '</strong><small>Importo ricevuto</small></span>' +
          '<span class="payvault-chevron">' + icons.right + '</span>' +
        '</button>';
      }).join('');
      return '<div class="top top-centered page-top payvault-page-top"><div class="title">Buste paga</div></div>' +
        '<div class="stack payvault-stack">' +
          '<section class="card payvault-card"><div class="card-body payvault-body">' +
            '<div class="payvault-head">' +
              '<div class="payvault-heading"><span class="payvault-heading-icon">' + icons.receipt + '</span><div><div class="payvault-kicker">Nuova busta</div><div class="payvault-title">Foto e importo</div></div></div>' +
              (canReset ? '<button class="ghost mini-btn payvault-new-btn" data-reset-payslip="1" ' + (state.payslipBusy ? 'disabled' : '') + '>Nuova</button>' : '') +
            '</div>' +
            '<div class="payvault-copy">Salva la foto della busta paga e scrivi quanto hai ricevuto. Nient\'altro.</div>' +
            (hasPhoto
              ? '<div class="payvault-photo"><img src="' + draft.imageData + '" alt="Anteprima busta paga"><div class="payvault-photo-foot"><span>Foto pronta</span><button class="ghost mini-btn" data-trigger-payslip-gallery="1" ' + (state.payslipBusy ? 'disabled' : '') + '>Cambia</button></div></div>'
              : '<div class="payvault-upload"><span class="payvault-upload-icon">' + icons.receipt + '</span><strong>Aggiungi la foto</strong><span>Scatta la busta oppure sceglila dalla galleria.</span><div class="payvault-upload-actions"><button class="solid" data-trigger-payslip-camera="1" ' + (state.payslipBusy ? 'disabled' : '') + '>' + (state.payslipBusy ? 'Caricamento...' : 'Scatta foto') + '</button><button class="ghost" data-trigger-payslip-gallery="1" ' + (state.payslipBusy ? 'disabled' : '') + '>Galleria</button></div></div>') +
            '<label class="payvault-amount"><span>Importo ricevuto</span><div class="payvault-amount-input"><b>EUR</b><input id="payslipNetto" type="text" inputmode="decimal" autocomplete="off" value="' + escapeHtml(formatEditorDecimal(draft.netto || 0)) + '" placeholder="0,00"></div></label>' +
            statusHtml +
            '<div class="payvault-actions"><button class="solid payvault-save" data-save-payslip="1" ' + (state.payslipBusy ? 'disabled' : '') + '>Salva busta paga</button>' +
              (draft.id ? '<button class="ghost danger" data-delete-payslip="' + draft.id + '">Elimina</button>' : '') +
            '</div>' +
          '</div></section>' +
          '<section class="card payvault-archive"><div class="card-body payvault-archive-body">' +
            '<div class="payvault-archive-head"><div><div class="payvault-kicker">Archivio</div><div class="section-title">Buste salvate</div></div><span>' + (state.payslips || []).length + '</span></div>' +
            ((state.payslips && state.payslips.length)
              ? '<div class="payvault-list">' + archive + '</div>'
              : '<div class="payvault-empty"><span class="payvault-empty-icon">' + icons.receipt + '</span><strong>Nessuna busta salvata</strong><span>Le buste appariranno qui con foto e importo.</span></div>') +
          '</div></section>' +
        '</div><input id="payslipFileInput" type="file" accept="image/*" hidden>';
    }

    function renderSettings() {
      var draftName = escapeHtml((state.settingsDraft.userName || '').trim() || 'Utente');
      var workdaysCount = normalizeWeekdayList(state.settingsDraft.workdays || []).length;
      var autoRestCount = normalizeWeekdayList(state.settingsDraft.autoRestDays || []).length;
      var holidayHelper = escapeHtml(getHolidaySettingsHelperText(state.settingsDraft));
      var reminderHelper = escapeHtml(getReminderHelperText());
      var syncStatusMessage = escapeHtml(getSyncStatusMessage());
      var exportMonthLabel = escapeHtml(monthNames[state.currentMonth.getMonth()]);
      var exportYearLabel = escapeHtml(String(state.currentMonth.getFullYear()));
      return '<div class="top settings-top settings-top-refined settings-top-centered"><div class="title">Impostazioni</div></div>' +
        '<div class="stack">' +
          '<div class="card settings-hero settings-hero-clean"><div class="card-body">' +
            '<div class="settings-hero-headline">Tutto sotto controllo</div>' +
            '<div class="small muted settings-hero-subcopy">Qui sistemi nome, obiettivi, giorni lavorativi, riposi automatici e promemoria. Se il server locale e disponibile, i dati restano anche sincronizzati.</div>' +
            '<div class="settings-hero-grid">' +
              '<div class="settings-stat"><strong>' + draftName + '</strong><span class="tiny muted">Profilo</span></div>' +
              '<div class="settings-stat"><strong>' + state.settingsDraft.weeklyTarget + 'h</strong><span class="tiny muted">Target settimana</span></div>' +
              '<div class="settings-stat"><strong>' + workdaysCount + '</strong><span class="tiny muted">Giorni attivi</span></div>' +
              '<div class="settings-stat"><strong>' + autoRestCount + '</strong><span class="tiny muted">Riposi auto</span></div>' +
            '</div>' +
          '</div></div>' +
          '<div><div class="section-title">Profilo</div><div class="card settings-card"><div class="card-body">' +
            '<div class="settings-field">' +
              '<div class="settings-field-head"><div class="chip">' + icons.home + '</div><div class="settings-field-copy"><div class="settings-label">Nome utente</div><div class="settings-name">Come vuoi comparire nell\'app</div></div></div>' +
              '<input id="userNameInput" class="settings-input" type="text" maxlength="24" placeholder="Inserisci il tuo nome" value="' + escapeHtml(state.settingsDraft.userName || '') + '">' +
              '<div class="settings-help">Nome mostrato nelle parti personalizzate dell\'app.</div>' +
            '</div>' +
          '</div></div></div>' +
          '<div><div class="section-title">Obiettivi</div><div class="card settings-card"><div class="card-body">' +
            '<div class="settings-split">' +
              '<div class="settings-field">' +
                '<div class="settings-field-head"><div class="chip">' + icons.target + '</div><div class="settings-field-copy"><div class="settings-label">Settimana</div><div class="settings-name">Ore target</div></div></div>' +
                '<input id="weeklyTargetInput" class="settings-input settings-target-input" type="number" inputmode="decimal" min="0" step="0.5" value="' + state.settingsDraft.weeklyTarget + '">' +
                '<div class="settings-help">Quante ore vuoi raggiungere ogni settimana.</div>' +
              '</div>' +
              '<div class="settings-field">' +
                '<div class="settings-field-head"><div class="chip">' + icons.activity + '</div><div class="settings-field-copy"><div class="settings-label">Giorno</div><div class="settings-name">Ore target</div></div></div>' +
                '<input id="dailyTargetInput" class="settings-input settings-target-input" type="number" inputmode="decimal" min="0" step="0.5" value="' + state.settingsDraft.dailyTarget + '">' +
                '<div class="settings-help">Valore usato per i confronti giornalieri.</div>' +
              '</div>' +
            '</div>' +
          '</div></div></div>' +
          '<div><div class="section-title">Settimana lavorativa</div><div class="card settings-card"><div class="card-body">' +
            '<div class="settings-field">' +
              '<div class="settings-field-head"><div class="chip">' + icons.calendar + '</div><div class="settings-field-copy"><div class="settings-label">Giorni attivi</div><div class="settings-name">Tocca per attivare o disattivare</div></div></div>' +
              '<div class="workdays">' +
                workdayLabels.map(function (label, index) {
                  var active = state.settingsDraft.workdays.indexOf(index) !== -1;
                  return '<button class="day ' + (active ? 'active' : '') + '" data-toggle-workday="' + index + '">' + label + '</button>';
                }).join('') +
              '</div>' +
              '<div class="settings-help settings-workdays-note">I giorni selezionati vengono usati per target e riepiloghi.</div>' +
            '</div>' +
          '</div></div></div>' +
          '<div><div class="section-title">Riposo automatico</div><div class="card settings-card"><div class="card-body">' +
            '<div class="settings-field">' +
              '<div class="settings-field-head"><div class="chip">R</div><div class="settings-field-copy"><div class="settings-label">Giorni di riposo</div><div class="settings-name">Per esempio domenica o sabato + domenica</div></div></div>' +
              '<div class="workdays">' +
                workdayLabels.map(function (label, index) {
                  var active = normalizeWeekdayList(state.settingsDraft.autoRestDays || []).indexOf(index) !== -1;
                  return '<button class="day ' + (active ? 'rest-active' : '') + '" data-toggle-auto-rest-day="' + index + '">' + label + '</button>';
                }).join('') +
              '</div>' +
              '<div class="settings-help settings-workdays-note">Se il giorno e vuoto, viene mostrato automaticamente come riposo. I dati inseriti a mano hanno sempre la precedenza.</div>' +
            '</div>' +
          '</div></div></div>' +
          '<div><div class="section-title">Festivita automatiche</div><div class="card settings-card"><div class="card-body">' +
            '<div class="settings-group">' +
              '<div class="settings-field">' +
                '<div class="between"><div class="row"><div class="chip">F</div><div><div class="settings-name">Conta ore anche nei weekend</div><div class="tiny muted">Se spento, sabato e domenica non coprono mai ore anche se li usi per straordinari</div></div></div><button class="toggle-btn ' + (state.settingsDraft.holidayHoursOnOffDays ? 'on' : '') + '" data-toggle-holiday-offdays="1"><span class="knob"></span></button></div>' +
                '<div class="settings-help">' + holidayHelper + '</div>' +
              '</div>' +
            '</div>' +
          '</div></div></div>' +
          '<div><div class="section-title">Promemoria</div><div class="card settings-card"><div class="card-body">' +
            '<div class="settings-group">' +
              '<div class="settings-field">' +
                '<div class="between"><div class="row"><div class="chip">' + icons.bell + '</div><div><div class="settings-name">Promemoria locale</div><div class="tiny muted">Funziona mentre GestOre resta aperta</div></div></div><button class="toggle-btn ' + (state.settings.remindersEnabled ? 'on' : '') + '" data-toggle-reminders="1"><span class="knob"></span></button></div>' +
              '</div>' +
              '<div class="settings-split">' +
                '<div class="settings-field">' +
                  '<div class="settings-label">Orario</div>' +
                  '<input id="reminderTimeInput" class="settings-input time" type="time" value="' + state.settings.reminderTime + '">' +
                '</div>' +
                '<div class="settings-field">' +
                  '<div class="settings-label">Notifica</div>' +
                  '<button class="solid" data-test-notification="1">Invia test</button>' +
                '</div>' +
              '</div>' +
              '<div class="settings-help">' + reminderHelper + '</div>' +
            '</div>' +
          '</div></div></div>' +
          '<div><div class="section-title">Dati e sicurezza</div><div class="card settings-card"><div class="card-body">' +
            '<div class="settings-group">' +
              '<div class="settings-field">' +
                '<div class="between"><div class="row"><div class="chip">' + icons.lock + '</div><div><div class="settings-name">Schermata privacy</div><div class="tiny muted">Nasconde i dati quando riapri l\'app</div></div></div><button class="toggle-btn ' + (state.settings.lockApp ? 'on' : '') + '" data-toggle-lock="1"><span class="knob"></span></button></div>' +
                '<div class="settings-help">Non usa un PIN: e un blocco rapido visivo utile quando lasci il telefono sul tavolo o riapri GestOre davanti ad altre persone.</div>' +
              '</div>' +
              '<div class="settings-actions-grid settings-actions-grid-pdf">' +
                '<button class="ghost" data-export-csv="1">Esporta Excel</button>' +
                '<button class="ghost" data-export-report="1">PDF ' + exportMonthLabel + '</button>' +
                '<button class="ghost" data-export-report-year="1">PDF anno ' + exportYearLabel + '</button>' +
              '</div>' +
              '<div class="settings-inline-note"><div class="chip">' + icons.check + '</div><div><div class="small" style="font-weight:700;">Salvataggio automatico</div><div class="small muted">' + syncStatusMessage + '</div></div></div>' +
            '</div>' +
          '</div></div></div>' +
          '<div><div class="section-title">Info app</div><div class="card settings-card"><div class="card-body">' +
            '<div class="settings-tile-grid">' +
              '<div class="settings-mini-detail"><div><div class="settings-label">Versione</div><strong>' + state.settings.version + '</strong></div><span class="muted">Attiva</span></div>' +
              '<div class="settings-mini-detail"><div><div class="settings-label">Nome app</div><strong>' + state.settings.appName + '</strong></div><span class="muted">GestOre</span></div>' +
            '</div>' +
          '</div></div></div>' +
          '<div class="settings-footer-space"></div>' +
        '</div>';
    }

    function renderPrivacyLock() {
      if (!state.privacyLocked) return '';
      return '<div class="privacy-lock-overlay"><div class="privacy-lock-card"><div class="privacy-lock-icon">' + icons.lock + '</div><div class="privacy-lock-title">GestOre nascosta</div><div class="privacy-lock-text">La schermata privacy e attiva. Tocca qui sotto per tornare all\'app.</div><div class="privacy-lock-meta">' + escapeHtml(getSyncStatusMessage()) + '</div><button class="solid privacy-lock-btn" data-unlock-app="1">Sblocca</button></div></div>';
    }

    function renderNav() {
      var items = [
        { key: 'home', label: 'Home', icon: icons.home },
        { key: 'calendar', label: 'Calendario', icon: icons.calendar },
        { key: 'stats', label: 'Statistiche', icon: icons.activity },
        { key: 'payslips', label: 'Buste', icon: icons.receipt },
        { key: 'settings', label: 'Impostazioni', icon: icons.settings }
      ];
      return '<div class="bottom-nav"><div class="nav-grid">' + items.map(function (i) {
        return '<button class="nav-btn ' + (state.activeTab === i.key ? 'active' : '') + '" data-tab="' + i.key + '">' + i.icon + '<span class="nav-label">' + i.label + '</span></button>';
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
        '<section class="screen payslips-screen ' + (state.activeTab === 'payslips' ? ('active' + switchClass) : '') + '">' + renderPayslips() + '</section>' +
        '<section class="screen settings-screen ' + (state.activeTab === 'settings' ? ('active' + switchClass) : '') + '">' + renderSettings() + '</section>' +
        renderNav() + renderOverlay() + renderConfirmModal() + renderPrivacyLock();
      bindEvents();
      initHomeTitleMorph();
      state.tabSwitchFx = false;
    }
