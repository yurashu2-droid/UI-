/** Procedural soundtrack and UI feedback for UI RAID. No audio nodes exist before unlock(). */
export type MusicState = "none" | "title" | "build" | "battle" | "victory" | "defeat";
export type SfxName =
  | "click" | "hover" | "pick" | "drop" | "snap" | "set" | "buy" | "coin" | "sell" | "reroll"
  | "error" | "deploy" | "versus" | "hit" | "steal" | "block" | "lag" | "crash" | "victory"
  | "defeat" | "levelup" | "reward" | "tutorial" | "toggle" | "countdown" | "rumble" | "thud" | "post" | "dialup" | "whoosh";
export interface SfxOptions { pan?: number; pitch?: number; volume?: number }

type Wave = OscillatorType;
type Note = { bar: number; step: number; midi: number; length: number };
type Track = {
  state: "title" | "build" | "battle";
  input: GainNode;
  bass: GainNode;
  filter: BiquadFilterNode;
  gain: GainNode;
  nextTime: number;
  step: number;
  bpm: number;
};

const KEY = "ui-raid-audio";
const TAU = Math.PI * 2;
const clamp = (v: number, lo = 0, hi = 1): number => Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo;
const hz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

// The same eight-bar hook returns in battle, shifted up and set against a darker bass.
const THEME: readonly Note[] = [
  { bar: 0, step: 0, midi: 69, length: 2 }, { bar: 0, step: 3, midi: 72, length: 1 }, { bar: 0, step: 5, midi: 74, length: 2 }, { bar: 0, step: 10, midi: 72, length: 2 },
  { bar: 1, step: 0, midi: 69, length: 2 }, { bar: 1, step: 4, midi: 67, length: 2 }, { bar: 1, step: 8, midi: 69, length: 2 }, { bar: 1, step: 12, midi: 72, length: 2 },
  { bar: 2, step: 0, midi: 74, length: 2 }, { bar: 2, step: 3, midi: 77, length: 1 }, { bar: 2, step: 6, midi: 76, length: 2 }, { bar: 2, step: 11, midi: 72, length: 2 },
  { bar: 3, step: 0, midi: 69, length: 3 }, { bar: 3, step: 6, midi: 67, length: 2 }, { bar: 3, step: 10, midi: 65, length: 3 },
  { bar: 4, step: 0, midi: 69, length: 2 }, { bar: 4, step: 3, midi: 72, length: 1 }, { bar: 4, step: 5, midi: 74, length: 2 }, { bar: 4, step: 10, midi: 79, length: 2 },
  { bar: 5, step: 0, midi: 77, length: 2 }, { bar: 5, step: 4, midi: 76, length: 2 }, { bar: 5, step: 8, midi: 72, length: 2 }, { bar: 5, step: 12, midi: 69, length: 2 },
  { bar: 6, step: 0, midi: 67, length: 2 }, { bar: 6, step: 3, midi: 69, length: 1 }, { bar: 6, step: 6, midi: 72, length: 2 }, { bar: 6, step: 11, midi: 74, length: 2 },
  { bar: 7, step: 0, midi: 72, length: 3 }, { bar: 7, step: 6, midi: 69, length: 2 }, { bar: 7, step: 10, midi: 67, length: 2 }, { bar: 7, step: 14, midi: 69, length: 2 },
];

// F major: ii7–V7–Imaj7–vi7, with turnarounds and inversions across 16 bars.
const BUILD_CHORDS: readonly (readonly number[])[] = [
  [50, 57, 60, 65], [43, 53, 59, 62], [41, 57, 60, 64], [45, 55, 60, 64],
  [50, 57, 60, 65], [43, 53, 59, 65], [41, 57, 60, 64], [45, 55, 60, 64],
  [50, 57, 60, 64], [43, 53, 59, 62], [41, 52, 57, 64], [45, 55, 60, 64],
  [50, 57, 60, 65], [43, 53, 59, 62], [41, 57, 60, 64], [48, 55, 60, 64],
];
const TITLE_CHORDS: readonly (readonly number[])[] = [
  [53, 57, 60, 64], [48, 55, 60, 64], [50, 57, 60, 65], [45, 52, 55, 60],
  [53, 57, 60, 64], [48, 55, 60, 64], [50, 57, 60, 65], [43, 53, 59, 62],
];
const BATTLE_ROOTS = [41, 36, 38, 33, 41, 36, 38, 43] as const;

