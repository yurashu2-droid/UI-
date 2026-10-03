import test from "node:test";
import assert from "node:assert/strict";
import C from "../src/document.js";
import V from "../src/components.js";

function withHost(run) {
  const before = globalThis.document;
  globalThis.document = {
    createElement() {
      const attrs = new Map();
      return {
        className: "", dataset: {}, innerHTML: "", tabIndex: -1,
        classList: { add() {} }, style: { setProperty() {} },
        setAttribute(key, value) { attrs.set(key, value); },
        getAttribute(key) { return attrs.get(key); },
      };
    },
  };
  try { return run(); } finally { globalThis.document = before; }
}

test("appearance hook runs after native controls and timing hooks are constructed", () => {
  assert.equal(typeof V.setAppearanceRenderer, "function");
  const part = { ...C.makeItem("yt_tip", "support", 0, 0), appearanceId: "app_local_verified" };
  let calls = 0;
  V.setAppearanceRenderer((host, item) => {
    calls++;
    assert.equal(item, part);
    assert.match(host.innerHTML, /native-support/);
    assert.match(host.innerHTML, /node-timing/);
    assert.equal(host.getAttribute("aria-label"), "応援ボタン");
    host.innerHTML += '<div class="verified-appearance"></div>';
  });
  try {
    const host = withHost(() => V.create(part));
    assert.equal(calls, 1);
    assert.match(host.innerHTML, /native-support/);
    assert.match(host.innerHTML, /verified-appearance/);
  } finally { V.setAppearanceRenderer(null); }
});

test("unregistered or missing appearance keeps the canonical native fallback", () => {
  assert.equal(typeof V.setAppearanceRenderer, "function");
  const part = C.makeItem("tw_post", "post", 0, 0);
  V.setAppearanceRenderer(null);
  const plain = withHost(() => V.create(part)).innerHTML;
  const missing = withHost(() => V.create({ ...part, appearanceId: "app_missing" })).innerHTML;
  assert.equal(missing, plain);
  V.setAppearanceRenderer(() => {}); // A verified-cache miss deliberately leaves the host unchanged.
  try { assert.equal(withHost(() => V.create({ ...part, appearanceId: "app_missing" })).innerHTML, plain); }
  finally { V.setAppearanceRenderer(null); }
});
