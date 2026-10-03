# Combat v3: bounded navigation scaling

## Scope

This document records `combat-v3`. Current battles use [combat-v4](combat-v4.md), which inherits these navigation rules; explicit v3 remains replayable. Attack values, prices, CPU loads, faction bonuses and ordinary cooldowns are unchanged. Small navigation menus keep their original cadence. This is a bounded correction to cheaply repeated navigation; it is not an assertion that every archetype is fully balanced.

- Whitespace still adds `min(3, floor(freeRatio * 5))` damage, but only to the first two blue hyperlinks in canonical visual order (top, then left). Those two highlights are shared by the whole page. Splitting a list into separate groups cannot duplicate them.
- For attack parts tagged `navigation`, speed is divided by `1 + 0.05 * max(0, navigationAttackCount - 6)`. Total expected base throughput continues to grow as entries are added, with diminishing returns. Other attack families are unaffected.
- Inspector notes explain eligibility and the actual interval multiplier. Costs and unused acquisition opportunities remain visible in benchmarks.

## Evidence and rejected alternatives

Raw link/nav damage reductions plus a smaller whitespace bonus reduced wins from 259 to 169 across 100 paired heuristic acquisition paths, so that candidate was rejected. A per-list entrance bonus was also rejected because splitting lists bypassed it.

The selected rule produced 258 versus 259 wins across the same ordinary paths; eight-round reaches were 25 versus 26. A deliberate navigation-buy/reroll policy remained viable: 44 of 50 paths reached round eight, versus 47 before, while total wins fell from 366 to 286. Those paths paid actual purchase and reroll costs; catalogue price alone is not acquisition cost. Independent QA checked seat symmetry, frame partition, identity renaming and monotonic expected base throughput for 1–32 links.

These are deterministic scenario measurements, not population win rates. Cart/sustain diversity and larger late-game spam remain active balance work. Experimental HTTP429 is not treated as an already accessible production counter.

## Replay compatibility

`new E.Battle(player, enemy, { combatVersion: 'combat-v2' })` executes the prior navigation rules. Omitting the option now uses v4; select `combat-v3` explicitly to reproduce this historical pass. Unknown versions are rejected. `E.analyze(board, experimentalRules, combatVersion)` supports the same explicit version selection.

The immutable `tests/fixtures/combat-v2.json` is retained. All 20 old result/event hashes reproduce under the explicit legacy option. `combat-v3.json` uses those same frozen inputs; all winners remain unchanged, with one battle duration changing from 29.3 to 31.8 seconds. Replays must select their recorded combat version and still validate their catalogue fingerprint.

## Optional audience hypothesis

`audience-v1` remains an explicit laboratory option. In the app: メニュー → 実験室 → right-side 対戦ルール［実験室限定］ → 実験：広告の離脱・登録の定着. The selector defaults to 通常, applies to both pages, resets when leaving the lab or importing, cannot change mid-battle, and is not saved in the run. Campaign, story and online use ordinary economics. The API also retains `navigation-audience-v1` for historical comparisons; navigation is already canonical in v3.

Actual monetizing ad activations draw from bounded semantic-module and page exposure allowances. Excess exposure can cause self-departures: burst capacity 3 visitor-HP and refill 3 visitor-HP per second. Enlarging content or splitting it into many tiny sources cannot create unlimited page allowance. Ordinary one-ad video playback causes no churn.

Three eligible natural video views award a shared 2-point loyalty reserve, capped at 8 and expiring after 10 seconds without replenishment; duplicate membership buttons and replay copies do not multiply it. Membership revenue is provisionally $1 rather than $2. Loyalty prevents up to 25% of unshielded, nonpiercing departure damage, consumes its reserve, and never heals or spawns visitors. Piercing, server lag and overload retain their existing effect.

The audience constants are hypotheses, not approved production tuning. Visible cursors are scaled from engine HP; telemetry reports visitor-HP rather than claiming one HP equals one cursor.

## Reproduction

- `node --import tsx --test tests/balance-*.test.mjs`
- `node --import tsx scripts/builds-check.ts --json`
- `node --import tsx scripts/audience-benchmark.ts`
- `node --import tsx scripts/experimental-benchmark.ts --seeds=50`

## Native counter compositions

`nativeFortressCandidate` and `heavyDocumentCandidate` in `src/balance-candidates.ts` are measured laboratory layouts using only production parts; they do not replace presets or grant items.

- Paperwork defense costs $74 / CPU32, with two forms, four tables each containing its own PDF, two ordinary-sized font controls and two submit buttons. Its font effects have actual orthogonal coverage. It produces shielding and has no native healing.
- Heavy documents cost $75 / CPU27, with six PDFs, three font controls and three suggestion panels; every PDF genuinely receives both support effects.
- At HP440/CPU35 with no admins, native defense beats unfused Cart, but loses that edge when Cart is fused. Heavy documents narrowly beat the native defense. Own-admin profiles can reverse the results; those are reported separately from capacity changes, not attributed to CPU alone.
- The original author's layouts are not treated as optimal archetypes. Part-removal probes show Cart depends strongly on product, purchase, video and conversion connectivity. A fully assembled Cart also starts quickly, so its old blanket “weak opening” description was corrected.

