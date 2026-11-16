import type {
  AuthUser,
  MaintenanceCategory,
  MaintenanceSite,
  MonthlyReportFull,
} from '../types/report.ts';
import { REPORT_STATUSES, TASK_STATUSES } from '../types/report.ts';
import { evaluateDualSignatureApproval } from '../utils/signatureValidation.ts';

export type ValidationStage =
  | 'draft_save'
  | 'sign_preparer'
  | 'submit_review'
  | 'sign_approver'
  | 'start_review'
  | 'forward_approval'
  | 'approve';

export type ReportValidationIssue = {
  fieldId: string;
  sectionId: string;
  sectionTitle: string;
  fieldLabel: string;
  message: string;
  severity: 'error' | 'warning';
};

export type ReportValidationResult = {
  isComplete: boolean;
  completenessPercentage: number;
  missingRequiredFields: number;
  affectedSections: number;
  totalApplicableRequiredFields: number;
  completedRequiredFields: number;
  dataIsComplete: boolean;
  issues: ReportValidationIssue[];
};

export interface ValidateReportOptions {
  stage?: ValidationStage;
  sites?: MaintenanceSite[];
  categories?: MaintenanceCategory[];
  user?: AuthUser | null;
  savingTarget?: 'preparer' | 'approver' | null;
}

export interface ValidationSectionGroup {
  sectionId: string;
  sectionTitle: string;
  issues: ReportValidationIssue[];
}

export const STAGE_ACTION_LABELS_AR: Record<ValidationStage, string> = {
  draft_save: 'حفظ التقرير',
  sign_preparer: 'توقيع معد التقرير',
  submit_review: 'إرسال التقرير للاعتماد',
  sign_approver: 'توقيع معتمد التقرير',
  start_review: 'بدء مراجعة التقرير',
  forward_approval: 'رفع التقرير للاعتماد',
  approve: 'الاعتماد النهائي للتقرير',
};

function isFiniteNonNegativeNumber(val: unknown): boolean {
  if (val === null || val === undefined || val === '') return false;
  if (typeof val !== 'number') return false;
  return Number.isFinite(val) && val >= 0;
}

function isValidIsoOrDateString(val: unknown): boolean {
  if (typeof val !== 'string') return false;
  const trimmed = val.trim();
  if (!trimmed) return false;
  const parsed = Date.parse(trimmed);
  return !Number.isNaN(parsed);
}

/**
 * Centralized Smart Completeness & Pre-Approval Validation Service
 * Used identically on BOTH Frontend UI and Backend Express/SQLite enforcement.
 *
 * CRITICAL DOMAIN RULE:
 * Numeric 0 is a 100% valid operational value (e.g. 0 faults, 0 requests, 0 risks)
 * and MUST NEVER be flagged as missing. Only null, undefined, NaN, negative values,
 * empty required text/dates, or logical inconsistencies are flagged.
 */
