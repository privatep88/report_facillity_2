import type ExcelJS from 'exceljs';
import { api } from '../api/client.ts';
import {
  DEFAULT_THRESHOLDS,
  STATUS_LABELS_AR,
  STATUS_LABELS_EN,
  TASK_STATUS_LABELS_AR,
  type MaintenanceCategory,
  type MaintenanceSite,
  type MonthlyReportFull,
  type PerformanceThresholds,
} from '../types/report.ts';
import {
  computeReportMetrics,
  formatAed,
  formatDateTimeWestern,
  formatDateWestern,
  formatNumber,
  formatPct,
  getMonthNameAr,
  getMonthNameEn,
  syncReceptionServiceWithSecurity,
} from '../utils/calculations.ts';
import {
  computeAnalyticsEngine,
  DEFAULT_ANALYTICS_FILTERS,
  type AnalyticsEngineOutput,
  type AnalyticsFilters,
} from './AnalyticsEngineService.ts';
import type { DirectReportSnapshotData } from './DirectReportPdfExportService.ts';
import {
  loadAnalyticsExcelVisualAssets,
  loadReportExcelVisualAssets,
  type LoadedExcelImage,
} from './excel/ExcelAssetLoader.ts';
import {
  renderLogisticsChannelsChartPng,
  renderMaintenanceComparisonChartPng,
  renderMaintenanceSourcesDonutChartPng,
  renderPerformanceDonutChartPng,
} from './excel/ExcelChartRenderer.ts';

export interface DirectExcelExportResult {
  filename: string;
  sizeBytes: number;
  sheetCount: number;
  embeddedMediaCount: number;
}

const C_NAVY = 'FF012E5E';
const C_DARK_NAVY = 'FF021F40';
const C_BLUE = 'FF0C4176';
const C_ACCENT_BLUE = 'FF1769AA';
const C_SKY_SOFT = 'FFEAF4FC';
const C_SKY_HEAD = 'FFDCE9F6';
const C_SLATE_ALT = 'FFF4F8FC';
const C_GOLD = 'FFC99E4A';
const C_GOLD_LIGHT = 'FFDFC076';
const C_GOLD_SOFT = 'FFFDF8EC';
const C_EMERALD = 'FF069B74';
const C_EMERALD_SOFT = 'FFEFFBF6';
const C_CRIMSON = 'FFC43D47';
const C_CRIMSON_SOFT = 'FFFFF1F2';
const C_AMBER = 'FF9A6700';
const C_AMBER_SOFT = 'FFFFFBEB';
const C_WHITE = 'FFFFFFFF';
const C_BORDER = 'FFC5D8EE';
const C_BORDER_GOLD = 'FFE2C88B';
const C_TEXT_MUTED = 'FF475569';

const FONT_NAME = 'Cairo';

function deepClone<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function sanitizeFilename(raw: string, fallback: string): string {
  const cleaned = raw.replace(/[<>:"/\\|?*\u0000-\u001F]+/g, '_').trim();
  return cleaned || fallback;
}

function colLetter(colIdx1Based: number): string {
  let n = colIdx1Based;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function thinBorder(color = C_BORDER): Partial<ExcelJS.Borders> {
  return {
    top: { style: 'thin', color: { argb: color } },
    left: { style: 'thin', color: { argb: color } },
    bottom: { style: 'thin', color: { argb: color } },
    right: { style: 'thin', color: { argb: color } },
  };
}

function mediumGoldBoxBorder(color = C_GOLD): Partial<ExcelJS.Borders> {
  return {
    top: { style: 'medium', color: { argb: color } },
    left: { style: 'medium', color: { argb: color } },
    bottom: { style: 'medium', color: { argb: color } },
    right: { style: 'medium', color: { argb: color } },
  };
}

function styleRange(
  ws: ExcelJS.Worksheet,
  row: number,
  colStart: number,
  colEnd: number,
  opts: {
    fill?: string;
    font?: Partial<ExcelJS.Font>;
    alignment?: Partial<ExcelJS.Alignment>;
    border?: Partial<ExcelJS.Borders>;
    numFmt?: string;
  }
) {
  for (let c = colStart; c <= colEnd; c++) {
    const cell = ws.getCell(row, c);
    if (opts.fill) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opts.fill } };
    }
    if (opts.font) {
      cell.font = { name: FONT_NAME, ...opts.font };
    }
    if (opts.alignment) {
      cell.alignment = opts.alignment;
    }
    if (opts.border) {
      cell.border = opts.border;
    }
    if (opts.numFmt) {
      cell.numFmt = opts.numFmt;
    }
  }
}

function mergeAndSet(
  ws: ExcelJS.Worksheet,
  r1: number,
  c1: number,
  r2: number,
  c2: number,
  value: ExcelJS.CellValue,
  opts?: {
    fill?: string;
    font?: Partial<ExcelJS.Font>;
    alignment?: Partial<ExcelJS.Alignment>;
    border?: Partial<ExcelJS.Borders>;
    numFmt?: string;
  }
) {
  if (r1 !== r2 || c1 !== c2) {
    ws.mergeCells(r1, c1, r2, c2);
  }
  const master = ws.getCell(r1, c1);
  master.value = value;
  if (opts) {
    for (let r = r1; r <= r2; r++) {
      styleRange(ws, r, c1, c2, opts);
    }
  }
  return master;
}

function estimateWrappedRowHeight(
  texts: Array<{ text: string; widthChars: number; fontSize?: number }>,
  minHeight = 22,
  extraPad = 10
): number {
  let maxLines = 1;
  for (const item of texts) {
    const str = String(item.text || '').trim();
    if (!str) continue;
    const effectiveCharsPerLine = Math.max(8, Math.floor((item.widthChars - 2) * (10 / (item.fontSize || 10)) * 0.88));
    const paragraphs = str.split(/\r?\n/);
    let lines = 0;
    for (const p of paragraphs) {
      lines += Math.max(1, Math.ceil(p.length / effectiveCharsPerLine));
    }
    maxLines = Math.max(maxLines, lines);
  }
  return Math.max(minHeight, maxLines * 15.5 + extraPad);
}

/**
 * Places an image neatly centered and aspect-preserved inside [colStart..colEnd] x [rowStart..rowEnd] (1-based).
 */
function placeImageInBox(
  wb: ExcelJS.Workbook,
  ws: ExcelJS.Worksheet,
  colWidths: number[],
  rowHeights: Map<number, number>,
  img: LoadedExcelImage | null,
  box: {
    colStart: number;
    colEnd: number;
    rowStart: number;
    rowEnd: number;
    paddingPx?: number;
    fillBox?: boolean;
  }
): number | null {
  if (!img) return null;
  const pad = box.paddingPx ?? 4;

  let boxWpx = 0;
  for (let c = box.colStart; c <= box.colEnd; c++) {
    boxWpx += (colWidths[c - 1] ?? 13) * 7.45;
  }
  let boxHpx = 0;
  for (let r = box.rowStart; r <= box.rowEnd; r++) {
    boxHpx += (rowHeights.get(r) ?? 20) * 1.3333;
  }

  const availW = Math.max(18, boxWpx - pad * 2);
  const availH = Math.max(18, boxHpx - pad * 2);

  let targetW: number;
  let targetH: number;
  if (box.fillBox) {
    targetW = availW;
    targetH = availH;
  } else {
    const scale = Math.min(availW / Math.max(1, img.width), availH / Math.max(1, img.height));
    targetW = Math.max(16, Math.round(img.width * scale));
    targetH = Math.max(16, Math.round(img.height * scale));
  }

  // Center inside the box using fractional cell offsets
  const offsetXpx = Math.max(1, (boxWpx - targetW) / 2);
  const offsetYpx = Math.max(1, (boxHpx - targetH) / 2);

  // Convert offsetXpx into col + fraction
  let accW = 0;
  let tlCol = box.colStart - 1;
  for (let c = box.colStart; c <= box.colEnd; c++) {
    const cWpx = (colWidths[c - 1] ?? 13) * 7.45;
    if (accW + cWpx > offsetXpx) {
      tlCol = c - 1 + (offsetXpx - accW) / Math.max(1, cWpx);
      break;
    }
    accW += cWpx;
  }

  let accH = 0;
  let tlRow = box.rowStart - 1;
  for (let r = box.rowStart; r <= box.rowEnd; r++) {
    const rHpx = (rowHeights.get(r) ?? 20) * 1.3333;
    if (accH + rHpx > offsetYpx) {
      tlRow = r - 1 + (offsetYpx - accH) / Math.max(1, rHpx);
      break;
    }
    accH += rHpx;
  }

  const imageId = wb.addImage({
    base64: img.base64,
    extension: img.extension,
  });

  ws.addImage(imageId, {
    tl: { col: tlCol, row: tlRow },
    ext: { width: targetW, height: targetH },
    editAs: 'oneCell',
  });

  return imageId;
}

/**
 * Inspects generated OOXML ZIP buffer to guarantee:
 * - Valid PK ZIP signature
 * - Presence of xl/workbook.xml, xl/styles.xml, worksheets, drawings & real embedded media files
 */
function inspectGeneratedXlsxStructure(bytes: Uint8Array, minSheets: number): {
  entries: string[];
  mediaCount: number;
  sheetCount: number;
} {
  if (!bytes || bytes.byteLength < 8192) {
    throw new Error('ملف Excel الناتج صغير جداً أو غير مكتمل.');
  }
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    throw new Error('صيغة ملف Excel الناتج لا تطابق معيار OOXML (.xlsx).');
  }

  // Locate ZIP End of Central Directory (0x06054b50)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocdOffset = -1;
  for (let i = bytes.byteLength - 22; i >= Math.max(0, bytes.byteLength - 65558); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) {
    throw new Error('فشل التحقق من بنية حزمة OOXML الداخلية لملف Excel.');
  }

  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const cdOffset = view.getUint32(eocdOffset + 16, true);
  const decoder = new TextDecoder('utf-8');
  const entries: string[] = [];

  let ptr = cdOffset;
  for (let i = 0; i < totalEntries && ptr + 46 <= bytes.byteLength; i++) {
    if (view.getUint32(ptr, true) !== 0x02014b50) break;
    const nameLen = view.getUint16(ptr + 28, true);
    const extraLen = view.getUint16(ptr + 30, true);
    const commentLen = view.getUint16(ptr + 32, true);
    const name = decoder.decode(bytes.subarray(ptr + 46, ptr + 46 + nameLen));
    entries.push(name);
    ptr += 46 + nameLen + extraLen + commentLen;
  }

  const hasWorkbook = entries.includes('xl/workbook.xml');
  const hasStyles = entries.includes('xl/styles.xml');
  const mediaCount = entries.filter((e) => e.startsWith('xl/media/')).length;
  const sheetCount = entries.filter((e) => /^xl\/worksheets\/sheet\d+\.xml$/.test(e)).length;

  if (!hasWorkbook || !hasStyles || sheetCount < minSheets || mediaCount === 0) {
    throw new Error(
      `فشل الفحص البنيوي لملف Excel (sheets=${sheetCount}, media=${mediaCount}).`
    );
  }

  return { entries, mediaCount, sheetCount };
}

function triggerXlsxDownload(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, 30000);
}

async function resolveReportBundle(params: {
  reportId: string;
  versionNumber?: number | null;
  liveData?: DirectReportSnapshotData;
}): Promise<DirectReportSnapshotData> {
  const { reportId, versionNumber, liveData } = params;

  if (
    liveData &&
    liveData.report.id === reportId &&
    (versionNumber == null || (liveData.snapshotVersion ?? null) === versionNumber)
  ) {
    return deepClone(liveData);
  }

  if (versionNumber != null) {
    try {
      const snapRes = await api.getReportVersionSnapshot(reportId, versionNumber);
      return deepClone({
        report: snapRes.snapshot.report,
        sites: snapRes.snapshot.sites,
        categories: snapRes.snapshot.categories,
        thresholds: snapRes.snapshot.thresholds,
        snapshotVersion: versionNumber,
      });
    } catch {
      // Fallback below
    }
  }

  const [reportRes, bootstrapRes] = await Promise.all([
    api.getReport(reportId),
    liveData?.sites?.length && liveData?.categories?.length
      ? Promise.resolve(null)
      : api.bootstrap(),
  ]);

  return deepClone({
    report: reportRes.report,
    sites: bootstrapRes ? bootstrapRes.sites : liveData?.sites || [],
    categories: bootstrapRes ? bootstrapRes.categories : liveData?.categories || [],
    thresholds: bootstrapRes
      ? bootstrapRes.thresholds
      : liveData?.thresholds || DEFAULT_THRESHOLDS,
    snapshotVersion: versionNumber ?? null,
  });
}

function addCorporateSectionBanner(
  ws: ExcelJS.Worksheet,
  rowHeights: Map<number, number>,
  row: number,
  totalCols: number,
  titleAr: string,
  titleEn: string
) {
  const setH = (r: number, h: number) => {
    ws.getRow(r).height = h;
    rowHeights.set(r, h);
  };
  setH(row, 25);
  if (totalCols <= 2) {
    mergeAndSet(ws, row, 1, row, Math.max(1, totalCols), `${titleAr} | ${titleEn.toUpperCase()}`, {
      fill: C_NAVY,
      font: { size: 11, bold: true, color: { argb: C_WHITE } },
      alignment: { horizontal: 'right', vertical: 'middle', indent: 1 },
      border: { bottom: { style: 'medium', color: { argb: C_GOLD } } },
    });
    return;
  }
  const splitCol = Math.min(totalCols - 1, Math.max(2, Math.ceil(totalCols * 0.6)));
  mergeAndSet(ws, row, 1, row, splitCol, titleAr, {
    fill: C_NAVY,
    font: { size: 11.5, bold: true, color: { argb: C_WHITE } },
    alignment: { horizontal: 'right', vertical: 'middle', indent: 1 },
    border: { bottom: { style: 'medium', color: { argb: C_GOLD } } },
  });
  mergeAndSet(ws, row, splitCol + 1, row, totalCols, titleEn.toUpperCase(), {
    fill: C_BLUE,
    font: { size: 9.5, bold: true, color: { argb: C_GOLD_LIGHT } },
    alignment: { horizontal: 'left', vertical: 'middle', indent: 1 },
    border: { bottom: { style: 'medium', color: { argb: C_GOLD } } },
  });
}

function buildPerformanceLevelFormula(pctCellRef: string, thresholds: PerformanceThresholds): string {
  const ex = thresholds.excellentMin / 100;
  const vg = thresholds.veryGoodMin / 100;
  const gd = thresholds.goodMin / 100;
  const ni = thresholds.needsImprovementMin / 100;
  return `IF(${pctCellRef}="—","—",IF(${pctCellRef}>=${ex},"ممتاز",IF(${pctCellRef}>=${vg},"جيد جداً",IF(${pctCellRef}>=${gd},"جيد",IF(${pctCellRef}>=${ni},"يحتاج تحسين","منخفض / حرج")))))`;
}

/**
 * Full-Fidelity 12-Section + Analytical Sheet Corporate Excel Export
 * Matches OfficialReportLayout 100% with real editable cells, Excel formulas,
 * embedded PNG/JPEG visuals, high-res rendered Chart PNGs, RTL layout, and A4 print setup.
 */
