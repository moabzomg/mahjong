// ============================================================
// MAHJONG GAME ENGINE
// Implements Hong Kong / Cantonese Mahjong rules
// ============================================================

export const SUITS = {
  BAMBOO: 'bamboo',
  CIRCLE: 'circle',
  CHARACTER: 'character',
  WIND: 'wind',
  DRAGON: 'dragon',
  FLOWER: 'flower',
};

export const WINDS = ['East', 'South', 'West', 'North'];
export const DRAGONS = ['Red', 'Green', 'White'];
export const FLOWERS = ['Plum', 'Orchid', 'Chrysanthemum', 'Bamboo', 'Spring', 'Summer', 'Autumn', 'Winter'];

// Tile symbols
export const TILE_SYMBOLS = {
  bamboo: ['🎋', '🎍', '🎋', '🎍', '🎋', '🎍', '🎋', '🎍', '🎋'],
  circle: ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨'],
  character: ['一', '二', '三', '四', '五', '六', '七', '八', '九'],
  wind: ['東', '南', '西', '北'],
  dragon: ['中', '發', '白'],
};

export const DRAGON_COLORS = {
  Red: '#c0392b',
  Green: '#27ae60',
  White: '#bdc3c7',
};

let tileIdCounter = 0;

export function createTile(suit, value, index = 0) {
  return {
    id: `${suit}-${value}-${index}-${tileIdCounter++}`,
    suit,
    value,
    index,
  };
}

export function createFullDeck() {
  const tiles = [];
  // Suited tiles: 4 copies each
  for (const suit of [SUITS.BAMBOO, SUITS.CIRCLE, SUITS.CHARACTER]) {
    for (let v = 1; v <= 9; v++) {
      for (let i = 0; i < 4; i++) {
        tiles.push(createTile(suit, v, i));
      }
    }
  }
  // Winds: 4 copies each
  for (let v = 0; v < 4; v++) {
    for (let i = 0; i < 4; i++) {
      tiles.push(createTile(SUITS.WIND, v, i));
    }
  }
  // Dragons: 4 copies each
  for (let v = 0; v < 3; v++) {
    for (let i = 0; i < 4; i++) {
      tiles.push(createTile(SUITS.DRAGON, v, i));
    }
  }
  // Flowers: 1 copy each
  for (let v = 0; v < 8; v++) {
    tiles.push(createTile(SUITS.FLOWER, v, 0));
  }
  return tiles;
}

