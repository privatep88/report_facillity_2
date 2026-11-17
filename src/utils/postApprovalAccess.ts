import type { AuthUser, ReportStatus } from '../types/report.ts';
import { REPORT_STATUSES, USER_ROLES } from '../types/report.ts';

export interface PostApprovalReportTarget {
  status?: ReportStatus;
  preparerId?: string | null;
  isPostApprovalRevision?: boolean;
  latestApprovedVersion?: number | null;
}

/**
 * STRICT RBAC OWNERSHIP CHECK:
 * Determines whether a user is either a System Administrator (`admin`)
 * OR the original report preparer (`preparer` whose authenticated `user.id`
 * strictly equals `report.preparerId`).
 *
 * SECURITY RULE:
 * - Never matches by display name (`preparerName` vs `fullName`).
 * - Legacy reports missing `preparerId` are denied to non-admin users until
 *   explicitly linked to a verified user ID by an administrator.
 */
export function isAuthorizedPostApprovalOwner(
  user: AuthUser | null | undefined,
  report: PostApprovalReportTarget | null | undefined
): boolean {
  if (!user || !user.isActive || !report) return false;
  if (user.role === USER_ROLES.ADMIN) return true;
  const ownerUid = typeof report.preparerId === 'string' ? report.preparerId.trim() : '';
  return ownerUid.length > 0 && ownerUid === user.id;
}

/**
 * Determines whether a user may initiate post-approval editing on an
 * approved or archived report (or reopen the approved snapshot when viewing archive).
 */
export function canEditPostApprovalReport(
  user: AuthUser | null | undefined,
  report: PostApprovalReportTarget | null | undefined
): boolean {
  if (!report) return false;
  const isApprovedOrArchived =
    report.status === REPORT_STATUSES.APPROVED || report.status === REPORT_STATUSES.ARCHIVED;
  if (!isApprovedOrArchived) return false;
  return isAuthorizedPostApprovalOwner(user, report);
}

/**
 * Determines whether a user may modify an active draft/revision report.
 * For post-approval revisions (`isPostApprovalRevision === true`), strictly enforces
 * Admin OR original Preparer UID ownership.
 */
export function canEditWorkingReport(
  user: AuthUser | null | undefined,
  report: PostApprovalReportTarget | null | undefined
): boolean {
  if (!user || !user.isActive || !report) return false;
  if (report.status === REPORT_STATUSES.APPROVED || report.status === REPORT_STATUSES.ARCHIVED) {
    return false;
  }
  if (report.status !== REPORT_STATUSES.DRAFT && user.role !== USER_ROLES.ADMIN) {
    return false;
  }
  if (report.isPostApprovalRevision) {
    return isAuthorizedPostApprovalOwner(user, report);
  }
  return user.role === USER_ROLES.ADMIN || user.role === USER_ROLES.PREPARER;
}
