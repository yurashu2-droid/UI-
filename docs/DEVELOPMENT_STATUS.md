# UI RAID development branch

This 2026-10-03 checkpoint advances `feat/raid-balance-async` from `0c9645b5534ad8bfbb1eaefa2fe11fa61d767fe4`. It includes canonical combat-v4, broader legal-composition studies, the service-form template, and a separately selected laboratory server-pressure prototype. See [the current checkpoint](../DEVELOPMENT_CHECKPOINT.md) for scope and limitations.

## Run locally

Use Node.js 22.12 or later. Run `npm ci`, then `npm run arena` in one terminal and `npm run dev` in another. Open http://127.0.0.1:5178/. `npm run build` builds the client. `npm run preview` also needs the arena process for online features. Static `dist/` hosting alone does not provide ingestion or online APIs.

The online backend is a local single-process development service. Runtime data and guest sessions under `.local/` are not committed. No public hosting has been deployed.

## Combat versions and experiments

Canonical combat is combat-v4; combat-v2/v3 remain explicitly versioned replay paths. Temporary server pressure is opt-in in the laboratory and excluded from story, campaign, URL battles and online commands. Its bounded fixture study is not global-balance certification.

## URL reconstruction

The two exact root pages `https://books.toscrape.com/` and `https://example.com/` can be fetched and converted into legal game-owned enemy UI through HTML/tag and bounded CSS analysis. The result is explicitly an approximate layout, not measured browser geometry or an exact screenshot. Source JavaScript is not executed. Unsupported origins are not accepted as an unrestricted proxy.

See `server/site-ingest/README.md` for the allowlist and rendering boundaries, and `server/arena/README.md` for the online trust and persistence boundaries.

## Verification

The publication snapshot is checked with `npm test`, `npm run typecheck` and `npm run build`. The exact results are recorded in the publication commit message. Tests include actual HTTP/process recovery, deterministic replay, story progression and durable reward contracts.

Actual browser pixel/layout acceptance remains unverified in this runtime. The production build also emits a bundle-size warning. Numerical balance is still under evaluation; experimental content and local rule variants are distinguished from the ordinary acquisition pools. Do not equate passing automated tests with final balance or visual approval.
