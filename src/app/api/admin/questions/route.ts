import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { verifyAdminToken, ADMIN_COOKIE_NAME } from '@/lib/admin-auth'
import { canonicalCategory } from '@/lib/categories'

async function isAuthorized(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get(ADMIN_COOKIE_NAME)?.value
  return !!token && verifyAdminToken(token)
}

export async function GET(req: NextRequest) {
  if (!(await isAuthorized(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
  const pageSize = Math.min(200, Math.max(1, parseInt(searchParams.get('pageSize') ?? '50')))
  const category = searchParams.get('category')
  const q = searchParams.get('q')
  const offset = (page - 1) * pageSize

  const supabase = createServerClient()
  // unit/hint come from migration 012 — fall back to the base column set if the
  // migration hasn't been applied yet.
  let data: unknown[] | null = null
  let count = 0
  let fetchFailed = true
  for (const cols of [
    'id, text, answer, category, time_limit, unit, hint',
    'id, text, answer, category, time_limit',
  ]) {
    let query = supabase.from('questions').select(cols, { count: 'exact' })
    if (category) query = query.eq('category', category)
    if (q) query = query.ilike('text', `%${q}%`)
    const res = await query.order('category').order('text').range(offset, offset + pageSize - 1)
    if (!res.error) {
      data = res.data
      count = res.count ?? 0
      fetchFailed = false
      break
    }
  }
  if (fetchFailed) return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })
  const total = count ?? 0
  return NextResponse.json({ data: data ?? [], total, page, pageSize, pageCount: Math.ceil(total / pageSize) })
}

export async function POST(req: NextRequest) {
  if (!(await isAuthorized(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const { text, answer, category, time_limit, unit, hint } = body
  if (!text || typeof text !== 'string' || text.trim().length === 0) return NextResponse.json({ error: 'text is required' }, { status: 400 })
  if (!Number.isInteger(answer)) return NextResponse.json({ error: 'answer must be an integer' }, { status: 400 })
  const questionCategory = typeof category === 'string' ? canonicalCategory(category) : null
  if (!questionCategory || questionCategory === 'all') return NextResponse.json({ error: 'category is invalid' }, { status: 400 })
  if (!Number.isInteger(time_limit) || time_limit < 5 || time_limit > 60) return NextResponse.json({ error: 'time_limit must be an integer between 5 and 60' }, { status: 400 })
  if (unit != null && (typeof unit !== 'string' || unit.trim().length > 40)) return NextResponse.json({ error: 'unit must be a string of at most 40 characters' }, { status: 400 })
  if (hint != null && (typeof hint !== 'string' || hint.trim().length > 140)) return NextResponse.json({ error: 'hint must be a string of at most 140 characters' }, { status: 400 })
  const supabase = createServerClient()
  const { data, error } = await supabase.from('questions').insert({
    text: text.trim(),
    answer,
    category: questionCategory,
    time_limit,
    unit: typeof unit === 'string' && unit.trim() ? unit.trim() : null,
    hint: typeof hint === 'string' && hint.trim() ? hint.trim() : null,
  }).select().single()
  if (error || !data) return NextResponse.json({ error: 'Failed to create' }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
