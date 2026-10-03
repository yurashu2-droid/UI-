# Repeated 1-Click: causal probe and bounded candidate

Status: historical candidate study, subsequently independently audited and implemented as [combat-v4](combat-v4.md). `OneClickAblationBattle` remains a diagnostic subclass pinned to an explicit v2/v3 baseline (default v3), so re-running these probes does not double-apply the production v4 correction. Legacy v2/v3 semantics and catalogue stats remain unchanged.

## What causes the sampled hotspot?

Starting from the independently verified $73/CPU23 four-1-Click board, the causal study tested 13 dial settings across HP220/440/660, capacity26/35 and zero/two administrators. Every two-admin condition tests the fixed server+backup attacker against all 36 opposing pairs on five selected opponent geometries. Each case is reversed: 28,860 ordered battles, zero mismatches.

The HP440/CPU35/two-admin slice is:

| Probe | Winner's wins /180 | Draws | Interpretation |
| --- | ---: | ---: | --- |
| Canonical | 180 | 0 | Verified sampled sweep |
| Natural 1-Click damage disabled | 0 | 0 | Natural damage is essential |
| Charge-conversion damage disabled | 180 | 0 | Routed charge damage is not required for this sweep |
| Lifetime-income damage growth disabled | 180 | 0 | Repeated income-based growth is not required either |
| Income growth shared among all copies | 180 | 0 | Sharing this term alone does not resolve it |
| Natural base12→9 | 180 | 0 | A broad base reduction is insufficient here and would harm single-copy use |
| Natural cooldown2.4→3 | 177 | 0 | Cadence is more consequential, but this broad change also touches single copies |
| Restore combined ingredient CPU load | 180 | 0 | Load rises23→31, still below35; compression cannot explain this condition |

The isolated damage ablations preserve clocks, real charge spending and natural notifications/income. Both sides receive each dial symmetrically. These are causal diagnostics, not all playable candidate rules.

## Preferred bounded candidate for independent review

Preserve pages containing at most two placed `am_oneclick` copies exactly. When a page has more than two, multiply every placed 1-Click natural clock, including its initial remaining time, by:

`1 + 0.25 × max(0, placedOneClickCount − 2)`

Do not change purchase price, ingredient value, load, natural damage, income growth, charge routing, charge spending or conversion damage. The count is pagewide so separate visual groups cannot bypass the threshold. Other commerce components remain unchanged.

This produces effective base natural-throughput equivalents of2,2.4 and2.667 full-speed copies at counts2,3 and4. Adding another copy still increases aggregate expected natural throughput; it introduces diminishing returns rather than a hard copy limit. Natural counters that genuinely depend on activation frequency still receive fewer notifications, which is an intended consequence of a slower natural clock.

The0.25 weight is preferred over the stronger 0.30 candidate for review because it removes the measured sweep with a smaller intervention. It is a game-design hypothesis, not a claim about real checkout systems.

## Single-copy and early/late preservation

The probe compared one/two/three/four-copy variants at HP220/440/660 and zero/two admins. All60 comparisons for one/two copies across the five repeat-cadence weights reproduced the canonical result, time, load, lag, income, metrics and per-part counters exactly.

Removing copies leaves their ingredient spending unused in this diagnostic; these checks are not equal-budget alternative strategies. Their purpose is to demonstrate the exact threshold boundary and preserve ordinary one/two-copy behavior. Existing paid oneclick-battery paths placed at most two outputs, so those particular observed boards are outside the intervention; that is not a claim about every possible campaign route.

## Both sides can reselect administrators

A separate 19,440-battle study exhausts all 36×36 pair choices on the same five opponent geometries at HP440/CPU35. It includes 540 reversed-seat samples, all exact.

| Rule | Best attacker's wins | Draws | Losses | Any fixed pair sweeps all180? |
| --- | ---: | ---: | ---: | --- |
| Canonical | 180 | 0 | 0 | Yes |
| Repeat after2, weight 0.25 | 156 | 5 | 19 | No |
| Repeat after2, weight 0.30 | 147 | 7 | 26 | No |

Thus the lost sweep cannot be recovered simply by changing the attacking board's administrators in this selected set. The old board remains strong; it is not made unusable.

## Compositions adapt too

The original open-composition search was rerun under each candidate via explicit battle-class injection. Canonical defaults are unchanged. Each of four runs performs 1,200 mutation proposals and the same geometry/resource/admin checks, administrator refinement and removal pass.

| Seed / CPU | Candidate | Candidate evaluations | Battles | Leading sampled family | Four-copy result |
| --- | --- | ---: | ---: | --- | --- |
| 101 /26 | weight 0.25 | 1,285 | 66,644 | six-onestop | third, $71/CPU21 |
| 202 /35 | weight 0.25 | 1,282 | 54,770 | native link-defense | mixed single-1-Click Cart is second |
| 101 /26 | weight 0.30 | 1,285 | 63,588 | six-onestop | third, $71/CPU21 |
| 202 /35 | weight 0.30 | 1,282 | 55,726 | mixed single-1-Click Cart | repeated-copy winner no longer leads |

All final reversed-seat checks in these runs passed. This shows why retesting only the original opponent set would be inadequate: alternative layouts adapt, and preserving single-copy commerce lets a mixed Cart remain competitive. These are two search environments per candidate, not exhaustive or human-population results, and do not prove that onestop/link-defense/mixed Cart form a balanced cycle.

## Decision and promotion history

Weight0.25 was independently approved as the smaller correction. The audit reproduced 52,152 causal/admin/adaptive-search battles plus 7,824 historical paid-route replays, and verified queued hits, one/two-copy preservation and frozen legacy hashes. The production implementation is separately versioned as combat-v4; v2/v3 remain selectable and the inspector shows the actual natural interval. This does not establish solved composition balance: every adaptive shortlist still contains an11/11 leader. Continue challenging those stronger families rather than treating this hotspot correction as a global balance certificate.

The separate [placeable server-pressure prototype](server-pressure-prototype.md) is now an implemented opt-in laboratory experiment, outside canonical combat-v4 and campaign/online rules. It is not a justification or substitute for this hotspot correction.

## Reproduction

```sh
node --import tsx --test tests/balance-oneclick-ablation.test.mjs tests/balance-open-*.test.mjs tests/qa-open-build-search.test.mjs
node --import tsx scripts/repeat-oneclick-benchmark.ts /tmp/open-robustness.json > /tmp/repeat-causality.json
node --import tsx scripts/repeat-oneclick-benchmark.ts /tmp/open-robustness.json --admin > /tmp/repeat-admin.json
node --import tsx scripts/repeat-oneclick-benchmark.ts /tmp/open-robustness.json --search --seed=101 --capacity=26 --weight=0.25 --iterations=1200 > /tmp/repeat-search.json
```

`/tmp/open-robustness.json` is generated by the commands in [open-composition-search.md](open-composition-search.md). JSON evidence is intentionally kept outside runtime sources.
