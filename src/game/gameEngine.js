import { buildWall, sortHand, checkWin, getTenpaiTiles, tileKey } from './tiles.js'
import { AI_STRATEGIES, aiWantsClaim } from '../ai/strategies.js'

export const PLAYER = 0
export const AI_PLAYERS = [1, 2, 3]
export const ALL_PLAYERS = [0, 1, 2, 3]
export const PLAYER_NAMES = ['You', 'AI East', 'AI South', 'AI West']

// Default English T fallback so engine works without T param
const DEFAULT_T = {
  playerNames: PLAYER_NAMES,
  logStart: 'Game started! Drawing your tile…',
  logYouDrew: 'You drew a tile.',
  logAiDrew: (n) => `${n} drew.`,
  logYouDiscarded: 'You discarded.',
  logAiDiscarded: (n) => `${n} discarded.`,
  logYouWonTsumo: '🏆 You win by self-draw (自摸)!',
  logAiWonTsumo: (n) => `🏆 ${n} wins by self-draw (自摸)!`,
  logYouClaimed: 'You claimed the discard.',
  logYouWonRon: '🏆 You claimed & won! (炮)',
  logAiWonRon: (n) => `${n} claims discard & wins! (炮)`,
  logWallDead: '🎴 Wall exhausted — draw!',
  logAiClaimedDiscard: (n) => `${n} claimed the discard.`,
  strategies: {
    aggressive: { name: 'Aggressive Dragon' },
    defensive:  { name: 'Defensive Turtle' },
    random:     { name: 'Chaotic Monkey' },
    greedy:     { name: 'Greedy Panda' },
  },
}

export function initGame(aiStrategies, T = DEFAULT_T) {
  const wall = buildWall()
  const hands = [[], [], [], []]
  for (let i = 0; i < 13; i++) for (let p = 0; p < 4; p++) hands[p].push(wall.pop())
  return {
    wall,
    hands: hands.map(sortHand),
    discards: [[], [], [], []],
    melds: [[], [], [], []],
    currentPlayer: 0,
    phase: 'draw',
    drawnTile: null,
    lastDiscard: null,
    lastDiscardPlayer: null,
    winner: null,
    scores: [0, 0, 0, 0],
    aiStrategies: aiStrategies || ['aggressive', 'defensive', 'greedy'],
    tenpaiTiles: [],
    log: [T.logStart],
  }
}

export function drawTile(state, T = DEFAULT_T) {
  const pnames = T.playerNames
  if (state.wall.length === 0) {
    return { ...state, phase: 'finished', winner: -1, log: [...state.log, T.logWallDead] }
  }
  const tile = state.wall[state.wall.length - 1]
  const newWall = state.wall.slice(0, -1)
  const newHand = sortHand([...state.hands[state.currentPlayer], tile])
  const newHands = state.hands.map((h, i) => i === state.currentPlayer ? newHand : h)
  const tenpai = state.currentPlayer === PLAYER ? getTenpaiTiles(newHand.slice(0, -1)) : []

  if (checkWin(newHand)) {
    const scores = [...state.scores]
    scores[state.currentPlayer] += 8
    const msg = state.currentPlayer === 0 ? T.logYouWonTsumo : T.logAiWonTsumo(pnames[state.currentPlayer])
    return { ...state, wall: newWall, hands: newHands, drawnTile: tile, phase: 'finished', winner: state.currentPlayer, scores, log: [...state.log, msg] }
  }

  const msg = state.currentPlayer === 0 ? T.logYouDrew : T.logAiDrew(pnames[state.currentPlayer])
  return { ...state, wall: newWall, hands: newHands, drawnTile: tile, phase: 'discard', tenpaiTiles: tenpai, log: [...state.log, msg] }
}

