import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { build } from "vite";

// Inspect real production output without writing dist or opening a browser.
// A static story barrel can make the hub initial despite a call-site import().
test("QA: production initial graph excludes optional story workshop code and styles", async () => {
  const result = await build({ root: fileURLToPath(new URL("../", import.meta.url)), logLevel: "silent", build: { write: false } });
  assert.ok(!Array.isArray(result), "one client build is expected");
  const output = new Map(result.output.map(item => [item.fileName, item]));
  const entries = result.output.filter(item => item.type === "chunk" && item.isEntry);
  assert.ok(entries.length > 0);
  const initial = new Set();
  const walk = filename => {
    if (initial.has(filename)) return;
    const chunk = output.get(filename);
    assert.equal(chunk?.type, "chunk", `local initial dependency ${filename}`);
    initial.add(filename);
    chunk.imports.forEach(walk);
  };
  entries.forEach(entry => walk(entry.fileName));
  const initialChunks = [...initial].map(filename => output.get(filename));
  const initialModules = initialChunks.flatMap(chunk => Object.keys(chunk.modules));
  assert.ok(initialModules.some(id => id.endsWith("/src/story/session.ts")), "save and transaction behavior stays immediately available");
  assert.ok(!initialModules.some(id => id.endsWith("/src/story/hub.ts")), "story renderer must not be pulled back by a static barrel/preload");
  const panel = result.output.find(item => item.type === "chunk" && Object.keys(item.modules).some(id => id.endsWith("/src/story/hub.ts")));
  assert.ok(panel, "the real workshop renderer remains present in a deferred chunk");
  assert.ok(!initial.has(panel.fileName));
  assert.ok(result.output.some(item => item.type === "chunk" && item.dynamicImports.includes(panel.fileName)), "the optional panel remains reachable by dynamic import");
  const initialCss = new Set(initialChunks.flatMap(chunk => [...chunk.viteMetadata.importedCss]));
  const toText = asset => typeof asset.source === "string" ? asset.source : Buffer.from(asset.source).toString("utf8");
  for (const filename of initialCss) assert.doesNotMatch(toText(output.get(filename)), /\.story-hub(?:[\s.{,:>]|$)/, "workshop CSS must not be in initial styles");
  for (const [module, selector] of [["/src/story/panel.ts", /\.story-hub(?:[\s.{,:>]|$)/], ["/src/online/panel.ts", /\.arena-panel(?:[\s.{,:>]|$)/]]) {
    const entry = result.output.find(item => item.type === "chunk" && Object.keys(item.modules).some(id => id.endsWith(module)));
    assert.ok(entry, `deferred entry ${module}`);
    assert.ok(!initial.has(entry.fileName));
    assert.deepEqual([...entry.viteMetadata.importedCss], [], "retryable CSS must bypass Vite's failed side-effect preload cache");
    assert.ok(entry.exports.includes("loadStyles"), "panel exposes explicit stylesheet readiness");
    const optionalCss = [...entry.viteMetadata.importedAssets].filter(filename => filename.endsWith(".css"));
    assert.equal(optionalCss.length, 1, "one build-owned stylesheet URL per panel");
    assert.ok(selector.test(toText(output.get(optionalCss[0]))), "the URL asset contains the actual panel stylesheet");
    assert.ok(entry.code.includes(optionalCss[0].split("/").at(-1)), "the emitted module references its real stylesheet asset");
    assert.ok(optionalCss.every(filename => !initialCss.has(filename)));
  }
});
