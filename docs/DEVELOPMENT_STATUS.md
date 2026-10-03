# UI RAID development branch

Ongoing development is delivered on `feat/raid-balance-async`. See [the current checkpoint](../DEVELOPMENT_CHECKPOINT.md) for the incremental history, current scope and verification limits. The main branch and public hosting are unchanged.

## Current user-facing workflows

- Local import retains one verified approximation transiently for the same tab/laboratory run/profile. Loss → edit own board → reopen → explicit resume reuses it without another file read, parser or fetch; no automatic challenge/reward. Pending wins retain priority. Clear removes only return memory, and stale owner/async completion cannot repopulate it. Accepted selection is painted before optional retention verification, keeping the visible and challenged opponent identical even after cancellation
- Online own placed wrappers support Enter/Space selection from focus. Same-item reselection preserves uncommitted inspector fields; focus follows only the synchronous replacement. Native child controls, stale/opponent nodes, drag/battle/pending operations and modified key chords retain their existing behavior; selection sends no server command
- Native Follow preview and one-way battle feedback share the direct glyph/pressed-state setter, fixing a visible plus-sign versus followed-state mismatch without replacing authored labels, children or listeners

- Laboratory-only local import accepts one explicitly selected UTF-8 HTML file (512 KiB) and optionally one CSS basename file (256 KiB); eligible embedded styles plus that selected sheet must also fit 256 KiB. Selection and analysis are separate actions. Exactly one eligible same-directory-shaped `name.css` / `./name.css` link must match the selected basename; actual directories are not inspected. Unmatched, ambiguous, path and URL cases are rejected without fallback fetching
- A single disposable module Worker performs bounded inert parsing under a 5-second deadline including reads. Cancel, replacement and stale-owner checks preserve the previous opponent/rewards. Native file reads can finish after cancellation but cannot start stale work or change selection; unsupported Workers have no synchronous parser fallback
- Local HTML supports the existing semantic/static subset and synthesized game geometry, not arbitrary div/canvas UI, JavaScript applications or source-pixel fidelity. Source scripts, source iframes, raw HTML/CSS injection, asset/font/image requests, directory/ZIP traversal and third-party upload are excluded; the two public URL roots remain unchanged
- Local appearances are acquired only through laboratory battle → victory → explicit claim. App and domain gates exclude local captures from story cache/energy/receipts and campaign challenge/claim. Outside the laboratory, local pending rewards are retained with recovery guidance while eligible public pending rewards keep priority. Existing cosmetic reskin rules remain available without adding campaign/online acquisition
- `source.kind: local-file` and `local://<HTML SHA-256>` distinguish provenance without filenames, filesystem paths or raw source. This is an additive source kind within schema 1: old builds reject new local captures. Existing public/fixture capture hashes and old archive bytes are not resealed; archive envelope, add-only restore rules and limits remain unchanged
- Selecting the original SIDECHANNEL breadcrumb exposes history/PDF placement buttons through real editor Undo/Redo. Only that owned ID's x/y changes; labels/skins remain intact. Modified inventory/geometry, non-editable state and stale controls refuse the action. This neither starts battles nor resets the layout or promises an outcome
- Story workshop UI棚 → UIの取引を開く restores a minimized crawl/shop window through existing window-manager show behavior, preserving its layout and the story/economy rules

- Subscription previews restore the exact authored label when toggled off; dedicated label/status children preserve native state and handlers while battle registration remains one-way
- Previously unnamed voice and notification icon controls expose accurate local-preview action names/tooltips, with no recording, notification permissions or external behavior
- Captured Books navigation keeps its visible source name on the original live anchor, including same-host fallback, while preserving native text/href/events, local navigation prevention and stored identities
- Existing arena-session resume and same-command receipt recovery avoid deep-copying the gameplay archive. Pre-rename rollback, detached views, other-session isolation and restart semantics remain protected; full-file durable writes and unbounded historical retention remain explicit limitations

- Separate local collection archives carry acquired appearances/provenance plus complete referenced captures, with a read-only count/conflict preview and explicit add-only atomic restore. Existing IDs/timestamps are preserved, identical records are no-ops, and pending/discarded/same-ID conflicts cannot reopen rewards or partially overwrite data
- Archive-only transport limits are 256 acquired entries/captures and 16 MiB UTF-8; oversized or incomplete exports fail without truncation. These are not collection storage quotas. Run/story JSON and pending URL rewards remain separate; unsigned consistency hashes do not authenticate a real victory
- Collection backup code/controls load on demand. Current-dialog and transaction-boundary guards reject stale callbacks or obsolete pending writes; successful persistence is distinguished from a later display-refresh failure
- SIDECHANNEL adds original, static chat-workspace chrome around four existing parts ($20/CPU8). A single breadcrumb moves 15% acceleration between history and PDF, with an explicitly phase-conditioned fixed-window example, alternate attack timing/size controls and cheaper-opponent losses. Existing 39 opponent/25 template indices and 82 combat definitions remain unchanged