export function shuffleDeck(tiles) {
  const arr = [...tiles];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function tileKey(tile) {
  return `${tile.suit}-${tile.value}`;
}

export function tilesEqual(a, b) {
  return a.suit === b.suit && a.value === b.value;
}

export function getTileDisplay(tile) {
  if (!tile) return { symbol: '?', color: '#999', label: '?' };
  
  switch (tile.suit) {
    case SUITS.BAMBOO:
      return { symbol: String(tile.value), color: '#2d6a2d', label: `${tile.value} Bamboo`, isNumeric: true, suit: 'bamboo' };
    case SUITS.CIRCLE:
      return { symbol: String(tile.value), color: '#1a4a8a', label: `${tile.value} Circle`, isNumeric: true, suit: 'circle' };
    case SUITS.CHARACTER:
      return { symbol: TILE_SYMBOLS.character[tile.value - 1], color: '#8B1A1A', label: `${tile.value} Character`, isNumeric: true, suit: 'character' };
    case SUITS.WIND:
      return { symbol: TILE_SYMBOLS.wind[tile.value], color: '#2c3e50', label: `${WINDS[tile.value]} Wind`, suit: 'wind' };
    case SUITS.DRAGON:
      return { 
        symbol: TILE_SYMBOLS.dragon[tile.value], 
        color: Object.values(DRAGON_COLORS)[tile.value], 
        label: `${DRAGONS[tile.value]} Dragon`,
        suit: 'dragon'
      };
    case SUITS.FLOWER:
      return { symbol: '🌸', color: '#9b59b6', label: FLOWERS[tile.value], suit: 'flower' };
    default:
      return { symbol: '?', color: '#999', label: '?' };
  }
}

// Sort hand for display
export function sortHand(hand) {
  const suitOrder = { bamboo: 0, circle: 1, character: 2, wind: 3, dragon: 4, flower: 5 };
  return [...hand].sort((a, b) => {
    const so = suitOrder[a.suit] - suitOrder[b.suit];
    if (so !== 0) return so;
    return a.value - b.value;
  });
}

// ============================================================
// WIN DETECTION
// ============================================================

export function isHonorOrTerminal(tile) {
  if (tile.suit === SUITS.WIND || tile.suit === SUITS.DRAGON || tile.suit === SUITS.FLOWER) return true;
  return tile.value === 1 || tile.value === 9;
}

// Check if a group of 3 tiles forms a valid set
export function isValidSet(tiles) {
  if (tiles.length !== 3) return false;
  const [a, b, c] = tiles;
  
  // Pung (3 identical)
  if (tilesEqual(a, b) && tilesEqual(b, c)) return true;
  
  // Chow (sequence in same suited suit)
  if ([SUITS.BAMBOO, SUITS.CIRCLE, SUITS.CHARACTER].includes(a.suit) &&
      a.suit === b.suit && b.suit === c.suit) {
    const vals = [a.value, b.value, c.value].sort((x, y) => x - y);
    return vals[1] === vals[0] + 1 && vals[2] === vals[1] + 1;
  }
  return false;
}

// Find all possible melds in a hand
export function findAllMelds(tiles) {
  const results = [];
  
  function tryArrange(remaining, melds) {
    if (remaining.length === 0) {
      results.push([...melds]);
      return;
    }
    if (remaining.length < 3) return;
    
    const first = remaining[0];
    const rest = remaining.slice(1);
    
    // Try pung
    for (let i = 0; i < rest.length - 1; i++) {
      for (let j = i + 1; j < rest.length; j++) {
        if (tilesEqual(rest[i], first) && tilesEqual(rest[j], first)) {
          const newRem = rest.filter((_, idx) => idx !== i && idx !== j);
          tryArrange(newRem, [...melds, [first, rest[i], rest[j]]]);
        }
      }
    }
    
    // Try chow (only for suited tiles)
    if ([SUITS.BAMBOO, SUITS.CIRCLE, SUITS.CHARACTER].includes(first.suit)) {
      const need1 = rest.find(t => t.suit === first.suit && t.value === first.value + 1);
      const need2 = rest.find(t => t.suit === first.suit && t.value === first.value + 2);
      if (need1 && need2) {
        const newRem = rest.filter(t => t !== need1 && t !== need2);
        tryArrange(newRem, [...melds, [first, need1, need2]]);
      }
    }
  }
  
  tryArrange(tiles, []);
  return results;
}

// Check if hand is a winning hand (14 tiles)
export function checkWin(hand, openMelds = []) {
  const closedTiles = hand.filter(t => t.suit !== SUITS.FLOWER);
  const flowers = hand.filter(t => t.suit === SUITS.FLOWER);
  
  const totalMeldCount = openMelds.length;
  const neededClosedSets = 4 - totalMeldCount;
  
  if (closedTiles.length !== neededClosedSets * 3 + 2) return false;
  
  // Try each possible pair
  for (let i = 0; i < closedTiles.length; i++) {
    for (let j = i + 1; j < closedTiles.length; j++) {
      if (tilesEqual(closedTiles[i], closedTiles[j])) {
        const pair = [closedTiles[i], closedTiles[j]];
        const rest = closedTiles.filter((_, idx) => idx !== i && idx !== j);
        const arrangements = findAllMelds(rest);
        if (arrangements.length > 0) {
          return {
            win: true,
            pair,
            melds: arrangements[0],
            openMelds,
            flowers,
          };
        }
      }
    }
  }
  
  // Seven pairs
  if (closedTiles.length === 14 && openMelds.length === 0) {
    const pairs = [];
    const used = new Array(closedTiles.length).fill(false);
    for (let i = 0; i < closedTiles.length; i++) {
      if (used[i]) continue;
      for (let j = i + 1; j < closedTiles.length; j++) {
        if (!used[j] && tilesEqual(closedTiles[i], closedTiles[j])) {
          pairs.push([closedTiles[i], closedTiles[j]]);
          used[i] = used[j] = true;
          break;
        }
      }
    }
    if (pairs.length === 7) {
      return { win: true, sevenPairs: true, pairs, flowers };
    }
  }
  
  return false;
}

// Can we form a chow with this tile + 2 from hand?
export function canChow(hand, tile) {
  if (![SUITS.BAMBOO, SUITS.CIRCLE, SUITS.CHARACTER].includes(tile.suit)) return false;
  const v = tile.value;
  const suitTiles = hand.filter(t => t.suit === tile.suit).map(t => t.value);
  
  const combos = [];
  // v-2, v-1, v
  if (suitTiles.includes(v - 2) && suitTiles.includes(v - 1)) combos.push([v - 2, v - 1, v]);
  // v-1, v, v+1
  if (suitTiles.includes(v - 1) && suitTiles.includes(v + 1)) combos.push([v - 1, v, v + 1]);
  // v, v+1, v+2
  if (suitTiles.includes(v + 1) && suitTiles.includes(v + 2)) combos.push([v, v + 1, v + 2]);
  
  return combos;
}

// Can we form a pung with this tile?
export function canPung(hand, tile) {
  const count = hand.filter(t => tilesEqual(t, tile)).length;
  return count >= 2;
}

// Can we form a kong with this tile?
export function canKong(hand, tile) {
  const count = hand.filter(t => tilesEqual(t, tile)).length;
  return count >= 3;
}

// Tenpai check - returns tiles that would complete the hand
export function getTenpaiTiles(hand, openMelds = []) {
  const waiting = [];
  const allSuits = [SUITS.BAMBOO, SUITS.CIRCLE, SUITS.CHARACTER, SUITS.WIND, SUITS.DRAGON];
  
  for (const suit of allSuits) {
    const maxVal = [SUITS.WIND].includes(suit) ? 3 : [SUITS.DRAGON].includes(suit) ? 2 : 9;
    for (let v = 0; v <= maxVal; v++) {
      const testTile = createTile(suit, v);
      const testHand = [...hand, testTile];
      if (checkWin(testHand, openMelds)) {
        waiting.push(testTile);
      }
    }
  }
  return waiting;
}

// Calculate hand score (simplified)
export function calculateScore(winResult, isRon = false, isSelfDraw = false) {
  let basePoints = 1;
  
  if (winResult.sevenPairs) basePoints += 3;
  if (isSelfDraw) basePoints += 1;
  
  // Bonus for all pungs
  if (winResult.melds && winResult.melds.every(m => tilesEqual(m[0], m[1]) && tilesEqual(m[1], m[2]))) {
    basePoints += 2;
  }
  
  // Flower bonus
  if (winResult.flowers) basePoints += winResult.flowers.length;
  
  return Math.max(1, basePoints);
}
