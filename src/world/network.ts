import type { WorldData } from './data';

type H = (x: number, z: number) => number;

/** Ein befahrbarer/begehbarer Weg (eine OSM-Straße) mit Punkten inkl. Höhe und Längen. */
export interface Path {
  id: number; x: Float32Array; y: Float32Array; z: Float32Array; s: Float32Array; len: number;
  hw: number; oneway: boolean; walk: boolean; drive: boolean; foot: boolean; vmax: number;
  /** angrenzende Wege an Anfang (0) und Ende (1): [Weg, beginnt dort?] */
  link: [Array<[number, boolean]>, Array<[number, boolean]>];
}
export interface Sample { x: number; y: number; z: number; dx: number; dz: number; }

/**
 * Straßennetz aus den Kartendaten: Autos fahren auf der rechten Spur, Fußgänger auf dem Gehweg.
 * Wege werden an ihren Endpunkten verknüpft (Abstand < 4 m), damit Figuren von Straße zu Straße wechseln.
 */
export class Network {
  paths: Path[] = [];
  constructor(w: WorldData, height: H) {
    for (const r of w.roads) {
      if (r.tu) continue;
      const n = Math.floor(r.p.length / 3); if (n < 2) continue;
      const x = new Float32Array(n), y = new Float32Array(n), z = new Float32Array(n), s = new Float32Array(n);
      for (let i = 0; i < n; i++) { x[i] = r.p[i * 3]; z[i] = r.p[i * 3 + 1]; y[i] = height(x[i], z[i]) + (r.p[i * 3 + 2] || 0) + 0.06; if (i) s[i] = s[i - 1] + Math.hypot(x[i] - x[i - 1], z[i] - z[i - 1]); }
      if (s[n - 1] < 8) continue;
      this.paths.push({ id: this.paths.length, x, y, z, s, len: s[n - 1], hw: Math.max(2.2, r.hw), oneway: !!r.ow, walk: true, drive: true, foot: false, vmax: Math.min(r.vmax || 50, 70), link: [[], []] });
    }
    // Fußwege (nur für Fußgänger, mittig begehbar); lange Abschnitte in 3-m-Schritte teilen
    for (const [, f] of w.PA) {
      const raw: number[][] = [];
      for (let i = 0; i + 1 < f.length; i += 2) {
        if (raw.length) { const [px, pz] = raw[raw.length - 1], L = Math.hypot(f[i] - px, f[i + 1] - pz), k = Math.floor(L / 3); for (let j = 1; j < k; j++) raw.push([px + (f[i] - px) * j / k, pz + (f[i + 1] - pz) * j / k]); }
        raw.push([f[i], f[i + 1]]);
      }
      const n = raw.length; if (n < 2) continue;
      const x = new Float32Array(n), y = new Float32Array(n), z = new Float32Array(n), s = new Float32Array(n);
      for (let i = 0; i < n; i++) { x[i] = raw[i][0]; z[i] = raw[i][1]; y[i] = height(x[i], z[i]) + 0.05; if (i) s[i] = s[i - 1] + Math.hypot(x[i] - x[i - 1], z[i] - z[i - 1]); }
      if (s[n - 1] < 6) continue;
      this.paths.push({ id: this.paths.length, x, y, z, s, len: s[n - 1], hw: 0, oneway: false, walk: true, drive: false, foot: true, vmax: 0, link: [[], []] });
    }
    // Endpunkte verknüpfen (einfaches Raster für schnelle Suche)
    const ends: Array<{ p: number; e: 0 | 1; x: number; z: number }> = [];
    for (const p of this.paths) { const n = p.x.length - 1; ends.push({ p: p.id, e: 0, x: p.x[0], z: p.z[0] }, { p: p.id, e: 1, x: p.x[n], z: p.z[n] }); }
    const grid = new Map<string, typeof ends>(), key = (x: number, z: number) => Math.floor(x / 8) + ',' + Math.floor(z / 8);
    for (const e of ends) { const k = key(e.x, e.z); (grid.get(k) ?? grid.set(k, []).get(k)!).push(e); }
    for (const a of ends) {
      const gx = Math.floor(a.x / 8), gz = Math.floor(a.z / 8);
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const b of grid.get(gx + i + ',' + (gz + j)) ?? []) {
        if (b.p === a.p || Math.hypot(a.x - b.x, a.z - b.z) > 4) continue;
        this.paths[a.p].link[a.e].push([b.p, b.e === 0]);
      }
    }
  }
  /** Position auf Weg p bei Strecke s, seitlich versetzt (positiv = rechts in Fahrtrichtung dir). */
  sample(p: Path, s: number, dir: 1 | -1, side: number, out: Sample): Sample {
    s = Math.max(0, Math.min(p.len, s));
    let lo = 0, hi = p.s.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (p.s[m] <= s) lo = m; else hi = m; }
    const seg = p.s[hi] - p.s[lo] || 1, f = (s - p.s[lo]) / seg;
    let dx = p.x[hi] - p.x[lo], dz = p.z[hi] - p.z[lo]; const L = Math.hypot(dx, dz) || 1; dx = dx / L * dir; dz = dz / L * dir;
    out.x = p.x[lo] + (p.x[hi] - p.x[lo]) * f - dz * side; out.z = p.z[lo] + (p.z[hi] - p.z[lo]) * f + dx * side;
    out.y = p.y[lo] + (p.y[hi] - p.y[lo]) * f; out.dx = dx; out.dz = dz;
    return out;
  }
  /** nächster Weg am Ende: liefert [Weg, Richtung, Start-s] */
  next(p: Path, dir: 1 | -1, rnd: number, filter: (q: Path) => boolean, car: boolean): [Path, 1 | -1, number] {
    const opts = p.link[dir === 1 ? 1 : 0].map(([q, atStart]) => [this.paths[q], atStart] as const)
      .filter(([q, atStart]) => filter(q) && (!car || atStart || !q.oneway));
    if (opts.length) { const [q, atStart] = opts[Math.floor(rnd * opts.length) % opts.length]; return atStart ? [q, 1, 0] : [q, -1, q.len]; }
    if (!car || !p.oneway) return [p, (dir === 1 ? -1 : 1), dir === 1 ? p.len : 0]; // umdrehen
    return [p, 1, 0];
  }
  /** zufälliger Punkt auf einem Weg im Abstand [r0, r1] um (x, z) */
  pick(x: number, z: number, r0: number, r1: number, rnd: () => number, filter: (q: Path) => boolean): [Path, number] | null {
    // alle Wegpunkte im Ring sammeln, dann zufällig wählen (nach Weglänge gewichtet durch Punktdichte)
    const cand: Array<[Path, number]> = [];
    for (const p of this.paths) {
      if (!filter(p)) continue;
      for (let i = 0; i < p.x.length; i++) { const d = Math.hypot(p.x[i] - x, p.z[i] - z); if (d >= r0 && d <= r1) cand.push([p, p.s[i]]); }
    }
    return cand.length ? cand[Math.floor(rnd() * cand.length)] : null;
  }
}
