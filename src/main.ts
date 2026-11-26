import { Scene, Vector3, HavokPlugin, type AbstractMesh } from '@babylonjs/core';
import HavokPhysics from '@babylonjs/havok';
import havokWasm from '@babylonjs/havok/lib/esm/HavokPhysics.wasm?url';
import { createEngine, pickQuality } from './core/engine';
import { Input } from './core/input';
import { loadWorld, makeHeight } from './world/data';
import { Materials } from './world/materials';
import { buildTerrain } from './world/terrain';
import { buildRoads, buildBuildings } from './world/city';
import { buildProps } from './world/props';
import { Environment } from './world/environment';
import { Player } from './player/player';
import { Hud } from './ui/hud';

const $ = (id: string) => document.getElementById(id)!;
const setLoad = (f: number, t?: string) => { ($('ldbar') as HTMLElement).style.width = Math.round(f * 100) + '%'; if (t) $('ldtxt').textContent = t; };
const tick = () => new Promise(r => setTimeout(r, 0));

async function main() {
  const canvas = $('game') as HTMLCanvasElement, quality = pickQuality();
  setLoad(0.02, 'Grafik starten…');
  const { engine, backend } = await createEngine(canvas, quality);
  engine.setHardwareScalingLevel(quality === 'high' ? 1 / Math.min(devicePixelRatio, 2) : quality === 'mid' ? 1 / Math.min(devicePixelRatio, 1.5) : 1);
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true; // Kartendaten: x = Osten, z = Süden, y = oben
  setLoad(0.06, 'Physik laden…');
  const hk = await HavokPhysics({ locateFile: () => havokWasm });
  scene.enablePhysics(new Vector3(0, -9.81, 0), new HavokPlugin(true, hk));

  setLoad(0.1, 'Kaart vu Belval…');
  const world = await loadWorld(f => setLoad(0.1 + f * 0.3));
  const height = makeHeight(world), mats = new Materials(scene);
  setLoad(0.42, 'Gelände'); await tick();
  const terrain = buildTerrain(world, scene, mats);
  setLoad(0.5, 'Stroossen'); await tick();
  const roads = buildRoads(world, scene, mats, height);
  setLoad(0.6, 'Gebaier'); await tick();
  const buildings = buildBuildings(world, scene, mats, height);
  const colliders = (m: AbstractMesh) => buildings.includes(m as never);

  const input = new Input(canvas, $('hud'));
  const start = new Vector3(4, height(4, 16) + 1.5, 16);
  const player = new Player(scene, start, colliders);
  const env = new Environment(scene, player.camera, quality);
  setLoad(0.72, 'Stroosseluuchten a Bänken'); await tick();
  const props = await buildProps(world, scene, height);
  setLoad(0.85, 'Blëtz'); await tick();
  const heroMeshes = await player.load();
  env.addCasters([...buildings, ...props, ...heroMeshes]);
  for (const m of [terrain, ...roads, ...buildings]) m.receiveShadows = true;
  const hud = new Hud($('hud'), backend, quality);

  setLoad(1, 'Fäerdeg');
  $('loading').classList.add('out'); setTimeout(() => $('loading').remove(), 900);
  env.setHour(env.hour);
  let t = 0;
  scene.onBeforeRenderObservable.add(() => {
    const dt = Math.min(engine.getDeltaTime() / 1000, 1 / 20);
    input.update();
    t += dt;
    env.setHour((env.hour + dt / 120) % 24); // 1 Spielstunde = 2 Minuten
    hud.update(dt, env.hour, engine.getFps(), player.position);
    input.endFrame();
  });
  scene.onAfterPhysicsObservable.add(() => { const dt = Math.min(engine.getDeltaTime() / 1000, 1 / 20); player.update(dt, input); });
  engine.runRenderLoop(() => scene.render());
  addEventListener('resize', () => engine.resize());
  (window as unknown as { __letz: unknown }).__letz = { scene, player, env, engine, backend, world };
}
main().catch(e => { console.error(e); $('ldtxt').textContent = 'Fehler: ' + (e?.message || e); });
