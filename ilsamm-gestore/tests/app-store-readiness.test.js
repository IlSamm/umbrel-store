const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('la build iOS App Store e locale e la build hosted richiede HTTPS', () => {
  const build = read('tools/build-ios.mjs');
  const runtime = read('app/frontend/js/native-runtime.js');

  assert.match(build, /requestedMode \|\| \(apiBaseUrl \? 'hosted' : 'local'\)/);
  assert.match(build, /release && runtimeMode === 'hosted'/);
  assert.match(build, /mode: \$\{JSON\.stringify\(runtimeMode\)\}/);
  assert.match(runtime, /localOnly: localOnly/);
  assert.match(runtime, /usesRemoteApi: mode === 'hosted' && Boolean\(apiBaseUrl\)/);
});

test('la modalita locale non richiede account o sincronizzazione server', () => {
  const core = read('app/frontend/js/core.js');
  const account = read('app/frontend/js/account.js');

  assert.match(core, /if \(isLocalOnlyRuntime\(\)\) \{[\s\S]*?Salvato su questo iPhone/);
  assert.match(core, /function queueServerSync\(\) \{\s*if \(isLocalOnlyRuntime\(\)\)/);
  assert.match(account, /state\.account\.mode = 'local'/);
  assert.match(account, /maybeOpenLocalOnboarding\(\)/);
  assert.match(account, /if \(typeof isLocalOnlyRuntime === 'function' && isLocalOnlyRuntime\(\)\) return ''/);
  assert.match(account, /gestore-local-backup/);
});

test('le foto cedolino locali usano lo spazio privato nativo', () => {
  const bridge = read('native/native-bridge.ts');
  const payslips = read('app/frontend/js/payslips.js');

  assert.match(bridge, /Directory\.LibraryNoCloud/);
  assert.match(bridge, /savePayslipAssets/);
  assert.match(bridge, /loadPayslipAssets/);
  assert.match(bridge, /deletePayslipAssets/);
  assert.match(payslips, /persistLocalPayslipAssets/);
  assert.match(payslips, /hydrateLocalPayslipAssets/);
});

test('non esistono funzioni o etichette stipendio nascoste', () => {
  const sources = [
    'app/frontend/js/views.js',
    'app/frontend/js/bindings.js',
    'app/frontend/js/payslips.js',
    'app/frontend/styles/payslip-estimate.css'
  ].map(read).join('\n');

  assert.doesNotMatch(sources, /data-payroll-secret|payrollSecret|payrollPrivateUnlocked|\bNero\b/i);
  assert.match(sources, /Ore da regolarizzare/);
});

test('privacy e configurazione iOS corrispondono alla build locale', () => {
  const privacy = read('ios/App/App/PrivacyInfo.xcprivacy');
  const info = read('ios/App/App/Info.plist');
  const legal = read('app/frontend/legal/privacy.html');

  assert.match(privacy, /<key>NSPrivacyCollectedDataTypes<\/key>\s*<array\/>/);
  assert.match(privacy, /<key>NSPrivacyTracking<\/key>\s*<false\/>/);
  assert.match(info, /<key>CFBundleDevelopmentRegion<\/key>\s*<string>it<\/string>/);
  assert.match(info, /<key>CFBundleDisplayName<\/key>\s*<string>GestOre<\/string>/);
  assert.doesNotMatch(info, /armv7/);
  assert.doesNotMatch(legal, /YOUR-PRODUCTION-DOMAIN|Prima della pubblicazione commerciale/i);
  assert.match(legal, /memoria privata dell'app/);
});

test('lo shell iOS espone stato di avvio e contenuto principale agli screen reader', () => {
  const index = read('app/frontend/index.html');

  assert.match(index, /id="splashScreen" role="status" aria-live="polite"/);
  assert.match(index, /id="app" role="main" aria-label="GestOre"/);
  assert.match(index, /viewport-fit=cover/);
});
