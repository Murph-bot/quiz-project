import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Check, Link2 } from 'lucide-react';
import knight from '@/assets/knight.png.asset.json';
import { Button } from '@/components/ui/button';
import type { Ranking } from '@/lib/game';

/** Plots every guess on a line around the true answer; farthest pins sit at the edges. */
export function GuessSpread({ ranking, answer, nameOf, me, fmt }: { ranking: Ranking[]; answer: number; nameOf: (id: string) => string; me: string; fmt: (n: number) => string }) {
  const guessed = ranking.filter(r => r.guess !== null && r.distance !== null);
  const max = Math.max(1, ...guessed.map(r => r.distance ?? 0));
  const worst = ranking.at(-1)?.id, best = ranking[0]?.id;
  return <div className="guess-spread" aria-label="Where every guess landed">
    <div className="spread-labels"><span>UNDER</span><span>THE TRUTH</span><span>OVER</span></div>
    <div className="spread-line"><i className="spread-truth" />
      {guessed.map((r, i) => { const pos = 50 + ((r.guess! - answer) / max) * 46; return <span key={r.id} className={`spread-pin ${r.id === best ? 'best' : ''} ${r.id === worst ? 'worst' : ''} ${r.id === me ? 'mine' : ''}`} style={{ left: `${pos}%`, top: `${i % 2 ? 62 : 8}%`, animationDelay: `${i * 70}ms` }} title={`${nameOf(r.id)}: ${fmt(r.guess!)}`}>{nameOf(r.id).slice(0, 2).toUpperCase()}</span>; })}
    </div>
  </div>;
}

/** Client-only suspense stages for a reveal: 0 answer, 1 bullseye + spread, 2 full ranking. */
export function useRevealStage(key: string, active: boolean) {
  const [stage, setStage] = useState(2);
  useEffect(() => {
    if (!active) { setStage(2); return; }
    setStage(0);
    const a = setTimeout(() => setStage(1), 1300), b = setTimeout(() => setStage(2), 2900);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [key, active]);
  return stage;
}

export function LobbyShare({ code }: { code: string }) {
  const [url, setUrl] = useState(''), [copied, setCopied] = useState(false);
  useEffect(() => setUrl(`${window.location.origin}/?join=${code}`), [code]);
  if (!url) return null;
  return <div className="lobby-share">
    <div className="qr-frame"><QRCodeSVG value={url} size={152} level="H" bgColor="transparent" fgColor="currentColor" imageSettings={{ src: knight.url, height: 34, width: 34, excavate: true }} /></div>
    <div><strong>Scan to join</strong><p>Point a phone camera here — the room code fills in automatically.</p>
      <Button variant="outline" onClick={async () => { try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard blocked */ } }}>{copied ? <Check /> : <Link2 />} {copied ? 'Link copied' : 'Copy invite link'}</Button></div>
  </div>;
}

export function QuickNudges({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const n = Number(value) || 0;
  const set = (v: number) => { onChange(String(Math.round(v * 1000) / 1000)); vibrate(10); };
  return <div className="quick-nudges">
    {[-100, -10, 10, 100, 1000].map(d => <Button key={d} type="button" variant="outline" onClick={() => set(n + d)}>{d > 0 ? '+' : '−'}{Math.abs(d).toLocaleString()}</Button>)}
    <Button type="button" variant="outline" onClick={() => set(n * 10)}>×10</Button>
  </div>;
}

export function vibrate(pattern: number | number[]) { try { navigator.vibrate?.(pattern); } catch { /* optional */ } }

/** Keeps the phone screen awake while inside a room. */
export function useWakeLock(on: boolean) {
  useEffect(() => {
    if (!on || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null, alive = true;
    const get = async () => { try { if (document.visibilityState === 'visible') lock = await navigator.wakeLock.request('screen'); } catch { /* denied */ } };
    const vis = () => { if (alive) void get(); };
    void get(); document.addEventListener('visibilitychange', vis);
    return () => { alive = false; document.removeEventListener('visibilitychange', vis); void lock?.release(); };
  }, [on]);
}

/** Layered synth effects: richer than single beeps, no audio files needed. */
export type Sfx = 'tick' | 'final-tick' | 'lock' | 'reveal' | 'bullseye' | 'shatter' | 'fanfare' | 'start';
export function playSfx(ctx: AudioContext, kind: Sfx) {
  const t = ctx.currentTime;
  const note = (f: number, at: number, len: number, type: OscillatorType = 'triangle', vol = .07, slide?: number) => {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f, t + at);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + at + len);
    g.gain.setValueAtTime(0.0001, t + at); g.gain.exponentialRampToValueAtTime(vol, t + at + .01); g.gain.exponentialRampToValueAtTime(.0001, t + at + len);
    o.connect(g); g.connect(ctx.destination); o.start(t + at); o.stop(t + at + len + .02);
  };
  const noise = (at: number, len: number, vol = .12) => {
    const buf = ctx.createBuffer(1, ctx.sampleRate * len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2;
    const s = ctx.createBufferSource(), g = ctx.createGain(), f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1800;
    s.buffer = buf; g.gain.value = vol; s.connect(f); f.connect(g); g.connect(ctx.destination); s.start(t + at);
  };
  if (kind === 'tick') { note(70, 0, .12, 'sine', .25); note(55, .14, .1, 'sine', .15); }
  if (kind === 'final-tick') { note(90, 0, .18, 'sine', .3); note(880, 0, .1, 'square', .03); }
  if (kind === 'lock') { note(520, 0, .08); note(780, .07, .14); }
  if (kind === 'start') { [392, 523, 659].forEach((f, i) => note(f, i * .09, .2, 'sawtooth', .04)); }
  if (kind === 'reveal') { note(110, 0, .9, 'sawtooth', .05, 220); note(55, 0, .6, 'sine', .2); }
  if (kind === 'bullseye') { [784, 988, 1319].forEach((f, i) => note(f, i * .06, .3, 'triangle', .06)); }
  if (kind === 'shatter') { noise(0, .45); note(300, 0, .4, 'square', .05, 60); }
  if (kind === 'fanfare') { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => note(f, i * .14, i === 5 ? .8 : .18, 'sawtooth', .05)); }
}
