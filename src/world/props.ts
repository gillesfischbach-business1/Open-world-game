import { SceneLoader, Mesh, Matrix, Quaternion, Vector3, type Scene, type AbstractMesh } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { rng, pip, type WorldData } from './data';

type H = (x: number, z: number) => number;

/** Lädt ein CC0-Modell (Poly Haven) und gibt seine Teil-Meshes zurück (unsichtbare Vorlage für Instanzen). */
async function template(scene: Scene, name: string, scale = 1): Promise<Mesh[]> {
  const res = await SceneLoader.ImportMeshAsync('', `./assets/models/${name}/`, `${name}.gltf`, scene);
  const meshes = res.meshes.filter((m): m is Mesh => m instanceof Mesh && m.getTotalVertices() > 0);
  for (const m of meshes) { m.setEnabled(true); m.isVisible = true; m.alwaysSelectAsActiveMesh = false; }
  const root = res.meshes[0]; root.scaling.scaleInPlace(scale); root.computeWorldMatrix(true);
  for (const m of meshes) { m.bakeCurrentTransformIntoVertices(); m.setParent(null); m.position.setAll(0); m.rotationQuaternion = Quaternion.Identity(); m.scaling.setAll(1); }
  root.dispose(false, false);
  return meshes;
}
/** Viele Kopien als Thin-Instances (ein Zeichenaufruf je Teil) */
function place(meshes: Mesh[], spots: [number, number, number, number][]): AbstractMesh[] {
  const buf = new Float32Array(spots.length * 16), m = new Matrix(), q = new Quaternion();
  spots.forEach(([x, y, z, yaw], i) => { Quaternion.FromEulerAnglesToRef(0, yaw, 0, q); Matrix.ComposeToRef(new Vector3(1, 1, 1), q, new Vector3(x, y, z), m); m.copyToArray(buf, i * 16); });
  for (const mesh of meshes) { mesh.thinInstanceSetBuffer('matrix', buf, 16, true); mesh.receiveShadows = true; mesh.isPickable = false; }
  return meshes;
}

export async function buildProps(w: WorldData, scene: Scene, height: H): Promise<AbstractMesh[]> {
  const r = rng(77), out: AbstractMesh[] = [];
  // Straßenlaternen alle ~32 m an Straßen (versetzt am Rand)
  try {
    const lamp = await template(scene, 'street_lamp_01'), spots: [number, number, number, number][] = [];
    for (const rd of w.roads) { if (rd.tu || rd.br) continue; let acc = 0; for (let i = 0; i + 5 < rd.p.length; i += 3) { const ax = rd.p[i], az = rd.p[i + 1], bx = rd.p[i + 3], bz = rd.p[i + 4], L = Math.hypot(bx - ax, bz - az); if (L < 0.1) continue; const nx = -(bz - az) / L, nz = (bx - ax) / L, off = Math.max(2.2, rd.hw) + 1.2;
      for (let s = (32 - acc % 32) % 32; s < L; s += 32) { const x = ax + (bx - ax) * s / L + nx * off, z = az + (bz - az) * s / L + nz * off; spots.push([x, height(x, z) + 0.15, z, Math.atan2(-nx, -nz)]); } acc += L; } }
    out.push(...place(lamp, spots.slice(0, 900)));
  } catch (e) { console.warn('Laternen', e); }
  // Bänke aus OSM
  try {
    const bench = await template(scene, 'painted_wooden_bench'); const pts = w.osm.pts.bench || [];
    out.push(...place(bench, pts.map(p => [p[0], height(p[0], p[1]) + 0.12, p[1], r() * Math.PI * 2] as [number, number, number, number])));
  } catch (e) { console.warn('Bänke', e); }
  // Sträucher in Grünflächen
  try {
    const shrub = await template(scene, 'shrub_02'), spots: [number, number, number, number][] = [];
    for (const f of w.G.concat(w.osm.areas.park || [])) { let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9; for (let i = 0; i < f.length; i += 2) { x0 = Math.min(x0, f[i]); x1 = Math.max(x1, f[i]); z0 = Math.min(z0, f[i + 1]); z1 = Math.max(z1, f[i + 1]); }
      const n = Math.min(40, Math.floor((x1 - x0) * (z1 - z0) / 260)); for (let k = 0; k < n; k++) { const x = x0 + r() * (x1 - x0), z = z0 + r() * (z1 - z0); if (pip(x, z, f)) spots.push([x, height(x, z), z, r() * 6.28]); } }
    out.push(...place(shrub, spots.slice(0, 2500)));
  } catch (e) { console.warn('Sträucher', e); }
  // Pflanzkübel an Plätzen
  try {
    const pl = await template(scene, 'planter_box_01'), spots: [number, number, number, number][] = [];
    for (const f of w.osm.areas.plaza || []) for (let k = 0; k < 4; k++) { const i = Math.floor(r() * f.length / 2) * 2; const x = f[i] * 0.85 + (f[0] * 0.15), z = f[i + 1] * 0.85 + f[1] * 0.15; spots.push([x, height(x, z) + 0.1, z, r() * 6.28]); }
    out.push(...place(pl, spots));
  } catch (e) { console.warn('Kübel', e); }
  return out;
}
