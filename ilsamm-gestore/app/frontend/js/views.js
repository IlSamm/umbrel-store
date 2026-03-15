function renderPayslips() {
      ensurePayslipDraft();
      var draft = state.payslipDraft;
      var draftStatus = state.payslipStatus ? '<div class="payslip-status">' + escapeHtml(state.payslipStatus) + '</div>' : '';
      var archive = (state.payslips || []).map(function (item) {
        var status = getPayslipStatus(item);
        return '<button class="payslip-archive-card" data-open-payslip="' + item.id + '"><div class="payslip-archive-main"><div><div class="payslip-month">' + getPayslipMonthLabel(item) + '</div><div class="payslip-company">' + escapeHtml(item.company || 'Busta importata') + '</div></div><span class="payslip-badge ' + status.tone + '">' + status.label + '</span></div><div class="payslip-archive-meta"><span>Netto ' + formatMoneyEuro(item.netto) + '</span><span>Straordinari ' + formatHourValue(item.overtimeHours || 0) + '</span></div></button>';
      }).join('');
      var comparisons = getPayslipComparison(draft).filter(function (row) { return row.app || row.slip; });
      return '<div class="top top-centered"><div class="title">Buste paga</div></div>' +
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
      var dayLabel = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }).format(now);
      dayLabel = dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1);
      var statusText = entry ? currentHomeStatus(entry, breakdown) : 'Tocca per inserire la giornata';
      var todayTargetMinutes = Math.max(1, state.settings.dailyTarget * 60);
      var todayRemaining = Math.max(0, todayTargetMinutes - breakdown.total);
      var heroPercent = entry ? Math.min(100, (breakdown.total / todayTargetMinutes) * 100) : 0;
      if (entry && entry.type !== 'lavoro') heroPercent = 100;
      var weekTargetMinutes = Math.max(1, state.settings.weeklyTarget * 60);
      var weekRemaining = Math.max(0, weekTargetMinutes - week.totalMinutes);
      var monthAverageMinutes = monthStats.workedDays ? Math.round(monthStats.totalMinutes / monthStats.workedDays) : 0;
      var weekDays = getWeekDaysData(now);
      var weekEntriesCount = weekDays.filter(function (item) { return !!item.entry; }).length;
      var headerMessage = '';
      var heroMessage = 'Tocca qui per registrare la giornata di oggi';
      if (entry) {
        if (isStateOnlyType(entry.type)) heroMessage = type.label + ' registrata per oggi';
        else if (breakdown.overtime > 0) heroMessage = 'Hai ' + formatDuration(breakdown.overtime) + ' di straordinario registrato';
        else if (todayRemaining > 0) heroMessage = 'Ti mancano ' + formatDuration(todayRemaining) + ' al target giornaliero';
        else heroMessage = 'Target giornaliero raggiunto';
      }
      var stateDayUi = entry && isStateOnlyType(entry.type) ? getHomeStateDayUi(entry.type) : null;
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
      var todayInsightSub = !entry ? 'target di oggi' : (isStateOnlyType(entry.type) ? 'giornata segnata' : (todayRemaining > 0 ? 'mancano al target' : 'target raggiunto'));
      var monthAverageValue = monthStats.workedDays ? formatHourValue(minutesToHours(monthAverageMinutes)) : '--';
      var monthAverageSub = monthStats.workedDays ? 'media per giorno' : 'nessun giorno ancora';
      var weekGoalSub = weekRemaining > 0 ? (formatDuration(weekRemaining) + ' per chiudere la settimana') : 'target già superato';
      return '<div class="top home-top"><div class="home-header-copy"><div class="home-intro"><div class="home-morph-wrap"><div class="home-morph-title" id="homeMorphTitle" aria-label="GestOre"><span class="home-morph-text" id="homeMorphTextA"></span><span class="home-morph-text" id="homeMorphTextB"></span></div><svg class="home-morph-filters" aria-hidden="true" focusable="false"><defs><filter id="homeMorphThreshold"><feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 255 -140"></feColorMatrix></filter></defs></svg></div></div></div></div>' +
        '<div class="stack home-stack">' +
          '<div class="card home-hero"><div class="card-body">' +
            '<div class="home-hero-head"><div class="home-hero-day">' + dayLabel + '</div>' + (headerMessage ? '<div class=\"hero-topline\">' + headerMessage + '</div>' : '') + '</div>' +
            '<button class="btn home-hero-btn" data-open-date="' + key + '">' + heroInner + '</button></div></div>' +
          '<div class="home-summary"><div class="summary-card"><div class="small muted">Questa Settimana</div><div class="summary-value" style="margin-top:10px;">' + formatDuration(week.totalMinutes) + '</div><div class="summary-sub">su ' + state.settings.weeklyTarget + 'h target</div><div class="progress" style="margin-top:14px;"><div style="width:' + week.percent + '%;"></div></div></div>' +
          '<div class="summary-card"><div class="small muted">Mese Corrente</div><div class="summary-value" style="margin-top:10px;">' + formatDuration(monthStats.totalMinutes) + '</div><div class="summary-sub">' + formatDuration(monthStats.overtimeMinutes) + ' extra • ' + monthStats.workedDays + ' giorni</div></div></div>' +
          '<div class="card"><div class="card-body compact"><div class="home-section-title">Panoramica veloce</div><div class="home-subtle">' + weekGoalSub + '</div><div class="home-insight-grid"><div class="insight-card"><div class="insight-label">Oggi</div><div class="insight-value">' + todayInsightValue + '</div><div class="insight-sub">' + todayInsightSub + '</div></div><div class="insight-card"><div class="insight-label">Media mese</div><div class="insight-value">' + monthAverageValue + '</div><div class="insight-sub">' + monthAverageSub + '</div></div><div class="insight-card"><div class="insight-label">Registrati</div><div class="insight-value">' + weekEntriesCount + '/7</div><div class="insight-sub">giorni salvati in settimana</div></div></div></div></div>' +
          '<div class="card"><div class="card-body compact"><div class="between"><div class="home-section-title">Settimana</div><div class="home-subtle">Tocca un giorno per aprirlo</div></div><div class="week-strip">' + weekDays.map(function (item) {
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
      var text1 = document.getElementById('homeMorphTextA');
      var text2 = document.getElementById('homeMorphTextB');
      if (!container || !text1 || !text2) return;

      var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      var texts = ['GESTORE', getDynamicWelcomeLabel()];
      if (reduceMotion) {
        text1.textContent = texts[0];
        text2.textContent = '';
        text1.style.opacity = '100%';
        text1.style.filter = '';
        text2.style.opacity = '0%';
        text2.style.filter = '';
        return;
      }

      var morphTime = 1.05;
      var cooldownTime = 4.8;
      var textIndex = texts.length - 1;
      var time = new Date();
      var morph = 0;
      var cooldown = cooldownTime;
      var rafId = 0;

      text1.textContent = texts[textIndex % texts.length];
      text2.textContent = texts[(textIndex + 1) % texts.length];

      function setMorph(fraction) {
        text2.style.filter = 'blur(' + Math.min(8 / Math.max(fraction, 0.0001) - 8, 100) + 'px)';
        text2.style.opacity = (Math.pow(fraction, 0.4) * 100) + '%';

        var inverse = 1 - fraction;
        text1.style.filter = 'blur(' + Math.min(8 / Math.max(inverse, 0.0001) - 8, 100) + 'px)';
        text1.style.opacity = (Math.pow(inverse, 0.4) * 100) + '%';
        text1.textContent = texts[textIndex % texts.length];
        text2.textContent = texts[(textIndex + 1) % texts.length];
      }

      function doMorph() {
        morph -= cooldown;
        cooldown = 0;
        var fraction = morph / morphTime;
        if (fraction > 1) {
          cooldown = cooldownTime;
          fraction = 1;
        }
        setMorph(fraction);
      }

      function doCooldown() {
        morph = 0;
        text2.style.filter = '';
        text2.style.opacity = '100%';
        text1.style.filter = '';
        text1.style.opacity = '0%';
      }

      function animate() {
        rafId = requestAnimationFrame(animate);
        if (!document.body.contains(container)) return;

        var newTime = new Date();
        var shouldIncrementIndex = cooldown > 0;
        var dt = (newTime - time) / 1000;
        time = newTime;
        cooldown -= dt;

        if (cooldown <= 0) {
          if (shouldIncrementIndex) textIndex++;
          doMorph();
        } else {
          doCooldown();
        }
      }

      animate();

      homeMorphController = {
        destroy: function () {
          if (rafId) cancelAnimationFrame(rafId);
          text1.style.filter = '';
          text1.style.opacity = '100%';
          text2.style.filter = '';
          text2.style.opacity = '0%';
        }
      };
    }

    function renderCalendar() {
      var todayKey = toISODate(new Date());
      var grid = buildMonthGrid(state.currentMonth);
      var stats = getMonthStats(state.currentMonth);
      return '<div class="top top-centered"><div class="title">Calendario</div></div>' +
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
            '<div class="mini center"><div class="big">' + stats.workedDays + '</div><div class="small muted">Giorni lavoro</div></div>' +
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
          var entry = state.entries[toISODate(current)];
          var breakdown = getBreakdown(entry);
          minutes += breakdown.total;
          if (breakdown.total > 0 || (entry && entry.type && entry.type !== 'lavoro')) workedDays += entry ? 1 : 0;
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
      var recordedDays = Math.min(monthDays, s.workedDays + s.ferie + s.malattia + s.permesso + s.riposo);
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
        { label:'Riposo', value:s.riposo, color:'#64748b' }
      ].filter(function (item) { return item.value > 0; });
      var maxWeekMinutes = weekBlocks.reduce(function (max, block) { return Math.max(max, block.minutes); }, 0);
      return '<div class="top top-centered"><div class="title">Statistiche</div></div>' +
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
      return s.workedDays + s.ferie + s.malattia + s.permesso + s.riposo;
    }

    function renderSettings() {
      var draftName = escapeHtml((state.settingsDraft.userName || '').trim() || 'Utente');
      var workdaysCount = normalizeWeekdayList(state.settingsDraft.workdays || []).length;
      var autoRestCount = normalizeWeekdayList(state.settingsDraft.autoRestDays || []).length;
      return '<div class="top settings-top"><div class="settings-top-spacer"></div><div class="title">Impostazioni</div><div class="settings-top-action"><button class="ghost settings-save-btn" data-save-settings="1">Salva</button></div></div>' +
        '<div class="stack">' +
          '<div class="card settings-hero settings-hero-clean"><div class="card-body">' +
            '<div class="settings-hero-headline">Tutto sotto controllo</div>' +
            '<div class="small muted settings-hero-subcopy">Qui sistemi nome, obiettivi, giorni lavorativi e riposi automatici. Per queste voci usa <strong style="color:#fff;">Salva</strong> in alto a destra.</div>' +
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
                '<button class="ghost" data-export-report="1">Esporta report</button>' +
              '</div>' +
              '<div class="settings-inline-note"><div class="chip">' + icons.check + '</div><div><div class="small" style="font-weight:700;">Salvataggio chiaro</div><div class="small muted">Profilo, obiettivi e giorni attivi si salvano con il pulsante in alto. Promemoria e blocco app invece si aggiornano subito.</div></div></div>' +
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


function renderOverlay() {
      if (!state.editingDate || !state.draft) return '';
      var date = state.editingDate, d = state.draft;
      var breakdown = getBreakdown(d);
      var label = weekNamesFull[mondayIndex(date.getDay())];
      var currentType = dayTypes[d.type];
      var others = Object.entries(dayTypes).filter(function (pair) { return pair[0] !== d.type; });
      var isStateOnly = isStateOnlyType(d.type);
      var isMixed = isMixedType(d.type);
      var summaryHtml = '';
      if (d.type === 'riposo') {
        summaryHtml = '<div class="hours-card"><div class="hours-stat"><div class="small muted">Riposo</div><div class="large">Ok</div></div></div>';
      } else if (isStateOnly) {
        summaryHtml = '<div class="hours-card"><div class="three"><div class="hours-stat"><div class="small muted">Coperto</div><div id="editorSummaryCovered" class="large">' + formatHourValue(minutesToHours(breakdown.leave)) + '</div></div><div class="hours-stat"><div class="small muted">Tipo</div><div class="large">' + currentType.label + '</div></div><div class="hours-stat"><div class="small muted">Note</div><div class="large">' + (d.notes ? '1' : '0') + '</div></div></div></div>';
      } else if (isMixed) {
        summaryHtml = '<div class="hours-card"><div class="four"><div class="hours-stat"><div class="small muted">Totale</div><div id="editorSummaryTotal" class="large">' + formatDuration(breakdown.total) + '</div></div><div class="hours-stat"><div class="small muted">Normali</div><div id="editorSummaryNormal" class="large">' + formatHourValue(minutesToHours(breakdown.normal)) + '</div></div><div class="hours-stat"><div class="small muted">Extra</div><div id="editorSummaryExtra" class="large">' + formatHourValue(minutesToHours(breakdown.overtime)) + '</div></div><div class="hours-stat"><div class="small muted">Ferie</div><div id="editorSummaryLeave" class="large">' + formatHourValue(minutesToHours(breakdown.leave)) + '</div></div></div></div>';
      } else {
        summaryHtml = '<div class="hours-card"><div class="three"><div class="hours-stat"><div class="small muted">Totale</div><div id="editorSummaryTotal" class="large">' + formatDuration(breakdown.total) + '</div></div><div class="hours-stat"><div class="small muted">Normali</div><div id="editorSummaryNormal" class="large">' + formatHourValue(minutesToHours(breakdown.normal)) + '</div></div><div class="hours-stat"><div class="small muted">Extra</div><div id="editorSummaryExtra" class="large">' + formatHourValue(minutesToHours(breakdown.overtime)) + '</div></div></div></div>';
      }

      var dynamicSections = '';
      if (d.type === 'riposo') {
        dynamicSections += '<div><div class="hours-card"><div class="hours-stat"><div class="large">😴</div><div class="small muted" style="margin-top:8px;">Per il riposo non servono orari o quantità.</div></div></div></div>';
      } else if (isStateOnly) {
        dynamicSections += '<div><div class="hours-grid"><div class="sub-input-wrap" style="grid-column:1/-1;"><div class="sub-label">' + getEditorQuantityLabel(d.type) + '</div><input id="editorQuantityHours" class="sub-input textual" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" value="' + formatEditorDecimal(d.quantityHours || 0) + '"><div class="tiny-hint">' + getEditorQuantityHint(d.type) + '</div></div></div></div>';
      } else {
        dynamicSections += '<div><div class="hours-grid"><div class="time-box ' + (normalizeTimeInputValue(d.start || '') ? 'has-time' : 'empty-time') + '"><div class="small muted">Entrata</div><div class="time-field"><input id="editorStart" class="time-input-big" type="time" step="60" value="' + normalizeTimeInputValue(d.start || '') + '"><div class="time-placeholder" aria-hidden="true">-- : --</div></div></div><div class="time-box ' + (normalizeTimeInputValue(d.end || '') ? 'has-time' : 'empty-time') + '"><div class="small muted">Uscita</div><div class="time-field"><input id="editorEnd" class="time-input-big" type="time" step="60" value="' + normalizeTimeInputValue(d.end || '') + '"><div class="time-placeholder" aria-hidden="true">-- : --</div></div></div></div></div>';
        dynamicSections += '<div><div class="hours-grid">' +
          '<div class="sub-input-wrap"><div class="sub-label">Pausa (ore)</div><input id="editorBreakHours" class="sub-input textual" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" value="' + formatEditorDecimal(d.breakHours || 0) + '"></div>' +
          (isMixed ? '<div class="sub-input-wrap"><div class="sub-label">Ore ferie</div><input id="editorLeaveHours" class="sub-input textual" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" value="' + formatEditorDecimal(d.leaveHours || 0) + '"></div>' : '') +
          '<div class="sub-input-wrap"><div class="sub-label">Straordinarie</div><input id="editorOvertimeHours" class="sub-input textual" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" value="' + formatEditorDecimal(d.overtimeHours || 0) + '"></div>' +
        '</div></div>';
      }

      return '<div class="overlay open"><div class="overlay-header"><button class="icon" data-close-editor="1">' + icons.x + '</button><div class="center"><div class="large" style="font-weight:700;">' + label + '</div><div class="small muted">' + date.getDate() + ' ' + monthNames[date.getMonth()] + ' ' + date.getFullYear() + '</div></div><button class="ghost" data-save-day="1">Salva</button></div>' +
        '<div class="overlay-scroll"><div class="stack">' +
        '<div><div class="type-picker-wrap"><div class="type-list"><button class="type-row" data-toggle-type-open="1"><div class="type-row-left"><div class="type-icon" style="background:' + typeIconBg(d.type) + '">' + typeIconSvg(d.type) + '</div><div><div class="type-main-label">' + currentType.label + '</div></div></div><span>' + icons.right + '</span></button>' +
        (state.typeOpen ? '<div class="type-options">' + others.map(function (pair) { return '<button class="type-row" data-select-type="' + pair[0] + '"><div class="type-row-left"><div class="type-icon" style="background:' + typeIconBg(pair[0]) + '">' + typeIconSvg(pair[0]) + '</div><div class="type-secondary-label">' + pair[1].label + '</div></div><span>Scegli</span></button>'; }).join('') + '</div>' : '') + '</div></div></div>' +
        dynamicSections +
        '<div>' + summaryHtml + '</div>' +
        '<div><button class="collapse-btn" data-toggle-notes-open="1"><div><div>Annotazioni giornata</div></div><span>' + icons.right + '</span></button><div class="collapse-panel ' + (state.notesOpen ? 'open' : '') + '"><textarea id="editorNotes" class="notes" placeholder="Scrivi qui eventuali note...">' + escapeHtml(d.notes) + '</textarea></div></div>' +
        '<div><div class="editor-actions"><button class="ghost danger" data-clear-day="1">Cancella tutte le ore del giorno</button></div></div>' +
        '</div></div></div>';
    }

    function renderConfirmModal() {
      if (!state.confirmClearOpen) return '';
      return '<div class="confirm-overlay open"><div class="confirm-card"><div class="confirm-title">Cancella giornata</div><div class="confirm-text">Vuoi cancellare tutte le ore e i dati di questo giorno?</div><div class="confirm-actions"><button class="ghost" data-close-confirm="1">Annulla</button><button class="ghost danger" data-confirm-clear="1">Cancella</button></div></div></div>';
    }

    function renderNav() {
      var items = [
        { key: 'home', label: 'Home', icon: icons.home },
        { key: 'calendar', label: 'Calendario', icon: icons.calendar },
        { key: 'stats', label: 'Statistiche', icon: icons.activity },
        { key: 'payslips', label: 'Buste', icon: icons.check },
        { key: 'settings', label: 'Impostazioni', icon: icons.settings }
      ];
      return '<div class="bottom-nav"><div class="nav-grid">' + items.map(function (i) {
        return '<button class="nav-btn ' + (state.activeTab === i.key ? 'active' : '') + '" data-tab="' + i.key + '">' + i.icon + '<span class="nav-label">' + i.label + '</span></button>';
      }).join('') + '</div></div>';
    }

    function render() {
      var app = document.getElementById('app');
      if (!app) return;
      app.innerHTML =
        '<section class="screen home-screen ' + (state.activeTab === 'home' ? 'active' : '') + '">' + renderHome() + '</section>' +
        '<section class="screen ' + (state.activeTab === 'calendar' ? 'active' : '') + '">' + renderCalendar() + '</section>' +
        '<section class="screen ' + (state.activeTab === 'stats' ? 'active' : '') + '">' + renderStats() + '</section>' +
        '<section class="screen ' + (state.activeTab === 'payslips' ? 'active' : '') + '">' + renderPayslips() + '</section>' +
        '<section class="screen ' + (state.activeTab === 'settings' ? 'active' : '') + '">' + renderSettings() + '</section>' +
        renderNav() + renderOverlay() + renderConfirmModal();
      bindEvents();
      initHomeTitleMorph();
    }
