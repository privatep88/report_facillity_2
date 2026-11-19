import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertCircle,
  AlertTriangle,
  Award,
  Briefcase,
  Building2,
  Check,
  CheckCircle2,
  ClipboardList,
  Coins,
  Eye,
  FileCheck2,
  FilePenLine,
  FileSpreadsheet,
  FileText,
  Flame,
  History,
  ImagePlus,
  Layers,
  Lightbulb,
  ListChecks,
  Loader2,
  Lock,
  MessageSquare,
  Pencil,
  PenTool,
  Plus,
  RotateCcw,
  Save,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  Truck,
  UserCheck,
  Wrench,
  X,
  XCircle,
} from 'lucide-react';
import { populateReportWithSampleData } from '../utils/sampleReportData.ts';
import type {
  AuthUser,
  MaintenanceCategory,
  MaintenanceSite,
  MonthlyReportFull,
  PerformanceThresholds,
  TaskStatus,
} from '../types/report.ts';
import {
  REPORT_STATUSES,
  STATUS_LABELS_AR,
  TASK_STATUSES,
  TASK_STATUS_LABELS_AR,
  USER_ROLES,
} from '../types/report.ts';
import {
  computeReportMetrics,
  formatAed,
  formatDateTimeWestern,
  formatNumber,
  formatPct,
  formatPercentage,
  isLogisticsServiceRow,
} from '../utils/calculations.ts';
import { evaluateDualSignatureApproval } from '../utils/signatureValidation.ts';
import {
  canEditPostApprovalReport,
  canEditWorkingReport,
  isAuthorizedPostApprovalOwner,
} from '../utils/postApprovalAccess.ts';
import { getServiceVisual } from '../utils/serviceVisuals.tsx';
import { NumericInput } from './NumericInput.tsx';
import { LogisticsHorizontalChart } from './LogisticsHorizontalChart.tsx';
import { MaintenanceSiteHorizontalChart } from './MaintenanceSiteHorizontalChart.tsx';
import { SectionCard } from './SectionCard.tsx';
import { SignaturePadModal } from './SignaturePadModal.tsx';
import { WesternDatePicker } from './WesternDatePicker.tsx';
import { useNotification } from '../notifications/NotificationProvider.tsx';
import {
  STAGE_ACTION_LABELS_AR,
  validateReportCompleteness,
} from '../services/ReportValidationService.ts';
import engineerImg from '../assets/images/engineer_tablet_inspector_1794730112530.jpg';
import technicianImg from '../assets/images/technician_electrical_panel_1794730113102.jpg';
import fireExtImg from '../assets/images/fire_extinguisher_safety_1794730113921.jpg';
import engineeringImg from '../assets/images/facility_engineering_ops_1794728989361.jpg';
import receptionImg from '../assets/images/facility_reception_hall_1794728988518.jpg';
import safetyImg from '../assets/images/facility_safety_logistics_1794728989271.jpg';
import {
  EXECUTIVE_KPI_IMAGES,
  resolveTopServiceKpiImage,
} from '../utils/executiveKpiVisuals.ts';

import { ReportSectionNavigation } from './ReportSectionNavigation.tsx';

const WORKFLOW_STEPS: Array<{ key: string; label: string }> = [
  { key: REPORT_STATUSES.DRAFT, label: 'مسودة' },
  { key: REPORT_STATUSES.PENDING_APPROVAL, label: 'بانتظار الاعتماد' },
  { key: REPORT_STATUSES.APPROVED, label: 'معتمد' },
];

interface MonthlyReportTabProps {
  report: MonthlyReportFull;
  sites: MaintenanceSite[];
  categories: MaintenanceCategory[];
  thresholds: PerformanceThresholds;
  user: AuthUser | null;
  dirty: boolean;
  saving: boolean;
  savingSignatureTarget?: 'preparer' | 'approver' | null;
  onChangeReport: (updater: (prev: MonthlyReportFull) => MonthlyReportFull) => void;
  onSave: () => Promise<void>;
  onSaveSignature: (target: 'preparer' | 'approver', signatureImage: string | null) => Promise<void>;
  onSaveDate: (target: 'preparedAt' | 'approvedAt', dateValue: string | null) => Promise<void>;
  onOpenPreview: () => void;
  onExportPdf?: () => void;
  onExportExcel: () => void;
  exportingPdf?: boolean;
  exportingExcel?: boolean;
  onOpenHistory: () => void;
  onOpenSitesModal: () => void;
  onTriggerWorkflow: (
    action:
      | 'submit_review'
      | 'start_review'
      | 'return_revision'
      | 'forward_approval'
      | 'approve'
      | 'archive'
      | 'create_revision'
      | 'cancel_revision'
  ) => void;
  onOpenAuthModal: () => void;
  onNavigateToField: (sectionId: string, fieldId: string) => void;
}

