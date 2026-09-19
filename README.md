# Postman Collection Dashboard

## What it is

This is a local dashboard for discovering Postman collections, running them through Newman, and reviewing request-level results. The server reads collection files from the configured directory; the client uses the server API for inventory, runs, summaries, and details.

```text
Browser -> Vite client -> Express server -> Newman -> collection files
```

## Project structure

```text
.
├── client/                 React, Vite, and Tailwind UI
├── server/
│   ├── config/mapping.json Exact collection-to-environment mappings
│   └── src/                Express API, catalog scanner, runner, and result store
├── package.json            Workspace scripts
└── README.md               This guide
```

## Prerequisites

Node.js 22.23.1 was used to verify this checkout. The repository does not declare a Node.js version pin.

## Quick start

From the project root:

```sh
npm install
cp server/.env.example server/.env
cp client/.env.example client/.env
npm run dev
```

The root command starts the Vite client and the Express server together.

## Environment variables

### Server

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `COLLECTIONS_DIR` | Yes | None | Directory containing collection and environment JSON files. |
| `RESULTS_FILE` | No | `server/data/results.json` | Persistent file for sanitized run state and results. |

The server loads `.env` with `override: false`, so values already present in the process environment take precedence.

### Client

The client reads no `import.meta.env` variables. `/api` is proxied to the server by `client/vite.config.ts`.

## How collections are discovered

- The server examines `.json` files in `COLLECTIONS_DIR` whenever a list-related API request scans the catalog.
- A JSON object with top-level `info` and `item` fields is treated as a collection.
- A JSON object with a `values` array is treated as an environment and is not listed as a collection.
- Other JSON files are listed under Skipped files with a reason.
- Invalid JSON in a mapped collection remains visible with `error`; invalid JSON in another file is skipped.
- Nested request items are counted recursively.
- The collection ID is the lower-case filename without its extension, with non-alphanumeric runs converted to hyphens.
- The display name is `info.name`, falling back to the filename.

## Collection-to-environment mapping

`server/config/mapping.json` maps exact collection filenames to exact environment filenames:

```json
{
  "example.postman_collection.json": "example.postman_environment.json"
}
```

An unmapped collection runs without an environment and is shown with a “No environment” badge. Mapping entries are read when the server starts, so restart the server after changing the mapping file. New collection files are discovered on the next list request.

## How a run works

Collection statuses are:

- `idle`: no current run.
- `running`: queued or actively executing.
- `passed`: the run completed with no failed request.
- `failed`: at least one request failed.
- `error`: the collection could not be parsed or Newman/environment execution threw an error.

A request is failed when it has a request error, an HTTP response status of 400 or higher, or one or more failed assertions. A collection is `failed` when any request meets one of those rules.

Newman uses a 30-second per-request timeout. Run All marks eligible collections as `running` immediately and executes at most two runs concurrently. Collections already running are skipped. On startup, persisted `running` statuses are reset to `idle`.

## API reference

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/collections` | Rescan and list collection summaries. |
| `GET` | `/api/skipped` | List files skipped during catalog scanning. |
| `GET` | `/api/summary` | Return aggregate dashboard KPIs. |
| `GET` | `/api/collections/:id/result` | Return the latest detailed result for a collection. |
| `POST` | `/api/collections/:id/run` | Queue one collection run; rejects an already-running collection. |
| `POST` | `/api/run-all` | Queue all eligible collections with a concurrency limit of two. |

## Security and data handling

- The mapped environment file is read into memory for a run and is never written back.
- Only environment values that are at least six characters and have type `secret` or a key matching `token`, `secret`, `key`, `password`, or `auth` are redacted.
- HTTP(S) base URL values and shorter values are not redacted. Longer sensitive values are replaced first.
- Request headers and request/response bodies are never stored or returned.
- `results.json` contains collection state, timestamps, durations, aggregate statistics, and sanitized endpoint details: folder, request name, method, URL, response code/time/size, assertions, and request errors.

> **Warning:** Run and Run All send real HTTP requests, including POST, PUT, and DELETE requests. Check the environment’s base URL and values before running a collection.

## Troubleshooting

- **Paths with spaces:** quote the `COLLECTIONS_DIR` value in `server/.env`.
- **Unresolved `{{variables}}`:** confirm the exact mapping filename and that every required variable exists in the selected environment or collection.
- **Port already in use:** stop the process using the client or server port, then run `npm run dev` again.
- **Collection missing from the list:** confirm it is a readable `.json` file with top-level `info` and `item` fields and that it is inside `COLLECTIONS_DIR`.
- **Stuck status:** restart the server; persisted `running` statuses are reset to `idle` during startup.

## How to add a new collection

1. Add a valid Postman collection JSON file to `COLLECTIONS_DIR`.
2. Add its exact filename and optional environment filename to `server/config/mapping.json`.
3. Restart the server if the mapping changed.
4. Refresh the dashboard; the next catalog scan will show the collection.
