export type SfxName = 'tick' | 'lockIn' | 'eliminated' | 'survived' | 'victory' | 'roundStart'

const MUTE_KEY = 'qk-muted'

let ctx: AudioContext | null = null

type AudioContextCtor = typeof AudioContext

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const AC: AudioContextCtor | undefined =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext
  if (!AC) return null
  ctx ??= new AC()
  // Browsers start AudioContext suspended until a user gesture.
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

export function isMuted(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(MUTE_KEY) === '1'
}

export function setMuted(muted: boolean): void {
  localStorage.setItem(MUTE_KEY, muted ? '1' : '0')
}

function tone(
  c: AudioContext,
  freq: number,
  startSec: number,
  durSec: number,
  type: OscillatorType,
  volume: number,
): void {
  const osc = c.createOscillator()
  const gain = c.createGain()
  const t = c.currentTime + startSec
  osc.type = type
  osc.frequency.value = freq
  gain.gain.setValueAtTime(0, t)
  gain.gain.linearRampToValueAtTime(volume, t + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.001, t + durSec)
  osc.connect(gain).connect(c.destination)
  osc.start(t)
  osc.stop(t + durSec + 0.05)
}

/** Fire-and-forget synthesized sound — no audio assets needed. */
export function playSfx(name: SfxName): void {
  if (isMuted()) return
  const c = getContext()
  if (!c) return
  switch (name) {
    case 'tick':
      tone(c, 880, 0, 0.06, 'sine', 0.08)
      break
    case 'lockIn':
      tone(c, 520, 0, 0.08, 'sine', 0.12)
      tone(c, 780, 0.07, 0.12, 'sine', 0.12)
      break
    case 'eliminated':
      tone(c, 300, 0, 0.35, 'sawtooth', 0.14)
      tone(c, 150, 0.06, 0.4, 'sawtooth', 0.11)
      break
    case 'survived':
      tone(c, 523, 0, 0.12, 'triangle', 0.11)
      tone(c, 659, 0.1, 0.12, 'triangle', 0.11)
      tone(c, 784, 0.2, 0.22, 'triangle', 0.11)
      break
    case 'victory':
      tone(c, 523, 0, 0.15, 'triangle', 0.14)
      tone(c, 659, 0.15, 0.15, 'triangle', 0.14)
      tone(c, 784, 0.3, 0.15, 'triangle', 0.14)
      tone(c, 1047, 0.45, 0.35, 'triangle', 0.14)
      break
    case 'roundStart':
      tone(c, 660, 0, 0.1, 'sine', 0.09)
      break
  }
}
