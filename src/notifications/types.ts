import type { ReportStatus, UserRole } from '../types/report.ts';
import type { ReportValidationResult } from '../services/ReportValidationService.ts';

export type NotificationCategory = 'success' | 'error' | 'warning' | 'info';

export type NotificationContextKey =
  | 'approval'
  | 'draft_created'
  | 'saved'
  | 'submitted'
  | 'returned'
  | 'revision'
  | 'maintenance'
  | 'contracts'
  | 'logistics'
  | 'security'
  | 'safety'
  | 'print'
  | 'excel'
  | 'archive'
  | 'auth'
  | 'admin'
  | 'analytics'
  | 'delete'
  | 'unsaved'
  | 'validation'
  | 'network';

export interface NotificationNavigationTarget {
  reportId?: string;
  tab?: 'report' | 'drafts' | 'archive' | 'analytics';
  sectionId?: string;
}

export interface NotificationAction {
  label: string;
  onClick: () => void | Promise<void>;
}

export interface NotifyOptions {
  type: NotificationCategory;
  title: string;
  message?: string;
  context?: NotificationContextKey;
  dedupeKey?: string;
  durationMs?: number;
  persistent?: boolean;
  action?: NotificationAction;
  details?: string;
  errorCode?: string;
  /** If true, adds this notification to the Notification Center history */
  recordInHistory?: boolean;
  target?: NotificationNavigationTarget;
  reportNumber?: string;
  allowedRoles?: UserRole[];
}

export interface ToastItem {
  id: string;
  type: NotificationCategory;
  title: string;
  message?: string;
  context?: NotificationContextKey;
  createdAt: string;
  durationMs: number;
  persistent: boolean;
  action?: NotificationAction;
  details?: string;
  errorCode?: string;
  target?: NotificationNavigationTarget;
}

export interface NotificationHistoryItem {
  id: string;
  type: NotificationCategory;
  title: string;
  message?: string;
  context: NotificationContextKey;
  createdAt: string;
  read: boolean;
  reportNumber?: string;
  errorCode?: string;
  target?: NotificationNavigationTarget;
  allowedRoles?: UserRole[];
}

export type ConfirmTone = 'primary' | 'danger' | 'success' | 'warning';

export interface ConfirmDialogOptions {
  title: string;
  titleEn?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  context?: NotificationContextKey;
  targetLabel?: string;
  details?: string[];
  onConfirmAsync?: () => Promise<void>;
}

export interface AlertSignatureStatusItem {
  label: string;
  statusText: string;
  passed: boolean;
  reason?: string;
}

export interface AlertDialogOptions {
  type: NotificationCategory;
  title: string;
  titleEn?: string;
  message: string;
  context?: NotificationContextKey;
  confirmLabel?: string;
  errorCode?: string;
  details?: string;
  iconType?: 'default' | 'signature';
  signatureChecklist?: AlertSignatureStatusItem[];
  primaryActionLabel?: string;
  onPrimaryAction?: () => void | Promise<void>;
  target?: NotificationNavigationTarget;
}

export interface ApprovalDialogChecklistItem {
  label: string;
  passed: boolean;
  detail?: string;
  sectionId?: string;
}

export interface ApprovalDialogPayload {
  reportId: string;
  reportNumber: string;
  month: number;
  year: number;
  department: string;
  preparerName: string;
  preparerTitle: string;
  preparerSignatureImage?: string | null;
  preparerSignedAt?: string | null;
  reviewerName: string;
  approverName: string;
  approverTitle: string;
  approverSignatureImage?: string | null;
  approverSignedAt?: string | null;
  status: ReportStatus;
  currentVersion: number;
  hasApproverPermission: boolean;
  isDirty: boolean;
  checklist: ApprovalDialogChecklistItem[];
  onApprove: (comment: string) => Promise<void>;
  onJumpToSection?: (sectionId: string) => void;
  onOpenAuthModal?: () => void;
}

export type UnsavedChangesChoice = 'save' | 'discard' | 'stay';

export interface UnsavedChangesDialogOptions {
  reportNumber?: string;
  targetDescription?: string;
  canSave?: boolean;
}

export interface MissingDataDialogOptions {
  reportNumber: string;
  month: number;
  year: number;
  attemptedActionLabel: string;
  validation: ReportValidationResult;
  onNavigateToField: (sectionId: string, fieldId: string) => void;
}
