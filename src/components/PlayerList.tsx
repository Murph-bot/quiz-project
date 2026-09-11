import { SectionLabel } from '@/components/ui/SectionLabel'
import type { PresencePlayer } from '@/types'

interface Props {
  players: PresencePlayer[]
  maxPlayers?: number
  /** Player IDs with an open tab right now — shown as online dots. */
  onlineIds?: Set<string>
  /** When set (host view), non-host rows get a kick button. */
  onKickPlayer?: (playerId: string, nickname: string) => void
}

export default function PlayerList({ players, maxPlayers = 50, onlineIds, onKickPlayer }: Props) {
  return (
    <div className="flex flex-col gap-1">
      <SectionLabel className="mb-1">
        {players.length} / {maxPlayers} players
      </SectionLabel>
      <div className="flex flex-col gap-2">
        {players.length === 0 && (
          <p className="text-qk-muted text-sm text-center py-4">Waiting for players...</p>
        )}
        {players.map((player) => {
          const isOnline = onlineIds?.has(player.playerId) ?? true
          return (
            <div
              key={player.playerId}
              className="bg-qk-surface/80 backdrop-blur-md border border-qk-violet/25 rounded-xl px-4 py-3 min-h-[44px] flex items-center gap-3"
            >
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center font-black text-sm text-qk-void flex-shrink-0 bg-gradient-to-br from-qk-cyan to-qk-magenta"
              >
                {player.nickname.charAt(0).toUpperCase()}
              </div>
              <span className="font-bold text-sm text-qk-text flex-1 min-w-0 truncate">
                {player.nickname}
              </span>
              {player.isHost && (
                <span className="text-xs font-bold text-qk-cyan uppercase">Host</span>
              )}
              {onKickPlayer && !player.isHost && (
                <button
                  type="button"
                  onClick={() => onKickPlayer(player.playerId, player.nickname)}
                  aria-label={`Kick ${player.nickname}`}
                  title={`Kick ${player.nickname}`}
                  className="w-8 h-8 flex items-center justify-center rounded-full text-qk-muted hover:text-qk-danger hover:bg-qk-danger/10 text-sm flex-shrink-0"
                >
                  ✕
                </button>
              )}
              <span
                className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                  isOnline ? 'bg-qk-success' : 'bg-qk-muted/40'
                }`}
                aria-label={isOnline ? 'online' : 'offline'}
                title={isOnline ? 'Online now' : 'Joined but not online'}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
