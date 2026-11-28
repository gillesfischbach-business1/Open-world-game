import {
  Mesh, PBRMaterial, Texture, Matrix, Quaternion, Vector3, VertexData, Color3, MultiMaterial, SubMesh, type Scene, type AbstractMesh,
} from '@babylonjs/core';
import { GeoBuilder } from './geo';
import { rng, pip, type WorldData } from './data';

/**
 * Laubbäume: Stamm und Äste mit Rindenfoto, Krone aus Blätter-Wolken (tools/trees/make_leaf_card.py, Poly Haven CC0).
 * Standorte: 268 Bäume aus OpenStreetMap, Baumreihen, Parks/Gärten/Wiesen.
 * Je 64-m-Viertel ein Mesh mit Thin-Instances (eigene Geometriekopie!) und zwei Stufen:
 * nah = volle Krone, fern = wenige große Blätter-Wolken, ganz fern = nicht gezeichnet.
 */
type H = (x: number, z: number) => number;
const DIR = './assets/trees/';

/** eine Baumvariante als zwei Teile (Rinde, Laub) */
function makeTree(seed: number, cards: number) {
  const r = rng(seed), bark = new GeoBuilder(), leaf = new GeoBuilder();
  const trunkH = 2.6 + r() * 1.2, crownY = trunkH + 1.6 + r() * 0.8, rx = 2.0 + r() * 0.7, ry = 1.8 + r() * 0.6;
  // Stamm: verjüngter 7-Eck-Zylinder, leicht schief
  const lean = (r() - 0.5) * 0.25, seg = 7;
  const ring = (y: number, rad: number, ox: number) => Array.from({ length: seg + 1 }, (_, k) => { const a = k / seg * Math.PI * 2; return [ox + Math.cos(a) * rad, y, Math.sin(a) * rad, k / seg]; });
  const tube = (y0: number, y1: number, r0: number, r1: number, o0: number, o1: number) => {
    const A = ring(y0, r0, o0), B = ring(y1, r1, o1);
    for (let k = 0; k < seg; k++) bark.quad([[A[k][0], A[k][1], A[k][2]], [A[k + 1][0], A[k + 1][1], A[k + 1][2]], [B[k + 1][0], B[k + 1][1], B[k + 1][2]], [B[k][0], B[k][1], B[k][2]]],
      [[A[k][3] * 2, y0 * 0.6], [A[k + 1][3] * 2, y0 * 0.6], [B[k + 1][3] * 2, y1 * 0.6], [B[k][3] * 2, y1 * 0.6]]);
  };
  tube(-0.3, trunkH, 0.2, 0.13, 0, lean);
  // Hauptäste: schräg nach oben in die Krone
  const branches = 3 + Math.floor(r() * 2);
  for (let b = 0; b < branches; b++) {
    const a = b / branches * Math.PI * 2 + r(), len = 1.6 + r() * 0.8, dx = Math.cos(a) * len, dz = Math.sin(a) * len;
    const p0 = [lean, trunkH - 0.2, 0], p1 = [lean + dx * 0.7, trunkH + 1.3 + r() * 0.5, dz * 0.7], w0 = 0.08, w1 = 0.035;
    for (let k = 0; k < 4; k++) { // vierkantig reicht für Äste
      const o = [[w0, 0], [0, w0], [-w0, 0], [0, -w0], [w0, 0]], q = [[w1, 0], [0, w1], [-w1, 0], [0, -w1], [w1, 0]];
      bark.quad([[p0[0] + o[k][0], p0[1], p0[2] + o[k][1]], [p0[0] + o[k + 1][0], p0[1], p0[2] + o[k + 1][1]], [p1[0] + q[k + 1][0], p1[1], p1[2] + q[k + 1][1]], [p1[0] + q[k][0], p1[1], p1[2] + q[k][1]]],
        [[0, 0], [0.3, 0], [0.3, 1], [0, 1]]);
    }
  }
  // Krone: Blätter-Wolken in einem Ellipsoid, jede zufällig gedreht
  for (let c = 0; c < cards; c++) {
    const u = r() * 2 - 1, t = r() * Math.PI * 2, s = Math.cbrt(0.25 + 0.75 * r()), cr = Math.sqrt(1 - u * u);
    const cx = lean + Math.cos(t) * cr * rx * s, cy = crownY + u * ry * s, cz = Math.sin(t) * cr * rx * s;
    const size = (cards > 8 ? 1.5 : 2.4) + r() * 0.9, yaw = r() * Math.PI, tilt = (r() - 0.5) * 1.1;
    const ax = [Math.cos(yaw) * size / 2, 0, Math.sin(yaw) * size / 2], up = [-Math.sin(yaw) * Math.sin(tilt) * size / 2, Math.cos(tilt) * size / 2, Math.cos(yaw) * Math.sin(tilt) * size / 2];
    const P = (a: number, b: number) => [cx + ax[0] * a + up[0] * b, cy + ax[1] * a + up[1] * b, cz + ax[2] * a + up[2] * b];
    leaf.quad([P(-1, -1), P(1, -1), P(1, 1), P(-1, 1)], [[0, 0], [1, 0], [1, 1], [0, 1]]);
  }
  return { bark, leaf, height: crownY + ry };
}

