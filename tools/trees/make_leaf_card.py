#!/usr/bin/env python3
"""Baut aus dem Blatt-Atlas von Poly Haven „Tree Small 02“ (CC0) eine dichte Blätterwolke (RGBA-WebP)
und eine Rinden-Textur für die prozeduralen Bäume (src/world/trees.ts).

Eingabe: Ordner mit leaves_diff.jpg, leaves_alpha.jpg, bark.jpg (1k, von api.polyhaven.com/files/tree_small_02)
Aufruf:  python3 tools/trees/make_leaf_card.py <Eingabeordner>   → public/assets/trees/
"""
import os, sys, random
import numpy as np
from PIL import Image, ImageEnhance

src = sys.argv[1]; out = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), 'public/assets/trees')
os.makedirs(out, exist_ok=True)
D = Image.open(os.path.join(src, 'leaves_diff.jpg')).convert('RGB'); A = Image.open(os.path.join(src, 'leaves_alpha.jpg')).convert('L')
rgba = D.copy(); rgba.putalpha(A.point(lambda v: 255 if v > 150 else 0))  # harte Kante, kein grauer Saum
a = np.array(A) > 128
# einzelne Blätter: zusammenhängende Flächen im linken Bereich des Atlas (Flutfüllung)
H, W = a.shape; seen = np.zeros_like(a); sprites = []
for y in range(0, H, 3):
    for x in range(0, 420, 3):
        if a[y, x] and not seen[y, x]:
            stack = [(y, x)]; seen[y, x] = True; ys = []; xs = []
            while stack:
                cy, cx = stack.pop(); ys.append(cy); xs.append(cx)
                for ny, nx in ((cy + 1, cx), (cy - 1, cx), (cy, cx + 1), (cy, cx - 1)):
                    if 0 <= ny < H and 0 <= nx < 440 and a[ny, nx] and not seen[ny, nx]: seen[ny, nx] = True; stack.append((ny, nx))
            if 2500 < len(ys) < 40000:
                y0, y1, x0, x1 = min(ys), max(ys), min(xs), max(xs)
                fill = len(ys) * 9 / max(1, (y1 - y0 + 1) * (x1 - x0 + 1))  # Flächenanteil (Schritt 3 px → ×9)
                if fill > 0.38: sprites.append(rgba.crop((x0, y0, x1 + 1, y1 + 1)))  # nur kompakte Blätter, keine Stiel-Splitter
print(len(sprites), 'Blätter ausgeschnitten')
random.seed(7)
S = 512
def cloud(n, size, seed):
    random.seed(seed); c = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    for i in range(n):
        sp = random.choice(sprites); sc = random.uniform(0.35, 0.6) * size
        sp = sp.resize((max(4, int(sp.width * sc)), max(4, int(sp.height * sc))), Image.LANCZOS).rotate(random.uniform(0, 360), expand=True, resample=Image.BICUBIC)
        rgb = sp.convert('RGB'); rgb = ImageEnhance.Brightness(rgb).enhance(random.uniform(0.7, 1.15)); rgb = ImageEnhance.Color(rgb).enhance(random.uniform(0.85, 1.2))
        sp = Image.merge('RGBA', (*rgb.split(), sp.split()[3]))
        # eher in einem runden Büschel, Ränder lockerer
        r = (random.random() ** 0.6) * (S / 2 - 40); t = random.uniform(0, 6.283)
        cx, cy = int(S / 2 + r * np.cos(t) - sp.width / 2), int(S / 2 + r * np.sin(t) - sp.height / 2)
        c.alpha_composite(sp, (max(0, min(S - sp.width, cx)), max(0, min(S - sp.height, cy))))
    return c
card = cloud(170, 1.0, 1)
# innen etwas dunkler (Selbstschatten im Laub)
arr = np.array(card).astype(np.float32); yy, xx = np.mgrid[0:S, 0:S]; d = np.hypot(xx - S / 2, yy - S / 2) / (S / 2)
arr[..., :3] *= (0.72 + 0.28 * np.clip(d, 0, 1))[..., None]
card = Image.fromarray(arr.clip(0, 255).astype(np.uint8), 'RGBA')
card.save(os.path.join(out, 'laub.webp'), 'WEBP', quality=88, method=6)
Image.open(os.path.join(src, 'bark.jpg')).convert('RGB').resize((512, 512), Image.LANCZOS).save(os.path.join(out, 'rinde.webp'), 'WEBP', quality=85, method=6)
print('gespeichert in', out, [f'{f}: {os.path.getsize(os.path.join(out, f)) // 1024} kB' for f in os.listdir(out)])
