# A paid ordinary counter to two sampled fused boards

## Result and boundary

One ordinary-parts board is genuinely reachable through paid play and defeats two previously sampled completed fused opponents under the stated **combat-v4, equal HP, empty-administrator** conditions. This is a narrow existence witness. It does not establish a closed counter cycle, a global strongest build, a campaign success rate, or a new gameplay rule or preset.

The acquisition is the **legacy eight-round expedition**, not the canonical fifteen-battle story. Seed 122 first completes the ten-part target **before round 7**, after a real round 1 defeat. Its actual retained board has twelve pieces: the purchased heading and guestbook both remain placed. Nothing is removed, sold, held aside, refunded, or rearranged after completion for the comparison.

At HP 420, that exact full board wins in both physical seats:

| Sampled opponent               | Recursive input value | Load / comparison capacity | Paid board remaining HP |   Time |
| ------------------------------ | --------------------: | -------------------------: | ----------------------: | -----: |
| Cart `s3-candidate-1100144`    |                   $74 |                    28 / 35 |                    44.8 | 7.40 s |
| Six-onestop `s0-candidate-432` |                   $73 |                    19 / 26 |                    73.6 | 7.40 s |

Both opponents are legal and neither is overloaded. The paid board uses its genuinely purchased **capacity 21**, with load 19. Both sides have **no administrators** in these nominal comparisons. The opponent capacities are recorded completed-board comparison conditions, not verified purchases. These opponents have not been independently acquired through paid play and are not equal-spend counterparts.

## What was acquired and paid

The fixed pursuit uses the unchanged `simulateCompositionPath` policy in [paid-target-benchmark.ts](../../scripts/paid-target-benchmark.ts). The reproducer separately replays its actual offers, purchases, rerolls, editor moves, battles, settlements, and loot claims through public `R` transactions. Selecting seed 122 and its real deterministic market is the only initial setup substitution.

| Budget or state                                         |                             Before round 7 |
| ------------------------------------------------------- | -----------------------------------------: |
| Ten-part ordinary target input value / load             |                                   $37 / 13 |
| Whole retained twelve-part inventory input value / load |                                   $47 / 19 |
| Part purchases                                          |                                        $39 |
| Purchased server plan `plan:srv_m`                      |                       $6, capacity 12 → 21 |
| Ten paid rerolls                                        |                                        $10 |
| Cumulative cash spending                                |                                    **$55** |
| Two genuine loot items                                  | `gov_form` + `ab_link`, **$8 input value** |
| Initial cash + prior battle rewards − spending          |             $10 + $56 − $55 = **$11 cash** |
| Progress / lives / administrators                       |                      5 wins, 2 lives, none |
| Held pieces / fusions                                   |                                      0 / 0 |

Inventory value and cumulative spending are different quantities: the inventory is $39 of bought pieces plus $8 of earned pieces. The plan and rerolls consume cash without adding UI input value. This is not a $37 or $47 all-in-cash counter.

The target metadata and acquisition policy prefer `server` and `backup`, but neither administrator is actually acquired. The comparison uses `actualRun.admin`, which is empty; it never applies target preferences as free equipment. The capacity purchase is a server **plan**, not the `server` administrator.

The six real settlements that precede the completed snapshot are:

| Round | Result |    Time | Reward | Prebattle load / capacity |
| ----- | ------ | ------: | -----: | ------------------------: |
| 1     | Loss   | 19.10 s |     $6 |                    2 / 12 |
| 2     | Win    | 14.30 s |    $10 |                    3 / 12 |
| 3     | Win    |  8.20 s |    $10 |                   10 / 12 |
| 4     | Win    |  6.25 s |    $10 |                   13 / 21 |
| 5     | Win    | 11.95 s |    $10 |                   13 / 21 |
| 6     | Win    |  6.25 s |    $10 |                   18 / 21 |

The public replay stops before round 7 combat. No round 7 settlement or later reward is counted in its cash or inventory. Subsequent reference duels are counterfactual comparisons of this saved state, not alternative campaign settlements.

## Exact retained geometry