export class GameAudio {
  private ctx: AudioContext | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private track: Track | null = null;
  private stingerGain: GainNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private analyser: AnalyserNode | null = null;
  private levelData: Uint8Array<ArrayBuffer> | null = null;
  private desiredState: MusicState = "none";
  private intensity = 0;
  private _musicVolume = 0.45;
  private _sfxVolume = 0.7;
  private _muted = false;
  private effectEnds: number[] = [];
  private lastEffect = new Map<SfxName, number>();
  private coinStreak = 0;
  private stateSerial = 0;

  constructor() {
    try {
      const stored = JSON.parse(localStorage.getItem(KEY) || "null") as unknown;
      if (stored && typeof stored === "object") {
        const settings = stored as Record<string, unknown>;
        if (typeof settings.musicVolume === "number") this._musicVolume = clamp(settings.musicVolume);
        if (typeof settings.sfxVolume === "number") this._sfxVolume = clamp(settings.sfxVolume);
        if (typeof settings.muted === "boolean") this._muted = settings.muted;
      }
    } catch { /* Private mode, SSR, or unavailable storage. */ }
  }

  get musicVolume(): number { return this._musicVolume; }
  set musicVolume(v: number) { this.setMusicVolume(v); }
  get sfxVolume(): number { return this._sfxVolume; }
  set sfxVolume(v: number) { this.setSfxVolume(v); }
  get muted(): boolean { return this._muted; }
  set muted(v: boolean) { this.setMuted(v); }

  private save(): void {
    try { localStorage.setItem(KEY, JSON.stringify({ musicVolume: this._musicVolume, sfxVolume: this._sfxVolume, muted: this._muted })); } catch { /* Storage is optional. */ }
  }

  unlock(): void {
    try {
      if (this.ctx) { void this.ctx.resume().catch(() => undefined); return; }
      if (typeof window === "undefined") return;
      const Context = window.AudioContext;
      if (!Context) return;
      const ctx = new Context();
      const master = ctx.createGain();
      master.gain.value = 0.78;
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -18;
      compressor.knee.value = 18;
      compressor.ratio.value = 6;
      compressor.attack.value = 0.004;
      compressor.release.value = 0.18;
      master.connect(compressor).connect(ctx.destination);
      // Tap the mix so visuals can pulse with the music.
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.6;
      this.levelData = new Uint8Array(new ArrayBuffer(this.analyser.frequencyBinCount));
      compressor.connect(this.analyser);
      this.musicBus = ctx.createGain();
      this.sfxBus = ctx.createGain();
      this.musicBus.connect(master);
      this.sfxBus.connect(master);
      this.ctx = ctx;
      this.updateVolumes();
      void ctx.resume().catch(() => undefined);
      if (this.desiredState !== "none") this.setMusic(this.desiredState);
    } catch { /* Autoplay, device, or Web Audio failure must never break the game. */ }
  }

  /** Loudness of the low end (0–1) and of the whole mix (0–1), for audio-reactive visuals. */
  level(): { low: number; all: number } {
    const a = this.analyser,
      d = this.levelData;
    if (!a || !d || !this.ctx || this.ctx.state !== "running") return { low: 0, all: 0 };
    a.getByteFrequencyData(d);
    let low = 0,
      all = 0;
    for (let i = 0; i < d.length; i++) {
      all += d[i];
      if (i < 12) low += d[i];
    }
    return { low: low / (12 * 255), all: all / (d.length * 255) };
  }

  private updateVolumes(): void {
    try {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.musicBus?.gain.setTargetAtTime(this._muted ? 0 : this._musicVolume, t, 0.025);
      this.sfxBus?.gain.setTargetAtTime(this._muted ? 0 : this._sfxVolume, t, 0.025);
    } catch { /* Audio device may have disappeared. */ }
  }

  setMusicVolume(v: number): void { this._musicVolume = clamp(v); this.save(); this.updateVolumes(); }
  setSfxVolume(v: number): void { this._sfxVolume = clamp(v); this.save(); this.updateVolumes(); }
  setMuted(m: boolean): void { this._muted = !!m; this.save(); this.updateVolumes(); }

