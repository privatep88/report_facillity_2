import type {
  ApprovalRecord,
  AuditLogEntry,
  AuthUser,
  MaintenanceCategory,
  MaintenanceSite,
  MonthlyReportFull,
  PerformanceThresholds,
  ReportListSummary,
  ReportVersionSummary,
  UserRole,
} from '../types/report.ts';
import {
  DEFAULT_THRESHOLDS,
  REPORT_STATUSES,
  TASK_STATUSES,
  USER_ROLES,
} from '../types/report.ts';
import {
  computeReportMetrics,
  formatDateWestern,
  syncReceptionServiceWithSecurity,
} from '../utils/calculations.ts';
import { populateReportWithSampleData } from '../utils/sampleReportData.ts';

const STATIC_STORE_KEY = 'saaed_fm_static_store_v1';

interface StaticReportHistory {
  approvals: ApprovalRecord[];
  auditLogs: AuditLogEntry[];
  versions: Array<{
    summary: ReportVersionSummary;
    snapshot: {
      report: MonthlyReportFull;
      sites: MaintenanceSite[];
      categories: MaintenanceCategory[];
      thresholds: PerformanceThresholds;
    };
  }>;
}

interface StaticStoreState {
  currentUserId: string | null;
  users: AuthUser[];
  sites: MaintenanceSite[];
  categories: MaintenanceCategory[];
  thresholds: PerformanceThresholds;
  reports: Record<string, MonthlyReportFull>;
  histories: Record<string, StaticReportHistory>;
}

const INITIAL_USERS: AuthUser[] = [
  {
    id: 'usr_admin',
    email: 'mr.aljefre@gmail.com',
    fullName: 'خالد الهاشمي',
    jobTitle: 'مدير النظام التنفيذي',
    role: USER_ROLES.ADMIN,
    isActive: true,
  },
  {
    id: 'usr_preparer',
    email: 'muath.almasabi@saaed.ae',
    fullName: 'معاذ المصعبي',
    jobTitle: 'ضابط أول المرافق والأصول',
    role: USER_ROLES.PREPARER,
    isActive: true,
  },
  {
    id: 'usr_reviewer',
    email: 'reviewer@saaed.ae',
    fullName: 'سالم المنصوري',
    jobTitle: 'مراجع عمليات المرافق',
    role: USER_ROLES.REVIEWER,
    isActive: true,
  },
  {
    id: 'usr_approver',
    email: 'faisal.alsulaimani@saaed.ae',
    fullName: 'فيصل سويد السليماني',
    jobTitle: 'رئيس قسم إدارة المرافق',
    role: USER_ROLES.APPROVER,
    isActive: true,
  },
  {
    id: 'usr_viewer',
    email: 'viewer@saaed.ae',
    fullName: 'الإدارة العليا (عرض)',
    jobTitle: 'عضو اللجنة التنفيذية',
    role: USER_ROLES.VIEWER,
    isActive: true,
  },
];

const INITIAL_SITES: MaintenanceSite[] = [
  { id: 'site_injazat', code: 'INJAZAT', nameAr: 'مقر إنجازات', nameEn: 'Injazat HQ', isActive: true, sortOrder: 1 },
  { id: 'site_patrols', code: 'PATROLS', nameAr: 'مقر الدوريات', nameEn: 'Patrols HQ', isActive: true, sortOrder: 2 },
  { id: 'site_ibn_battuta', code: 'IBN_BATTUTA', nameAr: 'مقر ابن بطوطة', nameEn: 'Ibn Battuta HQ', isActive: true, sortOrder: 3 },
  { id: 'site_ajman_eval', code: 'AJMAN_EVAL', nameAr: 'مقر تقييم عجمان', nameEn: 'Ajman Evaluation HQ', isActive: true, sortOrder: 4 },
  { id: 'site_ajman_patrols', code: 'AJMAN_PATROLS', nameAr: 'مقر دوريات عجمان', nameEn: 'Ajman Patrols HQ', isActive: true, sortOrder: 5 },
];

