import React from 'react';
import { Cell, Pie, PieChart } from 'recharts';
import {
  AlertTriangle,
  Award,
  BarChart3,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Clock,
  FileCheck2,
  Flame,
  Layers,
  ShieldAlert,
  ShieldCheck,
  Target,
  TrendingUp,
  Truck,
  UserCheck,
  Wrench,
} from 'lucide-react';
import engineerImg from '../assets/images/engineer_tablet_inspector_1794730112530.jpg';
import engineeringImg from '../assets/images/facility_engineering_ops_1794728989361.jpg';
import receptionImg from '../assets/images/facility_reception_hall_1794728988518.jpg';
import safetyImg from '../assets/images/facility_safety_logistics_1794728989271.jpg';
import fireExtImg from '../assets/images/fire_extinguisher_safety_1794730113921.jpg';
import technicianImg from '../assets/images/technician_electrical_panel_1794730113102.jpg';
import {
  EXECUTIVE_KPI_IMAGES,
  resolveTopServiceKpiImage,
} from '../utils/executiveKpiVisuals.ts';
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
  formatDateTimeWestern,
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
import { LogisticsHorizontalChart } from './LogisticsHorizontalChart.tsx';
import { MaintenanceSiteHorizontalChart } from './MaintenanceSiteHorizontalChart.tsx';
import { SaaedExecutiveHeader } from './SaaedExecutiveHeader.tsx';

export interface OfficialReportLayoutProps {
  report: MonthlyReportFull;
  sites: MaintenanceSite[];
  categories: MaintenanceCategory[];
  thresholds: PerformanceThresholds;
  orientation: 'landscape' | 'portrait';
  snapshotVersion?: number | null;
  activePageFilter?: number | 'all';
}

export const OFFICIAL_REPORT_TOTAL_PAGES = 5;

