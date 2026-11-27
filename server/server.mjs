// Lëtz Cloud – Spiel-Server: rendert das Spiel auf der Server-Grafikkarte und streamt es als Video.
//
//   Browser des Spielers  ⇄  dieser Server (HTTP + WebSocket)  ⇄  Spiel im Server-Browser (Chromium, ?stream)
//
// Der Spieler braucht nur einen Browser, der H.264 abspielen kann (praktisch jedes Gerät seit 2020).
// Start:  node server/server.mjs      (Umgebung: PORT, GAME_DIR, VIEW_W, VIEW_H, FPS, QUALITY, GPU_ARGS)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { WebSocketServer } from 'ws';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = +(process.env.PORT || 7860);
const GAME_DIR = path.resolve(process.env.GAME_DIR || path.join(here, '..', 'dist'));
const PUB = path.join(here, 'public');
const VIEW = { width: +(process.env.VIEW_W || 1280), height: +(process.env.VIEW_H || 720) };
const FPS = +(process.env.FPS || 30), QUALITY = process.env.QUALITY || 'ultra';
// Grafikkarte nutzen (NVIDIA über Vulkan/ANGLE); ohne GPU fällt Chromium auf Software zurück
const GPU_ARGS = (process.env.GPU_ARGS ?? '--ignore-gpu-blocklist --enable-gpu-rasterization --use-angle=vulkan --enable-features=Vulkan,VaapiVideoEncoder --disable-vulkan-surface').split(' ').filter(Boolean);

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm',
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.hdr': 'application/octet-stream', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.txt': 'text/plain' };
const gameCss = () => { try { return fs.readFileSync(path.join(GAME_DIR, 'index.html'), 'utf8').match(/href="\.?\/?(assets\/[^"]+\.css)"/)?.[1] ?? null; } catch { return null; } };

function serve(res, file) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); res.end('nicht gefunden'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'content-length': st.size, 'cache-control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  });
}
const state = { config: null, hud: '', map: '', stats: {}, started: Date.now(), clients: 0, controller: null };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'); let p = decodeURIComponent(u.pathname);
  if (p === '/' || p === '/play') return serve(res, path.join(PUB, 'play.html'));
  if (p === '/status') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: !!state.config, ...state.stats, config: state.config, clients: state.clients, uptimeS: Math.round((Date.now() - state.started) / 1000) })); return; }
  if (p === '/hud.css') { const c = gameCss(); if (!c) { res.writeHead(404); res.end(); return; } return serve(res, path.join(GAME_DIR, c)); }
  if (p.startsWith('/game/')) { const f = path.normalize(path.join(GAME_DIR, p.slice(6))); if (!f.startsWith(GAME_DIR)) { res.writeHead(403); res.end(); return; } return serve(res, f); }
  const f = path.normalize(path.join(PUB, p)); if (f.startsWith(PUB)) return serve(res, f);
  res.writeHead(404); res.end();
});

// ---------- WebSockets ----------
const wssGame = new WebSocketServer({ noServer: true }), wssPlay = new WebSocketServer({ noServer: true });
let game = null; const players = new Set();
server.on('upgrade', (req, sock, head) => {
  const p = new URL(req.url, 'http://x').pathname;
  if (p === '/ws/game') wssGame.handleUpgrade(req, sock, head, ws => wssGame.emit('connection', ws));
  else if (p === '/ws/play') wssPlay.handleUpgrade(req, sock, head, ws => wssPlay.emit('connection', ws));
  else sock.destroy();
});
const toGame = (o) => { if (game?.readyState === 1) game.send(JSON.stringify(o)); };
const toPlayers = (data, isBinary) => { for (const c of players) if (c.readyState === 1 && c.bufferedAmount < 2e6) c.send(data, { binary: isBinary }); };

wssGame.on('connection', ws => {
  game = ws; console.log('[Server] Spiel verbunden');
  ws.on('message', (data, isBinary) => {
    if (isBinary) return toPlayers(data, true);
    const m = JSON.parse(data.toString());
    if (m.t === 'config') { state.config = m; console.log('[Server] Video', m.codec, m.w + '×' + m.h, m.fps + ' fps', m.hw); }
    else if (m.t === 'hud') state.hud = m.html;
    else if (m.t === 'map') state.map = m.src;
    else if (m.t === 'stats') { state.stats = m; return; }
    else if (m.t === 'resize') { page?.setViewportSize({ width: m.w, height: m.h }).catch(() => {}); return; }
    toPlayers(JSON.stringify(m), false);
  });
  ws.on('close', () => { if (game === ws) game = null; });
});
wssPlay.on('connection', ws => {
  players.add(ws); state.clients = players.size;
  if (!state.controller || state.controller.readyState !== 1) state.controller = ws; // erster Spieler steuert, weitere schauen zu
  ws.send(JSON.stringify({ t: 'role', control: state.controller === ws }));
  if (state.config) ws.send(JSON.stringify(state.config));
  if (state.hud) ws.send(JSON.stringify({ t: 'hud', html: state.hud }));
  if (state.map) ws.send(JSON.stringify({ t: 'map', src: state.map }));
  toGame({ t: 'keyframe' });
  ws.on('message', data => {
    const m = JSON.parse(data.toString());
    if (m.t === 'ping') { ws.send(JSON.stringify({ t: 'pong', c: m.c })); return; }
    if (m.t === 'keyframe') return toGame(m);
    if (m.t === 'codecs' && (ws === state.controller || !state.controller)) return toGame(m);
    if (ws === state.controller) toGame(m);
  });
  ws.on('close', () => {
    players.delete(ws); state.clients = players.size;
    if (state.controller === ws) { state.controller = [...players][0] ?? null; state.controller?.send(JSON.stringify({ t: 'role', control: true })); for (const code of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft']) toGame({ t: 'key', code, down: false }); toGame({ t: 'joy', x: 0, y: 0 }); }
  });
});

// ---------- Spiel im Server-Browser ----------
let browser = null, page = null;
async function startGame() {
  browser = await chromium.launch({ headless: true, args: [...GPU_ARGS, '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1 });
  page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error' || /Leistung|Kodierer|WebGPU|Fehler/.test(m.text())) console.log('[Spiel]', m.text().slice(0, 300)); });
  page.on('crash', () => { console.log('[Server] Spiel abgestürzt – Neustart'); restart(); });
  const url = `http://127.0.0.1:${PORT}/game/index.html?stream&q=${QUALITY}&fps=${FPS}${process.env.WEBGPU ? '&webgpu' : '&webgl'}`;
  await page.goto(url);
  const gpu = await page.evaluate(() => { const c = document.createElement('canvas').getContext('webgl2'); const e = c?.getExtension('WEBGL_debug_renderer_info'); return e ? c.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'unbekannt'; });
  console.log('[Server] Spiel geladen –', url, '– Grafik:', gpu); state.stats.gpu = gpu;
}
async function restart() { try { await browser?.close(); } catch { /* egal */ } setTimeout(() => startGame().catch(e => console.error(e)), 1000); }

server.listen(PORT, '0.0.0.0', () => { console.log(`[Server] http://localhost:${PORT}  (Spiel aus ${GAME_DIR})`); startGame().catch(e => { console.error('[Server] Start fehlgeschlagen', e); process.exit(1); }); });
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, async () => { try { await browser?.close(); } catch { /* egal */ } process.exit(0); });
