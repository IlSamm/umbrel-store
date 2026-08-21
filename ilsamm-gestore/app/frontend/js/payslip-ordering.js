(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.GestOrePayslipOrdering = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function getPeriodIndex(payslip) {
    var year = Number(payslip && payslip.year);
    var month = Number(payslip && payslip.month);
    if (!Number.isInteger(year) || year < 1900 || year > 2200) return null;
    if (!Number.isInteger(month) || month < 1 || month > 12) return null;
    return year * 12 + month - 1;
  }

  function getTimestamp(payslip) {
    var updatedAt = Number(payslip && payslip.updatedAt);
    if (Number.isFinite(updatedAt) && updatedAt > 0) return updatedAt;
    var createdAt = Number(payslip && payslip.createdAt);
    return Number.isFinite(createdAt) && createdAt > 0 ? createdAt : 0;
  }

  function compareNewestFirst(left, right) {
    var leftPeriod = getPeriodIndex(left);
    var rightPeriod = getPeriodIndex(right);
    if (leftPeriod === null && rightPeriod !== null) return 1;
    if (rightPeriod === null && leftPeriod !== null) return -1;
    if (leftPeriod !== rightPeriod) return rightPeriod - leftPeriod;

    var timestampDifference = getTimestamp(right) - getTimestamp(left);
    if (timestampDifference) return timestampDifference;
    return String(left && left.id || '').localeCompare(String(right && right.id || ''));
  }

  function sortNewestFirst(items) {
    return (Array.isArray(items) ? items : []).slice().sort(compareNewestFirst);
  }

  return {
    getPeriodIndex: getPeriodIndex,
    compareNewestFirst: compareNewestFirst,
    sortNewestFirst: sortNewestFirst
  };
});
