import React from 'react';
import {
  Calendar,
  FileText,
  LogIn,
  LogOut,
  Menu,
  Plus,
  Settings,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import type { AuthUser, MonthlyReportFull, ReportListSummary } from '../types/report.ts';
import { ROLE_LABELS_AR, STATUS_LABELS_AR, USER_ROLES } from '../types/report.ts';
import { formatDateWestern, getMonthNameAr } from '../utils/calculations.ts';
import { SaaedExecutiveHeader } from './SaaedExecutiveHeader.tsx';

export type AppTab = 'report' | 'analytics' | 'archive';

interface ExecutiveHeroHeaderProps {
  activeTab: AppTab;
  onSelectTab: (tab: AppTab) => void;
  user: AuthUser | null;
  activeReport: MonthlyReportFull | null;
  reportsList: ReportListSummary[];
  onSelectReport: (id: string) => void;
  onOpenNewReport: () => void;
  onOpenAuthModal: () => void;
  onLogout: () => void;
  onOpenAdminSettings: () => void;
  approvedCount: number;
  onOpenMobileMenu: () => void;
}

export const ExecutiveHeroHeader: React.FC<ExecutiveHeroHeaderProps> = ({
  user,
  activeReport,
  reportsList,
  onSelectReport,
  onOpenNewReport,
  onOpenAuthModal,
  onLogout,
  onOpenAdminSettings,
  onOpenMobileMenu,
}) => {
  const canCreate = user && (user.role === USER_ROLES.ADMIN || user.role === USER_ROLES.PREPARER);

  return (
    <div className="no-print">
      {/* Slim Corporate Utility Strip matching MASTER_VISUAL_REFERENCE */}
      <div
        dir="rtl"
        className="bg-gradient-to-r from-[#041226] via-[#071D3A] to-[#041226] text-slate-200 border-b border-[#C8A85D]/40 px-3 sm:px-5 h-10 flex items-center justify-between gap-3 text-xs"
      >
        {/* Visual RIGHT (RTL Start): Mobile menu + User badge + Gold '+ تقرير جديد' + Month/Year selector */}
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={onOpenMobileMenu}
            className="md:hidden p-1.5 rounded-md bg-white/10 hover:bg-white/20 text-white cursor-pointer"
            aria-label="فتح القائمة الجانبية"
          >
            <Menu className="w-4 h-4" />
          </button>

          {user ? (
            <button
              type="button"
              onClick={onOpenAuthModal}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/10 hover:bg-white/15 border border-white/15 text-[11px] font-bold text-white transition-colors whitespace-nowrap cursor-pointer"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-[#DFC076]" />
              <span className="max-w-[130px] truncate">{user.fullName}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenAuthModal}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/10 hover:bg-white/20 border border-white/15 text-[11px] font-bold text-white transition-colors whitespace-nowrap cursor-pointer"
            >
              <UserCheck className="w-3.5 h-3.5 text-[#DFC076]" />
              <span>{activeReport?.preparerName || 'خالد الهاشمي'}</span>
            </button>
          )}

          {canCreate !== false && (
            <button
              type="button"
              onClick={onOpenNewReport}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-gradient-to-b from-[#E5C878] to-[#C49A42] hover:from-[#ebd28b] hover:to-[#cfa54c] text-[#071C3A] text-[11px] font-extrabold shadow-2xs transition-colors whitespace-nowrap cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>تقرير جديد</span>
            </button>
          )}

          {/* Quick Period Switcher */}
          {reportsList.length > 0 && (
            <div className="hidden sm:flex items-center gap-1.5 bg-white/10 border border-white/15 rounded-md px-2 py-0.5">
              <Calendar className="w-3.5 h-3.5 text-[#DFC076]" />
              <select
                aria-label="اختيار فترة التقرير"
                value={activeReport?.id || ''}
                onChange={(e) => onSelectReport(e.target.value)}
                dir="ltr"
                className="bg-transparent text-white text-[11px] font-mono font-bold focus:outline-none cursor-pointer tabular-nums"
              >
                {reportsList.map((r) => (
                  <option key={r.id} value={r.id} className="text-[#0B2341] bg-white">
                    {String(r.month).padStart(2, '0')} - {r.year} ({getMonthNameAr(r.month)})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Center Title: SAAED Facilities Management Executive Reporting System */}
        <div className="hidden lg:flex items-center justify-center min-w-0">
          <span
            dir="ltr"
            className="text-[11.5px] font-semibold tracking-wide text-slate-200/95 truncate"
          >
            SAAED Facilities Management Executive Reporting System
          </span>
        </div>

        {/* Visual LEFT (RTL End): System badges, Settings & Auth actions */}
        <div className="flex items-center gap-2 shrink-0">
          {user?.role === USER_ROLES.ADMIN && (
            <button
              type="button"
              onClick={onOpenAdminSettings}
              title="إعدادات النظام والصلاحيات"
              className="flex items-center gap-1 px-2 py-1 rounded-md bg-white/10 hover:bg-white/20 text-[#DFC076] text-[11px] font-semibold transition-colors cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">الإعدادات</span>
            </button>
          )}

          {user ? (
            <div className="flex items-center gap-1.5">
              <span className="hidden md:inline-block text-[10.5px] font-semibold text-[#DFC076] bg-white/5 px-2 py-0.5 rounded border border-[#C8A85D]/30">
                {ROLE_LABELS_AR[user.role]}
              </span>
              <button
                type="button"
                onClick={onLogout}
                title="تسجيل الخروج"
                className="p-1.5 rounded-md text-slate-300 hover:text-white hover:bg-red-500/20 transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onOpenAuthModal}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#1769AA] hover:bg-[#1e7bc7] text-white text-[11px] font-bold transition-colors whitespace-nowrap cursor-pointer"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>تسجيل الدخول</span>
            </button>
          )}
        </div>
      </div>

      {/* Layered HTML + High-Res Corporate Executive Header */}
      <SaaedExecutiveHeader className="shadow-xs" />
    </div>
  );
};

/* Official Silver-Blue Info Strip displayed directly under the Panoramic Header on Report Tab */
export const ReportSilverInfoStrip: React.FC<{
  activeReport: MonthlyReportFull;
  reportsList: ReportListSummary[];
  onSelectReport: (id: string) => void;
  onOpenNewReport: () => void;
  canCreate: boolean;
}> = ({ activeReport, reportsList, onSelectReport, onOpenNewReport, canCreate }) => {
  const prepDateStr = formatDateWestern(activeReport.preparedAt || activeReport.updatedAt, '—');

  const statusTone =
    activeReport.status === 'approved' || activeReport.status === 'archived'
      ? 'text-[#069B74] bg-emerald-50 border-emerald-200'
      : activeReport.status === 'pending_approval' || activeReport.status === 'under_review'
        ? 'text-[#9A7422] bg-amber-50 border-amber-200'
        : 'text-[#0B2341] bg-white border-slate-300';

  return (
    <div className="no-print bg-gradient-to-b from-[#FFFFFF] via-[#F5F8FC] to-[#E8EFF7] border border-[#A3C0DE] rounded-xl shadow-xs px-3 sm:px-4 py-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 lg:gap-0 lg:divide-x lg:divide-x-reverse lg:divide-[#A3C0DE]/70 text-xs">
        {/* 1. Report Number */}
        <div className="flex items-center gap-2 lg:px-3">
          <FileText className="w-4 h-4 text-[#C8A85D] shrink-0" />
          <span className="text-slate-600 font-semibold whitespace-nowrap">رقم التقرير:</span>
          <span className="font-mono font-extrabold text-[#0B2341] tabular-nums truncate" dir="ltr">
            {activeReport.reportNumber}
          </span>
          <span
            dir="ltr"
            className="text-[10px] font-mono font-bold text-[#1769AA] bg-white px-1.5 py-0.5 rounded border border-slate-200 tabular-nums"
          >
            v{activeReport.currentVersion}
          </span>
        </div>

        {/* 2. Month & Year Switcher */}
        <div className="flex items-center gap-2 lg:px-3">
          <Calendar className="w-4 h-4 text-[#C8A85D] shrink-0" />
          <span className="text-slate-600 font-semibold whitespace-nowrap">الشهر:</span>
          <select
            aria-label="تبديل الشهر والسنة"
            value={activeReport.id}
            onChange={(e) => onSelectReport(e.target.value)}
            className="flex-1 min-w-0 bg-white/80 border border-slate-300 rounded-md px-2 py-0.5 font-extrabold text-[#0B2341] text-xs focus:border-[#1769AA] focus:outline-none cursor-pointer"
          >
            {reportsList.map((r) => (
              <option key={r.id} value={r.id}>
                {getMonthNameAr(r.month)} {r.year} ({STATUS_LABELS_AR[r.status]})
              </option>
            ))}
          </select>
          {canCreate && (
            <button
              type="button"
              onClick={onOpenNewReport}
              title="إنشاء تقرير شهر جديد"
              className="p-1 rounded-md bg-[#0B2341] hover:bg-[#1769AA] text-[#DFC076] transition-colors cursor-pointer shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* 3. Preparation Date */}
        <div className="flex items-center gap-2 lg:px-3">
          <Calendar className="w-4 h-4 text-[#1769AA] shrink-0" />
          <span className="text-slate-600 font-semibold whitespace-nowrap">تاريخ الإعداد:</span>
          <span className="font-mono font-bold text-[#0B2341] tabular-nums" dir="ltr">
            {prepDateStr || '—'}
          </span>
        </div>

        {/* 4. Preparer */}
        <div className="flex items-center gap-2 lg:px-3">
          <UserCheck className="w-4 h-4 text-[#C8A85D] shrink-0" />
          <span className="text-slate-600 font-semibold whitespace-nowrap">معد التقرير:</span>
          <span className="font-extrabold text-[#0B2341] truncate">
            {activeReport.preparerName || 'غير محدد'}
          </span>
        </div>

        {/* 5. Status */}
        <div className="flex items-center gap-2 lg:px-3">
          <ShieldCheck className="w-4 h-4 text-[#1769AA] shrink-0" />
          <span className="text-slate-600 font-semibold whitespace-nowrap">حالة التقرير:</span>
          <span className={`px-2 py-0.5 rounded-md border font-extrabold text-[11px] whitespace-nowrap ${statusTone}`}>
            {STATUS_LABELS_AR[activeReport.status]}
          </span>
        </div>
      </div>
    </div>
  );
};
