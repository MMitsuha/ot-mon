import Dashboard from "@/components/Dashboard";

export default function Home() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-[#ededed]">
          ot-mon
        </h1>
        <p className="mt-1 text-sm text-[#888]">
          PPPoE multi-dial monitoring dashboard
        </p>
      </header>
      <Dashboard />
    </main>
  );
}
