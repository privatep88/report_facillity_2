import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { domToCanvas } from 'modern-screenshot';
import { PDFDocument } from 'pdf-lib';
import { api } from '../api/client.ts';
import { AnalyticsDirectPrintDocument } from '../components/analytics/AnalyticsDirectPrintDocument.tsx';
import {
  A4_SHEET_DIMENSIONS,
  OfficialReportLayout,
  validateReportPagesGeometry,
} from '../components/OfficialReportLayout.tsx';
import type { AnalyticsEngineOutput } from './AnalyticsEngineService.ts';
import type {
  MaintenanceCategory,
  MaintenanceSite,
  MonthlyReportFull,
  PerformanceThresholds,
} from '../types/report.ts';
import {
  formatDateTimeWestern,
  getMonthNameAr,
} from '../utils/calculations.ts';

export type PdfOrientation = 'landscape' | 'portrait';

export interface DirectReportSnapshotData {
  report: MonthlyReportFull;
  sites: MaintenanceSite[];
  categories: MaintenanceCategory[];
  thresholds: PerformanceThresholds;
  snapshotVersion?: number | null;
}

export interface DirectPdfExportResult {
  filename: string;
  sizeBytes: number;
  pageCount: number;
  orientation: PdfOrientation;
  mode: 'download';
}

const A4_POINTS: Record<PdfOrientation, { width: number; height: number }> = {
  portrait: { width: 595.28, height: 841.89 },
  landscape: { width: 841.89, height: 595.28 },
};

const A4_MARGIN_PT = 14.1732; // exact 5mm margin matching @page { margin: 5mm; }
const MIN_VALID_PDF_BYTES = 15 * 1024;

let cachedFontEmbedCss: string | null = null;
const dataUrlAssetCache = new Map<string, string>();

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

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string' && reader.result.startsWith('data:')) {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to convert asset blob to data URL'));
      }
    };
    reader.onerror = () => reject(reader.error || new Error('FileReader error'));
    reader.readAsDataURL(blob);
  });
}

async function fetchAsDataUrl(url: string, timeoutMs = 2500): Promise<string | null> {
  if (!url || url.startsWith('data:')) return url || null;
  const cached = dataUrlAssetCache.get(url);
  if (cached) return cached;

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { mode: 'cors', signal: controller.signal });
    if (!res.ok) return null;
    const blob = await res.blob();
    const dataUrl = await blobToDataUrl(blob);
    dataUrlAssetCache.set(url, dataUrl);
    return dataUrl;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

