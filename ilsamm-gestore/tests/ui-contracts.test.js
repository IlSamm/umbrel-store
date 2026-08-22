const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('un nuovo profilo usa una stima vuota senza cambiare i valori di riferimento fiscali', () => {
  const payroll = require('../app/frontend/js/payroll/payroll-types.js');
  assert.equal(payroll.EMPTY_PAYROLL_INPUT.baseMonthlyGross, 0);
  assert.equal(payroll.EMPTY_PAYROLL_INPUT.employeeContributionRate, 0);
  assert.equal(payroll.EMPTY_PAYROLL_INPUT.region, '');
  assert.equal(payroll.DEFAULT_PAYROLL_INPUT.baseMonthlyGross, 1766);
  assert.equal(payroll.DEFAULT_PAYROLL_INPUT.salaryMonths, 14);
});

test('lo zoom del documento e isolato dal resto dell app', () => {
  const index = read('app/frontend/index.html');
  const views = read('app/frontend/js/views.js');
  const zoomGuard = read('app/frontend/js/zoom-guard.js');
  assert.match(index, /maximum-scale=1, user-scalable=no/);
  assert.match(index, /js\/zoom-guard\.js/);
  assert.match(views, /data-payslip-zoom-surface/);
  assert.match(zoomGuard, /closest\('\[data-payslip-zoom-surface\]'\)/);
});

test('calendario, ricerca e pagine legali vengono aperti dentro GestOre', () => {
  const views = read('app/frontend/js/views.js');
  const features = read('app/frontend/js/features.js');
  assert.match(views, /calendar-detail-overlay/);
  assert.match(views, /legal-app-overlay/);
  assert.match(features, /global-search-overlay/);
});

test('gli avatar predefiniti sono immagini ottimizzate e non semplici icone', () => {
  const views = read('app/frontend/js/views.js');
  for (const name of ['nova', 'byte', 'milo', 'lumi', 'pico', 'nori']) {
    const asset = path.join(root, 'app', 'frontend', 'assets', 'avatars', name + '.webp');
    assert.equal(fs.existsSync(asset), true, name + ' mancante');
    assert.ok(fs.statSync(asset).size < 100000, name + ' non ottimizzato');
    assert.match(views, new RegExp('assets/avatars/' + name + '\\.webp'));
  }
});
