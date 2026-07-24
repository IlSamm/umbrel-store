function getEditorTimelineSnapshot(draft) {
  var source = draft && typeof draft === 'object' ? draft : {};
  var start = parseTimeToMinutes(normalizeTimeInputValue(source.start || ''));
  var end = parseTimeToMinutes(normalizeTimeInputValue(source.end || ''));
  var hasRange = start !== null && end !== null;
  var grossMinutes = 0;
  if (hasRange) {
    grossMinutes = end - start;
    if (grossMinutes < 0) grossMinutes += 1440;
  }
  var breakdown = getBreakdown(source);
  var breakMinutes = Math.max(0, hoursToMinutes(source.breakHours || 0));
  if (grossMinutes > 0) breakMinutes = Math.min(grossMinutes, breakMinutes);
  var normalMinutes = Math.max(0, Number(breakdown.normal) || 0);
  var overtimeMinutes = Math.max(0, Number(breakdown.overtime) || 0);
  var segmentTotal = normalMinutes + overtimeMinutes + breakMinutes;
  var scale = Math.max(1, grossMinutes, segmentTotal);
  var normalPercent = (normalMinutes / scale) * 100;
  var breakPercent = (breakMinutes / scale) * 100;
  var overtimePercent = (overtimeMinutes / scale) * 100;
  var unfilledPercent = Math.max(0, 100 - normalPercent - breakPercent - overtimePercent);
  return {
    ready: hasRange && grossMinutes > 0,
    startLabel: start === null ? '--:--' : formatClockFromMinutes(start),
    endLabel: end === null ? '--:--' : formatClockFromMinutes(end % 1440),
    workedLabel: breakdown.total > 0 ? formatDuration(breakdown.total) + ' lavorate' : 'Turno da completare',
    normalLabel: normalMinutes > 0 ? formatDuration(normalMinutes) + ' normali' : '0h normali',
    breakLabel: breakMinutes > 0 ? formatDuration(breakMinutes) + ' pausa' : 'Nessuna pausa',
    overtimeLabel: overtimeMinutes > 0 ? formatDuration(overtimeMinutes) + ' extra' : 'Nessun extra',
    normalPercent: normalPercent,
    breakPercent: breakPercent,
    overtimePercent: overtimePercent,
    unfilledPercent: unfilledPercent
  };
}

function applyEditorTimelineSnapshot(root, snapshot) {
  if (!root || !snapshot) return;
  root.classList.toggle('is-incomplete', !snapshot.ready);
  root.style.setProperty('--timeline-normal', snapshot.normalPercent.toFixed(2) + '%');
  root.style.setProperty('--timeline-break', snapshot.breakPercent.toFixed(2) + '%');
  root.style.setProperty('--timeline-extra', snapshot.overtimePercent.toFixed(2) + '%');
  root.style.setProperty('--timeline-unfilled', snapshot.unfilledPercent.toFixed(2) + '%');
  [
    ['editorTimelineHeadline', snapshot.workedLabel],
    ['editorTimelineStart', snapshot.startLabel],
    ['editorTimelineEnd', snapshot.endLabel],
    ['editorTimelineNormal', snapshot.normalLabel],
    ['editorTimelineBreak', snapshot.breakLabel],
    ['editorTimelineExtra', snapshot.overtimeLabel]
  ].forEach(function (pair) {
    var node = document.getElementById(pair[0]);
    if (node) node.textContent = pair[1];
  });
}

