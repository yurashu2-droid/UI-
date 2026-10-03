# THE LAST BROWSER: paid progression evidence

## What is established

The current eight-stage, fifteen-encounter story can be completed from its actual blank page, initial $11 and capacity 12. The paths in `scripts/story-progression-benchmark.ts` buy only current shop offers, pay every reroll and server upgrade, collect only actual battle rewards, and settle the real combat engine. No parts, capacity, currency, HP, wins or records are injected. Fixing the seed selects deterministic shops rather than granting resources.

Every accepted story transaction is validated and JSON-round-tripped. Each battlefield is checked using the editor's real geometry rules. All cash is reconciled as `11 - purchases - rerolls + battle earnings`. Capacity remains the actual purchased value; overload is allowed to incur the ordinary engine slowdown. Battles, losses, fusion, records, ending restoration and the first restored-page visit use the production session APIs.

These are reproducible heuristic examples, **not population win rates, optimal-play proofs or browser visual QA**. The older transaction-only fifteen-battle test with a preassembled build and capacity 200 is not acquisition/difficulty evidence.

## Current combat-v4 recheck — 2026-10-03

Fresh execution of the existing paid path runner under production `combat-v4`, using the same seeds 101–130 and the same three policies, reproduces the earlier `combat-v3` results:

| Policy                            | Pass stage two | Full fifteen-win ending | First-attempt stage-two wins |
| --------------------------------- | -------------- | ----------------------- | ---------------------------- |
| Navigation, capped at six attacks | 30/30          | 0/30                    | 30/30                        |
| Commerce                          | 30/30          | 20/30                   | 29/30                        |
| Mixed                             | 30/30          | 29/30                   | 29/30                        |

Every complete route obtains all eight records and performs the actual archive restoration, ending-link placement and first visit. All ninety route outputs exactly match the stored v3 outputs after excluding only the `rulesVersion` label: purchases, rerolls, cash, capacity, chosen loot, fusion, boards and battle results are unchanged. This is a new execution of every session transaction, not a replay of completed boards.

The existing no-Cart alternative also reproduces all thirty earlier route outputs exactly, including 23/30 endings. Seed 130 commerce, mixed and no-Cart mixed still finish without losses with the costs shown below. The existing seed 130 finale check also completes with the tutorial newsletter held off-board.

The baseline includes 1,280 battles, of which 69 are genuinely overloaded at their purchased capacity. No route receives an economy or capacity grant, encounters a rejected transaction, or loses its fusion kit. Every placed player board contains at most two `am_oneclick` copies, below v4's new three-copy threshold; the [v4 repeated-copy change](combat-v4.md) therefore does not alter these paths. This does not establish progression for strategies that assemble three or more copies.

The bounded navigation policy still exhausts its lives at stage six, as do ten commerce and one mixed route. These are canonical-story losses, distinct from the separate legacy eight-round expedition studies. Of the 41 failed paths, 35 end at `permission-desk` and six at `permission-proof`; no new progression-state roadblock or authored-content change is indicated by this comparison.

The runner now checks each actual battle's version against the version it reports. The existing five paid-progression tests and all 42 story/session/QA tests pass. Those counts describe focused existing coverage, not the whole repository suite or visual acceptance.

## Seed 101: recover the first stage-six loss with owned UI

The only failed baseline mixed path is seed 101. Its first loss is the twelfth attempt, `permission-proof`: it enters with $105, three lives, load 38/capacity 49, twenty owned parts and no admins. The original board loses at 20.65 seconds, leaving the enemy with 12.6 HP. Settlement is retained: the player has $121 and two lives. This is a reproducible heuristic failure, not a softlock.

From that real post-loss save, perform these **two ordered editor moves** without resizing, selling, rerolling or buying:

1. Move the existing newsletter `p9` from `(592,16)` to `(592,472)`
2. Move the existing Instant Search `p24` from `(32,288)` to the now-free `(592,16)`

Both moves use `R.move` and `updateStoryBuild`; trying the second move first is rejected because the newsletter still occupies the destination. Every owned item, size, cash value, capacity purchase and admin is preserved. Instant Search now gives the adjacent heading `p1` and blue link `p4` its actual +45% text-power bonus. This does **not** boost every entry in the navigation row.

