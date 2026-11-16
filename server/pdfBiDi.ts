import fs from 'node:fs';
import bidiFactory from 'bidi-js';
import type PDFKit from 'pdfkit';

const bidi = bidiFactory();

export const FONT_PATHS = {
  arRegular: '/usr/share/fonts/truetype/noto/NotoSansArabic-Regular.ttf',
  arBold: '/usr/share/fonts/truetype/noto/NotoSansArabic-Bold.ttf',
  enRegular: '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  enBold: '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
} as const;

export function registerCorporateFonts(doc: PDFKit.PDFDocument): void {
  if (fs.existsSync(FONT_PATHS.arRegular)) {
    doc.registerFont('ArRegular', FONT_PATHS.arRegular);
  }
  if (fs.existsSync(FONT_PATHS.arBold)) {
    doc.registerFont('ArBold', FONT_PATHS.arBold);
  }
  if (fs.existsSync(FONT_PATHS.enRegular)) {
    doc.registerFont('EnRegular', FONT_PATHS.enRegular);
  }
  if (fs.existsSync(FONT_PATHS.enBold)) {
    doc.registerFont('EnBold', FONT_PATHS.enBold);
  }
}

const MIRROR_CHARS: Record<string, string> = {
  '(': ')',
  ')': '(',
  '[': ']',
  ']': '[',
  '{': '}',
  '}': '{',
  '<': '>',
  '>': '<',
  '«': '»',
  '»': '«',
};

const ARABIC_CHAR_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

export function containsArabic(text: string): boolean {
  return ARABIC_CHAR_RE.test(text);
}

/**
 * Normalizes strings before PDF BiDi layout:
 * - Converts Arabic-Indic digits (٠١٢٣٤٥٦٧٨٩) if any accidentally appear into Western 0-9
 * - Protects numeric percentages (e.g. 94.2%) from having '%' flipped in RTL BiDi
 *   by inserting Left-to-Right Mark semantics at token segmentation stage.
 */
function normalizeTextForPdf(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/\u200f|\u200e|\u202a|\u202b|\u202c|\u2066|\u2067|\u2068|\u2069/g, '');
}

interface InternalFontMetrics {
  hasGlyphForCodePoint?: (cp: number) => boolean;
}

function getFontObject(doc: PDFKit.PDFDocument, fontName: string): InternalFontMetrics | null {
  try {
    doc.font(fontName);
    return (doc as unknown as { _font?: { font?: InternalFontMetrics } })._font?.font ?? null;
  } catch {
    return null;
  }
}

export interface FontChunk {
  text: string;
  font: 'ArRegular' | 'ArBold' | 'EnRegular' | 'EnBold';
}

/**
 * Splits a token into homogeneous font chunks (NotoSansArabic for Arabic letters/spaces,
 * DejaVuSans for Latin, numbers, parentheses, and technical symbols missing from NotoSansArabic).
 */
