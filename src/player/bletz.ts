import {
  MeshBuilder, PBRMaterial, StandardMaterial, Color3, Vector3, Quaternion, TransformNode, PointLight,
  type Scene, type Mesh,
} from '@babylonjs/core';
import earcut from 'earcut';

/**
 * Blëtz – eigenes Modell: kleiner goldener Löwe mit elektrischer Mähne und einer
 * leuchtenden Glühbirne an der Schwanzspitze. Aus Grundformen gebaut (keine Datei nötig),
 * mit eigener Bewegung: gehen, rennen, springen, atmen, Mähne knistert.
 * Maße in Metern, Füße auf y = 0, Blick nach +z.
 */
export class Bletz {
  root: TransformNode; meshes: Mesh[] = [];
  private body: TransformNode; private head: TransformNode; private legs: TransformNode[] = []; private tail: TransformNode[] = [];
  private maneMat: PBRMaterial; private bulbMat: StandardMaterial; private light: PointLight | null = null;
  private phase = 0; private t = 0; private flashT = 0; private air = 0;

  constructor(private scene: Scene, withLight: boolean) {
    const fur = this.pbr('fell', new Color3(0.78, 0.42, 0.1), 0.8);
    const cream = this.pbr('fell_hell', new Color3(0.95, 0.8, 0.55), 0.85);
    const dark = this.pbr('dunkel', new Color3(0.1, 0.07, 0.05), 0.4);
    const white = this.pbr('augen', new Color3(0.97, 0.97, 0.95), 0.2);
    const paw = this.pbr('pfote', new Color3(0.45, 0.24, 0.07), 0.9);
    this.maneMat = this.pbr('maehne', new Color3(1, 0.72, 0.05), 0.45); this.maneMat.emissiveColor = new Color3(1, 0.5, 0.02);
    this.bulbMat = new StandardMaterial('gluehbirne', scene); this.bulbMat.disableLighting = true; this.bulbMat.emissiveColor = new Color3(1, 0.96, 0.7);
    const eyeGlow = new StandardMaterial('augenglanz', scene); eyeGlow.disableLighting = true; eyeGlow.emissiveColor = new Color3(0.5, 0.9, 1);

    this.root = new TransformNode('bletz', scene);
    this.body = this.node('rumpf', this.root, 0, 0, 0);
    // Rumpf, Bauch, Brust
    this.sphere('rumpf_m', this.body, fur, [0, 0.62, 0], [0.5, 0.46, 0.95]);
    this.sphere('bauch', this.body, cream, [0, 0.55, 0.02], [0.4, 0.34, 0.8]);
    this.sphere('brust', this.body, cream, [0, 0.7, 0.36], [0.3, 0.32, 0.22]);
    // Blitz-Zeichen auf beiden Flanken (leuchtend)
    const boltMat = new StandardMaterial('blitzzeichen', scene); boltMat.disableLighting = true; boltMat.emissiveColor = new Color3(1, 0.92, 0.35); boltMat.backFaceCulling = false;
    const bolt = [[0.03, 0.17], [0.1, 0.17], [0.03, 0.02], [0.1, 0.02], [-0.07, -0.19], [-0.01, -0.04], [-0.08, -0.04]];
    for (const sgn of [1, -1]) {
      const m = MeshBuilder.CreatePolygon('blitzzeichen', { shape: bolt.map(([u, v]) => new Vector3(-v * sgn, 0, u)), sideOrientation: 2 }, scene, earcut);
      m.parent = this.body; m.material = boltMat; m.rotation.z = -sgn * Math.PI / 2; m.position.set(sgn * 0.252, 0.64, -0.02); m.scaling.setAll(0.9); this.meshes.push(m);
    }
    // Beine (Drehpunkt an der Hüfte): vorne links/rechts, hinten links/rechts
    for (const [x, z] of [[0.15, 0.3], [-0.15, 0.3], [0.15, -0.3], [-0.15, -0.3]]) {
      const hip = this.node('huefte', this.body, x, 0.55, z);
      const leg = MeshBuilder.CreateCapsule('bein', { height: 0.52, radius: 0.075, tessellation: 10, capSubdivisions: 3 }, scene);
      leg.parent = hip; leg.position.y = -0.24; leg.material = fur; this.meshes.push(leg);
      this.sphere('pfote', hip, paw, [0, -0.5, 0.03], [0.17, 0.09, 0.22]);
      this.legs.push(hip);
    }
    // Kopf
    this.head = this.node('kopf', this.body, 0, 0.9, 0.5);
    this.sphere('kopf_m', this.head, fur, [0, 0, 0], [0.42, 0.4, 0.4]);
    this.sphere('schnauze', this.head, cream, [0, -0.07, 0.17], [0.22, 0.15, 0.18]);
    this.sphere('kinn', this.head, cream, [0, -0.14, 0.12], [0.14, 0.08, 0.1]);
    this.sphere('nase', this.head, dark, [0, -0.02, 0.26], [0.08, 0.055, 0.05]);
    for (const s of [1, -1]) {
      this.sphere('auge', this.head, white, [0.085 * s, 0.05, 0.165], [0.085, 0.095, 0.05]);
      this.sphere('pupille', this.head, dark, [0.088 * s, 0.045, 0.19], [0.05, 0.065, 0.02]);
      this.sphere('glanz', this.head, eyeGlow, [0.075 * s, 0.07, 0.2], [0.018, 0.018, 0.01]);
      this.sphere('ohr', this.head, fur, [0.14 * s, 0.17, -0.02], [0.11, 0.11, 0.05]);
      this.sphere('ohr_innen', this.head, cream, [0.14 * s, 0.165, 0.0], [0.06, 0.06, 0.02]);
    }
    // Mähne: zwei Kränze aus Zacken, wie Blitze nach außen
    for (let ring = 0; ring < 2; ring++) {
      const n = ring ? 13 : 16, r0 = ring ? 0.2 : 0.17, len = ring ? 0.2 : 0.26;
      for (let i = 0; i < n; i++) {
        const a = (i + ring * 0.5) / n * Math.PI * 2, dir = new Vector3(Math.cos(a), Math.sin(a), ring ? -0.15 : -0.55).normalize();
        const cone = MeshBuilder.CreateCylinder('maehne', { height: len, diameterTop: 0, diameterBottom: ring ? 0.1 : 0.13, tessellation: 5 }, scene);
        cone.parent = this.head; cone.material = this.maneMat; this.meshes.push(cone);
        cone.position.set(dir.x * r0, dir.y * r0 + 0.01, -0.06 + dir.z * r0 * 0.4).addInPlace(dir.scale(len / 2));
        const q = new Quaternion(); Quaternion.FromUnitVectorsToRef(Vector3.Up(), dir, q); cone.rotationQuaternion = q;
      }
    }
    // Schwanz: drei Glieder, nach oben geschwungen, Glühbirne an der Spitze
    let parent: TransformNode = this.node('schwanz', this.body, 0, 0.66, -0.44);
    for (let i = 0; i < 3; i++) {
      const seg = MeshBuilder.CreateCylinder('schwanzglied', { height: 0.2, diameter: 0.055 - i * 0.008, tessellation: 8 }, scene);
      seg.parent = parent; seg.position.y = 0.1; seg.material = fur; this.meshes.push(seg);
      parent.rotation.x = i === 0 ? -2.2 : 0.6; this.tail.push(parent);
      parent = this.node('schwanzgelenk', parent, 0, 0.2, 0);
    }
    this.sphere('quaste', parent, this.maneMat, [0, 0.02, 0], [0.1, 0.1, 0.1]);
    this.sphere('birne', parent, this.bulbMat, [0, 0.11, 0], [0.13, 0.15, 0.13]);
    this.sphere('fassung', parent, dark, [0, 0.04, 0], [0.07, 0.05, 0.07]);
    if (withLight) {
      this.light = new PointLight('birnenlicht', Vector3.Zero(), scene); this.light.parent = parent; this.light.position.y = 0.12;
      this.light.diffuse = new Color3(1, 0.9, 0.6); this.light.range = 5; this.light.intensity = 0.8;
    }
    for (const m of this.meshes) { m.isPickable = false; m.receiveShadows = true; }
  }

