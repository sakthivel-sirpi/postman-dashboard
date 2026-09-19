import { readFile } from "node:fs/promises";
import path from "node:path";
import newman from "newman";
import { flattenRequests, type Catalog } from "./catalog";
import { ResultsStore } from "./store";
import type { AssertionResult, CollectionDescriptor, ExecutionResult, RunResult } from "./types";

type CatalogLoader = () => Promise<Catalog>;

export class RunError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function redactableValues(environment: Record<string, unknown> | null): string[] {
  if (!environment || !Array.isArray(environment.values)) return [];
  return environment.values
    .filter(isRecord)
    .flatMap((entry) => {
      const key = typeof entry.key === "string" ? entry.key : "";
      const value = typeof entry.value === "string" ? entry.value : "";
      const isSecret = entry.type === "secret" || /token|secret|key|password|auth/i.test(key);
      const isBaseUrl = /^https?:\/\//i.test(value);
      return isSecret && value.length >= 6 && !isBaseUrl ? [value] : [];
    })
    .sort((a, b) => b.length - a.length);
}

function redact(value: string | null, secrets: string[]): string | null {
  if (value === null) return null;
  return secrets.reduce((result, secret) => result.split(secret).join("[REDACTED]"), value);
}

async function loadEnvironment(collectionsDir: string, environmentFile: string | null): Promise<Record<string, unknown> | undefined> {
  if (!environmentFile) return undefined;
  const parsed: unknown = JSON.parse(await readFile(path.join(collectionsDir, environmentFile), "utf8"));
  if (!isRecord(parsed) || !Array.isArray(parsed.values)) throw new Error("Mapped environment is invalid.");
  return structuredClone(parsed);
}

function runNewman(collection: Record<string, unknown>, environment: Record<string, unknown> | undefined): Promise<any> {
  return new Promise((resolve, reject) => {
    newman.run(
      { collection, environment, reporters: [], timeoutRequest: 30_000 },
      (error: Error | null, summary: unknown) => (error ? reject(error) : resolve(summary))
    );
  });
}

function normaliseResult(summary: any, collection: Record<string, unknown>, secrets: string[], startedAt: Date): RunResult {
  const requestMetadata = flattenRequests(collection);
  const executions: ExecutionResult[] = (summary?.run?.executions ?? []).map((execution: any, index: number) => {
    const assertions: AssertionResult[] = (execution.assertions ?? []).map((assertion: any) => ({
      name: String(assertion.assertion ?? "Unnamed assertion"),
      passed: !assertion.error,
      errorMessage: redact(assertion.error?.message ?? null, secrets)
    }));
    const requestError = redact(execution.requestError?.message ?? null, secrets);
    const statusCode = typeof execution.response?.code === "number" ? execution.response.code : null;
    let responseSize: number | null = null;
    try {
      responseSize = execution.response?.size?.().body ?? null;
    } catch {
      responseSize = null;
    }
    const failed = Boolean(requestError) || (statusCode !== null && statusCode >= 400) || assertions.some((assertion) => !assertion.passed);
    const request = execution.request ?? {};
    return {
      folder: requestMetadata[index]?.folder ?? null,
      name: String(execution.item?.name ?? requestMetadata[index]?.name ?? "Unnamed request"),
      method: String(request.method ?? ""),
      url: redact(request.url?.toString?.() ?? "", secrets) ?? "",
      statusCode,
      responseTimeMs: typeof execution.response?.responseTime === "number" ? execution.response.responseTime : null,
      responseSize,
      assertions,
      requestError,
      failed
    };
  });

  const failedExecutions = executions.filter((execution) => execution.failed);
  const passedExecutions = executions.filter((execution) => !execution.failed);
  const orderedExecutions = [...failedExecutions, ...passedExecutions];
  const allAssertions = orderedExecutions.flatMap((execution) => execution.assertions);
  const responseTimes = orderedExecutions
    .map((execution) => execution.responseTimeMs)
    .filter((time): time is number => time !== null);
  const completedAt = new Date();

  return {
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationMs: completedAt.getTime() - startedAt.getTime(),
    stats: {
      requests: { total: orderedExecutions.length, failed: failedExecutions.length },
      assertions: { total: allAssertions.length, failed: allAssertions.filter((assertion) => !assertion.passed).length },
      averageResponseTimeMs: responseTimes.length ? Math.round(responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length) : 0
    },
    executions: orderedExecutions
  };
}

export class RunManager {
  private queue: CollectionDescriptor[] = [];
  private activeRuns = 0;

  constructor(
    private readonly collectionsDir: string,
    private readonly loadCatalog: CatalogLoader,
    private readonly store: ResultsStore
  ) {}

  async startOne(id: string): Promise<void> {
    const catalog = await this.loadCatalog();
    const descriptor = catalog.collections.find((collection) => collection.id === id);
    if (!descriptor) throw new RunError(404, "COLLECTION_NOT_FOUND", "Collection not found.");
    if (!descriptor.collection) {
      await this.store.complete(id, "error", null);
      throw new RunError(422, "COLLECTION_UNPARSEABLE", "Collection cannot be run because its JSON is invalid.");
    }
    if (this.store.get(id).status === "running") throw new RunError(409, "COLLECTION_RUNNING", "Collection is already running.");
    await this.store.markRunning(id);
    this.enqueue(descriptor);
  }

  async startAll(): Promise<{ queued: string[]; skipped: string[] }> {
    const catalog = await this.loadCatalog();
    const queued: CollectionDescriptor[] = [];
    const skipped: string[] = [];

    for (const descriptor of catalog.collections) {
      if (!descriptor.collection) {
        await this.store.complete(descriptor.id, "error", null);
        skipped.push(descriptor.id);
      } else if (this.store.get(descriptor.id).status === "running") {
        skipped.push(descriptor.id);
      } else {
        await this.store.markRunning(descriptor.id);
        queued.push(descriptor);
      }
    }

    for (const descriptor of queued) this.enqueue(descriptor);
    return { queued: queued.map((collection) => collection.id), skipped };
  }

  private enqueue(descriptor: CollectionDescriptor): void {
    this.queue.push(descriptor);
    this.drain();
  }

  private drain(): void {
    while (this.activeRuns < 2 && this.queue.length > 0) {
      const descriptor = this.queue.shift();
      if (!descriptor) return;
      this.activeRuns += 1;
      void this.execute(descriptor).finally(() => {
        this.activeRuns -= 1;
        this.drain();
      });
    }
  }

  private async execute(descriptor: CollectionDescriptor): Promise<void> {
    const startedAt = new Date();
    try {
      if (!descriptor.collection) throw new Error("Collection JSON is invalid.");
      const environment = await loadEnvironment(this.collectionsDir, descriptor.environment);
      const summary = await runNewman(descriptor.collection, environment);
      const result = normaliseResult(summary, descriptor.collection, redactableValues(environment ?? null), startedAt);
      await this.store.complete(descriptor.id, result.stats.requests.failed > 0 ? "failed" : "passed", result);
    } catch {
      await this.store.complete(descriptor.id, "error", null);
    }
  }
}
