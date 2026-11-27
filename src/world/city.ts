import { PBRMaterial, Color3, PhysicsAggregate, PhysicsShapeType, type Mesh, type Scene } from '@babylonjs/core';
import earcut from 'earcut';
import { GeoBuilder } from './geo';
import { rng, pip, type Flat, type WorldData } from './data';
import type { Materials } from './materials';

type H = (x: number, z: number) => number;

/* ------------------------------------------------------------------ Straßen + Gehwege */
export function buildRoads(w: WorldData, scene: Scene, mats: Materials, height: H): Mesh[] {
  const road = new GeoBuilder(), walk = new GeoBuilder(), line = new GeoBuilder();
  for (const r of w.roads) {
    if (r.tu) continue;
    const pts: number[][] = [];
    for (let i = 0; i + 2 < r.p.length + 1; i += 3) pts.push([r.p[i], r.p[i + 1], r.p[i + 2] || 0]);
    if (pts.length < 2) continue;
    const hw = Math.max(2.2, r.hw), sw = r.t === 'n' || r.t === 'p' ? 0 : 2.4;
    let acc = 0;
    for (let k = 0; k < pts.length - 1; k++) {
      const [ax, az, ao] = pts[k], [bx, bz, bo] = pts[k + 1], L = Math.hypot(bx - ax, bz - az); if (L < 0.01) continue;
      const nx = -(bz - az) / L, nz = (bx - ax) / L;
      const ya = height(ax, az) + ao + 0.06, yb = height(bx, bz) + bo + 0.06;
      const strip = (g: GeoBuilder, o0: number, o1: number, dy: number) => g.quadUp(
        [[ax + nx * o0, ya + dy, az + nz * o0], [bx + nx * o0, yb + dy, bz + nz * o0], [bx + nx * o1, yb + dy, bz + nz * o1], [ax + nx * o1, ya + dy, az + nz * o1]],
        [[o0, acc], [o0, acc + L], [o1, acc + L], [o1, acc]]);
      strip(road, -hw, hw, 0);
      if (sw) { strip(walk, hw, hw + sw, 0.14); strip(walk, -hw - sw, -hw, 0.14); }
      // Mittellinie gestrichelt (3 m Strich, 6 m Lücke)
      if (r.ln >= 1 && !r.ow) for (let s = 0; s < L; s += 9) { const s1 = Math.min(L, s + 3), f0 = s / L, f1 = s1 / L, w2 = 0.07;
        const p0 = [ax + (bx - ax) * f0, ya + (yb - ya) * f0 + 0.01, az + (bz - az) * f0], p1 = [ax + (bx - ax) * f1, ya + (yb - ya) * f1 + 0.01, az + (bz - az) * f1];
        line.quadUp([[p0[0] - nx * w2, p0[1], p0[2] - nz * w2], [p1[0] - nx * w2, p1[1], p1[2] - nz * w2], [p1[0] + nx * w2, p1[1], p1[2] + nz * w2], [p0[0] + nx * w2, p0[1], p0[2] + nz * w2]], [[0, 0], [0, 1], [1, 1], [1, 0]]); }
      acc += L;
    }
  }
  const lineMat = new PBRMaterial('markierung', scene); lineMat.albedoColor = new Color3(0.92, 0.92, 0.88); lineMat.roughness = 0.6; lineMat.metallic = 0;
  const out = [road.build('strassen', scene, mats.get('asphalt')), walk.build('gehwege', scene, mats.get('paving')), line.build('markierung', scene, lineMat)].filter(Boolean) as Mesh[];
  for (const m of out) { m.receiveShadows = true; (m.material as PBRMaterial).zOffset = -2; }
  // Kollision nur Gehweg-Kanten sind niedrig → Straße/Gehweg als ein Boden-Kollider
  for (const m of out.slice(0, 2)) new PhysicsAggregate(m, PhysicsShapeType.MESH, { mass: 0, friction: 0.9 }, scene);
  return out;
}

