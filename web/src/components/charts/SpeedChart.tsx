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
import { SpeedDataPoint } from "@/lib/types";
import { formatSpeed } from "@/lib/format";
import {
  formatTickTime,
  formatTooltipTime,
  detectGaps,
  computeDomain,
  TOOLTIP_STYLE,
  GAP_PATTERN_PROPS,
} from "@/lib/chart";

interface SpeedChartProps {
  data: SpeedDataPoint[];
  avgDown: number;
  avgUp: number;
  hours: number;
  fullscreen?: boolean;
  yAxisWidth?: number;
}

interface ChartPoint {
  ts: number;
  totalDownSpeed: number | null;
  totalUpSpeed: number | null;
}

export default function SpeedChart({
  data,
  avgDown,
  avgUp,
  hours,
  fullscreen,
  yAxisWidth = 85,
}: SpeedChartProps) {
  const { chartData, gaps, domainMin, domainMax, ticks } = useMemo(() => {
    if (data.length === 0) {
      return {
        chartData: [] as ChartPoint[],
        gaps: [],
        domainMin: 0,
        domainMax: 1,
        ticks: [] as number[],
      };
    }

    const raw: ChartPoint[] = data.map((d) => ({
      ts: new Date(d.timestamp).getTime(),
      totalDownSpeed: d.totalDownSpeed as number | null,
      totalUpSpeed: d.totalUpSpeed as number | null,
    }));

    const timestamps = raw.map((r) => r.ts);
    const { gaps, domainMax, nullInsertIndices } = detectGaps(timestamps, hours);

    const points: ChartPoint[] = [];
    for (let i = 0; i < raw.length; i++) {
      if (nullInsertIndices.has(i)) {
        points.push({ ts: raw[i - 1].ts + 1, totalDownSpeed: null, totalUpSpeed: null });
      }
      points.push(raw[i]);
    }

    const { domainMin, domainMax: dMax, ticks } = computeDomain(raw[0].ts, domainMax, hours);

    return { chartData: points, gaps, domainMin, domainMax: dMax, ticks };
  }, [data, hours]);

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-80 gap-3">
        <div className="flex items-end gap-1">
          {Array.from({ length: 24 }).map((_, i) => (
            <div
              key={i}
              className="w-1.5 rounded-full bg-[#222]"
              style={{
                height: `${Math.round(20 + Math.sin(i * 0.5) * 16 + Math.sin(i * 1.3) * 8)}px`,
              }}
            />
          ))}
        </div>
        <p className="text-sm text-[#555]">Waiting for data...</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={fullscreen ? "100%" : 320}>
      <AreaChart data={chartData}>
        <defs>
          <linearGradient id="downGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="upGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
          </linearGradient>
          <pattern id="gapPattern" {...GAP_PATTERN_PROPS}>
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
          tick={{ fill: "#888", fontSize: 12 }}
        />
        <YAxis
          tickFormatter={formatSpeed}
          stroke="#555"
          tick={{ fill: "#888", fontSize: 12 }}
          width={yAxisWidth}
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          labelFormatter={(label) => formatTooltipTime(Number(label))}
          formatter={(value, name) => [
            formatSpeed(Number(value)),
            name === "totalDownSpeed" ? "Download" : "Upload",
          ]}
        />
        {gaps.map((gap, i) => (
          <ReferenceArea
            key={`gap-${i}`}
            x1={gap.x1}
            x2={gap.x2}
            fill="url(#gapPattern)"
            fillOpacity={1}
            stroke="#2a2a2a"
            strokeDasharray="4 2"
          />
        ))}
        {avgDown > 0 && (
          <ReferenceLine
            y={avgDown}
            stroke="#0ea5e9"
            strokeDasharray="6 4"
            strokeOpacity={0.5}
            label={{
              value: `Avg ↓ ${formatSpeed(avgDown)}`,
              fill: "#0ea5e9",
              fontSize: 11,
              position: "insideTopRight",
            }}
          />
        )}
        {avgUp > 0 && (
          <ReferenceLine
            y={avgUp}
            stroke="#8b5cf6"
            strokeDasharray="6 4"
            strokeOpacity={0.5}
            label={{
              value: `Avg ↑ ${formatSpeed(avgUp)}`,
              fill: "#8b5cf6",
              fontSize: 11,
              position: "insideBottomRight",
            }}
          />
        )}
        <Area
          type="monotone"
          dataKey="totalDownSpeed"
          stroke="#0ea5e9"
          fill="url(#downGrad)"
          strokeWidth={2}
          dot={false}
          name="totalDownSpeed"
        />
        <Area
          type="monotone"
          dataKey="totalUpSpeed"
          stroke="#8b5cf6"
          fill="url(#upGrad)"
          strokeWidth={2}
          dot={false}
          name="totalUpSpeed"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
