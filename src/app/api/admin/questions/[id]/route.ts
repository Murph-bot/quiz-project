import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { verifyAdminToken, ADMIN_COOKIE_NAME } from '@/lib/admin-auth'
import { canonicalCategory } from '@/lib/categories'

async function isAuthorized(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get(ADMIN_COOKIE_NAME)?.value
  return !!token && verifyAdminToken(token)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthorized(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const update: Record<string, unknown> = {}
  if (body.text !== undefined) {
    if (typeof body.text !== 'string' || body.text.trim().length === 0) return NextResponse.json({ error: 'text is invalid' }, { status: 400 })
    update.text = body.text.trim()
  }
  if (body.answer !== undefined) {
    if (!Number.isInteger(body.answer)) return NextResponse.json({ error: 'answer must be an integer' }, { status: 400 })
    update.answer = body.answer
  }
  if (body.category !== undefined) {
    const questionCategory = typeof body.category === 'string' ? canonicalCategory(body.category) : null
    if (!questionCategory || questionCategory === 'all') return NextResponse.json({ error: 'invalid category' }, { status: 400 })
    update.category = questionCategory
  }
  if (body.time_limit !== undefined) {
    if (!Number.isInteger(body.time_limit) || body.time_limit < 5 || body.time_limit > 60) return NextResponse.json({ error: 'time_limit must be 5–60' }, { status: 400 })
    update.time_limit = body.time_limit
  }
  if (body.unit !== undefined) {
    if (body.unit !== null && (typeof body.unit !== 'string' || body.unit.trim().length > 40)) return NextResponse.json({ error: 'unit must be a string of at most 40 characters' }, { status: 400 })
    update.unit = typeof body.unit === 'string' && body.unit.trim() ? body.unit.trim() : null
  }
  if (body.hint !== undefined) {
    if (body.hint !== null && (typeof body.hint !== 'string' || body.hint.trim().length > 140)) return NextResponse.json({ error: 'hint must be a string of at most 140 characters' }, { status: 400 })
    update.hint = typeof body.hint === 'string' && body.hint.trim() ? body.hint.trim() : null
  }
  if (Object.keys(update).length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  const supabase = createServerClient()
  const { data, error } = await supabase.from('questions').update(update).eq('id', id).select().single()
  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthorized(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const supabase = createServerClient()
  const { data, error } = await supabase.from('questions').delete().eq('id', id).select()
  if (error) return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  if (!data || data.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return new NextResponse(null, { status: 204 })
}
