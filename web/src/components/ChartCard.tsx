import type { ReactNode } from "react";

interface ChartCardProps {
  title: ReactNode;
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
        <div className="min-w-0 text-sm font-semibold text-[var(--text-primary)]">
          {title}
        </div>
        {legend && <div className="flex items-center gap-3 text-xs text-[var(--text-secondary)]">{legend}</div>}
        {actions}
      </div>
      {children}
    </div>
  );
}
