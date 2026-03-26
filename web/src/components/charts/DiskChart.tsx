"use client";

import { useMemo, useState, useCallback, useId } from "react";
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceArea,
  ReferenceLine,
} from "recharts";
import { DiskDataPoint } from "@/lib/types";
import { formatKbps, formatMs, formatPercent } from "@/lib/format";
import {
  detectGaps,
  computeDomain,
  formatTickTime,
  formatTooltipTime,
  TOOLTIP_STYLE,
  GAP_PATTERN_PROPS,
} from "@/lib/chart";

interface DiskChartProps {
  data: DiskDataPoint[];
  hours: number;
}

interface ChartPoint {
  ts: number;
  rkbs: number | null;
  wkbs: number | null;
  rAwait: number | null;
  wAwait: number | null;
  svctm: number | null;
  util: number | null;
}

const SERIES = [
  { key: "rkbs", label: "Read", color: "#0ea5e9", axis: "left", type: "area", defaultOn: true },
  { key: "wkbs", label: "Write", color: "#8b5cf6", axis: "left", type: "area", defaultOn: true },
  { key: "rAwait", label: "R Await", color: "#f59e0b", axis: "right", type: "line", defaultOn: false },
  { key: "wAwait", label: "W Await", color: "#ef4444", axis: "right", type: "line", defaultOn: false },
  { key: "svctm", label: "Svctm", color: "#10b981", axis: "right", type: "line", defaultOn: false },
  { key: "util", label: "Util %", color: "#06b6d4", axis: "right", type: "line", defaultOn: false },
] as const;

function tooltipFormatter(value: number, name: string): [string, string] | null {
  const series = SERIES.find((s) => s.key === name || s.label === name);
  if (!series) return null;
  const label = series.label;
  if (series.axis === "left") return [formatKbps(value), label];
  if (series.key === "util") return [formatPercent(value), label];
  return [formatMs(value), label];
}

