/**
 * @sendwise-forensic/legal-framework — barrel export.
 */

export * from './types.js';
export * from './schemas.js';
export * from './adapter.js';
export { indiaLegalFramework, IndiaLegalFramework } from './india/index.js';
export { STATUTES as IN_STATUTES } from './india/statutes.js';
export type { StatuteCode as INStatuteCode, StatuteReference } from './india/statutes.js';
