import { PhysicsAggregate, PhysicsShapeType, type Mesh, type Scene } from '@babylonjs/core';
import { GeoBuilder } from './geo';
import type { WorldData } from './data';
import type { Materials } from './materials';

/** Gelände als Höhenfeld (8-m-Raster) mit Gras-Material und Physik-Kollision. */
export function buildTerrain(w: WorldData, scene: Scene, mats: Materials): Mesh {
  const T = w.terrain, g = new GeoBuilder(), ofs = T.ofs || 0;
  for (let j = 0; j < T.nz; j++) for (let i = 0; i < T.nx; i++) {
    const x = T.x0 + i * T.step, z = T.z0 + j * T.step;
    g.vert(x, T.h[j * T.nx + i] + ofs - 0.05, z, 0, 1, 0, x, z);
  }
  for (let j = 0; j < T.nz - 1; j++) for (let i = 0; i < T.nx - 1; i++) {
    const a = j * T.nx + i, b = a + 1, c = a + T.nx, d = c + 1;
    g.tri(a, c, b); g.tri(b, c, d);
  }
  const m = g.build('gelaende', scene, mats.get('grass'), { normals: true })!;
  m.receiveShadows = true;
  new PhysicsAggregate(m, PhysicsShapeType.MESH, { mass: 0, friction: 0.8 }, scene);
  return m;
}
