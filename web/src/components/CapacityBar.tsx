import { formatBytes } from "@/lib/format";

interface CapacityBarProps {
  used: number;
  total: number;
}

export default function CapacityBar({ used, total }: CapacityBarProps) {
  const usedPercent = total > 0 ? (used / total) * 100 : 0;

  return (
    <div className="ml-auto flex items-center gap-2 shrink-0">
      <span className="text-xs text-[#666] whitespace-nowrap">
        {formatBytes(used)} / {formatBytes(total)}
      </span>
      <div className="h-2 w-24 rounded-full bg-[#222] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${Math.min(usedPercent, 100)}%`,
            backgroundColor:
              usedPercent > 90
                ? "#ef4444"
                : usedPercent > 70
                  ? "#f59e0b"
                  : "#10b981",
          }}
        />
      </div>
      <span className="text-xs text-[#666]">{usedPercent.toFixed(1)}%</span>
    </div>
  );
}
