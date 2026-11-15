import React from 'react';
import {
  BadgeCheck,
  Briefcase,
  Building,
  Coffee,
  Coins,
  FileSpreadsheet,
  KeyRound,
  Package,
  Recycle,
  Sparkles,
  Truck,
  Wrench,
} from 'lucide-react';

export interface ServiceVisual {
  color: string;
  shortLabel: string;
  renderIcon: (className?: string) => React.ReactNode;
}

interface DefaultVisualConfig extends ServiceVisual {
  defaultNameAr: string;
}

const SERVICE_VISUALS: Record<string, DefaultVisualConfig> = {
  svc_reception: {
    color: '#1D5EA8',
    shortLabel: 'الاستقبال',
    defaultNameAr: 'خدمات الاستقبال',
    renderIcon: (cls = 'w-4 h-4') => <Briefcase className={cls} />,
  },
  svc_hospitality: {
    color: '#0D9488',
    shortLabel: 'الضيافة',
    defaultNameAr: 'طلبات الضيافة',
    renderIcon: (cls = 'w-4 h-4') => <Coffee className={cls} />,
  },
  svc_maintenance: {
    color: '#1E40AF',
    shortLabel: 'الصيانة',
    defaultNameAr: 'طلبات الصيانة',
    renderIcon: (cls = 'w-4 h-4') => <Wrench className={cls} />,
  },
  svc_logistics: {
    color: '#F59E0B',
    shortLabel: 'الدعم اللوجستي',
    defaultNameAr: 'طلبات الدعم اللوجستي',
    renderIcon: (cls = 'w-4 h-4') => <Truck className={cls} />,
  },
  svc_cleaning: {
    color: '#059669',
    shortLabel: 'النظافة',
    defaultNameAr: 'طلبات النظافة',
    renderIcon: (cls = 'w-4 h-4') => <Sparkles className={cls} />,
  },
  svc_waste: {
    color: '#16A34A',
    shortLabel: 'إدارة النفايات',
    defaultNameAr: 'طلبات إدارة النفايات',
    renderIcon: (cls = 'w-4 h-4') => <Recycle className={cls} />,
  },
  svc_assets: {
    color: '#8B5CF6',
    shortLabel: 'حركات الأصول',
    defaultNameAr: 'طلبات حركات الأصول',
    renderIcon: (cls = 'w-4 h-4') => <Package className={cls} />,
  },
  svc_petty_cash: {
    color: '#C8A85D',
    shortLabel: 'النثرية',
    defaultNameAr: 'النثرية Petty Cash',
    renderIcon: (cls = 'w-4 h-4') => <Coins className={cls} />,
  },
  svc_disbursement: {
    color: '#D97706',
    shortLabel: 'صرف',
    defaultNameAr: 'طلبات صرف',
    renderIcon: (cls = 'w-4 h-4') => <FileSpreadsheet className={cls} />,
  },
  svc_government: {
    color: '#0284C7',
    shortLabel: 'خدمات حكومية',
    defaultNameAr: 'طلبات وخدمات حكومية',
    renderIcon: (cls = 'w-4 h-4') => <Building className={cls} />,
  },
  svc_access_permit: {
    color: '#DB2777',
    shortLabel: 'تصريح / إلغاء دخول',
    defaultNameAr: 'طلبات تصريح أو إلغاء دخول',
    renderIcon: (cls = 'w-4 h-4') => <KeyRound className={cls} />,
  },
};

const CUSTOM_SERVICE_COLORS = [
  '#2563EB',
  '#0891B2',
  '#059669',
  '#7C3AED',
  '#E11D48',
  '#EA580C',
  '#4F46E5',
  '#0D9488',
  '#B45309',
  '#0369A1',
];

function hashServiceKey(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function getServiceVisual(
  serviceId: string,
  customNameAr?: string,
  fallbackIndex = 0
): ServiceVisual {
  const known = SERVICE_VISUALS[serviceId];
  if (known) {
    const trimmed = (customNameAr || '').trim();
    const useCustomLabel = trimmed.length > 0 && trimmed !== known.defaultNameAr;
    return {
      color: known.color,
      shortLabel: useCustomLabel ? trimmed : known.shortLabel,
      renderIcon: known.renderIcon,
    };
  }

  const colorIdx = hashServiceKey(serviceId) % CUSTOM_SERVICE_COLORS.length;
  return {
    color: CUSTOM_SERVICE_COLORS[colorIdx],
    shortLabel: (customNameAr || '').trim() || 'خدمة',
    renderIcon: (cls = 'w-4 h-4') => <BadgeCheck className={cls} />,
  };
}
