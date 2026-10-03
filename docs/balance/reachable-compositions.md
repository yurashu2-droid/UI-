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

A finite v4 search used seed303, $40 maximum input value, CPU17, HP300, two admin slots and300 mutation proposals. It evaluated385 candidates in35,477 battles, with no final seat mismatch. Its exact12 frozen candidate definitions, original search conditions and source-report SHA-256 are retained in the portable [comparison fixture](../../fixtures/balance/reachable-finalists.json), selected before the new presets were added. The full search report remains local. Adding a new search seed now changes subsequent search populations; rerunning a fresh search is a new experiment.

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

To replay the exact historical finished-layout comparison, supply the shipped source shortlist rather than a newly optimized population:

```sh
node --import tsx scripts/reachable-counter-benchmark.ts --search=fixtures/balance/reachable-finalists.json
```

Large raw source, paid-route and matchup reports stay under `.verification/balance/reachable-*`; only code, tests and this compact evidence note are maintained. The report includes exact target geometry, current combat version, fixed comparison conditions, costs, both-seat results, actual transaction provenance and completion witnesses. Browser rendering remains unverified under the existing environment restriction.

## Ordinary navigation and the attempted counter cycle

The next bounded check follows the two frozen finalists that beat compact search, using the same real-paid harness and the same seed cohorts. It does not start another composition search or adjust combat constants.

### Player example: links and directional replay

`b_navigation_replay` exposes the exact ordinary-navigation finalist as a player-only laboratory preset: **$28, CPU9, eight ordinary outputs, no fusion and no free administrators**. It also has `labOpponent:false`; the original35 numeric opponent indices stay fixed.

- Three links and four navigation controls provide seven natural attackers. The left vertical group and right horizontal group grant five of them15% navigation speed; the retro set also grants15%, while seven navigation entries incur the existing1.05× interval penalty
- The marquee at `(40,8,528,28)` is **not an adjacency support**. Its directional targeting chooses the nearest eligible attack to its right or below. Here it selects the first link at `(40,104)`, then replays its last natural payload at55%
- Against compact search at HP300/CPU17/no admins, the marquee performs three actual replays. The navigation page wins with33.1HP remaining. Tests check the actual echo source and target, rather than assuming an empty adjacency list means an inactive controller

| Paid target | Exact layouts,101–130 | Round8,101–130 | Exact layouts,201–210 | Round8,201–210 |
| --- | ---: | ---: | ---: | ---: |
| Ordinary navigation, $28/CPU9 | 10/30 | 13/30 | 3/10 | 3/10 |
| Frozen link-defense, $40/CPU14 | 0/30 | 8/30 | 0/10 | 0/10 |
| Navigation without marquee, $21/CPU7 | 10/30 | 12/30 | 3/10 | 3/10 |

All120 paths have zero blocked transactions. Their campaign-win counts are respectively123+33,99+24 and120+32. These are bounded policies in the **legacy eight-round expedition**, not the canonical15-battle story or population acquisition probabilities. The held-out seeds were not used to select the original navigation geometry.

Seed110 is a concrete navigation witness: exact target at round4 after **$30 part spend + $6 rerolls + $0 server spend**. One navigation control was a real loot choice. Its actual nine-item board includes a purchased guestbook, consumes CPU12/capacity12, and has the actually rewarded CDN administrator. The target's $28 input value and empty admin list are not a description of that full paid inventory.

Other completions retain extra paid UI: seeds103,113,115,126 and208 first complete at **CPU15/capacity12**, so their real boards incur overload. No paid bridge UI is deleted or free server capacity granted to conceal this.

### Counters found, and what remains unproven

Under the same HP300/CPU17/no-admin conditions against the same frozen12 finalists:

- Original navigation:10 wins,1 self-draw,1 loss, to the $40 link-defense finalist
- Link-defense:11 wins,1 self-draw,0 losses
- Navigation without marquee:9 wins,0 draws,3 losses, including a win-to-loss reversal against the three-onestop layout. It still narrowly beats compact search, with7HP remaining; the original navigation also beats this cheaper variant by8HP
- Every measured forward/reverse pair agrees on winner, time and normalized-HP margin

Thus removing marquee **does not preserve the measured outcomes**, and the ordinary preset retains its active replay. The cheaper variant is an explicit ablation, not an equal-strength replacement. No reachable closed counter cycle has been demonstrated, and this finite shortlist does not prove that link-defense has no counter.

HP also changes the result: at HP440 with the same CPU17 and no administrators, compact search beats the original navigation by just0.4HP in both seats. This is a narrow reversal, not a robust advantage; the HP300 result should not be presented as the default laboratory matchup or a universal search counter.

The defense target's acquisition bottleneck is repeated links. Its closest primary path, seed124 at round6, has seven of the eight required links and every other target output. The **11-part target-only subset is $37/CPU13** and beats the $28 navigation target in both seats at the normalized no-admin conditions. That is distinct from its **actual13-item paid board, $43/CPU15**, which retains two bridge navigation controls, has capacity21 and the actually acquired SNS/server administrators. The full paid board is not a <=$40 counter. This partial witness does not turn the original0/40 exact-completion result into a completed $40 defense target.

