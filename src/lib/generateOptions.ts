function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function randomSign(): 1 | -1 {
  return Math.random() < 0.5 ? 1 : -1
}

export function generateOptions(correct: number): number[] {
  if (correct === 0) return [0, 1, 5].sort(() => Math.random() - 0.5)

  let nearby: number
  let outlier: number

  const isYear = correct >= 1000 && correct <= 2200

  if (isYear) {
    // Absolute offsets: nearby ±5–25, outlier ±30–80
    nearby = correct + randomSign() * randomInt(5, 25)
    nearby = Math.max(1000, Math.min(2200, nearby))

    outlier = correct + randomSign() * randomInt(30, 80)
    outlier = Math.max(1000, Math.min(2200, outlier))
  } else if (correct >= 1 && correct <= 99) {
    // Small numbers: absolute offsets
    nearby = correct + randomSign() * randomInt(1, 5)
    nearby = Math.max(1, nearby)

    outlier = correct + randomSign() * randomInt(10, 30)
    outlier = Math.max(1, outlier)
  } else if (correct >= 100 && correct <= 999) {
    // Medium numbers: percentage offsets 5–15% nearby, 20–40% outlier
    const nearbyPct = (randomInt(5, 15) / 100) * randomSign()
    nearby = Math.round(correct * (1 + nearbyPct))
    nearby = Math.max(1, nearby)

    const outlierPct = (randomInt(20, 40) / 100) * randomSign()
    outlier = Math.round(correct * (1 + outlierPct))
    outlier = Math.max(1, outlier)
  } else {
    // Large numbers (1000+ but not years): 10–20% nearby, 30–60% outlier
    const nearbyPct = (randomInt(10, 20) / 100) * randomSign()
    nearby = Math.round(correct * (1 + nearbyPct))
    nearby = Math.max(1, nearby)

    const outlierPct = (randomInt(30, 60) / 100) * randomSign()
    outlier = Math.round(correct * (1 + outlierPct))
    outlier = Math.max(1, outlier)
  }

  // Ensure nearby differs from correct
  if (nearby === correct) {
    nearby = isYear
      ? Math.max(1000, Math.min(2200, correct + 10))
      : correct + 1
  }

  // Ensure outlier differs from both correct and nearby
  if (outlier === correct || outlier === nearby) {
    outlier = isYear
      ? Math.max(1000, Math.min(2200, correct + 50))
      : correct * 2
  }

  // Final uniqueness guard: if still not unique, force distinct values
  const seen = new Set([correct])
  if (seen.has(nearby)) nearby = correct + (isYear ? 15 : Math.max(1, Math.round(correct * 0.1)))
  seen.add(nearby)
  if (seen.has(outlier)) outlier = correct + (isYear ? 60 : Math.max(1, Math.round(correct * 0.5)))

  return [correct, nearby, outlier].sort(() => Math.random() - 0.5)
}
