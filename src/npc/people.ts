import { Quaternion, Vector3, MeshBuilder, PBRMaterial, Color3, type AnimationGroup, type Scene, type TransformNode, type AbstractMesh, type Mesh, type Node } from '@babylonjs/core';
import { Dogs } from './dogs';
import type { Network, Path, Sample } from '../world/network';
import type { Dialogue, Who } from '../game/dialogue';
import type { Bubbles } from '../ui/bubbles';
import { rng } from '../world/data';
import { seats, type Seat } from '../world/props';
import { HumanLibrary, AVATARS, CLIP_SPEED, type Clip, type AvatarDef, type Human } from './humans';

export type State = 'walk' | 'idle' | 'phone' | 'coffee' | 'paper' | 'talk' | 'flee' | 'down' | 'up' | 'chat' | 'sit';
type Role = 'walker' | 'commuter' | 'jogger' | 'kid' | 'sitter';

/** Blickrichtung der Rocketbox-Modelle relativ zu +z (im Spiel geprüft) */
const FACING = 0;

/** Ein Mensch in Belval: läuft, joggt, sitzt im Café, plaudert, schaut aufs Handy, reagiert auf Blëtz. */
export class Person {
  state: State = 'walk'; t = 0; speed = 1.3; yaw = 0; pos = new Vector3(); met = 0; shocked = 0; bark = 0; mood = 0;
  partner: Person | null = null; fleeFrom = new Vector3(); seat: Seat | null = null; tilt = 0; private cur: Clip | '' = ''; gait: Clip = 'walk'; idleClip: Clip = 'idle'; prop: Mesh | null = null; hasDog = false;
  constructor(public who: Who, public female: boolean, public role: Role, public h: Human,
    public path: Path, public s: number, public dir: 1 | -1, public side: number) {}
  get root(): TransformNode { return this.h.root; }
  get meshes(): AbstractMesh[] { return this.h.meshes; }
  play(n: Clip, loop = true, speed = 1) {
    const g: AnimationGroup | undefined = this.h.anims[n] ?? this.h.anims.idle; if (!g) return;
    if (this.cur !== n) {
      const old = this.cur ? this.h.anims[this.cur] : undefined;
      g.start(loop, speed); g.setWeightForAllAnimatables(1); if (this.frozen) g.pause();
      if (old && old !== g) old.stop();
      this.cur = n;
    } else g.speedRatio = speed;
  }
  head() { return this.pos.add(new Vector3(0, this.seat ? 1.45 : this.h.def.kind === 'child' ? 1.6 : 2.0, 0)); }
  frozen = false;
  /** weit weg: Animation anhalten (spart Rechenzeit), in der Nähe weiterlaufen lassen */
  setFrozen(f: boolean) { if (f === this.frozen) return; this.frozen = f; const g = this.cur ? this.h.anims[this.cur] : undefined; if (g) { if (f) g.pause(); else g.play(true); } }
  setVisible(v: boolean) { if (this.root.isEnabled() !== v) { this.root.setEnabled(v); if (!v) { for (const a of Object.values(this.h.anims)) a?.stop(); this.cur = ''; } } }
}

export class People {
  list: Person[] = []; lib: HumanLibrary; dogs: Dogs; private cupMat: PBRMaterial; private paperMat: PBRMaterial; private r = rng(77); private smp: Sample = { x: 0, y: 0, z: 0, dx: 0, dz: 1 };
  private chatClock = 0; barkClock = 0;
  /** vom Leistungs-Manager gesteuert */ viewDist = 140; animDist = 90; maxActive = 999;
  onKnock?: (p: Person) => void;
  constructor(scene: Scene, private net: Network, private dlg: Dialogue, private bubbles: Bubbles, private count: number, private seatCount: number) {
    this.lib = new HumanLibrary(scene); this.dogs = new Dogs(scene);
    this.cupMat = new PBRMaterial('becher', scene); this.cupMat.albedoColor = new Color3(0.93, 0.9, 0.84); this.cupMat.metallic = 0; this.cupMat.roughness = 0.5;
    this.paperMat = new PBRMaterial('zeitung', scene); this.paperMat.albedoColor = new Color3(0.86, 0.85, 0.8); this.paperMat.metallic = 0; this.paperMat.roughness = 0.9; this.paperMat.backFaceCulling = false;
  }
  /** erst eine kleine, gemischte Auswahl laden (schneller Start), den Rest später mit loadRest() */
  async load(onProgress?: (f: number) => void) {
    const first = ['Business_Male_02', 'Business_Female_02', 'Male_Adult_01', 'Female_Adult_01', 'Female_Adult_05', 'Sports_Female_02', 'Male_Child_01'];
    await Promise.all([this.lib.load(AVATARS.filter(d => first.includes(d.name)), onProgress), this.dogs.load().catch(e => console.warn('Hunde', e))]);
  }
  /** restliche Figuren im Hintergrund nachladen und zusätzliche Menschen in die Welt setzen */
  async loadRest(where: () => Vector3, extra: number) {
    await this.lib.load(AVATARS, undefined, true);
    for (const p of this.list) this.lib.upgrade(p.h); // Kaffee- und Zeitungs-Clips nachrüsten
    const c = this.count; this.count = extra; const p = where(); this.spawnWalkers(p.x, p.z, 60, 150); this.count = c;
  }

