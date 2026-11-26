/**
 * Eingabe: Tastatur, Maus und Touch werden zu einem einheitlichen Zustand zusammengefasst.
 * move: -1..1 (x = rechts, y = vorwärts), look: Kamera-Delta in Pixeln, pressed: einmalige Aktionen.
 */
export type Action = 'jump' | 'act' | 'sprint' | 'zap' | 'map' | 'pause';

export class Input {
  move = { x: 0, y: 0 };
  look = { x: 0, y: 0 };
  sprint = false;
  private keys = new Set<string>();
  private pressedNow = new Set<Action>();
  readonly isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  private joy = { id: -1, ox: 0, oy: 0, x: 0, y: 0 };

  constructor(private canvas: HTMLCanvasElement, hud: HTMLElement) {
    const map: Record<string, Action> = { Space: 'jump', KeyE: 'act', KeyQ: 'zap', KeyM: 'map', Escape: 'pause', KeyP: 'pause' };
    addEventListener('keydown', (e) => { if (!this.keys.has(e.code) && map[e.code]) this.pressedNow.add(map[e.code]); this.keys.add(e.code); if (e.code === 'Space') e.preventDefault(); });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    // Maus: ziehen oder Zeiger sperren (Klick ins Bild)
    let drag = false, lx = 0, ly = 0;
    canvas.addEventListener('mousedown', (e) => { drag = true; lx = e.clientX; ly = e.clientY; if (!this.isTouch) canvas.requestPointerLock?.(); });
    addEventListener('mouseup', () => (drag = false));
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === canvas) { this.look.x += e.movementX; this.look.y += e.movementY; }
      else if (drag) { this.look.x += e.clientX - lx; this.look.y += e.clientY - ly; lx = e.clientX; ly = e.clientY; }
    });
    if (this.isTouch) { document.body.classList.add('touch'); this.buildTouch(hud); }
  }

  private buildTouch(hud: HTMLElement) {
    const zone = document.createElement('div'); zone.className = 'joy';
    const base = document.createElement('div'); base.className = 'base';
    const knob = document.createElement('div'); knob.className = 'knob';
    zone.append(base, knob); hud.append(zone);
    const R = 56;
    zone.addEventListener('touchstart', (e) => { const t = e.changedTouches[0]; this.joy = { id: t.identifier, ox: t.clientX, oy: t.clientY, x: 0, y: 0 }; for (const el of [base, knob]) { el.style.display = 'block'; el.style.left = t.clientX + 'px'; el.style.top = t.clientY + 'px'; } e.preventDefault(); }, { passive: false });
    zone.addEventListener('touchmove', (e) => { for (const t of Array.from(e.changedTouches)) if (t.identifier === this.joy.id) { let dx = t.clientX - this.joy.ox, dy = t.clientY - this.joy.oy; const L = Math.hypot(dx, dy); if (L > R) { dx *= R / L; dy *= R / L; } this.joy.x = dx / R; this.joy.y = dy / R; knob.style.left = this.joy.ox + dx + 'px'; knob.style.top = this.joy.oy + dy + 'px'; } e.preventDefault(); }, { passive: false });
    const end = (e: TouchEvent) => { for (const t of Array.from(e.changedTouches)) if (t.identifier === this.joy.id) { this.joy.id = -1; this.joy.x = this.joy.y = 0; base.style.display = knob.style.display = 'none'; } };
    zone.addEventListener('touchend', end); zone.addEventListener('touchcancel', end);
    // Kamera: rechte Bildhälfte ziehen
    let camId = -1, cx = 0, cy = 0;
    this.canvas.addEventListener('touchstart', (e) => { for (const t of Array.from(e.changedTouches)) if (camId < 0) { camId = t.identifier; cx = t.clientX; cy = t.clientY; } }, { passive: true });
    this.canvas.addEventListener('touchmove', (e) => { for (const t of Array.from(e.changedTouches)) if (t.identifier === camId) { this.look.x += (t.clientX - cx) * 1.3; this.look.y += (t.clientY - cy) * 1.3; cx = t.clientX; cy = t.clientY; } }, { passive: true });
    this.canvas.addEventListener('touchend', (e) => { for (const t of Array.from(e.changedTouches)) if (t.identifier === camId) camId = -1; });
    // Knöpfe
    const btns = document.createElement('div'); btns.className = 'btns';
    const mk = (label: string, a: Action, cls = '') => { const b = document.createElement('button'); b.textContent = label; if (cls) b.className = cls; b.addEventListener('touchstart', (e) => { e.preventDefault(); if (a === 'sprint') this.sprint = !this.sprint; else this.pressedNow.add(a); }, { passive: false }); btns.append(b); };
    mk('ZAP', 'zap'); mk('E', 'act'); mk('LAAF', 'sprint'); mk('SPRANG', 'jump', 'main');
    hud.append(btns);
  }

  /** einmal pro Bild aufrufen */
  update() {
    const k = this.keys;
    let x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    let y = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    if (this.joy.id >= 0) { x = this.joy.x; y = -this.joy.y; }
    const L = Math.hypot(x, y); if (L > 1) { x /= L; y /= L; }
    this.move.x = x; this.move.y = y;
    if (!this.isTouch) this.sprint = k.has('ShiftLeft') || k.has('ShiftRight');
  }
  pressed(a: Action) { return this.pressedNow.has(a); }
  /** am Ende des Bildes */
  endFrame() { this.pressedNow.clear(); this.look.x = this.look.y = 0; }
}
