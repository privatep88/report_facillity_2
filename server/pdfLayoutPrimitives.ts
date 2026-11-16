import fs from 'node:fs';
import path from 'node:path';
import type PDFKit from 'pdfkit';
import {
  drawBidiLine,
  drawBidiParagraph,
  measureBidiParagraphHeight,
  registerCorporateFonts,
} from './pdfBiDi.ts';
import { formatNumber } from '../src/utils/calculations.ts';

export const PDF_COLORS = {
  navy: '#0B2341',
  navyDeep: '#022B58',
  blue: '#1769AA',
  blueLight: '#EAF4FC',
  blueBorder: '#A3C0DE',
  gold: '#C8A85D',
  goldLight: '#F0D38C',
  emerald: '#069B74',
  emeraldBg: '#ECFDF5',
  crimson: '#C43D47',
  crimsonBg: '#FEF2F2',
  amber: '#9A7422',
  amberBg: '#FFFBEB',
  slateBg: '#F4F7FB',
  slateText: '#475569',
  border: '#CBD5E1',
  white: '#FFFFFF',
} as const;

export interface PdfLayoutContext {
  doc: PDFKit.PDFDocument;
  pageWidth: number;
  pageHeight: number;
  marginX: number;
  contentTop: number;
  contentBottom: number;
  contentWidth: number;
  curY: number;
  orientation: 'landscape' | 'portrait';
}

export function createPdfLayoutContext(
  doc: PDFKit.PDFDocument,
  orientation: 'landscape' | 'portrait'
): PdfLayoutContext {
  registerCorporateFonts(doc);
  doc.addPage({ size: 'A4', layout: orientation, margin: 0 });
  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  const marginX = 24;
  const contentTop = 94;
  const contentBottom = pageHeight - 48;
  return {
    doc,
    pageWidth,
    pageHeight,
    marginX,
    contentTop,
    contentBottom,
    contentWidth: pageWidth - marginX * 2,
    curY: contentTop,
    orientation,
  };
}

export function newPdfPage(ctx: PdfLayoutContext): void {
  ctx.doc.addPage({ size: 'A4', layout: ctx.orientation, margin: 0 });
  ctx.curY = ctx.contentTop;
}

export function ensurePdfSpace(ctx: PdfLayoutContext, neededHeight: number): boolean {
  if (ctx.curY + neededHeight > ctx.contentBottom) {
    newPdfPage(ctx);
    return true;
  }
  return false;
}

export function drawSectionHeader(
  ctx: PdfLayoutContext,
  arTitle: string,
  enTitle: string,
  minFollowingHeight = 56
): void {
  ensurePdfSpace(ctx, 26 + minFollowingHeight);
  const { doc, marginX, contentWidth } = ctx;
  const y = ctx.curY;

  // Small right-side gold bar accent
  doc.rect(marginX + contentWidth - 4, y + 2, 4, 16).fill(PDF_COLORS.gold);

  drawBidiLine(doc, arTitle, marginX, y + 2, {
    fontSize: 11.5,
    bold: true,
    color: PDF_COLORS.navy,
    align: 'right',
    dir: 'rtl',
    width: contentWidth - 10,
  });

  if (enTitle) {
    drawBidiLine(doc, enTitle, marginX, y + 4, {
      fontSize: 8.5,
      bold: true,
      color: PDF_COLORS.blue,
      align: 'left',
      dir: 'ltr',
      width: contentWidth * 0.45,
    });
  }

  doc
    .moveTo(marginX, y + 21)
    .lineTo(marginX + contentWidth, y + 21)
    .lineWidth(1.2)
    .strokeColor(PDF_COLORS.gold)
    .stroke();

  ctx.curY = y + 27;
}

export interface PdfTableColumn {
  key: string;
  label: string;
  widthPct: number;
  align?: 'left' | 'center' | 'right';
  dir?: 'rtl' | 'ltr' | 'auto';
  bold?: boolean;
  color?: string;
}

export interface PdfTableRow {
  cells: Record<
    string,
    {
      text: string;
      color?: string;
      bold?: boolean;
      align?: 'left' | 'center' | 'right';
      dir?: 'rtl' | 'ltr' | 'auto';
      progressPct?: number;
      progressColor?: string;
    }
  >;
  fillColor?: string;
  isSummary?: boolean;
}

/**
 * Draws an RTL data table (columns arranged right-to-left) with:
 * - Automatic line wrapping for long Arabic notes/descriptions
 * - Automatic page breaking BEFORE any overflowing row
 * - Automatic `thead` repetition on continuation pages
 * - Optional native vector progress bar rendering inside cells
 */