const INITIAL_CATEGORIES: MaintenanceCategory[] = [
  { id: 'cat_general', code: 'GENERAL', nameAr: 'أعطال عامة', nameEn: 'General Faults', isActive: true, sortOrder: 1 },
  { id: 'cat_furniture', code: 'FURNITURE', nameAr: 'أثاث', nameEn: 'Furniture', isActive: true, sortOrder: 2 },
  { id: 'cat_decor', code: 'DECOR', nameAr: 'أعمال ديكور', nameEn: 'Decor Works', isActive: true, sortOrder: 3 },
  { id: 'cat_fire_alarm', code: 'FIRE_ALARM', nameAr: 'إنذار حريق', nameEn: 'Fire Alarm', isActive: true, sortOrder: 4 },
  { id: 'cat_water_leak', code: 'WATER_LEAK', nameAr: 'تسريب ماء', nameEn: 'Water Leak', isActive: true, sortOrder: 5 },
  { id: 'cat_doors', code: 'DOORS', nameAr: 'عطل أبواب', nameEn: 'Door Faults', isActive: true, sortOrder: 6 },
  { id: 'cat_lighting', code: 'LIGHTING', nameAr: 'عطل إنارة', nameEn: 'Lighting Faults', isActive: true, sortOrder: 7 },
  { id: 'cat_flooring', code: 'FLOORING', nameAr: 'عطل أرضيات', nameEn: 'Flooring Faults', isActive: true, sortOrder: 8 },
  { id: 'cat_hvac', code: 'HVAC', nameAr: 'عطل تكييف', nameEn: 'HVAC Faults', isActive: true, sortOrder: 9 },
  { id: 'cat_signage', code: 'SIGNAGE', nameAr: 'عطل لوحات خارجية', nameEn: 'External Signage', isActive: true, sortOrder: 10 },
  { id: 'cat_electrical', code: 'ELECTRICAL', nameAr: 'عطل كهرباء', nameEn: 'Electrical Faults', isActive: true, sortOrder: 11 },
  { id: 'cat_elevators', code: 'ELEVATORS', nameAr: 'عطل مصاعد', nameEn: 'Elevator Faults', isActive: true, sortOrder: 12 },
];

