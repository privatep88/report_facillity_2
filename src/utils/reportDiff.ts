import type {
  MaintenanceCategory,
  MaintenanceSite,
  MonthlyReportFull,
} from '../types/report.ts';

export interface ReportFieldDiff {
  fieldPath: string;
  fieldLabel: string;
  previousValue: string;
  newValue: string;
}

function fmtVal(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

/**
 * Computes human-readable field-level differences between two saved report states
 * so audit logs capture exact previousValue -> newValue changes across all sections.
 */
export function computeReportFieldDiffs(
  prev: MonthlyReportFull,
  next: MonthlyReportFull,
  sites: MaintenanceSite[] = [],
  categories: MaintenanceCategory[] = []
): ReportFieldDiff[] {
  const diffs: ReportFieldDiff[] = [];
  const siteNameMap = new Map(sites.map((s) => [s.id, s.nameAr]));
  const catNameMap = new Map(categories.map((c) => [c.id, c.nameAr]));

  const pushIfChanged = (fieldPath: string, fieldLabel: string, oldVal: unknown, newVal: unknown) => {
    const a = fmtVal(oldVal);
    const b = fmtVal(newVal);
    if (a !== b) {
      diffs.push({
        fieldPath,
        fieldLabel,
        previousValue: a || '—',
        newValue: b || '—',
      });
    }
  };

  pushIfChanged('classification', 'التصنيف', prev.classification, next.classification);
  pushIfChanged('preparerName', 'اسم معد التقرير', prev.preparerName, next.preparerName);
  pushIfChanged('preparerTitle', 'المسمى الوظيفي لمعد التقرير', prev.preparerTitle, next.preparerTitle);
  pushIfChanged('preparedAt', 'تاريخ إعداد التقرير', prev.preparedAt, next.preparedAt);
  pushIfChanged('approverName', 'اسم معتمد التقرير', prev.approverName, next.approverName);
  pushIfChanged('approverTitle', 'المسمى الوظيفي للمعتمد', prev.approverTitle, next.approverTitle);
  pushIfChanged('approvedAt', 'تاريخ الاعتماد', prev.approvedAt, next.approvedAt);

  pushIfChanged(
    'maintenanceServices.fromFacilitiesDept',
    'طلبات الصيانة من قسم المرافق',
    prev.maintenanceServices?.fromFacilitiesDept ?? 0,
    next.maintenanceServices?.fromFacilitiesDept ?? 0
  );
  pushIfChanged(
    'maintenanceServices.fromOtherDepts',
    'طلبات الصيانة من الإدارات الأخرى',
    prev.maintenanceServices?.fromOtherDepts ?? 0,
    next.maintenanceServices?.fromOtherDepts ?? 0
  );

  // Services
  const prevSvcMap = new Map(prev.services.map((s) => [s.serviceId, s]));
  const nextSvcMap = new Map(next.services.map((s) => [s.serviceId, s]));
  for (const [sid, sNext] of nextSvcMap.entries()) {
    const sPrev = prevSvcMap.get(sid);
    if (!sPrev) {
      diffs.push({
        fieldPath: `services.${sid}`,
        fieldLabel: `إضافة خدمة (${sNext.nameAr})`,
        previousValue: 'غير موجودة',
        newValue: `مستلمة: ${sNext.receivedCount} / منفذة: ${sNext.executedCount}`,
      });
    } else {
      pushIfChanged(`services.${sid}.nameAr`, `مسمى خدمة (${sPrev.nameAr})`, sPrev.nameAr, sNext.nameAr);
      pushIfChanged(
        `services.${sid}.receivedCount`,
        `${sNext.nameAr} — الطلبات المستلمة`,
        sPrev.receivedCount,
        sNext.receivedCount
      );
      pushIfChanged(
        `services.${sid}.executedCount`,
        `${sNext.nameAr} — الطلبات المنفذة`,
        sPrev.executedCount,
        sNext.executedCount
      );
    }
  }
  for (const [sid, sPrev] of prevSvcMap.entries()) {
    if (!nextSvcMap.has(sid)) {
      diffs.push({
        fieldPath: `services.${sid}`,
        fieldLabel: `حذف خدمة (${sPrev.nameAr})`,
        previousValue: sPrev.nameAr,
        newValue: 'محذوفة',
      });
    }
  }

  // Contracts & Licenses
  const prevConMap = new Map(prev.contracts.map((c) => [c.groupKey, c]));
  for (const cNext of next.contracts) {
    const cPrev = prevConMap.get(cNext.groupKey);
    if (!cPrev) continue;
    pushIfChanged(`contracts.${cNext.groupKey}.activeCount`, `${cNext.nameAr} — فعالة`, cPrev.activeCount, cNext.activeCount);
    pushIfChanged(
      `contracts.${cNext.groupKey}.inactiveCount`,
      `${cNext.nameAr} — غير فعالة`,
      cPrev.inactiveCount,
      cNext.inactiveCount
    );
    pushIfChanged(`contracts.${cNext.groupKey}.notes`, `${cNext.nameAr} — الملاحظات`, cPrev.notes, cNext.notes);
  }

  // Safety Metrics
  const prevSafMap = new Map(prev.safety.map((s) => [s.groupKey, s]));
  for (const sfNext of next.safety) {
    const sfPrev = prevSafMap.get(sfNext.groupKey);
    if (!sfPrev) continue;
    pushIfChanged(
      `safety.${sfNext.groupKey}.primaryCount`,
      `${sfNext.nameAr} (${sfNext.primaryLabelAr})`,
      sfPrev.primaryCount,
      sfNext.primaryCount
    );
    pushIfChanged(
      `safety.${sfNext.groupKey}.secondaryCount`,
      `${sfNext.nameAr} (${sfNext.secondaryLabelAr})`,
      sfPrev.secondaryCount,
      sfNext.secondaryCount
    );
    pushIfChanged(`safety.${sfNext.groupKey}.notes`, `${sfNext.nameAr} — الملاحظات`, sfPrev.notes, sfNext.notes);
  }

  // Maintenance Matrix
  const allSiteIds = new Set([
    ...Object.keys(prev.maintenanceMatrix || {}),
    ...Object.keys(next.maintenanceMatrix || {}),
  ]);
  for (const siteId of allSiteIds) {
    const pSite = prev.maintenanceMatrix?.[siteId] || {};
    const nSite = next.maintenanceMatrix?.[siteId] || {};
    const allCatIds = new Set([...Object.keys(pSite), ...Object.keys(nSite)]);
    for (const catId of allCatIds) {
      const pVal = Number(pSite[catId] ?? 0);
      const nVal = Number(nSite[catId] ?? 0);
      if (pVal !== nVal) {
        diffs.push({
          fieldPath: `maintenanceMatrix.${siteId}.${catId}`,
          fieldLabel: `صيانة (${siteNameMap.get(siteId) || siteId} / ${catNameMap.get(catId) || catId})`,
          previousValue: String(pVal),
          newValue: String(nVal),
        });
      }
    }
  }

  // Maintenance Costs
  const allCostCats = new Set([
    ...Object.keys(prev.maintenanceCosts || {}),
    ...Object.keys(next.maintenanceCosts || {}),
  ]);
  for (const catId of allCostCats) {
    const pEntry = prev.maintenanceCosts?.[catId] ?? { pettyCashAed: 0, purchaseOrderAed: 0 };
    const nEntry = next.maintenanceCosts?.[catId] ?? { pettyCashAed: 0, purchaseOrderAed: 0 };
    const cLabel = catNameMap.get(catId) || catId;
    pushIfChanged(`maintenanceCosts.${catId}.pettyCashAed`, `نثرية الصيانة (${cLabel})`, pEntry.pettyCashAed, nEntry.pettyCashAed);
    pushIfChanged(`maintenanceCosts.${catId}.purchaseOrderAed`, `أوامر شراء الصيانة (${cLabel})`, pEntry.purchaseOrderAed, nEntry.purchaseOrderAed);
  }

  // Logistics
  const prevLogMap = new Map(prev.logistics.map((l) => [l.channelKey, l]));
  for (const lNext of next.logistics) {
    const lPrev = prevLogMap.get(lNext.channelKey);
    if (!lPrev) continue;
    pushIfChanged(`logistics.${lNext.channelKey}.requestCount`, `الدعم اللوجستي (${lNext.nameAr})`, lPrev.requestCount, lNext.requestCount);
  }

  // Security & Reception
  const prevSecMap = new Map(prev.securityReception.map((s) => [s.activityKey, s]));
  const nextSecMap = new Map(next.securityReception.map((s) => [s.activityKey, s]));
  for (const [key, sNext] of nextSecMap.entries()) {
    const sPrev = prevSecMap.get(key);
    if (!sPrev) {
      diffs.push({
        fieldPath: `securityReception.${key}`,
        fieldLabel: `إضافة بيان أمني (${sNext.nameAr})`,
        previousValue: 'غير موجود',
        newValue: `مستلمة: ${sNext.receivedCount} / منفذة: ${sNext.executedCount}`,
      });
    } else {
      pushIfChanged(`securityReception.${key}.nameAr`, `مسمى بيان الأمن (${sPrev.nameAr})`, sPrev.nameAr, sNext.nameAr);
      pushIfChanged(
        `securityReception.${key}.receivedCount`,
        `${sNext.nameAr} — المستلمة`,
        sPrev.receivedCount,
        sNext.receivedCount
      );
      pushIfChanged(
        `securityReception.${key}.executedCount`,
        `${sNext.nameAr} — المنفذة`,
        sPrev.executedCount,
        sNext.executedCount
      );
    }
  }
  for (const [key, sPrev] of prevSecMap.entries()) {
    if (!nextSecMap.has(key)) {
      diffs.push({
        fieldPath: `securityReception.${key}`,
        fieldLabel: `حذف بيان أمني (${sPrev.nameAr})`,
        previousValue: sPrev.nameAr,
        newValue: 'محذوف',
      });
    }
  }

  // Tasks & Challenges summary diff if changed
  const prevTasksSig = JSON.stringify(prev.tasks.map((t) => [t.topic, t.taskName, t.status, t.completionPct]));
  const nextTasksSig = JSON.stringify(next.tasks.map((t) => [t.topic, t.taskName, t.status, t.completionPct]));
  if (prevTasksSig !== nextTasksSig) {
    diffs.push({
      fieldPath: 'tasks',
      fieldLabel: 'جدول المهام التشغيلية والمتابعة',
      previousValue: `${prev.tasks.length} مهام`,
      newValue: `${next.tasks.length} مهام (محدثة)`,
    });
  }

  const prevChalSig = JSON.stringify(prev.challenges.map((c) => [c.challengeText, c.updateText, c.recommendationText]));
  const nextChalSig = JSON.stringify(next.challenges.map((c) => [c.challengeText, c.updateText, c.recommendationText]));
  if (prevChalSig !== nextChalSig) {
    diffs.push({
      fieldPath: 'challenges',
      fieldLabel: 'التحديات والتوصيات التنفيذية',
      previousValue: `${prev.challenges.length} بنود`,
      newValue: `${next.challenges.length} بنود (محدثة)`,
    });
  }

  return diffs;
}
