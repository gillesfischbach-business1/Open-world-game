import { PhysicsRaycastResult, Vector3, type AbstractMesh, type Scene } from '@babylonjs/core';

/**
 * Schnelle Strahltests über die Physik (Havok) statt scene.pickWithRay.
 * pickWithRay prüft bei den großen, zusammengefassten Gebäude-Meshes jedes Dreieck (≈ 8 ms pro Strahl,
 * auf Handys 25–40 ms) – Havok nutzt seine Beschleunigungsstrukturen (Bruchteile einer Millisekunde).
 */
export class Rays {
  private res = new PhysicsRaycastResult(); private to = new Vector3();
  constructor(private scene: Scene) {}
  /** erster Treffer entlang dir (normiert) bis len; accept filtert nach getroffenem Mesh */
  cast(from: Vector3, dir: Vector3, len: number, accept?: (m: AbstractMesh) => boolean): { distance: number; point: Vector3 } | null {
    const pe = this.scene.getPhysicsEngine(); if (!pe) return null;
    from.addToRef(dir.scale(len), this.to);
    this.res.reset(from, this.to);
    (pe as unknown as { raycastToRef(a: Vector3, b: Vector3, r: PhysicsRaycastResult): void }).raycastToRef(from, this.to, this.res);
    if (!this.res.hasHit) return null;
    const node = this.res.body?.transformNode as AbstractMesh | undefined;
    if (accept && (!node || !accept(node))) return null;
    return { distance: Vector3.Distance(from, this.res.hitPointWorld), point: this.res.hitPointWorld.clone() };
  }
}