export default function DiskChart({ data, hours }: DiskChartProps) {
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(
    () => new Set(SERIES.filter((s) => !s.defaultOn).map((s) => s.key))
  );
  const chartId = useId().replace(/:/g, "");

  const toggleSeries = useCallback((key: string) => {
    setHiddenSeries((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const { points: chartData, gaps, domainMax: builtMax } = useMemo(() => {
    if (data.length === 0) return { points: [] as ChartPoint[], gaps: [], domainMax: 0 };

    const raw: ChartPoint[] = data.map((d) => ({
      ts: new Date(d.timestamp).getTime(),
      rkbs: d.rkbs,
      wkbs: d.wkbs,
      rAwait: d.rAwait,
      wAwait: d.wAwait,
      svctm: d.svctm,
      util: d.util,
    }));

    const timestamps = raw.map((r) => r.ts);
    const { gaps, domainMax, nullInsertIndices } = detectGaps(timestamps, hours);

    const points: ChartPoint[] = [];
    for (let i = 0; i < raw.length; i++) {
      if (nullInsertIndices.has(i)) {
        points.push({ ts: raw[i - 1].ts + 1, rkbs: null, wkbs: null, rAwait: null, wAwait: null, svctm: null, util: null });
      }
      points.push(raw[i]);
    }

    return { points, gaps, domainMax };
  }, [data, hours]);

  const { domainMin, domainMax, ticks } = useMemo(() => {
    if (chartData.length === 0) return { domainMin: 0, domainMax: 1, ticks: [] as number[] };
    const { domainMin, domainMax, ticks } = computeDomain(chartData[0].ts, builtMax, hours);
    return { domainMin, domainMax, ticks };
  }, [chartData, builtMax, hours]);

  const averages = useMemo(() => {
    if (data.length === 0) return { rkbs: 0, wkbs: 0, rAwait: 0, wAwait: 0, svctm: 0, util: 0 };
    const n = data.length;
    return {
      rkbs: data.reduce((s, d) => s + d.rkbs, 0) / n,
      wkbs: data.reduce((s, d) => s + d.wkbs, 0) / n,
      rAwait: data.reduce((s, d) => s + d.rAwait, 0) / n,
      wAwait: data.reduce((s, d) => s + d.wAwait, 0) / n,
      svctm: data.reduce((s, d) => s + d.svctm, 0) / n,
      util: data.reduce((s, d) => s + d.util, 0) / n,
    };
  }, [data]);

  const content =
    data.length === 0 ? (
      <div className="flex flex-col items-center justify-center h-48 gap-2">
        <div className="flex items-end gap-0.5">
          {Array.from({ length: 16 }).map((_, i) => (
            <div
              key={i}
              className="w-1 rounded-full bg-[#222]"
              style={{ height: `${Math.round(12 + Math.sin(i * 0.7) * 10 + Math.sin(i * 1.1) * 5)}px` }}
            />
          ))}
        </div>
        <p className="text-xs text-[#555]">Waiting for data...</p>
      </div>
    ) : (
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={chartData}>
          <defs>
            <linearGradient id={`dg-rkbs-${chartId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0} />
            </linearGradient>
            <linearGradient id={`dg-wkbs-${chartId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
            </linearGradient>
            <pattern
              id={`dgap-${chartId}`}
              {...GAP_PATTERN_PROPS}
            >
              <line x1="0" y1="0" x2="0" y2="6" stroke="#333" strokeWidth="1.5" />
            </pattern>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
          <XAxis
            dataKey="ts"
            type="number"
            scale="time"
            domain={[domainMin, domainMax]}
            ticks={ticks}
            tickFormatter={formatTickTime}
            stroke="#555"
            tick={{ fill: "#888", fontSize: 11 }}
          />
          <YAxis
            yAxisId="left"
            tickFormatter={formatKbps}
            stroke="#555"
            tick={{ fill: "#888", fontSize: 11 }}
            width={90}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tickFormatter={formatMs}
            stroke="#555"
            tick={{ fill: "#888", fontSize: 11 }}
            width={52}
          />
          <YAxis
            yAxisId="right2"
            hide
            domain={[0, 100]}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            labelFormatter={(l) => formatTooltipTime(Number(l))}
            formatter={(value, name) => tooltipFormatter(Number(value), String(name))}
          />
          <Legend
            content={() => (
              <ul style={{ display: "flex", justifyContent: "center", gap: 12, listStyle: "none", margin: 0, padding: "8px 0 0", fontSize: 11 }}>
                {SERIES.map((s) => {
                  const isHidden = hiddenSeries.has(s.key);
                  return (
                    <li key={s.key} style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }} onClick={() => toggleSeries(s.key)}>
                      <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: s.type === "area" ? 2 : 0, backgroundColor: s.type === "area" ? s.color : "transparent", borderBottom: s.type === "line" ? `2px solid ${s.color}` : "none", opacity: isHidden ? 0.3 : 1 }} />
                      <span style={{ color: isHidden ? "#555" : s.color, textDecoration: isHidden ? "line-through" : "none" }}>{s.label}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          />
          {/* Gap areas */}
          {gaps.map((gap, i) => (
            <ReferenceArea
              key={`gap-${i}`}
              x1={gap.x1}
              x2={gap.x2}
              yAxisId="right2"
              fill={`url(#dgap-${chartId})`}
              fillOpacity={1}
              stroke="#2a2a2a"
              strokeDasharray="4 2"
            />
          ))}
          {/* Average reference lines */}
          {!hiddenSeries.has("rkbs") && averages.rkbs > 0 && (
            <ReferenceLine yAxisId="left" y={averages.rkbs} stroke="#0ea5e9" strokeDasharray="6 4" strokeOpacity={0.5}
              label={{ value: `Avg ${formatKbps(averages.rkbs)}`, fill: "#0ea5e9", fontSize: 10, position: "insideTopRight" }} />
          )}
          {!hiddenSeries.has("wkbs") && averages.wkbs > 0 && (
            <ReferenceLine yAxisId="left" y={averages.wkbs} stroke="#8b5cf6" strokeDasharray="6 4" strokeOpacity={0.5}
              label={{ value: `Avg ${formatKbps(averages.wkbs)}`, fill: "#8b5cf6", fontSize: 10, position: "insideBottomRight" }} />
          )}
          {!hiddenSeries.has("rAwait") && averages.rAwait > 0 && (
            <ReferenceLine yAxisId="right" y={averages.rAwait} stroke="#f59e0b" strokeDasharray="6 4" strokeOpacity={0.5}
              label={{ value: `Avg ${formatMs(averages.rAwait)}`, fill: "#f59e0b", fontSize: 10, position: "insideTopLeft" }} />
          )}
          {!hiddenSeries.has("wAwait") && averages.wAwait > 0 && (
            <ReferenceLine yAxisId="right" y={averages.wAwait} stroke="#ef4444" strokeDasharray="6 4" strokeOpacity={0.5}
              label={{ value: `Avg ${formatMs(averages.wAwait)}`, fill: "#ef4444", fontSize: 10, position: "insideBottomLeft" }} />
          )}
          {!hiddenSeries.has("svctm") && averages.svctm > 0 && (
            <ReferenceLine yAxisId="right" y={averages.svctm} stroke="#10b981" strokeDasharray="6 4" strokeOpacity={0.5}
              label={{ value: `Avg ${formatMs(averages.svctm)}`, fill: "#10b981", fontSize: 10, position: "insideLeft" }} />
          )}
          {!hiddenSeries.has("util") && averages.util > 0 && (
            <ReferenceLine yAxisId="right2" y={averages.util} stroke="#06b6d4" strokeDasharray="6 4" strokeOpacity={0.5}
              label={{ value: `Avg ${formatPercent(averages.util)}`, fill: "#06b6d4", fontSize: 10, position: "insideTopLeft" }} />
          )}
          {/* Default ON: read/write throughput */}
          <Area
            yAxisId="left"
            type="monotone"
            dataKey="rkbs"
            name="Read"
            stroke="#0ea5e9"
            fill={`url(#dg-rkbs-${chartId})`}
            strokeWidth={1.5}
            dot={false}
            hide={hiddenSeries.has("rkbs")}
          />
          <Area
            yAxisId="left"
            type="monotone"
            dataKey="wkbs"
            name="Write"
            stroke="#8b5cf6"
            fill={`url(#dg-wkbs-${chartId})`}
            strokeWidth={1.5}
            dot={false}
            hide={hiddenSeries.has("wkbs")}
          />
          {/* Default OFF: latency + util */}
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="rAwait"
            name="R Await"
            stroke="#f59e0b"
            strokeWidth={1.5}
            strokeDasharray="4 2"
            dot={false}
            hide={hiddenSeries.has("rAwait")}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="wAwait"
            name="W Await"
            stroke="#ef4444"
            strokeWidth={1.5}
            strokeDasharray="4 2"
            dot={false}
            hide={hiddenSeries.has("wAwait")}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="svctm"
            name="Svctm"
            stroke="#10b981"
            strokeWidth={1.5}
            strokeDasharray="4 2"
            dot={false}
            hide={hiddenSeries.has("svctm")}
          />
          <Line
            yAxisId="right2"
            type="monotone"
            dataKey="util"
            name="Util %"
            stroke="#06b6d4"
            strokeWidth={1.5}
            dot={false}
            hide={hiddenSeries.has("util")}
          />
          <Line
            yAxisId="right2"
            dataKey={() => 0}
            stroke="none"
            dot={false}
            activeDot={false}
            legendType="none"
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    );

  return content;
}
