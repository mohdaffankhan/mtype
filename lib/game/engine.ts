import { TIERS, WORDS } from './words';
import { hashSeed, mulberry32, type Rng } from './rng';
import { isLethal, usesWaves, RACE_WAVES, SPRINT_SECONDS, type ModeId } from './modes';
import type { Sfx } from '../audio';

const TAU = Math.PI * 2;
const C = {
  bg: '#0a0c10',
  bgLift: '#13161d',
  fg: '#f1ede4',
  muted: '#959ba5',
  accent: '#e8ad5f',
  danger: '#e07a63',
  rockLight: '#22262e',
  rockDark: '#101217',
  rockEdge: '#363c46',
  hull: '#1c2027',
};

const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
};
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/** Clean-word charge needed to launch one attack in Versus. */
export const ATTACK_COST = 3;

export interface HudState {
  mode: ModeId;
  wave: number;
  score: number;
  wpm: number;
  acc: number;
  streak: number;
  mult: number;
  charge: number;
  timeLeft: number | null;
  alive: boolean;
}

export type EndReason = 'breach' | 'time' | 'finished' | 'quit' | 'match';

export interface RunResult {
  mode: ModeId;
  reason: EndReason;
  score: number;
  wave: number;
  wpm: number;
  acc: number;
  words: number;
  bestStreak: number;
}

export interface EngineHandlers {
  onHud?(h: HudState): void;
  onEnd?(r: RunResult): void;
  onAttack?(n: number): void;
}

export interface RunOptions {
  mode: ModeId;
  seed: number;
  countdown?: number;
}

type Vec = [number, number];

interface Asteroid {
  word: string;
  typed: number;
  hits: number;
  verts: Vec[];
  craters: [number, number, number][];
  r: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  rot: number;
  spin: number;
  speed: number;
  push: number;
  flash: number;
  err: number;
  born: number;
  doomed: boolean;
  clean: boolean;
  junk: boolean;
  /** 0→1 lock-on animation, eased toward 1 while targeted. */
  lock: number;
  /** Smoothed "is target" for label scale/glow. */
  focus: number;
  /** Pop on the most recently typed letter. */
  pop: number;
}

interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string }
interface Shard { x: number; y: number; vx: number; vy: number; rot: number; spin: number; life: number; max: number; pts: Vec[]; ship?: boolean }
interface Ring { x: number; y: number; r0: number; r1: number; life: number; max: number; color: string }
interface Popup { x: number; y: number; text: string; life: number; max: number; color: string; big?: boolean }
interface Bullet { x: number; y: number; dx: number; dy: number; target: Asteroid; speed: number }
interface Banner { title: string; sub: string; t: number; dur: number }
interface PlanItem { word: string; xf: number; speedMul: number; gap: number }

interface WaveCfg {
  count: number;
  travel: number; // seconds from top of screen to ship
  interval: number;
  pair: number; // chance of a second asteroid in the same beat
  weights: number[];
}

export function waveConfig(n: number): WaveCfg {
  return {
    count: Math.round(5 + n * 2.2),
    travel: Math.max(5.5, 17 - n * 1.1),
    interval: Math.max(0.55, 2.4 - n * 0.17),
    pair: clamp((n - 2) * 0.05, 0, 0.35),
    weights: [
      Math.max(0.15, 1 - 0.12 * (n - 1)),
      Math.min(1, 0.25 + 0.15 * (n - 1)),
      n >= 3 ? Math.min(0.9, 0.12 * (n - 2)) : 0,
      n >= 5 ? Math.min(0.6, 0.08 * (n - 4)) : 0,
    ],
  };
}

function pickTier(weights: number[], r: Rng): number {
  const total = weights.reduce((s, w) => s + w, 0);
  let x = r() * total;
  let tier = 0;
  while (x > weights[tier] && tier < weights.length - 1) x -= weights[tier++];
  return tier;
}

/**
 * Every wave is generated up front from (seed, wave) alone, so players sharing a seed
 * see identical words, positions and timing no matter how they play.
 */
function buildWave(seed: number, n: number): PlanItem[] {
  const r = mulberry32(hashSeed(seed, n));
  const cfg = waveConfig(n);
  const items: PlanItem[] = [];
  const recent: string[] = [];
  const used = new Set<string>();
  for (let i = 0; i < cfg.count; i++) {
    let word = 'void';
    for (let tries = 0; tries < 40; tries++) {
      const list = WORDS[TIERS[pickTier(cfg.weights, r)]];
      word = list[Math.floor(r() * list.length)];
      if (used.has(word)) continue;
      // Keep leading letters distinct among neighbours so a keystroke is rarely ambiguous.
      if (tries < 30 && recent.includes(word[0])) continue;
      break;
    }
    used.add(word);
    recent.push(word[0]);
    if (recent.length > 4) recent.shift();
    const paired = i > 0 && r() < cfg.pair;
    items.push({
      word,
      xf: 0.08 + r() * 0.84,
      speedMul: 0.85 + r() * 0.3,
      gap: i === 0 || paired ? 0 : cfg.interval * (0.7 + r() * 0.6),
    });
  }
  return items;
}

const WAVE_NAMES = [
  'Clear skies', 'Loose debris', 'Thickening', 'Crossfire', 'The belt',
  'Heavy traffic', 'Deep field', 'Storm front', 'No quarter',
];

const SHIP_SHAPE: Vec[] = [[0, -22], [14, 14], [4, 9], [-4, 9], [-14, 14]];

type State = 'idle' | 'countdown' | 'playing' | 'paused' | 'dying' | 'over';

export class Engine {
  private ctx: CanvasRenderingContext2D;
  private W = 0;
  private H = 0;
  private bg: CanvasGradient | null = null;
  private clock = 0;
  private stars: { x: number; y: number; z: number; tw: number }[] = [];
  private ship = { x: 0, y: 0, r: 18, angle: -Math.PI / 2, kick: 0, flash: 0, dead: false };
  private fontUi = 'system-ui, sans-serif';
  private fontMono = 'ui-monospace, Consolas, monospace';

