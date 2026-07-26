const test = require('node:test');
const assert = require('node:assert/strict');

const {
  calculateProgressiveTax
} = require('../app/frontend/js/payroll/progressive-tax-calculator.js');

const brackets = [
  { from: 0, to: 28000, rate: 23 },
  { from: 28000, to: 50000, rate: 33 },
  { from: 50000, to: null, rate: 43 }
];

test('calcola un reddito interamente nel primo scaglione', () => {
  assert.equal(calculateProgressiveTax(20000, brackets), 4600);
});

test('calcola un reddito che attraversa due scaglioni', () => {
  assert.equal(calculateProgressiveTax(40000, brackets), 10400);
});

test('calcola un reddito che attraversa tutti gli scaglioni', () => {
  assert.equal(calculateProgressiveTax(60000, brackets), 18000);
});

test('zero e valori negativi non generano imposta', () => {
  assert.equal(calculateProgressiveTax(0, brackets), 0);
  assert.equal(calculateProgressiveTax(-1000, brackets), 0);
});
