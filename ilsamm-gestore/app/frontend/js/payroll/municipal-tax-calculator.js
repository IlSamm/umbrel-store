(function (root, factory) {
  var currency = typeof module === 'object' && module.exports
    ? require('./currency-utils.js')
    : (root.GestOrePayroll || {});
  var progressive = typeof module === 'object' && module.exports
    ? require('./progressive-tax-calculator.js')
    : (root.GestOrePayroll || {});
  var municipalData = typeof module === 'object' && module.exports
    ? require('../tax-config/municipal-taxes.generated.js')
    : (root.GestOreMunicipalTaxData || {});
  var api = factory(root, currency, progressive, municipalData);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.GestOrePayroll = Object.assign(root.GestOrePayroll || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root, currency, progressive, municipalData) {
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
    var generated = municipalData && typeof municipalData.getMunicipalityOptions === 'function'
      ? municipalData.getMunicipalityOptions(taxYear, region)
      : [];
    var byCode = {};
    generated.forEach(function (config) {
      byCode[normalizeLookup(config.municipalityCode)] = config;
    });
    Object.keys(yearConfig && yearConfig.municipalTaxes || {})
      .map(function (code) { return yearConfig.municipalTaxes[code]; })
      .filter(function (config) {
        return !regionLookup || !config.region || normalizeLookup(config.region) === regionLookup;
      })
      .forEach(function (config) {
        var key = normalizeLookup(config.municipalityCode);
        if (!byCode[key]) byCode[key] = config;
      });
    return Object.keys(byCode)
      .map(function (code) { return byCode[code]; })
      .sort(function (a, b) {
        return String(a.municipalityName).localeCompare(String(b.municipalityName), 'it');
      });
  }

  function findMunicipalTaxConfig(municipality, taxYear, registry, region) {
    var lookup = normalizeLookup(municipality);
    if (!lookup) return null;
    if (municipalData && typeof municipalData.findMunicipality === 'function') {
      var generated = municipalData.findMunicipality(municipality, taxYear, region);
      if (generated) return generated;
    }
    return getMunicipalityOptions(taxYear, registry, region).find(function (config) {
      return normalizeLookup(config.municipalityCode) === lookup ||
        normalizeLookup(config.municipalityName) === lookup ||
        normalizeLookup(config.municipalityName + ' ' + config.municipalityCode) === lookup;
    }) || null;
  }

  function searchMunicipalities(query, taxYear, registry, region, limit) {
    var max = Math.max(1, Math.min(30, Number(limit) || 8));
    var results = municipalData && typeof municipalData.searchMunicipalities === 'function'
      ? municipalData.searchMunicipalities(query, taxYear, region, max)
      : [];
    var seen = {};
    results.forEach(function (config) {
      seen[normalizeLookup(config.municipalityCode)] = true;
    });
    var lookup = normalizeLookup(query);
    var hasNationalData = municipalData && typeof municipalData.searchMunicipalities === 'function';
    if (!hasNationalData && lookup.length >= 2 && results.length < max) {
      getMunicipalityOptions(taxYear, registry, region).some(function (config) {
        var code = normalizeLookup(config.municipalityCode);
        var name = normalizeLookup(config.municipalityName);
        if (!seen[code] && (code.indexOf(lookup) === 0 || name.indexOf(lookup) !== -1)) {
          seen[code] = true;
          results.push(config);
        }
        return results.length >= max;
      });
    }
    return results.slice(0, max);
  }

  function getMunicipalWarnings(config) {
    var warnings = [];
    if (!config) return warnings;
    if (config.fallback) {
      warnings.push(
        'Per ' + config.municipalityName + ' viene usata l aliquota MEF ' +
        config.sourceYear + ', ultima disponibile per la stima ' + config.taxYear + '.'
      );
    }
    if (config.provisional) {
      warnings.push(
        'Per ' + config.municipalityName + ' la tabella MEF ' + config.taxYear +
        ' riporta 0*: l addizionale e stimata provvisoriamente a zero.'
      );
    }
    if (config.limited) {
      warnings.push(
        'La delibera di ' + config.municipalityName +
        ' contiene regole o esenzioni particolari che richiedono una verifica personale.'
      );
    }
    return warnings;
  }

  function calculateMunicipalTaxDetails(taxableIncome, municipalityConfig) {
    var config = municipalityConfig && typeof municipalityConfig === 'object'
      ? municipalityConfig
      : null;
    if (!config || config.available === false) {
      return {
        available: false,
        exempt: false,
        taxCents: 0,
        advanceCents: 0,
        balanceCents: 0,
        warnings: [],
        message: 'Addizionale comunale non calcolata. Inserisci il Comune di residenza per ottenere una stima piu precisa.'
      };
    }
    var warnings = getMunicipalWarnings(config);
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
        warnings: warnings,
        message: ['Reddito entro la soglia comunale di esenzione.'].concat(warnings).join(' ')
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
      warnings: warnings,
      message: warnings.join(' ')
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
    searchMunicipalities: searchMunicipalities,
    calculateMunicipalTax: calculateMunicipalTax,
    calculateMunicipalTaxDetails: calculateMunicipalTaxDetails
  };
});