function renderEditorTimeline(draft) {
  var snapshot = getEditorTimelineSnapshot(draft);
  var style = '--timeline-normal:' + snapshot.normalPercent.toFixed(2) + '%;' +
    '--timeline-break:' + snapshot.breakPercent.toFixed(2) + '%;' +
    '--timeline-extra:' + snapshot.overtimePercent.toFixed(2) + '%;' +
    '--timeline-unfilled:' + snapshot.unfilledPercent.toFixed(2) + '%;';
  return '<div class="day-editor-timeline' + (snapshot.ready ? '' : ' is-incomplete') + '" id="editorTimeline" style="' + style + '">' +
    '<div class="day-editor-timeline-head"><span>COMPOSIZIONE TURNO</span><strong id="editorTimelineHeadline">' + escapeHtml(snapshot.workedLabel) + '</strong></div>' +
    '<div class="day-editor-timeline-track" aria-label="Composizione visiva della giornata">' +
      '<i class="is-normal"></i><i class="is-break"></i><i class="is-extra"></i><i class="is-unfilled"></i>' +
    '</div>' +
    '<div class="day-editor-timeline-times"><strong id="editorTimelineStart">' + snapshot.startLabel + '</strong><span>entrata</span><span>uscita</span><strong id="editorTimelineEnd">' + snapshot.endLabel + '</strong></div>' +
    '<div class="day-editor-timeline-legend">' +
      '<span><i class="is-normal"></i><b id="editorTimelineNormal">' + escapeHtml(snapshot.normalLabel) + '</b></span>' +
      '<span><i class="is-break"></i><b id="editorTimelineBreak">' + escapeHtml(snapshot.breakLabel) + '</b></span>' +
      '<span><i class="is-extra"></i><b id="editorTimelineExtra">' + escapeHtml(snapshot.overtimeLabel) + '</b></span>' +
    '</div>' +
  '</div>';
}

function updateEditorTimelineUI() {
  if (!state || !state.draft) return;
  applyEditorTimelineSnapshot(document.getElementById('editorTimeline'), getEditorTimelineSnapshot(state.draft));
}