  private pickDef(role: Role): AvatarDef {
    const of = (f: (d: AvatarDef) => boolean) => { let l = AVATARS.filter(d => f(d) && this.lib.has(d.name)); if (!l.length) l = AVATARS.filter(d => this.lib.has(d.name) && d.kind !== 'child'); return l[Math.floor(this.r() * l.length)]; };
    if (role === 'jogger') return of(d => d.kind === 'sport');
    if (role === 'kid') return of(d => d.kind === 'child');
    if (role === 'commuter') return of(d => d.kind === 'business');
    return of(d => d.kind === 'adult' || (role === 'sitter' && d.kind === 'business'));
  }
  private make(role: Role, at: [Path, number]): Person | null {
    const def = this.pickDef(role), h = this.lib.spawn(def); if (!h) return null;
    const who: Who = { name: role === 'kid' ? this.dlg.d.names.kid[Math.floor(this.r() * this.dlg.d.names.kid.length)] : this.dlg.name(def.female, this.r()), pers: this.dlg.persOf(this.r()),
      role: role === 'kid' ? 'kid' : role === 'jogger' ? 'jogger' : role === 'commuter' ? (this.r() < 0.5 ? 'commuter' : 'worker') : this.dlg.roleOf(this.r()) };
    const p = new Person(who, def.female, role, h, at[0], at[1], this.r() < 0.5 ? 1 : -1, this.sideFor(at[0]));
    p.gait = role === 'jogger' ? 'jog' : role === 'kid' ? (this.r() < 0.6 ? 'jog' : 'walk') : role === 'commuter' ? 'walkFast' : this.r() < 0.3 ? 'stroll' : 'walk';
    p.speed = (CLIP_SPEED[p.gait] ?? 1.3) * (0.92 + this.r() * 0.16); if (role === 'kid' && p.gait === 'jog') p.speed = 2.4;
    p.t = -this.r() * 10;
    return p;
  }

  /** Menschen rund um (x, z) verteilen: Fußgänger, Pendler, Jogger, Kinder und Leute auf Bänken und im Café */
  spawn(x: number, z: number) {
    this.spawnWalkers(x, z, 4, 150);
    this.spawnSitters(x, z);
  }
  private spawnWalkers(x: number, z: number, r0: number, r1: number) {
    for (let i = 0; i < this.count; i++) {
      const at = this.net.pick(x, z, r0, r1, this.r, p => p.walk); if (!at) continue;
      const u = this.r(), role: Role = u < 0.18 ? 'commuter' : u < 0.28 ? 'jogger' : u < 0.4 ? 'kid' : 'walker';
      const p = this.make(role, at); if (!p) continue; this.place(p, 1); this.sync(p); this.list.push(p);
      // Gassigeher: jeder 7. Spaziergänger hat einen Hund und schlendert
      if (role === 'walker' && this.r() < 0.15) { p.hasDog = true; p.gait = 'stroll'; p.speed = CLIP_SPEED.stroll! * 0.95; p.who.role = 'family'; this.dogs.attach(p, this.dogs.list.length); }
    }
  }
  private spawnSitters(x: number, z: number) {
    for (let i = 0; i < this.seatCount; i++) {
      const at = this.net.pick(x, z, 4, 150, this.r, p => p.walk); if (!at) break;
      const p = this.make('sitter', at); if (!p) continue; this.list.push(p);
      if (!this.sitDown(p, x, z)) { p.role = 'walker'; this.place(p, 1); } this.sync(p);
    }
  }
  /** freien Sitzplatz in der Nähe nehmen */
  private sitDown(p: Person, x: number, z: number) {
    const free = seats.filter(s => !s.taken && Math.hypot(s.x - x, s.z - z) < 170);
    if (!free.length) return false;
    const s = free[Math.floor(this.r() * free.length)];
    if (p.seat) p.seat.taken = false; s.taken = true; p.seat = s; p.state = 'sit'; p.pos.set(s.x, s.y, s.z); p.yaw = s.yaw + FACING; return true;
  }

