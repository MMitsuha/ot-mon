/** Time bucket interval in minutes, matching chart's getExpectedIntervalMs */
export function getInterval(hours: number): number {
  if (hours <= 1) return 1;
  if (hours <= 6) return 2;
  if (hours <= 24) return 5;
  if (hours <= 168) return 30;
  return 60;
}
