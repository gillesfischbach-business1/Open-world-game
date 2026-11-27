import { Engine, WebGPUEngine, type AbstractEngine } from '@babylonjs/core';


/**
 * Startet die Grafik: WebGPU, wenn der Browser es kann (schneller, moderner),
 * sonst automatisch WebGL2. Mit ?webgl im Link lässt sich WebGL2 erzwingen.
 */
export async function createEngine(canvas: HTMLCanvasElement, antialias: boolean): Promise<{ engine: AbstractEngine; backend: string }> {
  const forceGL = new URLSearchParams(location.search).has('webgl');
  if (!forceGL && (await WebGPUEngine.IsSupportedAsync)) {
    try {
      const engine = new WebGPUEngine(canvas, { antialias, adaptToDeviceRatio: false, powerPreference: 'high-performance' });
      await engine.initAsync();
      return { engine, backend: 'WebGPU' };
    } catch (e) {
      console.warn('WebGPU nicht verfügbar, nehme WebGL2', e);
    }
  }
  const engine = new Engine(canvas, antialias, { stencil: true, powerPreference: 'high-performance' }, false);
  return { engine, backend: 'WebGL2' };
}
