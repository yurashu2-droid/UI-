import D from "./data.js";
import { VersionHistory } from "./version-history.js";
import C from "./document.js";
import { AudienceState, AUDIENCE_RULES } from "./audience-experiment.js";
import {
  EXPERIMENTAL_RULESETS,
  NAVIGATION_ATTENTION,
  navigationExperiment,
  audienceExperiment,
  type ExperimentalRules,
} from "./experimental-combat.js";
import {
  BATTLE_RULES_VERSION,
  SUPPORTED_COMBAT_VERSIONS,
  type CombatRulesVersion,
  CONTROL,
  RATE_LIMIT,
  emptyMetrics,
  type CombatMetrics,
} from "./combat-rules.js";
export { BATTLE_RULES_VERSION } from "./combat-rules.js";
import type {
  BattleAnalysis,
  BattleEvent,
  BattleEventInput,
  BattleOptions,
  BattlePart,
  BattleResult,
  BattleSide,
  Item,
  Modifier,
  Relation,
  SideName,
  Winner,
} from "./types.js";

/* DOM-free, fixed-step battle. Uses exactly the same composition tree as the editor. */

const P = D.PARTS;
/** Creation order and cosmetic IDs never determine clocks or target priority. */
function compareParts(a: Item, b: Item) {
  return (
    (a.y ?? Infinity) - (b.y ?? Infinity) ||
    (a.x ?? Infinity) - (b.x ?? Infinity) ||
    (a.type < b.type ? -1 : a.type > b.type ? 1 : 0) ||
    a.w - b.w ||
    a.h - b.h
  );
}
function distance(a: Item, b: Item) {
  return Math.hypot(
    (a.x ?? 0) + a.w / 2 - (b.x ?? 0) - b.w / 2,
    (a.y ?? 0) + a.h / 2 - (b.y ?? 0) - b.h / 2,
  );
}
const consumers = new Set(["am_cart", "am_oneclick", "ad_popup", "yt_tip"]);
function selectRoute<T extends Item>(
  items: T[],
  near: Record<string, string[]>,
  p: Item,
) {
  const candidates = items
    .filter(
      (q) =>
        consumers.has(q.type) &&
        q.id !== p.id &&
        ((near[p.id] ?? []).includes(q.id) ||
          (near[q.id] ?? []).includes(p.id)),
    )
    .sort((a, b) => distance(p, a) - distance(p, b) || compareParts(a, b));
  return candidates.find((q) => q.id === p.routeTo) ?? candidates[0];
}
function whitespaceBonus(p: Item, info: BattleAnalysis) {
  const focus = (info as AnalysisWithCaps).navigation?.highlightedLinks;
  if (focus && !focus.includes(p.id)) return 0;
  return Math.min(3, Math.floor(info.freeRatio * 5));
}
function openingValue(p: Item, info: BattleAnalysis) {
  let value = P[p.type].value;
  if (p.type === "ab_link") value += whitespaceBonus(p, info);
  if (p.type === "go_search")
    value +=
      Math.min(
        4,
        new Set(
          info.board
            .filter((q) => (info.near[p.id] ?? []).includes(q.id))
            .map((q) => P[q.type].faction)
            .filter((f) => f !== "google"),
        ).size,
      ) * 2;
  return value * info.mods[p.id].power;
}
function strongest<T extends Item>(parts: T[], info: BattleAnalysis) {
  return parts
    .filter((p) => P[p.type].kind === "attack")
    .sort(
      (a, b) =>
        openingValue(b, info) - openingValue(a, info) || compareParts(a, b),
    )[0];
}

interface PartState {
  payload?: { value: number; pierce: number };
  coveredUntil: number;
  immuneUntil: number;
  cache: boolean;
  cacheAt: number;
  target?: string;
}

