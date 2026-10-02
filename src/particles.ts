export type Rectish = { left: number; top: number; width: number; height: number };

export type Shape =
  | "spark"
  | "dot"
  | "square"
  | "pill"
  | "bar"
  | "play"
  | "cursor"
  | "coin"
  | "star"
  | "text";

export interface BurstOptions {
  shape?: Shape | Shape[];
  count?: number;
  colors?: string[];
  speed?: number;
  spread?: number;
  angle?: number;
  gravity?: number;
  drag?: number;
  life?: number;
  size?: number;
  text?: string;
}

const PARTICLE_LIMIT = 700;
const RING_LIMIT = 100;
const DEFAULT_COLORS = ["#2fb47c", "#5fb3ff", "#f5c542", "#ffffff"];
const CONFETTI_COLORS = [
  "#2fb47c",
  "#e5484d",
  "#f5c542",
  "#5fb3ff",
  "#8a7cea",
  "#ef3440",
  "#e29a18",
  "#4285f4",
  "#7771b8",
  "#25777a",
  "#ffffff",
];
const CONFETTI_SHAPES: Shape[] = ["pill", "bar", "play", "cursor", "star"];
const CRASH_COLORS = ["#17212b", "#253342", "#334557", "#101820"];
const TAU = Math.PI * 2;

interface Particle {
  shape: Shape;
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  drag: number;
  angle: number;
  angularVelocity: number;
  life: number;
  age: number;
  delay: number;
  size: number;
  color: string;
  text: string;
  font: string;
}

interface Shockwave {
  x: number;
  y: number;
  color: string;
  radius: number;
  life: number;
  age: number;
}

interface DelayedBurst {
  x: number;
  y: number;
  color: string;
  count: number;
  delay: number;
  size: number;
}

interface ShakeEffect {
  element: HTMLElement;
  transform: string;
  transition: string;
  age: number;
  duration: number;
  intensity: number;
  phase: number;
}

const randomBetween = (min: number, max: number): number => min + Math.random() * (max - min);
const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));
const finiteOr = (value: number | undefined, fallback: number): number =>
  value !== undefined && Number.isFinite(value) ? value : fallback;
const easeOutCubic = (value: number): number => 1 - (1 - value) ** 3;

function centerOf(rect: Rectish): [number, number] {
  return [rect.left + rect.width / 2, rect.top + rect.height / 2];
}

