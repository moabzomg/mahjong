import {
  buildWall, isFlower, sortHand, checkWin, calcFan, fanToPoints,
  tileKey, SUITS, WINDS, analyzeHand, TILE_DISPLAY, HONOURS
} from './tiles.js';
import { aiDiscard, aiWantsPong, aiWantsChi, meetsMinFan } from '../ai/strategies.js';

// ─── Session Init ─────────────────────────────────────────────────────────────

export function createSession(players, minFan = 3) {
  return {
    players,
    scores: players.map(() => 0),
    dealer: 0,
    round: 0,
    handsPlayed: 0,
    minFan,
  };
}

// ─── Deal Hand ────────────────────────────────────────────────────────────────

export function startHand(session) {
  const wall = buildWall();
  // Reserve last 14 as supplement wall (for kongs + flowers)
  const supplementWall = wall.splice(wall.length - 14);
  const hands = [[], [], [], []];

  // Deal 13 each
  for (let round = 0; round < 13; round++)
    for (let p = 0; p < 4; p++)
      hands[p].push(wall.pop());

  // Dealer gets 14th
  hands[session.dealer].push(wall.pop());

  // Auto-補花
  const flowers = [[], [], [], []];
  let suppIdx = 0;
  for (let p = 0; p < 4; p++) {
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 0; i < hands[p].length; i++) {
        if (isFlower(hands[p][i])) {
          flowers[p].push(hands[p][i]);
          hands[p].splice(i, 1);
          const supp = supplementWall[suppIdx++] || wall.pop();
          if (supp) { hands[p].push(supp); changed = true; }
          i--;
        }
      }
    }
    hands[p] = sortHand(hands[p]);
  }

  const seatWinds = [0,1,2,3].map(i => (session.dealer + i) % 4);

  return {
    session,
    wall,
    supplementWall: supplementWall.slice(suppIdx),
    hands,
    melds: [[],[],[],[]],
    discards: [[],[],[],[]],
    flowers,
    seatWinds,
    currentPlayer: session.dealer,
    drawnTile: hands[session.dealer][hands[session.dealer].length - 1],
    phase: 'discard',
    claimPending: null,
    lastDiscard: null,
    lastDiscarder: null,
    log: [`局開始 — 莊家：${session.players[session.dealer].name}`],
    result: null,
    turnCount: 0,
    _canSelfDraw: false,
  };
}

// ─── Draw supplement tile (after kong or flower) ──────────────────────────────

function drawSupplement(state, playerIdx) {
  let suppWall = [...state.supplementWall];
  let wall = [...state.wall];
  let tile = suppWall.length > 0 ? suppWall.pop() : wall.pop();
  let flowers = state.flowers.map(f => [...f]);

  // Handle flower from supplement
  while (tile && isFlower(tile)) {
    flowers[playerIdx] = [...flowers[playerIdx], tile];
    tile = suppWall.length > 0 ? suppWall.pop() : wall.pop();
  }

  if (!tile) {
    return { ...state, supplementWall: suppWall, wall, phase: 'finished', result: { type:'draw', winner:null }, log: [...state.log, '流局'] };
  }

  const hands = state.hands.map((h,i) => i===playerIdx ? sortHand([...h, tile]) : [...h]);
  const canWin = checkWin(hands[playerIdx], state.melds[playerIdx]);

  return {
    ...state,
    supplementWall: suppWall,
    wall,
    hands,
    flowers,
    drawnTile: tile,
    currentPlayer: playerIdx,
    phase: 'discard',
    log: [...state.log, `${state.session.players[playerIdx].name} 補牌`],
    _canSelfDraw: canWin,
    _isKongDraw: true,  // flag: this draw is after kong (not from wall)
  };
}

// ─── Draw ─────────────────────────────────────────────────────────────────────