  setMusic(state: MusicState): void {
    try {
      this.desiredState = state;
      const ctx = this.ctx;
      if (!ctx || !this.musicBus) return;
      const now = ctx.currentTime;
      const previous = this.track;
      if (previous?.state === state) return;
      this.stateSerial++;
      if (previous) {
        previous.gain.gain.cancelScheduledValues(now);
        previous.gain.gain.setValueAtTime(previous.gain.gain.value, now);
        previous.gain.gain.linearRampToValueAtTime(0, now + 0.8);
        setTimeout(() => { try { previous.bass.disconnect(); previous.input.disconnect(); previous.filter.disconnect(); previous.gain.disconnect(); } catch { /* Already released. */ } }, 1100);
      }
      if (this.stingerGain) {
        const outgoing = this.stingerGain;
        outgoing.gain.cancelScheduledValues(now);
        outgoing.gain.setValueAtTime(outgoing.gain.value, now);
        outgoing.gain.linearRampToValueAtTime(0, now + 0.8);
        this.stingerGain = null;
      }
      this.track = null;
      if (state === "title" || state === "build" || state === "battle") {
        const input = ctx.createGain();
        const bass = ctx.createGain();
        bass.connect(input);
        const filter = ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = state === "battle" ? 1700 + this.intensity * 4500 : 6800;
        filter.Q.value = 0.55;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(state === "battle" ? 0.82 : 0.9, now + 0.8);
        input.connect(filter).connect(gain).connect(this.musicBus);
        this.track = { state, input, bass, filter, gain, nextTime: now + 0.03, step: 0, bpm: state === "title" ? 100 : state === "build" ? 88 : 132 };
        if (!this.timer) this.timer = setInterval(() => this.schedule(), 25);
        this.schedule();
      } else {
        if (this.timer) { clearInterval(this.timer); this.timer = null; }
        if (state === "victory" || state === "defeat") {
          const input = ctx.createGain();
          const gain = ctx.createGain();
          gain.gain.setValueAtTime(0, now);
          gain.gain.linearRampToValueAtTime(0.9, now + 0.08);
          gain.gain.setValueAtTime(0.9, now + 2.55);
          gain.gain.linearRampToValueAtTime(0, now + 3.1);
          input.connect(gain).connect(this.musicBus);
          this.stingerGain = gain;
          this.stinger(state, input, now + 0.08, 1);
          const serial = this.stateSerial;
          setTimeout(() => {
            try { input.disconnect(); gain.disconnect(); } catch { /* Already released. */ }
            if (this.stingerGain === gain) this.stingerGain = null;
            if (this.stateSerial === serial) this.desiredState = "none";
          }, 3400);
        }
      }
    } catch { /* Keep game logic independent of audio output. */ }
  }

  setIntensity(v: number): void {
    try {
      this.intensity = clamp(v);
      if (this.ctx && this.track?.state === "battle") {
        this.track.filter.frequency.setTargetAtTime(1700 + this.intensity * 4500, this.ctx.currentTime, 0.15);
      }
    } catch { /* Safe before unlock and on device failure. */ }
  }

  private schedule(): void {
    try {
      const ctx = this.ctx;
      const track = this.track;
      if (!ctx || !track || ctx.state !== "running") return;
      let count = 0;
      while (track.nextTime < ctx.currentTime + 0.12 && count++ < 16) {
        this.musicStep(track, track.step, track.nextTime);
        track.nextTime += 60 / track.bpm / 4;
        track.step++;
      }
      if (count >= 16 && track.nextTime < ctx.currentTime) track.nextTime = ctx.currentTime + 0.02;
    } catch { /* Scheduler stays silent if a node fails. */ }
  }

