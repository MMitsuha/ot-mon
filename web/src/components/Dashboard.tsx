"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import SpeedChart from "./SpeedChart";
import UsageChart from "./UsageChart";
import DiskChart from "./DiskChart";
import StatCard from "./StatCard";
import { DeviceInfo, SpeedDataPoint, HardwareDataPoint, PerDiskSeries } from "@/lib/types";
import { formatSpeed, formatBytes, formatPercent } from "@/lib/format";

const TIME_RANGES = [
  { label: "1H", hours: 1 },
  { label: "6H", hours: 6 },
  { label: "24H", hours: 24 },
  { label: "7D", hours: 168 },
];

export default function Dashboard() {
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>("");
  const [hours, setHours] = useState(24);
  const [data, setData] = useState<SpeedDataPoint[]>([]);
  const [hwData, setHwData] = useState<HardwareDataPoint[]>([]);
  const [diskData, setDiskData] = useState<PerDiskSeries[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/devices")
      .then((r) => r.json())
      .then((d: DeviceInfo[]) => {
        d.sort((a, b) => a.device_name.localeCompare(b.device_name));
        setDevices(d);
        if (d.length > 0 && !selectedDevice) {
          setSelectedDevice(d[0].device_ip);
        }
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchData = useCallback(async () => {
    if (!selectedDevice) return;
    setLoading(true);
    try {
      const [speedRes, hwRes, diskRes] = await Promise.all([
        fetch(`/api/speed?device=${selectedDevice}&hours=${hours}`),
        fetch(`/api/hardware?device=${selectedDevice}&hours=${hours}`),
        fetch(`/api/disks?device=${selectedDevice}&hours=${hours}`),
      ]);
      const [speedData, hardwareData, perDiskData]: [SpeedDataPoint[], HardwareDataPoint[], PerDiskSeries[]] =
        await Promise.all([speedRes.json(), hwRes.json(), diskRes.json()]);
      setData(speedData);
      setHwData(hardwareData);
      setDiskData(perDiskData);
    } finally {
      setLoading(false);
    }
  }, [selectedDevice, hours]);

  useEffect(() => {
    fetchData();
    const id = setInterval(() => void fetchData(), 60_000);
    return () => clearInterval(id);
  }, [fetchData]);

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

  const latest = data.length > 0 ? data[data.length - 1] : null;
  const latestHw = hwData.length > 0 ? hwData[hwData.length - 1] : null;

  const { avgDown, avgUp } = useMemo(() => {
    if (data.length === 0) return { avgDown: 0, avgUp: 0 };
    const sumDown = data.reduce((s, d) => s + d.totalDownSpeed, 0);
    const sumUp = data.reduce((s, d) => s + d.totalUpSpeed, 0);
    return { avgDown: sumDown / data.length, avgUp: sumUp / data.length };
  }, [data]);

  const { avgCpu, avgMem } = useMemo(() => {
    if (hwData.length === 0) return { avgCpu: 0, avgMem: 0 };
    const n = hwData.length;
    return {
      avgCpu: hwData.reduce((s, d) => s + d.cpuUsage, 0) / n,
      avgMem: hwData.reduce((s, d) => s + d.memUsedPercent, 0) / n,
    };
  }, [hwData]);

  const cpuChartData = useMemo(
    () => hwData.map((d) => ({ timestamp: d.timestamp, value: d.cpuUsage })),
    [hwData]
  );
  const memChartData = useMemo(
    () => hwData.map((d) => ({ timestamp: d.timestamp, value: d.memUsedPercent })),
    [hwData]
  );

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={selectedDevice}
          onChange={(e) => setSelectedDevice(e.target.value)}
          className="appearance-none rounded-lg border border-[#333] bg-[#111] px-4 py-2 pr-8 text-sm text-[#ededed] outline-none transition-all duration-200 focus:border-[#555] focus:ring-1 focus:ring-[#555] hover:border-[#444] cursor-pointer"
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

        <div className="flex rounded-lg border border-[#333] overflow-hidden">
          {TIME_RANGES.map((r) => (
            <button
              key={r.hours}
              onClick={() => setHours(r.hours)}
              className={`px-4 py-2 text-sm transition-all duration-200 ${
                hours === r.hours
                  ? "bg-[#ededed] text-[#0a0a0a]"
                  : "bg-[#111] text-[#888] hover:text-[#ededed] hover:bg-[#1a1a1a]"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        {loading && (
          <span className="text-xs text-[#555]">Loading...</span>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard
          label="Download"
          value={latest ? formatSpeed(latest.totalDownSpeed) : "-"}
          sub={data.length > 0 ? `Avg ${formatSpeed(avgDown)}` : undefined}
        />
        <StatCard
          label="Upload"
          value={latest ? formatSpeed(latest.totalUpSpeed) : "-"}
          sub={data.length > 0 ? `Avg ${formatSpeed(avgUp)}` : undefined}
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
          value={latestHw ? formatPercent(latestHw.memUsedPercent) : "-"}
          sub={latestHw ? `${formatBytes(latestHw.memUsed)} / ${formatBytes(latestHw.memTotal)}` : undefined}
        />
      </div>

      {/* Speed Chart */}
      <div
        ref={chartRef}
        className={`rounded-xl border border-[#222] bg-[#111] p-5 transition-all duration-300 ${
          isFullscreen ? "flex flex-col h-screen w-screen" : ""
        }`}
      >
        <div className="mb-4 flex items-center gap-4">
          <h2 className="text-lg font-semibold text-[#ededed]">
            Speed
          </h2>
          <div className="flex items-center gap-3 text-xs text-[#888]">
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-[#0ea5e9]" />
              Download
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-[#8b5cf6]" />
              Upload
            </span>
            <span className="flex items-center gap-1">
              <svg width="8" height="8" viewBox="0 0 8 8" className="inline-block">
                <pattern id="legendGap" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <line x1="0" y1="0" x2="0" y2="4" stroke="#555" strokeWidth="1" />
                </pattern>
                <rect width="8" height="8" rx="1" fill="url(#legendGap)" />
              </svg>
              No data
            </span>
          </div>
          <button
            onClick={toggleFullscreen}
            className="ml-auto rounded-lg p-1.5 text-[#555] transition-colors duration-200 hover:bg-[#1a1a1a] hover:text-[#ededed]"
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
          <SpeedChart data={data} avgDown={avgDown} avgUp={avgUp} hours={hours} fullscreen={isFullscreen} />
        </div>
      </div>

      {/* CPU Chart */}
      <div className="rounded-xl border border-[#222] bg-[#111] p-5">
        <div className="mb-3 flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="1" y="1" width="14" height="14" rx="2" />
            <path d="M4 8h2l1-3 2 6 1-3h2" />
          </svg>
          <h2 className="text-sm font-semibold text-[#ededed]">CPU Usage</h2>
        </div>
        <UsageChart data={cpuChartData} color="#10b981" label="CPU" avg={avgCpu} hours={hours} />
      </div>

      {/* Memory Chart */}
      <div className="rounded-xl border border-[#222] bg-[#111] p-5">
        <div className="mb-3 flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="1" width="4" height="14" rx="1" />
            <rect x="10" y="1" width="4" height="14" rx="1" />
            <line x1="4" y1="4" x2="4" y2="12" />
            <line x1="12" y1="4" x2="12" y2="12" />
          </svg>
          <h2 className="text-sm font-semibold text-[#ededed]">Memory Usage</h2>
        </div>
        <UsageChart data={memChartData} color="#f59e0b" label="Memory" avg={avgMem} hours={hours} />
      </div>

      {/* Per-Disk Charts */}
      {diskData.map((disk) => (
        <div key={disk.sn} className="rounded-xl border border-[#222] bg-[#111] p-5">
          <DiskChart
            sn={disk.sn}
            diskType={disk.diskType}
            totalCapacity={disk.total}
            data={disk.data}
            hours={hours}
          />
        </div>
      ))}
    </div>
  );
}
