/**
 * Hong Kong Mahjong AI — Heuristic Strategy Engine
 *
 * Each AI player is assigned one of the strategy profiles below.
 * On every discard decision the AI runs through a decision tree:
 *
 *   1. Hand evaluation  — shanten + potential fan estimation
 *   2. Lane selection   — choose the best scoring "path"
 *   3. Tile scoring     — pick the discard that advances the chosen lane
 *   4. Claim logic      — pong / chi / kong only if it helps the lane
 *   5. Defense          — fold if an opponent is threatening
 */

import {
  SUITS, HONOURS, WINDS, DRAGONS, FLOWERS,
  calcShanten, sortHand, isHonour, isSuit, isTerminalOrHonour,
  analyzeHand, analyzeDanger, getSafeDiscard, TILE_DISPLAY,
} from '../game/tiles.js';

// ─── Strategy profiles ────────────────────────────────────────────────────────
// Strategy profiles for setup screen — each player can have preferred lane weightings
export const STRATEGIES = {
  auto:      { label:'自動',   desc:'每局根據手牌自動選擇最佳路線（推薦）' },
  flush:     { label:'清一色', desc:'集中同一花色，穩定達到高番' },
  halfFlush: { label:'混一色', desc:'同一花色加字牌' },
  triplet:   { label:'對對胡', desc:'專攻刻子，碰任何配對的牌' },
  pingHu:    { label:'平糊',   desc:'全上牌，平手快速糊牌' },
  dragon:    { label:'大三元', desc:'死守中發白，追求高番' },
  defensive: { label:'保守',   desc:'以安全牌為先，避免放炮' },
};

// ─── Utility helpers ──────────────────────────────────────────────────────────

function countByKey(tiles) {
  const cnt = {};
  for (const t of tiles) cnt[t.key] = (cnt[t.key]||0) + 1;
  return cnt;
}

function suitOf(tile) {
  for (const s of SUITS) if (tile.key.startsWith(s) && /\d$/.test(tile.key)) return s;
  return null;
}

function suitCounts(tiles) {
  const c = { man:0, pin:0, sou:0 };
  for (const t of tiles) { const s=suitOf(t); if(s) c[s]++; }
  return c;
}

function dominantSuit(tiles) {
  const c = suitCounts(tiles);
  return Object.entries(c).sort((a,b)=>b[1]-a[1])[0];
}

function pairCount(tiles) {
  const cnt = countByKey(tiles);
  return Object.values(cnt).filter(v=>v>=2).length;
}

function dragonPairs(tiles) {
  const cnt = countByKey(tiles);
  return DRAGONS.filter(k=>cnt[k]>=2).length;
}

function windPairs(tiles, seatWind, roundWind) {
  const cnt = countByKey(tiles);
  return [WINDS[seatWind], WINDS[roundWind]].filter(k=>cnt[k]>=2).length;
}

// Estimate fan potential for a given "lane"
function estimateFan(tiles, melds, seatWind, roundWind, lane) {
  const cnt = countByKey(tiles);
  let fan = 0;
  switch (lane) {
    case 'flush': {
      const [suit, ct] = dominantSuit(tiles);
      if (ct >= 9) fan += 7;         // 清一色
      else if (ct >= 7) fan += 3;    // mixed flush
      else fan += 1;
      break;
    }
    case 'triplet':
      fan += 3; // 對對胡 base
      for (const dk of DRAGONS) if (cnt[dk]>=2) fan++;
      break;
    case 'value':
      for (const dk of DRAGONS) if (cnt[dk]>=2) fan++;
      if (cnt[WINDS[seatWind]]>=2) fan++;
      if (cnt[WINDS[roundWind]]>=2) fan++;
      break;
    case 'dragon':
      fan += DRAGONS.filter(k=>cnt[k]>=2).length * 2;
      if (DRAGONS.filter(k=>cnt[k]>=2).length>=3) fan += 99;
      break;
    case 'winds':
      fan += WINDS.filter(k=>cnt[k]>=2).length * 2;
      break;
    case 'orphan': {
      const oKeys=['man1','man9','pin1','pin9','sou1','sou9','east','south','west','north','chun','hatsu','haku'];
      fan += oKeys.filter(k=>cnt[k]>=1).length;
      break;
    }
    default: fan = 1; // speed / unknown
  }
  return fan;
}