export function drawTile(state, playerIdx) {
  if (state.wall.length === 0) {
    return {
      ...state,
      phase: 'finished',
      result: { type:'draw', winner:null, fan:0, points:0, patterns:[] },
      log: [...state.log, '牌已摸完，流局'],
    };
  }

  let wall = [...state.wall];
  let tile = wall.pop();
  let flowers = state.flowers.map(f => [...f]);

  while (tile && isFlower(tile)) {
    flowers[playerIdx] = [...flowers[playerIdx], tile];
    tile = wall.pop();
  }

  if (!tile) {
    return { ...state, wall, phase:'finished', result:{type:'draw',winner:null}, log:[...state.log,'流局'] };
  }

  const hands = state.hands.map((h,i) => i===playerIdx ? sortHand([...h, tile]) : [...h]);
  const canWin = checkWin(hands[playerIdx], state.melds[playerIdx]);

  return {
    ...state,
    wall,
    hands,
    flowers,
    drawnTile: tile,
    currentPlayer: playerIdx,
    phase: 'discard',
    log: [...state.log, `${state.session.players[playerIdx].name} 摸牌`],
    turnCount: (state.turnCount||0) + 1,
    _canSelfDraw: canWin,
    _isKongDraw: false,
  };
}

// ─── Discard ──────────────────────────────────────────────────────────────────

export function doDiscard(state, playerIdx, tileId) {
  const hand = state.hands[playerIdx];
  const tileIdx = hand.findIndex(t => t.id === tileId);
  if (tileIdx === -1) return state;

  const tile = hand[tileIdx];
  const newHand = hand.filter((_,i) => i !== tileIdx);
  const hands = state.hands.map((h,i) => i===playerIdx ? sortHand(newHand) : [...h]);
  const discards = state.discards.map((d,i) => i===playerIdx ? [...d, tile] : [...d]);

  const newState = {
    ...state,
    hands,
    discards,
    drawnTile: null,
    lastDiscard: tile,
    lastDiscarder: playerIdx,
    log: [...state.log, `${state.session.players[playerIdx].name} 打出 ${TILE_DISPLAY[tile.key]||tile.key}`],
    _canSelfDraw: false,
    _isKongDraw: false,
  };

  return gatherClaims(newState, tile, playerIdx);
}

// ─── Kong declarations during own turn ────────────────────────────────────────

// 暗槓 concealed kong — 4 tiles from hand
export function declareAnKong(state, playerIdx, key) {
  const hand = state.hands[playerIdx];
  const matching = hand.filter(t => t.key === key);
  if (matching.length < 4) return state;

  const meld = { type:'kong', subtype:'an', tiles: matching.slice(0,4) };
  const meldIds = new Set(meld.tiles.map(t => t.id));
  const newHand = hand.filter(t => !meldIds.has(t.id));
  const hands = state.hands.map((h,i) => i===playerIdx ? sortHand(newHand) : h);
  const melds = state.melds.map((m,i) => i===playerIdx ? [...m, meld] : m);
  const tileLabel = TILE_DISPLAY[key]||key;

  const newState = {
    ...state,
    hands,
    melds,
    drawnTile: null,
    log: [...state.log, `${state.session.players[playerIdx].name} 暗槓 ${tileLabel}！`],
  };
  // Draw supplement tile
  return drawSupplement(newState, playerIdx);
}

// 加槓 added kong — add 4th tile to existing pong meld
export function declareAddKong(state, playerIdx, tileId) {
  const hand = state.hands[playerIdx];
  const tile = hand.find(t => t.id === tileId);
  if (!tile) return state;

  const meldIdx = state.melds[playerIdx].findIndex(m => m.type==='pong' && m.tiles[0]?.key===tile.key);
  if (meldIdx === -1) return state;

  const existingMeld = state.melds[playerIdx][meldIdx];
  const newMeld = { type:'kong', subtype:'jia', tiles: [...existingMeld.tiles, tile] };
  const newHand = hand.filter(t => t.id !== tileId);
  const hands = state.hands.map((h,i) => i===playerIdx ? sortHand(newHand) : h);
  const newMelds = state.melds[playerIdx].map((m,i) => i===meldIdx ? newMeld : m);
  const melds = state.melds.map((m,i) => i===playerIdx ? newMelds : m);
  const tileLabel = TILE_DISPLAY[tile.key]||tile.key;

  // Note: opponents can rob the kong (搶槓) to win — check that
  // For now we check if any opponent can win on this tile
  const robClaims = [];
  for (let p=0; p<4; p++) {
    if (p===playerIdx) continue;
    const testHand = [...state.hands[p], tile];
    if (checkWin(testHand, state.melds[p])) {
      const { fan, patterns } = calcFan(testHand, state.melds[p], tile, false,
        state.seatWinds[p], state.session.round, state.flowers[p]);
      if (fan >= state.session.minFan) {
        robClaims.push({ player:p, type:'win', tile, fan, patterns, isRobKong:true });
      }
    }
  }

  const newState = {
    ...state,
    hands,
    melds,
    drawnTile: null,
    log: [...state.log, `${state.session.players[playerIdx].name} 加槓 ${tileLabel}！`],
  };

  if (robClaims.length > 0) {
    const humanRob = robClaims.find(c => newState.session.players[c.player].isHuman);
    if (humanRob) {
      return { ...newState, phase:'claiming', claimPending:{ claims:robClaims, tile, discarder:playerIdx, claimingHuman:humanRob.player, isRobKong:true } };
    }
    // AI robs
    const best = robClaims.reduce((a,b)=>b.fan>a.fan?b:a, robClaims[0]);
    return executeWin(newState, best.player, tile, false, best.fan, best.patterns);
  }

  return drawSupplement(newState, playerIdx);
}

