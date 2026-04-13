// ─── Hong Kong Mahjong — Full Tile Set ───────────────────────────────────────
export const SUITS = ['bamboo', 'characters', 'circles']
export const WIND_ZH = ['東','南','西','北']
export const DRAGON_ZH = ['中','發','白']
export const FLOWER_ZH = ['春','夏','秋','冬','梅','蘭','菊','竹']

let _tileId = 0

export function buildWall() {
  _tileId = 0
  const tiles = []
  // 3 suits × 9 values × 4 copies = 108
  for (const suit of SUITS)
    for (let v = 1; v <= 9; v++)
      for (let c = 0; c < 4; c++)
        tiles.push({ id: _tileId++, suit, value: v, isFlower: false })
  // 4 winds × 4 copies = 16
  for (let v = 0; v < 4; v++)
    for (let c = 0; c < 4; c++)
      tiles.push({ id: _tileId++, suit: 'winds', value: v, isFlower: false })
  // 3 dragons × 4 copies = 12
  for (let v = 0; v < 3; v++)
    for (let c = 0; c < 4; c++)
      tiles.push({ id: _tileId++, suit: 'dragons', value: v, isFlower: false })
  // 8 flower tiles
  for (let v = 0; v < 8; v++)
    tiles.push({ id: _tileId++, suit: 'flowers', value: v, isFlower: true })
  return shuffle(tiles)
}

export function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function tileKey(t) { return `${t.suit}-${t.value}` }

export function sortHand(hand) {
  const so = { bamboo: 0, characters: 1, circles: 2, winds: 3, dragons: 4, flowers: 5 }
  return [...hand].sort((a, b) => (so[a.suit] - so[b.suit]) || (a.value - b.value))
}

// ─── Meld validation ──────────────────────────────────────────────────────────
export function isTriplet(tiles) {
  if (tiles.length !== 3) return false
  return tileKey(tiles[0]) === tileKey(tiles[1]) && tileKey(tiles[1]) === tileKey(tiles[2])
}

export function isKong(tiles) {
  if (tiles.length !== 4) return false
  return tiles.every(t => tileKey(t) === tileKey(tiles[0]))
}

export function isSequence(tiles) {
  if (tiles.length !== 3) return false
  const nj = tiles.filter(t => SUITS.includes(t.suit))
  if (nj.length !== 3) return false
  if (!nj.every(t => t.suit === nj[0].suit)) return false
  const vs = nj.map(t => t.value).sort((a, b) => a - b)
  return vs[1] === vs[0] + 1 && vs[2] === vs[0] + 2
}

export function isPair(tiles) {
  return tiles.length === 2 && tileKey(tiles[0]) === tileKey(tiles[1])
}

// ─── Win detection with melds context ────────────────────────────────────────
export function checkWin(hand14, melds = []) {
  if (hand14.length + melds.reduce((s, m) => s + m.tiles.length, 0) < 14) return false
  // Special: thirteen orphans
  if (isThirteenOrphans(hand14)) return true
  // Special: seven pairs (only when no declared melds)
  if (melds.length === 0 && isSevenPairs(hand14)) return true
  // Standard: 4 melds + 1 pair
  const keys = [...new Set(hand14.map(tileKey))]
  for (const k of keys) {
    const pairTiles = hand14.filter(t => tileKey(t) === k).slice(0, 2)
    if (pairTiles.length < 2) continue
    const rest = [...hand14]
    for (const p of pairTiles) rest.splice(rest.findIndex(t => t.id === p.id), 1)
    const meldsNeeded = 4 - melds.length
    if (canFormMelds(rest, meldsNeeded)) return true
  }
  return false
}

