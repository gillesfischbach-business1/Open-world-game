import {
  SceneLoader, PBRMaterial, Texture, Vector3, Quaternion, MeshBuilder, Color3, type AssetContainer, type Scene, type TransformNode,
  type AbstractMesh, type LinesMesh,
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import type { Person } from './people';

/**
 * Hunde (Microsoft Rocketbox, MIT): Beagle und Schäferhund an der Leine eines Gassigehers.
 * Die Dateien haben kein eigenes Laufen – der Trab wird hier berechnet: Beine im Diagonalgang,
 * Rücken wippt, Kopf nickt, Schwanz wedelt. Gedreht wird um die Querachse des Hundes,
 * umgerechnet in das Koordinatensystem jedes Elternknochens (unabhängig von den Knochenachsen).
 */
const MODELS = [{ file: 'Dog_Beagle_01', tex: 'Dog_Beagle_01' }, { file: 'Dog_GermanShepard_01', tex: 'Dog_GermanShepard_01' }];
const DIR = './assets/dogs/';

interface Joint { n: TransformNode; rest: Quaternion; side: Vector3; up: Vector3; }
export class Dog {
  pos = new Vector3(); yaw = 0; speed = 0; phase = 0; t = Math.random() * 10;
  constructor(public root: TransformNode, public meshes: AbstractMesh[], public owner: Person, public leash: LinesMesh,
    public legs: { thigh: Joint[]; arm: Joint[]; calf: Joint[]; fore: Joint[] }, public tail: Joint[], public head: Joint | null, public spine: Joint | null, public side: number) {}
  hand: TransformNode | null = null;
}

export class Dogs {
  list: Dog[] = []; private tpl: AssetContainer[] = [];
  constructor(private scene: Scene) {}
  async load() {
    this.tpl = await Promise.all(MODELS.map(async m => {
      const c = await SceneLoader.LoadAssetContainerAsync(DIR, m.file + '.glb', this.scene); for (const g of c.animationGroups) g.stop();
      for (const mat of [...c.materials]) {
        const p = new PBRMaterial(mat.name, this.scene); p.metallic = 0; p.roughness = 0.85; p.albedoTexture = new Texture(DIR + m.tex + '.webp', this.scene, false, true);
        p.forceDepthWrite = true;
        for (const mesh of c.meshes) if (mesh.material === mat) mesh.material = p;
        mat.dispose(); c.materials = [p];
      }
      return c;
    }));
  }
  /** einem Menschen einen Hund geben */
  attach(owner: Person, i: number) {
    const c = this.tpl[i % this.tpl.length]; if (!c) return;
    const inst = c.instantiateModelsToScene(n => n, false, { doNotInstantiate: true });
    const root = inst.rootNodes[0] as TransformNode; root.scaling.setAll(0.01);
    const nodes = root.getDescendants(false) as TransformNode[];
    root.computeWorldMatrix(true); for (const n of nodes) n.computeWorldMatrix?.(true);
    const joint = (re: RegExp): Joint | null => {
      const n = nodes.find(x => re.test(x.name)); if (!n || !n.parent) return null;
      const inv = (n.parent as TransformNode).getWorldMatrix().clone(); inv.invert();
      return { n, rest: (n.rotationQuaternion ?? Quaternion.Identity()).clone(), side: Vector3.TransformNormal(new Vector3(1, 0, 0), inv).normalize(), up: Vector3.TransformNormal(new Vector3(0, 1, 0), inv).normalize() };
    };
    const pair = (a: string) => [joint(new RegExp(`_L_${a}$`)), joint(new RegExp(`_R_${a}$`))].filter(Boolean) as Joint[];
    const legs = { thigh: pair('Thigh'), arm: pair('UpperArm'), calf: pair('Calf'), fore: pair('Forearm') };
    const tail = [joint(/_Tail$/), joint(/_Tail1$/), joint(/_Tail2$/)].filter(Boolean) as Joint[];
    const meshes = root.getChildMeshes(false); for (const m of meshes) { m.isPickable = false; m.receiveShadows = true; }
    const leash = MeshBuilder.CreateLines('leine', { points: [Vector3.Zero(), new Vector3(0, 0.5, 0), new Vector3(0, 1, 0)], updatable: true }, this.scene);
    leash.color = new Color3(0.15, 0.1, 0.08); leash.isPickable = false;
    const d = new Dog(root, meshes, owner, leash, legs, tail, joint(/_Head$/), joint(/_Spine1$/), Math.random() < 0.5 ? 1 : -1);
    d.pos.copyFrom(owner.pos); this.list.push(d);
  }
  private rot(j: Joint | null, axis: 'side' | 'up', a: number) { if (j) j.n.rotationQuaternion = Quaternion.RotationAxis(j[axis], a).multiply(j.rest); }

  update(dt: number) {
    for (const d of this.list) {
      const o = d.owner, vis = o.root.isEnabled() && o.state !== 'down' && o.state !== 'up';
      if (d.root.isEnabled() !== vis) { d.root.setEnabled(vis); d.leash.setEnabled(vis); }
      if (!vis) { d.pos.copyFrom(o.pos); continue; }
      // Ziel: neben und etwas vor dem Besitzer (an der Leine)
      const fx = Math.sin(o.yaw), fz = Math.cos(o.yaw), rx = -fz * d.side, rz = fx * d.side;
      const tx = o.pos.x + rx * 0.75 + fx * 0.6, tz = o.pos.z + rz * 0.75 + fz * 0.6;
      const dx = tx - d.pos.x, dz = tz - d.pos.z, dist = Math.hypot(dx, dz);
      const want = Math.min(6, dist * 3); d.speed += (want - d.speed) * Math.min(1, dt * 6);
      if (dist > 0.02) { d.pos.x += dx / dist * Math.min(dist, d.speed * dt); d.pos.z += dz / dist * Math.min(dist, d.speed * dt); }
      if (dist > 4) d.pos.set(tx, o.pos.y, tz);
      d.pos.y += (o.pos.y - 0.08 - d.pos.y) * Math.min(1, dt * 8);
      const face = d.speed > 0.25 ? Math.atan2(dx, dz) : o.yaw;
      let dy = face - d.yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI; d.yaw += dy * Math.min(1, dt * 6);
      d.root.position.copyFrom(d.pos); d.root.rotationQuaternion = Quaternion.FromEulerAngles(0, d.yaw, 0);
      // Trab
      d.t += dt; const move = Math.min(1, d.speed / 1.2); d.phase += dt * (3 + d.speed * 4.5);
      const s = Math.sin(d.phase), amp = 0.55 * move;
      this.rot(d.legs.thigh[0], 'side', s * amp); this.rot(d.legs.thigh[1], 'side', -s * amp);
      this.rot(d.legs.arm[0], 'side', -s * amp); this.rot(d.legs.arm[1], 'side', s * amp);
      this.rot(d.legs.calf[0], 'side', Math.max(0, -s) * 0.6 * move); this.rot(d.legs.calf[1], 'side', Math.max(0, s) * 0.6 * move);
      this.rot(d.legs.fore[0], 'side', -Math.max(0, s) * 0.5 * move); this.rot(d.legs.fore[1], 'side', -Math.max(0, -s) * 0.5 * move);
      this.rot(d.spine, 'side', Math.sin(d.phase * 2) * 0.04 * move);
      this.rot(d.head, 'side', Math.sin(d.phase * 2) * 0.06 * move + Math.sin(d.t * 0.8) * 0.12 * (1 - move));
      const wag = Math.sin(d.t * (move > 0.3 ? 9 : 6)) * 0.45;
      d.tail.forEach((j, k) => this.rot(j, 'up', wag * (0.5 + k * 0.3)));
      // Leine: Hand des Besitzers → Halsband
      d.hand ??= (o.h.root.getDescendants(false).find(n => /Bip0\d_L_Hand$/.test(n.name)) as TransformNode | undefined) ?? null;
      const from = d.hand ? d.hand.getAbsolutePosition() : o.pos.add(new Vector3(0, 0.9, 0));
      const collar = d.head ? d.head.n.getAbsolutePosition() : d.pos.add(new Vector3(0, 0.45, 0));
      MeshBuilder.CreateLines('leine', { points: [from, Vector3.Lerp(from, collar, 0.5).add(new Vector3(0, -0.12, 0)), collar], instance: d.leash });
    }
  }
}