  private musicStep(tr: Track, step: number, t: number): void {
    const beat = 60 / tr.bpm;
    const s = step % 16;
    const bar = Math.floor(step / 16);
    if (tr.state === "title") {
      const chord = TITLE_CHORDS[bar % 8];
      if (s === 0) {
        this.pad(tr.input, chord, t, beat * 3.5, 0.042);
        this.kick(tr.input, t, 0.19);
      }
      if (s === 8) this.kick(tr.input, t, 0.11);
      if (s === 4 || s === 12) this.snare(tr.input, t, 0.085);
      if (s % 4 === 2) this.hat(tr.input, t, 0.025);
      for (const n of THEME) if (n.bar === bar % 8 && n.step === s) this.pluck(tr.input, hz(n.midi), t, beat * n.length / 4, 0.085);
      if (s === 0) this.tone(tr.input, hz(chord[0] - 12), t, beat * 0.75, "triangle", 0.12, 0.008, 0.08, 900);
      if (bar % 8 === 7 && s === 14) this.beep(tr.input, hz(84), t, 0.07, 0.018);
    } else if (tr.state === "build") {
      const chord = BUILD_CHORDS[bar % 16];
      if (s === 0) {
        this.rhodes(tr.input, chord, t, beat * 3.7, 0.057);
        this.kick(tr.input, t, 0.13);
        this.tone(tr.input, hz(chord[0] - 12), t, beat * 0.8, "sine", 0.095, 0.01, 0.12, 600);
      }
      if (s === 10 && bar % 4 !== 3) this.kick(tr.input, t, 0.055);
      if (s === 4 || s === 12) this.snare(tr.input, t, 0.05);
      if (s % 4 === 2) this.hat(tr.input, t, 0.013);
      if (s === 7 && bar % 4 === 3) this.beep(tr.input, hz(chord[2] + 24), t, 0.09, 0.012);
      if (s === 0) this.hiss(tr.input, t, beat * 4, 0.006);
      if (s === 14 && bar % 8 === 7) this.beep(tr.input, hz(chord[3] + 12), t, 0.14, 0.014);
    } else {
      const root = BATTLE_ROOTS[bar % 8];
      if (s === 0 || s === 8) {
        this.kick(tr.input, t, s === 0 ? 0.27 : 0.21);
        // Duck only the bass on each kick; the rest of the mix keeps its attack.
        tr.bass.gain.setValueAtTime(0.48, t);
        tr.bass.gain.linearRampToValueAtTime(1, t + 0.2);
      }
      if (s === 4 || s === 12) this.snare(tr.input, t, 0.16);
      if (s % 2 === 0) this.hat(tr.input, t, 0.024);
      if (this.intensity > 0.42 && s % 2 === 1) this.hat(tr.input, t, 0.011 + this.intensity * 0.013);
      if (s % 4 === 0 || s === 6 || s === 14) {
        const intervals = [0, 7, 12, 7];
        this.tone(tr.bass, hz(root + intervals[Math.floor(s / 4)]), t, beat * 0.23, "sawtooth", 0.13, 0.004, 0.07, 900 + this.intensity * 1100);
      }
      for (const n of THEME) if (n.bar === bar % 8 && n.step === s) this.pluck(tr.input, hz(n.midi + 7), t, beat * n.length / 4, 0.065);
      if (this.intensity > 0.65 && s % 2 === 0) {
        const arp = [0, 3, 7, 12, 7, 3, 10, 7];
        this.beep(tr.input, hz(root + 36 + arp[s / 2]), t, beat * 0.11, 0.018 * this.intensity);
      }
      if (s === 15 && bar % 4 === 3) this.modem(tr.input, t, 0.09, 0.016);
    }
  }

