import Link from 'next/link'
import { Card } from '@/components/ui/Card'

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-dvh px-4 pt-safe pb-safe text-center">
      <div className="w-full max-w-sm flex flex-col items-center gap-5">
        <div className="text-5xl">⚔️</div>
        <Card padding="lg" className="text-center">
          <h1 className="text-xl font-black text-qk-text">Game not found</h1>
          <p className="text-sm text-qk-muted mt-2">
            This room may have ended, expired, or the code may be wrong.
          </p>
        </Card>
        <Link
          href="/"
          className="w-full min-h-[52px] flex items-center justify-center bg-qk-void text-qk-text font-black text-sm rounded-full py-4 border border-qk-cyan/70 shadow-qk-neon active:scale-95 transition-transform"
        >
          Back to home
        </Link>
      </div>
    </div>
  )
}
