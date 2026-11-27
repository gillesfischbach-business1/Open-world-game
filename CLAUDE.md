# Lëtz Adventures – Hinweise für Claude

Open-World-Spiel in Belval (Luxemburg): Babylon.js 9, TypeScript, Havok, Vite. Hauptfigur: Blëtz, ein Blitz-Löwe.
Der Nutzer programmiert nicht: auf Deutsch antworten, einfach erklären, Empfehlungen geben.

- **Studio-Aufbau:** `.claude/agents/README.md` (18 Agenten in drei Ebenen). Größere Aufträge über `studio-leitung`.
- **Arbeitsweise:** autonom planen, bauen, prüfen. Nur bei Geld, Veröffentlichung, Lizenzen und Geschmacksfragen nachfragen.
- **Prüfen:** `npx tsc --noEmit`, `npm run build`; Playwright ist vorinstalliert. Ohne Grafikkarte ist die Bildrate hier bedeutungslos.
- **Leistung:** Skill `device-performance`; `?diag` und `?bench` für Messungen auf echten Geräten.
- **Cloud:** `server/` – Spiel rendert auf einer Server-Grafikkarte (`?stream`), Video per WebSocket zum Spieler (`/`).
  Lokal: `GPU_ARGS="--use-angle=swiftshader --enable-unsafe-swiftshader" node server/server.mjs`. GPU-Rechner: `server/cloud-start.sh`.
- **Veröffentlichung:** Push auf `main` → Workflow baut nach Branch `spiel`
  (https://raw.githack.com/gillesfischbach-business1/open-world-game/spiel/index.html).
- **Unreal-Weg (pausiert):** `unreal/README.md`, Export `tools/unreal/export_belval.py`.