async function resolveInlinedWebFontCss(): Promise<string> {
  if (cachedFontEmbedCss !== null) {
    return cachedFontEmbedCss;
  }

  const fontLinks = Array.from(
    document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')
  ).filter((link) => /fonts\.googleapis\.com/i.test(link.href));

  if (fontLinks.length === 0) {
    cachedFontEmbedCss = '';
    return '';
  }

  const chunks: string[] = [];
  for (const link of fontLinks) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 2500);
    try {
      const res = await fetch(link.href, { signal: controller.signal });
      if (!res.ok) continue;
      let css = await res.text();
      // Keep only arabic and latin subsets (plus unlabeled rules) to keep SVG font CSS compact and fast
      css = css.replace(/\/\*\s*([a-z0-9-]+)\s*\*\/\s*@font-face\s*\{[^}]*\}/gi, (block, subset) => {
        const s = String(subset).toLowerCase();
        return s === 'arabic' || s === 'latin' ? block : '';
      });
      const matches = Array.from(css.matchAll(/url\(([^)]+)\)/g));
      const uniqueUrls = Array.from(
        new Set(matches.map((m) => m[1].replace(/['"]/g, '').trim()).filter(Boolean))
      );

      await Promise.all(
        uniqueUrls.map(async (fontUrl) => {
          const absUrl = new URL(fontUrl, link.href).href;
          const inlined = await fetchAsDataUrl(absUrl, 2500);
          if (inlined) {
            css = css.split(fontUrl).join(inlined);
          }
        })
      );
      chunks.push(css);
    } catch {
      // Offline / blocked CORS: rely gracefully on browser loaded fonts
    } finally {
      window.clearTimeout(timer);
    }
  }

  cachedFontEmbedCss = chunks.join('\n');
  return cachedFontEmbedCss;
}

async function preloadAndWaitForMedia(root: HTMLElement): Promise<void> {
  try {
    if (document.fonts && document.fonts.ready) {
      await Promise.race([
        document.fonts.ready,
        new Promise<void>((r) => window.setTimeout(r, 2000)),
      ]);
    }
  } catch {
    // Ignore font readiness rejections
  }

  // Inline <picture><source srcSet> and <img> assets as data URIs when same-origin/blob so SVG foreignObject never drops assets
  const sources = Array.from(root.querySelectorAll<HTMLSourceElement>('picture source'));
  await Promise.all(
    sources.map(async (source) => {
      const srcSet = (source.getAttribute('srcset') || '').trim();
      if (!srcSet || srcSet.startsWith('data:')) return;
      const firstUrl = srcSet.split(',')[0]?.trim().split(/\s+/)[0];
      if (!firstUrl) return;
      const absUrl = new URL(firstUrl, window.location.href).href;
      if (new URL(absUrl).origin !== window.location.origin && !absUrl.startsWith('blob:')) {
        return;
      }
      const dataUrl = await fetchAsDataUrl(absUrl, 3000);
      if (dataUrl) {
        source.setAttribute('srcset', dataUrl);
      }
    })
  );

  const imgs = Array.from(root.querySelectorAll<HTMLImageElement>('img'));
  await Promise.race([
    Promise.all(
      imgs.map(async (img) => {
        const rawSrc = img.getAttribute('src') || img.currentSrc || img.src;
        if (rawSrc && !rawSrc.startsWith('data:')) {
          const absUrl = new URL(rawSrc, window.location.href).href;
          if (new URL(absUrl).origin === window.location.origin || absUrl.startsWith('blob:')) {
            const dataUrl = await fetchAsDataUrl(absUrl, 3000);
            if (dataUrl) {
              img.setAttribute('src', dataUrl);
            }
          }
        }

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
            // Ignore decode issues on SVGs / unsupported frames
          }
        }
      })
    ),
    new Promise<void>((r) => window.setTimeout(r, 3000)),
  ]);
}

async function waitForTwoFrames(): Promise<void> {
  await new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve());
    });
  });
}

async function waitForPaginationReady(container: HTMLElement, timeoutMs = 4000): Promise<void> {
  const startedAt = performance.now();
  while (performance.now() - startedAt < timeoutMs) {
    const paginated = container.querySelector('.official-report-pages-container');
    if (paginated && paginated.getAttribute('data-pagination-ready') === 'true') {
      return;
    }
    await new Promise<void>((r) => window.requestAnimationFrame(() => r()));
  }
  throw new Error('انتهت مهلة ترقيم صفحات التقرير الرسمية قبل تصدير PDF.');
}

function verifyCanvasHasExecutiveContent(canvas: HTMLCanvasElement, pageLabel: string): void {
  if (!canvas || canvas.width < 100 || canvas.height < 100) {
    throw new Error(`فشل التقاط صورة الصفحة (${pageLabel}): أبعاد الصورة غير صالحة.`);
  }

  const probeW = 220;
  const probeH = 160;
  const probeCanvas = document.createElement('canvas');
  probeCanvas.width = probeW;
  probeCanvas.height = probeH;
  const ctx = probeCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, probeW, probeH);
  ctx.drawImage(canvas, 0, 0, probeW, probeH);

  const countBandNonWhite = (yStartRatio: number, yEndRatio: number): number => {
    const y0 = Math.max(0, Math.floor(probeH * yStartRatio));
    const y1 = Math.min(probeH, Math.ceil(probeH * yEndRatio));
    const bandH = Math.max(1, y1 - y0);
    const data = ctx.getImageData(0, y0, probeW, bandH).data;
    let nonWhite = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      if (a > 20 && (r < 248 || g < 248 || b < 248)) {
        nonWhite++;
      }
    }
    return nonWhite;
  };

  const headerNonWhite = countBandNonWhite(0.01, 0.14);
  const bodyNonWhite = countBandNonWhite(0.16, 0.86);
  const footerNonWhite = countBandNonWhite(0.88, 0.99);

  if (headerNonWhite < 30 || bodyNonWhite < 60 || footerNonWhite < 20) {
    throw new Error(
      `فشل فحص المحتوى البصري للصفحة (${pageLabel}) — تم رصد ترويسة أو جسم أو تذييل فارغ.`
    );
  }
}

