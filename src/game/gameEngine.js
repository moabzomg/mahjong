// ─── Hong Kong Mahjong — Game Engine ─────────────────────────────────────────
import {
  buildWall, sortHand, checkWin, getTenpaiTiles, tileKey,
  calcShanten, calcFan, isSevenPairs, SUITS, WIND_ZH
} from './tiles.js'
import { aiDiscard, aiWantsRon } from '../ai/strategies.js'

export const PLAYER      = 0
export const PLAYER_NAMES = ['你', 'AI 東', 'AI 南', 'AI 西']
export const SEAT_WINDS   = ['東', '南', '西', '北']
export const ROUND_NAMES  = ['東圈', '南圈', '西圈', '北圈']

// ─── Session ──────────────────────────────────────────────────────────────────
export function initGameSession(aiStrategies) {
  return {
    round:          0,
    dealerSeat:     0,
    dealerWins:     0,
    handsInRound:   0,
    totalHands:     0,
    sessionScores:  [0, 0, 0, 0],
    aiStrategies:   aiStrategies || ['nash', 'dragon', 'tortoise'],
    phase:          'hand',
    handResults:    [],
  }
}

// ─── Deal a new hand ──────────────────────────────────────────────────────────
export function startHand(session) {
  let wall    = buildWall()
  const hands   = [[], [], [], []]
  const flowers = [[], [], [], []]

  // Draw a tile, auto-skipping flowers into the flower pile
  function drawFrom(wall, playerIdx) {
    while (wall.length > 0) {
      const t = wall.pop()
      if (t.isFlower) { flowers[playerIdx].push(t); continue }
      return { tile: t, wall }
    }
    return { tile: null, wall }
  }

  // Deal 13 tiles each
  for (let i = 0; i < 13; i++) {
    for (let p = 0; p < 4; p++) {
      const r = drawFrom(wall, p)
      wall = r.wall
      if (r.tile) hands[p].push(r.tile)
    }
  }

  // Dealer draws 14th tile
  const dealer = session.dealerSeat
  {
    const r = drawFrom(wall, dealer)
    wall = r.wall
    if (r.tile) hands[dealer].push(r.tile)
  }

  // 補花: supplement flowers — each player who drew flowers draws replacements
  for (let p = 0; p < 4; p++) {
    let needed = flowers[p].length
    while (needed > 0 && wall.length > 0) {
      const r = drawFrom(wall, p)
      wall = r.wall
      if (r.tile) { hands[p].push(r.tile); needed-- }
      else break
    }
  }

  // Dealer's last tile is their "drawn" tile for tsumo check
  const drawnTile = hands[dealer][hands[dealer].length - 1] || null

  const seatWinds = [0, 1, 2, 3].map(i => (dealer + i) % 4)

  return {
    wall,
    hands:             hands.map(h => sortHand(h)),
    melds:             [[], [], [], []],
    flowers,
    discards:          [[], [], [], []],
    currentPlayer:     dealer,
    phase:             'discard',   // dealer starts in discard phase (already has 14 tiles)
    drawnTile,
    lastDiscard:       null,
    lastDiscardPlayer: null,
    winner:            null,
    winFan:            null,
    winLabels:         [],
    isTsumo:           false,
    scores:            [...session.sessionScores],
    seatWinds,
    roundWind:         session.round,
    dealerSeat:        session.dealerSeat,
    aiStrategies:      session.aiStrategies,
    tenpaiTiles:       [],
    log:               [`${ROUND_NAMES[session.round]} 第${session.totalHands + 1}局 — ${PLAYER_NAMES[dealer]}（${WIND_ZH[seatWinds[dealer]]}）做莊`],
    stats: {
      turns: 0, tilesDrawn: [0,0,0,0], discardCount: [0,0,0,0],
      winTypes: [], scoreHistory: [[...session.sessionScores]],
    },
  }
}

