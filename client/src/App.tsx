import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { Drawer } from "./Drawer";
import { formatDate, formatDuration } from "./format";
import type { Collection, CollectionStatus, RunResult, SkippedFile, Summary } from "./types";

const statusClasses: Record<CollectionStatus, string> = {
  idle: "bg-slate-100 text-slate-700",
  running: "bg-amber-100 text-amber-800",
  passed: "bg-emerald-100 text-emerald-800",
  failed: "bg-rose-100 text-rose-800",
  error: "bg-orange-100 text-orange-800"
};

function StatusBadge({ status }: { status: CollectionStatus }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${statusClasses[status]}`}>{status}</span>;
}

export default function App() {
  const [collections, setCollections] = useState<Collection[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [skipped, setSkipped] = useState<SkippedFile[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | CollectionStatus>("all");
  const [selected, setSelected] = useState<Collection | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const [resultLoading, setResultLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const refresh = useCallback(async (includeSkipped = false) => {
    try {
      const requests: [Promise<Collection[]>, Promise<Summary>, Promise<SkippedFile[]>?] = [api.collections(), api.summary()];
      if (includeSkipped) requests.push(api.skipped());
      const [nextCollections, nextSummary, nextSkipped] = await Promise.all(requests);
      setCollections(nextCollections);
      setSummary(nextSummary);
      if (nextSkipped) setSkipped(nextSkipped);
      setLastRefreshed(new Date());
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not refresh dashboard data.");
    }
  }, []);

  useEffect(() => { void refresh(true); }, [refresh]);
  useEffect(() => {
    if (!collections?.some((collection) => collection.status === "running")) return;
    const timer = window.setInterval(() => void refresh(), 2_000);
    return () => window.clearInterval(timer);
  }, [collections, refresh]);

  const filteredCollections = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (collections ?? []).filter((collection) => {
      const matchesSearch = !query || `${collection.name} ${collection.fileName}`.toLowerCase().includes(query);
      return matchesSearch && (status === "all" || collection.status === status);
    });
  }, [collections, search, status]);

  async function showResult(collection: Collection) {
    setSelected(collection);
    setResult(null);
    setResultLoading(true);
    try {
      setResult((await api.result(collection.id)).result);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not load run details.");
    } finally {
      setResultLoading(false);
    }
  }

  async function run(id: string) {
    try {
      await api.run(id);
      await refresh(true);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not start collection.");
    }
  }

  async function runAll() {
    try {
      await api.runAll();
      await refresh(true);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not start collections.");
    }
  }

  const cards = summary ? [
    ["Total collections", summary.totalCollections], ["Passed", summary.passed], ["Failed", summary.failed], ["Running", summary.running],
    ["Total requests", summary.totalRequests], ["Failed assertions", summary.failedAssertions], ["Avg response time", `${summary.averageResponseTimeMs} ms`]
  ] : [];

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-cyan-700">Workspace runner</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight">Postman Collection Dashboard</h1>
            <p aria-live="polite" className="mt-2 text-sm text-slate-500">{lastRefreshed ? `Refreshed ${lastRefreshed.toLocaleTimeString()}` : "Loading collections…"}</p>
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={() => void refresh(true)} className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-100">Refresh</button>
            <button type="button" onClick={() => void runAll()} className="rounded-md bg-cyan-700 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-800">Run All</button>
          </div>
        </header>

        {error && <p role="alert" className="mt-5 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>}

        <section aria-label="Summary" className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
          {cards.map(([label, value]) => <div key={String(label)} className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-semibold">{value}</p>
          </div>)}
        </section>

        <section className="mt-7 rounded-lg border border-slate-200 bg-white">
          <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold">Collections</h2>
            <div className="flex flex-col gap-2 sm:flex-row">
              <label className="sr-only" htmlFor="collection-search">Search collections</label>
              <input id="collection-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search collections" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
              <label className="sr-only" htmlFor="status-filter">Filter by status</label>
              <select id="status-filter" value={status} onChange={(event) => setStatus(event.target.value as typeof status)} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
                <option value="all">All statuses</option>
                {Object.keys(statusClasses).map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </div>
          </div>

          {collections === null && <div role="status" className="p-8 text-sm text-slate-500">Loading collection inventory…</div>}
          {collections !== null && filteredCollections.length === 0 && <div className="p-8 text-sm text-slate-500">No collections match the current filters.</div>}
          {filteredCollections.length > 0 && <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>
                <th className="px-4 py-3 font-semibold">Collection</th><th className="px-4 py-3 font-semibold">Environment</th><th className="px-4 py-3 font-semibold">Status</th><th className="px-4 py-3 font-semibold">Requests</th><th className="px-4 py-3 font-semibold">Assertions</th><th className="px-4 py-3 font-semibold">Last run</th><th className="px-4 py-3 font-semibold">Duration</th><th className="px-4 py-3 font-semibold"><span className="sr-only">Run</span></th>
              </tr></thead>
              <tbody className="divide-y divide-slate-200">
                {filteredCollections.map((collection) => <tr key={collection.id} role="button" tabIndex={0} onClick={() => void showResult(collection)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); void showResult(collection); } }} className="cursor-pointer hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-700">
                  <td className="max-w-64 px-4 py-3"><p className="font-medium text-slate-900">{collection.name}</p><p className="mt-1 truncate text-xs text-slate-500">{collection.fileName}</p></td>
                  <td className="px-4 py-3 text-slate-600">{collection.environment ?? <span className="text-slate-400">No environment</span>}</td>
                  <td className="px-4 py-3"><StatusBadge status={collection.status} /></td>
                  <td className="px-4 py-3 text-slate-600">{collection.stats ? `${collection.stats.requests.total} / ${collection.stats.requests.failed} failed` : collection.requestCount}</td>
                  <td className="px-4 py-3 text-slate-600">{collection.stats ? `${collection.stats.assertions.total - collection.stats.assertions.failed} passed / ${collection.stats.assertions.failed} failed` : "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(collection.lastRunAt)}</td>
                  <td className="px-4 py-3 text-slate-600">{formatDuration(collection.durationMs)}</td>
                  <td className="px-4 py-3 text-right"><button type="button" disabled={collection.status === "running"} onClick={(event) => { event.stopPropagation(); void run(collection.id); }} className="rounded-md border border-cyan-700 px-3 py-1.5 text-xs font-semibold text-cyan-800 hover:bg-cyan-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400">{collection.lastRunAt ? "Re-run" : "Run"}</button></td>
                </tr>)}
              </tbody>
            </table>
          </div>}
        </section>

        {skipped.length > 0 && <section className="mt-7 rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-lg font-semibold">Skipped files</h2>
          <ul className="mt-3 divide-y divide-slate-100 text-sm">{skipped.map((file) => <li key={file.fileName} className="flex flex-col gap-1 py-3 sm:flex-row sm:justify-between"><span className="font-medium">{file.fileName}</span><span className="text-slate-500">{file.reason}</span></li>)}</ul>
        </section>}
      </div>
      {selected && <Drawer collection={selected} result={result} loading={resultLoading} onClose={() => setSelected(null)} />}
    </main>
  );
}
