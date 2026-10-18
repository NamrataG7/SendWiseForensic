// lib/signing.js
//
// Wraps IndexedDB storage of a non-extractable ECDSA P-256 CryptoKeyPair and
// exposes sign(bytes) -> ArrayBuffer. The private key is generated with
// extractable=false and never leaves this module as raw bytes; IndexedDB is
// used (rather than chrome.storage) because chrome.storage.local cannot
// persist CryptoKey objects, while IndexedDB's structured-clone algorithm
// can store non-extractable CryptoKeys directly (Chrome-supported).
//
// This is a software (WebCrypto) key only -- there is no hardware-backed /
// attested key storage in this phase, matching Android's accepted
// prototype-gap posture (EvidenceSigner.kt's TEE/StrongBox fallback is also
// a software-adjacent compromise in practice when StrongBox is unavailable).

const DB_NAME = 'sendwise-forensic-keys';
const DB_VERSION = 1;
const STORE_NAME = 'keys';
const RECORD_KEY = 'device-keypair';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGet(db, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(db, key, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Generate (if absent) and return the device's ECDSA P-256 CryptoKeyPair.
 * The private key is non-extractable (extractable=false); only the public
 * key is ever exported (as SPKI/base64) by callers.
 */
async function getOrCreateKeyPair() {
  const db = await openDb();
  const existing = await idbGet(db, RECORD_KEY);
  if (existing && existing.publicKey && existing.privateKey) {
    return existing;
  }

  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    false, // non-extractable private key
    ['sign'],
  );
  // Public keys from generateKeyPair are always exportable regardless of the
  // `extractable` flag (WebCrypto spec) -- only the private key half is
  // actually constrained to non-extractable here.
  const record = { publicKey: keyPair.publicKey, privateKey: keyPair.privateKey };
  await idbPut(db, RECORD_KEY, record);
  return record;
}

/** Export the device public key as base64(SPKI), for enrollment. */
async function exportPublicKeyBase64() {
  const { publicKey } = await getOrCreateKeyPair();
  const spki = await crypto.subtle.exportKey('spki', publicKey);
  return arrayBufferToBase64(spki);
}

/** Sign `bytes` (ArrayBuffer|Uint8Array) with the device private key. */
async function sign(bytes) {
  const { privateKey } = await getOrCreateKeyPair();
  return crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, bytes);
}

function arrayBufferToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

self.SendWiseSigning = {
  getOrCreateKeyPair,
  exportPublicKeyBase64,
  sign,
  arrayBufferToBase64,
};