// ─── Draw a tile ──────────────────────────────────────────────────────────────
export function drawTile(state) {
  if (state.wall.length === 0)
    return { ...state, phase: 'exhausted', log: [...state.log, '🀫 牌墻摸完，流局！'] }

  // Pop tiles, auto-collecting flowers
  let wall     = [...state.wall]
  const flowers = state.flowers.map(f => [...f])
  let tile     = wall.pop()
  const p      = state.currentPlayer

  while (tile?.isFlower) {
    flowers[p] = [...flowers[p], tile]
    if (!wall.length)
      return { ...state, wall, flowers, phase: 'exhausted', log: [...state.log, '🀫 牌墻摸完，流局！'] }
    tile = wall.pop()
  }

  if (!tile) return { ...state, wall, flowers, phase: 'exhausted' }

  const newHand  = sortHand([...state.hands[p], tile])
  const newHands = state.hands.map((h, i) => i === p ? newHand : h)
  const stats    = { ...state.stats, tilesDrawn: state.stats.tilesDrawn.map((v, i) => i===p ? v+1 : v), turns: state.stats.turns+1 }
  const tenpai   = p === PLAYER ? getTenpaiTiles(newHand.filter(t => t.id !== tile.id), state.melds[p]) : []

  // Check self-draw win
  if (checkWin(newHand, state.melds[p])) {
    const { fan, label } = calcFan(newHand, state.melds[p], true, state.seatWinds[p], state.roundWind)
    if (fan >= 3) {
      const pts    = fanToPoints(fan)
      const scores = [...state.scores]
      scores[p]   += pts * 3
      for (let i = 0; i < 4; i++) if (i !== p) scores[i] -= pts
      stats.winTypes     = [...stats.winTypes, { player:p, type:label[0]||'自摸', fan, score:pts*3 }]
      stats.scoreHistory = [...stats.scoreHistory, [...scores]]
      return {
        ...state, wall, flowers, hands: newHands, drawnTile: tile,
        phase: 'finished', winner: p, isTsumo: true,
        winFan: fan, winLabels: label, scores, stats,
        log: [...state.log, `🏆 ${p===0?'你':PLAYER_NAMES[p]} 自摸！${label.join('+')} (${fan}番)！`],
      }
    }
  }

  const msg = p===0 ? `你摸牌（剩 ${wall.length} 張）` : `${PLAYER_NAMES[p]} 摸牌（剩 ${wall.length} 張）`
  return { ...state, wall, flowers, hands: newHands, drawnTile: tile, phase: 'discard', tenpaiTiles: tenpai, stats, log: [...state.log, msg] }
}

// ─── Discard (shared by player and AI) ────────────────────────────────────────
function doDiscard(state, p, tile) {
  if (!tile) return state
  const newHand     = sortHand(state.hands[p].filter(t => t.id !== tile.id))
  const newDiscards = state.discards.map((d, i) => i===p ? [...d, tile] : d)
  const newHands    = state.hands.map((h, i) => i===p ? newHand : h)
  const stats       = { ...state.stats, discardCount: state.stats.discardCount.map((v, i) => i===p ? v+1 : v) }

  // Check Ron from all other players (AI only here; human uses playerClaimDiscard)
  for (const cp of [1, 2, 3]) {
    if (cp === p) continue
    const strat     = state.aiStrategies[cp - 1] || 'nash'
    const claimHand = sortHand([...newHands[cp], tile])
    if (checkWin(claimHand, state.melds[cp]) && aiWantsRon(strat, tile, newHands[cp], state.melds[cp])) {
      const { fan, label } = calcFan(claimHand, state.melds[cp], false, state.seatWinds[cp], state.roundWind)
      if (fan >= 3) {
        const pts    = fanToPoints(fan)
        const scores = [...state.scores]; scores[cp] += pts; scores[p] -= pts
        stats.winTypes     = [...stats.winTypes, { player:cp, type:label[0]||'炮', fan, score:pts }]
        stats.scoreHistory = [...stats.scoreHistory, [...scores]]
        return {
          ...state, hands: newHands.map((h, i) => i===cp ? claimHand : h),
          discards: newDiscards, lastDiscard: tile, lastDiscardPlayer: p, stats,
          phase: 'finished', winner: cp, isTsumo: false, winFan: fan, winLabels: label, scores,
          log: [...state.log, `${p===0?'你':PLAYER_NAMES[p]} 打牌。`, `🏆 ${PLAYER_NAMES[cp]} 食炮！${label.join('+')} (${fan}番)`],
        }
      }
    }
  }

  const next = (p + 1) % 4
  stats.scoreHistory = [...stats.scoreHistory, [...state.scores]]
  return {
    ...state, hands: newHands, discards: newDiscards,
    lastDiscard: tile, lastDiscardPlayer: p,
    drawnTile: null, phase: 'draw', currentPlayer: next, tenpaiTiles: [], stats,
    log: [...state.log, `${p===0?'你':PLAYER_NAMES[p]} 打牌。`],
  }
}

