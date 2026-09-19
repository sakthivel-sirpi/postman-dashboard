import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { CollectionDescriptor, SkippedFile } from "./types";

type Mapping = Record<string, string>;

export function slugify(fileName: string): string {
  return fileName
    .replace(/\.json$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function countRequests(items: unknown): number {
  if (!Array.isArray(items)) return 0;
  return items.reduce((count, item) => {
    if (!isRecord(item)) return count;
    return count + (isRecord(item.request) ? 1 : 0) + countRequests(item.item);
  }, 0);
}

export interface Catalog {
  collections: CollectionDescriptor[];
  skipped: SkippedFile[];
}

export async function scanCatalog(collectionsDir: string, mapping: Mapping): Promise<Catalog> {
  const entries = await readdir(collectionsDir, { withFileTypes: true });
  const collections: CollectionDescriptor[] = [];
  const skipped: SkippedFile[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".json")) continue;

    const fileName = entry.name;
    const fullPath = path.join(collectionsDir, fileName);
    let parsed: unknown;

    try {
      parsed = JSON.parse(await readFile(fullPath, "utf8"));
    } catch {
      if (Object.hasOwn(mapping, fileName)) {
        collections.push({
          id: slugify(fileName),
          fileName,
          name: fileName,
          requestCount: 0,
          environment: mapping[fileName],
          collection: null,
          parseError: "Collection JSON could not be parsed."
        });
      } else {
        skipped.push({ fileName, reason: "Invalid JSON." });
      }
      continue;
    }

    if (!isRecord(parsed)) {
      skipped.push({ fileName, reason: "JSON root must be an object." });
      continue;
    }

    if (isRecord(parsed.info) && Array.isArray(parsed.item)) {
      collections.push({
        id: slugify(fileName),
        fileName,
        name: typeof parsed.info.name === "string" ? parsed.info.name : fileName,
        requestCount: countRequests(parsed.item),
        environment: mapping[fileName] ?? null,
        collection: parsed,
        parseError: null
      });
      continue;
    }

    if (Array.isArray(parsed.values)) continue;
    skipped.push({ fileName, reason: "Not a Postman collection or environment." });
  }

  return { collections: collections.sort((a, b) => a.name.localeCompare(b.name)), skipped: skipped.sort((a, b) => a.fileName.localeCompare(b.fileName)) };
}

export function flattenRequests(collection: Record<string, unknown>): Array<{ folder: string | null; name: string }> {
  const flattened: Array<{ folder: string | null; name: string }> = [];

  function visit(items: unknown, folders: string[]): void {
    if (!Array.isArray(items)) return;
    for (const item of items) {
      if (!isRecord(item)) continue;
      const name = typeof item.name === "string" ? item.name : "Unnamed request";
      if (isRecord(item.request)) flattened.push({ folder: folders.length ? folders.join(" / ") : null, name });
      visit(item.item, [...folders, name]);
    }
  }

  visit(collection.item, []);
  return flattened;
}
