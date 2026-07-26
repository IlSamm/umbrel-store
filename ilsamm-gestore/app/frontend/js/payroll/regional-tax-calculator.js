(function (root, factory) {
  var currency = typeof module === 'object' && module.exports
    ? require('./currency-utils.js')
    : (root.GestOrePayroll || {});
  var progressive = typeof module === 'object' && module.exports
    ? require('./progressive-tax-calculator.js')
    : (root.GestOrePayroll || {});
  var api = factory(root, currency, progressive);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.GestOrePayroll = Object.assign(root.GestOrePayroll || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root, currency, progressive) {
  'use strict';

  function normalizeLookup(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }

  function findRegionalTaxConfig(region, taxYear, registry) {
    var source = registry || root.GestOreTaxConfigs || {};
    var yearConfig = source[Number(taxYear)];
    if (!yearConfig || !yearConfig.regionalTaxes) return null;
    return yearConfig.regionalTaxes[normalizeLookup(region)] || null;
  }

  function calculateRegionalTaxDetails(taxableIncome, region, taxYear, registry) {
    var config = findRegionalTaxConfig(region, taxYear, registry);
    if (!config) {
      return {
        available: false,
        taxCents: 0,
        config: null,
        message: 'Addizionale regionale non disponibile per la Regione e l\'anno selezionati.'
      };
    }
    var taxableCents = currency.eurosToCents(taxableIncome);
    return {
      available: true,
      taxCents: progressive.calculateProgressiveTaxCents(taxableCents, config.brackets),
      config: config,
      breakdown: progressive.getProgressiveTaxBreakdown(taxableCents, config.brackets),
      message: ''
    };
  }

  function calculateRegionalTax(taxableIncome, region, taxYear) {
    return currency.centsToEuros(
      calculateRegionalTaxDetails(taxableIncome, region, taxYear).taxCents
    );
  }

  return {
    normalizePayrollLookup: normalizeLookup,
    findRegionalTaxConfig: findRegionalTaxConfig,
    calculateRegionalTax: calculateRegionalTax,
    calculateRegionalTaxDetails: calculateRegionalTaxDetails
  };
});
