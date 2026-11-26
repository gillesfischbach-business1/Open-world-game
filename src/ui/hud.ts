import type { Vector3 } from '@babylonjs/core';
import type { Line } from '../game/dialogue';
import type { Network } from '../world/network';
import { esc } from './bubbles';

export interface MissionView { title: Line; text: Line; progress: string; target: { name: string; x: number; z: number } | null; n: number; }

/** Oberfläche: Uhr, Fahndungssterne, Energie, Mission, Karte, Hinweise, Gesprächsfenster. */
export class Hud {
  private clock: HTMLElement; private dbg: HTMLElement; private stars: HTMLElement; private charge: HTMLElement; private mission: HTMLElement;
  private prompt: HTMLElement; private toasts: HTMLElement; private speedo: HTMLElement; private map: HTMLCanvasElement; private mctx: CanvasRenderingContext2D;
  private talk: HTMLElement; private acc = 0; private mapAcc = 0;
  constructor(root: HTMLElement, private backend: string, private quality: string, private net: Network) {
    const top = document.createElement('div'); top.className = 'top';
    top.innerHTML = '<div class="col"><div class="pill" id="uhr">10:30</div><div class="stars" id="stars"></div><div class="charge"><i id="charge"></i></div></div><canvas class="map" width="150" height="150"></canvas>';
    root.append(top);
    this.clock = top.querySelector('#uhr')!; this.stars = top.querySelector('#stars')!; this.charge = top.querySelector('#charge')!;
    this.map = top.querySelector('canvas')!; this.mctx = this.map.getContext('2d')!;
    this.mission = el(root, 'mission'); this.prompt = el(root, 'prompt'); this.toasts = el(root, 'toasts'); this.speedo = el(root, 'speedo'); this.talk = el(root, 'talk');
    this.dbg = el(root, 'dbg' + (new URLSearchParams(location.search).has('debug') ? ' on' : ''));
    this.clock.style.pointerEvents = 'auto';
    let taps: number[] = [];
    this.clock.addEventListener('pointerdown', () => { const n = performance.now(); taps = taps.filter(x => n - x < 700).concat(n); if (taps.length >= 3) { taps = []; this.dbg.classList.toggle('on'); } });
  }
  toast(l: Line, big = false) {
    const t = document.createElement('div'); t.className = 'toast' + (big ? ' big' : ''); t.innerHTML = `<b>${esc(l[0])}</b><i>${esc(l[1])}</i>`;
    this.toasts.append(t); setTimeout(() => t.classList.add('out'), big ? 3800 : 2600); setTimeout(() => t.remove(), big ? 4400 : 3200);
  }
  setPrompt(s: string) { if (this.prompt.textContent !== s) { this.prompt.textContent = s; this.prompt.style.display = s ? 'block' : 'none'; } }

  // ---------- Gespräch ----------
  get talking() { return this.talk.classList.contains('on'); }
  openTalk(head: string, l: Line, choices: Array<[string, Line]>, pick: (k: string) => void) {
    this.talk.innerHTML = `<div class="who">${esc(head)}</div><div class="say"><b>${esc(l[0])}</b><i>${esc(l[1])}</i></div><div class="ch"></div><button class="x" aria-label="Zou">✕</button>`;
    const ch = this.talk.querySelector('.ch')!;
    for (const [k, c] of choices) { const b = document.createElement('button'); b.innerHTML = `${esc(c[0])}<i>${esc(c[1])}</i>`; b.addEventListener('pointerdown', e => { e.stopPropagation(); pick(k); }); ch.append(b); }
    this.talk.querySelector('.x')!.addEventListener('pointerdown', e => { e.stopPropagation(); pick('bye'); });
    this.talk.classList.add('on');
  }
  closeTalk() { this.talk.classList.remove('on'); }

