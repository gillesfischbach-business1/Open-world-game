import { SceneLoader, Mesh, MeshBuilder, PBRMaterial, Color3, Matrix, Quaternion, Vector3, type Scene, type AbstractMesh } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { rng, pip, type WorldData } from './data';

type H = (x: number, z: number) => number;

/** Sitzplatz für Menschen: Position (Boden), Blickrichtung, Art (Bank oder Café-Tisch) */
export interface Seat { x: number; y: number; z: number; yaw: number; kind: 'bench' | 'cafe'; taken: boolean; }
export const seats: Seat[] = [];
/** Standorte der Straßenlaternen (x, z) – für die Nacht-Lichtkegel (world/night.ts) */
export const lampSpots: Array<[number, number]> = [];
/** Vorderseite der Bank-Vorlage relativ zur Drehung (im Spiel geprüft) */
const BENCH_FRONT = 0;

/** Lädt ein CC0-Modell (Poly Haven) und gibt seine Teil-Meshes zurück (unsichtbare Vorlage für Instanzen). */
async function template(scene: Scene, name: string, scale = 1, file = name): Promise<Mesh[]> {
  const res = await SceneLoader.ImportMeshAsync('', `./assets/models/${name}/`, `${file}.gltf`, scene);
  const meshes = res.meshes.filter((m): m is Mesh => m instanceof Mesh && m.getTotalVertices() > 0);
  for (const m of meshes) { m.setEnabled(true); m.isVisible = true; m.alwaysSelectAsActiveMesh = false; }
  const root = res.meshes[0]; root.scaling.scaleInPlace(scale); root.computeWorldMatrix(true);
  for (const m of meshes) { m.bakeCurrentTransformIntoVertices(); m.setParent(null); m.position.setAll(0); m.rotationQuaternion = Quaternion.Identity(); m.scaling.setAll(1); }
  root.dispose(false, false);
  return meshes;
}
/**
 * Viele Kopien als Thin-Instances – aufgeteilt in Stadtviertel (CELL m), damit nur Viertel im Bild
 * und in Reichweite (`dist` m) gezeichnet werden. Früher lag die ganze Stadt in EINEM Zeichenaufruf:
 * 900 Laternen + 4000 Büsche ≈ 36 Mio. Eckpunkte pro Bild, auch hinter der Kamera.
 */
const CELL = 64;
function place(meshes: Mesh[], spots: [number, number, number, number][], dist: number): AbstractMesh[] {
  const cells = new Map<string, [number, number, number, number][]>();
  for (const s of spots) { const k = Math.floor(s[0] / CELL) + ',' + Math.floor(s[2] / CELL); let c = cells.get(k); if (!c) cells.set(k, c = []); c.push(s); }
  const out: AbstractMesh[] = [], m = new Matrix(), q = new Quaternion(), one = new Vector3(1, 1, 1), t = new Vector3();
  for (const [k, list] of cells) {
    const buf = new Float32Array(list.length * 16);
    list.forEach(([x, y, z, yaw], i) => { Quaternion.FromEulerAnglesToRef(0, yaw, 0, q); t.set(x, y, z); Matrix.ComposeToRef(one, q, t, m); m.copyToArray(buf, i * 16); });
    for (const tpl of meshes) {
      // eigene Geometrie je Viertel: Thin-Instance-Puffer hängen an der Geometrie – geteilt zeichnete jedes Viertel die Laternen des letzten
      const c = new Mesh(tpl.name + '@' + k, tpl.getScene()); tpl.geometry!.copy(tpl.name + '#' + k).applyToMesh(c); c.material = tpl.material;
      c.thinInstanceSetBuffer('matrix', buf, 16, true); c.thinInstanceRefreshBoundingInfo(false);
      c.receiveShadows = true; c.isPickable = false; c.addLODLevel(dist, null); // weiter weg: gar nicht zeichnen
      out.push(c);
    }
  }
  for (const tpl of meshes) tpl.setEnabled(false);
  return out;
}

