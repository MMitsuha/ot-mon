# Web Dashboard Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate code duplication across chart components, replace manual fetch polling with SWR, and restructure into focused modules.

**Architecture:** Extract shared chart utilities (gap detection, time formatting, tick generation) into `lib/chart.ts`. Replace raw `fetch`+`useEffect`+`setInterval` with SWR auto-revalidation in a `useDashboardData` hook. Create a `ChartCard` wrapper for repeated card chrome. Move chart components into `components/charts/`. Add CSS theme variables so chart components reference tokens instead of hex literals.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, recharts 3, SWR, Bun

---

## File Map

| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `src/lib/chart.ts` | Shared chart utilities: time formatting, tick generation, gap detection, `buildChartData` |
| Create | `src/lib/api.ts` | Shared `getInterval()` for API routes |
| Create | `src/hooks/use-dashboard-data.ts` | SWR-based data fetching hook |
| Create | `src/components/ChartCard.tsx` | Reusable card wrapper (border, padding, title, icon, optional actions) |
| Move+Edit | `src/components/charts/SpeedChart.tsx` | Speed chart, imports from `lib/chart.ts` |
| Move+Edit | `src/components/charts/UsageChart.tsx` | CPU/Memory chart, imports from `lib/chart.ts` |
| Move+Edit | `src/components/charts/DiskChart.tsx` | Disk chart, imports from `lib/chart.ts` |
| Edit | `src/components/Dashboard.tsx` | Thin composition: uses hook + ChartCard + charts |
| Edit | `src/components/StatCard.tsx` | Use CSS vars for colors |
| Edit | `src/app/globals.css` | Add chart theme variables |
| Edit | `src/app/api/speed/route.ts` | Import `getInterval` from `lib/api` |
| Edit | `src/app/api/hardware/route.ts` | Import `getInterval` from `lib/api` |
| Edit | `src/app/api/disks/route.ts` | Import `getInterval` from `lib/api` |

---

### Task 1: Install SWR

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install SWR**

```bash
cd web && bun add swr
```

- [ ] **Step 2: Verify installation**

```bash
cd web && bun run build 2>&1 | tail -5
```
Expected: Build succeeds (or at least no SWR import errors)

- [ ] **Step 3: Commit**

```bash
git add web/package.json web/bun.lockb
git commit -m "deps(web): add swr for data fetching"
```

---

### Task 2: Add CSS theme variables

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Add chart theme variables to globals.css**

Add these CSS custom properties inside the existing `@theme inline` block and as regular custom properties on `:root`:

```css
@theme inline {
  --color-background: #0a0a0a;
  --color-foreground: #ededed;
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}

:root {
  /* Surface colors */
  --card-bg: #111;
  --card-border: #222;
  --card-border-hover: #333;

  /* Text hierarchy */
  --text-primary: #ededed;
  --text-secondary: #888;
  --text-muted: #666;
  --text-dim: #555;

  /* Chart colors */
  --chart-grid: #222;
  --chart-axis: #555;
  --chart-tick: #888;
  --chart-gap: #333;
  --chart-tooltip-bg: #111;
  --chart-tooltip-border: #333;

  /* Series colors */
  --color-download: #0ea5e9;
  --color-upload: #8b5cf6;
  --color-cpu: #10b981;
  --color-memory: #f59e0b;
  --color-disk-read: #0ea5e9;
  --color-disk-write: #8b5cf6;
  --color-disk-rawait: #f59e0b;
  --color-disk-wawait: #ef4444;
  --color-disk-svctm: #10b981;
  --color-disk-util: #06b6d4;
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/app/globals.css
git commit -m "style(web): add CSS theme variables for chart colors and surfaces"
```

---

### Task 3: Extract shared chart utilities

**Files:**
- Create: `src/lib/chart.ts`

- [ ] **Step 1: Create `lib/chart.ts`**

Extract all shared chart logic. The generic `buildChartData` takes an array of objects with a `timestamp` field and returns processed points with gap markers and domain info.