  private sideFor(q: Path) { return q.foot ? (this.r() - 0.5) * 0.8 : (q.hw + 1.2) * (this.r() < 0.5 ? 1 : -1); }
  private place(p: Person, dt: number) {
    const q = this.net.sample(p.path, p.s, p.dir, p.side * p.dir, this.smp);
    p.pos.set(q.x, q.y + 0.1, q.z); this.turn(p, Math.atan2(q.dx, q.dz), dt);
  }
  private turn(p: Person, want: number, dt: number) {
    let d = want - p.yaw; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; p.yaw += d * Math.min(1, dt * 5);
  }
  private advance(p: Person, v: number, dt: number) {
    p.s += p.dir * v * dt;
    if (p.s < 0 || p.s > p.path.len) {
      const [q, dir, s] = this.net.next(p.path, p.dir, this.r(), x => x.walk, false);
      p.path = q; p.dir = dir; p.s = s; p.side = q.foot ? (this.r() - 0.5) * 0.8 : (Math.sign(p.side) || 1) * (q.hw + 1.2);
    }
    this.place(p, dt);
  }
  private sync(p: Person) {
    p.root.position.copyFrom(p.pos);
    // umfallen: um die Querachse kippen (nach hinten), Wurzel liegt an den Füßen
    p.root.rotationQuaternion = Quaternion.FromEulerAngles(0, p.yaw, 0).multiply(Quaternion.FromEulerAngles(-p.tilt * Math.PI / 2, 0, 0));
    if (p.tilt > 0) p.root.position.y += p.tilt * 0.12;
  }

  /** nächster ansprechbarer Mensch (waagrechter Abstand) */
  nearest(pos: Vector3, max: number): Person | null {
    let best: Person | null = null, bd = max;
    for (const p of this.list) { if (!p.root.isEnabled() || p.state === 'down' || p.state === 'up') continue; const d = Math.hypot(pos.x - p.pos.x, pos.z - p.pos.z); if (d < bd && Math.abs(pos.y - p.pos.y) < 3) { bd = d; best = p; } }
    return best;
  }