export async function exportReportDirectExcel(params: {
  reportId: string;
  versionNumber?: number | null;
  liveData?: DirectReportSnapshotData;
}): Promise<DirectExcelExportResult> {
  const { reportId, versionNumber, liveData } = params;
  const ExcelJSImport = await import('exceljs');
  const ExcelJS = ExcelJSImport.default || ExcelJSImport;

  const bundle = await resolveReportBundle({ reportId, versionNumber, liveData });
  const rawReport = bundle.report;
  const report = syncReceptionServiceWithSecurity(rawReport);
  const sites = bundle.sites;
  const categories = bundle.categories;
  const thresholds = bundle.thresholds || DEFAULT_THRESHOLDS;
  const verNumber = bundle.snapshotVersion || report.currentVersion;
  const isApprovedOrArchived = report.status === 'approved' || report.status === 'archived';

  const metrics = computeReportMetrics(report, sites, categories, thresholds);

  // Ordered lists matching OfficialReportLayout
  const sortedSummary = [...metrics.servicesWithMetrics].sort((a, b) => {
    const sa = report.services.find((x) => x.serviceId === a.serviceId)?.summaryOrder ?? 99;
    const sb = report.services.find((x) => x.serviceId === b.serviceId)?.summaryOrder ?? 99;
    return sa - sb;
  });
  const sortedRequestsByService = [...metrics.servicesWithMetrics].sort(
    (a, b) => b.receivedCount - a.receivedCount
  );

  // Preload all corporate photos, signatures & render 4 crisp high-DPI charts in parallel
  const [
    assets,
    perfDonutImg,
    maintBarImg,
    maintSourcesDonutImg,
    logisticsBarImg,
  ] = await Promise.all([
    loadReportExcelVisualAssets({
      topService: metrics.topService,
      preparerSignatureImage: report.preparerSignatureImage,
      approverSignatureImage: report.approverSignatureImage,
    }),
    renderPerformanceDonutChartPng(metrics),
    renderMaintenanceComparisonChartPng({
      sites,
      categories,
      siteTotals: metrics.maintenance.siteTotals,
      grandTotalFaults: metrics.maintenance.grandTotalFaults,
    }),
    renderMaintenanceSourcesDonutChartPng({
      fromFM: report.maintenanceServices.fromFacilitiesDept || 0,
      fromOther: report.maintenanceServices.fromOtherDepts || 0,
    }),
    renderLogisticsChannelsChartPng(report.logistics),
  ]);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'SAAED Facilities Management Executive Reporting System';
  wb.lastModifiedBy = report.preparerName || 'Facilities Management';
  wb.created = new Date();
  wb.modified = new Date();

  const TOTAL_COLS = Math.max(14, categories.length + 2);
  const colWidths: number[] = [22];
  for (let i = 2; i < TOTAL_COLS; i++) {
    colWidths.push(13.5);
  }
  colWidths.push(16);

  // ===========================================================================
  // SHEET 1: التقرير الشهري (Master Executive Print-Ready 12-Section Report)
  // ===========================================================================
  const ws = wb.addWorksheet('التقرير الشهري', {
    views: [{ rightToLeft: true, showGridLines: false }],
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      margins: { left: 0.25, right: 0.25, top: 0.3, bottom: 0.4, header: 0.15, footer: 0.2 },
    },
  });
  colWidths.forEach((w, idx) => {
    ws.getColumn(idx + 1).width = w;
  });

  const rowHeights = new Map<number, number>();
  const setRowH = (r: number, h: number) => {
    ws.getRow(r).height = h;
    rowHeights.set(r, h);
  };

  let rowIdx = 1;

  // ---------------------------------------------------------------------------
  // 0. CORPORATE HEADER BANNER (Building + UAE Flag + Gold Ribbons + Logo + Titles)
  // ---------------------------------------------------------------------------
  setRowH(rowIdx, 6);
  styleRange(ws, rowIdx, 1, TOTAL_COLS, { fill: C_GOLD });
  rowIdx++;

  const headerStartRow = rowIdx;
  setRowH(rowIdx, 28);
  setRowH(rowIdx + 1, 22);
  setRowH(rowIdx + 2, 22);

  // Visual Right Wing (Cols 1..2): White brand zone + SAAED Logo
  for (let r = headerStartRow; r <= headerStartRow + 2; r++) {
    styleRange(ws, r, 1, 2, { fill: C_WHITE });
    styleRange(ws, r, 3, TOTAL_COLS, { fill: C_NAVY });
  }
  mergeAndSet(ws, headerStartRow, 1, headerStartRow + 1, 2, '', {
    fill: C_WHITE,
    border: { left: { style: 'medium', color: { argb: C_GOLD } } },
  });
  mergeAndSet(
    ws,
    headerStartRow + 2,
    1,
    headerStartRow + 2,
    2,
    'ساعد للأنظمة المرورية | SAAED Traffic Systems',
    {
      fill: C_WHITE,
      font: { size: 7.5, bold: true, color: { argb: C_NAVY } },
      alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
      border: { left: { style: 'medium', color: { argb: C_GOLD } } },
    }
  );
  placeImageInBox(wb, ws, colWidths, rowHeights, assets.logo, {
    colStart: 1,
    colEnd: 2,
    rowStart: headerStartRow,
    rowEnd: headerStartRow + 1,
    paddingPx: 4,
  });

  // Visual Center (Cols 3 .. TOTAL_COLS - 3): Real Selectable Titles
  const titleEndCol = TOTAL_COLS - 3;
  mergeAndSet(
    ws,
    headerStartRow,
    3,
    headerStartRow,
    titleEndCol,
    'التقرير الشهري لقسم إدارة المرافق',
    {
      fill: C_NAVY,
      font: { size: 16, bold: true, color: { argb: C_WHITE } },
      alignment: { horizontal: 'center', vertical: 'middle' },
    }
  );
  mergeAndSet(
    ws,
    headerStartRow + 1,
    3,
    headerStartRow + 1,
    titleEndCol,
    'Facilities Management Monthly Executive Report',
    {
      fill: C_NAVY,
      font: { size: 11, bold: true, color: { argb: C_GOLD_LIGHT } },
      alignment: { horizontal: 'center', vertical: 'middle' },
    }
  );
  mergeAndSet(
    ws,
    headerStartRow + 2,
    3,
    headerStartRow + 2,
    titleEndCol,
    'إدارة الخدمات العامة  |  General Services Department',
    {
      fill: C_NAVY,
      font: { size: 9.5, bold: true, color: { argb: C_WHITE } },
      alignment: { horizontal: 'center', vertical: 'middle' },
    }
  );

  // Visual Left Wing (Cols TOTAL_COLS - 2 .. TOTAL_COLS): Corporate Building + UAE Flag Photo
  mergeAndSet(ws, headerStartRow, titleEndCol + 1, headerStartRow + 2, TOTAL_COLS, '', {
    fill: C_NAVY,
  });
  placeImageInBox(wb, ws, colWidths, rowHeights, assets.headerBg, {
    colStart: titleEndCol + 1,
    colEnd: TOTAL_COLS,
    rowStart: headerStartRow,
    rowEnd: headerStartRow + 2,
    paddingPx: 2,
    fillBox: true,
  });
  rowIdx += 3;

  // Bottom gold line of header
  setRowH(rowIdx, 5);
  styleRange(ws, rowIdx, 1, TOTAL_COLS, { fill: C_GOLD });
  rowIdx++;

  // Metadata Strip Row
  setRowH(rowIdx, 22);
  const periodStr = `شهر ${getMonthNameAr(report.month)} ${report.year} (${getMonthNameEn(report.month)} ${report.year})`;
  mergeAndSet(ws, rowIdx, 1, rowIdx, 3, `${report.company} · ${report.department}`, {
    fill: C_SLATE_ALT,
    font: { size: 9.5, bold: true, color: { argb: C_NAVY } },
    alignment: { horizontal: 'right', vertical: 'middle', wrapText: true },
    border: thinBorder(),
  });
  mergeAndSet(ws, rowIdx, 4, rowIdx, 6, `الفترة: ${periodStr}`, {
    fill: C_SLATE_ALT,
    font: { size: 9.5, bold: true, color: { argb: C_ACCENT_BLUE } },
    alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
    border: thinBorder(),
  });
  mergeAndSet(ws, rowIdx, 7, rowIdx, 8, `التصنيف: ${report.classification}`, {
    fill: C_SLATE_ALT,
    font: { size: 9.5, bold: true, color: { argb: C_TEXT_MUTED } },
    alignment: { horizontal: 'center', vertical: 'middle' },
    border: thinBorder(),
  });
  mergeAndSet(ws, rowIdx, 9, rowIdx, 10, `رقم التقرير: ${report.reportNumber}`, {
    fill: C_SLATE_ALT,
    font: { size: 9.5, bold: true, color: { argb: C_NAVY } },
    alignment: { horizontal: 'center', vertical: 'middle' },
    border: thinBorder(),
  });
  mergeAndSet(
    ws,
    rowIdx,
    11,
    rowIdx,
    12,
    `الحالة: ${STATUS_LABELS_AR[report.status]} (${STATUS_LABELS_EN[report.status]})`,
    {
      fill: isApprovedOrArchived ? C_EMERALD_SOFT : C_AMBER_SOFT,
      font: { size: 9.5, bold: true, color: { argb: isApprovedOrArchived ? C_EMERALD : C_AMBER } },
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: thinBorder(),
    }
  );
  mergeAndSet(ws, rowIdx, 13, rowIdx, TOTAL_COLS, `الإصدار المعتمد: v${verNumber}`, {
    fill: C_NAVY,
    font: { size: 9.5, bold: true, color: { argb: C_GOLD_LIGHT } },
    alignment: { horizontal: 'center', vertical: 'middle' },
    border: thinBorder(),
  });
  rowIdx++;

  if (!isApprovedOrArchived) {
    setRowH(rowIdx, 20);
    mergeAndSet(
      ws,
      rowIdx,
      1,
      rowIdx,
      TOTAL_COLS,
      `تنبيه رسمي: هذه النسخة (${STATUS_LABELS_AR[report.status]}) قيد الإعداد/المراجعة ولم تُعتمد نهائياً بعد`,
      {
        fill: C_AMBER_SOFT,
        font: { size: 9.5, bold: true, color: { argb: C_AMBER } },
        alignment: { horizontal: 'center', vertical: 'middle' },
        border: thinBorder(C_GOLD),
      }
    );
    rowIdx++;
  }

  setRowH(rowIdx, 8);
  rowIdx++;

  // ===========================================================================
  // 1. الملخص التنفيذي · Executive Summary (Reserve KPI rows; fill formulas after Sec 3)
  // ===========================================================================
  addCorporateSectionBanner(ws, rowHeights, rowIdx++, TOTAL_COLS, '1. الملخص التنفيذي', 'Executive Summary');

  const kpiPhotoRow = rowIdx;
  setRowH(kpiPhotoRow, 46);
  const kpiValRow = rowIdx + 1;
  setRowH(kpiValRow, 28);
  const kpiLabelArRow = rowIdx + 2;
  setRowH(kpiLabelArRow, 19);
  const kpiLabelEnRow = rowIdx + 3;
  setRowH(kpiLabelEnRow, 17);

  const kpiCardSpans: Array<{
    c1: number;
    c2: number;
    photo: LoadedExcelImage | null;
    fill: string;
    valColor: string;
    border: string;
    labelAr: string;
    labelEn: string;
  }> = [
    {
      c1: 1,
      c2: 3,
      photo: assets.kpiTotalRequests,
      fill: C_SKY_SOFT,
      valColor: C_NAVY,
      border: C_BORDER,
      labelAr: 'إجمالي الطلبات',
      labelEn: 'Total Requests',
    },
    {
      c1: 4,
      c2: 6,
      photo: assets.kpiTopService,
      fill: C_GOLD_SOFT,
      valColor: C_NAVY,
      border: C_BORDER_GOLD,
      labelAr: 'أعلى خدمة طلباً',
      labelEn: metrics.topService
        ? `${formatNumber(metrics.topService.receivedCount)} طلب · Top Service`
        : 'Top Service',
    },
    {
      c1: 7,
      c2: 9,
      photo: assets.kpiTotalServices,
      fill: C_SKY_SOFT,
      valColor: C_NAVY,
      border: C_BORDER,
      labelAr: 'إجمالي الخدمات',
      labelEn: 'Total Services',
    },
    {
      c1: 10,
      c2: 11,
      photo: assets.kpiCompletionRate,
      fill: C_EMERALD_SOFT,
      valColor: C_EMERALD,
      border: 'FF9CD9C5',
      labelAr: 'نسبة الإنجاز الشهرية',
      labelEn: 'Monthly Completion Rate',
    },
  ];

  kpiCardSpans.forEach((card) => {
    mergeAndSet(ws, kpiPhotoRow, card.c1, kpiPhotoRow, card.c2, '', {
      fill: card.fill,
      border: thinBorder(card.border),
    });
    placeImageInBox(wb, ws, colWidths, rowHeights, card.photo, {
      colStart: card.c1,
      colEnd: card.c2,
      rowStart: kpiPhotoRow,
      rowEnd: kpiPhotoRow,
      paddingPx: 3,
      fillBox: true,
    });
    mergeAndSet(ws, kpiLabelArRow, card.c1, kpiLabelArRow, card.c2, card.labelAr, {
      fill: card.fill,
      font: { size: 10, bold: true, color: { argb: C_NAVY } },
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: thinBorder(card.border),
    });
    mergeAndSet(ws, kpiLabelEnRow, card.c1, kpiLabelEnRow, card.c2, card.labelEn, {
      fill: card.fill,
      font: { size: 8, bold: true, color: { argb: C_TEXT_MUTED } },
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: thinBorder(card.border),
    });
  });

  // Card 5 (Cols 12..TOTAL_COLS): Engineer Inspection Photo Card
  mergeAndSet(ws, kpiPhotoRow, 12, kpiLabelArRow, TOTAL_COLS, '', {
    fill: C_NAVY,
    border: mediumGoldBoxBorder(C_GOLD),
  });
  placeImageInBox(wb, ws, colWidths, rowHeights, assets.engineer, {
    colStart: 12,
    colEnd: TOTAL_COLS,
    rowStart: kpiPhotoRow,
    rowEnd: kpiLabelArRow,
    paddingPx: 3,
    fillBox: true,
  });
  mergeAndSet(
    ws,
    kpiLabelEnRow,
    12,
    kpiLabelEnRow,
    TOTAL_COLS,
    'إدارة المرافق الذكية · متابعة ميدانية ورقابة جودة مستمرة',
    {
      fill: C_NAVY,
      font: { size: 8.5, bold: true, color: { argb: C_GOLD_LIGHT } },
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: thinBorder(C_GOLD),
    }
  );
  rowIdx += 4;

  setRowH(rowIdx, 8);
  rowIdx++;

  // ===========================================================================
  // ملخص العمليات والاعتماد (7 بطاقات تنفيذية) · Operations Summary Strip
  // ===========================================================================
  addCorporateSectionBanner(
    ws,
    rowHeights,
    rowIdx++,
    TOTAL_COLS,
    'ملخص العمليات والاعتماد (7 بطاقات تنفيذية)',
    'Operations & Approval Summary Strip'
  );

  // Row 1 of Ops Strip: 4 Photo Cards (1-3, 4-6, 7-10, 11-14)
  const ops1Cols: Array<[number, number]> = [
    [1, 3],
    [4, 6],
    [7, 10],
    [11, TOTAL_COLS],
  ];
  const ops1HeadRow = rowIdx;
  const ops1BodyRow = rowIdx + 1;
  const ops1ValRow = rowIdx + 2;
  setRowH(ops1HeadRow, 20);
  setRowH(ops1BodyRow, 42);
  setRowH(ops1ValRow, 22);

  const opsCardsRow1 = [
    {
      title: 'تفاصيل الصيانة بالمقرات',
      photo: assets.engineeringOps,
      sub: `عدد المقرات: ${formatNumber(sites.length)} مقرات`,
      valLabel: 'إجمالي الأعطال المسجلة',
      valNum: metrics.maintenance.grandTotalFaults,
      c1: ops1Cols[0][0],
      c2: ops1Cols[0][1],
    },
    {
      title: 'خدمات الصيانة',
      photo: assets.technician,
      sub: `المرافق: ${formatNumber(report.maintenanceServices.fromFacilitiesDept)} | أخرى: ${formatNumber(report.maintenanceServices.fromOtherDepts)}`,
      valLabel: 'إجمالي طلبات الصيانة',
      valNum: metrics.maintenanceServicesTotal,
      c1: ops1Cols[1][0],
      c2: ops1Cols[1][1],
    },
    {
      title: 'الدعم اللوجستي',
      photo: assets.safetyLogistics,
      sub: `عبر ${formatNumber(report.logistics.length)} قنوات تشغيلية`,
      valLabel: 'إجمالي الطلبات اللوجستية',
      valNum: metrics.logisticsTotal,
      c1: ops1Cols[2][0],
      c2: ops1Cols[2][1],
    },
    {
      title: 'خدمات الأمن والاستقبال',
      photo: assets.receptionHall,
      sub: `المستلمة: ${formatNumber(metrics.securityTotals.totalReceived)} | المنفذة: ${formatNumber(metrics.securityTotals.totalExecuted)}`,
      valLabel: 'نسبة إنجاز الأمن والاستقبال',
      valNum: metrics.securityTotals.overallCompletionPct ?? 0,
      isPct: true,
      c1: ops1Cols[3][0],
      c2: ops1Cols[3][1],
    },
  ];

  opsCardsRow1.forEach((card) => {
    mergeAndSet(ws, ops1HeadRow, card.c1, ops1HeadRow, card.c2, card.title, {
      fill: C_NAVY,
      font: { size: 9.5, bold: true, color: { argb: C_GOLD_LIGHT } },
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: thinBorder(C_GOLD),
    });
    // Left sub-col in card holds image, remaining sub-cols hold description
    mergeAndSet(ws, ops1BodyRow, card.c1, ops1BodyRow, card.c1, '', {
      fill: C_WHITE,
      border: thinBorder(),
    });
    placeImageInBox(wb, ws, colWidths, rowHeights, card.photo, {
      colStart: card.c1,
      colEnd: card.c1,
      rowStart: ops1BodyRow,
      rowEnd: ops1BodyRow,
      paddingPx: 3,
    });
    mergeAndSet(ws, ops1BodyRow, card.c1 + 1, ops1BodyRow, card.c2, card.sub, {
      fill: C_SLATE_ALT,
      font: { size: 9, bold: true, color: { argb: C_NAVY } },
      alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
      border: thinBorder(),
    });
    // Bottom value row (to be upgraded with formula links below where applicable)
    mergeAndSet(ws, ops1ValRow, card.c1, ops1ValRow, card.c2 - 1, card.valLabel, {
      fill: C_SKY_SOFT,
      font: { size: 8.5, bold: true, color: { argb: C_BLUE } },
      alignment: { horizontal: 'right', vertical: 'middle' },
      border: thinBorder(),
    });
    mergeAndSet(
      ws,
      ops1ValRow,
      card.c2,
      ops1ValRow,
      card.c2,
      card.isPct ? (card.valNum as number) / 100 : card.valNum,
      {
        fill: C_SKY_HEAD,
        font: { size: 10.5, bold: true, color: { argb: C_NAVY } },
        alignment: { horizontal: 'center', vertical: 'middle' },
        border: thinBorder(),
        numFmt: card.isPct ? '0.0%' : '#,##0',
      }
    );
  });
  rowIdx += 3;

  // Row 2 of Ops Strip: Cards 5, 6, 7
  const ops2HeadRow = rowIdx;
  const ops2BodyRow = rowIdx + 1;
  setRowH(ops2HeadRow, 20);
  setRowH(ops2BodyRow, 34);

  // Card 5: المهام التشغيلية (Cols 1..5)
  mergeAndSet(ws, ops2HeadRow, 1, ops2HeadRow, 5, 'المهام التشغيلية والمتابعة', {
    fill: C_BLUE,
    font: { size: 9.5, bold: true, color: { argb: C_WHITE } },
    alignment: { horizontal: 'center', vertical: 'middle' },
    border: thinBorder(C_GOLD),
  });
  mergeAndSet(
    ws,
    ops2BodyRow,
    1,
    ops2BodyRow,
    5,
    `الإجمالي: ${formatNumber(metrics.tasksSummary.totalMeaningful)}   |   المنجزة: ${formatNumber(metrics.tasksSummary.completed)}   |   قيد التنفيذ: ${formatNumber(metrics.tasksSummary.inProgress)}   |   المتأخرة: ${formatNumber(metrics.tasksSummary.delayed)}`,
    {
      fill: C_WHITE,
      font: { size: 9, bold: true, color: { argb: C_NAVY } },
      alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
      border: thinBorder(),
    }
  );

  // Card 6: التحديات والتوصيات (Cols 6..9)
  const challengeCount = report.challenges.filter((c) => c.challengeText.trim()).length;
  const recCount = report.challenges.filter((c) => c.recommendationText.trim()).length;
  mergeAndSet(ws, ops2HeadRow, 6, ops2HeadRow, 9, 'التحديات والتوصيات', {
    fill: C_BLUE,
    font: { size: 9.5, bold: true, color: { argb: C_WHITE } },
    alignment: { horizontal: 'center', vertical: 'middle' },
    border: thinBorder(C_GOLD),
  });
  mergeAndSet(
    ws,
    ops2BodyRow,
    6,
    ops2BodyRow,
    9,
    `التحديات المرصودة: ${formatNumber(challengeCount)}   |   التوصيات التنفيذية: ${formatNumber(recCount)}`,
    {
      fill: C_WHITE,
      font: { size: 9, bold: true, color: { argb: C_NAVY } },
      alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
      border: thinBorder(),
    }
  );

  // Card 7: الإعداد والمراجعة والاعتماد (Cols 10..TOTAL_COLS)
  mergeAndSet(ws, ops2HeadRow, 10, ops2HeadRow, TOTAL_COLS, 'الإعداد والمراجعة والاعتماد', {
    fill: C_NAVY,
    font: { size: 9.5, bold: true, color: { argb: C_GOLD_LIGHT } },
    alignment: { horizontal: 'center', vertical: 'middle' },
    border: thinBorder(C_GOLD),
  });
  mergeAndSet(
    ws,
    ops2BodyRow,
    10,
    ops2BodyRow,
    TOTAL_COLS,
    `معد التقرير: ${report.preparerName || '—'} (${report.preparerSignatureImage ? '✓ موقّع' : 'قيد التوقيع'})   |   معتمد التقرير: ${report.approverName || '—'} (${report.approverSignatureImage ? '✓ موقّع' : 'بانتظار التوقيع'})`,
    {
      fill: C_WHITE,
      font: { size: 9, bold: true, color: { argb: C_NAVY } },
      alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
      border: thinBorder(),
    }
  );
  rowIdx += 2;

  setRowH(rowIdx, 8);
  rowIdx++;

  // ===========================================================================
  // 2. نظرة عامة على الأداء — الطلبات حسب الخدمة وتوزيع الأداء
  // ===========================================================================
  addCorporateSectionBanner(
    ws,
    rowHeights,
    rowIdx++,
    TOTAL_COLS,
    '2. نظرة عامة على الأداء — الطلبات حسب الخدمة وتوزيع الأداء',
    'Performance Overview — Requests by Service & Distribution'
  );

  const sec2HeaderRow = rowIdx;
  setRowH(sec2HeaderRow, 22);
  // Right (1..3): Technical Operations Photo Card
  mergeAndSet(ws, sec2HeaderRow, 1, sec2HeaderRow, 3, 'المهام والتحديات الفنية', {
    fill: C_BLUE,
    font: { size: 9.5, bold: true, color: { argb: C_WHITE } },
    alignment: { horizontal: 'center', vertical: 'middle' },
    border: thinBorder(C_GOLD),
  });
  // Middle (4..9): Requests by Service Table Header
  mergeAndSet(ws, sec2HeaderRow, 4, sec2HeaderRow, 7, 'الخدمة · Requests by Service', {
    fill: C_NAVY,
    font: { size: 9.5, bold: true, color: { argb: C_WHITE } },
    alignment: { horizontal: 'right', vertical: 'middle' },
    border: thinBorder(C_GOLD),
  });
  mergeAndSet(ws, sec2HeaderRow, 8, sec2HeaderRow, 8, 'العدد', {
    fill: C_NAVY,
    font: { size: 9.5, bold: true, color: { argb: C_WHITE } },
    alignment: { horizontal: 'center', vertical: 'middle' },
    border: thinBorder(C_GOLD),
  });
  mergeAndSet(ws, sec2HeaderRow, 9, sec2HeaderRow, 9, 'النسبة', {
    fill: C_NAVY,
    font: { size: 9.5, bold: true, color: { argb: C_WHITE } },
    alignment: { horizontal: 'center', vertical: 'middle' },
    border: thinBorder(C_GOLD),
  });
  // Left (10..TOTAL_COLS): Performance Distribution Donut Chart Header
  mergeAndSet(ws, sec2HeaderRow, 10, sec2HeaderRow, TOTAL_COLS, 'توزيع الأداء · Performance Distribution', {
    fill: C_NAVY,
    font: { size: 9.5, bold: true, color: { argb: C_GOLD_LIGHT } },
    alignment: { horizontal: 'center', vertical: 'middle' },
    border: thinBorder(C_GOLD),
  });
  rowIdx++;

  const sec2DataStartRow = rowIdx;
  const sec2RowCount = Math.max(sortedRequestsByService.length + 1, 10);
  const sec2DataEndRow = sec2DataStartRow + sec2RowCount - 1;
  const sec2TotalRow = sec2DataStartRow + sortedRequestsByService.length;

  for (let i = 0; i < sec2RowCount; i++) {
    setRowH(sec2DataStartRow + i, 21);
  }

  // Right Zone (Cols 1..3): Technical Operations Photo + 3 live KPI pills
  const techImgEndRow = sec2DataStartRow + Math.max(4, Math.floor(sec2RowCount * 0.52));
  mergeAndSet(ws, sec2DataStartRow, 1, techImgEndRow, 3, '', {
    fill: C_NAVY,
    border: thinBorder(),
  });
  placeImageInBox(wb, ws, colWidths, rowHeights, assets.technician, {
    colStart: 1,
    colEnd: 3,
    rowStart: sec2DataStartRow,
    rowEnd: techImgEndRow,
    paddingPx: 3,
    fillBox: true,
  });

  const techMetricRows: Array<{ label: string; fill: string; color: string; rStart: number; rEnd: number; val: number; isPct?: boolean }> = [
    {
      label: 'إجمالي الطلبات المستلمة',
      fill: C_WHITE,
      color: C_NAVY,
      rStart: techImgEndRow + 1,
      rEnd: techImgEndRow + 1,
      val: metrics.totalReceived,
    },
    {
      label: 'إجمالي الطلبات المنفذة',
      fill: C_EMERALD_SOFT,
      color: C_EMERALD,
      rStart: techImgEndRow + 2,
      rEnd: techImgEndRow + 2,
      val: metrics.totalExecuted,
    },
    {
      label: 'معدل الإنجاز العام',
      fill: C_GOLD_SOFT,
      color: C_AMBER,
      rStart: techImgEndRow + 3,
      rEnd: sec2DataEndRow,
      val: metrics.overallCompletionPct != null ? metrics.overallCompletionPct / 100 : 0,
      isPct: true,
    },
  ];
  techMetricRows.forEach((tm) => {
    if (tm.rStart <= sec2DataEndRow) {
      const actualEnd = Math.min(sec2DataEndRow, Math.max(tm.rStart, tm.rEnd));
      mergeAndSet(ws, tm.rStart, 1, actualEnd, 2, tm.label, {
        fill: tm.fill,
        font: { size: 8.5, bold: true, color: { argb: tm.color } },
        alignment: { horizontal: 'right', vertical: 'middle', wrapText: true },
        border: thinBorder(),
      });
      mergeAndSet(ws, tm.rStart, 3, actualEnd, 3, tm.val, {
        fill: tm.fill,
        font: { size: 10, bold: true, color: { argb: tm.color } },
        alignment: { horizontal: 'center', vertical: 'middle' },
        border: thinBorder(),
        numFmt: tm.isPct ? '0.0%' : '#,##0',
      });
    }
  });

  // Middle Zone (Cols 4..9): Requests by Service Sorted Descending Table (formulas updated once Sec 3 placed)
  const sec2ServiceRowMap = new Map<string, number>();
  sortedRequestsByService.forEach((s, idx) => {
    const r = sec2DataStartRow + idx;
    sec2ServiceRowMap.set(s.serviceId, r);
    const altFill = idx % 2 === 1 ? C_SLATE_ALT : C_WHITE;
    mergeAndSet(ws, r, 4, r, 7, s.nameAr, {
      fill: altFill,
      font: { size: 9.5, bold: true, color: { argb: C_NAVY } },
      alignment: { horizontal: 'right', vertical: 'middle' },
      border: thinBorder(),
    });
    mergeAndSet(ws, r, 8, r, 8, s.receivedCount, {
      fill: altFill,
      font: { size: 9.5, bold: true, color: { argb: C_NAVY } },
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: thinBorder(),
      numFmt: '#,##0',
    });
    mergeAndSet(
      ws,
      r,
      9,
      r,
      9,
      {
        formula: `IF(H${sec2TotalRow}=0,0,H${r}/H${sec2TotalRow})`,
        result: s.shareOfTotalPct != null ? s.shareOfTotalPct / 100 : 0,
      },
      {
        fill: altFill,
        font: { size: 9.5, bold: true, color: { argb: C_ACCENT_BLUE } },
        alignment: { horizontal: 'center', vertical: 'middle' },
        border: thinBorder(),
        numFmt: '0.0%',
      }
    );
  });

  // Sec 2 Total Row
  mergeAndSet(ws, sec2TotalRow, 4, sec2TotalRow, 7, 'الإجمالي · Total', {
    fill: C_NAVY,
    font: { size: 10, bold: true, color: { argb: C_WHITE } },
    alignment: { horizontal: 'right', vertical: 'middle' },
    border: thinBorder(),
  });
  mergeAndSet(
    ws,
    sec2TotalRow,
    8,
    sec2TotalRow,
    8,
    sortedRequestsByService.length > 0
      ? {
          formula: `SUM(H${sec2DataStartRow}:H${sec2TotalRow - 1})`,
          result: metrics.totalReceived,
        }
      : 0,
    {
      fill: C_NAVY,
      font: { size: 10, bold: true, color: { argb: C_GOLD_LIGHT } },
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: thinBorder(),
      numFmt: '#,##0',
    }
  );
  mergeAndSet(
    ws,
    sec2TotalRow,
    9,
    sec2TotalRow,
    9,
    {
      formula: `IF(H${sec2TotalRow}=0,0,1)`,
      result: metrics.totalReceived > 0 ? 1 : 0,
    },
    {
      fill: C_NAVY,
      font: { size: 10, bold: true, color: { argb: C_WHITE } },
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: thinBorder(),
      numFmt: '0.0%',
    }
  );

  // Fill remaining rows in middle zone if chart column is taller
  if (sec2TotalRow < sec2DataEndRow) {
    mergeAndSet(ws, sec2TotalRow + 1, 4, sec2DataEndRow, 9, '', {
      fill: C_SLATE_ALT,
      border: thinBorder(),
    });
  }

  // Left Zone (Cols 10..TOTAL_COLS): Performance Distribution Donut Chart PNG
  mergeAndSet(ws, sec2DataStartRow, 10, sec2DataEndRow, TOTAL_COLS, '', {
    fill: C_WHITE,
    border: thinBorder(),
  });
  placeImageInBox(wb, ws, colWidths, rowHeights, perfDonutImg, {
    colStart: 10,
    colEnd: TOTAL_COLS,
    rowStart: sec2DataStartRow,
    rowEnd: sec2DataEndRow,
    paddingPx: 4,
  });

  rowIdx = sec2DataEndRow + 1;
  setRowH(rowIdx, 8);
  rowIdx++;

  // ===========================================================================
  // 3. ملخص الخدمات ومؤشرات الإنجاز · Services Summary & Completion Indicators
  // ===========================================================================
  addCorporateSectionBanner(
    ws,
    rowHeights,
    rowIdx++,
    TOTAL_COLS,
    '3. ملخص الخدمات ومؤشرات الإنجاز',
    'Services Summary & Completion Indicators'
  );

  const sec3HeadRow = rowIdx++;
  setRowH(sec3HeadRow, 24);
  mergeAndSet(ws, sec3HeadRow, 1, sec3HeadRow, 1, '#', {
    fill: C_NAVY,
    font: { size: 10, bold: true, color: { argb: C_WHITE } },
    alignment: { horizontal: 'center', vertical: 'middle' },
    border: thinBorder(),
  });
  mergeAndSet(ws, sec3HeadRow, 2, sec3HeadRow, 5, 'الخدمة · Service', {
    fill: C_NAVY,
    font: { size: 10, bold: true, color: { argb: C_WHITE } },
    alignment: { horizontal: 'right', vertical: 'middle' },
    border: thinBorder(),
  });
  mergeAndSet(ws, sec3HeadRow, 6, sec3HeadRow, 7, 'التسمية الإنجليزية · English', {
    fill: C_NAVY,
    font: { size: 9.5, bold: true, color: { argb: C_GOLD_LIGHT } },
    alignment: { horizontal: 'center', vertical: 'middle' },
    border: thinBorder(),
  });
  mergeAndSet(ws, sec3HeadRow, 8, sec3HeadRow, 9, 'الطلبات المستلمة', {
    fill: C_NAVY,
    font: { size: 10, bold: true, color: { argb: C_WHITE } },
    alignment: { horizontal: 'center', vertical: 'middle' },
    border: thinBorder(),
  });
  mergeAndSet(ws, sec3HeadRow, 10, sec3HeadRow, 11, 'الطلبات المنفذة', {
    fill: C_NAVY,
    font: { size: 10, bold: true, color: { argb: C_WHITE } },
    alignment: { horizontal: 'center', vertical: 'middle' },
    border: thinBorder(),
  });
  mergeAndSet(ws, sec3HeadRow, 12, sec3HeadRow, 12, 'نسبة الإنجاز %', {
    fill: C_NAVY,
    font: { size: 10, bold: true, color: { argb: C_WHITE } },
    alignment: { horizontal: 'center', vertical: 'middle' },
    border: thinBorder(),
  });
  mergeAndSet(ws, sec3HeadRow, 13, sec3HeadRow, TOTAL_COLS, 'المستوى', {
    fill: C_NAVY,
    font: { size: 10, bold: true, color: { argb: C_WHITE } },
    alignment: { horizontal: 'center', vertical: 'middle' },
    border: thinBorder(),
  });

  const sec3StartRow = rowIdx;
  const sec3RowById = new Map<string, number>();

  sortedSummary.forEach((s, idx) => {
    const r = rowIdx++;
    sec3RowById.set(s.serviceId, r);
    setRowH(r, 21);
    const altFill = idx % 2 === 1 ? C_SLATE_ALT : C_WHITE;
    const toneColor =
      s.level.tone === 'emerald'
        ? C_EMERALD
        : s.level.tone === 'blue'
          ? C_ACCENT_BLUE
          : s.level.tone === 'amber' || s.level.tone === 'orange'
            ? C_AMBER
            : s.level.tone === 'red'
              ? C_CRIMSON
              : C_TEXT_MUTED;
    const toneFill =
      s.level.tone === 'emerald'
        ? C_EMERALD_SOFT
        : s.level.tone === 'blue'
          ? C_SKY_SOFT
          : s.level.tone === 'amber' || s.level.tone === 'orange'
            ? C_AMBER_SOFT
            : s.level.tone === 'red'
              ? C_CRIMSON_SOFT
              : C_SLATE_ALT;

    mergeAndSet(ws, r, 1, r, 1, idx + 1, {
      fill: altFill,
      font: { size: 9.5, bold: true, color: { argb: C_TEXT_MUTED } },
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: thinBorder(),
      numFmt: '#,##0',
    });
    mergeAndSet(ws, r, 2, r, 5, s.nameAr, {
      fill: altFill,
      font: { size: 10, bold: true, color: { argb: C_NAVY } },
      alignment: { horizontal: 'right', vertical: 'middle' },
      border: thinBorder(),
    });
    mergeAndSet(ws, r, 6, r, 7, s.nameEn || '—', {
      fill: altFill,
      font: { size: 9, color: { argb: C_TEXT_MUTED } },
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: thinBorder(),
    });
    mergeAndSet(ws, r, 8, r, 9, s.receivedCount, {
      fill: altFill,
      font: { size: 10, bold: true, color: { argb: C_NAVY } },
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: thinBorder(),
      numFmt: '#,##0',
    });
    mergeAndSet(ws, r, 10, r, 11, s.executedCount, {
      fill: C_EMERALD_SOFT,
      font: { size: 10, bold: true, color: { argb: C_EMERALD } },
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: thinBorder(),
      numFmt: '#,##0',
    });
    mergeAndSet(
      ws,
      r,
      12,
      r,
      12,
      {
        formula: `IF(H${r}=0,"—",J${r}/H${r})`,
        result: s.completionPct != null ? s.completionPct / 100 : '—',
      },
      {
        fill: altFill,
        font: { size: 10, bold: true, color: { argb: C_NAVY } },
        alignment: { horizontal: 'center', vertical: 'middle' },
        border: thinBorder(),
        numFmt: '0.0%',
      }
    );
    mergeAndSet(
      ws,
      r,
      13,
      r,
      TOTAL_COLS,
      {
        formula: buildPerformanceLevelFormula(`L${r}`, thresholds),
        result: s.level.labelAr,
      },
      {
        fill: toneFill,
        font: { size: 9.5, bold: true, color: { argb: toneColor } },
        alignment: { horizontal: 'center', vertical: 'middle' },
        border: thinBorder(),
      }
    );
  });

  const sec3TotalRow = rowIdx++;
  setRowH(sec3TotalRow, 24);
  mergeAndSet(
    ws,
    sec3TotalRow,
    1,
    sec3TotalRow,
    7,
    `الإجمالي العام (${formatNumber(sortedSummary.length)} خدمة) · Grand Total`,
    {
      fill: C_NAVY,
      font: { size: 10.5, bold: true, color: { argb: C_WHITE } },
      alignment: { horizontal: 'right', vertical: 'middle' },
      border: thinBorder(),
    }
  );
  mergeAndSet(
    ws,
    sec3TotalRow,
    8,
    sec3TotalRow,
    9,
    sortedSummary.length > 0
      ? {
          formula: `SUM(H${sec3StartRow}:H${sec3TotalRow - 1})`,
          result: metrics.totalReceived,
        }
      : 0,
    {
      fill: C_NAVY,
      font: { size: 10.5, bold: true, color: { argb: C_GOLD_LIGHT } },
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: thinBorder(),
      numFmt: '#,##0',
    }
  );
  mergeAndSet(
    ws,
    sec3TotalRow,
    10,
    sec3TotalRow,
    11,
    sortedSummary.length > 0
      ? {
          formula: `SUM(J${sec3StartRow}:J${sec3TotalRow - 1})`,
          result: metrics.totalExecuted,
        }
      : 0,
    {
      fill: C_NAVY,
      font: { size: 10.5, bold: true, color: { argb: 'FF6EE7B7' } },
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: thinBorder(),
      numFmt: '#,##0',
    }
  );
  mergeAndSet(
    ws,
    sec3TotalRow,
    12,
    sec3TotalRow,
    12,
    {
      formula: `IF(H${sec3TotalRow}=0,"—",J${sec3TotalRow}/H${sec3TotalRow})`,
      result: metrics.overallCompletionPct != null ? metrics.overallCompletionPct / 100 : '—',
    },
    {
      fill: C_NAVY,
      font: { size: 10.5, bold: true, color: { argb: C_GOLD_LIGHT } },
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: thinBorder(),
      numFmt: '0.0%',
    }
  );
  mergeAndSet(
    ws,
    sec3TotalRow,
    13,
    sec3TotalRow,
    TOTAL_COLS,
    {
      formula: buildPerformanceLevelFormula(`L${sec3TotalRow}`, thresholds),
      result: computeReportMetrics(report, sites, categories, thresholds).servicesWithMetrics.length
        ? 'المعدل العام'
        : '—',
    },
    {
      fill: C_NAVY,
      font: { size: 10, bold: true, color: { argb: C_GOLD_LIGHT } },
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: thinBorder(),
    }
  );

  // Now backfill Section 1 KPI formulas and Section 2 formulas pointing directly to Section 3!
  mergeAndSet(
    ws,
    kpiValRow,
    1,
    kpiValRow,
    3,
    { formula: `H${sec3TotalRow}`, result: metrics.totalReceived },
    {
      fill: C_SKY_SOFT,
      font: { size: 16, bold: true, color: { argb: C_NAVY } },
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: thinBorder(C_BORDER),
      numFmt: '#,##0',
    }
  );
  mergeAndSet(
    ws,
    kpiValRow,
    4,
    kpiValRow,
    6,
    sortedSummary.length > 0
      ? {
          formula: `IF(MAX(H${sec3StartRow}:H${sec3TotalRow - 1})=0,"0",INDEX(B${sec3StartRow}:B${sec3TotalRow - 1},MATCH(MAX(H${sec3StartRow}:H${sec3TotalRow - 1}),H${sec3StartRow}:H${sec3TotalRow - 1},0)))`,
          result: metrics.topService ? metrics.topService.nameAr : '0',
        }
      : '0',
    {
      fill: C_GOLD_SOFT,
      font: { size: 12.5, bold: true, color: { argb: C_NAVY } },
      alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
      border: thinBorder(C_BORDER_GOLD),
    }
  );
  mergeAndSet(
    ws,
    kpiValRow,
    7,
    kpiValRow,
    9,
    sortedSummary.length > 0
      ? {
          formula: `COUNTA(B${sec3StartRow}:B${sec3TotalRow - 1})`,
          result: metrics.activeServicesCount,
        }
      : 0,
    {
      fill: C_SKY_SOFT,
      font: { size: 16, bold: true, color: { argb: C_NAVY } },
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: thinBorder(C_BORDER),
      numFmt: '#,##0',
    }
  );
  mergeAndSet(
    ws,
    kpiValRow,
    10,
    kpiValRow,
    11,
    {
      formula: `IF(H${sec3TotalRow}=0,0,J${sec3TotalRow}/H${sec3TotalRow})`,
      result: metrics.overallCompletionPct != null ? metrics.overallCompletionPct / 100 : 0,
    },
    {
      fill: C_EMERALD_SOFT,
      font: { size: 15, bold: true, color: { argb: C_EMERALD } },
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: thinBorder('FF9CD9C5'),
      numFmt: '0.0%',
    }
  );

  // Backfill Section 2 technical panel & requests table links to Section 3
  if (techImgEndRow + 1 <= sec2DataEndRow) {
    ws.getCell(techImgEndRow + 1, 3).value = {
      formula: `H${sec3TotalRow}`,
      result: metrics.totalReceived,
    };
  }
  if (techImgEndRow + 2 <= sec2DataEndRow) {
    ws.getCell(techImgEndRow + 2, 3).value = {
      formula: `J${sec3TotalRow}`,
      result: metrics.totalExecuted,
    };
  }
  if (techImgEndRow + 3 <= sec2DataEndRow) {
    ws.getCell(techImgEndRow + 3, 3).value = {
      formula: `IF(H${sec3TotalRow}=0,0,J${sec3TotalRow}/H${sec3TotalRow})`,
      result: metrics.overallCompletionPct != null ? metrics.overallCompletionPct / 100 : 0,
    };
  }
  sortedRequestsByService.forEach((s) => {
    const r2 = sec2ServiceRowMap.get(s.serviceId);
    const r3 = sec3RowById.get(s.serviceId);
    if (r2 && r3) {
      ws.getCell(r2, 8).value = { formula: `H${r3}`, result: s.receivedCount };
    }
  });

  setRowH(rowIdx, 8);
  rowIdx++;

  // ===========================================================================
  // 4. العقود والرخص · Contracts & Licenses
  // ===========================================================================
  addCorporateSectionBanner(ws, rowHeights, rowIdx++, TOTAL_COLS, '4. العقود والرخص', 'Contracts & Licenses');

  const sec4HeadRow = rowIdx++;
  setRowH(sec4HeadRow, 22);
  mergeAndSet(ws, sec4HeadRow, 1, sec4HeadRow, 3, 'الفئة · Category', {
    fill: C_NAVY,
    font: { size: 9.5, bold: true, color: { argb: C_WHITE } },
    alignment: { horizontal: 'right', vertical: 'middle' },
    border: thinBorder(),
  });
  mergeAndSet(ws, sec4HeadRow, 4, sec4HeadRow, 5, 'التسمية الإنجليزية', {
    fill: C_NAVY,
    font: { size: 9, bold: true, color: { argb: C_GOLD_LIGHT } },
    alignment: { horizontal: 'center', vertical: 'middle' },
    border: thinBorder(),
  });
  mergeAndSet(ws, sec4HeadRow, 6, sec4HeadRow, 6, 'الفعّالة', {
    fill: C_NAVY,
    font: { size: 9.5, bold: true, color: { argb: C_WHITE } },
    alignment: { horizontal: 'center', vertical: 'middle' },
    border: thinBorder(),
  });
  mergeAndSet(ws, sec4HeadRow, 7, sec4HeadRow, 7, 'غير الفعّالة', {
    fill: C_NAVY,
    font: { size: 9.5, bold: true, color: { argb: C_WHITE } },
    alignment: { horizontal: 'center', vertical: 'middle' },
    border: thinBorder(),
  });
  mergeAndSet(ws, sec4HeadRow, 8, sec4HeadRow, 8, 'الإجمالي', {
    fill: C_NAVY,
    font: { size: 9.5, bold: true, color: { argb: C_WHITE } },
    alignment: { horizontal: 'center', vertical: 'middle' },
    border: thinBorder(),
  });
  mergeAndSet(ws, sec4HeadRow, 9, sec4HeadRow, 9, 'نسبة السريان %', {
    fill: C_NAVY,
    font: { size: 9.5, bold: true, color: { argb: C_WHITE } },
    alignment: { horizontal: 'center', vertical: 'middle' },
    border: thinBorder(),
  });
  mergeAndSet(ws, sec4HeadRow, 10, sec4HeadRow, TOTAL_COLS, 'الملاحظات والتفاصيل · Notes', {
    fill: C_NAVY,
    font: { size: 9.5, bold: true, color: { argb: C_WHITE } },
    alignment: { horizontal: 'right', vertical: 'middle' },
    border: thinBorder(),
  });

  const sec4StartRow = rowIdx;
  const notesWidth4 = colWidths.slice(9, TOTAL_COLS).reduce((a, b) => a + b, 0);
  report.contracts.forEach((c, idx) => {
    const r = rowIdx++;
    const notesText = c.notes?.trim() || 'لا توجد ملاحظات مسجلة';
    setRowH(r, estimateWrappedRowHeight([{ text: notesText, widthChars: notesWidth4, fontSize: 9.5 }], 26, 8));
    const altFill = idx % 2 === 1 ? C_SLATE_ALT : C_WHITE;
    const total = c.activeCount + c.inactiveCount;
    const pct = total > 0 ? c.activeCount / total : null;

    mergeAndSet(ws, r, 1, r, 3, c.nameAr, {
      fill: altFill,
      font: { size: 10, bold: true, color: { argb: C_NAVY } },
      alignment: { horizontal: 'right', vertical: 'middle' },
      border: thinBorder(),
    });
    mergeAndSet(ws, r, 4, r, 5, c.nameEn, {
      fill: altFill,
      font: { size: 9, color: { argb: C_TEXT_MUTED } },
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: thinBorder(),
    });
    mergeAndSet(ws, r, 6, r, 6, c.activeCount, {
      fill: C_EMERALD_SOFT,
      font: { size: 10.5, bold: true, color: { argb: C_EMERALD } },
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: thinBorder(),
      numFmt: '#,##0',
    });
    mergeAndSet(ws, r, 7, r, 7, c.inactiveCount, {
      fill: c.inactiveCount > 0 ? C_CRIMSON_SOFT : altFill,
      font: { size: 10.5, bold: true, color: { argb: c.inactiveCount > 0 ? C_CRIMSON : C_TEXT_MUTED } },
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: thinBorder(),
      numFmt: '#,##0',
    });
    mergeAndSet(
      ws,
      r,
      8,
      r,
      8,
      { formula: `F${r}+G${r}`, result: total },
      {
        fill: C_SKY_SOFT,
        font: { size: 10, bold: true, color: { argb: C_NAVY } },
        alignment: { horizontal: 'center', vertical: 'middle' },
        border: thinBorder(),
        numFmt: '#,##0',
      }
    );
    mergeAndSet(
      ws,
      r,
      9,
      r,
      9,
      { formula: `IF(H${r}=0,"—",F${r}/H${r})`, result: pct ?? '—' },
      {
        fill: altFill,
        font: { size: 9.5, bold: true, color: { argb: C_ACCENT_BLUE } },
        alignment: { horizontal: 'center', vertical: 'middle' },
        border: thinBorder(),
        numFmt: '0.0%',
      }
    );
    mergeAndSet(ws, r, 10, r, TOTAL_COLS, notesText, {
      fill: altFill,
      font: { size: 9.5, color: { argb: C_NAVY } },
      alignment: { horizontal: 'right', vertical: 'middle', wrapText: true },
      border: thinBorder(),
    });
  });

  const sec4TotalRow = rowIdx++;
  setRowH(sec4TotalRow, 22);
  const contractsSum = metrics.contractsTotals.totalActive + metrics.contractsTotals.totalInactive;
  mergeAndSet(ws, sec4TotalRow, 1, sec4TotalRow, 5, 'إجمالي العقود والرخص · Contracts Total', {
    fill: C_NAVY,
    font: { size: 10, bold: true, color: { argb: C_WHITE } },
    alignment: { horizontal: 'right', vertical: 'middle' },
    border: thinBorder(),
  });
  mergeAndSet(
    ws,
    sec4TotalRow,
    6,
    sec4TotalRow,
    6,
    report.contracts.length > 0
      ? { formula: `SUM(F${sec4StartRow}:F${sec4TotalRow - 1})`, result: metrics.contractsTotals.totalActive }
      : 0,
    {
      fill: C_NAVY,
      font: { size: 10, bold: true, color: { argb: 'FF6EE7B7' } },
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: thinBorder(),
      numFmt: '#,##0',
    }
  );
  mergeAndSet(
    ws,
    sec4TotalRow,
    7,
    sec4TotalRow,
    7,
    report.contracts.length > 0
      ? { formula: `SUM(G${sec4StartRow}:G${sec4TotalRow - 1})`, result: metrics.contractsTotals.totalInactive }
      : 0,
    {
      fill: C_NAVY,
      font: { size: 10, bold: true, color: { argb: C_GOLD_LIGHT } },
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: thinBorder(),
      numFmt: '#,##0',
    }
  );
  mergeAndSet(
    ws,
    sec4TotalRow,
    8,
    sec4TotalRow,
    8,
    { formula: `F${sec4TotalRow}+G${sec4TotalRow}`, result: contractsSum },
    {
      fill: C_NAVY,
      font: { size: 10, bold: true, color: { argb: C_WHITE } },
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: thinBorder(),
      numFmt: '#,##0',
    }
  );
  mergeAndSet(
    ws,
    sec4TotalRow,
    9,
    sec4TotalRow,
    9,
    {
      formula: `IF(H${sec4TotalRow}=0,"—",F${sec4TotalRow}/H${sec4TotalRow})`,
      result: contractsSum > 0 ? metrics.contractsTotals.totalActive / contractsSum : '—',
    },
    {
      fill: C_NAVY,
      font: { size: 10, bold: true, color: { argb: C_GOLD_LIGHT } },
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: thinBorder(),
      numFmt: '0.0%',
    }
  );
  mergeAndSet(ws, sec4TotalRow, 10, sec4TotalRow, TOTAL_COLS, '', {
    fill: C_NAVY,
    border: thinBorder(),
  });

  setRowH(rowIdx, 8);
  rowIdx++;

  // ===========================================================================
  // 5. الطفايات وملاحظات المخاطر · Fire Safety & Hazard Notes (with Photos)
  // ===========================================================================
  addCorporateSectionBanner(
    ws,
    rowHeights,
    rowIdx++,
    TOTAL_COLS,
    '5. الطفايات وملاحظات المخاطر',
    'Fire Safety & Hazard Notes'
  );

  const sec5HeadRow = rowIdx++;
  setRowH(sec5HeadRow, 22);
  mergeAndSet(ws, sec5HeadRow, 1, sec5HeadRow, 1, 'الصورة', {
    fill: C_NAVY,
    font: { size: 9.5, bold: true, color: { argb: C_WHITE } },
    alignment: { horizontal: 'center', vertical: 'middle' },
    border: thinBorder(),
  });
  mergeAndSet(ws, sec5HeadRow, 2, sec5HeadRow, 4, 'المجموعة · Safety Group', {
    fill: C_NAVY,
    font: { size: 9.5, bold: true, color: { argb: C_WHITE } },
    alignment: { horizontal: 'right', vertical: 'middle' },
    border: thinBorder(),
  });
  mergeAndSet(ws, sec5HeadRow, 5, sec5HeadRow, 6, 'صالحة / مغلقة', {
    fill: C_NAVY,
    font: { size: 9.5, bold: true, color: { argb: C_WHITE } },
    alignment: { horizontal: 'center', vertical: 'middle' },
    border: thinBorder(),
  });
  mergeAndSet(ws, sec5HeadRow, 7, sec5HeadRow, 8, 'تحتاج صيانة / مفتوحة', {
    fill: C_NAVY,
    font: { size: 9.5, bold: true, color: { argb: C_WHITE } },
    alignment: { horizontal: 'center', vertical: 'middle' },
    border: thinBorder(),
  });
  mergeAndSet(ws, sec5HeadRow, 9, sec5HeadRow, 9, 'الإجمالي', {
    fill: C_NAVY,
    font: { size: 9.5, bold: true, color: { argb: C_WHITE } },
    alignment: { horizontal: 'center', vertical: 'middle' },
    border: thinBorder(),
  });
  mergeAndSet(ws, sec5HeadRow, 10, sec5HeadRow, TOTAL_COLS, 'الملاحظات والتوصيات · Notes', {
    fill: C_NAVY,
    font: { size: 9.5, bold: true, color: { argb: C_WHITE } },
    alignment: { horizontal: 'right', vertical: 'middle' },
    border: thinBorder(),
  });

  report.safety.forEach((s, idx) => {
    const isFire = s.groupKey === 'fire_extinguishers' || idx === 0;
    const photo = isFire ? assets.fireExtinguisher : assets.safetyLogistics;
    const primaryLabel = isFire ? 'صالحة / فعّالة' : 'مغلقة / معالجة';
    const secondaryLabel = isFire ? 'تحتاج صيانة' : 'قيد المعالجة';
    const notesText = s.notes?.trim() || 'لا توجد ملاحظات مسجلة';
    const r = rowIdx++;
    const h = Math.max(
      46,
      estimateWrappedRowHeight([{ text: notesText, widthChars: notesWidth4, fontSize: 9.5 }], 46, 10)
    );
    setRowH(r, h);

    const total = s.primaryCount + s.secondaryCount;
    const altFill = idx % 2 === 1 ? C_SLATE_ALT : C_WHITE;

    mergeAndSet(ws, r, 1, r, 1, '', { fill: C_WHITE, border: thinBorder() });
    placeImageInBox(wb, ws, colWidths, rowHeights, photo, {
      colStart: 1,
      colEnd: 1,
      rowStart: r,
      rowEnd: r,
      paddingPx: 4,
    });
    mergeAndSet(ws, r, 2, r, 4, `${s.nameAr}\n(${s.nameEn})`, {
      fill: altFill,
      font: { size: 9.5, bold: true, color: { argb: C_NAVY } },
      alignment: { horizontal: 'right', vertical: 'middle', wrapText: true },
      border: thinBorder(),
    });
    mergeAndSet(ws, r, 5, r, 5, primaryLabel, {
      fill: C_EMERALD_SOFT,
      font: { size: 8.5, bold: true, color: { argb: C_EMERALD } },
      alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
      border: thinBorder(),
    });
    mergeAndSet(ws, r, 6, r, 6, s.primaryCount, {
      fill: C_EMERALD_SOFT,
      font: { size: 11, bold: true, color: { argb: C_EMERALD } },
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: thinBorder(),
      numFmt: '#,##0',
    });
    mergeAndSet(ws, r, 7, r, 7, secondaryLabel, {
      fill: C_CRIMSON_SOFT,
      font: { size: 8.5, bold: true, color: { argb: C_CRIMSON } },
      alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
      border: thinBorder(),
    });
    mergeAndSet(ws, r, 8, r, 8, s.secondaryCount, {
      fill: C_CRIMSON_SOFT,
      font: { size: 11, bold: true, color: { argb: C_CRIMSON } },
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: thinBorder(),
      numFmt: '#,##0',
    });
    mergeAndSet(
      ws,
      r,
      9,
      r,
      9,
      { formula: `F${r}+H${r}`, result: total },
      {
        fill: C_SKY_SOFT,
        font: { size: 10.5, bold: true, color: { argb: C_NAVY } },
        alignment: { horizontal: 'center', vertical: 'middle' },
        border: thinBorder(),
        numFmt: '#,##0',
      }
    );
    mergeAndSet(ws, r, 10, r, TOTAL_COLS, notesText, {
      fill: altFill,
      font: { size: 9.5, color: { argb: C_NAVY } },
      alignment: { horizontal: 'right', vertical: 'middle', wrapText: true },
      border: thinBorder(),
    });
  });

  setRowH(rowIdx, 8);
  rowIdx++;

  // ===========================================================================
  // 6. تفاصيل الصيانة بالمقرات والتكاليف المالية · Maintenance Matrix & Costs
  // ===========================================================================
  addCorporateSectionBanner(
    ws,
    rowHeights,
    rowIdx++,
    TOTAL_COLS,
    '6. تفاصيل الصيانة بالمقرات والتكاليف المالية',
    'Maintenance Details by Site, Fault Category & Financial Costs'
  );

  // Reserve 2 rows for 4 Maintenance KPI Cards (filled with live formulas once matrix rows known)
  const maintKpiTitleRow = rowIdx++;
  const maintKpiValRow = rowIdx++;
  setRowH(maintKpiTitleRow, 20);
  setRowH(maintKpiValRow, 25);

  const matrixHeadRow = rowIdx++;
  setRowH(matrixHeadRow, 32);

  const totalColIdx = 2 + categories.length;
  mergeAndSet(ws, matrixHeadRow, 1, matrixHeadRow, 1, 'المقر / البيان', {
    fill: C_NAVY,
    font: { size: 9.5, bold: true, color: { argb: C_WHITE } },
    alignment: { horizontal: 'right', vertical: 'middle' },
    border: thinBorder(),
  });
  categories.forEach((cat, idx) => {
    mergeAndSet(ws, matrixHeadRow, 2 + idx, matrixHeadRow, 2 + idx, cat.nameAr, {
      fill: C_NAVY,
      font: { size: 8.5, bold: true, color: { argb: C_WHITE } },
      alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
      border: thinBorder(),
    });
  });
  if (totalColIdx <= TOTAL_COLS) {
    mergeAndSet(ws, matrixHeadRow, totalColIdx, matrixHeadRow, TOTAL_COLS, 'الإجمالي', {
      fill: C_BLUE,
      font: { size: 9.5, bold: true, color: { argb: C_GOLD_LIGHT } },
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: thinBorder(),
    });
  }

  const matrixSiteStartRow = rowIdx;
  sites.forEach((site, sIdx) => {
    const r = rowIdx++;
    setRowH(r, 21);
    const altFill = sIdx % 2 === 1 ? C_SLATE_ALT : C_WHITE;

    mergeAndSet(ws, r, 1, r, 1, site.nameAr, {
      fill: altFill,
      font: { size: 9.5, bold: true, color: { argb: C_NAVY } },
      alignment: { horizontal: 'right', vertical: 'middle' },
      border: thinBorder(),
    });
    categories.forEach((cat, cIdx) => {
      const val = Math.max(0, Number(report.maintenanceMatrix[site.id]?.[cat.id]) || 0);
      mergeAndSet(ws, r, 2 + cIdx, r, 2 + cIdx, val, {
        fill: val > 0 ? C_SKY_SOFT : altFill,
        font: { size: 9.5, bold: val > 0, color: { argb: val > 0 ? C_NAVY : C_TEXT_MUTED } },
        alignment: { horizontal: 'center', vertical: 'middle' },
        border: thinBorder(),
        numFmt: '#,##0',
      });
    });

    const firstCatCol = colLetter(2);
    const lastCatCol = colLetter(1 + Math.max(1, categories.length));
    mergeAndSet(
      ws,
      r,
      totalColIdx,
      r,
      TOTAL_COLS,
      categories.length > 0
        ? {
            formula: `SUM(${firstCatCol}${r}:${lastCatCol}${r})`,
            result: metrics.maintenance.siteTotals[site.id] ?? 0,
          }
        : 0,
      {
        fill: C_SKY_SOFT,
        font: { size: 10, bold: true, color: { argb: C_NAVY } },
        alignment: { horizontal: 'center', vertical: 'middle' },
        border: thinBorder(),
        numFmt: '#,##0',
      }
    );
  });

  const matrixSiteEndRow = Math.max(matrixSiteStartRow, rowIdx - 1);

  // إجمالي عدد الأعطال Row
  const matrixFaultTotalsRow = rowIdx++;
  setRowH(matrixFaultTotalsRow, 22);
  mergeAndSet(ws, matrixFaultTotalsRow, 1, matrixFaultTotalsRow, 1, 'إجمالي عدد الأعطال', {
    fill: C_SKY_HEAD,
    font: { size: 9.5, bold: true, color: { argb: C_NAVY } },
    alignment: { horizontal: 'right', vertical: 'middle' },
    border: thinBorder(),
  });
  categories.forEach((cat, idx) => {
    const col = 2 + idx;
    const cL = colLetter(col);
    mergeAndSet(
      ws,
      matrixFaultTotalsRow,
      col,
      matrixFaultTotalsRow,
      col,
      sites.length > 0
        ? {
            formula: `SUM(${cL}${matrixSiteStartRow}:${cL}${matrixSiteEndRow})`,
            result: metrics.maintenance.categoryTotals[cat.id] ?? 0,
          }
        : 0,
      {
        fill: C_SKY_HEAD,
        font: { size: 9.5, bold: true, color: { argb: C_NAVY } },
        alignment: { horizontal: 'center', vertical: 'middle' },
        border: thinBorder(),
        numFmt: '#,##0',
      }
    );
  });
  const totalColLetter = colLetter(totalColIdx);
  mergeAndSet(
    ws,
    matrixFaultTotalsRow,
    totalColIdx,
    matrixFaultTotalsRow,
    TOTAL_COLS,
    sites.length > 0
      ? {
          formula: `SUM(${totalColLetter}${matrixSiteStartRow}:${totalColLetter}${matrixSiteEndRow})`,
          result: metrics.maintenance.grandTotalFaults,
        }
      : 0,
    {
      fill: C_SKY_HEAD,
      font: { size: 10.5, bold: true, color: { argb: C_EMERALD } },
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: thinBorder(),
      numFmt: '#,##0',
    }
  );

  // التكلفة / النثرية (AED)
  const pettyRow = rowIdx++;
  setRowH(pettyRow, 22);
  mergeAndSet(ws, pettyRow, 1, pettyRow, 1, 'التكلفة / النثرية (AED)', {
    fill: C_WHITE,
    font: { size: 9, bold: true, color: { argb: C_EMERALD } },
    alignment: { horizontal: 'right', vertical: 'middle' },
    border: thinBorder(),
  });
  categories.forEach((cat, idx) => {
    const col = 2 + idx;
    const val = Math.max(0, Number(report.maintenanceCosts[cat.id]?.pettyCashAed) || 0);
    mergeAndSet(ws, pettyRow, col, pettyRow, col, val, {
      fill: C_WHITE,
      font: { size: 8.5, color: { argb: C_NAVY } },
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: thinBorder(),
      numFmt: '#,##0.00',
    });
  });
  mergeAndSet(
    ws,
    pettyRow,
    totalColIdx,
    pettyRow,
    TOTAL_COLS,
    categories.length > 0
      ? {
          formula: `SUM(${colLetter(2)}${pettyRow}:${colLetter(1 + categories.length)}${pettyRow})`,
          result: metrics.maintenance.pettyCashTotalAed,
        }
      : 0,
    {
      fill: C_EMERALD_SOFT,
      font: { size: 9.5, bold: true, color: { argb: C_EMERALD } },
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: thinBorder(),
      numFmt: '#,##0.00 "AED"',
    }
  );

  // التكلفة / أمر شراء (AED)
  const poRow = rowIdx++;
  setRowH(poRow, 22);
  mergeAndSet(ws, poRow, 1, poRow, 1, 'التكلفة / أمر شراء (AED)', {
    fill: C_SLATE_ALT,
    font: { size: 9, bold: true, color: { argb: C_BLUE } },
    alignment: { horizontal: 'right', vertical: 'middle' },
    border: thinBorder(),
  });
  categories.forEach((cat, idx) => {
    const col = 2 + idx;
    const val = Math.max(0, Number(report.maintenanceCosts[cat.id]?.purchaseOrderAed) || 0);
    mergeAndSet(ws, poRow, col, poRow, col, val, {
      fill: C_SLATE_ALT,
      font: { size: 8.5, color: { argb: C_NAVY } },
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: thinBorder(),
      numFmt: '#,##0.00',
    });
  });
  mergeAndSet(
    ws,
    poRow,
    totalColIdx,
    poRow,
    TOTAL_COLS,
    categories.length > 0
      ? {
          formula: `SUM(${colLetter(2)}${poRow}:${colLetter(1 + categories.length)}${poRow})`,
          result: metrics.maintenance.purchaseOrderTotalAed,
        }
      : 0,
    {
      fill: C_SKY_SOFT,
      font: { size: 9.5, bold: true, color: { argb: C_BLUE } },
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: thinBorder(),
      numFmt: '#,##0.00 "AED"',
    }
  );

  // Grand Maintenance Cost Banner Row
  const grandCostRow = rowIdx++;
  setRowH(grandCostRow, 24);
  mergeAndSet(
    ws,
    grandCostRow,
    1,
    grandCostRow,
    totalColIdx - 1,
    'إجمالي تكاليف الصيانة الكلية المعتمدة (النثرية + أوامر الشراء) · Grand Maintenance Cost',
    {
      fill: C_NAVY,
      font: { size: 10, bold: true, color: { argb: C_WHITE } },
      alignment: { horizontal: 'right', vertical: 'middle' },
      border: thinBorder(C_GOLD),
    }
  );
  mergeAndSet(
    ws,
    grandCostRow,
    totalColIdx,
    grandCostRow,
    TOTAL_COLS,
    {
      formula: `${totalColLetter}${pettyRow}+${totalColLetter}${poRow}`,
      result: metrics.maintenance.grandTotalCostAed,
    },
    {
      fill: C_NAVY,
      font: { size: 10.5, bold: true, color: { argb: C_GOLD_LIGHT } },
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: thinBorder(C_GOLD),
      numFmt: '#,##0.00 "AED"',
    }
  );

  // Backfill Section 6 Top 4 Maintenance KPI Cards + Ops Strip Card 1 link
  const topFaultSite = metrics.maintenance.highestFaultSite;
  mergeAndSet(ws, maintKpiTitleRow, 1, maintKpiTitleRow, 3, 'إجمالي الأعطال المسجلة', {
    fill: C_SKY_SOFT,
    font: { size: 9, bold: true, color: { argb: C_BLUE } },
    alignment: { horizontal: 'center', vertical: 'middle' },
    border: thinBorder(),
  });
  mergeAndSet(
    ws,
    maintKpiValRow,
    1,
    maintKpiValRow,
    3,
    {
      formula: `${totalColLetter}${matrixFaultTotalsRow}`,
      result: metrics.maintenance.grandTotalFaults,
    },
    {
      fill: C_SKY_SOFT,
      font: { size: 12, bold: true, color: { argb: C_NAVY } },
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: thinBorder(),
      numFmt: '#,##0',
    }
  );

  mergeAndSet(ws, maintKpiTitleRow, 4, maintKpiTitleRow, 6, 'المقر الأعلى في الأعطال', {
    fill: C_GOLD_SOFT,
    font: { size: 9, bold: true, color: { argb: C_AMBER } },
    alignment: { horizontal: 'center', vertical: 'middle' },
    border: thinBorder(C_BORDER_GOLD),
  });
  mergeAndSet(
    ws,
    maintKpiValRow,
    4,
    maintKpiValRow,
    6,
    sites.length > 0
      ? {
          formula: `IF(${totalColLetter}${matrixFaultTotalsRow}=0,"لا توجد أعطال",INDEX(A${matrixSiteStartRow}:A${matrixSiteEndRow},MATCH(MAX(${totalColLetter}${matrixSiteStartRow}:${totalColLetter}${matrixSiteEndRow}),${totalColLetter}${matrixSiteStartRow}:${totalColLetter}${matrixSiteEndRow},0))&" ("&MAX(${totalColLetter}${matrixSiteStartRow}:${totalColLetter}${matrixSiteEndRow})&")")`,
          result: topFaultSite ? `${topFaultSite.nameAr} (${formatNumber(topFaultSite.count)})` : 'لا توجد أعطال',
        }
      : 'لا توجد أعطال',
    {
      fill: C_GOLD_SOFT,
      font: { size: 10, bold: true, color: { argb: C_NAVY } },
      alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
      border: thinBorder(C_BORDER_GOLD),
    }
  );

  mergeAndSet(ws, maintKpiTitleRow, 7, maintKpiTitleRow, 10, 'إجمالي التكلفة / النثرية (AED)', {
    fill: C_EMERALD_SOFT,
    font: { size: 9, bold: true, color: { argb: C_EMERALD } },
    alignment: { horizontal: 'center', vertical: 'middle' },
    border: thinBorder('FF8FD4C1'),
  });
  mergeAndSet(
    ws,
    maintKpiValRow,
    7,
    maintKpiValRow,
    10,
    {
      formula: `${totalColLetter}${pettyRow}`,
      result: metrics.maintenance.pettyCashTotalAed,
    },
    {
      fill: C_EMERALD_SOFT,
      font: { size: 11.5, bold: true, color: { argb: C_EMERALD } },
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: thinBorder('FF8FD4C1'),
      numFmt: '#,##0.00 "AED"',
    }
  );

  mergeAndSet(ws, maintKpiTitleRow, 11, maintKpiTitleRow, TOTAL_COLS, 'إجمالي التكلفة / أمر شراء (AED)', {
    fill: C_SKY_SOFT,
    font: { size: 9, bold: true, color: { argb: C_BLUE } },
    alignment: { horizontal: 'center', vertical: 'middle' },
    border: thinBorder(),
  });
  mergeAndSet(
    ws,
    maintKpiValRow,
    11,
    maintKpiValRow,
    TOTAL_COLS,
    {
      formula: `${totalColLetter}${poRow}`,
      result: metrics.maintenance.purchaseOrderTotalAed,
    },
    {
      fill: C_SKY_SOFT,
      font: { size: 11.5, bold: true, color: { argb: C_BLUE } },
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: thinBorder(),
      numFmt: '#,##0.00 "AED"',
    }
  );

  // Link Ops Strip Card 1 to grandTotalFaults cell
  ws.getCell(ops1ValRow, ops1Cols[0][1]).value = {
    formula: `${totalColLetter}${matrixFaultTotalsRow}`,
    result: metrics.maintenance.grandTotalFaults,
  };

  // Embed Maintenance Comparison Horizontal Bar Chart PNG right below Section 6 matrix!
  const maintChartStartRow = rowIdx;
  const maintChartSpanRows = Math.max(8, Math.ceil((maintBarImg.height / 28) * 0.55));
  for (let i = 0; i < maintChartSpanRows; i++) {
    setRowH(rowIdx++, 22);
  }
  const maintChartEndRow = rowIdx - 1;
  mergeAndSet(ws, maintChartStartRow, 1, maintChartEndRow, TOTAL_COLS, '', {
    fill: C_WHITE,
    border: thinBorder(),
  });
  placeImageInBox(wb, ws, colWidths, rowHeights, maintBarImg, {
    colStart: 1,
    colEnd: TOTAL_COLS,
    rowStart: maintChartStartRow,
    rowEnd: maintChartEndRow,
    paddingPx: 6,
  });

  setRowH(rowIdx, 8);
  rowIdx++;

  // ===========================================================================
  // 7. خدمات الصيانة (مصادر الطلبات) · Maintenance Services Sources (+ Donut PNG)
  // ===========================================================================
  addCorporateSectionBanner(
    ws,
    rowHeights,
    rowIdx++,
    TOTAL_COLS,
    '7. خدمات الصيانة (مصادر الطلبات)',
    'Maintenance Services Sources'
  );

  const sec7HeadRow = rowIdx++;
  setRowH(sec7HeadRow, 22);
  mergeAndSet(ws, sec7HeadRow, 1, sec7HeadRow, 4, 'مصدر طلب الصيانة', {
    fill: C_NAVY,
    font: { size: 9.5, bold: true, color: { argb: C_WHITE } },
    alignment: { horizontal: 'right', vertical: 'middle' },
    border: thinBorder(),
  });
  mergeAndSet(ws, sec7HeadRow, 5, sec7HeadRow, 5, 'العدد', {
    fill: C_NAVY,
    font: { size: 9.5, bold: true, color: { argb: C_WHITE } },
    alignment: { horizontal: 'center', vertical: 'middle' },
    border: thinBorder(),
  });
  mergeAndSet(ws, sec7HeadRow, 6, sec7HeadRow, 6, 'النسبة %', {
    fill: C_NAVY,
    font: { size: 9.5, bold: true, color: { argb: C_WHITE } },
    alignment: { horizontal: 'center', vertical: 'middle' },
    border: thinBorder(),
  });
  mergeAndSet(ws, sec7HeadRow, 7, sec7HeadRow, TOTAL_COLS, 'توزيع مصادر طلبات الصيانة (رسم بياني)', {
    fill: C_BLUE,
    font: { size: 9.5, bold: true, color: { argb: C_GOLD_LIGHT } },
    alignment: { horizontal: 'center', vertical: 'middle' },
    border: thinBorder(),
  });

  const maintFromFM = report.maintenanceServices.fromFacilitiesDept || 0;
  const maintFromOther = report.maintenanceServices.fromOtherDepts || 0;
  const maintTotal = maintFromFM + maintFromOther;

  const sec7StartRow = rowIdx;
  const sec7FmRow = sec7StartRow;
  const sec7OtherRow = sec7StartRow + 1;
  const sec7TotRow = sec7StartRow + 2;
  const sec7EndRow = sec7StartRow + 5;
  for (let r = sec7StartRow; r <= sec7EndRow; r++) {
    setRowH(r, 24);
  }
  rowIdx = sec7EndRow + 1;

  mergeAndSet(ws, sec7FmRow, 1, sec7FmRow, 4, 'عدد طلبات الصيانة الواردة من قسم المرافق', {
    fill: C_WHITE,
    font: { size: 9.5, bold: true, color: { argb: C_NAVY } },
    alignment: { horizontal: 'right', vertical: 'middle', wrapText: true },
    border: thinBorder(),
  });
  mergeAndSet(ws, sec7FmRow, 5, sec7FmRow, 5, maintFromFM, {
    fill: C_WHITE,
    font: { size: 10.5, bold: true, color: { argb: C_BLUE } },
    alignment: { horizontal: 'center', vertical: 'middle' },
    border: thinBorder(),
    numFmt: '#,##0',
  });
  mergeAndSet(
    ws,
    sec7FmRow,
    6,
    sec7FmRow,
    6,
    { formula: `IF(E${sec7TotRow}=0,0,E${sec7FmRow}/E${sec7TotRow})`, result: maintTotal > 0 ? maintFromFM / maintTotal : 0 },
    {
      fill: C_WHITE,
      font: { size: 10, bold: true, color: { argb: C_TEXT_MUTED } },
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: thinBorder(),
      numFmt: '0.0%',
    }
  );

  mergeAndSet(ws, sec7OtherRow, 1, sec7OtherRow, 4, 'عدد طلبات الصيانة الواردة من الإدارات الأخرى', {
    fill: C_SLATE_ALT,
    font: { size: 9.5, bold: true, color: { argb: C_NAVY } },
    alignment: { horizontal: 'right', vertical: 'middle', wrapText: true },
    border: thinBorder(),
  });
  mergeAndSet(ws, sec7OtherRow, 5, sec7OtherRow, 5, maintFromOther, {
    fill: C_SLATE_ALT,
    font: { size: 10.5, bold: true, color: { argb: C_AMBER } },
    alignment: { horizontal: 'center', vertical: 'middle' },
    border: thinBorder(),
    numFmt: '#,##0',
  });
  mergeAndSet(
    ws,
    sec7OtherRow,
    6,
    sec7OtherRow,
    6,
    { formula: `IF(E${sec7TotRow}=0,0,E${sec7OtherRow}/E${sec7TotRow})`, result: maintTotal > 0 ? maintFromOther / maintTotal : 0 },
    {
      fill: C_SLATE_ALT,
      font: { size: 10, bold: true, color: { argb: C_TEXT_MUTED } },
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: thinBorder(),
      numFmt: '0.0%',
    }
  );

  mergeAndSet(ws, sec7TotRow, 1, sec7TotRow, 4, 'الإجمالي · Total', {
    fill: C_NAVY,
    font: { size: 10, bold: true, color: { argb: C_WHITE } },
    alignment: { horizontal: 'right', vertical: 'middle' },
    border: thinBorder(),
  });
  mergeAndSet(
    ws,
    sec7TotRow,
    5,
    sec7TotRow,
    5,
    { formula: `SUM(E${sec7FmRow}:E${sec7OtherRow})`, result: maintTotal },
    {
      fill: C_NAVY,
      font: { size: 10.5, bold: true, color: { argb: C_GOLD_LIGHT } },
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: thinBorder(),
      numFmt: '#,##0',
    }
  );
  mergeAndSet(
    ws,
    sec7TotRow,
    6,
    sec7TotRow,
    6,
    { formula: `IF(E${sec7TotRow}=0,0,1)`, result: maintTotal > 0 ? 1 : 0 },
    {
      fill: C_NAVY,
      font: { size: 10, bold: true, color: { argb: C_WHITE } },
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: thinBorder(),
      numFmt: '0.0%',
    }
  );

  // Fill remaining cells under left half of Sec 7 cleanly
  mergeAndSet(
    ws,
    sec7TotRow + 1,
    1,
    sec7EndRow,
    6,
    `مؤشر التكامل: إجمالي طلبات مصادر الصيانة = ${formatNumber(maintTotal)} | إجمالي أعطال المقرات = ${formatNumber(metrics.maintenance.grandTotalFaults)}`,
    {
      fill: C_SLATE_ALT,
      font: { size: 9, bold: true, color: { argb: C_TEXT_MUTED } },
      alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
      border: thinBorder(),
    }
  );

  // Embed Sec 7 Donut Chart PNG in Cols 7..TOTAL_COLS
  mergeAndSet(ws, sec7StartRow, 7, sec7EndRow, TOTAL_COLS, '', {
    fill: C_WHITE,
    border: thinBorder(),
  });
  placeImageInBox(wb, ws, colWidths, rowHeights, maintSourcesDonutImg, {
    colStart: 7,
    colEnd: TOTAL_COLS,
    rowStart: sec7StartRow,
    rowEnd: sec7EndRow,
    paddingPx: 4,
  });

  // Link Ops Strip Card 2 to Sec 7 total
  ws.getCell(ops1ValRow, ops1Cols[1][1]).value = {
    formula: `E${sec7TotRow}`,
    result: maintTotal,
  };

  setRowH(rowIdx, 8);
  rowIdx++;

  // ===========================================================================
  // 8. الدعم اللوجستي · Logistics Channels (+ Descending Horizontal Bar Chart PNG)
  // ===========================================================================
  addCorporateSectionBanner(
    ws,
    rowHeights,
    rowIdx++,
    TOTAL_COLS,
    '8. الدعم اللوجستي',
    'Logistics Channels'
  );

  const sec8HeadRow = rowIdx++;
  setRowH(sec8HeadRow, 22);
  mergeAndSet(ws, sec8HeadRow, 1, sec8HeadRow, 1, '#', {
    fill: C_NAVY,
    font: { size: 9.5, bold: true, color: { argb: C_WHITE } },
    alignment: { horizontal: 'center', vertical: 'middle' },
    border: thinBorder(),
  });
  mergeAndSet(ws, sec8HeadRow, 2, sec8HeadRow, 3, 'قناة الدعم', {
    fill: C_NAVY,
    font: { size: 9.5, bold: true, color: { argb: C_WHITE } },
    alignment: { horizontal: 'right', vertical: 'middle' },
    border: thinBorder(),
  });
  mergeAndSet(ws, sec8HeadRow, 4, sec8HeadRow, 4, 'الطلبات', {
    fill: C_NAVY,
    font: { size: 9.5, bold: true, color: { argb: C_WHITE } },
    alignment: { horizontal: 'center', vertical: 'middle' },
    border: thinBorder(),
  });
  mergeAndSet(ws, sec8HeadRow, 5, sec8HeadRow, 5, 'النسبة %', {
    fill: C_NAVY,
    font: { size: 9.5, bold: true, color: { argb: C_WHITE } },
    alignment: { horizontal: 'center', vertical: 'middle' },
    border: thinBorder(),
  });
  mergeAndSet(ws, sec8HeadRow, 6, sec8HeadRow, TOTAL_COLS, 'التوزيع التنازلي لقنوات الدعم اللوجستي (رسم بياني)', {
    fill: C_BLUE,
    font: { size: 9.5, bold: true, color: { argb: C_GOLD_LIGHT } },
    alignment: { horizontal: 'center', vertical: 'middle' },
    border: thinBorder(),
  });

  const sec8StartRow = rowIdx;
  const sec8TotRow = sec8StartRow + metrics.logisticsWithPct.length;
  const sec8ChartNeededRows = Math.max(metrics.logisticsWithPct.length + 1, 8);
  const sec8EndRow = sec8StartRow + sec8ChartNeededRows - 1;
  for (let r = sec8StartRow; r <= sec8EndRow; r++) {
    setRowH(r, 23);
  }
  rowIdx = sec8EndRow + 1;

  metrics.logisticsWithPct.forEach((l, idx) => {
    const r = sec8StartRow + idx;
    const altFill = idx % 2 === 1 ? C_SLATE_ALT : C_WHITE;
    mergeAndSet(ws, r, 1, r, 1, idx + 1, {
      fill: altFill,
      font: { size: 9, bold: true, color: { argb: C_TEXT_MUTED } },
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: thinBorder(),
      numFmt: '#,##0',
    });
    mergeAndSet(ws, r, 2, r, 3, l.nameAr, {
      fill: altFill,
      font: { size: 9.5, bold: true, color: { argb: C_NAVY } },
      alignment: { horizontal: 'right', vertical: 'middle' },
      border: thinBorder(),
    });
    mergeAndSet(ws, r, 4, r, 4, l.requestCount, {
      fill: altFill,
      font: { size: 10, bold: true, color: { argb: C_NAVY } },
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: thinBorder(),
      numFmt: '#,##0',
    });
    mergeAndSet(
      ws,
      r,
      5,
      r,
      5,
      {
        formula: `IF(D${sec8TotRow}=0,0,D${r}/D${sec8TotRow})`,
        result: l.sharePct != null ? l.sharePct / 100 : 0,
      },
      {
        fill: altFill,
        font: { size: 9.5, bold: true, color: { argb: C_ACCENT_BLUE } },
        alignment: { horizontal: 'center', vertical: 'middle' },
        border: thinBorder(),
        numFmt: '0.0%',
      }
    );
  });

  mergeAndSet(ws, sec8TotRow, 1, sec8TotRow, 3, 'الإجمالي · Total', {
    fill: C_NAVY,
    font: { size: 10, bold: true, color: { argb: C_WHITE } },
    alignment: { horizontal: 'right', vertical: 'middle' },
    border: thinBorder(),
  });
  mergeAndSet(
    ws,
    sec8TotRow,
    4,
    sec8TotRow,
    4,
    metrics.logisticsWithPct.length > 0
      ? { formula: `SUM(D${sec8StartRow}:D${sec8TotRow - 1})`, result: metrics.logisticsTotal }
      : 0,
    {
      fill: C_NAVY,
      font: { size: 10, bold: true, color: { argb: C_GOLD_LIGHT } },
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: thinBorder(),
      numFmt: '#,##0',
    }
  );
  mergeAndSet(
    ws,
    sec8TotRow,
    5,
    sec8TotRow,
    5,
    { formula: `IF(D${sec8TotRow}=0,0,1)`, result: metrics.logisticsTotal > 0 ? 1 : 0 },
    {
      fill: C_NAVY,
      font: { size: 10, bold: true, color: { argb: C_EMERALD_SOFT } },
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: thinBorder(),
      numFmt: '0.0%',
    }
  );
  if (sec8TotRow < sec8EndRow) {
    mergeAndSet(ws, sec8TotRow + 1, 1, sec8EndRow, 5, '', {
      fill: C_SLATE_ALT,
      border: thinBorder(),
    });
  }

  // Embed Sec 8 Descending Logistics Chart PNG
  mergeAndSet(ws, sec8StartRow, 6, sec8EndRow, TOTAL_COLS, '', {
    fill: C_WHITE,
    border: thinBorder(),
  });
  placeImageInBox(wb, ws, colWidths, rowHeights, logisticsBarImg, {
    colStart: 6,
    colEnd: TOTAL_COLS,
    rowStart: sec8StartRow,
    rowEnd: sec8EndRow,
    paddingPx: 4,
  });

  // Link Ops Strip Card 3 to Sec 8 total
  ws.getCell(ops1ValRow, ops1Cols[2][1]).value = {
    formula: `D${sec8TotRow}`,
    result: metrics.logisticsTotal,
  };

  setRowH(rowIdx, 8);
  rowIdx++;

  // ===========================================================================
  // 9. خدمات الأمن والاستقبال · Security & Reception Services Matrix
  // ===========================================================================
  addCorporateSectionBanner(
    ws,
    rowHeights,
    rowIdx++,
    TOTAL_COLS,
    '9. خدمات الأمن والاستقبال',
    'Security & Reception Services Matrix'
  );

  const sec9HeadRow = rowIdx++;
  setRowH(sec9HeadRow, 22);
  mergeAndSet(ws, sec9HeadRow, 1, sec9HeadRow, 1, '#', {
    fill: C_NAVY,
    font: { size: 9.5, bold: true, color: { argb: C_WHITE } },
    alignment: { horizontal: 'center', vertical: 'middle' },
    border: thinBorder(),
  });
  mergeAndSet(ws, sec9HeadRow, 2, sec9HeadRow, 5, 'النشاط / الخدمة · Activity', {
    fill: C_NAVY,
    font: { size: 9.5, bold: true, color: { argb: C_WHITE } },
    alignment: { horizontal: 'right', vertical: 'middle' },
    border: thinBorder(),
  });
  mergeAndSet(ws, sec9HeadRow, 6, sec9HeadRow, 8, 'التسمية الإنجليزية', {
    fill: C_NAVY,
    font: { size: 9, bold: true, color: { argb: C_GOLD_LIGHT } },
    alignment: { horizontal: 'center', vertical: 'middle' },
    border: thinBorder(),
  });
  mergeAndSet(ws, sec9HeadRow, 9, sec9HeadRow, 10, 'الطلبات المستلمة', {
    fill: C_NAVY,
    font: { size: 9.5, bold: true, color: { argb: C_WHITE } },
    alignment: { horizontal: 'center', vertical: 'middle' },
    border: thinBorder(),
  });
  mergeAndSet(ws, sec9HeadRow, 11, sec9HeadRow, 12, 'الطلبات المنفذة', {
    fill: C_NAVY,
    font: { size: 9.5, bold: true, color: { argb: C_WHITE } },
    alignment: { horizontal: 'center', vertical: 'middle' },
    border: thinBorder(),
  });
  mergeAndSet(ws, sec9HeadRow, 13, sec9HeadRow, TOTAL_COLS, 'نسبة الإنجاز %', {
    fill: C_NAVY,
    font: { size: 9.5, bold: true, color: { argb: C_WHITE } },
    alignment: { horizontal: 'center', vertical: 'middle' },
    border: thinBorder(),
  });

  const sec9StartRow = rowIdx;
  metrics.securityWithPct.forEach((sr, idx) => {
    const r = rowIdx++;
    setRowH(r, 21);
    const altFill = idx % 2 === 1 ? C_SLATE_ALT : C_WHITE;
    mergeAndSet(ws, r, 1, r, 1, idx + 1, {
      fill: altFill,
      font: { size: 9, bold: true, color: { argb: C_TEXT_MUTED } },
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: thinBorder(),
      numFmt: '#,##0',
    });
    mergeAndSet(ws, r, 2, r, 5, sr.nameAr, {
      fill: altFill,
      font: { size: 9.5, bold: true, color: { argb: C_NAVY } },
      alignment: { horizontal: 'right', vertical: 'middle' },
      border: thinBorder(),
    });
    mergeAndSet(ws, r, 6, r, 8, sr.nameEn || '—', {
      fill: altFill,
      font: { size: 9, color: { argb: C_TEXT_MUTED } },
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: thinBorder(),
    });
    mergeAndSet(ws, r, 9, r, 10, sr.receivedCount, {
      fill: altFill,
      font: { size: 10, bold: true, color: { argb: C_NAVY } },
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: thinBorder(),
      numFmt: '#,##0',
    });
    mergeAndSet(ws, r, 11, r, 12, sr.executedCount, {
      fill: C_EMERALD_SOFT,
      font: { size: 10, bold: true, color: { argb: C_EMERALD } },
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: thinBorder(),
      numFmt: '#,##0',
    });
    mergeAndSet(
      ws,
      r,
      13,
      r,
      TOTAL_COLS,
      {
        formula: `IF(I${r}=0,"—",K${r}/I${r})`,
        result: sr.completionPct != null ? sr.completionPct / 100 : '—',
      },
      {
        fill: altFill,
        font: { size: 9.5, bold: true, color: { argb: C_ACCENT_BLUE } },
        alignment: { horizontal: 'center', vertical: 'middle' },
        border: thinBorder(),
        numFmt: '0.0%',
      }
    );
  });

  const sec9TotRow = rowIdx++;
  setRowH(sec9TotRow, 23);
  mergeAndSet(
    ws,
    sec9TotRow,
    1,
    sec9TotRow,
    8,
    `الإجمالي (${formatNumber(metrics.securityWithPct.length)} أنشطة) · Security & Reception Total`,
    {
      fill: C_NAVY,
      font: { size: 10, bold: true, color: { argb: C_WHITE } },
      alignment: { horizontal: 'right', vertical: 'middle' },
      border: thinBorder(),
    }
  );
  mergeAndSet(
    ws,
    sec9TotRow,
    9,
    sec9TotRow,
    10,
    metrics.securityWithPct.length > 0
      ? { formula: `SUM(I${sec9StartRow}:I${sec9TotRow - 1})`, result: metrics.securityTotals.totalReceived }
      : 0,
    {
      fill: C_NAVY,
      font: { size: 10, bold: true, color: { argb: C_GOLD_LIGHT } },
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: thinBorder(),
      numFmt: '#,##0',
    }
  );
  mergeAndSet(
    ws,
    sec9TotRow,
    11,
    sec9TotRow,
    12,
    metrics.securityWithPct.length > 0
      ? { formula: `SUM(K${sec9StartRow}:K${sec9TotRow - 1})`, result: metrics.securityTotals.totalExecuted }
      : 0,
    {
      fill: C_NAVY,
      font: { size: 10, bold: true, color: { argb: 'FF6EE7B7' } },
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: thinBorder(),
      numFmt: '#,##0',
    }
  );
  mergeAndSet(
    ws,
    sec9TotRow,
    13,
    sec9TotRow,
    TOTAL_COLS,
    {
      formula: `IF(I${sec9TotRow}=0,"—",K${sec9TotRow}/I${sec9TotRow})`,
      result: metrics.securityTotals.overallCompletionPct != null ? metrics.securityTotals.overallCompletionPct / 100 : '—',
    },
    {
      fill: C_NAVY,
      font: { size: 10, bold: true, color: { argb: C_GOLD_LIGHT } },
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: thinBorder(),
      numFmt: '0.0%',
    }
  );

  // Link Ops Strip Card 4 to Sec 9 overall completion pct
  ws.getCell(ops1ValRow, ops1Cols[3][1]).value = {
    formula: `IF(I${sec9TotRow}=0,0,K${sec9TotRow}/I${sec9TotRow})`,
    result:
      metrics.securityTotals.overallCompletionPct != null
        ? metrics.securityTotals.overallCompletionPct / 100
        : 0,
  };

  setRowH(rowIdx, 8);
  rowIdx++;

  // ===========================================================================
  // 10. المهام التشغيلية والمتابعة · Operational Tasks & Milestones
  // ===========================================================================
  addCorporateSectionBanner(
    ws,
    rowHeights,
    rowIdx++,
    TOTAL_COLS,
    '10. المهام التشغيلية والمتابعة',
    'Operational Tasks & Milestones'
  );

  const sec10HeadRow = rowIdx++;
  setRowH(sec10HeadRow, 22);
  mergeAndSet(ws, sec10HeadRow, 1, sec10HeadRow, 1, '#', {
    fill: C_NAVY,
    font: { size: 9.5, bold: true, color: { argb: C_WHITE } },
    alignment: { horizontal: 'center', vertical: 'middle' },
    border: thinBorder(),
  });
  mergeAndSet(ws, sec10HeadRow, 2, sec10HeadRow, 4, 'الموضوع · Subject', {
    fill: C_NAVY,
    font: { size: 9.5, bold: true, color: { argb: C_WHITE } },
    alignment: { horizontal: 'right', vertical: 'middle' },
    border: thinBorder(),
  });
  mergeAndSet(ws, sec10HeadRow, 5, sec10HeadRow, 10, 'المهمة · Task Description', {
    fill: C_NAVY,
    font: { size: 9.5, bold: true, color: { argb: C_WHITE } },
    alignment: { horizontal: 'right', vertical: 'middle' },
    border: thinBorder(),
  });
  mergeAndSet(ws, sec10HeadRow, 11, sec10HeadRow, 12, 'الحالة', {
    fill: C_NAVY,
    font: { size: 9.5, bold: true, color: { argb: C_WHITE } },
    alignment: { horizontal: 'center', vertical: 'middle' },
    border: thinBorder(),
  });
  mergeAndSet(ws, sec10HeadRow, 13, sec10HeadRow, 13, 'نسبة الإنجاز %', {
    fill: C_NAVY,
    font: { size: 9.5, bold: true, color: { argb: C_WHITE } },
    alignment: { horizontal: 'center', vertical: 'middle' },
    border: thinBorder(),
  });
  mergeAndSet(ws, sec10HeadRow, 14, sec10HeadRow, TOTAL_COLS, 'مؤشر الإنجاز', {
    fill: C_NAVY,
    font: { size: 9.5, bold: true, color: { argb: C_GOLD_LIGHT } },
    alignment: { horizontal: 'center', vertical: 'middle' },
    border: thinBorder(),
  });

  const topicW = colWidths.slice(1, 4).reduce((a, b) => a + b, 0);
  const taskW = colWidths.slice(4, 10).reduce((a, b) => a + b, 0);
  const sec10StartRow = rowIdx;

  if (report.tasks.length === 0) {
    const r = rowIdx++;
    setRowH(r, 24);
    mergeAndSet(ws, r, 1, r, TOTAL_COLS, 'لا توجد مهام تشغيلية مسجلة في هذه الفترة.', {
      fill: C_SLATE_ALT,
      font: { size: 9.5, color: { argb: C_TEXT_MUTED } },
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: thinBorder(),
    });
  } else {
    report.tasks.forEach((t, idx) => {
      const r = rowIdx++;
      const topicTxt = t.topic || '—';
      const taskTxt = t.taskName || '—';
      setRowH(
        r,
        estimateWrappedRowHeight(
          [
            { text: topicTxt, widthChars: topicW, fontSize: 9.5 },
            { text: taskTxt, widthChars: taskW, fontSize: 9.5 },
          ],
          24,
          10
        )
      );

      const altFill = idx % 2 === 1 ? C_SLATE_ALT : C_WHITE;
      const pctNum = Math.min(100, Math.max(0, Number(t.completionPct) || 0)) / 100;
      const stFill =
        t.status === 'completed'
          ? C_EMERALD_SOFT
          : t.status === 'in_progress'
            ? C_AMBER_SOFT
            : t.status === 'delayed'
              ? C_CRIMSON_SOFT
              : C_SLATE_ALT;
      const stColor =
        t.status === 'completed'
          ? C_EMERALD
          : t.status === 'in_progress'
            ? C_AMBER
            : t.status === 'delayed'
              ? C_CRIMSON
              : C_TEXT_MUTED;

      mergeAndSet(ws, r, 1, r, 1, idx + 1, {
        fill: altFill,
        font: { size: 9.5, bold: true, color: { argb: C_TEXT_MUTED } },
        alignment: { horizontal: 'center', vertical: 'middle' },
        border: thinBorder(),
        numFmt: '#,##0',
      });
      mergeAndSet(ws, r, 2, r, 4, topicTxt, {
        fill: altFill,
        font: { size: 9.5, bold: true, color: { argb: C_NAVY } },
        alignment: { horizontal: 'right', vertical: 'middle', wrapText: true },
        border: thinBorder(),
      });
      mergeAndSet(ws, r, 5, r, 10, taskTxt, {
        fill: altFill,
        font: { size: 9.5, color: { argb: C_NAVY } },
        alignment: { horizontal: 'right', vertical: 'middle', wrapText: true },
        border: thinBorder(),
      });
      mergeAndSet(ws, r, 11, r, 12, TASK_STATUS_LABELS_AR[t.status], {
        fill: stFill,
        font: { size: 9.5, bold: true, color: { argb: stColor } },
        alignment: { horizontal: 'center', vertical: 'middle' },
        border: thinBorder(),
      });
      mergeAndSet(ws, r, 13, r, 13, pctNum, {
        fill: altFill,
        font: { size: 10, bold: true, color: { argb: C_NAVY } },
        alignment: { horizontal: 'center', vertical: 'middle' },
        border: thinBorder(),
        numFmt: '0.0%',
      });
      const filledBlocks = Math.round(pctNum * 10);
      const barText = `${'■'.repeat(filledBlocks)}${'□'.repeat(Math.max(0, 10 - filledBlocks))}`;
      mergeAndSet(
        ws,
        r,
        14,
        r,
        TOTAL_COLS,
        {
          formula: `REPT("■",ROUND(M${r}*10,0))&REPT("□",MAX(0,10-ROUND(M${r}*10,0)))`,
          result: barText,
        },
        {
          fill: altFill,
          font: { size: 9.5, bold: true, color: { argb: pctNum >= 0.9 ? C_EMERALD : pctNum >= 0.5 ? C_ACCENT_BLUE : C_AMBER } },
          alignment: { horizontal: 'center', vertical: 'middle' },
          border: thinBorder(),
        }
      );
    });

    const sec10TotRow = rowIdx++;
    setRowH(sec10TotRow, 22);
    mergeAndSet(
      ws,
      sec10TotRow,
      1,
      sec10TotRow,
      12,
      `متوسط نسبة إنجاز المهام (${formatNumber(report.tasks.length)} مهام) · Average Completion`,
      {
        fill: C_NAVY,
        font: { size: 9.5, bold: true, color: { argb: C_WHITE } },
        alignment: { horizontal: 'right', vertical: 'middle' },
        border: thinBorder(),
      }
    );
    mergeAndSet(
      ws,
      sec10TotRow,
      13,
      sec10TotRow,
      13,
      {
        formula: `AVERAGE(M${sec10StartRow}:M${sec10TotRow - 1})`,
        result: metrics.tasksSummary.avgCompletionPct != null ? metrics.tasksSummary.avgCompletionPct / 100 : 0,
      },
      {
        fill: C_NAVY,
        font: { size: 10, bold: true, color: { argb: C_GOLD_LIGHT } },
        alignment: { horizontal: 'center', vertical: 'middle' },
        border: thinBorder(),
        numFmt: '0.0%',
      }
    );
    mergeAndSet(
      ws,
      sec10TotRow,
      14,
      sec10TotRow,
      TOTAL_COLS,
      `${formatNumber(metrics.tasksSummary.completed)} مكتملة / ${formatNumber(metrics.tasksSummary.totalMeaningful)}`,
      {
        fill: C_NAVY,
        font: { size: 8.5, bold: true, color: { argb: C_GOLD_LIGHT } },
        alignment: { horizontal: 'center', vertical: 'middle' },
        border: thinBorder(),
      }
    );
  }

  setRowH(rowIdx, 8);
  rowIdx++;

  // ===========================================================================
  // 11. التحديات والتوصيات · Challenges & Executive Recommendations
  // ===========================================================================
  addCorporateSectionBanner(
    ws,
    rowHeights,
    rowIdx++,
    TOTAL_COLS,
    '11. التحديات والتوصيات',
    'Challenges & Executive Recommendations'
  );

  const sec11HeadRow = rowIdx++;
  setRowH(sec11HeadRow, 22);
  mergeAndSet(ws, sec11HeadRow, 1, sec11HeadRow, 1, '#', {
    fill: C_NAVY,
    font: { size: 9.5, bold: true, color: { argb: C_WHITE } },
    alignment: { horizontal: 'center', vertical: 'middle' },
    border: thinBorder(),
  });
  mergeAndSet(ws, sec11HeadRow, 2, sec11HeadRow, 5, 'التحديات والعوائق · Challenges', {
    fill: C_NAVY,
    font: { size: 9.5, bold: true, color: { argb: C_WHITE } },
    alignment: { horizontal: 'right', vertical: 'middle' },
    border: thinBorder(),
  });
  mergeAndSet(ws, sec11HeadRow, 6, sec11HeadRow, 9, 'التحديث والإجراءات المتخذة · Updates', {
    fill: C_NAVY,
    font: { size: 9.5, bold: true, color: { argb: C_WHITE } },
    alignment: { horizontal: 'right', vertical: 'middle' },
    border: thinBorder(),
  });
  mergeAndSet(ws, sec11HeadRow, 10, sec11HeadRow, TOTAL_COLS, 'التوصية التنفيذية · Recommendation', {
    fill: C_NAVY,
    font: { size: 9.5, bold: true, color: { argb: C_WHITE } },
    alignment: { horizontal: 'right', vertical: 'middle' },
    border: thinBorder(),
  });

  const chW = colWidths.slice(1, 5).reduce((a, b) => a + b, 0);
  const upW = colWidths.slice(5, 9).reduce((a, b) => a + b, 0);
  const recW = colWidths.slice(9, TOTAL_COLS).reduce((a, b) => a + b, 0);

  if (report.challenges.length === 0) {
    const r = rowIdx++;
    setRowH(r, 24);
    mergeAndSet(ws, r, 1, r, TOTAL_COLS, 'لا توجد تحديات أو توصيات مسجلة في هذه الفترة.', {
      fill: C_SLATE_ALT,
      font: { size: 9.5, color: { argb: C_TEXT_MUTED } },
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: thinBorder(),
    });
  } else {
    report.challenges.forEach((ch, idx) => {
      const r = rowIdx++;
      const chTxt = ch.challengeText || '—';
      const upTxt = ch.updateText || '—';
      const recTxt = ch.recommendationText || '—';
      setRowH(
        r,
        estimateWrappedRowHeight(
          [
            { text: chTxt, widthChars: chW, fontSize: 9.5 },
            { text: upTxt, widthChars: upW, fontSize: 9.5 },
            { text: recTxt, widthChars: recW, fontSize: 9.5 },
          ],
          28,
          12
        )
      );
      const altFill = idx % 2 === 1 ? C_SLATE_ALT : C_WHITE;

      mergeAndSet(ws, r, 1, r, 1, idx + 1, {
        fill: altFill,
        font: { size: 9.5, bold: true, color: { argb: C_TEXT_MUTED } },
        alignment: { horizontal: 'center', vertical: 'top' },
        border: thinBorder(),
        numFmt: '#,##0',
      });
      mergeAndSet(ws, r, 2, r, 5, chTxt, {
        fill: altFill,
        font: { size: 9.5, bold: true, color: { argb: C_AMBER } },
        alignment: { horizontal: 'right', vertical: 'top', wrapText: true },
        border: thinBorder(),
      });
      mergeAndSet(ws, r, 6, r, 9, upTxt, {
        fill: altFill,
        font: { size: 9.5, color: { argb: C_NAVY } },
        alignment: { horizontal: 'right', vertical: 'top', wrapText: true },
        border: thinBorder(),
      });
      mergeAndSet(ws, r, 10, r, TOTAL_COLS, recTxt, {
        fill: altFill,
        font: { size: 9.5, bold: true, color: { argb: C_NAVY } },
        alignment: { horizontal: 'right', vertical: 'top', wrapText: true },
        border: thinBorder(),
      });
    });
  }

  setRowH(rowIdx, 8);
  rowIdx++;

  // ===========================================================================
  // 12. الإعداد والمراجعة والاعتماد الرسمي · Preparation, Review & Official Approval
  // ===========================================================================
  addCorporateSectionBanner(
    ws,
    rowHeights,
    rowIdx++,
    TOTAL_COLS,
    '12. الإعداد والمراجعة والاعتماد الرسمي',
    'Preparation, Review & Official Approval'
  );

  const halfSplit = Math.floor(TOTAL_COLS / 2); // default 7 (Cols 1..7 Preparer, Cols 8..14 Approver)
  const sigHeadRow = rowIdx++;
  setRowH(sigHeadRow, 22);
  mergeAndSet(ws, sigHeadRow, 1, sigHeadRow, halfSplit, 'أولاً: إعداد التقرير · Report Preparation', {
    fill: C_BLUE,
    font: { size: 10, bold: true, color: { argb: C_GOLD_LIGHT } },
    alignment: { horizontal: 'right', vertical: 'middle' },
    border: mediumGoldBoxBorder(C_GOLD),
  });
  mergeAndSet(
    ws,
    sigHeadRow,
    halfSplit + 1,
    sigHeadRow,
    TOTAL_COLS,
    'ثانياً: اعتماد التقرير · Executive Approval',
    {
      fill: C_BLUE,
      font: { size: 10, bold: true, color: { argb: C_GOLD_LIGHT } },
      alignment: { horizontal: 'right', vertical: 'middle' },
      border: mediumGoldBoxBorder(C_GOLD),
    }
  );

  const sigRow1 = rowIdx;
  const sigRow2 = rowIdx + 1;
  const sigRow3 = rowIdx + 2;
  const sigRow4 = rowIdx + 3;
  setRowH(sigRow1, 20);
  setRowH(sigRow2, 20);
  setRowH(sigRow3, 20);
  setRowH(sigRow4, 22);
  rowIdx += 4;

  // Preparer Info (Cols 1..4) & Signature Box (Cols 5..halfSplit)
  mergeAndSet(ws, sigRow1, 1, sigRow1, 4, `الاسم الكامل: ${report.preparerName || '—'}`, {
    fill: C_SLATE_ALT,
    font: { size: 10, bold: true, color: { argb: C_NAVY } },
    alignment: { horizontal: 'right', vertical: 'middle' },
    border: thinBorder(),
  });
  mergeAndSet(ws, sigRow2, 1, sigRow2, 4, `المسمى الوظيفي: ${report.preparerTitle || '—'}`, {
    fill: C_WHITE,
    font: { size: 9.5, bold: true, color: { argb: C_ACCENT_BLUE } },
    alignment: { horizontal: 'right', vertical: 'middle' },
    border: thinBorder(),
  });
  mergeAndSet(
    ws,
    sigRow3,
    1,
    sigRow3,
    4,
    `تاريخ الإعداد: ${formatDateWestern(report.preparedAt, 'قيد الإعداد')}${report.preparerSignedAt ? ` · وقت التوقيع: ${formatDateTimeWestern(report.preparerSignedAt)}` : ''}`,
    {
      fill: C_SLATE_ALT,
      font: { size: 8.5, color: { argb: C_TEXT_MUTED } },
      alignment: { horizontal: 'right', vertical: 'middle', wrapText: true },
      border: thinBorder(),
    }
  );
  mergeAndSet(
    ws,
    sigRow4,
    1,
    sigRow4,
    4,
    report.preparerSignatureImage ? 'حالة التوقيع: ✓ موقّع إلكترونياً' : 'حالة التوقيع: بانتظار التوقيع',
    {
      fill: report.preparerSignatureImage ? C_EMERALD_SOFT : C_AMBER_SOFT,
      font: { size: 9, bold: true, color: { argb: report.preparerSignatureImage ? C_EMERALD : C_AMBER } },
      alignment: { horizontal: 'right', vertical: 'middle' },
      border: thinBorder(),
    }
  );

  // Preparer Signature Image Area
  mergeAndSet(
    ws,
    sigRow1,
    5,
    sigRow3,
    halfSplit,
    assets.preparerSignature ? '' : 'لا يوجد توقيع مرفوع بعد',
    {
      fill: C_WHITE,
      font: { size: 9, color: { argb: C_TEXT_MUTED } },
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: thinBorder(),
    }
  );
  if (assets.preparerSignature) {
    placeImageInBox(wb, ws, colWidths, rowHeights, assets.preparerSignature, {
      colStart: 5,
      colEnd: halfSplit,
      rowStart: sigRow1,
      rowEnd: sigRow3,
      paddingPx: 4,
    });
  }
  mergeAndSet(ws, sigRow4, 5, sigRow4, halfSplit, 'التوقيع الرسمي لمعد التقرير', {
    fill: C_SLATE_ALT,
    font: { size: 8.5, bold: true, color: { argb: C_TEXT_MUTED } },
    alignment: { horizontal: 'center', vertical: 'middle' },
    border: thinBorder(),
  });

  // Approver Info (Cols halfSplit+1 .. TOTAL_COLS - 3) & Signature Box (TOTAL_COLS - 2 .. TOTAL_COLS)
  const appTextEndCol = TOTAL_COLS - 3;
  mergeAndSet(
    ws,
    sigRow1,
    halfSplit + 1,
    sigRow1,
    appTextEndCol,
    `الاسم الكامل: ${report.approverName || '—'}`,
    {
      fill: C_SLATE_ALT,
      font: { size: 10, bold: true, color: { argb: C_NAVY } },
      alignment: { horizontal: 'right', vertical: 'middle' },
      border: thinBorder(),
    }
  );
  mergeAndSet(
    ws,
    sigRow2,
    halfSplit + 1,
    sigRow2,
    appTextEndCol,
    `المسمى الوظيفي: ${report.approverTitle || '—'}`,
    {
      fill: C_WHITE,
      font: { size: 9.5, bold: true, color: { argb: C_ACCENT_BLUE } },
      alignment: { horizontal: 'right', vertical: 'middle' },
      border: thinBorder(),
    }
  );
  mergeAndSet(
    ws,
    sigRow3,
    halfSplit + 1,
    sigRow3,
    appTextEndCol,
    `تاريخ الاعتماد: ${formatDateWestern(report.approvedAt, 'بانتظار الاعتماد')}${report.approverSignedAt ? ` · وقت التوقيع: ${formatDateTimeWestern(report.approverSignedAt)}` : ''}`,
    {
      fill: C_SLATE_ALT,
      font: { size: 8.5, color: { argb: C_TEXT_MUTED } },
      alignment: { horizontal: 'right', vertical: 'middle', wrapText: true },
      border: thinBorder(),
    }
  );
  mergeAndSet(
    ws,
    sigRow4,
    halfSplit + 1,
    sigRow4,
    appTextEndCol,
    report.approverSignatureImage ? 'حالة التوقيع: ✓ موقّع إلكترونياً' : 'حالة التوقيع: بانتظار التوقيع',
    {
      fill: report.approverSignatureImage ? C_EMERALD_SOFT : C_AMBER_SOFT,
      font: { size: 9, bold: true, color: { argb: report.approverSignatureImage ? C_EMERALD : C_AMBER } },
      alignment: { horizontal: 'right', vertical: 'middle' },
      border: thinBorder(),
    }
  );

  // Approver Signature Image Area
  mergeAndSet(
    ws,
    sigRow1,
    appTextEndCol + 1,
    sigRow3,
    TOTAL_COLS,
    assets.approverSignature ? '' : 'بانتظار توقيع المعتمد',
    {
      fill: C_WHITE,
      font: { size: 9, color: { argb: C_TEXT_MUTED } },
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: thinBorder(),
    }
  );
  if (assets.approverSignature) {
    placeImageInBox(wb, ws, colWidths, rowHeights, assets.approverSignature, {
      colStart: appTextEndCol + 1,
      colEnd: TOTAL_COLS,
      rowStart: sigRow1,
      rowEnd: sigRow3,
      paddingPx: 4,
    });
  }
  mergeAndSet(ws, sigRow4, appTextEndCol + 1, sigRow4, TOTAL_COLS, 'التوقيع الرسمي لمعتمد التقرير', {
    fill: C_SLATE_ALT,
    font: { size: 8.5, bold: true, color: { argb: C_TEXT_MUTED } },
    alignment: { horizontal: 'center', vertical: 'middle' },
    border: thinBorder(),
  });

  // Reviewer Row (if reviewer assigned or reviewedAt exists)
  const reviewerRow = rowIdx++;
  setRowH(reviewerRow, 20);
  mergeAndSet(
    ws,
    reviewerRow,
    1,
    reviewerRow,
    TOTAL_COLS,
    `المراجع المختص: ${report.reviewerName || '—'} (${report.reviewerTitle || 'مراجع تقارير المرافق'})   |   تاريخ المراجعة: ${formatDateWestern(report.reviewedAt, 'قيد المراجعة')}`,
    {
      fill: C_SLATE_ALT,
      font: { size: 9, bold: true, color: { argb: C_NAVY } },
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: thinBorder(),
    }
  );

  // Official Attestation Banner
  const attestRow = rowIdx++;
  setRowH(attestRow, 23);
  mergeAndSet(
    ws,
    attestRow,
    1,
    attestRow,
    TOTAL_COLS,
    isApprovedOrArchived
      ? '«هذا التقرير معتمد ومراجع وفقاً للسياسات والإجراءات المعمول بها في قسم إدارة المرافق»'
      : `حالة التقرير الحالية: (${STATUS_LABELS_AR[report.status]}) — يُعتمد التقرير رسمياً بعد استكمال التوقيعين الإلكترونيين لمعد التقرير ومعتمد التقرير`,
    {
      fill: isApprovedOrArchived ? C_EMERALD_SOFT : C_AMBER_SOFT,
      font: { size: 9.5, bold: true, color: { argb: isApprovedOrArchived ? C_EMERALD : C_AMBER } },
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: thinBorder(isApprovedOrArchived ? C_EMERALD : C_GOLD),
    }
  );

  setRowH(rowIdx, 8);
  rowIdx++;

  // ===========================================================================
  // CORPORATE EXECUTIVE FOOTER (Image + Arabic/English + Khaled Al Hashemi Credit)
  // ===========================================================================
  const footGoldRow = rowIdx++;
  setRowH(footGoldRow, 4);
  styleRange(ws, footGoldRow, 1, TOTAL_COLS, { fill: C_GOLD });

  const footStart = rowIdx;
  const footRow1 = footStart;
  const footRow2 = footStart + 1;
  const footRow3 = footStart + 2;
  setRowH(footRow1, 22);
  setRowH(footRow2, 20);
  setRowH(footRow3, 18);
  rowIdx += 3;

  // Footer text spans Cols 1 .. TOTAL_COLS - 3; Footer Visual spans Cols TOTAL_COLS - 2 .. TOTAL_COLS
  const footTextEnd = TOTAL_COLS - 3;
  const footMid = Math.ceil(footTextEnd / 2);

  mergeAndSet(
    ws,
    footRow1,
    1,
    footRow1,
    footMid,
    'إدارة الخدمات العامة  |  قسم إدارة المرافق',
    {
      fill: C_DARK_NAVY,
      font: { size: 10, bold: true, color: { argb: C_WHITE } },
      alignment: { horizontal: 'right', vertical: 'middle', indent: 1 },
    }
  );
  mergeAndSet(
    ws,
    footRow2,
    1,
    footRow2,
    footMid,
    'General Services Department  |  Facilities Management',
    {
      fill: C_DARK_NAVY,
      font: { size: 8.5, bold: true, color: { argb: C_GOLD_LIGHT } },
      alignment: { horizontal: 'right', vertical: 'middle', indent: 1 },
    }
  );
  mergeAndSet(
    ws,
    footRow1,
    footMid + 1,
    footRow1,
    footTextEnd,
    'إعداد وتصميم: خالد الهاشمي',
    {
      fill: C_DARK_NAVY,
      font: { size: 10, bold: true, color: { argb: C_GOLD_LIGHT } },
      alignment: { horizontal: 'left', vertical: 'middle', indent: 1 },
    }
  );
  mergeAndSet(
    ws,
    footRow2,
    footMid + 1,
    footRow2,
    footTextEnd,
    'Prepared & Designed by Khaled Al Hashemi',
    {
      fill: C_DARK_NAVY,
      font: { size: 8.5, color: { argb: C_WHITE } },
      alignment: { horizontal: 'left', vertical: 'middle', indent: 1 },
    }
  );
  mergeAndSet(
    ws,
    footRow3,
    1,
    footRow3,
    footTextEnd,
    `رقم التقرير: ${report.reportNumber}  ·  الإصدار: v${verNumber}  ·  تاريخ الإنشاء: ${formatDateTimeWestern(new Date().toISOString())}`,
    {
      fill: C_NAVY,
      font: { size: 8, color: { argb: C_GOLD_LIGHT } },
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: { top: { style: 'thin', color: { argb: C_GOLD } } },
    }
  );

  mergeAndSet(ws, footRow1, footTextEnd + 1, footRow3, TOTAL_COLS, '', {
    fill: C_DARK_NAVY,
  });
  placeImageInBox(wb, ws, colWidths, rowHeights, assets.footerBg, {
    colStart: footTextEnd + 1,
    colEnd: TOTAL_COLS,
    rowStart: footRow1,
    rowEnd: footRow3,
    paddingPx: 2,
    fillBox: true,
  });

  // Set official print area and repeat header print footer
  ws.pageSetup.printArea = `A1:${colLetter(TOTAL_COLS)}${footRow3}`;
  ws.headerFooter.oddFooter = `&Rإدارة الخدمات العامة | قسم إدارة المرافق — ساعد&C${report.reportNumber} (v${verNumber})&Lصفحة &P من &N | إعداد وتصميم: خالد الهاشمي`;

  // ===========================================================================
  // SHEET 2: بيانات تفصيلية (Clean Flat Analytical Tables — Zero Merged Data Cells)
  // ===========================================================================
  const wsData = wb.addWorksheet('بيانات تفصيلية', {
    views: [{ rightToLeft: true, showGridLines: true }],
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  });
  [24, 30, 26, 16, 16, 16, 18, 28].forEach((w, i) => {
    wsData.getColumn(i + 1).width = w;
  });

  let dr = 1;
  const addFlatSectionTitle = (title: string) => {
    wsData.mergeCells(dr, 1, dr, 8);
    const cell = wsData.getCell(dr, 1);
    cell.value = title;
    cell.font = { name: FONT_NAME, size: 11, bold: true, color: { argb: C_WHITE } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_NAVY } };
    cell.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
    wsData.getRow(dr).height = 23;
    dr++;
  };

  const addFlatTableHeaders = (headers: string[]) => {
    wsData.getRow(dr).height = 21;
    headers.forEach((h, i) => {
      const c = wsData.getCell(dr, i + 1);
      c.value = h;
      c.font = { name: FONT_NAME, size: 9.5, bold: true, color: { argb: C_WHITE } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_BLUE } };
      c.alignment = { horizontal: 'center', vertical: 'middle' };
      c.border = thinBorder();
    });
    dr++;
  };

  // Flat Block 1: Executive KPIs
  addFlatSectionTitle(`بيانات تفصيلية — التقرير ${report.reportNumber} (${periodStr})`);
  addFlatTableHeaders(['القسم', 'المؤشر', 'الوصف الإنجليزي', 'القيمة الرقمية', 'الوحدة / الصيغة', 'النسبة / الحالة', 'ملاحظات', 'المرجع']);
  const flatKpis: Array<[string, string, string, number | string, string, string, string, string]> = [
    ['الملخص التنفيذي', 'إجمالي الطلبات المستلمة', 'Total Received Requests', metrics.totalReceived, 'طلب', formatPct(metrics.overallCompletionPct), '', report.reportNumber],
    ['الملخص التنفيذي', 'إجمالي الطلبات المنفذة', 'Total Executed Requests', metrics.totalExecuted, 'طلب', formatPct(metrics.overallCompletionPct), '', report.reportNumber],
    ['الملخص التنفيذي', 'إجمالي الخدمات النشطة', 'Active Services Count', metrics.activeServicesCount, 'خدمة', '', metrics.topService ? `الأعلى: ${metrics.topService.nameAr}` : '', report.reportNumber],
    ['الصيانة', 'إجمالي الأعطال المسجلة', 'Total Maintenance Faults', metrics.maintenance.grandTotalFaults, 'عطل', '', metrics.maintenance.highestFaultSite ? `الأعلى: ${metrics.maintenance.highestFaultSite.nameAr}` : '', 'قسم 6'],
    ['المالية', 'إجمالي تكلفة الصيانة (النثرية)', 'Petty Cash Total', metrics.maintenance.pettyCashTotalAed, 'AED', '', '', 'قسم 6'],
    ['المالية', 'إجمالي تكلفة الصيانة (أمر شراء)', 'Purchase Order Total', metrics.maintenance.purchaseOrderTotalAed, 'AED', '', '', 'قسم 6'],
    ['المالية', 'إجمالي تكاليف الصيانة الكلية', 'Grand Total Cost', metrics.maintenance.grandTotalCostAed, 'AED', '', '', 'قسم 6'],
    ['اللوجستيات', 'إجمالي الطلبات اللوجستية', 'Total Logistics Requests', metrics.logisticsTotal, 'طلب', '', '', 'قسم 8'],
    ['الأمن والاستقبال', 'إجمالي الأمن والاستقبال المستلم', 'Security Total Received', metrics.securityTotals.totalReceived, 'نشاط', formatPct(metrics.securityTotals.overallCompletionPct), '', 'قسم 9'],
  ];
  flatKpis.forEach((rowVals, idx) => {
    wsData.getRow(dr).height = 20;
    rowVals.forEach((val, cIdx) => {
      const cell = wsData.getCell(dr, cIdx + 1);
      cell.value = val;
      cell.font = { name: FONT_NAME, size: 9.5, color: { argb: C_NAVY } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: idx % 2 === 1 ? C_SLATE_ALT : C_WHITE } };
      cell.alignment = { horizontal: cIdx === 3 ? 'center' : 'right', vertical: 'middle' };
      cell.border = thinBorder();
      if (cIdx === 3 && typeof val === 'number') {
        cell.numFmt = rowVals[4] === 'AED' ? '#,##0.00' : '#,##0';
      }
    });
    dr++;
  });
  dr++;

  // Flat Block 2: Services
  addFlatSectionTitle('تفاصيل الخدمات (جدول غير مدمج جاهز للفرز والتحليل)');
  addFlatTableHeaders(['رمز الخدمة', 'الاسم العربي', 'الاسم الإنجليزي', 'المستلمة', 'المنفذة', 'نسبة الإنجاز', 'الحصة من الإجمالي', 'مستوى الأداء']);
  sortedSummary.forEach((s, idx) => {
    wsData.getRow(dr).height = 20;
    const vals: ExcelJS.CellValue[] = [
      s.serviceId,
      s.nameAr,
      s.nameEn,
      s.receivedCount,
      s.executedCount,
      s.completionPct != null ? s.completionPct / 100 : 0,
      s.shareOfTotalPct != null ? s.shareOfTotalPct / 100 : 0,
      s.level.labelAr,
    ];
    vals.forEach((val, cIdx) => {
      const cell = wsData.getCell(dr, cIdx + 1);
      cell.value = val;
      cell.font = { name: FONT_NAME, size: 9.5, color: { argb: C_NAVY } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: idx % 2 === 1 ? C_SLATE_ALT : C_WHITE } };
      cell.alignment = { horizontal: cIdx >= 3 && cIdx <= 6 ? 'center' : 'right', vertical: 'middle' };
      cell.border = thinBorder();
      if (cIdx === 3 || cIdx === 4) cell.numFmt = '#,##0';
      if (cIdx === 5 || cIdx === 6) cell.numFmt = '0.0%';
    });
    dr++;
  });
  dr++;

  // Flat Block 3: Sites x Categories Normalized Records
  addFlatSectionTitle('سجلات أعطال الصيانة التفصيلية (المقر × الفئة)');
  addFlatTableHeaders(['المقر', 'الفئة', 'عدد الأعطال', 'النثرية للفئة (AED)', 'أمر الشراء للفئة (AED)', 'إجمالي تكلفة الفئة (AED)', 'تقييم السجل', 'الفترة']);
  let recIdx = 0;
  sites.forEach((site) => {
    categories.forEach((cat) => {
      const faultCount = Math.max(0, Number(report.maintenanceMatrix[site.id]?.[cat.id]) || 0);
      const cost = report.maintenanceCosts[cat.id];
      const petty = Number(cost?.pettyCashAed) || 0;
      const po = Number(cost?.purchaseOrderAed) || 0;
      wsData.getRow(dr).height = 19;
      const vals: ExcelJS.CellValue[] = [
        site.nameAr,
        cat.nameAr,
        faultCount,
        petty,
        po,
        petty + po,
        faultCount > 0 ? 'مسجل أعطال' : 'صفري',
        `${report.year}-${String(report.month).padStart(2, '0')}`,
      ];
      vals.forEach((val, cIdx) => {
        const cell = wsData.getCell(dr, cIdx + 1);
        cell.value = val;
        cell.font = { name: FONT_NAME, size: 9, color: { argb: C_NAVY } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: recIdx % 2 === 1 ? C_SLATE_ALT : C_WHITE } };
        cell.alignment = { horizontal: cIdx >= 2 && cIdx <= 5 ? 'center' : 'right', vertical: 'middle' };
        cell.border = thinBorder();
        if (cIdx === 2) cell.numFmt = '#,##0';
        if (cIdx >= 3 && cIdx <= 5) cell.numFmt = '#,##0.00';
      });
      recIdx++;
      dr++;
    });
  });

  wsData.headerFooter.oddFooter = `&Rقسم إدارة المرافق — شركة ساعد&Cبيانات تفصيلية (${report.reportNumber})&Lصفحة &P من &N`;

  // Write Buffer & Validate OOXML Zip Structure
  const rawBuffer = await wb.xlsx.writeBuffer();
  const bytes = rawBuffer instanceof Uint8Array ? rawBuffer : new Uint8Array(rawBuffer);
  const inspected = inspectGeneratedXlsxStructure(bytes, 2);

  const blob = new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const filename = sanitizeFilename(
    `${report.reportNumber}_v${verNumber}.xlsx`,
    `SAAED_FM_Report_${reportId}.xlsx`
  );
  triggerXlsxDownload(blob, filename);

  return {
    filename,
    sizeBytes: blob.size,
    sheetCount: inspected.sheetCount,
    embeddedMediaCount: inspected.mediaCount,
  };
}

