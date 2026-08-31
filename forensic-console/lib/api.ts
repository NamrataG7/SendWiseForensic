/**
 * Route-handler helpers: officer + role resolution, request context,
 * and small JSON response utilities.
 */

import { NextResponse, type NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Jurisdiction, RoleName } from '@/lib/entities';

export function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error, ...extra }, { status });
}

export function jsonOk<T>(data: T, status = 200) {
  return NextResponse.json({ ok: true, data }, { status });
}

/** Resolve officer_id + roles + home_jurisdiction for the caller. */
export async function resolveCaller(
  supabase: SupabaseClient,
): Promise<
  | {
      ok: true;
      officerId: string;
      roles: RoleName[];
      email: string | null;
      homeJurisdiction: Jurisdiction | null;
    }
  | { ok: false; status: number; error: string }
> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, status: 401, error: 'Not authenticated' };
  }

  const { data: officer, error: officerErr } = await supabase
    .from('officer')
    .select('id, active, home_jurisdiction')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (officerErr) {
    return { ok: false, status: 500, error: `officer lookup failed: ${officerErr.message}` };
  }
  if (!officer) {
    return {
      ok: false,
      status: 403,
      error: 'No officer record linked to this account',
    };
  }
  if (!(officer as { active: boolean }).active) {
    return { ok: false, status: 403, error: 'Officer record is inactive' };
  }

  const { data: roleRows, error: roleErr } = await supabase
    .from('officer_role')
    .select('role:role_id(name)')
    .eq('officer_id', (officer as { id: string }).id)
    .is('revoked_at', null);
  if (roleErr) {
    return { ok: false, status: 500, error: `role lookup failed: ${roleErr.message}` };
  }
  const roles = (roleRows ?? [])
    .map((r) => (r as unknown as { role: { name: string } | null }).role?.name)
    .filter((n): n is RoleName => Boolean(n)) as RoleName[];

  return {
    ok: true,
    officerId: (officer as { id: string }).id,
    roles,
    email: user.email ?? null,
    homeJurisdiction:
      ((officer as { home_jurisdiction: Jurisdiction | null }).home_jurisdiction) ?? null,
  };
}

/**
 * Refuse callers whose home_jurisdiction is not in the allowed list.
 * Cross-jurisdiction access outside home requires an explicit
 * officer_jurisdiction_grant row (enforced at RLS); this helper is a
 * cheap application-layer guard for route handlers.
 */
export function requireHomeJurisdictionOr(
  caller: { homeJurisdiction: Jurisdiction | null },
  list: Jurisdiction[],
): { ok: true } | { ok: false; status: number; error: string } {
  if (!caller.homeJurisdiction) {
    return {
      ok: false,
      status: 403,
      error:
        'Officer has no home_jurisdiction. Complete /onboarding/jurisdiction before accessing this route.',
    };
  }
  if (!list.includes(caller.homeJurisdiction)) {
    return {
      ok: false,
      status: 403,
      error:
        `This route is restricted to officers whose home_jurisdiction is one of: ${list.join(', ')}. ` +
        `Yours is '${caller.homeJurisdiction}'. Request a cross-jurisdiction grant.`,
    };
  }
  return { ok: true };
}

export function requireRole(
  caller: { roles: RoleName[] },
  allowed: RoleName[],
): boolean {
  return caller.roles.some((r) => allowed.includes(r));
}

/**
 * Same as requireRole; readability alias when the caller wants to make it
 * obvious multiple roles are acceptable.
 *
 *   requireRoleAny(caller, ['INVESTIGATING_OFFICER', 'SUPERVISING_OFFICER'])
 */
export function requireRoleAny(
  caller: { roles: RoleName[] },
  allowed: RoleName[],
): boolean {
  return requireRole(caller, allowed);
}

/**
 * Filter-team invariant guard.
 *
 * The Filter Team's write surface is intentionally narrow: they may create
 * filter_team_review rows against evidence rows visible to them (which RLS
 * restricts to `quarantine_status = 'PENDING_FILTER'`) and nothing else.
 *
 * Any route that mutates evidence or evidence_export SHOULD call
 * `refuseIfOnlyFilterTeam(caller)` first, so a filter-team account holder
 * who somehow reaches an investigator route (e.g. bad link, replay) is
 * rejected at the application layer even before the DB check.
 *
 * TODO(FILTER-TEAM-INDEPENDENCE): production requires organizational
 * separation (independent judicial officers, not police). Prototype
 * enforces role separation only.
 */
export function refuseIfOnlyFilterTeam(caller: {
  roles: RoleName[];
}): { ok: true } | { ok: false; status: number; error: string } {
  const onlyFilterTeam =
    caller.roles.length > 0 && caller.roles.every((r) => r === 'FILTER_TEAM');
  if (onlyFilterTeam) {
    return {
      ok: false,
      status: 403,
      error:
        'Filter Team accounts may only read the quarantine queue and file reviews.',
    };
  }
  return { ok: true };
}

/** Client IP for audit context. Best-effort — proxies may strip. */
export function requestIp(req: NextRequest): string | undefined {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]?.trim();
  return undefined;
}
