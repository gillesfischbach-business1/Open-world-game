import { SceneLoader, Quaternion, Vector3, type AssetContainer, type AnimationGroup, type Scene, type TransformNode, type AbstractMesh } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import type { Network, Path, Sample } from '../world/network';
import type { Dialogue, Who } from '../game/dialogue';
import type { Bubbles } from '../ui/bubbles';
import { rng } from '../world/data';

const FEMALE = ['a', 'b', 'c', 'd', 'e', 'f'].map(k => 'character-female-' + k);
const MALE = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(k => 'character-male-' + k).concat('character-worker');
const KEEP = new Set(['idle', 'walk', 'sprint', 'die', 'emote-yes', 'emote-no', 'interact-right', 'sit']);
const SCALE = 2.5; // Modelle sind ~0,67 m hoch → ~1,7 m

export type State = 'walk' | 'idle' | 'talk' | 'flee' | 'down' | 'chat';

/** Ein Mensch in Belval: läuft auf Gehwegen, bleibt stehen, plaudert, reagiert auf Blëtz. */
export class Person {
  state: State = 'walk'; t = 0; speed = 1.3; yaw = 0; pos = new Vector3(); met = 0; shocked = 0; bark = 0; mood = 0;
  partner: Person | null = null; fleeFrom = new Vector3(); private cur = '';
  constructor(public who: Who, public female: boolean, public root: TransformNode, public meshes: AbstractMesh[], public anims: Record<string, AnimationGroup>,
    public path: Path, public s: number, public dir: 1 | -1, public side: number) {}
  play(n: string, loop = true, speed = 1) {
    const g = this.anims[n]; if (!g) return;
    if (this.cur !== n) { for (const a of Object.values(this.anims)) a.stop(); g.start(loop, speed); this.cur = n; } else g.speedRatio = speed;
  }
  head() { return this.pos.add(new Vector3(0, 1.95, 0)); }
  setVisible(v: boolean) { if (this.root.isEnabled() !== v) { this.root.setEnabled(v); if (!v) { for (const a of Object.values(this.anims)) a.stop(); this.cur = ''; } } }
}

export class People {
  list: Person[] = []; private templates: AssetContainer[][] = [[], []]; private r = rng(77); private smp: Sample = { x: 0, y: 0, z: 0, dx: 0, dz: 1 };
  private chatClock = 0; barkClock = 0;
  onKnock?: (p: Person) => void;
  constructor(private scene: Scene, private net: Network, private dlg: Dialogue, private bubbles: Bubbles, private count: number) {}

  async load(onProgress?: (f: number) => void) {
    const all = [...FEMALE.map(n => [n, 0] as const), ...MALE.map(n => [n, 1] as const)];
    let done = 0;
    await Promise.all(all.map(async ([n, g]) => {
      const c = await SceneLoader.LoadAssetContainerAsync('./assets/models/people/', n + '.glb', this.scene);
      this.templates[g].push(c); onProgress?.(++done / all.length);
    }));
  }

  /** Menschen rund um (x, z) verteilen */
  spawn(x: number, z: number) {
    for (let i = 0; i < this.count; i++) {
      const at = this.net.pick(x, z, 4, 150, this.r, p => p.walk); if (!at) continue;
      const female = this.r() < 0.5, tpl = this.templates[female ? 0 : 1], c = tpl[Math.floor(this.r() * tpl.length)];
      const inst = c.instantiateModelsToScene(n => n, false, { doNotInstantiate: true });
      const root = inst.rootNodes[0] as TransformNode; root.scaling.setAll(SCALE);
      const anims: Record<string, AnimationGroup> = {};
      for (const g of inst.animationGroups) { if (KEEP.has(g.name)) { g.stop(); anims[g.name] = g; } else g.dispose(); }
      const meshes = root.getChildMeshes(false); for (const m of meshes) { m.isPickable = false; m.receiveShadows = true; m.alwaysSelectAsActiveMesh = false; }
      const who: Who = { name: this.dlg.name(female, this.r()), pers: this.dlg.persOf(this.r()), role: this.dlg.roleOf(this.r()) };
      const p = new Person(who, female, root, meshes, anims, at[0], at[1], this.r() < 0.5 ? 1 : -1, this.sideFor(at[0]));
      p.speed = 1.1 + this.r() * 0.5; this.place(p, 1); this.list.push(p);
    }
  }