### Reproduce this increment

The existing wrapper now accepts `--target=navigation`, `--target=link-defense`, or `--target=navigation-no-marquee`; omitting it preserves the compact search/document default. Paid reproduction needs no retained raw artifact:

```sh
node --import tsx scripts/reachable-counter-benchmark.ts --target=navigation --first-seed=101 --seeds=30
node --import tsx scripts/reachable-counter-benchmark.ts --target=navigation --first-seed=201 --seeds=10
node --import tsx scripts/reachable-counter-benchmark.ts --target=link-defense --first-seed=101 --seeds=30
node --import tsx scripts/reachable-counter-benchmark.ts --target=link-defense --first-seed=201 --seeds=10
node --import tsx --test tests/balance-reachable-navigation.test.mjs
```

Use `--target=navigation-no-marquee` for the ablation. Append `--search=fixtures/balance/reachable-finalists.json` to use the historical12-finalist comparison. A new search after adding the preset would be a new population, not a replay of this comparison. Raw reports remain in `.verification/balance/reachable-navigation-*`, `reachable-link-defense-*`, and `reachable-navigation-no-marquee-*`. Browser presentation remains unverified under the existing restriction.

## Keeping paid bridge UI in hand after completion

A bounded follow-on replays only the five previously identified overloaded navigation seeds: **103,113,115,126,208**. Every one first completes at round6 with the same eight target outputs plus a paid heading and guestbook: **10 owned items, CPU15/capacity12**. The comparison uses the actual recorded enemy, base HP, administrators and purchased capacity, and first verifies that the untouched board reproduces its original winner and time.

The alternatives call the public editor transaction `R.move(run, id, null, null)` on the non-target heading, guestbook, or both. Every item ID and all item attributes except held coordinates remain unchanged. The exact target geometry, cash, inventory, administrators and capacity are preserved. There is no selling, refund, deletion, resource grant or changed combat rule. “Non-target” does not mean inactive: the heading still attacks and the guestbook still heals.

### The next battle at first completion

| Seed | Actual admins | Keep both: HP / seconds | Hold guestbook only: HP / seconds | Hold both: HP / seconds |
| --- | --- | ---: | ---: | ---: |
| 103 | troll | 112.1 / 14.25 | 156.6 / 12.40 | 113.7 / 14.30 |
| 113 | sakura | 77.3 / 15.65 | 131.9 / 13.60 | 102.2 / 15.05 |
| 115 | cdn | 113.096 / 15.65 | 161.672 / 13.60 | 135.536 / 15.05 |
| 126 | backup, moderator | 101.3 / 15.65 | 149.9 / 13.60 | 126.2 / 15.05 |
| 208 | sakura | 77.3 / 15.65 | 131.9 / 13.60 | 102.2 / 15.05 |

All fifteen displayed battles are wins; this does **not** convert losses into wins. Holding the guestbook alone leaves the heading attacking and reaches **CPU12/capacity12**. It removes the 1.15× overload interval and overload HP loss, leaving **44.5–54.6 more HP** and finishing **1.85–2.05 seconds sooner** than keeping both. Holding both reaches CPU9, but removing the extra attacker gives a smaller HP benefit and does not always finish sooner. Holding only the heading also removes overload but is worse than holding only the guestbook in all five first-completion battles.

### Why this is conditional advice

The same fixed paths contain **12 already-reached completed snapshots** in total. Replaying the later snapshots preserves the original purchases and actual admins; these are separate next-battle counterfactuals, not a replayed alternative campaign. The four primary paths buy capacity before round7 and reach capacity26. In all **six capacity26 snapshots**, holding only the guestbook worsens normalized HP margin: there is no overload left to remove, and its healing is lost. For example, seed115's round8 win falls from127.88 to91.88 remaining HP. Seed208 remains at capacity12 in round7, where holding the guestbook reduces the surviving enemy from223.3 to153.4HP, but still loses.

No winner changes across any of the12 snapshots and three holding policies. No alternative is settled, so this evidence makes no claim about changed income, future offers, survival, campaign-win totals or the canonical15-battle story. It is not a general recommendation to strip completed boards down to their preset or to sell useful spare UI.

**Player guidance:** when a completed board is overloaded, try returning a non-target support to hand while keeping useful attackers. Check the resulting battle; put healing back under consideration after buying capacity. In these five specific round6 inventories, holding the guestbook is better than holding every bridge item.

Reproduce from the existing real-paid harness, with no retained report required:

```sh
node --import tsx scripts/paid-bridge-cleanup-benchmark.ts
node --import tsx --test tests/balance-paid-bridge-cleanup.test.mjs tests/balance-reachable-navigation.test.mjs
```

The script contains only the five fixed seeds and three editor choices, with no search or optimization framework. Its report retains the original paid snapshots, item provenance and alternative boards/results. Browser presentation remains unverified under the existing restriction.