// 明槓 open kong — claim discarded tile when you have a pong meld of it
export function declareMingKong(state, playerIdx, tile) {
  const meldIdx = state.melds[playerIdx].findIndex(m => m.type==='pong' && m.tiles[0]?.key===tile.key);
  if (meldIdx === -1) return state;

  const existingMeld = state.melds[playerIdx][meldIdx];
  const newMeld = { type:'kong', subtype:'ming', tiles: [...existingMeld.tiles, tile] };
  const newMelds = state.melds[playerIdx].map((m,i) => i===meldIdx ? newMeld : m);
  const melds = state.melds.map((m,i) => i===playerIdx ? newMelds : m);
  const tileLabel = TILE_DISPLAY[tile.key]||tile.key;

  const newState = {
    ...state,
    melds,
    drawnTile: null,
    log: [...state.log, `${state.session.players[playerIdx].name} 明槓 ${tileLabel}！`],
    claimPending: null,
  };
  return drawSupplement(newState, playerIdx);
}

// ─── Claims ───────────────────────────────────────────────────────────────────

function gatherClaims(state, tile, discarder) {
  const claims = [];

  for (let p = 0; p < 4; p++) {
    if (p === discarder) continue;
    const hand = state.hands[p];

    // Check win 糊
    const testHand = [...hand, tile];
    if (checkWin(testHand, state.melds[p])) {
      const { fan, patterns } = calcFan(testHand, state.melds[p], tile, false,
        state.seatWinds[p], state.session.round, state.flowers[p]);
      if (fan >= state.session.minFan) {
        claims.push({ player:p, type:'win', tile, fan, patterns });
      }
    }

    // Check kong 槓 — player has a pong meld of this tile AND the 4th in hand? No.
    // Open kong from discard: player has existing PONG meld of same tile
    const hasPongMeld = state.melds[p].some(m => m.type==='pong' && m.tiles[0]?.key===tile.key);
    if (hasPongMeld) {
      claims.push({ player:p, type:'kong', tile, tiles:[...state.melds[p].find(m=>m.type==='pong'&&m.tiles[0]?.key===tile.key).tiles, tile] });
    }

    // Check pong 碰 (3rd tile of same, not already having a pong meld)
    const matching = hand.filter(t => t.key === tile.key);
    if (matching.length >= 2 && !hasPongMeld) {
      claims.push({ player:p, type:'pong', tile, tiles:[matching[0], matching[1], tile] });
    }

    // Check chi 上 — only left player (next after discarder)
    if (p === (discarder + 1) % 4) {
      const chiOptions = getChiOptions(hand, tile);
      for (const opt of chiOptions) {
        claims.push({ player:p, type:'chi', tile, tiles:opt });
      }
    }
  }

  if (claims.length === 0) {
    const next = (discarder + 1) % 4;
    return { ...state, currentPlayer:next, phase:'draw', claimPending:null };
  }

  const humanClaims = claims.filter(c => state.session.players[c.player].isHuman);
  if (humanClaims.length > 0) {
    const claimingHuman = humanClaims[0].player;
    return { ...state, phase:'claiming', claimPending:{ claims, tile, discarder, claimingHuman } };
  }

  return resolveClaimsAI(state, claims, tile, discarder);
}

