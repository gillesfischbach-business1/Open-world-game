import { Vector3, Matrix, type Scene, type AbstractEngine } from '@babylonjs/core';
import type { Line } from '../game/dialogue';

interface B { el: HTMLDivElement; pos: () => Vector3; until: number; }

/** Sprechblasen über Köpfen (HTML über dem 3D-Bild, bleiben im Bildschirm). */
export class Bubbles {
  private list = new Map<object, B>(); private root: HTMLDivElement;
  constructor(hud: HTMLElement, private scene: Scene, private engine: AbstractEngine) {
    this.root = document.createElement('div'); this.root.className = 'bubbles'; hud.append(this.root);
  }
  say(owner: object, line: Line, pos: () => Vector3, secs = 4.5) {
    let b = this.list.get(owner);
    if (!b) { const el = document.createElement('div'); el.className = 'bubble'; this.root.append(el); b = { el, pos, until: 0 }; this.list.set(owner, b); }
    b.el.innerHTML = `<b>${esc(line[0])}</b><i>${esc(line[1])}</i>`; b.pos = pos; b.until = performance.now() + secs * 1000;
  }
  clear(owner: object) { const b = this.list.get(owner); if (b) { b.el.remove(); this.list.delete(owner); } }
  update() {
    const cam = this.scene.activeCamera; if (!cam) return;
    const now = performance.now(), w = this.engine.getRenderWidth(), h = this.engine.getRenderHeight();
    const sx = innerWidth / w, sy = innerHeight / h, vp = cam.viewport.toGlobal(w, h), tm = this.scene.getTransformMatrix();
    for (const [o, b] of this.list) {
      if (now > b.until) { b.el.remove(); this.list.delete(o); continue; }
      const p = b.pos(), d = Vector3.Distance(p, cam.globalPosition);
      const s = Vector3.Project(p, Matrix.IdentityReadOnly, tm, vp);
      if (s.z < 0 || s.z > 1 || d > 40) { b.el.style.display = 'none'; continue; }
      b.el.style.display = 'block';
      const bw = b.el.offsetWidth, x = Math.max(8, Math.min(innerWidth - bw - 8, s.x * sx - bw / 2)), y = Math.max(56, s.y * sy - b.el.offsetHeight - 6);
      b.el.style.transform = `translate(${x}px, ${y}px)`; b.el.style.opacity = String(Math.max(0.35, 1 - d / 45));
    }
  }
}
export const esc = (s: string) => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
