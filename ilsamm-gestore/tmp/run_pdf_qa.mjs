import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

globalThis.window = globalThis;
globalThis.state = {
  settings: {
    appName: 'GestOre',
    userName: 'Samuele',
    dailyTarget: 8
  }
};
globalThis.monthNames = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
];
globalThis.weekNames = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
globalThis.dayTypes = {
  lavoro: { label: 'Lavoro', dot: '#10b981' },
  ferie: { label: 'Ferie', dot: '#2f9dff' },
  malattia: { label: 'Malattia', dot: '#f59e42' },
  permesso: { label: 'Permesso', dot: '#7c4dff' },
  festivita_pagata: { label: 'Festivita', dot: '#f45b7a' },
  riposo: { label: 'Riposo', dot: '#8290a6' }
};

globalThis.pad = (value) => String(value).padStart(2, '0');
globalThis.mondayIndex = (day) => (day + 6) % 7;
globalThis.toISODate = (date) => [
  date.getFullYear(),
  pad(date.getMonth() + 1),
  pad(date.getDate())
].join('-');
globalThis.formatDuration = (minutes) => {
  const rounded = Math.max(0, Math.round(Number(minutes) || 0));
  return Math.floor(rounded / 60) + 'h ' + (rounded % 60) + 'm';
};
globalThis.formatHourValue = (hours) => formatDuration((Number(hours) || 0) * 60);
globalThis.formatMonthYear = (date) => monthNames[date.getMonth()] + ' ' + date.getFullYear();
globalThis.getHolidayDisplayName = () => '';

const entries = {};

function setWork(year, month, day, endHour, extraMinutes = 0) {
  const date = new Date(year, month, day);
  if (date.getDay() === 0 || date.getDay() === 6) return false;
  entries[toISODate(date)] = {
    type: 'lavoro',
    start: '08:00',
    end: String(endHour).padStart(2, '0') + ':' + String(extraMinutes).padStart(2, '0'),
    breakHours: 1,
    overtimeHours: 0,
    overtimeManual: false,
    leaveHours: 0,
    quantityHours: 0,
    notes: ''
  };
  return true;
}

for (let month = 0; month < 12; month += 1) {
  const targetDays = 15 + (month % 7);
  let added = 0;
  for (let day = 1; day <= 28 && added < targetDays; day += 1) {
    const extra = (day + month) % 5 === 0 ? 30 : 0;
    if (setWork(2026, month, day, extra ? 18 : 17, extra)) added += 1;
  }
}

entries['2026-07-03'] = { type: 'ferie', start: '', end: '', breakHours: 0, quantityHours: 8, notes: '' };
entries['2026-07-15'] = { type: 'malattia', start: '', end: '', breakHours: 0, quantityHours: 8, notes: '' };
entries['2026-07-24'] = { type: 'permesso', start: '', end: '', breakHours: 0, quantityHours: 4, notes: '' };
entries['2026-04-06'] = { type: 'festivita_pagata', start: '', end: '', breakHours: 0, quantityHours: 8, notes: '' };
entries['2026-12-25'] = { type: 'festivita_pagata', start: '', end: '', breakHours: 0, quantityHours: 8, notes: '' };

