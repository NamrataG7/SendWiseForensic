/**
 * Data-access helpers for the forensic console.
 *
 * Every function takes a per-request Supabase client (created via
 * `@/utils/supabase/server` from the officer's cookie session) so that
 * RLS in supabase/migrations/…_rls_and_query_gates.sql is enforced on
 * every read. Never pass a service-role client here.
 *
 * Row shapes returned by `.select('*')` come out snake_case; we map into
 * the camelCase types in `@/lib/entities` so the UI stays typed.
 *
 * NOTE: These map DB rows to UI-shaped types. The Zod entity schemas in
 * @sendwise-forensic/legal-framework/schemas are ISO-string-typed and
 * used by the API layer for validation; UI-side types (lib/entities)
 * use Date. Bridging happens at the API boundary (see `lib/authz.ts`).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AuditLogEntry,
  Authorization,
  Case,
  Officer,
  Subject,
} from '@/lib/entities';

// ---------------------------------------------------------------------------
// Row types (snake_case, mirroring supabase/migrations/*.sql)
// ---------------------------------------------------------------------------

interface CaseRow {
  id: string;
  jurisdiction: 'IN' | 'US' | 'UK';
  external_case_ref: string;
  offences: string[];
  status: Case['status'];
  created_by: string;
  created_at: string;
  closed_at: string | null;
}

interface OfficerRow {
  id: string;
  auth_user_id: string | null;
  full_name: string;
  service_id: string | null;
  email: string | null;
  jurisdiction: 'IN' | 'US' | 'UK';
  organization: string | null;
  identity_verified: boolean;
  active: boolean;
}

interface AuthorizationRow {
  id: string;
  case_id: string;
  subject_id: string;
  type: Authorization['type'];
  legitimate_aim: string;
  issuing_authority_id: string;
  issued_on: string;
  expires_on: string;
  scope: Record<string, unknown>;
  proportionality_checklist: Record<string, unknown>;
  review_committee_approval: Record<string, unknown> | null;
  statute_references: string[];
  signed_order_document_hash: string | null;
  signed_order_document_ref: string | null;
  dpdpa_exemption_ref: string | null;
  status: Authorization['status'];
  revocation_log: Array<{ actorId: string; reason: string; at: string }>;
  created_at: string;
  updated_at: string;
}

interface SubjectRow {
  id: string;
  pseudonymous_label: string;
  identity_refs: {
    aadhaarHash?: string;
    panHash?: string;
    verifiedByStub?: boolean;
  };
  created_at: string;
}

interface AuditLogRow {
  id: number;
  prev_hash: string | null;
  actor_id: string | null;
  actor_role: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  context: Record<string, unknown>;
  ip: string | null;
  device_info: string | null;
  timestamp: string;
  hash: string;
}

// ---------------------------------------------------------------------------
// Mappers — row → UI entity
// ---------------------------------------------------------------------------

function toCase(r: CaseRow): Case {
  return {
    id: r.id,
    jurisdiction: r.jurisdiction,
    externalCaseRef: r.external_case_ref,
    offences: r.offences ?? [],
    status: r.status,
    createdBy: r.created_by,
    assignedOfficers: [], // populated separately from case_officer join if needed
    createdAt: new Date(r.created_at),
    closedAt: r.closed_at ? new Date(r.closed_at) : undefined,
  };
}

function toOfficer(r: OfficerRow): Officer {
  return {
    id: r.id,
    fullName: r.full_name,
    designation: r.organization ?? '',
    roles: [],
    organisation: r.organization ?? '',
    serviceId: r.service_id ?? undefined,
    isActive: r.active,
  };
}

function toSubject(r: SubjectRow): Subject {
  return {
    id: r.id,
    pseudonymousLabel: r.pseudonymous_label,
    identityRefs: {
      aadhaarHash: r.identity_refs?.aadhaarHash,
      panHash: r.identity_refs?.panHash,
      verifiedByStub: r.identity_refs?.verifiedByStub ?? false,
    },
    devices: [],
    authorizations: [],
    createdAt: new Date(r.created_at),
  };
}

function toAuthorization(r: AuthorizationRow): Authorization {
  const scope = r.scope as unknown as Authorization['scope'];
  const checklist = r
    .proportionality_checklist as unknown as Authorization['proportionalityChecklist'];
  return {
    id: r.id,
    caseId: r.case_id,
    subjectId: r.subject_id,
    type: r.type,
    // The DB stores legitimate_aim as free text; the enum-typed UI shape
    // accepts it as-is — the wizard/adapter constrains valid values.
    legitimateAim: r.legitimate_aim as Authorization['legitimateAim'],
    issuingAuthorityId: r.issuing_authority_id,
    issuedOn: new Date(r.issued_on),
    expiresOn: new Date(r.expires_on),
    scope,
    proportionalityChecklist: checklist,
    reviewCommitteeApproval:
      (r.review_committee_approval as unknown as Authorization['reviewCommitteeApproval']) ??
      undefined,
    statuteReferences: r.statute_references ?? [],
    signedOrderDocumentHash: r.signed_order_document_hash ?? '',
    signedOrderDocumentRef: r.signed_order_document_ref ?? '',
    dpdpaExemptionRef: r.dpdpa_exemption_ref ?? undefined,
    status: r.status,
    revocationLog: (r.revocation_log ?? []).map((e) => ({
      actorId: e.actorId,
      reason: e.reason,
      at: new Date(e.at),
    })),
    createdAt: new Date(r.created_at),
    updatedAt: new Date(r.updated_at),
  };
}

function toAuditEntry(r: AuditLogRow): AuditLogEntry {
  return {
    id: r.id,
    prevAuditHash: r.prev_hash ?? undefined,
    actorId: (r.actor_id ?? 'SYSTEM') as AuditLogEntry['actorId'],
    actorRole: r.actor_role as AuditLogEntry['actorRole'],
    action: r.action as AuditLogEntry['action'],
    targetType: r.target_type ?? undefined,
    targetId: r.target_id ?? undefined,
    context: r.context,
    ip: r.ip ?? undefined,
    deviceInfo: r.device_info ?? undefined,
    timestamp: new Date(r.timestamp),
    hash: r.hash,
  };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Resolve the Officer row for the current Supabase user. Returns null if
 * the user is not linked to an officer record (unassigned account).
 */
