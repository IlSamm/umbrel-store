(function (global) {
  'use strict';

  var lastViewKey = '';
  var cleanupTimer = 0;
  var cardSelector = [
    '.go-home-stack > *',
    '.calendar-v2-stack > *',
    '.analytics-stack > *',
    '.vacation-page > .vacation-page-hero',
    '.vacation-page > .vacation-page-insight',
    '.vacation-page > .vacation-page-projection',
    '.vacation-page > .vacation-page-actions',
    '.vacation-page > .vacation-page-history',
    '.salary-hub-stack > *',
    '.salary-archive-stack > *',
    '.payroll-stats-stack > *',
    '.payroll-estimate-stack > *',
    '.payroll-detail-stack > *',
    '.payroll-editor-stack > *',
    '.profile-page-v2 > section',
    '.exports-page > section',
    '.settings-page-v2 > section'
  ].join(',');

  function reduceMotion() {
    return !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function clearMotion(screen) {
    if (!screen) return;
    screen.classList.remove('go-view-enter');
    Array.prototype.forEach.call(screen.querySelectorAll('.go-card-enter-item'), function (item) {
      item.classList.remove('go-card-enter-item');
      item.style.removeProperty('--go-card-enter-delay');
    });
  }

  function render(screen, options) {
    if (!screen) return;
    options = options || {};

    var key = String(options.key || screen.getAttribute('data-go-screen') || '');
    if (!key || key === lastViewKey) return;

    var hadPreviousView = !!lastViewKey;
    lastViewKey = key;

    // The first screen is already covered by the splash. Replaying page motion here
    // makes the dashboard look as if it were loading a second time.
    if (!hadPreviousView || reduceMotion()) return;

    if (cleanupTimer) global.clearTimeout(cleanupTimer);
    clearMotion(screen);
    void screen.offsetWidth;

    screen.classList.add('go-view-enter');
    Array.prototype.slice.call(screen.querySelectorAll(cardSelector), 0, 8).forEach(function (item, index) {
      item.classList.add('go-card-enter-item');
      item.style.setProperty('--go-card-enter-delay', Math.min(42, index * 12) + 'ms');
    });

    cleanupTimer = global.setTimeout(function () {
      if (screen.isConnected) clearMotion(screen);
    }, 290);
  }

  global.GestOreMotion = {
    render: render,
    reset: function () {
      lastViewKey = '';
      if (cleanupTimer) global.clearTimeout(cleanupTimer);
      cleanupTimer = 0;
    }
  };
})(typeof window !== 'undefined' ? window : this);
