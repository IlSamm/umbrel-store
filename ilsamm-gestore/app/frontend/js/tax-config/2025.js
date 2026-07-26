(function (root, factory) {
  var config = factory();
  root.GestOreTaxConfigs = root.GestOreTaxConfigs || {};
  root.GestOreTaxConfigs[config.taxYear] = config;
  if (typeof module === 'object' && module.exports) module.exports = config;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  return {
    taxYear: 2025,
    irpefBrackets: [
      { from: 0, to: 28000, rate: 23 },
      { from: 28000, to: 50000, rate: 35 },
      { from: 50000, to: null, rate: 43 }
    ],
    employeeDeduction: {
      firstThreshold: 15000,
      secondThreshold: 28000,
      finalThreshold: 50000,
      firstAmount: 1955,
      secondBase: 1910,
      secondVariable: 1190,
      secondRange: 13000,
      thirdBase: 1910,
      thirdRange: 22000,
      middleIncomeBonus: 65,
      middleIncomeBonusFrom: 25000,
      middleIncomeBonusTo: 35000,
      permanentMinimum: 690,
      fixedTermMinimum: 1380,
      supplemental: {
        from: 20000,
        fullTo: 32000,
        taperTo: 40000,
        amount: 1000
      },
      maxEmploymentDays: 365
    },
    regionalTaxes: {
      lombardia: {
        region: 'Lombardia',
        taxYear: 2025,
        brackets: [
          { from: 0, to: 15000, rate: 1.23 },
          { from: 15000, to: 28000, rate: 1.58 },
          { from: 28000, to: 50000, rate: 1.72 },
          { from: 50000, to: null, rate: 1.73 }
        ]
      }
    },
    municipalTaxes: {
      F205: {
        municipalityCode: 'F205',
        municipalityName: 'Milano',
        region: 'Lombardia',
        province: 'MI',
        taxYear: 2025,
        exemptionThreshold: 23000,
        mode: 'flat',
        brackets: [{ from: 0, to: null, rate: 0.8 }],
        advanceRate: 30,
        balanceRate: 70
      }
    },
    sourceLabel: 'Tabelle fiscali 2025',
    sourceUrl: 'https://www.gazzettaufficiale.it/eli/id/2025/06/21/25A03553/SG'
  };
});
