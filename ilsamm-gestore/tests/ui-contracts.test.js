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
  const bindings = read('app/frontend/js/bindings.js');
  const zoomGuard = read('app/frontend/js/zoom-guard.js');
  assert.match(index, /maximum-scale=1, user-scalable=no/);
  assert.match(index, /js\/zoom-guard\.js/);
  assert.match(views, /data-payslip-zoom-surface/);
  assert.match(views, /data-pdf-zoom-surface/);
  assert.match(views, /data-pdf-zoom-out/);
  assert.match(views, /data-pdf-zoom-in/);
  assert.match(views, /data-pdf-zoom-reset/);
  assert.match(bindings, /function bindPdfPreviewZoom/);
  assert.match(bindings, /touchstart/);
  assert.match(bindings, /isDoubleTap/);
  assert.match(bindings, /Math\.min\(max, value\)/);
  assert.match(bindings, /bindPdfPreviewZoom\(\)/);
  assert.match(zoomGuard, /data-payslip-zoom-surface.*data-pdf-zoom-surface/);
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

test('le impostazioni restano ordinate e mostrano solo spiegazioni utili', () => {
  const views = read('app/frontend/js/views.js');
  const platform = read('app/frontend/js/platform.js');

  assert.doesNotMatch(views, /data-open-settings-section="timer"/);
  assert.doesNotMatch(views, /data-open-onboarding="1"/);
  assert.doesNotMatch(views, /Scegli riepiloghi, scorciatoie/);
  assert.doesNotMatch(views, /Nome, target giornaliero/);
  assert.doesNotMatch(views, /Rivedi obiettivi, turno/);
  assert.match(views, /data-toggle-shift-timer="1"/);
  assert.match(views, /renderPlatformPushSettings/);
  assert.match(platform, /function renderPlatformPushSettings/);
  assert.match(platform, /settingsSection === 'notifications'[\s\S]*?loadPlatformPushConfig/);
  assert.doesNotMatch(platform, /settingsSection === 'privacy'[\s\S]{0,120}loadPlatformPushConfig/);
});

