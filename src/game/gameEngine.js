import {
  buildWall, isFlower, sortHand, checkWin, calcFan, fanToPoints,
  SUITS, WINDS, TILE_DISPLAY, HONOURS
} from './tiles.js';
import { aiDiscard, aiWantsPong, aiWantsChi } from '../ai/strategies.js';
import { scanBestLane, LANE_LABELS } from '../ai/strategies.js';

// ─── Session ──────────────────────────────────────────────────────────────────
export function createSession(players, minFan = 3) {
  return { players, scores: players.map(()=>0), dealer:0, round:0, handsPlayed:0, minFan };
}

// ─── Start Hand ───────────────────────────────────────────────────────────────
export function startHand(session) {
  const wall = buildWall();
  const deadWall = wall.splice(wall.length - 16); // reserve for supplements
  const hands = [[],[],[],[]];
  for (let r=0;r<13;r++) for (let p=0;p<4;p++) hands[p].push(wall.pop());
  hands[session.dealer].push(wall.pop());

  const flowers = [[],[],[],[]];
  let dIdx = 0;
  for (let p=0;p<4;p++) {
    let changed = true;
    while (changed) {
      changed = false;
      for (let i=0;i<hands[p].length;i++) {
        if (isFlower(hands[p][i])) {
          flowers[p].push(hands[p][i]);
          hands[p].splice(i,1);
          const s = deadWall[dIdx++] || wall.pop();
          if (s) { hands[p].push(s); changed=true; }
          i--;
        }
      }
    }
    hands[p] = sortHand(hands[p]);
  }
  const seatWinds = [0,1,2,3].map(i=>(session.dealer+i)%4);
  return {
    session, wall, deadWall: deadWall.slice(dIdx),
    hands, melds:[[],[],[],[]], discards:[[],[],[],[]],
    flowers, seatWinds,
    currentPlayer: session.dealer,
    drawnTile: hands[session.dealer][hands[session.dealer].length-1],
    phase:'discard', claimPending:null,
    lastDiscard:null, lastDiscarder:null,
    log:[`局開始 — 莊家：${session.players[session.dealer].name}`],
    result:null, turnCount:0,
    _canSelfDraw: checkWin(hands[session.dealer], []),
    _isKongDraw: false,
    lastClaimPlayer:null, lastClaimType:null,
  };
}

// ─── Supplement draw (after kong/flower) ─────────────────────────────────────
function drawSupplement(state, p) {
  let dw = [...state.deadWall], w = [...state.wall];
  let tile = dw.length > 0 ? dw.pop() : w.pop();
  let flowers = state.flowers.map(f=>[...f]);

  while (tile && isFlower(tile)) {
    flowers[p] = [...flowers[p], tile];
    tile = dw.length > 0 ? dw.pop() : w.pop();
  }
  if (!tile) return { ...state, deadWall:dw, wall:w, phase:'finished', result:{type:'draw',winner:null}, log:[...state.log,'流局'] };

  const hands = state.hands.map((h,i) => i===p ? sortHand([...h,tile]) : [...h]);
  const canWin = checkWin(hands[p], state.melds[p]);
  return {
    ...state, deadWall:dw, wall:w, hands, flowers, drawnTile:tile,
    currentPlayer:p, phase:'discard',
    log:[...state.log,`${state.session.players[p].name} 補牌`],
    _canSelfDraw:canWin, _isKongDraw:true, turnCount:(state.turnCount||0)+1,
  };
}

// ─── Draw ─────────────────────────────────────────────────────────────────────
export function drawTile(state, p) {
  if (state.wall.length === 0) {
    return { ...state, phase:'finished', result:{type:'draw',winner:null}, log:[...state.log,'流局'] };
  }
  let wall = [...state.wall];
  let tile = wall.pop();
  let flowers = state.flowers.map(f=>[...f]);
  while (tile && isFlower(tile)) {
    flowers[p] = [...flowers[p], tile];
    tile = wall.pop();
  }
  if (!tile) return { ...state, wall, phase:'finished', result:{type:'draw',winner:null}, log:[...state.log,'流局'] };

  const hands = state.hands.map((h,i)=>i===p?sortHand([...h,tile]):[...h]);
  const canWin = checkWin(hands[p], state.melds[p]);
  return {
    ...state, wall, hands, flowers, drawnTile:tile, currentPlayer:p, phase:'discard',
    log:[...state.log,`${state.session.players[p].name} 摸牌`],
    turnCount:(state.turnCount||0)+1, _canSelfDraw:canWin, _isKongDraw:false,
    lastClaimPlayer:null, lastClaimType:null,
  };
}

