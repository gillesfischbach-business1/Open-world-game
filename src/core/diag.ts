import { Vector3, type Scene, type AbstractMesh } from '@babylonjs/core';
import type { PerfManager } from './perf';

/**
 * Diagnose-Lauf (Link mit ?diag oder Messseite): Die Kamera steht fest auf der Belval Plaza,
 * dann wird nacheinander je EIN Teil des Spiels abgeschaltet und gemessen. So sieht man,
 * was auf einem Gerät wirklich bremst. Danach startet die Seite einmal mit der anderen
 * Grafik-Schnittstelle neu (WebGPU ↔ WebGL2) und misst noch einmal.
 *
 * Gemessen werden die Bildrate und die reine Rechenzeit des Prozessors pro Bild (cpuMs):
 * Ist cpuMs fast so groß wie die Bildzeit, bremst der Prozessor, sonst der Grafikchip.
 */
export interface DiagStep { name: string; fps: number; p5Fps: number; frameMs: number; cpuMs: number; }
export interface DiagPass { backend: string; scale: number; steps: DiagStep[]; }
export interface DiagResult { kind: 'diag'; version: 1; date: string; device: ReturnType<PerfManager['report']>['device']; tier: string; passes: DiagPass[]; advice: string[]; }

export interface DiagHooks {
  scale(s: number): void; post(on: boolean): void; shadows(on: boolean): void;
  people(on: boolean): void; traffic(on: boolean): void; city(on: boolean): void; extraLights(on: boolean): void; simpleMats(on: boolean): void;
}
const KEY = 'letz-diag-v1';
const SETTLE = 1.5, MEASURE = 3;

export class Diag {
  private steps: Array<{ name: string; on: () => void; off: () => void }>;
  private i = 0; private t = 0; private ms: number[] = []; private cpu: number[] = []; private out: DiagStep[] = []; done = false;
  private renderStart = 0;
  constructor(private scene: Scene, private perf: PerfManager, private backend: string, private h: DiagHooks,
    private camera: { position: Vector3; setTarget(v: Vector3): void }, private height: (x: number, z: number) => number) {
    perf.forced = true; // während der Messung nichts automatisch verstellen
    const s0 = perf.scale;
    this.steps = [
      { name: 'normal', on: () => {}, off: () => {} },
      { name: 'Auflösung halb', on: () => h.scale(s0 * 0.5), off: () => h.scale(s0) },
      { name: 'ohne Nachbearbeitung', on: () => h.post(false), off: () => h.post(true) },
      { name: 'ohne Schatten', on: () => h.shadows(false), off: () => h.shadows(true) },
      { name: 'ohne Zusatzlichter', on: () => h.extraLights(false), off: () => h.extraLights(true) },
      { name: 'einfache Materialien', on: () => h.simpleMats(true), off: () => h.simpleMats(false) },
      { name: 'ohne Menschen/Hunde', on: () => h.people(false), off: () => h.people(true) },
      { name: 'ohne Autos', on: () => h.traffic(false), off: () => h.traffic(true) },
      { name: 'ohne Gebäude', on: () => h.city(false), off: () => h.city(true) },
      { name: 'alles aus + Auflösung halb', on: () => { h.scale(s0 * 0.5); h.post(false); h.shadows(false); h.extraLights(false); h.people(false); h.traffic(false); h.city(false); },
        off: () => { h.scale(s0); h.post(true); h.shadows(true); h.extraLights(true); h.people(true); h.traffic(true); h.city(true); } },
    ];
    scene.onBeforeRenderObservable.add(() => { this.renderStart = performance.now(); });
    scene.onAfterRenderObservable.add(() => { if (!this.done && this.t > SETTLE) this.cpu.push(performance.now() - this.renderStart); });
    this.steps[0].on();
  }
  /** Kamera fest auf die Plaza (mit Menschen, Gebäuden, Straße im Bild) */
  private place() {
    const p = new Vector3(4, 0, 26); p.y = this.height(p.x, p.z) + 3;
    const look = new Vector3(0, 0, -40); look.y = this.height(look.x, look.z) + 1.2;
    this.camera.position.copyFrom(p); this.camera.setTarget(look);
  }
  /** pro Bild aufrufen; gibt die Position für die Spielfigur zurück (damit Menschen/Autos um die Plaza entstehen) */
  frame(realDt: number): Vector3 {
    this.place();
    if (this.done) return this.camera.position;
    this.t += realDt;
    if (this.t > SETTLE) this.ms.push(realDt * 1000);
    if (this.t > SETTLE + MEASURE) {
      const s = this.steps[this.i], ms = this.ms, n = Math.max(1, ms.length), avg = ms.reduce((a, b) => a + b, 0) / n, sorted = [...ms].sort((a, b) => b - a);
      const cpu = this.cpu.length ? this.cpu.reduce((a, b) => a + b, 0) / this.cpu.length : 0;
      this.out.push({ name: s.name, fps: Math.round(1000 / avg), p5Fps: Math.round(1000 / (sorted[Math.floor(n * 0.05)] || avg)), frameMs: +avg.toFixed(1), cpuMs: +cpu.toFixed(1) });
      s.off(); this.ms = []; this.cpu = []; this.t = 0; this.i++;
      if (this.i >= this.steps.length) this.finish(); else this.steps[this.i].on();
    }
    return this.camera.position;
  }
  private finish() {
    this.done = true;
    const prev = load(); const pass: DiagPass = { backend: this.backend, scale: +this.perf.scale.toFixed(2), steps: this.out };
    const passes = [...(prev?.passes ?? []), pass];
    let canReload = false;
    if (passes.length < 2 && 'gpu' in navigator) {
      // zweiter Durchgang mit der anderen Grafik-Schnittstelle (nur wenn der Speicher das Zwischenergebnis wirklich hält)
      try { localStorage.setItem(KEY, JSON.stringify({ passes })); localStorage.setItem('letz-backend', this.backend === 'WebGPU' ? 'gl' : 'gpu'); canReload = !!load(); } catch { /* egal */ }
    }
    if (canReload) {
      this.banner('Teil 1 fertig – starte mit ' + (this.backend === 'WebGPU' ? 'WebGL2' : 'WebGPU') + ' neu …');
      setTimeout(() => location.reload(), 1200); return;
    }
    try { localStorage.removeItem(KEY); localStorage.removeItem('letz-backend'); } catch { /* egal */ }
    const r = this.perf.report();
    const res: DiagResult = { kind: 'diag', version: 1, date: new Date().toISOString(), device: r.device, tier: r.tier, passes, advice: advise(passes) };
    (window as unknown as { __bench: DiagResult }).__bench = res;
    this.show(res);
    window.dispatchEvent(new CustomEvent('bench-done', { detail: res }));
  }
  private banner(t: string) { const d = document.createElement('div'); d.className = 'toast big'; d.style.cssText = 'position:fixed;left:50%;top:40%;transform:translate(-50%,-50%);z-index:99;background:#111d;color:#fff;padding:16px 20px;border-radius:12px'; d.textContent = t; document.body.append(d); }
  private show(r: DiagResult) {
    const d = document.createElement('div'); d.className = 'intro';
    const names = r.passes[0].steps.map(s => s.name);
    const head = r.passes.map(p => `<th>${p.backend}</th>`).join('');
    const rows = names.map((n, i) => `<tr><td>${n}</td>${r.passes.map(p => `<td>${p.steps[i]?.fps ?? '–'} <small>(${p.steps[i]?.cpuMs ?? '–'} ms)</small></td>`).join('')}</tr>`).join('');
    d.innerHTML = `<div class="card bench"><h2>Diagnose fertig</h2><p>Bilder pro Sekunde je Einstellung<i>(in Klammern: Rechenzeit des Prozessors pro Bild)</i></p>
      <table><tr><th>Einstellung</th>${head}</tr>${rows}</table><p class="keys">${r.advice.join('<br>')}</p>
      <button id="bcopy">Ergebnis kopieren</button><button id="bclose" style="background:#333;color:#fff">Weiterspielen</button></div>`;
    document.body.append(d);
    d.querySelector('#bcopy')!.addEventListener('click', async () => { try { await navigator.clipboard.writeText(JSON.stringify(r)); (d.querySelector('#bcopy') as HTMLElement).textContent = 'Kopiert ✓'; } catch { prompt('Ergebnis:', JSON.stringify(r)); } });
    d.querySelector('#bclose')!.addEventListener('click', () => location.href = location.href.replace(/[?&]diag\b/, ''));
  }
}

