// shared/detection-library/enhanced-analyzer.js
//
// Faithful JS port of EnhancedToxicityAnalyzer.kt's analyzeMessage() layering:
//   Priority 0: HardTriggerDetector short-circuit (score=1.0)
//   Priority 1: RF binary risk classifier + RF category classifier
//   Priority 2: existing lexicon fallback (vendor/detection-library/analyzer.js's
//               ToxicityAnalyzer — kept as-is, NOT rewritten here)
//
// Category string mapping: ToxicityAnalyzer.kt's CATEGORY_* constants
// (harassment, threats, hate_speech, sexual_content, self_harm, none)
// already match campus-dashboard/lib/schema.ts's IncidentCategoryEnum
// verbatim — no translation table is required. The one normalisation
// applied (mirroring classifyCategory() in the Kotlin source) is collapsing
// the RF category model's raw label "self_harm_risk" down to the canonical
// "self_harm" string.
//
// Depends on (must be loaded first, see manifest.json content_scripts order):
//   gzip-fetch.js       -> self.SendWiseGzipFetch
//   rf-classifier.js    -> self.RandomForestTextClassifier
//   hard-triggers.js    -> self.HardTriggerDetector
//   vendor/detection-library/analyzer.js -> (global) ToxicityAnalyzer (lexicon fallback)

