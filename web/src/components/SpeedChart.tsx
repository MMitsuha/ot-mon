"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { SpeedDataPoint } from "@/lib/types";
import { formatSpeed, formatTime } from "@/lib/format";

export default function SpeedChart({ data }: { data: SpeedDataPoint[] }) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-80 text-[#888]">
        No data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={320}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id="downGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="upGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#222" />
        <XAxis
          dataKey="timestamp"
          tickFormatter={formatTime}
          stroke="#555"
          tick={{ fill: "#888", fontSize: 12 }}
          interval="preserveStartEnd"
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
          labelFormatter={(label) => formatTime(String(label))}
          formatter={(value, name) => [
            formatSpeed(Number(value)),
            name === "totalDownSpeed" ? "Download" : "Upload",
          ]}
        />
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
