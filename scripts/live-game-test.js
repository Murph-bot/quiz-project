#!/usr/bin/env node
'use strict'

/**
 * Drive real QuizKnight games over the public HTTP API and report every
 * setting's outcome. Runs against a live base URL, so this exercises the same
 * code path a browser hits, including auth, rounds, elimination and brackets.
 *
 * Usage: node scripts/live-game-test.js [baseUrl] [players...]
 *   node scripts/live-game-test.js https://app.example 3 5
 */

const BASE = process.argv[2] || 'https://quizknight.sotirios-k-goulas.workers.dev'
const PLAYER_COUNTS = process.argv.slice(3).map(Number).filter((n) => n > 1)
if (PLAYER_COUNTS.length === 0) PLAYER_COUNTS.push(3, 5)

const results = []
function check(game, name, ok, detail) {
  results.push({ game, name, ok, detail })
  const mark = ok ? 'PASS' : 'FAIL'
  process.stdout.write(`  [${mark}] ${name}${detail ? ` — ${detail}` : ''}\n`)
}

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

async function createGame(nickname) {
  return call('POST', '/api/sessions', { nickname })
}

async function joinGame(roomCode, nickname) {
  return call('POST', `/api/sessions/${roomCode}/join`, { nickname })
}

async function getSession(roomCode) {
  return call('GET', `/api/sessions/${roomCode}`)
}

async function setCategory(roomCode, host, category) {
  return call('PATCH', `/api/sessions/${roomCode}/category`, {
    category,
    playerId: host.playerId,
    sessionSecret: host.sessionSecret,
  })
}

async function startGame(roomCode, host) {
  return call('POST', `/api/sessions/${roomCode}/start`, {
    playerId: host.playerId,
    sessionSecret: host.sessionSecret,
  })
}

async function answer(roomCode, roundId, player, value) {
  return call('POST', `/api/sessions/${roomCode}/rounds/${roundId}/answer`, {
    playerId: player.playerId,
    sessionSecret: player.sessionSecret,
    value,
  })
}

async function closeRound(roomCode, roundId, host) {
  return call('POST', `/api/sessions/${roomCode}/rounds/${roundId}/close`, {
    playerId: host.playerId,
    sessionSecret: host.sessionSecret,
  })
}

async function nextRound(roomCode, host) {
  return call('POST', `/api/sessions/${roomCode}/rounds/next`, {
    playerId: host.playerId,
    sessionSecret: host.sessionSecret,
  })
}

async function revealRound(roomCode, roundId, player) {
  return call(
    'GET',
    `/api/sessions/${roomCode}/rounds/${roundId}?playerId=${player.playerId}&sessionSecret=${player.sessionSecret}`,
  )
}

