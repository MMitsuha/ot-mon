"use client";

import useSWR from "swr";
import { useState } from "react";
import type {
  DeviceInfo,
  SpeedDataPoint,
  HardwareDataPoint,
  PerDiskSeries,
  YesterdayTotal,
} from "@/lib/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export const TIME_RANGES = [
  { label: "1H", hours: 1 },
  { label: "6H", hours: 6 },
  { label: "24H", hours: 24 },
  { label: "7D", hours: 168 },
] as const;

export function useDashboardData() {
  const [selectedDevice, setSelectedDevice] = useState("");
  const [hours, setHours] = useState(24);

  const { data: devices = [] } = useSWR<DeviceInfo[]>("/api/devices", fetcher, {
    revalidateOnFocus: false,
    onSuccess: (data) => {
      if (data.length > 0 && !selectedDevice) {
        data.sort((a, b) => a.device_name.localeCompare(b.device_name));
        setSelectedDevice(data[0].device_ip);
      }
    },
  });

  const enabled = !!selectedDevice;

  const { data: speedData = [], isLoading: speedLoading } = useSWR<
    SpeedDataPoint[]
  >(
    enabled ? `/api/speed?device=${selectedDevice}&hours=${hours}` : null,
    fetcher,
    { refreshInterval: 60_000 },
  );

  const { data: hwData = [], isLoading: hwLoading } = useSWR<
    HardwareDataPoint[]
  >(
    enabled ? `/api/hardware?device=${selectedDevice}&hours=${hours}` : null,
    fetcher,
    { refreshInterval: 60_000 },
  );

  const { data: diskData = [], isLoading: diskLoading } = useSWR<
    PerDiskSeries[]
  >(
    enabled ? `/api/disks?device=${selectedDevice}&hours=${hours}` : null,
    fetcher,
    { refreshInterval: 60_000 },
  );

  // Compute yesterday's [start, end) in browser-local time so the boundary
  // matches the user's wall clock regardless of server timezone. The strings
  // are stable until the next local midnight, so SWR keeps the same cache key.
  const now = new Date();
  const yStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - 1,
  ).toISOString();
  const yEnd = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).toISOString();

  const { data: yesterdayTotal } = useSWR<YesterdayTotal>(
    enabled
      ? `/api/yesterday-total?device=${selectedDevice}&start=${yStart}&end=${yEnd}`
      : null,
    fetcher,
    { refreshInterval: 5 * 60_000 },
  );

  return {
    devices,
    selectedDevice,
    setSelectedDevice,
    hours,
    setHours,
    speedData,
    hwData,
    diskData,
    yesterdayTotal,
    isLoading: speedLoading || hwLoading || diskLoading,
  };
}