// ─── Lane (strategy path) selection ──────────────────────────────────────────

function selectLane(tiles, melds, seatWind, roundWind, minFan, profile) {
  if (!profile || profile === 'auto') {
    // Dynamic: scan hand and pick best lane
    const scan = scanBestLane(tiles, melds, seatWind, roundWind, minFan);
    return scan?.best || 'pingHu';
  }
  // Fixed profile: use it directly
  return profile;

  // Force-locked profiles (user picked these explicitly, balanced overrides)
  const cnt = countByKey(tiles);
  const [bestSuit, bestSuitCt] = dominantSuit(tiles);
  const pairs = pairCount(tiles);
  const dp = dragonPairs(tiles);
  const wp = windPairs(tiles, seatWind, roundWind);

  // Thirteen orphans
  const oKeys=['man1','man9','pin1','pin9','sou1','sou9','east','south','west','north','chun','hatsu','haku'];
  if (oKeys.filter(k=>cnt[k]>=1).length >= 9) return 'orphan';

  // Big three dragons — 2+ dragon pairs
  if (dp >= 2) return 'dragon';

  // Big four winds — 2+ wind pairs including seat+round
  if (wp >= 2 && WINDS.filter(k=>cnt[k]>=2).length >= 3) return 'winds';

  // Pure flush — strong suit concentration
  if (bestSuitCt >= 8) return 'flush';

  // All triplets — 4+ pairs and no chi melds yet
  if (pairs >= 4 && !melds.some(m=>m.type==='chi')) return 'triplet';

  // Value tiles — seat/round wind or dragon pair
  if (dp >= 1 || (cnt[WINDS[seatWind]]||0)>=2) return 'value';

  // Moderate flush
  if (bestSuitCt >= 6) return 'flush';

  // Default: speed (pure shanten minimization)
  return 'speed';
}

// ─── Tile scoring for discard ─────────────────────────────────────────────────

