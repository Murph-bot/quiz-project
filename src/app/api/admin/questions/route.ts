import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { verifyAdminToken, ADMIN_COOKIE_NAME } from '@/lib/admin-auth'

const VALID_CATEGORIES = ['Geography', 'Nature', 'Animals', 'Music Industry', 'Nations', 'Popular Products', 'Popular Tools', 'History', 'Music Instruments', 'Sodas', 'Alcoholic Drinks', 'Pop Culture', 'Movies', 'Formula 1', 'Food & Drink', 'Technology', '00s Nostalgia']

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
  let query = supabase.from('questions').select('id, text, answer, category, time_limit', { count: 'exact' })
  if (category) query = query.eq('category', category)
  if (q) query = query.ilike('text', `%${q}%`)
  query = query.order('category').order('text').range(offset, offset + pageSize - 1)
  const { data, count, error } = await query
  if (error) return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })
  const total = count ?? 0
  return NextResponse.json({ data: data ?? [], total, page, pageSize, pageCount: Math.ceil(total / pageSize) })
}

export async function POST(req: NextRequest) {
  if (!(await isAuthorized(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { text, answer, category, time_limit } = body
  if (!text || typeof text !== 'string' || text.trim().length === 0) return NextResponse.json({ error: 'text is required' }, { status: 400 })
  if (!Number.isInteger(answer)) return NextResponse.json({ error: 'answer must be an integer' }, { status: 400 })
  if (!VALID_CATEGORIES.includes(category)) return NextResponse.json({ error: `category must be one of: ${VALID_CATEGORIES.join(', ')}` }, { status: 400 })
  if (!Number.isInteger(time_limit) || time_limit < 5 || time_limit > 60) return NextResponse.json({ error: 'time_limit must be an integer between 5 and 60' }, { status: 400 })
  const supabase = createServerClient()
  const { data, error } = await supabase.from('questions').insert({ text: text.trim(), answer, category, time_limit }).select().single()
  if (error || !data) return NextResponse.json({ error: 'Failed to create' }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
