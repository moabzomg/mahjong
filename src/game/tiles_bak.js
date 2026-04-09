// ─── Tile Definitions ──────────────────────────────────────────────────────
export const SUITS = ['bamboo', 'characters', 'circles']
export const HONORS = ['winds', 'dragons']
export const WIND_NAMES = ['East', 'South', 'West', 'North']
export const DRAGON_NAMES = ['Chun', 'Hatsu', 'Haku'] // Red, Green, White

export function createTile(suit, value, id) {
  return { suit, value, id, selected: false }
}

export function buildWall() {
  const tiles = []
  let id = 0
  // Number tiles 1-9, 4 copies each suit
  for (const suit of SUITS) {
    for (let v = 1; v <= 9; v++) {
      for (let c = 0; c < 4; c++) {
        tiles.push(createTile(suit, v, id++))
      }
    }
  }
  // Wind tiles - 4 winds x 4 copies
  for (let v = 0; v < 4; v++) {
    for (let c = 0; c < 4; c++) {
      tiles.push(createTile('winds', v, id++))
    }
  }
  // Dragon tiles - 3 dragons x 4 copies
  for (let v = 0; v < 3; v++) {
    for (let c = 0; c < 4; c++) {
      tiles.push(createTile('dragons', v, id++))
    }
  }
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

export function tileKey(tile) {
  return `${tile.suit}-${tile.value}`
}

export function tileLabel(tile) {
  if (tile.suit === 'winds') return WIND_NAMES[tile.value]
  if (tile.suit === 'dragons') return DRAGON_NAMES[tile.value]
  return tile.value
}

export function tileSymbol(tile) {
  if (tile.suit === 'bamboo') {
    const bamboo = ['🀐','🀑','🀒','🀓','🀔','🀕','🀖','🀗','🀘']
    return bamboo[tile.value - 1]
  }
  if (tile.suit === 'characters') {
    const chars = ['🀇','🀈','🀉','🀊','🀋','🀌','🀍','🀎','🀏']
    return chars[tile.value - 1]
  }
  if (tile.suit === 'circles') {
    const circles = ['🀙','🀚','🀛','🀜','🀝','🀞','🀟','🀠','🀡']
    return circles[tile.value - 1]
  }
  if (tile.suit === 'winds') {
    return ['🀀','🀁','🀂','🀃'][tile.value]
  }
  if (tile.suit === 'dragons') {
    return ['🀄','🀅','🀆'][tile.value]
  }
  return '?'
}

export function tileColor(tile) {
  if (tile.suit === 'bamboo') return '#2d6a2d'
  if (tile.suit === 'characters') return '#8b1a1a'
  if (tile.suit === 'circles') return '#1a3f8b'
  if (tile.suit === 'winds') return '#5a4a2a'
  if (tile.suit === 'dragons') return '#7a1f7a'
  return '#333'
}

export function sortHand(hand) {
  const suitOrder = { bamboo: 0, characters: 1, circles: 2, winds: 3, dragons: 4 }
  return [...hand].sort((a, b) => {
    const sd = suitOrder[a.suit] - suitOrder[b.suit]
    if (sd !== 0) return sd
    return a.value - b.value
  })
}

// ─── Meld / Win Detection ───────────────────────────────────────────────────
export function isSequence(tiles) {
  if (tiles.length !== 3) return false
  const [a, b, c] = tiles
  if (!SUITS.includes(a.suit)) return false
  if (a.suit !== b.suit || b.suit !== c.suit) return false
  const vals = [a.value, b.value, c.value].sort((x, y) => x - y)
  return vals[1] === vals[0] + 1 && vals[2] === vals[0] + 2
}

export function isTriplet(tiles) {
  if (tiles.length !== 3) return false
  return tiles[0].suit === tiles[1].suit &&
    tiles[1].suit === tiles[2].suit &&
    tiles[0].value === tiles[1].value &&
    tiles[1].value === tiles[2].value
}

export function isPair(tiles) {
  return tiles.length === 2 &&
    tiles[0].suit === tiles[1].suit &&
    tiles[0].value === tiles[1].value
}

// Check if a hand of 14 tiles is a winning hand
export function checkWin(hand) {
  const groups = groupByKey(hand)
  return canFormWinningHand(Object.values(groups).map(g => g.length > 0 ? g : []).flat(), hand)
}

function groupByKey(tiles) {
  const groups = {}
  for (const t of tiles) {
    const k = tileKey(t)
    if (!groups[k]) groups[k] = []
    groups[k].push(t)
  }
  return groups
}

function canFormWinningHand(tiles, original) {
  // Try all possible pairs as the eye
  const keys = [...new Set(tiles.map(tileKey))]
  for (const k of keys) {
    const grouped = groupByKey(tiles)
    if (grouped[k] && grouped[k].length >= 2) {
      const pair = grouped[k].slice(0, 2)
      const rest = [...tiles]
      for (const p of pair) {
        const idx = rest.findIndex(t => t.id === p.id)
        rest.splice(idx, 1)
      }
      if (canFormMelds(rest)) return true
    }
  }
  return false
}

function canFormMelds(tiles) {
  if (tiles.length === 0) return true
  const sorted = sortHand(tiles)
  const first = sorted[0]
  const rest = sorted.slice(1)

  // Try triplet
  const sameKey = rest.filter(t => tileKey(t) === tileKey(first))
  if (sameKey.length >= 2) {
    const triplet = [sameKey[0], sameKey[1]]
    const remaining = rest.filter(t => !triplet.includes(t))
    if (canFormMelds(remaining)) return true
  }

  // Try sequence
  if (SUITS.includes(first.suit)) {
    const second = rest.find(t => t.suit === first.suit && t.value === first.value + 1)
    if (second) {
      const afterSecond = rest.filter(t => t !== second)
      const third = afterSecond.find(t => t.suit === first.suit && t.value === first.value + 2)
      if (third) {
        const remaining = afterSecond.filter(t => t !== third)
        if (canFormMelds(remaining)) return true
      }
    }
  }

  return false
}

// Count tiles needed to win (tenpai analysis)
export function getTenpaiTiles(hand13) {
  const waiting = []
  const allPossible = getAllUniqueTileTypes()
  for (const tile of allPossible) {
    const test = [...hand13, { ...tile, id: 9999 }]
    if (checkWin(test)) {
      waiting.push(tile)
    }
  }
  return waiting
}

function getAllUniqueTileTypes() {
  const types = []
  for (const suit of SUITS) {
    for (let v = 1; v <= 9; v++) types.push({ suit, value: v })
  }
  for (let v = 0; v < 4; v++) types.push({ suit: 'winds', value: v })
  for (let v = 0; v < 3; v++) types.push({ suit: 'dragons', value: v })
  return types
}
