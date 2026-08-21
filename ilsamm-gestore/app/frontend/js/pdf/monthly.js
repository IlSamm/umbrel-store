(function () {
  'use strict';

  function buildMonthlyReport(date) {
    var E = window.GestOrePdfEngine;
    var C = E.colors;
    var reportMonth = new Date(date.getFullYear(), date.getMonth(), 1);
    var stats = getMonthStats(reportMonth);
    var recordedDays = getRecordedDaysFromStats(stats);
    var rows = getMonthEntries(reportMonth)
      .sort(function (a, b) { return a[0].localeCompare(b[0]); })
      .map(function (pair) {
        var entry = pair[1];
        var current = new Date(pair[0] + 'T12:00:00');
        var breakdown = getBreakdown(entry);
        var typeLabel = dayTypes[entry.type] ? dayTypes[entry.type].label : entry.type;
        if (entry.type === 'festivita_pagata') {
          var holidayName = getHolidayDisplayName(entry, current);
          if (holidayName) typeLabel = holidayName;
        }
        return {
          date: pad(current.getDate()) + '/' + pad(current.getMonth() + 1),
          day: weekNames[mondayIndex(current.getDay())],
          type: E.truncate(typeLabel, 20),
          time: entry.start && entry.end ? entry.start + '-' + entry.end : '--',
          work: breakdown.total ? E.duration(breakdown.total) : '--',
          cover: breakdown.leave ? E.duration(breakdown.leave) : '--',
          extra: breakdown.overtime ? E.duration(breakdown.overtime) : '--',
          totalMinutes: breakdown.total || 0,
          leaveMinutes: breakdown.leave || 0,
          overtimeMinutes: breakdown.overtime || 0,
          color: dayTypes[entry.type] && dayTypes[entry.type].dot ? dayTypes[entry.type].dot : C.slate
        };
      });
    var coveredMinutes = rows.reduce(function (sum, row) { return sum + row.leaveMinutes; }, 0);
    var activeRows = rows.filter(function (row) { return row.totalMinutes > 0; });
    var longestRow = activeRows.reduce(function (best, row) {
      return !best || row.totalMinutes > best.totalMinutes ? row : best;
    }, null);
    var extraDays = rows.filter(function (row) { return row.overtimeMinutes > 0; }).length;
    var averageMinutes = activeRows.length ? stats.totalMinutes / activeRows.length : 0;
    var pdf = E.createDocument();
    var chunks = [];
    var firstCapacity = 14;
    var continuationCapacity = 26;
    if (!rows.length) chunks.push([]);
    else {
      chunks.push(rows.slice(0, firstCapacity));
      for (var offset = firstCapacity; offset < rows.length; offset += continuationCapacity) {
        chunks.push(rows.slice(offset, offset + continuationCapacity));
      }
    }

    function drawHeader(page) {
      var profile = E.profileName();
      var initial = String(profile || 'P').charAt(0).toUpperCase();
      pdf.roundedRect(page, 28, 28, E.width - 56, 118, 24, C.panelStrong, C.border, 1.1);
      E.drawBrand(pdf, page, 48, 61, 16);
      pdf.text(page, 'REPORT MENSILE', 48, 87, 7.5, 'F2', C.blue);
      pdf.text(page, formatMonthYear(reportMonth), 48, 125, 27, 'F2', C.text);
      pdf.roundedRect(page, 382, 47, 160, 80, 18, C.panelSoft, C.borderSoft, 0.8);
      pdf.roundedRect(page, 397, 61, 31, 31, 11, C.blueStrong, null, 0);
      pdf.textCenter(page, initial, 397, 31, 82, 12, 'F2', C.text);
      pdf.text(page, 'PROFILO', 440, 67, 6.5, 'F2', C.muted);
      pdf.text(page, E.truncate(profile, 16), 440, 84, 10, 'F2', C.text);
      pdf.text(page, 'Generato ' + E.todayLabel(), 397, 108, 7, 'F1', C.muted);
      pdf.textRight(page, 'Target ' + formatHourValue(state.settings.dailyTarget) + '/g', 527, 108, 7, 'F1', C.muted);
    }

    function drawOverview(page) {
      var top = 160;
      pdf.roundedRect(page, 28, top, 263, 110, 20, C.panel, C.borderSoft, 0.8);
      pdf.roundedRect(page, 46, top + 16, 34, 5, 2.5, C.blue, null, 0);
      pdf.text(page, 'TEMPO REGISTRATO', 46, top + 40, 7.5, 'F2', C.muted);
      pdf.text(page, E.duration(stats.totalMinutes), 46, top + 77, 30, 'F2', C.text);
      pdf.text(page, recordedDays + (recordedDays === 1 ? ' giornata nel mese' : ' giornate nel mese'), 46, top + 98, 8, 'F1', C.muted);

      pdf.roundedRect(page, 300, top, 267, 110, 20, C.panel, C.borderSoft, 0.8);
      [
        { label: 'Ordinarie', value: E.duration(stats.normalMinutes), color: C.blueStrong },
        { label: 'Straordinarie', value: E.duration(stats.overtimeMinutes), color: C.purple },
        { label: 'Ore coperte', value: E.duration(coveredMinutes), color: C.green }
      ].forEach(function (item, index) {
        var rowTop = top + 13 + (index * 32);
        pdf.dot(page, 317, rowTop + 7, 8, item.color);
        pdf.text(page, item.label, 332, rowTop + 14, 8, 'F1', C.muted);
        pdf.textRight(page, item.value, 549, rowTop + 14, 10, 'F2', item.value === '0h 0m' ? C.faint : C.text);
        if (index < 2) pdf.line(page, 317, rowTop + 23, 549, rowTop + 23, C.borderSoft, 0.6);
      });
    }

    function drawComposition(page) {
      var top = 284;
      pdf.roundedRect(page, 28, top, E.width - 56, 82, 18, C.panel, C.borderSoft, 0.8);
      pdf.text(page, 'COMPOSIZIONE', 45, top + 24, 7.5, 'F2', C.blue);
      pdf.textRight(page, 'Giornate registrate: ' + recordedDays, 550, top + 24, 7, 'F1', C.faint);
      [
        { label: 'Lavoro', value: stats.workedDays || 0, color: C.green },
        { label: 'Ferie', value: stats.ferie || 0, color: C.blue },
        { label: 'Malattia', value: stats.malattia || 0, color: C.orange },
        { label: 'Permessi', value: stats.permesso || 0, color: C.purple },
        { label: 'Festivi', value: stats.festivitaPagata || 0, color: C.pink },
        { label: 'Riposo', value: stats.riposo || 0, color: C.slate }
      ].forEach(function (item, index) {
        var x = 45 + (index * 84);
        pdf.dot(page, x, top + 42, 8, item.color);
        pdf.text(page, item.label, x + 13, top + 49, 7, 'F1', C.muted);
        pdf.text(page, String(item.value), x + 13, top + 68, 11, 'F2', C.text);
      });
    }

    function drawContinuationHeader(page) {
      pdf.roundedRect(page, 28, 28, E.width - 56, 70, 19, C.panelStrong, C.border, 1);
      E.drawBrand(pdf, page, 46, 59, 14);
      pdf.text(page, 'DETTAGLIO MENSILE', 135, 52, 7.5, 'F2', C.blue);
      pdf.text(page, formatMonthYear(reportMonth), 135, 75, 16, 'F2', C.text);
      pdf.textRight(page, E.profileName() + '  |  Continuazione', 541, 67, 8, 'F1', C.muted);
    }

    function drawTable(page, pageRows, top, startIndex) {
      var rowHeight = 23;
      var panelHeight = 76 + Math.max(1, pageRows.length) * rowHeight;
      pdf.roundedRect(page, 28, top, E.width - 56, panelHeight, 18, C.panel, C.borderSoft, 0.8);
      pdf.text(page, 'DETTAGLIO GIORNALIERO', 45, top + 24, 7.5, 'F2', C.blue);
      pdf.textRight(page, pageRows.length + (pageRows.length === 1 ? ' riga' : ' righe'), 550, top + 24, 7, 'F1', C.faint);
      pdf.roundedRect(page, 40, top + 35, E.width - 80, 24, 8, C.panelStrong, null, 0);
      [
        ['DATA', 54], ['GG', 96], ['TIPO', 128], ['FASCIA', 274],
        ['LAVORO', 363], ['COPERTO', 429], ['EXTRA', 500]
      ].forEach(function (header) {
        pdf.text(page, header[0], header[1], top + 51, 6.8, 'F2', C.muted);
      });
      if (!pageRows.length) {
        pdf.textCenter(page, 'Nessuna giornata registrata in questo mese', 40, E.width - 80, top + 91, 10, 'F1', C.muted);
        return panelHeight;
      }
      pageRows.forEach(function (row, index) {
        var rowTop = top + 64 + (index * rowHeight);
        if ((startIndex + index) % 2 === 0) pdf.roundedRect(page, 40, rowTop, E.width - 80, rowHeight - 1, 6, C.panelAlt, null, 0);
        pdf.dot(page, 46, rowTop + 8, 6, row.color);
        pdf.text(page, row.date, 56, rowTop + 15, 8, 'F2', C.text);
        pdf.text(page, row.day, 98, rowTop + 15, 8, 'F1', C.muted);
        pdf.text(page, row.type, 128, rowTop + 15, 8, 'F1', C.text);
        pdf.text(page, row.time, 274, rowTop + 15, 7.8, 'F1', C.muted);
        pdf.text(page, row.work, 363, rowTop + 15, 8, 'F2', C.text);
        pdf.text(page, row.cover, 429, rowTop + 15, 8, 'F1', C.muted);
        pdf.text(page, row.extra, 500, rowTop + 15, 8, 'F2', row.extra === '--' ? C.faint : C.purple);
      });
      return panelHeight;
    }

    function drawInsights(page, top) {
      if (top + 86 > 792) return;
      pdf.roundedRect(page, 28, top, E.width - 56, 84, 18, C.panel, C.borderSoft, 0.8);
      pdf.text(page, 'LETTURA RAPIDA', 45, top + 23, 7.5, 'F2', C.blue);
      [
        { label: 'Media per giornata', value: E.duration(averageMinutes), color: C.blue },
        { label: 'Giornata piu lunga', value: longestRow ? (longestRow.date + '  ' + E.duration(longestRow.totalMinutes)) : '--', color: C.green },
        { label: 'Giorni con extra', value: String(extraDays), color: C.purple }
      ].forEach(function (item, index) {
        var x = 45 + (index * 171);
        if (index) pdf.line(page, x - 13, top + 35, x - 13, top + 69, C.borderSoft, 0.7);
        pdf.dot(page, x, top + 43, 8, item.color);
        pdf.text(page, item.label, x + 14, top + 50, 7, 'F1', C.muted);
        pdf.text(page, item.value, x + 14, top + 70, 11, 'F2', C.text);
      });
    }

    var consumed = 0;
    chunks.forEach(function (chunk, index) {
      var page = pdf.createPage();
      if (index === 0) {
        drawHeader(page);
        drawOverview(page);
        drawComposition(page);
        var tableHeight = drawTable(page, chunk, 381, consumed);
        if (chunks.length === 1) drawInsights(page, 381 + tableHeight + 14);
      } else {
        drawContinuationHeader(page);
        drawTable(page, chunk, 113, consumed);
      }
      E.drawFooter(pdf, page, index + 1, chunks.length, 'Report mensile ' + formatMonthYear(reportMonth));
      consumed += chunk.length;
    });
    return pdf.buildBlob({ title: 'GestOre - Report mensile ' + formatMonthYear(reportMonth) });
  }

  window.GestOrePdfReports = window.GestOrePdfReports || {};
  window.GestOrePdfReports.monthly = buildMonthlyReport;
})();