export async function getCurrentOfficer(
  supabase: SupabaseClient,
): Promise<Officer | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from('officer')
    .select('*')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (error || !data) return null;
  return toOfficer(data as OfficerRow);
}

/**
 * Cases where the current officer is a live assignee (case_officer join
 * with unassigned_at IS NULL). RLS also restricts this at the row level,
 * but the join keeps queries explicit.
 */
export async function listCasesForCurrentOfficer(
  supabase: SupabaseClient,
): Promise<Case[]> {
  const officer = await getCurrentOfficer(supabase);
  if (!officer) return [];
  const { data, error } = await supabase
    .from('case_officer')
    .select('case:case_id(*)')
    .eq('officer_id', officer.id)
    .is('unassigned_at', null);
  if (error || !data) return [];
  return (data as unknown as { case: CaseRow }[])
    .map((row) => row.case)
    .filter((c): c is CaseRow => Boolean(c))
    .map(toCase);
}

export async function getCaseById(
  supabase: SupabaseClient,
  caseId: string,
): Promise<Case | null> {
  const { data, error } = await supabase
    .from('case')
    .select('*')
    .eq('id', caseId)
    .maybeSingle();
  if (error || !data) return null;
  return toCase(data as CaseRow);
}

export async function listAuthorizationsForCase(
  supabase: SupabaseClient,
  caseId: string,
): Promise<Authorization[]> {
  const { data, error } = await supabase
    .from('authorization')
    .select('*')
    .eq('case_id', caseId)
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return (data as AuthorizationRow[]).map(toAuthorization);
}

