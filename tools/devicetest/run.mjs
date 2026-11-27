// Geräte-Emulationstest im Browser (Playwright/Chromium).
// Simuliert je Gerät: Bildschirm, Pixeldichte, Touch, Grafikchip-Name, Speicher, Kerne, Prozessor-Drosselung.
// Prüft: gewählte Startstufe, Bedienelemente (Größe, Überlappung, im Bild), Konsolenfehler, Leistungstest (?bench).
//
// Aufruf:  node tools/devicetest/run.mjs [--url http://127.0.0.1:8791/] [--out devicetest-out] [--devices iphone15pro,motog4] [--bench]
// Hinweis: In Containern ohne Grafikkarte rendert Chromium per Software (SwiftShader). Die Bildraten sind dann NICHT
// aussagekräftig – geprüft werden Erkennung, Bedienung und Abläufe. Echte Bildraten liefert ?bench auf dem echten Gerät.
import { chromium, devices as PW } from 'playwright';
import fs from 'node:fs';
import { DEVICES } from './devices.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const URL_ = arg('url', 'http://127.0.0.1:8791/'), OUT = arg('out', 'devicetest-out'), BENCH = process.argv.includes('--bench');
const only = arg('devices', '')?.split(',').filter(Boolean);
fs.mkdirSync(OUT, { recursive: true });

const spoof = d => `(() => {
  const R = ${JSON.stringify(d.gpu)};
  for (const C of [WebGLRenderingContext, typeof WebGL2RenderingContext !== 'undefined' ? WebGL2RenderingContext : null]) {
    if (!C) continue; const g = C.prototype.getParameter;
    C.prototype.getParameter = function (p) { if (p === 37446 || p === 0x1F01) return R; if (p === 37445) return 'Test'; return g.call(this, p); };
  }
  ${d.mem === undefined ? "try { delete Navigator.prototype.deviceMemory; } catch {}" : `Object.defineProperty(navigator, 'deviceMemory', { get: () => ${d.mem} });`}
  Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => ${d.cores} });
  ${d.webgpu ? "if (!('gpu' in navigator)) Object.defineProperty(navigator, 'gpu', { get: () => ({ requestAdapter: async () => null }) });" : ''}
})();`;

