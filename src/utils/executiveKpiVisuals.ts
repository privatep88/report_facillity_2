import kpiTotalRequestsImg from '../assets/images/kpi_total_requests_desk_1794851561763.jpg';
import kpiTotalServicesImg from '../assets/images/kpi_total_services_systems_1794851563916.jpg';
import kpiCompletionRateImg from '../assets/images/kpi_completion_rate_check_1794851566333.jpg';
import svcHospitalityImg from '../assets/images/svc_top_hospitality_lounge_1794851569406.jpg';
import svcCleaningImg from '../assets/images/svc_top_cleaning_sanitation_1794851569538.jpg';
import svcSecurityImg from '../assets/images/svc_top_security_surveillance_1794851570128.jpg';
import svcGovernmentImg from '../assets/images/svc_top_government_docs_1794851573389.jpg';
import svcReceptionImg from '../assets/images/facility_reception_hall_1794728988518.jpg';
import svcMaintenanceImg from '../assets/images/analytics_maintenance_ops_1794843950412.jpg';
import svcLogisticsImg from '../assets/images/facility_safety_logistics_1794728989271.jpg';
import svcAssetsImg from '../assets/images/analytics_services_hub_1794843952722.jpg';
import svcFinanceImg from '../assets/images/analytics_finance_desk_1794843953051.jpg';
import svcWasteImg from '../assets/images/archive_card_digital_1794843147818.jpg';
import svcDefaultTopImg from '../assets/images/analytics_boardroom_strategy_1794843952613.jpg';

export interface ExecutiveKpiImageAsset {
  src: string;
  altAr: string;
  filePrefix: string;
}

export const EXECUTIVE_KPI_IMAGES = {
  totalRequests: {
    src: kpiTotalRequestsImg,
    altAr: 'إدارة الطلبات والتقارير التشغيلية والمستندات الرقمية',
    filePrefix: 'kpi_total_requests_desk',
  },
  totalServices: {
    src: kpiTotalServicesImg,
    altAr: 'أنظمة المباني الذكية وتنوع خدمات إدارة المرافق',
    filePrefix: 'kpi_total_services_systems',
  },
  monthlyCompletion: {
    src: kpiCompletionRateImg,
    altAr: 'استكمال أعمال الصيانة والفحص الهندسي بنجاح',
    filePrefix: 'kpi_completion_rate_check',
  },
} as const;

/**
 * Dynamic contextual image map keyed by official `serviceId`.
 * Ensures the Top Service KPI card automatically updates its visual header
 * whenever the highest-demand service changes.
 */
export const TOP_SERVICE_IMAGE_BY_ID: Record<string, ExecutiveKpiImageAsset> = {
  svc_reception: {
    src: svcReceptionImg,
    altAr: 'خدمات الاستقبال — منطقة استقبال مؤسسية حديثة',
    filePrefix: 'facility_reception_hall',
  },
  svc_hospitality: {
    src: svcHospitalityImg,
    altAr: 'طلبات الضيافة — تجهيزات الضيافة المؤسسية وقاعات الاجتماعات',
    filePrefix: 'svc_top_hospitality_lounge',
  },
  svc_maintenance: {
    src: svcMaintenanceImg,
    altAr: 'طلبات الصيانة — أعمال الصيانة الهندسية والمعدات الفنية',
    filePrefix: 'analytics_maintenance_ops',
  },
  svc_logistics: {
    src: svcLogisticsImg,
    altAr: 'طلبات الدعم اللوجستي — خدمات الشحن والمستودعات والإمداد',
    filePrefix: 'facility_safety_logistics',
  },
  svc_cleaning: {
    src: svcCleaningImg,
    altAr: 'طلبات النظافة — مرافق مؤسسية نظيفة وتجهيزات العناية بالمباني',
    filePrefix: 'svc_top_cleaning_sanitation',
  },
  svc_waste: {
    src: svcWasteImg,
    altAr: 'إدارة النفايات — خدمات الاستدامة وإدارة النفايات المؤسسية',
    filePrefix: 'archive_card_digital',
  },
  svc_assets: {
    src: svcAssetsImg,
    altAr: 'طلبات حركات الأصول — إدارة الممتلكات والمستودعات المؤسسية',
    filePrefix: 'analytics_services_hub',
  },
  svc_petty_cash: {
    src: svcFinanceImg,
    altAr: 'النثرية — الإدارة المالية والمصروفات النثرية التشغيلية',
    filePrefix: 'analytics_finance_desk',
  },
  svc_disbursement: {
    src: svcFinanceImg,
    altAr: 'طلبات الصرف — المستندات المالية وأوامر الصرف المعتمدة',
    filePrefix: 'analytics_finance_desk',
  },
  svc_government: {
    src: svcGovernmentImg,
    altAr: 'طلبات وخدمات حكومية — المعاملات الرسمية والتراخيص المؤسسية',
    filePrefix: 'svc_top_government_docs',
  },
  svc_access_permit: {
    src: svcSecurityImg,
    altAr: 'تصاريح الدخول والأمن — أنظمة الأمن والتحكم بالدخول والمراقبة',
    filePrefix: 'svc_top_security_surveillance',
  },
  svc_security: {
    src: svcSecurityImg,
    altAr: 'خدمات الأمن والمراقبة — بوابات التحكم الأمني وأنظمة المراقبة',
    filePrefix: 'svc_top_security_surveillance',
  },
};

