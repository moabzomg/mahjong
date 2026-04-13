// ─── Hong Kong Mahjong — Full Game Engine ────────────────────────────────────
import {
  buildWall, sortHand, checkWin, getTenpaiTiles, tileKey,
  calcShanten, calcFan, isSevenPairs, isThirteenOrphans, SUITS, WIND_ZH, DRAGON_ZH
} from './tiles.js'
import { aiDiscard, aiWantsRon, AI_STRATEGIES, STRATEGY_KEYS } from '../ai/strategies.js'

export const PLAYER = 0
export const PLAYER_NAMES = ['你', 'AI 東', 'AI 南', 'AI 西']
export const SEAT_WINDS = ['東', '南', '西', '北']
export const WIND_VALUES = [0, 1, 2, 3] // E S W N

// ─── Round / game management ──────────────────────────────────────────────────
// Rounds: 東圈=0, 南圈=1, 西圈=2, 北圈=3
export const ROUND_NAMES = ['東圈', '南圈', '西圈', '北圈']

export function initGameSession(aiStrategies) {
  return {
    round: 0,          // 0-3 = 東南西北圈
    dealerSeat: 0,     // absolute seat index who is dealer
    dealerWins: 0,     // consecutive dealer wins (冧莊 counter)
    handsInRound: 0,   // hands played in this round
    totalHands: 0,
    sessionScores: [0, 0, 0, 0],
    aiStrategies: aiStrategies || ['nash', 'dragon', 'tortoise'],
    phase: 'session',  // session | hand | finished
    handResults: [],
  }
}

export function startHand(session) {
  const wall = buildWall()
  const hands = [[], [], [], []]
  const flowers = [[], [], [], []]

  // Deal 13 tiles each (莊家取14), skip flowers during deal then supplement
  // Simple: deal 13 to each, dealer gets 14th from wall later
  for (let i = 0; i < 13; i++) {
    for (let p = 0; p < 4; p++) {
      let tile = wall.pop()
      while (tile?.isFlower) {
        flowers[p].push(tile)
        tile = wall.pop()
      }
      if (tile) hands[p].push(tile)
    }
  }
  // Dealer draws 14th
  {
    let tile = wall.pop()
    while (tile?.isFlower) { flowers[session.dealerSeat].push(tile); tile = wall.pop() }
    if (tile) hands[session.dealerSeat].push(tile)
  }

  // Supplement flowers (補花) — draw replacements for flowers
  for (let p = 0; p < 4; p++) {
    while (flowers[p].length > 0 && wall.length > 0) {
      let tile = wall.pop()
      while (tile?.isFlower) { flowers[p].push(tile); tile = wall.pop() }
      if (tile) hands[p].push(tile)
    }
  }

  const seatWinds = [
    session.dealerSeat,
    (session.dealerSeat + 1) % 4,
    (session.dealerSeat + 2) % 4,
    (session.dealerSeat + 3) % 4,
  ]

  return {
    wall,
    hands: hands.map(h => sortHand(h)),
    melds: [[], [], [], []],    // declared melds per player
    flowers: flowers,            // flower tiles per player
    discards: [[], [], [], []],
    currentPlayer: session.dealerSeat,
    phase: 'discard',           // dealer already drew
    drawnTile: hands[session.dealerSeat][hands[session.dealerSeat].length - 1],
    lastDiscard: null,
    lastDiscardPlayer: null,
    winner: null,
    winFan: null,
    winLabels: [],
    isTsumo: false,
    scores: [...session.sessionScores],
    seatWinds,                  // seatWinds[p] = wind value of player p's seat
    roundWind: session.round,
    dealerSeat: session.dealerSeat,
    aiStrategies: session.aiStrategies,
    tenpaiTiles: [],
    log: [`${ROUND_NAMES[session.round]} 第${session.totalHands + 1}局 — ${PLAYER_NAMES[session.dealerSeat]}（${WIND_ZH[session.dealerSeat]}）做莊`],
    stats: {
      turns: 0, tilesDrawn: [0,0,0,0], discardCount: [0,0,0,0],
      winTypes: [], scoreHistory: [[...session.sessionScores]],
    },
  }
}

