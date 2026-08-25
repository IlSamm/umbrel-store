const test = require('node:test');
const assert = require('node:assert/strict');

const {
  calculateCompletionScore,
  calculateSalaryComparison
} = require('../app/frontend/js/monthly-review.js');

test('il punteggio considera soltanto i controlli applicabili', () => {
  const result = calculateCompletionScore([
    { ready: true },
    { ready: false },
    { ready: false, applicable: false }
  ]);

  assert.deepEqual(result, { score: 50, ready: 1, total: 2, pending: 1 });
});

test('un mese senza controlli applicabili risulta pronto senza falsi avvisi', () => {
  const result = calculateCompletionScore([
    { ready: false, applicable: false }
  ]);

  assert.deepEqual(result, { score: 100, ready: 0, total: 0, pending: 0 });
});

test('il confronto stipendio distingue importo superiore, inferiore e uguale', () => {
  assert.deepEqual(calculateSalaryComparison(1500, 1575), {
    estimated: 1500,
    actual: 1575,
    delta: 75,
    percent: 5,
    tone: 'higher'
  });
  assert.equal(calculateSalaryComparison(1500, 1425).tone, 'lower');
  assert.equal(calculateSalaryComparison(1500, 1500).tone, 'equal');
});

test('il confronto gestisce valori assenti senza percentuali non valide', () => {
  const result = calculateSalaryComparison(0, 1200);
  assert.equal(result.percent, 0);
  assert.equal(Number.isFinite(result.delta), true);
});
