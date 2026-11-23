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

function resolveBrandAsset(name: string): string | null {
  const dir = path.join(process.cwd(), 'src', 'assets', 'images');
  const p = path.join(dir, name);
  if (fs.existsSync(p)) return p;
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir);
  const found = files.find((f) => f.startsWith(name) && (f.endsWith('.jpg') || f.endsWith('.png')));
  return found ? path.join(dir, found) : null;
}

function estimateRowHeight(texts: string[], approxCharsPerLine: number, minHeight = 22): number {
  let maxLines = 1;
  for (const t of texts) {
    if (!t) continue;
    const paras = String(t).split(/\r?\n/);
    let lines = 0;
    for (const p of paras) {
      lines += Math.max(1, Math.ceil(p.length / approxCharsPerLine));
    }
    if (lines > maxLines) maxLines = lines;
  }
  return Math.max(minHeight, maxLines * 17 + 6);
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
  const isApprovedOrArchived = report.status === 'approved' || report.status === 'archived';

  // Dynamic column span accommodating ALL categories without truncation
  const activeCategories = categories;
  const totalCols = Math.max(14, activeCategories.length + 2);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'SAHER Facilities Management Executive System';
  wb.created = new Date();
  wb.modified = new Date();

  const ws = wb.addWorksheet('التقرير الشهري', {
    views: [{ rightToLeft: true, showGridLines: false }],
    pageSetup: {
      paperSize: 9, // A4
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      showGridLines: false,
      margins: {
        left: 0.3,
        right: 0.3,
        top: 0.4,
        bottom: 0.5,
        header: 0.2,
        footer: 0.22,
      },
    },
    headerFooter: {
      oddFooter: `&Rقسم إدارة المرافق | إدارة الخدمات العامة — شركة ساهر&Cتصنيف: ${report.classification}&Lصفحة &P من &N | إعداد وتصميم: خالد الهاشمي`,
    },
  });

  // Dynamic column widths: col 1 = #, col 2 = Site/Title, cols 3..totalCols-1 = matrix/data, totalCols = Total
  for (let c = 1; c <= totalCols; c++) {
    if (c === 1) ws.getColumn(c).width = 18;
    else if (c === 2) ws.getColumn(c).width = 26;
    else if (c === totalCols) ws.getColumn(c).width = 17;
    else ws.getColumn(c).width = 14;
  }

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
    for (let c = 1; c <= totalCols; c++) {
      const cell = ws.getCell(r, c);
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: r === 5 ? GOLD : NAVY },
      };
    }
  }

  // White right wing cells for official logo visibility
  for (let r = 1; r <= 4; r++) {
    for (let c = 1; c <= 2; c++) {
      ws.getCell(r, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: WHITE } };
    }
  }

  const titleEndCol = totalCols - 2;
  ws.mergeCells(1, 3, 2, titleEndCol);
  const titleCell = ws.getCell(1, 3);
  titleCell.value = 'التقرير الشهري لقسم إدارة المرافق';
  titleCell.font = { name: 'Cairo', size: 18, bold: true, color: { argb: WHITE } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

  ws.mergeCells(3, 3, 3, titleEndCol);
  const subCell = ws.getCell(3, 3);
  subCell.value = `إدارة الخدمات العامة · شهر ${monthAr} ${report.year} · Facilities Management Monthly Report (${monthEn} ${report.year})`;
  subCell.font = { name: 'Cairo', size: 11, bold: true, color: { argb: GOLD } };
  subCell.alignment = { horizontal: 'center', vertical: 'middle' };

  ws.mergeCells(4, 3, 4, titleEndCol);
  const metaCell = ws.getCell(4, 3);
  metaCell.value = `رقم التقرير: ${report.reportNumber}  |  الحالة: ${STATUS_LABELS_AR[report.status]}  |  الإصدار: v${report.currentVersion}  |  الشركة: ${report.company}`;
  metaCell.font = { name: 'Cairo', size: 9.5, color: { argb: 'FFE2E8F0' } };
  metaCell.alignment = { horizontal: 'center', vertical: 'middle' };

  // Embed Official SAHER Logo Mark in White Wing (Cols 1-2 in RTL = right side)
  const logoPath = resolveBrandAsset('saher_logo_mark.png') || resolveBrandAsset('saaed_logo_mark.png');
  if (logoPath && fs.existsSync(logoPath)) {
    const logoId = wb.addImage({
      buffer: fs.readFileSync(logoPath) as unknown as ExcelJS.Buffer,
      extension: 'png',
    });
    ws.addImage(logoId, {
      tl: { col: 0.25, row: 0.35 },
      ext: { width: 160, height: 64 },
    });
  }

  // Embed Corporate Building Backdrop on left wing (Last 2 cols in RTL = left side)
  const heroPath = resolveBrandAsset('saher_header_visual_bg.png') || resolveBrandAsset('saaed_header_visual_bg.png') || resolveBrandAsset('hero_facility_panorama');
  if (heroPath && fs.existsSync(heroPath)) {
    const heroId = wb.addImage({
      buffer: fs.readFileSync(heroPath) as unknown as ExcelJS.Buffer,
      extension: heroPath.endsWith('.png') ? 'png' : 'jpeg',
    });
    ws.addImage(heroId, {
      tl: { col: totalCols - 2.0, row: 0.12 },
      ext: { width: 195, height: 82 },
    });
  }

  let rowIdx = 6;
  if (!isApprovedOrArchived) {
    ws.mergeCells(rowIdx, 1, rowIdx, totalCols);
    const draftBanner = ws.getCell(rowIdx, 1);
    draftBanner.value = `تنبيه: نسخة مسودة / قيد المراجعة (${STATUS_LABELS_AR[report.status]}) — غير معتمدة نهائياً`;
    draftBanner.font = { name: 'Cairo', size: 10, bold: true, color: { argb: 'FF92400E' } };
    draftBanner.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
    draftBanner.alignment = { horizontal: 'center', vertical: 'middle' };
    draftBanner.border = thinBorder;
    ws.getRow(rowIdx).height = 20;
    rowIdx++;
  }
  rowIdx++;

  const addSectionBanner = (arTitle: string, enTitle: string) => {
    ws.mergeCells(rowIdx, 1, rowIdx, totalCols);
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
  const execImgRow = rowIdx;
  const execValRow = rowIdx + 1;
  const execHeaderRow = rowIdx + 2;
  ws.getRow(execImgRow).height = 46;
  ws.getRow(execValRow).height = 28;
  ws.getRow(execHeaderRow).height = 22;

  const resolveExcelTopServicePhotoPrefix = (
    topSvc?: { serviceId?: string; nameAr?: string; nameEn?: string } | null
  ): string => {
    if (!topSvc) return 'analytics_boardroom_strategy';
    const byId: Record<string, string> = {
      svc_reception: 'facility_reception_hall',
      svc_hospitality: 'svc_top_hospitality_lounge',
      svc_maintenance: 'analytics_maintenance_ops',
      svc_logistics: 'facility_safety_logistics',
      svc_cleaning: 'svc_top_cleaning_sanitation',
      svc_waste: 'archive_card_digital',
      svc_assets: 'analytics_services_hub',
      svc_petty_cash: 'analytics_finance_desk',
      svc_disbursement: 'analytics_finance_desk',
      svc_government: 'svc_top_government_docs',
      svc_access_permit: 'svc_top_security_surveillance',
      svc_security: 'svc_top_security_surveillance',
    };
    const id = (topSvc.serviceId || '').trim();
    if (id && byId[id]) return byId[id];
    const text = `${topSvc.nameAr || ''} ${topSvc.nameEn || ''}`.toLowerCase();
    if (text.includes('استقبال') || text.includes('reception')) return 'facility_reception_hall';
    if (text.includes('ضياف') || text.includes('hospitality')) return 'svc_top_hospitality_lounge';
    if (text.includes('صيان') || text.includes('maintenance')) return 'analytics_maintenance_ops';
    if (text.includes('لوجست') || text.includes('logistics')) return 'facility_safety_logistics';
    if (text.includes('نظاف') || text.includes('clean')) return 'svc_top_cleaning_sanitation';
    if (text.includes('نفاي') || text.includes('waste')) return 'archive_card_digital';
    if (text.includes('أمن') || text.includes('تصريح') || text.includes('security')) return 'svc_top_security_surveillance';
    if (text.includes('حكوم') || text.includes('government')) return 'svc_top_government_docs';
    if (text.includes('أصول') || text.includes('asset')) return 'analytics_services_hub';
    if (text.includes('نثري') || text.includes('صرف') || text.includes('cash')) return 'analytics_finance_desk';
    return 'analytics_boardroom_strategy';
  };

  const execCards = [
    {
      startCol: 1,
      endCol: 3,
      label: 'إجمالي الطلبات | Total Requests',
      headerBg: BLUE,
      bodyBg: 'FFEBF2FC',
      valColor: NAVY,
      photoPrefix: 'kpi_total_requests_desk',
    },
    {
      startCol: 4,
      endCol: 6,
      label: 'أعلى خدمة طلباً | Top Service',
      headerBg: GOLD,
      bodyBg: 'FFF9F0DA',
      valColor: NAVY,
      photoPrefix: resolveExcelTopServicePhotoPrefix(metrics.topService),
    },
    {
      startCol: 7,
      endCol: 9,
      label: 'إجمالي الخدمات | Total Services',
      headerBg: BLUE,
      bodyBg: 'FFE4F0FC',
      valColor: NAVY,
      photoPrefix: 'kpi_total_services_systems',
    },
    {
      startCol: 10,
      endCol: 12,
      label: 'نسبة الإنجاز الشهرية | Monthly Completion Rate',
      headerBg: EMERALD,
      bodyBg: 'FFE1F6ED',
      valColor: EMERALD,
      photoPrefix: 'kpi_completion_rate_check',
    },
  ];

  execCards.forEach((card) => {
    ws.mergeCells(execImgRow, card.startCol, execImgRow, card.endCol);
    ws.mergeCells(execValRow, card.startCol, execValRow, card.endCol);
    ws.mergeCells(execHeaderRow, card.startCol, execHeaderRow, card.endCol);

    const imgCell = ws.getCell(execImgRow, card.startCol);
    imgCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: card.bodyBg } };

    const vCell = ws.getCell(execValRow, card.startCol);
    vCell.font = { name: 'Cairo', size: 13, bold: true, color: { argb: card.valColor } };
    vCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: card.bodyBg } };
    vCell.alignment = { horizontal: 'center', vertical: 'middle' };

    const hCell = ws.getCell(execHeaderRow, card.startCol);
    hCell.value = card.label;
    hCell.font = { name: 'Cairo', size: 9.5, bold: true, color: { argb: WHITE } };
    hCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: card.headerBg } };
    hCell.alignment = { horizontal: 'center', vertical: 'middle' };

    for (let c = card.startCol; c <= card.endCol; c++) {
      ws.getCell(execImgRow, c).border = thinBorder;
      ws.getCell(execValRow, c).border = thinBorder;
      ws.getCell(execHeaderRow, c).border = thinBorder;
    }

    const cardPhotoPath = resolveBrandAsset(card.photoPrefix);
    if (cardPhotoPath && fs.existsSync(cardPhotoPath)) {
      const cardImgId = wb.addImage({
        buffer: fs.readFileSync(cardPhotoPath) as unknown as ExcelJS.Buffer,
        extension: 'jpeg',
      });
      ws.addImage(cardImgId, {
        tl: { col: card.startCol - 0.88, row: execImgRow - 0.92 },
        ext: { width: 175, height: 54 },
      });
    }
  });

  // Cols 13-14 in Section 1: Engineer Inspection Photo Card
  ws.mergeCells(execImgRow, 13, execHeaderRow, 14);
  const engCell = ws.getCell(execImgRow, 13);
  engCell.value = 'متابعة هندسية ورقابة جودة';
  engCell.font = { name: 'Cairo', size: 9, bold: true, color: { argb: GOLD } };
  engCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
  engCell.alignment = { horizontal: 'center', vertical: 'bottom' };
  for (let r = execImgRow; r <= execHeaderRow; r++) {
    for (let c = 13; c <= 14; c++) {
      ws.getCell(r, c).border = thinBorder;
    }
  }
  const engPhotoPath = resolveBrandAsset('engineer_tablet_inspector');
  if (engPhotoPath && fs.existsSync(engPhotoPath)) {
    const engImgId = wb.addImage({
      buffer: fs.readFileSync(engPhotoPath) as unknown as ExcelJS.Buffer,
      extension: 'jpeg',
    });
    ws.addImage(engImgId, {
      tl: { col: 12.1, row: execImgRow - 0.9 },
      ext: { width: 150, height: 84 },
    });
  }

  rowIdx += 4;

  // === OPERATIONS SUMMARY STRIP (ملخص العمليات والاعتماد — All 7 Cards) ===
  addSectionBanner('ملخص العمليات والاعتماد (7 بطاقات تنفيذية)', 'Operations & Approval Summary Strip');
  const opsHRow1 = rowIdx;
  const opsVRow1 = rowIdx + 1;
  ws.getRow(opsHRow1).height = 20;
  ws.getRow(opsVRow1).height = 26;

  const opsRow1Defs = [
    {
      startCol: 1,
      endCol: 3,
      title: 'تفاصيل الصيانة بالمقرات',
      val: `${formatNumber(sites.length)} مقرات | ${formatNumber(metrics.maintenance.grandTotalFaults)} عطلاً`,
      photoPrefix: 'facility_engineering_ops',
    },
    {
      startCol: 4,
      endCol: 7,
      title: 'خدمات الصيانة (مصادر الطلبات)',
      val: `المرافق: ${formatNumber(report.maintenanceServices.fromFacilitiesDept)} | إدارات أخرى: ${formatNumber(report.maintenanceServices.fromOtherDepts)}`,
      photoPrefix: 'technician_electrical_panel',
    },
    {
      startCol: 8,
      endCol: 10,
      title: 'الدعم اللوجستي',
      val: `إجمالي الطلبات: ${formatNumber(metrics.logisticsTotal)} طلباً`,
      photoPrefix: 'facility_safety_logistics',
    },
    {
      startCol: 11,
      endCol: 14,
      title: 'خدمات الأمن والاستقبال',
      val: `المستلمة: ${formatNumber(metrics.securityTotals.totalReceived)} | المنفذة: ${formatNumber(metrics.securityTotals.totalExecuted)}`,
      photoPrefix: 'facility_reception_hall',
    },
  ];

  opsRow1Defs.forEach((oc) => {
    ws.mergeCells(opsHRow1, oc.startCol, opsHRow1, oc.endCol);
    ws.mergeCells(opsVRow1, oc.startCol, opsVRow1, oc.endCol);
    const hc = ws.getCell(opsHRow1, oc.startCol);
    hc.value = oc.title;
    hc.font = { name: 'Cairo', size: 9.5, bold: true, color: { argb: GOLD } };
    hc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    hc.alignment = { horizontal: 'center', vertical: 'middle' };

    const vc = ws.getCell(opsVRow1, oc.startCol);
    vc.value = oc.val;
    vc.font = { name: 'Cairo', size: 10, bold: true, color: { argb: NAVY } };
    vc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT_BLUE } };
    vc.alignment = { horizontal: 'center', vertical: 'middle' };

    for (let c = oc.startCol; c <= oc.endCol; c++) {
      ws.getCell(opsHRow1, c).border = thinBorder;
      ws.getCell(opsVRow1, c).border = thinBorder;
    }
  });
  rowIdx += 2;

  const opsHRow2 = rowIdx;
  const opsVRow2 = rowIdx + 1;
  ws.getRow(opsHRow2).height = 20;
  ws.getRow(opsVRow2).height = 24;

  const opsRow2Defs = [
    {
      startCol: 1,
      endCol: 5,
      title: 'المهام التشغيلية والمتابعة',
      val: `الإجمالي: ${formatNumber(metrics.tasksSummary.totalMeaningful)} | المنجزة: ${formatNumber(metrics.tasksSummary.completed)} | قيد التنفيذ: ${formatNumber(metrics.tasksSummary.inProgress)} | المتأخرة: ${formatNumber(metrics.tasksSummary.delayed)}`,
    },
    {
      startCol: 6,
      endCol: 9,
      title: 'التحديات والتوصيات',
      val: `التحديات: ${formatNumber(report.challenges.filter((c) => c.challengeText.trim()).length)} | التوصيات: ${formatNumber(report.challenges.filter((c) => c.recommendationText.trim()).length)}`,
    },
    {
      startCol: 10,
      endCol: 14,
      title: 'الإعداد والمراجعة والاعتماد',
      val: `المعد: ${report.preparerName || '—'} | الحالة: ${STATUS_LABELS_AR[report.status]} | المعتمد: ${report.approverName || '—'}`,
    },
  ];

  opsRow2Defs.forEach((oc) => {
    ws.mergeCells(opsHRow2, oc.startCol, opsHRow2, oc.endCol);
    ws.mergeCells(opsVRow2, oc.startCol, opsVRow2, oc.endCol);
    const hc = ws.getCell(opsHRow2, oc.startCol);
    hc.value = oc.title;
    hc.font = { name: 'Cairo', size: 9.5, bold: true, color: { argb: WHITE } };
    hc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } };
    hc.alignment = { horizontal: 'center', vertical: 'middle' };

    const vc = ws.getCell(opsVRow2, oc.startCol);
    vc.value = oc.val;
    vc.font = { name: 'Cairo', size: 9.5, bold: true, color: { argb: NAVY } };
    vc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SLATE_BG } };
    vc.alignment = { horizontal: 'center', vertical: 'middle' };

    for (let c = oc.startCol; c <= oc.endCol; c++) {
      ws.getCell(opsHRow2, c).border = thinBorder;
      ws.getCell(opsVRow2, c).border = thinBorder;
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
  ws.getCell(execValRow, 4).value = metrics.topService
    ? `${metrics.topService.nameAr} (${formatNumber(metrics.topService.receivedCount)} طلب)`
    : '0';
  ws.getCell(execValRow, 7).value =
    sortedSummary.length > 0
      ? { formula: `COUNTIF(F${sec3Start}:F${sec3TotalRow - 1}, ">0")` }
      : metrics.activeServicesCount;
  ws.getCell(execValRow, 7).numFmt = '#,##0';
  ws.getCell(execValRow, 10).value = {
    formula: `IF(F${sec3TotalRow}=0, 0, H${sec3TotalRow}/F${sec3TotalRow})`,
  };
  ws.getCell(execValRow, 10).numFmt = '0.0%';

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
    ws.getRow(r).height = estimateRowHeight([con.notes || ''], 42, 24);
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
    ws.getRow(r).height = estimateRowHeight([sf.notes || ''], 42, 24);
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

  // === SECTION 6: تفاصيل الصيانة (4 بطاقات إحصائية + المصفوفة والتكاليف + الرسم البياني) ===
  addSectionBanner('6. تفاصيل الصيانة حسب المقر والفئة والتكاليف (AED)', 'Maintenance Details Matrix & Financial Costs');

  // 4 Maintenance KPI Cards at top of Section 6
  const mKpiHRow = rowIdx;
  const mKpiVRow = rowIdx + 1;
  ws.getRow(mKpiHRow).height = 20;
  ws.getRow(mKpiVRow).height = 24;
  const sortedSitesForKpi = [...sites]
    .map((s) => ({ nameAr: s.nameAr, faults: metrics.maintenance.siteTotals[s.id] ?? 0 }))
    .sort((a, b) => b.faults - a.faults);
  const topExcelSite =
    sortedSitesForKpi.length > 0 && sortedSitesForKpi[0].faults > 0 ? sortedSitesForKpi[0] : null;

  const maintKpiDefs = [
    {
      startCol: 1,
      endCol: 3,
      label: 'إجمالي الأعطال المسجلة',
      val: `${formatNumber(metrics.maintenance.grandTotalFaults)} عطل`,
      color: BLUE,
    },
    {
      startCol: 4,
      endCol: 7,
      label: 'المقر الأعلى في الأعطال',
      val: topExcelSite
        ? `${topExcelSite.nameAr} (${formatNumber(topExcelSite.faults)} عطلاً)`
        : 'لا توجد أعطال',
      color: GOLD,
    },
    {
      startCol: 8,
      endCol: 11,
      label: 'إجمالي التكلفة / النثرية (AED)',
      val: `${metrics.maintenance.pettyCashTotalAed.toFixed(2)} AED`,
      color: EMERALD,
    },
    {
      startCol: 12,
      endCol: 14,
      label: 'إجمالي التكلفة / أمر شراء (AED)',
      val: `${metrics.maintenance.purchaseOrderTotalAed.toFixed(2)} AED`,
      color: NAVY,
    },
  ];
  maintKpiDefs.forEach((mk) => {
    ws.mergeCells(mKpiHRow, mk.startCol, mKpiHRow, mk.endCol);
    ws.mergeCells(mKpiVRow, mk.startCol, mKpiVRow, mk.endCol);
    const hc = ws.getCell(mKpiHRow, mk.startCol);
    hc.value = mk.label;
    hc.font = { name: 'Cairo', size: 9.5, bold: true, color: { argb: WHITE } };
    hc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: mk.color } };
    hc.alignment = { horizontal: 'center', vertical: 'middle' };

    const vc = ws.getCell(mKpiVRow, mk.startCol);
    vc.value = mk.val;
    vc.font = { name: 'Cairo', size: 11, bold: true, color: { argb: NAVY } };
    vc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SLATE_BG } };
    vc.alignment = { horizontal: 'center', vertical: 'middle' };

    for (let c = mk.startCol; c <= mk.endCol; c++) {
      ws.getCell(mKpiHRow, c).border = thinBorder;
      ws.getCell(mKpiVRow, c).border = thinBorder;
    }
  });
  rowIdx += 2;

  const maintTotalCol = Math.max(14, activeCategories.length + 2);
  const lastCatColLetter = activeCategories.length > 0 ? ws.getColumn(activeCategories.length + 1).letter : 'B';
  const maintTotalColLetter = ws.getColumn(maintTotalCol).letter;
  const maintHeaderRow = rowIdx;
  ws.getRow(maintHeaderRow).height = 32;
  ws.getCell(maintHeaderRow, 1).value = 'المقر | Site';
  activeCategories.forEach((cat, idx) => {
    ws.getCell(maintHeaderRow, idx + 2).value = cat.nameAr;
  });
  ws.getCell(maintHeaderRow, maintTotalCol).value = 'إجمالي المقر';
  for (let c = 1; c <= maintTotalCol; c++) {
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
    ws.getCell(r, maintTotalCol).value =
      activeCategories.length > 0 ? { formula: `SUM(B${r}:${lastCatColLetter}${r})` } : 0;
    ws.getCell(r, maintTotalCol).numFmt = '#,##0';
    for (let c = 1; c <= maintTotalCol; c++) {
      const cell = ws.getCell(r, c);
      cell.font = { name: 'Cairo', size: 9.5, bold: c === 1 || c === maintTotalCol, color: { argb: NAVY } };
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
    ws.getCell(maintFaultTotalRow, cIdx + 2).value =
      sites.length > 0 ? { formula: `SUM(${colLetter}${maintDataStart}:${colLetter}${maintDataEnd})` } : 0;
    ws.getCell(maintFaultTotalRow, cIdx + 2).numFmt = '#,##0';
  });
  ws.getCell(maintFaultTotalRow, maintTotalCol).value =
    sites.length > 0 ? { formula: `SUM(${maintTotalColLetter}${maintDataStart}:${maintTotalColLetter}${maintDataEnd})` } : 0;
  ws.getCell(maintFaultTotalRow, maintTotalCol).numFmt = '#,##0';
  for (let c = 1; c <= maintTotalCol; c++) {
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
  ws.getCell(pettyRow, maintTotalCol).value =
    activeCategories.length > 0 ? { formula: `SUM(B${pettyRow}:${lastCatColLetter}${pettyRow})` } : 0;
  ws.getCell(pettyRow, maintTotalCol).numFmt = '#,##0.00 "AED"';
  for (let c = 1; c <= maintTotalCol; c++) {
    const cell = ws.getCell(pettyRow, c);
    cell.font = { name: 'Cairo', size: 9, bold: c === 1 || c === maintTotalCol, color: { argb: NAVY } };
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
  ws.getCell(poRow, maintTotalCol).value =
    activeCategories.length > 0 ? { formula: `SUM(B${poRow}:${lastCatColLetter}${poRow})` } : 0;
  ws.getCell(poRow, maintTotalCol).numFmt = '#,##0.00 "AED"';
  for (let c = 1; c <= maintTotalCol; c++) {
    const cell = ws.getCell(poRow, c);
    cell.font = { name: 'Cairo', size: 9, bold: c === 1 || c === maintTotalCol, color: { argb: NAVY } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT_BLUE } };
    cell.alignment = { horizontal: c === 1 ? 'right' : 'center', vertical: 'middle' };
    cell.border = thinBorder;
  }
  rowIdx += 2;

  // Executive Horizontal Facility Comparison Block (مقارنة الأعطال بين المقرات — مرتبة تنازلياً)
  ws.getRow(rowIdx).height = 20;
  ws.mergeCells(rowIdx, 1, rowIdx, 10);
  ws.mergeCells(rowIdx, 11, rowIdx, 14);
  ws.getCell(rowIdx, 1).value = 'مقارنة الأعطال بين المقرات — التوزيع التنازلي (Executive Horizontal Facility Comparison)';
  ws.getCell(rowIdx, 11).value = `إجمالي الأعطال: ${metrics.maintenance.grandTotalFaults} عطلاً`;
  for (let c = 1; c <= 14; c++) {
    const cell = ws.getCell(rowIdx, c);
    cell.font = { name: 'Cairo', size: 9.5, bold: true, color: { argb: c >= 11 ? GOLD : WHITE } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    cell.alignment = { horizontal: c >= 11 ? 'center' : 'right', vertical: 'middle' };
    cell.border = thinBorder;
  }
  rowIdx++;

  const sortedExcelSites = sites
    .map((s, origIdx) => ({
      id: s.id,
      nameAr: s.nameAr,
      faults: Math.max(0, Math.round(Number(metrics.maintenance.siteTotals[s.id]) || 0)),
      sortOrder: typeof s.sortOrder === 'number' ? s.sortOrder : origIdx + 1,
      origIdx,
    }))
    .sort((a, b) => {
      if (b.faults !== a.faults) return b.faults - a.faults;
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.origIdx - b.origIdx;
    });
  const maxExcelSiteFaults = Math.max(...sortedExcelSites.map((s) => s.faults), 1);

  sortedExcelSites.forEach((item, idx) => {
    const r = ws.getRow(rowIdx);
    r.height = 19;
    const isTop = idx === 0 && item.faults > 0;
    const barUnits = item.faults > 0 ? Math.max(1, Math.round((item.faults / maxExcelSiteFaults) * 18)) : 0;
    const barVisual = barUnits > 0 ? '█'.repeat(barUnits) : '▏';
    const shareRatio =
      metrics.maintenance.grandTotalFaults > 0 ? item.faults / metrics.maintenance.grandTotalFaults : 0;

    ws.mergeCells(rowIdx, 1, rowIdx, 3);
    ws.mergeCells(rowIdx, 4, rowIdx, 10);
    ws.mergeCells(rowIdx, 11, rowIdx, 12);
    ws.mergeCells(rowIdx, 13, rowIdx, 14);

    ws.getCell(rowIdx, 1).value = `${idx + 1}. ${item.nameAr}`;
    ws.getCell(rowIdx, 4).value = barVisual;
    ws.getCell(rowIdx, 11).value = item.faults;
    ws.getCell(rowIdx, 11).numFmt = '#,##0 "عطلاً"';
    ws.getCell(rowIdx, 13).value = shareRatio;
    ws.getCell(rowIdx, 13).numFmt = '0.0%';

    for (let c = 1; c <= 14; c++) {
      const cell = ws.getCell(rowIdx, c);
      const isBarCol = c >= 4 && c <= 10;
      cell.font = {
        name: 'Cairo',
        size: 9.5,
        bold: c <= 3 || c >= 11 || isTop,
        color: {
          argb: isBarCol ? (isTop ? GOLD : BLUE) : NAVY,
        },
      };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: isTop ? 'FFEAF2FA' : idx % 2 === 0 ? WHITE : SLATE_BG },
      };
      cell.alignment = {
        horizontal: c <= 3 || isBarCol ? 'right' : 'center',
        vertical: 'middle',
      };
      cell.border = thinBorder;
    }
    rowIdx++;
  });
  rowIdx += 1;

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
  rowIdx += 2;

  // Executive Horizontal Bar Chart Block (Sorted Descending by Request Volume)
  ws.getRow(rowIdx).height = 20;
  ws.mergeCells(rowIdx, 1, rowIdx, 10);
  ws.mergeCells(rowIdx, 11, rowIdx, 14);
  ws.getCell(rowIdx, 1).value = 'التوزيع التنازلي لقنوات الدعم اللوجستي (Executive Horizontal Bar Chart)';
  ws.getCell(rowIdx, 11).value = { formula: `"إجمالي الطلبات: " & TEXT(M${logReqRow},"#,##0") & " طلباً"` };
  for (let c = 1; c <= 14; c++) {
    const cell = ws.getCell(rowIdx, c);
    cell.font = { name: 'Cairo', size: 9.5, bold: true, color: { argb: c >= 11 ? GOLD : WHITE } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    cell.alignment = { horizontal: c >= 11 ? 'center' : 'right', vertical: 'middle' };
    cell.border = thinBorder;
  }
  rowIdx++;

  const sortedExcelLogistics = metrics.logisticsWithPct
    .map((item, origIdx) => ({ ...item, origIdx }))
    .sort((a, b) => {
      if (b.requestCount !== a.requestCount) return b.requestCount - a.requestCount;
      return a.origIdx - b.origIdx;
    });
  const maxExcelLogReq = Math.max(...sortedExcelLogistics.map((l) => l.requestCount), 1);

  sortedExcelLogistics.forEach((item, idx) => {
    const r = ws.getRow(rowIdx);
    r.height = 19;
    const isTop = idx === 0 && item.requestCount > 0;
    const barUnits = item.requestCount > 0 ? Math.max(1, Math.round((item.requestCount / maxExcelLogReq) * 18)) : 0;
    const barVisual = barUnits > 0 ? '█'.repeat(barUnits) : '▏';

    ws.mergeCells(rowIdx, 1, rowIdx, 3);
    ws.mergeCells(rowIdx, 4, rowIdx, 10);
    ws.mergeCells(rowIdx, 11, rowIdx, 12);
    ws.mergeCells(rowIdx, 13, rowIdx, 14);

    ws.getCell(rowIdx, 1).value = `${idx + 1}. ${item.nameAr}`;
    ws.getCell(rowIdx, 4).value = barVisual;
    ws.getCell(rowIdx, 11).value = item.requestCount;
    ws.getCell(rowIdx, 11).numFmt = '#,##0 "طلباً"';
    ws.getCell(rowIdx, 13).value = (item.sharePct ?? 0) / 100;
    ws.getCell(rowIdx, 13).numFmt = '0.0%';

    for (let c = 1; c <= 14; c++) {
      const cell = ws.getCell(rowIdx, c);
      const isBarCol = c >= 4 && c <= 10;
      cell.font = {
        name: 'Cairo',
        size: 9.5,
        bold: c <= 3 || c >= 11 || isTop,
        color: {
          argb: isBarCol ? (isTop ? GOLD : BLUE) : NAVY,
        },
      };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: isTop ? 'FFEAF2FA' : idx % 2 === 0 ? WHITE : SLATE_BG },
      };
      cell.alignment = {
        horizontal: c <= 3 || isBarCol ? 'right' : 'center',
        vertical: 'middle',
      };
      cell.border = thinBorder;
    }
    rowIdx++;
  });
  rowIdx += 1;

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
    ws.getRow(r).height = Math.max(
      estimateRowHeight([t.topic || ''], 22, 22),
      estimateRowHeight([t.taskName || ''], 38, 22)
    );
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
    ws.getRow(r).height = estimateRowHeight(
      [ch.challengeText || '', ch.updateText || '', ch.recommendationText || ''],
      36,
      28
    );

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
  ws.mergeCells(rowIdx, 1, rowIdx, totalCols);
  const foot = ws.getCell(rowIdx, 1);
  foot.value = 'قسم إدارة المرافق | إدارة الخدمات العامة — شركة ساهر للخدمات الإلكترونية   ·   إعداد وتصميم: خالد الهاشمي | Prepared & Designed by Khaled Al Hashemi';
  foot.font = { name: 'Cairo', size: 9, bold: true, color: { argb: GOLD } };
  foot.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
  foot.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(rowIdx).height = 24;

  const footerImgPath = resolveBrandAsset('saaed_footer_visual_bg.png');
  if (footerImgPath && fs.existsSync(footerImgPath)) {
    const footImgId = wb.addImage({
      buffer: fs.readFileSync(footerImgPath) as unknown as ExcelJS.Buffer,
      extension: 'png',
    });
    ws.addImage(footImgId, {
      tl: { col: totalCols - 2.0, row: rowIdx - 0.92 },
      ext: { width: 140, height: 22 },
    });
  }

  const lastColLetter = ws.getColumn(totalCols).letter;
  ws.pageSetup.printArea = `A1:${lastColLetter}${rowIdx}`;

  // === SHEET 2: بيانات تفصيلية (Clean Flat Analytical Sheet without Merged Cells) ===
  const wsData = wb.addWorksheet('بيانات تفصيلية', {
    views: [{ rightToLeft: true, showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, showGridLines: false },
  });
  [24, 34, 18, 18, 18, 22].forEach((w, i) => {
    wsData.getColumn(i + 1).width = w;
  });

  const dataHeaderRow = wsData.addRow(['القسم', 'البند / البيان', 'القيمة الأولى', 'القيمة الثانية', 'الإجمالي / النسبة', 'ملاحظات']);
  dataHeaderRow.height = 24;
  dataHeaderRow.eachCell((cell) => {
    cell.font = { name: 'Cairo', size: 10, bold: true, color: { argb: WHITE } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = thinBorder;
  });

  const flatRows: Array<[string, string, number | string, number | string, number | string, string]> = [
    ['الملخص التنفيذي', 'إجمالي الطلبات المستلمة', metrics.totalReceived, metrics.totalExecuted, metrics.overallCompletionPct !== null ? `${metrics.overallCompletionPct.toFixed(1)}%` : '—', report.reportNumber],
    ['الملخص التنفيذي', 'أعطال الصيانة والتكاليف (AED)', metrics.maintenance.grandTotalFaults, metrics.maintenance.pettyCashTotalAed, metrics.maintenance.grandTotalCostAed, `أمر الشراء: ${formatNumber(metrics.maintenance.purchaseOrderTotalAed)} AED`],
    ...report.services.map((s): [string, string, number, number, string, string] => [
      'الخدمات',
      `${s.nameAr} (${s.nameEn})`,
      s.receivedCount,
      s.executedCount,
      s.receivedCount > 0 ? `${((s.executedCount / s.receivedCount) * 100).toFixed(1)}%` : '—',
      '',
    ]),
    ...activeCategories.map((cat): [string, string, number, number, number, string] => [
      'فئات الصيانة',
      cat.nameAr,
      metrics.maintenance.categoryTotals[cat.id] ?? 0,
      report.maintenanceCosts[cat.id]?.pettyCashAed ?? 0,
      report.maintenanceCosts[cat.id]?.purchaseOrderAed ?? 0,
      'الأعطال | النثرية AED | أمر الشراء AED',
    ]),
    ...sites.map((site): [string, string, number, string, string, string] => [
      'المقرات',
      site.nameAr,
      metrics.maintenance.siteTotals[site.id] ?? 0,
      '',
      '',
      'إجمالي الأعطال في المقر',
    ]),
  ];

  flatRows.forEach((fr, idx) => {
    const dr = wsData.addRow(fr);
    dr.height = 20;
    dr.eachCell((cell, colNum) => {
      cell.font = { name: 'Cairo', size: 9.5, color: { argb: NAVY }, bold: colNum <= 2 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: idx % 2 === 0 ? WHITE : SLATE_BG } };
      cell.alignment = { horizontal: colNum <= 2 || colNum === 6 ? 'right' : 'center', vertical: 'middle' };
      cell.border = thinBorder;
    });
  });

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
