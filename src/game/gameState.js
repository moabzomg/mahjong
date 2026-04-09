// ============================================================
// GAME STATE MANAGER
// ============================================================
import {
  createFullDeck, shuffleDeck, SUITS, sortHand,
  checkWin, canChow, canPung, canKong, tilesEqual, createTile
} from './engine.js';
import { makeAIDecision, makeClaimDecision, AI_STRATEGIES } from './ai.js';

export const PLAYER_NAMES = ['You', 'East AI', 'South AI', 'West AI'];
export const WIND_NAMES = ['East', 'South', 'West', 'North'];

export function createInitialState(aiStrategies = [1, 2, 3]) {
  const deck = shuffleDeck(createFullDeck());
  
  const players = [
    { name: 'You', isHuman: true, wind: 0, strategy: null, score: 0 },
    { name: 'East AI', isHuman: false, wind: 1, strategy: AI_STRATEGIES[aiStrategies[0]], score: 0 },
    { name: 'South AI', isHuman: false, wind: 2, strategy: AI_STRATEGIES[aiStrategies[1]], score: 0 },
    { name: 'West AI', isHuman: false, wind: 3, strategy: AI_STRATEGIES[aiStrategies[2]], score: 0 },
  ].map(p => ({ ...p, hand: [], openMelds: [], flowers: [] }));
  
  // Deal 13 tiles to each player
  let wallIndex = 0;
  for (let i = 0; i < 13; i++) {
    for (let p = 0; p < 4; p++) {
      const tile = deck[wallIndex++];
      if (tile.suit === SUITS.FLOWER) {
        players[p].flowers.push(tile);
        // Replace with next tile
        const replacement = deck[wallIndex++];
        players[p].hand.push(replacement);
      } else {
        players[p].hand.push(tile);
      }
    }
  }
  
  // Sort hands
  players.forEach(p => { p.hand = sortHand(p.hand); });
  
  return {
    phase: 'playing', // menu, playing, claiming, won, draw
    players,
    wall: deck,
    wallIndex,
    currentPlayer: 0,
    discardPile: [],
    lastDiscard: null,
    lastDiscardBy: null,
    currentPlayerNeedsDraw: true,
    round: 1,
    logs: ['Game started! East player (You) goes first.'],
    winner: null,
    winResult: null,
    claimWindow: null, // { tile, discardedBy, claims: [] }
    selectedTile: null,
    pendingAction: null, // 'discard', 'claim'
  };
}

export function addLog(state, msg) {
  return { ...state, logs: [msg, ...state.logs].slice(0, 50) };
}

export function drawTile(state, playerIndex) {
  if (state.wallIndex >= state.wall.length - 14) {
    return { ...state, phase: 'draw', logs: ['Wall exhausted — game is a draw!', ...state.logs] };
  }
  
  const tile = state.wall[state.wallIndex];
  let newWallIndex = state.wallIndex + 1;
  let newState = { ...state, wallIndex: newWallIndex };
  
  const player = newState.players[playerIndex];
  
  // Flower replacement
  if (tile.suit === SUITS.FLOWER) {
    const newPlayers = [...newState.players];
    newPlayers[playerIndex] = {
      ...player,
      flowers: [...player.flowers, tile],
    };
    newState = { ...newState, players: newPlayers, wallIndex: newWallIndex };
    return drawTile(newState, playerIndex);
  }
  
  const newPlayers = [...newState.players];
  newPlayers[playerIndex] = {
    ...player,
    hand: sortHand([...player.hand, tile]),
  };
  newState = { ...newState, players: newPlayers, currentPlayerNeedsDraw: false };
  
  // Check for self-draw win
  const win = checkWin(newPlayers[playerIndex].hand, newPlayers[playerIndex].openMelds);
  if (win && playerIndex === 0) {
    // Human can choose to declare or not - handled in UI
  }
  
  return addLog(newState, `${newState.players[playerIndex].name} draws a tile.`);
}

export function discardTile(state, playerIndex, tile) {
  const player = state.players[playerIndex];
  const newHand = player.hand.filter(t => t !== tile);
  
  const newPlayers = [...state.players];
  newPlayers[playerIndex] = { ...player, hand: newHand };
  
  let newState = {
    ...state,
    players: newPlayers,
    discardPile: [...state.discardPile, tile],
    lastDiscard: tile,
    lastDiscardBy: playerIndex,
    selectedTile: null,
  };
  
  newState = addLog(newState, `${state.players[playerIndex].name} discards ${getTileLabel(tile)}.`);
  return newState;
}

