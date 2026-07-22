(function () {
  var overlay = document.getElementById('operationLoader');
  if (!overlay) return;

  var titleNode = document.getElementById('operationLoaderTitle');
  var messageNode = document.getElementById('operationLoaderMessage');
  var progressNode = document.getElementById('operationLoaderProgress');
  var tasks = new Map();
  var sequence = 0;
  var showTimer = 0;
  var hideTimer = 0;
  var visibleAt = 0;

  function normalizeOptions(options) {
    if (typeof options === 'string') options = { title: options };
    options = options || {};
    var hasProgress = options.progress !== null && options.progress !== undefined && options.progress !== '';
    return {
      title: String(options.title || 'Un momento'),
      message: String(options.message || 'Sto completando l\'operazione in sicurezza'),
      kind: String(options.kind || 'loading'),
      delay: Math.max(0, Number(options.delay) || 0),
      minVisible: Math.max(320, Number(options.minVisible) || 620),
      progress: hasProgress && Number.isFinite(Number(options.progress)) ? Math.max(0, Math.min(1, Number(options.progress))) : null,
      dismissKeyboard: options.dismissKeyboard === true
    };
  }

  function latestTask() {
    var latest = null;
    tasks.forEach(function (task) {
      if (!latest || task.order > latest.order) latest = task;
    });
    return latest;
  }

  function paint(task) {
    if (!task) return;
    if (titleNode) titleNode.textContent = task.title;
    if (messageNode) messageNode.textContent = task.message;
    overlay.dataset.kind = task.kind;
    overlay.classList.toggle('has-progress', task.progress !== null);
    if (progressNode) progressNode.style.setProperty('--operation-progress', ((task.progress === null ? 0 : task.progress) * 100) + '%');
  }

  function reveal() {
    showTimer = 0;
    var task = latestTask();
    if (!task) return;
    if (document.body && document.body.classList.contains('app-booting')) {
      showTimer = window.setTimeout(reveal, 120);
      return;
    }
    paint(task);
    if (hideTimer) {
      window.clearTimeout(hideTimer);
      hideTimer = 0;
    }
    if (overlay.classList.contains('open')) return;
    visibleAt = Date.now();
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    if (document.body) document.body.classList.add('operation-loading');
  }

  function scheduleReveal(delay) {
    if (hideTimer) {
      window.clearTimeout(hideTimer);
      hideTimer = 0;
    }
    if (overlay.classList.contains('open')) {
      paint(latestTask());
      return;
    }
    if (showTimer) window.clearTimeout(showTimer);
    showTimer = window.setTimeout(reveal, Math.max(0, delay));
  }

  function hideNow() {
    hideTimer = 0;
    visibleAt = 0;
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.removeAttribute('data-kind');
    if (document.body) document.body.classList.remove('operation-loading');
  }

  function begin(options) {
    var normalized = normalizeOptions(options);
    if (normalized.dismissKeyboard) {
      var active = document.activeElement;
      var tag = active && String(active.tagName || '').toLowerCase();
      if (active && (tag === 'input' || tag === 'textarea' || tag === 'select' || active.isContentEditable) && typeof active.blur === 'function') active.blur();
    }
    var token = 'operation-' + Date.now() + '-' + (++sequence);
    tasks.set(token, Object.assign({}, normalized, { token: token, order: sequence }));
    paint(latestTask());
    scheduleReveal(normalized.delay);
    return token;
  }

  function update(token, options) {
    var current = tasks.get(token);
    if (!current) return false;
    var next = Object.assign({}, current, normalizeOptions(Object.assign({}, current, options || {})), { token: token, order: current.order });
    tasks.set(token, next);
    if (latestTask() === next || overlay.classList.contains('open')) paint(latestTask());
    return true;
  }

  function end(token) {
    var ended = tasks.get(token);
    if (!ended) return;
    tasks.delete(token);
    var remaining = latestTask();
    if (remaining) {
      paint(remaining);
      return;
    }
    if (showTimer) {
      window.clearTimeout(showTimer);
      showTimer = 0;
    }
    if (!overlay.classList.contains('open')) {
      hideNow();
      return;
    }
    var elapsed = Date.now() - visibleAt;
    var wait = Math.max(0, ended.minVisible - elapsed);
    if (hideTimer) window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(hideNow, wait);
  }

  function clear() {
    tasks.clear();
    if (showTimer) window.clearTimeout(showTimer);
    if (hideTimer) window.clearTimeout(hideTimer);
    showTimer = 0;
    hideTimer = 0;
    hideNow();
  }

  async function run(options, operation) {
    var token = begin(options);
    try {
      return await operation(token);
    } finally {
      end(token);
    }
  }

  window.GestOreLoading = {
    begin: begin,
    update: update,
    end: end,
    clear: clear,
    run: run,
    isVisible: function () { return overlay.classList.contains('open'); }
  };

  window.addEventListener('pageshow', function (event) {
    if (event.persisted) clear();
  });
})();
