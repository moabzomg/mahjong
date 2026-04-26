import {
  buildWall, isFlower, sortHand, checkWin, calcFan, fanToPoints,
  tileKey, SUITS, WINDS, analyzeHand, TILE_DISPLAY
} from './tiles.js';
import { aiDiscard, aiWantsPong, aiWantsChi } from '../ai/strategies.js';

// ─── Session Init ─────────────────────────────────────────────────────────────

export function createSession(players, minFan = 3) {
  return {
    players,          // [{name, isHuman, strategy}]
    scores: players.map(() => 0),
    dealer: 0,
    round: 0,         // 0=東 1=南 2=西 3=北
    handsPlayed: 0,
    minFan,
  };
}

// ─── Deal Hand ────────────────────────────────────────────────────────────────

export function startHand(session) {
  const wall = buildWall();
  const deadWall = wall.splice(wall.length - 14); // Keep 14 for supplements
  const hands = [[], [], [], []];

  // Deal 13 each
  for (let round = 0; round < 13; round++) {
    for (let p = 0; p < 4; p++) {
      hands[p].push(wall.pop());
    }
  }
  // Dealer gets 14th
  hands[session.dealer].push(wall.pop());

  // Auto-補花: replace flower tiles
  const flowers = [[], [], [], []];
  let supplementIdx = 0;

  for (let p = 0; p < 4; p++) {
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 0; i < hands[p].length; i++) {
        if (isFlower(hands[p][i])) {
          flowers[p].push(hands[p][i]);
          hands[p].splice(i, 1);
          // Draw supplement
          const supp = deadWall[supplementIdx++] || wall.pop();
          if (supp) { hands[p].push(supp); changed = true; }
          i--;
        }
      }
    }
    hands[p] = sortHand(hands[p]);
  }

  const seatWinds = [0, 1, 2, 3].map(i => (session.dealer + i) % 4);

  return {
    session,
    wall,
    deadWall: deadWall.slice(supplementIdx),
    hands,
    melds: [[], [], [], []],
    discards: [[], [], [], []],
    flowers,
    seatWinds,
    currentPlayer: session.dealer,
    drawnTile: hands[session.dealer][hands[session.dealer].length - 1], // last tile = drawn
    phase: 'discard',  // discard | draw | claiming | finished
    claimPending: null,
    lastDiscard: null,
    lastDiscarder: null,
    log: [`局開始 — 莊家：${session.players[session.dealer].name}`],
    result: null,
  };
}

// ─── Draw ─────────────────────────────────────────────────────────────────────

export function drawTile(state, playerIdx) {
  if (state.wall.length === 0) {
    // 流局
    return {
      ...state,
      phase: 'finished',
      result: { type: 'draw', winner: null, fan: 0, points: 0, patterns: [] },
      log: [...state.log, '牌已摸完，流局'],
    };
  }

  let wall = [...state.wall];
  let tile = wall.pop();
  let flowers = state.flowers.map(f => [...f]);

  // Skip flowers
  while (tile && isFlower(tile)) {
    flowers[playerIdx] = [...flowers[playerIdx], tile];
    tile = wall.pop();
  }

  if (!tile) {
    return { ...state, wall, phase: 'finished', result: { type: 'draw', winner: null }, log: [...state.log, '流局'] };
  }

  const hands = state.hands.map((h, i) => i === playerIdx ? sortHand([...h, tile]) : [...h]);

  // Check self-draw win
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
    turnCount: (state.turnCount || 0) + 1,
    _canSelfDraw: canWin,
  };
}

// ─── Discard ──────────────────────────────────────────────────────────────────

