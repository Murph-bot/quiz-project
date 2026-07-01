import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-dvh px-4 pt-safe pb-safe text-center">
      <div className="w-full max-w-sm flex flex-col items-center gap-5">
        <div className="text-5xl">⚔️</div>
        <div className="bg-white rounded-2xl shadow-md px-6 py-6 w-full">
          <h1 className="text-xl font-black text-gray-900">Game not found</h1>
          <p className="text-sm text-gray-500 mt-2">
            This room may have ended, expired, or the code may be wrong.
          </p>
        </div>
        <Link
          href="/"
          className="w-full bg-gradient-to-br from-orange-500 to-pink-500 text-white font-black text-sm rounded-full py-4 active:scale-95 transition-transform"
        >
          Back to home
        </Link>
      </div>
    </div>
  )
}
