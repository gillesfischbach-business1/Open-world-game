import { Engine, WebGPUEngine, type AbstractEngine } from '@babylonjs/core';

export type Quality = 'low' | 'mid' | 'high';

/** Grafikstufe: aus dem Link (?q=low|mid|high), sonst geschätzt nach Gerät */
export function pickQuality(): Quality {
  const q = new URLSearchParams(location.search).get('q');
  if (q === 'low' || q === 'mid' || q === 'high') return q;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  const small = Math.min(screen.width, screen.height) < 500;
  return mem <= 3 ? 'low' : small ? 'mid' : 'high';
}

/**
 * Startet die Grafik: WebGPU, wenn der Browser es kann (schneller, moderner),
 * sonst automatisch WebGL2. Mit ?webgl im Link lässt sich WebGL2 erzwingen.
 */
export async function createEngine(canvas: HTMLCanvasElement, quality: Quality): Promise<{ engine: AbstractEngine; backend: string }> {
  const forceGL = new URLSearchParams(location.search).has('webgl');
  if (!forceGL && (await WebGPUEngine.IsSupportedAsync)) {
    try {
      const engine = new WebGPUEngine(canvas, { antialias: true, adaptToDeviceRatio: quality !== 'low', powerPreference: 'high-performance' });
      await engine.initAsync();
      return { engine, backend: 'WebGPU' };
    } catch (e) {
      console.warn('WebGPU nicht verfügbar, nehme WebGL2', e);
    }
  }
  const engine = new Engine(canvas, quality !== 'low', { stencil: true, powerPreference: 'high-performance' }, quality !== 'low');
  return { engine, backend: 'WebGL2' };
}
