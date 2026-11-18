import { Shield, Swords, Crown } from 'lucide-react';
export function KnightMark({ large = false }: { large?: boolean }) {
  return <div className={large ? 'knight-emblem large' : 'knight-emblem'}><Shield aria-hidden="true" /><Swords aria-hidden="true" className="emblem-swords" /></div>;
}
export function PlayerAvatar({ index, name }: { index: number; name: string }) {
  const Icon = index % 3 === 0 ? Shield : index % 3 === 1 ? Swords : Crown;
  return <div className={`player-avatar avatar-${index % 4}`} aria-label={name}><Icon /></div>;
}