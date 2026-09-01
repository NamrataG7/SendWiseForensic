/**
 * @sendwise-forensic/evidence-certificate — barrel export.
 *
 * BSA 2023 §63 certificate renderer for SendWiseForensic. Consumers:
 *   - forensic-console (Node runtime, evidence export flow)
 *   - Android upload-receipt component (future, shared subset)
 *
 * See README.md and docs/LEGAL_FRAMEWORK_IN.md §4 for statutory context.
 */

export * from './types';
export * from './fields';
export {
  CertificateInputSchema,
  RenderedCertificateJsonSchema,
  IssuedBySchema,
  AuthorizationRefSchema,
  DeviceRefSchema,
  CollectionRefSchema,
  EvidenceBundleSchema,
  IntegrityBlockSchema,
  DataCategoryEnum,
  AuthorizationTypeRefEnum,
  PlatformEnum,
} from './schema';
export { toCertificateJson, canonicalStringify } from './render-json';
export { toCertificatePdf } from './render-pdf';
export type { PdfRenderOptions } from './render-pdf';
export {
  sha256Hex,
  verifyHashChain,
  aggregatedRootHash,
  type HashChainEntry,
  type HashChainVerifyResult,
} from './integrity';
