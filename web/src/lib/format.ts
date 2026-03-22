export function formatSpeed(bytesPerSec: number): string {
  const mbps = bytesPerSec / 1_048_576;
  if (mbps >= 1000) {
    return `${(mbps / 1024).toFixed(1)} GB/s`;
  }
  if (mbps >= 1) {
    return `${mbps.toFixed(1)} MB/s`;
  }
  return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) {
    return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  }
  if (bytes >= 1_048_576) {
    return `${(bytes / 1_048_576).toFixed(1)} MB`;
  }
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function formatKbps(kbps: number): string {
  if (kbps >= 1_048_576) {
    return `${(kbps / 1_048_576).toFixed(1)} GB/s`;
  }
  if (kbps >= 1024) {
    return `${(kbps / 1024).toFixed(1)} MB/s`;
  }
  return `${kbps.toFixed(0)} KB/s`;
}

export function formatMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${ms.toFixed(1)}ms`;
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}