// ─── Player actions ───────────────────────────────────────────────────────────
export function playerDiscard(state, tileId) {
  if (state.currentPlayer !== PLAYER || state.phase !== 'discard') return state
  const tile = state.hands[PLAYER].find(t => t.id === tileId)
  if (!tile) return state
  return doDiscard(state, PLAYER, tile)
}

export function playerClaimDiscard(state) {
  // Player claims the last discarded tile as Ron (食炮)
  if (!state.lastDiscard) return state
  if (state.phase !== 'draw') return state   // can only claim between turns
  if (state.lastDiscardPlayer === PLAYER) return state  // can't claim own discard

  const tile      = state.lastDiscard
  const claimHand = sortHand([...state.hands[PLAYER], tile])
  if (!checkWin(claimHand, state.melds[PLAYER])) {
    return { ...state, log: [...state.log, '唔係和牌，無法食炮。'] }
  }
  const { fan, label } = calcFan(claimHand, state.melds[PLAYER], false, state.seatWinds[PLAYER], state.roundWind)
  if (fan < 3) {
    return { ...state, log: [...state.log, `唔夠番（${fan}番），三番起糊！`] }
  }
  const pts    = fanToPoints(fan)
  const p      = state.lastDiscardPlayer
  const scores = [...state.scores]; scores[PLAYER] += pts; scores[p] -= pts
  const stats  = {
    ...state.stats,
    winTypes:     [...state.stats.winTypes, { player:0, type:label[0]||'炮', fan, score:pts }],
    scoreHistory: [...state.stats.scoreHistory, [...scores]],
  }
  return {
    ...state, hands: state.hands.map((h, i) => i===PLAYER ? claimHand : h),
    phase: 'finished', winner: PLAYER, isTsumo: false, winFan: fan, winLabels: label, scores, stats,
    log: [...state.log, `🏆 你食炮！${label.join('+')} (${fan}番)`],
  }
}

// ─── AI turn (draw + discard) ─────────────────────────────────────────────────
export function aiTurn(state) {
  if (state.currentPlayer === PLAYER) return state
  if (state.phase === 'finished' || state.phase === 'exhausted') return state

  let s = state
  // Draw if needed
  if (s.phase === 'draw') {
    s = drawTile(s)
    if (s.phase === 'finished' || s.phase === 'exhausted') return s
  }
  if (s.phase !== 'discard') return s

  const p     = s.currentPlayer
  const strat = s.aiStrategies[p - 1] || 'nash'
  const disc  = aiDiscard(strat, s.hands[p], s.discards, s.melds[p])
  if (!disc) return { ...s, phase: 'exhausted' }
  return doDiscard(s, p, disc)
}

// ─── Fan to points ────────────────────────────────────────────────────────────
export function fanToPoints(fan) {
  if (fan <= 3)  return 8
  if (fan === 4) return 16
  if (fan === 5) return 24
  if (fan === 6) return 32
  if (fan === 7) return 48
  if (fan === 8) return 64
  if (fan <= 9)  return 96
  if (fan <= 12) return 128
  return 256
}

