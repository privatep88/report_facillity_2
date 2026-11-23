import React, { useMemo, useState } from 'react';
import {
  Clock,
  Edit3,
  Eye,
  FileEdit,
  FileSpreadsheet,
  FileText,
  History,
  Loader2,
  Plus,
  Search,
} from 'lucide-react';
import type { ReportListSummary } from '../types/report.ts';
import { REPORT_STATUSES, STATUS_LABELS_AR } from '../types/report.ts';
import { formatDateWestern, formatNumber, formatPct, getMonthNameAr } from '../utils/calculations.ts';
import draftsBannerImg from '../assets/images/drafts_executive_banner_1794841839674.jpg';
import stagePrepImg from '../assets/images/stage_report_preparation_1794841841011.jpg';
import stageReviewImg from '../assets/images/stage_data_review_1794841840623.jpg';
import stageApprovalImg from '../assets/images/stage_approval_archive_1794841840715.jpg';

interface DraftReportsTabProps {
  reports: ReportListSummary[];
  activeReportId: string | null;
  canCreate: boolean;
  onOpenReport: (reportId: string) => void;
  onCreateNewReport: () => void;
  onPreviewReport: (reportId: string) => void;
  onViewHistory: (reportId: string) => void;
  onExportPdf?: (reportId: string) => void;
  onExportExcel: (reportId: string) => void;
  exportingPdfId?: string | null;
  exportingExcelId?: string | null;
}

const REPORT_STAGES = [
  {
    step: '01',
    title: 'إعداد التقرير',
    description: 'إدخال البيانات التشغيلية والمؤشرات الشهرية.',
    image: stagePrepImg,
    alt: 'مكتب إداري يحتوي على تقارير ومخططات هندسية ومستندات إعداد التقرير الشهري',
  },
  {
    step: '02',
    title: 'مراجعة البيانات',
    description: 'مراجعة البيانات والمؤشرات والتحقق من اكتمال المعلومات.',
    image: stageReviewImg,
    alt: 'تقارير تشغيلية ومالية ولوحات تحليل إحصائية ومخططات لمراجعة اكتمال البيانات',
  },
  {
    step: '03',
    title: 'الاعتماد والأرشفة',
    description: 'استكمال متطلبات الاعتماد وحفظ التقارير المعتمدة.',
    image: stageApprovalImg,
    alt: 'ملف تقرير مؤسسي رسمي باللون الكحلي والذهبي مع أرشيف رقمي منظم',
  },
] as const;

