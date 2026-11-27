# Studio-Aufbau – Lëtz Adventures

18 Agenten in drei Ebenen. Aufträge fließen von oben nach unten, Ergebnisse (mit Beleg) von unten nach oben.
Gleiche Ebene darf sich beraten, entscheidet aber nur im eigenen Bereich.

```
studio-leitung                         Ebene 1 – Ziel, Verteilung, Abnahme, Kostenfreigaben beim Menschen
├── technik-leitung                    Ebene 2 – Architektur, Code-Qualität
│   ├── babylon-engine-programmierer   Engine, Render-Schleife, Leistungs-Manager
│   ├── physik-programmierer           Havok: Figur, Fahrzeuge, Kollisionen
│   └── ki-programmierer               Menschen, Hunde, Verkehr, Polizei
├── welt-und-kunst-leitung             Ebene 2 – Belval, Optik
│   ├── welt-bauer                     OpenStreetMap → Gelände, Straßen, Gebäude (+ Unreal-Export)
│   ├── render-kuenstler               Licht, Schatten, Spiegelungen, Stufe ultra
│   └── asset-pipeline                 Modelle, Texturen, Lizenzen, _lo-Fassungen
├── spiel-leitung                      Ebene 2 – Spielerlebnis
│   ├── missions-designer              Missionen, Fahndung, Belohnungen
│   └── autor-luxemburgisch            Dialoge Lëtzebuergesch + Deutsch
├── qualitaet-leitung                  Ebene 2 – Tests, Abnahme
│   ├── browser-tester                 Playwright: Funktion, Bildschirmfotos
│   └── leistungs-analyst              Geräte-Leistung (Skill device-performance)
└── cloud-betrieb-leitung              Ebene 2 – Spiel aus der Cloud
    ├── streaming-ingenieur            Video-Kodierung, WebSocket, Spielerseite
    └── infrastruktur-ingenieur        GPU-Rechner, Startskript, Tunnel, Kosten
```

## Regeln

1. **Autonom arbeiten, Menschen nur fragen bei:** Geld, Veröffentlichung unter neuem Namen, Lizenz-/Rechtsfragen,
   reinen Geschmacksfragen mit gleichwertigen Wegen.
2. **Belegen:** Typprüfung + Build + Test/Bildschirmfoto/Messung. Ungeprüftes wird als ungeprüft gemeldet.
3. **Konflikte:** zur gemeinsamen Leitung; Optik gegen Leistung → erst messen (leistungs-analyst), dann entscheiden.
4. **Bereiche:** jede Datei hat genau einen Besitzer (siehe „Eigener Bereich“ in der Agentendatei).

## Typische Abläufe

| Auftrag | Weg |
|---|---|
| „Ruckelt auf meinem Handy“ | studio-leitung → qualitaet-leitung → leistungs-analyst (messen) → technik-/welt-und-kunst-leitung (beheben) → leistungs-analyst (nachmessen) |
| „Realistischer machen“ | studio-leitung → welt-und-kunst-leitung → render-kuenstler + asset-pipeline → browser-tester (Fotos) → leistungs-analyst |
| „In der Cloud spielen“ | studio-leitung → cloud-betrieb-leitung → streaming-ingenieur (lokaler End-zu-End-Test) → infrastruktur-ingenieur (GPU-Start nach Kostenfreigabe) |
| „Neue Mission“ | studio-leitung → spiel-leitung → missions-designer + autor-luxemburgisch → browser-tester |
