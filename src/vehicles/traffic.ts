import { SceneLoader, Quaternion, Vector3, Ray, Axis, PointLight, Color3, type AssetContainer, type Scene, type TransformNode, type AbstractMesh } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import type { Network, Path, Sample } from '../world/network';
import { rng } from '../world/data';

const CIVIL: Array<[string, number]> = [['sedan', 5], ['hatchback-sports', 3], ['suv', 3], ['suv-luxury', 2], ['sedan-sports', 1], ['taxi', 2], ['van', 2], ['delivery', 2], ['truck', 1], ['garbage-truck', 0.5], ['ambulance', 0.3]];
const SCALE = 1.75;
export type Kind = 'traffic' | 'parked' | 'player' | 'police';

interface Wheel { n: TransformNode; base: Quaternion; front: boolean; }

/** Ein Fahrzeug: fährt im Verkehr, steht geparkt, wird von Blëtz gefahren oder ist Polizei. */
export class Car {
  kind: Kind = 'traffic'; pos = new Vector3(); yaw = 0; speed = 0; steer = 0; spin = 0; stalled = 0; vy = 0; stuck = 0; bounce = 0;
  path!: Path; s = 0; dir: 1 | -1 = 1;
  constructor(public model: string, public root: TransformNode, public meshes: AbstractMesh[], public wheels: Wheel[]) {}
  get fwd() { return new Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }
  sync(dt: number) {
    this.root.position.copyFrom(this.pos); this.root.rotationQuaternion = Quaternion.FromEulerAngles(0, this.yaw, 0);
    this.spin += this.speed * dt / (0.3 * SCALE);
    for (const w of this.wheels) w.n.rotationQuaternion = Quaternion.RotationAxis(Axis.Y, w.front ? this.steer : 0).multiply(w.base).multiply(Quaternion.RotationAxis(Axis.X, this.spin));
  }
}

export interface DriveInput { throttle: number; steer: number; }

/**
 * Verkehr: Autos folgen dem Straßennetz (rechte Spur), bremsen vor Hindernissen.
 * Blëtz kann jedes Auto nehmen (E) und frei fahren; Polizei verfolgt ihn, wenn er gesucht wird.
 */
export class Traffic {
  cars: Car[] = []; police: Car[] = []; private tpl = new Map<string, AssetContainer>(); private r = rng(4242);
  private smp: Sample = { x: 0, y: 0, z: 0, dx: 0, dz: 1 }; private siren: PointLight; private sirenT = 0;
  /** vom Leistungs-Manager gesteuert */ viewDist = 320;
  onHitPerson?: (pos: Vector3, speed: number) => void; onCrash?: (speed: number, other: Car | null) => void;
  constructor(private scene: Scene, private net: Network, private count: number,
    private ground: (m: AbstractMesh) => boolean, private solid: (m: AbstractMesh) => boolean) {
    this.siren = new PointLight('blaulicht', new Vector3(), scene); this.siren.intensity = 0; this.siren.range = 30;
  }
  async load(onProgress?: (f: number) => void) {
    const names = [...CIVIL.map(c => c[0]), 'police']; let done = 0;
    await Promise.all(names.map(async n => { this.tpl.set(n, await SceneLoader.LoadAssetContainerAsync('./assets/models/cars/', n + '.glb', this.scene)); onProgress?.(++done / names.length); }));
  }
  private make(model: string): Car {
    const inst = this.tpl.get(model)!.instantiateModelsToScene(n => n, false);
    const root = inst.rootNodes[0] as TransformNode; root.scaling.setAll(SCALE);
    const wheels: Wheel[] = root.getChildTransformNodes(false).filter(n => n.name.startsWith('wheel')).map(n => ({ n, base: n.rotationQuaternion?.clone() ?? Quaternion.Identity(), front: n.name.includes('front') }));
    const meshes = root.getChildMeshes(false); for (const m of meshes) { m.isPickable = true; m.receiveShadows = true; }
    // Räder, die selbst Meshes sind
    for (const m of meshes) if (m.name.startsWith('wheel') && !wheels.some(w => w.n === m)) wheels.push({ n: m, base: m.rotationQuaternion?.clone() ?? Quaternion.Identity(), front: m.name.includes('front') });
    const c = new Car(model, root, meshes, wheels); for (const m of meshes) m.metadata = { car: c };
    return c;
  }
  private pickModel() { const tot = CIVIL.reduce((a, c) => a + c[1], 0); let x = this.r() * tot; for (const [n, w] of CIVIL) if ((x -= w) <= 0) return n; return 'sedan'; }
  private lane(c: Car) { return c.path.oneway ? 0 : c.path.hw * 0.48; }
  private putOnRoad(c: Car, px: number, pz: number, r0: number, r1: number) {
    const at = this.net.pick(px, pz, r0, r1, this.r, q => q.drive); if (!at) return false;
    c.path = at[0]; c.s = at[1]; c.dir = c.path.oneway || this.r() < 0.5 ? 1 : -1; c.speed = 6; c.stalled = 0;
    const q = this.net.sample(c.path, c.s, c.dir, this.lane(c), this.smp); c.pos.set(q.x, q.y, q.z); c.yaw = Math.atan2(q.dx, q.dz); return true;
  }
  spawn(x: number, z: number) {
    for (let i = 0; i < this.count; i++) { const c = this.make(this.pickModel()); if (!this.putOnRoad(c, x, z, 12, 260)) { c.root.dispose(); continue; } c.sync(0); this.cars.push(c); }
  }
  nearest(pos: Vector3, max: number): Car | null {
    let best: Car | null = null, bd = max;
    for (const c of [...this.cars, ...this.police]) { if (c.kind === 'player') continue; const d = Vector3.Distance(c.pos, pos); if (d < bd) { bd = d; best = c; } }
    return best;
  }

