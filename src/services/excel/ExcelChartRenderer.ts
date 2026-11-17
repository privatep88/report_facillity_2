import type {
  LogisticsChannelItem,
  MaintenanceCategory,
  MaintenanceSite,
} from '../../types/report.ts';
import {
  formatNumber,
  formatPct,
  formatPercentage,
  type ReportComputedMetrics,
} from '../../utils/calculations.ts';
import { getServiceVisual } from '../../utils/serviceVisuals.tsx';
import type { LoadedExcelImage } from './ExcelAssetLoader.ts';

const CHART_FONT_FAMILY = '"Cairo", "Segoe UI", Tahoma, Arial, sans-serif';

async function ensureFontsReady(): Promise<void> {
  try {
    if (document.fonts && document.fonts.ready) {
      await Promise.race([
        document.fonts.ready,
        new Promise<void>((r) => window.setTimeout(r, 1500)),
      ]);
    }
  } catch {
    // Ignore font readiness warnings
  }
}

function createHiDpiCanvas(logicalWidth: number, logicalHeight: number, scale = 2) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(logicalWidth * scale);
  canvas.height = Math.round(logicalHeight * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable for chart rendering');
  }
  ctx.scale(scale, scale);
  ctx.textBaseline = 'middle';
  return { canvas, ctx };
}

function drawRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function fitTextEllipsis(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let clipped = text;
  while (clipped.length > 2 && ctx.measureText(`${clipped}…`).width > maxWidth) {
    clipped = clipped.slice(0, -1);
  }
  return `${clipped}…`;
}

/**
 * 1. Section 2: Performance Distribution Donut Chart (توزيع الأداء)
 */
