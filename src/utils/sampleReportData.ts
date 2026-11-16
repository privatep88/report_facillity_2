import type {
  MaintenanceCategory,
  MaintenanceSite,
  MonthlyReportFull,
  TaskStatus,
} from '../types/report.ts';
import { TASK_STATUSES } from '../types/report.ts';
import { syncReceptionServiceWithSecurity } from './calculations.ts';

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickRandom<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

const CONTRACT_NOTES_SAMPLES: Record<string, string[]> = {
  rental_contracts: [
    'جميع العقود الإيجارية للمقرات التشغيلية سارية المفعول، وتم تجديد عقد مقر ابن بطوطة لمدة سنتين إضافيتين.',
    'العقود الإيجارية محدّثة بالكامل في نظام الأصول مع جدولة الدفعات الربع سنوية وفق الخطة المعتمدة.',
    'تمت مراجعة التزامات المؤجرين للصيانة الهيكلية والتأكد من سريان كافة ملاحق العقود الإيجارية.',
  ],
  commercial_licenses: [
    'الرخص التجارية لجميع الفروع والمقرات فعّالة ومجددة لدى دوائر التنمية الاقتصادية والجهات المختصة.',
    'كافة الرخص التجارية وشهادات الدفاع المدني للمقرات سارية ولا توجد أي غرامات أو متأخرات تنظيمية.',
    'تم تحديث بيانات الرخص التجارية وربطها بالسجل الرقمي الموحد لإدارة الخدمات العامة.',
  ],
  service_contracts: [
    'تشمل عقود الصيانة الوقائية للتكييف، المصاعد، أنظمة الإنذار المبكر، النظافة التخصصية، ومكافحة الآفات.',
    'جميع عقود الخدمات التشغيلية تخضع لتقييم مؤشرات مستوى الخدمة (SLA) الشهري بنسبة التزام تتجاوز 95%.',
    'تم تفعيل ملحق عقد صيانة أنظمة التبريد المركزي وتوريد قطع الغيار الأصلية للمقرات الرئيسية.',
  ],
};

const SAFETY_NOTES_SAMPLES: Record<string, string[]> = {
  fire_extinguishers: [
    'تم فحص كافة طفايات الحريق يدوياً وميدانياً بجميع المقرات والتأكد من صلاحية ضغط الغاز وأختام الأمان.',
    'جميع الطفايات مفحوصة ومعتمدة بشهادات صيانة دورية، وتم استبدال الطفايات الاحتياطية في مقر الدوريات.',
    'تم استكمال الجولة التفتيشية الشهرية لأنظمة الإطفاء اليدوية والآلية وتوثيق سجل الجاهزية.',
  ],
  risk_observations: [
    'تمت معالجة وإغلاق الملاحظات الميدانية المتعلقة بمسارات الطوارئ وإنارة المخارج الاحتياطية خلال 24 ساعة.',
    'تم رصد ملاحظات وقائية بسيطة في غرف الخدمات الكهربائية وجارٍ استكمال إغلاق البند المتبقي مع المقاول المختص.',
    'انخفاض ملحوظ في ملاحظات المخاطر التشغيلية نتيجة تكثيف الجولات التفتيشية الاستباقية بجميع المواقع.',
  ],
};