All twelve pieces have their ordinary `source` shape and empty label. IDs and order below are the actual acquisition order, not newly assigned comparison pieces.

| ID  | Part           |   x |   y | width | height |
| --- | -------------- | --: | --: | ----: | -----: |
| p1  | `ab_link`      |  32 | 112 |    96 |     24 |
| p2  | `ab_hr`        |  32 | 208 |   864 |      8 |
| p3  | `ab_link`      | 128 | 112 |    96 |     24 |
| p4  | `gov_form`     |  16 |  16 |   920 |    240 |
| p5  | `gov_font`     |  32 |  72 |   576 |     32 |
| p6  | `ab_heading`   | 608 |  80 |   224 |     42 |
| p7  | `ab_link`      | 224 | 112 |    96 |     24 |
| p8  | `go_suggest`   |  32 | 144 |   576 |     56 |
| p9  | `ab_link`      | 320 | 112 |    96 |     24 |
| p10 | `ab_guestbook` |  32 | 256 |   240 |     96 |
| p11 | `ab_link`      | 416 | 112 |    96 |     24 |
| p12 | `ab_link`      | 512 | 112 |    96 |     24 |

The ten-part pursuit target is this geometry excluding the two retained bridge pieces, p6 and p10. Its occupied area is 220,800 px²; the actual twelve-part board occupies 243,840 px². Nested areas are not double-counted.

### Why the compact form matters

In a separate target-only geometry check, reducing just the form height from 500 to 240 preserves legal containment, the six links' form support, font/suggestion connections, power multiplier 2.1, and speed multiplier 1.587. Occupied area falls from 460,000 to 220,800 px². The resulting free-area ratio rises from about 0.2953 to 0.6618.

The existing [engine whitespace rule](../../src/engine.ts) is `min(3, floor(freeRatio × 5))` for the first two highlighted links. It therefore restores **+3 rather than +1** to those two links; it does not give all six links a new bonus. This gives a concrete reason the compact construction can use fewer dividers. The paid twelve-piece board still has enough free area for +3. This target-only diagnostic is not a post-completion edit to the paid witness and does not isolate every cause of its victories.

## Timing and administrator controls

The small sensitivity grid uses HP 378/420/462 and phases −0.5/0/+0.5 against each of the two opponents. Each case is replayed in both physical seats: **18 paired-seat cases, 36 wins**, with minimum remaining HP about **6.4**. Nominal HP 420/phase 0 is included in those 36, not added again.

- Phase 0 keeps canonical natural startup
- Phase −0.5 delays **every periodic clock on the opponent side** by 0.5 s
- Phase +0.5 delays **every periodic clock on the paid-board side** by 0.5 s

These are correlated side-wide clock shifts, not independent per-part offsets or exhaustive timing robustness. The production startup rules are unchanged. All duels use the canonical 0.05 s fixed step, the stated capacities, and no experimental rules.

The important losing controls keep the opponents' recorded `server` + `backup` while the paid board retains no administrators:

| Opponent                           | Actual starting HP, paid / opponent | Paid result | Opponent remaining HP |   Time |
| ---------------------------------- | ----------------------------------: | ----------- | --------------------: | -----: |
| Cart 1100144                       |                           420 / 525 | Loss        |                    39 | 8.35 s |
| Six-onestop 432                    |                           420 / 525 | Loss        |                    80 | 7.95 s |
| Cart 1100144, matched actual HP    |                           420 / 420 | Loss        |                   111 | 8.35 s |
| Six-onestop 432, matched actual HP |                           420 / 420 | Loss        |                   126 | 7.95 s |

All four controls reproduce in both seats. With base HP 420, `server` raises the opponent's actual starting/max HP to 525. The matched-actual-HP controls instead set only the opponent's base HP to 336 before its server multiplier, producing 420 actual HP. They still have asymmetric administrators and retain backup. Thus the nominal win is not a counter to the opponents' full recorded administrator configuration, even after removing the starting-HP mismatch. Capacities and geometry are unchanged and no side is overloaded.

## Opponent provenance and limits