async function canvasToPngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => {
      if (b) resolve(b);
      else reject(new Error('تعذر تحويل صفحة التقرير إلى صورة PNG عالية الدقة.'));
    }, 'image/png');
  });
  return new Uint8Array(await blob.arrayBuffer());
}

async function validateGeneratedPdfBytes(params: {
  pdfBytes: Uint8Array;
  expectedPageCount: number;
  orientation: PdfOrientation;
  expectedReportNumber: string;
  expectedReportId?: string;
}): Promise<void> {
  const { pdfBytes, expectedPageCount, orientation, expectedReportNumber, expectedReportId } = params;

  if (!pdfBytes || pdfBytes.byteLength < MIN_VALID_PDF_BYTES) {
    throw new Error('ملف PDF الناتج أصغر من الحد الأدنى المعتمد (قد يكون فارغاً أو ناقصاً).');
  }

  // Verify %PDF- magic header
  if (
    pdfBytes[0] !== 0x25 || // %
    pdfBytes[1] !== 0x50 || // P
    pdfBytes[2] !== 0x44 || // D
    pdfBytes[3] !== 0x46 || // F
    pdfBytes[4] !== 0x2d // -
  ) {
    throw new Error('ترويسة الملف الناتج لا تطابق المعيار الرسمي (%PDF-).');
  }

  const parsedDoc = await PDFDocument.load(pdfBytes);
  const actualPages = parsedDoc.getPageCount();
  if (actualPages !== expectedPageCount || actualPages < 1) {
    throw new Error(
      `عدم تطابق عدد صفحات PDF الناتج (${actualPages}) مع صفحات المعاينة الرسمية (${expectedPageCount}).`
    );
  }

  const expectedDims = A4_POINTS[orientation];
  parsedDoc.getPages().forEach((page, idx) => {
    const { width, height } = page.getSize();
    if (
      Math.abs(width - expectedDims.width) > 2 ||
      Math.abs(height - expectedDims.height) > 2
    ) {
      throw new Error(
        `أبعاد صفحة PDF رقم ${idx + 1} غير مطابقة لمقاس A4 (${Math.round(width)}×${Math.round(height)}).`
      );
    }
  });

  const title = parsedDoc.getTitle() || '';
  const subject = parsedDoc.getSubject() || '';
  if (
    expectedReportNumber &&
    !title.includes(expectedReportNumber) &&
    !subject.includes(expectedReportNumber)
  ) {
    throw new Error('بيانات تعريف ملف PDF لا تطابق رقم التقرير المستهدف.');
  }
  if (expectedReportId && !subject.includes(expectedReportId)) {
    throw new Error('معرّف التقرير داخل ملف PDF لا يطابق السجل المحدد.');
  }
}

export function triggerDirectPdfDownload(blob: Blob, filename: string): void {
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

async function loadReportSnapshotBundle(params: {
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
      // Fallback below if version snapshot not found
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
    thresholds: bootstrapRes ? bootstrapRes.thresholds : liveData!.thresholds,
    snapshotVersion: versionNumber ?? null,
  });
}