export function splitFontChunks(
  doc: PDFKit.PDFDocument,
  text: string,
  bold: boolean,
  preferLatinFont: boolean
): FontChunk[] {
  if (!text) return [];
  const arFontName = bold ? 'ArBold' : 'ArRegular';
  const enFontName = bold ? 'EnBold' : 'EnRegular';

  if (preferLatinFont && !containsArabic(text)) {
    return [{ text, font: enFontName }];
  }

  const arMetrics = getFontObject(doc, arFontName);
  const enMetrics = getFontObject(doc, enFontName);

  const chunks: FontChunk[] = [];
  let curFont: 'ArRegular' | 'ArBold' | 'EnRegular' | 'EnBold' | null = null;
  let buf = '';

  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 32;
    const isArScript = ARABIC_CHAR_RE.test(ch);
    let targetFont: 'ArRegular' | 'ArBold' | 'EnRegular' | 'EnBold';

    if (isArScript) {
      targetFont = arFontName;
    } else if (ch === ' ' || ch === '\t') {
      // Keep space in current run to preserve natural spacing, default to ar if RTL
      targetFont = curFont ?? (preferLatinFont ? enFontName : arFontName);
    } else {
      const arHas = arMetrics?.hasGlyphForCodePoint ? arMetrics.hasGlyphForCodePoint(cp) : false;
      const enHas = enMetrics?.hasGlyphForCodePoint ? enMetrics.hasGlyphForCodePoint(cp) : true;
      if (preferLatinFont && enHas) {
        targetFont = enFontName;
      } else if (enHas && (!arHas || /[A-Za-z0-9()[\]{}<>%+\-/*=]/.test(ch))) {
        targetFont = enFontName;
      } else if (arHas) {
        targetFont = arFontName;
      } else {
        targetFont = enHas ? enFontName : arFontName;
      }
    }

    if (curFont && targetFont !== curFont) {
      if (buf) chunks.push({ text: buf, font: curFont });
      buf = ch;
      curFont = targetFont;
    } else {
      curFont = targetFont;
      buf += ch;
    }
  }
  if (buf && curFont) {
    chunks.push({ text: buf, font: curFont });
  }
  return chunks;
}

export function measureChunkedWidth(
  doc: PDFKit.PDFDocument,
  text: string,
  fontSize: number,
  bold: boolean,
  preferLatinFont = false
): number {
  if (!text) return 0;
  const chunks = splitFontChunks(doc, text, bold, preferLatinFont);
  let total = 0;
  doc.fontSize(fontSize);
  for (const c of chunks) {
    doc.font(c.font);
    total += doc.widthOfString(c.text);
  }
  return total;
}

interface BidiToken {
  text: string;
  level: number;
  isRtl: boolean;
}

/**
 * Converts a single logical line into visually ordered tokens (Left-to-Right for PDF drawing).
 * Preserves Arabic word integrity for Fontkit OpenType ligatures, mirrors RTL brackets,
 * and keeps Western numbers / percentages (94.2%) / dates (12/01/2027) unreversed.
 */
function reorderLogicalLineToVisualTokens(rawLine: string, baseDir: 'rtl' | 'ltr'): BidiToken[] {
  const line = normalizeTextForPdf(rawLine);
  if (!line) return [];

  // Temporarily tag LTR percentage suffixes e.g. 94.2% or 100% by keeping '%' at LTR level
  const embedding = bidi.getEmbeddingLevels(line, baseDir);
  const levels = Array.from(embedding.levels);

  // Fix '%' / '°' immediately following digits inside RTL so "94.2%" stays "94.2%" visually
  for (let i = 1; i < line.length; i++) {
    if ((line[i] === '%' || line[i] === '°') && /[0-9]/.test(line[i - 1])) {
      levels[i] = levels[i - 1];
    }
  }

  // Group into atomic tokens:
  // - If level is even (LTR): keep contiguous same-level characters together (so "12/01/2027" or "Facilities Report" stays whole)
  // - If level is odd (RTL): break whenever character switches between Arabic word chars, whitespace, or individual punctuation/bracket
  const tokens: BidiToken[] = [];
  let i = 0;
  while (i < line.length) {
    const lvl = levels[i];
    const isRtl = lvl % 2 === 1;

    if (!isRtl) {
      let j = i + 1;
      while (j < line.length && levels[j] === lvl) j++;
      tokens.push({ text: line.slice(i, j), level: lvl, isRtl: false });
      i = j;
    } else {
      const ch = line[i];
      if (/\s/.test(ch)) {
        let j = i + 1;
        while (j < line.length && levels[j] === lvl && /\s/.test(line[j])) j++;
        tokens.push({ text: line.slice(i, j), level: lvl, isRtl: true });
        i = j;
      } else if (ARABIC_CHAR_RE.test(ch)) {
        // Keep full Arabic word together (including diacritics/marks) so HarfBuzz/Fontkit shapes ligatures cleanly!
        let j = i + 1;
        while (j < line.length && levels[j] === lvl && ARABIC_CHAR_RE.test(line[j])) j++;
        tokens.push({ text: line.slice(i, j), level: lvl, isRtl: true });
        i = j;
      } else {
        // Punctuation or mirrorable bracket in RTL
        const mirrored = MIRROR_CHARS[ch] ?? ch;
        tokens.push({ text: mirrored, level: lvl, isRtl: true });
        i++;
      }
    }
  }

  // UAX #9 Rule L2 on tokens: from highest level down to lowest odd level, reverse contiguous spans >= level
  const maxLvl = tokens.reduce((m, t) => Math.max(m, t.level), 0);
  const lowestOdd = baseDir === 'rtl' ? 1 : 1;
  for (let lvl = maxLvl; lvl >= lowestOdd; lvl--) {
    let idx = 0;
    while (idx < tokens.length) {
      if (tokens[idx].level >= lvl) {
        let end = idx + 1;
        while (end < tokens.length && tokens[end].level >= lvl) end++;
        const slice = tokens.slice(idx, end).reverse();
        tokens.splice(idx, end - idx, ...slice);
        idx = end;
      } else {
        idx++;
      }
    }
  }

  // Trim leading/trailing pure whitespace tokens only? No, UAX #9 trailing space moves to visual start on RTL; trim outer spaces for neat alignment
  return tokens;
}

export function measureBidiLineWidth(
  doc: PDFKit.PDFDocument,
  rawLine: string,
  fontSize: number,
  bold = false,
  dir: 'rtl' | 'ltr' | 'auto' = 'auto'
): number {
  const clean = normalizeTextForPdf(rawLine);
  if (!clean) return 0;
  const resolvedDir = dir === 'auto' ? (containsArabic(clean) ? 'rtl' : 'ltr') : dir;
  const tokens = reorderLogicalLineToVisualTokens(clean, resolvedDir);
  let w = 0;
  for (const tok of tokens) {
    w += measureChunkedWidth(doc, tok.text, fontSize, bold, !tok.isRtl);
  }
  return w;
}

/**
 * Wraps logical multi-paragraph text into lines fitting `maxWidth` cleanly
 * BEFORE visual BiDi reordering (UAX #9 compliant line wrapping).
 */
export function wrapBidiText(
  doc: PDFKit.PDFDocument,
  rawText: string,
  maxWidth: number,
  fontSize: number,
  bold = false
): string[] {
  const normalized = normalizeTextForPdf(rawText).trim();
  if (!normalized) return [''];

  const paragraphs = normalized.split(/\r?\n/);
  const result: string[] = [];

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) {
      result.push('');
      continue;
    }

    const dir: 'rtl' | 'ltr' = containsArabic(trimmed) ? 'rtl' : 'ltr';
    const words = trimmed.split(/\s+/);
    let currentLine = '';

    for (const word of words) {
      const candidate = currentLine ? `${currentLine} ${word}` : word;
      const candWidth = measureBidiLineWidth(doc, candidate, fontSize, bold, dir);

      if (candWidth <= maxWidth || !currentLine) {
        // Check if single ultra-long word exceeds maxWidth on empty line
        if (!currentLine && candWidth > maxWidth) {
          let chunk = '';
          for (const ch of word) {
            const next = chunk + ch;
            if (measureBidiLineWidth(doc, next, fontSize, bold, dir) > maxWidth && chunk) {
              result.push(chunk);
              chunk = ch;
            } else {
              chunk = next;
            }
          }
          currentLine = chunk;
        } else {
          currentLine = candidate;
        }
      } else {
        result.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) {
      result.push(currentLine);
    }
  }

  return result.length > 0 ? result : [''];
}

export interface DrawBidiOptions {
  fontSize?: number;
  bold?: boolean;
  color?: string;
  align?: 'left' | 'center' | 'right';
  dir?: 'rtl' | 'ltr' | 'auto';
  lineGap?: number;
  maxLines?: number;
  width?: number;
}

/**
 * Draws a single line of BiDi text cleanly inside box [x, x + width] at baseline/top y.
 */
export function drawBidiLine(
  doc: PDFKit.PDFDocument,
  rawLine: string,
  x: number,
  y: number,
  opts: DrawBidiOptions = {}
): number {
  const {
    fontSize = 10,
    bold = false,
    color = '#0B2341',
    dir = 'auto',
    width = 0,
  } = opts;

  const clean = normalizeTextForPdf(rawLine).trim();
  if (!clean) return y + fontSize * 1.35;

  const resolvedDir = dir === 'auto' ? (containsArabic(clean) ? 'rtl' : 'ltr') : dir;
  const align = opts.align ?? (resolvedDir === 'rtl' ? 'right' : 'left');

  const tokens = reorderLogicalLineToVisualTokens(clean, resolvedDir);
  const measuredSegments: Array<{ text: string; font: FontChunk['font']; width: number }> = [];
  let totalWidth = 0;

  doc.fontSize(fontSize);
  for (const tok of tokens) {
    const chunks = splitFontChunks(doc, tok.text, bold, !tok.isRtl);
    for (const c of chunks) {
      doc.font(c.font);
      const w = doc.widthOfString(c.text);
      measuredSegments.push({ text: c.text, font: c.font, width: w });
      totalWidth += w;
    }
  }

  let cursorX = x;
  if (width > 0) {
    if (align === 'right') {
      cursorX = x + width - totalWidth;
    } else if (align === 'center') {
      cursorX = x + (width - totalWidth) / 2;
    }
  } else if (align === 'right') {
    cursorX = x - totalWidth;
  } else if (align === 'center') {
    cursorX = x - totalWidth / 2;
  }

  doc.fillColor(color).fontSize(fontSize);
  // Align baselines cleanly across NotoSansArabic (asc=1374) & DejaVuSans (asc=928)
  // while keeping text vertically balanced inside tight table cells.
  const arY = y - fontSize * 0.28;
  const enY = arY + fontSize * 0.445;

  for (const seg of measuredSegments) {
    const segY = seg.font === 'EnRegular' || seg.font === 'EnBold' ? enY : arY;
    doc.font(seg.font).text(seg.text, cursorX, segY, {
      lineBreak: false,
      continued: false,
    });
    cursorX += seg.width;
  }

  return y + fontSize * 1.35;
}

/**
 * Wraps and draws multi-line Arabic/mixed text cleanly inside box [x, x + width].
 * Returns final Y coordinate after the last line.
 */
export function drawBidiParagraph(
  doc: PDFKit.PDFDocument,
  rawText: string,
  x: number,
  y: number,
  width: number,
  opts: DrawBidiOptions = {}
): number {
  const {
    fontSize = 9.5,
    bold = false,
    color = '#0B2341',
    lineGap = 3,
    maxLines,
  } = opts;

  const clean = normalizeTextForPdf(rawText);
  const resolvedDir = opts.dir && opts.dir !== 'auto' ? opts.dir : containsArabic(clean) ? 'rtl' : 'ltr';
  const align = opts.align ?? (resolvedDir === 'rtl' ? 'right' : 'left');

  let lines = wrapBidiText(doc, clean, Math.max(10, width), fontSize, bold);
  if (maxLines && lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    const last = lines[lines.length - 1];
    lines[lines.length - 1] = last.length > 3 ? `${last.slice(0, -1)}…` : `${last}…`;
  }

  const lineStep = fontSize * 1.32 + lineGap;
  let curY = y;
  for (const line of lines) {
    drawBidiLine(doc, line, x, curY, {
      fontSize,
      bold,
      color,
      align,
      dir: resolvedDir,
      width,
    });
    curY += lineStep;
  }
  return curY;
}

export function measureBidiParagraphHeight(
  doc: PDFKit.PDFDocument,
  rawText: string,
  width: number,
  fontSize = 9.5,
  bold = false,
  lineGap = 3
): number {
  const lines = wrapBidiText(doc, rawText, Math.max(10, width), fontSize, bold);
  const lineStep = fontSize * 1.32 + lineGap;
  return Math.max(lineStep, lines.length * lineStep);
}