export async function renderPerformanceDonutChartPng(
  metrics: ReportComputedMetrics
): Promise<LoadedExcelImage> {
  await ensureFontsReady();
  const active = metrics.servicesWithMetrics.filter((s) => s.receivedCount > 0);
  const legendRows = Math.max(1, Math.ceil(active.length / 2));
  const W = 500;
  const H = Math.max(370, 248 + legendRows * 28 + 12);
  const { canvas, ctx } = createHiDpiCanvas(W, H, 2);

  // Outer Card Shell
  drawRoundRect(ctx, 1, 1, W - 2, H - 2, 12);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.strokeStyle = '#C5D8EE';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Header Navy Bar
  ctx.save();
  drawRoundRect(ctx, 1, 1, W - 2, 38, 12);
  ctx.clip();
  ctx.fillStyle = '#012E5E';
  ctx.fillRect(1, 1, W - 2, 38);
  ctx.fillStyle = '#C99E4A';
  ctx.fillRect(1, 36, W - 2, 3);
  ctx.restore();

  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.font = `800 13px ${CHART_FONT_FAMILY}`;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText('توزيع الأداء · Performance Distribution', W - 16, 20);

  ctx.direction = 'rtl';
  ctx.textAlign = 'left';
  ctx.font = `700 11px ${CHART_FONT_FAMILY}`;
  ctx.fillStyle = '#DFC076';
  ctx.fillText('التوزيع النسبي', 16, 20);

  const cx = W / 2;
  const cy = 142;
  const outerR = 82;
  const innerR = 50;

  if (active.length === 0 || metrics.totalReceived <= 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, (outerR + innerR) / 2, 0, Math.PI * 2);
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = outerR - innerR;
    ctx.stroke();

    ctx.direction = 'rtl';
    ctx.textAlign = 'center';
    ctx.font = `700 12px ${CHART_FONT_FAMILY}`;
    ctx.fillStyle = '#64748B';
    ctx.fillText('لا توجد طلبات مسجلة', cx, cy);
  } else {
    let startAngle = -Math.PI / 2;
    const gap = active.length > 1 ? 0.025 : 0;

    active.forEach((s, idx) => {
      const sliceAngle = (s.receivedCount / metrics.totalReceived) * Math.PI * 2;
      const drawAngle = Math.max(0.02, sliceAngle - gap);
      const color = getServiceVisual(s.serviceId, s.nameAr, idx).color;

      ctx.beginPath();
      ctx.arc(cx, cy, outerR, startAngle, startAngle + drawAngle);
      ctx.arc(cx, cy, innerR, startAngle + drawAngle, startAngle, true);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();

      startAngle += sliceAngle;
    });

    // Center Total Label
    ctx.direction = 'rtl';
    ctx.textAlign = 'center';
    ctx.font = `700 11px ${CHART_FONT_FAMILY}`;
    ctx.fillStyle = '#64748B';
    ctx.fillText('الإجمالي', cx, cy - 11);

    ctx.direction = 'ltr';
    ctx.font = `900 19px ${CHART_FONT_FAMILY}`;
    ctx.fillStyle = '#012E5E';
    ctx.fillText(formatNumber(metrics.totalReceived), cx, cy + 11);
  }

  // Divider above legend
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(16, 238);
  ctx.lineTo(W - 16, 238);
  ctx.stroke();

  // 2-Column Legend (all active items)
  const legendItems = active;
  const colW = (W - 44) / 2;
  legendItems.forEach((item, idx) => {
    const col = idx % 2; // 0 -> right column in RTL, 1 -> left column in RTL
    const row = Math.floor(idx / 2);
    const pillX = col === 0 ? W - 16 - colW : 16;
    const pillY = 248 + row * 28;
    const pillH = 22;

    drawRoundRect(ctx, pillX, pillY, colW, pillH, 6);
    ctx.fillStyle = '#F7FAFC';
    ctx.fill();
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1;
    ctx.stroke();

    const color = getServiceVisual(item.serviceId, item.nameAr, idx).color;
    ctx.beginPath();
    ctx.arc(pillX + colW - 12, pillY + pillH / 2, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    // Percentage on left inside pill
    ctx.direction = 'ltr';
    ctx.textAlign = 'left';
    ctx.font = `800 10.5px ${CHART_FONT_FAMILY}`;
    ctx.fillStyle = '#1769AA';
    const pctStr = formatPct(item.shareOfTotalPct, '0%');
    ctx.fillText(pctStr, pillX + 8, pillY + pillH / 2);

    // Service name on right inside pill
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.font = `700 10.5px ${CHART_FONT_FAMILY}`;
    ctx.fillStyle = '#012E5E';
    const maxNameW = colW - 64;
    ctx.fillText(
      fitTextEllipsis(ctx, item.nameAr, maxNameW),
      pillX + colW - 22,
      pillY + pillH / 2
    );
  });

  return {
    base64: canvas.toDataURL('image/png'),
    extension: 'png',
    width: W,
    height: H,
  };
}

/**
 * 2. Section 6: Maintenance Site Horizontal Bar Chart (مقارنة الأعطال بين المقرات)
 */