export function claimTile(state, playerIndex, claimType, tiles) {
  const player = state.players[playerIndex];
  const tile = state.lastDiscard;
  
  // Remove claimed tiles from hand and add the open meld
  let usedFromHand = [];
  if (claimType === 'pung') {
    let count = 0;
    usedFromHand = player.hand.filter(t => {
      if (count < 2 && tilesEqual(t, tile)) { count++; return true; }
      return false;
    });
  } else if (claimType === 'chow') {
    const combo = tiles;
    usedFromHand = combo
      .filter(v => v !== tile.value)
      .map(v => player.hand.find(t => t.suit === tile.suit && t.value === v))
      .filter(Boolean);
  } else if (claimType === 'kong') {
    let count = 0;
    usedFromHand = player.hand.filter(t => {
      if (count < 3 && tilesEqual(t, tile)) { count++; return true; }
      return false;
    });
  }
  
  const newHand = player.hand.filter(t => !usedFromHand.includes(t));
  const meldTiles = claimType === 'chow'
    ? [tile, ...usedFromHand].sort((a, b) => a.value - b.value)
    : [tile, ...usedFromHand];
  
  const newMelds = [...player.openMelds, { type: claimType, tiles: meldTiles }];
  
  const newPlayers = [...state.players];
  newPlayers[playerIndex] = { ...player, hand: sortHand(newHand), openMelds: newMelds };
  
  return addLog({
    ...state,
    players: newPlayers,
    currentPlayer: playerIndex,
    currentPlayerNeedsDraw: false,
    claimWindow: null,
  }, `${state.players[playerIndex].name} claims ${claimType.toUpperCase()}!`);
}

function getTileLabel(tile) {
  if (!tile) return '?';
  if (tile.suit === SUITS.BAMBOO) return `${tile.value}B`;
  if (tile.suit === SUITS.CIRCLE) return `${tile.value}C`;
  if (tile.suit === SUITS.CHARACTER) return `${tile.value}Ch`;
  if (tile.suit === SUITS.WIND) return ['East','South','West','North'][tile.value] + ' Wind';
  if (tile.suit === SUITS.DRAGON) return ['Red','Green','White'][tile.value] + ' Dragon';
  return 'Flower';
}

// Run AI turns automatically
export function runAITurn(state) {
  const playerIndex = state.currentPlayer;
  const player = state.players[playerIndex];
  if (player.isHuman) return state;
  
  let newState = state;
  
  // Draw if needed
  if (newState.currentPlayerNeedsDraw) {
    newState = drawTile(newState, playerIndex);
    if (newState.phase === 'draw') return newState;
  }
  
  const currentPlayer = newState.players[playerIndex];
  const hand = currentPlayer.hand;
  
  // Check self-draw win
  const win = checkWin(hand, currentPlayer.openMelds);
  if (win) {
    newState = addLog(newState, `🎉 ${currentPlayer.name} wins by self-draw!`);
    return {
      ...newState,
      phase: 'won',
      winner: playerIndex,
      winResult: win,
    };
  }
  
  // Discard a tile using AI strategy
  const discard = getBestDiscard(hand, currentPlayer.openMelds, currentPlayer.strategy);
  
  newState = discardTile(newState, playerIndex, discard);
  
  // Move to next player
  const nextPlayer = (playerIndex + 1) % 4;
  newState = {
    ...newState,
    currentPlayer: nextPlayer,
    currentPlayerNeedsDraw: true,
  };
  
  return newState;
}

function getBestDiscard(hand, openMelds, strategy) {
  // Use strategy to pick tile to discard
  if (!strategy) return hand[hand.length - 1];
  
  const { SUITS: S } = { SUITS };
  
  // Calculate usefulness scores
  const scores = hand.map(tile => {
    let score = 0;
    const matching = hand.filter(t => tilesEqual(t, tile));
    score += matching.length * 3;
    
    if ([SUITS.BAMBOO, SUITS.CIRCLE, SUITS.CHARACTER].includes(tile.suit)) {
      const adj = hand.filter(t => t.suit === tile.suit && Math.abs(t.value - tile.value) <= 2);
      score += adj.length * 2;
    }
    
    if (strategy.name === 'Aggressive' && (tile.suit === SUITS.WIND || tile.suit === SUITS.DRAGON)) {
      score += matching.length >= 2 ? 5 : -2;
    }
    
    if (strategy.name === 'Chaos') {
      score += (Math.random() - 0.5) * 4;
    }
    
    return { tile, score };
  });
  
  scores.sort((a, b) => a.score - b.score);
  return scores[0].tile;
}

// Check what claims are available to other players for a discard
export function getAvailableClaims(state, discardedTile, discardedBy) {
  const claims = [];
  
  for (let p = 0; p < 4; p++) {
    if (p === discardedBy) continue;
    
    const player = state.players[p];
    const hand = player.hand;
    const openMelds = player.openMelds;
    
    const handWithTile = [...hand, discardedTile];
    const win = checkWin(handWithTile, openMelds);
    
    const playerClaims = [];
    if (win) playerClaims.push('win');
    if (canKong(hand, discardedTile)) playerClaims.push('kong');
    if (canPung(hand, discardedTile)) playerClaims.push('pung');
    
    // Only player to left of discarder can chow
    const nextPlayer = (discardedBy + 1) % 4;
    if (p === nextPlayer && canChow(hand, discardedTile).length > 0) {
      playerClaims.push('chow');
    }
    
    if (playerClaims.length > 0) {
      claims.push({ playerIndex: p, claims: playerClaims });
    }
  }
  
  return claims;
}
