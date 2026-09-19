import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CollectionState, CollectionStatus, RunResult, RunStats } from "./types";

const emptyStats = (): RunStats => ({
  requests: { total: 0, failed: 0 },
  assertions: { total: 0, failed: 0 },
  averageResponseTimeMs: 0
});

const idleState = (): CollectionState => ({
  status: "idle",
  lastRunAt: null,
  durationMs: null,
  stats: null,
  result: null
});

export class ResultsStore {
  private collections: Record<string, CollectionState> = {};
  private writes = Promise.resolve();

  constructor(private readonly resultsFile: string) {}

  async load(): Promise<void> {
    try {
      const raw = JSON.parse(await readFile(this.resultsFile, "utf8")) as { collections?: Record<string, CollectionState> };
      this.collections = raw.collections ?? {};
      let changed = false;
      for (const state of Object.values(this.collections)) {
        if (state.status === "running") {
          state.status = "idle";
          changed = true;
        }
      }
      if (changed) await this.save();
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  get(id: string): CollectionState {
    return this.collections[id] ?? idleState();
  }

  async markRunning(id: string): Promise<void> {
    const current = this.get(id);
    this.collections[id] = { ...current, status: "running" };
    await this.save();
  }

  async complete(id: string, status: Exclude<CollectionStatus, "idle" | "running">, result: RunResult | null): Promise<void> {
    const stats = result?.stats ?? emptyStats();
    this.collections[id] = {
      status,
      lastRunAt: result?.completedAt ?? new Date().toISOString(),
      durationMs: result?.durationMs ?? null,
      stats,
      result
    };
    await this.save();
  }

  private async save(): Promise<void> {
    this.writes = this.writes.then(async () => {
      await mkdir(path.dirname(this.resultsFile), { recursive: true });
      const temporaryFile = `${this.resultsFile}.tmp`;
      await writeFile(temporaryFile, JSON.stringify({ collections: this.collections }, null, 2));
      await rename(temporaryFile, this.resultsFile);
    });
    return this.writes;
  }
}