function createBaseReportTemplate(params: {
  id: string;
  reportNumber: string;
  year: number;
  month: number;
  department: string;
  sites: MaintenanceSite[];
  categories: MaintenanceCategory[];
}): MonthlyReportFull {
  const { id, reportNumber, year, month, department, sites, categories } = params;
  const now = new Date().toISOString();
  const services = [
    { serviceId: 'svc_reception', sortOrder: 1, summaryOrder: 4, nameAr: 'خدمات الاستقبال', nameEn: 'Reception Services', receivedCount: 0, executedCount: 0 },
    { serviceId: 'svc_hospitality', sortOrder: 2, summaryOrder: 7, nameAr: 'طلبات الضيافة', nameEn: 'Hospitality Requests', receivedCount: 0, executedCount: 0 },
    { serviceId: 'svc_maintenance', sortOrder: 3, summaryOrder: 1, nameAr: 'طلبات الصيانة', nameEn: 'Maintenance Requests', receivedCount: 0, executedCount: 0 },
    { serviceId: 'svc_logistics', sortOrder: 4, summaryOrder: 3, nameAr: 'طلبات الدعم اللوجستي', nameEn: 'Logistics Support Requests', receivedCount: 0, executedCount: 0 },
    { serviceId: 'svc_cleaning', sortOrder: 5, summaryOrder: 8, nameAr: 'طلبات النظافة', nameEn: 'Cleaning Requests', receivedCount: 0, executedCount: 0 },
    { serviceId: 'svc_waste', sortOrder: 6, summaryOrder: 9, nameAr: 'طلبات إدارة النفايات', nameEn: 'Waste Management Requests', receivedCount: 0, executedCount: 0 },
    { serviceId: 'svc_assets', sortOrder: 7, summaryOrder: 6, nameAr: 'طلبات حركات الأصول', nameEn: 'Asset Movement Requests', receivedCount: 0, executedCount: 0 },
    { serviceId: 'svc_petty_cash', sortOrder: 8, summaryOrder: 2, nameAr: 'النثرية Petty Cash', nameEn: 'Petty Cash', receivedCount: 0, executedCount: 0 },
    { serviceId: 'svc_disbursement', sortOrder: 9, summaryOrder: 5, nameAr: 'طلبات صرف', nameEn: 'Disbursement Requests', receivedCount: 0, executedCount: 0 },
    { serviceId: 'svc_government', sortOrder: 10, summaryOrder: 10, nameAr: 'طلبات وخدمات حكومية', nameEn: 'Government Services & Requests', receivedCount: 0, executedCount: 0 },
    { serviceId: 'svc_access_permit', sortOrder: 11, summaryOrder: 11, nameAr: 'طلبات تصريح أو إلغاء دخول', nameEn: 'Access Permit / Cancellation', receivedCount: 0, executedCount: 0 },
  ];

  const maintenanceMatrix: Record<string, Record<string, number>> = {};
  for (const s of sites) {
    maintenanceMatrix[s.id] = {};
    for (const c of categories) {
      maintenanceMatrix[s.id][c.id] = 0;
    }
  }

  const maintenanceCosts: Record<string, { categoryId: string; pettyCashAed: number; purchaseOrderAed: number }> = {};
  for (const c of categories) {
    maintenanceCosts[c.id] = { categoryId: c.id, pettyCashAed: 0, purchaseOrderAed: 0 };
  }

  const blank: MonthlyReportFull = {
    id,
    periodId: `period_${year}_${String(month).padStart(2, '0')}`,
    reportNumber,
    year,
    month,
    department,
    company: 'ساعد للأنظمة المرورية — SAAED',
    classification: 'Public',
    status: REPORT_STATUSES.DRAFT,
    currentVersion: 2,
    preparerId: 'usr_preparer',
    preparerName: 'معاذ المصعبي',
    preparerTitle: 'ضابط أول المرافق والأصول',
    preparedAt: formatDateWestern(now),
    preparerSignatureHash: 'SIG-53FD737FF12A939342CBF050',
    preparerSignatureImage: null,
    preparerSignedAt: now,
    preparerSignedById: 'usr_preparer',
    preparerSignedByName: 'معاذ المصعبي',
    preparerSignatureStatus: 'valid',
    reviewerId: 'usr_reviewer',
    reviewerName: 'سالم المنصوري',
    reviewerTitle: 'مراجع عمليات المرافق',
    reviewedAt: null,
    approverId: 'usr_approver',
    approverName: 'فيصل سويد السليماني',
    approverTitle: 'رئيس قسم إدارة المرافق',
    approvedAt: '28/01/2027',
    approverSignatureHash: null,
    approverSignatureImage: null,
    approverSignedAt: null,
    approverSignedById: null,
    approverSignedByName: null,
    approverSignatureStatus: 'valid',
    createdAt: now,
    updatedAt: now,
    services,
    contracts: [
      {
        groupKey: 'service_contracts',
        nameAr: 'عقود الخدمات',
        nameEn: 'Service Contracts',
        activeCount: 15,
        inactiveCount: 0,
        notes: 'تتم متابعة جميع العقود الخدمية والتشغيلية وتجديدها قبل انتهاء مدتها القانونية.',
      },
      {
        groupKey: 'commercial_licenses',
        nameAr: 'الرخص التجارية',
        nameEn: 'Commercial Licenses',
        activeCount: 14,
        inactiveCount: 1,
        notes: 'تم مخاطبة بلدية أبوظبي للحصول على ترخيص البناء في أرض مصفح وتم الرد بأنه تم إيقاف إصدار تراخيص البناء للأرض.',
      },
      {
        groupKey: 'rental_contracts',
        nameAr: 'عقود الإيجار',
        nameEn: 'Lease Contracts',
        activeCount: 12,
        inactiveCount: 1,
        notes: 'لا توجد عقود إيجار متأخرة، ويجري تحديث بيانات العقود الموثقة بشكل دوري.',
      },
    ],
    safety: [
      {
        groupKey: 'fire_extinguishers',
        nameAr: 'صيانة الطفايات',
        nameEn: 'Fire Extinguishers Maintenance',
        primaryLabelAr: 'الصيانة المنجزة',
        primaryLabelEn: 'Maintained',
        secondaryLabelAr: 'غير المنجزة',
        secondaryLabelEn: 'Pending',
        primaryCount: 15,
        secondaryCount: 0,
        notes: 'تم إنجاز الفحص الدوري لجميع طفايات الحريق في المقرات بنسبة 100%.',
      },
      {
        groupKey: 'risk_observations',
        nameAr: 'ملاحظات المخاطر والسلامة المهنية',
        nameEn: 'Occupational Health & Safety Observations',
        primaryLabelAr: 'ملاحظات تمت معالجتها',
        primaryLabelEn: 'Resolved',
        secondaryLabelAr: 'ملاحظات قيد المعالجة',
        secondaryLabelEn: 'In Progress',
        primaryCount: 15,
        secondaryCount: 0,
        notes: 'تمت معالجة كافة ملاحظات السلامة المهنية المسجلة خلال الجولات التفتيشية.',
      },
    ],
    maintenanceMatrix,
    maintenanceCosts,
    maintenanceServices: {
      fromFacilitiesDept: 66,
      fromOtherDepts: 64,
    },
    logistics: [
      { channelKey: 'courier', nameAr: 'المندوب', nameEn: 'Courier', requestCount: 30, sortOrder: 1 },
      { channelKey: 'emirates_post', nameAr: 'بريد الإمارات', nameEn: 'Emirates Post', requestCount: 18, sortOrder: 2 },
      { channelKey: 'aramex', nameAr: 'أرامكس', nameEn: 'Aramex', requestCount: 14, sortOrder: 3 },
      { channelKey: 'tawzea', nameAr: 'توزيع', nameEn: 'Tawzea', requestCount: 9, sortOrder: 4 },
      { channelKey: 'other', nameAr: 'أخرى', nameEn: 'Other', requestCount: 4, sortOrder: 5 },
    ],
    securityReception: [
      { activityKey: 'card_activation', nameAr: 'تفعيل البطاقات', nameEn: 'Card Activation', receivedCount: 42, executedCount: 42, sortOrder: 1 },
      { activityKey: 'visitors', nameAr: 'عدد الزوار', nameEn: 'Visitors Count', receivedCount: 510, executedCount: 510, sortOrder: 2 },
      { activityKey: 'vendor_visitors', nameAr: 'زوار الموردين', nameEn: 'Vendor Visitors', receivedCount: 118, executedCount: 116, sortOrder: 3 },
      { activityKey: 'hall_booking', nameAr: 'حجز القاعات', nameEn: 'Meeting Room Bookings', receivedCount: 64, executedCount: 64, sortOrder: 4 },
      { activityKey: 'evacuation', nameAr: 'حالات الإخلاء', nameEn: 'Evacuation Drills/Incidents', receivedCount: 2, executedCount: 2, sortOrder: 5 },
      { activityKey: 'security_reports', nameAr: 'تقارير أمنية', nameEn: 'Security Reports', receivedCount: 19, executedCount: 19, sortOrder: 6 },
      { activityKey: 'emergencies', nameAr: 'حالات طارئة', nameEn: 'Emergency Cases', receivedCount: 1, executedCount: 1, sortOrder: 7 },
    ],
    tasks: [
      {
        id: 'tsk_1',
        rowOrder: 1,
        topic: 'الصيانة الوقائية لأنظمة التكييف والتبريد (HVAC)',
        taskName: 'تنفيذ الصيانة الدورية لفلاتر ووحدات التكييف المركزية في مقر إنجازات ومقر ابن بطوطة وفحص كفاءة التبريد.',
        status: TASK_STATUSES.COMPLETED,
        completionPct: 100,
      },
    ],
    challenges: [
      {
        id: 'chl_1',
        rowOrder: 1,
        challengeText: 'عدم التمكن من إصدار تراخيص البناء لأرض مصفح',
        updateText: 'تم مخاطبة بلدية أبوظبي للحصول على ترخيص البناء في أرض مصفح وتم الرد بأنه تم إيقاف إصدار تراخيص البناء للأرض في الوقت الحالي.',
        recommendationText: 'تصعيد الموضوع للإدارة العليا للبت في حالة الأرض والبدائل الاستثمارية والتشغيلية المتاحة.',
      },
    ],
  };

  return syncReceptionServiceWithSecurity(populateReportWithSampleData(blank, sites, categories));
}