[paid-counter-opponents.json](../../fixtures/balance/paid-counter-opponents.json) stores only the exact two opponent layouts, their recorded administrator pairs and capacities, plus source-report hashes. The reproducer reads this portable fixture, so the original search reports are not runtime dependencies.

- Cart 1100144 originated in the archived repeat-cadence 0.30, seed 202/capacity 35 search
- Six-onestop 432 originated in the repeat-cadence 0.25, seed 101/capacity 26 search
- Both are replayed here under current **combat-v4**, whose repeated-One-click weight is 0.25. Cart 1100144 contains only one One-click, so the archived 0.30 versus current 0.25 repeated-copy coefficient does not affect that board
- Their $74 and $73 values include recursive fusion donors. They are not proven paid acquisition budgets, campaign cash spending, or global-optimum claims
- The prior nineteen-piece/$68 counter's historical 0/30 paid-completion record was inspected, not rerun by this witness. It is not a new cohort result and does not prove that target impossible

The [open-composition study](open-composition-search.md), [repeat-cadence study](repeat-oneclick-probe.md), and [combat-v4 contract](combat-v4.md) supply the earlier context. No completed-opponent search, new target cohort, ordinary-play recommendation, broad balance certification, or browser acceptance is claimed here.

## Reproduce

From the repository root, using the existing dependencies:

```sh
node --import tsx scripts/paid-counter-witness.ts
node --import tsx --test tests/balance-paid-counter-witness.test.mjs
```

The fixed-seed script writes one JSON report to stdout. It contains the actual pre-round 7 `Run`, all 23 relevant transactions, the six real settlements, both budgets, both exact opponents, every paired result, and the losing controls. Forty intermediate/final replay states are validated and JSON-round-tripped using `R.validateRun`; the exact final inventory is compared with the unchanged pursuit harness. The full Run remains identical after all reference duels. The report records the SHA-256 fingerprint of the existing gameplay-catalog definition, which excludes cosmetic template metadata, rather than hashing the whole data source file.

The focused regression test locks the actual retained items and geometry, real loss and cash ledger, no-admin nominal outputs, and asymmetric-admin losses. It makes no game-definition, shop, fusion-recipe, preset, enemy-pool, combat-version, or frozen-snapshot changes. Passing this focused test is not a claim that the full project suite, build, or browser checks were run.

## Stronger paid witness: seed 217 with earned administrators

The seed-122 evidence above remains unchanged, including its losses against full-administrator opponents. A separate, independently replayed witness now establishes the narrower missing result: **a genuinely paid ordinary board can defeat both recorded completed fused boards while both opponents retain `server` and `backup`**. It uses the same ten-part compact target, unchanged acquisition policy and existing opponent fixture. This adds an existence proof; it does not make the acquisition policy reliable or establish an optimal build.

This second acquisition is also the **legacy eight-round expedition**. It does not establish success in the canonical fifteen-battle story. Seed 217 first completes the target **before round 6**, after four real wins and one loss, with two lives remaining. The saved state contains all eleven acquired pieces: the ten-part target and the purchased heading. There are no held, sold, deleted, refunded, fused or experimental pieces, and no post-completion geometry edits.

### Actual paid state and budget

| Resource or state | Before round 6 |
| --- | ---: |
| Ten-part ordinary target input value / load | $37 / 13 |
| Whole retained inventory | 11 parts, $42 input value |
| Part purchases | $42 |
| Light server **capacity plan** `plan:srv_s` | $3; capacity 12 → 17 |
| Six paid rerolls | $6 |
| Total cash spending | **$51** |
| Prior cash rewards, rounds 1–5 | $46 |
| Cash conservation | **$10 + $46 − $51 = $5** |
| Full retained load / paid capacity | **16 / 17**, no overload |
| Actually earned administrators | `server` after round 2; `backup` after round 5 |
| Base HP / engine-rounded actual starting and maximum HP | **380 / 475** |
| Progress | 4 wins, 1 loss, 2 lives |

All UI inventory is bought; no UI item loot contributes to the $42 inventory value. The capacity plan is separate from the earned `server` administrator: the plan raises capacity, while `server` raises starting/max HP by 25%. Administrator preferences in target metadata are never used as grants.

