import { MeshBuilder, StandardMaterial, Color3, PointLight, Vector3, type Scene, type Mesh } from '@babylonjs/core';

/** Blitz von Blëtz zum Ziel: gezackter, leuchtender Strahl + kurzer Lichtblitz. */
export class Zap {
  private mat: StandardMaterial; private light: PointLight; private bolts: Array<{ m: Mesh; t: number; a: Vector3; b: Vector3 }> = [];
  constructor(private scene: Scene) {
    this.mat = new StandardMaterial('blitz', scene); this.mat.disableLighting = true; this.mat.emissiveColor = new Color3(0.75, 0.9, 1); this.mat.alpha = 0.95;
    this.light = new PointLight('blitzlicht', new Vector3(), scene); this.light.diffuse = new Color3(0.6, 0.8, 1); this.light.intensity = 0; this.light.range = 18;
  }
  private path(a: Vector3, b: Vector3) {
    const pts: Vector3[] = [], n = 9;
    for (let i = 0; i <= n; i++) { const f = i / n, j = i === 0 || i === n ? 0 : 0.35; pts.push(Vector3.Lerp(a, b, f).add(new Vector3((Math.random() - 0.5) * j, (Math.random() - 0.5) * j, (Math.random() - 0.5) * j))); }
    return pts;
  }
  fire(a: Vector3, b: Vector3) {
    for (let k = 0; k < 2; k++) {
      const m = MeshBuilder.CreateTube('blitzstrahl', { path: this.path(a, b), radius: k ? 0.025 : 0.05, tessellation: 4, updatable: false }, this.scene);
      m.material = this.mat; m.isPickable = false; this.bolts.push({ m, t: 0.28, a, b });
    }
    this.light.position.copyFrom(b); this.light.intensity = 6;
  }
  update(dt: number) {
    for (const b of this.bolts) { b.t -= dt; b.m.visibility = Math.max(0, b.t / 0.28) * (Math.random() < 0.3 ? 0.4 : 1); }
    for (const b of this.bolts.filter(b => b.t <= 0)) b.m.dispose();
    this.bolts = this.bolts.filter(b => b.t > 0);
    this.light.intensity = Math.max(0, this.light.intensity - dt * 30);
  }
}
