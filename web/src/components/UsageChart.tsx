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
} from "recharts";

interface UsageChartProps {
  data: { timestamp: string; value: number }[];
  color: string;
  label: string;
  avg: number;
  unit?: string;
  domain?: [number, number];
  formatter?: (v: number) => string;
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

export default function UsageChart({
  data,
  color,
  label,
  avg,
  unit = "%",
  domain = [0, 100],
  formatter,
}: UsageChartProps) {
  const chartData = useMemo(
    () => data.map((d) => ({ ...d, ts: new Date(d.timestamp).getTime() })),
    [data]
  );

  const fmt = formatter ?? ((v: number) => `${v.toFixed(1)}${unit}`);

  if (chartData.length === 0) {
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
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
        <XAxis
          dataKey="ts"
          type="number"
          scale="time"
          domain={["dataMin", "dataMax"]}
          tickFormatter={formatTickTime}
          stroke="#555"
          tick={{ fill: "#888", fontSize: 11 }}
          interval="preserveStartEnd"
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
