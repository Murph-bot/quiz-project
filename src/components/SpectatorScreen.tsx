'use client'

interface Props {
  nickname: string
}

export function SpectatorScreen({ nickname }: Props) {
  return (
    <div className="flex flex-col items-center justify-center min-h-dvh p-4 text-center">
      <div className="w-full max-w-sm flex flex-col gap-6">
        <div className="text-6xl">💀</div>
        <h1 className="text-2xl font-black text-white">
          You lost the game, you are {nickname}. Do not worry you can come back later. Maybe.
        </h1>
        <p className="text-white/60 text-sm">Waiting for the next round...</p>
      </div>
    </div>
  )
}
