const test = require('node:test');
const assert = require('node:assert/strict');

require('../app/frontend/js/tax-config/2025.js');
require('../app/frontend/js/tax-config/2026.js');
const { DEFAULT_PAYROLL_INPUT } = require('../app/frontend/js/payroll/payroll-types.js');
const {
  validatePayrollInput,
  resolveRecordedOvertimeHours
} = require('../app/frontend/js/payroll/payroll-validation.js');
const {
  calculatePayrollEstimate
} = require('../app/frontend/js/payroll/payroll-calculator.js');

function input(overrides) {
  return Object.assign({}, DEFAULT_PAYROLL_INPUT, overrides || {});
}

test('dati iniziali: 20 ore a 10,98 e straordinari per 12 mesi', () => {
  const estimate = calculatePayrollEstimate(input());
  assert.equal(estimate.valid, true);
  assert.equal(estimate.baseAnnualGross, 24724);
  assert.equal(estimate.overtimeMonthlyGross, 219.6);
  assert.equal(estimate.overtimeAnnualGross, 2635.2);
  assert.equal(estimate.totalAnnualGross, 27359.2);
});

test('assenza di straordinari non altera il lordo annuale base', () => {
  const estimate = calculatePayrollEstimate(input({
    overtimeHoursMonthly: 0,
    monthsWithOvertime: 0
  }));
  assert.equal(estimate.overtimeAnnualGross, 0);
  assert.equal(estimate.totalAnnualGross, 24724);
  assert.equal(estimate.estimatedOrdinaryMonthNet, estimate.estimatedMonthWithOvertimeNet);
});

test('le ore registrate restano dinamiche e il limite agisce solo quando attivo', () => {
  assert.equal(resolveRecordedOvertimeHours(7.5, false, 2), 7.5);
  assert.equal(resolveRecordedOvertimeHours(7.5, true, 4), 4);
  assert.equal(resolveRecordedOvertimeHours(7.5, true, 12), 7.5);
});

test('un limite straordinari attivo richiede un numero di ore valido', () => {
  const checked = validatePayrollInput(input({
    overtimeLimitEnabled: true,
    overtimeHoursLimit: 0
  }), global.GestOreTaxConfigs);
  assert.equal(checked.valid, false);
  assert.ok(checked.errors.overtimeHoursLimit);
});

test('13 e 14 mensilita producono RAL diverse', () => {
  const thirteen = calculatePayrollEstimate(input({ salaryMonths: 13 }));
  const fourteen = calculatePayrollEstimate(input({ salaryMonths: 14 }));
  assert.equal(thirteen.baseAnnualGross, 22958);
  assert.equal(fourteen.baseAnnualGross, 24724);
  assert.equal(fourteen.baseAnnualGross - thirteen.baseAnnualGross, 1766);
});

test('mese con straordinari supera il mese ordinario', () => {
  const estimate = calculatePayrollEstimate(input());
  assert.ok(estimate.estimatedMonthWithOvertimeNet > estimate.estimatedOrdinaryMonthNet);
});

test('tredicesima e quattordicesima non contengono straordinari', () => {
  const estimate = calculatePayrollEstimate(input());
  assert.equal(estimate.monthlyBreakdown.thirteenth.grossCents, 176600);
  assert.equal(estimate.monthlyBreakdown.fourteenth.grossCents, 176600);
  assert.equal(estimate.estimatedThirteenthNet, estimate.estimatedOrdinaryMonthNet);
  assert.equal(estimate.estimatedFourteenthNet, estimate.estimatedOrdinaryMonthNet);
});

test('Comune assente non blocca il netto e marca il risultato incompleto', () => {
  const estimate = calculatePayrollEstimate(input({ municipality: '' }));
  assert.equal(estimate.valid, true);
  assert.equal(estimate.incomplete, true);
  assert.equal(estimate.annualMunicipalTax, 0);
  assert.ok(estimate.estimatedAnnualNet > 0);
});

test('Comune selezionato ricalcola il netto e dichiara l anno della tabella usata', () => {
  const withoutMunicipality = calculatePayrollEstimate(input({ municipality: '' }));
  const milano = calculatePayrollEstimate(input({ municipality: 'Milano' }));
  assert.equal(milano.valid, true);
  assert.equal(milano.municipalityConfig.municipalityCode, 'F205');
  assert.equal(milano.municipalityConfig.sourceYear, 2025);
  assert.ok(milano.annualMunicipalTax > 0);
  assert.ok(milano.estimatedAnnualNet < withoutMunicipality.estimatedAnnualNet);
  assert.match(milano.incompleteReasons.join(' '), /MEF 2025/i);
});