export function canFormMelds(tiles, n) {
  if (n === 0) return tiles.length === 0
  if (tiles.length === 0) return n === 0
  const sorted = sortHand(tiles)
  const first = sorted[0]
  const rest = sorted.slice(1)
  // triplet
  const same = rest.filter(t => tileKey(t) === tileKey(first))
  if (same.length >= 2) {
    const rem = rest.filter(t => t !== same[0] && t !== same[1])
    if (canFormMelds(rem, n - 1)) return true
  }
  // sequence
  if (SUITS.includes(first.suit)) {
    const s2 = rest.find(t => t.suit === first.suit && t.value === first.value + 1)
    if (s2) {
      const a2 = rest.filter(t => t !== s2)
      const s3 = a2.find(t => t.suit === first.suit && t.value === first.value + 2)
      if (s3) {
        const rem = a2.filter(t => t !== s3)
        if (canFormMelds(rem, n - 1)) return true
      }
    }
  }
  return false
}

export function isSevenPairs(hand) {
  if (hand.length !== 14) return false
  const counts = {}
  for (const t of hand) { const k = tileKey(t); counts[k] = (counts[k] || 0) + 1 }
  const vals = Object.values(counts)
  return vals.length === 7 && vals.every(v => v === 2)
}

export function isThirteenOrphans(hand) {
  if (hand.length !== 14) return false
  const required = [
    'characters-1','characters-9','bamboo-1','bamboo-9','circles-1','circles-9',
    'winds-0','winds-1','winds-2','winds-3','dragons-0','dragons-1','dragons-2'
  ]
  const keys = hand.map(tileKey)
  const counts = {}
  for (const k of keys) counts[k] = (counts[k] || 0) + 1
  return required.every(r => (counts[r] || 0) >= 1) &&
    required.some(r => (counts[r] || 0) >= 2)
}

// ─── Tenpai analysis ──────────────────────────────────────────────────────────
export function getTenpaiTiles(hand13, melds = []) {
  const types = []
  for (const suit of SUITS) for (let v = 1; v <= 9; v++) types.push({ id: 99990, suit, value: v, isFlower: false })
  for (let v = 0; v < 4; v++) types.push({ id: 99991, suit: 'winds', value: v, isFlower: false })
  for (let v = 0; v < 3; v++) types.push({ id: 99992, suit: 'dragons', value: v, isFlower: false })
  return types.filter(tile => checkWin([...hand13, tile], melds))
}

// ─── Shanten ──────────────────────────────────────────────────────────────────
export function calcShanten(hand, melds = []) {
  const h = hand.filter(t => !t.isFlower)
  if (h.length === 0) return 8
  const meldsNeeded = 4 - melds.length
  let best = 8
  // Standard hand shanten
  const keys = [...new Set(h.map(tileKey))]
  for (const k of keys) {
    const pair = h.filter(t => tileKey(t) === k).slice(0, 2)
    if (pair.length < 2) continue
    const rest = h.filter(t => !pair.find(p => p.id === t.id) || (pair.indexOf(t) < 0))
    const restCopy = [...h]
    for (const p of pair) restCopy.splice(restCopy.findIndex(t => t.id === p.id), 1)
    const s = shantenMelds(restCopy, meldsNeeded)
    best = Math.min(best, s)
  }
  best = Math.min(best, shantenMelds(h, meldsNeeded) + 1)
  // Seven pairs
  if (melds.length === 0) {
    const counts = {}; for (const t of h) { const k = tileKey(t); counts[k] = (counts[k] || 0) + 1 }
    const pairs = Object.values(counts).filter(v => v >= 2).length
    best = Math.min(best, 6 - pairs)
  }
  return best
}

