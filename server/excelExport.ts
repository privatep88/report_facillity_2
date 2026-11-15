import ExcelJS from 'exceljs';
import fs from 'node:fs';
import path from 'node:path';
import type {
  MaintenanceCategory,
  MaintenanceSite,
  MonthlyReportFull,
  PerformanceThresholds,
} from '../src/types/report.ts';
import {
  DEFAULT_THRESHOLDS,
  STATUS_LABELS_AR,
  TASK_STATUS_LABELS_AR,
} from '../src/types/report.ts';
import {
  computeLinkedReceptionTotals,
  computeReportMetrics,
  formatDateWestern,
  formatNumber,
  getMonthNameAr,
  getMonthNameEn,
  isLinkedReceptionActivity,
} from '../src/utils/calculations.ts';

function findHeroBannerPath(): string | null {
  const dir = path.join(process.cwd(), 'src', 'assets', 'images');
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir);
  const hero = files.find((f) => f.startsWith('hero_facility_panorama') && (f.endsWith('.jpg') || f.endsWith('.png')));
  return hero ? path.join(dir, hero) : null;
}

export async function generateMonthlyReportExcel(params: {
  report: MonthlyReportFull;
  sites: MaintenanceSite[];
  categories: MaintenanceCategory[];
  thresholds?: PerformanceThresholds;
}): Promise<Buffer> {
  const { report, sites, categories, thresholds = DEFAULT_THRESHOLDS } = params;
  const metrics = computeReportMetrics(report, sites, categories, thresholds);
  const monthAr = getMonthNameAr(report.month);
  const monthEn = getMonthNameEn(report.month);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'SAAED Facilities Management Executive System';
  wb.created = new Date();
  wb.modified = new Date();

  const ws = wb.addWorksheet('التقرير الشهري', {
    views: [{ rightToLeft: true, showGridLines: true }],
    pageSetup: {
      paperSize: 9, // A4
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: {
        left: 0.35,
        right: 0.35,
        top: 0.45,
        bottom: 0.55,
        header: 0.25,
        footer: 0.25,
      },
    },
    headerFooter: {
      oddFooter: `&Rقسم إدارة المرافق | إدارة الخدمات العامة — شركة ساعد للأنظمة المرورية&Cتصنيف: ${report.classification}&Lصفحة &P من &N | إعداد وتصميم: خالد الهاشمي`,
    },
  });

  // 14 Columns wide enough for the 12-category maintenance matrix + site name + total
  const colWidths = [16, 28, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 16];
  colWidths.forEach((w, idx) => {
    ws.getColumn(idx + 1).width = w;
  });

  const NAVY = 'FF0B2341';
  const BLUE = 'FF1769AA';
  const LIGHT_BLUE = 'FFEAF4FC';
  const GOLD = 'FFC8A85D';
  const EMERALD = 'FF069B74';
  const CRIMSON = 'FFC43D47';
  const SLATE_BG = 'FFF4F7FB';
  const WHITE = 'FFFFFFFF';
  const BORDER_GRAY = 'FFD1D9E6';

  const thinBorder: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: BORDER_GRAY } },
    left: { style: 'thin', color: { argb: BORDER_GRAY } },
    bottom: { style: 'thin', color: { argb: BORDER_GRAY } },
    right: { style: 'thin', color: { argb: BORDER_GRAY } },
  };

  // === CORPORATE HEADER BANNER (Rows 1-5) ===
  for (let r = 1; r <= 5; r++) {
    ws.getRow(r).height = r === 5 ? 6 : 24;
    for (let c = 1; c <= 14; c++) {
      const cell = ws.getCell(r, c);
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: r === 5 ? GOLD : NAVY },
      };
    }
  }

  ws.mergeCells('C1:K2');
  const titleCell = ws.getCell('C1');
  titleCell.value = 'التقرير الشهري لقسم إدارة المرافق';
  titleCell.font = { name: 'Cairo', size: 18, bold: true, color: { argb: WHITE } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

  ws.mergeCells('C3:K3');
  const subCell = ws.getCell('C3');
  subCell.value = `إدارة الخدمات العامة · شهر ${monthAr} ${report.year} · Facilities Management Monthly Report (${monthEn} ${report.year})`;
  subCell.font = { name: 'Cairo', size: 11, bold: true, color: { argb: GOLD } };
  subCell.alignment = { horizontal: 'center', vertical: 'middle' };

  ws.mergeCells('C4:K4');
  const metaCell = ws.getCell('C4');
  metaCell.value = `رقم التقرير: ${report.reportNumber}  |  الحالة: ${STATUS_LABELS_AR[report.status]}  |  الإصدار: v${report.currentVersion}  |  الشركة: ${report.company}`;
  metaCell.font = { name: 'Cairo', size: 9.5, color: { argb: 'FFE2E8F0' } };
  metaCell.alignment = { horizontal: 'center', vertical: 'middle' };

  // Embed SAAED Logo in top-right (Cols 1-2 in RTL = right side)
  const logoPath = path.join(process.cwd(), 'public', 'assets', 'aistudio', 'logo_1afd1154.png');
  if (fs.existsSync(logoPath)) {
    const logoId = wb.addImage({
      buffer: fs.readFileSync(logoPath) as unknown as ExcelJS.Buffer,
      extension: 'png',
    });
    ws.addImage(logoId, {
      tl: { col: 0.15, row: 0.25 },
      ext: { width: 155, height: 68 },
    });
  }

  // Embed Facility Panorama image on left side (Cols 12-14 in RTL = left side)
  const heroPath = findHeroBannerPath();
  if (heroPath && fs.existsSync(heroPath)) {
    const heroId = wb.addImage({
      buffer: fs.readFileSync(heroPath) as unknown as ExcelJS.Buffer,
      extension: 'jpeg',
    });
    ws.addImage(heroId, {
      tl: { col: 11.15, row: 0.18 },
      ext: { width: 205, height: 80 },
    });
  }

  let rowIdx = 7;

  const addSectionBanner = (arTitle: string, enTitle: string) => {
    ws.mergeCells(rowIdx, 1, rowIdx, 14);
    const cell = ws.getCell(rowIdx, 1);
    cell.value = `${arTitle}  ·  ${enTitle}`;
    cell.font = { name: 'Cairo', size: 12, bold: true, color: { argb: WHITE } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    cell.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
    ws.getRow(rowIdx).height = 24;
    rowIdx++;
  };

  // === SECTION 3 first (or Section 1 Executive Summary referencing Section 3 formulas!) ===
  // Let's reserve row numbers cleanly:
  // First write Section 1 Executive Summary at rows 8-10, and we'll wire its formulas directly to Section 3 Totals row!
  addSectionBanner('1. الملخص التنفيذي', 'Executive Summary');
  const execHeaderRow = rowIdx;
  const execValRow = rowIdx + 1;
  ws.getRow(execHeaderRow).height = 22;
  ws.getRow(execValRow).height = 28;

  // We know Section 3 (Services Summary) starts right below Section 2! Let's compute exact row indices:
  // Section 1: header + 2 rows + 1 spacer = 4 rows (rows 7..10)
  // Section 2 (Requests by Service): banner (12) + header (13) + 11 rows (14..24) + Total (25) + spacer (26)
  // Section 3 (Services Summary): banner (27) + header (28) + 11 rows (29..39) + Total (40)!
  const sec3FirstDataRow = rowIdx + 2 + 1 + 1 + 1 + 11 + 1 + 1 + 1 + 1; // let's verify dynamically after writing Section 3!
  void sec3FirstDataRow;

  const execCards = [
    { startCol: 1, endCol: 3, label: 'إجمالي الطلبات المستلمة | Total Requests', color: NAVY },
    { startCol: 4, endCol: 6, label: 'الطلبات المنفذة | Executed Requests', color: BLUE },
    { startCol: 7, endCol: 10, label: 'الخدمة الأعلى طلباً | Top Service Demand', color: GOLD },
    { startCol: 11, endCol: 14, label: 'نسبة الإنجاز الكلية | Overall Completion', color: EMERALD },
  ];

  execCards.forEach((card) => {
    ws.mergeCells(execHeaderRow, card.startCol, execHeaderRow, card.endCol);
    ws.mergeCells(execValRow, card.startCol, execValRow, card.endCol);
    const hCell = ws.getCell(execHeaderRow, card.startCol);
    hCell.value = card.label;
    hCell.font = { name: 'Cairo', size: 10, bold: true, color: { argb: WHITE } };
    hCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: card.color } };
    hCell.alignment = { horizontal: 'center', vertical: 'middle' };

    const vCell = ws.getCell(execValRow, card.startCol);
    vCell.font = { name: 'Cairo', size: 14, bold: true, color: { argb: NAVY } };
    vCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SLATE_BG } };
    vCell.alignment = { horizontal: 'center', vertical: 'middle' };
    for (let c = card.startCol; c <= card.endCol; c++) {
      ws.getCell(execHeaderRow, c).border = thinBorder;
      ws.getCell(execValRow, c).border = thinBorder;
    }
  });

  rowIdx += 3;

  // === SECTION 2: الطلبات حسب الخدمة ===
  addSectionBanner('2. نظرة عامة على الأداء — الطلبات حسب الخدمة', 'Performance Overview — Requests by Service');
  const sec2HeaderRow = rowIdx;
  ws.getRow(sec2HeaderRow).height = 22;
  ws.mergeCells(sec2HeaderRow, 1, sec2HeaderRow, 1);
  ws.mergeCells(sec2HeaderRow, 2, sec2HeaderRow, 6);
  ws.mergeCells(sec2HeaderRow, 7, sec2HeaderRow, 10);
  ws.mergeCells(sec2HeaderRow, 11, sec2HeaderRow, 14);

  const s2Headers: Array<[number, string]> = [
    [1, '#'],
    [2, 'الخدمة | Service'],
    [7, 'عدد الطلبات | Requests'],
    [11, 'التوزيع النسبي | Share %'],
  ];
  for (const [col, label] of s2Headers) {
    const cell = ws.getCell(sec2HeaderRow, col);
    cell.value = label;
    cell.font = { name: 'Cairo', size: 10, bold: true, color: { argb: WHITE } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  }
  for (let c = 1; c <= 14; c++) ws.getCell(sec2HeaderRow, c).border = thinBorder;
  rowIdx++;

  const sec2Start = rowIdx;
  const sec2TotalRow = sec2Start + report.services.length;
  let sec2ReceptionRow: number | null = null;

  report.services.forEach((svc, idx) => {
    const r = rowIdx;
    if (svc.serviceId === 'svc_reception') {
      sec2ReceptionRow = r;
    }
    ws.getRow(r).height = 20;
    ws.mergeCells(r, 2, r, 6);
    ws.mergeCells(r, 7, r, 10);
    ws.mergeCells(r, 11, r, 14);

    ws.getCell(r, 1).value = idx + 1;
    ws.getCell(r, 1).numFmt = '#,##0';
    ws.getCell(r, 2).value = `${svc.nameAr} (${svc.nameEn})`;
    ws.getCell(r, 7).value = svc.receivedCount;
    ws.getCell(r, 7).numFmt = '#,##0';
    ws.getCell(r, 11).value = {
      formula: `IF(G${sec2TotalRow}=0, 0, G${r}/G${sec2TotalRow})`,
    };
    ws.getCell(r, 11).numFmt = '0.0%';

    for (let c = 1; c <= 14; c++) {
      const cell = ws.getCell(r, c);
      cell.font = { name: 'Cairo', size: 10, color: { argb: NAVY } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: idx % 2 === 0 ? WHITE : SLATE_BG } };
      cell.alignment = { horizontal: c === 2 ? 'right' : 'center', vertical: 'middle' };
      cell.border = thinBorder;
    }
    rowIdx++;
  });

  // Sec 2 Total
  ws.getRow(rowIdx).height = 22;
  ws.mergeCells(rowIdx, 1, rowIdx, 6);
  ws.mergeCells(rowIdx, 7, rowIdx, 10);
  ws.mergeCells(rowIdx, 11, rowIdx, 14);
  ws.getCell(rowIdx, 1).value = 'الإجمالي العام | Total';
  ws.getCell(rowIdx, 7).value =
    report.services.length > 0 ? { formula: `SUM(G${sec2Start}:G${sec2TotalRow - 1})` } : 0;
  ws.getCell(rowIdx, 7).numFmt = '#,##0';
  ws.getCell(rowIdx, 11).value = { formula: `IF(G${rowIdx}=0, "لا تتوفر بيانات", 1)` };
  ws.getCell(rowIdx, 11).numFmt = '0.0%';
  for (let c = 1; c <= 14; c++) {
    const cell = ws.getCell(rowIdx, c);
    cell.font = { name: 'Cairo', size: 10.5, bold: true, color: { argb: WHITE } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = thinBorder;
  }
  rowIdx += 2;

  // === SECTION 3: ملخص الخدمات ===
  addSectionBanner('3. ملخص الخدمات ومؤشرات الإنجاز', 'Services Summary & Completion KPIs');
  const sec3HeaderRow = rowIdx;
  ws.getRow(sec3HeaderRow).height = 22;
  ws.mergeCells(sec3HeaderRow, 2, sec3HeaderRow, 5);
  ws.mergeCells(sec3HeaderRow, 6, sec3HeaderRow, 7);
  ws.mergeCells(sec3HeaderRow, 8, sec3HeaderRow, 9);
  ws.mergeCells(sec3HeaderRow, 10, sec3HeaderRow, 11);
  ws.mergeCells(sec3HeaderRow, 12, sec3HeaderRow, 14);

  const s3Headers: Array<[number, string]> = [
    [1, '#'],
    [2, 'الخدمة | Service'],
    [6, 'المستلمة | Received'],
    [8, 'المنفذة | Executed'],
    [10, 'نسبة الإنجاز | Completion %'],
    [12, 'مستوى الأداء | Performance Level'],
  ];
  for (const [col, label] of s3Headers) {
    const cell = ws.getCell(sec3HeaderRow, col);
    cell.value = label;
    cell.font = { name: 'Cairo', size: 10, bold: true, color: { argb: WHITE } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  }
  for (let c = 1; c <= 14; c++) ws.getCell(sec3HeaderRow, c).border = thinBorder;
  rowIdx++;

  const sec3Start = rowIdx;
  const sortedSummary = [...report.services].sort((a, b) => a.summaryOrder - b.summaryOrder);
  let sec3ReceptionRow: number | null = null;
  sortedSummary.forEach((svc, idx) => {
    const r = rowIdx;
    if (svc.serviceId === 'svc_reception') {
      sec3ReceptionRow = r;
    }
    ws.getRow(r).height = 20;
    ws.mergeCells(r, 2, r, 5);
    ws.mergeCells(r, 6, r, 7);
    ws.mergeCells(r, 8, r, 9);
    ws.mergeCells(r, 10, r, 11);
    ws.mergeCells(r, 12, r, 14);

    ws.getCell(r, 1).value = idx + 1;
    ws.getCell(r, 1).numFmt = '#,##0';
    ws.getCell(r, 2).value = `${svc.nameAr} (${svc.nameEn})`;
    ws.getCell(r, 6).value = svc.receivedCount;
    ws.getCell(r, 6).numFmt = '#,##0';
    ws.getCell(r, 8).value = svc.executedCount;
    ws.getCell(r, 8).numFmt = '#,##0';
    ws.getCell(r, 10).value = {
      formula: `IF(F${r}=0, "لا تتوفر بيانات", H${r}/F${r})`,
    };
    ws.getCell(r, 10).numFmt = '0.0%';
    ws.getCell(r, 12).value = {
      formula: `IF(F${r}=0, "—", IF(J${r}*100>=${thresholds.excellentMin}, "ممتاز", IF(J${r}*100>=${thresholds.veryGoodMin}, "جيد جداً", IF(J${r}*100>=${thresholds.goodMin}, "جيد", IF(J${r}*100>=${thresholds.needsImprovementMin}, "يحتاج تحسين", "منخفض / حرج")))))`,
    };

    for (let c = 1; c <= 14; c++) {
      const cell = ws.getCell(r, c);
      cell.font = { name: 'Cairo', size: 10, color: { argb: NAVY } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: idx % 2 === 0 ? WHITE : SLATE_BG } };
      cell.alignment = { horizontal: c === 2 ? 'right' : 'center', vertical: 'middle' };
      cell.border = thinBorder;
    }
    rowIdx++;
  });

  const sec3TotalRow = rowIdx;
  ws.getRow(sec3TotalRow).height = 22;
  ws.mergeCells(sec3TotalRow, 1, sec3TotalRow, 5);
  ws.mergeCells(sec3TotalRow, 6, sec3TotalRow, 7);
  ws.mergeCells(sec3TotalRow, 8, sec3TotalRow, 9);
  ws.mergeCells(sec3TotalRow, 10, sec3TotalRow, 11);
  ws.mergeCells(sec3TotalRow, 12, sec3TotalRow, 14);

  ws.getCell(sec3TotalRow, 1).value = 'الإجمالي | Total';
  ws.getCell(sec3TotalRow, 6).value =
    sortedSummary.length > 0 ? { formula: `SUM(F${sec3Start}:F${sec3TotalRow - 1})` } : 0;
  ws.getCell(sec3TotalRow, 6).numFmt = '#,##0';
  ws.getCell(sec3TotalRow, 8).value =
    sortedSummary.length > 0 ? { formula: `SUM(H${sec3Start}:H${sec3TotalRow - 1})` } : 0;
  ws.getCell(sec3TotalRow, 8).numFmt = '#,##0';
  ws.getCell(sec3TotalRow, 10).value = {
    formula: `IF(F${sec3TotalRow}=0, "لا تتوفر بيانات كافية", H${sec3TotalRow}/F${sec3TotalRow})`,
  };
  ws.getCell(sec3TotalRow, 10).numFmt = '0.0%';
  ws.getCell(sec3TotalRow, 12).value = `إجمالي الخدمات: ${formatNumber(report.services.length)}`;

  for (let c = 1; c <= 14; c++) {
    const cell = ws.getCell(sec3TotalRow, c);
    cell.font = { name: 'Cairo', size: 10.5, bold: true, color: { argb: WHITE } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = thinBorder;
  }

  // Now wire Section 1 Executive Summary formulas to Section 3 Totals!
  ws.getCell(execValRow, 1).value = { formula: `F${sec3TotalRow}` };
  ws.getCell(execValRow, 1).numFmt = '#,##0';
  ws.getCell(execValRow, 4).value = { formula: `H${sec3TotalRow}` };
  ws.getCell(execValRow, 4).numFmt = '#,##0';
  ws.getCell(execValRow, 7).value = metrics.topService
    ? `${metrics.topService.nameAr} (${formatNumber(metrics.topService.receivedCount)})`
    : 'لا تتوفر بيانات كافية';
  ws.getCell(execValRow, 11).value = {
    formula: `IF(F${sec3TotalRow}=0, "لا تتوفر بيانات كافية", H${sec3TotalRow}/F${sec3TotalRow})`,
  };
  ws.getCell(execValRow, 11).numFmt = '0.0%';

  rowIdx += 2;

  // === SECTION 4: العقود والرخص ===
  addSectionBanner('4. العقود والرخص', 'Contracts & Licenses');
  ws.getRow(rowIdx).height = 22;
  ws.mergeCells(rowIdx, 1, rowIdx, 3);
  ws.mergeCells(rowIdx, 4, rowIdx, 5);
  ws.mergeCells(rowIdx, 6, rowIdx, 7);
  ws.mergeCells(rowIdx, 8, rowIdx, 9);
  ws.mergeCells(rowIdx, 10, rowIdx, 14);
  [
    [1, 'الفئة | Category'],
    [4, 'الفعّالة | Active'],
    [6, 'غير الفعّالة | Inactive'],
    [8, 'الإجمالي | Total'],
    [10, 'الملاحظات | Notes'],
  ].forEach(([col, label]) => {
    const c = ws.getCell(rowIdx, Number(col));
    c.value = String(label);
    c.font = { name: 'Cairo', size: 10, bold: true, color: { argb: WHITE } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  for (let c = 1; c <= 14; c++) ws.getCell(rowIdx, c).border = thinBorder;
  rowIdx++;

  report.contracts.forEach((con, idx) => {
    const r = rowIdx;
    ws.getRow(r).height = 22;
    ws.mergeCells(r, 1, r, 3);
    ws.mergeCells(r, 4, r, 5);
    ws.mergeCells(r, 6, r, 7);
    ws.mergeCells(r, 8, r, 9);
    ws.mergeCells(r, 10, r, 14);

    ws.getCell(r, 1).value = `${con.nameAr} (${con.nameEn})`;
    ws.getCell(r, 4).value = con.activeCount;
    ws.getCell(r, 4).numFmt = '#,##0';
    ws.getCell(r, 6).value = con.inactiveCount;
    ws.getCell(r, 6).numFmt = '#,##0';
    ws.getCell(r, 8).value = { formula: `D${r}+F${r}` };
    ws.getCell(r, 8).numFmt = '#,##0';
    ws.getCell(r, 10).value = con.notes || '—';

    for (let c = 1; c <= 14; c++) {
      const cell = ws.getCell(r, c);
      cell.font = {
        name: 'Cairo',
        size: 10,
        bold: c === 4 || c === 6,
        color: { argb: c === 4 ? EMERALD : c === 6 && con.inactiveCount > 0 ? CRIMSON : NAVY },
      };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: idx % 2 === 0 ? WHITE : SLATE_BG } };
      cell.alignment = { horizontal: c === 1 || c === 10 ? 'right' : 'center', vertical: 'middle', wrapText: true };
      cell.border = thinBorder;
    }
    rowIdx++;
  });
  rowIdx++;

  // === SECTION 5: الطفايات وملاحظات المخاطر ===
  addSectionBanner('5. الطفايات وملاحظات المخاطر', 'Fire Extinguishers & Hazard Observations');
  ws.getRow(rowIdx).height = 22;
  ws.mergeCells(rowIdx, 1, rowIdx, 3);
  ws.mergeCells(rowIdx, 4, rowIdx, 5);
  ws.mergeCells(rowIdx, 6, rowIdx, 7);
  ws.mergeCells(rowIdx, 8, rowIdx, 9);
  ws.mergeCells(rowIdx, 10, rowIdx, 14);
  [
    [1, 'البند | Category'],
    [4, 'فعّالة / مغلقة'],
    [6, 'غير فعّالة / غير مغلقة'],
    [8, 'الإجمالي | Total'],
    [10, 'الملاحظات | Notes'],
  ].forEach(([col, label]) => {
    const c = ws.getCell(rowIdx, Number(col));
    c.value = String(label);
    c.font = { name: 'Cairo', size: 10, bold: true, color: { argb: WHITE } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  for (let c = 1; c <= 14; c++) ws.getCell(rowIdx, c).border = thinBorder;
  rowIdx++;

  report.safety.forEach((sf, idx) => {
    const r = rowIdx;
    ws.getRow(r).height = 22;
    ws.mergeCells(r, 1, r, 3);
    ws.mergeCells(r, 4, r, 5);
    ws.mergeCells(r, 6, r, 7);
    ws.mergeCells(r, 8, r, 9);
    ws.mergeCells(r, 10, r, 14);

    ws.getCell(r, 1).value = `${sf.nameAr} (${sf.nameEn})`;
    ws.getCell(r, 4).value = sf.primaryCount;
    ws.getCell(r, 4).numFmt = '#,##0';
    ws.getCell(r, 6).value = sf.secondaryCount;
    ws.getCell(r, 6).numFmt = '#,##0';
    ws.getCell(r, 8).value = { formula: `D${r}+F${r}` };
    ws.getCell(r, 8).numFmt = '#,##0';
    ws.getCell(r, 10).value = sf.notes || '—';

    for (let c = 1; c <= 14; c++) {
      const cell = ws.getCell(r, c);
      cell.font = {
        name: 'Cairo',
        size: 10,
        bold: c === 4 || c === 6,
        color: { argb: c === 4 ? EMERALD : c === 6 && sf.secondaryCount > 0 ? CRIMSON : NAVY },
      };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: idx % 2 === 0 ? WHITE : SLATE_BG } };
      cell.alignment = { horizontal: c === 1 || c === 10 ? 'right' : 'center', vertical: 'middle', wrapText: true };
      cell.border = thinBorder;
    }
    rowIdx++;
  });
  rowIdx++;

  // === SECTION 6: تفاصيل الصيانة (المصفوفة والتكاليف) ===
  addSectionBanner('6. تفاصيل الصيانة حسب المقر والفئة والتكاليف (AED)', 'Maintenance Details Matrix & Financial Costs');
  const activeCategories = categories.slice(0, 12);
  // Note: if user added > 12 categories, adjust columns cleanly; base 12 fit nicely in cols 2..13 + total in col 14!
  const maintHeaderRow = rowIdx;
  ws.getRow(maintHeaderRow).height = 30;
  ws.getCell(maintHeaderRow, 1).value = 'المقر | Site';
  activeCategories.forEach((cat, idx) => {
    ws.getCell(maintHeaderRow, idx + 2).value = cat.nameAr;
  });
  ws.getCell(maintHeaderRow, 14).value = 'إجمالي المقر';
  for (let c = 1; c <= 14; c++) {
    const cell = ws.getCell(maintHeaderRow, c);
    cell.font = { name: 'Cairo', size: 9, bold: true, color: { argb: WHITE } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = thinBorder;
  }
  rowIdx++;

  const maintDataStart = rowIdx;
  sites.forEach((site, idx) => {
    const r = rowIdx;
    ws.getRow(r).height = 20;
    ws.getCell(r, 1).value = site.nameAr;
    activeCategories.forEach((cat, cIdx) => {
      const val = report.maintenanceMatrix[site.id]?.[cat.id] ?? 0;
      ws.getCell(r, cIdx + 2).value = val;
      ws.getCell(r, cIdx + 2).numFmt = '#,##0';
    });
    ws.getCell(r, 14).value = { formula: `SUM(B${r}:M${r})` };
    ws.getCell(r, 14).numFmt = '#,##0';
    for (let c = 1; c <= 14; c++) {
      const cell = ws.getCell(r, c);
      cell.font = { name: 'Cairo', size: 9.5, bold: c === 1 || c === 14, color: { argb: NAVY } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: idx % 2 === 0 ? WHITE : SLATE_BG } };
      cell.alignment = { horizontal: c === 1 ? 'right' : 'center', vertical: 'middle' };
      cell.border = thinBorder;
    }
    rowIdx++;
  });
  const maintDataEnd = rowIdx - 1;

  // Totals row for faults
  const maintFaultTotalRow = rowIdx;
  ws.getRow(maintFaultTotalRow).height = 22;
  ws.getCell(maintFaultTotalRow, 1).value = 'إجمالي الأعطال';
  activeCategories.forEach((_, cIdx) => {
    const colLetter = ws.getColumn(cIdx + 2).letter;
    ws.getCell(maintFaultTotalRow, cIdx + 2).value = { formula: `SUM(${colLetter}${maintDataStart}:${colLetter}${maintDataEnd})` };
    ws.getCell(maintFaultTotalRow, cIdx + 2).numFmt = '#,##0';
  });
  ws.getCell(maintFaultTotalRow, 14).value = { formula: `SUM(N${maintDataStart}:N${maintDataEnd})` };
  ws.getCell(maintFaultTotalRow, 14).numFmt = '#,##0';
  for (let c = 1; c <= 14; c++) {
    const cell = ws.getCell(maintFaultTotalRow, c);
    cell.font = { name: 'Cairo', size: 9.5, bold: true, color: { argb: WHITE } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } };
    cell.alignment = { horizontal: c === 1 ? 'right' : 'center', vertical: 'middle' };
    cell.border = thinBorder;
  }
  rowIdx++;

  // Cost Row 1: Petty Cash AED
  const pettyRow = rowIdx;
  ws.getRow(pettyRow).height = 21;
  ws.getCell(pettyRow, 1).value = 'التكلفة / النثرية (AED)';
  activeCategories.forEach((cat, cIdx) => {
    const cell = ws.getCell(pettyRow, cIdx + 2);
    cell.value = report.maintenanceCosts[cat.id]?.pettyCashAed ?? 0;
    cell.numFmt = '#,##0.00';
  });
  ws.getCell(pettyRow, 14).value = { formula: `SUM(B${pettyRow}:M${pettyRow})` };
  ws.getCell(pettyRow, 14).numFmt = '#,##0.00 "AED"';
  for (let c = 1; c <= 14; c++) {
    const cell = ws.getCell(pettyRow, c);
    cell.font = { name: 'Cairo', size: 9, bold: c === 1 || c === 14, color: { argb: NAVY } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT_BLUE } };
    cell.alignment = { horizontal: c === 1 ? 'right' : 'center', vertical: 'middle' };
    cell.border = thinBorder;
  }
  rowIdx++;

  // Cost Row 2: Purchase Order AED
  const poRow = rowIdx;
  ws.getRow(poRow).height = 21;
  ws.getCell(poRow, 1).value = 'التكلفة / أمر شراء (AED)';
  activeCategories.forEach((cat, cIdx) => {
    const cell = ws.getCell(poRow, cIdx + 2);
    cell.value = report.maintenanceCosts[cat.id]?.purchaseOrderAed ?? 0;
    cell.numFmt = '#,##0.00';
  });
  ws.getCell(poRow, 14).value = { formula: `SUM(B${poRow}:M${poRow})` };
  ws.getCell(poRow, 14).numFmt = '#,##0.00 "AED"';
  for (let c = 1; c <= 14; c++) {
    const cell = ws.getCell(poRow, c);
    cell.font = { name: 'Cairo', size: 9, bold: c === 1 || c === 14, color: { argb: NAVY } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT_BLUE } };
    cell.alignment = { horizontal: c === 1 ? 'right' : 'center', vertical: 'middle' };
    cell.border = thinBorder;
  }
  rowIdx += 2;

  // === SECTION 7: خدمات الصيانة ===
  addSectionBanner('7. خدمات الصيانة (مصادر الطلبات)', 'Maintenance Services Sources');
  const msStart = rowIdx;
  const msRows: Array<[string, number]> = [
    ['عدد طلبات الصيانة الواردة من قسم المرافق', report.maintenanceServices.fromFacilitiesDept],
    ['عدد طلبات الصيانة الواردة من الإدارات الأخرى', report.maintenanceServices.fromOtherDepts],
  ];
  msRows.forEach(([label, val], idx) => {
    const r = rowIdx;
    ws.getRow(r).height = 20;
    ws.mergeCells(r, 1, r, 10);
    ws.mergeCells(r, 11, r, 14);
    ws.getCell(r, 1).value = label;
    ws.getCell(r, 11).value = val;
    ws.getCell(r, 11).numFmt = '#,##0';
    for (let c = 1; c <= 14; c++) {
      const cell = ws.getCell(r, c);
      cell.font = { name: 'Cairo', size: 10, color: { argb: NAVY } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: idx % 2 === 0 ? WHITE : SLATE_BG } };
      cell.alignment = { horizontal: c <= 10 ? 'right' : 'center', vertical: 'middle' };
      cell.border = thinBorder;
    }
    rowIdx++;
  });
  ws.getRow(rowIdx).height = 21;
  ws.mergeCells(rowIdx, 1, rowIdx, 10);
  ws.mergeCells(rowIdx, 11, rowIdx, 14);
  ws.getCell(rowIdx, 1).value = 'الإجمالي | Total';
  ws.getCell(rowIdx, 11).value = { formula: `SUM(K${msStart}:K${rowIdx - 1})` };
  ws.getCell(rowIdx, 11).numFmt = '#,##0';
  for (let c = 1; c <= 14; c++) {
    const cell = ws.getCell(rowIdx, c);
    cell.font = { name: 'Cairo', size: 10, bold: true, color: { argb: WHITE } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    cell.alignment = { horizontal: c <= 10 ? 'right' : 'center', vertical: 'middle' };
    cell.border = thinBorder;
  }
  rowIdx += 2;

  // === SECTION 8: الدعم اللوجستي ===
  addSectionBanner('8. الدعم اللوجستي', 'Logistics Operations');
  ws.getRow(rowIdx).height = 22;
  ws.mergeCells(rowIdx, 1, rowIdx, 2);
  const logCols = [
    { col: 3, end: 4, label: 'المندوب' },
    { col: 5, end: 6, label: 'بريد الإمارات' },
    { col: 7, end: 8, label: 'أرامكس' },
    { col: 9, end: 10, label: 'توزيع' },
    { col: 11, end: 12, label: 'أخرى' },
    { col: 13, end: 14, label: 'الإجمالي' },
  ];
  ws.getCell(rowIdx, 1).value = 'البيان';
  logCols.forEach((lc) => {
    ws.mergeCells(rowIdx, lc.col, rowIdx, lc.end);
    ws.getCell(rowIdx, lc.col).value = lc.label;
  });
  for (let c = 1; c <= 14; c++) {
    const cell = ws.getCell(rowIdx, c);
    cell.font = { name: 'Cairo', size: 10, bold: true, color: { argb: WHITE } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = thinBorder;
  }
  rowIdx++;

  const logReqRow = rowIdx;
  const logPctRow = rowIdx + 1;
  ws.getRow(logReqRow).height = 20;
  ws.getRow(logPctRow).height = 20;

  ws.mergeCells(logReqRow, 1, logReqRow, 2);
  ws.mergeCells(logPctRow, 1, logPctRow, 2);
  ws.getCell(logReqRow, 1).value = 'الطلبات';
  ws.getCell(logPctRow, 1).value = 'النسبة المئوية';

  report.logistics.slice(0, 5).forEach((ch, idx) => {
    const lc = logCols[idx];
    ws.mergeCells(logReqRow, lc.col, logReqRow, lc.end);
    ws.mergeCells(logPctRow, lc.col, logPctRow, lc.end);
    ws.getCell(logReqRow, lc.col).value = ch.requestCount;
    ws.getCell(logReqRow, lc.col).numFmt = '#,##0';
    const colLetter = ws.getColumn(lc.col).letter;
    ws.getCell(logPctRow, lc.col).value = {
      formula: `IF(M${logReqRow}=0, 0, ${colLetter}${logReqRow}/M${logReqRow})`,
    };
    ws.getCell(logPctRow, lc.col).numFmt = '0.0%';
  });

  ws.mergeCells(logReqRow, 13, logReqRow, 14);
  ws.mergeCells(logPctRow, 13, logPctRow, 14);
  ws.getCell(logReqRow, 13).value = { formula: `C${logReqRow}+E${logReqRow}+G${logReqRow}+I${logReqRow}+K${logReqRow}` };
  ws.getCell(logReqRow, 13).numFmt = '#,##0';
  ws.getCell(logPctRow, 13).value = { formula: `IF(M${logReqRow}=0, "—", 1)` };
  ws.getCell(logPctRow, 13).numFmt = '0.0%';

  for (const r of [logReqRow, logPctRow]) {
    for (let c = 1; c <= 14; c++) {
      const cell = ws.getCell(r, c);
      cell.font = { name: 'Cairo', size: 10, bold: c <= 2 || c >= 13, color: { argb: NAVY } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: r === logReqRow ? WHITE : SLATE_BG } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = thinBorder;
    }
  }
  rowIdx += 3;

  // === SECTION 9: خدمات الأمن والاستقبال ===
  addSectionBanner('9. خدمات الأمن والاستقبال', 'Security & Reception Services');
  ws.getRow(rowIdx).height = 24;
  ws.mergeCells(rowIdx, 1, rowIdx, 4);
  ws.mergeCells(rowIdx, 5, rowIdx, 7);
  ws.mergeCells(rowIdx, 8, rowIdx, 10);
  ws.mergeCells(rowIdx, 11, rowIdx, 14);
  [
    [1, 'البيان / النشاط | Activity'],
    [5, 'الطلبات المستلمة | Received'],
    [8, 'الطلبات المنفذة | Executed'],
    [11, 'نسبة الإنجاز | Completion %'],
  ].forEach(([col, label]) => {
    const c = ws.getCell(rowIdx, Number(col));
    c.value = String(label);
    c.font = { name: 'Cairo', size: 10, bold: true, color: { argb: WHITE } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  for (let c = 1; c <= 14; c++) ws.getCell(rowIdx, c).border = thinBorder;
  rowIdx++;

  const sec9DataStart = rowIdx;
  const sec9LinkedRows: number[] = [];
  report.securityReception.forEach((sr, idx) => {
    const r = rowIdx;
    if (isLinkedReceptionActivity(sr)) {
      sec9LinkedRows.push(r);
    }
    ws.getRow(r).height = 20;
    ws.mergeCells(r, 1, r, 4);
    ws.mergeCells(r, 5, r, 7);
    ws.mergeCells(r, 8, r, 10);
    ws.mergeCells(r, 11, r, 14);
    ws.getCell(r, 1).value = sr.nameEn && sr.nameEn !== sr.nameAr ? `${sr.nameAr} (${sr.nameEn})` : sr.nameAr;
    ws.getCell(r, 5).value = sr.receivedCount;
    ws.getCell(r, 5).numFmt = '#,##0';
    ws.getCell(r, 8).value = sr.executedCount;
    ws.getCell(r, 8).numFmt = '#,##0';
    ws.getCell(r, 11).value = { formula: `IF(E${r}=0, "لا تتوفر بيانات", H${r}/E${r})` };
    ws.getCell(r, 11).numFmt = '0.0%';

    for (let c = 1; c <= 14; c++) {
      const cell = ws.getCell(r, c);
      cell.font = { name: 'Cairo', size: 10, color: { argb: NAVY } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: idx % 2 === 0 ? WHITE : SLATE_BG } };
      cell.alignment = { horizontal: c === 1 ? 'right' : 'center', vertical: 'middle', wrapText: true };
      cell.border = thinBorder;
    }
    rowIdx++;
  });
  const sec9DataEnd = rowIdx - 1;
  const sec9TotalRow = rowIdx;
  ws.getRow(sec9TotalRow).height = 22;
  ws.mergeCells(sec9TotalRow, 1, sec9TotalRow, 4);
  ws.mergeCells(sec9TotalRow, 5, sec9TotalRow, 7);
  ws.mergeCells(sec9TotalRow, 8, sec9TotalRow, 10);
  ws.mergeCells(sec9TotalRow, 11, sec9TotalRow, 14);
  ws.getCell(sec9TotalRow, 1).value = `الإجمالي · Total (${formatNumber(report.securityReception.length)})`;
  ws.getCell(sec9TotalRow, 5).value =
    report.securityReception.length > 0 ? { formula: `SUM(E${sec9DataStart}:E${sec9DataEnd})` } : 0;
  ws.getCell(sec9TotalRow, 5).numFmt = '#,##0';
  ws.getCell(sec9TotalRow, 8).value =
    report.securityReception.length > 0 ? { formula: `SUM(H${sec9DataStart}:H${sec9DataEnd})` } : 0;
  ws.getCell(sec9TotalRow, 8).numFmt = '#,##0';
  ws.getCell(sec9TotalRow, 11).value = {
    formula: `IF(E${sec9TotalRow}=0, "لا تتوفر بيانات", H${sec9TotalRow}/E${sec9TotalRow})`,
  };
  ws.getCell(sec9TotalRow, 11).numFmt = '0.0%';
  for (let c = 1; c <= 14; c++) {
    const cell = ws.getCell(sec9TotalRow, c);
    cell.font = { name: 'Cairo', size: 10, bold: true, color: { argb: WHITE } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    cell.alignment = { horizontal: c === 1 ? 'right' : 'center', vertical: 'middle' };
    cell.border = thinBorder;
  }

  // Wire Reception Services (svc_reception) in Sections 2 & 3 automatically to Visitors + Vendor Visitors rows
  if (sec9LinkedRows.length > 0) {
    const linkedTotals = computeLinkedReceptionTotals(report.securityReception);
    const receptionSvc = report.services.find((s) => s.serviceId === 'svc_reception');
    const valuesMatchOrDraft =
      report.status === 'draft' ||
      (receptionSvc &&
        receptionSvc.receivedCount === linkedTotals.receivedCount &&
        receptionSvc.executedCount === linkedTotals.executedCount);

    if (valuesMatchOrDraft) {
      const recFormula = sec9LinkedRows.map((r) => `E${r}`).join('+');
      const execFormula = sec9LinkedRows.map((r) => `H${r}`).join('+');
      if (sec2ReceptionRow !== null) {
        ws.getCell(sec2ReceptionRow, 7).value = { formula: recFormula };
        ws.getCell(sec2ReceptionRow, 7).numFmt = '#,##0';
      }
      if (sec3ReceptionRow !== null) {
        ws.getCell(sec3ReceptionRow, 6).value = { formula: recFormula };
        ws.getCell(sec3ReceptionRow, 6).numFmt = '#,##0';
        ws.getCell(sec3ReceptionRow, 8).value = { formula: execFormula };
        ws.getCell(sec3ReceptionRow, 8).numFmt = '#,##0';
      }
    }
  }
  rowIdx += 2;

  // === SECTION 10: المهام والتحديات ===
  addSectionBanner('10. المهام التشغيلية والمتابعة', 'Operational Tasks & Tracking');
  ws.getRow(rowIdx).height = 22;
  ws.mergeCells(rowIdx, 2, rowIdx, 4);
  ws.mergeCells(rowIdx, 5, rowIdx, 9);
  ws.mergeCells(rowIdx, 10, rowIdx, 11);
  ws.mergeCells(rowIdx, 12, rowIdx, 14);
  [
    [1, '#'],
    [2, 'الموضوع | Topic'],
    [5, 'المهمة | Task'],
    [10, 'الحالة | Status'],
    [12, 'نسبة الإنجاز | %'],
  ].forEach(([col, label]) => {
    const c = ws.getCell(rowIdx, Number(col));
    c.value = String(label);
    c.font = { name: 'Cairo', size: 10, bold: true, color: { argb: WHITE } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  for (let c = 1; c <= 14; c++) ws.getCell(rowIdx, c).border = thinBorder;
  rowIdx++;

  report.tasks.forEach((t, idx) => {
    const r = rowIdx;
    const lineEst = Math.max(1, Math.ceil((t.taskName.length || 1) / 45));
    ws.getRow(r).height = Math.max(22, lineEst * 18);
    ws.mergeCells(r, 2, r, 4);
    ws.mergeCells(r, 5, r, 9);
    ws.mergeCells(r, 10, r, 11);
    ws.mergeCells(r, 12, r, 14);

    ws.getCell(r, 1).value = idx + 1;
    ws.getCell(r, 1).numFmt = '#,##0';
    ws.getCell(r, 2).value = t.topic || '—';
    ws.getCell(r, 5).value = t.taskName || '—';
    ws.getCell(r, 10).value = TASK_STATUS_LABELS_AR[t.status];
    ws.getCell(r, 12).value = (t.completionPct || 0) / 100;
    ws.getCell(r, 12).numFmt = '0%';

    for (let c = 1; c <= 14; c++) {
      const cell = ws.getCell(r, c);
      cell.font = { name: 'Cairo', size: 10, color: { argb: NAVY } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: idx % 2 === 0 ? WHITE : SLATE_BG } };
      cell.alignment = { horizontal: c === 2 || c === 5 ? 'right' : 'center', vertical: 'middle', wrapText: true };
      cell.border = thinBorder;
    }
    rowIdx++;
  });
  rowIdx++;

  // === SECTION 11: التحديات والتوصيات ===
  addSectionBanner('11. التحديات والتوصيات', 'Challenges & Recommendations');
  ws.getRow(rowIdx).height = 22;
  ws.mergeCells(rowIdx, 2, rowIdx, 5);
  ws.mergeCells(rowIdx, 6, rowIdx, 10);
  ws.mergeCells(rowIdx, 11, rowIdx, 14);
  [
    [1, '#'],
    [2, 'التحديات والعوائق | Challenges'],
    [6, 'التحديث | Update'],
    [11, 'التوصية | Recommendation'],
  ].forEach(([col, label]) => {
    const c = ws.getCell(rowIdx, Number(col));
    c.value = String(label);
    c.font = { name: 'Cairo', size: 10, bold: true, color: { argb: WHITE } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  for (let c = 1; c <= 14; c++) ws.getCell(rowIdx, c).border = thinBorder;
  rowIdx++;

  report.challenges.forEach((ch, idx) => {
    const r = rowIdx;
    const maxLen = Math.max(ch.challengeText.length, ch.updateText.length, ch.recommendationText.length, 30);
    const lines = Math.max(2, Math.ceil(maxLen / 42));
    ws.getRow(r).height = Math.max(28, lines * 18);

    ws.mergeCells(r, 2, r, 5);
    ws.mergeCells(r, 6, r, 10);
    ws.mergeCells(r, 11, r, 14);

    ws.getCell(r, 1).value = idx + 1;
    ws.getCell(r, 1).numFmt = '#,##0';
    ws.getCell(r, 2).value = ch.challengeText || '—';
    ws.getCell(r, 6).value = ch.updateText || '—';
    ws.getCell(r, 11).value = ch.recommendationText || '—';

    for (let c = 1; c <= 14; c++) {
      const cell = ws.getCell(r, c);
      cell.font = { name: 'Cairo', size: 10, color: { argb: NAVY } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: idx % 2 === 0 ? WHITE : SLATE_BG } };
      cell.alignment = { horizontal: c === 1 ? 'center' : 'right', vertical: 'middle', wrapText: true };
      cell.border = thinBorder;
    }
    rowIdx++;
  });
  rowIdx++;

  // === SECTION 12: الإعداد والاعتماد ===
  addSectionBanner('12. الإعداد والمراجعة والاعتماد', 'Preparation, Review & Approval');
  const signRows: Array<{
    roleLabel: string;
    name: string;
    title: string;
    sig: string;
    sigImage: string | null;
  }> = [
    {
      roleLabel: 'معد التقرير | Preparation',
      name: report.preparerName || '—',
      title: report.preparerTitle || '—',
      sig: [
        report.preparerSignatureHash || (report.preparerSignatureImage ? 'توقيع مرفق / مرسوم' : 'قيد الإعداد'),
        report.preparedAt ? `(${formatDateWestern(report.preparedAt)})` : '',
      ]
        .filter(Boolean)
        .join(' '),
      sigImage: report.preparerSignatureImage || null,
    },
    {
      roleLabel: 'المراجع | Review',
      name: report.reviewerName || '—',
      title: report.reviewerTitle || '—',
      sig: report.reviewedAt ? `تمت المراجعة (${formatDateWestern(report.reviewedAt)})` : 'بانتظار المراجعة',
      sigImage: null,
    },
    {
      roleLabel: 'المعتمد | Approval',
      name: report.approverName || '—',
      title: report.approverTitle || '—',
      sig: [
        report.approverSignatureHash || (report.approverSignatureImage ? 'توقيع مرفق / مرسوم' : 'بانتظار الاعتماد'),
        report.approvedAt ? `(${formatDateWestern(report.approvedAt)})` : '',
      ]
        .filter(Boolean)
        .join(' '),
      sigImage: report.approverSignatureImage || null,
    },
  ];

  signRows.forEach(({ roleLabel, name, title, sig, sigImage }) => {
    const r = rowIdx;
    const match = sigImage?.match(/^data:image\/(png|jpeg|jpg);base64,([A-Za-z0-9+/=]+)$/);
    ws.getRow(r).height = match ? 48 : 22;
    ws.mergeCells(r, 1, r, 3);
    ws.mergeCells(r, 4, r, 6);
    ws.mergeCells(r, 7, r, 9);
    ws.mergeCells(r, 10, r, 12);
    ws.mergeCells(r, 13, r, 14);
    ws.getCell(r, 1).value = roleLabel;
    ws.getCell(r, 4).value = name;
    ws.getCell(r, 7).value = title;
    ws.getCell(r, 10).value = sig;
    ws.getCell(r, 13).value = match ? '' : '—';
    for (let c = 1; c <= 14; c++) {
      const cell = ws.getCell(r, c);
      cell.font = { name: 'Cairo', size: 10, bold: c <= 3, color: { argb: NAVY } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: WHITE } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = thinBorder;
    }
    if (match) {
      const ext = match[1] === 'png' ? 'png' : 'jpeg';
      const imgId = wb.addImage({
        base64: match[2],
        extension: ext,
      });
      ws.addImage(imgId, {
        tl: { col: 12.15, row: r - 0.92 },
        ext: { width: 125, height: 42 },
      });
    }
    rowIdx++;
  });

  // Official Attestation ONLY if actually approved/archived
  if (report.status === 'approved' || report.status === 'archived') {
    ws.mergeCells(rowIdx, 1, rowIdx, 14);
    const att = ws.getCell(rowIdx, 1);
    att.value = '«هذا التقرير معتمد ومراجع وفقاً للسياسات والإجراءات المعمول بها في قسم إدارة المرافق»';
    att.font = { name: 'Cairo', size: 10.5, bold: true, color: { argb: EMERALD } };
    att.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECFDF5' } };
    att.alignment = { horizontal: 'center', vertical: 'middle' };
    att.border = thinBorder;
    ws.getRow(rowIdx).height = 24;
    rowIdx++;
  }

  // Corporate Footer Row
  rowIdx++;
  ws.mergeCells(rowIdx, 1, rowIdx, 14);
  const foot = ws.getCell(rowIdx, 1);
  foot.value = 'قسم إدارة المرافق | إدارة الخدمات العامة — شركة ساعد للأنظمة المرورية   ·   إعداد وتصميم: خالد الهاشمي | Prepared & Designed by Khaled Al Hashemi';
  foot.font = { name: 'Cairo', size: 9, bold: true, color: { argb: GOLD } };
  foot.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
  foot.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(rowIdx).height = 22;

  ws.pageSetup.printArea = `A1:N${rowIdx}`;

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
