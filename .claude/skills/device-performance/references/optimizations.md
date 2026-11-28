# Optimierungs-Katalog

Geordnet nach Ursache. Jede Maßnahme nennt, wo im Code sie sitzt und was sie ungefähr bringt.
Erst messen (Messbericht → Abschnitt mit Einbruch), dann **eine** Maßnahme, dann erneut messen.

## Inhalt
- Download (Ladezeit, Speicher)
- Grafikkarte (Pixel, Effekte)
- Figuren (Menschen, Hunde)
- Weitsicht
- CPU / Zeichenaufrufe
- Ruckler (Stocken)
- Bedienung auf dem Handy

## Download
| Maßnahme | Ort | Wirkung |
|---|---|---|
| Texturen als WebP, 1024 px + 512-px-Satz `tex/lo/` für low | `public/assets/tex`, `src/world/materials.ts` (`lowRes`) | −70 % Texturgröße |
| Himmel 1k statt 2k auf low (`Preset.hdr`) | `src/core/perf.ts` | −4 MB |
| Figuren in zwei Stufen laden (7 zuerst, Rest im Hintergrund) | `src/npc/people.ts` `load`/`loadRest` | Start ~3× schneller |
| Große Clips (Kaffee, Zeitung) erst später | `src/npc/humans.ts` `LATE` | −3 MB beim Start |
| Unbenutzte Dateien löschen (`grep` nach dem Dateinamen in `src/`) | `public/` | – |
| Offen: Babylon gezielt importieren statt `@babylonjs/core` (Bundle 7,7 MB) | alle `import … from '@babylonjs/core'` | −40–60 % JS |
| Offen: KTX2/Basis-Texturen (GPU-komprimiert, weniger Grafikspeicher) | Materialien | −75 % Grafikspeicher |

## Grafikkarte (Pixel, Effekte)
Erkennbar daran, dass kleinere Auflösung sofort hilft.
| Maßnahme | Ort | Wirkung |
|---|---|---|
| Auflösung begrenzen (`Preset.maxPx`, `minScale`) | `perf.ts` | größter Hebel auf Handys (3× DPR!) |
| Umgebungsverdeckung (SSAO) nur auf high | `Environment.setSSAO` | 15–30 % |
| Schatten: Kartengröße/Kaskaden/`shadowMaxZ` | `environment.ts` | 10–25 % |
| Leuchteffekt aus | `Environment.setBloom` | 5–10 % |
| MSAA nur auf high, sonst FXAA | `Preset.msaa` | 5–15 % |

## Figuren (Menschen, Hunde)
Erkennbar an Einbrüchen im Abschnitt „Belval Plaza (viele Menschen)“.
| Maßnahme | Ort | Wirkung |
|---|---|---|
| Anzahl je Stufe (`people`, `seated`) | `Preset` | linear |
| Sichtweite (`peopleView`) – unsichtbare Figuren kosten fast nichts | `People.viewDist` | stark |
| Animationen nur in der Nähe (`animView`), weiter weg eingefroren | `Person.setFrozen` | 20–40 % CPU |
| Offen: Detailstufen (LOD) – zweite, vereinfachte Figur ab 30 m (`gltfpack -si 0.4`, aber Haare/Wimpern prüfen!) | Umwandlung + `humans.ts` | 30 % GPU |
| Offen: Animationen in Texturen backen (BakedVertexAnimation) | Babylon `VertexAnimationBaker` | große Mengen |

## Weitsicht
Erkennbar an Einbrüchen im Abschnitt „Überflug“.
| Maßnahme | Ort | Wirkung |
|---|---|---|
| `camera.maxZ` + Nebel (`farClip`) | `main.ts` Knobs | stark |
| Verkehr-Sichtweite | `Traffic.viewDist` | mittel |
| Offen: Gebäude in Kacheln teilen + Entfernungs-Ausblendung | `city.ts` | stark |

## CPU / Zeichenaufrufe
Erkennbar, wenn kleinere Auflösung nichts bringt.
| Maßnahme | Ort | Wirkung |
|---|---|---|
| Gleiche Objekte als Thin-Instances (Laternen, Bänke, Büsche, Café-Möbel) | `props.ts` `place()` | schon umgesetzt |
| Gebäudeteile nach Material zusammengefasst | `city.ts` | schon umgesetzt |
| Nicht pickbare Meshes (`isPickable = false`) | überall | Strahltests billiger |
| Offen: `scene.freezeActiveMeshes()` für statische Welt | `main.ts` | 10–20 % CPU |

## Ruckler (Stocken)
Erkennbar an hohem „Ruckler“-Wert bei gutem Schnitt.
- Shader vorkompilieren: alles einmal beim Laden sichtbar machen (`scene.executeWhenReady`).
- Figuren nachladen ruckelt kurz: `loadRest` erst nach 1,5 s, Instanzen einzeln über mehrere Bilder verteilen.
- Garbage Collection: in Schleifen keine `new Vector3` pro Bild, Hilfsvektoren wiederverwenden.

## Bedienung auf dem Handy
Vom Emulationstest geprüft (`tools/devicetest/run.mjs`):
- Knöpfe ≥ 44 px, nichts ragt aus dem Bild, Missionskarte überdeckt weder Minikarte noch Knöpfe.
- Joystick bewegt Blëtz (Touch-Ereignisse über CDP).
- Gesprächsfenster oben, Knöpfe unten rechts – nie überlappend.

## Gelernt am Galaxy S20 FE (Adreno 650), Nov 2026

- **Erst messen, dann raten:** `?diag` bzw. die Messseite im Modus `diag` schaltet einzelne Teile ab. Ergebnis dort:
  mit Stadt 4–9 FPS, ohne Stadt 59 FPS – halbe Auflösung half NICHT (also kein Pixel-, sondern ein Eckpunkt-Problem).
- **Ursache:** Thin-Instances in EINEM Mesh für die ganze Stadt (900 Laternen à 17 k Eckpunkte, 4320 Büsche à 5 k)
  ≈ 36 Mio. Eckpunkte pro Bild, ohne Sichtbarkeitsprüfung. Lösung (`world/props.ts`): Aufteilung in 64-m-Viertel,
  `thinInstanceRefreshBoundingInfo`, `addLODLevel(dist, null)`, vereinfachte `_lo`-Modelle (gltfpack `-si`) auf Handys.
  Danach 0,6 Mio. Eckpunkte. Regel: **nie** eine Thin-Instance-Gruppe über die ganze Karte.
- **WebGL2 statt WebGPU auf Android** (Claude-App-WebView): 9 vs. 4 FPS. `core/engine.ts` wählt das auf Handys automatisch.
- Punktlichter kosten auch bei Intensität 0 – auf Mobilgeräten werden sie entfernt.
- Prüfen mit Eckpunkt-Zählung inkl. Thin-Instances: `Σ getTotalVertices() × max(1, thinInstanceCount)` der aktiven Meshes.

## Falle: Thin-Instances und geteilte Geometrie (Nov 2026)
Thin-Instance-Puffer (`world0..3`) liegen an der **Geometrie**, nicht am Mesh. Mehrere Meshes mit geteilter
Geometrie (`clone()`, `geometry.applyToMesh`) überschreiben sich gegenseitig: alle zeichnen die Positionen des
zuletzt gesetzten Puffers. Je Viertel daher `tpl.geometry.copy(id).applyToMesh(mesh)`.
Prüfen: Instanzen eines Viertels müssen räumlich nah beieinander liegen (Streuung < Viertelgröße).