  update(dt: number, s: { hour: number; fps: number; pos: Vector3; yaw: number; heat: number; charge: number; speed: number | null; mission: MissionView | null; police: Vector3[] }) {
    this.acc += dt; this.mapAcc += dt;
    if (this.mapAcc > 0.1) { this.mapAcc = 0; this.drawMap(s.pos, s.yaw, s.mission?.target ?? null, s.police); }
    if (this.acc < 0.2) return; this.acc = 0;
    const h = Math.floor(s.hour), m = Math.floor((s.hour - h) * 60);
    this.clock.textContent = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
    this.stars.innerHTML = s.heat > 0 ? '★'.repeat(s.heat) + '<span>' + '★'.repeat(5 - s.heat) + '</span>' : '';
    this.charge.style.width = Math.round(s.charge) + '%';
    this.speedo.style.display = s.speed === null ? 'none' : 'block'; if (s.speed !== null) this.speedo.textContent = Math.round(Math.abs(s.speed) * 3.6) + ' km/h';
    const mv = s.mission;
    if (mv) {
      const dist = mv.target ? Math.round(Math.hypot(mv.target.x - s.pos.x, mv.target.z - s.pos.z)) : 0;
      this.mission.innerHTML = `<div class="n">Missioun ${mv.n}</div><b>${esc(mv.title[0])}</b><div>${esc(mv.text[0])}</div><i>${esc(mv.text[1])}</i>` +
        (mv.progress || mv.target ? `<div class="pr">${esc(mv.progress)}${mv.target ? ` ${mv.progress ? '· ' : ''}${esc(mv.target.name)} ${dist} m` : ''}</div>` : '');
    } else this.mission.innerHTML = '<b>Fräi Spill</b><div>All Missiounen fäerdeg!</div><i>Alle Missionen erledigt – erkunde Belval.</i>';
    if (this.dbg.classList.contains('on')) this.dbg.textContent = `${s.fps.toFixed(0)} FPS · ${this.backend} · Qualität ${this.quality}\nPos ${s.pos.x.toFixed(0)}, ${s.pos.y.toFixed(1)}, ${s.pos.z.toFixed(0)}`;
  }

  /** kleine Karte: Straßen um Blëtz, nach Blickrichtung gedreht */
  private drawMap(p: Vector3, yaw: number, target: { x: number; z: number } | null, police: Vector3[]) {
    const c = this.mctx, W = 150, R = 75, sc = R / 160; // 160 m Radius
    c.clearRect(0, 0, W, W); c.save(); c.beginPath(); c.arc(R, R, R - 1, 0, Math.PI * 2); c.fillStyle = 'rgba(14,17,22,.72)'; c.fill(); c.clip();
    c.translate(R, R); c.rotate(yaw); // Kamera-Richtung nach oben
    const tx = (x: number) => (x - p.x) * sc, tz = (z: number) => (z - p.z) * sc;
    c.strokeStyle = 'rgba(235,235,225,.55)'; c.lineCap = 'round';
    for (const q of this.net.paths) {
      if (q.foot) continue; const n = q.x.length; if (Math.abs(q.x[0] - p.x) > 400 && Math.abs(q.x[n - 1] - p.x) > 400) continue;
      c.lineWidth = Math.max(1.5, q.hw * 2 * sc); c.beginPath();
      for (let i = 0; i < n; i++) { const X = tx(q.x[i]), Z = tz(q.z[i]); if (i) c.lineTo(X, Z); else c.moveTo(X, Z); }
      c.stroke();
    }
    for (const q of police) { c.fillStyle = Math.floor(performance.now() / 250) % 2 ? '#3b6cff' : '#ff3b3b'; c.beginPath(); c.arc(tx(q.x), tz(q.z), 4, 0, Math.PI * 2); c.fill(); }
    if (target) {
      let X = tx(target.x), Z = tz(target.z); const L = Math.hypot(X, Z); if (L > R - 8) { X *= (R - 8) / L; Z *= (R - 8) / L; }
      c.fillStyle = '#ffcf3a'; c.beginPath(); c.arc(X, Z, 5.5, 0, Math.PI * 2); c.fill(); c.strokeStyle = '#000'; c.lineWidth = 1.5; c.stroke();
    }
    c.restore();
    c.fillStyle = '#fff'; c.beginPath(); c.moveTo(R, R - 7); c.lineTo(R + 5, R + 5); c.lineTo(R, R + 2); c.lineTo(R - 5, R + 5); c.closePath(); c.fill();
  }
}
const el = (root: HTMLElement, cls: string) => { const d = document.createElement('div'); d.className = cls; root.append(d); return d; };
