'use client'

interface Props {
  roundNumber: number
}

export function SpectatorScreen({ roundNumber }: Props) {
  return (
    <div className="flex flex-col items-center justify-center min-h-dvh p-4 text-center">
      <div className="w-full max-w-sm flex flex-col items-center gap-6">

        <div className="text-6xl">💀</div>

        <div className="bg-white rounded-2xl shadow-md px-6 py-5 w-full">
          <div className="text-lg font-black text-gray-900">You&apos;ve been eliminated</div>
          <div className="text-sm text-gray-500 mt-1">
            Hang tight — a resurrection could bring you back every 5 rounds.
          </div>
        </div>

        <p className="text-white/70 text-sm">
          Spectating Round <span className="font-bold text-white">{roundNumber}</span>…
        </p>

      </div>
    </div>
  )
}