export function drawRtlTable(
  ctx: PdfLayoutContext,
  columns: PdfTableColumn[],
  rows: PdfTableRow[],
  options: {
    fontSize?: number;
    headerFontSize?: number;
    cellPaddingX?: number;
    cellPaddingY?: number;
    minRowHeight?: number;
    headerFill?: string;
    zebraFill?: string;
    summaryRow?: PdfTableRow;
    startX?: number;
    tableWidth?: number;
  } = {}
): void {
  const {
    fontSize = 8.5,
    headerFontSize = 8.5,
    cellPaddingX = 5,
    cellPaddingY = 5,
    minRowHeight = 18,
    headerFill = PDF_COLORS.navy,
    zebraFill = PDF_COLORS.slateBg,
    summaryRow,
    startX = ctx.marginX,
    tableWidth = ctx.contentWidth,
  } = options;

  const { doc } = ctx;
  const totalPct = columns.reduce((s, c) => s + c.widthPct, 0) || 100;

  // Compute RTL visual X coordinates: first column sits at the RIGHTMOST edge
  const colRects: Array<{ col: PdfTableColumn; x: number; w: number }> = [];
  let rightCursor = startX + tableWidth;
  for (const col of columns) {
    const w = (col.widthPct / totalPct) * tableWidth;
    rightCursor -= w;
    colRects.push({ col, x: rightCursor, w });
  }

  // Compute header height dynamically so wrapped headers never clip
  let headerHeight = Math.max(16, minRowHeight);
  for (const { col, w } of colRects) {
    const h = measureBidiParagraphHeight(doc, col.label, Math.max(12, w - cellPaddingX * 2), headerFontSize, true, 1.5);
    headerHeight = Math.max(headerHeight, h + cellPaddingY * 1.6);
  }

  const drawHeader = () => {
    const y = ctx.curY;
    doc.rect(startX, y, tableWidth, headerHeight).fill(headerFill);
    doc
      .moveTo(startX, y + headerHeight)
      .lineTo(startX + tableWidth, y + headerHeight)
      .lineWidth(1.2)
      .strokeColor(PDF_COLORS.gold)
      .stroke();

    for (const { col, x, w } of colRects) {
      drawBidiParagraph(doc, col.label, x + cellPaddingX, y + cellPaddingY, w - cellPaddingX * 2, {
        fontSize: headerFontSize,
        bold: true,
        color: PDF_COLORS.white,
        align: col.align ?? 'center',
        dir: col.dir ?? 'auto',
        lineGap: 1.5,
      });
    }
    ctx.curY = y + headerHeight;
  };

  // Ensure header + at least first row fit cleanly before starting table
  ensurePdfSpace(ctx, headerHeight + minRowHeight + 6);
  drawHeader();

  const allRows = summaryRow ? [...rows, summaryRow] : rows;

  allRows.forEach((row, idx) => {
    let rowHeight = minRowHeight;
    for (const { col, w } of colRects) {
      const cell = row.cells[col.key];
      if (typeof cell?.progressPct === 'number') continue;
      const text = cell?.text ?? '—';
      const bold = cell?.bold ?? col.bold ?? row.isSummary ?? false;
      const h = measureBidiParagraphHeight(
        doc,
        text,
        Math.max(12, w - cellPaddingX * 2),
        fontSize,
        bold,
        1.5
      );
      rowHeight = Math.max(rowHeight, h + cellPaddingY * 1.6);
    }

    if (ctx.curY + rowHeight > ctx.contentBottom) {
      newPdfPage(ctx);
      drawHeader();
    }

    const y = ctx.curY;
    const bg = row.isSummary
      ? PDF_COLORS.blueLight
      : row.fillColor ?? (idx % 2 === 1 ? zebraFill : PDF_COLORS.white);

    doc.rect(startX, y, tableWidth, rowHeight).fill(bg);
    doc
      .rect(startX, y, tableWidth, rowHeight)
      .lineWidth(row.isSummary ? 0.9 : 0.45)
      .strokeColor(row.isSummary ? PDF_COLORS.blueBorder : PDF_COLORS.border)
      .stroke();

    // Vertical column dividers
    for (let i = 0; i < colRects.length - 1; i++) {
      const xEdge = colRects[i].x;
      doc
        .moveTo(xEdge, y)
        .lineTo(xEdge, y + rowHeight)
        .lineWidth(0.35)
        .strokeColor('#E2E8F0')
        .stroke();
    }

    for (const { col, x, w } of colRects) {
      const cell = row.cells[col.key];
      if (typeof cell?.progressPct === 'number') {
        const pct = Math.min(100, Math.max(0, cell.progressPct));
        const barW = Math.max(16, w - cellPaddingX * 2 - 4);
        const barH = 7;
        const barX = x + (w - barW) / 2;
        const barY = y + (rowHeight - barH) / 2;
        doc.roundedRect(barX, barY, barW, barH, 3).fill('#E2E8F0');
        if (pct > 0) {
          const fillW = Math.max(4, (pct / 100) * barW);
          // RTL fill from right edge of track
          doc
            .roundedRect(barX + barW - fillW, barY, fillW, barH, 3)
            .fill(cell.progressColor ?? PDF_COLORS.emerald);
        }
        continue;
      }

      const text = cell?.text ?? '—';
      const bold = cell?.bold ?? col.bold ?? row.isSummary ?? false;
      const color = cell?.color ?? col.color ?? PDF_COLORS.navy;
      const align = cell?.align ?? col.align ?? 'center';
      const dir = cell?.dir ?? col.dir ?? 'auto';

      drawBidiParagraph(doc, text, x + cellPaddingX, y + cellPaddingY, w - cellPaddingX * 2, {
        fontSize,
        bold,
        color,
        align,
        dir,
        lineGap: 1.5,
      });
    }

    ctx.curY = y + rowHeight;
  });

  ctx.curY += 10;
}

