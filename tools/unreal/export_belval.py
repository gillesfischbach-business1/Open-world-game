#!/usr/bin/env python3
"""Exportiert Belval (public/data/world.json, OpenStreetMap, ODbL) für Unreal Engine 5.

Ergebnis in unreal/Import/ (per Drag & Drop in den Unreal-Inhaltsbrowser ziehen):
  belval_gelaende.glb   Geländeoberfläche (Gitter 8 m), Grünflächen eingefärbt
  belval_gebaeude.glb   alle Gebäude: Wände je Fassadenart + Dächer (UV in Metern -> Kachel-Materialien)
  belval_strassen.glb   Fahrbahnen, Gehwege, Fußwege (leicht über dem Gelände)
  belval_daten.json     Orte, Straßen-Mittellinien (für Verkehr/KI), Bänke, Cafés, Haltestellen

Koordinaten: glTF-Norm (Meter, Y oben, X = Osten, Z = Süden) – Unreal rechnet beim Import selbst in cm / Z-oben um.
Nur Standardbibliothek + numpy. Aufruf: python3 tools/unreal/export_belval.py
"""
import json, os, struct, math, zlib
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
W = json.load(open(os.path.join(ROOT, 'public/data/world.json')))
OUT = os.path.join(ROOT, 'unreal/Import'); os.makedirs(OUT, exist_ok=True)
T = W['terrain']; H = np.array(T['h'], dtype=np.float64).reshape(T['nz'], T['nx']) + T.get('ofs', 0)


def height(x, z):
    fx, fz = (x - T['x0']) / T['step'], (z - T['z0']) / T['step']
    i = min(T['nx'] - 2, max(0, int(math.floor(fx)))); j = min(T['nz'] - 2, max(0, int(math.floor(fz))))
    u = min(1, max(0, fx - i)); v = min(1, max(0, fz - j))
    return (H[j, i] * (1 - u) + H[j, i + 1] * u) * (1 - v) + (H[j + 1, i] * (1 - u) + H[j + 1, i + 1] * u) * v


class Prim:
    """Sammelt Dreiecke für ein Material."""
    def __init__(self, name): self.name, self.p, self.n, self.uv, self.i = name, [], [], [], []
    def vert(self, p, n, uv): self.p.append(p); self.n.append(n); self.uv.append(uv); return len(self.p) - 1
    def tri(self, a, b, c): self.i += [a, b, c]
    def quad(self, ps, n, uvs):
        k = [self.vert(p, n, uv) for p, uv in zip(ps, uvs)]; self.tri(k[0], k[1], k[2]); self.tri(k[0], k[2], k[3])


