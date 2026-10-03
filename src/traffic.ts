/* Cursor counts are a scaled animation of each page's HP ratio, not additional combat HP.
   The engine alone owns damage, healing, resources and battle outcomes. */
import type Effects from "./effects.js";
import type { Battle } from "./engine.js";
import type { BattleEvent, SideName, BattleSide } from "./types.js";

type Location = SideName | "hub";
type Destination = SideName | "gone";
type Point = { x: number; y: number };
type Shape = "arrow" | "back" | "hand" | "wait" | "no" | "text";
interface Leg {
  to: Point;
  dur: number;
  shape: Shape;
  hold?: boolean;
  arc?: number;
  over?: boolean;
  color: string | null;
  side?: Location;
  then?: () => void;
  x0: number;
  y0: number;
  t: number;
  cx: number;
  cy: number;
}
interface Cursor {
  bot?: boolean;
  origin: SideName;
  idx: number;
  side: Location;
  x: number;
  y: number;
  px?: number;
  py?: number;
  legs: Leg[];
  leg: Leg | null;
  shape: Shape;
  delay: number;
  dwell: number;
  color: string | null;
  alive: boolean;
  moving: boolean;
  dead?: boolean;
}
interface Lane {
  slot: number;
  src: HTMLElement;
  from: Point;
  to: Point;
  fromSide: SideName;
  toSide: SideName;
  kind: "shield" | "block" | "redirect";
  label: string;
  color: string;
  t: number;
  life: number;
}
interface Invader extends Point {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  cx: number;
  cy: number;
  t: number;
  dur: number;
  stay: number;
  color: string;
  seed: number;
  blocked: boolean;
  onArrive: (() => void) | null;
}

const BLOCK: Record<string, { icon: Shape; title: string; sub: string }> = {
  gov_pdf: {
    icon: "wait",
    title: "PDFをダウンロード中…",
    sub: "申請の手引き.pdf（128KB）",
  },
  gov_submit: {
    icon: "wait",
    title: "送信処理中です",
    sub: "ブラウザを閉じないでください",
  },
  go_voice: {
    icon: "no",
    title: "マイクの使用を許可しますか？",
    sub: "［ブロック］　［許可］",
  },
};
const VIA = {
  yt_play: "動画で",
  yt_like: "高評価で",
  am_buy: "カートで",
  am_cart: "まとめ買いで",
  am_product: "商品で",
  go_search: "検索で",
  go_lucky: "Luckyで",
  go_result: "検索結果で",
  ab_link: "リンクで",
  ab_nav: "ナビで",
  ab_heading: "見出しで",
};
const COLOR = { player: "#1f9d6b", enemy: "#e5484d" };
const blockInfo = BLOCK;
const via: Record<string, string> = VIA;
const ARROW = new Path2D(
  "M0 0L0 15.5L3.8 11.8L6.6 17.8L9.1 16.7L6.4 10.8L11.2 10.8Z",
);
const other = (s: SideName): SideName => (s === "player" ? "enemy" : "player"),
  rnd = (a: number, b: number) => a + Math.random() * (b - a),
  ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
