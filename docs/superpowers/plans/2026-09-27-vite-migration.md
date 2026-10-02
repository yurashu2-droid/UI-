# UI RAID project migration

**Goal:** Preserve the current game while moving development to Vite and TypeScript.
**Architecture:** Extract the existing nine closures into explicit ES modules. Keep existing JavaScript behavior intact; use strict TypeScript for the entry point and headless simulation tools, with incremental typing of legacy modules. Preserve the original HTML as a playable reference.
**Tech Stack:** Vite, TypeScript, Node test runner, tsx.
**Spec:** User request in this chat; existing UI_RAID_STUDIO.html is the behavior and visual reference.

## Constraints
- Preserve CSS order, markup, game data, balance, save keys and JSON format.
- No Electron, renaming of game content or unrelated refactoring in this migration.
- Keep browser play through the development server; document file-origin save export/import.
- Existing logic remains JavaScript initially; do not hide errors with ts-nocheck or claim full TypeScript conversion.
- No Git repository exists; preserve original files in place. Execute directly without approval per user instructions.

## Tasks
- [x] Extract data, document, engine, run, components, editor, effects, traffic and app into src modules; extract CSS without changes.
- [x] Add package/config files, strict TS entry point, typed simulation tool and README.
- [x] Verify original/new core parity, save round trips and battle settlement using Node tests.
- [x] Run typecheck and build, then verify editing, battle and reload in the browser.

## Review focus
Explicit imports (including delayed editor accesses); module execution order; CSS cascade; localStorage origin changes; battle determinism and save compatibility.

## Verification record
- `npm test`: 4 tests passed; includes all 20 preset/opponent combinations, exact event and settlement parity, campaign progression and legacy save/edit compatibility.
- `npm run build`: strict TS check and Vite production build passed. Output: dist/index.html and two bundled assets.
- `npm run simulate`: all 20 battles terminate and print results.
- Browser at 127.0.0.1:5178: purchase/placement, undo/redo, persisted reload, battle start, speed control; no console errors. Round 2 and loot were subsequently visible.
- Final independent review: no actionable migration defects. Explicit imports and persistence paths checked.
- Ruling: fixed the test clock before newRun, because initial shop generation uses Date.now; overwriting seed after creation was too late. No game behavior changed.
- Ruling: development port 5178 is fixed because 5173 was occupied. Existing unrelated server was not stopped.
- Original HTML and backup retained; JavaScript modules formatted for maintenance. Full game typing remains a documented separate stage.
