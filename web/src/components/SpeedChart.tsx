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

interface SpeedChartProps {
  data: SpeedDataPoint[];
  avgDown: number;
  avgUp: number;
  hours: number;
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
  const d = new Date(ts);
  return d.toLocaleString([], {
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

/** Expected bucket interval in ms, matching the API's getInterval() */
function getExpectedIntervalMs(hours: number): number {
  if (hours <= 1) return 1 * 60_000;
  if (hours <= 6) return 2 * 60_000;
  if (hours <= 24) return 5 * 60_000;
  if (hours <= 168) return 30 * 60_000;
  return 60 * 60_000;
}

interface ChartPoint {
  ts: number;
  totalDownSpeed: number | null;
  totalUpSpeed: number | null;
}

function buildChartData(
  data: SpeedDataPoint[],
  hours: number
): { points: ChartPoint[]; gaps: Gap[] } {
  if (data.length === 0) return { points: [], gaps: [] };

  const raw = data.map((d) => ({
    ts: new Date(d.timestamp).getTime(),
    totalDownSpeed: d.totalDownSpeed as number | null,
    totalUpSpeed: d.totalUpSpeed as number | null,
  }));

  const threshold = getExpectedIntervalMs(hours) * 2.5;
  const gaps: Gap[] = [];
  const points: ChartPoint[] = [raw[0]];

  for (let i = 1; i < raw.length; i++) {
    const delta = raw[i].ts - raw[i - 1].ts;
    if (delta > threshold) {
      gaps.push({ x1: raw[i - 1].ts, x2: raw[i].ts });
      // Insert a null point just after the gap starts to break the line
      points.push({
        ts: raw[i - 1].ts + 1,
        totalDownSpeed: null,
        totalUpSpeed: null,
      });
    }
    points.push(raw[i]);
  }

  // Trailing gap: last data point to now
  const now = Date.now();
  const lastTs = raw[raw.length - 1].ts;
  if (now - lastTs > threshold) {
    gaps.push({ x1: lastTs, x2: now });
  }

  return { points, gaps };
}

export default function SpeedChart({
  data,
  avgDown,
  avgUp,
  hours,
}: SpeedChartProps) {
  const { points: chartData, gaps } = useMemo(
    () => buildChartData(data, hours),
    [data, hours]
  );

  const { domainMin, domainMax, ticks } = useMemo(() => {
    if (chartData.length === 0) {
      return {
        domainMin: 0,
        domainMax: 1,
        ticks: [] as number[],
      };
    }
    const min = chartData[0].ts;
    const max = Date.now();
    return {
      domainMin: min,
      domainMax: max,
      ticks: generateTicks(min, max, getTickCount(hours)),
    };
  }, [chartData, hours]);

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-80 gap-3">
        <div className="flex items-end gap-1">
          {Array.from({ length: 24 }).map((_, i) => (
            <div
              key={i}
              className="w-1.5 rounded-full bg-[#222]"
              style={{
                height: `${20 + Math.sin(i * 0.5) * 16 + Math.sin(i * 1.3) * 8}px`,
              }}
            />
          ))}
        </div>
        <p className="text-sm text-[#555]">Waiting for data...</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={320}>
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
          <pattern
            id="gapPattern"
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="6"
              stroke="#333"
              strokeWidth="1.5"
            />
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
          width={80}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "#111",
            border: "1px solid #333",
            borderRadius: 8,
            color: "#ededed",
          }}
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
