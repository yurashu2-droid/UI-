import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

// Exercise the app's actual dispatch logic without mounting the whole editor.
const app = readFileSync(new URL("../src/app.ts", import.meta.url), "utf8");
const sync = app.slice(app.indexOf("function syncEra()"), app.indexOf("function render()"));

test("entering the same era consumes the instant flag before the next server upgrade", () => {
  const waves = [];
  const ctx = vm.createContext({
    run: { capacity: 12, mode: "campaign" },
    R: { capacity: (run) => run.capacity },
    eraFor: (cap) => cap >= 17 ? "xp" : "98",
    ERAS: ["98", "xp", "aero", "flat", "art"],
    ERA_ACCENT: { xp: "#316ac5" },
    appliedEra: "98", eraInstant: true, upgrading: false, battle: null,
    fx: { reduced: false },
    setEraClass: (era) => { ctx.appliedEra = era; },
    scheduleFit() {},
    playOsUpgrade: (options) => {
      waves.push(options);
      options.swap();
      return { then() {} };
    },
  });
  vm.runInContext(sync, ctx);
  ctx.syncEra(); // switchMode after the title/continue screen
  assert.equal(waves.length, 0);
  ctx.run.capacity = 17; // first server contract: 98 → XP
  ctx.syncEra();
  assert.equal(waves.length, 1);
  assert.equal(waves[0].fromClass, "era-98");
  assert.equal(waves[0].reduced, false);
  assert.equal(ctx.appliedEra, "xp");
  ctx.syncEra();
  assert.equal(waves.length, 1, "rendering again must not replay the wave");
});