function shantenMelds(tiles, n) {
  const counts = {}; for (const t of tiles) { const k = tileKey(t); counts[k] = (counts[k] || 0) + 1 }
  let complete = 0, partial = 0
  for (const [k, c] of Object.entries(counts)) {
    if (c >= 3) { complete++; counts[k] -= 3 }
    else if (c === 2) { partial++; counts[k] = 0 }
  }
  for (const suit of SUITS) {
    for (let v = 1; v <= 7; v++) {
      const k1 = `${suit}-${v}`, k2 = `${suit}-${v + 1}`, k3 = `${suit}-${v + 2}`
      while ((counts[k1] || 0) > 0 && (counts[k2] || 0) > 0 && (counts[k3] || 0) > 0) {
        complete++; counts[k1]--; counts[k2]--; counts[k3]--
      }
    }
    for (let v = 1; v <= 8; v++) {
      const k1 = `${suit}-${v}`, k2 = `${suit}-${v + 1}`
      while ((counts[k1] || 0) > 0 && (counts[k2] || 0) > 0) { partial++; counts[k1]--; counts[k2]-- }
    }
    for (let v = 1; v <= 7; v++) {
      const k1 = `${suit}-${v}`, k2 = `${suit}-${v + 2}`
      while ((counts[k1] || 0) > 0 && (counts[k2] || 0) > 0) { partial++; counts[k1]--; counts[k2]-- }
    }
  }
  const s = n - complete - 1 - Math.min(partial, n - complete - 1 + (tiles.length % 3 === 0 ? 0 : 1))
  return Math.max(0, s)
}

// ─── Fan (番) calculation — Hong Kong rules ───────────────────────────────────
export function calcFan(hand14, melds = [], isTsumo = false, seatWind = 0, roundWind = 0) {
  let fan = 0
  const label = []
  const counts = {}
  for (const t of [...hand14, ...melds.flatMap(m => m.tiles)]) {
    const k = tileKey(t); counts[k] = (counts[k] || 0) + 1
  }
  const allTiles = [...hand14, ...melds.flatMap(m => m.tiles)]

  // Seven pairs (7 pairs)
  if (melds.length === 0 && isSevenPairs(hand14)) {
    label.push('七對子'); fan += 3; return { fan, label }
  }

  // Thirteen orphans
  if (isThirteenOrphans(hand14)) {
    label.push('十三么'); fan += 13; return { fan, label }
  }

  // Check for all-triplets (對對糊) — base 3 fan
  const isAllTrip = checkAllTriplets(allTiles, melds, hand14)
  if (isAllTrip) { label.push('對對糊'); fan += 3 }

  // 清一色 (7 fan) — single suit only
  const nonHonour = allTiles.filter(t => SUITS.includes(t.suit))
  const allSuits = [...new Set(nonHonour.map(t => t.suit))]
  const hasHonour = allTiles.some(t => t.suit === 'winds' || t.suit === 'dragons')
  if (allSuits.length === 1 && !hasHonour) { label.push('清一色'); fan += 7 }
  // 混一色 (3 fan) — one suit + honours
  else if (allSuits.length === 1 && hasHonour) { label.push('混一色'); fan += 3 }

  // 字一色 (10 fan) — all honours
  const allHonour = allTiles.every(t => t.suit === 'winds' || t.suit === 'dragons')
  if (allHonour) { label.push('字一色'); fan += 10 }

  // 么九 (10 fan) — all terminals and honours
  const allTermHonour = allTiles.every(t =>
    t.suit === 'winds' || t.suit === 'dragons' ||
    (SUITS.includes(t.suit) && (t.value === 1 || t.value === 9))
  )
  if (allTermHonour && !allHonour) { label.push('么九'); fan += 10 }

  // 大三元 (8 fan) — 3 dragon triplets
  const dragonTrips = ['dragons-0','dragons-1','dragons-2'].filter(k => (counts[k]||0) >= 3).length
  if (dragonTrips === 3) { label.push('大三元'); fan += 8 }
  // 小三元 (5 fan) — 2 dragon triplets + 1 dragon pair
  else if (dragonTrips === 2 && ['dragons-0','dragons-1','dragons-2'].some(k => (counts[k]||0) === 2))
    { label.push('小三元'); fan += 5 }

  // 大四喜 (13 fan) — 4 wind triplets
  const windTrips = ['winds-0','winds-1','winds-2','winds-3'].filter(k => (counts[k]||0) >= 3).length
  if (windTrips === 4) { label.push('大四喜'); fan += 13 }
  // 小四喜 (6 fan) — 3 wind triplets + 1 wind pair
  else if (windTrips === 3 && ['winds-0','winds-1','winds-2','winds-3'].some(k => (counts[k]||0) === 2))
    { label.push('小四喜'); fan += 6 }

  // 九子連環 (10 fan)
  if (isNineGates(hand14, melds)) { label.push('九子連環'); fan += 10 }

  // 十八羅漢 (13 fan) — 4 kongs
  const kongCount = melds.filter(m => m.type === 'kong').length
  if (kongCount === 4) { label.push('十八羅漢'); fan += 13 }

  // 刻刻糊 / 四刻糊 (8 fan) — all triplets by tsumo
  if (isAllTrip && isTsumo && kongCount === 0) { label.push('刻刻糊'); fan += 8 }

  // Seat wind triplet
  if ((counts[`winds-${seatWind}`]||0) >= 3) { label.push(`${WIND_ZH[seatWind]}（本位風）`); fan += 1 }
  // Round wind triplet  
  if (roundWind !== seatWind && (counts[`winds-${roundWind}`]||0) >= 3) { label.push(`${WIND_ZH[roundWind]}（圈風）`); fan += 1 }
  // Dragon triplets
  for (let v = 0; v < 3; v++) {
    if ((counts[`dragons-${v}`]||0) >= 3 && dragonTrips < 3)
      { label.push(`${DRAGON_ZH[v]}（箭刻）`); fan += 1 }
  }

  // Tsumo bonus
  if (isTsumo) { label.push('自摸'); fan += 1 }

  // Minimum 3 fan in HK rules
  if (fan < 3 && label.length === 0) return { fan: 0, label: ['不夠番'] }
  if (fan < 3 && isTsumo) { label.push('雞糊（自摸）'); fan = 3 }
  else if (fan < 3) { label.push('雞糊'); fan = 3 }

  return { fan, label }
}

