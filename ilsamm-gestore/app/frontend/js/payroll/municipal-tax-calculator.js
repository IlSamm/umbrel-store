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

  function getMunicipalityOptions(taxYear, registry, region) {
    var source = registry || root.GestOreTaxConfigs || {};
    var yearConfig = source[Number(taxYear)];
    var regionLookup = normalizeLookup(region);
    return Object.keys(yearConfig && yearConfig.municipalTaxes || {})
      .map(function (code) { return yearConfig.municipalTaxes[code]; })
      .filter(function (config) {
        return !regionLookup || !config.region || normalizeLookup(config.region) === regionLookup;
      })
      .sort(function (a, b) {
        return String(a.municipalityName).localeCompare(String(b.municipalityName), 'it');
      });
  }

  function findMunicipalTaxConfig(municipality, taxYear, registry, region) {
    var lookup = normalizeLookup(municipality);
    if (!lookup) return null;
    return getMunicipalityOptions(taxYear, registry, region).find(function (config) {
      return normalizeLookup(config.municipalityCode) === lookup ||
        normalizeLookup(config.municipalityName) === lookup ||
        normalizeLookup(config.municipalityName + ' ' + config.municipalityCode) === lookup;
    }) || null;
  }

  function calculateMunicipalTaxDetails(taxableIncome, municipalityConfig) {
    var config = municipalityConfig && typeof municipalityConfig === 'object'
      ? municipalityConfig
      : null;
    if (!config) {
      return {
        available: false,
        exempt: false,
        taxCents: 0,
        advanceCents: 0,
        balanceCents: 0,
        message: 'Addizionale comunale non calcolata. Inserisci il Comune di residenza per ottenere una stima piu precisa.'
      };
    }
    var taxableCents = currency.eurosToCents(taxableIncome);
    var exemptionCents = currency.eurosToCents(config.exemptionThreshold || 0);
    if (exemptionCents > 0 && taxableCents <= exemptionCents) {
      return {
        available: true,
        exempt: true,
        taxCents: 0,
        advanceCents: 0,
        balanceCents: 0,
        config: config,
        message: 'Reddito entro la soglia comunale di esenzione.'
      };
    }
    var taxCents = progressive.calculateProgressiveTaxCents(taxableCents, config.brackets);
    var advanceRate = Math.min(100, Math.max(0, Number(config.advanceRate) || 0));
    var advanceCents = currency.percentageOfCents(taxCents, advanceRate);
    return {
      available: true,
      exempt: false,
      taxCents: taxCents,
      advanceCents: advanceCents,
      balanceCents: Math.max(0, taxCents - advanceCents),
      config: config,
      breakdown: progressive.getProgressiveTaxBreakdown(taxableCents, config.brackets),
      message: ''
    };
  }

  function calculateMunicipalTax(taxableIncome, municipalityConfig) {
    return currency.centsToEuros(
      calculateMunicipalTaxDetails(taxableIncome, municipalityConfig).taxCents
    );
  }

  return {
    findMunicipalTaxConfig: findMunicipalTaxConfig,
    getMunicipalityOptions: getMunicipalityOptions,
    calculateMunicipalTax: calculateMunicipalTax,
    calculateMunicipalTaxDetails: calculateMunicipalTaxDetails
  };
});
