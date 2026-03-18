'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useCountdown } from '@/hooks/useCountdown'
import { QuestionPanel } from './QuestionPanel'
import { RevealPanel } from './RevealPanel'
import { SpectatorScreen } from './SpectatorScreen'
import { WinnerScreen } from './WinnerScreen'
import { BracketScreen } from './BracketScreen'
import { MatchScoreBar } from './MatchScoreBar'
import { MatchResultScreen } from './MatchResultScreen'
import { TiebreakWaitingScreen } from './TiebreakWaitingScreen'
import type { RankedAnswer, EliminatedPlayer, WinnerInfo, BracketState } from '@/types'

interface QuestionData {
  id: string
  text: string
  timeLimit: number
  category: string
}

interface RevealData {
  correctAnswer: number
  answers: RankedAnswer[]
}

interface Props {
  roomCode: string
  sessionHostId: string
  initialRoundId: string
  initialRoundNumber: number
  initialQuestion: QuestionData
  initialStartedAt: string
  initialRevealData: RevealData | null
  initialWinner: WinnerInfo | null
}

const FAR_FUTURE_MS = Date.now() + 1e9

type Phase = 'answering' | 'waiting' | 'reveal' | 'spectating' | 'bracket' | 'match-result' | 'winner' | 'tiebreak-waiting'

