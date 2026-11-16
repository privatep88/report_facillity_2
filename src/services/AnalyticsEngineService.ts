import type {
  MaintenanceCategory,
  MaintenanceSite,
  MonthlyReportFull,
  PerformanceThresholds,
  ReportStatus,
} from '../types/report.ts';
import {
  DEFAULT_THRESHOLDS,
  REPORT_STATUSES,
  STATUS_LABELS_AR,
  TASK_STATUSES,
  TASK_STATUS_LABELS_AR,
} from '../types/report.ts';
import {
  computeReportMetrics,
  evaluatePerformanceLevel,
  formatAed,
  formatNumber,
  formatPct,
  getMonthNameAr,
  getMonthNameEn,
  isLinkedReceptionActivity,
  safePercentage,
  type PerformanceLevelResult,
} from '../utils/calculations.ts';

export type AnalyticsStatusScope = 'approved_only' | 'all' | 'draft_only';
export type AnalyticsPeriodRange = 'all' | 'q1' | 'q2' | 'q3' | 'q4' | 'h1' | 'h2';

export interface AnalyticsFilters {
  statusScope: AnalyticsStatusScope;
  year: string;
  month: string;
  periodRange: AnalyticsPeriodRange;
  serviceId: string;
  siteId: string;
  preparer: string;
  approver: string;
}

export const DEFAULT_ANALYTICS_FILTERS: AnalyticsFilters = {
  statusScope: 'approved_only',
  year: 'all',
  month: 'all',
  periodRange: 'all',
  serviceId: 'all',
  siteId: 'all',
  preparer: 'all',
  approver: 'all',
};

export interface DeltaMetric {
  current: number | null;
  previous: number | null;
  absoluteDelta: number | null;
  pctDelta: number | null;
}

export interface ServiceAnalyticsRow {
  serviceId: string;
  sortOrder: number;
  summaryOrder: number;
  nameAr: string;
  nameEn: string;
  receivedCount: number;
  executedCount: number;
  remainingGap: number;
  carriedOverSurplus: number;
  shareOfTotalPct: number | null;
  completionPct: number | null;
  level: PerformanceLevelResult;
  momCompletionDeltaPct: number | null;
  momReceivedDeltaPct: number | null;
  demandRank: number;
}

export interface FaultParetoRow {
  categoryId: string;
  nameAr: string;
  nameEn: string;
  faultCount: number;
  sharePct: number | null;
  cumulativePct: number;
  pettyCashAed: number;
  purchaseOrderAed: number;
  totalCostAed: number;
  costPerFaultAed: number | null;
}

export interface SitePerformanceRow {
  siteId: string;
  nameAr: string;
  nameEn: string;
  faultCount: number;
  sharePct: number | null;
  topCategoryAr: string | null;
  topCategoryCount: number;
  momFaultDelta: number | null;
  momFaultPct: number | null;
  categoryBreakdown: Record<string, number>;
}

export interface PeriodTimelineRow {
  periodKey: number;
  year: number;
  month: number;
  labelAr: string;
  shortLabelAr: string;
  reportId: string;
  reportNumber: string;
  status: ReportStatus;
  statusLabelAr: string;
  isApproved: boolean;
  received: number;
  executed: number;
  completionPct: number | null;
  faults: number;
  costAed: number;
  pettyCashAed: number;
  purchaseOrderAed: number;
  inactiveExtinguishers: number;
  openHazards: number;
  inactiveContracts: number;
  tasksCompleted: number;
  tasksTotal: number;
  serviceMap: Record<string, { received: number; executed: number; completionPct: number | null }>;
  siteMap: Record<string, number>;
}

export interface EarlyWarningItem {
  id: string;
  severity: 'critical' | 'warning' | 'attention';
  title: string;
  metricDisplay: string;
  comparisonText: string;
  targetSectionId: string;
  targetSectionLabel: string;
}

export interface ExecutiveRecommendationItem {
  id: string;
  priority: 'urgent' | 'medium' | 'improvement';
  priorityLabelAr: string;
  title: string;
  evidenceText: string;
  actionText: string;
  owner: string;
  suggestedKpi: string;
  targetSectionId: string;
}

export interface ConditionalForecastResult {
  available: boolean;
  periodsCount: number;
  minRequiredPeriods: number;
  reasonAr: string;
  methodologyAr: string;
  nextPeriodLabelAr: string | null;
  requestsForecast: ForecastSeriesResult | null;
  faultsForecast: ForecastSeriesResult | null;
  costForecast: ForecastSeriesResult | null;
}

export interface ForecastSeriesResult {
  predicted: number;
  lowerBound: number;
  upperBound: number;
  slopePerMonth: number;
  rSquared: number | null;
  unit: string;
}

export interface AnalyticsEngineOutput {
  filters: AnalyticsFilters;
  meta: {
    totalReportsInDb: number;
    approvedReportsInDb: number;
    draftReportsInDb: number;
    deduplicatedCount: number;
    duplicatePeriodsCollapsed: number;
    filteredReportsCount: number;
    approvedInScopeCount: number;
    draftInScopeCount: number;
    availableYears: number[];
    availableMonths: number[];
    availablePreparers: string[];
    availableApprovers: string[];
    scopeLabelAr: string;
    periodLabelAr: string;
    hasData: boolean;
  };
  snapshot: {
    totalReceived: number;
    totalExecuted: number;
    overallCompletionPct: number | null;
    overallCompletionLevel: PerformanceLevelResult;
    totalRemainingGap: number;
    carriedOverSurplus: number;
    totalFaults: number;
    totalCostAed: number;
    pettyCashTotalAed: number;
    purchaseOrderTotalAed: number;
    contractsActive: number;
    contractsInactive: number;
    contractsTotal: number;
    contractsCompliancePct: number | null;
    extinguishersActive: number;
    extinguishersInactive: number;
    extinguishersReadinessPct: number | null;
    hazardsClosed: number;
    hazardsOpen: number;
    hazardsClosurePct: number | null;
    tasksTotal: number;
    tasksCompleted: number;
    tasksDelayed: number;
    tasksAvgCompletionPct: number | null;
    topService: { serviceId: string; nameAr: string; receivedCount: number } | null;
    highestFaultSite: { siteId: string; nameAr: string; faultCount: number } | null;
  };
  overallPerformance: {
    thresholds: PerformanceThresholds;
    hasCompositeWeightsConfigured: boolean;
    methodologyNoteAr: string;
    pillars: Array<{
      key: string;
      labelAr: string;
      labelEn: string;
      valuePct: number | null;
      level: PerformanceLevelResult;
      numerator: number;
      denominator: number;
      unitLabel: string;
    }>;
  };
  servicesAnalysis: {
    rows: ServiceAnalyticsRow[];
    topDemand: ServiceAnalyticsRow[];
    lowDemand: ServiceAnalyticsRow[];
    lowDemandNoteAr: string;
    backlogNoteAr: string;
    monthlySeriesKeys: Array<{ serviceId: string; nameAr: string }>;
    monthlySeries: Array<Record<string, number | string>>;
  };
  maintenanceAnalysis: {
    totalFaults: number;
    fromFacilitiesDept: number;
    fromOtherDepts: number;
    sourcesTotal: number;
    paretoRows: FaultParetoRow[];
    byMonthSeries: Array<{
      labelAr: string;
      faults: number;
      facilitiesDept: number;
      otherDepts: number;
    }>;
    heatmapSites: SitePerformanceRow[];
    activeCategories: MaintenanceCategory[];
    avgFaultsPerReport: number | null;
  };
  sitesAnalysis: {
    rows: SitePerformanceRow[];
    methodologyNoteAr: string;
  };
  financialAnalysis: {
    currency: 'AED';
    pettyCashTotalAed: number;
    purchaseOrderTotalAed: number;
    grandTotalCostAed: number;
    pettyCashSharePct: number | null;
    purchaseOrderSharePct: number | null;
    avgCostPerFaultAed: number | null;
    avgCostPerReportAed: number | null;
    byCategory: FaultParetoRow[];
    byMonthSeries: Array<{
      labelAr: string;
      pettyCashAed: number;
      purchaseOrderAed: number;
      totalCostAed: number;
    }>;
    relatedRequestCounts: {
      pettyCashRequests: number;
      disbursementRequests: number;
      noteAr: string;
    };
    budgetNoteAr: string;
  };
  contractsAnalysis: {
    groups: Array<{
      groupKey: string;
      nameAr: string;
      nameEn: string;
      activeCount: number;
      inactiveCount: number;
      totalCount: number;
      activePct: number | null;
      notes: string[];
    }>;
    totalActive: number;
    totalInactive: number;
    totalAll: number;
    overallActivePct: number | null;
    expiryLimitationNoteAr: string;
  };
  supportServicesAnalysis: {
    securityRows: Array<{
      activityKey: string;
      nameAr: string;
      nameEn: string;
      receivedCount: number;
      executedCount: number;
      completionPct: number | null;
      isVisitorLinked: boolean;
    }>;
    securityTotalReceived: number;
    securityTotalExecuted: number;
    securityCompletionPct: number | null;
    logisticsChannels: Array<{
      channelKey: string;
      nameAr: string;
      nameEn: string;
      requestCount: number;
      sharePct: number | null;
    }>;
    logisticsTotal: number;
    cleaningRequests: number;
    cleaningExecuted: number;
    wasteRequests: number;
    wasteExecuted: number;
    hospitalityRequests: number;
    hospitalityExecuted: number;
    governmentRequests: number;
    governmentExecuted: number;
    heterogeneousUnitsNoteAr: string;
  };
  tasksAndChallenges: {
    totalMeaningfulTasks: number;
    avgCompletionPct: number | null;
    statusDistribution: Array<{
      status: string;
      labelAr: string;
      count: number;
      sharePct: number | null;
    }>;
    tasksList: Array<{
      id: string;
      reportNumber: string;
      periodLabelAr: string;
      topic: string;
      taskName: string;
      status: string;
      statusLabelAr: string;
      completionPct: number;
    }>;
    challengesList: Array<{
      id: string;
      reportNumber: string;
      periodLabelAr: string;
      challengeText: string;
      updateText: string;
      recommendationText: string;
    }>;
  };
  riskComplianceAnalysis: {
    extinguishersActive: number;
    extinguishersInactive: number;
    extinguishersTotal: number;
    extinguishersReadinessPct: number | null;
    extinguisherNotes: string[];
    hazardsClosed: number;
    hazardsOpen: number;
    hazardsTotal: number;
    hazardsClosurePct: number | null;
    hazardNotes: string[];
    matrixLimitationNoteAr: string;
  };
  comparisons: {
    timeline: PeriodTimelineRow[];
    latestPeriod: PeriodTimelineRow | null;
    previousPeriod: PeriodTimelineRow | null;
    mom: {
      available: boolean;
      received: DeltaMetric;
      executed: DeltaMetric;
      completionPctDelta: number | null;
      faults: DeltaMetric;
      costAed: DeltaMetric;
    };
    yoy: {
      available: boolean;
      currentLabelAr: string | null;
      previousYearLabelAr: string | null;
      received: DeltaMetric;
      faults: DeltaMetric;
      costAed: DeltaMetric;
    };
    yearlyTotals: Array<{
      year: number;
      reportCount: number;
      approvedCount: number;
      received: number;
      executed: number;
      completionPct: number | null;
      faults: number;
      costAed: number;
    }>;
  };
  forecast: ConditionalForecastResult;
  earlyWarnings: EarlyWarningItem[];
  recommendations: ExecutiveRecommendationItem[];
}