async function capturePagesIntoA4Pdf(params: {
  pageElements: HTMLElement[];
  orientation: PdfOrientation;
  title: string;
  subject: string;
  expectedReportNumber: string;
  expectedReportId?: string;
}): Promise<Uint8Array> {
  const {
    pageElements,
    orientation,
    title,
    subject,
    expectedReportNumber,
    expectedReportId,
  } = params;

  const fontEmbedCSS = await resolveInlinedWebFontCss();
  const sheetDims = A4_SHEET_DIMENSIONS[orientation];
  const a4Dims = A4_POINTS[orientation];

  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(title);
  pdfDoc.setSubject(subject);
  pdfDoc.setAuthor('SAAED Facilities Management Department');
  pdfDoc.setCreator('SAAED Executive Reporting System');
  pdfDoc.setProducer('SAAED Direct A4 PDF Engine');
  pdfDoc.setCreationDate(new Date());
  pdfDoc.setModificationDate(new Date());

  for (let i = 0; i < pageElements.length; i++) {
    const pageEl = pageElements[i];
    const pageLabel = `${expectedReportNumber} — P${i + 1}/${pageElements.length}`;

    const rect = pageEl.getBoundingClientRect();
    const captureWidth = Math.max(sheetDims.width, Math.ceil(rect.width || pageEl.scrollWidth));
    const captureHeight = Math.max(
      Math.ceil(rect.height || pageEl.scrollHeight),
      sheetDims.height
    );

    const canvas = await domToCanvas(pageEl, {
      scale: 2,
      maximumCanvasSize: 4096,
      backgroundColor: '#ffffff',
      width: captureWidth,
      height: captureHeight,
      font: fontEmbedCSS ? { cssText: fontEmbedCSS } : undefined,
      style: {
        margin: '0',
        boxShadow: 'none',
        border: '0',
        borderRadius: '0',
      },
    });

    verifyCanvasHasExecutiveContent(canvas, pageLabel);

    const pngBytes = await canvasToPngBytes(canvas);
    const pngImage = await pdfDoc.embedPng(pngBytes);

    const pdfPage = pdfDoc.addPage([a4Dims.width, a4Dims.height]);
    const printableW = a4Dims.width - A4_MARGIN_PT * 2;
    const printableH = a4Dims.height - A4_MARGIN_PT * 2;

    const imgScale = Math.min(printableW / canvas.width, printableH / canvas.height);
    const drawW = canvas.width * imgScale;
    const drawH = canvas.height * imgScale;
    const x = A4_MARGIN_PT + (printableW - drawW) / 2;
    const y = A4_MARGIN_PT + (printableH - drawH) / 2;

    pdfPage.drawImage(pngImage, {
      x,
      y,
      width: drawW,
      height: drawH,
    });
  }

  const pdfBytes = await pdfDoc.save({ useObjectStreams: false });

  await validateGeneratedPdfBytes({
    pdfBytes,
    expectedPageCount: pageElements.length,
    orientation,
    expectedReportNumber,
    expectedReportId,
  });

  return pdfBytes;
}

/**
 * Generates and directly downloads an exact 1:1 A4 PDF matching OfficialReportLayout
 * cleanly without invoking window.print(), window.open(), or any print preview modal.
 */