The complete paid-and-selected-reward ledger is below. Cash is measured immediately after each action; the next round starts with the prior real settlement added. The reproducer also reports the actual offer list for every transaction and both declined loot claims.

| Round | Action | Cash cost | Cash after action |
| --- | --- | ---: | ---: |
| 1 | Buy `ab_link` | $3 | $7 |
| 1 | Buy `ab_hr` | $3 | $4 |
| 2 | Buy `ab_link` | $3 | $7 |
| 2 | Buy `gov_font` | $5 | $2 |
| 2 | Claim offered `admin:server` after settlement | $0 | $12 |
| 3 | Buy `ab_link` | $3 | $9 |
| 3 | Buy `go_suggest` | $6 | $3 |
| 4 | Reroll | $1 | $12 |
| 4 | Buy `ab_link` | $3 | $9 |
| 4 | Reroll | $1 | $8 |
| 4 | Buy `ab_heading` | $5 | $3 |
| 5 | Reroll | $1 | $12 |
| 5 | Reroll | $1 | $11 |
| 5 | Buy `gov_form` | $5 | $6 |
| 5 | Buy `plan:srv_s` | $3 | $3 |
| 5 | Claim offered `admin:backup` after settlement | $0 | $13 |
| 6 | Buy `ab_link` | $3 | $10 |
| 6 | Reroll | $1 | $9 |
| 6 | Reroll | $1 | $8 |
| 6 | Buy `ab_link` | $3 | $5 |

The round-2 reward actually offers `gov_page`, `gov_form`, and `admin:server`; the round-5 reward offers `ab_nav`, `ab_counter`, and `admin:backup`. The public reward API claims the administrators. Round-3 and round-4 loot is declined through that same API, with no cash or inventory benefit.

| Prior round | Result | Time | Cash reward | Prebattle load / capacity | Actual player HP at start |
| --- | --- | ---: | ---: | ---: | ---: |
| 1 | Loss | 19.10 s | $6 | 2 / 12 | 180 |
| 2 | Win | 10.25 s | $10 | 4 / 12 | 220 |
| 3 | Win | 7.50 s | $10 | 7 / 12 | 325 |
| 4 | Win | 6.15 s | $10 | 11 / 12 | 375 |
| 5 | Win | 9.65 s | $10 | 14 / 17 | 425 |

Only these five settlements fund the witness. The replay stops before round 6 combat, so no round-6 reward or later money, item, or capacity purchase is counted.

### All eleven retained pieces

Every piece retains its actual acquisition ID, ordinary `source` shape and empty label. In particular, p8 is not removed to substitute the smaller ten-part target for the paid board.

| ID | Part | x | y | width | height |
| --- | --- | ---: | ---: | ---: | ---: |
| p1 | `ab_link` | 32 | 112 | 96 | 24 |
| p2 | `ab_hr` | 32 | 208 | 864 | 8 |
| p3 | `ab_link` | 128 | 112 | 96 | 24 |
| p4 | `gov_font` | 32 | 72 | 576 | 32 |
| p5 | `ab_link` | 224 | 112 | 96 | 24 |
| p6 | `go_suggest` | 32 | 144 | 576 | 56 |
| p7 | `ab_link` | 320 | 112 | 96 | 24 |
| p8 | `ab_heading` | 608 | 80 | 224 | 42 |
| p9 | `gov_form` | 16 | 16 | 920 | 240 |
| p10 | `ab_link` | 416 | 112 | 96 | 24 |
| p11 | `ab_link` | 512 | 112 | 96 | 24 |

### Full-administrator comparisons and an explicit losing control

Both sides retain `server` + `backup`, start at actual/max HP **475**, and remain within capacity. The paid board keeps its acquired capacity 17; the opponents keep the same fixture geometry, recorded administrators and comparison capacities described above. Their $74/$73 recursive input values and capacities remain unverified paid acquisition conditions. These are counterfactual reference duels, not actual expedition encounters or equal-spend contests.

