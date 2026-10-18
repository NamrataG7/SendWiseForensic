// background.js (MV3 service worker)
//
// SCOPE OF THIS PHASE (per Oracle design gate): this worker proves only the
// RISK_DETECTION submission pipeline end-to-end:
//   enroll (options.js) -> classify (ported enhanced-analyzer.js pipeline)
//   -> hash-chain (lib/chain.js) -> sign (lib/signing.js)
//   -> ack-then-advance -> submit (POST /api/evidence/ingest)
//
// IMPORTANT HONESTY NOTE: this extension has NO content_scripts and performs
// NO real browser-activity monitoring. There is no page this worker reads
// text from. The "detection" input below is a static/synthetic placeholder
// string, analyzed purely to prove the classifier -> hash-chain -> sign ->
// submit wiring is functional. Real browser-activity-derived input (what
// text, from where, under what CollectionGate-equivalent authorization
// scope) is explicitly OUT OF SCOPE for this phase and is deferred to a
// separate design gate, mirroring Android's CollectionGate-gated capture
// categories (KEYSTROKE_BATCH / APP_EVENT / COMMS_METADATA), none of which
// are implemented here.

importScripts(
  'lib/detection/gzip-fetch.js',
  'lib/detection/rf-classifier.js',
  'lib/detection/hard-triggers.js',
  'lib/detection/enhanced-analyzer.js',
  'lib/chain.js',
  'lib/signing.js',
);

const ALARM_NAME = 'sendwise-forensic-risk-detection-cycle';
const ALARM_PERIOD_MINUTES = 1; // 60s cycle, per spec

// Placeholder-only input for this phase. NOT derived from any real browser
// activity -- see file-header note above.
const PLACEHOLDER_ANALYZED_TEXT = '';

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: ALARM_PERIOD_MINUTES });
});
chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: ALARM_PERIOD_MINUTES });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    runRiskDetectionCycle().catch(() => {
      // Swallow -- failures are handled/logged inside runRiskDetectionCycle;
      // an uncaught rejection here would just be noise in the SW console.
    });
  }
});

/** Derive a coarse "which tier fired" label locally for the evidence payload.
 * Not an upstream field of enhanced-analyzer.js's own return shape -- inferred
 * here from its documented priority-tier behavior (score===1.0 && isToxic =>
 * hard-trigger short-circuit; usingEnhanced===true => RF classifier tier;
 * otherwise => lexicon fallback tier, which in this extension is always a
 * no-op since the lexicon analyzer.js was intentionally NOT ported). */
function deriveMatchedTier(result) {
  if (result.isToxic && result.toxicityScore === 1.0 && !result.usingEnhanced) {
    return 'hard_trigger';
  }
  if (result.usingEnhanced) return 'rf_classifier';
  return 'lexicon_fallback';
}

async function runRiskDetectionCycle() {
  const stored = await chrome.storage.local.get([
    'ingestToken',
    'deviceId',
    'dashboardUrl',
    'sessionId',
  ]);
  const { ingestToken, deviceId, dashboardUrl, sessionId } = stored;

  // Not enrolled yet -- skip silently, no error spam.
  if (!ingestToken || !deviceId || !dashboardUrl || !sessionId) {
    return;
  }

  const modelBaseUrl = chrome.runtime.getURL('models/');
  const result = await self.EnhancedToxicityAnalyzer.analyze(
    PLACEHOLDER_ANALYZED_TEXT,
    0.5,
    modelBaseUrl,
  );

  // Payload is the classification VERDICT only -- never the analyzed text
  // itself (there is no real analyzed text in this phase anyway, but this
  // also holds for when real input is wired up in a later phase).
  const verdict = {
    category: result.category,
    severity: result.severity,
    score: result.toxicityScore,
    matchedTier: deriveMatchedTier(result),
  };
  const payloadBytes = new TextEncoder().encode(JSON.stringify(verdict));

  const category = 'RISK_DETECTION';
  const privilegeFlag = 'UNKNOWN'; // hardcoded always, per Oracle gate decision -- no heuristic
  const contextAppPackage = null;
  const capturedAt = new Date().toISOString();

  const prevBatchHashHex = await self.SendWiseChain.getTailHash(sessionId);
  const batchHashHex = await self.SendWiseChain.computeBatchHash(
    prevBatchHashHex,
    payloadBytes,
    sessionId,
    category,
    capturedAt,
    contextAppPackage,
    privilegeFlag,
  );

  // Signing input: payload + batchHashHex bytes, matching
  // EvidenceRecorder.kt: `signer.sign(payload + batchHashHex.toByteArray())`.
  const batchHashHexBytes = new TextEncoder().encode(batchHashHex);
  const signInput = new Uint8Array(payloadBytes.length + batchHashHexBytes.length);
  signInput.set(payloadBytes, 0);
  signInput.set(batchHashHexBytes, payloadBytes.length);
  const signature = await self.SendWiseSigning.sign(signInput);
  const signatureBase64 = self.SendWiseSigning.arrayBufferToBase64(signature);
  const publicKeyBase64 = await self.SendWiseSigning.exportPublicKeyBase64();

  const batchId = crypto.randomUUID();
  const body = {
    batches: [
      {
        batchId,
        sessionId,
        capturedAt,
        category,
        payloadBase64: self.SendWiseSigning.arrayBufferToBase64(payloadBytes),
        prevBatchHashHex,
        batchHashHex,
        privilegeFlag,
        contextAppPackage,
        signatureBase64,
        // ALWAYS true: this phase has no real browser-activity capture
        // (no content_scripts exist). Every batch this worker produces is a
        // pipeline-validation artifact from a static placeholder input, not
        // real surveillance output. Must remain hardcoded true for the
        // entirety of this phase -- see file-header note and
        // supabase/migrations/20260907000000_evidence_synthetic_marker.sql.
        synthetic: true,
      },
    ],
    device: {
      deviceId,
      publicKeyBase64,
      // Hardcoded stub -- software WebCrypto key, no hardware attestation in
      // this phase, matching Android's accepted non-blocking posture
      // (EvidenceSigner.kt TODO(HARDWARE-KEYSTORE)).
      attestation: { ok: false, kind: 'software', verdict: 'UNATTESTED' },
    },
    clientVersion: chrome.runtime.getManifest().version,
  };

  let resp;
  try {
    resp = await fetch(`${dashboardUrl}/api/evidence/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ingestToken}`,
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    // Network failure -- do NOT advance the tail. Same prevBatchHashHex will
    // be reused next cycle with a new batchId/capturedAt (no chain fork).
    return;
  }

  if (resp.ok) {
    // Only on a 2xx response do we advance the tail (ack-then-advance).
    await self.SendWiseChain.advanceTailAfterAck(sessionId, batchHashHex);
  }
  // Any non-2xx response: do nothing further -- next cycle retries with the
  // same prevBatchHashHex.
}
