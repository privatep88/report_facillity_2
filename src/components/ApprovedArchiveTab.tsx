import React, { useMemo, useState } from 'react';
import {
  Archive,
  CheckCircle2,
  Download,
  Eye,
  FileSpreadsheet,
  History,
  Layers,
  Printer,
  Search,
  ShieldCheck,
} from 'lucide-react';
import type { ReportListSummary } from '../types/report.ts';
import { REPORT_STATUSES, STATUS_LABELS_AR } from '../types/report.ts';
import { formatDateWestern, formatNumber, formatPct, getMonthNameAr } from '../utils/calculations.ts';

interface ApprovedArchiveTabProps {
  reports: ReportListSummary[];
  onPreviewSnapshot: (reportId: string, versionNumber: number) => void;
  onViewHistory: (reportId: string) => void;
  onExportExcel: (reportId: string, versionNumber: number) => void;
  onDownloadJson: (reportId: string, versionNumber: number) => void;
}

export const ApprovedArchiveTab: React.FC<ApprovedArchiveTabProps> = ({
  reports,
  onPreviewSnapshot,
  onViewHistory,
  onExportExcel,
  onDownloadJson,
}) => {
  const [search, setSearch] = useState('');
  const [yearFilter, setYearFilter] = useState<string>('all');
  const [monthFilter, setMonthFilter] = useState<string>('all');
  const [preparerFilter, setPreparerFilter] = useState<string>('all');
  const [approverFilter, setApproverFilter] = useState<string>('all');

  // STRICT RULE: Archive shows ONLY Approved & Archived reports (never Drafts or Under Review!)
  const approvedOnly = useMemo(
    () =>
      reports.filter(
        (r) => r.status === REPORT_STATUSES.APPROVED || r.status === REPORT_STATUSES.ARCHIVED
      ),
    [reports]
  );

  const currentYear = new Date().getFullYear();
  const years = useMemo(() => Array.from(new Set(approvedOnly.map((r) => r.year))).sort((a, b) => b - a), [approvedOnly]);
  const preparers = useMemo(
    () => Array.from(new Set(approvedOnly.map((r) => r.preparerName).filter(Boolean))),
    [approvedOnly]
  );
  const approvers = useMemo(
    () => Array.from(new Set(approvedOnly.map((r) => r.approverName).filter(Boolean))),
    [approvedOnly]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return approvedOnly.filter((r) => {
      if (yearFilter !== 'all' && r.year !== Number(yearFilter)) return false;
      if (monthFilter !== 'all' && r.month !== Number(monthFilter)) return false;
      if (preparerFilter !== 'all' && r.preparerName !== preparerFilter) return false;
      if (approverFilter !== 'all' && r.approverName !== approverFilter) return false;
      if (q) {
        const hay = `${r.reportNumber} ${getMonthNameAr(r.month)} ${r.year} ${r.preparerName} ${r.approverName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [approvedOnly, search, yearFilter, monthFilter, preparerFilter, approverFilter]);

  const kpis = useMemo(() => {
    const totalApproved = approvedOnly.length;
    const currentYearCount = approvedOnly.filter((r) => r.year === currentYear).length;
    const latest = approvedOnly[0] ?? null;
    const readyToArchive = approvedOnly.filter((r) => r.status === REPORT_STATUSES.APPROVED).length;
    const totalVersions = approvedOnly.reduce((acc, r) => acc + Math.max(1, r.versionCount), 0);
    return { totalApproved, currentYearCount, latest, readyToArchive, totalVersions };
  }, [approvedOnly, currentYear]);

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* 5 Archive KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
            <span>إجمالي التقارير المعتمدة</span>
            <ShieldCheck className="w-4 h-4 text-[#069B74]" />
          </div>
          <p className="text-2xl font-extrabold text-[#0B2341] tabular-nums mt-2" dir="ltr">
            {formatNumber(kpis.totalApproved)}
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
            <span>تقارير السنة الحالية (<span dir="ltr" className="tabular-nums">{currentYear}</span>)</span>
            <CheckCircle2 className="w-4 h-4 text-[#1769AA]" />
          </div>
          <p className="text-2xl font-extrabold text-[#0B2341] tabular-nums mt-2" dir="ltr">
            {formatNumber(kpis.currentYearCount)}
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
            <span>آخر تقرير معتمد</span>
            <Archive className="w-4 h-4 text-[#C8A85D]" />
          </div>
          <p className="text-sm font-extrabold text-[#0B2341] mt-2 truncate">
            {kpis.latest ? `${getMonthNameAr(kpis.latest.month)} ${kpis.latest.year}` : 'لا يوجد بعد'}
          </p>
          <p className="text-[11px] font-mono text-slate-400 tabular-nums" dir="ltr">{kpis.latest?.reportNumber ?? '—'}</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
            <span>المتاحة للأرشفة</span>
            <Archive className="w-4 h-4 text-[#1769AA]" />
          </div>
          <p className="text-2xl font-extrabold text-[#0B2341] tabular-nums mt-2" dir="ltr">
            {formatNumber(kpis.readyToArchive)}
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
            <span>إجمالي الإصدارات المعتمدة</span>
            <Layers className="w-4 h-4 text-[#0B2341]" />
          </div>
          <p className="text-2xl font-extrabold text-[#0B2341] tabular-nums mt-2" dir="ltr">
            {formatNumber(kpis.totalVersions)}
          </p>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-extrabold text-[#0B2341]">أرشيف التقارير المعتمدة رسمياً</h2>
            <p className="text-xs text-slate-500">
              يحتوي الأرشيف على النسخ المعتمدة والمؤرشفة الثابتة فقط؛ تُحفظ البيانات المطابقة تماماً للحظة الاعتماد.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
            <input
              type="text"
              placeholder="بحث برقم التقرير أو الاسم..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pr-9 pl-3 py-2 rounded-lg border border-slate-200 bg-[#F4F7FB] focus:border-[#1769AA] focus:outline-none"
            />
          </div>

          <select
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-200 bg-[#F4F7FB] font-semibold"
          >
            <option value="all">كل السنوات</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>

          <select
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-200 bg-[#F4F7FB] font-semibold"
          >
            <option value="all">كل الأشهر</option>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {getMonthNameAr(m)}
              </option>
            ))}
          </select>

          <select
            value={preparerFilter}
            onChange={(e) => setPreparerFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-200 bg-[#F4F7FB] font-semibold"
          >
            <option value="all">جميع المعدّين</option>
            {preparers.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>

          <select
            value={approverFilter}
            onChange={(e) => setApproverFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-200 bg-[#F4F7FB] font-semibold"
          >
            <option value="all">جميع المعتمدين</option>
            {approvers.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>

        {/* Archive Table */}
        <div className="overflow-x-auto fm-scroll border border-slate-200 rounded-xl">
          <table className="w-full text-xs sm:text-sm min-w-[960px]">
            <thead className="bg-[#0B2341] text-white">
              <tr>
                <th className="py-2.5 px-3 text-start">رقم التقرير</th>
                <th className="py-2.5 px-3 text-center">الشهر / السنة</th>
                <th className="py-2.5 px-3 text-center">تاريخ الإعداد</th>
                <th className="py-2.5 px-3 text-start">معد التقرير</th>
                <th className="py-2.5 px-3 text-start">المعتمد</th>
                <th className="py-2.5 px-3 text-center">تاريخ الاعتماد</th>
                <th className="py-2.5 px-3 text-center">الإصدار</th>
                <th className="py-2.5 px-3 text-center">الإنجاز</th>
                <th className="py-2.5 px-3 text-center">الحالة</th>
                <th className="py-2.5 px-3 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-14 text-center text-slate-500">
                    لا توجد تقارير معتمدة في الأرشيف مطابقة للمعايير الحالية. يتم إظهار التقارير فور اكتمال دورة اعتمادها رسمياً.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-[#F4F7FB]">
                    <td className="py-2.5 px-3 font-mono font-bold text-[#0B2341] tabular-nums" dir="ltr">{r.reportNumber}</td>
                    <td className="py-2.5 px-3 text-center font-semibold">
                      {getMonthNameAr(r.month)} <span dir="ltr" className="tabular-nums">{r.year}</span>
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono text-xs text-slate-600 tabular-nums" dir="ltr">
                      {formatDateWestern(r.preparedAt)}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-[#0B2341]">{r.preparerName || '—'}</td>
                    <td className="py-2.5 px-3 font-semibold text-[#069B74]">{r.approverName || '—'}</td>
                    <td className="py-2.5 px-3 text-center font-mono text-xs text-slate-600 tabular-nums" dir="ltr">
                      {formatDateWestern(r.approvedAt)}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono font-bold tabular-nums" dir="ltr">v{r.currentVersion}</td>
                    <td className="py-2.5 px-3 text-center tabular-nums text-xs">
                      <span dir="ltr">{formatNumber(r.totalReceived)}</span> طلب · <span dir="ltr">{formatPct(r.completionRate, '—')}</span>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span
                        className={`inline-block px-2.5 py-1 rounded-md text-[11px] font-bold ${
                          r.status === REPORT_STATUSES.ARCHIVED
                            ? 'bg-[#0B2341] text-[#C8A85D]'
                            : 'bg-emerald-50 text-[#069B74]'
                        }`}
                      >
                        {STATUS_LABELS_AR[r.status]}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onPreviewSnapshot(r.id, r.currentVersion)}
                          title="معاينة وطباعة النسخة المعتمدة"
                          className="p-1.5 rounded-lg bg-[#EAF4FC] text-[#1769AA] hover:bg-[#1769AA] hover:text-white transition-colors cursor-pointer"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onPreviewSnapshot(r.id, r.currentVersion)}
                          title="طباعة التقرير"
                          className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-[#0B2341] hover:bg-slate-50 transition-colors cursor-pointer"
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onExportExcel(r.id, r.currentVersion)}
                          title="تصدير Excel"
                          className="p-1.5 rounded-lg bg-emerald-50 text-[#069B74] hover:bg-[#069B74] hover:text-white transition-colors cursor-pointer"
                        >
                          <FileSpreadsheet className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDownloadJson(r.id, r.currentVersion)}
                          title="تنزيل نسخة أرشيفية معتمدة"
                          className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-[#0B2341] transition-colors cursor-pointer"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onViewHistory(r.id)}
                          title="عرض سجل الاعتماد والتدقيق"
                          className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-[#1769AA] transition-colors cursor-pointer"
                        >
                          <History className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