export async function exportReportDirectPdf(params: {
  reportId: string;
  versionNumber?: number | null;
  orientation?: PdfOrientation;
  liveData?: DirectReportSnapshotData;
}): Promise<DirectPdfExportResult> {
  const { reportId, versionNumber, orientation = 'landscape', liveData } = params;
  const bundle = await loadReportSnapshotBundle({ reportId, versionNumber, liveData });

  const sheetDims = A4_SHEET_DIMENSIONS[orientation];
  const hostEl = document.createElement('div');
  hostEl.dir = 'rtl';
  hostEl.className = 'saaed-direct-pdf-host';
  hostEl.style.width = `${sheetDims.width}px`;
  hostEl.setAttribute('aria-hidden', 'true');
  document.body.appendChild(hostEl);

  let root: Root | null = null;
  try {
    root = createRoot(hostEl);
    root.render(
      React.createElement(OfficialReportLayout, {
        report: bundle.report,
        sites: bundle.sites,
        categories: bundle.categories,
        thresholds: bundle.thresholds,
        orientation,
        snapshotVersion: bundle.snapshotVersion ?? null,
        activePageFilter: 'all',
      })
    );

    await waitForPaginationReady(hostEl);
    await preloadAndWaitForMedia(hostEl);
    await waitForTwoFrames();

    const geometry = validateReportPagesGeometry(hostEl, orientation);
    if (!geometry.valid) {
      const summary = geometry.issues
        .slice(0, 3)
        .map((iss) => `ص${iss.pageNumber}: ${iss.metric} (${iss.actual} > ${iss.limit})`)
        .join(' | ');
      throw new Error(`فشل التحقق الهندسي من أبعاد صفحات التقرير قبل إنشاء PDF: ${summary}`);
    }

    const pageElements = Array.from(
      hostEl.querySelectorAll<HTMLElement>('.official-report-page')
    );
    if (pageElements.length === 0) {
      throw new Error('لم يتم العثور على أي صفحات صالحة داخل نموذج التقرير الرسمي.');
    }

    pageElements.forEach((pageEl, idx) => {
      const hasHeader = Boolean(pageEl.querySelector('.saaed-executive-header'));
      const hasBody = Boolean(pageEl.querySelector('.official-page-body'));
      const hasFooter = Boolean(pageEl.querySelector('.official-page-footer'));
      if (!hasHeader || !hasBody || !hasFooter) {
        throw new Error(`اكتمال البنية الهندسية للصفحة رقم ${idx + 1} غير مكتمل.`);
      }
    });

    const verNum = bundle.snapshotVersion ?? bundle.report.currentVersion;
    const pdfBytes = await capturePagesIntoA4Pdf({
      pageElements,
      orientation,
      title: `${bundle.report.reportNumber} — التقرير الشهري لقسم إدارة المرافق (v${verNum})`,
      subject: `SAAED FM Executive Report | ID:${bundle.report.id} | ${getMonthNameAr(bundle.report.month)} ${bundle.report.year}`,
      expectedReportNumber: bundle.report.reportNumber,
      expectedReportId: bundle.report.id,
    });

    const fallbackName = `SAAED_FM_Report_${reportId}.pdf`;
    const filename = sanitizeFilename(
      `${bundle.report.reportNumber}_v${verNum}.pdf`,
      fallbackName
    );
    const blob = new Blob([pdfBytes.slice().buffer], { type: 'application/pdf' });
    triggerDirectPdfDownload(blob, filename);

    return {
      filename,
      sizeBytes: blob.size,
      pageCount: pageElements.length,
      orientation,
      mode: 'download',
    };
  } finally {
    if (root) {
      try {
        root.unmount();
      } catch {
        // Ignore unmount error on cleanup
      }
    }
    hostEl.remove();
  }
}

export async function exportAnalyticsDirectPdf(params: {
  data: AnalyticsEngineOutput;
  orientation?: PdfOrientation;
}): Promise<DirectPdfExportResult> {
  const { data, orientation = 'landscape' } = params;
  const dims = A4_SHEET_DIMENSIONS[orientation];
  const hostEl = document.createElement('div');
  hostEl.dir = 'rtl';
  hostEl.className = 'saaed-direct-pdf-host';
  hostEl.style.width = `${dims.width}px`;
  hostEl.setAttribute('aria-hidden', 'true');
  document.body.appendChild(hostEl);

  let root: Root | null = null;
  try {
    const generatedStamp = formatDateTimeWestern(new Date().toISOString());
    root = createRoot(hostEl);
    root.render(
      React.createElement(AnalyticsDirectPrintDocument, {
        data,
        orientation,
        generatedStamp,
      })
    );

    await preloadAndWaitForMedia(hostEl);
    await waitForTwoFrames();

    const pageElements = Array.from(
      hostEl.querySelectorAll<HTMLElement>('.official-report-page')
    );
    if (pageElements.length === 0) {
      throw new Error('لم يتم العثور على صفحات التقرير التحليلي قبل إنشاء ملف PDF.');
    }

    const pdfBytes = await capturePagesIntoA4Pdf({
      pageElements,
      orientation,
      title: `SAAED_FM_Executive_Analytics — ${data.meta.scopeLabelAr}`,
      subject: `SAAED_FM_Executive_Analytics | ${data.meta.periodLabelAr}`,
      expectedReportNumber: 'SAAED_FM_Executive_Analytics',
    });

    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `SAAED_FM_Executive_Analytics_${stamp}.pdf`;
    const blob = new Blob([pdfBytes.slice().buffer], { type: 'application/pdf' });
    triggerDirectPdfDownload(blob, filename);

    return {
      filename,
      sizeBytes: blob.size,
      pageCount: pageElements.length,
      orientation,
      mode: 'download',
    };
  } finally {
    if (root) {
      try {
        root.unmount();
      } catch {
        // Ignore cleanup unmount errors
      }
    }
    hostEl.remove();
  }
}
