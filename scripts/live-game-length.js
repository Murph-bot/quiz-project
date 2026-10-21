#!/usr/bin/env node
'use strict'

/**
 * Play a normal-phase game down to the bracket and report how many rounds it
 * took, so the real cost of a big room is measured rather than estimated.
 *
 * Usage: node scripts/live-game-length.js [baseUrl] [players]
 */

const BASE = process.argv[2] || 'https://quizknight.sotirios-k-goulas.workers.dev'
const PLAYERS = Number(process.argv[3] || 20)

async function call(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  let json = null
  try {
    json = await res.json()
  } catch {
    json = null
  }
  return { status: res.status, body: json }
}

async function main() {
  const created = await call('POST', '/api/sessions', { nickname: 'Host' })
  const roomCode = created.body?.roomCode
  if (!roomCode) throw new Error(`create failed: ${JSON.stringify(created.body)}`)
  console.log(`Room ${roomCode} with ${PLAYERS} players`)

  const players = [{ playerId: created.body.playerId, sessionSecret: created.body.sessionSecret }]
  for (let i = 2; i <= PLAYERS; i++) {
    const r = await call('POST', `/api/sessions/${roomCode}/join`, { nickname: `P${i}` })
    if (r.status !== 201) throw new Error(`join ${i} failed: ${r.status} ${JSON.stringify(r.body)}`)
    players.push({ playerId: r.body.playerId, sessionSecret: r.body.sessionSecret })
  }
  console.log(`Joined ${players.length}`)

  const host = players[0]
  const start = await call('POST', `/api/sessions/${roomCode}/start`, {
    playerId: host.playerId,
    sessionSecret: host.sessionSecret,
  })
  if (start.status !== 200) throw new Error(`start failed: ${JSON.stringify(start.body)}`)

  let roundId = start.body.roundId
  let alive = players.length
  let rounds = 0
  let phase = 'normal'
  let sawBracket = null
  let alivePlayers = players
  const startMs = Date.now()

  while (rounds < 60) {
    rounds++

    const answerStatuses = []
    // Spacing of 1e6 keeps every delta unique for any realistic answer, so the
    // farthest player is always alone and no tiebreak is triggered.
    for (let i = 0; i < alivePlayers.length; i++) {
      const r = await call('POST', `/api/sessions/${roomCode}/rounds/${roundId}/answer`, {
        playerId: alivePlayers[i].playerId,
        sessionSecret: alivePlayers[i].sessionSecret,
        value: i * 1_000_000,
      })
      answerStatuses.push(r.status)
    }

    const close = await call('POST', `/api/sessions/${roomCode}/rounds/${roundId}/close`, {
      playerId: host.playerId,
      sessionSecret: host.sessionSecret,
    })
    const body = close.body ?? {}

    if (body.tiebreakNeeded) {
      console.log(`Round ${rounds}: tiebreak triggered, stopping (game needs head-to-head)`)
      break
    }

    const eliminated = Array.isArray(body.eliminated) ? body.eliminated : []
    const goneIds = new Set(eliminated.map((e) => e.playerId))
    if (goneIds.size > 0) alivePlayers = alivePlayers.filter((p) => !goneIds.has(p.playerId))
    alive = body.aliveCount ?? alive - eliminated.length
    const answeredBack = Array.isArray(body.answers) ? body.answers.length : 0
    const statusCounts = answerStatuses.reduce((acc, s) => {
      acc[s] = (acc[s] ?? 0) + 1
      return acc
    }, {})
    console.log(
      `Round ${rounds}: posted=${alivePlayers.length} statuses=${JSON.stringify(statusCounts)} ` +
        `answers=${answeredBack} eliminated=${eliminated.length} alive=${alive} ` +
        `tiebreak=${!!body.tiebreakNeeded} bracketReady=${!!body.bracketReady} finalReady=${!!body.finalReady}`,
    )
    if (answeredBack < alivePlayers.length) {
      console.log(
        `  close refused: ${answeredBack} answers for ${alivePlayers.length} alive players. ${JSON.stringify(body).slice(0, 160)}`,
      )
      break
    }

    if (body.bracketReady) {
      sawBracket = body.bracket
      phase = 'semifinal'
      break
    }
    if (body.finalReady) {
      phase = 'final'
      break
    }
    if (body.gameOver === true) {
      console.log('Game reported gameOver before a bracket')
      break
    }

    const next = await call('POST', `/api/sessions/${roomCode}/rounds/next`, {
      playerId: host.playerId,
      sessionSecret: host.sessionSecret,
    })
    if (next.status !== 200) {
      console.log(`next round failed at ${rounds}: ${next.status} ${JSON.stringify(next.body)}`)
      break
    }
    roundId = next.body.roundId
    // Resurrection returns an eliminated player at the configured interval, so
    // the eligible pool can grow between rounds.
    if (next.body.resurrected?.playerId) {
      const back = players.find((p) => p.playerId === next.body.resurrected.playerId)
      if (back && !alivePlayers.some((p) => p.playerId === back.playerId)) alivePlayers.push(back)
      console.log(`  resurrected ${next.body.resurrected.nickname} (alive now ${alivePlayers.length})`)
    }
  }

  const secs = ((Date.now() - startMs) / 1000).toFixed(1)
  console.log(`\nReached phase "${phase}" after ${rounds} rounds in ${secs}s of API time`)
  if (sawBracket) {
    console.log(
      `Semifinals: ${sawBracket.sf1?.p1} vs ${sawBracket.sf1?.p2}, ${sawBracket.sf2?.p1} vs ${sawBracket.sf2?.p2}`,
    )
  } else {
    console.log('No bracket was created')
  }
}

main().catch((err) => {
  console.error(`FAILED: ${err.message}`)
  process.exitCode = 1
})
