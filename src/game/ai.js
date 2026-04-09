// ============================================================
// AI STRATEGIES FOR MAHJONG
// ============================================================
import {
  SUITS, tilesEqual, tileKey, sortHand, checkWin,
  canChow, canPung, canKong, getTenpaiTiles, findAllMelds, isHonorOrTerminal
} from './engine.js';

// Evaluate how "useful" a tile is to a hand
function tileUsefulness(tile, hand) {
  let score = 0;
  
  // Already have pairs/pungs
  const matching = hand.filter(t => tilesEqual(t, tile));
  score += matching.length * 3;
  
  // Suited adjacency
  if ([SUITS.BAMBOO, SUITS.CIRCLE, SUITS.CHARACTER].includes(tile.suit)) {
    const adj = hand.filter(t => t.suit === tile.suit && Math.abs(t.value - tile.value) <= 2);
    score += adj.length * 2;
  }
  
  // Dragons and winds are honor tiles - valuable when you have pairs
  if (tile.suit === SUITS.DRAGON || tile.suit === SUITS.WIND) {
    score += matching.length >= 1 ? 4 : -1;
  }
  
  return score;
}

// Find isolated tiles (no useful neighbors)
function getIsolatedTiles(hand) {
  return hand
    .filter(t => t.suit !== SUITS.FLOWER)
    .map(tile => ({ tile, usefulness: tileUsefulness(tile, hand) }))
    .sort((a, b) => a.usefulness - b.usefulness);
}

// Find tile to discard
function chooseTileToDiscard(hand, strategy) {
  const isolated = getIsolatedTiles(hand);
  
  switch (strategy.name) {
    case 'Aggressive': {
      // Discard safest tile (avoid terminals and honors that could help pung)
      // Focus on building sequences fast
      const sorted = isolated.map(({ tile, usefulness }) => ({
        tile,
        score: usefulness - (isHonorOrTerminal(tile) ? 1 : 0),
      })).sort((a, b) => a.score - b.score);
      return sorted[0]?.tile || hand[hand.length - 1];
    }
    case 'Defensive': {
      // Discard tiles that are least dangerous to opponents
      // Prefer discarding tiles already out (safe tiles)
      const safe = isolated.filter(({ tile }) => tile.suit !== SUITS.DRAGON && tile.suit !== SUITS.WIND);
      if (safe.length > 0) return safe[0].tile;
      return isolated[0]?.tile || hand[hand.length - 1];
    }
    case 'Balanced': {
      // Mix: discard lowest usefulness tile
      return isolated[0]?.tile || hand[hand.length - 1];
    }
    case 'Chaos': {
      // Random discard from low-usefulness tiles
      const candidates = isolated.slice(0, Math.max(3, Math.floor(isolated.length / 2)));
      return candidates[Math.floor(Math.random() * candidates.length)]?.tile || hand[Math.floor(Math.random() * hand.length)];
    }
    default:
      return isolated[0]?.tile || hand[hand.length - 1];
  }
}

// Should AI claim a discarded tile?
function shouldClaim(hand, tile, claimType, strategy, openMelds) {
  const handWithTile = [...hand, tile];
  const win = checkWin(handWithTile, openMelds);
  
  // Always claim for win
  if (win) return true;
  
  switch (strategy.name) {
    case 'Aggressive': {
      // Claim pung/kong freely, chow if it helps
      if (claimType === 'pung' || claimType === 'kong') return true;
      if (claimType === 'chow') {
        // Claim chow if we're building toward tenpai
        const tenpai = getTenpaiTiles(handWithTile, openMelds);
        return tenpai.length > 0 || hand.length > 10;
      }
      return false;
    }
    case 'Defensive': {
      // Only claim pung/kong, never chow (keeps hand closed)
      if (claimType === 'chow') return false;
      if (claimType === 'pung') {
        // Only if honor tile or terminal
        return isHonorOrTerminal(tile) && canPung(hand, tile);
      }
      return claimType === 'kong';
    }
    case 'Balanced': {
      if (claimType === 'pung' || claimType === 'kong') return true;
      if (claimType === 'chow') {
        const combos = canChow(hand, tile);
        return combos.length >= 2; // only if multiple chow options
      }
      return false;
    }
    case 'Chaos': {
      // Random claims
      return Math.random() > 0.4;
    }
    default:
      return false;
  }
}

// Main AI decision function
export function makeAIDecision(state, playerIndex, strategy) {
  const player = state.players[playerIndex];
  const { hand, openMelds } = player;
  
  // Draw a tile
  const drawnTile = state.wall[state.wallIndex];
  if (!drawnTile) return { action: 'pass' };
  
  const newHand = [...hand, drawnTile];
  
  // Check for self-draw win
  const win = checkWin(newHand, openMelds);
  if (win) return { action: 'win', tile: drawnTile, hand: newHand, win };
  
  // Check for kong with drawn tile
  if (strategy.name !== 'Defensive' && canKong(hand, drawnTile)) {
    return { action: 'kong', tile: drawnTile, hand: newHand };
  }
  
  // Discard a tile
  const discard = chooseTileToDiscard(newHand, strategy);
  return {
    action: 'discard',
    drawnTile,
    discard,
    hand: newHand.filter(t => t !== discard),
  };
}

// AI decision on whether to claim a discarded tile
export function makeClaimDecision(hand, tile, openMelds, strategy, availableClaims) {
  // Priority: win > kong > pung > chow
  const handWithTile = [...hand, tile];
  const win = checkWin(handWithTile, openMelds);
  if (win && availableClaims.includes('win')) return { claim: 'win', win };
  
  if (availableClaims.includes('kong') && shouldClaim(hand, tile, 'kong', strategy, openMelds)) {
    return { claim: 'kong' };
  }
  if (availableClaims.includes('pung') && shouldClaim(hand, tile, 'pung', strategy, openMelds)) {
    return { claim: 'pung' };
  }
  if (availableClaims.includes('chow') && shouldClaim(hand, tile, 'chow', strategy, openMelds)) {
    const combos = canChow(hand, tile);
    if (combos.length > 0) return { claim: 'chow', combo: combos[0] };
  }
  
  return { claim: 'pass' };
}

export const AI_STRATEGIES = [
  {
    name: 'Aggressive',
    emoji: '⚔️',
    color: '#c0392b',
    description: 'Claims tiles freely, prioritizes fast wins over safety. High risk, high reward.',
  },
  {
    name: 'Defensive',
    emoji: '🛡️',
    color: '#2980b9',
    description: 'Keeps hand closed, discards safe tiles, avoids feeding opponents.',
  },
  {
    name: 'Balanced',
    emoji: '⚖️',
    color: '#27ae60',
    description: 'Adapts to the flow of the game. Claims wisely, defends when necessary.',
  },
  {
    name: 'Chaos',
    emoji: '🎲',
    color: '#8e44ad',
    description: 'Unpredictable moves that are hard to read. Sometimes brilliant, sometimes disastrous.',
  },
];