```typescript
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

export function generateTicks(start: number, end: number, count: number): number[] {
  const step = (end - start) / count;
  return Array.from({ length: count + 1 }, (_, i) => Math.round(start + step * i));
}

export function getTickCount(hours: number): number {
  if (hours <= 1) return 6;
  if (hours <= 6) return 6;
  if (hours <= 24) return 8;
  return 7;
}

/** Expected bucket interval in ms, matching the API's getInterval() */
export function getExpectedIntervalMs(hours: number): number {
  if (hours <= 1) return 1 * 60_000;
  if (hours <= 6) return 2 * 60_000;
  if (hours <= 24) return 5 * 60_000;
  if (hours <= 168) return 30 * 60_000;
  return 60 * 60_000;
}

/**
 * Detect gaps in time-series data and insert null-break points.
 * Returns timestamps array, gap regions, and the domain max (extended to now if trailing gap).
 */
export function detectGaps(
  timestamps: number[],
  hours: number
): { gaps: Gap[]; domainMax: number; nullInsertIndices: Map<number, true> } {
  const threshold = getExpectedIntervalMs(hours) * 2.5;
  const gaps: Gap[] = [];
  const nullInsertIndices = new Map<number, true>();

  for (let i = 1; i < timestamps.length; i++) {
    const delta = timestamps[i] - timestamps[i - 1];
    if (delta > threshold) {
      gaps.push({ x1: timestamps[i - 1], x2: timestamps[i] });
      nullInsertIndices.set(i, true);
    }
  }

  // Trailing gap: last data point to now
  const now = Date.now();
  const lastTs = timestamps[timestamps.length - 1];
  if (now - lastTs > threshold) {
    gaps.push({ x1: lastTs, x2: now });
  }

  const domainMax = gaps.length > 0
    ? Math.max(lastTs, ...gaps.map((g) => g.x2))
    : lastTs;

  return { gaps, domainMax, nullInsertIndices };
}

/**
 * Compute X-axis domain and ticks from chart data points.
 */
export function computeDomain(
  firstTs: number,
  domainMax: number,
  hours: number
): ChartDomain {
  return {
    domainMin: firstTs,
    domainMax,
    ticks: generateTicks(firstTs, domainMax, getTickCount(hours)),
  };
}

/** Shared tooltip style object for recharts */
export const TOOLTIP_STYLE = {
  backgroundColor: "var(--chart-tooltip-bg)",
  border: "1px solid var(--chart-tooltip-border)",
  borderRadius: 8,
  color: "var(--text-primary)",
} as const;

/** Shared gap pattern SVG definition (call with unique id) */
export const GAP_PATTERN_PROPS = {
  width: 6,
  height: 6,
  patternUnits: "userSpaceOnUse" as const,
  patternTransform: "rotate(45)",
};

/** Empty chart placeholder bar count */
export const EMPTY_PLACEHOLDER_COUNT = 16;
```

- [ ] **Step 2: Commit**

```bash
git add web/src/lib/chart.ts
git commit -m "refactor(web): extract shared chart utilities into lib/chart.ts"
```

---

### Task 4: Extract shared API utility

**Files:**
- Create: `src/lib/api.ts`
- Modify: `src/app/api/speed/route.ts`
- Modify: `src/app/api/hardware/route.ts`
- Modify: `src/app/api/disks/route.ts`

- [ ] **Step 1: Create `lib/api.ts`**

```typescript
/** Time bucket interval in minutes, matching chart's getExpectedIntervalMs */
export function getInterval(hours: number): number {
  if (hours <= 1) return 1;
  if (hours <= 6) return 2;
  if (hours <= 24) return 5;
  if (hours <= 168) return 30;
  return 60;
}
```

- [ ] **Step 2: Update all three API routes**

In each of `speed/route.ts`, `hardware/route.ts`, `disks/route.ts`:
- Remove the local `getInterval` function
- Add `import { getInterval } from "@/lib/api";` at the top

- [ ] **Step 3: Verify build**

```bash
cd web && bun run build 2>&1 | tail -5
```
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add web/src/lib/api.ts web/src/app/api/
git commit -m "refactor(web): deduplicate getInterval into lib/api.ts"
```

---

### Task 5: Create SWR data fetching hook

**Files:**
- Create: `src/hooks/use-dashboard-data.ts`

- [ ] **Step 1: Create the hook**

```typescript
"use client";

