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
          type: E.truncate(typeLabel, 22),
          time: entry.start && entry.end ? entry.start + '-' + entry.end : '--',
          work: breakdown.total ? E.duration(breakdown.total) : '--',
          cover: breakdown.leave ? E.duration(breakdown.leave) : '--',
          extra: breakdown.overtime ? E.duration(breakdown.overtime) : '--',
          color: dayTypes[entry.type] && dayTypes[entry.type].dot ? dayTypes[entry.type].dot : C.slate
        };
      });
    var pdf = E.createDocument();
    var chunks = [];
    var firstCapacity = 18;
    var continuationCapacity = 28;
    if (!rows.length) chunks.push([]);
    else {
      chunks.push(rows.slice(0, firstCapacity));
      for (var offset = firstCapacity; offset < rows.length; offset += continuationCapacity) {
        chunks.push(rows.slice(offset, offset + continuationCapacity));
      }
    }

    function drawHeader(page) {
      pdf.roundedRect(page, 28, 28, E.width - 56, 110, 22, C.panelStrong, C.border, 1.1);
      pdf.text(page, 'REPORT MENSILE', 48, 57, 8, 'F2', C.blue);
      E.drawBrand(pdf, page, 48, 80, 15);
      pdf.text(page, formatMonthYear(reportMonth), 48, 116, 25, 'F2', C.text);
      pdf.roundedRect(page, 417, 48, 126, 30, 15, C.panelSoft, C.borderSoft, 0.8);
      pdf.dot(page, 430, 58, 9, C.green);
      pdf.text(page, 'Generato ' + E.todayLabel(), 446, 68, 8, 'F1', C.muted);
      pdf.textRight(page, 'Target ' + formatHourValue(state.settings.dailyTarget) + '/giorno', 541, 110, 8, 'F1', C.muted);
    }

    function drawSummary(page) {
      var gap = 9;
      var cardWidth = (E.width - 56 - (gap * 3)) / 4;
      [
        { label: 'Ore totali', value: E.duration(stats.totalMinutes), color: C.blue },
        { label: 'Ordinarie', value: E.duration(stats.normalMinutes), color: C.blueStrong },
        { label: 'Straordinarie', value: E.duration(stats.overtimeMinutes), color: C.purple },
        { label: 'Giorni segnati', value: String(recordedDays), color: C.green }
      ].forEach(function (metric, index) {
        E.drawMetric(pdf, page, 28 + (index * (cardWidth + gap)), 151, cardWidth, metric.label, metric.value, metric.color);
      });
      pdf.roundedRect(page, 28, 234, E.width - 56, 72, 18, C.panel, C.borderSoft, 0.8);
      pdf.text(page, 'COMPOSIZIONE DEL MESE', 45, 257, 8, 'F2', C.muted);
      [
        { label: 'Lavoro', value: stats.workedDays || 0, color: C.green },
        { label: 'Ferie', value: stats.ferie || 0, color: C.blue },
        { label: 'Malattia', value: stats.malattia || 0, color: C.orange },
        { label: 'Permessi', value: stats.permesso || 0, color: C.purple },
        { label: 'Festivi', value: stats.festivitaPagata || 0, color: C.pink },
        { label: 'Riposo', value: stats.riposo || 0, color: C.slate }
      ].forEach(function (item, index) {
        var x = 45 + (index * 84);
        pdf.dot(page, x, 274, 7, item.color);
        pdf.text(page, item.label, x + 12, 282, 7.5, 'F1', C.muted);
        pdf.text(page, String(item.value), x + 12, 298, 10, 'F2', C.text);
      });
    }

    function drawContinuationHeader(page) {
      pdf.roundedRect(page, 28, 28, E.width - 56, 70, 19, C.panelStrong, C.border, 1);
      E.drawBrand(pdf, page, 46, 59, 14);
      pdf.text(page, 'DETTAGLIO MENSILE', 135, 52, 7.5, 'F2', C.blue);
      pdf.text(page, formatMonthYear(reportMonth), 135, 75, 16, 'F2', C.text);
      pdf.textRight(page, 'Continuazione', 541, 67, 8, 'F1', C.muted);
    }

    function drawTable(page, pageRows, top, startIndex) {
      var rowHeight = 21;
      var panelHeight = 78 + Math.max(1, pageRows.length) * rowHeight;
      pdf.roundedRect(page, 28, top, E.width - 56, panelHeight, 18, C.panel, C.borderSoft, 0.8);
      pdf.text(page, 'DETTAGLIO GIORNALIERO', 45, top + 25, 8, 'F2', C.blue);
      pdf.textRight(page, pageRows.length + ' giorni in questa pagina', 550, top + 25, 7.5, 'F1', C.faint);
      pdf.roundedRect(page, 40, top + 36, E.width - 80, 24, 8, C.panelStrong, null, 0);
      [
        ['DATA', 54], ['GG', 96], ['TIPO', 128], ['FASCIA', 278],
        ['LAVORO', 370], ['COPERTO', 436], ['EXTRA', 505]
      ].forEach(function (header) {
        pdf.text(page, header[0], header[1], top + 52, 7, 'F2', C.muted);
      });
      if (!pageRows.length) {
        pdf.textCenter(page, 'Nessuna giornata registrata in questo mese', 40, E.width - 80, top + 91, 10, 'F1', C.muted);
        return;
      }
      pageRows.forEach(function (row, index) {
        var rowTop = top + 66 + (index * rowHeight);
        if ((startIndex + index) % 2 === 0) pdf.roundedRect(page, 40, rowTop, E.width - 80, rowHeight - 1, 5, C.panelAlt, null, 0);
        pdf.dot(page, 46, rowTop + 7, 6, row.color);
        pdf.text(page, row.date, 56, rowTop + 14, 8, 'F2', C.text);
        pdf.text(page, row.day, 98, rowTop + 14, 8, 'F1', C.muted);
        pdf.text(page, row.type, 128, rowTop + 14, 8, 'F1', C.text);
        pdf.text(page, row.time, 278, rowTop + 14, 8, 'F1', C.muted);
        pdf.text(page, row.work, 370, rowTop + 14, 8, 'F2', C.text);
        pdf.text(page, row.cover, 436, rowTop + 14, 8, 'F1', C.muted);
        pdf.text(page, row.extra, 505, rowTop + 14, 8, 'F2', row.extra === '--' ? C.faint : C.purple);
      });
    }

    var consumed = 0;
    chunks.forEach(function (chunk, index) {
      var page = pdf.createPage();
      if (index === 0) {
        drawHeader(page);
        drawSummary(page);
        drawTable(page, chunk, 321, consumed);
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
