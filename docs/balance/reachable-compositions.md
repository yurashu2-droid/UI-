# Reachable compact search/document composition

## Shipped local example

`b_search_documents` is a player-loadable laboratory preset using five production outputs, **$34 of recipe inputs and CPU11**, with no free administrators. It is deliberately excluded from the numeric laboratory opponent list: all 35 existing opponent indices remain unchanged. It does not change any combat constant, catalogue price, recipe or replay version.

| Output | x | y | width | height |
| --- | ---: | ---: | ---: | ---: |
| `go_tabs` | 24 | 0 | 440 | 36 |
| `go_instant` | 24 | 40 | 420 | 44 |
| `gov_font` | 24 | 92 | 232 | 36 |
| `gov_pdf` | 264 | 92 | 184 | 48 |
| `go_result` | 452 | 40 | 480 | 96 |

Instant Search requires the real search-window + suggestion-panel recipe, so the completed five outputs represent six acquired ingredients. The font and built-in suggestion support reach both Instant Search and PDF for **2.175× power**. The result receives **1.45×**; the search and result receive the tabs' **1.2× speed**. This is an actual connection/layout improvement, not new stats or a free fusion.

## Completed-layout comparison

A finite v4 search used seed303, $40 maximum input value, CPU17, HP300, two admin slots and300 mutation proposals. It evaluated385 candidates in35,477 battles, with no final seat mismatch. Its frozen12-finalist source report is retained locally before the new preset was added. Adding a new search seed now changes subsequent search populations; rerunning a fresh search is a new experiment.

The selected original five-part search/document layout cost$34/CPU11 but left key support connections broken. Both it and the compact layout were compared against the same12 frozen finalists at **HP300, CPU17 and zero administrators on both sides**:

- Original layout:1 win,1 draw,10 losses; footprint147,696
- Connected compact layout:9 wins,1 draw,2 losses; footprint97,584
- All forward/reverse results matched, including winner, time and normalized-HP margin

The compact layout still loses to the **$28 ordinary navigation** finalist and the **$40 link-defense** finalist. The comparison measures different actual costs up to$40, not equal-cost reimbursement. It is neither a population win rate nor a universal counter claim. Default laboratory battle conditions differ from this measured slice. Ordinary unfused and completed-fusion alternatives remain in the opponent set.

## Real paid reachability of the exact shipped geometry

`scripts/paid-target-benchmark.ts` now exposes `simulateCompositionPath(seed, target)`. Arbitrary legal production targets use real market offers, purchases, loot, rerolls, server spending, battle settlement and selected public fusion. Donor pairs must be legally adjacent in the actual pre-battle snapshot; their IDs and the resulting output ID are recorded when consumed after that battle. Experimental, unknown, held or illegal target layouts are rejected. Default dimensions are normalized before exact-placement accounting.

The original named policies remain intact. `targetFilled` is still recursive ingredient ownership. New output-owned, output-placed and exact-target-layout counters prevent calling an uncombined ingredient inventory a completed fusion. All ordinary purchases and fusion consumption reconcile with the inventory ledger.

| Exact compact target cohort | Exact layouts reached | Round8 reached | Campaign wins | Actual fusions | Blocked paths |
| --- | ---: | ---: | ---: | ---: | ---: |
| Seeds101–130 | 8/30 | 15/30 | 127 | 17 | 0 |
| Held-out seeds201–210 | 2/10 | 3/10 | 30 | 3 | 0 |

Every completion includes an actually placed `go_instant`, rather than merely its donor inputs. The held-out cohort was not used to choose the layout.

**Acquisition floor is not total run spend.** For example, seed115 reaches the exact target at round7 after$40 of part purchases,$6 of server spending and$13 of rerolls. Its actual inventory has11 parts and CPU21/capacity21; the two actual acquired administrators are adnet and backup. The compact five-part target is a subset of that real board. The runner does not secretly discard the paid bridge UI or give the preset's administrator choices. Some other complete routes are genuinely overloaded and incur the engine penalty.

The original unrefined target also had8/30 exact completions and15/30 round-eight reaches in the primary cohort, with135 campaign wins and18 fusions. Thus improving finished-board connectivity did **not** improve every paid-path outcome. The transaction policy remains a bounded heuristic; none of these frequencies are optimal acquisition probabilities or guaranteed shop availability.

## Reproduce and verify

Paid evidence requires no retained search artifact:

```sh
node --import tsx scripts/reachable-counter-benchmark.ts --first-seed=101 --seeds=30
node --import tsx scripts/reachable-counter-benchmark.ts --first-seed=201 --seeds=10
node --import tsx --test tests/balance-reachable-compositions.test.mjs tests/balance-paid-targets.test.mjs tests/qa-paid-target-ledger.test.mjs
```

To replay the exact historical finished-layout comparison, supply the retained source shortlist rather than a newly optimized population:

```sh
node --import tsx scripts/reachable-counter-benchmark.ts --search=.verification/balance/reachable-open-source.json
```

Large raw source, paid-route and matchup reports stay under `.verification/balance/reachable-*`; only code, tests and this compact evidence note are maintained. The report includes exact target geometry, current combat version, fixed comparison conditions, costs, both-seat results, actual transaction provenance and completion witnesses. Browser rendering remains unverified under the existing environment restriction.