export async function renderMaintenanceComparisonChartPng(params: {
  sites: MaintenanceSite[];
  categories: MaintenanceCategory[];
  siteTotals: Record<string, number>;
  grandTotalFaults: number;
}): Promise<LoadedExcelImage> {
  await ensureFontsReady();
  const { sites, siteTotals, grandTotalFaults } = params;

  const indexed = sites.map((s, idx) => ({
    siteId: s.id,
    nameAr: s.nameAr,
    faults: Math.max(0, Math.round(Number(siteTotals[s.id]) || 0)),
    sortOrder: typeof s.sortOrder === 'number' ? s.sortOrder : idx + 1,
    origIdx: idx,
  }));

  const sorted = [...indexed].sort((a, b) => {
    if (b.faults !== a.faults) return b.faults - a.faults;
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.origIdx - b.origIdx;
  });

  const computedTotal =
    grandTotalFaults >= 0 ? grandTotalFaults : indexed.reduce((s, r) => s + r.faults, 0);
  const maxFaults = sorted.reduce((m, r) => Math.max(m, r.faults), 0);
  const topSite = sorted.length > 0 && sorted[0].faults > 0 ? sorted[0] : null;

  const W = 940;
  const rowH = 38;
  const headerH = 66;
  const H = headerH + 22 + Math.max(1, sorted.length) * rowH + 14;
  const { canvas, ctx } = createHiDpiCanvas(W, H, 2);

  // Outer card background
  drawRoundRect(ctx, 1, 1, W - 2, H - 2, 12);
  ctx.fillStyle = '#F7FAFE';
  ctx.fill();
  ctx.strokeStyle = '#D5E3F2';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Accent bar on right
  drawRoundRect(ctx, W - 20, 14, 5, 36, 3);
  const accentGrad = ctx.createLinearGradient(0, 14, 0, 50);
  accentGrad.addColorStop(0, '#0C2544');
  accentGrad.addColorStop(0.55, '#1769AA');
  accentGrad.addColorStop(1, '#C6A35E');
  ctx.fillStyle = accentGrad;
  ctx.fill();

  // Title & subtitle (RTL right)
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.font = `800 15px ${CHART_FONT_FAMILY}`;
  ctx.fillStyle = '#0C2544';
  ctx.fillText('مقارنة الأعطال بين المقرات', W - 34, 24);

  ctx.font = `600 11px ${CHART_FONT_FAMILY}`;
  ctx.fillStyle = '#64748B';
  ctx.fillText(
    'مرتبة تنازلياً حسب عدد الأعطال المسجلة مع نسبة مساهمة كل مقر من الإجمالي',
    W - 34,
    43
  );

  // Top Mini Summary Badges (Left side)
  // Badge 1: Total Faults
  const badge1W = 165;
  drawRoundRect(ctx, 16, 12, badge1W, 40, 8);
  ctx.fillStyle = '#0C2544';
  ctx.fill();
  ctx.strokeStyle = '#C6A35E';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.font = `700 10px ${CHART_FONT_FAMILY}`;
  ctx.fillStyle = '#EAF2FA';
  ctx.fillText('إجمالي الأعطال', 16 + badge1W - 12, 24);

  ctx.direction = 'ltr';
  ctx.textAlign = 'right';
  ctx.font = `900 14px ${CHART_FONT_FAMILY}`;
  ctx.fillStyle = '#DFC076';
  ctx.fillText(`${formatNumber(computedTotal)}`, 16 + badge1W - 12, 41);

  // Badge 2: Top Site
  const badge2W = 245;
  drawRoundRect(ctx, 190, 12, badge2W, 40, 8);
  ctx.fillStyle = '#EAF2FA';
  ctx.fill();
  ctx.strokeStyle = '#C6A35E';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.font = `700 10px ${CHART_FONT_FAMILY}`;
  ctx.fillStyle = '#475569';
  ctx.fillText('المقر الأعلى أعطالاً', 190 + badge2W - 12, 24);

  ctx.font = `800 11.5px ${CHART_FONT_FAMILY}`;
  ctx.fillStyle = '#0C2544';
  const topSiteLabel = topSite
    ? `${topSite.nameAr} (${formatNumber(topSite.faults)})`
    : 'لا توجد أعطال مسجلة';
  ctx.fillText(fitTextEllipsis(ctx, topSiteLabel, badge2W - 24), 190 + badge2W - 12, 41);

  // Header divider
  ctx.strokeStyle = '#E3EDF7';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(16, headerH);
  ctx.lineTo(W - 16, headerH);
  ctx.stroke();

  // Horizontal Bar Rows (RTL layout: Rank+Site on Right, Track in Middle, Count+Pct on Left)
  sorted.forEach((row, idx) => {
    const rank = idx + 1;
    const isTop = rank === 1 && row.faults > 0;
    const sharePct = computedTotal > 0 ? (row.faults / computedTotal) * 100 : 0;
    const widthPct = maxFaults > 0 && row.faults > 0 ? Math.max(6, (row.faults / maxFaults) * 100) : 0;
    const y = headerH + 12 + idx * rowH;
    const boxH = 30;

    drawRoundRect(ctx, 16, y, W - 32, boxH, 8);
    ctx.fillStyle = isTop ? '#EAF2FA' : '#FFFFFF';
    ctx.fill();
    ctx.strokeStyle = isTop ? '#C6A35E' : '#E2ECF7';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Rank badge (far right)
    drawRoundRect(ctx, W - 48, y + 5, 22, 20, 5);
    ctx.fillStyle = isTop ? '#0C2544' : '#EAF2FA';
    ctx.fill();
    if (isTop) {
      ctx.strokeStyle = '#C6A35E';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.direction = 'ltr';
    ctx.textAlign = 'center';
    ctx.font = `800 11px ${CHART_FONT_FAMILY}`;
    ctx.fillStyle = isTop ? '#DFC076' : '#0C2544';
    ctx.fillText(formatNumber(rank), W - 37, y + boxH / 2);

    // Site name (right of track)
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.font = `800 12px ${CHART_FONT_FAMILY}`;
    ctx.fillStyle = '#0C2544';
    ctx.fillText(fitTextEllipsis(ctx, row.nameAr, 175), W - 56, y + boxH / 2);

    // Track (middle)
    const trackX = 185;
    const trackW = W - 430;
    const trackY = y + 7;
    const trackH = 16;

    drawRoundRect(ctx, trackX, trackY, trackW, trackH, 6);
    ctx.fillStyle = '#EAF2FA';
    ctx.fill();
    ctx.strokeStyle = '#D5E4F4';
    ctx.lineWidth = 1;
    ctx.stroke();

    if (row.faults > 0 && widthPct > 0) {
      const fillW = Math.max(12, ((trackW - 4) * widthPct) / 100);
      const fillX = trackX + trackW - 2 - fillW; // Grow right-to-left for RTL!
      drawRoundRect(ctx, fillX, trackY + 2, fillW, trackH - 4, 4);
      const barGrad = ctx.createLinearGradient(trackX + trackW, 0, fillX, 0);
      if (isTop) {
        barGrad.addColorStop(0, '#0C2544');
        barGrad.addColorStop(0.74, '#1769AA');
        barGrad.addColorStop(1, '#C6A35E');
      } else if (rank === 2) {
        barGrad.addColorStop(0, '#0C2544');
        barGrad.addColorStop(1, '#1769AA');
      } else {
        barGrad.addColorStop(0, '#1769AA');
        barGrad.addColorStop(1, '#247DC1');
      }
      ctx.fillStyle = barGrad;
      ctx.fill();
    }

    // Percentage pill (far left)
    drawRoundRect(ctx, 24, y + 5, 62, 20, 5);
    ctx.fillStyle = isTop ? '#0C2544' : row.faults > 0 ? '#EAF2FA' : '#F1F5F9';
    ctx.fill();
    ctx.direction = 'ltr';
    ctx.textAlign = 'center';
    ctx.font = `800 11px ${CHART_FONT_FAMILY}`;
    ctx.fillStyle = isTop ? '#DFC076' : row.faults > 0 ? '#1769AA' : '#64748B';
    ctx.fillText(formatPercentage(sharePct), 55, y + boxH / 2);

    // Count label beside percentage pill
    ctx.direction = 'ltr';
    ctx.textAlign = 'right';
    ctx.font = `900 12.5px ${CHART_FONT_FAMILY}`;
    ctx.fillStyle = '#0C2544';
    ctx.fillText(`${formatNumber(row.faults)}`, 168, y + boxH / 2);

    ctx.direction = 'rtl';
    ctx.textAlign = 'left';
    ctx.font = `600 10.5px ${CHART_FONT_FAMILY}`;
    ctx.fillStyle = '#64748B';
    ctx.fillText('عطلاً', 96, y + boxH / 2);
  });

  return {
    base64: canvas.toDataURL('image/png'),
    extension: 'png',
    width: W,
    height: H,
  };
}

/**
 * 3. Section 7: Maintenance Services Sources Donut Chart (توزيع مصادر طلبات الصيانة)
 */
export async function renderMaintenanceSourcesDonutChartPng(params: {
  fromFM: number;
  fromOther: number;
}): Promise<LoadedExcelImage> {
  await ensureFontsReady();
  const { fromFM, fromOther } = params;
  const total = fromFM + fromOther;
  const fmPct = total > 0 ? (fromFM / total) * 100 : 0;
  const otherPct = total > 0 ? (fromOther / total) * 100 : 0;

  const W = 500;
  const H = 200;
  const { canvas, ctx } = createHiDpiCanvas(W, H, 2);

  drawRoundRect(ctx, 1, 1, W - 2, H - 2, 12);
  ctx.fillStyle = '#F7FAFC';
  ctx.fill();
  ctx.strokeStyle = '#C5D8EE';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Donut on Left Side
  const cx = 92;
  const cy = 100;
  const outerR = 62;
  const innerR = 36;

  const slices = [
    { val: fromFM, color: '#0C4176' },
    { val: fromOther, color: '#C99E4A' },
  ].filter((s) => s.val > 0);

  if (slices.length === 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, (outerR + innerR) / 2, 0, Math.PI * 2);
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = outerR - innerR;
    ctx.stroke();
    ctx.direction = 'rtl';
    ctx.textAlign = 'center';
    ctx.font = `700 11px ${CHART_FONT_FAMILY}`;
    ctx.fillStyle = '#64748B';
    ctx.fillText('لا توجد بيانات', cx, cy);
  } else {
    let start = -Math.PI / 2;
    const gap = slices.length > 1 ? 0.04 : 0;
    slices.forEach((s) => {
      const span = (s.val / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(cx, cy, outerR, start, start + Math.max(0.03, span - gap));
      ctx.arc(cx, cy, innerR, start + Math.max(0.03, span - gap), start, true);
      ctx.closePath();
      ctx.fillStyle = s.color;
      ctx.fill();
      start += span;
    });

    ctx.direction = 'ltr';
    ctx.textAlign = 'center';
    ctx.font = `900 18px ${CHART_FONT_FAMILY}`;
    ctx.fillStyle = '#012E5E';
    ctx.fillText(formatNumber(total), cx, cy);
  }

  // Right Side Legend Cards
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.font = `800 14px ${CHART_FONT_FAMILY}`;
  ctx.fillStyle = '#012E5E';
  ctx.fillText('توزيع مصادر طلبات الصيانة', W - 20, 34);

  const cards = [
    {
      label: 'من قسم المرافق',
      count: fromFM,
      pct: fmPct,
      dot: '#0C4176',
      textColor: '#0C4176',
    },
    {
      label: 'من الإدارات الأخرى',
      count: fromOther,
      pct: otherPct,
      dot: '#C99E4A',
      textColor: '#9A6700',
    },
  ];

  cards.forEach((item, idx) => {
    const cardX = 185;
    const cardW = W - 205;
    const cardY = 62 + idx * 58;
    const cardH = 44;

    drawRoundRect(ctx, cardX, cardY, cardW, cardH, 8);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Dot
    ctx.beginPath();
    ctx.arc(cardX + cardW - 14, cardY + cardH / 2, 5, 0, Math.PI * 2);
    ctx.fillStyle = item.dot;
    ctx.fill();

    // Arabic Label
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.font = `800 12px ${CHART_FONT_FAMILY}`;
    ctx.fillStyle = '#012E5E';
    ctx.fillText(item.label, cardX + cardW - 26, cardY + cardH / 2);

    // Value + pct on left
    ctx.direction = 'ltr';
    ctx.textAlign = 'left';
    ctx.font = `800 12px ${CHART_FONT_FAMILY}`;
    ctx.fillStyle = item.textColor;
    ctx.fillText(`${formatNumber(item.count)} (${formatPercentage(item.pct)})`, cardX + 12, cardY + cardH / 2);
  });

  return {
    base64: canvas.toDataURL('image/png'),
    extension: 'png',
    width: W,
    height: H,
  };
}

/**
 * 4. Section 8: Logistics Channels Descending Horizontal Chart
 */
export async function renderLogisticsChannelsChartPng(
  channels: LogisticsChannelItem[]
): Promise<LoadedExcelImage> {
  await ensureFontsReady();
  const safeChannels = Array.isArray(channels) ? channels : [];
  const total = safeChannels.reduce(
    (sum, ch) => sum + Math.max(0, Math.round(Number(ch.requestCount) || 0)),
    0
  );

  const sorted = [...safeChannels]
    .map((ch, idx) => ({
      channelKey: ch.channelKey || `ch_${idx}`,
      nameAr: ch.nameAr || 'قناة دعم',
      requestCount: Math.max(0, Math.round(Number(ch.requestCount) || 0)),
      sortOrder: typeof ch.sortOrder === 'number' ? ch.sortOrder : idx + 1,
    }))
    .sort((a, b) => {
      if (b.requestCount !== a.requestCount) return b.requestCount - a.requestCount;
      return a.sortOrder - b.sortOrder;
    });

  const maxCount = sorted.reduce((m, r) => Math.max(m, r.requestCount), 0);

  const W = 560;
  const headerH = 58;
  const rowH = 34;
  const H = headerH + 14 + Math.max(1, sorted.length) * rowH + 10;
  const { canvas, ctx } = createHiDpiCanvas(W, H, 2);

  drawRoundRect(ctx, 1, 1, W - 2, H - 2, 12);
  ctx.fillStyle = '#F7FAFE';
  ctx.fill();
  ctx.strokeStyle = '#D5E3F2';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Accent bar
  drawRoundRect(ctx, W - 18, 12, 4, 30, 2);
  ctx.fillStyle = '#0C2544';
  ctx.fill();

  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.font = `800 13px ${CHART_FONT_FAMILY}`;
  ctx.fillStyle = '#0C2544';
  ctx.fillText('التوزيع التنازلي لقنوات الدعم اللوجستي', W - 28, 22);

  ctx.font = `600 10px ${CHART_FONT_FAMILY}`;
  ctx.fillStyle = '#64748B';
  ctx.fillText('مرتبة تنازلياً من القناة الأعلى طلباً إلى الأقل', W - 28, 39);

  // Total mini card (Left)
  const badgeW = 160;
  drawRoundRect(ctx, 14, 10, badgeW, 38, 8);
  ctx.fillStyle = '#0C2544';
  ctx.fill();
  ctx.strokeStyle = '#C6A35E';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.font = `700 9.5px ${CHART_FONT_FAMILY}`;
  ctx.fillStyle = '#EAF2FA';
  ctx.fillText('إجمالي الطلبات اللوجستية', 14 + badgeW - 10, 22);

  ctx.direction = 'ltr';
  ctx.textAlign = 'right';
  ctx.font = `900 13.5px ${CHART_FONT_FAMILY}`;
  ctx.fillStyle = '#DFC076';
  ctx.fillText(formatNumber(total), 14 + badgeW - 10, 38);

  // Divider
  ctx.strokeStyle = '#E3EDF7';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(14, headerH);
  ctx.lineTo(W - 14, headerH);
  ctx.stroke();

  sorted.forEach((row, idx) => {
    const rank = idx + 1;
    const isTop = rank === 1 && row.requestCount > 0;
    const sharePct = total > 0 ? (row.requestCount / total) * 100 : 0;
    const widthPct = maxCount > 0 && row.requestCount > 0 ? Math.max(7, (row.requestCount / maxCount) * 100) : 0;
    const y = headerH + 8 + idx * rowH;
    const boxH = 27;

    drawRoundRect(ctx, 14, y, W - 28, boxH, 7);
    ctx.fillStyle = isTop ? '#EAF2FA' : '#FFFFFF';
    ctx.fill();
    ctx.strokeStyle = isTop ? '#C6A35E' : '#E2ECF7';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Rank badge
    drawRoundRect(ctx, W - 42, y + 4, 20, 19, 5);
    ctx.fillStyle = isTop ? '#0C2544' : '#EAF2FA';
    ctx.fill();
    ctx.direction = 'ltr';
    ctx.textAlign = 'center';
    ctx.font = `800 10.5px ${CHART_FONT_FAMILY}`;
    ctx.fillStyle = isTop ? '#DFC076' : '#0C2544';
    ctx.fillText(formatNumber(rank), W - 32, y + boxH / 2);

    // Name
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.font = `800 11px ${CHART_FONT_FAMILY}`;
    ctx.fillStyle = '#0C2544';
    ctx.fillText(fitTextEllipsis(ctx, row.nameAr, 118), W - 49, y + boxH / 2);

    // Bar track
    const trackX = 148;
    const trackW = W - 328;
    const trackY = y + 6;
    const trackH = 15;
    drawRoundRect(ctx, trackX, trackY, trackW, trackH, 5);
    ctx.fillStyle = '#EAF2FA';
    ctx.fill();
    ctx.strokeStyle = '#D5E4F4';
    ctx.lineWidth = 1;
    ctx.stroke();

    if (row.requestCount > 0 && widthPct > 0) {
      const fillW = Math.max(10, ((trackW - 4) * widthPct) / 100);
      const fillX = trackX + trackW - 2 - fillW;
      drawRoundRect(ctx, fillX, trackY + 2, fillW, trackH - 4, 4);
      const barGrad = ctx.createLinearGradient(trackX + trackW, 0, fillX, 0);
      if (isTop) {
        barGrad.addColorStop(0, '#0C2544');
        barGrad.addColorStop(0.74, '#1769AA');
        barGrad.addColorStop(1, '#C6A35E');
      } else {
        barGrad.addColorStop(0, '#0C2544');
        barGrad.addColorStop(1, '#247DC1');
      }
      ctx.fillStyle = barGrad;
      ctx.fill();
    }

    // Percentage pill
    drawRoundRect(ctx, 22, y + 4, 54, 19, 5);
    ctx.fillStyle = isTop ? '#0C2544' : row.requestCount > 0 ? '#EAF2FA' : '#F1F5F9';
    ctx.fill();
    ctx.direction = 'ltr';
    ctx.textAlign = 'center';
    ctx.font = `800 10.5px ${CHART_FONT_FAMILY}`;
    ctx.fillStyle = isTop ? '#DFC076' : row.requestCount > 0 ? '#1769AA' : '#64748B';
    ctx.fillText(formatPercentage(sharePct), 49, y + boxH / 2);

    // Count
    ctx.direction = 'ltr';
    ctx.textAlign = 'right';
    ctx.font = `900 11.5px ${CHART_FONT_FAMILY}`;
    ctx.fillStyle = '#0C2544';
    ctx.fillText(formatNumber(row.requestCount), 136, y + boxH / 2);

    ctx.direction = 'rtl';
    ctx.textAlign = 'left';
    ctx.font = `600 10px ${CHART_FONT_FAMILY}`;
    ctx.fillStyle = '#64748B';
    ctx.fillText('طلباً', 82, y + boxH / 2);
  });

  return {
    base64: canvas.toDataURL('image/png'),
    extension: 'png',
    width: W,
    height: H,
  };
}
