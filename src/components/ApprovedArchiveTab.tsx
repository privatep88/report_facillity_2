import React, { useMemo, useState } from 'react';
import {
  Archive,
  CheckCircle2,
  Download,
  Eye,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  History,
  Layers,
  Loader2,
  Printer,
  RotateCcw,
  Search,
  SearchX,
  ShieldCheck,
} from 'lucide-react';
import type { ReportListSummary } from '../types/report.ts';
import { REPORT_STATUSES, STATUS_LABELS_AR } from '../types/report.ts';
import { formatDateWestern, formatNumber, formatPct, getMonthNameAr } from '../utils/calculations.ts';
import approvedBannerImg from '../assets/images/approved_archive_banner_1794843145976.jpg';
import archiveEmptyVaultImg from '../assets/images/archive_empty_vault_1794843145067.jpg';
import archiveCardApprovedImg from '../assets/images/archive_card_approved_1794843146880.jpg';
import archiveCardDigitalImg from '../assets/images/archive_card_digital_1794843147818.jpg';
import archiveCardExportImg from '../assets/images/archive_card_export_1794843146899.jpg';

interface ApprovedArchiveTabProps {
  reports: ReportListSummary[];
  onPreviewSnapshot: (reportId: string, versionNumber: number) => void;
  onViewHistory: (reportId: string) => void;
  onExportPdf?: (reportId: string, versionNumber: number) => void;
  onExportExcel: (reportId: string, versionNumber: number) => void;
  exportingPdfKey?: string | null;
  exportingExcelKey?: string | null;
  onDownloadJson: (reportId: string, versionNumber: number) => void;
}

const ARCHIVE_CAPABILITY_CARDS = [
  {
    key: 'approved',
    title: 'التقارير المعتمدة',
    description: 'استعراض النسخ الرسمية للتقارير بعد استكمال إجراءات الاعتماد.',
    image: archiveCardApprovedImg,
    alt: 'تقرير مؤسسي رسمي باللون الكحلي مع ختم اعتماد ذهبي ومستندات مرتبة',
  },
  {
    key: 'digital-archive',
    title: 'الأرشفة الإلكترونية',
    description: 'حفظ وتنظيم التقارير حسب الشهر والسنة والإصدار.',
    image: archiveCardDigitalImg,
    alt: 'أرشيف رقمي حديث وخزائن حفظ ملفات مؤسسية منظمة باللون الكحلي والأبيض والذهبي',
  },
  {
    key: 'review-export',
    title: 'استعراض التقارير',
    description: 'الوصول إلى التقارير المعتمدة ومعاينتها وطباعتها وتصديرها وفق الصلاحيات.',
    image: archiveCardExportImg,
    alt: 'مستندات تنفيذية ومخططات تحليلية وتقارير مطبوعة وجهاز لوحي للمراجعة',
  },
] as const;

