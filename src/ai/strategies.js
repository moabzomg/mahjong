import { calcShanten, sortHand, isHonour, tileKey, WINDS, DRAGONS } from '../game/tiles.js';

const BEST_STRATEGY = 'nash';

export const STRATEGIES = {
  nash: { label: '均衡', desc: '平衡進攻與防守' },
  aggressive: { label: '進攻', desc: '積極求胡，不顧安全' },
  defensive: { label: '防守', desc: '保守打法，安全優先' },
  triplet: { label: '對對糊', desc: '專攻對子與刻子' },
};

function scored(tiles, candidate, strategy) {
  const rem = tiles.filter((t, i) => i !== tiles.indexOf(candidate));
  const shan = calcShanten(rem);

  // Safety score: honours and terminals are safer to discard
  const safetyBonus = isHonour(candidate) ? 1 : 0;

  switch (strategy) {
    case 'aggressive':
      return shan * 10 - safetyBonus;
    case 'defensive':
      return shan * 5 - safetyBonus * 3;
    case 'triplet': {
      // Prefer to keep pairs/triplets
      const cnt = {};
      for (const t of tiles) cnt[tileKey(t)] = (cnt[tileKey(t)] || 0) + 1;
      const keepBonus = cnt[tileKey(candidate)] >= 2 ? 2 : 0;
      return shan * 10 + keepBonus;
    }
    default: // nash
      return shan * 8 - safetyBonus;
  }
}

export function aiDiscard(hand, melds, strategy = BEST_STRATEGY) {
  const tiles = sortHand(hand);
  if (tiles.length === 0) return hand[0];

  let best = tiles[0];
  let bestScore = Infinity;

  for (const t of tiles) {
    const score = scored(tiles, t, strategy);
    if (score < bestScore) {
      bestScore = score;
      best = t;
    }
  }
  return best;
}

export function aiWantsPong(tile, strategy = BEST_STRATEGY) {
  // Always pong dragons
  if (DRAGONS.includes(tile.key)) return true;
  // Always pong winds
  if (WINDS.includes(tile.key)) return true;
  // Numbered tiles: aggressive and triplet strategies pong
  if (strategy === 'aggressive' || strategy === 'triplet') return true;
  return false;
}

export function aiWantsChi(tile, hand, melds, strategy = BEST_STRATEGY) {
  // Only aggressive and nash
  if (strategy === 'defensive' || strategy === 'triplet') return false;
  // Only chi if shanten >= 2
  const shan = calcShanten(hand);
  return shan >= 2;
}