const SAMPLE_TASKS_POOL: Array<{
  topic: string;
  taskName: string;
  status: TaskStatus;
  completionPct: number;
}> = [
  {
    topic: 'الصيانة الوقائية لأنظمة التكييف والتبريد (HVAC)',
    taskName: 'تنفيذ الصيانة الدورية لفلاتر ووحدات التكييف المركزية في مقر إنجازات ومقر ابن بطوطة وفحص كفاءة التبريد.',
    status: TASK_STATUSES.COMPLETED,
    completionPct: 100,
  },
  {
    topic: 'فحص أنظمة السلامة والإنذار المبكر',
    taskName: 'إجراء الاختبار الشهري الشامل للوحات إنذار الحريق وكواشف الدخان ومخارج الطوارئ في جميع المقرات.',
    status: TASK_STATUSES.COMPLETED,
    completionPct: 100,
  },
  {
    topic: 'تحديث سجل الأصول والممتلكات المكتبية',
    taskName: 'جرد وتحديث بطاقات الأصول الثابتة والأثاث المكتبي والأجهزة المساندة ومطابقتها مع النظام المالي.',
    status: TASK_STATUSES.IN_PROGRESS,
    completionPct: 85,
  },
  {
    topic: 'تحسين كفاءة استهلاك الطاقة والإنارة',
    taskName: 'استبدال وحدات الإنارة التقليدية بوحدات LED موفرة للطاقة في الممرات ومواقف الدوريات الخارجية.',
    status: TASK_STATUSES.IN_PROGRESS,
    completionPct: 75,
  },
  {
    topic: 'تأهيل وتطوير قاعات الاجتماعات والاستقبال',
    taskName: 'تحديث التجهيزات السمعية والبصرية وأعمال الديكور في قاعات الاجتماعات الرئيسية وبهو الاستقبال.',
    status: TASK_STATUSES.COMPLETED,
    completionPct: 100,
  },
  {
    topic: 'مراجعة عقود مقدمي الخدمات المساندة (SLA)',
    taskName: 'تقييم الأداء الشهري لشركات النظافة والضيافة وإدارة النفايات ومطابقة محاضر الاستلام.',
    status: TASK_STATUSES.COMPLETED,
    completionPct: 100,
  },
];

const SAMPLE_CHALLENGES_POOL: Array<{
  challengeText: string;
  updateText: string;
  recommendationText: string;
}> = [
  {
    challengeText: 'عدم التمكن من إصدار تراخيص البناء لأرض مصفح',
    updateText:
      'تم مخاطبة بلدية أبوظبي للحصول على ترخيص البناء في أرض مصفح وتم الرد بأنه تم إيقاف إصدار تراخيص البناء للأرض في الوقت الحالي.',
    recommendationText: 'تصعيد الموضوع للإدارة العليا للبت في حالة الأرض والبدائل الاستثمارية والتشغيلية المتاحة.',
  },
  {
    challengeText: 'تأخر توريد بعض قطع الغيار التخصصية لوحدات التكييف المركزي في مقر الدوريات',
    updateText:
      'تم التواصل مع الوكيل المعتمد وتأمين قطع بديلة مؤقتة لضمان استمرارية التبريد دون توقف لحين وصول الشحنة الرئيسية.',
    recommendationText:
      'إلزام مقاول الصيانة بالاحتفاظ بمخزون استراتيجي للقطع الحرجة داخل مستودعات الشركة لتقليص زمن الاستجابة.',
  },
  {
    challengeText: 'ارتفاع كثافة الزوار والمراجعين في أوقات الذروة الصباحية بمقر إنجازات',
    updateText:
      'تمت إعادة توزيع موظفي الاستقبال والأمن وتفعيل مسار سريع لإصدار وتفعيل بطاقات الزوار والموردين.',
    recommendationText:
      'تعميم نظام التسجيل المسبق للزوار والموردين إلكترونياً لرفع سرعة الإنجاز في مكتب الاستقبال بنسبة 35%.',
  },
];

/**
 * Generates realistic, internally consistent sample facilities management data
 * across all designated fields of a MonthlyReportFull.
 */
