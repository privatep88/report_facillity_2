import React, { useMemo, useState } from 'react';
import { Award, Building2, Wrench } from 'lucide-react';
import type { MaintenanceCategory, MaintenanceSite } from '../types/report.ts';
import { formatAed, formatNumber, formatPercentage } from '../utils/calculations.ts';

interface MaintenanceSiteHorizontalChartProps {
  sites: MaintenanceSite[];
  categories?: MaintenanceCategory[];
  siteTotals: Record<string, number>;
  maintenanceMatrix?: Record<string, Record<string, number>>;
  grandTotalFaults: number;
  grandTotalCostAed?: number;
  variant?: 'default' | 'print';
  className?: string;
}

interface TopCategoryBreakdown {
  categoryId: string;
  nameAr: string;
  count: number;
}

interface ComputedSiteRow {
  siteId: string;
  nameAr: string;
  nameEn: string;
  faults: number;
  sharePct: number;
  widthPct: number;
  rank: number;
  isTopSite: boolean;
  topCategories: TopCategoryBreakdown[];
}

/**
 * SAAED Executive Horizontal Bar Chart for Facility Maintenance Comparison (مقارنة الأعطال بين المقرات)
 * - Dynamically sorts facilities descending by recorded fault count without mutating the matrix table order
 * - Displays facility name, proportional horizontal bar, fault count, and 1-decimal share percentage
 * - Highlights the facility with the highest recorded fault count using SAAED Gold (#C6A35E) & Deep Navy (#0C2544)
 * - Includes interactive RTL tooltip with live breakdown of top recorded fault categories per facility
 */