  private pbr(name: string, c: Color3, rough: number) { const m = new PBRMaterial(name, this.scene); m.albedoColor = c; m.roughness = rough; m.metallic = 0; return m; }
  private node(name: string, parent: TransformNode, x: number, y: number, z: number) { const n = new TransformNode(name, this.scene); n.parent = parent; n.position.set(x, y, z); return n; }
  private sphere(name: string, parent: TransformNode, mat: PBRMaterial | StandardMaterial, p: number[], s: number[]) {
    const m = MeshBuilder.CreateSphere(name, { diameter: 1, segments: 12 }, this.scene);
    m.parent = parent; m.position.set(p[0], p[1], p[2]); m.scaling.set(s[0], s[1], s[2]); m.material = mat; this.meshes.push(m); return m;
  }

  /** Blitz-Aufladung sichtbar machen (z. B. beim ZAP) */
  flash() { this.flashT = 0.6; }

  /** Bewegung pro Bild: speed in m/s, grounded = steht auf dem Boden */
  animate(dt: number, speed: number, grounded: boolean) {
    this.t += dt; this.flashT = Math.max(0, this.flashT - dt);
    this.air += ((grounded ? 0 : 1) - this.air) * Math.min(1, dt * 10);
    const move = Math.min(1, speed / 1.5), run = Math.max(0, Math.min(1, (speed - 4.5) / 3));
    this.phase += dt * (speed * 2.6 + 0.001);
    const amp = (0.55 + run * 0.35) * move * (1 - this.air), s = Math.sin(this.phase);
    // Diagonalgang (vorne links + hinten rechts zusammen), beim Rennen Galopp-ähnlich
    const sw = [s, -s, run > 0.5 ? s : -s, run > 0.5 ? -s : s];
    this.legs.forEach((l, i) => { const tuck = this.air * (i < 2 ? -0.7 : 0.8); l.rotation.x = sw[i] * amp + tuck; });
    // Körper wippt, beim Rennen nach vorn geneigt; im Stand atmet er
    const breathe = Math.sin(this.t * 2.2) * 0.012 * (1 - move);
    this.body.position.y = Math.abs(Math.cos(this.phase)) * 0.045 * move + breathe;
    this.body.rotation.x = run * 0.12 - this.air * 0.15 + Math.sin(this.phase * 2) * 0.03 * move;
    this.head.rotation.x = -run * 0.1 + Math.sin(this.phase * 2) * 0.04 * move + Math.sin(this.t * 0.7) * 0.03 * (1 - move);
    this.head.rotation.y = Math.sin(this.t * 0.45) * 0.25 * (1 - move);
    // Schwanz schwingt
    this.tail[0].rotation.z = Math.sin(this.t * 2.4 + this.phase * 0.5) * (0.25 + 0.2 * move);
    this.tail[1].rotation.x = 0.6 + Math.sin(this.t * 3.1) * 0.15; this.tail[2].rotation.x = 0.6 + Math.sin(this.t * 3.7 + 1) * 0.2 - run * 0.3;
    // Mähne knistert (flackerndes Leuchten), Glühbirne pulsiert
    const crackle = 0.45 + 0.25 * Math.sin(this.t * 13) * Math.sin(this.t * 7.3) + (Math.random() < 0.04 ? 0.5 : 0) + this.flashT * 2.5;
    this.maneMat.emissiveIntensity = crackle;
    const glow = 0.85 + 0.15 * Math.sin(this.t * 3) + this.flashT * 1.5; this.bulbMat.emissiveColor.set(glow, glow * 0.96, glow * 0.7);
    if (this.light) this.light.intensity = 0.6 + this.flashT * 4;
  }
  setEnabled(v: boolean) { this.root.setEnabled(v); if (this.light) this.light.setEnabled(v); }
}
