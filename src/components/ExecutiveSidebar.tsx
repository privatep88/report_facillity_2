import React from 'react';
import { BarChart3, FileCheck2, Home, X } from 'lucide-react';
import type { AppTab } from './ExecutiveHeroHeader.tsx';
import { formatNumber } from '../utils/calculations.ts';
import sidebarTowersImg from '../assets/images/sidebar_towers_dusk_1794730112484.jpg';

interface ExecutiveSidebarProps {
  activeTab: AppTab;
  onSelectTab: (tab: AppTab) => void;
  approvedCount: number;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export const ExecutiveSidebar: React.FC<ExecutiveSidebarProps> = ({
  activeTab,
  onSelectTab,
  approvedCount,
  mobileOpen,
  onCloseMobile,
}) => {
  const navItems: Array<{
    key: AppTab;
    labelAr: string;
    labelEn: string;
    icon: React.ReactNode;
    badge?: number;
  }> = [
    {
      key: 'report',
      labelAr: 'التقرير الشهري',
      labelEn: 'Monthly Report',
      icon: <Home className="w-5 h-5" />,
    },
    {
      key: 'analytics',
      labelAr: 'تحليل التقارير',
      labelEn: 'Reports Analysis',
      icon: <BarChart3 className="w-5 h-5" />,
    },
    {
      key: 'archive',
      labelAr: 'التقارير المعتمدة',
      labelEn: 'Approved Reports',
      icon: <FileCheck2 className="w-5 h-5" />,
      badge: approvedCount,
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
      className="relative h-full flex flex-col justify-between bg-gradient-to-b from-[#052C52] via-[#022848] to-[#012E5E] text-white border-l-2 border-[#C99E4A]/80 select-none"
    >
      {/* Sticky Top Tabs & Close button on Mobile */}
      <div className="md:sticky md:top-0 z-10 pt-4 pb-3 bg-gradient-to-b from-[#052C52] to-[#022848]">
        <div className="px-2 mb-3 flex items-center justify-between md:hidden">
          <span className="text-[11px] font-bold text-[#DFC076]">القائمة</span>
          <button
            type="button"
            onClick={onCloseMobile}
            className="p-1.5 rounded-lg bg-white/10 text-white hover:bg-white/20 cursor-pointer"
            aria-label="إغلاق القائمة"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 3 Main Navigation Tabs */}
        <nav aria-label="التنقل الرئيسي بين التبويبات" className="divide-y divide-white/15 border-y border-white/15">
          {navItems.map((item) => {
            const active = activeTab === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => handleNavClick(item.key)}
                className={`w-full px-2 py-3.5 flex flex-col items-center text-center gap-1 transition-all cursor-pointer ${
                  active
                    ? 'bg-gradient-to-b from-[#D9B867] via-[#BC9C52] to-[#B38A3A] text-[#012044] shadow-inner'
                    : 'text-slate-100 hover:bg-white/10 hover:text-white'
                }`}
              >
                <div className={active ? 'text-[#012044]' : 'text-white/95'}>
                  {item.icon}
                </div>
                <span className="text-xs font-extrabold leading-tight mt-0.5">
                  {item.labelAr}
                </span>
                <span
                  className={`text-[9.5px] font-semibold leading-tight ${
                    active ? 'text-[#012044]/85' : 'text-slate-300'
                  }`}
                >
                  {item.labelEn}
                </span>
                {typeof item.badge === 'number' && (
                  <span
                    dir="ltr"
                    className={`mt-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold tabular-nums ${
                      active
                        ? 'bg-[#012E5E] text-[#DFC076]'
                        : 'bg-white/15 text-[#DFC076]'
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
