/**
 * Canonical statute-cited list of the fields the Bharatiya Sakshya Adhiniyam,
 * 2023 (BSA) §63 certificate must carry for an electronic record to be
 * admissible. This module is the single source of truth for the "what does
 * §63 require" question; renderers (JSON, PDF) and validators (Zod schemas)
 * consume this list.
 *
 * BSA §63 replaces the old Indian Evidence Act §65B and requires:
 *   (a) identification of the electronic record;
 *   (b) description of the manner in which it was produced;
 *   (c) particulars of the device involved;
 *   (d) a statement that the device was operating properly during the
 *       relevant period, signed by a person occupying a responsible
 *       official position in relation to the operation of the device.
 *
 * See docs/LEGAL_FRAMEWORK_IN.md §4 for the full mapping.
 */

export interface Sec63FieldSpec {
  /** Dotted JSON path within CertificateInput. */
  path: string;
  /** Human-readable label used in error output. */
  label: string;
  /** Statute cite for the requirement. */
  statute: string;
  /** BSA §63 clause this field satisfies. */
  clause: '63(a)' | '63(b)' | '63(c)' | '63(d)' | '63(general)';
}

export const SEC63_REQUIRED_FIELDS: readonly Sec63FieldSpec[] = [
  {
    path: 'certificateId',
    label: 'Certificate identifier',
    statute: 'BSA_2023_S63',
    clause: '63(general)',
  },
  {
    path: 'issuedAt',
    label: 'Certificate issue timestamp (ISO 8601 UTC)',
    statute: 'BSA_2023_S63',
    clause: '63(general)',
  },
  {
    path: 'issuedBy.officerId',
    label: 'Signing officer identifier',
    statute: 'BSA_2023_S63',
    clause: '63(d)',
  },
  {
    path: 'issuedBy.name',
    label: 'Signing officer full name',
    statute: 'BSA_2023_S63',
    clause: '63(d)',
  },
  {
    path: 'issuedBy.designation',
    label: 'Signing officer designation (responsible official position)',
    statute: 'BSA_2023_S63',
    clause: '63(d)',
  },
  {
    path: 'issuedBy.organizationalUnit',
    label: 'Signing officer organizational unit',
    statute: 'BSA_2023_S63',
    clause: '63(d)',
  },
  {
    path: 'caseRef',
    label: 'Case reference (FIR number or equivalent)',
    statute: 'BSA_2023_S63',
    clause: '63(a)',
  },
  {
    path: 'authorizationRef.warrantId',
    label: 'Warrant / authorization identifier',
    statute: 'IT_ACT_S69',
    clause: '63(general)',
  },
  {
    path: 'authorizationRef.type',
    label: 'Authorization type',
    statute: 'IT_ACT_S69',
    clause: '63(general)',
  },
  {
    path: 'authorizationRef.issuedOn',
    label: 'Authorization issue date',
    statute: 'IT_RULES_2009_R3',
    clause: '63(general)',
  },
  {
    path: 'authorizationRef.expiresOn',
    label: 'Authorization expiry date',
    statute: 'IT_RULES_2009_R11',
    clause: '63(general)',
  },
  {
    path: 'authorizationRef.statuteReferences',
    label: 'Authorization statute references',
    statute: 'BSA_2023_S63',
    clause: '63(general)',
  },
  {
    path: 'device.deviceId',
    label: 'Device identifier',
    statute: 'BSA_2023_S63',
    clause: '63(c)',
  },
  {
    path: 'device.platform',
    label: 'Device platform',
    statute: 'BSA_2023_S63',
    clause: '63(c)',
  },
  {
    path: 'device.model',
    label: 'Device model',
    statute: 'BSA_2023_S63',
    clause: '63(c)',
  },
  {
    path: 'device.os',
    label: 'Device operating system',
    statute: 'BSA_2023_S63',
    clause: '63(c)',
  },
  {
    path: 'device.deviceFingerprint',
    label: 'Device fingerprint (opaque hex)',
    statute: 'BSA_2023_S63',
    clause: '63(c)',
  },
  {
    path: 'collection.startedAt',
    label: 'Collection window start',
    statute: 'BSA_2023_S63',
    clause: '63(b)',
  },
  {
    path: 'collection.endedAt',
    label: 'Collection window end',
    statute: 'BSA_2023_S63',
    clause: '63(b)',
  },
  {
    path: 'collection.sessionId',
    label: 'Monitoring session identifier',
    statute: 'BSA_2023_S63',
    clause: '63(b)',
  },
  {
    path: 'collection.categories',
    label: 'Collected data categories',
    statute: 'BSA_2023_S63',
    clause: '63(b)',
  },
  {
    path: 'evidence.evidenceIds',
    label: 'Evidence record identifiers',
    statute: 'BSA_2023_S63',
    clause: '63(a)',
  },
  {
    path: 'evidence.hashes',
    label: 'Per-evidence SHA-256 payload hashes',
    statute: 'BSA_2023_S63',
    clause: '63(a)',
  },
  {
    path: 'evidence.aggregatedRootHash',
    label: 'Aggregated root hash over evidence hashes',
    statute: 'BSA_2023_S63',
    clause: '63(a)',
  },
  {
    path: 'integrity.chainVerified',
    label: 'Hash-chain verification flag',
    statute: 'BSA_2023_S63',
    clause: '63(b)',
  },
  {
    path: 'integrity.chainVerifiedAt',
    label: 'Hash-chain verification timestamp',
    statute: 'BSA_2023_S63',
    clause: '63(b)',
  },
  {
    path: 'integrity.verifierRef',
    label: 'Hash-chain verifier reference',
    statute: 'BSA_2023_S63',
    clause: '63(b)',
  },
  {
    path: 'deviceOperationalStatement',
    label:
      'Officer statement that the device was operating properly during the relevant period',
    statute: 'BSA_2023_S63',
    clause: '63(d)',
  },
  {
    path: 'statuteReferences',
    label: 'Certificate statute references (must include BSA_2023_S63)',
    statute: 'BSA_2023_S63',
    clause: '63(general)',
  },
] as const;

/**
 * Verbatim quote of the statutory language the officer's declaration must
 * satisfy. Rendered inside the bordered "Operational status" box in the PDF.
 */
export const SEC63_OPERATIONAL_STATEMENT_STATUTE_QUOTE =
  'Bharatiya Sakshya Adhiniyam, 2023 §63(4)(c): the computer or communication device producing the electronic record was operating properly during the relevant period.';