import useSWR from "swr";
import { useState } from "react";
import type { DeviceInfo, SpeedDataPoint, HardwareDataPoint, PerDiskSeries } from "@/lib/types";

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

  const { data: speedData = [], isLoading: speedLoading } = useSWR<SpeedDataPoint[]>(
    enabled ? `/api/speed?device=${selectedDevice}&hours=${hours}` : null,
    fetcher,
    { refreshInterval: 60_000 }
  );

  const { data: hwData = [], isLoading: hwLoading } = useSWR<HardwareDataPoint[]>(
    enabled ? `/api/hardware?device=${selectedDevice}&hours=${hours}` : null,
    fetcher,
    { refreshInterval: 60_000 }
  );

  const { data: diskData = [], isLoading: diskLoading } = useSWR<PerDiskSeries[]>(
    enabled ? `/api/disks?device=${selectedDevice}&hours=${hours}` : null,
    fetcher,
    { refreshInterval: 60_000 }
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
    isLoading: speedLoading || hwLoading || diskLoading,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/hooks/use-dashboard-data.ts
git commit -m "feat(web): add SWR-based useDashboardData hook"
```

---

### Task 6: Create ChartCard component

**Files:**
- Create: `src/components/ChartCard.tsx`

- [ ] **Step 1: Create ChartCard**

```tsx
"use client";

import type { ReactNode } from "react";

interface ChartCardProps {
  title: string;
  icon?: ReactNode;
  legend?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}

export default function ChartCard({ title, icon, legend, actions, children }: ChartCardProps) {
  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] p-5">
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h2>
        {legend && <div className="flex items-center gap-3 text-xs text-[var(--text-secondary)]">{legend}</div>}
        {actions && <div className="ml-auto">{actions}</div>}
      </div>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/components/ChartCard.tsx
git commit -m "feat(web): add ChartCard wrapper component"
```

---

### Task 7: Refactor SpeedChart

**Files:**
- Move: `src/components/SpeedChart.tsx` → `src/components/charts/SpeedChart.tsx`

- [ ] **Step 1: Rewrite SpeedChart using shared utilities**

Move to `src/components/charts/SpeedChart.tsx`. Remove all duplicated helpers. Import from `@/lib/chart`. Use CSS vars for colors. The component still handles its own `buildChartData` internally since it has two data keys (totalDownSpeed + totalUpSpeed), but uses the shared `detectGaps` and `computeDomain`.

Key changes:
- Replace local `formatTickTime`, `formatTooltipTime`, `generateTicks`, `getTickCount`, `getExpectedIntervalMs` with imports from `@/lib/chart`
- Replace local `Gap` interface with import from `@/lib/chart`
- Rewrite `buildChartData` to use `detectGaps` from `@/lib/chart`
- Replace `TOOLTIP_STYLE` object literal with import from `@/lib/chart`
- Use CSS variables for hex color references where Tailwind doesn't apply (recharts props)

- [ ] **Step 2: Delete old file**

```bash
rm web/src/components/SpeedChart.tsx
```

- [ ] **Step 3: Commit**

```bash
git add web/src/components/charts/SpeedChart.tsx
git add web/src/components/SpeedChart.tsx
git commit -m "refactor(web): move SpeedChart to charts/ and use shared utilities"
```

---

### Task 8: Refactor UsageChart

**Files:**
- Move: `src/components/UsageChart.tsx` → `src/components/charts/UsageChart.tsx`

- [ ] **Step 1: Rewrite UsageChart using shared utilities**

Same pattern as SpeedChart. This chart has a single `value` data key, so `buildChartData` becomes very simple using `detectGaps`.

Key changes:
- Remove all duplicated helpers, import from `@/lib/chart`
- Rewrite `buildChartData` using `detectGaps`
- Use `TOOLTIP_STYLE` import
- Use CSS variables for colors

- [ ] **Step 2: Delete old file**

```bash
rm web/src/components/UsageChart.tsx
```

- [ ] **Step 3: Commit**

```bash
git add web/src/components/charts/UsageChart.tsx
git add web/src/components/UsageChart.tsx
git commit -m "refactor(web): move UsageChart to charts/ and use shared utilities"
```

---

### Task 9: Refactor DiskChart

**Files:**
- Move: `src/components/DiskChart.tsx` → `src/components/charts/DiskChart.tsx`

- [ ] **Step 1: Rewrite DiskChart using shared utilities**

Same pattern. This chart uses ComposedChart with multiple Y axes and series toggle — keep that logic, but replace duplicated helpers.

Key changes:
- Remove all duplicated helpers, import from `@/lib/chart`
- Rewrite `buildChartData` using `detectGaps`
- Use `TOOLTIP_STYLE` import
- Use CSS variables for colors

- [ ] **Step 2: Delete old file**

```bash
rm web/src/components/DiskChart.tsx
```

- [ ] **Step 3: Commit**

```bash
git add web/src/components/charts/DiskChart.tsx
git add web/src/components/DiskChart.tsx
git commit -m "refactor(web): move DiskChart to charts/ and use shared utilities"
```

---

### Task 10: Refactor Dashboard + StatCard

**Files:**
- Modify: `src/components/Dashboard.tsx`
- Modify: `src/components/StatCard.tsx`

- [ ] **Step 1: Rewrite Dashboard.tsx**

Replace all state management and data fetching with `useDashboardData()` hook. Use `ChartCard` for chart sections. Import `TIME_RANGES` from hook. Keep fullscreen logic for the speed chart (it's unique to that chart). Move CPU/Memory chart icons inline or into ChartCard.

The Dashboard should:
- Call `useDashboardData()`
- Compute derived values (latest, averages) with `useMemo`
- Render controls (device selector, time range)
- Render stat cards
- Render ChartCard-wrapped charts

- [ ] **Step 2: Update StatCard to use CSS vars**

Replace hardcoded hex values with CSS variable references.

- [ ] **Step 3: Verify build**

```bash
cd web && bun run build 2>&1 | tail -10
```
Expected: Build succeeds

- [ ] **Step 4: Verify type check**

```bash
cd web && bunx tsc --noEmit 2>&1 | tail -10
```
Expected: No type errors

- [ ] **Step 5: Commit**

```bash
git add web/src/components/Dashboard.tsx web/src/components/StatCard.tsx
git commit -m "refactor(web): simplify Dashboard with useDashboardData hook and ChartCard"
```

---

### Task 11: Final cleanup and verification

**Files:**
- Possibly: remove any leftover unused imports/exports in `src/lib/types.ts`

- [ ] **Step 1: Run lint**

```bash
cd web && bun run lint 2>&1 | tail -20
```
Expected: No errors (warnings OK)

- [ ] **Step 2: Run type check**

```bash
cd web && bunx tsc --noEmit
```
Expected: Clean

- [ ] **Step 3: Run production build**

```bash
cd web && bun run build
```
Expected: Build succeeds

- [ ] **Step 4: Commit any final fixes**

```bash
git add -A web/src/
git commit -m "refactor(web): final cleanup after dashboard refactor"
```
