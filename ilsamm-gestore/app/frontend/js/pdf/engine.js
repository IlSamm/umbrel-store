(function () {
  'use strict';

  var PAGE_W = 595.28;
  var PAGE_H = 841.89;
  var colors = {
    page: '#050916',
    pageGlow: '#09142d',
    panel: '#0b1429',
    panelStrong: '#101d3b',
    panelSoft: '#111a31',
    panelAlt: '#0d172c',
    border: '#263965',
    borderSoft: '#1a2948',
    text: '#f8fafc',
    muted: '#93a4c3',
    faint: '#60708f',
    blue: '#58b9ff',
    blueStrong: '#5f82ff',
    purple: '#a45cff',
    green: '#27d5a0',
    orange: '#ffad5b',
    pink: '#ff6f91',
    slate: '#71809d'
  };

  function safeText(value) {
    var text = String(value === undefined || value === null ? '' : value);
    try { text = text.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (err) {}
    return text
      .replace(/[\u2013\u2014]/g, '-')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201c\u201d]/g, '"')
      .replace(/[^\x20-\x7e]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function escapeText(value) {
    return safeText(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  }

  function truncate(value, limit) {
    var text = safeText(value);
    return text.length <= limit ? text : text.slice(0, Math.max(1, limit - 3)).trim() + '...';
  }

  function number(value) {
    return (Math.round((Number(value) || 0) * 100) / 100).toFixed(2).replace(/\.00$/, '');
  }

  function colorArray(color) {
    var value = String(color || '#000000').replace('#', '');
    if (value.length === 3) value = value.split('').map(function (part) { return part + part; }).join('');
    if (value.length !== 6) value = '000000';
    return [
      parseInt(value.slice(0, 2), 16) / 255,
      parseInt(value.slice(2, 4), 16) / 255,
      parseInt(value.slice(4, 6), 16) / 255
    ];
  }

  function textWidth(value, size, fontKey) {
    return safeText(value).length * (Number(size) || 10) * (fontKey === 'F2' ? 0.56 : 0.51);
  }

  function createDocument() {
    var pages = [];
    var encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;

    function byteLength(value) {
      return encoder ? encoder.encode(value).length : String(value || '').length;
    }

    function pdfY(top) {
      return number(PAGE_H - top);
    }

    function colorCommand(mode, color) {
      var rgb = colorArray(color);
      return number(rgb[0]) + ' ' + number(rgb[1]) + ' ' + number(rgb[2]) + ' ' + mode;
    }

    function rect(page, x, top, width, height, fill, stroke, lineWidth) {
      var parts = [];
      if (fill) parts.push(colorCommand('rg', fill));
      if (stroke) parts.push(colorCommand('RG', stroke), number(lineWidth || 1) + ' w');
      parts.push(number(x) + ' ' + number(PAGE_H - top - height) + ' ' + number(width) + ' ' + number(height) + ' re ' + (fill && stroke ? 'B' : (fill ? 'f' : 'S')));
      page.commands.push(parts.join('\n'));
    }

    function roundedRect(page, x, top, width, height, radius, fill, stroke, lineWidth) {
      var left = Number(x) || 0;
      var right = left + (Number(width) || 0);
      var topY = PAGE_H - (Number(top) || 0);
      var bottom = topY - (Number(height) || 0);
      var r = Math.max(0, Math.min(Number(radius) || 0, width / 2, height / 2));
      var c = r * 0.5522847498;
      var parts = [];
      if (fill) parts.push(colorCommand('rg', fill));
      if (stroke) parts.push(colorCommand('RG', stroke), number(lineWidth || 1) + ' w');
      parts.push(
        number(left + r) + ' ' + number(bottom) + ' m',
        number(right - r) + ' ' + number(bottom) + ' l',
        number(right - r + c) + ' ' + number(bottom) + ' ' + number(right) + ' ' + number(bottom + r - c) + ' ' + number(right) + ' ' + number(bottom + r) + ' c',
        number(right) + ' ' + number(topY - r) + ' l',
        number(right) + ' ' + number(topY - r + c) + ' ' + number(right - r + c) + ' ' + number(topY) + ' ' + number(right - r) + ' ' + number(topY) + ' c',
        number(left + r) + ' ' + number(topY) + ' l',
        number(left + r - c) + ' ' + number(topY) + ' ' + number(left) + ' ' + number(topY - r + c) + ' ' + number(left) + ' ' + number(topY - r) + ' c',
        number(left) + ' ' + number(bottom + r) + ' l',
        number(left) + ' ' + number(bottom + r - c) + ' ' + number(left + r - c) + ' ' + number(bottom) + ' ' + number(left + r) + ' ' + number(bottom) + ' c',
        'h',
        fill && stroke ? 'B' : (fill ? 'f' : 'S')
      );
      page.commands.push(parts.join('\n'));
    }

    function line(page, x1, top1, x2, top2, color, lineWidth) {
      page.commands.push([
        colorCommand('RG', color || colors.borderSoft),
        number(lineWidth || 1) + ' w',
        number(x1) + ' ' + pdfY(top1) + ' m',
        number(x2) + ' ' + pdfY(top2) + ' l',
        'S'
      ].join('\n'));
    }

    function text(page, value, x, top, size, fontKey, color) {
      var escaped = escapeText(value);
      if (!escaped) return;
      page.commands.push([
        'BT',
        '/' + (fontKey || 'F1') + ' ' + number(size || 10) + ' Tf',
        colorCommand('rg', color || colors.text),
        '1 0 0 1 ' + number(x) + ' ' + pdfY(top) + ' Tm',
        '(' + escaped + ') Tj',
        'ET'
      ].join('\n'));
    }

    function textRight(page, value, right, top, size, fontKey, color) {
      text(page, value, right - textWidth(value, size, fontKey), top, size, fontKey, color);
    }

    function textCenter(page, value, x, width, top, size, fontKey, color) {
      text(page, value, x + Math.max(0, (width - textWidth(value, size, fontKey)) / 2), top, size, fontKey, color);
    }

    function dot(page, x, top, diameter, color) {
      roundedRect(page, x, top, diameter, diameter, diameter / 2, color, null, 0);
    }

    function createPage() {
      var page = { commands: [] };
      pages.push(page);
      rect(page, 0, 0, PAGE_W, PAGE_H, colors.page, null, 0);
      rect(page, 0, 0, PAGE_W, 154, colors.pageGlow, null, 0);
      return page;
    }

    function buildBlob(metadata) {
      var objects = [];
      var kids = pages.map(function (_, index) { return (6 + (index * 2)) + ' 0 R'; });
      objects[0] = '<< /Type /Catalog /Pages 2 0 R >>';
      objects[1] = '<< /Type /Pages /Count ' + pages.length + ' /Kids [' + kids.join(' ') + '] >>';
      objects[2] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
      objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>';
      objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique >>';
      pages.forEach(function (page, index) {
        var pageId = 6 + (index * 2);
        var contentId = pageId + 1;
        var content = page.commands.join('\n');
        objects[pageId - 1] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + number(PAGE_W) + ' ' + number(PAGE_H) + '] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ' + contentId + ' 0 R >>';
        objects[contentId - 1] = '<< /Length ' + byteLength(content) + ' >>\nstream\n' + content + '\nendstream';
      });
      var infoId = objects.length + 1;
      objects.push('<< /Title (' + escapeText(metadata && metadata.title) + ') /Author (GestOre) /Creator (GestOre) >>');
      var parts = ['%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'];
      var offsets = [0];
      var currentOffset = byteLength(parts[0]);
      objects.forEach(function (body, index) {
        offsets[index + 1] = currentOffset;
        var chunk = (index + 1) + ' 0 obj\n' + body + '\nendobj\n';
        parts.push(chunk);
        currentOffset += byteLength(chunk);
      });
      var xrefOffset = currentOffset;
      var xref = 'xref\n0 ' + (objects.length + 1) + '\n0000000000 65535 f \n';
      for (var i = 1; i <= objects.length; i += 1) xref += String(offsets[i] || 0).padStart(10, '0') + ' 00000 n \n';
      var trailer = 'trailer\n<< /Size ' + (objects.length + 1) + ' /Root 1 0 R /Info ' + infoId + ' 0 R >>\nstartxref\n' + xrefOffset + '\n%%EOF';
      return new Blob(parts.concat([xref, trailer]), { type: 'application/pdf' });
    }

    return {
      createPage: createPage,
      rect: rect,
      roundedRect: roundedRect,
      line: line,
      text: text,
      textRight: textRight,
      textCenter: textCenter,
      dot: dot,
      buildBlob: buildBlob
    };
  }

  function todayLabel() {
    var now = new Date();
    return pad(now.getDate()) + '/' + pad(now.getMonth() + 1) + '/' + now.getFullYear();
  }

  function duration(minutes) {
    return formatDuration(Math.max(0, Math.round(Number(minutes) || 0)));
  }

  function profileName() {
    var settings = state && state.settings ? state.settings : {};
    return truncate(String(settings.userName || 'Profilo personale').trim() || 'Profilo personale', 24);
  }

  function drawBrand(pdf, page, x, top, size) {
    var name = safeText((state && state.settings && state.settings.appName) || 'GestOre');
    if (name.toLowerCase() !== 'gestore') {
      pdf.text(page, name, x, top, size, 'F2', colors.text);
      return;
    }
    pdf.text(page, 'Gest', x, top, size, 'F2', colors.text);
    pdf.text(page, 'Ore', x + textWidth('Gest', size, 'F2') - 1, top, size, 'F2', colors.blue);
  }

  function drawFooter(pdf, page, pageIndex, pageCount, reportLabel) {
    pdf.line(page, 28, 805, PAGE_W - 28, 805, colors.borderSoft, 0.8);
    drawBrand(pdf, page, 28, 823, 9);
    pdf.text(page, reportLabel + '  |  Generato il ' + todayLabel(), 78, 823, 7.5, 'F1', colors.faint);
    pdf.textRight(page, 'Pagina ' + pageIndex + ' / ' + pageCount, PAGE_W - 28, 823, 7.5, 'F1', colors.faint);
  }

  function drawMetric(pdf, page, x, top, width, label, value, accent, meta) {
    pdf.roundedRect(page, x, top, width, 70, 16, colors.panelSoft, colors.borderSoft, 0.8);
    pdf.roundedRect(page, x + 12, top + 12, 26, 5, 2.5, accent, null, 0);
    pdf.text(page, String(label).toUpperCase(), x + 12, top + 31, 7.5, 'F2', colors.muted);
    pdf.text(page, value, x + 12, top + 54, String(value).length > 10 ? 16 : 19, 'F2', colors.text);
    if (meta) pdf.textRight(page, meta, x + width - 12, top + 54, 7.5, 'F1', colors.faint);
  }

  window.GestOrePdfEngine = {
    width: PAGE_W,
    height: PAGE_H,
    colors: colors,
    safeText: safeText,
    truncate: truncate,
    textWidth: textWidth,
    createDocument: createDocument,
    duration: duration,
    profileName: profileName,
    todayLabel: todayLabel,
    drawBrand: drawBrand,
    drawFooter: drawFooter,
    drawMetric: drawMetric
  };
})();
