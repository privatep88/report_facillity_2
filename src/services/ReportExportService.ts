import { getStoredToken } from '../api/client.ts';

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
}

export async function exportReportPdf(params: {
  reportId: string;
  versionNumber?: number | null;
  orientation?: 'landscape' | 'portrait';
}): Promise<ExportResult> {
  const { reportId, versionNumber, orientation = 'landscape' } = params;
  const qs = new URLSearchParams();
  if (versionNumber) qs.set('version', String(versionNumber));
  if (orientation) qs.set('orientation', orientation);

  const url = `/api/reports/${encodeURIComponent(reportId)}/export/pdf?${qs.toString()}`;
  const token = getStoredToken();
  const res = await fetch(url, {
    credentials: 'include',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });

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
  return { filename, sizeBytes: blob.size };
}

export async function exportReportExcel(params: {
  reportId: string;
  versionNumber?: number | null;
}): Promise<ExportResult> {
  const { reportId, versionNumber } = params;
  const url = versionNumber
    ? `/api/reports/${encodeURIComponent(reportId)}/export/excel?version=${versionNumber}`
    : `/api/reports/${encodeURIComponent(reportId)}/export/excel`;
  const token = getStoredToken();
  const res = await fetch(url, {
    credentials: 'include',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });

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
  const token = getStoredToken();
  const res = await fetch('/api/analytics/export/pdf', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ filters, orientation }),
  });

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
  const token = getStoredToken();
  const res = await fetch('/api/analytics/export/excel', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ filters }),
  });

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

/**
 * Waits for web fonts (Cairo / IBM Plex) and all rendered images/signatures to finish decoding
 * before triggering browser print with exact A4 orientation styling.
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

  const root = container || document;
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

  const styleId = 'saaed-dynamic-print-page-style';
  document.getElementById(styleId)?.remove();
  const styleEl = document.createElement('style');
  styleEl.id = styleId;
  styleEl.textContent = `@media print { @page { size: A4 ${orientation}; margin: 8mm 8mm 10mm 8mm; } }`;
  document.head.appendChild(styleEl);

  const cleanup = () => {
    styleEl.remove();
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);

  window.requestAnimationFrame(() => {
    window.print();
    window.setTimeout(cleanup, 1200);
  });
}