function createInitialStoreState(): StaticStoreState {
  const sites = [...INITIAL_SITES];
  const categories = [...INITIAL_CATEGORIES];
  const thresholds = { ...DEFAULT_THRESHOLDS };

  const jan2027 = createBaseReportTemplate({
    id: 'rep_2027_01_001',
    reportNumber: 'FM-2027-01-001',
    year: 2027,
    month: 1,
    department: 'إدارة الخدمات العامة',
    sites,
    categories,
  });

  const dec2026Base = createBaseReportTemplate({
    id: 'rep_2026_12_001',
    reportNumber: 'FM-2026-12-001',
    year: 2026,
    month: 12,
    department: 'إدارة الخدمات العامة',
    sites,
    categories,
  });
  const dec2026: MonthlyReportFull = {
    ...dec2026Base,
    status: REPORT_STATUSES.APPROVED,
    currentVersion: 1,
    approvedAt: '31/12/2026',
    approverSignatureHash: 'SIG-APPROVED-20261231',
  };

  const now = new Date().toISOString();

  return {
    currentUserId: 'usr_admin',
    users: [...INITIAL_USERS],
    sites,
    categories,
    thresholds,
    reports: {
      [jan2027.id]: jan2027,
      [dec2026.id]: dec2026,
    },
    histories: {
      [jan2027.id]: {
        approvals: [],
        auditLogs: [
          {
            id: 'aud_init_1',
            reportId: jan2027.id,
            userId: 'usr_admin',
            userName: 'خالد الهاشمي',
            userRole: USER_ROLES.ADMIN,
            action: 'إنشاء وتعبئة التقرير المرجعي',
            fieldPath: 'report',
            previousValue: '',
            newValue: jan2027.reportNumber,
            reason: 'تهيئة بيانات التقرير الشهري',
            versionNumber: 2,
            reportStatus: jan2027.status,
            createdAt: now,
          },
        ],
        versions: [],
      },
      [dec2026.id]: {
        approvals: [
          {
            id: 'app_dec_1',
            reportId: dec2026.id,
            versionNumber: 1,
            action: 'approve',
            fromStatus: REPORT_STATUSES.PENDING_APPROVAL,
            toStatus: REPORT_STATUSES.APPROVED,
            actorId: 'usr_approver',
            actorName: 'فيصل سويد السليماني',
            actorRole: USER_ROLES.APPROVER,
            comment: 'تمت المراجعة والاعتماد النهائي للتقرير الشهري.',
            signatureToken: 'SIG-APPROVED-20261231',
            createdAt: now,
          },
        ],
        auditLogs: [],
        versions: [
          {
            summary: {
              id: 'ver_dec_1',
              reportId: dec2026.id,
              versionNumber: 1,
              approvedById: 'usr_approver',
              approvedByName: 'فيصل سويد السليماني',
              signatureToken: 'SIG-APPROVED-20261231',
              createdAt: now,
            },
            snapshot: {
              report: dec2026,
              sites,
              categories,
              thresholds,
            },
          },
        ],
      },
    },
  };
}

