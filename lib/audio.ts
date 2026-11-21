// All sound is synthesized with Web Audio — no asset files to ship.
const MUTE_KEY = 'stillpoint.muted';
const MASTER = 0.8;

interface ToneOpts {
  freq: number;
  to?: number;
  dur: number;
  type?: OscillatorType;
  gain?: number;
  attack?: number;
  at?: number;
  lp?: number;
}

interface NoiseOpts {
  dur: number;
  gain: number;
  from: number;
  to?: number;
  q?: number;
  at?: number;
  type?: BiquadFilterType;
}

export class Sfx {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  muted = false;

  loadPreference() {
    try { this.muted = localStorage.getItem(MUTE_KEY) === '1'; } catch { /* storage unavailable */ }
    return this.muted;
  }

  /** Must be called from a user gesture before anything is audible. */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.ratio.value = 4;
      const out = ctx.createGain();
      out.gain.value = this.muted ? 0 : MASTER;
      out.connect(comp).connect(ctx.destination);
      const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.ctx = ctx;
      this.out = out;
      this.noiseBuf = buf;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setMuted(m: boolean) {
    this.muted = m;
    try { localStorage.setItem(MUTE_KEY, m ? '1' : '0'); } catch { /* storage unavailable */ }
    if (this.ctx && this.out) this.out.gain.setTargetAtTime(m ? 0 : MASTER, this.ctx.currentTime, 0.02);
  }

  private live(): AudioContext | null {
    const ctx = this.ctx;
    return ctx && this.out && ctx.state === 'running' && !this.muted ? ctx : null;
  }

  private tone(o: ToneOpts) {
    const ctx = this.live();
    if (!ctx) return;
    const t = ctx.currentTime + (o.at ?? 0);
    const osc = ctx.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.freq, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + o.dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.gain ?? 0.1, t + (o.attack ?? 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    let node: AudioNode = osc;
    if (o.lp) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = o.lp;
      osc.connect(f);
      node = f;
    }
    node.connect(g).connect(this.out!);
    osc.start(t);
    osc.stop(t + o.dur + 0.05);
  }

  private noise(o: NoiseOpts) {
    const ctx = this.live();
    if (!ctx || !this.noiseBuf) return;
    const t = ctx.currentTime + (o.at ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = o.type ?? 'lowpass';
    f.frequency.setValueAtTime(o.from, t);
    if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + o.dur);
    f.Q.value = o.q ?? 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    src.connect(f).connect(g).connect(this.out!);
    src.start(t, Math.random() * 0.5);
    src.stop(t + o.dur + 0.05);
  }

  /** Keystroke shot; pitch climbs as the word nears completion. */
  shot(progress: number) {
    const k = 2 ** (progress * 0.6);
    this.tone({ freq: 720 * k, to: 480 * k, dur: 0.07, type: 'triangle', gain: 0.045 });
  }
  hit() {
    this.noise({ dur: 0.05, gain: 0.04, from: 3200, type: 'bandpass', q: 1.5 });
  }
  explode(size: number) {
    this.noise({ dur: 0.45 + size * 0.3, gain: 0.14, from: 1800, to: 120 });
    this.tone({ freq: 120, to: 45, dur: 0.35, gain: 0.12 });
  }
  miss() {
    this.tone({ freq: 160, to: 110, dur: 0.12, type: 'square', gain: 0.03, lp: 900 });
  }
  shield() {
    this.tone({ freq: 320, to: 140, dur: 0.32, type: 'triangle', gain: 0.07 });
    this.noise({ dur: 0.3, gain: 0.07, from: 900, to: 200 });
  }
  breach() {
    this.noise({ dur: 1.6, gain: 0.22, from: 2400, to: 60 });
    this.tone({ freq: 90, to: 30, dur: 1.2, gain: 0.2 });
    this.tone({ freq: 220, to: 55, dur: 1.2, type: 'sawtooth', gain: 0.04, lp: 600 });
  }
  wave() {
    this.tone({ freq: 392, dur: 0.9, gain: 0.045, attack: 0.02 });
    this.tone({ freq: 587, dur: 1.1, gain: 0.04, attack: 0.02, at: 0.12 });
  }
  cleared() {
    [523, 659, 784].forEach((f, i) => this.tone({ freq: f, dur: 0.6, gain: 0.04, attack: 0.01, at: i * 0.09 }));
  }
  /** Streak milestone; climbs a step every five clean words. */
  streak(n: number) {
    const base = 523 * 2 ** (Math.min(n / 5 - 1, 4) * (2 / 12));
    this.tone({ freq: base, dur: 0.5, gain: 0.04, attack: 0.01 });
    this.tone({ freq: base * 1.5, dur: 0.7, gain: 0.035, attack: 0.01, at: 0.07 });
  }
  incoming() {
    this.tone({ freq: 220, dur: 0.12, type: 'square', gain: 0.045, lp: 700 });
    this.tone({ freq: 220, dur: 0.12, type: 'square', gain: 0.045, lp: 700, at: 0.18 });
  }
  attack() {
    this.tone({ freq: 440, to: 880, dur: 0.18, type: 'triangle', gain: 0.05 });
    this.noise({ dur: 0.2, gain: 0.03, from: 2000, to: 6000, type: 'highpass' });
  }
  count(final: boolean) {
    this.tone({ freq: final ? 880 : 440, dur: final ? 0.4 : 0.22, gain: 0.06, attack: 0.01 });
  }
  win() {
    [523, 659, 784, 1047].forEach((f, i) => this.tone({ freq: f, dur: 0.9, gain: 0.045, attack: 0.01, at: i * 0.11 }));
  }
  lose() {
    [392, 330, 262].forEach((f, i) => this.tone({ freq: f, dur: 0.7, gain: 0.04, attack: 0.02, at: i * 0.16 }));
  }
  ui() {
    this.tone({ freq: 880, dur: 0.04, gain: 0.02 });
  }
}

export const sfx = new Sfx();
