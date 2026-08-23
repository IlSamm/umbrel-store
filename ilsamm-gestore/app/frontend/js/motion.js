(function (global) {
  'use strict';

  var lastViewKey = '';
  var cleanupTimer = 0;

  var itemContainers = [
    '.go-home-stack',
    '.home-stack',
    '.calendar-v2-stack',
    '.analytics-stack',
    '.vacation-page',
    '.salary-hub-page',
    '.salary-hub-stack',
    '.salary-archive-page',
    '.payroll-stack',
    '.profile-page-v2',
    '.exports-page',
    '.settings-page-v2'
  ].join(',');

  var metricSelectors = [
    '.go-total-number',
    '.go-week-total-v3 > strong',
    '.go-card-badge',
    '.go-week-day-value-v3',
    '.go-month-ring-v3 strong',
    '.go-month-metric-v3 strong',
    '.go-month-footer-v3 strong',
    '.home-salary-preview strong',
    '.vacation-page-hero h2',
    '.vacation-page-ring strong',
    '.vacation-page-metrics strong',
    '.vacation-page-history-hours strong',
    '.analytics-total > strong',
    '.analytics-target-ring strong',
    '.analytics-hero-target > div > strong',
    '.analytics-hero-metrics strong',
    '.analytics-smart-strip strong',
    '.analytics-chart-summary strong',
    '.analytics-hours-donut strong',
    '.analytics-composition-list strong',
    '.analytics-days-grid strong',
    '.analytics-insight strong',
    '.analytics-month-value > strong',
    '.salary-hub-estimate',
    '.salary-hub-breakdown strong',
    '.salary-year-total > strong',
    '.salary-year-metrics strong',
    '.profile-v2-summary strong',
    '.exports-period-metrics strong'
  ].join(',');

  var progressSelectors = [
    '.go-week-progress-v3 > span',
    '.go-week-bar-v3 > i',
    '.go-month-share-v3 > span',
    '.analytics-target-track > span',
    '.analytics-month-value > span > i',
    '.analytics-days-bar > span',
    '.salary-year-bar > i'
  ].join(',');

  var ringSelectors = [
    '.go-month-ring-v3',
    '.vacation-page-ring',
    '.analytics-target-ring',
    '.analytics-hours-donut'
  ].join(',');

  function reduceMotion() {
    return !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function elementChildren(node) {
    return Array.prototype.filter.call(node && node.children ? node.children : [], function (child) {
      return child && child.nodeType === 1 && !child.hidden && !child.classList.contains('is-home-hidden');
    });
  }

  function collectItems(screen) {
    var items = [];

    function expand(node, depth) {
      if (!node || items.length >= 10) return;
      if (depth < 2 && node.matches && node.matches(itemContainers)) {
        elementChildren(node).forEach(function (child) { expand(child, depth + 1); });
        return;
      }
      items.push(node);
    }

    elementChildren(screen).forEach(function (node) { expand(node, 0); });
    return items.slice(0, 10);
  }

  function parseItalianNumber(value) {
    var source = String(value || '').replace(/\s/g, '');
    if (source.indexOf(',') !== -1) source = source.replace(/\./g, '').replace(',', '.');
    return Number(source);
  }

  function parseMetric(rawValue) {
    var raw = String(rawValue || '').replace(/\u00a0/g, ' ').trim();
    var match = raw.match(/^([+-]?)(\d+)\s*h(?:\s*(\d{1,2})\s*m)?$/i);
    if (match) {
      var sign = match[1] === '-' ? -1 : 1;
      var hasMinutes = match[3] !== undefined;
      var totalMinutes = sign * ((Number(match[2]) * 60) + Number(match[3] || 0));
      return {
        value: totalMinutes,
        format: function (value) {
          var rounded = Math.round(value);
          var prefix = rounded < 0 ? '-' : (match[1] === '+' ? '+' : '');
          var absolute = Math.abs(rounded);
          if (!hasMinutes) return prefix + Math.floor(absolute / 60) + 'h';
          return prefix + Math.floor(absolute / 60) + 'h ' + String(absolute % 60).padStart(2, '0') + 'm';
        }
      };
    }

    match = raw.match(/^([+-]?\d+(?:[.,]\d+)?)\s*%$/);
    if (match) {
      var percent = parseItalianNumber(match[1]);
      if (!Number.isFinite(percent)) return null;
      return {
        value: percent,
        format: function (value) { return Math.round(value) + '%'; }
      };
    }

    match = raw.match(/^([+-]?\d+(?:[.,]\d+)?)\s*gg$/i);
    if (match) {
      var days = parseItalianNumber(match[1]);
      if (!Number.isFinite(days)) return null;
      var hasDayDecimal = /[.,]/.test(match[1]);
      return {
        value: days,
        format: function (value) {
          return value.toLocaleString('it-IT', {
            minimumFractionDigits: hasDayDecimal ? 1 : 0,
            maximumFractionDigits: hasDayDecimal ? 1 : 0
          }) + ' gg';
        }
      };
    }

    if (raw.indexOf('€') !== -1) {
      var numericCurrency = raw.replace(/[^0-9,.-]/g, '');
      var euros = parseItalianNumber(numericCurrency);
      if (!Number.isFinite(euros)) return null;
      var currencyFirst = raw.indexOf('€') < raw.search(/\d/);
      return {
        value: euros,
        format: function (value) {
          var formatted = Number(value).toLocaleString('it-IT', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          });
          return currencyFirst ? ('€ ' + formatted) : (formatted + ' €');
        }
      };
    }

    match = raw.match(/^([+-]?\d+)$/);
    if (match) {
      return {
        value: Number(match[1]),
        format: function (value) { return String(Math.round(value)); }
      };
    }
    return null;
  }

  function animateMetric(node, index) {
    if (!node || node.children.length) return;
    var finalText = String(node.textContent || '').trim();
    var metric = parseMetric(finalText);
    if (!metric || !Number.isFinite(metric.value) || metric.value === 0) return;

    var delay = Math.min(120, 36 + (index * 12));
    var duration = 420;
    var startAt = 0;
    node.classList.add('go-counting');
    node.textContent = metric.format(0);

    function frame(now) {
      if (!node.isConnected) return;
      if (!startAt) startAt = now + delay;
      if (now < startAt) {
        global.requestAnimationFrame(frame);
        return;
      }
      var progress = Math.min(1, (now - startAt) / duration);
      var eased = 1 - Math.pow(1 - progress, 3);
      node.textContent = metric.format(metric.value * eased);
      if (progress < 1) {
        global.requestAnimationFrame(frame);
        return;
      }
      node.textContent = finalText;
      node.classList.remove('go-counting');
    }

    global.requestAnimationFrame(frame);
  }

  function render(screen, options) {
    if (!screen) return;
    options = options || {};
    var key = String(options.key || screen.getAttribute('data-go-screen') || '');
    if (!key || key === lastViewKey) return;
    lastViewKey = key;
    if (reduceMotion() || !global.requestAnimationFrame) return;

    if (cleanupTimer) global.clearTimeout(cleanupTimer);
    screen.classList.remove('go-page-entering');
    screen.classList.add('go-page-entering');
    screen.setAttribute('data-go-motion-direction', options.direction === 'back' ? 'back' : 'forward');

    var items = screen.classList.contains('stats-screen') ? [] : collectItems(screen);
    items.forEach(function (item, index) {
      item.classList.add('go-motion-item');
      item.style.setProperty('--go-motion-delay', Math.min(90, index * 14) + 'ms');
    });

    var progressNodes = Array.prototype.slice.call(screen.querySelectorAll(progressSelectors));
    progressNodes.forEach(function (node, index) {
      node.classList.add('go-progress-motion');
      if (node.matches('.go-week-bar-v3 > i, .salary-year-bar > i')) node.classList.add('go-progress-vertical');
      node.style.setProperty('--go-progress-delay', Math.min(130, 70 + (index * 10)) + 'ms');
    });
    var ringNodes = Array.prototype.slice.call(screen.querySelectorAll(ringSelectors));
    ringNodes.forEach(function (node, index) {
      node.classList.add('go-ring-motion');
      node.style.setProperty('--go-ring-delay', Math.min(120, 55 + (index * 14)) + 'ms');
    });

    Array.prototype.slice.call(screen.querySelectorAll(metricSelectors)).forEach(animateMetric);

    cleanupTimer = global.setTimeout(function () {
      if (screen.isConnected) screen.classList.remove('go-page-entering');
      items.forEach(function (item) {
        item.classList.remove('go-motion-item');
        item.style.removeProperty('--go-motion-delay');
      });
      progressNodes.forEach(function (node) {
        node.classList.remove('go-progress-motion', 'go-progress-vertical');
        node.style.removeProperty('--go-progress-delay');
      });
      ringNodes.forEach(function (node) {
        node.classList.remove('go-ring-motion');
        node.style.removeProperty('--go-ring-delay');
      });
    }, 620);
  }

  global.GestOreMotion = {
    render: render,
    reset: function () { lastViewKey = ''; }
  };
})(typeof window !== 'undefined' ? window : this);