export async function getAuthorizationById(
  supabase: SupabaseClient,
  id: string,
): Promise<Authorization | null> {
  const { data, error } = await supabase
    .from('authorization')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null;
  return toAuthorization(data as AuthorizationRow);
}

export async function listSubjectsForCase(
  supabase: SupabaseClient,
  caseId: string,
): Promise<Subject[]> {
  // Subjects tied to a case via authorization.
  const { data, error } = await supabase
    .from('authorization')
    .select('subject:subject_id(*)')
    .eq('case_id', caseId);
  if (error || !data) return [];
  const seen = new Set<string>();
  const out: Subject[] = [];
  for (const row of data as unknown as { subject: SubjectRow | null }[]) {
    if (row.subject && !seen.has(row.subject.id)) {
      seen.add(row.subject.id);
      out.push(toSubject(row.subject));
    }
  }
  return out;
}

/**
 * Audit tail scoped to a target. Used on case detail and authorization
 * detail pages. RLS on audit_log itself is not restrictive in the
 * prototype — the API route enforces role-based access.
 */
export async function listAuditTail(
  supabase: SupabaseClient,
  opts: {
    targetType?: string;
    targetId?: string;
    limit?: number;
    offset?: number;
  } = {},
): Promise<AuditLogEntry[]> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 500);
  const offset = Math.max(opts.offset ?? 0, 0);
  let q = supabase
    .from('audit_log')
    .select('*')
    .order('id', { ascending: true })
    .range(offset, offset + limit - 1);
  if (opts.targetType) q = q.eq('target_type', opts.targetType);
  if (opts.targetId) q = q.eq('target_id', opts.targetId);
  const { data, error } = await q;
  if (error || !data) return [];
  return (data as AuditLogRow[]).map(toAuditEntry);
}

/**
 * Sanctioned audit-append via the SECURITY DEFINER RPC.
 *
 * TODO(AUDIT-ATOMICITY): Postgres does not expose multi-statement
 * transactions across supabase-js calls. We invoke p_append_audit after
 * the primary mutation; if the audit write fails, the caller must attempt
 * a compensating status revert (see lib/authz.ts issueAuthorization).
 * The proper fix is to wrap the primary mutation + p_append_audit inside
 * a single SQL function so both live in the same transaction. Tracked
 * as TODO(AUDIT-ATOMICITY).
 */
export async function appendAudit(
  supabase: SupabaseClient,
  args: {
    actorId: string | null;
    actorRole: string;
    action: string;
    targetType?: string;
    targetId?: string;
    context?: Record<string, unknown>;
    ip?: string;
    deviceInfo?: string;
  },
): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc('p_append_audit', {
    p_actor_id: args.actorId,
    p_actor_role: args.actorRole,
    p_action: args.action,
    p_target_type: args.targetType ?? null,
    p_target_id: args.targetId ?? null,
    p_context: args.context ?? {},
    p_ip: args.ip ?? null,
    p_device_info: args.deviceInfo ?? null,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: Number(data) };
}

// ---------------------------------------------------------------------------
// Evidence + Export + Filter-Team review row types and helpers.
//
// Metadata-only reads: we intentionally do NOT select payload_ref
// (raw payload / cold-storage handle) from any of these helpers. RLS on
// evidence hides raw_payload effectively already, but keeping the SELECT
// list narrow means an accidental client-render leak is impossible.
// ---------------------------------------------------------------------------

export type EvidenceCategoryDb =
  | 'KEYSTROKE_BATCH'
  | 'APP_EVENT'
  | 'COMMS_METADATA'
  | 'RISK_DETECTION';

export type PrivilegeFlagDb =
  | 'NONE'
  | 'LEGAL'
  | 'MEDICAL'
  | 'CLERGY'
  | 'SPOUSAL'
  | 'UNKNOWN';

