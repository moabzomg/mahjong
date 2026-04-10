// ─────────────────────────────────────────────────────────────────────────────
// MAHJONG AI STRATEGIES — 12 distinct strategies with named theory models
// ─────────────────────────────────────────────────────────────────────────────
import {
  tileKey, sortHand, checkWin, getTenpaiTiles, calcShanten,
  isSevenPairs, canFormMelds, SUITS, WIND_ZH, DRAGON_ZH
} from '../game/tiles.js'

// ─── Win-type detection ───────────────────────────────────────────────────────
export function detectWinType(hand14) {
  if (!checkWin(hand14)) return null
  if (isSevenPairs(hand14)) return '七對子'
  const nj = hand14.filter(t => !SUITS.includes(t.suit))
  const counts = {}
  for (const t of hand14) { const k = tileKey(t); counts[k] = (counts[k]||0)+1 }
  const vals = Object.values(counts)
  // 對對糊: all melds are triplets
  if (vals.every(v => v >= 2) && isAllTriplets(hand14)) return '對對糊'
  // 雞糊: most basic hand, only sequences + pair
  const hasHonour = hand14.some(t => t.suit==='winds'||t.suit==='dragons')
  if (!hasHonour) return '平糊'
  return '字牌糊'
}

function isAllTriplets(hand14) {
  const counts = {}
  for (const t of hand14) { const k = tileKey(t); counts[k] = (counts[k]||0)+1 }
  const pairs = Object.values(counts).filter(v=>v>=2)
  const trips = Object.values(counts).filter(v=>v>=3)
  return trips.length >= 4 && pairs.length >= 1
}

// Count triplet potential in hand
function tripletScore(hand) {
  const counts = {}
  for (const t of hand) { const k = tileKey(t); counts[k] = (counts[k]||0)+1 }
  return Object.values(counts).filter(v=>v>=2).length * 2 + Object.values(counts).filter(v=>v>=3).length * 5
}

// Count pair potential for 七對子
function pairScore(hand) {
  const counts = {}
  for (const t of hand) { const k = tileKey(t); counts[k] = (counts[k]||0)+1 }
  return Object.values(counts).filter(v=>v>=2).length
}

// Count honour tiles
function honourScore(hand) {
  return hand.filter(t => t.suit==='winds'||t.suit==='dragons').length
}

// Safety score of discarding a tile (higher = safer)
function safetyScore(tile, allDiscards) {
  const discarded = {}
  for (const pile of allDiscards) for (const t of pile) { const k = tileKey(t); discarded[k] = (discarded[k]||0)+1 }
  const gone = discarded[tileKey(tile)] || 0
  const isHonour = tile.suit==='winds'||tile.suit==='dragons'
  const isTerminal = SUITS.includes(tile.suit) && (tile.value===1||tile.value===9)
  let score = gone * 3 // more discarded = safer
  if (isHonour) score += 4
  if (isTerminal) score += 2
  return score
}

// Shanten after removing a tile
function shantenAfterDiscard(hand, tileId) {
  return calcShanten(hand.filter(t => t.id !== tileId))
}

// ─────────────────────────────────────────────────────────────────────────────
// THE 12 STRATEGIES
// ─────────────────────────────────────────────────────────────────────────────