def write_glb(path, prims, mesh_name):
    """Minimaler glTF-2.0-Schreiber: ein Mesh, eine Primitive je Material (32-bit-Indizes)."""
    prims = [p for p in prims if p.i]
    buf, views, accs, gprims, mats = bytearray(), [], [], [], []
    def add(arr, target, comp, typ, minmax=False):
        nonlocal buf
        while len(buf) % 4: buf += b'\0'
        b = arr.tobytes(); views.append({'buffer': 0, 'byteOffset': len(buf), 'byteLength': len(b), 'target': target}); buf += b
        a = {'bufferView': len(views) - 1, 'componentType': comp, 'count': int(arr.shape[0]), 'type': typ}
        if minmax: a['min'] = arr.min(0).tolist(); a['max'] = arr.max(0).tolist()
        accs.append(a); return len(accs) - 1
    for k, pr in enumerate(prims):
        P = np.array(pr.p, np.float32); N = np.array(pr.n, np.float32); N /= np.maximum(1e-9, np.linalg.norm(N, axis=1))[:, None]
        UV = np.array(pr.uv, np.float32); I = np.array(pr.i, np.uint32)
        attrs = {'POSITION': add(P, 34962, 5126, 'VEC3', True), 'NORMAL': add(N, 34962, 5126, 'VEC3'), 'TEXCOORD_0': add(UV, 34962, 5126, 'VEC2')}
        gprims.append({'attributes': attrs, 'indices': add(I, 34963, 5125, 'SCALAR'), 'material': k})
        mats.append({'name': pr.name, 'pbrMetallicRoughness': {'baseColorFactor': [0.8, 0.8, 0.8, 1], 'metallicFactor': 0, 'roughnessFactor': 0.9}, 'doubleSided': pr.name == 'Dach'})
    while len(buf) % 4: buf += b'\0'
    g = {'asset': {'version': '2.0', 'generator': 'Letz export_belval.py', 'copyright': 'Daten: OpenStreetMap-Mitwirkende, ODbL'},
         'scene': 0, 'scenes': [{'nodes': [0]}], 'nodes': [{'name': mesh_name, 'mesh': 0}],
         'meshes': [{'name': mesh_name, 'primitives': gprims}], 'materials': mats,
         'buffers': [{'byteLength': len(buf)}], 'bufferViews': views, 'accessors': accs}
    js = json.dumps(g, separators=(',', ':')).encode(); js += b' ' * ((4 - len(js) % 4) % 4)
    with open(path, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(buf)))
        f.write(struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(buf), 0x004E4942) + buf)
    return sum(len(p.i) // 3 for p in prims)


def area2(f):  # doppelte Fläche (Vorzeichen = Umlaufsinn)
    return sum(f[j] * f[i + 1] - f[i] * f[j + 1] for i, j in zip(range(0, len(f), 2), list(range(2, len(f), 2)) + [0]))


def earclip(f):
    """Dreiecksteilung eines einfachen Polygons (Ohrenschneiden). Liefert Indexdreiecke."""
    n = len(f) // 2; pts = [(f[2 * k], f[2 * k + 1]) for k in range(n)]
    idx = list(range(n)) if area2(f) > 0 else list(range(n))[::-1]
    def cross(o, a, b): return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    def inside(p, a, b, c): return cross(a, b, p) >= 0 and cross(b, c, p) >= 0 and cross(c, a, p) >= 0
    out, guard = [], 0
    while len(idx) > 3 and guard < 10 * n:
        guard += 1; m = len(idx); cut = False
        for k in range(m):
            ia, ib, ic = idx[k - 1], idx[k], idx[(k + 1) % m]; a, b, c = pts[ia], pts[ib], pts[ic]
            if cross(a, b, c) <= 1e-9: continue
            if any(inside(pts[o], a, b, c) for o in idx if o not in (ia, ib, ic)): continue
            out.append((ia, ib, ic)); idx.pop(k); cut = True; break
        if not cut: break
    if len(idx) == 3: out.append(tuple(idx))
    return out


def style(name, h):
    n = (name or '').lower()
    if any(s in n for s in ('hochofen', 'haut fourneau', 'massenoire', 'rockhal')): return 'Fassade_Rost'
    if h > 30: return 'Fassade_Glas'
    if h > 14: return 'Fassade_Platten'
    return 'Fassade_Putz' if zlib.crc32((name or '').encode()) % 3 else 'Fassade_Ziegel'  # stabil über Läufe


# ---------------- Gelände ----------------
def terrain():
    pr = Prim('Gelaende'); nx, nz, s = T['nx'], T['nz'], T['step']
    for j in range(nz):
        for i in range(nx):
            x, z = T['x0'] + i * s, T['z0'] + j * s
            dx = (H[j, min(i + 1, nx - 1)] - H[j, max(i - 1, 0)]) / (2 * s); dz = (H[min(j + 1, nz - 1), i] - H[max(j - 1, 0), i]) / (2 * s)
            pr.vert((x, H[j, i], z), (-dx, 1, -dz), (x, z))
    for j in range(nz - 1):
        for i in range(nx - 1):
            a = j * nx + i; b, c, d = a + 1, a + nx, a + nx + 1
            pr.tri(a, c, b); pr.tri(b, c, d)  # Normalen nach oben (rechtshändig, Z = Süden)
    return write_glb(os.path.join(OUT, 'belval_gelaende.glb'), [pr], 'Gelaende')


# ---------------- Gebäude ----------------
def buildings():
    prims = {}; roof = Prim('Dach')
    for bid, name, hraw, ring in W['B']:
        if not ring or len(ring) < 6: continue
        n = len(ring) // 2; base = min(height(ring[2 * k], ring[2 * k + 1]) for k in range(n)); hgt = max(3.5, hraw); top = base + hgt
        pr = prims.setdefault(style(name, hgt), Prim(style(name, hgt)))
        ccw = area2(ring) > 0; u0 = 0.0
        for k in range(n):
            ax, az, bx, bz = ring[2 * k], ring[2 * k + 1], ring[(2 * k + 2) % (2 * n)], ring[(2 * k + 3) % (2 * n)]
            L = math.hypot(bx - ax, bz - az)
            if L < 0.05: continue
            nxv, nzv = -(bz - az) / L, (bx - ax) / L  # Außennormale (geprüft: zeigt bei allen Wänden nach außen)
            if not ccw: nxv, nzv = -nxv, -nzv
            q = [(ax, base - 1, az), (bx, base - 1, bz), (bx, top, bz), (ax, top, az)]; uv = [(u0, 1), (u0 + L, 1), (u0 + L, -hgt), (u0, -hgt)]
            # Wicklung so, dass die Vorderseite nach außen zeigt
            e = np.array([bx - ax, 0, bz - az]); fn = np.cross(e, [0, 1, 0])
            if fn[0] * nxv + fn[2] * nzv > 0: pr.quad(q, (nxv, 0, nzv), uv)
            else: pr.quad([q[1], q[0], q[3], q[2]], (nxv, 0, nzv), [uv[1], uv[0], uv[3], uv[2]])
            u0 += L
        b0 = len(roof.p)
        for k in range(n): roof.vert((ring[2 * k], top, ring[2 * k + 1]), (0, 1, 0), (ring[2 * k], ring[2 * k + 1]))
        for a, b, c in earclip(ring):
            # Dreieck nach oben ausrichten
            pa, pb, pc = (np.array(roof.p[b0 + t]) for t in (a, b, c))
            if np.cross(pb - pa, pc - pa)[1] > 0: roof.tri(b0 + a, b0 + b, b0 + c)
            else: roof.tri(b0 + a, b0 + c, b0 + b)
    return write_glb(os.path.join(OUT, 'belval_gebaeude.glb'), list(prims.values()) + [roof], 'Gebaeude')


# ---------------- Straßen ----------------
def ribbon(pr, pts, hw, lift):
    """Band entlang einer Mittellinie (x,z-Paare) mit halber Breite hw."""
    if len(pts) < 2: return
    acc = 0.0; prev = None
    for k, (x, z) in enumerate(pts):
        a = pts[max(0, k - 1)]; b = pts[min(len(pts) - 1, k + 1)]; dx, dz = b[0] - a[0], b[1] - a[1]; L = math.hypot(dx, dz) or 1
        nx_, nz_ = -dz / L * hw, dx / L * hw
        if k: acc += math.hypot(x - pts[k - 1][0], z - pts[k - 1][1])
        l = pr.vert((x + nx_, height(x + nx_, z + nz_) + lift, z + nz_), (0, 1, 0), (0, acc))
        r = pr.vert((x - nx_, height(x - nx_, z - nz_) + lift, z - nz_), (0, 1, 0), (2 * hw, acc))
        if prev:
            pl, prr = prev
            # oben sichtbar: Umlauf so wählen, dass die Normale nach oben zeigt
            P = lambda q: np.array(pr.p[q])
            if np.cross(P(prr) - P(pl), P(l) - P(pl))[1] > 0: pr.tri(pl, prr, l); pr.tri(prr, r, l)
            else: pr.tri(pl, l, prr); pr.tri(prr, l, r)
        prev = (l, r)


def roads():
    road, walk, path = Prim('Fahrbahn'), Prim('Gehweg'), Prim('Fussweg')
    for rd in W['roads']:
        if rd.get('tu'): continue
        pts = [(rd['p'][i], rd['p'][i + 1]) for i in range(0, len(rd['p']) - 2, 3)]
        lift = 0.06 + (rd['p'][2] if rd.get('br') else 0)
        ribbon(road, pts, rd['hw'], lift)
        if rd['hw'] >= 2.2 and not rd.get('br'):
            for side in (1, -1):  # Gehwege beidseitig
                off = []
                for k, (x, z) in enumerate(pts):
                    a = pts[max(0, k - 1)]; b = pts[min(len(pts) - 1, k + 1)]; dx, dz = b[0] - a[0], b[1] - a[1]; L = math.hypot(dx, dz) or 1
                    o = side * (rd['hw'] + 1.1); off.append((x - dz / L * o, z + dx / L * o))
                ribbon(walk, off, 1.0, 0.12)
    for _, f in W['PA']:
        ribbon(path, [(f[i], f[i + 1]) for i in range(0, len(f), 2)], 1.1, 0.05)
    return write_glb(os.path.join(OUT, 'belval_strassen.glb'), [road, walk, path], 'Strassen')


def data():
    out = {
        'quelle': 'OpenStreetMap-Mitwirkende (ODbL), aufbereitet für Lëtz Adventures',
        'koordinaten': 'Meter; x = Osten, z = Süden, y = oben (glTF). Unreal: beim Import automatisch in cm.',
        'ursprung_gps': W['origin'],
        'orte': [{'name': p[0], 'gebaeude': p[1], 'x': p[2], 'z': p[3], 'y': round(height(p[2], p[3]), 2)} for p in W['P']],
        'strassen': [{'name': r.get('nm'), 'typ': r['t'], 'halbe_breite': r['hw'], 'einbahn': bool(r['ow']), 'tempo': r['vmax'],
                      'punkte': [[r['p'][i], round(height(r['p'][i], r['p'][i + 1]), 2), r['p'][i + 1]] for i in range(0, len(r['p']) - 2, 3)]}
                     for r in W['roads'] if not r.get('tu')],
        'baenke': W['osm']['pts'].get('bench', []), 'cafes': W['osm']['pts'].get('cafe', []) + W['osm']['pts'].get('restaurant', []),
        'haltestellen': W['osm']['pts'].get('bus_stop', []),
    }
    json.dump(out, open(os.path.join(OUT, 'belval_daten.json'), 'w'), ensure_ascii=False)
    return len(out['orte']), len(out['strassen'])


if __name__ == '__main__':
    print('Gelände:', terrain(), 'Dreiecke')
    print('Gebäude:', buildings(), 'Dreiecke')
    print('Straßen:', roads(), 'Dreiecke')
    print('Orte/Straßen:', data())
    for f in sorted(os.listdir(OUT)): print(f'  {f}: {os.path.getsize(os.path.join(OUT, f)) / 1e6:.1f} MB')
