# Convex Library Persistence

The `3d-prints` Vercel project is connected to Convex through the Vercel Marketplace resource `convex-cinereous-park`. The integration provisions `CONVEX_DEPLOY_KEY` for Vercel builds and local deployment commands.

## Runtime Model

Convex stores three kinds of library records:

- `models`: source catalog entries.
- `versions`: saved parameter states and forks for source models.
- `brochures`: durable generation jobs and their completed image sets.

Generated STL snapshots are stored in Convex File Storage. A saved version contains both the parameter snapshot and, when the viewer has finished loading, a generated STL snapshot for download.

## User Flows

- Save: uploads the current generated STL to Convex Storage and inserts a `versions` record with model id, params, unit, current theme metadata, and file name.
- Fork: creates a new version with `source: "fork"` and links to the active saved version when one is open.
- Open: rehydrates a saved version into the viewer by restoring model, unit, params, URL state, and active version id while preserving the current local theme preference.
- Selected-model sidebar view: shows saved versions and forks scoped to the active model, plus direct generated-STL links when available.
- Brochure generation: the browser captures four CAD reference views and submits them once. The Vercel function acknowledges the job, continues image generation in the background, uploads all four results to Convex Storage, and marks the job complete or failed. The job is not tied to the preview or tab lifecycle; completed brochures appear in the same client library on a later visit.

Arbitrary STL upload is intentionally not supported yet. It would require model metadata capture, viewer routing, parameter schema authoring, audit setup, and safer file validation beyond the current saved-version workflow.

## Local Development

The React app enables Convex only when `VITE_CONVEX_URL` is present and `VITE_DISABLE_CONVEX` is not `true`. Without a connected runtime, or when Convex returns an error, the model sidebar and workspace actions menu render a persistence-offline note so the catalog and model viewer stay usable.

For connected local development, run Convex and copy the generated URL into `.env.local`:

```bash
npx convex dev
```

## Vercel Deployment

Vercel uses `vercel.json` to run:

```bash
npm run build:vercel
```

That script runs:

```bash
npx convex deploy --cmd 'npm run build:app' --cmd-url-env-var-name VITE_CONVEX_URL
```

Convex deploys the backend first, then injects the deployment URL into the Vite build as `VITE_CONVEX_URL`. Production uses Convex by default; set `VITE_DISABLE_CONVEX=true` only as a temporary kill switch when the hosted deployment is unavailable.

## Audit Points

- `convex/schema.ts` defines `models` and `versions`.
- `convex/library.ts` owns generated-STL upload URLs, catalog seeding, saved versions, forks, and library listing.
- `convex/brochures.ts` owns brochure job status, output storage URLs, completion, failure, and client-scoped history.
- `api/brochure.ts` accepts brochure jobs and uses Vercel background processing to finish generation and persistence after returning `202 Accepted`.
- `src/LibraryPanel.tsx` owns the Convex Save and Fork controls plus shared library messaging.
- `src/App.tsx` owns the model sidebar, STL blob generation, and saved-version rehydration.
