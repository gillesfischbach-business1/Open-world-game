import { Texture, VertexBuffer, PBRMaterial, type Scene, type Mesh } from '@babylonjs/core';

/**
 * Vorausberechnete Umgebungsverdeckung (tools/bake/bake_ao.py → data/ao.png):
 * - Boden (Gelände, Straßen, Gehwege): als Schattenkarte (Lightmap) über weltfeste zweite UV-Koordinaten.
 * - Hauswände: als Vertexfarbe – unten so dunkel wie der Boden davor, nach oben heller, dazu eine Fuge am Fuß.
 * Kostet im Spiel nur eine Texturabfrage; die Rechnung selbst passiert beim Bauen.
 */
interface Meta { x0: number; z0: number; res: number; w: number; h: number }
export class BakedAO {
  private constructor(private tex: Texture, private px: Uint8ClampedArray, private m: Meta) {}
  static async load(scene: Scene, base = './data/'): Promise<BakedAO> {
    const meta = (await (await fetch(base + 'ao.json')).json()) as Meta;
    const blob = await (await fetch(base + 'ao.png')).blob(), bmp = await createImageBitmap(blob);
    const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
    const g = c.getContext('2d', { willReadFrequently: true })!; g.drawImage(bmp, 0, 0);
    const px = g.getImageData(0, 0, c.width, c.height).data;
    const tex = new Texture(base + 'ao.png', scene, false, false, Texture.BILINEAR_SAMPLINGMODE); // Zeile 0 = Norden = v 0
    tex.wrapU = tex.wrapV = Texture.CLAMP_ADDRESSMODE; tex.coordinatesIndex = 1;
    return new BakedAO(tex, px, meta);
  }
  /** Sichtbarkeit des Himmels 0..1 an Weltposition (bilinear) */
  sample(x: number, z: number) {
    const { x0, z0, res, w, h } = this.m;
    const fx = Math.max(0, Math.min(w - 1.001, (x - x0) / res)), fz = Math.max(0, Math.min(h - 1.001, (z - z0) / res));
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, P = (a: number, b: number) => this.px[(b * w + a) * 4] / 255;
    return (P(i, j) * (1 - u) + P(i + 1, j) * u) * (1 - v) + (P(i, j + 1) * (1 - u) + P(i + 1, j + 1) * u) * v;
  }
  /** Boden: zweite UV aus Weltposition, Material bekommt die Karte als Verdeckung */
  applyGround(meshes: Mesh[]) {
    const { x0, z0, res, w, h } = this.m, W = res * (w - 1), H = res * (h - 1);
    for (const mesh of meshes) {
      const p = mesh.getVerticesData(VertexBuffer.PositionKind); if (!p) continue;
      const uv2 = new Float32Array(p.length / 3 * 2);
      for (let k = 0, n = p.length / 3; k < n; k++) { uv2[2 * k] = (p[3 * k] - x0) / W; uv2[2 * k + 1] = (p[3 * k + 2] - z0) / H; }
      mesh.setVerticesData(VertexBuffer.UV2Kind, uv2, false);
      const mat = mesh.material;
      if (mat instanceof PBRMaterial && !mat.lightmapTexture) { mat.lightmapTexture = this.tex; mat.useLightmapAsShadowmap = true; }
    }
  }
  /** Wände: Vertexfarbe aus dem Boden vor der Wand, nach oben aufhellend, Fuge am Fuß */
  applyWalls(meshes: Mesh[], height: (x: number, z: number) => number) {
    for (const mesh of meshes) {
      const p = mesh.getVerticesData(VertexBuffer.PositionKind), nrm = mesh.getVerticesData(VertexBuffer.NormalKind); if (!p || !nrm) continue;
      const n = p.length / 3, col = new Float32Array(n * 4);
      for (let k = 0; k < n; k++) {
        const x = p[3 * k], y = p[3 * k + 1], z = p[3 * k + 2], nx = nrm[3 * k], nz = nrm[3 * k + 2];
        const s = this.sample(x + nx * 1.6, z + nz * 1.6), up = Math.max(0, y - height(x, z));
        const lift = Math.min(1, up / 9);                       // nach 9 m frei
        const foot = 0.72 + 0.28 * Math.min(1, up / 1.4);         // Kontaktschatten am Fuß
        const c = (s + (1 - s) * lift) * foot;
        col.set([c, c, c, 1], 4 * k);
      }
      mesh.setVerticesData(VertexBuffer.ColorKind, col, false); mesh.useVertexColors = true;
    }
  }
}
