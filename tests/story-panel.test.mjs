import test from "node:test";
import assert from "node:assert/strict";
import * as story from "../src/story/index.ts";

function environment(initial) {
  const created = [];
  class Node {
    constructor(tag) {
      this.tagName = tag;
      this.children = [];
      this.events = {};
      this.dataset = {};
      this.style = {};
      this.attributes = {};
      this.textContent = "";
      this.value = "";
      this.disabled = false;
      this.hidden = false;
      this.className = "";
      this.type = tag === "button" ? "submit" : "";
      this.ownerDocument = doc;
      this.classList = {
        add: (...names) => (this.className += " " + names.join(" ")),
        remove: () => {},
        toggle: () => {},
      };
      created.push(this);
    }
    append(...nodes) {
      this.children.push(...nodes);
    }
    replaceChildren(...nodes) {
      this.children = [...nodes];
    }
    setAttribute(name, value) {
      this.attributes[name] = value;
    }
    addEventListener(name, fn) {
      this.events[name] = fn;
    }
    focus() {}
  }
  const doc = { createElement: (tag) => new Node(tag) };
  const host = new Node("div");
  let state = initial;
  const commands = [],
    raids = [],
    battles = [];
  const callbacks = {
    getState: () => state,
    onCommand: async (command) => {
      commands.push(command);
      const result = story.transitionStory(state, command);
      if (result.ok) state = result.state;
      return result;
    },
    onEdit: () => {},
    onBattle: async (encounter) => {
      battles.push(encounter);
    },
    onOptionalRaid: async (...args) => {
      raids.push(args);
    },
  };
  const visible = () => {
    const nodes = [];
    const walk = (n) => {
      nodes.push(n);
      for (const child of n.children ?? []) walk(child);
    };
    walk(host);
    return nodes;
  };
  const action = (id) => visible().find((n) => n.dataset?.storyAction === id);
  return {
    host,
    callbacks,
    commands,
    raids,
    battles,
    visible,
    action,
    get state() {
      return state;
    },
  };
}
const tick = () => new Promise((resolve) => setImmediate(resolve));

test("blank homepage naming is an accessible one-submit form and untrusted names are rendered as text", async () => {
  assert.equal(typeof story.mountStoryHub, "function", "hub renderer exists");
  const env = environment(story.createStoryState());
  const handle = story.mountStoryHub(env.host, env.callbacks);
  const input = env.visible().find((n) => n.dataset.storyField === "page-name");
  assert.ok(input);
  assert.equal(input.maxLength, 40);
  input.value = "<img src=x onerror=alert(1)>";
  const form = env.visible().find((n) => n.dataset.storyForm === "name");
  await form.events.submit({ preventDefault() {} });
  await tick();
  assert.equal(env.commands.length, 1);
  assert.equal(env.state.pageName, input.value);
  assert.ok(env.visible().some((n) => n.textContent === input.value));
  assert.ok(
    env.visible().every((n) => !n.innerHTML),
    "name is never inserted as HTML",
  );
  handle.dispose();
});

test("the workshop is made of keyboard buttons for physical objects and the machine keeps one's page in view", async () => {
  assert.equal(typeof story.mountStoryHub, "function");
  const state = story.transitionStory(story.createStoryState(), {
    type: "name-page",
    name: "私のページ",
  }).state;
  const env = environment(state);
  const handle = story.mountStoryHub(env.host, env.callbacks);
  for (const id of [
    "junk",
    "machine",
    "workbench",
    "shelf",
    "server",
    "power",
    "radio",
    "exit",
  ]) {
    const button = env.action(id);
    assert.ok(button, `${id} is reachable`);
    assert.equal(button.type, "button");
  }
  await env.action("machine").events.click();
  await tick();
  assert.ok(env.visible().some((n) => n.dataset.storyField === "machine-url"));
  assert.ok(env.visible().some((n) => n.textContent === "私のページ"));
  assert.equal(env.raids.length, 0);
  assert.equal(env.battles.length, 0);
  handle.dispose();
});

test("optional machine input never starts fetch during render or accepts real dark-web or executable URLs", async () => {
  assert.equal(typeof story.mountStoryHub, "function");
  const state = story.transitionStory(story.createStoryState(), {
    type: "name-page",
    name: "test",
  }).state;
  const env = environment(state);
  const handle = story.mountStoryHub(env.host, env.callbacks);
  await env.action("machine").events.click();
  await tick();
  for (const url of [
    "javascript:alert(1)",
    "https://somewhere.onion/",
    "https://user:secret@example.com/",
  ]) {
    env.visible().find((n) => n.dataset.storyField === "machine-url").value =
      url;
    await env
      .visible()
      .find((n) => n.dataset.storyForm === "machine")
      .events.submit({ preventDefault() {} });
    await tick();
  }
  assert.equal(env.raids.length, 0);
  env.visible().find((n) => n.dataset.storyField === "machine-url").value =
    "https://example.com/";
  await env
    .visible()
    .find((n) => n.dataset.storyForm === "machine")
    .events.submit({ preventDefault() {} });
  await tick();
  assert.deepEqual(env.raids, [["https://example.com/", "new"]]);
  assert.equal(
    env.commands.filter((c) => c.type === "spend-analysis").length,
    0,
    "host charges only confirmed scans",
  );
  handle.dispose();
});

