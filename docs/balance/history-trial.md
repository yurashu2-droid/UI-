# Experimental go_history integration

Status: actual catalogue/runtime trial, **still excluded from normal campaign and online acquisition pools**. This follows the quarantined notice-slot investigation recorded in `version-history-prototype.md`; the surrogate5,520-match artifact is preserved separately.

## Implemented contract

`go_history` is Google-family, kind `restore`, $6 / CPU2, base cooldown5 seconds, cap12, footprint280×112. Its real family/tags participate in ordinary analysis. With at least three Google parts its initial clock uses the existing0.75 factor; later periods still use the actual analyzed speed and server lag.

The page shares one latest enemy-UI revision. Restoration returns50% of that hit's actual **nonpiercing** HP loss, up to12, then consumes the record. A later hit overwrites it. Zero HP loss or wholly piercing loss clears it. Expiry is half-open at100 ticks. It cannot revive; lag, overload and administrator-only damage never create a record. Ordinary qualifying enemy UI damage remains eligible after45 seconds. Real Cart and retargeting UI attacks retain their provenance.

Empty timer checks produce no fire/heal/income. A successful restoration emits the ordinary fire/heal and notification chain, including legitimately connected advertising. A due attempt on a revision already fully healed discards it without creating an activation. Two controls cannot consume the same record.

`battle.historyView(side)` provides engine-computed source, eligible loss, current recoverable amount, record/expiry ticks and consumption state. Native feedback must display that projection rather than recompute damage. `history` events identify record/clear/restore/expire; ordinary heal events remain the primary visible restoration effect.

## Actual-definition comparison

Run `node --import tsx scripts/history-trial-benchmark.ts`.

This is a new benchmark using the real Google part, not a surrogate. Four defender compositions face six opponent categories at HP440/1200, CPU35 and three clock-delay conditions. Separate ad/converter cases check the real notification chain. The common defense allowance is$6: history spends$6/CPU2; notice and wishlist spend$5/CPU2 and retain$1. No imaginary compensation is added. All variants use legal280×112 geometry; notice gains its actual document-adjacency bonus where available.

Current result:936 ordered comparisons, zero reversed-seat mismatches. Relative to notice, across24 contexts per opponent:

- Rapid Links: history heals less and retains less HP in all24
- Mixed text: higher healing/remaining HP in16, lower in8
- Cart: higher healing in17; remaining HP improves in12 and falls in5
- Fused Cart: higher healing in21, with remaining HP improving in3 and no reductions among surviving outcomes
- Heavy documents: higher healing in20; remaining HP improves in9 and falls in3
- Native fortress: mixed results, with higher healing in16 and remaining HP improving in7/falling in8

No winner changes in these selected real-definition contexts. That does not erase the benefit of a surviving HP margin or a longer losing battle, and it does not establish a mandatory counter. In the12 ad/converter comparisons, one real-family phase produces$1 more income, four produce$1 less, and the others tie. There is no empty-poll income; the difference comes from actual successful dispatch timing. This is why the surrogate's economy result was not treated as final Google-family evidence.

## Paid opportunity experiment

The same command runs150 fixed-seed campaign paths:50 each for history, notice and wishlist. These are **hypothetical offer trials**. An explicitly labelled harness replacement substitutes one real shop opportunity after the candidate's price tier unlocks; every purchase, server plan, reroll, fight, settlement and reward uses the real transactions. This is not evidence that experimental history currently appears in the live shop.

- History: actual$6 purchase tier starts at round3;141 wins and15/50 round-eight reaches
- Notice: actual$5 price tier starts at round2;133 wins and16/50 round-eight reaches
- Wishlist: actual$5 tier starts at round2;131 wins and15/50 round-eight reaches
- All ledgers reconcile and there are no blocked paths. Later purchases and rewards legitimately diverge; these are bounded heuristics, not optimized players

The$1 premium, later price tier and foregone shop slot are real opportunity costs in the trial. The experiment does not prove natural offer frequency or authorize promotion into campaign/online pools.

## Verification gate

Focused tests: `node --import tsx --test tests/balance-history-*.test.mjs`.

Keep old combat-v2 and combat-v3 golden fixtures unchanged. Existing boards without history must reproduce their old traces. The catalogue fingerprint changes because the experimental definition now exists; no unrelated canonical combat constant is retuned. Independent integration QA covers real Google timing, record conservation/overwrite/expiry, paid cost, actual event-to-feedback projection, both seats and no-history isolation before the trial is called ready.

## Independent integration gate

Independent QA reproduced the936 actual-definition comparisons exactly and inspected all468 paired reverse results. Across the144 main contexts, history healed more than notice in90, less in53 and tied once; rapid Links remain worse in24/24, and no winner changes. Six independent runtime cases cover the real family, record lifecycle, paid cost, feedback projection and canonical isolation.

A held-out hypothetical-offer cohort (seeds201–220,60 paths) produced history63 wins/6 round-eight reaches, notice51/6 and wishlist49/5. Each trial charges the real price;15 additional inspected paths reconstruct inventory, rewards, admins and spending without free item grants. The shop-offer replacement remains explicitly hypothetical. These checks approve the technical experimental trial, not natural offer availability, normal-pool promotion or human enjoyment.
