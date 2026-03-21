"use client";

export default function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-[#222] bg-[#111] p-5">
      <p className="text-sm text-[#888]">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-[#ededed]">{value}</p>
      {sub && <p className="mt-1 text-xs text-[#666]">{sub}</p>}
    </div>
  );
}
