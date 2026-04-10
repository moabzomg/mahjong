import { buildWall, sortHand, checkWin, getTenpaiTiles, tileKey, calcShanten, isSevenPairs } from './tiles.js'
import { aiDiscard, aiWantsRon, detectWinType, STRATEGY_KEYS, AI_STRATEGIES } from '../ai/strategies.js'

export const PLAYER = 0
export const PLAYER_NAMES = ['你', 'AI 東', 'AI 南', 'AI 西']
export const SEAT_WINDS = ['東','南','西','北']

export function initGame(aiStrategies) {
  const strats = aiStrategies || ['nash','nash','nash']
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
    aiStrategies: strats,
    tenpaiTiles: [],
    log: ['開局！幫你摸牌…'],
    stats: {
      turns: 0,
      tilesDrawn: [0,0,0,0],
      winTypes: [],         // {player, type, score}
      tenpaiHistory: [],    // {player, tiles}
      scoreHistory: [[0,0,0,0]],
      discardCount: [0,0,0,0],
    }
  }
}

function recordStats(state, update) {
  return { ...state, stats: { ...state.stats, ...update } }
}

export function drawTile(state) {
  if (state.wall.length === 0)
    return { ...state, phase:'finished', winner:-1, log:[...state.log,'🀫 牌墻摸完，流局！'] }

  const tile = state.wall[state.wall.length-1]
  const newWall = state.wall.slice(0,-1)
  const p = state.currentPlayer
  const newHand = sortHand([...state.hands[p], tile])
  const newHands = state.hands.map((h,i)=>i===p?newHand:h)
  const tenpai = p===PLAYER ? getTenpaiTiles(newHand.filter(t=>t.id!==tile.id)) : []

  const stats = {
    ...state.stats,
    tilesDrawn: state.stats.tilesDrawn.map((v,i)=>i===p?v+1:v),
    turns: state.stats.turns + 1,
  }

  if (checkWin(newHand)) {
    const wt = detectWinType(newHand) || '自摸'
    const scores=[...state.scores]; scores[p]+=8
    stats.winTypes = [...state.stats.winTypes, {player:p, type:wt+'（自摸）', score:8}]
    stats.scoreHistory = [...stats.scoreHistory, [...scores]]
    return { ...state, wall:newWall, hands:newHands, drawnTile:tile, phase:'finished', winner:p, scores, stats,
      log:[...state.log, p===0?`🏆 你自摸（${wt}）！`:`🏆 ${PLAYER_NAMES[p]} 自摸（${wt}）！`] }
  }

  const msg = p===0 ? `你摸牌（剩 ${newWall.length} 張）` : `${PLAYER_NAMES[p]} 摸牌（剩 ${newWall.length} 張）`
  return { ...state, wall:newWall, hands:newHands, drawnTile:tile, phase:'discard', tenpaiTiles:tenpai, stats, log:[...state.log, msg] }
}

export function playerDiscard(state, tileId) {
  if (state.currentPlayer!==PLAYER||state.phase!=='discard') return state
  const hand=state.hands[PLAYER]
  const tile=hand.find(t=>t.id===tileId); if(!tile) return state
  const newHand=sortHand(hand.filter(t=>t.id!==tileId))
  const newDiscards=state.discards.map((d,i)=>i===PLAYER?[...d,tile]:d)
  const newHands=state.hands.map((h,i)=>i===PLAYER?newHand:h)
  const stats = { ...state.stats, discardCount: state.stats.discardCount.map((v,i)=>i===0?v+1:v) }

  for (const p of [1,2,3]) {
    const strat = state.aiStrategies[p-1]
    const claimHand=sortHand([...state.hands[p],tile])
    if (checkWin(claimHand) && aiWantsRon(strat,tile,state.hands[p])) {
      const wt = detectWinType(claimHand) || '炮'
      const scores=[...state.scores]; scores[p]+=16
      stats.winTypes = [...state.stats.winTypes, {player:p,type:wt+'（炮）',score:16}]
      stats.scoreHistory = [...stats.scoreHistory, [...scores]]
      return { ...state, hands:newHands.map((h,i)=>i===p?claimHand:h), discards:newDiscards, stats,
        lastDiscard:tile,lastDiscardPlayer:PLAYER,phase:'finished',winner:p,scores,
        log:[...state.log,'你打牌。',`🏆 ${PLAYER_NAMES[p]} 食炮（${wt}）！`] }
    }
  }

  return { ...state, hands:newHands, discards:newDiscards, lastDiscard:tile, stats,
    lastDiscardPlayer:PLAYER,drawnTile:null,phase:'draw',currentPlayer:1,tenpaiTiles:[],
    log:[...state.log,'你打牌。'] }
}

