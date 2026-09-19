import type { Collection, RunResult, SkippedFile, Summary } from "./types";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message ?? "Request failed.");
  }
  return response.json() as Promise<T>;
}

export const api = {
  collections: () => request<Collection[]>("/api/collections"),
  skipped: () => request<SkippedFile[]>("/api/skipped"),
  summary: () => request<Summary>("/api/summary"),
  result: (id: string) => request<{ result: RunResult | null }>(`/api/collections/${encodeURIComponent(id)}/result`),
  run: (id: string) => request(`/api/collections/${encodeURIComponent(id)}/run`, { method: "POST" }),
  runAll: () => request("/api/run-all", { method: "POST" })
};
