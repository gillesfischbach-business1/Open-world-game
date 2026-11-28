#!/usr/bin/env python3
"""Verkleinert die Bewegungsdateien (public/assets/people/anim/*.glb):
entfernt alle Animationsspuren für Knochen, die das Spiel nicht nutzt (Finger, Gesicht, Augen, Fußspuren).
Das Spiel überträgt nur die Kernknochen (src/npc/humans.ts, CORE) – der Rest wurde bisher mitgeladen und verworfen.
Danach packt gltfpack die Datei neu (ungenutzte Daten fallen weg, Spuren werden komprimiert).

Aufruf: python3 tools/people/strip_anims.py <pfad/zu/gltfpack>
"""
import json, os, re, struct, subprocess, sys, tempfile
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DIR = os.path.join(ROOT, 'public/assets/people/anim'); GP = sys.argv[1]
CORE = re.compile(r'^Bip(_(Pelvis|Spine\d?|Neck\d?|Head|[LR]_(Clavicle|UpperArm|Forearm|Hand|Thigh|Calf|Foot|Toe0)))?$')  # wie humans.ts

def read(p):
    b = open(p, 'rb').read(); jl = struct.unpack('<I', b[12:16])[0]; g = json.loads(b[20:20 + jl]); off = 20 + jl
    bl = struct.unpack('<I', b[off:off + 4])[0]; return g, b[off + 8:off + 8 + bl]
def write(p, g, binb):
    js = json.dumps(g, separators=(',', ':')).encode(); js += b' ' * ((4 - len(js) % 4) % 4); binb += b'\0' * ((4 - len(binb) % 4) % 4)
    with open(p, 'wb') as f: f.write(struct.pack('<III', 0x46546C67, 2, 28 + len(js) + len(binb)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(binb), 0x004E4942) + binb)

before = after = 0
for f in sorted(os.listdir(DIR)):
    if not f.endswith('.glb'): continue
    p = os.path.join(DIR, f); before += os.path.getsize(p); g, binb = read(p); kept = 0; total = 0
    for a in g.get('animations', []):
        ch, used = [], set()
        for c in a['channels']:
            total += 1; name = re.sub(r'^Bip\d+', 'Bip', g['nodes'][c['target']['node']].get('name', ''))
            if CORE.match(name): ch.append(c); used.add(c['sampler'])
        remap = {o: n for n, o in enumerate(sorted(used))}
        a['samplers'] = [a['samplers'][o] for o in sorted(used)]
        for c in ch: c['sampler'] = remap[c['sampler']]
        a['channels'] = ch; kept += len(ch)
    with tempfile.TemporaryDirectory() as t:
        tmp = os.path.join(t, 'a.glb'); write(tmp, g, binb)
        subprocess.run([GP, '-i', tmp, '-o', p, '-kn', '-af', '24', '-ac'], check=True, capture_output=True)
    after += os.path.getsize(p); print(f'{f}: {kept}/{total} Spuren')
print(f'gesamt {before / 1e6:.1f} MB → {after / 1e6:.1f} MB')
