import D from "./data.js";
import { BUILDS } from "./builds.js";
import { SITE_TEMPLATES } from "./catalog/index.js";
import { RECIPES, type Recipe } from "./fusion.js";
import C from "./document.js";
import E from "./engine.js";
import type {
  BattleSummary,
  EnemyDefinition,
  Item,
  LayoutEntry,
  Mode,
  Run,
  TransactionFailure,
} from "./types.js";

/* Run transactions, pixel-document persistence and progression. No DOM or network. */

const fail = (error: string): TransactionFailure => ({ ok: false, error });
// A run climbs from a bare 1999 homepage to a bloated mashup. Opponents grow with it:
// early rounds face a few UIs of a real site, late rounds the whole site plus its back office.
const ROUNDS = 8,
  SHOP_SIZE = 5,
  REROLL = 1;
const LADDER = [
  { e: 0, n: 3, hp: 110 },
  { e: 1, n: 4, hp: 150 },
  { e: 2, n: 5, hp: 190 },
  { e: 3, n: 6, hp: 230 },
  { e: 0, n: 99, hp: 270, admin: true },
  { e: 4, n: 8, hp: 320 },
  { e: 1, n: 99, hp: 380, admin: true },
  { e: 4, n: 99, hp: 560, admin: true },
];
const CAMPAIGN_START = [
  ["ab_heading", 32, 24, 420, 56, null, "ようこそ！ぼくのページへ"],
  ["ab_link", 32, 104, 176, 32, null, "自己紹介"],
  ["ab_counter", 32, 152, 288, 26],
];
function nextItem(
  run: Run,
  type: string,
  x: number | null = null,
  y: number | null = null,
  w?: number,
  h?: number,
) {
  return C.makeItem(type, "p" + run.nextId++, x, y, w, h);
}
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
function shuffle<T>(arr: T[], rand: () => number): T[] {
  for (let k = arr.length - 1; k > 0; k--) {
    const j = Math.floor(rand() * (k + 1));
    [arr[k], arr[j]] = [arr[j], arr[k]];
  }
  return arr;
}
function priceCap(run: Run) {
  return run.mode === "lab" ? 99 : 4 + run.stage;
}
// Materials are scarce: the shop only stocks UI from site cultures you have met so far.
const TUTORIAL_SHOP = ["ab_heading", "ab_link", "ab_nav"];
function shopFactions(run: Run) {
  const set = new Set(["retro"]);
  if (run.mode === "lab") return new Set(Object.keys(D.FACTIONS));
  for (let i = 0; i <= Math.min(run.stage, ROUNDS - 1); i++)
    set.add(D.ENEMIES[LADDER[i].e].faction);
  return set;
}
function shopSize(run: Run) {
  return run.stage < 2 ? 3 : run.stage < 4 ? 4 : SHOP_SIZE;
}
function market(run: Run): Run["shop"] {
  if (
    run.mode === "campaign" &&
    run.tutorial === 1 &&
    run.stage === 0 &&
    !run.rerolls
  )
    return TUTORIAL_SHOP.map((type) => ({ type, sold: false }));
  const rand = rng(run.seed + run.stage * 953 + run.rerolls * 71),
    cap = priceCap(run),
    f = shopFactions(run);
  const out = shuffle(
    Object.keys(D.PARTS).filter(
      (t) =>
        !D.PARTS[t].fused &&
        (run.mode === "lab" || D.PARTS[t].status !== "experimental") &&
        D.PARTS[t].price <= cap && f.has(D.PARTS[t].faction),
    ),
    rand,
  )
    .slice(0, shopSize(run))
    .map((type) => ({ type, sold: false }));
  // A server plan shows up about half the time — like a bag that may or may not appear.
  if (
    run.mode === "campaign" &&
    !(run.tutorial === 1 && run.stage === 0) &&
    rand() < 0.5
  ) {
    const plan =
      run.stage < 2
        ? "srv_s"
        : run.stage < 5
          ? rand() < 0.5
            ? "srv_s"
            : "srv_m"
          : rand() < 0.5
            ? "srv_m"
            : "srv_l";
    out.push({ type: "plan:" + plan, sold: false });
  }
  return out;
}
// The lab can also fight the archetype builds (after the five campaign sites).
const BUILD_ENEMIES: EnemyDefinition[] = BUILDS.filter((b) => b.labOpponent !== false).map((b) => ({
  id: b.id,
  faction: b.faction,
  name: b.name,
  pageName: b.pageName,
  address: b.address,
  hp: 440,
  fee: 0,
  reward: 0,
  tip: b.concept,
  admin: b.admin,
  loot: [],
  layout: b.layout,
  decor: [],
}));
function labEnemies(): EnemyDefinition[] {
  return [...D.ENEMIES, ...BUILD_ENEMIES, ...SITE_TEMPLATES];
}
function pageDecor(run: Run) {
  return SITE_TEMPLATES.find(template => template.id === run.page.templateId)?.decor ?? [];
}
type Opponent = EnemyDefinition & {
  index: number;
  round: number | null;
  size: number;
  full?: boolean;
};
function opponent(run: Run): Opponent {
  if (run.mode === "lab") {
    const list = labEnemies(),
      i = Math.min(run.stage, list.length - 1),
      e = list[i];
    return {
      ...e,
      index: i,
      round: null,
      size: e.layout.length,
      admin: e.admin || [],
    };
  }
  const r = LADDER[Math.min(run.stage, ROUNDS - 1)],
    e = D.ENEMIES[r.e];
  return {
    ...e,
    index: r.e,
    round: run.stage + 1,
    hp: r.hp,
    size: Math.min(r.n, e.layout.length),
    admin: r.admin ? e.admin || [] : [],
    full: r.n >= e.layout.length,
  };
}
// A trimmed opponent keeps its attackers first, so a small site still fights back.
function enemyIndices(e: EnemyDefinition, n: number) {
  const pri = (i: number) => {
    const k = D.PARTS[e.layout[i][0]].kind;
    return k === "attack" ? 0 : k === "shield" || k === "heal" ? 1 : 2;
  };
  return e.layout
    .map((_, i) => i)
    .sort((a, b) => pri(a) - pri(b) || a - b)
    .slice(0, n)
    .sort((a, b) => a - b);
}
function enemyBoard(run: Run) {
  const o = opponent(run),
    e: EnemyDefinition = o;
  return enemyIndices(e, o.size).map((i) => {
    const [t, x, y, w, h, shape, label] = e.layout[i];
    return Object.assign(
      C.makeItem(t, "e" + i, x, y, w, h),
      shape ? { shape } : {},
      label ? { label } : {},
    );
  });
}
function playerHp(run: Run) {
  return run.mode === "lab" ? 440 : 180 + run.stage * 40;
}
// Server capacity is the "bag size": only rental plans found while crawling raise it.
const PLANS: Record<string, { name: string; cap: number; price: number }> = {
  srv_s: { name: "レンタルサーバー ライト", cap: 5, price: 3 },
  srv_m: { name: "レンタルサーバー スタンダード", cap: 9, price: 6 },
  srv_l: { name: "レンタルサーバー ビジネス", cap: 14, price: 9 },
};
const START_CAPACITY = 12;
function capacity(run: Run) {
  return run.mode === "lab" ? D.LOAD_LIMIT : (run.capacity ?? START_CAPACITY);
}
function cpuLimit(run: Run) {
  return capacity(run);
}
function pageSpeed(load: number, cap: number) {
  return load <= cap ? 1 : 1 / (1 + (load / cap - 1) * 0.6);
}
function adminSlots(run: Run) {
  return run.mode === "lab"
    ? D.ADMIN_SLOTS
    : run.stage >= 5
      ? 2
      : run.stage >= 2
        ? 1
        : 0;
}
function newRun(
  mode: Mode = "lab",
  preset = "mixed",
  { tutorial = false }: { tutorial?: boolean } = {},
): Run {
  mode = mode === "campaign" ? "campaign" : "lab";
  const r: Run = {
    version: 3,
    mode,
    cash: mode === "lab" ? 0 : tutorial ? 11 : 10,
    stage: 0,
    lives: 3,
    wins: 0,
    nextId: 1,
    seed: (Date.now() % 2147483647) >>> 0,
    rerolls: 0,
    phase: "build",
    owned: [],
    shop: [],
    pending: null,
    history: [],
    page:
      mode === "lab"
        ? { name: "mixspace.", theme: "mixed" }
        : { name: "ぼくのホームページ", theme: "mixed" },
    admin: mode === "lab" ? ["adnet", "troll"] : [],
    tutorial: mode === "campaign" && tutorial ? 1 : 0,
    tutorialAck: false,
  };
  const layout: LayoutEntry[] =
    mode === "lab"
      ? (D.PRESETS[preset] ?? BUILDS.find((b) => b.id === preset) ?? D.PRESETS.mixed).layout
      : [];
  r.owned = layout.map(([t, x, y, w, h, shape, label]) =>
    Object.assign(
      nextItem(r, t, x, y, w, h),
      shape ? { shape } : {},
      label ? { label } : {},
    ),
  );
  const template = mode === "lab" ? SITE_TEMPLATES.find(site => site.id === preset) : undefined;
  if (template) {
    r.page = { name: template.pageName, theme: template.faction, templateId: template.id };
    r.admin = [...template.admin];
  }
  r.shop = market(r);
  return r;
}
function purchase(
  run: Run,
  type: string,
):
  | TransactionFailure
  | { ok: true; plan: (typeof PLANS)[string] }
  | { ok: true; item: Item } {
  if (run.phase !== "build") return fail("戦闘中は編集できません。");
  if (type.startsWith("plan:")) {
    const pl = PLANS[type.slice(5)],
      s = run.shop.find((q) => q.type === type && !q.sold);
    if (!pl || !s) return fail("このプランは今ありません。");
    if (run.cash < pl.price)
      return fail(`資金が足りません（$${pl.price}必要）。`);
    run.cash -= pl.price;
    s.sold = true;
    run.capacity = capacity(run) + pl.cap;
    return { ok: true, plan: pl };
  }
  const d = D.PARTS[type];
  if (!d) return fail("このUIはありません。");
  if (run.owned.length >= D.MAX_ITEMS)
    return fail("所持上限64個です。未使用UIを売ってください。");
  const s = run.shop.find((q) => q.type === type && !q.sold);
  if (run.mode === "campaign" && !s)
    return fail("このUIは今のショップにありません。");
  if (run.mode === "campaign" && run.cash < d.price)
    return fail(`資金が足りません（移植に$${d.price}必要）。`);
  if (run.mode === "campaign") {
    run.cash -= d.price;
    if (s) s.sold = true;
  }
  const item = nextItem(run, type);
  run.owned.push(item);
  return { ok: true, item };
}
function sellValue(run: Run, type: string) {
  return run.mode === "lab"
    ? 0
    : Math.max(1, Math.floor(D.PARTS[type].price / 2));
}
function sell(
  run: Run,
  id: string,
): TransactionFailure | { ok: true; value: number } {
  if (run.phase !== "build") return fail("戦闘中は編集できません。");
  const p = run.owned.find((q) => q.id === id);
  if (!p) return fail("UIがありません。");
  if (run.owned.length <= 1) return fail("最後のUIは残してください。");
  const value = sellValue(run, p.type);
  run.owned = run.owned.filter((q) => q.id !== id);
  for (const q of run.owned) if (q.routeTo === id) delete q.routeTo;
  run.cash += value;
  return { ok: true, value };
}
function move(
  run: Run,
  id: string,
  x: number | null,
  y: number | null,
  w?: number,
  h?: number,
) {
  if (run.phase !== "build") return false;
  const p = run.owned.find((q) => q.id === id);
  if (!p) return false;
  if (x === null && y === null) {
    const ids = [id, ...C.descendants(run.owned, id)];
    for (const q of run.owned)
      if (ids.includes(q.id)) {
        q.x = null;
        q.y = null;
      }
    return true;
  }
  const nw = w ?? p.w,
    nh = h ?? p.h;
  if (!C.canPlace(run.owned, p, x, y, nw, nh)) return false;
  Object.assign(p, { x, y, w: nw, h: nh });
  return true;
}
function reroll(run: Run): TransactionFailure | { ok: true } {
  if (run.phase !== "build" || run.mode === "lab")
    return fail("再抽選できません。");
  if (run.cash < REROLL) return fail(`品ぞろえの更新には$${REROLL}必要です。`);
  run.cash -= REROLL;
  run.rerolls++;
  run.shop = market(run);
  return { ok: true };
}
function startBattle(
  run: Run,
  options: { audienceExperiment?: boolean; serverPressureExperiment?: boolean; pressureCapacity?: 15 | 26 | 38 } = {},
): TransactionFailure | { ok: true; battle: InstanceType<typeof E.Battle> } {
  if (run.phase !== "build") return fail("今は対戦できません。");
  if (!run.owned.some((q) => C.placed(q) && D.PARTS[q.type].kind === "attack"))
    return fail("攻撃するUIを最低1つページに置いてください。");
  const o = opponent(run);
  if ((run.admin || []).length > adminSlots(run))
    return fail("管理画面の設備がスロット数を超えています。");
  const pressure = run.mode === "lab" && options.serverPressureExperiment === true;
  const pressureCapacity = options.pressureCapacity === 15 ? 15 : options.pressureCapacity === 38 ? 38 : 26;
  const battle = new E.Battle(run.owned, enemyBoard(run), {
    playerHp: playerHp(run),
    enemyHp: o.hp,
    playerAdmin: run.admin || [],
    enemyAdmin: o.admin,
    playerCapacity: pressure ? pressureCapacity : run.mode === "lab" ? Infinity : capacity(run),
    ...(pressure ? {enemyCapacity: pressureCapacity} : {}),
    experimentalRules: pressure ? "server-pressure-v1" : run.mode === "lab" && options.audienceExperiment === true ? "audience-v1" : null,
  });
  run.phase = "battle";
  return { ok: true, battle };
}
// Loot: two UIs from the defeated site, plus a back-office upgrade while a slot is free.
function lootFor(run: Run) {
  const o = opponent(run),
    rand = rng(run.seed + run.stage * 7919),
    cap = priceCap(run) + 1,
    pool = shuffle(
      Object.keys(D.PARTS).filter(
        (t) =>
          !D.PARTS[t].fused && D.PARTS[t].status !== "experimental" &&
          D.PARTS[t].faction === o.faction && D.PARTS[t].price <= cap,
      ),
      rand,
    ),
    out = pool.slice(0, 2);
  const owned = run.admin || [];
  if (owned.length < adminSlots({ ...run, stage: run.stage + 1 })) {
    const adm = shuffle(
      Object.keys(D.ADMIN).filter((a) => !owned.includes(a)),
      rand,
    )[0];
    if (adm) out.push("admin:" + adm);
  }
  if (out.length < 3)
    out.push(
      ...shuffle(
        Object.keys(D.PARTS).filter(
          (t) => !out.includes(t) && !D.PARTS[t].fused &&
            D.PARTS[t].status !== "experimental" && D.PARTS[t].price <= cap,
        ),
        rand,
      ).slice(0, 3 - out.length),
    );
  return out;
}
/* ---------- UI fusion: near pairs that match a recipe merge when a battle ends ---------- */
export interface FusionPair {
  recipe: Recipe;
  a: Item;
  b: Item;
}
export interface FusionSelection { pair: readonly [string, string] }
function fusionPairs(board: Item[], selection?: FusionSelection): FusionPair[] {
  const placedItems = board.filter(C.placed).filter(item => !item.fusionLocked);
  if (placedItems.length < 2) return [];
  const near = E.analyze(placedItems).near,
    used = new Set<string>(),
    out: FusionPair[] = [];
  for (const recipe of RECIPES)
    for (const a of placedItems) {
      if (selection && !selection.pair.includes(a.id)) continue;
      if (used.has(a.id) || a.type !== recipe.a) continue;
      const b = placedItems.find(
        (q) => q.id !== a.id && (!selection || selection.pair.includes(q.id)) && !used.has(q.id) && q.type === recipe.b && (near[a.id] || []).includes(q.id),
      );
      if (!b) continue;
      used.add(a.id);
      used.add(b.id);
      out.push({ recipe, a, b });
    }
  return out;
}
export interface Fusion {
  recipe: Recipe;
  item: Item;
  from: [string, string];
}
function fuse(run: Run, selection?: FusionSelection): Fusion[] {
  const done: Fusion[] = [];
  for (const { recipe, a, b } of fusionPairs(run.owned, selection)) {
    const d = D.PARTS[recipe.into];
    if (run.mode === "campaign" && d.status === "experimental") continue;
    const lineage = [...new Map([a, b].flatMap(q => [
      ...(q.lineage ?? []),
      ...(q.appearanceId && q.provenanceId ? [{ appearanceId: q.appearanceId, provenanceId: q.provenanceId }] : []),
    ]).map(ref => [`${ref.appearanceId}/${ref.provenanceId}`, ref])).values()];
    if (lineage.length > 16) continue;
    run.owned = run.owned.filter((q) => q.id !== a.id && q.id !== b.id);
    for (const q of run.owned)
      if (q.routeTo === a.id || q.routeTo === b.id) delete q.routeTo;
    const item = nextItem(run, recipe.into);
    if (lineage.length) item.lineage = lineage;
    // Keep the new UI where the pair stood: prefer the parent it grew out of (same layout), else the bigger one.
    const same = (q: Item) => D.PARTS[q.type].layout === d.layout;
    const [big, small] =
      same(a) !== same(b) ? (same(a) ? [a, b] : [b, a]) : C.area(a) >= C.area(b) ? [a, b] : [b, a];
    const fits = (w: number, h: number) => w >= d.minW && h >= d.minH && w <= d.maxW && h <= d.maxH;
    const tries: [number | null, number | null, number, number][] = [];
    // The embedded player's seek bar is still physically part of the module.
    // Consume its strip, preserving the bottom edge where the controls attach.
    if (recipe.into === "yt_embed" && big.x !== null && big.y !== null &&
      small.x !== null && small.y !== null &&
      Math.abs(small.x - big.x) <= 8 && Math.abs(small.y - (big.y + big.h)) <= 8) {
      const height = small.y + small.h - big.y;
      if (fits(big.w, height)) tries.push([big.x, big.y, big.w, height]);
    }
    if (fits(big.w, big.h) && d.layout === D.PARTS[big.type].layout) tries.push([big.x, big.y, big.w, big.h]);
    for (const p of [big, small]) tries.push([p.x, p.y, Math.min(d.w, D.WIDTH - (p.x ?? 0)), d.h]);
    let spot = tries.find(([x, y, w, h]) => fits(w, h) && C.canPlace(run.owned, item, x, y, w, h));
    if (!spot) {
      const s = C.findSpace(run.owned, item);
      if (s) spot = [s.x, s.y, item.w, item.h];
    }
    if (spot) Object.assign(item, { x: spot[0], y: spot[1], w: spot[2], h: spot[3] });
    run.owned.push(item);
    done.push({ recipe, item, from: [a.type, b.type] });
  }
  return done;
}
function advance(run: Run) {
  run.stage++;
  run.pending = null;
  run.rerolls = 0;
  if (run.tutorial === 1) run.tutorial = 2;
  if (run.stage >= ROUNDS) {
    run.phase = "complete";
    run.stage = ROUNDS;
  } else {
    run.phase = "build";
    run.shop = market(run);
  }
}
function settleBattle(
  run: Run,
  battle: InstanceType<typeof E.Battle>,
): TransactionFailure | { ok: true; summary: BattleSummary } {
  if (run.phase !== "battle" || !battle.result) return fail("精算できません。");
  const o = opponent(run),
    win = battle.result.winner === "player";
  const base = run.mode === "lab" ? 0 : 6,
    bonus = run.mode === "lab" ? 0 : win ? 4 : 0,
    income =
      run.mode === "lab"
        ? 0
        : Math.min(10, Math.floor(battle.player.income / 2));
  run.cash += base + bonus + income;
  const summary: BattleSummary = {
    winner: battle.result.winner,
    time: battle.elapsed,
    enemy: o.pageName,
    round: o.round,
    base,
    bonus,
    income,
    rawIncome: battle.player.income,
    total: base + bonus + income,
    stage: run.stage,
    damage: Math.round(battle.player.damage),
    hp: Math.ceil(battle.player.hp),
    maxHp: battle.player.maxHp,
    stats: battle.player.parts
      .map((p) => ({
        type: p.type,
        id: p.id,
        damage: Math.round(p.damage),
        earned: p.earned,
        shield: p.protected,
        heal: p.healed,
        fires: p.fires,
      }))
      .sort((a, b) => b.damage - a.damage),
  };
  run.history.push(summary);
  run.history = run.history.slice(-30);
  if (run.mode === "lab") {
    run.phase = "build";
    run.pending = null;
    return { ok: true, summary };
  }
  if (win) {
    run.wins++;
    run.phase = "reward";
    run.pending = { loot: lootFor(run), summary };
  } else {
    run.lives--;
    if (run.lives <= 0) {
      run.phase = "gameover";
      run.pending = null;
    } else advance(run);
  }
  return { ok: true, summary };
}
function claimLoot(
  run: Run,
  choice: string | null,
): TransactionFailure | { ok: true; item: Item | null; admin: string | null; pending?: true } {
  if (run.phase !== "reward" || !run.pending)
    return fail("回収できるものがありません。");
  if (choice !== null && !run.pending.loot.includes(choice))
    return fail("回収候補にありません。");
  let item: Item | null = null,
    admin: string | null = null,
    pending = false;
  if (choice?.startsWith("admin:")) {
    admin = choice.slice(6);
    run.admin = [...(run.admin || []), admin];
  } else if (choice !== null) {
    if (run.owned.length >= D.MAX_ITEMS && (run.pendingInventory?.length ?? 0) >= ROUNDS)
      return fail("受取箱がいっぱいです。元の報酬はそのまま残っています。");
    item = nextItem(run, choice);
    if (run.owned.length >= D.MAX_ITEMS) {
      (run.pendingInventory ??= []).push(item);
      pending = true;
    } else run.owned.push(item);
  }
  advance(run);
  return { ok: true, item, admin, ...(pending ? { pending: true as const } : {}) };
}
function collectOverflow(run: Run, id: string): TransactionFailure | { ok: true; item: Item } {
  if (run.phase !== "build") return fail("編集画面で受け取ってください。");
  if (run.owned.length >= D.MAX_ITEMS) return fail("手持ちに空きを作ってから受け取ってください。");
  const item = run.pendingInventory?.find(p => p.id === id);
  if (!item) return fail("このUIは受取箱にありません。");
  run.pendingInventory = run.pendingInventory!.filter(p => p.id !== id);
  run.owned.push(item);
  return { ok: true, item };
}
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isNumber = (value: unknown): value is number => typeof value === "number";
const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.every((entry: unknown) => typeof entry === "string");
function isItem(value: unknown): value is Item {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.type === "string" &&
    (value.x === null || isNumber(value.x)) &&
    (value.y === null || isNumber(value.y)) &&
    isNumber(value.w) &&
    isNumber(value.h) &&
    typeof value.shape === "string" &&
    typeof value.label === "string"
  );
}
function isSummary(value: unknown): value is BattleSummary {
  if (!isRecord(value)) return false;
  const numeric = [
    "time",
    "base",
    "bonus",
    "income",
    "rawIncome",
    "total",
    "stage",
    "damage",
    "hp",
    "maxHp",
  ];
  if (!numeric.every((key) => isNumber(value[key]))) return false;
  if (
    typeof value.winner !== "string" ||
    !["player", "enemy", "draw"].includes(value.winner) ||
    typeof value.enemy !== "string" ||
    !(value.round === null || isNumber(value.round)) ||
    !Array.isArray(value.stats) ||
    !value.stats.every(
      (entry: unknown) =>
        isRecord(entry) &&
        typeof entry.type === "string" &&
        typeof entry.id === "string" &&
        ["damage", "earned", "shield", "heal", "fires"].every((key) =>
          isNumber(entry[key]),
        ),
    )
  )
    return false;
  const visitors = value.visitors;
  return (
    visitors === undefined ||
    visitors === null ||
    (isRecord(visitors) &&
      ["player", "enemy", "base", "max"].every((key) =>
        isNumber(visitors[key]),
      ))
  );
}
function hasRunShape(value: unknown): value is Run {
  if (!isRecord(value)) return false;
  const numeric = [
    "version",
    "cash",
    "stage",
    "lives",
    "wins",
    "nextId",
    "seed",
    "rerolls",
  ];
  if (
    !numeric.every((key) => isNumber(value[key])) ||
    typeof value.mode !== "string" ||
    !["lab", "campaign"].includes(value.mode) ||
    typeof value.phase !== "string" ||
    !["build", "battle", "reward", "complete", "gameover"].includes(
      value.phase,
    ) ||
    !isRecord(value.page) ||
    typeof value.page.name !== "string" ||
    typeof value.page.theme !== "string" ||
    !(value.page.theme === "mixed" || Object.hasOwn(D.FACTIONS, value.page.theme)) ||
    !Array.isArray(value.owned) ||
    !value.owned.every(isItem) ||
    (value.pendingInventory !== undefined && (!Array.isArray(value.pendingInventory) || !value.pendingInventory.every(isItem))) ||
    !Array.isArray(value.shop) ||
    !value.shop.every(
      (entry: unknown) =>
        isRecord(entry) &&
        typeof entry.type === "string" &&
        typeof entry.sold === "boolean",
    ) ||
    !Array.isArray(value.history) ||
    !value.history.every(isSummary) ||
    !isStringArray(value.admin) ||
    (value.capacity !== undefined && !isNumber(value.capacity)) ||
    (value.tutorial !== undefined && !isNumber(value.tutorial)) ||
    (value.tutorialAck !== undefined && typeof value.tutorialAck !== "boolean")
  )
    return false;
  const pending = value.pending;
  return (
    pending === null ||
    (isRecord(pending) &&
      isStringArray(pending.loot) &&
      isSummary(pending.summary))
  );
}
function validateRun(value: unknown): value is Run {
  if (!hasRunShape(value)) return false;
  const r = value;
  if (
    !r ||
    r.version !== 3 ||
    !["lab", "campaign"].includes(r.mode) ||
    !["build", "reward", "complete", "gameover"].includes(r.phase)
  )
    return false;
  for (const [k, max] of [
    ["cash", 1000000],
    ["stage", r.mode === "lab" ? Math.max(ROUNDS, labEnemies().length - 1) : ROUNDS],
    ["lives", 3],
    ["wins", ROUNDS],
    ["nextId", 1000000],
    ["seed", 4294967295],
    ["rerolls", 100000],
  ] as const)
    if (!Number.isInteger(r[k]) || r[k] < 0 || r[k] > max) return false;
  if (
    !r.page ||
    typeof r.page.name !== "string" ||
    r.page.name.length > 40 ||
    (r.page.templateId !== undefined &&
      (typeof r.page.templateId !== "string" || !/^[a-z0-9_-]{1,80}$/.test(r.page.templateId))) ||
    !(r.page.theme === "mixed" || Object.hasOwn(D.FACTIONS, r.page.theme))
  )
    return false;
  if (
    (r.tutorial !== undefined && ![0, 1, 2].includes(r.tutorial)) ||
    (r.tutorialAck !== undefined && typeof r.tutorialAck !== "boolean")
  )
    return false;
  if (
    !Array.isArray(r.owned) ||
    r.owned.length > D.MAX_ITEMS ||
    (r.pendingInventory !== undefined &&
      (r.pendingInventory.length > ROUNDS || r.pendingInventory.some(p => p.x !== null || p.y !== null))) ||
    !Array.isArray(r.shop) ||
    r.shop.length > 7 ||
    !Array.isArray(r.history) ||
    r.history.length > 30
  )
    return false;
  const ids = new Set();
  const localReference = (v: unknown, prefix: string) =>
    v === undefined || (typeof v === "string" && new RegExp(`^${prefix}_[a-f0-9]{64}$`).test(v));
  for (const p of [...r.owned, ...(r.pendingInventory ?? [])]) {
    if (
      !p ||
      !Object.hasOwn(D.PARTS, p.type) ||
      typeof p.id !== "string" ||
      !/^p\d+$/.test(p.id) ||
      ids.has(p.id) ||
      +p.id.slice(1) >= r.nextId ||
      typeof p.label !== "string" ||
      p.label.length > 80 ||
      (p.fusionLocked !== undefined && typeof p.fusionLocked !== "boolean") ||
      !localReference(p.appearanceId, "appearance") ||
      !localReference(p.provenanceId, "capture") ||
      (p.lineage !== undefined && (!Array.isArray(p.lineage) || p.lineage.length > 16 ||
        p.lineage.some(ref => !ref || typeof ref !== "object" ||
          typeof ref.appearanceId !== "string" || typeof ref.provenanceId !== "string" ||
          !localReference(ref.appearanceId, "appearance") || !localReference(ref.provenanceId, "capture")))) ||
      (p.routeTo !== undefined &&
        (typeof p.routeTo !== "string" || p.routeTo === p.id ||
          !r.owned.some((target) => target.id === p.routeTo))) ||
      !Object.hasOwn(D.SKINS, p.shape)
    )
      return false;
    ids.add(p.id);
    if (p.x === null && p.y === null) {
      const d = D.PARTS[p.type];
      if (
        !Number.isFinite(p.w) ||
        !Number.isFinite(p.h) ||
        p.w < d.minW ||
        p.w > d.maxW ||
        p.h < d.minH ||
        p.h > d.maxH
      )
        return false;
    } else if (!C.canPlace(r.owned, p, p.x, p.y)) return false;
  }
  if (
    !Array.isArray(r.admin) ||
    r.admin.length > D.ADMIN_SLOTS ||
    new Set(r.admin).size !== r.admin.length ||
    r.admin.some((a) => !Object.hasOwn(D.ADMIN, a))
  )
    return false;
  if (
    r.shop.some(
      (s) =>
        !s ||
        !(
          Object.hasOwn(D.PARTS, s.type) ||
          (typeof s.type === "string" &&
            s.type.startsWith("plan:") &&
            Object.hasOwn(PLANS, s.type.slice(5)))
        ) ||
        typeof s.sold !== "boolean",
    )
  )
    return false;
  if (
    r.capacity !== undefined &&
    (!Number.isInteger(r.capacity) || r.capacity < 1 || r.capacity > 200)
  )
    return false;
  const last = r.mode === "lab" ? labEnemies().length - 1 : ROUNDS - 1;
  if (
    (r.phase === "build" && r.stage > last) ||
    (r.phase === "complete" && r.stage !== ROUNDS) ||
    (r.phase === "gameover" && r.lives !== 0)
  )
    return false;
  if (
    r.phase === "reward" &&
    (!r.pending ||
      r.stage > last ||
      !Array.isArray(r.pending.loot) ||
      r.pending.loot.length < 1 ||
      r.pending.loot.length > 3 ||
      r.pending.loot.some(
        (t) =>
          typeof t !== "string" ||
          !(
            Object.hasOwn(D.PARTS, t) ||
            (t.startsWith("admin:") && Object.hasOwn(D.ADMIN, t.slice(6)))
          ),
      ))
  )
    return false;
  return true;
}
const api = {
  labEnemies,
  pageDecor,
  market,
  fusionPairs,
  fuse,
  ROUNDS,
  LADDER,
  PLANS,
  capacity,
  pageSpeed,
  shopFactions,
  shopSize,
  newRun,
  purchase,
  sell,
  sellValue,
  move,
  reroll,
  REROLL,
  opponent,
  enemyBoard,
  playerHp,
  cpuLimit,
  adminSlots,
  priceCap,
  startBattle,
  settleBattle,
  claimLoot,
  collectOverflow,
  validateRun,
  nextItem,
};
export default api;