/** lite: vereinfachte Modelle und kürzere Sichtweite (Handys, schwache Geräte) */
export async function buildProps(w: WorldData, scene: Scene, height: H, lite = false): Promise<AbstractMesh[]> {
  const r = rng(77), out: AbstractMesh[] = [], far = lite ? 1 : 2;
  // Straßenlaternen alle ~32 m an Straßen (versetzt am Rand)
  try {
    const lamp = await template(scene, 'street_lamp_01', 1, lite ? 'street_lamp_01_lo' : 'street_lamp_01'), spots: [number, number, number, number][] = [];
    for (const rd of w.roads) { if (rd.tu || rd.br) continue; let acc = 0; for (let i = 0; i + 5 < rd.p.length; i += 3) { const ax = rd.p[i], az = rd.p[i + 1], bx = rd.p[i + 3], bz = rd.p[i + 4], L = Math.hypot(bx - ax, bz - az); if (L < 0.1) continue; const nx = -(bz - az) / L, nz = (bx - ax) / L, off = Math.max(2.2, rd.hw) + 1.2;
      for (let s = (32 - acc % 32) % 32; s < L; s += 32) { const x = ax + (bx - ax) * s / L + nx * off, z = az + (bz - az) * s / L + nz * off; spots.push([x, height(x, z) + 0.15, z, Math.atan2(-nx, -nz)]); } acc += L; } }
    out.push(...place(lamp, spots.slice(0, 900), 120 * far));
    for (const s of spots.slice(0, 900)) lampSpots.push([s[0], s[2]]);
  } catch (e) { console.warn('Laternen', e); }
  // Bänke aus OSM
  try {
    const bench = await template(scene, 'painted_wooden_bench'); const pts = w.osm.pts.bench || [];
    const spots = pts.map(p => [p[0], height(p[0], p[1]) + 0.12, p[1], r() * Math.PI * 2] as [number, number, number, number]);
    out.push(...place(bench, spots, 70 * far));
    for (const [x, y, z, yaw] of spots) for (const o of [-0.36, 0.36]) {
      const ax = Math.cos(yaw), az = -Math.sin(yaw), fx = Math.sin(yaw + BENCH_FRONT), fz = Math.cos(yaw + BENCH_FRONT);
      seats.push({ x: x + ax * o + fx * 0.05, y: y - 0.12, z: z + az * o + fz * 0.05, yaw: yaw + BENCH_FRONT, kind: 'bench', taken: false });
    }
  } catch (e) { console.warn('Bänke', e); }
  // Sträucher in Grünflächen
  try {
    const shrub = await template(scene, 'shrub_02', 1, lite ? 'shrub_02_lo' : 'shrub_02'), spots: [number, number, number, number][] = [];
    for (const f of w.G.concat(w.osm.areas.park || [])) { let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9; for (let i = 0; i < f.length; i += 2) { x0 = Math.min(x0, f[i]); x1 = Math.max(x1, f[i]); z0 = Math.min(z0, f[i + 1]); z1 = Math.max(z1, f[i + 1]); }
      const n = Math.min(40, Math.floor((x1 - x0) * (z1 - z0) / 260)); for (let k = 0; k < n; k++) { const x = x0 + r() * (x1 - x0), z = z0 + r() * (z1 - z0); if (pip(x, z, f)) spots.push([x, height(x, z), z, r() * 6.28]); } }
    out.push(...place(shrub, spots.slice(0, lite ? 1500 : 2500), 90 * far));
  } catch (e) { console.warn('Sträucher', e); }
  // Pflanzkübel an Plätzen
  try {
    const pl = await template(scene, 'planter_box_01'), spots: [number, number, number, number][] = [];
    for (const f of w.osm.areas.plaza || []) for (let k = 0; k < 4; k++) { const i = Math.floor(r() * f.length / 2) * 2; const x = f[i] * 0.85 + (f[0] * 0.15), z = f[i + 1] * 0.85 + f[1] * 0.15; spots.push([x, height(x, z) + 0.1, z, r() * 6.28]); }
    out.push(...place(pl, spots, 70 * far));
  } catch (e) { console.warn('Kübel', e); }
  // Café-Terrassen: runde Tische mit zwei Stühlen vor jedem Café und Restaurant
  try { out.push(...buildCafes(w, scene, height)); } catch (e) { console.warn('Cafés', e); }
  return out;
}