export function doDiscard(state, playerIdx, tileId) {
  const hand = state.hands[playerIdx];
  const tileIdx = hand.findIndex(t => t.id === tileId);
  if (tileIdx === -1) return state;

  const tile = hand[tileIdx];
  const newHand = hand.filter((_, i) => i !== tileIdx);
  const hands = state.hands.map((h, i) => i === playerIdx ? sortHand(newHand) : [...h]);
  const discards = state.discards.map((d, i) => i === playerIdx ? [...d, tile] : [...d]);

  const newState = {
    ...state,
    hands,
    discards,
    drawnTile: null,
    lastDiscard: tile,
    lastDiscarder: playerIdx,
    log: [...state.log, `${state.session.players[playerIdx].name} 打出 ${TILE_DISPLAY[tile.key]||tile.key}`],
    _canSelfDraw: false,
  };

  return gatherClaims(newState, tile, playerIdx);
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
        claims.push({ player: p, type: 'win', tile, fan, patterns });
      }
    }

    // Check pong 碰 (3rd tile of same)
    const matching = hand.filter(t => t.key === tile.key);
    if (matching.length >= 2) {
      claims.push({ player: p, type: 'pong', tile, tiles: [matching[0], matching[1], tile] });
    }

    // Check chi 上 — only left player (discarder + 1) % 4
    if (p === (discarder + 1) % 4) {
      const chiOptions = getChiOptions(hand, tile);
      for (const opt of chiOptions) {
        claims.push({ player: p, type: 'chi', tile, tiles: opt });
      }
    }
  }

  if (claims.length === 0) {
    // Advance to next player's draw
    const next = (discarder + 1) % 4;
    return { ...state, currentPlayer: next, phase: 'draw', claimPending: null };
  }

  // Check if any human has a claim
  const humanClaims = claims.filter(c => state.session.players[c.player].isHuman);

  if (humanClaims.length > 0) {
    // Human must decide
    const claimingHuman = humanClaims[0].player;
    return {
      ...state,
      phase: 'claiming',
      claimPending: { claims, tile, discarder, claimingHuman },
    };
  }

  // All AI — auto-resolve
  return resolveClaimsAI(state, claims, tile, discarder);
}

function getChiOptions(hand, tile) {
  const sn = suitNum(tile);
  if (!sn) return [];
  const options = [];
  const { suit, num } = sn;
  const suitStr = SUITS[suit];
  // Three possible chi sequences containing this tile
  const seqs = [
    [num-2, num-1, num],
    [num-1, num, num+1],
    [num, num+1, num+2],
  ];
  for (const seq of seqs) {
    if (seq.some(n => n < 1 || n > 9)) continue;
    const otherNums = seq.filter(n => n !== num);
    const t1 = hand.find(t => t.key === `${suitStr}${otherNums[0]}`);
    const t2 = hand.find(t => t.key === `${suitStr}${otherNums[1]}` && t !== t1);
    if (t1 && t2) options.push([t1, t2, tile]);
  }
  return options;
}

function suitNum(tile) {
  for (let i = 0; i < SUITS.length; i++) {
    if (tile.key.startsWith(SUITS[i]) && /\d$/.test(tile.key))
      return { suit: i, num: parseInt(tile.key.slice(-1)) };
  }
  return null;
}

export function resolveClaimsAI(state, claims, tile, discarder) {
  // Priority: win > pong > chi
  const winClaims = claims.filter(c => c.type === 'win');
  if (winClaims.length > 0) {
    // Winner with highest fan
    const winner = winClaims.reduce((best, c) => (c.fan > best.fan ? c : best), winClaims[0]);
    return executeWin(state, winner.player, tile, false, winner.fan, winner.patterns);
  }

  const pongClaims = claims.filter(c => c.type === 'pong');
  for (const claim of pongClaims) {
    const p = claim.player;
    const strategy = state.session.players[p].strategy || 'nash';
    if (aiWantsPong(tile, state.hands[p], state.melds[p], strategy,
        state.seatWinds[p], state.session.round, state.session.minFan, state)) {
      return executePong(state, p, claim.tiles);
    }
  }

  const chiClaims = claims.filter(c => c.type === 'chi');
  for (const claim of chiClaims) {
    const p = claim.player;
    const strategy = state.session.players[p].strategy || 'nash';
    if (aiWantsChi(tile, state.hands[p], state.melds[p], strategy, state)) {
      return executeChi(state, p, claim.tiles, tile);
    }
  }

  // No claims taken
  const next = (discarder + 1) % 4;
  return { ...state, currentPlayer: next, phase: 'draw', claimPending: null };
}