/** Läuft gerade ein zweiter Diagnose-Durchgang (nach dem Neustart)? */
export function diagPending() { return !!load(); }
function load(): { passes: DiagPass[] } | null { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } }

/** einfache Auswertung – nur Beobachtungen, die Entscheidung trifft der Mensch */
function advise(passes: DiagPass[]): string[] {
  const a: string[] = [];
  const best = [...passes].sort((x, y) => (y.steps[0]?.fps ?? 0) - (x.steps[0]?.fps ?? 0))[0];
  if (passes.length > 1) a.push(`Schneller im Normalzustand: ${best.backend} (${passes.map(p => p.backend + ' ' + (p.steps[0]?.fps ?? 0)).join(' / ')} FPS)`);
  const base = best.steps[0]; if (!base) return a;
  for (const s of best.steps.slice(1)) { const gain = s.fps / Math.max(1, base.fps); if (gain >= 1.25) a.push(`${s.name}: ×${gain.toFixed(1)} schneller`); }
  if (base.cpuMs > base.frameMs * 0.7) a.push('Der Prozessor ist der Engpass (Rechenzeit fast so lang wie das Bild).');
  else a.push('Der Grafikchip ist der Engpass (Prozessor wartet).');
  return a;
}

/** Hilfsfunktion: statische Stadt-Meshes (alles außer Boden/Straßen) */
export function cityMeshes(scene: Scene, keep: (m: AbstractMesh) => boolean) {
  return scene.meshes.filter(m => m.isEnabled() && !keep(m) && !/^(gelaende|strassen|gehwege|markierung)/.test(m.name) && m.getTotalVertices() > 0 && m.isWorldMatrixFrozen);
}
