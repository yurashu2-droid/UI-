# THE LAST BROWSER: paid progression evidence

## What is established

The current eight-stage, fifteen-encounter story can be completed from its actual blank page, initial $11 and capacity 12. The paths in `scripts/story-progression-benchmark.ts` buy only current shop offers, pay every reroll and server upgrade, collect only actual battle rewards, and settle the real combat engine. No parts, capacity, currency, HP, wins or records are injected. Fixing the seed selects deterministic shops rather than granting resources.

Every accepted story transaction is validated and JSON-round-tripped. Each battlefield is checked using the editor's real geometry rules. All cash is reconciled as `11 - purchases - rerolls + battle earnings`. Capacity remains the actual purchased value; overload is allowed to incur the ordinary engine slowdown. Battles, losses, fusion, records, ending restoration and the first restored-page visit use the production session APIs.

These are reproducible heuristic examples, **not population win rates, optimal-play proofs or browser visual QA**. The older transaction-only fifteen-battle test with a preassembled build and capacity 200 is not acquisition/difficulty evidence.

## The early bottleneck and bounded correction

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

Current commerce/mixed first-attempt winners retain median 112 of 220 HP at this boss. No blanket HP nerf or global Cart change was used. The one-ability-only ten-part alternatives still demanded repeated early losses from nearly every successful path.

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
npm test
npm run typecheck
```

The candidate runner compares isolated copies in one process and restores the production encounter in `finally`. Its old ten-part baseline is sourced separately from the commerce archetype so promoting the authored six-part boss does not erase the comparison.

For alternatives, import `simulateStoryPath` and use `{excludedTypes:["am_cart"]}`, `{retireTutorialFusionBeforeFinal:true}`, `{layout:"modules"}` or `{navigationLimit:12}`. The explicit module layout and larger-navigation policy were investigated without improving the original boss bottleneck, so the content correction is not based solely on one accidental placement.

Local generated evidence: `.verification/story-paid-production90.json`, `.verification/story-paid-no-cart30.json`, `.verification/story-ramp-candidates.json`. The independent holdout is `/workspace/shared/ui-raid-qa/story-ramp-holdout60.json`. These are generated measurements; the executable scripts and tests are the maintained reproducible source.

Fresh verification at this checkpoint: five paid-progression regressions passed; the whole repository suite passed 339/339. A sensitivity check restored the original boss only inside a process: seed 102 mixed then returned three victories and zero lives, correctly violating the new stage-two progression assertion. Typecheck passed. Future product edits should rerun these checks.