Run `node --import tsx scripts/counter-builds.ts` for legal geometry, resource costs and both-seat comparisons with separately varied capacity, administration and fusion. Acquisition floors still do not prove these exact repeated-part layouts can be assembled cheaply in a run.


## Integrated composition examples and paid access

Three additional lab examples are now loadable and selectable as opponents: `b_fort_native`, `b_documents_heavy`, and `b_video_checkout`. The original six examples remain available. These are labelled late-game comparison examples; their cards show ingredient value, CPU, additional capacity above the initial 12, real connections, fusion materials and matchup limitations. The two embedded players in video checkout include their four original acquisition inputs in its $74 value.

`node --import tsx scripts/paid-target-benchmark.ts --seeds=50` pursues the original Cart, a real post-battle Cart fusion, native fortress and heavy documents through the actual campaign. Each starts with $10, uses the real market and offered loot, pays for up to three rerolls per round and server plans, and settles real battles. A modest paid bridge of at most four navigation attacks, one heading and one guestbook keeps unavailable target materials from being treated as free starting equipment. No part or shop offer is injected. The fusion branch deliberately places its two inputs together for a battle before consuming them; this temporary arrangement has a real combat opportunity cost.

In seeds 101–150:

- Cart pursuit: 177 campaign wins, 11/50 paths reached round eight
- Cart-fusion pursuit: 181 wins, 12/50 reached round eight, 17 actual fusions
- Native fortress pursuit: 214 wins, 20/50 reached round eight
- Heavy documents pursuit: 220 wins, 24/50 reached round eight
- None assembled every input of its ideal target. Mean final owned-input coverage was 50.8%, 51.5%, 35.0%, and 27.7%, respectively. `targetFilled` counts owned recipe inputs, expanding fused outputs; it does not promise that every input is placed or fully supported
- Same-seed/same-round counterfactual duels used each route's actual capacity and admins. Across 1,370 ordered duels there were zero reversed-seat winner mismatches. At round eight, each partial defensive/document policy beat unfused Cart in 7/10 shared survivors; each beat the fusion-pursuit policy in 8/11. Pursuit does not mean every snapshot is fused: filtering to an actually placed `am_oneclick` leaves seven shared round-eight opponents per counter, with six wins and one loss each. `targetHasOneClick` and `actualFusedSummary` make this distinction explicit. These are survivor cohorts, not probabilities for all starts

Independent QA reconstructed inventories from real-price purchases and offered loot, consumed fusion inputs once, and checked admins at each battle. Ten additional seeds per policy likewise produced no fully assembled target. These heuristic choices are not optimized players; waiting for a rigid target can underperform adaptable commerce. In separately authored story progression, both commerce and a policy excluding Cart have completed actual paid routes. Completed-board strength and reliable acquisition remain distinct measurements.

The video-checkout example beats heavy documents by only 0.4 HP at HP440/CPU35/no-admin; native fortress beats that video example, while heavy documents beat native fortress narrowly. This is a conditional cycle, not a robust all-budget rock-paper-scissors guarantee. Cart fusion and own-admin profiles still reverse some defenses.

### Initial tested-pass criteria

1. Deterministic results, seat symmetry, legal layouts and resource-conserving triggers pass; old replay hashes remain intact
2. Small ordinary navigation and ordinary paid progression remain viable after the bounded spam correction
3. Several production-parts paths have paid reachability evidence, and the lab makes functional alternatives discoverable with correct costs and fusion inputs
4. No claimed counter relies solely on an unavailable experimental part or an invented free completed board; capacity, administration, stage, fusion and unused acquisition opportunities are explicit
5. Surviving weaknesses and narrow margins remain documented. This qualifies an initial tested balance pass, not population win-rate equality, optimal-play proof or a claim about human enjoyment


The integrated nine-example benchmark currently runs 1,152 ordered comparisons across core, common ceiling, pressure, showcase, production-only, post-fusion and experimental-counter conditions. The explicit native-counter script now produces 300 distinct comparisons because the additional examples are real entrants. Historical 480/260 artifacts remain earlier six-example snapshots, not updated counts.

Administration remains a material sensitivity. Cart wins all eight authored opposing profiles under the two-own-admin pressure and four-own-admin showcase settings. A separate reversible probe gives the three new examples server+CDN first (backup+moderator later), without changing any part: Cart then wins 5/8 and 7/8, while heavy documents win 8/8 in those selected conditions. This does not certify every administrator package or establish a new universally dominant population strategy. It shows why fixed authored admin choices, the difficulty of repeatedly acquiring PDFs, and paid admin loot must be reported rather than hidden behind a single win-rate ranking. Shipped definitions retain their documented administration choices; the probe is labelled separately.

## Open-composition continuation

The authored examples are regression cases, not fixed classes. [Open-composition search](open-composition-search.md) now varies parts, counts, layout, size and administrator choices with actual ingredient, CPU and footprint accounting. Four crossed resource/seed searches found stronger repeated-1-Click packages than the original Cart example; overload-admitting probes retain that sampled hotspot. Independent cross-seed, administrator and part-removal audits are included. None of this establishes global optimality or paid reachability, and this continuation changes no runtime combat values.
