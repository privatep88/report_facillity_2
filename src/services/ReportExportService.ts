import {
  getStoredToken,
  isStaticBackendUnavailable,
  markStaticBackendUnavailable,
  resolveApiUrl,
} from '../api/client.ts';
import { staticFallbackApi } from '../api/staticFallbackStore.ts';
import { computeReportMetrics, formatPct, getMonthNameAr } from '../utils/calculations.ts';

async function verifyMagicHeader(blob: Blob, kind: 'pdf' | 'xlsx'): Promise<void> {
  if (!blob || blob.size < 100) {
    throw new Error('الملف الناتج فارغ أو غير مكتمل.');
  }
  const head = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
  if (kind === 'pdf') {
    const isPdf = head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46; // %PDF
    if (!isPdf) {
      throw new Error('لم يتم استلام ملف PDF صالح من الخادم.');
    }
  } else {
    const isZip = head[0] === 0x50 && head[1] === 0x4b; // PK (xlsx zip container)
    if (!isZip) {
      throw new Error('لم يتم استلام ملف Excel (.xlsx) صالح من الخادم.');
    }
  }
}

function triggerBrowserDownload(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, 1500);
}

function parseFilename(disposition: string | null, fallback: string): string {
  if (!disposition) return fallback;
  const match = disposition.match(/filename\*?=(?:UTF-8'')?"?([^";\n]+)"?/i);
  if (!match) return fallback;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export interface ExportResult {
  filename: string;
  sizeBytes: number;
  mode?: 'download' | 'print';
}

/**
 * Browser-side Excel (.xlsx) generator used when the app is deployed to static
 * hosting (e.g. GitHub Pages) without a Node.js/Express backend server.
 */
