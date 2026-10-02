import test from "node:test";
import assert from "node:assert/strict";
import { defaultWindowLayout } from "../src/window-layout.ts";

for (const [width, height] of [[720, 800], [1149, 742], [1440, 900], [1920, 1080]]) {
  test(`reset fits all windows without overlap at ${width}x${height}`, () => {
    const layout = defaultWindowLayout(width, height, 970);
    const rects = Object.values(layout);
    for (const r of rects) {
      assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= width && r.y + r.h <= height);
    }
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i], b = rects[j];
      assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
    }
    assert.ok(Math.abs((layout.page.w - 6) / (layout.page.h - 33) - 960 / 970) < 1e-9);
    assert.ok(layout.page.y >= 32, "the floating caption stays inside the desktop");
  });
}