test('aliquota contributiva personalizzata cambia contributi e netto', () => {
  const lower = calculatePayrollEstimate(input({ employeeContributionRate: 8 }));
  const higher = calculatePayrollEstimate(input({ employeeContributionRate: 12 }));
  assert.ok(higher.annualContributions > lower.annualContributions);
  assert.ok(higher.estimatedAnnualNet < lower.estimatedAnnualNet);
});

test('la detrazione applicata non supera mai l IRPEF lorda', () => {
  const estimate = calculatePayrollEstimate(input({
    baseMonthlyGross: 500,
    salaryMonths: 12,
    overtimeHoursMonthly: 0,
    monthsWithOvertime: 0
  }));
  assert.ok(estimate.employeeDeduction <= estimate.annualGrossIrpef);
  assert.equal(estimate.annualNetIrpef, 0);
});

test('rimborsi aumentano il netto e trattenute lo riducono', () => {
  const base = calculatePayrollEstimate(input());
  const adjusted = calculatePayrollEstimate(input({
    otherAnnualDeductions: 200,
    annualReimbursements: 500
  }));
  assert.equal(adjusted.estimatedAnnualNet, base.estimatedAnnualNet + 300);
});

test('la voce privata da regolarizzare resta fuori dal netto fiscale', () => {
  const base = calculatePayrollEstimate(input());
  const withPrivateReconciliation = calculatePayrollEstimate(input({
    privateReconciliationEnabled: true,
    privateReconciliationHourlyRate: 15
  }));
  assert.equal(withPrivateReconciliation.valid, true);
  assert.equal(withPrivateReconciliation.input.privateReconciliationEnabled, true);
  assert.equal(withPrivateReconciliation.input.privateReconciliationHourlyRate, 15);
  assert.equal(withPrivateReconciliation.estimatedAnnualNet, base.estimatedAnnualNet);
  assert.equal(withPrivateReconciliation.totalAnnualGross, base.totalAnnualGross);
});

test('la voce privata attiva richiede una tariffa valida', () => {
  const checked = validatePayrollInput(input({
    privateReconciliationEnabled: true,
    privateReconciliationHourlyRate: 0
  }), global.GestOreTaxConfigs);
  assert.equal(checked.valid, false);
  assert.ok(checked.errors.privateReconciliationHourlyRate);
});

test('validazione rifiuta zero, negativi, ore e aliquote fuori limite', () => {
  const checked = validatePayrollInput(input({
    baseMonthlyGross: 0,
    overtimeHoursMonthly: -1,
    employeeContributionRate: 101
  }), global.GestOreTaxConfigs);
  assert.equal(checked.valid, false);
  assert.ok(checked.errors.baseMonthlyGross);
  assert.ok(checked.errors.overtimeHoursMonthly);
  assert.ok(checked.errors.employeeContributionRate);
});

test('validazione rifiuta valori nulli o non numerici nei campi obbligatori', () => {
  const nullGross = validatePayrollInput(input({ baseMonthlyGross: null }), global.GestOreTaxConfigs);
  const invalidRate = validatePayrollInput(input({ employeeContributionRate: 'nove' }), global.GestOreTaxConfigs);
  assert.equal(nullGross.valid, false);
  assert.ok(nullGross.errors.baseMonthlyGross);
  assert.equal(invalidRate.valid, false);
  assert.ok(invalidRate.errors.employeeContributionRate);
});

test('validazione accetta solo 12, 13 o 14 mensilita', () => {
  assert.equal(validatePayrollInput(input({ salaryMonths: 11 }), global.GestOreTaxConfigs).valid, false);
  assert.equal(validatePayrollInput(input({ salaryMonths: 12 }), global.GestOreTaxConfigs).valid, true);
  assert.equal(validatePayrollInput(input({ salaryMonths: 13 }), global.GestOreTaxConfigs).valid, true);
  assert.equal(validatePayrollInput(input({ salaryMonths: 14 }), global.GestOreTaxConfigs).valid, true);
});
