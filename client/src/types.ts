export type CollectionStatus = "idle" | "running" | "passed" | "failed" | "error";

export interface RunStats {
  requests: { total: number; failed: number };
  assertions: { total: number; failed: number };
  averageResponseTimeMs: number;
}

export interface Collection {
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

export interface RunResult {
  startedAt: string;
  completedAt: string;
  durationMs: number;
  stats: RunStats;
  executions: ExecutionResult[];
}

export interface Summary {
  totalCollections: number;
  passed: number;
  failed: number;
  running: number;
  totalRequests: number;
  failedAssertions: number;
  averageResponseTimeMs: number;
}

export interface SkippedFile {
  fileName: string;
  reason: string;
}
