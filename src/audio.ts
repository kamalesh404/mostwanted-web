/** Procedural Web Audio: engine, siren, skid, crashes, cash — zero audio assets. */
export class GameAudio {
  ctx: AudioContext | null = null;
  muted = false;
  private engineOsc: OscillatorNode | null = null;
  private engineOsc2: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private sirenGain: GainNode | null = null;
  private skidGain: GainNode | null = null;
  private master: GainNode | null = null;

  init() {
    if (this.ctx) return;
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.8;
      this.master.connect(this.ctx.destination);
      this.buildEngine();
      this.buildSiren();
      this.buildSkid();
    } catch { /* no audio */ }
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
  }

  resume() { this.ctx?.resume(); }

  private buildEngine() {
    if (!this.ctx || !this.master) return;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 900;
    const o1 = this.ctx.createOscillator();
    o1.type = 'sawtooth';
    o1.frequency.value = 60;
    const o2 = this.ctx.createOscillator();
    o2.type = 'square';
    o2.frequency.value = 91;
    o1.connect(filt); o2.connect(filt); filt.connect(g); g.connect(this.master);
    o1.start(); o2.start();
    this.engineOsc = o1; this.engineOsc2 = o2; this.engineGain = g;
  }

  /** speed01: 0..1 of top speed; throttle01: 0..1 */
  engine(speed01: number, throttle01: number) {
    if (!this.ctx || !this.engineOsc || !this.engineOsc2 || !this.engineGain) return;
    const t = this.ctx.currentTime;
    const f = 55 + speed01 * 240;
    this.engineOsc.frequency.setTargetAtTime(f, t, 0.05);
    this.engineOsc2.frequency.setTargetAtTime(f * 1.5 + 3, t, 0.05);
    this.engineGain.gain.setTargetAtTime(0.05 + throttle01 * 0.11 + speed01 * 0.05, t, 0.1);
  }

  private buildSiren() {
    if (!this.ctx || !this.master) return;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = 700;
    const lfo = this.ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 1.4;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 180;
    lfo.connect(lfoGain); lfoGain.connect(o.frequency);
    o.connect(g); g.connect(this.master);
    o.start(); lfo.start();
    this.sirenGain = g;
  }

  /** intensity 0..1 — 0 disables siren */
  siren(intensity: number) {
    if (!this.ctx || !this.sirenGain) return;
    this.sirenGain.gain.setTargetAtTime(Math.min(0.2, intensity * 0.2), this.ctx.currentTime, 0.2);
  }

  private buildSkid() {
    if (!this.ctx || !this.master) return;
    const len = this.ctx.sampleRate * 1;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * 0.6;
    const src = this.ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'bandpass'; filt.frequency.value = 1100; filt.Q.value = 2;
    const g = this.ctx.createGain(); g.gain.value = 0;
    src.connect(filt); filt.connect(g); g.connect(this.master);
    src.start();
    this.skidGain = g;
  }

  skid(amount01: number) {
    if (!this.ctx || !this.skidGain) return;
    this.skidGain.gain.setTargetAtTime(amount01 * 0.25, this.ctx.currentTime, 0.08);
  }

  private blip(freq: number, dur: number, type: OscillatorType, vol = 0.3) {
    if (!this.ctx || !this.master) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    o.connect(g); g.connect(this.master);
    o.start(); o.stop(this.ctx.currentTime + dur);
  }

  crash(force01: number) { this.blip(70 + force01 * 60, 0.18, 'square', 0.2 + force01 * 0.4); }
  cash() { this.blip(880, 0.1, 'sine'); setTimeout(() => this.blip(1320, 0.14, 'sine'), 90); }
  beep() { this.blip(440, 0.12, 'sine'); }
  go() { this.blip(880, 0.35, 'sine'); }
  spike() { this.blip(200, 0.4, 'sawtooth', 0.4); }
  bust() { this.blip(160, 0.6, 'square', 0.4); }
}
