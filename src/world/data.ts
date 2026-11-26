/**
 * Kartendaten von Belval (aus OpenStreetMap © OpenStreetMap-Mitwirkende, ODbL).
 * Koordinaten in Metern: x = Osten, z = Süden, y = oben. Ursprung = Bahnhof Belval-Université.
 */
export type Flat = number[]; // [x0,z0,x1,z1,…]
export interface Road { t: string; nm?: string; hw: number; ln: number; ow: number; br: number; tu: number; vmax: number; p: number[] /* x,z,höhenversatz … */ }
export interface WorldData {
  area: { x0: number; z0: number; x1: number; z1: number };
  terrain: { x0: number; z0: number; step: number; nx: number; nz: number; h: number[]; ofs?: number };
  B: [string, string, number, Flat][]; // Gebäude: id, Name, Höhe, Grundriss
  P: [string, string | null, number, number, number | null][]; // Orte: Name, Gebäude, x, z, Etage
  G: Flat[]; W: Flat[]; // Grünflächen, Wasser
  PA: [string, Flat][]; // Fußwege
  roads: Road[];
  rail: { nm: string; p: number[] }[];
  osm: { pts: Record<string, number[][]>; areas: Record<string, Flat[]>; lines: Record<string, Flat[]> };
}

export async function loadWorld(onProgress: (f: number) => void): Promise<WorldData> {
  const r = await fetch('./data/world.json');
  if (!r.ok || !r.body) return r.json();
  const len = +(r.headers.get('content-length') || 0), rd = r.body.getReader(), parts: Uint8Array[] = [];
  let got = 0;
  for (;;) { const { done, value } = await rd.read(); if (done) break; parts.push(value); got += value.length; if (len) onProgress(got / len); }
  const all = new Uint8Array(got); let o = 0; for (const p of parts) { all.set(p, o); o += p.length; }
  return JSON.parse(new TextDecoder().decode(all));
}

/** Geländehöhe (bilinear) */
export function makeHeight(w: WorldData) {
  const T = w.terrain, ofs = T.ofs || 0;
  return (x: number, z: number) => {
    const fx = (x - T.x0) / T.step, fz = (z - T.z0) / T.step;
    const i = Math.max(0, Math.min(T.nx - 2, Math.floor(fx))), j = Math.max(0, Math.min(T.nz - 2, Math.floor(fz)));
    const u = Math.max(0, Math.min(1, fx - i)), v = Math.max(0, Math.min(1, fz - j)), h = T.h, n = T.nx;
    return (h[j * n + i] * (1 - u) + h[j * n + i + 1] * u) * (1 - v) + (h[(j + 1) * n + i] * (1 - u) + h[(j + 1) * n + i + 1] * u) * v + ofs;
  };
}

export const pip = (x: number, z: number, f: Flat) => { let c = false; for (let i = 0, j = f.length - 2; i < f.length; j = i, i += 2) { const xi = f[i], zi = f[i + 1], xj = f[j], zj = f[j + 1]; if (((zi > z) !== (zj > z)) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; } return c; };
export const polyCenter = (f: Flat) => { let x = 0, z = 0; const n = f.length / 2; for (let i = 0; i < f.length; i += 2) { x += f[i]; z += f[i + 1]; } return [x / n, z / n]; };
/** kleiner deterministischer Zufall */
export const rng = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
