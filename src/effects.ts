import D from "./data.js";
import V from "./components.js";
import type Traffic from "./traffic.js";
import type {
  BattleEvent,
  BattleSide,
  PartDefinition,
  SideName,
} from "./types.js";
import type { Battle } from "./engine.js";

/* Native UI state animation plus cross-page UI packets. Motion is the component's own affordance. */
const esc = V.esc,
  icon = V.icon;
const QUERIES = [
  "UI シナジー 最強",
  "古いサイト 最新UI",
  "検索窓 ボタン つなぎ方",
  "2× 再生 やり方",
  "marquee 復活",
  "カートに入れる 連打",
];
const BBS = [
  ["名無しさん", "はじめまして。リンク張らせてもらいました！"],
  ["キリ番ゲッター", "10000踏みました！！"],
  ["管理人", "いつも書き込みありがとうございます。"],
  ["通りすがり", "相手のページ、ボタンが崩れてますよ"],
  ["ROM専", "このサイトの検索窓、なんか強い"],
];
const NOTES = [
  "新しい動画が公開されました",
  "ライブ配信が始まりました",
  "あなたへのおすすめ: 1999年のUI",
  "コメントに返信がありました",
];
const SIDE_NAME: Record<SideName, string> = { player: "あなた", enemy: "相手" };
const parts: Record<string, PartDefinition> = D.PARTS;
const factions: Record<string, { color: string }> = D.FACTIONS;
type Point = { x: number; y: number };
type TimedElement = HTMLElement & { _typing?: ReturnType<typeof setInterval> };
class Effects {
  layer: HTMLElement;
  sound = false;
  audio: AudioContext | null = null;
  reduced: boolean;
  count = 0;
  lastTone = 0;
  lines: Record<SideName, string[]> = { player: [], enemy: [] };
  flying = 0;
  q = 0;
  bbs = 0;
  notes = 0;
  dirty = false;
  lastLag = 0;
  traffic?: Traffic;
  private timers = new WeakMap<
    HTMLElement,
    Map<string, ReturnType<typeof setTimeout>>
  >();
  constructor() {
    const layer = document.querySelector<HTMLElement>("#effect-layer");
    if (!layer) throw new Error("Effect layer is unavailable");
    this.layer = layer;
    this.sound = false;
    this.audio = null;
    this.reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.count = 0;
    this.lastTone = 0;
    this.lines = { player: [], enemy: [] };
    this.flying = 0;
    this.q = 0;
    this.bbs = 0;
    this.notes = 0;
  }
  part(side: SideName, id: string): HTMLElement | null {
    return document.querySelector<HTMLElement>(
      `#${side}-body .web-node[data-id="${id}"]`,
    );
  }
  center(el: Element): Point {
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }
  pulse(el: HTMLElement | null | undefined, cls = "is-firing", ms = 520) {
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    const timers =
      this.timers.get(el) ?? new Map<string, ReturnType<typeof setTimeout>>();
    clearTimeout(timers.get("_t" + cls));
    timers.set(
      "_t" + cls,
      setTimeout(() => el.classList.remove(cls), ms),
    );
    this.timers.set(el, timers);
  }
  float(
    el: Element | null | undefined,
    text: string,
    kind: string,
    at?: Point,
  ) {
    if (!el || this.layer.childElementCount > 48) return;
    const p = at || this.center(el),
      n = document.createElement("span");
    n.className = "fx-float " + kind;
    n.textContent = text;
    n.style.left = p.x + "px";
    n.style.top = p.y + "px";
    this.layer.append(n);
    setTimeout(() => n.remove(), this.reduced ? 500 : 950);
  }
  // What actually travels between the two pages: a miniature of the UI's own output.
  packet(type?: string) {
    const d = type ? parts[type] : undefined,
      el = document.createElement("div");
    el.className = "fx-packet pk-" + (d?.faction || "x");
    let h;
    switch (type) {
      case "yt_play":
        h = '<span class="pk-video"><b>▶</b><i></i></span>';
        break;
      case "yt_like":
        h = `<span class="pk-pill pk-yt">${icon("like")}+1</span>`;
        break;
      case "am_buy":
        h = '<span class="pk-pill pk-buy">カートに入れる</span>';
        break;
      case "am_cart":
        h = '<span class="pk-box">📦<b>×3</b></span>';
        break;
      case "am_product":
        h = '<span class="pk-product"><i>UI</i>¥1,980</span>';
        break;
      case "go_search":
        h = `<span class="pk-pill pk-search">${icon("search")}${esc(QUERIES[this.q % QUERIES.length])}</span>`;
        break;
      case "go_lucky":
        h = '<span class="pk-pill pk-lucky">I\'m Feeling Lucky</span>';
        break;
      case "go_voice":
        h = `<span class="pk-round pk-mic">${icon("mic")}</span>`;
        break;
      case "go_result":
        h = '<span class="pk-result">小さなWebから、世界を…</span>';
        break;
      case "ab_link":
      case "ab_nav":
        h = '<span class="pk-link">最新情報</span>';
        break;
      case "ab_heading":
        h = '<span class="pk-heading">見出し</span>';
        break;
      case "gov_pdf":
        h = '<span class="pk-pdf"><b>PDF</b><i></i><i></i><i></i></span>';
        break;
      case "gov_submit":
        h = '<span class="pk-pill pk-gov">申請を送信 →</span>';
        break;
      default:
        h = `<span class="pk-pill" style="background:${factions[d?.faction ?? ""]?.color || "#777"}">${esc(d?.name || "UI")}</span>`;
    }
    el.innerHTML = h;
    return el;
  }
  fly(
    from: Element | null | undefined,
    to: Element | null | undefined,
    type: string | undefined,
    done: () => void,
  ) {
    if (this.reduced || !from || !to || this.flying > 18) {
      done();
      return;
    }
    const a = this.center(from),
      b = this.center(to),
      el = this.packet(type);
    this.layer.append(el);
    this.flying++;
    const lift = Math.min(140, 40 + Math.abs(b.x - a.x) * 0.18),
      mid = { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - lift },
      dur = 520 + Math.min(260, Math.abs(b.x - a.x) * 0.25);
    const anim = el.animate(
      [
        {
          transform: `translate(${a.x}px,${a.y}px) translate(-50%,-50%) scale(.55)`,
          opacity: 0,
        },
        {
          transform: `translate(${a.x}px,${a.y - 8}px) translate(-50%,-50%) scale(1)`,
          opacity: 1,
          offset: 0.12,
        },
        {
          transform: `translate(${mid.x}px,${mid.y}px) translate(-50%,-50%) scale(1.08) rotate(${a.x < b.x ? 4 : -4}deg)`,
          offset: 0.55,
        },
        {
          transform: `translate(${b.x}px,${b.y}px) translate(-50%,-50%) scale(.9)`,
          opacity: 1,
        },
      ],
      { duration: dur, easing: "cubic-bezier(.3,.1,.3,1)" },
    );
    anim.onfinish = () => {
      el.remove();
      this.flying--;
      done();
    };
  }
  flag(el: HTMLElement | null | undefined, cls: string, ms: number) {
    if (!el) return;
    el.classList.add(cls);
    const timers =
      this.timers.get(el) ?? new Map<string, ReturnType<typeof setTimeout>>();
    clearTimeout(timers.get("_f" + cls));
    timers.set(
      "_f" + cls,
      setTimeout(() => el.classList.remove(cls), ms),
    );
    this.timers.set(el, timers);
  }
  toastAt(el: Element | null | undefined, text: string) {
    if (!el || this.reduced || this.layer.childElementCount > 48) return;
    const r = el.getBoundingClientRect(),
      n = document.createElement("div");
    n.className = "fx-toast";
    n.innerHTML = `${icon("bell")}<span><b>UI RAID Channel</b>${esc(text)}</span>`;
    n.style.left = r.right + "px";
    n.style.top = r.top + "px";
    this.layer.append(n);
    setTimeout(() => n.remove(), 1700);
  }
  openDoc(el: Element | null | undefined) {
    if (!el || this.reduced) return;
    const icon = el.querySelector(".pdf-icon") || el,
      r = icon.getBoundingClientRect(),
      n = document.createElement("div");
    n.className = "fx-doc";
    n.innerHTML =
      "<b>PDF</b><i></i><i></i><i></i><i></i><small>申請の手引き.pdf</small>";
    n.style.left = r.left + "px";
    n.style.top = r.top + "px";
    this.layer.append(n);
    setTimeout(() => n.remove(), 1100);
  }
  typeQuery(el: TimedElement) {
    const input = el.querySelector("input");
    if (!input) return;
    const text = QUERIES[this.q++ % QUERIES.length];
    clearInterval(el._typing);
    input.value = "";
    let i = 0;
    el.classList.add("is-typing");
    el._typing = setInterval(
      () => {
        input.value = text.slice(0, ++i);
        if (i >= text.length) {
          clearInterval(el._typing);
          this.flag(el, "is-submit", 320);
          setTimeout(() => el.classList.remove("is-typing"), 320);
        }
      },
      this.reduced ? 0 : 38,
    );
  }
  advance(el: HTMLElement) {
    const btns = [...el.querySelectorAll("button")].filter(
      (b) => !/[‹›]/.test(b.textContent),
    );
    if (!btns.length) return;
    const i = btns.findIndex((b) => b.classList.contains("current"));
    btns.forEach((b) => b.classList.remove("current"));
    btns[(i + 1) % btns.length].classList.add("current");
  }
  cycleSelect(el: HTMLElement) {
    const s = el.querySelector("select");
    if (s) s.selectedIndex = (s.selectedIndex + 1) % s.options.length;
  }
  recheck(el: HTMLElement, keep = false) {
    const i = el.querySelector<HTMLInputElement>("input[type=checkbox]");
    if (!i) return;
    if (keep) {
      i.checked = true;
      return;
    }
    i.checked = false;
    setTimeout(() => {
      i.checked = true;
    }, 200);
  }
  act(el: HTMLElement | null | undefined, type: string) {
    if (!el) return;
    const q = (s: string) => el.querySelector<HTMLElement>(s);
    switch (type) {
      case "yt_play":
        this.flag(el, "is-playing", 1500);
        break;
      case "yt_autoplay":
        this.recheck(el);
        break;
      case "yt_sub": {
        const b = q(".native-button");
        if (b && !b.classList.contains("is-on")) {
          b.classList.add("is-on");
          b.textContent = "登録済み";
        }
        break;
      }
      case "yt_like":
      case "yt_caption":
      case "am_wish":
        q(".native-button")?.classList.add("is-on");
        break;
      case "yt_notify":
        q(".native-button")?.classList.add("is-on");
        this.toastAt(el, NOTES[this.notes++ % NOTES.length]);
        break;
      case "yt_ad":
        this.flag(el, "is-expanded", 1300);
        break;
      case "am_buy":
        this.flag(el, "is-added", 800);
        break;
      case "am_cart":
        this.flag(el, "is-bump", 600);
        break;
      case "am_coupon":
        this.recheck(el);
        break;
      case "am_quantity":
      case "go_translate":
        this.cycleSelect(el);
        break;
      case "am_deal":
        this.flag(el, "is-tick", 500);
        break;
      case "go_search":
        this.typeQuery(el);
        break;
      case "go_suggest": {
        const rows = [...el.querySelectorAll(".native-suggestions>div")];
        const i = rows.findIndex((r) => r.classList.contains("is-hot"));
        rows.forEach((r) => r.classList.remove("is-hot"));
        rows[(i + 1) % rows.length]?.classList.add("is-hot");
        break;
      }
      case "go_tabs":
      case "go_page":
      case "gov_page":
      case "gov_font":
        this.advance(el);
        break;
      case "go_voice":
        this.flag(el, "is-listening", 1000);
        break;
      case "go_result":
      case "go_ads":
      case "ab_link":
      case "ab_nav":
      case "ab_mail":
        q("a")?.classList.add("visited");
        break;
      case "ab_guestbook": {
        const [name, msg] = BBS[this.bbs++ % BBS.length],
          b = q(".native-bbs>div");
        if (b) {
          b.innerHTML = `<b>${esc(name)}</b> <small>2001/0${1 + (this.bbs % 9)}/1${this.bbs % 9}</small><p class="bbs-copy">${esc(msg)}</p>`;
          this.flag(el, "is-new-post", 700);
        }
        break;
      }
      case "ab_marquee":
        this.flag(el, "is-fast", 1100);
        break;
      case "ab_counter":
        this.flag(el, "is-roll", 600);
        break;
      case "gov_pdf":
        this.openDoc(el);
        break;
      case "gov_check":
        this.recheck(el, true);
        break;
      case "gov_accordion": {
        const a = q(".native-accordion"),
          s = q(".accordion-summary>span");
        if (a) {
          a.classList.add("collapsed");
          if (s) s.textContent = "＋";
          setTimeout(() => {
            a.classList.remove("collapsed");
            if (s) s.textContent = "−";
          }, 260);
        }
        break;
      }
      case "gov_notice":
        this.flag(el, "is-new", 1200);
        break;
    }
  }
  // A damaged page does not lose "HP": its components visibly lose their stylesheet.
  degrade(el: HTMLElement | null | undefined, side: BattleSide) {
    if (!el) return;
    const r = side.hp / side.maxHp,
      level = r < 0.3 ? 3 : r < 0.55 ? 2 : r < 0.85 ? 1 : 0,
      cur = +(el.dataset.broken || 0);
    if (level > cur) {
      el.dataset.broken = String(level);
      let h = 0;
      for (const c of el.dataset.id ?? "") h = (h * 31 + c.charCodeAt(0)) % 97;
      el.style.setProperty(
        "--tilt",
        (h % 2 ? 1 : -1) * (0.5 + (h % 5) * 0.35) + "deg",
      );
      el.style.setProperty("--shift", (h % 7) - 3 + "px");
    }
  }
  crash(side: SideName) {
    const wrap = document.querySelector(`#${side}-frame .page-wrap`);
    if (!wrap || wrap.querySelector(".page-crash")) return;
    const n = document.createElement("div");
    n.className = "page-crash";
    n.innerHTML = `<div><i>:(</i><b>このページは応答していません</b><p>UIの読み込み中に問題が発生しました。</p><small>ERR_UI_OVERLOAD</small><span>再読み込み</span></div>`;
    wrap.append(n);
  }
  log(side: SideName, html: string, time: number) {
    const list = this.lines[side];
    list.push(
      `<div class="log-line"><time>${time.toFixed(1)}s</time>${html}</div>`,
    );
    if (list.length > 5) list.shift();
    this.dirty = true;
  }
  renderLog() {
    if (!this.dirty) return;
    this.dirty = false;
    for (const side of ["player", "enemy"] as const) {
      const col = document.querySelector(`#battle-log [data-log="${side}"]`);
      if (col)
        col.innerHTML =
          `<div class="log-head">${SIDE_NAME[side]}のページ</div>` +
          this.lines[side].join("");
    }
  }
  name(type?: string) {
    const d = type ? parts[type] : undefined;
    return d
      ? `<b style="color:${factions[d.faction]?.color ?? "#777"}">${esc(d.name)}</b>`
      : "UI";
  }
  tone(kind: "income" | "damage") {
    if (!this.sound || performance.now() - this.lastTone < 85) return;
    try {
      const audioWindow: Window & { webkitAudioContext?: typeof AudioContext } =
        window;
      const AudioCtor =
        globalThis.AudioContext || audioWindow.webkitAudioContext;
      if (!AudioCtor) return;
      const audio = (this.audio ??= new AudioCtor());
      if (audio.state === "suspended") audio.resume();
      const oscillator = audio.createOscillator(),
        gain = audio.createGain(),
        t = audio.currentTime;
      oscillator.type = kind === "income" ? "sine" : "triangle";
      oscillator.frequency.setValueAtTime(kind === "income" ? 730 : 190, t);
      oscillator.frequency.exponentialRampToValueAtTime(
        kind === "income" ? 1100 : 80,
        t + 0.06,
      );
      gain.gain.setValueAtTime(0.022, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
      oscillator.connect(gain);
      gain.connect(audio.destination);
      oscillator.start();
      oscillator.stop(t + 0.09);
      this.lastTone = performance.now();
    } catch {}
  }
  emit(event: BattleEvent, battle: Battle) {
    const side = "side" in event ? event.side : undefined;
    const id = "id" in event ? event.id : undefined;
    const el = side && id ? this.part(side, id) : null,
      src = side && id ? battle[side].parts.find((p) => p.id === id) : null,
      t = battle.elapsed;
    if (event.kind === "fire") {
      this.pulse(el);
      this.act(el, event.type);
      if (event.echo) this.pulse(el, "is-echoed", 700);
      if (event.type === "gov_submit")
        this.pulse(el?.closest(".node-gov_form"));
      return;
    }
    if (event.kind === "damage") {
      const target = battle[event.target],
        pool = target.parts.filter((p) => Number.isFinite(p.x)),
        victim = pool[(this.count++ * 7 + 3) % pool.length],
        to = victim && this.part(event.target, victim.id);
      const land = () => {
        if (!to) return;
        this.pulse(to, "is-hit", 460);
        this.degrade(to, target);
        this.float(to, "−" + Math.round(event.hit), "damage");
        if (event.blocked > 0)
          this.float(to, "◇ " + Math.round(event.blocked) + " 防御", "shield", {
            x: this.center(to).x,
            y: this.center(to).y + 22,
          });
        this.tone("damage");
      };
      if (event.admin) {
        if (to) {
          this.pulse(to, "is-hit", 460);
          this.degrade(to, target);
        }
        const k = Math.round(
          (event.hit / target.maxHp) *
            (this.traffic?.base?.[event.target] || 50),
        );
        this.traffic?.adminDamage(event, to);
        this.adminPulse(
          event.side,
          event.admin === "exposed" ? ["captcha", "moderator"] : [event.admin],
        );
        this.log(
          event.side,
          event.admin === "troll"
            ? `<span class="log-admin">管理画面</span> AI荒らし👾 <span class="arrow">⇢</span> ${this.name(victim?.type)} を荒らす${k ? ` <em class="dmg">${k}人が離脱</em>` : ""}`
            : `<span class="log-admin">管理画面</span> 相手のステマを検出 <em class="dmg">${k}人が離脱</em>`,
          t,
        );
        return;
      }
      if (this.traffic?.active) {
        if (to) {
          this.pulse(to, "is-hit", 460);
          this.degrade(to, target);
        }
        this.tone("damage");
        this.traffic.onDamage(event, el, to, src?.type);
        const k = Math.round(
          (event.hit / target.maxHp) * this.traffic.base[event.target],
        );
        this.log(
          event.side,
          event.hit <= 0
            ? `${this.name(src?.type)} <span class="arrow">⇢</span> ${this.name(victim?.type)} <em class="shd">◇ 防御された</em>`
            : this.traffic.isBlock(src?.type)
              ? `${this.name(src?.type)} で ${this.name(victim?.type)} をブロック${k ? ` <em class="dmg">${k}人が離脱</em>` : ""}`
              : `${this.name(src?.type)} <span class="arrow">⇢</span> ${this.name(victim?.type)} から${k ? ` <em class="dmg">${k}人</em>を` : ""}誘導`,
          t,
        );
        return;
      }
      this.fly(el, to, src?.type, land);
      this.log(
        event.side,
        `${this.name(src?.type)} <span class="arrow">→</span> ${this.name(victim?.type)} <em class="dmg">−${Math.round(event.hit)}</em>${event.blocked > 0 ? ` <em class="shd">◇${Math.round(event.blocked)}</em>` : ""}${event.pierce ? ' <em class="prc">貫通</em>' : ""}`,
        t,
      );
      return;
    }
    if (event.kind === "income") {
      this.float(el, "+$" + event.value, "income");
      this.coin(
        el,
        document.querySelector<HTMLElement>(
          `#${event.side}-frame .health-income`,
        ),
      );
      this.tone("income");
      this.log(
        event.side,
        `${this.name(src?.type)} <em class="inc">+$${event.value}</em>`,
        t,
      );
      return;
    }
    if (event.kind === "heal" && event.value > 0) {
      this.float(
        el,
        this.traffic?.active ? "呼び戻し" : "+" + event.value + " HP",
        "heal",
      );
      this.log(
        event.side,
        this.traffic?.active
          ? `${this.name(src?.type)} <em class="heal">離脱した人を呼び戻し</em>`
          : `${this.name(src?.type)} <em class="heal">HP +${event.value}</em>`,
        t,
      );
      return;
    }
    if (event.kind === "shield" && event.value > 0) {
      this.float(el, "◇ +" + event.value, "shield");
      this.log(
        event.side,
        `${this.name(src?.type)} <em class="shd">シールド +${event.value}</em>`,
        t,
      );
      return;
    }
    if (event.kind === "echo") {
      const to = this.part(event.side, event.to),
        tp = battle[event.side].parts.find((p) => p.id === event.to);
      if (el && to && !this.reduced) {
        const a = this.center(el),
          b = this.center(to),
          n = document.createElement("div");
        n.className = "fx-echo";
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        Object.assign(n.style, {
          left: a.x + "px",
          top: a.y + "px",
          width: len + "px",
          transform: `rotate(${Math.atan2(b.y - a.y, b.x - a.x)}rad)`,
        });
        this.layer.append(n);
        setTimeout(() => n.remove(), 650);
      }
      this.float(el, "もう一度", "echo");
      this.log(
        event.side,
        `${this.name(src?.type)} <span class="arrow">↻</span> ${this.name(tp?.type)} を再発動`,
        t,
      );
      return;
    }
    if (event.kind === "admin") {
      this.traffic?.adminEvent(event);
      this.adminPulse(event.side, [event.admin]);
      const tag = '<span class="log-admin">管理画面</span> ';
      const txt = {
        moderator: `モデレーター <em class="shd">荒らしを削除 ◇+${event.value}</em>`,
        sns: `SNS運用 <em class="heal">SNSから新規流入</em>`,
        troll: `AI荒らし👾 <em class="shd">相手のCAPTCHAに遮断された</em>`,
        sakura: `<em class="dmg">ステマ発覚</em> AIサクラ👾が炎上`,
        backup: `バックアップから復旧 <em class="heal">閲覧者30%</em>`,
      }[event.admin];
      if (
        txt &&
        !(event.admin === "moderator" && !event.value) &&
        !(event.admin === "sns" && !event.value)
      )
        this.log(event.side, tag + txt, t);
      return;
    }
    if (event.kind === "lag") {
      const s = battle[event.side],
        k = Math.round(
          (event.value / s.maxHp) * (this.traffic?.base?.[event.side] || 50),
        );
      this.traffic?.onLag(event.side);
      if (k > 0 || !this.lastLag || t - this.lastLag > 3) {
        this.lastLag = t;
        this.log(
          event.side,
          `表示が遅い（速度 ${Math.round(100 / s.lag)}%）<em class="dmg">${k ? k + "人が待ちきれず離脱" : "閲覧者がイライラ"}</em>`,
          t,
        );
      }
      return;
    }
    if (event.kind === "overload") {
      this.log(
        event.side,
        `<b>サーバー過負荷</b> <em class="dmg">−${event.value}</em>`,
        t,
      );
      return;
    }
    if (event.kind === "end") {
      for (const s of ["player", "enemy"] as const)
        if (battle[s].hp <= 0) this.crash(s);
    }
  }
  update(battle: Battle) {
    for (const side of [battle.player, battle.enemy]) {
      const frame = document.querySelector<HTMLElement>(
        "#" + side.name + "-frame",
      );
      if (!frame) continue;
      if (!this.traffic?.active) {
        const hp = Math.ceil(side.hp);
        const meta = frame.querySelector<HTMLElement>(".health-meta");
        if (meta)
          meta.innerHTML = `<span class="hp-num"><b>${hp}</b> / ${side.maxHp}</span><span class="health-shield">${side.shield > 0 ? `◇ ${Math.round(side.shield)}` : ""}</span><span class="health-income">${side.income ? `$${side.income}` : ""}</span>`;
        const health = frame.querySelector<HTMLElement>(".health-track i");
        if (health) health.style.width = (100 * side.hp) / side.maxHp + "%";
        const lag = frame.querySelector<HTMLElement>(".health-track b");
        if (lag) lag.style.width = (100 * side.hp) / side.maxHp + "%";
      }
      frame.classList.toggle("is-critical", side.hp / side.maxHp < 0.3);
      for (const p of side.parts) {
        const el = this.part(side.name, p.id);
        if (!el) continue;
        el.style.setProperty(
          "--progress",
          String(p.period ? Math.max(0, 1 - p.remaining / p.period) : 0),
        );
        const seek = el.querySelector(".seek-fill");
        if (seek)
          el.style.setProperty("--seek", String((battle.elapsed % 8) / 8));
        const video = el.querySelector(".video-time");
        if (video) {
          const sec = Math.floor(battle.elapsed * p.speed);
          video.textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
        }
        const caption = el.querySelector(".video-caption");
        if (caption) {
          const has = (side.info.near[p.id] || []).some(
            (id) => side.parts.find((q) => q.id === id)?.type === "yt_caption",
          );
          caption.textContent = has
            ? [
                "検索を、つなぐ。",
                "違うサイトのUIが、ひとつになる。",
                "リンクは、まだ生きている。",
              ][Math.floor(battle.elapsed / 3) % 3]
            : "";
        }
        const like = el.querySelector(".like-value");
        if (like) like.textContent = String(128 + p.fires);
        const income = el.querySelector(".state-income");
        if (income)
          income.textContent = String(
            p.type === "am_cart" ? p.charge : p.earned,
          );
        const sent = el.querySelector(".cart-state");
        if (sent) sent.textContent = String(p.fires);
        const cart = el.querySelector(".state-charge");
        if (cart) cart.textContent = String(p.charge);
        const prog = el.querySelector<HTMLElement>(".cart-charge");
        if (prog) prog.style.setProperty("--charge", String(p.charge / 3));
        const counter = el.querySelector(".counter-number");
        if (counter)
          counter.textContent = String(128 + p.watch + p.earned * 4).padStart(
            4,
            "0",
          );
        const sale = el.querySelector(".sale-clock");
        if (sale)
          sale.textContent =
            "00:" +
            String(59 - (Math.floor(battle.elapsed) % 60)).padStart(2, "0");
      }
    }
    this.renderLog();
  }
  reset() {
    this.lines = { player: [], enemy: [] };
    this.dirty = true;
    this.flying = 0;
  }
  // Revenue visibly flows from the UI that earned it into the site's wallet.
  coin(from: Element | null | undefined, to: HTMLElement | null | undefined) {
    if (!from || !to || this.reduced || this.layer.childElementCount > 52)
      return;
    const a = this.center(from),
      b = this.center(to),
      n = document.createElement("div");
    n.className = "fx-coin";
    n.textContent = "$";
    this.layer.append(n);
    n.animate(
      [
        {
          transform: `translate(${a.x}px,${a.y}px) translate(-50%,-50%) scale(.6)`,
          opacity: 0,
        },
        {
          transform: `translate(${a.x}px,${a.y - 24}px) translate(-50%,-50%) scale(1.1)`,
          opacity: 1,
          offset: 0.2,
        },
        {
          transform: `translate(${b.x}px,${b.y}px) translate(-50%,-50%) scale(.7)`,
          opacity: 1,
        },
      ],
      { duration: 700, easing: "cubic-bezier(.5,0,.3,1)" },
    ).onfinish = () => {
      n.remove();
      this.pulse(to, "is-bump", 400);
    };
  }
  adminPulse(side: SideName, ids: string[]) {
    for (const id of ids) {
      const w = document.querySelector<HTMLElement>(
        `#${side}-frame .admin-widget[data-admin="${id}"]`,
      );
      if (w) this.pulse(w, "is-pulse", 650);
    }
  }
  clear() {
    this.layer.replaceChildren();
    this.flying = 0;
  }
}
export default Effects;
