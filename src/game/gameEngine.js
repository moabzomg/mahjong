import { buildWall, sortHand, checkWin, getTenpaiTiles, tileKey, smartDiscard, calcShanten } from './tiles.js'

export const PLAYER = 0
export const PLAYER_NAMES = ['你', 'AI 東', 'AI 南', 'AI 西']
export const SEAT_WINDS = ['東','南','西','北']

export function initGame() {
  const wall = buildWall()
  const hands = [[],[],[],[]]
  for (let i=0;i<13;i++) for(let p=0;p<4;p++) hands[p].push(wall.pop())
  return {
    wall,
    hands: hands.map(sortHand),
    discards: [[],[],[],[]],
    currentPlayer: 0,
    phase: 'draw',
    drawnTile: null,
    lastDiscard: null,
    lastDiscardPlayer: null,
    winner: null,
    scores: [0,0,0,0],
    tenpaiTiles: [],
    log: ['開局！幫你摸牌…'],
  }
}

export function drawTile(state) {
  if (state.wall.length === 0) {
    return { ...state, phase:'finished', winner:-1, log:[...state.log,'🀫 牌墻摸完，流局！'] }
  }
  const tile = state.wall[state.wall.length-1]
  const newWall = state.wall.slice(0,-1)
  const newHand = sortHand([...state.hands[state.currentPlayer], tile])
  const newHands = state.hands.map((h,i)=>i===state.currentPlayer?newHand:h)
  const tenpai = state.currentPlayer===PLAYER ? getTenpaiTiles(newHand.filter(t=>t.id!==tile.id)) : []

  if (checkWin(newHand)) {
    const scores=[...state.scores]; scores[state.currentPlayer]+=8
    const name=PLAYER_NAMES[state.currentPlayer]
    return { ...state, wall:newWall, hands:newHands, drawnTile:tile, phase:'finished', winner:state.currentPlayer, scores,
      log:[...state.log, state.currentPlayer===0?'🏆 你自摸贏！':`🏆 ${name} 自摸贏！`] }
  }

  const msg = state.currentPlayer===0 ? `你摸咗一張牌（剩 ${newWall.length} 張）` : `${PLAYER_NAMES[state.currentPlayer]} 摸牌（剩 ${newWall.length} 張）`
  return { ...state, wall:newWall, hands:newHands, drawnTile:tile, phase:'discard', tenpaiTiles:tenpai, log:[...state.log, msg] }
}

export function playerDiscard(state, tileId) {
  if (state.currentPlayer!==PLAYER || state.phase!=='discard') return state
  const hand=state.hands[PLAYER]
  const tile=hand.find(t=>t.id===tileId); if(!tile) return state
  const newHand=sortHand(hand.filter(t=>t.id!==tileId))
  const newDiscards=state.discards.map((d,i)=>i===PLAYER?[...d,tile]:d)
  const newHands=state.hands.map((h,i)=>i===PLAYER?newHand:h)

  // Check AI Ron
  for (const p of [1,2,3]) {
    const claimHand=sortHand([...state.hands[p],tile])
    if (checkWin(claimHand) && aiWantsRon(tile, state.hands[p], state.discards)) {
      const scores=[...state.scores]; scores[p]+=16
      return { ...state, hands:newHands.map((h,i)=>i===p?claimHand:h), discards:newDiscards,
        lastDiscard:tile, lastDiscardPlayer:PLAYER, phase:'finished', winner:p, scores,
        log:[...state.log, '你打牌。', `🏆 ${PLAYER_NAMES[p]} 食炮贏！`] }
    }
  }

  return { ...state, hands:newHands, discards:newDiscards, lastDiscard:tile,
    lastDiscardPlayer:PLAYER, drawnTile:null, phase:'draw', currentPlayer:1, tenpaiTiles:[],
    log:[...state.log, '你打牌。'] }
}

export function playerClaimDiscard(state) {
  if (!state.lastDiscard || state.currentPlayer===PLAYER) return state
  const tile=state.lastDiscard
  const newHand=sortHand([...state.hands[PLAYER],tile])
  if (checkWin(newHand)) {
    const scores=[...state.scores]; scores[PLAYER]+=16
    return { ...state, hands:state.hands.map((h,i)=>i===PLAYER?newHand:h),
      phase:'finished', winner:PLAYER, scores, log:[...state.log,'🏆 你食炮贏！'] }
  }
  return { ...state, hands:state.hands.map((h,i)=>i===PLAYER?newHand:h),
    phase:'discard', currentPlayer:PLAYER, log:[...state.log,'你食咗隻炮牌。'] }
}

export function aiTurn(state) {
  if (state.phase!=='draw'||state.currentPlayer===PLAYER) return state
  const p=state.currentPlayer

  // Draw
  let s=drawTile(state); if(s.phase==='finished') return s

  // Smart discard
  const discardTile=smartDiscard(s.hands[p], s.discards)
  const newHand=sortHand(s.hands[p].filter(t=>t.id!==discardTile.id))
  const newDiscards=s.discards.map((d,i)=>i===p?[...d,discardTile]:d)
  const newHands=s.hands.map((h,i)=>i===p?newHand:h)

  // Check if other AIs want to Ron
  for (const cp of [0,1,2,3]) {
    if (cp===p) continue
    if (cp===PLAYER) continue // player decides manually
    const claimHand=sortHand([...newHands[cp],discardTile])
    if (checkWin(claimHand) && aiWantsRon(discardTile, newHands[cp], s.discards)) {
      const scores=[...s.scores]; scores[cp]+=16
      return { ...s, hands:newHands.map((h,i)=>i===cp?claimHand:h), discards:newDiscards,
        lastDiscard:discardTile, lastDiscardPlayer:p, phase:'finished', winner:cp, scores,
        log:[...s.log, `${PLAYER_NAMES[p]} 打牌。`, `🏆 ${PLAYER_NAMES[cp]} 食炮贏！`] }
    }
  }

  const next=p===3?0:p+1
  return { ...s, hands:newHands, discards:newDiscards, lastDiscard:discardTile,
    lastDiscardPlayer:p, drawnTile:null, phase:'draw', currentPlayer:next,
    log:[...s.log, `${PLAYER_NAMES[p]} 打牌。`] }
}

// Smart Ron decision: only claim if it completes a winning hand
function aiWantsRon(tile, hand, allDiscards) {
  const testHand=sortHand([...hand,tile])
  if (!checkWin(testHand)) return false
  // Always win if you can
  return true
}
