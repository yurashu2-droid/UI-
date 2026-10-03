# UI RAID development branch

This continuation of `feat/raid-balance-async` starts from delivery commit `783c2c063291ad7e6bfd4cf631f171f37eab4c47`. See [the current checkpoint](../DEVELOPMENT_CHECKPOINT.md) for the complete scope and limitations. The main branch and public hosting are unchanged.

## This increment

- Protect legacy campaign/lab saves against stale-tab overwrites, keep rejected writes out of the profile mirror, and provide an explicit reload-latest action
- Keep a newly reopened story workshop interactive when the previous dialog's queued close event arrives
- Load optional online and URL panels on demand, with retry and disposal protection
- Select arena opponents by distinct guest owner, avoid recent owners across historical runs, and exclude orphan snapshots
- Show actual cache targets, support state and the shared rate-limit budget inside existing native controls
- Preserve Books price and availability text in the same approximate product appearance; ignore print-only, conditional and non-CSS style elements
- Add a small, paid-reachable search/document player preset without changing the 35 saved laboratory opponent indices

## Run locally

Use Node.js 22.12 or later. Run `npm ci`, then `npm run arena` in one terminal and `npm run dev` in another. Open http://127.0.0.1:5178/. `npm run build` builds the client. `npm run preview` also needs the arena process for online features. Static `dist/` hosting does not provide ingestion or online APIs.

The arena remains a local, single-process development service. Runtime data and guest sessions under `.local/` are not committed. Owner-level matching fairness does not prevent a person from creating multiple guest identities.

## Versions and source limits

Canonical combat is combat-v4; combat-v2/v3 remain explicitly versioned replay paths. Temporary server pressure remains opt-in in the laboratory and excluded from story, campaign, URL battles and online commands. The story keeps its existing 15 battles and 8 stages.

Exactly two source roots are allowlisted: Books to Scrape and Example. A source only produces a legal approximate opponent if its fetched HTML contains supported static UI. The recorded Books response reconstructs; the observed Example response returns `no-playable-elements`. Source JavaScript never runs. The latter is an observation from this environment, not proof of an upstream change. This is not arbitrary-site or screenshot-faithful reconstruction.

## Verification

Run `npm test`, `npm run typecheck`, `npm run builds`, `npm run simulate -- --json`, and `npm run build`. The publication commit records results for the frozen source tree. Behavioral tests include real engine and HTTP/process tests plus explicitly labeled DOM adapters.

Actual browser pixels, live click acceptance, responsive readability and load timing remain unverified because this environment's browser route is blocked. No workaround was used. Public deployment, TLS, operational backups, account recovery and production-scale online operation remain unconfigured.
