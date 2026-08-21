(function () {
  'use strict';

  function buildMonthlyReport(date) {
    var E = window.GestOrePdfEngine;
    var C = E.colors;
    var reportMonth = new Date(date.getFullYear(), date.getMonth(), 1);
    var stats = getMonthStats(reportMonth);
    var recordedDays = getRecordedDaysFromStats(stats);
    var entryByDate = {};
    getMonthEntries(reportMonth).forEach(function (pair) {
      entryByDate[pair[0]] = pair[1];
    });

    var daysInMonth = new Date(reportMonth.getFullYear(), reportMonth.getMonth() + 1, 0).getDate();
    var rows = Array.from({ length: daysInMonth }, function (_, index) {
      var current = new Date(reportMonth.getFullYear(), reportMonth.getMonth(), index + 1);
      var key = toISODate(current);
      var entry = entryByDate[key] || null;
      var breakdown = entry ? getBreakdown(entry) : { total: 0, leave: 0, overtime: 0 };
      var typeLabel = '--';
      if (entry) {
        typeLabel = dayTypes[entry.type] ? dayTypes[entry.type].label : entry.type;
        if (entry.type === 'festivita_pagata') {
          var holidayName = getHolidayDisplayName(entry, current);
          if (holidayName) typeLabel = holidayName;
        }
      }
      return {
        date: pad(current.getDate()),
        day: weekNames[mondayIndex(current.getDay())].slice(0, 3).toUpperCase(),
        type: E.truncate(typeLabel, 11),
        time: entry && entry.start && entry.end ? entry.start + '-' + entry.end : '--',
        work: breakdown.total ? E.duration(breakdown.total) : '--',
        delta: breakdown.overtime
          ? '+' + E.duration(breakdown.overtime)
          : (breakdown.leave ? 'C ' + E.duration(breakdown.leave) : '--'),
        totalMinutes: breakdown.total || 0,
        leaveMinutes: breakdown.leave || 0,
        overtimeMinutes: breakdown.overtime || 0,
        recorded: Boolean(entry),
        weekend: current.getDay() === 0 || current.getDay() === 6,
        color: entry && dayTypes[entry.type] && dayTypes[entry.type].dot
          ? dayTypes[entry.type].dot
          : C.slate
      };
    });

    var coveredMinutes = rows.reduce(function (sum, row) { return sum + row.leaveMinutes; }, 0);
    var workedRows = rows.filter(function (row) { return row.totalMinutes > 0; });
    var averageMinutes = workedRows.length ? stats.totalMinutes / workedRows.length : 0;
    var extraDays = rows.filter(function (row) { return row.overtimeMinutes > 0; }).length;
    var totalWorked = Math.max(1, (stats.normalMinutes || 0) + (stats.overtimeMinutes || 0));
    var normalRatio = Math.max(0, Math.min(1, (stats.normalMinutes || 0) / totalWorked));
    var overtimeRatio = Math.max(0, Math.min(1, (stats.overtimeMinutes || 0) / totalWorked));
    var pdf = E.createDocument();
    var page = pdf.createPage();
    var profile = E.profileName();

    function drawHeader() {
      pdf.roundedRect(page, 28, 28, E.width - 56, 116, 24, C.header, null, 0);
      pdf.roundedRect(page, 28, 28, 7, 116, 3.5, C.blue, null, 0);
      E.drawBrand(pdf, page, 50, 58, 15, true);
      pdf.text(page, 'REPORT MENSILE', 50, 84, 7.2, 'F2', C.blue);
      pdf.text(page, formatMonthYear(reportMonth), 50, 122, 27, 'F2', C.textOnDark);
      pdf.textRight(page, 'PROFILO', 540, 54, 6.4, 'F2', C.mutedOnDark);
      pdf.textRight(page, E.truncate(profile, 22), 540, 75, 11, 'F2', C.textOnDark);
      pdf.textRight(page, 'Target ' + formatHourValue(state.settings.dailyTarget) + ' al giorno', 540, 98, 7.2, 'F1', C.mutedOnDark);
      pdf.textRight(page, 'Generato il ' + E.todayLabel(), 540, 118, 7.2, 'F1', C.mutedOnDark);
    }

    function drawMetric(x, width, label, value, meta, color) {
      pdf.roundedRect(page, x, 158, width, 76, 17, C.panel, C.borderSoft, 0.8);
      pdf.roundedRect(page, x + 12, 171, 28, 4, 2, color, null, 0);
      pdf.text(page, label, x + 12, 190, 6.7, 'F2', C.muted);
      pdf.text(page, value, x + 12, 216, value.length > 9 ? 16 : 19, 'F2', C.text);
      if (meta) pdf.textRight(page, meta, x + width - 12, 216, 6.5, 'F1', C.faint);
    }

    function drawOverview() {
      var width = 127.25;
      drawMetric(28, width, 'TOTALE REGISTRATO', E.duration(stats.totalMinutes || 0), recordedDays + ' gg', C.blue);
      drawMetric(165.25, width, 'ORE ORDINARIE', E.duration(stats.normalMinutes || 0), '', C.blueStrong);
      drawMetric(302.5, width, 'STRAORDINARIE', E.duration(stats.overtimeMinutes || 0), extraDays + ' gg', C.purple);
      drawMetric(439.75, width, 'ORE COPERTE', E.duration(coveredMinutes), '', C.green);
    }

    function drawDistribution() {
      var top = 248;
      var leftW = 350;
      var barX = 45;
      var barW = 316;
      pdf.roundedRect(page, 28, top, leftW, 82, 17, C.panel, C.borderSoft, 0.8);
      pdf.text(page, 'DISTRIBUZIONE DEL TEMPO', 45, top + 22, 7.2, 'F2', C.blueStrong);
      pdf.textRight(page, E.duration(stats.totalMinutes || 0), 361, top + 22, 8.5, 'F2', C.text);
      pdf.roundedRect(page, barX, top + 34, barW, 10, 5, C.panelStrong, null, 0);
      var normalW = Math.max(0, barW * normalRatio);
      var overtimeW = Math.max(0, barW * overtimeRatio);
      if (normalW > 0) pdf.roundedRect(page, barX, top + 34, normalW, 10, 5, C.blueStrong, null, 0);
      if (overtimeW > 0) {
        pdf.roundedRect(page, barX + normalW, top + 34, overtimeW, 10, 5, C.purple, null, 0);
      }
      pdf.dot(page, 45, top + 56, 7, C.blueStrong);
      pdf.text(page, 'Ordinarie  ' + Math.round(normalRatio * 100) + '%', 57, top + 63, 7, 'F1', C.muted);
      pdf.dot(page, 153, top + 56, 7, C.purple);
      pdf.text(page, 'Extra  ' + Math.round(overtimeRatio * 100) + '%', 165, top + 63, 7, 'F1', C.muted);
      pdf.dot(page, 246, top + 56, 7, C.green);
      pdf.text(page, 'Coperte  ' + E.duration(coveredMinutes), 258, top + 63, 7, 'F1', C.muted);

      pdf.roundedRect(page, 390, top, 177, 82, 17, C.panel, C.borderSoft, 0.8);
      [
        ['GIORNI REGISTRATI', String(recordedDays), C.blue],
        ['MEDIA LAVORATA', E.duration(averageMinutes), C.green],
        ['GIORNI CON EXTRA', String(extraDays), C.purple]
      ].forEach(function (item, index) {
        var rowTop = top + 10 + (index * 22);
        pdf.dot(page, 404, rowTop + 4, 7, item[2]);
        pdf.text(page, item[0], 417, rowTop + 10, 6.4, 'F2', C.muted);
        pdf.textRight(page, item[1], 552, rowTop + 10, 8.3, 'F2', C.text);
        if (index < 2) pdf.line(page, 404, rowTop + 16, 552, rowTop + 16, C.borderSoft, 0.6);
      });
    }

    function drawColumnHeader(x, top) {
      pdf.text(page, 'DATA', x + 13, top, 6.1, 'F2', C.muted);
      pdf.text(page, 'TIPO', x + 61, top, 6.1, 'F2', C.muted);
      pdf.text(page, 'FASCIA', x + 120, top, 6.1, 'F2', C.muted);
      pdf.text(page, 'ORE', x + 184, top, 6.1, 'F2', C.muted);
      pdf.text(page, '+ / C', x + 220, top, 6.1, 'F2', C.muted);
    }

    function drawDayRow(row, x, top, index) {
      var fill = row.weekend ? C.panelAlt : (index % 2 === 0 ? C.panelSoft : null);
      if (fill) pdf.roundedRect(page, x, top, 249, 20, 6, fill, null, 0);
      pdf.dot(page, x + 5, top + 7, 6, row.recorded ? row.color : C.border);
      pdf.text(page, row.date, x + 15, top + 14, 6.8, 'F2', row.recorded ? C.text : C.faint);
      pdf.text(page, row.day, x + 34, top + 14, 6.3, 'F2', row.weekend ? C.faint : C.muted);
      pdf.text(page, row.type, x + 61, top + 14, 6.6, 'F1', row.recorded ? C.text : C.faint);
      pdf.text(page, row.time, x + 120, top + 14, 6.3, 'F1', row.recorded ? C.muted : C.faint);
      pdf.text(page, row.work, x + 184, top + 14, 6.7, 'F2', row.recorded ? C.text : C.faint);
      pdf.text(page, row.delta, x + 220, top + 14, 6.1, 'F2',
        row.overtimeMinutes ? C.purple : (row.leaveMinutes ? C.green : C.faint));
    }

    function drawDailyRegister() {
      var top = 344;
      pdf.roundedRect(page, 28, top, E.width - 56, 444, 19, C.panel, C.borderSoft, 0.8);
      pdf.text(page, 'REGISTRO DEL MESE', 45, top + 24, 7.3, 'F2', C.blueStrong);
      pdf.text(page, 'Tutti i giorni, inclusi quelli senza registrazione', 146, top + 24, 7, 'F1', C.muted);
      pdf.textRight(page, daysInMonth + ' giorni', 550, top + 24, 7, 'F2', C.faint);
      pdf.line(page, 297.5, top + 39, 297.5, top + 425, C.borderSoft, 0.7);
      drawColumnHeader(42, top + 48);
      drawColumnHeader(304, top + 48);
      pdf.line(page, 42, top + 56, 291, top + 56, C.borderSoft, 0.7);
      pdf.line(page, 304, top + 56, 553, top + 56, C.borderSoft, 0.7);
      rows.slice(0, 16).forEach(function (row, index) {
        drawDayRow(row, 42, top + 64 + (index * 22), index);
      });
      rows.slice(16).forEach(function (row, index) {
        drawDayRow(row, 304, top + 64 + (index * 22), index + 16);
      });
      pdf.text(page, '+ = straordinario', 45, top + 428, 6.2, 'F1', C.faint);
      pdf.text(page, 'C = ore coperte', 127, top + 428, 6.2, 'F1', C.faint);
      pdf.textRight(page, 'Le giornate senza dati restano visibili per completezza', 550, top + 428, 6.2, 'F1', C.faint);
    }

    drawHeader();
    drawOverview();
    drawDistribution();
    drawDailyRegister();
    E.drawFooter(pdf, page, 1, 1, 'Report mensile ' + formatMonthYear(reportMonth));
    return pdf.buildBlob({ title: 'GestOre - Report mensile ' + formatMonthYear(reportMonth) });
  }

  window.GestOrePdfReports = window.GestOrePdfReports || {};
  window.GestOrePdfReports.monthly = buildMonthlyReport;
})();