export function playerClaimDiscard(state) {
  if (!state.lastDiscard||state.currentPlayer===PLAYER) return state
  const tile=state.lastDiscard
  const newHand=sortHand([...state.hands[PLAYER],tile])
  if (checkWin(newHand)) {
    const wt = detectWinType(newHand) || '炮'
    const scores=[...state.scores]; scores[PLAYER]+=16
    const stats = { ...state.stats, winTypes:[...state.stats.winTypes,{player:0,type:wt+'（炮）',score:16}],
      scoreHistory:[...state.stats.scoreHistory,[...scores]] }
    return { ...state, hands:state.hands.map((h,i)=>i===PLAYER?newHand:h), stats,
      phase:'finished',winner:PLAYER,scores,log:[...state.log,`🏆 你食炮（${wt}）！`] }
  }
  return { ...state, hands:state.hands.map((h,i)=>i===PLAYER?newHand:h),
    phase:'discard',currentPlayer:PLAYER,log:[...state.log,'你食咗隻炮牌。'] }
}

export function aiTurn(state) {
  if (state.phase!=='draw'||state.currentPlayer===PLAYER) return state
  const p=state.currentPlayer
  const strat = state.aiStrategies[p-1] || 'nash'

  let s=drawTile(state); if(s.phase==='finished') return s

  const discardTile=aiDiscard(strat, s.hands[p], s.discards)
  const newHand=sortHand(s.hands[p].filter(t=>t.id!==discardTile.id))
  const newDiscards=s.discards.map((d,i)=>i===p?[...d,discardTile]:d)
  const newHands=s.hands.map((h,i)=>i===p?newHand:h)
  const stats = { ...s.stats, discardCount: s.stats.discardCount.map((v,i)=>i===p?v+1:v) }

  for (const cp of [0,1,2,3]) {
    if (cp===p||cp===PLAYER) continue
    const cpStrat = state.aiStrategies[cp-1] || 'nash'
    const claimHand=sortHand([...newHands[cp],discardTile])
    if (checkWin(claimHand) && aiWantsRon(cpStrat,discardTile,newHands[cp])) {
      const wt = detectWinType(claimHand)||'炮'
      const scores=[...s.scores]; scores[cp]+=16
      stats.winTypes = [...stats.winTypes,{player:cp,type:wt+'（炮）',score:16}]
      stats.scoreHistory = [...stats.scoreHistory,[...scores]]
      return { ...s, hands:newHands.map((h,i)=>i===cp?claimHand:h), discards:newDiscards, stats,
        lastDiscard:discardTile,lastDiscardPlayer:p,phase:'finished',winner:cp,scores,
        log:[...s.log,`${PLAYER_NAMES[p]} 打牌。`,`🏆 ${PLAYER_NAMES[cp]} 食炮（${wt}）！`] }
    }
  }

  const next=p===3?0:p+1
  stats.scoreHistory = [...stats.scoreHistory,[...s.scores]]
  return { ...s, hands:newHands, discards:newDiscards, lastDiscard:discardTile, stats,
    lastDiscardPlayer:p,drawnTile:null,phase:'draw',currentPlayer:next,
    log:[...s.log,`${PLAYER_NAMES[p]} 打牌。`] }
}

