import React from 'react';
import { BarChart3, FileCheck2, FileEdit, Home, X } from 'lucide-react';
import type { AppTab } from './ExecutiveHeroHeader.tsx';
import { formatNumber } from '../utils/calculations.ts';
import sidebarTowersImg from '../assets/images/sidebar_towers_dusk_1794730112484.jpg';
import tabMonthlyReportImg from '../assets/images/sidebar_tab_monthly_report_1794852273403.jpg';
import tabReportDraftsImg from '../assets/images/sidebar_tab_report_drafts_1794852276511.jpg';
import tabApprovedReportsImg from '../assets/images/sidebar_tab_approved_reports_1794852277780.jpg';
import tabReportsAnalysisImg from '../assets/images/sidebar_tab_reports_analysis_1794852277809.jpg';

interface ExecutiveSidebarProps {
  activeTab: AppTab;
  onSelectTab: (tab: AppTab) => void;
  approvedCount: number;
  draftCount: number;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export const ExecutiveSidebar: React.FC<ExecutiveSidebarProps> = ({
  activeTab,
  onSelectTab,
  approvedCount,
  draftCount,
  mobileOpen,
  onCloseMobile,
}) => {
  const navItems: Array<{
    key: AppTab;
    labelAr: string;
    labelEn: string;
    icon: React.ReactNode;
    imageSrc: string;
    imageAlt: string;
    badge?: number;
  }> = [
    {
      key: 'report',
      labelAr: 'التقرير الشهري',
      labelEn: 'Monthly Report',
      icon: <Home className="w-4 h-4" />,
      imageSrc: tabMonthlyReportImg,
      imageAlt: 'التقرير الشهري لقسم إدارة المرافق',
    },
    {
      key: 'drafts',
      labelAr: 'مسودة التقرير',
      labelEn: 'Report Drafts',
      icon: <FileEdit className="w-4 h-4" />,
      imageSrc: tabReportDraftsImg,
      imageAlt: 'مسودات التقارير قيد الإعداد والمراجعة',
      badge: draftCount,
    },
    {
      key: 'archive',
      labelAr: 'التقارير المعتمدة',
      labelEn: 'Approved Reports',
      icon: <FileCheck2 className="w-4 h-4" />,
      imageSrc: tabApprovedReportsImg,
      imageAlt: 'الأرشيف الرسمي للتقارير المعتمدة',
      badge: approvedCount,
    },
    {
      key: 'analytics',
      labelAr: 'تحليل التقارير',
      labelEn: 'Reports Analysis',
      icon: <BarChart3 className="w-4 h-4" />,
      imageSrc: tabReportsAnalysisImg,
      imageAlt: 'منصة تحليل التقارير وذكاء الأعمال التنفيذي',
    },
  ];

  const handleNavClick = (tab: AppTab) => {
    onSelectTab(tab);
    onCloseMobile();
  };

  /* Visual-Right Sidebar (#052C52 -> #022848 -> #012E5E) */
  const sidebarBody = (
    <div
      dir="rtl"
      className="relative h-full flex flex-col justify-between bg-gradient-to-b from-[#052C52] via-[#022848] to-[#012E5E] text-white border-l-2 border-[#C99E4A]/80"
    >
      {/* Sticky Top Tabs & Close button on Mobile */}
      <div className="md:sticky md:top-0 z-10 pt-3 pb-2.5 bg-gradient-to-b from-[#052C52] to-[#022848]">
        <div className="px-2.5 mb-2.5 flex items-center justify-between md:hidden">
          <span className="text-[11px] font-bold text-[#DFC076]">القائمة الرئيسية</span>
          <button
            type="button"
            onClick={onCloseMobile}
            className="p-1.5 rounded-lg bg-white/10 text-white hover:bg-white/20 cursor-pointer"
            aria-label="إغلاق القائمة"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Main Illustrated Navigation Tabs */}
        <nav
          aria-label="التنقل الرئيسي بين التبويبات"
          className="divide-y divide-[#C99E4A]/30 border-y border-[#C99E4A]/35"
        >
          {navItems.map((item) => {
            const active = activeTab === item.key;
            return (
              <button
                key={item.key}
                type="button"
                aria-current={active ? 'page' : undefined}
                onClick={() => handleNavClick(item.key)}
                className={`group relative w-full min-h-[112px] px-2 py-2.5 overflow-hidden flex flex-col items-center justify-center text-center gap-1 transition-colors duration-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#DFC076] ${
                  active
                    ? 'text-[#012044] shadow-[inset_0_1px_0_rgba(255,248,220,0.65)]'
                    : 'text-white hover:text-white'
                }`}
              >
                {/* Layer 1: Contextual Corporate Background Image */}
                <div
                  aria-hidden="true"
                  className="absolute inset-0 bg-[#032446] pointer-events-none overflow-hidden"
                >
                  <img
                    src={item.imageSrc}
                    alt={item.imageAlt}
                    loading="eager"
                    decoding="async"
                    referrerPolicy="no-referrer"
                    className={`w-full h-full object-cover object-center transition-opacity duration-300 ${
                      active
                        ? 'opacity-40 mix-blend-luminosity'
                        : 'opacity-45 group-hover:opacity-65'
                    }`}
                  />
                </div>

                {/* Layer 2: Professional Navy / Gold Gradient Overlay */}
                <div
                  aria-hidden="true"
                  className={`absolute inset-0 pointer-events-none transition-colors duration-300 ${
                    active
                      ? 'bg-gradient-to-b from-[#E3C474]/82 via-[#CCA34B]/88 to-[#B38834]/95'
                      : 'bg-gradient-to-b from-[#041E3C]/55 via-[#032548]/78 to-[#011C38]/92 group-hover:from-[#041E3C]/38 group-hover:via-[#032548]/68 group-hover:to-[#011C38]/86'
                  }`}
                />

                {/* Layer 3: Active Tab Visual Indicator Bar & Subtle Gold Frame */}
                {active ? (
                  <>
                    <span
                      aria-hidden="true"
                      className="absolute inset-y-0 right-0 w-1.5 bg-[#012044] shadow-[0_0_8px_rgba(1,32,68,0.45)] pointer-events-none"
                    />
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-0 top-0 h-[1.5px] bg-[#FFF3C4]/80 pointer-events-none"
                    />
                  </>
                ) : (
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-0 right-0 w-1 bg-transparent group-hover:bg-[#DFC076]/75 transition-colors duration-200 pointer-events-none"
                  />
                )}

                {/* Layer 4: Original Icon in Crisp Protected Emblem */}
                <div
                  className={`relative z-10 w-8 h-8 rounded-lg flex items-center justify-center transition-colors duration-200 shrink-0 ${
                    active
                      ? 'bg-[#012044]/15 border border-[#012044]/25 text-[#012044] shadow-2xs'
                      : 'bg-[#031D3B]/75 border border-[#DFC076]/35 text-[#DFC076] group-hover:bg-[#031D3B]/90 group-hover:border-[#DFC076]/65 group-hover:text-white shadow-2xs'
                  }`}
                >
                  {item.icon}
                </div>

                {/* Layer 5: Real Selectable Arabic Title */}
                <span
                  className={`relative z-10 select-text text-xs font-extrabold leading-tight mt-0.5 ${
                    active
                      ? 'text-[#012044]'
                      : 'text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]'
                  }`}
                >
                  {item.labelAr}
                </span>

                {/* Layer 6: Real Selectable English Title */}
                <span
                  dir="ltr"
                  className={`relative z-10 select-text text-[9.5px] font-semibold leading-tight ${
                    active
                      ? 'text-[#012044]/90'
                      : 'text-slate-200/95 drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]'
                  }`}
                >
                  {item.labelEn}
                </span>

                {/* Layer 7: Dynamic Counter Badge (Western Numerals 0-9) */}
                {typeof item.badge === 'number' && (
                  <span
                    dir="ltr"
                    className={`relative z-10 select-text mt-0.5 px-2 py-0.5 rounded-full text-[9.5px] font-extrabold tabular-nums transition-colors ${
                      active
                        ? 'bg-[#012E5E] text-[#DFC076] border border-[#012044]/30 shadow-2xs'
                        : 'bg-[#021830]/85 text-[#DFC076] border border-[#DFC076]/40 group-hover:border-[#DFC076]/75'
                    }`}
                  >
                    {formatNumber(item.badge)}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Dusk Towers Visual Blended into Deep Navy */}
      <div className="relative mt-auto h-52 sm:h-60 w-full pointer-events-none overflow-hidden">
        <img
          src={sidebarTowersImg}
          alt="أبراج أبوظبي الحديثة"
          className="w-full h-full object-cover object-bottom opacity-90"
          referrerPolicy="no-referrer"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-b from-[#012E5E] via-[#012E5E]/50 to-transparent"
        />
        {/* Sweeping Gold Architectural Curve */}
        <div
          aria-hidden="true"
          className="absolute bottom-0 inset-x-0 h-1.5 bg-gradient-to-l from-[#DFC076] via-[#C99E4A] to-transparent"
        />
      </div>
    </div>
  );

  return (
    <>
      {/* Persistent Desktop/Tablet VISUAL-RIGHT Sidebar */}
      <aside className="no-print hidden md:block md:w-[106px] lg:w-[116px] xl:w-[124px] shrink-0">
        {sidebarBody}
      </aside>

      {/* Mobile Drawer Sidebar — explicit dir="rtl" anchors drawer on visual RIGHT */}
      {mobileOpen && (
        <div dir="rtl" className="no-print fixed inset-0 z-50 md:hidden flex">
          <div className="w-56 max-w-[78vw] h-full shadow-2xl">{sidebarBody}</div>
          <button
            type="button"
            aria-label="إغلاق الخلفية"
            onClick={onCloseMobile}
            className="flex-1 bg-slate-950/60 backdrop-blur-xs"
          />
        </div>
      )}
    </>
  );
};
