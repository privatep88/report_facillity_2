import {
  api,
} from '../api/client.ts';
import { validateReportPagesGeometry } from '../components/OfficialReportLayout.tsx';
import {
  computeAnalyticsEngine,
  DEFAULT_ANALYTICS_FILTERS,
  type AnalyticsEngineOutput,
  type AnalyticsFilters,
} from './AnalyticsEngineService.ts';
import {
  exportAnalyticsDirectExcel,
  exportReportDirectExcel,
} from './DirectReportExcelExportService.ts';
import {
  exportAnalyticsDirectPdf,
  exportReportDirectPdf,
  type DirectReportSnapshotData,
} from './DirectReportPdfExportService.ts';

export interface ExportResult {
  filename: string;
  sizeBytes: number;
  pageCount?: number;
  sheetCount?: number;
  embeddedMediaCount?: number;
  mode?: 'download' | 'print';
}

/**
 * Direct One-Click WYSIWYG A4 PDF Export matching OfficialReportLayout 100%.
 * Never opens print dialogs, preview modals, or new browser tabs.
 */
export async function exportReportPdf(params: {
  reportId: string;
  versionNumber?: number | null;
  orientation?: 'landscape' | 'portrait';
  liveData?: DirectReportSnapshotData;
}): Promise<ExportResult> {
  const { reportId, versionNumber, orientation = 'portrait', liveData } = params;
  const res = await exportReportDirectPdf({
    reportId,
    versionNumber,
    orientation,
    liveData,
  });
  return {
    filename: res.filename,
    sizeBytes: res.sizeBytes,
    pageCount: res.pageCount,
    mode: 'download',
  };
}

/**
 * Full-Fidelity 12-Section + Analytical Sheet Enterprise Excel (.xlsx) Export.
 * Runs 100% in-browser via ExcelJS with live formulas, embedded photos, Chart PNGs,
 * digital signatures, RTL support, and A4 Landscape print setup.
 */
export async function exportReportExcel(params: {
  reportId: string;
  versionNumber?: number | null;
  liveData?: DirectReportSnapshotData;
}): Promise<ExportResult> {
  const { reportId, versionNumber, liveData } = params;
  const res = await exportReportDirectExcel({
    reportId,
    versionNumber,
    liveData,
  });
  return {
    filename: res.filename,
    sizeBytes: res.sizeBytes,
    sheetCount: res.sheetCount,
    embeddedMediaCount: res.embeddedMediaCount,
    mode: 'download',
  };
}

/**
 * Direct One-Click Executive Analytics A4 PDF Download without window.print().
 */
export async function exportAnalyticsPdf(params: {
  filters: Record<string, string>;
  orientation?: 'landscape' | 'portrait';
  data?: AnalyticsEngineOutput;
}): Promise<ExportResult> {
  const { filters, orientation = 'landscape', data } = params;
  let resolvedData = data;
  if (!resolvedData) {
    const all = await api.getAllAnalytics();
    resolvedData = computeAnalyticsEngine({
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
  const res = await exportAnalyticsDirectPdf({
    data: resolvedData,
    orientation,
  });
  return {
    filename: res.filename,
    sizeBytes: res.sizeBytes,
    pageCount: res.pageCount,
    mode: 'download',
  };
}

/**
 * Full 5-Sheet Executive Analytics Excel (.xlsx) Export in-browser.
 */
export async function exportAnalyticsExcel(params: {
  filters: Record<string, string>;
  data?: AnalyticsEngineOutput;
}): Promise<ExportResult> {
  const { filters, data } = params;
  const res = await exportAnalyticsDirectExcel({
    filters,
    data,
  });
  return {
    filename: res.filename,
    sizeBytes: res.sizeBytes,
    sheetCount: res.sheetCount,
    embeddedMediaCount: res.embeddedMediaCount,
    mode: 'download',
  };
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
  const { orientation = 'portrait', container } = params;

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

  let validation = validateReportPagesGeometry(root, orientation);
  if (!validation.valid) {
    await waitForPaginationReady(root, 600);
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => resolve());
      });
    });
    validation = validateReportPagesGeometry(root, orientation);
    if (!validation.valid) {
      console.warn('[SAAED Print Geometry Validator] Non-blocking layout warning:', validation.issues);
    }
  }

  const styleId = 'saaed-dynamic-print-page-style';
  document.getElementById(styleId)?.remove();
  const styleEl = document.createElement('style');
  styleEl.id = styleId;
  styleEl.textContent = `@media print { @page { size: A4 ${orientation}; margin: 5mm; } }`;
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
