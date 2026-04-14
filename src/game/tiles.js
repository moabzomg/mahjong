// ─── Hong Kong Mahjong — Full Tile Engine ────────────────────────────────────
export const SUITS = ['bamboo', 'characters', 'circles']
export const WIND_ZH  = ['東','南','西','北']
export const DRAGON_ZH = ['中','發','白']
export const FLOWER_ZH = ['春','夏','秋','冬','梅','蘭','菊','竹']

let _tileId = 0

export function buildWall() {
  _tileId = 0
  const tiles = []
  for (const suit of SUITS)
    for (let v = 1; v <= 9; v++)
      for (let c = 0; c < 4; c++)
        tiles.push({ id: _tileId++, suit, value: v, isFlower: false })
  for (let v = 0; v < 4; v++)
    for (let c = 0; c < 4; c++)
      tiles.push({ id: _tileId++, suit: 'winds', value: v, isFlower: false })
  for (let v = 0; v < 3; v++)
    for (let c = 0; c < 4; c++)
      tiles.push({ id: _tileId++, suit: 'dragons', value: v, isFlower: false })
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

export function getTileLabel(tile) {
  if (!tile) return ''
  if (tile.suit === 'winds')   return WIND_ZH[tile.value]
  if (tile.suit === 'dragons') return DRAGON_ZH[tile.value]
  if (tile.suit === 'flowers') return FLOWER_ZH[tile.value]
  return `${tile.value}${{ bamboo:'索', characters:'萬', circles:'筒' }[tile.suit] || ''}`
}
export function suitZH(s) { return { bamboo:'索', characters:'萬', circles:'筒' }[s] || s }

// ─── Win detection ────────────────────────────────────────────────────────────
// hand14: tiles in hand (NOT including declared meld tiles)
// melds:  declared melds [{type, tiles}], each meld contributes 3 or 4 tiles
export function checkWin(hand, melds = []) {
  const nonFlower = hand.filter(t => !t.isFlower)
  const meldCount  = melds.length
  const handNeeded = 14 - melds.reduce((s, m) => s + (m.type === 'kong' ? 4 : 3), 0)

  if (nonFlower.length !== handNeeded) return false

  // Thirteen orphans (no declared melds allowed)
  if (meldCount === 0 && isThirteenOrphans(nonFlower)) return true
  // Seven pairs (no declared melds allowed)
  if (meldCount === 0 && isSevenPairs(nonFlower)) return true
  // Standard: remaining hand forms (4 - meldCount) melds + 1 pair
  return canFormWinningHand(nonFlower, 4 - meldCount)
}

function canFormWinningHand(tiles, meldsNeeded) {
  // Try every unique tile as the pair (雀/眼)
  const seen = new Set()
  for (const t of tiles) {
    const k = tileKey(t)
    if (seen.has(k)) continue
    seen.add(k)
    const pairs = tiles.filter(x => tileKey(x) === k)
    if (pairs.length < 2) continue
    // Remove the pair from tiles
    const rest = [...tiles]
    rest.splice(rest.findIndex(x => x.id === pairs[0].id), 1)
    rest.splice(rest.findIndex(x => x.id === pairs[1].id), 1)
    if (canFormMelds(rest, meldsNeeded)) return true
  }
  return false
}

export function canFormMelds(tiles, n) {
  if (n === 0) return tiles.length === 0
  if (tiles.length < 3) return false
  const sorted = sortHand(tiles)
  const first  = sorted[0]
  const rest   = sorted.slice(1)

  // Try triplet first
  const sameKey = rest.filter(t => tileKey(t) === tileKey(first))
  if (sameKey.length >= 2) {
    const rem = rest.filter(t => t !== sameKey[0] && t !== sameKey[1])
    if (canFormMelds(rem, n - 1)) return true
  }
  // Try sequence (suits only)
  if (SUITS.includes(first.suit)) {
    const s2 = rest.find(t => t.suit === first.suit && t.value === first.value + 1)
    if (s2) {
      const after2 = rest.filter(t => t !== s2)
      const s3 = after2.find(t => t.suit === first.suit && t.value === first.value + 2)
      if (s3) {
        const rem = after2.filter(t => t !== s3)
        if (canFormMelds(rem, n - 1)) return true
      }
    }
  }
  return false
}

export function isSevenPairs(hand) {
  const nf = hand.filter(t => !t.isFlower)
  if (nf.length !== 14) return false
  const counts = {}
  for (const t of nf) { const k = tileKey(t); counts[k] = (counts[k] || 0) + 1 }
  const vals = Object.values(counts)
  return vals.length === 7 && vals.every(v => v === 2)
}

export function isThirteenOrphans(hand) {
  const nf = hand.filter(t => !t.isFlower)
  if (nf.length !== 14) return false
  const required = [
    'characters-1','characters-9','bamboo-1','bamboo-9','circles-1','circles-9',
    'winds-0','winds-1','winds-2','winds-3','dragons-0','dragons-1','dragons-2',
  ]
  const counts = {}
  for (const t of nf) { const k = tileKey(t); counts[k] = (counts[k] || 0) + 1 }
  return required.every(r => (counts[r] || 0) >= 1) &&
         required.some(r  => (counts[r] || 0) >= 2)
}

// ─── Tenpai / shanten ─────────────────────────────────────────────────────────
export function getTenpaiTiles(hand13, melds = []) {
  const nf = hand13.filter(t => !t.isFlower)
  const types = []
  for (const suit of SUITS) for (let v = 1; v <= 9; v++) types.push({ id: 99990, suit, value: v, isFlower: false })
  for (let v = 0; v < 4; v++) types.push({ id: 99991, suit: 'winds',   value: v, isFlower: false })
  for (let v = 0; v < 3; v++) types.push({ id: 99992, suit: 'dragons', value: v, isFlower: false })
  return types.filter(tile => checkWin([...nf, tile], melds))
}

export function calcShanten(hand, melds = []) {
  const nf = hand.filter(t => !t.isFlower)
  if (!nf.length) return 8
  const meldCount   = melds.length
  const meldsNeeded = 4 - meldCount

  let best = 8
  // Standard — try each tile as pair
  const seen = new Set()
  for (const t of nf) {
    const k = tileKey(t)
    if (seen.has(k)) continue
    seen.add(k)
    const pairs = nf.filter(x => tileKey(x) === k)
    if (pairs.length < 2) continue
    const rest = [...nf]
    rest.splice(rest.findIndex(x => x.id === pairs[0].id), 1)
    rest.splice(rest.findIndex(x => x.id === pairs[1].id), 1)
    best = Math.min(best, shantenMelds(rest, meldsNeeded))
  }
  // No pair yet
  best = Math.min(best, shantenMelds(nf, meldsNeeded) + 1)
  // Seven pairs shanten (only with no melds)
  if (meldCount === 0) {
    const counts = {}; for (const t of nf) { const k=tileKey(t); counts[k]=(counts[k]||0)+1 }
    const pairs  = Object.values(counts).filter(v => v >= 2).length
    best = Math.min(best, 6 - pairs)
  }
  return best
}

function shantenMelds(tiles, n) {
  const counts = {}
  for (const t of tiles) { const k = tileKey(t); counts[k] = (counts[k] || 0) + 1 }
  let complete = 0, partial = 0
  // triplets
  for (const [k, c] of Object.entries(counts)) {
    if (c >= 3) { complete++; counts[k] -= 3 }
    else if (c === 2) { partial++; counts[k] = 0 }
  }
  // sequences & partials
  for (const suit of SUITS) {
    for (let v = 1; v <= 7; v++) {
      const k1=`${suit}-${v}`, k2=`${suit}-${v+1}`, k3=`${suit}-${v+2}`
      while ((counts[k1]||0)>0 && (counts[k2]||0)>0 && (counts[k3]||0)>0)
        { complete++; counts[k1]--; counts[k2]--; counts[k3]-- }
    }
    for (let v = 1; v <= 8; v++) {
      const k1=`${suit}-${v}`, k2=`${suit}-${v+1}`
      while ((counts[k1]||0)>0 && (counts[k2]||0)>0) { partial++; counts[k1]--; counts[k2]-- }
    }
    for (let v = 1; v <= 7; v++) {
      const k1=`${suit}-${v}`, k2=`${suit}-${v+2}`
      while ((counts[k1]||0)>0 && (counts[k2]||0)>0) { partial++; counts[k1]--; counts[k2]-- }
    }
  }
  const maxPartial = n - complete - 1 + (tiles.length % 3 === 0 ? 0 : 1)
  const s = n - complete - 1 - Math.min(partial, Math.max(0, maxPartial))
  return Math.max(0, s)
}

// ─── Fan calculation — Hong Kong rules ────────────────────────────────────────
export function calcFan(hand, melds = [], isTsumo = false, seatWind = 0, roundWind = 0) {
  const nf     = hand.filter(t => !t.isFlower)
  const allTiles = [...nf, ...melds.flatMap(m => m.tiles)]
  const counts = {}
  for (const t of allTiles) { const k = tileKey(t); counts[k] = (counts[k] || 0) + 1 }

  let fan = 0
  const label = []

  // ── Special hands ──────────────────────────────────────────────────────────
  if (melds.length === 0 && isSevenPairs(nf)) {
    label.push('七對子'); fan += 3
    if (isTsumo) { label.push('自摸'); fan += 1 }
    return { fan, label }
  }
  if (melds.length === 0 && isThirteenOrphans(nf)) {
    label.push('十三么'); fan += 13
    if (isTsumo) { label.push('自摸'); fan += 1 }
    return { fan, label }
  }

  // ── 字一色 (10 fan) — all honour tiles ───────────────────────────────────
  const allHonour = allTiles.every(t => t.suit === 'winds' || t.suit === 'dragons')
  if (allHonour) { label.push('字一色'); fan += 10 }

  // ── 么九 (10 fan) — all terminals + honours ───────────────────────────────
  const allTerminal = allTiles.every(t =>
    t.suit === 'winds' || t.suit === 'dragons' ||
    (SUITS.includes(t.suit) && (t.value === 1 || t.value === 9))
  )
  if (allTerminal && !allHonour) { label.push('么九'); fan += 10 }

  // ── 九子連環 (10 fan) ─────────────────────────────────────────────────────
  if (melds.length === 0 && isNineGates(nf)) { label.push('九子連環'); fan += 10 }

  // ── Colour patterns ────────────────────────────────────────────────────────
  const suitTiles  = allTiles.filter(t => SUITS.includes(t.suit))
  const usedSuits  = [...new Set(suitTiles.map(t => t.suit))]
  const hasHonours = allTiles.some(t => t.suit === 'winds' || t.suit === 'dragons')
  if (usedSuits.length === 1 && !hasHonours) { label.push('清一色'); fan += 7 }
  else if (usedSuits.length === 1 && hasHonours) { label.push('混一色'); fan += 3 }

  // ── Dragon / wind big hands ────────────────────────────────────────────────
  const dragonTrips = ['dragons-0','dragons-1','dragons-2'].filter(k => (counts[k]||0) >= 3).length
  const windTrips   = ['winds-0','winds-1','winds-2','winds-3'].filter(k => (counts[k]||0) >= 3).length

  if (dragonTrips === 3) { label.push('大三元'); fan += 8 }
  else if (dragonTrips === 2 &&
    ['dragons-0','dragons-1','dragons-2'].some(k => (counts[k]||0) === 2))
    { label.push('小三元'); fan += 5 }

  if (windTrips === 4) { label.push('大四喜'); fan += 13 }
  else if (windTrips === 3 &&
    ['winds-0','winds-1','winds-2','winds-3'].some(k => (counts[k]||0) === 2))
    { label.push('小四喜'); fan += 6 }

  // ── 十八羅漢 — 4 declared kongs ──────────────────────────────────────────
  const kongCount = melds.filter(m => m.type === 'kong').length
  if (kongCount === 4) { label.push('十八羅漢'); fan += 13 }

  // ── 對對糊 (3 fan) — all declared melds are pongs/kongs AND hand is all pairs/trips ─
  const deckAllTrip = melds.every(m => m.type === 'pong' || m.type === 'kong')
  const handCounts  = {}; for (const t of nf) { const k=tileKey(t); handCounts[k]=(handCounts[k]||0)+1 }
  const hVals = Object.values(handCounts)
  const handIsTripsAndPair = melds.length === 0
    ? hVals.every(v => v >= 2) && hVals.filter(v=>v>=3).length >= 4
    : (deckAllTrip && hVals.filter(v=>v>=3).length >= (4 - melds.length) && hVals.some(v=>v===2))
  if (handIsTripsAndPair && !allHonour && !allTerminal) { label.push('對對糊'); fan += 3 }

  // ── 刻刻糊 (8 fan) — tsumo 對對糊 (overrides 對對糊) ─────────────────────
  if (handIsTripsAndPair && isTsumo && fan > 0) {
    const idx = label.indexOf('對對糊')
    if (idx !== -1) { label.splice(idx, 1); fan -= 3 }
    label.push('刻刻糊'); fan += 8
  }

  // ── Single-tile bonuses (座風、圈風、中發白) ───────────────────────────────
  if (!allHonour) {
    if ((counts[`winds-${seatWind}`]||0) >= 3)
      { label.push(`${WIND_ZH[seatWind]}刻（本位風）`); fan += 1 }
    if (roundWind !== seatWind && (counts[`winds-${roundWind}`]||0) >= 3)
      { label.push(`${WIND_ZH[roundWind]}刻（圈風）`); fan += 1 }
    for (let v = 0; v < 3; v++) {
      if ((counts[`dragons-${v}`]||0) >= 3 && dragonTrips < 3)
        { label.push(`${DRAGON_ZH[v]}刻（箭牌）`); fan += 1 }
    }
  }

  // ── 自摸 bonus ─────────────────────────────────────────────────────────────
  if (isTsumo) { label.push('自摸'); fan += 1 }

  // ── Minimum 3 fan (三番起糊) ──────────────────────────────────────────────
  if (fan < 3) {
    label.unshift('雞糊')
    fan = 3
  }

  return { fan, label }
}

function isNineGates(hand) {
  const nf = hand.filter(t => SUITS.includes(t.suit))
  if (nf.length !== 14) return false
  const suits = [...new Set(nf.map(t => t.suit))]
  if (suits.length !== 1) return false
  const counts = {}; for (const t of nf) { counts[t.value] = (counts[t.value]||0) + 1 }
  const base = { 1:3,2:1,3:1,4:1,5:1,6:1,7:1,8:1,9:3 }
  let extra = 0
  for (const [v, c] of Object.entries(counts)) {
    const diff = c - (base[v] || 0)
    if (diff < 0) return false
    extra += diff
  }
  return extra === 1
}

// ─── Tile tracker ─────────────────────────────────────────────────────────────
export function buildTileTracker(allDiscards, allMelds) {
  const gone = {}
  for (const pile of (allDiscards || [])) for (const t of pile)
    { const k = tileKey(t); gone[k] = (gone[k]||0) + 1 }
  for (const meldSet of (allMelds || [])) for (const m of meldSet) for (const t of m.tiles)
    { const k = tileKey(t); gone[k] = (gone[k]||0) + 1 }
  const tracker = {}
  for (const suit of SUITS) for (let v=1;v<=9;v++) { const k=`${suit}-${v}`; tracker[k]={suit,value:v,gone:gone[k]||0} }
  for (let v=0;v<4;v++) { const k=`winds-${v}`;   tracker[k]={suit:'winds',  value:v,gone:gone[k]||0} }
  for (let v=0;v<3;v++) { const k=`dragons-${v}`; tracker[k]={suit:'dragons',value:v,gone:gone[k]||0} }
  return tracker
}

// ─── Hand analysis (player hints) ─────────────────────────────────────────────
export function analyzeHand(hand, melds, wallLeft) {
  const nf = hand.filter(t => !t.isFlower)
  if (nf.length < 1) return { shanten:8, tenpai:[], hints:[] }
  const hand13 = nf.slice(0, 13)
  const tenpai  = nf.length >= 13 ? getTenpaiTiles(hand13, melds) : []
  const shanten = calcShanten(hand13, melds)
  const hints   = []

  if (tenpai.length > 0) {
    hints.push({ type:'tenpai', priority:10, msg:`聽牌！等緊 ${tenpai.length} 種牌` })
    const prob = Math.min(99, Math.round(tenpai.length * 4 / Math.max(wallLeft, 1) * 100))
    hints.push({ type:'prob', priority:9, msg:`摸到和牌機率約 ${Math.min(99,prob)}%` })
  }

  if (shanten === 1) {
    const opts = []
    for (const t of hand13) {
      const rem = hand13.filter(x => x.id !== t.id)
      if (calcShanten(rem, melds) === 0) {
        const waits = getTenpaiTiles(rem, melds)
        opts.push({ tile:t, waits:waits.length })
      }
    }
    opts.sort((a,b) => b.waits - a.waits)
    if (opts.length > 0)
      hints.push({ type:'discard', priority:8, msg:`打 ${getTileLabel(opts[0].tile)} 可聽牌（等 ${opts[0].waits} 種）` })
  }

  // Pattern hints
  const counts={}; for (const t of hand13) { const k=tileKey(t); counts[k]=(counts[k]||0)+1 }
  const pairs  = Object.values(counts).filter(v=>v>=2).length
  const trips  = Object.values(counts).filter(v=>v>=3).length
  if (pairs >= 5)  hints.push({ type:'pattern', priority:7, msg:'七對子有望！繼續收集對子' })
  if (trips >= 2)  hints.push({ type:'pattern', priority:6, msg:`${trips}組刻子，可考慮對對糊路線` })
  const dPairs = ['dragons-0','dragons-1','dragons-2'].filter(k=>(counts[k]||0)>=2).length
  if (dPairs >= 2) hints.push({ type:'pattern', priority:7, msg:`${dPairs}組箭刻，大三元有機！` })
  for (const suit of SUITS) {
    if (hand13.filter(t=>t.suit===suit).length >= 8)
      hints.push({ type:'pattern', priority:5, msg:`${suitZH(suit)}牌多，清一色有望` })
  }

  return { shanten, tenpai, hints: hints.sort((a,b)=>b.priority-a.priority).slice(0,5) }
}
