(function (global) {
  'use strict';

  var lastViewKey = '';
  var cleanupTimer = 0;

  function reduceMotion() {
    return !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function clearMotion(screen) {
    if (!screen) return;
    screen.classList.remove('go-view-enter', 'go-view-enter-forward', 'go-view-enter-back');
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
    screen.classList.add(options.direction === 'back' ? 'go-view-enter-back' : 'go-view-enter-forward');

    cleanupTimer = global.setTimeout(function () {
      if (screen.isConnected) clearMotion(screen);
    }, 190);
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
