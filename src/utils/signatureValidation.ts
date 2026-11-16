import type { AuthUser, MonthlyReportFull } from '../types/report.ts';
import { REPORT_STATUSES, USER_ROLES } from '../types/report.ts';

export type SignatureVerificationState = 'completed' | 'missing' | 'saving' | 'invalid';

export interface SingleSignatureValidation {
  role: 'preparer' | 'approver';
  state: SignatureVerificationState;
  labelAr: string;
  isValid: boolean;
  reason?: string;
  signedAt: string | null;
  signedByName: string | null;
}

export interface DualSignatureApprovalEvaluation {
  preparer: SingleSignatureValidation;
  approver: SingleSignatureValidation;
  hasValidPreparerSignature: boolean;
  hasValidApproverSignature: boolean;
  hasBothSignatures: boolean;
  userHasApprovalPermission: boolean;
  isStatusApprovable: boolean;
  reportMeetsApprovalRequirements: boolean;
  canApproveReport: boolean;
  blockingReasons: string[];
}

export const SIGNATURE_STATE_LABELS_AR: Record<SignatureVerificationState, string> = {
  completed: 'مكتمل',
  missing: 'غير مكتمل',
  saving: 'قيد الحفظ',
  invalid: 'غير صالح',
};

const DATA_URL_REGEX = /^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=]+)$/;
// Minimum decoded payload size in bytes for a genuine drawn/uploaded signature image
// (prevents 1x1 blank/transparent stub PNGs or corrupt short strings)
const MIN_SIGNATURE_IMAGE_BYTES = 180;
const MAX_SIGNATURE_DATA_URL_CHARS = 750_000;

export function isValidSignatureDataUrl(signatureImage: string | null | undefined): boolean {
  if (typeof signatureImage !== 'string') return false;
  const trimmed = signatureImage.trim();
  if (!trimmed || trimmed.length > MAX_SIGNATURE_DATA_URL_CHARS) return false;

  const match = DATA_URL_REGEX.exec(trimmed);
  if (!match) return false;

  const base64Body = match[2];
  if (!base64Body || base64Body.length < 240) return false;

  // Approximate decoded byte length from base64 string without relying on Node Buffer or atob
  const paddingChars = base64Body.endsWith('==') ? 2 : base64Body.endsWith('=') ? 1 : 0;
  const decodedBytes = Math.floor((base64Body.length * 3) / 4) - paddingChars;
  return decodedBytes >= MIN_SIGNATURE_IMAGE_BYTES;
}

export function validateSingleSignature(params: {
  role: 'preparer' | 'approver';
  signatureImage: string | null | undefined;
  signatureStatus?: 'valid' | 'revoked' | 'invalid' | null;
  ownerName: string | null | undefined;
  signedAt?: string | null;
  signedByName?: string | null;
  isSaving?: boolean;
}): SingleSignatureValidation {
  const {
    role,
    signatureImage,
    signatureStatus,
    ownerName,
    signedAt = null,
    signedByName = null,
    isSaving = false,
  } = params;

  const roleTitle = role === 'preparer' ? 'توقيع معد التقرير' : 'توقيع معتمد التقرير';

  if (isSaving) {
    return {
      role,
      state: 'saving',
      labelAr: SIGNATURE_STATE_LABELS_AR.saving,
      isValid: false,
      reason: `جاري حفظ ${roleTitle} في قاعدة البيانات`,
      signedAt,
      signedByName,
    };
  }

  if (signatureStatus === 'revoked' || signatureStatus === 'invalid') {
    return {
      role,
      state: 'invalid',
      labelAr: SIGNATURE_STATE_LABELS_AR.invalid,
      isValid: false,
      reason: `${roleTitle} ملغى أو غير صالح`,
      signedAt,
      signedByName,
    };
  }

  if (!signatureImage || !signatureImage.trim()) {
    return {
      role,
      state: 'missing',
      labelAr: SIGNATURE_STATE_LABELS_AR.missing,
      isValid: false,
      reason: `${roleTitle} غير موجود`,
      signedAt: null,
      signedByName: null,
    };
  }

  if (!isValidSignatureDataUrl(signatureImage)) {
    return {
      role,
      state: 'invalid',
      labelAr: SIGNATURE_STATE_LABELS_AR.invalid,
      isValid: false,
      reason: `بيانات أو صيغة ${roleTitle} غير صالحة`,
      signedAt,
      signedByName,
    };
  }

  if (!ownerName || !ownerName.trim()) {
    return {
      role,
      state: 'invalid',
      labelAr: SIGNATURE_STATE_LABELS_AR.invalid,
      isValid: false,
      reason:
        role === 'preparer'
          ? 'اسم معد التقرير غير محدد لربط التوقيع به'
          : 'اسم معتمد التقرير غير محدد لربط التوقيع به',
      signedAt,
      signedByName,
    };
  }

  return {
    role,
    state: 'completed',
    labelAr: SIGNATURE_STATE_LABELS_AR.completed,
    isValid: true,
    signedAt,
    signedByName,
  };
}

