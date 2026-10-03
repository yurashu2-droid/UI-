# Open composition search, not fixed classes

## Conclusion

The nine authored builds are useful regression examples, not the game's strategy space. Keeping their compositions fixed had hidden stronger repeated-fusion and mixed defensive packages. A bounded search over part choice/count, placement, size and administrators now runs alongside the original matrix. **This records the combat-v3 investigation; the later, narrow production change is documented in [combat-v4.md](combat-v4.md).**

The strongest sampled late completed boards repeatedly use four `am_oneclick` outputs supported by product, quantity, Prime and counter connectivity. Link/divider/BBS and six-onestop variants remain important challengers. This is a **completed-board hotspot**, not proof of global optimality, a solved metagame, or a readily obtainable campaign strategy.

## Search contract

`scripts/open-build-search.ts`:

- Uses actual editor geometry and the canonical fixed-step engine
- Prices every fused output through its recursive recipe ingredients; each output also has a real selected `R.fuse` transaction witness
- Constrains ingredient value, maximum admitted CPU load, footprint and distinct actual administrators
- Separates battle CPU capacity from maximum admitted load. The default is an under-cap search; `--max-load` can admit overloaded boards and the real engine applies their lag
- Starts from authored/fused examples, previously discovered alternatives, and independently filled random production-part lineages
- Mutates parts, counts, geometry and admin choices; authored builds are never immutable classes
- Trains against regression anchors plus an evolving set of strong sampled opponents. Weak singleton starting boards are not retained as inflated scoring targets
- Gives the twelve shortlisted surviving geometries all 36 two-admin choices against the same pool; it does **not** exhaustively optimize administration for every rejected candidate
- Iteratively removes a part only if every measured matchup is preserved or improved while resource use falls
- Reports a Pareto frontier only among those refined shortlisted finalists, with each opponent margin, ingredient cost, load and footprint as separate dimensions
- Keeps sources and automatic revenue routing intact. Explicit player `routeTo` selection, stochastic human decisions, shop policies and optimal acquisition routes are outside this search

The search is deterministic and reproducible but heuristic. Finite mutations, sampled placement dimensions, the training pool and survivor selection all constrain what it can establish. “All 54 production types appeared” means coverage among sampled candidates, not 54 viable strategies. Public recipe witnesses do not grant four completed fusions, rare ingredients or administrators in a paid run.

## Crossed resource/seed study

Each run used $75 ingredient value, base HP440, two admin slots, the full 960×680 page and 1,200 accepted mutation proposals. Counts below include the initial candidates.

| Seed | Battle CPU | Max admitted load | Candidate evaluations | Within-run distinct part-count compositions | Simulated battles | Leading sampled package |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| 101 | 26 | 26 | 1,285 | 741 | 62,528 | four-1-Click, $68 / CPU20 |
| 202 | 26 | 26 | 1,285 | 686 | 60,550 | four-1-Click, $73 / CPU23 |
| 101 | 35 | 35 | 1,282 | 696 | 55,432 | four-1-Click, $71 / CPU21 |
| 202 | 35 | 35 | 1,282 | 695 | 56,887 | four-1-Click, $72 / CPU21 |

The four runs total 5,134 candidate evaluations and 235,397 battles. The sum of their within-run distinct-composition counts is 2,818; this is not a globally deduplicated count across runs. All four sampled all 54 production types and had zero reversed-seat mismatches over 1,584 final comparisons.

Additional overload-admitting probes at battle CPU26 also selected four-1-Click packages:

- Seed101/maxLoad35: 1,282 evaluations, 53,514 battles; leading package $74 / CPU23
- Seed202/maxLoad53: 1,282 evaluations, 55,941 battles; leading package $73 / CPU23

Independent unbounded integer-knapsack accounting over current production input prices bounds any $75 collection at CPU53 even before geometry restrictions. Independent QA also constructed a legal layout attaining this bound: ten minimum-sized videos and one heading. Thus maxLoad53 does not exclude a $75 production composition for CPU alone. It remains a finite heuristic search, not exhaustive enumeration of all such boards.

## Independent challenge and administrators

`scripts/open-build-robustness.ts` merges the four crossed-run shortlists (48 distinct layout/admin configurations), deduplicates exact configurations, then compares the same layouts at CPU26 and CPU35, HP220/440/660, and zero/two admins. Fourteen of those boards exceed CPU26 and are labelled as overloaded rather than rejected.

Changing only battle capacity changes 103 of the 1,128 pair outcomes at HP440/two admins, demonstrating why changing capacity and changing the optimized board must not be confused. Crossed search seeds help coverage; same-board reruns isolate the CPU effect.