const rect = el => el ? (({ x, y, width, height }) => ({ x, y, w: width, h: height }))(el.getBoundingClientRect()) : null;
const results = [];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const d of DEVICES.filter(x => !only?.length || only.includes(x.id))) {
  const t0 = Date.now(), base = d.pw ? PW[d.pw] : { viewport: d.viewport, deviceScaleFactor: 1, isMobile: false, hasTouch: false };
  const ctx = await browser.newContext({ ...base, deviceScaleFactor: 1 }); // DPR 1: Software-Rendering ist sonst zu langsam; echte DPR steht im Profil
  await ctx.addInitScript(spoof(d));
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: d.cpu });
  const errors = [], perfLog = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { const t = m.text(); if (m.type() === 'error' && !/GL Driver|GPU stall/.test(t)) errors.push(t.slice(0, 200)); if (t.startsWith('[Leistung]')) perfLog.push(t); });
  const r = { id: d.id, name: d.name, expect: d.expect, errors, perfLog };
  try {
    await page.goto(URL_ + (URL_.includes('?') ? '&' : '?') + 'webgl' + (BENCH ? '&bench' : ''), { timeout: 120000 });
    await page.waitForFunction(() => window.__letz || /Fehler/.test(document.getElementById('ldtxt')?.textContent || ''), null, { timeout: 600000, polling: 2000 });
    r.loadS = (Date.now() - t0) / 1000;
    r.report = await page.evaluate(() => window.__letz?.perf?.report());
    r.tierOk = r.report?.tier === d.expect;
    // Bedienelemente prüfen
    r.ui = await page.evaluate(() => {
      const q = s => document.querySelector(s), R = el => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; };
      const vw = innerWidth, vh = innerHeight, out = { vw, vh, touch: document.body.classList.contains('touch'), problems: [] };
      const parts = { buttons: R(q('.btns')), mission: R(q('.mission')), map: R(q('.map')), clock: R(q('#uhr')) };
      out.parts = parts;
      const inside = b => b && b.x >= -1 && b.y >= -1 && b.x + b.w <= vw + 1 && b.y + b.h <= vh + 1;
      for (const [k, b] of Object.entries(parts)) if (b && b.w > 0 && !inside(b)) out.problems.push(`${k} ragt aus dem Bild`);
      const ov = (a, b) => a && b && a.w > 0 && b.w > 0 && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      if (ov(parts.mission, parts.map)) out.problems.push('Missionskarte überdeckt die Minikarte');
      if (ov(parts.mission, parts.buttons)) out.problems.push('Missionskarte überdeckt die Knöpfe');
      if (out.touch) for (const b of document.querySelectorAll('.btns button')) { const x = b.getBoundingClientRect(); if (x.width < 44 || x.height < 44) out.problems.push(`Knopf „${b.textContent}“ kleiner als 44 px`); }
      return out;
    });
    // Touch-Bedienung: Joystick ziehen und ZAP tippen (nur Touch-Geräte)
    if (r.ui.touch) {
      const before = await page.evaluate(() => window.__letz.player.position.clone());
      const zone = await page.$('.joy'); const zb = await zone.boundingBox();
      const cx = zb.x + zb.width * 0.4, cy = zb.y + zb.height * 0.6;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy, id: 1 }] });
      for (let i = 1; i <= 4; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx, y: cy - i * 12, id: 1 }] });
      await page.evaluate(() => new Promise(res => { let k = 0; const o = window.__letz.scene.onAfterRenderObservable.add(() => { if (++k > 6) { window.__letz.scene.onAfterRenderObservable.remove(o); res(); } }); }));
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      const after = await page.evaluate(() => window.__letz.player.position.clone());
      r.touchMoved = Math.hypot(after._x - before._x, after._z - before._z) > 0.05;
      if (!r.touchMoved) r.ui.problems.push('Joystick bewegt Blëtz nicht');
    }
    await page.screenshot({ path: `${OUT}/${d.id}.png`, timeout: 300000 });
    if (BENCH) { await page.waitForFunction(() => window.__bench, null, { timeout: 900000, polling: 5000 }); r.bench = await page.evaluate(() => window.__bench); await page.screenshot({ path: `${OUT}/${d.id}-bench.png`, timeout: 300000 }); }
  } catch (e) { r.fatal = String(e.message || e).slice(0, 300); }
  r.durationS = (Date.now() - t0) / 1000;
  results.push(r); console.log(`${r.fatal ? 'ABBRUCH' : r.tierOk && !r.errors.length && !r.ui?.problems.length ? 'OK     ' : 'PRÜFEN '} ${d.name.padEnd(32)} Stufe ${r.report?.tier ?? '?'} (erwartet ${d.expect}) · Probleme: ${[...(r.ui?.problems || []), ...r.errors].join(' | ') || 'keine'}${r.fatal ? ' · ' + r.fatal : ''}`);
  await ctx.close();
}
await browser.close();
fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(results, null, 1));
const md = ['# Geräte-Emulationstest', '', `Adresse: ${URL_} · ${new Date().toISOString()}`, '', '| Gerät | Stufe | erwartet | Touch | Probleme |', '|---|---|---|---|---|',
  ...results.map(r => `| ${r.name} | ${r.report?.tier ?? '–'} | ${r.expect} | ${r.ui?.touch ? (r.touchMoved ? 'geht' : 'FEHLER') : '–'} | ${[...(r.ui?.problems || []), ...r.errors, r.fatal].filter(Boolean).join('; ') || 'keine'} |`),
  '', '> Bildraten aus diesem Test sind nicht aussagekräftig (Software-Rendering). Für echte Werte: ?bench auf dem Gerät.'];
fs.writeFileSync(`${OUT}/report.md`, md.join('\n'));
process.exit(results.some(r => r.fatal || !r.tierOk || r.errors.length || r.ui?.problems.length) ? 1 : 0);