export const DraftReportsTab: React.FC<DraftReportsTabProps> = ({
  reports,
  activeReportId,
  canCreate,
  onOpenReport,
  onCreateNewReport,
  onPreviewReport,
  onViewHistory,
  onExportPdf,
  onExportExcel,
  exportingPdfId = null,
  exportingExcelId = null,
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [yearFilter, setYearFilter] = useState<string>('all');
  const [monthFilter, setMonthFilter] = useState<string>('all');

  const draftReports = useMemo(
    () =>
      reports.filter(
        (r) => r.status !== REPORT_STATUSES.APPROVED && r.status !== REPORT_STATUSES.ARCHIVED
      ),
    [reports]
  );

  const years = useMemo(
    () => Array.from(new Set(draftReports.map((r) => r.year))).sort((a, b) => b - a),
    [draftReports]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return draftReports.filter((r) => {
      if (statusFilter === 'draft' && r.status !== REPORT_STATUSES.DRAFT) return false;
      if (
        statusFilter === 'pending_approval' &&
        r.status !== REPORT_STATUSES.PENDING_APPROVAL &&
        r.status !== REPORT_STATUSES.READY_FOR_REVIEW &&
        r.status !== REPORT_STATUSES.UNDER_REVIEW
      ) {
        return false;
      }
      if (yearFilter !== 'all' && r.year !== Number(yearFilter)) return false;
      if (monthFilter !== 'all' && r.month !== Number(monthFilter)) return false;
      if (q) {
        const hay = `${r.reportNumber} ${getMonthNameAr(r.month)} ${r.year} ${r.preparerName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [draftReports, search, statusFilter, yearFilter, monthFilter]);

  const kpis = useMemo(() => {
    const total = draftReports.length;
    const onlyDraft = draftReports.filter((r) => r.status === REPORT_STATUSES.DRAFT).length;
    const pendingApproval = draftReports.filter(
      (r) =>
        r.status === REPORT_STATUSES.PENDING_APPROVAL ||
        r.status === REPORT_STATUSES.READY_FOR_REVIEW ||
        r.status === REPORT_STATUSES.UNDER_REVIEW
    ).length;
    const latest = draftReports[0] ?? null;
    return { total, onlyDraft, pendingApproval, latest };
  }, [draftReports]);

  const getStatusDisplay = (status: ReportListSummary['status'], isPostApprovalRevision?: boolean) => {
    if (status === REPORT_STATUSES.DRAFT && isPostApprovalRevision) {
      return {
        label: 'قيد تعديل تقرير معتمد',
        cls: 'bg-amber-50 text-[#9A7422] border border-[#D5AD5D]/70',
      };
    }
    if (status === REPORT_STATUSES.DRAFT) {
      return {
        label: STATUS_LABELS_AR.draft,
        cls: 'bg-slate-100 text-[#0B2341] border border-slate-300',
      };
    }
    return {
      label: STATUS_LABELS_AR.pending_approval,
      cls: 'bg-amber-50 text-[#9A7422] border border-amber-200',
    };
  };

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-5 space-y-5">
      {/* 1. 4 Polished KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-[#B8CEE6] bg-gradient-to-b from-white via-[#F9FBFE] to-[#EFF6FC] p-4 shadow-xs transition-colors hover:border-[#D5AD5D]/70">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-[#082D56]/80 font-bold">إجمالي مسودات التقارير</span>
            <span className="w-8 h-8 rounded-xl bg-[#EAF4FC] border border-[#B5CFE9] text-[#1769AA] flex items-center justify-center shrink-0">
              <FileEdit className="w-4 h-4" />
            </span>
          </div>
          <p className="text-2xl font-extrabold text-[#082D56] tabular-nums mt-2" dir="ltr">
            {formatNumber(kpis.total)}
          </p>
        </div>

        <div className="rounded-2xl border border-[#C6D6E8] bg-gradient-to-b from-white to-[#F4F7FB] p-4 shadow-xs transition-colors hover:border-[#D5AD5D]/70">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-[#082D56]/80 font-bold">قيد الإعداد (مسودة)</span>
            <span className="w-8 h-8 rounded-xl bg-[#082D56]/6 border border-[#A3C0DE]/60 text-[#0B2341] flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4" />
            </span>
          </div>
          <p className="text-2xl font-extrabold text-[#0B2341] tabular-nums mt-2" dir="ltr">
            {formatNumber(kpis.onlyDraft)}
          </p>
        </div>

        <div className="rounded-2xl border border-[#D5AD5D]/55 bg-gradient-to-b from-white via-[#FDFBF5] to-[#F9F1DC] p-4 shadow-xs transition-colors hover:border-[#D5AD5D]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-[#7D5D18] font-bold">بانتظار الاعتماد</span>
            <span className="w-8 h-8 rounded-xl bg-[#FDF6E2] border border-[#D5AD5D]/50 text-[#9A7422] flex items-center justify-center shrink-0">
              <Clock className="w-4 h-4" />
            </span>
          </div>
          <p className="text-2xl font-extrabold text-[#9A7422] tabular-nums mt-2" dir="ltr">
            {formatNumber(kpis.pendingApproval)}
          </p>
        </div>

        <div className="rounded-2xl border border-[#9CD9C5]/75 bg-gradient-to-b from-white via-[#F6FCFA] to-[#EBF9F3] p-4 shadow-xs transition-colors hover:border-[#D5AD5D]/70">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-[#082D56]/80 font-bold">أحدث مسودة مفتوحة</span>
            <span className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-200 text-[#069B74] flex items-center justify-center shrink-0">
              <Edit3 className="w-4 h-4" />
            </span>
          </div>
          <p className="text-sm font-extrabold text-[#0B2341] mt-2 truncate">
            {kpis.latest ? `${getMonthNameAr(kpis.latest.month)} ${kpis.latest.year}` : 'لا توجد مسودات'}
          </p>
          <p className="text-[11px] font-mono text-slate-500 tabular-nums mt-0.5" dir="ltr">
            {kpis.latest?.reportNumber ?? '—'}
          </p>
        </div>
      </div>

      {/* 2. Compact Panoramic Report Drafts Visual Banner */}
      <section
        aria-label="إدارة مسودات التقارير الشهرية"
        className="relative rounded-2xl overflow-hidden border border-[#C8A85D]/55 shadow-sm bg-gradient-to-l from-[#082D56] via-[#0B2341] to-[#10518C] min-h-[128px] sm:min-h-[144px] flex items-center"
      >
        {/* High-Resolution Facilities Management Panorama Image */}
        <img
          src={draftsBannerImg}
          alt="مكتب إداري لقسم إدارة المرافق يحتوي على مخططات هندسية وتقارير شهرية وخوذة سلامة ورسوم إحصائية"
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover object-center"
        />

        {/* Deep Navy Measured Scrim for WCAG AA Contrast in RTL */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-l from-[#061D3B]/95 via-[#082D56]/84 to-[#082D56]/30"
        />

        {/* Subtle SAAED Gold Accent Stripes on Visual Left Edge */}
        <div
          aria-hidden="true"
          className="hidden sm:block absolute left-5 top-0 bottom-0 w-3.5 bg-gradient-to-b from-[#E5C878] via-[#D5AD5D] to-[#A87E2B] -skew-x-[24deg] opacity-90 pointer-events-none"
        />
        <div
          aria-hidden="true"
          className="hidden sm:block absolute left-10 top-0 bottom-0 w-1.5 bg-gradient-to-b from-[#E5C878]/80 to-[#D5AD5D]/60 -skew-x-[24deg] pointer-events-none"
        />

        {/* Real Copyable HTML Typography */}
        <div className="relative z-10 w-full px-5 sm:px-7 py-4 sm:py-5 flex flex-col justify-center gap-1.5 max-w-3xl">
          <div className="flex items-center gap-2 text-[11px] font-bold text-[#E5C878]">
            <span>شركة ساهر SAHER</span>
            <span aria-hidden="true">·</span>
            <span>التقرير الشهري لقسم إدارة المرافق</span>
          </div>
          <h2 className="text-lg sm:text-xl font-extrabold text-white tracking-tight text-balance">
            إدارة مسودات التقارير الشهرية
          </h2>
          <p className="text-xs sm:text-sm text-[#E4EFFB] leading-relaxed font-medium">
            إنشاء ومراجعة وتحديث مسودات التقارير قبل إرسالها للاعتماد النهائي.
          </p>
        </div>
      </section>

      {/* 3. Filters & Drafts Table */}
      <div className="bg-white rounded-2xl border border-[#B8CEE6]/85 p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-extrabold text-[#0B2341]">مسودة التقرير والتقارير قيد الإعداد</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              متابعة المسودات والتقارير التي لم يُستكمل اعتمادها الرسمي بعد، مع إمكانية فتحها واستكمال تحريرها أو إرسالها للاعتماد.
            </p>
          </div>
          {canCreate && (
            <button
              type="button"
              onClick={onCreateNewReport}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-b from-[#E5C878] to-[#C49A42] hover:from-[#ebd28b] hover:to-[#cfa54c] text-[#071C3A] text-xs font-extrabold shadow-2xs transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>إنشاء مسودة جديدة</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
            <input
              type="text"
              placeholder="بحث برقم التقرير أو اسم المعد..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pr-9 pl-3 py-2 rounded-lg border border-slate-200 bg-[#F4F7FB] focus:border-[#1769AA] focus:bg-white focus:outline-none transition-colors"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-200 bg-[#F4F7FB] font-semibold focus:border-[#1769AA] focus:bg-white focus:outline-none transition-colors"
          >
            <option value="all">جميع الحالات (مسودة + بانتظار الاعتماد)</option>
            <option value="draft">مسودة فقط</option>
            <option value="pending_approval">بانتظار الاعتماد فقط</option>
          </select>

          <select
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-200 bg-[#F4F7FB] font-semibold focus:border-[#1769AA] focus:bg-white focus:outline-none transition-colors"
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
            className="px-3 py-2 rounded-lg border border-slate-200 bg-[#F4F7FB] font-semibold focus:border-[#1769AA] focus:bg-white focus:outline-none transition-colors"
          >
            <option value="all">كل الأشهر</option>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {getMonthNameAr(m)}
              </option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto fm-scroll border border-[#B8CEE6]/80 rounded-xl">
          <table className="w-full text-xs sm:text-sm min-w-[920px]">
            <thead className="bg-gradient-to-l from-[#082D56] via-[#0B2341] to-[#10518C] text-white border-b-2 border-[#D5AD5D]/70">
              <tr>
                <th className="py-2.5 px-3 text-start font-extrabold">رقم التقرير</th>
                <th className="py-2.5 px-3 text-center font-extrabold">الشهر / السنة</th>
                <th className="py-2.5 px-3 text-start font-extrabold">معد التقرير</th>
                <th className="py-2.5 px-3 text-center font-extrabold">آخر تحديث</th>
                <th className="py-2.5 px-3 text-center font-extrabold">الإصدار</th>
                <th className="py-2.5 px-3 text-center font-extrabold">الإنجاز</th>
                <th className="py-2.5 px-3 text-center font-extrabold">الحالة</th>
                <th className="py-2.5 px-3 text-center font-extrabold">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/70">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    لا توجد مسودات تقارير مطابقة للمعايير الحالية.
                  </td>
                </tr>
              ) : (
                filtered.map((r, idx) => {
                  const badge = getStatusDisplay(r.status, r.isPostApprovalRevision);
                  const isActive = activeReportId === r.id;
                  return (
                    <tr
                      key={r.id}
                      className={`transition-colors ${
                        isActive
                          ? 'bg-[#EAF4FC]/75'
                          : idx % 2 === 1
                            ? 'bg-[#F7FAFD] hover:bg-[#EDF4FC]'
                            : 'bg-white hover:bg-[#F4F7FB]'
                      }`}
                    >
                      <td className="py-2.5 px-3">
                        <span className="font-mono font-bold text-[#0B2341] tabular-nums block" dir="ltr">
                          {r.reportNumber}
                        </span>
                        {r.isPostApprovalRevision && r.revisionReason && (
                          <span className="block text-[10.5px] text-slate-500 mt-0.5 max-w-[220px] truncate" title={r.revisionReason}>
                            السبب: {r.revisionReason}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center font-semibold">
                        {getMonthNameAr(r.month)}{' '}
                        <span dir="ltr" className="tabular-nums">
                          {r.year}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-[#0B2341]">{r.preparerName || '—'}</td>
                      <td className="py-2.5 px-3 text-center font-mono text-xs text-slate-600 tabular-nums" dir="ltr">
                        {formatDateWestern(r.updatedAt)}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className="font-mono font-bold tabular-nums block" dir="ltr">
                          v{r.currentVersion}
                        </span>
                        {r.isPostApprovalRevision && r.sourceApprovedVersion && (
                          <span className="block text-[10px] font-semibold text-[#9A7422] mt-0.5">
                            مستند على <span dir="ltr" className="font-mono">v{r.sourceApprovedVersion}</span>
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center tabular-nums text-xs">
                        <span dir="ltr">{formatNumber(r.totalReceived)}</span> طلب ·{' '}
                        <span dir="ltr">{formatPct(r.completionRate, '—')}</span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={`inline-block px-2.5 py-1 rounded-md text-[11px] font-bold ${badge.cls}`}>
                          {badge.label}
                        </span>
                        {r.isPostApprovalRevision && r.status !== REPORT_STATUSES.DRAFT && (
                          <span className="block text-[10px] font-semibold text-[#9A7422] mt-0.5">
                            تعديل تقرير معتمد
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onOpenReport(r.id)}
                            title="فتح التقرير للتحرير والمتابعة"
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#0B2341] hover:bg-[#1769AA] text-white text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5 text-[#DFC076]" />
                            <span>فتح التقرير</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onPreviewReport(r.id)}
                            title="معاينة وطباعة التقرير"
                            className="p-1.5 rounded-lg bg-[#EAF4FC] text-[#1769AA] hover:bg-[#1769AA] hover:text-white transition-colors cursor-pointer"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {onExportPdf && (
                            <button
                              type="button"
                              onClick={() => onExportPdf(r.id)}
                              disabled={exportingPdfId === r.id}
                              title="تصدير PDF"
                              className="p-1.5 rounded-lg bg-amber-50 text-[#9A7422] hover:bg-[#C99E4A] hover:text-[#0B2341] disabled:opacity-50 transition-colors cursor-pointer"
                            >
                              {exportingPdfId === r.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <FileText className="w-4 h-4" />
                              )}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onExportExcel(r.id)}
                            disabled={exportingExcelId === r.id}
                            title="تصدير Excel"
                            className="p-1.5 rounded-lg bg-emerald-50 text-[#069B74] hover:bg-[#069B74] hover:text-white disabled:opacity-50 transition-colors cursor-pointer"
                          >
                            {exportingExcelId === r.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <FileSpreadsheet className="w-4 h-4" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => onViewHistory(r.id)}
                            title="عرض سجل التدقيق"
                            className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-[#1769AA] transition-colors cursor-pointer"
                          >
                            <History className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Report Preparation Lifecycle Visual Cards (Smart Empty Space Management) */}
      <section aria-labelledby="draft-stages-heading" className="space-y-3 pt-1">
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-0.5">
          <div>
            <h3 id="draft-stages-heading" className="text-base font-extrabold text-[#082D56]">
              مراحل إعداد التقرير الشهري
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              دورة العمل المعتمدة من إدخال البيانات التشغيلية وحتى الاعتماد النهائي والأرشفة الرقمية
            </p>
          </div>
          <span className="text-[11px] font-bold text-[#9A7422]" aria-hidden="true">
            إدارة المرافق · ساهر SAHER
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-stretch">
          {REPORT_STAGES.map((stage) => (
            <article
              key={stage.step}
              className="group bg-white rounded-2xl border border-[#B8CEE6]/85 hover:border-[#D5AD5D] shadow-xs overflow-hidden flex flex-col transition-colors"
            >
              {/* Crisp 4:3 Stage Photograph with Fallback Navy Gradient */}
              <div className="relative aspect-[16/9] w-full overflow-hidden bg-gradient-to-br from-[#082D56] to-[#10518C]">
                <img
                  src={stage.image}
                  alt={stage.alt}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover object-center transition-transform duration-300 group-hover:scale-[1.02]"
                />
                <div
                  aria-hidden="true"
                  className="absolute inset-0 bg-gradient-to-t from-[#082D56]/45 via-transparent to-transparent pointer-events-none"
                />
              </div>

              {/* Subtle SAAED Navy-Gold Hairline Divider */}
              <div
                aria-hidden="true"
                className="h-[2px] w-full bg-gradient-to-l from-[#D5AD5D] via-[#E5C878] to-[#10518C]"
              />

              {/* Real HTML Copyable Content */}
              <div className="p-4 flex-1 flex flex-col justify-between gap-1.5">
                <div className="flex items-baseline gap-2">
                  <span
                    dir="ltr"
                    className="text-xs font-mono font-extrabold text-[#B8862D] tabular-nums shrink-0"
                  >
                    {stage.step}.
                  </span>
                  <h4 className="text-sm font-extrabold text-[#082D56]">{stage.title}</h4>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">{stage.description}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
};
