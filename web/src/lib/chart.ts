export interface Gap {
  x1: number;
  x2: number;
}

export interface ChartDomain {
  domainMin: number;
  domainMax: number;
  ticks: number[];
}

export function formatTickTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatTooltipTime(ts: number): string {
  return new Date(ts).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function generateTicks(
  start: number,
  end: number,
  count: number,
): number[] {
  const step = (end - start) / count;
  return Array.from({ length: count + 1 }, (_, i) =>
    Math.round(start + step * i),
  );
}

export function getTickCount(hours: number): number {
  if (hours <= 1) return 6;
  if (hours <= 6) return 6;
  if (hours <= 24) return 8;
  return 7;
}

export function getExpectedIntervalMs(hours: number): number {
  if (hours <= 1) return 1 * 60_000;
  if (hours <= 6) return 2 * 60_000;
  if (hours <= 24) return 5 * 60_000;
  if (hours <= 168) return 30 * 60_000;
  return 60 * 60_000;
}

/**
 * Detect gaps in time-series data and insert null-break points.
 * Returns gap regions, domain max (extended to now if trailing gap),
 * and indices where null points should be inserted.
 */
export function detectGaps(
  timestamps: number[],
  hours: number,
): { gaps: Gap[]; domainMax: number; nullInsertIndices: Set<number> } {
  const threshold = getExpectedIntervalMs(hours) * 2.5;
  const gaps: Gap[] = [];
  const nullInsertIndices = new Set<number>();

  for (let i = 1; i < timestamps.length; i++) {
    const delta = timestamps[i] - timestamps[i - 1];
    if (delta > threshold) {
      gaps.push({ x1: timestamps[i - 1], x2: timestamps[i] });
      nullInsertIndices.add(i);
    }
  }

  const now = Date.now();
  const lastTs = timestamps[timestamps.length - 1];
  if (now - lastTs > threshold) {
    gaps.push({ x1: lastTs, x2: now });
  }

  const domainMax =
    gaps.length > 0 ? Math.max(lastTs, ...gaps.map((g) => g.x2)) : lastTs;

  return { gaps, domainMax, nullInsertIndices };
}

export function computeDomain(
  firstTs: number,
  domainMax: number,
  hours: number,
): ChartDomain {
  return {
    domainMin: firstTs,
    domainMax,
    ticks: generateTicks(firstTs, domainMax, getTickCount(hours)),
  };
}

export const TOOLTIP_STYLE = {
  backgroundColor: "var(--chart-tooltip-bg)",
  border: "1px solid var(--chart-tooltip-border)",
  borderRadius: 8,
  color: "var(--text-primary)",
} as const;

export const GAP_PATTERN_PROPS = {
  width: 6,
  height: 6,
  patternUnits: "userSpaceOnUse" as const,
  patternTransform: "rotate(45)",
};
