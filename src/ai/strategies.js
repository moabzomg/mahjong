import { tileKey, sortHand, checkWin, getTenpaiTiles, calcShanten, SUITS, WIND_ZH, DRAGON_ZH, calcFan } from '../game/tiles.js'

// ─── Win type detection (full HK fan) ────────────────────────────────────────
export function detectWinType(hand14, melds = [], isTsumo = false) {
  if (!checkWin(hand14, melds)) return null
  const { fan, label } = calcFan(hand14, melds, isTsumo, 0, 0)
  return label[0] || '雞糊'
}

// ─── Safety scoring ───────────────────────────────────────────────────────────
function safetyScore(tile, allDiscards) {
  const gone = {}
  for (const pile of allDiscards) for (const t of pile) { const k = tileKey(t); gone[k] = (gone[k] || 0) + 1 }
  const g = gone[tileKey(tile)] || 0
  const isHonour = tile.suit === 'winds' || tile.suit === 'dragons'
  const isTerminal = SUITS.includes(tile.suit) && (tile.value === 1 || tile.value === 9)
  return g * 3 + (isHonour ? 5 : 0) + (isTerminal ? 2 : 0)
}

function scoredDiscard(hand, discards, melds, scoreFn) {
  let best = hand[hand.length - 1], bestScore = -Infinity
  for (const tile of hand) {
    const rem = hand.filter(t => t.id !== tile.id)
    const score = scoreFn(tile, rem)
    if (score > bestScore) { bestScore = score; best = tile }
  }
  return best
}

