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

/** Largest power of 10 that divides |value| — the answer's own "roundness".
 *  17508 → 1, 86400 → 100, 6000 → 1000, 30000 → 10000. */
function trailingPrecision(value: number): number {
  let v = Math.abs(value)
  let step = 1
  while (v >= 10 && v % 10 === 0) {
    v /= 10
    step *= 10
  }
  return step
}

/** Distractors round to one magnitude finer than the correct answer's own
 *  trailing-zero precision, so they are never the "odd precise/round one". */
function precisionStep(correct: number): number {
  return Math.max(1, trailingPrecision(correct) / 10)
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
  /** Round distractors to multiples of this (1 = plain integer rounding). */
  roundStep: number
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

  const round = (v: number) => Math.round(v / spec.roundStep) * spec.roundStep
  let placed = spec.clamp(round(raw))

  const minAway = spec.mode === 'percent'
    ? Math.ceil(Math.abs(correct) * (offset / 100) * 0.8)
    : offset
  const maxAway = spec.mode === 'percent'
    ? Math.floor(Math.abs(correct) * ((spec.farMax + 2) / 100))
    : spec.farMax
  const step = spec.roundStep

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

  const step = spec.roundStep > 1
    ? spec.roundStep
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
        roundStep: 1,
        clamp: clampYear,
      }
    : correct >= 1 && correct <= 99
      ? {
          closeMin: 1,
          closeMax: 3,
          farMin: 3,
          farMax: 6,
          mode: 'absolute',
          roundStep: 1,
          clamp: clampPositive,
        }
      : correct >= 100 && correct <= 999
        ? {
            closeMin: 4,
            closeMax: 10,
            farMin: 10,
            farMax: 18,
            mode: 'percent',
            roundStep: 1,
            clamp: clampPositive,
          }
        : {
            closeMin: 5,
            closeMax: 10,
            farMin: 10,
            farMax: 18,
            mode: 'percent',
            // Match the answer's own precision so distractors don't stand
            // out as "the round ones" (e.g. 17508 vs 15000/19000).
            roundStep: precisionStep(correct),
            clamp: clampPositive,
          }

  const [close, far] = pickTraps(correct, spec)
  return shuffle([correct, close, far])
}
