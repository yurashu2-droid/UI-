import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Source-level sRGB contrast only. This cannot certify browser wrapping, pixels,
// minimum usable font size, zoom, keyboard use or screen-reader acceptance.
// Before the correction, the instructions ranged from 2.33 to 4.63:1;
// callout prose was 2.73, reading prose 2.84 and index instructions 2.44:1.
const source = readFileSync(
  new URL("../src/catalog/notebook.css", import.meta.url),
  "utf8",
);
const blocks = new Map(
  [...source.matchAll(/([^{}]+)\{([^{}]+)\}/g)].map((match) => [
    match[1].trim(),
    match[2],
  ]),
);
function color(selector, property = "color") {
  const value = blocks
    .get(selector)
    ?.match(new RegExp(`(?:^|;)\\s*${property}:\\s*(#[a-f0-9]{6})`, "i"))?.[1];
  assert.ok(value, `expected explicit ${property} for ${selector}`);
  return value;
}
function luminance(hex) {
  const channels = hex.slice(1).match(/../g).map((value) => {
    const channel = parseInt(value, 16) / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
function contrast(foreground, background) {
  const [light, dark] = [luminance(foreground), luminance(background)].sort(
    (a, b) => b - a,
  );
  return (light + 0.05) / (dark + 0.05);
}

test("QA: notebook lesson and capability text meets 4.5:1 on declared backgrounds", () => {
  const paper = color(".site-theme-notebook .page-body", "background");
  const callout = color(".notebook-callout", "background");
  const rail = blocks
    .get(".site-theme-notebook .page-body::before")
    ?.match(/linear-gradient\(to right,\s*(#[a-f0-9]{6})/i)?.[1];
  assert.ok(rail, "read the actual rail background from production CSS");
  const cases = [
    [rail, [
      ".notebook-rail-note", ".notebook-rail-note b",
      ".notebook-shelf-caption h3", ".notebook-shelf-caption p",
      ".notebook-shelf-caption small", ".notebook-shelf-note",
      ".notebook-local-note",
    ]],
    [callout, [".notebook-callout b", ".notebook-callout p"]],
    [paper, [
      ".notebook-reading-note", ".notebook-reading-note h3",
      ".notebook-reading-note b", ".notebook-reading-note small",
      ".notebook-index", ".notebook-index h2", ".notebook-index h2 small",
      ".notebook-index li.notebook-index-active", ".notebook-index h3",
      ".notebook-index > small", ".notebook-comparison",
      ".notebook-comparison h2", ".notebook-comparison b",
    ]],
  ];
  const failures = [];
  for (const [background, selectors] of cases) for (const selector of selectors) {
    const foreground = color(selector), ratio = contrast(foreground, background);
    if (ratio < 4.5)
      failures.push(`${selector}: ${foreground} on ${background} = ${ratio.toFixed(3)}:1`);
  }
  assert.deepEqual(failures, [], failures.join("\n"));
});
