interface Props {
  p1: string
  p2: string
  wins: [number, number]
  matchLabel: string // e.g. "Semi-Final 1 · Best of 3"
  winsToWin: number
}

export function MatchScoreBar({ p1, p2, wins, matchLabel, winsToWin }: Props) {
  return (
    <div className="fixed top-0 left-0 right-0 z-40 bg-black/70 backdrop-blur-sm px-4 py-2 flex items-center justify-between">
      <span className="text-white font-black text-sm">{p1}</span>
      <div className="flex flex-col items-center">
        <span className="text-white font-black text-lg">{wins[0]} – {wins[1]}</span>
        <span className="text-white/50 text-xs">{matchLabel}</span>
      </div>
      <span className="text-white font-black text-sm">{p2}</span>
    </div>
  )
}
