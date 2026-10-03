# Combat v4: bounded repeated 1-Click cadence

## Current local rule

New local battles default to `combat-v4`. This version inherits the full v3 navigation correction and adds one narrow rule: pages with at most two **placed** `am_oneclick` parts behave exactly as before. With three or more, **every placed copy's natural clock** is multiplied by:

`1 + 0.25 × max(0, placedCopies − 2)`

The initial remaining time receives the same multiplier. Held inventory does not count, and separating copies into different visual groups cannot bypass the pagewide rule. At three copies the multiplier is 1.25; at four it is 1.50. Aggregate expected natural throughput still grows as copies are added, with diminishing returns.

This is an explicit game abstraction for repeated identical UI, not a statement about HTTP behavior, a simulated network limit or a change to server CPU. Prices, recipe ingredients, CPU load, natural base damage, income growth, charge routing, charge spending and $3→20 conversion damage are unchanged. Other commerce parts are unchanged.

## Why this narrow change

The [open-composition study](open-composition-search.md) found a completed four-copy package that swept five selected opposing geometries under all 36 opposing administrator pairs, using one fixed server+backup pair. [Causal probes and adaptive searches](repeat-oneclick-probe.md) identified support-boosted natural cadence as the primary mechanism. Removing conversion damage or income-based damage growth did not remove that sweep.

The smaller 0.25 repeat-after-two candidate changes the old board's best administrator result from 180 wins to 156 wins, 5 draws and 19 losses in that selected set. Both sides exhaust all 36 pair choices. Adaptive composition searches then find stronger onestop, link-defense and mixed single-copy Cart alternatives; those results do not certify a balanced universal cycle or solved metagame. Each sampled adaptive shortlist still has an11/11 leader, so new dominant packages remain follow-up work.

The independent candidate audit reproduced 52,152 causal/admin/adaptive-search battles and7,824 historical paid-route replays. The saved paid inputs contained at most two placed1-Click parts, and their full event traces/results/income remained unchanged. This is preservation of those historical inputs, not a new execution of every transaction or an optimal-play acquisition claim.

## Implementation and truthful display

- `ONECLICK_CONTENTION` records the threshold and weight in `combat-rules.ts`
- `E.analyze` reports pagewide copy count, multiplier and a game-rule explanation only for v4. It leaves the underlying support-speed modifiers unchanged
- `E.naturalPeriod` is shared by battle construction and the inspector. It combines native cooldown, actual support speed, capacity lag and the v4 multiplier in the same calculation
- Inspector label is “自然発動”; it displays the effective interval to two decimals, distinguishes unplaced parts, and notes that charge-triggered purchases are unaffected
- Actual lab battles use their existing infinite capacity; campaign/story and active battle displays use their real capacity. The unrelated administrator-server HP meter is not relabelled as CPU

## Legacy and online compatibility

Explicit `combat-v2` and `combat-v3` remain supported. V4 must continue to inherit v3 navigation; do not key the navigation fix only on equality with v3. Unknown combat versions remain rejected.

Legacy fixtures are immutable:

- `combat-v2.json`: 20 result/event cases
- `combat-v3.json`: 20 result/event cases
- `oneclick-legacy-v2-v3.json`: 16 one/two/three/four-copy, both-seat, explicit v2/v3 result/event/metrics cases

`combat-v4.json` adds 28 golden cases: the 20 old v3 input boards and 8 repeated-copy/both-seat cases. Its expected hashes were generated from the previously audited explicit-v3+0.25 subclass, independently of the new v4 execution path. Source input hashes are retained. Both explicit and default v4 must match those golden hashes.

Online compatibility is intentional:

1. New runs and matchmaking use current v4 only; old v3 snapshots cannot enter the v4 pool
2. Existing old-version pending results and rewards remain recoverable, while continuing current matchmaking requires a new run
3. A stored v2/v3 replay can play only when its recorded version is supported, its gameplay catalogue fingerprint matches, and its exact event hash/winner/final tick reproduce
4. Verification and animation use the same recorded-version replay factory. No legacy match is silently simulated under current v4
5. Old-version UI copy distinguishes retained readable records from participation in the current candidate pool

Catalogue fingerprints continue to exclude cosmetic description text while including gameplay definitions. No hashes or version guards are weakened to make old records appear compatible.

## Historical scripts and reproduction

The diagnostic `OneClickAblationBattle` defaults to an explicit v3 baseline and respects explicit v2/v3. Explicitv4 is rejected there to prevent double-applying the candidate. An explicitly undefined version also resolves to v3.

New open searches default to current v4 and record the actual rules version. Add `--combat-version=combat-v3` to reproduce historical baseline studies. The isolated candidate searches remain pinned to v3 plus their selected diagnostic dial.

```sh
npm test
npm run build
node --import tsx --test tests/balance-combat-v4.test.mjs tests/qa-combat-v4.test.mjs tests/qa-repeat-oneclick.test.mjs
node --import tsx scripts/open-build-search.ts --seed=101 --capacity=26 --iterations=1200
node --import tsx scripts/open-build-search.ts --combat-version=combat-v3 --seed=101 --capacity=26 --iterations=1200
```

The separate [placeable server-pressure prototype](server-pressure-prototype.md) is implemented as an explicitly selected laboratory experiment. It is not part of canonical combat-v4, campaign/story, or online rules. This document does not claim public deployment or browser pixel verification.
