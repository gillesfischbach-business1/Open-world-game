# Lëtz Adventures

Ein Open-World-Spiel im Browser, angesiedelt in Belval (Esch-sur-Alzette, Luxemburg).
Du spielst Blëtz, den letzten Funken des Hochofens von 1997.

**▶ Spielen (für alle, ohne Anmeldung):** https://raw.githack.com/gillesfischbach-business1/open-world-game/spiel/index.html

Jede Änderung an `main` wird automatisch gebaut und in den Zweig `spiel` gelegt – der Link zeigt immer die neueste Version.
(Falls GitHub Pages in den Einstellungen eingeschaltet wird, gibt es zusätzlich https://gillesfischbach-business1.github.io/open-world-game/.)

## Im Spiel
- **Leute:** laufen durch Belval, plaudern miteinander, sprechen Blëtz an (Luxemburgisch + Deutsch). **E** = Gespräch, **Q / ZAP** = Blitz.
- **Autos:** Verkehr auf allen Straßen. **E** neben einem Auto = einsteigen (klauen), **WASD / Joystick** = fahren.
- **Polizei:** Wer klaut, schockt oder anfährt, wird gesucht (★). Bleib 12 s außer Sicht, um einen Stern zu verlieren.
- **Missionen:** 7 Aufträge quer durch Belval, Fortschritt wird im Browser gespeichert.

## Technik
- [Babylon.js](https://www.babylonjs.com/) 9 mit WebGPU (Rückfall auf WebGL2)
- Havok-Physik (Charakter, später Fahrzeuge)
- TypeScript + Vite
- Welt aus OpenStreetMap-Daten von Belval

## Leistung auf allen Geräten
Das Spiel erkennt das Gerät selbst (Grafikchip, Speicher, Kerne, Handy/PC) und wählt eine Grafikstufe.
Während des Spielens misst es laufend und regelt nach (Auflösung, Effekte, Sichtweite, Menge). Was auf
einem Gerät gut läuft, merkt es sich für den nächsten Start.
- `?debug` (oder 3× auf die Uhr tippen): Stufe, Auflösung, Grafikchip, eingesparte Effekte
- `?bench`: 45-Sekunden-Leistungstest mit Ergebnisseite
- `?q=low|mid|high`: Stufe von Hand festlegen
- Tests: `node tools/devicetest/tiers.test.mjs` (Stufenwahl) · `node tools/devicetest/run.mjs` (Geräte-Emulation)
- Skill für Claude: `.claude/skills/device-performance/`

## Selbst starten
```bash
npm install
npm run dev      # Entwicklungsserver
npm run build    # fertige Dateien in dist/
```
Link-Optionen: `?q=low|mid|high` (Grafikstufe), `?webgl` (WebGL2 erzwingen), `?debug` (Testanzeige; im Spiel auch 3× auf die Uhr tippen).

## Aufbau
| Ordner | Inhalt |
|---|---|
| `src/core` | Engine-Start, Eingabe (Tastatur, Maus, Touch) |
| `src/world` | Kartendaten, Gelände, Straßen, Gebäude, Ausstattung, Licht & Himmel |
| `src/player` | Spielfigur mit Physik-Steuerung und Kamera |
| `src/npc` | Menschen: Gehwege, Plaudern, Reaktionen |
| `src/vehicles` | Verkehr, Fahren, Polizei |
| `src/game` | Gespräche, Missionen, Speicherstand |
| `src/fx` | Blitz-Effekt, Klänge |
| `src/ui` | Oberfläche, Ladebildschirm |
| `public/data` | Kartendaten, Dialoge, Stimmen |
| `public/assets` | Texturen, Himmels-Panorama, 3D-Modelle |

Quellen und Lizenzen: siehe [CREDITS.md](CREDITS.md).
