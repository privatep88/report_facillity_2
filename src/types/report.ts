export const USER_ROLES = {
  ADMIN: 'admin',
  PREPARER: 'preparer',
  REVIEWER: 'reviewer',
  APPROVER: 'approver',
  VIEWER: 'viewer',
} as const;

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];

export const ROLE_LABELS_AR: Record<UserRole, string> = {
  admin: 'مدير النظام',
  preparer: 'معد التقرير',
  reviewer: 'المراجع',
  approver: 'المعتمد',
  viewer: 'مستخدم للعرض فقط',
};

export const REPORT_STATUSES = {
  DRAFT: 'draft',
  READY_FOR_REVIEW: 'ready_for_review',
  UNDER_REVIEW: 'under_review',
  PENDING_APPROVAL: 'pending_approval',
  APPROVED: 'approved',
  ARCHIVED: 'archived',
} as const;

export type ReportStatus = (typeof REPORT_STATUSES)[keyof typeof REPORT_STATUSES];

export const STATUS_LABELS_AR: Record<ReportStatus, string> = {
  draft: 'مسودة',
  ready_for_review: 'جاهز للمراجعة',
  under_review: 'قيد المراجعة',
  pending_approval: 'بانتظار الاعتماد',
  approved: 'معتمد',
  archived: 'مؤرشف',
};

export const STATUS_LABELS_EN: Record<ReportStatus, string> = {
  draft: 'Draft',
  ready_for_review: 'Ready for Review',
  under_review: 'Under Review',
  pending_approval: 'Pending Approval',
  approved: 'Approved',
  archived: 'Archived',
};

export const TASK_STATUSES = {
  NOT_STARTED: 'not_started',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  DELAYED: 'delayed',
  PAUSED: 'paused',
} as const;

export type TaskStatus = (typeof TASK_STATUSES)[keyof typeof TASK_STATUSES];

export const TASK_STATUS_LABELS_AR: Record<TaskStatus, string> = {
  not_started: 'لم تبدأ',
  in_progress: 'قيد التنفيذ',
  completed: 'مكتملة',
  delayed: 'متأخرة',
  paused: 'متوقفة',
};

export const ARABIC_MONTHS: { value: number; nameAr: string; nameEn: string }[] = [
  { value: 1, nameAr: 'يناير', nameEn: 'January' },
  { value: 2, nameAr: 'فبراير', nameEn: 'February' },
  { value: 3, nameAr: 'مارس', nameEn: 'March' },
  { value: 4, nameAr: 'أبريل', nameEn: 'April' },
  { value: 5, nameAr: 'مايو', nameEn: 'May' },
  { value: 6, nameAr: 'يونيو', nameEn: 'June' },
  { value: 7, nameAr: 'يوليو', nameEn: 'July' },
  { value: 8, nameAr: 'أغسطس', nameEn: 'August' },
  { value: 9, nameAr: 'سبتمبر', nameEn: 'September' },
  { value: 10, nameAr: 'أكتوبر', nameEn: 'October' },
  { value: 11, nameAr: 'نوفمبر', nameEn: 'November' },
  { value: 12, nameAr: 'ديسمبر', nameEn: 'December' },
];

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  jobTitle: string;
  role: UserRole;
  isActive: boolean;
}

export interface PerformanceThresholds {
  excellentMin: number;
  veryGoodMin: number;
  goodMin: number;
  needsImprovementMin: number;
}

export const DEFAULT_THRESHOLDS: PerformanceThresholds = {
  excellentMin: 90,
  veryGoodMin: 75,
  goodMin: 60,
  needsImprovementMin: 40,
};

export interface ServiceMetricItem {
  serviceId: string;
  sortOrder: number;
  summaryOrder: number;
  nameAr: string;
  nameEn: string;
  receivedCount: number;
  executedCount: number;
}

export interface ContractLicenseGroup {
  groupKey: 'rental_contracts' | 'commercial_licenses' | 'service_contracts';
  nameAr: string;
  nameEn: string;
  activeCount: number;
  inactiveCount: number;
  notes: string;
}

export interface SafetyMetricGroup {
  groupKey: 'fire_extinguishers' | 'risk_observations';
  nameAr: string;
  nameEn: string;
  primaryLabelAr: string;
  primaryLabelEn: string;
  secondaryLabelAr: string;
  secondaryLabelEn: string;
  primaryCount: number;
  secondaryCount: number;
  notes: string;
}

export interface MaintenanceSite {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  isActive: boolean;
  sortOrder: number;
}

export interface MaintenanceCategory {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  isActive: boolean;
  sortOrder: number;
}

