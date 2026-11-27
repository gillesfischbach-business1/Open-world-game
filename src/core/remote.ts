import type { Scene, AbstractEngine } from '@babylonjs/core';
import type { Input } from './input';

/**
 * Cloud-Betrieb (Link mit ?stream): Das Spiel läuft auf einem Server mit Grafikkarte.
 * - Jedes gerenderte Bild wird mit WebCodecs als H.264 kodiert und per WebSocket an den Server geschickt,
 *   der es an die Spieler weiterreicht (server/server.mjs → server/public/play.html).
 * - Die Oberfläche (#hud, Gesprächsfenster, Hinweise) wird als HTML mitgeschickt, damit sie beim Spieler
 *   scharf über dem Video liegt; die kleine Karte als Bild.
 * - Eingaben des Spielers kommen als JSON zurück und laufen durch dieselbe Input-Klasse wie Tastatur/Touch.
 *
 * Bildpaket (binär): [1 Byte: 1 = Schlüsselbild, 0 = Folgebild][8 Byte Zeitstempel µs][H.264 Annex B]
 */
export interface RemoteMsg { t: 'key'; code: string; down: boolean }
export type InMsg = RemoteMsg | { t: 'look'; dx: number; dy: number } | { t: 'joy'; x: number; y: number } | { t: 'keyframe' }
  | { t: 'click'; i: number } | { t: 'size'; w: number; h: number } | { t: 'codecs'; list: string[] };

export class Remote {
  private ws: WebSocket; private enc: VideoEncoder | null = null; private last = 0; private frameNo = 0; private wantKey = true;
  private hudLast = ''; private mapLast = ''; private hudT = 0; private statT = 0; private cfgMsg: object | null = null; private codecs = ['avc1.640028', 'avc1.42E01F', 'vp09.00.10.08', 'vp8']; private w = 0; private h = 0;
  readonly fps: number;
  constructor(private scene: Scene, private engine: AbstractEngine, private input: Input, private canvas: HTMLCanvasElement) {
    const q = new URLSearchParams(location.search);
    this.fps = +(q.get('fps') || 30);
    this.ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws/game');
    this.ws.binaryType = 'arraybuffer';
    this.ws.onopen = () => { if (this.cfgMsg) this.send(this.cfgMsg); this.wantKey = true; this.hudLast = ''; this.mapLast = ''; };
    this.ws.onmessage = e => this.onMsg(JSON.parse(e.data as string) as InMsg);
    this.ws.onclose = () => setTimeout(() => location.reload(), 2000); // Server neu gestartet → neu verbinden
    scene.onAfterRenderObservable.add(() => this.capture());
  }
  private send(o: unknown) { if (this.ws.readyState === 1) this.ws.send(typeof o === 'string' || o instanceof ArrayBuffer ? o : JSON.stringify(o)); }

  private async setup(w: number, h: number) {
    this.enc?.close(); this.w = w; this.h = h;
    const enc = new VideoEncoder({
      output: (chunk) => {
        const buf = new ArrayBuffer(9 + chunk.byteLength), v = new DataView(buf);
        v.setUint8(0, chunk.type === 'key' ? 1 : 0); v.setFloat64(1, chunk.timestamp); chunk.copyTo(new Uint8Array(buf, 9));
        if (this.ws.bufferedAmount < 4e6) this.send(buf); // Leitung voll → Bild auslassen statt stauen
        else this.wantKey = true;
      },
      error: (e) => { console.error('Kodierer', e); this.enc = null; },
    });
    // Erstes Format, das der Spieler abspielen kann (er meldet seine Liste); Hardware-Kodierung bevorzugt, sonst Software
    let cfg: VideoEncoderConfig | null = null;
    for (const codec of this.codecs) for (const hw of ['prefer-hardware', 'prefer-software'] as const) {
      if (cfg) break;
      const c: VideoEncoderConfig = { codec, width: w, height: h, bitrate: Math.round(w * h * this.fps * (codec.startsWith('avc') ? 0.12 : 0.1)), framerate: this.fps, latencyMode: 'realtime', hardwareAcceleration: hw, ...(codec.startsWith('avc') ? { avc: { format: 'annexb' as const } } : {}) };
      try { if ((await VideoEncoder.isConfigSupported(c)).supported) cfg = c; } catch { /* nächstes */ }
    }
    if (!cfg) { console.error('Kodierer: kein passendes Format für', this.codecs); return; }
    enc.configure(cfg); this.enc = enc; this.wantKey = true;
    this.cfgMsg = { t: 'config', codec: cfg.codec, w, h, fps: this.fps, hw: cfg.hardwareAcceleration }; this.send(this.cfgMsg);
  }