// ─── Discard ──────────────────────────────────────────────────────────────────
export function doDiscard(state, p, tileId) {
  const hand = state.hands[p];
  const idx = hand.findIndex(t=>t.id===tileId);
  if (idx===-1) return state;
  const tile = hand[idx];
  const newHand = hand.filter((_,i)=>i!==idx);
  const hands = state.hands.map((h,i)=>i===p?sortHand(newHand):[...h]);
  const discards = state.discards.map((d,i)=>i===p?[...d,tile]:[...d]);
  const newState = {
    ...state, hands, discards, drawnTile:null,
    lastDiscard:tile, lastDiscarder:p,
    log:[...state.log,`${state.session.players[p].name} 打出 ${TILE_DISPLAY[tile.key]||tile.key}`],
    _canSelfDraw:false, _isKongDraw:false,
  };
  return gatherClaims(newState, tile, p);
}

// ─── Kong declarations ────────────────────────────────────────────────────────
export function declareAnKong(state, p, key) {
  const hand = state.hands[p];
  const matching = hand.filter(t=>t.key===key).slice(0,4);
  if (matching.length < 4) return state;
  const meld = { type:'kong', subtype:'an', tiles:sortHand(matching) };
  const ids = new Set(matching.map(t=>t.id));
  const newHand = hand.filter(t=>!ids.has(t.id));
  const hands = state.hands.map((h,i)=>i===p?sortHand(newHand):h);
  const melds = state.melds.map((m,i)=>i===p?[...m,meld]:m);
  const st = { ...state, hands, melds, drawnTile:null,
    log:[...state.log,`${state.session.players[p].name} 暗槓 ${TILE_DISPLAY[key]||key}！`],
    lastClaimPlayer:p, lastClaimType:'kong' };
  return drawSupplement(st, p);
}

export function declareAddKong(state, p, tileId) {
  const hand = state.hands[p];
  const tile = hand.find(t=>t.id===tileId);
  if (!tile) return state;
  const mi = state.melds[p].findIndex(m=>m.type==='pong'&&m.tiles[0]?.key===tile.key);
  if (mi===-1) return state;
  const existing = state.melds[p][mi];

  // Check rob-kong by opponents
  for (let opp=0;opp<4;opp++) {
    if (opp===p) continue;
    const testHand=[...state.hands[opp],tile];
    if (checkWin(testHand,state.melds[opp])) {
      const {fan,patterns}=calcFan(testHand,state.melds[opp],tile,false,state.seatWinds[opp],state.session.round,state.flowers[opp]);
      if (fan>=state.session.minFan) return executeWin(state,opp,tile,false,fan,patterns);
    }
  }

  const newMeld = { type:'kong', subtype:'jia', tiles:[...existing.tiles,tile] };
  const newHand = hand.filter(t=>t.id!==tileId);
  const hands = state.hands.map((h,i)=>i===p?sortHand(newHand):h);
  const newMs = state.melds[p].map((m,i)=>i===mi?newMeld:m);
  const melds = state.melds.map((m,i)=>i===p?newMs:m);
  const st = { ...state, hands, melds, drawnTile:null,
    log:[...state.log,`${state.session.players[p].name} 加槓 ${TILE_DISPLAY[tile.key]||tile.key}！`],
    lastClaimPlayer:p, lastClaimType:'kong' };
  return drawSupplement(st, p);
}

