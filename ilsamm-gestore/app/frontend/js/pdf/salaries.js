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

  function photoCount(item) {
    var local = item && Array.isArray(item.photos) ? item.photos.length : 0;
    return Math.max(local, Math.max(0, Number(item && item.photoCount) || 0));
  }

  function buildRows(year) {
    return Array.from({ length: 12 }, function (_, index) {
      var month = index + 1;
      var payslips = (state && Array.isArray(state.payslips) ? state.payslips : []).filter(function (item) {
        return Number(item && item.year) === year && Number(item && item.month) === month;
      });
      var estimate = safeCall(function () { return getPayrollNetEstimateForMonth(year, month); }, null);
      var salaryEstimate = safeCall(function () { return getSalaryEstimateForMonth(year, month); }, null);
      var companies = payslips.map(function (item) { return String(item.company || '').trim(); }).filter(Boolean);
      var notes = payslips.map(function (item) { return String(item.notes || '').trim(); }).filter(Boolean);
      var hourlyRates = payslips.map(function (item) { return parseMoney(item.hourlyRate); }).filter(function (value) { return value > 0; });
      var overtimeRates = payslips.map(function (item) { return parseMoney(item.overtimeRate); }).filter(function (value) { return value > 0; });
      return {
        month: month,
        name: monthNames[index],
        shortName: monthNames[index].slice(0, 3).toUpperCase(),
        payslips: payslips,
        count: payslips.length,
        company: companies.length ? companies[0] : '--',
        gross: payslips.reduce(function (sum, item) { return sum + parseMoney(item.lordo); }, 0),
        net: payslips.reduce(function (sum, item) { return sum + parseMoney(item.netto); }, 0),
        estimatedNet: estimate && estimate.valid ? parseMoney(estimate.estimatedMonthWithOvertimeNet) : 0,
        estimatedGross: salaryEstimate && salaryEstimate.complete ? parseMoney(salaryEstimate.total) : 0,
        estimate: estimate && estimate.valid ? estimate : null,
        photos: payslips.reduce(function (sum, item) { return sum + photoCount(item); }, 0),
        notes: notes.join(' | '),
        hourlyRate: hourlyRates.length ? hourlyRates[hourlyRates.length - 1] : 0,
        overtimeRate: overtimeRates.length ? overtimeRates[overtimeRates.length - 1] : 0
      };
    });
  }

  function drawHeader(E, pdf, page, title, copy, year, current, count) {
    var C = E.colors;
    pdf.roundedRect(page, 28, 28, E.width - 56, 112, 24, C.header, null, 0);
    pdf.roundedRect(page, 28, 28, 7, 112, 3.5, C.green, null, 0);
    E.drawBrand(pdf, page, 50, 57, 15, true);
    pdf.text(page, 'REPORT STIPENDI', 50, 82, 7, 'F2', C.green);
    pdf.text(page, title, 50, 119, title.length > 27 ? 21 : 25, 'F2', C.textOnDark);
    pdf.textRight(page, 'ANNO', 540, 54, 6.3, 'F2', C.mutedOnDark);
    pdf.textRight(page, String(year), 540, 77, 13, 'F2', C.textOnDark);
    pdf.textRight(page, copy, 540, 99, 6.8, 'F1', C.mutedOnDark);
    pdf.textRight(page, 'Pagina ' + current + ' di ' + count, 540, 119, 6.8, 'F1', C.mutedOnDark);
  }

  function buildSalaryReport(date) {
    var E = window.GestOrePdfEngine;
    var C = E.colors;
    var year = (date instanceof Date ? date : new Date()).getFullYear();
    var rows = buildRows(year);
    var payslipCount = rows.reduce(function (sum, row) { return sum + row.count; }, 0);
    var grossTotal = rows.reduce(function (sum, row) { return sum + row.gross; }, 0);
    var netTotal = rows.reduce(function (sum, row) { return sum + row.net; }, 0);
    var estimatedNetTotal = rows.reduce(function (sum, row) { return sum + row.estimatedNet; }, 0);
    var paidMonths = rows.filter(function (row) { return row.net > 0; }).length;
    var averageNet = paidMonths ? netTotal / paidMonths : 0;
    var highestMonth = rows.reduce(function (best, row) {
      return !best || row.net > best.net ? row : best;
    }, null) || rows[0];
    var maxValue = rows.reduce(function (max, row) {
      return Math.max(max, row.net || row.estimatedNet || 0);
    }, 1);
    var latestEstimate = rows.slice().reverse().map(function (row) { return row.estimate; }).filter(Boolean)[0] || null;
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

    function drawSummaryPage() {
      var page = pdf.createPage();
      drawHeader(E, pdf, page, 'Retribuzioni ' + year, 'Cedolini e andamento netto', year, 1, 2);
      drawCompactMetric(page, 28, 'Netto incassato', money(netTotal), paidMonths + ' mesi', C.green);
      drawCompactMetric(page, 165.25, 'Lordo salvato', money(grossTotal), payslipCount + ' cedolini', C.orange);
      drawCompactMetric(page, 302.5, 'Media netta', money(averageNet), 'mensile', C.blue);
      drawCompactMetric(page, 439.75, 'Stime nette', money(estimatedNetTotal), 'disponibili', C.purple);

      pdf.roundedRect(page, 28, 239, E.width - 56, 215, 19, C.panel, C.borderSoft, 0.8);
      pdf.text(page, 'ANDAMENTO MENSILE', 45, 265, 7.4, 'F2', C.green);
      pdf.text(page, 'Verde: netto del cedolino  |  Viola: stima senza cedolino', 45, 284, 6.8, 'F1', C.muted);
      rows.forEach(function (row, index) {
        var x = 51 + (index * 41.8);
        var bottom = 415;
        var value = row.net || row.estimatedNet;
        var height = (value / maxValue) * 96;
        pdf.roundedRect(page, x, bottom - 96, 18, 96, 7, C.panelStrong, null, 0);
        if (height > 0) pdf.roundedRect(page, x, bottom - height, 18, height, 7, row.net ? C.green : C.purple, null, 0);
        pdf.textCenter(page, row.shortName, x - 6, 30, 436, 5.8, 'F2', value ? C.text : C.faint);
      });
      if (highestMonth && highestMonth.net > 0) {
        pdf.roundedRect(page, 393, 253, 158, 42, 12, C.panelSoft, C.borderSoft, 0.6);
        pdf.text(page, 'NETTO PIU ALTO', 407, 270, 6, 'F2', C.muted);
        pdf.text(page, highestMonth.name, 407, 288, 8.5, 'F2', C.text);
        pdf.textRight(page, shortMoney(highestMonth.net), 539, 288, 8.5, 'F2', C.green);
      }

      pdf.roundedRect(page, 28, 468, E.width - 56, 319, 19, C.panel, C.borderSoft, 0.8);
      pdf.text(page, 'REGISTRO RETRIBUTIVO', 45, 494, 7.4, 'F2', C.green);
      pdf.textRight(page, 'Valori reali e stime restano distinti', 550, 494, 6.7, 'F1', C.muted);
      pdf.roundedRect(page, 40, 506, E.width - 80, 25, 8, C.panelStrong, null, 0);
      [
        ['MESE', 51], ['AZIENDA', 111], ['LORDO', 276], ['NETTO', 365], ['STIMA', 452], ['SCOST.', 526]
      ].forEach(function (header) {
        pdf.text(page, header[0], header[1], 523, 6.1, 'F2', C.muted);
      });
      rows.forEach(function (row, index) {
        var top = 537 + (index * 19.1);
        var delta = row.net && row.estimatedNet ? row.net - row.estimatedNet : 0;
        if (index % 2 === 0) pdf.roundedRect(page, 40, top, E.width - 80, 17, 5, C.panelSoft, null, 0);
        pdf.text(page, row.shortName, 51, top + 12, 6.8, 'F2', row.count ? C.text : C.faint);
        pdf.text(page, E.truncate(row.company, 22), 111, top + 12, 6.6, 'F1', row.count ? C.text : C.faint);
        pdf.text(page, row.gross ? shortMoney(row.gross) : '--', 276, top + 12, 6.5, 'F1', row.gross ? C.text : C.faint);
        pdf.text(page, row.net ? shortMoney(row.net) : '--', 365, top + 12, 6.6, 'F2', row.net ? C.green : C.faint);
        pdf.text(page, row.estimatedNet ? shortMoney(row.estimatedNet) : '--', 452, top + 12, 6.4, 'F1', row.estimatedNet ? C.purple : C.faint);
        pdf.textRight(page, delta ? ((delta > 0 ? '+' : '') + Math.round(delta).toLocaleString('it-IT')) : '--', 548, top + 12, 6.4, 'F2', delta > 0 ? C.green : (delta < 0 ? C.pink : C.faint));
      });
      E.drawFooter(pdf, page, 1, 2, 'Report stipendi ' + year);
    }

    function drawDetailPage() {
      var page = pdf.createPage();
      drawHeader(E, pdf, page, 'Dettaglio cedolini', 'Tariffe, allegati e note', year, 2, 2);
      pdf.roundedRect(page, 28, 155, E.width - 56, 110, 19, C.panel, C.borderSoft, 0.8);
      pdf.text(page, 'QUADRO FISCALE CONFIGURATO', 45, 181, 7.4, 'F2', C.purple);
      if (latestEstimate) {
        [
          ['REDDITO LORDO', money(latestEstimate.totalAnnualGross), C.orange],
          ['CONTRIBUTI', money(latestEstimate.annualContributions), C.blue],
          ['IRPEF NETTA', money(latestEstimate.annualNetIrpef), C.purple],
          ['NETTO ANNUO', money(latestEstimate.estimatedAnnualNet), C.green]
        ].forEach(function (item, index) {
          var x = 45 + (index * 127);
          if (index) pdf.line(page, x - 12, 193, x - 12, 249, C.borderSoft, 0.7);
          pdf.roundedRect(page, x, 197, 24, 4, 2, item[2], null, 0);
          pdf.text(page, item[0], x, 219, 5.8, 'F2', C.muted);
          pdf.text(page, item[1], x, 244, item[1].length > 15 ? 9 : 11, 'F2', C.text);
        });
      } else {
        pdf.text(page, 'Nessuna stima fiscale configurata per il ' + year + '.', 45, 219, 10, 'F1', C.muted);
        pdf.text(page, 'I valori dei cedolini restano comunque completi e disponibili qui sotto.', 45, 243, 7.5, 'F1', C.faint);
      }

      pdf.text(page, 'ARCHIVIO DELL\'ANNO', 32, 291, 7.4, 'F2', C.green);
      pdf.textRight(page, payslipCount + ' cedolini  |  ' + rows.reduce(function (sum, row) { return sum + row.photos; }, 0) + ' allegati', 563, 291, 6.8, 'F1', C.muted);
      rows.forEach(function (row, index) {
        var column = index % 2;
        var rowIndex = Math.floor(index / 2);
        var x = column ? 303 : 28;
        var top = 307 + (rowIndex * 78);
        var width = 264;
        pdf.roundedRect(page, x, top, width, 68, 15, C.panel, C.borderSoft, 0.7);
        pdf.roundedRect(page, x + 12, top + 13, 33, 33, 11, row.count ? C.headerSoft : C.panelSoft, null, 0);
        pdf.textCenter(page, row.shortName, x + 12, 33, top + 35, 6.5, 'F2', row.count ? C.green : C.faint);
        pdf.text(page, row.name, x + 55, top + 22, 8.5, 'F2', row.count ? C.text : C.faint);
        pdf.textRight(page, row.net ? money(row.net) : '--', x + width - 12, top + 22, 8.4, 'F2', row.net ? C.green : C.faint);
        pdf.text(page, E.truncate(row.company, 20), x + 55, top + 39, 6.4, 'F1', row.count ? C.muted : C.faint);
        pdf.textRight(page, row.gross ? ('Lordo ' + shortMoney(row.gross)) : 'Nessun cedolino', x + width - 12, top + 39, 6.2, 'F1', row.gross ? C.muted : C.faint);
        var rateText = row.hourlyRate || row.overtimeRate
          ? ('Base ' + (row.hourlyRate ? money(row.hourlyRate) : '--') + '  |  Extra ' + (row.overtimeRate ? money(row.overtimeRate) : '--'))
          : 'Tariffe non indicate';
        pdf.text(page, E.truncate(rateText, 42), x + 12, top + 58, 5.8, 'F1', C.faint);
        pdf.textRight(page, row.photos ? (row.photos + ' foto') : '', x + width - 12, top + 58, 5.8, 'F2', C.blue);
      });

      pdf.roundedRect(page, 28, 782, E.width - 56, 5, 2.5, C.green, null, 0);
      E.drawFooter(pdf, page, 2, 2, 'Report stipendi ' + year);
    }

    drawSummaryPage();
    drawDetailPage();
    return pdf.buildBlob({ title: 'GestOre - Report stipendi ' + year });
  }

  window.GestOrePdfReports = window.GestOrePdfReports || {};
  window.GestOrePdfReports.salaries = buildSalaryReport;
})();
