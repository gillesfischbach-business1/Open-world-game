// Rechnet den HDR-Himmel einmal in Babylons vorgefiltertes .env-Format um (kleiner, keine Umrechnung auf dem Gerät).
// Aufruf (Spiel muss gebaut sein und unter http://127.0.0.1:8791 laufen): node tools/sky/make_env.js   (nur 1k: die 2k-Fassung lud nicht – Spiel nutzt dort das HDR)
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const [hdr, name] of [['1k', 'sky_1k.env']].filter(x => !process.argv[2] || x[0] === process.argv[2])) {
    const p = await (await b.newContext({ viewport: { width: 320, height: 200 } })).newPage();
    await p.goto('http://127.0.0.1:8791/index.html?webgl&noenv&q=low&hdr=' + hdr);
    await p.waitForFunction(() => window.__letz, null, { timeout: 600000, polling: 1000 });
    const b64 = await p.evaluate(() => window.__letz.makeEnv());
    const out = path.join(__dirname, '../../public/assets/hdri', name); fs.writeFileSync(out, Buffer.from(b64, 'base64'));
    console.log(name, (fs.statSync(out).size / 1e3).toFixed(0), 'kB');
  }
  await b.close();
})();