export type QuarantineStatusDb = 'PENDING_FILTER' | 'RELEASED' | 'SUPPRESSED';

export interface EvidenceMetadataRow {
  id: string;
  sessionId: string;
  category: EvidenceCategoryDb;
  capturedAt: Date;
  payloadHash: string;
  prevEvidenceHash: string | null;
  privilegeFlag: PrivilegeFlagDb;
  quarantineStatus: QuarantineStatusDb | null;
  createdAt: Date;
}

interface EvidenceRowRaw {
  id: string;
  session_id: string;
  category: EvidenceCategoryDb;
  captured_at: string;
  payload_hash: string;
  prev_evidence_hash: string | null;
  privilege_flag: PrivilegeFlagDb;
  quarantine_status: QuarantineStatusDb | null;
  created_at: string;
}

function toEvidenceMetadata(r: EvidenceRowRaw): EvidenceMetadataRow {
  return {
    id: r.id,
    sessionId: r.session_id,
    category: r.category,
    capturedAt: new Date(r.captured_at),
    payloadHash: r.payload_hash,
    prevEvidenceHash: r.prev_evidence_hash,
    privilegeFlag: r.privilege_flag,
    quarantineStatus: r.quarantine_status,
    createdAt: new Date(r.created_at),
  };
}

/**
 * Investigative read: evidence metadata for a case, RLS-scoped.
 * Per ENTITY_MODEL.md §3.4, the RLS policy already excludes
 * PENDING_FILTER and SUPPRESSED — we mirror that filter in the SELECT
 * for defence-in-depth against an RLS misconfiguration.
 */
export async function listEvidenceMetadataForCase(
  supabase: SupabaseClient,
  caseId: string,
): Promise<EvidenceMetadataRow[]> {
  const { data, error } = await supabase
    .from('evidence')
    .select(
      'id, session_id, category, captured_at, payload_hash, prev_evidence_hash, privilege_flag, quarantine_status, created_at, monitoring_session:session_id!inner(authorization:authorization_id!inner(case_id))',
    )
    .eq('monitoring_session.authorization.case_id', caseId)
    .or('quarantine_status.is.null,quarantine_status.eq.RELEASED')
    .order('captured_at', { ascending: false });
  if (error || !data) return [];
  return (data as unknown as EvidenceRowRaw[]).map(toEvidenceMetadata);
}

/**
 * Bulk fetch of evidence rows by id, RLS-scoped. Used by the export
 * generate route to gather hashes for hash-chain verification and for
 * the aggregated root hash.
 *
 * Returns rows in the SAME ORDER as `ids` (missing rows are omitted).
 */
export async function getEvidenceByIds(
  supabase: SupabaseClient,
  ids: string[],
): Promise<EvidenceMetadataRow[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from('evidence')
    .select(
      'id, session_id, category, captured_at, payload_hash, prev_evidence_hash, privilege_flag, quarantine_status, created_at',
    )
    .in('id', ids);
  if (error || !data) return [];
  const map = new Map<string, EvidenceMetadataRow>();
  for (const r of data as unknown as EvidenceRowRaw[]) {
    map.set(r.id, toEvidenceMetadata(r));
  }
  const out: EvidenceMetadataRow[] = [];
  for (const id of ids) {
    const row = map.get(id);
    if (row) out.push(row);
  }
  return out;
}

/**
 * Filter Team read: cross-case pending queue. RLS enforces
 * (auth_role() = 'FILTER_TEAM' AND quarantine_status = 'PENDING_FILTER').
 */
