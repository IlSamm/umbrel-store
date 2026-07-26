(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.GestOrePayroll = Object.assign(root.GestOrePayroll || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function parseLocaleNumber(value, fallback) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : (fallback || 0);
    var text = String(value === undefined || value === null ? '' : value)
      .trim()
      .replace(/\s|\u00a0|€/g, '');
    if (!text) return fallback || 0;
    if (text.indexOf(',') !== -1) {
      text = text.replace(/\./g, '').replace(',', '.');
    } else if (/^-?\d{1,3}(?:\.\d{3})+$/.test(text)) {
      text = text.replace(/\./g, '');
    }
    var parsed = Number(text);
    return Number.isFinite(parsed) ? parsed : (fallback || 0);
  }

  function eurosToCents(value) {
    return Math.round(parseLocaleNumber(value, 0) * 100);
  }

  function centsToEuros(value) {
    var cents = Number(value);
    return Number.isFinite(cents) ? cents / 100 : 0;
  }

  function formatCurrencyFromCents(value) {
    return centsToEuros(value)
      .toLocaleString('it-IT', {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })
      .replace(/\u00a0/g, ' ');
  }

  function formatCurrency(value) {
    return formatCurrencyFromCents(eurosToCents(value));
  }

  function rateToUnits(rate) {
    return Math.round(Math.max(0, parseLocaleNumber(rate, 0)) * 10000);
  }

  function percentageOfCents(cents, rate) {
    return Math.round(Math.max(0, Number(cents) || 0) * rateToUnits(rate) / 1000000);
  }

  function multiplyCents(cents, multiplier) {
    return Math.round((Number(cents) || 0) * (Number(multiplier) || 0));
  }

  function clampNumber(value, min, max, fallback) {
    var parsed = parseLocaleNumber(value, fallback);
    if (!Number.isFinite(parsed)) parsed = fallback;
    return Math.min(max, Math.max(min, parsed));
  }

  return {
    parseLocaleNumber: parseLocaleNumber,
    eurosToCents: eurosToCents,
    centsToEuros: centsToEuros,
    formatCurrency: formatCurrency,
    formatCurrencyFromCents: formatCurrencyFromCents,
    percentageOfCents: percentageOfCents,
    multiplyCents: multiplyCents,
    clampNumber: clampNumber
  };
});