function loadStore(): StaticStoreState {
  try {
    const raw = window.localStorage.getItem(STATIC_STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StaticStoreState;
      if (parsed && parsed.reports && Object.keys(parsed.reports).length > 0) {
        return parsed;
      }
    }
  } catch {
    // ignore storage errors
  }
  const initial = createInitialStoreState();
  saveStore(initial);
  return initial;
}

function saveStore(state: StaticStoreState): void {
  try {
    window.localStorage.setItem(STATIC_STORE_KEY, JSON.stringify(state));
  } catch {
    // ignore quota errors
  }
}

function buildReportSummaries(state: StaticStoreState): ReportListSummary[] {
  return Object.values(state.reports)
    .sort((a, b) => (b.year !== a.year ? b.year - a.year : b.month - a.month))
    .map((r) => {
      const m = computeReportMetrics(r, state.sites, state.categories, state.thresholds);
      const versionCount = state.histories[r.id]?.versions.length || 0;
      return {
        id: r.id,
        reportNumber: r.reportNumber,
        year: r.year,
        month: r.month,
        department: r.department,
        status: r.status,
        currentVersion: r.currentVersion,
        preparerName: r.preparerName,
        approverName: r.approverName,
        preparedAt: r.preparedAt,
        approvedAt: r.approvedAt,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        totalReceived: m.totalReceived,
        totalExecuted: m.totalExecuted,
        completionRate: m.overallCompletionPct,
        totalFaults: m.maintenance.grandTotalFaults,
        totalCostAed: m.maintenance.grandTotalCostAed,
        versionCount,
      };
    });
}