export async function listFilterTeamQueue(
  supabase: SupabaseClient,
  opts: { limit?: number; offset?: number } = {},
): Promise<EvidenceMetadataRow[]> {
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
  const offset = Math.max(opts.offset ?? 0, 0);
  const { data, error } = await supabase
    .from('evidence')
    .select(
      'id, session_id, category, captured_at, payload_hash, prev_evidence_hash, privilege_flag, quarantine_status, created_at',
    )
    .eq('quarantine_status', 'PENDING_FILTER')
    .order('created_at', { ascending: true })
    .range(offset, offset + limit - 1);
  if (error || !data) return [];
  return (data as unknown as EvidenceRowRaw[]).map(toEvidenceMetadata);
}

// ---------------------------------------------------------------------------
// Evidence export rows
// ---------------------------------------------------------------------------

export type ExportPurposeDb =
  | 'COURT_SUBMISSION'
  | 'INTERNAL_REVIEW'
  | 'DEFENSE_DISCLOSURE';

/**
 * evidence_export table has no `status` column in the current schema;
 * we derive it from approved_by cardinality + exported_at at the API
 * layer so the UI has a status timeline without a schema migration.
 */
export type ExportDerivedStatus =
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'GENERATED';

export interface EvidenceExportRecord {
  id: string;
  caseId: string;
  evidenceIds: string[];
  requestedBy: string;
  approvedBy: string[];
  purpose: ExportPurposeDb;
  bsaSection63CertificateRef: string | null;
  exportedAt: Date | null;
  recipientNotice: string;
  createdAt: Date;
  updatedAt: Date;
  derivedStatus: ExportDerivedStatus;
}

interface EvidenceExportRowRaw {
  id: string;
  case_id: string;
  evidence_ids: string[];
  requested_by: string;
  approved_by: string[];
  purpose: ExportPurposeDb;
  bsa_section_63_certificate_ref: string | null;
  exported_at: string | null;
  recipient_notice: string;
  created_at: string;
  updated_at: string;
}

function deriveExportStatus(r: EvidenceExportRowRaw): ExportDerivedStatus {
  if (r.exported_at && r.bsa_section_63_certificate_ref) return 'GENERATED';
  if ((r.approved_by ?? []).length >= 2) return 'APPROVED';
  return 'PENDING_APPROVAL';
}

function toEvidenceExport(r: EvidenceExportRowRaw): EvidenceExportRecord {
  return {
    id: r.id,
    caseId: r.case_id,
    evidenceIds: r.evidence_ids ?? [],
    requestedBy: r.requested_by,
    approvedBy: r.approved_by ?? [],
    purpose: r.purpose,
    bsaSection63CertificateRef: r.bsa_section_63_certificate_ref,
    exportedAt: r.exported_at ? new Date(r.exported_at) : null,
    recipientNotice: r.recipient_notice,
    createdAt: new Date(r.created_at),
    updatedAt: new Date(r.updated_at),
    derivedStatus: deriveExportStatus(r),
  };
}

export async function getEvidenceExportById(
  supabase: SupabaseClient,
  id: string,
): Promise<EvidenceExportRecord | null> {
  const { data, error } = await supabase
    .from('evidence_export')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null;
  return toEvidenceExport(data as EvidenceExportRowRaw);
}

// ---------------------------------------------------------------------------
// Filter Team review row (post-decision insertion; RLS restricts writes).
// ---------------------------------------------------------------------------

export type FilterTeamDecision =
  | 'RELEASE'
  | 'SUPPRESS'
  | 'REDACT_AND_RELEASE';

export async function insertFilterTeamReview(
  supabase: SupabaseClient,
  args: {
    evidenceId: string;
    reviewerId: string;
    decision: FilterTeamDecision;
    reason: string;
  },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from('filter_team_review')
    .insert({
      evidence_id: args.evidenceId,
      reviewer_id: args.reviewerId,
      decision: args.decision,
      reason: args.reason,
    })
    .select('id')
    .single();
  if (error || !data) {
    return { ok: false, error: error?.message ?? 'insert failed' };
  }
  return { ok: true, id: (data as { id: string }).id };
}

