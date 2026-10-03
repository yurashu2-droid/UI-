import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CONDITIONS, entrants, roundRobin } from "../src/buildlab.ts";
import { roundRobinAsync } from "../src/buildlab-async.ts";

// Real combat throughout. The manual scheduler controls only when a host turn resumes.
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
      return tasks.filter((task) => task.pending).length;
    },
    get scheduled() {
      return tasks.length;
    },
    get cancellations() {
      return cancellations;
    },
    async next() {
      const task = tasks.find((task) => task.pending);
      assert.ok(task, "expected a scheduled host turn");
      task.pending = false;
      task.resume();
      await Promise.resolve();
    },
    async drain() {
      while (this.pending) await this.next();
    },
    async replayCancelled() {
      for (const task of tasks) task.resume();
      await Promise.resolve();
    },
  };
}

function smallList() {
  return entrants().slice(0, 3);
}
const abortError = { name: "AbortError" };

test("all 240 real matches retain exact synchronous matrix data and yield in bounded batches", async () => {
  const list = entrants();
  assert.equal(list.length, 16);
  const expected = roundRobin(list);
  const clock = manualScheduler();
  const progress = [];
  const operation = roundRobinAsync(list, {
    schedule: clock.schedule,
    onProgress: (value) => progress.push(value),
  });
  assert.deepEqual(progress, [{ completed: 0, total: 240 }]);
  assert.equal(clock.pending, 1, "first calculation must yield to the host");
  await clock.drain();
  const actual = await operation;
  assert.deepEqual(actual, expected);
  assert.equal(
    JSON.stringify(actual),
    JSON.stringify(expected),
    "includes full real match metrics",
  );
  assert.equal(actual.cells.flat().filter(Boolean).length, 240);
  assert.notEqual(actual.list, list);
  for (let i = 1; i < progress.length; i++) {
    assert.ok(progress[i].completed > progress[i - 1].completed);
    assert.ok(progress[i].completed - progress[i - 1].completed <= 4);
    assert.equal(progress[i].total, 240);
    assert.notEqual(progress[i], progress[i - 1]);
  }
  assert.deepEqual(progress.at(-1), { completed: 240, total: 240 });
  assert.ok(clock.scheduled >= 60);
  assert.equal(clock.pending, 0);
});

test("default scheduling gives other host tasks a turn during real matrix work", async () => {
  const progress = [];
  let hostTurn = false;
  const operation = roundRobinAsync(smallList(), {
    onProgress: (value) => progress.push({ ...value, hostTurn }),
  });
  const hostTask = new Promise((resolve) =>
    setTimeout(() => {
      hostTurn = true;
      resolve();
    }, 0),
  );
  await Promise.all([operation, hostTask]);
  assert.equal(progress[0].hostTurn, false);
  assert.equal(progress.at(-1).hostTurn, true);
  assert.equal(progress.at(-1).completed, 6);
});

test("snapshot isolates nested layouts, admin, list and default conditions before first yield", async () => {
  const list = structuredClone(smallList());
  const savedConditions = { ...DEFAULT_CONDITIONS };
  DEFAULT_CONDITIONS.commonAdmin = ["font"];
  const expected = structuredClone(roundRobin(list));
  const clock = manualScheduler();
  try {
    const operation = roundRobinAsync(list, { schedule: clock.schedule });
    list[0].layout[0][0] = "not-a-real-part";
    list[0].admin.push("not-an-admin");
    list[0].name = "changed after start";
    list.reverse();
    list.push(entrants()[3]);
    DEFAULT_CONDITIONS.hp = 3;
    DEFAULT_CONDITIONS.capacity = 1;
    DEFAULT_CONDITIONS.adminSlots = 0;
    DEFAULT_CONDITIONS.commonAdmin.push("changed-after-start");
    await clock.drain();
    assert.deepEqual(await operation, expected);
  } finally {
    for (const key of Object.keys(DEFAULT_CONDITIONS))
      delete DEFAULT_CONDITIONS[key];
    Object.assign(DEFAULT_CONDITIONS, savedConditions);
  }
});

test("duplicate entrants keep the synchronous identity-based null cells and actual total", async () => {
  const [a, b] = smallList();
  const list = [a, a, b];
  const progress = [];
  const actual = await roundRobinAsync(list, {
    onProgress: (value) => progress.push(value),
  });
  assert.deepEqual(actual, roundRobin(list));
  assert.equal(actual.list[0], actual.list[1]);
  assert.deepEqual(progress.at(-1), { completed: 4, total: 4 });
});

test("empty and self-only matrices need no scheduled work", async () => {
  for (const list of [[], [smallList()[0]]]) {
    const clock = manualScheduler();
    const progress = [];
    assert.deepEqual(
      await roundRobinAsync(list, {
        schedule: clock.schedule,
        onProgress: (value) => progress.push(value),
      }),
      roundRobin(list),
    );
    assert.equal(clock.scheduled, 0);
    assert.deepEqual(progress, [{ completed: 0, total: 0 }]);
  }
});

test("already aborted request neither schedules work nor reports progress", async () => {
  const controller = new AbortController();
  controller.abort("closed before start");
  const clock = manualScheduler();
  const progress = [];
  await assert.rejects(
    roundRobinAsync(smallList(), {
      signal: controller.signal,
      schedule: clock.schedule,
      onProgress: (value) => progress.push(value),
    }),
    abortError,
  );
  assert.equal(clock.scheduled, 0);
  assert.deepEqual(progress, []);
});

