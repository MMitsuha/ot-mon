"use client";

import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import SpeedChart from "./charts/SpeedChart";
import UsageChart from "./charts/UsageChart";
import DiskChart from "./charts/DiskChart";
import ChartCard from "./ChartCard";
import CapacityBar from "./CapacityBar";
import StatCard from "./StatCard";
import { useDashboardData, TIME_RANGES } from "@/hooks/use-dashboard-data";
import { formatSpeed, formatBytes, formatPercent } from "@/lib/format";

export default function Dashboard() {
  const {
    devices,
    selectedDevice,
    setSelectedDevice,
    hours,
    setHours,
    speedData,
    hwData,
    diskData,
    isLoading,
  } = useDashboardData();

  // Fullscreen state for speed chart
  const chartRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!chartRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      chartRef.current.requestFullscreen();
    }
  }, []);

  // Derived stats
  const latest = speedData.length > 0 ? speedData[speedData.length - 1] : null;
  const latestHw = hwData.length > 0 ? hwData[hwData.length - 1] : null;

  const { avgDown, avgUp } = useMemo(() => {
    if (speedData.length === 0) return { avgDown: 0, avgUp: 0 };
    const n = speedData.length;
    return {
      avgDown: speedData.reduce((s, d) => s + d.totalDownSpeed, 0) / n,
      avgUp: speedData.reduce((s, d) => s + d.totalUpSpeed, 0) / n,
    };
  }, [speedData]);

  const { avgCpu, avgMemUsed, avgMemPercent } = useMemo(() => {
    if (hwData.length === 0) {
      return { avgCpu: 0, avgMemUsed: 0, avgMemPercent: 0 };
    }
    const n = hwData.length;
    return {
      avgCpu: hwData.reduce((s, d) => s + d.cpuUsage, 0) / n,
      avgMemUsed: hwData.reduce((s, d) => s + d.memUsed, 0) / n,
      avgMemPercent: hwData.reduce((s, d) => s + d.memUsedPercent, 0) / n,
    };
  }, [hwData]);

  const cpuChartData = useMemo(
    () => hwData.map((d) => ({ timestamp: d.timestamp, value: d.cpuUsage })),
    [hwData]
  );
  const memChartData = useMemo(
    () => hwData.map((d) => ({ timestamp: d.timestamp, value: d.memUsed })),
    [hwData]
  );
  const memChartDomain = useMemo<[number, number]>(() => {
    const max = hwData.reduce(
      (currentMax, d) => Math.max(currentMax, d.memTotal, d.memUsed),
      0
    );
    return [0, Math.max(max, 1)];
  }, [hwData]);

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={selectedDevice}
          onChange={(e) => setSelectedDevice(e.target.value)}
          className="appearance-none rounded-lg border border-[var(--card-border-hover)] bg-[var(--card-bg)] px-4 py-2 pr-8 text-sm text-[var(--text-primary)] outline-none transition-all duration-200 focus:border-[var(--text-dim)] focus:ring-1 focus:ring-[var(--text-dim)] hover:border-[var(--card-border-hover)] cursor-pointer"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23888' d='M2 4l4 4 4-4'/%3E%3C/svg%3E")`,
            backgroundRepeat: "no-repeat",
            backgroundPosition: "right 10px center",
          }}
        >
          {devices.map((d) => (
            <option key={d.device_ip} value={d.device_ip}>
              {d.device_name}
            </option>
          ))}
        </select>

        <div className="flex rounded-lg border border-[var(--card-border-hover)] overflow-hidden">
          {TIME_RANGES.map((r) => (
            <button
              key={r.hours}
              onClick={() => setHours(r.hours)}
              className={`px-4 py-2 text-sm transition-all duration-200 ${hours === r.hours
                ? "bg-[var(--text-primary)] text-[var(--color-background)]"
                : "bg-[var(--card-bg)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[#1a1a1a]"
                }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        {isLoading && (
          <span className="text-xs text-[var(--text-dim)]">Loading...</span>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard
          label="Download"
          value={latest ? formatSpeed(latest.totalDownSpeed) : "-"}
          sub={speedData.length > 0 ? `Avg ${formatSpeed(avgDown)}` : undefined}
        />
        <StatCard
          label="Upload"
          value={latest ? formatSpeed(latest.totalUpSpeed) : "-"}
          sub={speedData.length > 0 ? `Avg ${formatSpeed(avgUp)}` : undefined}
        />
        <StatCard
          label="Lines"
          value={latest ? `${latest.connectedLine}/${latest.totalLine}` : "-"}
          sub="Connected / Total"
        />
        <StatCard
          label="CPU"
          value={latestHw ? formatPercent(latestHw.cpuUsage) : "-"}
          sub={hwData.length > 0 ? `Avg ${formatPercent(avgCpu)}` : undefined}
        />
        <StatCard
          label="Memory"
          value={latestHw ? formatBytes(latestHw.memUsed) : "-"}
          sub={hwData.length > 0 ? `Avg ${formatBytes(avgMemUsed)}` : undefined}
        />
      </div>

      {/* Speed Chart — special: supports fullscreen */}
      <div
        ref={chartRef}
        className={`rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] p-5 transition-all duration-300 ${isFullscreen ? "flex flex-col h-screen w-screen" : ""
          }`}
      >
        <div className="mb-4 flex items-center gap-4">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Speed</h2>
          <div className="flex items-center gap-3 text-xs text-[var(--text-secondary)]">
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-[var(--color-download)]" />
              Download
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-[var(--color-upload)]" />
              Upload
            </span>
            <span className="flex items-center gap-1">
              <svg width="8" height="8" viewBox="0 0 8 8" className="inline-block">
                <pattern id="legendGap" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <line x1="0" y1="0" x2="0" y2="4" stroke="var(--text-dim)" strokeWidth="1" />
                </pattern>
                <rect width="8" height="8" rx="1" fill="url(#legendGap)" />
              </svg>
              No data
            </span>
          </div>
          <button
            onClick={toggleFullscreen}
            className="ml-auto rounded-lg p-1.5 text-[var(--text-dim)] transition-colors duration-200 hover:bg-[#1a1a1a] hover:text-[var(--text-primary)]"
            aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 1 6 6 1 6" />
                <polyline points="10 15 10 10 15 10" />
                <line x1="1" y1="6" x2="6" y2="1" />
                <line x1="15" y1="10" x2="10" y2="15" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="10 1 15 1 15 6" />
                <polyline points="6 15 1 15 1 10" />
                <line x1="15" y1="1" x2="10" y2="6" />
                <line x1="1" y1="15" x2="6" y2="10" />
              </svg>
            )}
          </button>
        </div>
        <div className={isFullscreen ? "flex-1 min-h-0" : ""}>
          <SpeedChart
            data={speedData}
            avgDown={avgDown}
            avgUp={avgUp}
            hours={hours}
            fullscreen={isFullscreen}
            yAxisWidth={85}
          />
        </div>
      </div>

      {/* CPU Chart */}
      <ChartCard
        title="CPU Usage"
        icon={
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--color-cpu)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="1" y="1" width="14" height="14" rx="2" />
            <path d="M4 8h2l1-3 2 6 1-3h2" />
          </svg>
        }
      >
        <UsageChart
          data={cpuChartData}
          color="var(--color-cpu)"
          label="CPU"
          avg={avgCpu}
          hours={hours}
          yAxisWidth={52}
        />
      </ChartCard>

      {/* Memory Chart */}
      <ChartCard
        title="Memory Usage"
        icon={
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--color-memory)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="1" width="4" height="14" rx="1" />
            <rect x="10" y="1" width="4" height="14" rx="1" />
            <line x1="4" y1="4" x2="4" y2="12" />
            <line x1="12" y1="4" x2="12" y2="12" />
          </svg>
        }
        actions={
          latestHw ? (
            <CapacityBar used={latestHw.memUsed} total={latestHw.memTotal} />
          ) : null
        }
      >
        <UsageChart
          data={memChartData}
          color="var(--color-memory)"
          label="Memory"
          avg={avgMemUsed}
          hours={hours}
          domain={memChartDomain}
          formatter={formatBytes}
          yAxisWidth={85}
        />
      </ChartCard>

      {/* Per-Disk Charts */}
      {diskData.map((disk) => {
        const latestDiskUsed =
          disk.data.length > 0 ? disk.data[disk.data.length - 1].used : 0;

        return (
          <ChartCard
            key={disk.sn}
            title={
              <div className="flex min-w-0 items-center gap-3">
                <span className="min-w-0 truncate font-mono text-[#ededed]">
                  {disk.sn}
                </span>
                {disk.diskType && (
                  <span className="rounded bg-[#222] px-1.5 py-0.5 text-[10px] font-medium uppercase text-[#888]">
                    {disk.diskType}
                  </span>
                )}
              </div>
            }
            icon={
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#888" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1" y="4" width="14" height="8" rx="2" />
                <line x1="4" y1="7" x2="4" y2="9" />
                <line x1="7" y1="7" x2="7" y2="9" />
              </svg>
            }
            actions={<CapacityBar used={latestDiskUsed} total={disk.total} />}
          >
            <DiskChart
              data={disk.data}
              hours={hours}
              yAxisWidth={{ left: 85, right: 52 }}
            />
          </ChartCard>
        );
      })}
    </div>
  );
}
