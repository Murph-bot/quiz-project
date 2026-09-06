/** Single source of truth for category validation — lobby, APIs, and CSV import.
 *  Canonical form is Title Case (what the import pipeline writes to the DB). */
export const QUESTION_CATEGORIES = [
  'Geography',
  'Nature',
  'Animals',
  'Music Industry',
  'Nations',
  'Popular Products',
  'Popular Tools',
  'History',
  'Music Instruments',
  'Sodas',
  'Alcoholic Drinks',
  'Pop Culture',
  'Movies',
  'Formula 1',
  'Food & Drink',
  'Technology',
  '00s Nostalgia',
  'Money',
  'Science',
  'Sports',
] as const

export type QuestionCategory = (typeof QUESTION_CATEGORIES)[number]

/** 'all' is a session-level option only — never a stored question category. */
export const VALID_CATEGORIES = ['all', ...QUESTION_CATEGORIES] as const

export type GameCategory = (typeof VALID_CATEGORIES)[number]

/** Case-insensitive validity check — accepts 'all' and any question category. */
export function isValidCategory(category: string): category is GameCategory {
  return (VALID_CATEGORIES as readonly string[]).some(
    (c) => c.toLowerCase() === category.trim().toLowerCase(),
  )
}

/** Returns the canonical (Title Case) form, or null if unknown. Accepts 'all'. */
export function canonicalCategory(raw: string): GameCategory | null {
  const found = (VALID_CATEGORIES as readonly string[]).find(
    (c) => c.toLowerCase() === raw.trim().toLowerCase(),
  )
  return (found as GameCategory | undefined) ?? null
}
