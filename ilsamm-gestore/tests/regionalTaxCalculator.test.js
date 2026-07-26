const test = require('node:test');
const assert = require('node:assert/strict');

require('../app/frontend/js/tax-config/2026.js');
const {
  calculateRegionalTax,
  calculateRegionalTaxDetails
} = require('../app/frontend/js/payroll/regional-tax-calculator.js');

test('applica progressivamente gli scaglioni della Lombardia 2026', () => {
  assert.equal(calculateRegionalTax(30000, 'Lombardia', 2026), 424.3);
});

test('se la Regione non e configurata segnala una stima incompleta', () => {
  const result = calculateRegionalTaxDetails(30000, 'Piemonte', 2026);
  assert.equal(result.available, false);
  assert.equal(result.taxCents, 0);
  assert.match(result.message, /non disponibile/i);
});
