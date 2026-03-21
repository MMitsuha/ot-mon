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

export function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}
