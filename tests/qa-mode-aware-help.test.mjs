import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { transformSync } from "esbuild";
import { parseFragment } from "parse5";
import V from "../src/components.js";
import R from "../src/run.js";
import { getHelpContent, renderHelpBody } from "../src/help-content.js";

// Run the production help and modal entry points with a minimal dialog port.
// The real content helpers are used; this is source/HTML QA, not browser pixels.
const app = readFileSync(new URL("../src/app.ts", import.meta.url), "utf8");
const declarations = ["openModal", "closeModal", "modalHead", "help"].map(name => {
  const declaration = app.match(new RegExp(`^function ${name}\\([^]*?^}`, "m"));
  assert.ok(declaration, `production ${name} entry point exists`);
  return declaration[0];
}).join("\n");
const code = transformSync(declarations, { loader: "ts", target: "es2022" }).code;
const descendants = node => [node, ...(node.childNodes ?? []).flatMap(descendants)];
const text = node => node.nodeName === "#text" ? node.value : (node.childNodes ?? []).map(text).join("");
const attr = (node, name) => node.attrs?.find(attribute => attribute.name === name)?.value;

test("QA: actual help modal refreshes story, laboratory and legacy content on every opening", () => {
  let shown = 0;
  const dialog = {
    open: false,
    classList: { remove() {} },
    showModal() { this.open = true; shown++; },
    close() { this.open = false; },
  };
  const content = { innerHTML: "" };
  const context = {
    run: R.newRun("campaign"), storyActive: true,
    getHelpContent, renderHelpBody, esc: V.esc,
    modalFeatureDispose: undefined, pendingStorySettlement: null,
    $: selector => selector === "#modal" ? dialog : content,
  };
  vm.runInNewContext(code, context);

  // Reuse the same host and dialog, including an already-open replacement and
  // the story-first boundary where a stale underlying run still says "lab".
  const cases = [
    { storyActive: true, mode: "campaign" },
    { storyActive: false, mode: "lab" },
    { storyActive: false, mode: "campaign" },
    { storyActive: true, mode: "lab" },
    { storyActive: true, mode: "campaign" },
  ];
  for (const [index, current] of cases.entries()) {
    context.storyActive = current.storyActive;
    context.run.mode = current.mode;
    const before = structuredClone(context.run), expected = getHelpContent(current);
    const alreadyOpen = dialog.open, previousShows = shown;
    context.help();
    assert.equal(dialog.open, true);
    assert.equal(shown, previousShows + (alreadyOpen ? 0 : 1));
    const nodes = descendants(parseFragment(content.innerHTML));
    assert.deepEqual(nodes.filter(node => node.tagName === "h2").map(text), [expected.title],
      `mode-specific heading for ${JSON.stringify(current)}`);
    assert.deepEqual(nodes.filter(node => attr(node, "class") === "modal-kicker").map(text), [expected.kicker]);
    assert.ok(content.innerHTML.includes(renderHelpBody(expected)), "the selected model reaches the live modal body");
    const steps = nodes.find(node => attr(node, "class") === "howto");
    assert.ok(steps, "help keeps the styled numbered instruction container");
    assert.deepEqual(descendants(steps).filter(node => node.tagName === "strong").map(text),
      expected.steps.map(step => step.title), "no instructions survive from the preceding mode");
    assert.deepEqual(nodes.filter(node => node.tagName === "button" && attr(node, "data-close-modal") !== undefined).map(text),
      ["×", "わかった"], "both existing dismissal controls stay wired to the modal close action");
    assert.deepEqual(context.run, before, "opening help is read-only");
    if (index % 2 === 0) { context.closeModal(); assert.equal(dialog.open, false); }
  }
  const imports = app.match(/import\s*\{([^}]+)\}\s*from\s*["']\.\/help-content\.js["']/)?.[1] ?? "";
  assert.match(imports, /\bgetHelpContent\b/, "the application imports the actual selection helper");
  assert.match(imports, /\brenderHelpBody\b/, "the application imports the actual body renderer");
});
