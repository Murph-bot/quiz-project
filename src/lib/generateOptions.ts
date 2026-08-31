function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function shuffle<T>(items: T[]): T[] {
  const next = [...items]
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = next[i]
    next[i] = next[j]
    next[j] = tmp
  }
  return next
}

function humanStep(value: number): number {
  const abs = Math.max(1, Math.abs(value))
  const magnitude = Math.pow(10, Math.floor(Math.log10(abs)))
  return Math.max(1, magnitude / 10)
}

function humanRound(value: number): number {
  if (value === 0) return 0
  const step = humanStep(value)
  return Math.round(value / step) * step
}

function clampPositive(value: number): number {
  return Math.max(1, value)
}

function clampYear(value: number): number {
  return Math.max(1000, Math.min(2200, value))
}

type TrapSpec = {
  closeMin: number
  closeMax: number
  farMin: number
  farMax: number
  mode: 'absolute' | 'percent'
  human: boolean
  clamp: (value: number) => number
}

function applyOffset(
  correct: number,
  sign: 1 | -1,
  offset: number,
  spec: TrapSpec
): number {
  const raw = spec.mode === 'percent'
    ? correct * (1 + (sign * offset) / 100)
    : correct + sign * offset

  const round = spec.human ? humanRound : Math.round
  let placed = spec.clamp(round(raw))

  const minAway = spec.mode === 'percent'
    ? Math.ceil(Math.abs(correct) * (offset / 100) * 0.8)
    : offset
  const maxAway = spec.mode === 'percent'
    ? Math.floor(Math.abs(correct) * ((spec.farMax + 2) / 100))
    : spec.farMax
  const step = spec.human ? humanStep(placed || correct) : 1

  for (let i = 0; i < 20; i++) {
    if (placed !== correct && Math.abs(placed - correct) >= minAway) break
    const next = spec.clamp(placed + sign * step)
    if (next === placed) break
    if (Math.abs(next - correct) > maxAway) break
    placed = next
  }

  return placed
}

function pickTraps(correct: number, spec: TrapSpec): [number, number] {
  const opposite: Array<[1 | -1, 1 | -1]> =
    Math.random() < 0.5 ? [[-1, 1], [1, -1]] : [[1, -1], [-1, 1]]
  const signPairs: Array<[1 | -1, 1 | -1]> = [
    ...opposite,
    [1, 1],
    [-1, -1],
  ]

  for (let attempt = 0; attempt < 24; attempt++) {
    const closeOffset = randomInt(spec.closeMin, spec.closeMax)
    let farOffset = randomInt(spec.farMin, spec.farMax)
    if (farOffset === closeOffset) {
      farOffset = farOffset >= spec.farMax ? farOffset - 1 : farOffset + 1
    }

    for (const [closeSign, farSign] of signPairs) {
      const close = applyOffset(correct, closeSign, closeOffset, spec)
      const far = applyOffset(correct, farSign, farOffset, spec)
      if (close !== correct && far !== correct && close !== far) {
        return [close, far]
      }
    }
  }

  const fallbackClose = applyOffset(correct, -1, spec.closeMin, spec)
  const fallbackFar = applyOffset(correct, 1, spec.farMax, spec)
  if (
    fallbackClose !== correct &&
    fallbackFar !== correct &&
    fallbackClose !== fallbackFar
  ) {
    return [fallbackClose, fallbackFar]
  }

  const step = spec.human
    ? humanStep(correct)
    : spec.mode === 'percent'
      ? Math.max(1, Math.round(Math.abs(correct) * (spec.closeMin / 100)))
      : 1
  let below = spec.clamp(correct - step)
  let above = spec.clamp(correct + step * 2)
  if (below === correct) below = spec.clamp(correct + step)
  if (above === correct || above === below) {
    above = spec.clamp(below === correct + step ? correct + step * 2 : correct + step)
  }
  return [below, above]
}

export function generateOptions(correct: number): number[] {
  if (correct === 0) {
    return shuffle([0, -randomInt(1, 2), randomInt(1, 2)])
  }

  const isYear = correct >= 1000 && correct <= 2200

  const spec: TrapSpec = isYear
    ? {
        closeMin: 2,
        closeMax: 8,
        farMin: 8,
        farMax: 18,
        mode: 'absolute',
        human: false,
        clamp: clampYear,
      }
    : correct >= 1 && correct <= 99
      ? {
          closeMin: 1,
          closeMax: 3,
          farMin: 3,
          farMax: 6,
          mode: 'absolute',
          human: false,
          clamp: clampPositive,
        }
      : correct >= 100 && correct <= 999
        ? {
            closeMin: 4,
            closeMax: 10,
            farMin: 10,
            farMax: 18,
            mode: 'percent',
            human: false,
            clamp: clampPositive,
          }
        : {
            closeMin: 5,
            closeMax: 10,
            farMin: 10,
            farMax: 18,
            mode: 'percent',
            human: true,
            clamp: clampPositive,
          }

  const [close, far] = pickTraps(correct, spec)
  return shuffle([correct, close, far])
}