  /** Blitz: trifft den Menschen vor Blëtz (oder ganz nah), andere laufen weg */
  zap(from: Vector3, fwd: Vector3): Person | null {
    let best: Person | null = null, score = 1e9;
    for (const p of this.list) {
      if (!p.root.isEnabled() || p.state === 'down' || p.state === 'up') continue;
      const d = p.pos.subtract(from); d.y = 0; const L = d.length(); if (L > 10) continue;
      const cos = L > 0.01 ? Vector3.Dot(d.scale(1 / L), fwd) : 1; if (cos < 0.35 && L > 2.5) continue;
      const sc = L * (2 - cos); if (sc < score) { score = sc; best = p; }
    }
    if (best) this.knock(best, from);
    return best;
  }
  /** Becher (rechte Hand) oder Zeitung (zwischen beiden Händen) an die Hände der Figur setzen */
  private bone(p: Person, re: RegExp) { for (const [k, n] of p.h.nodes) if (re.test(k)) return n as TransformNode; return null; }
  private holdProp(p: Person) {
    const coffee = p.state === 'coffee';
    if (!p.prop || p.prop.name !== (coffee ? 'becher' : 'zeitung')) {
      p.prop?.dispose();
      p.prop = coffee ? MeshBuilder.CreateCylinder('becher', { diameterTop: 0.085, diameterBottom: 0.065, height: 0.11, tessellation: 12 }, this.cupMat.getScene())
        : MeshBuilder.CreateBox('zeitung', { width: 0.06, height: 0.3, depth: 0.22 }, this.cupMat.getScene()); // gefaltete Zeitung
      p.prop.material = coffee ? this.cupMat : this.paperMat; p.prop.isPickable = false;
    }
    p.prop.setEnabled(true);
    const rh = this.bone(p, /^Bip_R_Hand$/), rf = this.bone(p, /^Bip_R_Finger2$/), lh = this.bone(p, /^Bip_L_Hand$/), head = this.bone(p, /^Bip_Head$/);
    if (!rh || !lh || !head) return;
    if (coffee) { const a = rh.getAbsolutePosition(), b = rf ? rf.getAbsolutePosition() : a; p.prop.position.copyFrom(Vector3.Lerp(a, b, 0.6)); p.prop.rotationQuaternion = null; p.prop.rotation.set(0, 0, 0); }
    else { const a = rh.getAbsolutePosition(), b = rf ? rf.getAbsolutePosition() : a; p.prop.position.copyFrom(Vector3.Lerp(a, b, 0.8)); p.prop.rotationQuaternion = null; p.prop.rotation.set(0, p.yaw, 0); }
  }
  knock(p: Person, from: Vector3) {
    if (p.prop) p.prop.setEnabled(false);
    if (p.partner) { p.partner.partner = null; p.partner.state = 'walk'; p.partner = null; }
    if (p.seat) { p.seat.taken = false; p.seat = null; }
    p.state = 'down'; p.t = 4 + this.r() * 2; p.shocked++; p.play('idle', true, 0.3);
    this.bubbles.say(p, this.dlg.line(p.shocked > 1 ? 'reshock' : 'shock', p.who, 12), () => p.head(), 3.5);
    this.scare(from, 22, p); this.onKnock?.(p);
  }
  scare(from: Vector3, radius: number, except?: Person) {
    for (const q of this.list) {
      if (q === except || q.state === 'down' || q.state === 'up' || !q.root.isEnabled() || Vector3.Distance(q.pos, from) > radius) continue;
      if (q.partner) q.partner = null;
      if (q.seat) { q.seat.taken = false; q.seat = null; }
      if (q.prop) q.prop.setEnabled(false);
      q.state = 'flee'; q.t = 5 + this.r() * 3; q.fleeFrom.copyFrom(from);
      const ahead = this.net.sample(q.path, q.s + q.dir * 3, q.dir, q.side * q.dir, { x: 0, y: 0, z: 0, dx: 0, dz: 0 });
      if (Math.hypot(ahead.x - from.x, ahead.z - from.z) < Vector3.Distance(q.pos, from)) q.dir = (q.dir === 1 ? -1 : 1);
    }
  }

