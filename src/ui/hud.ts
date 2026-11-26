import type { Vector3 } from '@babylonjs/core';

/** Oberfläche: Uhrzeit, Testanzeige (3× auf die Uhr tippen oder ?debug) */
export class Hud {
  private clock: HTMLElement; private dbg: HTMLElement; private acc = 0;
  constructor(root: HTMLElement, private backend: string, private quality: string) {
    const top = document.createElement('div'); top.className = 'top';
    top.innerHTML = '<div class="pill">Lëtz Adventures</div><div class="pill" id="uhr">10:30</div>';
    root.append(top); this.clock = top.querySelector('#uhr')!; this.clock.style.pointerEvents = 'auto';
    this.dbg = document.createElement('div'); this.dbg.className = 'dbg' + (new URLSearchParams(location.search).has('debug') ? ' on' : ''); root.append(this.dbg);
    let taps: number[] = [];
    this.clock.addEventListener('pointerdown', () => { const n = performance.now(); taps = taps.filter(x => n - x < 700).concat(n); if (taps.length >= 3) { taps = []; this.dbg.classList.toggle('on'); } });
  }
  update(dt: number, hour: number, fps: number, p: Vector3) {
    this.acc += dt; if (this.acc < 0.25) return; this.acc = 0;
    const h = Math.floor(hour), m = Math.floor((hour - h) * 60);
    this.clock.textContent = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
    if (this.dbg.classList.contains('on')) this.dbg.textContent = `${fps.toFixed(0)} FPS · ${this.backend} · Qualität ${this.quality}\nPos ${p.x.toFixed(0)}, ${p.y.toFixed(1)}, ${p.z.toFixed(0)}`;
  }
}