/**
 * Full 5-Sheet Executive Analytics Excel Export (Browser-Native, Static GitHub Pages Compatible)
 */
export async function exportAnalyticsDirectExcel(params: {
  filters: Record<string, string>;
  data?: AnalyticsEngineOutput;
}): Promise<DirectExcelExportResult> {
  const { filters, data } = params;
  const ExcelJSImport = await import('exceljs');
  const ExcelJS = ExcelJSImport.default || ExcelJSImport;

  let bi = data;
  if (!bi) {
    const all = await api.getAllAnalytics();
    bi = computeAnalyticsEngine({
      reports: all.reports,
      sites: all.sites,
      categories: all.categories,
      thresholds: all.thresholds,
      filters: {
        ...DEFAULT_ANALYTICS_FILTERS,
        ...(filters as Partial<AnalyticsFilters>),
      },
    });
  }

  const assets = await loadAnalyticsExcelVisualAssets();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SAAED Facilities Management Executive Intelligence Center';
  wb.created = new Date();
  wb.modified = new Date();

  const setupAnalyticsHeader = (
    ws: ExcelJS.Worksheet,
    widths: number[],
    sheetTitleAr: string,
    sheetTitleEn: string,
    bannerImg: LoadedExcelImage | null
  ) => {
    const totalCols = widths.length;
    widths.forEach((w, i) => {
      ws.getColumn(i + 1).width = w;
    });
    const rHeights = new Map<number, number>();
    [24, 22, 20, 5].forEach((h, idx) => {
      ws.getRow(idx + 1).height = h;
      rHeights.set(idx + 1, h);
    });

    for (let r = 1; r <= 3; r++) {
      styleRange(ws, r, 1, totalCols, { fill: C_NAVY });
    }
    styleRange(ws, 4, 1, totalCols, { fill: C_GOLD });

    // Right wing: Logo
    mergeAndSet(ws, 1, 1, 3, 1, '', { fill: C_WHITE });
    placeImageInBox(wb, ws, widths, rHeights, assets.logo, {
      colStart: 1,
      colEnd: 1,
      rowStart: 1,
      rowEnd: 3,
      paddingPx: 4,
    });

    // Center Titles
    const titleEnd = Math.max(2, totalCols - 1);
    mergeAndSet(
      ws,
      1,
      2,
      1,
      titleEnd,
      `مركز التحليل التنفيذي لإدارة المرافق — ${sheetTitleAr}`,
      {
        fill: C_NAVY,
        font: { size: 13.5, bold: true, color: { argb: C_WHITE } },
        alignment: { horizontal: 'center', vertical: 'middle' },
      }
    );
    mergeAndSet(
      ws,
      2,
      2,
      2,
      titleEnd,
      `SAAED Facilities Management Executive Intelligence | ${sheetTitleEn}`,
      {
        fill: C_NAVY,
        font: { size: 10, bold: true, color: { argb: C_GOLD_LIGHT } },
        alignment: { horizontal: 'center', vertical: 'middle' },
      }
    );
    mergeAndSet(
      ws,
      3,
      2,
      3,
      titleEnd,
      `النطاق: ${bi.meta.scopeLabelAr} | الفترة: ${bi.meta.periodLabelAr} | التقارير: ${formatNumber(bi.meta.filteredReportsCount)}`,
      {
        fill: C_NAVY,
        font: { size: 9, color: { argb: C_WHITE } },
        alignment: { horizontal: 'center', vertical: 'middle' },
      }
    );

    // Left wing: Domain banner photo
    if (totalCols > titleEnd) {
      mergeAndSet(ws, 1, totalCols, 3, totalCols, '', { fill: C_NAVY });
      placeImageInBox(wb, ws, widths, rHeights, bannerImg, {
        colStart: totalCols,
        colEnd: totalCols,
        rowStart: 1,
        rowEnd: 3,
        paddingPx: 2,
        fillBox: true,
      });
    }

    return rHeights;
  };

  // SHEET 1: الملخص التنفيذي
  const ws1 = wb.addWorksheet('الملخص التنفيذي', {
    views: [{ rightToLeft: true, showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  const w1 = [24, 24, 18, 16, 24, 26];
  const rh1 = setupAnalyticsHeader(ws1, w1, 'الملخص التنفيذي والمؤشرات الحاكمة', 'Executive Snapshot & Pillars', assets.heroBanner);
  let r1 = 6;
  addCorporateSectionBanner(ws1, rh1, r1++, 6, 'معايير التصفية والنطاق المطبق', 'Active BI Scope');
  const filterMeta: Array<[string, string, string, string]> = [
    ['نطاق حالة التقارير', bi.meta.scopeLabelAr, 'السنة المختارة', filters.year === 'all' || !filters.year ? 'جميع السنوات' : filters.year],
    ['النطاق الفترى', bi.meta.periodLabelAr, 'الشهر المختار', filters.month === 'all' || !filters.month ? 'جميع الأشهر' : filters.month],
    ['التقارير المشمولة', formatNumber(bi.meta.filteredReportsCount), 'المعتمدة / المسودات', `${formatNumber(bi.meta.approvedInScopeCount)} معتمد / ${formatNumber(bi.meta.draftInScopeCount)} قيد الإعداد`],
  ];
  filterMeta.forEach(([k1, v1, k2, v2], idx) => {
    ws1.getRow(r1).height = 20;
    const f = idx % 2 === 0 ? C_SLATE_ALT : C_WHITE;
    mergeAndSet(ws1, r1, 1, r1, 1, k1, { fill: f, font: { size: 9.5, bold: true, color: { argb: C_NAVY } }, alignment: { horizontal: 'right', vertical: 'middle' }, border: thinBorder() });
    mergeAndSet(ws1, r1, 2, r1, 3, v1, { fill: f, font: { size: 9.5, color: { argb: C_NAVY } }, alignment: { horizontal: 'right', vertical: 'middle' }, border: thinBorder() });
    mergeAndSet(ws1, r1, 4, r1, 4, k2, { fill: f, font: { size: 9.5, bold: true, color: { argb: C_NAVY } }, alignment: { horizontal: 'right', vertical: 'middle' }, border: thinBorder() });
    mergeAndSet(ws1, r1, 5, r1, 6, v2, { fill: f, font: { size: 9.5, color: { argb: C_NAVY } }, alignment: { horizontal: 'right', vertical: 'middle' }, border: thinBorder() });
    r1++;
  });
  r1++;
  addCorporateSectionBanner(ws1, rh1, r1++, 6, '01. مؤشرات الملخص التنفيذي', 'Executive KPIs');
  ws1.getRow(r1).height = 22;
  mergeAndSet(ws1, r1, 1, r1, 2, 'المؤشر', { fill: C_BLUE, font: { size: 10, bold: true, color: { argb: C_WHITE } }, alignment: { horizontal: 'center', vertical: 'middle' }, border: thinBorder() });
  mergeAndSet(ws1, r1, 3, r1, 3, 'القيمة', { fill: C_BLUE, font: { size: 10, bold: true, color: { argb: C_WHITE } }, alignment: { horizontal: 'center', vertical: 'middle' }, border: thinBorder() });
  mergeAndSet(ws1, r1, 4, r1, 4, 'الوحدة', { fill: C_BLUE, font: { size: 10, bold: true, color: { argb: C_WHITE } }, alignment: { horizontal: 'center', vertical: 'middle' }, border: thinBorder() });
  mergeAndSet(ws1, r1, 5, r1, 6, 'التصنيف / التفسير', { fill: C_BLUE, font: { size: 10, bold: true, color: { argb: C_WHITE } }, alignment: { horizontal: 'center', vertical: 'middle' }, border: thinBorder() });
  r1++;

  const kpiRows: Array<[string, number | string, string, string, string?]> = [
    ['إجمالي الطلبات المستلمة', bi.snapshot.totalReceived, 'طلب', 'كافة الخدمات المشمولة بالنطاق', '#,##0'],
    ['إجمالي الطلبات المنفذة', bi.snapshot.totalExecuted, 'طلب', 'إجمالي الطلبات المنجزة', '#,##0'],
    ['نسبة الإنجاز الكلية', bi.snapshot.overallCompletionPct !== null ? bi.snapshot.overallCompletionPct / 100 : 'غير منطبق', '%', bi.snapshot.overallCompletionLevel.labelAr, '0.0%'],
    ['فجوة الطلبات المتبقية', bi.snapshot.totalRemainingGap, 'طلب', 'الفرق غير المنفذ داخل الفترة', '#,##0'],
    ['إجمالي أعطال الصيانة', bi.snapshot.totalFaults, 'عطل', bi.snapshot.highestFaultSite ? `الأعلى: ${bi.snapshot.highestFaultSite.nameAr}` : 'لا توجد أعطال', '#,##0'],
    ['إجمالي تكاليف الصيانة الفعلية', bi.snapshot.totalCostAed, 'AED', `نثرية ${formatNumber(bi.snapshot.pettyCashTotalAed)} + أمر شراء ${formatNumber(bi.snapshot.purchaseOrderTotalAed)}`, '#,##0.00'],
    ['سريان العقود والتراخيص', bi.snapshot.contractsCompliancePct !== null ? bi.snapshot.contractsCompliancePct / 100 : 'غير منطبق', '%', `${formatNumber(bi.snapshot.contractsActive)} فعال من ${formatNumber(bi.snapshot.contractsTotal)}`, '0.0%'],
    ['جاهزية طفايات الحريق', bi.snapshot.extinguishersReadinessPct !== null ? bi.snapshot.extinguishersReadinessPct / 100 : 'غير منطبق', '%', `${formatNumber(bi.snapshot.extinguishersActive)} فعالة / ${formatNumber(bi.snapshot.extinguishersInactive)} غير فعالة`, '0.0%'],
    ['إغلاق ملاحظات المخاطر', bi.snapshot.hazardsClosurePct !== null ? bi.snapshot.hazardsClosurePct / 100 : 'غير منطبق', '%', `${formatNumber(bi.snapshot.hazardsClosed)} مغلقة / ${formatNumber(bi.snapshot.hazardsOpen)} مفتوحة`, '0.0%'],
    ['متوسط إنجاز المهام التشغيلية', bi.snapshot.tasksAvgCompletionPct !== null ? bi.snapshot.tasksAvgCompletionPct / 100 : 'غير منطبق', '%', `${formatNumber(bi.snapshot.tasksCompleted)} مكتملة من ${formatNumber(bi.snapshot.tasksTotal)}`, '0.0%'],
  ];
  kpiRows.forEach(([label, val, unit, note, fmt], idx) => {
    ws1.getRow(r1).height = 21;
    const f = idx % 2 === 0 ? C_WHITE : C_SLATE_ALT;
    mergeAndSet(ws1, r1, 1, r1, 2, label, { fill: f, font: { size: 9.5, bold: true, color: { argb: C_NAVY } }, alignment: { horizontal: 'right', vertical: 'middle' }, border: thinBorder() });
    mergeAndSet(ws1, r1, 3, r1, 3, val, { fill: f, font: { size: 10, bold: true, color: { argb: C_NAVY } }, alignment: { horizontal: 'center', vertical: 'middle' }, border: thinBorder(), numFmt: typeof val === 'number' ? fmt : undefined });
    mergeAndSet(ws1, r1, 4, r1, 4, unit, { fill: f, font: { size: 9.5, color: { argb: C_TEXT_MUTED } }, alignment: { horizontal: 'center', vertical: 'middle' }, border: thinBorder() });
    mergeAndSet(ws1, r1, 5, r1, 6, note, { fill: f, font: { size: 9.5, color: { argb: C_NAVY } }, alignment: { horizontal: 'right', vertical: 'middle', wrapText: true }, border: thinBorder() });
    r1++;
  });
  r1++;
  addCorporateSectionBanner(ws1, rh1, r1++, 6, '14. حالة التوقعات المستقبلية المشروطة', 'Conditional Forecast');
  ws1.getRow(r1).height = 28;
  mergeAndSet(
    ws1,
    r1,
    1,
    r1,
    6,
    bi.forecast.available
      ? `متاح (${formatNumber(bi.forecast.periodsCount)} فترات) — التوقع (${bi.forecast.nextPeriodLabelAr}): طلبات ≈ ${formatNumber(bi.forecast.requestsForecast?.predicted ?? 0)} | أعطال ≈ ${formatNumber(bi.forecast.faultsForecast?.predicted ?? 0)} | تكلفة ≈ ${formatAed(bi.forecast.costForecast?.predicted ?? 0)}`
      : `بيانات غير كافية للتنبؤ — ${bi.forecast.reasonAr}`,
    {
      fill: C_SKY_SOFT,
      font: { size: 9.5, bold: true, color: { argb: bi.forecast.available ? C_EMERALD : C_AMBER } },
      alignment: { horizontal: 'right', vertical: 'middle', wrapText: true },
      border: thinBorder(),
    }
  );

  // SHEET 2: الخدمات والكفاءة
  const ws2 = wb.addWorksheet('الخدمات والكفاءة', {
    views: [{ rightToLeft: true, showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  const rh2 = setupAnalyticsHeader(ws2, [10, 32, 16, 16, 16, 16, 16, 20], 'تحليل الخدمات وكفاءة الإنجاز', 'Services Demand & Completion Efficiency', assets.servicesHub);
  let r2 = 6;
  addCorporateSectionBanner(ws2, rh2, r2++, 8, '03 & 04. أداء الخدمات الإحدى عشرة وكفاءة الإنجاز', 'Services Performance Matrix');
  const s2Headers = ['#', 'الخدمة', 'المستلمة', 'المنفذة', 'الفجوة المتبقية', 'الحصة %', 'نسبة الإنجاز %', 'مستوى الأداء'];
  ws2.getRow(r2).height = 22;
  s2Headers.forEach((h, i) => {
    mergeAndSet(ws2, r2, i + 1, r2, i + 1, h, { fill: C_BLUE, font: { size: 9.5, bold: true, color: { argb: C_WHITE } }, alignment: { horizontal: 'center', vertical: 'middle' }, border: thinBorder() });
  });
  r2++;
  const svcStart = r2;
  const svcTot = svcStart + bi.servicesAnalysis.rows.length;
  bi.servicesAnalysis.rows.forEach((s, idx) => {
    const r = r2++;
    ws2.getRow(r).height = 20;
    const f = idx % 2 === 0 ? C_WHITE : C_SLATE_ALT;
    mergeAndSet(ws2, r, 1, r, 1, idx + 1, { fill: f, font: { size: 9.5, color: { argb: C_TEXT_MUTED } }, alignment: { horizontal: 'center', vertical: 'middle' }, border: thinBorder() });
    mergeAndSet(ws2, r, 2, r, 2, `${s.nameAr} (${s.nameEn})`, { fill: f, font: { size: 9.5, bold: true, color: { argb: C_NAVY } }, alignment: { horizontal: 'right', vertical: 'middle' }, border: thinBorder() });
    mergeAndSet(ws2, r, 3, r, 3, s.receivedCount, { fill: f, font: { size: 9.5, bold: true, color: { argb: C_NAVY } }, alignment: { horizontal: 'center', vertical: 'middle' }, border: thinBorder(), numFmt: '#,##0' });
    mergeAndSet(ws2, r, 4, r, 4, s.executedCount, { fill: f, font: { size: 9.5, bold: true, color: { argb: C_EMERALD } }, alignment: { horizontal: 'center', vertical: 'middle' }, border: thinBorder(), numFmt: '#,##0' });
    mergeAndSet(ws2, r, 5, r, 5, { formula: `MAX(0, C${r}-D${r})`, result: Math.max(0, s.receivedCount - s.executedCount) }, { fill: f, font: { size: 9.5, color: { argb: C_NAVY } }, alignment: { horizontal: 'center', vertical: 'middle' }, border: thinBorder(), numFmt: '#,##0' });
    mergeAndSet(ws2, r, 6, r, 6, { formula: `IF(C${svcTot}=0,0,C${r}/C${svcTot})`, result: s.shareOfTotalPct != null ? s.shareOfTotalPct / 100 : 0 }, { fill: f, font: { size: 9.5, color: { argb: C_ACCENT_BLUE } }, alignment: { horizontal: 'center', vertical: 'middle' }, border: thinBorder(), numFmt: '0.0%' });
    mergeAndSet(ws2, r, 7, r, 7, { formula: `IF(C${r}=0,"غير منطبق",D${r}/C${r})`, result: s.completionPct != null ? s.completionPct / 100 : 'غير منطبق' }, { fill: f, font: { size: 9.5, bold: true, color: { argb: C_NAVY } }, alignment: { horizontal: 'center', vertical: 'middle' }, border: thinBorder(), numFmt: '0.0%' });
    mergeAndSet(ws2, r, 8, r, 8, s.level.labelAr, { fill: f, font: { size: 9.5, bold: true, color: { argb: C_NAVY } }, alignment: { horizontal: 'center', vertical: 'middle' }, border: thinBorder() });
  });
  if (bi.servicesAnalysis.rows.length > 0) {
    ws2.getRow(r2).height = 22;
    mergeAndSet(ws2, r2, 1, r2, 2, 'الإجمالي العام | Total', { fill: C_NAVY, font: { size: 10, bold: true, color: { argb: C_WHITE } }, alignment: { horizontal: 'center', vertical: 'middle' }, border: thinBorder() });
    mergeAndSet(ws2, r2, 3, r2, 3, { formula: `SUM(C${svcStart}:C${r2 - 1})`, result: bi.snapshot.totalReceived }, { fill: C_NAVY, font: { size: 10, bold: true, color: { argb: C_GOLD_LIGHT } }, alignment: { horizontal: 'center', vertical: 'middle' }, border: thinBorder(), numFmt: '#,##0' });
    mergeAndSet(ws2, r2, 4, r2, 4, { formula: `SUM(D${svcStart}:D${r2 - 1})`, result: bi.snapshot.totalExecuted }, { fill: C_NAVY, font: { size: 10, bold: true, color: { argb: 'FF6EE7B7' } }, alignment: { horizontal: 'center', vertical: 'middle' }, border: thinBorder(), numFmt: '#,##0' });
    mergeAndSet(ws2, r2, 5, r2, 5, { formula: `SUM(E${svcStart}:E${r2 - 1})`, result: bi.snapshot.totalRemainingGap }, { fill: C_NAVY, font: { size: 10, bold: true, color: { argb: C_WHITE } }, alignment: { horizontal: 'center', vertical: 'middle' }, border: thinBorder(), numFmt: '#,##0' });
    mergeAndSet(ws2, r2, 6, r2, 6, { formula: `IF(C${r2}=0,0,1)`, result: bi.snapshot.totalReceived > 0 ? 1 : 0 }, { fill: C_NAVY, font: { size: 10, bold: true, color: { argb: C_WHITE } }, alignment: { horizontal: 'center', vertical: 'middle' }, border: thinBorder(), numFmt: '0.0%' });
    mergeAndSet(ws2, r2, 7, r2, 7, { formula: `IF(C${r2}=0,"غير منطبق",D${r2}/C${r2})`, result: bi.snapshot.overallCompletionPct != null ? bi.snapshot.overallCompletionPct / 100 : 'غير منطبق' }, { fill: C_NAVY, font: { size: 10, bold: true, color: { argb: C_GOLD_LIGHT } }, alignment: { horizontal: 'center', vertical: 'middle' }, border: thinBorder(), numFmt: '0.0%' });
    mergeAndSet(ws2, r2, 8, r2, 8, bi.snapshot.overallCompletionLevel.labelAr, { fill: C_NAVY, font: { size: 10, bold: true, color: { argb: C_GOLD_LIGHT } }, alignment: { horizontal: 'center', vertical: 'middle' }, border: thinBorder() });
  }

  // SHEET 3: الصيانة والمقرات والمالية
  const ws3 = wb.addWorksheet('الصيانة والمقرات والمالية', {
    views: [{ rightToLeft: true, showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  const rh3 = setupAnalyticsHeader(ws3, [26, 14, 14, 14, 16, 16, 18, 18], 'الصيانة والأعطال والمقرات والتكاليف (AED)', 'Maintenance Pareto, Sites & Financial Costs', assets.maintenanceOps);
  let r3 = 6;
  addCorporateSectionBanner(ws3, rh3, r3++, 8, '05 & 07. تحليل باريتو للأعطال والتكاليف المالية حسب الفئة (AED)', 'Maintenance Faults Pareto & AED Costs');
  ws3.getRow(r3).height = 24;
  ['فئة الصيانة', 'الأعطال', 'الحصة %', 'التراكمي %', 'النثرية (AED)', 'أمر الشراء (AED)', 'إجمالي التكلفة (AED)', 'تكلفة العطل (AED)'].forEach((h, i) => {
    mergeAndSet(ws3, r3, i + 1, r3, i + 1, h, { fill: C_BLUE, font: { size: 9.5, bold: true, color: { argb: C_WHITE } }, alignment: { horizontal: 'center', vertical: 'middle', wrapText: true }, border: thinBorder() });
  });
  r3++;
  const parStart = r3;
  const parTot = parStart + bi.maintenanceAnalysis.paretoRows.length;
  bi.maintenanceAnalysis.paretoRows.forEach((p, idx) => {
    const r = r3++;
    ws3.getRow(r).height = 20;
    const f = idx % 2 === 0 ? C_WHITE : C_SLATE_ALT;
    mergeAndSet(ws3, r, 1, r, 1, p.nameAr, { fill: f, font: { size: 9.5, bold: true, color: { argb: C_NAVY } }, alignment: { horizontal: 'right', vertical: 'middle' }, border: thinBorder() });
    mergeAndSet(ws3, r, 2, r, 2, p.faultCount, { fill: f, font: { size: 9.5, color: { argb: C_NAVY } }, alignment: { horizontal: 'center', vertical: 'middle' }, border: thinBorder(), numFmt: '#,##0' });
    mergeAndSet(ws3, r, 3, r, 3, { formula: `IF(B${parTot}=0,0,B${r}/B${parTot})`, result: p.sharePct != null ? p.sharePct / 100 : 0 }, { fill: f, font: { size: 9.5, color: { argb: C_ACCENT_BLUE } }, alignment: { horizontal: 'center', vertical: 'middle' }, border: thinBorder(), numFmt: '0.0%' });
    mergeAndSet(ws3, r, 4, r, 4, p.cumulativePct / 100, { fill: f, font: { size: 9.5, color: { argb: C_NAVY } }, alignment: { horizontal: 'center', vertical: 'middle' }, border: thinBorder(), numFmt: '0.0%' });
    mergeAndSet(ws3, r, 5, r, 5, p.pettyCashAed, { fill: f, font: { size: 9.5, color: { argb: C_NAVY } }, alignment: { horizontal: 'center', vertical: 'middle' }, border: thinBorder(), numFmt: '#,##0.00' });
    mergeAndSet(ws3, r, 6, r, 6, p.purchaseOrderAed, { fill: f, font: { size: 9.5, color: { argb: C_NAVY } }, alignment: { horizontal: 'center', vertical: 'middle' }, border: thinBorder(), numFmt: '#,##0.00' });
    mergeAndSet(ws3, r, 7, r, 7, { formula: `E${r}+F${r}`, result: p.totalCostAed }, { fill: f, font: { size: 9.5, bold: true, color: { argb: C_NAVY } }, alignment: { horizontal: 'center', vertical: 'middle' }, border: thinBorder(), numFmt: '#,##0.00' });
    mergeAndSet(ws3, r, 8, r, 8, { formula: `IF(B${r}=0,"غير منطبق",G${r}/B${r})`, result: p.costPerFaultAed ?? 'غير منطبق' }, { fill: f, font: { size: 9.5, color: { argb: C_NAVY } }, alignment: { horizontal: 'center', vertical: 'middle' }, border: thinBorder(), numFmt: '#,##0.00' });
  });
  if (bi.maintenanceAnalysis.paretoRows.length > 0) {
    ws3.getRow(r3).height = 22;
    mergeAndSet(ws3, r3, 1, r3, 1, 'الإجمالي العام | Total', { fill: C_NAVY, font: { size: 10, bold: true, color: { argb: C_WHITE } }, alignment: { horizontal: 'right', vertical: 'middle' }, border: thinBorder() });
    mergeAndSet(ws3, r3, 2, r3, 2, { formula: `SUM(B${parStart}:B${r3 - 1})`, result: bi.snapshot.totalFaults }, { fill: C_NAVY, font: { size: 10, bold: true, color: { argb: C_GOLD_LIGHT } }, alignment: { horizontal: 'center', vertical: 'middle' }, border: thinBorder(), numFmt: '#,##0' });
    mergeAndSet(ws3, r3, 3, r3, 3, { formula: `IF(B${r3}=0,0,1)`, result: bi.snapshot.totalFaults > 0 ? 1 : 0 }, { fill: C_NAVY, font: { size: 10, bold: true, color: { argb: C_WHITE } }, alignment: { horizontal: 'center', vertical: 'middle' }, border: thinBorder(), numFmt: '0.0%' });
    mergeAndSet(ws3, r3, 4, r3, 4, 1, { fill: C_NAVY, font: { size: 10, bold: true, color: { argb: C_WHITE } }, alignment: { horizontal: 'center', vertical: 'middle' }, border: thinBorder(), numFmt: '0.0%' });
    mergeAndSet(ws3, r3, 5, r3, 5, { formula: `SUM(E${parStart}:E${r3 - 1})`, result: bi.snapshot.pettyCashTotalAed }, { fill: C_NAVY, font: { size: 10, bold: true, color: { argb: C_WHITE } }, alignment: { horizontal: 'center', vertical: 'middle' }, border: thinBorder(), numFmt: '#,##0.00' });
    mergeAndSet(ws3, r3, 6, r3, 6, { formula: `SUM(F${parStart}:F${r3 - 1})`, result: bi.snapshot.purchaseOrderTotalAed }, { fill: C_NAVY, font: { size: 10, bold: true, color: { argb: C_WHITE } }, alignment: { horizontal: 'center', vertical: 'middle' }, border: thinBorder(), numFmt: '#,##0.00' });
    mergeAndSet(ws3, r3, 7, r3, 7, { formula: `SUM(G${parStart}:G${r3 - 1})`, result: bi.snapshot.totalCostAed }, { fill: C_NAVY, font: { size: 10, bold: true, color: { argb: C_GOLD_LIGHT } }, alignment: { horizontal: 'center', vertical: 'middle' }, border: thinBorder(), numFmt: '#,##0.00' });
    mergeAndSet(ws3, r3, 8, r3, 8, { formula: `IF(B${r3}=0,"غير منطبق",G${r3}/B${r3})`, result: bi.snapshot.totalFaults > 0 ? bi.snapshot.totalCostAed / bi.snapshot.totalFaults : 'غير منطبق' }, { fill: C_NAVY, font: { size: 10, bold: true, color: { argb: C_WHITE } }, alignment: { horizontal: 'center', vertical: 'middle' }, border: thinBorder(), numFmt: '#,##0.00' });
    r3 += 2;
  }

  addCorporateSectionBanner(ws3, rh3, r3++, 8, '06. تحليل المقرات والمواقع (الأعطال المطلقة)', 'Sites Performance Analysis');
  ws3.getRow(r3).height = 22;
  mergeAndSet(ws3, r3, 1, r3, 3, 'المقر', { fill: C_BLUE, font: { size: 9.5, bold: true, color: { argb: C_WHITE } }, alignment: { horizontal: 'center', vertical: 'middle' }, border: thinBorder() });
  mergeAndSet(ws3, r3, 4, r3, 4, 'إجمالي الأعطال', { fill: C_BLUE, font: { size: 9.5, bold: true, color: { argb: C_WHITE } }, alignment: { horizontal: 'center', vertical: 'middle' }, border: thinBorder() });
  mergeAndSet(ws3, r3, 5, r3, 5, 'الحصة من الإجمالي %', { fill: C_BLUE, font: { size: 9.5, bold: true, color: { argb: C_WHITE } }, alignment: { horizontal: 'center', vertical: 'middle' }, border: thinBorder() });
  mergeAndSet(ws3, r3, 6, r3, 8, 'الفئة الأعلى تكراراً في المقر', { fill: C_BLUE, font: { size: 9.5, bold: true, color: { argb: C_WHITE } }, alignment: { horizontal: 'center', vertical: 'middle' }, border: thinBorder() });
  r3++;

  const siteStart = r3;
  const siteTotalRow = siteStart + bi.sitesAnalysis.rows.length;
  bi.sitesAnalysis.rows.forEach((st, idx) => {
    const r = r3++;
    ws3.getRow(r).height = 20;
    const f = idx % 2 === 0 ? C_WHITE : C_SLATE_ALT;
    mergeAndSet(ws3, r, 1, r, 3, st.nameAr, { fill: f, font: { size: 9.5, bold: true, color: { argb: C_NAVY } }, alignment: { horizontal: 'right', vertical: 'middle' }, border: thinBorder() });
    mergeAndSet(ws3, r, 4, r, 4, st.faultCount, { fill: f, font: { size: 9.5, color: { argb: C_NAVY } }, alignment: { horizontal: 'center', vertical: 'middle' }, border: thinBorder(), numFmt: '#,##0' });
    mergeAndSet(ws3, r, 5, r, 5, { formula: `IF(D${siteTotalRow}=0,0,D${r}/D${siteTotalRow})`, result: st.sharePct != null ? st.sharePct / 100 : 0 }, { fill: f, font: { size: 9.5, color: { argb: C_ACCENT_BLUE } }, alignment: { horizontal: 'center', vertical: 'middle' }, border: thinBorder(), numFmt: '0.0%' });
    mergeAndSet(ws3, r, 6, r, 8, st.topCategoryAr ? `${st.topCategoryAr} (${formatNumber(st.topCategoryCount)})` : 'لا توجد أعطال', { fill: f, font: { size: 9.5, color: { argb: C_NAVY } }, alignment: { horizontal: 'right', vertical: 'middle' }, border: thinBorder() });
  });
  if (bi.sitesAnalysis.rows.length > 0) {
    ws3.getRow(r3).height = 22;
    mergeAndSet(ws3, r3, 1, r3, 3, 'إجمالي المقرات | Total', { fill: C_NAVY, font: { size: 10, bold: true, color: { argb: C_WHITE } }, alignment: { horizontal: 'right', vertical: 'middle' }, border: thinBorder() });
    mergeAndSet(ws3, r3, 4, r3, 4, { formula: `SUM(D${siteStart}:D${r3 - 1})`, result: bi.snapshot.totalFaults }, { fill: C_NAVY, font: { size: 10, bold: true, color: { argb: C_GOLD_LIGHT } }, alignment: { horizontal: 'center', vertical: 'middle' }, border: thinBorder(), numFmt: '#,##0' });
    mergeAndSet(ws3, r3, 5, r3, 5, { formula: `IF(D${r3}=0,0,1)`, result: bi.snapshot.totalFaults > 0 ? 1 : 0 }, { fill: C_NAVY, font: { size: 10, bold: true, color: { argb: C_WHITE } }, alignment: { horizontal: 'center', vertical: 'middle' }, border: thinBorder(), numFmt: '0.0%' });
    mergeAndSet(ws3, r3, 6, r3, 8, '', { fill: C_NAVY, border: thinBorder() });
  }

  // SHEET 4: العقود والسلامة والمهام
  const ws4 = wb.addWorksheet('العقود والسلامة والمهام', {
    views: [{ rightToLeft: true, showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  const rh4 = setupAnalyticsHeader(ws4, [28, 16, 16, 16, 16, 36], 'العقود والسلامة والخدمات المساندة والمهام', 'Contracts, Safety, Support Services & Tasks', assets.riskSafety);
  let r4 = 6;
  addCorporateSectionBanner(ws4, rh4, r4++, 6, '08 & 11. العقود والتراخيص والسلامة والمخاطر', 'Contracts & Fire Safety Compliance');
  ws4.getRow(r4).height = 22;
  ['البند', 'فعال / مغلق', 'غير فعال / مفتوح', 'الإجمالي', 'النسبة %', 'الملاحظات'].forEach((h, i) => {
    mergeAndSet(ws4, r4, i + 1, r4, i + 1, h, { fill: C_BLUE, font: { size: 9.5, bold: true, color: { argb: C_WHITE } }, alignment: { horizontal: 'center', vertical: 'middle' }, border: thinBorder() });
  });
  r4++;

  const govRows: Array<[string, number, number, string]> = [
    ...bi.contractsAnalysis.groups.map((g): [string, number, number, string] => [
      g.nameAr,
      g.activeCount,
      g.inactiveCount,
      g.notes.join(' | ') || '—',
    ]),
    ['طفايات الحريق (جاهزية)', bi.riskComplianceAnalysis.extinguishersActive, bi.riskComplianceAnalysis.extinguishersInactive, bi.riskComplianceAnalysis.extinguisherNotes.join(' | ') || '—'],
    ['ملاحظات المخاطر (إغلاق)', bi.riskComplianceAnalysis.hazardsClosed, bi.riskComplianceAnalysis.hazardsOpen, bi.riskComplianceAnalysis.hazardNotes.join(' | ') || '—'],
  ];

  govRows.forEach(([label, primary, secondary, notes], idx) => {
    const r = r4++;
    ws4.getRow(r).height = estimateWrappedRowHeight([{ text: notes, widthChars: 36, fontSize: 9.5 }], 22, 8);
    const f = idx % 2 === 0 ? C_WHITE : C_SLATE_ALT;
    const total = primary + secondary;
    mergeAndSet(ws4, r, 1, r, 1, label, { fill: f, font: { size: 9.5, bold: true, color: { argb: C_NAVY } }, alignment: { horizontal: 'right', vertical: 'middle' }, border: thinBorder() });
    mergeAndSet(ws4, r, 2, r, 2, primary, { fill: f, font: { size: 9.5, bold: true, color: { argb: C_EMERALD } }, alignment: { horizontal: 'center', vertical: 'middle' }, border: thinBorder(), numFmt: '#,##0' });
    mergeAndSet(ws4, r, 3, r, 3, secondary, { fill: f, font: { size: 9.5, bold: true, color: { argb: secondary > 0 ? C_CRIMSON : C_NAVY } }, alignment: { horizontal: 'center', vertical: 'middle' }, border: thinBorder(), numFmt: '#,##0' });
    mergeAndSet(ws4, r, 4, r, 4, { formula: `B${r}+C${r}`, result: total }, { fill: f, font: { size: 9.5, bold: true, color: { argb: C_NAVY } }, alignment: { horizontal: 'center', vertical: 'middle' }, border: thinBorder(), numFmt: '#,##0' });
    mergeAndSet(ws4, r, 5, r, 5, { formula: `IF(D${r}=0,"غير منطبق",B${r}/D${r})`, result: total > 0 ? primary / total : 'غير منطبق' }, { fill: f, font: { size: 9.5, color: { argb: C_ACCENT_BLUE } }, alignment: { horizontal: 'center', vertical: 'middle' }, border: thinBorder(), numFmt: '0.0%' });
    mergeAndSet(ws4, r, 6, r, 6, notes, { fill: f, font: { size: 9.5, color: { argb: C_NAVY } }, alignment: { horizontal: 'right', vertical: 'middle', wrapText: true }, border: thinBorder() });
  });

  // SHEET 5: الإنذار والتوصيات
  const ws5 = wb.addWorksheet('الإنذار والتوصيات', {
    views: [{ rightToLeft: true, showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  const rh5 = setupAnalyticsHeader(ws5, [18, 30, 34, 38, 24], 'مؤشرات الإنذار المبكر والتوصيات التنفيذية', 'Early Warnings & Executive Recommendations', assets.boardroom);
  let r5 = 6;
  addCorporateSectionBanner(ws5, rh5, r5++, 5, '15. مؤشرات الإنذار المبكر', 'Early Warning Indicators');
  ws5.getRow(r5).height = 22;
  ['درجة التنبيه', 'العنوان', 'المؤشر المرصود', 'المقارنة بالمعيار', 'القسم المعني'].forEach((h, i) => {
    mergeAndSet(ws5, r5, i + 1, r5, i + 1, h, { fill: C_BLUE, font: { size: 9.5, bold: true, color: { argb: C_WHITE } }, alignment: { horizontal: 'center', vertical: 'middle' }, border: thinBorder() });
  });
  r5++;

  if (bi.earlyWarnings.length === 0) {
    ws5.getRow(r5).height = 22;
    mergeAndSet(ws5, r5, 1, r5, 5, 'لا توجد مؤشرات إنذار مبكر حرجة في النطاق الحالي.', { fill: C_SLATE_ALT, font: { size: 9.5, color: { argb: C_TEXT_MUTED } }, alignment: { horizontal: 'center', vertical: 'middle' }, border: thinBorder() });
    r5 += 2;
  } else {
    bi.earlyWarnings.forEach((w, idx) => {
      const r = r5++;
      ws5.getRow(r).height = estimateWrappedRowHeight(
        [{ text: w.title, widthChars: 30 }, { text: w.comparisonText, widthChars: 38 }],
        24,
        10
      );
      const f = idx % 2 === 0 ? C_WHITE : C_SLATE_ALT;
      mergeAndSet(ws5, r, 1, r, 1, w.severity === 'critical' ? 'حرج' : w.severity === 'warning' ? 'تحذير' : 'تنبيه', { fill: f, font: { size: 9.5, bold: true, color: { argb: w.severity === 'critical' ? C_CRIMSON : C_NAVY } }, alignment: { horizontal: 'center', vertical: 'middle' }, border: thinBorder() });
      mergeAndSet(ws5, r, 2, r, 2, w.title, { fill: f, font: { size: 9.5, bold: true, color: { argb: C_NAVY } }, alignment: { horizontal: 'right', vertical: 'middle', wrapText: true }, border: thinBorder() });
      mergeAndSet(ws5, r, 3, r, 3, w.metricDisplay, { fill: f, font: { size: 9.5, color: { argb: C_NAVY } }, alignment: { horizontal: 'right', vertical: 'middle', wrapText: true }, border: thinBorder() });
      mergeAndSet(ws5, r, 4, r, 4, w.comparisonText, { fill: f, font: { size: 9.5, color: { argb: C_NAVY } }, alignment: { horizontal: 'right', vertical: 'middle', wrapText: true }, border: thinBorder() });
      mergeAndSet(ws5, r, 5, r, 5, w.targetSectionLabel, { fill: f, font: { size: 9.5, color: { argb: C_ACCENT_BLUE } }, alignment: { horizontal: 'right', vertical: 'middle', wrapText: true }, border: thinBorder() });
    });
    r5++;
  }

  addCorporateSectionBanner(ws5, rh5, r5++, 5, '16. النتائج والتوصيات التنفيذية للإدارة العليا', 'Executive Recommendations');
  ws5.getRow(r5).height = 22;
  ['الأولوية', 'التوصية التنفيذية', 'الدليل الرقمي من البيانات', 'الإجراء المقترح', 'الجهة المسؤولة والمؤشر'].forEach((h, i) => {
    mergeAndSet(ws5, r5, i + 1, r5, i + 1, h, { fill: C_BLUE, font: { size: 9.5, bold: true, color: { argb: C_WHITE } }, alignment: { horizontal: 'center', vertical: 'middle' }, border: thinBorder() });
  });
  r5++;

  bi.recommendations.forEach((rec, idx) => {
    const r = r5++;
    ws5.getRow(r).height = estimateWrappedRowHeight(
      [{ text: rec.title, widthChars: 30 }, { text: rec.evidenceText, widthChars: 34 }, { text: rec.actionText, widthChars: 38 }],
      34,
      10
    );
    const f = idx % 2 === 0 ? C_WHITE : C_SLATE_ALT;
    mergeAndSet(ws5, r, 1, r, 1, rec.priorityLabelAr, { fill: f, font: { size: 9.5, bold: true, color: { argb: C_NAVY } }, alignment: { horizontal: 'center', vertical: 'middle' }, border: thinBorder() });
    mergeAndSet(ws5, r, 2, r, 2, rec.title, { fill: f, font: { size: 9.5, bold: true, color: { argb: C_NAVY } }, alignment: { horizontal: 'right', vertical: 'middle', wrapText: true }, border: thinBorder() });
    mergeAndSet(ws5, r, 3, r, 3, rec.evidenceText, { fill: f, font: { size: 9.5, color: { argb: C_NAVY } }, alignment: { horizontal: 'right', vertical: 'middle', wrapText: true }, border: thinBorder() });
    mergeAndSet(ws5, r, 4, r, 4, rec.actionText, { fill: f, font: { size: 9.5, color: { argb: C_NAVY } }, alignment: { horizontal: 'right', vertical: 'middle', wrapText: true }, border: thinBorder() });
    mergeAndSet(ws5, r, 5, r, 5, `${rec.owner} | ${rec.suggestedKpi}`, { fill: f, font: { size: 9.5, color: { argb: C_NAVY } }, alignment: { horizontal: 'right', vertical: 'middle', wrapText: true }, border: thinBorder() });
  });

  [ws1, ws2, ws3, ws4, ws5].forEach((sheet) => {
    sheet.headerFooter.oddFooter =
      '&Rقسم إدارة المرافق | إدارة الخدمات العامة — شركة ساعد&Cمركز التحليل التنفيذي&Lصفحة &P من &N | إعداد وتصميم: خالد الهاشمي';
  });

  const rawBuffer = await wb.xlsx.writeBuffer();
  const bytes = rawBuffer instanceof Uint8Array ? rawBuffer : new Uint8Array(rawBuffer);
  const inspected = inspectGeneratedXlsxStructure(bytes, 5);

  const blob = new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = sanitizeFilename(
    `SAAED_FM_Executive_Analytics_${stamp}.xlsx`,
    'SAAED_FM_Executive_Analytics.xlsx'
  );
  triggerXlsxDownload(blob, filename);

  return {
    filename,
    sizeBytes: blob.size,
    sheetCount: inspected.sheetCount,
    embeddedMediaCount: inspected.mediaCount,
  };
}
