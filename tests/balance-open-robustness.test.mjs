import test from "node:test";
import assert from "node:assert/strict";
import { adminResponseMatrix } from "../scripts/open-build-robustness.js";
import { DEFAULT_LIMITS } from "../scripts/open-build-search.js";

test("administrator response diagnostics enumerate both seats' full legal choice products", () => {
  const a = {
    id: "link",
    origin: "test",
    layout: [["ab_link", 16, 16, 96, 24]],
    admin: [],
  };
  const b = {
    id: "pdf",
    origin: "test",
    layout: [["gov_pdf", 16, 16, 184, 40]],
    admin: [],
  };
  const limits = { ...DEFAULT_LIMITS, adminSlots: 1 };
  const result = adminResponseMatrix(a, b, limits),
    reverse = adminResponseMatrix(b, a, limits);
  assert.equal(result.choices.length, 9);
  assert.equal(result.comparisons, 81);
  assert.equal(result.seatChecked, 9);
  assert.deepEqual(result.seatMismatches, []);
  for (let i = 0; i < 9; i++)
    for (let j = 0; j < 9; j++)
      assert.ok(Math.abs(result.margins[i][j] + reverse.margins[j][i]) < 1e-9);
  assert.deepEqual(result.bestA, reverse.bestB);
  assert.deepEqual(result.bestB, reverse.bestA);
});
