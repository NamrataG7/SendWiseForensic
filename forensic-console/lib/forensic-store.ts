/**
 * Forensic-domain in-memory store (prototype scaffolding).
 *
 * TODO(WIRE-TO-SCHEMA): every function here returns hand-crafted fixture data.
 * The real implementation reads Supabase tables gated by the scope-rewriting
 * query layer (see docs/ENTITY_MODEL.md §3 invariants 1–4).
 *
 * This module intentionally REPLACES the parental `lib/parent-store.ts`.
 * `lib/parent-store.ts` is retained for one commit as `@deprecated`; a later
 * lane deletes it once no imports remain.
 */

import type {
  Authorization,
  Case,
  Evidence,
  MonitoringSession,
  Officer,
  Subject,
  AuditLogEntry,
} from '@/lib/entities';

// ---------------------------------------------------------------------------
// Fixture officers / subjects / cases — prototype only.
// ---------------------------------------------------------------------------

const FIXTURE_OFFICER: Officer = {
  id: 'off_demo_1',
  fullName: 'Insp. R. Deshmukh',
  designation: 'Inspector, Cyber Cell',
  organisation: 'Maharashtra Police',
  serviceId: 'MH-CC-4471',
  roles: ['INVESTIGATING_OFFICER'],
  isActive: true,
};

const FIXTURE_CASES: Case[] = [
  {
    id: 'case_001',
    jurisdiction: 'IN',
    externalCaseRef: 'FIR 0142/2026 — Kothrud PS',
    offences: ['BNS_318(4)', 'BNS_336(3)'],
    status: 'OPEN',
    createdBy: FIXTURE_OFFICER.id,
    assignedOfficers: [FIXTURE_OFFICER.id],
    createdAt: new Date('2026-07-14T09:12:00+05:30'),
  },
  {
    id: 'case_002',
    jurisdiction: 'IN',
    externalCaseRef: 'FIR 0198/2026 — Hinjewadi PS',
    offences: ['BNS_303(2)'],
    status: 'UNDER_REVIEW',
    createdBy: FIXTURE_OFFICER.id,
    assignedOfficers: [FIXTURE_OFFICER.id],
    createdAt: new Date('2026-08-02T11:40:00+05:30'),
  },
  {
    id: 'case_003',
    jurisdiction: 'IN',
    externalCaseRef: 'FIR 0221/2026 — Baner PS',
    offences: ['BNS_69', 'BNS_318(4)'],
    status: 'OPEN',
    createdBy: FIXTURE_OFFICER.id,
    assignedOfficers: [FIXTURE_OFFICER.id],
    createdAt: new Date('2026-08-19T15:05:00+05:30'),
  },
];

const FIXTURE_SUBJECTS: Record<string, Subject> = {
  case_001: {
    id: 'subj_A7391',
    pseudonymousLabel: 'Subject A-7391',
    identityRefs: { verifiedByStub: true, aadhaarHash: 'sha256:stub' },
    devices: ['dev_A7391_1'],
    authorizations: ['auth_001'],
    createdAt: new Date('2026-07-14T09:20:00+05:30'),
  },
  case_002: {
    id: 'subj_B2204',
    pseudonymousLabel: 'Subject B-2204',
    identityRefs: { verifiedByStub: true, aadhaarHash: 'sha256:stub' },
    devices: [],
    authorizations: [],
    createdAt: new Date('2026-08-02T11:50:00+05:30'),
  },
  case_003: {
    id: 'subj_C0918',
    pseudonymousLabel: 'Subject C-0918',
    identityRefs: { verifiedByStub: true, aadhaarHash: 'sha256:stub' },
    devices: ['dev_C0918_1'],
    authorizations: ['auth_003'],
    createdAt: new Date('2026-08-19T15:10:00+05:30'),
  },
};

