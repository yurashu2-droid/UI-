import test from "node:test";
import assert from "node:assert/strict";
import * as Candidates from "../src/balance-candidates.js";
import { BUILDS } from "../src/builds.js";
import {
  resources,
  board,
  measureMatch,
  fusedEntrant,
} from "../src/buildlab.js";
import E from "../src/engine.js";
const base = (id) => ({ ...BUILDS.find((b) => b.id === id), build: true });
test("native paperwork counter pays for legal filled tables and real font coverage", () => {
  assert.equal(typeof Candidates.nativeFortressCandidate, "function");
  const c = Candidates.nativeFortressCandidate(base("b_fort")),
    r = resources(c.layout),
    a = E.analyze(board(c.layout, "p"));
  assert.equal(r.legal, true);
  assert.equal(r.acquisitionValue, 74);
  assert.equal(r.load, 32);
  assert.deepEqual(r.experimental, []);
  for (const p of a.board.filter((p) =>
    ["gov_pdf", "gov_submit"].includes(p.type),
  ))
    assert.equal(a.mods[p.id].power, 1.5, p.id);
});
test("heavy document counter has six genuinely supported PDFs at its reported cost", () => {
  assert.equal(typeof Candidates.heavyDocumentCandidate, "function");
  const c = Candidates.heavyDocumentCandidate(base("b_echo")),
    r = resources(c.layout),
    a = E.analyze(board(c.layout, "p"));
  assert.equal(r.legal, true);
  assert.equal(r.acquisitionValue, 75);
  assert.equal(r.load, 27);
  assert.deepEqual(r.experimental, []);
  const pdfs = a.board.filter((p) => p.type === "gov_pdf");
  assert.equal(pdfs.length, 6);
  for (const p of pdfs)
    assert.ok(Math.abs(a.mods[p.id].power - 2.1) < 1e-9, p.id);
});
test("same-price native defense counters unfused Cart but gives that edge back to fusion", () => {
  const f = Candidates.nativeFortressCandidate(base("b_fort")),
    cart = base("b_cart"),
    h = Candidates.heavyDocumentCandidate(base("b_echo"));
  const neutral = { hp: 440, capacity: 35, adminSlots: 0 };
  assert.equal(measureMatch(f, cart, neutral).winner, "player");
  assert.equal(
    measureMatch(f, fusedEntrant(cart).entrant, neutral).winner,
    "enemy",
  );
  assert.equal(measureMatch(h, f, neutral).winner, "player");
});