  private sideFor(q: Path) { return q.foot ? (this.r() - 0.5) * 0.8 : (q.hw + 1.2) * (this.r() < 0.5 ? 1 : -1); }
  private place(p: Person, dt: number) {
    const q = this.net.sample(p.path, p.s, p.dir, p.side * p.dir, this.smp);
    p.pos.set(q.x, q.y + 0.12, q.z);
    const want = Math.atan2(q.dx, q.dz); this.turn(p, want, dt);
  }
  private turn(p: Person, want: number, dt: number) {
    let d = want - p.yaw; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; p.yaw += d * Math.min(1, dt * 6);
  }
  private advance(p: Person, v: number, dt: number) {
    p.s += p.dir * v * dt;
    if (p.s < 0 || p.s > p.path.len) {
      const [q, dir, s] = this.net.next(p.path, p.dir, this.r(), x => x.walk, false);
      p.path = q; p.dir = dir; p.s = s; p.side = q.foot ? (this.r() - 0.5) * 0.8 : (Math.sign(p.side) || 1) * (q.hw + 1.2);
    }
    this.place(p, dt);
  }

  /** nächster ansprechbarer Mensch */
  nearest(pos: Vector3, max: number): Person | null {
    let best: Person | null = null, bd = max;
    for (const p of this.list) { if (!p.root.isEnabled() || p.state === 'down') continue; const d = Math.hypot(pos.x - p.pos.x, pos.z - p.pos.z); if (d < bd && Math.abs(pos.y - p.pos.y) < 3) { bd = d; best = p; } }
    return best;
  }

  /** Blitz: trifft den Menschen vor Blëtz (oder ganz nah), andere laufen weg */
  zap(from: Vector3, fwd: Vector3): Person | null {
    let best: Person | null = null, score = 1e9;
    for (const p of this.list) {
      if (!p.root.isEnabled() || p.state === 'down') continue;
      const d = p.pos.subtract(from); d.y = 0; const L = d.length(); if (L > 10) continue;
      const cos = L > 0.01 ? Vector3.Dot(d.scale(1 / L), fwd) : 1; if (cos < 0.35 && L > 2.5) continue;
      const sc = L * (2 - cos); if (sc < score) { score = sc; best = p; }
    }
    if (best) this.knock(best, from);
    return best;
  }
  knock(p: Person, from: Vector3) {
    if (p.partner) { p.partner.partner = null; p.partner.state = 'walk'; p.partner = null; }
    p.state = 'down'; p.t = 4.5 + this.r() * 2; p.shocked++; p.play('die', false);
    this.bubbles.say(p, this.dlg.line(p.shocked > 1 ? 'reshock' : 'shock', p.who, 12), () => p.head(), 3.5);
    this.scare(from, 22, p); this.onKnock?.(p);
  }
  scare(from: Vector3, radius: number, except?: Person) {
    for (const q of this.list) {
      if (q === except || q.state === 'down' || !q.root.isEnabled() || Vector3.Distance(q.pos, from) > radius) continue;
      if (q.partner) { q.partner = null; }
      q.state = 'flee'; q.t = 5 + this.r() * 3; q.fleeFrom.copyFrom(from);
      // weglaufen: Richtung so wählen, dass der Abstand wächst
      const ahead = this.net.sample(q.path, q.s + q.dir * 3, q.dir, q.side * q.dir, { x: 0, y: 0, z: 0, dx: 0, dz: 0 });
      if (Math.hypot(ahead.x - from.x, ahead.z - from.z) < Vector3.Distance(q.pos, from)) q.dir = (q.dir === 1 ? -1 : 1);
    }
  }