| Recorded opponent | Opponent load / capacity | Paid-board HP remaining in either seat | Time |
| --- | ---: | ---: | ---: |
| Cart `s3-candidate-1100144` | 28 / 35 | 33 | 10.80 s |
| Six-onestop `s0-candidate-432` | 19 / 26 | 21.2 | 11.95 s |

At the acquired base HP 380, phases −0.5/0/+0.5 reproduce **six paired-seat cases, twelve physical wins**, with minimum remaining HP about **21.2**. Phase zero keeps natural startup. Negative phase delays every opponent periodic clock by 0.5 s; positive phase delays every paid-board periodic clock. These are correlated side-wide timing controls, not independent per-part jitter or exhaustive robustness. Each duel uses canonical combat-v4, a 0.05 s fixed step, and no experimental rules.

**The result is not robust across the tested HP range.** Separate counterfactual base HP 342 and 418 controls use the engine-rounded actual HP 428 and 523 respectively. At **base 418 / actual HP 523**, delaying the paid side by **+0.5 s** lets **Cart win in both seats**, retaining approximately **16 HP at 12.15 s**. Natural startup at that HP still wins. Across the combined three-HP/three-phase/two-opponent grid, the outcome is **34/36 physical wins**, including the twelve actual-475-HP wins; it is not an all-win HP sensitivity result. Longer survival can expose additional timed cycles, so more HP is not a monotone guarantee for this matchup.

Only the opponent's comparison base HP is normalized to match the paid side's engine-rounded actual HP after `server`. The higher/lower player HP values are explicitly labeled counterfactual battle options. No acquired Run field, capacity, administrator or inventory geometry is changed for any duel.

### What the acquisition study does and does not justify

A separate independently replayed study used the fixed seed block **201–230**, excluding calibration seed 122. Its unchanged-policy baseline completed the exact target on **2/30** paths. Only **1/30** completed within paid capacity: seed 217. The other completion, seed 211 before round 8, retained fourteen pieces at load/capacity **21/12**. These are deterministic results for a bounded heuristic, not player population rates, an optimal-policy estimate, or proof that a better route cannot exist.

An exploratory cheaper-reroll-reserve variant completed the target on **3/30** paths. Only **1/30** was within capacity at first completion; **3/30** became within capacity at some observed completed snapshot. Its overloaded battles increased from **22/194** in the baseline to **55/227**. It is a separate external acquisition-policy experiment, not a change shipped to the game or this reproducer, and the extra completions are not three equivalent full-administrator counter witnesses.

The baseline's chief obstacles were obtaining six separate links, early survival, and capacity decisions. Twenty-seven paths still lacked at least one target link at their last prebattle snapshot; all encountered offers of target parts that were still missing at the end had been purchased. In sixteen of the baseline's twenty-two overloaded battles, an affordable plan had appeared earlier that round and was rerolled away before the policy's final capacity check. These observations concern the markets actually encountered; they do not establish that an alternative affordable path would preserve later purchases and victories.

Do not recommend following the whole heuristic after completion. Even seed 217 later buys an unnecessary guestbook before round 8, taking retained load **16 → 19** while capacity stays **17**. It also continues paying for rerolls. The valid witness is the saved **pre-round-6** board. Practical guidance should check the full retained inventory, genuinely earned administrators, missing pieces, cash reserve and capacity before calling a board ready; the six-link shopping recipe is not promised to appear consistently. This evidence supports investigating acquisition/readiness guidance, not a combat buff or a new preset.

### Reproduce the stronger witness

From the repository root with existing dependencies:

```sh
node --import tsx scripts/paid-admin-counter-witness.ts
node --import tsx --test tests/balance-paid-admin-counter-witness.test.mjs tests/balance-paid-counter-witness.test.mjs
```

[paid-admin-counter-witness.ts](../../scripts/paid-admin-counter-witness.ts) writes one portable JSON report to stdout. It imports only project modules and the existing [opponent fixture](../../fixtures/balance/paid-counter-opponents.json); no research dump or private path is a runtime dependency. It calls the unchanged `simulateCompositionPath` for seed 217 and independently replays the path only through the pre-round-6 snapshot. The report contains the **entire actual Run**, all twenty paid/selected-reward transactions with actual offers, all four reward claims including declines, every public editor move, all five real settlement summaries, the exact opponents with existing provenance, and every paired comparison.