The next attempt wins `permission-proof` in 19.75 seconds with 29/380 HP. Keep this board through the rest of the story. Claim the first offered reward each time and leave those new parts in inventory: breadcrumb, form, form, search. With no further purchases, rerolls or board edits, the route wins `hidden-boundary` (328 HP), `hidden-relay` (304 HP), and WHITEOUT (182 HP), obtains all eight records, restores the archive, places the ending link and performs the first restored-page visit. That is the same fifteen canonical victories across eight stages, plus the one retained loss, not a shortened plot.

The ending has $199, reconciled as `11 - 76 purchases - 19 rerolls + 283 actual battle earnings`; capacity stays 49 and admins remain empty. Stage advancement restores one life, capped at three; this particular continuation therefore returns from two to three lives. No enemy, item definition, combat rule, story content or production code was changed for this witness. The default mixed policy remains 29/30 endings; the opt-in recovery is a separate bounded continuation, not an upgraded baseline rate.

### Controls and available paid alternatives

Each comparison starts independently from the same **settled first loss**. Their results are not combined into a fictitious single route.

| Change before retry                                                                                                     | New spending | Outcome                                                 |
| ----------------------------------------------------------------------------------------------------------------------- | -----------: | ------------------------------------------------------- |
| None                                                                                                                    |           $0 | Loss at 20.65s; enemy retains 12.6 HP                   |
| Move only seek bar `p20` to `(544,424)`, directly under the video                                                       |           $0 | Simultaneous draw at 20.65s; still consumes a life      |
| The newsletter + Instant Search moves above                                                                             |           $0 | Win at 19.75s, 29 HP; verified full-ending continuation |
| Buy the currently offered Search Result (`go_result`) and place it at `(32,472)`, size 280×96                           |           $6 | Win at 20.4s, 29 HP; load 41/49                         |
| Buy the currently offered Prime (`am_prime`); move wish `p11` to `(320,472)` and place Prime at `(320,96)`, size 192×40 |           $5 | Win at 19.75s, 29 HP; load 40/49                        |

The paid alternatives use the actual post-loss shop, not the different shop available before the loss. Only the free, two-move continuation was taken through the ending; the paid alternatives establish this retry only. A combined video/Instant Search probe also won but was unnecessary, so it is not part of the maintained recovery policy.

**Player lesson:** when a text-support part such as Instant Search is already owned, check which attacks its current position actually supports before spending or retrying unchanged. This coordinate recipe applies to the recorded seed-101 board; it is not a general recommendation to put the part in that corner on arbitrary pages. Linking the video is useful, but here it merely changes a loss to a life-consuming draw.

### Reproduce the recovery

```sh
node --import tsx scripts/story-progression-benchmark.ts --seeds=1 --policy=mixed --recover
node --import tsx --test tests/story-paid-progression.test.mjs tests/story-paid-recovery.test.mjs tests/qa-story-paid-recovery.test.mjs
```

The opt-in option is `{recovery:"seed-101-instant-navigation"}`. It rejects other seeds, policies or combined options. Its output includes the genuine before-loss, after-loss and before/after-retry saves, the two moves, every battle and ledger entry, and the terminal session. Saves are generated by the original paid path, never assembled from injected inventory. Every accepted transaction still validates and JSON-round-trips.

The five added regressions (four route tests and one independent QA test) cover the original paid prefix, the full ending, untouched post-repair board with held loot, current-shop paid alternatives, bounded option scope, the coordinate-only delta, real loss replay and non-winning controls. Independent QA also rebuilt the baseline from a fresh session and confirmed exact snapshot/ledger agreement. Generated evidence is local under `/tmp/ui-raid-story-recovery/` and `/tmp/ui-raid-story-recovery-qa/`; maintained reproduction does not require those files. At this recovery checkpoint, all 700 repository tests, all 47 story/session/QA tests, and the typechecked production build pass. This is engine/session evidence, not browser visual QA or a proof for other failed policies.

## Seed 101: paid navigation recovery and the whitespace boundary

The unchanged navigation policy still ends **0/30** in the bounded baseline. This separate witness replays seed 101's original purchases, rerolls, loot, legal placements and tutorial fusion through a fresh production session. It keeps the first real `permission-desk` loss: 19.50s, enemy 66 HP, entering with $92, three lives and load 31/capacity 35. Actual settlement leaves $108 and two lives, and fuses the existing guestbook/counter into a Blog. An unchanged post-loss retry still loses (enemy 21 HP); the different result reflects that real settlement fusion, not a changed opponent.

From that recorded post-loss state:

