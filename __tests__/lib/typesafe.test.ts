import { MIN_CONFIDENCE, buildSuggestRequest, parseSuggestResponse, suggestCategory } from '@/lib/typesafe'

function wire(choice: unknown, confidence: unknown) {
  return { answers: { category: { type: 'choice', choice, confidence } } }
}

describe('parseSuggestResponse', () => {
  it('accepts a known category above the confidence floor', () => {
    expect(parseSuggestResponse(wire('Sports', 1))).toEqual({ ok: true, category: 'Sports', confidence: 1 })
  })

  it('treats the no-match label as no_match, not as a category', () => {
    expect(parseSuggestResponse(wire('none', 0.99))).toEqual({ ok: false, reason: 'no_match' })
  })

  it('rejects a label that is not a known category', () => {
    expect(parseSuggestResponse(wire('Quizzing', 1))).toEqual({ ok: false, reason: 'bad_response' })
  })

  it('rejects a guess below the confidence floor', () => {
    const low = MIN_CONFIDENCE - 0.01
    expect(parseSuggestResponse(wire('Movies', low))).toEqual({ ok: false, reason: 'low_confidence' })
  })

  it('rejects a malformed payload instead of throwing', () => {
    expect(parseSuggestResponse(null)).toEqual({ ok: false, reason: 'bad_response' })
    expect(parseSuggestResponse({})).toEqual({ ok: false, reason: 'bad_response' })
    expect(parseSuggestResponse({ answers: {} })).toEqual({ ok: false, reason: 'bad_response' })
    expect(parseSuggestResponse(wire(42, 'high'))).toEqual({ ok: false, reason: 'bad_response' })
  })
})

describe('buildSuggestRequest', () => {
  it('offers every real category plus the no-match escape', () => {
    const req = buildSuggestRequest('Which country won the 2018 World Cup?')
    const criteria = Object.keys(req.questions.category.criteria)

    expect(criteria).toContain('Sports')
    expect(criteria).toContain('none')
    expect(criteria).not.toContain('all')
    expect(req.state).toContain('Which country won the 2018 World Cup?')
  })
})

describe('suggestCategory', () => {
  it('returns no_key without a key, so the caller keeps its own error', async () => {
    const fetchImpl = jest.fn()

    const result = await suggestCategory('anything', { apiKey: '', fetchImpl: fetchImpl as never })

    expect(result).toEqual({ ok: false, reason: 'no_key' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('returns http_error on a non-200 without parsing the body', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: false, json: async () => ({}) })

    const result = await suggestCategory('q', { apiKey: 'k', fetchImpl: fetchImpl as never })

    expect(result).toEqual({ ok: false, reason: 'http_error' })
  })

  it('returns http_error when the request rejects', async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'))

    const result = await suggestCategory('q', { apiKey: 'k', fetchImpl: fetchImpl as never })

    expect(result).toEqual({ ok: false, reason: 'http_error' })
  })

  it('returns timeout when the request aborts', async () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' })
    const fetchImpl = jest.fn().mockRejectedValue(abort)

    const result = await suggestCategory('q', { apiKey: 'k', fetchImpl: fetchImpl as never })

    expect(result).toEqual({ ok: false, reason: 'timeout' })
  })

  it('surfaces a confident answer', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => wire('Geography', 0.92),
    })

    const result = await suggestCategory('Longest river?', { apiKey: 'k', fetchImpl: fetchImpl as never })

    expect(result).toEqual({ ok: true, category: 'Geography', confidence: 0.92 })
  })
})
