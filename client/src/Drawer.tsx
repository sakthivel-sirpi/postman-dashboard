import { useEffect, useRef } from "react";
import { formatDuration, formatSize } from "./format";
import type { Collection, RunResult } from "./types";

export function Drawer({ collection, result, loading, onClose }: { collection: Collection; result: RunResult | null; loading: boolean; onClose: () => void }) {
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => closeButton.current?.focus(), []);

  return (
    <aside className="fixed inset-y-0 right-0 z-20 flex w-full max-w-2xl flex-col border-l border-slate-200 bg-white shadow-xl" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
      <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Last run details</p>
          <h2 id="drawer-title" className="mt-1 text-lg font-semibold text-slate-950">{collection.name}</h2>
        </div>
        <button ref={closeButton} type="button" onClick={onClose} className="rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">Close</button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {loading && <p role="status" className="text-sm text-slate-500">Loading endpoint results…</p>}
        {!loading && !result && <p className="rounded-md border border-dashed border-slate-300 p-5 text-sm text-slate-500">No completed run is available yet.</p>}
        {!loading && result && (
          <div className="space-y-3">
            {result.executions.map((execution, index) => (
              <section key={`${execution.name}-${index}`} className={`rounded-lg border p-4 ${execution.failed ? "border-rose-200 bg-rose-50/40" : "border-slate-200"}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-slate-900 px-2 py-0.5 font-mono text-xs font-semibold text-white">{execution.method}</span>
                  <h3 className="font-medium text-slate-900">{execution.name}</h3>
                  <span className={`ml-auto text-sm font-semibold ${execution.failed ? "text-rose-700" : "text-emerald-700"}`}>{execution.failed ? "Failed" : "Passed"}</span>
                </div>
                {execution.folder && <p className="mt-2 text-xs text-slate-500">{execution.folder}</p>}
                <p className="mt-2 break-all font-mono text-xs text-slate-600">{execution.url}</p>
                <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-600">
                  <div><dt className="inline text-slate-500">HTTP </dt><dd className="inline font-medium">{execution.statusCode ?? "—"}</dd></div>
                  <div><dt className="inline text-slate-500">Time </dt><dd className="inline font-medium">{formatDuration(execution.responseTimeMs)}</dd></div>
                  <div><dt className="inline text-slate-500">Size </dt><dd className="inline font-medium">{formatSize(execution.responseSize)}</dd></div>
                </dl>
                {execution.requestError && <p className="mt-3 text-sm text-rose-800">{execution.requestError}</p>}
                {execution.assertions.length > 0 && <ul className="mt-3 space-y-2 border-t border-slate-200 pt-3 text-sm">
                  {execution.assertions.map((assertion, assertionIndex) => <li key={`${assertion.name}-${assertionIndex}`} className={assertion.passed ? "text-emerald-800" : "text-rose-800"}>
                    <span className="font-medium">{assertion.passed ? "Passed" : "Failed"}:</span> {assertion.name}
                    {!assertion.passed && assertion.errorMessage && <p className="mt-1 text-xs">{assertion.errorMessage}</p>}
                  </li>)}
                </ul>}
              </section>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
