(function (root, factory) {
  function browserApi() { return root.GestOrePayroll || {}; }
  var currency = typeof module === 'object' && module.exports ? require('./currency-utils.js') : browserApi();
  var validation = typeof module === 'object' && module.exports ? require('./payroll-validation.js') : browserApi();
  var contributions = typeof module === 'object' && module.exports ? require('./contribution-calculator.js') : browserApi();
  var progressive = typeof module === 'object' && module.exports ? require('./progressive-tax-calculator.js') : browserApi();
  var deductions = typeof module === 'object' && module.exports ? require('./employee-deduction-calculator.js') : browserApi();
  var regional = typeof module === 'object' && module.exports ? require('./regional-tax-calculator.js') : browserApi();
  var municipal = typeof module === 'object' && module.exports ? require('./municipal-tax-calculator.js') : browserApi();
  var api = factory(root, currency, validation, contributions, progressive, deductions, regional, municipal);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.GestOrePayroll = Object.assign(root.GestOrePayroll || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (
  root,
  currency,
  validation,
  contributions,
  progressive,
  deductions,
  regional,
  municipal
) {
  'use strict';

  function proportionalCents(totalCents, portionCents, annualGrossCents) {
    if (!annualGrossCents || !portionCents) return 0;
    return Math.round((Number(totalCents) || 0) * portionCents / annualGrossCents);
  }

  function buildPeriodAllocation(grossCents, annualGrossCents, annual) {
    var contributionCents = proportionalCents(annual.contributionsCents, grossCents, annualGrossCents);
    var irpefCents = proportionalCents(annual.netIrpefCents, grossCents, annualGrossCents);
    var regionalCents = proportionalCents(annual.regionalTaxCents, grossCents, annualGrossCents);
    var municipalCents = proportionalCents(annual.municipalTaxCents, grossCents, annualGrossCents);
    var otherDeductionsCents = proportionalCents(annual.otherDeductionsCents, grossCents, annualGrossCents);
    var reimbursementsCents = proportionalCents(annual.reimbursementsCents, grossCents, annualGrossCents);
    return {
      grossCents: grossCents,
      contributionCents: contributionCents,
      irpefCents: irpefCents,
      regionalCents: regionalCents,
      municipalCents: municipalCents,
      otherDeductionsCents: otherDeductionsCents,
      reimbursementsCents: reimbursementsCents,
      netCents: Math.max(
        0,
        grossCents - contributionCents - irpefCents - regionalCents -
        municipalCents - otherDeductionsCents + reimbursementsCents
      )
    };
  }

  function calculatePayrollEstimate(source, registry) {
    var configs = registry || root.GestOreTaxConfigs || {};
    var checked = validation.validatePayrollInput(source, configs);
    if (!checked.valid) {
      return {
        valid: false,
        input: checked.input,
        errors: checked.errors,
        incomplete: true,
        incompleteReasons: ['Correggi i campi evidenziati per calcolare la stima.']
      };
    }

    var input = checked.input;
    var taxConfig = configs[input.taxYear];
    var baseMonthlyCents = currency.eurosToCents(input.baseMonthlyGross);
    var overtimeHourlyCents = currency.eurosToCents(input.overtimeHourlyRate);
    var overtimeMonthlyCents = currency.multiplyCents(overtimeHourlyCents, input.overtimeHoursMonthly);
    var baseAnnualCents = baseMonthlyCents * input.salaryMonths;
    var overtimeAnnualCents = overtimeMonthlyCents * input.monthsWithOvertime;
    var otherAnnualGrossCents = currency.eurosToCents(input.otherAnnualGross);
    var totalAnnualGrossCents = baseAnnualCents + overtimeAnnualCents + otherAnnualGrossCents;

    var contributionsCents = contributions.calculateContributionsCents(
      totalAnnualGrossCents,
      input.employeeContributionRate
    );
    var taxableIncomeCents = Math.max(0, totalAnnualGrossCents - contributionsCents);
    var grossIrpefCents = progressive.calculateProgressiveTaxCents(
      taxableIncomeCents,
      taxConfig.irpefBrackets
    );
    var deductionDetails = deductions.calculateEmployeeTaxDeductionDetails(
      currency.centsToEuros(taxableIncomeCents),
      input.taxYear,
      input.employmentDays,
      {
        registry: configs,
        taxConfig: taxConfig,
        employmentType: input.employmentType
      }
    );
    var employeeDeductionCents = Math.min(grossIrpefCents, deductionDetails.totalCents);
    var netIrpefCents = Math.max(0, grossIrpefCents - employeeDeductionCents);
    var regionalDetails = regional.calculateRegionalTaxDetails(
      currency.centsToEuros(taxableIncomeCents),
      input.region,
      input.taxYear,
      configs
    );
    var municipalityConfig = municipal.findMunicipalTaxConfig(
      input.municipality,
      input.taxYear,
      configs,
      input.region
    );
    var municipalDetails = municipal.calculateMunicipalTaxDetails(
      currency.centsToEuros(taxableIncomeCents),
      municipalityConfig
    );
    if (!municipalDetails.available && input.municipality) {
      municipalDetails.message = 'Il Comune "' + input.municipality +
        '" non e disponibile nelle tabelle fiscali ' + input.taxYear +
        '. Seleziona un Comune suggerito per includere l addizionale comunale.';
    }
    var otherDeductionsCents = currency.eurosToCents(input.otherAnnualDeductions);
    var reimbursementsCents = currency.eurosToCents(input.annualReimbursements);
    var estimatedAnnualNetCents = Math.max(
      0,
      totalAnnualGrossCents - contributionsCents - netIrpefCents -
      regionalDetails.taxCents - municipalDetails.taxCents -
      otherDeductionsCents + reimbursementsCents
    );
    var annual = {
      contributionsCents: contributionsCents,
      netIrpefCents: netIrpefCents,
      regionalTaxCents: regionalDetails.taxCents,
      municipalTaxCents: municipalDetails.taxCents,
      otherDeductionsCents: otherDeductionsCents,
      reimbursementsCents: reimbursementsCents
    };
    var ordinaryMonth = buildPeriodAllocation(baseMonthlyCents, totalAnnualGrossCents, annual);
    var monthWithOvertime = buildPeriodAllocation(
      baseMonthlyCents + overtimeMonthlyCents,
      totalAnnualGrossCents,
      annual
    );
    var thirteenth = input.salaryMonths >= 13
      ? buildPeriodAllocation(baseMonthlyCents, totalAnnualGrossCents, annual)
      : buildPeriodAllocation(0, totalAnnualGrossCents, annual);
    var fourteenth = input.salaryMonths >= 14
      ? buildPeriodAllocation(baseMonthlyCents, totalAnnualGrossCents, annual)
      : buildPeriodAllocation(0, totalAnnualGrossCents, annual);
    var incompleteReasons = [];
    if (!regionalDetails.available) incompleteReasons.push(regionalDetails.message);
    if (!municipalDetails.available) incompleteReasons.push(municipalDetails.message);

    return {
      valid: true,
      input: input,
      errors: {},
      incomplete: incompleteReasons.length > 0,
      incompleteReasons: incompleteReasons,
      regionalAvailable: regionalDetails.available,
      municipalAvailable: municipalDetails.available,
      municipalityConfig: municipalityConfig,
      municipalMessage: municipalDetails.message,
      regionalMessage: regionalDetails.message,
      baseMonthlyGross: currency.centsToEuros(baseMonthlyCents),
      overtimeMonthlyGross: currency.centsToEuros(overtimeMonthlyCents),
      totalMonthlyGross: currency.centsToEuros(baseMonthlyCents + overtimeMonthlyCents),
      baseAnnualGross: currency.centsToEuros(baseAnnualCents),
      overtimeAnnualGross: currency.centsToEuros(overtimeAnnualCents),
      otherAnnualGross: currency.centsToEuros(otherAnnualGrossCents),
      totalAnnualGross: currency.centsToEuros(totalAnnualGrossCents),
      annualContributions: currency.centsToEuros(contributionsCents),
      annualTaxableIncome: currency.centsToEuros(taxableIncomeCents),
      annualGrossIrpef: currency.centsToEuros(grossIrpefCents),
      employeeDeduction: currency.centsToEuros(employeeDeductionCents),
      baseEmployeeDeduction: currency.centsToEuros(deductionDetails.baseCents),
      supplementalEmployeeDeduction: currency.centsToEuros(deductionDetails.supplementalCents),
      annualNetIrpef: currency.centsToEuros(netIrpefCents),
      annualRegionalTax: currency.centsToEuros(regionalDetails.taxCents),
      annualMunicipalTax: currency.centsToEuros(municipalDetails.taxCents),
      annualMunicipalAdvance: currency.centsToEuros(municipalDetails.advanceCents),
      annualMunicipalBalance: currency.centsToEuros(municipalDetails.balanceCents),
      annualOtherDeductions: currency.centsToEuros(otherDeductionsCents),
      annualReimbursements: currency.centsToEuros(reimbursementsCents),
      estimatedAnnualNet: currency.centsToEuros(estimatedAnnualNetCents),
      estimatedOrdinaryMonthNet: currency.centsToEuros(ordinaryMonth.netCents),
      estimatedMonthWithOvertimeNet: currency.centsToEuros(monthWithOvertime.netCents),
      estimatedThirteenthNet: currency.centsToEuros(thirteenth.netCents),
      estimatedFourteenthNet: currency.centsToEuros(fourteenth.netCents),
      monthlyBreakdown: {
        ordinary: ordinaryMonth,
        withOvertime: monthWithOvertime,
        thirteenth: thirteenth,
        fourteenth: fourteenth
      },
      annualBreakdownCents: {
        baseAnnualGrossCents: baseAnnualCents,
        overtimeAnnualGrossCents: overtimeAnnualCents,
        otherAnnualGrossCents: otherAnnualGrossCents,
        totalAnnualGrossCents: totalAnnualGrossCents,
        contributionsCents: contributionsCents,
        taxableIncomeCents: taxableIncomeCents,
        grossIrpefCents: grossIrpefCents,
        employeeDeductionCents: employeeDeductionCents,
        netIrpefCents: netIrpefCents,
        regionalTaxCents: regionalDetails.taxCents,
        municipalTaxCents: municipalDetails.taxCents,
        municipalAdvanceCents: municipalDetails.advanceCents,
        municipalBalanceCents: municipalDetails.balanceCents,
        otherDeductionsCents: otherDeductionsCents,
        reimbursementsCents: reimbursementsCents,
        estimatedAnnualNetCents: estimatedAnnualNetCents
      },
      irpefBreakdown: progressive.getProgressiveTaxBreakdown(
        taxableIncomeCents,
        taxConfig.irpefBrackets
      ),
      regionalBreakdown: regionalDetails.breakdown || [],
      municipalBreakdown: municipalDetails.breakdown || [],
      taxConfig: {
        taxYear: taxConfig.taxYear,
        sourceLabel: taxConfig.sourceLabel,
        sourceUrl: taxConfig.sourceUrl
      }
    };
  }

  return {
    calculatePayrollEstimate: calculatePayrollEstimate,
    buildPayrollPeriodAllocation: buildPeriodAllocation
  };
});
