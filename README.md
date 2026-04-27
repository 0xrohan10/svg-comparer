# SVG Comparer

A local-first SvelteKit app for comparing two SVG files and scoring how similar they are.

The app is designed for ephemeral comparison: SVGs are read in the browser tab, previewed with object URLs, and never uploaded to an application server.

## Features

- Compare two `.svg` files side by side.
- Drag, drop, or click each preview pane to add or replace an SVG.
- See a primary combined similarity score.
- Inspect the score breakdown for structure and visual similarity.
- Reset the comparison without refreshing the page.
- Reject invalid SVGs and SVGs with external references.

## Scoring

The final score is a fixed blend:

- `50%` coordinate / structure similarity.
- `50%` visual raster similarity.

The coordinate / structure score is itself a pragmatic blend of:

- normalized shape-mask similarity, based on alpha/paint occupancy after rendering both SVGs into the same normalized canvas
- normalized SVG token similarity, based on visible geometry and styling tokens

The visual score rasterizes both SVGs to the same canvas size and compares pixel differences.

This is intentionally an MVP similarity heuristic, not a full SVG semantic equivalence engine. It should handle common icon comparisons well, including cases where one SVG uses a white overlay and another uses transparent negative space.

## Project Structure

```text
src/routes/+page.svelte             # UI, upload state, previews, score display
src/lib/svg-comparison/index.ts     # validation, parsing, rasterization, scoring
src/routes/health/+server.ts        # lightweight health endpoint for local runtime checks
```

Core comparison code lives in `src/lib/svg-comparison` so it can be tested or reused independently of the Svelte page.

## Development

Install dependencies:

```sh
bun install
```

Start the development server:

```sh
bun run dev
```

## Build And Run Locally

Create a production build:

```sh
bun run build
```

Run the built Node server locally:

```sh
HOST=:: PORT=8080 bun run start
```

## Quality Checks

Run Svelte and TypeScript checks:

```sh
bun run check
```

Run formatting and lint checks:

```sh
bun run lint
```

Format the project:

```sh
bun run format
```
