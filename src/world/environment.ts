import {
  HDRCubeTexture, DirectionalLight, HemisphericLight, Vector3, Color3, Color4, CascadedShadowGenerator,
  DefaultRenderingPipeline, SSAO2RenderingPipeline, ImageProcessingConfiguration, Scene, type Camera, type AbstractMesh,
} from '@babylonjs/core';
import type { Quality } from '../core/engine';

/**
 * Licht & Stimmung: echter Himmel (HDR-Panorama, CC0 Poly Haven) als Umgebungslicht und Spiegelung,
 * Sonne mit kaskadierten Schatten, Nachbearbeitung (Leuchten, Kantenglättung, Umgebungsverdeckung, Farbstimmung).
 */
export class Environment {
  sun: DirectionalLight; shadows: CascadedShadowGenerator | null = null; pipeline: DefaultRenderingPipeline;
  hour = 10.5;
  constructor(private scene: Scene, camera: Camera, quality: Quality) {
    const hdr = new HDRCubeTexture(quality === 'low' ? './assets/hdri/sky_1k.hdr' : './assets/hdri/sky_2k.hdr', scene, quality === 'low' ? 128 : 256, false, true, false, true);
    scene.environmentTexture = hdr; scene.environmentIntensity = 0.9;
    const sky = scene.createDefaultSkybox(hdr, true, 6000, 0, false); if (sky) sky.infiniteDistance = true;
    scene.clearColor = new Color4(0.6, 0.7, 0.85, 1);
    const hemi = new HemisphericLight('himmelslicht', new Vector3(0, 1, 0), scene); hemi.intensity = 0.45; hemi.groundColor = new Color3(0.25, 0.22, 0.2);
    this.sun = new DirectionalLight('sonne', new Vector3(-0.5, -0.8, 0.35).normalize(), scene);
    this.sun.intensity = 3.2; this.sun.diffuse = new Color3(1, 0.95, 0.86);
    if (quality !== 'low') {
      const csm = new CascadedShadowGenerator(quality === 'high' ? 2048 : 1024, this.sun);
      csm.numCascades = quality === 'high' ? 4 : 3; csm.lambda = 0.85; csm.shadowMaxZ = quality === 'high' ? 260 : 160;
      csm.autoCalcDepthBounds = false; csm.stabilizeCascades = true; csm.usePercentageCloserFiltering = true; csm.filteringQuality = CascadedShadowGenerator.QUALITY_MEDIUM;
      csm.bias = 0.004; csm.normalBias = 0.02;
      this.shadows = csm;
    }
    // Atmosphäre: leichter Dunst in der Ferne
    scene.fogMode = Scene.FOGMODE_EXP2; scene.fogDensity = 0.0016; scene.fogColor = new Color3(0.72, 0.78, 0.86);
    // Nachbearbeitung
    const p = this.pipeline = new DefaultRenderingPipeline('bild', true, scene, [camera]);
    p.samples = quality === 'high' ? 4 : 1; p.fxaaEnabled = quality !== 'high';
    p.bloomEnabled = quality !== 'low'; p.bloomThreshold = 0.85; p.bloomWeight = 0.35; p.bloomKernel = 48; p.bloomScale = 0.5;
    p.imageProcessingEnabled = true;
    const ip = p.imageProcessing; ip.toneMappingEnabled = true; ip.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
    ip.exposure = 1.05; ip.contrast = 1.12; ip.vignetteEnabled = true; ip.vignetteWeight = 1.4; ip.vignetteColor = new Color4(0, 0, 0, 0);
    ip.colorCurvesEnabled = true; ip.colorCurves!.globalSaturation = 12; ip.colorCurves!.highlightsHue = 35; ip.colorCurves!.highlightsDensity = 12; ip.colorCurves!.shadowsHue = 215; ip.colorCurves!.shadowsDensity = 10;
    p.sharpenEnabled = quality === 'high'; if (p.sharpenEnabled) p.sharpen.edgeAmount = 0.25;
    if (quality === 'high') {
      const ssao = new SSAO2RenderingPipeline('ao', scene, { ssaoRatio: 0.5, blurRatio: 0.5 }, [camera], true);
      ssao.radius = 1.2; ssao.totalStrength = 1.1; ssao.samples = 16; ssao.maxZ = 120;
    }
  }
  addCasters(meshes: AbstractMesh[]) { if (this.shadows) for (const m of meshes) this.shadows.addShadowCaster(m, true); }
  /** Sonne nach Tageszeit (Stunde 0–24) */
  setHour(h: number) {
    this.hour = h; const day = (h - 6.3) / 13.6, ang = day * Math.PI, el = Math.sin(ang) * 0.9;
    const dir = new Vector3(Math.cos(ang) * 0.8, -Math.max(0.08, el), 0.45).normalize();
    this.sun.direction = dir; this.sun.intensity = 3.4 * Math.max(0, Math.min(1, el * 2.5));
    const warm = 1 - Math.min(1, el * 2); this.sun.diffuse = new Color3(1, 0.95 - warm * 0.25, 0.86 - warm * 0.4);
    this.scene.environmentIntensity = 0.45 + 0.65 * Math.max(0, Math.min(1, el * 3));
  }
}
