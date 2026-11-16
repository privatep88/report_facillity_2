import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Building2,
  CalendarRange,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Coins,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  Filter,
  Flame,
  Info,
  Layers,
  ListChecks,
  Loader2,
  Printer,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Truck,
  Users,
  Wrench,
} from 'lucide-react';
import { api } from '../api/client.ts';
import { useNotification } from '../notifications/NotificationProvider.tsx';
import { exportAnalyticsExcel, exportAnalyticsPdf } from '../services/ReportExportService.ts';
import {
  computeAnalyticsEngine,
  DEFAULT_ANALYTICS_FILTERS,
  type AnalyticsFilters,
  type AnalyticsPeriodRange,
  type AnalyticsStatusScope,
} from '../services/AnalyticsEngineService.ts';
import type {
  MaintenanceCategory,
  MaintenanceSite,
  MonthlyReportFull,
  PerformanceThresholds,
} from '../types/report.ts';
import { ARABIC_MONTHS, DEFAULT_THRESHOLDS } from '../types/report.ts';
import {
  formatAed,
  formatNumber,
  formatPct,
  getMonthNameAr,
} from '../utils/calculations.ts';
import {
  FinancialCategoryChart,
  LogisticsChannelsChart,
  MaintenanceHeatmapMatrix,
  MaintenanceParetoChart,
  ServicesHorizontalBarChart,
  ServicesShareDonutChart,
  ServicesTrendLineChart,
  TasksStatusChart,
  TimelineComparisonChart,
} from './analytics/AnalyticsCharts.tsx';
import { AnalyticsPrintModal } from './analytics/AnalyticsPrintModal.tsx';
import { AnalyticsSectionFrame } from './analytics/AnalyticsSectionFrame.tsx';

// Freshly generated dedicated BI & corporate visuals + distinct existing facility assets
import heroBannerImg from '../assets/images/analytics_hero_banner_1794843950299.jpg';
import maintenanceOpsImg from '../assets/images/analytics_maintenance_ops_1794843950412.jpg';
import servicesHubImg from '../assets/images/analytics_services_hub_1794843952722.jpg';
import financeDeskImg from '../assets/images/analytics_finance_desk_1794843953051.jpg';
import riskSafetyImg from '../assets/images/analytics_risk_safety_1794843951648.jpg';
import boardroomStrategyImg from '../assets/images/analytics_boardroom_strategy_1794843952613.jpg';
import safetyLogisticsImg from '../assets/images/facility_safety_logistics_1794728989271.jpg';
import engineeringOpsImg from '../assets/images/facility_engineering_ops_1794728989361.jpg';

type DomainGroupKey = 'all' | 'exec_services' | 'maint_finance' | 'gov_risk' | 'trends_decisions';

const DOMAIN_GROUPS: Array<{ key: DomainGroupKey; label: string; shortCode: string }> = [
  { key: 'all', label: 'عرض المنظومة الكاملة', shortCode: '01–18' },
  { key: 'exec_services', label: 'الملخص والخدمات والكفاءة', shortCode: '01–04' },
  { key: 'maint_finance', label: 'الصيانة والمقرات والمالية', shortCode: '05–07' },
  { key: 'gov_risk', label: 'العقود والمساندة والمهام والمخاطر', shortCode: '08–11' },
  { key: 'trends_decisions', label: 'المقارنات والتوقعات والإنذار والتوصيات', shortCode: '12–16' },
];

function toneClasses(tone: 'emerald' | 'blue' | 'amber' | 'orange' | 'red' | 'neutral'): string {
  switch (tone) {
    case 'emerald':
      return 'bg-emerald-50 text-[#069B74] border-emerald-200';
    case 'blue':
      return 'bg-sky-50 text-[#1769AA] border-sky-200';
    case 'amber':
      return 'bg-amber-50 text-amber-800 border-amber-200';
    case 'orange':
      return 'bg-orange-50 text-orange-800 border-orange-200';
    case 'red':
      return 'bg-rose-50 text-[#C43D47] border-rose-200';
    default:
      return 'bg-slate-100 text-slate-600 border-slate-200';
  }
}

