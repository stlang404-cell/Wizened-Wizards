// Tiny procedural sound effects via WebAudio. No audio files required.
import type { Element } from '../sim/types';

let ctx: AudioContext | null = null;
let enabled = localStorage.getItem('ww-sound') !== 'off';
let master: GainNode | null = null;

function ac(): AudioContext | null {
  if (!enabled) return null;
  if (!ctx) {
    try {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = 0.22;
      master.connect(ctx.destination);
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

export function soundEnabled() {
  return enabled;
}
export function setSoundEnabled(v: boolean) {
  enabled = v;
  localStorage.setItem('ww-sound', v ? 'on' : 'off');
}

function tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.5, slide = 0, delay = 0) {
  const a = ac();
  if (!a || !master) return;
  const t = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g);
  g.connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur: number, vol = 0.4, freq = 1200, q = 1, delay = 0) {
  const a = ac();
  if (!a || !master) return;
  const t = a.currentTime + delay;
  const len = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  const g = a.createGain();
  g.gain.value = vol;
  src.connect(f);
  f.connect(g);
  g.connect(master);
  src.start(t);
}

const EL_FREQ: Record<Element, number> = { fire: 220, frost: 880, storm: 660, shadow: 140, venom: 300, arcane: 520, earth: 110, chrono: 440, life: 600 };

export const sfx = {
  cast(el: Element) {
    tone(EL_FREQ[el] * 0.5, 0.25, 'triangle', 0.2, 2);
  },
  release(el: Element) {
    noise(0.18, 0.25, EL_FREQ[el] * 3, 2);
    tone(EL_FREQ[el], 0.15, 'square', 0.08, 1.5);
  },
  hit(el: Element, big: boolean) {
    noise(big ? 0.35 : 0.15, big ? 0.6 : 0.35, el === 'storm' ? 3000 : el === 'frost' ? 4000 : 700, 1);
    tone(EL_FREQ[el] * 0.5, 0.2, 'sawtooth', big ? 0.18 : 0.08, 0.5);
  },
  shield() {
    tone(300, 0.4, 'sine', 0.2, 1.5);
    tone(450, 0.4, 'sine', 0.1, 1.5, 0.05);
  },
  shatter() {
    for (let i = 0; i < 5; i++) tone(1500 + i * 400, 0.12, 'square', 0.06, 0.6, i * 0.03);
    noise(0.3, 0.5, 5000, 2);
  },
  heal() {
    [523, 659, 784].forEach((f, i) => tone(f, 0.3, 'sine', 0.12, 1, i * 0.07));
  },
  dodge() {
    noise(0.12, 0.2, 2000, 4);
  },
  interrupt() {
    tone(200, 0.25, 'square', 0.15, 0.4);
  },
  victory() {
    [392, 523, 659, 784, 1046].forEach((f, i) => tone(f, 0.4, 'triangle', 0.18, 1, i * 0.11));
  },
  defeat() {
    [392, 330, 262, 196].forEach((f, i) => tone(f, 0.5, 'triangle', 0.15, 1, i * 0.16));
  },
  click() {
    tone(900, 0.05, 'square', 0.05);
  },
  discovery() {
    [523, 784, 1046, 1318, 1568].forEach((f, i) => tone(f, 0.5, 'sine', 0.14, 1, i * 0.09));
  },
};
