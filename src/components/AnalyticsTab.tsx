import React, { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  BarChart3,
  Building2,
  Coins,
  Filter,
  Flame,
  Layers,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  Truck,
} from 'lucide-react';
import { api } from '../api/client.ts';
import type {
  MaintenanceCategory,
  MaintenanceSite,
  MonthlyReportFull,
  PerformanceThresholds,
} from '../types/report.ts';
import {
  ARABIC_MONTHS,
  DEFAULT_THRESHOLDS,
  REPORT_STATUSES,
  STATUS_LABELS_AR,
} from '../types/report.ts';
import {
  computeReportMetrics,
  formatAed,
  formatNumber,
  formatPct,
  formatPercentage,
  getMonthNameAr,
  safePercentage,
} from '../utils/calculations.ts';

const COLORS = ['#0B2341', '#1769AA', '#069B74', '#C8A85D', '#2563EB', '#0D9488', '#D97706', '#6366F1'];

export const AnalyticsTab: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState<MonthlyReportFull[]>([]);
  const [sites, setSites] = useState<MaintenanceSite[]>([]);
  const [categories, setCategories] = useState<MaintenanceCategory[]>([]);
  const [thresholds, setThresholds] = useState<PerformanceThresholds>(DEFAULT_THRESHOLDS);

  // Filters
  const [statusFilter, setStatusFilter] = useState<'all' | 'approved_only' | 'draft_only'>('all');
  const [yearFilter, setYearFilter] = useState<string>('all');
  const [monthFilter, setMonthFilter] = useState<string>('all');
  const [serviceFilter, setServiceFilter] = useState<string>('all');
  const [siteFilter, setSiteFilter] = useState<string>('all');
  const [periodRange, setPeriodRange] = useState<'all' | 'h1' | 'h2'>('all');

  useEffect(() => {
    setLoading(true);
    api
      .getAllAnalytics()
      .then((res) => {
        setReports(res.reports);
        setSites(res.sites);
        setCategories(res.categories);
        setThresholds(res.thresholds);
      })
      .finally(() => setLoading(false));
  }, []);

  const availableYears = useMemo(() => {
    const yrs = Array.from(new Set(reports.map((r) => r.year))).sort((a, b) => b - a);
    return yrs;
  }, [reports]);

  const filteredReports = useMemo(() => {
    return reports
      .filter((r) => {
        if (statusFilter === 'approved_only') {
          if (r.status !== REPORT_STATUSES.APPROVED && r.status !== REPORT_STATUSES.ARCHIVED) return false;
        } else if (statusFilter === 'draft_only') {
          if (r.status === REPORT_STATUSES.APPROVED || r.status === REPORT_STATUSES.ARCHIVED) return false;
        }
        if (yearFilter !== 'all' && r.year !== Number(yearFilter)) return false;
        if (monthFilter !== 'all' && r.month !== Number(monthFilter)) return false;
        if (periodRange === 'h1' && r.month > 6) return false;
        if (periodRange === 'h2' && r.month <= 6) return false;
        return true;
      })
      .sort((a, b) => (a.year !== b.year ? a.year - b.year : a.month - b.month));
  }, [reports, statusFilter, yearFilter, monthFilter, periodRange]);

  const aggregated = useMemo(() => {
    const activeSites = siteFilter === 'all' ? sites : sites.filter((s) => s.id === siteFilter);

    let totalReceived = 0;
    let totalExecuted = 0;
    let totalFaults = 0;
    let totalPettyCash = 0;
    let totalPO = 0;
    let totalLogistics = 0;
    let openHazards = 0;
    let closedHazards = 0;
    let inactiveExt = 0;
    let activeExt = 0;

    let tasksCompleted = 0;
    let tasksInProgress = 0;
    let tasksDelayed = 0;
    let tasksPaused = 0;
    let tasksNotStarted = 0;

    const serviceTotalsMap: Record<string, { nameAr: string; received: number; executed: number }> = {};
    const siteFaultTotals: Record<string, { nameAr: string; count: number }> = {};
    const catFaultTotals: Record<string, { nameAr: string; count: number }> = {};
    const heatmap: Record<string, Record<string, number>> = {};
    const logisticsTotals: Record<string, { nameAr: string; count: number }> = {};
    const securityTotalsMap: Record<string, { nameAr: string; received: number; executed: number }> = {};
    let totalSecurityReceived = 0;
    let totalSecurityExecuted = 0;
    const annualMap: Record<number, { year: number; received: number; executed: number; faults: number; costAed: number }> = {};

    sites.forEach((s) => {
      siteFaultTotals[s.id] = { nameAr: s.nameAr, count: 0 };
      heatmap[s.id] = {};
      categories.forEach((c) => {
        heatmap[s.id][c.id] = 0;
      });
    });
    categories.forEach((c) => {
      catFaultTotals[c.id] = { nameAr: c.nameAr, count: 0 };
    });

    const monthlyTrend = filteredReports.map((r) => {
      const m = computeReportMetrics(r, activeSites, categories, thresholds);

      // Respect service filter if selected
      const relevantServices =
        serviceFilter === 'all' ? m.servicesWithMetrics : m.servicesWithMetrics.filter((s) => s.serviceId === serviceFilter);

      const repRec = relevantServices.reduce((acc, s) => acc + s.receivedCount, 0);
      const repExec = relevantServices.reduce((acc, s) => acc + s.executedCount, 0);

      totalReceived += repRec;
      totalExecuted += repExec;
      totalFaults += m.maintenance.grandTotalFaults;
      totalPettyCash += m.maintenance.pettyCashTotalAed;
      totalPO += m.maintenance.purchaseOrderTotalAed;
      totalLogistics += m.logisticsTotal;

      // Aggregate per service
      for (const s of relevantServices) {
        if (!serviceTotalsMap[s.serviceId]) {
          serviceTotalsMap[s.serviceId] = { nameAr: s.nameAr, received: 0, executed: 0 };
        }
        serviceTotalsMap[s.serviceId].received += s.receivedCount;
        serviceTotalsMap[s.serviceId].executed += s.executedCount;
      }

      // Aggregate site/category matrix & heatmap
      for (const site of activeSites) {
        for (const cat of categories) {
          const val = Math.max(0, Number(r.maintenanceMatrix[site.id]?.[cat.id]) || 0);
          siteFaultTotals[site.id].count += val;
          catFaultTotals[cat.id].count += val;
          heatmap[site.id][cat.id] += val;
        }
      }

      // Logistics
      for (const l of m.logisticsWithPct) {
        if (!logisticsTotals[l.channelKey]) {
          logisticsTotals[l.channelKey] = { nameAr: l.nameAr, count: 0 };
        }
        logisticsTotals[l.channelKey].count += l.requestCount;
      }

      // Security & Reception
      for (const sr of m.securityWithPct) {
        if (!securityTotalsMap[sr.activityKey]) {
          securityTotalsMap[sr.activityKey] = { nameAr: sr.nameAr, received: 0, executed: 0 };
        } else {
          securityTotalsMap[sr.activityKey].nameAr = sr.nameAr;
        }
        securityTotalsMap[sr.activityKey].received += sr.receivedCount;
        securityTotalsMap[sr.activityKey].executed += sr.executedCount;
        totalSecurityReceived += sr.receivedCount;
        totalSecurityExecuted += sr.executedCount;
      }

      // Safety
      const ext = r.safety.find((x) => x.groupKey === 'fire_extinguishers');
      const risk = r.safety.find((x) => x.groupKey === 'risk_observations');
      activeExt += ext?.primaryCount ?? 0;
      inactiveExt += ext?.secondaryCount ?? 0;
      closedHazards += risk?.primaryCount ?? 0;
      openHazards += risk?.secondaryCount ?? 0;

      // Tasks
      tasksCompleted += m.tasksSummary.completed;
      tasksInProgress += m.tasksSummary.inProgress;
      tasksDelayed += m.tasksSummary.delayed;
      tasksPaused += m.tasksSummary.paused;
      tasksNotStarted += m.tasksSummary.notStarted;

      // Annual
      if (!annualMap[r.year]) {
        annualMap[r.year] = { year: r.year, received: 0, executed: 0, faults: 0, costAed: 0 };
      }
      annualMap[r.year].received += repRec;
      annualMap[r.year].executed += repExec;
      annualMap[r.year].faults += m.maintenance.grandTotalFaults;
      annualMap[r.year].costAed += m.maintenance.grandTotalCostAed;

      const rental = r.contracts.find((c) => c.groupKey === 'rental_contracts');
      const commercial = r.contracts.find((c) => c.groupKey === 'commercial_licenses');
      const serviceCon = r.contracts.find((c) => c.groupKey === 'service_contracts');

      return {
        label: `${getMonthNameAr(r.month)} ${r.year}`,
        statusLabel: STATUS_LABELS_AR[r.status],
        received: repRec,
        executed: repExec,
        completionPct: safePercentage(repExec, repRec) ?? 0,
        faults: m.maintenance.grandTotalFaults,
        pettyCashAed: m.maintenance.pettyCashTotalAed,
        purchaseOrderAed: m.maintenance.purchaseOrderTotalAed,
        activeContracts: (rental?.activeCount ?? 0) + (commercial?.activeCount ?? 0) + (serviceCon?.activeCount ?? 0),
        inactiveContracts: (rental?.inactiveCount ?? 0) + (commercial?.inactiveCount ?? 0) + (serviceCon?.inactiveCount ?? 0),
        openHazards: risk?.secondaryCount ?? 0,
        closedHazards: risk?.primaryCount ?? 0,
      };
    });

    const serviceRanking = Object.entries(serviceTotalsMap)
      .map(([id, v]) => ({ id, ...v, pct: safePercentage(v.executed, v.received) }))
      .sort((a, b) => b.received - a.received);

    const topService = serviceRanking.find((s) => s.received > 0) ?? null;
    const lowestService = [...serviceRanking].reverse().find((s) => s.received > 0) ?? null;
    const topFaultSite = Object.values(siteFaultTotals).sort((a, b) => b.count - a.count)[0] ?? null;
    const topFaultCat = Object.values(catFaultTotals).sort((a, b) => b.count - a.count)[0] ?? null;

    let maxHeatCell = 0;
    activeSites.forEach((s) =>
      categories.forEach((c) => {
        if ((heatmap[s.id]?.[c.id] ?? 0) > maxHeatCell) maxHeatCell = heatmap[s.id][c.id];
      })
    );

    const taskBreakdown = [
      { name: 'مكتملة', count: tasksCompleted, color: '#069B74' },
      { name: 'قيد التنفيذ', count: tasksInProgress, color: '#1769AA' },
      { name: 'متأخرة', count: tasksDelayed, color: '#C43D47' },
      { name: 'متوقفة', count: tasksPaused, color: '#C8A85D' },
      { name: 'لم تبدأ', count: tasksNotStarted, color: '#94A3B8' },
    ].filter((t) => t.count > 0);

    const securityRanking = Object.entries(securityTotalsMap)
      .map(([key, v]) => ({
        activityKey: key,
        nameAr: v.nameAr,
        received: v.received,
        executed: v.executed,
        pct: safePercentage(v.executed, v.received),
      }))
      .sort((a, b) => b.received - a.received);

    return {
      totalReceived,
      totalExecuted,
      overallPct: safePercentage(totalExecuted, totalReceived),
      totalFaults,
      totalPettyCash,
      totalPO,
      totalCostAed: Math.round((totalPettyCash + totalPO) * 100) / 100,
      totalLogistics,
      totalSecurityReceived,
      totalSecurityExecuted,
      securityOverallPct: safePercentage(totalSecurityExecuted, totalSecurityReceived),
      securityRanking,
      openHazards,
      closedHazards,
      inactiveExt,
      activeExt,
      monthlyTrend,
      annualData: Object.values(annualMap).sort((a, b) => a.year - b.year),
      serviceRanking,
      topService,
      lowestService,
      siteFaultList: Object.values(siteFaultTotals).filter((s) => s.count > 0 || activeSites.length <= 6),
      topFaultSite: topFaultSite && topFaultSite.count > 0 ? topFaultSite : null,
      topFaultCat: topFaultCat && topFaultCat.count > 0 ? topFaultCat : null,
      heatmap,
      maxHeatCell,
      activeSites,
      logisticsList: Object.values(logisticsTotals),
      taskBreakdown,
      tasksTotal: tasksCompleted + tasksInProgress + tasksDelayed + tasksPaused + tasksNotStarted,
      tasksDelayed,
      tasksCompleted,
    };
  }, [filteredReports, sites, categories, thresholds, serviceFilter, siteFilter]);

  if (loading) {
    return (
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 rounded-2xl bg-white border border-slate-200 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const serviceMap = new Map<string, string>();
  for (const r of reports) {
    for (const s of r.services) {
      if (!serviceMap.has(s.serviceId)) {
        serviceMap.set(s.serviceId, s.nameAr);
      }
    }
  }
  const allServices = Array.from(serviceMap.entries()).map(([serviceId, nameAr]) => ({
    serviceId,
    nameAr,
  }));

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Filter Bar */}
      <section className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-[#1769AA]" />
            <h2 className="text-sm font-extrabold text-[#0B2341]">محرك تصفية ذكاء الأعمال (BI Filters)</h2>
          </div>
          <span className="text-xs text-slate-500">
            عدد التقارير المشمولة بالتحليل:{' '}
            <strong className="text-[#0B2341] tabular-nums" dir="ltr">
              {formatNumber(filteredReports.length)}
            </strong>
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
          <div>
            <label className="block font-semibold text-slate-600 mb-1">حالة التقرير</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | 'approved_only' | 'draft_only')}
              className="w-full px-2.5 py-2 rounded-lg border border-slate-200 bg-[#F4F7FB] font-semibold"
            >
              <option value="all">جميع التقارير (مسودة + معتمد)</option>
              <option value="approved_only">المعتمدة والمؤرشفة فقط</option>
              <option value="draft_only">المسودات وقيد المراجعة</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-600 mb-1">السنة</label>
            <select
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
              className="w-full px-2.5 py-2 rounded-lg border border-slate-200 bg-[#F4F7FB] font-semibold"
            >
              <option value="all">كل السنوات</option>
              {availableYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-600 mb-1">الشهر</label>
            <select
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              className="w-full px-2.5 py-2 rounded-lg border border-slate-200 bg-[#F4F7FB] font-semibold"
            >
              <option value="all">كل الأشهر</option>
              {ARABIC_MONTHS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.nameAr}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-600 mb-1">الفترة الزمنية</label>
            <select
              value={periodRange}
              onChange={(e) => setPeriodRange(e.target.value as 'all' | 'h1' | 'h2')}
              className="w-full px-2.5 py-2 rounded-lg border border-slate-200 bg-[#F4F7FB] font-semibold"
            >
              <option value="all">السنة كاملة</option>
              <option value="h1">النصف الأول (يناير - يونيو)</option>
              <option value="h2">النصف الثاني (يوليو - ديسمبر)</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-600 mb-1">نوع الخدمة</label>
            <select
              value={serviceFilter}
              onChange={(e) => setServiceFilter(e.target.value)}
              className="w-full px-2.5 py-2 rounded-lg border border-slate-200 bg-[#F4F7FB] font-semibold"
            >
              <option value="all">جميع الخدمات ({formatNumber(allServices.length)})</option>
              {allServices.map((s) => (
                <option key={s.serviceId} value={s.serviceId}>
                  {s.nameAr}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-600 mb-1">المقر</label>
            <select
              value={siteFilter}
              onChange={(e) => setSiteFilter(e.target.value)}
              className="w-full px-2.5 py-2 rounded-lg border border-slate-200 bg-[#F4F7FB] font-semibold"
            >
              <option value="all">جميع المقرات</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nameAr}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* Executive KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>إجمالي الطلبات (الفترة المصفاة)</span>
            <TrendingUp className="w-4 h-4 text-[#1769AA]" />
          </div>
          <p className="text-3xl font-extrabold text-[#0B2341] tabular-nums mt-3" dir="ltr">
            {formatNumber(aggregated.totalReceived)}
          </p>
          <p className="text-xs text-slate-500 mt-1 tabular-nums">
            المنفذة: <span dir="ltr">{formatNumber(aggregated.totalExecuted)}</span> (
            <span dir="ltr">{formatPct(aggregated.overallPct, 'لا تتوفر بيانات')}</span>)
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>إجمالي أعطال الصيانة</span>
            <Building2 className="w-4 h-4 text-[#C43D47]" />
          </div>
          <p className="text-3xl font-extrabold text-[#0B2341] tabular-nums mt-3" dir="ltr">
            {formatNumber(aggregated.totalFaults)}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            المقر الأكثر طلباً:{' '}
            <strong className="text-[#C43D47]">
              {aggregated.topFaultSite
                ? `${aggregated.topFaultSite.nameAr} (${formatNumber(aggregated.topFaultSite.count)})`
                : '—'}
            </strong>
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>المصروفات الفعلية للصيانة</span>
            <Coins className="w-4 h-4 text-[#C8A85D]" />
          </div>
          <p className="text-2xl font-extrabold text-[#0B2341] tabular-nums mt-3" dir="ltr">
            {formatAed(aggregated.totalCostAed)}
          </p>
          <p className="text-[11px] text-slate-500 mt-1 tabular-nums">
            نثرية: <span dir="ltr">{formatAed(aggregated.totalPettyCash)}</span> · أمر شراء:{' '}
            <span dir="ltr">{formatAed(aggregated.totalPO)}</span>
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>مؤشر السلامة والمهام</span>
            <Flame className="w-4 h-4 text-[#069B74]" />
          </div>
          <p className="text-xl font-extrabold text-[#0B2341] tabular-nums mt-3">
            <span dir="ltr">{formatNumber(aggregated.openHazards)}</span> مخاطر مفتوحة
          </p>
          <p className="text-xs text-slate-500 mt-1 tabular-nums">
            طفايات غير فعّالة: <span dir="ltr">{formatNumber(aggregated.inactiveExt)}</span> · مهام متأخرة:{' '}
            <span dir="ltr">{formatNumber(aggregated.tasksDelayed)}</span>
          </p>
        </div>
      </div>

      {/* 1 & 2. Monthly Comparison + Annual Comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-extrabold text-[#0B2341]">1. المقارنة الشهرية للطلبات ونسب الإنجاز</h3>
              <p className="text-xs text-slate-500">Monthly Requests &amp; Execution Comparison</p>
            </div>
            <BarChart3 className="w-4 h-4 text-[#1769AA]" />
          </div>
          {aggregated.monthlyTrend.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={aggregated.monthlyTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickFormatter={(v) => formatNumber(Number(v))} />
                  <Tooltip formatter={(val) => formatNumber(Number(val ?? 0))} />
                  <Legend />
                  <Bar dataKey="received" name="المستلمة" fill="#0B2341" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="executed" name="المنفذة" fill="#069B74" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-xs text-slate-400 py-16 text-center">لا توجد تقارير مطابقة للفلاتر المحددة</p>
          )}
        </div>

        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-extrabold text-[#0B2341]">2. المقارنة السنوية</h3>
              <p className="text-xs text-slate-500">Annual Requests &amp; Maintenance Trend</p>
            </div>
            <Activity className="w-4 h-4 text-[#C8A85D]" />
          </div>
          {aggregated.annualData.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={aggregated.annualData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="year" tick={{ fontSize: 11 }} tickFormatter={(v) => String(v)} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickFormatter={(v) => formatNumber(Number(v))} />
                  <Tooltip formatter={(val) => formatNumber(Number(val ?? 0))} />
                  <Legend />
                  <Line type="monotone" dataKey="received" name="إجمالي الطلبات" stroke="#1769AA" strokeWidth={2.5} />
                  <Line type="monotone" dataKey="faults" name="أعطال الصيانة" stroke="#C43D47" strokeWidth={2.5} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-xs text-slate-400 py-16 text-center">لا توجد بيانات سنوية للمقارنة</p>
          )}
        </div>
      </div>

      {/* 3 & 4. Services Analysis + Maintenance Heatmap */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <h3 className="text-sm font-extrabold text-[#0B2341] mb-1">3. تحليل الخدمات (الأعلى والأقل طلباً)</h3>
          <p className="text-xs text-slate-500 mb-4">Service Demand &amp; Contribution</p>
          {aggregated.totalReceived > 0 ? (
            <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
              {aggregated.serviceRanking.map((s) => {
                const share = safePercentage(s.received, aggregated.totalReceived) ?? 0;
                return (
                  <div key={s.id} className="space-y-1 text-xs">
                    <div className="flex justify-between font-semibold">
                      <span className="text-[#0B2341]">{s.nameAr}</span>
                      <span className="tabular-nums text-slate-600" dir="ltr">
                        {formatNumber(s.received)} ({formatPercentage(share)})
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-[#1769AA]" style={{ width: `${share}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-slate-400 py-16 text-center">لم تُسجل طلبات خدمات في التقارير المصفاة</p>
          )}
        </div>

        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <h3 className="text-sm font-extrabold text-[#0B2341] mb-1">4. خريطة الكثافة الحرارية لأعطال الصيانة (Heatmap)</h3>
          <p className="text-xs text-slate-500 mb-4">توزيع الأعطال المتراكم حسب المقر وفئة العطل</p>
          <div className="overflow-x-auto fm-scroll">
            <table className="w-full text-[11px] border border-slate-200">
              <thead className="bg-[#0B2341] text-white">
                <tr>
                  <th className="py-2 px-2 text-start">المقر</th>
                  {categories.map((c) => (
                    <th key={c.id} className="py-2 px-1.5 text-center">
                      {c.nameAr}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {aggregated.activeSites.map((site) => (
                  <tr key={site.id}>
                    <td className="py-1.5 px-2 font-bold text-[#0B2341] whitespace-nowrap">{site.nameAr}</td>
                    {categories.map((cat) => {
                      const val = aggregated.heatmap[site.id]?.[cat.id] ?? 0;
                      const intensity = aggregated.maxHeatCell > 0 ? val / aggregated.maxHeatCell : 0;
                      const bg =
                        val === 0
                          ? 'bg-slate-50 text-slate-400'
                          : intensity > 0.65
                            ? 'bg-[#C43D47] text-white font-bold'
                            : intensity > 0.3
                              ? 'bg-[#C8A85D]/70 text-[#0B2341] font-bold'
                              : 'bg-[#EAF4FC] text-[#1769AA] font-bold';
                      return (
                        <td key={cat.id} className={`py-1.5 px-1 text-center tabular-nums border border-white ${bg}`} dir="ltr">
                          {formatNumber(val)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 5, 6, 7, 8, 9. Expenses, Contracts, Safety, Logistics & Tasks */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {/* 5 & 6. Expenses & Contracts */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <h3 className="text-sm font-extrabold text-[#0B2341] mb-1">5 و 6. المصروفات والعقود والرخص</h3>
          <p className="text-xs text-slate-500 mb-3">مقارنة العقود الفعالة وغير الفعالة وتكاليف الصيانة</p>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={aggregated.monthlyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} tickFormatter={(v) => formatNumber(Number(v))} />
                <Tooltip formatter={(val) => formatNumber(Number(val ?? 0))} />
                <Legend />
                <Bar dataKey="activeContracts" name="عقود/رخص فعالة" stackId="a" fill="#069B74" />
                <Bar dataKey="inactiveContracts" name="غير فعالة" stackId="a" fill="#C43D47" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 7 & 8. Logistics & Safety */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-extrabold text-[#0B2341]">7 و 8. الدعم اللوجستي والسلامة</h3>
              <p className="text-xs text-slate-500">حجم القنوات اللوجستية ومؤشرات المخاطر</p>
            </div>
            <Truck className="w-4 h-4 text-[#1769AA]" />
          </div>
          {aggregated.totalLogistics > 0 ? (
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={aggregated.logisticsList.filter((l) => l.count > 0)}
                    dataKey="count"
                    nameKey="nameAr"
                    innerRadius={40}
                    outerRadius={70}
                  >
                    {aggregated.logisticsList.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(val) => [`${formatNumber(Number(val ?? 0))} طلب`, 'العدد']} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-52 flex flex-col items-center justify-center text-center text-xs text-slate-400">
              <p>لم تُسجل عمليات لوجستية في الفترة المحددة</p>
              <p className="mt-2 text-[#0B2341] font-semibold">
                المخاطر المغلقة: <span dir="ltr" className="tabular-nums">{formatNumber(aggregated.closedHazards)}</span> · غير المغلقة:{' '}
                <span dir="ltr" className="tabular-nums">{formatNumber(aggregated.openHazards)}</span>
              </p>
            </div>
          )}
        </div>

        {/* 9. Tasks Analysis */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-extrabold text-[#0B2341]">9. تحليل حالة المهام</h3>
              <p className="text-xs text-slate-500">المكتملة، قيد التنفيذ، المتأخرة، والمتوقفة</p>
            </div>
            <Layers className="w-4 h-4 text-[#069B74]" />
          </div>
          {aggregated.taskBreakdown.length > 0 ? (
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={aggregated.taskBreakdown}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10 }} tickFormatter={(v) => formatNumber(Number(v))} />
                  <Tooltip formatter={(val) => formatNumber(Number(val ?? 0))} />
                  <Bar dataKey="count" name="عدد المهام" radius={[6, 6, 0, 0]}>
                    {aggregated.taskBreakdown.map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-52 flex items-center justify-center text-xs text-slate-400 text-center">
              لا توجد مهام مسجلة بمحتوى فعلي في التقارير المصفاة
            </div>
          )}
        </div>
      </div>

      {/* Security & Reception Dynamic Columns Breakdown */}
      <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#1769AA]" />
            <div>
              <h3 className="text-sm font-extrabold text-[#0B2341]">تحليل خدمات الأمن والاستقبال حسب البيان</h3>
              <p className="text-xs text-slate-500">Security &amp; Reception Breakdown across Dynamic Columns</p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs font-bold text-[#0B2341]">
            <span className="tabular-nums">
              المستلمة: <strong className="text-[#1769AA]" dir="ltr">{formatNumber(aggregated.totalSecurityReceived)}</strong>
            </span>
            <span className="tabular-nums">
              المنفذة: <strong className="text-[#069B74]" dir="ltr">{formatNumber(aggregated.totalSecurityExecuted)}</strong>
            </span>
            <span className="tabular-nums">
              نسبة الإنجاز: <strong dir="ltr">{formatPct(aggregated.securityOverallPct, '—')}</strong>
            </span>
          </div>
        </div>

        {aggregated.securityRanking.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
            {aggregated.securityRanking.map((item) => (
              <div
                key={item.activityKey}
                className="rounded-xl border border-slate-200 bg-[#F8FAFC] p-3 text-center space-y-1"
              >
                <p className="text-xs font-extrabold text-[#0B2341] truncate" title={item.nameAr}>
                  {item.nameAr}
                </p>
                <p className="text-lg font-extrabold text-[#1769AA] tabular-nums" dir="ltr">
                  {formatNumber(item.received)}
                </p>
                <p className="text-[11px] font-semibold text-[#069B74] tabular-nums">
                  منفذة: <span dir="ltr">{formatNumber(item.executed)}</span>
                </p>
                <p className="text-[10px] font-bold text-slate-500 tabular-nums" dir="ltr">
                  {formatPct(item.pct, '—')}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-400 text-center py-6">لا توجد أعمدة بيان مسجلة في التقارير المصفاة</p>
        )}
      </section>

      {/* 10. General Executive Summary derived strictly from actual DB data */}
      <section className="bg-[#0B2341] text-white rounded-2xl p-6 border-t-4 border-[#C8A85D] shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <ShieldAlert className="w-5 h-5 text-[#C8A85D]" />
          <h3 className="text-base font-extrabold">10. الملخص التحليلي التنفيذي المستمد من البيانات الفعلية</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs leading-relaxed">
          <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-1.5">
            <p className="font-bold text-[#C8A85D]">أبرز النتائج ومؤشر الطلبات</p>
            <p className="text-slate-200">
              {aggregated.totalReceived > 0
                ? `سجلت التقارير المشمولة ${formatNumber(aggregated.totalReceived)} طلباً، نُفذ منها ${formatNumber(aggregated.totalExecuted)} بنسبة إنجاز كلية ${formatPct(aggregated.overallPct)}.`
                : 'لا توجد طلبات خدمات مسجلة ضمن نطاق التصفية الحالي بعد.'}
            </p>
            {aggregated.topService && (
              <p className="text-slate-300">
                الخدمة الأكثر نشاطاً: <strong>{aggregated.topService.nameAr}</strong> ({formatNumber(aggregated.topService.received)} طلب).
              </p>
            )}
          </div>

          <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-1.5">
            <p className="font-bold text-[#C8A85D]">تركز أعطال الصيانة والمصروفات</p>
            <p className="text-slate-200">
              {aggregated.totalFaults > 0
                ? `بلغ إجمالي الأعطال المسجلة ${formatNumber(aggregated.totalFaults)} عطلاً، ويتركز أعلى عدد في ${aggregated.topFaultSite?.nameAr ?? '—'} (${formatNumber(aggregated.topFaultSite?.count ?? 0)})، خاصة ضمن فئة ${aggregated.topFaultCat?.nameAr ?? '—'}.`
                : 'لم تُسجل أعطال صيانة في الفترة المحددة.'}
            </p>
            <p className="text-slate-300">
              إجمالي التكلفة المالية المسجلة:{' '}
              <strong className="tabular-nums" dir="ltr">{formatAed(aggregated.totalCostAed)}</strong>.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-1.5">
            <p className="font-bold text-[#C8A85D]">المخاطر والأولويات التشغيلية</p>
            <p className="text-slate-200">
              {aggregated.openHazards > 0 || aggregated.inactiveExt > 0 || aggregated.tasksDelayed > 0
                ? `تظهر البيانات وجود ${formatNumber(aggregated.openHazards)} ملاحظة مخاطر غير مغلقة، و${formatNumber(aggregated.inactiveExt)} طفاية غير فعّالة، و${formatNumber(aggregated.tasksDelayed)} مهمة متأخرة تستوجب المتابعة.`
                : 'لا تظهر البيانات الحالية مخاطر غير مغلقة أو طفايات غير فعّالة أو مهام متأخرة.'}
            </p>
            <p className="text-slate-400 text-[11px]">
              * جميع المخرجات أعلاه مستنتجة آلياً من السجلات الفعلية المحفوظة في قاعدة البيانات فقط.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};
