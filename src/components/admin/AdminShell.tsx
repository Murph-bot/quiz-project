'use client'
import { useState, useEffect, useCallback } from 'react'

const VALID_CATEGORIES = ['Geography', 'Nature', 'Animals', 'Music Industry', 'Nations', 'Popular Products', 'Popular Tools', 'History', 'Music Instruments', 'Sodas', 'Alcoholic Drinks', 'Pop Culture', 'Movies', 'Formula 1', 'Food & Drink', 'Technology', '00s Nostalgia']

interface Question {
  id: string
  text: string
  answer: number
  category: string
  time_limit: number
}

export function AdminShell() {
  const [questions, setQuestions] = useState<Question[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageCount, setPageCount] = useState(1)
  const [categoryFilter, setCategoryFilter] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<Partial<Question>>({})
  const [addForm, setAddForm] = useState({ text: '', answer: '', category: 'history', time_limit: '15' })
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [importResult, setImportResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchQuestions = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page), pageSize: '50' })
    if (categoryFilter) params.set('category', categoryFilter)
    if (search) params.set('q', search)
    const res = await fetch(`/api/admin/questions?${params}`)
    const data = await res.json()
    setQuestions(data.data ?? [])
    setTotal(data.total ?? 0)
    setPageCount(data.pageCount ?? 1)
    setLoading(false)
  }, [page, categoryFilter, search])

  useEffect(() => { fetchQuestions() }, [fetchQuestions])

  async function handleDelete(id: string) {
    if (!window.confirm('Delete this question?')) return
    await fetch(`/api/admin/questions/${id}`, { method: 'DELETE' })
    fetchQuestions()
  }

  async function handleSave(id: string) {
    await fetch(`/api/admin/questions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editValues),
    })
    setEditingId(null)
    fetchQuestions()
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const res = await fetch('/api/admin/questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: addForm.text, answer: parseInt(addForm.answer), category: addForm.category, time_limit: parseInt(addForm.time_limit) }),
    })
    if (res.ok) {
      setAddForm({ text: '', answer: '', category: 'history', time_limit: '15' })
      fetchQuestions()
    } else {
      const d = await res.json()
      setError(d.error)
    }
  }

  async function handleImport(e: React.FormEvent) {
    e.preventDefault()
    if (!csvFile) return
    const fd = new FormData()
    fd.append('file', csvFile)
    const res = await fetch('/api/admin/questions/import', { method: 'POST', body: fd })
    const data = await res.json()
    if (res.ok) {
      setImportResult(`Imported ${data.imported} questions`)
      setCsvFile(null)
      fetchQuestions()
    } else if (data.errors) {
      setImportResult(`${data.errors.length} error(s):\n${data.errors.map((e: { row: number; field: string; message: string }) => `Row ${e.row} [${e.field}]: ${e.message}`).join('\n')}`)
    } else {
      setImportResult(`Error: ${data.error}`)
    }
  }

  async function handleLogout() {
    await fetch('/api/admin/logout', { method: 'POST' })
    window.location.href = '/admin/login'
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-black text-gray-900">QuizKnight — Question Bank ({total})</h1>
        <button onClick={handleLogout} className="text-sm text-gray-500 hover:text-gray-900">Log out</button>
      </div>

      {/* Add question */}
      <div className="bg-white rounded-xl p-4 mb-6 shadow-sm">
        <h2 className="font-bold text-gray-700 mb-3">Add question</h2>
        <form onSubmit={handleAdd} className="flex flex-wrap gap-2">
          <input className="border rounded px-3 py-2 text-sm flex-1 min-w-[200px]" placeholder="Question text" value={addForm.text} onChange={e => setAddForm(f => ({ ...f, text: e.target.value }))} required />
          <input className="border rounded px-3 py-2 text-sm w-24" placeholder="Answer" type="number" value={addForm.answer} onChange={e => setAddForm(f => ({ ...f, answer: e.target.value }))} required />
          <select className="border rounded px-3 py-2 text-sm" value={addForm.category} onChange={e => setAddForm(f => ({ ...f, category: e.target.value }))}>
            {VALID_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <input className="border rounded px-3 py-2 text-sm w-20" placeholder="Time (s)" type="number" value={addForm.time_limit} onChange={e => setAddForm(f => ({ ...f, time_limit: e.target.value }))} required />
          <button type="submit" className="bg-orange-500 text-white rounded px-4 py-2 text-sm font-bold hover:bg-orange-600">Add</button>
          {error && <p className="w-full text-red-500 text-sm">{error}</p>}
        </form>
      </div>

      {/* CSV Import */}
      <div className="bg-white rounded-xl p-4 mb-6 shadow-sm">
        <h2 className="font-bold text-gray-700 mb-3">Import CSV</h2>
        <p className="text-xs text-gray-400 mb-2">Format: <code>text,answer,category,time_limit</code> — categories: {VALID_CATEGORIES.join(', ')}</p>
        <form onSubmit={handleImport} className="flex gap-2 items-center">
          <input type="file" accept=".csv" onChange={e => setCsvFile(e.target.files?.[0] ?? null)} className="text-sm" />
          <button type="submit" disabled={!csvFile} className="bg-gray-700 text-white rounded px-4 py-2 text-sm font-bold hover:bg-gray-900 disabled:opacity-40">Import</button>
        </form>
        {importResult && <pre className="mt-2 text-xs whitespace-pre-wrap text-gray-700">{importResult}</pre>}
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4">
        <select className="border rounded px-3 py-2 text-sm" value={categoryFilter} onChange={e => { setCategoryFilter(e.target.value); setPage(1) }}>
          <option value="">All categories</option>
          {VALID_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <input className="border rounded px-3 py-2 text-sm flex-1" placeholder="Search text..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
      </div>

      {/* Table */}
      {loading ? <p className="text-gray-400 text-sm">Loading...</p> : (
        <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="px-4 py-3 font-semibold text-gray-600 w-1/2">Question</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Answer</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Category</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Time (s)</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {questions.map(q => (
                <tr key={q.id} className="hover:bg-gray-50">
                  {editingId === q.id ? (
                    <>
                      <td className="px-4 py-2"><textarea className="border rounded px-2 py-1 text-sm w-full" value={editValues.text ?? q.text} onChange={e => setEditValues(v => ({ ...v, text: e.target.value }))} rows={2} /></td>
                      <td className="px-4 py-2"><input type="number" className="border rounded px-2 py-1 text-sm w-20" value={editValues.answer ?? q.answer} onChange={e => setEditValues(v => ({ ...v, answer: parseInt(e.target.value) }))} /></td>
                      <td className="px-4 py-2"><select className="border rounded px-2 py-1 text-sm" value={editValues.category ?? q.category} onChange={e => setEditValues(v => ({ ...v, category: e.target.value }))}>{VALID_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select></td>
                      <td className="px-4 py-2"><input type="number" className="border rounded px-2 py-1 text-sm w-16" value={editValues.time_limit ?? q.time_limit} onChange={e => setEditValues(v => ({ ...v, time_limit: parseInt(e.target.value) }))} /></td>
                      <td className="px-4 py-2 flex gap-1">
                        <button onClick={() => handleSave(q.id)} className="bg-green-500 text-white rounded px-3 py-1 text-xs font-bold">Save</button>
                        <button onClick={() => setEditingId(null)} className="bg-gray-200 text-gray-700 rounded px-3 py-1 text-xs font-bold">Cancel</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-3 text-gray-800">{q.text}</td>
                      <td className="px-4 py-3 text-gray-700 font-mono">{q.answer}</td>
                      <td className="px-4 py-3 text-gray-500">{q.category}</td>
                      <td className="px-4 py-3 text-gray-500">{q.time_limit}s</td>
                      <td className="px-4 py-3 flex gap-1">
                        <button onClick={() => { setEditingId(q.id); setEditValues({}) }} className="bg-blue-100 text-blue-700 rounded px-3 py-1 text-xs font-bold hover:bg-blue-200">Edit</button>
                        <button onClick={() => handleDelete(q.id)} className="bg-red-100 text-red-700 rounded px-3 py-1 text-xs font-bold hover:bg-red-200">Delete</button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {/* Pagination */}
          <div className="px-4 py-3 flex items-center justify-between border-t text-sm text-gray-500">
            <span>{total} questions</span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1 border rounded disabled:opacity-40 hover:bg-gray-50">Prev</button>
              <span className="px-2 py-1">Page {page} of {pageCount}</span>
              <button disabled={page >= pageCount} onClick={() => setPage(p => p + 1)} className="px-3 py-1 border rounded disabled:opacity-40 hover:bg-gray-50">Next</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
