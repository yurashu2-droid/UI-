# Version-history restore: quarantined effect probe

Status of this preserved first-stage investigation: **quarantined prototype comparison**. A later actual experimental definition was authorized and is documented separately in `history-trial.md`; the measurements below still refer to the original surrogate. The implementation lives only in `scripts/experiments/version-restore.ts`; the app, campaign, story and online do not import it. During this first-stage probe, combat-v2/v3 behaviour and catalogue definitions remained unchanged.

## Question and recommendation

Can a last-hit restore create a useful choice against slower, larger attacks while ordinary healing remains better against rapid/chip pressure?

The initial evidence supports further independent QA of this candidate, rather than a live promotion:

- Proposed item: `go_history`, 変更履歴・版を復元, $6 / CPU2, 280×112; the $5 price boundary is also reported
- Every 5 seconds, attempt to restore 50% of the latest qualifying opponent UI's actual **nonpiercing** HP loss, capped at 12
- One shared page record, consumed once. Another hit overwrites it, including a zero-HP hit clearing it. A wholly piercing hit therefore leaves zero recoverable ordinary damage rather than preserving an older large wound
- Record expires after 5 seconds. It cannot revive a defeated page
- Empty checks emit no activation and generate no income. A successful restoration dispatch uses normal notification rules, including nearby advertising and Cart conversion
- Overload, lag and administrator-only damage do not create records. An actual retarget/Cart UI attack remains eligible by its real source UI, even if its visual event has an administrator-style label
- The main sweep conservatively disables restoration at45 seconds. A separate comparison allows genuine qualifying UI records after45; this avoids turning “overload cannot be recorded” into an unnecessary blanket disable rule. The latter is recommended for subsequent testing

The record is damage provenance, not stored healing currency. Duplicating controls cannot spend the same hit twice; a later smaller hit intentionally overwrites the larger record.

## What was compared

`node --import tsx scripts/version-restore-benchmark.ts`

The probe substitutes a real $5/CPU2 notice slot using the proposed280×112 geometry. Notice receives its actual nearby-document bonus where the layout permits it. Four defender compositions face rapid Links, mixed text bursts, Cart, truly fused Cart, six-PDF pressure and native fortress at HP440/1200 and CPU35, without administrators.

The sweep varies25/35/50%, caps8/12, cooldown3/5, piercing inclusion and zero-hit clearing. Additional cases vary activation phase, late-overload eligibility, and an ad-plus-converter composition. Both seats are executed, including the paired baselines: **5,520 ordered battles, zero seat mismatches**.

This preserves effect-comparison resource costs and footprint; it does not yet reproduce the proposed Google faction, tags or its acquisition route. In particular, a Google set can alter the first activation time. The $6 result is output-per-price sensitivity, not a paid shopping simulation or free extra budget.

## Findings

The high-coefficient3-second variants improve too broadly in this sample. With50%/cap12/5s, piercing excluded and zero-hit clearing,32 of48 primary contexts heal more than notice,15 heal less and one ties.24 of48 have better healing-per-price even charging$6 instead of notice's$5. No winner changes in that selected primary stratum; this is a defensive-output niche, not an instant hard-counter claim.

Across three held-out initial timer phases (144 paired contexts, genuine UI restoration allowed after45):

- Rapid Links: lower healing and lower remaining HP in all24 cases; mean remaining-HP change −2.09 percentage points
- Cart: higher healing in18/24 cases; some losing pages survive longer, one outcome changes
- Fused Cart: higher healing in18/24 cases; six losing cases survive longer, no outcome changes
- Heavy PDFs: higher healing in23/24 cases, but no outcome change; PDF pressure still defeats the native fortress in the tested conditions
- Mixed text and fortress cases vary, because later smaller hits or shields can replace/clear a valuable record

Concrete default-phase comparisons:

- Video checkout versus rapid Links:15.95% HP remains with restore versus18.48% with notice, both ending13.15s
- Cart versus fused Cart at1200HP: restore extends survival26.45→26.90s, but Cart still loses
- Native fortress versus heavy PDFs: restore heals18.9 versus14, yet still loses at13.75s

The ad/converter fixture has12 paired contexts. It never earns more income than ordinary notice; two contexts earn$1 less because an empty restoration check does not dispatch an event. Unit tests separately verify that a successful restore generates exactly its normal connected notification, and duplicate controls cannot copy either the record or that revenue trigger.

## Checks and remaining gate

`node --import tsx --test tests/balance-version-restore-prototype.test.mjs`

Focused tests cover actual-damage/piercing limits, zero-hit rules, single consumption, stale-record expiry, no revival, administrator/overload boundaries, real UI retarget eligibility, empty/successful economy triggers, duplicate controls, mirror fairness and frame partition. An unselected subclass instance matches the canonical battle event trace.

Before catalogue insertion: independent QA; actual Google-family/tag/geometry integration; clear native pending/overwritten/consumed feedback; exact price6 acquisition and opportunity cost; rerun the paired phase and economy cases with the real definition. Keep the365-test canonical checkpoint conceptually separate from these additional prototype-only tests. Passing this probe is not approval of a global combat-version change.


Independent QA found and reproduced one expiry-boundary mismatch: native feedback marked a record expired at100 ticks while the first probe allowed it through that exact tick. The comparator now rejects age≥100. Sixteen focused prototype/QA tests pass, including512 independently generated CDN/shield/limiter/piercing cases and the same-tick preparation boundary. The full5,520-match artifact was regenerated after the fix; its selected summary and zero seat-mismatch count are unchanged.
