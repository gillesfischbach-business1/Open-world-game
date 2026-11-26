# Lëtz Adventures

Ein Open-World-Spiel im Browser, angesiedelt in Belval (Esch-sur-Alzette, Luxemburg).
Du spielst Blëtz, den letzten Funken des Hochofens von 1997.

**Spielen:** https://gillesfischbach-business1.github.io/open-world-game/ (nach dem Einrichten von GitHub Pages)

## Technik
- [Babylon.js](https://www.babylonjs.com/) 9 mit WebGPU (Rückfall auf WebGL2)
- Havok-Physik (Charakter, später Fahrzeuge)
- TypeScript + Vite
- Welt aus OpenStreetMap-Daten von Belval

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
| `src/ui` | Oberfläche, Ladebildschirm |
| `public/data` | Kartendaten, Dialoge, Stimmen |
| `public/assets` | Texturen, Himmels-Panorama, 3D-Modelle |

Quellen und Lizenzen: siehe [CREDITS.md](CREDITS.md).
