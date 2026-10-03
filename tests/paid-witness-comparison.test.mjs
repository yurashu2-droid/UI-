import test from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  readFileSync,
  mkdtempSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  replayPaidRearrangedRoute,
  runPaidRearrangedCounterWitness,
} from "../scripts/paid-rearranged-counter-witness.js";

const fixtureUrl = new URL(
  "../fixtures/balance/paid-rearranged-comparison.json",
  import.meta.url,
);
const hash = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const modelUrl = new URL("../src/paid-witness-comparison.ts", import.meta.url);

test("generated browser fixture preserves both complete public replay endpoints and fixed evidence", async () => {
  assert.ok(
    existsSync(fixtureUrl),
    "A generated full-snapshot fixture is required",
  );
  const { exportPaidRearrangedComparison } =
    await import("../scripts/export-paid-rearranged-comparison.js");
  const fixture = JSON.parse(readFileSync(fixtureUrl, "utf8"));
  const replay = replayPaidRearrangedRoute();
  assert.deepEqual(fixture, exportPaidRearrangedComparison());
  assert.deepEqual(fixture.original, replay.acquiredRun);
  assert.deepEqual(fixture.rearranged, replay.finalRun);
  assert.equal(
    hash(fixture.original),
    "67038ae40eaa04b6c6500cd2032efb6e901cd153f0342c072173ae7e002e125f",
  );
  assert.equal(
    hash(fixture.rearranged),
    "4425ad75cf0aae3ba341f339109047e23302f5051355b1cbb2e2e9b9fe15529e",
  );
  assert.deepEqual(fixture.budget, replay.budget);
  const cli = spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/export-paid-rearranged-comparison.ts"],
    { cwd: new URL("..", import.meta.url), encoding: "utf8" },
  );
  assert.equal(cli.status, 0, cli.stderr);
  assert.equal(
    cli.stdout,
    readFileSync(fixtureUrl, "utf8"),
    "stdout is deterministic; importing generator never writes",
  );
});

test("browser model validates bundled evidence and exposes isolated complete boards", async () => {
  assert.ok(existsSync(modelUrl), "The bounded browser-safe model is required");
  const { preparePaidWitnessComparison, PAID_WITNESS_DEFAULT_SELECTION } =
    await import(modelUrl);
  const model = await preparePaidWitnessComparison();
  const before = model.inspect(PAID_WITNESS_DEFAULT_SELECTION);
  assert.equal(before.original.owned.length, 14);
  assert.equal(before.rearranged.owned.length, 14);
  assert.equal(before.inventory.length, 14);
  assert.deepEqual(before.conditions.initialHp, [440, 550]);
  assert.deepEqual(before.conditions.capacity, [31, 35]);
  assert.deepEqual(before.conditions.load, [23, 28]);
  assert.deepEqual(before.conditions.admins, [
    ["backup"],
    ["server", "backup"],
  ]);
  const expected = structuredClone(before);
  before.original.owned[0].x = 900;
  before.rearranged.cash = 999;
  before.foe.board.length = 0;
  before.conditions.admins[0].push("server");
  assert.deepEqual(model.inspect(PAID_WITNESS_DEFAULT_SELECTION), expected);
});

function manualScheduler() {
  const tasks = [];
  let cancellations = 0;
  return {
    schedule(resume) {
      const task = { resume, pending: true };
      tasks.push(task);
      return () => {
        task.pending = false;
        cancellations++;
      };
    },
    get pending() {
      return tasks.filter((t) => t.pending).length;
    },
    get scheduled() {
      return tasks.length;
    },
    get cancellations() {
      return cancellations;
    },
    async next() {
      const task = tasks.find((t) => t.pending);
      assert.ok(task, "expected a host task");
      task.pending = false;
      task.resume();
      await Promise.resolve();
    },
    async drain() {
      while (this.pending) await this.next();
    },
    async replayCancelled() {
      for (const t of tasks) t.resume();
      await Promise.resolve();
    },
  };
}

