(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.GestOrePayroll = Object.assign(root.GestOrePayroll || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /**
   * @typedef {{from:number,to:(number|null),rate:number}} TaxBracket
   * @typedef {{
   *   municipalityCode:string,
   *   municipalityName:string,
   *   taxYear:number,
   *   exemptionThreshold:number,
   *   brackets:TaxBracket[]
   * }} MunicipalTaxConfig
   * @typedef {{
   *   baseAnnualGross:number,
   *   overtimeAnnualGross:number,
   *   totalAnnualGross:number,
   *   annualContributions:number,
   *   annualTaxableIncome:number,
   *   annualGrossIrpef:number,
   *   employeeDeduction:number,
   *   annualNetIrpef:number,
   *   annualRegionalTax:number,
   *   annualMunicipalTax:number,
   *   estimatedAnnualNet:number,
   *   estimatedOrdinaryMonthNet:number,
   *   estimatedMonthWithOvertimeNet:number,
   *   estimatedThirteenthNet:number,
   *   estimatedFourteenthNet:number
   * }} PayrollEstimate
   */

  var DEFAULT_PAYROLL_INPUT = Object.freeze({
    baseMonthlyGross: 1766,
    salaryMonths: 14,
    overtimeHoursMonthly: 20,
    overtimeHourlyRate: 10.98,
    monthsWithOvertime: 12,
    otherAnnualGross: 0,
    employeeContributionRate: 9.19,
    region: 'Lombardia',
    municipality: '',
    taxYear: 2026,
    employmentDays: 365,
    employmentType: 'permanent',
    otherAnnualDeductions: 0,
    annualReimbursements: 0,
    privateReconciliationEnabled: false,
    privateReconciliationHourlyRate: 0
  });

  // The calculator keeps documented reference values, while a new account
  // starts from an intentionally empty form and never inherits demo data.
  var EMPTY_PAYROLL_INPUT = Object.freeze({
    baseMonthlyGross: 0,
    salaryMonths: 12,
    overtimeHoursMonthly: 0,
    overtimeHourlyRate: 0,
    monthsWithOvertime: 0,
    otherAnnualGross: 0,
    employeeContributionRate: 0,
    region: '',
    municipality: '',
    taxYear: 2026,
    employmentDays: 0,
    employmentType: 'permanent',
    otherAnnualDeductions: 0,
    annualReimbursements: 0,
    privateReconciliationEnabled: false,
    privateReconciliationHourlyRate: 0
  });

  var ITALIAN_REGIONS = Object.freeze([
    'Abruzzo', 'Basilicata', 'Calabria', 'Campania', 'Emilia-Romagna',
    'Friuli-Venezia Giulia', 'Lazio', 'Liguria', 'Lombardia', 'Marche',
    'Molise', 'Piemonte', 'Puglia', 'Sardegna', 'Sicilia', 'Toscana',
    'Trentino-Alto Adige', 'Umbria', "Valle d'Aosta", 'Veneto'
  ]);

  return {
    PAYROLL_SCHEMA_VERSION: 2,
    DEFAULT_PAYROLL_INPUT: DEFAULT_PAYROLL_INPUT,
    EMPTY_PAYROLL_INPUT: EMPTY_PAYROLL_INPUT,
    ITALIAN_REGIONS: ITALIAN_REGIONS
  };
});
