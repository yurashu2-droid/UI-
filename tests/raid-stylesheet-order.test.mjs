import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createStaticIngestService } from "../server/site-ingest/service.js";
import { reconstructStaticCode } from "../server/site-ingest/code.js";
import { verifyRaidBlueprint } from "../src/raid/blueprint.js";

const PAGE = "https://books.toscrape.com/";
const SHEET = PAGE + "static/oscar/css/styles.css";
const [recordedHtml, recordedCss] = await Promise.all(
  ["books.html", "books.css"].map((name) =>
    readFile(
      new URL(`../fixtures/raid/public-source/${name}`, import.meta.url),
      "utf8",
    ),
  ),
);
const originalLink =
  '<link rel="stylesheet" type="text/css" href="static/oscar/css/styles.css" />';
const override =
  "<style>.btn-primary{background-color:#123456;color:#abcdef}</style>";
const hash = (value) => createHash("sha256").update(value).digest("hex");

async function reconstructWithLinks(links) {
  assert.ok(
    recordedHtml.includes(originalLink),
    "the recorded source anchor must remain unchanged",
  );
  const html = recordedHtml.replace(originalLink, links);
  const calls = [];
  const service = createStaticIngestService({
    transport: async (url) => {
      calls.push(url);
      return new Response(url === SHEET ? recordedCss : html, {
        headers: { "content-type": url === SHEET ? "text/css" : "text/html" },
      });
    },
  });
  const result = await service.reconstruct(PAGE);
  assert.equal(result.ok, true, result.error);
  assert.deepEqual(
    calls,
    [PAGE, SHEET],
    "only the already reviewed source and one CSS asset are fetched",
  );
  assert.equal(result.value.analysis.sourceHash, hash(html));
  assert.deepEqual(result.value.analysis.css.stylesheetHashes, [
    hash(recordedCss),
  ]);
  assert.equal(result.value.fidelity, "code-approximation");
  assert.ok(result.value.components.every((part) => part.sourceRect === null));
  assert.equal((await verifyRaidBlueprint(result.value)).ok, true);
  return result.value;
}
function purchaseStyle(blueprint) {
  return blueprint.components
    .filter((part) => part.evidence === "purchase")
    .map((part) => ({
      background: part.appearance.background,
      color: part.appearance.primitives.find(
        (primitive) => primitive.kind === "text",
      ).color,
    }));
}

test("unchanged recorded Books inputs retain the same frozen appearance as legacy unpositioned CSS", async () => {
  const source = {
    requestedUrl: PAGE,
    html: recordedHtml,
    sourceHash: hash(recordedHtml),
    capturedAt: "2026-10-03T03:20:00.000Z",
    bytes: Buffer.byteLength(recordedHtml),
    extraction: { title: "Books", candidates: [] },
  };
  const sheet = { css: recordedCss, sourceHash: hash(recordedCss) };
  const legacy = await reconstructStaticCode({
    ...source,
    stylesheets: [sheet],
  });
  const positioned = await reconstructStaticCode({
    ...source,
    stylesheets: [{ ...sheet, url: SHEET }],
  });
  assert.deepEqual(positioned, legacy);
  assert.equal((await verifyRaidBlueprint(positioned)).ok, true);
});

// Exact recorded CSS, with only <style>/<link> order varied in the source HTML.
// This is a semantic cascade regression, not browser or source-pixel verification.
test("recorded Books CSS wins over an earlier equal-specificity embedded rule", async () => {
  const blueprint = await reconstructWithLinks(override + originalLink);
  assert.deepEqual(purchaseStyle(blueprint), [
    { background: "#428bca", color: "#ffffff" },
    { background: "#428bca", color: "#ffffff" },
  ]);
});

test("an embedded rule after recorded Books CSS wins only at equal specificity", async () => {
  const later = await reconstructWithLinks(originalLink + override);
  assert.deepEqual(purchaseStyle(later), [
    { background: "#123456", color: "#abcdef" },
    { background: "#123456", color: "#abcdef" },
  ]);
  const stronger = await reconstructWithLinks(
    "<style>.btn.btn-primary{background-color:#2468ac}</style>" +
      originalLink +
      override,
  );
  assert.deepEqual(purchaseStyle(stronger), [
    { background: "#2468ac", color: "#abcdef" },
    { background: "#2468ac", color: "#abcdef" },
  ]);
});

test("the last repeated eligible Books link has cascade order without duplicate fetch or CSS budget use", async () => {
  const blueprint = await reconstructWithLinks(
    originalLink + override + originalLink.repeat(8),
  );
  assert.deepEqual(purchaseStyle(blueprint), [
    { background: "#428bca", color: "#ffffff" },
    { background: "#428bca", color: "#ffffff" },
  ]);
  assert.equal(blueprint.analysis.css.limited, false);
});

test("inactive and unreviewed later links cannot move acquired Books CSS past an embedded rule", async () => {
  for (const attributes of [
    'disabled rel="stylesheet"',
    'rel="alternate stylesheet"',
    'rel="stylesheet" media="print"',
    'rel="stylesheet" media="screen and (min-width:1px)"',
    'rel="stylesheet" type="text/plain"',
  ]) {
    const inactive = `<link ${attributes} href="${SHEET}">`;
    const blueprint = await reconstructWithLinks(
      originalLink + override + inactive,
    );
    assert.deepEqual(
      purchaseStyle(blueprint),
      [
        { background: "#123456", color: "#abcdef" },
        { background: "#123456", color: "#abcdef" },
      ],
      attributes,
    );
  }
  const unreviewed =
    '<link rel="stylesheet" href="https://unreviewed.example/styles.css">';
  const blueprint = await reconstructWithLinks(
    originalLink + override + unreviewed,
  );
  assert.deepEqual(purchaseStyle(blueprint), [
    { background: "#123456", color: "#abcdef" },
    { background: "#123456", color: "#abcdef" },
  ]);
});