/**
 * Update evidence.quarantine_status based on the filter-team decision.
 *   RELEASE            -> RELEASED
 *   SUPPRESS           -> SUPPRESSED
 *   REDACT_AND_RELEASE -> RELEASED (with redactions_applied appended;
 *                        the redaction pipeline lives outside prototype)
 */
export async function applyFilterTeamDecisionToEvidence(
  supabase: SupabaseClient,
  args: { evidenceId: string; decision: FilterTeamDecision; reason: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const next: QuarantineStatusDb =
    args.decision === 'SUPPRESS' ? 'SUPPRESSED' : 'RELEASED';

  // For REDACT_AND_RELEASE we append a redaction marker; the actual
  // redaction pipeline is out of scope for the prototype console.
  // TODO(FILTER-TEAM-INDEPENDENCE) run the real redaction pipeline before
  // flipping to RELEASED.
  const update: Record<string, unknown> = { quarantine_status: next };
  if (args.decision === 'REDACT_AND_RELEASE') {
    update.redactions_applied = [
      { by: 'FILTER_TEAM', reason: args.reason, at: new Date().toISOString() },
    ];
  }

  const { error } = await supabase
    .from('evidence')
    .update(update)
    .eq('id', args.evidenceId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Session + Device + Officer lookups used by the export/generate route to
// assemble the BSA §63 certificate input.
// ---------------------------------------------------------------------------

export interface MonitoringSessionRecord {
  id: string;
  authorizationId: string;
  deviceId: string;
  startedAt: Date;
  endsAt: Date;
  collectedCategories: string[];
}

interface MonitoringSessionRowRaw {
  id: string;
  authorization_id: string;
  device_id: string;
  started_at: string;
  ends_at: string;
  collected_categories: string[];
}

export async function getMonitoringSessionById(
  supabase: SupabaseClient,
  id: string,
): Promise<MonitoringSessionRecord | null> {
  const { data, error } = await supabase
    .from('monitoring_session')
    .select('id, authorization_id, device_id, started_at, ends_at, collected_categories')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null;
  const r = data as MonitoringSessionRowRaw;
  return {
    id: r.id,
    authorizationId: r.authorization_id,
    deviceId: r.device_id,
    startedAt: new Date(r.started_at),
    endsAt: new Date(r.ends_at),
    collectedCategories: r.collected_categories ?? [],
  };
}

export interface DeviceRecord {
  id: string;
  subjectId: string;
  platform: 'ANDROID';
  deviceFingerprint: string;
  hardwareBackedPubKey: string | null;
}

interface DeviceRowRaw {
  id: string;
  subject_id: string;
  platform: string;
  device_fingerprint: string;
  hardware_backed_pub_key: string | null;
}

export async function getDeviceById(
  supabase: SupabaseClient,
  id: string,
): Promise<DeviceRecord | null> {
  const { data, error } = await supabase
    .from('device')
    .select('id, subject_id, platform, device_fingerprint, hardware_backed_pub_key')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null;
  const r = data as DeviceRowRaw;
  return {
    id: r.id,
    subjectId: r.subject_id,
    platform: 'ANDROID',
    deviceFingerprint: r.device_fingerprint,
    hardwareBackedPubKey: r.hardware_backed_pub_key,
  };
}

export interface OfficerFull {
  id: string;
  fullName: string;
  serviceId: string | null;
  email: string | null;
  organization: string | null;
}

export async function getOfficerById(
  supabase: SupabaseClient,
  id: string,
): Promise<OfficerFull | null> {
  const { data, error } = await supabase
    .from('officer')
    .select('id, full_name, service_id, email, organization')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null;
  const r = data as {
    id: string;
    full_name: string;
    service_id: string | null;
    email: string | null;
    organization: string | null;
  };
  return {
    id: r.id,
    fullName: r.full_name,
    serviceId: r.service_id,
    email: r.email,
    organization: r.organization,
  };
}
