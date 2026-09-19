export type CollectionStatus = "idle" | "running" | "passed" | "failed" | "error";

export interface AssertionResult {
  name: string;
  passed: boolean;
  errorMessage: string | null;
}

export interface ExecutionResult {
  folder: string | null;
  name: string;
  method: string;
  url: string;
  statusCode: number | null;
  responseTimeMs: number | null;
  responseSize: number | null;
  assertions: AssertionResult[];
  requestError: string | null;
  failed: boolean;
}

export interface RunStats {
  requests: { total: number; failed: number };
  assertions: { total: number; failed: number };
  averageResponseTimeMs: number;
}

export interface RunResult {
  startedAt: string;
  completedAt: string;
  durationMs: number;
  stats: RunStats;
  executions: ExecutionResult[];
}

export interface CollectionState {
  status: CollectionStatus;
  lastRunAt: string | null;
  durationMs: number | null;
  stats: RunStats | null;
  result: RunResult | null;
}

export interface CollectionDescriptor {
  id: string;
  fileName: string;
  name: string;
  requestCount: number;
  environment: string | null;
  collection: Record<string, unknown> | null;
  parseError: string | null;
}

export interface CollectionSummary {
  id: string;
  fileName: string;
  name: string;
  requestCount: number;
  environment: string | null;
  status: CollectionStatus;
  lastRunAt: string | null;
  durationMs: number | null;
  stats: RunStats | null;
}

export interface SkippedFile {
  fileName: string;
  reason: string;
}
