import React, { useMemo, useState } from 'react';
import { Award, Truck } from 'lucide-react';
import { formatNumber, formatPercentage } from '../utils/calculations.ts';

export interface LogisticsChartChannelInput {
  channelKey: string;
  nameAr: string;
  nameEn?: string;
  requestCount: number;
  sortOrder?: number;
}

interface LogisticsHorizontalChartProps {
  channels: LogisticsChartChannelInput[];
  variant?: 'default' | 'print';
  className?: string;
}

interface ComputedChannelRow {
  channelKey: string;
  nameAr: string;
  nameEn: string;
  requestCount: number;
  sharePct: number;
  widthPct: number;
  rank: number;
  isTopChannel: boolean;
}

/**
 * SAAED Executive Horizontal Bar Chart for Logistics Channels (الدعم اللوجستي)
 * - Dynamically sorts channels descending by request volume without mutating table column order
 * - Displays Arabic channel name, proportional horizontal bar, request count, and 1-decimal percentage
 * - Highlights the #1 highest-volume channel with SAAED Gold (#C6A35E) & Deep Navy (#0C2544)
 * - Includes interactive RTL tooltip (hover, focus, touch) and print/PDF-ready layout
 */
export const LogisticsHorizontalChart: React.FC<LogisticsHorizontalChartProps> = ({
  channels,
  variant = 'default',
  className = '',
}) => {
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const { sortedRows, totalRequests } = useMemo(() => {
    const safeChannels = Array.isArray(channels) ? channels : [];
    const total = safeChannels.reduce(
      (sum, ch) => sum + Math.max(0, Math.round(Number(ch.requestCount) || 0)),
      0
    );

    const indexed = safeChannels.map((ch, idx) => ({
      channelKey: ch.channelKey || `ch_${idx}`,
      nameAr: ch.nameAr || 'قناة دعم',
      nameEn: ch.nameEn || '',
      requestCount: Math.max(0, Math.round(Number(ch.requestCount) || 0)),
      sortOrder: typeof ch.sortOrder === 'number' ? ch.sortOrder : idx + 1,
    }));

    // Sort descending by requestCount; tie-break by original sortOrder
    const sorted = [...indexed].sort((a, b) => {
      if (b.requestCount !== a.requestCount) {
        return b.requestCount - a.requestCount;
      }
      return a.sortOrder - b.sortOrder;
    });

    const maxCount = sorted.reduce((max, item) => Math.max(max, item.requestCount), 0);

    const rows: ComputedChannelRow[] = sorted.map((item, idx) => {
      const sharePct = total > 0 ? (item.requestCount / total) * 100 : 0;
      // Scale bar relative to highest channel for clear visual comparison while preserving exact sharePct label
      const widthPct =
        maxCount > 0 && item.requestCount > 0
          ? Math.max(6, Math.min(100, (item.requestCount / maxCount) * 100))
          : 0;
      return {
        channelKey: item.channelKey,
        nameAr: item.nameAr,
        nameEn: item.nameEn,
        requestCount: item.requestCount,
        sharePct,
        widthPct,
        rank: idx + 1,
        isTopChannel: idx === 0 && item.requestCount > 0,
      };
    });

    return {
      sortedRows: rows,
      totalRequests: total,
    };
  }, [channels]);

  const activeRow = useMemo(
    () => sortedRows.find((r) => r.channelKey === activeKey) ?? null,
    [sortedRows, activeKey]
  );

  const isPrint = variant === 'print';

  const getBarBackground = (row: ComputedChannelRow): string => {
    if (row.requestCount <= 0) {
      return '#CBD5E1';
    }
    if (row.isTopChannel) {
      // Deep Navy -> Corporate Blue -> Gold highlight at the leading edge
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
        isPrint ? 'p-2.5' : 'p-3.5'
      } shadow-2xs select-none ${className}`}
      style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
      onMouseLeave={() => setActiveKey(null)}
    >
      {/* Top Header & Total Logistics Requests Mini Card */}
      <div
        className={`flex flex-wrap items-center justify-between gap-2 border-b border-[#E3EDF7] ${
          isPrint ? 'pb-2 mb-2' : 'pb-2.5 mb-3'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-1.5 h-6 rounded-full bg-gradient-to-b from-[#0C2544] via-[#1769AA] to-[#C6A35E] shrink-0" />
          <div className="min-w-0">
            <h4 className={`${isPrint ? 'text-[11px]' : 'text-xs'} font-extrabold text-[#0C2544] leading-tight`}>
              التوزيع التنازلي لقنوات الدعم اللوجستي
            </h4>
            <p className="text-[10px] text-slate-500 leading-tight mt-0.5">
              مرتبة تنازلياً من القناة الأعلى طلباً إلى الأقل (العدد والنسبة من الإجمالي)
            </p>
          </div>
        </div>

        {/* بطاقة إجمالي طلبات الدعم اللوجستي */}
        <div
          className={`flex items-center gap-2.5 rounded-lg bg-[#0C2544] text-white border border-[#C6A35E]/60 ${
            isPrint ? 'px-2.5 py-1' : 'px-3 py-1.5'
          } shadow-2xs shrink-0`}
        >
          <div className="w-6 h-6 rounded-md bg-[#C6A35E]/20 border border-[#C6A35E]/50 flex items-center justify-center shrink-0">
            <Truck className="w-3.5 h-3.5 text-[#DFC076]" />
          </div>
          <div className="text-right">
            <span className="block text-[9px] font-bold text-[#EAF2FA]/85 leading-none">
              إجمالي طلبات الدعم اللوجستي
            </span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span
                className={`${isPrint ? 'text-xs' : 'text-sm'} font-extrabold text-[#DFC076] tabular-nums leading-none`}
                dir="ltr"
              >
                {formatNumber(totalRequests)}
              </span>
              <span className="text-[10px] font-bold text-white/90 leading-none">طلباً</span>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Floating Executive Tooltip (when a channel is hovered/focused/touched) */}
      {!isPrint && activeRow && (
        <div
          role="status"
          aria-live="polite"
          className="mb-2.5 px-3 py-1.5 rounded-lg bg-[#0C2544] text-white border border-[#C6A35E]/70 shadow-sm flex flex-wrap items-center justify-between gap-2 text-[11px] transition-opacity duration-150"
        >
          <div className="flex items-center gap-1.5 font-extrabold text-[#DFC076]">
            <span>القناة: {activeRow.nameAr}</span>
            {activeRow.isTopChannel && (
              <span className="px-1.5 py-0.5 rounded bg-[#C6A35E]/25 text-[#DFC076] text-[9px] font-bold">
                الأعلى طلباً
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-white font-bold">
            <span>
              عدد الطلبات:{' '}
              <strong className="text-[#DFC076] tabular-nums" dir="ltr">
                {formatNumber(activeRow.requestCount)}
              </strong>{' '}
              طلباً
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

      {/* Horizontal Bar Rows */}
      <div className={isPrint ? 'space-y-1.5' : 'space-y-2'}>
        {sortedRows.map((row) => {
          const isHovered = activeKey === row.channelKey;
          return (
            <div
              key={row.channelKey}
              tabIndex={isPrint ? -1 : 0}
              role="group"
              aria-label={`${row.nameAr}: ${formatNumber(row.requestCount)} طلباً — ${formatPercentage(row.sharePct)}`}
              onMouseEnter={() => !isPrint && setActiveKey(row.channelKey)}
              onFocus={() => !isPrint && setActiveKey(row.channelKey)}
              onBlur={() => !isPrint && setActiveKey(null)}
              onClick={() =>
                !isPrint && setActiveKey((prev) => (prev === row.channelKey ? null : row.channelKey))
              }
              className={`grid grid-cols-12 items-center ${isPrint ? 'gap-1 px-1.5 py-1' : 'gap-2 px-2 py-1.5'} rounded-lg transition-colors ${
                row.isTopChannel
                  ? 'bg-[#EAF2FA]/75 border border-[#C6A35E]/55'
                  : isHovered
                    ? 'bg-[#EAF2FA]/60 border border-[#1769AA]/30'
                    : 'bg-white/90 border border-[#E6EEF8]'
              } focus:outline-none focus:ring-2 focus:ring-[#1769AA]/40 cursor-pointer`}
            >
              {/* 1. Channel Name & Rank (Right side in RTL) */}
              <div className={`${isPrint ? 'col-span-3' : 'col-span-4 sm:col-span-3'} flex items-center gap-1 min-w-0`}>
                <span
                  className={`${isPrint ? 'w-4 h-4 text-[9px]' : 'w-5 h-5 text-[10px]'} rounded-md font-extrabold flex items-center justify-center shrink-0 tabular-nums ${
                    row.isTopChannel
                      ? 'bg-[#0C2544] text-[#DFC076] border border-[#C6A35E]'
                      : 'bg-[#EAF2FA] text-[#0C2544]'
                  }`}
                  dir="ltr"
                >
                  {formatNumber(row.rank)}
                </span>
                <span
                  className={`${
                    isPrint ? 'text-[9.5px]' : 'text-xs'
                  } font-extrabold text-[#0C2544] truncate`}
                  title={row.nameAr}
                >
                  {row.nameAr}
                </span>
                {row.isTopChannel && !isPrint && (
                  <Award
                    className="w-3.5 h-3.5 text-[#C6A35E] shrink-0 hidden sm:inline-block"
                    aria-label="القناة الأعلى طلباً"
                  />
                )}
              </div>

              {/* 2. Horizontal Bar Track (Middle) */}
              <div className={`${isPrint ? 'col-span-5' : 'col-span-4 sm:col-span-6'} flex items-center`}>
                <div
                  className={`w-full ${
                    isPrint ? 'h-3' : 'h-5'
                  } rounded-md bg-[#EAF2FA] border border-[#D5E4F4] overflow-hidden p-0.5 flex items-center`}
                >
                  {row.requestCount > 0 ? (
                    <div
                      className="h-full rounded-xs transition-all duration-300 relative"
                      style={{
                        width: `${row.widthPct}%`,
                        background: getBarBackground(row),
                        boxShadow: row.isTopChannel ? '0 0 0 1px rgba(198, 163, 94, 0.5)' : undefined,
                      }}
                    />
                  ) : (
                    <div
                      className="h-full w-1 rounded-xs bg-slate-300"
                      title="0 طلباً"
                    />
                  )}
                </div>
              </div>

              {/* 3. Numeric Value & Share Percentage (Left side in RTL) */}
              <div className={`${isPrint ? 'col-span-4' : 'col-span-4 sm:col-span-3'} flex items-center justify-end gap-1 shrink-0`}>
                <span
                  className={`${
                    isPrint ? 'text-[9.5px]' : 'text-xs'
                  } font-extrabold text-[#0C2544] tabular-nums whitespace-nowrap`}
                  dir="ltr"
                >
                  {formatNumber(row.requestCount)}
                </span>
                <span className={`${isPrint ? 'text-[9px] inline' : 'text-[10px] hidden sm:inline'} font-semibold text-slate-500 whitespace-nowrap`}>
                  طلباً
                </span>
                <span className="text-slate-300 text-[9px]" aria-hidden="true">
                  —
                </span>
                <span
                  className={`${isPrint ? 'min-w-[40px] px-1 text-[9.5px]' : 'min-w-[46px] px-1.5 text-[10.5px]'} text-center py-0.5 rounded font-extrabold tabular-nums whitespace-nowrap ${
                    row.isTopChannel
                      ? 'bg-[#0C2544] text-[#DFC076] border border-[#C6A35E]/60'
                      : row.requestCount > 0
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