function checkAllTriplets(allTiles, melds, hand14) {
  // All declared melds are triplets/kongs, and remaining hand forms triplets + pair
  const declaredOk = melds.every(m => m.type === 'pong' || m.type === 'kong')
  if (!declaredOk) return false
  const counts = {}
  for (const t of hand14) { const k = tileKey(t); counts[k] = (counts[k] || 0) + 1 }
  const vals = Object.values(counts)
  const hasPair = vals.some(v => v >= 2)
  const trips = vals.filter(v => v >= 3).length
  const pairs = vals.filter(v => v >= 2).length
  return trips >= 4 - melds.length || (trips === 3 - melds.length && pairs >= 2)
}

function isNineGates(hand14, melds) {
  if (melds.length > 0) return false
  const nonH = hand14.filter(t => SUITS.includes(t.suit))
  if (nonH.length !== 14) return false
  const suits = [...new Set(nonH.map(t => t.suit))]
  if (suits.length !== 1) return false
  const s = suits[0]
  const counts = {}; for (const t of nonH) { counts[t.value] = (counts[t.value] || 0) + 1 }
  const base = { 1: 3, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 1, 8: 1, 9: 3 }
  let extra = 0
  for (const [v, c] of Object.entries(counts)) {
    const diff = c - (base[v] || 0)
    if (diff < 0) return false
    extra += diff
  }
  return extra === 1
}

// ─── Tile tracker ─────────────────────────────────────────────────────────────
export function buildTileTracker(allDiscards, melds) {
  const gone = {}
  for (const pile of allDiscards) for (const t of pile) { const k = tileKey(t); gone[k] = (gone[k] || 0) + 1 }
  for (const meldSet of melds) for (const m of meldSet) for (const t of m.tiles) { const k = tileKey(t); gone[k] = (gone[k] || 0) + 1 }
  const tracker = {}
  for (const suit of SUITS) for (let v = 1; v <= 9; v++) { const k = `${suit}-${v}`; tracker[k] = { suit, value: v, gone: gone[k] || 0 } }
  for (let v = 0; v < 4; v++) { const k = `winds-${v}`; tracker[k] = { suit: 'winds', value: v, gone: gone[k] || 0 } }
  for (let v = 0; v < 3; v++) { const k = `dragons-${v}`; tracker[k] = { suit: 'dragons', value: v, gone: gone[k] || 0 } }
  return tracker
}

