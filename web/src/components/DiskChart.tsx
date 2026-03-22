"use client";

import { useMemo, useState, useCallback } from "react";
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
} from "recharts";
import { DiskDataPoint } from "@/lib/types";
import { formatKbps, formatMs, formatPercent, formatBytes } from "@/lib/format";

interface DiskChartProps {
  sn: string;
  diskType: string;
  totalCapacity: number;
  data: DiskDataPoint[];
  hours: number;
}

interface Gap {
  x1: number;
  x2: number;
}

const SERIES = [
  { key: "rkbs", label: "Read", color: "#0ea5e9", axis: "left", type: "area", defaultOn: true },
  { key: "wkbs", label: "Write", color: "#8b5cf6", axis: "left", type: "area", defaultOn: true },
  { key: "rAwait", label: "R Await", color: "#f59e0b", axis: "right", type: "line", defaultOn: false },
  { key: "wAwait", label: "W Await", color: "#ef4444", axis: "right", type: "line", defaultOn: false },
  { key: "svctm", label: "Svctm", color: "#10b981", axis: "right", type: "line", defaultOn: false },
  { key: "util", label: "Util %", color: "#06b6d4", axis: "right", type: "line", defaultOn: false },
] as const;

function formatTickTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatTooltipTime(ts: number): string {
  return new Date(ts).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function generateTicks(start: number, end: number, count: number): number[] {
  const step = (end - start) / count;
  return Array.from({ length: count + 1 }, (_, i) => Math.round(start + step * i));
}

function getTickCount(hours: number): number {
  if (hours <= 1) return 6;
  if (hours <= 6) return 6;
  if (hours <= 24) return 8;
  return 7;
}

function getExpectedIntervalMs(hours: number): number {
  if (hours <= 1) return 1 * 60_000;
  if (hours <= 6) return 2 * 60_000;
  if (hours <= 24) return 5 * 60_000;
  if (hours <= 168) return 30 * 60_000;
  return 60 * 60_000;
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

function buildChartData(
  data: DiskDataPoint[],
  hours: number
): { points: ChartPoint[]; gaps: Gap[]; domainMax: number } {
  if (data.length === 0) return { points: [], gaps: [], domainMax: 0 };

  const raw: ChartPoint[] = data.map((d) => ({
    ts: new Date(d.timestamp).getTime(),
    rkbs: d.rkbs,
    wkbs: d.wkbs,
    rAwait: d.rAwait,
    wAwait: d.wAwait,
    svctm: d.svctm,
    util: d.util,
  }));

  const threshold = getExpectedIntervalMs(hours) * 2.5;
  const gaps: Gap[] = [];
  const points: ChartPoint[] = [raw[0]];

  for (let i = 1; i < raw.length; i++) {
    const delta = raw[i].ts - raw[i - 1].ts;
    if (delta > threshold) {
      gaps.push({ x1: raw[i - 1].ts, x2: raw[i].ts });
      points.push({
        ts: raw[i - 1].ts + 1,
        rkbs: null, wkbs: null, rAwait: null, wAwait: null, svctm: null, util: null,
      });
    }
    points.push(raw[i]);
  }

  // Trailing gap
  const now = Date.now();
  const lastTs = raw[raw.length - 1].ts;
  if (now - lastTs > threshold) {
    gaps.push({ x1: lastTs, x2: now });
  }

  const domainMax = Math.max(raw[raw.length - 1].ts, ...gaps.map((g) => g.x2));
  return { points, gaps, domainMax };
}

function tooltipFormatter(value: number, name: string): [string, string] {
  const series = SERIES.find((s) => s.key === name);
  if (!series) return [String(value), name];
  const label = series.label;
  if (series.axis === "left") return [formatKbps(value), label];
  if (series.key === "util") return [formatPercent(value), label];
  return [formatMs(value), label];
}

export default function DiskChart({ sn, diskType, totalCapacity, data, hours }: DiskChartProps) {
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(
    () => new Set(SERIES.filter((s) => !s.defaultOn).map((s) => s.key))
  );

  const toggleSeries = useCallback((key: string) => {
    setHiddenSeries((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const { points: chartData, gaps, domainMax: builtMax } = useMemo(
    () => buildChartData(data, hours),
    [data, hours]
  );

  const { domainMin, domainMax, ticks } = useMemo(() => {
    if (chartData.length === 0) return { domainMin: 0, domainMax: 1, ticks: [] as number[] };
    const min = chartData[0].ts;
    return {
      domainMin: min,
      domainMax: builtMax,
      ticks: generateTicks(min, builtMax, getTickCount(hours)),
    };
  }, [chartData, builtMax, hours]);

  // Latest used for capacity bar
  const latestUsed = data.length > 0 ? data[data.length - 1].used : 0;
  const usedPercent = totalCapacity > 0 ? (latestUsed / totalCapacity) * 100 : 0;

  if (data.length === 0) {
    return (
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
    );
  }

  return (
    <div>
      {/* Header: SN + type badge + capacity bar */}
      <div className="mb-3 flex items-center gap-3 flex-nowrap min-w-0">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#888" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="1" y="4" width="14" height="8" rx="2" />
          <line x1="4" y1="7" x2="4" y2="9" />
          <line x1="7" y1="7" x2="7" y2="9" />
        </svg>
        <span className="text-sm font-semibold text-[#ededed] font-mono truncate min-w-0">{sn}</span>
        {diskType && (
          <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-[#222] text-[#888] uppercase">
            {diskType}
          </span>
        )}
        {/* Capacity bar */}
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <span className="text-xs text-[#666] whitespace-nowrap">
            {formatBytes(latestUsed)} / {formatBytes(totalCapacity)}
          </span>
          <div className="h-2 w-24 rounded-full bg-[#222] overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(usedPercent, 100)}%`,
                backgroundColor: usedPercent > 90 ? "#ef4444" : usedPercent > 70 ? "#f59e0b" : "#10b981",
              }}
            />
          </div>
          <span className="text-xs text-[#666]">{usedPercent.toFixed(1)}%</span>
        </div>
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={chartData}>
          <defs>
            <linearGradient id={`dg-rkbs-${sn}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0} />
            </linearGradient>
            <linearGradient id={`dg-wkbs-${sn}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
            </linearGradient>
            <pattern
              id={`dgap-${sn}`}
              width="6"
              height="6"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
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
            width={60}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tickFormatter={(v: number) => {
              // Show ms or % depending on visible series
              const hasUtil = !hiddenSeries.has("util");
              const hasAwait = !hiddenSeries.has("rAwait") || !hiddenSeries.has("wAwait") || !hiddenSeries.has("svctm");
              if (hasUtil && !hasAwait) return formatPercent(v);
              return formatMs(v);
            }}
            stroke="#555"
            tick={{ fill: "#888", fontSize: 11 }}
            width={52}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#111",
              border: "1px solid #333",
              borderRadius: 8,
              color: "#ededed",
            }}
            labelFormatter={(l) => formatTooltipTime(Number(l))}
            formatter={(value, name) => tooltipFormatter(Number(value), String(name))}
          />
          <Legend
            onClick={(e) => toggleSeries(String(e.dataKey))}
            wrapperStyle={{ cursor: "pointer", fontSize: 11 }}
            formatter={(value, entry) => {
              const key = String(entry.dataKey);
              const isHidden = hiddenSeries.has(key);
              return <span style={{ color: isHidden ? "#555" : entry.color, textDecoration: isHidden ? "line-through" : "none" }}>{value}</span>;
            }}
          />
          {/* Gap areas */}
          {gaps.map((gap, i) => (
            <ReferenceArea
              key={`gap-${i}`}
              x1={gap.x1}
              x2={gap.x2}
              yAxisId="left"
              fill={`url(#dgap-${sn})`}
              fillOpacity={1}
              stroke="#2a2a2a"
              strokeDasharray="4 2"
            />
          ))}
          {/* Default ON: read/write throughput */}
          <Area
            yAxisId="left"
            type="monotone"
            dataKey="rkbs"
            name="Read"
            stroke="#0ea5e9"
            fill={`url(#dg-rkbs-${sn})`}
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
            fill={`url(#dg-wkbs-${sn})`}
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
            yAxisId="right"
            type="monotone"
            dataKey="util"
            name="Util %"
            stroke="#06b6d4"
            strokeWidth={1.5}
            dot={false}
            hide={hiddenSeries.has("util")}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
