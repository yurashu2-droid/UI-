import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import C from "../src/document.js";
const path = new URL("../src/online/layout.ts", import.meta.url);
test("online freeform layout moves atomically and rejects off-page/overlapping edits", async () => {
  assert.ok(existsSync(path), "online page layout adapter must exist");
  const { placeItem, placementPayload } = await import(path.href);
  const a = C.makeItem("ab_link", "p1", 32, 24),
    b = C.makeItem("ab_link", "p2", 400, 24);
  const board = [a, b];
  const next = placeItem(board, "p1", 32, 120);
  assert.equal(next[0].y, 120);
  assert.equal(board[0].y, 24);
  assert.equal(placeItem(board, "p1", -1, 24), null);
  assert.equal(placeItem(board, "p1", 400, 24), null);
  assert.deepEqual(Object.keys(placementPayload(board)[0]).sort(), [
    "h",
    "id",
    "w",
    "x",
    "y",
  ]);
});

test("online routing chooser only offers nearby combat consumers", async () => {
  const layout = await import(path.href);
  assert.equal(typeof layout.routeChoices, "function");
  const source = C.makeItem("am_coupon", "p1", 32, 24),
    cart = C.makeItem("am_cart", "p2", 32, source.h + 24),
    far = C.makeItem("am_cart", "p3", 600, 450),
    text = C.makeItem("ab_link", "p4", 32 + source.w, 24);
  const board = [source, cart, far, text];
  assert.deepEqual(
    layout.routeChoices(board, "p1").map((p) => p.id),
    ["p2"],
  );
});

test("online fusion choices hide experimental outputs while preserving approved recipes", async () => {
  const layout = await import(path.href);
  assert.equal(typeof layout.onlineFusionChoices, "function");
  const board = [
    C.makeItem("am_buy", "p1", 32, 32, 168, 44),
    C.makeItem("yt_sub", "p2", 200, 32, 184, 44),
    C.makeItem("go_search", "p3", 32, 200, 420, 44),
    C.makeItem("go_suggest", "p4", 32, 244, 420, 84),
  ];
  assert.deepEqual(
    layout.onlineFusionChoices(board).map((p) => p.recipe.into),
    ["go_instant"],
  );
});

test("online fusion choices expose competing recipes without pre-consuming the shared ingredient", async () => {
  const layout = await import(path.href);
  assert.equal(typeof layout.onlineFusionChoices, "function");
  const board = [
    C.makeItem("gov_check", "p1", 32, 32, 284, 44),
    C.makeItem("gov_submit", "p2", 316, 32, 216, 44),
    C.makeItem("go_voice", "p3", 32, 76, 100, 44),
  ];
  assert.deepEqual(
    new Set(layout.onlineFusionChoices(board).map((p) => p.recipe.into)),
    new Set(["gov_onestop", "go_recaptcha"]),
  );
});
