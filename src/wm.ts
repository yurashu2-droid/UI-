/* RAID OS window manager: the game's panels become real desktop windows.
   Each window gets a title bar (drag to move), edge/corner grips (drag to resize), a minimise
   button and a taskbar button. Windows snap to the desktop edges and to each other, remember
   where you put them (localStorage). Moving another window does not change the page scale. */

export interface WinSpec {
  id: string;
  title: string;
  icon: string;
  /** Default rect as a function of the desktop size. */
  rect(w: number, h: number): Rect;
  minW?: number;
  minH?: number;
  /** Reuse chrome already inside the window instead of adding another title bar. */
  nativeHandle?: string;
}
type Rect = { x: number; y: number; w: number; h: number };
interface Win {
  spec: WinSpec;
  el: HTMLElement;
  bar: HTMLElement | null;
  task: HTMLButtonElement;
  rect: Rect;
  min: boolean;
  z: number;
}
export interface WindowManager {
  add(el: HTMLElement, spec: WinSpec): void;
  setTitle(id: string, title: string): void;
  show(id: string): void;
  reset(): void;
  onChange(fn: () => void): void;
}

const KEY = "ui-raid-wm";
const SNAP = 12;

export function createWindowManager(desktop: HTMLElement, taskHost: HTMLElement): WindowManager {
  const wins: Win[] = [];
  const listeners: (() => void)[] = [];
  let zTop = 30;
  let saved: Record<string, { rect: Rect; min: boolean }> = {};
  try {
    saved = JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    saved = {};
  }
  document.body.classList.add("wm-on");
  const apps = document.createElement("div");
  apps.className = "tb-apps";
  apps.setAttribute("role", "toolbar");
  apps.setAttribute("aria-label", "ウィンドウ");
  taskHost.after(apps);

  const size = () => ({ w: desktop.clientWidth, h: desktop.clientHeight });
  const persist = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(wins.map((w) => [w.spec.id, { rect: w.rect, min: w.min }]))));
    } catch {
      /* optional */
    }
  };
  const changed = () => listeners.forEach((f) => f());
  const clamp = (r: Rect, spec: WinSpec): Rect => {
    const { w, h } = size(),
      mw = spec.minW ?? 200,
      mh = spec.minH ?? 120;
    const ww = Math.max(mw, Math.min(r.w, w)),
      hh = Math.max(mh, Math.min(r.h, h));
    return { x: Math.max(0, Math.min(r.x, w - Math.min(ww, 80))), y: Math.max(0, Math.min(r.y, h - 32)), w: ww, h: hh };
  };
  function apply(win: Win) {
    const r = win.rect;
    Object.assign(win.el.style, { left: r.x + "px", top: r.y + "px", width: r.w + "px", height: r.h + "px", zIndex: String(win.z) });
    win.el.classList.toggle("wm-hidden", win.min);
    win.el.classList.toggle("wm-front", !win.min && win.z === zTop);
    win.task.classList.toggle("is-open", !win.min);
    win.task.classList.toggle("is-front", !win.min && win.z === zTop);
    win.task.setAttribute("aria-pressed", String(!win.min));
  }
  const applyAll = () => wins.forEach(apply);
  function front(win: Win) {
    win.z = ++zTop;
    applyAll();
  }
  // Snap an edge value to desktop edges and other windows' edges.
  function snapX(v: number, self: Win) {
    const { w } = size();
    const cands = [0, w, ...wins.filter((o) => o !== self && !o.min).flatMap((o) => [o.rect.x, o.rect.x + o.rect.w])];
    for (const c of cands) if (Math.abs(v - c) < SNAP) return c;
    return v;
  }
  function snapY(v: number, self: Win) {
    const { h } = size();
    const cands = [0, h, ...wins.filter((o) => o !== self && !o.min).flatMap((o) => [o.rect.y, o.rect.y + o.rect.h])];
    for (const c of cands) if (Math.abs(v - c) < SNAP) return c;
    return v;
  }

  function drag(win: Win, e: PointerEvent, mode: string) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    front(win);
    const start = { x: e.clientX, y: e.clientY, r: { ...win.rect } };
    const target = e.currentTarget as HTMLElement;
    try {
      target.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic */
    }
    document.body.classList.add(mode === "move" ? "wm-moving" : "wm-resizing");
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - start.x,
        dy = ev.clientY - start.y,
        r = { ...start.r };
      if (mode === "move") {
        r.x = start.r.x + dx;
        r.y = start.r.y + dy;
        const sx = snapX(r.x, win),
          sx2 = snapX(r.x + r.w, win);
        r.x = sx !== r.x ? sx : sx2 !== r.x + r.w ? sx2 - r.w : r.x;
        const sy = snapY(r.y, win),
          sy2 = snapY(r.y + r.h, win);
        r.y = sy !== r.y ? sy : sy2 !== r.y + r.h ? sy2 - r.h : r.y;
      } else {
        if (mode.includes("e")) r.w = snapX(start.r.x + start.r.w + dx, win) - r.x;
        if (mode.includes("s")) r.h = snapY(start.r.y + start.r.h + dy, win) - r.y;
        if (mode.includes("w")) {
          const nx = snapX(start.r.x + dx, win);
          r.w = start.r.x + start.r.w - nx;
          r.x = nx;
        }
      }
      win.rect = clamp(r, win.spec);
      apply(win);
      changed();
    };
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", up);
      document.body.classList.remove("wm-moving", "wm-resizing");
      persist();
      changed();
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", up);
  }

  function add(el: HTMLElement, spec: WinSpec) {
    const { w, h } = size();
    const s = saved[spec.id];
    el.classList.add("wm-win");
    el.dataset.win = spec.id;
    const bar = spec.nativeHandle ? null : document.createElement("div");
    if (bar) {
      bar.className = "wm-bar";
      bar.innerHTML = `<span class="wm-icon" aria-hidden="true">${spec.icon}</span><b class="wm-title"></b><button type="button" class="wm-min" aria-label="最小化">_</button>`;
      bar.querySelector(".wm-title")!.textContent = spec.title;
      el.prepend(bar);
    } else {
      el.classList.add("wm-native");
    }
    for (const g of ["e", "w", "s", "se", "sw"]) {
      const grip = document.createElement("i");
      grip.className = `wm-grip wm-${g}`;
      grip.setAttribute("aria-hidden", "true");
      el.append(grip);
    }
    const task = document.createElement("button");
    task.type = "button";
    task.className = "tb-app";
    task.innerHTML = `<span aria-hidden="true">${spec.icon}</span><b></b>`;
    task.querySelector("b")!.textContent = spec.title;
    task.title = spec.title;
    apps.append(task);
    const win: Win = { spec, el, bar, task, rect: clamp(s?.rect ?? spec.rect(w, h), spec), min: s?.min ?? false, z: ++zTop };
    wins.push(win);
    const reset = () => {
      win.rect = clamp(spec.rect(size().w, size().h), spec);
      apply(win);
      persist();
      changed();
    };
    if (bar) {
      bar.addEventListener("pointerdown", (e) => {
        if ((e.target as Element).closest(".wm-min")) return;
        drag(win, e, "move");
      });
      bar.addEventListener("dblclick", reset);
      bar.querySelector(".wm-min")!.addEventListener("click", () => {
        win.min = true;
        apply(win);
        persist();
        changed();
      });
    } else {
      el.addEventListener("pointerdown", (e) => {
        if ((e.target as Element).closest(spec.nativeHandle!)) drag(win, e, "move");
      });
      el.addEventListener("dblclick", (e) => {
        if ((e.target as Element).closest(spec.nativeHandle!)) reset();
      });
    }
    el.querySelectorAll<HTMLElement>(".wm-grip").forEach((g) =>
      g.addEventListener("pointerdown", (e) => drag(win, e, g.className.split("wm-").pop()!.trim())),
    );
    el.addEventListener("pointerdown", () => win.z !== zTop && front(win), { capture: true });
    task.addEventListener("click", () => {
      if (win.min) {
        win.min = false;
        front(win);
      } else if (win.z !== zTop) front(win);
      else win.min = true;
      applyAll();
      persist();
      changed();
    });
    apply(win);
  }

  window.addEventListener("resize", () => {
    for (const win of wins) win.rect = clamp(win.rect, win.spec);
    applyAll();
    changed();
  });

  return {
    add,
    setTitle(id, title) {
      const win = wins.find((x) => x.spec.id === id);
      if (!win) return;
      if (win.bar) win.bar.querySelector(".wm-title")!.textContent = title;
      win.task.querySelector("b")!.textContent = title;
      win.task.title = title;
    },
    show(id) {
      const win = wins.find((x) => x.spec.id === id);
      if (!win || !win.min) return;
      win.min = false;
      front(win);
      persist();
      changed();
    },
    reset() {
      const { w, h } = size();
      for (const win of wins) {
        win.rect = clamp(win.spec.rect(w, h), win.spec);
        win.min = false;
      }
      applyAll();
      persist();
      changed();
    },
    onChange(fn) {
      listeners.push(fn);
    },
  };
}
