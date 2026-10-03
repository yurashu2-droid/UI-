# UI RAID development branch

Ongoing development is delivered on `feat/raid-balance-async`. See [the current checkpoint](../DEVELOPMENT_CHECKPOINT.md) for the incremental history, current scope and verification limits. The main branch and public hosting are unchanged.

## Current user-facing workflows

- `npm run dev:local` starts the existing local client and arena together, checks both health paths and cleans up only its own child processes
- Mode-aware help distinguishes the canonical story, legacy campaign and laboratory; paid transactions and save recovery preserve inventory and editor-history boundaries
- Placed parts support keyboard selection and retain focus through keyboard move/undo/redo repaints when the same part remains available; edited labels identify wrappers and combat targets, and ordinary/fused native video titles reflect their labels. Inspector guidance limits visible-text changes to supporting standard artwork
- The laboratory catalogue contains twenty-four fictional, original-code templates and twenty-eight experimental UI definitions. PATCHBOARD, POSTROOM and WEEKGRID reuse existing mechanics; template order and normal acquisition exclusions remain protected
- Reviewed source CSS follows actual document order, and uncertain arena operations retain command identity through explicit retryable HTTP 408/429 recovery within the open panel. Recovered placement/Undo/Redo apply their local history effect once; authoritative run/revision changes invalidate obsolete history
- Paid-reachable navigation and supported-link examples document inventory value, cumulative spending, CPU limits, finite recovery paths and losing controls rather than universal balance guarantees

## Earlier continuity fixes

- Prevent delayed file imports from overwriting a newer import, paid edit, reopened mode, new story or active battle; release only the latest file selection, including successful story imports
- Give conditional, reversible advice about holding paid bridge UI under overload, preserving ownership and showing why the same choice can hurt after capacity upgrades

## Previous additions

- Recheck accepted save snapshots at the active IndexedDB write-transaction boundary; a delayed older mirror cannot replace newer recovery inventory
- Add an ordinary $28/CPU9 directional-replay navigation example, with actual paid acquisition, retained-inventory overload and HP-dependent matchup caveats

## Current implemented continuation

- Protect legacy campaign/lab saves against stale-tab overwrites, keep rejected writes out of the profile mirror, and provide an explicit reload-latest action
- Keep a newly reopened story workshop interactive when the previous dialog's queued close event arrives
- Load optional online and URL panels on demand, with retry and disposal protection
- Select arena opponents by distinct guest owner, avoid recent owners across historical runs, and exclude orphan snapshots
- Show actual cache targets, support state and the shared rate-limit budget inside existing native controls
- Preserve Books price and availability text in the same approximate product appearance; ignore print-only, conditional and non-CSS style elements
- Add a small, paid-reachable search/document player preset without changing the 35 saved laboratory opponent indices

## Run locally

Use Node.js 22.12 or later. Run `npm ci`, then `npm run dev:local` to explicitly start Vite and arena together. Wait for the direct/proxied arena-health ready message, then open http://127.0.0.1:5178/. Ctrl+C stops only this launcher’s children; conflicting ports are rejected without touching their owners. The two-terminal `npm run arena` plus `npm run dev` flow remains available, and `npm run dev` alone still starts only Vite. `npm run build` builds the client. `npm run preview` also needs the arena process for online features. Static `dist/` hosting does not provide ingestion or online APIs.

The arena remains a local, single-process development service. Runtime data and guest sessions under `.local/` are not committed. Owner-level matching fairness does not prevent a person from creating multiple guest identities.

## Versions and source limits

Canonical combat is combat-v4; combat-v2/v3 remain explicitly versioned replay paths. Temporary server pressure remains opt-in in the laboratory and excluded from story, campaign, URL battles and online commands. The story keeps its existing 15 battles and 8 stages.

Exactly two source roots are allowlisted: Books to Scrape and Example. A source only produces a legal approximate opponent if its fetched HTML contains supported static UI. The recorded Books response reconstructs; the observed Example response returns `no-playable-elements`. Source JavaScript never runs. The latter is an observation from this environment, not proof of an upstream change. This is not arbitrary-site or screenshot-faithful reconstruction.

## Verification

Run `npm test`, `npm run typecheck`, `npm run builds`, `npm run simulate -- --json`, and `npm run build`. The publication commit records results for the frozen source tree. Behavioral tests include real engine and HTTP/process tests plus explicitly labeled DOM adapters.

Actual browser pixels, live click acceptance, responsive readability and load timing remain unverified because this environment's browser route is blocked. No workaround was used. Public deployment, TLS, operational backups, account recovery and production-scale online operation remain unconfigured.
