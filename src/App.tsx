import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, api, onApiUnauthorized } from './api/client.ts';
import { AnalyticsTab } from './components/AnalyticsTab.tsx';
import { ApprovedArchiveTab } from './components/ApprovedArchiveTab.tsx';
import { CorporateFooter } from './components/CorporateFooter.tsx';
import { DraftReportsTab } from './components/DraftReportsTab.tsx';
import { ExecutiveHeroHeader, ReportSilverInfoStrip } from './components/ExecutiveHeroHeader.tsx';
import type { AppTab } from './components/ExecutiveHeroHeader.tsx';
import { ExecutivePreviewModal } from './components/ExecutivePreviewModal.tsx';
import { ExecutiveSidebar } from './components/ExecutiveSidebar.tsx';
import { MonthlyReportTab } from './components/MonthlyReportTab.tsx';
import {
  AdminSettingsModal,
  AuditHistoryModal,
  type AuditHistoryReportMeta,
  AuthModal,
  NewReportModal,
  PostApprovalEditConfirmModal,
  type PostApprovalEditTarget,
  SitesCategoriesModal,
  WorkflowActionModal,
} from './components/ToastAndModals.tsx';
import { useNotification } from './notifications/NotificationProvider.tsx';
import type { NotificationNavigationTarget } from './notifications/types.ts';
import {
  exportReportExcel,
  exportReportPdf,
} from './services/ReportExportService.ts';
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
} from './types/report.ts';
import { DEFAULT_THRESHOLDS, REPORT_STATUSES, USER_ROLES } from './types/report.ts';
import { formatDateTimeWestern, getMonthNameAr, syncReceptionServiceWithSecurity } from './utils/calculations.ts';
import { evaluateDualSignatureApproval } from './utils/signatureValidation.ts';
import {
  STAGE_ACTION_LABELS_AR,
  validateReportCompleteness,
} from './services/ReportValidationService.ts';

