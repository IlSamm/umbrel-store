(function (root, factory) {
  var currency = typeof module === 'object' && module.exports
    ? require('./currency-utils.js')
    : (root.GestOrePayroll || {});
  var api = factory(currency);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.GestOrePayroll = Object.assign(root.GestOrePayroll || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (currency) {
  'use strict';

  function calculateContributionsCents(annualGrossCents, employeeContributionRate) {
    return currency.percentageOfCents(
      Math.max(0, Math.round(Number(annualGrossCents) || 0)),
      Math.min(100, Math.max(0, currency.parseLocaleNumber(employeeContributionRate, 0)))
    );
  }

  function calculateContributions(annualGross, employeeContributionRate) {
    return currency.centsToEuros(
      calculateContributionsCents(currency.eurosToCents(annualGross), employeeContributionRate)
    );
  }

  return {
    calculateContributions: calculateContributions,
    calculateContributionsCents: calculateContributionsCents
  };
});
