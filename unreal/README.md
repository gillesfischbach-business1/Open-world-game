# Lëtz Adventures – Unreal-Engine-5-Version (Cloud)

Ziel: Belval in fotorealistischer Optik mit aktueller Open-World-Physik. Das Spiel läuft auf
gemieteten Grafik-Servern und wird per **Pixel Streaming** als Video in den Browser geschickt.
Das Gerät des Spielers (Handy, alter Laptop) spielt damit keine Rolle mehr.

Die bisherige Browser-Version (Babylon.js, Ordner `src/`) bleibt spielbar, bis diese Version sie ersetzt.

## Bausteine

| Bereich | Technik | Warum |
|---|---|---|
| Engine | Unreal Engine 5 (neueste stabile 5.x beim Einrichten, Stand Nov. 2026: 5.9) | Lumen (echtes Licht), Nanite (Detail ohne Ruckeln), Chaos-Physik |
| Welt | `tools/unreal/export_belval.py` → `unreal/Import/*.glb` + `belval_daten.json` | Belval aus OpenStreetMap, gleiche Karte wie im Browser-Spiel |
| Oberflächen | Fab / Quixel Megascans (für Unreal-Projekte kostenlos) | Fotogescannte Fassaden, Asphalt, Pflanzen |
| Menschen | MetaHuman + Mass AI (Menschenmengen) | Sehr echt wirkende Figuren, Hunderte gleichzeitig |
| Fahrzeuge | Chaos Vehicles | Federung, Reifenhaftung, Schaden |
| Blëtz | eigenes Modell, Fell (Groom) | Hauptfigur |
| Streaming | Pixel Streaming 2 (Signalling-Server: MIT-Lizenz) | Bild als Video im Browser, Steuerung per Touch/Tastatur/Controller |
| Betrieb | Linux-GPU-Server (NVIDIA) mit Docker | Ein Spielerplatz je Grafikkarte; ca. 0,40–0,90 $ pro Stunde (Nov. 2026) |

## Ablauf

1. **Entwicklungs-PC in der Cloud** mieten (Windows mit NVIDIA-Karte), Unreal installieren, Claude-Desktop-App verbinden.
2. **Projekt anlegen** (Vorlage „Third Person“, C++), Plugins: Pixel Streaming 2, Chaos Vehicles, MetaHuman, Mass, Water.
3. **Belval importieren**: die drei `.glb`-Dateien aus `unreal/Import/` in den Inhaltsbrowser ziehen, Materialien zuweisen.
4. **Erster spielbarer Stand**: Blëtz läuft durch Belval, Tag/Nacht, Pixel Streaming im Browser getestet.
5. Danach Schritt für Schritt: Verkehr und Polizei → Menschen → Missionen und Dialoge → Feinschliff.
6. **Veröffentlichen**: Linux-Build in Docker auf gemietetem GPU-Server, Link zum Spielen im Browser.

## Daten neu erzeugen

```
python3 tools/unreal/export_belval.py
```

Koordinaten: glTF-Norm (Meter, X = Osten, Y = oben, Z = Süden). Unreal rechnet beim Import in Zentimeter
und Z-oben um. Gelände, Gebäude und Straßen liegen dadurch exakt aufeinander.

Kartendaten © OpenStreetMap-Mitwirkende (ODbL).
