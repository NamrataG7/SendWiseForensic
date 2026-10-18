// shared/detection-library/gzip-fetch.js
//
// Fetch + gzip-decompress + JSON.parse a model file, using the browser's
// native DecompressionStream (Chrome 80+, standard Web Streams API). This
// mirrors the Kotlin side's `GZIPInputStream(input)` + `JSONObject(jsonText)`
// pipeline (RandomForestTextClassifier.kt load()), with no external
// dependency (no pako.js) — matching the Kotlin implementation's
// dependency-free philosophy.
//
// Content-script execution context note: DecompressionStream is a standard
// Web API exposed on the global object in the renderer process. MV3 content
// scripts run in an isolated JS world but share the page's Web Platform API
// surface (fetch, streams, etc. are all available) — this has been verified
// to work in Chrome's content-script context with no additional permissions
// needed beyond the existing host_permissions (for same-origin asset fetch
// via chrome.runtime.getURL(), which always resolves to the extension's own
// origin, not the page's).
//
// Usage:
//   const model = await fetchGzipJson(chrome.runtime.getURL('vendor/models/sendwise_rf_v1.json.gz'));

(function (root) {
  'use strict';

  /**
   * @param {string} url - URL to a gzip-compressed JSON file.
   * @returns {Promise<Object>} parsed JSON object.
   */
  async function fetchGzipJson(url) {
    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error('fetchGzipJson: HTTP ' + resp.status + ' for ' + url);
    }
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('fetchGzipJson: DecompressionStream unavailable in this context');
    }
    if (!resp.body) {
      // Some environments (very old fetch polyfills) may not expose a
      // ReadableStream body. Fail loudly so callers fall through to the
      // lexicon fallback rather than silently returning bad data.
      throw new Error('fetchGzipJson: response has no streamable body');
    }
    const ds = new DecompressionStream('gzip');
    const stream = resp.body.pipeThrough(ds);
    const text = await new Response(stream).text();
    return JSON.parse(text);
  }

  root.SendWiseGzipFetch = { fetchGzipJson: fetchGzipJson };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { fetchGzipJson: fetchGzipJson };
  }
}(typeof self !== 'undefined' ? self : this));
