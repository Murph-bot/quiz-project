import { useState } from 'react';
import { Check, Eye, Shield, Target, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Prediction, View } from '@/lib/game';

export function ArmorCrests({ shields, golden = false }: { shields: number; golden?: boolean }) {
  return <div className="armor-crests" aria-label={`${shields} Armor Shields${golden ? ', Golden Aegis active' : ''}`}>{[0, 1].map(i => <Shield key={i} className={i < shields ? 'charged' : 'depleted'} />)}{golden && <Shield className="golden" />}</div>;
}
export function TacticalHud({ game }: { game: View }) {
  const me = game.players.find(p => p.id === game.me);
  if (!me) return null;
  return <div className="tactical-hud"><div className="hud-title"><Shield /><div><strong>{me.name}</strong><small>{me.eliminated ? 'SHADOW COUNCIL' : 'TACTICAL ARMOR'}</small></div></div><ArmorCrests shields={me.shields} golden={me.golden} /></div>;
}
export function RoundQuest({ game }: { game: View }) {
  const earned = game.quest.winners.includes(game.me);
  return <div className={`round-quest ${earned ? 'earned' : ''}`}><Target /><div><strong>{game.quest.name}</strong><p>Closest guess earns +1 Shield · Full armor unlocks Golden Aegis</p>{earned && <small><Check /> BOUNTY CLAIMED</small>}</div></div>;
}
export function ShadowCouncil({ game, busy, onPredict }: { game: View; busy: boolean; onPredict: (prediction: Prediction) => Promise<void> }) {
  const [target, setTarget] = useState(''), [kind, setKind] = useState<'closest' | 'survive'>('closest');
  const [stake, setStake] = useState(10);
  const me = game.players.find(p => p.id === game.me);
  const spectators = game.players.filter(p => p.eliminated);
  const entries = Object.values(game.predictions);
  const mine = game.predictions[game.me];
  const contenders = game.players.filter(p => game.contenders.includes(p.id) && !p.eliminated);
  return <section className="shadow-council"><div className="council-heading"><Eye /><h3>Shadow Council</h3><span>{spectators.length} watching</span></div>
    {me?.eliminated && <><div className="council-wallet"><span>YOUR INFLUENCE</span><strong>{me.councilPoints} <small>POINTS</small></strong></div>
      {mine ? <div className="council-locked"><Check /><strong>{game.players.find(p => p.id === mine.target)?.name}</strong><span>{mine.stake} points · {mine.kind === 'closest' ? 'Closest guess' : 'Survives the round'}</span>{mine.won !== undefined && <b>{mine.won ? `+${mine.stake * 2} payout · Prediction won` : 'Prediction missed'}</b>}</div> : game.phase === 'question' ? <form onSubmit={e => { e.preventDefault(); if (target) void onPredict({ target, kind, stake }); }}>
        <div className="council-modes"><Button type="button" variant={kind === 'closest' ? 'secondary' : 'ghost'} onClick={() => setKind('closest')}><Target /> Closest</Button><Button type="button" variant={kind === 'survive' ? 'secondary' : 'ghost'} onClick={() => setKind('survive')}><Shield /> Survives</Button></div>
        <label htmlFor="council-knight">Back a knight</label><select id="council-knight" value={target} onChange={e => setTarget(e.target.value)} required><option value="">Choose your knight</option>{contenders.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <label htmlFor="council-stake">Wager points</label><select id="council-stake" value={stake} onChange={e => setStake(Number(e.target.value))}>{[5, 10, 20].map(n => <option key={n} value={n} disabled={me.councilPoints < n}>{n} points</option>)}</select>
        <Button className="quest-button" type="submit" disabled={busy || !target || me.councilPoints < stake || Date.now() >= game.deadline}>Lock prediction <Eye /></Button><small className="council-disclaimer">Play points only · Winning wagers pay 2×</small>
      </form> : <p className="council-empty">The next round brings your next prediction.</p>}</>}
    <div className="sentiment-heading"><Users /><strong>Live crowd sentiment</strong><span>{entries.length} wagers</span></div>
    {entries.length === 0 ? <p className="council-empty">The council is watching. No wagers yet.</p> : contenders.map(p => {
      const bets = entries.filter(e => e.target === p.id), percent = Math.round(bets.length / entries.length * 100);
      return <div className="sentiment-row" key={p.id}><div><strong>{p.name}</strong><span>{percent}% · {bets.length} backing</span></div><progress max={entries.length} value={bets.length} /><small>{bets.filter(b => b.kind === 'closest').length} closest · {bets.filter(b => b.kind === 'survive').length} survive</small></div>;
    })}
  </section>;
}