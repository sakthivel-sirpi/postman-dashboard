import dotenv from "dotenv";
import express from "express";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scanCatalog } from "./catalog";
import { RunError, RunManager } from "./runner";
import { ResultsStore } from "./store";
import type { CollectionSummary, RunStats } from "./types";

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(serverRoot, ".env"), override: false });

const collectionsDir = process.env.COLLECTIONS_DIR;
if (!collectionsDir) throw new Error("COLLECTIONS_DIR must be configured.");
const resultsFile = process.env.RESULTS_FILE ?? path.join(serverRoot, "data", "results.json");
const mapping = JSON.parse(await readFile(path.join(serverRoot, "config", "mapping.json"), "utf8")) as Record<string, string>;
const store = new ResultsStore(resultsFile);
await store.load();

const loadCatalog = () => scanCatalog(collectionsDir, mapping);
const runner = new RunManager(collectionsDir, loadCatalog, store);
const app = express();
app.disable("x-powered-by");
app.use((_request, response, next) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "SAMEORIGIN");
  next();
});

function summaryForCollection(collection: Awaited<ReturnType<typeof loadCatalog>>["collections"][number]): CollectionSummary {
  const state = store.get(collection.id);
  return {
    id: collection.id,
    fileName: collection.fileName,
    name: collection.name,
    requestCount: collection.requestCount,
    environment: collection.environment,
    status: collection.parseError ? "error" : state.status,
    lastRunAt: state.lastRunAt,
    durationMs: state.durationMs,
    stats: state.stats
  };
}

function zeroStats(): RunStats {
  return { requests: { total: 0, failed: 0 }, assertions: { total: 0, failed: 0 }, averageResponseTimeMs: 0 };
}

app.get("/api/collections", async (_request, response) => {
  const catalog = await loadCatalog();
  response.json(catalog.collections.map(summaryForCollection));
});

app.get("/api/skipped", async (_request, response) => {
  response.json((await loadCatalog()).skipped);
});

app.get("/api/summary", async (_request, response) => {
  const collections = (await loadCatalog()).collections.map(summaryForCollection);
  const totals = collections.reduce(
    (aggregate, collection) => {
      const stats = collection.stats ?? zeroStats();
      aggregate.totalRequests += stats.requests.total;
      aggregate.failedAssertions += stats.assertions.failed;
      aggregate.responseTimeTotal += stats.averageResponseTimeMs * stats.requests.total;
      aggregate.responseTimeCount += stats.requests.total;
      aggregate[collection.status] += 1;
      return aggregate;
    },
    { totalRequests: 0, failedAssertions: 0, responseTimeTotal: 0, responseTimeCount: 0, idle: 0, running: 0, passed: 0, failed: 0, error: 0 }
  );
  response.json({
    totalCollections: collections.length,
    passed: totals.passed,
    failed: totals.failed,
    running: totals.running,
    totalRequests: totals.totalRequests,
    failedAssertions: totals.failedAssertions,
    averageResponseTimeMs: totals.responseTimeCount ? Math.round(totals.responseTimeTotal / totals.responseTimeCount) : 0
  });
});

app.get("/api/collections/:id/result", async (request, response) => {
  const catalog = await loadCatalog();
  if (!catalog.collections.some((collection) => collection.id === request.params.id)) {
    response.status(404).json({ error: { code: "COLLECTION_NOT_FOUND", message: "Collection not found." } });
    return;
  }
  response.json({ result: store.get(request.params.id).result });
});

app.post("/api/collections/:id/run", async (request, response) => {
  try {
    await runner.startOne(request.params.id);
    response.status(202).json({ queued: [request.params.id] });
  } catch (error) {
    if (error instanceof RunError) {
      response.status(error.status).json({ error: { code: error.code, message: error.message } });
      return;
    }
    throw error;
  }
});

app.post("/api/run-all", async (_request, response) => {
  const outcome = await runner.startAll();
  response.status(202).json(outcome);
});

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  console.error(error instanceof Error ? error.message : "Unexpected server error");
  response.status(500).json({ error: { code: "INTERNAL_ERROR", message: "The server could not complete this request." } });
});

app.listen(4000, () => console.log("Server listening on http://localhost:4000"));
