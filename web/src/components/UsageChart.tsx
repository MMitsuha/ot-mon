"use client";

import { useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
  ReferenceArea,
} from "recharts";

interface UsageChartProps {
  data: { timestamp: string; value: number }[];
  color: string;
  label: string;
  avg: number;
  hours: number;
  unit?: string;
  domain?: [number, number];
  formatter?: (v: number) => string;
}

interface Gap {
  x1: number;
  x2: number;
}

function formatTickTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTooltipTime(ts: number): string {
  return new Date(ts).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function generateTicks(start: number, end: number, count: number): number[] {
  const step = (end - start) / count;
  const ticks: number[] = [];
  for (let i = 0; i <= count; i++) {
    ticks.push(Math.round(start + step * i));
  }
  return ticks;
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

function buildChartData(
  data: { timestamp: string; value: number }[],
  hours: number
): { points: { ts: number; value: number | null }[]; gaps: Gap[]; domainMax: number } {
  if (data.length === 0) return { points: [], gaps: [], domainMax: 0 };

  const raw = data.map((d) => ({
    ts: new Date(d.timestamp).getTime(),
    value: d.value as number | null,
  }));

  const threshold = getExpectedIntervalMs(hours) * 2.5;
  const gaps: Gap[] = [];
  const points: { ts: number; value: number | null }[] = [raw[0]];

  for (let i = 1; i < raw.length; i++) {
    const delta = raw[i].ts - raw[i - 1].ts;
    if (delta > threshold) {
      gaps.push({ x1: raw[i - 1].ts, x2: raw[i].ts });
      points.push({ ts: raw[i - 1].ts + 1, value: null });
    }
    points.push(raw[i]);
  }

  // Trailing gap
  const now = Date.now();
  const lastTs = raw[raw.length - 1].ts;
  if (now - lastTs > threshold) {
    gaps.push({ x1: lastTs, x2: now });
  }

  const domainMax = Math.max(
    raw[raw.length - 1].ts,
    ...gaps.map((g) => g.x2)
  );

  return { points, gaps, domainMax };
}

export default function UsageChart({
  data,
  color,
  label,
  avg,
  hours,
  unit = "%",
  domain = [0, 100],
  formatter,
}: UsageChartProps) {
  const { points: chartData, gaps, domainMax: builtMax } = useMemo(
    () => buildChartData(data, hours),
    [data, hours]
  );

  const { domainMin, domainMax, ticks } = useMemo(() => {
    if (chartData.length === 0) {
      return { domainMin: 0, domainMax: 1, ticks: [] as number[] };
    }
    const min = chartData[0].ts;
    const max = builtMax;
    return {
      domainMin: min,
      domainMax: max,
      ticks: generateTicks(min, max, getTickCount(hours)),
    };
  }, [chartData, builtMax, hours]);

  const fmt = formatter ?? ((v: number) => `${v.toFixed(1)}${unit}`);

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
    <ResponsiveContainer width="100%" height={192}>
      <AreaChart data={chartData}>
        <defs>
          <linearGradient id={`grad-${label}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.25} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
          <pattern
            id={`gapPat-${label}`}
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
          domain={domain}
          tickFormatter={fmt}
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
          formatter={(v) => [fmt(Number(v)), label]}
        />
        {gaps.map((gap, i) => (
          <ReferenceArea
            key={`gap-${i}`}
            x1={gap.x1}
            x2={gap.x2}
            fill={`url(#gapPat-${label})`}
            fillOpacity={1}
            stroke="#2a2a2a"
            strokeDasharray="4 2"
          />
        ))}
        {avg > 0 && (
          <ReferenceLine
            y={avg}
            stroke={color}
            strokeDasharray="6 4"
            strokeOpacity={0.5}
            label={{
              value: `Avg ${fmt(avg)}`,
              fill: color,
              fontSize: 10,
              position: "insideTopRight",
            }}
          />
        )}
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          fill={`url(#grad-${label})`}
          strokeWidth={1.5}
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