function scoreDiscard(tile, hand, melds, lane, seatWind, roundWind, opponentThreats, minFan) {
  const key = tile.key;
  const remaining = hand.filter(t=>t!==tile);
  const shan = calcShanten(remaining);

  // Base: lower shanten after discard is better (lower score = better)
  let score = shan * 100;

  // ── Lane-specific bonuses ──
  switch (lane) {

    case 'flush': {
      const [targetSuit] = dominantSuit(hand);
      const cnt = countByKey(hand);
      const tileCount = cnt[key] || 1;

      if (suitOf(tile) === targetSuit) {
        // Keep target suit strongly
        score += 300;
        // But isolates with no sequence potential are less valuable
        if (tileCount === 1) score -= 30;
      } else {
        // Off-suit: want to discard these
        // Priority: discard isolated honours first, then isolated off-suit, keep pairs last
        if (isHonour(tile)) {
          // Honours: discard isolated first, keep pairs longer (can pivot to 對對胡)
          if (tileCount >= 3) score += 50;       // triplet = keep (1番 bonus)
          else if (tileCount === 2) score += 10; // pair = keep for now (可轉對對胡)
          else score -= 60;                       // isolated honour = discard first
        } else {
          // Off-suit numerals: discard isolated, keep pairs
          if (tileCount >= 3) score += 30;        // triplet = keep (可轉對對胡)
          else if (tileCount === 2) score += 5;   // pair = keep
          else score -= 40;                        // isolated = discard
        }
      }
      break;
    }

    case 'triplet': {
      const cnt = countByKey(hand);
      if (cnt[key] >= 2) score += 150;   // keep pairs
      if (isSuit(tile) && !isHonour(tile)) {
        // Middle tiles form sequences (bad for triplet)
        const n = parseInt(key.slice(-1));
        if (n>=3 && n<=7 && cnt[key]<2) score -= 20;
      }
      break;
    }

    case 'halfFlush': {
      const [targetSuit] = dominantSuit(hand);
      const cnt = countByKey(hand);
      const tileCount = cnt[key] || 1;

      if (suitOf(tile) === targetSuit) {
        score += 280; // keep target suit
        if (tileCount === 1) score -= 20;
      } else if (isHonour(tile)) {
        // Honours in halfFlush: keep pairs/triplets, discard isolated
        if (tileCount >= 3) score += 100; // triplet = 1番 bonus
        else if (tileCount === 2) score += 30; // pair
        else score -= 50; // isolated honour = discard
      } else {
        // Off-suit numerals: discard these (keep pairs last)
        if (tileCount >= 2) score += 20; // pair = keep briefly
        else score -= 80; // isolated off-suit = discard first
      }
      break;
    }

    case 'value': {
      const cnt = countByKey(hand);
      // Never discard dragons/winds if we have a pair
      if (DRAGONS.includes(key) && cnt[key]>=2) score += 300;
      if (WINDS.includes(key) && (key===WINDS[seatWind]||key===WINDS[roundWind]) && cnt[key]>=2) score += 200;
      // Isolated honours of no value → discard first
      if (isHonour(tile) && cnt[key]===1 && !DRAGONS.includes(key)
          && key!==WINDS[seatWind] && key!==WINDS[roundWind]) score -= 30;
      break;
    }

    case 'dragon': {
      const cnt = countByKey(hand);
      if (DRAGONS.includes(key)) score += 500;
      if (WINDS.includes(key) && cnt[key]>=2) score += 100;
      break;
    }

    case 'winds': {
      const cnt = countByKey(hand);
      if (WINDS.includes(key)) score += 500;
      break;
    }

    case 'orphan': {
      const oKeys=['man1','man9','pin1','pin9','sou1','sou9','east','south','west','north','chun','hatsu','haku'];
      if (oKeys.includes(key)) score += 300; // keep orphan tiles
      break;
    }

    case 'defensive': {
      // Prioritize tiles already discarded by opponents (safe)
      const isSafe = opponentThreats.safeKeys.has(key);
      if (isSafe) score -= 50;
      // Terminals and honours are generally safer
      if (isTerminalOrHonour(tile)) score -= 15;
      break;
    }

    default: // speed — pure shanten
      break;
  }

  // ── Defense modifier (applies on top of lane logic) ──
  if (opponentThreats.threatLevel >= 2) {
    const isSafe = opponentThreats.safeKeys.has(key);
    if (isSafe) score -= 40;
    if (isTerminalOrHonour(tile)) score -= 10;
  }

  return score;
}

// ─── Threat assessment ────────────────────────────────────────────────────────

function assessThreats(gameState, selfIdx) {
  const { hands, melds, discards } = gameState;
  let threatLevel = 0;
  const safeKeys = new Set();

  for (let p=0; p<4; p++) {
    if (p===selfIdx) continue;
    const pm = melds[p];
    const pd = discards[p];

    // Exposed melds = closer to tenpai
    if (pm.length >= 2) threatLevel++;
    if (pm.length >= 3) threatLevel++;

    // All exposed melds same suit = flush danger
    if (pm.length>=2) {
      const meldSuits = pm.map(m=>suitOf(m.tiles[0])).filter(Boolean);
      if (meldSuits.length>=2 && meldSuits.every(s=>s===meldSuits[0])) threatLevel++;
    }

    // Their discards are safe for us to discard
    for (const t of pd) safeKeys.add(t.key);
  }

  return { threatLevel, safeKeys };
}

// ─── Main AI discard ──────────────────────────────────────────────────────────