export function GameScreen({
  roomCode,
  sessionHostId,
  initialRoundId,
  initialRoundNumber,
  initialQuestion,
  initialStartedAt,
  initialRevealData,
  initialWinner,
}: Props) {
  const router = useRouter()
  const playerId = typeof window !== 'undefined' ? sessionStorage.getItem('playerId') : null
  const nickname = typeof window !== 'undefined' ? sessionStorage.getItem('nickname') : null
  const isHost = playerId !== null && playerId === sessionHostId

  const [roundId, setRoundId] = useState(initialRoundId)
  const [roundNumber, setRoundNumber] = useState(initialRoundNumber)
  const [question, setQuestion] = useState(initialQuestion)
  const [startedAt, setStartedAt] = useState(initialStartedAt)

  const getInitialPhase = (): Phase => {
    if (initialWinner !== null) return 'winner'
    if (initialRevealData) return 'reveal'
    return 'answering'
  }

  const [phase, setPhase] = useState<Phase>(getInitialPhase)
  const [revealData, setRevealData] = useState<RevealData | null>(initialRevealData)
  const [eliminated, setEliminated] = useState<EliminatedPlayer[]>([])
  const [winner, setWinner] = useState<WinnerInfo | null>(initialWinner)
  const [gameOver, setGameOver] = useState(initialWinner !== null)
  const [resurrected, setResurrected] = useState<{ playerId: string; nickname: string } | null>(null)
  const [isSuddenDeath, setIsSuddenDeath] = useState(false)
  const [isGracePeriod, setIsGracePeriod] = useState(false)
  const [autoAdvanceIn, setAutoAdvanceIn] = useState(5)
  const [autoRedirectIn, setAutoRedirectIn] = useState(30)
  const [isSpectating, setIsSpectating] = useState(false)

  // Bracket state
  const [bracketData, setBracketData] = useState<BracketState | null>(null)
  const [matchWins, setMatchWins] = useState<[number, number]>([0, 0])
  const [currentMatchPhase, setCurrentMatchPhase] = useState<'sf1' | 'sf2' | 'final' | null>(null)
  const [matchResultData, setMatchResultData] = useState<{
    winnerNickname: string
    matchLabel: string
    finalScore: string
    nextLabel: string
  } | null>(null)

  // Tiebreak state
  const [tiebreakDeadlineMs, setTiebreakDeadlineMs] = useState<number>(FAR_FUTURE_MS)
  const [pendingTiebreak, setPendingTiebreak] = useState<{
    roundId: string
    question: QuestionData
    startedAt: string
    playerIds: string[]
  } | null>(null)

  const pendingTiebreakRef = useRef<{
    roundId: string
    question: QuestionData
    startedAt: string
    playerIds: string[]
  } | null>(null)

  useEffect(() => { pendingTiebreakRef.current = pendingTiebreak }, [pendingTiebreak])

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const isSpectatingRef = useRef(false)
  const gameOverRef = useRef(initialWinner !== null)
  const bracketDataRef = useRef<BracketState | null>(null)
  const currentMatchPhaseRef = useRef<'sf1' | 'sf2' | 'final' | null>(null)

  // Keep refs in sync with state
  useEffect(() => { bracketDataRef.current = bracketData }, [bracketData])
  useEffect(() => { currentMatchPhaseRef.current = currentMatchPhase }, [currentMatchPhase])

  // Helper: am I competing in the current bracket match?
  function computeAmICompeting(bd: BracketState | null, phase: 'sf1' | 'sf2' | 'final' | null, pid: string | null): boolean {
    if (!bd || !phase || !pid) return true
    if (phase === 'sf1') return bd.sf1.p1id === pid || bd.sf1.p2id === pid
    if (phase === 'sf2') return bd.sf2.p1id === pid || bd.sf2.p2id === pid
    return bd.finalists.includes(pid)
  }

  // Helper: resolve a finalist's display name from the bracket match data
  // finalists[] stores player IDs — look up the nickname via sf1/sf2 records
  function getFinalistNickname(bd: BracketState, id: string): string {
    if (bd.sf1.p1id === id) return bd.sf1.p1
    if (bd.sf1.p2id === id) return bd.sf1.p2
    if (bd.sf2.p1id === id) return bd.sf2.p1
    if (bd.sf2.p2id === id) return bd.sf2.p2
    return id // fallback (should not happen)
  }

  // Redirect if no identity
  useEffect(() => {
    if (!playerId) router.push('/')
  }, [playerId, router])

  // Countdown for current question — used to trigger close when expired
  const deadlineMs = new Date(startedAt).getTime() + question.timeLimit * 1000
  const { isExpired } = useCountdown(
    phase === 'answering' || phase === 'waiting' || phase === 'tiebreak-waiting'
      ? deadlineMs
      : FAR_FUTURE_MS
  )

  const GRACE_PERIOD_MS = 5000

  // Timer expired → grace period → race to close the round
  useEffect(() => {
    if (!isExpired || (phase !== 'answering' && phase !== 'waiting' && phase !== 'tiebreak-waiting')) return
    setIsGracePeriod(true)
    const grace = setTimeout(() => {
      setIsGracePeriod(false)
      fetch(`/api/sessions/${roomCode}/rounds/${roundId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
        .then(r => r.json())
        .then(data => {
          if (data.wasAlreadyClosed) return

          // --- TIEBREAK NEEDED ---
          if (data.tiebreakNeeded && data.tiebreakRoundId) {
            setEliminated([])
            setRevealData({ correctAnswer: data.correctAnswer, answers: data.answers })
            setPhase('reveal')

            const tbQuestion: QuestionData = {
              id: data.tiebreakQuestion.id,
              text: data.tiebreakQuestion.text,
              timeLimit: data.tiebreakQuestion.timeLimit,
              category: data.tiebreakQuestion.category,
            }
            const deadline = new Date(data.tiebreakStartedAt).getTime() + data.tiebreakQuestion.timeLimit * 1000
            setTiebreakDeadlineMs(deadline)
            setPendingTiebreak({
              roundId: data.tiebreakRoundId,
              question: tbQuestion,
              startedAt: data.tiebreakStartedAt,
              playerIds: data.tiebreakPlayerIds ?? [],
            })

            channelRef.current?.send({
              type: 'broadcast',
              event: 'round:closed',
              payload: {
                correctAnswer: data.correctAnswer,
                answers: data.answers,
                eliminated: [],
                winner: null,
                gameOver: false,
                tiebreakNeeded: true,
                tiebreakRoundId: data.tiebreakRoundId,
                tiebreakQuestion: data.tiebreakQuestion,
                tiebreakPlayerIds: data.tiebreakPlayerIds,
                tiebreakStartedAt: data.tiebreakStartedAt,
              },
            })
            return
          }
          // --- END TIEBREAK NEEDED ---

          // --- BRACKET MODE: bracket just generated ---
          if (data.bracketReady && data.bracket) {
            setBracketData(data.bracket)
            setCurrentMatchPhase('sf1')
            setPhase('bracket')
            channelRef.current?.send({
              type: 'broadcast',
              event: 'bracket:ready',
              payload: { bracket: data.bracket },
            })
            return
          }

          // --- BRACKET MODE: tie — replay with new question ---
          if (data.isTie) {
            setRevealData({ correctAnswer: data.correctAnswer, answers: data.answers })
            setPhase('reveal')
            channelRef.current?.send({
              type: 'broadcast',
              event: 'tie:replay',
              payload: { correctAnswer: data.correctAnswer, answers: data.answers },
            })
            // auto-advance useEffect will call /rounds/next after 5s
            return
          }

          // --- BRACKET MODE: game over (Final winner) ---
          if (data.gameOver && data.winner) {
            setGameOver(true)
            gameOverRef.current = true
            setWinner(data.winner ?? null)
            setRevealData({ correctAnswer: data.correctAnswer, answers: data.answers })
            setPhase('reveal')
            channelRef.current?.send({
              type: 'broadcast',
              event: 'round:closed',
              payload: {
                correctAnswer: data.correctAnswer,
                answers: data.answers,
                eliminated: [],
                winner: data.winner,
                gameOver: true,
              },
            })
            return
          }

          // --- BRACKET MODE: SF or Final match complete ---
          if (data.sfComplete || data.finalReady) {
            const currentBracketSF = bracketDataRef.current?.currentSF
            const sfLabel = currentBracketSF === 1 ? 'Semi-Final 1' : 'Semi-Final 2'
            const sfKey = currentBracketSF === 1 ? 'sf1' : 'sf2'
            const sfWins = (data.bracket as any)?.[sfKey]?.wins ?? [0, 0]
            const finalScore = `${sfWins[0]} \u2013 ${sfWins[1]}`
            const nextLabel = data.finalReady ? 'The Final is next!' : 'Semi-Final 2 up next'
            const nextMatchPhase = data.finalReady ? 'final' : 'sf2'

            setBracketData(data.bracket)
            setMatchWins([0, 0])
            setCurrentMatchPhase(nextMatchPhase as 'sf1' | 'sf2' | 'final')
            setMatchResultData({
              winnerNickname: data.matchWinnerNickname ?? '',
              matchLabel: sfLabel,
              finalScore,
              nextLabel,
            })
            setPhase('match-result')

            const eventName = data.finalReady ? 'final:ready' : 'match:complete'
            channelRef.current?.send({
              type: 'broadcast',
              event: eventName,
              payload: {
                bracket: data.bracket,
                matchWinnerNickname: data.matchWinnerNickname,
                matchLabel: sfLabel,
                finalScore,
                nextLabel,
                nextMatchPhase,
              },
            })
            return
          }

          // --- BRACKET MODE: match continues (no winner yet) ---
          if (data.bracket && currentMatchPhaseRef.current) {
            const sfKey2 = data.bracket.currentSF === 1 ? 'sf1' : data.bracket.currentSF === 2 ? 'sf2' : null
            const newWins: [number, number] = sfKey2
              ? (data.bracket as any)[sfKey2].wins
              : [data.bracket.finalWins?.[0] ?? 0, data.bracket.finalWins?.[1] ?? 0]
            setMatchWins(newWins)
            setBracketData(data.bracket)
            setRevealData({ correctAnswer: data.correctAnswer, answers: data.answers })
            setPhase('reveal')
            channelRef.current?.send({ type: 'broadcast', event: 'match:point', payload: { wins: newWins, bracket: data.bracket } })
            channelRef.current?.send({
              type: 'broadcast',
              event: 'round:closed',
              payload: {
                correctAnswer: data.correctAnswer,
                answers: data.answers,
                eliminated: [],
                winner: null,
                gameOver: false,
              },
            })
            return
          }

          // --- NORMAL MODE ---
          setEliminated(data.eliminated ?? [])
          setRevealData({ correctAnswer: data.correctAnswer, answers: data.answers })
          setPhase('reveal')

          if (data.gameOver) {
            setGameOver(true)
            gameOverRef.current = true
            setWinner(data.winner ?? null)
          }

          if (data.eliminated?.some((e: EliminatedPlayer) => e.playerId === playerId)) {
            isSpectatingRef.current = true
            setIsSpectating(true)
          }

          channelRef.current?.send({
            type: 'broadcast',
            event: 'round:closed',
            payload: {
              correctAnswer: data.correctAnswer,
              answers: data.answers,
              eliminated: data.eliminated,
              winner: data.winner,
              gameOver: data.gameOver,
            },
          })
        })
    }, GRACE_PERIOD_MS)
    return () => clearTimeout(grace)
  }, [isExpired, phase, roundId, roomCode, playerId])

  // Auto-advance after reveal
  useEffect(() => {
    if (phase !== 'reveal') return
    setAutoAdvanceIn(5)
    const tick = setInterval(() => setAutoAdvanceIn(s => Math.max(0, s - 1)), 1000)
    const advance = setTimeout(() => {
      if (!isHost || !playerId) return
      if (gameOverRef.current) {
        setPhase('winner')
        channelRef.current?.send({
          type: 'broadcast',
          event: 'game:over',
          payload: {},
        })
        return
      }

      // --- PENDING TIEBREAK: broadcast tiebreak:started instead of /rounds/next ---
      const pending = pendingTiebreakRef.current
      if (pending) {
        const amITiebreaker = pending.playerIds.includes(playerId ?? '')
        setRoundId(pending.roundId)
        setQuestion(pending.question)
        setStartedAt(pending.startedAt)
        setRevealData(null)
        setEliminated([])
        setIsGracePeriod(false)
        setPendingTiebreak(null)
        setTiebreakDeadlineMs(FAR_FUTURE_MS)
        setPhase(amITiebreaker ? 'answering' : 'tiebreak-waiting')

        channelRef.current?.send({
          type: 'broadcast',
          event: 'tiebreak:started',
          payload: {
            roundId: pending.roundId,
            question: pending.question,
            startedAt: pending.startedAt,
            playerIds: pending.playerIds,
          },
        })
        return
      }
      // --- END PENDING TIEBREAK ---

      fetch(`/api/sessions/${roomCode}/rounds/next`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId }),
      })
        .then(r => r.json())
        .then(data => {
          if (!data.roundId) return
          // Check if this player was resurrected
          if (data.resurrected?.playerId === playerId) {
            isSpectatingRef.current = false
            setIsSpectating(false)
          }
          setResurrected(data.resurrected ?? null)
          if (data.isSuddenDeath) setIsSuddenDeath(true)
          setRoundId(data.roundId)
          setRoundNumber(data.roundNumber)
          setQuestion(data.question)
          setStartedAt(data.startedAt)
          setRevealData(null)
          setEliminated([])
          setIsGracePeriod(false)
          const bd = bracketDataRef.current
          const mp = currentMatchPhaseRef.current
          setPhase(bd && mp ? (computeAmICompeting(bd, mp, playerId) ? 'answering' : 'spectating') : (isSpectatingRef.current ? 'spectating' : 'answering'))
          channelRef.current?.send({
            type: 'broadcast',
            event: 'round:started',
            payload: {
              roundId: data.roundId,
              roundNumber: data.roundNumber,
              question: data.question,
              startedAt: data.startedAt,
              resurrected: data.resurrected ?? null,
              isSuddenDeath: data.isSuddenDeath ?? false,
            },
          })
        })
    }, 5000)
    return () => {
      clearInterval(tick)
      clearTimeout(advance)
    }
  }, [phase, isHost, playerId, roomCode])

  // Winner auto-redirect
  useEffect(() => {
    if (phase !== 'winner') return
    setAutoRedirectIn(30)
    const tick = setInterval(() => setAutoRedirectIn(s => Math.max(0, s - 1)), 1000)
    const redirect = setTimeout(() => router.push('/'), 30000)
    return () => {
      clearInterval(tick)
      clearTimeout(redirect)
    }
  }, [phase, router])

  // Supabase Realtime subscriptions
  useEffect(() => {
    const channel = supabase
      .channel(`room:${roomCode}`)
      .on('broadcast', { event: 'round:closed' }, ({ payload }) => {
        if (payload.tiebreakNeeded && payload.tiebreakRoundId) {
          setEliminated([])
          setRevealData({ correctAnswer: payload.correctAnswer, answers: payload.answers })
          setPhase('reveal')
          const tbQ: QuestionData = {
            id: payload.tiebreakQuestion.id,
            text: payload.tiebreakQuestion.text,
            timeLimit: payload.tiebreakQuestion.timeLimit,
            category: payload.tiebreakQuestion.category,
          }
          const deadline = new Date(payload.tiebreakStartedAt).getTime() + payload.tiebreakQuestion.timeLimit * 1000
          setTiebreakDeadlineMs(deadline)
          setPendingTiebreak({
            roundId: payload.tiebreakRoundId,
            question: tbQ,
            startedAt: payload.tiebreakStartedAt,
            playerIds: payload.tiebreakPlayerIds ?? [],
          })
          return
        }

        setEliminated(payload.eliminated ?? [])
        setRevealData({ correctAnswer: payload.correctAnswer, answers: payload.answers })
        setPhase('reveal')

        if (payload.gameOver) {
          setGameOver(true)
          gameOverRef.current = true
          setWinner(payload.winner ?? null)
        }

        if (payload.eliminated?.some((e: EliminatedPlayer) => e.playerId === playerId)) {
          isSpectatingRef.current = true
          setIsSpectating(true)
        }
      })
      .on('broadcast', { event: 'round:started' }, ({ payload }) => {
        if (payload.resurrected?.playerId === playerId) {
          isSpectatingRef.current = false
          setIsSpectating(false)
        }
        setResurrected(payload.resurrected ?? null)
        if (payload.isSuddenDeath) setIsSuddenDeath(true)
        setRoundId(payload.roundId)
        setRoundNumber(payload.roundNumber)
        setQuestion(payload.question)
        setStartedAt(payload.startedAt)
        setRevealData(null)
        setEliminated([])
        setIsGracePeriod(false)
        const bd = bracketDataRef.current
        const mp = currentMatchPhaseRef.current
        setPhase(bd && mp ? (computeAmICompeting(bd, mp, playerId) ? 'answering' : 'spectating') : (isSpectatingRef.current ? 'spectating' : 'answering'))
      })
      .on('broadcast', { event: 'game:over' }, () => {
        setPhase('winner')
      })
      .on('broadcast', { event: 'bracket:ready' }, ({ payload }) => {
        setBracketData(payload.bracket)
        setCurrentMatchPhase('sf1')
        setPhase('bracket')
      })
      .on('broadcast', { event: 'match:point' }, ({ payload }) => {
        setMatchWins(payload.wins)
        setBracketData(payload.bracket)
      })
      .on('broadcast', { event: 'match:complete' }, ({ payload }) => {
        setBracketData(payload.bracket)
        setCurrentMatchPhase(payload.nextMatchPhase ?? 'sf2')
        setMatchWins([0, 0])
        setMatchResultData({
          winnerNickname: payload.matchWinnerNickname,
          matchLabel: payload.matchLabel,
          finalScore: payload.finalScore,
          nextLabel: payload.nextLabel,
        })
        setPhase('match-result')
      })
      .on('broadcast', { event: 'tie:replay' }, ({ payload }) => {
        setRevealData({ correctAnswer: payload.correctAnswer, answers: payload.answers })
        setPhase('reveal')
      })
      .on('broadcast', { event: 'final:ready' }, ({ payload }) => {
        setBracketData(payload.bracket)
        setCurrentMatchPhase('final')
        setMatchWins([0, 0])
        setMatchResultData({
          winnerNickname: payload.matchWinnerNickname,
          matchLabel: payload.matchLabel,
          finalScore: payload.finalScore,
          nextLabel: 'The Final is next!',
        })
        setPhase('match-result')
      })
      .on('broadcast', { event: 'tiebreak:started' }, ({ payload }) => {
        const amITiebreaker = (pendingTiebreakRef.current?.playerIds ?? []).includes(playerId ?? '')
        setRoundId(payload.roundId)
        setQuestion(payload.question)
        setStartedAt(payload.startedAt)
        setRevealData(null)
        setEliminated([])
        setIsGracePeriod(false)
        setPendingTiebreak(null)
        setTiebreakDeadlineMs(FAR_FUTURE_MS)
        setPhase(amITiebreaker ? 'answering' : 'tiebreak-waiting')
      })
      .subscribe()
    channelRef.current = channel
    return () => { supabase.removeChannel(channel) }
  }, [roomCode, playerId])

  async function handleSubmit(value: number) {
    if (!playerId || isSpectatingRef.current) return
    const res = await fetch(`/api/sessions/${roomCode}/rounds/${roundId}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId, value }),
    })
    if (res.ok) setPhase('waiting')
  }

  const amICompeting = computeAmICompeting(bracketData, currentMatchPhase, playerId)

  if (phase === 'winner') {
    return <WinnerScreen winnerNickname={winner?.nickname ?? null} autoRedirectIn={autoRedirectIn} />
  }

  if (phase === 'bracket' && bracketData) {
    return (
      <BracketScreen
        bracket={bracketData}
        myPlayerId={playerId ?? ''}
        onReady={() => {
          // All players advance their own UI phase
          setPhase(amICompeting ? 'answering' : 'spectating')
          // Host also triggers next round
          if (isHost) {
            fetch(`/api/sessions/${roomCode}/rounds/next`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ playerId }),
            })
              .then(r => r.json())
              .then(nextData => {
                if (!nextData.roundId) return
                setRoundId(nextData.roundId)
                setRoundNumber(nextData.roundNumber)
                setQuestion(nextData.question)
                setStartedAt(nextData.startedAt)
                setRevealData(null)
                setIsGracePeriod(false)
                channelRef.current?.send({
                  type: 'broadcast',
                  event: 'round:started',
                  payload: {
                    roundId: nextData.roundId,
                    roundNumber: nextData.roundNumber,
                    question: nextData.question,
                    startedAt: nextData.startedAt,
                    resurrected: null,
                    isSuddenDeath: false,
                  },
                })
              })
          }
        }}
      />
    )
  }

  if (phase === 'match-result' && matchResultData) {
    return (
      <MatchResultScreen
        winnerNickname={matchResultData.winnerNickname}
        matchLabel={matchResultData.matchLabel}
        finalScore={matchResultData.finalScore}
        nextLabel={matchResultData.nextLabel}
        onContinue={() => {
          setMatchResultData(null)
          setPhase(amICompeting ? 'answering' : 'spectating')
          if (isHost) {
            fetch(`/api/sessions/${roomCode}/rounds/next`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ playerId }),
            })
              .then(r => r.json())
              .then(nextData => {
                if (!nextData.roundId) return
                setRoundId(nextData.roundId)
                setRoundNumber(nextData.roundNumber)
                setQuestion(nextData.question)
                setStartedAt(nextData.startedAt)
                setRevealData(null)
                setIsGracePeriod(false)
                channelRef.current?.send({
                  type: 'broadcast',
                  event: 'round:started',
                  payload: {
                    roundId: nextData.roundId,
                    roundNumber: nextData.roundNumber,
                    question: nextData.question,
                    startedAt: nextData.startedAt,
                    resurrected: null,
                    isSuddenDeath: false,
                  },
                })
              })
          }
        }}
      />
    )
  }

  if (phase === 'tiebreak-waiting') {
    return (
      <TiebreakWaitingScreen
        roundNumber={roundNumber}
        deadlineMs={tiebreakDeadlineMs}
      />
    )
  }

  if (phase === 'reveal' && revealData) {
    return (
      <RevealPanel
        roundNumber={roundNumber}
        correctAnswer={revealData.correctAnswer}
        answers={revealData.answers}
        eliminated={eliminated}
        gameOver={gameOver}
        winner={winner}
        autoAdvanceIn={autoAdvanceIn}
        spectatorBanner={isSpectating ? (nickname ?? undefined) : null}
      />
    )
  }

  if (phase === 'spectating') {
    if (bracketData && currentMatchPhase) {
      const sfSpec = currentMatchPhase === 'sf1' ? bracketData.sf1
        : currentMatchPhase === 'sf2' ? bracketData.sf2 : null
      const matchLabelSpec = currentMatchPhase === 'final'
        ? 'Final · Best of 5'
        : currentMatchPhase === 'sf1'
        ? 'Semi-Final 1 · Best of 3'
        : 'Semi-Final 2 · Best of 3'
      const winsToWinSpec = currentMatchPhase === 'final' ? 3 : 2
      const p1Spec = sfSpec ? sfSpec.p1 : getFinalistNickname(bracketData, bracketData.finalists[0] ?? '')
      const p2Spec = sfSpec ? sfSpec.p2 : getFinalistNickname(bracketData, bracketData.finalists[1] ?? '')
      return (
        <>
          <MatchScoreBar p1={p1Spec} p2={p2Spec} wins={matchWins} matchLabel={matchLabelSpec} winsToWin={winsToWinSpec} />
          <QuestionPanel
            roundNumber={roundNumber}
            question={question}
            startedAt={startedAt}
            isWaiting={true}
            isGracePeriod={false}
            onSubmit={() => {}}
          />
        </>
      )
    }
    return <SpectatorScreen roundNumber={roundNumber} />
  }

  // Show resurrection banner briefly at start of answering phase
  return (
    <>
      {isSuddenDeath && (
        <div className="fixed top-4 left-0 right-0 flex justify-center z-50 pointer-events-none">
          <div className="bg-red-600 text-white px-4 py-2 rounded-full text-sm font-bold shadow-lg">
            ⚡ Sudden Death — last player standing wins!
          </div>
        </div>
      )}
      {resurrected && (
        <div className="fixed top-4 left-0 right-0 flex justify-center z-50 pointer-events-none">
          <div className="bg-green-500 text-white px-4 py-2 rounded-full text-sm font-bold shadow-lg">
            🔄 {resurrected.nickname} has been resurrected!
          </div>
        </div>
      )}
      {bracketData && currentMatchPhase && (() => {
        const sf = currentMatchPhase === 'sf1' ? bracketData.sf1
          : currentMatchPhase === 'sf2' ? bracketData.sf2 : null
        const matchLabel = currentMatchPhase === 'final'
          ? 'Final · Best of 5'
          : currentMatchPhase === 'sf1'
          ? 'Semi-Final 1 · Best of 3'
          : 'Semi-Final 2 · Best of 3'
        const winsToWin = currentMatchPhase === 'final' ? 3 : 2
        const p1 = sf ? sf.p1 : getFinalistNickname(bracketData, bracketData.finalists[0] ?? '')
        const p2 = sf ? sf.p2 : getFinalistNickname(bracketData, bracketData.finalists[1] ?? '')
        return <MatchScoreBar p1={p1} p2={p2} wins={matchWins} matchLabel={matchLabel} winsToWin={winsToWin} />
      })()}
      <QuestionPanel
        roundNumber={roundNumber}
        question={question}
        startedAt={startedAt}
        isWaiting={phase === 'waiting'}
        isGracePeriod={isGracePeriod}
        onSubmit={handleSubmit}
      />
    </>
  )
}
