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
