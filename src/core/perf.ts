/**
 * Leistungs-Manager
 * 1. erkennt das Gerät (Grafikchip, Speicher, Kerne, Handy/PC, Bildschirm, Backend)
 * 2. wählt eine Startstufe (low/mid/high) – oder die auf diesem Gerät zuletzt gelernte
 * 3. misst laufend die Bildrate und regelt in Stufen nach:
 *    zuerst die Auflösung (fast unsichtbar), dann teure Effekte, dann Sichtweite und Menge.
 *    Bei Reserven wird vorsichtig wieder hochgeregelt.
 * Alle Entscheidungen landen in `log`, damit Tests (und der Skill) sie nachvollziehen können.
 */
export type Tier = 'low' | 'mid' | 'high';

export interface DeviceInfo {
  gpu: string; mobile: boolean; touch: boolean; mem: number | null; cores: number; dpr: number;
  screenW: number; screenH: number; ua: string; webgpu: boolean;
}
export interface Preset {
  maxMP: number;            // höchstens so viele Millionen Render-Pixel pro Bild (Füllrate ist auf Handys der Engpass)
  minScale: number;         // kleinste Auflösung relativ zu CSS-Pixeln
  shadows: 0 | 1024 | 2048; ssao: boolean; bloom: boolean; msaa: 1 | 4;
  people: number; seated: number; cars: number;
  peopleView: number; animView: number; trafficView: number; farClip: number;
  hdr: '1k' | '2k'; heroLight: boolean;
}
export const PRESETS: Record<Tier, Preset> = {
  low:  { maxMP: 0.45, minScale: 0.45, shadows: 0,    ssao: false, bloom: false, msaa: 1, people: 10, seated: 6,  cars: 10, peopleView: 75,  animView: 35, trafficView: 200, farClip: 1400, hdr: '1k', heroLight: false },
  mid:  { maxMP: 0.9,  minScale: 0.5,  shadows: 1024, ssao: false, bloom: true,  msaa: 1, people: 20, seated: 12, cars: 20, peopleView: 110, animView: 60, trafficView: 280, farClip: 3500, hdr: '2k', heroLight: true },
  high: { maxMP: 2.2,  minScale: 0.6,  shadows: 2048, ssao: true,  bloom: true,  msaa: 4, people: 34, seated: 20, cars: 32, peopleView: 140, animView: 90, trafficView: 320, farClip: 8000, hdr: '2k', heroLight: true },
};

const KEY = 'letz-perf-v1';