function darkenHex(color: string): string | null {
  const match = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(color);
  if (!match) return null;
  let hex = match[1];
  if (hex.length === 3) hex = hex.replace(/./g, (digit) => digit + digit);
  const value = Number.parseInt(hex, 16);
  const r = Math.round(((value >> 16) & 0xff) * 0.43);
  const g = Math.round(((value >> 8) & 0xff) * 0.43);
  const b = Math.round((value & 0xff) * 0.43);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

export class Particles {
  private readonly particleList: Particle[] = [];
  private readonly shockwaves: Shockwave[] = [];
  private readonly delayedBursts: DelayedBurst[] = [];
  private readonly shakes: ShakeEffect[] = [];
  private canvas: HTMLCanvasElement | null = null;
  private context: CanvasRenderingContext2D | null = null;
  private flashElement: HTMLDivElement | null = null;
  private frame: number | null = null;
  private lastFrameTime: number | null = null;
  private viewportWidth = 0;
  private viewportHeight = 0;
  private pixelRatio = 1;
  private resizeListening = false;
  private confettiRemaining = 0;
  private confettiWait = 0;
  private fireworksRemaining = 0;
  private fireworksWait = 0;
  private flashDuration = 0;
  private flashElapsed = 0;
  private flashOpacity = 0;
  private reducedValue = false;

  constructor() {
    if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
      const query = window.matchMedia("(prefers-reduced-motion: reduce)");
      this.reducedValue = query.matches;
      query.addEventListener("change", (event) => {
        this.reduced = event.matches;
      });
    }
  }

  get reduced(): boolean {
    return this.reducedValue;
  }

  set reduced(value: boolean) {
    this.reducedValue = Boolean(value);
    if (this.reducedValue) this.restoreShakes();
  }

  /** Emit UI-fragment particles. Speed is px/s, gravity is px/s², and life is seconds. */
  burst(x: number, y: number, opts?: BurstOptions): void {
    this.emitBurst(x, y, opts);
    this.ensureLoop();
  }

  /** Add an expanding screen-space shockwave; it is rendered separately from physics particles. */
  ring(x: number, y: number, color: string, maxRadius = 64, life = 0.46): void {
    this.addShockwave(x, y, color, maxRadius, life);
    this.ensureLoop();
  }

  /** Two UI elements connect with a fast ring, bright sparks, and small control fragments. */
  snap(x: number, y: number, color: string): void {
    this.addShockwave(x, y, color, 38, 0.36);
    this.emitBurst(x, y, {
      shape: "spark",
      count: 16,
      colors: [color, "#ffffff"],
      speed: 245,
      gravity: 95,
      life: 0.48,
      size: 7,
    });
    this.emitBurst(x, y, {
      shape: ["pill", "bar"],
      count: 6,
      colors: [color, "#ffffff"],
      speed: 145,
      gravity: 210,
      life: 0.67,
      size: 6,
    });
    this.ensureLoop();
  }

  /** Synergy activation: light stars rise from the set edges while a ring opens at its center. */
  setActivate(rect: Rectish, color: string): void {
    const [cx, cy] = centerOf(rect);
    const count = this.scaledCount(16);
    this.reserveParticles(count);
    for (let i = 0; i < count; i += 1) {
      const edge = Math.floor(Math.random() * 4);
      let x: number;
      let y: number;
      if (edge === 0) {
        x = rect.left + Math.random() * rect.width;
        y = rect.top;
      } else if (edge === 1) {
        x = rect.left + rect.width;
        y = rect.top + Math.random() * rect.height;
      } else if (edge === 2) {
        x = rect.left + Math.random() * rect.width;
        y = rect.top + rect.height;
      } else {
        x = rect.left;
        y = rect.top + Math.random() * rect.height;
      }
      this.particleList.push(
        this.createParticle(
          "star",
          x,
          y,
          i % 3 === 0 ? "#f5c542" : color,
          randomBetween(-30, 30),
          randomBetween(-90, -34),
          -14,
          0.34,
          randomBetween(0.72, 1.08),
          0,
          randomBetween(-4.5, 4.5),
          randomBetween(4, 7),
          "",
          0,
        ),
      );
    }
    this.addShockwave(cx, cy, color, Math.min(220, Math.max(48, Math.max(rect.width, rect.height) * 0.45)), 0.6);
    this.ensureLoop();
  }

  /** Copy fragments stream from a source UI into the page and sparkle when they arrive. */
  purchase(from: Rectish, to: Rectish): void {
    const count = this.launchBetween(from, to, ["square", "pill", "bar"], 13, [
      "#2fb47c",
      "#5fb3ff",
      "#f5c542",
      "#ffffff",
    ], 290, 0.25, 0.58, 5.5, 0.22);
    if (count > 0) {
      const [x, y] = centerOf(to);
      this.scheduleBurst(x, y, "#2fb47c", 11, 0.9, 5.5);
    }
    this.ensureLoop();
  }

  /** Gold coins arc toward a wallet, with a small payout burst on arrival. */
  coins(from: Rectish, to: Rectish, n = 8): void {
    const count = this.launchBetween(from, to, "coin", n, ["#f5c542"], 450, 0.36, 0.72, 7, 0.3);
    if (count > 0) {
      const [x, y] = centerOf(to);
      this.scheduleBurst(x, y, "#f5c542", 8, 1.12, 5);
    }
    this.ensureLoop();
  }

  /** Soft pixel-and-link puff at the lower edge of a UI that lands on the page. */
  dropDust(rect: Rectish): void {
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height;
    this.emitBurst(x, y, {
      shape: ["dot", "square", "bar"],
      count: 14,
      colors: ["#d7e8df", "#2fb47c", "#ffffff"],
      speed: 76,
      angle: -Math.PI / 2,
      spread: Math.PI * 0.86,
      gravity: 95,
      drag: 1.65,
      life: 0.48,
      size: 4.2,
    });
    this.ensureLoop();
  }

  /** A web page breaks into a grid of dark, tumbling pixel debris. */
  crash(rect: Rectish, colors?: string[]): void {
    const count = this.scaledCount(48);
    this.reserveParticles(count);
    if (count === 0) {
      this.ensureLoop();
      return;
    }

    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    const columns = Math.max(1, Math.ceil(Math.sqrt((count * width) / height)));
    const rows = Math.ceil(count / columns);
    const [cx, cy] = centerOf(rect);
    const tinted = colors?.map(darkenHex).filter((color): color is string => color !== null) ?? [];
    const debrisColors = tinted.length > 0 ? [...CRASH_COLORS, ...tinted] : CRASH_COLORS;

    for (let i = 0; i < count; i += 1) {
      const column = i % columns;
      const row = Math.floor(i / columns);
      const x = rect.left + ((column + randomBetween(0.12, 0.88)) / columns) * width;
      const y = rect.top + ((row + randomBetween(0.12, 0.88)) / rows) * height;
      const dx = x - cx;
      const dy = y - cy;
      const length = Math.max(1, Math.hypot(dx, dy));
      const impulse = randomBetween(70, 260);
      const vx = (dx / length) * impulse + randomBetween(-45, 45);
      const vy = (dy / length) * impulse - randomBetween(20, 105);
      this.particleList.push(
        this.createParticle(
          "square",
          x,
          y,
          debrisColors[Math.floor(Math.random() * debrisColors.length)],
          vx,
          vy,
          690,
          0.24,
          randomBetween(0.78, 1.3),
          randomBetween(3, 11),
          randomBetween(-13, 13),
          randomBetween(4, 11),
          "",
          0,
        ),
      );
    }
    this.ensureLoop();
  }

  /** UI-fragment confetti falls in from the top and both sides for the victory duration. */
  confetti(durationMs = 3200): void {
    this.confettiRemaining = Math.max(0, finiteOr(durationMs, 3200));
    this.confettiWait = 0;
    this.ensureLoop();
  }

  /** Periodic UI-fragment bursts pop at random screen positions. */
  fireworks(durationMs = 2600, colors?: string[]): void {
    this.fireworksRemaining = Math.max(0, finiteOr(durationMs, 2600));
    this.fireworksWait = 0;
    this.fireworksColors = colors && colors.length > 0 ? colors.slice() : CONFETTI_COLORS;
    this.ensureLoop();
  }

  /** Visitor cursors travel from one page to another as a small comet. */
  steal(from: Rectish, to: Rectish, color: string): void {
    const count = this.launchBetween(from, to, "cursor", 7, ["#ffffff"], 520, 0.24, 0.52, 8, 0.13);
    this.launchBetween(from, to, "spark", 6, [color], 620, 0.25, 0.44, 5, 0.08);
    if (count > 0) {
      const [x, y] = centerOf(to);
      this.scheduleBurst(x, y, color, 9, 0.8, 5.5);
    }
    this.ensureLoop();
  }

  /** Transform-based screen shake; the element's inline transform is restored at the end. */
  shake(el: HTMLElement, intensity = 7, ms = 260): void {
    this.ensureCanvas();
    if (this.reduced) return;

    const existing = this.shakes.find((shake) => shake.element === el);
    if (existing) {
      existing.age = 0;
      existing.duration = Math.max(0.04, finiteOr(ms, 260) / 1000);
      existing.intensity = Math.max(0, finiteOr(intensity, 7));
      existing.phase = randomBetween(0, TAU);
    } else {
      this.shakes.push({
        element: el,
        transform: el.style.transform,
        transition: el.style.transition,
        age: 0,
        duration: Math.max(0.04, finiteOr(ms, 260) / 1000),
        intensity: Math.max(0, finiteOr(intensity, 7)),
        phase: randomBetween(0, TAU),
      });
      el.style.transition = "none";
    }
    this.ensureLoop();
  }

  /** Brief full-screen color flash, animated by the shared RAF loop. */
  flash(color = "#ffffff", ms = 150, opacity = 0.62): void {
    this.ensureCanvas();
    this.ensureFlashElement();
    this.flashDuration = Math.max(0.035, finiteOr(ms, 150) / 1000);
    this.flashElapsed = 0;
    this.flashOpacity = clamp(finiteOr(opacity, 0.62), 0, 1);
    if (this.flashElement) this.flashElement.style.backgroundColor = color;
    this.ensureLoop();
  }

  /** Stop every effect and leave the reusable transparent overlay in place. */
  clear(): void {
    if (this.frame !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(this.frame);
    }
    this.frame = null;
    this.lastFrameTime = null;
    this.particleList.length = 0;
    this.shockwaves.length = 0;
    this.delayedBursts.length = 0;
    this.confettiRemaining = 0;
    this.fireworksRemaining = 0;
    this.flashDuration = 0;
    this.flashElapsed = 0;
    this.flashOpacity = 0;
    this.restoreShakes();
    if (this.context) this.context.clearRect(0, 0, this.viewportWidth, this.viewportHeight);
    if (this.flashElement) this.flashElement.style.opacity = "0";
  }

  private fireworksColors: string[] = CONFETTI_COLORS;

  private emitBurst(x: number, y: number, opts?: BurstOptions): number {
    const desired = clamp(Math.floor(finiteOr(opts?.count, 18)), 0, PARTICLE_LIMIT);
    const count = this.scaledCount(desired);
    this.reserveParticles(count);
    if (count === 0) return 0;

    const shapeSpec = opts?.shape ?? "spark";
    const colors = opts?.colors && opts.colors.length > 0 ? opts.colors : DEFAULT_COLORS;
    const spread = clamp(finiteOr(opts?.spread, TAU), 0, TAU);
    const angle = finiteOr(opts?.angle, -Math.PI / 2);
    const speed = Math.max(0, finiteOr(opts?.speed, 175));
    const gravity = finiteOr(opts?.gravity, 300);
    const drag = Math.max(0, finiteOr(opts?.drag, 0.95));
    const life = Math.max(0.05, finiteOr(opts?.life, 0.82));
    const size = Math.max(1, finiteOr(opts?.size, 5.2));
    const label = opts?.text?.slice(0, 14) ?? "";

    for (let i = 0; i < count; i += 1) {
      const direction = angle + (Math.random() - 0.5) * spread;
      const velocity = speed * randomBetween(0.56, 1.28);
      const shape: Shape = Array.isArray(shapeSpec)
        ? shapeSpec[Math.floor(Math.random() * shapeSpec.length)] ?? "spark"
        : shapeSpec;
      const color = colors[Math.floor(Math.random() * colors.length)] ?? "#ffffff";
      this.particleList.push(
        this.createParticle(
          shape,
          x,
          y,
          color,
          Math.cos(direction) * velocity,
          Math.sin(direction) * velocity,
          gravity,
          drag,
          life * randomBetween(0.78, 1.18),
          size * randomBetween(0.78, 1.22),
          direction + randomBetween(-2.5, 2.5),
          randomBetween(-8, 8),
          label,
          0,
        ),
      );
    }
    return count;
  }

  private launchBetween(
    from: Rectish,
    to: Rectish,
    shapes: Shape | Shape[],
    requested: number,
    colors: string[],
    gravity: number,
    drag: number,
    baseLife: number,
    size: number,
    stagger: number,
  ): number {
    const count = this.scaledCount(clamp(Math.floor(finiteOr(requested, 0)), 0, PARTICLE_LIMIT));
    this.reserveParticles(count);
    if (count === 0) return 0;

    const [fromX, fromY] = centerOf(from);
    const [toX, toY] = centerOf(to);
    const distance = Math.hypot(toX - fromX, toY - fromY);
    const flight = clamp(distance / 720, 0.36, baseLife);

    for (let i = 0; i < count; i += 1) {
      const startX = from.left + Math.random() * Math.max(1, from.width);
      const startY = from.top + Math.random() * Math.max(1, from.height);
      const endX = to.left + Math.random() * Math.max(1, to.width);
      const endY = to.top + Math.random() * Math.max(1, to.height);
      const vx = (endX - startX) / flight;
      const vy = (endY - startY - 0.5 * gravity * flight * flight) / flight;
      const shape: Shape = Array.isArray(shapes)
        ? shapes[Math.floor(Math.random() * shapes.length)] ?? "spark"
        : shapes;
      const delay = count > 1 ? (i / (count - 1)) * stagger : 0;
      this.particleList.push(
        this.createParticle(
          shape,
          startX,
          startY,
          colors[Math.floor(Math.random() * colors.length)] ?? "#ffffff",
          vx,
          vy,
          gravity,
          drag,
          flight + 0.24,
          size * randomBetween(0.72, 1.24),
          Math.atan2(vy, vx),
          randomBetween(-7, 7),
          "",
          delay,
        ),
      );
    }
    return count;
  }

  private createParticle(
    shape: Shape,
    x: number,
    y: number,
    color: string,
    vx: number,
    vy: number,
    gravity: number,
    drag: number,
    life: number,
    size: number,
    angle: number,
    angularVelocity: number,
    text: string,
    delay: number,
  ): Particle {
    const fontSize = Math.max(8, size * 1.55);
    return {
      shape,
      x,
      y,
      vx,
      vy,
      gravity,
      drag,
      angle,
      angularVelocity,
      life: Math.max(0.05, life),
      age: 0,
      delay: Math.max(0, delay),
      size,
      color,
      text,
      font: `700 ${fontSize}px system-ui, sans-serif`,
    };
  }

  private scaledCount(count: number): number {
    return Math.max(0, Math.floor(Math.max(0, count) * (this.reduced ? 0.15 : 1)));
  }

  private reserveParticles(count: number): void {
    const overflow = this.particleList.length + count - PARTICLE_LIMIT;
    if (overflow > 0) this.particleList.splice(0, overflow);
  }

  private addShockwave(x: number, y: number, color: string, radius: number, life: number): void {
    if (this.shockwaves.length >= RING_LIMIT) this.shockwaves.splice(0, 1);
    this.shockwaves.push({
      x,
      y,
      color,
      radius: Math.max(1, finiteOr(radius, 64)) * (this.reduced ? 0.82 : 1),
      life: Math.max(0.08, finiteOr(life, 0.46)),
      age: 0,
    });
  }

  private scheduleBurst(x: number, y: number, color: string, count: number, delay: number, size: number): void {
    this.delayedBursts.push({ x, y, color, count, delay, size });
  }

  private spawnConfettiWave(): void {
    const baseCount = 15;
    const count = this.scaledCount(baseCount);
    this.reserveParticles(count);
    for (let i = 0; i < count; i += 1) {
      const side = Math.floor(Math.random() * 3);
      let x: number;
      let y: number;
      let vx: number;
      let vy: number;
      if (side === 0) {
        x = randomBetween(0, this.viewportWidth);
        y = -8;
        vx = randomBetween(-45, 45);
        vy = randomBetween(80, 210);
      } else if (side === 1) {
        x = -8;
        y = randomBetween(0, this.viewportHeight * 0.65);
        vx = randomBetween(80, 190);
        vy = randomBetween(90, 220);
      } else {
        x = this.viewportWidth + 8;
        y = randomBetween(0, this.viewportHeight * 0.65);
        vx = randomBetween(-190, -80);
        vy = randomBetween(90, 220);
      }
      const shape = CONFETTI_SHAPES[Math.floor(Math.random() * CONFETTI_SHAPES.length)] ?? "pill";
      this.particleList.push(
        this.createParticle(
          shape,
          x,
          y,
          CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)] ?? "#ffffff",
          vx,
          vy,
          randomBetween(120, 260),
          0.18,
          randomBetween(2.1, 3.25),
          randomBetween(5, 10),
          randomBetween(0, TAU),
          randomBetween(-9, 9),
          "",
          0,
        ),
      );
    }
  }

  private spawnFirework(): void {
    const x = randomBetween(this.viewportWidth * 0.12, this.viewportWidth * 0.88);
    const y = randomBetween(this.viewportHeight * 0.14, this.viewportHeight * 0.74);
    const color = this.fireworksColors[Math.floor(Math.random() * this.fireworksColors.length)] ?? "#ffffff";
    this.addShockwave(x, y, color, randomBetween(42, 86), 0.62);
    this.emitBurst(x, y, {
      shape: ["play", "star", "square", "pill", "spark", "dot"],
      count: 34,
      colors: this.fireworksColors,
      speed: randomBetween(175, 275),
      spread: TAU,
      gravity: 120,
      drag: 0.78,
      life: 1.12,
      size: 6.2,
    });
  }

  private update(dt: number): void {
    let liveParticles = 0;
    for (let i = 0; i < this.particleList.length; i += 1) {
      const particle = this.particleList[i];
      particle.age += dt;
      if (particle.age < particle.delay) {
        this.particleList[liveParticles] = particle;
        liveParticles += 1;
        continue;
      }
      const activeAge = particle.age - particle.delay;
      if (activeAge >= particle.life) continue;

      const damping = Math.exp(-particle.drag * dt);
      particle.vx *= damping;
      particle.vy = particle.vy * damping + particle.gravity * dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.angle += particle.angularVelocity * dt;
      this.particleList[liveParticles] = particle;
      liveParticles += 1;
    }
    this.particleList.length = liveParticles;

    let liveRings = 0;
    for (let i = 0; i < this.shockwaves.length; i += 1) {
      const shockwave = this.shockwaves[i];
      shockwave.age += dt;
      if (shockwave.age >= shockwave.life) continue;
      this.shockwaves[liveRings] = shockwave;
      liveRings += 1;
    }
    this.shockwaves.length = liveRings;

    for (let i = 0; i < this.delayedBursts.length; ) {
      const burst = this.delayedBursts[i];
      burst.delay -= dt;
      if (burst.delay > 0) {
        i += 1;
        continue;
      }
      this.emitBurst(burst.x, burst.y, {
        shape: ["spark", "star", "dot"],
        count: burst.count,
        colors: [burst.color],
        speed: 115,
        gravity: 40,
        drag: 1.1,
        life: 0.52,
        size: burst.size,
      });
      this.delayedBursts.splice(i, 1);
    }

    if (this.confettiRemaining > 0) {
      this.confettiWait -= dt;
      if (this.confettiWait <= 0) {
        this.spawnConfettiWave();
        this.confettiWait = 0.085;
      }
      this.confettiRemaining = Math.max(0, this.confettiRemaining - dt * 1000);
    }
    if (this.fireworksRemaining > 0) {
      this.fireworksWait -= dt;
      if (this.fireworksWait <= 0) {
        this.spawnFirework();
        this.fireworksWait = 0.42;
      }
      this.fireworksRemaining = Math.max(0, this.fireworksRemaining - dt * 1000);
    }

    if (this.flashDuration > 0) {
      this.flashElapsed += dt;
      if (this.flashElapsed >= this.flashDuration) {
        this.flashDuration = 0;
        this.flashElapsed = 0;
      }
    }

    this.updateShakes(dt);
  }

  private updateShakes(dt: number): void {
    for (let i = 0; i < this.shakes.length; ) {
      const shake = this.shakes[i];
      shake.age += dt;
      const progress = clamp(shake.age / shake.duration, 0, 1);
      if (progress >= 1 || this.reduced) {
        this.restoreShake(shake);
        this.shakes.splice(i, 1);
        continue;
      }
      const decay = (1 - progress) ** 2;
      const wave = Math.sin(shake.age * 57 + shake.phase) * 0.72 + Math.sin(shake.age * 31) * 0.28;
      const x = wave * shake.intensity * decay;
      const y = Math.cos(shake.age * 49 + shake.phase) * shake.intensity * 0.56 * decay;
      const base = shake.transform && shake.transform !== "none" ? ` ${shake.transform}` : "";
      shake.element.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)${base}`;
      i += 1;
    }
  }

  private hasActivity(): boolean {
    return (
      this.particleList.length > 0 ||
      this.shockwaves.length > 0 ||
      this.delayedBursts.length > 0 ||
      this.shakes.length > 0 ||
      this.confettiRemaining > 0 ||
      this.fireworksRemaining > 0 ||
      this.flashDuration > 0
    );
  }

  private ensureLoop(): void {
    this.ensureCanvas();
    if (this.frame === null && this.hasActivity() && typeof requestAnimationFrame === "function") {
      this.lastFrameTime = null;
      this.frame = requestAnimationFrame(this.onFrame);
    }
  }

  private readonly onFrame = (now: number): void => {
    this.frame = null;
    const dt = this.lastFrameTime === null ? 0 : clamp((now - this.lastFrameTime) / 1000, 0, 1 / 30);
    this.lastFrameTime = now;
    this.ensureCanvas();
    this.update(dt);
    this.render();
    if (this.hasActivity()) {
      this.frame = requestAnimationFrame(this.onFrame);
    } else {
      this.lastFrameTime = null;
    }
  };

  private ensureCanvas(): void {
    if (typeof document === "undefined") return;
    if (!this.canvas) {
      this.canvas = document.createElement("canvas");
      this.canvas.setAttribute("aria-hidden", "true");
      Object.assign(this.canvas.style, {
        position: "fixed",
        inset: "0",
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: "88",
        display: "block",
      });
      this.context = this.canvas.getContext("2d");
    }
    if (!this.canvas.parentNode && document.body) document.body.appendChild(this.canvas);
    if (!this.resizeListening && typeof window !== "undefined") {
      window.addEventListener("resize", this.onResize, { passive: true });
      this.resizeListening = true;
    }
    this.resizeCanvas();
  }

  private readonly onResize = (): void => {
    this.resizeCanvas();
  };

  private resizeCanvas(): void {
    if (!this.canvas || typeof window === "undefined") return;
    const width = Math.max(1, window.innerWidth || document.documentElement.clientWidth);
    const height = Math.max(1, window.innerHeight || document.documentElement.clientHeight);
    const ratio = Math.max(0.5, window.devicePixelRatio || 1);
    if (width === this.viewportWidth && height === this.viewportHeight && ratio === this.pixelRatio) return;
    this.viewportWidth = width;
    this.viewportHeight = height;
    this.pixelRatio = ratio;
    this.canvas.width = Math.round(width * ratio);
    this.canvas.height = Math.round(height * ratio);
    this.context?.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  private render(): void {
    const context = this.context;
    if (!context) return;
    context.clearRect(0, 0, this.viewportWidth, this.viewportHeight);
    for (let i = 0; i < this.shockwaves.length; i += 1) this.drawShockwave(context, this.shockwaves[i]);
    for (let i = 0; i < this.particleList.length; i += 1) this.drawParticle(context, this.particleList[i]);
    if (this.flashElement) {
      if (this.flashDuration > 0) {
        const progress = clamp(this.flashElapsed / this.flashDuration, 0, 1);
        this.flashElement.style.opacity = String(this.flashOpacity * (1 - progress) ** 2);
      } else {
        this.flashElement.style.opacity = "0";
      }
    }
  }

  private drawShockwave(context: CanvasRenderingContext2D, shockwave: Shockwave): void {
    const progress = clamp(shockwave.age / shockwave.life, 0, 1);
    const radius = shockwave.radius * easeOutCubic(progress);
    context.save();
    context.globalAlpha = (1 - progress) ** 1.35;
    context.strokeStyle = shockwave.color;
    context.lineWidth = Math.min(5, Math.max(1.25, shockwave.radius * 0.055 * (1 - progress * 0.58)));
    context.beginPath();
    context.arc(shockwave.x, shockwave.y, Math.max(0.5, radius), 0, TAU);
    context.stroke();
    context.restore();
  }

  private drawParticle(context: CanvasRenderingContext2D, particle: Particle): void {
    if (particle.age < particle.delay) return;
    const progress = clamp((particle.age - particle.delay) / particle.life, 0, 1);
    const fadeStart = 0.62;
    let alpha = 1;
    if (progress > fadeStart) {
      const fade = (progress - fadeStart) / (1 - fadeStart);
      alpha = 1 - fade * fade * (3 - 2 * fade);
    }
    const pop = 1 + 0.13 * Math.sin(Math.PI * Math.min(1, progress / 0.16));
    const scale = Math.max(0.28, (1 - progress * 0.28) * pop);
    const size = particle.size * scale;

    context.save();
    context.translate(particle.x, particle.y);
    context.rotate(particle.angle);
    context.globalAlpha = alpha;
    context.fillStyle = particle.color;
    context.strokeStyle = particle.color;

    switch (particle.shape) {
      case "spark":
        context.lineWidth = Math.max(1.2, size * 0.3);
        context.lineCap = "round";
        context.beginPath();
        context.moveTo(-size * 1.5, 0);
        context.lineTo(size * 1.7, 0);
        context.stroke();
        break;
      case "dot":
        context.beginPath();
        context.arc(0, 0, size * 0.43, 0, TAU);
        context.fill();
        break;
      case "square":
        context.fillRect(-size / 2, -size / 2, size, size);
        break;
      case "pill": {
        const width = size * 1.85;
        const height = Math.max(2, size * 0.74);
        this.roundedRect(context, -width / 2, -height / 2, width, height, height / 2);
        context.fill();
        context.globalAlpha *= 0.38;
        context.strokeStyle = "#ffffff";
        context.lineWidth = Math.max(0.8, size * 0.09);
        context.stroke();
        break;
      }
      case "bar": {
        const width = size * 2.15;
        const height = Math.max(1.3, size * 0.24);
        this.roundedRect(context, -width / 2, -height / 2, width, height, height / 2);
        context.fill();
        break;
      }
      case "play":
        context.beginPath();
        context.moveTo(-size * 0.42, -size * 0.57);
        context.lineTo(size * 0.6, 0);
        context.lineTo(-size * 0.42, size * 0.57);
        context.closePath();
        context.fill();
        break;
      case "cursor":
        context.beginPath();
        context.moveTo(-size * 0.36, -size * 0.5);
        context.lineTo(size * 0.36, size * 0.13);
        context.lineTo(size * 0.07, size * 0.16);
        context.lineTo(size * 0.24, size * 0.48);
        context.lineTo(size * 0.08, size * 0.56);
        context.lineTo(-size * 0.08, size * 0.25);
        context.lineTo(-size * 0.31, size * 0.46);
        context.closePath();
        context.fillStyle = "#ffffff";
        context.fill();
        context.strokeStyle = "#19232e";
        context.lineWidth = Math.max(1, size * 0.09);
        context.lineJoin = "round";
        context.stroke();
        break;
      case "coin":
        context.beginPath();
        context.arc(0, 0, size * 0.62, 0, TAU);
        context.fillStyle = "#f5c542";
        context.fill();
        context.globalAlpha *= 0.68;
        context.strokeStyle = "#9a6810";
        context.lineWidth = Math.max(1, size * 0.11);
        context.stroke();
        context.globalAlpha = alpha;
        context.fillStyle = "#6f4b0b";
        context.font = particle.font;
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText("$", 0, size * 0.025);
        break;
      case "star":
        context.beginPath();
        context.moveTo(0, -size);
        context.lineTo(size * 0.22, -size * 0.22);
        context.lineTo(size, 0);
        context.lineTo(size * 0.22, size * 0.22);
        context.lineTo(0, size);
        context.lineTo(-size * 0.22, size * 0.22);
        context.lineTo(-size, 0);
        context.lineTo(-size * 0.22, -size * 0.22);
        context.closePath();
        context.fill();
        break;
      case "text":
        context.font = particle.font;
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText(particle.text, 0, 0);
        break;
    }
    context.restore();
  }

  private roundedRect(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
  ): void {
    const r = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + r, y);
    context.lineTo(x + width - r, y);
    context.quadraticCurveTo(x + width, y, x + width, y + r);
    context.lineTo(x + width, y + height - r);
    context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    context.lineTo(x + r, y + height);
    context.quadraticCurveTo(x, y + height, x, y + height - r);
    context.lineTo(x, y + r);
    context.quadraticCurveTo(x, y, x + r, y);
    context.closePath();
  }

  private ensureFlashElement(): void {
    if (typeof document === "undefined") return;
    if (!this.flashElement) {
      this.flashElement = document.createElement("div");
      this.flashElement.setAttribute("aria-hidden", "true");
      Object.assign(this.flashElement.style, {
        position: "fixed",
        inset: "0",
        pointerEvents: "none",
        zIndex: "89",
        opacity: "0",
      });
    }
    if (!this.flashElement.parentNode && document.body) document.body.appendChild(this.flashElement);
  }

  private restoreShake(shake: ShakeEffect): void {
    shake.element.style.transform = shake.transform;
    shake.element.style.transition = shake.transition;
  }

  private restoreShakes(): void {
    for (let i = 0; i < this.shakes.length; i += 1) this.restoreShake(this.shakes[i]);
    this.shakes.length = 0;
  }
}

export const particles = new Particles();
export default particles;
