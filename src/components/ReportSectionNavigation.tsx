import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  Award,
  BarChart3,
  Building2,
  Check,
  CheckSquare,
  ChevronDown,
  ClipboardList,
  Compass,
  FileCheck2,
  Layers,
  Lightbulb,
  ShieldAlert,
  Truck,
  UserCheck,
  Wrench,
} from 'lucide-react';

export interface QuickSectionItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const REPORT_QUICK_SECTIONS: readonly QuickSectionItem[] = [
  { id: 'sec-summary', label: 'الملخص التنفيذي', icon: ClipboardList },
  { id: 'sec-ops-strip', label: 'ملخص العمليات والاعتماد', icon: Activity },
  { id: 'sec-overview', label: 'توزيع الأداء', icon: BarChart3 },
  { id: 'sec-services', label: 'ملخص الخدمات', icon: Layers },
  { id: 'sec-contracts', label: 'العقود والرخص', icon: FileCheck2 },
  { id: 'sec-safety', label: 'الطفايات والمخاطر', icon: ShieldAlert },
  { id: 'sec-maintenance', label: 'مصفوفة الصيانة', icon: Wrench },
  { id: 'sec-logistics', label: 'الدعم اللوجستي', icon: Truck },
  { id: 'sec-maint-services', label: 'مصادر الصيانة', icon: Building2 },
  { id: 'sec-security', label: 'الأمن والاستقبال', icon: UserCheck },
  { id: 'sec-tasks', label: 'المهام', icon: CheckSquare },
  { id: 'sec-challenges', label: 'التحديات والتوصيات', icon: Lightbulb },
  { id: 'sec-approval', label: 'الإعداد والاعتماد', icon: Award },
] as const;

type NavLayoutMode = 'full-comfort' | 'full-dense' | 'overflow' | 'compact';

interface LayoutState {
  mode: NavLayoutMode;
  visibleCount: number;
}

const COMPACT_BREAKPOINT_PX = 500;
const ITEM_GAP_COMFORT_PX = 8; // Matches Tailwind gap-2 (8px)
const ITEM_GAP_DENSE_PX = 6; // Matches Tailwind gap-1.5 (6px)
const NAV_HORIZONTAL_PADDING_PX = 16; // Matches px-2 (8px left + 8px right)
const SAFETY_BUFFER_PX = 8;