export function populateReportWithSampleData(
  report: MonthlyReportFull,
  sites: MaintenanceSite[],
  categories: MaintenanceCategory[]
): MonthlyReportFull {
  // 1. Security & Reception activities (generate first so svc_reception links cleanly)
  const nextSecurity = report.securityReception.map((sr) => {
    let rec = randInt(18, 65);
    let exec = rec - randInt(0, 2);
    if (sr.activityKey === 'visitors') {
      rec = randInt(140, 260);
      exec = rec;
    } else if (sr.activityKey === 'vendor_visitors') {
      rec = randInt(35, 85);
      exec = rec;
    } else if (sr.activityKey === 'card_activation') {
      rec = randInt(45, 95);
      exec = rec - randInt(0, 2);
    } else if (sr.activityKey === 'hall_booking') {
      rec = randInt(28, 58);
      exec = rec;
    } else if (sr.activityKey === 'evacuation') {
      rec = randInt(1, 3);
      exec = rec;
    } else if (sr.activityKey === 'security_reports') {
      rec = randInt(12, 28);
      exec = rec;
    } else if (sr.activityKey === 'emergencies') {
      rec = randInt(0, 2);
      exec = rec;
    }
    return {
      ...sr,
      receivedCount: Math.max(0, rec),
      executedCount: Math.max(0, Math.min(rec, exec)),
    };
  });

  // 2. Logistics channels (generate before services so svc_logistics matches total)
  const nextLogistics = report.logistics.map((ch) => {
    let count = randInt(12, 42);
    if (ch.channelKey === 'courier') count = randInt(38, 72);
    else if (ch.channelKey === 'emirates_post') count = randInt(18, 36);
    else if (ch.channelKey === 'aramex') count = randInt(22, 48);
    else if (ch.channelKey === 'tawzea') count = randInt(14, 30);
    else if (ch.channelKey === 'other') count = randInt(6, 16);
    return {
      ...ch,
      requestCount: count,
    };
  });
  const totalLogisticsRequests = nextLogistics.reduce((sum, ch) => sum + ch.requestCount, 0);

  // 3. Maintenance Matrix & Costs across all sites and categories
  const activeSites = sites.length > 0 ? sites : [];
  const activeCats = categories.length > 0 ? categories : [];
  const nextMatrix: Record<string, Record<string, number>> = {};
  const catFaultTotals: Record<string, number> = {};
  let grandTotalFaults = 0;

  for (const cat of activeCats) {
    catFaultTotals[cat.id] = 0;
  }

  for (const site of activeSites) {
    nextMatrix[site.id] = {};
    for (const cat of activeCats) {
      // Realistic fault distribution per site/category (0 to 6 faults)
      const weight =
        cat.id === 'cat_lighting' || cat.id === 'cat_hvac' || cat.id === 'cat_general' || cat.id === 'cat_electrical'
          ? randInt(1, 6)
          : cat.id === 'cat_elevators' || cat.id === 'cat_signage'
            ? randInt(0, 2)
            : randInt(0, 4);
      nextMatrix[site.id][cat.id] = weight;
      catFaultTotals[cat.id] = (catFaultTotals[cat.id] || 0) + weight;
      grandTotalFaults += weight;
    }
  }

  const nextCosts: MonthlyReportFull['maintenanceCosts'] = {};
  for (const cat of activeCats) {
    const faults = catFaultTotals[cat.id] || 0;
    const pettyCashAed = faults > 0 ? Math.round(faults * randInt(85, 240) * 10) / 10 : 0;
    const purchaseOrderAed =
      faults >= 2 && (cat.id === 'cat_hvac' || cat.id === 'cat_electrical' || cat.id === 'cat_elevators' || cat.id === 'cat_decor' || cat.id === 'cat_fire_alarm')
        ? Math.round(faults * randInt(320, 780) * 10) / 10
        : faults >= 3
          ? Math.round(faults * randInt(150, 350) * 10) / 10
          : 0;
    nextCosts[cat.id] = {
      categoryId: cat.id,
      pettyCashAed,
      purchaseOrderAed,
    };
  }

  // 4. Maintenance Services (request sources matching total maintenance faults)
  const maintTotal = Math.max(grandTotalFaults, randInt(45, 85));
  const fromFacilitiesDept = Math.round(maintTotal * 0.58);
  const fromOtherDepts = Math.max(0, maintTotal - fromFacilitiesDept);

  // 5. Services Summary (11 services with realistic counts & high completion rate)
  const nextServices = report.services.map((s) => {
    let rec = randInt(25, 90);
    let exec = rec - randInt(0, 3);

    switch (s.serviceId) {
      case 'svc_maintenance':
        rec = maintTotal;
        exec = Math.max(0, maintTotal - randInt(1, 4));
        break;
      case 'svc_logistics':
        rec = totalLogisticsRequests;
        exec = Math.max(0, totalLogisticsRequests - randInt(0, 2));
        break;
      case 'svc_hospitality':
        rec = randInt(65, 120);
        exec = rec;
        break;
      case 'svc_cleaning':
        rec = randInt(80, 140);
        exec = rec - randInt(0, 2);
        break;
      case 'svc_waste':
        rec = randInt(30, 55);
        exec = rec;
        break;
      case 'svc_assets':
        rec = randInt(22, 48);
        exec = rec - randInt(0, 2);
        break;
      case 'svc_petty_cash':
        rec = randInt(18, 38);
        exec = rec - randInt(0, 1);
        break;
      case 'svc_disbursement':
        rec = randInt(28, 54);
        exec = rec - randInt(0, 2);
        break;
      case 'svc_government':
        rec = randInt(14, 32);
        exec = rec - randInt(0, 1);
        break;
      case 'svc_access_permit':
        rec = randInt(40, 85);
        exec = rec - randInt(0, 2);
        break;
      default:
        break;
    }

    return {
      ...s,
      receivedCount: Math.max(0, rec),
      executedCount: Math.max(0, Math.min(rec, exec)),
    };
  });

  // 6. Contracts & Licenses with notes
  const nextContracts = report.contracts.map((c) => {
    const notesPool = CONTRACT_NOTES_SAMPLES[c.groupKey] || CONTRACT_NOTES_SAMPLES.service_contracts;
    if (c.groupKey === 'rental_contracts') {
      return {
        ...c,
        activeCount: randInt(5, 7),
        inactiveCount: 0,
        notes: pickRandom(notesPool),
      };
    }
    if (c.groupKey === 'commercial_licenses') {
      return {
        ...c,
        activeCount: randInt(5, 7),
        inactiveCount: 0,
        notes: pickRandom(notesPool),
      };
    }
    return {
      ...c,
      activeCount: randInt(6, 10),
      inactiveCount: randInt(0, 1),
      notes: pickRandom(notesPool),
    };
  });

  // 7. Safety & Hazard Observations with notes
  const nextSafety = report.safety.map((sf) => {
    const notesPool = SAFETY_NOTES_SAMPLES[sf.groupKey] || SAFETY_NOTES_SAMPLES.fire_extinguishers;
    if (sf.groupKey === 'fire_extinguishers') {
      return {
        ...sf,
        primaryCount: randInt(92, 128),
        secondaryCount: randInt(0, 2),
        notes: pickRandom(notesPool),
      };
    }
    return {
      ...sf,
      primaryCount: randInt(14, 26),
      secondaryCount: randInt(0, 2),
      notes: pickRandom(notesPool),
    };
  });

  // 8. Operational Tasks (select 5 rich tasks)
  const nextTasks = SAMPLE_TASKS_POOL.slice(0, 5).map((t, idx) => ({
    id: report.tasks[idx]?.id || `${report.id}_task_${idx + 1}`,
    rowOrder: idx + 1,
    topic: t.topic,
    taskName: t.taskName,
    status: t.status,
    completionPct: t.completionPct,
  }));

  // 9. Challenges & Recommendations (3 rich items)
  const nextChallenges = SAMPLE_CHALLENGES_POOL.map((ch, idx) => ({
    id: report.challenges[idx]?.id || `${report.id}_chal_${idx + 1}`,
    rowOrder: idx + 1,
    challengeText: ch.challengeText,
    updateText: ch.updateText,
    recommendationText: ch.recommendationText,
  }));

  // 10. Preparer & Approver metadata + valid dates
  const year = report.year || 2027;
  const month = String(report.month || 1).padStart(2, '0');
  const preparedDateIso = report.preparedAt || `${year}-${month}-26`;
  const approvedDateIso = report.approvedAt || `${year}-${month}-28`;

  const populated: MonthlyReportFull = {
    ...report,
    preparerName: report.preparerName?.trim() || 'معاذ المصعبي',
    preparerTitle: report.preparerTitle?.trim() || 'ضابط أول المرافق والأصول',
    preparedAt: preparedDateIso,
    approverName: report.approverName?.trim() || 'فيصل سويد السليماني',
    approverTitle: report.approverTitle?.trim() || 'رئيس قسم إدارة المرافق',
    approvedAt: approvedDateIso,
    services: nextServices,
    contracts: nextContracts,
    safety: nextSafety,
    maintenanceMatrix: nextMatrix,
    maintenanceCosts: nextCosts,
    maintenanceServices: {
      fromFacilitiesDept,
      fromOtherDepts,
    },
    logistics: nextLogistics,
    securityReception: nextSecurity,
    tasks: nextTasks,
    challenges: nextChallenges,
  };

  return syncReceptionServiceWithSecurity(populated);
}
