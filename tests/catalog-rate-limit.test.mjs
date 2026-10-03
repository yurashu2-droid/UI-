import test from "node:test";
import assert from "node:assert/strict";
import D from "../src/data.js";
import C from "../src/document.js";
import V from "../src/components.js";
import { combatFeedback } from "../src/catalog/combat-feedback.js";

test("HTTP429 is an explicit experimental priced anti-small-packet part", () => {
  const part = D.PARTS.gov_rate_limit;
  assert.ok(part, "HTTP429 is in the canonical catalogue");
  assert.equal(part.status, "experimental");
  assert.deepEqual([part.value, part.price, part.load, part.cd], [4, 7, 3, 0]);
  assert.match(part.desc, /貫通/);
  assert.match(part.desc, /重複/);
  assert.match(part.desc, /24/);
  const html = V.markup(C.makeItem(part.id, "rate", 0, 0));
  assert.match(html, /429/);
  assert.match(html, /rate-budget/);
  assert.match(html, /rate-total/);
  assert.doesNotMatch(html, /<iframe|<script|http-equiv|location=/i);
});

test("rate-limit feedback displays the shared bucket without floating-point noise", () => {
  const view = combatFeedback("gov_rate_limit", 0, 20, undefined, "", 0, { budget: 19.200000000000003, limited: 4.800000000000001 });
  assert.equal(view.rateBudgetText, "19.2");
  assert.equal(view.rateTotalText, "4.8");
});
