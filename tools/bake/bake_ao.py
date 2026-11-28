#!/usr/bin/env python3
"""Vorausberechnete Umgebungsverdeckung („Baking“) für Belval.

Rechnet einmal beim Bauen aus, wie viel Himmel an jedem Punkt des Bodens sichtbar ist: Häuser, Hochöfen
und Geländekanten verdecken einen Teil. Ergebnis ist ein Graustufenbild, das das Spiel als Schattenkarte
(Lightmap) auf Gelände, Straßen und Gehwege legt und für den Fuß der Hauswände nutzt.
Kostet im Spiel praktisch nichts – auch nicht auf schwachen Handys.

Verfahren: Höhenfeld (Gebäudehöhen über dem Gelände; das Gelände selbst verdeckt nicht) im 2-m-Raster; für 16 Richtungen bis 60 m Entfernung den
höchsten Horizontwinkel suchen; Sichtbarkeit = Mittel von (1 - sin(Horizont)). Danach leicht weichgezeichnet.

Aufruf: python3 tools/bake/bake_ao.py   → public/data/ao.png + public/data/ao.json
"""
import json, os, math, zlib, struct, re
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
W = json.load(open(os.path.join(ROOT, 'public/data/world.json')))
RES = 2.0            # Meter pro Bildpunkt
DIRS, REACH = 16, 60.0
STRENGTH = 0.85      # 1 = volle Verdunklung, kleiner = sanfter
FLOOR = 0.42         # dunkelster erlaubter Wert (sonst wirken enge Gassen schwarz)

a = W['area']; x0, z0 = a['x0'], a['z0']
nx = int(math.ceil((a['x1'] - x0) / RES)) + 1; nz = int(math.ceil((a['z1'] - z0) / RES)) + 1
T = W['terrain']; TH = np.array(T['h'], np.float64).reshape(T['nz'], T['nx']) + T.get('ofs', 0)

# Gelände bilinear auf das feine Raster
gx = (x0 + np.arange(nx) * RES - T['x0']) / T['step']; gz = (z0 + np.arange(nz) * RES - T['z0']) / T['step']
gx = np.clip(gx, 0, T['nx'] - 1.001); gz = np.clip(gz, 0, T['nz'] - 1.001)
i0 = np.floor(gx).astype(int); j0 = np.floor(gz).astype(int); u = gx - i0; v = gz - j0
ground = (TH[j0][:, i0] * (1 - u) + TH[j0][:, i0 + 1] * u) * (1 - v)[:, None] + (TH[j0 + 1][:, i0] * (1 - u) + TH[j0 + 1][:, i0 + 1] * u) * v[:, None]

# Gebäude einzeichnen (Punkt-in-Polygon je Zeile, nur innerhalb des Rahmens)
hf = ground.copy(); inside = np.zeros_like(ground, bool); roofed = np.zeros_like(ground, bool)
FURNACE = re.compile(r'^Haut fourneau [AB]$', re.I)
CANOPY = re.compile(r'^Belval-Université$|^Gare |Bahnsteig', re.I)  # offene Dächer (wie src/world/city.ts isCanopy)
X = x0 + np.arange(nx) * RES
for _, name, h, ring in W['B']:
    if not ring or len(ring) < 6: continue
    px, pz = np.array(ring[0::2]), np.array(ring[1::2])
    c0, c1 = max(0, int((px.min() - x0) / RES)), min(nx - 1, int((px.max() - x0) / RES) + 1)
    r0, r1 = max(0, int((pz.min() - z0) / RES)), min(nz - 1, int((pz.max() - z0) / RES) + 1)
    xs = X[c0:c1 + 1]
    for r in range(r0, r1 + 1):
        z = z0 + r * RES; hit = np.zeros(xs.shape, bool); n = len(px)
        for k in range(n):
            xi, zi, xj, zj = px[k], pz[k], px[k - 1], pz[k - 1]
            if (zi > z) != (zj > z):
                xc = (xj - xi) * (z - zi) / (zj - zi) + xi; hit ^= xs < xc
        if hit.any() and CANOPY.search(name or ''): roofed[r, c0:c1 + 1] |= hit; continue
        if FURNACE.search(name or ''): break  # Hochofen ist eine offene Anlage, kein Block (src/world/furnace.ts)
        if hit.any():
            seg = hf[r, c0:c1 + 1]; base = ground[r, c0:c1 + 1].min()
            seg[hit] = np.maximum(seg[hit], base + max(3.5, h)); inside[r, c0:c1 + 1] |= hit

# Horizont-Suche
vis = np.zeros_like(ground)
steps = np.arange(RES, REACH + 1e-6, RES)
for d in range(DIRS):
    ang = 2 * math.pi * d / DIRS; dx, dz = math.cos(ang), math.sin(ang)
    best = np.zeros_like(ground)  # höchster tan(Winkel)
    for s in steps:
        ox, oz = int(round(dx * s / RES)), int(round(dz * s / RES))
        sh = np.full_like(hf, -1e9); bm = np.where(inside, hf, -1e9)  # nur Gebäude verdecken – Geländewellen erzeugten falsche dunkle Bänder
        ys = slice(max(0, -oz), nz - max(0, oz)); xs_ = slice(max(0, -ox), nx - max(0, ox))
        yd = slice(max(0, oz), nz - max(0, -oz)); xd = slice(max(0, ox), nx - max(0, -ox))
        sh[ys, xs_] = bm[yd, xd]                                # Gebäudehöhe in Richtung d im Abstand s
        best = np.maximum(best, (sh - (ground + 0.5)) / s)      # Augenhöhe knapp über Boden
    vis += 1 - np.sin(np.arctan(np.maximum(best, 0)))
vis /= DIRS

# weichzeichnen (3×3, zweimal) und auf hellen Bereich abbilden
for _ in range(2):
    p = np.pad(vis, 1, mode='edge'); vis = sum(p[1 + dy:nz + 1 + dy, 1 + dx:nx + 1 + dx] for dy in (-1, 0, 1) for dx in (-1, 0, 1)) / 9
ao = np.clip(1 - STRENGTH * (1 - vis), FLOOR, 1.0)
ao[inside] = 1.0
ao[roofed & ~inside] = np.minimum(ao[roofed & ~inside], 0.66)  # unter dem Bahnsteigdach
img = (ao * 255).round().astype(np.uint8)


def png_gray(path, a):
    h, w = a.shape
    raw = b''.join(b'\0' + a[r].tobytes() for r in range(h))
    chunk = lambda t, d: struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    open(path, 'wb').write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 0, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))


out = os.path.join(ROOT, 'public/data')
png_gray(os.path.join(out, 'ao.png'), img)
json.dump({'x0': x0, 'z0': z0, 'res': RES, 'w': nx, 'h': nz, 'note': 'Zeile 0 = z0 (Norden), Spalte 0 = x0 (Westen); Wert 255 = freier Himmel'}, open(os.path.join(out, 'ao.json'), 'w'))
print(f'ao.png {nx}×{nz} ({os.path.getsize(os.path.join(out, "ao.png")) / 1e3:.0f} kB), dunkelster Wert {ao.min():.2f}, Mittel draußen {ao[~inside].mean():.2f}')
