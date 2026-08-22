(function () {
  'use strict';

  function isPayslipViewerTarget(target) {
    return Boolean(target && target.closest && target.closest('[data-payslip-zoom-surface]'));
  }

  ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (eventName) {
    document.addEventListener(eventName, function (event) {
      if (!isPayslipViewerTarget(event.target)) event.preventDefault();
    }, { passive: false, capture: true });
  });

  document.addEventListener('dblclick', function (event) {
    if (!isPayslipViewerTarget(event.target)) event.preventDefault();
  }, { passive: false, capture: true });

  document.addEventListener('wheel', function (event) {
    if ((event.ctrlKey || event.metaKey) && !isPayslipViewerTarget(event.target)) {
      event.preventDefault();
    }
  }, { passive: false, capture: true });
})();