export const ApprovedArchiveTab: React.FC<ApprovedArchiveTabProps> = ({
  reports,
  onPreviewSnapshot,
  onViewHistory,
  onExportPdf,
  onExportExcel,
  exportingPdfKey = null,
  exportingExcelKey = null,
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

  const hasActiveFilters =
    search.trim() !== '' ||
    yearFilter !== 'all' ||
    monthFilter !== 'all' ||
    preparerFilter !== 'all' ||
    approverFilter !== 'all';

  const resetFilters = () => {
    setSearch('');
    setYearFilter('all');
    setMonthFilter('all');
    setPreparerFilter('all');
    setApproverFilter('all');
  };

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
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-5 space-y-5">
      {/* 1. 5 Archive KPI Cards (Unified Height, Refined Icons & Subtle Gold Accents) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5 items-stretch">
        <div className="h-full flex flex-col justify-between rounded-2xl border border-[#9CD9C5]/80 hover:border-[#D5AD5D] bg-gradient-to-b from-white via-[#F6FCFA] to-[#ECF9F3] p-4 shadow-xs transition-colors">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-[#082D56]/85 font-bold">إجمالي التقارير المعتمدة</span>
            <span className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-200 text-[#069B74] flex items-center justify-center shrink-0">
              <ShieldCheck className="w-4 h-4" />
            </span>
          </div>
          <p className="text-2xl font-extrabold text-[#082D56] tabular-nums mt-2.5" dir="ltr">
            {formatNumber(kpis.totalApproved)}
          </p>
        </div>

        <div className="h-full flex flex-col justify-between rounded-2xl border border-[#B8CEE6] hover:border-[#D5AD5D] bg-gradient-to-b from-white via-[#F8FBFE] to-[#EEF5FC] p-4 shadow-xs transition-colors">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-[#082D56]/85 font-bold">
              تقارير السنة الحالية (<span dir="ltr" className="tabular-nums">{currentYear}</span>)
            </span>
            <span className="w-8 h-8 rounded-xl bg-[#EAF4FC] border border-[#B5CFE9] text-[#1769AA] flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-4 h-4" />
            </span>
          </div>
          <p className="text-2xl font-extrabold text-[#082D56] tabular-nums mt-2.5" dir="ltr">
            {formatNumber(kpis.currentYearCount)}
          </p>
        </div>

        <div className="h-full flex flex-col justify-between rounded-2xl border border-[#D5AD5D]/60 hover:border-[#D5AD5D] bg-gradient-to-b from-white via-[#FDFBF5] to-[#F9F2DF] p-4 shadow-xs transition-colors">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-[#7D5D18] font-bold">آخر تقرير معتمد</span>
            <span className="w-8 h-8 rounded-xl bg-[#FDF6E2] border border-[#D5AD5D]/50 text-[#9A7422] flex items-center justify-center shrink-0">
              <Archive className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2.5">
            <p className="text-sm font-extrabold text-[#0B2341] truncate">
              {kpis.latest ? `${getMonthNameAr(kpis.latest.month)} ${kpis.latest.year}` : 'لا يوجد بعد'}
            </p>
            <p className="text-[11px] font-mono text-slate-500 tabular-nums mt-0.5" dir="ltr">
              {kpis.latest?.reportNumber ?? '—'}
            </p>
          </div>
        </div>

        <div className="h-full flex flex-col justify-between rounded-2xl border border-[#B8CEE6] hover:border-[#D5AD5D] bg-gradient-to-b from-white to-[#F2F7FC] p-4 shadow-xs transition-colors">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-[#082D56]/85 font-bold">المتاحة للأرشفة</span>
            <span className="w-8 h-8 rounded-xl bg-[#EAF4FC] border border-[#B5CFE9] text-[#1769AA] flex items-center justify-center shrink-0">
              <Archive className="w-4 h-4" />
            </span>
          </div>
          <p className="text-2xl font-extrabold text-[#082D56] tabular-nums mt-2.5" dir="ltr">
            {formatNumber(kpis.readyToArchive)}
          </p>
        </div>

        <div className="h-full flex flex-col justify-between rounded-2xl border border-[#C6D6E8] hover:border-[#D5AD5D] bg-gradient-to-b from-white to-[#F4F7FB] p-4 shadow-xs transition-colors">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-[#082D56]/85 font-bold">إجمالي الإصدارات المعتمدة</span>
            <span className="w-8 h-8 rounded-xl bg-[#082D56]/6 border border-[#A3C0DE]/60 text-[#0B2341] flex items-center justify-center shrink-0">
              <Layers className="w-4 h-4" />
            </span>
          </div>
          <p className="text-2xl font-extrabold text-[#082D56] tabular-nums mt-2.5" dir="ltr">
            {formatNumber(kpis.totalVersions)}
          </p>
        </div>
      </div>

      {/* 2. Compact Panoramic Approved Reports Visual Banner (110–140px desktop) */}
      <section
        aria-label="أرشيف التقارير المعتمدة"
        className="relative rounded-2xl overflow-hidden border border-[#C8A85D]/55 shadow-sm bg-gradient-to-l from-[#082D56] via-[#0B2341] to-[#10518C] min-h-[116px] sm:min-h-[132px] flex items-center"
      >
        <img
          src={approvedBannerImg}
          alt="مستندات وتقارير تنفيذية رسمية معتمدة وختم اعتماد رمزي وأرشيف رقمي حديث لشركة ساعد"
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover object-center"
        />

        {/* Deep Navy Measured Scrim for Crisp HTML Readability */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-l from-[#061D3B]/95 via-[#082D56]/85 to-[#082D56]/30"
        />

        {/* SAAED Gold Diagonal Stripes */}
        <div
          aria-hidden="true"
          className="hidden sm:block absolute left-5 top-0 bottom-0 w-3.5 bg-gradient-to-b from-[#E5C878] via-[#D5AD5D] to-[#A87E2B] -skew-x-[24deg] opacity-90 pointer-events-none"
        />
        <div
          aria-hidden="true"
          className="hidden sm:block absolute left-10 top-0 bottom-0 w-1.5 bg-gradient-to-b from-[#E5C878]/80 to-[#D5AD5D]/60 -skew-x-[24deg] pointer-events-none"
        />

        {/* Real Copyable HTML Banner Content */}
        <div className="relative z-10 w-full px-5 sm:px-7 py-3.5 sm:py-4 flex flex-col justify-center gap-1 max-w-3xl">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-bold text-[#E5C878]">
            <span>أرشيف التقارير المعتمدة</span>
            <span aria-hidden="true">·</span>
            <span dir="ltr" className="tracking-wide font-semibold">
              Approved Reports &amp; Digital Archive
            </span>
          </div>
          <h2 className="text-[clamp(1.1rem,1.8vw,1.35rem)] font-extrabold text-white tracking-tight text-balance">
            أرشيف التقارير المعتمدة
          </h2>
          <p className="text-xs sm:text-[13px] text-[#E4EFFB] leading-relaxed font-medium">
            منصة مؤسسية لحفظ واستعراض التقارير الشهرية المعتمدة ومتابعة سجلاتها وإصداراتها.
          </p>
        </div>
      </section>

      {/* 3. Search, Filters & Archive Table */}
      <div className="bg-white rounded-2xl border border-[#B8CEE6]/85 p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-extrabold text-[#0B2341]">أرشيف التقارير المعتمدة رسمياً</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              يحتوي الأرشيف على النسخ المعتمدة والمؤرشفة الثابتة فقط؛ تُحفظ البيانات المطابقة تماماً للحظة الاعتماد.
            </p>
          </div>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#B8CEE6] bg-[#F4F8FC] hover:bg-[#EAF4FC] text-[#082D56] text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-[#1769AA]" />
              <span>مسح الفلاتر</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="بحث برقم التقرير أو الاسم..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-9.5 pr-9 pl-3 rounded-lg border border-slate-200 bg-[#F4F7FB] focus:border-[#1769AA] focus:bg-white focus:outline-none transition-colors"
            />
          </div>

          <select
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            className="w-full h-9.5 px-3 rounded-lg border border-slate-200 bg-[#F4F7FB] font-semibold focus:border-[#1769AA] focus:bg-white focus:outline-none transition-colors"
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
            className="w-full h-9.5 px-3 rounded-lg border border-slate-200 bg-[#F4F7FB] font-semibold focus:border-[#1769AA] focus:bg-white focus:outline-none transition-colors"
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
            className="w-full h-9.5 px-3 rounded-lg border border-slate-200 bg-[#F4F7FB] font-semibold focus:border-[#1769AA] focus:bg-white focus:outline-none transition-colors"
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
            className="w-full h-9.5 px-3 rounded-lg border border-slate-200 bg-[#F4F7FB] font-semibold focus:border-[#1769AA] focus:bg-white focus:outline-none transition-colors"
          >
            <option value="all">جميع المعتمدين</option>
            {approvers.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>

        {/* Archive Table (Preserves All 10 Columns & Preserves Table Header in Empty State) */}
        <div className="overflow-x-auto fm-scroll border border-[#B8CEE6]/80 rounded-xl">
          <table className="w-full text-xs sm:text-sm min-w-[960px]">
            <thead className="bg-gradient-to-l from-[#082D56] via-[#0B2341] to-[#10518C] text-white border-b-2 border-[#D5AD5D]/70">
              <tr>
                <th className="py-2.5 px-3 text-start font-extrabold">رقم التقرير</th>
                <th className="py-2.5 px-3 text-center font-extrabold">الشهر / السنة</th>
                <th className="py-2.5 px-3 text-center font-extrabold">تاريخ الإعداد</th>
                <th className="py-2.5 px-3 text-start font-extrabold">معد التقرير</th>
                <th className="py-2.5 px-3 text-start font-extrabold">المعتمد</th>
                <th className="py-2.5 px-3 text-center font-extrabold">تاريخ الاعتماد</th>
                <th className="py-2.5 px-3 text-center font-extrabold">الإصدار</th>
                <th className="py-2.5 px-3 text-center font-extrabold">الإنجاز</th>
                <th className="py-2.5 px-3 text-center font-extrabold">الحالة</th>
                <th className="py-2.5 px-3 text-center font-extrabold">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/70">
              {approvedOnly.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-5 sm:p-6 bg-gradient-to-b from-[#F8FBFE] to-white">
                    <div className="max-w-2xl mx-auto flex flex-col sm:flex-row items-center gap-4 sm:gap-5 text-center sm:text-start">
                      <div className="relative w-36 sm:w-40 aspect-[4/3] rounded-xl overflow-hidden border border-[#B8CEE6] bg-gradient-to-br from-[#082D56] to-[#10518C] shadow-xs shrink-0">
                        <img
                          src={archiveEmptyVaultImg}
                          alt="خزانة أرشفة إلكترونية مؤسسية جاهزة لاستقبال التقارير المعتمدة"
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover object-center"
                        />
                        <div
                          aria-hidden="true"
                          className="absolute inset-0 bg-gradient-to-t from-[#082D56]/35 via-transparent to-transparent pointer-events-none"
                        />
                      </div>

                      <div className="flex-1 space-y-1.5">
                        <div className="inline-flex items-center gap-2 text-[#082D56]">
                          <span className="w-7 h-7 rounded-lg bg-[#EAF4FC] border border-[#B5CFE9] text-[#1769AA] flex items-center justify-center shrink-0">
                            <FileCheck2 className="w-4 h-4" />
                          </span>
                          <h3 className="text-sm sm:text-base font-extrabold text-[#082D56]">
                            لا توجد تقارير معتمدة حالياً
                          </h3>
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed">
                          ستظهر هنا التقارير الشهرية بعد استكمال إجراءات الاعتماد الرسمي، مع إمكانية استعراضها وطباعتها وتنزيلها حسب الصلاحيات.
                        </p>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-6 bg-[#F8FAFD]">
                    <div className="max-w-lg mx-auto flex flex-col items-center text-center gap-2.5">
                      <span className="w-10 h-10 rounded-xl bg-[#EAF4FC] border border-[#B5CFE9] text-[#1769AA] flex items-center justify-center">
                        <SearchX className="w-5 h-5" />
                      </span>
                      <div className="space-y-1">
                        <h3 className="text-sm font-extrabold text-[#082D56]">
                          لا توجد نتائج مطابقة لمعايير البحث
                        </h3>
                        <p className="text-xs text-slate-500">
                          جرّب تعديل كلمات البحث أو إعادة ضبط فلاتر السنة والشهر والمعد والمعتمد لعرض التقارير المعتمدة.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={resetFilters}
                        className="mt-1 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#082D56] hover:bg-[#10518C] text-white text-xs font-bold transition-colors cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5 text-[#DFC076]" />
                        <span>مسح جميع الفلاتر</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((r, idx) => (
                  <tr
                    key={r.id}
                    className={`transition-colors ${
                      idx % 2 === 1 ? 'bg-[#F7FAFD] hover:bg-[#EDF4FC]' : 'bg-white hover:bg-[#F4F7FB]'
                    }`}
                  >
                    <td className="py-2.5 px-3 font-mono font-bold text-[#0B2341] tabular-nums" dir="ltr">
                      {r.reportNumber}
                    </td>
                    <td className="py-2.5 px-3 text-center font-semibold">
                      {getMonthNameAr(r.month)}{' '}
                      <span dir="ltr" className="tabular-nums">
                        {r.year}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono text-xs text-slate-600 tabular-nums" dir="ltr">
                      {formatDateWestern(r.preparedAt)}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-[#0B2341]">{r.preparerName || '—'}</td>
                    <td className="py-2.5 px-3 font-semibold text-[#069B74]">{r.approverName || '—'}</td>
                    <td className="py-2.5 px-3 text-center font-mono text-xs text-slate-600 tabular-nums" dir="ltr">
                      {formatDateWestern(r.approvedAt)}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono font-bold tabular-nums" dir="ltr">
                      v{r.currentVersion}
                    </td>
                    <td className="py-2.5 px-3 text-center tabular-nums text-xs">
                      <span dir="ltr">{formatNumber(r.totalReceived)}</span> طلب ·{' '}
                      <span dir="ltr">{formatPct(r.completionRate, '—')}</span>
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
                        {onExportPdf && (
                          <button
                            type="button"
                            onClick={() => onExportPdf(r.id, r.currentVersion)}
                            disabled={exportingPdfKey === `${r.id}_${r.currentVersion}`}
                            title="تصدير PDF الرسمي"
                            className="p-1.5 rounded-lg bg-amber-50 text-[#9A7422] hover:bg-[#C99E4A] hover:text-[#0B2341] disabled:opacity-50 transition-colors cursor-pointer"
                          >
                            {exportingPdfKey === `${r.id}_${r.currentVersion}` ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <FileText className="w-4 h-4" />
                            )}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onExportExcel(r.id, r.currentVersion)}
                          disabled={exportingExcelKey === `${r.id}_${r.currentVersion}`}
                          title="تصدير Excel"
                          className="p-1.5 rounded-lg bg-emerald-50 text-[#069B74] hover:bg-[#069B74] hover:text-white disabled:opacity-50 transition-colors cursor-pointer"
                        >
                          {exportingExcelKey === `${r.id}_${r.currentVersion}` ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <FileSpreadsheet className="w-4 h-4" />
                          )}
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

      {/* 4. Three Equal Informational Archive Cards Below Table (Smart White Space Optimization) */}
      <section aria-labelledby="archive-pillars-heading" className="space-y-3 pt-0.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-0.5">
          <div>
            <h3 id="archive-pillars-heading" className="text-base font-extrabold text-[#082D56]">
              منظومة الاعتماد والأرشفة الرقمية
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              حفظ موثق للنسخ المعتمدة وإتاحة المعاينة والطباعة والتصدير وفق الصلاحيات المؤسسية
            </p>
          </div>
          <span className="text-[11px] font-bold text-[#9A7422]" aria-hidden="true">
            الأرشيف الرسمي · ساعد SAAED
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-stretch">
          {ARCHIVE_CAPABILITY_CARDS.map((card) => (
            <article
              key={card.key}
              className="group bg-white rounded-2xl border border-[#B8CEE6]/85 hover:border-[#D5AD5D] shadow-xs overflow-hidden flex flex-col transition-colors"
            >
              <div className="relative aspect-[16/9] w-full overflow-hidden bg-gradient-to-br from-[#082D56] to-[#10518C]">
                <img
                  src={card.image}
                  alt={card.alt}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover object-center transition-transform duration-300 group-hover:scale-[1.02]"
                />
                <div
                  aria-hidden="true"
                  className="absolute inset-0 bg-gradient-to-t from-[#082D56]/40 via-transparent to-transparent pointer-events-none"
                />
              </div>

              {/* Subtle Gold Line */}
              <div
                aria-hidden="true"
                className="h-[2px] w-full bg-gradient-to-l from-[#D5AD5D] via-[#E5C878] to-[#10518C]"
              />

              <div className="p-4 flex-1 flex flex-col justify-between gap-1.5">
                <h4 className="text-sm font-extrabold text-[#082D56]">{card.title}</h4>
                <p className="text-xs text-slate-600 leading-relaxed">{card.description}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
};