function getChiOptions(hand, tile) {
  const sn = suitNum(tile);
  if (!sn) return [];
  const { suit, num } = sn;
  const suitStr = SUITS[suit];
  const options = [];
  const seqs = [[num-2,num-1,num],[num-1,num,num+1],[num,num+1,num+2]];
  for (const seq of seqs) {
    if (seq.some(n => n<1||n>9)) continue;
    const others = seq.filter(n => n!==num);
    const t1 = hand.find(t => t.key===`${suitStr}${others[0]}`);
    const t2 = hand.find(t => t.key===`${suitStr}${others[1]}` && t!==t1);
    if (t1 && t2) options.push([t1, t2, tile]);
  }
  return options;
}

function suitNum(tile) {
  for (let i=0; i<SUITS.length; i++)
    if (tile.key.startsWith(SUITS[i]) && /\d$/.test(tile.key))
      return { suit:i, num:parseInt(tile.key.slice(-1)) };
  return null;
}

export function resolveClaimsAI(state, claims, tile, discarder) {
  // Win > Kong > Pong > Chi (in priority order)
  const winClaims = claims.filter(c => c.type==='win');
  if (winClaims.length > 0) {
    const winner = winClaims.reduce((a,b) => b.fan>a.fan?b:a, winClaims[0]);
    return executeWin(state, winner.player, tile, false, winner.fan, winner.patterns);
  }

  // Kong (明槓 from discard when holding pong meld)
  const kongClaims = claims.filter(c => c.type==='kong');
  for (const claim of kongClaims) {
    const p = claim.player;
    const strategy = state.session.players[p].strategy || 'balanced';
    // AI kongs if strategy is triplet/dragon/winds, otherwise also if it improves hand
    if (['triplet','dragon','winds','balanced'].includes(strategy)) {
      return declareMingKong(state, p, tile);
    }
  }

  const pongClaims = claims.filter(c => c.type==='pong');
  for (const claim of pongClaims) {
    const p = claim.player;
    const strategy = state.session.players[p].strategy || 'balanced';
    if (aiWantsPong(tile, state.hands[p], state.melds[p], strategy,
        state.seatWinds[p], state.session.round, state.session.minFan, state)) {
      return executePong(state, p, claim.tiles);
    }
  }

  const chiClaims = claims.filter(c => c.type==='chi');
  for (const claim of chiClaims) {
    const p = claim.player;
    const strategy = state.session.players[p].strategy || 'balanced';
    if (aiWantsChi(tile, state.hands[p], state.melds[p], strategy, state)) {
      return executeChi(state, p, claim.tiles, tile);
    }
  }

  const next = (discarder + 1) % 4;
  return { ...state, currentPlayer:next, phase:'draw', claimPending:null };
}

// ─── Meld Execution ───────────────────────────────────────────────────────────

function executePong(state, p, meldTiles) {
  const meld = { type:'pong', tiles:sortHand(meldTiles) };
  const meldIds = new Set(meldTiles.map(t => t.id));
  const newHand = state.hands[p].filter(t => !meldIds.has(t.id));
  const hands = state.hands.map((h,i) => i===p ? sortHand(newHand) : h);
  const melds = state.melds.map((m,i) => i===p ? [...m, meld] : m);
  const tileLabel = TILE_DISPLAY[meld.tiles[0]?.key]||meld.tiles[0]?.key||'';
  return {
    ...state, hands, melds, currentPlayer:p, phase:'discard', claimPending:null,
    log:[...state.log, `${state.session.players[p].name} 碰 ${tileLabel}！`],
  };
}

function executeChi(state, p, meldTiles, claimedTile) {
  const sortedMeld = sortHand(meldTiles);
  const meld = { type:'chi', tiles:sortedMeld };
  const handTileIds = new Set(meldTiles.filter(t => t.id!==claimedTile.id).map(t => t.id));
  const newHand = state.hands[p].filter(t => !handTileIds.has(t.id));
  const hands = state.hands.map((h,i) => i===p ? sortHand(newHand) : h);
  const melds = state.melds.map((m,i) => i===p ? [...m, meld] : m);
  const chiStr = sortedMeld.map(t => TILE_DISPLAY[t.key]).join('');
  return {
    ...state, hands, melds, currentPlayer:p, phase:'discard', claimPending:null,
    log:[...state.log, `${state.session.players[p].name} 上 ${chiStr}！`],
  };
}

