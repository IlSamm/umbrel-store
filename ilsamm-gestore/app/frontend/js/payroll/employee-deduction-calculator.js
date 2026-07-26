(function (root, factory) {
  var currency = typeof module === 'object' && module.exports
    ? require('./currency-utils.js')
    : (root.GestOrePayroll || {});
  var api = factory(root, currency);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.GestOrePayroll = Object.assign(root.GestOrePayroll || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root, currency) {
  'use strict';

  function resolveTaxConfig(taxYear, registry) {
    var source = registry || root.GestOreTaxConfigs || {};
    return source[Number(taxYear)] || null;
  }

  function calculateBaseDeductionCents(incomeCents, config, employmentType) {
    var income = currency.centsToEuros(incomeCents);
    var amount = 0;
    if (income <= config.firstThreshold) {
      amount = config.firstAmount;
    } else if (income <= config.secondThreshold) {
      amount = config.secondBase +
        config.secondVariable * (config.secondThreshold - income) / config.secondRange;
    } else if (income <= config.finalThreshold) {
      amount = config.thirdBase * (config.finalThreshold - income) / config.thirdRange;
    }
    if (income > config.middleIncomeBonusFrom && income <= config.middleIncomeBonusTo) {
      amount += config.middleIncomeBonus;
    }
    var minimum = employmentType === 'fixed-term'
      ? config.fixedTermMinimum
      : config.permanentMinimum;
    if (income <= config.firstThreshold) amount = Math.max(amount, minimum);
    return currency.eurosToCents(Math.max(0, amount));
  }

  function calculateSupplementalDeductionCents(incomeCents, config) {
    var supplemental = config && config.supplemental;
    if (!supplemental) return 0;
    var income = currency.centsToEuros(incomeCents);
    if (income <= supplemental.from || income > supplemental.taperTo) return 0;
    if (income <= supplemental.fullTo) return currency.eurosToCents(supplemental.amount);
    return currency.eurosToCents(
      supplemental.amount * (supplemental.taperTo - income) /
      Math.max(1, supplemental.taperTo - supplemental.fullTo)
    );
  }

  function calculateEmployeeTaxDeductionDetails(taxableIncome, taxYear, employmentDays, options) {
    var settings = options || {};
    var taxConfig = settings.taxConfig || resolveTaxConfig(taxYear, settings.registry);
    var config = taxConfig && taxConfig.employeeDeduction;
    if (!config) {
      return {
        available: false,
        baseCents: 0,
        supplementalCents: 0,
        totalCents: 0,
        daysRatio: 0
      };
    }
    var incomeCents = currency.eurosToCents(taxableIncome);
    var maxDays = Math.max(1, Number(config.maxEmploymentDays) || 365);
    var days = Math.min(maxDays, Math.max(0, Math.round(Number(employmentDays) || 0)));
    var daysRatio = days / maxDays;
    var baseFullYear = calculateBaseDeductionCents(
      incomeCents,
      config,
      settings.employmentType || 'permanent'
    );
    var supplementalFullYear = calculateSupplementalDeductionCents(incomeCents, config);
    var baseCents = Math.round(baseFullYear * daysRatio);
    var supplementalCents = Math.round(supplementalFullYear * daysRatio);
    return {
      available: true,
      baseCents: baseCents,
      supplementalCents: supplementalCents,
      totalCents: baseCents + supplementalCents,
      daysRatio: daysRatio,
      employmentDays: days
    };
  }

  function calculateEmployeeTaxDeduction(taxableIncome, taxYear, employmentDays) {
    return currency.centsToEuros(
      calculateEmployeeTaxDeductionDetails(
        taxableIncome,
        taxYear,
        employmentDays
      ).totalCents
    );
  }

  return {
    calculateEmployeeTaxDeduction: calculateEmployeeTaxDeduction,
    calculateEmployeeTaxDeductionDetails: calculateEmployeeTaxDeductionDetails
  };
});
