'use client'
import { loginAction } from '@/app/admin/login/action'

export function AdminLoginForm({ error }: { error?: string }) {
  return (
    <div className="bg-white rounded-2xl shadow-md p-8 w-full max-w-sm">
      <h1 className="text-xl font-black text-gray-900 mb-6">Admin — QuizKnight</h1>
      <form action={loginAction} className="flex flex-col gap-4">
        <input
          type="password"
          name="password"
          placeholder="Admin password"
          required
          autoComplete="current-password"
          className="border border-gray-200 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-orange-400"
        />
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <button
          type="submit"
          className="bg-orange-500 text-white font-bold rounded-xl px-4 py-3 hover:bg-orange-600 transition-colors"
        >
          Log in
        </button>
      </form>
    </div>
  )
}
