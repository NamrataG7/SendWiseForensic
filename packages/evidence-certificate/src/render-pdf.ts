/**
 * toCertificatePdf — renders a BSA §63 certificate as an A4 register-style
 * PDF using pdf-lib. Pure JS, works in Node and Vercel Edge.
 *
 * Design intent: this is an official-register document, not a marketing PDF.
 * Georgia-serif-like Times family, high contrast, generous margins, no
 * decorative elements. In prototypeMode we stamp a red "DUMMY VERIFIED —
 * PROTOTYPE" watermark so nobody accidentally files a prototype build as
 * real evidence.
 *
 * pdf-lib is imported dynamically so this module can be type-checked in an
 * environment where pdf-lib is not yet installed (e.g. during scaffolding
 * on a fresh clone). Callers must `npm install` before invoking.
 */

import { canonicalStringify, toCertificateJson } from './render-json';
import { sha256Hex } from './integrity';
import {
  SEC63_OPERATIONAL_STATEMENT_STATUTE_QUOTE,
} from './fields';
import type { CertificateInput, RenderedCertificateJson } from './types';

// Minimal ambient types so tsc does not require @types/pdf-lib at build time
// in packages that only consume the JSON path. Real signatures come from
// pdf-lib at runtime.
// TODO(PDF-LIB-TYPES) drop this stub once pdf-lib is a hard dev-dep and
// its .d.ts is available in every consumer's node_modules.
type AnyPdfLib = {
  PDFDocument: {
    create(): Promise<{
      embedFont(font: unknown): Promise<unknown>;
      addPage(size: [number, number]): {
        getSize(): { width: number; height: number };
        drawText(text: string, opts: Record<string, unknown>): void;
        drawRectangle(opts: Record<string, unknown>): void;
        drawLine(opts: Record<string, unknown>): void;
      };
      save(): Promise<Uint8Array>;
    }>;
  };
  StandardFonts: {
    TimesRoman: unknown;
    TimesRomanBold: unknown;
    TimesRomanItalic: unknown;
  };
  rgb(r: number, g: number, b: number): unknown;
};

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 56;

function tail(hex: string, n = 12): string {
  return hex.length <= n ? hex : `…${hex.slice(-n)}`;
}

export interface PdfRenderOptions {
  /** For testing: allow injecting a pre-imported pdf-lib module. */
  pdfLibModule?: AnyPdfLib;
}

