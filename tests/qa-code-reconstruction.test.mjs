import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { IDBFactory } from "fake-indexeddb";
import { analyzeStaticCode, reconstructStaticCode } from "../server/site-ingest/code.js";
import { prepareRaidChallenge } from "../src/raid-challenge.js";
import { verifyRaidBlueprint, prepareRaidRewards } from "../src/raid/index.js";
import { createProfileStore } from "../src/profile-store.js";
import R from "../src/run.js";

const html = '<!doctype html><title>QA source catalog</title><style>h1{color:#234567}.buy{background-color:#286e4a;color:white}</style><nav><a href="/books">Books</a></nav><main><h1>Original catalog title</h1><article><h3><a title="Actual source book">Book</a></h3><button class="buy">Add to basket</button></article></main>';
const source = (text=html) => ({requestedUrl:"https://books.toscrape.com/",html:text,
  sourceHash:createHash("sha256").update(text).digest("hex"),bytes:Buffer.byteLength(text),
  capturedAt:"2026-10-02T00:00:00.000Z",extraction:{title:"QA source catalog",candidates:[]}});

test("QA: code mapper cannot label a visible product with a hidden link's title", () => {
  const parsed=analyzeStaticCode('<h1>Catalog</h1><article><h3><a style="display:none" title="HIDDEN-NAME">Hidden</a>Visible book</h3><button>Add to basket</button></article>');
  const product=parsed.candidates.find(c=>c.kind==="product");
  assert.ok(product);
  assert.equal(product.label,"Visible book");
  assert.doesNotMatch(JSON.stringify(parsed),/HIDDEN-NAME|Hidden/);
});

test("QA: hidden ancestor purchase controls cannot classify a visible article as a product", () => {
  const parsed=analyzeStaticCode('<h1>Catalog</h1><article><h3>Visible essay</h3><div hidden><button>Add to basket</button></div></article>');
  assert.ok(!parsed.candidates.some(c=>c.kind==="product"||c.kind==="purchase"));
  assert.ok(parsed.candidates.some(c=>c.label==="Visible essay"));
});

test("QA: code reconstruction verifies the source hash against the actual supplied HTML", async () => {
  const tampered=source();tampered.sourceHash="a".repeat(64);
  await assert.rejects(()=>reconstructStaticCode(tampered),/hash|一致|source/i);
});

test("QA: approximate source flows through actual combat, durable victory and exact approximate trophy", async () => {
  const fetched=source(), blueprint=await reconstructStaticCode(fetched);
  assert.equal((await verifyRaidBlueprint(blueprint)).ok,true);
  assert.equal(blueprint.fidelity,"code-approximation");
  assert.equal(blueprint.analysis.sourceHash,fetched.sourceHash);
  assert.ok(blueprint.components.every(c=>c.sourceRect===null));
  assert.match(blueprint.warnings.join(" "),/近似/);
  const run=R.newRun("lab"),before=structuredClone(run);
  const prepared=prepareRaidChallenge(run,blueprint);
  while(!prepared.battle.result)prepared.battle.step(.05);
  assert.equal(prepared.battle.result.winner,"player","real populated lab build must beat this small QA source");
  assert.deepEqual(run,before,"the URL challenge cannot spend or mutate the current campaign/lab run");
  const component=blueprint.components.find(c=>c.evidence==="product");
  assert.ok(component);
  const reward=prepareRaidRewards(blueprint,prepared.battleId).find(r=>r.componentId===component.componentId);
  const factory=new IDBFactory(),store=createProfileStore(factory);
  await store.recordRaidVictory(blueprint,prepared.battleId);
  const reloaded=createProfileStore(factory);
  assert.equal((await reloaded.listPendingRaids())[0].battleId,prepared.battleId);
  const claim=await reloaded.claimRaidReward(run,reward,blueprint);
  assert.equal(claim.created,true);
  assert.equal(claim.trophy.item.appearanceId,component.appearanceId);
  assert.equal(claim.trophy.item.provenanceId,blueprint.captureId);
  assert.deepEqual(await reloaded.getBlueprint(blueprint.captureId),blueprint);
  assert.deepEqual(await reloaded.listPendingRaids(),[]);
  assert.equal((await reloaded.claimRaidReward(run,reward,blueprint)).created,false);
});
