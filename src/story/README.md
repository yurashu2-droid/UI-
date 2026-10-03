# Story integration contract

This module follows the supplied THE LAST BROWSER story. It contains eight stages and fifteen main-route encounters. Stage IDs are not legacy round numbers. All authored encounters and archive screens are local fiction.

## Current application integration

The title and main menu open the story workshop. `app.ts` uses `session.ts` to connect the existing editor, authored battle engine inputs, paid shops, rewards and final placed hyperlink. The editor continues to show the player’s own named page. `THE LAST BROWSER` and the legacy eight-round expedition have distinct menu entries. From the workshop, UI棚 → “UIの取引を開く” returns to the editor and calls the existing `wm.show("crawl")`, restoring a minimized crawl/shop window without resetting its saved size or position. This changes navigation recovery only, not plot, shop rules or progression.

One `ui-raid-last-browser-v1` local-storage payload contains the run, story progress, guaranteed-item inbox, protected tutorial item IDs, optional-analysis cache and receipts. It never replaces legacy or online profile keys. Successful writes compare against the last observed raw payload to reject stale-tab saves. This is an optimistic conflict guard, not a cross-process compare-and-swap primitive.

A failed final battle settlement remains in memory behind a guarded retry/export screen. Escape and generic close do not discard it. The player can explicitly abandon the unsaved outcome and reopen saved progress after a confirmation. Export during this condition includes the completed outcome, allowing recovery.

Story URL captures use the URL-raid panel’s validated `onCaptured` handoff. A successful capture and its energy receipt are committed in the same story payload; a failed or stale save leaves the previous selection and energy intact. Cached mode selects a matching stored URL without fetching. Optional URL trophies use the shared collection ledger with legacy-profile writes disabled. Local-file reconstruction is laboratory-only: session validation rejects local captures in `analysisCache`, `cacheStoryAnalysis` rejects them before energy/receipt changes, and cache lookup excludes them. App and domain guards also reject local challenge/claim outside the laboratory. A pending local victory is retained, skipped when opening this panel from the story, and accompanied by guidance to reopen it in the laboratory; an eligible public pending reward still takes priority over a new request. Previously acquired local cosmetic skins may follow the existing owned-canonical-part reskin rules, but importing HTML is not a story or online acquisition route.


## Host ownership

The host owns inventory, editor, battle engine, currency, life rules, profile persistence and external URL analysis. Store `StoryState` with the story build in a dedicated profile, separate from the legacy campaign and the online run. Do not overwrite either of those saves.

Import the domain functions from `story/index.ts`, and import `styles/story.css` once in the app. `mountStoryHub` accepts callbacks and does not import app state. It creates no global listeners and returns `render` and `dispose`.

`onCommand` must persist an accepted transition and update `getState()` before resolving. Apply its returned effects in the same host transaction. Re-rendering does not award anything. Required chapter records are inserted by a main-route victory; they are independent of randomized UI loot and external URL success. `collect-record` acknowledges an already-owned record.

## Battles and recovery

1. Read `currentStoryEncounter` and generate a **fresh UUID for every attempt**, including after cancellation. Never reuse a canceled match ID.
2. Apply `start-encounter` and persist the pending match with the build snapshot before starting the existing battle engine.
3. Settle the actual engine result through `resolve-encounter` with exactly that match ID. Apply narrative progress and the host's economy settlement atomically. Replayed settled match IDs emit no new effects.
4. Apply any real engine fusion to the build once per match, and report the first actual fusion via `witness-fusion`. This ability stays recorded even after the resulting UI leaves the board.
5. On interruption, the hub exposes `cancel-encounter`. The host aborts/discards callbacks from the old attempt before allowing a new attempt. The session also tombstones canceled match IDs. Cancellation awards no victory, record or money. A late callback cannot settle a different pending match.

Main-route loss never advances story threat or grants the chapter record. The host can retain its agreed failure rule. `StoryState` deliberately does not add a second life or insolvency system.

## Guaranteed first fusion

The canonical second stage should introduce an actual fusion without random-shop dependence. The existing cross-culture recipe `ab_mail` + `am_coupon` -> `am_newsletter` is a suitable guaranteed tutorial kit. Host integration should grant the kit once on second-stage entry, give a clear placement hint and invoke `witness-fusion` when the existing engine fuses it. The reducer emits `fusion-kit` on stage-two entry and gates departure from stage two on `fusionWitnessed`. The host wires the guaranteed kit, overflow-safe delivery and a local `onPracticeFusion` rehearsal that applies the real `R.fuse` rules without another network request or main-route victory. This rehearsal remains available even if both second-stage encounters are already complete, preventing a battle-end-only fusion softlock.

## Machine energy

Main-route connections have supplied energy and remain available at zero optional-analysis energy. Optional new analyses cost 1, explicit reanalysis costs 2 and reuse of an existing saved result costs 0. The host must verify that a requested cached result actually exists and must not silently perform a new scan for free. Charge via `spend-analysis` using a unique receipt only after a successful analysis, atomically with saving its result. The hub neither fetches nor charges by itself. Actual network validation, SSRF protection and capture validation remain the URL-raid module's responsibility. Story hidden-network routes are fictional and never use real dark-web access.

## Ending

`ARCHIVE_COORDINATES` uses explicitly fictional `.example` coordinates and an authored date because the supplied story did not specify their literal values. No archive service is called. The eight required records reveal the archive UI. Opening the past record, restoring a present copy, granting a link and opening that link are separate persisted actions.

`ending-link-granted` means add one canonical hyperlink UI to the player's page/collection, targeting the local restored-page view. It must not navigate the player's real browser. `visit-restored-page` increments the present copy's visitor counter once as the ending event; reloads, rerenders and repeated commands do not increment it. The archived copy and owner remain in the past. No new message from the owner is generated.

## Verification status

Domain, real-engine session and fake-DOM interaction tests cover save reload, order, replay protection, naming, local layouts, machine separation, URL handoff, interrupted battles, duplicate clicks and dispose-while-awaiting. Independent QA traverses all authored encounters through the ending using an intentionally strong legal mixed build. That test proves transactions and persistence, not ordinary acquisition balance. Paid progression is measured separately by `scripts/story-progression-benchmark.ts`.

These checks do not constitute browser screenshot, native click, keyboard or assistive-technology acceptance. The workshop shop-window recovery and ending still require supported-browser review; the browser route in this environment remains blocked.