  update(dt: number, player: Vector3, hour: number, heat: number) {
    this.chatClock -= dt; this.barkClock -= dt;
    for (const p of this.list) {
      const d = Vector3.Distance(p.pos, player);
      // weit weg: an neuen Ort in der Nähe versetzen
      if (d > 230) { const at = this.net.pick(player.x, player.z, 90, 180, this.r, q => q.walk); if (at) { p.path = at[0]; p.s = at[1]; p.side = this.sideFor(at[0]); p.state = 'walk'; p.partner = null; this.place(p, 1); } }
      const vis = d < 150; p.setVisible(vis); if (!vis) continue;
      p.t -= dt; p.bark -= dt;
      switch (p.state) {
        case 'walk':
          this.advance(p, p.speed, dt); p.play('walk', true, p.speed / 1.25);
          if (p.t < -8 && this.r() < dt * 0.06) { p.state = 'idle'; p.t = 2 + this.r() * 5; }
          // Blëtz begegnen: kurzer Spruch
          if (d < 4.5 && p.bark <= 0 && this.barkClock <= 0) {
            const cat = heat >= 2 ? 'wary' : p.shocked ? 'wary' : this.r() < 0.4 ? 'cute' : this.r() < 0.5 ? 'hero' : p.met ? 'amb' : 'greet';
            this.bubbles.say(p, this.dlg.line(cat, p.who, hour), () => p.head()); p.bark = 25; this.barkClock = 2.5;
          }
          break;
        case 'idle':
          p.play('idle'); this.place(p, dt); if (p.t <= 0) { p.state = 'walk'; p.t = 0; }
          break;
        case 'talk':
          p.play(p.mood > 0 ? 'emote-yes' : p.mood < 0 ? 'emote-no' : 'idle'); this.turn(p, Math.atan2(player.x - p.pos.x, player.z - p.pos.z), dt);
          if (d > 6) { p.state = 'walk'; p.t = 0; }
          break;
        case 'chat':
          p.play(p.t % 3 < 1.2 ? 'interact-right' : 'idle');
          if (p.partner) this.turn(p, Math.atan2(p.partner.pos.x - p.pos.x, p.partner.pos.z - p.pos.z), dt);
          if (p.t <= 0) { p.state = 'walk'; p.t = 0; if (p.partner) p.partner.partner = null; p.partner = null; }
          break;
        case 'flee':
          this.advance(p, 4.6, dt); p.play('sprint', true, 1.1); if (p.t <= 0) { p.state = 'walk'; p.t = 0; }
          break;
        case 'down':
          if (p.t <= 0) { p.state = 'idle'; p.t = 1.5; p.mood = -1; }
          break;
      }
      p.root.position.copyFrom(p.pos); p.root.rotationQuaternion = Quaternion.FromEulerAngles(0, p.yaw, 0);
    }
    // zwei Fußgänger treffen sich und plaudern
    if (this.chatClock <= 0) {
      this.chatClock = 1;
      const near = this.list.filter(p => p.root.isEnabled() && p.state === 'walk' && Vector3.Distance(p.pos, player) < 60);
      for (let i = 0; i < near.length; i++) for (let j = i + 1; j < near.length; j++) {
        const a = near[i], b = near[j]; if (a.state !== 'walk' || b.state !== 'walk' || Vector3.Distance(a.pos, b.pos) > 2.6 || this.r() > 0.35) continue;
        a.state = b.state = 'chat'; a.t = b.t = 7 + this.r() * 3; a.partner = b; b.partner = a;
        const c = this.dlg.convo();
        c.forEach((l, k) => setTimeout(() => { const who = k % 2 ? b : a; if (who.state === 'chat') this.bubbles.say(who, l, () => who.head(), 2.6); }, k * 2300));
      }
    }
  }
  casters() { return this.list.flatMap(p => p.meshes); }
}