1. Buy the currently offered Search Result for **$6**. Place it at `(32,272)` with size **260×80**. Retry `permission-desk`: win at 20.10s with 9 HP. Claim the breadcrumb reward and leave it in inventory.
2. Before `permission-proof`, buy its actually offered Star Review for **$4**. Move existing heading `p1` to `(32,384)`, then place the new review at `(512,96)` with size **280×32**. No other previously owned UI moves or changes size. Retry: win at 20.10s with 9 HP.
3. Keep that board unchanged, claim the first offered UI each time, and leave new loot in inventory. The next three fights finish with 318, 289 and 155 HP. The route obtains all fifteen canonical victories and eight records, restores the archive, places the ending link and makes the first restored-page visit.

Total new recovery spending is $10; the entire paid route ends with **$196 = $11 − $50 purchases − $18 rerolls + $253 earnings**. Purchased capacity remains 35, final fighting load is 34, and there are no admins. No cash, stock, loot or capacity is injected and no game rule, opponent or story content is changed.

This is a narrow arrangement, not “buy any two attacks.” The review supports both existing purchase buttons (`p12`, `p14`), giving each ×1.20 power. Its compact partner preserves **60.11% free space**, keeping the first two navigation links' existing whitespace bonus. Holding the same paid review away from those buttons loses. Enlarging the Search Result to 280×96 drops free space below 60%, reducing each highlighted link’s additive whitespace bonus from +3 to +2, and also loses. Buying only the Search Result wins the desk but then loses the proof (enemy 16 HP).

**Player lesson:** before adding or enlarging UI, compare both actual support targets and page whitespace. Extra occupied area can lower the links’ additive whitespace bonus from +3 to +2 even when CPU still fits. The coordinates above apply to this exact recorded board; they are not a universal layout or an improved baseline completion rate.

Reproduce with `node --import tsx scripts/navigation-recovery.ts` and `node --import tsx --test tests/navigation-recovery.test.mjs`. The script outputs before/after-loss saves, both paid recovery builds, the exact original paid prefix, full cash ledger and terminal session. Six regressions cover full completion, original-prefix agreement, the one-existing-item move, unchanged board/capacity through the ending, non-winning unchanged/one-purchase controls, disconnected review and oversized-result controls. Browser visuals remain unverified.

## Seed 101 commerce: connect spendable income charge

The original commerce policy remains **20/30 endings** in the fixed-seed baseline. This separate witness keeps seed 101's real first `permission-desk` loss: 20.65 seconds, enemy 65.2 HP, entering with $110, three lives, eighteen owned parts and load 33/capacity 35. Actual settlement leaves $126 and two lives, without a new fusion or changed inventory. The existing 1-Click `p18` was obtained by genuine earlier fusion. An unchanged retry loses again; no parts or funds are supplied for recovery.

Apply these **five ordered editor transactions**, retaining every item and its size:

1. Put Newsletter `p9` in inventory temporarily
2. Move heading `p1` from `(528,80)` to `(592,16)`, the space just cleared
3. Place that same Newsletter `p9` at `(544,80)`
4. Move Wish List `p11` from `(320,96)` to `(32,288)`
5. Move Mail `p14` from `(320,144)` to the now-free `(320,96)`

Every transaction uses `R.move` and `updateStoryBuild`, validates and JSON-round-trips separately. There are no purchases, rerolls, resizes, sales, server upgrades or admin grants after the loss. Final placement still has load 33/capacity 35 and 62.965686% free space, with identical per-item combat modifiers, recognized groups and natural periods. This is a connection change rather than a new part or a whitespace-tier upgrade.

Retry `permission-desk`: win in 18.40 seconds with 60/380 HP. Keep that board unchanged through `permission-proof` (20.40 seconds, 29 HP), `hidden-boundary` (322 HP), `hidden-relay` (283 HP), and WHITEOUT (163 HP). Claim the first reward whenever offered and leave new loot in inventory. The continuation obtains all fifteen canonical victories and eight records, restores the archive, places the ending link and performs the first restored-page visit. Final cash is **$226 = $11 − $55 purchases − $17 rerolls + $287 actual earnings**; capacity stays 35 and admins remain empty.

### Cumulative income is not converter charge

The failed board earns 41 battle income, but none is routed or spent: 1-Click is not connected to an earning source. The repaired desk/proof board earns 42; Newsletter and Mail route 23 into the existing 1-Click, which spends 21 in seven $3 conversions and retains charge 2. The other 19 income is not converted, but still belongs to cumulative income. Charge spending does not subtract from that cumulative total or directly debit run cash. Each winning settlement still grants its ordinary capped income reward; the desk grants $20 total, not an extra $21 converter refund.

