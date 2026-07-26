const test = require('node:test');
const assert = require('node:assert/strict');

const {
  calculateContributions,
  calculateContributionsCents
} = require('../app/frontend/js/payroll/contribution-calculator.js');

test('usa l aliquota contributiva personalizzata', () => {
  assert.equal(calculateContributions(27359.2, 9.19), 2514.31);
  assert.equal(calculateContributions(27359.2, 10), 2735.92);
});

test('arrotonda il risultato contributivo ai centesimi', () => {
  assert.equal(calculateContributionsCents(10001, 9.19), 919);
});

test('non produce contributi negativi', () => {
  assert.equal(calculateContributions(-100, 9.19), 0);
});
