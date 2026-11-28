import { Mesh, Matrix, Quaternion, Vector3, PBRMaterial, Color3, type Scene } from '@babylonjs/core';
import { GeoBuilder } from './geo';

/**
 * Fenster-Details: Rahmen, Sprossen und Sturz als EIN kleines Modul, das als Thin-Instance an jedes Fenster
 * gesetzt wird – aufgeteilt in 64-m-Viertel mit Sichtweite (weiter weg bleibt nur die einfache Glasscheibe).
 * Modul-Maße: 1 × 1 (Breite × Höhe), Mitte im Ursprung, ragt nach +Z aus der Wand; skaliert je Fenster.
 */
export interface WindowSpot { x: number; y: number; z: number; yaw: number; w: number; h: number }

function moduleGeo() {
  const g = new GeoBuilder();
  // Quader (Vorder-, Ober-, Unter- und Seitenflächen; Rückseite liegt an der Wand)
  const bar = (x0: number, y0: number, x1: number, y1: number, d: number) => {
    const f = [[x0, y0, d], [x1, y0, d], [x1, y1, d], [x0, y1, d]];
    g.quad(f, [[0, 0], [1, 0], [1, 1], [0, 1]]);
    g.quad([[x0, y1, 0], [x0, y1, d], [x1, y1, d], [x1, y1, 0]], [[0, 0], [0, 1], [1, 1], [1, 0]]);
    g.quad([[x0, y0, 0], [x1, y0, 0], [x1, y0, d], [x0, y0, d]], [[0, 0], [1, 0], [1, 1], [0, 1]]);
    g.quad([[x0, y0, 0], [x0, y0, d], [x0, y1, d], [x0, y1, 0]], [[0, 0], [1, 0], [1, 1], [0, 1]]);
    g.quad([[x1, y0, 0], [x1, y1, 0], [x1, y1, d], [x1, y0, d]], [[0, 0], [0, 1], [1, 1], [1, 0]]);
  };
  const t = 0.055, m = 0.03;
  bar(-0.5, -0.5, 0.5, -0.5 + t, 0.07); bar(-0.5, 0.5 - t, 0.5, 0.5, 0.07);       // Rahmen unten/oben
  bar(-0.5, -0.5, -0.5 + t, 0.5, 0.07); bar(0.5 - t, -0.5, 0.5, 0.5, 0.07);       // Rahmen links/rechts
  bar(-m / 2, -0.5, m / 2, 0.5, 0.045);                                          // Mittelsprosse
  bar(-0.5, 0.12 - m / 2, 0.5, 0.12 + m / 2, 0.045);                             // Kämpfer (Querholz)
  bar(-0.58, 0.5, 0.58, 0.58, 0.11);                                             // Sturz über dem Fenster
  return g;
}

export function buildWindowDetail(scene: Scene, spots: WindowSpot[], dist: number): Mesh[] {
  if (!spots.length || dist <= 0) return [];
  const mat = new PBRMaterial('fensterrahmen', scene);
  mat.albedoColor = new Color3(0.86, 0.86, 0.84); mat.metallic = 0.1; mat.roughness = 0.55;
  mat.backFaceCulling = false; mat.twoSidedLighting = true; // Wicklung egal, Licht stimmt von beiden Seiten
  const tpl = moduleGeo().build('fensterrahmen', scene, mat, { normals: false })!;
  const CELL = 64, cells = new Map<string, WindowSpot[]>();
  for (const s of spots) { const k = Math.floor(s.x / CELL) + ',' + Math.floor(s.z / CELL); let c = cells.get(k); if (!c) cells.set(k, c = []); c.push(s); }
  const out: Mesh[] = [], M = new Matrix(), q = new Quaternion(), sc = new Vector3(), tr = new Vector3();
  for (const [k, list] of cells) {
    const buf = new Float32Array(list.length * 16);
    list.forEach((s, i) => { Quaternion.FromEulerAnglesToRef(0, s.yaw, 0, q); sc.set(s.w, s.h, 1); tr.set(s.x, s.y, s.z); Matrix.ComposeToRef(sc, q, tr, M); M.copyToArray(buf, i * 16); });
    // eigene Geometrie je Viertel: Thin-Instance-Puffer hängen an der Geometrie – geteilt würden alle Viertel dieselben Fenster zeichnen
    const m = new Mesh('fensterrahmen@' + k, scene); tpl.geometry!.copy('fr@' + k).applyToMesh(m); m.material = mat;
    m.thinInstanceSetBuffer('matrix', buf, 16, true); m.thinInstanceRefreshBoundingInfo(false);
    m.isPickable = false; m.receiveShadows = true; m.addLODLevel(dist, null);
    m.freezeWorldMatrix(); out.push(m);
  }
  tpl.setEnabled(false);
  return out;
}
