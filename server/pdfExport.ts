import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import type PDFKit from 'pdfkit';
import type {
  MaintenanceCategory,
  MaintenanceSite,
  MonthlyReportFull,
  PerformanceThresholds,
} from '../src/types/report.ts';
import {
  DEFAULT_THRESHOLDS,
  STATUS_LABELS_AR,
  STATUS_LABELS_EN,
  TASK_STATUS_LABELS_AR,
} from '../src/types/report.ts';
import {
  computeReportMetrics,
  formatAed,
  formatDateTimeWestern,
  formatDateWestern,
  formatDecimalFixed,
  formatNumber,
  formatPct,
  formatPercentage,
  getMonthNameAr,
  getMonthNameEn,
} from '../src/utils/calculations.ts';
import { drawBidiLine, drawBidiParagraph, measureBidiParagraphHeight } from './pdfBiDi.ts';
import {
  PDF_COLORS,
  type PdfTableColumn,
  type PdfTableRow,
  createPdfLayoutContext,
  drawRtlTable,
  drawSectionHeader,
  ensurePdfSpace,
  newPdfPage,
  stampExecutiveHeaderAndFooterOnAllPages,
} from './pdfLayoutPrimitives.ts';

function extractImageBuffer(dataUrl: string | null | undefined): Buffer | null {
  if (!dataUrl) return null;
  const match = dataUrl.match(/^data:image\/(?:png|jpeg|jpg);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return null;
  try {
    return Buffer.from(match[1], 'base64');
  } catch {
    return null;
  }
}

function resolveSectionPhoto(prefix: string): string | null {
  const dir = path.join(process.cwd(), 'src', 'assets', 'images');
  if (!fs.existsSync(dir)) return null;
  const exact = path.join(dir, prefix);
  if (fs.existsSync(exact)) return exact;
  const files = fs.readdirSync(dir);
  const found = files.find(
    (f) => f.startsWith(prefix) && (f.endsWith('.jpg') || f.endsWith('.png') || f.endsWith('.jpeg'))
  );
  return found ? path.join(dir, found) : null;
}

/**
 * Draws a crisp vector Donut/Ring chart in PDFKit using short polygon wedges
 */
function drawVectorDonutChart(
  doc: PDFKit.PDFDocument,
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  slices: Array<{ value: number; color: string }>,
  centerTitle: string,
  centerValue: string
): void {
  const total = slices.reduce((acc, s) => acc + Math.max(0, s.value), 0);
  if (total <= 0) {
    doc.circle(cx, cy, outerR).lineWidth(1).strokeColor(PDF_COLORS.border).stroke();
    return;
  }

  let currentAngle = -Math.PI / 2;
  slices.forEach((slice) => {
    const val = Math.max(0, slice.value);
    if (val <= 0) return;
    const sweep = (val / total) * Math.PI * 2;
    const steps = Math.max(12, Math.ceil((sweep / (Math.PI * 2)) * 64));
    const points: Array<[number, number]> = [];
    for (let i = 0; i <= steps; i++) {
      const a = currentAngle + (sweep * i) / steps;
      points.push([cx + Math.cos(a) * outerR, cy + Math.sin(a) * outerR]);
    }
    for (let i = steps; i >= 0; i--) {
      const a = currentAngle + (sweep * i) / steps;
      points.push([cx + Math.cos(a) * innerR, cy + Math.sin(a) * innerR]);
    }
    if (points.length >= 3) {
      doc.polygon(...points).fill(slice.color);
    }
    currentAngle += sweep;
  });

  // Inner circle for crisp hole
  doc.circle(cx, cy, innerR - 0.5).fill(PDF_COLORS.white);
  doc.circle(cx, cy, innerR).lineWidth(0.6).strokeColor(PDF_COLORS.border).stroke();

  // Center text
  drawBidiLine(doc, centerTitle, cx - innerR + 4, cy - 11, {
    fontSize: 6.8,
    bold: true,
    color: PDF_COLORS.slateText,
    align: 'center',
    dir: 'rtl',
    width: (innerR - 4) * 2,
  });
  drawBidiLine(doc, centerValue, cx - innerR + 4, cy - 1, {
    fontSize: 10,
    bold: true,
    color: PDF_COLORS.navy,
    align: 'center',
    dir: 'ltr',
    width: (innerR - 4) * 2,
  });
}

function clampPct(pct: number | null | undefined): number {
  return Math.min(100, Math.max(0, Number(pct) || 0));
}

export async function generateMonthlyReportPdf(params: {
  report: MonthlyReportFull;
  sites: MaintenanceSite[];
  categories: MaintenanceCategory[];
  thresholds?: PerformanceThresholds;
  orientation?: 'landscape' | 'portrait';
  snapshotVersion?: number | null;
}): Promise<Buffer> {
  const {
    report,
    sites,
    categories,
    thresholds = DEFAULT_THRESHOLDS,
    orientation = 'landscape',
    snapshotVersion = null,
  } = params;

  const metrics = computeReportMetrics(report, sites, categories, thresholds);
  const monthAr = getMonthNameAr(report.month);
  const monthEn = getMonthNameEn(report.month);
  const isApprovedOrArchived = report.status === 'approved' || report.status === 'archived';
  const verNumber = snapshotVersion || report.currentVersion;

  // Resolve all official section & KPI photos from src/assets/images/
  const engineerImgPath = resolveSectionPhoto('engineer_tablet_inspector');
  const engineeringImgPath = resolveSectionPhoto('facility_engineering_ops');
  const technicianImgPath = resolveSectionPhoto('technician_electrical_panel');
  const safetyImgPath = resolveSectionPhoto('facility_safety_logistics');
  const receptionImgPath = resolveSectionPhoto('facility_reception_hall');
  const fireExtImgPath = resolveSectionPhoto('fire_extinguisher_safety');

  const kpiTotalReqImgPath = resolveSectionPhoto('kpi_total_requests_desk');
  const kpiTotalSvcImgPath = resolveSectionPhoto('kpi_total_services_systems');
  const kpiCompletionImgPath = resolveSectionPhoto('kpi_completion_rate_check');

  const resolveTopServicePhotoPrefix = (
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

  const kpiTopSvcImgPath = resolveSectionPhoto(resolveTopServicePhotoPrefix(metrics.topService));

  const doc = new PDFDocument({
    autoFirstPage: false,
    bufferPages: true,
    info: {
      Title: `التقرير الشهري لقسم إدارة المرافق - ${report.reportNumber} (${monthAr} ${report.year})`,
      Author: report.preparerName || 'SAHER Facilities Management',
      Subject: `Facilities Management Monthly Executive Report - ${monthEn} ${report.year}`,
      Creator: 'SAHER Facilities Management Executive System',
    },
  });

  const chunks: Buffer[] = [];
  const resultPromise = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const ctx = createPdfLayoutContext(doc, orientation);
  const { marginX, contentWidth } = ctx;

  // =========================================================================
  // PAGE 1:
  //   1. الملخص التنفيذي (4 Gradient KPI Cards + Engineer Photo)
  //   + ملخص العمليات والاعتماد (All 7 Operations Summary Cards with Photos)
  //   + 2. نظرة عامة على الأداء (Technical Ops Photo Card + Table + Donut Chart)
  // =========================================================================
  drawSectionHeader(ctx, '1. الملخص التنفيذي', 'Executive Summary', 60);

  const sec1H = 56;
  const sec1Y = ctx.curY - 3;
  const sec1Gap = 6;
  // 5 slots in RTL: 4 KPI cards on Right/Center + 1 Engineer Photo card on Left
  const photoCardW = Math.round(contentWidth * 0.21);
  const kpiAreaW = contentWidth - photoCardW - sec1Gap;
  const kpiW = (kpiAreaW - sec1Gap * 3) / 4;

  const execCards = [
    {
      label: 'إجمالي الطلبات',
      sub: 'Total Requests',
      value: formatNumber(metrics.totalReceived),
      accent: PDF_COLORS.blue,
      bg: '#EBF2FC',
      borderColor: '#B8CEE8',
      imgPath: kpiTotalReqImgPath,
    },
    {
      label: 'أعلى خدمة طلباً',
      sub: metrics.topService
        ? `${formatNumber(metrics.topService.receivedCount)} طلب · Top Service`
        : 'Top Service',
      value: metrics.topService ? metrics.topService.nameAr : '0',
      accent: '#B8862D',
      bg: '#F9F0DA',
      borderColor: '#E2C88B',
      smallValue: Boolean(metrics.topService),
      imgPath: kpiTopSvcImgPath,
    },
    {
      label: 'إجمالي الخدمات',
      sub: 'Total Services',
      value: formatNumber(metrics.activeServicesCount),
      accent: PDF_COLORS.blue,
      bg: '#E4F0FC',
      borderColor: '#A5C8EB',
      imgPath: kpiTotalSvcImgPath,
    },
    {
      label: 'نسبة الإنجاز الشهرية',
      sub: 'Monthly Completion Rate',
      value: formatPct(metrics.overallCompletionPct, '0.0%'),
      accent: PDF_COLORS.emerald,
      bg: '#E1F6ED',
      borderColor: '#9CD9C5',
      imgPath: kpiCompletionImgPath,
      valueColor: PDF_COLORS.emerald,
    },
  ];

  execCards.forEach((card, idx) => {
    const cx = marginX + contentWidth - kpiW * (idx + 1) - sec1Gap * idx;
    doc.roundedRect(cx, sec1Y, kpiW, sec1H, 6).fill(card.bg);

    // Top contextual corporate image inside the KPI card (upper portion with smooth bottom blend)
    const imgH = 21;
    if (card.imgPath) {
      doc.save();
      doc.roundedRect(cx, sec1Y, kpiW, sec1H, 6).clip();
      doc.image(card.imgPath, cx, sec1Y, {
        width: kpiW,
        height: imgH,
      });
      // Soft feather gradient transition into card background
      doc.rect(cx, sec1Y + imgH - 6, kpiW, 3).fillOpacity(0.45).fill(card.bg);
      doc.rect(cx, sec1Y + imgH - 3, kpiW, 3).fillOpacity(0.82).fill(card.bg);
      doc.restore();
    }

    doc
      .roundedRect(cx, sec1Y, kpiW, sec1H, 6)
      .lineWidth(0.8)
      .strokeColor(card.borderColor)
      .stroke();

    // Metric value in visual center
    drawBidiLine(doc, card.value, cx + 5, sec1Y + 21, {
      fontSize: card.smallValue ? 8.2 : 11.5,
      bold: true,
      color: card.valueColor || PDF_COLORS.navy,
      align: 'center',
      dir: 'auto',
      width: kpiW - 10,
    });
    // Arabic title below value
    drawBidiLine(doc, card.label, cx + 5, sec1Y + 34.5, {
      fontSize: 7.2,
      bold: true,
      color: PDF_COLORS.navy,
      align: 'center',
      dir: 'rtl',
      width: kpiW - 10,
    });
    // English / sub title below Arabic title
    drawBidiLine(doc, card.sub, cx + 5, sec1Y + 44.5, {
      fontSize: 6.3,
      bold: false,
      color: PDF_COLORS.slateText,
      align: 'center',
      dir: 'auto',
      width: kpiW - 10,
    });
  });

  // Leftmost slot: Engineer Inspection Photo Card
  const photoCardX = marginX;
  doc.roundedRect(photoCardX, sec1Y, photoCardW, sec1H, 6).fill(PDF_COLORS.navy);
  if (engineerImgPath) {
    doc.save();
    doc.roundedRect(photoCardX, sec1Y, photoCardW, sec1H, 6).clip();
    doc.image(engineerImgPath, photoCardX, sec1Y, {
      width: photoCardW,
      height: sec1H,
    });
    // Dark bottom overlay for caption
    doc.rect(photoCardX, sec1Y + sec1H - 15, photoCardW, 15).fillOpacity(0.78).fill(PDF_COLORS.navy);
    doc.restore();
  }
  doc
    .roundedRect(photoCardX, sec1Y, photoCardW, sec1H, 6)
    .lineWidth(0.9)
    .strokeColor(PDF_COLORS.gold)
    .stroke();
  drawBidiLine(doc, 'متابعة هندسية ورقابة جودة', photoCardX + 4, sec1Y + sec1H - 12.5, {
    fontSize: 6.5,
    bold: true,
    color: PDF_COLORS.goldLight,
    align: 'center',
    dir: 'rtl',
    width: photoCardW - 8,
  });

  ctx.curY = sec1Y + sec1H + 4;

  // =========================================================================
  // OPERATIONS SUMMARY STRIP (ملخص العمليات والاعتماد — All 7 Cards)
  // =========================================================================
  drawSectionHeader(
    ctx,
    'ملخص العمليات والاعتماد (7 بطاقات تنفيذية)',
    'Operations & Approval Summary Strip',
    92
  );

  // Row 1: 4 Photo Cards (Maintenance Details, Maintenance Services, Logistics, Security & Reception)
  const opsRow1Y = ctx.curY - 3;
  const opsRow1H = 44;
  const opsGap = 6;
  const opsCardW = (contentWidth - opsGap * 3) / 4;

  const opsRow1Cards = [
    {
      title: 'تفاصيل الصيانة بالمقرات',
      imgPath: engineeringImgPath,
      stat1Label: 'عدد المقرات',
      stat1Val: formatNumber(sites.length),
      stat2Label: 'إجمالي الأعطال',
      stat2Val: formatNumber(metrics.maintenance.grandTotalFaults),
    },
    {
      title: 'خدمات الصيانة',
      imgPath: technicianImgPath,
      stat1Label: 'قسم المرافق',
      stat1Val: formatNumber(report.maintenanceServices.fromFacilitiesDept),
      stat2Label: 'إدارات أخرى',
      stat2Val: formatNumber(report.maintenanceServices.fromOtherDepts),
    },
    {
      title: 'الدعم اللوجستي',
      imgPath: safetyImgPath,
      stat1Label: 'إجمالي الطلبات',
      stat1Val: formatNumber(metrics.logisticsTotal),
      stat2Label: 'القنوات الفعالة',
      stat2Val: formatNumber(report.logistics.length),
    },
    {
      title: 'خدمات الأمن والاستقبال',
      imgPath: receptionImgPath,
      stat1Label: 'المستلمة',
      stat1Val: formatNumber(metrics.securityTotals.totalReceived),
      stat2Label: 'المنفذة',
      stat2Val: formatNumber(metrics.securityTotals.totalExecuted),
    },
  ];

  opsRow1Cards.forEach((c, idx) => {
    const cx = marginX + contentWidth - opsCardW * (idx + 1) - opsGap * idx;
    doc.roundedRect(cx, opsRow1Y, opsCardW, opsRow1H, 5).fill(PDF_COLORS.white);
    doc
      .roundedRect(cx, opsRow1Y, opsCardW, opsRow1H, 5)
      .lineWidth(0.7)
      .strokeColor(PDF_COLORS.blueBorder)
      .stroke();
    // Header strip
    doc.rect(cx, opsRow1Y, opsCardW, 13).fill(PDF_COLORS.navy);
    drawBidiLine(doc, c.title, cx + 5, opsRow1Y + 2, {
      fontSize: 7.2,
      bold: true,
      color: PDF_COLORS.goldLight,
      align: 'right',
      dir: 'rtl',
      width: opsCardW - 10,
    });

    // Thumbnail photo on right inside card body
    const thumbW = 38;
    const thumbH = 26;
    const thumbX = cx + opsCardW - thumbW - 4;
    const thumbY = opsRow1Y + 15;
    doc.roundedRect(thumbX, thumbY, thumbW, thumbH, 3).fill(PDF_COLORS.slateBg);
    if (c.imgPath) {
      doc.save();
      doc.roundedRect(thumbX, thumbY, thumbW, thumbH, 3).clip();
      doc.image(c.imgPath, thumbX, thumbY, { width: thumbW, height: thumbH });
      doc.restore();
    }

    // 2 Mini stat boxes on left of thumbnail
    const statsAreaW = opsCardW - thumbW - 12;
    const statBoxW = (statsAreaW - 4) / 2;
    const s1X = cx + 4 + statBoxW + 4;
    const s2X = cx + 4;

    doc.roundedRect(s1X, thumbY, statBoxW, thumbH, 3).fill(PDF_COLORS.slateBg);
    drawBidiLine(doc, c.stat1Label, s1X + 2, thumbY + 3, {
      fontSize: 6.2,
      bold: true,
      color: PDF_COLORS.slateText,
      align: 'center',
      dir: 'rtl',
      width: statBoxW - 4,
    });
    drawBidiLine(doc, c.stat1Val, s1X + 2, thumbY + 14, {
      fontSize: 8.5,
      bold: true,
      color: PDF_COLORS.navy,
      align: 'center',
      dir: 'ltr',
      width: statBoxW - 4,
    });

    doc.roundedRect(s2X, thumbY, statBoxW, thumbH, 3).fill(PDF_COLORS.blueLight);
    drawBidiLine(doc, c.stat2Label, s2X + 2, thumbY + 3, {
      fontSize: 6.2,
      bold: true,
      color: PDF_COLORS.blue,
      align: 'center',
      dir: 'rtl',
      width: statBoxW - 4,
    });
    drawBidiLine(doc, c.stat2Val, s2X + 2, thumbY + 14, {
      fontSize: 8.5,
      bold: true,
      color: PDF_COLORS.emerald,
      align: 'center',
      dir: 'ltr',
      width: statBoxW - 4,
    });
  });

  // Row 2: 3 Summary Cards (Tasks 4-metrics, Challenges 2-metrics, Preparation/Review/Approval 3-cols)
  const opsRow2Y = opsRow1Y + opsRow1H + 4;
  const opsRow2H = 38;
  const card5W = Math.round(contentWidth * 0.34);
  const card6W = Math.round(contentWidth * 0.24);
  const card7W = contentWidth - card5W - card6W - opsGap * 2;

  const card5X = marginX + contentWidth - card5W;
  const card6X = card5X - opsGap - card6W;
  const card7X = marginX;

  // Card 5: المهام التشغيلية والمتابعة
  doc.roundedRect(card5X, opsRow2Y, card5W, opsRow2H, 5).fill(PDF_COLORS.white);
  doc.roundedRect(card5X, opsRow2Y, card5W, opsRow2H, 5).lineWidth(0.7).strokeColor(PDF_COLORS.blueBorder).stroke();
  doc.rect(card5X, opsRow2Y, card5W, 12).fill('#0C4176');
  drawBidiLine(doc, 'المهام التشغيلية والمتابعة', card5X + 6, opsRow2Y + 1.5, {
    fontSize: 7,
    bold: true,
    color: PDF_COLORS.white,
    align: 'right',
    dir: 'rtl',
    width: card5W - 12,
  });
  const tStatItems = [
    { label: 'الإجمالي', val: formatNumber(metrics.tasksSummary.totalMeaningful), color: PDF_COLORS.navy },
    { label: 'المنجزة', val: formatNumber(metrics.tasksSummary.completed), color: PDF_COLORS.emerald },
    { label: 'قيد التنفيذ', val: formatNumber(metrics.tasksSummary.inProgress), color: PDF_COLORS.amber },
    { label: 'المتأخرة', val: formatNumber(metrics.tasksSummary.delayed), color: PDF_COLORS.crimson },
  ];
  const tBoxW = (card5W - 15) / 4;
  tStatItems.forEach((st, i) => {
    const bx = card5X + card5W - 3 - tBoxW * (i + 1) - 3 * i;
    doc.roundedRect(bx, opsRow2Y + 15, tBoxW, 24, 3).fill(PDF_COLORS.slateBg);
    drawBidiLine(doc, st.label, bx + 2, opsRow2Y + 17, {
      fontSize: 6,
      bold: true,
      color: PDF_COLORS.slateText,
      align: 'center',
      dir: 'rtl',
      width: tBoxW - 4,
    });
    drawBidiLine(doc, st.val, bx + 2, opsRow2Y + 26, {
      fontSize: 8.2,
      bold: true,
      color: st.color,
      align: 'center',
      dir: 'ltr',
      width: tBoxW - 4,
    });
  });

  // Card 6: التحديات والتوصيات
  doc.roundedRect(card6X, opsRow2Y, card6W, opsRow2H, 5).fill(PDF_COLORS.white);
  doc.roundedRect(card6X, opsRow2Y, card6W, opsRow2H, 5).lineWidth(0.7).strokeColor(PDF_COLORS.blueBorder).stroke();
  doc.rect(card6X, opsRow2Y, card6W, 12).fill('#0C4176');
  drawBidiLine(doc, 'التحديات والتوصيات', card6X + 6, opsRow2Y + 1.5, {
    fontSize: 7,
    bold: true,
    color: PDF_COLORS.white,
    align: 'right',
    dir: 'rtl',
    width: card6W - 12,
  });
  const chCount = report.challenges.filter((c) => c.challengeText.trim()).length;
  const recCount = report.challenges.filter((c) => c.recommendationText.trim()).length;
  const cBoxW = (card6W - 9) / 2;
  [
    { label: 'التحديات المرصودة', val: formatNumber(chCount), color: PDF_COLORS.amber },
    { label: 'التوصيات التنفيذية', val: formatNumber(recCount), color: PDF_COLORS.blue },
  ].forEach((st, i) => {
    const bx = card6X + card6W - 3 - cBoxW * (i + 1) - 3 * i;
    doc.roundedRect(bx, opsRow2Y + 15, cBoxW, 24, 3).fill(PDF_COLORS.slateBg);
    drawBidiLine(doc, st.label, bx + 2, opsRow2Y + 17, {
      fontSize: 6,
      bold: true,
      color: PDF_COLORS.slateText,
      align: 'center',
      dir: 'rtl',
      width: cBoxW - 4,
    });
    drawBidiLine(doc, st.val, bx + 2, opsRow2Y + 26, {
      fontSize: 8.5,
      bold: true,
      color: st.color,
      align: 'center',
      dir: 'ltr',
      width: cBoxW - 4,
    });
  });

  // Card 7: الإعداد والمراجعة والاعتماد
  doc.roundedRect(card7X, opsRow2Y, card7W, opsRow2H, 5).fill(PDF_COLORS.white);
  doc.roundedRect(card7X, opsRow2Y, card7W, opsRow2H, 5).lineWidth(0.7).strokeColor(PDF_COLORS.blueBorder).stroke();
  doc.rect(card7X, opsRow2Y, card7W, 12).fill(PDF_COLORS.navy);
  drawBidiLine(doc, 'الإعداد والمراجعة والاعتماد', card7X + 6, opsRow2Y + 1.5, {
    fontSize: 7,
    bold: true,
    color: PDF_COLORS.goldLight,
    align: 'right',
    dir: 'rtl',
    width: card7W - 12,
  });
  const pBoxW = (card7W - 12) / 3;
  [
    {
      role: 'معد التقرير',
      name: report.preparerName || '—',
      sub: report.preparerSignatureImage ? 'موقّع إلكترونياً' : 'قيد التوقيع',
      color: PDF_COLORS.emerald,
    },
    {
      role: 'حالة المراجعة',
      name: STATUS_LABELS_AR[report.status],
      sub: `الإصدار v${verNumber}`,
      color: PDF_COLORS.blue,
    },
    {
      role: 'معتمد التقرير',
      name: report.approverName || '—',
      sub: report.approverSignatureImage ? 'موقّع إلكترونياً' : 'بانتظار التوقيع',
      color: report.approverSignatureImage ? PDF_COLORS.emerald : PDF_COLORS.amber,
    },
  ].forEach((st, i) => {
    const bx = card7X + card7W - 3 - pBoxW * (i + 1) - 3 * i;
    doc.roundedRect(bx, opsRow2Y + 15, pBoxW, 24, 3).fill(PDF_COLORS.slateBg);
    drawBidiLine(doc, `${st.role}: ${st.name}`, bx + 2, opsRow2Y + 17, {
      fontSize: 6.2,
      bold: true,
      color: PDF_COLORS.navy,
      align: 'right',
      dir: 'rtl',
      width: pBoxW - 4,
    });
    drawBidiLine(doc, st.sub, bx + 2, opsRow2Y + 27, {
      fontSize: 6,
      bold: true,
      color: st.color,
      align: 'right',
      dir: 'rtl',
      width: pBoxW - 4,
    });
  });

  ctx.curY = opsRow2Y + opsRow2H + 5;

  // =========================================================================
  // 2. نظرة عامة على الأداء (3 Cards: Technical Ops Photo + Table + Donut Chart)
  // =========================================================================
  drawSectionHeader(
    ctx,
    '2. نظرة عامة على الأداء — الطلبات حسب الخدمة وتوزيع الأداء',
    'Performance Overview — Requests by Service & Distribution',
    150
  );

  const sortedByReq = [...metrics.servicesWithMetrics].sort((a, b) => b.receivedCount - a.receivedCount);
  const servicePalette = [
    '#0B2341',
    '#1769AA',
    '#069B74',
    '#C8A85D',
    '#0284C7',
    '#2563EB',
    '#0D9488',
    '#D97706',
    '#7C3AED',
    '#DC2626',
    '#475569',
  ];

  if (orientation === 'landscape') {
    const sec2TopY = ctx.curY;
    const rightCardW = Math.round(contentWidth * 0.22);
    const centerTableW = Math.round(contentWidth * 0.46);
    const leftChartW = contentWidth - rightCardW - centerTableW - 12;

    const rightCardX = marginX + contentWidth - rightCardW;
    const centerTableX = rightCardX - 6 - centerTableW;
    const leftChartX = marginX;

    // 2B. Center Table: الطلبات حسب الخدمة
    const s2Cols: PdfTableColumn[] = [
      { key: 'idx', label: '#', widthPct: 9, align: 'center', dir: 'ltr' },
      { key: 'name', label: 'الخدمة', widthPct: 53, align: 'right', dir: 'rtl', bold: true },
      { key: 'count', label: 'العدد', widthPct: 19, align: 'center', dir: 'ltr', bold: true },
      { key: 'share', label: 'النسبة %', widthPct: 19, align: 'center', dir: 'ltr', bold: true },
    ];
    const s2Rows: PdfTableRow[] = sortedByReq.map((s, idx) => ({
      cells: {
        idx: { text: formatNumber(idx + 1) },
        name: { text: s.nameAr },
        count: { text: formatNumber(s.receivedCount) },
        share: { text: formatPct(s.shareOfTotalPct, '0.0%'), color: PDF_COLORS.blue },
      },
    }));
    const s2TotalRow: PdfTableRow = {
      isSummary: true,
      cells: {
        idx: { text: '' },
        name: { text: 'الإجمالي العام | Total', bold: true },
        count: { text: formatNumber(metrics.totalReceived), bold: true },
        share: { text: metrics.totalReceived > 0 ? formatPercentage(100) : '0.0%', bold: true },
      },
    };

    drawRtlTable(ctx, s2Cols, s2Rows, {
      fontSize: 7.2,
      headerFontSize: 7.4,
      cellPaddingY: 1.3,
      minRowHeight: 13.1,
      summaryRow: s2TotalRow,
      startX: centerTableX,
      tableWidth: centerTableW,
    });
    const sec2BottomY = ctx.curY - 10;
    const boxH = Math.max(155, sec2BottomY - sec2TopY);

    if (sec2TopY + boxH <= ctx.contentBottom) {
      // 2A. Right Card: المهام والتحديات الفنية (with Technician Photo)
      doc.roundedRect(rightCardX, sec2TopY, rightCardW, boxH, 5).fill(PDF_COLORS.slateBg);
      doc
        .roundedRect(rightCardX, sec2TopY, rightCardW, boxH, 5)
        .lineWidth(0.7)
        .strokeColor(PDF_COLORS.blueBorder)
        .stroke();
      doc.rect(rightCardX, sec2TopY, rightCardW, 16).fill('#0C4176');
      drawBidiLine(doc, 'المهام والتحديات الفنية', rightCardX + 6, sec2TopY + 3, {
        fontSize: 7.8,
        bold: true,
        color: PDF_COLORS.goldLight,
        align: 'right',
        dir: 'rtl',
        width: rightCardW - 12,
      });

      const techPhotoH = Math.max(68, boxH - 96);
      if (technicianImgPath) {
        doc.save();
        doc.roundedRect(rightCardX + 6, sec2TopY + 21, rightCardW - 12, techPhotoH, 4).clip();
        doc.image(technicianImgPath, rightCardX + 6, sec2TopY + 21, {
          width: rightCardW - 12,
          height: techPhotoH,
        });
        doc.restore();
      }
      const statBaseY = sec2TopY + 25 + techPhotoH;
      [
        { label: 'إجمالي المستلمة', val: formatNumber(metrics.totalReceived), color: PDF_COLORS.navy },
        { label: 'إجمالي المنفذة', val: formatNumber(metrics.totalExecuted), color: PDF_COLORS.emerald },
        { label: 'معدل الإنجاز العام', val: formatPct(metrics.overallCompletionPct), color: PDF_COLORS.blue },
      ].forEach((row, rIdx) => {
        const ry = statBaseY + rIdx * 21;
        doc.roundedRect(rightCardX + 6, ry, rightCardW - 12, 18, 3).fill(PDF_COLORS.white);
        drawBidiLine(doc, `${row.label}: ${row.val}`, rightCardX + 10, ry + 4, {
          fontSize: 7.2,
          bold: true,
          color: row.color,
          align: 'right',
          dir: 'rtl',
          width: rightCardW - 20,
        });
      });

      // 2C. Left Card: توزيع الأداء (Vector Donut Chart + Legend)
      doc.roundedRect(leftChartX, sec2TopY, leftChartW, boxH, 5).fill(PDF_COLORS.white);
      doc
        .roundedRect(leftChartX, sec2TopY, leftChartW, boxH, 5)
        .lineWidth(0.7)
        .strokeColor(PDF_COLORS.blueBorder)
        .stroke();
      doc.rect(leftChartX, sec2TopY, leftChartW, 16).fill(PDF_COLORS.navy);
      drawBidiLine(doc, 'توزيع الأداء · Performance Distribution', leftChartX + 6, sec2TopY + 3, {
        fontSize: 7.8,
        bold: true,
        color: PDF_COLORS.goldLight,
        align: 'right',
        dir: 'rtl',
        width: leftChartW - 12,
      });

      const activeChartSlices = sortedByReq
        .filter((s) => s.receivedCount > 0)
        .map((s, idx) => ({
          nameAr: s.nameAr,
          value: s.receivedCount,
          sharePct: s.shareOfTotalPct,
          color: servicePalette[idx % servicePalette.length],
        }));

      const donutCx = leftChartX + leftChartW - 56;
      const donutCy = sec2TopY + 20 + (boxH - 24) / 2;
      drawVectorDonutChart(
        doc,
        donutCx,
        donutCy,
        44,
        25,
        activeChartSlices,
        'الإجمالي',
        formatNumber(metrics.totalReceived)
      );

      // Legend on left half of Donut card
      const legX = leftChartX + 6;
      const legW = leftChartW - 118;
      activeChartSlices.slice(0, 8).forEach((sl, idx) => {
        const ly = sec2TopY + 22 + idx * 17;
        doc.roundedRect(legX, ly, legW, 14, 2.5).fill(PDF_COLORS.slateBg);
        doc.circle(legX + legW - 6, ly + 7, 3).fill(sl.color);
        drawBidiLine(
          doc,
          `${sl.nameAr} (${formatPct(sl.sharePct, '0%')})`,
          legX + 4,
          ly + 2.5,
          {
            fontSize: 6.4,
            bold: true,
            color: PDF_COLORS.navy,
            align: 'right',
            dir: 'rtl',
            width: legW - 14,
          }
        );
      });
    }
  } else {
    drawRtlTable(
      ctx,
      [
        { key: 'idx', label: '#', widthPct: 8, align: 'center', dir: 'ltr' },
        { key: 'name', label: 'الخدمة', widthPct: 54, align: 'right', dir: 'rtl', bold: true },
        { key: 'count', label: 'الطلبات', widthPct: 19, align: 'center', dir: 'ltr', bold: true },
        { key: 'share', label: 'التوزيع النسبي', widthPct: 19, align: 'center', dir: 'ltr' },
      ],
      sortedByReq.map((s, idx) => ({
        cells: {
          idx: { text: formatNumber(idx + 1) },
          name: { text: s.nameAr },
          count: { text: formatNumber(s.receivedCount) },
          share: { text: formatPct(s.shareOfTotalPct, '0.0%') },
        },
      })),
      {
        fontSize: 8,
        summaryRow: {
          isSummary: true,
          cells: {
            idx: { text: '' },
            name: { text: 'الإجمالي العام | Total', bold: true },
            count: { text: formatNumber(metrics.totalReceived), bold: true },
            share: { text: metrics.totalReceived > 0 ? formatPercentage(100) : '0.0%', bold: true },
          },
        },
      }
    );
  }

  // =========================================================================
  // PAGE 2:
  //   3. ملخص الخدمات ومؤشرات الإنجاز (with Visual Progress Bar column)
  //   + 4. العقود والرخص (3 Tinted Cards with Active/Inactive & Notes)
  //   + 5. الطفايات وملاحظات المخاطر (2 Photo Cards with Fire/Safety Photos)
  // =========================================================================
  newPdfPage(ctx);

  drawSectionHeader(ctx, '3. ملخص الخدمات ومؤشرات الإنجاز', 'Services Summary & Completion KPIs', 90);

  const sortedSummary = [...metrics.servicesWithMetrics].sort((a, b) => {
    const sa = report.services.find((x) => x.serviceId === a.serviceId)?.summaryOrder ?? 99;
    const sb = report.services.find((x) => x.serviceId === b.serviceId)?.summaryOrder ?? 99;
    return sa - sb;
  });

  drawRtlTable(
    ctx,
    [
      { key: 'idx', label: '#', widthPct: 5, align: 'center', dir: 'ltr' },
      { key: 'name', label: 'الخدمة | Service', widthPct: 31, align: 'right', dir: 'rtl', bold: true },
      { key: 'received', label: 'المستلمة', widthPct: 12, align: 'center', dir: 'ltr', bold: true },
      { key: 'executed', label: 'المنفذة', widthPct: 12, align: 'center', dir: 'ltr', color: PDF_COLORS.emerald, bold: true },
      { key: 'bar', label: 'مؤشر الإنجاز', widthPct: 16, align: 'center', dir: 'ltr', color: PDF_COLORS.blue },
      { key: 'pct', label: 'النسبة', widthPct: 11, align: 'center', dir: 'ltr', bold: true },
      { key: 'level', label: 'المستوى', widthPct: 13, align: 'center', dir: 'rtl', bold: true },
    ],
    sortedSummary.map((s, idx) => ({
      cells: {
        idx: { text: formatNumber(idx + 1) },
        name: { text: s.nameAr },
        received: { text: formatNumber(s.receivedCount) },
        executed: { text: formatNumber(s.executedCount), color: PDF_COLORS.emerald },
        bar: {
          text: '',
          progressPct: clampPct(s.completionPct),
          progressColor:
            s.level.tone === 'emerald'
              ? PDF_COLORS.emerald
              : s.level.tone === 'blue'
                ? PDF_COLORS.blue
                : PDF_COLORS.amber,
        },
        pct: { text: formatPct(s.completionPct, '—') },
        level: {
          text: s.level.labelAr,
          color:
            s.level.tone === 'emerald'
              ? PDF_COLORS.emerald
              : s.level.tone === 'blue'
                ? PDF_COLORS.blue
                : s.level.tone === 'red'
                  ? PDF_COLORS.crimson
                  : s.level.tone === 'orange' || s.level.tone === 'amber'
                    ? PDF_COLORS.amber
                    : PDF_COLORS.navy,
        },
      },
    })),
    {
      fontSize: 8,
      cellPaddingY: 3.5,
      summaryRow: {
        isSummary: true,
        cells: {
          idx: { text: '' },
          name: { text: `الإجمالي (${formatNumber(report.services.length)} خدمة)`, bold: true },
          received: { text: formatNumber(metrics.totalReceived), bold: true },
          executed: { text: formatNumber(metrics.totalExecuted), bold: true, color: PDF_COLORS.emerald },
          bar: {
            text: '',
            progressPct: clampPct(metrics.overallCompletionPct),
            progressColor: PDF_COLORS.emerald,
          },
          pct: { text: formatPct(metrics.overallCompletionPct, '—'), bold: true },
          level: { text: 'المعدل العام', bold: true },
        },
      },
    }
  );

  // Sections 4 & 5 Side-by-Side Cards with Photos & Full Notes
  drawSectionHeader(
    ctx,
    '4. العقود والرخص و 5. الطفايات وملاحظات المخاطر',
    'Contracts, Licenses & Fire Safety Observations',
    125
  );

  // Measure dynamic card height so long notes never clip
  const totalCards45 = 5; // 3 Contract cards + 2 Safety Photo cards
  const card45Gap = 6;
  const card45W = (contentWidth - card45Gap * (totalCards45 - 1)) / totalCards45;

  let maxNoteHeight = 46;
  report.contracts.forEach((c) => {
    const h = measureBidiParagraphHeight(doc, c.notes || '—', card45W - 14, 7.2, false, 1.5);
    if (h + 18 > maxNoteHeight) maxNoteHeight = h + 18;
  });
  report.safety.forEach((s) => {
    const h = measureBidiParagraphHeight(doc, s.notes || '—', card45W - 14, 7.2, false, 1.5);
    if (h + 18 > maxNoteHeight) maxNoteHeight = h + 18;
  });

  const card45H = 68 + maxNoteHeight;
  ensurePdfSpace(ctx, card45H + 10);
  const c45Y = ctx.curY;

  // Render 3 Contract Cards on the Right (indices 0, 1, 2)
  report.contracts.slice(0, 3).forEach((c, idx) => {
    const cx = marginX + contentWidth - card45W * (idx + 1) - card45Gap * idx;
    const headerColors = ['#0C4176', '#8C641E', '#067A5B'];
    const bgColors = ['#F2F8FD', '#FAF5EA', '#EEFBF7'];
    doc.roundedRect(cx, c45Y, card45W, card45H, 6).fill(bgColors[idx % bgColors.length]);
    doc
      .roundedRect(cx, c45Y, card45W, card45H, 6)
      .lineWidth(0.75)
      .strokeColor(PDF_COLORS.blueBorder)
      .stroke();
    doc.rect(cx, c45Y, card45W, 16).fill(headerColors[idx % headerColors.length]);
    drawBidiLine(doc, c.nameAr, cx + 6, c45Y + 3, {
      fontSize: 7.8,
      bold: true,
      color: PDF_COLORS.white,
      align: 'right',
      dir: 'rtl',
      width: card45W - 12,
    });

    const boxW = (card45W - 14) / 2;
    const activeX = cx + 5 + boxW + 4;
    const inactiveX = cx + 5;
    // Active Box
    doc.roundedRect(activeX, c45Y + 21, boxW, 34, 4).fill(PDF_COLORS.white);
    doc.roundedRect(activeX, c45Y + 21, boxW, 34, 4).lineWidth(0.6).strokeColor(PDF_COLORS.emerald).stroke();
    drawBidiLine(doc, 'الفعّالة', activeX + 2, c45Y + 24, {
      fontSize: 6.5,
      bold: true,
      color: PDF_COLORS.emerald,
      align: 'center',
      dir: 'rtl',
      width: boxW - 4,
    });
    drawBidiLine(doc, formatNumber(c.activeCount), activeX + 2, c45Y + 36, {
      fontSize: 10.5,
      bold: true,
      color: PDF_COLORS.emerald,
      align: 'center',
      dir: 'ltr',
      width: boxW - 4,
    });

    // Inactive Box
    doc.roundedRect(inactiveX, c45Y + 21, boxW, 34, 4).fill(PDF_COLORS.white);
    doc.roundedRect(inactiveX, c45Y + 21, boxW, 34, 4).lineWidth(0.6).strokeColor(PDF_COLORS.crimson).stroke();
    drawBidiLine(doc, 'غير الفعّالة', inactiveX + 2, c45Y + 24, {
      fontSize: 6.5,
      bold: true,
      color: PDF_COLORS.crimson,
      align: 'center',
      dir: 'rtl',
      width: boxW - 4,
    });
    drawBidiLine(doc, formatNumber(c.inactiveCount), inactiveX + 2, c45Y + 36, {
      fontSize: 10.5,
      bold: true,
      color: PDF_COLORS.crimson,
      align: 'center',
      dir: 'ltr',
      width: boxW - 4,
    });

    // Notes Box
    const noteBoxY = c45Y + 60;
    const noteBoxH = card45H - 65;
    doc.roundedRect(cx + 5, noteBoxY, card45W - 10, noteBoxH, 4).fill(PDF_COLORS.white);
    doc
      .roundedRect(cx + 5, noteBoxY, card45W - 10, noteBoxH, 4)
      .lineWidth(0.5)
      .strokeColor(PDF_COLORS.border)
      .stroke();
    drawBidiParagraph(doc, `الملاحظات: ${c.notes || '—'}`, cx + 8, noteBoxY + 4, card45W - 16, {
      fontSize: 7,
      bold: false,
      color: PDF_COLORS.navy,
      align: 'right',
      dir: 'rtl',
      lineGap: 1.4,
    });
  });

  // Render 2 Safety Cards with Photos on the Left (indices 3, 4)
  report.safety.slice(0, 2).forEach((s, sIdx) => {
    const idx = 3 + sIdx;
    const cx = marginX + contentWidth - card45W * (idx + 1) - card45Gap * idx;
    const isFire = s.groupKey === 'fire_extinguishers' || sIdx === 0;
    const photoPath = isFire ? fireExtImgPath : safetyImgPath;

    doc.roundedRect(cx, c45Y, card45W, card45H, 6).fill(PDF_COLORS.slateBg);
    doc
      .roundedRect(cx, c45Y, card45W, card45H, 6)
      .lineWidth(0.75)
      .strokeColor(PDF_COLORS.gold)
      .stroke();
    doc.rect(cx, c45Y, card45W, 16).fill(PDF_COLORS.navy);
    drawBidiLine(doc, s.nameAr, cx + 6, c45Y + 3, {
      fontSize: 7.8,
      bold: true,
      color: PDF_COLORS.goldLight,
      align: 'right',
      dir: 'rtl',
      width: card45W - 12,
    });

    // Thumbnail photo on right inside card
    const thumbW = 34;
    const thumbH = 34;
    const thumbX = cx + card45W - thumbW - 5;
    const thumbY = c45Y + 21;
    if (photoPath) {
      doc.save();
      doc.roundedRect(thumbX, thumbY, thumbW, thumbH, 4).clip();
      doc.image(photoPath, thumbX, thumbY, { width: thumbW, height: thumbH });
      doc.restore();
    }

    const statsW = card45W - thumbW - 14;
    const halfW = (statsW - 4) / 2;
    const p1X = cx + 5 + halfW + 4;
    const p2X = cx + 5;

    doc.roundedRect(p1X, thumbY, halfW, thumbH, 4).fill(PDF_COLORS.emeraldBg);
    drawBidiLine(doc, isFire ? 'صالحة' : 'مغلقة', p1X + 2, thumbY + 3, {
      fontSize: 6.2,
      bold: true,
      color: PDF_COLORS.emerald,
      align: 'center',
      dir: 'rtl',
      width: halfW - 4,
    });
    drawBidiLine(doc, formatNumber(s.primaryCount), p1X + 2, thumbY + 15, {
      fontSize: 9.5,
      bold: true,
      color: PDF_COLORS.emerald,
      align: 'center',
      dir: 'ltr',
      width: halfW - 4,
    });

    doc.roundedRect(p2X, thumbY, halfW, thumbH, 4).fill(PDF_COLORS.crimsonBg);
    drawBidiLine(doc, isFire ? 'غير صالحة' : 'مفتوحة', p2X + 2, thumbY + 3, {
      fontSize: 6.2,
      bold: true,
      color: PDF_COLORS.crimson,
      align: 'center',
      dir: 'rtl',
      width: halfW - 4,
    });
    drawBidiLine(doc, formatNumber(s.secondaryCount), p2X + 2, thumbY + 15, {
      fontSize: 9.5,
      bold: true,
      color: PDF_COLORS.crimson,
      align: 'center',
      dir: 'ltr',
      width: halfW - 4,
    });

    const noteBoxY = c45Y + 60;
    const noteBoxH = card45H - 65;
    doc.roundedRect(cx + 5, noteBoxY, card45W - 10, noteBoxH, 4).fill(PDF_COLORS.white);
    doc
      .roundedRect(cx + 5, noteBoxY, card45W - 10, noteBoxH, 4)
      .lineWidth(0.5)
      .strokeColor(PDF_COLORS.border)
      .stroke();
    drawBidiParagraph(doc, `الملاحظات: ${s.notes || '—'}`, cx + 8, noteBoxY + 4, card45W - 16, {
      fontSize: 7,
      bold: false,
      color: PDF_COLORS.navy,
      align: 'right',
      dir: 'rtl',
      lineGap: 1.4,
    });
  });

  ctx.curY = c45Y + card45H + 10;

  // =========================================================================
  // PAGE 3:
  //   6. تفاصيل الصيانة بالمقرات والتكاليف:
  //      - 4 Maintenance KPI Cards
  //      - Full Sites × Categories Matrix Table
  //      - Grand Maintenance Cost Callout Strip
  //      - Executive Horizontal Facility Comparison Chart
  // =========================================================================
  newPdfPage(ctx);

  drawSectionHeader(
    ctx,
    '6. تفاصيل الصيانة حسب المقر والفئة والتكاليف (AED)',
    'Maintenance Details Matrix & Financial Costs',
    90
  );

  // 4 Maintenance KPI Cards at top of Section 6
  const sortedPdfSites = sites
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
  const topPdfSite = sortedPdfSites.length > 0 && sortedPdfSites[0].faults > 0 ? sortedPdfSites[0] : null;

  const mKpiGap = 8;
  const mKpiW = (contentWidth - mKpiGap * 3) / 4;
  const mKpiH = 44;
  const mKpiY = ctx.curY;

  const maintKpiCards = [
    {
      label: 'إجمالي الأعطال المسجلة',
      value: `${formatNumber(metrics.maintenance.grandTotalFaults)} عطل`,
      sub: `موزعة على ${formatNumber(sites.length)} مقرات`,
      accent: PDF_COLORS.blue,
      bg: '#EAF4FC',
    },
    {
      label: 'المقر الأعلى في الأعطال',
      value: topPdfSite ? topPdfSite.nameAr : 'لا توجد أعطال',
      sub: topPdfSite ? `${formatNumber(topPdfSite.faults)} عطلاً` : '—',
      accent: PDF_COLORS.gold,
      bg: '#FDF8EC',
      smallVal: true,
    },
    {
      label: 'إجمالي التكلفة / النثرية',
      value: formatAed(metrics.maintenance.pettyCashTotalAed),
      sub: 'مصروفات الصيانة النثرية',
      accent: PDF_COLORS.emerald,
      bg: '#E3F7F3',
    },
    {
      label: 'إجمالي التكلفة / أمر شراء',
      value: formatAed(metrics.maintenance.purchaseOrderTotalAed),
      sub: 'أوامر الشراء المعتمدة',
      accent: PDF_COLORS.navy,
      bg: '#E7EBFC',
    },
  ];

  maintKpiCards.forEach((mc, idx) => {
    const cx = marginX + contentWidth - mKpiW * (idx + 1) - mKpiGap * idx;
    doc.roundedRect(cx, mKpiY, mKpiW, mKpiH, 5).fill(mc.bg);
    doc.roundedRect(cx, mKpiY, mKpiW, mKpiH, 5).lineWidth(0.7).strokeColor(PDF_COLORS.border).stroke();
    doc.rect(cx, mKpiY, mKpiW, 3).fill(mc.accent);
    drawBidiLine(doc, mc.label, cx + 6, mKpiY + 5, {
      fontSize: 7.4,
      bold: true,
      color: PDF_COLORS.slateText,
      align: 'right',
      dir: 'rtl',
      width: mKpiW - 12,
    });
    drawBidiLine(doc, mc.value, cx + 6, mKpiY + 17, {
      fontSize: mc.smallVal ? 8.8 : 10.5,
      bold: true,
      color: PDF_COLORS.navy,
      align: 'center',
      dir: 'auto',
      width: mKpiW - 12,
    });
    drawBidiLine(doc, mc.sub, cx + 6, mKpiY + 31, {
      fontSize: 6.8,
      bold: true,
      color: mc.accent,
      align: 'center',
      dir: 'auto',
      width: mKpiW - 12,
    });
  });

  ctx.curY = mKpiY + mKpiH + 8;

  // Chunk categories if > 12 so columns remain roomy and readable in A4
  const chunkSize = orientation === 'landscape' ? 12 : 7;
  const catChunks: MaintenanceCategory[][] = [];
  for (let i = 0; i < categories.length; i += chunkSize) {
    catChunks.push(categories.slice(i, i + chunkSize));
  }
  if (catChunks.length === 0) catChunks.push([]);

  catChunks.forEach((catSlice, chunkIdx) => {
    const isLastSlice = chunkIdx === catChunks.length - 1;
    const catPct = catSlice.length > 0 ? 74 / catSlice.length : 74;

    const cols: PdfTableColumn[] = [
      { key: 'site', label: 'المقر / البيان', widthPct: 16, align: 'right', dir: 'rtl', bold: true },
      ...catSlice.map(
        (cat): PdfTableColumn => ({
          key: `c_${cat.id}`,
          label: cat.nameAr,
          widthPct: catPct,
          align: 'center',
          dir: 'auto',
        })
      ),
      {
        key: 'total',
        label: isLastSlice ? 'إجمالي المقر' : 'مجموع المجموعة',
        widthPct: 10,
        align: 'center',
        dir: 'ltr',
        bold: true,
      },
    ];

    const dataRows: PdfTableRow[] = sites.map((site) => {
      const cells: PdfTableRow['cells'] = {
        site: { text: site.nameAr, bold: true },
      };
      let sliceSum = 0;
      for (const cat of catSlice) {
        const val = report.maintenanceMatrix[site.id]?.[cat.id] ?? 0;
        sliceSum += val;
        cells[`c_${cat.id}`] = { text: formatNumber(val) };
      }
      cells.total = {
        text: formatNumber(
          isLastSlice && catChunks.length === 1
            ? metrics.maintenance.siteTotals[site.id] ?? 0
            : sliceSum
        ),
        bold: true,
        color: PDF_COLORS.navy,
      };
      return { cells };
    });

    // Fault totals row
    const faultTotalsCells: PdfTableRow['cells'] = {
      site: { text: 'إجمالي الأعطال', bold: true, color: PDF_COLORS.navy },
    };
    let sliceFaultSum = 0;
    for (const cat of catSlice) {
      const tot = metrics.maintenance.categoryTotals[cat.id] ?? 0;
      sliceFaultSum += tot;
      faultTotalsCells[`c_${cat.id}`] = { text: formatNumber(tot), bold: true };
    }
    faultTotalsCells.total = {
      text: formatNumber(
        isLastSlice && catChunks.length === 1 ? metrics.maintenance.grandTotalFaults : sliceFaultSum
      ),
      bold: true,
      color: PDF_COLORS.emerald,
    };
    dataRows.push({ cells: faultTotalsCells, fillColor: PDF_COLORS.blueLight });

    // Petty Cash AED row
    const pettyCells: PdfTableRow['cells'] = {
      site: { text: 'النثرية (AED)', bold: true },
    };
    let slicePettySum = 0;
    for (const cat of catSlice) {
      const v = report.maintenanceCosts[cat.id]?.pettyCashAed ?? 0;
      slicePettySum += v;
      pettyCells[`c_${cat.id}`] = { text: formatDecimalFixed(v) };
    }
    pettyCells.total = {
      text: formatDecimalFixed(
        isLastSlice && catChunks.length === 1 ? metrics.maintenance.pettyCashTotalAed : slicePettySum
      ),
      bold: true,
      color: PDF_COLORS.blue,
    };
    dataRows.push({ cells: pettyCells, fillColor: '#F8FAFC' });

    // Purchase Order AED row
    const poCells: PdfTableRow['cells'] = {
      site: { text: 'أمر شراء (AED)', bold: true },
    };
    let slicePoSum = 0;
    for (const cat of catSlice) {
      const v = report.maintenanceCosts[cat.id]?.purchaseOrderAed ?? 0;
      slicePoSum += v;
      poCells[`c_${cat.id}`] = { text: formatDecimalFixed(v) };
    }
    poCells.total = {
      text: formatDecimalFixed(
        isLastSlice && catChunks.length === 1
          ? metrics.maintenance.purchaseOrderTotalAed
          : slicePoSum
      ),
      bold: true,
      color: PDF_COLORS.blue,
    };
    dataRows.push({ cells: poCells, fillColor: '#F1F5F9' });

    drawRtlTable(ctx, cols, dataRows, {
      fontSize: catSlice.length > 9 ? 7.0 : 7.8,
      headerFontSize: catSlice.length > 9 ? 6.8 : 7.5,
      cellPaddingX: 2.5,
      cellPaddingY: 2.5,
    });
  });

  // Grand Cost Callout Strip
  ensurePdfSpace(ctx, 22);
  const costBarY = ctx.curY - 4;
  doc.roundedRect(marginX, costBarY, contentWidth, 20, 4).fill(PDF_COLORS.navy);
  drawBidiLine(
    doc,
    `إجمالي تكاليف الصيانة المعتمدة: ${formatAed(
      metrics.maintenance.grandTotalCostAed
    )}   |   النثرية: ${formatAed(
      metrics.maintenance.pettyCashTotalAed
    )}   |   أمر الشراء: ${formatAed(metrics.maintenance.purchaseOrderTotalAed)}`,
    marginX + 10,
    costBarY + 5,
    {
      fontSize: 8.2,
      bold: true,
      color: PDF_COLORS.goldLight,
      align: 'center',
      dir: 'rtl',
      width: contentWidth - 20,
    }
  );
  ctx.curY = costBarY + 23;

  // Executive Horizontal Facility Comparison Chart (مقارنة الأعطال بين المقرات — مرتبة تنازلياً)
  const siteChartRowH = 14.5;
  const siteChartH = 26 + sortedPdfSites.length * siteChartRowH + 6;
  ensurePdfSpace(ctx, siteChartH + 6);
  const siteChartY = ctx.curY;
  doc.roundedRect(marginX, siteChartY, contentWidth, siteChartH, 5).fill('#F7FAFE');
  doc
    .roundedRect(marginX, siteChartY, contentWidth, siteChartH, 5)
    .lineWidth(0.6)
    .strokeColor(PDF_COLORS.border)
    .stroke();

  drawBidiLine(
    doc,
    'مقارنة الأعطال بين المقرات — التوزيع التنازلي (Executive Horizontal Facility Comparison)',
    marginX + 230,
    siteChartY + 6,
    {
      fontSize: 8,
      bold: true,
      color: PDF_COLORS.navy,
      align: 'right',
      dir: 'rtl',
      width: contentWidth - 240,
    }
  );
  doc.roundedRect(marginX + 8, siteChartY + 4, 215, 17, 4).fill(PDF_COLORS.navy);
  drawBidiLine(
    doc,
    topPdfSite
      ? `إجمالي الأعطال: ${formatNumber(metrics.maintenance.grandTotalFaults)} | الأعلى: ${
          topPdfSite.nameAr
        } (${formatNumber(topPdfSite.faults)})`
      : `إجمالي الأعطال: ${formatNumber(metrics.maintenance.grandTotalFaults)} عطلاً`,
    marginX + 12,
    siteChartY + 7,
    {
      fontSize: 7,
      bold: true,
      color: PDF_COLORS.goldLight,
      align: 'center',
      dir: 'rtl',
      width: 207,
    }
  );

  const maxSiteFaults = Math.max(...sortedPdfSites.map((s) => s.faults), 1);
  const siteLabelW = contentWidth * 0.25;
  const siteValueW = contentWidth * 0.22;
  const siteTrackW = contentWidth - siteLabelW - siteValueW - 28;
  const siteTrackRightX = marginX + contentWidth - siteLabelW - 12;
  const siteTrackLeftX = siteTrackRightX - siteTrackW;

  sortedPdfSites.forEach((item, idx) => {
    const ry = siteChartY + 24 + idx * siteChartRowH;
    const isTop = idx === 0 && item.faults > 0;
    const shareVal =
      metrics.maintenance.grandTotalFaults > 0
        ? (item.faults / metrics.maintenance.grandTotalFaults) * 100
        : 0;

    drawBidiLine(
      doc,
      `${formatNumber(idx + 1)}. ${item.nameAr}`,
      marginX + contentWidth - siteLabelW - 8,
      ry + 1,
      {
        fontSize: 7.4,
        bold: true,
        color: PDF_COLORS.navy,
        align: 'right',
        dir: 'rtl',
        width: siteLabelW,
      }
    );

    doc.roundedRect(siteTrackLeftX, ry + 2, siteTrackW, 9, 2.5).fill('#EAF2FA');
    if (item.faults > 0) {
      const fillW = Math.max(6, (item.faults / maxSiteFaults) * siteTrackW);
      const fillX = siteTrackRightX - fillW;
      doc
        .roundedRect(fillX, ry + 2, fillW, 9, 2.5)
        .fill(isTop ? PDF_COLORS.navy : idx === 1 ? PDF_COLORS.blue : '#247DC1');
      if (isTop && fillW > 10) {
        doc.roundedRect(fillX, ry + 2, Math.min(8, fillW * 0.15), 9, 2).fill(PDF_COLORS.gold);
      }
    }

    drawBidiLine(
      doc,
      `${formatNumber(item.faults)} عطلاً — ${formatPercentage(shareVal)}`,
      marginX + 10,
      ry + 1,
      {
        fontSize: 7.2,
        bold: true,
        color: isTop ? PDF_COLORS.navy : PDF_COLORS.blue,
        align: 'left',
        dir: 'rtl',
        width: siteValueW,
      }
    );
  });

  ctx.curY = siteChartY + siteChartH + 8;

  // =========================================================================
  // PAGE 4:
  //   7. خدمات الصيانة (Sources Table + Vector Donut Chart)
  //   + 8. الدعم اللوجستي (Horizontal Table + Executive Horizontal Bar Chart)
  //   + 9. خدمات الأمن والاستقبال (Horizontal Matrix Table)
  // =========================================================================
  newPdfPage(ctx);

  drawSectionHeader(
    ctx,
    '7. خدمات الصيانة (مصادر الطلبات) و 8. الدعم اللوجستي',
    'Maintenance Sources & Logistics Channels',
    110
  );

  // Section 7 Table + Vector Donut Chart side by side
  const sec7StartY = ctx.curY;
  const sec7TableW = Math.round(contentWidth * 0.6);
  const sec7DonutW = contentWidth - sec7TableW - 10;
  const maintFromFM = report.maintenanceServices.fromFacilitiesDept || 0;
  const maintFromOther = report.maintenanceServices.fromOtherDepts || 0;
  const maintTotal = metrics.maintenanceServicesTotal || 0;
  const maintFmPct = maintTotal > 0 ? (maintFromFM / maintTotal) * 100 : 0;
  const maintOtherPct = maintTotal > 0 ? (maintFromOther / maintTotal) * 100 : 0;

  drawRtlTable(
    ctx,
    [
      { key: 'label', label: 'مصدر طلبات الصيانة', widthPct: 62, align: 'right', dir: 'rtl', bold: true },
      { key: 'val', label: 'العدد', widthPct: 19, align: 'center', dir: 'ltr', bold: true },
      { key: 'pct', label: 'النسبة %', widthPct: 19, align: 'center', dir: 'ltr', bold: true },
    ],
    [
      {
        cells: {
          label: { text: 'عدد طلبات الصيانة الواردة من قسم المرافق' },
          val: { text: formatNumber(maintFromFM) },
          pct: { text: formatPercentage(maintFmPct), color: PDF_COLORS.blue },
        },
      },
      {
        cells: {
          label: { text: 'عدد طلبات الصيانة الواردة من الإدارات الأخرى' },
          val: { text: formatNumber(maintFromOther) },
          pct: { text: formatPercentage(maintOtherPct), color: PDF_COLORS.amber },
        },
      },
    ],
    {
      fontSize: 8,
      startX: marginX + sec7DonutW + 10,
      tableWidth: sec7TableW,
      summaryRow: {
        isSummary: true,
        cells: {
          label: { text: 'الإجمالي | Total', bold: true },
          val: { text: formatNumber(maintTotal), bold: true },
          pct: { text: maintTotal > 0 ? formatPercentage(100) : '0.0%', bold: true },
        },
      },
    }
  );
  const sec7AfterTableY = ctx.curY;
  const sec7BoxH = Math.max(78, sec7AfterTableY - sec7StartY - 10);

  // Donut box on Left of Section 7
  doc.roundedRect(marginX, sec7StartY, sec7DonutW, sec7BoxH, 5).fill(PDF_COLORS.slateBg);
  doc
    .roundedRect(marginX, sec7StartY, sec7DonutW, sec7BoxH, 5)
    .lineWidth(0.6)
    .strokeColor(PDF_COLORS.border)
    .stroke();
  drawVectorDonutChart(
    doc,
    marginX + sec7DonutW - 44,
    sec7StartY + sec7BoxH / 2,
    31,
    18,
    [
      { value: maintFromFM, color: '#0C4176' },
      { value: maintFromOther, color: '#C99E4A' },
    ],
    'الإجمالي',
    formatNumber(maintTotal)
  );
  drawBidiLine(doc, 'توزيع مصادر طلبات الصيانة', marginX + 8, sec7StartY + 8, {
    fontSize: 7.8,
    bold: true,
    color: PDF_COLORS.navy,
    align: 'right',
    dir: 'rtl',
    width: sec7DonutW - 96,
  });
  drawBidiLine(
    doc,
    `• من قسم المرافق: ${formatNumber(maintFromFM)} (${formatPercentage(maintFmPct)})`,
    marginX + 8,
    sec7StartY + 26,
    {
      fontSize: 7.2,
      bold: true,
      color: '#0C4176',
      align: 'right',
      dir: 'rtl',
      width: sec7DonutW - 96,
    }
  );
  drawBidiLine(
    doc,
    `• من الإدارات الأخرى: ${formatNumber(maintFromOther)} (${formatPercentage(maintOtherPct)})`,
    marginX + 8,
    sec7StartY + 44,
    {
      fontSize: 7.2,
      bold: true,
      color: PDF_COLORS.amber,
      align: 'right',
      dir: 'rtl',
      width: sec7DonutW - 96,
    }
  );

  ctx.curY = sec7AfterTableY;

  // Section 8: Logistics Horizontal Table + Executive Horizontal Bar Chart
  const logChanCols: PdfTableColumn[] = [
    { key: 'metric', label: 'البيان | القناة اللوجستية', widthPct: 22, align: 'right', dir: 'rtl', bold: true },
    ...metrics.logisticsWithPct.map(
      (l): PdfTableColumn => ({
        key: `ch_${l.channelKey}`,
        label: l.nameAr,
        widthPct: 64 / Math.max(1, metrics.logisticsWithPct.length),
        align: 'center',
        dir: 'ltr',
        bold: true,
      })
    ),
    { key: 'total', label: 'الإجمالي', widthPct: 14, align: 'center', dir: 'ltr', bold: true },
  ];

  const logReqCells: PdfTableRow['cells'] = {
    metric: { text: 'الطلبات المسجلة', bold: true },
    total: { text: formatNumber(metrics.logisticsTotal), bold: true, color: PDF_COLORS.navy },
  };
  const logPctCells: PdfTableRow['cells'] = {
    metric: { text: 'النسبة المئوية %', bold: true },
    total: {
      text: metrics.logisticsTotal > 0 ? formatPercentage(100) : '0.0%',
      bold: true,
      color: PDF_COLORS.emerald,
    },
  };
  metrics.logisticsWithPct.forEach((l) => {
    logReqCells[`ch_${l.channelKey}`] = { text: formatNumber(l.requestCount), bold: true };
    logPctCells[`ch_${l.channelKey}`] = {
      text: formatPct(l.sharePct, '0.0%'),
      color: PDF_COLORS.blue,
    };
  });

  drawRtlTable(ctx, logChanCols, [{ cells: logReqCells }, { cells: logPctCells, fillColor: '#F4F8FC' }], {
    fontSize: 8,
    cellPaddingY: 3.5,
  });

  // Executive Horizontal Bar Chart for Logistics Channels (Sorted Descending by Request Volume)
  const sortedLogistics = metrics.logisticsWithPct
    .map((item, origIdx) => ({ ...item, origIdx }))
    .sort((a, b) => {
      if (b.requestCount !== a.requestCount) return b.requestCount - a.requestCount;
      return a.origIdx - b.origIdx;
    });
  const logChartRowH = 15.5;
  const logChartH = 26 + sortedLogistics.length * logChartRowH + 6;
  ensurePdfSpace(ctx, logChartH + 8);
  const logChartY = ctx.curY;
  doc.roundedRect(marginX, logChartY, contentWidth, logChartH, 5).fill('#F7FAFE');
  doc
    .roundedRect(marginX, logChartY, contentWidth, logChartH, 5)
    .lineWidth(0.6)
    .strokeColor(PDF_COLORS.border)
    .stroke();

  drawBidiLine(
    doc,
    'التوزيع التنازلي لقنوات الدعم اللوجستي (Executive Horizontal Bar Chart)',
    marginX + 150,
    logChartY + 6,
    {
      fontSize: 8,
      bold: true,
      color: PDF_COLORS.navy,
      align: 'right',
      dir: 'rtl',
      width: contentWidth - 160,
    }
  );
  doc.roundedRect(marginX + 8, logChartY + 4, 136, 17, 4).fill(PDF_COLORS.navy);
  drawBidiLine(
    doc,
    `إجمالي الطلبات: ${formatNumber(metrics.logisticsTotal)} طلباً`,
    marginX + 12,
    logChartY + 7.5,
    {
      fontSize: 7.2,
      bold: true,
      color: PDF_COLORS.goldLight,
      align: 'center',
      dir: 'rtl',
      width: 128,
    }
  );

  const maxLogReq = Math.max(...sortedLogistics.map((l) => l.requestCount), 1);
  const logLabelW = contentWidth * 0.24;
  const logValueW = contentWidth * 0.22;
  const logTrackW = contentWidth - logLabelW - logValueW - 28;
  const logTrackRightX = marginX + contentWidth - logLabelW - 12;
  const logTrackLeftX = logTrackRightX - logTrackW;

  sortedLogistics.forEach((item, idx) => {
    const ry = logChartY + 24 + idx * logChartRowH;
    const isTop = idx === 0 && item.requestCount > 0;
    const shareVal = item.sharePct ?? 0;

    drawBidiLine(
      doc,
      `${formatNumber(idx + 1)}. ${item.nameAr}`,
      marginX + contentWidth - logLabelW - 8,
      ry + 1,
      {
        fontSize: 7.5,
        bold: true,
        color: PDF_COLORS.navy,
        align: 'right',
        dir: 'rtl',
        width: logLabelW,
      }
    );

    doc.roundedRect(logTrackLeftX, ry + 2, logTrackW, 9.5, 2.5).fill('#EAF2FA');
    if (item.requestCount > 0) {
      const fillW = Math.max(6, (item.requestCount / maxLogReq) * logTrackW);
      const fillX = logTrackRightX - fillW;
      doc
        .roundedRect(fillX, ry + 2, fillW, 9.5, 2.5)
        .fill(isTop ? PDF_COLORS.navy : idx === 1 ? PDF_COLORS.blue : '#247DC1');
      if (isTop && fillW > 10) {
        doc.roundedRect(fillX, ry + 2, Math.min(8, fillW * 0.15), 9.5, 2).fill(PDF_COLORS.gold);
      }
    }

    drawBidiLine(
      doc,
      `${formatNumber(item.requestCount)} طلباً — ${formatPercentage(shareVal)}`,
      marginX + 10,
      ry + 1,
      {
        fontSize: 7.4,
        bold: true,
        color: isTop ? PDF_COLORS.navy : PDF_COLORS.blue,
        align: 'left',
        dir: 'rtl',
        width: logValueW,
      }
    );
  });

  ctx.curY = logChartY + logChartH + 10;

  // Section 9: خدمات الأمن والاستقبال (Horizontal Matrix Layout matching Live Report)
  drawSectionHeader(ctx, '9. خدمات الأمن والاستقبال', 'Security & Reception Services Matrix', 80);

  const secItems = metrics.securityWithPct;
  const maxSecPerTable = orientation === 'landscape' ? 8 : 5;
  const secChunks: typeof secItems[] = [];
  for (let i = 0; i < secItems.length; i += maxSecPerTable) {
    secChunks.push(secItems.slice(i, i + maxSecPerTable));
  }
  if (secChunks.length === 0) secChunks.push([]);

  secChunks.forEach((sChunk, scIdx) => {
    const isLastChunk = scIdx === secChunks.length - 1;
    const actPct = sChunk.length > 0 ? (isLastChunk ? 70 : 84) / sChunk.length : 70;
    const cols: PdfTableColumn[] = [
      { key: 'rowType', label: 'البيان', widthPct: 16, align: 'right', dir: 'rtl', bold: true },
      ...sChunk.map(
        (sr): PdfTableColumn => ({
          key: `sr_${sr.activityKey}`,
          label: sr.nameAr,
          widthPct: actPct,
          align: 'center',
          dir: 'auto',
          bold: true,
        })
      ),
      ...(isLastChunk
        ? [
            {
              key: 'total',
              label: `الإجمالي (${formatNumber(secItems.length)})`,
              widthPct: 14,
              align: 'center' as const,
              dir: 'ltr' as const,
              bold: true,
            },
          ]
        : []),
    ];

    const recRow: PdfTableRow['cells'] = {
      rowType: { text: 'الطلبات المستلمة', bold: true },
      total: { text: formatNumber(metrics.securityTotals.totalReceived), bold: true },
    };
    const execRow: PdfTableRow['cells'] = {
      rowType: { text: 'الطلبات المنفذة', bold: true, color: PDF_COLORS.emerald },
      total: {
        text: formatNumber(metrics.securityTotals.totalExecuted),
        bold: true,
        color: PDF_COLORS.emerald,
      },
    };
    const pctRow: PdfTableRow['cells'] = {
      rowType: { text: 'نسبة الإنجاز %', bold: true, color: PDF_COLORS.blue },
      total: {
        text: formatPct(metrics.securityTotals.overallCompletionPct, '—'),
        bold: true,
        color: PDF_COLORS.navy,
      },
    };

    sChunk.forEach((sr) => {
      recRow[`sr_${sr.activityKey}`] = { text: formatNumber(sr.receivedCount), bold: true };
      execRow[`sr_${sr.activityKey}`] = {
        text: formatNumber(sr.executedCount),
        bold: true,
        color: PDF_COLORS.emerald,
      };
      pctRow[`sr_${sr.activityKey}`] = {
        text: formatPct(sr.completionPct, '—'),
        bold: true,
        color: PDF_COLORS.blue,
      };
    });

    drawRtlTable(
      ctx,
      cols,
      [
        { cells: recRow },
        { cells: execRow, fillColor: '#F4F8FC' },
        { cells: pctRow, fillColor: '#EAF4FC' },
      ],
      {
        fontSize: 7.8,
        headerFontSize: 7.4,
        cellPaddingY: 3.5,
      }
    );
  });

  // =========================================================================
  // PAGE 5:
  //   10. المهام التشغيلية والمتابعة (Full Wrapped Text + Visual Indicator Bar)
  //   + 11. التحديات والتوصيات (Full Unwrapped Multi-Line Text)
  //   + 12. الإعداد والمراجعة والاعتماد الرسمي (Dual Saved Electronic Signatures)
  // =========================================================================
  newPdfPage(ctx);

  drawSectionHeader(ctx, '10. المهام التشغيلية والمتابعة', 'Operational Tasks & Milestones', 54);
  drawRtlTable(
    ctx,
    [
      { key: 'idx', label: '#', widthPct: 5, align: 'center', dir: 'ltr' },
      { key: 'topic', label: 'الموضوع | Subject', widthPct: 24, align: 'right', dir: 'rtl', bold: true },
      { key: 'task', label: 'المهمة | Task', widthPct: 38, align: 'right', dir: 'rtl' },
      { key: 'status', label: 'الحالة', widthPct: 11, align: 'center', dir: 'rtl', bold: true },
      { key: 'pct', label: 'نسبة الإنجاز', widthPct: 10, align: 'center', dir: 'ltr', bold: true },
      { key: 'bar', label: 'المؤشر', widthPct: 12, align: 'center', dir: 'ltr', color: PDF_COLORS.emerald },
    ],
    report.tasks.length > 0
      ? report.tasks.map((t, idx) => ({
          cells: {
            idx: { text: formatNumber(idx + 1) },
            topic: { text: t.topic || '—' },
            task: { text: t.taskName || '—' },
            status: {
              text: TASK_STATUS_LABELS_AR[t.status],
              color:
                t.status === 'completed'
                  ? PDF_COLORS.emerald
                  : t.status === 'delayed'
                    ? PDF_COLORS.crimson
                    : PDF_COLORS.amber,
            },
            pct: { text: formatPercentage(t.completionPct) },
            bar: {
              text: '',
              progressPct: clampPct(t.completionPct),
              progressColor: t.completionPct >= 90 ? PDF_COLORS.emerald : PDF_COLORS.blue,
            },
          },
        }))
      : [
          {
            cells: {
              idx: { text: '—' },
              topic: { text: 'لا توجد مهام مسجلة' },
              task: { text: '—' },
              status: { text: '—' },
              pct: { text: '—' },
              bar: { text: '—' },
            },
          },
        ],
    { fontSize: 7.5, headerFontSize: 7.6, cellPaddingY: 2.2, minRowHeight: 15 }
  );

  // 11. التحديات والتوصيات · Challenges & Recommendations (Full Text, Dynamic Height)
  drawSectionHeader(ctx, '11. التحديات والتوصيات', 'Challenges & Recommendations', 54);
  drawRtlTable(
    ctx,
    [
      { key: 'idx', label: '#', widthPct: 5, align: 'center', dir: 'ltr' },
      { key: 'challenge', label: 'التحديات والعوائق | Challenges', widthPct: 28, align: 'right', dir: 'rtl', bold: true },
      { key: 'update', label: 'التحديث والإجراءات المتخذة | Update', widthPct: 34, align: 'right', dir: 'rtl' },
      { key: 'rec', label: 'التوصية التنفيذية | Recommendation', widthPct: 33, align: 'right', dir: 'rtl', bold: true },
    ],
    report.challenges.length > 0
      ? report.challenges.map((ch, idx) => ({
          cells: {
            idx: { text: formatNumber(idx + 1) },
            challenge: { text: ch.challengeText || '—', color: PDF_COLORS.amber },
            update: { text: ch.updateText || '—' },
            rec: { text: ch.recommendationText || '—', color: PDF_COLORS.navy },
          },
        }))
      : [
          {
            cells: {
              idx: { text: '—' },
              challenge: { text: 'لا توجد تحديات مرصودة في هذه الفترة' },
              update: { text: '—' },
              rec: { text: '—' },
            },
          },
        ],
    { fontSize: 7.5, headerFontSize: 7.6, cellPaddingY: 2.2, minRowHeight: 15 }
  );

  // 12. الإعداد والمراجعة والاعتماد الرسمي (Dual Saved Electronic Signatures)
  ctx.curY -= 5;
  drawSectionHeader(
    ctx,
    '12. الإعداد والمراجعة والاعتماد الرسمي',
    'Preparation, Review & Official Approval',
    105
  );

  const sigBoxGap = 12;
  const sigBoxW = (contentWidth - sigBoxGap) / 2;
  const sigBoxH = 80;
  const sigY = ctx.curY - 4;

  const prepBoxX = marginX + sigBoxW + sigBoxGap; // Right side in RTL
  const appBoxX = marginX; // Left side in RTL

  const drawSignatureCard = (opts: {
    x: number;
    badge: string;
    accent: string;
    name: string;
    title: string;
    dateLabel: string;
    dateValue: string;
    hashLabel: string;
    signedAt: string | null | undefined;
    sigImage: string | null | undefined;
  }) => {
    doc.roundedRect(opts.x, sigY, sigBoxW, sigBoxH, 6).fill(PDF_COLORS.slateBg);
    doc
      .roundedRect(opts.x, sigY, sigBoxW, sigBoxH, 6)
      .lineWidth(0.9)
      .strokeColor(PDF_COLORS.border)
      .stroke();
    doc.rect(opts.x, sigY, sigBoxW, 14).fill(PDF_COLORS.navy);
    doc.rect(opts.x, sigY + 14, sigBoxW, 1.5).fill(PDF_COLORS.gold);

    drawBidiLine(doc, opts.badge, opts.x + 8, sigY + 1.5, {
      fontSize: 7.4,
      bold: true,
      color: PDF_COLORS.goldLight,
      align: 'right',
      dir: 'rtl',
      width: sigBoxW - 16,
    });

    // Right column inside card: Name, Title, Date, Hash
    const infoW = sigBoxW * 0.56;
    const infoX = opts.x + sigBoxW - infoW - 8;
    drawBidiLine(doc, opts.name || '—', infoX, sigY + 18, {
      fontSize: 9,
      bold: true,
      color: PDF_COLORS.navy,
      align: 'right',
      dir: 'rtl',
      width: infoW,
    });
    drawBidiLine(doc, opts.title || '—', infoX, sigY + 31, {
      fontSize: 7.2,
      color: PDF_COLORS.slateText,
      align: 'right',
      dir: 'rtl',
      width: infoW,
    });
    drawBidiLine(doc, `${opts.dateLabel}: ${opts.dateValue}`, infoX, sigY + 43, {
      fontSize: 7,
      color: PDF_COLORS.navy,
      align: 'right',
      dir: 'rtl',
      width: infoW,
    });
    drawBidiLine(
      doc,
      `التوقيع: ${opts.hashLabel}${opts.signedAt ? ` (${formatDateTimeWestern(opts.signedAt)})` : ''}`,
      infoX,
      sigY + 55,
      {
        fontSize: 6.6,
        bold: true,
        color: opts.accent,
        align: 'right',
        dir: 'rtl',
        width: infoW,
      }
    );

    // Left column inside card: Signature image box
    const imgBoxX = opts.x + 8;
    const imgBoxY = sigY + 19;
    const imgBoxW = sigBoxW * 0.38;
    const imgBoxH = 55;
    doc.roundedRect(imgBoxX, imgBoxY, imgBoxW, imgBoxH, 4).fill(PDF_COLORS.white);
    doc
      .roundedRect(imgBoxX, imgBoxY, imgBoxW, imgBoxH, 4)
      .lineWidth(0.6)
      .strokeColor(PDF_COLORS.border)
      .stroke();

    const sigBuf = extractImageBuffer(opts.sigImage);
    if (sigBuf) {
      doc.image(sigBuf, imgBoxX + 4, imgBoxY + 3, {
        fit: [imgBoxW - 8, imgBoxH - 16],
        align: 'center',
        valign: 'center',
      });
    } else {
      drawBidiLine(doc, 'لا يوجد توقيع مرفوع بعد', imgBoxX + 4, imgBoxY + 18, {
        fontSize: 6.8,
        color: '#94A3B8',
        align: 'center',
        dir: 'rtl',
        width: imgBoxW - 8,
      });
    }
    drawBidiLine(doc, 'التوقيع الإلكتروني المعتمد', imgBoxX + 4, imgBoxY + imgBoxH - 12, {
      fontSize: 6,
      bold: true,
      color: PDF_COLORS.slateText,
      align: 'center',
      dir: 'rtl',
      width: imgBoxW - 8,
    });
  };

  drawSignatureCard({
    x: prepBoxX,
    badge: 'أولاً: إعداد التقرير · Report Preparation',
    accent: PDF_COLORS.emerald,
    name: report.preparerName || '—',
    title: report.preparerTitle || '—',
    dateLabel: 'تاريخ الإعداد',
    dateValue: formatDateWestern(report.preparedAt, 'قيد الإعداد'),
    hashLabel:
      report.preparerSignatureHash ||
      (report.preparerSignatureImage ? 'موثق بالتوقيع الإلكتروني' : 'غير موثق بعد'),
    signedAt: report.preparerSignedAt,
    sigImage: report.preparerSignatureImage,
  });

  drawSignatureCard({
    x: appBoxX,
    badge: 'ثانياً: اعتماد التقرير · Executive Approval',
    accent: PDF_COLORS.blue,
    name: report.approverName || '—',
    title: report.approverTitle || '—',
    dateLabel: 'تاريخ الاعتماد',
    dateValue: formatDateWestern(report.approvedAt, 'بانتظار الاعتماد'),
    hashLabel:
      report.approverSignatureHash ||
      (report.approverSignatureImage ? 'موثق بالتوقيع الإلكتروني' : 'بانتظار التوقيع الرسمي'),
    signedAt: report.approverSignedAt,
    sigImage: report.approverSignatureImage,
  });

  ctx.curY = sigY + sigBoxH + 4;

  // Attestation Banner: STRICTLY only when approved or archived
  ensurePdfSpace(ctx, 20);
  const attY = ctx.curY;
  if (isApprovedOrArchived) {
    doc.roundedRect(marginX, attY, contentWidth, 19, 4).fill(PDF_COLORS.emeraldBg);
    doc
      .roundedRect(marginX, attY, contentWidth, 19, 4)
      .lineWidth(0.9)
      .strokeColor(PDF_COLORS.emerald)
      .stroke();
    drawBidiLine(
      doc,
      '«هذا التقرير معتمد ومراجع وفقاً للسياسات والإجراءات المعمول بها في قسم إدارة المرافق»',
      marginX + 8,
      attY + 4.5,
      {
        fontSize: 8.2,
        bold: true,
        color: PDF_COLORS.emerald,
        align: 'center',
        dir: 'rtl',
        width: contentWidth - 16,
      }
    );
  } else {
    doc.roundedRect(marginX, attY, contentWidth, 19, 4).fill(PDF_COLORS.amberBg);
    doc
      .roundedRect(marginX, attY, contentWidth, 19, 4)
      .lineWidth(0.9)
      .strokeColor('#F59E0B')
      .stroke();
    drawBidiLine(
      doc,
      `ملاحظة: هذه النسخة (${STATUS_LABELS_AR[report.status]}) ما زالت قيد الإعداد أو المراجعة ولا تحمل صفة الاعتماد النهائي الرسمي.`,
      marginX + 8,
      attY + 4.5,
      {
        fontSize: 8,
        bold: true,
        color: PDF_COLORS.amber,
        align: 'center',
        dir: 'rtl',
        width: contentWidth - 16,
      }
    );
  }

  // Stamp Official Repeating Corporate Header & Footer on ALL pages (with real Page X of Y)
  stampExecutiveHeaderAndFooterOnAllPages(doc, {
    titleAr: 'التقرير الشهري لقسم إدارة المرافق',
    titleEn: 'Facilities Management Monthly Executive Report',
    subtitleAr: `إدارة الخدمات العامة · ${report.company} · شهر ${monthAr} ${report.year} (${monthEn} ${report.year})`,
    metaRightAr: `رقم التقرير: ${report.reportNumber} | الحالة: ${STATUS_LABELS_AR[report.status]} (${STATUS_LABELS_EN[report.status]}) | الإصدار: v${verNumber}`,
    metaLeftAr: isApprovedOrArchived
      ? `التصنيف: ${report.classification} | نسخة رسمية معتمدة`
      : `التصنيف: ${report.classification} | نسخة مسودة — غير معتمدة نهائياً`,
    isDraftWatermark: !isApprovedOrArchived,
    draftBannerAr: 'نسخة مسودة — غير معتمدة نهائياً',
  });

  doc.end();
  return resultPromise;
}