/* ------------------------------------------------------------------ Gebäude */
const styleOf = (name: string, h: number, r: () => number) => {
  if (/Haut fourneau|Möllerei/i.test(name)) return 'rust';
  if (/Rockhal|Plaza|Maison du Savoir|Innovation|Sciences|Université/i.test(name)) return 'facade';
  if (/Halle|Massenoire|Terres Rouges/i.test(name)) return 'brick';
  return h > 14 ? (r() < 0.5 ? 'facade' : 'concrete') : r() < 0.65 ? 'plaster' : 'brick';
};
/** offene Bahnsteigdächer (Belval-Université) */
export const isCanopy = (name: string) => /^Belval-Université$|^Gare |Bahnsteig/i.test(name || '');
const area2 = (f: Flat) => { let a = 0; for (let i = 0, j = f.length - 2; i < f.length; j = i, i += 2) a += (f[j] - f[i]) * (f[j + 1] + f[i + 1]); return a; };

export function buildBuildings(w: WorldData, scene: Scene, mats: Materials, height: H): Mesh[] {
  const r = rng(2020), walls = new Map<string, GeoBuilder>(), roof = new GeoBuilder(), glass = new GeoBuilder(), frame = new GeoBuilder(), posts = new GeoBuilder();
  const tints = [new Color3(1, 1, 1), new Color3(0.95, 0.9, 0.82), new Color3(0.85, 0.88, 0.92), new Color3(0.96, 0.86, 0.78), new Color3(0.82, 0.86, 0.8)];
  for (const [, name, hRaw, ring] of w.B) {
    if (!ring || ring.length < 6) continue;
    let base = 1e9; for (let i = 0; i < ring.length; i += 2) base = Math.min(base, height(ring[i], ring[i + 1]));
    const hgt = Math.max(3.5, hRaw), top = base + hgt, st = styleOf(name, hgt, r);
    const key = st + (st === 'plaster' ? Math.floor(r() * tints.length) : '');
    let g = walls.get(key); if (!g) { g = new GeoBuilder(); walls.set(key, g); }
    const ccw = area2(ring) > 0, n = ring.length / 2;
    let u0 = 0;
    // Bahnsteigdach (in den Kartendaten ein geschlossener Block): nur Dach auf Stützen, sonst stünde man „im“ Gebäude
    if (isCanopy(name)) for (let i = 0; i < n; i++) {
      const ax = ring[i * 2], az = ring[i * 2 + 1], bx = ring[((i + 1) % n) * 2], bz = ring[((i + 1) % n) * 2 + 1], L = Math.hypot(bx - ax, bz - az);
      for (let s = 0; s < L; s += 9) { const x = ax + (bx - ax) * s / L, z = az + (bz - az) * s / L, y0 = height(x, z) - 0.2, d = 0.18;
        const c = [[x - d, z - d], [x + d, z - d], [x + d, z + d], [x - d, z + d]];
        for (let k = 0; k < 4; k++) { const [px, pz] = c[k], [qx, qz] = c[(k + 1) % 4]; posts.quad([[px, y0, pz], [qx, y0, qz], [qx, top, qz], [px, top, pz]], [[0, 0], [0.36, 0], [0.36, top - y0], [0, top - y0]]); } }
    }
    if (!isCanopy(name)) for (let i = 0; i < n; i++) {
      const a = i, b = (i + 1) % n, ax = ring[a * 2], az = ring[a * 2 + 1], bx = ring[b * 2], bz = ring[b * 2 + 1], L = Math.hypot(bx - ax, bz - az); if (L < 0.05) continue;
      // Außennormale
      let nx = -(bz - az) / L, nz = (bx - ax) / L; if (pip((ax + bx) / 2 + nx * 0.15, (az + bz) / 2 + nz * 0.15, ring)) { nx = -nx; nz = -nz; }
      const P = (x: number, y: number, z: number) => [x, y, z];
      const wq = [P(ax, base - 1, az), P(bx, base - 1, bz), P(bx, top, bz), P(ax, top, az)], uvq = [[u0, -1], [u0 + L, -1], [u0 + L, hgt], [u0, hgt]];
      // Reihenfolge so wählen, dass die Fläche nach außen zeigt
      const e = [bx - ax, 0, bz - az], up = [0, 1, 0], cn = [e[1] * up[2] - e[2] * up[1], e[2] * up[0] - e[0] * up[2], e[0] * up[1] - e[1] * up[0]];
      const out = cn[0] * nx + cn[2] * nz > 0;
      if (out) g.quad(wq, uvq); else g.quad([wq[1], wq[0], wq[3], wq[2]], [uvq[1], uvq[0], uvq[3], uvq[2]]);
      // Fenster: je Geschoss (3,2 m) und Achse (3,2 m) eine Glasscheibe mit Rahmen
      if (st !== 'rust' && L > 3) {
        const floors = Math.floor((hgt - 1) / 3.2), bays = Math.floor(L / 3.2), off = (L - bays * 3.2) / 2;
        for (let f = 0; f < floors; f++) for (let k = 0; k < bays; k++) {
          if (f === 0 && r() < 0.2) continue;
          const s0 = off + k * 3.2 + 0.85, s1 = s0 + 1.5, y0 = base + f * 3.2 + (f === 0 ? 0.6 : 0.9), y1 = y0 + (f === 0 ? 2.2 : 1.7);
          const pt = (s: number, y: number, d: number) => [ax + (bx - ax) * s / L + nx * d, y, az + (bz - az) * s / L + nz * d];
          const gq = [pt(s0, y0, 0.03), pt(s1, y0, 0.03), pt(s1, y1, 0.03), pt(s0, y1, 0.03)];
          if (out) glass.quad(gq, [[0, 0], [1, 0], [1, 1], [0, 1]]); else glass.quad([gq[1], gq[0], gq[3], gq[2]], [[1, 0], [0, 0], [0, 1], [1, 1]]);
          // Fensterbank
          const fb = [pt(s0 - 0.08, y0 - 0.06, 0.12), pt(s1 + 0.08, y0 - 0.06, 0.12), pt(s1 + 0.08, y0, 0.12), pt(s0 - 0.08, y0, 0.12)];
          if (out) frame.quad(fb, [[0, 0], [1, 0], [1, 1], [0, 1]]); else frame.quad([fb[1], fb[0], fb[3], fb[2]], [[1, 0], [0, 0], [0, 1], [1, 1]]);
        }
      }
      u0 += L;
    }
    // Dach (Flachdach, trianguliert)
    const tri = earcut(ring), b0 = roof.count;
    for (let i = 0; i < n; i++) roof.vert(ring[i * 2], top, ring[i * 2 + 1], 0, 1, 0, ring[i * 2], ring[i * 2 + 1]);
    for (let i = 0; i < tri.length; i += 3) roof.tri(b0 + tri[i], b0 + tri[i + 1], b0 + tri[i + 2]);
  }
  const out: Mesh[] = [];
  for (const [key, g] of walls) {
    const st = key.replace(/\d+$/, ''), ti = +(key.match(/\d+$/)?.[0] ?? -1);
    const m = g.build('waende_' + key, scene, mats.get(st, ti >= 0 ? { tint: tints[ti], name: '_' + ti } : undefined));
    if (m) out.push(m);
  }
  const postM = posts.build('stuetzen', scene, mats.get('concrete')); if (postM) out.push(postM);
  const roofM = roof.build('daecher', scene, mats.get('concrete')); if (roofM) { roofM.material!.backFaceCulling = false; out.push(roofM); }
  const gm = new PBRMaterial('glas', scene); gm.albedoColor = new Color3(0.05, 0.07, 0.09); gm.metallic = 0.6; gm.roughness = 0.06; gm.environmentIntensity = 1.4;
  const fm = new PBRMaterial('fensterbank', scene); fm.albedoColor = new Color3(0.75, 0.75, 0.73); fm.metallic = 0.2; fm.roughness = 0.5;
  const gl = glass.build('fenster', scene, gm), fr = frame.build('fensterbaenke', scene, fm);
  for (const m of out) { m.receiveShadows = true; new PhysicsAggregate(m, PhysicsShapeType.MESH, { mass: 0 }, scene); }
  if (gl) out.push(gl); if (fr) out.push(fr);
  return out;
}
