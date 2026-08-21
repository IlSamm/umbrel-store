(function () {
  'use strict';

  function buildYearlyReport(date) {
    var E = window.GestOrePdfEngine;
    var C = E.colors;
    var reportYear = new Date((date instanceof Date ? date : new Date()).getFullYear(), 0, 1);
    var summaries = getYearMonthSummaries(reportYear);
    var stats = getYearStats(reportYear);
    var rows = summaries.map(function (item) {
      return {
        month: monthNames[item.date.getMonth()],
        shortMonth: monthNames[item.date.getMonth()].slice(0, 3).toUpperCase(),
        normal: item.stats.normalMinutes || 0,
        overtime: item.stats.overtimeMinutes || 0,
        total: item.stats.totalMinutes || 0,
        days: item.recordedDays || 0
      };
    });
    var topMonth = rows.reduce(function (best, row) {
      return !best || row.total > best.total ? row : best;
    }, null) || rows[0];
    var activeMonths = rows.filter(function (row) { return row.total > 0; }).length;
    var recordedDays = rows.reduce(function (sum, row) { return sum + row.days; }, 0);
    var averageActiveMonth = activeMonths ? (stats.totalMinutes || 0) / activeMonths : 0;
    var absences = { ferie: 0, malattia: 0, permessi: 0, festivita: 0 };
    getYearEntries(reportYear).forEach(function (pair) {
      var entry = pair[1];
      var covered = getBreakdown(entry).leave || 0;
      if (!covered) return;
      if (entry.type === 'ferie' || entry.type === 'lavoro_ferie') absences.ferie += covered;
      else if (entry.type === 'malattia') absences.malattia += covered;
      else if (entry.type === 'permesso') absences.permessi += covered;
      else if (entry.type === 'festivita_pagata') absences.festivita += covered;
    });

    var pdf = E.createDocument();
    var page = pdf.createPage();
    var profile = E.profileName();
    var maxTotal = rows.reduce(function (max, row) { return Math.max(max, row.total); }, 1);

    function drawHeader() {
      pdf.roundedRect(page, 28, 28, E.width - 56, 116, 24, C.header, null, 0);
      pdf.roundedRect(page, 28, 28, 7, 116, 3.5, C.purple, null, 0);
      E.drawBrand(pdf, page, 50, 58, 15, true);
      pdf.text(page, 'REPORT ANNUALE', 50, 84, 7.2, 'F2', C.blue);
      pdf.text(page, 'Anno ' + reportYear.getFullYear(), 50, 122, 27, 'F2', C.textOnDark);
      pdf.textRight(page, 'PROFILO', 540, 54, 6.4, 'F2', C.mutedOnDark);
      pdf.textRight(page, E.truncate(profile, 22), 540, 75, 11, 'F2', C.textOnDark);
      pdf.textRight(page, activeMonths + (activeMonths === 1 ? ' mese attivo' : ' mesi attivi'), 540, 98, 7.2, 'F1', C.mutedOnDark);
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
      drawMetric(28, width, 'TOTALE ANNUO', E.duration(stats.totalMinutes || 0), '', C.blue);
      drawMetric(165.25, width, 'ORE ORDINARIE', E.duration(stats.normalMinutes || 0), '', C.blueStrong);
      drawMetric(302.5, width, 'STRAORDINARIE', E.duration(stats.overtimeMinutes || 0), '', C.purple);
      drawMetric(439.75, width, 'GIORNI REGISTRATI', String(recordedDays), activeMonths + '/12 mesi', C.green);
    }

    function drawTrend() {
      var top = 248;
      var chartX = 28;
      var chartW = 350;
      var chartH = 258;
      var barX = chartX + 70;
      var barW = 210;
      pdf.roundedRect(page, chartX, top, chartW, chartH, 19, C.panel, C.borderSoft, 0.8);
      pdf.text(page, 'ANDAMENTO DEI 12 MESI', chartX + 17, top + 24, 7.3, 'F2', C.blueStrong);
      pdf.text(page, 'Ordinarie e straordinarie a confronto', chartX + 17, top + 43, 7, 'F1', C.muted);
      rows.forEach(function (row, index) {
        var rowTop = top + 57 + (index * 14.6);
        var normalW = (row.normal / Math.max(1, maxTotal)) * barW;
        var overtimeW = (row.overtime / Math.max(1, maxTotal)) * barW;
        pdf.text(page, row.shortMonth, chartX + 17, rowTop + 7, 6.6, 'F2', row.total ? C.text : C.faint);
        pdf.roundedRect(page, barX, rowTop + 1, barW, 7, 3.5, C.panelStrong, null, 0);
        if (normalW > 0) pdf.roundedRect(page, barX, rowTop + 1, normalW, 7, 3.5, C.blueStrong, null, 0);
        if (overtimeW > 0) {
          pdf.roundedRect(page, barX + normalW, rowTop + 1, overtimeW, 7, 3.5, C.purple, null, 0);
        }
        pdf.textRight(page, E.duration(row.total), chartX + chartW - 16, rowTop + 8, 6.7, 'F2', row.total ? C.text : C.faint);
      });
      pdf.dot(page, chartX + 17, top + chartH - 23, 7, C.blueStrong);
      pdf.text(page, 'Ordinarie', chartX + 29, top + chartH - 16, 6.8, 'F1', C.muted);
      pdf.dot(page, chartX + 93, top + chartH - 23, 7, C.purple);
      pdf.text(page, 'Straordinarie', chartX + 105, top + chartH - 16, 6.8, 'F1', C.muted);
      pdf.textRight(page, 'Scala sul mese con piu ore', chartX + chartW - 16, top + chartH - 16, 6.4, 'F1', C.faint);
    }

    function drawHighlights() {
      var x = 390;
      var top = 248;
      var width = 177;
      var height = 258;
      pdf.roundedRect(page, x, top, width, height, 19, C.panel, C.borderSoft, 0.8);
      pdf.text(page, 'IN EVIDENZA', x + 15, top + 24, 7.3, 'F2', C.blueStrong);
      pdf.roundedRect(page, x + 13, top + 36, width - 26, 60, 14, C.header, null, 0);
      pdf.text(page, 'MESE PIU FORTE', x + 25, top + 56, 6.4, 'F2', C.mutedOnDark);
      pdf.text(page, topMonth && topMonth.total ? topMonth.month : '--', x + 25, top + 80, 14, 'F2', C.textOnDark);
      pdf.textRight(page, topMonth && topMonth.total ? E.duration(topMonth.total) : '--', x + width - 24, top + 80, 7.2, 'F2', C.blue);
      [
        ['MEDIA / MESE ATTIVO', E.duration(averageActiveMonth), C.blue],
        ['FERIE', E.duration(absences.ferie), C.green],
        ['MALATTIA', E.duration(absences.malattia), C.orange],
        ['PERMESSI', E.duration(absences.permessi), C.purple],
        ['FESTIVI PAGATI', E.duration(absences.festivita), C.pink]
      ].forEach(function (item, index) {
        var rowTop = top + 111 + (index * 26);
        pdf.dot(page, x + 17, rowTop + 2, 7, item[2]);
        pdf.text(page, item[0], x + 31, rowTop + 9, 6.3, 'F2', C.muted);
        pdf.textRight(page, item[1], x + width - 16, rowTop + 9, 7.6, 'F2', C.text);
        if (index < 4) pdf.line(page, x + 16, rowTop + 16, x + width - 16, rowTop + 16, C.borderSoft, 0.6);
      });
    }

    function drawYearTable() {
      var x = 28;
      var top = 520;
      var width = E.width - 56;
      var height = 268;
      pdf.roundedRect(page, x, top, width, height, 19, C.panel, C.borderSoft, 0.8);
      pdf.text(page, 'RIEPILOGO MENSILE', x + 17, top + 24, 7.3, 'F2', C.blueStrong);
      pdf.textRight(page, 'Anno ' + reportYear.getFullYear(), x + width - 17, top + 24, 7, 'F2', C.faint);
      pdf.roundedRect(page, x + 12, top + 35, width - 24, 23, 8, C.panelStrong, null, 0);
      [
        ['MESE', x + 24],
        ['GIORNI', x + 222],
        ['ORDINARIE', x + 307],
        ['EXTRA', x + 399],
        ['TOTALE', x + 481]
      ].forEach(function (header) {
        pdf.text(page, header[0], header[1], top + 50, 6.5, 'F2', C.muted);
      });
      rows.forEach(function (row, index) {
        var rowTop = top + 63 + (index * 14.4);
        if (index % 2 === 0) pdf.roundedRect(page, x + 12, rowTop, width - 24, 14, 4, C.panelSoft, null, 0);
        pdf.text(page, row.month, x + 24, rowTop + 10, 7.2, 'F1', row.total ? C.text : C.faint);
        pdf.text(page, String(row.days), x + 228, rowTop + 10, 7.2, 'F1', row.days ? C.text : C.faint);
        pdf.text(page, E.duration(row.normal), x + 307, rowTop + 10, 7.2, 'F1', row.normal ? C.text : C.faint);
        pdf.text(page, E.duration(row.overtime), x + 399, rowTop + 10, 7.2, 'F1', row.overtime ? C.purple : C.faint);
        pdf.text(page, E.duration(row.total), x + 481, rowTop + 10, 7.2, 'F2', row.total ? C.text : C.faint);
      });
      var totalTop = top + 238;
      pdf.roundedRect(page, x + 12, totalTop, width - 24, 22, 8, C.header, null, 0);
      pdf.text(page, 'TOTALE ANNO', x + 24, totalTop + 15, 7, 'F2', C.textOnDark);
      pdf.text(page, String(recordedDays), x + 228, totalTop + 15, 7, 'F2', C.textOnDark);
      pdf.text(page, E.duration(stats.normalMinutes || 0), x + 307, totalTop + 15, 7, 'F2', C.textOnDark);
      pdf.text(page, E.duration(stats.overtimeMinutes || 0), x + 399, totalTop + 15, 7, 'F2', C.purple);
      pdf.text(page, E.duration(stats.totalMinutes || 0), x + 481, totalTop + 15, 7, 'F2', C.textOnDark);
    }

    drawHeader();
    drawOverview();
    drawTrend();
    drawHighlights();
    drawYearTable();
    E.drawFooter(pdf, page, 1, 1, 'Report annuale ' + reportYear.getFullYear());
    return pdf.buildBlob({ title: 'GestOre - Report annuale ' + reportYear.getFullYear() });
  }

  window.GestOrePdfReports = window.GestOrePdfReports || {};
  window.GestOrePdfReports.yearly = buildYearlyReport;
})();
