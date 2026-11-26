/** Klänge ohne Dateien (Web Audio): Blitz, Aufprall, Motor, Sirene. Start erst nach erster Berührung. */
export class Sound {
  ctx: AudioContext | null = null; private master!: GainNode;
  private engine?: { o: OscillatorNode; g: GainNode; f: BiquadFilterNode };
  private siren?: { o: OscillatorNode; g: GainNode };
  constructor() {
    const start = () => { if (this.ctx) { this.ctx.resume(); return; } try { this.ctx = new AudioContext(); this.master = this.ctx.createGain(); this.master.gain.value = 0.5; this.master.connect(this.ctx.destination); } catch { /* kein Ton */ } };
    addEventListener('pointerdown', start); addEventListener('keydown', start); addEventListener('touchstart', start);
  }
  private noise(dur: number) {
    const c = this.ctx!, b = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (Math.random() < 0.08 ? 1 : 0.35);
    const s = c.createBufferSource(); s.buffer = b; return s;
  }
  zap() {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime, s = this.noise(0.45), f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'bandpass'; f.frequency.setValueAtTime(3200, t); f.frequency.exponentialRampToValueAtTime(500, t + 0.4); f.Q.value = 2;
    g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.01, t + 0.45);
    s.connect(f).connect(g).connect(this.master); s.start();
  }
  thump(strength = 1) {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.25); g.gain.setValueAtTime(Math.min(1, 0.3 * strength), t); g.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
    o.connect(g).connect(this.master); o.start(); o.stop(t + 0.32);
    const n = this.noise(0.2), ng = c.createGain(); ng.gain.setValueAtTime(Math.min(0.6, 0.15 * strength), t); ng.gain.exponentialRampToValueAtTime(0.01, t + 0.2); n.connect(ng).connect(this.master); n.start();
  }
  chime() {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime;
    [660, 880, 1320].forEach((fq, i) => { const o = c.createOscillator(), g = c.createGain(); o.type = 'triangle'; o.frequency.value = fq; g.gain.setValueAtTime(0, t + i * 0.09); g.gain.linearRampToValueAtTime(0.25, t + i * 0.09 + 0.02); g.gain.exponentialRampToValueAtTime(0.01, t + i * 0.09 + 0.5); o.connect(g).connect(this.master); o.start(t + i * 0.09); o.stop(t + i * 0.09 + 0.55); });
  }
  /** Motor: Lautstärke/Tonhöhe nach Tempo; null = aus */
  motor(speed: number | null) {
    if (!this.ctx) return; const c = this.ctx;
    if (speed === null) { if (this.engine) { this.engine.g.gain.setTargetAtTime(0, c.currentTime, 0.1); } return; }
    if (!this.engine) { const o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain(); o.type = 'sawtooth'; f.type = 'lowpass'; f.frequency.value = 600; g.gain.value = 0; o.connect(f).connect(g).connect(this.master); o.start(); this.engine = { o, g, f }; }
    const a = Math.abs(speed), gear = a % 9 / 9; this.engine.o.frequency.setTargetAtTime(38 + a * 2.2 + gear * 30, c.currentTime, 0.05); this.engine.g.gain.setTargetAtTime(0.07 + Math.min(0.08, a * 0.004), c.currentTime, 0.1);
  }
  /** Sirene: Lautstärke 0..1 */
  sirene(level: number) {
    if (!this.ctx) return; const c = this.ctx;
    if (!this.siren) { const o = c.createOscillator(), g = c.createGain(); o.type = 'square'; g.gain.value = 0; const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1800; o.connect(f).connect(g).connect(this.master); o.start(); this.siren = { o, g }; }
    const t = c.currentTime; this.siren.o.frequency.setTargetAtTime(Math.floor(t * 1.6) % 2 ? 660 : 880, t, 0.01); this.siren.g.gain.setTargetAtTime(0.06 * level, t, 0.15);
  }
}
