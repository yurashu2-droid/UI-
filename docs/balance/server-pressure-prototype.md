# Placed server-pressure laboratory prototype

Implemented as one bounded experiment against `server-pressure-design.md`. This is not a canonical combat version or an online rollout.

## Try it

In the laboratory, open the opponent/inspector panel and choose **実験：一時サーバー負荷（双方CPU 26）**. Explicit comparison variants use **15/15** or **38/38** CPU; switching rules is locked during battle and reset when leaving the laboratory. These are provisional symmetric capacities, not campaign server-plan data.

Place **自動閲覧ジョブ一覧** next to an income widget, with ordinary text/video beside that income widget. The job table's trial investment is **$7, CPU3, 280×112** at native size. It spends **$3** per funded natural activation, nominally every **4 seconds**. Source income is routed exclusively to one consumer, storage caps at **$6**, and unconverted surplus stays in cumulative income. Blocked attempts remain paid. No income/organic-engagement event is created by a job, and replay cannot repeat it.

Each accepted wave adds **6 temporary work** for **5 seconds**, with a page-shared cap of **12**. Lots expire independently; new waves do not extend older lots. Excess effective load rescales natural clocks proportionally and uses the existing **12HP/s maximum** overload departure channel. Cache recharge shares the same boundary convention; administrator clocks remain independent. reCAPTCHA/CAPTCHA reject the work. Existing HTTP429 and cache retain their original damage/cover roles.

The page header shows base CPU + temporary work / capacity, queue fill and next expiry, separately from real viewer HP. The job table shows funding, executed attempts and paid rejections. In this experiment the real-viewer cursor projection follows each side's HP independently, including recovery after healing/backup; it never turns overload departures into gained opponent viewers.

## Bounded fixture evidence

Run `node --import tsx scripts/server-pressure-benchmark.ts` for all 36 rows. The core authored comparison has equal **$21** input investment:

- Attacker: three `ab_nav`, `go_ads`, and `go_jobs` (CPU8)
- Ordinary alternative: replace the $7 job table with a $7 `gov_pdf` (same CPU8)
- Defender: three `yt_play` (CPU15)

At 440HP, no administrators, and symmetric CPU15, the pressure build wins with about **54HP** remaining; the ordinary alternative loses. With CPU26 headroom or a CAPTCHA administrator, the pressure build loses. At160HP it loses even against the CPU15 target, making funding startup a real cost. The placed reCAPTCHA comparison also defeats the pressure build and explicitly records its extra $8 fusion-input investment and CPU2. The study includes early/late HP, zero/two administrator baseline variants, multiple headroom levels, legal placement and seat swaps. CAPTCHA-only rows use one defense slot; this is explicitly reported rather than called a zero-slot defense.

This is evidence of the intended susceptible/counter interaction in one legal fixture, not an open-composition/global-balance certification. Neighboring wave/cooldown/lifetime sweeps and wider composition search remain prerequisites to production adoption.

## Verification and isolation

- Baseline before this ticket: 581 tests passed
- Prototype integration evidence before publication: 608 tests passed; typecheck and Vite build passed. The frozen publication snapshot is rechecked separately
- Old combat-v2/v3/v4 golden replay checks and the pre-ticket online catalog fingerprint remain unchanged
- New online commands reject the experimental flags; campaign/story/default laboratory paths do not enable the experiment
- Independent audit found and verified fixes for stale CPU display, cache expiry drift, zero-sum cursor projection, and recoverable departed cursors; no code-level blockers remain for this isolated prototype
- Cloud browser returned `ERR_BLOCKED_BY_CLIENT` for the local preview. No bypass was attempted. Pixel-layout and full interactive browser QA remain unverified
- The prototype does not generate real network traffic. It is included in the dedicated development-branch checkpoint; no public service deployment or main-branch merge is part of that publication

Detailed local outputs: `.verification/server-pressure-tests.log`, `.verification/server-pressure-build.log`, `.verification/server-pressure-benchmark.json`.
