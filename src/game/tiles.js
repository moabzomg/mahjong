export const SUITS = ['bamboo', 'characters', 'circles']
export const WIND_NAMES = ['East','South','West','North']
export const WIND_ZH = ['東','南','西','北']
export const DRAGON_NAMES = ['Red','Green','White']
export const DRAGON_ZH = ['中','發','白']

export function createTile(suit, value, id) { return { suit, value, id } }

export function buildWall() {
  const tiles = []; let id = 0
  for (const suit of SUITS) for (let v=1;v<=9;v++) for (let c=0;c<4;c++) tiles.push(createTile(suit,v,id++))
  for (let v=0;v<4;v++) for (let c=0;c<4;c++) tiles.push(createTile('winds',v,id++))
  for (let v=0;v<3;v++) for (let c=0;c<4;c++) tiles.push(createTile('dragons',v,id++))
  return shuffle(tiles)
}

export function shuffle(arr) {
  const a=[...arr]; for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}; return a
}

export function tileKey(t) { return `${t.suit}-${t.value}` }

export function sortHand(hand) {
  const so={bamboo:0,characters:1,circles:2,winds:3,dragons:4}
  return [...hand].sort((a,b)=>(so[a.suit]-so[b.suit])||(a.value-b.value))
}

// ─── Win detection ─────────────────────────────────────────────────────────────
export function checkWin(hand) {
  if (hand.length !== 14) return false
  const keys=[...new Set(hand.map(tileKey))]
  for (const k of keys) {
    const pair=hand.filter(t=>tileKey(t)===k).slice(0,2)
    if (pair.length<2) continue
    const rest=[...hand]
    for (const p of pair) rest.splice(rest.findIndex(t=>t.id===p.id),1)
    if (canFormMelds(rest)) return true
  }
  // Seven pairs
  if (isSevenPairs(hand)) return true
  return false
}

export function isSevenPairs(hand) {
  if (hand.length!==14) return false
  const counts={}
  for (const t of hand) { const k=tileKey(t); counts[k]=(counts[k]||0)+1 }
  const vals=Object.values(counts)
  return vals.length===7 && vals.every(v=>v===2)
}

export function canFormMelds(tiles) {
  if (tiles.length===0) return true
  const sorted=sortHand(tiles)
  const first=sorted[0]; const rest=sorted.slice(1)
  // triplet
  const same=rest.filter(t=>tileKey(t)===tileKey(first))
  if (same.length>=2) { const rem=rest.filter(t=>t!==same[0]&&t!==same[1]); if(canFormMelds(rem)) return true }
  // sequence
  if (SUITS.includes(first.suit)) {
    const s2=rest.find(t=>t.suit===first.suit&&t.value===first.value+1)
    if (s2) { const a2=rest.filter(t=>t!==s2); const s3=a2.find(t=>t.suit===first.suit&&t.value===first.value+2); if(s3){const rem=a2.filter(t=>t!==s3);if(canFormMelds(rem))return true} }
  }
  return false
}

// ─── Tenpai analysis ────────────────────────────────────────────────────────────
export function getTenpaiTiles(hand13) {
  const types=[]
  for(const suit of SUITS) for(let v=1;v<=9;v++) types.push({suit,value:v,id:9998})
  for(let v=0;v<4;v++) types.push({suit:'winds',value:v,id:9998})
  for(let v=0;v<3;v++) types.push({suit:'dragons',value:v,id:9998})
  return types.filter(tile=>checkWin([...hand13,tile]))
}

// ─── Shanten number (distance from tenpai) ────────────────────────────────────
export function calcShanten(hand) {
  // Returns how many tiles away from tenpai (-1 = already tenpai/win)
  const h = hand.length <= 13 ? hand : hand.slice(0, 13)
  let best = 8
  // Standard hand
  const keys=[...new Set(h.map(tileKey))]
  for (const k of keys) {
    const pair=h.filter(t=>tileKey(t)===k).slice(0,2)
    if (pair.length<2) continue
    const rest=h.filter(t=>!pair.includes(t)||(pair.indexOf(t)<0))
    // remove pair properly
    const restCopy=[...h]; for(const p of pair) restCopy.splice(restCopy.findIndex(t=>t.id===p.id),1)
    const s = shantenMelds(restCopy)
    best = Math.min(best, s)
  }
  // No pair yet
  best = Math.min(best, shantenMelds(h)+1)
  // Seven pairs shanten
  const counts={}; for(const t of h){const k=tileKey(t);counts[k]=(counts[k]||0)+1}
  const pairs=Object.values(counts).filter(v=>v>=2).length
  best = Math.min(best, 6 - pairs)
  return best
}

function shantenMelds(tiles) {
  // Count complete melds and partial melds
  let best = Math.ceil(tiles.length/3) - 1
  // Greedy counting
  const counts={}; for(const t of tiles){const k=tileKey(t);counts[k]=(counts[k]||0)+1}
  let complete=0, partial=0
  // triplets
  for(const[k,c] of Object.entries(counts)){if(c>=3){complete++;counts[k]-=3}else if(c===2){partial++;counts[k]=0}}
  // sequences
  for(const suit of SUITS){
    for(let v=1;v<=7;v++){
      const k1=`${suit}-${v}`,k2=`${suit}-${v+1}`,k3=`${suit}-${v+2}`
      while(counts[k1]>0&&counts[k2]>0&&counts[k3]>0){complete++;counts[k1]--;counts[k2]--;counts[k3]--}
    }
    for(let v=1;v<=8;v++){
      const k1=`${suit}-${v}`,k2=`${suit}-${v+1}`
      while(counts[k1]>0&&counts[k2]>0){partial++;counts[k1]--;counts[k2]--}
    }
    for(let v=1;v<=7;v++){
      const k1=`${suit}-${v}`,k2=`${suit}-${v+2}`
      while(counts[k1]>0&&counts[k2]>0){partial++;counts[k1]--;counts[k2]--}
    }
  }
  const needed=Math.ceil(tiles.length/3)
  const s=needed-complete-1-Math.min(partial,needed-complete-1+(tiles.length%3===0?0:1))
  return Math.max(0,s)
}