export const MaintenanceSiteHorizontalChart: React.FC<MaintenanceSiteHorizontalChartProps> = ({
  sites,
  categories = [],
  siteTotals,
  maintenanceMatrix = {},
  grandTotalFaults,
  grandTotalCostAed,
  variant = 'default',
  className = '',
}) => {
  const [activeSiteId, setActiveSiteId] = useState<string | null>(null);

  const { sortedRows, totalFaults, topSite } = useMemo(() => {
    const safeSites = Array.isArray(sites) ? sites : [];
    const safeCategories = Array.isArray(categories) ? categories : [];

    const indexed = safeSites.map((s, idx) => {
      const faults = Math.max(0, Math.round(Number(siteTotals[s.id]) || 0));
      const siteCatMap = maintenanceMatrix[s.id] || {};
      const topCategories: TopCategoryBreakdown[] = safeCategories
        .map((cat) => ({
          categoryId: cat.id,
          nameAr: cat.nameAr,
          count: Math.max(0, Math.round(Number(siteCatMap[cat.id]) || 0)),
        }))
        .filter((c) => c.count > 0)
        .sort((a, b) => b.count - a.count)
        .slice(0, 3);

      return {
        siteId: s.id,
        nameAr: s.nameAr,
        nameEn: s.nameEn || '',
        faults,
        sortOrder: typeof s.sortOrder === 'number' ? s.sortOrder : idx + 1,
        origIdx: idx,
        topCategories,
      };
    });

    const computedTotal =
      typeof grandTotalFaults === 'number' && grandTotalFaults >= 0
        ? grandTotalFaults
        : indexed.reduce((sum, item) => sum + item.faults, 0);

    // Sort descending by fault count; deterministic tie-break by sortOrder then origIdx
    const sorted = [...indexed].sort((a, b) => {
      if (b.faults !== a.faults) {
        return b.faults - a.faults;
      }
      if (a.sortOrder !== b.sortOrder) {
        return a.sortOrder - b.sortOrder;
      }
      return a.origIdx - b.origIdx;
    });

    const maxFaults = sorted.reduce((max, item) => Math.max(max, item.faults), 0);

    const rows: ComputedSiteRow[] = sorted.map((item, idx) => {
      const sharePct = computedTotal > 0 ? (item.faults / computedTotal) * 100 : 0;
      const widthPct =
        maxFaults > 0 && item.faults > 0
          ? Math.max(6, Math.min(100, (item.faults / maxFaults) * 100))
          : 0;
      return {
        siteId: item.siteId,
        nameAr: item.nameAr,
        nameEn: item.nameEn,
        faults: item.faults,
        sharePct,
        widthPct,
        rank: idx + 1,
        isTopSite: idx === 0 && item.faults > 0,
        topCategories: item.topCategories,
      };
    });

    const highest = rows.length > 0 && rows[0].faults > 0 ? rows[0] : null;

    return {
      sortedRows: rows,
      totalFaults: computedTotal,
      topSite: highest,
    };
  }, [sites, categories, siteTotals, maintenanceMatrix, grandTotalFaults]);

  const activeRow = useMemo(
    () => sortedRows.find((r) => r.siteId === activeSiteId) ?? null,
    [sortedRows, activeSiteId]
  );

  const isPrint = variant === 'print';

  const getBarBackground = (row: ComputedSiteRow): string => {
    if (row.faults <= 0) {
      return '#CBD5E1';
    }
    if (row.isTopSite) {
      return 'linear-gradient(270deg, #0C2544 0%, #1769AA 74%, #C6A35E 100%)';
    }
    if (row.rank === 2) {
      return 'linear-gradient(270deg, #0C2544 0%, #1769AA 100%)';
    }
    if (row.rank === 3) {
      return 'linear-gradient(270deg, #1769AA 0%, #247DC1 100%)';
    }
    return 'linear-gradient(270deg, #1E5A8A 0%, #247DC1 100%)';
  };

  return (
    <div
      dir="rtl"
      className={`relative rounded-xl border border-[#D5E3F2] bg-gradient-to-b from-white to-[#F7FAFE] ${
        isPrint ? 'p-2.5' : 'p-4'
      } shadow-2xs select-none ${className}`}
      style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
      onMouseLeave={() => setActiveSiteId(null)}
    >
      {/* Top Header & Mini Summary Cards (إجمالي الأعطال + المقر الأعلى أعطالاً) */}
      <div
        className={`flex flex-wrap items-center justify-between gap-2.5 border-b border-[#E3EDF7] ${
          isPrint ? 'pb-2 mb-2' : 'pb-3 mb-3'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-1.5 h-7 rounded-full bg-gradient-to-b from-[#0C2544] via-[#1769AA] to-[#C6A35E] shrink-0" />
          <div className="min-w-0">
            <h3 className={`${isPrint ? 'text-xs' : 'text-xs sm:text-sm'} font-extrabold text-[#0C2544] leading-tight`}>
              مقارنة الأعطال بين المقرات
            </h3>
            <p className="text-[10.5px] text-slate-500 leading-tight mt-0.5">
              مرتبة تنازلياً حسب عدد الأعطال المسجلة مع نسبة مساهمة كل مقر من الإجمالي
            </p>
          </div>
        </div>

        {/* Mini Summary Cards Strip */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Card 1: إجمالي الأعطال */}
          <div
            className={`flex items-center gap-2 rounded-lg bg-[#0C2544] text-white border border-[#C6A35E]/60 ${
              isPrint ? 'px-2.5 py-1' : 'px-3 py-1.5'
            } shadow-2xs`}
          >
            <div className="w-6 h-6 rounded-md bg-[#C6A35E]/20 border border-[#C6A35E]/50 flex items-center justify-center shrink-0">
              <Wrench className="w-3.5 h-3.5 text-[#DFC076]" />
            </div>
            <div className="text-right">
              <span className="block text-[9px] font-bold text-[#EAF2FA]/85 leading-none">
                إجمالي الأعطال
              </span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span
                  className={`${isPrint ? 'text-xs' : 'text-sm'} font-extrabold text-[#DFC076] tabular-nums leading-none`}
                  dir="ltr"
                >
                  {formatNumber(totalFaults)}
                </span>
                <span className="text-[10px] font-bold text-white/90 leading-none">عطلاً</span>
              </div>
            </div>
          </div>

          {/* Card 2: المقر الأعلى أعطالاً */}
          <div
            className={`flex items-center gap-2 rounded-lg bg-[#EAF2FA]/85 text-[#0C2544] border border-[#C6A35E]/65 ${
              isPrint ? 'px-2.5 py-1' : 'px-3 py-1.5'
            }`}
          >
            <div className="w-6 h-6 rounded-md bg-[#0C2544] text-[#DFC076] flex items-center justify-center shrink-0">
              <Building2 className="w-3.5 h-3.5" />
            </div>
            <div className="text-right">
              <span className="block text-[9px] font-bold text-slate-600 leading-none">
                المقر الأعلى أعطالاً (حسب العدد المسجل)
              </span>
              <div className="flex items-baseline gap-1.5 mt-0.5 whitespace-nowrap">
                {topSite ? (
                  <>
                    <span className={`${isPrint ? 'text-[10.5px]' : 'text-xs'} font-extrabold text-[#0C2544]`}>
                      {topSite.nameAr}
                    </span>
                    <span
                      className="text-[10px] font-extrabold text-[#1769AA] tabular-nums"
                      dir="ltr"
                    >
                      ({formatNumber(topSite.faults)} — {formatPercentage(topSite.sharePct)})
                    </span>
                  </>
                ) : (
                  <span className="text-[11px] font-bold text-slate-500">لا توجد أعطال مسجلة</span>
                )}
              </div>
            </div>
          </div>

          {typeof grandTotalCostAed === 'number' && !isPrint && (
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white border border-[#D5E3F2] text-[11px] font-bold text-[#1769AA]">
              <span>إجمالي التكلفة المالية:</span>
              <span className="font-extrabold text-[#0C2544] tabular-nums" dir="ltr">
                {formatAed(grandTotalCostAed)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Interactive Executive Tooltip */}
      {!isPrint && activeRow && (
        <div
          role="status"
          aria-live="polite"
          className="mb-2.5 px-3 py-2 rounded-lg bg-[#0C2544] text-white border border-[#C6A35E]/70 shadow-sm flex flex-wrap items-center justify-between gap-2 text-[11px] transition-opacity duration-150"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-extrabold text-[#DFC076]">{activeRow.nameAr}</span>
            {activeRow.isTopSite && (
              <span className="px-1.5 py-0.5 rounded bg-[#C6A35E]/25 text-[#DFC076] text-[9.5px] font-bold">
                الأعلى من حيث العدد المسجل
              </span>
            )}
            {activeRow.topCategories.length > 0 && (
              <span className="text-[10.5px] text-[#EAF2FA]/90">
                • أبرز الأعطال:{' '}
                {activeRow.topCategories
                  .map((c) => `${c.nameAr} (${formatNumber(c.count)})`)
                  .join(' ، ')}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-white font-bold">
            <span>
              عدد الأعطال:{' '}
              <strong className="text-[#DFC076] tabular-nums" dir="ltr">
                {formatNumber(activeRow.faults)}
              </strong>{' '}
              عطلاً
            </span>
            <span className="text-white/40">|</span>
            <span>
              النسبة من الإجمالي:{' '}
              <strong className="text-[#DFC076] tabular-nums" dir="ltr">
                {formatPercentage(activeRow.sharePct)}
              </strong>
            </span>
          </div>
        </div>
      )}

      {/* Horizontal Facility Bar Rows */}
      <div className={isPrint ? 'space-y-1.5' : 'space-y-2'}>
        {sortedRows.map((row) => {
          const isHovered = activeSiteId === row.siteId;
          return (
            <div
              key={row.siteId}
              tabIndex={isPrint ? -1 : 0}
              role="group"
              aria-label={`${row.nameAr}: ${formatNumber(row.faults)} عطلاً — ${formatPercentage(row.sharePct)}`}
              onMouseEnter={() => !isPrint && setActiveSiteId(row.siteId)}
              onFocus={() => !isPrint && setActiveSiteId(row.siteId)}
              onBlur={() => !isPrint && setActiveSiteId(null)}
              onClick={() =>
                !isPrint && setActiveSiteId((prev) => (prev === row.siteId ? null : row.siteId))
              }
              className={`grid grid-cols-12 items-center gap-2 rounded-lg transition-colors ${
                isPrint ? 'px-2 py-1' : 'px-2.5 py-1.5'
              } ${
                row.isTopSite
                  ? 'bg-[#EAF2FA]/80 border border-[#C6A35E]/65'
                  : isHovered
                    ? 'bg-[#EAF2FA]/60 border border-[#1769AA]/35'
                    : 'bg-white/95 border border-[#E6EEF8]'
              } focus:outline-none focus:ring-2 focus:ring-[#1769AA]/40 cursor-pointer`}
            >
              {/* 1. Facility Name & Rank (Right side in RTL) */}
              <div className={`${isPrint ? 'col-span-3' : 'col-span-4 sm:col-span-3'} flex items-center gap-2 min-w-0`}>
                <span
                  className={`w-5 h-5 rounded-md text-[10px] font-extrabold flex items-center justify-center shrink-0 tabular-nums ${
                    row.isTopSite
                      ? 'bg-[#0C2544] text-[#DFC076] border border-[#C6A35E]'
                      : 'bg-[#EAF2FA] text-[#0C2544]'
                  }`}
                  dir="ltr"
                >
                  {formatNumber(row.rank)}
                </span>
                <span
                  className={`${
                    isPrint ? 'text-[11px]' : 'text-xs'
                  } font-extrabold text-[#0C2544] leading-snug break-words`}
                >
                  {row.nameAr}
                </span>
                {row.isTopSite && !isPrint && (
                  <Award
                    className="w-3.5 h-3.5 text-[#C6A35E] shrink-0 hidden sm:inline-block"
                    aria-label="المقر الأعلى من حيث عدد الأعطال المسجل"
                  />
                )}
              </div>

              {/* 2. Horizontal Bar Track (Middle) */}
              <div className={`${isPrint ? 'col-span-6' : 'col-span-4 sm:col-span-6'} flex items-center`}>
                <div
                  className={`w-full ${
                    isPrint ? 'h-3.5' : 'h-5'
                  } rounded-md bg-[#EAF2FA] border border-[#D5E4F4] overflow-hidden p-0.5 flex items-center`}
                >
                  {row.faults > 0 ? (
                    <div
                      className="h-full rounded-xs transition-all duration-300 relative"
                      style={{
                        width: `${row.widthPct}%`,
                        background: getBarBackground(row),
                        boxShadow: row.isTopSite ? '0 0 0 1px rgba(198, 163, 94, 0.5)' : undefined,
                      }}
                    />
                  ) : (
                    <div className="h-full w-1 rounded-xs bg-slate-300" title="0 عطلاً" />
                  )}
                </div>
              </div>

              {/* 3. Fault Count & Share Percentage (Left side in RTL) */}
              <div className={`${isPrint ? 'col-span-3' : 'col-span-4 sm:col-span-3'} flex items-center justify-end gap-1.5 shrink-0`}>
                <span
                  className={`${
                    isPrint ? 'text-[11px]' : 'text-xs'
                  } font-extrabold text-[#0C2544] tabular-nums whitespace-nowrap`}
                  dir="ltr"
                >
                  {formatNumber(row.faults)}
                </span>
                <span className={`text-[10px] font-semibold text-slate-500 ${isPrint ? 'inline' : 'hidden sm:inline'}`}>
                  عطلاً
                </span>
                <span className="text-slate-300 text-[10px]" aria-hidden="true">
                  —
                </span>
                <span
                  className={`min-w-[48px] text-center px-1.5 py-0.5 rounded text-[10.5px] font-extrabold tabular-nums ${
                    row.isTopSite
                      ? 'bg-[#0C2544] text-[#DFC076] border border-[#C6A35E]/60'
                      : row.faults > 0
                        ? 'bg-[#EAF2FA] text-[#1769AA]'
                        : 'bg-slate-100 text-slate-500'
                  }`}
                  dir="ltr"
                >
                  {formatPercentage(row.sharePct)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
