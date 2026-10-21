import { NextRequest } from 'next/server'
import { POST } from '@/app/api/admin/questions/import/route'
import { signAdminToken, ADMIN_COOKIE_NAME } from '@/lib/admin-auth'
import { QUESTION_CATEGORIES } from '@/lib/categories'

jest.mock('@/lib/supabase-server', () => ({ createServerClient: jest.fn() }))
jest.mock('@/lib/typesafe', () => ({ suggestCategory: jest.fn() }))
import { createServerClient } from '@/lib/supabase-server'
import { suggestCategory } from '@/lib/typesafe'

process.env.ADMIN_SECRET = 'test-admin-secret'

const HEADER = 'text,answer,category,time_limit'

async function request(body: string) {
  const token = await signAdminToken()
  const form = new FormData()
  form.set('file', new File([body], 'questions.csv', { type: 'text/csv' }))
  return new NextRequest('http://localhost/api/admin/questions/import', {
    method: 'POST',
    headers: { cookie: `${ADMIN_COOKIE_NAME}=${token}` },
    body: form,
  })
}

function mockInsert(error: { code?: string; message?: string } | null = null) {
  const insert = jest.fn().mockResolvedValue({ error })
  ;(createServerClient as jest.Mock).mockReturnValue({ from: jest.fn().mockReturnValue({ insert }) })
  return insert
}

describe('POST /api/admin/questions/import', () => {
  beforeEach(() => jest.clearAllMocks())

  it('never consults TypeSafe when every category matches exactly', async () => {
    const insert = mockInsert()

    const res = await POST(await request(`${HEADER}\nCapital of France?,33,Geography,20`))

    expect(res.status).toBe(200)
    expect(suggestCategory).not.toHaveBeenCalled()
    expect(insert).toHaveBeenCalledWith([
      { text: 'Capital of France?', answer: 33, category: 'Geography', time_limit: 20, unit: null, hint: null },
    ])
    expect(await res.json()).toEqual({ imported: 1, suggested: [] })
  })

  it('keeps the original 422 when no suggestion is available', async () => {
    ;(suggestCategory as jest.Mock).mockResolvedValue({ ok: false, reason: 'no_key' })
    const insert = mockInsert()

    const res = await POST(await request(`${HEADER}\nCapital of France?,33,France,20`))

    expect(res.status).toBe(422)
    expect(insert).not.toHaveBeenCalled()
    const body = await res.json()
    expect(body.errors).toEqual([
      {
        row: 2,
        field: 'category',
        message: `Invalid category "France". Must be one of: ${QUESTION_CATEGORIES.join(', ')}`,
      },
    ])
  })

  it('uses a confident suggestion and reports it back', async () => {
    ;(suggestCategory as jest.Mock).mockResolvedValue({ ok: true, category: 'Geography', confidence: 0.93 })
    const insert = mockInsert()

    const res = await POST(await request(`${HEADER}\nCapital of France?,33,Fr,20`))

    expect(res.status).toBe(200)
    expect(suggestCategory).toHaveBeenCalledWith('Capital of France?')
    expect(insert).toHaveBeenCalledWith([expect.objectContaining({ category: 'Geography' })])
    expect(await res.json()).toEqual({
      imported: 1,
      suggested: [{ row: 2, raw: 'Fr', category: 'Geography', confidence: 0.93 }],
    })
  })

  it('still rejects the row when the answer column is invalid, suggestion or not', async () => {
    ;(suggestCategory as jest.Mock).mockResolvedValue({ ok: true, category: 'Geography', confidence: 0.93 })
    mockInsert()

    const res = await POST(await request(`${HEADER}\nCapital of France?,thirty-three,Fr,20`))

    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.errors).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'answer' })]))
  })
})
