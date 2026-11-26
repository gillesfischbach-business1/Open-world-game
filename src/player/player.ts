import {
  SceneLoader, PhysicsCharacterController, CharacterSupportedState, Vector3, Quaternion, Ray, FreeCamera,
  type Scene, type AnimationGroup, type AbstractMesh, type TransformNode,
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import type { Input } from '../core/input';

/**
 * Spielfigur mit physikalischer Steuerung (Havok-Charakter-Controller): laufen, rennen, springen,
 * Stufen und Hänge. Modell vorerst: animierter Fuchs (Khronos glTF-Beispiel, CC-BY 4.0) als Platzhalter
 * für Blëtz, bis ein eigenes Löwenmodell da ist.
 */
export class Player {
  ctrl: PhysicsCharacterController; root!: TransformNode; anims: Record<string, AnimationGroup> = {};
  yaw = 0; speed = 0; private wantJump = false; private vy = 0; private grounded = false;
  camYaw = Math.PI; camPitch = 0.3; camDist = 5.5; camera: FreeCamera;
  private gravity = new Vector3(0, -18, 0);
  constructor(private scene: Scene, start: Vector3, private colliders: (m: AbstractMesh) => boolean) {
    this.ctrl = new PhysicsCharacterController(start, { capsuleHeight: 1.0, capsuleRadius: 0.35 }, scene);
    this.ctrl.maxStepHeight = 0.45; this.ctrl.maxSlopeCosine = Math.cos(50 * Math.PI / 180);
    this.camera = new FreeCamera('kamera', start.add(new Vector3(0, 3, 6)), scene); this.camera.minZ = 0.1; this.camera.maxZ = 8000; this.camera.fov = 1.0;
    scene.activeCamera = this.camera;
  }
  async load() {
    const res = await SceneLoader.ImportMeshAsync('', './assets/models/', 'fox.glb', this.scene);
    this.root = res.meshes[0]; this.root.scaling.setAll(0.012); // Fuchs-Modell in cm → ~1 m lang
    for (const m of res.meshes) { m.isPickable = false; m.receiveShadows = true; }
    for (const g of res.animationGroups) { g.stop(); this.anims[g.name.toLowerCase()] = g; }
    this.play('survey');
    return res.meshes;
  }
  private cur = '';
  private play(n: string, speedRatio = 1) { const g = this.anims[n]; if (!g) return; if (this.cur !== n) { for (const a of Object.values(this.anims)) a.stop(); g.start(true, speedRatio); this.cur = n; } else g.speedRatio = speedRatio; }
  get position() { return this.ctrl.getPosition(); }
  get forward() { return new Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }
  /** Blëtz steigt ein (Modell aus) oder aus (an Position pos) */
  setDriving(on: boolean, pos?: Vector3) {
    this.root.setEnabled(!on);
    if (pos) { this.ctrl.setPosition(pos); this.ctrl.setVelocity(Vector3.Zero()); this.speed = 0; }
  }
  /** Kamera hinter dem Auto */
  followCar(dt: number, pos: Vector3, yaw: number, speed: number, input: Input) {
    this.ctrl.setPosition(pos.add(new Vector3(0, 1.2, 0))); this.ctrl.setVelocity(Vector3.Zero());
    this.camPitch = Math.max(-0.2, Math.min(1.0, this.camPitch + input.look.y * 0.003));
    if (Math.abs(input.look.x) > 0.5) this.free = 1.6; this.free -= dt;
    this.camYaw -= input.look.x * 0.004;
    if (this.free <= 0) { let d = yaw + Math.PI - this.camYaw; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; this.camYaw += d * Math.min(1, dt * 3); this.camPitch += (0.22 - this.camPitch) * Math.min(1, dt * 2); }
    const dist = this.camDist; this.camDist = 7.5 + Math.abs(speed) * 0.08; this.updateCamera(dt, pos.add(new Vector3(0, 0.6, 0))); this.camDist = dist;
  }
  private free = 0;
  /** kurzer Stoß nach hinten (z. B. vom Auto erwischt) */
  bump(v: Vector3) { this.ctrl.setVelocity(v); }

  update(dt: number, input: Input) {
    if (dt <= 0) return;
    // Kamera drehen
    this.camYaw -= input.look.x * 0.004; this.camPitch = Math.max(-0.35, Math.min(1.2, this.camPitch + input.look.y * 0.003));
    // Bewegung relativ zur Kamera
    const fx = -Math.sin(this.camYaw), fz = -Math.cos(this.camYaw), rx = Math.cos(this.camYaw), rz = -Math.sin(this.camYaw);
    let mx = fx * input.move.y + rx * input.move.x, mz = fz * input.move.y + rz * input.move.x;
    const mag = Math.min(1, Math.hypot(mx, mz)); if (mag > 0.01) { mx /= mag; mz /= mag; }
    const target = mag * (input.sprint ? 8.5 : 4.2);
    this.speed += (target - this.speed) * Math.min(1, dt * 8);
    if (mag > 0.05) { const want = Math.atan2(mx, mz); let d = want - this.yaw; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; this.yaw += d * Math.min(1, dt * 10); }
    const support = this.ctrl.checkSupport(dt, new Vector3(0, -1, 0));
    this.grounded = support.supportedState === CharacterSupportedState.SUPPORTED;
    if (input.pressed('jump') && this.grounded) this.wantJump = true;
    const cur = this.ctrl.getVelocity();
    const desired = new Vector3(Math.sin(this.yaw) * this.speed, 0, Math.cos(this.yaw) * this.speed);
    let v: Vector3;
    if (this.grounded) {
      v = this.ctrl.calculateMovement(dt, new Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)), support.averageSurfaceNormal, cur, support.averageSurfaceVelocity, desired, new Vector3(0, 1, 0));
      v.subtractInPlace(support.averageSurfaceVelocity);
      if (this.wantJump) { v.y = 7.2; this.wantJump = false; }
      else { const n = support.averageSurfaceNormal; const dot = v.dot(n); v.subtractInPlace(n.scale(dot)); }
      v.addInPlace(support.averageSurfaceVelocity);
    } else {
      v = new Vector3(desired.x * 0.9 + cur.x * 0.1, cur.y, desired.z * 0.9 + cur.z * 0.1);
      v.addInPlace(this.gravity.scale(dt));
    }
    this.ctrl.setVelocity(v);
    this.ctrl.integrate(dt, support, this.gravity);
    // Modell folgen lassen
    const p = this.ctrl.getPosition();
    this.root.position.set(p.x, p.y - 0.85, p.z);
    this.root.rotationQuaternion = Quaternion.FromEulerAngles(0, this.yaw, 0);
    if (!this.grounded) this.play('run', 0.6); else if (this.speed > 5) this.play('run', this.speed / 7); else if (this.speed > 0.4) this.play('walk', this.speed / 2.2); else this.play('survey');
    this.updateCamera(dt, p);
  }

  private camPos = new Vector3();
  private updateCamera(dt: number, p: Vector3) {
    const tgt = p.add(new Vector3(0, 0.9, 0));
    const cp = Math.cos(this.camPitch), dir = new Vector3(Math.sin(this.camYaw) * cp, Math.sin(this.camPitch), Math.cos(this.camYaw) * cp);
    let dist = this.camDist;
    const hit = this.scene.pickWithRay(new Ray(tgt, dir, dist), this.colliders);
    if (hit?.hit && hit.distance < dist) dist = Math.max(0.8, hit.distance - 0.3);
    const want = tgt.add(dir.scale(dist));
    if (this.camPos.lengthSquared() === 0) this.camPos.copyFrom(want);
    this.camPos = Vector3.Lerp(this.camPos, want, Math.min(1, dt * 12));
    this.camera.position.copyFrom(this.camPos); this.camera.setTarget(tgt);
  }
}