// ─── Meld Execution ───────────────────────────────────────────────────────────

function executePong(state, p, meldTiles) {
  const meld = { type: 'pong', tiles: sortHand(meldTiles) };
  const meldKeys = meldTiles.map(t => t.id);
  const newHand = state.hands[p].filter(t => !meldKeys.includes(t.id));
  const hands = state.hands.map((h, i) => i === p ? sortHand(newHand) : h);
  const melds = state.melds.map((m, i) => i === p ? [...m, meld] : m);
  return {
    ...state,
    hands,
    melds,
    currentPlayer: p,
    phase: 'discard',
    claimPending: null,
    log: [...state.log, `${state.session.players[p].name} 碰 ${TILE_DISPLAY[meld.tiles[0]?.key]||meld.tiles[0]?.key||''}！`],
  };
}

function executeChi(state, p, meldTiles, claimedTile) {
  // meldTiles includes the claimed discard tile + 2 hand tiles
  const sortedMeld = sortHand(meldTiles);
  const meld = { type: 'chi', tiles: sortedMeld };
  // Remove only the 2 tiles that come from hand (not the claimed discard tile)
  const handTileIds = new Set(
    meldTiles.filter(t => t.id !== claimedTile.id).map(t => t.id)
  );
  const newHand = state.hands[p].filter(t => !handTileIds.has(t.id));
  const hands = state.hands.map((h, i) => i === p ? sortHand(newHand) : h);
  const melds = state.melds.map((m, i) => i === p ? [...m, meld] : m);
  const chiStr = sortedMeld.map(t => TILE_DISPLAY[t.key]||t.key).join('');
  return {
    ...state,
    hands,
    melds,
    currentPlayer: p,
    phase: 'discard',
    claimPending: null,
    log: [...state.log, `${state.session.players[p].name} 上 ${chiStr}！`],
  };
}

function executeWin(state, winner, tile, isSelfDraw, fan, patterns) {
  const winnerHand = isSelfDraw ? state.hands[winner] : [...state.hands[winner], tile];
  const points = fanToPoints(fan);

  // Score changes
  const scores = [...state.session.scores];
  const loser = isSelfDraw ? null : state.lastDiscarder;

  if (isSelfDraw) {
    // Everyone pays
    for (let p = 0; p < 4; p++) {
      if (p !== winner) scores[p] -= points;
    }
    scores[winner] += points * 3;
  } else {
    scores[loser] -= points * 3;
    scores[winner] += points * 3;
  }

  const newSession = { ...state.session, scores };
  const winType = isSelfDraw ? '自摸' : (winner === state.session.dealer ? '莊家糊牌' : '糊牌');

  return {
    ...state,
    session: newSession,
    phase: 'finished',
    claimPending: null,
    result: {
      type: 'win',
      winner,
      fan,
      points,
      patterns,
      isSelfDraw,
      loser,
      winType,
    },
    log: [...state.log, `🀄 ${state.session.players[winner].name} 胡牌！${fan}番 ${points}點`],
  };
}

// ─── Human Claim Handlers ─────────────────────────────────────────────────────

export function playerClaimWin(state) {
  const { claims, tile, discarder, claimingHuman } = state.claimPending;
  const winClaim = claims.find(c => c.player === claimingHuman && c.type === 'win');
  if (!winClaim) return state;
  return executeWin(state, claimingHuman, tile, false, winClaim.fan, winClaim.patterns);
}

export function playerPong(state) {
  const { claims, tile, claimingHuman } = state.claimPending;
  const pongClaim = claims.find(c => c.player === claimingHuman && c.type === 'pong');
  if (!pongClaim) return state;
  return executePong(state, claimingHuman, pongClaim.tiles);
}

export function playerChi(state, chiTiles) {
  const { tile, claimingHuman } = state.claimPending;
  return executeChi(state, claimingHuman, chiTiles, tile);
}