test("a reloaded in-flight encounter exposes cancellation instead of starting another battle", async () => {
  let state = story.transitionStory(story.createStoryState(), {
    type: "name-page",
    name: "test",
  }).state;
  state = story.transitionStory(state, {
    type: "start-encounter",
    encounterId: story.currentStoryEncounter(state).id,
    matchId: "interrupted",
  }).state;
  const env = environment(state);
  const handle = story.mountStoryHub(env.host, env.callbacks);
  assert.ok(
    env.action("recover-encounter"),
    "interrupted connection has a recovery action",
  );
  await env.action("recover-encounter").events.click();
  await tick();
  assert.equal(env.state.phase, "hub");
  assert.equal(env.state.pendingEncounter, null);
  assert.equal(env.battles.length, 0);
  assert.equal(env.state.records.length, 0);
  handle.dispose();
});

test("rapid duplicate battle clicks use one host callback and disposing cannot redraw the closed hub", async () => {
  const state = story.transitionStory(story.createStoryState(), {
    type: "name-page",
    name: "test",
  }).state;
  const env = environment(state);
  let release,
    calls = 0;
  env.callbacks.onBattle = () => {
    calls++;
    return new Promise((resolve) => {
      release = resolve;
    });
  };
  const handle = story.mountStoryHub(env.host, env.callbacks);
  await env.action("machine").events.click();
  await tick();
  const start = env.action("main-encounter");
  const waiting = start.events.click();
  start.events.click();
  assert.equal(calls, 1);
  handle.dispose();
  release();
  await waiting;
  await tick();
  assert.equal(env.host.children.length, 0);
});

test("a cleared second stage still offers a local fusion rehearsal and does not hide it behind another battle", async () => {
  let state = story.transitionStory(story.createStoryState(), {
    type: "name-page",
    name: "test",
  }).state;
  for (let i = 0; i < 2; i++) {
    for (const encounter of story.currentStoryStage(state).encounters) {
      const matchId = `panel-${encounter.id}`;
      state = story.transitionStory(state, {
        type: "start-encounter",
        encounterId: encounter.id,
        matchId,
      }).state;
      state = story.transitionStory(state, {
        type: "resolve-encounter",
        matchId,
        winner: "player",
      }).state;
    }
    state = story.transitionStory(state, { type: "collect-record" }).state;
    if (i === 0)
      state = story.transitionStory(state, { type: "advance-stage" }).state;
  }
  const env = environment(state);
  let rehearsals = 0;
  env.callbacks.onPracticeFusion = async () => {
    rehearsals++;
    await env.callbacks.onCommand({ type: "witness-fusion" });
  };
  const handle = story.mountStoryHub(env.host, env.callbacks);
  assert.ok(
    env.action("practice-fusion"),
    "local rehearsal exists after all stage-two battles",
  );
  await env.action("practice-fusion").events.click();
  await tick();
  assert.equal(rehearsals, 1);
  assert.equal(env.state.fusionWitnessed, true);
  assert.equal(env.battles.length, 0);
  await env.action("machine").events.click();
  await tick();
  assert.ok(env.action("advance-stage"));
  handle.dispose();
});

test("the ending can render the actual player's mixed page beside its restored link", async () => {
  let state = story.transitionStory(story.createStoryState(), {
    type: "name-page",
    name: "My mixed page",
  }).state;
  for (let i = 0; i < 8; i++) {
    for (const encounter of story.currentStoryStage(state).encounters) {
      const matchId = `preview-${encounter.id}`;
      state = story.transitionStory(state, {
        type: "start-encounter",
        encounterId: encounter.id,
        matchId,
      }).state;
      state = story.transitionStory(state, {
        type: "resolve-encounter",
        matchId,
        winner: "player",
      }).state;
    }
    state = story.transitionStory(state, { type: "collect-record" }).state;
    if (i === 1)
      state = story.transitionStory(state, { type: "witness-fusion" }).state;
    if (i < 7)
      state = story.transitionStory(state, { type: "advance-stage" }).state;
  }
  state = story.transitionStory(state, {
    type: "open-archive",
    ...story.ARCHIVE_COORDINATES,
  }).state;
  state = story.transitionStory(state, { type: "restore-archive" }).state;
  const env = environment(state);
  let painted = 0;
  env.callbacks.renderOwnPage = (host) => {
    painted++;
    host.textContent = "Actual owned mixed UI";
  };
  const handle = story.mountStoryHub(env.host, env.callbacks);
  assert.equal(painted, 1);
  assert.ok(
    env.visible().some((node) => node.textContent === "Actual owned mixed UI"),
  );
  handle.dispose();
});

test("a completed story can return to the physical workshop and optional machine", async () => {
  const records = story.STORY_STAGES.map((s) => s.record.id);
  const state = {
    ...story.createStoryState(),
    stageId: "last-browser",
    phase: "complete",
    pageName: "done",
    fusionWitnessed: true,
    completedEncounters: story.STORY_STAGES.flatMap((s) =>
      s.encounters.map((e) => e.id),
    ),
    records,
    readRecords: records,
    archiveOpened: true,
    restored: true,
    endingLinkPlaced: true,
    restoredVisits: 1,
  };
  assert.equal(story.validateStoryState(state), true);
  const env = environment(state);
  const handle = story.mountStoryHub(env.host, env.callbacks);
  assert.ok(env.action("postgame-workshop"));
  await env.action("postgame-workshop").events.click();
  await tick();
  assert.ok(env.action("machine"));
  await env.action("machine").events.click();
  await tick();
  assert.ok(
    env.visible().some((node) => node.dataset.storyField === "machine-url"),
  );
  assert.equal(env.state.restoredVisits, 1);
  handle.dispose();
});
