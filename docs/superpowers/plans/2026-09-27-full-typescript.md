# Full TypeScript migration

**Goal:** Convert every game source module to checked TypeScript without changing game behavior.
**Spec:** User request "全部やって" following the incomplete incremental migration.
**Architecture:** Preserve module APIs and algorithms. Model game data, document geometry, battle state/events, run transactions, DOM elements, editor state and effects with real types. Use unknown plus validation at external JSON boundaries.

## Constraints
- strict:true, allowJs:false; no any, ts-nocheck, ts-ignore or blanket type assertions to suppress diagnostics.
- Preserve original HTML, CSS, game balance, save format/keys and existing behavior.
- Imports use .js specifiers resolved to TypeScript by the bundler/tsx.
- No Git repository: work in existing workspace, preserve source backup under .verification.
- Existing meaningful migration parity tests are sufficient; extend only to cover typing-related boundary changes.
- One final integrated review and targeted verification; no per-file review cycle.

## Tasks / ownership
- [x] Core: data.ts, document.ts, engine.ts, run.ts and shared domain types.ts. Export interfaces needed by UI. Preserve runtime shapes.
- [x] Drawing/editor: components.ts, editor.ts and their local types. Consume core types; no core file edits.
- [x] Effects/traffic: effects.ts, traffic.ts and their local types. Consume core types; no other edits.
- [x] Main: app.ts, DOM helper if needed, config/tests/scripts/docs integration.
- [x] Verify strict typecheck, absence of unchecked JS/escape hatches, 20 battle parity cases, save compatibility, build, simulation and browser editing/battle.

## Shared interfaces and review focus
- Core exports types for item, battle sides/events, run and transaction results; other owners coordinate rather than editing core.
- Component default API and Editor/Effects/Traffic default exports stay compatible.
- DOM selectors narrow to actual element classes, events narrow EventTarget.
- JSON parse is unknown before validation; dynamic maps retain meaningful value types.
- Check nullability, failed transactions, optional battle result, modal/file/audio APIs, accidental emitted class field changes.

## Progress
Plan checked: each task owns separate files; shared domain types are owned only by core. Existing core parity tests serve all tasks. User permits design execution without approval.

- Drawing/editor and effects/traffic owners reported zero owned-file strict diagnostics. Existing core parity plus new editor move/resize/join/duplicate parity checks passed.
- Main app converted; final diagnostics depend on core API typing being completed. Config now disallows JS and tests execute TS through tsx.
- Added a save guard test for malformed nested JSON; confirmed old validator accepts invalid history entries. Completing unknown-to-Run validation must close that gap while keeping omitted legacy tutorial fields valid.
- Test adjustment: compare JSON data after legacy editor transactions because constructors execute in a separate VM realm with different object prototypes.

## Final verification
- Full `npm run typecheck` passes with strict:true and allowJs:false. All nine game modules are .ts; no source .js remains. No explicit any, ts-ignore/nocheck or double-unknown assertions found in src/scripts.
- `npm test`: all 6 tests pass (20 complete battle event/settlement comparisons; campaign flow; legacy saves; editor transactions; malformed nested JSON rejection including array-as-winner).
- `npm run build`: passes, including full strict check. `npm run simulate`: all 20 battles finish with original results.
- Production browser smoke at isolated 127.0.0.1:4178: purchase, undo/redo, reload persistence, battle at 4x, victory, reward skip, round 2 and post-battle reload verified. No console errors. Screenshot: .verification/typescript-complete.png. Temporary preview server/tab stopped after verification; original development tab retained.
- Independent final review found no actionable behavior regressions or unsound escape hatches.
- Type-driven integration corrections: nullable rect overload retained original unplaced coordinates; numeric geometry explicitly preserves null coercion. Traffic.final has an explicit complete player/enemy record. JSON predicates check actual primitive types rather than string coercion.
