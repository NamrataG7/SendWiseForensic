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
