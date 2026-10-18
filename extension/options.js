// options.js
//
// Officer-only enrollment UI logic. Runs in the extension's options page
// context (not a content script -- there is no page this ever runs on).
//
// Flow: generate/reuse a random device fingerprint + ECDSA keypair ->
// POST /api/devices/enroll -> store deviceId + ingestToken (raw, once) in
// chrome.storage.local. Also establishes a synthetic per-device sessionId
// (random UUID) at enrollment time -- a known Phase-1 simplification; see
// comment in background.js for why a real server-issued monitoring_session
// is deferred to a later design gate.

const dashboardUrlInput = document.getElementById('dashboard-url');
const enrollCodeInput = document.getElementById('enroll-code');
const enrollBtn = document.getElementById('enroll-btn');
const statusEl = document.getElementById('status');

function setStatus(message, isError) {
  statusEl.textContent = message;
  statusEl.className = isError ? 'err' : 'ok';
}

async function loadStoredDashboardUrl() {
  const stored = await chrome.storage.local.get('dashboardUrl');
  if (stored.dashboardUrl) {
    dashboardUrlInput.value = stored.dashboardUrl;
  }
}

async function getOrCreateDeviceFingerprint() {
  const stored = await chrome.storage.local.get('deviceFingerprint');
  if (stored.deviceFingerprint) return stored.deviceFingerprint;
  const fingerprint = crypto.randomUUID();
  await chrome.storage.local.set({ deviceFingerprint: fingerprint });
  return fingerprint;
}

async function getOrCreateSessionId() {
  const stored = await chrome.storage.local.get('sessionId');
  if (stored.sessionId) return stored.sessionId;
  const sessionId = crypto.randomUUID();
  await chrome.storage.local.set({ sessionId });
  return sessionId;
}

async function enroll() {
  const dashboardUrl = dashboardUrlInput.value.trim().replace(/\/+$/, '');
  const code = enrollCodeInput.value.trim();

  if (!dashboardUrl) {
    setStatus('Forensic console URL is required.', true);
    return;
  }
  if (!/^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/.test(code)) {
    setStatus('Enrollment code must be in the format XXXX-XXXX.', true);
    return;
  }

  enrollBtn.disabled = true;
  setStatus('Enrolling...', false);

  try {
    await chrome.storage.local.set({ dashboardUrl });

    const deviceFingerprint = await getOrCreateDeviceFingerprint();
    await getOrCreateSessionId(); // established once, reused by background.js

    const hardwareBackedPubKey = await self.SendWiseSigning.exportPublicKeyBase64();

    const resp = await fetch(`${dashboardUrl}/api/devices/enroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        deviceFingerprint,
        platform: 'CHROME_EXTENSION',
        hardwareBackedPubKey,
      }),
    });

    let body;
    try {
      body = await resp.json();
    } catch {
      body = null;
    }

    if (resp.ok && body && body.ok && body.data && body.data.deviceId && body.data.ingestToken) {
      // Raw ingestToken is a real secret -- store it, never console.log it.
      await chrome.storage.local.set({
        deviceId: body.data.deviceId,
        ingestToken: body.data.ingestToken,
      });
      setStatus('Device enrolled successfully.', false);
    } else {
      const errMsg = (body && body.error) ? String(body.error) : `HTTP ${resp.status}`;
      setStatus(`Enrollment failed: ${errMsg}`, true);
    }
  } catch (e) {
    setStatus(`Enrollment failed: ${e && e.message ? e.message : 'network error'}`, true);
  } finally {
    enrollBtn.disabled = false;
  }
}

enrollBtn.addEventListener('click', enroll);
loadStoredDashboardUrl();