/** Grafikchip vor dem Start der Engine auslesen (eigener, kurzer WebGL-Kontext) */
export function detectDevice(): DeviceInfo {
  let gpu = 'unbekannt';
  try {
    const c = document.createElement('canvas'), gl = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext | null;
    if (gl) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      gpu = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch { /* egal */ }
  const nav = navigator as Navigator & { deviceMemory?: number; userAgentData?: { mobile?: boolean } };
  const ua = navigator.userAgent;
  const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const mobile = nav.userAgentData?.mobile ?? (/Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (touch && /Macintosh/.test(ua)));
  return { gpu, mobile, touch, mem: nav.deviceMemory ?? null /* Safari verrät den Speicher nicht */, cores: navigator.hardwareConcurrency || 4, dpr: Math.min(window.devicePixelRatio || 1, 3),
    screenW: screen.width, screenH: screen.height, ua, webgpu: 'gpu' in navigator };
}

/** Grafikchip einordnen: 0 = schwach, 1 = mittel, 2 = stark */
export function gpuClass(gpu: string, webgpu: boolean): number {
  const g = gpu.toLowerCase();
  if (/swiftshader|llvmpipe|software|microsoft basic|mali-[2-4]\d\d|mali-t|adreno[^0-9]*[2-5]\d\d\b|powervr|sgx|intel.*((?<!u)hd graphics ?[2-6]\d{2,3}|gma)|videocore/.test(g)) return 0;
  if (/nvidia|geforce|rtx|gtx|quadro|radeon (rx|pro|vii)|apple m\d|adreno[^0-9]*(7[3-9]\d|8\d\d)|immortalis|mali-g7[1-9]\d|mali-g9\d\d|xclipse/.test(g)) return 2;
  if (/apple gpu|apple/.test(g)) return webgpu ? 2 : 1; // Safari verrät das Modell nicht; WebGPU-fähige iPhones sind neu
  return 1;
}

export function chooseTier(d: DeviceInfo): { tier: Tier; reasons: string[] } {
  const reasons: string[] = []; let s = gpuClass(d.gpu, d.webgpu); reasons.push(`Grafikchip „${d.gpu}“ → ${['schwach', 'mittel', 'stark'][s]}`);
  if (d.mem !== null && d.mem <= 2) { s = 0; reasons.push(`nur ${d.mem} GB Speicher`); }
  else if (d.mem !== null && d.mem <= 4 && s > 1) { s = 1; reasons.push(`${d.mem} GB Speicher → höchstens mittel`); }
  if (d.cores <= 4 && d.mobile && s > 1) { s = 1; reasons.push(`${d.cores} Kerne auf dem Handy → höchstens mittel`); }
  if (d.mobile && s > 1) { s = 1; reasons.push('Handy/Tablet → höchstens mittel (realistische Figuren und Effekte sind für Handy-Chips zu teuer)'); }
  return { tier: (['low', 'mid', 'high'] as Tier[])[s], reasons };
}

export interface Knobs {
  /** Auflösung ändern (Render-Pixel je CSS-Pixel) */ scale(r: number): void;
  shadows(on: boolean): void; ssao(on: boolean): void; bloom(on: boolean): void;
  peopleView(m: number): void; animView(m: number): void; trafficView(m: number): void; farClip(m: number): void; maxPeople(n: number): void;
}

/** Regelt laufend nach. Stufen werden der Reihe nach abgebaut (und in umgekehrter Reihe vorsichtig zurückgeholt). */
export class PerfManager {
  tier: Tier; preset: Preset; reasons: string[]; device: DeviceInfo; forced: boolean;
  scale = 1; maxScale = 1; fps = 60; minFps = 60; target: number; log: string[] = [];
  private ladder: Array<{ name: string; down: () => void; up: () => void; on: boolean }> = [];
  private samples: number[] = []; private winT = 0; private bad = 0; private good = 0; private warm = 3; private knobs!: Knobs;
  private saveT = 0; private stepIdx = 0;
  constructor() {
    this.device = detectDevice();
    const q = new URLSearchParams(location.search).get('q');
    const learned = this.load();
    if (q === 'low' || q === 'mid' || q === 'high') { this.tier = q; this.forced = true; this.reasons = ['von Hand gewählt (?q=' + q + ')']; }
    else if (learned && learned.gpu === this.device.gpu) { this.tier = learned.tier; this.forced = false; this.reasons = [`auf diesem Gerät gelernt (zuletzt ${learned.fps.toFixed(0)} FPS)`]; }
    else { const c = chooseTier(this.device); this.tier = c.tier; this.reasons = c.reasons; this.forced = false; }
    this.preset = { ...PRESETS[this.tier] };
    if (this.device.mobile && !this.forced) {
      // Handy: weniger gleichzeitige Figuren und kleineres Himmelslicht (Speicher, Ladezeit, Grafikchip)
      const p = this.preset; p.people = Math.round(p.people * 0.7); p.seated = Math.round(p.seated * 0.6); p.cars = Math.round(p.cars * 0.75);
      p.hdr = '1k'; p.animView = Math.min(p.animView, 45); p.peopleView = Math.min(p.peopleView, 90);
    }
    this.target = this.device.mobile ? 40 : 50;
    this.note(`Start: Stufe ${this.tier} – ${this.reasons.join('; ')}`);
  }
  /** größte sinnvolle Auflösung für dieses Fenster */
  /** größte Auflösung: begrenzt durch Pixeldichte und Pixel-Budget der Stufe (Handy mit 3× DPR rendert sonst 3 Mio. Pixel) */
  private capScale() { const css = Math.max(320 * 480, innerWidth * innerHeight); return Math.max(0.3, Math.min(this.device.dpr, Math.sqrt(this.preset.maxMP * 1e6 / css))); }
  attach(k: Knobs) {
    this.knobs = k; this.maxScale = this.capScale(); this.scale = this.maxScale;
    if (learnedScale(this.load(), this.device.gpu)) this.scale = Math.min(this.maxScale, learnedScale(this.load(), this.device.gpu)!);
    k.scale(this.scale);
    const p = this.preset;
    // Abbau-Reihenfolge: billig für das Auge zuerst
    this.ladder = [
      { name: 'Umgebungsverdeckung aus', on: p.ssao, down: () => k.ssao(false), up: () => k.ssao(true) },
      { name: 'Schatten aus', on: p.shadows > 0, down: () => k.shadows(false), up: () => k.shadows(true) },
      { name: 'Leuchteffekt aus', on: p.bloom, down: () => k.bloom(false), up: () => k.bloom(true) },
      { name: 'Animationen nur in der Nähe', on: true, down: () => k.animView(p.animView * 0.5), up: () => k.animView(p.animView) },
      { name: 'Menschen-Sichtweite kürzer', on: true, down: () => k.peopleView(p.peopleView * 0.65), up: () => k.peopleView(p.peopleView) },
      { name: 'weniger Menschen', on: true, down: () => k.maxPeople(Math.round(p.people * 0.6 + p.seated * 0.6)), up: () => k.maxPeople(999) },
      { name: 'Verkehr-Sichtweite kürzer', on: true, down: () => k.trafficView(p.trafficView * 0.6), up: () => k.trafficView(p.trafficView) },
      { name: 'Sichtweite kürzer', on: true, down: () => k.farClip(p.farClip * 0.5), up: () => k.farClip(p.farClip) },
    ].filter(s => s.on).map(s => ({ ...s, on: true }));
  }
  private note(s: string) { const t = (performance.now() / 1000).toFixed(1); this.log.push(`[${t}s] ${s}`); if (this.log.length > 60) this.log.shift(); console.info('[Leistung]', s); }

  /** einmal pro Bild mit der Bildzeit (Sekunden) aufrufen */
  frame(dt: number) {
    if (!this.knobs || document.hidden || dt <= 0) return;
    this.samples.push(dt); this.winT += dt; this.saveT += dt;
    if (this.winT < 1) return;
    const n = this.samples.length, avg = this.winT / n; this.fps = 1 / avg;
    const sorted = [...this.samples].sort((a, b) => b - a); this.minFps = 1 / sorted[Math.max(0, Math.floor(n * 0.05))]; // 5 %-Ausreißer
    this.samples = []; this.winT = 0;
    if (this.warm > 0) { this.warm--; return; }
    if (this.forced) return;
    if (this.fps < this.target * 0.85) { this.bad++; this.good = 0; } else if (this.fps > this.target * 1.2 && this.minFps > this.target * 0.8) { this.good++; this.bad = 0; } else { this.bad = 0; this.good = Math.max(0, this.good - 1); }
    if (this.fps < this.target * 0.55) { this.bad = 0; this.degrade(); this.degrade(); } // weit darunter: sofort zwei Schritte
    else if (this.bad >= 2) { this.bad = 0; this.degrade(); }
    if (this.good >= 6) { this.good = 0; this.improve(); }
    if (this.saveT > 20) { this.saveT = 0; this.save(); }
  }
  private degrade() {
    const floor = Math.max(this.preset.minScale, 640 / Math.max(320, innerWidth));
    if (this.scale > floor + 0.01 && (this.stepIdx === 0 || this.scale > this.maxScale * 0.75)) {
      this.scale = Math.max(floor, this.scale * 0.85); this.knobs.scale(this.scale); this.note(`${this.fps.toFixed(0)} FPS → Auflösung ${(this.scale * 100).toFixed(0)} %`); return;
    }
    if (this.stepIdx < this.ladder.length) { const s = this.ladder[this.stepIdx++]; s.down(); this.note(`${this.fps.toFixed(0)} FPS → ${s.name}`); return; }
    if (this.scale > floor + 0.01) { this.scale = Math.max(floor, this.scale * 0.85); this.knobs.scale(this.scale); this.note(`${this.fps.toFixed(0)} FPS → Auflösung ${(this.scale * 100).toFixed(0)} %`); }
  }
  private improve() {
    if (this.scale < this.maxScale - 0.01) { this.scale = Math.min(this.maxScale, this.scale * 1.1); this.knobs.scale(this.scale); this.note(`${this.fps.toFixed(0)} FPS → Auflösung ${(this.scale * 100).toFixed(0)} %`); return; }
    if (this.stepIdx > 0) { const s = this.ladder[--this.stepIdx]; s.up(); this.note(`${this.fps.toFixed(0)} FPS → wieder: ${s.name.replace(/ aus$| kürzer$/, ' an')}`); }
  }
  /** Fenstergröße geändert */
  resize() { if (!this.knobs) return; this.maxScale = this.capScale(); this.scale = Math.min(this.scale, this.maxScale); this.knobs.scale(this.scale); }
  private load(): { gpu: string; tier: Tier; fps: number; scale: number } | null { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } }
  save() {
    // gelernt wird die tatsächlich tragfähige Stufe: viele Abbau-Schritte → eine Stufe tiefer beim nächsten Start
    let tier = this.tier; if (this.stepIdx >= 4 && tier !== 'low') tier = tier === 'high' ? 'mid' : 'low';
    try { localStorage.setItem(KEY, JSON.stringify({ gpu: this.device.gpu, tier, fps: this.fps, scale: this.scale })); } catch { /* egal */ }
  }
  /** Zusammenfassung für Anzeige, Tests und Messbericht */
  report() {
    return { tier: this.tier, forced: this.forced, reasons: this.reasons, device: this.device, fps: Math.round(this.fps), minFps: Math.round(this.minFps),
      scale: +this.scale.toFixed(2), maxScale: +this.maxScale.toFixed(2), steps: this.ladder.slice(0, this.stepIdx).map(s => s.name), target: this.target, log: [...this.log] };
  }
}
function learnedScale(l: { gpu: string; scale: number } | null, gpu: string) { return l && l.gpu === gpu && l.scale > 0 ? l.scale : null; }
