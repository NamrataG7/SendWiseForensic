/**
 * toCertificateJson — validates and serializes a BSA §63 certificate to a
 * canonical, deterministic JSON form. The JSON produced here is what gets
 * hashed / signed downstream, so property order is fixed and rendered via
 * an explicit builder rather than trusting object-literal key ordering.
 */

import { z } from 'zod';
import { SEC63_REQUIRED_FIELDS } from './fields.js';
import { CertificateInputSchema } from './schema.js';
import {
  CertificateValidationError,
  type CertificateInput,
  type MissingFieldReport,
  type RenderedCertificateJson,
} from './types.js';

function getAtPath(obj: unknown, path: string): unknown {
  const parts = path.split('.');
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur === null || cur === undefined || typeof cur !== 'object') {
      return undefined;
    }
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function isEmpty(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === 'string') return v.trim().length === 0;
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

/**
 * Fail-closed precheck against the canonical BSA §63 required-field list.
 * We run this BEFORE Zod so callers get a machine-readable, statute-cited
 * list of missing fields even if the input would also fail Zod for other
 * reasons.
 */
function collectMissingFields(input: unknown): MissingFieldReport[] {
  const missing: MissingFieldReport[] = [];
  for (const spec of SEC63_REQUIRED_FIELDS) {
    const v = getAtPath(input, spec.path);
    if (isEmpty(v)) {
      missing.push({
        path: spec.path,
        label: spec.label,
        statute: spec.statute,
        clause: spec.clause,
      });
    }
  }
  return missing;
}

/**
 * Deterministic JSON serializer used by the caller when hashing the
 * certificate. It sorts object keys recursively and uses no whitespace.
 * (The RenderedCertificateJson object itself is built with a fixed key
 * order, so this exists mainly for the anti-tamper footer hash in the PDF
 * and for external consumers that want a stable hash.)
 */
export function canonicalStringify(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === 'object') {
    const src = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(src).sort()) {
      out[k] = sortDeep(src[k]);
    }
    return out;
  }
  return v;
}

/**
 * Build the RenderedCertificateJson with an EXPLICIT key order. Do not
 * rearrange these lines without bumping schemaVersion — downstream signers
 * will treat the reordered bytes as a different document.
 */
function buildRendered(
  input: z.infer<typeof CertificateInputSchema>,
): RenderedCertificateJson {
  return {
    schemaVersion: '1.0.0',
    certificateId: input.certificateId,
    issuedAt: input.issuedAt,
    issuedBy: {
      officerId: input.issuedBy.officerId,
      name: input.issuedBy.name,
      designation: input.issuedBy.designation,
      organizationalUnit: input.issuedBy.organizationalUnit,
    },
    caseRef: input.caseRef,
    authorizationRef: {
      warrantId: input.authorizationRef.warrantId,
      type: input.authorizationRef.type,
      issuedOn: input.authorizationRef.issuedOn,
      expiresOn: input.authorizationRef.expiresOn,
      statuteReferences: [...input.authorizationRef.statuteReferences],
    },
    device: {
      deviceId: input.device.deviceId,
      platform: input.device.platform,
      model: input.device.model,
      os: input.device.os,
      deviceFingerprint: input.device.deviceFingerprint,
      ...(input.device.hardwareBackedPubKeyHex
        ? { hardwareBackedPubKeyHex: input.device.hardwareBackedPubKeyHex }
        : {}),
    },
    collection: {
      startedAt: input.collection.startedAt,
      endedAt: input.collection.endedAt,
      sessionId: input.collection.sessionId,
      categories: [...input.collection.categories],
    },
    evidence: {
      evidenceIds: [...input.evidence.evidenceIds],
      hashes: [...input.evidence.hashes],
      aggregatedRootHash: input.evidence.aggregatedRootHash,
    },
    integrity: {
      chainVerified: input.integrity.chainVerified,
      chainVerifiedAt: input.integrity.chainVerifiedAt,
      verifierRef: input.integrity.verifierRef,
    },
    deviceOperationalStatement: input.deviceOperationalStatement,
    statuteReferences: [...input.statuteReferences],
    remarks: input.remarks ?? '',
  };
}

export function toCertificateJson(
  input: CertificateInput,
): RenderedCertificateJson {
  const missing = collectMissingFields(input);
  if (missing.length > 0) {
    const summary = missing
      .map((m) => `${m.path} [${m.statute} ${m.clause}]`)
      .join(', ');
    throw new CertificateValidationError(
      `BSA §63 certificate input is missing required fields: ${summary}`,
      missing,
    );
  }

  const parsed = CertificateInputSchema.safeParse(input);
  if (!parsed.success) {
    // Map Zod issue paths back to the required-field spec where possible
    // so downstream consumers still get the statute cite.
    const zodPaths = new Set(
      parsed.error.issues.map((i) => i.path.join('.')),
    );
    const derived: MissingFieldReport[] = SEC63_REQUIRED_FIELDS.filter((f) =>
      zodPaths.has(f.path),
    ).map((f) => ({
      path: f.path,
      label: f.label,
      statute: f.statute,
      clause: f.clause,
    }));
    throw new CertificateValidationError(
      `BSA §63 certificate input failed schema validation`,
      derived,
      parsed.error.issues,
    );
  }

  return buildRendered(parsed.data);
}
