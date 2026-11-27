---
name: device-performance
description: Testet und optimiert die Leistung des Browser-Spiels „Lëtz Adventures“ (Babylon.js, open-world-game) auf Smartphones, Tablets, Laptops und PCs – Geräte-Emulation (Bildschirm, Touch, Grafikchip, Speicher, CPU-Drosselung), echte Messung auf dem Handy des Nutzers über eine claude.ai-Messseite mit gespeicherten Ergebnissen, Prüfung der automatischen Stufenwahl und gezielte Optimierung. Unbedingt verwenden, wenn es um Ruckeln, FPS, Ladezeit, „läuft nicht auf meinem Handy“, Grafikstufen, Akku/Hitze, Geräteerkennung, ?bench, Leistungstest, Mobil-Optimierung oder neue Inhalte geht, die das Spiel schwerer machen (mehr Figuren, Effekte, Modelle) – auch wenn das Wort „Performance“ nicht fällt.
---

# Geräte-Leistung testen und optimieren

Ziel: Das Spiel läuft auf **jedem** Gerät flüssig, ohne dass jemand eine Einstellung suchen muss.
Dafür gibt es drei Bausteine im Spiel und diesen Ablauf drumherum.

| Baustein | Datei | Aufgabe |
|---|---|---|
| Leistungs-Manager | `src/core/perf.ts` | erkennt das Gerät, wählt die Startstufe, regelt laufend nach, lernt pro Gerät |
| Leistungstest | `src/core/bench.ts` | `?bench`: 45-s-Testflug mit Messbericht (`window.__bench`, Ereignis `bench-done`) |
| Geräte-Tests | `tools/devicetest/` | `tiers.test.mjs` (Stufenwahl, Sekunden) und `run.mjs` (Browser-Emulation) |

Der Nutzer programmiert nicht. Erkläre Ergebnisse in einfachem Deutsch, mit Zahlen und einem klaren
Urteil („flüssig / spielbar / ruckelt“), und sag immer, was echt gemessen und was nur simuliert ist.

## Ablauf

### 1. Ausgangslage klären (kurz)
Welches Gerät, welches Symptom? Gibt es schon Messläufe? (Messseite-Datenbank lesen, siehe Schritt 4.)
Ohne Angaben: alle Schritte der Reihe nach.

### 2. Schnelltest der Stufenwahl (ohne Browser)
```bash
node tools/devicetest/tiers.test.mjs
```
Prüft für 8 Geräteprofile und 13 Grafikchip-Fälle, ob `chooseTier`/`gpuClass` die erwartete Stufe
liefern. Neues Gerät oder Chip gemeldet? Erst hier einen Fall in `tools/devicetest/devices.mjs`
(bzw. `cases` in der Testdatei) ergänzen, dann die Regel in `perf.ts` anpassen, bis alles grün ist.

### 3. Geräte-Emulation im Browser
```bash
npm run build && (python3 -m http.server 8791 -d dist >/dev/null 2>&1 &)
node tools/devicetest/run.mjs --out devicetest-out --devices iphone15pro,galaxya14,motog4,laptop
```
Simuliert pro Gerät Bildschirm, Touch, Grafikchip-Namen, Speicher, Kerne und CPU-Drosselung; prüft
gewählte Stufe, Bedienelemente (≥ 44 px, nichts ragt raus, keine Überlappung), den Joystick und
Konsolenfehler. Bericht: `devicetest-out/report.md`, Bildschirmfotos `devicetest-out/<gerät>.png`.
- Software-Rendering ist sehr langsam (Minuten pro Gerät): im Hintergrund laufen lassen, 2–4 Geräte pro Lauf.
- `--bench` hängt den Testflug an (dauert noch länger; nur für Abläufe, nicht für Zahlen).
- Die FPS aus der Emulation **nicht** als Leistung berichten – sie messen den Container, nicht das Gerät.
- Bildschirmfotos ansehen (Read-Werkzeug): Ist alles lesbar, nichts verdeckt?

### 4. Echte Messung auf dem Handy des Nutzers
Das ist die einzige Quelle für echte Bildraten. Zwei Wege:

**a) Messseite auf claude.ai (bevorzugt – Ergebnis kommt automatisch zurück):**
1. `npm run build`, dann
   `python3 .claude/skills/device-performance/scripts/build_bench_page.py dist <scratchpad>/letz-bench`