const FIXTURE_AUTHS: Record<string, Authorization> = {
  auth_001: {
    id: 'auth_001',
    caseId: 'case_001',
    subjectId: 'subj_A7391',
    type: 'JUDICIAL_WARRANT',
    legitimateAim: 'PREVENTING_INCITEMENT_TO_COGNIZABLE_OFFENCE',
    issuingAuthorityId: 'off_home_sec_mh',
    issuedOn: new Date('2026-08-01T10:00:00+05:30'),
    expiresOn: new Date('2026-09-30T10:00:00+05:30'),
    scope: {
      dataCategories: ['KEYSTROKE', 'APP_EVENT', 'COMMS_METADATA'],
      devices: ['dev_A7391_1'],
      keywords: ['payment', 'transfer'],
      contextApps: ['com.whatsapp', 'org.telegram.messenger'],
    },
    proportionalityChecklist: {
      legality: 'IT Act §69 read with 2009 Rules R.3.',
      legitimateAim:
        'Prevention of incitement to a cognizable offence — organised fraud ring.',
      proportionality:
        'Narrowest scope: only metadata + payment-context keystrokes in two apps.',
      proceduralSafeguards:
        'Review Committee sign-off dated 2026-08-01; audit chain enabled.',
    },
    reviewCommitteeApproval: {
      approvers: [
        {
          officerId: 'off_review_1',
          designation: 'Cabinet Secretariat (stub)',
          approvedAt: new Date('2026-08-01T09:30:00+05:30'),
        },
      ],
      quorumMet: false,
      isPrototypeStub: true,
    },
    statuteReferences: ['IT_ACT_S69', 'IT_RULES_2009_R3', 'IT_RULES_2009_R11'],
    signedOrderDocumentHash:
      'sha256:0000000000000000000000000000000000000000000000000000000000000000',
    signedOrderDocumentRef: 'stub://warrant/auth_001.pdf',
    status: 'ACTIVE',
    revocationLog: [],
    createdAt: new Date('2026-08-01T09:00:00+05:30'),
    updatedAt: new Date('2026-08-01T10:00:00+05:30'),
  },
  auth_003: {
    id: 'auth_003',
    caseId: 'case_003',
    subjectId: 'subj_C0918',
    type: 'JUDICIAL_WARRANT',
    legitimateAim: 'INVESTIGATION_OF_OFFENCE',
    issuingAuthorityId: 'off_home_sec_mh',
    issuedOn: new Date('2026-08-20T10:00:00+05:30'),
    expiresOn: new Date('2026-10-19T10:00:00+05:30'),
    scope: {
      dataCategories: ['COMMS_METADATA'],
      devices: ['dev_C0918_1'],
    },
    proportionalityChecklist: {
      legality: 'IT Act §69 read with 2009 Rules R.3.',
      legitimateAim: 'Investigation of cognizable offence (BNS 69).',
      proportionality: 'Metadata only. No content collection.',
      proceduralSafeguards: 'Review Committee sign-off pending upload.',
    },
    statuteReferences: ['IT_ACT_S69', 'IT_RULES_2009_R3'],
    signedOrderDocumentHash:
      'sha256:1111111111111111111111111111111111111111111111111111111111111111',
    signedOrderDocumentRef: 'stub://warrant/auth_003.pdf',
    status: 'ACTIVE',
    revocationLog: [],
    createdAt: new Date('2026-08-20T09:00:00+05:30'),
    updatedAt: new Date('2026-08-20T10:00:00+05:30'),
  },
};

// ---------------------------------------------------------------------------
// Read helpers — parent-store.ts equivalents, forensic-shaped.
// ---------------------------------------------------------------------------

/** TODO(WIRE-TO-SCHEMA): read `case` rows where officer is in assignedOfficers. */
export async function getCasesForOfficer(officerId: string): Promise<Case[]> {
  return FIXTURE_CASES.filter((c) => c.assignedOfficers.includes(officerId));
}

/** TODO(WIRE-TO-SCHEMA): scope-rewritten single case read. */
export async function getCaseById(caseId: string): Promise<Case | null> {
  return FIXTURE_CASES.find((c) => c.id === caseId) ?? null;
}

export async function getSubjectForCase(
  caseId: string,
): Promise<Subject | null> {
  return FIXTURE_SUBJECTS[caseId] ?? null;
}

export async function getAuthorizationsForCase(
  caseId: string,
): Promise<Authorization[]> {
  return Object.values(FIXTURE_AUTHS).filter((a) => a.caseId === caseId);
}

export async function getAuthorizationById(
  id: string,
): Promise<Authorization | null> {
  return FIXTURE_AUTHS[id] ?? null;
}

/** TODO(WIRE-TO-SCHEMA): scope-rewritten evidence metadata read. */
export async function getEvidenceMetadataForCase(
  _caseId: string,
): Promise<Evidence[]> {
  return [];
}

export async function getSessionsForCase(
  _caseId: string,
): Promise<MonitoringSession[]> {
  return [];
}

/** TODO(WIRE-TO-SCHEMA): read from append-only audit_log table. */
export async function getAuditChain(): Promise<AuditLogEntry[]> {
  return [
    {
      id: 1,
      actorId: 'SYSTEM',
      actorRole: 'SYSTEM',
      action: 'AUTH_ISSUE',
      targetType: 'Authorization',
      targetId: 'auth_001',
      timestamp: new Date('2026-08-01T10:00:00+05:30'),
      hash: 'sha256:aa11…c40e',
    },
    {
      id: 2,
      prevAuditHash: 'sha256:aa11…c40e',
      actorId: 'off_demo_1',
      actorRole: 'INVESTIGATING_OFFICER',
      action: 'EVIDENCE_READ',
      targetType: 'Evidence',
      targetId: 'ev_9f21…',
      timestamp: new Date('2026-08-14T18:22:00+05:30'),
      hash: 'sha256:bb22…d51f',
    },
    {
      id: 3,
      prevAuditHash: 'sha256:bb22…d51f',
      actorId: 'off_demo_1',
      actorRole: 'INVESTIGATING_OFFICER',
      action: 'QUERY_REWRITE_BLOCKED',
      context: { reason: 'Out-of-scope case_id in query' },
      timestamp: new Date('2026-08-15T09:41:00+05:30'),
      hash: 'sha256:cc33…e620',
    },
  ];
}

export const CURRENT_OFFICER_FIXTURE = FIXTURE_OFFICER;