- Native pagination advances numeric pages with boundary-disabled arrows and current-page semantics; preview remains local-only, while battle feedback keeps numeric wraparound and tab/font behavior
- Accordion accessible expansion state follows the existing preview and battle collapse/reopen feedback; disabled synthetic clicks cannot pulse or change preview state
- Captured Books purchase controls retain their visible source action name in accessible labeling; source-plus-canonical scene/reward identity survives victory, durable reward recovery and trophy reload without changing stored IDs or native state
- Online replay no longer hides recovery for an unresolved settlement or reward claim. Explicit receipt recovery keeps its original command identity, with exactly-once resources and disposal/reopen safeguards

- Stashed items retain edited-label plus canonical identity in bounded visible rows and full title/accessible names; existing IDs, placement, saved labels and ownership stay unchanged
- Focus owned by a replaced loading Close/retry follows only the same live optional dialog control; online connection rerenders preserve a currently focused Close. Native cancellation disposes pending delivery before its queued close event, while result-save prevention remains intact
- A genuinely paid routing-only comparison separates charge pooling from stronger conversion and explicitly reports overloaded-opponent, unequal-budget and startup-sensitivity limits

- Story workshop code and CSS load on first opening, with Close/retry and late-delivery disposal safety. State, persistence and combat stay synchronous. The isolated change removes 26,243 initial asset bytes but increases initial JS requests 4→6; startup plus first story use is 1,892 bytes larger in that isolated comparison, and browser timing remains unmeasured
- Optional story/online stylesheets have explicit success readiness, bounded failure cleanup and fresh manual retry; emitted-module DOM-event checks prevent a cached failed preload from mounting an unstyled screen
- Finished battle results separate measured gross income, accepted/spent/retained/unconverted charge and capped settlement payout. Missing historical telemetry is omitted, and stale ceremonies cannot overwrite newer battles
- Online availability guidance distinguishes a historical no-opponent outcome from current publication and explicit search from connection recovery; no live population or automatic waiting is claimed
- Containment guidance names the direct parent and distinguishes subtree move/stash from selected-only removal, with snapshot/editability boundaries and refresh after modal dismissal
- Native version-history feedback distinguishes eligible, used, expired, unneeded and empty records; only an observed eligibility loss contracts its marker/stem, with quiet repeated frames and reduced-motion fallback

- `npm run dev:local` starts the existing local client and arena together, checks both health paths and cleans up only its own child processes
- Mode-aware help distinguishes the canonical story, legacy campaign and laboratory; paid transactions and save recovery preserve inventory and editor-history boundaries
- Placed parts support keyboard selection and retain focus through keyboard move/undo/redo repaints when the same part remains available; edited labels identify wrappers and combat targets, and ordinary/fused native video titles reflect their labels. Inspector guidance limits visible-text changes to supporting standard artwork
- Offline/story income producers offer an engine-aligned nearby route selector with separate saved and effective destinations. Unavailable preferences remain visible and restore when eligible again; Auto removes the preference. Ordinary save/Undo boundaries, stale-control checks and focused-select restoration apply; the online selector now applies the same saved/effective distinction through authoritative commands and pending/drag/stale-control guards
- Converter inspectors name their engine-selected incoming charge sources and distinguish current-page placement from wiring. Source generation, charge acceptance and activation remain separate conditions
- The laboratory catalogue contains twenty-six fictional, original-code templates and twenty-eight experimental UI definitions. PATCHBOARD, POSTROOM, WEEKGRID, FRAMESET and SIDECHANNEL reuse existing mechanics; template order and normal acquisition exclusions remain protected
- Reviewed source CSS follows actual document order, bounded direct-child relationships and comment/string-aware declarations and inert-brace-safe rule boundaries, and uncertain arena operations retain command identity through explicit retryable HTTP 408/429 recovery within the open panel. Recovered placement/Undo/Redo apply their local history effect once; authoritative run/revision changes invalidate obsolete history
- Paid-reachable navigation, supported-link and commerce recovery examples document inventory value, cumulative spending, CPU limits, finite recovery paths and losing controls rather than universal balance guarantees. A genuine paid Instant Search hold/merge decision separates target-only from retained-inventory effects, acquisition spending, overload and hypothetical startup sensitivity

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

Public URL acquisition still allowlists exactly two source roots: Books to Scrape and Example. A source only produces a legal approximate opponent if its fetched HTML contains supported static UI. The recorded Books response reconstructs; the observed Example response returns `no-playable-elements`. Source JavaScript never runs. The latter is an observation from this environment, not proof of an upstream change. This is not arbitrary-site or screenshot-faithful reconstruction. The separate local-file importer reads only files explicitly selected by the user in the laboratory and does not expand server URL policy. See [the local walkthrough](../README.md) and [the importer boundary](../server/site-ingest/README.md#local-htmlcss-import-separate-laboratory-only-boundary).

## Verification

Run `npm test`, `npm run typecheck`, `npm run builds`, `npm run simulate -- --json`, and `npm run build`. The publication commit records results for the frozen source tree. Behavioral tests include real engine and HTTP/process tests plus explicitly labeled DOM adapters.

Actual browser pixels, native file-picker/cancel/reselect behavior, live click and assistive-technology acceptance, responsive readability and load timing remain unverified because this environment's browser route is blocked. No workaround was used. Public deployment, TLS, operational backups, account recovery and production-scale online operation remain unconfigured.
