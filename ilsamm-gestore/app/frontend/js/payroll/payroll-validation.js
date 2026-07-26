(function (root, factory) {
  var currency = typeof module === 'object' && module.exports
    ? require('./currency-utils.js')
    : (root.GestOrePayroll || {});
  var types = typeof module === 'object' && module.exports
    ? require('./payroll-types.js')
    : (root.GestOrePayroll || {});
  var api = factory(root, currency, types);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.GestOrePayroll = Object.assign(root.GestOrePayroll || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root, currency, types) {
  'use strict';

  function hasOwn(source, key) {
    return Object.prototype.hasOwnProperty.call(source || {}, key);
  }

  function readNumber(source, key, fallback) {
    if (!hasOwn(source, key)) return currency.parseLocaleNumber(fallback, fallback);
    var value = source[key];
    if (value === null || value === undefined || String(value).trim() === '') return 0;
    return currency.parseLocaleNumber(value, fallback);
  }

  function isMalformedNumber(source, key, allowBlank) {
    if (!hasOwn(source, key)) return false;
    var value = source[key];
    if (value === null || value === undefined) return !allowBlank;
    if (typeof value === 'number') return !Number.isFinite(value);
    var text = String(value).trim().replace(/\s|\u00a0|€/g, '');
    if (!text) return !allowBlank;
    if (text.indexOf(',') !== -1) {
      text = text.replace(/\./g, '').replace(',', '.');
    } else if (/^-?\d{1,3}(?:\.\d{3})+$/.test(text)) {
      text = text.replace(/\./g, '');
    }
    return !Number.isFinite(Number(text));
  }

  function normalizePayrollInput(source) {
    var raw = source && typeof source === 'object' ? source : {};
    var defaults = types.DEFAULT_PAYROLL_INPUT;
    return {
      baseMonthlyGross: readNumber(raw, 'baseMonthlyGross', defaults.baseMonthlyGross),
      salaryMonths: Math.round(readNumber(raw, 'salaryMonths', defaults.salaryMonths)),
      overtimeHoursMonthly: readNumber(raw, 'overtimeHoursMonthly', defaults.overtimeHoursMonthly),
      overtimeHourlyRate: readNumber(raw, 'overtimeHourlyRate', defaults.overtimeHourlyRate),
      monthsWithOvertime: Math.round(readNumber(raw, 'monthsWithOvertime', defaults.monthsWithOvertime)),
      otherAnnualGross: readNumber(raw, 'otherAnnualGross', defaults.otherAnnualGross),
      employeeContributionRate: readNumber(raw, 'employeeContributionRate', defaults.employeeContributionRate),
      region: String(hasOwn(raw, 'region') ? raw.region : defaults.region).trim(),
      municipality: String(hasOwn(raw, 'municipality') ? raw.municipality : defaults.municipality).trim(),
      taxYear: Math.round(readNumber(raw, 'taxYear', defaults.taxYear)),
      employmentDays: Math.round(readNumber(raw, 'employmentDays', defaults.employmentDays)),
      employmentType: String(hasOwn(raw, 'employmentType') ? raw.employmentType : defaults.employmentType) === 'fixed-term'
        ? 'fixed-term'
        : 'permanent',
      otherAnnualDeductions: readNumber(raw, 'otherAnnualDeductions', defaults.otherAnnualDeductions),
      annualReimbursements: readNumber(raw, 'annualReimbursements', defaults.annualReimbursements)
    };
  }

  function validateRange(errors, field, label, value, min, max) {
    if (!Number.isFinite(value)) {
      errors[field] = label + ': inserisci un numero valido.';
    } else if (value < min || value > max) {
      errors[field] = label + ': usa un valore tra ' + min + ' e ' + max + '.';
    }
  }

  function validatePayrollInput(source, registry) {
    var input = normalizePayrollInput(source);
    var errors = {};
    validateRange(errors, 'baseMonthlyGross', 'Lordo mensile', input.baseMonthlyGross, 0.01, 1000000);
    if ([12, 13, 14].indexOf(input.salaryMonths) === -1) {
      errors.salaryMonths = 'Le mensilita ammesse sono 12, 13 o 14.';
    }
    validateRange(errors, 'overtimeHoursMonthly', 'Ore straordinarie', input.overtimeHoursMonthly, 0, 250);
    validateRange(errors, 'overtimeHourlyRate', 'Paga straordinaria', input.overtimeHourlyRate, 0, 10000);
    validateRange(errors, 'monthsWithOvertime', 'Mesi con straordinari', input.monthsWithOvertime, 0, 12);
    validateRange(errors, 'otherAnnualGross', 'Altri compensi', input.otherAnnualGross, 0, 10000000);
    validateRange(errors, 'employeeContributionRate', 'Aliquota INPS', input.employeeContributionRate, 0, 100);
    validateRange(errors, 'employmentDays', 'Giorni di lavoro', input.employmentDays, 1, 366);
    validateRange(errors, 'otherAnnualDeductions', 'Altre trattenute', input.otherAnnualDeductions, 0, 10000000);
    validateRange(errors, 'annualReimbursements', 'Rimborsi', input.annualReimbursements, 0, 10000000);
    [
      ['baseMonthlyGross', 'Lordo mensile', false],
      ['salaryMonths', 'Mensilita', false],
      ['overtimeHoursMonthly', 'Ore straordinarie', true],
      ['overtimeHourlyRate', 'Paga straordinaria', true],
      ['monthsWithOvertime', 'Mesi con straordinari', false],
      ['otherAnnualGross', 'Altri compensi', true],
      ['employeeContributionRate', 'Aliquota INPS', false],
      ['taxYear', 'Anno fiscale', false],
      ['employmentDays', 'Giorni di lavoro', false],
      ['otherAnnualDeductions', 'Altre trattenute', true],
      ['annualReimbursements', 'Rimborsi', true]
    ].forEach(function (definition) {
      if (isMalformedNumber(source, definition[0], definition[2])) {
        errors[definition[0]] = definition[1] + ': inserisci un numero valido.';
      }
    });
    if (!input.region) errors.region = 'Seleziona la Regione di residenza.';
    var configs = registry || root.GestOreTaxConfigs || {};
    if (!configs[input.taxYear]) {
      errors.taxYear = 'Tabelle fiscali non disponibili per l\'anno selezionato.';
    }
    return {
      valid: Object.keys(errors).length === 0,
      input: input,
      errors: errors
    };
  }

  return {
    normalizePayrollInput: normalizePayrollInput,
    validatePayrollInput: validatePayrollInput
  };
});
