import { PBRMaterial, Texture, Color3, type Scene } from '@babylonjs/core';

/**
 * Physikalisch basierte Materialien aus CC0-Texturen (Poly Haven).
 * UV-Koordinaten der Geometrie sind in Metern; `size` = wie viele Meter eine Textur-Kachel abdeckt.
 */
export interface MatDef { tex: string; size: number; tint?: Color3; rough?: number; metal?: number; bump?: number }
const DEFS: Record<string, MatDef> = {
  asphalt: { tex: 'asphalt_02', size: 6, rough: 0.9 },
  paving: { tex: 'rectangular_paving', size: 3, rough: 0.85 },
  grass: { tex: 'leafy_grass', size: 5, rough: 1 },
  plaster: { tex: 'grey_plaster', size: 4, rough: 0.9 },
  concrete: { tex: 'concrete_block_wall', size: 4, rough: 0.9 },
  facade: { tex: 'rectangular_facade_tiles', size: 3, rough: 0.6 },
  brick: { tex: 'red_brick_03', size: 3, rough: 0.9 },
  rust: { tex: 'rusty_metal_02', size: 4, rough: 0.7, metal: 0.4 },
};

export class Materials {
  private cache = new Map<string, PBRMaterial>();
  constructor(private scene: Scene, private texSize = 1) {}
  get(key: keyof typeof DEFS | string, variant?: { tint?: Color3; name?: string }): PBRMaterial {
    const id = key + (variant?.name || '');
    const hit = this.cache.get(id); if (hit) return hit;
    const d = DEFS[key]; const m = new PBRMaterial(id, this.scene);
    const t = (s: string) => { const tx = new Texture(`./assets/tex/${d.tex}_${s}.jpg`, this.scene, false, true, Texture.TRILINEAR_SAMPLINGMODE); tx.uScale = tx.vScale = 1 / d.size; tx.anisotropicFilteringLevel = 8; return tx; };
    m.albedoTexture = t('diff');
    m.bumpTexture = t('nor'); m.invertNormalMapY = true; m.bumpTexture.level = d.bump ?? 1;
    m.metallicTexture = null; m.metallic = d.metal ?? 0; m.roughness = d.rough ?? 0.9;
    m.useRoughnessFromMetallicTextureAlpha = false;
    if (variant?.tint) m.albedoColor = variant.tint;
    m.environmentIntensity = 0.9;
    this.cache.set(id, m); return m;
  }
}