test('stipendio e report espongono periodi navigabili e azioni chiare', () => {
  const views = read('app/frontend/js/views.js');
  const bindings = read('app/frontend/js/bindings.js');
  const core = read('app/frontend/js/core.js');

  assert.match(views, /data-salary-month="-1"/);
  assert.match(views, /data-salary-month="1"/);
  assert.match(bindings, /dataset\.salaryMonth/);
  assert.match(views, /data-export-month="-1"/);
  assert.match(views, /data-export-month="1"/);
  assert.match(views, /Foglio Excel/);
  assert.match(views, /Report mensile/);
  assert.match(views, /Report annuale/);
  assert.match(views, /data-export-report-complete-year="1"/);
  assert.match(views, /data-export-report-salaries="1"/);
  assert.match(views, /Annuale completo/);
  assert.match(views, /Report stipendi/);
  assert.match(views, /Mostra anteprima/);
  assert.match(views, /Scarica PDF/);
  assert.match(views, /pdf-preview-overlay/);
  assert.match(views, /data-pdf-preview-pages/);
  assert.doesNotMatch(views, /pdf-preview-frame"><iframe/);
  assert.match(bindings, /exportCompleteYearReport/);
  assert.match(bindings, /exportSalaryReport/);
  assert.match(bindings, /previewSelectedPdfReport/);
  assert.match(core, /js\/pdf\/annual-complete\.js/);
  assert.match(core, /js\/pdf\/salaries\.js/);
  assert.match(core, /openPdfExportDialog\('monthly'\)/);
  assert.match(core, /openPdfExportDialog\('yearly'\)/);
  assert.match(core, /vendor\/pdfjs\/pdf\.min\.mjs/);
  assert.match(core, /vendor\/pdfjs\/pdf\.worker\.min\.mjs/);
  assert.match(core, /renderPdfPreviewPages/);
  assert.match(core, /document\.createElement\('canvas'\)/);
  assert.equal(fs.existsSync(path.join(root, 'app/frontend/js/pdf/annual-complete.js')), true);
  assert.equal(fs.existsSync(path.join(root, 'app/frontend/js/pdf/salaries.js')), true);
  assert.equal(fs.existsSync(path.join(root, 'app/frontend/vendor/pdfjs/pdf.min.mjs')), true);
  assert.equal(fs.existsSync(path.join(root, 'app/frontend/vendor/pdfjs/pdf.worker.min.mjs')), true);
});

test('privacy termini e supporto mantengono contenuti completi senza card introduttive', () => {
  const views = read('app/frontend/js/views.js');

  assert.doesNotMatch(views, /'<div class="legal-app-intro"/);
  assert.match(views, /Dati del tuo account/);
  assert.match(views, /Chiusura dell&apos;account/);
  assert.match(views, /Segnalare un problema/);
  assert.match(views, /data-close-legal/);
});

test('lo splash usa il marchio GestOre e segue le vere fasi di avvio', () => {
  const index = read('app/frontend/index.html');
  const styles = read('app/frontend/styles/splash-final.css');
  const loading = read('app/frontend/js/loading.js');
  const core = read('app/frontend/js/core.js');
  const account = read('app/frontend/js/account.js');
  const worker = read('app/frontend/service-worker.js');

  assert.match(index, /rel="preload" as="image" href="assets\/icons\/gestore-mark\.png"/);
  assert.match(index, /go-splash-mark-stage/);
  assert.match(index, /go-splash-accessible-status/);
  assert.doesNotMatch(index, /go-time-loader|go-time-loader-digits|go-splash-tagline|go-splash-footer|go-splash-loader/);
  assert.match(styles, /goSplashStageReveal/);
  assert.match(styles, /goSplashEdgeDrift/);
  assert.match(styles, /goSplashWordmarkShimmer/);
  assert.match(styles, /--go-splash-progress/);
  assert.match(styles, /prefers-reduced-motion:\s*reduce/);
  assert.doesNotMatch(styles, /goTimeRoll|goTimeOrbit/);
  assert.match(loading, /window\.GestOreSplash/);
  assert.match(core, /GestOreSplash\.update\('Carico i dati del tuo profilo',\s*\.56/);
  assert.match(account, /GestOreSplash\.update\(splashMessage/);
  assert.match(worker, /assets\/icons\/gestore-mark\.png/);
});

test('le pagine usano una transizione breve solo al cambio schermata e nascondono gli indicatori di scorrimento', () => {
  const index = read('app/frontend/index.html');
  const views = read('app/frontend/js/views.js');
  const motion = read('app/frontend/js/motion.js');
  const scrollbarStyles = read('app/frontend/styles/release-187.css');
  const motionStyles = read('app/frontend/styles/release-189.css');
  const worker = read('app/frontend/service-worker.js');
  const motionKey = views.match(/function getRenderMotionKey\(\)[\s\S]*?\n    function render\(\)/)?.[0] || '';

  assert.match(index, /js\/motion\.js/);
  assert.match(worker, /js\/motion\.js/);
  assert.match(worker, /styles\/release-187\.css/);
  assert.match(worker, /styles\/release-188\.css/);
  assert.match(worker, /styles\/release-189\.css/);
  assert.match(views, /function getRenderMotionKey/);
  assert.match(views, /GestOreMotion\.render/);
  assert.match(motion, /key === lastViewKey/);
  assert.match(motion, /hadPreviousView/);
  assert.match(motion, /prefers-reduced-motion: reduce/);
  assert.match(motion, /cardSelector/);
  assert.match(motion, /go-card-enter-item/);
  assert.doesNotMatch(motion, /parseMetric|go-total-number|go-progress-motion|requestAnimationFrame/);
  assert.doesNotMatch(motionKey, /currentMonth|statsRange|vacationScreenYear|salaryMonth/);
  assert.match(motionStyles, /380ms/);
  assert.match(motionStyles, /go-card-premium-reveal/);
  assert.match(motionStyles, /animation:\s*go-card-premium-reveal[^;]+!important/);
  assert.match(motionStyles, /translate3d\(0,\s*12px,\s*0\)/);
  assert.match(motionStyles, /\.screen\.active\.go-view-enter\s*\{\s*animation:\s*none\s*!important/);
  assert.doesNotMatch(motionStyles, /go-view-settle|translate3d\([^,]+,\s*1px/);
  assert.match(scrollbarStyles, /scrollbar-width:\s*none\s*!important/);
  assert.match(scrollbarStyles, /\*::\-webkit-scrollbar/);
  assert.match(scrollbarStyles, /width:\s*0\s*!important/);
  assert.match(scrollbarStyles, /height:\s*0\s*!important/);
});