export interface PageChromeInfo {
  titleAr: string;
  titleEn: string;
  subtitleAr: string;
  metaRightAr: string;
  metaLeftAr: string;
  isDraftWatermark: boolean;
  draftBannerAr?: string;
}

function resolveAsset(filename: string): string | null {
  const p = path.join(process.cwd(), 'src', 'assets', 'images', filename);
  return fs.existsSync(p) ? p : null;
}

/**
 * Stamps official SAAED Corporate Header (building image + gold ribbons + logo + typography),
 * clean metadata bar (with draft warning if not approved/archived), and official footer
 * with designer attribution + exact `الصفحة X من Y` across EVERY page in the buffer.
 */
export function stampExecutiveHeaderAndFooterOnAllPages(
  doc: PDFKit.PDFDocument,
  info: PageChromeInfo
): void {
  const headerBgPath = resolveAsset('saaed_header_visual_bg.png');
  const logoMarkPath = resolveAsset('saaed_logo_mark.png');
  const footerBgPath = resolveAsset('saaed_footer_visual_bg.png');

  const range = doc.bufferedPageRange();
  const totalPages = range.count;

  for (let i = 0; i < totalPages; i++) {
    doc.switchToPage(range.start + i);
    const pw = doc.page.width;
    const ph = doc.page.height;

    // 1. HEADER BAND (y: 0 .. 64)
    const hdrH = 64;
    doc.save();
    doc.rect(0, 0, pw, hdrH).fill(PDF_COLORS.navyDeep);

    // Left Building & UAE Flag Backdrop Image
    if (headerBgPath) {
      doc.save();
      doc.rect(0, 0, Math.min(240, pw * 0.31), hdrH).clip();
      doc.image(headerBgPath, 0, 0, { height: hdrH });
      doc.restore();
    }

    // Gold Diagonal Ribbon separating left photo & navy center
    const ribLeftX = Math.min(238, pw * 0.31);
    doc
      .polygon([ribLeftX, 0], [ribLeftX + 12, 0], [ribLeftX - 38, hdrH], [ribLeftX - 50, hdrH])
      .fill(PDF_COLORS.gold);

    // Pure White Right Wing for Official SAAED Logo
    const brandStartX = pw - 165;
    doc
      .polygon([brandStartX + 26, 0], [pw, 0], [pw, hdrH], [brandStartX - 24, hdrH])
      .fill(PDF_COLORS.white);
    doc
      .polygon([brandStartX + 14, 0], [brandStartX + 26, 0], [brandStartX - 24, hdrH], [brandStartX - 36, hdrH])
      .fill(PDF_COLORS.gold);

    if (logoMarkPath) {
      doc.image(logoMarkPath, pw - 125, 7, { fit: [105, 32], align: 'center', valign: 'center' });
    }
    drawBidiLine(doc, 'ساعد للأنظمة المرورية', pw - 140, 42, {
      fontSize: 7.5,
      bold: true,
      color: PDF_COLORS.navy,
      align: 'center',
      dir: 'rtl',
      width: 130,
    });
    drawBidiLine(doc, 'SAAED Traffic Systems', pw - 140, 52, {
      fontSize: 6.5,
      bold: true,
      color: '#475569',
      align: 'center',
      dir: 'ltr',
      width: 130,
    });

    // Center Title Typography
    const centerX = ribLeftX + 16;
    const centerW = brandStartX - 24 - centerX;
    drawBidiLine(doc, info.titleAr, centerX, 11, {
      fontSize: 14,
      bold: true,
      color: PDF_COLORS.white,
      align: 'center',
      dir: 'rtl',
      width: centerW,
    });
    drawBidiLine(doc, info.titleEn, centerX, 30, {
      fontSize: 8.5,
      bold: true,
      color: PDF_COLORS.goldLight,
      align: 'center',
      dir: 'ltr',
      width: centerW,
    });
    drawBidiLine(doc, info.subtitleAr, centerX, 45, {
      fontSize: 7.5,
      bold: false,
      color: '#E2E8F0',
      align: 'center',
      dir: 'rtl',
      width: centerW,
    });

    // Bottom crisp gold hairline on header
    doc.rect(0, hdrH, pw, 2).fill(PDF_COLORS.gold);

    // 2. METADATA STRIP (y: 66 .. 86)
    const stripBg = info.isDraftWatermark ? '#FFFBEB' : PDF_COLORS.slateBg;
    doc.rect(0, hdrH + 2, pw, 20).fill(stripBg);
    doc
      .moveTo(0, hdrH + 22)
      .lineTo(pw, hdrH + 22)
      .lineWidth(0.75)
      .strokeColor(info.isDraftWatermark ? '#F59E0B' : PDF_COLORS.border)
      .stroke();

    drawBidiLine(doc, info.metaRightAr, 24, hdrH + 7, {
      fontSize: 7.8,
      bold: true,
      color: PDF_COLORS.navy,
      align: 'right',
      dir: 'rtl',
      width: pw * 0.55,
    });
    drawBidiLine(doc, info.metaLeftAr, 24, hdrH + 7, {
      fontSize: 7.8,
      bold: info.isDraftWatermark,
      color: info.isDraftWatermark ? PDF_COLORS.crimson : PDF_COLORS.slateText,
      align: 'left',
      dir: 'rtl',
      width: pw * 0.42,
    });

    // Subtle non-intrusive diagonal draft watermark if draft/unapproved
    if (info.isDraftWatermark && info.draftBannerAr) {
      doc.save();
      doc.fillColor('#C43D47').fillOpacity(0.05);
      doc.translate(pw / 2, ph / 2);
      doc.rotate(-22);
      drawBidiLine(doc, info.draftBannerAr, -220, -14, {
        fontSize: 34,
        bold: true,
        color: '#C43D47',
        align: 'center',
        dir: 'rtl',
        width: 440,
      });
      doc.restore();
    }

    // 3. FOOTER BAND (y: ph - 38 .. ph)
    const footH = 38;
    const footY = ph - footH;
    doc.rect(0, footY, pw, footH).fill('#062D58');
    doc.rect(0, footY, pw, 1.8).fill(PDF_COLORS.gold);

    if (footerBgPath) {
      doc.save();
      doc.rect(0, footY + 1.8, 130, footH - 1.8).clip();
      doc.image(footerBgPath, 0, footY + 1.8, { height: footH - 1.8 });
      doc.restore();
    }

    // Center Department Info
    drawBidiLine(doc, 'إدارة الخدمات العامة | قسم إدارة المرافق', pw * 0.28, footY + 9, {
      fontSize: 8,
      bold: true,
      color: PDF_COLORS.white,
      align: 'center',
      dir: 'rtl',
      width: pw * 0.36,
    });
    drawBidiLine(doc, 'General Services Department | Facilities Management', pw * 0.28, footY + 21, {
      fontSize: 7,
      bold: false,
      color: '#CBD5E1',
      align: 'center',
      dir: 'ltr',
      width: pw * 0.36,
    });

    // Right Designer Credit (Exact required credit!)
    drawBidiLine(doc, 'إعداد وتصميم: خالد الهاشمي', pw - 225, footY + 9, {
      fontSize: 8,
      bold: true,
      color: PDF_COLORS.white,
      align: 'right',
      dir: 'rtl',
      width: 200,
    });
    drawBidiLine(doc, 'Prepared & Designed by Khaled Al Hashemi', pw - 225, footY + 21, {
      fontSize: 6.8,
      bold: false,
      color: '#CBD5E1',
      align: 'right',
      dir: 'ltr',
      width: 200,
    });

    // Left-of-center Page X of Y Badge
    const pageLabel = `الصفحة ${formatNumber(i + 1)} من ${formatNumber(totalPages)}`;
    doc
      .roundedRect(138, footY + 10, 96, 18, 4)
      .fill('#021F40')
      .lineWidth(0.75)
      .strokeColor(PDF_COLORS.gold)
      .stroke();
    drawBidiLine(doc, pageLabel, 138, footY + 14.5, {
      fontSize: 8,
      bold: true,
      color: PDF_COLORS.goldLight,
      align: 'center',
      dir: 'rtl',
      width: 96,
    });

    doc.restore();
  }
}
