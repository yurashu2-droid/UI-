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