// ─── Session advance (冧莊/過莊) ──────────────────────────────────────────────
export function advanceSession(session, handState) {
  const winner   = handState.winner
  const isDraw   = winner === -1 || handState.phase === 'exhausted'
  const isDealer = !isDraw && winner === session.dealerSeat

  const result = {
    round: session.round, dealerSeat: session.dealerSeat,
    winner, winType: handState.winLabels?.[0] || '流局',
    fan: handState.winFan || 0, scores: handState.scores,
  }

  let ns = {
    ...session,
    sessionScores: [...handState.scores],
    totalHands:    session.totalHands + 1,
    handsInRound:  session.handsInRound + 1,
    handResults:   [...(session.handResults || []), result],
  }

  if (isDraw || isDealer) {
    // 流局 or 冧莊 — dealer stays
    ns = { ...ns, dealerWins: isDealer ? ns.dealerWins + 1 : ns.dealerWins }
    return { ...ns, phase: 'hand' }
  }

  // 過莊 — rotate dealer
  const nextDealer = (session.dealerSeat + 1) % 4
  const nextRound  = nextDealer === 0 ? session.round + 1 : session.round
  ns = { ...ns, dealerSeat: nextDealer, dealerWins: 0, round: nextRound }
  if (nextDealer === 0) ns = { ...ns, handsInRound: 0 }
  if (nextRound >= 4) return { ...ns, phase: 'finished' }
  return { ...ns, phase: 'hand' }
}

// ─── Simulation (synchronous, no UI) ─────────────────────────────────────────
export function runSimulation(strategies) {
  const strats   = strategies || ['nash','dragon','tortoise','tripletHunter']
  const aiStrats = [strats[1]||'nash', strats[2]||'nash', strats[3]||'nash']
  let session    = { ...initGameSession(aiStrats), aiStrategies: aiStrats }
  const results  = []

  let handsLimit = 80  // max hands per full simulation
  while (session.phase !== 'finished' && handsLimit-- > 0) {
    let hand   = startHand(session)
    let safety = 300   // max turns per hand

    while (safety-- > 0) {
      if (hand.phase === 'finished' || hand.phase === 'exhausted') break

      const p     = hand.currentPlayer
      const pStrat = strats[p] || 'nash'

      if (hand.phase === 'draw') {
        hand = drawTile(hand)
        continue
      }

      if (hand.phase === 'discard') {
        const disc = aiDiscard(pStrat, hand.hands[p], hand.discards, hand.melds[p])
        if (!disc) { hand = { ...hand, phase: 'exhausted', winner: -1 }; break }

        const newHand     = sortHand(hand.hands[p].filter(t => t.id !== disc.id))
        const newDiscards = hand.discards.map((d, i) => i===p ? [...d, disc] : d)
        const newHands    = hand.hands.map((h, i) => i===p ? newHand : h)
        const stats       = { ...hand.stats, discardCount: hand.stats.discardCount.map((v,i)=>i===p?v+1:v) }

        // Check Ron
        let ronWinner = -1
        for (const cp of [0,1,2,3]) {
          if (cp === p) continue
          const cpStrat   = strats[cp] || 'nash'
          const claimHand = sortHand([...newHands[cp], disc])
          if (checkWin(claimHand, hand.melds[cp]) && aiWantsRon(cpStrat, disc, newHands[cp], hand.melds[cp])) {
            const { fan, label } = calcFan(claimHand, hand.melds[cp], false, hand.seatWinds[cp], hand.roundWind)
            if (fan >= 3) {
              const pts    = fanToPoints(fan)
              const scores = [...hand.scores]; scores[cp] += pts; scores[p] -= pts
              stats.winTypes     = [...stats.winTypes, { player:cp, type:label[0], fan, score:pts }]
              stats.scoreHistory = [...stats.scoreHistory, [...scores]]
              hand = {
                ...hand, hands: newHands.map((h, i) => i===cp ? claimHand : h),
                discards: newDiscards, lastDiscard: disc, lastDiscardPlayer: p, stats,
                phase: 'finished', winner: cp, winFan: fan, winLabels: label, scores,
              }
              ronWinner = cp
              break
            }
          }
        }
        if (ronWinner !== -1) break

        const next = (p + 1) % 4
        stats.scoreHistory = [...stats.scoreHistory, [...hand.scores]]
        hand = { ...hand, hands: newHands, discards: newDiscards, lastDiscard: disc, lastDiscardPlayer: p,
          drawnTile: null, phase: 'draw', currentPlayer: next, tenpaiTiles: [], stats }
      }
    }

    if (hand.phase !== 'finished') hand = { ...hand, phase: 'exhausted', winner: -1 }
    results.push({ ...hand })
    session = advanceSession(session, hand)
  }

  return { session, results, strategies: strats }
}
