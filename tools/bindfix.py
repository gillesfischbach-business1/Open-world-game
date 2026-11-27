"""Rocketbox-GLB: Ruhe-Pose der Knoten aus den inversen Bindungsmatrizen ableiten (Gesicht/Haare)."""
import json, struct, sys, re
import numpy as np
BODY = re.compile(r'^Bip\d\d(_(Pelvis|Spine\d?|Neck\d?|Head|[LR]_(Clavicle|UpperArm|Forearm|Hand|Finger\d+|Thigh|Calf|Foot|Toe\d+)))?$')
def load(f):
    b = open(f, 'rb').read(); l = struct.unpack('<I', b[12:16])[0]; J = json.loads(b[20:20 + l])
    o = 20 + l; bl = struct.unpack('<I', b[o:o + 4])[0]; return J, bytearray(b[o + 8:o + 8 + bl])
def save(f, J, bin_):
    js = json.dumps(J, separators=(',', ':')).encode(); js += b' ' * ((4 - len(js) % 4) % 4)
    bn = bytes(bin_); bn += b'\0' * ((4 - len(bn) % 4) % 4)
    out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bn)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(bn), 0x004E4942) + bn
    open(f, 'wb').write(out)
def mats(J, bin_, acc):
    a = J['accessors'][acc]; bv = J['bufferViews'][a['bufferView']]; off = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    assert a['componentType'] == 5126 and a['type'] == 'MAT4'
    arr = np.frombuffer(bytes(bin_[off:off + 64 * a['count']]), dtype='<f4').reshape(a['count'], 4, 4)
    return np.array([m.T for m in arr])  # Spalten- → Zeilenform
def trs(n):
    t = np.array(n.get('translation', [0, 0, 0]), float); q = np.array(n.get('rotation', [0, 0, 0, 1]), float); s = np.array(n.get('scale', [1, 1, 1]), float)
    x, y, z, w = q; R = np.array([[1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)], [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)], [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)]])
    M = np.eye(4); M[:3, :3] = R * s; M[:3, 3] = t; return M
def decompose(M):
    t = M[:3, 3]; s = np.linalg.norm(M[:3, :3], axis=0); R = M[:3, :3] / s
    tr = np.trace(R)
    if tr > 0: S = np.sqrt(tr + 1) * 2; w = 0.25 * S; x = (R[2, 1] - R[1, 2]) / S; y = (R[0, 2] - R[2, 0]) / S; z = (R[1, 0] - R[0, 1]) / S
    elif R[0, 0] > R[1, 1] and R[0, 0] > R[2, 2]: S = np.sqrt(1 + R[0, 0] - R[1, 1] - R[2, 2]) * 2; w = (R[2, 1] - R[1, 2]) / S; x = 0.25 * S; y = (R[0, 1] + R[1, 0]) / S; z = (R[0, 2] + R[2, 0]) / S
    elif R[1, 1] > R[2, 2]: S = np.sqrt(1 + R[1, 1] - R[0, 0] - R[2, 2]) * 2; w = (R[0, 2] - R[2, 0]) / S; x = (R[0, 1] + R[1, 0]) / S; y = 0.25 * S; z = (R[1, 2] + R[2, 1]) / S
    else: S = np.sqrt(1 + R[2, 2] - R[0, 0] - R[1, 1]) * 2; w = (R[1, 0] - R[0, 1]) / S; x = (R[0, 2] + R[2, 0]) / S; y = (R[1, 2] + R[2, 1]) / S; z = 0.25 * S
    q = np.array([x, y, z, w]); q /= np.linalg.norm(q); return t, q, s
def run(f, write):
    J, bin_ = load(f); N = J['nodes']; sk = J['skins'][0]; joints = sk['joints']; IBM = mats(J, bin_, sk['inverseBindMatrices'])
    par = {c: i for i, n in enumerate(N) for c in n.get('children', [])}; idx = {j: k for k, j in enumerate(joints)}
    report = []
    for k, j in enumerate(joints):
        p = par.get(j)
        if p is None or p not in idx: continue
        L = IBM[idx[p]] @ np.linalg.inv(IBM[k])   # lokale Bindungs-Transformation
        cur = trs(N[j]); d = np.abs(L - cur).max()
        name = N[j].get('name', '?')
        if d > 1e-3: report.append((round(float(d), 3), name, bool(BODY.match(name))))
        if write and not BODY.match(name):
            t, q, s = decompose(L); N[j]['translation'] = [float(v) for v in t]; N[j]['rotation'] = [float(v) for v in q]; N[j]['scale'] = [float(v) for v in s]
    if write: save(f, J, bin_)
    return sorted(report, reverse=True)
if __name__ == '__main__':
    write = sys.argv[1] == 'write'
    for f in sys.argv[2:]:
        r = run(f, write); print(f.split('/')[-1], len(r), r[:8])
