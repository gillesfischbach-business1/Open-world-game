import { MeshBuilder, StandardMaterial, Color3, Vector3, type Scene, type Mesh } from '@babylonjs/core';
import type { Line } from './dialogue';

/** Zähler, die das Spiel laufend erhöht – Missionen vergleichen sie mit dem Stand beim Start. */
export interface Stats { talks: number; zaps: number; steals: number; escapes: number; crashes: number; }
export interface Ctx { stats: Stats; pos: Vector3; inCar: boolean; heat: number; }
interface Place { name: string; x: number; z: number; r: number; }
interface Mission {
  id: string; title: Line; text: Line;
  /** aktuelles Ziel auf der Karte (oder keins) */
  target?: (m: Run) => Place | null;
  /** Fortschritt als kurzer Text, z. B. "2/3" */
  progress?: (c: Ctx, m: Run) => string;
  done: (c: Ctx, m: Run) => boolean;
  reward: Line;
}
interface Run { base: Stats; flag: Record<string, boolean>; }

const P = {
  rockhal: { name: 'Rockhal', x: 103.8, z: -34, r: 28 },
  plaza: { name: 'Belval Plaza', x: -22.6, z: -88.5, r: 22 },
  ofen: { name: 'Hauts Fourneaux', x: 139.5, z: -186.3, r: 26 },
  massenoire: { name: 'Massenoire', x: 149.5, z: -125.2, r: 22 },
  savoir: { name: 'Maison du Savoir', x: 227.5, z: -511.4, r: 30 },
};
const near = (c: Ctx, p: Place) => Math.hypot(c.pos.x - p.x, c.pos.z - p.z) < p.r;
const diff = (c: Ctx, m: Run, k: keyof Stats) => c.stats[k] - m.base[k];

const LIST: Mission[] = [
  { id: 'moien', title: ['Moien Belval', 'Hallo Belval'], text: ['Schwätz mat 3 Leit (E).', 'Sprich mit 3 Leuten (E).'],
    progress: (c, m) => `${Math.min(3, diff(c, m, 'talks'))}/3`, done: (c, m) => diff(c, m, 'talks') >= 3, reward: ['D\'Leit kennen dech elo!', 'Die Leute kennen dich jetzt!'] },
  { id: 'plaza', title: ['Shopping-Tour', 'Einkaufsbummel'], text: ['Gëff bei d\'Belval Plaza.', 'Geh zur Belval Plaza.'],
    target: () => P.plaza, done: c => near(c, P.plaza), reward: ['Plaza fonnt!', 'Plaza gefunden!'] },
  { id: 'blëtz', title: ['Blëtz-Training', 'Blitz-Training'], text: ['Schock 3 Leit (ZAP / Q).', 'Schocke 3 Leute (ZAP / Q).'],
    progress: (c, m) => `${Math.min(3, diff(c, m, 'zaps'))}/3`, done: (c, m) => diff(c, m, 'zaps') >= 3, reward: ['Wat eng Energie!', 'Was für eine Energie!'] },
  { id: 'rockhal', title: ['Spazéierfahrt', 'Spritztour'], text: ['Huel der en Auto (E) a fuer bei d\'Rockhal.', 'Nimm dir ein Auto (E) und fahr zur Rockhal.'],
    target: () => P.rockhal, done: c => c.inCar && near(c, P.rockhal), reward: ['Ukomm mat Stil!', 'Mit Stil angekommen!'] },
  { id: 'flucht', title: ['Fluchtwee', 'Fluchtweg'], text: ['Gëff gesicht (2 ★) an entkomm der Police.', 'Werde gesucht (2 ★) und entkomme der Polizei.'],
    progress: (c, m) => m.flag.wanted ? (c.heat > 0 ? 'Entkomm!' : '') : `${c.heat}/2 ★`,
    done: (c, m) => { if (c.heat >= 2) m.flag.wanted = true; return !!m.flag.wanted && c.heat === 0; }, reward: ['Entkomm! Keen huet dech gesinn.', 'Entkommen! Keiner hat dich gesehen.'] },
  { id: 'ofen', title: ['Um Héichuewen', 'Am Hochofen'], text: ['Besich d\'Hauts Fourneaux.', 'Besuche die Hochöfen.'],
    target: () => P.ofen, done: c => near(c, P.ofen), reward: ['Hei gouf fréier Stol gemaach.', 'Hier wurde früher Stahl gemacht.'] },
  { id: 'tour', title: ['Belval-Tour', 'Belval-Tour'], text: ['Massenoire an d\'Maison du Savoir besichen.', 'Besuche Massenoire und die Maison du Savoir.'],
    target: m => (!m.flag.massenoire ? P.massenoire : !m.flag.savoir ? P.savoir : null),
    progress: (_c, m) => `${+!!m.flag.massenoire + +!!m.flag.savoir}/2`,
    done: (c, m) => { if (near(c, P.massenoire)) m.flag.massenoire = true; if (near(c, P.savoir)) m.flag.savoir = true; return !!(m.flag.massenoire && m.flag.savoir); }, reward: ['Du kenns Belval elo wéi däi Mantel!', 'Du kennst Belval jetzt wie deine Westentasche!'] },
];

const KEY = 'letz-adventures-v1';

/** Missionsreihe mit Ziel-Leuchtsäule; Fortschritt bleibt im Browser gespeichert. */
export class Missions {
  idx = 0; stats: Stats = { talks: 0, zaps: 0, steals: 0, escapes: 0, crashes: 0 }; private run: Run; private beam: Mesh;
  onDone?: (title: Line, reward: Line) => void;
  constructor(scene: Scene) {
    try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s) { this.idx = Math.min(LIST.length, s.idx || 0); Object.assign(this.stats, s.stats || {}); } } catch { /* neu */ }
    this.run = { base: { ...this.stats }, flag: {} };
    this.beam = MeshBuilder.CreateCylinder('zielsaeule', { height: 90, diameter: 4, tessellation: 24, cap: 0 }, scene);
    const m = new StandardMaterial('ziel', scene); m.disableLighting = true; m.emissiveColor = new Color3(1, 0.78, 0.2); m.alpha = 0.28; m.backFaceCulling = false;
    this.beam.material = m; this.beam.isPickable = false; this.beam.setEnabled(false);
  }
  get current() { return LIST[this.idx] ?? null; }
  get total() { return LIST.length; }
  save() { try { localStorage.setItem(KEY, JSON.stringify({ idx: this.idx, stats: this.stats })); } catch { /* egal */ } }
  reset() { this.idx = 0; this.run = { base: { ...this.stats }, flag: {} }; this.save(); }
  /** liefert Anzeige-Infos für das HUD */
  update(c: Ctx, height: (x: number, z: number) => number): { title: Line; text: Line; progress: string; target: Place | null; n: number } | null {
    const m = this.current; if (!m) { this.beam.setEnabled(false); return null; }
    if (m.done(c, this.run)) {
      this.onDone?.(m.title, m.reward); this.idx++; this.run = { base: { ...this.stats }, flag: {} }; this.save();
      return this.update(c, height);
    }
    const t = m.target?.(this.run) ?? null;
    if (t) { this.beam.setEnabled(true); this.beam.position.set(t.x, height(t.x, t.z) + 45, t.z); } else this.beam.setEnabled(false);
    return { title: m.title, text: m.text, progress: m.progress?.(c, this.run) ?? '', target: t, n: this.idx + 1 };
  }
}