export const OfficialReportLayout: React.FC<OfficialReportLayoutProps> = ({
  report,
  sites,
  categories,
  thresholds,
  orientation,
  snapshotVersion,
  activePageFilter = 'all',
}) => {
  const metrics = computeReportMetrics(report, sites, categories, thresholds);
  const isApprovedOrArchived = report.status === 'approved' || report.status === 'archived';
  const verNumber = snapshotVersion || report.currentVersion;

  const activeServicesForChart = metrics.servicesWithMetrics.filter((s) => s.receivedCount > 0);
  const sortedRequestsByService = [...metrics.servicesWithMetrics].sort(
    (a, b) => b.receivedCount - a.receivedCount
  );
  const sortedSummary = [...metrics.servicesWithMetrics].sort((a, b) => {
    const sa = report.services.find((x) => x.serviceId === a.serviceId)?.summaryOrder ?? 99;
    const sb = report.services.find((x) => x.serviceId === b.serviceId)?.summaryOrder ?? 99;
    return sa - sb;
  });

  // Maintenance sources chart data (Section 7)
  const maintFromFM = report.maintenanceServices.fromFacilitiesDept || 0;
  const maintFromOther = report.maintenanceServices.fromOtherDepts || 0;
  const maintTotal = metrics.maintenanceServicesTotal || 0;
  const maintFmPct = maintTotal > 0 ? (maintFromFM / maintTotal) * 100 : 0;
  const maintOtherPct = maintTotal > 0 ? (maintFromOther / maintTotal) * 100 : 0;
  const maintChartData = [
    { name: 'من قسم المرافق', value: maintFromFM, color: '#0C4176', pct: maintFmPct },
    { name: 'من الإدارات الأخرى', value: maintFromOther, color: '#C99E4A', pct: maintOtherPct },
  ].filter((d) => d.value > 0);

  // Top fault site for Section 6 KPI Card
  const sortedSitesByFaults = [...sites]
    .map((s) => ({
      site: s,
      faults: metrics.maintenance.siteTotals[s.id] ?? 0,
    }))
    .sort((a, b) => b.faults - a.faults);
  const topFaultSite =
    sortedSitesByFaults.length > 0 && sortedSitesByFaults[0].faults > 0
      ? sortedSitesByFaults[0]
      : null;

  const sheetWidthClass = orientation === 'landscape' ? 'max-w-[1220px]' : 'max-w-[860px]';

  const renderPageHeader = (pageNumber: number) => (
    <div className="official-page-header">
      <SaaedExecutiveHeader />
      <div className="bg-[#F4F7FB] border-b border-[#C5D8EE] px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#012E5E]">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="font-extrabold text-[#012E5E]">{report.company}</span>
          <span className="text-slate-300">|</span>
          <span className="font-bold text-[#1769AA]">
            شهر {getMonthNameAr(report.month)}{' '}
            <span dir="ltr" className="tabular-nums">
              {report.year}
            </span>{' '}
            ({getMonthNameEn(report.month)}{' '}
            <span dir="ltr" className="tabular-nums">
              {report.year}
            </span>
            )
          </span>
          <span className="text-slate-300">|</span>
          <span className="font-semibold text-slate-600">التصنيف: {report.classification}</span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span>
            رقم التقرير:{' '}
            <span className="font-mono font-extrabold text-[#012E5E] tabular-nums" dir="ltr">
              {report.reportNumber}
            </span>
          </span>
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-extrabold text-[10.5px] border ${
              isApprovedOrArchived
                ? 'bg-emerald-50 text-[#069B74] border-emerald-300'
                : 'bg-amber-50 text-[#9A6700] border-amber-300'
            }`}
          >
            {isApprovedOrArchived ? (
              <ShieldCheck className="w-3 h-3 text-[#069B74]" />
            ) : (
              <Clock className="w-3 h-3 text-[#C99E4A]" />
            )}
            <span>
              الحالة: {STATUS_LABELS_AR[report.status]} ({STATUS_LABELS_EN[report.status]})
            </span>
          </span>
          <span>
            الإصدار:{' '}
            <span className="font-mono font-bold tabular-nums" dir="ltr">
              v{verNumber}
            </span>
          </span>
          <span className="bg-[#012E5E] text-[#DFC076] px-2 py-0.5 rounded font-bold text-[10.5px]">
            الصفحة <span dir="ltr" className="tabular-nums">{formatNumber(pageNumber)}</span> من{' '}
            <span dir="ltr" className="tabular-nums">{formatNumber(OFFICIAL_REPORT_TOTAL_PAGES)}</span>
          </span>
        </div>
      </div>

      {!isApprovedOrArchived && (
        <div className="bg-amber-50/90 border-b border-amber-300 px-4 py-1.5 flex items-center justify-center gap-2 text-[11px] font-extrabold text-[#92620A]">
          <AlertTriangle className="w-3.5 h-3.5 text-[#C99E4A] shrink-0" />
          <span>
            تنبيه رسمي: هذه النسخة ({STATUS_LABELS_AR[report.status]}) قيد الإعداد/المراجعة ولم تُعتمد نهائياً بعد
          </span>
        </div>
      )}
    </div>
  );

  const renderPageFooter = (pageNumber: number) => (
    <div className="official-page-footer mt-auto pt-2">
      <div className="relative">
        <CorporateFooter />
        <div className="bg-[#021F40] border-t border-[#C99E4A]/50 px-4 py-1 flex items-center justify-between text-[10.5px] text-slate-200">
          <span>
            التقرير الشهري لقسم إدارة المرافق — رقم{' '}
            <span dir="ltr" className="font-mono font-bold text-[#DFC076] tabular-nums">
              {report.reportNumber}
            </span>
          </span>
          <span className="font-extrabold text-[#DFC076]">
            الصفحة <span dir="ltr" className="tabular-nums">{formatNumber(pageNumber)}</span> من{' '}
            <span dir="ltr" className="tabular-nums">{formatNumber(OFFICIAL_REPORT_TOTAL_PAGES)}</span>
          </span>
        </div>
      </div>
    </div>
  );

  const renderRibbonHeader = (titleAr: string, titleEn: string) => (
    <div className="bg-gradient-to-l from-[#012E5E] via-[#083A72] to-[#0C4176] border-b-2 border-[#C99E4A] px-4 py-2 flex items-center justify-between text-white rounded-t-xl">
      <div className="flex items-center gap-2">
        <span className="w-1.5 h-4 rounded-full bg-[#C99E4A]" />
        <h2 className="text-xs sm:text-sm font-extrabold tracking-tight">{titleAr}</h2>
      </div>
      <span className="text-[10.5px] font-semibold text-[#DFC076] uppercase tracking-wider" dir="ltr">
        {titleEn}
      </span>
    </div>
  );

  const shouldShowPage = (pageNum: number) =>
    activePageFilter === 'all' || activePageFilter === pageNum;

  return (
    <div className="official-report-pages-container space-y-8">
      {/* ===================================================================== */}
      {/* PAGE 1: Executive Summary + 7 Operations Strip Cards + Sec 2 Overview */}
      {/* ===================================================================== */}
      {shouldShowPage(1) && (
        <article
          id="official-report-page-1"
          data-page-number="1"
          className={`saaed-preview-sheet official-report-page mx-auto bg-white shadow-2xl border border-slate-200 flex flex-col justify-between ${sheetWidthClass}`}
        >
          {renderPageHeader(1)}

          <div className="p-4 sm:p-5 space-y-4 text-[#012E5E] flex-1">
            {/* SECTION 1: الملخص التنفيذي (4 Gradient KPI Cards with Contextual Imagery + Engineer Photo) */}
            <section className="rounded-xl border border-[#B8CDE4] bg-white shadow-xs overflow-hidden">
              {renderRibbonHeader('1. الملخص التنفيذي', 'Executive Summary')}
              <div className="p-3 bg-gradient-to-b from-[#F4F8FC] to-white">
                {(() => {
                  const topServiceImg = resolveTopServiceKpiImage(metrics.topService);
                  return (
                    <div className="grid grid-cols-12 gap-2.5 items-stretch">
                      <div className="col-span-12 lg:col-span-9 grid grid-cols-2 sm:grid-cols-4 gap-2.5 items-stretch">
                        {/* Card 1: Total Requests */}
                        <div className="rounded-xl border border-[#B8CEE8] bg-gradient-to-b from-[#F4F8FD] via-[#EBF2FC] to-[#DFEAFA] overflow-hidden shadow-xs flex flex-col justify-between text-center">
                          <div className="relative h-[68px] w-full overflow-hidden bg-[#D8E8FA] shrink-0">
                            <img
                              src={EXECUTIVE_KPI_IMAGES.totalRequests.src}
                              alt={EXECUTIVE_KPI_IMAGES.totalRequests.altAr}
                              className="w-full h-full object-cover object-center"
                              referrerPolicy="no-referrer"
                            />
                            <div
                              aria-hidden="true"
                              className="absolute inset-0 bg-gradient-to-b from-[#012E5E]/15 via-transparent to-[#EBF2FC]"
                            />
                            <div
                              aria-hidden="true"
                              className="absolute inset-x-0 bottom-0 h-5 bg-gradient-to-t from-[#EBF2FC] via-[#EBF2FC]/80 to-transparent"
                            />
                          </div>
                          <div className="px-2.5 pb-2.5 pt-0 flex-1 flex flex-col items-center justify-between">
                            <div className="-mt-4 relative z-10 w-8 h-8 rounded-lg bg-white/95 border border-[#B8CEE8] text-[#1769AA] flex items-center justify-center mb-1 shadow-xs shrink-0">
                              <ClipboardList className="w-4 h-4" />
                            </div>
                            <span
                              className="text-xl font-black text-[#012E5E] tabular-nums leading-none"
                              dir="ltr"
                            >
                              {formatNumber(metrics.totalReceived)}
                            </span>
                            <div className="mt-1">
                              <p className="text-[11px] font-extrabold text-[#012E5E]">إجمالي الطلبات</p>
                              <p className="text-[9.5px] font-medium text-slate-600" dir="ltr">
                                Total Requests
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Card 2: Top Service (Dynamic Image by serviceId) */}
                        <div className="rounded-xl border border-[#E2C88B] bg-gradient-to-b from-[#FDF9EE] via-[#F9F0DA] to-[#F3E5C2] overflow-hidden shadow-xs flex flex-col justify-between text-center">
                          <div className="relative h-[68px] w-full overflow-hidden bg-[#F3E5C2] shrink-0">
                            <img
                              src={topServiceImg.src}
                              alt={topServiceImg.altAr}
                              className="w-full h-full object-cover object-center"
                              referrerPolicy="no-referrer"
                            />
                            <div
                              aria-hidden="true"
                              className="absolute inset-0 bg-gradient-to-b from-[#5A4010]/15 via-transparent to-[#F9F0DA]"
                            />
                            <div
                              aria-hidden="true"
                              className="absolute inset-x-0 bottom-0 h-5 bg-gradient-to-t from-[#F9F0DA] via-[#F9F0DA]/80 to-transparent"
                            />
                          </div>
                          <div className="px-2.5 pb-2.5 pt-0 flex-1 flex flex-col items-center justify-between">
                            <div className="-mt-4 relative z-10 w-8 h-8 rounded-lg bg-white/95 border border-[#E2C88B] text-[#B8862D] flex items-center justify-center mb-1 shadow-xs shrink-0">
                              <Award className="w-4 h-4" />
                            </div>
                            <p className="text-xs font-black text-[#012E5E] leading-snug line-clamp-2 min-h-[22px] flex items-center justify-center">
                              {metrics.topService ? metrics.topService.nameAr : '0'}
                            </p>
                            <div className="mt-1">
                              <p className="text-[11px] font-extrabold text-[#012E5E]">أعلى خدمة طلباً</p>
                              <p className="text-[9.5px] font-medium text-slate-600">
                                {metrics.topService
                                  ? `${formatNumber(metrics.topService.receivedCount)} طلب · Top Service`
                                  : 'Top Service'}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Card 3: Total Services */}
                        <div className="rounded-xl border border-[#A5C8EB] bg-gradient-to-b from-[#F0F7FE] via-[#E4F0FC] to-[#D5E7FA] overflow-hidden shadow-xs flex flex-col justify-between text-center">
                          <div className="relative h-[68px] w-full overflow-hidden bg-[#D5E7FA] shrink-0">
                            <img
                              src={EXECUTIVE_KPI_IMAGES.totalServices.src}
                              alt={EXECUTIVE_KPI_IMAGES.totalServices.altAr}
                              className="w-full h-full object-cover object-center"
                              referrerPolicy="no-referrer"
                            />
                            <div
                              aria-hidden="true"
                              className="absolute inset-0 bg-gradient-to-b from-[#0C4176]/15 via-transparent to-[#E4F0FC]"
                            />
                            <div
                              aria-hidden="true"
                              className="absolute inset-x-0 bottom-0 h-5 bg-gradient-to-t from-[#E4F0FC] via-[#E4F0FC]/80 to-transparent"
                            />
                          </div>
                          <div className="px-2.5 pb-2.5 pt-0 flex-1 flex flex-col items-center justify-between">
                            <div className="-mt-4 relative z-10 w-8 h-8 rounded-lg bg-white/95 border border-[#A5C8EB] text-[#1769AA] flex items-center justify-center mb-1 shadow-xs shrink-0">
                              <Layers className="w-4 h-4" />
                            </div>
                            <span
                              className="text-xl font-black text-[#012E5E] tabular-nums leading-none"
                              dir="ltr"
                            >
                              {formatNumber(metrics.activeServicesCount)}
                            </span>
                            <div className="mt-1">
                              <p className="text-[11px] font-extrabold text-[#012E5E]">إجمالي الخدمات</p>
                              <p className="text-[9.5px] font-medium text-slate-600" dir="ltr">
                                Total Services
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Card 4: Monthly Completion Rate */}
                        <div className="rounded-xl border border-[#9CD9C5] bg-gradient-to-b from-[#EFFBF6] via-[#E1F6ED] to-[#CEEFE1] overflow-hidden shadow-xs flex flex-col justify-between text-center">
                          <div className="relative h-[68px] w-full overflow-hidden bg-[#CEEFE1] shrink-0">
                            <img
                              src={EXECUTIVE_KPI_IMAGES.monthlyCompletion.src}
                              alt={EXECUTIVE_KPI_IMAGES.monthlyCompletion.altAr}
                              className="w-full h-full object-cover object-top"
                              referrerPolicy="no-referrer"
                            />
                            <div
                              aria-hidden="true"
                              className="absolute inset-0 bg-gradient-to-b from-[#056C51]/12 via-transparent to-[#E1F6ED]"
                            />
                            <div
                              aria-hidden="true"
                              className="absolute inset-x-0 bottom-0 h-5 bg-gradient-to-t from-[#E1F6ED] via-[#E1F6ED]/80 to-transparent"
                            />
                          </div>
                          <div className="px-2.5 pb-2.5 pt-0 flex-1 flex flex-col items-center justify-between">
                            <div className="-mt-4 relative z-10 w-8 h-8 rounded-lg bg-white/95 border border-[#9CD9C5] text-[#069B74] flex items-center justify-center mb-1 shadow-xs shrink-0">
                              <Target className="w-4 h-4" />
                            </div>
                            <span
                              className="text-xl font-black text-[#069B74] tabular-nums leading-none"
                              dir="ltr"
                            >
                              {formatPct(metrics.overallCompletionPct, '0.0%')}
                            </span>
                            <div className="mt-1">
                              <p className="text-[11px] font-extrabold text-[#012E5E]">نسبة الإنجاز الشهرية</p>
                              <p className="text-[9.5px] font-medium text-slate-600" dir="ltr">
                                Monthly Completion Rate
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Card 5: Engineer Tablet Inspector Photo */}
                      <div className="col-span-12 lg:col-span-3 rounded-xl overflow-hidden border border-[#C99E4A]/70 relative min-h-[145px] bg-[#012E5E] shadow-xs">
                        <img
                          src={engineerImg}
                          alt="فريق التفتيش الهندسي وإدارة المرافق"
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-[#012E5E]/90 via-[#012E5E]/25 to-transparent flex flex-col justify-end p-2.5 text-white">
                          <span className="text-[10px] font-bold text-[#DFC076]">إدارة المرافق الذكية</span>
                          <span className="text-[11px] font-extrabold leading-tight">
                            متابعة ميدانية ورقابة جودة مستمرة
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </section>

            {/* OPERATIONS SUMMARY STRIP: ملخص العمليات والاعتماد (All 7 Cards) */}
            <section className="rounded-xl border border-[#B8CDE4] bg-white shadow-xs overflow-hidden">
              {renderRibbonHeader(
                'ملخص العمليات والاعتماد (7 بطاقات تنفيذية)',
                'Operations & Approval Summary Strip'
              )}
              <div className="p-3 bg-[#F7FAFC] space-y-2.5">
                {/* Row 1: 4 Photo Cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                  {/* Card 1: تفاصيل الصيانة بالمقرات */}
                  <div className="rounded-xl border border-[#C5D8EE] bg-white overflow-hidden shadow-2xs flex flex-col">
                    <div className="bg-[#012E5E] text-white px-2.5 py-1.5 text-[11px] font-extrabold flex items-center justify-between border-b border-[#C99E4A]">
                      <span>تفاصيل الصيانة بالمقرات</span>
                      <Building2 className="w-3.5 h-3.5 text-[#DFC076]" />
                    </div>
                    <div className="p-2 flex items-center gap-2 flex-1">
                      <img
                        src={engineeringImg}
                        alt="تفاصيل الصيانة بالمقرات"
                        className="w-16 h-14 rounded-lg object-cover border border-slate-200 shrink-0"
                      />
                      <div className="flex-1 grid grid-cols-2 gap-1 text-center">
                        <div className="bg-[#F4F8FC] rounded p-1 border border-slate-200">
                          <p className="text-[9.5px] font-bold text-slate-600">عدد المقرات</p>
                          <p className="text-sm font-black text-[#012E5E] tabular-nums" dir="ltr">
                            {formatNumber(sites.length)}
                          </p>
                        </div>
                        <div className="bg-[#EAF4FC] rounded p-1 border border-[#B8CDE4]">
                          <p className="text-[9.5px] font-bold text-[#0C4176]">إجمالي الأعطال</p>
                          <p className="text-sm font-black text-[#1769AA] tabular-nums" dir="ltr">
                            {formatNumber(metrics.maintenance.grandTotalFaults)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Card 2: خدمات الصيانة */}
                  <div className="rounded-xl border border-[#C5D8EE] bg-white overflow-hidden shadow-2xs flex flex-col">
                    <div className="bg-[#012E5E] text-white px-2.5 py-1.5 text-[11px] font-extrabold flex items-center justify-between border-b border-[#C99E4A]">
                      <span>خدمات الصيانة</span>
                      <Wrench className="w-3.5 h-3.5 text-[#DFC076]" />
                    </div>
                    <div className="p-2 flex items-center gap-2 flex-1">
                      <img
                        src={technicianImg}
                        alt="خدمات الصيانة"
                        className="w-16 h-14 rounded-lg object-cover border border-slate-200 shrink-0"
                      />
                      <div className="flex-1 grid grid-cols-2 gap-1 text-center">
                        <div className="bg-[#F4F8FC] rounded p-1 border border-slate-200">
                          <p className="text-[9.5px] font-bold text-slate-600">قسم المرافق</p>
                          <p className="text-sm font-black text-[#012E5E] tabular-nums" dir="ltr">
                            {formatNumber(report.maintenanceServices.fromFacilitiesDept)}
                          </p>
                        </div>
                        <div className="bg-[#FDF8EC] rounded p-1 border border-[#E4CFA0]">
                          <p className="text-[9.5px] font-bold text-[#785817]">إدارات أخرى</p>
                          <p className="text-sm font-black text-[#9A6700] tabular-nums" dir="ltr">
                            {formatNumber(report.maintenanceServices.fromOtherDepts)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Card 3: الدعم اللوجستي */}
                  <div className="rounded-xl border border-[#C5D8EE] bg-white overflow-hidden shadow-2xs flex flex-col">
                    <div className="bg-[#012E5E] text-white px-2.5 py-1.5 text-[11px] font-extrabold flex items-center justify-between border-b border-[#C99E4A]">
                      <span>الدعم اللوجستي</span>
                      <Truck className="w-3.5 h-3.5 text-[#DFC076]" />
                    </div>
                    <div className="p-2 flex items-center gap-2 flex-1">
                      <img
                        src={safetyImg}
                        alt="الدعم اللوجستي"
                        className="w-16 h-14 rounded-lg object-cover border border-slate-200 shrink-0"
                      />
                      <div className="flex-1 bg-[#EAF4FC] rounded-lg p-1.5 border border-[#B8CDE4] text-center">
                        <p className="text-[9.5px] font-bold text-[#0C4176]">إجمالي الطلبات اللوجستية</p>
                        <p className="text-base font-black text-[#012E5E] tabular-nums" dir="ltr">
                          {formatNumber(metrics.logisticsTotal)}
                        </p>
                        <p className="text-[9px] text-slate-600">عبر 5 قنوات تشغيلية</p>
                      </div>
                    </div>
                  </div>

                  {/* Card 4: خدمات الأمن والاستقبال */}
                  <div className="rounded-xl border border-[#C5D8EE] bg-white overflow-hidden shadow-2xs flex flex-col">
                    <div className="bg-[#012E5E] text-white px-2.5 py-1.5 text-[11px] font-extrabold flex items-center justify-between border-b border-[#C99E4A]">
                      <span>خدمات الأمن والاستقبال</span>
                      <UserCheck className="w-3.5 h-3.5 text-[#DFC076]" />
                    </div>
                    <div className="p-2 flex items-center gap-2 flex-1">
                      <img
                        src={receptionImg}
                        alt="خدمات الأمن والاستقبال"
                        className="w-16 h-14 rounded-lg object-cover border border-slate-200 shrink-0"
                      />
                      <div className="flex-1 grid grid-cols-2 gap-1 text-center">
                        <div className="bg-[#F4F8FC] rounded p-1 border border-slate-200">
                          <p className="text-[9.5px] font-bold text-slate-600">المستلمة</p>
                          <p className="text-sm font-black text-[#012E5E] tabular-nums" dir="ltr">
                            {formatNumber(metrics.securityTotals.totalReceived)}
                          </p>
                        </div>
                        <div className="bg-emerald-50 rounded p-1 border border-emerald-200">
                          <p className="text-[9.5px] font-bold text-[#069B74]">المنفذة</p>
                          <p className="text-sm font-black text-[#069B74] tabular-nums" dir="ltr">
                            {formatNumber(metrics.securityTotals.totalExecuted)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Row 2: 3 Summary Cards (Tasks, Challenges, Preparation/Approval) */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-2.5">
                  {/* Card 5: المهام والتحديات */}
                  <div className="lg:col-span-4 rounded-xl border border-[#C5D8EE] bg-white overflow-hidden shadow-2xs">
                    <div className="bg-[#0C4176] text-white px-2.5 py-1 text-[11px] font-extrabold flex items-center justify-between border-b border-[#C99E4A]">
                      <span>المهام التشغيلية والمتابعة</span>
                      <ClipboardCheck className="w-3.5 h-3.5 text-[#DFC076]" />
                    </div>
                    <div className="p-2 grid grid-cols-4 gap-1.5 text-center">
                      <div className="bg-[#F4F8FC] rounded p-1 border border-slate-200">
                        <p className="text-[9px] font-bold text-slate-600">الإجمالي</p>
                        <p className="text-xs font-black text-[#012E5E] tabular-nums" dir="ltr">
                          {formatNumber(metrics.tasksSummary.totalMeaningful)}
                        </p>
                      </div>
                      <div className="bg-emerald-50 rounded p-1 border border-emerald-200">
                        <p className="text-[9px] font-bold text-[#069B74]">المنجزة</p>
                        <p className="text-xs font-black text-[#069B74] tabular-nums" dir="ltr">
                          {formatNumber(metrics.tasksSummary.completed)}
                        </p>
                      </div>
                      <div className="bg-amber-50 rounded p-1 border border-amber-200">
                        <p className="text-[9px] font-bold text-[#9A6700]">قيد التنفيذ</p>
                        <p className="text-xs font-black text-[#9A6700] tabular-nums" dir="ltr">
                          {formatNumber(metrics.tasksSummary.inProgress)}
                        </p>
                      </div>
                      <div className="bg-rose-50 rounded p-1 border border-rose-200">
                        <p className="text-[9px] font-bold text-[#C43D47]">المتأخرة</p>
                        <p className="text-xs font-black text-[#C43D47] tabular-nums" dir="ltr">
                          {formatNumber(metrics.tasksSummary.delayed)}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Card 6: التحديات والتوصيات */}
                  <div className="lg:col-span-3 rounded-xl border border-[#C5D8EE] bg-white overflow-hidden shadow-2xs">
                    <div className="bg-[#0C4176] text-white px-2.5 py-1 text-[11px] font-extrabold flex items-center justify-between border-b border-[#C99E4A]">
                      <span>التحديات والتوصيات</span>
                      <ShieldAlert className="w-3.5 h-3.5 text-[#DFC076]" />
                    </div>
                    <div className="p-2 grid grid-cols-2 gap-1.5 text-center">
                      <div className="bg-amber-50/70 rounded p-1 border border-amber-200">
                        <p className="text-[9.5px] font-bold text-[#9A6700]">التحديات المرصودة</p>
                        <p className="text-sm font-black text-[#012E5E] tabular-nums" dir="ltr">
                          {formatNumber(report.challenges.filter((c) => c.challengeText.trim()).length)}
                        </p>
                      </div>
                      <div className="bg-[#EAF4FC] rounded p-1 border border-[#B8CDE4]">
                        <p className="text-[9.5px] font-bold text-[#0C4176]">التوصيات التنفيذية</p>
                        <p className="text-sm font-black text-[#1769AA] tabular-nums" dir="ltr">
                          {formatNumber(
                            report.challenges.filter((c) => c.recommendationText.trim()).length
                          )}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Card 7: الإعداد والمراجعة والاعتماد */}
                  <div className="lg:col-span-5 rounded-xl border border-[#C5D8EE] bg-white overflow-hidden shadow-2xs">
                    <div className="bg-[#012E5E] text-white px-2.5 py-1 text-[11px] font-extrabold flex items-center justify-between border-b border-[#C99E4A]">
                      <span>الإعداد والمراجعة والاعتماد</span>
                      <FileCheck2 className="w-3.5 h-3.5 text-[#DFC076]" />
                    </div>
                    <div className="p-2 grid grid-cols-3 gap-1.5 text-[10px]">
                      <div className="bg-[#F4F8FC] rounded p-1 border border-slate-200">
                        <p className="font-bold text-[#9A6700]">معد التقرير</p>
                        <p className="font-extrabold text-[#012E5E] truncate">
                          {report.preparerName || '—'}
                        </p>
                        <p className="text-[9px] text-[#069B74] font-bold truncate">
                          {report.preparerSignatureImage ? '✓ موقّع إلكترونياً' : 'قيد التوقيع'}
                        </p>
                      </div>
                      <div className="bg-[#F4F8FC] rounded p-1 border border-slate-200">
                        <p className="font-bold text-[#1769AA]">حالة المراجعة</p>
                        <p className="font-extrabold text-[#012E5E] truncate">
                          {STATUS_LABELS_AR[report.status]}
                        </p>
                        <p className="text-[9px] text-slate-500 font-mono" dir="ltr">
                          v{verNumber}
                        </p>
                      </div>
                      <div className="bg-[#F4F8FC] rounded p-1 border border-slate-200">
                        <p className="font-bold text-[#0C4176]">معتمد التقرير</p>
                        <p className="font-extrabold text-[#012E5E] truncate">
                          {report.approverName || '—'}
                        </p>
                        <p
                          className={`text-[9px] font-bold truncate ${
                            report.approverSignatureImage ? 'text-[#069B74]' : 'text-amber-700'
                          }`}
                        >
                          {report.approverSignatureImage ? '✓ موقّع إلكترونياً' : 'بانتظار التوقيع'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* SECTION 2: نظرة عامة على الأداء (3 Cards: Technical Ops Photo + Requests Table + Donut Chart) */}
            <section className="rounded-xl border border-[#B8CDE4] bg-white shadow-xs overflow-hidden">
              {renderRibbonHeader(
                '2. نظرة عامة على الأداء — الطلبات حسب الخدمة وتوزيع الأداء',
                'Performance Overview — Requests by Service & Distribution'
              )}
              <div className="p-3 grid grid-cols-1 lg:grid-cols-12 gap-3 items-stretch">
                {/* Right Column (3 cols): Technical Operations Photo Card */}
                <div className="lg:col-span-3 rounded-xl border border-[#C5D8EE] bg-[#F7FAFC] overflow-hidden flex flex-col justify-between">
                  <div className="bg-[#0C4176] text-white px-3 py-1.5 text-[11px] font-extrabold flex items-center justify-between border-b border-[#C99E4A]">
                    <span>المهام والتحديات الفنية</span>
                    <Wrench className="w-3.5 h-3.5 text-[#DFC076]" />
                  </div>
                  <div className="p-2.5 flex-1 flex flex-col justify-between space-y-2">
                    <div className="rounded-lg overflow-hidden border border-slate-200 relative h-32 bg-[#012E5E]">
                      <img
                        src={technicianImg}
                        alt="المهام والتحديات الفنية"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#012E5E]/85 via-transparent to-transparent flex items-end p-2">
                        <span className="text-[10px] font-bold text-white leading-tight">
                          كفاءة تشغيلية واستجابة فورية للبلاغات الفنية
                        </span>
                      </div>
                    </div>
                    <div className="space-y-1.5 text-[10.5px]">
                      <div className="flex items-center justify-between bg-white px-2.5 py-1.5 rounded-lg border border-slate-200">
                        <span className="font-bold text-slate-600">إجمالي الطلبات المستلمة</span>
                        <span className="font-black text-[#012E5E] tabular-nums" dir="ltr">
                          {formatNumber(metrics.totalReceived)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between bg-emerald-50/70 px-2.5 py-1.5 rounded-lg border border-emerald-200">
                        <span className="font-bold text-[#069B74]">إجمالي الطلبات المنفذة</span>
                        <span className="font-black text-[#069B74] tabular-nums" dir="ltr">
                          {formatNumber(metrics.totalExecuted)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between bg-[#FDF8EC] px-2.5 py-1.5 rounded-lg border border-[#E4CFA0]">
                        <span className="font-bold text-[#785817]">معدل الإنجاز العام</span>
                        <span className="font-black text-[#9A6700] tabular-nums" dir="ltr">
                          {formatPct(metrics.overallCompletionPct)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Middle Column (5 cols): Requests by Service Table */}
                <div className="lg:col-span-5 rounded-xl border border-[#C5D8EE] bg-white overflow-hidden flex flex-col">
                  <div className="bg-[#012E5E] text-white px-3 py-1.5 text-[11px] font-extrabold flex items-center justify-between border-b border-[#C99E4A]">
                    <span>الطلبات حسب الخدمة · Requests by Service</span>
                    <span className="text-[10px] text-[#DFC076]" dir="ltr">
                      {formatNumber(sortedRequestsByService.length)} Services
                    </span>
                  </div>
                  <table className="requests-by-service-table w-full text-[11px] border-collapse">
                    <colgroup>
                      <col style={{ width: '58%' }} />
                      <col style={{ width: '22%' }} />
                      <col style={{ width: '20%' }} />
                    </colgroup>
                    <thead className="bg-[#DCE9F6] text-[#012E5E] border-b border-[#B8CDE4]">
                      <tr>
                        <th className="py-1 px-2 text-start font-extrabold text-[11px]">الخدمة</th>
                        <th className="py-1 px-2 text-center font-extrabold text-[11px]">العدد</th>
                        <th className="py-1 px-2 text-center font-extrabold text-[11px]">النسبة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {sortedRequestsByService.map((s, idx) => {
                        const vis = getServiceVisual(s.serviceId, s.nameAr, idx);
                        return (
                          <tr
                            key={s.serviceId}
                            className={idx % 2 === 1 ? 'bg-[#F4F8FC]' : 'bg-white'}
                          >
                            <td className="py-1 px-2 font-bold text-[#012E5E] align-middle">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span
                                  className="w-2.5 h-2.5 rounded-full shrink-0"
                                  style={{ backgroundColor: vis.color }}
                                />
                                <span className="truncate">{s.nameAr}</span>
                              </div>
                            </td>
                            <td className="py-1 px-2 text-center align-middle">
                              <span
                                dir="ltr"
                                className="inline-flex items-center justify-center min-w-[60px] px-2 py-0.5 rounded bg-white border border-[#C5D8EE] font-black text-[#012E5E] tabular-nums text-[11px]"
                              >
                                {formatNumber(s.receivedCount)}
                              </span>
                            </td>
                            <td
                              className="py-1 px-2 text-center align-middle tabular-nums font-extrabold text-[#1769AA]"
                              dir="ltr"
                            >
                              {formatPct(s.shareOfTotalPct, '0.0%')}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-[#012E5E] text-white font-extrabold">
                      <tr>
                        <td className="py-1.5 px-2 text-[11px]">الإجمالي · Total</td>
                        <td
                          className="py-1.5 px-2 text-center tabular-nums text-[#DFC076] text-[11.5px]"
                          dir="ltr"
                        >
                          {formatNumber(metrics.totalReceived)}
                        </td>
                        <td className="py-1.5 px-2 text-center tabular-nums text-[11px]" dir="ltr">
                          {metrics.totalReceived > 0 ? formatPercentage(100) : '0.0%'}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Left Column (4 cols): Performance Distribution Donut Chart & Full Legend */}
                <div className="lg:col-span-4 rounded-xl border border-[#C5D8EE] bg-white overflow-hidden flex flex-col justify-between">
                  <div className="bg-[#012E5E] text-white px-3 py-1.5 text-[11px] font-extrabold flex items-center justify-between border-b border-[#C99E4A]">
                    <span>توزيع الأداء · Performance Distribution</span>
                    <span className="text-[10px] text-[#DFC076]">التوزيع النسبي</span>
                  </div>
                  <div className="p-2.5 flex-1 flex flex-col items-center justify-between">
                    {activeServicesForChart.length > 0 ? (
                      <>
                        <div className="relative flex items-center justify-center my-1">
                          <PieChart width={170} height={150}>
                            <Pie
                              data={activeServicesForChart}
                              dataKey="receivedCount"
                              nameKey="nameAr"
                              cx="50%"
                              cy="50%"
                              innerRadius={42}
                              outerRadius={68}
                              paddingAngle={2}
                              isAnimationActive={false}
                            >
                              {activeServicesForChart.map((d, i) => (
                                <Cell
                                  key={d.serviceId}
                                  fill={getServiceVisual(d.serviceId, d.nameAr, i).color}
                                />
                              ))}
                            </Pie>
                          </PieChart>
                          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
                            <span className="text-[9.5px] font-bold text-slate-500">الإجمالي</span>
                            <span
                              className="text-sm font-black text-[#012E5E] tabular-nums"
                              dir="ltr"
                            >
                              {formatNumber(metrics.totalReceived)}
                            </span>
                          </div>
                        </div>

                        {/* Color-coded legend for services */}
                        <div className="w-full grid grid-cols-2 gap-1 text-[9.5px] pt-1 border-t border-slate-100">
                          {activeServicesForChart.slice(0, 8).map((d, i) => {
                            const vis = getServiceVisual(d.serviceId, d.nameAr, i);
                            return (
                              <div
                                key={d.serviceId}
                                className="flex items-center justify-between gap-1 bg-[#F7FAFC] px-1.5 py-0.5 rounded border border-slate-200/80"
                              >
                                <div className="flex items-center gap-1 min-w-0">
                                  <span
                                    className="w-2 h-2 rounded-full shrink-0"
                                    style={{ backgroundColor: vis.color }}
                                  />
                                  <span className="truncate font-bold text-[#012E5E]">
                                    {d.nameAr}
                                  </span>
                                </div>
                                <span
                                  className="font-extrabold text-[#1769AA] tabular-nums shrink-0"
                                  dir="ltr"
                                >
                                  {formatPct(d.shareOfTotalPct, '0%')}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    ) : (
                      <p className="text-xs text-slate-500 py-12 text-center">
                        لا تتوفر طلبات مسجلة لعرض التوزيع النسبي
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </section>
          </div>

          {renderPageFooter(1)}
        </article>
      )}

      {/* ===================================================================== */}
      {/* PAGE 2: Section 3 (Services Summary) + Sections 4 & 5 (Contracts/Safety)*/}
      {/* ===================================================================== */}
      {shouldShowPage(2) && (
        <article
          id="official-report-page-2"
          data-page-number="2"
          className={`saaed-preview-sheet official-report-page mx-auto bg-white shadow-2xl border border-slate-200 flex flex-col justify-between ${sheetWidthClass}`}
        >
          {renderPageHeader(2)}

          <div className="p-4 sm:p-5 space-y-4 text-[#012E5E] flex-1">
            {/* SECTION 3: ملخص الخدمات ومؤشرات الإنجاز */}
            <section className="rounded-xl border border-[#B8CDE4] bg-white shadow-xs overflow-hidden">
              {renderRibbonHeader(
                '3. ملخص الخدمات ومؤشرات الإنجاز',
                'Services Summary & Completion Indicators'
              )}
              <div className="p-3">
                <table className="w-full text-xs border border-[#C5D8EE] border-collapse">
                  <thead className="bg-[#012E5E] text-white">
                    <tr>
                      <th className="py-1.5 px-2 text-center w-9 font-extrabold">#</th>
                      <th className="py-1.5 px-2.5 text-start font-extrabold">الخدمة · Service</th>
                      <th className="py-1.5 px-2 text-center w-24 font-extrabold">الطلبات المستلمة</th>
                      <th className="py-1.5 px-2 text-center w-24 font-extrabold">الطلبات المنفذة</th>
                      <th className="py-1.5 px-2.5 text-center w-40 font-extrabold">مؤشر الإنجاز</th>
                      <th className="py-1.5 px-2 text-center w-20 font-extrabold">النسبة</th>
                      <th className="py-1.5 px-2 text-center w-28 font-extrabold">المستوى</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {sortedSummary.map((s, idx) => {
                      const vis = getServiceVisual(s.serviceId, s.nameAr, idx);
                      const pctVal = Math.min(100, Math.max(0, s.completionPct ?? 0));
                      const badgeClass =
                        s.level.tone === 'emerald'
                          ? 'bg-emerald-50 text-[#069B74] border-emerald-300'
                          : s.level.tone === 'blue'
                            ? 'bg-sky-50 text-[#1769AA] border-sky-300'
                            : s.level.tone === 'amber' || s.level.tone === 'orange'
                              ? 'bg-amber-50 text-[#9A6700] border-amber-300'
                              : s.level.tone === 'red'
                                ? 'bg-rose-50 text-[#C43D47] border-rose-300'
                                : 'bg-slate-100 text-slate-600 border-slate-300';
                      const barColor =
                        s.level.tone === 'emerald'
                          ? '#069B74'
                          : s.level.tone === 'blue'
                            ? '#1769AA'
                            : s.level.tone === 'amber' || s.level.tone === 'orange'
                              ? '#C99E4A'
                              : s.level.tone === 'red'
                                ? '#C43D47'
                                : '#94A3B8';
                      return (
                        <tr
                          key={s.serviceId}
                          className={idx % 2 === 1 ? 'bg-[#F4F8FC]' : 'bg-white'}
                        >
                          <td
                            className="py-1.5 px-2 text-center tabular-nums font-bold text-slate-600"
                            dir="ltr"
                          >
                            {formatNumber(idx + 1)}
                          </td>
                          <td className="py-1.5 px-2.5 font-extrabold text-[#012E5E]">
                            <div className="flex items-center gap-2">
                              <span
                                className="w-3 h-3 rounded-md shrink-0"
                                style={{ backgroundColor: vis.color }}
                              />
                              <span>{s.nameAr}</span>
                            </div>
                          </td>
                          <td className="py-1.5 px-2 text-center">
                            <span
                              dir="ltr"
                              className="inline-flex items-center justify-center min-w-[64px] px-2 py-0.5 rounded bg-white border border-[#C5D8EE] font-black text-[#012E5E] tabular-nums"
                            >
                              {formatNumber(s.receivedCount)}
                            </span>
                          </td>
                          <td className="py-1.5 px-2 text-center">
                            <span
                              dir="ltr"
                              className="inline-flex items-center justify-center min-w-[64px] px-2 py-0.5 rounded bg-emerald-50/70 border border-emerald-300 font-black text-[#069B74] tabular-nums"
                            >
                              {formatNumber(s.executedCount)}
                            </span>
                          </td>
                          <td className="py-1.5 px-2.5 align-middle">
                            <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden border border-slate-300/80">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${pctVal}%`,
                                  backgroundColor: barColor,
                                }}
                              />
                            </div>
                          </td>
                          <td
                            className="py-1.5 px-2 text-center font-black tabular-nums text-[#012E5E]"
                            dir="ltr"
                          >
                            {formatPct(s.completionPct, '—')}
                          </td>
                          <td className="py-1.5 px-2 text-center">
                            <span
                              className={`inline-block px-2 py-0.5 rounded-full text-[10.5px] font-extrabold border ${badgeClass}`}
                            >
                              {s.level.labelAr}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-[#012E5E] text-white font-extrabold">
                    <tr>
                      <td colSpan={2} className="py-2 px-3">
                        الإجمالي العام ({formatNumber(sortedSummary.length)} خدمة) · Grand Total
                      </td>
                      <td className="py-2 px-2 text-center tabular-nums text-[#DFC076]" dir="ltr">
                        {formatNumber(metrics.totalReceived)}
                      </td>
                      <td className="py-2 px-2 text-center tabular-nums text-emerald-300" dir="ltr">
                        {formatNumber(metrics.totalExecuted)}
                      </td>
                      <td className="py-2 px-2.5 align-middle">
                        <div className="w-full h-2.5 bg-white/20 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#DFC076] rounded-full"
                            style={{
                              width: `${Math.min(100, Math.max(0, metrics.overallCompletionPct ?? 0))}%`,
                            }}
                          />
                        </div>
                      </td>
                      <td className="py-2 px-2 text-center tabular-nums text-[#DFC076]" dir="ltr">
                        {formatPct(metrics.overallCompletionPct, '—')}
                      </td>
                      <td className="py-2 px-2 text-center text-[#DFC076]">المعدل العام</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>

            {/* SECTIONS 4 & 5: العقود والرخص + الطفايات وملاحظات المخاطر (Card Layout + Photos) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
              {/* Section 4: العقود والرخص (3 Tinted Cards) */}
              <section className="lg:col-span-7 rounded-xl border border-[#B8CDE4] bg-white shadow-xs overflow-hidden flex flex-col">
                {renderRibbonHeader('4. العقود والرخص', 'Contracts & Licenses')}
                <div className="p-3 grid grid-cols-1 sm:grid-cols-3 gap-2.5 flex-1">
                  {report.contracts.map((c, idx) => {
                    const cardSkins = [
                      'from-[#EAF4FC] to-[#F7FAFC] border-[#96C2EC]',
                      'from-[#F3EBDA] to-[#FAF5EA] border-[#DEC488]',
                      'from-[#E3F7F3] to-[#F1FBF9] border-[#8FD4C1]',
                    ];
                    const headerSkins = ['bg-[#0C4176]', 'bg-[#8C641E]', 'bg-[#067A5B]'];
                    return (
                      <div
                        key={c.groupKey}
                        className={`rounded-xl border bg-gradient-to-b ${
                          cardSkins[idx % cardSkins.length]
                        } overflow-hidden flex flex-col justify-between shadow-2xs`}
                      >
                        <div>
                          <div
                            className={`${
                              headerSkins[idx % headerSkins.length]
                            } text-white px-2.5 py-1.5 text-xs font-extrabold flex items-center justify-between`}
                          >
                            <span>{c.nameAr}</span>
                            <span className="text-[10px] text-white/80 font-mono" dir="ltr">
                              {c.nameEn}
                            </span>
                          </div>
                          <div className="p-2.5 grid grid-cols-2 gap-2 text-center">
                            <div className="bg-white rounded-lg p-1.5 border border-emerald-300 shadow-2xs">
                              <p className="text-[10px] font-extrabold text-[#069B74]">الفعّالة</p>
                              <p
                                className="text-lg font-black text-[#069B74] tabular-nums mt-0.5"
                                dir="ltr"
                              >
                                {formatNumber(c.activeCount)}
                              </p>
                            </div>
                            <div className="bg-white rounded-lg p-1.5 border border-rose-300 shadow-2xs">
                              <p className="text-[10px] font-extrabold text-[#C43D47]">غير الفعّالة</p>
                              <p
                                className="text-lg font-black text-[#C43D47] tabular-nums mt-0.5"
                                dir="ltr"
                              >
                                {formatNumber(c.inactiveCount)}
                              </p>
                            </div>
                          </div>
                        </div>
                        <div className="px-2.5 pb-2.5">
                          <div className="bg-white/90 rounded-lg p-2 border border-slate-200 text-[10.5px] min-h-[54px]">
                            <p className="font-extrabold text-[#012E5E] mb-0.5">الملاحظات:</p>
                            <p className="text-slate-700 whitespace-pre-wrap break-words leading-relaxed">
                              {c.notes || 'لا توجد ملاحظات مسجلة'}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Section 5: الطفايات وملاحظات المخاطر (2 Photo Cards) */}
              <section className="lg:col-span-5 rounded-xl border border-[#B8CDE4] bg-white shadow-xs overflow-hidden flex flex-col">
                {renderRibbonHeader('5. الطفايات وملاحظات المخاطر', 'Fire Safety & Hazard Notes')}
                <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5 flex-1">
                  {report.safety.map((s, idx) => {
                    const isFire = s.groupKey === 'fire_extinguishers' || idx === 0;
                    const photoSrc = isFire ? fireExtImg : safetyImg;
                    const primaryLabel = isFire ? 'صالحة / فعّالة' : 'مغلقة / معالجة';
                    const secondaryLabel = isFire ? 'تحتاج صيانة' : 'قيد المعالجة';
                    return (
                      <div
                        key={s.groupKey}
                        className="rounded-xl border border-[#C5D8EE] bg-gradient-to-b from-[#F7FAFC] to-white overflow-hidden flex flex-col justify-between shadow-2xs"
                      >
                        <div>
                          <div className="bg-[#012E5E] text-white px-2.5 py-1.5 text-xs font-extrabold flex items-center justify-between border-b border-[#C99E4A]">
                            <span>{s.nameAr}</span>
                            <Flame className="w-3.5 h-3.5 text-[#DFC076]" />
                          </div>
                          <div className="p-2.5 pb-1.5 flex items-center gap-2">
                            <img
                              src={photoSrc}
                              alt={s.nameAr}
                              className="w-14 h-14 rounded-lg object-cover border border-slate-200 shrink-0"
                            />
                            <div className="flex-1 grid grid-cols-2 gap-1.5 text-center">
                              <div className="bg-emerald-50 rounded-lg p-1 border border-emerald-300">
                                <p className="text-[9.5px] font-bold text-[#069B74]">
                                  {primaryLabel}
                                </p>
                                <p
                                  className="text-base font-black text-[#069B74] tabular-nums"
                                  dir="ltr"
                                >
                                  {formatNumber(s.primaryCount)}
                                </p>
                              </div>
                              <div className="bg-rose-50 rounded-lg p-1 border border-rose-300">
                                <p className="text-[9.5px] font-bold text-[#C43D47]">
                                  {secondaryLabel}
                                </p>
                                <p
                                  className="text-base font-black text-[#C43D47] tabular-nums"
                                  dir="ltr"
                                >
                                  {formatNumber(s.secondaryCount)}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="px-2.5 pb-2.5">
                          <div className="bg-white rounded-lg p-2 border border-slate-200 text-[10.5px] min-h-[54px]">
                            <p className="font-extrabold text-[#012E5E] mb-0.5">الملاحظات:</p>
                            <p className="text-slate-700 whitespace-pre-wrap break-words leading-relaxed">
                              {s.notes || 'لا توجد ملاحظات مسجلة'}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>
          </div>

          {renderPageFooter(2)}
        </article>
      )}

      {/* ===================================================================== */}
      {/* PAGE 3: Section 6 (4 Maintenance KPIs + Full Matrix + Site Bar Chart) */}
      {/* ===================================================================== */}
      {shouldShowPage(3) && (
        <article
          id="official-report-page-3"
          data-page-number="3"
          className={`saaed-preview-sheet official-report-page mx-auto bg-white shadow-2xl border border-slate-200 flex flex-col justify-between ${sheetWidthClass}`}
        >
          {renderPageHeader(3)}

          <div className="p-4 sm:p-5 space-y-3.5 text-[#012E5E] flex-1">
            <section className="rounded-xl border border-[#B8CDE4] bg-white shadow-xs overflow-hidden">
              {renderRibbonHeader(
                '6. تفاصيل الصيانة بالمقرات والتكاليف المالية',
                'Maintenance Details by Site, Fault Category & Financial Costs'
              )}

              <div className="p-3 space-y-3">
                {/* 4 Maintenance KPI Cards at top of Section 6 */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="rounded-xl border border-[#96C2EC] bg-gradient-to-br from-[#EAF4FC] to-white p-2.5 shadow-2xs">
                    <p className="text-[10.5px] font-bold text-[#0C4176]">إجمالي الأعطال المسجلة</p>
                    <p className="text-xl font-black text-[#012E5E] tabular-nums mt-0.5" dir="ltr">
                      {formatNumber(metrics.maintenance.grandTotalFaults)}
                    </p>
                    <p className="text-[9.5px] text-slate-600 mt-0.5">
                      موزعة على {formatNumber(sites.length)} مقرات
                    </p>
                  </div>

                  <div className="rounded-xl border border-[#DEC488] bg-gradient-to-br from-[#FDF8EC] to-white p-2.5 shadow-2xs">
                    <p className="text-[10.5px] font-bold text-[#785817]">المقر الأعلى في الأعطال</p>
                    <p className="text-sm font-black text-[#012E5E] truncate mt-1">
                      {topFaultSite ? topFaultSite.site.nameAr : 'لا توجد أعطال'}
                    </p>
                    <p className="text-[10px] font-extrabold text-[#9A6700] mt-0.5">
                      {topFaultSite ? (
                        <>
                          <span dir="ltr" className="tabular-nums">
                            {formatNumber(topFaultSite.faults)}
                          </span>{' '}
                          عطلاً
                        </>
                      ) : (
                        '—'
                      )}
                    </p>
                  </div>

                  <div className="rounded-xl border border-[#8FD4C1] bg-gradient-to-br from-[#E3F7F3] to-white p-2.5 shadow-2xs">
                    <p className="text-[10.5px] font-bold text-[#056C51]">إجمالي التكلفة / النثرية</p>
                    <p className="text-base font-black text-[#069B74] tabular-nums mt-1" dir="ltr">
                      {formatAed(metrics.maintenance.pettyCashTotalAed)}
                    </p>
                    <p className="text-[9.5px] text-slate-600 mt-0.5">مصروفات الصيانة النثرية</p>
                  </div>

                  <div className="rounded-xl border border-[#B3C2F2] bg-gradient-to-br from-[#E7EBFC] to-white p-2.5 shadow-2xs">
                    <p className="text-[10.5px] font-bold text-[#012E5E]">إجمالي التكلفة / أمر شراء</p>
                    <p className="text-base font-black text-[#0C4176] tabular-nums mt-1" dir="ltr">
                      {formatAed(metrics.maintenance.purchaseOrderTotalAed)}
                    </p>
                    <p className="text-[9.5px] text-slate-600 mt-0.5">أوامر الشراء المعتمدة</p>
                  </div>
                </div>

                {/* Full Sites × Categories Matrix Table */}
                <div className="w-full space-y-2.5">
                  {(() => {
                    const maxCatsPerTable = orientation === 'portrait' ? 8 : 12;
                    const chunks: MaintenanceCategory[][] = [];
                    for (let i = 0; i < categories.length; i += maxCatsPerTable) {
                      chunks.push(categories.slice(i, i + maxCatsPerTable));
                    }
                    if (chunks.length === 0) chunks.push([]);

                    return chunks.map((chunkCats, chunkIdx) => {
                      const isLastChunk = chunkIdx === chunks.length - 1;
                      const siteColPct = 15;
                      const totalColPct = isLastChunk ? 9.5 : 0;
                      const catCount = chunkCats.length || 1;
                      const catColPct = Number(
                        ((100 - siteColPct - totalColPct) / catCount).toFixed(3)
                      );
                      return (
                        <table
                          key={chunkIdx}
                          className="w-full text-[10.5px] border border-[#C5D8EE] table-fixed border-collapse"
                        >
                          <colgroup>
                            <col style={{ width: `${siteColPct}%` }} />
                            {chunkCats.map((c) => (
                              <col key={c.id} style={{ width: `${catColPct}%` }} />
                            ))}
                            {isLastChunk && <col style={{ width: `${totalColPct}%` }} />}
                          </colgroup>
                          <thead className="bg-[#012E5E] text-white">
                            <tr>
                              <th className="py-1.5 px-1.5 text-start font-extrabold text-[10.5px] truncate">
                                {chunks.length > 1
                                  ? `المقر / البيان (${chunkIdx + 1}/${chunks.length})`
                                  : 'المقر / البيان'}
                              </th>
                              {chunkCats.map((cat) => (
                                <th
                                  key={cat.id}
                                  className="py-1 px-0.5 text-center font-bold text-[9.5px] leading-[1.15] break-words"
                                >
                                  {cat.nameAr}
                                </th>
                              ))}
                              {isLastChunk && (
                                <th className="py-1.5 px-1 text-center font-extrabold text-[10.5px] bg-[#0C4176]">
                                  الإجمالي
                                </th>
                              )}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {sites.map((site, sIdx) => (
                              <tr
                                key={site.id}
                                className={sIdx % 2 === 1 ? 'bg-[#F4F8FC]' : 'bg-white'}
                              >
                                <td className="py-1 px-1.5 font-extrabold text-[#012E5E] text-[10.5px] truncate">
                                  {site.nameAr}
                                </td>
                                {chunkCats.map((cat) => {
                                  const v = report.maintenanceMatrix[site.id]?.[cat.id] ?? 0;
                                  return (
                                    <td
                                      key={cat.id}
                                      className={`py-1 px-0.5 text-center tabular-nums text-[10.5px] ${
                                        v > 0
                                          ? 'font-extrabold text-[#012E5E] bg-sky-50/50'
                                          : 'text-slate-500'
                                      }`}
                                      dir="ltr"
                                    >
                                      {formatNumber(v)}
                                    </td>
                                  );
                                })}
                                {isLastChunk && (
                                  <td
                                    className="py-1 px-1 text-center font-black tabular-nums text-[#012E5E] bg-[#EAF4FC] text-[10.5px]"
                                    dir="ltr"
                                  >
                                    {formatNumber(metrics.maintenance.siteTotals[site.id] ?? 0)}
                                  </td>
                                )}
                              </tr>
                            ))}
                            {/* Row: Total Faults per Category */}
                            <tr className="bg-[#DCE9F6] font-extrabold border-t-2 border-[#96C2EC]">
                              <td className="py-1 px-1.5 text-[#012E5E] text-[10.5px]">
                                إجمالي عدد الأعطال
                              </td>
                              {chunkCats.map((cat) => (
                                <td
                                  key={cat.id}
                                  className="py-1 px-0.5 text-center tabular-nums text-[#012E5E] text-[10.5px]"
                                  dir="ltr"
                                >
                                  {formatNumber(metrics.maintenance.categoryTotals[cat.id] ?? 0)}
                                </td>
                              ))}
                              {isLastChunk && (
                                <td
                                  className="py-1 px-1 text-center tabular-nums text-[#069B74] font-black text-[11px]"
                                  dir="ltr"
                                >
                                  {formatNumber(metrics.maintenance.grandTotalFaults)}
                                </td>
                              )}
                            </tr>
                            {/* Row: Petty Cash AED */}
                            <tr className="bg-white">
                              <td className="py-1 px-1.5 font-bold text-[#056C51] text-[10px]">
                                التكلفة / النثرية (AED)
                              </td>
                              {chunkCats.map((cat) => (
                                <td
                                  key={cat.id}
                                  className="py-1 px-0.5 text-center tabular-nums text-slate-700 text-[9.5px]"
                                  dir="ltr"
                                >
                                  {formatDecimalFixed(
                                    report.maintenanceCosts[cat.id]?.pettyCashAed ?? 0
                                  )}
                                </td>
                              ))}
                              {isLastChunk && (
                                <td
                                  className="py-1 px-1 text-center font-extrabold tabular-nums text-[#069B74] bg-emerald-50/60 text-[10px]"
                                  dir="ltr"
                                >
                                  {formatAed(metrics.maintenance.pettyCashTotalAed)}
                                </td>
                              )}
                            </tr>
                            {/* Row: Purchase Order AED */}
                            <tr className="bg-[#F8FAFC]">
                              <td className="py-1 px-1.5 font-bold text-[#0C4176] text-[10px]">
                                التكلفة / أمر شراء (AED)
                              </td>
                              {chunkCats.map((cat) => (
                                <td
                                  key={cat.id}
                                  className="py-1 px-0.5 text-center tabular-nums text-slate-700 text-[9.5px]"
                                  dir="ltr"
                                >
                                  {formatDecimalFixed(
                                    report.maintenanceCosts[cat.id]?.purchaseOrderAed ?? 0
                                  )}
                                </td>
                              ))}
                              {isLastChunk && (
                                <td
                                  className="py-1 px-1 text-center font-extrabold tabular-nums text-[#0C4176] bg-sky-50/60 text-[10px]"
                                  dir="ltr"
                                >
                                  {formatAed(metrics.maintenance.purchaseOrderTotalAed)}
                                </td>
                              )}
                            </tr>
                          </tbody>
                        </table>
                      );
                    });
                  })()}
                </div>

                {/* Grand Maintenance Cost Banner */}
                <div className="bg-gradient-to-l from-[#012E5E] via-[#083A72] to-[#0C4176] border border-[#C99E4A] rounded-xl px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs font-extrabold text-white">
                  <span>
                    إجمالي تكاليف الصيانة الكلية المعتمدة (النثرية + أوامر الشراء) · Grand Maintenance Cost
                  </span>
                  <span dir="ltr" className="tabular-nums text-sm text-[#DFC076] font-black">
                    {formatAed(metrics.maintenance.grandTotalCostAed)}
                  </span>
                </div>

                {/* Executive Horizontal Facility Comparison Chart */}
                <MaintenanceSiteHorizontalChart
                  sites={sites}
                  categories={categories}
                  siteTotals={metrics.maintenance.siteTotals}
                  maintenanceMatrix={report.maintenanceMatrix}
                  grandTotalFaults={metrics.maintenance.grandTotalFaults}
                  variant="print"
                />
              </div>
            </section>
          </div>

          {renderPageFooter(3)}
        </article>
      )}

      {/* ===================================================================== */}
      {/* PAGE 4: Section 8 (Logistics) + Section 7 (Maint Sources) + Section 9 */}
      {/* ===================================================================== */}
      {shouldShowPage(4) && (
        <article
          id="official-report-page-4"
          data-page-number="4"
          className={`saaed-preview-sheet official-report-page mx-auto bg-white shadow-2xl border border-slate-200 flex flex-col justify-between ${sheetWidthClass}`}
        >
          {renderPageHeader(4)}

          <div className="p-4 sm:p-5 space-y-4 text-[#012E5E] flex-1">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
              {/* SECTION 8: الدعم اللوجستي (Horizontal Table + Executive Horizontal Bar Chart) */}
              <section className="lg:col-span-7 rounded-xl border border-[#B8CDE4] bg-white shadow-xs overflow-hidden flex flex-col">
                {renderRibbonHeader('8. الدعم اللوجستي', 'Logistics Channels')}
                <div className="p-3 space-y-2.5 flex-1 flex flex-col justify-between">
                  <table className="w-full text-[11px] border border-[#C5D8EE] border-collapse table-fixed">
                    <thead className="bg-[#012E5E] text-white">
                      <tr>
                        <th className="py-1.5 px-2 text-start font-extrabold w-24">البيان</th>
                        {metrics.logisticsWithPct.map((l) => (
                          <th key={l.channelKey} className="py-1.5 px-1 text-center font-extrabold">
                            {l.nameAr}
                          </th>
                        ))}
                        <th className="py-1.5 px-1.5 text-center font-extrabold bg-[#0C4176] w-20">
                          الإجمالي
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      <tr className="bg-white">
                        <td className="py-1.5 px-2 font-extrabold text-[#012E5E]">الطلبات</td>
                        {metrics.logisticsWithPct.map((l) => (
                          <td
                            key={l.channelKey}
                            className="py-1.5 px-1 text-center font-black text-[#012E5E] tabular-nums"
                            dir="ltr"
                          >
                            {formatNumber(l.requestCount)}
                          </td>
                        ))}
                        <td
                          className="py-1.5 px-1.5 text-center font-black text-[#012E5E] bg-[#EAF4FC] tabular-nums"
                          dir="ltr"
                        >
                          {formatNumber(metrics.logisticsTotal)}
                        </td>
                      </tr>
                      <tr className="bg-[#F4F8FC]">
                        <td className="py-1.5 px-2 font-bold text-slate-600">النسبة المئوية</td>
                        {metrics.logisticsWithPct.map((l) => (
                          <td
                            key={l.channelKey}
                            className="py-1.5 px-1 text-center font-bold text-[#1769AA] tabular-nums"
                            dir="ltr"
                          >
                            {formatPct(l.sharePct, '0.0%')}
                          </td>
                        ))}
                        <td
                          className="py-1.5 px-1.5 text-center font-extrabold text-[#069B74] bg-[#EAF4FC] tabular-nums"
                          dir="ltr"
                        >
                          {metrics.logisticsTotal > 0 ? formatPercentage(100) : '0.0%'}
                        </td>
                      </tr>
                    </tbody>
                  </table>

                  <LogisticsHorizontalChart channels={report.logistics} variant="print" />
                </div>
              </section>

              {/* SECTION 7: خدمات الصيانة (Sources Table + Donut Chart) */}
              <section className="lg:col-span-5 rounded-xl border border-[#B8CDE4] bg-white shadow-xs overflow-hidden flex flex-col">
                {renderRibbonHeader('7. خدمات الصيانة (مصادر الطلبات)', 'Maintenance Services Sources')}
                <div className="p-3 space-y-3 flex-1 flex flex-col justify-between">
                  <table className="w-full text-xs border border-[#C5D8EE] border-collapse">
                    <thead className="bg-[#012E5E] text-white">
                      <tr>
                        <th className="py-1.5 px-2.5 text-start font-extrabold">مصدر طلب الصيانة</th>
                        <th className="py-1.5 px-2 text-center font-extrabold w-24">العدد</th>
                        <th className="py-1.5 px-2 text-center font-extrabold w-20">النسبة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      <tr className="bg-white">
                        <td className="py-2 px-2.5 font-extrabold text-[#012E5E]">
                          عدد طلبات الصيانة الواردة من قسم المرافق
                        </td>
                        <td
                          className="py-2 px-2 text-center font-black text-[#0C4176] tabular-nums"
                          dir="ltr"
                        >
                          {formatNumber(maintFromFM)}
                        </td>
                        <td
                          className="py-2 px-2 text-center font-bold text-slate-600 tabular-nums"
                          dir="ltr"
                        >
                          {formatPercentage(maintFmPct)}
                        </td>
                      </tr>
                      <tr className="bg-[#F4F8FC]">
                        <td className="py-2 px-2.5 font-extrabold text-[#012E5E]">
                          عدد طلبات الصيانة الواردة من الإدارات الأخرى
                        </td>
                        <td
                          className="py-2 px-2 text-center font-black text-[#9A6700] tabular-nums"
                          dir="ltr"
                        >
                          {formatNumber(maintFromOther)}
                        </td>
                        <td
                          className="py-2 px-2 text-center font-bold text-slate-600 tabular-nums"
                          dir="ltr"
                        >
                          {formatPercentage(maintOtherPct)}
                        </td>
                      </tr>
                    </tbody>
                    <tfoot className="bg-[#012E5E] text-white font-extrabold">
                      <tr>
                        <td className="py-2 px-2.5">الإجمالي · Total</td>
                        <td className="py-2 px-2 text-center tabular-nums text-[#DFC076]" dir="ltr">
                          {formatNumber(maintTotal)}
                        </td>
                        <td className="py-2 px-2 text-center tabular-nums" dir="ltr">
                          {maintTotal > 0 ? formatPercentage(100) : '0.0%'}
                        </td>
                      </tr>
                    </tfoot>
                  </table>

                  {/* Maintenance Sources Donut Chart & Legend */}
                  <div className="rounded-xl border border-[#C5D8EE] bg-[#F7FAFC] p-2.5 flex items-center justify-between gap-3">
                    <div className="relative flex items-center justify-center shrink-0">
                      {maintChartData.length > 0 ? (
                        <>
                          <PieChart width={120} height={110}>
                            <Pie
                              data={maintChartData}
                              dataKey="value"
                              nameKey="name"
                              cx="50%"
                              cy="50%"
                              innerRadius={30}
                              outerRadius={48}
                              paddingAngle={2}
                              isAnimationActive={false}
                            >
                              {maintChartData.map((d) => (
                                <Cell key={d.name} fill={d.color} />
                              ))}
                            </Pie>
                          </PieChart>
                          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                            <span
                              className="text-xs font-black text-[#012E5E] tabular-nums"
                              dir="ltr"
                            >
                              {formatNumber(maintTotal)}
                            </span>
                          </div>
                        </>
                      ) : (
                        <div className="w-24 h-24 flex items-center justify-center text-[10px] text-slate-400">
                          لا توجد بيانات
                        </div>
                      )}
                    </div>
                    <div className="flex-1 space-y-1.5 text-[11px]">
                      <p className="font-extrabold text-[#012E5E] text-xs">
                        توزيع مصادر طلبات الصيانة
                      </p>
                      <div className="flex items-center justify-between bg-white px-2.5 py-1.5 rounded-lg border border-slate-200">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-[#0C4176]" />
                          <span className="font-bold text-[#012E5E]">من قسم المرافق</span>
                        </div>
                        <span className="font-extrabold text-[#0C4176] tabular-nums" dir="ltr">
                          {formatNumber(maintFromFM)} ({formatPercentage(maintFmPct)})
                        </span>
                      </div>
                      <div className="flex items-center justify-between bg-white px-2.5 py-1.5 rounded-lg border border-slate-200">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-[#C99E4A]" />
                          <span className="font-bold text-[#012E5E]">من الإدارات الأخرى</span>
                        </div>
                        <span className="font-extrabold text-[#9A6700] tabular-nums" dir="ltr">
                          {formatNumber(maintFromOther)} ({formatPercentage(maintOtherPct)})
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            </div>

            {/* SECTION 9: خدمات الأمن والاستقبال (Horizontal Matrix Layout matching Live Report) */}
            <section className="rounded-xl border border-[#B8CDE4] bg-white shadow-xs overflow-hidden">
              {renderRibbonHeader(
                '9. خدمات الأمن والاستقبال',
                'Security & Reception Services Matrix'
              )}
              <div className="p-3 space-y-2.5">
                {(() => {
                  const secItems = metrics.securityWithPct;
                  const maxPerRow = orientation === 'portrait' ? 5 : 8;
                  const chunks: typeof secItems[] = [];
                  for (let i = 0; i < secItems.length; i += maxPerRow) {
                    chunks.push(secItems.slice(i, i + maxPerRow));
                  }
                  if (chunks.length === 0) chunks.push([]);

                  return chunks.map((chunk, cIdx) => {
                    const isLast = cIdx === chunks.length - 1;
                    return (
                      <table
                        key={cIdx}
                        className="w-full text-[11px] border border-[#C5D8EE] border-collapse table-fixed"
                      >
                        <thead className="bg-[#012E5E] text-white">
                          <tr>
                            <th className="py-1.5 px-2 text-start font-extrabold w-32">البيان</th>
                            {chunk.map((sr) => (
                              <th
                                key={sr.activityKey}
                                className="py-1.5 px-1 text-center font-extrabold leading-tight break-words"
                              >
                                {sr.nameAr}
                              </th>
                            ))}
                            {isLast && (
                              <th className="py-1.5 px-2 text-center font-extrabold bg-[#0C4176] w-24">
                                الإجمالي ({formatNumber(secItems.length)})
                              </th>
                            )}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          <tr className="bg-white">
                            <td className="py-1.5 px-2 font-extrabold text-[#012E5E]">
                              الطلبات المستلمة
                            </td>
                            {chunk.map((sr) => (
                              <td
                                key={sr.activityKey}
                                className="py-1.5 px-1 text-center font-black text-[#012E5E] tabular-nums"
                                dir="ltr"
                              >
                                {formatNumber(sr.receivedCount)}
                              </td>
                            ))}
                            {isLast && (
                              <td
                                className="py-1.5 px-2 text-center font-black text-[#012E5E] bg-[#EAF4FC] tabular-nums"
                                dir="ltr"
                              >
                                {formatNumber(metrics.securityTotals.totalReceived)}
                              </td>
                            )}
                          </tr>
                          <tr className="bg-[#F4F8FC]">
                            <td className="py-1.5 px-2 font-extrabold text-[#069B74]">
                              الطلبات المنفذة
                            </td>
                            {chunk.map((sr) => (
                              <td
                                key={sr.activityKey}
                                className="py-1.5 px-1 text-center font-black text-[#069B74] tabular-nums"
                                dir="ltr"
                              >
                                {formatNumber(sr.executedCount)}
                              </td>
                            ))}
                            {isLast && (
                              <td
                                className="py-1.5 px-2 text-center font-black text-[#069B74] bg-emerald-50 tabular-nums"
                                dir="ltr"
                              >
                                {formatNumber(metrics.securityTotals.totalExecuted)}
                              </td>
                            )}
                          </tr>
                          <tr className="bg-white">
                            <td className="py-1.5 px-2 font-extrabold text-[#1769AA]">
                              نسبة الإنجاز
                            </td>
                            {chunk.map((sr) => (
                              <td
                                key={sr.activityKey}
                                className="py-1.5 px-1 text-center font-extrabold text-[#1769AA] tabular-nums"
                                dir="ltr"
                              >
                                {formatPct(sr.completionPct, '—')}
                              </td>
                            ))}
                            {isLast && (
                              <td
                                className="py-1.5 px-2 text-center font-black text-[#012E5E] bg-[#FDF8EC] tabular-nums"
                                dir="ltr"
                              >
                                {formatPct(metrics.securityTotals.overallCompletionPct, '—')}
                              </td>
                            )}
                          </tr>
                        </tbody>
                      </table>
                    );
                  });
                })()}
              </div>
            </section>
          </div>

          {renderPageFooter(4)}
        </article>
      )}

      {/* ===================================================================== */}
      {/* PAGE 5: Section 10 (Tasks) + Section 11 (Challenges) + Section 12     */}
      {/* ===================================================================== */}
      {shouldShowPage(5) && (
        <article
          id="official-report-page-5"
          data-page-number="5"
          className={`saaed-preview-sheet official-report-page mx-auto bg-white shadow-2xl border border-slate-200 flex flex-col justify-between ${sheetWidthClass}`}
        >
          {renderPageHeader(5)}

          <div className="p-4 sm:p-5 space-y-4 text-[#012E5E] flex-1">
            {/* SECTION 10: المهام التشغيلية والمتابعة (Full Auto-Wrapped Subject & Task + Visual Progress Bar) */}
            <section className="rounded-xl border border-[#B8CDE4] bg-white shadow-xs overflow-hidden">
              {renderRibbonHeader('10. المهام التشغيلية والمتابعة', 'Operational Tasks & Milestones')}
              <div className="p-3">
                <table className="w-full text-xs border border-[#C5D8EE] border-collapse">
                  <thead className="bg-[#012E5E] text-white">
                    <tr>
                      <th className="py-1.5 px-2 text-center w-9 font-extrabold">#</th>
                      <th className="py-1.5 px-2.5 text-start w-1/4 font-extrabold">
                        الموضوع · Subject
                      </th>
                      <th className="py-1.5 px-2.5 text-start font-extrabold">المهمة · Task</th>
                      <th className="py-1.5 px-2 text-center w-28 font-extrabold">الحالة</th>
                      <th className="py-1.5 px-2 text-center w-20 font-extrabold">نسبة الإنجاز</th>
                      <th className="py-1.5 px-2.5 text-center w-32 font-extrabold">المؤشر</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {report.tasks.map((t, idx) => {
                      const pct = Math.min(100, Math.max(0, t.completionPct || 0));
                      const statusColors =
                        t.status === 'completed'
                          ? 'bg-emerald-50 text-[#069B74] border-emerald-300'
                          : t.status === 'in_progress'
                            ? 'bg-amber-50 text-[#9A6700] border-amber-300'
                            : t.status === 'delayed'
                              ? 'bg-rose-50 text-[#C43D47] border-rose-300'
                              : 'bg-slate-100 text-slate-700 border-slate-300';
                      const barFill =
                        t.status === 'completed' || pct >= 90
                          ? '#069B74'
                          : pct >= 50
                            ? '#1769AA'
                            : '#C99E4A';
                      return (
                        <tr
                          key={t.id}
                          className={`align-middle ${
                            idx % 2 === 1 ? 'bg-[#F4F8FC]' : 'bg-white'
                          }`}
                        >
                          <td
                            className="py-2 px-2 text-center tabular-nums font-bold align-middle"
                            dir="ltr"
                          >
                            {formatNumber(idx + 1)}
                          </td>
                          <td
                            className="py-2 px-2.5 subject-cell whitespace-pre-wrap break-words leading-[1.6] font-extrabold text-[#012E5E] align-middle"
                            dir="rtl"
                          >
                            {t.topic || '—'}
                          </td>
                          <td
                            className="py-2 px-2.5 whitespace-pre-wrap break-words leading-[1.6] text-slate-800 align-middle"
                            dir="rtl"
                          >
                            {t.taskName || '—'}
                          </td>
                          <td className="py-2 px-2 text-center align-middle">
                            <span
                              className={`inline-block px-2 py-0.5 rounded-full text-[10.5px] font-extrabold border ${statusColors}`}
                            >
                              {TASK_STATUS_LABELS_AR[t.status]}
                            </span>
                          </td>
                          <td
                            className="py-2 px-2 text-center tabular-nums font-black text-[#012E5E] align-middle"
                            dir="ltr"
                          >
                            {formatPercentage(pct)}
                          </td>
                          <td className="py-2 px-2.5 align-middle">
                            <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden border border-slate-300">
                              <div
                                className="h-full rounded-full"
                                style={{ width: `${pct}%`, backgroundColor: barFill }}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            {/* SECTION 11: التحديات والتوصيات (3-Column Structured Cards/Rows) */}
            <section className="rounded-xl border border-[#B8CDE4] bg-white shadow-xs overflow-hidden">
              {renderRibbonHeader('11. التحديات والتوصيات', 'Challenges & Executive Recommendations')}
              <div className="p-3">
                <table className="w-full text-xs border border-[#C5D8EE] border-collapse">
                  <thead className="bg-[#012E5E] text-white">
                    <tr>
                      <th className="py-1.5 px-2 text-center w-9 font-extrabold">#</th>
                      <th className="py-1.5 px-2.5 text-start w-1/4 font-extrabold">
                        التحديات والعوائق · Challenges
                      </th>
                      <th className="py-1.5 px-2.5 text-start w-2/5 font-extrabold">
                        التحديث والإجراءات المتخذة · Updates
                      </th>
                      <th className="py-1.5 px-2.5 text-start w-1/3 font-extrabold">
                        التوصية التنفيذية · Recommendation
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {report.challenges.map((ch, idx) => (
                      <tr
                        key={ch.id}
                        className={idx % 2 === 1 ? 'bg-[#F4F8FC]' : 'bg-white'}
                      >
                        <td
                          className="py-2 px-2 text-center tabular-nums font-bold align-top"
                          dir="ltr"
                        >
                          {formatNumber(idx + 1)}
                        </td>
                        <td className="py-2 px-2.5 whitespace-pre-wrap break-words leading-relaxed font-extrabold text-[#9A6700] align-top">
                          {ch.challengeText || '—'}
                        </td>
                        <td className="py-2 px-2.5 whitespace-pre-wrap break-words leading-relaxed text-slate-800 align-top">
                          {ch.updateText || '—'}
                        </td>
                        <td className="py-2 px-2.5 whitespace-pre-wrap break-words leading-relaxed font-extrabold text-[#012E5E] align-top">
                          {ch.recommendationText || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* SECTION 12: الإعداد والمراجعة والاعتماد الرسمي (2 Navy/Gold Skewed Cards + Dual Signatures) */}
            <section className="rounded-xl border border-[#B8CDE4] bg-white shadow-xs overflow-hidden">
              {renderRibbonHeader(
                '12. الإعداد والمراجعة والاعتماد الرسمي',
                'Preparation, Review & Official Approval'
              )}
              <div className="p-3 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-xs">
                  {/* Preparer Card */}
                  <div className="rounded-xl border-2 border-[#C99E4A]/70 bg-gradient-to-b from-[#F4F8FC] to-white overflow-hidden shadow-xs">
                    <div className="bg-gradient-to-l from-[#012E5E] to-[#0C4176] text-white px-3.5 py-2 border-b-2 border-[#C99E4A] flex items-center justify-between">
                      <span className="font-extrabold text-xs text-[#DFC076]">
                        أولاً: إعداد التقرير · Report Preparation
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          report.preparerSignatureImage
                            ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/40'
                            : 'bg-amber-500/20 text-amber-200 border border-amber-400/40'
                        }`}
                      >
                        {report.preparerSignatureImage ? 'موقّع إلكترونياً' : 'بانتظار التوقيع'}
                      </span>
                    </div>
                    <div className="p-3 grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                      <div className="sm:col-span-7 space-y-1">
                        <p className="text-[11px] text-slate-500 font-bold">الاسم الكامل:</p>
                        <p className="text-sm font-black text-[#012E5E]">
                          {report.preparerName || '—'}
                        </p>
                        <p className="text-[11px] font-bold text-[#1769AA]">
                          {report.preparerTitle || '—'}
                        </p>
                        <p className="text-[11px] text-slate-600 pt-1">
                          تاريخ الإعداد:{' '}
                          <span dir="ltr" className="font-mono font-bold text-[#012E5E] tabular-nums">
                            {formatDateWestern(report.preparedAt, 'قيد الإعداد')}
                          </span>
                        </p>
                        {report.preparerSignedAt && (
                          <p className="text-[10px] text-slate-500">
                            وقت التوقيع:{' '}
                            <span dir="ltr" className="font-mono tabular-nums">
                              {formatDateTimeWestern(report.preparerSignedAt)}
                            </span>
                          </p>
                        )}
                      </div>
                      <div className="sm:col-span-5">
                        <div className="bg-white rounded-xl border border-[#C5D8EE] p-2 h-24 flex flex-col items-center justify-center text-center">
                          {report.preparerSignatureImage ? (
                            <img
                              src={report.preparerSignatureImage}
                              alt={`توقيع ${report.preparerName || 'معد التقرير'}`}
                              className="max-h-16 max-w-full object-contain"
                            />
                          ) : (
                            <span className="text-[11px] text-slate-400 font-semibold">
                              لا يوجد توقيع مرفوع بعد
                            </span>
                          )}
                          <span className="text-[9.5px] font-bold text-slate-500 mt-1">
                            التوقيع الرسمي لمعد التقرير
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Approver Card */}
                  <div className="rounded-xl border-2 border-[#0C4176]/60 bg-gradient-to-b from-[#F4F8FC] to-white overflow-hidden shadow-xs">
                    <div className="bg-gradient-to-l from-[#012E5E] to-[#0C4176] text-white px-3.5 py-2 border-b-2 border-[#C99E4A] flex items-center justify-between">
                      <span className="font-extrabold text-xs text-[#DFC076]">
                        ثانياً: اعتماد التقرير · Executive Approval
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          report.approverSignatureImage
                            ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/40'
                            : 'bg-amber-500/20 text-amber-200 border border-amber-400/40'
                        }`}
                      >
                        {report.approverSignatureImage ? 'موقّع إلكترونياً' : 'بانتظار التوقيع'}
                      </span>
                    </div>
                    <div className="p-3 grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                      <div className="sm:col-span-7 space-y-1">
                        <p className="text-[11px] text-slate-500 font-bold">الاسم الكامل:</p>
                        <p className="text-sm font-black text-[#012E5E]">
                          {report.approverName || '—'}
                        </p>
                        <p className="text-[11px] font-bold text-[#1769AA]">
                          {report.approverTitle || '—'}
                        </p>
                        <p className="text-[11px] text-slate-600 pt-1">
                          تاريخ الاعتماد:{' '}
                          <span dir="ltr" className="font-mono font-bold text-[#012E5E] tabular-nums">
                            {formatDateWestern(report.approvedAt, 'بانتظار الاعتماد')}
                          </span>
                        </p>
                        {report.approverSignedAt && (
                          <p className="text-[10px] text-slate-500">
                            وقت التوقيع:{' '}
                            <span dir="ltr" className="font-mono tabular-nums">
                              {formatDateTimeWestern(report.approverSignedAt)}
                            </span>
                          </p>
                        )}
                      </div>
                      <div className="sm:col-span-5">
                        <div className="bg-white rounded-xl border border-[#C5D8EE] p-2 h-24 flex flex-col items-center justify-center text-center">
                          {report.approverSignatureImage ? (
                            <img
                              src={report.approverSignatureImage}
                              alt={`توقيع ${report.approverName || 'معتمد التقرير'}`}
                              className="max-h-16 max-w-full object-contain"
                            />
                          ) : (
                            <span className="text-[11px] text-slate-400 font-semibold">
                              بانتظار توقيع المعتمد
                            </span>
                          )}
                          <span className="text-[9.5px] font-bold text-slate-500 mt-1">
                            التوقيع الرسمي لمعتمد التقرير
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Official Attestation / Status Banner */}
                {isApprovedOrArchived ? (
                  <div className="rounded-xl bg-emerald-50 border border-emerald-300 px-4 py-2 flex items-center justify-center gap-2 text-xs font-extrabold text-[#069B74]">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>
                      «هذا التقرير معتمد ومراجع وفقاً للسياسات والإجراءات المعمول بها في قسم إدارة المرافق»
                    </span>
                  </div>
                ) : (
                  <div className="rounded-xl bg-amber-50 border border-amber-300 px-4 py-2 flex items-center justify-center gap-2 text-xs font-extrabold text-[#92620A]">
                    <AlertTriangle className="w-4 h-4 text-[#C99E4A] shrink-0" />
                    <span>
                      حالة التقرير الحالية: ({STATUS_LABELS_AR[report.status]}) — يُعتمد التقرير رسمياً بعد استكمال التوقيعين الإلكترونيين لمعد التقرير ومعتمد التقرير
                    </span>
                  </div>
                )}
              </div>
            </section>
          </div>

          {renderPageFooter(5)}
        </article>
      )}
    </div>
  );
};