function buildCafes(w: WorldData, scene: Scene, height: H): AbstractMesh[] {
  const iron = new PBRMaterial('schmiedeeisen', scene); iron.albedoColor = new Color3(0.06, 0.06, 0.065); iron.metallic = 0.7; iron.roughness = 0.45;
  const top = new PBRMaterial('tischplatte', scene); top.albedoColor = new Color3(0.08, 0.08, 0.09); top.metallic = 0.6; top.roughness = 0.35;
  const cup = new PBRMaterial('tasse', scene); cup.albedoColor = new Color3(0.95, 0.94, 0.9); cup.metallic = 0; cup.roughness = 0.25;
  const parts = (name: string, list: Mesh[], mat: PBRMaterial) => { const m = Mesh.MergeMeshes(list, true, true)!; m.name = name; m.material = mat; return m; };
  // Vorlagen (Ursprung = Boden in der Mitte)
  const tTop = MeshBuilder.CreateCylinder('t1', { diameter: 0.7, height: 0.03, tessellation: 24 }, scene); tTop.position.y = 0.74;
  const tPole = MeshBuilder.CreateCylinder('t2', { diameter: 0.06, height: 0.72, tessellation: 8 }, scene); tPole.position.y = 0.37;
  const tFoot = MeshBuilder.CreateCylinder('t3', { diameter: 0.45, height: 0.03, tessellation: 16 }, scene); tFoot.position.y = 0.015;
  const tbl = parts('cafetisch', [tTop, tPole, tFoot], top);
  const ch: Mesh[] = [];
  const seat = MeshBuilder.CreateBox('s', { width: 0.42, height: 0.03, depth: 0.42 }, scene); seat.position.y = 0.45; ch.push(seat);
  const back = MeshBuilder.CreateBox('r', { width: 0.42, height: 0.42, depth: 0.03 }, scene); back.position.set(0, 0.68, -0.2); back.rotation.x = -0.12; ch.push(back);
  for (const [x, z] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) { const l = MeshBuilder.CreateCylinder('l', { diameter: 0.025, height: 0.45, tessellation: 6 }, scene); l.position.set(x, 0.225, z); ch.push(l); }
  const chair = parts('cafestuhl', ch, iron);
  const cupT = MeshBuilder.CreateCylinder('tasse', { diameterTop: 0.085, diameterBottom: 0.06, height: 0.07, tessellation: 12 }, scene); cupT.material = cup;
  const tSpots: [number, number, number, number][] = [], cSpots: [number, number, number, number][] = [], uSpots: [number, number, number, number][] = [];
  const pts = [...(w.osm.pts.cafe || []), ...(w.osm.pts.restaurant || []), ...(w.osm.pts.bar || [])];
  pts.forEach((p, k) => {
    // Terrasse zwischen Lokal und nächster Straße
    let best = 1e9, bx = 0, bz = 0, hw = 3;
    for (const r of w.roads) { if (r.tu) continue; for (let i = 0; i + 2 < r.p.length; i += 3) { const d = Math.hypot(r.p[i] - p[0], r.p[i + 1] - p[1]); if (d < best) { best = d; bx = r.p[i]; bz = r.p[i + 1]; hw = r.hw; } } }
    const dx = p[0] - bx, dz = p[1] - bz, L = Math.hypot(dx, dz) || 1, ux = dx / L, uz = dz / L, off = Math.min(L * 0.7, Math.max(2.2, hw) + 3.6);
    const cx = bx + ux * off, cz = bz + uz * off, ax = -uz, az = ux; // entlang der Fassade
    const nT = k < 12 ? 3 : 2;
    for (let t = 0; t < nT; t++) {
      const o = (t - (nT - 1) / 2) * 1.9, x = cx + ax * o, z = cz + az * o, y = height(x, z) + 0.12;
      tSpots.push([x, y, z, 0]); uSpots.push([x + 0.12, y + 0.79, z - 0.05, 0]);
      for (const s of [1, -1]) { const sx = x + ux * 0.62 * s, sz = z + uz * 0.62 * s, yaw = Math.atan2(-ux * s, -uz * s); cSpots.push([sx, y, sz, yaw + Math.PI]); seats.push({ x: sx, y, z: sz, yaw, kind: 'cafe', taken: false }); }
    }
  });
  return [...place([tbl], tSpots, 90), ...place([chair], cSpots, 90), ...place([cupT], uSpots, 40)];
}
