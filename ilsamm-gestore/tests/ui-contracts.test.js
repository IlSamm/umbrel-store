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

test('gli avatar predefiniti usano il set completo di mascotte', () => {
  const views = read('app/frontend/js/views.js');
  const releaseStyles = read('app/frontend/styles/release-181.css');
  const avatars = [
    ['nova', 'webp'], ['byte', 'webp'], ['milo', 'webp'],
    ['lumi', 'webp'], ['pico', 'webp'], ['nori', 'webp'],
    ['aria', 'png'], ['zed', 'png'], ['orbit', 'png'],
    ['rex', 'png'], ['kira', 'png'], ['mocha', 'png']
  ];

  assert.doesNotMatch(views, /avatar-sprite/);
  assert.doesNotMatch(releaseStyles, /gestore-mascots\.jpg/);

  for (const [name, extension] of avatars) {
    const asset = path.join(root, 'app', 'frontend', 'assets', 'avatars', name + '.' + extension);
    assert.equal(fs.existsSync(asset), true, name + ' mancante');
    assert.ok(fs.statSync(asset).size < 600000, name + ' non ottimizzato');
    assert.match(views, new RegExp("key: '" + name + "'"), name + ' mancante');
    assert.match(views, new RegExp("avatars/" + name + "\\." + extension), name + ' non collegato');
  }

  assert.match(releaseStyles, /object-fit:\s*contain/);
});

test('profilo e impostazioni usano ritorni coerenti senza aree account obsolete', () => {
  const views = read('app/frontend/js/views.js');
  const bindings = read('app/frontend/js/bindings.js');
  const platform = read('app/frontend/js/platform.js');
  const releaseStyles = read('app/frontend/styles/release-181.css');
  const readabilityStyles = read('app/frontend/styles/release-182.css');

  assert.doesNotMatch(views, /Gestione account/);
  assert.doesNotMatch(platform, /Dispositivi collegati/);
  assert.match(bindings, /settingsReturnTarget === 'profile'/);
  assert.match(releaseStyles, /\.profile-screen\.active[\s\S]*overflow: hidden/);
  assert.match(releaseStyles, /\.settings-hub-screen\.active[\s\S]*overflow: hidden/);
  assert.match(releaseStyles, /profile-page-v2[\s\S]*?profile-app-footer[\s\S]*?margin-top:\s*auto/);
  assert.match(releaseStyles, /settings-hub-page[\s\S]*?settings-v2-footer[\s\S]*?margin-top:\s*auto/);
  assert.match(readabilityStyles, /profile-v2-group \.profile-row[\s\S]*?min-height:\s*70px/);
  assert.match(readabilityStyles, /profile-row-copy strong[\s\S]*?font-size:\s*15\.5px/);
  assert.match(readabilityStyles, /settings-hub-row[\s\S]*?min-height:\s*68px/);
  assert.match(readabilityStyles, /settings-v2-copy strong[\s\S]*?font-size:\s*15px/);
});

test('stipendio e report espongono periodi navigabili e azioni chiare', () => {
  const views = read('app/frontend/js/views.js');
  const bindings = read('app/frontend/js/bindings.js');

  assert.match(views, /data-salary-month="-1"/);
  assert.match(views, /data-salary-month="1"/);
  assert.match(bindings, /dataset\.salaryMonth/);
  assert.match(views, /data-export-month="-1"/);
  assert.match(views, /data-export-month="1"/);
  assert.match(views, /Foglio Excel/);
  assert.match(views, /Report mensile/);
  assert.match(views, /Report annuale/);
});

test('privacy termini e supporto mantengono contenuti completi senza card introduttive', () => {
  const views = read('app/frontend/js/views.js');

  assert.doesNotMatch(views, /'<div class="legal-app-intro"/);
  assert.match(views, /Dati del tuo account/);
  assert.match(views, /Chiusura dell&apos;account/);
  assert.match(views, /Segnalare un problema/);
  assert.match(views, /data-close-legal/);
});
