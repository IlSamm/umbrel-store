(function (root, factory) {
  var config = factory();
  root.GestOreTaxConfigs = root.GestOreTaxConfigs || {};
  root.GestOreTaxConfigs[config.taxYear] = config;
  if (typeof module === 'object' && module.exports) module.exports = config;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  return {
    taxYear: 2026,
    irpefBrackets: [
      { from: 0, to: 28000, rate: 23 },
      { from: 28000, to: 50000, rate: 33 },
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
        taxYear: 2026,
        brackets: [
          { from: 0, to: 15000, rate: 1.23 },
          { from: 15000, to: 28000, rate: 1.58 },
          { from: 28000, to: 50000, rate: 1.72 },
          { from: 50000, to: null, rate: 1.73 }
        ]
      }
    },
    municipalTaxes: {
      I873: {
        municipalityCode: 'I873',
        municipalityName: 'Sovere',
        region: 'Lombardia',
        province: 'BG',
        taxYear: 2026,
        exemptionThreshold: 0,
        mode: 'flat',
        brackets: [{ from: 0, to: null, rate: 0.8 }],
        advanceRate: 30,
        balanceRate: 70
      },
      D013: {
        municipalityCode: 'D013',
        municipalityName: 'Cormano',
        region: 'Lombardia',
        province: 'MI',
        taxYear: 2026,
        exemptionThreshold: 12000,
        mode: 'flat',
        brackets: [{ from: 0, to: null, rate: 0.8 }],
        advanceRate: 30,
        balanceRate: 70
      },
      F955: {
        municipalityCode: 'F955',
        municipalityName: 'Novate Milanese',
        region: 'Lombardia',
        province: 'MI',
        taxYear: 2026,
        exemptionThreshold: 12000,
        mode: 'flat',
        brackets: [{ from: 0, to: null, rate: 0.8 }],
        advanceRate: 30,
        balanceRate: 70
      },
      C536: {
        municipalityCode: 'C536',
        municipalityName: 'Cerro al Lambro',
        region: 'Lombardia',
        province: 'MI',
        taxYear: 2026,
        exemptionThreshold: 18000,
        mode: 'flat',
        brackets: [{ from: 0, to: null, rate: 0.8 }],
        advanceRate: 30,
        balanceRate: 70
      },
      E530: {
        municipalityCode: 'E530',
        municipalityName: 'Lentate sul Seveso',
        region: 'Lombardia',
        province: 'MB',
        taxYear: 2026,
        exemptionThreshold: 8500,
        mode: 'flat',
        brackets: [{ from: 0, to: null, rate: 0.8 }],
        advanceRate: 30,
        balanceRate: 70
      },
      A570: {
        municipalityCode: 'A570',
        municipalityName: 'Bagnolo Cremasco',
        region: 'Lombardia',
        province: 'CR',
        taxYear: 2026,
        exemptionThreshold: 13000,
        mode: 'progressive',
        brackets: [
          { from: 0, to: 28000, rate: 0.68 },
          { from: 28000, to: 50000, rate: 0.75 },
          { from: 50000, to: null, rate: 0.8 }
        ],
        advanceRate: 30,
        balanceRate: 70
      }
    },
    sourceLabel: 'Tabelle fiscali 2026',
    sourceUrl: 'https://www.gazzettaufficiale.it/eli/gu/2026/07/03/152/so/26/sg/pdf'
  };
});