export function declareMingKong(state, p, discardedTile) {
  const mi = state.melds[p].findIndex(m=>m.type==='pong'&&m.tiles[0]?.key===discardedTile.key);
  if (mi===-1) return state;
  const existing = state.melds[p][mi];
  const newMeld = { type:'kong', subtype:'ming', tiles:[...existing.tiles,discardedTile] };
  const newMs = state.melds[p].map((m,i)=>i===mi?newMeld:m);
  const melds = state.melds.map((m,i)=>i===p?newMs:m);
  const st = { ...state, melds, drawnTile:null, claimPending:null,
    log:[...state.log,`${state.session.players[p].name} 明槓 ${TILE_DISPLAY[discardedTile.key]||discardedTile.key}！`],
    lastClaimPlayer:p, lastClaimType:'kong' };
  return drawSupplement(st, p);
}

// ─── Claims ───────────────────────────────────────────────────────────────────
function gatherClaims(state, tile, discarder) {
  const claims = [];
  for (let p=0;p<4;p++) {
    if (p===discarder) continue;
    const hand = state.hands[p];
    // Win
    const testHand=[...hand,tile];
    if (checkWin(testHand,state.melds[p])) {
      const {fan,patterns}=calcFan(testHand,state.melds[p],tile,false,state.seatWinds[p],state.session.round,state.flowers[p]);
      if (fan>=state.session.minFan) claims.push({player:p,type:'win',tile,fan,patterns});
    }
    // Ming kong (have pong meld of this tile)
    const hasPong=state.melds[p].some(m=>m.type==='pong'&&m.tiles[0]?.key===tile.key);
    if (hasPong) claims.push({player:p,type:'kong',tile});
    // Pong (2 in hand)
    const matching=hand.filter(t=>t.key===tile.key);
    if (matching.length>=2&&!hasPong) claims.push({player:p,type:'pong',tile,tiles:[matching[0],matching[1],tile]});
    // Chi (only next player)
    if (p===(discarder+1)%4) {
      for (const opt of getChiOptions(hand,tile)) claims.push({player:p,type:'chi',tile,tiles:opt});
    }
  }
  if (claims.length===0) {
    return { ...state, currentPlayer:(discarder+1)%4, phase:'draw', claimPending:null };
  }
  const humanClaims=claims.filter(c=>state.session.players[c.player].isHuman);
  if (humanClaims.length>0) {
    return { ...state, phase:'claiming', claimPending:{claims,tile,discarder,claimingHuman:humanClaims[0].player} };
  }
  return resolveClaimsAI(state,claims,tile,discarder);
}

function getChiOptions(hand,tile) {
  const sn=suitNum(tile); if(!sn) return [];
  const {suit,num}=sn, ss=SUITS[suit], opts=[];
  for (const seq of [[num-2,num-1,num],[num-1,num,num+1],[num,num+1,num+2]]) {
    if (seq.some(n=>n<1||n>9)) continue;
    const others=seq.filter(n=>n!==num);
    const t1=hand.find(t=>t.key===`${ss}${others[0]}`);
    const t2=hand.find(t=>t.key===`${ss}${others[1]}`&&t!==t1);
    if (t1&&t2) opts.push([t1,t2,tile]);
  }
  return opts;
}

function suitNum(tile) {
  for (let i=0;i<SUITS.length;i++)
    if (tile.key.startsWith(SUITS[i])&&/\d$/.test(tile.key))
      return {suit:i,num:parseInt(tile.key.slice(-1))};
  return null;
}

export function resolveClaimsAI(state, claims, tile, discarder) {
  // Priority: win > kong > pong > chi
  const wins=claims.filter(c=>c.type==='win');
  if (wins.length) {
    const best=wins.reduce((a,b)=>b.fan>a.fan?b:a,wins[0]);
    return executeWin(state,best.player,tile,false,best.fan,best.patterns);
  }
  const kongs=claims.filter(c=>c.type==='kong');
  for (const c of kongs) {
    const strat=state.session.players[c.player].strategy||'auto';
    if (['triplet','dragon','winds','balanced','value'].includes(strat))
      return declareMingKong(state,c.player,tile);
  }
  const pongs=claims.filter(c=>c.type==='pong');
  for (const c of pongs) {
    const p=c.player,strat=state.session.players[p].strategy||'auto';
    if (aiWantsPong(tile,state.hands[p],state.melds[p],strat,state.seatWinds[p],state.session.round,state.session.minFan,state))
      return executePong(state,p,c.tiles);
  }
  const chis=claims.filter(c=>c.type==='chi');
  for (const c of chis) {
    const p=c.player,strat=state.session.players[p].strategy||'auto';
    if (aiWantsChi(tile,state.hands[p],state.melds[p],strat,state))
      return executeChi(state,p,c.tiles,tile);
  }
  return { ...state, currentPlayer:(discarder+1)%4, phase:'draw', claimPending:null };
}