export function aiDiscard(hand, melds, strategy='balanced', seatWind=0, roundWind=0, minFan=3, gameState=null, turnNum=0) {
  if (hand.length===0) return hand[0];

  // Assess board threats
  const opponentThreats = gameState
    ? assessThreats(gameState, gameState.currentPlayer)
    : { threatLevel:0, safeKeys:new Set() };

  // Mid/late game defense switch
  let effectiveLane = strategy;
  if (opponentThreats.threatLevel >= 3 && strategy !== 'speed') {
    effectiveLane = 'defensive';
  } else {
    effectiveLane = selectLane(hand, melds, seatWind, roundWind, minFan, strategy);
  }

  // In full defensive mode, use safe discard logic
  if (effectiveLane === 'defensive') {
    const dangerMap = gameState ? analyzeDanger(
      hand,
      [0,1,2,3].filter(i=>i!==gameState.currentPlayer).map(i=>gameState.melds[i]),
      [0,1,2,3].filter(i=>i!==gameState.currentPlayer).map(i=>gameState.discards[i]),
      gameState.wall?.length || 0
    ) : {};
    return getSafeDiscard(hand, dangerMap);
  }

  // Score every possible discard
  let best = hand[0], bestScore = Infinity;
  for (const t of hand) {
    const s = scoreDiscard(t, hand, melds, effectiveLane, seatWind, roundWind, opponentThreats, minFan);
    // Apply danger penalty: prefer discarding safe tiles when under threat
    const dangerPenalty = (opponentThreats.threatLevel >= 2)
      ? (opponentThreats.safeKeys.has(t.key) ? -30 : 0)
      : 0;
    if (s + dangerPenalty < bestScore) { bestScore = s + dangerPenalty; best = t; }
  }
  return best;
}

// ─── Claim logic: pong ────────────────────────────────────────────────────────

export function aiWantsPong(tile, hand, melds, strategy='balanced', seatWind=0, roundWind=0, minFan=3, gameState=null) {
  const key = tile.key;
  const lane = selectLane(hand, melds, seatWind, roundWind, minFan, strategy);

  switch (lane) {
    case 'triplet':
    case 'dragon':
    case 'winds':
      return true; // Always pong

    case 'flush': {
      const [targetSuit] = dominantSuit(hand);
      return suitOf(tile)===targetSuit; // Only pong if it's the target suit
    }

    case 'value':
      return DRAGONS.includes(key) || key===WINDS[seatWind] || key===WINDS[roundWind];

    case 'defensive':
      return false;

    case 'orphan':
      return false;

    default: // auto
      // Always pong ALL honours (字牌) — essential for minimum fan
      if (DRAGONS.includes(key)) return true;
      if (WINDS.includes(key)) return true;
      // Pong suited tiles if shanten improves
      {
        const cnt = countByKey(hand);
        if (cnt[key]>=2 && calcShanten(hand.filter(t=>t.key!==key).slice(0,hand.length-2)) < calcShanten(hand)) return true;
      }
      return false;
  }
}

// ─── Claim logic: chi ─────────────────────────────────────────────────────────

export function aiWantsChi(tile, hand, melds, strategy='balanced', gameState=null) {
  const lane = selectLane(hand, melds, 0, 0, 3, strategy);

  // These lanes never chi
  if (['triplet','dragon','winds','orphan','defensive'].includes(lane)) return false;

  // Only chi if it reduces shanten
  const currentShan = calcShanten(hand);
  return currentShan >= 1;
}

// ─── Fan verification before winning ──────────────────────────────────────────
// The AI must NOT declare a win if it doesn't meet minFan.
// This is handled in gameEngine via calcFan, but exported here for transparency.
export function meetsMinFan(fan, minFan) {
  return fan >= minFan;
}

