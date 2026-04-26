export default function StatCard({
  label,
  value,
  sub,
  note,
}: {
  label: string;
  value: string;
  sub?: string;
  note?: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] p-5">
      <p className="text-sm text-[var(--text-secondary)]">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-[var(--text-primary)]">
        {value}
      </p>
      {(sub || note) && (
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          {sub}
          {sub && note && (
            <span className="mx-1.5 text-[var(--text-dim)]">·</span>
          )}
          {note}
        </p>
      )}
    </div>
  );
}