// ─── Hand analysis for player hints ──────────────────────────────────────────
export function analyzeHand(hand, melds, wallLeft, allDiscards, seatWind, roundWind) {
  const cleanHand = hand.filter(t => !t.isFlower)
  if (cleanHand.length < 1) return { shanten: 8, tenpai: [], hints: [], fan: null }
  const hand13 = cleanHand.length >= 13 ? cleanHand.slice(0, 13) : cleanHand
  const tenpai = cleanHand.length === 13 ? getTenpaiTiles(hand13, melds) : []
  const shanten = calcShanten(hand13, melds)
  const hints = []

  if (tenpai.length > 0) {
    hints.push({ type: 'tenpai', priority: 10, msg: `聽牌！等緊 ${tenpai.length} 種牌`, tiles: tenpai })
    const prob = Math.min(99, Math.round(tenpai.length * (wallLeft / 136) * 100))
    hints.push({ type: 'prob', priority: 9, msg: `摸到和牌機率約 ${prob}%` })
  }

  if (shanten === 1) {
    const best = []
    for (const t of hand13) {
      const rem = hand13.filter(x => x.id !== t.id)
      if (calcShanten(rem, melds) === 0) {
        const waits = getTenpaiTiles(rem, melds)
        best.push({ tile: t, waits: waits.length })
      }
    }
    best.sort((a, b) => b.waits - a.waits)
    if (best.length > 0) hints.push({ type: 'discard', priority: 8, msg: `打 ${getTileLabel(best[0].tile)} 可聽牌（等 ${best[0].waits} 種）` })
  }

  // Pattern hints
  const counts = {}; for (const t of hand13) { const k = tileKey(t); counts[k] = (counts[k] || 0) + 1 }
  const pairs = Object.values(counts).filter(v => v >= 2).length
  const trips = Object.values(counts).filter(v => v >= 3).length
  if (pairs >= 5) hints.push({ type: 'pattern', priority: 7, msg: '七對子有望！保留對子' })
  if (trips >= 2) hints.push({ type: 'pattern', priority: 6, msg: `${trips} 組刻子，考慮對對糊路線` })
  const dragonPairs = ['dragons-0','dragons-1','dragons-2'].filter(k => (counts[k]||0) >= 2).length
  if (dragonPairs >= 2) hints.push({ type: 'pattern', priority: 7, msg: `${dragonPairs} 組箭刻，大三元有機會！` })
  const windPairs = ['winds-0','winds-1','winds-2','winds-3'].filter(k => (counts[k]||0) >= 2).length
  if (windPairs >= 3) hints.push({ type: 'pattern', priority: 6, msg: '三組風刻，小四喜有望！' })

  // Colour hints
  for (const suit of SUITS) {
    const suitCount = hand13.filter(t => t.suit === suit).length
    if (suitCount >= 8) hints.push({ type: 'pattern', priority: 5, msg: `${suitZH(suit)}牌多（${suitCount}張），可考慮清一色` })
  }

  return { shanten, tenpai, hints: hints.sort((a, b) => b.priority - a.priority).slice(0, 5) }
}

export function getTileLabel(tile) {
  if (!tile) return ''
  if (tile.suit === 'winds') return WIND_ZH[tile.value]
  if (tile.suit === 'dragons') return DRAGON_ZH[tile.value]
  if (tile.suit === 'flowers') return FLOWER_ZH[tile.value]
  return `${tile.value}${suitZH(tile.suit)}`
}
export function suitZH(s) { return { bamboo: '索', characters: '萬', circles: '筒' }[s] || s }