  update(dt: number, player: Vector3, hour: number, heat: number) {
    this.chatClock -= dt; this.barkClock -= dt;
    for (let idx = 0; idx < this.list.length; idx++) {
      const p = this.list[idx];
      const d = Vector3.Distance(p.pos, player);
      // weit weg: in die Nähe von Blëtz versetzen (Sitzende auf einen freien Platz)
      if (d > 230) {
        p.partner = null; p.tilt = 0;
        if (p.role === 'sitter' && this.sitDown(p, player.x, player.z)) { /* sitzt */ }
        else { const at = this.net.pick(player.x, player.z, 90, 180, this.r, q => q.walk); if (at) { if (p.seat) { p.seat.taken = false; p.seat = null; } p.path = at[0]; p.s = at[1]; p.side = this.sideFor(at[0]); p.state = 'walk'; this.place(p, 1); } }
      }
      const vis = d < this.viewDist && idx < this.maxActive; p.setVisible(vis); if (!vis) continue;
      p.setFrozen(d > this.animDist);
      p.t -= dt; p.bark -= dt;
      const gaitRatio = (v: number) => v / (CLIP_SPEED[p.gait] ?? 1.3);
      switch (p.state) {
        case 'walk':
          this.advance(p, p.speed, dt); p.play(p.gait, true, gaitRatio(p.speed));
          if (p.t > 0 && this.r() < dt * 0.05) {
            if (p.role === 'commuter' && this.r() < 0.6) { p.state = 'phone'; p.t = 4 + this.r() * 6; }
            else if (p.role === 'walker' && !p.hasDog && p.h.anims.drink && this.r() < 0.3) { p.state = this.r() < 0.55 ? 'coffee' : 'paper'; p.t = 6 + this.r() * 8; }
            else if (p.role !== 'jogger') { p.state = 'idle'; p.t = 2 + this.r() * 4; p.idleClip = p.role === 'kid' ? 'cheer' : this.r() < 0.5 ? 'look' : 'idle'; }
          }
          if (d < 4.5 && p.bark <= 0 && this.barkClock <= 0) {
            const cat = heat >= 2 || p.shocked ? 'wary' : this.r() < 0.4 ? 'cute' : this.r() < 0.5 ? 'hero' : p.met ? 'amb' : 'greet';
            this.bubbles.say(p, this.dlg.line(cat, p.who, hour), () => p.head()); p.bark = 25; this.barkClock = 2.5;
            if (cat === 'greet' || cat === 'cute') { p.state = 'idle'; p.t = 2.4; p.idleClip = 'idle'; p.play('wave', false); }
          }
          break;
        case 'idle':
          if (!p.h.anims.wave?.isPlaying) p.play(p.idleClip);
          this.place(p, dt); if (p.t <= 0) { p.state = 'walk'; p.t = 3; }
          break;
        case 'phone':
          p.play('phone'); if (p.t <= 0) { p.state = 'walk'; p.t = 5; }
          break;
        case 'coffee': case 'paper':
          p.play(p.state === 'coffee' ? 'drink' : 'paper'); this.holdProp(p);
          if (p.t <= 0) { p.state = 'walk'; p.t = 6; if (p.prop) p.prop.setEnabled(false); }
          break;
        case 'talk':
          p.play(p.seat ? (p.seat.kind === 'cafe' ? 'sitTable' : 'sitBench') : p.mood !== 0 ? 'talk' : 'idle'); if (!p.seat) this.turn(p, Math.atan2(player.x - p.pos.x, player.z - p.pos.z), dt);
          if (d > 6) { p.state = p.seat ? 'sit' : 'walk'; p.t = 3; }
          break;
        case 'chat':
          p.play(p.t % 4 < 2.4 ? 'talk' : 'idle');
          if (p.partner) this.turn(p, Math.atan2(p.partner.pos.x - p.pos.x, p.partner.pos.z - p.pos.z), dt);
          if (p.t <= 0) { p.state = 'walk'; p.t = 4; if (p.partner) p.partner.partner = null; p.partner = null; }
          break;
        case 'sit':
          p.play(p.seat?.kind === 'cafe' ? 'sitTable' : 'sitBench');
          if (d < 4 && p.bark <= 0 && this.barkClock <= 0) { this.bubbles.say(p, this.dlg.line(heat >= 2 ? 'wary' : this.r() < 0.5 ? 'cute' : 'amb', p.who, hour), () => p.head()); p.bark = 30; this.barkClock = 2.5; }
          break;
        case 'flee':
          p.gait = 'run'; this.advance(p, 4.6, dt); p.play('run', true, 1); if (p.t <= 0) { p.state = 'walk'; p.t = 4; p.gait = p.role === 'jogger' ? 'jog' : 'walk'; }
          break;
        case 'down':
          p.tilt = Math.min(1, p.tilt + dt * 3.5);
          if (p.t <= 0) { p.state = 'up'; p.t = 3; }
          break;
        case 'up':
          p.tilt = Math.max(0, p.tilt - dt * 2); p.play('shake'); p.mood = -1;
          if (p.t <= 0) { p.state = 'walk'; p.t = 4; }
          break;
      }
      if (p.prop && p.state !== 'coffee' && p.state !== 'paper' && p.prop.isEnabled()) p.prop.setEnabled(false);
      this.sync(p);
    }
    this.dogs.update(dt);
    // zwei Fußgänger treffen sich und plaudern
    if (this.chatClock <= 0) {
      this.chatClock = 1;
      const near = this.list.filter(p => p.root.isEnabled() && p.state === 'walk' && p.role !== 'jogger' && !p.hasDog && Vector3.Distance(p.pos, player) < 60);
      for (let i = 0; i < near.length; i++) for (let j = i + 1; j < near.length; j++) {
        const a = near[i], b = near[j]; if (a.state !== 'walk' || b.state !== 'walk' || Vector3.Distance(a.pos, b.pos) > 2.6 || this.r() > 0.35) continue;
        a.state = b.state = 'chat'; a.t = b.t = 7 + this.r() * 3; a.partner = b; b.partner = a;
        const c = this.dlg.convo();
        c.forEach((l, k) => setTimeout(() => { const who = k % 2 ? b : a; if (who.state === 'chat') this.bubbles.say(who, l, () => who.head(), 2.6); }, k * 2300));
      }
    }
  }
  casters() { return [...this.list.flatMap(p => p.meshes), ...this.dogs.list.flatMap(d => d.meshes)]; }
}