export function validateReportCompleteness(
  report: MonthlyReportFull,
  options: ValidateReportOptions = {}
): ReportValidationResult {
  const stage: ValidationStage = options.stage ?? 'draft_save';
  const issuesMap = new Map<string, ReportValidationIssue>();

  let totalRequired = 0;
  let completedRequired = 0;

  const checkField = (params: {
    passed: boolean;
    fieldId: string;
    sectionId: string;
    sectionTitle: string;
    fieldLabel: string;
    message: string;
    severity?: 'error' | 'warning';
  }) => {
    totalRequired += 1;
    if (params.passed) {
      completedRequired += 1;
      return;
    }
    if (!issuesMap.has(params.fieldId)) {
      issuesMap.set(params.fieldId, {
        fieldId: params.fieldId,
        sectionId: params.sectionId,
        sectionTitle: params.sectionTitle,
        fieldLabel: params.fieldLabel,
        message: params.message,
        severity: params.severity ?? 'error',
      });
    }
  };

  // =========================================================================
  // 1. البيانات الأساسية (Basic Report Metadata & Identity)
  // =========================================================================
  const basicSectionTitle = 'البيانات الأساسية وإعداد التقرير';
  checkField({
    passed: typeof report.reportNumber === 'string' && report.reportNumber.trim().length > 0,
    fieldId: 'field-report-number',
    sectionId: 'sec-summary',
    sectionTitle: basicSectionTitle,
    fieldLabel: 'رقم التقرير',
    message: 'رقم التقرير غير محدد.',
  });

  checkField({
    passed: Number.isInteger(report.month) && report.month >= 1 && report.month <= 12,
    fieldId: 'field-report-month',
    sectionId: 'sec-summary',
    sectionTitle: basicSectionTitle,
    fieldLabel: 'الشهر',
    message: 'يرجى تحديد شهر صحيح للتقرير (1 إلى 12).',
  });

  checkField({
    passed: Number.isInteger(report.year) && report.year >= 2020 && report.year <= 2100,
    fieldId: 'field-report-year',
    sectionId: 'sec-summary',
    sectionTitle: basicSectionTitle,
    fieldLabel: 'السنة',
    message: 'يرجى تحديد سنة صحيحة للتقرير.',
  });

  const approvalSectionTitle = 'الإعداد والمراجعة والاعتماد الرسمي';

  checkField({
    passed: typeof report.preparerName === 'string' && report.preparerName.trim().length > 0,
    fieldId: 'field-preparer-name',
    sectionId: 'sec-approval',
    sectionTitle: approvalSectionTitle,
    fieldLabel: 'اسم معد التقرير',
    message: 'حقل اسم معد التقرير فارغ ويجب إدخاله قبل المتابعة.',
  });

  checkField({
    passed: typeof report.preparerTitle === 'string' && report.preparerTitle.trim().length > 0,
    fieldId: 'field-preparer-title',
    sectionId: 'sec-approval',
    sectionTitle: approvalSectionTitle,
    fieldLabel: 'المنصب / المسمى الوظيفي لمعد التقرير',
    message: 'المسمى الوظيفي لمعد التقرير مطلوب.',
  });

  checkField({
    passed: isValidIsoOrDateString(report.preparedAt),
    fieldId: 'preparer-date-input',
    sectionId: 'sec-approval',
    sectionTitle: approvalSectionTitle,
    fieldLabel: 'تاريخ إعداد التقرير',
    message: 'يرجى تحديد تاريخ إعداد / تقديم التقرير في بطاقة الإعداد.',
  });

  checkField({
    passed: typeof report.approverName === 'string' && report.approverName.trim().length > 0,
    fieldId: 'field-approver-name',
    sectionId: 'sec-approval',
    sectionTitle: approvalSectionTitle,
    fieldLabel: 'اسم المعتمد',
    message: 'حقل اسم المعتمد فارغ في بطاقة اعتماد التقرير.',
  });

  checkField({
    passed: typeof report.approverTitle === 'string' && report.approverTitle.trim().length > 0,
    fieldId: 'field-approver-title',
    sectionId: 'sec-approval',
    sectionTitle: approvalSectionTitle,
    fieldLabel: 'المنصب / المسمى الوظيفي للمعتمد',
    message: 'المسمى الوظيفي لمعتمد التقرير مطلوب.',
  });

  // =========================================================================
  // 2. ملخص الخدمات (Services Summary)
  // =========================================================================
  const servicesSectionTitle = 'ملخص الخدمات';
  const services = Array.isArray(report.services) ? report.services : [];

  checkField({
    passed: services.length > 0,
    fieldId: 'sec-services',
    sectionId: 'sec-services',
    sectionTitle: servicesSectionTitle,
    fieldLabel: 'بنود الخدمات التشغيلية',
    message: 'يجب أن يحتوي التقرير على خدمة واحدة على الأقل في جدول ملخص الخدمات.',
  });

  for (const s of services) {
    const labelName = s.nameAr?.trim() || s.serviceId;
    checkField({
      passed: typeof s.nameAr === 'string' && s.nameAr.trim().length > 0,
      fieldId: `field-svc-name-${s.serviceId}`,
      sectionId: 'sec-services',
      sectionTitle: servicesSectionTitle,
      fieldLabel: `اسم الخدمة (${s.serviceId})`,
      message: 'اسم الخدمة باللغة العربية مطلوب.',
    });

    const recValid = isFiniteNonNegativeNumber(s.receivedCount);
    checkField({
      passed: recValid,
      fieldId: `field-svc-received-${s.serviceId}`,
      sectionId: 'sec-services',
      sectionTitle: servicesSectionTitle,
      fieldLabel: `${labelName} — الطلبات المستلمة`,
      message: 'قيمة الطلبات المستلمة غير صالحة (يجب أن تكون رقماً يساوي 0 أو أكبر).',
    });

    const execNumValid = isFiniteNonNegativeNumber(s.executedCount);
    const execLogicalValid = execNumValid && (!recValid || s.executedCount <= s.receivedCount);
    checkField({
      passed: execLogicalValid,
      fieldId: `field-svc-executed-${s.serviceId}`,
      sectionId: 'sec-services',
      sectionTitle: servicesSectionTitle,
      fieldLabel: `${labelName} — الطلبات المنفذة`,
      message: !execNumValid
        ? 'قيمة الطلبات المنفذة غير صالحة (يجب أن تكون رقماً يساوي 0 أو أكبر).'
        : `عدد الطلبات المنفذة (${s.executedCount}) يتجاوز عدد الطلبات المستلمة (${s.receivedCount}).`,
    });
  }

  // =========================================================================
  // 3. العقود والرخص (Contracts & Licenses — notes field is strictly optional)
  // =========================================================================
  const contractsSectionTitle = 'العقود والرخص';
  const requiredContractKeys = [
    { key: 'rental_contracts', label: 'العقود الإيجارية' },
    { key: 'commercial_licenses', label: 'الرخص التجارية' },
    { key: 'service_contracts', label: 'عقود الخدمات' },
  ] as const;
  const contractsMap = new Map((report.contracts || []).map((c) => [c.groupKey, c]));

  for (const reqGroup of requiredContractKeys) {
    const c = contractsMap.get(reqGroup.key);
    checkField({
      passed: !!c && isFiniteNonNegativeNumber(c.activeCount),
      fieldId: `field-con-active-${reqGroup.key}`,
      sectionId: 'sec-contracts',
      sectionTitle: contractsSectionTitle,
      fieldLabel: `${reqGroup.label} — فعالة`,
      message: `عدد ${reqGroup.label} الفعالة غير صالح أو مفقود.`,
    });

    checkField({
      passed: !!c && isFiniteNonNegativeNumber(c.inactiveCount),
      fieldId: `field-con-inactive-${reqGroup.key}`,
      sectionId: 'sec-contracts',
      sectionTitle: contractsSectionTitle,
      fieldLabel: `${reqGroup.label} — غير فعالة`,
      message: `عدد ${reqGroup.label} غير الفعالة غير صالح أو مفقود.`,
    });
  }

  // =========================================================================
  // 4. الطفايات وملاحظات المخاطر (Safety — notes field is strictly optional)
  // =========================================================================
  const safetySectionTitle = 'الطفايات وملاحظات المخاطر';
  const requiredSafetyKeys = [
    {
      key: 'fire_extinguishers',
      label: 'عدد الطفايات',
      primaryLabel: 'فعّالة',
      secondaryLabel: 'غير فعّالة',
    },
    {
      key: 'risk_observations',
      label: 'ملاحظات المخاطر',
      primaryLabel: 'مغلقة',
      secondaryLabel: 'غير مغلقة',
    },
  ] as const;
  const safetyMap = new Map((report.safety || []).map((s) => [s.groupKey, s]));

  for (const reqSafety of requiredSafetyKeys) {
    const sf = safetyMap.get(reqSafety.key);
    checkField({
      passed: !!sf && isFiniteNonNegativeNumber(sf.primaryCount),
      fieldId: `field-safety-primary-${reqSafety.key}`,
      sectionId: 'sec-safety',
      sectionTitle: safetySectionTitle,
      fieldLabel: `${reqSafety.label} — ${reqSafety.primaryLabel}`,
      message: `قيمة «${reqSafety.label} (${reqSafety.primaryLabel})» غير صالحة أو مفقودة.`,
    });

    checkField({
      passed: !!sf && isFiniteNonNegativeNumber(sf.secondaryCount),
      fieldId: `field-safety-secondary-${reqSafety.key}`,
      sectionId: 'sec-safety',
      sectionTitle: safetySectionTitle,
      fieldLabel: `${reqSafety.label} — ${reqSafety.secondaryLabel}`,
      message: `قيمة «${reqSafety.label} (${reqSafety.secondaryLabel})» غير صالحة أو مفقودة.`,
    });
  }

  // =========================================================================
  // 5. تفاصيل الصيانة بالمقرات والتكاليف (Maintenance Matrix & Costs)
  // =========================================================================
  const maintSectionTitle = 'تفاصيل الصيانة بالمقرات والتكاليف';
  const activeSites = (options.sites || []).filter((s) => s.isActive);
  const activeCategories = (options.categories || []).filter((c) => c.isActive);

  if (activeSites.length > 0 && activeCategories.length > 0) {
    for (const site of activeSites) {
      for (const cat of activeCategories) {
        const rawCell = report.maintenanceMatrix?.[site.id]?.[cat.id];
        // Uninitialized site-category cell defaults to 0; explicit null/NaN/negative is rejected
        const cellVal = rawCell === undefined ? 0 : rawCell;
        checkField({
          passed: isFiniteNonNegativeNumber(cellVal),
          fieldId: `field-maint-${site.id}-${cat.id}`,
          sectionId: 'sec-maintenance',
          sectionTitle: maintSectionTitle,
          fieldLabel: `${site.nameAr} — ${cat.nameAr}`,
          message: `عدد الأعطال في «${site.nameAr} / ${cat.nameAr}» يجب أن يكون رقماً غير سالب.`,
        });
      }
    }
  } else {
    // Fallback check on any stored matrix keys when sites/categories list isn't passed
    for (const [siteId, catMap] of Object.entries(report.maintenanceMatrix || {})) {
      for (const [catId, cellVal] of Object.entries(catMap || {})) {
        checkField({
          passed: isFiniteNonNegativeNumber(cellVal),
          fieldId: `field-maint-${siteId}-${catId}`,
          sectionId: 'sec-maintenance',
          sectionTitle: maintSectionTitle,
          fieldLabel: `خلية الصيانة (${siteId} / ${catId})`,
          message: 'قيمة عدد الأعطال يجب أن تكون رقماً غير سالب.',
        });
      }
    }
  }

  const categoriesForCosts =
    activeCategories.length > 0
      ? activeCategories
      : Object.keys(report.maintenanceCosts || {}).map((id) => ({ id, nameAr: id }));

  for (const cat of categoriesForCosts) {
    const entry = report.maintenanceCosts?.[cat.id];
    const pettyVal = entry === undefined ? 0 : entry.pettyCashAed;
    const poVal = entry === undefined ? 0 : entry.purchaseOrderAed;

    checkField({
      passed: isFiniteNonNegativeNumber(pettyVal),
      fieldId: `field-cost-petty-${cat.id}`,
      sectionId: 'sec-maintenance',
      sectionTitle: maintSectionTitle,
      fieldLabel: `تكلفة النثرية — ${cat.nameAr}`,
      message: `قيمة تكلفة النثرية لفئة «${cat.nameAr}» يجب أن تكون رقماً يساوي 0 أو أكبر.`,
    });

    checkField({
      passed: isFiniteNonNegativeNumber(poVal),
      fieldId: `field-cost-po-${cat.id}`,
      sectionId: 'sec-maintenance',
      sectionTitle: maintSectionTitle,
      fieldLabel: `تكلفة أمر الشراء — ${cat.nameAr}`,
      message: `قيمة تكلفة أمر الشراء لفئة «${cat.nameAr}» يجب أن تكون رقماً يساوي 0 أو أكبر.`,
    });
  }

  // =========================================================================
  // 6. الدعم اللوجستي (Logistics)
  // =========================================================================
  const logisticsSectionTitle = 'الدعم اللوجستي';
  const logistics = Array.isArray(report.logistics) ? report.logistics : [];
  checkField({
    passed: logistics.length > 0,
    fieldId: 'sec-logistics',
    sectionId: 'sec-logistics',
    sectionTitle: logisticsSectionTitle,
    fieldLabel: 'قنوات الدعم اللوجستي',
    message: 'بيانات قنوات الدعم اللوجستي مفقودة.',
  });

  for (const ch of logistics) {
    checkField({
      passed: isFiniteNonNegativeNumber(ch.requestCount),
      fieldId: `field-log-${ch.channelKey}`,
      sectionId: 'sec-logistics',
      sectionTitle: logisticsSectionTitle,
      fieldLabel: `الدعم اللوجستي — ${ch.nameAr}`,
      message: `عدد طلبات «${ch.nameAr}» يجب أن يكون رقماً غير سالب.`,
    });
  }

  // =========================================================================
  // 7. خدمات الصيانة — مصادر الطلبات (Maintenance Services)
  // =========================================================================
  const maintSvcSectionTitle = 'خدمات الصيانة (مصادر الطلبات)';
  checkField({
    passed: isFiniteNonNegativeNumber(report.maintenanceServices?.fromFacilitiesDept),
    fieldId: 'field-maint-svc-facilities',
    sectionId: 'sec-maint-services',
    sectionTitle: maintSvcSectionTitle,
    fieldLabel: 'طلبات الصيانة من قسم المرافق',
    message: 'عدد الطلبات الواردة من قسم المرافق يجب أن يكون رقماً يساوي 0 أو أكبر.',
  });

  checkField({
    passed: isFiniteNonNegativeNumber(report.maintenanceServices?.fromOtherDepts),
    fieldId: 'field-maint-svc-other',
    sectionId: 'sec-maint-services',
    sectionTitle: maintSvcSectionTitle,
    fieldLabel: 'طلبات الصيانة من الإدارات الأخرى',
    message: 'عدد الطلبات الواردة من الإدارات الأخرى يجب أن يكون رقماً يساوي 0 أو أكبر.',
  });

  // =========================================================================
  // 8. خدمات الأمن والاستقبال (Security & Reception)
  // =========================================================================
  const securitySectionTitle = 'خدمات الأمن والاستقبال';
  const secItems = Array.isArray(report.securityReception) ? report.securityReception : [];
  checkField({
    passed: secItems.length > 0,
    fieldId: 'sec-security',
    sectionId: 'sec-security',
    sectionTitle: securitySectionTitle,
    fieldLabel: 'بنود خدمات الأمن والاستقبال',
    message: 'يجب وجود بيان واحد على الأقل في جدول خدمات الأمن والاستقبال.',
  });

  for (const sr of secItems) {
    const labelName = sr.nameAr?.trim() || sr.activityKey;
    const recValid = isFiniteNonNegativeNumber(sr.receivedCount);
    checkField({
      passed: recValid,
      fieldId: `field-sec-received-${sr.activityKey}`,
      sectionId: 'sec-security',
      sectionTitle: securitySectionTitle,
      fieldLabel: `${labelName} — الطلبات المستلمة`,
      message: `عدد الطلبات المستلمة لبند «${labelName}» غير صالح.`,
    });

    const execValid = isFiniteNonNegativeNumber(sr.executedCount);
    checkField({
      passed: execValid && (!recValid || sr.executedCount <= sr.receivedCount),
      fieldId: `field-sec-executed-${sr.activityKey}`,
      sectionId: 'sec-security',
      sectionTitle: securitySectionTitle,
      fieldLabel: `${labelName} — الطلبات المنفذة`,
      message: !execValid
        ? `عدد الطلبات المنفذة لبند «${labelName}» غير صالح.`
        : `الطلبات المنفذة لبند «${labelName}» (${sr.executedCount}) تتجاوز المستلمة (${sr.receivedCount}).`,
    });
  }

  // =========================================================================
  // 9. المهام التشغيلية والمتابعة (Operational Tasks)
  // Empty placeholder rows with no entries are optional; partially filled or
  // logically inconsistent rows must be completed/fixed before approval.
  // =========================================================================
  const tasksSectionTitle = 'المهام التشغيلية والمتابعة';
  for (let i = 0; i < (report.tasks || []).length; i++) {
    const t = report.tasks[i];
    const hasTopic = typeof t.topic === 'string' && t.topic.trim().length > 0;
    const hasTaskName = typeof t.taskName === 'string' && t.taskName.trim().length > 0;
    const isRowTouched =
      hasTopic ||
      hasTaskName ||
      t.status !== TASK_STATUSES.NOT_STARTED ||
      (Number(t.completionPct) || 0) !== 0;

    if (!isRowTouched) continue;

    const rowLabel = `مهمة #${i + 1}`;
    checkField({
      passed: hasTopic,
      fieldId: `field-task-topic-${t.id}`,
      sectionId: 'sec-tasks',
      sectionTitle: tasksSectionTitle,
      fieldLabel: `${rowLabel} — الموضوع`,
      message: 'يرجى إدخال موضوع المهمة عند تفعيل صف المهمة.',
    });

    checkField({
      passed: hasTaskName,
      fieldId: `field-task-name-${t.id}`,
      sectionId: 'sec-tasks',
      sectionTitle: tasksSectionTitle,
      fieldLabel: `${rowLabel} — وصف المهمة`,
      message: 'يرجى إدخال وصف المهمة المطلوبة.',
    });

    const pctValid =
      typeof t.completionPct === 'number' &&
      Number.isFinite(t.completionPct) &&
      t.completionPct >= 0 &&
      t.completionPct <= 100;

    checkField({
      passed: pctValid,
      fieldId: `field-task-pct-${t.id}`,
      sectionId: 'sec-tasks',
      sectionTitle: tasksSectionTitle,
      fieldLabel: `${rowLabel} — نسبة الإنجاز`,
      message: 'نسبة إنجاز المهمة يجب أن تكون بين 0% و 100%.',
    });

    const statusConsistent =
      !(t.status === TASK_STATUSES.COMPLETED && (t.completionPct < 100 || !hasTopic || !hasTaskName)) &&
      !(t.status === TASK_STATUSES.NOT_STARTED && t.completionPct > 0);

    checkField({
      passed: statusConsistent,
      fieldId: `field-task-status-${t.id}`,
      sectionId: 'sec-tasks',
      sectionTitle: tasksSectionTitle,
      fieldLabel: `${rowLabel} — اتساق الحالة ونسبة الإنجاز`,
      message:
        t.status === TASK_STATUSES.COMPLETED
          ? 'المهمة محددة كمكتملة ولكن نسبة الإنجاز أقل من 100% أو بياناتها غير مكتملة.'
          : 'المهمة محددة كـ «لم تبدأ» بينما نسبة الإنجاز أكبر من 0%.',
    });
  }

  // =========================================================================
  // 10. التحديات والتوصيات (Challenges & Mandatory Recommendations when logged)
  // =========================================================================
  const challengesSectionTitle = 'التحديات والتوصيات';
  for (let i = 0; i < (report.challenges || []).length; i++) {
    const ch = report.challenges[i];
    const hasChal = typeof ch.challengeText === 'string' && ch.challengeText.trim().length > 0;
    const hasUpd = typeof ch.updateText === 'string' && ch.updateText.trim().length > 0;
    const hasRec =
      typeof ch.recommendationText === 'string' && ch.recommendationText.trim().length > 0;

    if (!hasChal && !hasUpd && !hasRec) continue;

    const rowLabel = `بند التحدي #${i + 1}`;
    checkField({
      passed: hasChal,
      fieldId: `field-chal-text-${ch.id}`,
      sectionId: 'sec-challenges',
      sectionTitle: challengesSectionTitle,
      fieldLabel: `${rowLabel} — التحديات والعوائق`,
      message: 'وصف التحدي أو العائق مطلوب عند وجود تحديث أو توصية مسجلة.',
    });

    checkField({
      passed: hasUpd,
      fieldId: `field-chal-update-${ch.id}`,
      sectionId: 'sec-challenges',
      sectionTitle: challengesSectionTitle,
      fieldLabel: `${rowLabel} — التحديث والإجراءات المتخذة`,
      message: 'يجب توضيح التحديث والإجراءات المتخذة للتحدي المسجل.',
    });

    checkField({
      passed: hasRec,
      fieldId: `field-chal-rec-${ch.id}`,
      sectionId: 'sec-challenges',
      sectionTitle: challengesSectionTitle,
      fieldLabel: `${rowLabel} — التوصية التنفيذية`,
      message: 'التوصية التنفيذية إلزامية عند تسجيل أي تحدٍ في التقرير.',
    });
  }

  // Capture data completeness BEFORE adding stage-specific signature gates
  const dataIssuesCount = issuesMap.size;
  const dataIsComplete = dataIssuesCount === 0;

  // =========================================================================
  // 11. بوابة التوقيعات الإلكترونية ومسار الاعتماد حسب المرحلة
  // =========================================================================
  const dualSig = evaluateDualSignatureApproval(report, options.user ?? null, {
    savingTarget: options.savingTarget ?? null,
  });

  if (stage === 'submit_review' || stage === 'start_review' || stage === 'forward_approval') {
    checkField({
      passed: dualSig.hasValidPreparerSignature,
      fieldId: 'field-preparer-signature-area',
      sectionId: 'sec-approval',
      sectionTitle: approvalSectionTitle,
      fieldLabel: 'توقيع معد التقرير الإلكتروني',
      message:
        dualSig.preparer.reason ||
        'يجب إضافة وحفظ التوقيع الإلكتروني لمعد التقرير قبل إرسال التقرير للاعتماد.',
    });
  } else if (stage === 'approve') {
    checkField({
      passed:
        report.status === REPORT_STATUSES.PENDING_APPROVAL ||
        report.status === REPORT_STATUSES.READY_FOR_REVIEW ||
        report.status === REPORT_STATUSES.UNDER_REVIEW,
      fieldId: 'field-preparer-submit-btn',
      sectionId: 'sec-approval',
      sectionTitle: approvalSectionTitle,
      fieldLabel: 'إرسال التقرير لمرحلة الاعتماد',
      message: 'التقرير ما زال في حالة مسودة؛ يجب إرساله للاعتماد أولاً قبل الاعتماد النهائي.',
    });

    checkField({
      passed: dualSig.hasValidPreparerSignature,
      fieldId: 'field-preparer-signature-area',
      sectionId: 'sec-approval',
      sectionTitle: approvalSectionTitle,
      fieldLabel: 'توقيع معد التقرير الإلكتروني',
      message:
        dualSig.preparer.reason ||
        'توقيع معد التقرير مفقود أو غير صالح — يجب توفر توقيع الطرفين معاً.',
    });

    checkField({
      passed: dualSig.hasValidApproverSignature,
      fieldId: 'field-approver-signature-area',
      sectionId: 'sec-approval',
      sectionTitle: approvalSectionTitle,
      fieldLabel: 'توقيع معتمد التقرير الإلكتروني',
      message:
        dualSig.approver.reason ||
        'توقيع معتمد التقرير مفقود أو غير صالح — يجب توفر توقيع الطرفين معاً.',
    });
  }

  const issues = Array.from(issuesMap.values());
  const affectedSections = new Set(issues.map((i) => i.sectionId)).size;
  const completenessPercentage =
    totalRequired > 0
      ? Math.max(0, Math.min(100, Math.round((completedRequired / totalRequired) * 100)))
      : 100;

  return {
    isComplete: issues.length === 0,
    completenessPercentage,
    missingRequiredFields: issues.length,
    affectedSections,
    totalApplicableRequiredFields: totalRequired,
    completedRequiredFields: completedRequired,
    dataIsComplete,
    issues,
  };
}

export function groupValidationIssuesBySection(
  issues: ReportValidationIssue[]
): ValidationSectionGroup[] {
  const groups: ValidationSectionGroup[] = [];
  const indexMap = new Map<string, number>();

  for (const issue of issues) {
    const existingIdx = indexMap.get(issue.sectionId);
    if (existingIdx !== undefined) {
      groups[existingIdx].issues.push(issue);
    } else {
      indexMap.set(issue.sectionId, groups.length);
      groups.push({
        sectionId: issue.sectionId,
        sectionTitle: issue.sectionTitle,
        issues: [issue],
      });
    }
  }

  return groups;
}
