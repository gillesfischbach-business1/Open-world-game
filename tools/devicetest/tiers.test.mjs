// Prüft die Startstufen-Wahl für alle Geräteprofile (ohne Browser, in Sekunden).
// Aufruf: node tools/devicetest/tiers.test.mjs   (Node ≥ 22.18, liest TypeScript direkt)
import { chooseTier, gpuClass } from '../../src/core/perf.ts';
import { DEVICES } from './devices.mjs';
let fail = 0;
for (const d of DEVICES) {
  const r = chooseTier({ gpu: d.gpu, webgpu: d.webgpu, mem: d.mem ?? null, cores: d.cores, mobile: !!d.pw, screenW: 400, screenH: 850, dpr: 3, touch: !!d.pw, ua: '' });
  const ok = r.tier === d.expect; if (!ok) fail++;
  console.log(`${ok ? 'OK  ' : 'FEHL'} ${d.name.padEnd(32)} → ${r.tier.padEnd(4)} (erwartet ${d.expect}) | ${r.reasons.join('; ')}`);
}
// Grenzfälle der Grafikchip-Einordnung
const cases = [['Google SwiftShader', 0], ['llvmpipe (LLVM 15.0.7, 256 bits)', 0], ['Mali-T880', 0], ['PowerVR Rogue GE8320', 0], ['Adreno (TM) 506', 0],
  ['Adreno (TM) 618', 1], ['Mali-G57 MC2', 1], ['Intel(R) Iris(R) Xe Graphics', 1], ['ANGLE (Intel, Intel(R) HD Graphics 4000, OpenGL 4.0)', 0],
  ['Adreno (TM) 740', 2], ['Apple M2', 2], ['AMD Radeon RX 6600', 2], ['Samsung Xclipse 920', 2]];
for (const [g, want] of cases) { const c = gpuClass(g, false); if (c !== want) { fail++; console.log(`FEHL Grafikchip „${g}“ → ${c}, erwartet ${want}`); } }
console.log(fail ? `\n${fail} Fehler` : `\nAlle ${DEVICES.length} Geräte und ${cases.length} Grafikchip-Fälle richtig eingeordnet.`);
process.exit(fail ? 1 : 0);
