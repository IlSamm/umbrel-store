const test = require('node:test');
const assert = require('node:assert/strict');

require('../app/frontend/js/tax-config/2026.js');
const {
  findMunicipalTaxConfig,
  getMunicipalityOptions,
  searchMunicipalities,
  calculateMunicipalTax,
  calculateMunicipalTaxDetails
} = require('../app/frontend/js/payroll/municipal-tax-calculator.js');

test('senza Comune prosegue con zero e segnala che la stima e incompleta', () => {
  const result = calculateMunicipalTaxDetails(30000, null);
  assert.equal(result.available, false);
  assert.equal(result.taxCents, 0);
  assert.match(result.message, /Inserisci il Comune/i);
});

test('rispetta la soglia comunale di esenzione', () => {
  const cormano = findMunicipalTaxConfig('Cormano', 2026);
  assert.ok(cormano);
  assert.equal(calculateMunicipalTax(12000, cormano), 0);
  assert.equal(calculateMunicipalTax(12001, cormano), 96.01);
  const details = calculateMunicipalTaxDetails(12001, cormano);
  assert.equal(details.advanceCents + details.balanceCents, details.taxCents);
});

test('trova il Comune anche tramite codice catastale', () => {
  assert.equal(findMunicipalTaxConfig('D013', 2026).municipalityName, 'Cormano');
});

test('calcola Sovere 2026 con aliquota unica senza esenzione', () => {
  const sovereign = findMunicipalTaxConfig('Sovere', 2026);
  assert.ok(sovereign);
  assert.equal(sovereign.municipalityCode, 'I873');
  assert.equal(sovereign.exemptionThreshold, 0);
  assert.equal(calculateMunicipalTax(30000, sovereign), 240);
});

test('non applica il Comune di una Regione diversa', () => {
  assert.equal(findMunicipalTaxConfig('Cormano', 2026, null, 'Piemonte'), null);
});

test('distingue i Comuni omonimi usando la Regione selezionata', () => {
  assert.equal(
    findMunicipalTaxConfig('Castro', 2026, null, 'Lombardia').municipalityCode,
    'C337'
  );
  assert.equal(
    findMunicipalTaxConfig('Castro', 2026, null, 'Puglia').municipalityCode,
    'M261'
  );
});

test('il registro 2026 contiene tutti i 7.894 Comuni italiani correnti', () => {
  const options = getMunicipalityOptions(2026);
  assert.equal(options.length, 7894);
  assert.equal(new Set(options.map((item) => item.municipalityCode)).size, 7894);
  assert.ok(findMunicipalTaxConfig('Roma', 2026));
  assert.ok(findMunicipalTaxConfig('Palermo', 2026));
  assert.ok(findMunicipalTaxConfig('Bolzano', 2026));
  assert.ok(findMunicipalTaxConfig('Castegnero Nanto', 2026));
  assert.equal(findMunicipalTaxConfig('Lirio', 2026), null);
});

test('la ricerca nazionale e veloce, limitata e filtrata per Regione', () => {
  const results = searchMunicipalities('sove', 2026, null, 'Lombardia', 8);
  assert.ok(results.length <= 8);
  assert.equal(results[0].municipalityName, 'Sovere');
  assert.ok(results.every((item) => item.region === 'Lombardia'));
  assert.deepEqual(
    searchMunicipalities('sove', 2026, null, 'Piemonte', 8),
    []
  );
});

test('usa l ultima aliquota MEF disponibile quando il 2026 riporta 0*', () => {
  const milano = findMunicipalTaxConfig('Milano', 2026);
  assert.equal(milano.sourceYear, 2025);
  assert.equal(milano.fallback, true);
  assert.equal(milano.exemptionThreshold, 23000);
  assert.equal(calculateMunicipalTax(25000, milano), 200);
  assert.match(calculateMunicipalTaxDetails(25000, milano).message, /ultima disponibile/i);
});

test('se non esiste ancora una delibera segnala lo zero come provvisorio', () => {
  const municipality = findMunicipalTaxConfig('Castegnero Nanto', 2026);
  const result = calculateMunicipalTaxDetails(30000, municipality);
  assert.equal(municipality.provisional, true);
  assert.equal(result.available, true);
  assert.equal(result.taxCents, 0);
  assert.match(result.message, /provvisoriamente a zero/i);
});