  /** Polizei-Wagen ins Spiel bringen / entfernen, passend zur Fahndungsstufe */
  setWanted(stars: number, player: Vector3) {
    const want = stars <= 0 ? 0 : Math.min(4, Math.ceil(stars * 0.8));
    while (this.police.length < want) {
      const c = this.make('police'); c.kind = 'police';
      if (!this.putOnRoad(c, player.x, player.z, 90, 220)) { c.root.dispose(); break; }
      this.police.push(c);
    }
    while (this.police.length > want) { const c = this.police.pop()!; if (c.kind === 'player') { this.police.push(c); break; } c.root.dispose(); }
  }

  /** freies Fahren (Blëtz oder Polizei): einfache, gut steuerbare Auto-Physik */
  driveFree(c: Car, inp: DriveInput, dt: number, maxV: number) {
    if (c.stalled > 0) { c.stalled -= dt; inp = { throttle: 0, steer: inp.steer }; }
    const v = c.speed;
    if (inp.throttle > 0.05) c.speed += (v < 0 ? 16 : 9 * (1 - Math.max(0, v) / maxV)) * inp.throttle * dt;
    else if (inp.throttle < -0.05) c.speed += (v > 0.5 ? -16 : -6 * (1 + Math.min(0, v) / 7)) * -inp.throttle * dt;
    else c.speed -= Math.sign(v) * Math.min(Math.abs(v), 3 * dt);
    c.speed *= 1 - 0.08 * dt;
    const maxSteer = 0.55 / (1 + Math.abs(c.speed) * 0.06);
    c.steer += (inp.steer * maxSteer - c.steer) * Math.min(1, dt * 7);
    c.yaw -= c.speed / 2.7 * Math.tan(c.steer) * dt;
    const f = c.fwd, step = c.speed * dt;
    // Gebäude vor/hinter dem Auto?
    const hit = this.scene.pickWithRay(new Ray(c.pos.add(new Vector3(0, 0.8, 0)), f.scale(Math.sign(c.speed) || 1), Math.abs(step) + 2.3), this.solid);
    if (hit?.hit) { this.onCrash?.(Math.abs(c.speed), null); c.speed = -c.speed * 0.25; c.bounce = 0.3; }
    else c.pos.addInPlace(f.scale(step));
    // andere Autos
    for (const o of [...this.cars, ...this.police]) {
      if (o === c) continue; const d = Vector3.Distance(o.pos, c.pos); if (d > 3.2 || d < 0.01) continue;
      const push = c.pos.subtract(o.pos).normalize().scale(3.2 - d); push.y = 0; c.pos.addInPlace(push.scale(0.7)); o.pos.subtractInPlace(push.scale(0.3));
      if (Math.abs(c.speed) > 3) { this.onCrash?.(Math.abs(c.speed), o); o.stalled = 3; }
      c.speed *= -0.3;
    }
    this.toGround(c, dt);
  }
  private toGround(c: Car, dt: number) {
    const hit = this.scene.pickWithRay(new Ray(c.pos.add(new Vector3(0, 5, 0)), new Vector3(0, -1, 0), 14), this.ground);
    if (hit?.hit && hit.pickedPoint) {
      const gy = hit.pickedPoint.y;
      if (c.pos.y > gy + 0.3) { c.vy -= 18 * dt; c.pos.y = Math.max(gy, c.pos.y + c.vy * dt); } else { c.vy = 0; c.pos.y += (gy - c.pos.y) * Math.min(1, dt * 15); }
    }
  }