export const AnalyticsTab: React.FC = () => {
  const { notifyError, notifySuccess, notifyInfo } = useNotification();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [printModalOpen, setPrintModalOpen] = useState(false);

  const [reports, setReports] = useState<MonthlyReportFull[]>([]);
  const [sites, setSites] = useState<MaintenanceSite[]>([]);
  const [categories, setCategories] = useState<MaintenanceCategory[]>([]);
  const [thresholds, setThresholds] = useState<PerformanceThresholds>(DEFAULT_THRESHOLDS);

  const [filters, setFilters] = useState<AnalyticsFilters>(DEFAULT_ANALYTICS_FILTERS);
  const [activeGroup, setActiveGroup] = useState<DomainGroupKey>('all');
  const [showAllKpis, setShowAllKpis] = useState(false);

  const loadAnalytics = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    api
      .getAllAnalytics()
      .then((res) => {
        setReports(res.reports);
        setSites(res.sites);
        setCategories(res.categories);
        setThresholds(res.thresholds);
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : 'تعذر تحميل بيانات التحليل التنفيذي';
        setLoadError(msg);
        notifyError('فشل تحميل بيانات التحليلات', msg, {
          dedupeKey: 'analytics_load_err',
          context: 'analytics',
          errorCode: 'ERR-BI-LOAD',
          recordInHistory: true,
          action: { label: 'إعادة المحاولة', onClick: loadAnalytics },
        });
      })
      .finally(() => setLoading(false));
  }, [notifyError]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  const bi = useMemo(
    () =>
      computeAnalyticsEngine({
        reports,
        sites,
        categories,
        thresholds,
        filters,
      }),
    [reports, sites, categories, thresholds, filters]
  );

  const serviceOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of reports) {
      for (const s of r.services) {
        if (!map.has(s.serviceId)) map.set(s.serviceId, s.nameAr);
      }
    }
    return Array.from(map.entries()).map(([serviceId, nameAr]) => ({ serviceId, nameAr }));
  }, [reports]);

  const filterPayload = {
    statusScope: filters.statusScope,
    year: filters.year,
    month: filters.month,
    periodRange: filters.periodRange,
    serviceId: filters.serviceId,
    siteId: filters.siteId,
    preparer: filters.preparer,
    approver: filters.approver,
  };

  const handleExportPdf = async (orientation: 'landscape' | 'portrait' = 'landscape') => {
    if (exportingPdf) return;
    setExportingPdf(true);
    try {
      const { filename } = await exportAnalyticsPdf({
        filters: filterPayload,
        orientation,
      });
      notifySuccess(
        'تم تصدير تقرير التحليلات التنفيذية (PDF)',
        `تم تنزيل ${filename} · النطاق: ${bi.meta.scopeLabelAr}`,
        { context: 'print', recordInHistory: true }
      );
    } catch (err) {
      notifyError(
        'تعذر تصدير ملف PDF التحليلي',
        err instanceof Error ? err.message : '',
        {
          context: 'print',
          errorCode: 'ERR-BI-PDF',
          action: {
            label: 'إعادة المحاولة',
            onClick: () => handleExportPdf(orientation),
          },
        }
      );
    } finally {
      setExportingPdf(false);
    }
  };

  const handleExportExcel = async () => {
    if (exportingExcel) return;
    setExportingExcel(true);
    try {
      const { filename } = await exportAnalyticsExcel({
        filters: filterPayload,
      });
      notifySuccess(
        'تم تصدير مصنف التحليلات التنفيذية (Excel)',
        `تم تنزيل ${filename} · النطاق: ${bi.meta.scopeLabelAr} (${formatNumber(bi.meta.filteredReportsCount)} تقرير)`,
        { context: 'excel', recordInHistory: true }
      );
    } catch (err) {
      notifyError(
        'تعذر تصدير ملف Excel التحليلي',
        err instanceof Error ? err.message : '',
        {
          context: 'excel',
          errorCode: 'ERR-BI-XLSX',
          action: {
            label: 'إعادة المحاولة',
            onClick: handleExportExcel,
          },
        }
      );
    } finally {
      setExportingExcel(false);
    }
  };

  const jumpToSection = (sectionId: string) => {
    setActiveGroup('all');
    window.setTimeout(() => {
      const el = document.getElementById(sectionId);
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  };

  const resetFilters = () => {
    setFilters(DEFAULT_ANALYTICS_FILTERS);
    notifyInfo('تمت إعادة تعيين فلاتر التحليل', 'تمت العودة إلى النطاق الافتراضي (التقارير المعتمدة فقط).', {
      dedupeKey: 'analytics_filters_reset',
      context: 'analytics',
    });
  };

  const isSectionVisible = (group: DomainGroupKey) =>
    activeGroup === 'all' || activeGroup === group;

  if (loading) {
    return (
      <div className="max-w-[1460px] mx-auto px-4 sm:px-6 py-6 space-y-4">
        <div className="h-32 bg-white rounded-2xl border border-slate-200 animate-pulse" />
        <div className="h-24 bg-white rounded-2xl border border-slate-200 animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-white rounded-xl border border-slate-200 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="max-w-[1460px] mx-auto px-4 sm:px-6 py-8">
        <div className="bg-white rounded-2xl border border-rose-200 p-8 text-center shadow-xs">
          <AlertTriangle className="w-10 h-10 text-[#C43D47] mx-auto mb-3" />
          <p className="text-base font-extrabold text-[#0B2341]">تعذر تحميل مركز التحليل التنفيذي</p>
          <p className="text-xs text-slate-600 mt-1">{loadError}</p>
          <button
            type="button"
            onClick={loadAnalytics}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0B2341] text-white text-xs font-bold cursor-pointer hover:bg-[#133560]"
          >
            <RotateCcw className="w-4 h-4" />
            <span>إعادة المحاولة</span>
          </button>
        </div>
      </div>
    );
  }

  const zeroApprovedFallbackNeeded =
    filters.statusScope === 'approved_only' &&
    bi.meta.approvedReportsInDb === 0 &&
    bi.meta.totalReportsInDb > 0;

  return (
    <div className="max-w-[1460px] mx-auto px-3 sm:px-6 py-5 space-y-5 text-[#0B2341]">
      {/* =================================================================== */}
      {/* 00. EXECUTIVE INTELLIGENCE HERO BANNER                              */}
      {/* =================================================================== */}
      <header className="relative rounded-2xl overflow-hidden border border-[#C8A85D]/50 shadow-md bg-[#0B2341]">
        <img
          src={heroBannerImg}
          alt="مركز التحليل التنفيذي لإدارة المرافق"
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover opacity-35"
        />
        <div className="relative z-10 bg-gradient-to-l from-[#0B2341]/95 via-[#0B2341]/85 to-[#0B2341]/70 px-5 sm:px-7 py-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1.5 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-[#F0D38C]">
              <BarChart3 className="w-4 h-4 shrink-0" />
              <span>شركة ساعد للأنظمة المرورية · إدارة الخدمات العامة · قسم إدارة المرافق</span>
            </div>
            <h1 className="text-lg sm:text-2xl font-extrabold text-white tracking-tight">
              مركز التحليل التنفيذي لإدارة المرافق
            </h1>
            <p dir="ltr" className="text-xs sm:text-sm font-semibold text-sky-200 text-end sm:text-start">
              Facilities Management Executive Intelligence Center
            </p>
            <p className="text-[11.5px] text-slate-200/90 leading-relaxed">
              منظومة ذكاء أعمال تنفيذية مسترشدة بمنهجيات قياس الأداء والمرافق والأصول (ISO 41001 &amp; ISO 55001) لمتابعة الطلبات، كفاءة الإنجاز، الصيانة، التكاليف (AED)، العقود، المخاطر، والتوقعات المشروطة بكفاية البيانات دون أي أرقام افتراضية.
            </p>
          </div>

          {/* 18. Direct Executive Export Controls */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => handleExportPdf('landscape')}
              disabled={exportingPdf}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#C99E4A] hover:bg-[#b58a37] disabled:opacity-60 text-[#0B2341] text-xs font-extrabold shadow-sm cursor-pointer whitespace-nowrap"
            >
              {exportingPdf ? <Loader2 className="w-4 h-4 shrink-0 animate-spin" /> : <FileText className="w-4 h-4 shrink-0" />}
              <span>{exportingPdf ? 'جارٍ إنشاء PDF...' : 'تصدير PDF'}</span>
            </button>
            <button
              type="button"
              onClick={() => setPrintModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#1769AA] hover:bg-[#1e7bc7] text-white text-xs font-bold shadow-sm cursor-pointer whitespace-nowrap"
            >
              <Printer className="w-4 h-4 shrink-0" />
              <span>معاينة وطباعة A4</span>
            </button>
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={exportingExcel}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#069B74] hover:bg-[#058261] disabled:opacity-60 text-white text-xs font-bold shadow-sm cursor-pointer whitespace-nowrap"
            >
              {exportingExcel ? <Loader2 className="w-4 h-4 shrink-0 animate-spin" /> : <FileSpreadsheet className="w-4 h-4 shrink-0" />}
              <span>{exportingExcel ? 'جارٍ التصدير...' : 'تصدير تحليلات Excel'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* =================================================================== */}
      {/* 17. ADVANCED INTERACTIVE BI FILTER ENGINE                           */}
      {/* =================================================================== */}
      <section
        id="sec-17-filters"
        className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 sm:p-5 space-y-3.5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
          <div className="flex items-center gap-2 text-sm font-extrabold text-[#0B2341]">
            <Filter className="w-4 h-4 text-[#1769AA]" />
            <span>محرك التصفية والتحكم التحليلي · Interactive BI Filter Engine</span>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="font-semibold text-slate-600">
              النطاق النشط:{' '}
              <strong className="text-[#1769AA]">{bi.meta.scopeLabelAr}</strong> (
              <span dir="ltr" className="tabular-nums font-bold">
                {formatNumber(bi.meta.filteredReportsCount)}
              </span>{' '}
              من{' '}
              <span dir="ltr" className="tabular-nums font-bold">
                {formatNumber(bi.meta.totalReportsInDb)}
              </span>{' '}
              تقرير)
            </span>
            {bi.meta.duplicatePeriodsCollapsed > 0 && (
              <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                تم منع ازدواجية {formatNumber(bi.meta.duplicatePeriodsCollapsed)} إصدار مكرر تلقائياً
              </span>
            )}
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-bold text-[#0B2341] cursor-pointer whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>إعادة تعيين</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-2.5 text-xs">
          {/* Status Scope (Defaults to approved_only!) */}
          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-slate-600">حالة الاعتماد</label>
            <select
              value={filters.statusScope}
              onChange={(e) =>
                setFilters((f) => ({ ...f, statusScope: e.target.value as AnalyticsStatusScope }))
              }
              className="w-full px-2.5 py-2 rounded-lg border border-slate-200 bg-slate-50/70 font-semibold text-[#0B2341]"
            >
              <option value="approved_only">المعتمدة فقط ({formatNumber(bi.meta.approvedReportsInDb)})</option>
              <option value="all">جميع التقارير ({formatNumber(bi.meta.totalReportsInDb)})</option>
              <option value="draft_only">المسودات والمراجعة ({formatNumber(bi.meta.draftReportsInDb)})</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-slate-600">السنة</label>
            <select
              value={filters.year}
              onChange={(e) => setFilters((f) => ({ ...f, year: e.target.value }))}
              className="w-full px-2.5 py-2 rounded-lg border border-slate-200 bg-white font-semibold"
            >
              <option value="all">جميع السنوات</option>
              {bi.meta.availableYears.map((y) => (
                <option key={y} value={String(y)}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-slate-600">النطاق الربع/نصف سنوي</label>
            <select
              value={filters.periodRange}
              onChange={(e) =>
                setFilters((f) => ({ ...f, periodRange: e.target.value as AnalyticsPeriodRange }))
              }
              className="w-full px-2.5 py-2 rounded-lg border border-slate-200 bg-white font-semibold"
            >
              <option value="all">جميع الفترات</option>
              <option value="q1">الربع الأول (Q1)</option>
              <option value="q2">الربع الثاني (Q2)</option>
              <option value="q3">الربع الثالث (Q3)</option>
              <option value="q4">الربع الرابع (Q4)</option>
              <option value="h1">النصف الأول (H1)</option>
              <option value="h2">النصف الثاني (H2)</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-slate-600">الشهر</label>
            <select
              value={filters.month}
              onChange={(e) => setFilters((f) => ({ ...f, month: e.target.value }))}
              className="w-full px-2.5 py-2 rounded-lg border border-slate-200 bg-white font-semibold"
            >
              <option value="all">جميع الأشهر</option>
              {ARABIC_MONTHS.map((m) => (
                <option key={m.value} value={String(m.value)}>
                  {m.nameAr}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-slate-600">الخدمة</label>
            <select
              value={filters.serviceId}
              onChange={(e) => setFilters((f) => ({ ...f, serviceId: e.target.value }))}
              className="w-full px-2.5 py-2 rounded-lg border border-slate-200 bg-white font-semibold"
            >
              <option value="all">جميع الخدمات</option>
              {serviceOptions.map((s) => (
                <option key={s.serviceId} value={s.serviceId}>
                  {s.nameAr}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-slate-600">المقر / الموقع</label>
            <select
              value={filters.siteId}
              onChange={(e) => setFilters((f) => ({ ...f, siteId: e.target.value }))}
              className="w-full px-2.5 py-2 rounded-lg border border-slate-200 bg-white font-semibold"
            >
              <option value="all">جميع المقرات</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nameAr}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-slate-600">معد التقرير</label>
            <select
              value={filters.preparer}
              onChange={(e) => setFilters((f) => ({ ...f, preparer: e.target.value }))}
              className="w-full px-2.5 py-2 rounded-lg border border-slate-200 bg-white font-semibold"
            >
              <option value="all">جميع المعدّين</option>
              {bi.meta.availablePreparers.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-slate-600">المعتمد الرسمي</label>
            <select
              value={filters.approver}
              onChange={(e) => setFilters((f) => ({ ...f, approver: e.target.value }))}
              className="w-full px-2.5 py-2 rounded-lg border border-slate-200 bg-white font-semibold"
            >
              <option value="all">جميع المعتمدين</option>
              {bi.meta.availableApprovers.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Zero Approved Fallback Prompt (explicit, honest, 1-click switch) */}
        {zeroApprovedFallbackNeeded && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <Info className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
              <div className="text-xs">
                <p className="font-extrabold text-[#0B2341]">
                  لا توجد تقارير معتمدة نهائياً حتى الآن — الوضع الرسمي الافتراضي يعرض التقارير المعتمدة فقط
                </p>
                <p className="text-slate-700 mt-0.5">
                  تتوفر حالياً{' '}
                  <strong dir="ltr" className="tabular-nums">
                    {formatNumber(bi.meta.draftReportsInDb)}
                  </strong>{' '}
                  تقارير في مرحلة المسودة / المراجعة. يمكنك التبديل الآن لعرض جميع التقارير ومعاينة التحليلات التشغيلية فوراً.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setFilters((f) => ({ ...f, statusScope: 'all' }))}
              className="px-4 py-2 rounded-lg bg-[#0B2341] hover:bg-[#143763] text-white text-xs font-bold cursor-pointer whitespace-nowrap shrink-0"
            >
              عرض جميع التقارير ({formatNumber(bi.meta.totalReportsInDb)})
            </button>
          </div>
        )}

        {/* Domain Group Selector Bar */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-1">
          {DOMAIN_GROUPS.map((g) => {
            const active = activeGroup === g.key;
            return (
              <button
                key={g.key}
                type="button"
                onClick={() => setActiveGroup(g.key)}
                className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0 border ${
                  active
                    ? 'bg-[#0B2341] text-white border-[#0B2341] shadow-xs'
                    : 'bg-slate-50 text-[#0B2341] border-slate-200 hover:bg-slate-100'
                }`}
              >
                <span
                  dir="ltr"
                  className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded tabular-nums ${
                    active ? 'bg-[#C8A85D] text-[#0B2341]' : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {g.shortCode}
                </span>
                <span>{g.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* =================================================================== */}
      {/* GROUP 1: 01–04 EXECUTIVE SNAPSHOT, OVERALL KPI, SERVICES & EFFICIENCY */}
      {/* =================================================================== */}
      {isSectionVisible('exec_services') && (
        <div className="space-y-5">
          {/* SECTION 01: Executive Performance Snapshot */}
          <AnalyticsSectionFrame
            id="sec-01-snapshot"
            sectionNumber="01"
            titleAr="الملخص التنفيذي الذكي"
            titleEn="Executive Performance Snapshot"
            subtitleAr="ملخص تنفيذي سريع لأهم مؤشرات الطلبات والإنجاز والصيانة والتكاليف والسلامة في النطاق المختار"
            imageSrc={servicesHubImg}
            imageAlt="ملخص الأداء التنفيذي لإدارة المرافق"
            badgeText={`${formatNumber(bi.meta.filteredReportsCount)} تقرير في النطاق`}
          >
            {/* Primary 6 KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
              <div className="rounded-xl border border-slate-200 bg-[#F7FAFC] p-3.5">
                <div className="flex items-center justify-between text-slate-500">
                  <span className="text-[11px] font-bold">إجمالي الطلبات المستلمة</span>
                  <Layers className="w-4 h-4 text-[#1769AA]" />
                </div>
                <p dir="ltr" className="text-2xl font-extrabold tabular-nums mt-2 text-[#0B2341]">
                  {formatNumber(bi.snapshot.totalReceived)}
                </p>
                <p className="text-[11px] text-slate-500 mt-1 truncate">
                  {bi.snapshot.topService
                    ? `الأعلى: ${bi.snapshot.topService.nameAr}`
                    : 'لا توجد طلبات مسجلة'}
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-[#F7FAFC] p-3.5">
                <div className="flex items-center justify-between text-slate-500">
                  <span className="text-[11px] font-bold">الطلبات المنفذة ونسبة الإنجاز</span>
                  <CheckCircle2 className="w-4 h-4 text-[#069B74]" />
                </div>
                <div className="flex items-baseline justify-between gap-2 mt-2">
                  <p dir="ltr" className="text-2xl font-extrabold tabular-nums text-[#069B74]">
                    {formatPct(bi.snapshot.overallCompletionPct, 'غير منطبق')}
                  </p>
                  <span dir="ltr" className="text-xs font-bold text-slate-600 tabular-nums">
                    {formatNumber(bi.snapshot.totalExecuted)} منفذ
                  </span>
                </div>
                <p className="text-[11px] font-semibold mt-1 text-slate-600">
                  التصنيف: {bi.snapshot.overallCompletionLevel.labelAr}
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-[#F7FAFC] p-3.5">
                <div className="flex items-center justify-between text-slate-500">
                  <span className="text-[11px] font-bold">أعطال الصيانة المسجلة</span>
                  <Wrench className="w-4 h-4 text-[#1E40AF]" />
                </div>
                <p dir="ltr" className="text-2xl font-extrabold tabular-nums mt-2 text-[#0B2341]">
                  {formatNumber(bi.snapshot.totalFaults)}
                </p>
                <p className="text-[11px] text-slate-500 mt-1 truncate">
                  {bi.snapshot.highestFaultSite
                    ? `الأعلى أعطالاً: ${bi.snapshot.highestFaultSite.nameAr}`
                    : 'لا توجد أعطال'}
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-[#F7FAFC] p-3.5">
                <div className="flex items-center justify-between text-slate-500">
                  <span className="text-[11px] font-bold">تكاليف الصيانة الفعلية</span>
                  <Coins className="w-4 h-4 text-[#C8A85D]" />
                </div>
                <p dir="ltr" className="text-xl font-extrabold tabular-nums mt-2 text-[#0B2341]">
                  {formatAed(bi.snapshot.totalCostAed)}
                </p>
                <p className="text-[11px] text-slate-500 mt-1">
                  نثرية {formatNumber(bi.snapshot.pettyCashTotalAed)} · شراء {formatNumber(bi.snapshot.purchaseOrderTotalAed)}
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-[#F7FAFC] p-3.5">
                <div className="flex items-center justify-between text-slate-500">
                  <span className="text-[11px] font-bold">مؤشر المخاطر والسلامة</span>
                  <Flame className="w-4 h-4 text-[#C43D47]" />
                </div>
                <p dir="ltr" className="text-2xl font-extrabold tabular-nums mt-2 text-[#0B2341]">
                  {formatPct(bi.snapshot.extinguishersReadinessPct, 'غير منطبق')}
                </p>
                <p className="text-[11px] text-slate-600 mt-1">
                  طفايات غير فعالة: <strong className="tabular-nums">{formatNumber(bi.snapshot.extinguishersInactive)}</strong> · مخاطر مفتوحة:{' '}
                  <strong className="tabular-nums">{formatNumber(bi.snapshot.hazardsOpen)}</strong>
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-[#F7FAFC] p-3.5">
                <div className="flex items-center justify-between text-slate-500">
                  <span className="text-[11px] font-bold">التزام العقود والمهام</span>
                  <FileCheck2 className="w-4 h-4 text-[#069B74]" />
                </div>
                <p dir="ltr" className="text-2xl font-extrabold tabular-nums mt-2 text-[#0B2341]">
                  {formatPct(bi.snapshot.contractsCompliancePct, 'غير منطبق')}
                </p>
                <p className="text-[11px] text-slate-600 mt-1">
                  مهام: {formatPct(bi.snapshot.tasksAvgCompletionPct, 'غير منطبق')} ({formatNumber(bi.snapshot.tasksCompleted)}/{formatNumber(bi.snapshot.tasksTotal)})
                </p>
              </div>
            </div>

            {/* Expandable remaining 4 secondary snapshot cards (10 total) */}
            <div>
              <button
                type="button"
                onClick={() => setShowAllKpis((v) => !v)}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-[#1769AA] hover:underline cursor-pointer"
              >
                {showAllKpis ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                <span>
                  {showAllKpis
                    ? 'إخفاء المؤشرات التفصيلية الإضافية'
                    : 'عرض باقي المؤشرات العشرة (الفجوة المتبقية، إغلاق المخاطر، العقود غير الفعالة، المهام المتأخرة)'}
                </span>
              </button>

              {showAllKpis && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
                  <div className="rounded-xl border border-slate-200 p-3 bg-white">
                    <p className="text-[11px] font-bold text-slate-500">الفجوة المتبقية في الطلبات</p>
                    <p dir="ltr" className="text-lg font-extrabold tabular-nums mt-1">
                      {formatNumber(bi.snapshot.totalRemainingGap)} طلب
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 p-3 bg-white">
                    <p className="text-[11px] font-bold text-slate-500">نسبة إغلاق ملاحظات المخاطر</p>
                    <p dir="ltr" className="text-lg font-extrabold tabular-nums mt-1">
                      {formatPct(bi.snapshot.hazardsClosurePct, 'غير منطبق')}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 p-3 bg-white">
                    <p className="text-[11px] font-bold text-slate-500">العقود والتراخيص غير الفعالة</p>
                    <p dir="ltr" className="text-lg font-extrabold tabular-nums mt-1 text-[#C43D47]">
                      {formatNumber(bi.snapshot.contractsInactive)} بند
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 p-3 bg-white">
                    <p className="text-[11px] font-bold text-slate-500">المهام التشغيلية المتأخرة</p>
                    <p dir="ltr" className="text-lg font-extrabold tabular-nums mt-1 text-[#C43D47]">
                      {formatNumber(bi.snapshot.tasksDelayed)} مهمة
                    </p>
                  </div>
                </div>
              )}
            </div>
          </AnalyticsSectionFrame>

          {/* SECTION 02: Overall Operational Performance (Zero Invented Composite Score!) */}
          <AnalyticsSectionFrame
            id="sec-02-overall"
            sectionNumber="02"
            titleAr="مؤشر الأداء العام وفق حدود الاعتماد"
            titleEn="Overall Operational Performance Indicators"
            subtitleAr="تقييم مستقل لكل محور تشغيلي وفق عتبات الأداء المخزنة في إعدادات النظام دون دمج أوزان غير معتمدة"
          >
            <div className="rounded-xl bg-[#F4F7FB] border border-slate-200 p-3 text-xs text-slate-700 flex items-start gap-2.5">
              <Info className="w-4 h-4 text-[#1769AA] shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold text-[#0B2341]">{bi.overallPerformance.methodologyNoteAr}</p>
                <p className="text-[11px] text-slate-600">
                  عتبات التقييم الرسمية المطبقة: ممتاز ≥{' '}
                  <strong dir="ltr">{bi.overallPerformance.thresholds.excellentMin}%</strong> · جيد جداً ≥{' '}
                  <strong dir="ltr">{bi.overallPerformance.thresholds.veryGoodMin}%</strong> · جيد ≥{' '}
                  <strong dir="ltr">{bi.overallPerformance.thresholds.goodMin}%</strong> · يحتاج تحسين ≥{' '}
                  <strong dir="ltr">{bi.overallPerformance.thresholds.needsImprovementMin}%</strong>
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {bi.overallPerformance.pillars.map((pillar) => (
                <div
                  key={pillar.key}
                  className="rounded-xl border border-slate-200 bg-white p-3.5 flex flex-col justify-between gap-2"
                >
                  <div>
                    <p className="text-xs font-extrabold text-[#0B2341]">{pillar.labelAr}</p>
                    <p dir="ltr" className="text-[10.5px] text-slate-400 text-end sm:text-start">
                      {pillar.labelEn}
                    </p>
                  </div>
                  <div className="flex items-baseline justify-between gap-2 pt-1">
                    <span dir="ltr" className="text-2xl font-extrabold tabular-nums text-[#0B2341]">
                      {formatPct(pillar.valuePct, 'غير منطبق')}
                    </span>
                    <span
                      className={`text-[11px] font-bold px-2 py-0.5 rounded border ${toneClasses(
                        pillar.level.tone
                      )}`}
                    >
                      {pillar.level.labelAr}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    <span dir="ltr" className="tabular-nums font-semibold">
                      {formatNumber(pillar.numerator)} / {formatNumber(pillar.denominator)}
                    </span>{' '}
                    ({pillar.unitLabel})
                  </p>
                </div>
              ))}
            </div>
          </AnalyticsSectionFrame>

          {/* SECTION 03: Services & Requests Analysis */}
          <AnalyticsSectionFrame
            id="sec-03-services"
            sectionNumber="03"
            titleAr="تحليل الخدمات والطلبات الإحدى عشرة"
            titleEn="Services & Requests Demand Analysis"
            subtitleAr="توزيع الطلبات، المستلم مقابل المنفذ، الترتيب حسب الطلب، والاتجاه الشهري لكل خدمة"
          >
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-7 rounded-xl border border-slate-200 p-3.5">
                <h3 className="text-xs font-extrabold text-[#0B2341] mb-2">
                  مقارنة الطلبات المستلمة والمنفذة حسب الخدمة (رسم شريطي أفقي)
                </h3>
                <ServicesHorizontalBarChart rows={bi.servicesAnalysis.rows} />
              </div>

              <div className="lg:col-span-5 rounded-xl border border-slate-200 p-3.5">
                <h3 className="text-xs font-extrabold text-[#0B2341] mb-2">
                  التوزيع النسبي لحجم الطلبات حسب الخدمة
                </h3>
                <ServicesShareDonutChart rows={bi.servicesAnalysis.rows} />
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-7 rounded-xl border border-slate-200 p-3.5">
                <h3 className="text-xs font-extrabold text-[#0B2341] mb-2">
                  تطور الطلبات الشهري لأبرز الخدمات (Multi-Series Trend)
                </h3>
                <ServicesTrendLineChart
                  seriesKeys={bi.servicesAnalysis.monthlySeriesKeys}
                  seriesData={bi.servicesAnalysis.monthlySeries}
                />
              </div>

              <div className="lg:col-span-5 rounded-xl border border-slate-200 p-3.5 space-y-3">
                <div>
                  <h3 className="text-xs font-extrabold text-[#0B2341] mb-1.5">
                    أعلى الخدمات طلباً
                  </h3>
                  {bi.servicesAnalysis.topDemand.length === 0 ? (
                    <p className="text-xs text-slate-500">لا توجد خدمات ذات طلب مسجل في النطاق.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {bi.servicesAnalysis.topDemand.map((s, idx) => (
                        <div
                          key={s.serviceId}
                          className="flex items-center justify-between text-xs bg-slate-50 px-2.5 py-1.5 rounded border border-slate-100"
                        >
                          <span className="font-semibold">
                            <span dir="ltr" className="text-[#1769AA] font-bold me-1.5">
                              #{idx + 1}
                            </span>
                            {s.nameAr}
                          </span>
                          <span dir="ltr" className="font-extrabold tabular-nums text-[#0B2341]">
                            {formatNumber(s.receivedCount)} طلب
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <h3 className="text-xs font-extrabold text-[#0B2341] mb-1">
                    الخدمات الأقل طلباً (بدون دلالة سلبية تلقائية)
                  </h3>
                  <div className="space-y-1">
                    {bi.servicesAnalysis.lowDemand.map((s) => (
                      <div
                        key={s.serviceId}
                        className="flex items-center justify-between text-[11px] px-2 py-1 rounded bg-slate-50/70"
                      >
                        <span className="text-slate-700">{s.nameAr}</span>
                        <span dir="ltr" className="tabular-nums font-bold text-slate-600">
                          {formatNumber(s.receivedCount)} طلب
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
                    {bi.servicesAnalysis.lowDemandNoteAr}
                  </p>
                </div>
              </div>
            </div>
          </AnalyticsSectionFrame>

          {/* SECTION 04: Completion & Backlog Efficiency */}
          <AnalyticsSectionFrame
            id="sec-04-efficiency"
            sectionNumber="04"
            titleAr="تحليل كفاءة الإنجاز والفجوات التشغيلية"
            titleEn="Completion Efficiency & Gap Analysis"
            subtitleAr="معدل التنفيذ لكل خدمة، الفجوة المتبقية داخل الفترة، وتغير الأداء الشهري عند توفر أكثر من فترة"
          >
            <div className="rounded-xl bg-sky-50/70 border border-sky-200 px-3.5 py-2.5 text-xs text-[#0B2341] flex items-start gap-2">
              <Info className="w-4 h-4 text-[#1769AA] shrink-0 mt-0.5" />
              <span>{bi.servicesAnalysis.backlogNoteAr}</span>
            </div>

            <div className="overflow-x-auto fm-scroll rounded-xl border border-slate-200">
              <table className="w-full text-xs border-collapse">
                <thead className="bg-[#0B2341] text-white">
                  <tr>
                    <th className="py-2.5 px-3 text-center w-10">#</th>
                    <th className="py-2.5 px-3 text-start">الخدمة</th>
                    <th className="py-2.5 px-3 text-center">المستلمة</th>
                    <th className="py-2.5 px-3 text-center">المنفذة</th>
                    <th className="py-2.5 px-3 text-center">الفجوة المتبقية</th>
                    <th className="py-2.5 px-3 text-center">الحصة %</th>
                    <th className="py-2.5 px-3 text-center">نسبة الإنجاز %</th>
                    <th className="py-2.5 px-3 text-center">التغير الشهري (MoM)</th>
                    <th className="py-2.5 px-3 text-center">مستوى الأداء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {bi.servicesAnalysis.rows.map((s, idx) => (
                    <tr key={s.serviceId} className="hover:bg-slate-50/70">
                      <td dir="ltr" className="py-2 px-3 text-center tabular-nums text-slate-500">
                        {formatNumber(idx + 1)}
                      </td>
                      <td className="py-2 px-3 font-bold text-[#0B2341]">{s.nameAr}</td>
                      <td dir="ltr" className="py-2 px-3 text-center tabular-nums font-semibold">
                        {formatNumber(s.receivedCount)}
                      </td>
                      <td dir="ltr" className="py-2 px-3 text-center tabular-nums font-semibold text-[#069B74]">
                        {formatNumber(s.executedCount)}
                      </td>
                      <td dir="ltr" className="py-2 px-3 text-center tabular-nums font-bold text-amber-800">
                        {formatNumber(s.remainingGap)}
                        {s.carriedOverSurplus > 0 && (
                          <span className="block text-[10px] text-sky-700">
                            (منجز إضافي +{formatNumber(s.carriedOverSurplus)})
                          </span>
                        )}
                      </td>
                      <td dir="ltr" className="py-2 px-3 text-center tabular-nums">
                        {formatPct(s.shareOfTotalPct, '0.0%')}
                      </td>
                      <td dir="ltr" className="py-2 px-3 text-center tabular-nums font-extrabold">
                        {formatPct(s.completionPct, 'غير منطبق')}
                      </td>
                      <td dir="ltr" className="py-2 px-3 text-center tabular-nums">
                        {s.momCompletionDeltaPct === null ? (
                          <span className="text-slate-400">غير متاح</span>
                        ) : (
                          <span
                            className={`font-bold ${
                              s.momCompletionDeltaPct >= 0 ? 'text-[#069B74]' : 'text-[#C43D47]'
                            }`}
                          >
                            {s.momCompletionDeltaPct >= 0 ? '+' : ''}
                            {s.momCompletionDeltaPct.toFixed(1)}%
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <span
                          className={`inline-block text-[11px] font-bold px-2 py-0.5 rounded border ${toneClasses(
                            s.level.tone
                          )}`}
                        >
                          {s.level.labelAr}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </AnalyticsSectionFrame>
        </div>
      )}

      {/* =================================================================== */}
      {/* GROUP 2: 05–07 MAINTENANCE/PARETO, SITES & FINANCIAL (AED)          */}
      {/* =================================================================== */}
      {isSectionVisible('maint_finance') && (
        <div className="space-y-5">
          {/* SECTION 05: Maintenance & Faults Analysis */}
          <AnalyticsSectionFrame
            id="sec-05-maintenance"
            sectionNumber="05"
            titleAr="تحليل الصيانة والأعطال ومخطط باريتو"
            titleEn="Maintenance Operations, Pareto & Thermal Matrix"
            subtitleAr="توزيع الأعطال حسب الفئة (باريتو 80/20)، مصادر الطلبات، وخريطة الحرارة للمقرات والفئات"
            imageSrc={maintenanceOpsImg}
            imageAlt="فريق الصيانة الهندسية وإدارة الأعطال"
            badgeText={`${formatNumber(bi.maintenanceAnalysis.totalFaults)} إجمالي الأعطال`}
          >
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="rounded-xl border border-slate-200 bg-[#F7FAFC] p-3">
                <p className="text-[11px] font-bold text-slate-500">إجمالي أعطال المصفوفة</p>
                <p dir="ltr" className="text-xl font-extrabold tabular-nums mt-1">
                  {formatNumber(bi.maintenanceAnalysis.totalFaults)} عطل
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-[#F7FAFC] p-3">
                <p className="text-[11px] font-bold text-slate-500">متوسط الأعطال / تقرير</p>
                <p dir="ltr" className="text-xl font-extrabold tabular-nums mt-1">
                  {bi.maintenanceAnalysis.avgFaultsPerReport !== null
                    ? formatNumber(bi.maintenanceAnalysis.avgFaultsPerReport)
                    : 'غير منطبق'}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-[#F7FAFC] p-3">
                <p className="text-[11px] font-bold text-slate-500">طلبات من قسم المرافق</p>
                <p dir="ltr" className="text-xl font-extrabold tabular-nums mt-1 text-[#1769AA]">
                  {formatNumber(bi.maintenanceAnalysis.fromFacilitiesDept)}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-[#F7FAFC] p-3">
                <p className="text-[11px] font-bold text-slate-500">طلبات من الإدارات الأخرى</p>
                <p dir="ltr" className="text-xl font-extrabold tabular-nums mt-1 text-[#069B74]">
                  {formatNumber(bi.maintenanceAnalysis.fromOtherDepts)}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 p-3.5">
              <h3 className="text-xs font-extrabold text-[#0B2341] mb-2">
                مخطط باريتو للأعطال حسب الفئة (العدد + النسبة التراكمية %)
              </h3>
              <MaintenanceParetoChart rows={bi.maintenanceAnalysis.paretoRows} />
            </div>

            <div>
              <h3 className="text-xs font-extrabold text-[#0B2341] mb-2">
                خريطة التركز الحراري للأعطال (المقر × فئة الصيانة)
              </h3>
              <MaintenanceHeatmapMatrix
                sites={bi.maintenanceAnalysis.heatmapSites}
                categories={bi.maintenanceAnalysis.activeCategories}
              />
            </div>
          </AnalyticsSectionFrame>

          {/* SECTION 06: Sites & Facilities Performance */}
          <AnalyticsSectionFrame
            id="sec-06-sites"
            sectionNumber="06"
            titleAr="تحليل أداء المقرات والمواقع التشغيلية"
            titleEn="Sites & Facilities Comparative Breakdown"
            subtitleAr="توزيع الأعطال حسب المقرات، الفئة الأعلى تكراراً لكل مقر، والتغير الشهري إن توفر"
            imageSrc={engineeringOpsImg}
            imageAlt="تحليل أداء المقرات والمواقع"
          >
            <div className="rounded-xl bg-[#F4F7FB] border border-slate-200 px-3.5 py-2.5 text-xs text-slate-700 flex items-start gap-2">
              <Building2 className="w-4 h-4 text-[#1769AA] shrink-0 mt-0.5" />
              <span>{bi.sitesAnalysis.methodologyNoteAr}</span>
            </div>

            <div className="overflow-x-auto fm-scroll rounded-xl border border-slate-200">
              <table className="w-full text-xs border-collapse">
                <thead className="bg-[#0B2341] text-white">
                  <tr>
                    <th className="py-2.5 px-3 text-start">المقر / الموقع</th>
                    <th className="py-2.5 px-3 text-center">إجمالي الأعطال</th>
                    <th className="py-2.5 px-3 text-center">الحصة من الإجمالي %</th>
                    <th className="py-2.5 px-3 text-start">الفئة الأكثر تكراراً</th>
                    <th className="py-2.5 px-3 text-center">التغير الشهري (MoM)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {bi.sitesAnalysis.rows.map((st) => (
                    <tr key={st.siteId} className="hover:bg-slate-50/70">
                      <td className="py-2 px-3 font-bold text-[#0B2341]">{st.nameAr}</td>
                      <td dir="ltr" className="py-2 px-3 text-center tabular-nums font-extrabold">
                        {formatNumber(st.faultCount)}
                      </td>
                      <td dir="ltr" className="py-2 px-3 text-center tabular-nums">
                        {formatPct(st.sharePct, '0.0%')}
                      </td>
                      <td className="py-2 px-3 text-slate-700">
                        {st.topCategoryAr
                          ? `${st.topCategoryAr} (${formatNumber(st.topCategoryCount)} عطل)`
                          : 'لا توجد أعطال مسجلة'}
                      </td>
                      <td dir="ltr" className="py-2 px-3 text-center tabular-nums">
                        {st.momFaultDelta === null ? (
                          <span className="text-slate-400">غير متاح</span>
                        ) : (
                          <span
                            className={`font-bold ${
                              st.momFaultDelta > 0
                                ? 'text-[#C43D47]'
                                : st.momFaultDelta < 0
                                  ? 'text-[#069B74]'
                                  : 'text-slate-600'
                            }`}
                          >
                            {st.momFaultDelta > 0 ? `+${formatNumber(st.momFaultDelta)}` : formatNumber(st.momFaultDelta)}
                            {st.momFaultPct !== null ? ` (${st.momFaultPct > 0 ? '+' : ''}${st.momFaultPct}%)` : ''}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </AnalyticsSectionFrame>

          {/* SECTION 07: Financial & Cost Analysis (AED) */}
          <AnalyticsSectionFrame
            id="sec-07-financial"
            sectionNumber="07"
            titleAr="التحليل المالي وتكاليف الصيانة (AED)"
            titleEn="Financial & Maintenance Cost Intelligence"
            subtitleAr="تفصيل تكاليف النثرية وأوامر الشراء بالدرهم الإماراتي ومتوسط تكلفة العطل دون أي ازدواجية"
            imageSrc={financeDeskImg}
            imageAlt="التحليل المالي وتكاليف الصيانة"
            badgeText={formatAed(bi.financialAnalysis.grandTotalCostAed)}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="rounded-xl border border-slate-200 bg-[#F7FAFC] p-3.5">
                <p className="text-[11px] font-bold text-slate-500">إجمالي التكاليف الفعلية</p>
                <p dir="ltr" className="text-xl font-extrabold tabular-nums mt-1">
                  {formatAed(bi.financialAnalysis.grandTotalCostAed)}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-[#F7FAFC] p-3.5">
                <p className="text-[11px] font-bold text-slate-500">تكاليف النثرية (Petty Cash)</p>
                <p dir="ltr" className="text-lg font-extrabold tabular-nums mt-1 text-[#B38A3A]">
                  {formatAed(bi.financialAnalysis.pettyCashTotalAed)}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  الحصة: {formatPct(bi.financialAnalysis.pettyCashSharePct, '0.0%')}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-[#F7FAFC] p-3.5">
                <p className="text-[11px] font-bold text-slate-500">تكاليف أوامر الشراء (PO)</p>
                <p dir="ltr" className="text-lg font-extrabold tabular-nums mt-1 text-[#0B2341]">
                  {formatAed(bi.financialAnalysis.purchaseOrderTotalAed)}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  الحصة: {formatPct(bi.financialAnalysis.purchaseOrderSharePct, '0.0%')}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-[#F7FAFC] p-3.5">
                <p className="text-[11px] font-bold text-slate-500">متوسط التكلفة / عطل</p>
                <p dir="ltr" className="text-lg font-extrabold tabular-nums mt-1 text-[#1769AA]">
                  {bi.financialAnalysis.avgCostPerFaultAed !== null
                    ? formatAed(bi.financialAnalysis.avgCostPerFaultAed)
                    : 'غير منطبق'}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {bi.maintenanceAnalysis.totalFaults > 0
                    ? `محسوب على ${formatNumber(bi.maintenanceAnalysis.totalFaults)} عطل`
                    : 'لا توجد أعطال مسجلة'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-6 rounded-xl border border-slate-200 p-3.5">
                <h3 className="text-xs font-extrabold text-[#0B2341] mb-2">
                  توزيع النثرية وأوامر الشراء حسب فئة الصيانة (AED)
                </h3>
                <FinancialCategoryChart rows={bi.financialAnalysis.byCategory} />
              </div>

              <div className="lg:col-span-6 space-y-3">
                <div className="rounded-xl border border-slate-200 p-3.5 bg-slate-50/70 space-y-2 text-xs">
                  <p className="font-extrabold text-[#0B2341]">
                    فصل المعاملات العددية عن التكاليف المالية (منع الازدواجية)
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                      <span className="text-[11px] text-slate-500">طلبات النثرية (عدد)</span>
                      <p dir="ltr" className="text-base font-extrabold tabular-nums mt-0.5">
                        {formatNumber(bi.financialAnalysis.relatedRequestCounts.pettyCashRequests)} طلب
                      </p>
                    </div>
                    <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                      <span className="text-[11px] text-slate-500">طلبات الصرف (عدد)</span>
                      <p dir="ltr" className="text-base font-extrabold tabular-nums mt-0.5">
                        {formatNumber(bi.financialAnalysis.relatedRequestCounts.disbursementRequests)} طلب
                      </p>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    {bi.financialAnalysis.relatedRequestCounts.noteAr}
                  </p>
                  <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
                    {bi.financialAnalysis.budgetNoteAr}
                  </p>
                </div>

                <div className="overflow-x-auto fm-scroll rounded-xl border border-slate-200 max-h-56">
                  <table className="w-full text-[11px] border-collapse">
                    <thead className="bg-[#0B2341] text-white sticky top-0">
                      <tr>
                        <th className="py-1.5 px-2 text-start">الفئة</th>
                        <th className="py-1.5 px-2 text-center">النثرية</th>
                        <th className="py-1.5 px-2 text-center">أمر شراء</th>
                        <th className="py-1.5 px-2 text-center">الإجمالي (AED)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {bi.financialAnalysis.byCategory.map((c) => (
                        <tr key={c.categoryId}>
                          <td className="py-1.5 px-2 font-semibold">{c.nameAr}</td>
                          <td dir="ltr" className="py-1.5 px-2 text-center tabular-nums">
                            {formatNumber(c.pettyCashAed)}
                          </td>
                          <td dir="ltr" className="py-1.5 px-2 text-center tabular-nums">
                            {formatNumber(c.purchaseOrderAed)}
                          </td>
                          <td dir="ltr" className="py-1.5 px-2 text-center font-bold tabular-nums">
                            {formatAed(c.totalCostAed)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </AnalyticsSectionFrame>
        </div>
      )}

      {/* =================================================================== */}
      {/* GROUP 3: 08–11 CONTRACTS, SUPPORT SERVICES, TASKS & RISK COMPLIANCE */}
      {/* =================================================================== */}
      {isSectionVisible('gov_risk') && (
        <div className="space-y-5">
          {/* SECTION 08: Contracts & Licenses */}
          <AnalyticsSectionFrame
            id="sec-08-contracts"
            sectionNumber="08"
            titleAr="تحليل العقود والتراخيص والاستحقاقات"
            titleEn="Contracts, Commercial Licenses & Service Agreements"
            subtitleAr="مقارنة العقود والتراخيص الفعالة مقابل غير الفعالة وملاحظات المتابعة"
            imageSrc={safetyLogisticsImg}
            imageAlt="العقود والتراخيص والخدمات المساندة"
          >
            <div className="rounded-xl bg-[#F4F7FB] border border-slate-200 px-3.5 py-2.5 text-xs text-slate-700 flex items-start gap-2">
              <Info className="w-4 h-4 text-[#1769AA] shrink-0 mt-0.5" />
              <span>{bi.contractsAnalysis.expiryLimitationNoteAr}</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {bi.contractsAnalysis.groups.map((g) => (
                <div key={g.groupKey} className="rounded-xl border border-slate-200 p-3.5 bg-white space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xs font-extrabold text-[#0B2341]">{g.nameAr}</h3>
                    <span dir="ltr" className="text-xs font-extrabold tabular-nums text-[#1769AA]">
                      {formatPct(g.activePct, 'غير منطبق')}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
                    <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-2">
                      <span className="block text-slate-600">فعال</span>
                      <strong dir="ltr" className="text-sm text-[#069B74] tabular-nums">
                        {formatNumber(g.activeCount)}
                      </strong>
                    </div>
                    <div className="rounded-lg bg-rose-50 border border-rose-200 p-2">
                      <span className="block text-slate-600">غير فعال</span>
                      <strong dir="ltr" className="text-sm text-[#C43D47] tabular-nums">
                        {formatNumber(g.inactiveCount)}
                      </strong>
                    </div>
                    <div className="rounded-lg bg-slate-50 border border-slate-200 p-2">
                      <span className="block text-slate-600">الإجمالي</span>
                      <strong dir="ltr" className="text-sm text-[#0B2341] tabular-nums">
                        {formatNumber(g.totalCount)}
                      </strong>
                    </div>
                  </div>
                  {g.notes.length > 0 && (
                    <p className="text-[11px] text-slate-600 bg-slate-50 p-2 rounded border border-slate-100">
                      {g.notes.join(' · ')}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </AnalyticsSectionFrame>

          {/* SECTION 09: Security, Reception & Logistics */}
          <AnalyticsSectionFrame
            id="sec-09-support"
            sectionNumber="09"
            titleAr="تحليل الأمن والاستقبال والدعم اللوجستي والخدمات المساندة"
            titleEn="Security, Reception, Logistics & Support Operations"
            subtitleAr="تحليل قنوات الشحن والتوصيل وأنشطة الاستقبال والأمن والنظافة وإدارة النفايات كلٌ بوحدته"
          >
            <div className="rounded-xl bg-[#F4F7FB] border border-slate-200 px-3.5 py-2 text-xs text-slate-700 flex items-start gap-2">
              <Truck className="w-4 h-4 text-[#1769AA] shrink-0 mt-0.5" />
              <span>{bi.supportServicesAnalysis.heterogeneousUnitsNoteAr}</span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-7 overflow-x-auto fm-scroll rounded-xl border border-slate-200">
                <table className="w-full text-xs border-collapse">
                  <thead className="bg-[#0B2341] text-white">
                    <tr>
                      <th className="py-2 px-3 text-start">نشاط الأمن والاستقبال</th>
                      <th className="py-2 px-3 text-center">المستلمة</th>
                      <th className="py-2 px-3 text-center">المنفذة</th>
                      <th className="py-2 px-3 text-center">نسبة الإنجاز</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {bi.supportServicesAnalysis.securityRows.map((sr) => (
                      <tr key={sr.activityKey}>
                        <td className="py-1.5 px-3 font-semibold">
                          {sr.nameAr}
                          {sr.isVisitorLinked && (
                            <span className="ms-1.5 text-[10px] text-[#1769AA] font-bold">
                              (مرتبط بخدمات الاستقبال)
                            </span>
                          )}
                        </td>
                        <td dir="ltr" className="py-1.5 px-3 text-center tabular-nums">
                          {formatNumber(sr.receivedCount)}
                        </td>
                        <td dir="ltr" className="py-1.5 px-3 text-center tabular-nums">
                          {formatNumber(sr.executedCount)}
                        </td>
                        <td dir="ltr" className="py-1.5 px-3 text-center font-bold tabular-nums">
                          {formatPct(sr.completionPct, 'غير منطبق')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="lg:col-span-5 rounded-xl border border-slate-200 p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-extrabold text-[#0B2341]">قنوات الدعم اللوجستي</h3>
                  <span dir="ltr" className="text-xs font-bold tabular-nums text-[#1769AA]">
                    الإجمالي: {formatNumber(bi.supportServicesAnalysis.logisticsTotal)} طلب
                  </span>
                </div>
                <LogisticsChannelsChart channels={bi.supportServicesAnalysis.logisticsChannels} />
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[11px]">
                  <div className="rounded-lg bg-slate-50 p-2 border border-slate-100">
                    <span className="text-slate-500 block">النظافة</span>
                    <strong dir="ltr" className="tabular-nums text-[#0B2341]">
                      {formatNumber(bi.supportServicesAnalysis.cleaningRequests)}
                    </strong>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-2 border border-slate-100">
                    <span className="text-slate-500 block">النفايات</span>
                    <strong dir="ltr" className="tabular-nums text-[#0B2341]">
                      {formatNumber(bi.supportServicesAnalysis.wasteRequests)}
                    </strong>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-2 border border-slate-100">
                    <span className="text-slate-500 block">الضيافة</span>
                    <strong dir="ltr" className="tabular-nums text-[#0B2341]">
                      {formatNumber(bi.supportServicesAnalysis.hospitalityRequests)}
                    </strong>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-2 border border-slate-100">
                    <span className="text-slate-500 block">الحكومية</span>
                    <strong dir="ltr" className="tabular-nums text-[#0B2341]">
                      {formatNumber(bi.supportServicesAnalysis.governmentRequests)}
                    </strong>
                  </div>
                </div>
              </div>
            </div>
          </AnalyticsSectionFrame>

          {/* SECTION 10: Tasks, Challenges & Logged Recommendations */}
          <AnalyticsSectionFrame
            id="sec-10-tasks"
            sectionNumber="10"
            titleAr="تحليل المهام التشغيلية والتحديات والتوصيات المسجلة"
            titleEn="Operational Tasks, Challenges & Follow-up Registry"
            subtitleAr="توزيع حالات المهام التشغيلية، نسبة الإنجاز، وسجل التحديات والتوصيات الميدانية"
          >
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-5 rounded-xl border border-slate-200 p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-extrabold text-[#0B2341]">توزيع حالات المهام</h3>
                  <span dir="ltr" className="text-xs font-bold tabular-nums text-[#069B74]">
                    متوسط الإنجاز: {formatPct(bi.tasksAndChallenges.avgCompletionPct, 'غير منطبق')}
                  </span>
                </div>
                <TasksStatusChart distribution={bi.tasksAndChallenges.statusDistribution} />
              </div>

              <div className="lg:col-span-7 overflow-x-auto fm-scroll rounded-xl border border-slate-200 max-h-72">
                <table className="w-full text-xs border-collapse">
                  <thead className="bg-[#0B2341] text-white sticky top-0">
                    <tr>
                      <th className="py-2 px-2.5 text-start">التقرير</th>
                      <th className="py-2 px-2.5 text-start">الموضوع / المهمة</th>
                      <th className="py-2 px-2.5 text-center">الحالة</th>
                      <th className="py-2 px-2.5 text-center">الإنجاز</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {bi.tasksAndChallenges.tasksList.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-6 text-center text-slate-400">
                          لا توجد مهام تشغيلية مسجلة في النطاق الحالي
                        </td>
                      </tr>
                    ) : (
                      bi.tasksAndChallenges.tasksList.map((t) => (
                        <tr key={t.id}>
                          <td className="py-1.5 px-2.5 text-[11px] font-mono text-slate-500">
                            {t.periodLabelAr}
                          </td>
                          <td className="py-1.5 px-2.5">
                            <p className="font-bold text-[#0B2341]">{t.topic}</p>
                            <p className="text-[11px] text-slate-600">{t.taskName}</p>
                          </td>
                          <td className="py-1.5 px-2.5 text-center font-semibold">{t.statusLabelAr}</td>
                          <td dir="ltr" className="py-1.5 px-2.5 text-center font-bold tabular-nums">
                            {t.completionPct}%
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {bi.tasksAndChallenges.challengesList.length > 0 && (
              <div className="overflow-x-auto fm-scroll rounded-xl border border-slate-200">
                <table className="w-full text-xs border-collapse">
                  <thead className="bg-[#1769AA] text-white">
                    <tr>
                      <th className="py-2 px-3 text-start w-28">الفترة</th>
                      <th className="py-2 px-3 text-start">التحدي / العائق</th>
                      <th className="py-2 px-3 text-start">التحديث الإجرائي</th>
                      <th className="py-2 px-3 text-start">التوصية المدونة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {bi.tasksAndChallenges.challengesList.map((ch) => (
                      <tr key={ch.id}>
                        <td className="py-2 px-3 font-semibold text-slate-600 align-top">
                          {ch.periodLabelAr}
                        </td>
                        <td className="py-2 px-3 whitespace-pre-wrap align-top">{ch.challengeText}</td>
                        <td className="py-2 px-3 whitespace-pre-wrap align-top">{ch.updateText}</td>
                        <td className="py-2 px-3 whitespace-pre-wrap font-semibold text-[#0B2341] align-top">
                          {ch.recommendationText}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </AnalyticsSectionFrame>

          {/* SECTION 11: Risk & Operational Compliance */}
          <AnalyticsSectionFrame
            id="sec-11-risk"
            sectionNumber="11"
            titleAr="تحليل المخاطر والامتثال التشغيلي والسلامة"
            titleEn="Fire Safety & Operational Hazard Compliance"
            subtitleAr="جاهزية طفايات الحريق ومعدل إغلاق ملاحظات المخاطر والسلامة المهنية"
            imageSrc={riskSafetyImg}
            imageAlt="سلامة المرافق وطفايات الحريق والامتثال"
          >
            <div className="rounded-xl bg-[#F4F7FB] border border-slate-200 px-3.5 py-2 text-xs text-slate-700 flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-[#069B74] shrink-0 mt-0.5" />
              <span>{bi.riskComplianceAnalysis.matrixLimitationNoteAr}</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl border border-slate-200 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-extrabold text-[#0B2341]">جاهزية طفايات الحريق</h3>
                  <span dir="ltr" className="text-sm font-extrabold text-[#069B74] tabular-nums">
                    {formatPct(bi.riskComplianceAnalysis.extinguishersReadinessPct, 'غير منطبق')}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-2">
                    <span className="text-[11px] text-slate-600 block">فعالة</span>
                    <strong dir="ltr" className="tabular-nums text-[#069B74]">
                      {formatNumber(bi.riskComplianceAnalysis.extinguishersActive)}
                    </strong>
                  </div>
                  <div className="rounded-lg bg-rose-50 border border-rose-200 p-2">
                    <span className="text-[11px] text-slate-600 block">غير فعالة</span>
                    <strong dir="ltr" className="tabular-nums text-[#C43D47]">
                      {formatNumber(bi.riskComplianceAnalysis.extinguishersInactive)}
                    </strong>
                  </div>
                  <div className="rounded-lg bg-slate-50 border border-slate-200 p-2">
                    <span className="text-[11px] text-slate-600 block">الإجمالي</span>
                    <strong dir="ltr" className="tabular-nums">
                      {formatNumber(bi.riskComplianceAnalysis.extinguishersTotal)}
                    </strong>
                  </div>
                </div>
                {bi.riskComplianceAnalysis.extinguisherNotes.length > 0 && (
                  <p className="text-[11px] text-slate-600 bg-slate-50 p-2 rounded">
                    {bi.riskComplianceAnalysis.extinguisherNotes.join(' · ')}
                  </p>
                )}
              </div>

              <div className="rounded-xl border border-slate-200 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-extrabold text-[#0B2341]">ملاحظات المخاطر والسلامة</h3>
                  <span dir="ltr" className="text-sm font-extrabold text-[#1769AA] tabular-nums">
                    {formatPct(bi.riskComplianceAnalysis.hazardsClosurePct, 'غير منطبق')}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-2">
                    <span className="text-[11px] text-slate-600 block">مغلقة</span>
                    <strong dir="ltr" className="tabular-nums text-[#069B74]">
                      {formatNumber(bi.riskComplianceAnalysis.hazardsClosed)}
                    </strong>
                  </div>
                  <div className="rounded-lg bg-rose-50 border border-rose-200 p-2">
                    <span className="text-[11px] text-slate-600 block">مفتوحة (حرجة)</span>
                    <strong dir="ltr" className="tabular-nums text-[#C43D47]">
                      {formatNumber(bi.riskComplianceAnalysis.hazardsOpen)}
                    </strong>
                  </div>
                  <div className="rounded-lg bg-slate-50 border border-slate-200 p-2">
                    <span className="text-[11px] text-slate-600 block">الإجمالي</span>
                    <strong dir="ltr" className="tabular-nums">
                      {formatNumber(bi.riskComplianceAnalysis.hazardsTotal)}
                    </strong>
                  </div>
                </div>
                {bi.riskComplianceAnalysis.hazardNotes.length > 0 && (
                  <p className="text-[11px] text-slate-600 bg-slate-50 p-2 rounded">
                    {bi.riskComplianceAnalysis.hazardNotes.join(' · ')}
                  </p>
                )}
              </div>
            </div>
          </AnalyticsSectionFrame>
        </div>
      )}

      {/* =================================================================== */}
      {/* GROUP 4: 12–16 COMPARISONS, TRENDS, FORECAST, WARNINGS, DECISIONS   */}
      {/* =================================================================== */}
      {isSectionVisible('trends_decisions') && (
        <div className="space-y-5">
          {/* SECTION 12 & 13: Monthly/Annual Comparisons & Trends */}
          <AnalyticsSectionFrame
            id="sec-12-comparisons"
            sectionNumber="12–13"
            titleAr="المقارنات الشهرية والسنوية وتحليل الاتجاهات والتغيرات"
            titleEn="MoM / YoY Comparisons & Historical Trends"
            subtitleAr="مقارنة التغيرات المطلقة والنسبية عبر الفترات المعتمدة وقيد الإعداد وفق السلاسل الزمنية الفعلية"
            imageSrc={boardroomStrategyImg}
            imageAlt="لوحة المقارنات الاستراتيجية السنوية"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-200 p-3.5 bg-[#F7FAFC]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-extrabold text-[#0B2341] flex items-center gap-1.5">
                    <CalendarRange className="w-4 h-4 text-[#1769AA]" />
                    المقارنة الشهرية (MoM)
                  </span>
                  <span className="text-[11px] text-slate-500">
                    {bi.comparisons.mom.available
                      ? `${bi.comparisons.latestPeriod?.labelAr} مقابل ${bi.comparisons.previousPeriod?.labelAr}`
                      : 'تتطلب فترتين شهريتين على الأقل'}
                  </span>
                </div>
                {bi.comparisons.mom.available ? (
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="bg-white p-2 rounded border border-slate-200">
                      <span className="text-[10.5px] text-slate-500 block">الطلبات المستلمة</span>
                      <strong dir="ltr" className="tabular-nums">
                        {(bi.comparisons.mom.received.absoluteDelta ?? 0) >= 0 ? '+' : ''}
                        {formatNumber(bi.comparisons.mom.received.absoluteDelta ?? 0)}
                      </strong>
                      <span className="block text-[10px] text-slate-500" dir="ltr">
                        {bi.comparisons.mom.received.pctDelta !== null
                          ? `${bi.comparisons.mom.received.pctDelta}%`
                          : 'أساس المقارنة صفر'}
                      </span>
                    </div>
                    <div className="bg-white p-2 rounded border border-slate-200">
                      <span className="text-[10.5px] text-slate-500 block">الأعطال</span>
                      <strong dir="ltr" className="tabular-nums">
                        {(bi.comparisons.mom.faults.absoluteDelta ?? 0) >= 0 ? '+' : ''}
                        {formatNumber(bi.comparisons.mom.faults.absoluteDelta ?? 0)}
                      </strong>
                      <span className="block text-[10px] text-slate-500" dir="ltr">
                        {bi.comparisons.mom.faults.pctDelta !== null
                          ? `${bi.comparisons.mom.faults.pctDelta}%`
                          : 'أساس المقارنة صفر'}
                      </span>
                    </div>
                    <div className="bg-white p-2 rounded border border-slate-200">
                      <span className="text-[10.5px] text-slate-500 block">التكلفة (AED)</span>
                      <strong dir="ltr" className="tabular-nums">
                        {(bi.comparisons.mom.costAed.absoluteDelta ?? 0) >= 0 ? '+' : ''}
                        {formatNumber(bi.comparisons.mom.costAed.absoluteDelta ?? 0)}
                      </strong>
                      <span className="block text-[10px] text-slate-500" dir="ltr">
                        {bi.comparisons.mom.costAed.pctDelta !== null
                          ? `${bi.comparisons.mom.costAed.pctDelta}%`
                          : 'أساس المقارنة صفر'}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">
                    لا توجد فترة سابقة في النطاق المختار لاحتساب التغير الشهري (MoM).
                  </p>
                )}
              </div>

              <div className="rounded-xl border border-slate-200 p-3.5 bg-[#F7FAFC]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-extrabold text-[#0B2341] flex items-center gap-1.5">
                    <TrendingUp className="w-4 h-4 text-[#069B74]" />
                    المقارنة السنوية (YoY) والتراكم السنوي (YTD)
                  </span>
                </div>
                {bi.comparisons.yoy.available ? (
                  <p className="text-xs text-slate-700">
                    {bi.comparisons.yoy.currentLabelAr} مقابل {bi.comparisons.yoy.previousYearLabelAr}: تغير الطلبات{' '}
                    <strong dir="ltr">
                      {formatNumber(bi.comparisons.yoy.received.absoluteDelta ?? 0)}
                    </strong>
                  </p>
                ) : (
                  <p className="text-xs text-slate-500 mb-2">
                    المقارنة السنوية (YoY) غير متاحة لعدم وجود نفس الشهر في سنة سابقة ضمن النطاق.
                  </p>
                )}
                {bi.comparisons.yearlyTotals.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-1">
                    {bi.comparisons.yearlyTotals.map((y) => (
                      <div key={y.year} className="bg-white px-2.5 py-1.5 rounded border border-slate-200 text-[11px]">
                        <strong dir="ltr">{y.year}</strong>:{' '}
                        <span dir="ltr" className="tabular-nums">
                          {formatNumber(y.received)} طلب
                        </span>{' '}
                        ·{' '}
                        <span dir="ltr" className="tabular-nums">
                          {formatNumber(y.faults)} عطل
                        </span>{' '}
                        ·{' '}
                        <span dir="ltr" className="tabular-nums">
                          {formatAed(y.costAed)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 p-3.5">
              <h3 className="text-xs font-extrabold text-[#0B2341] mb-2">
                الاتجاه التاريخي للطلبات والأعطال عبر الفترات
              </h3>
              <TimelineComparisonChart timeline={bi.comparisons.timeline} />
            </div>
          </AnalyticsSectionFrame>

          {/* SECTION 14: Conditional Predictive Insights */}
          <AnalyticsSectionFrame
            id="sec-14-forecast"
            sectionNumber="14"
            titleAr="التوقعات المستقبلية المشروطة بكفاية البيانات"
            titleEn="Conditional Predictive Analytics"
            subtitleAr="تُفعّل النماذج التنبؤية فقط عند توفر 3 أشهر زمنية على الأقل لضمان الموثوقية الإحصائية"
          >
            {!bi.forecast.available ? (
              <div className="rounded-xl border border-amber-300 bg-amber-50/70 p-4 flex items-start gap-3">
                <Sparkles className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                <div className="space-y-1 text-xs">
                  <p className="font-extrabold text-[#0B2341]">
                    بيانات غير كافية للتنبؤ ({formatNumber(bi.forecast.periodsCount)} من أصل{' '}
                    {formatNumber(bi.forecast.minRequiredPeriods)} أشهر مطلوبة)
                  </p>
                  <p className="text-slate-700 leading-relaxed">{bi.forecast.reasonAr}</p>
                  <p className="text-[11px] text-slate-500">{bi.forecast.methodologyAr}</p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-slate-700">
                  {bi.forecast.reasonAr} — الفترة المتوقعة القادمة:{' '}
                  <strong className="text-[#1769AA]">{bi.forecast.nextPeriodLabelAr}</strong>
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {[
                    { label: 'الطلبات المتوقعة', item: bi.forecast.requestsForecast, isAed: false },
                    { label: 'الأعطال المتوقعة', item: bi.forecast.faultsForecast, isAed: false },
                    { label: 'تكاليف الصيانة المتوقعة', item: bi.forecast.costForecast, isAed: true },
                  ].map((fCard) => (
                    <div key={fCard.label} className="rounded-xl border border-slate-200 p-3.5 bg-[#F7FAFC]">
                      <p className="text-xs font-bold text-slate-600">{fCard.label}</p>
                      <p dir="ltr" className="text-xl font-extrabold text-[#0B2341] tabular-nums mt-1">
                        {fCard.item
                          ? fCard.isAed
                            ? formatAed(fCard.item.predicted)
                            : `${formatNumber(Math.round(fCard.item.predicted))} ${fCard.item.unit}`
                          : '—'}
                      </p>
                      {fCard.item && (
                        <p dir="ltr" className="text-[11px] text-slate-500 tabular-nums mt-1">
                          النطاق (±1 SE): {formatNumber(Math.round(fCard.item.lowerBound))} –{' '}
                          {formatNumber(Math.round(fCard.item.upperBound))}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-slate-500">{bi.forecast.methodologyAr}</p>
              </div>
            )}
          </AnalyticsSectionFrame>

          {/* SECTION 15: Early Warning Indicators */}
          <AnalyticsSectionFrame
            id="sec-15-warnings"
            sectionNumber="15"
            titleAr="التنبيهات والمؤشرات التي تتطلب الانتباه"
            titleEn="Early Warning Indicators & Exception Alerts"
            subtitleAr="تنبيهات مبنية حصراً على القيم الرقمية وحدود الأداء المعتمدة مع رابط مباشر للقسم المعني"
            badgeText={`${formatNumber(bi.earlyWarnings.length)} تنبيه مرصود`}
          >
            {bi.earlyWarnings.length === 0 ? (
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 flex items-center gap-2.5 text-xs text-[#069B74] font-bold">
                <CheckCircle2 className="w-5 h-5 shrink-0" />
                <span>لا توجد مؤشرات إنذار مبكر أو تجاوزات حرجة ضمن النطاق المختار حالياً.</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {bi.earlyWarnings.map((w) => (
                  <div
                    key={w.id}
                    className={`rounded-xl border p-3.5 flex flex-col justify-between gap-2 ${
                      w.severity === 'critical'
                        ? 'bg-rose-50/70 border-rose-200'
                        : w.severity === 'warning'
                          ? 'bg-amber-50/70 border-amber-200'
                          : 'bg-sky-50/70 border-sky-200'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-extrabold text-[#0B2341] flex items-center gap-1.5">
                          <ShieldAlert
                            className={`w-4 h-4 shrink-0 ${
                              w.severity === 'critical' ? 'text-[#C43D47]' : 'text-amber-700'
                            }`}
                          />
                          {w.title}
                        </span>
                        <span
                          dir="ltr"
                          className={`text-xs font-extrabold tabular-nums shrink-0 ${
                            w.severity === 'critical' ? 'text-[#C43D47]' : 'text-amber-800'
                          }`}
                        >
                          {w.metricDisplay}
                        </span>
                      </div>
                      <p className="text-[11.5px] text-slate-700">{w.comparisonText}</p>
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => jumpToSection(w.targetSectionId)}
                        className="text-[11px] font-bold text-[#1769AA] hover:underline cursor-pointer"
                      >
                        انتقل إلى: {w.targetSectionLabel} ←
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </AnalyticsSectionFrame>

          {/* SECTION 16: Executive Decisions & Recommendations */}
          <AnalyticsSectionFrame
            id="sec-16-recommendations"
            sectionNumber="16"
            titleAr="النتائج والتوصيات التنفيذية للإدارة العليا"
            titleEn="Executive Findings & Actionable Recommendations"
            subtitleAr="توصيات مستخلصة آلياً من المؤشرات المرصودة فقط، مع الأولوية والجهة المسؤولة ومؤشر القياس المقترح"
          >
            {bi.recommendations.length === 0 ? (
              <p className="text-xs text-slate-500">
                أضف بيانات تقارير ضمن النطاق لتوليد التوصيات التنفيذية المبنية على الأدلة الرقمية.
              </p>
            ) : (
              <div className="space-y-3">
                {bi.recommendations.map((rec) => (
                  <div
                    key={rec.id}
                    className="rounded-xl border border-slate-200 bg-white p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 hover:border-[#1769AA]/50 transition-colors"
                  >
                    <div className="space-y-1.5 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`text-[11px] font-bold px-2.5 py-0.5 rounded border ${
                            rec.priority === 'urgent'
                              ? 'bg-rose-50 text-[#C43D47] border-rose-200'
                              : rec.priority === 'medium'
                                ? 'bg-amber-50 text-amber-800 border-amber-200'
                                : 'bg-sky-50 text-[#1769AA] border-sky-200'
                          }`}
                        >
                          {rec.priorityLabelAr}
                        </span>
                        <h3 className="text-sm font-extrabold text-[#0B2341]">{rec.title}</h3>
                      </div>
                      <p className="text-xs text-slate-600">
                        <strong className="text-[#0B2341]">الدليل الرقمي:</strong> {rec.evidenceText}
                      </p>
                      <p className="text-xs text-slate-700">
                        <strong className="text-[#0B2341]">الإجراء التنفيذي:</strong> {rec.actionText}
                      </p>
                      <div className="flex flex-wrap items-center gap-4 pt-1 text-[11px] text-slate-600">
                        <span>
                          <Users className="w-3.5 h-3.5 inline me-1 text-[#1769AA]" />
                          الجهة المسؤولة: <strong>{rec.owner}</strong>
                        </span>
                        <span>
                          <ListChecks className="w-3.5 h-3.5 inline me-1 text-[#069B74]" />
                          مؤشر المتابعة: <strong>{rec.suggestedKpi}</strong>
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => jumpToSection(rec.targetSectionId)}
                      className="px-3.5 py-2 rounded-lg bg-[#F4F7FB] hover:bg-[#EAF4FC] border border-slate-200 text-xs font-bold text-[#0B2341] cursor-pointer whitespace-nowrap shrink-0 self-start lg:self-center"
                    >
                      عرض القسم المرتبط
                    </button>
                  </div>
                ))}
              </div>
            )}
          </AnalyticsSectionFrame>
        </div>
      )}

      {/* =================================================================== */}
      {/* 18. EXECUTIVE A4 PDF / PRINT MODAL                                  */}
      {/* =================================================================== */}
      <AnalyticsPrintModal
        open={printModalOpen}
        data={bi}
        onClose={() => setPrintModalOpen(false)}
        onExportPdf={(orientation) => handleExportPdf(orientation)}
        onExportExcel={handleExportExcel}
        exportingPdf={exportingPdf}
        exportingExcel={exportingExcel}
      />
    </div>
  );
};
