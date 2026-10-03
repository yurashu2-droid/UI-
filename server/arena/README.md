# Local asynchronous arena

This is a real HTTP backend with independent browser guest sessions and durable stored opponent snapshots. It is intentionally bound to `127.0.0.1`; it is not a public deployment.

## Run

In one terminal, `npm run arena`. In another, `npm run dev`, then open the online entry in the game. Vite proxies `/api/arena` to port 5180. The default durable file is `.local/arena/store.json`, excluded from Git. `ARENA_PORT` and `ARENA_STORE` may select a separate local test instance.

Two independent browser profiles/contexts get separate HttpOnly guest cookies. Publish a legal build in one, close that client, then request a battle in the other. With a new, empty store there are no opponents: the game reports this and charges no currency or lives. There are no bundled fake player ghosts. Guest sessions expire after 24 hours of inactivity. Successful commands, identical-command retries and explicit session resumes renew the existing server session and its browser cookie together. A retry changes only session expiry; gameplay and rewards are not repeated. Read-only state/match requests and rejected commands do not extend that deadline. The app does not create external accounts or OAuth grants. An expired/unknown existing cookie produces an explicit error and leaves the old run untouched. Starting a fresh guest is a separate UI action, not an implied recovery of the old run.

## Rules and trust boundary

`DEFAULT_ARENA_RULES` is independent from the offline campaign: 8 rounds, 3 lives, starting cash 10; income is 6 plus a win bonus 4 plus half combat income capped at 10. A loss or draw consumes one life. A surviving loss advances; a win offers one persisted reward selection, then advances. Initial rating is 1000; provisional rating changes are +16 for a win, -16 for a loss (minimum 0), 0 for a draw. These are versioned test rules, not Elo or a production ranking system.

The server owns purchases, shop rerolls, ownership, money, geometry validation, fusion, capacity plans, admin unlocks, round/life/win/rating state, match assignment, results and reward receipts. Browser save JSON is never imported. Only canonical UI IDs, legal geometry and routing enter snapshots; labels, captured artwork, URLs and source provenance do not.

Matching requires the same arena/combat/catalogue versions and round/resource eligibility. Similar wins and rating are preferred. Own builds are excluded, and recent opponents are avoided where alternatives exist. Snapshots are immutable once assigned to a match. Fighting a historical ghost does not mutate its owner's current run.

Every command carries a command ID and expected run revision. A transport retry uses the same command ID. Undeclared command fields, forged inventory and source metadata are rejected. The client preserves uncertain HTTP 5xx commands for retry, rejects stale responses using server revisions, and bounds requests with a timeout. Settlement and reward claims also have durable match-level guards. The simulation runs shared combat at exactly 20 Hz and stores both sides' statistics, the input digest, events, replay digest and frozen reward templates. Results already assigned under an older ruleset can still settle/claim; continuing play requires a new-version run. Browser and server share the gameplay-catalogue projection. Before animation the browser checks that fingerprint and reproduces the complete fixed-tick event digest, winner and final tick. Mismatches stop playback without changing the authoritative result or rewards. Native popup, cache, recovery and conversion displays use shared tick-derived feedback scoped to the online panel.

## Storage and operations

This implementation supports one local service process per store. Atomic replacement and file/directory sync protect acknowledged transactions. A process lock prevents concurrent writers; only a confirmed dead PID lock is recovered after a crash. Invalid storage is preserved and causes startup to fail, rather than resetting players. Back up the store only after stopping the service.

This is a development persistence model, not a production-scale service. Public hosting, TLS, durable managed backups, account recovery, large-scale retention/quotas and abuse monitoring have not been configured. They need an explicit deployment decision. No payment, public endpoint or external credentials are required for local verification.

## Verification

`node --import tsx --test tests/online*.test.mjs tests/qa-online*.test.mjs`

The suite covers independent actual HTTP cookie sessions, a disconnected ghost owner, graceful and killed-process restart, fixed match recovery, one-time settlement, invalid commands/placement/routing, expired identities, transient HTTP failures before/after commit, both response-order races, full-composition and competing recipe choices, replay compatibility, eight-round completion and three-life game over (including draws). Progression tests explicitly use test-only past-round checkpoints; they are not opponent seeds loaded by the production service and do not establish game balance. Internet reachability and visual browser behavior are separate acceptance checks.