// ─── 12 Strategies ────────────────────────────────────────────────────────────
export const AI_STRATEGIES = {
  nash: {
    name: '均衡論', fullName: 'Nash Equilibrium', emoji: '⚖️', color: '#0984e3', theory: 'Game Theory',
    desc: '最小化對手優勢，維持攻守平衡。不冒險出危險牌，同時保持聽牌效率。',
    discard: (h, d, m) => scoredDiscard(h, d, m, (t, r) => -calcShanten(r, m) * 10 + safetyScore(t, d) * 4),
    wantRon: (tile, hand, melds) => {
      const test = sortHand([...hand, tile])
      if (!checkWin(test, melds)) return false
      const { fan } = calcFan(test, melds, false, 0, 0)
      return fan >= 3
    },
  },
  dragon: {
    name: '龍爪進攻', fullName: 'Dragon Claw Aggressor', emoji: '🐉', color: '#d63031', theory: 'Greedy Algorithm',
    desc: '全力進攻，最快達到聽牌。優先打散張，不顧安全，以速度取勝。',
    discard: (h, d, m) => scoredDiscard(h, d, m, (t, r) => -calcShanten(r, m) * 20 + ((t.suit==='winds'||t.suit==='dragons')?3:0)),
    wantRon: (tile, hand, melds) => { const test = sortHand([...hand,tile]); const {fan}=calcFan(test,melds,false,0,0); return checkWin(test,melds)&&fan>=3 },
  },
  tortoise: {
    name: '鐵甲防守', fullName: 'Iron Tortoise', emoji: '🐢', color: '#00b894', theory: 'Minimax Safety',
    desc: '極度防守，只打最安全牌。寧願拖慢速度，也要避免出炮。',
    discard: (h, d, m) => scoredDiscard(h, d, m, (t, r) => -calcShanten(r,m)*5 + safetyScore(t,d)*12),
    wantRon: (tile, hand, melds) => { const test = sortHand([...hand,tile]); const {fan}=calcFan(test,melds,false,0,0); return checkWin(test,melds)&&fan>=5 },
  },
  tripletHunter: {
    name: '對對糊專家', fullName: 'Triplet Hunter (對對糊)', emoji: '🎯', color: '#e17055', theory: 'Pattern Specialisation',
    desc: '專攻對對糊。優先保留對子和刻子，寧願叫慢不做順子。',
    discard: (h, d, m) => {
      const counts={}; for(const t of h){const k=tileKey(t);counts[k]=(counts[k]||0)+1}
      return scoredDiscard(h,d,m,(t,r)=>{
        const rc={}; for(const x of r){const k=tileKey(x);rc[k]=(rc[k]||0)+1}
        const pairs=Object.values(rc).filter(v=>v>=2).length
        const trips=Object.values(rc).filter(v=>v>=3).length
        return -calcShanten(r,m)*8 + pairs*5 + trips*10
      })
    },
    wantRon: (tile, hand, melds) => { const test=sortHand([...hand,tile]); const {fan,label}=calcFan(test,melds,false,0,0); return checkWin(test,melds)&&fan>=3&&(label[0]==='對對糊'||fan>=5) },
  },
  sevenPairs: {
    name: '七對子獵手', fullName: 'Seven Pairs Specialist', emoji: '🎭', color: '#6c5ce7', theory: 'Pattern Pursuit',
    desc: '專門追求七對子。收集對子，避免做順子。',
    discard: (h, d, m) => {
      if (m.length > 0) return scoredDiscard(h,d,m,(t,r)=>-calcShanten(r,m)*10)
      const counts={}; for(const t of h){const k=tileKey(t);counts[k]=(counts[k]||0)+1}
      return scoredDiscard(h,d,m,(t,r)=>{
        const rc={}; for(const x of r){const k=tileKey(x);rc[k]=(rc[k]||0)+1}
        const pairs=Object.values(rc).filter(v=>v>=2).length
        const orphan=(rc[tileKey(t)]||0)===0
        return -(6-pairs)*12 + (orphan?5:0)
      })
    },
    wantRon: (tile, hand, melds) => { const test=sortHand([...hand,tile]); const {fan}=calcFan(test,melds,false,0,0); return checkWin(test,melds)&&fan>=3 },
  },
  honourMaster: {
    name: '字牌大師', fullName: 'Honour Tile Master', emoji: '🀄', color: '#fdcb6e', theory: 'Honour Strategy',
    desc: '專打字牌路線。保留中發白和風牌做刻子，字牌刻子加番。',
    discard: (h, d, m) => {
      const counts={}; for(const t of h){const k=tileKey(t);counts[k]=(counts[k]||0)+1}
      return scoredDiscard(h,d,m,(t,r)=>{
        const isHonour=t.suit==='winds'||t.suit==='dragons'
        const hc=(counts[tileKey(t)]||0)
        const simple=SUITS.includes(t.suit)&&t.value>=2&&t.value<=8
        return -calcShanten(r,m)*10 + (simple&&hc<=1?5:0) + (isHonour&&hc>=2?-8:isHonour&&hc===1?3:0)
      })
    },
    wantRon: (tile, hand, melds) => { const test=sortHand([...hand,tile]); const {fan}=calcFan(test,melds,false,0,0); return checkWin(test,melds)&&fan>=3 },
  },
  monteCarlo: {
    name: '蒙地卡羅', fullName: 'Monte Carlo Sampler', emoji: '🎲', color: '#a29bfe', theory: 'Monte Carlo',
    desc: '用隨機模擬估算最佳出牌。每張牌模擬多次，選期望值最高的打法。',
    discard: (h, d, m) => {
      let best=h[0], bestS=-Infinity
      for(const t of h){const r=h.filter(x=>x.id!==t.id);const sh=calcShanten(r,m);const score=-sh*10+Math.random()*3;if(score>bestS){bestS=score;best=t}}
      return best
    },
    wantRon: (tile, hand, melds) => { const test=sortHand([...hand,tile]); const {fan}=calcFan(test,melds,false,0,0); return checkWin(test,melds)&&fan>=3 },
  },
  opportunist: {
    name: '機會主義者', fullName: 'Opportunist Adapter', emoji: '🦊', color: '#fd79a8', theory: 'Adaptive Bayesian',
    desc: '觀察對手棄牌，動態調整策略。牆剩多時激進，剩少時保守。',
    discard: (h, d, m) => {
      const totalGone=d.flat().length
      const urgency=totalGone>40?0.8:0.3
      return scoredDiscard(h,d,m,(t,r)=>-calcShanten(r,m)*10*(1+urgency)+safetyScore(t,d)*(1-urgency)*5)
    },
    wantRon: (tile, hand, melds) => { const test=sortHand([...hand,tile]); const {fan}=calcFan(test,melds,false,0,0); return checkWin(test,melds)&&fan>=3 },
  },
  bigHand: {
    name: '大手追求者', fullName: 'Big Hand Hunter', emoji: '👑', color: '#e84393', theory: 'EV Maximisation',
    desc: '追求大番種，拒絕雞糊。寧願多摸幾張，也要等大手（清一色/對對糊等）。',
    discard: (h, d, m) => {
      const counts={}; for(const t of h){const k=tileKey(t);counts[k]=(counts[k]||0)+1}
      return scoredDiscard(h,d,m,(t,r)=>{
        const rc={}; for(const x of r){const k=tileKey(x);rc[k]=(rc[k]||0)+1}
        const trips=Object.values(rc).filter(v=>v>=3).length
        const htrip=r.filter(x=>(x.suit==='winds'||x.suit==='dragons')&&(rc[tileKey(x)]||0)>=2).length
        return -calcShanten(r,m)*10+trips*7+htrip*6
      })
    },
    wantRon: (tile, hand, melds) => {
      const test=sortHand([...hand,tile])
      if(!checkWin(test,melds)) return false
      const {fan,label}=calcFan(test,melds,false,0,0)
      return fan>=5
    },
  },
  safeRunner: {
    name: '穩打穩紮', fullName: 'Safe Runner', emoji: '🏃', color: '#55efc4', theory: 'Risk-Averse',
    desc: '任何牌型都接受，最快速達成糊牌。平糊也好，有得贏就算。',
    discard: (h, d, m) => scoredDiscard(h,d,m,(t,r)=>-calcShanten(r,m)*18+(t.suit==='winds'||t.suit==='dragons'?2:0)),
    wantRon: (tile, hand, melds) => { const test=sortHand([...hand,tile]); const {fan}=calcFan(test,melds,false,0,0); return checkWin(test,melds)&&fan>=3 },
  },
  entropy: {
    name: '資訊熵策略', fullName: 'Information Entropy', emoji: '🧠', color: '#00cec9', theory: 'Information Theory',
    desc: '最大化資訊熵，保留最多可能性。每次棄牌都使聽牌空間最大化。',
    discard: (h, d, m) => scoredDiscard(h,d,m,(t,r)=>{const tp=getTenpaiTiles(r,m);return -calcShanten(r,m)*8+tp.length*2}),
    wantRon: (tile, hand, melds) => { const test=sortHand([...hand,tile]); const {fan}=calcFan(test,melds,false,0,0); return checkWin(test,melds)&&fan>=3 },
  },
  chaos: {
    name: '混沌理論', fullName: 'Chaos Theory Random', emoji: '🐒', color: '#b2bec3', theory: 'Stochastic',
    desc: '完全隨機棄牌，令對手無從判斷。偶爾做出意想不到的大手。',
    discard: (h, d, m) => Math.random()<0.3?h[Math.floor(Math.random()*h.length)]:scoredDiscard(h,d,m,(t,r)=>-calcShanten(r,m)*10),
    wantRon: (tile, hand, melds) => { const test=sortHand([...hand,tile]); const {fan}=calcFan(test,melds,false,0,0); return checkWin(test,melds)&&fan>=3 },
  },
}

export function aiDiscard(stratKey, hand, allDiscards, melds = []) {
  const s = AI_STRATEGIES[stratKey] || AI_STRATEGIES.nash
  return s.discard(hand.filter(t=>!t.isFlower), allDiscards, melds)
}

export function aiWantsRon(stratKey, tile, hand, melds = []) {
  const s = AI_STRATEGIES[stratKey] || AI_STRATEGIES.nash
  return s.wantRon(tile, hand, melds)
}

export const STRATEGY_KEYS = Object.keys(AI_STRATEGIES)
