import { Vector3, type Scene } from '@babylonjs/core';
import type { PerfManager } from './perf';

/**
 * Leistungstest (Link mit ?bench): fliegt eine feste Route durch Belval (45 s) und misst.
 * Ergebnis: Bildraten je Abschnitt, Ruckler, Entscheidungen des Leistungs-Managers, Gerätedaten.
 * Am Ende erscheint eine Ergebnisseite (kopierbar); `window.__bench` enthält dasselbe als Objekt.
 */
export interface BenchResult {
  version: 1; date: string; url: string; backend: string; durationS: number;
  device: ReturnType<PerfManager['report']>['device']; startTier: string; endTier: string; reasons: string[];
  sections: Array<{ name: string; avgFps: number; p5Fps: number; worstMs: number; frames: number }>;
  overall: { avgFps: number; p5Fps: number; jankPct: number; worstMs: number };
  finalScale: number; steps: string[]; log: string[]; memoryMB?: number; loadS: number; verdict: string;
}
interface Leg { name: string; from: [number, number, number]; to: [number, number, number]; look: [number, number, number]; secs: number; }
const ROUTE: Leg[] = [
  { name: 'Bahnhof (Start, Menschen nah)', from: [4, 3, 26], to: [-10, 3, -20], look: [0, 1.5, -40], secs: 12 },
  { name: 'Belval Plaza (viele Menschen)', from: [-10, 3, -40], to: [-30, 4, -110], look: [-25, 1.5, -95], secs: 12 },
  { name: 'Überflug Rockhal/Hochöfen (Weitsicht)', from: [-20, 30, -110], to: [140, 45, -190], look: [120, 10, -150], secs: 12 },
  { name: 'Straße mit Verkehr (tief)', from: [100, 2.5, -40], to: [40, 2.5, 60], look: [20, 1.5, 100], secs: 9 },
];

export class Bench {
  private t = 0; private leg = 0; private frames: number[][] = ROUTE.map(() => []); done = false;
  constructor(private scene: Scene, private perf: PerfManager, private backend: string, private loadS: number,
    private moveTo: (p: Vector3) => void, private camera: { position: Vector3; setTarget(v: Vector3): void }, private height: (x: number, z: number) => number) {}
  /** pro Bild: Kamera bewegen und Bildzeit speichern */
  hold = false; // true: noch nicht messen (Inhalte laden nach)
  frame(realDt: number) {
    if (this.done) return;
    if (this.hold) { const L0 = ROUTE[0], V0 = (a: number[]) => new Vector3(a[0], a[1], a[2]); const p = V0(L0.from); p.y += this.height(p.x, p.z); this.camera.position.copyFrom(p); const lk = V0(L0.look); lk.y += this.height(lk.x, lk.z); this.camera.setTarget(lk); return; }
    const L = ROUTE[this.leg]; this.t += realDt;
    const f = Math.min(1, this.t / L.secs), V = (a: number[]) => new Vector3(a[0], a[1], a[2]);
    const p = Vector3.Lerp(V(L.from), V(L.to), f); p.y += this.height(p.x, p.z);
    const look = V(L.look); look.y += this.height(look.x, look.z);
    this.moveTo(new Vector3(p.x, this.height(p.x, p.z) + 1.5, p.z));
    this.camera.position.copyFrom(p); this.camera.setTarget(look);
    if (this.t > 0.5) this.frames[this.leg].push(realDt * 1000);
    if (f >= 1) { this.leg++; this.t = 0; if (this.leg >= ROUTE.length) this.finish(); }
  }
  private stats(ms: number[]) {
    if (!ms.length) return { avgFps: 0, p5Fps: 0, worstMs: 0, frames: 0 };
    const avg = ms.reduce((a, b) => a + b, 0) / ms.length, s = [...ms].sort((a, b) => b - a);
    return { avgFps: Math.round(1000 / avg), p5Fps: Math.round(1000 / s[Math.floor(s.length * 0.05)]), worstMs: Math.round(s[0]), frames: ms.length };
  }
  private finish() {
    this.done = true;
    const all = this.frames.flat(), o = this.stats(all), r = this.perf.report();
    const jank = all.filter(ms => ms > 50).length / Math.max(1, all.length) * 100;
    const mem = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize;
    const verdict = o.p5Fps >= 30 && jank < 3 ? 'flüssig' : o.p5Fps >= 22 && jank < 8 ? 'spielbar' : 'ruckelt';
    const res: BenchResult = {
      version: 1, date: new Date().toISOString(), url: location.href, backend: this.backend, durationS: Math.round(ROUTE.reduce((a, l) => a + l.secs, 0)),
      device: r.device, startTier: this.perf.log[0]?.match(/Stufe (\w+)/)?.[1] ?? r.tier, endTier: r.tier, reasons: r.reasons,
      sections: ROUTE.map((l, i) => ({ name: l.name, ...this.stats(this.frames[i]) })),
      overall: { avgFps: o.avgFps, p5Fps: o.p5Fps, jankPct: +jank.toFixed(1), worstMs: o.worstMs }, finalScale: r.scale, steps: r.steps, log: r.log,
      memoryMB: mem ? Math.round(mem / 1048576) : undefined, loadS: +this.loadS.toFixed(1), verdict,
    };
    (window as unknown as { __bench: BenchResult }).__bench = res;
    this.perf.save();
    this.show(res);
    window.dispatchEvent(new CustomEvent('bench-done', { detail: res }));
  }
  private show(r: BenchResult) {
    const d = document.createElement('div'); d.className = 'intro';
    const rows = r.sections.map(s => `<tr><td>${s.name}</td><td>${s.avgFps}</td><td>${s.p5Fps}</td></tr>`).join('');
    d.innerHTML = `<div class="card bench"><h2>Leistungstest: ${r.verdict}</h2>
      <p>${r.overall.avgFps} FPS im Schnitt · schlechteste 5 %: ${r.overall.p5Fps} FPS · Ruckler: ${r.overall.jankPct} %<i>Stufe ${r.startTier} → ${r.endTier} · Auflösung ${Math.round(r.finalScale * 100)} % · ${r.backend} · Laden ${r.loadS} s</i></p>
      <table><tr><th>Abschnitt</th><th>FPS</th><th>5 %</th></tr>${rows}</table>
      <p class="keys">${r.device.gpu}<br>${r.steps.length ? 'Automatisch gespart: ' + r.steps.join(', ') : 'Keine Einsparung nötig'}</p>
      <button id="bcopy">Ergebnis kopieren</button><button id="bclose" style="background:#333;color:#fff">Weiterspielen</button></div>`;
    document.body.append(d);
    d.querySelector('#bcopy')!.addEventListener('click', async () => { try { await navigator.clipboard.writeText(JSON.stringify(r)); (d.querySelector('#bcopy') as HTMLElement).textContent = 'Kopiert ✓'; } catch { prompt('Ergebnis:', JSON.stringify(r)); } });
    d.querySelector('#bclose')!.addEventListener('click', () => location.href = location.href.replace(/[?&]bench\b/, ''));
  }
}