  private tone(out: AudioNode, freq: number, t: number, dur: number, wave: Wave, vol: number, attack = 0.005, release = 0.08, cutoff = 8000, endFreq?: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const amp = ctx.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(Math.max(20, freq), t);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + Math.max(0.02, dur));
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    filter.Q.value = 0.4;
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(vol, t + attack);
    amp.gain.setValueAtTime(vol * 0.78, t + Math.max(attack, dur));
    amp.gain.linearRampToValueAtTime(0, t + dur + release);
    osc.connect(filter).connect(amp).connect(out);
    osc.start(t);
    osc.stop(t + dur + release + 0.015);
    osc.onended = () => { try { osc.disconnect(); filter.disconnect(); amp.disconnect(); } catch { /* Released. */ } };
  }

  private pluck(out: AudioNode, freq: number, t: number, dur: number, vol: number): void {
    this.tone(out, freq, t, Math.min(dur, 0.25), "square", vol, 0.003, 0.075, 2500);
    this.tone(out, freq * 2, t, Math.min(dur, 0.11), "sine", vol * 0.24, 0.002, 0.07, 5000);
  }

  private beep(out: AudioNode, freq: number, t: number, dur: number, vol: number): void {
    this.tone(out, freq, t, dur, "sine", vol, 0.002, 0.035, 6500);
  }

  // Rhodes approximation: a soft sine carrier with a fast-decaying second harmonic.
  private rhodes(out: AudioNode, chord: readonly number[], t: number, dur: number, vol: number): void {
    for (const note of chord) {
      const f = hz(note);
      this.tone(out, f, t, dur, "sine", vol, 0.012, 0.28, 4600);
      this.tone(out, f * 2.01, t, Math.min(0.24, dur), "sine", vol * 0.19, 0.004, 0.18, 5200);
    }
  }

  private pad(out: AudioNode, chord: readonly number[], t: number, dur: number, vol: number): void {
    for (const note of chord.slice(1)) {
      this.tone(out, hz(note), t, dur, "triangle", vol, 0.16, 0.38, 3000);
    }
  }

  private noise(out: AudioNode, t: number, dur: number, vol: number, type: BiquadFilterType, cutoff: number, attack = 0.002, release = 0.04): void {
    const ctx = this.ctx!;
    if (!this.noiseBuffer) {
      const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuffer = buffer;
    }
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.loop = dur > 1.9;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = cutoff;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(vol, t + attack);
    amp.gain.setValueAtTime(vol, t + Math.max(attack, dur));
    amp.gain.linearRampToValueAtTime(0, t + dur + release);
    source.connect(filter).connect(amp).connect(out);
    source.start(t, Math.random() * 0.75);
    source.stop(t + dur + release + 0.01);
    source.onended = () => { try { source.disconnect(); filter.disconnect(); amp.disconnect(); } catch { /* Released. */ } };
  }

  private kick(out: AudioNode, t: number, vol: number): void {
    this.tone(out, 150, t, 0.11, "sine", vol, 0.002, 0.06, 600, 48);
    this.noise(out, t, 0.011, vol * 0.16, "lowpass", 1100);
  }
  private snare(out: AudioNode, t: number, vol: number): void {
    this.noise(out, t, 0.095, vol, "bandpass", 1900, 0.002, 0.04);
    this.tone(out, 180, t, 0.055, "triangle", vol * 0.25, 0.002, 0.04, 900);
  }
  private hat(out: AudioNode, t: number, vol: number): void { this.noise(out, t, 0.025, vol, "highpass", 6200, 0.001, 0.018); }
  private hiss(out: AudioNode, t: number, dur: number, vol: number): void { this.noise(out, t, dur, vol, "lowpass", 1800, 0.04, 0.08); }
  private modem(out: AudioNode, t: number, dur: number, vol: number): void {
    this.noise(out, t, dur, vol * 0.4, "bandpass", 2600);
    this.tone(out, 1100, t, dur * 0.47, "square", vol, 0.002, 0.012, 2200, 1350);
    this.tone(out, 1500, t + dur * 0.5, dur * 0.47, "square", vol * 0.8, 0.002, 0.012, 2400, 800);
  }

  private stinger(kind: "victory" | "defeat", out: AudioNode, t: number, scale: number): void {
    if (kind === "victory") {
      const notes = [60, 64, 67, 72, 76, 79, 84];
      notes.forEach((n, i) => this.pluck(out, hz(n), t + i * 0.23, i === 6 ? 0.72 : 0.2, 0.085 * scale));
      [60, 64, 67, 72].forEach(n => this.tone(out, hz(n), t + 1.52, 1.2, "triangle", 0.06 * scale, 0.03, 0.36, 4500));
      this.noise(out, t + 1.48, 0.28, 0.035 * scale, "highpass", 4400, 0.015, 0.2);
    } else {
      [72, 69, 65, 60, 57].forEach((n, i) => this.tone(out, hz(n), t + i * 0.32, 0.29, "triangle", 0.09 * scale, 0.01, 0.15, 1900));
      this.tone(out, hz(45), t + 1.58, 0.8, "sine", 0.095 * scale, 0.025, 0.28, 800, 95);
      this.modem(out, t + 2.14, 0.3, 0.045 * scale);
    }
  }

  sfx(name: SfxName, opts: SfxOptions = {}): void {
    try {
      const ctx = this.ctx;
      if (!ctx || !this.sfxBus || ctx.state !== "running" || this._muted) return;
      const now = ctx.currentTime;
      const limit = name === "hover" ? 0.05 : name === "coin" ? 1 / 14 : name === "hit" ? 1 / 12 : name === "thud" ? 1 / 22 : 0;
      const sincePrevious = now - (this.lastEffect.get(name) ?? -100);
      if (sincePrevious < limit) return;
      this.effectEnds = this.effectEnds.filter(end => end > now);
      if (this.effectEnds.length >= 24) return;
      this.lastEffect.set(name, now);
      const t = now + 0.005;
      const p = clamp(opts.pitch ?? 1, 0.25, 4) * (1 + (Math.random() - 0.5) * 0.06);
      const v = clamp(opts.volume ?? 1, 0, 2);
      const bus = ctx.createGain();
      bus.gain.value = v;
      const pan = ctx.createStereoPanner();
      pan.pan.value = clamp(opts.pan ?? 0, -1, 1);
      bus.connect(pan).connect(this.sfxBus);
      let length = 0.3;
      const tone = (f: number, at: number, d: number, wave: Wave, a: number, end?: number, cutoff = 5000): void =>
        this.tone(bus, f * p, t + at, d, wave, a, 0.002, 0.045, cutoff, end && end * p);
      const noise = (at: number, d: number, a: number, type: BiquadFilterType, cutoff: number): void =>
        this.noise(bus, t + at, d, a, type, cutoff);
      switch (name) {
        case "hover": tone(1350, 0, 0.009, "sine", 0.018); length = 0.07; break;
        case "click": tone(850, 0, 0.018, "triangle", 0.09, 470); noise(0, 0.012, 0.018, "highpass", 3500); length = 0.1; break;
        case "toggle": tone(540, 0, 0.055, "square", 0.045, undefined, 1700); tone(810, 0.065, 0.075, "sine", 0.055); length = 0.2; break;
        case "pick": tone(420, 0, 0.13, "sine", 0.09, 740); length = 0.2; break;
        case "drop": tone(145, 0, 0.095, "triangle", 0.13, 75, 700); noise(0, 0.025, 0.025, "lowpass", 1100); length = 0.18; break;
        case "snap":
          tone(290, 0, 0.025, "triangle", 0.17, 150); noise(0, 0.017, 0.06, "highpass", 3200);
          tone(510, 0.056, 0.027, "square", 0.11, 350, 2200);
          tone(880, 0.075, 0.2, "sine", 0.09); tone(1320, 0.16, 0.25, "sine", 0.07);
          length = 0.49; break;
        case "set":
          [0, 4, 7, 12, 16].forEach((n, i) => { tone(hz(60 + n), i * 0.095, 0.18, "sine", 0.07); tone(hz(72 + n), i * 0.095, 0.1, "triangle", 0.024); });
          noise(0.37, 0.15, 0.025, "highpass", 5100); length = 0.73; break;
        case "buy": tone(970, 0, 0.065, "square", 0.05, 1380, 3000); tone(1480, 0.09, 0.19, "sine", 0.075); length = 0.36; break;
        case "coin": {
          this.coinStreak = sincePrevious < 0.45 ? Math.min(7, this.coinStreak + 1) : 0;
          tone(1250 * (1 + this.coinStreak * 0.035), 0, 0.15, "sine", 0.085);
          tone(2500 * (1 + this.coinStreak * 0.035), 0.003, 0.055, "sine", 0.022);
          length = 0.23; break;
        }
        case "sell": tone(1500, 0, 0.12, "sine", 0.07, 920); tone(750, 0.08, 0.11, "triangle", 0.045, 430); length = 0.24; break;
        case "reroll": noise(0, 0.24, 0.065, "bandpass", 2400); tone(360, 0.06, 0.2, "triangle", 0.04, 900); length = 0.34; break;
        case "error": tone(175, 0, 0.085, "sawtooth", 0.07, undefined, 720); tone(150, 0.14, 0.1, "sawtooth", 0.07, undefined, 650); length = 0.3; break;
        case "deploy":
          noise(0, 0.75, 0.07, "bandpass", 1700); tone(180, 0, 0.6, "sine", 0.065, 650);
          [0.22, 0.39, 0.56, 0.73].forEach((at, i) => tone(690 + i * 220, at, 0.08, "square", 0.05, undefined, 3000));
          length = 0.88; break;
        case "versus":
          noise(0, 0.38, 0.12, "highpass", 2800); this.kick(bus, t + 0.34, 0.34);
          tone(74, 0.34, 0.45, "sine", 0.23, 38); noise(0.34, 0.19, 0.09, "lowpass", 1000);
          length = 0.9; break;
        case "countdown": tone(840, 0, 0.045, "square", 0.07, undefined, 2000); length = 0.12; break;
        case "hit": tone(210, 0, 0.04, "triangle", 0.14, 95); noise(0, 0.025, 0.065, "bandpass", 1500); length = 0.12; break;
        case "steal": noise(0, 0.21, 0.045, "highpass", 2200); tone(710, 0.04, 0.16, "sine", 0.065, 1100); length = 0.28; break;
        case "block": tone(390, 0, 0.075, "square", 0.08, 250, 1600); tone(260, 0.09, 0.075, "square", 0.06, undefined, 1200); length = 0.23; break;
        case "lag": tone(470, 0, 0.43, "triangle", 0.085, 190, 1200); tone(240, 0.11, 0.32, "sine", 0.04, 125); length = 0.53; break;
        case "crash": noise(0, 0.17, 0.12, "bandpass", 1800); this.modem(bus, t + 0.08, 0.2, 0.07); tone(690, 0.16, 0.53, "sawtooth", 0.085, 55, 1400); length = 0.78; break;
        case "levelup": tone(220, 0, 0.55, "sawtooth", 0.075, 880, 2500); [0.12, 0.27, 0.42].forEach((at, i) => tone(hz(72 + i * 4), at, 0.24, "sine", 0.06)); length = 0.74; break;
        case "victory": this.stinger("victory", bus, t, 0.8); length = 3.1; break;
        case "defeat": this.stinger("defeat", bus, t, 0.8); length = 3.1; break;
        case "reward": [72, 76, 79, 84].forEach((n, i) => tone(hz(n), i * 0.11, 0.36, "sine", 0.055)); noise(0.26, 0.25, 0.025, "highpass", 5200); length = 0.76; break;
        case "post": tone(1000, 0, 0.16, "square", 0.08, undefined, 3000); length = 0.22; break;
        case "dialup":
          // 56k handshake, abridged: dial tones, carrier squeal, bursty noise.
          [697, 1209, 852, 1336, 941, 1477].forEach((f, i) => tone(f, (i >> 1) * 0.09, 0.07, "sine", 0.05));
          tone(2100, 0.32, 0.35, "sine", 0.05); tone(1650, 0.7, 0.18, "square", 0.035, 980, 3000);
          this.modem(bus, t + 0.9, 0.45, 0.06); noise(1.0, 0.5, 0.05, "bandpass", 2400);
          length = 1.6; break;
        case "whoosh":
          this.noise(bus, t, 0.45, 0.22, "bandpass", 900, 0.12, 0.2); tone(180, 0, 0.5, "sine", 0.12, 900, 2000);
          this.kick(bus, t + 0.42, 0.4); length = 0.9; break;
        case "rumble":
          // Heavy rolling rumble for the OS upgrade: sub sweep, swelling low noise, gritty mid layer, closing boom.
          tone(62, 0, 1.7, "sine", 0.32, 34, 400);
          tone(46, 0.05, 1.6, "triangle", 0.18, 30, 300);
          this.noise(bus, t, 1.6, 0.34, "lowpass", 260, 0.25, 0.35);
          this.noise(bus, t + 0.1, 1.3, 0.12, "bandpass", 700, 0.3, 0.3);
          for (let i = 0; i < 14; i++) { const at = 0.08 + i * 0.11 + Math.random() * 0.05; tone(95 + Math.random() * 60, at, 0.06, "triangle", 0.16, 45, 900); }
          this.kick(bus, t + 1.62, 0.55); tone(58, 1.62, 0.55, "sine", 0.34, 28, 300);
          this.noise(bus, t + 1.62, 0.3, 0.2, "lowpass", 900, 0.004, 0.25);
          length = 2.3; break;
        case "thud":
          tone(120, 0, 0.07, "triangle", 0.2, 50, 700); tone(70, 0, 0.1, "sine", 0.22, 38, 300);
          noise(0, 0.03, 0.09, "bandpass", 1300); length = 0.16; break;
        case "tutorial": tone(880, 0, 0.28, "sine", 0.055); tone(1320, 0.003, 0.2, "sine", 0.018); length = 0.37; break;
      }
      this.effectEnds.push(t + length);
      setTimeout(() => { try { bus.disconnect(); pan.disconnect(); } catch { /* Released. */ } }, Math.ceil((length + 0.2) * 1000));
    } catch { /* Effects are optional; gameplay must continue. */ }
  }
}

export const audio = new GameAudio();
export default audio;