/**
 * Strict Dual-Signature Validation Gate (AND && ONLY — NEVER OR ||)
 * Ensures both Preparer and Approver signatures are saved, intact, and valid
 * before final approval can proceed.
 */
export function evaluateDualSignatureApproval(
  report: MonthlyReportFull,
  user: AuthUser | null,
  options?: {
    savingTarget?: 'preparer' | 'approver' | null;
    hasUnsavedSignatureChanges?: boolean;
  }
): DualSignatureApprovalEvaluation {
  const preparer = validateSingleSignature({
    role: 'preparer',
    signatureImage: report.preparerSignatureImage,
    signatureStatus: report.preparerSignatureStatus ?? 'valid',
    ownerName: report.preparerName,
    signedAt: report.preparerSignedAt ?? report.preparedAt ?? null,
    signedByName: report.preparerSignedByName ?? null,
    isSaving: options?.savingTarget === 'preparer',
  });

  const effectiveApproverOwner =
    (report.approverName || '').trim() ||
    (report.approverSignedByName || '').trim() ||
    (user && (user.role === USER_ROLES.ADMIN || user.role === USER_ROLES.APPROVER)
      ? user.fullName
      : '');

  const approver = validateSingleSignature({
    role: 'approver',
    signatureImage: report.approverSignatureImage,
    signatureStatus: report.approverSignatureStatus ?? 'valid',
    ownerName: effectiveApproverOwner,
    signedAt: report.approverSignedAt ?? report.approvedAt ?? null,
    signedByName: report.approverSignedByName ?? null,
    isSaving: options?.savingTarget === 'approver',
  });

  const hasValidPreparerSignature = preparer.isValid && !options?.hasUnsavedSignatureChanges;
  const hasValidApproverSignature = approver.isValid && !options?.hasUnsavedSignatureChanges;
  const hasBothSignatures = hasValidPreparerSignature && hasValidApproverSignature;

  const userHasApprovalPermission =
    !!user && (user.role === USER_ROLES.ADMIN || user.role === USER_ROLES.APPROVER);

  const isStatusApprovable =
    report.status === REPORT_STATUSES.PENDING_APPROVAL ||
    report.status === REPORT_STATUSES.READY_FOR_REVIEW ||
    report.status === REPORT_STATUSES.UNDER_REVIEW;

  const reportMeetsApprovalRequirements =
    isStatusApprovable &&
    !!report.preparerName.trim() &&
    !!effectiveApproverOwner.trim();

  // Strict logical AND: NEVER allow approval if either signature is missing/invalid/saving
  const canApproveReport =
    hasValidPreparerSignature &&
    hasValidApproverSignature &&
    userHasApprovalPermission &&
    reportMeetsApprovalRequirements;

  const blockingReasons: string[] = [];
  if (!hasValidPreparerSignature) {
    blockingReasons.push(preparer.reason || 'توقيع معد التقرير غير مكتمل');
  }
  if (!hasValidApproverSignature) {
    blockingReasons.push(approver.reason || 'توقيع معتمد التقرير غير مكتمل');
  }
  if (!isStatusApprovable) {
    blockingReasons.push(
      report.status === REPORT_STATUSES.APPROVED || report.status === REPORT_STATUSES.ARCHIVED
        ? 'التقرير معتمد مسبقاً'
        : 'يجب إرسال التقرير إلى مرحلة «بانتظار الاعتماد» أولاً'
    );
  }
  if (!userHasApprovalPermission) {
    blockingReasons.push('الحساب الحالي لا يملك صلاحية الاعتماد النهائي');
  }

  return {
    preparer,
    approver,
    hasValidPreparerSignature,
    hasValidApproverSignature,
    hasBothSignatures,
    userHasApprovalPermission,
    isStatusApprovable,
    reportMeetsApprovalRequirements,
    canApproveReport,
    blockingReasons,
  };
}
