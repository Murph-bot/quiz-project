'use client'

interface Props {
  winnerNickname: string | null
  autoRedirectIn: number
}

export function WinnerScreen({ winnerNickname, autoRedirectIn }: Props) {
  return (
    <div className="flex flex-col items-center justify-center min-h-dvh p-4 text-center">
      <div className="w-full max-w-sm flex flex-col gap-6">
        <div className="text-6xl">{winnerNickname ? '🏆' : '😶'}</div>
        {winnerNickname ? (
          <h1 className="text-2xl font-black text-white">
            Congratulations {winnerNickname}, You are today&apos;s prize winner!
          </h1>
        ) : (
          <h1 className="text-2xl font-black text-white">
            Nobody won this time. Better luck next game!
          </h1>
        )}
        <p className="text-white/60 text-sm">
          Returning to home in{' '}
          <span className="font-bold text-white">{autoRedirectIn}s</span>
        </p>
      </div>
    </div>
  )
}
