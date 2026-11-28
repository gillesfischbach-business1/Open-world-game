#!/usr/bin/env python3
"""Baut aus dist/ die Messseite für claude.ai (Artifact mit db-Fähigkeit).

Warum so umständlich: Artifact-Seiten liefern nur bestimmte Dateitypen aus (keine .glb/.hdr/.bin)
und lehnen Binärdaten als Text ab. Deshalb werden Binärdateien als Base64-Text (.b64.txt) abgelegt;
die Seite wandelt sie beim Laden in Blobs zurück, und das Spiel leitet seine Anfragen per
WebRequest.CustomRequestModifiers (main.ts, window.__BLOB_MAP) auf diese Blobs um.

Aufruf:  SINGLE=1 npx vite build --outDir /tmp/single  (eine JS-Datei – die Seite hält höchstens 512 Dateien)
         python3 build_bench_page.py /tmp/single <Zielordner> [artifact|diag]
Ergebnis: <Ziel>/page.html (Seite) + Dateien, und <Ziel>/../bpartN.json (Dateilisten je Veröffentlichung,
          höchstens 250 Dateien und 60 MB pro Teil – Grenzen des Artifact-Tools).
"""
import base64, json, os, re, shutil, sys

SRC, DST = sys.argv[1], sys.argv[2]
HOST = sys.argv[3] if len(sys.argv) > 3 else 'artifact'  # 'diag' = Diagnose-Lauf statt Leistungstest
if os.path.exists(DST): shutil.rmtree(DST)
shutil.copytree(SRC, DST)
os.chdir(DST)
src = open('index.html').read()
css = re.findall(r'<link rel="stylesheet"[^>]*href="([^"]+)"', src)
js = re.findall(r'<script type="module"[^>]*src="([^"]+)"', src)
body = re.sub(r'<script type="module"[^>]*></script>', '', src[src.index('<body>') + 6: src.index('</body>')])
bins = []
for d, _, fs in os.walk('.'):
    for f in fs:
        p = os.path.join(d, f)[2:]
        if p.endswith(('.glb', '.hdr', '.bin', '.env')):
            open(p + '.b64.txt', 'w').write(base64.b64encode(open(p, 'rb').read()).decode()); os.remove(p); bins.append(p)
boot = """window.__BENCH_HOST = %s;
window.__BIN = %s;
window.__bootBinaries = (async () => {
  const map = {}, list = window.__BIN.slice(); let done = 0;
  const bar = () => { const b = document.getElementById('ldbar'), t = document.getElementById('ldtxt'); if (b) b.style.width = Math.round(done / list.length * 100) + '%%'; if (t) t.textContent = 'Dateien laden ' + done + '/' + list.length; };
  const worker = async () => { for (let p; (p = list.shift());) { const r = await fetch(p + '.b64.txt'); const s = atob(await r.text()); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); map[p] = URL.createObjectURL(new Blob([u])); done++; bar(); } };
  await Promise.all([worker(), worker(), worker(), worker(), worker(), worker()]);
  window.__BLOB_MAP = map;
})();
addEventListener('bench-done', async (e) => {
  const el = document.getElementById('bstat'), say = (t, ok) => { el.textContent = t; el.className = ok ? 'ok' : ''; el.hidden = false; };
  say('Ergebnis wird gespeichert …');
  try {
    const db = window.claude && window.claude.use ? await window.claude.use('db') : null;
    if (!db) { say('Nicht gespeichert – bitte „Ergebnis kopieren“ und Claude schicken'); return; }
    const r = JSON.parse(JSON.stringify(e.detail)); r.savedAt = new Date().toISOString();
    await db.collection('runs').add(r);
    say('Ergebnis an Claude übermittelt ✓', true);
  } catch (err) { say('Speichern fehlgeschlagen (' + ((err && (err.code || err.message)) || 'Fehler') + ') – bitte „Ergebnis kopieren“'); }
});""" % (json.dumps(HOST), json.dumps(bins))
page = f"""<title>Lëtz Leistungstest</title>
{''.join(f'<link rel="stylesheet" href="{c}">' for c in css)}
<style>
:root {{ color-scheme: dark; --ok: #7ee787; --warn: #ffcf3a; --ink: #0e1116; --paper: #f4f1ea; }}
html, body {{ height: 100%; background: var(--ink); color: var(--paper); }}
#bstat {{ position: fixed; left: 50%; transform: translateX(-50%); bottom: calc(14px + env(safe-area-inset-bottom, 0px)); z-index: 20; max-width: calc(100vw - 32px);
  background: rgba(14,17,22,.9); color: var(--paper); border: 1px solid var(--warn); border-radius: 12px; padding: 8px 14px; font: 600 13px system-ui, sans-serif; }}
#bstat.ok {{ border-color: var(--ok); }}
</style>
{body}
<div id="bstat" hidden></div>
<script>
{boot}
</script>
{''.join(f'<script type="module" crossorigin src="{j}"></script>' for j in js)}
"""
open('page.html', 'w').write(page); os.remove('index.html')
CT = {'.wasm': 'application/wasm', '.webp': 'image/webp', '.json': 'application/json', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png', '.txt': 'text/plain', '.gltf': 'application/json'}
files = sorted((os.path.join(d, f)[2:] for d, _, fs in os.walk('.') for f in fs if f != 'page.html'))
parts, cur, size = [], [], 0
for p in files:
    s = os.path.getsize(p)
    if len(cur) >= 250 or size + s > 60 * 1048576: parts.append(cur); cur, size = [], 0
    cur.append(p); size += s
parts.append(cur)
for i, lst in enumerate(parts, 1):
    json.dump({p: {'from': p, 'contentType': CT[os.path.splitext(p)[1]]} for p in lst}, open(f'../bpart{i}.json', 'w'))
    print(f'Teil {i}: {len(lst)} Dateien, {sum(os.path.getsize(p) for p in lst) / 1048576:.1f} MB')
print(f'{len(bins)} Binärdateien als Base64; Seite: {DST}/page.html')
