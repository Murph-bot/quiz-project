/** Single source of truth for lobby/API category validation */
export const VALID_CATEGORIES = [
  'all',
  'geography',
  'nature',
  'animals',
  'music industry',
  'nations',
  'popular products',
  'popular tools',
  'history',
  'music instruments',
  'sodas',
  'alcoholic drinks',
  'pop culture',
  'movies',
  'formula 1',
  'food & drink',
  'technology',
  '00s nostalgia',
  'money',
] as const

export type GameCategory = (typeof VALID_CATEGORIES)[number]

export function isValidCategory(category: string): category is GameCategory {
  return (VALID_CATEGORIES as readonly string[]).includes(category)
}
