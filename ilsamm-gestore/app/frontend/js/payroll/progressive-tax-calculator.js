(function (root, factory) {
  var currency = typeof module === 'object' && module.exports
    ? require('./currency-utils.js')
    : (root.GestOrePayroll || {});
  var api = factory(currency);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.GestOrePayroll = Object.assign(root.GestOrePayroll || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (currency) {
  'use strict';

  function normalizeBrackets(brackets) {
    return (Array.isArray(brackets) ? brackets : [])
      .map(function (bracket) {
        return {
          from: Math.max(0, Number(bracket && bracket.from) || 0),
          to: bracket && bracket.to !== null && bracket.to !== undefined
            ? Math.max(0, Number(bracket.to) || 0)
            : null,
          rate: Math.max(0, Number(bracket && bracket.rate) || 0)
        };
      })
      .filter(function (bracket) {
        return bracket.to === null || bracket.to > bracket.from;
      })
      .sort(function (a, b) { return a.from - b.from; });
  }

  function calculateProgressiveTaxCents(taxableIncomeCents, brackets) {
    var incomeCents = Math.max(0, Math.round(Number(taxableIncomeCents) || 0));
    if (!incomeCents) return 0;
    return normalizeBrackets(brackets).reduce(function (total, bracket) {
      var fromCents = currency.eurosToCents(bracket.from);
      var toCents = bracket.to === null ? incomeCents : currency.eurosToCents(bracket.to);
      var taxableSlice = Math.max(0, Math.min(incomeCents, toCents) - fromCents);
      return total + currency.percentageOfCents(taxableSlice, bracket.rate);
    }, 0);
  }

  function calculateProgressiveTax(taxableIncome, brackets) {
    return currency.centsToEuros(
      calculateProgressiveTaxCents(currency.eurosToCents(taxableIncome), brackets)
    );
  }

  function getProgressiveTaxBreakdown(taxableIncomeCents, brackets) {
    var incomeCents = Math.max(0, Math.round(Number(taxableIncomeCents) || 0));
    return normalizeBrackets(brackets).map(function (bracket) {
      var fromCents = currency.eurosToCents(bracket.from);
      var toCents = bracket.to === null ? incomeCents : currency.eurosToCents(bracket.to);
      var taxableSlice = Math.max(0, Math.min(incomeCents, toCents) - fromCents);
      return {
        from: bracket.from,
        to: bracket.to,
        rate: bracket.rate,
        taxableCents: taxableSlice,
        taxCents: currency.percentageOfCents(taxableSlice, bracket.rate)
      };
    }).filter(function (row) { return row.taxableCents > 0; });
  }

  return {
    normalizeTaxBrackets: normalizeBrackets,
    calculateProgressiveTax: calculateProgressiveTax,
    calculateProgressiveTaxCents: calculateProgressiveTaxCents,
    getProgressiveTaxBreakdown: getProgressiveTaxBreakdown
  };
});