  update(dt: number, player: Vector3, playerCar: Car | null, playerSpeed: number, drive: DriveInput | null, people: Vector3[]) {
    // Verkehr
    for (const c of this.cars) {
      if (c.kind === 'player') continue;
      const dp = Vector3.Distance(c.pos, player);
      if (c.kind === 'parked') { if (dp > 500) { c.kind = 'traffic'; this.putOnRoad(c, player.x, player.z, 150, 380); } continue; }
      if (dp > 450 && !this.putOnRoad(c, player.x, player.z, 150, 380)) continue;
      const f = c.fwd; let free = 99;
      const check = (p: Vector3, lat: number) => { const d = p.subtract(c.pos); const ahead = d.x * f.x + d.z * f.z; if (ahead < 0.5 || ahead > 16) return; const side = Math.abs(d.x * f.z - d.z * f.x); if (side < lat) free = Math.min(free, ahead); };
      for (const o of this.cars) if (o !== c) check(o.pos, 1.6);
      for (const o of this.police) check(o.pos, 1.6);
      check(player, 1.8); for (const p of people) check(p, 1.2);
      const vmax = Math.max(8, Math.min(15, c.path.vmax / 3.6 * 0.75));
      const target = c.stalled > 0 ? 0 : free < 5.5 ? 0 : free < 12 ? vmax * (free - 5.5) / 6.5 : vmax;
      c.stalled -= dt;
      c.speed += Math.max(-10 * dt, Math.min(3.5 * dt, target - c.speed));
      c.s += c.dir * c.speed * dt;
      if (c.s < 0 || c.s > c.path.len) { const [q, dir, s] = this.net.next(c.path, c.dir, this.r(), q => q.drive, true); c.path = q; c.dir = dir; c.s = s; }
      const q = this.net.sample(c.path, c.s, c.dir, this.lane(c), this.smp);
      c.pos.set(q.x, q.y, q.z);
      let d = Math.atan2(q.dx, q.dz) - c.yaw; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      c.steer = Math.max(-0.5, Math.min(0.5, d * 2)); c.yaw += d * Math.min(1, dt * 5);
      const vis = dp < this.viewDist; if (c.root.isEnabled() !== vis) c.root.setEnabled(vis);
      if (vis) c.sync(dt);
    }
    // Blëtz fährt
    if (playerCar && drive) { this.driveFree(playerCar, drive, dt, 30); playerCar.sync(dt); for (const p of people) if (Vector3.Distance(p, playerCar.pos) < 1.9 && Math.abs(playerCar.speed) > 3) this.onHitPerson?.(p, Math.abs(playerCar.speed)); }
    // Polizei jagt
    let near: Car | null = null, nd = 1e9;
    for (const c of this.police) {
      if (c.kind === 'player') { continue; }
      const to = player.subtract(c.pos), d = to.length();
      let want = Math.atan2(to.x, to.z) - c.yaw; while (want > Math.PI) want -= 2 * Math.PI; while (want < -Math.PI) want += 2 * Math.PI;
      if (c.stuck > 0) { c.stuck -= dt; this.driveFree(c, { throttle: -1, steer: Math.sign(want) }, dt, 8); }
      else {
        const slow = d < 9 ? Math.max(0, (d - 5) / 4) : 1;
        this.driveFree(c, { throttle: slow > 0.1 ? slow : -0.6 * Math.sign(c.speed), steer: Math.max(-1, Math.min(1, -want * 2.2)) * (c.speed < 0 ? -1 : 1) }, dt, 24 + playerSpeed * 0.15);
        if (Math.abs(c.speed) < 1 && d > 10) { c.bounce += dt; if (c.bounce > 1.5) { c.stuck = 1.2; c.bounce = 0; } }
      }
      if (d > 600) this.putOnRoad(c, player.x, player.z, 90, 220);
      c.sync(dt); if (d < nd) { nd = d; near = c; }
    }
    // Blaulicht am nächsten Polizeiwagen
    this.sirenT += dt;
    if (near && nd < 150) { this.siren.position.copyFrom(near.pos).addInPlaceFromFloats(0, 2.6, 0); this.siren.intensity = 2.5; this.siren.diffuse = Math.floor(this.sirenT * 5) % 2 ? new Color3(0.1, 0.3, 1) : new Color3(1, 0.1, 0.1); }
    else this.siren.intensity = 0;
    return nd;
  }
}
