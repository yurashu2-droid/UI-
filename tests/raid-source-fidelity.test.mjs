import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { analyzeStaticCode } from "../server/site-ingest/code.js";
import { createStaticIngestService } from "../server/site-ingest/service.js";
import {
  verifyRaidBlueprint,
  prepareRaidRewards,
  createRaidLootItem,
} from "../src/raid/index.js";

const PAGE = "https://books.toscrape.com/";
const SHEET = PAGE + "static/oscar/css/styles.css";
const fixture = (name) =>
  readFile(
    new URL(`../fixtures/raid/public-source/${name}`, import.meta.url),
    "utf8",
  );
const hash = (text) => createHash("sha256").update(text).digest("hex");
const labels = (part) =>
  part.appearance.primitives.filter((p) => p.kind === "text");

// Offline source snapshots: no public network requests and no renderer/pixel claims.
test("recorded Books source keeps actual price and availability within the exact product reward", async () => {
  const [html, css] = await Promise.all([
    fixture("books.html"),
    fixture("books.css"),
  ]);
  assert.equal(
    hash(html),
    "9fdd63da34161ebd13408d7a85105f83ec3c9f351c5d77cd0aa578790e121c1e",
  );
  assert.equal(
    hash(css),
    "d497d4a0d52686ccd30f5941b02867075870372cdfe37adbcb0be74fdeed94cf",
  );
  const calls = [];
  const service = createStaticIngestService({
    transport: async (url) => {
      calls.push(url);
      return new Response(url === SHEET ? css : html, {
        headers: { "content-type": url === SHEET ? "text/css" : "text/html" },
      });
    },
  });
  const result = await service.reconstruct(PAGE);
  assert.equal(result.ok, true, result.error);
  assert.deepEqual(calls, [PAGE, SHEET]);
  const blueprint = result.value;
  const products = blueprint.components.filter((c) => c.evidence === "product");
  assert.equal(products.length, 2);
  for (const [index, title, price] of [
    [0, "A Light in the Attic", "£51.77"],
    [1, "Tipping the Velvet", "£53.74"],
  ]) {
    const part = products[index];
    const texts = labels(part);
    assert.ok(texts.some((p) => p.text === title));
    assert.ok(
      texts.some((p) => p.text === price),
      "visible source price must survive reconstruction",
    );
    assert.ok(texts.some((p) => p.text === "In stock"));
    assert.equal(texts.find((p) => p.text === price).color, "#5cb85c");
    assert.equal(texts.find((p) => p.text === "In stock").color, "#5cb85c");
    for (let i = 0; i < texts.length; i++)
      for (let j = i + 1; j < texts.length; j++) {
        const a = texts[i].rect,
          b = texts[j].rect;
        assert.ok(
          a.y + a.h <= b.y || b.y + b.h <= a.y,
          "product text rows must not overlap",
        );
      }
    assert.equal(part.sourceRect, null);
    const reward = prepareRaidRewards(blueprint, "recorded-books-win").find(
      (r) => r.componentId === part.componentId,
    );
    const item = createRaidLootItem(reward, "p1");
    assert.equal(item.appearanceId, part.appearanceId);
    assert.equal(item.provenanceId, blueprint.captureId);
  }
  assert.equal(
    blueprint.components.length,
    8,
    "content detail must not add combat components",
  );
  assert.equal(blueprint.analysis.sourceHash, hash(html));
  assert.deepEqual(blueprint.analysis.css.stylesheetHashes, [hash(css)]);
  assert.equal(blueprint.fidelity, "code-approximation");
  assert.match(blueprint.warnings.join(" "), /近似/);
  assert.equal((await verifyRaidBlueprint(blueprint)).ok, true);
});

test("product metadata excludes hidden content, form values and unrelated article text", () => {
  const a =
    analyzeStaticCode(`<style>.secret {display:none}.price_color{color:#123456}</style><article class="product_pod"><h3>Visible book</h3>
    <div hidden><p class="price_color">SECRET PRICE</p></div><p class="price_color"><span hidden>SECRET TEXT</span>£19.95<input value="SECRET VALUE"></p>
    <p class="availability">In stock <span class="secret">SECRET STOCK</span></p><p>Unrelated article text</p><button>Add to basket</button></article>`);
  const product = a.candidates.find((c) => c.kind === "product");
  assert.deepEqual(
    product.details?.map((d) => [d.kind, d.label]),
    [
      ["price", "£19.95"],
      ["availability", "In stock"],
    ],
  );
  assert.equal(product.details[0].style.color, "#123456");
  assert.doesNotMatch(JSON.stringify(product), /SECRET|Unrelated article/);
});

test("recorded current Example source fails explicitly instead of inventing a script-generated control", async () => {
  const html = await fixture("example.html");
  assert.equal(
    hash(html),
    "25ddf2c883e0d1958ea971d279a7e4f0fd446724ee3db7db19dadabd4a62e484",
  );
  const calls = [];
  const service = createStaticIngestService({
    transport: async (url) => {
      calls.push(url);
      return new Response(html, {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    },
  });
  const result = await service.reconstruct("https://example.com/");
  assert.equal(result.ok, false);
  assert.equal(result.code, "no-playable-elements");
  assert.deepEqual(calls, ["https://example.com/"]);
});