const groupNames: Record<string, string> = {
  "button-group": "ボタングループ",
  "search-form": "検索フォーム",
  "nav-row": "ナビゲーション",
  "nav-menu": "縦ナビ",
  "media-stack": "動画プレイヤー",
  "commerce-stack": "商品購入欄",
  "search-stack": "検索パネル",
};
export interface AnalysisWithCaps extends BattleAnalysis {
  /** Excess multipliers clipped by final caps, not damage or redundant-source counts. */
  capWaste: { id: string; speed: number; power: number }[];
  navigation?: {
    entries: number;
    slowdown: number;
    highlightedLinks: string[];
  };
}
function analyze(
  input: Item[],
  experimentalRules: ExperimentalRules = null,
  combatVersion: CombatRulesVersion = BATTLE_RULES_VERSION,
): AnalysisWithCaps {
  const capWaste: AnalysisWithCaps["capWaste"] = [];
  const info = C.analyze([...input].sort(compareParts)),
    board = info.board,
    byId = Object.fromEntries(board.map((p) => [p.id, p])),
    mods: Record<string, Modifier & { flags?: Map<string, number> }> = {},
    relations: Relation[] = [],
    counts: Record<string, number> = {};
  // A component attached to a player/form shares its structural neighbourhood.
  const near = Object.fromEntries(
    Object.entries(info.near).map(([k, v]) => [k, new Set(v)]),
  );
  const original = info.near;
  for (const g of info.groups) {
    const boundary = new Set(g.items.flatMap((id) => original[id] || []));
    for (const id of g.items)
      for (const other of boundary) if (other !== id) near[id].add(other);
  }
  info.near = Object.fromEntries(
    Object.entries(near).map(([k, v]) => [k, [...v]]),
  );
  for (const p of board) {
    mods[p.id] = { speed: 1, power: 1, pierce: 0, flags: new Map(), notes: [] };
    counts[P[p.type].faction] = (counts[P[p.type].faction] || 0) + 1;
  }
  function bonus(
    id: string,
    key: "speed" | "power" | "pierce",
    value: number,
    flag: string,
    note: string,
  ) {
    const m = mods[id];
    const previous = m.flags!.get(flag) ?? (key === "pierce" ? 0 : 1);
    if (previous >= value) return;
    m.flags!.set(flag, value);
    if (key === "speed") m.speed *= value / previous;
    else if (key === "power") m.power *= value / previous;
    else if (key === "pierce") m.pierce = Math.max(m.pierce, value);
    m.notes.push(note);
  }
  function rel(a: string, b: string, kind: string, label: string) {
    relations.push({ from: a, to: b, kind, label });
  }
  for (const g of info.groups) {
    for (const id of g.items) {
      if (g.kind === "button-group")
        bonus(id, "speed", 1.12, "button-group", "ボタングループ：速度 +12%");
      if (g.kind === "search-form")
        bonus(id, "power", 1.3, "search-form", "検索フォーム：威力 +30%");
      if (g.kind === "nav-row" || g.kind === "nav-menu")
        bonus(id, "speed", 1.15, "nav", "ナビゲーション：速度 +15%");
      if (
        g.kind === "commerce-stack" &&
        ["am_buy", "am_oneclick"].includes(byId[id].type)
      )
        bonus(id, "power", 1.2, "product-stack", "商品購入欄：威力 +20%");
    }
  }
  for (const [child, parent] of Object.entries(info.parents))
    if (byId[parent].type === "gov_form") {
      bonus(child, "speed", 1.2, "form", "フォーム内：速度 +20%");
      rel(parent, child, "structure", "フォーム内");
    }
  for (const a of board) {
    for (const id of info.near[a.id] || []) {
      const b = byId[id];
      if (!b) continue;
      const db = P[b.type],
        m = mods[id];
      if (
        a.type === "yt_speed" &&
        db.tags.includes("video") &&
        (info.member[a.id] || [])
          .find((g) => g.kind === "media-stack")
          ?.items.includes(id)
      ) {
        m.speed = Math.max(m.speed, 2);
        m.notes.push("再生速度：2×");
        rel(a.id, id, "speed", "2×");
      }
      if (a.type === "am_prime" && db.cd && db.tags.includes("commerce")) {
        bonus(id, "speed", 1.5, "prime", "Prime：速度 +50%");
        rel(a.id, id, "speed", "Prime");
      }
      if (
        a.type === "gov_font" &&
        db.kind === "attack" &&
        db.tags.includes("text")
      ) {
        bonus(id, "power", 1.5, "font", "文字サイズ：威力 +50%");
        rel(a.id, id, "power", "文字");
      }
      if (
        a.type === "go_suggest" &&
        db.kind === "attack" &&
        db.tags.includes("text")
      ) {
        bonus(
          id,
          "power",
          b.type === "go_instant" ? 1.45 : 1.4,
          "suggest",
          "サジェスト：威力 +40%",
        );
        rel(a.id, id, "power", "候補");
      }
      if (
        a.type === "go_translate" &&
        db.kind === "attack" &&
        db.tags.includes("text") &&
        db.faction !== "google"
      ) {
        bonus(id, "power", 1.25, "translate", "翻訳：威力 +25%");
        rel(a.id, id, "power", "翻訳");
      }
      if (
        a.type === "go_instant" &&
        db.kind === "attack" &&
        db.tags.includes("text")
      ) {
        bonus(id, "power", 1.45, "suggest", "インスタント検索：威力 +45%");
        rel(a.id, id, "power", "候補");
      }
      if (
        a.type === "am_quantity" &&
        ["am_buy", "am_product", "am_oneclick"].includes(b.type)
      )
        bonus(id, "power", 1.2, "quantity", "数量：威力 +20%");
      if (
        a.type === "am_rating" &&
        db.kind === "attack" &&
        db.tags.includes("commerce")
      )
        bonus(id, "power", 1.2, "rating", "レビュー：威力 +20%");
      if (a.type === "go_tabs" && db.tags.includes("search") && db.cd)
        bonus(id, "speed", 1.2, "tabs", "検索タブ：速度 +20%");
      if (a.type === "gov_breadcrumb" && db.tags.includes("document") && db.cd)
        bonus(id, "speed", 1.15, "breadcrumb", "パンくず：速度 +15%");
      if (
        a.type === "yt_progress" &&
        db.layout === "media" &&
        db.tags.includes("video") &&
        (info.member[id] || []).some(
          (g) => g.kind === "media-stack" && g.items.includes(a.id),
        )
      ) {
        bonus(id, "power", 1.25, "seek", "シークバー：威力 +25%");
        rel(a.id, id, "power", "再生進捗");
      }
      if (a.type === "yt_caption" && db.tags.includes("video")) {
        bonus(id, "pierce", 0.25, "caption", "字幕：25%貫通");
        rel(a.id, id, "power", "字幕");
      }
      if (["yt_ad", "yt_sub"].includes(a.type) && db.tags.includes("video"))
        rel(id, a.id, "income", "再生 → 収益");
      if (a.type === "go_ads" && db.tags.includes("text") && db.cd)
        rel(id, a.id, "income", "文字 → 収益");
      if (a.type === "ab_counter" && db.cd) rel(id, a.id, "income", "4回 → $1");
    }
  }
  for (const p of board) {
    if (p.type === "yt_embed")
      bonus(p.id, "power", 1.25, "seek", "内蔵シークバー：威力 +25%");
    if (p.type === "go_instant")
      bonus(p.id, "power", 1.45, "suggest", "内蔵サジェスト：威力 +45%");
  }
  for (const p of board) {
    const d = P[p.type],
      m = mods[p.id];
    if (d.faction === "retro" && counts.retro >= 3) m.speed *= 1.15;
    if (d.tags.includes("video") && counts.youtube >= 3) m.power *= 1.15;
    if (m.speed > 2 || m.power > 3)
      capWaste.push({
        id: p.id,
        speed: Math.max(0, m.speed - 2),
        power: Math.max(0, m.power - 3),
      });
    m.speed = Math.min(2, m.speed);
    m.power = Math.min(3, m.power);
    delete m.flags;
  }
  let navigation: AnalysisWithCaps["navigation"];
  if (
    combatVersion === "combat-v3" ||
    navigationExperiment(experimentalRules)
  ) {
    const entries = board.filter(
      (p) =>
        P[p.type].kind === "attack" && P[p.type].tags.includes("navigation"),
    );
    const slowdown =
      1 +
      NAVIGATION_ATTENTION.extraEntryWeight *
        Math.max(0, entries.length - NAVIGATION_ATTENTION.fullSpeedEntries);
    const highlightedLinks = board
      .filter((p) => p.type === "ab_link")
      .slice(0, NAVIGATION_ATTENTION.highlightedLinks)
      .map((p) => p.id);
    navigation = { entries: entries.length, slowdown, highlightedLinks };
    for (const p of entries) {
      mods[p.id].speed /= slowdown;
      if (slowdown > 1)
        mods[p.id].notes.push(
          `リンク${entries.length}個で注目が分散。発動間隔 ×${slowdown.toFixed(2)}`,
        );
      if (p.type === "ab_link")
        mods[p.id].notes.push(
          highlightedLinks.includes(p.id)
            ? "ページ先頭2リンクの余白強調"
            : "余白強調はページ先頭2リンクで共有",
        );
    }
  }
  const result: AnalysisWithCaps = {
    ...info,
    ...(navigation ? { navigation } : {}),
    capWaste,
    mods,
    relations,
    counts,
    sets: Object.entries(counts)
      .filter(([, n]) => n >= 3)
      .map(([faction, count]) => ({
        faction,
        count,
        text: D.FACTIONS[faction].set,
      })),
  };
  for (const p of board) {
    if (
      (P[p.type].tags.includes("economy") && !consumers.has(p.type)) ||
      ["gov_submit", "gov_onestop"].includes(p.type)
    ) {
      const q = selectRoute(board, result.near, p);
      if (q)
        rel(
          p.id,
          q.id,
          "conversion",
          q.type === "yt_tip"
            ? "$3 → シールド8"
            : q.type === "ad_popup"
              ? "$3 → 妨害"
              : q.type === "am_oneclick"
                ? "$3 → 20"
                : "$3 → 15",
        );
    }
    if (p.type === "go_cache") {
      const q = strongest(
        board.filter((q) => (result.near[p.id] ?? []).includes(q.id)),
        result,
      );
      if (q) rel(p.id, q.id, "cache", "次の妨害を1回防ぐ");
    }
  }
  return result;
}
export type ExperimentalBattleOptions = BattleOptions & {
  experimentalRules?: ExperimentalRules;
  combatVersion?: CombatRulesVersion;
};
class Battle {
  readonly experimentalRules: ExperimentalRules;
  readonly combatVersion: CombatRulesVersion;
  readonly audience: Record<SideName, AudienceState> | null;
  ticks: number;
  elapsed: number;
  accumulator: number;
  events: BattleEvent[];
  result: BattleResult | null;
  eventCount: number;
  player: BattleSide;
  enemy: BattleSide;
  metrics: Record<SideName, CombatMetrics> = {
    player: emptyMetrics(),
    enemy: emptyMetrics(),
  };
  states: Record<SideName, Map<string, PartState>> = {
    player: new Map(),
    enemy: new Map(),
  };
  rateBudget: Record<SideName, number> = {
    player: RATE_LIMIT.capacity,
    enemy: RATE_LIMIT.capacity,
  };
  readonly history: Record<SideName, VersionHistory> = {
    player: new VersionHistory(),
    enemy: new VersionHistory(),
  };
  historyView(name: SideName) {
    const side = name === "player" ? this.player : this.enemy;
    return this.history[name].visible(this.ticks, side.hp, side.maxHp);
  }
  pendingHits: (() => void)[] | null = null;
  constructor(
    playerBoard: Item[],
    enemyBoard: Item[],
    options: ExperimentalBattleOptions = {},
  ) {
    this.combatVersion = options.combatVersion ?? BATTLE_RULES_VERSION;
    if (!SUPPORTED_COMBAT_VERSIONS.includes(this.combatVersion))
      throw new Error("Unknown combat rules version");
    this.experimentalRules = options.experimentalRules ?? null;
    if (
      this.experimentalRules &&
      !EXPERIMENTAL_RULESETS.includes(this.experimentalRules)
    )
      throw new Error("Unknown experimental combat rules");
    this.audience = audienceExperiment(this.experimentalRules)
      ? { player: new AudienceState(), enemy: new AudienceState() }
      : null;
    this.ticks = 0;
    this.elapsed = 0;
    this.accumulator = 0;
    this.events = [];
    this.result = null;
    this.eventCount = 0;
    this.player = this._side(
      "player",
      playerBoard,
      options.playerHp || 400,
      options.playerAdmin,
      options.playerCapacity,
    );
    this.enemy = this._side(
      "enemy",
      enemyBoard,
      options.enemyHp || 400,
      options.enemyAdmin,
      options.enemyCapacity,
    );
    for (const side of [this.player, this.enemy]) {
      const enemy = side === this.player ? this.enemy : this.player;
      for (const p of side.parts) {
        if (p.type === "ad_popup")
          this.states[side.name].get(p.id)!.target = this._strongest(
            enemy.parts,
            enemy,
          )?.id;
        if (p.type === "go_cache")
          this.states[side.name].get(p.id)!.target = this._strongest(
            this._near(side, p),
            side,
          )?.id;
      }
    }
  }
  _strongest(parts: BattlePart[], side: BattleSide) {
    return strongest(parts, side.info);
  }
  // Back-office operations run on their own clock, independent of the page's components.
  _admin(side: BattleSide, target: BattleSide) {
    const a = side.admin,
      st = side.adminState,
      t = this.ticks;
    if (a.has("moderator") && t % 80 === 40) {
      const gain = Math.max(0, Math.min(60 - side.shield, 6));
      side.shield += gain;
      this.metrics[side.name].shielding += gain;
      this.metrics[side.name].shieldWaste += 6 - gain;
      st.moderator = (st.moderator || 0) + 1;
      this.emit({
        kind: "admin",
        side: side.name,
        admin: "moderator",
        value: gain,
      });
    }
    if (a.has("sns") && t % 100 === 60) {
      const gain = Math.max(0, Math.min(side.maxHp - side.hp, 6));
      side.hp += gain;
      this.metrics[side.name].healing += gain;
      this.metrics[side.name].overheal += 6 - gain;
      st.sns = (st.sns || 0) + gain;
      this.emit({ kind: "admin", side: side.name, admin: "sns", value: gain });
    }
    if (a.has("troll") && t % 70 === 35) {
      if (this._captcha(target)) {
        st.trollBlocked = (st.trollBlocked || 0) + 1;
        target.adminState.captcha = (target.adminState.captcha || 0) + 1;
        this.emit({
          kind: "admin",
          side: side.name,
          admin: "troll",
          blocked: true,
          target: target.name,
        });
      } else {
        st.troll = (st.troll || 0) + 1;
        this._hit(side, target, { damage: 0 }, 4, 1, "troll");
      }
    }
    if (
      a.has("sakura") &&
      side.bots &&
      !st.exposed &&
      t === 160 &&
      (this._captcha(target) || target.admin.has("moderator"))
    ) {
      st.exposed = true;
      side.bots = 0;
      target.adminState.captcha =
        (target.adminState.captcha || 0) + (this._captcha(target) ? 1 : 0);
      this.emit({
        kind: "admin",
        side: side.name,
        admin: "sakura",
        exposed: true,
      });
      this._hit(target, side, { damage: 0 }, 18, 1, "exposed");
    }
  }
  _captcha(side: BattleSide) {
    return (
      side.admin.has("captcha") ||
      side.parts.some((p) => p.type === "go_recaptcha")
    );
  }
  _retarget(side: BattleSide, target: BattleSide) {
    if (this.ticks % 120 !== 60) return;
    for (const p of side.parts.filter((q) => q.type === "ad_retarget")) {
      if (this._captcha(target)) {
        target.adminState.captcha = (target.adminState.captcha || 0) + 1;
        this.emit({
          kind: "admin",
          side: side.name,
          admin: "troll",
          blocked: true,
          target: target.name,
        });
      } else this._hit(side, target, p, 5, 1, "troll");
    }
  }
  // A page heavier than its server's capacity renders slowly: every UI fires later, and impatient visitors leave.
  _side(
    name: SideName,
    board: Item[],
    hp: number,
    admin: string[] = [],
    capacity = Infinity,
  ): BattleSide {
    const info = analyze(board, this.experimentalRules, this.combatVersion),
      items = info.board.map((p) => ({ ...p })),
      adm = new Set(admin || []),
      lag =
        Number.isFinite(capacity) && capacity > 0
          ? 1 + Math.max(0, info.load / capacity - 1) * 0.6
          : 1;
    if (adm.has("server")) hp = Math.round(hp * 1.25);
    const side: BattleSide = {
      name,
      board: items,
      info,
      maxHp: hp,
      hp,
      shield: info.counts.gov >= 3 ? 12 : 0,
      income: 0,
      lastBonus: -100,
      parts: [],
      damage: 0,
      admin: adm,
      adminState: {},
      bots: adm.has("sakura") ? 16 : 0,
      load: info.load,
      capacity,
      lag,
    };
    side.parts = items.map((p) => {
      const d = P[p.type],
        m = info.mods[p.id],
        period = d.cd
          ? d.kind === "cache"
            ? Math.ceil((d.cd / m.speed) * lag * 20) / 20
            : (d.cd / m.speed) * lag
          : 0;
      return {
        ...p,
        period,
        remaining:
          p.type === "go_cache"
            ? 0
            : period
              ? period *
                0.5 *
                (d.faction === "google" && info.counts.google >= 3 ? 0.75 : 1)
              : 0,
        power: m.power,
        speed: m.speed,
        pierce: m.pierce,
        fires: 0,
        watch: 0,
        charge: 0,
        damage: 0,
        earned: 0,
        protected: 0,
        healed: 0,
      };
    });
    for (const p of side.parts)
      this.states[name].set(p.id, {
        coveredUntil: 0,
        immuneUntil: 0,
        cache: p.type === "go_cache",
        cacheAt: 0,
      });
    return side;
  }
  emit(event: BattleEventInput) {
    this.eventCount++;
    this.events.push(
      Object.assign({ kind: event.kind, time: this.elapsed }, event),
    );
  }
  step(dt: number) {
    if (!Number.isFinite(dt) || dt < 0) throw new Error("Invalid time step");
    if (this.result) return [];
    this.events = [];
    this.eventCount = 0;
    this.accumulator += Math.min(dt, 2);
    while (this.accumulator + 1e-9 >= 0.05 && !this.result) {
      this.accumulator -= 0.05;
      this.ticks++;
      this.elapsed = this.ticks * 0.05;
      this._tick();
    }
    return this.events;
  }
  _near(side: BattleSide, p: BattlePart) {
    const ids = side.info.near[p.id] || [];
    return side.parts.filter((q) => ids.includes(q.id));
  }
  _tick() {
    for (const side of [this.player, this.enemy]) {
      const h = side.parts.find((p) => p.type === "go_history");
      if (h && this.history[side.name].expire(this.ticks))
        this.emit({
          kind: "history",
          side: side.name,
          id: h.id,
          action: "expire",
          value: 0,
        });
    }
    for (const name of ["player", "enemy"] as const)
      this.rateBudget[name] = Math.min(
        RATE_LIMIT.capacity,
        this.rateBudget[name] + RATE_LIMIT.refillPerTick,
      );
    if (this.audience)
      for (const side of [this.player, this.enemy]) {
        const expired = this.audience[side.name].advance(this.ticks);
        if (expired)
          this.emit({
            kind: "audience",
            side: side.name,
            id: side.parts.find((p) => p.type === "yt_sub")?.id,
            action: "loyalty-expired",
            value: expired,
            remaining: 0,
          });
      }
    const due: { side: BattleSide; target: BattleSide; p: BattlePart }[] = [];
    this.pendingHits = [];
    for (const side of [this.player, this.enemy]) {
      const target = side === this.player ? this.enemy : this.player;
      for (const p of side.parts) {
        const state = this.states[side.name].get(p.id)!;
        if (state.coveredUntil > 0 && state.coveredUntil === this.ticks)
          this.emit({
            kind: "control",
            side: side.name,
            id: p.id,
            target: side.name,
            to: p.id,
            action: "release",
          });
        if (p.type === "go_cache") {
          p.remaining = state.cache
            ? 0
            : Math.max(0, (state.cacheAt - this.ticks) / 20);
          if (!state.cache && this.ticks >= state.cacheAt) {
            state.cache = true;
            this.emit({
              kind: "control",
              side: side.name,
              id: p.id,
              target: side.name,
              to: state.target ?? p.id,
              action: "cache-ready",
            });
          }
          continue;
        }
        if (p.type === "yt_tip") this._convert(side, target, p);
        // A tick integrates the interval ending now, including the last covered interval.
        if (
          !p.period ||
          (state.coveredUntil > 0 && this.ticks <= state.coveredUntil)
        )
          continue;
        p.remaining -= 0.05;
        if (p.remaining <= 1e-9) due.push({ side, target, p });
      }
    }
    const rank = (p: BattlePart) =>
      ({
        interference: 0,
        shield: 1,
        heal: 1,
        restore: 1,
        income: 2,
        attack: 3,
        echo: 4,
      })[P[p.type].kind] ?? 5;
    due.sort((a, b) => rank(a.p) - rank(b.p) || compareParts(a.p, b.p));
    for (const { side, target, p } of due) {
      if (this.states[side.name].get(p.id)!.coveredUntil > this.ticks) continue;
      p.remaining += p.period;
      this._activate(side, target, p);
    }
    this._admin(this.player, this.enemy);
    this._admin(this.enemy, this.player);
    this._retarget(this.player, this.enemy);
    this._retarget(this.enemy, this.player);
    // All preparations finish before damage lands, so neither seat heals after the other's hit.
    const hits = this.pendingHits!;
    this.pendingHits = null;
    for (const apply of hits) apply();
    if (this.ticks % 20 === 10)
      for (const s of [this.player, this.enemy])
        if (s.lag > 1 && s.hp > 0) {
          const n =
            Math.round(Math.min(12, (s.load - s.capacity) * 0.45) * 10) / 10;
          s.hp = Math.max(0, s.hp - n);
          s.lagLoss = (s.lagLoss || 0) + n;
          this.emit({ kind: "lag", side: s.name, value: n });
        }
    if (this.ticks >= 900 && this.ticks % 20 === 0) {
      const n = 8 + Math.floor((this.elapsed - 45) * 2);
      for (const s of [this.player, this.enemy]) {
        s.hp = Math.max(0, s.hp - n);
        this.emit({ kind: "overload", side: s.name, value: n });
      }
    }
    for (const s of [this.player, this.enemy])
      if (s.hp <= 0 && s.admin.has("backup") && !s.adminState.restored) {
        s.adminState.restored = true;
        s.hp = Math.round(s.maxHp * 0.3);
        this.emit({ kind: "admin", side: s.name, admin: "backup" });
      }
    if (this.player.hp <= 0 || this.enemy.hp <= 0 || this.ticks >= 1200) {
      let winner: Winner;
      if (this.player.hp <= 0 && this.enemy.hp <= 0) winner = "draw";
      else if (this.enemy.hp <= 0) winner = "player";
      else if (this.player.hp <= 0) winner = "enemy";
      else {
        const a = this.player.hp / this.player.maxHp,
          b = this.enemy.hp / this.enemy.maxHp;
        winner = Math.abs(a - b) < 1e-8 ? "draw" : a > b ? "player" : "enemy";
      }
      this.result = { winner, time: this.elapsed, income: this.player.income };
      this.emit({ kind: "end", ...this.result });
    }
  }
  _activate(side: BattleSide, target: BattleSide, p: BattlePart) {
    const d = P[p.type],
      near = this._near(side, p);
    if (this.states[side.name].get(p.id)!.coveredUntil > this.ticks) return;
    if (p.type === "ad_popup") {
      this._obstruct(side, target, p);
      return;
    }
    if (p.type === "go_cache") return;
    if (p.type === "go_history") {
      const value = this.history[side.name].consume(
        this.ticks,
        side.hp,
        side.maxHp,
      );
      if (!value) return;
      side.hp += value;
      p.healed += value;
      p.fires++;
      this.metrics[side.name].healing += value;
      this.emit({
        kind: "history",
        side: side.name,
        id: p.id,
        from: this.history[side.name].revision?.sourceId,
        action: "restore",
        value,
      });
      this.emit({ kind: "fire", side: side.name, id: p.id, type: p.type });
      this.emit({ kind: "heal", side: side.name, id: p.id, value });
      this._notify(side, target, p);
      return;
    }
    p.fires++;
    this.emit({ kind: "fire", side: side.name, id: p.id, type: p.type });
    if (d.kind === "attack") {
      this._attack(side, target, p, 1);
      if (p.type === "gov_onestop") this._earn(side, target, p, 1);
      if (p.type === "ab_ticker") {
        const q = side.parts
          .filter(
            (c) =>
              c !== p &&
              P[c.type].kind === "attack" &&
              ((c.x >= p.x + p.w && Math.abs(c.y - p.y) < c.h) ||
                (c.y >= p.y + p.h && Math.abs(c.x - p.x) < p.w)),
          )
          .sort(
            (a, b) =>
              Math.hypot(a.x - p.x, a.y - p.y) -
              Math.hypot(b.x - p.x, b.y - p.y),
          )[0];
        if (q) {
          this._replay(side, target, p, q, 0.4);
        }
      }
      if (
        p.type === "gov_submit" &&
        side.info.parents[p.id] &&
        side.parts.find((q) => q.id === side.info.parents[p.id])?.type ===
          "gov_form"
      )
        this._earn(side, target, p, 1);
    } else if (d.kind === "shield") {
      let value = d.value;
      if (
        p.type === "ab_table" &&
        side.parts.some(
          (q) =>
            side.info.parents[q.id] === p.id && P[q.type].tags.includes("text"),
        )
      )
        value += 3;
      if (
        p.type === "yt_notify" &&
        near.some(
          (q) =>
            P[q.type].layout === "media" && P[q.type].tags.includes("video"),
        )
      )
        value += 2;
      if (
        p.type === "ab_hr" &&
        near.some((q) => P[q.type].tags.includes("text"))
      )
        value += 2;
      const gain = Math.max(0, Math.min(60 - side.shield, value));
      side.shield += gain;
      p.protected += gain;
      this.metrics[side.name].shielding += gain;
      this.metrics[side.name].shieldWaste += value - gain;
      this.emit({ kind: "shield", side: side.name, id: p.id, value: gain });
    } else if (d.kind === "heal") {
      const value =
          d.value +
          (p.type === "gov_notice" &&
          near.some((q) => P[q.type].tags.includes("document"))
            ? 2
            : 0) +
          (p.type === "rd_thread" &&
          new Set(
            side.parts
              .filter(
                (q) =>
                  side.info.parents[q.id] === p.id &&
                  P[q.type].kind === "attack" &&
                  P[q.type].tags.includes("text"),
              )
              .map((q) => q.type),
          ).size >= 2
            ? 4
            : 0),
        gain = Math.min(side.maxHp - side.hp, value);
      side.hp += gain;
      p.healed += gain;
      this.metrics[side.name].healing += gain;
      this.metrics[side.name].overheal += value - gain;
      this.emit({ kind: "heal", side: side.name, id: p.id, value: gain });
      if (p.type === "ab_blog") this._earn(side, target, p, 1);
    } else if (d.kind === "income") {
      if (
        p.type === "ab_mail" ||
        p.type === "am_newsletter" ||
        near.some((q) =>
          ["am_buy", "am_product", "am_oneclick"].includes(q.type),
        )
      )
        this._earn(side, target, p, d.value);
    } else if (d.kind === "echo") {
      let candidates = near.filter((q) => P[q.type].kind === "attack");
      if (d.replayTags?.length)
        candidates = candidates.filter((q) =>
          d.replayTags!.some((tag) => P[q.type].tags.includes(tag)),
        );
      if (p.type === "yt_autoplay")
        candidates = candidates.filter((q) => P[q.type].tags.includes("video"));
      if (p.type === "go_page")
        candidates = candidates.filter((q) => P[q.type].tags.includes("text"));
      if (p.type === "gov_page")
        candidates = candidates.filter((q) =>
          P[q.type].tags.includes("document"),
        );
      if (p.type === "ab_marquee")
        candidates = side.parts
          .filter(
            (q) =>
              P[q.type].kind === "attack" &&
              ((q.x >= p.x + p.w && Math.abs(q.y - p.y) < q.h) ||
                (q.y >= p.y + p.h && Math.abs(q.x - p.x) < p.w)),
          )
          .sort(
            (a, b) =>
              Math.hypot(a.x - p.x, a.y - p.y) -
              Math.hypot(b.x - p.x, b.y - p.y),
          );
      const q = candidates[0];
      if (q) this._replay(side, target, p, q, d.value);
    }
    // Replay controllers are not natural attacks and never manufacture revenue.
    if (d.kind !== "echo") this._notify(side, target, p);
  }
  _obstruct(side: BattleSide, target: BattleSide, p: BattlePart) {
    const id = this.states[side.name].get(p.id)!.target;
    const q = target.parts.find((q) => q.id === id);
    if (!q || p.charge < CONTROL.cost) return;
    const state = this.states[target.name].get(q.id)!;
    if (state.immuneUntil > this.ticks || state.coveredUntil > this.ticks)
      return;
    p.charge -= CONTROL.cost;
    p.fires++;
    this.metrics[side.name].spent += CONTROL.cost;
    this.emit({
      kind: "conversion",
      side: side.name,
      id: p.id,
      to: p.id,
      value: CONTROL.cost,
      action: "spend",
    });
    this.emit({ kind: "fire", side: side.name, id: p.id, type: p.type });
    const cache = target.parts.find(
      (c) =>
        c.type === "go_cache" &&
        this.states[target.name].get(c.id)!.cache &&
        this.states[target.name].get(c.id)!.target === q.id,
    );
    if (cache) {
      const c = this.states[target.name].get(cache.id)!;
      c.cache = false;
      c.cacheAt = this.ticks + Math.ceil(cache.period * 20);
      cache.remaining = cache.period;
      this.metrics[target.name].prevented++;
      this.emit({
        kind: "control",
        side: side.name,
        id: p.id,
        target: target.name,
        to: q.id,
        action: "blocked",
      });
      return;
    }
    state.coveredUntil = this.ticks + CONTROL.durationTicks;
    state.immuneUntil = state.coveredUntil + CONTROL.immunityTicks;
    this.emit({
      kind: "control",
      side: side.name,
      id: p.id,
      target: target.name,
      to: q.id,
      action: "cover",
      duration: CONTROL.durationTicks / 20,
    });
  }
  _replay(
    side: BattleSide,
    target: BattleSide,
    source: BattlePart,
    p: BattlePart,
    scale: number,
  ) {
    const state = this.states[side.name].get(p.id)!;
    if (!state.payload || state.coveredUntil > this.ticks) return;
    this.metrics[side.name].replays++;
    this.emit({ kind: "echo", side: side.name, id: source.id, to: p.id });
    this.emit({
      kind: "fire",
      side: side.name,
      id: p.id,
      type: p.type,
      echo: true,
    });
    this._hit(
      side,
      target,
      p,
      Math.round(state.payload.value * scale * 10) / 10,
      state.payload.pierce,
    );
  }
  _attack(side: BattleSide, target: BattleSide, p: BattlePart, scale: number) {
    const d = P[p.type];
    let value = d.value;
    if (p.type === "ab_link") value += whitespaceBonus(p, side.info);
    if (p.type === "go_search")
      value +=
        Math.min(
          4,
          new Set(
            this._near(side, p)
              .map((q) => P[q.type].faction)
              .filter((f) => f !== "google"),
          ).size,
        ) * 2;
    if (p.type === "go_lucky" && p.fires % 3 === 0) value *= 3;
    if (p.type === "am_buy" || p.type === "am_oneclick")
      value += Math.min(8, Math.floor(side.income / 5));
    if (p.type === "yt_like") value += Math.min(5, p.fires - 1);
    const payload = {
      value: Math.round(value * p.power * scale * 10) / 10,
      pierce: Math.max(
        p.pierce,
        p.type === "gov_pdf" ? 0.5 : p.type === "gov_onestop" ? 0.3 : 0,
      ),
    };
    this.states[side.name].get(p.id)!.payload = payload;
    this.metrics[side.name].naturalAttacks++;
    this._hit(side, target, p, payload.value, payload.pierce);
  }
  _hit(
    side: BattleSide,
    target: BattleSide,
    p: Pick<BattlePart, "damage"> & Partial<Pick<BattlePart, "id">>,
    value: number,
    pierce = 0,
    admin?: string,
  ) {
    if (this.pendingHits) {
      this.pendingHits.push(() =>
        this._hit(side, target, p, value, pierce, admin),
      );
      return;
    }
    if (target.admin?.has("cdn")) {
      const saved = value * 0.12;
      value -= saved;
      target.adminState.cdn = (target.adminState.cdn || 0) + saved;
    }
    // Preserve the ORIGINAL piercing portion; a rate limiter can only reject ordinary requests.
    const direct = value * pierce;
    const limiter = target.parts.find((q) => q.type === "gov_rate_limit");
    const limited = limiter
      ? Math.min(
          P[limiter.type].value,
          value - direct,
          this.rateBudget[target.name],
        )
      : 0;
    if (limiter && limited > 0) {
      value -= limited;
      this.rateBudget[target.name] = Math.max(
        0,
        this.rateBudget[target.name] - limited,
      );
      this.metrics[target.name].rateLimited += limited;
      this.emit({
        kind: "rate-limit",
        side: target.name,
        id: limiter.id,
        from: p.id,
        value: limited,
        remaining: this.rateBudget[target.name],
      });
    }
    const blocked = Math.min(target.shield, value - direct);
    target.shield -= blocked;
    let hit = value - blocked;
    if (this.audience) {
      const state = this.audience[target.name];
      const kept = state.retain(hit, direct, target.hp);
      hit -= kept.reduction;
      if (kept.actual)
        this.emit({
          kind: "audience",
          side: target.name,
          id: target.parts.find((q) => q.type === "yt_sub")?.id,
          from: p.id,
          action: "loyalty-retained",
          value: kept.actual,
          remaining: state.loyalty,
        });
    }
    const actual = Math.min(target.hp, hit),
      m = this.metrics[side.name];
    m.hpDamage += actual;
    m.shieldDamage += blocked;
    m.overkill += Math.max(0, hit - actual);
    if (actual > 0 && m.firstImpact === null) m.firstImpact = this.elapsed;
    target.hp = Math.max(0, target.hp - hit);
    const history = target.parts.find((q) => q.type === "go_history");
    const source = p.id ? side.parts.find((q) => q.id === p.id) : undefined;
    if (history && source) {
      const eligible = Math.max(0, actual - Math.min(actual, direct));
      this.history[target.name].capture(
        eligible,
        source.id,
        P[source.type].name,
        this.ticks,
      );
      this.emit({
        kind: "history",
        side: target.name,
        id: history.id,
        from: source.id,
        action: eligible > 0 ? "record" : "clear",
        value: 0,
      });
    }
    p.damage += value;
    side.damage += value;
    this.emit({
      kind: "damage",
      side: side.name,
      target: target.name,
      id: p.id,
      value,
      hit,
      blocked,
      pierce: pierce > 0,
      admin,
    });
  }
  _notify(side: BattleSide, target: BattleSide, source: BattlePart) {
    const sd = P[source.type];
    const nearby = this._near(side, source);
    const membership = nearby.find((p) => p.type === "yt_sub");
    if (
      this.audience &&
      membership &&
      sd.kind === "attack" &&
      sd.tags.includes("video")
    ) {
      const state = this.audience[side.name],
        gained = state.view(this.ticks);
      if (gained)
        this.emit({
          kind: "audience",
          side: side.name,
          id: membership.id,
          from: source.id,
          action: "loyalty-earned",
          value: gained,
          remaining: state.loyalty,
        });
    }
    for (const p of nearby) {
      if (
        p.type === "ad_retarget" &&
        sd.cd &&
        (sd.tags.includes("video") || sd.tags.includes("text"))
      ) {
        this.emit({ kind: "fire", side: side.name, id: p.id, type: p.type });
        this._earn(side, target, p, 1);
        if (P[p.type].tags.includes("ad")) this._adExposure(side, p, source);
      }
      if (p.type === "yt_ad" && sd.tags.includes("video")) {
        this.emit({ kind: "fire", side: side.name, id: p.id, type: p.type });
        this._earn(side, target, p, 1);
        if (P[p.type].tags.includes("ad")) this._adExposure(side, p, source);
      }
      if (p.type === "yt_sub" && sd.tags.includes("video")) {
        p.watch++;
        if (p.watch >= 3) {
          p.watch -= 3;
          this.emit({ kind: "fire", side: side.name, id: p.id, type: p.type });
          this._earn(
            side,
            target,
            p,
            this.audience ? AUDIENCE_RULES.membershipIncome : 2,
          );
        }
      }
      if (p.type === "go_ads" && sd.tags.includes("text") && sd.cd) {
        this.emit({ kind: "fire", side: side.name, id: p.id, type: p.type });
        this._earn(side, target, p, 1);
        if (P[p.type].tags.includes("ad")) this._adExposure(side, p, source);
      }
      if (p.type === "ab_counter" && sd.cd) {
        p.watch++;
        if (p.watch >= 4) {
          p.watch -= 4;
          this.emit({ kind: "fire", side: side.name, id: p.id, type: p.type });
          this._earn(side, target, p, 1);
          if (P[p.type].tags.includes("ad")) this._adExposure(side, p, source);
        }
      }
    }
  }
  _adExposure(side: BattleSide, ad: BattlePart, source: BattlePart) {
    if (!this.audience) return;
    const group = (side.info.member[source.id] || [])
      .filter((g) =>
        [
          "media-stack",
          "search-form",
          "search-panel",
          "commerce-stack",
          "nav-row",
          "nav-menu",
        ].includes(g.kind),
      )
      .sort((a, b) => b.items.length - a.items.length)[0];
    const module = group
      ? (side.parts
          .filter((p) => group.items.includes(p.id))
          .sort(compareParts)[0]?.id ?? source.id)
      : source.id;
    const state = this.audience[side.name],
      loss = state.ad(module, this.ticks);
    if (!loss) return;
    const apply = () => {
      const actual = Math.min(side.hp, loss);
      side.hp -= actual;
      state.recordChurn(actual);
      if (actual)
        this.emit({
          kind: "audience",
          side: side.name,
          id: ad.id,
          from: source.id,
          action: "churn",
          value: actual,
          remaining: state.loyalty,
        });
    };
    if (this.pendingHits) this.pendingHits.push(apply);
    else apply();
  }
  _earn(side: BattleSide, target: BattleSide, p: BattlePart, base: number) {
    let value = side.admin?.has("adnet") ? base * 1.5 : base;
    if (side.info.counts.amazon >= 3 && this.elapsed - side.lastBonus >= 1) {
      value++;
      side.lastBonus = this.elapsed;
    }
    side.income += value;
    p.earned += value;
    this.emit({ kind: "income", side: side.name, id: p.id, value });
    const selected = selectRoute(side.parts, side.info.near, p);
    if (!selected) {
      this.metrics[side.name].unconverted += value;
      return;
    }
    const capacity =
      selected.type === "yt_tip" || selected.type === "ad_popup"
        ? 2 * CONTROL.cost
        : Infinity;
    const accepted = Math.max(0, Math.min(value, capacity - selected.charge));
    selected.charge += accepted;
    this.metrics[side.name].routed += accepted;
    this.metrics[side.name].unconverted += value - accepted;
    if (accepted > 0)
      this.emit({
        kind: "conversion",
        side: side.name,
        id: p.id,
        to: selected.id,
        value: accepted,
        action: "route",
      });
    this._convert(side, target, selected);
  }
  _convert(side: BattleSide, target: BattleSide, p: BattlePart) {
    if (!["am_cart", "am_oneclick", "yt_tip"].includes(p.type)) return;
    while (p.charge >= CONTROL.cost) {
      if (p.type === "yt_tip" && side.shield >= 60) break;
      p.charge -= CONTROL.cost;
      this.metrics[side.name].spent += CONTROL.cost;
      this.emit({
        kind: "conversion",
        side: side.name,
        id: p.id,
        to: p.id,
        value: CONTROL.cost,
        action: "spend",
      });
      p.fires++;
      this.emit({ kind: "fire", side: side.name, id: p.id, type: p.type });
      if (p.type === "yt_tip") {
        const gain = Math.min(60 - side.shield, P[p.type].value);
        side.shield += gain;
        p.protected += gain;
        this.metrics[side.name].shielding += gain;
        this.metrics[side.name].shieldWaste += P[p.type].value - gain;
        this.emit({ kind: "shield", side: side.name, id: p.id, value: gain });
      } else this._hit(side, target, p, p.type === "am_oneclick" ? 20 : 15);
    }
  }
}
export { Battle };
const api = {
  analyze,
  Battle,
  groupNames,
  makeItem: C.makeItem,
  placed: C.placed,
  canPlace: C.canPlace,
  touches: C.nearEdge,
};
export default api;
