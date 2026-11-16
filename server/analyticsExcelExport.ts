import ExcelJS from 'exceljs';
import fs from 'node:fs';
import path from 'node:path';
import type {
  MaintenanceCategory,
  MaintenanceSite,
  MonthlyReportFull,
  PerformanceThresholds,
} from '../src/types/report.ts';
import { DEFAULT_THRESHOLDS } from '../src/types/report.ts';
import {
  computeAnalyticsEngine,
  type AnalyticsFilters,
} from '../src/services/AnalyticsEngineService.ts';
import { formatNumber, formatPct } from '../src/utils/calculations.ts';

function findImagePath(prefix: string): string | null {
  const dir = path.join(process.cwd(), 'src', 'assets', 'images');
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir);
  const found = files.find(
    (f) => f.startsWith(prefix) && (f.endsWith('.jpg') || f.endsWith('.png'))
  );
  return found ? path.join(dir, found) : null;
}

export async function generateExecutiveAnalyticsExcel(params: {
  reports: MonthlyReportFull[];
  sites: MaintenanceSite[];
  categories: MaintenanceCategory[];
  thresholds?: PerformanceThresholds;
  filters: AnalyticsFilters;
}): Promise<Buffer> {
  const {
    reports,
    sites,
    categories,
    thresholds = DEFAULT_THRESHOLDS,
    filters,
  } = params;

  const bi = computeAnalyticsEngine({
    reports,
    sites,
    categories,
    thresholds,
    filters,
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = 'SAAED Facilities Management Executive Intelligence Center';
  wb.created = new Date();
  wb.modified = new Date();

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

  const setupSheetHeader = (
    ws: ExcelJS.Worksheet,
    totalCols: number,
    sheetTitleAr: string,
    sheetTitleEn: string
  ) => {
    for (let r = 1; r <= 4; r++) {
      ws.getRow(r).height = r === 4 ? 6 : 24;
      for (let c = 1; c <= totalCols; c++) {
        ws.getCell(r, c).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: r === 4 ? GOLD : NAVY },
        };
      }
    }

    ws.mergeCells(1, 2, 1, totalCols);
    const tCell = ws.getCell(1, 2);
    tCell.value = `مركز التحليل التنفيذي لإدارة المرافق — ${sheetTitleAr}`;
    tCell.font = { name: 'Cairo', size: 14, bold: true, color: { argb: WHITE } };
    tCell.alignment = { horizontal: 'center', vertical: 'middle' };

    ws.mergeCells(2, 2, 2, totalCols);
    const sCell = ws.getCell(2, 2);
    sCell.value = `SAAED Facilities Management Executive Intelligence | ${sheetTitleEn}`;
    sCell.font = { name: 'Cairo', size: 10, bold: true, color: { argb: GOLD } };
    sCell.alignment = { horizontal: 'center', vertical: 'middle' };

    ws.mergeCells(3, 2, 3, totalCols);
    const mCell = ws.getCell(3, 2);
    mCell.value = `النطاق: ${bi.meta.scopeLabelAr} | الفترة: ${bi.meta.periodLabelAr} | التقارير المشمولة: ${formatNumber(
      bi.meta.filteredReportsCount
    )} | التاريخ: ${new Date().toISOString().slice(0, 10)}`;
    mCell.font = { name: 'Cairo', size: 9, color: { argb: 'FFE2E8F0' } };
    mCell.alignment = { horizontal: 'center', vertical: 'middle' };

    const logoPath = path.join(process.cwd(), 'public', 'assets', 'aistudio', 'logo_1afd1154.png');
    if (fs.existsSync(logoPath)) {
      const logoId = wb.addImage({
        buffer: fs.readFileSync(logoPath) as unknown as ExcelJS.Buffer,
        extension: 'png',
      });
      ws.addImage(logoId, {
        tl: { col: 0.1, row: 0.15 },
        ext: { width: 120, height: 52 },
      });
    } else {
      const altLogo = findImagePath('saaed_logo_mark');
      if (altLogo && fs.existsSync(altLogo)) {
        const logoId = wb.addImage({
          buffer: fs.readFileSync(altLogo) as unknown as ExcelJS.Buffer,
          extension: 'png',
        });
        ws.addImage(logoId, {
          tl: { col: 0.1, row: 0.15 },
          ext: { width: 120, height: 52 },
        });
      }
    }
  };

  const addBannerRow = (ws: ExcelJS.Worksheet, row: number, cols: number, text: string) => {
    ws.mergeCells(row, 1, row, cols);
    const c = ws.getCell(row, 1);
    c.value = text;
    c.font = { name: 'Cairo', size: 11, bold: true, color: { argb: WHITE } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    c.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
    ws.getRow(row).height = 23;
  };

  // =========================================================================
  // SHEET 1: الملخص التنفيذي والمؤشرات ومعايير التصفية
  // =========================================================================
  const ws1 = wb.addWorksheet('الملخص التنفيذي', {
    views: [{ rightToLeft: true, showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  [28, 24, 22, 22, 22, 26].forEach((w, i) => {
    ws1.getColumn(i + 1).width = w;
  });
  setupSheetHeader(ws1, 6, 'الملخص التنفيذي والمؤشرات الحاكمة', 'Executive Snapshot & Pillars');

  let r1 = 6;
  addBannerRow(ws1, r1++, 6, 'معايير التصفية والنطاق المطبق · Active BI Scope');
  const filterMetaRows: Array<[string, string, string, string]> = [
    ['نطاق حالة التقارير', bi.meta.scopeLabelAr, 'السنة المختارة', filters.year === 'all' ? 'جميع السنوات' : filters.year],
    ['النطاق الفترى', bi.meta.periodLabelAr, 'الشهر المختار', filters.month === 'all' ? 'جميع الأشهر' : filters.month],
    ['عدد التقارير المشمولة', formatNumber(bi.meta.filteredReportsCount), 'المعتمدة / المسودات', `${formatNumber(bi.meta.approvedInScopeCount)} معتمد / ${formatNumber(bi.meta.draftInScopeCount)} قيد الإعداد`],
  ];
  filterMetaRows.forEach(([k1, v1, k2, v2], idx) => {
    ws1.getRow(r1).height = 20;
    ws1.getCell(r1, 1).value = k1;
    ws1.mergeCells(r1, 2, r1, 3);
    ws1.getCell(r1, 2).value = v1;
    ws1.getCell(r1, 4).value = k2;
    ws1.mergeCells(r1, 5, r1, 6);
    ws1.getCell(r1, 5).value = v2;
    for (let c = 1; c <= 6; c++) {
      const cell = ws1.getCell(r1, c);
      cell.font = { name: 'Cairo', size: 10, bold: c === 1 || c === 4, color: { argb: NAVY } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: idx % 2 === 0 ? SLATE_BG : WHITE } };
      cell.alignment = { horizontal: 'right', vertical: 'middle' };
      cell.border = thinBorder;
    }
    r1++;
  });
  r1++;

  addBannerRow(ws1, r1++, 6, '01. مؤشرات الملخص التنفيذي · Executive KPIs');
  const kpiHeaders = ['المؤشر', 'القيمة', 'الوحدة', 'التصنيف / التفسير'];
  ws1.getRow(r1).height = 22;
  ws1.mergeCells(r1, 1, r1, 2);
  ws1.getCell(r1, 1).value = kpiHeaders[0];
  ws1.getCell(r1, 3).value = kpiHeaders[1];
  ws1.getCell(r1, 4).value = kpiHeaders[2];
  ws1.mergeCells(r1, 5, r1, 6);
  ws1.getCell(r1, 5).value = kpiHeaders[3];
  for (let c = 1; c <= 6; c++) {
    const cell = ws1.getCell(r1, c);
    cell.font = { name: 'Cairo', size: 10, bold: true, color: { argb: WHITE } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = thinBorder;
  }
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
    ws1.getRow(r1).height = 20;
    ws1.mergeCells(r1, 1, r1, 2);
    ws1.mergeCells(r1, 5, r1, 6);
    ws1.getCell(r1, 1).value = label;
    ws1.getCell(r1, 3).value = val;
    if (typeof val === 'number' && fmt) ws1.getCell(r1, 3).numFmt = fmt;
    ws1.getCell(r1, 4).value = unit;
    ws1.getCell(r1, 5).value = note;
    for (let c = 1; c <= 6; c++) {
      const cell = ws1.getCell(r1, c);
      cell.font = { name: 'Cairo', size: 10, bold: c === 1 || c === 3, color: { argb: NAVY } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: idx % 2 === 0 ? WHITE : SLATE_BG } };
      cell.alignment = { horizontal: c === 3 || c === 4 ? 'center' : 'right', vertical: 'middle' };
      cell.border = thinBorder;
    }
    r1++;
  });
  r1++;

  addBannerRow(ws1, r1++, 6, '14. حالة التوقعات المستقبلية المشروطة · Conditional Forecast');
  ws1.mergeCells(r1, 1, r1, 6);
  const fcCell = ws1.getCell(r1, 1);
  fcCell.value = bi.forecast.available
    ? `متاح (${formatNumber(bi.forecast.periodsCount)} فترات) — التوقع للفترة القادمة (${bi.forecast.nextPeriodLabelAr}): طلبات ≈ ${formatNumber(bi.forecast.requestsForecast?.predicted ?? 0)} | أعطال ≈ ${formatNumber(bi.forecast.faultsForecast?.predicted ?? 0)} | تكلفة ≈ ${formatNumber(bi.forecast.costForecast?.predicted ?? 0)} AED`
    : `بيانات غير كافية للتنبؤ — ${bi.forecast.reasonAr}`;
  fcCell.font = { name: 'Cairo', size: 10, bold: true, color: { argb: bi.forecast.available ? EMERALD : GOLD } };
  fcCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT_BLUE } };
  fcCell.alignment = { horizontal: 'right', vertical: 'middle', wrapText: true };
  fcCell.border = thinBorder;
  ws1.getRow(r1).height = 28;

  // =========================================================================
  // SHEET 2: الخدمات وكفاءة الإنجاز (مع معادلات SUM / IF)
  // =========================================================================
  const ws2 = wb.addWorksheet('الخدمات والكفاءة', {
    views: [{ rightToLeft: true, showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  [8, 32, 16, 16, 16, 16, 16, 20].forEach((w, i) => {
    ws2.getColumn(i + 1).width = w;
  });
  setupSheetHeader(ws2, 8, 'تحليل الخدمات وكفاءة الإنجاز', 'Services Demand & Completion Efficiency');

  let r2 = 6;
  addBannerRow(ws2, r2++, 8, '03 & 04. أداء الخدمات الإحدى عشرة وكفاءة الإنجاز');
  const s2Headers = ['#', 'الخدمة', 'المستلمة', 'المنفذة', 'الفجوة المتبقية', 'الحصة %', 'نسبة الإنجاز %', 'مستوى الأداء'];
  ws2.getRow(r2).height = 22;
  s2Headers.forEach((h, i) => {
    const c = ws2.getCell(r2, i + 1);
    c.value = h;
    c.font = { name: 'Cairo', size: 10, bold: true, color: { argb: WHITE } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
    c.border = thinBorder;
  });
  r2++;

  const svcStart = r2;
  const svcTotalRow = svcStart + bi.servicesAnalysis.rows.length;
  bi.servicesAnalysis.rows.forEach((s, idx) => {
    const row = r2;
    ws2.getRow(row).height = 20;
    ws2.getCell(row, 1).value = idx + 1;
    ws2.getCell(row, 2).value = `${s.nameAr} (${s.nameEn})`;
    ws2.getCell(row, 3).value = s.receivedCount;
    ws2.getCell(row, 3).numFmt = '#,##0';
    ws2.getCell(row, 4).value = s.executedCount;
    ws2.getCell(row, 4).numFmt = '#,##0';
    ws2.getCell(row, 5).value = { formula: `MAX(0, C${row}-D${row})` };
    ws2.getCell(row, 5).numFmt = '#,##0';
    ws2.getCell(row, 6).value = { formula: `IF(C${svcTotalRow}=0, 0, C${row}/C${svcTotalRow})` };
    ws2.getCell(row, 6).numFmt = '0.0%';
    ws2.getCell(row, 7).value = { formula: `IF(C${row}=0, "غير منطبق", D${row}/C${row})` };
    ws2.getCell(row, 7).numFmt = '0.0%';
    ws2.getCell(row, 8).value = s.level.labelAr;

    for (let c = 1; c <= 8; c++) {
      const cell = ws2.getCell(row, c);
      cell.font = { name: 'Cairo', size: 10, color: { argb: NAVY } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: idx % 2 === 0 ? WHITE : SLATE_BG } };
      cell.alignment = { horizontal: c === 2 ? 'right' : 'center', vertical: 'middle' };
      cell.border = thinBorder;
    }
    r2++;
  });

  if (bi.servicesAnalysis.rows.length > 0) {
    ws2.getRow(r2).height = 22;
    ws2.mergeCells(r2, 1, r2, 2);
    ws2.getCell(r2, 1).value = 'الإجمالي العام | Total';
    ws2.getCell(r2, 3).value = { formula: `SUM(C${svcStart}:C${r2 - 1})` };
    ws2.getCell(r2, 3).numFmt = '#,##0';
    ws2.getCell(r2, 4).value = { formula: `SUM(D${svcStart}:D${r2 - 1})` };
    ws2.getCell(r2, 4).numFmt = '#,##0';
    ws2.getCell(r2, 5).value = { formula: `SUM(E${svcStart}:E${r2 - 1})` };
    ws2.getCell(r2, 5).numFmt = '#,##0';
    ws2.getCell(r2, 6).value = { formula: `IF(C${r2}=0, 0, 1)` };
    ws2.getCell(r2, 6).numFmt = '0.0%';
    ws2.getCell(r2, 7).value = { formula: `IF(C${r2}=0, "غير منطبق", D${r2}/C${r2})` };
    ws2.getCell(r2, 7).numFmt = '0.0%';
    ws2.getCell(r2, 8).value = bi.snapshot.overallCompletionLevel.labelAr;
    for (let c = 1; c <= 8; c++) {
      const cell = ws2.getCell(r2, c);
      cell.font = { name: 'Cairo', size: 10, bold: true, color: { argb: WHITE } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = thinBorder;
    }
  }

  // =========================================================================
  // SHEET 3: الصيانة والمقرات والتكاليف (باريتو + المقرات + AED)
  // =========================================================================
  const ws3 = wb.addWorksheet('الصيانة والمقرات والمالية', {
    views: [{ rightToLeft: true, showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  [26, 14, 14, 15, 16, 16, 18, 18].forEach((w, i) => {
    ws3.getColumn(i + 1).width = w;
  });
  setupSheetHeader(ws3, 8, 'الصيانة والأعطال والمقرات والتكاليف (AED)', 'Maintenance Pareto, Sites & Financial Costs');

  let r3 = 6;
  addBannerRow(ws3, r3++, 8, '05 & 07. تحليل باريتو للأعطال والتكاليف المالية حسب الفئة (AED)');
  const pHeaders = ['فئة الصيانة', 'الأعطال', 'الحصة %', 'التراكمي %', 'النثرية (AED)', 'أمر الشراء (AED)', 'إجمالي التكلفة (AED)', 'تكلفة العطل (AED)'];
  ws3.getRow(r3).height = 24;
  pHeaders.forEach((h, i) => {
    const c = ws3.getCell(r3, i + 1);
    c.value = h;
    c.font = { name: 'Cairo', size: 9.5, bold: true, color: { argb: WHITE } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    c.border = thinBorder;
  });
  r3++;

  const paretoStart = r3;
  const paretoTotalRow = paretoStart + bi.maintenanceAnalysis.paretoRows.length;
  bi.maintenanceAnalysis.paretoRows.forEach((p, idx) => {
    const row = r3;
    ws3.getRow(row).height = 20;
    ws3.getCell(row, 1).value = p.nameAr;
    ws3.getCell(row, 2).value = p.faultCount;
    ws3.getCell(row, 2).numFmt = '#,##0';
    ws3.getCell(row, 3).value = { formula: `IF(B${paretoTotalRow}=0, 0, B${row}/B${paretoTotalRow})` };
    ws3.getCell(row, 3).numFmt = '0.0%';
    ws3.getCell(row, 4).value = p.cumulativePct / 100;
    ws3.getCell(row, 4).numFmt = '0.0%';
    ws3.getCell(row, 5).value = p.pettyCashAed;
    ws3.getCell(row, 5).numFmt = '#,##0.00';
    ws3.getCell(row, 6).value = p.purchaseOrderAed;
    ws3.getCell(row, 6).numFmt = '#,##0.00';
    ws3.getCell(row, 7).value = { formula: `E${row}+F${row}` };
    ws3.getCell(row, 7).numFmt = '#,##0.00';
    ws3.getCell(row, 8).value = { formula: `IF(B${row}=0, "غير منطبق", G${row}/B${row})` };
    ws3.getCell(row, 8).numFmt = '#,##0.00';

    for (let c = 1; c <= 8; c++) {
      const cell = ws3.getCell(row, c);
      cell.font = { name: 'Cairo', size: 9.5, color: { argb: NAVY } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: idx % 2 === 0 ? WHITE : SLATE_BG } };
      cell.alignment = { horizontal: c === 1 ? 'right' : 'center', vertical: 'middle' };
      cell.border = thinBorder;
    }
    r3++;
  });

  if (bi.maintenanceAnalysis.paretoRows.length > 0) {
    ws3.getRow(r3).height = 22;
    ws3.getCell(r3, 1).value = 'الإجمالي العام | Total';
    ws3.getCell(r3, 2).value = { formula: `SUM(B${paretoStart}:B${r3 - 1})` };
    ws3.getCell(r3, 2).numFmt = '#,##0';
    ws3.getCell(r3, 3).value = { formula: `IF(B${r3}=0, 0, 1)` };
    ws3.getCell(r3, 3).numFmt = '0.0%';
    ws3.getCell(r3, 4).value = 1;
    ws3.getCell(r3, 4).numFmt = '0.0%';
    ws3.getCell(r3, 5).value = { formula: `SUM(E${paretoStart}:E${r3 - 1})` };
    ws3.getCell(r3, 5).numFmt = '#,##0.00';
    ws3.getCell(r3, 6).value = { formula: `SUM(F${paretoStart}:F${r3 - 1})` };
    ws3.getCell(r3, 6).numFmt = '#,##0.00';
    ws3.getCell(r3, 7).value = { formula: `SUM(G${paretoStart}:G${r3 - 1})` };
    ws3.getCell(r3, 7).numFmt = '#,##0.00';
    ws3.getCell(r3, 8).value = { formula: `IF(B${r3}=0, "غير منطبق", G${r3}/B${r3})` };
    ws3.getCell(r3, 8).numFmt = '#,##0.00';
    for (let c = 1; c <= 8; c++) {
      const cell = ws3.getCell(r3, c);
      cell.font = { name: 'Cairo', size: 10, bold: true, color: { argb: WHITE } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
      cell.alignment = { horizontal: c === 1 ? 'right' : 'center', vertical: 'middle' };
      cell.border = thinBorder;
    }
    r3 += 2;
  }

  addBannerRow(ws3, r3++, 8, '06. تحليل المقرات والمواقع (الأعطال المطلقة)');
  ws3.getRow(r3).height = 22;
  ws3.mergeCells(r3, 1, r3, 3);
  ws3.getCell(r3, 1).value = 'المقر';
  ws3.getCell(r3, 4).value = 'إجمالي الأعطال';
  ws3.getCell(r3, 5).value = 'الحصة من الإجمالي %';
  ws3.mergeCells(r3, 6, r3, 8);
  ws3.getCell(r3, 6).value = 'الفئة الأعلى تكراراً في المقر';
  for (let c = 1; c <= 8; c++) {
    const cell = ws3.getCell(r3, c);
    cell.font = { name: 'Cairo', size: 10, bold: true, color: { argb: WHITE } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = thinBorder;
  }
  r3++;

  const siteStart = r3;
  const siteTotalRow = siteStart + bi.sitesAnalysis.rows.length;
  bi.sitesAnalysis.rows.forEach((st, idx) => {
    ws3.getRow(r3).height = 20;
    ws3.mergeCells(r3, 1, r3, 3);
    ws3.mergeCells(r3, 6, r3, 8);
    ws3.getCell(r3, 1).value = st.nameAr;
    ws3.getCell(r3, 4).value = st.faultCount;
    ws3.getCell(r3, 4).numFmt = '#,##0';
    ws3.getCell(r3, 5).value = { formula: `IF(D${siteTotalRow}=0, 0, D${r3}/D${siteTotalRow})` };
    ws3.getCell(r3, 5).numFmt = '0.0%';
    ws3.getCell(r3, 6).value = st.topCategoryAr ? `${st.topCategoryAr} (${formatNumber(st.topCategoryCount)})` : 'لا توجد أعطال';
    for (let c = 1; c <= 8; c++) {
      const cell = ws3.getCell(r3, c);
      cell.font = { name: 'Cairo', size: 9.5, color: { argb: NAVY } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: idx % 2 === 0 ? WHITE : SLATE_BG } };
      cell.alignment = { horizontal: c === 1 ? 'right' : 'center', vertical: 'middle' };
      cell.border = thinBorder;
    }
    r3++;
  });

  // =========================================================================
  // SHEET 4: العقود والسلامة واللوجستية والمهام
  // =========================================================================
  const ws4 = wb.addWorksheet('العقود والسلامة والمهام', {
    views: [{ rightToLeft: true, showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  [28, 16, 16, 16, 16, 36].forEach((w, i) => {
    ws4.getColumn(i + 1).width = w;
  });
  setupSheetHeader(ws4, 6, 'العقود والسلامة والخدمات المساندة والمهام', 'Contracts, Safety, Support Services & Tasks');

  let r4 = 6;
  addBannerRow(ws4, r4++, 6, '08 & 11. العقود والتراخيص والسلامة والمخاطر');
  ['البند', 'فعال / مغلق', 'غير فعال / مفتوح', 'الإجمالي', 'النسبة %', 'الملاحظات'].forEach((h, i) => {
    const c = ws4.getCell(r4, i + 1);
    c.value = h;
    c.font = { name: 'Cairo', size: 10, bold: true, color: { argb: WHITE } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
    c.border = thinBorder;
  });
  ws4.getRow(r4).height = 22;
  r4++;

  const govRows: Array<[string, number, number, string]> = [
    ...bi.contractsAnalysis.groups.map((g): [string, number, number, string] => [
      g.nameAr,
      g.activeCount,
      g.inactiveCount,
      g.notes.join(' | ') || '—',
    ]),
    [
      'طفايات الحريق (جاهزية)',
      bi.riskComplianceAnalysis.extinguishersActive,
      bi.riskComplianceAnalysis.extinguishersInactive,
      bi.riskComplianceAnalysis.extinguisherNotes.join(' | ') || '—',
    ],
    [
      'ملاحظات المخاطر (إغلاق)',
      bi.riskComplianceAnalysis.hazardsClosed,
      bi.riskComplianceAnalysis.hazardsOpen,
      bi.riskComplianceAnalysis.hazardNotes.join(' | ') || '—',
    ],
  ];

  govRows.forEach(([label, primary, secondary, notes], idx) => {
    const lineEst = Math.max(1, Math.ceil((notes?.length || 1) / 36));
    ws4.getRow(r4).height = Math.max(22, lineEst * 17 + 4);
    ws4.getCell(r4, 1).value = label;
    ws4.getCell(r4, 2).value = primary;
    ws4.getCell(r4, 2).numFmt = '#,##0';
    ws4.getCell(r4, 3).value = secondary;
    ws4.getCell(r4, 3).numFmt = '#,##0';
    ws4.getCell(r4, 4).value = { formula: `B${r4}+C${r4}` };
    ws4.getCell(r4, 4).numFmt = '#,##0';
    ws4.getCell(r4, 5).value = { formula: `IF(D${r4}=0, "غير منطبق", B${r4}/D${r4})` };
    ws4.getCell(r4, 5).numFmt = '0.0%';
    ws4.getCell(r4, 6).value = notes;
    for (let c = 1; c <= 6; c++) {
      const cell = ws4.getCell(r4, c);
      cell.font = {
        name: 'Cairo',
        size: 9.5,
        bold: c === 2 || c === 3,
        color: { argb: c === 2 ? EMERALD : c === 3 && secondary > 0 ? CRIMSON : NAVY },
      };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: idx % 2 === 0 ? WHITE : SLATE_BG } };
      cell.alignment = { horizontal: c === 1 || c === 6 ? 'right' : 'center', vertical: 'middle', wrapText: true };
      cell.border = thinBorder;
    }
    r4++;
  });

  // =========================================================================
  // SHEET 5: الإنذار المبكر والتوصيات التنفيذية
  // =========================================================================
  const ws5 = wb.addWorksheet('الإنذار والتوصيات', {
    views: [{ rightToLeft: true, showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  [18, 30, 34, 38, 24].forEach((w, i) => {
    ws5.getColumn(i + 1).width = w;
  });
  setupSheetHeader(ws5, 5, 'مؤشرات الإنذار المبكر والتوصيات التنفيذية', 'Early Warnings & Executive Recommendations');

  let r5 = 6;
  addBannerRow(ws5, r5++, 5, '15. مؤشرات الإنذار المبكر');
  ['درجة التنبيه', 'العنوان', 'المؤشر المرصود', 'المقارنة بالمعيار', 'القسم المعني'].forEach((h, i) => {
    const c = ws5.getCell(r5, i + 1);
    c.value = h;
    c.font = { name: 'Cairo', size: 10, bold: true, color: { argb: WHITE } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
    c.border = thinBorder;
  });
  ws5.getRow(r5).height = 22;
  r5++;

  if (bi.earlyWarnings.length === 0) {
    ws5.mergeCells(r5, 1, r5, 5);
    ws5.getCell(r5, 1).value = 'لا توجد مؤشرات إنذار مبكر حرجة في النطاق الحالي.';
    ws5.getCell(r5, 1).alignment = { horizontal: 'center', vertical: 'middle' };
    ws5.getCell(r5, 1).border = thinBorder;
    ws5.getRow(r5).height = 22;
    r5 += 2;
  } else {
    bi.earlyWarnings.forEach((w, idx) => {
      ws5.getRow(r5).height = 24;
      ws5.getCell(r5, 1).value = w.severity === 'critical' ? 'حرج' : w.severity === 'warning' ? 'تحذير' : 'تنبيه';
      ws5.getCell(r5, 2).value = w.title;
      ws5.getCell(r5, 3).value = w.metricDisplay;
      ws5.getCell(r5, 4).value = w.comparisonText;
      ws5.getCell(r5, 5).value = w.targetSectionLabel;
      for (let c = 1; c <= 5; c++) {
        const cell = ws5.getCell(r5, c);
        cell.font = { name: 'Cairo', size: 9.5, color: { argb: c === 1 && w.severity === 'critical' ? CRIMSON : NAVY } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: idx % 2 === 0 ? WHITE : SLATE_BG } };
        cell.alignment = { horizontal: c === 1 ? 'center' : 'right', vertical: 'middle', wrapText: true };
        cell.border = thinBorder;
      }
      r5++;
    });
    r5++;
  }

  addBannerRow(ws5, r5++, 5, '16. النتائج والتوصيات التنفيذية للإدارة العليا');
  ['الأولوية', 'التوصية التنفيذية', 'الدليل الرقمي من البيانات', 'الإجراء المقترح', 'الجهة المسؤولة والمؤشر'].forEach((h, i) => {
    const c = ws5.getCell(r5, i + 1);
    c.value = h;
    c.font = { name: 'Cairo', size: 10, bold: true, color: { argb: WHITE } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
    c.border = thinBorder;
  });
  ws5.getRow(r5).height = 22;
  r5++;

  bi.recommendations.forEach((rec, idx) => {
    const maxLen = Math.max(rec.title.length, rec.evidenceText.length, rec.actionText.length, 40);
    ws5.getRow(r5).height = Math.max(36, Math.ceil(maxLen / 34) * 16 + 8);
    ws5.getCell(r5, 1).value = rec.priorityLabelAr;
    ws5.getCell(r5, 2).value = rec.title;
    ws5.getCell(r5, 3).value = rec.evidenceText;
    ws5.getCell(r5, 4).value = rec.actionText;
    ws5.getCell(r5, 5).value = `${rec.owner} | ${rec.suggestedKpi}`;
    for (let c = 1; c <= 5; c++) {
      const cell = ws5.getCell(r5, c);
      cell.font = { name: 'Cairo', size: 9.5, color: { argb: NAVY } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: idx % 2 === 0 ? WHITE : SLATE_BG } };
      cell.alignment = { horizontal: c === 1 ? 'center' : 'right', vertical: 'middle', wrapText: true };
      cell.border = thinBorder;
    }
    r5++;
  });

  [ws1, ws2, ws3, ws4, ws5].forEach((sheet) => {
    sheet.pageSetup.showGridLines = false;
    sheet.headerFooter.oddFooter =
      '&Rقسم إدارة المرافق | إدارة الخدمات العامة — شركة ساعد&Cمركز التحليل التنفيذي&Lصفحة &P من &N | إعداد وتصميم: خالد الهاشمي';
  });

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
