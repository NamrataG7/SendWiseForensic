// shared/detection-library/rf-classifier.js
//
// Faithful JS port of RandomForestTextClassifier.kt — a TF-IDF + RandomForest
// text classifier loader/runner, exported by `model_training/export_to_kotlin_json.py`
// and shipped as gzip-JSON (see shared/models/MODEL_CARD.json).
//
// Schema (identical to the Kotlin loader's JSONObject parsing):
//   model_name, version, task ("binary"|"multiclass"), n_features, n_classes,
//   threshold, classes[], vocabulary{term:idx}, idf[], trees[]
// Each tree: feature[], threshold[], children_left[], children_right[], value[][]
// Leaves have children_left[i] === -1; value[i] holds raw class weights/counts
// which are normalised on the fly to a probability vector (see Tree.predictProba
// in the Kotlin source).
//
// No build step — loaded directly as a browser content script (UMD-style
// global assignment), mirroring the sibling vendor/detection-library/*.js files.

(function (root) {
  'use strict';

  // Mirrors sklearn TfidfVectorizer defaults:
  //   token_pattern = r"(?u)\b\w\w+\b", lowercase=True, strip_accents='unicode'
  var TOKEN_RE = /\b\w\w+\b/gu;

  /** Strip combining diacritical marks after NFD normalization (stripAccents). */
  function stripAccents(s) {
    return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  /** Tokenize text exactly like the Kotlin tokenize(): lowercase, strip accents, regex-match. */
  function tokenize(text) {
    if (!text) return [];
    var stripped = stripAccents(text.toLowerCase());
    var tokens = [];
    var m;
    // Reset lastIndex since TOKEN_RE is a shared `g` regex.
    TOKEN_RE.lastIndex = 0;
    while ((m = TOKEN_RE.exec(stripped)) !== null) {
      tokens.push(m[0]);
      // Guard against zero-length match infinite loop (shouldn't happen with \b\w\w+\b).
      if (m[0].length === 0) TOKEN_RE.lastIndex++;
    }
    return tokens;
  }

  /**
   * Robust number coercion mirroring Kotlin's safeInt/safeDouble — JSON.parse
   * already gives us JS numbers for all numeric fields, so this is mostly a
   * defensive no-op, but guards against string-encoded numbers in case a
   * future exporter variant emits them.
   */
  function toInt(v) {
    if (typeof v === 'number') return v | 0;
    if (typeof v === 'string') return parseInt(v, 10);
    throw new TypeError('cannot cast ' + typeof v + ' to Int');
  }
  function toDouble(v) {
    if (typeof v === 'number') return v;
    if (typeof v === 'string') return parseFloat(v);
    throw new TypeError('cannot cast ' + typeof v + ' to Double');
  }

  /**
   * Parse a single tree node-array object into a plain-object Tree.
   * Mirrors Tree.predictProba(x, out) in the Kotlin source.
   */
  function parseTree(o) {
    var fArr = o.feature, tArr = o.threshold, lArr = o.children_left, rArr = o.children_right, vArr = o.value;
    var n = fArr.length;
    var feature = new Array(n), threshold = new Array(n), left = new Array(n), right = new Array(n), value = new Array(n);
    var i, j;
    for (i = 0; i < n; i++) {
      feature[i] = toInt(fArr[i]);
      threshold[i] = toDouble(tArr[i]);
      left[i] = toInt(lArr[i]);
      right[i] = toInt(rArr[i]);
      var row = vArr[i];
      var rowOut = new Array(row.length);
      for (j = 0; j < row.length; j++) rowOut[j] = toDouble(row[j]);
      value[i] = rowOut;
    }
    return { feature: feature, threshold: threshold, left: left, right: right, value: value };
  }

  /**
   * Walk the tree by feature<=threshold comparisons until a leaf
   * (children_left === -1), then normalise the leaf's raw value[] row into a
   * probability vector, writing into `out` (length === n classes).
   * Exactly mirrors Tree.predictProba(x, out) in RandomForestTextClassifier.kt.
   */
  function treePredictProba(tree, x, out) {
    var node = 0;
    while (tree.left[node] !== -1) {
      var f = tree.feature[node];
      var v = (f >= 0 && f < x.length) ? x[f] : 0.0;
      node = (v <= tree.threshold[node]) ? tree.left[node] : tree.right[node];
    }
    var row = tree.value[node];
    var sum = 0.0;
    var i;
    for (i = 0; i < row.length; i++) sum += row[i];
    if (sum <= 0.0) {
      var uniform = 1.0 / out.length;
      for (i = 0; i < out.length; i++) out[i] = uniform;
    } else {
      for (i = 0; i < out.length; i++) out[i] = row[i] / sum;
    }
  }

  /**
   * RandomForestTextClassifier — JS port.
   * @param {Object} model - parsed model JSON (see schema above).
   */
  function RandomForestTextClassifier(model) {
    this.modelName = model.model_name || 'unknown';
    this.version = model.version || 'unknown';
    this.task = model.task || 'binary';
    this.nFeatures = model.n_features;
    this.nClasses = model.n_classes;
    this.threshold = (typeof model.threshold === 'number') ? model.threshold : 0.5;
    this.classes = model.classes.slice();
    if (this.classes.length !== this.nClasses) {
      throw new Error('classes length != n_classes');
    }

    // vocabulary is already a plain object {term: idx} from JSON.parse — no
    // conversion needed (unlike Kotlin's JSONObject.keys() iterator dance).
    this.vocabulary = model.vocabulary;

    var idfArr = model.idf;
    if (idfArr.length !== this.nFeatures) {
      throw new Error('idf length != n_features');
    }
    this.idf = new Array(this.nFeatures);
    for (var i = 0; i < this.nFeatures; i++) this.idf[i] = toDouble(idfArr[i]);

    var treesArr = model.trees;
    this.trees = new Array(treesArr.length);
    for (var t = 0; t < treesArr.length; t++) this.trees[t] = parseTree(treesArr[t]);
  }

  /**
   * Vectorise `text` to a TF-IDF vector of length nFeatures (dense array).
   * Mirrors vectorize() in the Kotlin source: unigram + bigram term counts
   * against the model vocabulary, tf*idf weighting, L2 normalization. Terms
   * not in the vocabulary are simply skipped (not an error).
   */
  RandomForestTextClassifier.prototype.vectorize = function (text) {
    var vec = new Array(this.nFeatures);
    var i;
    for (i = 0; i < this.nFeatures; i++) vec[i] = 0.0;

    var tokens = tokenize(text);
    if (tokens.length === 0) return vec;

    var termCounts = {};
    // unigrams
    for (i = 0; i < tokens.length; i++) {
      var tok = tokens[i];
      if (!Object.prototype.hasOwnProperty.call(this.vocabulary, tok)) continue;
      var idx = this.vocabulary[tok];
      termCounts[idx] = (termCounts[idx] || 0) + 1;
    }
    // bigrams
    if (tokens.length >= 2) {
      for (i = 0; i < tokens.length - 1; i++) {
        var bg = tokens[i] + ' ' + tokens[i + 1];
        if (!Object.prototype.hasOwnProperty.call(this.vocabulary, bg)) continue;
        var bidx = this.vocabulary[bg];
        termCounts[bidx] = (termCounts[bidx] || 0) + 1;
      }
    }

    var keys = Object.keys(termCounts);
    if (keys.length === 0) return vec;

    // TF-IDF (sklearn default): tf * idf, then L2-normalise
    var sqSum = 0.0;
    var k, idxNum, count, w;
    for (k = 0; k < keys.length; k++) {
      idxNum = parseInt(keys[k], 10);
      count = termCounts[keys[k]];
      w = count * this.idf[idxNum];
      vec[idxNum] = w;
      sqSum += w * w;
    }
    if (sqSum > 0.0) {
      var norm = Math.sqrt(sqSum);
      for (k = 0; k < keys.length; k++) {
        idxNum = parseInt(keys[k], 10);
        vec[idxNum] = vec[idxNum] / norm;
      }
    }
    return vec;
  };

  /** Average per-tree class probabilities. Mirrors predictProba(text) in Kotlin. */
  RandomForestTextClassifier.prototype.predictProba = function (text) {
    var x = this.vectorize(text);
    var nClasses = this.classes.length;
    var agg = new Array(nClasses);
    var tmp = new Array(nClasses);
    var i, t;
    for (i = 0; i < nClasses; i++) agg[i] = 0.0;
    for (t = 0; t < this.trees.length; t++) {
      treePredictProba(this.trees[t], x, tmp);
      for (i = 0; i < nClasses; i++) agg[i] += tmp[i];
    }
    var n = this.trees.length;
    for (i = 0; i < nClasses; i++) agg[i] = n > 0 ? (agg[i] / n) : agg[i];
    return agg;
  };

  /** Classify with the exporter's decision threshold (binary) or argmax (multiclass). */
  RandomForestTextClassifier.prototype.predict = function (text) {
    var probs = this.predictProba(text);
    var probMap = {};
    var i;
    for (i = 0; i < this.classes.length; i++) probMap[this.classes[i]] = probs[i];

    var label, top;
    if (this.task === 'binary' && this.classes.length === 2) {
      var pos = probs[1];
      label = (pos >= this.threshold) ? this.classes[1] : this.classes[0];
      top = (pos >= this.threshold) ? pos : (1.0 - pos);
    } else {
      var best = 0;
      for (i = 1; i < probs.length; i++) if (probs[i] > probs[best]) best = i;
      label = this.classes[best];
      top = probs[best];
    }
    return { label: label, probabilities: probMap, topProbability: top };
  };

  /**
   * Load a classifier from raw bytes/parsed-JSON. Accepts either an already
   * parsed model object, OR a gzip Uint8Array (rarely needed in the browser
   * since gzip-fetch.js's fetchGzipJson() already returns parsed JSON — this
   * overload exists mainly for parity/testability with the Kotlin
   * `load(context, assetName)` entry point).
   */
  function loadFromModel(modelJson) {
    return new RandomForestTextClassifier(modelJson);
  }

  /**
   * Convenience loader: fetch + gzip-decompress + JSON.parse + construct, in
   * one call. Requires shared/detection-library/gzip-fetch.js to be loaded
   * first (self.SendWiseGzipFetch).
   */
  async function loadFromUrl(url) {
    var gz = root.SendWiseGzipFetch;
    if (!gz || typeof gz.fetchGzipJson !== 'function') {
      throw new Error('RandomForestTextClassifier.loadFromUrl: SendWiseGzipFetch not loaded');
    }
    var modelJson = await gz.fetchGzipJson(url);
    return loadFromModel(modelJson);
  }

  root.RandomForestTextClassifier = {
    loadFromModel: loadFromModel,
    loadFromUrl: loadFromUrl,
    // Exposed for unit-style manual testing / debugging.
    _tokenize: tokenize,
    _stripAccents: stripAccents,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = root.RandomForestTextClassifier;
  }
}(typeof self !== 'undefined' ? self : this));
