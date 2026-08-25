(function () {
  var config = window.GestOreRuntimeConfig || {};
  var apiBaseUrl = String(config.apiBaseUrl || '').trim().replace(/\/+$/, '');
  var requestedMode = String(config.mode || '').trim().toLowerCase();
  var mode = requestedMode || (apiBaseUrl ? 'hosted' : 'web');
  var localOnly = mode === 'local';
  var originalFetch = window.fetch.bind(window);

  function rewriteApiUrl(input) {
    if (!apiBaseUrl) return input;
    if (typeof input === 'string') {
      if (input.indexOf('/api/') === 0) return apiBaseUrl + input;
      return input;
    }
    if (input instanceof URL && input.pathname.indexOf('/api/') === 0 && input.origin === window.location.origin) {
      return new URL(apiBaseUrl + input.pathname + input.search);
    }
    if (typeof Request !== 'undefined' && input instanceof Request) {
      var requestUrl = new URL(input.url, window.location.href);
      if (requestUrl.origin === window.location.origin && requestUrl.pathname.indexOf('/api/') === 0) {
        return new Request(apiBaseUrl + requestUrl.pathname + requestUrl.search, input);
      }
    }
    return input;
  }

  window.fetch = function (input, init) {
    var nextInit = Object.assign({}, init || {});
    if (apiBaseUrl) nextInit.credentials = nextInit.credentials || 'include';
    return originalFetch(rewriteApiUrl(input), nextInit);
  };

  window.GestOreRuntime = Object.freeze({
    apiBaseUrl: apiBaseUrl,
    mode: mode,
    localOnly: localOnly,
    usesRemoteApi: mode === 'hosted' && Boolean(apiBaseUrl),
    usesServer: mode === 'web' || mode === 'hosted'
  });
})();
