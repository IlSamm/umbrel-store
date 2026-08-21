const test = require('node:test');
const assert = require('node:assert/strict');

const { sortNewestFirst } = require('../app/frontend/js/payslip-ordering.js');

test('ordina i cedolini per anno e mese anche se inseriti fuori sequenza', () => {
  const input = [
    { id: 'gennaio', year: 2026, month: 1 },
    { id: 'marzo', year: 2026, month: 3 },
    { id: 'febbraio', year: 2026, month: 2 }
  ];

  assert.deepEqual(sortNewestFirst(input).map((item) => item.id), [
    'marzo',
    'febbraio',
    'gennaio'
  ]);
  assert.deepEqual(input.map((item) => item.id), ['gennaio', 'marzo', 'febbraio']);
});

test('ordina prima gli anni recenti e lascia in fondo i periodi non validi', () => {
  const result = sortNewestFirst([
    { id: 'senza-periodo' },
    { id: 'dicembre-2025', year: 2025, month: 12 },
    { id: 'gennaio-2026', year: 2026, month: 1 }
  ]);

  assert.deepEqual(result.map((item) => item.id), [
    'gennaio-2026',
    'dicembre-2025',
    'senza-periodo'
  ]);
});

test('nello stesso mese mostra prima il cedolino aggiornato piu di recente', () => {
  const result = sortNewestFirst([
    { id: 'vecchio', year: 2026, month: 2, updatedAt: 100 },
    { id: 'nuovo', year: 2026, month: 2, updatedAt: 200 }
  ]);

  assert.deepEqual(result.map((item) => item.id), ['nuovo', 'vecchio']);
});
