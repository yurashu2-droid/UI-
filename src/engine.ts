import D from "./data.js";
import C from "./document.js";
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
const groupNames: Record<string, string> = {
  "button-group": "ボタングループ",
  "search-form": "検索フォーム",
  "nav-row": "ナビゲーション",
  "nav-menu": "縦ナビ",
  "media-stack": "動画プレイヤー",
  "commerce-stack": "商品購入欄",
  "search-stack": "検索パネル",
};
function analyze(input: Item[]): BattleAnalysis {
  const info = C.analyze(input),
    board = info.board,
    byId = Object.fromEntries(board.map((p) => [p.id, p])),
    mods: Record<string, Modifier & { flags?: Set<string> }> = {},
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
    mods[p.id] = { speed: 1, power: 1, pierce: 0, flags: new Set(), notes: [] };
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
    if (m.flags!.has(flag)) return;
    m.flags!.add(flag);
    if (key === "speed") m.speed *= value;
    else if (key === "power") m.power *= value;
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
      if (g.kind === "commerce-stack" && ["am_buy", "am_oneclick"].includes(byId[id].type))
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
      if (a.type === "yt_speed" && db.cd) {
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
        bonus(id, "power", 1.4, "suggest", "サジェスト：威力 +40%");
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
        bonus(id, "power", 1.45, "instant", "インスタント検索：威力 +45%");
        rel(a.id, id, "power", "候補");
      }
      if (a.type === "am_quantity" && ["am_buy", "am_product", "am_oneclick"].includes(b.type))
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
        (b.type === "yt_play" || b.type === "yt_embed") &&
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
      if (["am_cart", "am_oneclick"].includes(a.type) && db.tags.includes("economy"))
        rel(id, a.id, "cart", "$3 → 15");
    }
  }
  for (const p of board) {
    if (p.type === "yt_embed")
      bonus(p.id, "power", 1.25, "seek", "内蔵シークバー：威力 +25%");
    if (p.type === "go_instant")
      bonus(p.id, "power", 1.45, "instant", "内蔵サジェスト：威力 +45%");
  }
  for (const p of board) {
    const d = P[p.type],
      m = mods[p.id];
    if (d.faction === "retro" && counts.retro >= 3) m.speed *= 1.15;
    if (d.tags.includes("video") && counts.youtube >= 3) m.power *= 1.15;
    m.speed = Math.min(2, m.speed);
    m.power = Math.min(3, m.power);
    delete m.flags;
  }
  return {
    ...info,
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
}
class Battle {
  ticks: number;
  elapsed: number;
  accumulator: number;
  events: BattleEvent[];
  result: BattleResult | null;
  eventCount: number;
  player: BattleSide;
  enemy: BattleSide;
  constructor(
    playerBoard: Item[],
    enemyBoard: Item[],
    options: BattleOptions = {},
  ) {
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
  }
  // Back-office operations run on their own clock, independent of the page's components.
  _admin(side: BattleSide, target: BattleSide) {
    const a = side.admin,
      st = side.adminState,
      t = this.ticks;
    if (a.has("moderator") && t % 80 === 40) {
      const gain = Math.max(0, Math.min(60 - side.shield, 6));
      side.shield += gain;
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
        (target.adminState.captcha || 0) +
        (this._captcha(target) ? 1 : 0);
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
    return side.admin.has("captcha") || side.parts.some((p) => p.type === "go_recaptcha");
  }
  _retarget(side: BattleSide, target: BattleSide) {
    if (this.ticks % 120 !== 60) return;
    for (const p of side.parts.filter((q) => q.type === "ad_retarget")) {
      if (this._captcha(target)) {
        target.adminState.captcha = (target.adminState.captcha || 0) + 1;
        this.emit({ kind: "admin", side: side.name, admin: "troll", blocked: true, target: target.name });
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
    const info = analyze(board),
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
    side.parts = items.map((p, n) => {
      const d = P[p.type],
        m = info.mods[p.id],
        period = d.cd ? (d.cd / m.speed) * lag : 0;
      return {
        ...p,
        period,
        remaining: period
          ? Math.min(period, period * 0.5 + n * 0.025) *
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
    return side;
  }
  emit(event: BattleEventInput) {
    if (this.eventCount++ < 300) {
      this.events.push(
        Object.assign({ kind: event.kind, time: this.elapsed }, event),
      );
    }
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
      const target = side === this.player ? this.enemy : this.player;
      for (const p of side.parts) {
        if (!p.period) continue;
        p.remaining -= 0.05;
        if (p.remaining <= 1e-9) {
          p.remaining += p.period;
          this._activate(side, target, p);
        }
      }
    }
    this._admin(this.player, this.enemy);
    this._admin(this.enemy, this.player);
    this._retarget(this.player, this.enemy);
    this._retarget(this.enemy, this.player);
    if (this.ticks % 20 === 10)
      for (const s of [this.player, this.enemy])
        if (s.lag > 1 && s.hp > 0) {
          const n =
            Math.round(Math.min(12, (s.load - s.capacity) * 0.45) * 10) / 10;
          s.hp = Math.max(0, s.hp - n);
          s.lagLoss = (s.lagLoss || 0) + n;
          this.emit({ kind: "lag", side: s.name, value: n });
        }
    for (const s of [this.player, this.enemy])
      if (s.hp <= 0 && s.admin.has("backup") && !s.adminState.restored) {
        s.adminState.restored = true;
        s.hp = Math.round(s.maxHp * 0.3);
        this.emit({ kind: "admin", side: s.name, admin: "backup" });
      }
    if (this.ticks >= 900 && this.ticks % 20 === 0) {
      const n = 8 + Math.floor((this.elapsed - 45) * 2);
      for (const s of [this.player, this.enemy]) {
        s.hp = Math.max(0, s.hp - n);
        this.emit({ kind: "overload", side: s.name, value: n });
      }
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
          .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
        if (q) {
          q.fires++;
          this.emit({ kind: "echo", side: side.name, id: p.id, to: q.id });
          this.emit({ kind: "fire", side: side.name, id: q.id, type: q.type, echo: true });
          this._attack(side, target, q, 0.4);
          this._notify(side, target, q);
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
      if (p.type === "yt_notify" && near.some((q) => q.type === "yt_play"))
        value += 2;
      if (
        p.type === "ab_hr" &&
        near.some((q) => P[q.type].tags.includes("text"))
      )
        value += 2;
      const gain = Math.max(0, Math.min(60 - side.shield, value));
      side.shield += gain;
      p.protected += gain;
      this.emit({ kind: "shield", side: side.name, id: p.id, value: gain });
    } else if (d.kind === "heal") {
      const value =
          d.value +
          (p.type === "gov_notice" &&
          near.some((q) => P[q.type].tags.includes("document"))
            ? 2
            : 0),
        gain = Math.min(side.maxHp - side.hp, value);
      side.hp += gain;
      p.healed += gain;
      this.emit({ kind: "heal", side: side.name, id: p.id, value: gain });
      if (p.type === "ab_blog") this._earn(side, target, p, 1);
    } else if (d.kind === "income") {
      if (
        p.type === "ab_mail" ||
        p.type === "am_newsletter" ||
        near.some((q) => ["am_buy", "am_product", "am_oneclick"].includes(q.type))
      )
        this._earn(side, target, p, d.value);
    } else if (d.kind === "echo") {
      let candidates = near.filter((q) => P[q.type].kind === "attack");
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
      if (q) {
        q.fires++;
        this.emit({ kind: "echo", side: side.name, id: p.id, to: q.id });
        this.emit({
          kind: "fire",
          side: side.name,
          id: q.id,
          type: q.type,
          echo: true,
        });
        this._attack(side, target, q, d.value);
        this._notify(side, target, q);
      }
    }
    this._notify(side, target, p);
  }
  _attack(side: BattleSide, target: BattleSide, p: BattlePart, scale: number) {
    const d = P[p.type];
    let value = d.value;
    if (p.type === "ab_link")
      value += Math.min(3, Math.floor(side.info.freeRatio * 5));
    if (p.type === "go_search")
      value +=
        new Set(
          this._near(side, p)
            .map((q) => P[q.type].faction)
            .filter((f) => f !== "google"),
        ).size * 2;
    if (p.type === "go_lucky" && p.fires % 3 === 0) value *= 3;
    if (p.type === "am_buy" || p.type === "am_oneclick")
      value += Math.min(8, Math.floor(side.income / 5));
    if (p.type === "yt_like") value += Math.min(5, p.fires - 1);
    this._hit(
      side,
      target,
      p,
      Math.round(value * p.power * scale * 10) / 10,
      Math.max(p.pierce, p.type === "gov_pdf" ? 0.5 : p.type === "gov_onestop" ? 0.3 : 0),
    );
  }
  _hit(
    side: BattleSide,
    target: BattleSide,
    p: Pick<BattlePart, "damage"> & Partial<Pick<BattlePart, "id">>,
    value: number,
    pierce = 0,
    admin?: string,
  ) {
    if (target.admin?.has("cdn")) {
      const saved = value * 0.12;
      value -= saved;
      target.adminState.cdn = (target.adminState.cdn || 0) + saved;
    }
    const direct = value * pierce,
      blocked = Math.min(target.shield, value - direct);
    target.shield -= blocked;
    const hit = value - blocked;
    target.hp = Math.max(0, target.hp - hit);
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
    for (const p of this._near(side, source)) {
      if (
        p.type === "ad_retarget" &&
        sd.cd &&
        (sd.tags.includes("video") || sd.tags.includes("text"))
      ) {
        this.emit({ kind: "fire", side: side.name, id: p.id, type: p.type });
        this._earn(side, target, p, 1);
      }
      if (p.type === "yt_ad" && sd.tags.includes("video")) {
        this.emit({ kind: "fire", side: side.name, id: p.id, type: p.type });
        this._earn(side, target, p, 1);
      }
      if (p.type === "yt_sub" && sd.tags.includes("video")) {
        p.watch++;
        if (p.watch >= 3) {
          p.watch -= 3;
          this.emit({ kind: "fire", side: side.name, id: p.id, type: p.type });
          this._earn(side, target, p, 2);
        }
      }
      if (p.type === "go_ads" && sd.tags.includes("text") && sd.cd) {
        this.emit({ kind: "fire", side: side.name, id: p.id, type: p.type });
        this._earn(side, target, p, 1);
      }
      if (p.type === "ab_counter" && sd.cd) {
        p.watch++;
        if (p.watch >= 4) {
          p.watch -= 4;
          this.emit({ kind: "fire", side: side.name, id: p.id, type: p.type });
          this._earn(side, target, p, 1);
        }
      }
    }
  }
  _earn(side: BattleSide, target: BattleSide, p: BattlePart, base: number) {
    let value = side.admin?.has("adnet") ? Math.round(base * 1.5) : base;
    if (side.info.counts.amazon >= 3 && this.elapsed - side.lastBonus >= 1) {
      value++;
      side.lastBonus = this.elapsed;
    }
    side.income += value;
    p.earned += value;
    this.emit({ kind: "income", side: side.name, id: p.id, value });
    const nearP = this._near(side, p);
    // 1-Click carries its cart inside a composite, so it also listens to income that it is near.
    const carts = [
      ...nearP.filter((q) => q.type === "am_cart" || q.type === "am_oneclick"),
      ...side.parts.filter(
        (q) => q.type === "am_oneclick" && !nearP.includes(q) && this._near(side, q).includes(p),
      ),
    ];
    for (const cart of carts) {
      cart.charge += value;
      let count = 0;
      while (cart.charge >= 3 && count++ < 10) {
        cart.charge -= 3;
        cart.fires++;
        this.emit({
          kind: "fire",
          side: side.name,
          id: cart.id,
          type: cart.type,
        });
        this._hit(side, target, cart, cart.type === "am_oneclick" ? 20 : 15);
      }
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
