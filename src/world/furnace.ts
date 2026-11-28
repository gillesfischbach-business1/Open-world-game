import { Mesh, MeshBuilder, Vector3, VertexBuffer, PhysicsAggregate, PhysicsShapeType, PBRMaterial, Color3, type Scene, type Material } from '@babylonjs/core';

/**
 * Hochöfen von Belval (Haut fourneau A und B): statt eines 80-m-Klotzes über dem ganzen Grundriss eine Anlage
 * aus Ofenschacht, Stahlgerüst mit Bühnen, Gasleitungen, Staubsack, drei Winderhitzern (Cowper), Schornstein,
 * Gießhalle und Schrägaufzug. Maße an den echten Anlagen orientiert (Schacht ~55 m, Gasabzug bis ~80 m).
 * Alles aus Grundformen, je Material zu einem Mesh zusammengefügt (wenige Zeichenaufrufe).
 */
export const isFurnace = (name: string) => /^Haut fourneau [AB]$/i.test(name || '');

/** UV in Metern umrechnen, damit die Rost-Textur (Kachel in Metern) nicht gestreckt wird */
function meters(m: Mesh, su: number, sv: number) {
  const uv = m.getVerticesData(VertexBuffer.UVKind); if (!uv) return m;
  for (let i = 0; i < uv.length; i += 2) { uv[i] *= su; uv[i + 1] *= sv; }
  m.setVerticesData(VertexBuffer.UVKind, uv); return m;
}

