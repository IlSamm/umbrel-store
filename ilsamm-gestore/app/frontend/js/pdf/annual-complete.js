(function () {
  'use strict';

  function parseMoney(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    var text = String(value === undefined || value === null ? '' : value)
      .replace(/\s/g, '')
      .replace(/EUR/gi, '')
      .replace(/\u20ac/g, '');
    if (!text) return 0;
    if (text.indexOf(',') >= 0) text = text.replace(/\./g, '').replace(',', '.');
    var result = Number(text);
    return Number.isFinite(result) ? result : 0;
  }

  function money(value) {
    return 'EUR ' + parseMoney(value).toLocaleString('it-IT', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function shortMoney(value) {
    return 'EUR ' + Math.round(parseMoney(value)).toLocaleString('it-IT');
  }

  function safeCall(callback, fallback) {
    try {
      var result = callback();
      return result === undefined || result === null ? fallback : result;
    } catch (error) {
      return fallback;
    }
  }

  function getPayslipsForMonth(year, month) {
    return (state && Array.isArray(state.payslips) ? state.payslips : []).filter(function (item) {
      return Number(item && item.year) === Number(year) && Number(item && item.month) === Number(month);
    });
  }

  function getPhotoCount(item) {
    var local = item && Array.isArray(item.photos) ? item.photos.length : 0;
    return Math.max(local, Math.max(0, Number(item && item.photoCount) || 0));
  }

  function buildMonthRows(reportYear) {
    return getYearMonthSummaries(reportYear).map(function (summary) {
      var year = summary.date.getFullYear();
      var month = summary.date.getMonth() + 1;
      var payslips = getPayslipsForMonth(year, month);
      var salaryEstimate = safeCall(function () { return getSalaryEstimateForMonth(year, month); }, null);
      var payrollEstimate = safeCall(function () { return getPayrollNetEstimateForMonth(year, month); }, null);
      var companies = payslips.map(function (item) { return String(item.company || '').trim(); }).filter(Boolean);
      return {
        date: summary.date,
        month: monthNames[summary.date.getMonth()],
        shortMonth: monthNames[summary.date.getMonth()].slice(0, 3).toUpperCase(),
        stats: summary.stats,
        recordedDays: summary.recordedDays || 0,
        payslips: payslips,
        payslipCount: payslips.length,
        grossActual: payslips.reduce(function (sum, item) { return sum + parseMoney(item.lordo); }, 0),
        netActual: payslips.reduce(function (sum, item) { return sum + parseMoney(item.netto); }, 0),
        company: companies.length ? companies[0] : '--',
        photoCount: payslips.reduce(function (sum, item) { return sum + getPhotoCount(item); }, 0),
        estimatedGross: salaryEstimate && salaryEstimate.complete ? parseMoney(salaryEstimate.total) : 0,
        estimatedNet: payrollEstimate && payrollEstimate.valid
          ? parseMoney(payrollEstimate.estimatedMonthWithOvertimeNet)
          : 0,
        payrollEstimate: payrollEstimate && payrollEstimate.valid ? payrollEstimate : null
      };
    });
  }

  function getVacationInfo(year) {
    return safeCall(function () {
      return calculateVacationBalance((state && state.entries) || {}, (state && state.settings) || {}, year);
    }, {
      allowanceDays: 0,
      totalMinutes: 0,
      usedMinutes: 0,
      remainingMinutes: 0,
      usedDays: 0,
      remainingDays: 0,
      percent: 0
    });
  }

  function getVacationDates(reportYear) {
    return getYearEntries(reportYear).filter(function (pair) {
      return pair[1] && (pair[1].type === 'ferie' || pair[1].type === 'lavoro_ferie');
    }).map(function (pair) {
      var parts = String(pair[0]).split('-');
      var entry = pair[1];
      var covered = getBreakdown(entry).leave || 0;
      return {
        key: pair[0],
        label: parts.length === 3 ? parts[2] + '/' + parts[1] + '/' + parts[0] : pair[0],
        minutes: covered,
        note: String(entry.notes || '').trim()
      };
    });
  }

  function drawHeader(E, pdf, page, eyebrow, title, copy, pageNumber, pageCount, accent) {
    var C = E.colors;
    pdf.roundedRect(page, 28, 28, E.width - 56, 112, 24, C.header, null, 0);
    pdf.roundedRect(page, 28, 28, 7, 112, 3.5, accent, null, 0);
    E.drawBrand(pdf, page, 50, 57, 15, true);
    pdf.text(page, eyebrow, 50, 82, 7, 'F2', accent);
    pdf.text(page, title, 50, 119, title.length > 28 ? 21 : 25, 'F2', C.textOnDark);
    pdf.textRight(page, 'PROFILO', 540, 54, 6.3, 'F2', C.mutedOnDark);
    pdf.textRight(page, E.truncate(E.profileName(), 23), 540, 75, 10.5, 'F2', C.textOnDark);
    pdf.textRight(page, E.truncate(copy, 38), 540, 98, 6.8, 'F1', C.mutedOnDark);
    pdf.textRight(page, 'Pagina ' + pageNumber + ' di ' + pageCount, 540, 118, 6.8, 'F1', C.mutedOnDark);
  }

  function buildCompleteYearlyReport(date) {
    var E = window.GestOrePdfEngine;
    var C = E.colors;
    var reportYear = new Date((date instanceof Date ? date : new Date()).getFullYear(), 0, 1);
    var year = reportYear.getFullYear();
    var rows = buildMonthRows(reportYear);
    var stats = getYearStats(reportYear);
    var vacation = getVacationInfo(year);
    var vacationDates = getVacationDates(reportYear);
    var recordedDays = rows.reduce(function (sum, row) { return sum + row.recordedDays; }, 0);
    var activeMonths = rows.filter(function (row) { return row.recordedDays > 0; }).length;
    var savedPayslips = rows.reduce(function (sum, row) { return sum + row.payslipCount; }, 0);
    var grossActual = rows.reduce(function (sum, row) { return sum + row.grossActual; }, 0);
    var netActual = rows.reduce(function (sum, row) { return sum + row.netActual; }, 0);
    var estimatedNet = rows.reduce(function (sum, row) { return sum + row.estimatedNet; }, 0);
    var monthsWithNet = rows.filter(function (row) { return row.netActual > 0; }).length;
    var averageNet = monthsWithNet ? netActual / monthsWithNet : 0;
    var maxMinutes = rows.reduce(function (max, row) { return Math.max(max, row.stats.totalMinutes || 0); }, 1);
    var maxSalary = rows.reduce(function (max, row) {
      return Math.max(max, row.netActual || row.estimatedNet || 0);
    }, 1);
    var latestTaxEstimate = rows.slice().reverse().map(function (row) {
      return row.payrollEstimate;
    }).filter(Boolean)[0] || null;
    var pdf = E.createDocument();

    function drawCompactMetric(page, x, label, value, meta, color) {
      var width = 127.25;
      var fontSize = value.length > 16 ? 11 : (value.length > 13 ? 12.5 : (value.length > 10 ? 14 : 18));
      pdf.roundedRect(page, x, 155, width, 76, 17, C.panel, C.borderSoft, 0.8);
      pdf.roundedRect(page, x + 12, 168, 26, 4, 2, color, null, 0);
      pdf.text(page, String(label).toUpperCase(), x + 12, 190, 6.5, 'F2', C.muted);
      pdf.text(page, value, x + 12, 214, fontSize, 'F2', C.text);
      if (meta) pdf.textRight(page, meta, x + width - 12, 226, 5.8, 'F1', C.faint);
    }

    function drawOverviewPage() {
      var page = pdf.createPage();
      drawHeader(E, pdf, page, 'DOSSIER ANNUALE COMPLETO', 'Anno ' + year, 'Ore, assenze e retribuzioni', 1, 3, C.blue);
      var metricW = 127.25;
      drawCompactMetric(page, 28, 'Ore registrate', E.duration(stats.totalMinutes || 0), activeMonths + '/12 mesi', C.blue);
      drawCompactMetric(page, 165.25, 'Straordinarie', E.duration(stats.overtimeMinutes || 0), 'anno', C.purple);
      drawCompactMetric(page, 302.5, 'Giorni registrati', String(recordedDays), String(stats.workedDays || 0) + ' lavoro', C.green);
      drawCompactMetric(page, 439.75, 'Cedolini', String(savedPayslips), monthsWithNet + ' mesi', C.orange);

      pdf.roundedRect(page, 28, 239, 351, 548, 20, C.panel, C.borderSoft, 0.8);
      pdf.text(page, 'ANDAMENTO ANNUALE', 46, 265, 7.4, 'F2', C.blueStrong);
      pdf.text(page, 'Ore ordinarie ed extra registrate ogni mese', 46, 284, 7, 'F1', C.muted);
      rows.forEach(function (row, index) {
        var top = 302 + (index * 35.5);
        var normalW = ((row.stats.normalMinutes || 0) / maxMinutes) * 212;
        var overtimeW = ((row.stats.overtimeMinutes || 0) / maxMinutes) * 212;
        pdf.text(page, row.shortMonth, 46, top + 14, 6.8, 'F2', row.recordedDays ? C.text : C.faint);
        pdf.roundedRect(page, 91, top + 5, 212, 11, 5.5, C.panelStrong, null, 0);
        if (normalW > 0) pdf.roundedRect(page, 91, top + 5, normalW, 11, 5.5, C.blueStrong, null, 0);
        if (overtimeW > 0) pdf.roundedRect(page, 91 + normalW, top + 5, overtimeW, 11, 5.5, C.purple, null, 0);
        pdf.textRight(page, E.duration(row.stats.totalMinutes || 0), 359, top + 14, 7, 'F2', row.recordedDays ? C.text : C.faint);
        if (index < 11) pdf.line(page, 46, top + 27, 359, top + 27, C.borderSoft, 0.5);
      });
      pdf.dot(page, 46, 752, 7, C.blueStrong);
      pdf.text(page, 'Ordinarie', 58, 759, 6.8, 'F1', C.muted);
      pdf.dot(page, 117, 752, 7, C.purple);
      pdf.text(page, 'Straordinarie', 129, 759, 6.8, 'F1', C.muted);

      pdf.roundedRect(page, 391, 239, 176, 548, 20, C.panel, C.borderSoft, 0.8);
      pdf.text(page, 'QUADRO ECONOMICO', 407, 265, 7.4, 'F2', C.orange);
      pdf.text(page, 'Dati dei cedolini salvati', 407, 284, 6.8, 'F1', C.muted);
      [
        ['NETTO SALVATO', money(netActual), C.green],
        ['LORDO SALVATO', money(grossActual), C.orange],
        ['MEDIA NETTA', money(averageNet), C.blue],
        ['STIMA NETTA', money(estimatedNet), C.purple]
      ].forEach(function (item, index) {
        var top = 304 + (index * 83);
        pdf.roundedRect(page, 405, top, 148, 68, 14, C.panelSoft, C.borderSoft, 0.6);
        pdf.roundedRect(page, 418, top + 13, 26, 4, 2, item[2], null, 0);
        pdf.text(page, item[0], 418, top + 33, 6.2, 'F2', C.muted);
        pdf.text(page, item[1], 418, top + 56, item[1].length > 15 ? 11.5 : 14, 'F2', C.text);
      });
      pdf.text(page, 'FERIE', 407, 654, 7.2, 'F2', C.green);
      pdf.roundedRect(page, 405, 668, 148, 94, 14, C.panelSoft, C.borderSoft, 0.6);
      pdf.text(page, 'UTILIZZATE', 419, 690, 6.1, 'F2', C.muted);
      pdf.text(page, E.duration(vacation.usedMinutes || 0), 419, 714, 15, 'F2', C.text);
      pdf.text(page, (Number(vacation.usedDays) || 0).toLocaleString('it-IT', { maximumFractionDigits: 1 }) + ' giorni', 419, 734, 7, 'F1', C.green);
      pdf.textRight(page, 'Residue', 539, 690, 6.1, 'F2', C.muted);
      pdf.textRight(page, (Number(vacation.remainingDays) || 0).toLocaleString('it-IT', { maximumFractionDigits: 1 }) + ' gg', 539, 714, 8.5, 'F2', C.text);
      E.drawFooter(pdf, page, 1, 3, 'Report annuale completo ' + year);
    }

    function drawAttendancePage() {
      var page = pdf.createPage();
      drawHeader(E, pdf, page, 'PRESENZE E ASSENZE', 'Dettaglio mensile', 'Anno ' + year, 2, 3, C.green);
      pdf.roundedRect(page, 28, 155, E.width - 56, 359, 19, C.panel, C.borderSoft, 0.8);
      pdf.text(page, 'RIEPILOGO DEI 12 MESI', 45, 181, 7.4, 'F2', C.green);
      pdf.textRight(page, 'Le assenze sono espresse in giornate registrate', 550, 181, 6.7, 'F1', C.muted);
      pdf.roundedRect(page, 40, 193, E.width - 80, 25, 8, C.panelStrong, null, 0);
      [
        ['MESE', 52], ['GG', 179], ['ORE', 220], ['EXTRA', 292],
        ['FERIE', 365], ['MAL.', 422], ['PERM.', 476], ['FEST.', 529]
      ].forEach(function (header) {
        pdf.text(page, header[0], header[1], 210, 6.1, 'F2', C.muted);
      });
      rows.forEach(function (row, index) {
        var top = 225 + (index * 22.8);
        if (index % 2 === 0) pdf.roundedRect(page, 40, top, E.width - 80, 20, 5, C.panelSoft, null, 0);
        pdf.text(page, row.month, 52, top + 14, 7, 'F1', row.recordedDays ? C.text : C.faint);
        pdf.text(page, String(row.recordedDays), 181, top + 14, 7, 'F1', row.recordedDays ? C.text : C.faint);
        pdf.text(page, E.duration(row.stats.totalMinutes || 0), 220, top + 14, 7, 'F2', row.stats.totalMinutes ? C.text : C.faint);
        pdf.text(page, E.duration(row.stats.overtimeMinutes || 0), 292, top + 14, 6.8, 'F2', row.stats.overtimeMinutes ? C.purple : C.faint);
        pdf.textCenter(page, String(row.stats.ferie || 0), 358, 42, top + 14, 7, 'F2', row.stats.ferie ? C.green : C.faint);
        pdf.textCenter(page, String(row.stats.malattia || 0), 416, 37, top + 14, 7, 'F2', row.stats.malattia ? C.orange : C.faint);
        pdf.textCenter(page, String(row.stats.permesso || 0), 469, 44, top + 14, 7, 'F2', row.stats.permesso ? C.purple : C.faint);
        pdf.textCenter(page, String(row.stats.festivitaPagata || 0), 522, 40, top + 14, 7, 'F2', row.stats.festivitaPagata ? C.pink : C.faint);
      });

      pdf.roundedRect(page, 28, 528, E.width - 56, 117, 19, C.panel, C.borderSoft, 0.8);
      pdf.text(page, 'SALDO FERIE', 45, 553, 7.4, 'F2', C.green);
      var balanceItems = [
        ['DISPONIBILITA', (Number(vacation.allowanceDays) || 0).toLocaleString('it-IT', { maximumFractionDigits: 1 }) + ' gg', C.blue],
        ['UTILIZZATE', (Number(vacation.usedDays) || 0).toLocaleString('it-IT', { maximumFractionDigits: 1 }) + ' gg', C.green],
        ['RIMANENTI', (Number(vacation.remainingDays) || 0).toLocaleString('it-IT', { maximumFractionDigits: 1 }) + ' gg', C.purple]
      ];
      balanceItems.forEach(function (item, index) {
        var x = 45 + (index * 170);
        if (index) pdf.line(page, x - 12, 568, x - 12, 628, C.borderSoft, 0.7);
        pdf.roundedRect(page, x, 570, 24, 4, 2, item[2], null, 0);
        pdf.text(page, item[0], x, 591, 6.4, 'F2', C.muted);
        pdf.text(page, item[1], x, 620, 17, 'F2', C.text);
      });

      pdf.roundedRect(page, 28, 659, E.width - 56, 128, 19, C.panel, C.borderSoft, 0.8);
      pdf.text(page, 'GIORNI DI FERIE REGISTRATI', 45, 684, 7.4, 'F2', C.green);
      pdf.textRight(page, vacationDates.length + ' registrazioni', 550, 684, 6.8, 'F2', C.faint);
      if (!vacationDates.length) {
        pdf.text(page, 'Nessun giorno di ferie registrato per questo anno.', 45, 726, 10, 'F1', C.muted);
      } else {
        vacationDates.slice(0, 10).forEach(function (item, index) {
          var column = index < 5 ? 0 : 1;
          var rowIndex = index % 5;
          var x = column ? 305 : 45;
          var top = 701 + (rowIndex * 15);
          pdf.dot(page, x, top - 3, 6, C.green);
          pdf.text(page, item.label, x + 12, top + 4, 7, 'F2', C.text);
          pdf.text(page, E.duration(item.minutes || 0), x + 77, top + 4, 6.7, 'F1', C.muted);
          if (item.note) pdf.text(page, E.truncate(item.note, 22), x + 132, top + 4, 6.5, 'F3', C.faint);
        });
        if (vacationDates.length > 10) {
          pdf.textRight(page, '+ ' + (vacationDates.length - 10) + ' altre registrazioni', 550, 778, 6.4, 'F1', C.faint);
        }
      }
      E.drawFooter(pdf, page, 2, 3, 'Report annuale completo ' + year);
    }

    function drawSalaryPage() {
      var page = pdf.createPage();
      drawHeader(E, pdf, page, 'CEDOLINI E STIPENDI', 'Quadro retributivo', 'Valori reali e stime separate', 3, 3, C.orange);
      drawCompactMetric(page, 28, 'Netto salvato', money(netActual), monthsWithNet + ' mesi', C.green);
      drawCompactMetric(page, 165.25, 'Lordo salvato', money(grossActual), savedPayslips + ' file', C.orange);
      drawCompactMetric(page, 302.5, 'Media netta', money(averageNet), 'mensile', C.blue);
      drawCompactMetric(page, 439.75, 'Stima netta', money(estimatedNet), 'configurata', C.purple);

      pdf.roundedRect(page, 28, 239, E.width - 56, 193, 19, C.panel, C.borderSoft, 0.8);
      pdf.text(page, 'ANDAMENTO DEL NETTO', 45, 265, 7.4, 'F2', C.orange);
      pdf.text(page, 'Barra piena: cedolino salvato  |  Tratto viola: stima disponibile', 45, 284, 6.8, 'F1', C.muted);
      rows.forEach(function (row, index) {
        var x = 51 + (index * 41.8);
        var chartBottom = 394;
        var actualH = (row.netActual / maxSalary) * 84;
        var estimateH = (row.estimatedNet / maxSalary) * 84;
        pdf.roundedRect(page, x, chartBottom - 84, 18, 84, 7, C.panelStrong, null, 0);
        if (actualH > 0) pdf.roundedRect(page, x, chartBottom - actualH, 18, actualH, 7, C.green, null, 0);
        if (!actualH && estimateH > 0) pdf.roundedRect(page, x, chartBottom - estimateH, 18, estimateH, 7, C.purple, null, 0);
        pdf.textCenter(page, row.shortMonth, x - 6, 30, 414, 5.8, 'F2', row.netActual || row.estimatedNet ? C.text : C.faint);
      });

      pdf.roundedRect(page, 28, 446, E.width - 56, 266, 19, C.panel, C.borderSoft, 0.8);
      pdf.text(page, 'CEDOLINI MESE PER MESE', 45, 472, 7.4, 'F2', C.orange);
      pdf.roundedRect(page, 40, 484, E.width - 80, 24, 8, C.panelStrong, null, 0);
      [
        ['MESE', 51], ['AZIENDA', 117], ['LORDO', 282], ['NETTO', 371], ['STIMA', 457], ['DELTA', 531]
      ].forEach(function (header) {
        pdf.text(page, header[0], header[1], 500, 6.1, 'F2', C.muted);
      });
      rows.forEach(function (row, index) {
        var top = 513 + (index * 15.4);
        var delta = row.netActual && row.estimatedNet ? row.netActual - row.estimatedNet : 0;
        if (index % 2 === 0) pdf.roundedRect(page, 40, top, E.width - 80, 14, 4, C.panelSoft, null, 0);
        pdf.text(page, row.shortMonth, 51, top + 10, 6.7, 'F2', row.payslipCount ? C.text : C.faint);
        pdf.text(page, E.truncate(row.company, 22), 117, top + 10, 6.6, 'F1', row.payslipCount ? C.text : C.faint);
        pdf.text(page, row.grossActual ? shortMoney(row.grossActual) : '--', 282, top + 10, 6.6, 'F1', row.grossActual ? C.text : C.faint);
        pdf.text(page, row.netActual ? shortMoney(row.netActual) : '--', 371, top + 10, 6.6, 'F2', row.netActual ? C.green : C.faint);
        pdf.text(page, row.estimatedNet ? shortMoney(row.estimatedNet) : '--', 457, top + 10, 6.4, 'F1', row.estimatedNet ? C.purple : C.faint);
        pdf.textRight(page, delta ? ((delta > 0 ? '+' : '') + shortMoney(delta).replace('EUR ', '')) : '--', 549, top + 10, 6.4, 'F2', delta > 0 ? C.green : (delta < 0 ? C.pink : C.faint));
      });

      pdf.roundedRect(page, 28, 726, E.width - 56, 61, 16, C.panel, C.borderSoft, 0.8);
      if (latestTaxEstimate) {
        pdf.text(page, 'ULTIMA STIMA FISCALE CONFIGURATA', 45, 748, 6.5, 'F2', C.purple);
        pdf.text(page, 'Reddito annuo ' + money(latestTaxEstimate.totalAnnualGross), 45, 770, 8, 'F2', C.text);
        pdf.text(page, 'Contributi ' + money(latestTaxEstimate.annualContributions), 244, 770, 7.4, 'F1', C.muted);
        pdf.textRight(page, 'Netto annuo ' + money(latestTaxEstimate.estimatedAnnualNet), 550, 770, 7.4, 'F2', C.green);
      } else {
        pdf.text(page, 'STIME RETRIBUTIVE', 45, 749, 6.5, 'F2', C.purple);
        pdf.text(page, 'Configura la stima stipendio per aggiungere il confronto fiscale.', 45, 771, 8, 'F1', C.muted);
      }
      E.drawFooter(pdf, page, 3, 3, 'Report annuale completo ' + year);
    }

    drawOverviewPage();
    drawAttendancePage();
    drawSalaryPage();
    return pdf.buildBlob({ title: 'GestOre - Report annuale completo ' + year });
  }

  window.GestOrePdfReports = window.GestOrePdfReports || {};
  window.GestOrePdfReports.completeYearly = buildCompleteYearlyReport;
})();