// ─── Full simulation (synchronous, no UI) ────────────────────────────────────
export function runSimulation(strategies) {
  // strategies: array of 4 strategy keys (index 0 = East/human seat in sim)
  const strats = strategies || ['nash','dragon','tortoise','tripletHunter']
  const wall = buildWall()
  const hands = [[],[],[],[]]
  for (let i=0;i<13;i++) for(let p=0;p<4;p++) hands[p].push(wall.pop())

  let state = {
    wall,
    hands: hands.map(sortHand),
    discards:[[],[],[],[]],
    currentPlayer:0,
    phase:'draw',
    drawnTile:null,
    lastDiscard:null,
    lastDiscardPlayer:null,
    winner:null,
    scores:[0,0,0,0],
    aiStrategies: [strats[1]||'nash', strats[2]||'nash', strats[3]||'nash'],
    simStrategies: strats, // all 4
    tenpaiTiles:[],
    log:['模擬開局'],
    stats:{
      turns:0,
      tilesDrawn:[0,0,0,0],
      winTypes:[],
      tenpaiHistory:[],
      scoreHistory:[[0,0,0,0]],
      discardCount:[0,0,0,0],
    }
  }

  let safety = 300
  while (state.phase==='play'||state.phase==='draw'||state.phase==='discard') {
    if (safety-- <= 0) break
    if (state.phase==='finished') break

    const p = state.currentPlayer
    const pStrat = strats[p] || 'nash'

    // Draw
    if (state.phase==='draw') {
      if (state.wall.length===0) { state={...state,phase:'finished',winner:-1}; break }
      const tile=state.wall[state.wall.length-1]
      const newWall=state.wall.slice(0,-1)
      const newHand=sortHand([...state.hands[p],tile])
      const newHands=state.hands.map((h,i)=>i===p?newHand:h)
      const stats={...state.stats,tilesDrawn:state.stats.tilesDrawn.map((v,i)=>i===p?v+1:v),turns:state.stats.turns+1}

      if (checkWin(newHand)) {
        const wt=detectWinType(newHand)||'自摸'
        const scores=[...state.scores]; scores[p]+=8
        stats.winTypes=[...stats.winTypes,{player:p,type:wt+'（自摸）',score:8}]
        stats.scoreHistory=[...stats.scoreHistory,[...scores]]
        state={...state,wall:newWall,hands:newHands,phase:'finished',winner:p,scores,stats}
        break
      }
      state={...state,wall:newWall,hands:newHands,phase:'discard',stats}
    }

    if (state.phase==='discard') {
      // AI discard
      const discardTile=aiDiscard(pStrat, state.hands[p], state.discards)
      const newHand=sortHand(state.hands[p].filter(t=>t.id!==discardTile.id))
      const newDiscards=state.discards.map((d,i)=>i===p?[...d,discardTile]:d)
      const newHands=state.hands.map((h,i)=>i===p?newHand:h)
      const stats={...state.stats,discardCount:state.stats.discardCount.map((v,i)=>i===p?v+1:v)}

      // Check Ron from all others
      let won=false
      for (const cp of [0,1,2,3]) {
        if (cp===p) continue
        const cpStrat=strats[cp]||'nash'
        const claimHand=sortHand([...newHands[cp],discardTile])
        if (checkWin(claimHand)&&aiWantsRon(cpStrat,discardTile,newHands[cp])) {
          const wt=detectWinType(claimHand)||'炮'
          const scores=[...state.scores]; scores[cp]+=16
          stats.winTypes=[...stats.winTypes,{player:cp,type:wt+'（炮）',score:16}]
          stats.scoreHistory=[...stats.scoreHistory,[...scores]]
          state={...state,hands:newHands.map((h,i)=>i===cp?claimHand:h),discards:newDiscards,stats,
            lastDiscard:discardTile,lastDiscardPlayer:p,phase:'finished',winner:cp,scores}
          won=true; break
        }
      }
      if (!won) {
        const next=p===3?0:p+1
        stats.scoreHistory=[...stats.scoreHistory,[...state.scores]]
        state={...state,hands:newHands,discards:newDiscards,lastDiscard:discardTile,stats,
          lastDiscardPlayer:p,drawnTile:null,phase:'draw',currentPlayer:next}
      }
    }
  }

  if (state.phase!=='finished') {
    let winner=-1
    state={...state,phase:'finished',winner}
  }

  return { ...state, simStrategies: strats }
}