export function buildFurnace(scene: Scene, ring: number[], ground: number, rust: Material, quality: number): Mesh[] {
  const T = quality >= 2 ? 28 : 14, rustP: Mesh[] = [], steelP: Mesh[] = [];
  // Mitte und Hauptrichtung des Grundrisses
  let cx = 0, cz = 0; const n = ring.length / 2; for (let i = 0; i < n; i++) { cx += ring[2 * i]; cz += ring[2 * i + 1]; } cx /= n; cz /= n;
  let best = 0, ang = 0; for (let i = 0; i < n; i++) { const dx = ring[(2 * i + 2) % ring.length] - ring[2 * i], dz = ring[(2 * i + 3) % ring.length] - ring[2 * i + 1], L = Math.hypot(dx, dz); if (L > best) { best = L; ang = Math.atan2(dz, dx); } }
  const ux = Math.cos(ang), uz = Math.sin(ang), vx = -uz, vz = ux; // Längs- und Querachse
  const P = (a: number, b: number, y = 0) => new Vector3(cx + ux * a + vx * b, ground + y, cz + uz * a + vz * b);
  const put = (m: Mesh, list: Mesh[], p: Vector3, rotY = 0) => { m.position.copyFrom(p); m.rotation.y = rotY; list.push(m); return m; };
  const box = (w: number, h: number, d: number, p: Vector3, list = steelP, rot = -ang) => put(meters(MeshBuilder.CreateBox('b', { width: w, height: h, depth: d }, scene), Math.max(w, d), h), list, p.add(new Vector3(0, h / 2, 0)), rot);
  const cyl = (r0: number, r1: number, h: number, p: Vector3, list = rustP) => put(meters(MeshBuilder.CreateCylinder('c', { diameterBottom: 2 * r0, diameterTop: 2 * r1, height: h, tessellation: T }, scene), 2 * Math.PI * r0, h), list, p.add(new Vector3(0, h / 2, 0)));

  // Gießhalle (Sockel) und Ofenschacht mit Bauch
  box(34, 12, 24, P(0, 0), rustP);
  const prof = [[0, 7.5], [8, 7.8], [16, 8.6], [26, 8.2], [40, 6.4], [50, 5.2], [55, 4.2], [57, 2.5]].map(([y, r]) => new Vector3(r, y, 0));
  put(meters(MeshBuilder.CreateLathe('schacht', { shape: prof, tessellation: T, closed: true }, scene), 50, 57), rustP, P(0, 0, 12));
  // Stahlgerüst um den Schacht: Eckstützen und Bühnen alle 10 m
  for (const [a, b] of [[-11, -11], [11, -11], [11, 11], [-11, 11]]) box(1, 66, 1, P(a, b, 12));
  for (let y = 22; y <= 72; y += 10) { box(23, 0.5, 1.2, P(0, -11, y)); box(23, 0.5, 1.2, P(0, 11, y)); box(1.2, 0.5, 23, P(-11, 0, y)); box(1.2, 0.5, 23, P(11, 0, y)); }
  // Gasabzüge: vier Rohre nach oben, Querrohr, Fallrohr zum Staubsack
  for (const [a, b] of [[-3, -3], [3, -3], [3, 3], [-3, 3]]) cyl(1, 1, 16, P(a, b, 66), steelP);
  const top = P(0, 0, 82), dust = P(0, -30, 0);
  const down = MeshBuilder.CreateTube('fallrohr', { path: [top, P(0, -8, 84), P(0, -26, 52), dust.add(new Vector3(0, 30, 0))], radius: 1.5, tessellation: T >> 1 }, scene);
  steelP.push(meters(down, 9, 60));
  // Staubsack: Zylinder mit Kegel auf Stützen
  for (const [a, b] of [[-4, -4], [4, -4], [4, 4], [-4, 4]]) box(0.8, 14, 0.8, P(a, -30 + b, 0));
  cyl(1.2, 5.5, 6, P(0, -30, 12)); cyl(5.5, 5.5, 12, P(0, -30, 18)); cyl(5.5, 1.5, 4, P(0, -30, 30));
  // drei Winderhitzer (Cowper) mit Kuppel + Heißwindleitung
  for (let k = -1; k <= 1; k++) {
    const base = P(k * 12, 30, 0); cyl(4.6, 4.6, 36, base);
    put(meters(MeshBuilder.CreateSphere('kuppel', { diameter: 9.2, segments: T >> 1, slice: 0.5 }, scene), 29, 7), rustP, base.add(new Vector3(0, 36, 0)));
  }
  steelP.push(meters(MeshBuilder.CreateTube('heisswind', { path: [P(-16, 24, 20), P(16, 24, 20), P(16, 12, 20)], radius: 1.1, tessellation: T >> 1 }, scene), 7, 40));
  // Schornstein
  cyl(2.6, 1.7, 75, P(26, 30, 0));
  // Schrägaufzug (Fachwerk-Kastenträger) vom Boden bis zur Gicht
  const s0 = P(-62, 4, 0), s1 = P(-6, 0, 60), len = Vector3.Distance(s0, s1), mid = Vector3.Center(s0, s1);
  const sk = meters(MeshBuilder.CreateBox('schraegaufzug', { width: len, height: 2.4, depth: 3.2 }, scene), len, 3);
  sk.position.copyFrom(mid); sk.rotation.y = -ang; sk.rotation.z = Math.atan2(s1.y - s0.y, Math.hypot(s1.x - s0.x, s1.z - s0.z)); steelP.push(sk);
  for (let f = 0.2; f < 0.95; f += 0.25) { const q = Vector3.Lerp(s0, s1, f); box(0.9, q.y - ground, 0.9, new Vector3(q.x, ground, q.z)); }

  // eigener, dunklerer Rost (echte Öfen: dunkles Rotbraun bis Schwarz) – Textur vom gemeinsamen Rost-Material
  const rustD = (rust as PBRMaterial).clone('rost_hochofen'); rustD.albedoColor = new Color3(0.42, 0.27, 0.2); rustD.roughness = 0.8; rust = rustD;
  const steel = new PBRMaterial('stahl_dunkel', scene); steel.albedoColor = new Color3(0.16, 0.14, 0.13); steel.metallic = 0.7; steel.roughness = 0.55;
  const out: Mesh[] = [];
  for (const [parts, mat, name] of [[rustP, rust, 'hochofen_rost'], [steelP, steel, 'hochofen_stahl']] as const) {
    const m = Mesh.MergeMeshes(parts as Mesh[], true, true); if (!m) continue;
    m.name = name; m.material = mat; m.receiveShadows = true; m.isPickable = false;
    new PhysicsAggregate(m, PhysicsShapeType.MESH, { mass: 0 }, scene); out.push(m);
  }
  return out;
}
