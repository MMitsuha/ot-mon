"use client";

import { useEffect, useState, useCallback } from "react";
import SpeedChart from "./SpeedChart";
import StatCard from "./StatCard";
import { DeviceInfo, SpeedDataPoint } from "@/lib/types";
import { formatSpeed } from "@/lib/format";

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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/devices")
      .then((r) => r.json())
      .then((d: DeviceInfo[]) => {
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
      const res = await fetch(
        `/api/speed?device=${selectedDevice}&hours=${hours}`
      );
      const d: SpeedDataPoint[] = await res.json();
      setData(d);
    } finally {
      setLoading(false);
    }
  }, [selectedDevice, hours]);

  useEffect(() => {
    fetchData();
    const id = setInterval(() => void fetchData(), 60_000);
    return () => clearInterval(id);
  }, [fetchData]);

  const latest = data.length > 0 ? data[data.length - 1] : null;

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={selectedDevice}
          onChange={(e) => setSelectedDevice(e.target.value)}
          className="rounded-lg border border-[#333] bg-[#111] px-3 py-2 text-sm text-[#ededed] outline-none focus:border-[#555]"
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
              className={`px-3 py-2 text-sm transition-colors ${
                hours === r.hours
                  ? "bg-[#ededed] text-[#0a0a0a]"
                  : "bg-[#111] text-[#888] hover:text-[#ededed]"
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
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          label="Download"
          value={latest ? formatSpeed(latest.totalDownSpeed) : "-"}
          sub="Current total"
        />
        <StatCard
          label="Upload"
          value={latest ? formatSpeed(latest.totalUpSpeed) : "-"}
          sub="Current total"
        />
        <StatCard
          label="Lines"
          value={latest ? `${latest.connectedLine}/${latest.totalLine}` : "-"}
          sub="Connected / Total"
        />
        <StatCard
          label="Data Points"
          value={String(data.length)}
          sub={`Last ${hours}h`}
        />
      </div>

      {/* Chart */}
      <div className="rounded-xl border border-[#222] bg-[#111] p-5">
        <div className="mb-4 flex items-center gap-4">
          <h2 className="text-lg font-semibold text-[#ededed]">
            Speed Overview
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
          </div>
        </div>
        <SpeedChart data={data} />
      </div>
    </div>
  );
}
