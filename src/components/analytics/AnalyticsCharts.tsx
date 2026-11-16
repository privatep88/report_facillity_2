import React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  FaultParetoRow,
  PeriodTimelineRow,
  ServiceAnalyticsRow,
  SitePerformanceRow,
} from '../../services/AnalyticsEngineService.ts';
import type { MaintenanceCategory } from '../../types/report.ts';
import { formatAed, formatNumber, formatPct } from '../../utils/calculations.ts';
import { getServiceVisual } from '../../utils/serviceVisuals.tsx';
import { LogisticsHorizontalChart } from '../LogisticsHorizontalChart.tsx';

export const CORP_PALETTE = [
  '#0B2341',
  '#1769AA',
  '#069B74',
  '#C8A85D',
  '#0284C7',
  '#D97706',
  '#6366F1',
  '#0D9488',
  '#B45309',
  '#2563EB',
  '#475569',
];

interface CustomTooltipPayloadItem {
  name?: string;
  value?: number | string;
  color?: string;
  dataKey?: string;
}

const DarkNavyTooltip: React.FC<{
  active?: boolean;
  payload?: CustomTooltipPayloadItem[];
  label?: string;
  unitSuffix?: string;
  isCurrency?: boolean;
}> = ({ active, payload, label, unitSuffix = '', isCurrency = false }) => {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div
      dir="rtl"
      className="rounded-lg bg-[#0B2341] text-white border border-[#C8A85D]/60 shadow-xl px-3 py-2 text-xs z-50 max-w-[260px]"
    >
      {label && (
        <p className="font-bold text-[#F0D38C] border-b border-white/15 pb-1 mb-1.5 truncate">
          {label}
        </p>
      )}
      <div className="space-y-1">
        {payload.map((entry, idx) => {
          const numVal = Number(entry.value ?? 0);
          const isPct =
            String(entry.dataKey || '').toLowerCase().includes('pct') ||
            String(entry.name || '').includes('%');
          const formatted = isPct
            ? `${numVal.toFixed(1)}%`
            : isCurrency && !String(entry.name || '').includes('عطل')
              ? formatAed(numVal)
              : `${formatNumber(numVal)}${unitSuffix ? ` ${unitSuffix}` : ''}`;
          return (
            <div key={idx} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 text-slate-200 truncate">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: entry.color || '#C8A85D' }}
                />
                {entry.name}
              </span>
              <span dir="ltr" className="font-bold tabular-nums text-white shrink-0">
                {formatted}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const EmptyChartState: React.FC<{ message: string; hint?: string }> = ({ message, hint }) => (
  <div className="py-10 px-4 text-center rounded-xl bg-slate-50 border border-dashed border-slate-200">
    <p className="text-xs font-bold text-[#0B2341]">{message}</p>
    {hint && <p className="text-[11px] text-slate-500 mt-1">{hint}</p>}
  </div>
);

export const ServicesHorizontalBarChart: React.FC<{ rows: ServiceAnalyticsRow[] }> = ({ rows }) => {
  const data = [...rows]
    .filter((r) => r.receivedCount > 0 || r.executedCount > 0)
    .sort((a, b) => b.receivedCount - a.receivedCount)
    .map((r) => ({
      name: r.nameAr,
      المستلمة: r.receivedCount,
      المنفذة: r.executedCount,
    }));

  if (data.length === 0) {
    return (
      <EmptyChartState
        message="لا توجد طلبات خدمات مسجلة في النطاق الحالي"
        hint="جرّب تغيير معايير التصفية أو إدخال بيانات الطلبات في التقرير الشهري."
      />
    );
  }

  const height = Math.max(240, data.length * 34);
  return (
    <div style={{ height }} className="w-full" dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 8, right: 20, left: 16, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" horizontal={false} />
          <XAxis type="number" domain={[0, 'auto']} tick={{ fontSize: 11, fill: '#475569' }} />
          <YAxis
            type="category"
            dataKey="name"
            width={145}
            tick={{ fontSize: 11, fill: '#0B2341', fontWeight: 600 }}
          />
          <Tooltip content={<DarkNavyTooltip unitSuffix="طلب" />} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="المستلمة" fill="#1769AA" radius={[0, 4, 4, 0]} barSize={12} />
          <Bar dataKey="المنفذة" fill="#069B74" radius={[0, 4, 4, 0]} barSize={12} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export const ServicesShareDonutChart: React.FC<{ rows: ServiceAnalyticsRow[] }> = ({ rows }) => {
  const active = rows.filter((r) => r.receivedCount > 0);
  if (active.length === 0) {
    return <EmptyChartState message="لا توجد طلبات مستلمة لعرض التوزيع النسبي" />;
  }
  const total = active.reduce((s, r) => s + r.receivedCount, 0);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
      <div className="sm:col-span-6 h-56 relative" dir="ltr">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={active}
              dataKey="receivedCount"
              nameKey="nameAr"
              innerRadius={52}
              outerRadius={82}
              paddingAngle={2}
            >
              {active.map((entry, idx) => (
                <Cell
                  key={entry.serviceId}
                  fill={getServiceVisual(entry.serviceId, entry.nameAr, idx).color}
                />
              ))}
            </Pie>
            <Tooltip content={<DarkNavyTooltip unitSuffix="طلب" />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[10px] font-semibold text-slate-500">الإجمالي</span>
          <span dir="ltr" className="text-base font-extrabold text-[#0B2341] tabular-nums">
            {formatNumber(total)}
          </span>
        </div>
      </div>
      <div className="sm:col-span-6 space-y-1.5 max-h-56 overflow-y-auto fm-scroll pe-1">
        {[...active]
          .sort((a, b) => b.receivedCount - a.receivedCount)
          .map((item, idx) => {
            const color = getServiceVisual(item.serviceId, item.nameAr, idx).color;
            return (
              <div
                key={item.serviceId}
                className="flex items-center justify-between gap-2 text-xs py-1 px-2 rounded bg-slate-50 border border-slate-100"
              >
                <span className="flex items-center gap-1.5 font-semibold text-[#0B2341] truncate">
                  <span className="w-2.5 h-2.5 rounded-xs shrink-0" style={{ backgroundColor: color }} />
                  <span className="truncate">{item.nameAr}</span>
                </span>
                <span dir="ltr" className="tabular-nums font-bold text-slate-700 shrink-0">
                  {formatNumber(item.receivedCount)} ({formatPct(item.shareOfTotalPct, '0.0%')})
                </span>
              </div>
            );
          })}
      </div>
    </div>
  );
};

export const ServicesTrendLineChart: React.FC<{
  seriesKeys: Array<{ serviceId: string; nameAr: string }>;
  seriesData: Array<Record<string, number | string>>;
}> = ({ seriesKeys, seriesData }) => {
  if (seriesData.length < 2) {
    return (
      <EmptyChartState
        message="يتطلب الرسم الزمني المتعدد توفر فترتين شهريتين على الأقل"
        hint="تتوفر حالياً فترة واحدة في النطاق المختار؛ تظهر الأرقام الفعلية في الجدول التفصيلي أدناه."
      />
    );
  }
  return (
    <div className="h-64 w-full" dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={seriesData} margin={{ top: 10, right: 16, left: 4, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
          <XAxis dataKey="labelAr" tick={{ fontSize: 11, fill: '#0B2341' }} />
          <YAxis domain={[0, 'auto']} tick={{ fontSize: 11, fill: '#475569' }} />
          <Tooltip content={<DarkNavyTooltip unitSuffix="طلب" />} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {seriesKeys.map((k, idx) => (
            <Line
              key={k.serviceId}
              type="monotone"
              dataKey={k.serviceId}
              name={k.nameAr}
              stroke={getServiceVisual(k.serviceId, k.nameAr, idx).color}
              strokeWidth={2.2}
              dot={{ r: 3.5 }}
              activeDot={{ r: 5 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export const MaintenanceParetoChart: React.FC<{ rows: FaultParetoRow[] }> = ({ rows }) => {
  const active = rows.filter((r) => r.faultCount > 0);
  if (active.length === 0) {
    return (
      <EmptyChartState
        message="لا توجد أعطال صيانة مسجلة لرسم مخطط باريتو"
        hint="عند تسجيل أعطال الصيانة حسب الفئات سيظهر هنا الترتيب التنازلي والنسبة التراكمية (Pareto)."
      />
    );
  }
  return (
    <div className="h-72 w-full" dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={active} margin={{ top: 12, right: 12, left: 4, bottom: 38 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
          <XAxis
            dataKey="nameAr"
            tick={{ fontSize: 10, fill: '#0B2341' }}
            interval={0}
            angle={-22}
            textAnchor="end"
            height={58}
          />
          <YAxis
            yAxisId="left"
            domain={[0, 'auto']}
            tick={{ fontSize: 11, fill: '#0B2341' }}
            allowDecimals={false}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            domain={[0, 100]}
            tickFormatter={(v) => `${v}%`}
            tick={{ fontSize: 11, fill: '#B38A3A' }}
          />
          <Tooltip content={<DarkNavyTooltip unitSuffix="عطل" />} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar
            yAxisId="left"
            dataKey="faultCount"
            name="عدد الأعطال"
            fill="#1769AA"
            radius={[4, 4, 0, 0]}
            barSize={26}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="cumulativePct"
            name="التراكمي %"
            stroke="#C8A85D"
            strokeWidth={2.5}
            dot={{ r: 3.5, fill: '#C8A85D' }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};

export const MaintenanceHeatmapMatrix: React.FC<{
  sites: SitePerformanceRow[];
  categories: MaintenanceCategory[];
}> = ({ sites, categories }) => {
  let maxCell = 0;
  for (const s of sites) {
    for (const c of categories) {
      const v = s.categoryBreakdown[c.id] || 0;
      if (v > maxCell) maxCell = v;
    }
  }

  const getHeatClass = (val: number) => {
    if (val === 0 || maxCell === 0) return 'bg-slate-50 text-slate-400';
    const ratio = val / maxCell;
    if (ratio >= 0.75) return 'bg-[#C43D47] text-white font-extrabold';
    if (ratio >= 0.45) return 'bg-amber-200 text-[#0B2341] font-bold';
    if (ratio >= 0.2) return 'bg-sky-100 text-[#0B2341] font-semibold';
    return 'bg-sky-50 text-slate-700 font-medium';
  };

  if (sites.length === 0 || categories.length === 0) {
    return <EmptyChartState message="لا توجد مقرات أو فئات صيانة مفعلة للعرض" />;
  }

  return (
    <div className="overflow-x-auto fm-scroll rounded-lg border border-slate-200">
      <table className="w-full text-[11px] border-collapse">
        <thead className="bg-[#0B2341] text-white">
          <tr>
            <th className="py-2 px-2.5 text-start font-bold min-w-[130px] sticky right-0 bg-[#0B2341] z-10">
              المقر / الفئة
            </th>
            {categories.map((cat) => (
              <th key={cat.id} className="py-2 px-1.5 text-center font-semibold min-w-[68px]">
                {cat.nameAr}
              </th>
            ))}
            <th className="py-2 px-2 text-center font-bold bg-[#1769AA] min-w-[64px]">الإجمالي</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {sites.map((site) => (
            <tr key={site.siteId} className="hover:bg-slate-50/70">
              <td className="py-1.5 px-2.5 font-bold text-[#0B2341] bg-white sticky right-0 border-l border-slate-200 z-10">
                {site.nameAr}
              </td>
              {categories.map((cat) => {
                const val = site.categoryBreakdown[cat.id] || 0;
                return (
                  <td
                    key={cat.id}
                    dir="ltr"
                    className={`py-1.5 px-1 text-center tabular-nums border-l border-slate-100 ${getHeatClass(
                      val
                    )}`}
                  >
                    {formatNumber(val)}
                  </td>
                );
              })}
              <td
                dir="ltr"
                className="py-1.5 px-2 text-center font-extrabold tabular-nums bg-[#EAF4FC] text-[#0B2341]"
              >
                {formatNumber(site.faultCount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export const FinancialCategoryChart: React.FC<{ rows: FaultParetoRow[] }> = ({ rows }) => {
  const active = rows.filter((r) => r.totalCostAed > 0);
  if (active.length === 0) {
    return (
      <EmptyChartState
        message="لا توجد تكاليف صيانة مقيدة بالدرهم (AED) في النطاق الحالي"
        hint="تظهر الرسوم المالية فور إدخال مبالغ النثرية أو أوامر الشراء في مصفوفة الصيانة."
      />
    );
  }

  return (
    <div className="h-64 w-full" dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={active} margin={{ top: 10, right: 14, left: 8, bottom: 34 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
          <XAxis
            dataKey="nameAr"
            tick={{ fontSize: 10, fill: '#0B2341' }}
            interval={0}
            angle={-18}
            textAnchor="end"
            height={52}
          />
          <YAxis domain={[0, 'auto']} tick={{ fontSize: 11, fill: '#475569' }} />
          <Tooltip content={<DarkNavyTooltip isCurrency />} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar
            dataKey="pettyCashAed"
            name="النثرية (AED)"
            stackId="cost"
            fill="#C8A85D"
            radius={[0, 0, 0, 0]}
          />
          <Bar
            dataKey="purchaseOrderAed"
            name="أمر الشراء (AED)"
            stackId="cost"
            fill="#0B2341"
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export const LogisticsChannelsChart: React.FC<{
  channels: Array<{ channelKey: string; nameAr: string; requestCount: number; sharePct: number | null }>;
}> = ({ channels }) => {
  return <LogisticsHorizontalChart channels={channels} />;
};

export const TasksStatusChart: React.FC<{
  distribution: Array<{ status: string; labelAr: string; count: number }>;
}> = ({ distribution }) => {
  const active = distribution.filter((d) => d.count > 0);
  if (active.length === 0) {
    return <EmptyChartState message="لا توجد مهام تشغيلية مسجلة في النطاق الحالي" />;
  }
  const colorMap: Record<string, string> = {
    completed: '#069B74',
    in_progress: '#1769AA',
    not_started: '#64748B',
    delayed: '#C43D47',
    paused: '#D97706',
  };
  return (
    <div className="h-56 w-full" dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={active}
            dataKey="count"
            nameKey="labelAr"
            innerRadius={42}
            outerRadius={74}
            paddingAngle={2}
          >
            {active.map((entry) => (
              <Cell key={entry.status} fill={colorMap[entry.status] || '#1769AA'} />
            ))}
          </Pie>
          <Tooltip content={<DarkNavyTooltip unitSuffix="مهمة" />} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};

export const TimelineComparisonChart: React.FC<{ timeline: PeriodTimelineRow[] }> = ({ timeline }) => {
  if (timeline.length === 0) {
    return <EmptyChartState message="لا توجد فترات زمنية في النطاق المحدد" />;
  }
  return (
    <div className="h-64 w-full" dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={timeline} margin={{ top: 10, right: 16, left: 4, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
          <XAxis dataKey="labelAr" tick={{ fontSize: 11, fill: '#0B2341' }} />
          <YAxis yAxisId="left" domain={[0, 'auto']} tick={{ fontSize: 11, fill: '#475569' }} />
          <YAxis
            yAxisId="right"
            orientation="right"
            domain={[0, 'auto']}
            tick={{ fontSize: 11, fill: '#C8A85D' }}
          />
          <Tooltip content={<DarkNavyTooltip />} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar yAxisId="left" dataKey="received" name="الطلبات المستلمة" fill="#1769AA" radius={[4, 4, 0, 0]} barSize={22} />
          <Bar yAxisId="left" dataKey="executed" name="الطلبات المنفذة" fill="#069B74" radius={[4, 4, 0, 0]} barSize={22} />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="faults"
            name="الأعطال"
            stroke="#C43D47"
            strokeWidth={2.5}
            dot={{ r: 4 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};
