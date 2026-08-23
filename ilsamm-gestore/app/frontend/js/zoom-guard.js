(function () {
  'use strict';

  function isDocumentZoomTarget(target) {
    return Boolean(target && target.closest && target.closest('[data-payslip-zoom-surface], [data-pdf-zoom-surface]'));
  }

  ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (eventName) {
    document.addEventListener(eventName, function (event) {
      if (!isDocumentZoomTarget(event.target)) event.preventDefault();
    }, { passive: false, capture: true });
  });

  document.addEventListener('dblclick', function (event) {
    if (!isDocumentZoomTarget(event.target)) event.preventDefault();
  }, { passive: false, capture: true });

  document.addEventListener('wheel', function (event) {
    if ((event.ctrlKey || event.metaKey) && !isDocumentZoomTarget(event.target)) {
      event.preventDefault();
    }
  }, { passive: false, capture: true });
})();