class Traffic {
  fx: Effects;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  active: boolean;
  paused: boolean;
  speed: number;
  cursors: Cursor[];
  lanes: Lane[];
  cache: Partial<Record<SideName, { t: number; list: HTMLElement[] }>>;
  base: Record<SideName, number>;
  now: number;
  battle!: Battle;
  ended = false;
  winner: SideName | null = null;
  exposed: Partial<Record<SideName, boolean>> = {};
  invaders: Invader[] = [];
  last = 0;
  raf = 0;
  peakT = -9;
  peakY = 120;
  laneSlot = 0;
  hudT = 0;
  constructor(fx: Effects) {
    this.fx = fx;
    const canvas = document.querySelector<HTMLCanvasElement>("#traffic-layer");
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) throw new Error("Traffic canvas is unavailable");
    this.canvas = canvas;
    this.ctx = ctx;
    this.active = false;
    this.paused = false;
    this.speed = 1;
    this.cursors = [];
    this.lanes = [];
    this.cache = {};
    this.base = { player: 0, enemy: 0 };
    this.now = 0;
    addEventListener("resize", () => this.resize());
  }
  resize() {
    const d = devicePixelRatio || 1;
    this.canvas.width = innerWidth * d;
    this.canvas.height = innerHeight * d;
    this.ctx.setTransform(d, 0, 0, d, 0, 0);
  }
  isBlock(type: string | undefined) {
    return type != null && Object.hasOwn(BLOCK, type);
  }
  // Composition changes the density of this cursor animation; it grants no combat HP.
  start(battle: Battle) {
    this.stop();
    this.battle = battle;
    this.active = true;
    this.ended = false;
    this.winner = null;
    this.lanes = [];
    this.now = 0;
    this.cache = {};
    this.exposed = {};
    this.invaders = [];
    for (const side of ["player", "enemy"] as const) {
      const info = battle[side].info,
        groups = info.groups.length,
        nested = Object.keys(info.parents).length,
        b = Math.min(8, groups) * 5 + Math.min(6, nested) * 2;
      this.base[side] = Math.min(104, 44 + b);
      if (b)
        this.fx.log(
          side,
          `カーソルの演出密度 +${b}（連結 ${groups}・内包 ${nested}。戦闘HPへの加算なし）`,
          0,
        );

      if (battle[side].bots)
        this.fx.log(
          side,
          `<span class="log-admin">管理画面</span> AIサクラ <em class="inc">👾 ${battle[side].bots}体</em>で水増し`,
          0,
        );
    }
    for (const side of ["player", "enemy"] as const) {
      for (let i = 0; i < this.base[side]; i++)
        this.cursors.push({
          origin: side,
          idx: i,
          side: "hub",
          x: 0,
          y: 0,
          legs: [],
          leg: null,
          shape: "arrow",
          delay: rnd(0, 2.4),
          dwell: 0,
          color: null,
          alive: false,
          moving: false,
        });
      for (let i = 0; i < battle[side].bots; i++)
        this.cursors.push({
          bot: true,
          origin: side,
          idx: i,
          side: "hub",
          x: 0,
          y: 0,
          legs: [],
          leg: null,
          shape: "arrow",
          delay: rnd(0.4, 2),
          dwell: 0,
          color: null,
          alive: false,
          moving: false,
        });
    }
    this.resize();
    this.last = performance.now();
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }
  stop() {
    this.active = false;
    cancelAnimationFrame(this.raf);
    this.cursors = [];
    this.lanes = [];
    this.ctx?.clearRect(0, 0, innerWidth, innerHeight);
  }
  R(side: SideName) {
    const s = this.battle[side];
    return Math.round((this.base[side] * Math.max(0, s.hp)) / s.maxHp);
  }
  desired(c: Cursor): Destination {
    if (c.bot)
      return this.exposed[c.origin] ||
        (this.ended && this.winner && this.winner !== c.origin)
        ? "gone"
        : c.origin;
    // Lab overload is departure, not a zero-sum transfer. HP alone sets each page's real-viewer projection.
    if (this.battle.pressure) return c.idx < this.R(c.origin) ? c.origin : "gone";
    if (this.ended && this.winner) return this.winner;
    return c.idx < this.R(c.origin) ? c.origin : other(c.origin);
  }
  final(): Record<SideName, number> {
    if (this.battle.pressure) return {player: this.R("player"), enemy: this.R("enemy")};
    if (this.ended && this.winner)
      return {
        player:
          this.winner === "player" ? this.base.player + this.base.enemy : 0,
        enemy: this.winner === "enemy" ? this.base.player + this.base.enemy : 0,
      };
    return {
      player: this.R("player") + this.base.enemy - this.R("enemy"),
      enemy: this.R("enemy") + this.base.player - this.R("player"),
    };
  }
  nodes(side: SideName) {
    const c = this.cache[side];
    if (c && this.now - c.t < 0.5) return c.list;
    const host = document.querySelector<HTMLElement>(`#${side}-body`),
      list = host
        ? [...host.querySelectorAll<HTMLElement>(".web-node")].filter(
            (n) => !n.querySelector(".web-node"),
          )
        : [];
    this.cache[side] = { t: this.now, list };
    return list;
  }
  point(side: Location, el?: Element): Point {
    if (side === "hub") {
      const r = document
        .querySelector("#traffic-hub .hub-serp")
        ?.getBoundingClientRect();
      return r
        ? {
            x: rnd(r.left + 14, r.right - 14),
            y: rnd(r.top + 44, r.bottom - 12),
          }
        : { x: innerWidth / 2, y: innerHeight / 2 };
    }
    if (!el) {
      const list = this.nodes(side);
      el = list[(Math.random() * list.length) | 0];
    }
    const r = (
      el || document.querySelector(`#${side}-body`)
    )?.getBoundingClientRect();
    if (!r) return { x: innerWidth / 2, y: innerHeight / 2 };
    return {
      x: rnd(r.left + r.width * 0.12, r.right - r.width * 0.12),
      y: rnd(r.top + r.height * 0.2, r.bottom - r.height * 0.2),
    };
  }
  center(el: Element): Point {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  go(
    c: Cursor,
    to: Point,
    dur: number,
    shape: Shape,
    o: {
      arc?: number;
      over?: boolean;
      color?: string;
      side?: Location;
      then?: () => void;
    } = {},
  ) {
    c.legs.push({
      to,
      dur,
      shape,
      x0: c.x,
      y0: c.y,
      t: 0,
      cx: c.x,
      cy: c.y,
      arc: o.arc || 0,
      over: o.over,
      color: o.color || null,
      side: o.side,
      then: o.then,
    });
  }
  peak() {
    if (this.now - (this.peakT ?? -9) > 0.5) {
      const r = document.querySelector("#traffic-hub")?.getBoundingClientRect();
      this.peakY = r ? r.top - 26 : 120;
      this.peakT = this.now;
    }
    return this.peakY;
  }
  hold(c: Cursor, dur: number, shape: Shape) {
    c.legs.push({
      hold: true,
      dur,
      shape,
      to: { x: c.x, y: c.y },
      color: null,
      x0: c.x,
      y0: c.y,
      t: 0,
      cx: c.x,
      cy: c.y,
    });
  }
  // Components fire because a visitor is using them: nearby cursors walk over and click.
  event(ev: BattleEvent) {
    if (!this.active) return;
    if (ev.kind === "end") {
      this.ended = true;
      this.winner = ev.winner === "draw" ? null : ev.winner;
      return;
    }
    if (ev.kind === "fire" && !ev.echo && ev.type !== "go_jobs") {
      const el = this.fx.part(ev.side, ev.id);
      if (!el) return;
      const idle = this.cursors.filter(
        (c) =>
          c.alive &&
          c.side === ev.side &&
          !c.leg &&
          !c.legs.length &&
          !c.moving,
      );
      for (let i = 0; i < 2 && idle.length; i++) {
        const c = idle.splice((Math.random() * idle.length) | 0, 1)[0];
        this.go(c, this.point(ev.side, el), 0.3, "arrow");
        this.hold(c, 0.35, ev.type === "go_search" ? "text" : "hand");
        c.dwell = rnd(0.2, 1);
      }
    }
  }
  onDamage(
    ev: Extract<BattleEvent, { kind: "damage" }>,
    srcEl: HTMLElement | null,
    victimEl: HTMLElement | null,
    type?: string,
  ) {
    if (!this.active || !srcEl || !victimEl) return;
    const block = type ? blockInfo[type] : undefined;
    this.lanes = this.lanes.filter((l) => l.src !== srcEl);
    this.laneSlot = ((this.laneSlot || 0) + 1) % 4;
    this.lanes.push({
      slot: this.laneSlot,
      src: srcEl,
      from: this.center(victimEl),
      to: this.center(srcEl),
      fromSide: ev.target,
      toSide: ev.side,
      kind: ev.hit <= 0 ? "shield" : block ? "block" : "redirect",
      label:
        ev.hit <= 0 ? "◇ 防御された" : (type ? via[type] || "" : "") + "誘導",
      color: ev.hit <= 0 ? "#2b7bb9" : COLOR[ev.side],
      t: this.now,
      life: 1.5,
    });
    if (this.lanes.length > 8) this.lanes.shift();
    if (block && ev.hit > 0) {
      const r = victimEl.getBoundingClientRect(),
        veil = document.createElement("div"),
        box = document.createElement("div");
      veil.className = "fx-block-veil";
      Object.assign(veil.style, {
        left: r.left + "px",
        top: r.top + "px",
        width: r.width + "px",
        height: r.height + "px",
      });
      box.className = "fx-block";
      box.innerHTML = `<b>${block.icon === "wait" ? "⏳" : "🚫"}</b><span>${block.title}<small>${block.sub}</small>${block.icon === "wait" ? '<span class="bar"><i></i></span>' : ""}</span>`;
      box.style.left =
        Math.max(140, Math.min(innerWidth - 140, r.left + r.width / 2)) + "px";
      box.style.top = Math.max(40, r.top + r.height / 2) + "px";
      this.fx.layer.append(veil, box);
      setTimeout(() => {
        veil.remove();
        box.remove();
      }, 1700);
      for (const c of this.cursors)
        if (
          c.alive &&
          !c.moving &&
          c.side === ev.target &&
          c.x > r.left - 30 &&
          c.x < r.right + 30 &&
          c.y > r.top - 30 &&
          c.y < r.bottom + 30
        ) {
          c.legs = [];
          c.leg = null;
          this.hold(c, rnd(0.9, 1.4), block.icon);
        }
    }
  }
  lane(from: SideName, to: SideName) {
    for (let i = this.lanes.length - 1; i >= 0; i--) {
      const l = this.lanes[i];
      if (
        l.fromSide === from &&
        l.toSide === to &&
        l.kind !== "shield" &&
        this.now - l.t < 1.6
      )
        return l;
    }
    return null;
  }
  migrate(c: Cursor, to: Destination) {
    c.moving = true;
    c.legs = [];
    c.leg = null;
    const done = () => {
      c.moving = false;
      c.dwell = rnd(0.2, 1.2);
    };
    if (to === "gone") {
      this.go(c, this.point("hub"), rnd(0.6, 1), "arrow", {
        side: "hub",
        arc: 60,
        then: () => {
          c.dead = true;
          c.alive = false;
        },
      });
      return;
    }
    const from = c.side;
    if (from === "hub") {
      this.go(c, this.point(to), rnd(0.7, 1.1), "arrow", {
        side: to,
        color: COLOR[to],
        arc: 40,
        then: done,
      });
      return;
    }
    const l = this.lane(from, to),
      j = (p: Point) => ({ x: p.x + rnd(-26, 26), y: p.y + rnd(-14, 14) });
    if (l?.kind === "redirect") {
      this.go(c, j(l.from), 0.28, "hand");
      this.go(c, j(l.to), rnd(0.9, 1.3), "arrow", {
        side: to,
        color: l.color,
        over: true,
        then: done,
      });
      return;
    }
    if (l?.kind === "block") this.hold(c, rnd(0.5, 0.9), BLOCK_ICON());
    this.go(c, this.point("hub"), rnd(0.6, 0.9), "back", {
      side: "hub",
      color: "#8d929c",
      arc: 50,
    });
    this.go(c, this.point(to), rnd(0.7, 1), "arrow", {
      side: to,
      color: COLOR[to],
      arc: 50,
      then: done,
    });
  }
  frame(t: number) {
    if (!this.active) return;
    const real = Math.max(0, Math.min(0.05, (t - this.last) / 1000));
    this.last = t;
    const dt = this.paused
      ? 0
      : real * Math.min(2.4, Math.max(0.85, this.speed * 1.7));
    this.now += dt;
    let budget = 5;
    for (const c of this.cursors) {
      if (c.dead && !c.bot && this.battle.pressure && c.idx < this.R(c.origin)) {
        c.dead = false;
        c.alive = false;
        c.side = "hub";
        c.delay = 0;
        c.moving = false;
        c.legs = [];
        c.leg = null;
      }
      if (c.dead) continue;
      if (!c.alive) {
        c.delay -= dt;
        if (c.delay > 0 || !dt) continue;
        const p = this.point("hub");
        c.x = p.x;
        c.y = p.y;
        c.alive = true;
      }
      if (!c.leg && c.legs.length) {
        const l = c.legs.shift();
        if (!l) continue;
        l.x0 = c.x;
        l.y0 = c.y;
        l.t = 0;
        if (!l.hold) {
          l.cx = (c.x + l.to.x) / 2;
          l.cy = l.over
            ? 2 * (this.peak() + rnd(-14, 20)) - (c.y + l.to.y) / 2
            : (c.y + l.to.y) / 2 - (l.arc || 0);
        }
        c.leg = l;
        c.shape = l.shape;
        c.color = l.color;
      }
      if (c.leg) {
        const l = c.leg;
        l.t += dt / l.dur;
        const k = Math.min(1, l.t);
        c.px = c.x;
        c.py = c.y;
        if (!l.hold) {
          const e = ease(k),
            u = 1 - e;
          c.x = u * u * l.x0 + 2 * u * e * l.cx + e * e * l.to.x;
          c.y = u * u * l.y0 + 2 * u * e * l.cy + e * e * l.to.y;
        }
        if (l.t >= 1) {
          c.leg = null;
          if (l.side) c.side = l.side;
          c.color = null;
          if (!c.legs.length) c.shape = "arrow";
          l.then?.();
        }
        continue;
      }
      if (!c.moving && dt) {
        const d = this.desired(c);
        if (d !== c.side) {
          if (budget > 0) {
            budget--;
            this.migrate(c, d);
          }
          continue;
        }
      }
      if (c.side !== "hub" && !c.moving) {
        c.dwell -= dt;
        if (c.dwell <= 0) {
          this.go(c, this.point(c.side), rnd(0.5, 1.2), "arrow");
          c.dwell = rnd(0.4, 2.4);
        }
      }
    }
    for (const v of this.invaders) {
      v.t += dt;
      const k = Math.min(1, v.t / v.dur),
        e = ease(k),
        u = 1 - e;
      v.x = u * u * v.x0 + 2 * u * e * v.cx + e * e * v.x1;
      v.y = u * u * v.y0 + 2 * u * e * v.cy + e * e * v.y1;
      if (k >= 1) {
        if (v.onArrive) {
          v.onArrive();
          v.onArrive = null;
        }
        v.stay -= dt;
        v.x += Math.sin(this.now * 9 + v.seed) * 0.6;
      }
    }
    this.invaders = this.invaders.filter((v) => v.stay > 0);
    this.draw();
    if (t - (this.hudT || 0) > 150) {
      this.hudT = t;
      this.hud();
    }
    this.raf = requestAnimationFrame((n) => this.frame(n));
  }
  draw() {
    const x = this.ctx;
    x.clearRect(0, 0, innerWidth, innerHeight);
    for (const l of this.lanes) {
      const age = (this.now - l.t) / l.life;
      if (age >= 1 || l.kind !== "redirect") continue;
      const mx = (l.from.x + l.to.x) / 2,
        my = 2 * (this.peak() - l.slot * 26) - (l.from.y + l.to.y) / 2;
      x.save();
      x.globalAlpha = Math.min(1, (1 - age) * 1.4) * 0.9;
      x.strokeStyle = l.color;
      x.lineWidth = 2.2;
      x.setLineDash([7, 6]);
      x.lineDashOffset = -this.now * 70;
      x.beginPath();
      x.moveTo(l.from.x, l.from.y);
      x.quadraticCurveTo(mx, my, l.to.x, l.to.y);
      x.stroke();
      x.setLineDash([]);
      const lx = 0.25 * l.from.x + 0.5 * mx + 0.25 * l.to.x,
        ly = 0.25 * l.from.y + 0.5 * my + 0.25 * l.to.y;
      x.font = '600 11px Arial,"Noto Sans CJK JP",sans-serif';
      const w = x.measureText(l.label).width + 16;
      x.fillStyle = l.color;
      x.beginPath();
      x.roundRect
        ? x.roundRect(lx - w / 2, ly - 10, w, 20, 10)
        : x.rect(lx - w / 2, ly - 10, w, 20);
      x.fill();
      x.fillStyle = "#fff";
      x.textAlign = "center";
      x.textBaseline = "middle";
      x.fillText(l.label, lx, ly + 0.5);
      x.restore();
    }
    this.lanes = this.lanes.filter((l) => this.now - l.t < l.life);
    const list = this.cursors.filter((c) => c.alive);
    list.sort((a, b) => (a.color ? 1 : 0) - (b.color ? 1 : 0));
    for (const c of list) this.drawCursor(c);
    for (const v of this.invaders) {
      if (v.blocked && v.t >= v.dur) continue;
      this.invader(v.x, v.y, v.color, 2.2);
    }
  }
  // 👾 Space-invader sprites mark non-human traffic.
  invader(x: number, y: number, color: string, s: number) {
    const ctx = this.ctx,
      f = Math.floor(this.now * 4) % 2 ? INV_A : INV_B,
      ox = x - 5.5 * s,
      oy = y - 4 * s;
    ctx.fillStyle = "#0007";
    for (let r = 0; r < 8; r++)
      for (let q = 0; q < 11; q++)
        if (f[r][q] === "X") ctx.fillRect(ox + q * s + 1, oy + r * s + 1, s, s);
    ctx.fillStyle = color;
    for (let r = 0; r < 8; r++)
      for (let q = 0; q < 11; q++)
        if (f[r][q] === "X")
          ctx.fillRect(ox + q * s, oy + r * s, s + 0.2, s + 0.2);
  }
  spawnInvaders(
    from: SideName,
    to: Point | (() => Point),
    color: string,
    n: number,
    blocked: boolean,
    onArrive: () => void,
  ) {
    for (let i = 0; i < n; i++) {
      const a = this.point(from),
        b = typeof to === "function" ? to() : to;
      const x1 = b.x + rnd(-30, 30),
        y1 = b.y + rnd(-12, 12);
      this.invaders.push({
        x: a.x,
        y: a.y,
        x0: a.x,
        y0: a.y,
        x1,
        y1,
        cx: (a.x + x1) / 2,
        cy: 2 * this.peak() - (a.y + y1) / 2,
        t: -i * 0.12,
        dur: rnd(0.9, 1.2),
        stay: blocked ? 0.25 : rnd(1.8, 2.6),
        color,
        seed: Math.random() * 9,
        blocked,
        onArrive: i === 0 ? onArrive : null,
      });
    }
  }
  adminDamage(
    ev: Extract<BattleEvent, { kind: "damage" }>,
    victimEl: HTMLElement | null,
  ) {
    if (!this.active) return;
    if (ev.admin === "troll" && victimEl) {
      const r = victimEl.getBoundingClientRect();
      this.spawnInvaders(
        ev.side,
        { x: r.left + r.width / 2, y: r.top + r.height / 2 },
        COLOR[ev.side],
        3,
        false,
        () => {
          const n = document.createElement("div");
          n.className = "fx-troll";
          n.textContent = "ｗｗｗｗ荒らし中ｗｗｗ";
          n.style.left = r.left + r.width / 2 + "px";
          n.style.top = r.top + "px";
          this.fx.layer.append(n);
          setTimeout(() => n.remove(), 1500);
        },
      );
    }
  }
  adminEvent(ev: Extract<BattleEvent, { kind: "admin" }>) {
    if (!this.active) return;
    if (ev.admin === "troll" && ev.blocked) {
      const host = document
        .querySelector(`#${ev.target}-body`)
        ?.getBoundingClientRect();
      if (!host) return;
      const at = { x: host.left + host.width / 2, y: host.top + 40 };
      this.spawnInvaders(ev.side, at, COLOR[ev.side], 3, true, () =>
        this.popup(
          at,
          "captcha",
          "私はロボットではありません",
          "👾 botを遮断しました",
        ),
      );
    }
    if (ev.admin === "sakura" && ev.exposed) {
      this.exposed[ev.side] = true;
      const host = document
        .querySelector(`#${ev.side}-body`)
        ?.getBoundingClientRect();
      if (host)
        this.popup(
          { x: host.left + host.width / 2, y: host.top + host.height / 2 },
          "alert",
          "⚠ ステマ発覚",
          "AIサクラによる閲覧数の水増しが見つかりました",
        );
    }
  }
  popup(at: Point, kind: "captcha" | "alert", title: string, sub: string) {
    const n = document.createElement("div");
    n.className = "fx-block fx-" + kind;
    n.innerHTML = `<b>${kind === "captcha" ? "☑" : "⚠"}</b><span>${title}<small>${sub}</small></span>`;
    n.style.left = Math.max(140, Math.min(innerWidth - 140, at.x)) + "px";
    n.style.top = at.y + "px";
    this.fx.layer.append(n);
    setTimeout(() => n.remove(), 1700);
  }
  drawCursor(c: Cursor) {
    const x = this.ctx;
    if (
      c.color &&
      c.px != null &&
      c.py != null &&
      c.shape !== "wait" &&
      c.shape !== "no"
    ) {
      x.save();
      x.strokeStyle = c.color;
      x.globalAlpha = 0.4;
      x.lineWidth = 2.5;
      x.lineCap = "round";
      x.beginPath();
      x.moveTo(c.px - (c.x - c.px) * 4, c.py - (c.y - c.py) * 4);
      x.lineTo(c.x, c.y);
      x.stroke();
      x.restore();
    }
    if (c.bot) {
      this.invader(c.x, c.y, c.color || COLOR[c.origin], 1.35);
      return;
    }
    if (c.shape === "arrow" || c.shape === "back") {
      x.save();
      x.translate(c.x, c.y);
      x.scale(c.color ? 0.95 : 0.68, c.color ? 0.95 : 0.68);
      x.globalAlpha = c.color ? 1 : 0.9;
      x.fillStyle = c.color || "#fff";
      x.strokeStyle = "#15161a";
      x.lineWidth = 1.4;
      x.fill(ARROW);
      x.stroke(ARROW);
      x.restore();
      if (c.shape === "back") {
        x.font = "bold 10px Arial";
        x.fillStyle = "#5f6368";
        x.fillText("←", c.x + 10, c.y + 2);
      }
      return;
    }
    if (c.shape === "text") {
      x.save();
      x.strokeStyle = "#15161a";
      x.lineWidth = 1.6;
      x.beginPath();
      x.moveTo(c.x - 3, c.y - 7);
      x.lineTo(c.x + 3, c.y - 7);
      x.moveTo(c.x, c.y - 7);
      x.lineTo(c.x, c.y + 7);
      x.moveTo(c.x - 3, c.y + 7);
      x.lineTo(c.x + 3, c.y + 7);
      x.stroke();
      x.restore();
      return;
    }
    x.font =
      '14px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
    x.textAlign = "center";
    x.textBaseline = "middle";
    x.fillText(
      c.shape === "hand" ? "👆" : c.shape === "wait" ? "⏳" : "🚫",
      c.x,
      c.y,
    );
  }
  onLag(side: SideName) {
    if (!this.active) return;
    const list = this.cursors.filter(
      (c) => c.alive && !c.moving && !c.leg && c.side === side && !c.bot,
    );
    for (let i = 0; i < 4 && list.length; i++) {
      const c = list.splice((Math.random() * list.length) | 0, 1)[0];
      c.legs = [];
      this.hold(c, rnd(0.7, 1.2), "wait");
    }
    const p = document.querySelector<HTMLElement>(
      `#${side}-frame .browser-paper`,
    );
    if (p) {
      p.classList.remove("lag-tick");
      void p.offsetWidth;
      p.classList.add("lag-tick");
    }
  }
  counts() {
    const n = { player: 0, enemy: 0, hub: 0 };
    for (const c of this.cursors) if (!c.dead) n[c.alive ? c.side : "hub"]++;
    return n;
  }
  metric(id: string | undefined, s: BattleSide) {
    const st = s.adminState;
    switch (id) {
      case "server":
        return `閲覧者HP ${Math.round(s.hp * 100) / 100} / ${s.maxHp}（最大HP +25%）`;
      case "cdn":
        return `軽減 ${Math.round(st.cdn || 0)}`;
      case "backup":
        return st.restored ? "✓ 復旧済み" : "ダウンに備えて待機中";
      case "moderator":
        return `荒らし削除 ${st.moderator || 0}件`;
      case "captcha":
        return `bot遮断 ${st.captcha || 0}件`;
      case "adnet":
        return `収益 ×1.5　$${s.income}`;
      case "sns":
        return `累計回復 ${Math.round((st.sns || 0) * 100) / 100} 閲覧者HP（初回3秒・以降5秒ごと）`;
      case "sakura":
        return st.exposed
          ? "⚠ ステマ発覚・炎上"
          : `👾 ${this.cursors.filter((c) => c.bot && c.origin === s.name && !c.dead).length}体が閲覧中`;
      case "troll":
        return `送信 ${st.troll || 0}回 / 遮断 ${st.trollBlocked || 0}回`;
      default:
        return "";
    }
  }
  hud() {
    const n = this.counts(),
      tot = Math.max(1, n.player + n.enemy),
      all = this.base.player + this.base.enemy,
      set = (s: string, v: string | number) => {
        const e = document.querySelector(s);
        if (e) e.textContent = String(v);
      };
    set("#tug-you", n.player);
    set("#tug-foe", n.enemy);
    const bar = document.querySelector<HTMLElement>("#tug-bar");
    if (bar) bar.style.width = (100 * n.player) / tot + "%";
    set("#hub-you", n.player + "人");
    set("#hub-foe", n.enemy + "人");
    set("#hub-idle", n.hub);
    for (const side of ["player", "enemy"] as const) {
      const f = document.querySelector<HTMLElement>(`#${side}-frame`);
      if (!f) continue;
      const s = this.battle[side],
        m = f.querySelector(".health-meta");
      for (const w of f.querySelectorAll<HTMLElement>(".admin-widget")) {
        const id = w.dataset.admin,
          mt = w.querySelector(".aw-metric");
        if (mt) mt.textContent = this.metric(id, s);
        if (id === "server") {
          const depletion = Math.max(0, Math.min(100, Math.round(100 - (100 * s.hp) / s.maxHp)));
          w.style.setProperty("--load", depletion + "%");
          const meter = w.querySelector<HTMLElement>(".v-load");
          meter?.setAttribute("role", "progressbar");
          meter?.setAttribute("aria-label", "閲覧者HPの減少率（CPU負荷ではありません）");
          meter?.setAttribute("aria-valuemin", "0");
          meter?.setAttribute("aria-valuemax", "100");
          meter?.setAttribute("aria-valuenow", String(depletion));
          meter?.setAttribute("title", `閲覧者HPの減少率 ${depletion}%`);
        }
        if (id === "sakura")
          w.classList.toggle("is-alert", !!s.adminState.exposed);
      }
      if (m)
        m.innerHTML = `<span class="hp-num">${this.battle.pressure ? `閲覧者HP <b>${Math.ceil(s.hp)}</b> / ${s.maxHp}` : `<b>${n[side]}</b> 人が閲覧中`}</span><span class="health-shield">${s.shield > 0 ? "◇ " + Math.round(s.shield) : ""}</span><span class="health-income">${s.income ? "収益 $" + s.income : ""}</span>`;
      const w = (this.battle.pressure ? 100 * s.hp / s.maxHp : (100 * n[side]) / all) + "%",
        i = f.querySelector<HTMLElement>(".health-track i"),
        b = f.querySelector<HTMLElement>(".health-track b");
      if (i) i.style.width = w;
      if (b) b.style.width = w;
    }
  }
}
function BLOCK_ICON(): Shape {
  return "no";
}
const INV_A = [
    "..X.....X..",
    "...X...X...",
    "..XXXXXXX..",
    ".XX.XXX.XX.",
    "XXXXXXXXXXX",
    "X.XXXXXXX.X",
    "X.X.....X.X",
    "...XX.XX...",
  ],
  INV_B = [
    "..X.....X..",
    "X..X...X..X",
    "X.XXXXXXX.X",
    "XXX.XXX.XXX",
    "XXXXXXXXXXX",
    ".XXXXXXXXX.",
    "..X.....X..",
    ".X.......X.",
  ];
export default Traffic;
