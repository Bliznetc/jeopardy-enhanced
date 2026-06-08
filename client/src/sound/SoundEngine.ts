export type SoundName =
  | 'select'
  | 'buzz'
  | 'correct'
  | 'wrong'
  | 'timeUp'
  | 'dailyDouble'
  | 'finalThink'
  | 'roundStart'
  | 'gameOver';

// Optional CC0 files served from client/public/sounds/. Missing/undecodable
// files transparently fall back to a synthesized tone (see playSynth).
const FILES: Record<SoundName, string> = {
  select: '/sounds/select.mp3',
  buzz: '/sounds/buzz.mp3',
  correct: '/sounds/correct.mp3',
  wrong: '/sounds/wrong.mp3',
  timeUp: '/sounds/time-up.mp3',
  dailyDouble: '/sounds/daily-double.mp3',
  finalThink: '/sounds/final-think.mp3',
  roundStart: '/sounds/round-start.mp3',
  gameOver: '/sounds/game-over.mp3',
};

// Synth descriptors: a sequence of {freq, start, dur, type, gain} notes.
type Note = { freq: number; start: number; dur: number; type?: OscillatorType; gain?: number };
const SYNTH: Record<SoundName, Note[]> = {
  select: [{ freq: 880, start: 0, dur: 0.08, type: 'sine', gain: 0.3 }],
  buzz: [{ freq: 196, start: 0, dur: 0.35, type: 'square', gain: 0.35 }],
  correct: [
    { freq: 660, start: 0, dur: 0.1 },
    { freq: 990, start: 0.1, dur: 0.18 },
  ],
  wrong: [
    { freq: 160, start: 0, dur: 0.18, type: 'sawtooth', gain: 0.3 },
    { freq: 120, start: 0.18, dur: 0.28, type: 'sawtooth', gain: 0.3 },
  ],
  timeUp: [
    { freq: 440, start: 0, dur: 0.12 },
    { freq: 440, start: 0.16, dur: 0.12 },
    { freq: 330, start: 0.32, dur: 0.3 },
  ],
  dailyDouble: [
    { freq: 523, start: 0, dur: 0.1 },
    { freq: 659, start: 0.1, dur: 0.1 },
    { freq: 784, start: 0.2, dur: 0.1 },
    { freq: 1047, start: 0.3, dur: 0.25 },
  ],
  finalThink: [
    { freq: 392, start: 0, dur: 0.4 },
    { freq: 330, start: 0.4, dur: 0.4 },
    { freq: 294, start: 0.8, dur: 0.4 },
    { freq: 392, start: 1.2, dur: 0.5 },
  ],
  roundStart: [
    { freq: 587, start: 0, dur: 0.12 },
    { freq: 784, start: 0.12, dur: 0.22 },
  ],
  gameOver: [
    { freq: 523, start: 0, dur: 0.15 },
    { freq: 659, start: 0.15, dur: 0.15 },
    { freq: 784, start: 0.3, dur: 0.15 },
    { freq: 1047, start: 0.45, dur: 0.4 },
  ],
};

class SoundEngine {
  private ctx: AudioContext | null = null;
  private buffers = new Map<SoundName, AudioBuffer | null>();
  private loading = new Map<SoundName, Promise<void>>();
  private muted: boolean;

  constructor() {
    this.muted = localStorage.getItem('jeopardy.muted') === '1';
  }

  isMuted() {
    return this.muted;
  }

  setMuted(m: boolean) {
    this.muted = m;
    localStorage.setItem('jeopardy.muted', m ? '1' : '0');
  }

  // Browsers block audio until a user gesture; call this from a click/keydown.
  resume() {
    if (!this.ctx) {
      const Ctor: typeof AudioContext | undefined =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private ensureBuffer(name: SoundName): Promise<void> {
    if (this.buffers.has(name) || !this.ctx) return Promise.resolve();
    const existing = this.loading.get(name);
    if (existing) return existing;
    const p = (async () => {
      try {
        const res = await fetch(FILES[name]);
        if (!res.ok) throw new Error('missing');
        const arr = await res.arrayBuffer();
        this.buffers.set(name, await this.ctx!.decodeAudioData(arr));
      } catch {
        this.buffers.set(name, null); // null => synthesize instead
      }
    })();
    this.loading.set(name, p);
    return p;
  }

  async play(name: SoundName) {
    if (this.muted) return;
    this.resume();
    if (!this.ctx) return;
    await this.ensureBuffer(name);
    const buf = this.buffers.get(name);
    if (buf) this.playBuffer(buf);
    else this.playSynth(name);
  }

  private playBuffer(buf: AudioBuffer) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.value = 0.6;
    src.connect(gain).connect(ctx.destination);
    src.start();
  }

  private playSynth(name: SoundName) {
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    for (const n of SYNTH[name]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = n.type ?? 'sine';
      osc.frequency.value = n.freq;
      const peak = n.gain ?? 0.25;
      const t0 = now + n.start;
      // Short attack + exponential release so notes don't click.
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + n.dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + n.dur + 0.02);
    }
  }
}

export const sound = new SoundEngine();