// ─── Draw tile ────────────────────────────────────────────────────────────────
export function drawTile(state) {
  if (state.wall.length === 0)
    return { ...state, phase: 'exhausted', log: [...state.log, '🀫 牌墻摸完，流局！'] }

  let tile = state.wall[state.wall.length - 1]
  let newWall = state.wall.slice(0, -1)

  // Skip flowers — supplement immediately
  const newFlowers = state.flowers.map(f => [...f])
  while (tile?.isFlower) {
    newFlowers[state.currentPlayer] = [...newFlowers[state.currentPlayer], tile]
    if (newWall.length === 0) return { ...state, wall: newWall, flowers: newFlowers, phase: 'exhausted' }
    tile = newWall[newWall.length - 1]
    newWall = newWall.slice(0, -1)
  }

  const p = state.currentPlayer
  const newHand = sortHand([...state.hands[p], tile])
  const newHands = state.hands.map((h, i) => i === p ? newHand : h)
  const tenpai = p === PLAYER ? getTenpaiTiles(newHand.filter(t => t.id !== tile.id), state.melds[p]) : []
  const stats = { ...state.stats, tilesDrawn: state.stats.tilesDrawn.map((v, i) => i === p ? v + 1 : v), turns: state.stats.turns + 1 }

  if (checkWin(newHand, state.melds[p])) {
    const { fan, label } = calcFan(newHand, state.melds[p], true, state.seatWinds[p], state.roundWind)
    if (fan >= 3) {
      const pts = fanToPoints(fan)
      const scores = [...state.scores]; scores[p] += pts * 3
      for (let i = 0; i < 4; i++) if (i !== p) scores[i] -= pts
      stats.winTypes = [...stats.winTypes, { player: p, type: label[0] || '自摸', fan, score: pts * 3 }]
      stats.scoreHistory = [...stats.scoreHistory, [...scores]]
      return { ...state, wall: newWall, hands: newHands, flowers: newFlowers, drawnTile: tile, phase: 'finished',
        winner: p, isTsumo: true, winFan: fan, winLabels: label, scores, stats,
        log: [...state.log, `🏆 ${p === 0 ? '你' : PLAYER_NAMES[p]} 自摸！${label.join('+')} (${fan}番)！`] }
    }
  }

  const msg = p === 0 ? `你摸牌（剩 ${newWall.length} 張）` : `${PLAYER_NAMES[p]} 摸牌（剩 ${newWall.length} 張）`
  return { ...state, wall: newWall, hands: newHands, flowers: newFlowers, drawnTile: tile, phase: 'discard', tenpaiTiles: tenpai, stats, log: [...state.log, msg] }
}

// ─── Player discards ──────────────────────────────────────────────────────────
export function playerDiscard(state, tileId) {
  if (state.currentPlayer !== PLAYER || state.phase !== 'discard') return state
  const tile = state.hands[PLAYER].find(t => t.id === tileId)
  if (!tile) return state
  return executeDiscard(state, PLAYER, tile)
}

function executeDiscard(state, p, tile) {
  const newHand = sortHand(state.hands[p].filter(t => t.id !== tile.id))
  const newDiscards = state.discards.map((d, i) => i === p ? [...d, tile] : d)
  const newHands = state.hands.map((h, i) => i === p ? newHand : h)
  const stats = { ...state.stats, discardCount: state.stats.discardCount.map((v, i) => i === p ? v + 1 : v) }

  // Check Ron from all other players
  for (const cp of [0, 1, 2, 3]) {
    if (cp === p) continue
    if (cp === PLAYER) continue // human decides manually
    const cpStrat = cp === 0 ? 'nash' : state.aiStrategies[cp - 1]
    const claimHand = sortHand([...newHands[cp], tile])
    if (checkWin(claimHand, state.melds[cp]) && aiWantsRon(cpStrat, tile, newHands[cp], state.melds[cp])) {
      const { fan, label } = calcFan(claimHand, state.melds[cp], false, state.seatWinds[cp], state.roundWind)
      if (fan >= 3) {
        const pts = fanToPoints(fan)
        const scores = [...state.scores]; scores[cp] += pts; scores[p] -= pts
        stats.winTypes = [...stats.winTypes, { player: cp, type: label[0] || '炮', fan, score: pts }]
        stats.scoreHistory = [...stats.scoreHistory, [...scores]]
        return { ...state, hands: newHands.map((h, i) => i === cp ? claimHand : h),
          discards: newDiscards, lastDiscard: tile, lastDiscardPlayer: p, stats,
          phase: 'finished', winner: cp, isTsumo: false, winFan: fan, winLabels: label, scores,
          log: [...state.log, `${PLAYER_NAMES[p]} 打牌。`, `🏆 ${PLAYER_NAMES[cp]} 食炮！${label.join('+')} (${fan}番)`] }
      }
    }
  }

  const next = (p + 1) % 4
  stats.scoreHistory = [...stats.scoreHistory, [...state.scores]]
  return { ...state, hands: newHands, discards: newDiscards, lastDiscard: tile, lastDiscardPlayer: p,
    drawnTile: null, phase: 'draw', currentPlayer: next, tenpaiTiles: [], stats,
    log: [...state.log, `${p === 0 ? '你' : PLAYER_NAMES[p]} 打牌。`] }
}

