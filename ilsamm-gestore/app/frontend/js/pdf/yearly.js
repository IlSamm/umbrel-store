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
        normal: item.stats.normalMinutes || 0,
        overtime: item.stats.overtimeMinutes || 0,
        total: item.stats.totalMinutes || 0,
        days: item.recordedDays || 0
      };
    });
    var topMonth = rows.reduce(function (best, row) { return !best || row.total > best.total ? row : best; }, null) || rows[0];
    var activeMonths = rows.filter(function (row) { return row.total > 0; }).length;
    var absences = { ferie: 0, malattia: 0, festivita: 0 };
    getYearEntries(reportYear).forEach(function (pair) {
      var entry = pair[1];
      var covered = getBreakdown(entry).leave || 0;
      if (!covered) return;
      if (entry.type === 'ferie' || entry.type === 'lavoro_ferie') absences.ferie += covered;
      else if (entry.type === 'malattia') absences.malattia += covered;
      else if (entry.type === 'festivita_pagata') absences.festivita += covered;
    });
    var recordedDays = rows.reduce(function (sum, row) { return sum + row.days; }, 0);
    var pdf = E.createDocument();
    var page = pdf.createPage();
    var profile = E.profileName();
    var initial = String(profile || 'P').charAt(0).toUpperCase();

    pdf.roundedRect(page, 28, 28, E.width - 56, 118, 24, C.panelStrong, C.border, 1.1);
    E.drawBrand(pdf, page, 48, 61, 16);
    pdf.text(page, 'REPORT ANNUALE', 48, 87, 7.5, 'F2', C.blue);
    pdf.text(page, 'Anno ' + reportYear.getFullYear(), 48, 125, 27, 'F2', C.text);
    pdf.roundedRect(page, 382, 47, 160, 80, 18, C.panelSoft, C.borderSoft, 0.8);
    pdf.roundedRect(page, 397, 61, 31, 31, 11, C.purple, null, 0);
    pdf.textCenter(page, initial, 397, 31, 82, 12, 'F2', C.text);
    pdf.text(page, 'PROFILO', 440, 67, 6.5, 'F2', C.muted);
    pdf.text(page, E.truncate(profile, 16), 440, 84, 10, 'F2', C.text);
    pdf.text(page, 'Generato ' + E.todayLabel(), 397, 108, 7, 'F1', C.muted);
    pdf.textRight(page, activeMonths + (activeMonths === 1 ? ' mese attivo' : ' mesi attivi'), 527, 108, 7, 'F1', C.muted);

    var overviewTop = 160;
    pdf.roundedRect(page, 28, overviewTop, 263, 110, 20, C.panel, C.borderSoft, 0.8);
    pdf.roundedRect(page, 46, overviewTop + 16, 34, 5, 2.5, C.blue, null, 0);
    pdf.text(page, 'TOTALE DELL ANNO', 46, overviewTop + 40, 7.5, 'F2', C.muted);
    pdf.text(page, E.duration(stats.totalMinutes || 0), 46, overviewTop + 77, 30, 'F2', C.text);
    pdf.text(page, recordedDays + (recordedDays === 1 ? ' giornata registrata' : ' giornate registrate'), 46, overviewTop + 98, 8, 'F1', C.muted);

    pdf.roundedRect(page, 300, overviewTop, 267, 110, 20, C.panel, C.borderSoft, 0.8);
    [
      { label: 'Ordinarie', value: E.duration(stats.normalMinutes || 0), color: C.blueStrong },
      { label: 'Straordinarie', value: E.duration(stats.overtimeMinutes || 0), color: C.purple },
      { label: 'Media mensile', value: E.duration((stats.totalMinutes || 0) / 12), color: C.green }
    ].forEach(function (item, index) {
      var rowTop = overviewTop + 13 + (index * 32);
      pdf.dot(page, 317, rowTop + 7, 8, item.color);
      pdf.text(page, item.label, 332, rowTop + 14, 8, 'F1', C.muted);
      pdf.textRight(page, item.value, 549, rowTop + 14, 10, 'F2', C.text);
      if (index < 2) pdf.line(page, 317, rowTop + 23, 549, rowTop + 23, C.borderSoft, 0.6);
    });

    var chartX = 28;
    var chartTop = 284;
    var chartW = 348;
    var chartH = 218;
    var maxTotal = rows.reduce(function (max, row) { return Math.max(max, row.total); }, 1);
    pdf.roundedRect(page, chartX, chartTop, chartW, chartH, 20, C.panel, C.borderSoft, 0.8);
    pdf.text(page, 'ANDAMENTO MENSILE', chartX + 17, chartTop + 24, 7.5, 'F2', C.blue);
    pdf.text(page, 'Distribuzione di ordinarie e straordinarie', chartX + 17, chartTop + 42, 8, 'F1', C.muted);
    rows.forEach(function (row, index) {
      var rowTop = chartTop + 54 + (index * 11.6);
      var barX = chartX + 82;
      var barW = 198;
      var normalW = (row.normal / Math.max(1, maxTotal)) * barW;
      var overtimeW = (row.overtime / Math.max(1, maxTotal)) * barW;
      pdf.text(page, row.month.slice(0, 3).toUpperCase(), chartX + 17, rowTop + 8, 6.8, 'F2', C.muted);
      pdf.roundedRect(page, barX, rowTop + 2, barW, 6, 3, C.panelStrong, null, 0);
      if (normalW > 0) pdf.roundedRect(page, barX, rowTop + 2, normalW, 6, 3, C.blueStrong, null, 0);
      if (overtimeW > 0) pdf.roundedRect(page, barX + normalW, rowTop + 2, overtimeW, 6, 3, C.purple, null, 0);
      pdf.textRight(page, E.duration(row.total), chartX + chartW - 16, rowTop + 9, 7.2, 'F2', row.total ? C.text : C.faint);
    });
    pdf.dot(page, chartX + 17, chartTop + chartH - 17, 7, C.blueStrong);
    pdf.text(page, 'Ordinarie', chartX + 29, chartTop + chartH - 10, 7, 'F1', C.muted);
    pdf.dot(page, chartX + 96, chartTop + chartH - 17, 7, C.purple);
    pdf.text(page, 'Straordinarie', chartX + 108, chartTop + chartH - 10, 7, 'F1', C.muted);

    var insightX = 386;
    var insightW = E.width - 28 - insightX;
    pdf.roundedRect(page, insightX, chartTop, insightW, chartH, 20, C.panel, C.borderSoft, 0.8);
    pdf.text(page, 'IN EVIDENZA', insightX + 16, chartTop + 24, 7.5, 'F2', C.blue);
    pdf.roundedRect(page, insightX + 12, chartTop + 36, insightW - 24, 55, 14, C.panelStrong, null, 0);
    pdf.text(page, 'Mese migliore', insightX + 24, chartTop + 55, 7.5, 'F1', C.muted);
    pdf.text(page, topMonth.month, insightX + 24, chartTop + 75, 13, 'F2', C.text);
    pdf.textRight(page, E.duration(topMonth.total), insightX + insightW - 22, chartTop + 75, 8, 'F2', C.blue);
    [
      { label: 'Mesi attivi', value: String(activeMonths), color: C.blue },
      { label: 'Ferie', value: E.duration(absences.ferie), color: C.green },
      { label: 'Malattia', value: E.duration(absences.malattia), color: C.orange },
      { label: 'Festivi pagati', value: E.duration(absences.festivita), color: C.pink }
    ].forEach(function (item, index) {
      var rowTop = chartTop + 105 + (index * 25);
      pdf.dot(page, insightX + 17, rowTop + 4, 7, item.color);
      pdf.text(page, item.label, insightX + 31, rowTop + 11, 7.3, 'F1', C.muted);
      pdf.textRight(page, item.value, insightX + insightW - 16, rowTop + 11, 8, 'F2', C.text);
      if (index < 3) pdf.line(page, insightX + 16, rowTop + 18, insightX + insightW - 16, rowTop + 18, C.borderSoft, 0.6);
    });

    var tableX = 28;
    var tableTop = 516;
    var tableW = E.width - 56;
    var tableH = 272;
    pdf.roundedRect(page, tableX, tableTop, tableW, tableH, 20, C.panel, C.borderSoft, 0.8);
    pdf.text(page, 'RIEPILOGO DEI 12 MESI', tableX + 17, tableTop + 24, 7.5, 'F2', C.blue);
    pdf.textRight(page, recordedDays + (recordedDays === 1 ? ' giornata' : ' giornate'), tableX + tableW - 17, tableTop + 24, 7, 'F1', C.faint);
    pdf.roundedRect(page, tableX + 12, tableTop + 35, tableW - 24, 23, 8, C.panelStrong, null, 0);
    [
      ['MESE', tableX + 24], ['GIORNI', tableX + 224], ['ORDINARIE', tableX + 310],
      ['EXTRA', tableX + 401], ['TOTALE', tableX + 481]
    ].forEach(function (header) { pdf.text(page, header[0], header[1], tableTop + 50, 6.8, 'F2', C.muted); });
    rows.forEach(function (row, index) {
      var rowTop = tableTop + 62 + (index * 14.3);
      if (index % 2 === 0) pdf.roundedRect(page, tableX + 12, rowTop, tableW - 24, 14, 4, C.panelAlt, null, 0);
      pdf.text(page, row.month, tableX + 24, rowTop + 10, 7.4, 'F1', C.text);
      pdf.text(page, String(row.days), tableX + 229, rowTop + 10, 7.4, 'F1', C.muted);
      pdf.text(page, E.duration(row.normal), tableX + 310, rowTop + 10, 7.4, 'F1', C.text);
      pdf.text(page, E.duration(row.overtime), tableX + 401, rowTop + 10, 7.4, 'F1', row.overtime ? C.purple : C.faint);
      pdf.text(page, E.duration(row.total), tableX + 481, rowTop + 10, 7.4, 'F2', row.total ? C.text : C.faint);
    });
    var totalTop = tableTop + 237;
    pdf.roundedRect(page, tableX + 12, totalTop, tableW - 24, 25, 9, C.panelStrong, C.border, 0.7);
    pdf.text(page, 'TOTALE ANNO', tableX + 24, totalTop + 17, 7.5, 'F2', C.blue);
    pdf.text(page, String(recordedDays), tableX + 229, totalTop + 17, 7.5, 'F2', C.text);
    pdf.text(page, E.duration(stats.normalMinutes || 0), tableX + 310, totalTop + 17, 7.5, 'F2', C.text);
    pdf.text(page, E.duration(stats.overtimeMinutes || 0), tableX + 401, totalTop + 17, 7.5, 'F2', C.purple);
    pdf.text(page, E.duration(stats.totalMinutes || 0), tableX + 481, totalTop + 17, 7.5, 'F2', C.text);

    E.drawFooter(pdf, page, 1, 1, 'Report annuale ' + reportYear.getFullYear());
    return pdf.buildBlob({ title: 'GestOre - Report annuale ' + reportYear.getFullYear() });
  }

  window.GestOrePdfReports = window.GestOrePdfReports || {};
  window.GestOrePdfReports.yearly = buildYearlyReport;
})();
