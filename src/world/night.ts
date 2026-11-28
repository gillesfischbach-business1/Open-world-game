import { DynamicTexture, Texture, VertexBuffer, PBRMaterial, Color3, type Scene, type Mesh, type AbstractMesh } from '@babylonjs/core';

/**
 * Abend und Nacht ohne echte Lichtquellen (die kosten auf Handys jedes Pixel):
 * - Lichtkegel der Straßenlaternen: einmal beim Laden in eine Bodentextur gemalt („Baking“ im Browser),
 *   als Leuchtfarbe auf Gelände, Straßen und Gehwegen – nachts eingeblendet.
 * - Fenster: jedes Fenster bekommt eine zufällige Stelle in einem kleinen Muster (an/aus, warm/kalt).
 * - Laternenköpfe leuchten, Himmel und Dunst werden dunkel.
 * Nutzt dieselben zweiten UV-Koordinaten wie die Schattenkarte (world/bake.ts).
 */
export interface GroundMap { x0: number; z0: number; res: number; w: number; h: number }

export class NightLights {
  private groundMats: PBRMaterial[] = []; private glassMat: PBRMaterial | null = null; private bulbMats: PBRMaterial[] = [];
  private sky: PBRMaterial | null = null; private last = -1;
  constructor(private scene: Scene, ground: Mesh[], glass: Mesh | null, lamps: Array<[number, number]>, map: GroundMap) {
    // 1) Lichtkegel auf den Boden malen
    const S = 2048, W = map.res * (map.w - 1), H = map.res * (map.h - 1), sx = S / W, sz = S / H;
    const tex = new DynamicTexture('laternenlicht', { width: S, height: S }, scene, true);
    const g = tex.getContext() as CanvasRenderingContext2D; g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
    g.globalCompositeOperation = 'lighter';
    for (const [x, z] of lamps) {
      const px = (x - map.x0) * sx, pz = (z - map.z0) * sz, r = 11 * sx;
      const gr = g.createRadialGradient(px, pz, 0, px, pz, r);
      gr.addColorStop(0, 'rgba(255,214,150,0.95)'); gr.addColorStop(0.35, 'rgba(255,190,120,0.45)'); gr.addColorStop(1, 'rgba(255,170,100,0)');
      g.fillStyle = gr; g.fillRect(px - r, pz - r, 2 * r, 2 * r);
    }
    tex.update(false); tex.coordinatesIndex = 1; tex.wrapU = tex.wrapV = Texture.CLAMP_ADDRESSMODE;
    for (const m of ground) {
      const mat = m.material; if (!(mat instanceof PBRMaterial) || !m.getVerticesData(VertexBuffer.UV2Kind)) continue;
      mat.emissiveTexture = tex; mat.emissiveColor = Color3.Black(); this.groundMats.push(mat);
    }
    // 2) Fenster: je Fenster (4 Ecken) eine feste Zufallsstelle im Muster
    if (glass?.material instanceof PBRMaterial) {
      const n = glass.getTotalVertices(), uv2 = new Float32Array(n * 2);
      for (let v = 0; v < n; v++) { const id = Math.floor(v / 4), h = Math.sin(id * 12.9898) * 43758.5453; const f = h - Math.floor(h), f2 = (f * 7.13) % 1; uv2[2 * v] = f; uv2[2 * v + 1] = f2; }
      glass.setVerticesData(VertexBuffer.UV2Kind, uv2, false);
      const P = 64, pat = new DynamicTexture('fensterlicht', { width: P, height: P }, scene, false, Texture.NEAREST_SAMPLINGMODE);
      const c = pat.getContext() as CanvasRenderingContext2D; let seed = 5;
      const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      for (let y = 0; y < P; y++) for (let x = 0; x < P; x++) {
        const on = rnd() < 0.38, warm = rnd() < 0.8, b = 0.55 + rnd() * 0.45;
        c.fillStyle = !on ? '#000' : warm ? `rgb(${255 * b | 0},${190 * b | 0},${110 * b | 0})` : `rgb(${170 * b | 0},${200 * b | 0},${255 * b | 0})`;
        c.fillRect(x, y, 1, 1);
      }
      pat.update(false); pat.coordinatesIndex = 1;
      this.glassMat = glass.material; this.glassMat.emissiveTexture = pat; this.glassMat.emissiveColor = Color3.Black();
    }
    // 3) Laternenköpfe und Himmel
    for (const mat of scene.materials) if (mat instanceof PBRMaterial && /bulb|glass/i.test(mat.name) && /street_lamp/.test(mat.name)) this.bulbMats.push(mat);
    const skyMesh = scene.getMeshByName('hdrSkyBox') as AbstractMesh | null;
    if (skyMesh?.material instanceof PBRMaterial) this.sky = skyMesh.material;
  }

  /** Stärke 0 (Tag) … 1 (Nacht) aus der Stunde – dieselbe Sonnenbahn wie Environment.setHour */
  static darkness(h: number) { const el = Math.sin((h - 6.3) / 13.6 * Math.PI) * 0.9; return Math.max(0, Math.min(1, 1 - (el + 0.04) / 0.22)); }

  update(hour: number) {
    const n = NightLights.darkness(hour); if (Math.abs(n - this.last) < 0.01) return; this.last = n;
    const pool = n * 1.25; for (const m of this.groundMats) m.emissiveColor.set(pool, pool, pool);
    if (this.glassMat) this.glassMat.emissiveColor.set(n * 1.6, n * 1.6, n * 1.6);
    for (const m of this.bulbMats) m.emissiveColor.set(n * 4, n * 3.2, n * 2);
    if (this.sky) this.sky.environmentIntensity = 1 - n * 0.93;
    const f = 1 - n * 0.85; this.scene.fogColor.set(0.72 * f, 0.78 * f, 0.86 * f + n * 0.04);
    const hemi = this.scene.getLightByName('himmelslicht'); if (hemi) hemi.intensity = 0.45 * (1 - n * 0.82); // Umgebungslicht nachts schwach (Mondlicht)
  }
}