test("four actual comparisons yield before construction and within every bounded tick chunk", async () => {
  const { default: E } = await import("../src/engine.js");
  const { preparePaidWitnessComparison, PAID_WITNESS_DEFAULT_SELECTION } =
    await import(modelUrl);
  const model = await preparePaidWitnessComparison(),
    clock = manualScheduler(),
    progress = [];
  const RealBattle = E.Battle;
  let constructions = 0,
    steps = 0,
    turnSteps = 0;
  E.Battle = class extends RealBattle {
    constructor(...args) {
      super(...args);
      constructions++;
    }
    step(dt) {
      assert.equal(dt, 0.05);
      steps++;
      turnSteps++;
      return super.step(dt);
    }
  };
  try {
    const selection = { ...PAID_WITNESS_DEFAULT_SELECTION };
    const operation = model.compare(selection, {
      schedule: clock.schedule,
      onProgress: (p) => progress.push(p),
    });
    assert.deepEqual(progress, [{ completed: 0, total: 4 }]);
    assert.equal(constructions, 0, "even construction waits for a host task");
    assert.equal(steps, 0);
    assert.equal(clock.pending, 1);
    selection.commonBaseHp = 460;
    while (clock.pending) {
      turnSteps = 0;
      await clock.next();
      assert.ok(turnSteps <= 100, `${turnSteps} ticks in one host task`);
    }
    const result = await operation;
    assert.equal(constructions, 4);
    assert.ok(steps > 400);
    assert.equal(result.selection.commonBaseHp, 440);
    assert.deepEqual(
      result.rows.map((r) => [r.layout, r.paidSeat]),
      [
        ["original", "player"],
        ["original", "enemy"],
        ["rearranged", "player"],
        ["rearranged", "enemy"],
      ],
    );
    assert.deepEqual(
      result.rows.map((r) => r.winner),
      ["foe", "foe", "own", "own"],
    );
    assert.deepEqual(
      progress,
      [0, 1, 2, 3, 4].map((completed) => ({ completed, total: 4 })),
    );
    assert.ok(clock.scheduled > 4);
    assert.deepEqual(result.rows[0].initialHp, [440, 550]);
  } finally {
    E.Battle = RealBattle;
  }
});

test("aborting before work or during a case rejects without fabricated draws, and retry starts fresh", async () => {
  const {
    preparePaidWitnessComparison,
    PAID_WITNESS_DEFAULT_SELECTION: selection,
  } = await import(modelUrl);
  const model = await preparePaidWitnessComparison();
  for (const partial of [false, true]) {
    const clock = manualScheduler(),
      controller = new AbortController(),
      progress = [];
    const operation = model.compare(selection, {
      signal: controller.signal,
      schedule: clock.schedule,
      onProgress: (p) => progress.push(p),
    });
    const rejected = assert.rejects(operation, { name: "AbortError" });
    if (partial) await clock.next();
    controller.abort();
    await rejected;
    assert.equal(clock.pending, 0);
    assert.equal(clock.cancellations, 1);
    const saved = structuredClone(progress);
    await clock.replayCancelled();
    assert.deepEqual(progress, saved);
    assert.ok(progress.at(-1).completed < 4);
  }
  const clock = manualScheduler();
  const operation = model.compare(selection, { schedule: clock.schedule });
  await clock.drain();
  assert.deepEqual(
    (await operation).rows.map((r) => r.winner),
    ["foe", "foe", "own", "own"],
  );
});

test("invalid selections fail closed for inspect and compare with no queued work", async () => {
  const { preparePaidWitnessComparison, PAID_WITNESS_DEFAULT_SELECTION: good } =
    await import(modelUrl);
  const model = await preparePaidWitnessComparison();
  for (const input of [
    null,
    {},
    { ...good, foeId: "R8" },
    { ...good, commonBaseHp: 441 },
    { ...good, commonBaseHp: "440" },
    { ...good, phaseSeconds: NaN },
    { ...good, phaseSeconds: -1 },
    { ...good, playerCapacity: Infinity },
  ]) {
    assert.throws(() => model.inspect(input), /固定条件/);
    const clock = manualScheduler();
    await assert.rejects(
      model.compare(input, { schedule: clock.schedule }),
      /固定条件/,
    );
    assert.equal(clock.pending, 0);
  }
});

