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

const TOKEN_STORAGE_KEY = 'saaed_fm_session_token';
let memoryToken: string | null = null;
const unauthorizedListeners = new Set<() => void>();

export function getStoredToken(): string | null {
  if (memoryToken) return memoryToken;
  try {
    const val = window.localStorage.getItem(TOKEN_STORAGE_KEY);
    if (val) {
      memoryToken = val;
      return val;
    }
  } catch {
    // Storage might be restricted in sandboxed iframes
  }
  return null;
}

export function setStoredToken(token: string | null): void {
  memoryToken = token;
  try {
    if (token) {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // Ignore storage quota / iframe restrictions
  }
}

export function onApiUnauthorized(listener: () => void): () => void {
  unauthorizedListeners.add(listener);
  return () => {
    unauthorizedListeners.delete(listener);
  };
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((options?.headers as Record<string, string>) || {}),
  };

  const res = await fetch(url, {
    credentials: 'include',
    ...options,
    headers,
  });

  if (!res.ok) {
    let msg = 'حدث خطأ غير متوقع في الخادم';
    try {
      const data = (await res.json()) as { error?: string };
      if (data.error) msg = data.error;
    } catch {
      msg = res.statusText || msg;
    }
    if (res.status === 401 && !url.includes('/api/auth/login')) {
      setStoredToken(null);
      unauthorizedListeners.forEach((cb) => cb());
    }
    throw new ApiError(msg, res.status);
  }

  return res.json() as Promise<T>;
}

export interface BootstrapResponse {
  user: AuthUser | null;
  sites: MaintenanceSite[];
  categories: MaintenanceCategory[];
  thresholds: PerformanceThresholds;
  reports: ReportListSummary[];
}

export interface DemoAccount {
  id: string;
  email: string;
  fullName: string;
  jobTitle: string;
  role: UserRole;
}

export const api = {
  bootstrap: () => request<BootstrapResponse>('/api/bootstrap'),
  getDemoAccounts: () => request<{ accounts: DemoAccount[] }>('/api/auth/demo-accounts'),
  login: async (email: string, password: string) => {
    const res = await request<{ user: AuthUser; token?: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (res.token) {
      setStoredToken(res.token);
    }
    return res;
  },
  logout: async () => {
    setStoredToken(null);
    return request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' });
  },

  listReports: () => request<{ reports: ReportListSummary[] }>('/api/reports'),
  getReport: (id: string) =>
    request<{
      report: MonthlyReportFull;
      history: {
        approvals: ApprovalRecord[];
        auditLogs: AuditLogEntry[];
        versions: ReportVersionSummary[];
      };
    }>(`/api/reports/${encodeURIComponent(id)}`),
  getReportVersionSnapshot: (id: string, versionNumber: number) =>
    request<{
      snapshot: {
        report: MonthlyReportFull;
        sites: MaintenanceSite[];
        categories: MaintenanceCategory[];
        thresholds: PerformanceThresholds;
      };
      createdAt: string;
      signatureToken: string;
      approvedByName: string;
    }>(`/api/reports/${encodeURIComponent(id)}/versions/${versionNumber}`),
  getAllAnalytics: () =>
    request<{
      reports: MonthlyReportFull[];
      sites: MaintenanceSite[];
      categories: MaintenanceCategory[];
      thresholds: PerformanceThresholds;
    }>('/api/analytics/all'),

  createReport: (payload: { year: number; month: number; department: string }) =>
    request<{ report: MonthlyReportFull }>('/api/reports', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  saveReport: (id: string, report: MonthlyReportFull) =>
    request<{
      report: MonthlyReportFull;
      history: {
        approvals: ApprovalRecord[];
        auditLogs: AuditLogEntry[];
        versions: ReportVersionSummary[];
      };
    }>(`/api/reports/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(report),
    }),
  saveSignature: (id: string, target: 'preparer' | 'approver', signatureImage: string | null) =>
    request<{
      report: MonthlyReportFull;
      history: {
        approvals: ApprovalRecord[];
        auditLogs: AuditLogEntry[];
        versions: ReportVersionSummary[];
      };
    }>(`/api/reports/${encodeURIComponent(id)}/signature`, {
      method: 'PUT',
      body: JSON.stringify({ target, signatureImage }),
    }),
  saveDate: (id: string, target: 'preparedAt' | 'approvedAt', dateValue: string | null) =>
    request<{
      report: MonthlyReportFull;
      history: {
        approvals: ApprovalRecord[];
        auditLogs: AuditLogEntry[];
        versions: ReportVersionSummary[];
      };
    }>(`/api/reports/${encodeURIComponent(id)}/date`, {
      method: 'PUT',
      body: JSON.stringify({ target, dateValue }),
    }),
  workflowAction: (
    id: string,
    action: 'submit_review' | 'start_review' | 'return_revision' | 'forward_approval' | 'approve' | 'archive' | 'create_revision',
    comment = ''
  ) =>
    request<{
      report: MonthlyReportFull;
      history: {
        approvals: ApprovalRecord[];
        auditLogs: AuditLogEntry[];
        versions: ReportVersionSummary[];
      };
    }>(`/api/reports/${encodeURIComponent(id)}/workflow`, {
      method: 'POST',
      body: JSON.stringify({ action, comment }),
    }),

  addSite: (nameAr: string, nameEn: string) =>
    request<{ sites: MaintenanceSite[] }>('/api/sites', {
      method: 'POST',
      body: JSON.stringify({ nameAr, nameEn }),
    }),
  updateSite: (id: string, payload: { nameAr?: string; nameEn?: string; isActive?: boolean }) =>
    request<{ sites: MaintenanceSite[] }>(`/api/sites/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  addCategory: (nameAr: string, nameEn: string) =>
    request<{ categories: MaintenanceCategory[] }>('/api/categories', {
      method: 'POST',
      body: JSON.stringify({ nameAr, nameEn }),
    }),

  updateThresholds: (thresholds: PerformanceThresholds) =>
    request<{ thresholds: PerformanceThresholds }>('/api/settings/thresholds', {
      method: 'PUT',
      body: JSON.stringify(thresholds),
    }),

  getAdminUsers: () => request<{ users: AuthUser[] }>('/api/admin/users'),
  createAdminUser: (payload: { email: string; fullName: string; jobTitle: string; role: UserRole; password: string }) =>
    request<{ ok: boolean }>('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateAdminUser: (id: string, payload: { role?: UserRole; isActive?: boolean; jobTitle?: string; fullName?: string }) =>
    request<{ ok: boolean }>(`/api/admin/users/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
};
