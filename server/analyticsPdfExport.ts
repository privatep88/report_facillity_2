import PDFDocument from 'pdfkit';
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
import {
  formatAed,
  formatDateTimeWestern,
  formatNumber,
  formatPct,
} from '../src/utils/calculations.ts';
import { drawBidiLine } from './pdfBiDi.ts';
import {
  PDF_COLORS,
  type PdfTableRow,
  createPdfLayoutContext,
  drawRtlTable,
  drawSectionHeader,
  ensurePdfSpace,
  stampExecutiveHeaderAndFooterOnAllPages,
} from './pdfLayoutPrimitives.ts';

export async function generateExecutiveAnalyticsPdf(params: {
  reports: MonthlyReportFull[];
  sites: MaintenanceSite[];
  categories: MaintenanceCategory[];
  thresholds?: PerformanceThresholds;
  filters: AnalyticsFilters;
  orientation?: 'landscape' | 'portrait';
}): Promise<Buffer> {
  const {
    reports,
    sites,
    categories,
    thresholds = DEFAULT_THRESHOLDS,
    filters,
    orientation = 'landscape',
  } = params;

  const bi = computeAnalyticsEngine({
    reports,
    sites,
    categories,
    thresholds,
    filters,
  });

  const doc = new PDFDocument({
    autoFirstPage: false,
    bufferPages: true,
    info: {
      Title: `التقرير التحليلي التنفيذي لإدارة المرافق - ${bi.meta.scopeLabelAr}`,
      Author: 'SAHER Facilities Management Executive Intelligence Center',
      Subject: `Executive Analytics Report (${bi.meta.periodLabelAr})`,
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
  const generatedStamp = formatDateTimeWestern(new Date().toISOString());

  // =========================================================================
  // 1. الملخص التنفيذي والمؤشرات الحاكمة
  // =========================================================================
  drawSectionHeader(ctx, '1. الملخص التنفيذي والمؤشرات الحاكمة', 'Executive Performance Snapshot', 70);

  const cards = [
    {
      label: 'الطلبات المستلمة / المنفذة',
      value: `${formatNumber(bi.snapshot.totalReceived)} / ${formatNumber(bi.snapshot.totalExecuted)}`,
      sub: `فجوة: ${formatNumber(bi.snapshot.totalRemainingGap)} طلب`,
      accent: PDF_COLORS.navy,
      bg: PDF_COLORS.slateBg,
    },
    {
      label: 'نسبة الإنجاز الكلية',
      value: formatPct(bi.snapshot.overallCompletionPct, 'غير منطبق'),
      sub: bi.snapshot.overallCompletionLevel.labelAr,
      accent: PDF_COLORS.emerald,
      bg: PDF_COLORS.emeraldBg,
    },
    {
      label: 'إجمالي أعطال الصيانة',
      value: `${formatNumber(bi.snapshot.totalFaults)} عطل`,
      sub: bi.snapshot.highestFaultSite ? `الأعلى: ${bi.snapshot.highestFaultSite.nameAr}` : 'لا توجد أعطال',
      accent: PDF_COLORS.amber,
      bg: PDF_COLORS.amberBg,
    },
    {
      label: 'إجمالي التكاليف الفعلية (AED)',
      value: formatAed(bi.snapshot.totalCostAed),
      sub: `نثرية ${formatNumber(bi.snapshot.pettyCashTotalAed)} + أمر شراء ${formatNumber(bi.snapshot.purchaseOrderTotalAed)}`,
      accent: PDF_COLORS.blue,
      bg: PDF_COLORS.blueLight,
    },
  ];

  const cardGap = 8;
  const cardW = (contentWidth - cardGap * 3) / 4;
  const cardH = 54;
  const cardY = ctx.curY;

  cards.forEach((card, idx) => {
    const cx = marginX + contentWidth - cardW * (idx + 1) - cardGap * idx;
    doc.roundedRect(cx, cardY, cardW, cardH, 6).fill(card.bg);
    doc
      .roundedRect(cx, cardY, cardW, cardH, 6)
      .lineWidth(0.8)
      .strokeColor(PDF_COLORS.border)
      .stroke();
    doc.rect(cx, cardY, cardW, 3.5).fill(card.accent);

    drawBidiLine(doc, card.label, cx + 6, cardY + 9, {
      fontSize: 8,
      bold: true,
      color: PDF_COLORS.slateText,
      align: 'right',
      dir: 'rtl',
      width: cardW - 12,
    });
    drawBidiLine(doc, card.value, cx + 6, cardY + 23, {
      fontSize: 11,
      bold: true,
      color: card.accent,
      align: 'center',
      dir: 'ltr',
      width: cardW - 12,
    });
    drawBidiLine(doc, card.sub, cx + 6, cardY + 41, {
      fontSize: 7.2,
      color: PDF_COLORS.navy,
      align: 'center',
      dir: 'auto',
      width: cardW - 12,
    });
  });

  ctx.curY = cardY + cardH + 12;

  // =========================================================================
  // 2. أداء الخدمات وكفاءة الإنجاز
  // =========================================================================
  drawSectionHeader(ctx, '2. أداء الخدمات وكفاءة الإنجاز', 'Services & Efficiency Summary', 80);
  drawRtlTable(
    ctx,
    [
      { key: 'name', label: 'الخدمة', widthPct: 32, align: 'right', dir: 'rtl', bold: true },
      { key: 'rec', label: 'المستلمة', widthPct: 11, align: 'center', dir: 'ltr' },
      { key: 'exec', label: 'المنفذة', widthPct: 11, align: 'center', dir: 'ltr', color: PDF_COLORS.emerald },
      { key: 'gap', label: 'الفجوة', widthPct: 10, align: 'center', dir: 'ltr' },
      { key: 'share', label: 'الحصة %', widthPct: 11, align: 'center', dir: 'ltr' },
      { key: 'pct', label: 'الإنجاز %', widthPct: 11, align: 'center', dir: 'ltr', bold: true },
      { key: 'level', label: 'المستوى', widthPct: 14, align: 'center', dir: 'rtl', bold: true },
    ],
    bi.servicesAnalysis.rows.map((s) => ({
      cells: {
        name: { text: s.nameAr },
        rec: { text: formatNumber(s.receivedCount) },
        exec: { text: formatNumber(s.executedCount), color: PDF_COLORS.emerald },
        gap: { text: formatNumber(s.remainingGap) },
        share: { text: formatPct(s.shareOfTotalPct, '0.0%') },
        pct: { text: formatPct(s.completionPct, 'غير منطبق') },
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
      fontSize: 8.2,
      summaryRow: {
        isSummary: true,
        cells: {
          name: { text: 'الإجمالي العام | Total', bold: true },
          rec: { text: formatNumber(bi.snapshot.totalReceived), bold: true },
          exec: { text: formatNumber(bi.snapshot.totalExecuted), bold: true, color: PDF_COLORS.emerald },
          gap: { text: formatNumber(bi.snapshot.totalRemainingGap), bold: true },
          share: { text: bi.snapshot.totalReceived > 0 ? '100.0%' : '0.0%', bold: true },
          pct: { text: formatPct(bi.snapshot.overallCompletionPct, 'غير منطبق'), bold: true },
          level: { text: bi.snapshot.overallCompletionLevel.labelAr, bold: true },
        },
      },
    }
  );

  // =========================================================================
  // 3. باريتو الأعطال والتكاليف (AED) + المقرات
  // =========================================================================
  drawSectionHeader(ctx, '3. تحليل باريتو للأعطال والتكاليف المالية (AED)', 'Maintenance Fault Pareto & Costs', 80);
  drawRtlTable(
    ctx,
    [
      { key: 'cat', label: 'فئة الصيانة', widthPct: 28, align: 'right', dir: 'rtl', bold: true },
      { key: 'faults', label: 'الأعطال', widthPct: 11, align: 'center', dir: 'ltr' },
      { key: 'share', label: 'الحصة %', widthPct: 11, align: 'center', dir: 'ltr' },
      { key: 'cum', label: 'التراكمي %', widthPct: 12, align: 'center', dir: 'ltr' },
      { key: 'petty', label: 'النثرية (AED)', widthPct: 13, align: 'center', dir: 'ltr' },
      { key: 'po', label: 'أمر الشراء (AED)', widthPct: 13, align: 'center', dir: 'ltr' },
      { key: 'total', label: 'الإجمالي (AED)', widthPct: 12, align: 'center', dir: 'ltr', bold: true },
    ],
    bi.maintenanceAnalysis.paretoRows.map((p) => ({
      cells: {
        cat: { text: p.nameAr },
        faults: { text: formatNumber(p.faultCount) },
        share: { text: formatPct(p.sharePct, '0.0%') },
        cum: { text: `${p.cumulativePct.toFixed(1)}%` },
        petty: { text: formatNumber(p.pettyCashAed) },
        po: { text: formatNumber(p.purchaseOrderAed) },
        total: { text: formatAed(p.totalCostAed), bold: true },
      },
    })),
    { fontSize: 8 }
  );

  // =========================================================================
  // 4. العقود والسلامة والامتثال
  // =========================================================================
  drawSectionHeader(ctx, '4. العقود والسلامة والامتثال', 'Contracts, Safety & Compliance', 70);
  const govRows: PdfTableRow[] = [
    ...bi.contractsAnalysis.groups.map((g) => ({
      cells: {
        field: { text: g.nameAr, bold: true },
        ok: { text: formatNumber(g.activeCount), color: PDF_COLORS.emerald },
        warn: {
          text: formatNumber(g.inactiveCount),
          color: g.inactiveCount > 0 ? PDF_COLORS.crimson : PDF_COLORS.navy,
        },
        pct: { text: formatPct(g.activePct, 'غير منطبق'), bold: true },
      },
    })),
    {
      cells: {
        field: { text: 'جاهزية طفايات الحريق', bold: true },
        ok: { text: formatNumber(bi.riskComplianceAnalysis.extinguishersActive), color: PDF_COLORS.emerald },
        warn: {
          text: formatNumber(bi.riskComplianceAnalysis.extinguishersInactive),
          color: bi.riskComplianceAnalysis.extinguishersInactive > 0 ? PDF_COLORS.crimson : PDF_COLORS.navy,
        },
        pct: { text: formatPct(bi.riskComplianceAnalysis.extinguishersReadinessPct, 'غير منطبق'), bold: true },
      },
    },
    {
      cells: {
        field: { text: 'إغلاق ملاحظات المخاطر', bold: true },
        ok: { text: formatNumber(bi.riskComplianceAnalysis.hazardsClosed), color: PDF_COLORS.emerald },
        warn: {
          text: formatNumber(bi.riskComplianceAnalysis.hazardsOpen),
          color: bi.riskComplianceAnalysis.hazardsOpen > 0 ? PDF_COLORS.crimson : PDF_COLORS.navy,
        },
        pct: { text: formatPct(bi.riskComplianceAnalysis.hazardsClosurePct, 'غير منطبق'), bold: true },
      },
    },
  ];
  drawRtlTable(
    ctx,
    [
      { key: 'field', label: 'المجال التنظيمي', widthPct: 44, align: 'right', dir: 'rtl', bold: true },
      { key: 'ok', label: 'فعال / مغلق', widthPct: 18, align: 'center', dir: 'ltr', bold: true },
      { key: 'warn', label: 'غير فعال / مفتوح', widthPct: 20, align: 'center', dir: 'ltr', bold: true },
      { key: 'pct', label: 'النسبة %', widthPct: 18, align: 'center', dir: 'ltr', bold: true },
    ],
    govRows,
    { fontSize: 8.2 }
  );

  // =========================================================================
  // 5. الإنذار المبكر والتوصيات التنفيذية
  // =========================================================================
  drawSectionHeader(ctx, '5. مؤشرات الإنذار المبكر والتوصيات التنفيذية', 'Early Warnings & Executive Decisions', 75);

  if (bi.earlyWarnings.length > 0) {
    drawRtlTable(
      ctx,
      [
        { key: 'sev', label: 'الدرجة', widthPct: 14, align: 'center', dir: 'rtl', bold: true },
        { key: 'title', label: 'المؤشر المرصود', widthPct: 30, align: 'right', dir: 'rtl', bold: true },
        { key: 'val', label: 'القيمة الحالية', widthPct: 20, align: 'center', dir: 'auto', bold: true },
        { key: 'cmp', label: 'التفسير والمقارنة', widthPct: 36, align: 'right', dir: 'rtl' },
      ],
      bi.earlyWarnings.map((w) => ({
        cells: {
          sev: {
            text: w.severity === 'critical' ? 'حرج' : w.severity === 'warning' ? 'تحذير' : 'تنبيه',
            color: w.severity === 'critical' ? PDF_COLORS.crimson : PDF_COLORS.amber,
          },
          title: { text: w.title },
          val: { text: w.metricDisplay, color: PDF_COLORS.crimson },
          cmp: { text: w.comparisonText },
        },
      })),
      { fontSize: 8 }
    );
  }

  drawRtlTable(
    ctx,
    [
      { key: 'prio', label: 'الأولوية', widthPct: 13, align: 'center', dir: 'rtl', bold: true },
      { key: 'title', label: 'التوصية والدليل الرقمي', widthPct: 42, align: 'right', dir: 'rtl', bold: true },
      { key: 'act', label: 'الإجراء المقترح والجهة المسؤولة', widthPct: 45, align: 'right', dir: 'rtl' },
    ],
    bi.recommendations.map((rec) => ({
      cells: {
        prio: { text: rec.priorityLabelAr, color: PDF_COLORS.blue },
        title: { text: `${rec.title} — ${rec.evidenceText}` },
        act: { text: `${rec.actionText} (الجهة: ${rec.owner} | المؤشر: ${rec.suggestedKpi})` },
      },
    })),
    { fontSize: 8 }
  );

  // Forecast Callout at bottom
  ensurePdfSpace(ctx, 28);
  const fcY = ctx.curY;
  doc.roundedRect(marginX, fcY, contentWidth, 24, 5).fill(PDF_COLORS.blueLight);
  doc
    .roundedRect(marginX, fcY, contentWidth, 24, 5)
    .lineWidth(0.75)
    .strokeColor(PDF_COLORS.blueBorder)
    .stroke();
  drawBidiLine(
    doc,
    bi.forecast.available
      ? `التوقعات المشروطة (${bi.forecast.nextPeriodLabelAr}): طلبات ≈ ${formatNumber(
          bi.forecast.requestsForecast?.predicted ?? 0
        )} | أعطال ≈ ${formatNumber(bi.forecast.faultsForecast?.predicted ?? 0)} | تكلفة ≈ ${formatAed(
          bi.forecast.costForecast?.predicted ?? 0
        )}`
      : `حالة التوقعات المستقبلية: ${bi.forecast.reasonAr}`,
    marginX + 10,
    fcY + 7,
    {
      fontSize: 8.2,
      bold: true,
      color: PDF_COLORS.navy,
      align: 'center',
      dir: 'rtl',
      width: contentWidth - 20,
    }
  );

  stampExecutiveHeaderAndFooterOnAllPages(doc, {
    titleAr: 'مركز التحليل التنفيذي لإدارة المرافق',
    titleEn: 'Facilities Management Executive Intelligence Report',
    subtitleAr: `شركة ساهر للخدمات الإلكترونية · إدارة الخدمات العامة · النطاق: ${bi.meta.scopeLabelAr}`,
    metaRightAr: `النطاق: ${bi.meta.scopeLabelAr} | الفترة: ${bi.meta.periodLabelAr} | التقارير المشمولة: ${formatNumber(bi.meta.filteredReportsCount)} (${formatNumber(bi.meta.approvedInScopeCount)} معتمد / ${formatNumber(bi.meta.draftInScopeCount)} قيد الإعداد)`,
    metaLeftAr: `تاريخ الإصدار: ${generatedStamp}`,
    isDraftWatermark: filters.statusScope !== 'approved_only' && bi.meta.draftInScopeCount > 0,
    draftBannerAr: 'تحليل يشمل مسودات قيد الإعداد',
  });

  doc.end();
  return resultPromise;
}