  private state: State = 'idle';
  private mode: ModeId = 'classic';
  private seed = 0;
  private handlers: EngineHandlers = {};

  private wave = 0;
  private score = 0;
  private correct = 0;
  private errors = 0;
  private words = 0;
  private activeTime = 0;
  private elapsed = 0;
  private streak = 0;
  private bestStreak = 0;
  private charge = 0;

  private asteroids: Asteroid[] = [];
  private bullets: Bullet[] = [];
  private particles: Particle[] = [];
  private shards: Shard[] = [];
  private rings: Ring[] = [];
  private popups: Popup[] = [];
  private target: Asteroid | null = null;

  private phase: 'intermission' | 'spawning' | 'cleared' | 'stream' = 'intermission';
  private phaseT = 0;
  private plan: PlanItem[] = [];
  private planIdx = 0;
  private spawnT = 0;
  private cfg: WaveCfg = waveConfig(1);

  private banner: Banner | null = null;
  private shake = 0;
  private timeScale = 1;
  private dyingT = 0;
  private countdownT = 0;
  private lastCount = 0;
  private incoming = 0;
  private incomingT = 0;
  private incomingFlash = 0;

  private hudT = 0;
  private ended = false;
  private raf = 0;
  private bgTimer: ReturnType<typeof setInterval> | undefined;
  private last = 0;