// ─── Hand scan: detect best lane for a given hand ──────────────────────────────
export function scanBestLane(tiles, melds, seatWind, roundWind, minFan = 3) {
  const cnt = {};
  for (const t of tiles) cnt[t.key] = (cnt[t.key]||0)+1;
  // Score each possible lane
  const scores = {};

  // Thirteen orphans
  const oKeys=['man1','man9','pin1','pin9','sou1','sou9','east','south','west','north','chun','hatsu','haku'];
  const orphanHave = oKeys.filter(k=>cnt[k]).length;
  scores['orphan'] = orphanHave * 10 + (oKeys.some(k=>cnt[k]>=2)?5:0) - 130;

  // All triplets / 對對胡
  const pairCt = Object.values(cnt).filter(v=>v>=2).length;
  const tripletCt = Object.values(cnt).filter(v=>v>=3).length;
  scores['triplet'] = tripletCt * 30 + pairCt * 10 - 30;

  // Flush
  const suitCt = { man:0,pin:0,sou:0 };
  for (const t of tiles) {
    for (const s of ['man','pin','sou']) if (t.key.startsWith(s)&&/\d$/.test(t.key)) { suitCt[s]++; break; }
  }
  const maxSuit = Math.max(...Object.values(suitCt));
  scores['flush'] = maxSuit * 15 - 50;

  // Half flush: one suit + honours
  const honourCt = tiles.filter(t=>!Object.keys(suitCt).some(s=>t.key.startsWith(s)&&/\d$/.test(t.key))).length;
  scores['halfFlush'] = maxSuit>=5&&honourCt>=2 ? maxSuit*10 + honourCt*8 - 40 : -99;
  // All honours (字一色): only honour tiles
  scores['allHonours'] = honourCt >= 8 ? honourCt*15 - 60 : (honourCt >= 5 ? honourCt*8 - 50 : -99);

  // 平糊 + 門前清: all chows, no honours, concealed
  const hasHonourTile = tiles.some(t=>['east','south','west','north','chun','hatsu','haku'].includes(t.key));
  const noPairs = pairCt <= 1;
  scores['pingHu'] = !hasHonourTile && noPairs ? 40 : -20;

  // Value tiles (dragons/winds)
  const DRAG = ['chun','hatsu','haku'];
  const WIND4 = ['east','south','west','north'];
  const dragonPairs = DRAG.filter(k=>cnt[k]>=2).length;
  const dragonTrips = DRAG.filter(k=>cnt[k]>=3).length;
  scores['dragon'] = dragonPairs * 30 + dragonTrips * 60;
  scores['winds'] = WIND4.filter(k=>cnt[k]>=2).length * 25 + WIND4.filter(k=>cnt[k]>=3).length * 40;

  // Rank all lanes
  // Filter to only valid HK lanes
  const validLanes = ['flush','halfFlush','allHonours','triplet','pingHu','dragon','winds','orphan','defensive'];
  const filteredScores = Object.fromEntries(Object.entries(scores).filter(([k])=>validLanes.includes(k)));
  const ranked = Object.entries(filteredScores).sort((a,b)=>b[1]-a[1]);

  // Determine target suit for flush strategies
  const SUIT_LABELS_MAP = { man:'萬子', pin:'筒子', sou:'索子' };
  const targetSuitKey = Object.entries(suitCt).sort((a,b)=>b[1]-a[1])[0]?.[0] || 'man';
  const targetSuitLabel = SUIT_LABELS_MAP[targetSuitKey] || '';

  return {
    best: ranked[0]?.[0] || 'pingHu',
    ranked: ranked.map(([lane, score]) => ({ lane, score: Math.round(score) })),
    targetSuitLabel,
    targetSuitKey,
    details: {
      orphanHave, pairCt, tripletCt, maxSuit,
      dragonPairs, dragonTrips,
      suitCt,
    }
  };
}

export const LANE_LABELS = {
  flush:      '清一色',
  halfFlush:  '混一色',
  allHonours: '字一色',
  triplet:    '對對胡',
  pingHu:     '平糊',
  orphan:     '十三么',
  defensive:  '保守',
  auto:       '自動',
};
