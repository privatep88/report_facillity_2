import React, { useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { FileSpreadsheet, Printer, ShieldCheck, X } from 'lucide-react';
import type {
  MaintenanceCategory,
  MaintenanceSite,
  MonthlyReportFull,
  PerformanceThresholds,
} from '../types/report.ts';
import { STATUS_LABELS_AR, STATUS_LABELS_EN, TASK_STATUS_LABELS_AR } from '../types/report.ts';
import {
  computeReportMetrics,
  formatAed,
  formatDateWestern,
  formatDecimalFixed,
  formatNumber,
  formatPct,
  formatPercentage,
  getMonthNameAr,
  getMonthNameEn,
} from '../utils/calculations.ts';
import { getServiceVisual } from '../utils/serviceVisuals.tsx';
import { CorporateFooter } from './CorporateFooter.tsx';
import { SaaedExecutiveHeader } from './SaaedExecutiveHeader.tsx';

export const ExecutivePreviewModal: React.FC<{
  open: boolean;
  report: MonthlyReportFull;
  sites: MaintenanceSite[];
  categories: MaintenanceCategory[];
  thresholds: PerformanceThresholds;
  onClose: () => void;
  onExportExcel: () => void;
  snapshotVersion?: number | null;
}> = ({ open, report, sites, categories, thresholds, onClose, onExportExcel, snapshotVersion }) => {
  const [orientation, setOrientation] = useState<'landscape' | 'portrait'>('landscape');

  if (!open) return null;

  const metrics = computeReportMetrics(report, sites, categories, thresholds);
  const activeServicesForChart = metrics.servicesWithMetrics.filter((s) => s.receivedCount > 0);
  const isApprovedOrArchived = report.status === 'approved' || report.status === 'archived';
  const sortedRequestsByService = [...metrics.servicesWithMetrics].sort(
    (a, b) => b.receivedCount - a.receivedCount
  );
  const sortedSummary = [...metrics.servicesWithMetrics].sort((a, b) => {
    const sa = report.services.find((x) => x.serviceId === a.serviceId)?.summaryOrder ?? 99;
    const sb = report.services.find((x) => x.serviceId === b.serviceId)?.summaryOrder ?? 99;
    return sa - sb;
  });

  const handlePrint = () => {
    const styleEl = document.createElement('style');
    styleEl.id = 'saaed-print-orientation';
    styleEl.textContent = `@media print { @page { size: A4 ${orientation}; margin: 10mm; } }`;
    document.head.appendChild(styleEl);
    window.print();
    setTimeout(() => {
      styleEl.remove();
    }, 500);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-xs overflow-y-auto print:static print:bg-white print:p-0">
      {/* Preview Toolbar (hidden when printing) */}
      <div className="no-print sticky top-0 z-50 bg-[#0B2341] text-white border-b border-[#C8A85D] px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold">معاينة التقرير الرسمي للإدارة العليا</span>
          {snapshotVersion && (
            <span className="text-xs font-mono text-[#C8A85D]">نسخة معتمدة ثابتة v{snapshotVersion}</span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center bg-white/10 rounded-lg p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setOrientation('landscape')}
              className={`px-3 py-1 rounded-md font-semibold cursor-pointer ${
                orientation === 'landscape' ? 'bg-[#C8A85D] text-[#0B2341]' : 'text-slate-200'
              }`}
            >
              A4 أفقي
            </button>
            <button
              type="button"
              onClick={() => setOrientation('portrait')}
              className={`px-3 py-1 rounded-md font-semibold cursor-pointer ${
                orientation === 'portrait' ? 'bg-[#C8A85D] text-[#0B2341]' : 'text-slate-200'
              }`}
            >
              A4 عمودي
            </button>
          </div>

          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#1769AA] hover:bg-[#1e7bc7] text-white text-xs font-bold cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>طباعة التقرير</span>
          </button>

          <button
            type="button"
            onClick={onExportExcel}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#069B74] hover:bg-[#058261] text-white text-xs font-bold cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>تصدير Excel</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold cursor-pointer"
          >
            <X className="w-4 h-4" />
            <span>إغلاق</span>
          </button>
        </div>
      </div>

      {/* Formal Printable Sheet Container */}
      <div
        className={`mx-auto my-6 bg-white shadow-2xl border border-slate-200 print:shadow-none print:border-0 print:my-0 print:w-full ${
          orientation === 'landscape' ? 'max-w-[1200px]' : 'max-w-[850px]'
        }`}
      >
        {/* Official Layered Executive Header (Selectable HTML Text in Preview & PDF) */}
        <SaaedExecutiveHeader />

        {/* Official Print Metadata Strip (below banner so zero overlap with master graphic) */}
        <div className="bg-[#F4F7FB] border-b border-slate-200 px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs text-[#0B2341]">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-bold">{report.company}</span>
            <span className="text-slate-300">|</span>
            <span className="font-semibold text-[#1769AA]">
              شهر {getMonthNameAr(report.month)} <span dir="ltr" className="tabular-nums">{report.year}</span> ({getMonthNameEn(report.month)}{' '}
              <span dir="ltr" className="tabular-nums">{report.year}</span>)
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <span>
              رقم التقرير:{' '}
              <span className="font-mono font-bold text-[#0B2341] tabular-nums" dir="ltr">
                {report.reportNumber}
              </span>
            </span>
            <span>
              الحالة: <span className="font-bold">{STATUS_LABELS_AR[report.status]} ({STATUS_LABELS_EN[report.status]})</span>
            </span>
            <span>
              الإصدار:{' '}
              <span className="font-mono font-bold tabular-nums" dir="ltr">
                v{snapshotVersion || report.currentVersion}
              </span>
            </span>
            <span>التصنيف: {report.classification}</span>
          </div>
        </div>

        <div className="p-6 space-y-6 text-[#0B2341]">
          {/* 1. Executive Summary */}
          <section className="print-section">
            <h2 className="text-sm font-bold text-[#0B2341] border-b-2 border-[#C8A85D] pb-1.5 mb-3">
              1. الملخص التنفيذي · Executive Summary
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-lg border border-slate-200 bg-[#F4F7FB]">
                <p className="text-[11px] text-slate-600">إجمالي الطلبات المستلمة</p>
                <p className="text-xl font-extrabold tabular-nums mt-1" dir="ltr">
                  {formatNumber(metrics.totalReceived)}
                </p>
              </div>
              <div className="p-3 rounded-lg border border-slate-200 bg-[#F4F7FB]">
                <p className="text-[11px] text-slate-600">الخدمة الأعلى طلباً</p>
                <p className="text-sm font-bold mt-1">
                  {metrics.topService
                    ? `${metrics.topService.nameAr} (${formatNumber(metrics.topService.receivedCount)})`
                    : 'لا تتوفر بيانات كافية'}
                </p>
              </div>
              <div className="p-3 rounded-lg border border-slate-200 bg-[#F4F7FB]">
                <p className="text-[11px] text-slate-600">إجمالي الخدمات</p>
                <p className="text-xl font-extrabold tabular-nums mt-1" dir="ltr">
                  {formatNumber(metrics.activeServicesCount)}
                </p>
              </div>
              <div className="p-3 rounded-lg border border-slate-200 bg-[#F4F7FB]">
                <p className="text-[11px] text-slate-600">نسبة الإنجاز الكلية</p>
                <p className="text-xl font-extrabold tabular-nums text-[#069B74] mt-1" dir="ltr">
                  {formatPct(metrics.overallCompletionPct)}
                </p>
              </div>
            </div>
          </section>

          {/* 2. Performance Overview */}
          <section className="print-section grid grid-cols-1 md:grid-cols-12 gap-4">
            <div className="md:col-span-7">
              <h2 className="text-sm font-bold border-b-2 border-[#C8A85D] pb-1.5 mb-2.5">
                2. الطلبات حسب الخدمة · Requests by Service
              </h2>
              <table className="requests-by-service-table w-full text-xs border border-slate-200 table-fixed">
                <colgroup>
                  <col style={{ width: '60%' }} />
                  <col style={{ width: '20%' }} />
                  <col style={{ width: '20%' }} />
                </colgroup>
                <thead className="bg-[#0B2341] text-white">
                  <tr>
                    <th className="py-1 px-2 text-start font-bold text-[11.5px]">الخدمة</th>
                    <th className="py-1 px-2 text-center font-bold text-[11.5px]">العدد</th>
                    <th className="py-1 px-2 text-center font-bold text-[11.5px]">التوزيع النسبي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {sortedRequestsByService.map((s) => (
                    <tr key={s.serviceId} className="h-[30px]">
                      <td className="py-0.5 px-2 font-medium align-middle text-[11.5px] truncate">{s.nameAr}</td>
                      <td className="py-0.5 px-2 text-center align-middle">
                        <output
                          dir="ltr"
                          className="service-count-display service-count-box"
                        >
                          {formatNumber(s.receivedCount)}
                        </output>
                      </td>
                      <td className="py-0.5 px-2 text-center align-middle tabular-nums font-semibold text-[11.5px]" dir="ltr">
                        {formatPct(s.shareOfTotalPct, '0.0%')}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-[#EAF4FC] font-bold">
                  <tr>
                    <td className="py-1 px-2 text-[11.5px]">الإجمالي · Total</td>
                    <td className="py-1 px-2 text-center tabular-nums font-bold text-[#0B2341] text-[11.5px]" dir="ltr">
                      {formatNumber(metrics.totalReceived)}
                    </td>
                    <td className="py-1 px-2 text-center tabular-nums text-[11.5px]" dir="ltr">
                      {metrics.totalReceived > 0 ? formatPercentage(100) : '0.0%'}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="md:col-span-5 border border-slate-200 rounded-lg p-3 flex flex-col justify-center items-center">
              <h3 className="text-xs font-bold text-[#0B2341] mb-2">توزيع الأداء · Performance Distribution</h3>
              {activeServicesForChart.length > 0 ? (
                <div className="w-full h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={activeServicesForChart}
                        dataKey="receivedCount"
                        nameKey="nameAr"
                        innerRadius={45}
                        outerRadius={75}
                        paddingAngle={2}
                      >
                        {activeServicesForChart.map((d, i) => (
                          <Cell
                            key={d.serviceId}
                            fill={getServiceVisual(d.serviceId, d.nameAr, i).color}
                          />
                        ))}
                      </Pie>
                      <Tooltip formatter={(val) => [`${formatNumber(Number(val ?? 0))} طلب`, 'العدد']} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-xs text-slate-500 py-14 text-center">لا تتوفر طلبات مسجلة لعرض التوزيع النسبي</p>
              )}
            </div>
          </section>

          {/* 3. Services Summary */}
          <section className="print-table-section">
            <h2 className="text-sm font-bold border-b-2 border-[#C8A85D] pb-1.5 mb-2.5">
              3. ملخص الخدمات · Services Summary
            </h2>
            <table className="w-full text-xs border border-slate-200">
              <thead className="bg-[#0B2341] text-white">
                <tr>
                  <th className="py-1.5 px-2 text-center">#</th>
                  <th className="py-1.5 px-2 text-start">الخدمة</th>
                  <th className="py-1.5 px-2 text-center">المستلمة</th>
                  <th className="py-1.5 px-2 text-center">المنفذة</th>
                  <th className="py-1.5 px-2 text-center">النسبة</th>
                  <th className="py-1.5 px-2 text-center">المستوى</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {sortedSummary.map((s, idx) => (
                  <tr key={s.serviceId}>
                    <td className="py-1 px-2 text-center tabular-nums" dir="ltr">{formatNumber(idx + 1)}</td>
                    <td className="py-1 px-2 font-medium">{s.nameAr}</td>
                    <td className="py-1 px-2 text-center tabular-nums" dir="ltr">{formatNumber(s.receivedCount)}</td>
                    <td className="py-1 px-2 text-center tabular-nums" dir="ltr">{formatNumber(s.executedCount)}</td>
                    <td className="py-1 px-2 text-center font-semibold tabular-nums" dir="ltr">{formatPct(s.completionPct, '—')}</td>
                    <td className="py-1 px-2 text-center font-semibold">{s.level.labelAr}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-[#EAF4FC] font-bold">
                <tr>
                  <td colSpan={2} className="py-1.5 px-2">
                    الإجمالي · Total
                  </td>
                  <td className="py-1.5 px-2 text-center tabular-nums" dir="ltr">{formatNumber(metrics.totalReceived)}</td>
                  <td className="py-1.5 px-2 text-center tabular-nums" dir="ltr">{formatNumber(metrics.totalExecuted)}</td>
                  <td className="py-1.5 px-2 text-center tabular-nums" dir="ltr">{formatPct(metrics.overallCompletionPct, '—')}</td>
                  <td className="py-1.5 px-2 text-center">—</td>
                </tr>
              </tfoot>
            </table>
          </section>

          {/* 4 & 5. Contracts & Safety */}
          <section className="print-section grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h2 className="text-sm font-bold border-b-2 border-[#C8A85D] pb-1.5 mb-2.5">
                4. العقود والرخص · Contracts &amp; Licenses
              </h2>
              <table className="w-full text-xs border border-slate-200">
                <thead className="bg-[#0B2341] text-white">
                  <tr>
                    <th className="py-1.5 px-2 text-start">الفئة</th>
                    <th className="py-1.5 px-2 text-center">الفعالة</th>
                    <th className="py-1.5 px-2 text-center">غير الفعالة</th>
                    <th className="py-1.5 px-2 text-start">الملاحظات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {report.contracts.map((c) => (
                    <tr key={c.groupKey}>
                      <td className="py-1.5 px-2 font-semibold">{c.nameAr}</td>
                      <td className="py-1.5 px-2 text-center font-bold text-[#069B74] tabular-nums" dir="ltr">
                        {formatNumber(c.activeCount)}
                      </td>
                      <td className="py-1.5 px-2 text-center font-bold text-[#C43D47] tabular-nums" dir="ltr">
                        {formatNumber(c.inactiveCount)}
                      </td>
                      <td className="py-1.5 px-2 whitespace-pre-wrap">{c.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div>
              <h2 className="text-sm font-bold border-b-2 border-[#C8A85D] pb-1.5 mb-2.5">
                5. الطفايات وملاحظات المخاطر · Safety &amp; Hazards
              </h2>
              <table className="w-full text-xs border border-slate-200">
                <thead className="bg-[#0B2341] text-white">
                  <tr>
                    <th className="py-1.5 px-2 text-start">البند</th>
                    <th className="py-1.5 px-2 text-center">فعالة / مغلقة</th>
                    <th className="py-1.5 px-2 text-center">غير فعالة / غير مغلقة</th>
                    <th className="py-1.5 px-2 text-start">الملاحظات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {report.safety.map((s) => (
                    <tr key={s.groupKey}>
                      <td className="py-1.5 px-2 font-semibold">{s.nameAr}</td>
                      <td className="py-1.5 px-2 text-center font-bold text-[#069B74] tabular-nums" dir="ltr">
                        {formatNumber(s.primaryCount)}
                      </td>
                      <td className="py-1.5 px-2 text-center font-bold text-[#C43D47] tabular-nums" dir="ltr">
                        {formatNumber(s.secondaryCount)}
                      </td>
                      <td className="py-1.5 px-2 whitespace-pre-wrap">{s.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* 6. Maintenance Matrix */}
          <section className="print-table-section">
            <h2 className="text-sm font-bold border-b-2 border-[#C8A85D] pb-1.5 mb-2.5">
              6. تفاصيل الصيانة حسب المقرات والتكاليف · Maintenance Details
            </h2>
            <div className="w-full">
              {(() => {
                const siteColPct = 14;
                const totalColPct = 8.8;
                const catCount = categories.length || 1;
                const catColPct = Number(((100 - siteColPct - totalColPct) / catCount).toFixed(3));
                return (
                  <table className="w-full text-[11px] border border-slate-200 table-fixed border-collapse">
                    <colgroup>
                      <col style={{ width: `${siteColPct}%` }} />
                      {categories.map((c) => (
                        <col key={c.id} style={{ width: `${catColPct}%` }} />
                      ))}
                      <col style={{ width: `${totalColPct}%` }} />
                    </colgroup>
                    <thead className="bg-[#0B2341] text-white">
                      <tr>
                        <th className="py-2 px-1.5 text-start font-bold text-[11px] truncate">المقر / البيان</th>
                        {categories.map((cat) => (
                          <th
                            key={cat.id}
                            className="py-1.5 px-0.5 text-center font-bold text-[10px] leading-[1.15] break-words"
                            title={cat.nameAr}
                          >
                            <span className="block max-h-[2.4em] overflow-hidden leading-tight">
                              {cat.nameAr}
                            </span>
                          </th>
                        ))}
                        <th className="py-2 px-1 text-center font-bold text-[11px] truncate">الإجمالي</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {sites.map((site) => (
                        <tr key={site.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-1 px-1.5 font-semibold text-slate-800 text-[11px] truncate" title={site.nameAr}>
                            {site.nameAr}
                          </td>
                          {categories.map((cat) => (
                            <td key={cat.id} className="py-1 px-0.5 text-center tabular-nums text-slate-700 text-[11px] truncate" dir="ltr">
                              {formatNumber(report.maintenanceMatrix[site.id]?.[cat.id] ?? 0)}
                            </td>
                          ))}
                          <td className="py-1 px-1 text-center font-bold tabular-nums text-[#0B2341] bg-slate-50 text-[11px] truncate" dir="ltr">
                            {formatNumber(metrics.maintenance.siteTotals[site.id] ?? 0)}
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-[#EAF4FC] font-bold border-t-2 border-[#C5D8EE]">
                        <td className="py-1.5 px-1.5 text-slate-900 text-[11px] truncate">إجمالي الأعطال</td>
                        {categories.map((cat) => (
                          <td key={cat.id} className="py-1.5 px-0.5 text-center tabular-nums text-slate-900 text-[11px] truncate" dir="ltr">
                            {formatNumber(metrics.maintenance.categoryTotals[cat.id] ?? 0)}
                          </td>
                        ))}
                        <td className="py-1.5 px-1 text-center tabular-nums text-emerald-700 font-extrabold text-[11.5px] truncate" dir="ltr">
                          {formatNumber(metrics.maintenance.grandTotalFaults)}
                        </td>
                      </tr>
                      <tr className="bg-white">
                        <td className="py-1.5 px-1.5 font-semibold text-slate-800 text-[10.5px] truncate" title="التكلفة / النثرية (AED)">
                          التكلفة / النثرية (AED)
                        </td>
                        {categories.map((cat) => (
                          <td key={cat.id} className="py-1.5 px-0.5 text-center tabular-nums text-slate-600 text-[10.5px] truncate" dir="ltr">
                            {formatDecimalFixed(report.maintenanceCosts[cat.id]?.pettyCashAed ?? 0)}
                          </td>
                        ))}
                        <td className="py-1.5 px-1 text-center font-bold tabular-nums text-[#0B2341] text-[10.5px] truncate" dir="ltr">
                          {formatAed(metrics.maintenance.pettyCashTotalAed)}
                        </td>
                      </tr>
                      <tr className="bg-slate-50/50">
                        <td className="py-1.5 px-1.5 font-semibold text-slate-800 text-[10.5px] truncate" title="التكلفة / أمر شراء (AED)">
                          التكلفة / أمر شراء (AED)
                        </td>
                        {categories.map((cat) => (
                          <td key={cat.id} className="py-1.5 px-0.5 text-center tabular-nums text-slate-600 text-[10.5px] truncate" dir="ltr">
                            {formatDecimalFixed(report.maintenanceCosts[cat.id]?.purchaseOrderAed ?? 0)}
                          </td>
                        ))}
                        <td className="py-1.5 px-1 text-center font-bold tabular-nums text-[#0B2341] text-[10.5px] truncate" dir="ltr">
                          {formatAed(metrics.maintenance.purchaseOrderTotalAed)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                );
              })()}
            </div>
          </section>

          {/* 7, 8, 9. Maintenance Services, Logistics & Security */}
          <section className="print-section grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h2 className="text-sm font-bold border-b-2 border-[#C8A85D] pb-1.5 mb-2">
                7. خدمات الصيانة · Maintenance Services
              </h2>
              <table className="w-full text-xs border border-slate-200 mb-4">
                <tbody className="divide-y divide-slate-200">
                  <tr>
                    <td className="py-1.5 px-2">عدد طلبات الصيانة الواردة من قسم المرافق</td>
                    <td className="py-1.5 px-2 text-center font-bold tabular-nums" dir="ltr">
                      {formatNumber(report.maintenanceServices.fromFacilitiesDept)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1.5 px-2">عدد طلبات الصيانة الواردة من الإدارات الأخرى</td>
                    <td className="py-1.5 px-2 text-center font-bold tabular-nums" dir="ltr">
                      {formatNumber(report.maintenanceServices.fromOtherDepts)}
                    </td>
                  </tr>
                  <tr className="bg-[#EAF4FC] font-bold">
                    <td className="py-1.5 px-2">الإجمالي · Total</td>
                    <td className="py-1.5 px-2 text-center tabular-nums" dir="ltr">
                      {formatNumber(metrics.maintenanceServicesTotal)}
                    </td>
                  </tr>
                </tbody>
              </table>

              <h2 className="text-sm font-bold border-b-2 border-[#C8A85D] pb-1.5 mb-2">
                8. الدعم اللوجستي · Logistics
              </h2>
              <table className="w-full text-xs border border-slate-200">
                <thead className="bg-[#0B2341] text-white">
                  <tr>
                    <th className="py-1.5 px-2 text-start">القناة</th>
                    <th className="py-1.5 px-2 text-center">الطلبات</th>
                    <th className="py-1.5 px-2 text-center">النسبة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {metrics.logisticsWithPct.map((l) => (
                    <tr key={l.channelKey}>
                      <td className="py-1 px-2 font-medium">{l.nameAr}</td>
                      <td className="py-1 px-2 text-center tabular-nums" dir="ltr">{formatNumber(l.requestCount)}</td>
                      <td className="py-1 px-2 text-center tabular-nums" dir="ltr">{formatPct(l.sharePct, '0.0%')}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-[#EAF4FC] font-bold">
                  <tr>
                    <td className="py-1.5 px-2">الإجمالي</td>
                    <td className="py-1.5 px-2 text-center tabular-nums" dir="ltr">{formatNumber(metrics.logisticsTotal)}</td>
                    <td className="py-1.5 px-2 text-center tabular-nums" dir="ltr">
                      {metrics.logisticsTotal > 0 ? formatPercentage(100) : '—'}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div>
              <h2 className="text-sm font-bold border-b-2 border-[#C8A85D] pb-1.5 mb-2">
                9. خدمات الأمن والاستقبال · Security &amp; Reception
              </h2>
              <table className="w-full text-xs border border-slate-200">
                <thead className="bg-[#0B2341] text-white">
                  <tr>
                    <th className="py-1.5 px-2 text-start">البيان / النشاط</th>
                    <th className="py-1.5 px-2 text-center">المستلمة</th>
                    <th className="py-1.5 px-2 text-center">المنفذة</th>
                    <th className="py-1.5 px-2 text-center">الإنجاز</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {metrics.securityWithPct.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-3 px-2 text-center text-slate-400">
                        لا توجد أعمدة بيان مسجلة في خدمات الأمن والاستقبال
                      </td>
                    </tr>
                  ) : (
                    metrics.securityWithPct.map((sr) => (
                      <tr key={sr.activityKey}>
                        <td className="py-1.5 px-2 font-medium">{sr.nameAr}</td>
                        <td className="py-1.5 px-2 text-center tabular-nums">{formatNumber(sr.receivedCount)}</td>
                        <td className="py-1.5 px-2 text-center tabular-nums">{formatNumber(sr.executedCount)}</td>
                        <td className="py-1.5 px-2 text-center font-semibold tabular-nums">
                          {formatPct(sr.completionPct, '—')}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot className="bg-[#EAF4FC] font-bold">
                  <tr>
                    <td className="py-1.5 px-2">
                      الإجمالي (<span dir="ltr" className="tabular-nums">{formatNumber(metrics.securityWithPct.length)}</span>)
                    </td>
                    <td className="py-1.5 px-2 text-center tabular-nums" dir="ltr">
                      {formatNumber(metrics.securityTotals.totalReceived)}
                    </td>
                    <td className="py-1.5 px-2 text-center tabular-nums" dir="ltr">
                      {formatNumber(metrics.securityTotals.totalExecuted)}
                    </td>
                    <td className="py-1.5 px-2 text-center tabular-nums" dir="ltr">
                      {formatPct(metrics.securityTotals.overallCompletionPct, '—')}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>

          {/* 10. Tasks */}
          <section className="print-table-section">
            <h2 className="text-sm font-bold border-b-2 border-[#C8A85D] pb-1.5 mb-2.5">
              10. المهام التشغيلية · Tasks &amp; Progress
            </h2>
            <table className="w-full text-xs border border-slate-200">
              <thead className="bg-[#0B2341] text-white">
                <tr>
                  <th className="py-1.5 px-2 text-center w-10">#</th>
                  <th className="py-1.5 px-2 text-start">الموضوع</th>
                  <th className="py-1.5 px-2 text-start">المهمة</th>
                  <th className="py-1.5 px-2 text-center">الحالة</th>
                  <th className="py-1.5 px-2 text-center">نسبة الإنجاز</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {report.tasks.map((t, idx) => (
                  <tr key={t.id}>
                    <td className="py-1.5 px-2 text-center tabular-nums" dir="ltr">{formatNumber(idx + 1)}</td>
                    <td className="py-1.5 px-2 whitespace-pre-wrap">{t.topic || '—'}</td>
                    <td className="py-1.5 px-2 whitespace-pre-wrap">{t.taskName || '—'}</td>
                    <td className="py-1.5 px-2 text-center">{TASK_STATUS_LABELS_AR[t.status]}</td>
                    <td className="py-1.5 px-2 text-center tabular-nums font-bold" dir="ltr">
                      {formatPercentage(t.completionPct)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* 11. Challenges & Recommendations (Full Unwrapped Text) */}
          <section className="print-table-section">
            <h2 className="text-sm font-bold border-b-2 border-[#C8A85D] pb-1.5 mb-2.5">
              11. التحديات والتوصيات · Challenges &amp; Recommendations
            </h2>
            <table className="w-full text-xs border border-slate-200">
              <thead className="bg-[#0B2341] text-white">
                <tr>
                  <th className="py-1.5 px-2 text-center w-10">#</th>
                  <th className="py-1.5 px-2 text-start w-1/4">التحديات والعوائق</th>
                  <th className="py-1.5 px-2 text-start w-2/5">التحديث</th>
                  <th className="py-1.5 px-2 text-start w-1/3">التوصية</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {report.challenges.map((ch, idx) => (
                  <tr key={ch.id}>
                    <td className="py-2 px-2 text-center tabular-nums align-top" dir="ltr">{formatNumber(idx + 1)}</td>
                    <td className="py-2 px-2 whitespace-pre-wrap leading-relaxed align-top">{ch.challengeText || '—'}</td>
                    <td className="py-2 px-2 whitespace-pre-wrap leading-relaxed align-top">{ch.updateText || '—'}</td>
                    <td className="py-2 px-2 whitespace-pre-wrap leading-relaxed align-top font-semibold">
                      {ch.recommendationText || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* 12. Preparation & Approval Signatures */}
          <section className="print-section">
            <h2 className="text-sm font-bold border-b-2 border-[#C8A85D] pb-1.5 mb-3">
              12. الإعداد والمراجعة والاعتماد · Preparation &amp; Approval
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-4 rounded-lg border border-slate-200 bg-[#F4F7FB]">
                <p className="font-bold text-[#C8A85D] mb-1">الإعداد · Preparation</p>
                <p className="font-bold text-sm">{report.preparerName || '—'}</p>
                <p className="text-slate-600">{report.preparerTitle || '—'}</p>
                <p className="mt-2 text-slate-600">
                  تاريخ التقديم:{' '}
                  <span dir="ltr" className="font-mono tabular-nums">
                    {formatDateWestern(report.preparedAt, 'قيد الإعداد')}
                  </span>
                </p>
                <p className="mt-1 font-mono text-[11px] text-[#1769AA]">
                  التوقيع الإلكتروني: <span dir="ltr">{report.preparerSignatureHash || 'غير موثق بعد'}</span>
                </p>
                {report.preparerSignatureImage && (
                  <div className="mt-3 pt-2 border-t border-slate-200 bg-white rounded-md p-2 flex items-center justify-center h-20">
                    <img
                      src={report.preparerSignatureImage}
                      alt={`توقيع ${report.preparerName || 'معد التقرير'}`}
                      className="max-h-16 max-w-full object-contain"
                    />
                  </div>
                )}
              </div>

              <div className="p-4 rounded-lg border border-slate-200 bg-[#F4F7FB]">
                <p className="font-bold text-[#1769AA] mb-1">المراجعة والاعتماد · Review &amp; Approval</p>
                <p className="font-bold text-sm">{report.approverName || '—'}</p>
                <p className="text-slate-600">{report.approverTitle || '—'}</p>
                <p className="mt-2 text-slate-600">
                  تاريخ الاعتماد:{' '}
                  <span dir="ltr" className="font-mono tabular-nums">
                    {formatDateWestern(report.approvedAt, 'بانتظار الاعتماد')}
                  </span>
                </p>
                <p className="mt-1 font-mono text-[11px] text-[#069B74]">
                  التوقيع الإلكتروني: <span dir="ltr">{report.approverSignatureHash || 'بانتظار الاعتماد الرسمي'}</span>
                </p>
                {report.approverSignatureImage && (
                  <div className="mt-3 pt-2 border-t border-slate-200 bg-white rounded-md p-2 flex items-center justify-center h-20">
                    <img
                      src={report.approverSignatureImage}
                      alt={`توقيع ${report.approverName || 'المعتمد'}`}
                      className="max-h-16 max-w-full object-contain"
                    />
                  </div>
                )}
              </div>
            </div>

            {isApprovedOrArchived && (
              <div className="mt-4 p-3 rounded-lg bg-emerald-50 border border-[#069B74] flex items-center justify-center gap-2 text-xs font-bold text-[#069B74]">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>«هذا التقرير معتمد ومراجع وفقاً للسياسات والإجراءات المعمول بها في قسم إدارة المرافق»</span>
              </div>
            )}
          </section>
        </div>

        {/* Official Layered Executive Footer (Selectable HTML Text in Preview & PDF) */}
        <CorporateFooter />
      </div>
    </div>
  );
};