export const ReportSectionNavigation: React.FC = () => {
  const navRef = useRef<HTMLElement | null>(null);
  const comfortMeasureRef = useRef<HTMLDivElement | null>(null);
  const denseMeasureRef = useRef<HTMLDivElement | null>(null);
  const moreBtnMeasureRef = useRef<HTMLSpanElement | null>(null);
  const moreTriggerRef = useRef<HTMLButtonElement | null>(null);
  const compactTriggerRef = useRef<HTMLButtonElement | null>(null);
  const menuContainerRef = useRef<HTMLDivElement | null>(null);
  const menuItemRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  const manualScrollUntilRef = useRef<number>(0);
  const lastMeasuredWidthRef = useRef<number>(0);

  const [activeSectionId, setActiveSectionId] = useState<string>(() => {
    if (typeof window !== 'undefined' && window.location.hash) {
      const cleanHash = window.location.hash.replace(/^#/, '');
      if (REPORT_QUICK_SECTIONS.some((s) => s.id === cleanHash)) {
        return cleanHash;
      }
    }
    return REPORT_QUICK_SECTIONS[0].id;
  });

  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
  const [layout, setLayout] = useState<LayoutState>({
    mode: 'full-comfort',
    visibleCount: REPORT_QUICK_SECTIONS.length,
  });

  const activeIndex = useMemo(() => {
    const idx = REPORT_QUICK_SECTIONS.findIndex((s) => s.id === activeSectionId);
    return idx >= 0 ? idx : 0;
  }, [activeSectionId]);

  const activeSection = REPORT_QUICK_SECTIONS[activeIndex] || REPORT_QUICK_SECTIONS[0];

  /**
   * Deterministic container width measurement using offscreen reference elements.
   * Reserves space for the «المزيد» button AND the widest hidden item badge so that
   * scrolling between sections never triggers layout shifts or horizontal overflow.
   */
  const recalculateLayout = useCallback((force = false) => {
    const navEl = navRef.current;
    const comfortContainer = comfortMeasureRef.current;
    const denseContainer = denseMeasureRef.current;
    const moreBtnEl = moreBtnMeasureRef.current;

    if (!navEl || !comfortContainer || !denseContainer || !moreBtnEl) return;

    const rawWidth = Math.floor(navEl.getBoundingClientRect().width);
    if (rawWidth <= 0) return;

    const availableWidth = Math.max(0, rawWidth - NAV_HORIZONTAL_PADDING_PX);

    if (!force && Math.abs(availableWidth - lastMeasuredWidthRef.current) < 0.5) {
      return;
    }
    lastMeasuredWidthRef.current = availableWidth;

    const totalSections = REPORT_QUICK_SECTIONS.length;

    // 1. Narrow / Mobile Container Mode
    if (availableWidth < COMPACT_BREAKPOINT_PX) {
      setLayout((prev) =>
        prev.mode === 'compact' && prev.visibleCount === 0
          ? prev
          : { mode: 'compact', visibleCount: 0 }
      );
      return;
    }

    const comfortNodes = Array.from(
      comfortContainer.querySelectorAll<HTMLElement>('[data-measure-comfort]')
    );
    const denseNodes = Array.from(
      denseContainer.querySelectorAll<HTMLElement>('[data-measure-dense]')
    );

    if (comfortNodes.length !== totalSections || denseNodes.length !== totalSections) {
      return;
    }

    const comfortWidths = comfortNodes.map((node) => Math.ceil(node.getBoundingClientRect().width));
    const denseWidths = denseNodes.map((node) => Math.ceil(node.getBoundingClientRect().width));

    // 2. Check if all 13 items fit in comfortable desktop spacing (centered with gap-2)
    const totalComfortWidth =
      comfortWidths.reduce((acc, w) => acc + w, 0) + (totalSections - 1) * ITEM_GAP_COMFORT_PX;

    if (totalComfortWidth + SAFETY_BUFFER_PX <= availableWidth) {
      setLayout((prev) =>
        prev.mode === 'full-comfort' && prev.visibleCount === totalSections
          ? prev
          : { mode: 'full-comfort', visibleCount: totalSections }
      );
      return;
    }

    // 3. Check if all 13 items fit in compact-desktop single-row spacing (centered with gap-1.5)
    const totalDenseWidth =
      denseWidths.reduce((acc, w) => acc + w, 0) + (totalSections - 1) * ITEM_GAP_DENSE_PX;

    if (totalDenseWidth + SAFETY_BUFFER_PX <= availableWidth) {
      setLayout((prev) =>
        prev.mode === 'full-dense' && prev.visibleCount === totalSections
          ? prev
          : { mode: 'full-dense', visibleCount: totalSections }
      );
      return;
    }

    // 4. Priority+ Overflow Calculation:
    // Find the largest prefix count `k` (from 12 down to 1) such that:
    // sum(comfortWidths[0..k-1]) + gaps + widestOverflowPill + moreBtnWidth <= availableWidth
    const moreBtnWidth = Math.ceil(moreBtnEl.getBoundingClientRect().width) || 98;
    const dividerAllowance = 16;

    let bestVisibleCount = 1;
    for (let k = totalSections - 1; k >= 1; k--) {
      const visibleSum =
        comfortWidths.slice(0, k).reduce((acc, w) => acc + w, 0) +
        Math.max(0, k - 1) * ITEM_GAP_COMFORT_PX;
      const maxOverflowItemWidth = Math.max(...comfortWidths.slice(k));
      const requiredWidth =
        visibleSum +
        ITEM_GAP_COMFORT_PX +
        maxOverflowItemWidth +
        dividerAllowance +
        ITEM_GAP_COMFORT_PX +
        moreBtnWidth +
        SAFETY_BUFFER_PX;

      if (requiredWidth <= availableWidth) {
        bestVisibleCount = k;
        break;
      }
    }

    if (bestVisibleCount === 1) {
      const firstPlusOverflow =
        comfortWidths[0] +
        ITEM_GAP_COMFORT_PX +
        Math.max(...comfortWidths.slice(1)) +
        dividerAllowance +
        ITEM_GAP_COMFORT_PX +
        moreBtnWidth +
        SAFETY_BUFFER_PX;
      if (firstPlusOverflow > availableWidth) {
        setLayout((prev) =>
          prev.mode === 'compact' && prev.visibleCount === 0
            ? prev
            : { mode: 'compact', visibleCount: 0 }
        );
        return;
      }
    }

    setLayout((prev) =>
      prev.mode === 'overflow' && prev.visibleCount === bestVisibleCount
        ? prev
        : { mode: 'overflow', visibleCount: bestVisibleCount }
    );
  }, []);

  // Measure immediately on mount and observe container width changes via ResizeObserver
  useLayoutEffect(() => {
    recalculateLayout(true);
  }, [recalculateLayout]);

  useEffect(() => {
    const navEl = navRef.current;
    if (!navEl) return;

    let rafId: number | null = null;
    const scheduleMeasure = (force = false) => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        recalculateLayout(force);
      });
    };

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => {
        scheduleMeasure(false);
      });
      observer.observe(navEl);
    }

    const handleWindowResize = () => scheduleMeasure(true);
    window.addEventListener('resize', handleWindowResize, { passive: true });

    if (typeof document !== 'undefined' && 'fonts' in document && document.fonts?.ready) {
      document.fonts.ready.then(() => scheduleMeasure(true)).catch(() => {});
    }

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      if (observer) observer.disconnect();
      window.removeEventListener('resize', handleWindowResize);
    };
  }, [recalculateLayout]);

  // Track active section while scrolling via IntersectionObserver + viewport position check
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    const updateActiveFromScroll = () => {
      if (Date.now() < manualScrollUntilRef.current) return;

      const viewportOffsetThreshold = 165;
      let currentCandidate = REPORT_QUICK_SECTIONS[0].id;

      for (const sec of REPORT_QUICK_SECTIONS) {
        const el = document.getElementById(sec.id);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (rect.top <= viewportOffsetThreshold) {
          currentCandidate = sec.id;
        } else {
          break;
        }
      }

      const scrolledToBottom =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 40;
      if (scrolledToBottom) {
        for (let i = REPORT_QUICK_SECTIONS.length - 1; i >= 0; i--) {
          const el = document.getElementById(REPORT_QUICK_SECTIONS[i].id);
          if (el) {
            const rect = el.getBoundingClientRect();
            if (rect.top < window.innerHeight && rect.bottom > 0) {
              currentCandidate = REPORT_QUICK_SECTIONS[i].id;
              break;
            }
          }
        }
      }

      setActiveSectionId((prev) => (prev === currentCandidate ? prev : currentCandidate));
    };

    let scrollRaf: number | null = null;
    const onScroll = () => {
      if (scrollRaf !== null) return;
      scrollRaf = requestAnimationFrame(() => {
        scrollRaf = null;
        updateActiveFromScroll();
      });
    };

    let io: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver(
        () => {
          updateActiveFromScroll();
        },
        {
          root: null,
          rootMargin: '-120px 0px -55% 0px',
          threshold: [0, 0.25, 0.5, 1],
        }
      );

      for (const sec of REPORT_QUICK_SECTIONS) {
        const el = document.getElementById(sec.id);
        if (el) io.observe(el);
      }
    }

    const onHashChange = () => {
      const cleanHash = window.location.hash.replace(/^#/, '');
      if (REPORT_QUICK_SECTIONS.some((s) => s.id === cleanHash)) {
        setActiveSectionId(cleanHash);
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('hashchange', onHashChange);

    return () => {
      if (scrollRaf !== null) cancelAnimationFrame(scrollRaf);
      if (io) io.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('hashchange', onHashChange);
    };
  }, []);

  // Close menu when clicking outside or pressing Escape
  useEffect(() => {
    if (!isMenuOpen) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (
        menuContainerRef.current?.contains(target) ||
        moreTriggerRef.current?.contains(target) ||
        compactTriggerRef.current?.contains(target)
      ) {
        return;
      }
      setIsMenuOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setIsMenuOpen(false);
        if (layout.mode === 'compact') {
          compactTriggerRef.current?.focus();
        } else {
          moreTriggerRef.current?.focus();
        }
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown, { passive: true });
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMenuOpen, layout.mode]);

  const handleNavigateToSection = useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>, sectionId: string) => {
      event.preventDefault();
      setActiveSectionId(sectionId);
      setIsMenuOpen(false);
      manualScrollUntilRef.current = Date.now() + 950;

      const targetEl = document.getElementById(sectionId);
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }

      if (typeof window !== 'undefined' && window.history?.replaceState) {
        window.history.replaceState(null, '', `#${sectionId}`);
      }
    },
    []
  );

  const handleMenuKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    const focusableLinks = menuItemRefs.current.filter(
      (el): el is HTMLAnchorElement => el !== null
    );
    if (focusableLinks.length === 0) return;

    const currentIdx = focusableLinks.findIndex((el) => el === document.activeElement);

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const nextIdx = currentIdx < focusableLinks.length - 1 ? currentIdx + 1 : 0;
      focusableLinks[nextIdx]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      const prevIdx = currentIdx > 0 ? currentIdx - 1 : focusableLinks.length - 1;
      focusableLinks[prevIdx]?.focus();
    } else if (event.key === 'Home') {
      event.preventDefault();
      focusableLinks[0]?.focus();
    } else if (event.key === 'End') {
      event.preventDefault();
      focusableLinks[focusableLinks.length - 1]?.focus();
    }
  }, []);

  const visibleSections = useMemo(() => {
    if (layout.mode === 'compact') return [];
    if (layout.mode === 'full-comfort' || layout.mode === 'full-dense') {
      return REPORT_QUICK_SECTIONS;
    }
    return REPORT_QUICK_SECTIONS.slice(0, layout.visibleCount);
  }, [layout.mode, layout.visibleCount]);

  const overflowSections = useMemo(() => {
    if (layout.mode === 'compact') return REPORT_QUICK_SECTIONS;
    if (layout.mode === 'full-comfort' || layout.mode === 'full-dense') return [];
    return REPORT_QUICK_SECTIONS.slice(layout.visibleCount);
  }, [layout.mode, layout.visibleCount]);

  const activeOverflowSection = useMemo(() => {
    if (layout.mode !== 'overflow') return null;
    return overflowSections.find((sec) => sec.id === activeSectionId) || null;
  }, [layout.mode, overflowSections, activeSectionId]);

  const isDenseFullRow = layout.mode === 'full-dense';
  const ActiveIcon = activeSection.icon;

  return (
    <nav
      ref={navRef}
      dir="rtl"
      aria-label="التنقل السريع داخل أقسام التقرير"
      className="report-section-navigation relative flex items-center justify-center w-full max-w-full min-w-0 pt-2 pb-0.5 px-2 border-t border-slate-100 select-none print:hidden no-print"
    >
      {/* ================================================================= */}
      {/* OFFSCREEN ZERO-SIZE MEASUREMENT RIG (Never causes scrollbars)     */}
      {/* ================================================================= */}
      <div
        aria-hidden="true"
        className="h-0 w-0 overflow-hidden opacity-0 pointer-events-none absolute top-0 right-0"
      >
        {/* Comfort spacing measurement row */}
        <div ref={comfortMeasureRef} className="inline-flex items-center gap-2 whitespace-nowrap">
          {REPORT_QUICK_SECTIONS.map((sec) => (
            <span
              key={`measure-comfort-${sec.id}`}
              data-measure-comfort={sec.id}
              className="inline-flex items-center justify-center gap-1.5 px-2.5 h-[34px] min-h-[34px] rounded-lg border text-[11px] font-bold leading-none whitespace-nowrap shrink-0"
            >
              <span className="w-1.5 h-1.5 rounded-full shrink-0" />
              <span>{sec.label}</span>
            </span>
          ))}
        </div>

        {/* Dense desktop single-row measurement row */}
        <div ref={denseMeasureRef} className="inline-flex items-center gap-1.5 whitespace-nowrap">
          {REPORT_QUICK_SECTIONS.map((sec) => (
            <span
              key={`measure-dense-${sec.id}`}
              data-measure-dense={sec.id}
              className="inline-flex items-center justify-center gap-1 px-2 h-[34px] min-h-[34px] rounded-lg border text-[10.5px] font-bold leading-none whitespace-nowrap shrink-0"
            >
              <span className="w-1.5 h-1.5 rounded-full shrink-0" />
              <span>{sec.label}</span>
            </span>
          ))}
        </div>

        {/* «المزيد» button intrinsic width reference */}
        <span
          ref={moreBtnMeasureRef}
          className="inline-flex items-center justify-center gap-1.5 px-2.5 h-[34px] min-h-[34px] rounded-lg border text-[11px] font-extrabold leading-none whitespace-nowrap shrink-0"
        >
          <span>المزيد</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px]">+13</span>
          <span className="w-3.5 h-3.5" />
        </span>
      </div>

      {/* ================================================================= */}
      {/* MODE A: LARGE & MEDIUM SCREENS (Centered Group + «المزيد»)        */}
      {/* ================================================================= */}
      {layout.mode !== 'compact' && (
        <div
          className={`report-section-navigation__links flex items-center justify-center max-w-full min-w-0 mx-auto ${
            isDenseFullRow ? 'gap-1.5' : 'gap-2'
          }`}
        >
          {/* Visible Primary Section Links (Centered Horizontally & Vertically) */}
          {visibleSections.map((sec) => {
            const isActive = sec.id === activeSectionId;
            return (
              <a
                key={sec.id}
                href={`#${sec.id}`}
                aria-current={isActive ? 'location' : undefined}
                onClick={(e) => handleNavigateToSection(e, sec.id)}
                className={`report-section-navigation__link inline-flex items-center justify-center gap-1.5 h-[34px] min-h-[34px] rounded-lg border font-bold leading-none transition-colors whitespace-nowrap shrink-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1769AA] ${
                  isDenseFullRow ? 'px-2 text-[10.5px]' : 'px-2.5 text-[11px]'
                } ${
                  isActive
                    ? 'bg-[#0B2341] text-[#DFC076] border-[#C99E4A]/75 shadow-2xs'
                    : 'bg-transparent text-slate-600 border-transparent hover:text-[#0B2341] hover:bg-[#EAF4FC] hover:border-[#A3C0DE]/50'
                }`}
              >
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="w-1.5 h-1.5 rounded-full bg-[#DFC076] shrink-0"
                  />
                )}
                <span>{sec.label}</span>
              </a>
            );
          })}

          {/* Overflow Controls (Part of the Same Centered Group) */}
          {overflowSections.length > 0 && (
            <>
              {activeOverflowSection && (
                <>
                  <span aria-hidden="true" className="h-4 w-px bg-slate-200 shrink-0" />
                  <a
                    href={`#${activeOverflowSection.id}`}
                    aria-current="location"
                    onClick={(e) => handleNavigateToSection(e, activeOverflowSection.id)}
                    title={`القسم النشط حالياً: ${activeOverflowSection.label}`}
                    className="report-section-navigation__link inline-flex items-center justify-center gap-1.5 px-2.5 h-[34px] min-h-[34px] rounded-lg border border-[#C99E4A]/75 text-[11px] font-bold leading-none bg-[#0B2341] text-[#DFC076] shadow-2xs whitespace-nowrap shrink-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1769AA]"
                  >
                    <span
                      aria-hidden="true"
                      className="w-1.5 h-1.5 rounded-full bg-[#DFC076] shrink-0"
                    />
                    <span>{activeOverflowSection.label}</span>
                  </a>
                </>
              )}

              <div className="relative flex items-center shrink-0">
                <button
                  ref={moreTriggerRef}
                  type="button"
                  aria-expanded={isMenuOpen}
                  aria-haspopup="true"
                  aria-controls="saaed-section-nav-more-menu"
                  aria-label={`عرض المزيد من أقسام التقرير (${overflowSections.length} أقسام إضافية)`}
                  onClick={() => setIsMenuOpen((prev) => !prev)}
                  className={`report-section-navigation__link inline-flex items-center justify-center gap-1.5 px-2.5 h-[34px] min-h-[34px] rounded-lg text-[11px] font-extrabold leading-none transition-colors whitespace-nowrap shrink-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1769AA] ${
                    isMenuOpen || activeOverflowSection
                      ? 'bg-[#082D56] text-white border border-[#C99E4A]/75 shadow-2xs'
                      : 'bg-[#F4F8FD] hover:bg-[#EAF4FC] text-[#0B2341] border border-[#A3C0DE]/80'
                  }`}
                >
                  <span>المزيد</span>
                  <span
                    dir="ltr"
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold leading-none tabular-nums ${
                      isMenuOpen || activeOverflowSection
                        ? 'bg-[#C99E4A] text-[#0B2341]'
                        : 'bg-[#1769AA]/15 text-[#1769AA]'
                    }`}
                  >
                    +{overflowSections.length}
                  </span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform duration-200 ${
                      isMenuOpen ? 'rotate-180 text-[#DFC076]' : ''
                    }`}
                  />
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ================================================================= */}
      {/* MODE B: NARROW / MOBILE SCREENS (Centered Compact Selector)       */}
      {/* ================================================================= */}
      {layout.mode === 'compact' && (
        <div className="flex items-center justify-between gap-2 w-full max-w-md mx-auto bg-[#F8FAFC] border border-[#B8CEE6]/80 rounded-lg px-3 py-1.5 min-h-[38px]">
          <a
            href={`#${activeSection.id}`}
            aria-current="location"
            onClick={(e) => handleNavigateToSection(e, activeSection.id)}
            className="flex items-center gap-2 min-w-0 flex-1 text-right group cursor-pointer focus:outline-none"
          >
            <span className="w-6 h-6 rounded-md bg-[#0B2341] text-[#DFC076] flex items-center justify-center shrink-0 shadow-2xs">
              <ActiveIcon className="w-3.5 h-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-extrabold text-[#1769AA]">
                  القسم الحالي ({activeIndex + 1}/{REPORT_QUICK_SECTIONS.length})
                </span>
                <span
                  aria-hidden="true"
                  className="w-1.5 h-1.5 rounded-full bg-[#C99E4A] shrink-0"
                />
              </div>
              <div className="text-[11.5px] font-extrabold text-[#0B2341] group-hover:text-[#1769AA] transition-colors leading-snug break-words">
                {activeSection.label}
              </div>
            </div>
          </a>

          <button
            ref={compactTriggerRef}
            type="button"
            aria-expanded={isMenuOpen}
            aria-haspopup="true"
            aria-controls="saaed-section-nav-more-menu"
            aria-label="عرض جميع أقسام التقرير الثلاثة عشر"
            onClick={() => setIsMenuOpen((prev) => !prev)}
            className={`inline-flex items-center justify-center gap-1.5 px-2.5 h-[34px] min-h-[34px] rounded-lg text-[11px] font-extrabold leading-none transition-colors shrink-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1769AA] ${
              isMenuOpen
                ? 'bg-[#0B2341] text-[#DFC076] border border-[#C99E4A]'
                : 'bg-white hover:bg-[#EAF4FC] text-[#0B2341] border border-[#A3C0DE]'
            }`}
          >
            <Compass className="w-3.5 h-3.5 text-[#1769AA]" />
            <span>جميع الأقسام</span>
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform duration-200 ${
                isMenuOpen ? 'rotate-180 text-[#DFC076]' : ''
              }`}
            />
          </button>
        </div>
      )}

      {/* ================================================================= */}
      {/* ACCESSIBLE OVERFLOW / ALL-SECTIONS POPOVER MENU                   */}
      {/* ================================================================= */}
      {isMenuOpen && overflowSections.length > 0 && (
        <div
          id="saaed-section-nav-more-menu"
          ref={menuContainerRef}
          role="menu"
          aria-label={
            layout.mode === 'compact'
              ? 'قائمة جميع أقسام التقرير الثلاثة عشر'
              : 'أقسام التقرير الإضافية'
          }
          onKeyDown={handleMenuKeyDown}
          className={`absolute top-full mt-1.5 z-50 bg-white rounded-xl border border-[#A3C0DE] shadow-[0_12px_32px_rgba(11,35,65,0.16)] p-2 ${
            layout.mode === 'compact'
              ? 'left-1/2 -translate-x-1/2 w-full max-w-md'
              : 'left-2 w-72 sm:w-80 max-w-[calc(100vw-2rem)]'
          }`}
        >
          <div className="flex items-center justify-between px-2.5 py-1.5 mb-1 border-b border-slate-100">
            <span className="text-[11px] font-extrabold text-[#0B2341]">
              {layout.mode === 'compact'
                ? 'أقسام التقرير الرسمية (13 قسماً)'
                : `أقسام إضافية (${overflowSections.length} من ${REPORT_QUICK_SECTIONS.length})`}
            </span>
            <span className="text-[10px] font-bold text-[#1769AA]">انتقال فوري</span>
          </div>

          <div className="grid grid-cols-1 gap-1 max-h-[65vh] overflow-y-auto">
            {overflowSections.map((sec, idx) => {
              const globalIdx = REPORT_QUICK_SECTIONS.findIndex((s) => s.id === sec.id);
              const isActive = sec.id === activeSectionId;
              const ItemIcon = sec.icon;

              return (
                <a
                  key={`menu-${sec.id}`}
                  ref={(el) => {
                    menuItemRefs.current[idx] = el;
                  }}
                  role="menuitem"
                  href={`#${sec.id}`}
                  aria-current={isActive ? 'location' : undefined}
                  onClick={(e) => handleNavigateToSection(e, sec.id)}
                  className={`flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1769AA] ${
                    isActive
                      ? 'bg-[#0B2341] text-[#DFC076] shadow-2xs ring-1 ring-[#C99E4A]/60'
                      : 'text-slate-700 hover:bg-[#EAF4FC] hover:text-[#0B2341]'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      dir="ltr"
                      className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-extrabold tabular-nums shrink-0 ${
                        isActive
                          ? 'bg-[#C99E4A] text-[#0B2341]'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {globalIdx + 1}
                    </span>
                    <ItemIcon
                      className={`w-3.5 h-3.5 shrink-0 ${
                        isActive ? 'text-[#DFC076]' : 'text-[#1769AA]'
                      }`}
                    />
                    <span className="leading-snug">{sec.label}</span>
                  </div>

                  {isActive && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#C99E4A]/20 text-[#DFC076] text-[10px] font-extrabold shrink-0">
                      <Check className="w-3 h-3" />
                      <span>نشط</span>
                    </span>
                  )}
                </a>
              );
            })}
          </div>
        </div>
      )}
    </nav>
  );
};
