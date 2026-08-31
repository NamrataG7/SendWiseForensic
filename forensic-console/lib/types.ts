/**
 * @deprecated Legacy SendWise (parental) type surface. Retained during the
 * fork transition. All forensic UI code MUST import from `@/lib/entities`.
 *
 * A later lane deletes this file.
 */

export type SeverityLevel =
  | 'urgent'
  | 'critical'
  | 'high'
  | 'medium'
  | 'low'
  | 'none';
