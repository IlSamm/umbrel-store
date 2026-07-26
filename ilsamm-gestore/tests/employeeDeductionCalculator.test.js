const test = require('node:test');
const assert = require('node:assert/strict');

require('../app/frontend/js/tax-config/2026.js');
const {
  calculateEmployeeTaxDeduction
} = require('../app/frontend/js/payroll/employee-deduction-calculator.js');

test('la detrazione dipende dai giorni di lavoro annuali', () => {
  const fullYear = calculateEmployeeTaxDeduction(24000, 2026, 365);
  const halfYear = calculateEmployeeTaxDeduction(24000, 2026, 182);
  assert.ok(fullYear > halfYear);
  assert.ok(Math.abs(halfYear - fullYear * 182 / 365) < 0.02);
});

test('oltre la soglia finale la detrazione si azzera', () => {
  assert.equal(calculateEmployeeTaxDeduction(60000, 2026, 365), 0);
});
