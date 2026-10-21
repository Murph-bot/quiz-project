import { QUESTION_CATEGORIES, type QuestionCategory } from '@/lib/categories'

/**
 * A category guess for a CSV row whose category cell did not match any known
 * category exactly. Every failure mode is a distinct variant so the import
 * route can fall back to its existing error instead of inventing a category.
 */
export type CategorySuggestion =
  | { ok: true; category: QuestionCategory; confidence: number }
  | {
      ok: false
      reason: 'no_key' | 'timeout' | 'http_error' | 'bad_response' | 'no_match' | 'low_confidence'
    }

/** Rows below this are left to the import's own error. Tuned by testing guesses. */
export const MIN_CONFIDENCE = 0.7

const ENDPOINT = 'https://api.typesafe.ai/v1/systemone'
const MODEL = 'jev-latest'
const TIMEOUT_MS = 6000
const NO_MATCH = 'none'

const CATEGORY_DESCRIPTIONS: Record<QuestionCategory, string> = {
  Geography: 'Countries, cities, landforms, rivers, places on Earth',
  Nature: 'Plants, ecosystems, weather, natural phenomena',
  Animals: 'Species, animal behaviour, wildlife',
  'Music Industry': 'Artists, albums, charts, labels, music business',
  Nations: 'Flags, capitals, populations, country facts',
  'Popular Products': 'Brands, consumer goods, product facts',
  'Popular Tools': 'Hardware, software, apps, power tools',
  History: 'Past events, eras, historical figures',
  'Music Instruments': 'Instruments, how they are played, their parts',
  Sodas: 'Soft drinks, soda brands, soda history',
  'Alcoholic Drinks': 'Beer, wine, spirits, cocktails',
  'Pop Culture': 'Celebrities, viral moments, internet culture',
  Movies: 'Films, actors, directors, box office',
  'Formula 1': 'Drivers, teams, circuits, F1 history',
  'Food & Drink': 'Meals, ingredients, cooking, beverages',
  Technology: 'Computing, programming, engineering, electronics',
  '00s Nostalgia': '2000s memes, gadgets, media, trends',
  Money: 'Currencies, prices, finance, economics',
  Science: 'Physics, chemistry, biology, space, mathematics',
  Sports: 'Teams, athletes, competitions, records',
}

/** Only called when the row's category cell already failed to match. */
export function buildSuggestRequest(questionText: string) {
  const criteria: Record<string, string> = {}
  for (const category of QUESTION_CATEGORIES) {
    criteria[category] = CATEGORY_DESCRIPTIONS[category]
  }
  criteria[NO_MATCH] = 'The question does not clearly fit any listed category'

  return {
    model: MODEL,
    state: `Trivia question: ${questionText}`,
    questions: {
      category: {
        type: 'choice',
        instructions: 'Which trivia category does this question belong to',
        criteria,
      },
    },
  }
}

/**
 * Parse the wire answer into the union. An unknown label is a closed-set
 * violation, not a category, so it can never reach the insert.
 */
export function parseSuggestResponse(raw: unknown): CategorySuggestion {
  if (typeof raw !== 'object' || raw === null) return { ok: false, reason: 'bad_response' }

  const answers = (raw as { answers?: unknown }).answers
  if (typeof answers !== 'object' || answers === null) return { ok: false, reason: 'bad_response' }

  const answer = (answers as { category?: unknown }).category
  if (typeof answer !== 'object' || answer === null) return { ok: false, reason: 'bad_response' }

  const { choice, confidence } = answer as { choice?: unknown; confidence?: unknown }
  if (typeof choice !== 'string') return { ok: false, reason: 'bad_response' }
  if (typeof confidence !== 'number' || Number.isNaN(confidence)) {
    return { ok: false, reason: 'bad_response' }
  }

  if (choice === NO_MATCH) return { ok: false, reason: 'no_match' }
  if (!(QUESTION_CATEGORIES as readonly string[]).includes(choice)) {
    return { ok: false, reason: 'bad_response' }
  }
  if (confidence < MIN_CONFIDENCE) return { ok: false, reason: 'low_confidence' }

  return { ok: true, category: choice as QuestionCategory, confidence }
}

export async function suggestCategory(
  questionText: string,
  opts: { apiKey?: string; fetchImpl?: typeof fetch } = {},
): Promise<CategorySuggestion> {
  const apiKey = opts.apiKey ?? process.env.TYPESAFE_API_KEY
  if (!apiKey) return { ok: false, reason: 'no_key' }

  const doFetch = opts.fetchImpl ?? fetch
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const res = await doFetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildSuggestRequest(questionText)),
      signal: controller.signal,
    })

    if (!res.ok) return { ok: false, reason: 'http_error' }
    return parseSuggestResponse(await res.json())
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError'
    return { ok: false, reason: aborted ? 'timeout' : 'http_error' }
  } finally {
    clearTimeout(timer)
  }
}
