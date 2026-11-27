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
import { Network } from './world/network';
import { Player } from './player/player';
import { People, type Person } from './npc/people';
import { Traffic, type Car } from './vehicles/traffic';
import { Dialogue, loadDialog, type Line } from './game/dialogue';
import { Missions } from './game/missions';
import { Zap } from './fx/zap';
import { Sound } from './fx/sound';
import { Hud } from './ui/hud';
import { Bubbles } from './ui/bubbles';

const $ = (id: string) => document.getElementById(id)!;
const setLoad = (f: number, t?: string) => { ($('ldbar') as HTMLElement).style.width = Math.round(f * 100) + '%'; if (t) $('ldtxt').textContent = t; };
const tick = () => new Promise(r => setTimeout(r, 0));
const COUNTS = { low: [14, 14, 8], mid: [24, 24, 14], high: [36, 34, 20] } as const;

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
  const [world, dialog] = await Promise.all([loadWorld(f => setLoad(0.1 + f * 0.25)), loadDialog()]);
  const height = makeHeight(world), mats = new Materials(scene);
  setLoad(0.38, 'Gelände'); await tick();
  const terrain = buildTerrain(world, scene, mats);
  setLoad(0.44, 'Stroossen'); await tick();
  const roads = buildRoads(world, scene, mats, height);
  setLoad(0.5, 'Gebaier'); await tick();
  const buildings = buildBuildings(world, scene, mats, height);
  const solid = (m: AbstractMesh) => buildings.includes(m as never);
  const groundSet = new Set<AbstractMesh>([terrain, ...roads]);
  for (const m of groundSet) m.isPickable = true;
  for (const m of buildings) m.isPickable = true;
  const ground = (m: AbstractMesh) => groundSet.has(m);

  const input = new Input(canvas, $('hud'));
  const start = new Vector3(4, height(4, 16) + 1.5, 16);
  const player = new Player(scene, start, solid);
  const env = new Environment(scene, player.camera, quality);
  setLoad(0.56, 'Stroosseluuchten a Bänken'); await tick();
  const props = await buildProps(world, scene, height);
  setLoad(0.62, 'Blëtz'); await tick();
  const heroMeshes = await player.load(quality !== 'low');

  const net = new Network(world, height), dlg = new Dialogue(dialog), bubbles = new Bubbles($('hud'), scene, engine);
  const [nPeople, nCars, nSeated] = COUNTS[quality];
  const people = new People(scene, net, dlg, bubbles, nPeople, nSeated);
  const traffic = new Traffic(scene, net, nCars, ground, solid);
  setLoad(0.66, 'Leit an Autoen'); await tick();
  let lp = 0, lc = 0; const lprog = () => setLoad(0.66 + (lp + lc) * 0.14);
  await Promise.all([people.load(f => { lp = f; lprog(); }), traffic.load(f => { lc = f; lprog(); })]);
  people.spawn(start.x, start.z); traffic.spawn(start.x, start.z);
  // weitere Figuren im Hintergrund nachladen (mehr Vielfalt, ohne den Start zu bremsen)
  setTimeout(() => people.loadRest(() => (car ? car.pos : player.position), Math.round(nPeople * 0.5)).catch(e => console.warn('Figuren', e)), 1500);
  env.addCasters([...buildings, ...props, ...heroMeshes, ...traffic.cars.flatMap(c => c.meshes)]);
  if (quality === 'high') env.addCasters(people.casters());
  for (const m of [terrain, ...roads, ...buildings]) m.receiveShadows = true;

  const hud = new Hud($('hud'), backend, quality, net), zap = new Zap(scene), sound = new Sound(), missions = new Missions(scene);
  const say = (l: Line, big = false) => hud.toast(l, big);
  missions.onDone = (t, r) => { sound.chime(); say([`✔ ${t[0]}`, r[0] + ' · ' + r[1]], true); };

  // ---------------- Spielzustand ----------------
  let car: Car | null = null, wanted = 0, unseen = 0, bustT = 0, charge = 100, talkWith: Person | null = null, talkCool = 0, wantClock = 0;
  const heat = () => Math.min(5, Math.floor(wanted));
  const crime = (n: number, why?: Line) => { const before = heat(); wanted = Math.min(5.99, wanted + n); unseen = 0; if (heat() > before && why) say(why); };

  people.onKnock = () => { /* Zählung erfolgt beim Auslöser */ };
  traffic.onCrash = (v) => { if (car && v > 6) { sound.thump(v / 8); missions.stats.crashes++; } };
  traffic.onHitPerson = (pos, v) => {
    const p = people.list.find(q => q.pos === pos); if (!p || p.state === 'down') return;
    people.knock(p, car ? car.pos : pos); sound.thump(v / 6); crime(1, ['Dat huet een gesinn! Police gëtt geruff.', 'Das hat jemand gesehen! Polizei wird gerufen.']);
  };

  const closeTalk = () => { hud.closeTalk(); if (talkWith?.state === 'talk') talkWith.state = talkWith.seat ? 'sit' : 'walk'; talkWith = null; talkCool = 0.8; };
  const openTalk = (p: Person) => {
    talkWith = p; p.state = 'talk'; p.mood = 0; p.bark = 30;
    if (!p.met) missions.stats.talks++;
    let l = p.shocked ? dlg.afterShock(p.who) : p.met ? dlg.again(p.who) : dlg.intro(p.who); p.met++;
    const pers = dlg.d.pers[p.who.pers], head = `${p.who.name} · ${pers.lb} (${pers.de})`;
    const choices = (['news', 'lore', 'tip', 'you', 'bye'] as const).map(k => [k, dlg.d.choices[k]] as [string, Line]);
    const show = () => hud.openTalk(head, l, choices, k => {
      if (talkWith !== p) return;
      if (k === 'bye') { bubbles.say(p, dlg.line('bye', p.who, env.hour), () => p.head(), 3); closeTalk(); return; }
      p.mood = k === 'you' || k === 'news' ? 1 : 0; l = dlg.answer(k as 'news', p.who);
      if (p.met > 3 && Math.random() < 0.3) l = dlg.friend(p.who);
      show();
    });
    show();
  };
  const enterCar = (c: Car) => {
    const wasTraffic = c.kind === 'traffic', wasPolice = c.kind === 'police';
    c.kind = 'player'; car = c; player.setDriving(true); missions.stats.steals++;
    if (wasPolice) crime(2, ['Du hues e Policeauto geklaut!', 'Du hast ein Polizeiauto geklaut!']);
    else if (wasTraffic) crime(1, ['Auto geklaut! De Chauffeur rifft d\'Police.', 'Auto geklaut! Der Fahrer ruft die Polizei.']);
    else say(['Asteigen – lass fueren!', 'Einsteigen – los geht\'s!']);
  };
  const exitCar = () => {
    if (!car) return; const c = car, f = c.fwd, right = new Vector3(-f.z, 0, f.x);
    c.kind = traffic.police.includes(c) ? 'police' : 'parked'; c.speed = 0; car = null; sound.motor(null);
    player.setDriving(false, c.pos.add(right.scale(-2.4)).add(new Vector3(0, 1.4, 0)));
  };
  const doZap = () => {
    if (car) return;
    if (charge < 25) { say(['Keng Energie méi – waart e bëssen.', 'Keine Energie mehr – warte kurz.']); return; }
    charge -= 25; sound.zap(); player.bletz.flash();
    const from = player.position.add(new Vector3(0, 0.5, 0)).add(player.forward.scale(0.4));
    const p = people.zap(from, player.forward);
    if (p) { zap.fire(from, p.pos.add(new Vector3(0, 1.0, 0))); missions.stats.zaps++; crime(heat() ? 0.6 : 0.4, ['Een huet d\'Police geruff!', 'Jemand hat die Polizei gerufen!']); return; }
    const c = traffic.nearest(from.add(player.forward.scale(5)), 6);
    if (c) { zap.fire(from, c.pos.add(new Vector3(0, 1.2, 0))); c.stalled = 5; c.speed *= 0.2; if (c.kind === 'police') crime(1.5, ['Du hues d\'Police geschockt!', 'Du hast die Polizei geschockt!']); return; }
    zap.fire(from, from.add(player.forward.scale(7)).add(new Vector3(0, 1.5, 0)));
  };

  // ---------------- Einführung ----------------
  if (!localStorage.getItem('letz-adventures-v1')) {
    const d = document.createElement('div'); d.className = 'intro';
    d.innerHTML = `<div class="card"><h2>Blëtz zu Belval</h2>
      <p>Du bass de Blëtz – e klenge Léiw voller Elektrizitéit. Iwwer Nuecht bass du zu Belval opgedaucht, tëscht Héichiewen, Uni a Rockhal.<i>Du bist Blëtz – ein kleiner Löwe voller Elektrizität. Über Nacht bist du in Belval aufgetaucht, zwischen Hochöfen, Uni und Rockhal.</i></p>
      <p>Lér d'Leit kennen, entdeck d'Stad, huel der en Auto – mee pass op: d'Police kuckt no.<i>Lerne die Leute kennen, entdecke die Stadt, nimm dir ein Auto – aber Vorsicht: die Polizei schaut hin.</i></p>
      <p class="keys">Handy: lénks zéien = lafen · riets zéien = kucken · ZAP · E · SPRANG<br>PC: WASD · Maus · Q = Blëtz · E = schwätzen / asteigen · Leerzeichen · Shift</p>
      <button>Lass et!</button></div>`;
    document.body.append(d); d.querySelector('button')!.addEventListener('click', () => { d.remove(); missions.save(); });
  }

  setLoad(1, 'Fäerdeg');
  $('loading').classList.add('out'); setTimeout(() => $('loading').remove(), 900);
  env.setHour(env.hour);

  // ---------------- Spielschleife ----------------
  scene.onAfterPhysicsObservable.add(() => {
    const dt = Math.min(engine.getDeltaTime() / 1000, 1 / 20); if (dt <= 0) return;
    input.update();
    env.setHour((env.hour + dt / 120) % 24); // 1 Spielstunde = 2 Minuten
    charge = Math.min(100, charge + dt * 7); talkCool -= dt;

    // Aktionen
    if (input.pressed('act')) {
      if (hud.talking) closeTalk();
      else if (car) { if (Math.abs(car.speed) < 5) exitCar(); else say(['Bremms fir d\'éischt!', 'Erst bremsen!']); }
      else if (talkCool <= 0) {
        const pos = player.position, p = people.nearest(pos, 3.2), c = traffic.nearest(pos, 4.5);
        if (p && (!c || Vector3.Distance(p.pos, pos) < Vector3.Distance(c.pos, pos))) openTalk(p); else if (c) enterCar(c);
      }
    }
    if (input.pressed('zap')) doZap();
    if (talkWith && talkWith.state !== 'talk') closeTalk();

    // Bewegung
    const drive = car ? { throttle: input.move.y, steer: input.move.x } : null;
    if (!car) player.update(dt, input);
    const pos = car ? car.pos : player.position;
    const near = people.list.filter(p => p.root.isEnabled() && Vector3.DistanceSquared(p.pos, pos) < 3600).map(p => p.pos);
    const nd = traffic.update(dt, pos, car, car ? car.speed : player.speed, drive, near);
    if (car) { player.followCar(dt, car.pos, car.yaw, car.speed, input); sound.motor(car.speed); }
    people.update(dt, pos, env.hour, heat());
    zap.update(dt); bubbles.update();

    // Fahndung
    wantClock -= dt; if (wantClock <= 0) { wantClock = 0.5; traffic.setWanted(heat(), pos); }
    if (heat() > 0) {
      if (nd < 80) unseen = 0; else unseen += dt;
      if (unseen > 12) { unseen = 0; wanted = Math.max(0, Math.floor(wanted) - 1); if (heat() === 0) { missions.stats.escapes++; say(['Entkomm! D\'Police huet dech verluer.', 'Entkommen! Die Polizei hat dich verloren.'], true); } }
      const sp = Math.abs(car ? car.speed : player.speed);
      if (nd < 7 && sp < 2.5) { bustT += dt; if (bustT > 2.5) { bustT = 0; wanted = 0; if (car) exitCar(); say(['Erwëscht! D\'Police léisst dech mat enger Warnung goen.', 'Erwischt! Die Polizei lässt dich mit einer Verwarnung gehen.'], true); } }
      else bustT = Math.max(0, bustT - dt);
      sound.sirene(Math.max(0, 1 - nd / 150));
    } else { wanted = Math.max(0, wanted - dt * 0.03); sound.sirene(0); }

    // Hinweis
    let prompt = '';
    if (!hud.talking) {
      if (car) prompt = Math.abs(car.speed) < 5 ? 'E · Ausstiegen' : '';
      else { const p = people.nearest(pos, 3.2), c = traffic.nearest(pos, 4.5); if (p) prompt = `E · Mat ${p.who.name} schwätzen`; else if (c) prompt = c.kind === 'police' ? 'E · Policeauto huelen' : 'E · Asteigen'; }
    }
    hud.setPrompt(prompt);
    const mv = missions.update({ stats: missions.stats, pos, inCar: !!car, heat: heat() }, height);
    hud.update(dt, { hour: env.hour, fps: engine.getFps(), pos, yaw: player.camYaw, heat: heat(), charge, speed: car ? car.speed : null, mission: mv, police: traffic.police.filter(c => c.kind === 'police').map(c => c.pos) });
    input.endFrame();
  });
  engine.runRenderLoop(() => scene.render());
  addEventListener('resize', () => engine.resize());
  (window as unknown as { __letz: unknown }).__letz = { scene, player, env, engine, backend, world, people, traffic, missions, get car() { return car; }, crime };
}
main().catch(e => { console.error(e); $('ldtxt').textContent = 'Fehler: ' + (e?.message || e); });
