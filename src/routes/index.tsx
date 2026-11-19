import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from '@tanstack/react-start';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, ChevronRight, Copy, Crown, Eye, HelpCircle, LogOut, Shield, Sparkles, Swords, Timer, Trophy, UserRound, Users, Volume2, VolumeX, X, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { KnightMark, PlayerAvatar } from '@/components/knight';
import { enterRoom, roomAction } from '@/lib/game.functions';
import { useWebMCP } from 'use-webmcp-tool';
import { runWebMCPTool } from '@/lib/webmcp-telemetry';
import { ArmorCrests, RoundQuest, ShadowCouncil, TacticalHud } from '@/components/armor-council';
import type { Prediction, View } from '@/lib/game';
import knight from '@/assets/knight.png.asset.json';

export const Route = createFileRoute("/")({
  staticData: { sitemap: true },
  head: () => ({ meta: [
    { title: 'Quiz_Knight — The last guess standing' },
    { name: 'description', content: 'Gather your friends for live numeric trivia, sudden-death eliminations and a final-four showdown. Host or join a Quiz_Knight room.' },
    { property: 'og:title', content: 'Quiz_Knight — The last guess standing' },
    { property: 'og:description', content: 'One room. Your friends. Only one Quiz Knight. Join the live trivia elimination game.' },
    { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' },
  ] }),
  component: Index,
});

type Ticket = { code: string; token: string };
function Index() {
  const enter = useServerFn(enterRoom), action = useServerFn(roomAction);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [game, setGame] = useState<View | null>(null);
  const [name, setName] = useState(''), [code, setCode] = useState('');
  const [mode, setMode] = useState<'join' | 'host'>('join');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [sound, setSound] = useState(true), [help, setHelp] = useState(false);
  const skew = useRef(0);
  const [seconds, setSeconds] = useState(30), [pacing, setPacing] = useState<'steady' | 'rising' | 'chaos'>('steady'), [now, setNow] = useState(Date.now());
  const [guess, setGuess] = useState(''), [copied, setCopied] = useState(false);
  const audio = useRef<AudioContext | null>(null), previousRound = useRef(-1), previousPhase = useRef('');
  function tone(freq = 440, length = .12) {
    if (!sound) return;
    try {
      audio.current ??= new AudioContext();
      void audio.current.resume();
      const ctx = audio.current, oscillator = ctx.createOscillator(), gain = ctx.createGain();
      oscillator.type = 'triangle'; oscillator.frequency.value = freq;
      gain.gain.setValueAtTime(.06, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + length);
      oscillator.connect(gain); gain.connect(ctx.destination); oscillator.start(); oscillator.stop(ctx.currentTime + length);
    } catch { /* Sound is optional on restricted browsers. */ }
  }
  useEffect(() => {
    const saved = sessionStorage.getItem('quiz-knight-ticket');
    if (saved) { try { setTicket(JSON.parse(saved)); } catch { sessionStorage.removeItem('quiz-knight-ticket'); } }
    const timer = setInterval(() => setNow(Date.now() + skew.current), 250); return () => clearInterval(timer);
  }, []);
  useEffect(() => { if (game?.serverNow) { skew.current = game.serverNow - Date.now(); setNow(game.serverNow); } }, [game?.serverNow]);
  useEffect(() => {
    if (!ticket) return;
    const currentTicket = ticket;
    let alive = true, inFlight = false;
    async function sync() {
      if (inFlight) return; inFlight = true;
      try { const view = await action({ data: { ...currentTicket, action: 'sync' } }); if (alive) { setGame(view); setError(''); } }
      catch (e) { if (alive) setError(e instanceof Error ? e.message : 'Connection interrupted. Reconnecting…'); }
      finally { inFlight = false; }
    }
    void sync(); const timer = setInterval(sync, 1000);
    return () => { alive = false; clearInterval(timer); };
  }, [ticket, action]);
  useEffect(() => {
    if (!game) return;
    if (previousRound.current !== game.round) { setGuess(''); previousRound.current = game.round; }
    if (previousPhase.current !== game.phase) { tone(game.phase === 'finished' ? 880 : game.phase === 'reveal' ? 220 : 660, .3); previousPhase.current = game.phase; }
  }, [game?.round, game?.phase]);
  const remaining = game ? Math.max(0, Math.ceil((game.deadline - now) / 1000)) : 0;
  useEffect(() => { if (game?.phase === 'question' && remaining > 0 && remaining <= 5) tone(remaining === 1 ? 880 : 550, .08); }, [remaining]);
  async function join() {
    setBusy(true); setError(''); tone(550);
    try { const t = await enter({ data: { name, ...(mode === 'join' ? { code } : {}), seconds, pacing } }); sessionStorage.setItem('quiz-knight-ticket', JSON.stringify(t)); setTicket(t); }
    catch (e) { setError(e instanceof Error ? e.message : 'Please try again.'); } finally { setBusy(false); }
  }
  async function command(kind: 'start' | 'next' | 'answer' | 'leave') {
    if (!ticket) return; setBusy(true); setError('');
    try {
      const view = await action({ data: { ...ticket, action: kind, ...(kind === 'answer' ? { guess: Number(guess) } : {}) } });
      if (kind === 'leave') { sessionStorage.removeItem('quiz-knight-ticket'); setTicket(null); setGame(null); } else setGame(view);
      tone(660);
    } catch (e) { setError(e instanceof Error ? e.message : 'Please try again.'); } finally { setBusy(false); }
  }
  async function predict(prediction: Prediction) {
    if (!ticket) return; setBusy(true); setError('');
    try { setGame(await action({ data: { ...ticket, action: 'predict', prediction: { ...prediction, stake: prediction.stake as 5 | 10 | 20 } } })); tone(550); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not lock your prediction.'); } finally { setBusy(false); }
  }
  const me = game?.players.find(p => p.id === game.me);
  const isHost = game?.host === game?.me;
  const fmt = (n: number) => game?.question?.unit === 'year' ? String(n) : n.toLocaleString();
  const playerName = (id?: string) => game?.players.find(p => p.id === id)?.name ?? 'TBD';
  const activeMatch = game?.matches[game.matchIndex];

  function applyHostSettings(next: { pacing?: unknown; seconds?: unknown }) {
    const changed: string[] = [];
    if (next.pacing !== undefined) {
      const pace = next.pacing;
      if (pace !== 'steady' && pace !== 'rising' && pace !== 'chaos') throw new Error('Unknown pace; expected steady, rising or chaos.');
      setPacing(pace); changed.push(`pace ${pace}`);
    }
    if (next.seconds !== undefined) {
      const secs = next.seconds;
      if (secs !== 15 && secs !== 30 && secs !== 45 && secs !== 60) throw new Error('Unknown round timer; expected 15, 30, 45 or 60.');
      setSeconds(secs); changed.push(`timer ${secs}s`);
    }
    if (!changed.length) throw new Error('Nothing to change; pass pacing, seconds, or both.');
    return changed.join(', ');
  }

  useWebMCP({
    name: "read_game_screen",
    description: "Read what the Quiz_Knight screen currently shows: entry form, lobby, a live round, a reveal or a champion, plus round and party details.",
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: () => runWebMCPTool("read_game_screen", () => {
      if (!ticket) return "Entry screen: pick Join (needs a four-letter room code) or Host, then give a nickname.";
      if (!game) return "Loading the arena…";
      const lines = [`Phase: ${game.phase}`, `Room code: ${game.code}`, `Knights: ${game.players.length}`, `Still standing: ${game.players.filter(p => !p.eliminated).length}`];
      if (game.phase !== 'lobby') lines.push(`Round: ${game.round}`, `Pace: ${game.pacing}`);
      if (game.phase === 'question') lines.push(`Seconds left: ${remaining}`, `Guesses locked: ${game.submitted.length} / ${game.contenders.length}`);
      if (game.phase === 'reveal' && game.answer !== undefined) lines.push(`The answer was: ${game.answer}`);
      if (game.champion) lines.push(`Champion: ${playerName(game.champion)}`);
      lines.push(`You: ${me?.name ?? 'unknown'} — ${me?.eliminated ? 'Shadow Council' : game.contenders.includes(game.me) ? 'in the arena' : 'spectating'}`);
      return lines.join('\n');
    }),
  });

  useWebMCP({
    name: "choose_entry_mode",
    description: "Switch the entry form between joining an existing room and hosting a new one. Only works while no room is open.",
    inputSchema: {
      type: "object",
      properties: { mode: { type: "string", enum: ["join", "host"], description: "Join an existing room, or host a new one." } },
      required: ["mode"],
    },
    enabled: !ticket,
    execute: ({ mode }: { mode: 'join' | 'host' }) => runWebMCPTool("choose_entry_mode", () => {
      if (mode !== 'join' && mode !== 'host') throw new Error('Unknown mode; expected join or host.');
      setMode(mode); setError('');
      return `Entry form is set to ${mode === 'join' ? 'join a room' : 'host a new room'}.`;
    }),
  });

  useWebMCP({
    name: "set_host_game_settings",
    description: "Set the round timer and game pace on the host form before a room is created. Pass pacing, seconds, or both.",
    inputSchema: {
      type: "object",
      properties: {
        pacing: { type: "string", enum: ["steady", "rising", "chaos"], description: "Steady Siege, Rising Pressure or Crowd's Chaos." },
        seconds: { type: "number", enum: [15, 30, 45, 60], description: "Seconds on the round timer." },
      },
    },
    enabled: !ticket,
    execute: (args: { pacing?: unknown; seconds?: unknown }) => runWebMCPTool("set_host_game_settings", () => `Host settings updated: ${applyHostSettings(args)}.`),
  });

  useWebMCP({
    name: "toggle_sound",
    description: "Turn the game's sound effects on or off.",
    execute: () => runWebMCPTool("toggle_sound", () => {
      setSound(!sound);
      return `Sound is now ${sound ? 'off' : 'on'}.`;
    }),
  });

  useWebMCP({
    name: "open_rules",
    description: "Open the 'How to play' dialog that explains the Quiz_Knight rules.",
    execute: () => runWebMCPTool("open_rules", () => {
      setHelp(true);
      return "Opened the rules dialog.";
    }),
  });
  return (
    <div className="app-shell">
      <header className="site-header"><a href="/" className="wordmark"><KnightMark /><span>QUIZ<span className="text-primary">_</span>KNIGHT</span></a>
        <div className="header-actions"><span className="live-label"><i /> GAME NIGHT, UPGRADED</span><Button variant="ghost" onClick={() => setHelp(true)}><HelpCircle /> <span>How to play</span></Button><Button variant="ghost" size="icon" title={sound ? 'Mute sound' : 'Enable sound'} aria-label={sound ? 'Mute sound' : 'Enable sound'} onClick={() => setSound(!sound)}>{sound ? <Volume2 /> : <VolumeX />}</Button><Link to="/login" search={{ next: '/' }} className="header-account" title="Account"><UserRound /><span>Account</span></Link></div>
      </header>
      <main>
        {!ticket ? <>
          <section className="entry-stage">
            <div className="entry-heading"><div className="eyebrow"><Swords /> THE MULTIPLAYER TRIVIA SHOWDOWN</div><h1>QUIZ<span className="text-primary">_</span>KNIGHT</h1><p>A good guess. A little luck. <strong>One last knight standing.</strong></p></div>
            <div className="entry-grid">
              <div className="join-panel">
                <div className="panel-topline"><span>YOUR QUEST STARTS HERE</span><Sparkles /></div>
                <div className="mode-switch"><Button variant="ghost" className={mode === 'join' ? 'selected' : ''} onClick={() => { setMode('join'); setError(''); }}><Users /> Join a game</Button><Button variant="ghost" className={mode === 'host' ? 'selected' : ''} onClick={() => { setMode('host'); setError(''); }}><Crown /> Host a game</Button></div>
                <form onSubmit={e => { e.preventDefault(); void join(); }}>
                  <label htmlFor="nickname">Your nickname <span>Make it legendary.</span></label>
                  <div className="input-wrap"><Shield /><input id="nickname" placeholder="e.g. Sir Guesses-a-Lot" value={name} onChange={e => setName(e.target.value)} maxLength={18} required autoComplete="nickname" /></div>
                  {mode === 'join' ? <><label htmlFor="room-code">Room code <span>Get this from your host.</span></label><input id="room-code" className="code-input" placeholder="A B C D" value={code} onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4))} pattern="[A-Z]{4}" required maxLength={4} autoComplete="off" /></> : <><label htmlFor="round-time">Round timer <span>Every second counts.</span></label><select id="round-time" value={seconds} onChange={e => setSeconds(Number(e.target.value))}><option value={15}>15 seconds — Fast & furious</option><option value={30}>30 seconds — The classic</option><option value={45}>45 seconds — A little thinking time</option><option value={60}>60 seconds — No rush</option></select><label htmlFor="pacing">Game pace <span>How rounds flow.</span></label><select id="pacing" value={pacing} onChange={e => setPacing(e.target.value as typeof pacing)}><option value="steady">Steady Siege — same timer, host starts each round</option><option value="rising">Rising Pressure — timer shrinks, harder questions, auto-advance</option><option value="chaos">Crowd’s Chaos — ends when all lock in, quick reveals</option></select></>}
                  {error && <p className="error-message" role="alert">{error}</p>}
                  <Button className="quest-button" type="submit" disabled={busy || !name.trim() || (mode === 'join' && code.length !== 4)}>{busy ? 'Preparing your quest…' : mode === 'join' ? 'Enter the arena' : 'Create your arena'}<ArrowRight /></Button>
                </form>
                <div className="panel-foot"><i /><span>No accounts. No downloads. Just your friends.</span></div>
              </div>
              <div className="knight-scene"><div className="scene-cross cross-one">+</div><div className="scene-cross cross-two">+</div><img src={knight.url} alt="Silver armored Quiz Knight with a lime plume, sword and shield" /><div className="knight-badge"><span className="badge-icon"><Crown /></span><div><small>THE TITLE IS UP FOR GRABS</small><strong>Will you be the next knight?</strong></div></div><span className="scene-caption">TRUST YOUR GUT. DEFEND YOUR GUESS.</span></div>
            </div>
            <div className="game-facts"><span><Users /> 2–52 players</span><span><Timer /> Quick-fire rounds</span><span><Zap /> Real-time elimination</span><span><Trophy /> One champion</span></div>
          </section>
          <section className="quest-path"><div className="section-heading"><span className="eyebrow">FROM FIRST GUESS TO FINAL GLORY</span><h2>One room. All your friends. <span>Only one winner.</span></h2></div><div className="path-grid">{[
            { icon: Users, no: '01', title: 'Gather your party', text: 'Host a room, share the code, and bring your rivals together.' },
            { icon: Timer, no: '02', title: 'Make your best guess', text: 'Every answer is a number. Get as close as you can before time runs out.' },
            { icon: Swords, no: '03', title: 'Survive the showdown', text: 'Start with two shields. The farthest guess takes a hit. Zero armor? Join the council.' },
            { icon: Trophy, no: '04', title: 'Claim the crown', text: 'The final four enter the bracket. Win your duels. Become the Quiz Knight.' },
          ].map(({ icon: Icon, no, title, text }) => <div className="path-step" key={no}><div className="step-top"><Icon /><span>{no}</span></div><h3>{title}</h3><p>{text}</p></div>)}</div></section>
        </> : !game ? <div className="loading-arena"><KnightMark large /><h2>Entering the arena…</h2>{error && <><p role="alert">{error}</p><Button onClick={() => { sessionStorage.removeItem('quiz-knight-ticket'); setTicket(null); }}>Back to game night</Button></>}</div> : <section className="arena">
          <div className="arena-top"><div><span className="eyebrow">{game.phase === 'lobby' ? 'THE PARTY IS GATHERING' : game.sudden ? 'SUDDEN DEATH' : game.matches.length ? 'THE KNOCKOUT STAGE' : 'THE ARENA'}</span><h1>{game.phase === 'lobby' ? 'Assemble your knights.' : game.phase === 'finished' ? 'We have a champion.' : `Round ${game.round}`}</h1></div><div className="room-controls"><Button variant="outline" title="Copy room code" onClick={async () => { try { await navigator.clipboard.writeText(game.code); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setError('Your room code is ' + game.code); } }}><span className="room-code">{game.code}</span>{copied ? <Check /> : <Copy />}</Button><Button variant="ghost" size="icon" title="Leave room" aria-label="Leave room" onClick={() => command('leave')}><LogOut /></Button></div></div>
          {error && <p className="error-message" role="alert">{error}</p>}
          <div className="arena-grid"><div className="game-main">{game.phase !== 'lobby' && <TacticalHud game={game} />}
            {game.phase === 'lobby' ? <div className="lobby-main"><div className="lobby-illustration"><img src={knight.url} alt="Quiz Knight ready for the arena" /></div><h2>The crown won’t win itself.</h2><p>Room <strong className="text-primary">{game.code}</strong> · {game.players.length} / 52 knights have arrived</p><div className="lobby-players">{game.players.map((p, i) => <div className="lobby-player" key={p.id}><PlayerAvatar index={i} name={p.name} /><strong>{p.name}</strong><small>{p.id === game.host ? 'HOST' : 'READY'}</small></div>)}</div>{isHost ? <Button className="quest-button" disabled={busy || game.players.length < 2} onClick={() => command('start')}>Start the showdown <Swords /></Button> : <p className="text-muted-foreground">Waiting for {playerName(game.host)} to start the showdown…</p>}<p className="lobby-hint">{game.players.length < 2 ? 'The arena needs at least two knights.' : `${game.pacing === 'rising' ? 'Rising Pressure' : game.pacing === 'chaos' ? 'Crowd’s Chaos' : 'Steady Siege'} · ${game.seconds}-second rounds · Closest guess survives`}</p></div> : game.phase === 'question' ? <div className="question-stage"><div className="question-meta"><span className="eyebrow">{game.question?.category}</span><div className={`countdown ${remaining <= 5 ? 'urgent' : ''}`}><Timer />{remaining}<small>SEC</small></div></div><div className="timer-track"><progress max={game.roundSeconds} value={remaining} /></div>{activeMatch && <p className="match-label">{activeMatch.target === 3 ? 'FINAL · BEST OF 5' : 'SEMIFINAL · BEST OF 3'}<br />{playerName(activeMatch.players[0])} <strong>{activeMatch.scores.join(' : ')}</strong> {playerName(activeMatch.players[1])}</p>}<h2>{game.question?.text}</h2>{me?.eliminated || !game.contenders.includes(game.me) ? <div className="spectator-note"><Eye /><h3>{me?.eliminated ? 'Your sword is down. The show goes on.' : 'This duel belongs to your fellow knights.'}</h3><p>You’re spectating · {game.submitted.length} / {game.contenders.length} guesses locked</p></div> : game.myGuess !== null ? <div className="locked-guess"><Check /><span>GUESS LOCKED</span><strong>{fmt(game.myGuess)}</strong><small>{game.question?.unit}</small><p>Trust your gut. The reveal is coming.</p></div> : <form className="guess-form" onSubmit={e => { e.preventDefault(); if (guess.trim()) void command('answer'); }}><label htmlFor="guess">YOUR BEST GUESS</label><div className="guess-field"><input id="guess" type="number" step="any" value={guess} onChange={e => setGuess(e.target.value)} placeholder="0" required /><span>{game.question?.unit}</span></div><Button className="quest-button" type="submit" disabled={busy || !guess.trim() || remaining === 0}>Lock in your guess <Shield /></Button><p>{game.submitted.length} / {game.contenders.length} knights have locked in</p></form>}</div> : <div className="reveal-stage">{game.phase === 'finished' ? <><div className="champion-crown"><Crown /></div><span className="eyebrow">THE NEW QUIZ KNIGHT</span><h2 className="champion-name">{playerName(game.champion)}</h2><p className="text-muted-foreground">The last guess standing. A crown well earned.</p></> : <><span className="eyebrow">THE ANSWER IS</span><h2 className="truth-number">{game.answer === undefined ? '' : fmt(game.answer)} <small>{game.question?.unit}</small></h2><p className="answer-source">{game.source}</p>{game.returnedIds?.length ? <p className="comeback-note"><Sparkles /> Return of the Fallen: {game.returnedIds.map(playerName).join(" & ")} {game.returnedIds.length > 1 ? "rejoin" : "rejoins"} the arena with 1 shield</p> : null}</>}
              <div className="ranking-list">{game.ranking.map((r, i) => <div className={`ranking-row ${game.eliminatedIds.includes(r.id) ? 'is-eliminated' : ''}`} key={r.id}><span className="rank-number">{i + 1}</span><PlayerAvatar index={game.players.findIndex(p => p.id === r.id)} name={playerName(r.id)} /><strong>{playerName(r.id)}{r.id === game.me && <small> YOU</small>}</strong><div><b>{r.guess === null ? 'No answer' : fmt(r.guess)}</b><small>{r.distance === null ? 'Timed out' : `${r.distance.toLocaleString()} away`}</small></div>{game.eliminatedIds.includes(r.id) ? <X className="text-destructive" /> : i === 0 ? <Check className="text-primary" /> : <span className="ranking-dot" />}</div>)}</div>
              {game.sudden ? <div className="round-notice"><Zap /><strong>Tied at the bottom. Sudden death.</strong><p>{game.contenders.map(id => playerName(id)).join(' vs ')} · 15 seconds. One more guess.</p></div> : game.eliminatedIds.length > 0 && <div className="round-notice"><Swords /><strong>{game.eliminatedIds.map(id => playerName(id)).join(', ')} has fallen.</strong><p>The Shadow Council awaits. Back a knight and wager your influence.</p></div>}
              {game.damagedIds.length > 0 && game.eliminatedIds.length === 0 && <div className="round-notice"><Shield /><strong>{game.damagedIds.map(id => playerName(id)).join(', ')} took an armor hit.</strong><p>Still standing. Every shield counts.</p></div>}
              {game.questionExhausted ? <><p className="text-muted-foreground">Every question in this room has been played. No questions will repeat.</p><Button className="quest-button" onClick={() => command('leave')}>Back to game night <ArrowRight /></Button></> : game.phase === 'finished' ? <Button className="quest-button" onClick={() => command('leave')}>Back to game night <ArrowRight /></Button> : game.pacing !== 'steady' ? <p className="text-muted-foreground">Next round in {Math.max(0, Math.ceil((game.revealUntil - now) / 1000))}s…</p> : isHost ? <Button className="quest-button" disabled={busy} onClick={() => command('next')}>{game.sudden ? 'Start sudden death' : 'Next round'} <ArrowRight /></Button> : <p className="text-muted-foreground">Waiting for the host to start the next round…</p>}
            </div>}
            {game.phase !== 'lobby' && <>{!game.matches.length && <RoundQuest game={game} />}<ShadowCouncil key={game.round} game={game} busy={busy} onPredict={predict} /></>}
          </div><aside className="party-sidebar"><div className="sidebar-heading"><Users /><h3>Your party</h3><span>{game.players.length}</span></div>{game.players.map((p, i) => <div className={`party-row ${p.eliminated ? 'fallen' : ''}`} key={p.id}><PlayerAvatar index={i} name={p.name} /><div><strong>{p.name} {p.id === game.me && <small>YOU</small>}</strong><small>{p.eliminated ? 'SHADOW COUNCIL' : p.id === game.host ? 'HOST' : game.submitted.includes(p.id) ? 'GUESS LOCKED' : game.phase === 'lobby' ? 'READY' : 'IN THE ARENA'}</small><ArmorCrests shields={p.shields} golden={p.golden} /></div>{p.eliminated ? <Eye /> : game.submitted.includes(p.id) ? <Check className="text-primary" /> : <i />}</div>)}<div className="sidebar-info"><Shield /><p>{game.players.filter(p => !p.eliminated).length} knights still standing</p></div>
            {game.matches.length > 0 && <div className="bracket"><div className="sidebar-heading"><Trophy /><h3>The final four</h3></div>{game.matches.map((m, i) => <div className={`bracket-match ${i === game.matchIndex ? 'current' : ''}`} key={i}><small>{m.target === 3 ? 'FINAL · BEST OF 5' : `SEMIFINAL ${i + 1} · BEST OF 3`}</small>{m.players.map((id, j) => <div className={m.winner === id ? 'text-primary' : ''} key={id}><span>{playerName(id)}</span><strong>{m.scores[j]}</strong>{m.winner === id && <Crown />}</div>)}</div>)}{game.matches.length < 3 && <div className="bracket-match"><small>FINAL · BEST OF 5</small><div><span>{playerName(game.finalists[0])}</span><ChevronRight /></div><div><span>{playerName(game.finalists[1])}</span><ChevronRight /></div></div>}</div>}
          </aside></div>
        </section>}
      </main>
      <footer className="site-footer"><span><KnightMark /> A LITTLE KNOWLEDGE. A LOT OF BRAGGING RIGHTS.</span><Button asChild variant="outline" className="min-h-11 max-w-full text-primary"><a href="https://pithelo.com" target="_blank" rel="noopener noreferrer">Join us at Pithelo.com <ArrowRight aria-hidden="true" /></a></Button></footer>
      <Dialog open={help} onOpenChange={setHelp}><DialogContent className="rules-dialog"><DialogHeader><DialogTitle><Swords /> The rules of the arena</DialogTitle></DialogHeader><ol><li><strong>Gather the party.</strong> Enter a nickname, create a room or join with the four-letter code. 2–52 friends, no accounts needed.</li><li><strong>Guess a number.</strong> Lock in one estimate before the countdown ends. Closest wins; a missed answer ranks last.</li><li><strong>Survive.</strong> Everyone starts with 2 Armor Shields. The farthest guess loses 1 charge; zero shields means elimination. With 22 or more knights standing, the two farthest guesses both lose a charge. Golden Aegis absorbs one hit. Tied worst guesses face a 15-second sudden-death question until the tie breaks.</li><li><strong>Stay for the show.</strong> Eliminated knights join the Shadow Council with 100 play points. Wager 5, 10 or 20 on the closest guess or a survivor. Winning predictions pay 2×.</li><li><strong>Claim bounties.</strong> Every round, the closest guess (plain distance, plus or minus) wins the Bullseye Bounty: +1 Shield, or Golden Aegis when both shields are full.</li><li><strong>Claim the crown.</strong> Four survivors enter two best-of-3 semifinals. The winners play a best-of-5 final. Series scoring replaces armor elimination in the bracket. The host advances rounds.</li></ol><p className="text-muted-foreground text-sm">With two players, you go straight to the best-of-5 final. With three, one knight losing both shields takes you there.</p></DialogContent></Dialog>
    </div>
  );
}