function getHistoryResponse(state: StaticStoreState, reportId: string) {
  const h = state.histories[reportId] || { approvals: [], auditLogs: [], versions: [] };
  return {
    approvals: h.approvals,
    auditLogs: h.auditLogs,
    versions: h.versions.map((v) => v.summary),
  };
}

export const staticFallbackApi = {
  getReportForExport(reportId: string, versionNumber?: number | null) {
    const state = loadStore();
    if (versionNumber) {
      const v = state.histories[reportId]?.versions.find((x) => x.summary.versionNumber === versionNumber);
      if (v) return v.snapshot;
    }
    const report = state.reports[reportId] || Object.values(state.reports)[0];
    return {
      report,
      sites: state.sites,
      categories: state.categories,
      thresholds: state.thresholds,
    };
  },

  getAllReportsForAnalytics() {
    const state = loadStore();
    return {
      reports: Object.values(state.reports),
      sites: state.sites,
      categories: state.categories,
      thresholds: state.thresholds,
    };
  },

  async bootstrap() {
    const state = loadStore();
    const user = state.users.find((u) => u.id === state.currentUserId) || state.users[0] || null;
    return {
      user,
      sites: state.sites,
      categories: state.categories,
      thresholds: state.thresholds,
      reports: buildReportSummaries(state),
    };
  },

  async getDemoAccounts() {
    const state = loadStore();
    return {
      accounts: state.users.filter((u) => u.isActive),
    };
  },

  async login(email: string, _password: string) {
    const state = loadStore();
    const found = state.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
    if (!found) {
      throw new Error('بيانات الدخول غير صحيحة');
    }
    state.currentUserId = found.id;
    saveStore(state);
    return { user: found, token: `static-token-${found.id}` };
  },

  async logout() {
    const state = loadStore();
    state.currentUserId = null;
    saveStore(state);
    return { ok: true };
  },

  async listReports() {
    const state = loadStore();
    return { reports: buildReportSummaries(state) };
  },

  async getReport(id: string) {
    const state = loadStore();
    const report = state.reports[id] || Object.values(state.reports)[0];
    if (!report) {
      throw new Error('التقرير المطلوب غير موجود');
    }
    return {
      report,
      history: getHistoryResponse(state, report.id),
    };
  },

  async getReportVersionSnapshot(id: string, versionNumber: number) {
    const state = loadStore();
    const ver = state.histories[id]?.versions.find((v) => v.summary.versionNumber === versionNumber);
    if (ver) {
      return {
        snapshot: ver.snapshot,
        createdAt: ver.summary.createdAt,
        signatureToken: ver.summary.signatureToken,
        approvedByName: ver.summary.approvedByName,
      };
    }
    const report = state.reports[id];
    if (!report) throw new Error('نسخة التقرير غير موجودة');
    return {
      snapshot: {
        report,
        sites: state.sites,
        categories: state.categories,
        thresholds: state.thresholds,
      },
      createdAt: report.updatedAt,
      signatureToken: report.approverSignatureHash || report.preparerSignatureHash || 'SIG-STATIC',
      approvedByName: report.approverName || 'فيصل سويد السليماني',
    };
  },

  async getAllAnalytics() {
    const state = loadStore();
    return {
      reports: Object.values(state.reports),
      sites: state.sites,
      categories: state.categories,
      thresholds: state.thresholds,
    };
  },

  async createReport(payload: { year: number; month: number; department: string }) {
    const state = loadStore();
    const id = `rep_${payload.year}_${String(payload.month).padStart(2, '0')}_${Date.now().toString(36).slice(-3)}`;
    const seq = Object.keys(state.reports).length + 1;
    const reportNumber = `FM-${payload.year}-${String(payload.month).padStart(2, '0')}-${String(seq).padStart(3, '0')}`;
    const newRep = createBaseReportTemplate({
      id,
      reportNumber,
      year: payload.year,
      month: payload.month,
      department: payload.department || 'إدارة الخدمات العامة',
      sites: state.sites,
      categories: state.categories,
    });
    state.reports[id] = newRep;
    state.histories[id] = { approvals: [], auditLogs: [], versions: [] };
    saveStore(state);
    return { report: newRep };
  },

  async saveReport(id: string, report: MonthlyReportFull) {
    const state = loadStore();
    const normalized = syncReceptionServiceWithSecurity({
      ...report,
      id,
      updatedAt: new Date().toISOString(),
    });
    state.reports[id] = normalized;
    saveStore(state);
    return {
      report: normalized,
      history: getHistoryResponse(state, id),
    };
  },

  async saveSignature(id: string, target: 'preparer' | 'approver', signatureImage: string | null) {
    const state = loadStore();
    const report = state.reports[id];
    if (!report) throw new Error('التقرير غير موجود');
    const now = new Date().toISOString();
    const updated: MonthlyReportFull = { ...report, updatedAt: now };
    if (target === 'preparer') {
      updated.preparerSignatureImage = signatureImage;
      updated.preparerSignedAt = signatureImage ? now : null;
      updated.preparerSignatureHash = signatureImage ? `SIG-PREP-${Date.now().toString(16).toUpperCase()}` : null;
    } else {
      updated.approverSignatureImage = signatureImage;
      updated.approverSignedAt = signatureImage ? now : null;
      updated.approverSignatureHash = signatureImage ? `SIG-APPR-${Date.now().toString(16).toUpperCase()}` : null;
    }
    state.reports[id] = updated;
    saveStore(state);
    return {
      report: updated,
      history: getHistoryResponse(state, id),
    };
  },

  async saveDate(id: string, target: 'preparedAt' | 'approvedAt', dateValue: string | null) {
    const state = loadStore();
    const report = state.reports[id];
    if (!report) throw new Error('التقرير غير موجود');
    const updated: MonthlyReportFull = {
      ...report,
      [target]: dateValue || formatDateWestern(new Date().toISOString()),
      updatedAt: new Date().toISOString(),
    };
    state.reports[id] = updated;
    saveStore(state);
    return {
      report: updated,
      history: getHistoryResponse(state, id),
    };
  },

  async workflowAction(
    id: string,
    action: 'submit_review' | 'start_review' | 'return_revision' | 'forward_approval' | 'approve' | 'archive' | 'create_revision',
    comment = '',
    approverName?: string,
    approverTitle?: string
  ) {
    const state = loadStore();
    const report = state.reports[id];
    if (!report) throw new Error('التقرير غير موجود');
    const now = new Date().toISOString();
    const fromStatus = report.status;
    let toStatus = report.status;
    let currentVersion = report.currentVersion;

    if (action === 'submit_review') toStatus = REPORT_STATUSES.READY_FOR_REVIEW;
    else if (action === 'start_review') toStatus = REPORT_STATUSES.UNDER_REVIEW;
    else if (action === 'return_revision') toStatus = REPORT_STATUSES.DRAFT;
    else if (action === 'forward_approval') toStatus = REPORT_STATUSES.PENDING_APPROVAL;
    else if (action === 'approve') toStatus = REPORT_STATUSES.APPROVED;
    else if (action === 'archive') toStatus = REPORT_STATUSES.ARCHIVED;
    else if (action === 'create_revision') {
      toStatus = REPORT_STATUSES.DRAFT;
      currentVersion += 1;
    }

    const updated: MonthlyReportFull = {
      ...report,
      status: toStatus,
      currentVersion,
      approverName: approverName || report.approverName,
      approverTitle: approverTitle || report.approverTitle,
      approvedAt: action === 'approve' ? formatDateWestern(now) : report.approvedAt,
      updatedAt: now,
    };

    state.reports[id] = updated;
    if (!state.histories[id]) {
      state.histories[id] = { approvals: [], auditLogs: [], versions: [] };
    }
    const sigToken = `SIG-${Date.now().toString(16).toUpperCase()}`;
    const user = state.users.find((u) => u.id === state.currentUserId) || state.users[0];
    state.histories[id].approvals.unshift({
      id: `app_${Date.now()}`,
      reportId: id,
      versionNumber: currentVersion,
      action,
      fromStatus,
      toStatus,
      actorId: user.id,
      actorName: user.fullName,
      actorRole: user.role,
      comment,
      signatureToken: sigToken,
      createdAt: now,
    });

    if (action === 'approve') {
      state.histories[id].versions.unshift({
        summary: {
          id: `ver_${Date.now()}`,
          reportId: id,
          versionNumber: currentVersion,
          approvedById: user.id,
          approvedByName: updated.approverName || user.fullName,
          signatureToken: sigToken,
          createdAt: now,
        },
        snapshot: {
          report: updated,
          sites: state.sites,
          categories: state.categories,
          thresholds: state.thresholds,
        },
      });
    }

    saveStore(state);
    return {
      report: updated,
      history: getHistoryResponse(state, id),
    };
  },

  async addSite(nameAr: string, nameEn: string) {
    const state = loadStore();
    const id = `site_${Date.now().toString(36)}`;
    state.sites.push({
      id,
      code: `SITE_${state.sites.length + 1}`,
      nameAr: nameAr.trim(),
      nameEn: (nameEn || nameAr).trim(),
      isActive: true,
      sortOrder: state.sites.length + 1,
    });
    saveStore(state);
    return { sites: state.sites };
  },

  async updateSite(id: string, payload: { nameAr?: string; nameEn?: string; isActive?: boolean }) {
    const state = loadStore();
    state.sites = state.sites.map((s) =>
      s.id === id
        ? {
            ...s,
            nameAr: payload.nameAr !== undefined ? payload.nameAr : s.nameAr,
            nameEn: payload.nameEn !== undefined ? payload.nameEn : s.nameEn,
            isActive: payload.isActive !== undefined ? payload.isActive : s.isActive,
          }
        : s
    );
    saveStore(state);
    return { sites: state.sites };
  },

  async addCategory(nameAr: string, nameEn: string) {
    const state = loadStore();
    const id = `cat_${Date.now().toString(36)}`;
    state.categories.push({
      id,
      code: `CAT_${state.categories.length + 1}`,
      nameAr: nameAr.trim(),
      nameEn: (nameEn || nameAr).trim(),
      isActive: true,
      sortOrder: state.categories.length + 1,
    });
    saveStore(state);
    return { categories: state.categories };
  },

  async updateThresholds(thresholds: PerformanceThresholds) {
    const state = loadStore();
    state.thresholds = { ...thresholds };
    saveStore(state);
    return { thresholds: state.thresholds };
  },

  async getAdminUsers() {
    const state = loadStore();
    return { users: state.users };
  },

  async createAdminUser(payload: {
    email: string;
    fullName: string;
    jobTitle: string;
    role: UserRole;
    password: string;
  }) {
    const state = loadStore();
    state.users.push({
      id: `usr_${Date.now().toString(36)}`,
      email: payload.email.trim(),
      fullName: payload.fullName.trim(),
      jobTitle: payload.jobTitle.trim(),
      role: payload.role,
      isActive: true,
    });
    saveStore(state);
    return { ok: true };
  },

  async updateAdminUser(
    id: string,
    payload: { role?: UserRole; isActive?: boolean; jobTitle?: string; fullName?: string }
  ) {
    const state = loadStore();
    state.users = state.users.map((u) =>
      u.id === id
        ? {
            ...u,
            role: payload.role ?? u.role,
            isActive: payload.isActive ?? u.isActive,
            jobTitle: payload.jobTitle ?? u.jobTitle,
            fullName: payload.fullName ?? u.fullName,
          }
        : u
    );
    saveStore(state);
    return { ok: true };
  },
};
