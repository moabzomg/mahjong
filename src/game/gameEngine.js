import { buildWall, sortHand, checkWin, getTenpaiTiles, tileKey } from './tiles.js'
import { AI_STRATEGIES, aiWantsClaim } from '../ai/strategies.js'

export const PLAYER = 0
export const AI_PLAYERS = [1, 2, 3]
export const ALL_PLAYERS = [0, 1, 2, 3]
export const WIND_ORDER = ['East', 'South', 'West', 'North']
export const PLAYER_NAMES = ['You', 'AI East', 'AI South', 'AI West']

export function initGame(aiStrategies) {
  const wall = buildWall()
  const hands = [[], [], [], []]
  // Deal 13 tiles each
  for (let i = 0; i < 13; i++) {
    for (let p = 0; p < 4; p++) {
      hands[p].push(wall.pop())
    }
  }
  return {
    wall,
    hands: hands.map(sortHand),
    discards: [[], [], [], []],
    melds: [[], [], [], []],
    currentPlayer: 0,
    phase: 'draw', // draw | discard | claim | finished
    drawnTile: null,
    lastDiscard: null,
    lastDiscardPlayer: null,
    winner: null,
    winningHand: null,
    round: 1,
    aiStrategies: aiStrategies || ['aggressive', 'defensive', 'greedy'],
    tenpaiTiles: [],
    log: ['Game started! It\'s your turn — draw a tile.'],
    scores: [0, 0, 0, 0],
    claimOptions: null,
  }
}

export function drawTile(state) {
  if (state.wall.length === 0) {
    return { ...state, phase: 'finished', winner: -1, log: [...state.log, '🎴 Wall exhausted — draw!'] }
  }
  const tile = state.wall[state.wall.length - 1]
  const newWall = state.wall.slice(0, -1)
  const newHand = sortHand([...state.hands[state.currentPlayer], tile])
  const newHands = state.hands.map((h, i) => i === state.currentPlayer ? newHand : h)

  // Check tenpai for player
  const tenpai = state.currentPlayer === PLAYER ? getTenpaiTiles(newHand.slice(0,-1)) : []

  // Check immediate win after draw (tsumo)
  if (checkWin(newHand)) {
    const scores = [...state.scores]
    scores[state.currentPlayer] += 8
    const name = state.currentPlayer === 0 ? 'You' : PLAYER_NAMES[state.currentPlayer]
    return {
      ...state,
      wall: newWall,
      hands: newHands,
      drawnTile: tile,
      phase: 'finished',
      winner: state.currentPlayer,
      scores,
      log: [...state.log, `🏆 ${name} wins by self-draw (Tsumo)!`],
    }
  }

  return {
    ...state,
    wall: newWall,
    hands: newHands,
    drawnTile: tile,
    phase: 'discard',
    tenpaiTiles: tenpai,
    log: [...state.log, state.currentPlayer === 0
      ? `You drew a tile. Hand: ${newHand.length} tiles`
      : `${PLAYER_NAMES[state.currentPlayer]} drew a tile.`],
  }
}

