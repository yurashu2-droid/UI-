# Proposed virtual server-pressure loop

Status: design contract for the isolated opt-in `server-pressure-v1` laboratory prototype. See `server-pressure-prototype.md` for implementation and measured acceptance. No canonical campaign/online mechanic or real network activity is enabled. Numeric values remain experimental hypotheses, not approved production balance constants.

## Player-facing goal

Make a resource-pressure composition that can topple a capacity-tight opponent, but loses the audience race when the opponent has spare CPU or bot defenses. The interesting decision is whether to spend the page's budget, CPU and income on ordinary content or on pressure, and whether to reserve capacity or an admin slot against that pressure.

This should emerge from the current game state rather than a special “beats commerce” exception. In particular, a low-CPU purchase battery may naturally resist pressure when its server has enough headroom; the mechanic is not a pretext for an invented hard counter to the current repeated-1-Click hotspot.

## Recommended first scope

One new **placeable UI**, an automatic-viewing job table (`自動閲覧ジョブ一覧`), plus placed reCAPTCHA and spare capacity. This is a page component with size, price, CPU and spatial connections, not a new back-office administrator. Admin CAPTCHA is an optional additional defense. A dedicated intake limiter can be considered after this interaction is measured; it should not be added merely to fill out a larger catalogue.

The actual UI composition is normal text/video content → nearby income widget → nearby funded job table. Placement decides which consumer receives income; it cannot charge both a purchase button and a bot source with the same money. The defender can build its own reCAPTCHA UI from existing ingredients. A native job-list table with queued/running/blocked rows, status dots, charge and blocked-count feedback makes the role legible.

Everything occurs inside the deterministic battle simulation. A wave is a game event containing a bounded amount of work. It has no URL, socket, fetch, browser navigation or network destination. The website-ingestion feature never supplies a traffic target.

## Proposed rule contract

### Funding and attack opportunity cost

- The panel consumes actual routed income charge, using the existing single-consumer conservation rule. Suggested starting hypothesis: $3 per wave
- It has its own natural cooldown, suggested 4 seconds, and emits at most one wave per activation when funded
- Its purchase price, native size and CPU cost are visible. Initial tuning range: $6–8 and CPU3–4, with no ordinary attack damage
- Charge is spent when a funded wave is attempted, including a wave rejected by CAPTCHA or an intake limit. Unfunded activations send nothing and spend nothing
- Storing charge is bounded at two waves. Surplus income remains in the page's real cumulative-income ledger but cannot be duplicated into a second consumer
- Replayed activations cannot manufacture new pressure or duplicate payment. Start with natural funded activations only
- Bot-panel activity is not organic content engagement. It must not trigger counters or ads to fund itself, and a blocked bot wave must not create income

This makes a defended attacker lose tempo, resource efficiency and real visitor-HP to the opponent's ordinary content. No extra real visitors or money are created from bots. An arbitrary direct self-HP tax is not recommended initially: the paid funding and page opportunity cost already explain the risk in existing game terms.

### Temporary opponent queue

Maintain a separate incoming-work ledger; never alter the placed parts' intrinsic CPU values.

- Work units use the same scale as CPU load for this game calculation, but are labelled temporary queued work, not permanent part load
- Suggested probe point: add 6 work units for 5 seconds per accepted wave, with a shared cap of12 on the defender's entire page
- Duplicate sources share that cap. Splitting them into groups cannot create more allowance
- Accepted work is the minimum of the wave size and remaining page allowance; excess is rejected. A new wave must not refresh the expiration of previously accepted work
- Each accepted lot expires on a fixed battle tick. With no more accepted waves, every added work unit disappears within5 seconds
- Effective load is base placed-part load plus currently queued work
- Existing spare capacity absorbs effective load up to the server capacity. Only excess load creates slowdown and visitor departures

The initial simulator should compare neighbouring wave/cooldown/lifetime values rather than assume this numerical point is correct.

### Slowdown and visitor loss

Reuse the current load relationship: lag multiplier is `1 + 0.6 × max(0, effectiveLoad/capacity − 1)` for a finite positive capacity. Server-plan capacity remains distinct from the `server` administrator, which increases HP, not CPU.

For natural component clocks, change remaining time proportionally when lag changes. Do not reset the timer, grant an extra activation or change the relative completion progress. When the queue expires, restore the corresponding cadence without a burst of overdue activations.