test("closing while first host turn is pending cancels it and ignores even a late callback", async () => {
  const controller = new AbortController();
  const clock = manualScheduler();
  const progress = [];
  const operation = roundRobinAsync(smallList(), {
    signal: controller.signal,
    schedule: clock.schedule,
    onProgress: (value) => progress.push(value),
  });
  const rejected = assert.rejects(operation, abortError);
  controller.abort();
  await rejected;
  assert.equal(clock.pending, 0);
  assert.equal(clock.cancellations, 1);
  await clock.replayCancelled();
  assert.deepEqual(progress, [{ completed: 0, total: 6 }]);
  assert.equal(clock.scheduled, 1);
});

test("closing between real batches cancels the next turn and emits no later progress", async () => {
  const controller = new AbortController();
  const clock = manualScheduler();
  const progress = [];
  const operation = roundRobinAsync(smallList(), {
    signal: controller.signal,
    schedule: clock.schedule,
    onProgress: (value) => progress.push(value),
  });
  const rejected = assert.rejects(operation, abortError);
  await clock.next();
  assert.ok(progress.at(-1).completed > 0 && progress.at(-1).completed <= 4);
  assert.equal(clock.pending, 1);
  const beforeClose = structuredClone(progress);
  const scheduledBeforeClose = clock.scheduled;
  controller.abort();
  await rejected;
  await clock.replayCancelled();
  assert.equal(clock.pending, 0);
  assert.equal(clock.scheduled, scheduledBeforeClose);
  assert.deepEqual(progress, beforeClose);
});

test("abort inside progress stops before another schedule including at final completion", async () => {
  for (const abortAt of [0, 1, 6]) {
    const controller = new AbortController();
    const clock = manualScheduler();
    const progress = [];
    const operation = roundRobinAsync(smallList(), {
      signal: controller.signal,
      schedule: clock.schedule,
      onProgress: (value) => {
        progress.push(value);
        if (value.completed >= abortAt) controller.abort();
      },
    });
    const rejected = assert.rejects(operation, abortError);
    await clock.drain();
    await rejected;
    assert.equal(clock.pending, 0);
    const count = progress.length;
    await clock.replayCancelled();
    assert.equal(progress.length, count);
    if (abortAt === 0) assert.equal(clock.scheduled, 0);
  }
});

test("a real invalid combat rejects without final progress or rescheduling", async () => {
  const list = structuredClone(smallList());
  list[0].layout[0][0] = "missing-part";
  const clock = manualScheduler();
  const progress = [];
  const operation = roundRobinAsync(list, {
    schedule: clock.schedule,
    onProgress: (value) => progress.push(value),
  });
  const rejected = assert.rejects(operation);
  await clock.next();
  await rejected;
  assert.equal(clock.pending, 0);
  assert.equal(clock.scheduled, 1);
  assert.deepEqual(progress, [{ completed: 0, total: 6 }]);
});

test("scheduling and progress errors reject without leaving future work", async () => {
  const failure = new Error("test failure");
  await assert.rejects(
    roundRobinAsync(smallList(), {
      schedule: () => {
        throw failure;
      },
    }),
    (error) => error === failure,
  );
  const clock = manualScheduler();
  const operation = roundRobinAsync(smallList(), {
    schedule: clock.schedule,
    onProgress: (value) => {
      if (value.completed > 0) throw failure;
    },
  });
  const rejected = assert.rejects(operation, (error) => error === failure);
  await clock.next();
  await rejected;
  assert.equal(clock.pending, 0);
  assert.equal(clock.scheduled, 1);
});

test("an aborted run cannot interfere with a fresh run sharing the same scheduler", async () => {
  const controller = new AbortController();
  const clock = manualScheduler();
  const oldProgress = [];
  const old = roundRobinAsync(smallList(), {
    signal: controller.signal,
    schedule: clock.schedule,
    onProgress: (value) => oldProgress.push(value),
  });
  const rejected = assert.rejects(old, abortError);
  controller.abort();
  await rejected;
  const fresh = roundRobinAsync(smallList(), { schedule: clock.schedule });
  await clock.drain();
  assert.deepEqual(await fresh, roundRobin(smallList()));
  await clock.replayCancelled();
  assert.deepEqual(oldProgress, [{ completed: 0, total: 6 }]);
  assert.equal(clock.pending, 0);
});

test("elapsed soft budget yields after one indivisible real match without empty progress", async (t) => {
  let time = 0;
  t.mock.method(performance, "now", () => (time += 8));
  const clock = manualScheduler();
  const progress = [];
  const operation = roundRobinAsync(smallList(), {
    schedule: clock.schedule,
    onProgress: (value) => progress.push(value.completed),
  });
  await clock.drain();
  await operation;
  assert.deepEqual(progress, [0, 1, 2, 3, 4, 5, 6]);
  assert.equal(clock.scheduled, 6);
});

test("closing after a host callback but before its continuation prevents the first match", async () => {
  const controller = new AbortController();
  const clock = manualScheduler();
  const progress = [];
  const operation = roundRobinAsync(smallList(), {
    signal: controller.signal,
    schedule: clock.schedule,
    onProgress: (value) => progress.push(value),
  });
  const rejected = assert.rejects(operation, abortError);
  const resumed = clock.next();
  controller.abort();
  await resumed;
  await rejected;
  assert.deepEqual(progress, [{ completed: 0, total: 6 }]);
  assert.equal(clock.scheduled, 1);
  assert.equal(clock.pending, 0);
});

test("abort raised during schedule registration cancels the newly returned task", async () => {
  const controller = new AbortController();
  let cancelled = 0;
  const progress = [];
  await assert.rejects(
    roundRobinAsync(smallList(), {
      signal: controller.signal,
      schedule: () => {
        controller.abort();
        return () => cancelled++;
      },
      onProgress: (value) => progress.push(value),
    }),
    abortError,
  );
  assert.equal(cancelled, 1);
  assert.deepEqual(progress, [{ completed: 0, total: 6 }]);
});