export async function toCertificatePdf(
  input: CertificateInput,
  options: PdfRenderOptions = {},
): Promise<Uint8Array> {
  // Validate first; this throws CertificateValidationError on failure.
  const rendered: RenderedCertificateJson = toCertificateJson(input);
  const canonical = canonicalStringify(rendered);
  const antiTamperHash = sha256Hex(canonical);

  const pdfLib =
    options.pdfLibModule ??
    // Indirection via a runtime string prevents tsc from requiring
    // pdf-lib's type declarations at build time in consumers that only
    // use the JSON path. Real callers of toCertificatePdf MUST have
    // pdf-lib installed at runtime.
    ((await import(/* @vite-ignore */ 'pdf-lib' as string)) as unknown as AnyPdfLib);
  const { PDFDocument, StandardFonts, rgb } = pdfLib;

  const doc = await PDFDocument.create();
  const times = await doc.embedFont(StandardFonts.TimesRoman);
  const timesBold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const timesItalic = await doc.embedFont(StandardFonts.TimesRomanItalic);

  const page = doc.addPage(A4);
  const { width, height } = page.getSize();

  const black = rgb(0, 0, 0);
  const red = rgb(0.72, 0.05, 0.08);
  const grey = rgb(0.35, 0.35, 0.35);

  let cursorY = height - MARGIN;

  const drawText = (
    text: string,
    x: number,
    y: number,
    font: unknown,
    size: number,
    color: unknown = black,
  ) => {
    page.drawText(text, { x, y, size, font, color });
  };

  const drawParagraph = (
    text: string,
    x: number,
    startY: number,
    font: unknown,
    size: number,
    maxWidth: number,
    lineGap = 4,
  ): number => {
    const words = text.split(/\s+/);
    let line = '';
    let y = startY;
    // pdf-lib exposes widthOfTextAtSize on font objects; we approximate to
    // avoid tightly coupling to that method in our ambient type.
    const approxWidth = (s: string) => s.length * size * 0.5;
    for (const w of words) {
      const candidate = line ? `${line} ${w}` : w;
      if (approxWidth(candidate) > maxWidth && line) {
        drawText(line, x, y, font, size);
        y -= size + lineGap;
        line = w;
      } else {
        line = candidate;
      }
    }
    if (line) {
      drawText(line, x, y, font, size);
      y -= size + lineGap;
    }
    return y;
  };

  // ── Header ────────────────────────────────────────────────────────────
  drawText('IN THE MATTER OF', MARGIN, cursorY, timesBold, 16);
  drawText(
    'BHARATIYA SAKSHYA ADHINIYAM, 2023 — SECTION 63',
    MARGIN,
    cursorY - 20,
    timesBold,
    12,
  );
  drawText(
    'CERTIFICATE OF ELECTRONIC RECORD',
    MARGIN,
    cursorY - 36,
    timesBold,
    12,
  );

  drawText(
    `Certificate ID: ${rendered.certificateId}`,
    width - MARGIN - 240,
    cursorY,
    times,
    9,
  );
  drawText(
    `Issued At: ${rendered.issuedAt}`,
    width - MARGIN - 240,
    cursorY - 12,
    times,
    9,
  );

  cursorY -= 68;
  page.drawLine({
    start: { x: MARGIN, y: cursorY },
    end: { x: width - MARGIN, y: cursorY },
    thickness: 0.75,
    color: black,
  });
  cursorY -= 18;

  // ── Parties / authorization table ────────────────────────────────────
  drawText('1. Case & Authorization', MARGIN, cursorY, timesBold, 11);
  cursorY -= 16;

  const partyRows: Array<[string, string]> = [
    ['Case Reference', rendered.caseRef],
    ['Warrant ID', rendered.authorizationRef.warrantId],
    ['Authorization Type', rendered.authorizationRef.type],
    ['Issued On', rendered.authorizationRef.issuedOn],
    ['Expires On', rendered.authorizationRef.expiresOn],
    [
      'Statute References',
      rendered.authorizationRef.statuteReferences.join(', '),
    ],
  ];
  for (const [k, v] of partyRows) {
    drawText(k, MARGIN, cursorY, timesBold, 10);
    drawText(v, MARGIN + 150, cursorY, times, 10);
    cursorY -= 14;
  }

  cursorY -= 6;

  // ── Device block ──────────────────────────────────────────────────────
  drawText('2. Device Particulars (BSA §63(c))', MARGIN, cursorY, timesBold, 11);
  cursorY -= 16;
  const deviceRows: Array<[string, string]> = [
    ['Device ID', rendered.device.deviceId],
    ['Platform', rendered.device.platform],
    ['Model', rendered.device.model],
    ['Operating System', rendered.device.os],
    [
      'Fingerprint (tail)',
      tail(rendered.device.deviceFingerprint),
    ],
  ];
  for (const [k, v] of deviceRows) {
    drawText(k, MARGIN, cursorY, timesBold, 10);
    drawText(v, MARGIN + 150, cursorY, times, 10);
    cursorY -= 14;
  }
  cursorY -= 6;

  // ── Collection window ─────────────────────────────────────────────────
  drawText(
    '3. Collection Window (BSA §63(b))',
    MARGIN,
    cursorY,
    timesBold,
    11,
  );
  cursorY -= 16;
  drawText('Started At', MARGIN, cursorY, timesBold, 10);
  drawText(rendered.collection.startedAt, MARGIN + 150, cursorY, times, 10);
  cursorY -= 14;
  drawText('Ended At', MARGIN, cursorY, timesBold, 10);
  drawText(rendered.collection.endedAt, MARGIN + 150, cursorY, times, 10);
  cursorY -= 14;
  drawText('Session ID', MARGIN, cursorY, timesBold, 10);
  drawText(rendered.collection.sessionId, MARGIN + 150, cursorY, times, 10);
  cursorY -= 14;
  drawText('Categories', MARGIN, cursorY, timesBold, 10);
  drawText(
    rendered.collection.categories.join(', '),
    MARGIN + 150,
    cursorY,
    times,
    10,
  );
  cursorY -= 20;

  // ── Evidence table ────────────────────────────────────────────────────
  drawText('4. Evidence Records (BSA §63(a))', MARGIN, cursorY, timesBold, 11);
  cursorY -= 16;
  drawText('Evidence ID', MARGIN, cursorY, timesBold, 9);
  drawText('SHA-256 (tail)', MARGIN + 260, cursorY, timesBold, 9);
  cursorY -= 12;
  for (let i = 0; i < rendered.evidence.evidenceIds.length; i++) {
    const id = rendered.evidence.evidenceIds[i] ?? '';
    const h = rendered.evidence.hashes[i] ?? '';
    drawText(id, MARGIN, cursorY, times, 9);
    drawText(tail(h), MARGIN + 260, cursorY, times, 9);
    cursorY -= 11;
    if (cursorY < MARGIN + 220) break;
  }
  cursorY -= 6;
  drawText('Aggregated Root Hash', MARGIN, cursorY, timesBold, 10);
  cursorY -= 12;
  drawText(rendered.evidence.aggregatedRootHash, MARGIN, cursorY, times, 10);
  cursorY -= 20;

  // ── Operational-status statement (bordered box) ──────────────────────
  const boxTop = cursorY;
  const boxHeight = 110;
  page.drawRectangle({
    x: MARGIN,
    y: boxTop - boxHeight,
    width: width - 2 * MARGIN,
    height: boxHeight,
    borderColor: black,
    borderWidth: 0.75,
  });
  const innerY = boxTop - 16;
  drawText(
    '5. Statement of Operational Status (BSA §63(d))',
    MARGIN + 8,
    innerY,
    timesBold,
    10,
  );
  const quoteY = drawParagraph(
    `Statutory language: ${SEC63_OPERATIONAL_STATEMENT_STATUTE_QUOTE}`,
    MARGIN + 8,
    innerY - 16,
    timesItalic,
    9,
    width - 2 * MARGIN - 16,
  );
  drawParagraph(
    `Officer's declaration: ${rendered.deviceOperationalStatement}`,
    MARGIN + 8,
    quoteY - 4,
    times,
    9,
    width - 2 * MARGIN - 16,
  );
  cursorY = boxTop - boxHeight - 16;

  // ── Signature block ───────────────────────────────────────────────────
  drawText('6. Signing Officer', MARGIN, cursorY, timesBold, 11);
  cursorY -= 16;
  drawText('Name', MARGIN, cursorY, timesBold, 10);
  drawText(rendered.issuedBy.name, MARGIN + 150, cursorY, times, 10);
  cursorY -= 14;
  drawText('Designation', MARGIN, cursorY, timesBold, 10);
  drawText(rendered.issuedBy.designation, MARGIN + 150, cursorY, times, 10);
  cursorY -= 14;
  drawText('Organizational Unit', MARGIN, cursorY, timesBold, 10);
  drawText(
    rendered.issuedBy.organizationalUnit,
    MARGIN + 150,
    cursorY,
    times,
    10,
  );
  cursorY -= 14;
  drawText('Officer ID', MARGIN, cursorY, timesBold, 10);
  drawText(rendered.issuedBy.officerId, MARGIN + 150, cursorY, times, 10);
  cursorY -= 24;

  // ── Prototype stamp ───────────────────────────────────────────────────
  if (input.prototypeMode) {
    // TODO(ESIGN-VERIFICATION) replace with real signer certificate stamp.
    page.drawRectangle({
      x: width - MARGIN - 210,
      y: MARGIN + 60,
      width: 200,
      height: 44,
      borderColor: red,
      borderWidth: 2,
    });
    drawText(
      'DUMMY VERIFIED — PROTOTYPE',
      width - MARGIN - 200,
      MARGIN + 82,
      timesBold,
      11,
      red,
    );
    drawText(
      'Not for evidentiary use',
      width - MARGIN - 200,
      MARGIN + 68,
      timesItalic,
      8,
      red,
    );
  }

  // ── Footer ────────────────────────────────────────────────────────────
  drawText(
    `Statute references: ${rendered.statuteReferences.join(', ')}`,
    MARGIN,
    MARGIN + 24,
    times,
    8,
    grey,
  );
  drawText(
    `Anti-tamper SHA-256 (of canonical JSON): ${antiTamperHash}`,
    MARGIN,
    MARGIN + 12,
    times,
    8,
    grey,
  );

  return doc.save();
}