  constructor(private canvas: HTMLCanvasElement, private sfx: Sfx) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not supported');
    this.ctx = ctx;
    const css = getComputedStyle(document.documentElement);
    const ui = css.getPropertyValue('--font-ui').trim();
    const mono = css.getPropertyValue('--font-mono').trim();
    if (ui) this.fontUi = `${ui}, ${this.fontUi}`;
    if (mono) this.fontMono = `${mono}, ${this.fontMono}`;
    this.resize();
    window.addEventListener('resize', this.resize);
    window.visualViewport?.addEventListener('resize', this.resize);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
    this.bgTimer = setInterval(this.hiddenTick, 250);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    clearInterval(this.bgTimer);
    window.removeEventListener('resize', this.resize);
    window.visualViewport?.removeEventListener('resize', this.resize);
  }

  setHandlers(h: EngineHandlers) {
    this.handlers = h;
  }

  // ---------------------------------------------------------------- public control

  startRun(opts: RunOptions) {
    this.mode = opts.mode;
    this.seed = opts.seed;
    this.wave = 0;
    this.score = 0;
    this.correct = 0;
    this.errors = 0;
    this.words = 0;
    this.activeTime = 0;
    this.elapsed = 0;
    this.streak = 0;
    this.bestStreak = 0;
    this.charge = 0;
    this.asteroids = [];
    this.bullets = [];
    this.particles = [];
    this.shards = [];
    this.rings = [];
    this.popups = [];
    this.target = null;
    this.plan = [];
    this.planIdx = 0;
    this.banner = null;
    this.shake = 0;
    this.timeScale = 1;
    this.dyingT = 0;
    this.incoming = 0;
    this.incomingT = 0;
    this.incomingFlash = 0;
    this.ended = false;
    this.ship.dead = false;
    this.ship.angle = -Math.PI / 2;

    const cd = opts.countdown ?? 0;
    if (cd > 0) {
      this.state = 'countdown';
      this.countdownT = cd;
      this.lastCount = Math.ceil(cd);
      this.sfx.count(false);
    } else {
      this.state = 'playing';
      this.begin();
    }
    this.emitHud();
  }

  /** Back to the ambient menu background. */
  toIdle() {
    this.state = 'idle';
    this.asteroids = [];
    this.bullets = [];
    this.target = null;
    this.banner = null;
    this.incoming = 0;
    this.ship.dead = false;
    this.timeScale = 1;
  }

  pause() {
    if (this.state !== 'playing') return false;
    this.state = 'paused';
    return true;
  }

  resume() {
    if (this.state !== 'paused') return false;
    this.state = 'playing';
    return true;
  }

  /** End the run from outside (quit, match over). No-op if already ending. */
  endRun(reason: EndReason) {
    if (this.state === 'playing' || this.state === 'paused' || this.state === 'countdown') this.finish(reason);
  }

  /** Versus: a rival sent asteroids our way. */
  addIncoming(n: number) {
    if (this.state !== 'playing' && this.state !== 'countdown') return;
    this.incoming += n;
    this.incomingFlash = 1.8;
    if (this.incomingT <= 0) this.incomingT = 0.6;
    this.sfx.incoming();
  }

  /** Text from an on-screen keyboard, which doesn't send usable key events. */
  typeText(text: string) {
    if (this.state !== 'playing') return;
    for (const c of text.toLowerCase()) if (c >= 'a' && c <= 'z') this.typeChar(c);
  }

  releaseLock() {
    if (this.state === 'playing') this.target = null;
  }

  /** Returns true if the key was consumed by the game. */
  handleKey(e: KeyboardEvent): boolean {
    if (this.state !== 'playing') return false;
    const k = e.key;
    if (k === 'Backspace') { this.target = null; return true; }
    if (k === ' ') return true;
    if (k.length === 1) {
      const c = k.toLowerCase();
      if (c >= 'a' && c <= 'z') { this.typeChar(c); return true; }
    }
    return false;
  }

  // ---------------------------------------------------------------- layout

  private resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    // The visual viewport excludes an open on-screen keyboard, so the ship stays visible above it.
    const vv = window.visualViewport;
    const prevW = this.W;
    this.W = Math.round(vv?.width ?? window.innerWidth);
    this.H = Math.round(vv?.height ?? window.innerHeight);
    this.canvas.width = Math.round(this.W * dpr);
    this.canvas.height = Math.round(this.H * dpr);
    this.canvas.style.width = this.W + 'px';
    this.canvas.style.height = this.H + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ship.x = this.W / 2;
    this.ship.y = this.H - Math.max(72, this.H * 0.11);
    const g = this.ctx.createRadialGradient(this.W / 2, this.H, 0, this.W / 2, this.H, Math.max(this.W, this.H) * 0.9);
    g.addColorStop(0, C.bgLift);
    g.addColorStop(1, C.bg);
    this.bg = g;
    // Keyboard open/close only changes height; keep the starfield so it doesn't flicker.
    if (this.W === prevW && this.stars.length) return;
    const n = Math.min(320, Math.round((this.W * this.H) / 5200));
    this.stars = Array.from({ length: n }, () => ({
      x: Math.random() * this.W, y: Math.random() * this.H, z: rand(0.15, 1), tw: Math.random() * TAU,
    }));
  };

  // ---------------------------------------------------------------- flow

  private begin() {
    if (usesWaves(this.mode)) {
      this.nextWave();
      return;
    }
    this.phase = 'stream';
    this.wave = 1;
    this.spawnT = 0.8;
    this.banner = this.mode === 'sprint'
      ? { title: 'Sprint', sub: `${SPRINT_SECONDS} seconds — go`, t: 0, dur: 1.8 }
      : { title: 'Zen', sub: 'Breathe. Type.', t: 0, dur: 2.2 };
    this.sfx.wave();
  }

  private nextWave() {
    this.wave++;
    this.cfg = waveConfig(this.wave);
    this.plan = buildWave(this.seed, this.wave);
    this.planIdx = 0;
    this.spawnT = 0;
    this.phase = 'intermission';
    this.phaseT = 2.4;
    const name = this.mode === 'race'
      ? `${this.wave} of ${RACE_WAVES}`
      : WAVE_NAMES[this.wave - 1] ?? 'Hold the line';
    this.banner = { title: `Wave ${this.wave}`, sub: name, t: 0, dur: 2.4 };
    this.sfx.wave();
  }

  private streamCfg(): WaveCfg {
    if (this.mode === 'zen') return { ...waveConfig(2), travel: 22, interval: 2.4 };
    const c = waveConfig(Math.min(10, 2 + Math.floor(this.elapsed / 8)));
    return { ...c, interval: c.interval * 0.75 };
  }

  private finish(reason: EndReason) {
    if (this.ended) return;
    this.state = 'over';
    this.target = null;
    // Clear the sky so the end screen sits over a calm field.
    for (const a of [...this.asteroids]) this.explode(a, false);
    if (reason === 'finished') {
      this.banner = { title: 'Course complete', sub: `All ${RACE_WAVES} waves cleared`, t: 0, dur: 2.6 };
      this.sfx.win();
    } else if (reason === 'time') {
      this.banner = { title: 'Time', sub: `${this.score.toLocaleString()} points`, t: 0, dur: 2.2 };
      this.sfx.cleared();
    }
    this.emitEnd(reason);
  }

  private emitEnd(reason: EndReason) {
    if (this.ended) return;
    this.ended = true;
    const { wpm, acc } = this.stats();
    this.emitHud();
    this.handlers.onEnd?.({
      mode: this.mode, reason, score: this.score, wave: this.wave, wpm, acc,
      words: this.words, bestStreak: this.bestStreak,
    });
  }

  private stats() {
    const minutes = this.activeTime / 60;
    const wpm = minutes > 0.05 ? Math.round(this.correct / 5 / minutes) : 0;
    const total = this.correct + this.errors;
    const acc = total ? Math.round((this.correct / total) * 100) : 100;
    return { wpm, acc };
  }

  private mult() {
    return 1 + Math.min(this.streak, 20) * 0.05;
  }

  private emitHud() {
    if (!this.handlers.onHud) return;
    const { wpm, acc } = this.stats();
    this.handlers.onHud({
      mode: this.mode,
      wave: this.wave,
      score: this.score,
      wpm,
      acc,
      streak: this.streak,
      mult: this.mult(),
      charge: this.charge,
      timeLeft: this.mode === 'sprint' ? Math.max(0, SPRINT_SECONDS - this.elapsed) : null,
      alive: !this.ship.dead,
    });
  }

  // ---------------------------------------------------------------- spawning

  private pickLiveWord(weights: number[]): string {
    const leads = new Set(this.asteroids.filter((a) => !a.doomed).map((a) => a.word[a.typed]));
    const onScreen = new Set(this.asteroids.map((a) => a.word));
    let word = 'void';
    for (let tries = 0; tries < 40; tries++) {
      const list = WORDS[TIERS[pickTier(weights, Math.random)]];
      word = list[Math.floor(Math.random() * list.length)];
      if (onScreen.has(word)) continue;
      if (tries < 30 && leads.has(word[0])) continue;
      break;
    }
    return word;
  }

  private spawn(word: string, xf: number, speedMul: number, travel: number, junk = false) {
    const r = 15 + Math.min(word.length, 13) * 1.7;
    const n = 9 + Math.floor(Math.random() * 4);
    const verts: Vec[] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rand(-0.18, 0.18);
      const d = r * rand(0.78, 1.04);
      verts.push([Math.cos(a) * d, Math.sin(a) * d]);
    }
    const craters = Array.from({ length: 2 + Math.floor(Math.random() * 2) }, (): [number, number, number] => {
      const a = Math.random() * TAU, d = Math.random() * r * 0.5;
      return [Math.cos(a) * d, Math.sin(a) * d, r * rand(0.1, 0.22)];
    });
    const margin = Math.min(80, this.W * 0.1);
    let x = margin + xf * (this.W - margin * 2);
    // Nudge away from fresh neighbours so rocks and labels don't stack.
    for (let tries = 0; tries < 10; tries++) {
      if (!this.asteroids.some((a) => a.y < this.H * 0.3 && Math.abs(a.x - x) < 140)) break;
      x = rand(margin, this.W - margin);
    }
    this.asteroids.push({
      word, typed: 0, hits: 0, verts, craters, r,
      x, y: -r - 8, dx: 0, dy: 1,
      rot: Math.random() * TAU, spin: rand(-0.5, 0.5),
      speed: (this.H / travel) * speedMul,
      push: 0, flash: 0, err: 0, born: 0,
      doomed: false, clean: true, junk,
      lock: 0, focus: 0, pop: 0,
    });
  }

  // ---------------------------------------------------------------- input

  private typeChar(c: string) {
    let t = this.target;
    if (!t) {
      let best: Asteroid | null = null;
      let bd = Infinity;
      for (const a of this.asteroids) {
        if (a.doomed || a.y + a.r < 0 || a.word[a.typed] !== c) continue;
        const d = Math.hypot(this.ship.x - a.x, this.ship.y - a.y);
        if (d < bd) { bd = d; best = a; }
      }
      if (!best) {
        if (this.asteroids.some((a) => !a.doomed)) this.miss(null);
        return;
      }
      t = this.target = best;
      t.lock = 0;
    } else if (t.word[t.typed] !== c) {
      this.miss(t);
      return;
    }
    t.typed++;
    t.pop = 1;
    this.correct++;
    this.fire(t);
    this.sfx.shot(t.typed / t.word.length);
    if (t.typed >= t.word.length) {
      t.doomed = true;
      this.target = null;
    }
  }

  private miss(t: Asteroid | null) {
    this.errors++;
    this.streak = 0;
    this.ship.flash = 1;
    this.shake = Math.max(this.shake, 3);
    if (t) { t.err = 1; t.clean = false; }
    this.sfx.miss();
  }

  private fire(t: Asteroid) {
    const { ship } = this;
    const nx = ship.x + Math.cos(ship.angle) * 20;
    const ny = ship.y + Math.sin(ship.angle) * 20;
    this.bullets.push({ x: nx, y: ny, dx: 0, dy: -1, target: t, speed: 1500 });
    ship.kick = 3;
    for (let i = 0; i < 3; i++) {
      const a = ship.angle + rand(-0.5, 0.5);
      const sp = rand(40, 120);
      this.particles.push({
        x: nx, y: ny, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0, max: rand(0.12, 0.25), size: 1.4, color: C.accent,
      });
    }
  }

  // ---------------------------------------------------------------- simulation

  private frame = (now: number) => {
    this.step(now);
    this.render();
    this.raf = requestAnimationFrame(this.frame);
  };

  /**
   * Advance in fixed sub-steps. rAF stops in background tabs, so a slow interval keeps the
   * simulation honest there — otherwise a hidden player in a match could never be hit.
   */
  private step(now: number) {
    let elapsed = Math.min(30, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    while (elapsed > 0) {
      const dt = Math.min(0.05, elapsed);
      this.update(dt);
      elapsed -= dt;
    }
  }

  private hiddenTick = () => {
    if (document.hidden) this.step(performance.now());
  };

  private update(dt: number) {
    this.clock += dt;
    for (const s of this.stars) {
      s.y += s.z * 6 * dt;
      if (s.y > this.H) { s.y = 0; s.x = Math.random() * this.W; }
    }
    if (this.state === 'paused') return;

    const sdt = dt * this.timeScale;

    if (this.state === 'countdown') {
      this.countdownT -= dt;
      const c = Math.ceil(this.countdownT);
      if (c !== this.lastCount && c > 0) { this.lastCount = c; this.sfx.count(false); }
      if (this.countdownT <= 0) {
        this.state = 'playing';
        this.sfx.count(true);
        this.begin();
      }
    }

    if (this.state === 'playing') {
      this.elapsed += dt;
      if (this.asteroids.length) this.activeTime += dt;
      if (this.phase === 'stream') this.updateStream(sdt);
      else this.updateWave(sdt);
      this.updateIncoming(sdt);
      if (this.mode === 'sprint' && this.elapsed >= SPRINT_SECONDS) this.finish('time');
    }
    if (this.state !== 'idle') {
      this.updateAsteroids(sdt);
      this.updateBullets(sdt);
      this.updateFx(sdt);
    }

    const { ship } = this;
    const want = this.target ? Math.atan2(this.target.y - ship.y, this.target.x - ship.x) : -Math.PI / 2;
    let diff = want - ship.angle;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    ship.angle += diff * (1 - Math.exp(-(this.target ? 18 : 4) * dt));
    ship.kick *= Math.exp(-18 * dt);
    ship.flash = Math.max(0, ship.flash - dt * 3);
    this.shake *= Math.exp(-9 * dt);
    this.incomingFlash = Math.max(0, this.incomingFlash - dt);

    if (this.banner) {
      this.banner.t += dt;
      if (this.banner.t >= this.banner.dur) this.banner = null;
    }
    if (this.state === 'dying') {
      this.dyingT += dt;
      if (this.dyingT > 1.8) {
        this.state = 'over';
        this.timeScale = 1;
        this.emitEnd('breach');
      }
    }

    if (this.state === 'playing' || this.state === 'dying' || this.state === 'countdown') {
      this.hudT -= dt;
      if (this.hudT <= 0) { this.hudT = 0.1; this.emitHud(); }
    }
  }

  private updateWave(dt: number) {
    if (this.phase === 'intermission') {
      this.phaseT -= dt;
      if (this.phaseT <= 0) this.phase = 'spawning';
    } else if (this.phase === 'spawning') {
      this.spawnT -= dt;
      while (this.planIdx < this.plan.length && this.spawnT <= 0) {
        const p = this.plan[this.planIdx++];
        this.spawn(p.word, p.xf, p.speedMul, this.cfg.travel);
        const next = this.plan[this.planIdx];
        if (next) this.spawnT += next.gap;
      }
      if (this.planIdx >= this.plan.length && this.asteroids.length === 0 && this.incoming === 0) {
        const bonus = this.wave * 100;
        this.score += bonus;
        this.phase = 'cleared';
        this.phaseT = 1.8;
        if (!(this.mode === 'race' && this.wave >= RACE_WAVES)) {
          this.banner = { title: 'Wave cleared', sub: `+${bonus} bonus`, t: 0, dur: 1.8 };
          this.sfx.cleared();
        }
      }
    } else if (this.phase === 'cleared') {
      this.phaseT -= dt;
      if (this.mode === 'race' && this.wave >= RACE_WAVES) this.finish('finished');
      else if (this.phaseT <= 0) this.nextWave();
    }
  }

  private updateStream(dt: number) {
    const cfg = this.streamCfg();
    this.wave = this.mode === 'sprint' ? 1 + Math.floor(this.elapsed / 8) : 1;
    this.spawnT -= dt;
    const cap = this.mode === 'zen' ? 5 : 14;
    if (this.spawnT <= 0 && this.asteroids.length < cap) {
      this.spawn(this.pickLiveWord(cfg.weights), Math.random(), rand(0.85, 1.15), cfg.travel);
      this.spawnT = cfg.interval * rand(0.7, 1.3);
    }
  }

  private updateIncoming(dt: number) {
    if (this.incoming <= 0) return;
    this.incomingT -= dt;
    if (this.incomingT > 0) return;
    const base = this.phase === 'stream' ? this.streamCfg() : this.cfg;
    this.spawn(this.pickLiveWord([0.6, 1, 0.3, 0]), Math.random(), rand(1, 1.15), base.travel * 0.85, true);
    this.incoming--;
    this.incomingT = 0.5;
  }

  private updateAsteroids(dt: number) {
    const { ship } = this;
    for (let i = this.asteroids.length - 1; i >= 0; i--) {
      const a = this.asteroids[i];
      const ox = ship.x - a.x, oy = ship.y - a.y;
      const d = Math.hypot(ox, oy);
      // Home on the ship, but keep heading once very close so wrecks drift past instead of orbiting.
      if (d > 30) { a.dx = ox / d; a.dy = oy / d; }
      const v = a.speed - a.push;
      a.x += a.dx * v * dt;
      a.y += a.dy * v * dt;
      a.push *= Math.exp(-5 * dt);
      a.rot += a.spin * dt;
      a.flash = Math.max(0, a.flash - dt * 6);
      a.err = Math.max(0, a.err - dt * 4);
      a.born += dt;
      const isTarget = this.target === a;
      a.focus += ((isTarget ? 1 : 0) - a.focus) * (1 - Math.exp(-14 * dt));
      a.lock = isTarget ? Math.min(1, a.lock + dt / 0.2) : 0;
      a.pop = Math.max(0, a.pop - dt * 5);
      if (a.y > this.H + 120) { this.asteroids.splice(i, 1); continue; }
      if (this.state === 'playing' && !a.doomed && d < a.r * 0.85 + ship.r) {
        if (isLethal(this.mode)) { this.breach(a); return; }
        this.shieldHit(a);
      }
    }
  }

  private breach(a: Asteroid) {
    this.state = 'dying';
    this.ship.dead = true;
    this.target = null;
    this.timeScale = 0.35;
    this.shake = 14;
    this.incoming = 0;
    this.explode(a, false);
    this.shatterShip();
    this.sfx.breach();
    this.emitHud();
  }

  /** Non-lethal modes: the shield absorbs the rock at a cost. */
  private shieldHit(a: Asteroid) {
    if (this.target === a) this.target = null;
    this.explode(a, false);
    this.streak = 0;
    this.ship.flash = 1;
    this.shake = Math.max(this.shake, 6);
    this.rings.push({ x: this.ship.x, y: this.ship.y, r0: 30, r1: 70, life: 0, max: 0.5, color: C.danger });
    if (this.mode === 'sprint') {
      const penalty = Math.min(this.score, 50);
      this.score -= penalty;
      if (penalty) this.popups.push({ x: this.ship.x, y: this.ship.y - 40, text: `−${penalty}`, life: 0, max: 1, color: C.danger });
    }
    this.sfx.shield();
  }

  private updateBullets(dt: number) {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      const t = b.target;
      if (!this.asteroids.includes(t)) { this.bullets.splice(i, 1); continue; }
      const dx = t.x - b.x, dy = t.y - b.y;
      const d = Math.hypot(dx, dy) || 1;
      const step = b.speed * dt;
      b.dx = dx / d;
      b.dy = dy / d;
      if (d <= step + t.r * 0.6) {
        this.bullets.splice(i, 1);
        this.hit(t, b);
        continue;
      }
      b.x += b.dx * step;
      b.y += b.dy * step;
    }
  }

  private hit(t: Asteroid, b: Bullet) {
    t.hits++;
    t.flash = 1;
    t.push += 70;
    const ix = t.x - b.dx * t.r * 0.7, iy = t.y - b.dy * t.r * 0.7;
    for (let i = 0; i < 4; i++) {
      const a = Math.atan2(-b.dy, -b.dx) + rand(-0.9, 0.9);
      const sp = rand(60, 160);
      this.particles.push({
        x: ix, y: iy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0, max: rand(0.2, 0.4), size: 1.5, color: C.accent,
      });
    }
    if (t.doomed && t.hits >= t.word.length) this.explode(t, true);
    else this.sfx.hit();
  }

  private explode(a: Asteroid, scored: boolean) {
    const idx = this.asteroids.indexOf(a);
    if (idx >= 0) this.asteroids.splice(idx, 1);
    if (this.target === a) this.target = null;

    const cos = Math.cos(a.rot), sin = Math.sin(a.rot);
    const pts = a.verts.map(([x, y]): Vec => [x * cos - y * sin, x * sin + y * cos]);
    this.addShards(a.x, a.y, pts, 50, 140, 0.8, 1.3, false);
    for (let i = 0; i < 16; i++) {
      const ang = Math.random() * TAU, sp = rand(30, 160);
      this.particles.push({
        x: a.x, y: a.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
        life: 0, max: rand(0.4, 0.9), size: rand(1, 2.2),
        color: Math.random() < 0.4 ? (a.junk ? C.danger : C.accent) : C.fg,
      });
    }
    this.rings.push({ x: a.x, y: a.y, r0: a.r * 0.6, r1: a.r * 2.6, life: 0, max: 0.55, color: a.junk ? C.danger : C.accent });

    if (!scored) return;
    this.sfx.explode(Math.min(1, a.word.length / 12));
    if (a.clean) {
      this.streak++;
      this.bestStreak = Math.max(this.bestStreak, this.streak);
      if (this.streak % 5 === 0) {
        const label = this.streak >= 20 ? `Max streak · ×${this.mult().toFixed(2)}` : `Streak ${this.streak} · ×${this.mult().toFixed(2)}`;
        this.popups.push({ x: this.W / 2, y: this.ship.y - 96, text: label, life: 0, max: 1.6, color: C.accent, big: true });
        this.sfx.streak(this.streak);
      }
    }
    const pts2 = Math.round(a.word.length * 10 * (1 + (this.wave - 1) * 0.15) * this.mult());
    this.score += pts2;
    this.words++;
    this.popups.push({ x: a.x, y: a.y, text: `+${pts2}`, life: 0, max: 0.9, color: C.accent });
    this.shake = Math.max(this.shake, 2);

    if (this.mode === 'versus' && a.clean) {
      this.charge += a.word.length >= 8 ? 2 : 1;
      let sent = 0;
      while (this.charge >= ATTACK_COST) { this.charge -= ATTACK_COST; sent++; }
      if (sent) {
        this.handlers.onAttack?.(sent);
        this.sfx.attack();
        this.popups.push({ x: this.ship.x, y: this.ship.y - 46, text: sent > 1 ? `attack ×${sent}` : 'attack sent', life: 0, max: 1.1, color: C.accent });
      }
    }
  }

  private addShards(x: number, y: number, pts: Vec[], vMin: number, vMax: number, lMin: number, lMax: number, ship: boolean) {
    for (let i = 0; i < pts.length; i++) {
      const p1 = pts[i], p2 = pts[(i + 1) % pts.length];
      const cx = (p1[0] + p2[0]) / 3, cy = (p1[1] + p2[1]) / 3;
      const d = Math.hypot(cx, cy) || 1;
      const sp = rand(vMin, vMax);
      this.shards.push({
        x: x + cx, y: y + cy, vx: (cx / d) * sp, vy: (cy / d) * sp,
        rot: 0, spin: rand(-4, 4), life: 0, max: rand(lMin, lMax), ship,
        pts: [[-cx, -cy], [p1[0] - cx, p1[1] - cy], [p2[0] - cx, p2[1] - cy]],
      });
    }
  }

  private shatterShip() {
    const { ship } = this;
    const rot = ship.angle + Math.PI / 2;
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const pts = SHIP_SHAPE.map(([x, y]): Vec => [x * cos - y * sin, x * sin + y * cos]);
    this.addShards(ship.x, ship.y, pts, 80, 180, 1.4, 2.2, true);
    for (let i = 0; i < 40; i++) {
      const ang = Math.random() * TAU, sp = rand(40, 260);
      this.particles.push({
        x: ship.x, y: ship.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
        life: 0, max: rand(0.6, 1.6), size: rand(1, 2.6),
        color: Math.random() < 0.5 ? C.danger : C.accent,
      });
    }
    this.rings.push({ x: ship.x, y: ship.y, r0: 10, r1: 140, life: 0, max: 1.1, color: C.danger });
  }

  private updateFx(dt: number) {
    const decay = Math.exp(-2.2 * dt);
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      if (p.life >= p.max) { this.particles.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= decay; p.vy *= decay;
    }
    for (let i = this.shards.length - 1; i >= 0; i--) {
      const s = this.shards[i];
      s.life += dt;
      if (s.life >= s.max) { this.shards.splice(i, 1); continue; }
      s.x += s.vx * dt; s.y += s.vy * dt;
      s.vx *= decay; s.vy *= decay;
      s.rot += s.spin * dt;
    }
    for (const list of [this.rings, this.popups] as { life: number; max: number }[][]) {
      for (let i = list.length - 1; i >= 0; i--) {
        list[i].life += dt;
        if (list[i].life >= list[i].max) list.splice(i, 1);
      }
    }
  }

  // ---------------------------------------------------------------- rendering

  private render() {
    const { ctx, W, H } = this;
    ctx.fillStyle = this.bg ?? C.bg;
    ctx.fillRect(0, 0, W, H);
    this.drawStars();

    ctx.save();
    if (this.shake > 0.15) ctx.translate(rand(-1, 1) * this.shake, rand(-1, 1) * this.shake);
    for (const r of this.rings) this.drawRing(r);
    if (this.target && !this.ship.dead) this.drawGuide(this.target);
    for (const a of this.asteroids) this.drawAsteroid(a);
    if (this.target) this.drawReticle(this.target);
    for (const s of this.shards) this.drawShard(s);
    this.drawBullets();
    this.drawParticles();
    if (!this.ship.dead) {
      if (this.state !== 'idle') this.drawShipZone();
      this.drawShip();
    }
    for (const a of this.asteroids) if (a !== this.target) this.drawLabel(a, false);
    if (this.target) this.drawLabel(this.target, true);
    for (const p of this.popups) this.drawPopup(p);
    ctx.restore();

    if (this.state === 'countdown') this.drawCountdown();
    if (this.banner) this.drawBanner(this.banner);
    if (this.incomingFlash > 0) this.drawIncoming();
  }

  private drawStars() {
    const { ctx } = this;
    for (const s of this.stars) {
      const a = s.z * 0.55 * (0.75 + 0.25 * Math.sin(s.tw + this.clock * (0.6 + s.z)));
      ctx.fillStyle = `rgba(233,230,223,${a})`;
      const size = s.z > 0.8 ? 1.6 : 1;
      ctx.fillRect(s.x, s.y, size, size);
    }
  }

  private drawAsteroid(a: Asteroid) {
    const { ctx } = this;
    const isTarget = this.target === a;
    ctx.save();
    ctx.globalAlpha = clamp(a.born / 0.5, 0, 1);
    ctx.translate(a.x, a.y);
    ctx.rotate(a.rot);
    ctx.beginPath();
    a.verts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    // The path is already transformed; un-rotate so the light source stays fixed top-left.
    ctx.rotate(-a.rot);
    const grad = ctx.createRadialGradient(-a.r * 0.45, -a.r * 0.45, 0, 0, 0, a.r * 1.15);
    grad.addColorStop(0, C.rockLight);
    grad.addColorStop(1, C.rockDark);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.lineWidth = isTarget ? 1.6 : 1.25;
    ctx.strokeStyle = a.flash > 0
      ? rgba(C.fg, 0.35 + a.flash * 0.5)
      : isTarget ? rgba(C.accent, 0.9)
      : a.junk ? rgba(C.danger, 0.6) : C.rockEdge;
    if (a.focus > 0.01) {
      ctx.shadowColor = rgba(C.accent, 0.5 * a.focus);
      ctx.shadowBlur = 18;
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.rotate(a.rot);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1;
    for (const [cx, cy, cr] of a.craters) {
      ctx.beginPath();
      ctx.arc(cx, cy, cr, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  private roundRect(x: number, y: number, w: number, h: number, r: number) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /** Faint dotted line from the nose to the locked rock. */
  private drawGuide(a: Asteroid) {
    const { ctx, ship } = this;
    const nx = ship.x + Math.cos(ship.angle) * 24;
    const ny = ship.y + Math.sin(ship.angle) * 24;
    ctx.save();
    ctx.setLineDash([2, 7]);
    ctx.lineDashOffset = -this.clock * 30;
    ctx.lineWidth = 1;
    ctx.strokeStyle = rgba(C.accent, 0.22 * a.focus);
    ctx.beginPath();
    ctx.moveTo(nx, ny);
    ctx.lineTo(a.x, a.y);
    ctx.stroke();
    ctx.restore();
  }

  /** Four arc brackets that snap in on lock and slowly orbit. */
  private drawReticle(a: Asteroid) {
    const { ctx } = this;
    const l = easeOut(a.lock);
    const r = a.r + 10 + (1 - l) * 18;
    ctx.save();
    ctx.translate(a.x, a.y);
    ctx.rotate(this.clock * 0.9 + (1 - l) * 0.8);
    ctx.globalAlpha = l;
    ctx.strokeStyle = rgba(C.accent, 0.9);
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(0, 0, r, i * (Math.PI / 2) - 0.3, i * (Math.PI / 2) + 0.3);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawLabel(a: Asteroid, isTarget: boolean) {
    if (a.doomed) return;
    const { ctx, W, ship } = this;
    const size = W < 640 ? 16 : 19;
    ctx.save();
    ctx.font = `600 ${size}px ${this.fontMono}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    const cw = ctx.measureText('m').width;
    const tw = cw * a.word.length;
    const padX = 12, h = size + 15;
    const focus = easeOut(a.focus);
    const scale = 1 + 0.1 * focus;
    const shakeX = a.err > 0 ? Math.sin(this.clock * 70) * 5 * a.err : 0;
    const cx = clamp(a.x, 14 + padX + tw / 2, W - 14 - padX - tw / 2) + shakeX;
    const cy = a.y + a.r + 12 + h / 2;
    // Urgency rises as the rock closes on the ship.
    const near = a.junk ? 1 : clamp(1 - (Math.hypot(ship.x - a.x, ship.y - a.y) - 140) / 240, 0, 1);

    ctx.globalAlpha = clamp(a.born / 0.5, 0, 1);
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    const x = -tw / 2;
    const y = -h / 2;

    this.roundRect(x - padX, y, tw + padX * 2, h, 8);
    ctx.fillStyle = 'rgba(9,11,15,0.9)';
    ctx.fill();
    if (near > 0 && focus < 0.5) {
      ctx.fillStyle = rgba(C.danger, 0.1 * near);
      ctx.fill();
    }
    if (focus > 0.01) {
      ctx.shadowColor = rgba(C.accent, 0.4 * focus);
      ctx.shadowBlur = 20;
    }
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = a.err > 0
      ? rgba(C.danger, 0.5 + a.err * 0.5)
      : focus > 0.05 ? rgba(C.accent, 0.85 * focus)
      : near > 0 ? rgba(C.danger, 0.15 + 0.35 * near)
      : 'rgba(241,237,228,0.1)';
    ctx.stroke();
    ctx.shadowBlur = 0;

    for (let i = 0; i < a.word.length; i++) {
      const lx = x + cw * i;
      if (i < a.typed) {
        if (i === a.typed - 1 && a.pop > 0) {
          const p = easeOut(a.pop);
          ctx.save();
          ctx.translate(lx + cw / 2, -p * 3);
          ctx.scale(1 + p * 0.4, 1 + p * 0.4);
          ctx.fillStyle = rgba(C.accent, 0.55 + 0.45 * p);
          ctx.fillText(a.word[i], -cw / 2, 1);
          ctx.restore();
        } else {
          ctx.fillStyle = rgba(C.accent, 0.5);
          ctx.fillText(a.word[i], lx, 1);
        }
      } else {
        ctx.fillStyle = isTarget || near > 0.6 ? C.fg : rgba(C.fg, 0.88);
        ctx.fillText(a.word[i], lx, 1);
      }
    }

    if (isTarget && a.typed < a.word.length) {
      ctx.fillStyle = rgba(C.accent, 0.55 + 0.45 * Math.sin(this.clock * 9));
      ctx.fillRect(x + cw * a.typed + 1, h / 2 - 6, cw - 2, 2);
    }
    ctx.restore();
  }

  private drawBullets() {
    const { ctx } = this;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineWidth = 2;
    ctx.strokeStyle = rgba(C.accent, 0.9);
    for (const b of this.bullets) {
      ctx.beginPath();
      ctx.moveTo(b.x - b.dx * 16, b.y - b.dy * 16);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawParticles() {
    const { ctx } = this;
    for (const p of this.particles) {
      const t = 1 - p.life / p.max;
      ctx.fillStyle = rgba(p.color, t * 0.9);
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
  }

  private drawShard(s: Shard) {
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha = 1 - s.life / s.max;
    ctx.translate(s.x, s.y);
    ctx.rotate(s.rot);
    ctx.beginPath();
    s.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = s.ship ? C.hull : C.rockDark;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = s.ship ? rgba(C.fg, 0.7) : C.rockEdge;
    ctx.stroke();
    ctx.restore();
  }

  private drawRing(r: Ring) {
    const { ctx } = this;
    const t = r.life / r.max;
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * easeOut(t), 0, TAU);
    ctx.lineWidth = 1.25;
    ctx.strokeStyle = rgba(r.color, (1 - t) * 0.45);
    ctx.stroke();
  }

  private drawPopup(p: Popup) {
    const { ctx } = this;
    const t = p.life / p.max;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = p.color;
    if (p.big) {
      // Fade in quickly, hold, fade out; drift up a touch.
      ctx.globalAlpha = Math.min(1, t * 8) * (1 - Math.pow(t, 3));
      ctx.font = `500 13px ${this.fontUi}`;
      this.spaced(4);
      ctx.shadowColor = rgba(C.accent, 0.5);
      ctx.shadowBlur = 14;
      ctx.fillText(p.text.toUpperCase(), p.x + 2, p.y - easeOut(t) * 10);
    } else {
      ctx.globalAlpha = 1 - t;
      ctx.font = `600 15px ${this.fontUi}`;
      ctx.fillText(p.text, p.x, p.y - easeOut(t) * 26);
    }
    ctx.restore();
  }

  private drawShipZone() {
    const { ctx, ship } = this;
    let danger = 0;
    for (const a of this.asteroids) {
      if (a.doomed) continue;
      const d = Math.hypot(ship.x - a.x, ship.y - a.y) - a.r - ship.r;
      danger = Math.max(danger, clamp(1 - d / 240, 0, 1));
    }
    ctx.beginPath();
    ctx.arc(ship.x, ship.y, 46, 0, TAU);
    ctx.lineWidth = 1;
    ctx.strokeStyle = rgba(C.fg, isLethal(this.mode) ? 0.05 : 0.1);
    ctx.stroke();
    if (danger > 0) {
      const pulse = 0.75 + 0.25 * Math.sin(this.clock * (6 + danger * 6));
      ctx.beginPath();
      ctx.arc(ship.x, ship.y, 46, 0, TAU);
      ctx.strokeStyle = rgba(C.danger, danger * 0.45 * pulse);
      ctx.stroke();
    }
  }

  private drawShip() {
    const { ctx, ship } = this;
    ctx.save();
    ctx.translate(ship.x, ship.y);
    ctx.rotate(ship.angle + Math.PI / 2);
    ctx.translate(0, ship.kick);

    const glow = ctx.createRadialGradient(0, 13, 0, 0, 13, 22);
    const pulse = 0.22 + 0.06 * Math.sin(this.clock * 3);
    glow.addColorStop(0, rgba(C.accent, pulse));
    glow.addColorStop(1, rgba(C.accent, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 13, 22, 0, TAU);
    ctx.fill();

    ctx.beginPath();
    SHIP_SHAPE.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = C.hull;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = ship.flash > 0 ? rgba(C.danger, 0.4 + ship.flash * 0.6) : rgba(C.fg, 0.9);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.lineTo(0, 1);
    ctx.strokeStyle = rgba(C.accent, 0.8);
    ctx.stroke();
    ctx.restore();
  }

  private spaced(px: number) {
    if ('letterSpacing' in this.ctx) (this.ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${px}px`;
  }

  private drawBanner(b: Banner) {
    const { ctx, W, H } = this;
    const { t, dur } = b;
    const a = t < 0.5 ? t / 0.5 : t > dur - 0.6 ? Math.max(0, (dur - t) / 0.6) : 1;
    const e = easeOut(a);
    const cy = H * 0.38 - (1 - e) * 8;
    ctx.save();
    ctx.globalAlpha = e;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const big = W < 640 ? 32 : 46;
    ctx.font = `300 ${big}px ${this.fontUi}`;
    this.spaced(big * 0.3);
    ctx.fillStyle = C.fg;
    ctx.fillText(b.title.toUpperCase(), W / 2 + big * 0.15, cy);

    ctx.strokeStyle = rgba(C.accent, 0.8);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(W / 2 - 28 * e, cy + big * 0.85);
    ctx.lineTo(W / 2 + 28 * e, cy + big * 0.85);
    ctx.stroke();

    ctx.font = `500 13px ${this.fontUi}`;
    this.spaced(5);
    ctx.fillStyle = C.muted;
    ctx.fillText(b.sub.toUpperCase(), W / 2 + 2.5, cy + big * 0.85 + 28);
    ctx.restore();
  }

  private drawCountdown() {
    const { ctx, W, H } = this;
    const n = Math.max(1, Math.ceil(this.countdownT));
    const f = n - this.countdownT; // 0 → 1 within each second
    ctx.save();
    ctx.globalAlpha = 1 - easeOut(f) * 0.85;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `200 ${104 + easeOut(f) * 20}px ${this.fontUi}`;
    ctx.fillStyle = C.fg;
    ctx.fillText(String(n), W / 2, H * 0.4);
    ctx.globalAlpha = 0.9;
    ctx.font = `500 13px ${this.fontUi}`;
    this.spaced(5);
    ctx.fillStyle = C.accent;
    ctx.fillText('GET READY', W / 2 + 2.5, H * 0.4 + 86);
    ctx.restore();
  }

  private drawIncoming() {
    const { ctx, W } = this;
    const a = Math.min(1, this.incomingFlash / 0.4);
    const pulse = 0.7 + 0.3 * Math.sin(this.clock * 14);
    ctx.save();
    ctx.globalAlpha = a * pulse;
    ctx.textAlign = 'center';
    ctx.font = `600 14px ${this.fontUi}`;
    this.spaced(5);
    ctx.fillStyle = C.danger;
    ctx.shadowColor = rgba(C.danger, 0.5);
    ctx.shadowBlur = 14;
    const n = this.incoming;
    ctx.fillText(n > 0 ? `INCOMING ×${n}` : 'INCOMING', W / 2 + 2.5, 104);
    ctx.fillRect(W / 2 - 22, 116, 44, 1.5);
    ctx.restore();
  }
}
