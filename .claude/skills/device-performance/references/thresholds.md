# Grenzwerte und Begriffe

Woran „läuft einwandfrei“ gemessen wird. Die Werte sind bewusst einfach, damit man sie auch einem
Nicht-Programmierer erklären kann.

| Begriff | Bedeutung | Ziel Handy | Ziel PC |
|---|---|---|---|
| **Ø FPS** | Bilder pro Sekunde im Schnitt | ≥ 40 | ≥ 50 |
| **5 % FPS** | Bildrate in den schlechtesten 5 % der Zeit – zeigt Ruckeln, das der Schnitt versteckt | ≥ 30 | ≥ 40 |
| **Ruckler** | Anteil der Bilder, die länger als 50 ms dauern (sichtbares Stocken) | < 3 % | < 2 % |
| **Laden** | Sekunden bis spielbar (WLAN) | < 25 s | < 15 s |
| **Auflösung** | Render-Pixel je Bildschirmpunkt; 100 % = volle Schärfe | ≥ 60 % | 100 % |

Urteil im Messbericht (`src/core/bench.ts`):
- **flüssig**: 5 % FPS ≥ 30 und Ruckler < 3 %
- **spielbar**: 5 % FPS ≥ 22 und Ruckler < 8 %
- **ruckelt**: alles darunter

## Was der Leistungs-Manager tut (src/core/perf.ts)

1. **Startstufe** (`chooseTier`): Grafikchip → schwach/mittel/stark (`gpuClass`), dann gedeckelt durch
   Speicher (≤ 2 GB → low, ≤ 4 GB → höchstens mid) und Kerne (Handy mit ≤ 4 Kernen → höchstens mid).
   Safari verrät weder Speicher noch Chipmodell („Apple GPU“): dann entscheidet WebGPU-Fähigkeit.
   Gelernte Stufe (localStorage `letz-perf-v1`, pro Grafikchip) hat Vorrang vor der Regel; `?q=` erzwingt.
2. **Laufend** (`frame`): Messfenster 1 s, 5 Fenster Aufwärmzeit. Zwei schlechte Fenster in Folge
   (< 85 % des Ziels) → ein Schritt runter; sechs gute (> 120 % und 5 %-Wert > 80 %) → ein Schritt hoch.
3. **Reihenfolge beim Sparen**: Auflösung bis 75 % des Maximums → Umgebungsverdeckung → Schatten →
   Leuchteffekt → Animationen nur nah → Menschen-Sichtweite → weniger Menschen → Verkehr-Sichtweite →
   Sichtweite → Auflösung weiter bis Minimum. Hochregeln in umgekehrter Reihenfolge.
4. **Lernen**: alle 20 s gespeichert; nach ≥ 4 Sparschritten startet das Gerät beim nächsten Mal eine Stufe tiefer.

## Warum Emulation keine echten Bildraten liefert

Im Container ohne Grafikkarte rendert Chromium per Software (SwiftShader): 0,1–0,5 FPS, egal welches
Gerät simuliert wird. Die Emulation prüft daher **Erkennung, Bedienung, Layout und Abläufe**.
Echte Bildraten kommen nur vom echten Gerät (Messseite oder `?bench`).
