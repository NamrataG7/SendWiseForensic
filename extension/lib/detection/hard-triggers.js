// shared/detection-library/hard-triggers.js
//
// Faithful JS port of the HARD_TRIGGERS list + detectHardProfanity() from
// EnhancedToxicityAnalyzer.kt. Any occurrence of these tokens as a
// standalone word (case-insensitive, punctuation-tolerant) should fire the
// warning overlay immediately with score=1.0 and the matched category — no
// RF, no lexicon, no thresholds involved. Guarantees the detection path is
// functional even if the RF models fail to load or the lexicon regresses.
//
// Category priority order (matches Kotlin exactly): self_harm > threats >
// sexual_content > hate_speech > harassment. Multi-word phrases are matched
// as substrings; single words are matched via a word-boundary regex
// (non-letter or start/end), identical to the Kotlin Regex used.
//
// Category string constants mirror ToxicityAnalyzer.kt's CATEGORY_* values,
// which already match campus-dashboard/lib/schema.ts's IncidentCategoryEnum
// 1:1 (harassment, threats, hate_speech, sexual_content, self_harm) — no
// translation table is required.

(function (root) {
  'use strict';

  var CATEGORY_HARASSMENT = 'harassment';
  var CATEGORY_THREATS = 'threats';
  var CATEGORY_HATE_SPEECH = 'hate_speech';
  var CATEGORY_SEXUAL_CONTENT = 'sexual_content';
  var CATEGORY_SELF_HARM = 'self_harm';
  var CATEGORY_NONE = 'none';

  // Ordered list of [phrase, category] pairs — order matters (first match wins),
  // exactly mirroring the Kotlin `buildList { ... }` construction order.
  var HARD_TRIGGERS = [];

  function addAll(phrases, category) {
    for (var i = 0; i < phrases.length; i++) HARD_TRIGGERS.push([phrases[i], category]);
  }

  // SELF-HARM RISK - suicidal ideation, self-injury
  addAll([
    'kill myself', 'end my life', 'end it all', 'want to die',
    'wanna die', 'wish i was dead', 'wish i were dead',
    'no reason to live', 'cant go on', "can't go on",
    'jump off', 'hang myself', 'cut myself', 'cutting myself',
    'self harm', 'self-harm', 'suicidal', 'suicide',
    'kys', 'kill yourself', 'kys yourself'
  ], CATEGORY_SELF_HARM);

  // THREATS - violence, intimidation
  addAll([
    'kill you', 'gonna kill', 'going to kill', 'murder you',
    'beat you up', 'beat the shit', 'beat you down',
    'hurt you', 'gonna hurt', 'going to hurt',
    'watch your back', "you're dead", 'youre dead',
    'gonna find you', 'going to find you', 'coming for you',
    'shoot you', 'stab you', 'break your'
  ], CATEGORY_THREATS);

  // SEXUAL CONTENT - unwanted sexual references
  addAll([
    'have sex', 'want to fuck', 'wanna fuck', 'fuck you',
    'send nudes', 'send nude', 'send pics', 'send pic',
    'show your', 'show me your', 'your body',
    'get naked', 'take off your', 'strip for',
    'hookup', 'hook up with', 'porn', 'pornography',
    'sex chat', 'dick pic', 'boobs', 'tits', 'titties'
  ], CATEGORY_SEXUAL_CONTENT);

  // HATE SPEECH - slurs targeting protected groups
  addAll([
    'faggot', 'nigger', 'chink', 'kike', 'spic', 'tranny',
    'retard', 'retarded'
  ], CATEGORY_HATE_SPEECH);

  // HARASSMENT - personal insults, profanity (default catch-all)
  addAll([
    'stupid', 'idiot', 'moron', 'loser', 'ugly', 'worthless',
    'bitch', 'bastard', 'asshole', 'motherfucker', 'fuck',
    'fucker', 'fucking', 'fucked', 'shit', 'damn', 'prick',
    'dick', 'dickhead', 'cunt', 'slut', 'whore', 'hoe',
    'dumbass', 'pathetic', 'nobody likes you', 'hate you'
  ], CATEGORY_HARASSMENT);

  /** Escape a string for use inside a RegExp, mirroring Kotlin's Regex.escape(). */
  function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Cache single-word boundary regexes so we don't rebuild them per-call.
  var WORD_BOUNDARY_CACHE = {};
  function wordBoundaryRe(word) {
    if (!WORD_BOUNDARY_CACHE[word]) {
      WORD_BOUNDARY_CACHE[word] = new RegExp('(^|[^a-z])' + escapeRegex(word) + '([^a-z]|$)');
    }
    return WORD_BOUNDARY_CACHE[word];
  }

  /**
   * Returns {token, category} or null.
   * Priority: iterates HARD_TRIGGERS in order (self-harm > threats > sexual
   * > hate > harassment) so that "i want to kill myself" matches self-harm,
   * not the "kill" substring of threats. Mirrors detectHardProfanity() in
   * EnhancedToxicityAnalyzer.kt exactly.
   */
  function detect(message) {
    if (!message) return null;
    var lc = message.toLowerCase();
    for (var i = 0; i < HARD_TRIGGERS.length; i++) {
      var word = HARD_TRIGGERS[i][0];
      var cat = HARD_TRIGGERS[i][1];
      if (word.indexOf(' ') !== -1) {
        // multi-word phrase — substring match
        if (lc.indexOf(word) !== -1) return { token: word, category: cat };
      } else {
        // single word — bounded by non-letter or start/end
        if (wordBoundaryRe(word).test(lc)) return { token: word, category: cat };
      }
    }
    return null;
  }

  root.HardTriggerDetector = {
    detect: detect,
    CATEGORY_HARASSMENT: CATEGORY_HARASSMENT,
    CATEGORY_THREATS: CATEGORY_THREATS,
    CATEGORY_HATE_SPEECH: CATEGORY_HATE_SPEECH,
    CATEGORY_SEXUAL_CONTENT: CATEGORY_SEXUAL_CONTENT,
    CATEGORY_SELF_HARM: CATEGORY_SELF_HARM,
    CATEGORY_NONE: CATEGORY_NONE,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = root.HardTriggerDetector;
  }
}(typeof self !== 'undefined' ? self : this));