export function playerDiscard(state, tileId) {
  if (state.currentPlayer !== PLAYER || state.phase !== 'discard') return state
  const hand = state.hands[PLAYER]
  const idx = hand.findIndex(t => t.id === tileId)
  if (idx === -1) return state
  const tile = hand[idx]
  const newHand = sortHand(hand.filter(t => t.id !== tileId))
  const newDiscards = state.discards.map((d, i) => i === PLAYER ? [...d, tile] : d)
  const newHands = state.hands.map((h, i) => i === PLAYER ? newHand : h)

  // Check if any AI wants to claim
  for (const p of AI_PLAYERS) {
    const strat = state.aiStrategies[p - 1]
    if (aiWantsClaim(tile, state.hands[p], strat)) {
      // AI claims — but first check if claiming gives them a win
      const claimHand = sortHand([...state.hands[p], tile])
      if (checkWin(claimHand)) {
        const scores = [...state.scores]
        scores[p] += 16
        return {
          ...state,
          hands: newHands.map((h, i) => i === p ? claimHand : h),
          discards: newDiscards,
          lastDiscard: tile,
          lastDiscardPlayer: PLAYER,
          phase: 'finished',
          winner: p,
          scores,
          log: [...state.log, `🃏 You discarded. ${PLAYER_NAMES[p]} claims and wins! (Ron)`],
        }
      }
    }
  }

  return {
    ...state,
    hands: newHands,
    discards: newDiscards,
    lastDiscard: tile,
    lastDiscardPlayer: PLAYER,
    drawnTile: null,
    phase: 'draw',
    currentPlayer: 1,
    tenpaiTiles: [],
    log: [...state.log, `You discarded.`],
  }
}

export function aiTurn(state) {
  if (state.phase !== 'draw' || state.currentPlayer === PLAYER) return state
  const p = state.currentPlayer
  const strat = state.aiStrategies[p - 1]
  const stratObj = AI_STRATEGIES[strat]

  // Draw
  let s = drawTile(state)
  if (s.phase === 'finished') return s

  // AI discards
  const discardTile = stratObj.play(s.hands[p], s)
  const newHand = sortHand(s.hands[p].filter(t => t.id !== discardTile.id))
  const newDiscards = s.discards.map((d, i) => i === p ? [...d, discardTile] : d)
  const newHands = s.hands.map((h, i) => i === p ? newHand : h)

  // Check if player or other AI wants to claim
  for (const cp of ALL_PLAYERS) {
    if (cp === p) continue
    const cpStrat = cp === PLAYER ? null : state.aiStrategies[cp - 1]
    const wantsClaim = cp === PLAYER
      ? false // Player decides manually
      : aiWantsClaim(discardTile, newHands[cp], cpStrat)

    if (wantsClaim) {
      const claimHand = sortHand([...newHands[cp], discardTile])
      if (checkWin(claimHand)) {
        const scores = [...s.scores]
        scores[cp] += 16
        return {
          ...s,
          hands: newHands.map((h, i) => i === cp ? claimHand : h),
          discards: newDiscards,
          lastDiscard: discardTile,
          lastDiscardPlayer: p,
          phase: 'finished',
          winner: cp,
          scores,
          log: [...s.log, `${PLAYER_NAMES[p]} discarded. ${PLAYER_NAMES[cp]} claims and wins! (Ron)`],
        }
      }
    }
  }

  const next = (p % 3) + 1 === 4 ? 0 : (p % 3) + 1
  return {
    ...s,
    hands: newHands,
    discards: newDiscards,
    lastDiscard: discardTile,
    lastDiscardPlayer: p,
    drawnTile: null,
    phase: 'draw',
    currentPlayer: next,
    log: [...s.log, `${PLAYER_NAMES[p]} (${stratObj.emoji} ${stratObj.name}) discarded.`],
  }
}

export function playerClaimDiscard(state) {
  if (!state.lastDiscard || state.currentPlayer !== PLAYER) return state
  const tile = state.lastDiscard
  const newHand = sortHand([...state.hands[PLAYER], tile])
  if (checkWin(newHand)) {
    const scores = [...state.scores]
    scores[PLAYER] += 16
    return {
      ...state,
      hands: state.hands.map((h,i) => i===PLAYER ? newHand : h),
      phase: 'finished',
      winner: PLAYER,
      scores,
      log: [...state.log, `🏆 You claimed the discard and won! (Ron)`],
    }
  }
  // Can't win with claim — just take it and discard
  const newHands = state.hands.map((h,i) => i===PLAYER ? newHand : h)
  return {
    ...state,
    hands: newHands,
    phase: 'discard',
    currentPlayer: PLAYER,
    log: [...state.log, `You claimed the discarded tile.`],
  }
}