export const MonthlyReportTab: React.FC<MonthlyReportTabProps> = ({
  report,
  sites,
  categories,
  thresholds,
  user,
  dirty,
  saving,
  savingSignatureTarget = null,
  onChangeReport,
  onSave,
  onSaveSignature,
  onSaveDate,
  onOpenPreview,
  onExportPdf,
  onExportExcel,
  exportingPdf = false,
  exportingExcel = false,
  onOpenHistory,
  onOpenSitesModal,
  onTriggerWorkflow,
  onOpenAuthModal,
  onNavigateToField,
}) => {
  const { confirmDialog, missingDataDialog, notifySuccess } = useNotification();
  const [showInactiveSites, setShowInactiveSites] = useState(false);
  const [maintenanceViewMode, setMaintenanceViewMode] = useState<'table' | 'cards'>('table');
  const [expandedNotes, setExpandedNotes] = useState<Record<string, boolean>>({});
  const [signatureModal, setSignatureModal] = useState<{
    target: 'preparer' | 'approver';
    mode: 'draw' | 'upload';
  } | null>(null);
  const [savingSignature, setSavingSignature] = useState(false);

  // Dynamic Service Add / Edit state
  const [showAddServiceForm, setShowAddServiceForm] = useState(false);
  const [newServiceDraft, setNewServiceDraft] = useState({
    nameAr: '',
    nameEn: '',
    receivedCount: 0,
    executedCount: 0,
  });
  const [serviceFormError, setServiceFormError] = useState<string | null>(null);
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [editServiceDraft, setEditServiceDraft] = useState({ nameAr: '', nameEn: '' });

  // Dynamic Security & Reception (بيان) Column Add / Edit state
  const [showAddSecurityColForm, setShowAddSecurityColForm] = useState(false);
  const [newSecurityColDraft, setNewSecurityColDraft] = useState({
    nameAr: '',
    nameEn: '',
    receivedCount: 0,
    executedCount: 0,
  });
  const [securityColFormError, setSecurityColFormError] = useState<string | null>(null);
  const [editingSecurityKey, setEditingSecurityKey] = useState<string | null>(null);
  const [editSecurityDraft, setEditSecurityDraft] = useState({ nameAr: '', nameEn: '' });

  const visibleSites = useMemo(
    () =>
      (showInactiveSites ? sites : sites.filter((s) => s.isActive))
        .slice()
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [sites, showInactiveSites]
  );

  const metrics = useMemo(
    () => computeReportMetrics(report, visibleSites, categories, thresholds),
    [report, visibleSites, categories, thresholds]
  );

  const isApprovedOrArchived =
    report.status === REPORT_STATUSES.APPROVED || report.status === REPORT_STATUSES.ARCHIVED;

  const isLocked =
    isApprovedOrArchived ||
    (report.status !== REPORT_STATUSES.DRAFT && user?.role !== USER_ROLES.ADMIN) ||
    (Boolean(report.isPostApprovalRevision) && !isAuthorizedPostApprovalOwner(user, report));

  const canEdit =
    !isLocked &&
    (user ? canEditWorkingReport(user, report) : !report.isPostApprovalRevision);

  const canSignPreparer =
    !isApprovedOrArchived &&
    !!user &&
    (user.role === USER_ROLES.ADMIN ||
      (user.role === USER_ROLES.PREPARER &&
        report.status === REPORT_STATUSES.DRAFT &&
        (!report.isPostApprovalRevision || isAuthorizedPostApprovalOwner(user, report))));

  // STRICT RBAC: Only ADMIN or APPROVER can sign/modify/delete the Approver signature.
  const canSignApprover =
    !isApprovedOrArchived &&
    !!user &&
    (user.role === USER_ROLES.ADMIN || user.role === USER_ROLES.APPROVER);

  const canStartPostApprovalEdit = canEditPostApprovalReport(user, report);
  const canCancelPostApprovalRevision =
    !isApprovedOrArchived &&
    Boolean(report.isPostApprovalRevision) &&
    isAuthorizedPostApprovalOwner(user, report);

  const dualSigEval = useMemo(
    () =>
      evaluateDualSignatureApproval(report, user, {
        savingTarget:
          savingSignatureTarget ?? (savingSignature ? signatureModal?.target ?? null : null),
      }),
    [report, user, savingSignatureTarget, savingSignature, signatureModal?.target]
  );

  const dataValidation = useMemo(
    () =>
      validateReportCompleteness(report, {
        stage: 'draft_save',
        sites,
        categories,
        user,
      }),
    [report, sites, categories, user]
  );

  const prevCompletionStateRef = useRef<{ reportId: string; dataIsComplete: boolean } | null>(null);
  useEffect(() => {
    const prev = prevCompletionStateRef.current;
    if (!prev || prev.reportId !== report.id) {
      prevCompletionStateRef.current = {
        reportId: report.id,
        dataIsComplete: dataValidation.dataIsComplete,
      };
      return;
    }
    if (!prev.dataIsComplete && dataValidation.dataIsComplete) {
      notifySuccess(
        'اكتملت البيانات المطلوبة للتقرير',
        'جميع الحقول والبيانات الأساسية مستوفاة وجاهزة لاستكمال التوقيع والاعتماد.',
        {
          context: 'saved',
          dedupeKey: `report_complete_${report.id}`,
        }
      );
    }
    prevCompletionStateRef.current = {
      reportId: report.id,
      dataIsComplete: dataValidation.dataIsComplete,
    };
  }, [report.id, dataValidation.dataIsComplete, notifySuccess]);

  const handleOpenSignatureModal = (
    target: 'preparer' | 'approver',
    mode: 'draw' | 'upload'
  ) => {
    const stage = target === 'preparer' ? 'sign_preparer' : 'sign_approver';
    const sigValidation = validateReportCompleteness(report, {
      stage,
      sites,
      categories,
      user,
      savingTarget: savingSignatureTarget,
    });
    if (!sigValidation.isComplete) {
      void missingDataDialog({
        reportNumber: report.reportNumber,
        month: report.month,
        year: report.year,
        attemptedActionLabel: STAGE_ACTION_LABELS_AR[stage],
        validation: sigValidation,
        onNavigateToField,
      });
      return;
    }
    setSignatureModal({ target, mode });
  };

  const handleOpenCompletenessInspector = () => {
    void missingDataDialog({
      reportNumber: report.reportNumber,
      month: report.month,
      year: report.year,
      attemptedActionLabel: 'مراجعة اكتمال بيانات التقرير قبل الاعتماد',
      validation: dataValidation,
      onNavigateToField,
    });
  };

  const canManageSites =
    !user || user.role === USER_ROLES.ADMIN || user.role === USER_ROLES.PREPARER;

  const normalizedStepStatus =
    report.status === REPORT_STATUSES.READY_FOR_REVIEW ||
    report.status === REPORT_STATUSES.UNDER_REVIEW
      ? REPORT_STATUSES.PENDING_APPROVAL
      : report.status === REPORT_STATUSES.ARCHIVED
        ? REPORT_STATUSES.APPROVED
        : report.status;
  const activeStepIdx = WORKFLOW_STEPS.findIndex((s) => s.key === normalizedStepStatus);
  const donutData = metrics.servicesWithMetrics.filter((s) => s.receivedCount > 0);
  const sortedRequestsByService = useMemo(
    () => [...metrics.servicesWithMetrics].sort((a, b) => b.receivedCount - a.receivedCount),
    [metrics.servicesWithMetrics]
  );
  const sortedSummaryServices = [...metrics.servicesWithMetrics].sort((a, b) => {
    const sa = report.services.find((x) => x.serviceId === a.serviceId)?.summaryOrder ?? 99;
    const sb = report.services.find((x) => x.serviceId === b.serviceId)?.summaryOrder ?? 99;
    return sa - sb;
  });

  const maintenanceSourcesChartData = useMemo(() => {
    const fromFacilities = Math.max(0, Number(report.maintenanceServices.fromFacilitiesDept) || 0);
    const fromOther = Math.max(0, Number(report.maintenanceServices.fromOtherDepts) || 0);
    const total = fromFacilities + fromOther;
    return [
      {
        key: 'facilities',
        name: 'طلبات الصيانة الواردة من قسم المرافق',
        shortName: 'الواردة من قسم المرافق',
        value: fromFacilities,
        sharePct: total > 0 ? (fromFacilities / total) * 100 : 0,
        color: '#1769AA',
      },
      {
        key: 'other',
        name: 'طلبات الصيانة الواردة من الإدارات الأخرى',
        shortName: 'الواردة من الإدارات الأخرى',
        value: fromOther,
        sharePct: total > 0 ? (fromOther / total) * 100 : 0,
        color: '#C8A85D',
      },
    ];
  }, [report.maintenanceServices.fromFacilitiesDept, report.maintenanceServices.fromOtherDepts]);

  const securityTotals = useMemo(() => {
    return report.securityReception.reduce(
      (acc, sr) => ({
        received: acc.received + (Number(sr.receivedCount) || 0),
        executed: acc.executed + (Number(sr.executedCount) || 0),
      }),
      { received: 0, executed: 0 }
    );
  }, [report.securityReception]);

  const challengesStats = useMemo(() => {
    const filledChallenges = report.challenges.filter((c) => c.challengeText.trim().length > 0).length;
    const filledRecs = report.challenges.filter((c) => c.recommendationText.trim().length > 0).length;
    return { filledChallenges, filledRecs };
  }, [report.challenges]);

  const handleAddService = () => {
    const nameAr = newServiceDraft.nameAr.trim();
    const nameEn = newServiceDraft.nameEn.trim() || nameAr;
    if (!nameAr) {
      setServiceFormError('يرجى إدخال اسم الخدمة باللغة العربية.');
      return;
    }
    const duplicate = report.services.some((s) => s.nameAr.trim() === nameAr);
    if (duplicate) {
      setServiceFormError('توجد خدمة مسجلة بنفس الاسم مسبقاً.');
      return;
    }

    const nextSortOrder =
      report.services.reduce((max, s) => Math.max(max, Number(s.sortOrder) || 0), 0) + 1;
    const nextSummaryOrder =
      report.services.reduce((max, s) => Math.max(max, Number(s.summaryOrder) || 0), 0) + 1;
    const newId = `svc_custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;

    onChangeReport((prev) => ({
      ...prev,
      services: [
        ...prev.services,
        {
          serviceId: newId,
          sortOrder: nextSortOrder,
          summaryOrder: nextSummaryOrder,
          nameAr,
          nameEn,
          receivedCount: Math.max(0, Math.round(Number(newServiceDraft.receivedCount) || 0)),
          executedCount: Math.max(0, Math.round(Number(newServiceDraft.executedCount) || 0)),
        },
      ],
    }));

    setNewServiceDraft({ nameAr: '', nameEn: '', receivedCount: 0, executedCount: 0 });
    setServiceFormError(null);
    setShowAddServiceForm(false);
    notifySuccess('تمت إضافة الخدمة الجديدة إلى التقرير', nameAr, {
      context: 'saved',
      dedupeKey: `add_svc_${newId}`,
    });
  };

  const handleStartEditService = (serviceId: string) => {
    const found = report.services.find((s) => s.serviceId === serviceId);
    if (!found) return;
    setEditingServiceId(serviceId);
    setEditServiceDraft({ nameAr: found.nameAr, nameEn: found.nameEn });
  };

  const handleCommitEditService = () => {
    if (!editingServiceId) return;
    const nameAr = editServiceDraft.nameAr.trim();
    if (!nameAr) return;
    const nameEn = editServiceDraft.nameEn.trim() || nameAr;

    onChangeReport((prev) => ({
      ...prev,
      services: prev.services.map((item) =>
        item.serviceId === editingServiceId ? { ...item, nameAr, nameEn } : item
      ),
    }));
    setEditingServiceId(null);
    notifySuccess('تم تعديل مسمى الخدمة', nameAr, { context: 'saved' });
  };

  const handleDeleteService = async (serviceId: string) => {
    const target = report.services.find((s) => s.serviceId === serviceId);
    const confirmed = await confirmDialog({
      title: 'تأكيد حذف الخدمة من التقرير',
      titleEn: 'Confirm Service Deletion',
      message: 'هل أنت متأكد من حذف هذه الخدمة؟ سيتم إزالة بياناتها من ملخص الخدمات وتوزيع الأداء.',
      targetLabel: target?.nameAr || 'الخدمة المحددة',
      confirmLabel: 'حذف الخدمة',
      cancelLabel: 'إلغاء',
      tone: 'danger',
      context: 'delete',
    });
    if (!confirmed) return;
    if (editingServiceId === serviceId) {
      setEditingServiceId(null);
    }
    onChangeReport((prev) => ({
      ...prev,
      services: prev.services.filter((item) => item.serviceId !== serviceId),
    }));
    notifySuccess('تم حذف الخدمة من المسودة', target?.nameAr || undefined, {
      context: 'delete',
    });
  };

  const handleAddSecurityCol = () => {
    const nameAr = newSecurityColDraft.nameAr.trim();
    const nameEn = newSecurityColDraft.nameEn.trim() || nameAr;
    if (!nameAr) {
      setSecurityColFormError('يرجى إدخال مسمى البيان (العمود) باللغة العربية.');
      return;
    }
    const duplicate = report.securityReception.some((sr) => sr.nameAr.trim() === nameAr);
    if (duplicate) {
      setSecurityColFormError('يوجد عمود بيان مسجل بنفس الاسم مسبقاً.');
      return;
    }

    const nextSortOrder =
      report.securityReception.reduce((max, sr) => Math.max(max, Number(sr.sortOrder) || 0), 0) + 1;
    const newKey = `sec_custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;

    onChangeReport((prev) => ({
      ...prev,
      securityReception: [
        ...prev.securityReception,
        {
          activityKey: newKey,
          nameAr,
          nameEn,
          receivedCount: Math.max(0, Math.round(Number(newSecurityColDraft.receivedCount) || 0)),
          executedCount: Math.max(0, Math.round(Number(newSecurityColDraft.executedCount) || 0)),
          sortOrder: nextSortOrder,
        },
      ],
    }));

    setNewSecurityColDraft({ nameAr: '', nameEn: '', receivedCount: 0, executedCount: 0 });
    setSecurityColFormError(null);
    setShowAddSecurityColForm(false);
    notifySuccess('تمت إضافة عمود البيان بنجاح', nameAr, { context: 'security' });
  };

  const handleStartEditSecurityCol = (activityKey: string) => {
    const found = report.securityReception.find((sr) => sr.activityKey === activityKey);
    if (!found) return;
    setEditingSecurityKey(activityKey);
    setEditSecurityDraft({ nameAr: found.nameAr, nameEn: found.nameEn });
  };

  const handleCommitEditSecurityCol = () => {
    if (!editingSecurityKey) return;
    const nameAr = editSecurityDraft.nameAr.trim();
    if (!nameAr) return;
    const nameEn = editSecurityDraft.nameEn.trim() || nameAr;

    onChangeReport((prev) => ({
      ...prev,
      securityReception: prev.securityReception.map((item) =>
        item.activityKey === editingSecurityKey ? { ...item, nameAr, nameEn } : item
      ),
    }));
    setEditingSecurityKey(null);
    notifySuccess('تم تعديل مسمى البيان', nameAr, { context: 'security' });
  };

  const handleDeleteSecurityCol = async (activityKey: string) => {
    const target = report.securityReception.find((sr) => sr.activityKey === activityKey);
    const confirmed = await confirmDialog({
      title: 'تأكيد حذف عمود البيان',
      titleEn: 'Confirm Security Column Deletion',
      message: 'هل أنت متأكد من حذف هذا العمود من جدول خدمات الأمن والاستقبال؟',
      targetLabel: target?.nameAr || 'البيان المحدد',
      confirmLabel: 'حذف العمود',
      cancelLabel: 'إلغاء',
      tone: 'danger',
      context: 'delete',
    });
    if (!confirmed) return;
    if (editingSecurityKey === activityKey) {
      setEditingSecurityKey(null);
    }
    onChangeReport((prev) => ({
      ...prev,
      securityReception: prev.securityReception.filter((item) => item.activityKey !== activityKey),
    }));
    notifySuccess('تم حذف عمود البيان', target?.nameAr || undefined, { context: 'delete' });
  };

  // Contract sub-card tint mapping matching Target UI (Gold, Ice-Blue, Mint)
  const contractTints: Record<string, { headerBg: string; borderCls: string }> = {
    service_contracts: { headerBg: 'bg-[#F3E7C8] text-[#0B2341]', borderCls: 'border-[#DFC686]' },
    commercial_licenses: { headerBg: 'bg-[#DCE9F7] text-[#0B2341]', borderCls: 'border-[#B5CFE9]' },
    rental_contracts: { headerBg: 'bg-[#DCF1E8] text-[#0B2341]', borderCls: 'border-[#AEDAC7]' },
  };

  const orderedContracts = [...report.contracts].sort((a, b) => {
    // In RTL grid: index 0 = Rightmost (Rental), index 1 = Center (Licenses), index 2 = Leftmost (Service)
    const order = ['rental_contracts', 'commercial_licenses', 'service_contracts'];
    return order.indexOf(a.groupKey) - order.indexOf(b.groupKey);
  });

  const orderedSafety = [...report.safety].sort((a, b) => {
    // In RTL grid: index 0 = Rightmost (Extinguishers), index 1 = Leftmost (Risk Observations)
    const order = ['fire_extinguishers', 'risk_observations'];
    return order.indexOf(a.groupKey) - order.indexOf(b.groupKey);
  });

  return (
    <div className="space-y-4">
      {/* Unauthenticated / Locked Notices */}
      {!user && (
        <div className="bg-white border border-[#1769AA]/30 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2.5 text-xs text-[#0B2341]">
            <Lock className="w-4 h-4 text-[#1769AA] shrink-0" />
            <span>
              أنت تتصفح التقرير بوضع القراءة فقط. سجّل الدخول بحسابك المؤسسي للتعديل أو تنفيذ إجراءات المراجعة والاعتماد.
            </span>
          </div>
          <button
            type="button"
            onClick={onOpenAuthModal}
            className="px-3.5 py-1.5 rounded-lg bg-[#0B2341] hover:bg-[#1769AA] text-white text-xs font-bold cursor-pointer"
          >
            تسجيل الدخول / تبديل الدور
          </button>
        </div>
      )}

      {isApprovedOrArchived && (
        <div className="bg-emerald-50 border border-[#069B74]/40 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-xs text-[#0B2341]">
            <ShieldCheck className="w-4 h-4 text-[#069B74] shrink-0" />
            <span>
              هذا التقرير <strong>{STATUS_LABELS_AR[report.status]}</strong> وموثق بنسخة رسمية ثابتة؛ يُمنع التعديل المباشر
              لحماية سلامة البيانات المعتمدة.
            </span>
          </div>
          {canStartPostApprovalEdit && (
            <button
              type="button"
              onClick={() => onTriggerWorkflow('create_revision')}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#082D56] hover:bg-[#10518C] text-white border border-[#D5AD5D]/70 text-xs font-bold cursor-pointer"
            >
              <FilePenLine className="w-3.5 h-3.5 text-[#DFC076]" />
              <span>تحرير التقرير بعد الاعتماد</span>
            </button>
          )}
        </div>
      )}

      {!isApprovedOrArchived && report.isPostApprovalRevision && (
        <div className="bg-amber-50/90 border border-[#D5AD5D] rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
          <div className="space-y-1 text-xs text-[#082D56]">
            <div className="flex flex-wrap items-center gap-2 font-extrabold">
              <FilePenLine className="w-4 h-4 text-[#9A7422] shrink-0" />
              <span>
                قيد تعديل تقرير معتمد — الإصدار الجديد{' '}
                <span dir="ltr" className="font-mono text-[#9A7422]">
                  v{report.currentVersion}
                </span>{' '}
                (النسخة المعتمدة المحفوظة:{' '}
                <span dir="ltr" className="font-mono">
                  v{report.sourceApprovedVersion ?? Math.max(1, report.currentVersion - 1)}
                </span>
                )
              </span>
            </div>
            <p className="text-[11px] text-slate-700">
              السبب: <strong className="text-[#082D56]">{report.revisionReason || '—'}</strong> · فُتح بواسطة:{' '}
              <strong>{report.revisionStartedByName || '—'}</strong> · يتطلب إعادة الاعتماد استكمال توقيع معد التقرير
              وتوقيع المعتمد من جديد.
            </p>
            {user && !isAuthorizedPostApprovalOwner(user, report) && (
              <p className="text-[11px] font-bold text-[#C94444]">
                التحرير مقتصر على معد التقرير الأصلي أو مدير النظام؛ التقرير معروض لك بوضع القراءة فقط.
              </p>
            )}
          </div>
          {canCancelPostApprovalRevision && (
            <button
              type="button"
              onClick={() => onTriggerWorkflow('cancel_revision')}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-white hover:bg-red-50 text-[#C94444] border border-[#C94444]/40 text-xs font-bold shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>إلغاء مسودة التعديل</span>
            </button>
          )}
        </div>
      )}

      {/* Compact Executive Workflow & Action Bar */}
      <div className="bg-white rounded-xl border border-[#A3C0DE]/70 px-3 py-2 shadow-2xs space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Workflow Progression Pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            {WORKFLOW_STEPS.map((st, idx) => {
              const reached = idx <= activeStepIdx;
              const isCurrent = idx === activeStepIdx;
              return (
                <React.Fragment key={st.key}>
                  <span
                    className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                      isCurrent
                        ? 'bg-[#0B2341] text-[#DFC076] border border-[#C8A85D]/60'
                        : reached
                          ? 'bg-emerald-50 text-[#069B74]'
                          : 'bg-slate-100 text-slate-400'
                    }`}
                  >
                    {st.label}
                  </span>
                  {idx < WORKFLOW_STEPS.length - 1 && (
                    <span className="text-slate-300 text-[11px]" aria-hidden="true">
                      ←
                    </span>
                  )}
                </React.Fragment>
              );
            })}
            {dirty && (
              <span className="ms-2 px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-[#9A7422] text-[11px] font-extrabold">
                يوجد تعديلات غير محفوظة
              </span>
            )}
          </div>

          {/* Primary Actions */}
          <div className="flex flex-wrap items-center gap-1.5">
            {canEdit && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    onChangeReport((prev) => populateReportWithSampleData(prev, sites, categories));
                    notifySuccess(
                      'تمت تعبئة البيانات النموذجية',
                      'تم ملء جميع الحقول المخصصة ببيانات عشوائية متناسقة كنموذج جاهز للمراجعة أو التعديل والحفظ.'
                    );
                  }}
                  title="تعبئة جميع الحقول المخصصة ببيانات عشوائية متناسقة كنماذج"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FDF8EC] hover:bg-[#F5E9C8] text-[#0B2341] border border-[#C8A85D] text-xs font-bold transition-colors cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#9A7422]" />
                  <span>تعبئة بيانات نموذجية</span>
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={onSave}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#0B2341] hover:bg-[#1769AA] text-white text-xs font-bold transition-colors disabled:opacity-60 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5 text-[#DFC076]" />
                  <span>{saving ? 'جاري الحفظ...' : 'حفظ التقرير'}</span>
                </button>
              </>
            )}

            {report.status === REPORT_STATUSES.DRAFT &&
              user &&
              (user.role === USER_ROLES.ADMIN || user.role === USER_ROLES.PREPARER) && (
                <button
                  type="button"
                  onClick={() => onTriggerWorkflow('submit_review')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1769AA] hover:bg-[#0B2341] text-white text-xs font-bold transition-colors cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>إرسال للاعتماد</span>
                </button>
              )}

            {(report.status === REPORT_STATUSES.PENDING_APPROVAL ||
              report.status === REPORT_STATUSES.READY_FOR_REVIEW ||
              report.status === REPORT_STATUSES.UNDER_REVIEW) &&
              user &&
              (user.role === USER_ROLES.ADMIN || user.role === USER_ROLES.APPROVER) && (
                <button
                  type="button"
                  onClick={() => onTriggerWorkflow('approve')}
                  title={
                    dualSigEval.hasBothSignatures
                      ? 'اعتماد التقرير رسمياً'
                      : 'يتطلب توقيع معد التقرير وتوقيع معتمد التقرير قبل الاعتماد'
                  }
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white text-xs font-bold transition-colors cursor-pointer ${
                    dualSigEval.hasBothSignatures
                      ? 'bg-[#07976E] hover:bg-[#05805d]'
                      : 'bg-[#082D56] hover:bg-[#10518C] border border-[#D5AD5D]/70'
                  }`}
                >
                  {dualSigEval.hasBothSignatures ? (
                    <ShieldCheck className="w-3.5 h-3.5" />
                  ) : (
                    <Lock className="w-3.5 h-3.5 text-[#D5AD5D]" />
                  )}
                  <span>اعتماد رسمي</span>
                  {!dualSigEval.hasBothSignatures && (
                    <span className="text-[10px] text-[#E5C878] font-semibold">(يتطلب التوقيعين)</span>
                  )}
                </button>
              )}

            {(report.status === REPORT_STATUSES.READY_FOR_REVIEW ||
              report.status === REPORT_STATUSES.UNDER_REVIEW ||
              report.status === REPORT_STATUSES.PENDING_APPROVAL) &&
              user &&
              (user.role === USER_ROLES.ADMIN ||
                user.role === USER_ROLES.REVIEWER ||
                user.role === USER_ROLES.APPROVER) && (
                <button
                  type="button"
                  onClick={() => onTriggerWorkflow('return_revision')}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[#C43D47] text-[#C43D47] hover:bg-red-50 text-xs font-bold transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>إرجاع للتعديل</span>
                </button>
              )}

            <button
              type="button"
              onClick={onOpenHistory}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:border-[#1769AA] bg-white text-[#0B2341] text-xs font-semibold transition-colors cursor-pointer"
            >
              <History className="w-3.5 h-3.5 text-[#1769AA]" />
              <span>السجل</span>
            </button>

            <button
              type="button"
              onClick={onOpenPreview}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#EAF4FC] hover:bg-[#1769AA] text-[#1769AA] hover:text-white border border-[#1769AA]/25 text-xs font-bold transition-colors cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>معاينة / طباعة</span>
            </button>

            {onExportPdf && (
              <button
                type="button"
                onClick={onExportPdf}
                disabled={exportingPdf}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#C99E4A] hover:bg-[#b58a37] disabled:opacity-60 text-[#0B2341] text-xs font-extrabold transition-colors cursor-pointer"
              >
                {exportingPdf ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <FileText className="w-3.5 h-3.5" />
                )}
                <span>
                  {exportingPdf ? 'جارٍ تجهيز التقرير وتوزيع صفحاته تلقائياً...' : 'تصدير PDF'}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={onExportExcel}
              disabled={exportingExcel}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#069B74] hover:bg-[#058261] disabled:opacity-60 text-white text-xs font-bold transition-colors cursor-pointer"
            >
              {exportingExcel ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <FileSpreadsheet className="w-3.5 h-3.5" />
              )}
              <span>{exportingExcel ? 'جارٍ التصدير...' : 'تصدير Excel'}</span>
            </button>
          </div>
        </div>

        {/* Report Completeness Indicator Strip */}
        <div
          className={`flex flex-wrap items-center justify-between gap-2.5 px-3 py-1.5 rounded-lg border text-[11px] ${
            dataValidation.dataIsComplete
              ? 'bg-emerald-50/75 border-[#07976E]/35 text-[#082D56]'
              : 'bg-red-50/65 border-[#C94444]/35 text-[#082D56]'
          }`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-extrabold text-white ${
                dataValidation.dataIsComplete ? 'bg-[#07976E]' : 'bg-[#C94444]'
              }`}
            >
              {dataValidation.dataIsComplete ? (
                <CheckCircle2 className="w-3 h-3" />
              ) : (
                <AlertTriangle className="w-3 h-3" />
              )}
              <span>{dataValidation.dataIsComplete ? 'مكتمل' : 'غير مكتمل'}</span>
            </span>

            <span className="font-bold text-[#082D56]">
              نسبة اكتمال البيانات:{' '}
              <span dir="ltr" className="font-extrabold tabular-nums">
                {formatNumber(dataValidation.completenessPercentage)}%
              </span>
            </span>

            <div
              className="w-28 h-2 rounded-full bg-white border border-slate-200 overflow-hidden"
              aria-hidden="true"
            >
              <div
                className={`h-full transition-all duration-300 ${
                  dataValidation.dataIsComplete ? 'bg-[#07976E]' : 'bg-[#D99A22]'
                }`}
                style={{ width: `${dataValidation.completenessPercentage}%` }}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            {dataValidation.dataIsComplete ? (
              <span className="text-[11px] font-bold text-[#07976E]">
                جميع الحقول المطلوبة مستوفاة وجاهزة للمراجعة والاعتماد
              </span>
            ) : (
              <button
                type="button"
                onClick={handleOpenCompletenessInspector}
                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-white hover:bg-red-50 border border-[#C94444]/40 text-[#C94444] font-extrabold transition-colors cursor-pointer"
              >
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>
                  الحقول الناقصة:{' '}
                  <span dir="ltr" className="tabular-nums">
                    {formatNumber(dataValidation.missingRequiredFields)}
                  </span>{' '}
                  (عرض الحقول)
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Adaptive Responsive Quick-Jump Navigation (Zero Horizontal Scrollbar) */}
        <ReportSectionNavigation />
      </div>

      {/* ================================================================= */}
      {/* SECTION 1: الملخص التنفيذي · Executive Summary                     */}
      {/* ================================================================= */}
      <SectionCard
        id="sec-summary"
        titleAr="الملخص التنفيذي"
        titleEn="Executive Summary"
        icon={<ClipboardList className="w-4 h-4" />}
        bodyClassName="p-3 sm:p-4"
      >
        {(() => {
          const topServiceImg = resolveTopServiceKpiImage(metrics.topService);
          return (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-stretch">
              {/* 4 Gradient KPI Cards with Contextual Corporate Imagery (Right / 9 Cols) */}
              <div className="lg:col-span-9 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 items-stretch">
                {/* KPI 1 (Rightmost): Total Requests */}
                <div className="group rounded-xl border border-[#B8CEE8] bg-gradient-to-b from-[#F4F8FD] via-[#EBF2FC] to-[#DFEAFA] overflow-hidden flex flex-col justify-between text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
                  <div className="relative h-[94px] sm:h-[104px] w-full overflow-hidden bg-[#D8E8FA] shrink-0">
                    <img
                      src={EXECUTIVE_KPI_IMAGES.totalRequests.src}
                      alt={EXECUTIVE_KPI_IMAGES.totalRequests.altAr}
                      className="w-full h-full object-cover object-center transition-transform duration-500 group-hover:scale-[1.03]"
                      referrerPolicy="no-referrer"
                    />
                    <div
                      aria-hidden="true"
                      className="absolute inset-0 bg-gradient-to-b from-[#012E5E]/15 via-transparent to-[#EBF2FC]"
                    />
                    <div
                      aria-hidden="true"
                      className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-[#EBF2FC] via-[#EBF2FC]/80 to-transparent"
                    />
                  </div>
                  <div className="px-3 pb-3.5 pt-0 flex-1 flex flex-col items-center justify-between">
                    <div className="-mt-5 relative z-10 w-10 h-10 rounded-xl bg-white/95 border border-[#B8CEE8] text-[#1769AA] flex items-center justify-center mb-1.5 shadow-xs shrink-0">
                      <ClipboardList className="w-5 h-5" />
                    </div>
                    <div className="my-auto py-0.5 flex flex-col items-center justify-center">
                      <p
                        className="text-2xl sm:text-[28px] font-extrabold text-[#012E5E] tabular-nums leading-none"
                        dir="ltr"
                      >
                        {formatNumber(metrics.totalReceived)}
                      </p>
                    </div>
                    <div className="mt-1.5">
                      <p className="text-xs font-extrabold text-[#012E5E]">إجمالي الطلبات</p>
                      <p className="text-[10.5px] font-medium text-slate-600 mt-0.5" dir="ltr">
                        Total Requests
                      </p>
                    </div>
                  </div>
                </div>

                {/* KPI 2: Top Service Demand (Dynamic Image by serviceId) */}
                <div className="group rounded-xl border border-[#E2C88B] bg-gradient-to-b from-[#FDF9EE] via-[#F9F0DA] to-[#F3E5C2] overflow-hidden flex flex-col justify-between text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
                  <div className="relative h-[94px] sm:h-[104px] w-full overflow-hidden bg-[#F3E5C2] shrink-0">
                    <img
                      src={topServiceImg.src}
                      alt={topServiceImg.altAr}
                      className="w-full h-full object-cover object-center transition-transform duration-500 group-hover:scale-[1.03]"
                      referrerPolicy="no-referrer"
                    />
                    <div
                      aria-hidden="true"
                      className="absolute inset-0 bg-gradient-to-b from-[#5A4010]/15 via-transparent to-[#F9F0DA]"
                    />
                    <div
                      aria-hidden="true"
                      className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-[#F9F0DA] via-[#F9F0DA]/80 to-transparent"
                    />
                  </div>
                  <div className="px-3 pb-3.5 pt-0 flex-1 flex flex-col items-center justify-between">
                    <div className="-mt-5 relative z-10 w-10 h-10 rounded-xl bg-white/95 border border-[#E2C88B] text-[#B8862D] flex items-center justify-center mb-1.5 shadow-xs shrink-0">
                      <Award className="w-5 h-5" />
                    </div>
                    <div className="my-auto py-0.5 flex flex-col items-center justify-center min-h-[32px]">
                      {metrics.topService ? (
                        <p className="text-sm font-extrabold text-[#012E5E] leading-snug line-clamp-2 flex items-center justify-center">
                          {metrics.topService.nameAr}
                        </p>
                      ) : (
                        <p className="text-2xl font-extrabold text-[#9A7422] leading-none" dir="ltr">
                          0
                        </p>
                      )}
                    </div>
                    <div className="mt-1.5">
                      <p className="text-xs font-extrabold text-[#012E5E]">أعلى خدمة طلباً</p>
                      <p className="text-[10.5px] font-medium text-slate-600 mt-0.5">
                        {metrics.topService
                          ? `${formatNumber(metrics.topService.receivedCount)} طلب · Top Service`
                          : 'Top Service'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* KPI 3: Total Services */}
                <div className="group rounded-xl border border-[#A5C8EB] bg-gradient-to-b from-[#F0F7FE] via-[#E4F0FC] to-[#D5E7FA] overflow-hidden flex flex-col justify-between text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
                  <div className="relative h-[94px] sm:h-[104px] w-full overflow-hidden bg-[#D5E7FA] shrink-0">
                    <img
                      src={EXECUTIVE_KPI_IMAGES.totalServices.src}
                      alt={EXECUTIVE_KPI_IMAGES.totalServices.altAr}
                      className="w-full h-full object-cover object-center transition-transform duration-500 group-hover:scale-[1.03]"
                      referrerPolicy="no-referrer"
                    />
                    <div
                      aria-hidden="true"
                      className="absolute inset-0 bg-gradient-to-b from-[#0C4176]/15 via-transparent to-[#E4F0FC]"
                    />
                    <div
                      aria-hidden="true"
                      className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-[#E4F0FC] via-[#E4F0FC]/80 to-transparent"
                    />
                  </div>
                  <div className="px-3 pb-3.5 pt-0 flex-1 flex flex-col items-center justify-between">
                    <div className="-mt-5 relative z-10 w-10 h-10 rounded-xl bg-white/95 border border-[#A5C8EB] text-[#1769AA] flex items-center justify-center mb-1.5 shadow-xs shrink-0">
                      <Layers className="w-5 h-5" />
                    </div>
                    <div className="my-auto py-0.5 flex flex-col items-center justify-center">
                      <p
                        className="text-2xl sm:text-[28px] font-extrabold text-[#012E5E] tabular-nums leading-none"
                        dir="ltr"
                      >
                        {formatNumber(metrics.activeServicesCount)}
                      </p>
                    </div>
                    <div className="mt-1.5">
                      <p className="text-xs font-extrabold text-[#012E5E]">إجمالي الخدمات</p>
                      <p className="text-[10.5px] font-medium text-slate-600 mt-0.5" dir="ltr">
                        Total Services
                      </p>
                    </div>
                  </div>
                </div>

                {/* KPI 4 (Next to Photo): Monthly Completion Rate */}
                <div className="group rounded-xl border border-[#9CD9C5] bg-gradient-to-b from-[#EFFBF6] via-[#E1F6ED] to-[#CEEFE1] overflow-hidden flex flex-col justify-between text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
                  <div className="relative h-[94px] sm:h-[104px] w-full overflow-hidden bg-[#CEEFE1] shrink-0">
                    <img
                      src={EXECUTIVE_KPI_IMAGES.monthlyCompletion.src}
                      alt={EXECUTIVE_KPI_IMAGES.monthlyCompletion.altAr}
                      className="w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-[1.03]"
                      referrerPolicy="no-referrer"
                    />
                    <div
                      aria-hidden="true"
                      className="absolute inset-0 bg-gradient-to-b from-[#056C51]/12 via-transparent to-[#E1F6ED]"
                    />
                    <div
                      aria-hidden="true"
                      className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-[#E1F6ED] via-[#E1F6ED]/80 to-transparent"
                    />
                  </div>
                  <div className="px-3 pb-3.5 pt-0 flex-1 flex flex-col items-center justify-between">
                    <div className="-mt-5 relative z-10 w-10 h-10 rounded-xl bg-white/95 border border-[#9CD9C5] text-[#069B74] flex items-center justify-center mb-1.5 shadow-xs shrink-0">
                      <Target className="w-5 h-5" />
                    </div>
                    <div className="my-auto py-0.5 flex flex-col items-center justify-center">
                      <p
                        className="text-2xl sm:text-[28px] font-extrabold text-[#069B74] tabular-nums leading-none"
                        dir="ltr"
                      >
                        {formatPct(metrics.overallCompletionPct, '0.0%')}
                      </p>
                    </div>
                    <div className="mt-1.5">
                      <p className="text-xs font-extrabold text-[#012E5E]">نسبة الإنجاز الشهرية</p>
                      <p className="text-[10.5px] font-medium text-slate-600 mt-0.5" dir="ltr">
                        Monthly Completion Rate
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Left Visual Support Photo (3 Cols) */}
              <div className="lg:col-span-3 relative rounded-xl overflow-hidden border border-[#B8CEE6] min-h-[180px] shadow-xs bg-[#0B2341]">
                <img
                  src={engineerImg}
                  alt="مهندس مرافق يقوم بالتفتيش الميداني عبر الجهاز اللوحي"
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
                <div
                  aria-hidden="true"
                  className="absolute inset-0 bg-gradient-to-t from-[#071D3B]/55 via-transparent to-transparent pointer-events-none"
                />
              </div>
            </div>
          );
        })()}
      </SectionCard>

      {/* ================================================================= */}
      {/* REPOSITIONED 7 SUMMARY CARDS (DIRECTLY BELOW EXECUTIVE SUMMARY)   */}
      {/* Row 1: 4 Equal Cards | Row 2: 3 Equal Cards                       */}
      {/* ================================================================= */}
      <section
        id="sec-ops-strip"
        className="scroll-mt-20 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 items-stretch"
      >
        {/* Card 1: Maintenance Details */}
        <SectionCard
          titleAr="تفاصيل الصيانة بالمقرات"
          titleEn="Maintenance Details"
          icon={<Building2 className="w-4 h-4" />}
          className="flex flex-col"
          bodyClassName="p-2.5 flex-1 flex items-center"
        >
          <a href="#sec-maintenance" className="w-full flex items-center gap-2.5 group">
            <img
              src={engineeringImg}
              alt="تفاصيل الصيانة بالمقرات"
              className="w-16 h-14 rounded-lg object-cover border border-slate-200 shrink-0"
              referrerPolicy="no-referrer"
            />
            <div className="flex-1 grid grid-cols-2 divide-x divide-x-reverse divide-slate-200 text-center">
              <div className="px-1">
                <p className="text-lg font-extrabold text-[#0B2341] tabular-nums" dir="ltr">
                  {formatNumber(visibleSites.length)}
                </p>
                <p className="text-[11px] font-bold text-[#0B2341]">المقرات</p>
                <p className="text-[10px] text-slate-400">Sites</p>
              </div>
              <div className="px-1">
                <p className="text-lg font-extrabold text-[#0B2341] tabular-nums">
                  {formatNumber(metrics.maintenance.grandTotalFaults)}
                </p>
                <p className="text-[11px] font-bold text-[#0B2341]">إجمالي الأعطال</p>
                <p className="text-[10px] text-slate-400">Total</p>
              </div>
            </div>
          </a>
        </SectionCard>

        {/* Card 2: Maintenance Services */}
        <SectionCard
          titleAr="خدمات الصيانة"
          titleEn="Maintenance Services"
          icon={<Wrench className="w-4 h-4" />}
          className="flex flex-col"
          bodyClassName="p-2.5 flex-1 flex items-center"
        >
          <a href="#sec-maint-services" className="w-full flex items-center gap-2.5 group">
            <img
              src={technicianImg}
              alt="خدمات الصيانة"
              className="w-16 h-14 rounded-lg object-cover border border-slate-200 shrink-0"
              referrerPolicy="no-referrer"
            />
            <div className="flex-1 grid grid-cols-2 divide-x divide-x-reverse divide-slate-200 text-center">
              <div className="px-1">
                <p className="text-lg font-extrabold text-[#0B2341] tabular-nums">
                  {formatNumber(report.maintenanceServices.fromFacilitiesDept)}
                </p>
                <p className="text-[10px] font-bold text-[#0B2341]">من قسم المرافق</p>
                <p className="text-[9px] text-slate-400">From FM Dept.</p>
              </div>
              <div className="px-1">
                <p className="text-lg font-extrabold text-[#0B2341] tabular-nums">
                  {formatNumber(report.maintenanceServices.fromOtherDepts)}
                </p>
                <p className="text-[10px] font-bold text-[#0B2341]">من الإدارات الأخرى</p>
                <p className="text-[9px] text-slate-400">From Other Depts.</p>
              </div>
            </div>
          </a>
        </SectionCard>

        {/* Card 3: Logistics */}
        <SectionCard
          titleAr="الدعم اللوجستي"
          titleEn="Logistics"
          icon={<Truck className="w-4 h-4" />}
          className="flex flex-col"
          bodyClassName="p-2.5 flex-1 flex items-center"
        >
          <a href="#sec-logistics" className="w-full flex items-center gap-2.5 group">
            <img
              src={safetyImg}
              alt="الدعم اللوجستي"
              className="w-16 h-14 rounded-lg object-cover border border-slate-200 shrink-0"
              referrerPolicy="no-referrer"
            />
            <div className="flex-1 text-center">
              <p className="text-2xl font-extrabold text-[#0B2341] tabular-nums">
                {formatNumber(metrics.logisticsTotal)}
              </p>
              <p className="text-[11px] font-bold text-[#0B2341]">الإجمالي</p>
              <p className="text-[10px] text-slate-400">Total</p>
            </div>
          </a>
        </SectionCard>

        {/* Card 4: Security & Reception */}
        <SectionCard
          titleAr="خدمات الأمن والاستقبال"
          titleEn="Security & Reception"
          icon={<ShieldCheck className="w-4 h-4" />}
          className="flex flex-col"
          bodyClassName="p-2.5 flex-1 flex items-center"
        >
          <a href="#sec-security" className="w-full flex items-center gap-2.5 group">
            <img
              src={receptionImg}
              alt="خدمات الأمن والاستقبال"
              className="w-16 h-14 rounded-lg object-cover border border-slate-200 shrink-0"
              referrerPolicy="no-referrer"
            />
            <div className="flex-1 grid grid-cols-2 divide-x divide-x-reverse divide-slate-200 text-center">
              <div className="px-1">
                <p className="text-lg font-extrabold text-[#0B2341] tabular-nums">
                  {formatNumber(securityTotals.received)}
                </p>
                <p className="text-[10px] font-bold text-[#0B2341]">طلبات مستلمة</p>
                <p className="text-[9px] text-slate-400">Received</p>
              </div>
              <div className="px-1">
                <p className="text-lg font-extrabold text-[#069B74] tabular-nums">
                  {formatNumber(securityTotals.executed)}
                </p>
                <p className="text-[10px] font-bold text-[#0B2341]">طلبات منفذة</p>
                <p className="text-[9px] text-slate-400">Completed</p>
              </div>
            </div>
          </a>
        </SectionCard>
      </section>

      {/* Row 2 — 3 Equal Cards (RTL): Tasks & Challenges | Challenges & Recommendations | Preparation, Review & Approval */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-3.5 items-stretch">
        {/* Card 5 (Visual RIGHT in RTL): Tasks & Challenges */}
        <SectionCard
          titleAr="المهام والتحديات"
          titleEn="Tasks & Challenges"
          icon={<ListChecks className="w-4 h-4" />}
          className="flex flex-col"
          bodyClassName="p-3 flex-1 flex items-center"
        >
          <a
            href="#sec-tasks"
            className="w-full grid grid-cols-4 divide-x divide-x-reverse divide-[#A3C0DE]/60 text-center"
          >
            <div>
              <p className="text-lg font-extrabold text-[#012E5E] tabular-nums" dir="ltr">
                {formatNumber(metrics.tasksSummary.totalMeaningful)}
              </p>
              <p className="text-[10.5px] font-bold text-[#012E5E]">إجمالي المهام</p>
              <p className="text-[9px] text-slate-400">Total</p>
            </div>
            <div>
              <p className="text-lg font-extrabold text-[#069B74] tabular-nums" dir="ltr">
                {formatNumber(metrics.tasksSummary.completed)}
              </p>
              <p className="text-[10.5px] font-bold text-[#012E5E]">مكتملة</p>
              <p className="text-[9px] text-slate-400">Completed</p>
            </div>
            <div>
              <p className="text-lg font-extrabold text-[#1769AA] tabular-nums" dir="ltr">
                {formatNumber(metrics.tasksSummary.inProgress)}
              </p>
              <p className="text-[10.5px] font-bold text-[#012E5E]">قيد التنفيذ</p>
              <p className="text-[9px] text-slate-400">In Progress</p>
            </div>
            <div>
              <p className="text-lg font-extrabold text-[#C43D47] tabular-nums" dir="ltr">
                {formatNumber(metrics.tasksSummary.delayed)}
              </p>
              <p className="text-[10.5px] font-bold text-[#012E5E]">متأخرة</p>
              <p className="text-[9px] text-slate-400">Overdue</p>
            </div>
          </a>
        </SectionCard>

        {/* Card 6 (Visual CENTER in RTL): Challenges & Recommendations */}
        <SectionCard
          titleAr="التحديات والتوصيات"
          titleEn="Challenges & Recommendations"
          icon={<Lightbulb className="w-4 h-4" />}
          className="flex flex-col"
          bodyClassName="p-3 flex-1 flex items-center"
        >
          <a
            href="#sec-challenges"
            className="w-full grid grid-cols-2 divide-x divide-x-reverse divide-[#A3C0DE]/60 text-center"
          >
            <div className="px-2">
              <p className="text-xl font-extrabold text-[#012E5E] tabular-nums" dir="ltr">
                {formatNumber(challengesStats.filledChallenges)}
              </p>
              <p className="text-[11px] font-bold text-[#012E5E]">عدد التحديات</p>
              <p className="text-[9.5px] text-slate-400">Challenges</p>
            </div>
            <div className="px-2">
              <p className="text-xl font-extrabold text-[#069B74] tabular-nums" dir="ltr">
                {formatNumber(challengesStats.filledRecs)}
              </p>
              <p className="text-[11px] font-bold text-[#012E5E]">عدد التوصيات</p>
              <p className="text-[9.5px] text-slate-400">Recommendations</p>
            </div>
          </a>
        </SectionCard>

        {/* Card 7 (Visual LEFT in RTL — after Tasks & Challenges): Preparation, Review & Approval */}
        <SectionCard
          titleAr="الإعداد والمراجعة والاعتماد"
          titleEn="Preparation, Review & Approval"
          icon={<UserCheck className="w-4 h-4" />}
          className="flex flex-col"
          bodyClassName="p-2.5 flex-1 flex items-center"
        >
          <a
            href="#sec-approval"
            className="w-full grid grid-cols-3 divide-x divide-x-reverse divide-[#A3C0DE]/60 text-center text-[11px]"
          >
            <div className="px-2">
              <p className="text-[#012E5E] font-bold">معد التقرير</p>
              <p className="text-[9.5px] text-slate-400">Report Preparer</p>
              <p className="font-extrabold text-[#1769AA] truncate mt-1">
                {report.preparerName || '—'}
              </p>
              {report.preparerSignatureImage ? (
                <img
                  src={report.preparerSignatureImage}
                  alt="توقيع معد التقرير"
                  className="h-7 max-w-[96px] mx-auto mt-0.5 object-contain"
                />
              ) : (
                <p className="font-mono text-[9.5px] text-[#069B74] mt-0.5">
                  {report.preparerSignatureHash ? '✓ موثق إلكترونياً' : 'قيد الإعداد'}
                </p>
              )}
            </div>
            <div className="px-2">
              <p className="text-[#012E5E] font-bold">مراجع التقرير</p>
              <p className="text-[9.5px] text-slate-400">Report Reviewer</p>
              <p className="font-extrabold text-[#012E5E] truncate mt-1">
                {report.status === REPORT_STATUSES.PENDING_APPROVAL || isApprovedOrArchived
                  ? 'مراجع القسم'
                  : '—'}
              </p>
              <p className="font-mono text-[9.5px] text-slate-500 mt-0.5">
                {report.status === REPORT_STATUSES.PENDING_APPROVAL || isApprovedOrArchived
                  ? '✓ تمت المراجعة'
                  : 'بانتظار المراجعة'}
              </p>
            </div>
            <div className="px-2">
              <p className="text-[#012E5E] font-bold">معتمد التقرير</p>
              <p className="text-[9.5px] text-slate-400">Report Approver</p>
              <p className="font-extrabold text-[#012E5E] truncate mt-1">
                {report.approverName || '—'}
              </p>
              {report.approverSignatureImage ? (
                <img
                  src={report.approverSignatureImage}
                  alt="توقيع معتمد التقرير"
                  className="h-7 max-w-[96px] mx-auto mt-0.5 object-contain"
                />
              ) : (
                <p className="font-mono text-[9.5px] text-[#069B74] mt-0.5">
                  {report.approverSignatureHash ? '✓ معتمد رسمياً' : 'بانتظار الاعتماد'}
                </p>
              )}
            </div>
          </a>
        </SectionCard>
      </section>

      {/* ================================================================= */}
      {/* SECTION 2: 3-Column Performance Overview Row                      */}
      {/* RTL Order: Technician | Requests by Service | Performance Dist.   */}
      {/* ================================================================= */}
      <section
        id="sec-overview"
        className="scroll-mt-20 grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-stretch"
      >
        {/* Visual RIGHT Column (3 Cols in RTL): Electrical Panel Technician with matching SectionCard Header */}
        <SectionCard
          titleAr="المهام والتحديات الفنية"
          titleEn="Technical Operations"
          icon={<Wrench className="w-4 h-4" />}
          className="lg:col-span-3 flex flex-col"
          bodyClassName="p-2 flex-1 flex flex-col"
        >
          <div className="relative flex-1 rounded-lg overflow-hidden min-h-[220px] border border-slate-200/80">
            <img
              src={technicianImg}
              alt="فني صيانة كهربائية يفحص لوحة التوزيع"
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-gradient-to-t from-[#012E5E]/50 via-transparent to-transparent pointer-events-none"
            />
          </div>
        </SectionCard>

        {/* Requests by Service Table (5 Cols — Read-Only & Synchronized with Services Summary) */}
        <SectionCard
          titleAr="الطلبات حسب الخدمة"
          titleEn="Requests by Service"
          icon={<ClipboardList className="w-4 h-4" />}
          className="lg:col-span-5 flex flex-col requests-by-service-card"
          headerClassName="px-3.5 py-1.5"
          bodyClassName="p-0 flex-1 flex flex-col justify-between"
        >
          <div className="overflow-x-auto w-full">
            <table className="requests-by-service-table w-full text-[12px] table-fixed">
              <colgroup>
                <col style={{ width: '60%' }} />
                <col style={{ width: '20%' }} />
                <col style={{ width: '20%' }} />
              </colgroup>
              <thead className="bg-[#0B3969] text-white border-b border-[#012E5E]">
                <tr>
                  <th className="py-1.5 px-3 text-start font-extrabold text-[12.5px]">الخدمة</th>
                  <th className="py-1.5 px-2 text-center font-extrabold text-[12.5px]">العدد</th>
                  <th className="py-1.5 px-2 text-center font-extrabold text-[12.5px]">التوزيع النسبي</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70">
                {sortedRequestsByService.map((s, idx) => {
                  const vis = getServiceVisual(s.serviceId, s.nameAr, idx);
                  return (
                    <tr
                      key={s.serviceId}
                      className={`h-[34px] min-h-[34px] max-h-[36px] transition-colors ${
                        idx % 2 === 1
                          ? 'bg-[#E4EBF1]/60 hover:bg-[#DCE9F6]/50'
                          : 'bg-[#FEFEFE] hover:bg-[#F4F7FB]'
                      }`}
                    >
                      <td className="py-0.5 px-3 font-bold text-[#012E5E] align-middle">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span style={{ color: vis.color }} className="shrink-0 flex items-center justify-center">
                            {vis.renderIcon('w-3.5 h-3.5')}
                          </span>
                          <span
                            className="truncate text-[12.5px] font-bold text-[#012E5E] leading-tight"
                            title={s.nameAr}
                          >
                            {s.nameAr}
                          </span>
                        </div>
                      </td>
                      <td className="py-0.5 px-2 text-center align-middle">
                        <output
                          data-service-id={s.serviceId}
                          title="يتم تحديث العدد تلقائياً من ملخص الخدمات"
                          aria-label={`عدد طلبات ${s.nameAr}: ${formatNumber(s.receivedCount)} (يتم التحديث تلقائياً من ملخص الخدمات)`}
                          className="service-count-display service-count-box"
                        >
                          {formatNumber(s.receivedCount)}
                        </output>
                      </td>
                      <td
                        className="py-0.5 px-2 text-center align-middle font-bold tabular-nums text-slate-700 text-[12.5px] leading-tight"
                        dir="ltr"
                      >
                        {formatPct(s.shareOfTotalPct, '0.0%')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-[#012E5E] text-white font-extrabold h-[36px]">
                <tr>
                  <td className="py-1.5 px-3 text-start text-[12.5px]">الإجمالي · Total</td>
                  <td
                    className="py-1.5 px-2 text-center tabular-nums text-[#DFC076] text-[13.5px] font-black"
                    dir="ltr"
                  >
                    {formatNumber(metrics.totalReceived)}
                  </td>
                  <td className="py-1.5 px-2 text-center tabular-nums text-[12.5px]" dir="ltr">
                    {metrics.totalReceived > 0 ? formatPercentage(100) : '0.0%'}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </SectionCard>

        {/* Performance Distribution (4 Cols — placed AFTER Requests by Service) */}
        <SectionCard
          titleAr="توزيع الأداء"
          titleEn="Performance Distribution"
          icon={<Layers className="w-4 h-4" />}
          className="lg:col-span-4 flex flex-col"
          bodyClassName="p-3 flex-1 flex items-center"
        >
          <div className="w-full grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
            {/* Legend Column (RTL First = Right of Donut) */}
            <div className="sm:col-span-5 space-y-1 text-[10.5px]">
              {metrics.servicesWithMetrics.map((s, idx) => {
                const vis = getServiceVisual(s.serviceId, s.nameAr, idx);
                return (
                  <div key={s.serviceId} className="flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-xs shrink-0"
                        style={{ backgroundColor: vis.color }}
                      />
                      <span className="truncate font-bold text-[#012E5E]">{vis.shortLabel}</span>
                    </div>
                    <span className="tabular-nums text-[10px] font-bold text-slate-500 shrink-0" dir="ltr">
                      {formatPct(s.shareOfTotalPct, '0.0%')}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Donut Chart with Centered KPI (RTL Second = Left of Legend) */}
            <div className="sm:col-span-7 relative h-56 flex items-center justify-center">
              {donutData.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={donutData}
                        dataKey="receivedCount"
                        nameKey="nameAr"
                        innerRadius={54}
                        outerRadius={82}
                        paddingAngle={2}
                      >
                        {donutData.map((d, idx) => (
                          <Cell
                            key={d.serviceId}
                            fill={getServiceVisual(d.serviceId, d.nameAr, idx).color}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(val) => [`${formatNumber(Number(val ?? 0))} طلب`, 'العدد']}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-2">
                    <span className="text-2xl font-extrabold text-[#012E5E] tabular-nums leading-none" dir="ltr">
                      {formatNumber(metrics.totalReceived)}
                    </span>
                    <span className="text-[11px] font-bold text-[#012E5E] mt-1">إجمالي الطلبات</span>
                    <span className="text-[10px] text-slate-500">Total Requests</span>
                  </div>
                </>
              ) : (
                <div className="relative w-44 h-44 rounded-full border-[18px] border-[#DCE9F6] flex flex-col items-center justify-center text-center">
                  <span className="text-2xl font-extrabold text-[#012E5E] tabular-nums leading-none" dir="ltr">
                    {formatNumber(0)}
                  </span>
                  <span className="text-[11px] font-bold text-[#012E5E] mt-1">إجمالي الطلبات</span>
                  <span className="text-[10px] text-slate-400">Total Requests</span>
                </div>
              )}
            </div>
          </div>
        </SectionCard>
      </section>

      {/* ================================================================= */}
      {/* SECTION 3: ملخص الخدمات · Services Summary                        */}
      {/* ================================================================= */}
      <SectionCard
        id="sec-services"
        titleAr="ملخص الخدمات"
        titleEn="Services Summary"
        icon={<CheckCircle2 className="w-4 h-4" />}
        headerActions={
          canEdit && (
            <button
              type="button"
              onClick={() => {
                setShowAddServiceForm((prev) => !prev);
                setServiceFormError(null);
              }}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#DFC076] hover:bg-[#c8a85d] text-[#071C3A] text-[11px] font-extrabold shadow-2xs transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>إضافة خدمة جديدة</span>
            </button>
          )
        }
        bodyClassName="p-0"
      >
        {showAddServiceForm && canEdit && (
          <div className="bg-[#F4F8FC] border-b border-[#A3C0DE] px-4 py-3 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-extrabold text-[#012E5E]">إضافة بند خدمة جديد إلى التقرير</span>
              <button
                type="button"
                onClick={() => {
                  setShowAddServiceForm(false);
                  setServiceFormError(null);
                }}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
                aria-label="إغلاق نموذج إضافة خدمة"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end text-xs">
              <div className="sm:col-span-4">
                <label className="block font-bold text-[#012E5E] mb-1">اسم الخدمة (عربي) *</label>
                <input
                  type="text"
                  value={newServiceDraft.nameAr}
                  onChange={(e) => {
                    setNewServiceDraft((d) => ({ ...d, nameAr: e.target.value }));
                    if (serviceFormError) setServiceFormError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddService();
                    }
                  }}
                  placeholder="مثال: خدمات السلامة المهنية"
                  className="w-full px-2.5 py-1.5 rounded-lg border border-[#A3C0DE] bg-white font-bold text-[#012E5E] focus:border-[#1769AA] focus:outline-none"
                />
              </div>
              <div className="sm:col-span-3">
                <label className="block font-semibold text-slate-600 mb-1">الاسم بالإنجليزية (اختياري)</label>
                <input
                  type="text"
                  dir="ltr"
                  value={newServiceDraft.nameEn}
                  onChange={(e) => setNewServiceDraft((d) => ({ ...d, nameEn: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddService();
                    }
                  }}
                  placeholder="Occupational Safety"
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 focus:border-[#1769AA] focus:outline-none"
                />
              </div>
              <div className="sm:col-span-1">
                <label className="block font-semibold text-slate-600 mb-1">المستلمة</label>
                <NumericInput
                  min={0}
                  value={newServiceDraft.receivedCount}
                  onChangeValue={(v) =>
                    setNewServiceDraft((d) => ({ ...d, receivedCount: v }))
                  }
                  className="w-full px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-center font-extrabold text-[#012E5E] focus:border-[#1769AA] focus:outline-none"
                />
              </div>
              <div className="sm:col-span-1">
                <label className="block font-semibold text-slate-600 mb-1">المنفذة</label>
                <NumericInput
                  min={0}
                  value={newServiceDraft.executedCount}
                  onChangeValue={(v) =>
                    setNewServiceDraft((d) => ({ ...d, executedCount: v }))
                  }
                  className="w-full px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-center font-extrabold text-[#069B74] focus:border-[#069B74] focus:outline-none"
                />
              </div>
              <div className="sm:col-span-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleAddService}
                  className="flex-1 py-1.5 px-3 rounded-lg bg-[#012E5E] hover:bg-[#0B3969] text-white font-extrabold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5 text-[#DFC076]" />
                  <span>إضافة</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddServiceForm(false);
                    setServiceFormError(null);
                  }}
                  className="py-1.5 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 font-bold cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </div>

            {serviceFormError && (
              <p className="text-[11px] font-bold text-[#C43D47]">{serviceFormError}</p>
            )}
          </div>
        )}

        <div className="overflow-x-auto fm-scroll">
          <table className="services-summary-table w-full text-xs min-w-[780px]">
            <thead className="bg-[#DCE9F6] text-[#012E5E] border-b border-[#A3C0DE]">
              <tr>
                <th className="py-2 px-3 text-center font-extrabold w-12">#</th>
                <th className="py-2 px-3 text-start font-extrabold">الخدمة</th>
                <th className="services-summary-th-numeric py-2 px-2 text-center font-extrabold w-[110px]">المستلمة</th>
                <th className="services-summary-th-numeric py-2 px-2 text-center font-extrabold w-[110px]">المنفذة</th>
                <th className="py-2 px-3 text-center font-extrabold w-48">مؤشر الإنجاز</th>
                <th className="py-2 px-3 text-center font-extrabold w-24">النسبة</th>
                <th className="py-2 px-3 text-center font-extrabold w-36">المستوى</th>
                {canEdit && <th className="py-2 px-3 text-center font-extrabold w-24">إجراءات</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/70">
              {sortedSummaryServices.length === 0 ? (
                <tr>
                  <td
                    colSpan={canEdit ? 8 : 7}
                    className="py-6 px-4 text-center text-xs text-slate-500 font-semibold"
                  >
                    لا توجد خدمات مسجلة في هذا التقرير حالياً.
                  </td>
                </tr>
              ) : (
                sortedSummaryServices.map((s, idx) => {
                  const vis = getServiceVisual(s.serviceId, s.nameAr, idx);
                  const isEditingThis = canEdit && editingServiceId === s.serviceId;
                  const badgeCls =
                    s.level.tone === 'emerald'
                      ? 'text-[#069B74] bg-emerald-50 border-emerald-200'
                      : s.level.tone === 'blue'
                        ? 'text-[#1769AA] bg-[#EAF4FC] border-[#A3C0DE]'
                        : s.level.tone === 'amber'
                          ? 'text-amber-700 bg-amber-50 border-amber-200'
                          : s.level.tone === 'orange'
                            ? 'text-orange-700 bg-orange-50 border-orange-200'
                            : s.level.tone === 'red'
                              ? 'text-[#C43D47] bg-red-50 border-red-200'
                              : 'text-slate-600 bg-slate-100 border-slate-200';

                  return (
                    <tr
                      key={s.serviceId}
                      className={
                        idx % 2 === 1
                          ? 'bg-[#E4EBF1]/55 hover:bg-[#DCE9F6]/60'
                          : 'bg-[#FEFEFE] hover:bg-[#F4F7FB]'
                      }
                    >
                      <td className="py-1.5 px-3 text-center tabular-nums font-bold text-slate-600" dir="ltr">
                        {formatNumber(idx + 1)}
                      </td>
                      <td className="py-1.5 px-3 font-bold text-[#012E5E]">
                        {isEditingThis ? (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <input
                              id={`field-svc-name-${s.serviceId}`}
                              type="text"
                              value={editServiceDraft.nameAr}
                              onChange={(e) =>
                                setEditServiceDraft((d) => ({ ...d, nameAr: e.target.value }))
                              }
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleCommitEditService();
                                } else if (e.key === 'Escape') {
                                  setEditingServiceId(null);
                                }
                              }}
                              placeholder="اسم الخدمة (عربي)"
                              className="min-w-[160px] flex-1 px-2 py-1 rounded border border-[#1769AA] bg-white text-xs font-bold text-[#012E5E] focus:outline-none"
                            />
                            <input
                              type="text"
                              dir="ltr"
                              value={editServiceDraft.nameEn}
                              onChange={(e) =>
                                setEditServiceDraft((d) => ({ ...d, nameEn: e.target.value }))
                              }
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleCommitEditService();
                                } else if (e.key === 'Escape') {
                                  setEditingServiceId(null);
                                }
                              }}
                              placeholder="English name"
                              className="w-36 px-2 py-1 rounded border border-slate-300 bg-white text-[11px] font-medium text-slate-600 focus:border-[#1769AA] focus:outline-none"
                            />
                          </div>
                        ) : (
                          <div id={`field-svc-name-${s.serviceId}`} className="flex items-center gap-2">
                            <span style={{ color: vis.color }} className="shrink-0">
                              {vis.renderIcon('w-4 h-4')}
                            </span>
                            <span>{s.nameAr}</span>
                          </div>
                        )}
                      </td>
                      <td className="services-summary-td-numeric py-1 px-2 text-center align-middle">
                        <div className="services-summary-cell">
                          {(s.serviceId === 'svc_reception' && metrics.linkedReception.hasLinkedColumns) ||
                          (isLogisticsServiceRow(s) && report.logistics.length > 0) ? (
                            <output
                              id={`field-svc-received-${s.serviceId}`}
                              dir="ltr"
                              title="يتم تحديث العدد تلقائياً"
                              className="services-summary-numeric-input services-summary-numeric-box received-input"
                            >
                              {formatNumber(s.receivedCount)}
                            </output>
                          ) : (
                            <NumericInput
                              id={`field-svc-received-${s.serviceId}`}
                              min={0}
                              disabled={!canEdit}
                              value={s.receivedCount}
                              onChangeValue={(v) => {
                                onChangeReport((prev) => ({
                                  ...prev,
                                  services: prev.services.map((item) =>
                                    item.serviceId === s.serviceId ? { ...item, receivedCount: v } : item
                                  ),
                                }));
                              }}
                              className="services-summary-numeric-input services-summary-numeric-box received-input focus:border-[#1769AA]"
                            />
                          )}
                        </div>
                      </td>
                      <td className="services-summary-td-numeric py-1 px-2 text-center align-middle">
                        <div className="services-summary-cell">
                          {s.serviceId === 'svc_reception' && metrics.linkedReception.hasLinkedColumns ? (
                            <output
                              id={`field-svc-executed-${s.serviceId}`}
                              dir="ltr"
                              title="يتم تحديث العدد تلقائياً"
                              className="services-summary-numeric-input services-summary-numeric-box completed-input"
                            >
                              {formatNumber(s.executedCount)}
                            </output>
                          ) : (
                            <NumericInput
                              id={`field-svc-executed-${s.serviceId}`}
                              min={0}
                              disabled={!canEdit}
                              value={s.executedCount}
                              onChangeValue={(v) => {
                                onChangeReport((prev) => ({
                                  ...prev,
                                  services: prev.services.map((item) =>
                                    item.serviceId === s.serviceId ? { ...item, executedCount: v } : item
                                  ),
                                }));
                              }}
                              className="services-summary-numeric-input services-summary-numeric-box completed-input focus:border-[#069B74]"
                            />
                          )}
                        </div>
                        {s.executedCount > s.receivedCount && (
                          <span className="block text-[9.5px] font-bold text-[#D99A22] mt-0.5 leading-tight">
                            تجاوزت المستلمة
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 px-3">
                        <div className="h-2.5 bg-slate-200/90 rounded-sm overflow-hidden">
                          <div
                            className={`h-full transition-all rounded-sm ${
                              s.completionPct !== null && s.completionPct < thresholds.needsImprovementMin
                                ? 'bg-gradient-to-r from-[#D99B26] to-[#F4B942]'
                                : 'bg-gradient-to-r from-[#06895B] to-[#24B678]'
                            }`}
                            style={{ width: `${Math.min(100, s.completionPct ?? 0)}%` }}
                          />
                        </div>
                      </td>
                      <td className="py-1.5 px-3 text-center font-extrabold tabular-nums text-[#012E5E]" dir="ltr">
                        {formatPct(s.completionPct, '0.0%')}
                      </td>
                      <td className="py-1.5 px-3 text-center">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-md border text-[11px] font-extrabold ${badgeCls}`}
                        >
                          {s.level.tone === 'neutral' ? 'لا تتوفر بيانات' : s.level.labelAr}
                        </span>
                      </td>
                      {canEdit && (
                        <td className="py-1 px-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {isEditingThis ? (
                              <>
                                <button
                                  type="button"
                                  onClick={handleCommitEditService}
                                  title="حفظ التعديل"
                                  aria-label={`حفظ تعديل ${s.nameAr}`}
                                  className="p-1.5 rounded-md bg-[#069B74] hover:bg-[#058261] text-white cursor-pointer"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingServiceId(null)}
                                  title="إلغاء التعديل"
                                  aria-label="إلغاء تعديل الخدمة"
                                  className="p-1.5 rounded-md border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 cursor-pointer"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleStartEditService(s.serviceId)}
                                  title="تعديل اسم الخدمة"
                                  aria-label={`تعديل ${s.nameAr}`}
                                  className="p-1.5 rounded-md border border-slate-200 bg-white hover:bg-[#EAF4FC] text-[#1769AA] cursor-pointer"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteService(s.serviceId)}
                                  title="حذف الخدمة"
                                  aria-label={`حذف ${s.nameAr}`}
                                  className="p-1.5 rounded-md border border-red-200 bg-white hover:bg-red-50 text-[#C43D47] cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
            <tfoot className="bg-[#012E5E] text-white font-extrabold">
              <tr>
                <td colSpan={2} className="py-2 px-3">
                  الإجمالي · Total ({formatNumber(sortedSummaryServices.length)})
                </td>
                <td className="services-summary-td-numeric py-2 px-2 text-center tabular-nums text-[#DFC076]" dir="ltr">
                  {formatNumber(metrics.totalReceived)}
                </td>
                <td className="services-summary-td-numeric py-2 px-2 text-center tabular-nums text-[#DFC076]" dir="ltr">
                  {formatNumber(metrics.totalExecuted)}
                </td>
                <td className="py-2 px-3" />
                <td className="py-2 px-3 text-center tabular-nums text-[#DFC076]" dir="ltr">
                  {formatPct(metrics.overallCompletionPct, '0.0%')}
                </td>
                <td className="py-2 px-3 text-center">—</td>
                {canEdit && <td className="py-2 px-3" />}
              </tr>
            </tfoot>
          </table>
        </div>
      </SectionCard>

      {/* ================================================================= */}
      {/* SECTIONS 4 & 5: Contracts (Visual RIGHT) & Safety (Visual LEFT)   */}
      {/* ================================================================= */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-stretch">
        {/* SECTION 4 (Visual RIGHT in RTL): Contracts & Licenses */}
        <SectionCard
          id="sec-contracts"
          titleAr="العقود والرخص"
          titleEn="Contracts & Licenses"
          icon={<Briefcase className="w-4 h-4" />}
          bodyClassName="p-3"
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {orderedContracts.map((con) => {
              const tint = contractTints[con.groupKey] || {
                headerBg: 'bg-[#DCE9F7] text-[#012E5E]',
                borderCls: 'border-slate-200',
              };
              const noteOpen = !!expandedNotes[`contract_${con.groupKey}`];
              const hasNote = con.notes.trim().length > 0;
              return (
                <div
                  key={con.groupKey}
                  className={`rounded-xl border ${tint.borderCls} bg-white overflow-hidden flex flex-col justify-between shadow-2xs`}
                >
                  <div className={`${tint.headerBg} px-2.5 py-1.5 text-center border-b ${tint.borderCls}`}>
                    <h3 className="text-xs font-extrabold">{con.nameAr}</h3>
                    <p className="text-[10px] font-semibold opacity-75">{con.nameEn}</p>
                  </div>

                  <div className="p-2.5 space-y-2">
                    <div className="grid grid-cols-2 divide-x divide-x-reverse divide-slate-200 text-center">
                      <div className="px-1 py-1">
                        <NumericInput
                          id={`field-con-active-${con.groupKey}`}
                          min={0}
                          disabled={!canEdit}
                          ariaLabel={`${con.nameAr} فعالة`}
                          value={con.activeCount}
                          onChangeValue={(v) => {
                            onChangeReport((prev) => ({
                              ...prev,
                              contracts: prev.contracts.map((c) =>
                                c.groupKey === con.groupKey ? { ...c, activeCount: v } : c
                              ),
                            }));
                          }}
                          className="w-24 h-8 rounded-lg border border-[#C5D8EE] bg-white text-center text-base font-extrabold text-[#069B74] focus:border-[#176DAA] focus:outline-none disabled:bg-slate-50"
                        />
                        <span className="block text-[10px] font-bold text-[#069B74] mt-1">فعالة</span>
                        <span className="block text-[9px] text-emerald-700/75">Active</span>
                      </div>

                      <div className="px-1 py-1">
                        <NumericInput
                          id={`field-con-inactive-${con.groupKey}`}
                          min={0}
                          disabled={!canEdit}
                          ariaLabel={`${con.nameAr} غير فعالة`}
                          value={con.inactiveCount}
                          onChangeValue={(v) => {
                            onChangeReport((prev) => ({
                              ...prev,
                              contracts: prev.contracts.map((c) =>
                                c.groupKey === con.groupKey ? { ...c, inactiveCount: v } : c
                              ),
                            }));
                          }}
                          className="w-24 h-8 rounded-lg border border-[#C5D8EE] bg-white text-center text-base font-extrabold text-[#C43D47] focus:border-[#176DAA] focus:outline-none disabled:bg-slate-50"
                        />
                        <span className="block text-[10px] font-bold text-[#C43D47] mt-1">غير فعالة</span>
                        <span className="block text-[9px] text-red-700/75">Inactive</span>
                      </div>
                    </div>

                    <div className="pt-1 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedNotes((prev) => ({
                            ...prev,
                            [`contract_${con.groupKey}`]: !prev[`contract_${con.groupKey}`],
                          }))
                        }
                        className="w-full flex items-center justify-between text-[10px] font-bold text-slate-600 hover:text-[#012E5E] py-0.5 cursor-pointer"
                      >
                        <span className="flex items-center gap-1 truncate">
                          <MessageSquare className="w-3 h-3 text-[#C99E4A] shrink-0" />
                          <span>{hasNote ? 'ملاحظات (مضافة)' : 'ملاحظات'}</span>
                        </span>
                        <span className="text-[9.5px] text-[#1769AA] shrink-0">{noteOpen ? 'إخفاء' : 'تعديل'}</span>
                      </button>
                      {noteOpen && (
                        <textarea
                          rows={2}
                          disabled={!canEdit}
                          value={con.notes}
                          onChange={(e) => {
                            const val = e.target.value;
                            onChangeReport((prev) => ({
                              ...prev,
                              contracts: prev.contracts.map((c) =>
                                c.groupKey === con.groupKey ? { ...c, notes: val } : c
                              ),
                            }));
                          }}
                          placeholder="ملاحظات البند..."
                          className="mt-1.5 w-full px-2 py-1.5 rounded-lg border border-slate-200 bg-[#F8FAFC] text-[11px] focus:border-[#1769AA] focus:bg-white focus:outline-none disabled:bg-slate-50"
                        />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </SectionCard>

        {/* SECTION 5 (Visual LEFT in RTL): Fire Extinguishers & Hazard Notes */}
        <SectionCard
          id="sec-safety"
          titleAr="الطفايات وملاحظات المخاطر"
          titleEn="Fire Extinguishers & Hazard Notes"
          icon={<Flame className="w-4 h-4" />}
          headerActions={
            (metrics.safetyAlerts.hasInactiveExtinguishers || metrics.safetyAlerts.hasOpenHazards) && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-red-500/20 border border-red-300/50 text-[10px] font-bold text-red-100">
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>تتطلب المتابعة</span>
              </span>
            )
          }
          bodyClassName="p-3"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {orderedSafety.map((sf) => {
              const isExt = sf.groupKey === 'fire_extinguishers';
              const thumb = isExt ? fireExtImg : safetyImg;
              const noteOpen = !!expandedNotes[`safety_${sf.groupKey}`];
              const hasNote = sf.notes.trim().length > 0;
              return (
                <div
                  key={sf.groupKey}
                  className="rounded-xl border border-[#A3C0DE]/70 bg-white overflow-hidden flex flex-col justify-between shadow-2xs"
                >
                  <div className="bg-[#EEF4FA] px-3 py-1.5 text-center border-b border-slate-200">
                    <h3 className="text-xs font-extrabold text-[#012E5E]">{sf.nameAr}</h3>
                    <p className="text-[10px] font-semibold text-slate-500">{sf.nameEn}</p>
                  </div>

                  <div className="p-2.5 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-16 rounded-lg overflow-hidden border border-slate-200 shrink-0">
                        <img
                          src={thumb}
                          alt={sf.nameAr}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      </div>

                      <div className="flex-1 grid grid-cols-2 divide-x divide-x-reverse divide-slate-200 text-center">
                        <div className="px-1.5 py-1 flex flex-col items-center justify-center">
                          <NumericInput
                            id={`field-safety-primary-${sf.groupKey}`}
                            min={0}
                            disabled={!canEdit}
                            ariaLabel={`${sf.nameAr} ${sf.primaryLabelAr}`}
                            value={sf.primaryCount}
                            onChangeValue={(v) => {
                              onChangeReport((prev) => ({
                                ...prev,
                                safety: prev.safety.map((item) =>
                                  item.groupKey === sf.groupKey ? { ...item, primaryCount: v } : item
                                ),
                              }));
                            }}
                            className="w-24 h-8 rounded-lg border border-[#C5D8EE] bg-white text-center text-base font-extrabold text-[#069B74] focus:border-[#176DAA] focus:outline-none disabled:bg-slate-50"
                          />
                          <span className="block text-[10px] font-bold text-[#069B74] mt-1">
                            {sf.primaryLabelAr}
                          </span>
                          <span className="block text-[9px] text-emerald-700/75">
                            {sf.primaryLabelEn}
                          </span>
                        </div>

                        <div className="px-1.5 py-1 flex flex-col items-center justify-center">
                          <NumericInput
                            id={`field-safety-secondary-${sf.groupKey}`}
                            min={0}
                            disabled={!canEdit}
                            ariaLabel={`${sf.nameAr} ${sf.secondaryLabelAr}`}
                            value={sf.secondaryCount}
                            onChangeValue={(v) => {
                              onChangeReport((prev) => ({
                                ...prev,
                                safety: prev.safety.map((item) =>
                                  item.groupKey === sf.groupKey
                                    ? { ...item, secondaryCount: v }
                                    : item
                                ),
                              }));
                            }}
                            className="w-24 h-8 rounded-lg border border-[#C5D8EE] bg-white text-center text-base font-extrabold text-[#C43D47] focus:border-[#176DAA] focus:outline-none disabled:bg-slate-50"
                          />
                          <span className="block text-[10px] font-bold text-[#C43D47] mt-1">
                            {sf.secondaryLabelAr}
                          </span>
                          <span className="block text-[9px] text-red-700/75">
                            {sf.secondaryLabelEn}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-1 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedNotes((prev) => ({
                            ...prev,
                            [`safety_${sf.groupKey}`]: !prev[`safety_${sf.groupKey}`],
                          }))
                        }
                        className="w-full flex items-center justify-between text-[10.5px] font-bold text-slate-600 hover:text-[#012E5E] py-0.5 cursor-pointer"
                      >
                        <span className="flex items-center gap-1">
                          <MessageSquare className="w-3 h-3 text-[#C99E4A]" />
                          <span>{hasNote ? 'ملاحظات السلامة (مضافة)' : 'ملاحظات الفحص والسلامة'}</span>
                        </span>
                        <span className="text-[10px] text-[#1769AA]">{noteOpen ? 'إخفاء' : 'عرض / تعديل'}</span>
                      </button>
                      {noteOpen && (
                        <textarea
                          rows={2}
                          disabled={!canEdit}
                          value={sf.notes}
                          onChange={(e) => {
                            const val = e.target.value;
                            onChangeReport((prev) => ({
                              ...prev,
                              safety: prev.safety.map((item) =>
                                item.groupKey === sf.groupKey ? { ...item, notes: val } : item
                              ),
                            }));
                          }}
                          placeholder="ملاحظات الفحص والسلامة..."
                          className="mt-1.5 w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-[#F8FAFC] text-[11px] focus:border-[#1769AA] focus:bg-white focus:outline-none disabled:bg-slate-50"
                        />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </SectionCard>
      </div>

      {/* ================================================================= */}
      {/* FULL INTERACTIVE OPERATIONAL EDITING TABLES (SECTIONS 6 - 12)     */}
      {/* ================================================================= */}

      {/* SECTION 6: Maintenance Details Matrix */}
      <SectionCard
        id="sec-maintenance"
        titleAr="تفاصيل الصيانة بالمقرات والتكاليف"
        titleEn="Maintenance Details & Costs"
        icon={<Wrench className="w-4 h-4" />}
        headerActions={
          <div className="flex items-center gap-1.5">
            {/* View switcher for tablet & mobile */}
            <div className="lg:hidden flex items-center bg-white/10 rounded-md p-0.5 border border-white/15">
              <button
                type="button"
                onClick={() => setMaintenanceViewMode('table')}
                className={`px-2 py-0.5 rounded text-[10.5px] font-bold cursor-pointer ${
                  maintenanceViewMode === 'table' ? 'bg-[#DFC076] text-[#071C3A]' : 'text-white'
                }`}
              >
                جدول
              </button>
              <button
                type="button"
                onClick={() => setMaintenanceViewMode('cards')}
                className={`px-2 py-0.5 rounded text-[10.5px] font-bold cursor-pointer ${
                  maintenanceViewMode === 'cards' ? 'bg-[#DFC076] text-[#071C3A]' : 'text-white'
                }`}
              >
                بطاقات
              </button>
            </div>
            <button
              type="button"
              onClick={() => setShowInactiveSites((p) => !p)}
              className="px-2.5 py-1 rounded bg-white/10 hover:bg-white/20 text-[11px] font-semibold text-white cursor-pointer"
            >
              {showInactiveSites ? 'إخفاء الموقوفة' : 'جميع المقرات'}
            </button>
            {canManageSites && (
              <button
                type="button"
                onClick={onOpenSitesModal}
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#DFC076] hover:bg-[#e8ce8c] text-[#071C3A] text-[11px] font-extrabold cursor-pointer"
              >
                <Building2 className="w-3.5 h-3.5" />
                <span>إدارة المقرات والفئات</span>
              </button>
            )}
          </div>
        }
        bodyClassName="p-3 sm:p-4 space-y-4"
      >
        {/* Maintenance KPI Highlight Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="p-3 rounded-xl bg-[#F4F7FB] border border-slate-200">
            <p className="text-[11px] text-slate-500 font-semibold">إجمالي الأعطال المسجلة</p>
            <p className="text-2xl font-extrabold text-[#0B2341] tabular-nums mt-0.5" dir="ltr">
              {formatNumber(metrics.maintenance.grandTotalFaults)}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-[#F4F7FB] border border-slate-200">
            <p className="text-[11px] text-slate-500 font-semibold">المقر الأعلى في الأعطال</p>
            <p className="text-sm font-extrabold text-[#C43D47] mt-1">
              {metrics.maintenance.highestFaultSite
                ? `${metrics.maintenance.highestFaultSite.nameAr} (${formatNumber(metrics.maintenance.highestFaultSite.count)})`
                : 'لا توجد أعطال مسجلة'}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-[#EAF4FC] border border-[#1769AA]/20">
            <p className="text-[11px] text-[#1769AA] font-bold">إجمالي التكلفة / النثرية</p>
            <p className="text-lg font-extrabold text-[#0B2341] tabular-nums mt-0.5" dir="ltr">
              {formatAed(metrics.maintenance.pettyCashTotalAed)}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-[#EAF4FC] border border-[#1769AA]/20">
            <p className="text-[11px] text-[#1769AA] font-bold">إجمالي التكلفة / أمر شراء</p>
            <p className="text-lg font-extrabold text-[#0B2341] tabular-nums mt-0.5" dir="ltr">
              {formatAed(metrics.maintenance.purchaseOrderTotalAed)}
            </p>
          </div>
        </div>

        {/* Interactive Sites x Categories Matrix — Desktop Zero-Scroll Optimization */}
        {(() => {
          const catCount = Math.max(1, categories.length);
          const siteColPct = 14;
          const totalColPct = 8.8;
          const catColPct = (100 - siteColPct - totalColPct) / catCount;

          return (
            <div
              className={`maintenance-table-wrapper border border-[#B8CEE6] rounded-xl overflow-hidden shadow-2xs ${
                maintenanceViewMode === 'cards' ? 'hidden lg:block' : 'block overflow-x-auto lg:overflow-x-visible'
              }`}
            >
              <table className="maintenance-table w-full">
                <colgroup>
                  <col style={{ width: `${siteColPct}%` }} />
                  {categories.map((c) => (
                    <col key={c.id} style={{ width: `${catColPct}%` }} />
                  ))}
                  <col style={{ width: `${totalColPct}%` }} />
                </colgroup>
                <thead className="bg-[#0B2341] text-white">
                  <tr>
                    <th className="py-2.5 px-2 text-start font-extrabold text-xs bg-[#0B2341] border-l border-white/10 select-none">
                      المقرات / البيان
                    </th>
                    {categories.map((cat) => (
                      <th
                        key={cat.id}
                        className="maintenance-th-cat text-white border-l border-white/10 select-none"
                        title={cat.nameAr}
                      >
                        <span className="block max-w-full break-words leading-[1.2] text-[10.5px] sm:text-[11px]">
                          {cat.nameAr}
                        </span>
                      </th>
                    ))}
                    <th className="py-2.5 px-1 text-center font-extrabold text-xs bg-[#1769AA] text-white select-none">
                      إجمالي الأعطال
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/80">
                  {visibleSites.map((site, sIdx) => {
                    const isHighest = metrics.maintenance.highestFaultSite?.siteId === site.id;
                    return (
                      <tr
                        key={site.id}
                        className={`h-[42px] transition-colors ${
                          isHighest
                            ? 'bg-red-50/45 hover:bg-red-50/70'
                            : sIdx % 2 === 1
                              ? 'bg-[#F4F8FC] hover:bg-[#EAF2FA]'
                              : 'bg-white hover:bg-[#F9FBFE]'
                        }`}
                      >
                        <td className="py-1 px-2 font-bold text-[#0B2341] border-l border-slate-200 text-start align-middle">
                          <div className="flex items-center justify-between gap-1 min-w-0">
                            <span className="truncate text-xs" title={site.nameAr}>
                              {site.nameAr}
                            </span>
                            {isHighest && (
                              <span className="shrink-0 text-[9px] font-extrabold text-[#C43D47] bg-red-100/80 border border-red-200 px-1 py-0.5 rounded">
                                الأعلى
                              </span>
                            )}
                          </div>
                        </td>
                        {categories.map((cat) => {
                          const val = report.maintenanceMatrix[site.id]?.[cat.id] ?? 0;
                          const isNonZero = val > 0;
                          return (
                            <td
                              key={cat.id}
                              className="py-1 px-0.5 text-center align-middle border-l border-slate-200/70"
                            >
                              <NumericInput
                                id={`field-maint-${site.id}-${cat.id}`}
                                min={0}
                                disabled={!canEdit}
                                value={val}
                                aria-label={`عدد أعطال ${cat.nameAr} في ${site.nameAr}`}
                                onChangeValue={(v) => {
                                  onChangeReport((prev) => ({
                                    ...prev,
                                    maintenanceMatrix: {
                                      ...prev.maintenanceMatrix,
                                      [site.id]: {
                                        ...(prev.maintenanceMatrix[site.id] || {}),
                                        [cat.id]: v,
                                      },
                                    },
                                  }));
                                }}
                                className={`w-full matrix-numeric-input ${
                                  isNonZero ? 'matrix-numeric-input--active' : ''
                                }`}
                              />
                            </td>
                          );
                        })}
                        <td
                          className="py-1 px-1 text-center font-extrabold tabular-nums bg-[#EAF2FA] text-[#0B2341] text-xs align-middle"
                          dir="ltr"
                        >
                          {formatNumber(metrics.maintenance.siteTotals[site.id] ?? 0)}
                        </td>
                      </tr>
                    );
                  })}

                  {/* Total Faults Row */}
                  <tr className="bg-[#DCE9F6] font-extrabold text-[#0B2341] border-t-2 border-[#1769AA]/50 h-[40px]">
                    <td className="py-2 px-2 text-start bg-[#DCE9F6] border-l border-slate-300 text-xs align-middle">
                      إجمالي عدد الأعطال
                    </td>
                    {categories.map((cat) => (
                      <td
                        key={cat.id}
                        className="py-2 px-0.5 text-center tabular-nums text-xs font-extrabold border-l border-slate-300/80 align-middle"
                        dir="ltr"
                      >
                        {formatNumber(metrics.maintenance.categoryTotals[cat.id] ?? 0)}
                      </td>
                    ))}
                    <td
                      className="py-2 px-1 text-center tabular-nums bg-[#04244B] text-[#DFC076] text-xs font-black align-middle"
                      dir="ltr"
                    >
                      {formatNumber(metrics.maintenance.grandTotalFaults)}
                    </td>
                  </tr>

                  {/* Petty Cash Cost Row (AED) */}
                  <tr className="bg-[#F8FAFD] h-[40px]">
                    <td className="py-1.5 px-2 font-bold text-[#1769AA] text-xs bg-[#EBF3FB] border-l border-slate-200 text-start align-middle">
                      <div className="flex items-center gap-1 min-w-0">
                        <Coins className="w-3.5 h-3.5 text-[#C99E4A] shrink-0" />
                        <span className="truncate">التكلفة / النثرية (AED)</span>
                      </div>
                    </td>
                    {categories.map((cat) => {
                      const val = report.maintenanceCosts[cat.id]?.pettyCashAed ?? 0;
                      return (
                        <td
                          key={cat.id}
                          className="py-1 px-0.5 text-center align-middle border-l border-slate-200/70"
                        >
                          <NumericInput
                            id={`field-cost-petty-${cat.id}`}
                            decimal
                            min={0}
                            disabled={!canEdit}
                            value={val}
                            aria-label={`تكلفة النثرية - ${cat.nameAr}`}
                            onChangeValue={(v) => {
                              onChangeReport((prev) => ({
                                ...prev,
                                maintenanceCosts: {
                                  ...prev.maintenanceCosts,
                                  [cat.id]: {
                                    categoryId: cat.id,
                                    pettyCashAed: v,
                                    purchaseOrderAed: prev.maintenanceCosts[cat.id]?.purchaseOrderAed ?? 0,
                                  },
                                },
                              }));
                            }}
                            className="w-full matrix-numeric-input matrix-numeric-input--decimal"
                          />
                        </td>
                      );
                    })}
                    <td
                      className="py-1.5 px-1 text-center font-extrabold tabular-nums text-[#0B2341] text-[11px] align-middle bg-[#EAF2FA]"
                      dir="ltr"
                    >
                      <span className="block truncate" title={formatAed(metrics.maintenance.pettyCashTotalAed)}>
                        {formatAed(metrics.maintenance.pettyCashTotalAed)}
                      </span>
                    </td>
                  </tr>

                  {/* Purchase Order Cost Row (AED) */}
                  <tr className="bg-[#F8FAFD] h-[40px]">
                    <td className="py-1.5 px-2 font-bold text-[#1769AA] text-xs bg-[#EBF3FB] border-l border-slate-200 text-start align-middle">
                      <div className="flex items-center gap-1 min-w-0">
                        <Briefcase className="w-3.5 h-3.5 text-[#1769AA] shrink-0" />
                        <span className="truncate">التكلفة / أمر شراء (AED)</span>
                      </div>
                    </td>
                    {categories.map((cat) => {
                      const val = report.maintenanceCosts[cat.id]?.purchaseOrderAed ?? 0;
                      return (
                        <td
                          key={cat.id}
                          className="py-1 px-0.5 text-center align-middle border-l border-slate-200/70"
                        >
                          <NumericInput
                            id={`field-cost-po-${cat.id}`}
                            decimal
                            min={0}
                            disabled={!canEdit}
                            value={val}
                            aria-label={`تكلفة أمر الشراء - ${cat.nameAr}`}
                            onChangeValue={(v) => {
                              onChangeReport((prev) => ({
                                ...prev,
                                maintenanceCosts: {
                                  ...prev.maintenanceCosts,
                                  [cat.id]: {
                                    categoryId: cat.id,
                                    pettyCashAed: prev.maintenanceCosts[cat.id]?.pettyCashAed ?? 0,
                                    purchaseOrderAed: v,
                                  },
                                },
                              }));
                            }}
                            className="w-full matrix-numeric-input matrix-numeric-input--decimal"
                          />
                        </td>
                      );
                    })}
                    <td
                      className="py-1.5 px-1 text-center font-extrabold tabular-nums text-[#0B2341] text-[11px] align-middle bg-[#EAF2FA]"
                      dir="ltr"
                    >
                      <span className="block truncate" title={formatAed(metrics.maintenance.purchaseOrderTotalAed)}>
                        {formatAed(metrics.maintenance.purchaseOrderTotalAed)}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          );
        })()}

        {/* Mobile / Tablet Adaptive Card View */}
        <div className={`lg:hidden space-y-3 ${maintenanceViewMode === 'cards' ? 'block' : 'hidden'}`}>
          {visibleSites.map((site) => {
            const isHighest = metrics.maintenance.highestFaultSite?.siteId === site.id;
            const siteTotal = metrics.maintenance.siteTotals[site.id] ?? 0;
            return (
              <div
                key={site.id}
                className="rounded-xl border border-[#B8CEE6] bg-white p-3.5 space-y-3 shadow-2xs"
              >
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-[#1769AA]" />
                    <span className="font-extrabold text-sm text-[#012E5E]">{site.nameAr}</span>
                    {isHighest && (
                      <span className="text-[10px] font-bold text-[#C43D47] bg-red-50 border border-red-200 px-1.5 py-0.5 rounded">
                        الأعلى أعطالاً
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 bg-[#EAF2FA] px-2.5 py-1 rounded-lg">
                    <span className="text-[11px] font-bold text-slate-600">المجموع:</span>
                    <span className="font-extrabold text-sm text-[#012E5E] tabular-nums" dir="ltr">
                      {formatNumber(siteTotal)}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {categories.map((cat) => {
                    const val = report.maintenanceMatrix[site.id]?.[cat.id] ?? 0;
                    return (
                      <div
                        key={cat.id}
                        className="p-2 rounded-lg border border-slate-100 bg-[#F8FAFD] flex items-center justify-between gap-1.5"
                      >
                        <span className="text-[11px] font-bold text-slate-700 truncate" title={cat.nameAr}>
                          {cat.nameAr}
                        </span>
                        <div className="w-16 shrink-0">
                          <NumericInput
                            data-field-id={`field-maint-${site.id}-${cat.id}`}
                            min={0}
                            disabled={!canEdit}
                            value={val}
                            aria-label={`عدد أعطال ${cat.nameAr} في ${site.nameAr}`}
                            onChangeValue={(v) => {
                              onChangeReport((prev) => ({
                                ...prev,
                                maintenanceMatrix: {
                                  ...prev.maintenanceMatrix,
                                  [site.id]: {
                                    ...(prev.maintenanceMatrix[site.id] || {}),
                                    [cat.id]: v,
                                  },
                                },
                              }));
                            }}
                            className="w-full matrix-numeric-input"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Mobile Costs Card */}
          <div className="rounded-xl border border-[#B8CEE6] bg-white p-3.5 space-y-3 shadow-2xs">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="font-extrabold text-sm text-[#012E5E]">تكاليف الصيانة حسب الفئات (AED)</span>
              <span className="text-xs font-bold text-[#1769AA]" dir="ltr">
                {formatAed(metrics.maintenance.grandTotalCostAed)}
              </span>
            </div>
            <div className="space-y-2">
              {categories.map((cat) => {
                const petty = report.maintenanceCosts[cat.id]?.pettyCashAed ?? 0;
                const po = report.maintenanceCosts[cat.id]?.purchaseOrderAed ?? 0;
                return (
                  <div
                    key={cat.id}
                    className="p-2.5 rounded-lg border border-slate-100 bg-[#F8FAFD] flex flex-wrap items-center justify-between gap-2 text-xs"
                  >
                    <span className="font-bold text-[#012E5E] min-w-[120px]">{cat.nameAr}</span>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1">
                        <span className="text-[10.5px] text-slate-500">نثرية:</span>
                        <div className="w-18">
                          <NumericInput
                            data-field-id={`field-cost-petty-${cat.id}`}
                            decimal
                            min={0}
                            disabled={!canEdit}
                            value={petty}
                            onChangeValue={(v) => {
                              onChangeReport((prev) => ({
                                ...prev,
                                maintenanceCosts: {
                                  ...prev.maintenanceCosts,
                                  [cat.id]: {
                                    categoryId: cat.id,
                                    pettyCashAed: v,
                                    purchaseOrderAed: prev.maintenanceCosts[cat.id]?.purchaseOrderAed ?? 0,
                                  },
                                },
                              }));
                            }}
                            className="w-full matrix-numeric-input matrix-numeric-input--decimal"
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[10.5px] text-slate-500">أمر شراء:</span>
                        <div className="w-18">
                          <NumericInput
                            data-field-id={`field-cost-po-${cat.id}`}
                            decimal
                            min={0}
                            disabled={!canEdit}
                            value={po}
                            onChangeValue={(v) => {
                              onChangeReport((prev) => ({
                                ...prev,
                                maintenanceCosts: {
                                  ...prev.maintenanceCosts,
                                  [cat.id]: {
                                    categoryId: cat.id,
                                    pettyCashAed: prev.maintenanceCosts[cat.id]?.pettyCashAed ?? 0,
                                    purchaseOrderAed: v,
                                  },
                                },
                              }));
                            }}
                            className="w-full matrix-numeric-input matrix-numeric-input--decimal"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Site Faults Executive Horizontal Comparison Chart */}
        <MaintenanceSiteHorizontalChart
          sites={visibleSites}
          categories={categories}
          siteTotals={metrics.maintenance.siteTotals}
          maintenanceMatrix={report.maintenanceMatrix}
          grandTotalFaults={metrics.maintenance.grandTotalFaults}
          grandTotalCostAed={metrics.maintenance.grandTotalCostAed}
        />
      </SectionCard>

      {/* SECTION 7 & 8: Logistics (Visual RIGHT in RTL) + Maintenance Services (Visual LEFT in RTL) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        {/* SECTION 8 (Visual RIGHT in RTL): Logistics */}
        <SectionCard
          id="sec-logistics"
          titleAr="الدعم اللوجستي"
          titleEn="Logistics Channels"
          icon={<Truck className="w-4 h-4" />}
          className="lg:col-span-7 flex flex-col h-full"
          bodyClassName="p-4 flex-1 flex flex-col gap-3"
        >
          <div className="overflow-x-auto border border-slate-200 rounded-xl shrink-0">
            <table className="w-full text-xs min-w-[520px]">
              <thead className="bg-[#DCE9F6] text-[#0B2341]">
                <tr>
                  <th className="py-2 px-3 text-start">البيان</th>
                  {report.logistics.map((ch) => (
                    <th key={ch.channelKey} className="py-2 px-2 text-center">
                      {ch.nameAr}
                    </th>
                  ))}
                  <th className="py-2 px-3 text-center bg-[#071E3D] text-white">الإجمالي</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <td className="py-2 px-3 font-bold text-[#0B2341]">الطلبات</td>
                  {report.logistics.map((ch) => (
                    <td key={ch.channelKey} className="py-1.5 px-1.5 text-center">
                      <NumericInput
                        id={`field-log-${ch.channelKey}`}
                        min={0}
                        disabled={!canEdit}
                        value={ch.requestCount}
                        onChangeValue={(v) => {
                          onChangeReport((prev) => ({
                            ...prev,
                            logistics: prev.logistics.map((item) =>
                              item.channelKey === ch.channelKey ? { ...item, requestCount: v } : item
                            ),
                          }));
                        }}
                        className="w-16 px-1.5 py-1 rounded border border-slate-200 bg-[#EEF5FC]/70 text-center font-extrabold focus:border-[#1769AA] focus:outline-none disabled:bg-slate-50"
                      />
                    </td>
                  ))}
                  <td className="py-2 px-3 text-center font-extrabold tabular-nums bg-slate-50" dir="ltr">
                    {formatNumber(metrics.logisticsTotal)}
                  </td>
                </tr>
                <tr className="bg-[#F4F8FC]">
                  <td className="py-2 px-3 font-bold text-[#1769AA]">النسبة المئوية</td>
                  {metrics.logisticsWithPct.map((ch) => (
                    <td key={ch.channelKey} className="py-2 px-2 text-center font-bold tabular-nums text-[#0B2341]" dir="ltr">
                      {formatPct(ch.sharePct, '0.0%')}
                    </td>
                  ))}
                  <td className="py-2 px-3 text-center font-bold tabular-nums" dir="ltr">
                    {metrics.logisticsTotal > 0 ? formatPercentage(100) : '0.0%'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <LogisticsHorizontalChart channels={report.logistics} className="flex-1" />
        </SectionCard>

        {/* SECTION 7 (Visual LEFT in RTL): Maintenance Services */}
        <SectionCard
          id="sec-maint-services"
          titleAr="خدمات الصيانة (مصادر الطلبات)"
          titleEn="Maintenance Services"
          icon={<Wrench className="w-4 h-4" />}
          className="lg:col-span-5 flex flex-col h-full"
          bodyClassName="p-4 flex-1 flex flex-col gap-3"
        >
          <div className="overflow-x-auto border border-slate-200 rounded-xl shrink-0">
            <table className="w-full text-xs">
              <thead className="bg-[#DCE9F6] text-[#0B2341]">
                <tr>
                  <th className="py-2 px-3 text-center w-10">م</th>
                  <th className="py-2 px-3 text-start">مصدر الطلبات</th>
                  <th className="py-2 px-3 text-center w-32">العدد</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <td className="py-2 px-3 text-center tabular-nums" dir="ltr">
                    {formatNumber(1)}
                  </td>
                  <td className="py-2 px-3 font-bold text-[#0B2341]">
                    طلبات الصيانة الواردة من قسم المرافق
                  </td>
                  <td className="py-1.5 px-3 text-center">
                    <NumericInput
                      id="field-maint-svc-facilities"
                      min={0}
                      disabled={!canEdit}
                      value={report.maintenanceServices.fromFacilitiesDept}
                      onChangeValue={(v) => {
                        onChangeReport((prev) => ({
                          ...prev,
                          maintenanceServices: { ...prev.maintenanceServices, fromFacilitiesDept: v },
                        }));
                      }}
                      className="w-24 px-2 py-1 rounded border border-slate-200 bg-[#EEF5FC]/70 text-center font-extrabold focus:border-[#1769AA] focus:outline-none disabled:bg-slate-50"
                    />
                  </td>
                </tr>
                <tr>
                  <td className="py-2 px-3 text-center tabular-nums" dir="ltr">
                    {formatNumber(2)}
                  </td>
                  <td className="py-2 px-3 font-bold text-[#0B2341]">
                    طلبات الصيانة الواردة من الإدارات الأخرى
                  </td>
                  <td className="py-1.5 px-3 text-center">
                    <NumericInput
                      id="field-maint-svc-other"
                      min={0}
                      disabled={!canEdit}
                      value={report.maintenanceServices.fromOtherDepts}
                      onChangeValue={(v) => {
                        onChangeReport((prev) => ({
                          ...prev,
                          maintenanceServices: { ...prev.maintenanceServices, fromOtherDepts: v },
                        }));
                      }}
                      className="w-24 px-2 py-1 rounded border border-slate-200 bg-[#EEF5FC]/70 text-center font-extrabold focus:border-[#1769AA] focus:outline-none disabled:bg-slate-50"
                    />
                  </td>
                </tr>
              </tbody>
              <tfoot className="bg-[#071E3D] text-white font-extrabold">
                <tr>
                  <td colSpan={2} className="py-2 px-3">
                    الإجمالي · Total
                  </td>
                  <td className="py-2 px-3 text-center tabular-nums text-[#DFC076]">
                    {formatNumber(metrics.maintenanceServicesTotal)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="flex-1 flex flex-col justify-between rounded-xl border border-[#D5E3F2] bg-gradient-to-b from-white to-[#F7FAFE] p-3.5 shadow-2xs min-h-[240px]">
            {/* Matching Chart Header Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E3EDF7] pb-2.5 mb-2 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-1.5 h-6 rounded-full bg-gradient-to-b from-[#0C2544] via-[#1769AA] to-[#C6A35E] shrink-0" />
                <div className="min-w-0">
                  <h4 className="text-xs font-extrabold text-[#0C2544] leading-tight">
                    توزيع مصادر طلبات الصيانة
                  </h4>
                  <p className="text-[10px] text-slate-500 leading-tight mt-0.5">
                    نسبة الطلبات الواردة من قسم المرافق والإدارات الأخرى
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 rounded-lg bg-[#0C2544] text-white border border-[#C6A35E]/60 px-2.5 py-1.5 shadow-2xs shrink-0">
                <div className="w-6 h-6 rounded-md bg-[#C6A35E]/20 border border-[#C6A35E]/50 flex items-center justify-center shrink-0">
                  <Wrench className="w-3.5 h-3.5 text-[#DFC076]" />
                </div>
                <div className="text-right">
                  <span className="block text-[9px] font-bold text-[#EAF2FA]/85 leading-none">
                    إجمالي طلبات الصيانة
                  </span>
                  <div className="flex items-baseline gap-1 mt-0.5">
                    <span
                      className="text-sm font-extrabold text-[#DFC076] tabular-nums leading-none"
                      dir="ltr"
                    >
                      {formatNumber(metrics.maintenanceServicesTotal)}
                    </span>
                    <span className="text-[10px] font-bold text-white/90 leading-none">طلباً</span>
                  </div>
                </div>
              </div>
            </div>

            {metrics.maintenanceServicesTotal > 0 ? (
              <div className="flex-1 flex flex-col sm:flex-row items-center justify-between gap-3 py-1">
                {/* Moderately Enlarged 1:1 Circular Donut Chart with Center Total */}
                <div className="w-[144px] h-[144px] shrink-0 relative flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={maintenanceSourcesChartData.filter((d) => d.value > 0)}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={40}
                        outerRadius={64}
                        paddingAngle={2}
                      >
                        {maintenanceSourcesChartData
                          .filter((d) => d.value > 0)
                          .map((entry) => (
                            <Cell key={entry.key} fill={entry.color} stroke="#FFFFFF" strokeWidth={2} />
                          ))}
                      </Pie>
                      <Tooltip
                        formatter={(val) => [`${formatNumber(Number(val ?? 0))} طلب`, 'العدد']}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
                    <span
                      className="text-base font-black text-[#0B2341] tabular-nums leading-none"
                      dir="ltr"
                    >
                      {formatNumber(metrics.maintenanceServicesTotal)}
                    </span>
                    <span className="text-[9px] font-bold text-slate-500 mt-0.5">إجمالي الطلبات</span>
                  </div>
                </div>

                {/* Rebalanced Legend Cards beside the Donut */}
                <div className="flex-1 w-full flex flex-col justify-center gap-2.5 min-w-0">
                  {maintenanceSourcesChartData.map((item) => (
                    <div
                      key={item.key}
                      className={`flex flex-col gap-1.5 bg-white px-3 py-2.5 rounded-xl border text-[11px] shadow-2xs ${
                        item.key === 'facilities'
                          ? 'border-[#1769AA]/35'
                          : 'border-[#C8A85D]/55'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                              item.key === 'facilities' ? 'bg-[#1769AA]' : 'bg-[#C8A85D]'
                            }`}
                          />
                          <span className="font-extrabold text-[#0B2341] leading-snug" title={item.name}>
                            {item.shortName}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 tabular-nums" dir="ltr">
                          <span className="font-black text-xs text-[#0B2341]">
                            {formatNumber(item.value)}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold ${
                              item.key === 'facilities'
                                ? 'bg-[#EAF2FA] text-[#1769AA]'
                                : 'bg-[#FDF8EC] text-[#9A6700]'
                            }`}
                          >
                            {formatPct(item.sharePct, '0.0%')}
                          </span>
                        </div>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{
                            width: `${Math.max(item.value > 0 ? 6 : 0, Math.min(100, item.sharePct))}%`,
                            backgroundColor: item.color,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center text-xs text-slate-400 py-6">
                <Wrench className="w-7 h-7 text-slate-300 mb-1.5" />
                <p>أدخل أعداد طلبات الصيانة لعرض توزيع المصادر بيانياً</p>
              </div>
            )}
          </div>
        </SectionCard>
      </div>

      {/* SECTION 9: Security & Reception */}
      <SectionCard
        id="sec-security"
        titleAr="خدمات الأمن والاستقبال"
        titleEn="Security & Reception"
        icon={<ShieldCheck className="w-4 h-4" />}
        headerActions={
          canEdit && (
            <button
              type="button"
              onClick={() => {
                setShowAddSecurityColForm((prev) => !prev);
                setSecurityColFormError(null);
              }}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#DFC076] hover:bg-[#c8a85d] text-[#071C3A] text-[11px] font-extrabold shadow-2xs transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>إضافة عمود (بيان)</span>
            </button>
          )
        }
        bodyClassName="p-4 space-y-3"
      >
        {showAddSecurityColForm && canEdit && (
          <div className="bg-[#F4F8FC] border border-[#A3C0DE] rounded-xl px-4 py-3 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-extrabold text-[#012E5E]">إضافة عمود (بيان) جديد في خدمات الأمن والاستقبال</span>
              <button
                type="button"
                onClick={() => {
                  setShowAddSecurityColForm(false);
                  setSecurityColFormError(null);
                }}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
                aria-label="إغلاق نموذج إضافة عمود بيان"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end text-xs">
              <div className="sm:col-span-4">
                <label className="block font-bold text-[#012E5E] mb-1">اسم البيان / العمود (عربي) *</label>
                <input
                  type="text"
                  value={newSecurityColDraft.nameAr}
                  onChange={(e) => {
                    setNewSecurityColDraft((d) => ({ ...d, nameAr: e.target.value }));
                    if (securityColFormError) setSecurityColFormError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddSecurityCol();
                    }
                  }}
                  placeholder="مثال: تصاريح الزوار المؤقتة"
                  className="w-full px-2.5 py-1.5 rounded-lg border border-[#A3C0DE] bg-white font-bold text-[#012E5E] focus:border-[#1769AA] focus:outline-none"
                />
              </div>
              <div className="sm:col-span-3">
                <label className="block font-semibold text-slate-600 mb-1">الاسم بالإنجليزية (اختياري)</label>
                <input
                  type="text"
                  dir="ltr"
                  value={newSecurityColDraft.nameEn}
                  onChange={(e) => setNewSecurityColDraft((d) => ({ ...d, nameEn: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddSecurityCol();
                    }
                  }}
                  placeholder="Temporary Visitor Permits"
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 focus:border-[#1769AA] focus:outline-none"
                />
              </div>
              <div className="sm:col-span-1">
                <label className="block font-semibold text-slate-600 mb-1">المستلمة</label>
                <NumericInput
                  min={0}
                  value={newSecurityColDraft.receivedCount}
                  onChangeValue={(v) =>
                    setNewSecurityColDraft((d) => ({ ...d, receivedCount: v }))
                  }
                  className="w-full px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-center font-extrabold text-[#012E5E] focus:border-[#1769AA] focus:outline-none"
                />
              </div>
              <div className="sm:col-span-1">
                <label className="block font-semibold text-slate-600 mb-1">المنفذة</label>
                <NumericInput
                  min={0}
                  value={newSecurityColDraft.executedCount}
                  onChangeValue={(v) =>
                    setNewSecurityColDraft((d) => ({ ...d, executedCount: v }))
                  }
                  className="w-full px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-center font-extrabold text-[#069B74] focus:border-[#069B74] focus:outline-none"
                />
              </div>
              <div className="sm:col-span-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleAddSecurityCol}
                  className="flex-1 py-1.5 px-3 rounded-lg bg-[#012E5E] hover:bg-[#0B3969] text-white font-extrabold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5 text-[#DFC076]" />
                  <span>إضافة</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddSecurityColForm(false);
                    setSecurityColFormError(null);
                  }}
                  className="py-1.5 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 font-bold cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </div>

            {securityColFormError && (
              <p className="text-[11px] font-bold text-[#C43D47]">{securityColFormError}</p>
            )}
          </div>
        )}

        {report.securityReception.length === 0 ? (
          <div className="border border-dashed border-[#A3C0DE] rounded-xl py-6 px-4 text-center text-xs text-slate-500 font-semibold">
            لا توجد أعمدة (بيان) مسجلة حالياً في خدمات الأمن والاستقبال.
          </div>
        ) : (
          <div className="overflow-x-auto fm-scroll border border-slate-200 rounded-xl">
            <table className="w-full text-xs sm:text-[13px] min-w-[760px]">
              <thead className="bg-[#DCE9F6] text-[#0B2341]">
                <tr>
                  <th className="py-2.5 px-3 text-start font-extrabold sticky right-0 bg-[#DCE9F6] z-10 min-w-[130px] border-l border-[#A3C0DE]/50">
                    البيان
                  </th>
                  {report.securityReception.map((sr) => {
                    const isEditingThis = canEdit && editingSecurityKey === sr.activityKey;
                    return (
                      <th key={sr.activityKey} className="py-2 px-2 text-center font-extrabold align-top min-w-[110px]">
                        {isEditingThis ? (
                          <div className="space-y-1">
                            <input
                              type="text"
                              value={editSecurityDraft.nameAr}
                              onChange={(e) =>
                                setEditSecurityDraft((d) => ({ ...d, nameAr: e.target.value }))
                              }
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleCommitEditSecurityCol();
                                } else if (e.key === 'Escape') {
                                  setEditingSecurityKey(null);
                                }
                              }}
                              placeholder="اسم البيان"
                              className="w-full px-1.5 py-0.5 rounded border border-[#1769AA] bg-white text-[11px] font-bold text-[#012E5E] text-center focus:outline-none"
                            />
                            <input
                              type="text"
                              dir="ltr"
                              value={editSecurityDraft.nameEn}
                              onChange={(e) =>
                                setEditSecurityDraft((d) => ({ ...d, nameEn: e.target.value }))
                              }
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleCommitEditSecurityCol();
                                } else if (e.key === 'Escape') {
                                  setEditingSecurityKey(null);
                                }
                              }}
                              placeholder="English"
                              className="w-full px-1.5 py-0.5 rounded border border-slate-300 bg-white text-[10px] font-medium text-slate-600 text-center focus:outline-none"
                            />
                            <div className="flex items-center justify-center gap-1 pt-0.5">
                              <button
                                type="button"
                                onClick={handleCommitEditSecurityCol}
                                title="حفظ التعديل"
                                aria-label={`حفظ تعديل ${sr.nameAr}`}
                                className="p-1 rounded bg-[#069B74] hover:bg-[#058261] text-white cursor-pointer"
                              >
                                <Check className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingSecurityKey(null)}
                                title="إلغاء"
                                aria-label="إلغاء تعديل العمود"
                                className="p-1 rounded border border-slate-300 bg-white hover:bg-slate-100 text-slate-600 cursor-pointer"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-1">
                            <span>{sr.nameAr}</span>
                            {canEdit && (
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleStartEditSecurityCol(sr.activityKey)}
                                  title="تعديل مسمى العمود"
                                  aria-label={`تعديل ${sr.nameAr}`}
                                  className="p-0.5 rounded bg-white/80 hover:bg-white text-[#1769AA] border border-[#A3C0DE]/60 cursor-pointer"
                                >
                                  <Pencil className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteSecurityCol(sr.activityKey)}
                                  title="حذف العمود"
                                  aria-label={`حذف ${sr.nameAr}`}
                                  className="p-0.5 rounded bg-white/80 hover:bg-red-50 text-[#C43D47] border border-red-200/70 cursor-pointer"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </th>
                    );
                  })}
                  <th className="py-2.5 px-3 text-center font-extrabold bg-[#071E3D] text-white min-w-[95px]">
                    الإجمالي ({formatNumber(report.securityReception.length)})
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <td className="py-2.5 px-3 font-bold text-[#0B2341] whitespace-nowrap sticky right-0 bg-white border-l border-slate-100">
                    الطلبات المستلمة
                  </td>
                  {report.securityReception.map((sr) => (
                    <td key={sr.activityKey} className="py-2 px-1.5 text-center">
                      <NumericInput
                        id={`field-sec-received-${sr.activityKey}`}
                        min={0}
                        disabled={!canEdit}
                        value={sr.receivedCount}
                        onChangeValue={(v) => {
                          onChangeReport((prev) => ({
                            ...prev,
                            securityReception: prev.securityReception.map((item) =>
                              item.activityKey === sr.activityKey ? { ...item, receivedCount: v } : item
                            ),
                          }));
                        }}
                        className="w-16 px-1.5 py-1 rounded border border-slate-200 bg-[#EEF5FC]/70 text-center font-extrabold focus:border-[#1769AA] focus:outline-none disabled:bg-slate-50"
                      />
                    </td>
                  ))}
                  <td className="py-2.5 px-3 text-center font-extrabold tabular-nums bg-slate-50 text-[#0B2341]" dir="ltr">
                    {formatNumber(metrics.securityTotals.totalReceived)}
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-bold text-[#069B74] whitespace-nowrap sticky right-0 bg-white border-l border-slate-100">
                    الطلبات المنفذة
                  </td>
                  {report.securityReception.map((sr) => (
                    <td key={sr.activityKey} className="py-2 px-1.5 text-center">
                      <NumericInput
                        id={`field-sec-executed-${sr.activityKey}`}
                        min={0}
                        disabled={!canEdit}
                        value={sr.executedCount}
                        onChangeValue={(v) => {
                          onChangeReport((prev) => ({
                            ...prev,
                            securityReception: prev.securityReception.map((item) =>
                              item.activityKey === sr.activityKey ? { ...item, executedCount: v } : item
                            ),
                          }));
                        }}
                        className="w-16 px-1.5 py-1 rounded border border-slate-200 bg-[#EEF5FC]/70 text-center font-extrabold focus:border-[#069B74] focus:outline-none disabled:bg-slate-50"
                      />
                      {sr.executedCount > sr.receivedCount && (
                        <span className="block text-[9.5px] font-bold text-[#D99A22] mt-0.5">
                          تجاوزت المستلمة
                        </span>
                      )}
                    </td>
                  ))}
                  <td className="py-2.5 px-3 text-center font-extrabold tabular-nums bg-slate-50 text-[#069B74]" dir="ltr">
                    {formatNumber(metrics.securityTotals.totalExecuted)}
                  </td>
                </tr>
                <tr className="bg-[#071E3D] text-white font-bold">
                  <td className="py-2.5 px-3 whitespace-nowrap sticky right-0 bg-[#071E3D] border-l border-white/10">
                    نسبة الإنجاز
                  </td>
                  {metrics.securityWithPct.map((sr) => (
                    <td key={sr.activityKey} className="py-2.5 px-2 text-center tabular-nums text-[#DFC076]" dir="ltr">
                      {formatPct(sr.completionPct, '0.0%')}
                    </td>
                  ))}
                  <td className="py-2.5 px-3 text-center tabular-nums text-[#DFC076] bg-[#012E5E]" dir="ltr">
                    {formatPct(metrics.securityTotals.overallCompletionPct, '0.0%')}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* SECTION 10: Operational Tasks */}
      <SectionCard
        id="sec-tasks"
        titleAr="المهام التشغيلية والمتابعة"
        titleEn="Tasks & Milestones"
        icon={<ListChecks className="w-4 h-4" />}
        headerActions={
          canEdit && (
            <button
              type="button"
              onClick={() => {
                onChangeReport((prev) => ({
                  ...prev,
                  tasks: [
                    ...prev.tasks,
                    {
                      id: `task_${Date.now()}`,
                      rowOrder: prev.tasks.length + 1,
                      topic: '',
                      taskName: '',
                      status: TASK_STATUSES.NOT_STARTED,
                      completionPct: 0,
                    },
                  ],
                }));
                notifySuccess('تمت إضافة صف مهمة جديد', 'يمكنك إدخال تفاصيل المهمة ونسبة الإنجاز الآن.', {
                  context: 'saved',
                });
              }}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#DFC076] hover:bg-[#e8ce8c] text-[#071C3A] text-[11px] font-extrabold cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>إضافة مهمة</span>
            </button>
          )
        }
        bodyClassName="p-0"
      >
        <div className="overflow-x-auto fm-scroll">
          <table className="w-full text-xs sm:text-[13px] min-w-[780px]">
            <thead className="bg-[#DCE9F6] text-[#0B2341] border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-3 text-center w-12 font-extrabold">#</th>
                <th className="py-2.5 px-3 text-start w-60 min-w-[200px] max-w-[270px] font-extrabold">الموضوع</th>
                <th className="py-2.5 px-3 text-start min-w-[230px] font-extrabold">المهمة</th>
                <th className="py-2.5 px-3 text-center w-36 font-extrabold">الحالة</th>
                <th className="py-2.5 px-3 text-center w-28 font-extrabold">نسبة الإنجاز</th>
                <th className="py-2.5 px-3 text-center w-36 font-extrabold">المؤشر</th>
                {canEdit && <th className="py-2.5 px-2 text-center w-12 font-extrabold">حذف</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {report.tasks.map((t, idx) => {
                const isEmpty = !t.topic.trim() && !t.taskName.trim();
                const hasConsistencyWarn =
                  (!isEmpty && t.status === TASK_STATUSES.COMPLETED && t.completionPct < 100) ||
                  (!isEmpty && t.status === TASK_STATUSES.NOT_STARTED && t.completionPct > 0);

                return (
                  <tr key={t.id} className="hover:bg-[#F4F7FB] align-middle">
                    <td className="py-2 px-3 text-center tabular-nums font-bold text-slate-500 align-middle" dir="ltr">
                      {formatNumber(idx + 1)}
                    </td>
                    <td className="py-2 px-2 subject-cell align-middle w-60 min-w-[200px] max-w-[270px]">
                      <div className="task-auto-wrap-grid">
                        <div className="task-auto-wrap-mirror font-semibold" aria-hidden="true">
                          {(t.topic || 'الموضوع...') + '\u200b'}
                        </div>
                        <textarea
                          id={`field-task-topic-${t.id}`}
                          rows={1}
                          dir="rtl"
                          disabled={!canEdit}
                          value={t.topic}
                          placeholder="الموضوع..."
                          onInput={(e) => {
                            const el = e.currentTarget;
                            el.style.height = 'auto';
                            el.style.height = `${Math.max(40, el.scrollHeight)}px`;
                          }}
                          ref={(el) => {
                            if (el) {
                              el.style.height = 'auto';
                              el.style.height = `${Math.max(40, el.scrollHeight)}px`;
                            }
                          }}
                          onChange={(e) => {
                            const val = e.target.value;
                            onChangeReport((prev) => ({
                              ...prev,
                              tasks: prev.tasks.map((item) => (item.id === t.id ? { ...item, topic: val } : item)),
                            }));
                          }}
                          className="subject-field w-full rounded-lg border border-slate-200 bg-white font-semibold text-[#0B2341] focus:border-[#1769AA] focus:outline-none disabled:bg-slate-50"
                        />
                      </div>
                    </td>
                    <td className="py-2 px-2 subject-cell align-middle min-w-[230px]">
                      <div className="task-auto-wrap-grid">
                        <div className="task-auto-wrap-mirror" aria-hidden="true">
                          {(t.taskName || 'وصف المهمة...') + '\u200b'}
                        </div>
                        <textarea
                          id={`field-task-name-${t.id}`}
                          rows={1}
                          dir="rtl"
                          disabled={!canEdit}
                          value={t.taskName}
                          placeholder="وصف المهمة..."
                          onInput={(e) => {
                            const el = e.currentTarget;
                            el.style.height = 'auto';
                            el.style.height = `${Math.max(40, el.scrollHeight)}px`;
                          }}
                          ref={(el) => {
                            if (el) {
                              el.style.height = 'auto';
                              el.style.height = `${Math.max(40, el.scrollHeight)}px`;
                            }
                          }}
                          onChange={(e) => {
                            const val = e.target.value;
                            onChangeReport((prev) => ({
                              ...prev,
                              tasks: prev.tasks.map((item) => (item.id === t.id ? { ...item, taskName: val } : item)),
                            }));
                          }}
                          className="subject-field w-full rounded-lg border border-slate-200 bg-white text-[#0B2341] focus:border-[#1769AA] focus:outline-none disabled:bg-slate-50"
                        />
                      </div>
                    </td>
                    <td className="py-2 px-2 text-center align-middle">
                      <select
                        id={`field-task-status-${t.id}`}
                        disabled={!canEdit}
                        value={t.status}
                        onChange={(e) => {
                          const st = e.target.value as TaskStatus;
                          onChangeReport((prev) => ({
                            ...prev,
                            tasks: prev.tasks.map((item) => {
                              if (item.id !== t.id) return item;
                              if (st === TASK_STATUSES.COMPLETED && !item.topic.trim() && !item.taskName.trim()) {
                                return item;
                              }
                              const nextPct =
                                st === TASK_STATUSES.COMPLETED
                                  ? 100
                                  : st === TASK_STATUSES.NOT_STARTED
                                    ? 0
                                    : item.completionPct;
                              return { ...item, status: st, completionPct: nextPct };
                            }),
                          }));
                        }}
                        className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-xs bg-white disabled:bg-slate-50"
                      >
                        {Object.entries(TASK_STATUS_LABELS_AR).map(([k, lbl]) => (
                          <option key={k} value={k} disabled={k === TASK_STATUSES.COMPLETED && isEmpty}>
                            {lbl}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 px-2 text-center align-middle">
                      <div className="flex items-center justify-center gap-1">
                        <NumericInput
                          id={`field-task-pct-${t.id}`}
                          min={0}
                          max={100}
                          disabled={!canEdit}
                          ariaLabel="نسبة إنجاز المهمة"
                          value={t.completionPct}
                          onChangeValue={(pct) => {
                            onChangeReport((prev) => ({
                              ...prev,
                              tasks: prev.tasks.map((item) => {
                                if (item.id !== t.id) return item;
                                const autoStatus =
                                  pct === 100 && !isEmpty
                                    ? TASK_STATUSES.COMPLETED
                                    : pct === 0
                                      ? TASK_STATUSES.NOT_STARTED
                                      : item.status === TASK_STATUSES.COMPLETED || item.status === TASK_STATUSES.NOT_STARTED
                                        ? TASK_STATUSES.IN_PROGRESS
                                        : item.status;
                                return { ...item, completionPct: pct, status: autoStatus };
                              }),
                            }));
                          }}
                          className="w-20 px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-center text-xs font-bold focus:border-[#1769AA] focus:outline-none disabled:bg-slate-50"
                        />
                        <span className="text-xs text-slate-500">%</span>
                      </div>
                      {hasConsistencyWarn && (
                        <span className="text-[10px] text-[#C43D47] block mt-0.5">غير متسق مع الحالة</span>
                      )}
                    </td>
                    <td className="py-2 px-3 align-middle">
                      <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all ${
                            t.status === TASK_STATUSES.COMPLETED
                              ? 'bg-[#069B74]'
                              : t.status === TASK_STATUSES.DELAYED
                                ? 'bg-[#C43D47]'
                                : 'bg-[#1769AA]'
                          }`}
                          style={{ width: `${t.completionPct}%` }}
                        />
                      </div>
                    </td>
                    {canEdit && (
                      <td className="py-2 px-2 text-center align-middle">
                        <button
                          type="button"
                          onClick={async () => {
                            const ok = await confirmDialog({
                              title: 'تأكيد حذف المهمة',
                              titleEn: 'Confirm Task Deletion',
                              message: 'هل أنت متأكد من حذف هذه المهمة من جدول المتابعة؟',
                              targetLabel: t.topic || t.taskName || `مهمة #${formatNumber(idx + 1)}`,
                              confirmLabel: 'حذف المهمة',
                              cancelLabel: 'إلغاء',
                              tone: 'danger',
                              context: 'delete',
                            });
                            if (!ok) return;
                            onChangeReport((prev) => ({
                              ...prev,
                              tasks: prev.tasks.filter((item) => item.id !== t.id),
                            }));
                            notifySuccess('تم حذف المهمة من المسودة', undefined, { context: 'delete' });
                          }}
                          className="p-1.5 text-slate-400 hover:text-[#C43D47] cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* SECTION 11: Challenges & Recommendations */}
      <SectionCard
        id="sec-challenges"
        titleAr="التحديات والتوصيات"
        titleEn="Challenges & Recommendations"
        icon={<Lightbulb className="w-4 h-4" />}
        headerActions={
          canEdit && (
            <button
              type="button"
              onClick={() => {
                onChangeReport((prev) => ({
                  ...prev,
                  challenges: [
                    ...prev.challenges,
                    {
                      id: `chal_${Date.now()}`,
                      rowOrder: prev.challenges.length + 1,
                      challengeText: '',
                      updateText: '',
                      recommendationText: '',
                    },
                  ],
                }));
                notifySuccess('تمت إضافة بند تحدٍ وتوصية جديد', undefined, { context: 'saved' });
              }}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#DFC076] hover:bg-[#e8ce8c] text-[#071C3A] text-[11px] font-extrabold cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>إضافة تحدي / توصية</span>
            </button>
          )
        }
        bodyClassName="p-4 space-y-3"
      >
        {report.challenges.map((ch, idx) => (
          <div key={ch.id} className="p-3.5 rounded-xl border border-slate-200 bg-[#F8FAFC] space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold text-[#0B2341]">بند #{formatNumber(idx + 1)}</span>
              {canEdit && report.challenges.length > 1 && (
                <button
                  type="button"
                  onClick={async () => {
                    const ok = await confirmDialog({
                      title: 'تأكيد حذف البند',
                      titleEn: 'Confirm Challenge Deletion',
                      message: 'هل أنت متأكد من حذف بند التحدي والتوصية المحدد؟',
                      targetLabel: `بند #${formatNumber(idx + 1)}`,
                      confirmLabel: 'حذف البند',
                      cancelLabel: 'إلغاء',
                      tone: 'danger',
                      context: 'delete',
                    });
                    if (!ok) return;
                    onChangeReport((prev) => ({
                      ...prev,
                      challenges: prev.challenges.filter((item) => item.id !== ch.id),
                    }));
                    notifySuccess('تم حذف البند بنجاح', undefined, { context: 'delete' });
                  }}
                  className="flex items-center gap-1 text-xs text-[#C43D47] hover:underline cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>حذف</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-[#0B2341] mb-1">التحديات والعوائق</label>
                <textarea
                  id={`field-chal-text-${ch.id}`}
                  rows={3}
                  disabled={!canEdit}
                  value={ch.challengeText}
                  onChange={(e) => {
                    const val = e.target.value;
                    onChangeReport((prev) => ({
                      ...prev,
                      challenges: prev.challenges.map((item) =>
                        item.id === ch.id ? { ...item, challengeText: val } : item
                      ),
                    }));
                  }}
                  placeholder="اذكر التحدي أو العائق التشغيلي..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs leading-relaxed focus:border-[#1769AA] focus:outline-none disabled:bg-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#0B2341] mb-1">التحديث والإجراءات المتخذة</label>
                <textarea
                  id={`field-chal-update-${ch.id}`}
                  rows={3}
                  disabled={!canEdit}
                  value={ch.updateText}
                  onChange={(e) => {
                    const val = e.target.value;
                    onChangeReport((prev) => ({
                      ...prev,
                      challenges: prev.challenges.map((item) =>
                        item.id === ch.id ? { ...item, updateText: val } : item
                      ),
                    }));
                  }}
                  placeholder="التحديثات والمخاطبات الرسمية..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs leading-relaxed focus:border-[#1769AA] focus:outline-none disabled:bg-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#1769AA] mb-1">التوصية التنفيذية</label>
                <textarea
                  id={`field-chal-rec-${ch.id}`}
                  rows={3}
                  disabled={!canEdit}
                  value={ch.recommendationText}
                  onChange={(e) => {
                    const val = e.target.value;
                    onChangeReport((prev) => ({
                      ...prev,
                      challenges: prev.challenges.map((item) =>
                        item.id === ch.id ? { ...item, recommendationText: val } : item
                      ),
                    }));
                  }}
                  placeholder="التوصية المقترحة للإدارة العليا..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs leading-relaxed focus:border-[#1769AA] focus:outline-none disabled:bg-slate-100"
                />
              </div>
            </div>
          </div>
        ))}
      </SectionCard>

      {/* SECTION 12: Preparation, Review & Approval */}
      <SectionCard
        id="sec-approval"
        titleAr="الإعداد والمراجعة والاعتماد الرسمي"
        titleEn="Preparation, Review & Approval"
        icon={<FileCheck2 className="w-4 h-4" />}
        bodyClassName="p-4 space-y-4"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Preparer Card (Visual RIGHT in RTL) — Navy & Gold Header matching MASTER_VISUAL_REFERENCE */}
          <div className="rounded-xl border border-[#B8CEE6] overflow-hidden bg-[#F8FAFC] shadow-2xs flex flex-col">
            <div className="relative bg-gradient-to-l from-[#04244B] via-[#083366] to-[#0E437A] text-white px-4 py-2.5 border-b-2 border-[#C99E4A]/80 flex items-center justify-between overflow-hidden">
              <div
                aria-hidden="true"
                className="hidden sm:block absolute left-3.5 top-0 bottom-0 w-3.5 bg-gradient-to-b from-[#E5C878] via-[#C99E4A] to-[#A87E2B] -skew-x-[30deg] opacity-95 pointer-events-none"
              />
              <div
                aria-hidden="true"
                className="hidden sm:block absolute left-8.5 top-0 bottom-0 w-1.5 bg-gradient-to-b from-[#E5C878]/85 to-[#C99E4A]/70 -skew-x-[30deg] pointer-events-none"
              />
              <div className="relative z-10 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-[#061D3B]/70 border border-[#DFC076]/65 flex items-center justify-center text-[#DFC076] shrink-0">
                  <FileCheck2 className="w-3.5 h-3.5" />
                </span>
                <div>
                  <h3 className="text-sm font-extrabold text-white">
                    إعداد التقرير · <span className="text-xs font-semibold text-[#CBE0F8]" dir="ltr">Report Preparation</span>
                  </h3>
                  <p className="text-[10.5px] text-[#DFC076]">المسؤول عن إعداد البيانات والتحقق الأولي</p>
                </div>
              </div>
            </div>

            <div className="p-4 space-y-3 text-xs flex-1 flex flex-col justify-between">
              <div className="space-y-3">
                <div>
                  <label htmlFor="field-preparer-name" className="block font-bold text-[#012E5E] mb-1">اسم المعد</label>
                  <input
                    id="field-preparer-name"
                    type="text"
                    disabled={!canEdit}
                    value={report.preparerName}
                    onChange={(e) =>
                      onChangeReport((prev) => ({ ...prev, preparerName: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white font-bold text-[#0B2341] disabled:bg-slate-100"
                  />
                </div>
                <div>
                  <label htmlFor="field-preparer-title" className="block font-bold text-[#012E5E] mb-1">المنصب / المسمى الوظيفي</label>
                  <input
                    id="field-preparer-title"
                    type="text"
                    disabled={!canEdit}
                    value={report.preparerTitle}
                    onChange={(e) =>
                      onChangeReport((prev) => ({ ...prev, preparerTitle: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 disabled:bg-slate-100"
                  />
                </div>
                <div className="pt-1">
                  <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <label htmlFor="preparer-date-input" className="text-slate-500 font-semibold text-[11px]">
                        التاريخ
                      </label>
                      {canSignPreparer && report.preparedAt && (
                        <button
                          type="button"
                          onClick={() => {
                            if (canEdit) {
                              onChangeReport((prev) => ({ ...prev, preparedAt: null }));
                            } else {
                              onSaveDate('preparedAt', null);
                            }
                          }}
                          className="text-[10px] font-bold text-[#C43D47] hover:underline cursor-pointer"
                        >
                          مسح
                        </button>
                      )}
                    </div>
                    <WesternDatePicker
                      id="preparer-date-input"
                      ariaLabel="تاريخ التقديم"
                      disabled={!canSignPreparer}
                      value={report.preparedAt}
                      onChange={(isoDate) => {
                        const normalized = isoDate ? `${isoDate}T12:00:00.000Z` : null;
                        if (canEdit) {
                          onChangeReport((prev) => ({ ...prev, preparedAt: normalized }));
                        } else if (canSignPreparer) {
                          onSaveDate('preparedAt', isoDate || null);
                        }
                      }}
                    />
                  </div>
                </div>

                {/* Preparer Visual Signature Block (Draw or Upload) */}
                <div className="pt-2 border-t border-slate-200/80 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold text-[#012E5E]">التوقيع الإلكتروني · Official Signature</span>
                    {dualSigEval.preparer.state === 'completed' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-[11px] font-extrabold text-[#07976E]">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>{dualSigEval.preparer.labelAr}</span>
                      </span>
                    ) : dualSigEval.preparer.state === 'saving' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-[11px] font-extrabold text-[#9A7422]">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>{dualSigEval.preparer.labelAr}</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-50 border border-[#C94444]/30 text-[11px] font-extrabold text-[#C94444]">
                        <XCircle className="w-3 h-3" />
                        <span>{dualSigEval.preparer.labelAr}</span>
                      </span>
                    )}
                  </div>

                  {dualSigEval.preparer.signedAt && dualSigEval.hasValidPreparerSignature && (
                    <div className="flex items-center justify-between gap-2 text-[10.5px] text-slate-500 bg-white/80 rounded-md px-2.5 py-1 border border-slate-200/70">
                      <span>تاريخ وتوقيت التوقيع:</span>
                      <span dir="ltr" className="font-mono font-bold text-[#082D56] tabular-nums">
                        {formatDateTimeWestern(dualSigEval.preparer.signedAt)}
                      </span>
                    </div>
                  )}

                  <div
                    id="field-preparer-signature-area"
                    className="relative h-28 rounded-xl border border-dashed border-[#A3C0DE] bg-white flex items-center justify-center p-2 overflow-hidden"
                  >
                    <div
                      aria-hidden="true"
                      className="absolute inset-x-8 bottom-4 border-b border-slate-200 pointer-events-none"
                    />
                    {report.preparerSignatureImage ? (
                      <img
                        src={report.preparerSignatureImage}
                        alt={`توقيع ${report.preparerName || 'معد التقرير'}`}
                        className="relative z-10 max-h-22 max-w-full object-contain"
                      />
                    ) : (
                      <span className="text-[11px] text-slate-400 font-medium">
                        لم يُضف توقيع بالرسم أو صورة مرفقة بعد
                      </span>
                    )}
                  </div>

                  {canSignPreparer ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenSignatureModal('preparer', 'draw')}
                        className="flex-1 min-w-[130px] flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#012E5E] hover:bg-[#0B3969] text-white text-[11px] font-bold transition-colors cursor-pointer"
                      >
                        <PenTool className="w-3.5 h-3.5 text-[#DFC076]" />
                        <span>{report.preparerSignatureImage ? 'تعديل بالرسم' : 'توقيع بالرسم'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenSignatureModal('preparer', 'upload')}
                        className="flex-1 min-w-[130px] flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-white hover:bg-[#EEF4FA] text-[#012E5E] border border-[#A3C0DE] text-[11px] font-bold transition-colors cursor-pointer"
                      >
                        <ImagePlus className="w-3.5 h-3.5 text-[#1769AA]" />
                        <span>إرفاق صورة التوقيع</span>
                      </button>
                      {report.preparerSignatureImage && (
                        <button
                          type="button"
                          onClick={async () => {
                            const ok = await confirmDialog({
                              title: 'تأكيد حذف توقيع معد التقرير',
                              titleEn: 'Confirm Signature Removal',
                              message: 'سيتم إزالة صورة التوقيع الإلكتروني المحفوظة لمعد التقرير.',
                              targetLabel: report.preparerName || 'معد التقرير',
                              confirmLabel: 'حذف التوقيع',
                              cancelLabel: 'إلغاء',
                              tone: 'danger',
                              context: 'delete',
                              onConfirmAsync: () => onSaveSignature('preparer', null),
                            });
                            void ok;
                          }}
                          title="حذف التوقيع"
                          className="px-2.5 py-2 rounded-lg border border-red-200 bg-white hover:bg-red-50 text-[#C43D47] text-[11px] font-bold transition-colors cursor-pointer"
                          aria-label="حذف توقيع معد التقرير"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ) : !user ? (
                    <button
                      type="button"
                      onClick={onOpenAuthModal}
                      className="w-full py-1.5 px-3 rounded-lg border border-[#A3C0DE] bg-white hover:bg-[#EEF4FA] text-[#1769AA] text-[11px] font-bold cursor-pointer"
                    >
                      تسجيل الدخول لإضافة توقيع معد التقرير
                    </button>
                  ) : (
                    !isApprovedOrArchived && (
                      <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-[10.5px] font-semibold text-slate-600">
                        <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>تعديل توقيع معد التقرير متاح لمعد التقرير في مرحلة المسودة أو لمدير النظام.</span>
                      </div>
                    )
                  )}
                </div>
              </div>

              {/* Bottom Card Actions matching MASTER_VISUAL_REFERENCE */}
              <div className="pt-3 border-t border-slate-200 flex items-center gap-2">
                <button
                  type="button"
                  disabled={!canEdit || saving}
                  onClick={onSave}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-[#04244B] hover:bg-[#0B3969] text-white text-xs font-extrabold transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5 text-[#DFC076]" />
                  <span>{saving ? 'جاري الحفظ...' : 'حفظ المسودة'}</span>
                </button>
                <button
                  id="field-preparer-submit-btn"
                  type="button"
                  disabled={report.status !== REPORT_STATUSES.DRAFT}
                  onClick={() => onTriggerWorkflow('submit_review')}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-white hover:bg-[#EEF4FA] text-[#04244B] border border-[#B8CEE6] text-xs font-extrabold transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5 text-[#1769AA]" />
                  <span>إرسال للاعتماد</span>
                </button>
              </div>
            </div>
          </div>

          {/* Reviewer & Approver Card (Visual LEFT in RTL) — Navy & Gold Header matching MASTER_VISUAL_REFERENCE */}
          <div className="rounded-xl border border-[#B8CEE6] overflow-hidden bg-[#F8FAFC] shadow-2xs flex flex-col">
            <div className="relative bg-gradient-to-l from-[#04244B] via-[#083366] to-[#0E437A] text-white px-4 py-2.5 border-b-2 border-[#C99E4A]/80 flex items-center justify-between overflow-hidden">
              <div
                aria-hidden="true"
                className="hidden sm:block absolute left-3.5 top-0 bottom-0 w-3.5 bg-gradient-to-b from-[#E5C878] via-[#C99E4A] to-[#A87E2B] -skew-x-[30deg] opacity-95 pointer-events-none"
              />
              <div
                aria-hidden="true"
                className="hidden sm:block absolute left-8.5 top-0 bottom-0 w-1.5 bg-gradient-to-b from-[#E5C878]/85 to-[#C99E4A]/70 -skew-x-[30deg] pointer-events-none"
              />
              <div className="relative z-10 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-[#061D3B]/70 border border-[#DFC076]/65 flex items-center justify-center text-[#DFC076] shrink-0">
                  <ShieldCheck className="w-3.5 h-3.5" />
                </span>
                <div>
                  <h3 className="text-sm font-extrabold text-white">
                    اعتماد التقرير · <span className="text-xs font-semibold text-[#CBE0F8]" dir="ltr">Review &amp; Approval</span>
                  </h3>
                  <p className="text-[10.5px] text-[#DFC076]">صاحب صلاحية الاعتماد التنفيذي النهائي</p>
                </div>
              </div>
            </div>

            <div className="p-4 space-y-3 text-xs flex-1 flex flex-col justify-between">
              <div className="space-y-3">
                <div>
                  <label htmlFor="field-approver-name" className="block font-bold text-[#012E5E] mb-1">اسم المعتمد</label>
                  <input
                    id="field-approver-name"
                    type="text"
                    disabled={!canEdit && !canSignApprover}
                    value={report.approverName}
                    onChange={(e) =>
                      onChangeReport((prev) => ({ ...prev, approverName: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white font-bold text-[#0B2341] disabled:bg-slate-100"
                  />
                </div>
                <div>
                  <label htmlFor="field-approver-title" className="block font-bold text-[#012E5E] mb-1">المنصب / المسمى الوظيفي</label>
                  <input
                    id="field-approver-title"
                    type="text"
                    disabled={!canEdit && !canSignApprover}
                    value={report.approverTitle}
                    onChange={(e) =>
                      onChangeReport((prev) => ({ ...prev, approverTitle: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 disabled:bg-slate-100"
                  />
                </div>
                <div className="pt-1">
                  <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <label htmlFor="approver-date-input" className="text-slate-500 font-semibold text-[11px]">
                        التاريخ
                      </label>
                      {canSignApprover && report.approvedAt && (
                        <button
                          type="button"
                          onClick={() => {
                            if (canEdit) {
                              onChangeReport((prev) => ({ ...prev, approvedAt: null }));
                            } else {
                              onSaveDate('approvedAt', null);
                            }
                          }}
                          className="text-[10px] font-bold text-[#C43D47] hover:underline cursor-pointer"
                        >
                          مسح
                        </button>
                      )}
                    </div>
                    <WesternDatePicker
                      id="approver-date-input"
                      ariaLabel="تاريخ الاعتماد"
                      disabled={!canSignApprover}
                      value={report.approvedAt}
                      onChange={(isoDate) => {
                        const normalized = isoDate ? `${isoDate}T12:00:00.000Z` : null;
                        if (canEdit) {
                          onChangeReport((prev) => ({ ...prev, approvedAt: normalized }));
                        } else if (canSignApprover) {
                          onSaveDate('approvedAt', isoDate || null);
                        }
                      }}
                    />
                  </div>
                </div>

                {/* Approver Visual Signature Block (Draw or Upload) */}
                <div className="pt-2 border-t border-slate-200/80 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold text-[#012E5E]">التوقيع الإلكتروني · Official Signature</span>
                    {dualSigEval.approver.state === 'completed' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-[11px] font-extrabold text-[#07976E]">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>{dualSigEval.approver.labelAr}</span>
                      </span>
                    ) : dualSigEval.approver.state === 'saving' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-[11px] font-extrabold text-[#9A7422]">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>{dualSigEval.approver.labelAr}</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-50 border border-[#C94444]/30 text-[11px] font-extrabold text-[#C94444]">
                        <XCircle className="w-3 h-3" />
                        <span>{dualSigEval.approver.labelAr}</span>
                      </span>
                    )}
                  </div>

                  {dualSigEval.approver.signedAt && dualSigEval.hasValidApproverSignature && (
                    <div className="flex items-center justify-between gap-2 text-[10.5px] text-slate-500 bg-white/80 rounded-md px-2.5 py-1 border border-slate-200/70">
                      <span>تاريخ وتوقيت التوقيع:</span>
                      <span dir="ltr" className="font-mono font-bold text-[#082D56] tabular-nums">
                        {formatDateTimeWestern(dualSigEval.approver.signedAt)}
                      </span>
                    </div>
                  )}

                  <div
                    id="field-approver-signature-area"
                    className="relative h-28 rounded-xl border border-dashed border-[#A3C0DE] bg-white flex items-center justify-center p-2 overflow-hidden"
                  >
                    <div
                      aria-hidden="true"
                      className="absolute inset-x-8 bottom-4 border-b border-slate-200 pointer-events-none"
                    />
                    {report.approverSignatureImage ? (
                      <img
                        src={report.approverSignatureImage}
                        alt={`توقيع ${report.approverName || 'معتمد التقرير'}`}
                        className="relative z-10 max-h-22 max-w-full object-contain"
                      />
                    ) : (
                      <span className="text-[11px] text-slate-400 font-medium">
                        لم يُضف توقيع بالرسم أو صورة مرفقة بعد
                      </span>
                    )}
                  </div>

                  {canSignApprover ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenSignatureModal('approver', 'draw')}
                        className="flex-1 min-w-[130px] flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#012E5E] hover:bg-[#0B3969] text-white text-[11px] font-bold transition-colors cursor-pointer"
                      >
                        <PenTool className="w-3.5 h-3.5 text-[#DFC076]" />
                        <span>{report.approverSignatureImage ? 'تعديل بالرسم' : 'توقيع بالرسم'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenSignatureModal('approver', 'upload')}
                        className="flex-1 min-w-[130px] flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-white hover:bg-[#EEF4FA] text-[#012E5E] border border-[#A3C0DE] text-[11px] font-bold transition-colors cursor-pointer"
                      >
                        <ImagePlus className="w-3.5 h-3.5 text-[#1769AA]" />
                        <span>إرفاق صورة التوقيع</span>
                      </button>
                      {report.approverSignatureImage && (
                        <button
                          type="button"
                          onClick={async () => {
                            const ok = await confirmDialog({
                              title: 'تأكيد حذف توقيع المعتمد الرسمي',
                              titleEn: 'Confirm Approver Signature Removal',
                              message: 'سيتم إزالة صورة التوقيع الإلكتروني المحفوظة لصاحب الاعتماد.',
                              targetLabel: report.approverName || 'معتمد التقرير',
                              confirmLabel: 'حذف التوقيع',
                              cancelLabel: 'إلغاء',
                              tone: 'danger',
                              context: 'delete',
                              onConfirmAsync: () => onSaveSignature('approver', null),
                            });
                            void ok;
                          }}
                          title="حذف التوقيع"
                          className="px-2.5 py-2 rounded-lg border border-red-200 bg-white hover:bg-red-50 text-[#C43D47] text-[11px] font-bold transition-colors cursor-pointer"
                          aria-label="حذف توقيع المعتمد"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ) : !user ? (
                    <button
                      type="button"
                      onClick={onOpenAuthModal}
                      className="w-full py-1.5 px-3 rounded-lg border border-[#A3C0DE] bg-white hover:bg-[#EEF4FA] text-[#1769AA] text-[11px] font-bold cursor-pointer"
                    >
                      تسجيل الدخول لإضافة توقيع الاعتماد
                    </button>
                  ) : (
                    !isApprovedOrArchived && (
                      <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-[10.5px] font-semibold text-slate-600">
                        <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>صلاحية إضافة توقيع المعتمد مخصصة لحساب «المعتمد» أو «مدير النظام» فقط.</span>
                      </div>
                    )
                  )}
                </div>
              </div>

              {/* Bottom Card Actions matching MASTER_VISUAL_REFERENCE */}
              <div className="pt-3 border-t border-slate-200 flex items-center gap-2">
                <button
                  type="button"
                  disabled={isApprovedOrArchived}
                  onClick={() => onTriggerWorkflow('approve')}
                  title={
                    isApprovedOrArchived
                      ? 'تم اعتماد التقرير رسمياً'
                      : dualSigEval.hasBothSignatures
                        ? 'اعتماد التقرير رسمياً'
                        : 'يتطلب توقيع معد التقرير وتوقيع معتمد التقرير قبل الاعتماد'
                  }
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-white text-xs font-extrabold transition-colors disabled:opacity-50 cursor-pointer ${
                    isApprovedOrArchived
                      ? 'bg-[#07976E]'
                      : dualSigEval.hasBothSignatures
                        ? 'bg-[#07976E] hover:bg-[#05805d]'
                        : 'bg-[#04244B] hover:bg-[#10518C]'
                  }`}
                >
                  {isApprovedOrArchived || dualSigEval.hasBothSignatures ? (
                    <ShieldCheck className="w-3.5 h-3.5 text-[#DFC076]" />
                  ) : (
                    <Lock className="w-3.5 h-3.5 text-[#DFC076]" />
                  )}
                  <span>
                    {isApprovedOrArchived
                      ? 'تم اعتماد التقرير'
                      : dualSigEval.hasBothSignatures
                        ? 'اعتماد التقرير'
                        : 'اعتماد التقرير (يتطلب التوقيعين)'}
                  </span>
                </button>
                <button
                  type="button"
                  disabled={
                    isApprovedOrArchived
                      ? !canStartPostApprovalEdit
                      : report.status === REPORT_STATUSES.DRAFT
                  }
                  onClick={() =>
                    onTriggerWorkflow(
                      isApprovedOrArchived ? 'create_revision' : 'return_revision'
                    )
                  }
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-white hover:bg-red-50 text-slate-700 hover:text-[#C43D47] border border-slate-300 text-xs font-extrabold transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{isApprovedOrArchived ? 'تحرير التقرير بعد الاعتماد' : 'إلغاء الاعتماد / إرجاع'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Dual-Signature Mandatory Verification Gate Indicator Bar */}
        {!isApprovedOrArchived && (
          <div
            className={`rounded-xl border p-3 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 text-xs ${
              dualSigEval.hasBothSignatures
                ? 'bg-emerald-50/75 border-[#07976E]/45 text-[#082D56]'
                : 'bg-[#EFF6FC] border-[#A3C0DE] text-[#082D56]'
            }`}
          >
            <div className="flex items-start gap-2">
              {dualSigEval.hasBothSignatures ? (
                <ShieldCheck className="w-4 h-4 text-[#07976E] shrink-0 mt-0.5" />
              ) : (
                <ShieldAlert className="w-4 h-4 text-[#C94444] shrink-0 mt-0.5" />
              )}
              <div>
                <span className="font-extrabold block">
                  {dualSigEval.hasBothSignatures
                    ? 'اكتمل التوقيع الإلكتروني للطرفين — التقرير مستوفي شرط الاعتماد المزدوج'
                    : 'شرط الاعتماد الإلزامي بالتوقيع المزدوج للطرفين'}
                </span>
                <span className="text-[11px] text-slate-600">
                  {dualSigEval.hasBothSignatures
                    ? 'تم التحقق من وجود وصلاحية توقيع معد التقرير وتوقيع معتمد التقرير وحفظهما في النظام.'
                    : 'يُمنع اعتماد التقرير نهائياً إلا بعد استكمال وحفظ توقيع معد التقرير وتوقيع معتمد التقرير معاً.'}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-bold ${
                  dualSigEval.hasValidPreparerSignature
                    ? 'bg-white border-emerald-200 text-[#07976E]'
                    : 'bg-white border-[#C94444]/35 text-[#C94444]'
                }`}
              >
                {dualSigEval.hasValidPreparerSignature ? (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                ) : (
                  <XCircle className="w-3.5 h-3.5" />
                )}
                <span>توقيع معد التقرير: {dualSigEval.preparer.labelAr}</span>
              </span>

              <span
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-bold ${
                  dualSigEval.hasValidApproverSignature
                    ? 'bg-white border-emerald-200 text-[#07976E]'
                    : 'bg-white border-[#C94444]/35 text-[#C94444]'
                }`}
              >
                {dualSigEval.hasValidApproverSignature ? (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                ) : (
                  <XCircle className="w-3.5 h-3.5" />
                )}
                <span>توقيع معتمد التقرير: {dualSigEval.approver.labelAr}</span>
              </span>
            </div>
          </div>
        )}

        {/* Official Attestation ONLY when Approved or Archived */}
        {isApprovedOrArchived ? (
          <div className="p-4 rounded-xl bg-emerald-50 border border-[#069B74] flex items-center justify-center gap-2.5 text-sm font-bold text-[#069B74]">
            <ShieldCheck className="w-5 h-5 shrink-0" />
            <span>«هذا التقرير معتمد ومراجع وفقاً للسياسات والإجراءات المعمول بها في قسم إدارة المرافق»</span>
          </div>
        ) : (
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center gap-2 text-xs text-slate-500">
            <AlertCircle className="w-4 h-4 text-slate-400 shrink-0" />
            <span>يظهر إقرار الاعتماد الرسمي تلقائياً بعد اكتمال مراحل المراجعة والاعتماد الإلكتروني.</span>
          </div>
        )}
      </SectionCard>

      <SignaturePadModal
        open={!!signatureModal}
        initialMode={signatureModal?.mode || 'draw'}
        signerLabel={signatureModal?.target === 'approver' ? 'المراجعة والاعتماد' : 'معد التقرير'}
        signerName={
          signatureModal?.target === 'approver' ? report.approverName : report.preparerName
        }
        currentSignature={
          signatureModal?.target === 'approver'
            ? report.approverSignatureImage
            : report.preparerSignatureImage
        }
        saving={savingSignature}
        onClose={() => setSignatureModal(null)}
        onSave={async (sigDataUrl) => {
          if (!signatureModal) return;
          setSavingSignature(true);
          try {
            await onSaveSignature(signatureModal.target, sigDataUrl);
          } finally {
            setSavingSignature(false);
          }
        }}
      />
    </div>
  );
};