export const DEFAULT_TOP_SERVICE_IMAGE: ExecutiveKpiImageAsset = {
  src: svcDefaultTopImg,
  altAr: 'أعلى خدمة طلباً — مؤشرات الأداء التشغيلي لخدمات المرافق',
  filePrefix: 'analytics_boardroom_strategy',
};

/**
 * Resolves the contextual image for the Top Service KPI card.
 * Prioritizes exact `serviceId` lookup, with semantic fallback for custom user-added services.
 */
export function resolveTopServiceKpiImage(
  topService?: { serviceId?: string; nameAr?: string; nameEn?: string } | null
): ExecutiveKpiImageAsset {
  if (!topService) {
    return DEFAULT_TOP_SERVICE_IMAGE;
  }

  const id = (topService.serviceId || '').trim();
  if (id && TOP_SERVICE_IMAGE_BY_ID[id]) {
    return TOP_SERVICE_IMAGE_BY_ID[id];
  }

  // Fallback keyword matching only for custom user-created service IDs
  const text = `${topService.nameAr || ''} ${topService.nameEn || ''}`.toLowerCase();
  if (text.includes('استقبال') || text.includes('reception')) {
    return TOP_SERVICE_IMAGE_BY_ID.svc_reception;
  }
  if (text.includes('ضياف') || text.includes('hospitality') || text.includes('coffee')) {
    return TOP_SERVICE_IMAGE_BY_ID.svc_hospitality;
  }
  if (text.includes('صيان') || text.includes('maintenance') || text.includes('فني')) {
    return TOP_SERVICE_IMAGE_BY_ID.svc_maintenance;
  }
  if (text.includes('لوجست') || text.includes('logistics') || text.includes('شحن') || text.includes('نقل')) {
    return TOP_SERVICE_IMAGE_BY_ID.svc_logistics;
  }
  if (text.includes('نظاف') || text.includes('clean')) {
    return TOP_SERVICE_IMAGE_BY_ID.svc_cleaning;
  }
  if (text.includes('نفاي') || text.includes('waste') || text.includes('تدوير')) {
    return TOP_SERVICE_IMAGE_BY_ID.svc_waste;
  }
  if (text.includes('أمن') || text.includes('تصريح') || text.includes('دخول') || text.includes('security') || text.includes('access')) {
    return TOP_SERVICE_IMAGE_BY_ID.svc_access_permit;
  }
  if (text.includes('حكوم') || text.includes('government') || text.includes('رخص')) {
    return TOP_SERVICE_IMAGE_BY_ID.svc_government;
  }
  if (text.includes('أصول') || text.includes('asset') || text.includes('مستودع')) {
    return TOP_SERVICE_IMAGE_BY_ID.svc_assets;
  }
  if (text.includes('نثري') || text.includes('صرف') || text.includes('مالي') || text.includes('cash') || text.includes('finance')) {
    return TOP_SERVICE_IMAGE_BY_ID.svc_petty_cash;
  }

  return DEFAULT_TOP_SERVICE_IMAGE;
}
