/**
 * Per-jurisdiction theming tokens for the forensic console.
 *
 * Purpose: an officer or examiner should NEVER be visually confused about
 * which court they are operating under. Every top-level surface reads a
 * `Case.jurisdiction` (or the officer's home_jurisdiction on jurisdiction-
 * neutral pages) and applies the matching theme.
 *
 * Jurisdiction is chosen ONLY at Case creation and is immutable in the DB
 * (see supabase/migrations/20260831120000_jurisdiction_fields.sql). The
 * console never asks an officer to pick a jurisdiction when issuing an
 * authorization; the adapter is selected server-side from Case.jurisdiction.
 */

import type { Jurisdiction } from '@/lib/entities';

export interface JurisdictionTheme {
  /** Header background utility (bg-*). Applied to the jurisdiction status bar. */
  headerBg: string;
  /** Accent utility (bg-*). Applied to pills, prong labels, accent rules. */
  accent: string;
  /** Serif prelude phrase shown centered in the status bar. */
  prelude: string;
  /** Full utility string for jurisdiction pills. */
  pillClass: string;
  /** Short adapter-provided purge-schedule note for the case creation cards. */
  purgeNote: string;
  /** Label shown on the dummy signed-order stamp for every upload. */
  dummyStampLabel: string;
}

export const JURISDICTION_THEME: Record<Jurisdiction, JurisdictionTheme> = {
  IN: {
    headerBg: 'bg-slate-900',
    accent: 'bg-indigo-800',
    prelude: 'IN THE MATTER OF',
    pillClass:
      'bg-indigo-800/20 text-indigo-100 border border-indigo-700',
    purgeNote:
      'Retention: purge on authorization cessation per IT Rules 2009 R.23 (records retained six months for oversight).',
    dummyStampLabel: 'DUMMY UIDAI e-Sign — PROTOTYPE',
  },
  US: {
    headerBg: 'bg-slate-900',
    accent: 'bg-[#1e3a8a]',
    prelude:
      'IN THE UNITED STATES DISTRICT COURT FOR THE ___ DISTRICT OF ___',
    pillClass:
      'bg-[#1e3a8a]/25 text-slate-100 border border-[#1e3a8a]',
    purgeNote:
      'Retention: Title III §2518(8)(a) sealing — recordings sealed under court order; minimum retention set by protective order.',
    dummyStampLabel: 'DUMMY JUDGE e-Signature — PROTOTYPE',
  },
  UK: {
    headerBg: 'bg-neutral-900',
    accent: 'bg-teal-700',
    prelude: 'IN THE MATTER OF THE INVESTIGATORY POWERS ACT 2016',
    pillClass:
      'bg-teal-700/25 text-teal-100 border border-teal-600',
    purgeNote:
      'Retention: IPA 2016 §150-§152 — material destroyed once retention is no longer necessary; IPCO review applies.',
    dummyStampLabel: 'DUMMY DOUBLE-LOCK (SoS + JC) — PROTOTYPE',
  },
};

/** Light-tone version of the pill for use on light backgrounds. */
export function jurisdictionPillClass(j: Jurisdiction): string {
  return JURISDICTION_THEME[j].pillClass;
}