(function (root) {
  'use strict';

  var CATEGORY_NONE = 'none';
  var CATEGORY_SELF_HARM = 'self_harm';
  var CATEGORY_THREATS = 'threats';
  var CATEGORY_HATE_SPEECH = 'hate_speech';
  var CATEGORY_SEXUAL_CONTENT = 'sexual_content';
  var CANONICAL_CATEGORIES = ['harassment', 'threats', 'hate_speech', 'sexual_content', 'self_harm'];

  var DEFAULT_SENSITIVITY = 0.5;

  // Lazily-loaded, module-level cached classifiers (mirrors the Kotlin `by
  // lazy` delegates) so repeated calls within the same content-script
  // lifetime don't re-fetch/re-decompress the model files every time.
  var _rfBinaryPromise = null;
  var _rfCategoryPromise = null;

  function getRfBinary(modelBaseUrl) {
    if (!_rfBinaryPromise) {
      var RF = root.RandomForestTextClassifier;
      _rfBinaryPromise = (RF && typeof RF.loadFromUrl === 'function')
        ? RF.loadFromUrl(modelBaseUrl + 'sendwise_rf_v1.json.gz').catch(function (err) {
            // Cache the failure as null rather than re-throwing on every call,
            // but allow a later retry by resetting the promise to null.
            _rfBinaryPromise = null;
            throw err;
          })
        : Promise.reject(new Error('RandomForestTextClassifier not loaded'));
    }
    return _rfBinaryPromise;
  }

  function getRfCategory(modelBaseUrl) {
    if (!_rfCategoryPromise) {
      var RF = root.RandomForestTextClassifier;
      _rfCategoryPromise = (RF && typeof RF.loadFromUrl === 'function')
        ? RF.loadFromUrl(modelBaseUrl + 'sendwise_category_v1.json.gz').catch(function (err) {
            _rfCategoryPromise = null;
            throw err;
          })
        : Promise.reject(new Error('RandomForestTextClassifier not loaded'));
    }
    return _rfCategoryPromise;
  }

  /** Find the RF binary model's risk-positive class index. Mirrors tryRandomForest()'s heuristic. */
  function findRiskPositiveIndex(classes) {
    for (var i = 0; i < classes.length; i++) {
      var lc = String(classes[i]).toLowerCase();
      if ((lc.indexOf('risk') !== -1 && lc.indexOf('non') === -1) ||
          lc === '1' || lc === 'true' || lc === 'toxic' || lc === 'positive') {
        return i;
      }
    }
    return Math.max(classes.length - 1, 0);
  }

  /** Look up the existing lexicon analyzer (vendor/detection-library/analyzer.js), if loaded. */
  function getLexiconAnalyzer() {
    return root.ToxicityAnalyzer || (typeof window !== 'undefined' && window.ToxicityAnalyzer);
  }

  /**
   * Derive category via the RF category model's predict() (argmax), falling
   * back to the lexicon analyzer's category. Mirrors classifyCategory() in
   * the Kotlin source. Returns a category string or null.
   */
  async function classifyCategory(text, modelBaseUrl) {
    try {
      var rfCategory = await getRfCategory(modelBaseUrl);
      var pred = rfCategory.predict(text);
      var label = String(pred.label).toLowerCase();
      if (label.indexOf('self') !== -1 && label.indexOf('harm') !== -1) {
        return CATEGORY_SELF_HARM;
      }
      if (CANONICAL_CATEGORIES.indexOf(label) !== -1) return label;
      return label;
    } catch (e) {
      // RF category unavailable/failed — derive from lexicon.
      var lex = getLexiconAnalyzer();
      if (lex && typeof lex.analyze === 'function') {
        var lexResult = lex.analyze(text, DEFAULT_SENSITIVITY);
        if (lexResult && lexResult.category && lexResult.category !== CATEGORY_NONE) {
          return lexResult.category;
        }
      }
      return null;
    }
  }

  /**
   * Run the RF binary risk classifier. Returns null if unavailable or if it
   * produced a non-finite score (caller falls back to lexicon). Mirrors
   * tryRandomForest() in the Kotlin source.
   */
  async function tryRandomForest(text, sensitivity, modelBaseUrl) {
    var clf;
    try {
      clf = await getRfBinary(modelBaseUrl);
    } catch (e) {
      return null;
    }
    try {
      var probs = clf.predictProba(text);
      var posIdx = findRiskPositiveIndex(clf.classes);
      var riskScore = probs[posIdx];
      if (typeof riskScore !== 'number' || !isFinite(riskScore)) {
        return null;
      }

      var threshold = Math.min(clf.threshold, sensitivity);
      var isToxic = riskScore >= threshold;

      var category = (await classifyCategory(text, modelBaseUrl)) || CATEGORY_NONE;
      var severity;
      if (riskScore >= 0.75) severity = 'high';
      else if (riskScore >= 0.45) severity = 'medium';
      else if (riskScore >= 0.25) severity = 'low';
      else severity = 'none';

      return {
        toxicityScore: riskScore,
        originalScore: riskScore,
        category: isToxic ? category : CATEGORY_NONE,
        severity: isToxic ? severity : 'none',
        isToxic: isToxic,
        usingEnhanced: true,
      };
    } catch (e) {
      return null;
    }
  }

  /** Lexicon fallback — Priority 2. Mirrors useFallbackAnalyzer() in the Kotlin source. */
  function useFallbackAnalyzer(text, sensitivity) {
    var lex = getLexiconAnalyzer();
    if (!lex || typeof lex.analyze !== 'function') {
      return {
        toxicityScore: 0,
        originalScore: 0,
        category: CATEGORY_NONE,
        severity: 'none',
        isToxic: false,
        usingEnhanced: false,
      };
    }
    var basicResult = lex.analyze(text, sensitivity);
    var score = (basicResult && typeof basicResult.score === 'number') ? basicResult.score : 0;
    var isToxic = score >= sensitivity;
    return {
      toxicityScore: score,
      originalScore: score,
      category: (basicResult && basicResult.category) || CATEGORY_NONE,
      severity: (basicResult && basicResult.severity) || 'none',
      isToxic: isToxic,
      usingEnhanced: false,
    };
  }

  /**
   * Map a hard-trigger category to severity. Mirrors the `when` block in
   * analyzeMessage(): self_harm/threats/hate_speech/sexual_content -> high,
   * harassment -> medium.
   */
  function hardTriggerSeverity(category) {
    if (category === CATEGORY_SELF_HARM || category === CATEGORY_THREATS ||
        category === CATEGORY_HATE_SPEECH || category === CATEGORY_SEXUAL_CONTENT) {
      return 'high';
    }
    return 'medium';
  }

  /**
   * analyze(text, sensitivity, modelBaseUrl) -> Promise<AnalysisResult>
   *
   * modelBaseUrl should be a URL prefix (e.g.
   * chrome.runtime.getURL('vendor/models/')) under which
   * sendwise_rf_v1.json.gz and sendwise_category_v1.json.gz are hosted.
   *
   * Mirrors analyzeMessage() in EnhancedToxicityAnalyzer.kt's three-tier
   * priority layering, with the same defensive try/catch-and-fall-through at
   * every tier so a model-loading failure never breaks detection entirely.
   */
  async function analyze(text, sensitivity, modelBaseUrl) {
    sensitivity = (typeof sensitivity === 'number') ? sensitivity : DEFAULT_SENSITIVITY;
    modelBaseUrl = modelBaseUrl || '';

    // Priority 0: Hard-trigger short-circuit.
    var hardHit = null;
    try {
      var HTD = root.HardTriggerDetector;
      if (HTD && typeof HTD.detect === 'function') hardHit = HTD.detect(text);
    } catch (e) {
      hardHit = null;
    }
    if (hardHit) {
      return {
        toxicityScore: 1.0,
        originalScore: 1.0,
        category: hardHit.category,
        severity: hardTriggerSeverity(hardHit.category),
        isToxic: true,
        usingEnhanced: false,
      };
    }

    // Priority 1: RandomForest binary risk classifier.
    var rfResult = null;
    try {
      rfResult = await tryRandomForest(text, sensitivity, modelBaseUrl);
    } catch (e) {
      rfResult = null;
    }
    if (rfResult) return rfResult;

    // Priority 2: Deterministic lexicon fallback — guaranteed to run even if
    // the above throws; worst case we return a "clean" result.
    try {
      return useFallbackAnalyzer(text, sensitivity);
    } catch (e) {
      return {
        toxicityScore: 0,
        originalScore: 0,
        category: CATEGORY_NONE,
        severity: 'none',
        isToxic: false,
        usingEnhanced: false,
      };
    }
  }

  root.EnhancedToxicityAnalyzer = { analyze: analyze };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = root.EnhancedToxicityAnalyzer;
  }
}(typeof self !== 'undefined' ? self : this));
