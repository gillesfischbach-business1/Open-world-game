import { Mesh, VertexData, type Material, type Scene } from '@babylonjs/core';

/** Sammelt Dreiecke und erzeugt daraus ein einziges Mesh (wenige Zeichenaufrufe = schnell). */
export class GeoBuilder {
  pos: number[] = []; nor: number[] = []; uv: number[] = []; idx: number[] = [];
  get count() { return this.pos.length / 3; }
  vert(x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, v: number) {
    this.pos.push(x, y, z); this.nor.push(nx, ny, nz); this.uv.push(u, v); return this.count - 1;
  }
  // Rechtshändiges System: Vorderseite = Uhrzeigersinn aus Babylon-Sicht → Reihenfolge a,c,b
  tri(a: number, b: number, c: number) { this.idx.push(a, c, b); }
  /** Viereck a-b-c-d (gegen den Uhrzeigersinn von außen gesehen) mit flacher Normale */
  quad(p: number[][], uv: number[][]) {
    const [a, b, c] = p, ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L;
    const i = p.map((q, k) => this.vert(q[0], q[1], q[2], nx, ny, nz, uv[k][0], uv[k][1]));
    this.tri(i[0], i[1], i[2]); this.tri(i[0], i[2], i[3]);
  }
  /** Viereck, dessen sichtbare Seite nach oben zeigt (Straßen, Gehwege, Markierungen) */
  quadUp(p: number[][], uv: number[][]) {
    const [a, b, c] = p, ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    if (ny >= 0) this.quad(p, uv); else this.quad([p[1], p[0], p[3], p[2]], [uv[1], uv[0], uv[3], uv[2]]);
  }
  /** Viereck, dessen sichtbare Seite nach unten zeigt (Unterseite von Gesimsen) */
  quadDown(p: number[][], uv: number[][]) {
    const [a, b, c] = p, ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    if (ny < 0) this.quad(p, uv); else this.quad([p[1], p[0], p[3], p[2]], [uv[1], uv[0], uv[3], uv[2]]);
  }
  /** Quader ohne Boden (Dachaufbauten); Seiten nach außen */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) {
    const X = [x0, x1], Z = [z0, z1];
    this.quadUp([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], [[0, 0], [1, 0], [1, 1], [0, 1]]);
    const side = (ax: number, az: number, bx: number, bz: number, ox: number, oz: number) => {
      const q = [[ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az]], uv = [[0, 0], [1, 0], [1, 1], [0, 1]];
      const e = [bx - ax, bz - az], n = [e[1], -e[0]]; // Normale der Reihenfolge a→b nach oben gestellt
      if (n[0] * ox + n[1] * oz < 0) this.quad(q, uv); else this.quad([q[1], q[0], q[3], q[2]], uv);
    };
    side(X[0], Z[0], X[1], Z[0], 0, -1); side(X[1], Z[1], X[0], Z[1], 0, 1); side(X[0], Z[1], X[0], Z[0], -1, 0); side(X[1], Z[0], X[1], Z[1], 1, 0);
  }
  build(name: string, scene: Scene, mat: Material, opts: { normals?: boolean } = {}): Mesh | null {
    if (!this.idx.length) return null;
    const vd = new VertexData(); vd.positions = this.pos; vd.indices = this.idx; vd.uvs = this.uv;
    if (opts.normals) { const n: number[] = []; VertexData.ComputeNormals(this.pos, this.idx, n); vd.normals = n; } else vd.normals = this.nor;
    const m = new Mesh(name, scene); vd.applyToMesh(m, false); m.material = mat; m.freezeWorldMatrix(); m.isPickable = false;
    return m;
  }
}