export async function buildTrees(w: WorldData, scene: Scene, height: H, opt: { near: number; far: number; max: number }): Promise<AbstractMesh[]> {
  if (opt.max <= 0) return [];
  const rand = rng(99), spots: [number, number, number, number][] = [];
  // Belegt-Raster (Gebäude, Straßen) gegen Bäume in Häusern/auf Fahrbahnen
  const G = 4, a = w.area, nx = Math.ceil((a.x1 - a.x0) / G), busy = new Uint8Array(nx * Math.ceil((a.z1 - a.z0) / G));
  const cell = (x: number, z: number) => Math.floor((z - a.z0) / G) * nx + Math.floor((x - a.x0) / G);
  for (const r of w.roads) for (let i = 0; i + 2 < r.p.length; i += 3) for (let o = -r.hw - 1; o <= r.hw + 1; o += 2) for (let o2 = -r.hw - 1; o2 <= r.hw + 1; o2 += 2) busy[cell(r.p[i] + o, r.p[i + 1] + o2)] = 1;
  for (const b of w.B) { const f = b[3]; if (!f) continue; let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (let i = 0; i < f.length; i += 2) { x0 = Math.min(x0, f[i]); x1 = Math.max(x1, f[i]); z0 = Math.min(z0, f[i + 1]); z1 = Math.max(z1, f[i + 1]); }
    for (let x = x0 - 2; x <= x1 + 2; x += G) for (let z = z0 - 2; z <= z1 + 2; z += G) if (pip(x, z, f)) busy[cell(x, z)] = 1; }
  const free = (x: number, z: number) => x > a.x0 && x < a.x1 && z > a.z0 && z < a.z1 && !busy[cell(x, z)];
  const add = (x: number, z: number, force = false) => { if (force || free(x, z)) { spots.push([x, height(x, z) - 0.1, z, rand() * 6.28]); busy[cell(x, z)] = 1; } };
  for (const [x, z] of w.osm.pts.tree || []) add(x, z, true);                                           // echte Baumstandorte
  for (const f of w.osm.lines.tree_row || []) for (let i = 0; i + 3 < f.length; i += 2) {                  // Baumreihen alle 8 m
    const L = Math.hypot(f[i + 2] - f[i], f[i + 3] - f[i + 1]); for (let s = 0; s < L; s += 8) add(f[i] + (f[i + 2] - f[i]) * s / L, f[i + 1] + (f[i + 3] - f[i + 1]) * s / L, true); }
  const areas = [...(w.osm.areas.park || []), ...(w.osm.areas.garden || []), ...(w.osm.areas.meadow || []), ...(w.osm.areas.grass || []), ...w.G];
  for (const f of areas) { let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (let i = 0; i < f.length; i += 2) { x0 = Math.min(x0, f[i]); x1 = Math.max(x1, f[i]); z0 = Math.min(z0, f[i + 1]); z1 = Math.max(z1, f[i + 1]); }
    const n = Math.min(30, Math.floor((x1 - x0) * (z1 - z0) / 700)); for (let k = 0; k < n; k++) { const x = x0 + rand() * (x1 - x0), z = z0 + rand() * (z1 - z0); if (pip(x, z, f)) add(x, z); } }
  const list = spots.slice(0, opt.max);

  // Materialien
  const barkM = new PBRMaterial('rinde', scene); barkM.albedoTexture = new Texture(DIR + 'rinde.webp', scene); barkM.metallic = 0; barkM.roughness = 0.95;
  const leafM = new PBRMaterial('laub', scene); const lt = new Texture(DIR + 'laub.webp', scene); lt.hasAlpha = true;
  leafM.albedoTexture = lt; leafM.useAlphaFromAlbedoTexture = true; leafM.transparencyMode = PBRMaterial.MATERIAL_ALPHATEST; leafM.alphaCutOff = 0.45;
  leafM.backFaceCulling = false; leafM.twoSidedLighting = true; leafM.metallic = 0; leafM.roughness = 0.75; leafM.albedoColor = new Color3(0.95, 1, 0.9);
  const multi = new MultiMaterial('baum', scene); multi.subMaterials = [barkM, leafM];

  // drei Varianten, je nah (viele Wolken) und fern (wenige große)
  const variant = (seed: number, cards: number) => {
    const t = makeTree(seed, cards), b = t.bark, l = t.leaf, off = b.count;
    const vd = new VertexData(); vd.positions = [...b.pos, ...l.pos]; vd.normals = [...b.nor, ...l.nor]; vd.uvs = [...b.uv, ...l.uv];
    vd.indices = [...b.idx, ...l.idx.map(i => i + off)];
    const m = new Mesh('baum' + seed + '_' + cards, scene); vd.applyToMesh(m); m.material = multi; m.subMeshes = [];
    new SubMesh(0, 0, off, 0, b.idx.length, m); new SubMesh(1, off, l.count, b.idx.length, l.idx.length, m);
    m.setEnabled(false); return m;
  };
  const tpl = [0, 1, 2].map(v => ({ near: variant(11 + v, 22), far: variant(11 + v, 6) }));

  const CELL = 64, cells = new Map<string, [number, number, number, number][][]>();
  list.forEach((s, i) => { const k = Math.floor(s[0] / CELL) + ',' + Math.floor(s[2] / CELL); let c = cells.get(k); if (!c) cells.set(k, c = [[], [], []]); c[i % 3].push(s); });
  const out: AbstractMesh[] = [], M = new Matrix(), q = new Quaternion(), sc = new Vector3(), tr = new Vector3();
  const inst = (src: Mesh, name: string, pts: [number, number, number, number][]) => {
    const m = new Mesh(name, scene); src.geometry!.copy(name).applyToMesh(m); m.material = multi; m.subMeshes = [];
    for (const s of src.subMeshes) new SubMesh(s.materialIndex, s.verticesStart, s.verticesCount, s.indexStart, s.indexCount, m);
    const buf = new Float32Array(pts.length * 16);
    pts.forEach(([x, y, z, yaw], i) => { Quaternion.FromEulerAnglesToRef(0, yaw, 0, q); const k = 0.85 + ((x * 7.3 + z * 3.1) % 1 + 1) % 1 * 0.35; sc.set(k, k, k); tr.set(x, y, z); Matrix.ComposeToRef(sc, q, tr, M); M.copyToArray(buf, i * 16); });
    m.thinInstanceSetBuffer('matrix', buf, 16, true); m.thinInstanceRefreshBoundingInfo(false); m.isPickable = false; m.receiveShadows = true;
    return m;
  };
  for (const [k, groups] of cells) groups.forEach((pts, v) => {
    if (!pts.length) return;
    const near = inst(tpl[v].near, `baum@${k}#${v}`, pts);
    const far = inst(tpl[v].far, `baumF@${k}#${v}`, pts);
    near.addLODLevel(opt.near, far); near.addLODLevel(opt.far, null);
    out.push(near);
  });
  return out;
}