function executePong(state,p,meldTiles) {
  const meld={type:'pong',tiles:sortHand(meldTiles)};
  const ids=new Set(meldTiles.map(t=>t.id));
  const newHand=state.hands[p].filter(t=>!ids.has(t.id));
  const hands=state.hands.map((h,i)=>i===p?sortHand(newHand):h);
  const melds=state.melds.map((m,i)=>i===p?[...m,meld]:m);
  const label=TILE_DISPLAY[meld.tiles[0]?.key]||meld.tiles[0]?.key||'';
  return { ...state,hands,melds,currentPlayer:p,phase:'discard',claimPending:null,
    lastClaimPlayer:p,lastClaimType:'pong',
    log:[...state.log,`${state.session.players[p].name} 碰 ${label}！`] };
}

function executeChi(state,p,meldTiles,claimedTile) {
  const sorted=sortHand(meldTiles);
  const meld={type:'chi',tiles:sorted};
  const ids=new Set(meldTiles.filter(t=>t.id!==claimedTile.id).map(t=>t.id));
  const newHand=state.hands[p].filter(t=>!ids.has(t.id));
  const hands=state.hands.map((h,i)=>i===p?sortHand(newHand):h);
  const melds=state.melds.map((m,i)=>i===p?[...m,meld]:m);
  const str=sorted.map(t=>TILE_DISPLAY[t.key]).join('');
  return { ...state,hands,melds,currentPlayer:p,phase:'discard',claimPending:null,
    lastClaimPlayer:p,lastClaimType:'chi',
    log:[...state.log,`${state.session.players[p].name} 上 ${str}！`] };
}

function executeWin(state,winner,tile,isSelfDraw,fan,patterns) {
  const pts=fanToPoints(fan);
  const scores=[...state.session.scores];
  const loser=isSelfDraw?null:state.lastDiscarder;
  if (isSelfDraw) { for(let i=0;i<4;i++){if(i!==winner)scores[i]-=pts;} scores[winner]+=pts*3; }
  else { if(loser!=null)scores[loser]-=pts*3; scores[winner]+=pts*3; }
  return { ...state, session:{...state.session,scores}, phase:'finished', claimPending:null,
    result:{type:'win',winner,fan,pts,points:pts,patterns,isSelfDraw,loser},
    log:[...state.log,`🀄 ${state.session.players[winner].name} 糊牌！${fan>=99?'爆棚':fan+'番'} ${pts}點`] };
}

// ─── Human claim handlers ─────────────────────────────────────────────────────
export function playerClaimWin(state) {
  const {claims,tile,claimingHuman}=state.claimPending;
  const c=claims.find(x=>x.player===claimingHuman&&x.type==='win');
  if(!c) return state;
  return executeWin(state,claimingHuman,tile,false,c.fan,c.patterns);
}
export function playerPong(state) {
  const {claims,claimingHuman}=state.claimPending;
  const c=claims.find(x=>x.player===claimingHuman&&x.type==='pong');
  if(!c) return state;
  return executePong(state,claimingHuman,c.tiles);
}
export function playerKongFromDiscard(state) {
  const {tile,claimingHuman}=state.claimPending;
  return declareMingKong(state,claimingHuman,tile);
}
export function playerChi(state,chiTiles) {
  const {tile,claimingHuman}=state.claimPending;
  return executeChi(state,claimingHuman,chiTiles,tile);
}
export function playerPass(state) {
  const {claims,tile,discarder,claimingHuman}=state.claimPending;
  const rest=claims.filter(c=>c.player!==claimingHuman);
  if (!rest.length) return { ...state,currentPlayer:(discarder+1)%4,phase:'draw',claimPending:null };
  return resolveClaimsAI({...state,claimPending:null},rest,tile,discarder);
}