2. Mit dem Artifact-Tool veröffentlichen: `file_path` = `<…>/letz-bench/page.html`, `root` = `<…>/letz-bench`,
   `capabilities: {"db": {}}`, `files` = Inhalt von `bpart1.json`; danach jeden weiteren Teil
   (`bpart2.json` …) mit derselben `url` und `files` nachreichen. Bestehende Messseite: `url` angeben
   (Liste über `Artifact action:list`, Titel „Lëtz Leistungstest“).
3. Dem Nutzer den Link geben: „Auf dem Handy öffnen, 1 Minute laden lassen, nicht anfassen, bis
   ‚Ergebnis an Claude übermittelt ✓‘ erscheint.“ Bei mehreren Geräten: auf jedem öffnen.
4. Ergebnisse lesen: `ArtifactData` (per ToolSearch laden) `action: "list"`, `collection: "runs"`;
   als JSON speichern und zusammenfassen:
   `python3 .claude/skills/device-performance/scripts/summarize_runs.py runs.json`

Warum der Umweg über Base64: Die Messseite darf keine Binärdateien (.glb/.hdr/.bin) ausliefern.
Das Skript legt sie als Text ab, die Seite wandelt sie zurück, das Spiel holt sie über
`window.__BLOB_MAP` (Haken in `main.ts`). Fehlermeldung „type artifacts don't serve“ oder „ESC byte“
heißt: eine Binärdatei ist durchgerutscht – Endung in `build_bench_page.py` ergänzen.

**b) Ohne claude.ai:** Spiel-Link mit `?bench` öffnen (`…/spiel/index.html?bench`), am Ende
„Ergebnis kopieren“ und den Text in den Chat einfügen lassen. Mit `?debug` (oder 3× auf die Uhr tippen)
zeigt das Spiel jederzeit Stufe, Auflösung, Grafikchip und eingesparte Effekte.

### 5. Auswerten
Grenzwerte und Bedeutung der Zahlen: `references/thresholds.md`. Vorgehen:
1. Urteil pro Gerät nennen (flüssig/spielbar/ruckelt) und die schwächste Teilstrecke.
2. Hat der Manager nachgeregelt (`steps`, `startTier → endTier`)? Viel Nachregeln = Startregel zu optimistisch.
3. Ursache bestimmen: Pixel (Auflösung half), Figuren (Plaza bricht ein), Weitsicht (Überflug bricht ein),
   CPU (Auflösung half nicht), Ruckler (hoher Ruckler-Anteil bei gutem Schnitt), Download (Laden lang).

### 6. Optimieren
Maßnahmen nach Ursache: `references/optimizations.md`. Regeln, die sich bewährt haben:
- **Eine Maßnahme, dann neu messen.** Mehrere gleichzeitig verraten nicht, was gewirkt hat.
- Erst die Stellschrauben des Managers (Presets, Sparreihenfolge) – sie wirken auf allen Geräten.
- Neue Inhalte (Figuren, Effekte) immer mit einer Stellschraube anlegen, die der Manager drehen kann
  (`Knobs` in `perf.ts` + Eintrag in der Sparreihenfolge). Sonst kann er auf schwachen Geräten nicht helfen.
- Optik nie stillschweigend verschlechtern: Was auf high entfällt, mit dem Nutzer besprechen.
- Nach jeder Änderung: `npx tsc --noEmit`, `node tools/devicetest/tiers.test.mjs`, Emulation für 2 Geräte.

### 7. Abschluss
Bericht an den Nutzer (Deutsch, einfach): Was gemessen (echt / simuliert), Urteil je Gerät,
was geändert wurde, was offen ist. Änderungen committen (Conventional Commits, Deutsch) und pushen;
die Spiel-Seite aktualisiert sich über den Workflow automatisch. Messseite bei Code-Änderungen neu bauen.

## Stolpersteine (aus der Entwicklung)
- `import … from 'playwright'` scheitert in ESM ohne lokale Installation → `createRequire` (so in `run.mjs`).
- Testskripte: Hilfsfunktion `ev(f, arg)` muss das Argument weiterreichen, sonst hängt das Warten auf Bilder.
- `pkill -f chrom` beendet auch die eigene Shell, wenn „chrom“ im Befehl steht → gezielt `pkill -f run.mjs`.
- Safari meldet keinen Speicher (`deviceMemory` fehlt) und nur „Apple GPU“ → nie als 4 GB annehmen.
- Intel-Regel: „UHD Graphics 620“ ist mittel, „HD Graphics 4000“ schwach (Lookbehind `(?<!u)hd`).