function executeWin(state, winner, tile, isSelfDraw, fan, patterns) {
  const points = fanToPoints(fan);
  const scores = [...state.session.scores];
  const loser = isSelfDraw ? null : state.lastDiscarder;

  if (isSelfDraw) {
    for (let p=0; p<4; p++) { if (p!==winner) scores[p] -= points; }
    scores[winner] += points * 3;
  } else {
    scores[loser] -= points * 3;
    scores[winner] += points * 3;
  }

  const newSession = { ...state.session, scores };
  return {
    ...state,
    session: newSession,
    phase: 'finished',
    claimPending: null,
    result: { type:'win', winner, fan, points, patterns, isSelfDraw, loser },
    log: [...state.log, `🀄 ${state.session.players[winner].name} 胡牌！${fan>=99?'爆棚':fan+'番'} ${points}點`],
  };
}

// ─── Human Claim Handlers ─────────────────────────────────────────────────────

export function playerClaimWin(state) {
  const { claims, tile, claimingHuman } = state.claimPending;
  const winClaim = claims.find(c => c.player===claimingHuman && c.type==='win');
  if (!winClaim) return state;
  return executeWin(state, claimingHuman, tile, false, winClaim.fan, winClaim.patterns);
}

export function playerPong(state) {
  const { claims, tile, claimingHuman } = state.claimPending;
  const pongClaim = claims.find(c => c.player===claimingHuman && c.type==='pong');
  if (!pongClaim) return state;
  return executePong(state, claimingHuman, pongClaim.tiles);
}

export function playerKongFromDiscard(state) {
  const { claims, tile, claimingHuman } = state.claimPending;
  const kongClaim = claims.find(c => c.player===claimingHuman && c.type==='kong');
  if (!kongClaim) return state;
  return declareMingKong(state, claimingHuman, tile);
}

export function playerChi(state, chiTiles) {
  const { tile, claimingHuman } = state.claimPending;
  return executeChi(state, claimingHuman, chiTiles, tile);
}

export function playerPass(state) {
  const { claims, tile, discarder, claimingHuman } = state.claimPending;
  const aiClaims = claims.filter(c => c.player!==claimingHuman);
  if (aiClaims.length === 0) {
    const next = (discarder + 1) % 4;
    return { ...state, currentPlayer:next, phase:'draw', claimPending:null };
  }
  return resolveClaimsAI({ ...state, claimPending:null }, aiClaims, tile, discarder);
}

// ─── AI Turn ──────────────────────────────────────────────────────────────────

export function aiTurn(state) {
  const p = state.currentPlayer;
  const player = state.session.players[p];
  if (player.isHuman) return state;

  if (state.phase === 'draw') {
    return drawTile(state, p);
  }

  if (state.phase === 'discard') {
    // Self-draw win check
    if (state._canSelfDraw) {
      const { fan, patterns } = calcFan(state.hands[p], state.melds[p], state.drawnTile, true,
        state.seatWinds[p], state.session.round, state.flowers[p]);
      if (fan >= state.session.minFan) {
        return executeWin(state, p, state.drawnTile, true, fan, patterns);
      }
    }

    // 暗槓 concealed kong check — if we have 4 of any tile
    const hand = state.hands[p];
    const cnt = {};
    for (const t of hand) cnt[t.key] = (cnt[t.key]||0)+1;
    for (const [key, count] of Object.entries(cnt)) {
      if (count >= 4) {
        const strategy = player.strategy || 'balanced';
        if (['triplet','dragon','winds','balanced','value'].includes(strategy)) {
          return declareAnKong(state, p, key);
        }
      }
    }

    // 加槓 added kong check — have a pong meld + 4th tile in hand
    for (const meld of state.melds[p]) {
      if (meld.type === 'pong') {
        const extraTile = hand.find(t => t.key === meld.tiles[0]?.key);
        if (extraTile) {
          const strategy = player.strategy || 'balanced';
          if (['triplet','dragon','winds','balanced','value'].includes(strategy)) {
            return declareAddKong(state, p, extraTile.id);
          }
        }
      }
    }

    const strategy = player.strategy || 'balanced';
    const discard = aiDiscard(
      state.hands[p], state.melds[p], strategy,
      state.seatWinds[p], state.session.round, state.session.minFan,
      state, state.turnCount || 0
    );
    return doDiscard(state, p, discard.id);
  }

  return state;
}