There is one additional income relation: moving Wish places it beside Counter `p24`, which earns once per four nearby fires. In the desk comparison this counter earns 6 rather than 4; Counter `p23` earns 4 rather than 5 because the repaired battle ends earlier. Hence baseline income 41 and repaired income 42 must not be treated as identical runtime traces. No text-power, speed or whitespace modifier is added.

The following matched controls retain the repaired Wish-to-Counter relation, the same 42 raw income, money, modifiers, load and area:

| Control from the repaired board | Routed / spent charge | Result |
| --- | --- | --- |
| Keep both income sources connected | 23 / 21 | Desk wins with 60 HP; proof wins with 29 HP |
| Return Mail to `(320,144)` | 15 / 15 | Desk wins with 29 HP, then proof loses with enemy 21 HP |
| Move Newsletter away to `(592,488)` | 8 / 6 | Desk loses with enemy 27 HP |

These controls establish the need for both source connections in this exact continuation, without claiming every commerce page should use these coordinates. The baseline policy, shops, enemies, story and combat-v4 rules are unchanged. Browser visuals remain unverified.

**Player lesson:** check whether income actually reaches the converter, not just whether cumulative income increases. A placed 1-Click still performs natural attacks without an income connection, and cumulative income can strengthen those attacks; the separate $3 spend requires nearby routed charge. The editor's 1-Click “つなぎ方” hint now states this distinction and the single-allocation rule.

Reproduce with `node --import tsx scripts/commerce-recovery.ts` and `node --import tsx --test tests/commerce-recovery.test.mjs tests/qa-commerce-recovery.test.mjs tests/oneclick-connection-guidance.test.mjs`. The script replays the paid prefix from a fresh session and outputs before/after-loss and retry saves, each move, the cash ledger, compact per-round conversion totals and terminal session. It requires no scratch reports or injected saved inventory.

## Earlier bottleneck study and bounded correction

The following candidate comparison and independent holdout are retained historical evidence, not fresh v4 runs of every rejected opponent. The six-part authored board remains current and is the board used in the recheck above.

The original `delivery-contract` inherited the complete ten-part commerce board and three back-office abilities (`adnet`, `cdn`, `server`). With its listed HP 270, server raises actual HP to 338. Its preceding encounter has four parts, no back-office abilities and HP 210.

Across seeds 101–130 and three straightforward policies, the original boss allowed only four of ninety paths through stage two. Those four paths were legal full clears, but each needed two stage-two losses. This disproved impossibility while identifying a large early spike.

The accepted authored correction keeps HP 270 and the original positions of product, quantity, the first purchase button, wish, coupon and cart, with only `server`. Later encounters and global combat rules remain unchanged. It preserves the purchase/coupon/cart lesson while removing the fully developed ten-part setup from the fourth battle.

Results per thirty fixed seeds, in policy order navigation / commerce / mixed:

| Stage-two opponent                  | Pass stage two | Full ending | First-attempt stage-two wins |
| ----------------------------------- | -------------- | ----------- | ---------------------------- |
| Original ten parts, three abilities | 0 / 2 / 2      | 0 / 2 / 2   | 0 / 0 / 0                    |
| Ten parts, server only              | 0 / 18 / 18    | 0 / 16 / 18 | 0 / 1 / 1                    |
| Ten parts, ad network only          | 0 / 21 / 21    | 0 / 17 / 20 | 0 / 2 / 2                    |
| Six parts, server only (current)    | 30 / 30 / 30   | 0 / 20 / 29 | 30 / 29 / 29                 |

Commerce/mixed first-attempt winners in that study retain median 112 of 220 HP at this boss; the current production recheck is unchanged. No blanket HP nerf or global Cart change was used. The one-ability-only ten-part alternatives still demanded repeated early losses from nearly every successful path.

An independent QA holdout, seeds 201–210, reproduced thirty of thirty first-attempt stage-two wins with the new board; mixed finished ten of ten and commerce five of ten. The original board passed stage two in only two of those thirty holdout paths, neither on the first attempt.

## Actual starter and fusion route

1. Buy the guaranteed heading ($5), blue link ($3) and navigation link ($3): exactly the initial $11, with load 5 of capacity 12
2. Win the first authored fight, receive the real $10 payout and choose a blue-link reward
3. Shop with those funds and defeat the fast personal page; the cash, offers, geometry and selected loot vary by seed and policy
4. Read the chapter record and advance. The host grants mail + coupon without cash, a shop roll or a network request
5. Place those two delivered parts adjacent and call the real rehearsal/fusion API. The result is `am_newsletter`; the persistent fusion witness is recorded before either stage-two fight
6. Continue using paid shop offers, normal rewards and actual server purchases