export default function App() {
  const {
    notify,
    notifySuccess,
    notifyError,
    notifyWarning,
    notifyInfo,
    alertDialog,
    approvalDialog,
    unsavedChangesDialog,
    missingDataDialog,
    setNavigationHandler,
  } = useNotification();

  const [activeTab, setActiveTab] = useState<AppTab>('report');
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [sites, setSites] = useState<MaintenanceSite[]>([]);
  const [categories, setCategories] = useState<MaintenanceCategory[]>([]);
  const [thresholds, setThresholds] = useState<PerformanceThresholds>(DEFAULT_THRESHOLDS);
  const [reportsList, setReportsList] = useState<ReportListSummary[]>([]);

  const [activeReport, setActiveReport] = useState<MonthlyReportFull | null>(null);
  const [history, setHistory] = useState<{
    approvals: ApprovalRecord[];
    auditLogs: AuditLogEntry[];
    versions: ReportVersionSummary[];
  }>({ approvals: [], auditLogs: [], versions: [] });

  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingSignatureTarget, setSavingSignatureTarget] = useState<'preparer' | 'approver' | null>(null);
  const [exportingPdfKey, setExportingPdfKey] = useState<string | null>(null);
  const [exportingExcelKey, setExportingExcelKey] = useState<string | null>(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Modals
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [newReportModalOpen, setNewReportModalOpen] = useState(false);
  const [sitesModalOpen, setSitesModalOpen] = useState(false);
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [historyModalReport, setHistoryModalReport] = useState<AuditHistoryReportMeta | null>(null);
  const [postApprovalConfirmTarget, setPostApprovalConfirmTarget] = useState<PostApprovalEditTarget | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [snapshotPreview, setSnapshotPreview] = useState<{
    report: MonthlyReportFull;
    sites: MaintenanceSite[];
    categories: MaintenanceCategory[];
    thresholds: PerformanceThresholds;
    versionNumber: number | null;
  } | null>(null);

  const [workflowAction, setWorkflowAction] = useState<
    | 'submit_review'
    | 'start_review'
    | 'return_revision'
    | 'forward_approval'
    | 'approve'
    | 'archive'
    | 'create_revision'
    | 'cancel_revision'
    | null
  >(null);
  const [workflowTargetReport, setWorkflowTargetReport] = useState<{
    id: string;
    reportNumber: string;
  } | null>(null);

  const sessionWarnShownRef = useRef(false);
  const highlightTimeoutRef = useRef<number | null>(null);

  const scrollToSection = useCallback((sectionId: string) => {
    setTimeout(() => {
      const el = document.getElementById(sectionId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 80);
  }, []);

  const navigateToField = useCallback((sectionId: string, fieldId: string) => {
    setActiveTab('report');
    window.setTimeout(() => {
      const previous = document.querySelectorAll('.saaed-field-highlight');
      previous.forEach((node) => node.classList.remove('saaed-field-highlight'));

      const candidates: HTMLElement[] = [];
      const byId = document.getElementById(fieldId);
      if (byId) candidates.push(byId);
      document
        .querySelectorAll<HTMLElement>(`[data-field-id="${CSS.escape(fieldId)}"]`)
        .forEach((el) => {
          if (!candidates.includes(el)) candidates.push(el);
        });

      const visibleTarget =
        candidates.find((el) => el.offsetParent !== null) ||
        candidates[0] ||
        document.getElementById(sectionId);

      if (!visibleTarget) return;

      visibleTarget.scrollIntoView({ behavior: 'smooth', block: 'center' });
      visibleTarget.classList.add('saaed-field-highlight');

      if (highlightTimeoutRef.current !== null) {
        window.clearTimeout(highlightTimeoutRef.current);
      }
      highlightTimeoutRef.current = window.setTimeout(() => {
        visibleTarget.classList.remove('saaed-field-highlight');
      }, 3200);

      // Focus editable element or primary action button inside container
      if (
        (visibleTarget instanceof HTMLInputElement ||
          visibleTarget instanceof HTMLTextAreaElement ||
          visibleTarget instanceof HTMLSelectElement ||
          visibleTarget instanceof HTMLButtonElement) &&
        !visibleTarget.disabled
      ) {
        visibleTarget.focus({ preventScroll: true });
      } else {
        const innerInteractive = visibleTarget.querySelector<HTMLElement>(
          'input:not(:disabled), textarea:not(:disabled), select:not(:disabled), button:not(:disabled)'
        );
        innerInteractive?.focus({ preventScroll: true });
      }
    }, 110);
  }, []);

  const loadReportDetails = useCallback(
    async (id: string) => {
      try {
        const res = await api.getReport(id);
        const normalizedReport =
          res.report.status === REPORT_STATUSES.DRAFT
            ? syncReceptionServiceWithSecurity(res.report)
            : res.report;
        setActiveReport(normalizedReport);
        setHistory(res.history);
        setDirty(false);
      } catch (err) {
        notifyError('تعذر تحميل التقرير', err instanceof Error ? err.message : '', {
          dedupeKey: `load_report_err_${id}`,
          context: 'network',
          errorCode: 'ERR-LOAD-REP',
          recordInHistory: true,
        });
      }
    },
    [notifyError]
  );

  const refreshBootstrap = useCallback(
    async (selectId?: string) => {
      try {
        const boot = await api.bootstrap();
        setUser(boot.user);
        setSites(boot.sites);
        setCategories(boot.categories);
        setThresholds(boot.thresholds);
        setReportsList(boot.reports);

        const targetId = selectId || activeReport?.id || boot.reports[0]?.id;
        if (targetId) {
          await loadReportDetails(targetId);
        }
      } catch (err) {
        notifyError('خطأ في الاتصال بالخادم', err instanceof Error ? err.message : 'تعذر جلب البيانات الأولية.', {
          dedupeKey: 'bootstrap_err',
          context: 'network',
          errorCode: 'ERR-BOOT',
          recordInHistory: true,
          action: {
            label: 'إعادة المحاولة',
            onClick: () => refreshBootstrap(selectId),
          },
        });
      } finally {
        setLoading(false);
      }
    },
    [activeReport?.id, loadReportDetails, notifyError]
  );

  useEffect(() => {
    refreshBootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return onApiUnauthorized(() => {
      setUser(null);
      setWorkflowAction(null);
      setAuthModalOpen(true);
      if (!sessionWarnShownRef.current) {
        sessionWarnShownRef.current = true;
        notifyWarning(
          'انتهت جلسة المستخدم',
          'يرجى إعادة تسجيل الدخول بحسابك المؤسسي لاستكمال الإجراءات وحفظ التعديلات.',
          {
            dedupeKey: 'session_expired',
            context: 'auth',
            recordInHistory: true,
          }
        );
        setTimeout(() => {
          sessionWarnShownRef.current = false;
        }, 4000);
      }
    });
  }, [notifyWarning]);

  useEffect(() => {
    if (!dirty) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [dirty]);

  const approvedCount = useMemo(
    () =>
      reportsList.filter(
        (r) =>
          r.status === REPORT_STATUSES.APPROVED ||
          r.status === REPORT_STATUSES.ARCHIVED ||
          (r.latestApprovedVersion ?? 0) > 0
      ).length,
    [reportsList]
  );

  const draftCount = useMemo(
    () =>
      reportsList.filter(
        (r) => r.status !== REPORT_STATUSES.APPROVED && r.status !== REPORT_STATUSES.ARCHIVED
      ).length,
    [reportsList]
  );

  const handleSaveReport = useCallback(async (): Promise<boolean> => {
    if (!activeReport) return false;
    setSaving(true);
    try {
      const res = await api.saveReport(activeReport.id, {
        ...activeReport,
        expectedLockVersion: activeReport.lockVersion,
      });
      setActiveReport(res.report);
      setHistory(res.history);
      setDirty(false);
      const listRes = await api.listReports();
      setReportsList(listRes.reports);
      notifySuccess(
        res.report.isPostApprovalRevision ? 'تم حفظ التعديلات بنجاح' : 'تم حفظ التقرير بنجاح',
        `تم تحديث بيانات التقرير ${res.report.reportNumber} (${formatDateTimeWestern(res.report.updatedAt)}).`,
        {
          dedupeKey: `save_ok_${res.report.id}`,
          context: 'saved',
          recordInHistory: true,
          reportNumber: res.report.reportNumber,
          target: { tab: 'report', reportId: res.report.id },
        }
      );
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        notifyError(
          'تعارض في الحفظ المتزامن',
          err.message || 'تم حفظ تعديلات أحدث على هذا التقرير قبل حفظ تغييراتك.',
          {
            dedupeKey: `save_conflict_${activeReport.id}`,
            context: 'validation',
            errorCode: 'ERR-CONFLICT',
            recordInHistory: true,
            reportNumber: activeReport.reportNumber,
            action: {
              label: 'تحديث أحدث نسخة',
              onClick: () => {
                void loadReportDetails(activeReport.id);
              },
            },
          }
        );
        return false;
      }
      if (err instanceof ApiError && err.status === 403) {
        notifyError(
          'ليس لديك صلاحية تعديل هذا التقرير المعتمد',
          err.message || 'صلاحية التعديل مقتصرة على معد التقرير الأصلي أو مدير النظام.',
          {
            dedupeKey: `save_forbidden_${activeReport.id}`,
            context: 'auth',
            errorCode: 'ERR-RBAC-403',
            recordInHistory: true,
            reportNumber: activeReport.reportNumber,
          }
        );
        return false;
      }
      notifyError(
        'فشل حفظ البيانات',
        err instanceof Error ? err.message : 'تحقق من صحة المدخلات وصلاحياتك. التعديلات ما زالت محفوظة في الصفحة.',
        {
          dedupeKey: 'save_err',
          context: 'network',
          errorCode: 'ERR-SAVE',
          recordInHistory: true,
          reportNumber: activeReport.reportNumber,
        }
      );
      return false;
    } finally {
      setSaving(false);
    }
  }, [activeReport, loadReportDetails, notifyError, notifySuccess]);

  const switchReportSafely = useCallback(
    async (id: string, switchToReportTab = false) => {
      if (id === activeReport?.id) {
        if (switchToReportTab) setActiveTab('report');
        return;
      }

      if (dirty) {
        const targetMeta = reportsList.find((r) => r.id === id);
        const choice = await unsavedChangesDialog({
          reportNumber: activeReport?.reportNumber,
          targetDescription: targetMeta
            ? `الانتقال إلى تقرير ${getMonthNameAr(targetMeta.month)} ${targetMeta.year}`
            : 'الانتقال إلى التقرير المحدد',
          canSave: !!user && activeReport?.status !== REPORT_STATUSES.APPROVED,
        });

        if (choice === 'stay') return;
        if (choice === 'save') {
          const savedOk = await handleSaveReport();
          if (!savedOk) return;
        }
      }

      await loadReportDetails(id);
      if (switchToReportTab) setActiveTab('report');
    },
    [activeReport?.id, activeReport?.reportNumber, activeReport?.status, dirty, handleSaveReport, loadReportDetails, reportsList, unsavedChangesDialog, user]
  );

  useEffect(() => {
    setNavigationHandler((target: NotificationNavigationTarget) => {
      if (target.tab && target.tab !== 'report') {
        setActiveTab(target.tab);
      }
      if (target.reportId && target.reportId !== activeReport?.id) {
        switchReportSafely(target.reportId, target.tab === 'report' || !target.tab).then(() => {
          if (target.sectionId) scrollToSection(target.sectionId);
        });
      } else {
        if (target.tab === 'report' || target.sectionId) setActiveTab('report');
        if (target.sectionId) scrollToSection(target.sectionId);
      }
    });
    return () => setNavigationHandler(null);
  }, [activeReport?.id, scrollToSection, setNavigationHandler, switchReportSafely]);

  const handleSelectReport = (id: string) => {
    void switchReportSafely(id, false);
  };

  const handleSaveSignature = async (target: 'preparer' | 'approver', signatureImage: string | null) => {
    if (!activeReport) return;
    setSavingSignatureTarget(target);
    try {
      // Persist any unsaved draft field edits before backend completeness check on signature save
      if (
        signatureImage !== null &&
        dirty &&
        user &&
        (user.role === USER_ROLES.ADMIN ||
          (user.role === USER_ROLES.PREPARER && activeReport.status === REPORT_STATUSES.DRAFT))
      ) {
        const savedDraft = await api.saveReport(activeReport.id, activeReport);
        setActiveReport(savedDraft.report);
        setHistory(savedDraft.history);
        setDirty(false);
      }

      const res = await api.saveSignature(activeReport.id, target, signatureImage);
      setActiveReport((prev) => {
        if (!prev || prev.id !== res.report.id) return res.report;
        return {
          ...prev,
          preparerSignatureImage: res.report.preparerSignatureImage,
          preparerSignedAt: res.report.preparerSignedAt,
          preparerSignedById: res.report.preparerSignedById,
          preparerSignedByName: res.report.preparerSignedByName,
          preparerSignatureStatus: res.report.preparerSignatureStatus,
          approverSignatureImage: res.report.approverSignatureImage,
          approverSignedAt: res.report.approverSignedAt,
          approverSignedById: res.report.approverSignedById,
          approverSignedByName: res.report.approverSignedByName,
          approverSignatureStatus: res.report.approverSignatureStatus,
          approverName: res.report.approverName || prev.approverName,
          approverTitle: res.report.approverTitle || prev.approverTitle,
          updatedAt: res.report.updatedAt,
        };
      });
      setHistory(res.history);
      notifySuccess(
        signatureImage ? 'تم حفظ التوقيع الرسمي' : 'تم حذف التوقيع الرسمي',
        target === 'preparer'
          ? 'تم تحديث التوقيع المرئي لمعد التقرير وتوثيقه في سجل التدقيق.'
          : 'تم تحديث التوقيع المرئي للاعتماد الرسمي وتوثيقه في سجل التدقيق.',
        {
          context: 'approval',
          recordInHistory: true,
          reportNumber: activeReport.reportNumber,
          target: { tab: 'report', reportId: activeReport.id, sectionId: 'sec-approval' },
        }
      );
    } catch (err) {
      notifyError(
        'تعذر حفظ التوقيع',
        err instanceof Error ? err.message : 'تحقق من صلاحياتك وحالة التقرير.',
        {
          context: 'approval',
          errorCode: 'ERR-SIG',
          recordInHistory: true,
        }
      );
      throw err;
    } finally {
      setSavingSignatureTarget(null);
    }
  };

  const handleSaveDate = async (target: 'preparedAt' | 'approvedAt', dateValue: string | null) => {
    if (!activeReport) return;
    try {
      const res = await api.saveDate(activeReport.id, target, dateValue);
      setActiveReport((prev) => {
        if (!prev || prev.id !== res.report.id) return res.report;
        return {
          ...prev,
          preparedAt: res.report.preparedAt,
          approvedAt: res.report.approvedAt,
          updatedAt: res.report.updatedAt,
        };
      });
      setHistory(res.history);
      notifySuccess(
        target === 'preparedAt' ? 'تم حفظ تاريخ التقديم' : 'تم حفظ تاريخ الاعتماد',
        'تم تحديث التاريخ وتوثيقه في سجل التدقيق.',
        { context: 'saved', reportNumber: activeReport.reportNumber }
      );
    } catch (err) {
      notifyError(
        'تعذر حفظ التاريخ',
        err instanceof Error ? err.message : 'تحقق من صلاحياتك وحالة التقرير.',
        { context: 'validation', errorCode: 'ERR-DATE' }
      );
    }
  };

  const handleCreateReport = async (year: number, month: number, department: string) => {
    try {
      const res = await api.createReport({ year, month, department });
      const listRes = await api.listReports();
      setReportsList(listRes.reports);
      await loadReportDetails(res.report.id);
      setActiveTab('report');
      notifySuccess(
        'تم إنشاء التقرير الشهري الجديد',
        `تم فتح مسودة مستقلة برقم ${res.report.reportNumber} (${getMonthNameAr(month)} ${year}).`,
        {
          dedupeKey: `create_rep_${res.report.id}`,
          context: 'draft_created',
          recordInHistory: true,
          reportNumber: res.report.reportNumber,
          target: { tab: 'report', reportId: res.report.id },
        }
      );
    } catch (err) {
      notifyError('تعذر إنشاء التقرير', err instanceof Error ? err.message : '', {
        context: 'validation',
        errorCode: 'ERR-CREATE',
      });
      throw err;
    }
  };

  const executeWorkflowTransition = async (
    action:
      | 'submit_review'
      | 'start_review'
      | 'return_revision'
      | 'forward_approval'
      | 'approve'
      | 'archive'
      | 'create_revision'
      | 'cancel_revision',
    comment: string,
    overrideReportId?: string
  ) => {
    const targetId = overrideReportId || activeReport?.id;
    if (!targetId) return;
    const isTargetActive = activeReport?.id === targetId;
    const wasPostApprovalRevision = isTargetActive ? activeReport.isPostApprovalRevision : false;

    try {
      if (
        isTargetActive &&
        activeReport &&
        dirty &&
        (action === 'submit_review' ||
          (action === 'approve' &&
            (activeReport.status === REPORT_STATUSES.DRAFT || user?.role === 'admin')))
      ) {
        await api.saveReport(activeReport.id, {
          ...activeReport,
          expectedLockVersion: activeReport.lockVersion,
        });
      }
      const res = await api.workflowAction(
        targetId,
        action,
        comment,
        isTargetActive ? activeReport?.approverName : undefined,
        isTargetActive ? activeReport?.approverTitle : undefined,
        action === 'create_revision' && isTargetActive ? activeReport?.currentVersion : undefined
      );
      if (isTargetActive || !activeReport) {
        setActiveReport(res.report);
        setDirty(false);
      }
      setHistory(res.history);
      if (historyModalReport?.id === targetId) {
        setHistoryModalReport(res.report);
      }
      const listRes = await api.listReports();
      setReportsList(listRes.reports);

      const approveTitle = wasPostApprovalRevision
        ? 'تم اعتماد الإصدار الجديد بنجاح'
        : 'تم اعتماد التقرير الشهري رسمياً';

      const successMeta: Record<string, { title: string; context: 'submitted' | 'returned' | 'approval' | 'archive' | 'revision' }> = {
        submit_review: { title: 'تم إرسال التقرير للاعتماد بنجاح', context: 'submitted' },
        start_review: { title: 'تم بدء مرحلة المراجعة', context: 'submitted' },
        forward_approval: { title: 'اكتملت المراجعة ورُفع للاعتماد', context: 'approval' },
        return_revision: { title: 'تم إرجاع التقرير إلى مسودة للتعديل', context: 'returned' },
        approve: { title: approveTitle, context: 'approval' },
        archive: { title: 'تمت أرشفة التقرير في السجل الدائم', context: 'archive' },
        create_revision: { title: 'تم فتح إصدار جديد للتعديل بعد الاعتماد', context: 'revision' },
        cancel_revision: { title: 'تم إلغاء مسودة التعديل واستعادة النسخة المعتمدة', context: 'returned' },
      };
      const meta = successMeta[action] || { title: 'تم تنفيذ الإجراء', context: 'approval' as const };
      notifySuccess(
        meta.title,
        `رقم التقرير: ${res.report.reportNumber} · الإصدار v${res.report.currentVersion}${
          action === 'approve' ? ` · المعتمد: ${res.report.approverName}` : ''
        }`,
        {
          dedupeKey: `wf_${action}_${res.report.id}_v${res.report.currentVersion}`,
          context: meta.context,
          recordInHistory: true,
          reportNumber: res.report.reportNumber,
          target: {
            tab: action === 'approve' || action === 'archive' ? 'archive' : 'report',
            reportId: res.report.id,
          },
        }
      );
    } catch (err) {
      notifyError(
        err instanceof ApiError && err.status === 403
          ? 'ليس لديك صلاحية تعديل هذا التقرير المعتمد'
          : 'تعذر تنفيذ إجراء الاعتماد',
        err instanceof Error ? err.message : '',
        {
          context: 'approval',
          errorCode: `ERR-WF-${action.toUpperCase()}`,
          recordInHistory: true,
          reportNumber: activeReport?.reportNumber,
        }
      );
      throw err;
    }
  };

  const handleWorkflowConfirm = async (comment: string) => {
    if (!workflowAction) return;
    await executeWorkflowTransition(workflowAction, comment, workflowTargetReport?.id);
  };

  const handleConfirmPostApprovalEdit = async (reason: string) => {
    const target = postApprovalConfirmTarget;
    if (!target) return;
    try {
      const res = await api.workflowAction(
        target.id,
        'create_revision',
        reason,
        undefined,
        undefined,
        target.currentVersion
      );
      setActiveReport(res.report);
      setHistory(res.history);
      setHistoryModalReport(res.report);
      setDirty(false);
      const listRes = await api.listReports();
      setReportsList(listRes.reports);
      setPostApprovalConfirmTarget(null);
      setHistoryModalOpen(false);
      setActiveTab('report');
      notifySuccess(
        'تم فتح إصدار جديد لتعديل التقرير المعتمد',
        `رقم التقرير: ${res.report.reportNumber} · الإصدار الجديد v${res.report.currentVersion} (بقيت النسخة المعتمدة السابقة محفوظة في الأرشيف).`,
        {
          dedupeKey: `post_edit_open_${res.report.id}_v${res.report.currentVersion}`,
          context: 'revision',
          recordInHistory: true,
          reportNumber: res.report.reportNumber,
          target: { tab: 'report', reportId: res.report.id },
        }
      );
    } catch (err) {
      notifyError(
        err instanceof ApiError && err.status === 403
          ? 'ليس لديك صلاحية تعديل هذا التقرير المعتمد'
          : 'تعذر فتح تعديل التقرير المعتمد',
        err instanceof Error ? err.message : '',
        {
          context: 'revision',
          errorCode: 'ERR-POST-EDIT',
          recordInHistory: true,
          reportNumber: target.reportNumber,
        }
      );
      throw err;
    }
  };

  const handleLinkPreparerOwnership = async (reportId: string, preparerId: string) => {
    try {
      const res = await api.linkPreparerOwnership(reportId, preparerId);
      setHistory(res.history);
      setHistoryModalReport(res.report);
      if (activeReport?.id === reportId) {
        setActiveReport(res.report);
      }
      const listRes = await api.listReports();
      setReportsList(listRes.reports);
      notifySuccess(
        'تم ربط معرف معد التقرير بنجاح',
        `أصبح المستخدم المرتبط (${res.report.preparerName}) مخولاً لتحرير التقرير بعد الاعتماد.`,
        {
          context: 'admin',
          recordInHistory: true,
          reportNumber: res.report.reportNumber,
        }
      );
    } catch (err) {
      notifyError(
        'تعذر ربط معرف معد التقرير',
        err instanceof Error ? err.message : '',
        { context: 'admin', errorCode: 'ERR-LINK-UID' }
      );
      throw err;
    }
  };

  const openExecutiveApprovalFlow = () => {
    if (!activeReport) return;
    if (!user) {
      setAuthModalOpen(true);
      return;
    }

    const validation = validateReportCompleteness(activeReport, {
      stage: 'approve',
      sites,
      categories,
      user,
      savingTarget: savingSignatureTarget,
    });

    // Smart Missing Data & Dual Signature Gate BEFORE opening Executive Approval Confirmation
    if (!validation.isComplete) {
      notifyWarning(
        'لا يمكن إرسال الإصدار للاعتماد لوجود بيانات مطلوبة غير مكتملة',
        `يرجى استكمال الحقول الإلزامية في التقرير (${activeReport.reportNumber}) قبل المتابعة.`,
        {
          context: 'validation',
          reportNumber: activeReport.reportNumber,
        }
      );
      void missingDataDialog({
        reportNumber: activeReport.reportNumber,
        month: activeReport.month,
        year: activeReport.year,
        attemptedActionLabel: STAGE_ACTION_LABELS_AR.approve,
        validation,
        onNavigateToField: navigateToField,
      });
      return;
    }

    const dualEval = evaluateDualSignatureApproval(activeReport, user, {
      savingTarget: savingSignatureTarget,
    });

    if (!dualEval.hasValidPreparerSignature || !dualEval.hasValidApproverSignature) {
      notifyWarning(
        'يتطلب الاعتماد النهائي توقيع معد التقرير ومعتمد التقرير',
        'يرجى حفظ التوقيع الإلكتروني الجديد لمعد التقرير ومعتمد التقرير لإتمام الاعتماد.',
        {
          context: 'approval',
          reportNumber: activeReport.reportNumber,
        }
      );
      void alertDialog({
        type: 'warning',
        iconType: 'signature',
        title: 'تعذر اعتماد التقرير',
        titleEn: 'Report Approval Restricted',
        message:
          'يتطلب الاعتماد النهائي توقيع معد التقرير ومعتمد التقرير. يرجى إضافة التوقيعات المطلوبة للمتابعة.',
        context: 'approval',
        signatureChecklist: [
          {
            label: 'توقيع معد التقرير (Report Preparer Signature)',
            statusText: dualEval.preparer.labelAr,
            passed: dualEval.hasValidPreparerSignature,
            reason: dualEval.preparer.reason,
          },
          {
            label: 'توقيع معتمد التقرير (Report Approver Signature)',
            statusText: dualEval.approver.labelAr,
            passed: dualEval.hasValidApproverSignature,
            reason: dualEval.approver.reason,
          },
        ],
        confirmLabel: 'إغلاق',
        primaryActionLabel: 'الانتقال إلى التوقيعات',
        onPrimaryAction: () => {
          navigateToField('sec-approval', 'field-approver-signature-area');
        },
      });
      return;
    }

    const isPendingReady = dualEval.isStatusApprovable;
    const hasApproverPerm = dualEval.userHasApprovalPermission;

    void approvalDialog({
      reportId: activeReport.id,
      reportNumber: activeReport.reportNumber,
      month: activeReport.month,
      year: activeReport.year,
      department: activeReport.department,
      preparerName: activeReport.preparerName,
      preparerTitle: activeReport.preparerTitle,
      preparerSignatureImage: activeReport.preparerSignatureImage,
      preparerSignedAt: dualEval.preparer.signedAt,
      reviewerName: isPendingReady ? 'مراجع القسم' : '—',
      approverName: activeReport.approverName,
      approverTitle: activeReport.approverTitle,
      approverSignatureImage: activeReport.approverSignatureImage,
      approverSignedAt: dualEval.approver.signedAt,
      status: activeReport.status,
      currentVersion: activeReport.currentVersion,
      hasApproverPermission: hasApproverPerm,
      isDirty: dirty,
      checklist: [
        {
          label: 'توقيع معد التقرير الإلكتروني المحفوظ',
          passed: dualEval.hasValidPreparerSignature,
          detail: dualEval.hasValidPreparerSignature
            ? `${activeReport.preparerName}${dualEval.preparer.signedAt ? ` · ${formatDateTimeWestern(dualEval.preparer.signedAt)}` : ''}`
            : dualEval.preparer.reason || 'يجب حفظ توقيع معد التقرير',
          sectionId: 'sec-approval',
        },
        {
          label: 'توقيع معتمد التقرير الإلكتروني المحفوظ',
          passed: dualEval.hasValidApproverSignature,
          detail: dualEval.hasValidApproverSignature
            ? `${activeReport.approverName || user.fullName}${dualEval.approver.signedAt ? ` · ${formatDateTimeWestern(dualEval.approver.signedAt)}` : ''}`
            : dualEval.approver.reason || 'يجب حفظ توقيع معتمد التقرير',
          sectionId: 'sec-approval',
        },
        {
          label: 'اكتمال مرحلة الإرسال إلى بانتظار الاعتماد',
          passed: isPendingReady,
          detail: isPendingReady
            ? 'التقرير جاهز في مرحلة بانتظار الاعتماد التنفيذي'
            : 'التقرير ما زال في حالة مسودة؛ يرجى إرساله للاعتماد أولاً من بطاقة الإعداد',
          sectionId: 'sec-approval',
        },
        {
          label: 'اكتمال بيانات معد التقرير والمعتمد',
          passed: !!activeReport.preparerName.trim() && !!(activeReport.approverName.trim() || user.fullName),
          detail: activeReport.preparerName.trim()
            ? `المعد: ${activeReport.preparerName} · المعتمد: ${activeReport.approverName || user.fullName}`
            : 'يجب إدخال اسم معد التقرير قبل الاعتماد',
          sectionId: 'sec-approval',
        },
      ],
      onApprove: (comment) => executeWorkflowTransition('approve', comment),
      onJumpToSection: (sectionId) => {
        setActiveTab('report');
        scrollToSection(sectionId);
      },
      onOpenAuthModal: () => setAuthModalOpen(true),
    });
  };

  const handleTriggerWorkflow = (
    action:
      | 'submit_review'
      | 'start_review'
      | 'return_revision'
      | 'forward_approval'
      | 'approve'
      | 'archive'
      | 'create_revision'
      | 'cancel_revision'
  ) => {
    if (!user) {
      setAuthModalOpen(true);
      return;
    }

    if (
      activeReport &&
      (action === 'submit_review' || action === 'start_review' || action === 'forward_approval')
    ) {
      const validation = validateReportCompleteness(activeReport, {
        stage: action,
        sites,
        categories,
        user,
        savingTarget: savingSignatureTarget,
      });
      if (!validation.isComplete) {
        notifyWarning(
          'لا يمكن إرسال الإصدار للاعتماد لوجود بيانات مطلوبة غير مكتملة',
          `يرجى استكمال الحقول الإلزامية في التقرير (${activeReport.reportNumber}) قبل المتابعة.`,
          {
            context: 'validation',
            reportNumber: activeReport.reportNumber,
          }
        );
        void missingDataDialog({
          reportNumber: activeReport.reportNumber,
          month: activeReport.month,
          year: activeReport.year,
          attemptedActionLabel: STAGE_ACTION_LABELS_AR[action],
          validation,
          onNavigateToField: navigateToField,
        });
        return;
      }
    }

    if (action === 'approve') {
      openExecutiveApprovalFlow();
      return;
    }

    if (action === 'create_revision' && activeReport) {
      setPostApprovalConfirmTarget({
        id: activeReport.id,
        reportNumber: activeReport.reportNumber,
        month: activeReport.month,
        year: activeReport.year,
        currentVersion: activeReport.currentVersion,
        preparerName: activeReport.preparerName,
      });
      return;
    }

    setWorkflowTargetReport(
      activeReport ? { id: activeReport.id, reportNumber: activeReport.reportNumber } : null
    );
    setWorkflowAction(action);
  };

  const handleExportPdf = async (
    reportId: string,
    versionNumber?: number,
    orientation: 'landscape' | 'portrait' = 'portrait'
  ) => {
    const key = `${reportId}_${versionNumber ?? 'live'}`;
    if (exportingPdfKey === key) return;
    setExportingPdfKey(key);
    notifyInfo(
      'جارٍ تجهيز التقرير الرسمي بكامل البطاقات والصور والجداول...',
      'يتم الآن إنشاء ملف PDF الرسمي متعدد الصفحات بدقة عالية.',
      {
        dedupeKey: `pdf_prep_${key}`,
        context: 'print',
      }
    );
    try {
      const modalMatchesTarget =
        snapshotPreview &&
        snapshotPreview.report.id === reportId &&
        (versionNumber == null || snapshotPreview.versionNumber === versionNumber);

      const liveData = modalMatchesTarget
        ? {
            report: snapshotPreview.report,
            sites: snapshotPreview.sites,
            categories: snapshotPreview.categories,
            thresholds: snapshotPreview.thresholds,
            snapshotVersion: snapshotPreview.versionNumber,
          }
        : activeReport && activeReport.id === reportId && versionNumber == null
          ? {
              report: activeReport,
              sites,
              categories,
              thresholds,
              snapshotVersion: null,
            }
          : undefined;

      const { filename, pageCount } = await exportReportPdf({
        reportId,
        versionNumber,
        orientation,
        liveData,
      });
      notifySuccess(
        'تم إنشاء وتنزيل ملف PDF الرسمي بنجاح.',
        `تم تنزيل المستند التنفيذي ${filename}${pageCount ? ` (${pageCount} صفحات A4)` : ''} شاملاً جميع البطاقات والصور والجداول والرسوم البيانية.`,
        {
          dedupeKey: `pdf_ok_${key}_${orientation}`,
          context: 'print',
          recordInHistory: true,
        }
      );
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : '';
      notifyError(
        'تعذر إتمام التصدير. يرجى مراجعة الخطأ والمحاولة مجدداً.',
        errMsg || 'تعذر إنشاء ملف PDF الرسمي.',
        {
          dedupeKey: `pdf_err_${reportId}`,
          context: 'print',
          errorCode: 'ERR-PDF',
          recordInHistory: true,
          action: {
            label: 'إعادة المحاولة',
            onClick: () => handleExportPdf(reportId, versionNumber, orientation),
          },
        }
      );
    } finally {
      setExportingPdfKey((prev) => (prev === key ? null : prev));
    }
  };

  const handleExportExcel = async (reportId: string, versionNumber?: number) => {
    const key = `${reportId}_${versionNumber ?? 'live'}`;
    if (exportingExcelKey === key) return;
    setExportingExcelKey(key);
    notifyInfo(
      'جارٍ تجهيز التقرير الرسمي بكامل البطاقات والصور والجداول...',
      'يتم الآن إنشاء مصنف Excel الرسمي شاملاً الصور والمعادلات.',
      {
        dedupeKey: `excel_prep_${key}`,
        context: 'excel',
      }
    );
    try {
      const liveData =
        snapshotPreview &&
        snapshotPreview.report.id === reportId &&
        versionNumber === snapshotPreview.versionNumber
          ? {
              report: snapshotPreview.report,
              sites: snapshotPreview.sites,
              categories: snapshotPreview.categories,
              thresholds: snapshotPreview.thresholds,
              snapshotVersion: snapshotPreview.versionNumber,
            }
          : activeReport && activeReport.id === reportId && versionNumber == null
            ? {
                report: activeReport,
                sites,
                categories,
                thresholds,
                snapshotVersion: null,
              }
            : undefined;

      const { filename } = await exportReportExcel({ reportId, versionNumber, liveData });
      notifySuccess(
        'تم إنشاء ملف Excel بنجاح.',
        `تم تنزيل المصنف الاحترافي ${filename} شاملاً كافة الأقسام الـ 12 والبطاقات والصور والمعادلات والرسوم.`,
        {
          dedupeKey: `excel_ok_${key}`,
          context: 'excel',
          recordInHistory: true,
        }
      );
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : '';
      notifyError(
        'تعذر إتمام التصدير. يرجى مراجعة الخطأ والمحاولة مجدداً.',
        errMsg || 'تعذر إنشاء ملف Excel الرسمي.',
        {
          dedupeKey: `excel_err_${reportId}`,
          context: 'excel',
          errorCode: 'ERR-XLSX',
          recordInHistory: true,
          action: {
            label: 'إعادة المحاولة',
            onClick: () => handleExportExcel(reportId, versionNumber),
          },
        }
      );
    } finally {
      setExportingExcelKey((prev) => (prev === key ? null : prev));
    }
  };

  const handleOpenSnapshotPreview = async (reportId: string, versionNumber: number) => {
    try {
      const res = await api.getReportVersionSnapshot(reportId, versionNumber);
      setSnapshotPreview({
        report: res.snapshot.report,
        sites: res.snapshot.sites,
        categories: res.snapshot.categories,
        thresholds: res.snapshot.thresholds,
        versionNumber,
      });
      setPreviewOpen(true);
    } catch {
      try {
        const rep = await api.getReport(reportId);
        setSnapshotPreview({
          report: rep.report,
          sites,
          categories,
          thresholds,
          versionNumber,
        });
        setPreviewOpen(true);
      } catch (err) {
        notifyError(
          'تعذر فتح معاينة التقرير',
          err instanceof Error ? err.message : '',
          { context: 'archive', errorCode: 'ERR-PREVIEW' }
        );
      }
    }
  };

  const handleDownloadJsonArchive = async (reportId: string, versionNumber: number) => {
    try {
      const res = await api.getReportVersionSnapshot(reportId, versionNumber);
      const blob = new Blob([JSON.stringify(res, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${res.snapshot.report.reportNumber}_v${versionNumber}_official.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      notifySuccess('تم تنزيل النسخة الأرشيفية الموثقة', res.snapshot.report.reportNumber, {
        context: 'archive',
        recordInHistory: true,
        reportNumber: res.snapshot.report.reportNumber,
      });
    } catch (err) {
      notifyError('تعذر تنزيل النسخة', err instanceof Error ? err.message : '', {
        context: 'archive',
        errorCode: 'ERR-ARCHIVE-DL',
      });
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#EEF3F9]">
      <div className="saaed-app-shell flex-1 flex flex-col">
      <ExecutiveHeroHeader
        activeTab={activeTab}
        onSelectTab={(tab) => setActiveTab(tab)}
        user={user}
        activeReport={activeReport}
        reportsList={reportsList}
        onSelectReport={handleSelectReport}
        onOpenNewReport={() => setNewReportModalOpen(true)}
        onOpenAuthModal={() => setAuthModalOpen(true)}
        onLogout={async () => {
          await api.logout();
          setUser(null);
          notifyInfo('تم تسجيل الخروج بنجاح', 'تم إنهاء الجلسة الحالية والعودة لوضع القراءة فقط.', {
            context: 'auth',
            dedupeKey: 'logout_ok',
          });
        }}
        onOpenAdminSettings={() => setAdminModalOpen(true)}
        approvedCount={approvedCount}
        onOpenMobileMenu={() => setMobileSidebarOpen(true)}
        onNavigateNotificationTarget={(target) => {
          if (target.tab) setActiveTab(target.tab);
          if (target.reportId && target.reportId !== activeReport?.id) {
            void switchReportSafely(target.reportId, target.tab === 'report' || !target.tab).then(() => {
              if (target.sectionId) scrollToSection(target.sectionId);
            });
          } else if (target.sectionId) {
            setActiveTab('report');
            scrollToSection(target.sectionId);
          }
        }}
      />

      {/* Shell Body: dir="rtl" places ExecutiveSidebar (first child) unconditionally on visual RIGHT edge */}
      <div
        dir="rtl"
        className="flex-1 flex items-stretch min-w-0 bg-[radial-gradient(ellipse_at_top,_#F7FAFF_0%,_#ECF2FA_55%,_#E2ECF7_100%)]"
      >
        <ExecutiveSidebar
          activeTab={activeTab}
          onSelectTab={(tab) => setActiveTab(tab)}
          approvedCount={approvedCount}
          draftCount={draftCount}
          mobileOpen={mobileSidebarOpen}
          onCloseMobile={() => setMobileSidebarOpen(false)}
        />

        <main className="relative flex-1 min-w-0 overflow-x-hidden">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-gradient-to-b from-[#1769AA]/[0.05] via-transparent to-transparent"
          />
          {loading ? (
            <div className="relative z-10 max-w-[1440px] mx-auto px-4 sm:px-6 py-8 space-y-4">
              <div className="h-14 bg-white rounded-xl border border-slate-200 animate-pulse" />
              <div className="h-40 bg-white rounded-xl border border-slate-200 animate-pulse" />
              <div className="h-72 bg-white rounded-xl border border-slate-200 animate-pulse" />
            </div>
          ) : activeTab === 'report' && activeReport ? (
            <div className="relative z-10 max-w-[1480px] mx-auto px-3 sm:px-5 lg:px-6 py-3.5 space-y-3.5">
              <ReportSilverInfoStrip
                activeReport={activeReport}
                reportsList={reportsList}
                onSelectReport={handleSelectReport}
                onOpenNewReport={() => setNewReportModalOpen(true)}
                canCreate={!!user && (user.role === 'admin' || user.role === 'preparer')}
              />
              <MonthlyReportTab
                report={activeReport}
                sites={sites}
                categories={categories}
                thresholds={thresholds}
                user={user}
                dirty={dirty}
                saving={saving}
                savingSignatureTarget={savingSignatureTarget}
                onChangeReport={(updater) => {
                  setActiveReport((prev) => (prev ? syncReceptionServiceWithSecurity(updater(prev)) : prev));
                  setDirty(true);
                }}
                onSave={async () => {
                  await handleSaveReport();
                }}
                onSaveSignature={handleSaveSignature}
                onSaveDate={handleSaveDate}
                onOpenPreview={() => {
                  setSnapshotPreview(null);
                  setPreviewOpen(true);
                }}
                onExportPdf={() => handleExportPdf(activeReport.id)}
                onExportExcel={() => handleExportExcel(activeReport.id)}
                exportingPdf={exportingPdfKey === `${activeReport.id}_live`}
                exportingExcel={exportingExcelKey === `${activeReport.id}_live`}
                onOpenHistory={() => {
                  setHistoryModalReport(activeReport);
                  setHistoryModalOpen(true);
                }}
                onOpenSitesModal={() => setSitesModalOpen(true)}
                onTriggerWorkflow={handleTriggerWorkflow}
                onOpenAuthModal={() => setAuthModalOpen(true)}
                onNavigateToField={navigateToField}
              />
            </div>
          ) : activeTab === 'drafts' ? (
            <DraftReportsTab
              reports={reportsList}
              activeReportId={activeReport?.id || null}
              canCreate={!!user && (user.role === 'admin' || user.role === 'preparer')}
              onOpenReport={(id) => {
                void switchReportSafely(id, true);
              }}
              onCreateNewReport={() => setNewReportModalOpen(true)}
              onPreviewReport={async (id) => {
                try {
                  const rep = await api.getReport(id);
                  setSnapshotPreview({
                    report: rep.report,
                    sites,
                    categories,
                    thresholds,
                    versionNumber: null,
                  });
                  setPreviewOpen(true);
                } catch (err) {
                  notifyError('تعذر فتح المعاينة', err instanceof Error ? err.message : '', {
                    context: 'print',
                  });
                }
              }}
              onViewHistory={async (id) => {
                try {
                  const res = await api.getReport(id);
                  setHistory(res.history);
                  setHistoryModalReport(res.report);
                  setHistoryModalOpen(true);
                } catch (err) {
                  notifyError('تعذر تحميل السجل', err instanceof Error ? err.message : '', {
                    context: 'archive',
                  });
                }
              }}
              onExportPdf={(id) => handleExportPdf(id)}
              onExportExcel={(id) => handleExportExcel(id)}
              exportingPdfId={exportingPdfKey?.endsWith('_live') ? exportingPdfKey.replace('_live', '') : null}
              exportingExcelId={exportingExcelKey?.endsWith('_live') ? exportingExcelKey.replace('_live', '') : null}
            />
          ) : activeTab === 'analytics' ? (
            <AnalyticsTab />
          ) : (
            <ApprovedArchiveTab
              reports={reportsList}
              onPreviewSnapshot={handleOpenSnapshotPreview}
              onViewHistory={async (id) => {
                try {
                  const res = await api.getReport(id);
                  setHistory(res.history);
                  setHistoryModalReport(res.report);
                  setHistoryModalOpen(true);
                } catch (err) {
                  notifyError('تعذر تحميل السجل', err instanceof Error ? err.message : '', {
                    context: 'archive',
                  });
                }
              }}
              onExportPdf={(id, ver) => handleExportPdf(id, ver)}
              onExportExcel={(id, ver) => handleExportExcel(id, ver)}
              exportingPdfKey={exportingPdfKey}
              exportingExcelKey={exportingExcelKey}
              onDownloadJson={handleDownloadJsonArchive}
            />
          )}
        </main>
      </div>

      <CorporateFooter />
      </div>

      <AuthModal
        open={authModalOpen}
        currentUser={user}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={(u) => {
          setUser(u);
          notifySuccess(`مرحباً ${u.fullName}`, `تم تسجيل الدخول بصلاحية: ${u.jobTitle}`, {
            dedupeKey: `login_${u.id}`,
            context: 'auth',
            recordInHistory: true,
          });
        }}
        onError={(msg) =>
          notifyError('تعذر تسجيل الدخول', msg, {
            dedupeKey: 'login_err',
            context: 'auth',
            errorCode: 'ERR-AUTH',
          })
        }
      />

      <NewReportModal
        open={newReportModalOpen}
        onClose={() => setNewReportModalOpen(false)}
        onCreate={handleCreateReport}
      />

      <WorkflowActionModal
        open={!!workflowAction}
        action={workflowAction}
        reportNumber={workflowTargetReport?.reportNumber || activeReport?.reportNumber || ''}
        user={user}
        onClose={() => {
          setWorkflowAction(null);
          setWorkflowTargetReport(null);
        }}
        onConfirm={handleWorkflowConfirm}
      />

      <PostApprovalEditConfirmModal
        open={!!postApprovalConfirmTarget}
        report={postApprovalConfirmTarget}
        currentUser={user}
        onClose={() => setPostApprovalConfirmTarget(null)}
        onConfirm={handleConfirmPostApprovalEdit}
      />

      <SitesCategoriesModal
        open={sitesModalOpen}
        sites={sites}
        categories={categories}
        onClose={() => setSitesModalOpen(false)}
        onAddSite={async (nameAr, nameEn) => {
          const res = await api.addSite(nameAr, nameEn);
          setSites(res.sites);
          notifySuccess('تمت إضافة المقر بنجاح', nameAr, {
            context: 'maintenance',
            recordInHistory: true,
          });
        }}
        onUpdateSite={async (id, payload) => {
          const res = await api.updateSite(id, payload);
          setSites(res.sites);
          notifySuccess('تم تحديث بيانات المقر', payload.nameAr || undefined, {
            context: 'maintenance',
          });
        }}
        onAddCategory={async (nameAr, nameEn) => {
          const res = await api.addCategory(nameAr, nameEn);
          setCategories(res.categories);
          notifySuccess('تمت إضافة فئة الصيانة بنجاح', nameAr, {
            context: 'maintenance',
            recordInHistory: true,
          });
        }}
      />

      <AdminSettingsModal
        open={adminModalOpen}
        thresholds={thresholds}
        onClose={() => setAdminModalOpen(false)}
        onSaveThresholds={async (t) => {
          try {
            const res = await api.updateThresholds(t);
            setThresholds(res.thresholds);
            notifySuccess('تم حفظ حدود تقييم الأداء', 'تم تحديث مؤشرات التصنيف المعتمدة بنجاح.', {
              context: 'admin',
              recordInHistory: true,
            });
          } catch (err) {
            notifyError('فشل حفظ الحدود', err instanceof Error ? err.message : '', {
              context: 'admin',
              errorCode: 'ERR-THRESH',
            });
          }
        }}
        onNotify={(t) =>
          notify({
            type: t.type,
            title: t.title,
            message: t.message,
            context: 'admin',
            recordInHistory: t.type === 'success' || t.type === 'error',
          })
        }
      />

      <AuditHistoryModal
        open={historyModalOpen}
        onClose={() => setHistoryModalOpen(false)}
        approvals={history.approvals}
        auditLogs={history.auditLogs}
        versions={history.versions}
        reportMeta={historyModalReport}
        currentUser={user}
        onLoadVersion={(ver) => {
          const targetId = historyModalReport?.id || activeReport?.id;
          if (targetId) {
            setHistoryModalOpen(false);
            handleOpenSnapshotPreview(targetId, ver);
          }
        }}
        onExportVersionExcel={(reportId, ver) => {
          void handleExportExcel(reportId, ver);
        }}
        onRequestPostApprovalEdit={() => {
          if (!historyModalReport) return;
          setPostApprovalConfirmTarget({
            id: historyModalReport.id,
            reportNumber: historyModalReport.reportNumber,
            month: historyModalReport.month,
            year: historyModalReport.year,
            currentVersion: historyModalReport.currentVersion,
            preparerName: historyModalReport.preparerName || '',
          });
        }}
        onOpenRevisionDraft={(reportId) => {
          setHistoryModalOpen(false);
          void switchReportSafely(reportId, true);
        }}
        onCancelPostApprovalRevision={(reportId) => {
          const targetNum = historyModalReport?.reportNumber || activeReport?.reportNumber || '';
          setWorkflowTargetReport({ id: reportId, reportNumber: targetNum });
          setWorkflowAction('cancel_revision');
        }}
        onLinkPreparer={handleLinkPreparerOwnership}
      />

      {(snapshotPreview || activeReport) && (
        <ExecutivePreviewModal
          open={previewOpen}
          report={snapshotPreview ? snapshotPreview.report : activeReport!}
          sites={snapshotPreview ? snapshotPreview.sites : sites}
          categories={snapshotPreview ? snapshotPreview.categories : categories}
          thresholds={snapshotPreview ? snapshotPreview.thresholds : thresholds}
          snapshotVersion={snapshotPreview ? snapshotPreview.versionNumber : null}
          onClose={() => {
            setPreviewOpen(false);
            setSnapshotPreview(null);
          }}
          onExportPdf={(orientation) =>
            handleExportPdf(
              snapshotPreview ? snapshotPreview.report.id : activeReport!.id,
              snapshotPreview?.versionNumber ?? undefined,
              orientation
            )
          }
          onExportExcel={() =>
            handleExportExcel(
              snapshotPreview ? snapshotPreview.report.id : activeReport!.id,
              snapshotPreview?.versionNumber ?? undefined
            )
          }
          exportingPdf={
            exportingPdfKey ===
            `${snapshotPreview ? snapshotPreview.report.id : activeReport!.id}_${snapshotPreview?.versionNumber ?? 'live'}`
          }
          exportingExcel={
            exportingExcelKey ===
            `${snapshotPreview ? snapshotPreview.report.id : activeReport!.id}_${snapshotPreview?.versionNumber ?? 'live'}`
          }
        />
      )}
    </div>
  );
}