test("scheduler failures, callback cancellation and unfinished cases never publish completed results", async () => {
  const { default: E } = await import("../src/engine.js");
  const {
    preparePaidWitnessComparison,
    PAID_WITNESS_DEFAULT_SELECTION: selection,
  } = await import(modelUrl);
  const model = await preparePaidWitnessComparison();
  await assert.rejects(
    model.compare(selection, {
      schedule() {
        throw new Error("scheduler failed");
      },
    }),
    /scheduler failed/,
  );
  const controller = new AbortController();
  await assert.rejects(
    model.compare(selection, {
      signal: controller.signal,
      onProgress() {
        controller.abort();
      },
    }),
    { name: "AbortError" },
  );
  const RealBattle = E.Battle;
  let steps = 0;
  E.Battle = class extends RealBattle {
    step(dt) {
      steps++;
      super.step(dt);
      this.result = null;
    }
  };
  try {
    const clock = manualScheduler(),
      progress = [];
    const operation = model.compare(selection, {
      schedule: clock.schedule,
      onProgress: (p) => progress.push(p),
    });
    const rejected = assert.rejects(operation, /2400|120秒/);
    await clock.drain();
    await rejected;
    assert.equal(steps, 2400);
    assert.deepEqual(progress, [{ completed: 0, total: 4 }]);
  } finally {
    E.Battle = RealBattle;
  }
});

// JSON module instances differ across the TS and native JSON loaders. Materialize an
// isolated module at its import boundary, never add test-only input APIs to production.
async function withArtifactModel(
  changeFixture,
  changeFoes,
  changeCatalog,
  check,
) {
  const fixture = JSON.parse(readFileSync(fixtureUrl, "utf8"));
  const foes = JSON.parse(
    readFileSync(
      new URL(
        "../fixtures/balance/paid-counter-opponents.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  changeFixture?.(fixture);
  changeFoes?.(foes);
  let source = readFileSync(modelUrl, "utf8");
  assert.ok(
    source.includes(
      'import bundled from "../fixtures/balance/paid-rearranged-comparison.json";',
    ),
  );
  assert.ok(
    source.includes(
      'import opponentFixture from "../fixtures/balance/paid-counter-opponents.json";',
    ),
  );
  source = source
    .replace(
      'import bundled from "../fixtures/balance/paid-rearranged-comparison.json";',
      `const bundled = ${JSON.stringify(fixture)};`,
    )
    .replace(
      'import opponentFixture from "../fixtures/balance/paid-counter-opponents.json";',
      `const opponentFixture = ${JSON.stringify(foes)};`,
    )
    .replace(
      /from "(\.[^"]+)"/g,
      (_, specifier) => `from "${new URL(specifier, modelUrl).href}"`,
    );
  if (changeCatalog)
    source = source.replace(
      "arenaCatalogDefinition()",
      "({...arenaCatalogDefinition(), width: 961})",
    );
  const directory = mkdtempSync(join(tmpdir(), "ui-raid-paid-model-"));
  const file = join(directory, "model.ts");
  writeFileSync(file, source);
  try {
    await check(await import(pathToFileURL(file).href));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("changed full snapshots, metadata options, ledger and evidence hashes fail closed", async () => {
  const changes = [
    (f) => {
      f.original.owned[0].x += 1;
    },
    (f) => {
      f.rearranged.owned[0].id = "p90";
    },
    (f) => {
      f.rearranged.cash += 1;
    },
    (f) => {
      f.original.admin.push("server");
    },
    (f) => {
      f.rearranged.capacity = 32;
    },
    (f) => {
      f.original.history.pop();
    },
    (f) => {
      f.budget.parts = 50;
    },
    (f) => {
      f.options.phaseSeconds[0] = -0.4;
    },
    (f) => {
      f.options.commonBaseHp[1] = 441;
    },
    (f) => {
      f.pins.original = "0".repeat(64);
    },
    (f) => {
      f.pins.sequence = "1".repeat(64);
    },
    (f) => {
      f.unrecognized = true;
    },
  ];
  for (const change of changes)
    await withArtifactModel(change, undefined, false, async (model) => {
      await assert.rejects(
        model.preparePaidWitnessComparison(),
        /比較を開始できません/,
      );
    });
  await withArtifactModel(undefined, undefined, false, async (model) => {
    await model.preparePaidWitnessComparison();
  });
});

test("changed opponent or current gameplay fingerprint cannot silently use another condition", async () => {
  await withArtifactModel(
    undefined,
    (f) => {
      f.opponents[0].capacity = 56;
    },
    false,
    async (model) => {
      await assert.rejects(
        model.preparePaidWitnessComparison(),
        /現在の戦闘定義/,
      );
    },
  );
  await withArtifactModel(undefined, undefined, true, async (model) => {
    await assert.rejects(
      model.preparePaidWitnessComparison(),
      /現在の戦闘定義/,
    );
  });
});

test("missing/rejected SHA-256 and abort during digest all prevent preparation", async () => {
  const { preparePaidWitnessComparison } = await import(modelUrl);
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto"),
    original = globalThis.crypto;
  try {
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: undefined,
    });
    await assert.rejects(preparePaidWitnessComparison(), /SHA-256/);
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: {
        subtle: {
          digest() {
            return Promise.reject(new Error("unavailable"));
          },
        },
      },
    });
    await assert.rejects(preparePaidWitnessComparison(), /SHA-256/);
    const resumes = [];
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: {
        subtle: {
          digest(...args) {
            return new Promise((resolve) =>
              resumes.push(() => resolve(original.subtle.digest(...args))),
            );
          },
        },
      },
    });
    const controller = new AbortController();
    const operation = preparePaidWitnessComparison({
      signal: controller.signal,
    });
    const rejected = assert.rejects(operation, { name: "AbortError" });
    assert.equal(resumes.length, 4);
    controller.abort();
    for (const resume of resumes) resume();
    await rejected;
  } finally {
    Object.defineProperty(globalThis, "crypto", descriptor);
  }
});