export interface MaintenanceCostEntry {
  categoryId: string;
  pettyCashAed: number;
  purchaseOrderAed: number;
}

export interface MaintenanceServicesCounts {
  fromFacilitiesDept: number;
  fromOtherDepts: number;
}

export interface LogisticsChannelItem {
  channelKey: string;
  nameAr: string;
  nameEn: string;
  requestCount: number;
  sortOrder: number;
}

export interface SecurityReceptionItem {
  activityKey: string;
  nameAr: string;
  nameEn: string;
  receivedCount: number;
  executedCount: number;
  sortOrder: number;
}

export interface TaskItem {
  id: string;
  rowOrder: number;
  topic: string;
  taskName: string;
  status: TaskStatus;
  completionPct: number;
}

export interface ChallengeItem {
  id: string;
  rowOrder: number;
  challengeText: string;
  updateText: string;
  recommendationText: string;
}

export interface ApprovalRecord {
  id: string;
  reportId: string;
  versionNumber: number;
  action: string;
  fromStatus: string;
  toStatus: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  comment: string;
  signatureToken: string;
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  reportId: string;
  userId: string;
  userName: string;
  userRole: string;
  action: string;
  fieldPath: string;
  previousValue: string;
  newValue: string;
  reason: string;
  versionNumber: number;
  reportStatus: string;
  createdAt: string;
}

export interface ReportVersionSummary {
  id: string;
  reportId: string;
  versionNumber: number;
  approvedById: string;
  approvedByName: string;
  signatureToken: string;
  createdAt: string;
  revisionReason?: string | null;
  sourceApprovedVersion?: number | null;
  editedByName?: string | null;
}

export interface MonthlyReportFull {
  id: string;
  periodId: string;
  reportNumber: string;
  year: number;
  month: number;
  department: string;
  company: string;
  classification: string;
  status: ReportStatus;
  currentVersion: number;
  isPostApprovalRevision?: boolean;
  revisionReason?: string | null;
  revisionStartedById?: string | null;
  revisionStartedByName?: string | null;
  revisionStartedByRole?: string | null;
  revisionStartedAt?: string | null;
  sourceApprovedVersion?: number | null;
  lockVersion?: number;
  expectedLockVersion?: number;
  preparerId: string | null;
  preparerName: string;
  preparerTitle: string;
  preparedAt: string | null;
  preparerSignatureHash: string | null;
  preparerSignatureImage: string | null;
  preparerSignedAt?: string | null;
  preparerSignedById?: string | null;
  preparerSignedByName?: string | null;
  preparerSignatureStatus?: 'valid' | 'revoked' | 'invalid';
  reviewerId: string | null;
  reviewerName: string;
  reviewerTitle: string;
  reviewedAt: string | null;
  approverId: string | null;
  approverName: string;
  approverTitle: string;
  approvedAt: string | null;
  approverSignatureHash: string | null;
  approverSignatureImage: string | null;
  approverSignedAt?: string | null;
  approverSignedById?: string | null;
  approverSignedByName?: string | null;
  approverSignatureStatus?: 'valid' | 'revoked' | 'invalid';
  createdAt: string;
  updatedAt: string;

  services: ServiceMetricItem[];
  contracts: ContractLicenseGroup[];
  safety: SafetyMetricGroup[];
  maintenanceMatrix: Record<string, Record<string, number>>; // siteId -> categoryId -> count
  maintenanceCosts: Record<string, MaintenanceCostEntry>; // categoryId -> costs
  maintenanceServices: MaintenanceServicesCounts;
  logistics: LogisticsChannelItem[];
  securityReception: SecurityReceptionItem[];
  tasks: TaskItem[];
  challenges: ChallengeItem[];
}

export interface ReportListSummary {
  id: string;
  reportNumber: string;
  year: number;
  month: number;
  department: string;
  status: ReportStatus;
  currentVersion: number;
  preparerId: string | null;
  preparerName: string;
  approverName: string;
  preparedAt: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  totalReceived: number;
  totalExecuted: number;
  completionRate: number | null;
  totalFaults: number;
  totalCostAed: number;
  versionCount: number;
  isPostApprovalRevision?: boolean;
  revisionReason?: string | null;
  revisionStartedByName?: string | null;
  revisionStartedAt?: string | null;
  sourceApprovedVersion?: number | null;
  latestApprovedVersion?: number | null;
  latestApprovedAt?: string | null;
  latestApprovedByName?: string | null;
  latestApprovedPreparedAt?: string | null;
  latestApprovedStatus?: ReportStatus | null;
  latestApprovedTotalReceived?: number | null;
  latestApprovedCompletionRate?: number | null;
}
