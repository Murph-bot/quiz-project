import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Timer, Swords, BookOpen, ArrowLeft } from 'lucide-react';

export const Route = createFileRoute('/alternatives')({
  head: () => ({ meta: [
    { title: 'Pacing options — Quiz_Knight' },
    { name: 'description', content: 'Compare three ways to run timers, bracket pacing and the question bank in Quiz_Knight.' },
    { property: 'og:title', content: 'Pacing options — Quiz_Knight' },
    { property: 'og:description', content: 'Three alternatives for timers, bracket pacing and dynamic questions.' },
    { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' },
  ] }),
  component: Alternatives,
});

type Alt = { key: string; name: string; tag: string; timer: { label: string; seq: number[]; note: string }; bracket: string[]; bank: { label: string; items: string[] } };
const alts: Alt[] = [
  { key: 'A', name: 'Steady Siege', tag: 'Predictable & fair', timer: { label: 'Fixed server clock', seq: [30, 30, 30, 30], note: 'Same time every round. Server decides the deadline; 1.5s grace for slow connections.' },
    bracket: ['Battle royale: 1 round per elimination', '8s reveal, then host taps Next', 'Semis best-of-3 · Final best-of-5', 'Break of 10s between duels'],
    bank: { label: 'Curated rotation', items: ['Shuffled once per room, no repeats', 'Categories cycle evenly', 'Difficulty: mixed'] } },
  { key: 'B', name: 'Rising Pressure', tag: 'Tension builds', timer: { label: 'Shrinking timer', seq: [30, 25, 20, 15], note: 'Each round loses 5s (minimum 12s). Early lock-in bonus: lock first 3s → bounty widens by 2%.' },
    bracket: ['Auto-advance after 6s reveal', 'Semis run back-to-back on one screen', 'Final best-of-5, last bout “Golden Question”', 'No host taps needed'],
    bank: { label: 'Difficulty ladder', items: ['Easy → medium → hard as players drop', 'Final uses hardest tier', 'Never repeats within a room'] } },
  { key: 'C', name: 'Crowd’s Chaos', tag: 'Party energy', timer: { label: 'Adaptive timer', seq: [30, 18, 24, 12], note: 'Round ends early once all knights lock in (+3s). Council can vote to add or cut 5s.' },
    bracket: ['Semis played simultaneously', 'Lightning final: first to 3, 15s rounds', 'Council picks next category', 'Instant 4s reveals'],
    bank: { label: 'Voted & generated', items: ['Spectators vote between 2 categories', 'Fresh AI-made questions per room', 'Answers checked against sources'] } },
];

function Countdown({ seq }: { seq: number[] }) {
  const [i, setI] = useState(0); const [t, setT] = useState(seq[0]!);
  useEffect(() => { const id = setInterval(() => setT(v => { if (v > 0) return v - 1; setI(n => { const nx = (n + 1) % seq.length; setT(seq[nx]!); return nx; }); return v; }), 200); return () => clearInterval(id); }, [seq]);
  const max = seq[i]!;
  return <div className="space-y-2"><div className="flex items-baseline justify-between font-display"><span className="text-sm text-muted-foreground">Round {i + 1}</span><span className="text-4xl text-primary tabular-nums">{t}s</span></div>
    <div className="h-2 rounded-full bg-muted overflow-hidden"><div className="h-full bg-primary transition-all" style={{ width: `${(t / max) * 100}%` }} /></div>
    <div className="flex gap-1">{seq.map((s, n) => <span key={n} className={`flex-1 text-center text-xs rounded py-1 ${n === i ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>{s}s</span>)}</div></div>;
}

function Alternatives() {
  const [pick, setPick] = useState('B');
  return <main className="min-h-screen bg-background text-foreground p-6 md:p-10">
    <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft className="size-4" /> Back to the arena</Link>
    <h1 className="font-display text-5xl mt-4">Choose your pacing</h1>
    <p className="text-muted-foreground mt-2 max-w-2xl">Three ways to run timers, the Final Four and the question bank. Timers below play at 5× speed.</p>
    <div className="grid gap-6 mt-8 lg:grid-cols-3">{alts.map(a => <section key={a.key} className={`rounded-xl border-2 bg-card p-6 space-y-5 ${pick === a.key ? 'border-primary' : 'border-border'}`}>
      <div><span className="text-xs font-display tracking-widest text-primary">OPTION {a.key} · {a.tag.toUpperCase()}</span><h2 className="font-display text-3xl">{a.name}</h2></div>
      <div className="space-y-2"><h3 className="flex items-center gap-2 font-semibold"><Timer className="size-4 text-primary" />{a.timer.label}</h3><Countdown seq={a.timer.seq} /><p className="text-sm text-muted-foreground">{a.timer.note}</p></div>
      <div><h3 className="flex items-center gap-2 font-semibold"><Swords className="size-4 text-primary" />Bracket pacing</h3><ul className="mt-2 space-y-1 text-sm">{a.bracket.map(b => <li key={b}>• {b}</li>)}</ul></div>
      <div><h3 className="flex items-center gap-2 font-semibold"><BookOpen className="size-4 text-primary" />{a.bank.label}</h3><ul className="mt-2 space-y-1 text-sm">{a.bank.items.map(b => <li key={b}>• {b}</li>)}</ul></div>
      <Button className="w-full" variant={pick === a.key ? 'default' : 'outline'} onClick={() => setPick(a.key)}>{pick === a.key ? 'Selected' : `Prefer option ${a.key}`}</Button>
    </section>)}</div>
  </main>;
}
