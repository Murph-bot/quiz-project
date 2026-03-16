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
      <div className="flex flex-col gap-2">
        {players.length === 0 && (
          <p className="text-white/50 text-sm text-center py-4">Waiting for players...</p>
        )}
        {players.map((player) => (
          <div
            key={player.playerId}
            className="bg-white rounded-xl shadow-sm px-4 py-3 flex items-center gap-3"
          >
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center font-black text-sm text-white flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #ff6b00, #e84393)' }}
            >
              {player.nickname.charAt(0).toUpperCase()}
            </div>
            <span className="font-bold text-sm text-gray-900 flex-1">{player.nickname}</span>
            {player.isHost && (
              <span className="text-xs font-bold text-orange-500 uppercase">Host</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