For example, current seed 130 commerce clears the first four battles without a loss. Its pre-battle cash is $0, $2, $5, $1; the matching load/capacity pairs are 5/12, 8/12, 13/17, 21/22. It leaves the stage-two boss with 129/220 HP and $21. This includes two paid small-server upgrades rather than ignoring overload.

## Distinct successful continuations

Seed 130 examples all finish fifteen victories without losses:

| Policy                    | Purchases (including servers) | Server spend | Rerolls | Earned | Ending cash | Final load/capacity | Final HP |
| ------------------------- | ----------------------------: | -----------: | ------: | -----: | ----------: | ------------------- | -------: |
| Commerce pursuit          |                           $77 |          $27 |     $27 |   $276 |        $183 | 43/54               |      230 |
| Mixed cross-culture       |                           $90 |          $27 |     $27 |   $276 |        $170 | 47/54               |      283 |
| Mixed, never acquire Cart |                           $76 |          $27 |     $27 |   $276 |        $184 | 47/54               |      237 |

The no-Cart policy excludes `am_cart` and does not obtain `am_oneclick`; it completes in twenty-three of thirty seeds. This is evidence that a Cart build is not a prerequisite for the story, not a claim that all combat archetypes have equivalent power. The policy's later cash surplus also reflects its deliberately bounded purchasing list; it is not an optimized spending strategy.

The finale regression also unequips the guaranteed tutorial newsletter before the last fight and still reaches the ending. The story uses recorded fusion history rather than forcing that particular UI to stay in the final build.

## Failures and limits

- Current production's ninety baseline runs had no rejected transaction, invalid save, missing fusion kit or unaccounted currency
- The deliberately capped six-navigation-attack policy passes stages one through five but exhausts its lives at the administrative network in all thirty seeds. This is a weak bounded policy, not proof that navigation cannot finish
- Ten commerce and one mixed baseline path also die in stage six. Those are real combat losses, not progression-state softlocks
- The no-Cart policy still fails in seven seeds. The harness does not search all legal shop, size or placement choices
- Existing session tests separately exercise interrupted battles, stale saves and full-inbox recovery. This report does not substitute for their boundary coverage
- No browser interaction, visual legibility, deployment or public URL is claimed

## Reproduce

```sh
node --import tsx scripts/story-progression-benchmark.ts --seeds=30
node --import tsx scripts/story-ramp-candidates.ts --seeds=30
node --import tsx --test tests/story-paid-progression.test.mjs
node --import tsx --test tests/story-*.test.mjs tests/qa-story-*.test.mjs
npm test
npm run typecheck
```

The candidate runner compares isolated copies in one process and restores the production encounter in `finally`. Its old ten-part baseline is sourced separately from the commerce archetype so promoting the authored six-part boss does not erase the comparison.

For alternatives, import `simulateStoryPath` and use `{excludedTypes:["am_cart"]}`, `{retireTutorialFusionBeforeFinal:true}`, `{layout:"modules"}` or `{navigationLimit:12}`. The explicit module layout and larger-navigation policy were investigated without improving the original boss bottleneck, so the content correction is not based solely on one accidental placement.

The current baseline is regenerated by the first command above. To reproduce the no-Cart cohort, import `simulateStoryPath` and run seeds 101–130 with policy `mixed` and `{excludedTypes:["am_cart"]}`; the finale alternative is seed 130, policy `mixed`, with `{retireTutorialFusionBeforeFinal:true}`.

Historical local generated evidence: `.verification/story-paid-production90.json` and `.verification/story-paid-no-cart30.json` contain the earlier v3 outputs used for the exact comparison; `.verification/story-ramp-candidates.json` retains the earlier candidate study. The independent historical holdout is `/workspace/shared/ui-raid-qa/story-ramp-holdout60.json`. These generated files may be absent from a fresh checkout; the executable scripts and tests are the maintained reproducible source.

At the original bottleneck-correction checkpoint, the five paid-progression regressions and then-current 339-test repository suite passed. Its sensitivity check restored the original boss only inside a process: seed 102 mixed returned three victories and zero lives, correctly violating the stage-two progression assertion. These historical checks must not be read as the current repository-suite count. Future product edits should rerun the commands above.