// ─── Session Advance ──────────────────────────────────────────────────────────

export function advanceSession(state) {
  const { result, session } = state;
  let { dealer, round, handsPlayed, scores } = session;

  if (result?.type === 'win') {
    if (result.winner !== dealer) {
      dealer = (dealer + 1) % 4;
      if (dealer === 0) round = (round + 1) % 4;
    }
  }
  handsPlayed++;
  return { ...session, dealer, round, handsPlayed, scores };
}

// ─── Simulation ───────────────────────────────────────────────────────────────

export function runOneGame(players, minFan = 3) {
  let session = createSession(players, minFan);
  const results = [];

  for (let handNum = 0; handNum < 16; handNum++) {
    let state = startHand(session);
    let safety = 0;

    while (state.phase !== 'finished' && safety < 600) {
      safety++;

      if (state.phase === 'draw') {
        state = drawTile(state, state.currentPlayer);
        continue;
      }

      if (state.phase === 'discard') {
        const p = state.currentPlayer;
        const strategy = players[p].strategy || 'balanced';

        // Self-draw win
        if (state._canSelfDraw) {
          const { fan, patterns } = calcFan(state.hands[p], state.melds[p], state.drawnTile, true,
            state.seatWinds[p], session.round, state.flowers[p]);
          if (fan >= minFan) {
            const pts = fanToPoints(fan);
            const scores = [...session.scores];
            for (let i=0; i<4; i++) { if (i!==p) scores[i]-=pts; }
            scores[p] += pts*3;
            session = { ...session, scores };
            state = { ...state, session, phase:'finished',
              result:{type:'win',winner:p,fan,patterns,isSelfDraw:true,loser:null,points:pts} };
            break;
          }
        }

        // 暗槓
        const cnt = {};
        for (const t of state.hands[p]) cnt[t.key]=(cnt[t.key]||0)+1;
        let konged = false;
        for (const [key, count] of Object.entries(cnt)) {
          if (count>=4 && ['triplet','dragon','winds','balanced','value'].includes(strategy)) {
            state = declareAnKong(state, p, key);
            konged = true; break;
          }
        }
        if (konged) continue;

        // 加槓
        let addKonged = false;
        for (const meld of state.melds[p]) {
          if (meld.type==='pong') {
            const extra = state.hands[p].find(t=>t.key===meld.tiles[0]?.key);
            if (extra && ['triplet','dragon','winds','balanced','value'].includes(strategy)) {
              state = declareAddKong(state, p, extra.id);
              addKonged = true; break;
            }
          }
        }
        if (addKonged) continue;

        const discard = aiDiscard(state.hands[p], state.melds[p], strategy,
          state.seatWinds[p], session.round, session.minFan, state, state.turnCount||0);
        state = doDiscard(state, p, discard.id);
        if (state.phase==='finished') { session={...session,scores:[...state.session.scores]}; }
        continue;
      }

      if (state.phase === 'claiming') {
        if (!state.claimPending) {
          state = { ...state, phase:'draw', currentPlayer:(state.lastDiscarder+1)%4 };
          continue;
        }
        const { claims, tile, discarder } = state.claimPending;
        state = resolveClaimsAI({ ...state, claimPending:null }, claims, tile, discarder);
        if (state.phase==='finished' && state.result?.type==='win') {
          session = { ...session, scores:[...state.session.scores] };
        }
        continue;
      }
    }

    if (state.phase !== 'finished') {
      state = { ...state, phase:'finished', result:{type:'draw',winner:null} };
    }

    results.push({ hand:handNum, dealer:session.dealer, result:state.result, scores:[...session.scores] });

    const ns = advanceSession(state);
    if (ns.round>=4 || ns.handsPlayed>=16) break;
    session = ns;
  }

  return { finalScores:session.scores, hands:results };
}
