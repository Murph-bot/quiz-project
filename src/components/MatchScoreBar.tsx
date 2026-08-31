interface Props {
  p1: string
  p2: string
  wins: [number, number]
  matchLabel: string
  winsToWin: number
}

export function MatchScoreBar({ p1, p2, wins, matchLabel, winsToWin }: Props) {
  return (
    <div className="fixed top-0 left-0 right-0 z-40 bg-qk-void/80 backdrop-blur-md border-b border-qk-violet/25 px-4 pt-safe pb-2 flex items-center justify-between">
      <span className="text-qk-text font-black text-sm truncate max-w-[30%]">{p1}</span>
      <div className="flex flex-col items-center">
        <span className="text-qk-cyan font-black text-lg tabular-nums" aria-label={`${p1} ${wins[0]}, ${p2} ${wins[1]}, first to ${winsToWin}`}>
          {wins[0]} – {wins[1]}
        </span>
        <span className="text-qk-muted text-xs">{matchLabel}</span>
      </div>
      <span className="text-qk-text font-black text-sm truncate max-w-[30%] text-right">{p2}</span>
    </div>
  )
}
