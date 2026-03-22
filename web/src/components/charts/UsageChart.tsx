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
import {
  detectGaps,
  computeDomain,
  formatTickTime,
  formatTooltipTime,
  TOOLTIP_STYLE,
  GAP_PATTERN_PROPS,
} from "@/lib/chart";

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
  const { chartData, gaps, domainMin, domainMax, ticks } = useMemo(() => {
    if (data.length === 0) {
      return {
        chartData: [] as { ts: number; value: number | null }[],
        gaps: [],
        domainMin: 0,
        domainMax: 1,
        ticks: [] as number[],
      };
    }

    const raw = data.map((d) => ({
      ts: new Date(d.timestamp).getTime(),
      value: d.value as number | null,
    }));
    const timestamps = raw.map((r) => r.ts);
    const { gaps, domainMax, nullInsertIndices } = detectGaps(timestamps, hours);

    const points: { ts: number; value: number | null }[] = [];
    for (let i = 0; i < raw.length; i++) {
      if (nullInsertIndices.has(i)) {
        points.push({ ts: raw[i - 1].ts + 1, value: null });
      }
      points.push(raw[i]);
    }

    const { domainMin, ticks } = computeDomain(raw[0].ts, domainMax, hours);

    return { chartData: points, gaps, domainMin, domainMax, ticks };
  }, [data, hours]);

  const fmt = formatter ?? ((v: number) => `${v.toFixed(1)}${unit}`);

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-2">
        <div className="flex items-end gap-0.5">
          {Array.from({ length: 16 }).map((_, i) => (
            <div
              key={i}
              className="w-1 rounded-full bg-[#222]"
              style={{
                height: `${Math.round(12 + Math.sin(i * 0.7) * 10 + Math.sin(i * 1.1) * 5)}px`,
              }}
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
          <pattern id={`gapPat-${label}`} {...GAP_PATTERN_PROPS}>
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
          contentStyle={TOOLTIP_STYLE}
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