  private capture() {
    const now = performance.now();
    if (now - this.last < 1000 / this.fps - 2) return; this.last = now;
    const w = this.canvas.width & ~1, h = this.canvas.height & ~1;
    if (w !== this.w || h !== this.h) { this.setup(w, h); return; }
    if (!this.enc || this.enc.encodeQueueSize > 2) return; // Kodierer kommt nicht nach → Bild auslassen
    const f = new VideoFrame(this.canvas, { timestamp: Math.round(now * 1000), visibleRect: { x: 0, y: 0, width: w, height: h } });
    const key = this.wantKey || this.frameNo++ % (this.fps * 4) === 0; this.wantKey = false;
    this.enc.encode(f, { keyFrame: key }); f.close();
    if (now - this.hudT > 150) { this.hudT = now; this.sendHud(); }
    if (now - this.statT > 2000) { this.statT = now; const pl = (window as unknown as { __letz?: { player: { position: { x: number; z: number } } } }).__letz?.player.position; this.send({ t: 'stats', fps: Math.round(this.engine.getFps()), w, h, queue: this.enc.encodeQueueSize, pos: pl ? [Math.round(pl.x * 10) / 10, Math.round(pl.z * 10) / 10] : null }); }
  }

  /** Oberfläche als HTML (nur bei Änderung) und Karte als kleines Bild */
  private sendHud() {
    const hud = document.getElementById('hud'), over = Array.from(document.querySelectorAll('body > .intro')).map(e => e.outerHTML).join('');
    const html = (hud?.innerHTML ?? '') + over;
    if (html !== this.hudLast) { this.hudLast = html; this.send({ t: 'hud', html }); }
    const map = hud?.querySelector('canvas.map') as HTMLCanvasElement | null;
    if (map) { const d = map.toDataURL('image/webp', 0.7); if (d !== this.mapLast) { this.mapLast = d; this.send({ t: 'map', src: d }); } }
  }

  private onMsg(m: InMsg) {
    switch (m.t) {
      case 'key': dispatchEvent(new KeyboardEvent(m.down ? 'keydown' : 'keyup', { code: m.code })); break;
      case 'look': this.input.look.x += m.dx; this.input.look.y += m.dy; break;
      case 'joy': this.input.setRemoteJoy(m.x, m.y); break;
      case 'keyframe': this.wantKey = true; break;
      case 'codecs': if (m.list.length && m.list.join() !== this.codecs.join()) { this.codecs = m.list; this.w = 0; } break; // beim nächsten Bild neu einrichten
      case 'click': { // Knopf in der Oberfläche (Gesprächsauswahl, Einführung …) – gleiche Reihenfolge wie beim Spieler
        const all = [...Array.from(document.querySelectorAll('#hud button')), ...Array.from(document.querySelectorAll('body > .intro button'))] as HTMLElement[];
        const b = all[m.i]; if (b) { b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); b.click(); }
        break;
      }
      case 'size': { // Seitenverhältnis des Spieler-Bildschirms übernehmen (Hochformat am Handy)
        const H = Math.min(1080, Math.max(360, Math.round(m.h))), W = Math.round(H * Math.max(0.4, Math.min(2.4, m.w / m.h)));
        this.send({ t: 'resize', w: W & ~1, h: H & ~1 }); break;
      }
    }
  }
}