Purchases, prices, offers, rerolls, claims, moves, legal placements, canonical battle outcomes and settlements are asserted against public APIs and recorded pursuit snapshots. Persistent states are validated and JSON-round-tripped after each purchase, reroll, move, settlement and claim. The final full inventory is matched to the unchanged pursuit harness. The complete Run is asserted unchanged after all reference duels. The report includes the gameplay-catalog SHA-256 fingerprint, excluding cosmetic template metadata.

The new [focused regression](../../tests/balance-paid-admin-counter-witness.test.mjs) locks the complete inventory and ledger, actual administrator offers and claims, five real prior outcomes, matched starting/max HP, unchanged fixture opponents, the twelve actual-HP wins and the higher-HP Cart loss. The command above also reruns the older seed-122 regression. This reproducer verifies one witness and its controls; it does not rerun the separate thirty-seed study, introduce its exploratory policy, or certify the whole project suite, build, browser, canonical story, a closed counter cycle, or broad balance.

## Retained-inventory rearrangement: seed 308 without enemy HP normalization

This third witness keeps the earlier seed-122 and seed-217 evidence and limitations intact. One fixed, legally rearranged **and resized** version of an already acquired seed-308 inventory defeats the same two full-administrator fixtures at **common base HP 440: actual starting/max HP 440 for the paid board versus 550 for each opponent**. The enemy's base HP is never divided by 1.25. All fourteen ordinary pieces remain owned and placed, with earned `backup` only and load 23 / purchased capacity 31.

**Reproduce these wins with the explicit CLI fixture-duel path below. Importing the saved Run and clicking ordinary Battle does not reproduce them.** The genuine saved state remains a legacy campaign before round 8; its next ordinary encounter is YouTube at actual HP 460 versus 560. Neither exact recorded Cart nor Six-onestop fixture is selectable as a normal laboratory enemy. A laboratory copy also launches with unbounded battle capacity and the selected enemy's HP, rather than this witness's finite capacities and common base HP. This study adds no launch option, opponent, preset or gameplay change.

**The original retained geometry already wins both natural-start common-base-460 comparisons.** The new geometry closes the natural common-base-440 Cart loss and wins the declared finite phase/HP grid. It is not the first unnormalized natural victory at every HP, and it does not improve every surviving-HP margin.

### Exact paid route and its costs

The [bounded route fixture](../../fixtures/balance/paid-rearranged-counter-route.json) contains only project game data: the seed, initial Run fingerprint, 202 production-API actions and resulting full-Run fingerprints, the cash ledger, and 28 subsequent rearrangement moves with resulting fingerprints. It does not inject a final board or load an external research report. The [portable witness](../../scripts/paid-rearranged-counter-witness.ts) starts a new empty legacy expedition, chooses seed 308 and its real deterministic market, then executes every purchase, reroll, editor move, battle start, actual battle settlement and loot claim through the existing `R` APIs.

| Resource or state | Saved before round 8 |
| --- | ---: |
| Retained ordinary inventory | 14 pieces, $57 input value, load 23 |
| Bought pieces | $51 |
| Genuine UI loot | `ab_nav` after round 1 and `ab_link` after round 5; $6 input value |
| Capacity plans | $3 light plan in round 4; $9 large plan in round 7 |
| Paid rerolls | 13, costing $13 |
| Historical cash spending | **$51 + $12 + $13 = $76** |
| Seven prior settlement rewards | $70 |
| Cash conservation | **$10 + $70 − $76 = $4** |
| Purchased capacity | 31, increased 12 → 17 → 31 |
| Earned administrator | `backup` after round 2; no `server` |
| Progress | stage 7, seven wins, three lives, no pending reward |
| Acquired stage base / actual HP | 460 / 460 |

