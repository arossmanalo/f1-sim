# F1 SIM

A local-first Formula 1 season and dynasty simulator rebuilt for the browser.

## Run locally

1. Install Node.js 24+ and pnpm.
2. Run `pnpm install`.
3. Copy `.env.example` to `.env` and add `GEMINI_API_KEY` if AI narrative is wanted.
4. During development, run `pnpm dev` and open `http://localhost:5173`.
5. For the production-style local app, run `pnpm build`, then double-click `start-f1-sim.cmd` (or run `./start-f1-sim.ps1`). To stop it later, double-click `stop-f1-sim.cmd`.

The simulator works without Gemini. When the provider is unavailable, canonical race events continue and narrative requests remain visibly queued.

## Data and verification

- `pnpm data:fetch 2005` creates a dated, checksummed Jolpica snapshot under `data/snapshots`.
- `pnpm typecheck` validates every TypeScript workspace.
- `pnpm test` runs deterministic simulation, standings, dynasty, and rating-derivation coverage.
- `pnpm build` produces the server bundles and the installable offline PWA.

## Current scope

The first vertical slice contains complete editable 2005 and 2026 presets, deterministic qualifying and lap simulation, sprints, scoring, weather, tires, pit strategy, incidents, flags, penalties, sandbox intervention, standings, save branching, void-and-rerun, IndexedDB persistence, JSON backup/restore, a contract market, offseason proposals, and Gemini-backed narrative.

Historical expansion uses immutable, versioned data snapshots. Existing universes never change when source data is refreshed.

The built-in catalog intentionally starts with the 2005 and 2026 vertical slices. The ingestion and within-era rating tools are ready for the remaining seasons, but those presets must be reviewed and calibrated era by era before being exposed in the season selector.