The best representatives from six different source families also receive a full 36×36 administrator cross-product: 19,440 battles, plus 540 reversed-seat checks with no mismatch. A single fixed server+backup package on `search1-candidate-900392` beats all five other selected geometries under all 36 opposing administrator pairs: **180/180**, with a worst normalized HP margin of about 0.0567. Independent QA replayed all 360 forward/reverse versions of these cases exactly. This finding is confined to those five geometries at base HP440/CPU35.

The $73/CPU23 board is:

| Part | x | y | width | height |
| --- | ---: | ---: | ---: | ---: |
| `am_product` | 24 | 24 | 704 | 300 |
| `am_quantity` | 24 | 324 | 80 | 40 |
| `am_prime` | 616 | 324 | 112 | 40 |
| `ab_counter` | 24 | 372 | 704 | 26 |
| `am_oneclick` | 104 | 324 | 128 | 40 |
| `am_oneclick` | 232 | 324 | 128 | 40 |
| `am_oneclick` | 360 | 324 | 128 | 40 |
| `am_oneclick` | 488 | 324 | 128 | 40 |
| `gov_form` | 24 | 398 | 640 | 200 |

Stage sensitivity remains real: at HP220 without administrators, link-defense and onestop variants lead the 48-board challenge; at HP440 the four-1-Click family leads. Rankings here are scenario outcomes, not player-population win rates.

## Acquisition is a different measurement

The existing real-market `fusion-progression-benchmark.ts` evaluated six policies × two admin-selection preferences × 50 seeds, or 600 paid campaign paths. In the 100 paths pursuing a repeated 1-Click battery:

- Neither branch assembled every target input
- At most two `am_oneclick` outputs were placed, versus four in the completed-board winner
- Round-eight reaches were 10/50 without a preferred admin pair and 12/50 when preferring server+backup

By contrast, onestop pursuit reached round eight in 24/50 paths in each branch and placed at most four onestops, still short of its six-copy completed target. These are heuristic policies and survivor cohorts, not optimal acquisition probabilities. The stronger late completed package should not be used to justify a blanket commerce nerf without separating repeated-fusion scaling from reachability and earlier-game viability.

## Audit-driven corrections

The initial prototype kept weak single-part opponents and computed its frontier before ablations. Independent QA found its first $75/CPU22 winner had an inert rating widget: removing it preserved all 57 opponent margins while lowering cost to $71 and CPU to21. The final harness removes such non-worsening components before reporting a frontier. Final independent inspection of all 48 crossed-run finalists found no remaining legal single-part removal that preserved every measured matchup.

The crossed-run independent audit replayed 23,265 battles: stored margins, scores and win/draw counts reproduced exactly; all finalists remained legal; all 1,584 reversed-seat cases matched. Two overload reports added 11,748 independently replayed battles, and the complete cross-search HP/admin/CPU and exact-admin audit added 47,052. Together these final independent replays total 82,065, excluding the earlier prototype audit. Additional tests cover overload admission with real lag, rejection of malformed geometry, full admin-choice axes, conservative specialization-preserving removal and whole-report determinism.

## Reproduction

```sh
node --import tsx --test tests/balance-open-*.test.mjs tests/qa-open-build-search.test.mjs
node --import tsx scripts/open-build-search.ts --combat-version=combat-v3 --seed=101 --capacity=26 --iterations=1200 > /tmp/open-101-26.json
node --import tsx scripts/open-build-search.ts --combat-version=combat-v3 --seed=202 --capacity=26 --iterations=1200 > /tmp/open-202-26.json
node --import tsx scripts/open-build-search.ts --combat-version=combat-v3 --seed=101 --capacity=35 --iterations=1200 > /tmp/open-101-35.json
node --import tsx scripts/open-build-search.ts --combat-version=combat-v3 --seed=202 --capacity=35 --iterations=1200 > /tmp/open-202-35.json
node --import tsx scripts/open-build-search.ts --combat-version=combat-v3 --seed=202 --capacity=26 --max-load=53 --iterations=1200 > /tmp/open-overload.json
node --import tsx scripts/open-build-robustness.ts /tmp/open-101-26.json /tmp/open-202-26.json /tmp/open-101-35.json /tmp/open-202-35.json --capacity=35 --combat-version=combat-v3 > /tmp/open-robustness.json
```

The original fixed-build matrix remains a separate regression check. Future tuning should preserve that regression suite while challenging the tuned result against newly optimized compositions, the repeated-fusion hotspot, early-stage conditions and paid acquisition paths.
