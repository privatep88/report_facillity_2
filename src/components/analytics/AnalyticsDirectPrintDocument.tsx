import React from 'react';
import type { AnalyticsEngineOutput } from '../../services/AnalyticsEngineService.ts';
import type { PdfOrientation } from '../../services/DirectReportPdfExportService.ts';
import {
  formatAed,
  formatNumber,
  formatPct,
} from '../../utils/calculations.ts';
import { CorporateFooter } from '../CorporateFooter.tsx';
import { A4_SHEET_DIMENSIONS } from '../OfficialReportLayout.tsx';
import { SaaedExecutiveHeader } from '../SaaedExecutiveHeader.tsx';

export const AnalyticsDirectPrintDocument: React.FC<{
  data: AnalyticsEngineOutput;
  orientation: PdfOrientation;
  generatedStamp: string;
}> = ({ data, orientation, generatedStamp }) => {
  const dims = A4_SHEET_DIMENSIONS[orientation];
  const pageClass =
    orientation === 'landscape'
      ? 'official-report-page--landscape'
      : 'official-report-page--portrait';
  const isPortrait = orientation === 'portrait';

  return (
    <div className="official-report-pages-container">
      {/* Page 1: Snapshot KPIs + Services & Efficiency Summary */}
      <article
        data-page-number={1}
        style={{ width: `${dims.width}px`, minHeight: `${dims.height}px` }}
        className={`saaed-preview-sheet official-report-page ${pageClass} bg-white flex flex-col justify-between box-border`}
      >
        <div className="official-page-header shrink-0">
          <SaaedExecutiveHeader />
          <div className="bg-[#F4F7FB] border-b border-[#C5D8EE] px-4 py-1.5 flex items-center justify-between text-[10px] text-[#012E5E]">
            <div className="flex items-center gap-2">
              <span className="font-extrabold">مركز التحليل التنفيذي لإدارة المرافق</span>
              <span className="text-slate-300">|</span>
              <span className="font-semibold text-[#1769AA]">النطاق: {data.meta.scopeLabelAr}</span>
              <span className="text-slate-300">|</span>
              <span>الفترة: {data.meta.periodLabelAr}</span>
            </div>
            <div className="flex items-center gap-3 font-mono tabular-nums" dir="ltr">
              <span>{data.meta.filteredReportsCount} Reports</span>
              <span>•</span>
              <span>{generatedStamp}</span>
            </div>
          </div>
        </div>

        <div className={`official-page-body flex-1 ${isPortrait ? 'p-4 space-y-4' : 'p-4 space-y-3'} text-[#012E5E]`}>
          <section>
            <h2 className="text-xs font-extrabold border-b-2 border-[#C99E4A] pb-1 mb-2">
              1. الملخص التنفيذي والمؤشرات الحاكمة · Executive Performance Snapshot
            </h2>
            <div className="grid grid-cols-4 gap-2.5">
              <div className="p-2.5 rounded-lg border border-slate-200 bg-[#F4F7FB]">
                <p className="text-[10px] text-slate-600 font-bold">الطلبات المستلمة / المنفذة</p>
                <p dir="ltr" className="text-sm font-black tabular-nums mt-0.5 text-[#012E5E]">
                  {formatNumber(data.snapshot.totalReceived)} / {formatNumber(data.snapshot.totalExecuted)}
                </p>
              </div>
              <div className="p-2.5 rounded-lg border border-slate-200 bg-[#F4F7FB]">
                <p className="text-[10px] text-slate-600 font-bold">نسبة الإنجاز الكلية</p>
                <p dir="ltr" className="text-sm font-black text-[#069B74] tabular-nums mt-0.5">
                  {formatPct(data.snapshot.overallCompletionPct, 'غير منطبق')}
                </p>
              </div>
              <div className="p-2.5 rounded-lg border border-slate-200 bg-[#F4F7FB]">
                <p className="text-[10px] text-slate-600 font-bold">إجمالي أعطال الصيانة</p>
                <p dir="ltr" className="text-sm font-black tabular-nums mt-0.5 text-[#012E5E]">
                  {formatNumber(data.snapshot.totalFaults)} عطل
                </p>
              </div>
              <div className="p-2.5 rounded-lg border border-slate-200 bg-[#F4F7FB]">
                <p className="text-[10px] text-slate-600 font-bold">إجمالي التكاليف الفعلية (AED)</p>
                <p dir="ltr" className="text-sm font-black text-[#012E5E] tabular-nums mt-0.5">
                  {formatAed(data.snapshot.totalCostAed)}
                </p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-xs font-extrabold border-b-2 border-[#C99E4A] pb-1 mb-2">
              2. أداء الخدمات وكفاءة الإنجاز · Services &amp; Efficiency Summary
            </h2>
            <table className="w-full text-[10px] border border-slate-200 border-collapse">
              <thead className="bg-[#012E5E] text-white">
                <tr>
                  <th className="py-1.5 px-2 text-start">الخدمة</th>
                  <th className="py-1.5 px-2 text-center">المستلمة</th>
                  <th className="py-1.5 px-2 text-center">المنفذة</th>
                  <th className="py-1.5 px-2 text-center">الفجوة</th>
                  <th className="py-1.5 px-2 text-center">الحصة %</th>
                  <th className="py-1.5 px-2 text-center">الإنجاز %</th>
                  <th className="py-1.5 px-2 text-center">المستوى</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {data.servicesAnalysis.rows.map((s, idx) => (
                  <tr key={s.serviceId} className={idx % 2 === 1 ? 'bg-[#F7FAFC]' : 'bg-white'}>
                    <td className="py-1 px-2 font-bold">{s.nameAr}</td>
                    <td dir="ltr" className="py-1 px-2 text-center tabular-nums">{formatNumber(s.receivedCount)}</td>
                    <td dir="ltr" className="py-1 px-2 text-center tabular-nums">{formatNumber(s.executedCount)}</td>
                    <td dir="ltr" className="py-1 px-2 text-center tabular-nums">{formatNumber(s.remainingGap)}</td>
                    <td dir="ltr" className="py-1 px-2 text-center tabular-nums">{formatPct(s.shareOfTotalPct, '0.0%')}</td>
                    <td dir="ltr" className="py-1 px-2 text-center font-extrabold tabular-nums">{formatPct(s.completionPct, '—')}</td>
                    <td className="py-1 px-2 text-center font-bold">{s.level.labelAr}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>

        <div className="official-page-footer mt-auto shrink-0">
          <CorporateFooter />
        </div>
      </article>

      {/* Page 2: Fault Pareto + Contracts & Safety + Executive Recommendations */}
      <article
        data-page-number={2}
        style={{ width: `${dims.width}px`, minHeight: `${dims.height}px` }}
        className={`saaed-preview-sheet official-report-page ${pageClass} bg-white flex flex-col justify-between box-border`}
      >
        <div className="official-page-header shrink-0">
          <SaaedExecutiveHeader />
        </div>

        <div className={`official-page-body flex-1 ${isPortrait ? 'p-4 space-y-4' : 'p-4 space-y-3'} text-[#012E5E]`}>
          <section className="grid grid-cols-2 gap-3">
            <div>
              <h2 className="text-xs font-extrabold border-b-2 border-[#C99E4A] pb-1 mb-1.5">
                3. باريتو الأعطال والتكاليف (AED) · Fault Pareto &amp; Cost
              </h2>
              <table className="w-full text-[9.5px] border border-slate-200 border-collapse">
                <thead className="bg-[#012E5E] text-white">
                  <tr>
                    <th className="py-1 px-2 text-start">فئة الصيانة</th>
                    <th className="py-1 px-1.5 text-center">الأعطال</th>
                    <th className="py-1 px-1.5 text-center">التراكمي %</th>
                    <th className="py-1 px-1.5 text-center">التكلفة (AED)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {data.maintenanceAnalysis.paretoRows.slice(0, 8).map((p, idx) => (
                    <tr key={p.categoryId} className={idx % 2 === 1 ? 'bg-[#F7FAFC]' : 'bg-white'}>
                      <td className="py-1 px-2 font-bold">{p.nameAr}</td>
                      <td dir="ltr" className="py-1 px-1.5 text-center tabular-nums">{formatNumber(p.faultCount)}</td>
                      <td dir="ltr" className="py-1 px-1.5 text-center tabular-nums">{p.cumulativePct.toFixed(1)}%</td>
                      <td dir="ltr" className="py-1 px-1.5 text-center tabular-nums font-bold">{formatAed(p.totalCostAed)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div>
              <h2 className="text-xs font-extrabold border-b-2 border-[#C99E4A] pb-1 mb-1.5">
                4. العقود والسلامة والامتثال · Contracts &amp; Safety
              </h2>
              <table className="w-full text-[9.5px] border border-slate-200 border-collapse">
                <thead className="bg-[#012E5E] text-white">
                  <tr>
                    <th className="py-1 px-2 text-start">المجال</th>
                    <th className="py-1 px-1.5 text-center">فعال / مغلق</th>
                    <th className="py-1 px-1.5 text-center">غير فعال / مفتوح</th>
                    <th className="py-1 px-1.5 text-center">النسبة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {data.contractsAnalysis.groups.map((g) => (
                    <tr key={g.groupKey}>
                      <td className="py-1 px-2 font-bold">{g.nameAr}</td>
                      <td dir="ltr" className="py-1 px-1.5 text-center text-[#069B74] font-bold tabular-nums">{formatNumber(g.activeCount)}</td>
                      <td dir="ltr" className="py-1 px-1.5 text-center text-[#C43D47] font-bold tabular-nums">{formatNumber(g.inactiveCount)}</td>
                      <td dir="ltr" className="py-1 px-1.5 text-center tabular-nums">{formatPct(g.activePct, '—')}</td>
                    </tr>
                  ))}
                  <tr>
                    <td className="py-1 px-2 font-bold">جاهزية طفايات الحريق</td>
                    <td dir="ltr" className="py-1 px-1.5 text-center text-[#069B74] font-bold tabular-nums">{formatNumber(data.riskComplianceAnalysis.extinguishersActive)}</td>
                    <td dir="ltr" className="py-1 px-1.5 text-center text-[#C43D47] font-bold tabular-nums">{formatNumber(data.riskComplianceAnalysis.extinguishersInactive)}</td>
                    <td dir="ltr" className="py-1 px-1.5 text-center tabular-nums">{formatPct(data.riskComplianceAnalysis.extinguishersReadinessPct, '—')}</td>
                  </tr>
                  <tr>
                    <td className="py-1 px-2 font-bold">ملاحظات المخاطر</td>
                    <td dir="ltr" className="py-1 px-1.5 text-center text-[#069B74] font-bold tabular-nums">{formatNumber(data.riskComplianceAnalysis.hazardsClosed)}</td>
                    <td dir="ltr" className="py-1 px-1.5 text-center text-[#C43D47] font-bold tabular-nums">{formatNumber(data.riskComplianceAnalysis.hazardsOpen)}</td>
                    <td dir="ltr" className="py-1 px-1.5 text-center tabular-nums">{formatPct(data.riskComplianceAnalysis.hazardsClosurePct, '—')}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="text-xs font-extrabold border-b-2 border-[#C99E4A] pb-1">
              5. التوصيات التنفيذية ومؤشرات القرار · Executive Recommendations
            </h2>
            <table className="w-full text-[9.5px] border border-slate-200 border-collapse">
              <thead className="bg-[#012E5E] text-white">
                <tr>
                  <th className="py-1 px-2 text-center w-20">الأولوية</th>
                  <th className="py-1 px-2 text-start">التوصية والدليل الرقمي</th>
                  <th className="py-1 px-2 text-start">الإجراء المقترح والجهة المسؤولة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {data.recommendations.slice(0, 6).map((rec) => (
                  <tr key={rec.id}>
                    <td className="py-1 px-2 text-center font-bold">{rec.priorityLabelAr}</td>
                    <td className="py-1 px-2">
                      <p className="font-bold text-[#012E5E]">{rec.title}</p>
                      <p className="text-slate-600">{rec.evidenceText}</p>
                    </td>
                    <td className="py-1 px-2">
                      <p>{rec.actionText}</p>
                      <p className="text-[9px] text-[#1769AA] font-semibold">
                        الجهة: {rec.owner} · المؤشر: {rec.suggestedKpi}
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>

        <div className="official-page-footer mt-auto shrink-0">
          <CorporateFooter />
        </div>
      </article>
    </div>
  );
};