function getStatsDetailRows(startKey, endKey) {
  var start = parseLocalDateKey(startKey);
  var end = parseLocalDateKey(endKey || startKey);
  if (!start || !end) return [];
  if (end < start) {
    var swap = start;
    start = end;
    end = swap;
  }
  var rows = [];
  var cursor = new Date(start);
  while (cursor <= end) {
    var key = toISODate(cursor);
    var entry = getEntryForDate(cursor);
    if (entry) {
      rows.push({
        key: key,
        date: new Date(cursor),
        entry: entry,
        breakdown: getBreakdown(entry)
      });
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return rows;
}

function formatStatsDetailTitleDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  var text = new Intl.DateTimeFormat('it-IT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(date);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function openStatsDayDetail(key) {
  var date = parseLocalDateKey(key);
  if (!date) return;
  state.statsDetail = {
    kind: 'day',
    startKey: key,
    endKey: key,
    title: formatStatsDetailTitleDate(date),
    kicker: 'DETTAGLIO GIORNATA'
  };
  render();
}

function openStatsPeriodDetail(startKey, endKey, title) {
  var start = parseLocalDateKey(startKey);
  var end = parseLocalDateKey(endKey);
  if (!start || !end) return;
  state.statsDetail = {
    kind: 'period',
    startKey: startKey,
    endKey: endKey,
    title: String(title || 'Dettaglio periodo'),
    kicker: 'DETTAGLIO SETTIMANA'
  };
  render();
}

function openStatsMonthDetail(monthKey) {
  var match = String(monthKey || '').match(/^(\d{4})-(\d{2})$/);
  if (!match) return;
  var year = Number(match[1]);
  var month = Number(match[2]) - 1;
  var start = new Date(year, month, 1);
  var end = new Date(year, month + 1, 0);
  state.statsDetail = {
    kind: 'month',
    startKey: toISODate(start),
    endKey: toISODate(end),
    title: formatMonthYear(start),
    kicker: 'DETTAGLIO MESE'
  };
  render();
}

function closeStatsDetail() {
  state.statsDetail = null;
  render();
}

function getStatsDetailRowValue(item) {
  if (!item || !item.entry) return '--';
  if (item.breakdown.total > 0) return formatDuration(item.breakdown.total);
  if (item.breakdown.covered > 0) return formatDuration(item.breakdown.covered);
  return item.entry.type === 'riposo' ? 'Riposo' : '--';
}

function getStatsDetailRowSubtitle(item) {
  if (!item || !item.entry) return '';
  var entry = item.entry;
  if (entry.start && entry.end) {
    return entry.start + ' - ' + entry.end + (Number(entry.breakHours) > 0 ? (' - pausa ' + formatDuration(hoursToMinutes(entry.breakHours))) : '');
  }
  var type = dayTypes[entry.type] || { label: 'Giornata' };
  return type.label;
}

function renderStatsInsightOverlay() {
  var detail = state && state.statsDetail;
  if (!detail) return '';
  var rows = getStatsDetailRows(detail.startKey, detail.endKey);
  var totals = rows.reduce(function (result, item) {
    result.total += item.breakdown.total;
    result.normal += item.breakdown.normal;
    result.overtime += item.breakdown.overtime;
    result.covered += item.breakdown.covered;
    return result;
  }, { total: 0, normal: 0, overtime: 0, covered: 0 });
  var list = rows.map(function (item) {
    var type = dayTypes[item.entry.type] || { label: 'Giornata', dot: '#71809e' };
    var weekday = new Intl.DateTimeFormat('it-IT', { weekday: 'short' }).format(item.date).replace('.', '').toUpperCase();
    var month = new Intl.DateTimeFormat('it-IT', { month: 'short' }).format(item.date).replace('.', '').toUpperCase();
    return '<button class="stats-detail-row" data-stats-open-date="' + item.key + '">' +
      '<span class="stats-detail-date"><small>' + escapeHtml(weekday) + '</small><strong>' + item.date.getDate() + '</strong><em>' + escapeHtml(month) + '</em></span>' +
      '<span class="stats-detail-type" style="--stats-detail-color:' + escapeHtml(type.dot || '#71809e') + '"><i>' + typeIconSvg(item.entry.type) + '</i><span><strong>' + escapeHtml(type.label) + '</strong><small>' + escapeHtml(getStatsDetailRowSubtitle(item)) + '</small></span></span>' +
      '<span class="stats-detail-value"><strong>' + escapeHtml(getStatsDetailRowValue(item)) + '</strong>' + icons.right + '</span>' +
    '</button>';
  }).join('');
  var empty = '<div class="stats-detail-empty"><span>' + icons.activity + '</span><strong>Nessun dato in questo periodo</strong><small>Le giornate registrate compariranno qui.</small></div>';
  var subtitle = rows.length === 1 ? '1 giornata registrata' : rows.length + ' giornate registrate';
  return '<div class="stats-detail-overlay" role="dialog" aria-modal="true" aria-labelledby="statsDetailTitle">' +
    '<button class="stats-detail-backdrop" data-close-stats-detail="1" aria-label="Chiudi dettaglio"></button>' +
    '<section class="stats-detail-dialog">' +
      '<header><div><small>' + escapeHtml(detail.kicker || 'DETTAGLIO') + '</small><h2 id="statsDetailTitle">' + escapeHtml(detail.title || 'Statistiche') + '</h2><p>' + subtitle + '</p></div><button data-close-stats-detail="1" aria-label="Chiudi">' + icons.x + '</button></header>' +
      '<div class="stats-detail-metrics">' +
        '<div><span>Totale</span><strong>' + (totals.total ? formatDuration(totals.total) : '--') + '</strong></div>' +
        '<div><span>Normali</span><strong>' + (totals.normal ? formatDuration(totals.normal) : '--') + '</strong></div>' +
        '<div><span>Extra</span><strong>' + (totals.overtime ? formatDuration(totals.overtime) : '--') + '</strong></div>' +
      '</div>' +
      '<div class="stats-detail-list">' + (list || empty) + '</div>' +
    '</section>' +
  '</div>';
}

if (typeof state !== 'undefined') state.statsDetail = null;