export function playerPass(state) {
  const { claims, tile, discarder, claimingHuman } = state.claimPending;
  // Remove human claims and re-resolve with AI only
  const aiClaims = claims.filter(c => c.player !== claimingHuman);
  if (aiClaims.length === 0) {
    const next = (discarder + 1) % 4;
    return { ...state, currentPlayer: next, phase: 'draw', claimPending: null };
  }
  return resolveClaimsAI({ ...state, claimPending: null }, aiClaims, tile, discarder);
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
    // Check self-draw win first
    if (state._canSelfDraw) {
      const hand = state.hands[p];
      const testHand = [...hand];
      const { fan, patterns } = calcFan(testHand, state.melds[p], state.drawnTile, true,
        state.seatWinds[p], state.session.round, state.flowers[p]);
      if (fan >= state.session.minFan) {
        return executeWin(state, p, state.drawnTile, true, fan, patterns);
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
    const winner = result.winner;
    if (winner === dealer) {
      // 冧莊: dealer stays
    } else {
      // 過莊: rotate dealer
      dealer = (dealer + 1) % 4;
      if (dealer === 0) round = (round + 1) % 4;
    }
  } else {
    // 流局: dealer stays
  }

  handsPlayed++;

  const newSession = { ...session, dealer, round, handsPlayed, scores };
  return newSession;
}

// ─── Simulation ───────────────────────────────────────────────────────────────

export function runOneGame(players, minFan = 3) {
  let session = createSession(players, minFan);
  let results = [];

  for (let hand = 0; hand < 16; hand++) { // max 16 hands (4 rounds * 4 winds roughly)
    let state = startHand(session);
    let safety = 0;

    while (state.phase !== 'finished' && safety < 400) {
      safety++;

      if (state.phase === 'draw') {
        state = drawTile(state, state.currentPlayer);
        continue;
      }

      if (state.phase === 'discard') {
        const p = state.currentPlayer;
        // Check self-draw
        if (state._canSelfDraw) {
          const hand14 = state.hands[p];
          const { fan, patterns } = calcFan(hand14, state.melds[p], state.drawnTile, true,
            state.seatWinds[p], session.round, state.flowers[p]);
          if (fan >= minFan) {
            state = { ...state, phase: 'finished', result: { type:'win', winner:p, fan, patterns, isSelfDraw:true, loser:null } };
            // Update scores
            const pts = fanToPoints(fan);
            const scores = [...session.scores];
            for (let i = 0; i < 4; i++) { if (i !== p) scores[i] -= pts; }
            scores[p] += pts * 3;
            session = { ...session, scores };
            state = { ...state, session };
            break;
          }
        }
        const strategy = players[p].strategy || 'balanced';
        const discard = aiDiscard(
          state.hands[p], state.melds[p], strategy,
          state.seatWinds[p], session.round, session.minFan,
          state, state.turnCount || 0
        );
        state = doDiscard(state, p, discard.id);
        continue;
      }

      if (state.phase === 'claiming') {
        if (!state.claimPending) {
          state = { ...state, phase: 'draw', currentPlayer: (state.lastDiscarder + 1) % 4 };
          continue;
        }
        const { claims, tile, discarder } = state.claimPending;
        state = resolveClaimsAI({ ...state, claimPending: null }, claims, tile, discarder);
        // After resolving, update session scores if win happened
        if (state.phase === 'finished' && state.result?.type === 'win') {
          session = { ...session, scores: [...state.session.scores] };
        }
        continue;
      }
    }

    if (state.phase !== 'finished') {
      state = { ...state, phase: 'finished', result: { type: 'draw', winner: null } };
    }

    results.push({
      hand,
      dealer: session.dealer,
      result: state.result,
      scores: [...session.scores],
    });

    // Check if 4 rounds done
    const newSession = advanceSession(state);
    if (newSession.round > session.round && newSession.round >= 4) break;
    session = newSession;
    if (session.handsPlayed >= 16) break;
  }

  return { finalScores: session.scores, hands: results };
}