function isApprovedReportStatus(status: ReportStatus): boolean {
  return status === REPORT_STATUSES.APPROVED || status === REPORT_STATUSES.ARCHIVED;
}

function matchesPeriodRange(month: number, range: AnalyticsPeriodRange): boolean {
  if (range === 'all') return true;
  if (range === 'q1') return month >= 1 && month <= 3;
  if (range === 'q2') return month >= 4 && month <= 6;
  if (range === 'q3') return month >= 7 && month <= 9;
  if (range === 'q4') return month >= 10 && month <= 12;
  if (range === 'h1') return month >= 1 && month <= 6;
  return month >= 7 && month <= 12;
}

function computeDelta(current: number | null, previous: number | null): DeltaMetric {
  if (current === null || previous === null) {
    return { current, previous, absoluteDelta: null, pctDelta: null };
  }
  const absoluteDelta = Math.round((current - previous) * 100) / 100;
  const pctDelta =
    previous > 0 ? Math.round(((current - previous) / previous) * 1000) / 10 : null;
  return { current, previous, absoluteDelta, pctDelta };
}

function computeLinearForecast(values: number[], unit: string): ForecastSeriesResult | null {
  const n = values.length;
  if (n < 3) return null;

  let sumX = 0;
  let sumY = 0;
  let sumXX = 0;
  let sumXY = 0;
  for (let i = 0; i < n; i++) {
    const x = i + 1;
    const y = values[i];
    sumX += x;
    sumY += y;
    sumXX += x * x;
    sumXY += x * y;
  }

  const denom = n * sumXX - sumX * sumX;
  const slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
  const intercept = (sumY - slope * sumX) / n;
  const nextX = n + 1;
  const rawPred = intercept + slope * nextX;
  const predicted = Math.max(0, Math.round(rawPred * 100) / 100);

  // Residuals & Standard Error
  let sse = 0;
  let sst = 0;
  const meanY = sumY / n;
  for (let i = 0; i < n; i++) {
    const x = i + 1;
    const fitted = intercept + slope * x;
    sse += (values[i] - fitted) ** 2;
    sst += (values[i] - meanY) ** 2;
  }
  const se = n > 2 ? Math.sqrt(sse / (n - 2)) : 0;
  const rSquared = sst > 0 ? Math.max(0, Math.min(1, Math.round((1 - sse / sst) * 1000) / 1000)) : null;

  return {
    predicted,
    lowerBound: Math.max(0, Math.round((predicted - se) * 100) / 100),
    upperBound: Math.max(0, Math.round((predicted + se) * 100) / 100),
    slopePerMonth: Math.round(slope * 100) / 100,
    rSquared,
    unit,
  };
}

function describePeriodRangeAr(range: AnalyticsPeriodRange): string {
  switch (range) {
    case 'q1':
      return 'الربع الأول (Q1)';
    case 'q2':
      return 'الربع الثاني (Q2)';
    case 'q3':
      return 'الربع الثالث (Q3)';
    case 'q4':
      return 'الربع الرابع (Q4)';
    case 'h1':
      return 'النصف الأول (H1)';
    case 'h2':
      return 'النصف الثاني (H2)';
    default:
      return 'كامل الفترات';
  }
}

function describeScopeAr(scope: AnalyticsStatusScope): string {
  if (scope === 'approved_only') return 'التقارير المعتمدة فقط';
  if (scope === 'draft_only') return 'المسودات وقيد المراجعة فقط';
  return 'جميع التقارير (معتمدة + مسودات)';
}

/**
 * Deduplicates reports by ID and collapses duplicate period+department records
 * keeping approved/archived over drafts and highest version / most recently updated.
 */
export function deduplicateReports(reports: MonthlyReportFull[]): {
  deduplicated: MonthlyReportFull[];
  collapsedCount: number;
} {
  const byId = new Map<string, MonthlyReportFull>();
  for (const r of reports) {
    if (!r || !r.id) continue;
    const existing = byId.get(r.id);
    if (!existing || r.currentVersion > existing.currentVersion) {
      byId.set(r.id, r);
    }
  }

  const byPeriodDept = new Map<string, MonthlyReportFull>();
  let collapsedCount = 0;

  for (const r of byId.values()) {
    const key = `${r.year}|${r.month}|${(r.department || '').trim()}`;
    const existing = byPeriodDept.get(key);
    if (!existing) {
      byPeriodDept.set(key, r);
      continue;
    }
    collapsedCount++;
    const rApp = isApprovedReportStatus(r.status) ? 1 : 0;
    const eApp = isApprovedReportStatus(existing.status) ? 1 : 0;
    if (
      rApp > eApp ||
      (rApp === eApp && r.currentVersion > existing.currentVersion) ||
      (rApp === eApp && r.currentVersion === existing.currentVersion && r.updatedAt > existing.updatedAt)
    ) {
      byPeriodDept.set(key, r);
    }
  }

  const deduplicated = Array.from(byPeriodDept.values()).sort(
    (a, b) => a.year * 100 + a.month - (b.year * 100 + b.month)
  );
  return { deduplicated, collapsedCount };
}

