import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { verifyAdminToken, ADMIN_COOKIE_NAME } from '@/lib/admin-auth'
import { QUESTION_CATEGORIES, canonicalCategory } from '@/lib/categories'
import { isMissingColumnError } from '@/lib/questionPicker'

async function isAuthorized(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get(ADMIN_COOKIE_NAME)?.value
  return !!token && verifyAdminToken(token)
}

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') { inQuotes = !inQuotes }
    else if (ch === ',' && !inQuotes) { result.push(current); current = '' }
    else { current += ch }
  }
  result.push(current)
  return result.map(s => s.trim())
}

export async function POST(req: NextRequest) {
  if (!(await isAuthorized(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  const text = await file.text()
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0)
  if (lines.length === 0) return NextResponse.json({ error: 'Empty file' }, { status: 400 })
  const header = lines[0].toLowerCase()
  const hasMeta = header === 'text,answer,category,time_limit,unit,hint'
  if (header !== 'text,answer,category,time_limit' && !hasMeta) {
    return NextResponse.json({ error: 'Invalid CSV header. Expected: text,answer,category,time_limit (optionally ,unit,hint)' }, { status: 400 })
  }
  const errors: { row: number; field: string; message: string }[] = []
  const rows: { text: string; answer: number; category: string; time_limit: number; unit: string | null; hint: string | null }[] = []
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i])
    const [rawText, rawAnswer, rawCategory, rawTimeLimit, rawUnit, rawHint] = cols
    const row = i + 1
    if (!rawText || rawText.trim().length === 0) errors.push({ row, field: 'text', message: 'Required' })
    const answer = parseInt(rawAnswer, 10)
    if (isNaN(answer) || String(answer) !== rawAnswer.trim()) errors.push({ row, field: 'answer', message: `Must be an integer, got "${rawAnswer}"` })
    const category = rawCategory ? canonicalCategory(rawCategory) : null
    // 'all' is not a valid question category
    const questionCategory = category && category !== 'all' ? category : null
    if (!questionCategory) errors.push({ row, field: 'category', message: `Invalid category "${rawCategory}". Must be one of: ${QUESTION_CATEGORIES.join(', ')}` })
    const time_limit = parseInt(rawTimeLimit, 10)
    if (isNaN(time_limit) || time_limit < 5 || time_limit > 60) errors.push({ row, field: 'time_limit', message: `Must be an integer 5–60, got "${rawTimeLimit}"` })
    const unit = hasMeta && rawUnit ? rawUnit.trim().slice(0, 40) : null
    const hint = hasMeta && rawHint ? rawHint.trim().slice(0, 140) : null
    if (errors.length === 0 || errors[errors.length - 1].row !== row) {
      rows.push({ text: rawText.trim(), answer, category: questionCategory!, time_limit, unit, hint })
    }
  }
  if (errors.length > 0) return NextResponse.json({ errors }, { status: 422 })
  const supabase = createServerClient()
  let { error } = await supabase.from('questions').insert(rows)
  // unit/hint come from migration 012 — retry without them if absent.
  if (isMissingColumnError(error)) {
    const baseRows = rows.map((r) => ({ text: r.text, answer: r.answer, category: r.category, time_limit: r.time_limit }))
    ;({ error } = await supabase.from('questions').insert(baseRows))
  }
  if (error) { console.error('[import]', error.message); return NextResponse.json({ error: 'Import failed' }, { status: 500 }) }
  return NextResponse.json({ imported: rows.length })
}
