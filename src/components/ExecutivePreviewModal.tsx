import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  FileText,
  Layers,
  Loader2,
  Printer,
  X,
} from 'lucide-react';
import { useNotification } from '../notifications/NotificationProvider.tsx';
import { prepareAndTriggerPrint } from '../services/ReportExportService.ts';
import type {
  MaintenanceCategory,
  MaintenanceSite,
  MonthlyReportFull,
  PerformanceThresholds,
} from '../types/report.ts';
import { formatNumber } from '../utils/calculations.ts';
import {
  OFFICIAL_REPORT_TOTAL_PAGES,
  OfficialReportLayout,
} from './OfficialReportLayout.tsx';

export const ExecutivePreviewModal: React.FC<{
  open: boolean;
  report: MonthlyReportFull;
  sites: MaintenanceSite[];
  categories: MaintenanceCategory[];
  thresholds: PerformanceThresholds;
  onClose: () => void;
  onExportExcel: () => void;
  onExportPdf?: (orientation: 'landscape' | 'portrait') => Promise<void> | void;
  exportingPdf?: boolean;
  exportingExcel?: boolean;
  snapshotVersion?: number | null;
}> = ({
  open,
  report,
  sites,
  categories,
  thresholds,
  onClose,
  onExportExcel,
  onExportPdf,
  exportingPdf = false,
  exportingExcel = false,
  snapshotVersion,
}) => {
  const [orientation, setOrientation] = useState<'landscape' | 'portrait'>('landscape');
  const [zoom, setZoom] = useState<75 | 100 | 125>(100);
  const [activePage, setActivePage] = useState<number | 'all'>('all');
  const [preparingPrint, setPreparingPrint] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const { notifyInfo } = useNotification();

  useEffect(() => {
    if (!open) return;
    document.body.classList.add('saaed-printing-modal');
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.classList.remove('saaed-printing-modal');
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  const jumpToPage = (page: number | 'all') => {
    setActivePage(page);
    if (page !== 'all') {
      window.setTimeout(() => {
        const el = document.getElementById(`official-report-page-${page}`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 40);
    }
  };

  const handlePrint = async () => {
    if (preparingPrint) return;
    setPreparingPrint(true);
    const previousPage = activePage;
    try {
      if (activePage !== 'all') {
        setActivePage('all');
        await new Promise((r) => window.setTimeout(r, 120));
      }
      notifyInfo(
        'جارٍ تجهيز التقرير الرسمي بكامل البطاقات والصور والجداول...',
        `التقرير ${report.reportNumber} · التنسيق: ${
          orientation === 'landscape' ? 'A4 أفقي' : 'A4 عمودي'
        }.`,
        {
          dedupeKey: `print_prep_${report.id}_${orientation}`,
          context: 'print',
        }
      );
      await prepareAndTriggerPrint({ orientation, container: sheetRef.current });
    } finally {
      setActivePage(previousPage);
      setPreparingPrint(false);
    }
  };

  return (
    <div
      dir="rtl"
      className="saaed-preview-scroll-host fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs overflow-y-auto"
    >
      {/* Preview Toolbar (hidden when printing) */}
      <div className="no-print sticky top-0 z-50 bg-[#0B2341] text-white border-b-2 border-[#C8A85D] px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-lg">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-extrabold">
            معاينة التقرير الرسمي الكامل (مطابق 100% للتقرير الشهري)
          </span>
          {snapshotVersion ? (
            <span className="text-xs font-mono text-[#C8A85D] bg-white/10 px-2 py-0.5 rounded" dir="ltr">
              v{snapshotVersion} · نسخة معتمدة ثابتة
            </span>
          ) : (
            <span className="text-xs text-sky-200">
              {orientation === 'landscape'
                ? 'تنسيق A4 أفقي (297×210 مم) · 5 صفحات رسمية'
                : 'تنسيق A4 عمودي (210×297 مم) · 5 صفحات رسمية'}
            </span>
          )}
        </div>

        {/* Page Navigation Bar */}
        <div className="flex flex-wrap items-center gap-1.5 bg-white/10 rounded-lg p-1 text-xs">
          <button
            type="button"
            onClick={() => jumpToPage('all')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-bold cursor-pointer transition-colors ${
              activePage === 'all'
                ? 'bg-[#C8A85D] text-[#0B2341]'
                : 'text-slate-200 hover:bg-white/10'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>كل الصفحات ({formatNumber(OFFICIAL_REPORT_TOTAL_PAGES)})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              const cur = activePage === 'all' ? 1 : activePage;
              jumpToPage(Math.max(1, cur - 1));
            }}
            title="الصفحة السابقة"
            className="p-1 rounded hover:bg-white/10 text-slate-200 cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          {[1, 2, 3, 4, 5].map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => jumpToPage(p)}
              className={`w-6 h-6 rounded-md font-extrabold tabular-nums cursor-pointer transition-colors ${
                activePage === p
                  ? 'bg-white text-[#0B2341]'
                  : 'text-slate-200 hover:bg-white/10'
              }`}
              dir="ltr"
            >
              {p}
            </button>
          ))}

          <button
            type="button"
            onClick={() => {
              const cur = activePage === 'all' ? 1 : activePage;
              jumpToPage(Math.min(OFFICIAL_REPORT_TOTAL_PAGES, cur + 1));
            }}
            title="الصفحة التالية"
            className="p-1 rounded hover:bg-white/10 text-slate-200 cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Orientation Switch */}
          <div className="flex items-center bg-white/10 rounded-lg p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setOrientation('landscape')}
              className={`px-3 py-1 rounded-md font-semibold cursor-pointer whitespace-nowrap ${
                orientation === 'landscape' ? 'bg-[#C8A85D] text-[#0B2341]' : 'text-slate-200'
              }`}
            >
              A4 أفقي
            </button>
            <button
              type="button"
              onClick={() => setOrientation('portrait')}
              className={`px-3 py-1 rounded-md font-semibold cursor-pointer whitespace-nowrap ${
                orientation === 'portrait' ? 'bg-[#C8A85D] text-[#0B2341]' : 'text-slate-200'
              }`}
            >
              A4 عمودي
            </button>
          </div>

          {/* Screen Zoom Switch (neutralized during print) */}
          <div
            className="hidden md:flex items-center bg-white/10 rounded-lg p-0.5 text-xs"
            dir="ltr"
          >
            {([75, 100, 125] as const).map((z) => (
              <button
                key={z}
                type="button"
                onClick={() => setZoom(z)}
                className={`px-2 py-1 rounded-md font-bold cursor-pointer ${
                  zoom === z ? 'bg-white text-[#0B2341]' : 'text-slate-200 hover:text-white'
                }`}
              >
                {z}%
              </button>
            ))}
          </div>

          {onExportPdf && (
            <button
              type="button"
              onClick={() => onExportPdf(orientation)}
              disabled={exportingPdf}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#C99E4A] hover:bg-[#b58a37] disabled:opacity-60 text-[#0B2341] text-xs font-extrabold cursor-pointer whitespace-nowrap"
            >
              {exportingPdf ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileText className="w-4 h-4" />
              )}
              <span>{exportingPdf ? 'جارٍ إنشاء PDF...' : 'تصدير PDF'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={handlePrint}
            disabled={preparingPrint}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#1769AA] hover:bg-[#1e7bc7] disabled:opacity-60 text-white text-xs font-bold cursor-pointer whitespace-nowrap"
          >
            {preparingPrint ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Printer className="w-4 h-4" />
            )}
            <span>{preparingPrint ? 'جارٍ التجهيز...' : 'طباعة التقرير'}</span>
          </button>

          <button
            type="button"
            onClick={onExportExcel}
            disabled={exportingExcel}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#069B74] hover:bg-[#058261] disabled:opacity-60 text-white text-xs font-bold cursor-pointer whitespace-nowrap"
          >
            {exportingExcel ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="w-4 h-4" />
            )}
            <span>{exportingExcel ? 'جارٍ التصدير...' : 'تصدير Excel'}</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
          >
            <X className="w-4 h-4" />
            <span>العودة إلى التقرير</span>
          </button>
        </div>
      </div>

      {/* Formal Printable Sheet Container (with optional screen zoom) */}
      <div
        ref={sheetRef}
        className="saaed-preview-zoom-stage mx-auto my-6 px-2 sm:px-4 origin-top transition-transform duration-150"
        style={
          zoom !== 100
            ? {
                transform: `scale(${zoom / 100})`,
                marginBottom: zoom > 100 ? '180px' : undefined,
              }
            : undefined
        }
      >
        <OfficialReportLayout
          report={report}
          sites={sites}
          categories={categories}
          thresholds={thresholds}
          orientation={orientation}
          snapshotVersion={snapshotVersion}
          activePageFilter={activePage}
        />
      </div>
    </div>
  );
};