async function runGame(playerCount) {
  const label = `${playerCount}p`
  console.log(`\n=== ${playerCount} players ===`)

  const hostRes = await createGame(`Host${playerCount}`)
  check(label, 'create session returns 201', hostRes.status === 201, `status ${hostRes.status}`)
  const roomCode = hostRes.body?.roomCode
  if (!roomCode) {
    check(label, 'room code issued', false, JSON.stringify(hostRes.body))
    return
  }
  check(label, 'room code is 4 chars', /^[A-Z0-9]{4}$/.test(roomCode), roomCode)

  const host = { playerId: hostRes.body.playerId, sessionSecret: hostRes.body.sessionSecret }
  const players = [host]

  for (let i = 2; i <= playerCount; i++) {
    const res = await joinGame(roomCode, `Player${i}`)
    const joined = res.status === 201 && res.body?.playerId
    check(label, `player ${i} joins`, !!joined, `status ${res.status}`)
    if (joined) players.push({ playerId: res.body.playerId, sessionSecret: res.body.sessionSecret })
  }

  const joinsRes = await joinGame(roomCode, 'Player2')
  check(label, 'duplicate nickname rejected', joinsRes.status === 409, `status ${joinsRes.status}`)

  const guestStart = await startGame(roomCode, players[1] ?? host)
  check(label, 'non-host cannot start', guestStart.status === 403, `status ${guestStart.status}`)

  const noAuth = await call('POST', `/api/sessions/${roomCode}/start`, {
    playerId: host.playerId,
    sessionSecret: 'wrong-secret',
  })
  check(label, 'bad secret cannot start', noAuth.status === 403, `status ${noAuth.status}`)

  const catRes = await setCategory(roomCode, host, 'Science')
  check(label, 'host can set category', catRes.status === 200, `status ${catRes.status}`)

  const badCat = await setCategory(roomCode, host, 'NotACategory')
  check(label, 'invalid category rejected', badCat.status === 400, `status ${badCat.status}`)

  const second = players[1] ?? host
  const guestCat = await call('PATCH', `/api/sessions/${roomCode}/category`, {
    category: 'Science',
    playerId: second.playerId,
    sessionSecret: second.sessionSecret,
  })
  check(label, 'non-host cannot set category', guestCat.status === 403, `status ${guestCat.status}`)

  const startRes = await startGame(roomCode, host)
  check(label, 'host starts game', startRes.status === 200, `status ${startRes.status}`)
  const roundId = startRes.body?.roundId ?? startRes.body?.round?.id
  const questionText = startRes.body?.question?.text ?? startRes.body?.questionText
  check(label, 'round created', !!roundId, roundId ? `round ${roundId}` : JSON.stringify(startRes.body))
  if (roundId) {
    check(
      label,
      'question served',
      !!questionText,
      questionText ? `${String(questionText).slice(0, 48)}...` : 'missing',
    )
  }

  const restart = await startGame(roomCode, host)
  check(label, 'cannot start twice', restart.status === 409, `status ${restart.status}`)

  if (!roundId) {
    check(label, 'game playable', false, 'no round to answer')
    return
  }

  const overRange = await answer(roomCode, roundId, players[0], 2147483648)
  check(label, 'out-of-range guess rejected', overRange.status === 400, `status ${overRange.status}`)

  const guesses = players.map((_, i) => (i === 0 ? 0 : i * 7))
  for (let i = 0; i < players.length; i++) {
    const res = await answer(roomCode, roundId, players[i], guesses[i])
    check(label, `player ${i + 1} answers`, res.status === 200, `status ${res.status}`)
  }

  const dupAnswer = await answer(roomCode, roundId, players[0], 1)
  check(label, 'duplicate answer rejected', dupAnswer.status === 409, `status ${dupAnswer.status}`)

  const closeRes = await closeRound(roomCode, roundId, host)
  const closeBody = closeRes.body ?? {}
  check(label, 'round closes', closeRes.status === 200, `status ${closeRes.status}`)
  check(
    label,
    'correct answer revealed',
    typeof closeBody.correctAnswer === 'number',
    `answer ${closeBody.correctAnswer}`,
  )
  const ranks = Array.isArray(closeBody.answers) ? closeBody.answers : []
  check(label, 'all players ranked', ranks.length >= players.length, `${ranks.length} rows`)
  const deltas = ranks.map((r) => r.delta).filter((d) => typeof d === 'number')
  const sorted = deltas.every((d, i) => i === 0 || deltas[i - 1] <= d)
  check(label, 'ranking ordered by closeness', sorted, `deltas ${deltas.join(',')}`)

  const closeAgain = await closeRound(roomCode, roundId, host)
  check(
    label,
    'closing twice is idempotent',
    closeAgain.status === 200 && closeAgain.body?.wasAlreadyClosed === true,
    `status ${closeAgain.status} wasAlreadyClosed=${closeAgain.body?.wasAlreadyClosed}`,
  )

  const reveal = await revealRound(roomCode, roundId, players[0])
  check(label, 'reveal GET works after close', reveal.status === 200, `status ${reveal.status}`)
  check(
    label,
    'reveal agrees on the answer',
    reveal.body?.correctAnswer === closeBody.correctAnswer,
    `${reveal.body?.correctAnswer} vs ${closeBody.correctAnswer}`,
  )

  const next = await nextRound(roomCode, host)
  check(label, 'next round advances', next.status === 200, `status ${next.status}`)

  const state = await getSession(roomCode)
  const alive = state.body?.players?.filter((p) => p.is_alive).length ?? null
  check(label, 'session still readable', state.status === 200, `status ${state.status}`)
  check(
    label,
    'exactly one player eliminated',
    alive === players.length - 1,
    `alive ${alive} of ${players.length}`,
  )
}

async function main() {
  console.log(`Base: ${BASE}`)
  console.log(`Player counts: ${PLAYER_COUNTS.join(', ')}`)

  for (const count of PLAYER_COUNTS) {
    try {
      await runGame(count)
    } catch (err) {
      check(`${count}p`, 'game run completed without throwing', false, err instanceof Error ? err.message : String(err))
    }
  }

  const passed = results.filter((r) => r.ok).length
  const failed = results.length - passed
  console.log(`\n=== ${passed} passed, ${failed} failed, ${results.length} checks ===`)
  if (failed > 0) {
    for (const r of results.filter((x) => !x.ok)) console.log(`FAIL ${r.game}: ${r.name} - ${r.detail}`)
  }
  process.exitCode = failed === 0 ? 0 : 1
}

main()
