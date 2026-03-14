import type { PresencePlayer } from '@/types'

interface Props {
  players: PresencePlayer[]
  maxPlayers?: number
}

export default function PlayerList({ players, maxPlayers = 50 }: Props) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-white/60 text-xs font-semibold uppercase tracking-widest mb-1">
        {players.length} / {maxPlayers} players
      </p>
      <div className="bg-white/15 backdrop-blur border border-white/30 rounded-2xl overflow-hidden">
        {players.length === 0 && (
          <p className="text-white/40 text-sm text-center py-4">Waiting for players...</p>
        )}
        {players.map((player, index) => (
          <div
            key={player.playerId}
            className={`flex items-center gap-3 px-4 py-3 ${
              index < players.length - 1 ? 'border-b border-white/15' : ''
            }`}
          >
            <span className="text-lg">{player.isHost ? '👑' : '🧙'}</span>
            <span className="text-white font-bold text-sm flex-1">{player.nickname}</span>
            {player.isHost && (
              <span className="text-white/40 text-xs uppercase tracking-widest">host</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
