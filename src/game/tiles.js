export const SUITS = ['bamboo', 'characters', 'circles']
export const WIND_NAMES = ['East', 'South', 'West', 'North']
export const DRAGON_NAMES = ['Chun', 'Hatsu', 'Haku']

export function createTile(suit, value, id) {
  return { suit, value, id, selected: false }
}

export function buildWall() {
  const tiles = []
  let id = 0
  for (const suit of SUITS) {
    for (let v = 1; v <= 9; v++) {
      for (let c = 0; c < 4; c++) tiles.push(createTile(suit, v, id++))
    }
  }
  for (let v = 0; v < 4; v++) {
    for (let c = 0; c < 4; c++) tiles.push(createTile('winds', v, id++))
  }
  for (let v = 0; v < 3; v++) {
    for (let c = 0; c < 4; c++) tiles.push(createTile('dragons', v, id++))
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

export function tileKey(tile) { return `${tile.suit}-${tile.value}` }

export function tileLabel(tile) {
  if (tile.suit === 'winds') return WIND_NAMES[tile.value]
  if (tile.suit === 'dragons') return DRAGON_NAMES[tile.value]
  return String(tile.value)
}

export function tileSymbol(tile) {
  const maps = {
    bamboo: ['🀐','🀑','🀒','🀓','🀔','🀕','🀖','🀗','🀘'],
    characters: ['🀇','🀈','🀉','🀊','🀋','🀌','🀍','🀎','🀏'],
    circles: ['🀙','🀚','🀛','🀜','🀝','🀞','🀟','🀠','🀡'],
    winds: ['🀀','🀁','🀂','🀃'],
    dragons: ['🀄','🀅','🀆'],
  }
  const arr = maps[tile.suit]
  const idx = SUITS.includes(tile.suit) ? tile.value - 1 : tile.value
  return arr ? arr[idx] || '?' : '?'
}

export function tileColor(tile) {
  const colors = { bamboo:'#2a7a3b', characters:'#b5200d', circles:'#1a4fa0', winds:'#6b5020', dragons:'#8e1f8e' }
  return colors[tile.suit] || '#333'
}

export function sortHand(hand) {
  const so = { bamboo:0, characters:1, circles:2, winds:3, dragons:4 }
  return [...hand].sort((a,b) => (so[a.suit]-so[b.suit]) || (a.value-b.value))
}

export function checkWin(hand) {
  if (hand.length !== 14) return false
  const keys = [...new Set(hand.map(tileKey))]
  for (const k of keys) {
    const pair = hand.filter(t => tileKey(t) === k).slice(0,2)
    if (pair.length < 2) continue
    const rest = [...hand]
    for (const p of pair) { rest.splice(rest.findIndex(t=>t.id===p.id),1) }
    if (canFormMelds(rest)) return true
  }
  return false
}

function canFormMelds(tiles) {
  if (tiles.length === 0) return true
  const sorted = sortHand(tiles)
  const first = sorted[0]
  const rest = sorted.slice(1)

  // Try triplet
  const same = rest.filter(t => tileKey(t) === tileKey(first))
  if (same.length >= 2) {
    const rem = rest.filter(t => t !== same[0] && t !== same[1])
    if (canFormMelds(rem)) return true
  }

  // Try sequence
  if (SUITS.includes(first.suit)) {
    const s2 = rest.find(t => t.suit === first.suit && t.value === first.value+1)
    if (s2) {
      const a2 = rest.filter(t=>t!==s2)
      const s3 = a2.find(t => t.suit === first.suit && t.value === first.value+2)
      if (s3) {
        const rem = a2.filter(t=>t!==s3)
        if (canFormMelds(rem)) return true
      }
    }
  }
  return false
}

export function getTenpaiTiles(hand13) {
  const waiting = []
  const types = []
  for (const suit of SUITS) for (let v=1;v<=9;v++) types.push({suit,value:v,id:9998})
  for (let v=0;v<4;v++) types.push({suit:'winds',value:v,id:9998})
  for (let v=0;v<3;v++) types.push({suit:'dragons',value:v,id:9998})
  for (const tile of types) {
    if (checkWin([...hand13, tile])) waiting.push(tile)
  }
  return waiting
}

export function countGroupings(hand) {
  let complete = 0, partial = 0
  const groups = {}
  for (const t of hand) {
    const k = tileKey(t)
    if (!groups[k]) groups[k] = []
    groups[k].push(t)
  }
  for (const g of Object.values(groups)) {
    if (g.length >= 3) complete++
    else if (g.length === 2) partial++
  }
  // sequences
  for (const suit of SUITS) {
    const vals = hand.filter(t=>t.suit===suit).map(t=>t.value).sort((a,b)=>a-b)
    for (let i=0;i<vals.length-1;i++) {
      if (vals[i+1]===vals[i]+1) {
        if (i+2<vals.length && vals[i+2]===vals[i]+2) complete++
        else partial++
      }
    }
  }
  return { complete, partial }
}