The round-2 reward offers `gov_page`, `gov_notice` and `admin:backup`; the route claims the actual backup offer. Four other loot offers are declined through `R.claimLoot`. The 202 acquisition actions comprise 154 moves, 14 purchases (12 UI purchases and two plans), 13 rerolls, seven battle starts, seven settlements and seven loot claims. No selected action fails.

**The font is bought for $5 before round 8, after all seven prior settlements**, following three paid round-8 rerolls. The saved inventory therefore does include a purchase after round 7. No round-8 battle, settlement or reward funds it. Subsequent rearrangement adds no expense or equipment and does not erase the historical $76 cost.

| Acquisition round | Actual result | Time | Cash reward | Own prebattle load / capacity |
| --- | --- | ---: | ---: | ---: |
| 1 | Win | 10.25 s | $10 | 3 / 12 |
| 2 | Win | 8.20 s | $10 | 8 / 12 |
| 3 | Win | 8.85 s | $10 | 12 / 12 |
| 4 | Win | 8.85 s | $10 | 14 / 17 |
| 5 | Win | 13.55 s | $10 | **18 / 17, overloaded** |
| 6 | Win | 8.10 s | $10 | **22 / 17, overloaded** |
| 7 | Win | 16.10 s | $10 | 22 / 31 |

This is a selected existing route, not a fresh seed cohort, reliable shopping policy, cheap acquisition recommendation or canonical fifteen-battle story result. Its real round-5 and round-6 overload is preserved. The opponent costs and capacities remain completed-board comparison conditions, with no paid opponent acquisition or equal-spend claim.

### One exact rearrangement and resize

All IDs, acquisition order, ordinary `source` shapes and empty labels remain unchanged. The real editor API temporarily holds all fourteen pieces in build mode, then legally places the form first and the remaining pieces. Every one of these 28 moves succeeds. Every persistent state validates and survives a JSON round-trip, every move preserves all nongeometry inventory fields and the full economic/progression state, and no battle starts with a held piece.

| ID | Part | x | y | width | height |
| --- | --- | ---: | ---: | ---: | ---: |
| p1 | `ab_link` | 248 | 72 | 224 | 24 |
| p2 | `ab_hr` | 32 | 330 | 640 | 8 |
| p3 | `ab_link` | 248 | 96 | 224 | 24 |
| p4 | `ab_nav` | 248 | 192 | 224 | 24 |
| p5 | `ab_nav` | 248 | 216 | 224 | 24 |
| p6 | `ab_heading` | 248 | 240 | 224 | 42 |
| p7 | `ab_link` | 248 | 120 | 224 | 24 |
| p8 | `ab_guestbook` | 32 | 354 | 240 | 96 |
| p9 | `go_suggest` | 480 | 72 | 192 | **250** |
| p10 | `ab_link` | 248 | 144 | 224 | 24 |
| p11 | `gov_form` | 16 | 16 | 672 | 338 |
| p12 | `ab_link` | 248 | 168 | 224 | 24 |
| p13 | `gov_pdf` | 248 | 282 | 224 | 40 |
| p14 | `gov_font` | 32 | 72 | 208 | **250** |

The font and suggestion controls flank the attacks, supplying direct support to both navs and the heading. Their power multipliers become 2.1, from 1.5 / 1.0 / 1.4 respectively. The five links and PDF already had 2.1. The seven-entry navigation slowdown remains 1.05 and the first two highlighted links keep the +3 whitespace damage bonus. These are unchanged engine mechanics, not manually granted bonuses.

This is **not an unchanged-size move**: among other changes, links widen from 96 to 224 px, navs from 112 to 224, the font changes from 576×32 to 208×250, suggestion from 576×56 to 192×250, and form from 920×240 to 672×338. Union occupied area increases from 243,840 to 250,176 px². The taller support controls and PDF's 40 px height are mechanically legal but **not visually or interactively accepted**. Wrapping, truncation, usability, keyboard operation and assistive-technology behavior have not been certified. This does not justify installing a preset or calling it an accepted product composition.

### Common-base controls, including original-layout failures