globalThis.getEntryForDate = (date) => entries[toISODate(date)] || null;
globalThis.getBreakdown = (entry) => {
  if (!entry) return { total: 0, normal: 0, overtime: 0, leave: 0 };
  if (entry.type !== 'lavoro') {
    return {
      total: 0,
      normal: 0,
      overtime: 0,
      leave: Math.round((Number(entry.quantityHours) || 0) * 60)
    };
  }
  const [startHour, startMinute] = entry.start.split(':').map(Number);
  const [endHour, endMinute] = entry.end.split(':').map(Number);
  const total = Math.max(0, ((endHour * 60 + endMinute) - (startHour * 60 + startMinute)) - ((Number(entry.breakHours) || 0) * 60));
  const normal = Math.min(480, total);
  return { total, normal, overtime: Math.max(0, total - normal), leave: 0 };
};
globalThis.getMonthEntries = (date) => {
  const rows = [];
  const days = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  for (let day = 1; day <= days; day += 1) {
    const current = new Date(date.getFullYear(), date.getMonth(), day);
    const entry = getEntryForDate(current);
    if (entry) rows.push([toISODate(current), entry]);
  }
  return rows;
};
globalThis.getMonthStats = (date) => {
  const result = {
    totalMinutes: 0, normalMinutes: 0, overtimeMinutes: 0, workedDays: 0,
    ferie: 0, malattia: 0, permesso: 0, festivitaPagata: 0, riposo: 0
  };
  getMonthEntries(date).forEach(([, entry]) => {
    const breakdown = getBreakdown(entry);
    result.totalMinutes += breakdown.total;
    result.normalMinutes += breakdown.normal;
    result.overtimeMinutes += breakdown.overtime;
    if (entry.type === 'ferie') result.ferie += 1;
    else if (entry.type === 'malattia') result.malattia += 1;
    else if (entry.type === 'permesso') result.permesso += 1;
    else if (entry.type === 'festivita_pagata') result.festivitaPagata += 1;
    else if (entry.type === 'riposo') result.riposo += 1;
    else if (breakdown.total > 0) result.workedDays += 1;
  });
  return result;
};
globalThis.getRecordedDaysFromStats = (stats) => (
  stats.workedDays + stats.ferie + stats.malattia + stats.permesso + stats.festivitaPagata + stats.riposo
);
globalThis.getYearMonthSummaries = (date) => Array.from({ length: 12 }, (_, month) => {
  const monthDate = new Date(date.getFullYear(), month, 1);
  const stats = getMonthStats(monthDate);
  return { date: monthDate, stats, recordedDays: getRecordedDaysFromStats(stats) };
});
globalThis.getYearStats = (date) => getYearMonthSummaries(date).reduce((result, item) => {
  result.totalMinutes += item.stats.totalMinutes;
  result.normalMinutes += item.stats.normalMinutes;
  result.overtimeMinutes += item.stats.overtimeMinutes;
  result.workedDays += item.stats.workedDays;
  result.ferie += item.stats.ferie;
  result.malattia += item.stats.malattia;
  result.permesso += item.stats.permesso;
  result.festivitaPagata += item.stats.festivitaPagata;
  result.riposo += item.stats.riposo;
  result.recordedDays += item.recordedDays;
  result.monthsWithEntries += item.recordedDays > 0 ? 1 : 0;
  return result;
}, {
  totalMinutes: 0, normalMinutes: 0, overtimeMinutes: 0, workedDays: 0,
  ferie: 0, malattia: 0, permesso: 0, festivitaPagata: 0, riposo: 0,
  recordedDays: 0, monthsWithEntries: 0
});
globalThis.getYearEntries = (date) => Object.entries(entries)
  .filter(([key]) => Number(key.slice(0, 4)) === date.getFullYear())
  .sort((a, b) => a[0].localeCompare(b[0]));

for (const file of [
  'app/frontend/js/pdf/engine.js',
  'app/frontend/js/pdf/monthly.js',
  'app/frontend/js/pdf/yearly.js'
]) {
  vm.runInThisContext(fs.readFileSync(file, 'utf8'), { filename: file });
}

const outputDir = path.resolve('output/pdf');
fs.mkdirSync(outputDir, { recursive: true });
const reports = [
  ['GestOre_Report_Mese_Demo.pdf', GestOrePdfReports.monthly(new Date(2026, 6, 1))],
  ['GestOre_Report_Anno_Demo.pdf', GestOrePdfReports.yearly(new Date(2026, 0, 1))]
];

for (const [filename, blob] of reports) {
  const buffer = Buffer.from(await blob.arrayBuffer());
  if (!buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
    throw new Error(filename + ' non contiene un PDF valido');
  }
  fs.writeFileSync(path.join(outputDir, filename), buffer);
  console.log(filename + ': ' + buffer.length + ' byte');
}