test("pre-abort, registration abort, final-progress abort and scheduler cleanup are complete", async () => {
  const {
    preparePaidWitnessComparison,
    PAID_WITNESS_DEFAULT_SELECTION: selection,
  } = await import(modelUrl);
  const model = await preparePaidWitnessComparison(),
    pre = new AbortController();
  pre.abort();
  await assert.rejects(preparePaidWitnessComparison({ signal: pre.signal }), {
    name: "AbortError",
  });
  await assert.rejects(model.compare(selection, { signal: pre.signal }), {
    name: "AbortError",
  });
  const during = new AbortController();
  let cancellations = 0;
  await assert.rejects(
    model.compare(selection, {
      signal: during.signal,
      schedule() {
        during.abort();
        return () => {
          cancellations++;
        };
      },
    }),
    { name: "AbortError" },
  );
  assert.equal(cancellations, 1);
  await assert.rejects(
    model.compare(selection, {
      schedule() {
        return undefined;
      },
    }),
    /待機処理/,
  );
  const final = new AbortController(),
    clock = manualScheduler();
  const operation = model.compare(selection, {
    signal: final.signal,
    schedule: clock.schedule,
    onProgress(p) {
      if (p.completed === 4) final.abort();
    },
  });
  const rejected = assert.rejects(operation, { name: "AbortError" });
  await clock.drain();
  await rejected;
  assert.equal(clock.pending, 0);
  const normal = new AbortController();
  let active = 0;
  const add = normal.signal.addEventListener.bind(normal.signal),
    remove = normal.signal.removeEventListener.bind(normal.signal);
  normal.signal.addEventListener = (...args) => {
    active++;
    return add(...args);
  };
  normal.signal.removeEventListener = (...args) => {
    active--;
    return remove(...args);
  };
  const cleanClock = manualScheduler(),
    cleanOperation = model.compare(selection, {
      signal: normal.signal,
      schedule: cleanClock.schedule,
    });
  assert.equal(active, 1);
  await cleanClock.drain();
  await cleanOperation;
  assert.equal(active, 0);
});

test("production scheduling yields to other host tasks and repeated comparisons are exact", async () => {
  const {
    preparePaidWitnessComparison,
    PAID_WITNESS_DEFAULT_SELECTION: selection,
  } = await import(modelUrl);
  const model = await preparePaidWitnessComparison();
  let hostTurn = false;
  const operation = model.compare(selection, {
    onProgress(p) {
      if (p.completed > 0) assert.equal(hostTurn, true);
    },
  });
  await new Promise((resolve) =>
    setTimeout(() => {
      hostTurn = true;
      resolve();
    }, 0),
  );
  const result = await operation;
  const expected = structuredClone(result);
  result.rows[0].admins[0].push("server");
  result.rows[0].initialHp[0] = 999;
  assert.deepEqual(await model.compare(selection), expected);
});
