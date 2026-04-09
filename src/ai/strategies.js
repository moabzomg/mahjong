import { tileKey, sortHand, SUITS, countGroupings } from '../game/tiles.js'

export const AI_STRATEGIES = {
  aggressive: {
    name: 'Aggressive Dragon',
    description: 'Speed runs for fast wins, discards isolated tiles quickly',
    emoji: '🐉',
    color: '#e74c3c',
    play: aggressivePlay,
  },
  defensive: {
    name: 'Defensive Turtle',
    description: 'Plays safe, avoids risky discards, prefers pairs and honors',
    emoji: '🐢',
    color: '#27ae60',
    play: defensivePlay,
  },
  random: {
    name: 'Chaotic Monkey',
    description: 'Completely random — utterly unpredictable chaos',
    emoji: '🐒',
    color: '#e67e22',
    play: randomPlay,
  },
  greedy: {
    name: 'Greedy Panda',
    description: 'Evaluates every discard option, maximises hand potential',
    emoji: '🐼',
    color: '#8e44ad',
    play: greedyPlay,
  },
}

function tileGroupScore(tile, others) {
  let score = 0
  for (const o of others) {
    if (o.suit === tile.suit) {
      const d = Math.abs(o.value - tile.value)
      if (d === 0) score += 3
      else if (d === 1) score += 2
      else if (d === 2) score += 1
    }
  }
  return score
}

function handPotential(hand) {
  const { complete, partial } = countGroupings(hand)
  return complete * 10 + partial * 3
}

function aggressivePlay(hand) {
  const sorted = sortHand(hand)
  const scores = sorted.map(t => ({ t, s: tileGroupScore(t, hand.filter(x=>x.id!==t.id)) }))
  scores.sort((a,b)=>a.s-b.s)
  return scores[0].t
}

function defensivePlay(hand) {
  const sorted = sortHand(hand)
  // First discard lone honors
  const honors = sorted.filter(t => t.suit==='winds'||t.suit==='dragons')
  const honorGroups = {}
  for (const t of honors) {
    const k = tileKey(t)
    honorGroups[k] = (honorGroups[k]||0)+1
  }
  const loneHonors = honors.filter(t => honorGroups[tileKey(t)]===1)
  if (loneHonors.length) return loneHonors[0]
  // Then discard terminal tiles (1 or 9) not in sequences
  const terms = sorted.filter(t => SUITS.includes(t.suit) && (t.value===1||t.value===9))
  for (const t of terms) {
    const others = hand.filter(x=>x.id!==t.id)
    if (tileGroupScore(t, others) === 0) return t
  }
  // Fallback: lowest score tile
  const scores = sorted.map(t => ({ t, s: tileGroupScore(t, hand.filter(x=>x.id!==t.id)) }))
  scores.sort((a,b)=>a.s-b.s)
  return scores[0].t
}

function randomPlay(hand) {
  return hand[Math.floor(Math.random()*hand.length)]
}

function greedyPlay(hand) {
  let best = -Infinity, bestTile = hand[0]
  for (const t of hand) {
    const remaining = hand.filter(x=>x.id!==t.id)
    const score = handPotential(remaining)
    if (score > best) { best = score; bestTile = t }
  }
  return bestTile
}

export function aiWantsClaim(tile, hand, strategy) {
  const matching = hand.filter(t=>tileKey(t)===tileKey(tile))
  if (matching.length >= 2) {
    const prob = { aggressive:0.85, defensive:0.65, random:0.5, greedy:0.75 }
    return Math.random() < (prob[strategy]||0.5)
  }
  if (SUITS.includes(tile.suit)) {
    const has = (v) => hand.some(t=>t.suit===tile.suit && t.value===v)
    const v = tile.value
    const seq = (has(v-1)&&has(v-2)) || (has(v-1)&&has(v+1)) || (has(v+1)&&has(v+2))
    if (seq) {
      const prob = { aggressive:0.7, defensive:0.3, random:0.5, greedy:0.6 }
      return Math.random() < (prob[strategy]||0.4)
    }
  }
  return false
}