export function playerDiscard(state, tileId, T = DEFAULT_T) {
  const pnames = T.playerNames
  if (state.currentPlayer !== PLAYER || state.phase !== 'discard') return state
  const hand = state.hands[PLAYER]
  const idx = hand.findIndex(t => t.id === tileId)
  if (idx === -1) return state
  const tile = hand[idx]
  const newHand = sortHand(hand.filter(t => t.id !== tileId))
  const newDiscards = state.discards.map((d, i) => i === PLAYER ? [...d, tile] : d)
  const newHands = state.hands.map((h, i) => i === PLAYER ? newHand : h)

  for (const p of AI_PLAYERS) {
    const strat = state.aiStrategies[p - 1]
    if (aiWantsClaim(tile, state.hands[p], strat)) {
      const claimHand = sortHand([...state.hands[p], tile])
      if (checkWin(claimHand)) {
        const scores = [...state.scores]
        scores[p] += 16
        return {
          ...state, hands: newHands.map((h, i) => i === p ? claimHand : h),
          discards: newDiscards, lastDiscard: tile, lastDiscardPlayer: PLAYER,
          phase: 'finished', winner: p, scores,
          log: [...state.log, T.logYouDiscarded, T.logAiWonRon(pnames[p])],
        }
      }
    }
  }

  return {
    ...state, hands: newHands, discards: newDiscards, lastDiscard: tile,
    lastDiscardPlayer: PLAYER, drawnTile: null, phase: 'draw', currentPlayer: 1,
    tenpaiTiles: [], log: [...state.log, T.logYouDiscarded],
  }
}

export function playerClaimDiscard(state, T = DEFAULT_T) {
  if (!state.lastDiscard || state.currentPlayer === PLAYER) return state
  const tile = state.lastDiscard
  const newHand = sortHand([...state.hands[PLAYER], tile])
  if (checkWin(newHand)) {
    const scores = [...state.scores]
    scores[PLAYER] += 16
    return {
      ...state, hands: state.hands.map((h, i) => i === PLAYER ? newHand : h),
      phase: 'finished', winner: PLAYER, scores,
      log: [...state.log, T.logYouWonRon],
    }
  }
  return {
    ...state, hands: state.hands.map((h, i) => i === PLAYER ? newHand : h),
    phase: 'discard', currentPlayer: PLAYER,
    log: [...state.log, T.logYouClaimed],
  }
}

export function aiTurn(state, T = DEFAULT_T) {
  const pnames = T.playerNames
  if (state.phase !== 'draw' || state.currentPlayer === PLAYER) return state
  const p = state.currentPlayer
  const strat = state.aiStrategies[p - 1]
  const stratObj = AI_STRATEGIES[strat]

  let s = drawTile(state, T)
  if (s.phase === 'finished') return s

  const discardTile = stratObj.play(s.hands[p], s)
  const newHand = sortHand(s.hands[p].filter(t => t.id !== discardTile.id))
  const newDiscards = s.discards.map((d, i) => i === p ? [...d, discardTile] : d)
  const newHands = s.hands.map((h, i) => i === p ? newHand : h)

  for (const cp of ALL_PLAYERS) {
    if (cp === p) continue
    const cpStrat = cp === PLAYER ? null : state.aiStrategies[cp - 1]
    const wantsClaim = cp !== PLAYER && aiWantsClaim(discardTile, newHands[cp], cpStrat)
    if (wantsClaim) {
      const claimHand = sortHand([...newHands[cp], discardTile])
      if (checkWin(claimHand)) {
        const scores = [...s.scores]
        scores[cp] += 16
        return {
          ...s, hands: newHands.map((h, i) => i === cp ? claimHand : h),
          discards: newDiscards, lastDiscard: discardTile, lastDiscardPlayer: p,
          phase: 'finished', winner: cp, scores,
          log: [...s.log, T.logAiDiscarded(pnames[p]), T.logAiWonRon(pnames[cp])],
        }
      }
    }
  }

  const next = p === 3 ? 0 : p + 1
  const stratName = T.strategies?.[strat]?.name || stratObj.name
  return {
    ...s, hands: newHands, discards: newDiscards, lastDiscard: discardTile,
    lastDiscardPlayer: p, drawnTile: null, phase: 'draw', currentPlayer: next,
    log: [...s.log, `${pnames[p]}（${stratObj.emoji} ${stratName}）${T.logAiDiscarded(pnames[p]).replace(pnames[p], '').trim()}`],
  }
}