// ─── AI Turn ──────────────────────────────────────────────────────────────────
export function aiTurn(state) {
  const p=state.currentPlayer;
  if (state.session.players[p].isHuman) return state;

  if (state.phase==='draw') return drawTile(state,p);

  if (state.phase==='discard') {
    // Self-draw win
    if (state._canSelfDraw) {
      const {fan,patterns}=calcFan(state.hands[p],state.melds[p],state.drawnTile,true,
        state.seatWinds[p],state.session.round,state.flowers[p]);
      if (fan>=state.session.minFan) return executeWin(state,p,state.drawnTile,true,fan,patterns);
    }
    // Kong checks
    const hand=state.hands[p], cnt={};
    for(const t of hand) cnt[t.key]=(cnt[t.key]||0)+1;
    const strat=state.session.players[p].strategy||'auto';
    for(const [key,count] of Object.entries(cnt)) {
      if(count>=4) return declareAnKong(state,p,key);
    }
    for(const meld of state.melds[p]) {
      if(meld.type==='pong') {
        const extra=hand.find(t=>t.key===meld.tiles[0]?.key);
        if(extra) return declareAddKong(state,p,extra.id);
      }
    }
    // Pick strategy dynamically using scanBestLane
    const scan = scanBestLane(state.hands[p], state.melds[p], state.seatWinds[p], state.session.round, state.session.minFan);
    const effectiveStrat = scan?.best || strat;
    const discard=aiDiscard(hand,state.melds[p],effectiveStrat,state.seatWinds[p],state.session.round,state.session.minFan,state,state.turnCount||0);
    return doDiscard(state,p,discard.id);
  }
  return state;
}

// ─── Session Advance ──────────────────────────────────────────────────────────
export function advanceSession(state) {
  let {dealer,round,handsPlayed,scores}=state.session;
  if (state.result?.type==='win'&&state.result.winner!==dealer) {
    dealer=(dealer+1)%4;
    if(dealer===0) round=(round+1)%4;
  }
  handsPlayed++;
  return {...state.session,dealer,round,handsPlayed,scores};
}

// ─── Simulation (no safety counter — game must always terminate) ──────────────
export function runOneGame(players, minFan=3) {
  let session=createSession(players,minFan);
  const results=[];

  for (let handNum=0; handNum<16; handNum++) {
    // Run one complete hand using aiTurn loop — guaranteed to terminate
    let state=startHand(session);

    // Override all players as AI for simulation
    const simPlayers=players.map(p=>({...p,isHuman:false}));
    state={...state,session:{...state.session,players:simPlayers}};

    // Use dynamic strategy: AI picks its own best lane each discard
    let maxTurns=500; // safety only against infinite loops from bugs
    while (state.phase!=='finished' && maxTurns-->0) {
      if (state.phase==='draw') {
        state=drawTile(state,state.currentPlayer);
      } else if (state.phase==='discard') {
        state=aiTurn(state);
      } else if (state.phase==='claiming') {
        if (!state.claimPending) {
          state={...state,phase:'draw',currentPlayer:(state.lastDiscarder+1)%4};
        } else {
          const {claims,tile,discarder}=state.claimPending;
          state=resolveClaimsAI({...state,claimPending:null},claims,tile,discarder);
        }
      } else {
        break; // unknown phase
      }
    }

    if (state.phase!=='finished') {
      state={...state,phase:'finished',result:{type:'draw',winner:null}};
    }

    // Sync scores back
    if (state.result?.type==='win') {
      session={...session,scores:[...state.session.scores]};
    }

    results.push({hand:handNum,dealer:session.dealer,result:state.result,scores:[...session.scores]});

    const ns=advanceSession(state);
    if(ns.round>=4||ns.handsPlayed>=16) break;
    session={...ns,players};
  }
  return {finalScores:session.scores,hands:results};
}