All comparisons use canonical combat-v4, no experimental rules and 0.05 s steps. The paid board retains `backup`, capacity 31 and load 23. Cart retains `server` + `backup`, capacity 35 and load 28; Six-onestop retains those same administrators, capacity 26 and load 19. Both opponent layouts are the existing unchanged [fixture](../../fixtures/balance/paid-counter-opponents.json). Neither side is overloaded in these reference duels.

| Common base HP | Actual starting/max HP, own / foe | Original physical wins | Rearranged physical wins |
| ---: | ---: | ---: | ---: |
| 396 | 396 / 495 | 4 / 12 | 12 / 12 |
| 440 | 440 / 550 | 4 / 12 | 12 / 12 |
| 460 | 460 / 575 | 10 / 12 | 12 / 12 |
| 484 | 484 / 605 | 10 / 12 | 12 / 12 |

Each row includes two opponents, phases −0.5 / 0 / +0.5, and both physical seats. Negative phase delays every opponent periodic clock by 0.5 s; positive phase delays every paid-board periodic clock; zero keeps natural startup. These correlated side-wide shifts are not independent per-part jitter or exhaustive timing coverage. Base 460 preserves the acquired player's stage HP; 396/440/484 are explicitly counterfactual comparison options. No saved Run HP, administrator or economic state is rewritten, and no reference duel is settled into the expedition.

| Natural-start condition | Original geometry | Rearranged geometry |
| --- | --- | --- |
| Common base 440, Cart | Loss; Cart keeps 30.8 HP at 10.80 s | Win; own 69.9 HP at 10.15 s |
| Common base 440, Six-onestop | Win; own 23.2 HP at 11.50 s | Win; own 17.2 HP at 10.35 s |
| Common base 460, Cart | Win; own 34 HP at 11.50 s | Win; own 34 HP at 11.35 s |
| Common base 460, Six-onestop | Win; own 144 HP at 11.50 s | Win; own 144 HP at 11.35 s |

Each result reproduces in both seats. The new layout wins **48/48 physical comparisons**, with minimum remaining HP about 10.2. The original wins 28/48. All twenty original physical losses remain in the report: Cart at base 396 and 440 in every phase, Cart at 460/+0.5 and 484/+0.5, and Six-onestop at 396/+0.5 and 440/+0.5. In particular, the new natural-440 Six-onestop win ends sooner but retains less HP than the original. Neither more starting HP nor this rearrangement monotonically improves every margin.

### Reproduce the fixed witness

From the repository root with the existing dependencies and supported Node version:

```sh
node --import tsx scripts/paid-rearranged-counter-witness.ts
node --import tsx --test tests/balance-paid-rearranged-counter-witness.test.mjs
```

The explicit CLI prints one deterministic JSON report; importing the module is silent. No network, service, installation, browser, private workspace path or external study file is needed. Relative imports resolve from the script location, not the process working directory. The report includes the full original and rearranged Runs, all legal moves and transaction/reward ledgers, seven actual settlements, both exact opponents, explicit common-base and actual/max HP, finite capacities, administrators, both seats and all original losses. It also records the gameplay-catalog SHA-256 fingerprint used by the earlier witnesses.

The replay checks every recorded resulting Run fingerprint against the actual production API state, rejects invalid actions and changed ledgers, and validates **224** persistent states including the initial empty state. A separately pinned action-sequence fingerprint also rejects a changed no-op hold even when all resulting Run states are identical. These unsigned fixture fingerprints are regression checks, not cryptographic proof of a player's history. The focused test includes mutated purchases, unsupported operations, altered state fingerprints, malformed arguments, missing steps, altered cash ledger and illegal/changed rearrangement moves, as well as silent imports and identical CLI output from different working directories.

This public script executes 48 original-layout and 48 reachable-rearranged-layout reference duels. These are 96 physical comparisons of the same two fixed states, not additional paid witnesses or independent statistical trials. Passing the focused command alone does not certify the full project suite, build, browser presentation, other enemies, all HP values, a general counter cycle, global optimality or canonical story acquisition. No game source, price, combat rule, acquisition rule, preset or enemy pool is changed.