export const AI_STRATEGIES = {

  // 1. Nash Equilibrium — balanced minimax approach
  nash: {
    name: '均衡論',
    fullName: 'Nash Equilibrium',
    emoji: '⚖️',
    color: '#0984e3',
    theory: 'Game Theory',
    desc: '最小化對手優勢，維持攻守平衡。不冒險出危險牌，同時保持聽牌效率。',
    params: { aggression:0.5, pairBias:0.3, sevenPairsBias:0.25, tripletBias:0.3, honourBias:0.3, safetyWeight:0.5, bigHandBias:0.2 },
    discard: (hand, discards, params) => balancedDiscard(hand, discards, params),
    wantRon: (tile, hand) => checkWin(sortHand([...hand, tile])),
  },

  // 2. Aggressive attacker — minimize shanten, maximize speed
  dragon: {
    name: '龍爪進攻',
    fullName: 'Dragon Claw Aggressor',
    emoji: '🐉',
    color: '#d63031',
    theory: 'Greedy Algorithm',
    desc: '全力進攻，最快速達到聽牌。優先打散張，不顧安全，以速度取勝。',
    params: { aggression:0.9, pairBias:0.1, sevenPairsBias:0.1, tripletBias:0.2, honourBias:0.1, safetyWeight:0.1, bigHandBias:0.1 },
    discard: (hand, discards, params) => aggressiveDiscard(hand, discards, params),
    wantRon: (tile, hand) => checkWin(sortHand([...hand, tile])),
  },

  // 3. Ultra-defensive — safe tiles only, wait for opponent mistakes
  tortoise: {
    name: '鐵甲防守',
    fullName: 'Iron Tortoise Defensive',
    emoji: '🐢',
    color: '#00b894',
    theory: 'Minimax Safety',
    desc: '極度防守，只打最安全牌。寧願拖慢速度，也要避免出炮。',
    params: { aggression:0.1, pairBias:0.3, sevenPairsBias:0.2, tripletBias:0.3, honourBias:0.6, safetyWeight:0.9, bigHandBias:0.1 },
    discard: (hand, discards, params) => defensiveDiscard(hand, discards, params),
    wantRon: (tile, hand) => checkWin(sortHand([...hand, tile])),
  },

  // 4. 對對糊 specialist — aim for all-triplets hand
  tripletHunter: {
    name: '對對糊專家',
    fullName: 'Triplet Hunter (對對糊)',
    emoji: '🎯',
    color: '#e17055',
    theory: 'Pattern Specialisation',
    desc: '專攻對對糊。優先保留對子和刻子，寧願叫慢不做順子。',
    params: { aggression:0.5, pairBias:0.8, sevenPairsBias:0.2, tripletBias:0.9, honourBias:0.5, safetyWeight:0.4, bigHandBias:0.5 },
    discard: (hand, discards, params) => tripletDiscard(hand, discards, params),
    wantRon: (tile, hand) => checkWin(sortHand([...hand, tile])),
  },

  // 5. 七對子 specialist
  sevenPairs: {
    name: '七對子獵手',
    fullName: 'Seven Pairs Specialist',
    emoji: '🎭',
    color: '#6c5ce7',
    theory: 'Specialised Pattern Pursuit',
    desc: '專門追求七對子。收集對子，避免做順子。',
    params: { aggression:0.4, pairBias:0.95, sevenPairsBias:0.95, tripletBias:0.1, honourBias:0.5, safetyWeight:0.3, bigHandBias:0.3 },
    discard: (hand, discards, params) => sevenPairsDiscard(hand, discards, params),
    wantRon: (tile, hand) => checkWin(sortHand([...hand, tile])),
  },

  // 6. 字牌 specialist — honours and winds
  honourMaster: {
    name: '字牌大師',
    fullName: 'Honour Tile Master',
    emoji: '🀄',
    color: '#fdcb6e',
    theory: 'Honour Tile Strategy',
    desc: '專打字牌路線。保留中發白和風牌做刻子，字牌刻子加番。',
    params: { aggression:0.5, pairBias:0.5, sevenPairsBias:0.1, tripletBias:0.6, honourBias:0.95, safetyWeight:0.4, bigHandBias:0.6 },
    discard: (hand, discards, params) => honourDiscard(hand, discards, params),
    wantRon: (tile, hand) => checkWin(sortHand([...hand, tile])),
  },

  // 7. Monte Carlo — random sampling to estimate best discard
  monteCarlo: {
    name: '蒙地卡羅',
    fullName: 'Monte Carlo Sampler',
    emoji: '🎲',
    color: '#a29bfe',
    theory: 'Monte Carlo Simulation',
    desc: '用隨機模擬估算最佳出牌。每張牌模擬100次，選期望值最高的打法。',
    params: { aggression:0.5, pairBias:0.4, sevenPairsBias:0.3, tripletBias:0.4, honourBias:0.3, safetyWeight:0.5, bigHandBias:0.3 },
    discard: (hand, discards, params) => monteCarloDiscard(hand, discards, params),
    wantRon: (tile, hand) => checkWin(sortHand([...hand, tile])),
  },

  // 8. Opportunist — adapts to what appears in discards
  opportunist: {
    name: '機會主義者',
    fullName: 'Opportunist Adapter',
    emoji: '🦊',
    color: '#fd79a8',
    theory: 'Adaptive Bayesian',
    desc: '觀察對手棄牌，動態調整策略。牆剩多時激進，剩少時保守。',
    params: { aggression:0.6, pairBias:0.4, sevenPairsBias:0.3, tripletBias:0.4, honourBias:0.3, safetyWeight:0.5, bigHandBias:0.25 },
    discard: (hand, discards, params) => opportunistDiscard(hand, discards, params),
    wantRon: (tile, hand) => checkWin(sortHand([...hand, tile])),
  },

  // 9. Big Hand Hunter — holds for high value, never settles for 雞糊
  bigHand: {
    name: '大手追求者',
    fullName: 'Big Hand Hunter',
    emoji: '👑',
    color: '#e84393',
    theory: 'Expected Value Maximisation',
    desc: '追求大番種，拒絕做雞糊。寧願多摸幾張，也要等大手。',
    params: { aggression:0.3, pairBias:0.5, sevenPairsBias:0.4, tripletBias:0.6, honourBias:0.7, safetyWeight:0.3, bigHandBias:0.95 },
    discard: (hand, discards, params) => bigHandDiscard(hand, discards, params),
    wantRon: (tile, hand) => {
      const test = sortHand([...hand, tile])
      if (!checkWin(test)) return false
      const wt = detectWinType(test)
      return wt !== '雞糊' && wt !== '平糊'
    },
  },

  // 10. Safe Runner — prioritises winning over quality
  safeRunner: {
    name: '穩打穩紮',
    fullName: 'Safe Runner',
    emoji: '🏃',
    color: '#55efc4',
    theory: 'Risk-Averse Strategy',
    desc: '任何牌型都接受，最快速達成胡牌。平糊也好，有得贏就算。',
    params: { aggression:0.7, pairBias:0.3, sevenPairsBias:0.2, tripletBias:0.3, honourBias:0.2, safetyWeight:0.35, bigHandBias:0.05 },
    discard: (hand, discards, params) => aggressiveDiscard(hand, discards, params),
    wantRon: (tile, hand) => checkWin(sortHand([...hand, tile])),
  },

  // 11. Information Theorist — maximum entropy discard selection
  entropy: {
    name: '資訊熵策略',
    fullName: 'Information Entropy',
    emoji: '🧠',
    color: '#00cec9',
    theory: 'Information Theory',
    desc: '最大化資訊熵，保留最多可能性。每次棄牌都使聽牌空間最大化。',
    params: { aggression:0.5, pairBias:0.5, sevenPairsBias:0.4, tripletBias:0.4, honourBias:0.3, safetyWeight:0.4, bigHandBias:0.2 },
    discard: (hand, discards, params) => entropyDiscard(hand, discards, params),
    wantRon: (tile, hand) => checkWin(sortHand([...hand, tile])),
  },

  // 12. Chaos Monkey — mixed random, unpredictable
  chaos: {
    name: '混沌理論',
    fullName: 'Chaos Theory Random',
    emoji: '🐒',
    color: '#b2bec3',
    theory: 'Stochastic Random',
    desc: '完全隨機棄牌，令對手無從判斷。偶爾做出意想不到的大手。',
    params: { aggression:0.5, pairBias:0.5, sevenPairsBias:0.5, tripletBias:0.5, honourBias:0.5, safetyWeight:0.5, bigHandBias:0.5 },
    discard: (hand, discards, params) => chaosDiscard(hand, discards, params),
    wantRon: (tile, hand) => checkWin(sortHand([...hand, tile])),
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// DISCARD IMPLEMENTATIONS
// ─────────────────────────────────────────────────────────────────────────────

function balancedDiscard(hand, discards, p) {
  return scoredDiscard(hand, discards, (tile, remaining) => {
    const sh = calcShanten(remaining)
    const safety = safetyScore(tile, discards)
    return -sh * 10 + safety * p.safetyWeight * 5
  })
}

function aggressiveDiscard(hand, discards, p) {
  return scoredDiscard(hand, discards, (tile, remaining) => {
    const sh = calcShanten(remaining)
    const isHonour = tile.suit==='winds'||tile.suit==='dragons'
    return -sh * 20 + (isHonour ? 3 : 0)
  })
}

function defensiveDiscard(hand, discards, p) {
  return scoredDiscard(hand, discards, (tile, remaining) => {
    const sh = calcShanten(remaining)
    const safety = safetyScore(tile, discards)
    const isHonour = tile.suit==='winds'||tile.suit==='dragons'
    const isTerminal = SUITS.includes(tile.suit)&&(tile.value===1||tile.value===9)
    return -sh * 8 + safety * 8 + (isHonour?6:0) + (isTerminal?3:0)
  })
}

function tripletDiscard(hand, discards, p) {
  return scoredDiscard(hand, discards, (tile, remaining) => {
    const sh = calcShanten(remaining)
    const counts = {}
    for (const t of remaining) { const k=tileKey(t);counts[k]=(counts[k]||0)+1 }
    const pairs = Object.values(counts).filter(v=>v>=2).length
    const trips = Object.values(counts).filter(v=>v>=3).length
    const isSeq = SUITS.includes(tile.suit) // prefer discarding sequence tiles
    return -sh * 10 + pairs * 4 + trips * 8 + (isSeq&&counts[tileKey(tile)]<=1 ? 3:0)
  })
}

function sevenPairsDiscard(hand, discards, p) {
  return scoredDiscard(hand, discards, (tile, remaining) => {
    const counts={}; for(const t of remaining){const k=tileKey(t);counts[k]=(counts[k]||0)+1}
    const pairs = Object.values(counts).filter(v=>v>=2).length
    const orphan = (counts[tileKey(tile)]||0) === 0 // tile not elsewhere in remaining
    const sp_sh = 6 - pairs
    return -sp_sh * 12 + (orphan?5:0)
  })
}

function honourDiscard(hand, discards, p) {
  return scoredDiscard(hand, discards, (tile, remaining) => {
    const sh = calcShanten(remaining)
    const counts={}; for(const t of remaining){const k=tileKey(t);counts[k]=(counts[k]||0)+1}
    const isHonour = tile.suit==='winds'||tile.suit==='dragons'
    const honourCount = remaining.filter(t=>t.suit==='winds'||t.suit==='dragons').length
    const isSimple = SUITS.includes(tile.suit)&&tile.value>=2&&tile.value<=8
    return -sh * 10 + honourCount * 3 + (isSimple&&(counts[tileKey(tile)]||0)<=1?4:0) - (isHonour&&(counts[tileKey(tile)]||0)>=1?-3:0)
  })
}

function monteCarloDiscard(hand, discards, p) {
  const SAMPLES = 30
  let bestTile = hand[0], bestScore = -Infinity
  for (const tile of hand) {
    const remaining = hand.filter(t=>t.id!==tile.id)
    let totalScore = 0
    for (let s = 0; s < SAMPLES; s++) {
      const sh = calcShanten(remaining)
      totalScore += -sh + Math.random() * 0.5
    }
    if (totalScore > bestScore) { bestScore=totalScore; bestTile=tile }
  }
  return bestTile
}

function opportunistDiscard(hand, discards, p) {
  const totalDiscarded = discards.flat().length
  const urgency = totalDiscarded > 40 ? 0.8 : 0.4
  return scoredDiscard(hand, discards, (tile, remaining) => {
    const sh = calcShanten(remaining)
    const safety = safetyScore(tile, discards)
    return -sh * 10 * (1+urgency) + safety * (1-urgency) * 5
  })
}

function bigHandDiscard(hand, discards, p) {
  return scoredDiscard(hand, discards, (tile, remaining) => {
    const sh = calcShanten(remaining)
    const counts={}; for(const t of remaining){const k=tileKey(t);counts[k]=(counts[k]||0)+1}
    const trips = Object.values(counts).filter(v=>v>=3).length
    const pairs = Object.values(counts).filter(v=>v>=2).length
    const isHonour = tile.suit==='winds'||tile.suit==='dragons'
    const honourTrips = remaining.filter(t=>(t.suit==='winds'||t.suit==='dragons')&&(counts[tileKey(t)]||0)>=2).length
    return -sh * 10 + trips * 6 + pairs * 3 + honourTrips * 5
  })
}

function entropyDiscard(hand, discards, p) {
  return scoredDiscard(hand, discards, (tile, remaining) => {
    // Maximize number of different tenpai tiles available after discard
    const tenpai = getTenpaiTiles(remaining)
    const sh = calcShanten(remaining)
    return -sh * 8 + tenpai.length * 2
  })
}

function chaosDiscard(hand, discards, p) {
  // 70% chance of smart move, 30% fully random
  if (Math.random() < 0.3) return hand[Math.floor(Math.random()*hand.length)]
  return aggressiveDiscard(hand, discards, p)
}

// ─── Core scored discard helper ────────────────────────────────────────────
function scoredDiscard(hand, discards, scoreFn) {
  let bestTile = hand[hand.length-1], bestScore = -Infinity
  for (const tile of hand) {
    const remaining = hand.filter(t=>t.id!==tile.id)
    const score = scoreFn(tile, remaining)
    if (score > bestScore) { bestScore=score; bestTile=tile }
  }
  return bestTile
}

// ─── Public API used by game engine ────────────────────────────────────────
export function aiDiscard(strategyKey, hand, allDiscards) {
  const strat = AI_STRATEGIES[strategyKey] || AI_STRATEGIES.nash
  return strat.discard(hand, allDiscards, strat.params)
}

export function aiWantsRon(strategyKey, tile, hand) {
  const strat = AI_STRATEGIES[strategyKey] || AI_STRATEGIES.nash
  return strat.wantRon(tile, hand)
}

export const STRATEGY_KEYS = Object.keys(AI_STRATEGIES)
