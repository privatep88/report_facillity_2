import {
  ARABIC_MONTHS,
  DEFAULT_THRESHOLDS,
  TASK_STATUSES,
} from '../types/report.ts';
import type {
  MaintenanceCategory,
  MaintenanceSite,
  MonthlyReportFull,
  PerformanceThresholds,
  SecurityReceptionItem,
} from '../types/report.ts';

const westernNumberFormatter = new Intl.NumberFormat('en-US-u-nu-latn', {
  useGrouping: true,
  maximumFractionDigits: 2,
});

const westernDecimalFormatter = new Intl.NumberFormat('en-US-u-nu-latn', {
  useGrouping: true,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const westernPercentageFormatter = new Intl.NumberFormat('en-US-u-nu-latn', {
  useGrouping: false,
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/**
 * Converts Arabic-Indic (٠-٩) and Persian/Extended Arabic-Indic (۰-۹) digits
 * as well as Arabic decimal/thousands separators (٫ / ٬) to Western ASCII 0-9.
 */
export function normalizeDigits(value: string): string {
  if (!value) return '';
  return value
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
    .replace(/\u066B/g, '.')
    .replace(/\u066C/g, '');
}

export function parseNormalizedInt(value: string): number {
  const cleaned = normalizeDigits(String(value ?? '')).replace(/,/g, '').trim();
  if (!cleaned) return 0;
  const num = Math.floor(Number(cleaned));
  return Number.isFinite(num) && num >= 0 ? num : 0;
}

export function parseNormalizedDecimal(value: string): number {
  const cleaned = normalizeDigits(String(value ?? '')).replace(/,/g, '').trim();
  if (!cleaned) return 0;
  const num = Number(cleaned);
  return Number.isFinite(num) && num >= 0 ? Math.round(num * 100) / 100 : 0;
}

export function getMonthNameAr(month: number): string {
  return ARABIC_MONTHS.find((m) => m.value === month)?.nameAr ?? formatNumber(month);
}

export function getMonthNameEn(month: number): string {
  return ARABIC_MONTHS.find((m) => m.value === month)?.nameEn ?? formatNumber(month);
}

/**
 * Safe division returning null when denominator <= 0.
 * Never returns NaN, Infinity, or #DIV/0!.
 */
export function safePercentage(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return null;
  }
  const pct = (numerator / denominator) * 100;
  return Number.isFinite(pct) ? Math.round(pct * 10) / 10 : null;
}

export function formatPercentage(value: number): string {
  if (!Number.isFinite(value)) return '0.0%';
  return `${westernPercentageFormatter.format(value)}%`;
}

export function formatPct(pct: number | null, fallback = 'لا تتوفر بيانات كافية'): string {
  if (pct === null || !Number.isFinite(pct)) return fallback;
  return formatPercentage(pct);
}

export function formatNumber(val: number): string {
  if (!Number.isFinite(val)) return '0';
  return westernNumberFormatter.format(val);
}

export function formatDecimalFixed(val: number): string {
  if (!Number.isFinite(val)) return '0.00';
  return westernDecimalFormatter.format(val);
}

export function formatAed(val: number): string {
  if (!Number.isFinite(val)) return '0.00 AED';
  return `${westernDecimalFormatter.format(val)} AED`;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

const westernDateFormatterUTC = new Intl.DateTimeFormat('en-GB-u-nu-latn', {
  timeZone: 'UTC',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  calendar: 'gregory',
});

const westernDateFormatterLocal = new Intl.DateTimeFormat('en-GB-u-nu-latn', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  calendar: 'gregory',
});

const westernTimeFormatterLocal = new Intl.DateTimeFormat('en-GB-u-nu-latn', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
  calendar: 'gregory',
});

/**
 * Normalizes any digits in a date string (Arabic-Indic ٠-٩ or Persian ۰-۹) to ASCII 0-9.
 */
export function normalizeDateDigits(value: string): string {
  return normalizeDigits(value);
}

function isValidGregorianYMD(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const probe = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

/**
 * Parses a strictly formatted DD/MM/YYYY date string (converting Arabic-Indic/Persian numerals if present)
 * into a canonical YYYY-MM-DD ISO date string without local-locale MM/DD swapping.
 */
export function parseDisplayDateDDMMYYYY(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = normalizeDateDigits(String(value).trim());
  const match = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (!isValidGregorianYMD(year, month, day)) return null;
  return `${String(year).padStart(4, '0')}-${pad2(month)}-${pad2(day)}`;
}

/**
 * Extracts canonical YYYY-MM-DD from an ISO timestamp, YYYY-MM-DD, or DD/MM/YYYY string
 * without off-by-one timezone shifting.
 */
export function extractIsoDate(value: string | null | undefined): string {
  if (!value) return '';
  const normalized = normalizeDateDigits(String(value).trim());
  if (!normalized) return '';
  const isoMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    if (isValidGregorianYMD(year, month, day)) {
      return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    }
  }
  const ddmmyyyy = parseDisplayDateDDMMYYYY(normalized);
  if (ddmmyyyy) return ddmmyyyy;

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return '';
  return `${parsed.getUTCFullYear()}-${pad2(parsed.getUTCMonth() + 1)}-${pad2(parsed.getUTCDate())}`;
}

/**
 * Returns today's actual Gregorian calendar date according to the user's device local clock
 * in canonical YYYY-MM-DD Western numerals (immune to UTC ±1 day drift and locale overrides).
 */
export function getDeviceTodayIsoDate(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  return normalizeDateDigits(`${String(year).padStart(4, '0')}-${pad2(month)}-${pad2(day)}`);
}

/**
 * Returns today's actual device date normalized as a noon-UTC ISO timestamp (`YYYY-MM-DDT12:00:00.000Z`)
 * so date parsers and formatters across client, server, PDF, and Excel never shift by ±1 day.
 */
export function getDeviceTodayNormalizedTimestamp(now: Date = new Date()): string {
  return `${getDeviceTodayIsoDate(now)}T12:00:00.000Z`;
}

/**
 * Returns milliseconds remaining until the next local device midnight (+1.5s safety buffer)
 * for automatic live day-rollover updates.
 */
export function getMsUntilNextDeviceMidnight(now: Date = new Date()): number {
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1, 500);
  return Math.max(1000, nextMidnight.getTime() - now.getTime());
}

/**
 * Formats an ISO or YYYY-MM-DD date string strictly as DD/MM/YYYY in Western numerals (0-9),
 * anchored to Gregorian calendar and immune to browser/OS locale overrides.
 */
export function formatDateWestern(value: string | null | undefined, fallback = '—'): string {
  if (!value) return fallback;
  const normalized = normalizeDateDigits(String(value).trim());
  if (!normalized) return fallback;

  const isoDate = extractIsoDate(normalized);
  if (isoDate) {
    const [yStr, mStr, dStr] = isoDate.split('-');
    const year = Number(yStr);
    const month = Number(mStr);
    const day = Number(dStr);
    if (isValidGregorianYMD(year, month, day)) {
      const utcMidday = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
      return normalizeDateDigits(westernDateFormatterUTC.format(utcMidday));
    }
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return normalizeDateDigits(westernDateFormatterLocal.format(parsed));
}

/**
 * Formats an ISO timestamp string strictly as DD/MM/YYYY HH:mm:ss in Western numerals (0-9).
 */
export function formatDateTimeWestern(value: string | null | undefined, fallback = '—'): string {
  if (!value) return fallback;
  const normalized = normalizeDateDigits(String(value).trim());
  if (!normalized) return fallback;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return fallback;
  const datePart = normalizeDateDigits(westernDateFormatterLocal.format(parsed));
  const timePart = normalizeDateDigits(westernTimeFormatterLocal.format(parsed));
  return `${datePart} ${timePart}`;
}

export function isLinkedReceptionActivity(item: { activityKey?: string; nameAr?: string }): boolean {
  const key = (item.activityKey || '').trim();
  const nameAr = (item.nameAr || '').trim();
  return (
    key === 'visitors' ||
    key === 'vendor_visitors' ||
    nameAr === 'عدد الزوار' ||
    nameAr === 'زوار الموردين'
  );
}

export function computeLinkedReceptionTotals(securityReception: SecurityReceptionItem[]): {
  receivedCount: number;
  executedCount: number;
  hasLinkedColumns: boolean;
} {
  let receivedCount = 0;
  let executedCount = 0;
  let hasLinkedColumns = false;
  for (const item of securityReception || []) {
    if (isLinkedReceptionActivity(item)) {
      hasLinkedColumns = true;
      receivedCount += Math.max(0, Number(item.receivedCount) || 0);
      executedCount += Math.max(0, Number(item.executedCount) || 0);
    }
  }
  return { receivedCount, executedCount, hasLinkedColumns };
}

export function computeLinkedLogisticsTotal(
  logistics: Array<{ requestCount?: number }>
): {
  totalRequests: number;
  hasChannels: boolean;
} {
  const list = Array.isArray(logistics) ? logistics : [];
  let totalRequests = 0;
  for (const item of list) {
    totalRequests += Math.max(0, Number(item.requestCount) || 0);
  }
  return { totalRequests, hasChannels: list.length > 0 };
}

export function isLogisticsServiceRow(s: { serviceId?: string; nameAr?: string }): boolean {
  return (
    s.serviceId === 'svc_logistics' ||
    (s.nameAr || '').trim() === 'طلبات الدعم اللوجستي'
  );
}

export function syncReceptionServiceWithSecurity(report: MonthlyReportFull): MonthlyReportFull {
  const linkedReception = computeLinkedReceptionTotals(report.securityReception);
  const linkedLogistics = computeLinkedLogisticsTotal(report.logistics);

  let changed = false;
  const nextServices = report.services.map((s) => {
    if (linkedReception.hasLinkedColumns && s.serviceId === 'svc_reception') {
      if (
        s.receivedCount !== linkedReception.receivedCount ||
        s.executedCount !== linkedReception.executedCount
      ) {
        changed = true;
        return {
          ...s,
          receivedCount: linkedReception.receivedCount,
          executedCount: linkedReception.executedCount,
        };
      }
    }

    if (linkedLogistics.hasChannels && isLogisticsServiceRow(s)) {
      const nextReceived = linkedLogistics.totalRequests;
      const prevReceived = Math.max(0, Number(s.receivedCount) || 0);
      const prevExecuted = Math.max(0, Number(s.executedCount) || 0);
      const nextExecuted =
        prevExecuted === prevReceived || prevExecuted === 0 || prevExecuted > nextReceived
          ? nextReceived
          : prevExecuted;

      if (s.receivedCount !== nextReceived || s.executedCount !== nextExecuted) {
        changed = true;
        return {
          ...s,
          receivedCount: nextReceived,
          executedCount: nextExecuted,
        };
      }
    }

    return s;
  });

  if (!changed) return report;
  return {
    ...report,
    services: nextServices,
  };
}

export interface PerformanceLevelResult {
  labelAr: string;
  labelEn: string;
  tone: 'emerald' | 'blue' | 'amber' | 'orange' | 'red' | 'neutral';
}

export function evaluatePerformanceLevel(
  pct: number | null,
  thresholds: PerformanceThresholds = DEFAULT_THRESHOLDS
): PerformanceLevelResult {
  if (pct === null || !Number.isFinite(pct)) {
    return { labelAr: '—', labelEn: 'No Data', tone: 'neutral' };
  }
  if (pct >= thresholds.excellentMin) {
    return { labelAr: 'ممتاز', labelEn: 'Excellent', tone: 'emerald' };
  }
  if (pct >= thresholds.veryGoodMin) {
    return { labelAr: 'جيد جداً', labelEn: 'Very Good', tone: 'blue' };
  }
  if (pct >= thresholds.goodMin) {
    return { labelAr: 'جيد', labelEn: 'Good', tone: 'amber' };
  }
  if (pct >= thresholds.needsImprovementMin) {
    return { labelAr: 'يحتاج تحسين', labelEn: 'Needs Improvement', tone: 'orange' };
  }
  return { labelAr: 'منخفض / حرج', labelEn: 'Critical', tone: 'red' };
}

export interface ReportComputedMetrics {
  totalReceived: number;
  totalExecuted: number;
  overallCompletionPct: number | null;
  activeServicesCount: number;
  topService: {
    serviceId: string;
    nameAr: string;
    nameEn: string;
    receivedCount: number;
  } | null;
  servicesWithMetrics: Array<{
    serviceId: string;
    nameAr: string;
    nameEn: string;
    receivedCount: number;
    executedCount: number;
    shareOfTotalPct: number | null;
    completionPct: number | null;
    level: PerformanceLevelResult;
  }>;
  maintenance: {
    siteTotals: Record<string, number>;
    categoryTotals: Record<string, number>;
    grandTotalFaults: number;
    highestFaultSite: { siteId: string; nameAr: string; count: number } | null;
    pettyCashTotalAed: number;
    purchaseOrderTotalAed: number;
    grandTotalCostAed: number;
  };
  maintenanceServicesTotal: number;
  maintenanceDiscrepancy: {
    hasDiscrepancy: boolean;
    servicesSummaryMaintenanceCount: number;
    maintenanceServicesDeptTotal: number;
    matrixFaultTotal: number;
  };
  logisticsTotal: number;
  logisticsWithPct: Array<{
    channelKey: string;
    nameAr: string;
    nameEn: string;
    requestCount: number;
    sharePct: number | null;
  }>;
  securityWithPct: Array<{
    activityKey: string;
    nameAr: string;
    nameEn: string;
    receivedCount: number;
    executedCount: number;
    completionPct: number | null;
  }>;
  securityTotals: {
    totalReceived: number;
    totalExecuted: number;
    overallCompletionPct: number | null;
    itemsCount: number;
  };
  linkedReception: {
    receivedCount: number;
    executedCount: number;
    hasLinkedColumns: boolean;
  };
  securityDiscrepancy: {
    hasReceptionService: boolean;
    hasDiscrepancy: boolean;
    securityTotalReceived: number;
    securityTotalExecuted: number;
    servicesSummaryReceptionReceived: number;
    servicesSummaryReceptionExecuted: number;
  };
  tasksSummary: {
    totalMeaningful: number;
    completed: number;
    inProgress: number;
    notStarted: number;
    delayed: number;
    paused: number;
    avgCompletionPct: number | null;
  };
  safetyAlerts: {
    hasInactiveExtinguishers: boolean;
    hasOpenHazards: boolean;
    inactiveExtinguishersCount: number;
    openHazardsCount: number;
  };
  contractsTotals: {
    totalActive: number;
    totalInactive: number;
  };
}

export function computeReportMetrics(
  report: MonthlyReportFull,
  sites: MaintenanceSite[],
  categories: MaintenanceCategory[],
  thresholds: PerformanceThresholds = DEFAULT_THRESHOLDS
): ReportComputedMetrics {
  const totalReceived = report.services.reduce((acc, s) => acc + Math.max(0, Number(s.receivedCount) || 0), 0);
  const totalExecuted = report.services.reduce((acc, s) => acc + Math.max(0, Number(s.executedCount) || 0), 0);
  const overallCompletionPct = safePercentage(totalExecuted, totalReceived);

  let topService: ReportComputedMetrics['topService'] = null;
  for (const s of report.services) {
    const rec = Math.max(0, Number(s.receivedCount) || 0);
    if (rec > 0 && (!topService || rec > topService.receivedCount)) {
      topService = {
        serviceId: s.serviceId,
        nameAr: s.nameAr,
        nameEn: s.nameEn,
        receivedCount: rec,
      };
    }
  }

  const servicesWithMetrics = report.services.map((s) => {
    const rec = Math.max(0, Number(s.receivedCount) || 0);
    const exec = Math.max(0, Number(s.executedCount) || 0);
    const completionPct = safePercentage(exec, rec);
    return {
      serviceId: s.serviceId,
      nameAr: s.nameAr,
      nameEn: s.nameEn,
      receivedCount: rec,
      executedCount: exec,
      shareOfTotalPct: safePercentage(rec, totalReceived),
      completionPct,
      level: evaluatePerformanceLevel(completionPct, thresholds),
    };
  });

  // Maintenance Matrix Calculations
  const siteTotals: Record<string, number> = {};
  const categoryTotals: Record<string, number> = {};
  for (const c of categories) {
    categoryTotals[c.id] = 0;
  }

  let grandTotalFaults = 0;
  let highestFaultSite: ReportComputedMetrics['maintenance']['highestFaultSite'] = null;

  for (const site of sites) {
    let siteSum = 0;
    const row = report.maintenanceMatrix[site.id] || {};
    for (const cat of categories) {
      const val = Math.max(0, Number(row[cat.id]) || 0);
      siteSum += val;
      categoryTotals[cat.id] = (categoryTotals[cat.id] || 0) + val;
    }
    siteTotals[site.id] = siteSum;
    grandTotalFaults += siteSum;
    if (siteSum > 0 && (!highestFaultSite || siteSum > highestFaultSite.count)) {
      highestFaultSite = { siteId: site.id, nameAr: site.nameAr, count: siteSum };
    }
  }

  let pettyCashTotalAed = 0;
  let purchaseOrderTotalAed = 0;
  for (const cat of categories) {
    const cost = report.maintenanceCosts[cat.id];
    if (cost) {
      pettyCashTotalAed += Math.max(0, Number(cost.pettyCashAed) || 0);
      purchaseOrderTotalAed += Math.max(0, Number(cost.purchaseOrderAed) || 0);
    }
  }
  const grandTotalCostAed = Math.round((pettyCashTotalAed + purchaseOrderTotalAed) * 100) / 100;

  // Maintenance reconciliation check
  const maintServiceRow = report.services.find((s) => s.serviceId === 'svc_maintenance');
  const servicesSummaryMaintenanceCount = Math.max(0, Number(maintServiceRow?.receivedCount) || 0);
  const maintenanceServicesTotal =
    Math.max(0, Number(report.maintenanceServices.fromFacilitiesDept) || 0) +
    Math.max(0, Number(report.maintenanceServices.fromOtherDepts) || 0);

  const hasDiscrepancy = false;

  // Logistics
  const logisticsTotal = report.logistics.reduce((acc, item) => acc + Math.max(0, Number(item.requestCount) || 0), 0);
  const logisticsWithPct = report.logistics.map((item) => {
    const count = Math.max(0, Number(item.requestCount) || 0);
    return {
      channelKey: item.channelKey,
      nameAr: item.nameAr,
      nameEn: item.nameEn,
      requestCount: count,
      sharePct: safePercentage(count, logisticsTotal),
    };
  });

  // Security & Reception
  const securityWithPct = report.securityReception.map((item) => {
    const rec = Math.max(0, Number(item.receivedCount) || 0);
    const exec = Math.max(0, Number(item.executedCount) || 0);
    return {
      activityKey: item.activityKey,
      nameAr: item.nameAr,
      nameEn: item.nameEn,
      receivedCount: rec,
      executedCount: exec,
      completionPct: safePercentage(exec, rec),
    };
  });
  const securityTotalReceived = securityWithPct.reduce((acc, item) => acc + item.receivedCount, 0);
  const securityTotalExecuted = securityWithPct.reduce((acc, item) => acc + item.executedCount, 0);
  const securityTotals = {
    totalReceived: securityTotalReceived,
    totalExecuted: securityTotalExecuted,
    overallCompletionPct: safePercentage(securityTotalExecuted, securityTotalReceived),
    itemsCount: securityWithPct.length,
  };
  const linkedReception = computeLinkedReceptionTotals(report.securityReception);
  const receptionServiceRow = report.services.find((s) => s.serviceId === 'svc_reception');
  const servicesSummaryReceptionReceived = Math.max(0, Number(receptionServiceRow?.receivedCount) || 0);
  const servicesSummaryReceptionExecuted = Math.max(0, Number(receptionServiceRow?.executedCount) || 0);
  const securityDiscrepancy = {
    hasReceptionService: !!receptionServiceRow,
    hasDiscrepancy:
      !!receptionServiceRow &&
      linkedReception.hasLinkedColumns &&
      (linkedReception.receivedCount !== servicesSummaryReceptionReceived ||
        linkedReception.executedCount !== servicesSummaryReceptionExecuted),
    securityTotalReceived: linkedReception.receivedCount,
    securityTotalExecuted: linkedReception.executedCount,
    servicesSummaryReceptionReceived,
    servicesSummaryReceptionExecuted,
  };

  // Tasks (exclude completely empty rows from completed/meaningful metrics!)
  const meaningfulTasks = report.tasks.filter(
    (t) => (t.topic && t.topic.trim() !== '' && t.topic.trim() !== '—') || (t.taskName && t.taskName.trim() !== '' && t.taskName.trim() !== '—')
  );
  const completed = meaningfulTasks.filter((t) => t.status === TASK_STATUSES.COMPLETED).length;
  const inProgress = meaningfulTasks.filter((t) => t.status === TASK_STATUSES.IN_PROGRESS).length;
  const notStarted = meaningfulTasks.filter((t) => t.status === TASK_STATUSES.NOT_STARTED).length;
  const delayed = meaningfulTasks.filter((t) => t.status === TASK_STATUSES.DELAYED).length;
  const paused = meaningfulTasks.filter((t) => t.status === TASK_STATUSES.PAUSED).length;
  const avgCompletionPct =
    meaningfulTasks.length > 0
      ? Math.round((meaningfulTasks.reduce((a, b) => a + (Number(b.completionPct) || 0), 0) / meaningfulTasks.length) * 10) / 10
      : null;

  // Safety alerts
  const fireExt = report.safety.find((g) => g.groupKey === 'fire_extinguishers');
  const riskObs = report.safety.find((g) => g.groupKey === 'risk_observations');
  const inactiveExtinguishersCount = Math.max(0, Number(fireExt?.secondaryCount) || 0);
  const openHazardsCount = Math.max(0, Number(riskObs?.secondaryCount) || 0);

  // Contracts totals
  const totalActive = report.contracts.reduce((a, c) => a + Math.max(0, Number(c.activeCount) || 0), 0);
  const totalInactive = report.contracts.reduce((a, c) => a + Math.max(0, Number(c.inactiveCount) || 0), 0);

  return {
    totalReceived,
    totalExecuted,
    overallCompletionPct,
    activeServicesCount: report.services.length,
    topService,
    servicesWithMetrics,
    maintenance: {
      siteTotals,
      categoryTotals,
      grandTotalFaults,
      highestFaultSite,
      pettyCashTotalAed: Math.round(pettyCashTotalAed * 100) / 100,
      purchaseOrderTotalAed: Math.round(purchaseOrderTotalAed * 100) / 100,
      grandTotalCostAed,
    },
    maintenanceServicesTotal,
    maintenanceDiscrepancy: {
      hasDiscrepancy,
      servicesSummaryMaintenanceCount,
      maintenanceServicesDeptTotal: maintenanceServicesTotal,
      matrixFaultTotal: grandTotalFaults,
    },
    logisticsTotal,
    logisticsWithPct,
    securityWithPct,
    securityTotals,
    linkedReception,
    securityDiscrepancy,
    tasksSummary: {
      totalMeaningful: meaningfulTasks.length,
      completed,
      inProgress,
      notStarted,
      delayed,
      paused,
      avgCompletionPct,
    },
    safetyAlerts: {
      hasInactiveExtinguishers: inactiveExtinguishersCount > 0,
      hasOpenHazards: openHazardsCount > 0,
      inactiveExtinguishersCount,
      openHazardsCount,
    },
    contractsTotals: {
      totalActive,
      totalInactive,
    },
  };
}
