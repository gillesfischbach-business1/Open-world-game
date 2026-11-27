#!/usr/bin/env python3
"""Fasst Messläufe zusammen – aus der Datenbank der Messseite (ArtifactData list → JSON-Datei)
oder aus kopierten Ergebnissen (eine JSON-Datei je Lauf, oder eine Liste).

Aufruf:  python3 summarize_runs.py runs.json [weitere.json ...]
Ausgabe: eine Tabelle je Gerät + Hinweise, welche Optimierung als Nächstes am meisten bringt.
Das Skript urteilt nicht über Wahrheiten, es liest nur Zahlen ab (Schwellen siehe references/thresholds.md).
"""
import json, sys

def load(paths):
    runs = []
    for p in paths:
        d = json.load(open(p))
        if isinstance(d, dict) and 'documents' in d: d = [x.get('data', x) for x in d['documents']]
        if isinstance(d, dict) and 'items' in d: d = [x.get('data', x) for x in d['items']]
        runs += d if isinstance(d, list) else [d]
    return [r for r in runs if isinstance(r, dict) and 'overall' in r]

def hints(r):
    o, h = r['overall'], []
    secs = {s['name']: s for s in r.get('sections', [])}
    worst = min(r.get('sections', []), key=lambda s: s['p5Fps'], default=None)
    if r.get('loadS', 0) > 25: h.append(f"Laden dauert {r['loadS']} s → Dateien verkleinern (references/optimizations.md §Download)")
    if o['p5Fps'] < 30 and r.get('finalScale', 1) <= 0.55: h.append('Auflösung schon am Minimum → Geometrie/Zeichenaufrufe senken (§CPU/Zeichenaufrufe)')
    if worst and 'Menschen' in worst['name'] and worst['p5Fps'] < o['p5Fps'] * 0.85: h.append(f"Einbruch bei „{worst['name']}“ → Menschen (Anzahl, Animationsweite) senken (§Figuren)")
    if worst and 'Überflug' in worst['name'] and worst['p5Fps'] < o['p5Fps'] * 0.85: h.append('Einbruch bei Weitsicht → Sichtweite/Schatten-Reichweite senken (§Weitsicht)')
    if o['jankPct'] > 5: h.append(f"{o['jankPct']} % Ruckler (>50 ms) → Nachladen/Shader-Kompilieren beim Start vorziehen (§Ruckler)")
    if r.get('endTier') != r.get('startTier'): h.append(f"Stufe wurde von {r['startTier']} auf {r['endTier']} korrigiert → Startregel für diesen Grafikchip prüfen (src/core/perf.ts gpuClass)")
    if not h: h.append('keine Auffälligkeit')
    return h

runs = load(sys.argv[1:])
if not runs: print('Keine Messläufe gefunden.'); sys.exit(1)
print(f'{len(runs)} Messläufe\n')
print('| Gerät (Grafikchip) | Backend | Stufe | Ø FPS | 5 % FPS | Ruckler | Auflösung | Laden | Urteil |')
print('|---|---|---|---|---|---|---|---|---|')
for r in runs:
    d, o = r.get('device', {}), r['overall']
    print(f"| {d.get('gpu', '?')[:40]} {'(Handy)' if d.get('mobile') else ''} | {r.get('backend')} | {r.get('startTier')}→{r.get('endTier')} | {o['avgFps']} | {o['p5Fps']} | {o['jankPct']} % | {round(r.get('finalScale', 0) * 100)} % | {r.get('loadS')} s | {r.get('verdict')} |")
print()
for r in runs:
    print(f"## {r.get('device', {}).get('gpu', '?')} – {r.get('date', '')[:16]}")
    for s in r.get('sections', []): print(f"- {s['name']}: Ø {s['avgFps']} FPS, 5 % {s['p5Fps']} FPS, schlimmstes Bild {s['worstMs']} ms")
    if r.get('steps'): print(f"- automatisch gespart: {', '.join(r['steps'])}")
    for h in hints(r): print(f"- Hinweis: {h}")
    print()