async function generateBrowserReportExcelFallback(
  reportId: string,
  versionNumber?: number | null
): Promise<ExportResult> {
  const ExcelJSImport = await import('exceljs');
  const ExcelJS = ExcelJSImport.default || ExcelJSImport;
  const { report, sites, categories, thresholds } = staticFallbackApi.getReportForExport(
    reportId,
    versionNumber
  );
  const metrics = computeReportMetrics(report, sites, categories, thresholds);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'SAAED Facilities Management System';
  const ws = wb.addWorksheet('التقرير الشهري للمرافق', {
    views: [{ rightToLeft: true }],
  });

  ws.columns = [
    { width: 8 },
    { width: 28 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 24 },
  ];

  const titleRow = ws.addRow([
    `التقرير الشهري لقسم إدارة المرافق — ${report.reportNumber} (${getMonthNameAr(report.month)} ${report.year})`,
  ]);
  titleRow.font = { name: 'Cairo', size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
  titleRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF012E5E' } };
  ws.mergeCells(titleRow.number, 1, titleRow.number, 6);

  ws.addRow([]);
  const kpiHead = ws.addRow([
    'المؤشر',
    'إجمالي الطلبات',
    'أعلى خدمة طلباً',
    'إجمالي الخدمات النشطة',
    'نسبة الإنجاز الشهرية',
    'إجمالي تكاليف الصيانة (درهم)',
  ]);
  kpiHead.font = { bold: true };
  ws.addRow([
    'القيمة',
    metrics.totalReceived,
    metrics.topService ? metrics.topService.nameAr : '—',
    metrics.activeServicesCount,
    formatPct(metrics.overallCompletionPct, '0.0%'),
    metrics.maintenance.grandTotalCostAed,
  ]);

  ws.addRow([]);
  const svcHead = ws.addRow(['#', 'الخدمة', 'المستلمة', 'المنفذة', 'نسبة الإنجاز', 'المستوى']);
  svcHead.font = { bold: true };
  metrics.servicesWithMetrics.forEach((s, idx) => {
    ws.addRow([
      idx + 1,
      s.nameAr,
      s.receivedCount,
      s.executedCount,
      formatPct(s.completionPct, '0.0%'),
      s.level.labelAr,
    ]);
  });

  ws.addRow([]);
  const taskHead = ws.addRow(['#', 'الموضوع', 'المهمة', 'الحالة', 'نسبة الإنجاز %', '']);
  taskHead.font = { bold: true };
  report.tasks.forEach((t, idx) => {
    ws.addRow([idx + 1, t.topic, t.taskName, t.status, t.completionPct, '']);
  });

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  await verifyMagicHeader(blob, 'xlsx');
  const filename = `${report.reportNumber}_v${versionNumber || report.currentVersion}.xlsx`;
  triggerBrowserDownload(blob, filename);
  return { filename, sizeBytes: blob.size };
}

async function generateBrowserAnalyticsExcelFallback(): Promise<ExportResult> {
  const ExcelJSImport = await import('exceljs');
  const ExcelJS = ExcelJSImport.default || ExcelJSImport;
  const { reports, sites, categories, thresholds } = staticFallbackApi.getAllReportsForAnalytics();

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('تحليل التقارير التنفيذي', {
    views: [{ rightToLeft: true }],
  });
  ws.columns = [
    { width: 18 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 20 },
  ];
  const header = ws.addRow([
    'رقم التقرير',
    'الفترة',
    'الطلبات المستلمة',
    'الطلبات المنفذة',
    'نسبة الإنجاز',
    'إجمالي التكاليف (درهم)',
  ]);
  header.font = { bold: true };

  reports.forEach((r) => {
    const m = computeReportMetrics(r, sites, categories, thresholds);
    ws.addRow([
      r.reportNumber,
      `${getMonthNameAr(r.month)} ${r.year}`,
      m.totalReceived,
      m.totalExecuted,
      formatPct(m.overallCompletionPct, '0.0%'),
      m.maintenance.grandTotalCostAed,
    ]);
  });

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  await verifyMagicHeader(blob, 'xlsx');
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `SAAED_FM_Executive_Analytics_${stamp}.xlsx`;
  triggerBrowserDownload(blob, filename);
  return { filename, sizeBytes: blob.size };
}

export async function exportReportPdf(params: {
  reportId: string;
  versionNumber?: number | null;
  orientation?: 'landscape' | 'portrait';
  onPrintFallback?: (orientation: 'landscape' | 'portrait') => Promise<void>;
}): Promise<ExportResult> {
  const { reportId, versionNumber, orientation = 'landscape', onPrintFallback } = params;

  const runFallbackPrint = async (): Promise<ExportResult> => {
    if (onPrintFallback) {
      await onPrintFallback(orientation);
    } else {
      await prepareAndTriggerPrint({ orientation });
    }
    return {
      filename: `SAAED_FM_Report_${reportId}.pdf`,
      sizeBytes: 1024,
      mode: 'print',
    };
  };

  if (isStaticBackendUnavailable()) {
    return runFallbackPrint();
  }

  const qs = new URLSearchParams();
  if (versionNumber) qs.set('version', String(versionNumber));
  if (orientation) qs.set('orientation', orientation);

  const url = resolveApiUrl(
    `/api/reports/${encodeURIComponent(reportId)}/export/pdf?${qs.toString()}`
  );
  const token = getStoredToken();

  let res: Response;
  try {
    res = await fetch(url, {
      credentials: 'include',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
  } catch {
    markStaticBackendUnavailable();
    return runFallbackPrint();
  }

  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  if (res.status === 404 || contentType.includes('text/html')) {
    markStaticBackendUnavailable();
    return runFallbackPrint();
  }

  if (!res.ok) {
    let errMsg = 'تعذر إنشاء ملف PDF الرسمي من الخادم';
    try {
      const data = (await res.json()) as { error?: string };
      if (data.error) errMsg = data.error;
    } catch {
      // ignore non-json
    }
    throw new Error(errMsg);
  }

  const blob = await res.blob();
  await verifyMagicHeader(blob, 'pdf');
  const filename = parseFilename(
    res.headers.get('Content-Disposition'),
    `SAAED_FM_Report_${reportId}.pdf`
  );
  triggerBrowserDownload(blob, filename);
  return { filename, sizeBytes: blob.size, mode: 'download' };
}

export async function exportReportExcel(params: {
  reportId: string;
  versionNumber?: number | null;
}): Promise<ExportResult> {
  const { reportId, versionNumber } = params;

  if (isStaticBackendUnavailable()) {
    return generateBrowserReportExcelFallback(reportId, versionNumber);
  }

  const path = versionNumber
    ? `/api/reports/${encodeURIComponent(reportId)}/export/excel?version=${versionNumber}`
    : `/api/reports/${encodeURIComponent(reportId)}/export/excel`;
  const url = resolveApiUrl(path);
  const token = getStoredToken();

  let res: Response;
  try {
    res = await fetch(url, {
      credentials: 'include',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
  } catch {
    markStaticBackendUnavailable();
    return generateBrowserReportExcelFallback(reportId, versionNumber);
  }

  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  if (res.status === 404 || contentType.includes('text/html')) {
    markStaticBackendUnavailable();
    return generateBrowserReportExcelFallback(reportId, versionNumber);
  }

  if (!res.ok) {
    let errMsg = 'تعذر إنشاء ملف Excel من الخادم';
    try {
      const data = (await res.json()) as { error?: string };
      if (data.error) errMsg = data.error;
    } catch {
      // ignore
    }
    throw new Error(errMsg);
  }

  const blob = await res.blob();
  await verifyMagicHeader(blob, 'xlsx');
  const filename = parseFilename(
    res.headers.get('Content-Disposition'),
    `SAAED_FM_Report_${reportId}.xlsx`
  );
  triggerBrowserDownload(blob, filename);
  return { filename, sizeBytes: blob.size };
}

export async function exportAnalyticsPdf(params: {
  filters: Record<string, string>;
  orientation?: 'landscape' | 'portrait';
}): Promise<ExportResult> {
  const { filters, orientation = 'landscape' } = params;

  if (isStaticBackendUnavailable()) {
    await prepareAndTriggerPrint({ orientation });
    const stamp = new Date().toISOString().slice(0, 10);
    return { filename: `SAAED_FM_Executive_Analytics_${stamp}.pdf`, sizeBytes: 1024 };
  }

  const token = getStoredToken();
  let res: Response;
  try {
    res = await fetch(resolveApiUrl('/api/analytics/export/pdf'), {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ filters, orientation }),
    });
  } catch {
    markStaticBackendUnavailable();
    await prepareAndTriggerPrint({ orientation });
    const stamp = new Date().toISOString().slice(0, 10);
    return { filename: `SAAED_FM_Executive_Analytics_${stamp}.pdf`, sizeBytes: 1024 };
  }

  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  if (res.status === 404 || contentType.includes('text/html')) {
    markStaticBackendUnavailable();
    await prepareAndTriggerPrint({ orientation });
    const stamp = new Date().toISOString().slice(0, 10);
    return { filename: `SAAED_FM_Executive_Analytics_${stamp}.pdf`, sizeBytes: 1024 };
  }

  if (!res.ok) {
    throw new Error('تعذر إنشاء ملف PDF للتحليلات التنفيذية');
  }

  const blob = await res.blob();
  await verifyMagicHeader(blob, 'pdf');
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = parseFilename(
    res.headers.get('Content-Disposition'),
    `SAAED_FM_Executive_Analytics_${stamp}.pdf`
  );
  triggerBrowserDownload(blob, filename);
  return { filename, sizeBytes: blob.size };
}

export async function exportAnalyticsExcel(params: {
  filters: Record<string, string>;
}): Promise<ExportResult> {
  const { filters } = params;

  if (isStaticBackendUnavailable()) {
    return generateBrowserAnalyticsExcelFallback();
  }

  const token = getStoredToken();
  let res: Response;
  try {
    res = await fetch(resolveApiUrl('/api/analytics/export/excel'), {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ filters }),
    });
  } catch {
    markStaticBackendUnavailable();
    return generateBrowserAnalyticsExcelFallback();
  }

  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  if (res.status === 404 || contentType.includes('text/html')) {
    markStaticBackendUnavailable();
    return generateBrowserAnalyticsExcelFallback();
  }

  if (!res.ok) {
    throw new Error('تعذر إنشاء ملف Excel للتحليلات التنفيذية');
  }

  const blob = await res.blob();
  await verifyMagicHeader(blob, 'xlsx');
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = parseFilename(
    res.headers.get('Content-Disposition'),
    `SAAED_FM_Executive_Analytics_${stamp}.xlsx`
  );
  triggerBrowserDownload(blob, filename);
  return { filename, sizeBytes: blob.size };
}

async function waitForPaginationReady(root: ParentNode, timeoutMs = 1600): Promise<void> {
  const startedAt = performance.now();
  while (performance.now() - startedAt < timeoutMs) {
    const paginated = root.querySelector('.official-report-pages-container');
    if (!paginated || paginated.getAttribute('data-pagination-ready') === 'true') {
      return;
    }
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
  }
}

/**
 * Waits for web fonts (Cairo / IBM Plex), A4 pagination refinement, and all rendered
 * images/signatures to finish decoding before triggering browser print with exact A4 styling.
 */
export async function prepareAndTriggerPrint(params: {
  orientation?: 'landscape' | 'portrait';
  container?: HTMLElement | null;
}): Promise<void> {
  const { orientation = 'landscape', container } = params;

  try {
    if (document.fonts && document.fonts.ready) {
      await Promise.race([
        document.fonts.ready,
        new Promise((r) => window.setTimeout(r, 1500)),
      ]);
    }
  } catch {
    // ignore font readiness failures
  }

  const root: ParentNode = container || document;

  await waitForPaginationReady(root);

  const imgs = Array.from(root.querySelectorAll('img'));
  await Promise.race([
    Promise.all(
      imgs.map(async (img) => {
        if (!img.complete) {
          await new Promise<void>((resolve) => {
            const done = () => {
              img.removeEventListener('load', done);
              img.removeEventListener('error', done);
              resolve();
            };
            img.addEventListener('load', done);
            img.addEventListener('error', done);
          });
        }
        if (typeof img.decode === 'function') {
          try {
            await img.decode();
          } catch {
            // ignore decode error on svgs/data-urls
          }
        }
      })
    ),
    new Promise((r) => window.setTimeout(r, 1800)),
  ]);

  // Wait two animation frames so SVG charts and fonts commit cleanly after pagination
  await new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve());
    });
  });

  const styleId = 'saaed-dynamic-print-page-style';
  document.getElementById(styleId)?.remove();
  const styleEl = document.createElement('style');
  styleEl.id = styleId;
  styleEl.textContent = `@media print { @page { size: A4 ${orientation}; margin: 4mm; } }`;
  document.head.appendChild(styleEl);

  await new Promise<void>((resolve) => {
    let finished = false;
    let fallbackTimer = 0;

    const cleanup = () => {
      if (finished) return;
      finished = true;
      window.clearTimeout(fallbackTimer);
      window.removeEventListener('afterprint', cleanup);
      styleEl.remove();
      resolve();
    };

    window.addEventListener('afterprint', cleanup);
    fallbackTimer = window.setTimeout(cleanup, 1200);
    window.print();
  });
}
