import {
  SceneLoader, AnimationGroup, Animation, PBRMaterial, Texture, Material, type AssetContainer, type Scene, type TransformNode,
  type AbstractMesh, type Node,
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';

/**
 * Realistische Menschen (Microsoft Rocketbox Avatar Library, MIT-Lizenz) mit Motion-Capture-Animationen.
 * Alle Avatare haben das gleiche 3ds-Max-Biped-Skelett (Bip01_… bzw. bei Kindern Bip02_…),
 * deshalb lassen sich die Animationen per Knochenname auf jede Figur übertragen.
 * Übertragen werden nur Drehungen (+ Hüfthöhe, auf die Körpergröße skaliert), damit Kinder Kinder bleiben.
 */
export interface AvatarDef { name: string; female: boolean; kind: 'adult' | 'business' | 'sport' | 'child' | 'police'; }

export const AVATARS: AvatarDef[] = [
  { name: 'Business_Male_02', female: false, kind: 'business' }, { name: 'Business_Female_02', female: true, kind: 'business' },
  { name: 'Business_Male_06', female: false, kind: 'business' }, { name: 'Business_Female_04', female: true, kind: 'business' },
  ...['01', '03', '05', '08', '10', '12', '16'].map(n => ({ name: 'Male_Adult_' + n, female: false, kind: 'adult' as const })),
  ...['01', '02', '05', '08', '11', '13'].map(n => ({ name: 'Female_Adult_' + n, female: true, kind: 'adult' as const })),
  { name: 'Sports_Female_02', female: true, kind: 'sport' }, { name: 'Sports_Male_04', female: false, kind: 'sport' },
  { name: 'Female_Child_01', female: true, kind: 'child' }, { name: 'Male_Child_01', female: false, kind: 'child' }, { name: 'Male_Child_02', female: false, kind: 'child' },
];
export const POLICE: AvatarDef = { name: 'Police_Male_01', female: false, kind: 'police' };

/** Spiel-Zustände → Animationsdatei (ohne m_/f_-Vorsilbe) */
export const CLIPS = {
  walk: 'walk_neutral_01', walkFast: 'walk_fast_01', stroll: 'walk_stroll_01', jog: 'run_slow_01', run: 'run_fast_01',
  idle: 'idle_neutral_01', look: 'idle_look_around_01', phone: 'cell_phone_textmessage', talk: 'gestic_talk_neutral_01',
  sitBench: 'sit_chair_idle_neutral_01', sitTable: 'sit_table_idle_neutral_01',
  wave: 'wave_01', cheer: 'cheer_01', shake: 'idle_shake_arms_01', drink: 'drink_drinking', paper: 'newspaper_hand_idle',
} as const;
/** große Clips, die erst im Hintergrund geladen werden */
const LATE = new Set<string>(['drink_drinking', 'newspaper_hand_idle']);
export type Clip = keyof typeof CLIPS;
/** Gehgeschwindigkeit der Animation in m/s (für passende Schrittlänge) */
export const CLIP_SPEED: Partial<Record<Clip, number>> = { walk: 1.35, walkFast: 1.75, stroll: 0.95, jog: 3.0, run: 4.6 };

const DIR = './assets/people/';
const key = (n: string) => n.replace(/^Bip\d\d/, 'Bip');
/** Höhe eines Knotens im Ruhezustand (Weltmatrizen der Datei erst berechnen) */
function restY(c: AssetContainer, pick: (n: string) => boolean) {
  for (const r of c.rootNodes) { r.computeWorldMatrix(true); for (const n of r.getDescendants(false)) (n as TransformNode).computeWorldMatrix?.(true); }
  const n = c.transformNodes.find(t => pick(t.name)); return n ? Math.abs(n.getAbsolutePosition().y) || 1 : 1;
}
const BODY = /^Bip(_(Pelvis|Spine\d?|Neck\d?|Head|[LR]_(Clavicle|UpperArm|Forearm|Hand|Finger\d+|Thigh|Calf|Foot|Toe\d+)))?$/;
const CORE = /^Bip(_(Pelvis|Spine\d?|Neck\d?|Head|[LR]_(Clavicle|UpperArm|Forearm|Hand|Thigh|Calf|Foot|Toe0)))?$/;
const isHip = (n: string) => /^Bip\d\d_Pelvis$/.test(n);

export interface Human { root: TransformNode; meshes: AbstractMesh[]; anims: Partial<Record<Clip, AnimationGroup>>; def: AvatarDef; nodes: Map<string, Node>; }

export class HumanLibrary {
  private avatars = new Map<string, AssetContainer>(); private clips = new Map<string, AssetContainer>();
  private hipH = new Map<string, number>(); private scaled = new Map<string, Animation>();
  constructor(private scene: Scene) {}

  private tex: Record<string, string[]> | null = null;
  async load(defs: AvatarDef[], onProgress?: (f: number) => void, late = false) {
    this.tex ??= await (await fetch(DIR + 'textures.json')).json();
    const clipFiles = new Set<string>();
    for (const g of ['m', 'f']) for (const c of Object.values(CLIPS)) if ((c !== CLIPS.shake || g === 'f') && (late || !LATE.has(c)) && !this.clips.has(`${g}_${c}`)) clipFiles.add(`${g}_${c}`);
    const total = defs.length + clipFiles.size; let done = 0; const tick = () => onProgress?.(++done / total);
    await Promise.all([
      ...defs.map(async d => { if (!this.avatars.has(d.name)) this.avatars.set(d.name, await this.loadAvatar(d)); tick(); }),
      ...[...clipFiles].map(async f => { try { const c = await SceneLoader.LoadAssetContainerAsync(DIR + 'anim/', f + '.glb', this.scene); for (const g of c.animationGroups) g.stop(); this.clips.set(f, c); /* Vorlagen nicht abspielen (der Lader startet sie sonst automatisch) */ } catch (e) { console.warn('Animation fehlt', f, e); } tick(); }),
    ]);
  }

  private async loadAvatar(d: AvatarDef) {
    const c = await SceneLoader.LoadAssetContainerAsync(DIR + d.name + '/', d.name + '.glb', this.scene);
    for (const g of c.animationGroups) g.stop();
    const made: Material[] = [];
    for (const m of [...c.materials]) {
      const pbr = new PBRMaterial(m.name, this.scene); pbr.metallic = 0; pbr.roughness = 0.78;
      const have = this.tex?.[d.name] ?? [];
      if (have.includes(m.name)) {
        const tex = new Texture(`${DIR}${d.name}/${m.name}.webp`, this.scene, false, true); pbr.albedoTexture = tex;
        if (have.includes(m.name + '_n')) { pbr.bumpTexture = new Texture(`${DIR}${d.name}/${m.name}_n.webp`, this.scene, false, true); pbr.bumpTexture.level = 0.8; }
        if (!/opacity/.test(m.name)) { tex.hasAlpha = false; pbr.transparencyMode = Material.MATERIAL_OPAQUE; pbr.forceDepthWrite = true; } // Haut/Kleidung undurchsichtig (sonst falsche Tiefenreihenfolge: Mundinneres über Lippen)
        if (/opacity/.test(m.name)) { tex.hasAlpha = true; pbr.useAlphaFromAlbedoTexture = true; pbr.transparencyMode = Material.MATERIAL_ALPHATEST; pbr.alphaCutOff = 0.35; pbr.backFaceCulling = false; }
      } else { // ohne Textur (z. B. Brillengläser): dunkles, leicht spiegelndes Glas
        pbr.albedoColor.set(0.05, 0.05, 0.06); pbr.roughness = 0.1; pbr.alpha = 0.55; pbr.metallic = 0.3;
      }
      for (const mesh of c.meshes) if (mesh.material === m) mesh.material = pbr;
      made.push(pbr); m.dispose();
    }
    c.materials = made;
    // Hüfthöhe für die Skalierung der Hüftbewegung
    this.hipH.set(d.name, restY(c, isHip));
    return c;
  }

  has(name: string) { return this.avatars.has(name); }
  /** später geladene Clips an eine schon vorhandene Figur hängen */
  upgrade(h: Human) {
    const g = h.def.female ? 'f' : 'm';
    for (const [clip, file] of Object.entries(CLIPS) as Array<[Clip, string]>) {
      if (h.anims[clip]) continue;
      const src = this.clips.get(`${g}_${file}`) ?? this.clips.get(`${g === 'f' ? 'm' : 'f'}_${file}`); if (!src?.animationGroups[0]) continue;
      h.anims[clip] = this.retarget(src, `${g}_${file}`, h.def, h.nodes, clip);
    }
  }
  /** Eine Figur in die Welt setzen (Größe in Metern, Füße auf y = 0 der Wurzel) */
  spawn(d: AvatarDef): Human | null {
    const c = this.avatars.get(d.name); if (!c) return null;
    const inst = c.instantiateModelsToScene(n => n, false, { doNotInstantiate: true });
    const root = inst.rootNodes[0] as TransformNode; root.scaling.setAll(0.01); // Zentimeter → Meter
    for (const g of inst.animationGroups) g.dispose();
    const nodes = new Map<string, Node>(); for (const n of root.getDescendants(false)) nodes.set(key(n.name), n);
    const anims: Partial<Record<Clip, AnimationGroup>> = {};
    const g = d.female ? 'f' : 'm';
    for (const [clip, file] of Object.entries(CLIPS) as Array<[Clip, string]>) {
      const src = this.clips.get(`${g}_${file}`) ?? this.clips.get(`${g === 'f' ? 'm' : 'f'}_${file}`); if (!src?.animationGroups[0]) continue;
      anims[clip] = this.retarget(src, `${g}_${file}`, d, nodes, clip);
    }
    const meshes = root.getChildMeshes(false);
    for (const m of meshes) { m.isPickable = false; m.receiveShadows = true; }
    return { root, meshes, anims, def: d, nodes };
  }

  private retarget(src: AssetContainer, file: string, d: AvatarDef, nodes: Map<string, Node>, clip: Clip) {
    const grp = new AnimationGroup(clip, this.scene), from = src.animationGroups[0];
    // Bezug ist die Stand-Hüfthöhe der Rocketbox-Skelette (Mann 89,5 cm, Frau 91,9 cm), nicht der erste Rahmen des Clips
    const ratio = (this.hipH.get(d.name) ?? 90) / (file.startsWith('f_') ? 91.94 : 89.52);
    for (const ta of from.targetedAnimations) {
      const k = key((ta.target as Node).name), target = nodes.get(k); if (!target) continue;
      // Nur ~22 Körperknochen animieren (Rumpf, Kopf, Arme, Beine). Finger- und Gesichtsknochen bleiben in Ruhe:
      // spart ≈ 3/4 der Animationsrechnung (auf dem Handy der größte Bremser), sichtbar nur aus nächster Nähe.
      if (!CORE.test(k)) continue;
      const prop = ta.animation.targetProperty;
      if (prop === 'scaling') continue;
      if (k === 'Bip' && prop !== 'position') continue; // Wurzel-Drehung (Achsen-Umrechnung) nicht übertragen
      if (prop === 'position') {
        if (k !== 'Bip' && k !== 'Bip_Pelvis') continue; // nur Wurzel/Hüfte bewegen, Knochenlängen bleiben
        const id = `${file}|${k}|${ratio.toFixed(3)}`; let a = this.scaled.get(id);
        if (!a) { a = ta.animation.clone(); a.setKeys(ta.animation.getKeys().map(kf => ({ ...kf, value: kf.value.scale(ratio) }))); this.scaled.set(id, a); }
        grp.addTargetedAnimation(a, target);
      } else grp.addTargetedAnimation(ta.animation, target);
    }
    grp.normalize(from.from, from.to);
    return grp;
  }
}
