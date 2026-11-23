import type { NotificationContextKey } from './types.ts';
import { BRAND_IDENTITY } from '../config/brandIdentity.ts';
import heroPanorama from '../assets/images/hero_facility_panorama_1794728988564.jpg';
import engineerInspector from '../assets/images/engineer_tablet_inspector_1794730112530.jpg';
import facilityEngineering from '../assets/images/facility_engineering_ops_1794728989361.jpg';
import electricalTechnician from '../assets/images/technician_electrical_panel_1794730113102.jpg';
import blueprintHelmet from '../assets/images/footer_blueprint_helmet_1794733279930.jpg';
import safetyLogistics from '../assets/images/facility_safety_logistics_1794728989271.jpg';
import receptionHall from '../assets/images/facility_reception_hall_1794728988518.jpg';
import fireExtinguisherSafety from '../assets/images/fire_extinguisher_safety_1794730113921.jpg';
import towersDusk from '../assets/images/sidebar_towers_dusk_1794730112484.jpg';

export interface ContextualVisualAsset {
  src: string;
  alt: string;
  badgeText: string;
  badgeTextEn: string;
  objectPosition?: string;
  showSaaedLogo?: boolean;
}

export const OFFICIAL_SAAED_LOGO = BRAND_IDENTITY.logoPng;

const ASSET_MAP: Record<NotificationContextKey, ContextualVisualAsset> = {
  approval: {
    src: BRAND_IDENTITY.headerBackdropPng,
    alt: 'مبنى شركة ساهر وعلم دولة الإمارات للاعتماد التنفيذي',
    badgeText: 'الاعتماد الرسمي والتوثيق التنفيذي',
    badgeTextEn: 'Executive Approval & Attestation',
    objectPosition: 'left center',
    showSaaedLogo: true,
  },
  draft_created: {
    src: heroPanorama,
    alt: 'مرافق شركة ساهر — إنشاء تقرير شهري جديد',
    badgeText: 'إدارة التقارير الشهرية',
    badgeTextEn: 'Monthly Reporting Workspace',
    objectPosition: 'center center',
    showSaaedLogo: true,
  },
  saved: {
    src: engineerInspector,
    alt: 'مهندس مرافق يوثق بيانات التقرير',
    badgeText: 'حفظ وتحديث بيانات التقرير',
    badgeTextEn: 'Report Data Persistence',
    objectPosition: 'center 25%',
  },
  submitted: {
    src: heroPanorama,
    alt: 'إرسال التقرير للاعتماد الرسمي',
    badgeText: 'مسار الاعتماد المؤسسي',
    badgeTextEn: 'Approval Workflow',
    objectPosition: 'center center',
    showSaaedLogo: true,
  },
  returned: {
    src: facilityEngineering,
    alt: 'مراجعة العمليات وإعادة التقرير للتعديل',
    badgeText: 'مراجعة واستيفاء الملاحظات',
    badgeTextEn: 'Revision & Quality Control',
    objectPosition: 'center center',
  },
  revision: {
    src: engineerInspector,
    alt: 'فتح إصدار جديد للتصحيح',
    badgeText: 'إدارة الإصدارات الموثقة',
    badgeTextEn: 'Version Revision Control',
    objectPosition: 'center 25%',
  },
  maintenance: {
    src: electricalTechnician,
    alt: 'عمليات الصيانة الفنية والتشغيلية',
    badgeText: 'الصيانة الفنية والأصول',
    badgeTextEn: 'Technical Maintenance Ops',
    objectPosition: 'center 25%',
  },
  contracts: {
    src: blueprintHelmet,
    alt: 'العقود والمخططات والوثائق الهندسية',
    badgeText: 'العقود والرخص والمستندات',
    badgeTextEn: 'Contracts & Compliance',
    objectPosition: 'center center',
  },
  logistics: {
    src: safetyLogistics,
    alt: 'الدعم اللوجستي والمستودعات',
    badgeText: 'الدعم اللوجستي والتوريد',
    badgeTextEn: 'Logistics Support',
    objectPosition: 'center center',
  },
  security: {
    src: receptionHall,
    alt: 'خدمات الأمن والاستقبال المؤسسي',
    badgeText: 'خدمات الأمن والاستقبال',
    badgeTextEn: 'Security & Reception Services',
    objectPosition: 'center center',
  },
  safety: {
    src: fireExtinguisherSafety,
    alt: 'إجراءات السلامة الوقائية والطوارئ',
    badgeText: 'السلامة المهنية وإدارة المخاطر',
    badgeTextEn: 'HSE & Risk Management',
    objectPosition: 'center center',
  },
  print: {
    src: blueprintHelmet,
    alt: 'تجهيز النسخة الرسمية للطباعة',
    badgeText: 'المعاينة والطباعة الرسمية',
    badgeTextEn: 'Executive Print Preview',
    objectPosition: 'center center',
    showSaaedLogo: true,
  },
  excel: {
    src: blueprintHelmet,
    alt: 'تصدير بيانات التقرير إلى Excel',
    badgeText: 'تصدير التقارير المعتمدة',
    badgeTextEn: 'Excel Workbook Export',
    objectPosition: 'center center',
  },
  archive: {
    src: towersDusk,
    alt: 'الأرشيف المؤسسي للتقارير المعتمدة',
    badgeText: 'الأرشيف المؤسسي الدائم',
    badgeTextEn: 'Official Approved Archive',
    objectPosition: 'center center',
    showSaaedLogo: true,
  },
  auth: {
    src: towersDusk,
    alt: 'نظام المصادقة والصلاحيات المؤسسية',
    badgeText: 'الهوية والصلاحيات المؤسسية',
    badgeTextEn: 'Enterprise Access Control',
    objectPosition: 'center center',
    showSaaedLogo: true,
  },
  admin: {
    src: towersDusk,
    alt: 'إعدادات النظام ومعايير الأداء',
    badgeText: 'إدارة النظام والحوكمة',
    badgeTextEn: 'System Administration',
    objectPosition: 'center center',
  },
  analytics: {
    src: towersDusk,
    alt: 'التحليلات التنفيذية ومؤشرات الأداء',
    badgeText: 'ذكاء الأعمال وتحليل الأداء',
    badgeTextEn: 'Executive BI Analytics',
    objectPosition: 'center center',
  },
  delete: {
    src: fireExtinguisherSafety,
    alt: 'تأكيد حذف السجل من التقرير',
    badgeText: 'إجراء حذف يتطلب التأكيد',
    badgeTextEn: 'Destructive Action Confirmation',
    objectPosition: 'center center',
  },
  unsaved: {
    src: engineerInspector,
    alt: 'تنبيه حفظ التعديلات الجارية',
    badgeText: 'حماية التعديلات الجارية',
    badgeTextEn: 'Unsaved Changes Protection',
    objectPosition: 'center 25%',
  },
  validation: {
    src: fireExtinguisherSafety,
    alt: 'التحقق من اكتمال وصحة البيانات',
    badgeText: 'تدقيق جودة البيانات',
    badgeTextEn: 'Data Validation Alert',
    objectPosition: 'center center',
  },
  network: {
    src: facilityEngineering,
    alt: 'حالة الاتصال بالخادم وقاعدة البيانات',
    badgeText: 'اتصال النظام والخادم',
    badgeTextEn: 'System Connectivity',
    objectPosition: 'center center',
  },
};

export function getNotificationVisualAsset(context: NotificationContextKey = 'approval'): ContextualVisualAsset {
  return ASSET_MAP[context] || ASSET_MAP.approval;
}