export function computeAnalyticsEngine(params: {
  reports: MonthlyReportFull[];
  sites: MaintenanceSite[];
  categories: MaintenanceCategory[];
  thresholds?: PerformanceThresholds;
  filters: AnalyticsFilters;
}): AnalyticsEngineOutput {
  const {
    reports,
    sites,
    categories,
    thresholds = DEFAULT_THRESHOLDS,
    filters,
  } = params;

  const { deduplicated, collapsedCount } = deduplicateReports(reports);

  const approvedReportsInDb = deduplicated.filter((r) => isApprovedReportStatus(r.status)).length;
  const draftReportsInDb = deduplicated.length - approvedReportsInDb;

  const availableYears = Array.from(new Set(deduplicated.map((r) => r.year))).sort((a, b) => b - a);
  const availableMonths = Array.from(new Set(deduplicated.map((r) => r.month))).sort((a, b) => a - b);
  const availablePreparers = Array.from(
    new Set(deduplicated.map((r) => (r.preparerName || '').trim()).filter(Boolean))
  );
  const availableApprovers = Array.from(
    new Set(deduplicated.map((r) => (r.approverName || '').trim()).filter(Boolean))
  );

  // Filter reports by interactive BI criteria
  const filteredReports = deduplicated.filter((r) => {
    const approved = isApprovedReportStatus(r.status);
    if (filters.statusScope === 'approved_only' && !approved) return false;
    if (filters.statusScope === 'draft_only' && approved) return false;
    if (filters.year !== 'all' && String(r.year) !== filters.year) return false;
    if (filters.month !== 'all' && String(r.month) !== filters.month) return false;
    if (!matchesPeriodRange(r.month, filters.periodRange)) return false;
    if (filters.preparer !== 'all' && (r.preparerName || '').trim() !== filters.preparer) return false;
    if (filters.approver !== 'all' && (r.approverName || '').trim() !== filters.approver) return false;
    return true;
  });

  const approvedInScopeCount = filteredReports.filter((r) => isApprovedReportStatus(r.status)).length;
  const draftInScopeCount = filteredReports.length - approvedInScopeCount;

  const activeSites = sites.filter((s) => s.isActive !== false);
  const scopedSites =
    filters.siteId !== 'all' ? sites.filter((s) => s.id === filters.siteId) : activeSites.length > 0 ? activeSites : sites;
  const activeCategories = categories.filter((c) => c.isActive !== false);
  const scopedCategories = activeCategories.length > 0 ? activeCategories : categories;

  // Compute period timeline and accumulate domain aggregations
  const timeline: PeriodTimelineRow[] = [];

  const serviceAgg = new Map<
    string,
    {
      serviceId: string;
      sortOrder: number;
      summaryOrder: number;
      nameAr: string;
      nameEn: string;
      receivedCount: number;
      executedCount: number;
    }
  >();

  const siteAgg = new Map<
    string,
    {
      siteId: string;
      nameAr: string;
      nameEn: string;
      faultCount: number;
      categoryBreakdown: Record<string, number>;
    }
  >();
  for (const s of scopedSites) {
    siteAgg.set(s.id, {
      siteId: s.id,
      nameAr: s.nameAr,
      nameEn: s.nameEn,
      faultCount: 0,
      categoryBreakdown: {},
    });
  }

  const categoryAgg = new Map<
    string,
    {
      categoryId: string;
      nameAr: string;
      nameEn: string;
      faultCount: number;
      pettyCashAed: number;
      purchaseOrderAed: number;
    }
  >();
  for (const c of scopedCategories) {
    categoryAgg.set(c.id, {
      categoryId: c.id,
      nameAr: c.nameAr,
      nameEn: c.nameEn,
      faultCount: 0,
      pettyCashAed: 0,
      purchaseOrderAed: 0,
    });
  }

  const contractGroupAgg = new Map<
    string,
    {
      groupKey: string;
      nameAr: string;
      nameEn: string;
      activeCount: number;
      inactiveCount: number;
      notes: string[];
    }
  >();

  const logisticsAgg = new Map<
    string,
    { channelKey: string; nameAr: string; nameEn: string; sortOrder: number; requestCount: number }
  >();

  const securityAgg = new Map<
    string,
    {
      activityKey: string;
      nameAr: string;
      nameEn: string;
      sortOrder: number;
      receivedCount: number;
      executedCount: number;
    }
  >();

  let fromFacilitiesDept = 0;
  let fromOtherDepts = 0;
  let extinguishersActive = 0;
  let extinguishersInactive = 0;
  const extinguisherNotes: string[] = [];
  let hazardsClosed = 0;
  let hazardsOpen = 0;
  const hazardNotes: string[] = [];

  const taskStatusCounts: Record<string, number> = {
    completed: 0,
    in_progress: 0,
    not_started: 0,
    delayed: 0,
    paused: 0,
  };
  let meaningfulTasksCount = 0;
  let meaningfulTasksPctSum = 0;
  const tasksList: AnalyticsEngineOutput['tasksAndChallenges']['tasksList'] = [];
  const challengesList: AnalyticsEngineOutput['tasksAndChallenges']['challengesList'] = [];

  const yearlyMap = new Map<
    number,
    {
      year: number;
      reportCount: number;
      approvedCount: number;
      received: number;
      executed: number;
      faults: number;
      costAed: number;
    }
  >();

  const byMonthMaintSeries: AnalyticsEngineOutput['maintenanceAnalysis']['byMonthSeries'] = [];
  const byMonthCostSeries: AnalyticsEngineOutput['financialAnalysis']['byMonthSeries'] = [];

  for (const rep of filteredReports) {
    const baseMetrics = computeReportMetrics(rep, sites, categories, thresholds);
    const periodLabelAr = `${getMonthNameAr(rep.month)} ${rep.year}`;
    const shortLabelAr = `${getMonthNameAr(rep.month)} ${String(rep.year).slice(-2)}`;

    // Services filtered or full
    const scopedServices =
      filters.serviceId !== 'all'
        ? rep.services.filter((s) => s.serviceId === filters.serviceId)
        : rep.services;

    let repReceived = 0;
    let repExecuted = 0;
    const serviceMap: PeriodTimelineRow['serviceMap'] = {};

    for (const s of rep.services) {
      const rec = Math.max(0, Number(s.receivedCount) || 0);
      const exec = Math.max(0, Number(s.executedCount) || 0);
      serviceMap[s.serviceId] = {
        received: rec,
        executed: exec,
        completionPct: safePercentage(exec, rec),
      };
    }

    for (const s of scopedServices) {
      const rec = Math.max(0, Number(s.receivedCount) || 0);
      const exec = Math.max(0, Number(s.executedCount) || 0);
      repReceived += rec;
      repExecuted += exec;

      const cur = serviceAgg.get(s.serviceId) || {
        serviceId: s.serviceId,
        sortOrder: s.sortOrder,
        summaryOrder: s.summaryOrder,
        nameAr: s.nameAr,
        nameEn: s.nameEn,
        receivedCount: 0,
        executedCount: 0,
      };
      cur.receivedCount += rec;
      cur.executedCount += exec;
      serviceAgg.set(s.serviceId, cur);
    }

    // Maintenance matrix (honoring siteFilter)
    let repFaults = 0;
    const siteMap: Record<string, number> = {};
    for (const site of scopedSites) {
      const row = rep.maintenanceMatrix[site.id] || {};
      let siteSum = 0;
      const sEntry = siteAgg.get(site.id)!;
      for (const cat of scopedCategories) {
        const v = Math.max(0, Number(row[cat.id]) || 0);
        siteSum += v;
        repFaults += v;
        sEntry.categoryBreakdown[cat.id] = (sEntry.categoryBreakdown[cat.id] || 0) + v;

        const cEntry = categoryAgg.get(cat.id);
        if (cEntry) {
          cEntry.faultCount += v;
        }
      }
      sEntry.faultCount += siteSum;
      siteMap[site.id] = siteSum;
    }

    // Costs from maintenanceCosts (strictly category-level AED; if siteFilter != 'all' costs aren't broken down per site in DB, so keep report category costs cleanly documented)
    let repPettyCash = 0;
    let repPo = 0;
    for (const cat of scopedCategories) {
      const cost = rep.maintenanceCosts[cat.id];
      const pc = Math.max(0, Number(cost?.pettyCashAed) || 0);
      const po = Math.max(0, Number(cost?.purchaseOrderAed) || 0);
      repPettyCash += pc;
      repPo += po;
      const cEntry = categoryAgg.get(cat.id);
      if (cEntry) {
        cEntry.pettyCashAed += pc;
        cEntry.purchaseOrderAed += po;
      }
    }
    repPettyCash = Math.round(repPettyCash * 100) / 100;
    repPo = Math.round(repPo * 100) / 100;
    const repCost = Math.round((repPettyCash + repPo) * 100) / 100;

    // Maintenance request sources
    const msFac = Math.max(0, Number(rep.maintenanceServices?.fromFacilitiesDept) || 0);
    const msOther = Math.max(0, Number(rep.maintenanceServices?.fromOtherDepts) || 0);
    fromFacilitiesDept += msFac;
    fromOtherDepts += msOther;
    byMonthMaintSeries.push({
      labelAr: periodLabelAr,
      faults: repFaults,
      facilitiesDept: msFac,
      otherDepts: msOther,
    });
    byMonthCostSeries.push({
      labelAr: periodLabelAr,
      pettyCashAed: repPettyCash,
      purchaseOrderAed: repPo,
      totalCostAed: repCost,
    });

    // Contracts
    for (const con of rep.contracts || []) {
      const cur = contractGroupAgg.get(con.groupKey) || {
        groupKey: con.groupKey,
        nameAr: con.nameAr,
        nameEn: con.nameEn,
        activeCount: 0,
        inactiveCount: 0,
        notes: [],
      };
      cur.activeCount += Math.max(0, Number(con.activeCount) || 0);
      cur.inactiveCount += Math.max(0, Number(con.inactiveCount) || 0);
      if (con.notes && con.notes.trim()) {
        cur.notes.push(`${periodLabelAr}: ${con.notes.trim()}`);
      }
      contractGroupAgg.set(con.groupKey, cur);
    }

    // Safety
    const fireExt = rep.safety?.find((g) => g.groupKey === 'fire_extinguishers');
    const riskObs = rep.safety?.find((g) => g.groupKey === 'risk_observations');
    const fireAct = Math.max(0, Number(fireExt?.primaryCount) || 0);
    const fireInact = Math.max(0, Number(fireExt?.secondaryCount) || 0);
    extinguishersActive += fireAct;
    extinguishersInactive += fireInact;
    if (fireExt?.notes && fireExt.notes.trim()) {
      extinguisherNotes.push(`${periodLabelAr}: ${fireExt.notes.trim()}`);
    }

    const hazClosed = Math.max(0, Number(riskObs?.primaryCount) || 0);
    const hazOpen = Math.max(0, Number(riskObs?.secondaryCount) || 0);
    hazardsClosed += hazClosed;
    hazardsOpen += hazOpen;
    if (riskObs?.notes && riskObs.notes.trim()) {
      hazardNotes.push(`${periodLabelAr}: ${riskObs.notes.trim()}`);
    }

    // Logistics
    for (const logItem of rep.logistics || []) {
      const cur = logisticsAgg.get(logItem.channelKey) || {
        channelKey: logItem.channelKey,
        nameAr: logItem.nameAr,
        nameEn: logItem.nameEn,
        sortOrder: logItem.sortOrder,
        requestCount: 0,
      };
      cur.requestCount += Math.max(0, Number(logItem.requestCount) || 0);
      logisticsAgg.set(logItem.channelKey, cur);
    }

    // Security & Reception
    for (const secItem of rep.securityReception || []) {
      const cur = securityAgg.get(secItem.activityKey) || {
        activityKey: secItem.activityKey,
        nameAr: secItem.nameAr,
        nameEn: secItem.nameEn,
        sortOrder: secItem.sortOrder,
        receivedCount: 0,
        executedCount: 0,
      };
      cur.receivedCount += Math.max(0, Number(secItem.receivedCount) || 0);
      cur.executedCount += Math.max(0, Number(secItem.executedCount) || 0);
      securityAgg.set(secItem.activityKey, cur);
    }

    // Meaningful Tasks
    for (const t of rep.tasks || []) {
      const hasTopic = t.topic && t.topic.trim() !== '' && t.topic.trim() !== '—';
      const hasName = t.taskName && t.taskName.trim() !== '' && t.taskName.trim() !== '—';
      if (!hasTopic && !hasName) continue;
      meaningfulTasksCount++;
      const pct = Math.max(0, Math.min(100, Number(t.completionPct) || 0));
      meaningfulTasksPctSum += pct;
      taskStatusCounts[t.status] = (taskStatusCounts[t.status] || 0) + 1;
      tasksList.push({
        id: `${rep.id}_${t.id}`,
        reportNumber: rep.reportNumber,
        periodLabelAr,
        topic: t.topic || '—',
        taskName: t.taskName || '—',
        status: t.status,
        statusLabelAr: TASK_STATUS_LABELS_AR[t.status] || t.status,
        completionPct: pct,
      });
    }

    // Meaningful Challenges
    for (const ch of rep.challenges || []) {
      const hasText =
        (ch.challengeText && ch.challengeText.trim() !== '' && ch.challengeText.trim() !== '—') ||
        (ch.updateText && ch.updateText.trim() !== '' && ch.updateText.trim() !== '—') ||
        (ch.recommendationText && ch.recommendationText.trim() !== '' && ch.recommendationText.trim() !== '—');
      if (!hasText) continue;
      challengesList.push({
        id: `${rep.id}_${ch.id}`,
        reportNumber: rep.reportNumber,
        periodLabelAr,
        challengeText: ch.challengeText || '—',
        updateText: ch.updateText || '—',
        recommendationText: ch.recommendationText || '—',
      });
    }

    // Timeline row
    const repApproved = isApprovedReportStatus(rep.status);
    timeline.push({
      periodKey: rep.year * 100 + rep.month,
      year: rep.year,
      month: rep.month,
      labelAr: periodLabelAr,
      shortLabelAr,
      reportId: rep.id,
      reportNumber: rep.reportNumber,
      status: rep.status,
      statusLabelAr: STATUS_LABELS_AR[rep.status],
      isApproved: repApproved,
      received: repReceived,
      executed: repExecuted,
      completionPct: safePercentage(repExecuted, repReceived),
      faults: repFaults,
      costAed: repCost,
      pettyCashAed: repPettyCash,
      purchaseOrderAed: repPo,
      inactiveExtinguishers: fireInact,
      openHazards: hazOpen,
      inactiveContracts: baseMetrics.contractsTotals.totalInactive,
      tasksCompleted: baseMetrics.tasksSummary.completed,
      tasksTotal: baseMetrics.tasksSummary.totalMeaningful,
      serviceMap,
      siteMap,
    });

    // Yearly rollup
    const yr = yearlyMap.get(rep.year) || {
      year: rep.year,
      reportCount: 0,
      approvedCount: 0,
      received: 0,
      executed: 0,
      faults: 0,
      costAed: 0,
    };
    yr.reportCount += 1;
    if (repApproved) yr.approvedCount += 1;
    yr.received += repReceived;
    yr.executed += repExecuted;
    yr.faults += repFaults;
    yr.costAed = Math.round((yr.costAed + repCost) * 100) / 100;
    yearlyMap.set(rep.year, yr);
  }

  timeline.sort((a, b) => a.periodKey - b.periodKey);

  // Totals for snapshot
  const totalReceived = timeline.reduce((s, r) => s + r.received, 0);
  const totalExecuted = timeline.reduce((s, r) => s + r.executed, 0);
  const overallCompletionPct = safePercentage(totalExecuted, totalReceived);
  const overallCompletionLevel = evaluatePerformanceLevel(overallCompletionPct, thresholds);

  const servicesListRaw = Array.from(serviceAgg.values());
  const totalRemainingGap = servicesListRaw.reduce(
    (s, r) => s + Math.max(0, r.receivedCount - r.executedCount),
    0
  );
  const carriedOverSurplus = servicesListRaw.reduce(
    (s, r) => s + Math.max(0, r.executedCount - r.receivedCount),
    0
  );

  // Latest vs previous period for MoM
  const latestPeriod = timeline.length >= 1 ? timeline[timeline.length - 1] : null;
  const previousPeriod = timeline.length >= 2 ? timeline[timeline.length - 2] : null;

  // Build sorted services rows with rank & MoM delta
  const byDemandDesc = [...servicesListRaw].sort((a, b) => b.receivedCount - a.receivedCount);
  const rankMap = new Map<string, number>();
  byDemandDesc.forEach((s, idx) => rankMap.set(s.serviceId, idx + 1));

  const servicesRows: ServiceAnalyticsRow[] = servicesListRaw
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((s) => {
      const completionPct = safePercentage(s.executedCount, s.receivedCount);
      let momCompletionDeltaPct: number | null = null;
      let momReceivedDeltaPct: number | null = null;
      if (latestPeriod && previousPeriod) {
        const curSvc = latestPeriod.serviceMap[s.serviceId];
        const prevSvc = previousPeriod.serviceMap[s.serviceId];
        if (curSvc && prevSvc) {
          if (curSvc.completionPct !== null && prevSvc.completionPct !== null) {
            momCompletionDeltaPct =
              Math.round((curSvc.completionPct - prevSvc.completionPct) * 10) / 10;
          }
          if (prevSvc.received > 0) {
            momReceivedDeltaPct =
              Math.round(((curSvc.received - prevSvc.received) / prevSvc.received) * 1000) / 10;
          }
        }
      }
      return {
        serviceId: s.serviceId,
        sortOrder: s.sortOrder,
        summaryOrder: s.summaryOrder,
        nameAr: s.nameAr,
        nameEn: s.nameEn,
        receivedCount: s.receivedCount,
        executedCount: s.executedCount,
        remainingGap: Math.max(0, s.receivedCount - s.executedCount),
        carriedOverSurplus: Math.max(0, s.executedCount - s.receivedCount),
        shareOfTotalPct: safePercentage(s.receivedCount, totalReceived),
        completionPct,
        level: evaluatePerformanceLevel(completionPct, thresholds),
        momCompletionDeltaPct,
        momReceivedDeltaPct,
        demandRank: rankMap.get(s.serviceId) || 0,
      };
    });

  const topDemand = [...servicesRows]
    .filter((r) => r.receivedCount > 0)
    .sort((a, b) => b.receivedCount - a.receivedCount)
    .slice(0, 5);
  const lowDemand = [...servicesRows]
    .sort((a, b) => a.receivedCount - b.receivedCount)
    .slice(0, 5);

  const monthlySeriesKeys = servicesRows.slice(0, 6).map((s) => ({
    serviceId: s.serviceId,
    nameAr: s.nameAr,
  }));
  const monthlySeries = timeline.map((t) => {
    const point: Record<string, number | string> = { labelAr: t.labelAr };
    for (const key of monthlySeriesKeys) {
      point[key.serviceId] = t.serviceMap[key.serviceId]?.received ?? 0;
    }
    return point;
  });

  // Pareto for Fault Categories + Financials
  const totalFaults = Array.from(categoryAgg.values()).reduce((s, c) => s + c.faultCount, 0);
  const pettyCashTotalAed =
    Math.round(Array.from(categoryAgg.values()).reduce((s, c) => s + c.pettyCashAed, 0) * 100) / 100;
  const purchaseOrderTotalAed =
    Math.round(Array.from(categoryAgg.values()).reduce((s, c) => s + c.purchaseOrderAed, 0) * 100) / 100;
  const grandTotalCostAed = Math.round((pettyCashTotalAed + purchaseOrderTotalAed) * 100) / 100;

  let runningFaults = 0;
  const paretoRows: FaultParetoRow[] = Array.from(categoryAgg.values())
    .sort((a, b) => b.faultCount - a.faultCount)
    .map((c) => {
      runningFaults += c.faultCount;
      const cumulativePct =
        totalFaults > 0 ? Math.min(100, Math.round((runningFaults / totalFaults) * 1000) / 10) : 0;
      const totalCatCost = Math.round((c.pettyCashAed + c.purchaseOrderAed) * 100) / 100;
      const costPerFaultAed =
        c.faultCount > 0 ? Math.round((totalCatCost / c.faultCount) * 100) / 100 : null;
      return {
        categoryId: c.categoryId,
        nameAr: c.nameAr,
        nameEn: c.nameEn,
        faultCount: c.faultCount,
        sharePct: safePercentage(c.faultCount, totalFaults),
        cumulativePct,
        pettyCashAed: Math.round(c.pettyCashAed * 100) / 100,
        purchaseOrderAed: Math.round(c.purchaseOrderAed * 100) / 100,
        totalCostAed: totalCatCost,
        costPerFaultAed,
      };
    });

  // Sites analysis
  const sitesRows: SitePerformanceRow[] = Array.from(siteAgg.values())
    .map((s) => {
      let topCategoryAr: string | null = null;
      let topCategoryCount = 0;
      for (const cat of scopedCategories) {
        const cnt = s.categoryBreakdown[cat.id] || 0;
        if (cnt > topCategoryCount) {
          topCategoryCount = cnt;
          topCategoryAr = cat.nameAr;
        }
      }
      let momFaultDelta: number | null = null;
      let momFaultPct: number | null = null;
      if (latestPeriod && previousPeriod) {
        const curF = latestPeriod.siteMap[s.siteId] ?? 0;
        const prevF = previousPeriod.siteMap[s.siteId] ?? 0;
        momFaultDelta = curF - prevF;
        momFaultPct = prevF > 0 ? Math.round(((curF - prevF) / prevF) * 1000) / 10 : null;
      }
      return {
        siteId: s.siteId,
        nameAr: s.nameAr,
        nameEn: s.nameEn,
        faultCount: s.faultCount,
        sharePct: safePercentage(s.faultCount, totalFaults),
        topCategoryAr,
        topCategoryCount,
        momFaultDelta,
        momFaultPct,
        categoryBreakdown: s.categoryBreakdown,
      };
    })
    .sort((a, b) => b.faultCount - a.faultCount);

  const highestFaultSiteRow = sitesRows.find((s) => s.faultCount > 0) || null;

  // Contracts rollup
  const contractGroups = Array.from(contractGroupAgg.values()).map((c) => {
    const totalCount = c.activeCount + c.inactiveCount;
    return {
      ...c,
      totalCount,
      activePct: safePercentage(c.activeCount, totalCount),
    };
  });
  const contractsActive = contractGroups.reduce((s, c) => s + c.activeCount, 0);
  const contractsInactive = contractGroups.reduce((s, c) => s + c.inactiveCount, 0);
  const contractsTotal = contractsActive + contractsInactive;
  const contractsCompliancePct = safePercentage(contractsActive, contractsTotal);

  // Safety rollup
  const extinguishersTotal = extinguishersActive + extinguishersInactive;
  const extinguishersReadinessPct = safePercentage(extinguishersActive, extinguishersTotal);
  const hazardsTotal = hazardsClosed + hazardsOpen;
  const hazardsClosurePct = safePercentage(hazardsClosed, hazardsTotal);

  // Tasks rollup
  const tasksAvgCompletionPct =
    meaningfulTasksCount > 0
      ? Math.round((meaningfulTasksPctSum / meaningfulTasksCount) * 10) / 10
      : null;

  const taskStatusOrder = [
    TASK_STATUSES.COMPLETED,
    TASK_STATUSES.IN_PROGRESS,
    TASK_STATUSES.NOT_STARTED,
    TASK_STATUSES.DELAYED,
    TASK_STATUSES.PAUSED,
  ];
  const statusDistribution = taskStatusOrder.map((st) => ({
    status: st,
    labelAr: TASK_STATUS_LABELS_AR[st],
    count: taskStatusCounts[st] || 0,
    sharePct: safePercentage(taskStatusCounts[st] || 0, meaningfulTasksCount),
  }));

  // Support services rollup (Logistics & Security/Reception & Waste/Cleaning/Hospitality/Gov)
  const logisticsChannelsRaw = Array.from(logisticsAgg.values()).sort((a, b) => a.sortOrder - b.sortOrder);
  const logisticsTotal = logisticsChannelsRaw.reduce((s, l) => s + l.requestCount, 0);
  const logisticsChannels = logisticsChannelsRaw.map((l) => ({
    channelKey: l.channelKey,
    nameAr: l.nameAr,
    nameEn: l.nameEn,
    requestCount: l.requestCount,
    sharePct: safePercentage(l.requestCount, logisticsTotal),
  }));

  const securityRowsRaw = Array.from(securityAgg.values()).sort((a, b) => a.sortOrder - b.sortOrder);
  const securityRows = securityRowsRaw.map((sr) => ({
    activityKey: sr.activityKey,
    nameAr: sr.nameAr,
    nameEn: sr.nameEn,
    receivedCount: sr.receivedCount,
    executedCount: sr.executedCount,
    completionPct: safePercentage(sr.executedCount, sr.receivedCount),
    isVisitorLinked: isLinkedReceptionActivity(sr),
  }));
  const securityTotalReceived = securityRows.reduce((s, r) => s + r.receivedCount, 0);
  const securityTotalExecuted = securityRows.reduce((s, r) => s + r.executedCount, 0);
  const securityCompletionPct = safePercentage(securityTotalExecuted, securityTotalReceived);

  const findSvc = (id: string) => servicesRows.find((s) => s.serviceId === id);
  const svcCleaning = findSvc('svc_cleaning');
  const svcWaste = findSvc('svc_waste');
  const svcHospitality = findSvc('svc_hospitality');
  const svcGov = findSvc('svc_government');
  const svcPettyCash = findSvc('svc_petty_cash');
  const svcDisbursement = findSvc('svc_disbursement');

  // YoY comparison on latest period vs same month in year-1 if present
  let yoyAvailable = false;
  let yoyPrevRow: PeriodTimelineRow | null = null;
  if (latestPeriod) {
    yoyPrevRow =
      timeline.find((t) => t.year === latestPeriod.year - 1 && t.month === latestPeriod.month) || null;
    yoyAvailable = !!yoyPrevRow;
  }

  const yearlyTotals = Array.from(yearlyMap.values())
    .sort((a, b) => b.year - a.year)
    .map((y) => ({
      ...y,
      completionPct: safePercentage(y.executed, y.received),
    }));

  // Conditional Forecast (requires >= 3 chronological periods)
  const minRequiredPeriods = 3;
  let forecast: ConditionalForecastResult;
  if (timeline.length < minRequiredPeriods) {
    forecast = {
      available: false,
      periodsCount: timeline.length,
      minRequiredPeriods,
      reasonAr:
        timeline.length === 0
          ? 'لا توجد تقارير في النطاق الحالي لعرض التوقعات المستقبلية.'
          : `يتوفر حالياً (${formatNumber(timeline.length)}) فترة شهرية فقط ضمن النطاق المختار. يتطلب التنبؤ الإحصائي الموثوق توفر ${formatNumber(minRequiredPeriods)} أشهر زمنية متصلة على الأقل لتفادي تقديرات مضللة.`,
      methodologyAr: 'نموذج الانحدار الخطي المشروط مع نطاق عدم اليقين (±1 خطأ معياري) — معلق لحين استيفاء البيانات التاريخية.',
      nextPeriodLabelAr: null,
      requestsForecast: null,
      faultsForecast: null,
      costForecast: null,
    };
  } else {
    const last = timeline[timeline.length - 1];
    const nextMonth = last.month === 12 ? 1 : last.month + 1;
    const nextYear = last.month === 12 ? last.year + 1 : last.year;
    forecast = {
      available: true,
      periodsCount: timeline.length,
      minRequiredPeriods,
      reasonAr: `تم احتساب التوقع الاسترشادي بناءً على ${formatNumber(timeline.length)} فترة شهرية فعلية في النطاق المحدد.`,
      methodologyAr:
        'انحدار خطي بسيط (Ordinary Least Squares) على السلسلة الزمنية الشهرية الفعلية مع نطاق تباين (±1 خطأ معياري) دون افتراض عوامل خارجية.',
      nextPeriodLabelAr: `${getMonthNameAr(nextMonth)} ${nextYear} (${getMonthNameEn(nextMonth)} ${nextYear})`,
      requestsForecast: computeLinearForecast(
        timeline.map((t) => t.received),
        'طلب'
      ),
      faultsForecast: computeLinearForecast(
        timeline.map((t) => t.faults),
        'عطل'
      ),
      costForecast: computeLinearForecast(
        timeline.map((t) => t.costAed),
        'AED'
      ),
    };
  }

  // Overall Performance Pillars (strictly separated, no invented composite weights)
  const overallPillars: AnalyticsEngineOutput['overallPerformance']['pillars'] = [
    {
      key: 'services',
      labelAr: 'إنجاز طلبات الخدمات',
      labelEn: 'Service Request Completion',
      valuePct: overallCompletionPct,
      level: evaluatePerformanceLevel(overallCompletionPct, thresholds),
      numerator: totalExecuted,
      denominator: totalReceived,
      unitLabel: 'طلب منفذ / مستلم',
    },
    {
      key: 'contracts',
      labelAr: 'سريان العقود والتراخيص',
      labelEn: 'Active Contracts & Licenses Rate',
      valuePct: contractsCompliancePct,
      level: evaluatePerformanceLevel(contractsCompliancePct, thresholds),
      numerator: contractsActive,
      denominator: contractsTotal,
      unitLabel: 'فعال / إجمالي',
    },
    {
      key: 'extinguishers',
      labelAr: 'جاهزية طفايات الحريق',
      labelEn: 'Fire Extinguisher Readiness',
      valuePct: extinguishersReadinessPct,
      level: evaluatePerformanceLevel(extinguishersReadinessPct, thresholds),
      numerator: extinguishersActive,
      denominator: extinguishersTotal,
      unitLabel: 'فعالة / إجمالي',
    },
    {
      key: 'hazards',
      labelAr: 'إغلاق ملاحظات المخاطر',
      labelEn: 'Hazard Observation Closure',
      valuePct: hazardsClosurePct,
      level: evaluatePerformanceLevel(hazardsClosurePct, thresholds),
      numerator: hazardsClosed,
      denominator: hazardsTotal,
      unitLabel: 'مغلقة / إجمالي',
    },
    {
      key: 'tasks',
      labelAr: 'متوسط إنجاز المهام التشغيلية',
      labelEn: 'Operational Tasks Avg Completion',
      valuePct: tasksAvgCompletionPct,
      level: evaluatePerformanceLevel(tasksAvgCompletionPct, thresholds),
      numerator: meaningfulTasksCount > 0 ? Math.round(meaningfulTasksPctSum / meaningfulTasksCount) : 0,
      denominator: meaningfulTasksCount > 0 ? 100 : 0,
      unitLabel: `${formatNumber(meaningfulTasksCount)} مهمة مسجلة`,
    },
  ];

  // Early Warning System (strictly numeric, threshold/rule-driven)
  const earlyWarnings: EarlyWarningItem[] = [];

  if (extinguishersInactive > 0) {
    earlyWarnings.push({
      id: 'warn_extinguishers',
      severity: 'critical',
      title: 'طفايات حريق غير فعالة تتطلب معالجة فورية',
      metricDisplay: `${formatNumber(extinguishersInactive)} غير فعالة`,
      comparisonText: `من أصل ${formatNumber(extinguishersTotal)} طفاية (الجاهزية: ${formatPct(extinguishersReadinessPct)}) مقابل المعيار الآمن 100%`,
      targetSectionId: 'sec-11-risk',
      targetSectionLabel: 'تحليل المخاطر والسلامة',
    });
  }

  if (hazardsOpen > 0) {
    earlyWarnings.push({
      id: 'warn_hazards',
      severity: 'critical',
      title: 'ملاحظات مخاطر مفتوحة (غير مغلقة)',
      metricDisplay: `${formatNumber(hazardsOpen)} ملاحظة مفتوحة`,
      comparisonText: `نسبة الإغلاق الحالية ${formatPct(hazardsClosurePct)} (${formatNumber(hazardsClosed)} مغلقة من ${formatNumber(hazardsTotal)})`,
      targetSectionId: 'sec-11-risk',
      targetSectionLabel: 'تحليل المخاطر والسلامة',
    });
  }

  if (contractsInactive > 0) {
    earlyWarnings.push({
      id: 'warn_contracts',
      severity: 'warning',
      title: 'عقود أو تراخيص مصنفة غير فعالة',
      metricDisplay: `${formatNumber(contractsInactive)} غير فعال`,
      comparisonText: `نسبة السريان ${formatPct(contractsCompliancePct)} (${formatNumber(contractsActive)} فعال من ${formatNumber(contractsTotal)})`,
      targetSectionId: 'sec-08-contracts',
      targetSectionLabel: 'العقود والتراخيص',
    });
  }

  const belowGoodServices = servicesRows.filter(
    (s) => s.receivedCount > 0 && s.completionPct !== null && s.completionPct < thresholds.goodMin
  );
  if (belowGoodServices.length > 0) {
    const worst = [...belowGoodServices].sort((a, b) => (a.completionPct ?? 0) - (b.completionPct ?? 0))[0];
    earlyWarnings.push({
      id: 'warn_services_completion',
      severity: (worst.completionPct ?? 0) < thresholds.needsImprovementMin ? 'critical' : 'warning',
      title: `تراجع إنجاز ${formatNumber(belowGoodServices.length)} خدمة دون الحد الجيد (${formatNumber(thresholds.goodMin)}%)`,
      metricDisplay: `${worst.nameAr}: ${formatPct(worst.completionPct)}`,
      comparisonText: `تم تنفيذ ${formatNumber(worst.executedCount)} من ${formatNumber(worst.receivedCount)} طلب (فجوة ${formatNumber(worst.remainingGap)})`,
      targetSectionId: 'sec-04-efficiency',
      targetSectionLabel: 'كفاءة الإنجاز',
    });
  }

  const delayedTasksCount = taskStatusCounts[TASK_STATUSES.DELAYED] || 0;
  if (delayedTasksCount > 0) {
    earlyWarnings.push({
      id: 'warn_delayed_tasks',
      severity: 'warning',
      title: 'وجود مهام تشغيلية متأخرة عن الجدول',
      metricDisplay: `${formatNumber(delayedTasksCount)} مهمة متأخرة`,
      comparisonText: `من إجمالي ${formatNumber(meaningfulTasksCount)} مهمة مسجلة في النطاق`,
      targetSectionId: 'sec-10-tasks',
      targetSectionLabel: 'المهام والتحديات',
    });
  }

  if (timeline.length >= 2 && latestPeriod && previousPeriod && previousPeriod.faults > 0) {
    const faultSpikePct = ((latestPeriod.faults - previousPeriod.faults) / previousPeriod.faults) * 100;
    if (faultSpikePct >= 20) {
      earlyWarnings.push({
        id: 'warn_faults_spike',
        severity: 'warning',
        title: `ارتفاع ملحوظ في أعطال الصيانة خلال ${latestPeriod.labelAr}`,
        metricDisplay: `+${faultSpikePct.toFixed(1)}% (${formatNumber(latestPeriod.faults)} عطل)`,
        comparisonText: `مقارنة بالشهر السابق ${previousPeriod.labelAr} (${formatNumber(previousPeriod.faults)} عطل)`,
        targetSectionId: 'sec-05-maintenance',
        targetSectionLabel: 'الصيانة والأعطال',
      });
    }
  }

  if (totalFaults > 0 && grandTotalCostAed === 0 && filteredReports.length > 0) {
    earlyWarnings.push({
      id: 'warn_missing_costs',
      severity: 'attention',
      title: 'أعطال مسجلة بدون تكاليف صيانة مقيدة',
      metricDisplay: `${formatNumber(totalFaults)} عطل / 0.00 AED`,
      comparisonText: 'قد تكون التكاليف غير مدخلة بعد في مصفوفة الصيانة أو مغطاة بعقود شاملة غير مسعرة شهرياً',
      targetSectionId: 'sec-07-financial',
      targetSectionLabel: 'التحليل المالي',
    });
  }

  // Executive Recommendations (strictly grounded in real filtered data)
  const recommendations: ExecutiveRecommendationItem[] = [];

  if (filteredReports.length === 0) {
    if (filters.statusScope === 'approved_only' && draftReportsInDb > 0) {
      recommendations.push({
        id: 'rec_approve_drafts',
        priority: 'urgent',
        priorityLabelAr: 'أولوية عاجلة',
        title: 'استكمال اعتماد التقارير قيد الإعداد لإدراجها في التحليل الرسمي',
        evidenceText: `تحتوي قاعدة البيانات على ${formatNumber(draftReportsInDb)} تقرير غير معتمد نهائياً و${formatNumber(approvedReportsInDb)} تقرير معتمد.`,
        actionText: 'مراجعة واعتماد التقارير المكتملة عبر التوقيعين الإلكترونيين في تبويب مسودة التقرير لتفعيل تقارير الإدارة العليا المعتمدة.',
        owner: 'مدير إدارة المرافق / المعتمد',
        suggestedKpi: 'نسبة التقارير المعتمدة شهرياً (100%)',
        targetSectionId: 'sec-01-snapshot',
      });
    }
  } else {
    if (extinguishersInactive > 0 || hazardsOpen > 0) {
      recommendations.push({
        id: 'rec_safety_closure',
        priority: 'urgent',
        priorityLabelAr: 'أولوية عاجلة',
        title: 'إغلاق فجوات السلامة والطفايات غير الفعالة فوراً',
        evidenceText: `مسجل ${formatNumber(extinguishersInactive)} طفاية غير فعالة و${formatNumber(hazardsOpen)} ملاحظة مخاطر مفتوحة في النطاق الحالي.`,
        actionText: 'توجيه فريق السلامة لاستبدال/صيانة الطفايات غير الفعالة وإصدار خطة إغلاق زمنية للملاحظات المفتوحة قبل نهاية الشهر.',
        owner: 'مسؤول السلامة والامتثال التشغيلي',
        suggestedKpi: 'جاهزية الطفايات 100% ومعدل إغلاق المخاطر ≥ 95%',
        targetSectionId: 'sec-11-risk',
      });
    }

    if (belowGoodServices.length > 0) {
      const worst = [...belowGoodServices].sort((a, b) => (a.completionPct ?? 0) - (b.completionPct ?? 0))[0];
      recommendations.push({
        id: 'rec_service_sla',
        priority: 'urgent',
        priorityLabelAr: 'أولوية عاجلة',
        title: `رفع كفاءة الإنجاز في «${worst.nameAr}» والخدمات دون المعيار`,
        evidenceText: `بلغت نسبة إنجاز «${worst.nameAr}» ${formatPct(worst.completionPct)} (فجوة ${formatNumber(worst.remainingGap)} طلب) دون حد "${formatNumber(thresholds.goodMin)}%".`,
        actionText: 'تحليل أسباب الطلبات غير المنجزة وإعادة توزيع الموارد التشغيلية لرفع الإنجاز فوق مستوى المعيار المعتمد.',
        owner: 'مشرف العمليات والخدمات المساندة',
        suggestedKpi: `نسبة الإنجاز ≥ ${formatNumber(thresholds.veryGoodMin)}%`,
        targetSectionId: 'sec-04-efficiency',
      });
    }

    const topPareto = paretoRows.filter((p) => p.faultCount > 0).slice(0, 2);
    if (topPareto.length > 0 && totalFaults > 0) {
      const topShare = topPareto.reduce((s, p) => s + (p.sharePct ?? 0), 0);
      recommendations.push({
        id: 'rec_pareto_preventive',
        priority: 'medium',
        priorityLabelAr: 'أولوية متوسطة',
        title: `تكثيف الصيانة الوقائية لفئات الأعطال الأعلى تكراراً (${topPareto.map((p) => p.nameAr).join('، ')})`,
        evidenceText: `تمثل الفئات الأعلى ${formatPercentageSafe(topShare)} من إجمالي الأعطال (${formatNumber(totalFaults)} عطل) بتكلفة إجمالية ${formatAed(grandTotalCostAed)}.`,
        actionText: 'تطبيق جدول فحص وقائي دوري مخصص لهذه الفئات في المواقع الأكثر تسجيلاً للأعطال لتقليل الأعطال التصحيحية.',
        owner: 'رئيس قسم الصيانة الهندسية',
        suggestedKpi: 'نسبة خفض الأعطال المتكررة شهرياً (%)',
        targetSectionId: 'sec-05-maintenance',
      });
    }

    if (contractsInactive > 0) {
      recommendations.push({
        id: 'rec_contracts_audit',
        priority: 'medium',
        priorityLabelAr: 'أولوية متوسطة',
        title: 'مراجعة حالة العقود والتراخيص غير الفعالة وتوثيق تواريخ الاستحقاق',
        evidenceText: `يظهر السجل ${formatNumber(contractsInactive)} بند عقد/رخصة غير فعال من أصل ${formatNumber(contractsTotal)}.`,
        actionText: 'التأكد من أرشفة العقود المنتهية أو تجديد التراخيص المطلوبة وتحديث الملاحظات التفسيرية.',
        owner: 'مسؤول العقود والمشتريات',
        suggestedKpi: 'دقة وتحديث سجل العقود الفعالة (%)',
        targetSectionId: 'sec-08-contracts',
      });
    }

    if (timeline.length < 3) {
      recommendations.push({
        id: 'rec_data_continuity',
        priority: 'improvement',
        priorityLabelAr: 'تطوير تحليلي',
        title: 'بناء سلسلة تاريخية شهرية منتظمة لتفعيل التنبؤ والمقارنات السنوية',
        evidenceText: `يتوفر حالياً ${formatNumber(timeline.length)} تقرير ضمن النطاق (${formatNumber(approvedInScopeCount)} معتمد)، وهو أقل من الحد الأدنى المطلوب للاتجاهات والتنبؤ (3 أشهر).`,
        actionText: 'الاستمرار في اعتماد التقارير الشهرية بانتظام وتوحيد إدخال التكاليف ومصادر الطلبات لرفع دقة المؤشرات الاستراتيجية.',
        owner: 'معد التقرير الشهري / فريق الحوكمة',
        suggestedKpi: 'عدد الأشهر المكتملة والمتسلسلة في الأرشيف',
        targetSectionId: 'sec-14-forecast',
      });
    }
  }

  return {
    filters,
    meta: {
      totalReportsInDb: deduplicated.length,
      approvedReportsInDb,
      draftReportsInDb,
      deduplicatedCount: deduplicated.length,
      duplicatePeriodsCollapsed: collapsedCount,
      filteredReportsCount: filteredReports.length,
      approvedInScopeCount,
      draftInScopeCount,
      availableYears,
      availableMonths,
      availablePreparers,
      availableApprovers,
      scopeLabelAr: describeScopeAr(filters.statusScope),
      periodLabelAr: describePeriodRangeAr(filters.periodRange),
      hasData: filteredReports.length > 0,
    },
    snapshot: {
      totalReceived,
      totalExecuted,
      overallCompletionPct,
      overallCompletionLevel,
      totalRemainingGap,
      carriedOverSurplus,
      totalFaults,
      totalCostAed: grandTotalCostAed,
      pettyCashTotalAed,
      purchaseOrderTotalAed,
      contractsActive,
      contractsInactive,
      contractsTotal,
      contractsCompliancePct,
      extinguishersActive,
      extinguishersInactive,
      extinguishersReadinessPct,
      hazardsClosed,
      hazardsOpen,
      hazardsClosurePct,
      tasksTotal: meaningfulTasksCount,
      tasksCompleted: taskStatusCounts[TASK_STATUSES.COMPLETED] || 0,
      tasksDelayed: delayedTasksCount,
      tasksAvgCompletionPct,
      topService:
        topDemand.length > 0
          ? {
              serviceId: topDemand[0].serviceId,
              nameAr: topDemand[0].nameAr,
              receivedCount: topDemand[0].receivedCount,
            }
          : null,
      highestFaultSite: highestFaultSiteRow
        ? {
            siteId: highestFaultSiteRow.siteId,
            nameAr: highestFaultSiteRow.nameAr,
            faultCount: highestFaultSiteRow.faultCount,
          }
        : null,
    },
    overallPerformance: {
      thresholds,
      hasCompositeWeightsConfigured: false,
      methodologyNoteAr:
        'تُقاس مؤشرات الأداء الفردية وفق حدود الاعتماد المخزنة في إعدادات النظام (ممتاز / جيد جداً / جيد / يحتاج تحسين). ونظراً لعدم تحديد أوزان ترجيحية معتمدة في سياسة النظام لدمج المجالات غير المتجانسة (الطلبات، العقود، السلامة، المهام)، يتم عرض كل محور مستقلاً بشفافية كاملة دون احتساب درجة مركبة افتراضية.',
      pillars: overallPillars,
    },
    servicesAnalysis: {
      rows: servicesRows,
      topDemand,
      lowDemand,
      lowDemandNoteAr:
        'ملاحظة تحليلية: انخفاض عدد الطلبات في خدمة محددة لا يُعد مؤشراً سلبياً بحد ذاته، بل قد يعكس استقرار التشغيل أو محدودية الاحتياج الدوري للخدمة خلال الفترة.',
      backlogNoteAr:
        'ملاحظة منهجية: لا يحتوي النموذج الحالي على أرقام تتبع فردية للطلبات بين الأشهر؛ لذا يمثل عمود «الفجوة / المتبقي» الفرق الحسابي للفترة المختارة ولا يُصنف كمتأخرات مرحلة مؤكدة.',
      monthlySeriesKeys,
      monthlySeries,
    },
    maintenanceAnalysis: {
      totalFaults,
      fromFacilitiesDept,
      fromOtherDepts,
      sourcesTotal: fromFacilitiesDept + fromOtherDepts,
      paretoRows,
      byMonthSeries: byMonthMaintSeries,
      heatmapSites: sitesRows,
      activeCategories: scopedCategories,
      avgFaultsPerReport:
        filteredReports.length > 0
          ? Math.round((totalFaults / filteredReports.length) * 10) / 10
          : null,
    },
    sitesAnalysis: {
      rows: sitesRows,
      methodologyNoteAr:
        'ملاحظة مقارنة المواقع: تعتمد المقارنة الحالية على الأعداد المطلقة للأعطال المسجلة لكل مقر، نظراً لعدم توفر بيانات المساحة التشغيلية أو عدد الأصول لكل موقع في قاعدة البيانات؛ لذا لا يُصنف أي مقر كـ«ضعيف الكفاءة» استناداً إلى عدد الأعطال الخام وحده.',
    },
    financialAnalysis: {
      currency: 'AED',
      pettyCashTotalAed,
      purchaseOrderTotalAed,
      grandTotalCostAed,
      pettyCashSharePct: safePercentage(pettyCashTotalAed, grandTotalCostAed),
      purchaseOrderSharePct: safePercentage(purchaseOrderTotalAed, grandTotalCostAed),
      avgCostPerFaultAed:
        totalFaults > 0 ? Math.round((grandTotalCostAed / totalFaults) * 100) / 100 : null,
      avgCostPerReportAed:
        filteredReports.length > 0
          ? Math.round((grandTotalCostAed / filteredReports.length) * 100) / 100
          : null,
      byCategory: paretoRows,
      byMonthSeries: byMonthCostSeries,
      relatedRequestCounts: {
        pettyCashRequests: svcPettyCash?.receivedCount ?? 0,
        disbursementRequests: svcDisbursement?.receivedCount ?? 0,
        noteAr:
          'تنويه مالي: أعداد «النثرية» و«طلبات صرف» في ملخص الخدمات تمثل عدد طلبات المعاملات فقط ولا تُجمع مع مبالغ تكاليف الصيانة الفعلية بالدرهم (AED) لمنع الازدواجية.',
      },
      budgetNoteAr:
        'تحليل الانحراف عن الموازنة والوفورات غير متاح حالياً لعدم ربط موازنة تقديرية معتمدة لكل فئة صيانة في قاعدة البيانات.',
    },
    contractsAnalysis: {
      groups: contractGroups,
      totalActive: contractsActive,
      totalInactive: contractsInactive,
      totalAll: contractsTotal,
      overallActivePct: contractsCompliancePct,
      expiryLimitationNoteAr:
        'يعكس هذا القسم أعداد العقود والتراخيص الفعالة وغير الفعالة كما وردت في التقارير الشهرية؛ ولا تتوفر حالياً تواريخ انتهاء فردية أو جداول تجديد آلية في مخطط البيانات.',
    },
    supportServicesAnalysis: {
      securityRows,
      securityTotalReceived,
      securityTotalExecuted,
      securityCompletionPct,
      logisticsChannels,
      logisticsTotal,
      cleaningRequests: svcCleaning?.receivedCount ?? 0,
      cleaningExecuted: svcCleaning?.executedCount ?? 0,
      wasteRequests: svcWaste?.receivedCount ?? 0,
      wasteExecuted: svcWaste?.executedCount ?? 0,
      hospitalityRequests: svcHospitality?.receivedCount ?? 0,
      hospitalityExecuted: svcHospitality?.executedCount ?? 0,
      governmentRequests: svcGov?.receivedCount ?? 0,
      governmentExecuted: svcGov?.executedCount ?? 0,
      heterogeneousUnitsNoteAr:
        'يُعرض كل نشاط أمني ولوجستي وخدمي بوحدته المستقلة دون دمج الزوار أو الطرود أو المبالغ المالية في رقم إجمالي مضلل.',
    },
    tasksAndChallenges: {
      totalMeaningfulTasks: meaningfulTasksCount,
      avgCompletionPct: tasksAvgCompletionPct,
      statusDistribution,
      tasksList,
      challengesList,
    },
    riskComplianceAnalysis: {
      extinguishersActive,
      extinguishersInactive,
      extinguishersTotal,
      extinguishersReadinessPct,
      extinguisherNotes,
      hazardsClosed,
      hazardsOpen,
      hazardsTotal,
      hazardsClosurePct,
      hazardNotes,
      matrixLimitationNoteAr:
        'لا تتضمن البيانات المسجلة حالياً مصفوفة احتمال × أثر (Risk Matrix 5×5)، لذا تقتصر تحليلات المخاطر على مؤشرات الجاهزية والإغلاق والملاحظات الموثقة.',
    },
    comparisons: {
      timeline,
      latestPeriod,
      previousPeriod,
      mom: {
        available: !!(latestPeriod && previousPeriod),
        received: computeDelta(latestPeriod?.received ?? null, previousPeriod?.received ?? null),
        executed: computeDelta(latestPeriod?.executed ?? null, previousPeriod?.executed ?? null),
        completionPctDelta:
          latestPeriod?.completionPct !== null &&
          latestPeriod?.completionPct !== undefined &&
          previousPeriod?.completionPct !== null &&
          previousPeriod?.completionPct !== undefined
            ? Math.round((latestPeriod.completionPct - previousPeriod.completionPct) * 10) / 10
            : null,
        faults: computeDelta(latestPeriod?.faults ?? null, previousPeriod?.faults ?? null),
        costAed: computeDelta(latestPeriod?.costAed ?? null, previousPeriod?.costAed ?? null),
      },
      yoy: {
        available: yoyAvailable,
        currentLabelAr: latestPeriod?.labelAr ?? null,
        previousYearLabelAr: yoyPrevRow?.labelAr ?? null,
        received: computeDelta(latestPeriod?.received ?? null, yoyPrevRow?.received ?? null),
        faults: computeDelta(latestPeriod?.faults ?? null, yoyPrevRow?.faults ?? null),
        costAed: computeDelta(latestPeriod?.costAed ?? null, yoyPrevRow?.costAed ?? null),
      },
      yearlyTotals,
    },
    forecast,
    earlyWarnings,
    recommendations,
  };
}

function formatPercentageSafe(val: number): string {
  if (!Number.isFinite(val)) return '0.0%';
  return `${val.toFixed(1)}%`;
}