Reuse the existing excess-load visitor departure calculation, using effective load for the temporary contribution. Keep its total12 HP/s cap, including ordinary overload; do not add a second uncapped damage channel. These departures are real visitor-HP loss and are labelled overload, not ordinary attack damage or literal zero-sum visitor transfer.

Existing back-office administrator clocks stay independent, matching their current behavior. A defeated side still uses the existing backup/victory logic. This is a recoverable overload state, not permanent shutdown, destruction of a component, or deletion of a page.

### Counterplay

1. **Spare capacity:** simply retain sufficient headroom or pay for a server plan. This uses money/unused build capacity rather than requiring a specific part
2. **CAPTCHA/reCAPTCHA:** reject bot-tagged incoming work through the existing bot-defense predicate. The defender pays an admin-slot or fusion/input/CPU/space opportunity cost. A spent attacking wave stays spent when rejected
3. **Ordinary content pressure:** while the attacker spends income on blocked/absorbed waves, damage-oriented content can win the visitor race. Keep a mixed attack viable so one defense does not erase every possible output of the whole page
4. **Possible later intake limiter:** if binary CAPTCHA counterplay proves too narrow, a distinct request-intake UI could impose a small incoming-work budget. This would be a new mechanic with separately priced capacity and recovery, not a reinterpretation of the existing HTTP429 part

Current `gov_rate_limit`/HTTP429 limits per-hit damage using a token budget. It does not currently limit incoming requests or CPU load. Current AI troll attacks visitor-HP, and AI sakura inflates cosmetic bot numbers; neither is already a server-pressure attack. The proposal must preserve these distinctions in code, inspector text and effects.

## Presentation requirements

- Show base CPU, temporary queued work and server capacity separately, for example `23 + 6 queued / 26`
- A small queue/expiry meter should make accumulation and recovery readable
- On interception, show that the bot wave was rejected and its funding was still spent. Do not show fake bots turning into real viewers
- Inspector shows wave funding, natural cooldown, work amount, lifetime and shared cap
- Effects distinguish “ordinary visitor attack,” “bot wave,” “queue accepted/rejected,” and “overload departures” without implying actual web traffic

## Required isolated experiments before implementation approval

There is an explicit integration prerequisite: ordinary `Battle` capacities default to Infinity, lab uses Infinity, and the current `R.startBattle` call does not supply finite enemy capacity. Therefore the first isolated experiment must explicitly set and display finite symmetric capacities. Production adoption would require designed enemy/campaign/story capacity data and appropriate replay/save contracts. Do not imply that current enemies already expose a meaningful spare-CPU meter or that the existing administrator-server HP meter measures load.

- Same budget, several spare-capacity levels, early/late HP, zero/two admins
- Equal-investment normal offense versus pressure/mixed offense against capacity-tight and capacity-rich defenders
- CAPTCHA/reCAPTCHA opportunity cost: defense should matter, yet not become universally mandatory against ordinary compositions
- One/two/many pressure sources; duplicate placement and group-splitting must not bypass cap or funding conservation
- Repeated boundary ticks, queue full/empty, expired lots, no charge, routed surplus and defense enabled
- Seat swaps, item-ID renaming, different frame partitions and simultaneous incoming waves
- Exact resource conservation: each dollar routed/spent once, no fake audience creation, no duplicated queue on replay
- Temporal recovery: silence clears all temporary work, clock progress is preserved, no permanent penalties survive a battle
- Existing combat-version replay hashes stay intact. Any production adoption needs an explicit new combat version and compatibility tests
- Continue the open-composition search after any proposed rule is enabled. Fixed authored layouts alone cannot certify this mechanic

## Rejected first-pass alternatives

- Permanent CPU sabotage or disabled parts: too hard to recover from and obscures construction decisions
- Unlimited cumulative bot load: makes repeated sources a trivial runaway rather than a composition choice
- Returning blocked bots as real healed viewers or revenue: violates the game's fake/real audience distinction
- Renaming current HTTP429 damage mitigation as request limiting: misleading and a silent change in its role
- A universal direct self-HP penalty: less legible than paying the already-existing income resource and offensive opportunity cost
- Real traffic or instructions affecting any external server: outside the mechanic entirely
