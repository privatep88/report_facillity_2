import React, { useEffect, useRef, useState } from 'react';
import { FileSpreadsheet, FileText, Loader2, Printer, ShieldAlert, X } from 'lucide-react';
import { useNotification } from '../../notifications/NotificationProvider.tsx';
import { prepareAndTriggerPrint } from '../../services/ReportExportService.ts';
import type { AnalyticsEngineOutput } from '../../services/AnalyticsEngineService.ts';
import {
  formatAed,
  formatDateTimeWestern,
  formatNumber,
  formatPct,
} from '../../utils/calculations.ts';
import { CorporateFooter } from '../CorporateFooter.tsx';
import { SaaedExecutiveHeader } from '../SaaedExecutiveHeader.tsx';

export const AnalyticsPrintModal: React.FC<{
  open: boolean;
  data: AnalyticsEngineOutput;
  onClose: () => void;
  onExportExcel: () => void;
  onExportPdf?: (orientation: 'landscape' | 'portrait') => Promise<void> | void;
  exportingPdf?: boolean;
  exportingExcel?: boolean;
}> = ({
  open,
  data,
  onClose,
  onExportExcel,
  onExportPdf,
  exportingPdf = false,
  exportingExcel = false,
}) => {
  const [orientation, setOrientation] = useState<'landscape' | 'portrait'>('landscape');
  const [zoom, setZoom] = useState<75 | 100 | 125>(100);
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

  const handlePrint = async () => {
    if (preparingPrint) return;
    setPreparingPrint(true);
    try {
      notifyInfo(
        'تم تجهيز التقرير التحليلي للطباعة',
        `التنسيق: ${orientation === 'landscape' ? 'A4 أفقي' : 'A4 عمودي'} · النطاق: ${data.meta.scopeLabelAr}`,
        { dedupeKey: `analytics_print_${orientation}`, context: 'print' }
      );
      await prepareAndTriggerPrint({ orientation, container: sheetRef.current });
    } finally {
      setPreparingPrint(false);
    }
  };

  const generatedStamp = formatDateTimeWestern(new Date().toISOString());

  return (
    <div
      dir="rtl"
      className="saaed-preview-scroll-host fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs overflow-y-auto"
    >
      {/* Toolbar */}
      <div className="no-print sticky top-0 z-50 bg-[#0B2341] text-white border-b border-[#C8A85D] px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold">معاينة التقرير التحليلي التنفيذي للإدارة العليا</p>
          <p className="text-[11px] text-[#F0D38C]">
            النطاق: {data.meta.scopeLabelAr} · {data.meta.periodLabelAr} ({formatNumber(data.meta.filteredReportsCount)} تقرير)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
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

          <div className="hidden md:flex items-center bg-white/10 rounded-lg p-0.5 text-xs" dir="ltr">
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
              {exportingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
              <span>{exportingPdf ? 'جارٍ إنشاء PDF...' : 'تصدير PDF'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={handlePrint}
            disabled={preparingPrint}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#1769AA] hover:bg-[#1e7bc7] disabled:opacity-60 text-white text-xs font-bold cursor-pointer whitespace-nowrap"
          >
            {preparingPrint ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
            <span>{preparingPrint ? 'جارٍ التجهيز...' : 'طباعة التقرير'}</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
          >
            <X className="w-4 h-4" />
            <span>العودة إلى التحليلات</span>
          </button>
        </div>
      </div>

      {/* Printable A4 Sheet */}
      <div
        className="saaed-preview-zoom-stage mx-auto my-6 origin-top transition-transform duration-150"
        style={
          zoom !== 100
            ? {
                transform: `scale(${zoom / 100})`,
                marginBottom: zoom > 100 ? '140px' : undefined,
              }
            : undefined
        }
      >
        <div
          ref={sheetRef}
          className={`saaed-preview-sheet mx-auto bg-white shadow-2xl border border-slate-200 ${
            orientation === 'landscape' ? 'max-w-[1180px]' : 'max-w-[850px]'
          }`}
        >
        <SaaedExecutiveHeader />

        {/* Analytical Scope Strip */}
        <div className="bg-[#F4F7FB] border-b border-slate-200 px-6 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-[#0B2341]">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-extrabold">مركز التحليل التنفيذي لإدارة المرافق</span>
            <span className="text-slate-300">|</span>
            <span className="font-semibold text-[#1769AA]">النطاق: {data.meta.scopeLabelAr}</span>
            <span className="text-slate-300">|</span>
            <span>الفترة: {data.meta.periodLabelAr}</span>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <span>
              التقارير المشمولة:{' '}
              <strong dir="ltr" className="tabular-nums">
                {formatNumber(data.meta.filteredReportsCount)}
              </strong>{' '}
              ({formatNumber(data.meta.approvedInScopeCount)} معتمد / {formatNumber(data.meta.draftInScopeCount)} مسودة)
            </span>
            <span>
              تاريخ الإصدار:{' '}
              <span dir="ltr" className="font-mono tabular-nums">
                {generatedStamp}
              </span>
            </span>
          </div>
        </div>

        <div className="p-6 space-y-5 text-[#0B2341]">
          {/* 1. Executive Snapshot KPIs */}
          <section className="print-section">
            <h2 className="text-sm font-bold border-b-2 border-[#C8A85D] pb-1.5 mb-3">
              1. الملخص التنفيذي والمؤشرات الحاكمة · Executive Performance Snapshot
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-lg border border-slate-200 bg-[#F4F7FB]">
                <p className="text-[11px] text-slate-600">الطلبات المستلمة / المنفذة</p>
                <p dir="ltr" className="text-base font-extrabold tabular-nums mt-1">
                  {formatNumber(data.snapshot.totalReceived)} / {formatNumber(data.snapshot.totalExecuted)}
                </p>
              </div>
              <div className="p-3 rounded-lg border border-slate-200 bg-[#F4F7FB]">
                <p className="text-[11px] text-slate-600">نسبة الإنجاز الكلية</p>
                <p dir="ltr" className="text-lg font-extrabold text-[#069B74] tabular-nums mt-1">
                  {formatPct(data.snapshot.overallCompletionPct, 'غير منطبق')}
                </p>
              </div>
              <div className="p-3 rounded-lg border border-slate-200 bg-[#F4F7FB]">
                <p className="text-[11px] text-slate-600">إجمالي أعطال الصيانة</p>
                <p dir="ltr" className="text-lg font-extrabold tabular-nums mt-1">
                  {formatNumber(data.snapshot.totalFaults)} عطل
                </p>
              </div>
              <div className="p-3 rounded-lg border border-slate-200 bg-[#F4F7FB]">
                <p className="text-[11px] text-slate-600">إجمالي التكاليف الفعلية (AED)</p>
                <p dir="ltr" className="text-base font-extrabold text-[#0B2341] tabular-nums mt-1">
                  {formatAed(data.snapshot.totalCostAed)}
                </p>
              </div>
            </div>
          </section>

          {/* 2. Services Table */}
          <section className="print-table-section">
            <h2 className="text-sm font-bold border-b-2 border-[#C8A85D] pb-1.5 mb-2">
              2. أداء الخدمات وكفاءة الإنجاز · Services &amp; Efficiency Summary
            </h2>
            <table className="w-full text-[11px] border border-slate-200">
              <thead className="bg-[#0B2341] text-white">
                <tr>
                  <th className="py-1.5 px-2 text-start">الخدمة</th>
                  <th className="py-1.5 px-2 text-center">المستلمة</th>
                  <th className="py-1.5 px-2 text-center">المنفذة</th>
                  <th className="py-1.5 px-2 text-center">الفجوة المتبقية</th>
                  <th className="py-1.5 px-2 text-center">الحصة %</th>
                  <th className="py-1.5 px-2 text-center">الإنجاز %</th>
                  <th className="py-1.5 px-2 text-center">المستوى</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {data.servicesAnalysis.rows.map((s) => (
                  <tr key={s.serviceId}>
                    <td className="py-1 px-2 font-semibold">{s.nameAr}</td>
                    <td dir="ltr" className="py-1 px-2 text-center tabular-nums">{formatNumber(s.receivedCount)}</td>
                    <td dir="ltr" className="py-1 px-2 text-center tabular-nums">{formatNumber(s.executedCount)}</td>
                    <td dir="ltr" className="py-1 px-2 text-center tabular-nums">{formatNumber(s.remainingGap)}</td>
                    <td dir="ltr" className="py-1 px-2 text-center tabular-nums">{formatPct(s.shareOfTotalPct, '0.0%')}</td>
                    <td dir="ltr" className="py-1 px-2 text-center font-bold tabular-nums">{formatPct(s.completionPct, 'غير منطبق')}</td>
                    <td className="py-1 px-2 text-center font-semibold">{s.level.labelAr}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* 3. Pareto & Sites + Financial Summary */}
          <section className="print-section grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h2 className="text-sm font-bold border-b-2 border-[#C8A85D] pb-1.5 mb-2">
                3. باريتو الأعطال والتكاليف (AED) · Fault Pareto &amp; Cost
              </h2>
              <table className="w-full text-[11px] border border-slate-200">
                <thead className="bg-[#0B2341] text-white">
                  <tr>
                    <th className="py-1.5 px-2 text-start">فئة الصيانة</th>
                    <th className="py-1.5 px-2 text-center">الأعطال</th>
                    <th className="py-1.5 px-2 text-center">التراكمي %</th>
                    <th className="py-1.5 px-2 text-center">التكلفة (AED)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {data.maintenanceAnalysis.paretoRows.slice(0, 8).map((p) => (
                    <tr key={p.categoryId}>
                      <td className="py-1 px-2 font-medium">{p.nameAr}</td>
                      <td dir="ltr" className="py-1 px-2 text-center tabular-nums">{formatNumber(p.faultCount)}</td>
                      <td dir="ltr" className="py-1 px-2 text-center tabular-nums">{p.cumulativePct.toFixed(1)}%</td>
                      <td dir="ltr" className="py-1 px-2 text-center tabular-nums font-semibold">{formatAed(p.totalCostAed)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div>
              <h2 className="text-sm font-bold border-b-2 border-[#C8A85D] pb-1.5 mb-2">
                4. العقود والسلامة والامتثال · Contracts &amp; Safety
              </h2>
              <table className="w-full text-[11px] border border-slate-200">
                <thead className="bg-[#0B2341] text-white">
                  <tr>
                    <th className="py-1.5 px-2 text-start">المجال</th>
                    <th className="py-1.5 px-2 text-center">فعال / مغلق</th>
                    <th className="py-1.5 px-2 text-center">غير فعال / مفتوح</th>
                    <th className="py-1.5 px-2 text-center">النسبة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {data.contractsAnalysis.groups.map((g) => (
                    <tr key={g.groupKey}>
                      <td className="py-1 px-2 font-medium">{g.nameAr}</td>
                      <td dir="ltr" className="py-1 px-2 text-center text-[#069B74] font-bold tabular-nums">{formatNumber(g.activeCount)}</td>
                      <td dir="ltr" className="py-1 px-2 text-center text-[#C43D47] font-bold tabular-nums">{formatNumber(g.inactiveCount)}</td>
                      <td dir="ltr" className="py-1 px-2 text-center tabular-nums">{formatPct(g.activePct, 'غير منطبق')}</td>
                    </tr>
                  ))}
                  <tr>
                    <td className="py-1 px-2 font-medium">جاهزية طفايات الحريق</td>
                    <td dir="ltr" className="py-1 px-2 text-center text-[#069B74] font-bold tabular-nums">{formatNumber(data.riskComplianceAnalysis.extinguishersActive)}</td>
                    <td dir="ltr" className="py-1 px-2 text-center text-[#C43D47] font-bold tabular-nums">{formatNumber(data.riskComplianceAnalysis.extinguishersInactive)}</td>
                    <td dir="ltr" className="py-1 px-2 text-center tabular-nums">{formatPct(data.riskComplianceAnalysis.extinguishersReadinessPct, 'غير منطبق')}</td>
                  </tr>
                  <tr>
                    <td className="py-1 px-2 font-medium">ملاحظات المخاطر</td>
                    <td dir="ltr" className="py-1 px-2 text-center text-[#069B74] font-bold tabular-nums">{formatNumber(data.riskComplianceAnalysis.hazardsClosed)}</td>
                    <td dir="ltr" className="py-1 px-2 text-center text-[#C43D47] font-bold tabular-nums">{formatNumber(data.riskComplianceAnalysis.hazardsOpen)}</td>
                    <td dir="ltr" className="py-1 px-2 text-center tabular-nums">{formatPct(data.riskComplianceAnalysis.hazardsClosurePct, 'غير منطبق')}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* 5. Early Warnings & Recommendations */}
          <section className="print-table-section space-y-3">
            <h2 className="text-sm font-bold border-b-2 border-[#C8A85D] pb-1.5">
              5. مؤشرات الإنذار المبكر والتوصيات التنفيذية · Warnings &amp; Executive Decisions
            </h2>
            {data.earlyWarnings.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {data.earlyWarnings.map((w) => (
                  <div
                    key={w.id}
                    className="p-2.5 rounded-lg border border-amber-300 bg-amber-50/70 text-[11px]"
                  >
                    <p className="font-bold text-[#0B2341] flex items-center gap-1.5">
                      <ShieldAlert className="w-3.5 h-3.5 text-[#C43D47] shrink-0" />
                      <span>{w.title}</span>
                    </p>
                    <p className="font-bold text-[#C43D47] mt-0.5">{w.metricDisplay}</p>
                    <p className="text-slate-600 mt-0.5">{w.comparisonText}</p>
                  </div>
                ))}
              </div>
            )}

            <table className="w-full text-[11px] border border-slate-200">
              <thead className="bg-[#0B2341] text-white">
                <tr>
                  <th className="py-1.5 px-2 text-center w-24">الأولوية</th>
                  <th className="py-1.5 px-2 text-start">التوصية والدليل الرقمي</th>
                  <th className="py-1.5 px-2 text-start">الإجراء المقترح والجهة المسؤولة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {data.recommendations.map((rec) => (
                  <tr key={rec.id}>
                    <td className="py-1.5 px-2 text-center font-bold">{rec.priorityLabelAr}</td>
                    <td className="py-1.5 px-2">
                      <p className="font-bold text-[#0B2341]">{rec.title}</p>
                      <p className="text-slate-600 mt-0.5">{rec.evidenceText}</p>
                    </td>
                    <td className="py-1.5 px-2">
                      <p>{rec.actionText}</p>
                      <p className="text-[10px] text-[#1769AA] font-semibold mt-0.5">
                        الجهة: {rec.owner} · المؤشر: {rec.suggestedKpi}
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>

        <CorporateFooter />
        </div>
      </div>
    </div>
  );
};