// ─── Player claims discard (Ron) ─────────────────────────────────────────────
export function playerClaimDiscard(state) {
  if (!state.lastDiscard || state.currentPlayer === PLAYER) return state
  const tile = state.lastDiscard
  const claimHand = sortHand([...state.hands[PLAYER], tile])
  if (!checkWin(claimHand, state.melds[PLAYER])) return state
  const { fan, label } = calcFan(claimHand, state.melds[PLAYER], false, state.seatWinds[PLAYER], state.roundWind)
  if (fan < 3) return { ...state, log: [...state.log, `唔夠番（${fan}番），需要3番起糊！`] }
  const pts = fanToPoints(fan)
  const p = state.lastDiscardPlayer
  const scores = [...state.scores]; scores[PLAYER] += pts; scores[p] -= pts
  const stats = { ...state.stats, winTypes: [...state.stats.winTypes, { player: 0, type: label[0] || '炮', fan, score: pts }], scoreHistory: [...state.stats.scoreHistory, [...scores]] }
  return { ...state, hands: state.hands.map((h, i) => i === PLAYER ? claimHand : h),
    phase: 'finished', winner: PLAYER, isTsumo: false, winFan: fan, winLabels: label, scores, stats,
    log: [...state.log, `🏆 你食炮！${label.join('+')} (${fan}番)`] }
}

// ─── AI turn ──────────────────────────────────────────────────────────────────
export function aiTurn(state) {
  if (state.phase !== 'draw' && state.phase !== 'discard') return state
  if (state.currentPlayer === PLAYER) return state
  const p = state.currentPlayer

  // Draw phase
  let s = state
  if (state.phase === 'draw') {
    s = drawTile(state)
    if (s.phase === 'finished' || s.phase === 'exhausted') return s
  }

  // Discard phase
  const strat = s.aiStrategies[p - 1] || 'nash'
  const discardTile = aiDiscard(strat, s.hands[p], s.discards, s.melds[p])
  return executeDiscard(s, p, discardTile)
}

// ─── Fan to points (Hong Kong standard) ──────────────────────────────────────
export function fanToPoints(fan) {
  if (fan <= 3) return 8
  if (fan === 4) return 16
  if (fan === 5) return 24
  if (fan === 6) return 32
  if (fan === 7) return 48
  if (fan === 8) return 64
  if (fan <= 9) return 96
  if (fan <= 12) return 128
  return 256 // 13 fan = max
}

// ─── Session advance (冧莊/過莊) ─────────────────────────────────────────────
export function advanceSession(session, handState) {
  const winner = handState.winner
  const isDealer = winner === session.dealerSeat
  const isDraw = winner === -1 || handState.phase === 'exhausted'
  const result = {
    round: session.round,
    dealerSeat: session.dealerSeat,
    winner: handState.winner,
    winType: handState.winLabels?.[0] || '流局',
    fan: handState.winFan || 0,
    scores: handState.scores,
  }

  let newSession = {
    ...session,
    sessionScores: [...handState.scores],
    totalHands: session.totalHands + 1,
    handsInRound: session.handsInRound + 1,
    handResults: [...(session.handResults || []), result],
  }

  if (isDraw) {
    // 流局: dealer keeps seat (or could rotate — HK rules vary; we keep)
    return { ...newSession, phase: 'hand' }
  }

  if (isDealer || isDraw) {
    // 冧莊: dealer wins, dealer stays, dealerWins++
    newSession = { ...newSession, dealerWins: session.dealerWins + 1 }
    return { ...newSession, phase: 'hand' }
  }

  // 過莊: non-dealer wins, dealer rotates to next
  const nextDealer = (session.dealerSeat + 1) % 4
  const nextRound = nextDealer === 0 ? session.round + 1 : session.round
  newSession = { ...newSession, dealerSeat: nextDealer, dealerWins: 0, round: nextRound }

  if (nextRound >= 4) {
    // All 4 rounds complete — game over
    return { ...newSession, phase: 'finished' }
  }
  if (nextDealer === 0 && nextRound > session.round) {
    newSession = { ...newSession, handsInRound: 0 }
  }
  return { ...newSession, phase: 'hand' }
}

// ─── Full simulation ──────────────────────────────────────────────────────────
export function runSimulation(strategies) {
  const session = initGameSession([strategies[1], strategies[2], strategies[3]])
  let s = { ...session, aiStrategies: strategies }
  const allResults = []

  let handsLimit = 50
  while (s.phase !== 'finished' && handsLimit-- > 0) {
    let hand = startHand(s)
    let safety = 200
    while ((hand.phase === 'draw' || hand.phase === 'discard') && safety-- > 0) {
      const p = hand.currentPlayer
      const pStrat = strategies[p] || 'nash'
      if (hand.phase === 'draw') {
        hand = drawTile(hand)
        if (hand.phase === 'finished' || hand.phase === 'exhausted') break
      }
      if (hand.phase === 'discard') {
        const discardTile = aiDiscard(pStrat, hand.hands[p], hand.discards, hand.melds[p])
        hand = executeDiscard(hand, p, discardTile)
      }
    }
    if (hand.phase !== 'finished') hand = { ...hand, phase: 'exhausted', winner: -1 }
    allResults.push({ ...hand })
    s = advanceSession(s, hand)
  }

  return { session: s, results: allResults, strategies }
}