// ─── Hand analysis for hints ───────────────────────────────────────────────────
export function analyzeHand(hand13, wallRemaining, allDiscards) {
  const tenpai = getTenpaiTiles(hand13)
  const shanten = calcShanten(hand13)
  const hints = []

  if (tenpai.length > 0) {
    hints.push({ type:'tenpai', msg:`聽牌！等緊 ${tenpai.length} 種牌`, tiles: tenpai, priority:10 })
  }

  // What to discard to reach tenpai fastest
  if (shanten === 1) {
    const discardHints = []
    for (const t of hand13) {
      const remaining = hand13.filter(x=>x!==t)
      const newShanten = calcShanten(remaining)
      if (newShanten === 0) {
        const waits = getTenpaiTiles(remaining)
        discardHints.push({ tile:t, waits:waits.length })
      }
    }
    if (discardHints.length>0) {
      discardHints.sort((a,b)=>b.waits-a.waits)
      const best=discardHints[0]
      hints.push({ type:'discard-hint', msg:`打出 ${tileKeyToZH(tileKey(best.tile))} 可聽牌（等 ${best.waits} 種）`, priority:9 })
    }
  }

  // Identify patterns
  const counts={}; for(const t of hand13){const k=tileKey(t);counts[k]=(counts[k]||0)+1}
  const pairs=Object.entries(counts).filter(([,v])=>v>=2)
  const triplets=Object.entries(counts).filter(([,v])=>v>=3)

  if (pairs.length>=5) hints.push({ type:'pattern', msg:'七對子有望！繼續收集對子', priority:7 })
  if (triplets.length>=2) hints.push({ type:'pattern', msg:'刻子路線！考慮碰牌', priority:6 })

  // Sequences
  for(const suit of SUITS) {
    const sv=hand13.filter(t=>t.suit===suit).map(t=>t.value).sort((a,b)=>a-b)
    for(let i=0;i<sv.length-1;i++) {
      if(sv[i+1]===sv[i]+1){ hints.push({type:'pattern',msg:`${suitZH(suit)}連張：${sv[i]}-${sv[i+1]}`,priority:4}); break }
    }
  }

  // Probability of drawing tenpai tile
  if (tenpai.length>0 && wallRemaining>0) {
    const needed=tenpai.length*4  // rough estimate (4 copies each)
    const prob=Math.min(99,Math.round((1-(Math.pow((wallRemaining-needed)/wallRemaining,wallRemaining)))*100))
    hints.push({ type:'prob', msg:`係牆入摸到聽牌牌：約 ${prob}%`, priority:8 })
  }

  return { tenpai, shanten, hints: hints.sort((a,b)=>b.priority-a.priority).slice(0,5) }
}

function tileKeyToZH(key) {
  const [suit,val]=key.split('-')
  const v=parseInt(val)
  if(suit==='winds') return WIND_ZH[v]
  if(suit==='dragons') return DRAGON_ZH[v]
  return `${v}${suitZH(suit)}`
}
function suitZH(s){return{bamboo:'索',characters:'萬',circles:'筒'}[s]||s}

// ─── Tile tracker: count remaining tiles in wall ───────────────────────────────
export function buildTileTracker(allDiscards, wall) {
  // Shows how many of each tile type remain (out of 4)
  const discarded={}
  for(const pile of allDiscards) for(const t of pile) { const k=tileKey(t);discarded[k]=(discarded[k]||0)+1 }
  const tracker={}
  for(const suit of SUITS) for(let v=1;v<=9;v++){const k=`${suit}-${v}`;tracker[k]={suit,value:v,total:4,gone:discarded[k]||0}}
  for(let v=0;v<4;v++){const k=`winds-${v}`;tracker[k]={suit:'winds',value:v,total:4,gone:discarded[k]||0}}
  for(let v=0;v<3;v++){const k=`dragons-${v}`;tracker[k]={suit:'dragons',value:v,total:4,gone:discarded[k]||0}}
  return tracker
}

// Smart AI discard: minimize shanten, maximize safety
export function smartDiscard(hand, allDiscards) {
  const dangerous = getDangerousTiles(allDiscards)
  let bestTile = hand[hand.length-1]
  let bestScore = -Infinity

  for (const t of hand) {
    const remaining = hand.filter(x=>x.id!==t.id)
    const shanten = calcShanten(remaining)
    const safety = dangerous.has(tileKey(t)) ? -2 : 0
    const score = -shanten * 10 + safety + (t.suit==='winds'||t.suit==='dragons' ? -1 : 0)
    if (score > bestScore) { bestScore=score; bestTile=t }
  }
  return bestTile
}

function getDangerousTiles(allDiscards) {
  // Tiles that appear often in discards = safer to discard
  const counts={}
  for(const pile of allDiscards) for(const t of pile){const k=tileKey(t);counts[k]=(counts[k]||0)+1}
  // Tiles rarely discarded = dangerous (others might be waiting for them)
  const dangerous=new Set()
  // Honour tiles discarded by nobody = potentially dangerous
  return dangerous
}
