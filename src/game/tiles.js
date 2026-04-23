// ─── Tile Definitions ────────────────────────────────────────────────────────

export const SUITS = ['man', 'pin', 'sou']; // 萬 餅 索
export const HONOURS = ['east', 'south', 'west', 'north', 'chun', 'hatsu', 'haku']; // 東南西北中發白
export const WINDS = ['east', 'south', 'west', 'north'];
export const DRAGONS = ['chun', 'hatsu', 'haku'];
export const FLOWERS = ['plum', 'orchid', 'chrysanthemum', 'bamboo', 'spring', 'summer', 'autumn', 'winter'];

// Unicode mahjong emoji map
export const TILE_EMOJI = {
  man1:'🀇',man2:'🀈',man3:'🀉',man4:'🀊',man5:'🀋',man6:'🀌',man7:'🀍',man8:'🀎',man9:'🀏',
  pin1:'🀙',pin2:'🀚',pin3:'🀛',pin4:'🀜',pin5:'🀝',pin6:'🀞',pin7:'🀟',pin8:'🀠',pin9:'🀡',
  sou1:'🀐',sou2:'🀑',sou3:'🀒',sou4:'🀓',sou5:'🀔',sou6:'🀕',sou7:'🀖',sou8:'🀗',sou9:'🀘',
  east:'🀀',south:'🀁',west:'🀂',north:'🀃',
  haku:'🀆',hatsu:'🀅',chun:'🀄',
  plum:'🌸',orchid:'🌺',chrysanthemum:'🌼',bamboo:'🎋',
  spring:'🌱',summer:'☀️',autumn:'🍂',winter:'❄️',
};

export const TILE_DISPLAY = {
  man1:'1萬',man2:'2萬',man3:'3萬',man4:'4萬',man5:'5萬',man6:'6萬',man7:'7萬',man8:'8萬',man9:'9萬',
  pin1:'1餅',pin2:'2餅',pin3:'3餅',pin4:'4餅',pin5:'5餅',pin6:'6餅',pin7:'7餅',pin8:'8餅',pin9:'9餅',
  sou1:'1索',sou2:'2索',sou3:'3索',sou4:'4索',sou5:'5索',sou6:'6索',sou7:'7索',sou8:'8索',sou9:'9索',
  east:'東',south:'南',west:'西',north:'北',chun:'中',hatsu:'發',haku:'白',
  plum:'梅',orchid:'蘭',chrysanthemum:'菊',bamboo:'竹',spring:'春',summer:'夏',autumn:'秋',winter:'冬',
};

let _uid = 0;
function makeTile(key) { return { id: _uid++, key }; }

export function buildWall() {
  _uid = 0;
  const tiles = [];
  // 4 copies of each suit tile (9*3=27 * 4 = 108)
  for (const suit of SUITS) {
    for (let n = 1; n <= 9; n++) {
      for (let c = 0; c < 4; c++) tiles.push(makeTile(`${suit}${n}`));
    }
  }
  // 4 copies of each honour (7 * 4 = 28)
  for (const h of HONOURS) {
    for (let c = 0; c < 4; c++) tiles.push(makeTile(h));
  }
  // 8 flower tiles (unique)
  for (const f of FLOWERS) tiles.push(makeTile(f));

  // Shuffle
  for (let i = tiles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }
  return tiles;
}

export function isFlower(tile) { return FLOWERS.includes(tile.key); }
export function isHonour(tile) { return HONOURS.includes(tile.key); }
export function isSuit(tile) { return SUITS.some(s => tile.key.startsWith(s)); }
export function isTerminal(tile) {
  if (!isSuit(tile)) return false;
  const n = parseInt(tile.key.slice(-1));
  return n === 1 || n === 9;
}
export function isTerminalOrHonour(tile) { return isTerminal(tile) || isHonour(tile); }

export function tileKey(tile) { return tile.key; }

export function sortHand(tiles) {
  const order = (t) => {
    const key = t.key;
    for (let i = 0; i < SUITS.length; i++) {
      if (key.startsWith(SUITS[i])) return i * 10 + parseInt(key.slice(-1));
    }
    const hi = HONOURS.indexOf(key);
    if (hi >= 0) return 30 + hi;
    return 40;
  };
  return [...tiles].sort((a, b) => order(a) - order(b));
}

// ─── Shanten Calculation ──────────────────────────────────────────────────────

function suitNum(tile) {
  for (let i = 0; i < SUITS.length; i++) {
    if (tile.key.startsWith(SUITS[i])) return { suit: i, num: parseInt(tile.key.slice(-1)) };
  }
  return null;
}

function countKey(tiles) {
  const cnt = {};
  for (const t of tiles) cnt[t.key] = (cnt[t.key] || 0) + 1;
  return cnt;
}

// Returns shanten number: -1 = complete, 0 = tenpai, 1+ = steps away
export function calcShanten(tiles) {
  if (tiles.length === 0) return 8;

  // Seven pairs
  const cnt = countKey(tiles);
  const pairs = Object.values(cnt).filter(v => v >= 2).length;
  const shantenPairs = 6 - pairs;

  // Standard hand shanten
  const shantenStd = calcShantenStandard(tiles);

  // Thirteen orphans
  const orphanKeys = ['man1','man9','pin1','pin9','sou1','sou9','east','south','west','north','chun','hatsu','haku'];
  const hasOrphan = orphanKeys.filter(k => cnt[k]);
  const hasPairAmongOrphans = hasOrphan.some(k => cnt[k] >= 2);
  const shantenOrphan = 13 - hasOrphan.length - (hasPairAmongOrphans ? 1 : 0);

  return Math.min(shantenPairs, shantenStd, shantenOrphan);
}

function calcShantenStandard(tiles) {
  // Group by suit/honour
  const groups = { man:[], pin:[], sou:[], honour:[] };
  for (const t of tiles) {
    const sn = suitNum(t);
    if (sn) groups[SUITS[sn.suit]].push(sn.num);
    else groups.honour.push(t.key);
  }

  let best = 8;

  // Try all pair candidates
  const cnt = countKey(tiles);
  const pairCandidates = Object.keys(cnt).filter(k => cnt[k] >= 2);
  const tryPair = (pairKey) => {
    // Remove pair from tiles
    let remaining = [...tiles];
    let removed = 0;
    remaining = remaining.filter(t => {
      if (removed < 2 && t.key === pairKey) { removed++; return false; }
      return true;
    });
    const melds = countMelds(remaining);
    const needed = 4 - melds.complete;
    const partial = Math.min(melds.partial, needed);
    const s = 8 - 2 * melds.complete - partial;
    best = Math.min(best, s);
  };

  if (pairCandidates.length === 0) {
    // No pair yet
    const melds = countMelds(tiles);
    const needed = 4 - melds.complete;
    const partial = Math.min(melds.partial, needed);
    best = 8 - 2 * melds.complete - partial + 1; // +1 because no pair
  } else {
    for (const pk of pairCandidates) tryPair(pk);
  }

  return best;
}

function countMelds(tiles) {
  // Count complete melds (sequences + triplets) and partial melds
  let complete = 0;
  let partial = 0;
  const remaining = [...tiles];

  // Group by suit for sequences
  for (const suit of SUITS) {
    const nums = remaining.filter(t => t.key.startsWith(suit)).map(t => parseInt(t.key.slice(-1))).sort((a,b)=>a-b);
    // Greedily extract triplets then sequences
    const extracted = extractMelds(nums);
    complete += extracted.complete;
    partial += extracted.partial;
  }

  // Honours: only triplets count
  const honourCnt = {};
  for (const t of remaining.filter(t => isHonour(t))) {
    honourCnt[t.key] = (honourCnt[t.key] || 0) + 1;
  }
  for (const v of Object.values(honourCnt)) {
    if (v >= 3) complete++;
    else if (v === 2) partial++;
  }

  return { complete, partial };
}

function extractMelds(nums) {
  // nums is sorted array of numbers in a suit
  if (nums.length === 0) return { complete: 0, partial: 0 };
  const arr = [...nums];
  let complete = 0, partial = 0;

  // Try triplets first
  let i = 0;
  while (i < arr.length) {
    if (i + 2 < arr.length && arr[i] === arr[i+1] && arr[i] === arr[i+2]) {
      complete++;
      arr.splice(i, 3);
    } else i++;
  }

  // Then sequences
  i = 0;
  while (i < arr.length) {
    const n = arr[i];
    const j = arr.indexOf(n+1);
    const k = arr.indexOf(n+2, j+1);
    if (j !== -1 && k !== -1) {
      complete++;
      arr.splice(k, 1);
      arr.splice(j, 1);
      arr.splice(i, 1);
    } else i++;
  }

  // Remaining: partial melds (pairs already removed as triplet attempt, so check pairs and adjacent)
  i = 0;
  while (i < arr.length) {
    const n = arr[i];
    if (i+1 < arr.length && arr[i+1] === n) { partial++; arr.splice(i, 2); }
    else if (i+1 < arr.length && (arr[i+1] === n+1 || arr[i+1] === n+2)) { partial++; arr.splice(i, 2); }
    else i++;
  }

  return { complete, partial };
}

// ─── Win Detection ────────────────────────────────────────────────────────────

export function checkWin(tiles, melds = []) {
  const meldTiles = melds.reduce((s, m) => s + (m.type === 'kong' ? 4 : 3), 0);
  const needed = 14 - meldTiles;
  if (tiles.length !== needed) return false;

  // Seven pairs
  if (melds.length === 0 && isSevenPairs(tiles)) return true;
  // Thirteen orphans
  if (melds.length === 0 && isThirteenOrphans(tiles)) return true;
  // Standard
  return canFormStandard(tiles, melds.length);
}

function isSevenPairs(tiles) {
  if (tiles.length !== 14) return false;
  const cnt = countKey(tiles);
  return Object.values(cnt).every(v => v === 2);
}

function isThirteenOrphans(tiles) {
  if (tiles.length !== 14) return false;
  const keys = ['man1','man9','pin1','pin9','sou1','sou9','east','south','west','north','chun','hatsu','haku'];
  const cnt = countKey(tiles);
  const hasPair = keys.some(k => cnt[k] >= 2);
  const hasAll = keys.every(k => cnt[k] >= 1);
  return hasAll && hasPair;
}

function canFormStandard(tiles, meldCount) {
  // Try each tile as the pair
  const cnt = countKey(tiles);
  for (const key of Object.keys(cnt)) {
    if (cnt[key] >= 2) {
      const rem = [...tiles];
      let removed = 0;
      const withoutPair = rem.filter(t => { if (removed < 2 && t.key === key) { removed++; return false; } return true; });
      if (canFormMelds(withoutPair, 4 - meldCount)) return true;
    }
  }
  return false;
}

function canFormMelds(tiles, n) {
  if (n === 0) return tiles.length === 0;
  if (tiles.length === 0) return false;

  const sorted = [...tiles].sort((a, b) => {
    const orderKey = (t) => {
      for (let i = 0; i < SUITS.length; i++) if (t.key.startsWith(SUITS[i])) return i*100 + parseInt(t.key.slice(-1));
      return HONOURS.indexOf(t.key) + 400;
    };
    return orderKey(a) - orderKey(b);
  });

  const first = sorted[0];

  // Try triplet
  const matching = sorted.filter(t => t.key === first.key);
  if (matching.length >= 3) {
    const rem = sorted.filter(t => t.key !== first.key);
    const extra = matching.slice(3);
    if (canFormMelds([...rem, ...extra], n - 1)) return true;
  }

  // Try sequence
  const sn = suitNum(first);
  if (sn && sn.num <= 7) {
    const k1 = `${SUITS[sn.suit]}${sn.num+1}`;
    const k2 = `${SUITS[sn.suit]}${sn.num+2}`;
    const i1 = sorted.findIndex((t, i) => i > 0 && t.key === k1);
    const i2 = sorted.findIndex((t, i) => i > 1 && t.key === k2);
    if (i1 !== -1 && i2 !== -1) {
      const rem = sorted.filter((_, i) => i !== 0 && i !== i1 && i !== i2);
      if (canFormMelds(rem, n - 1)) return true;
    }
  }

  return false;
}

// ─── Fan Calculation ──────────────────────────────────────────────────────────

export function calcFan(tiles, melds, winTile, isSelfDraw, seatWind, roundWind, flowers) {
  let fan = 0;
  const allTiles = [...tiles, ...melds.flatMap(m => m.tiles)];
  const cnt = countKey(allTiles);

  // Seven pairs 七對子
  const isSevenPair = melds.length === 0 && isSevenPairs([...tiles]);
  if (isSevenPair) fan = Math.max(fan, 3);

  // Thirteen orphans 十三么
  if (melds.length === 0 && isThirteenOrphans([...tiles])) return { fan: 13, patterns: ['十三么'] };

  // All triplets/quads 對對糊
  const allMelds = [...melds];
  // Check if entire winning hand forms triplets (for non-seven-pairs win)
  const isAllTriplets = checkAllTriplets([...tiles], melds);

  // 刻刻糊 = self-draw all-triplets = 8 fan
  // 對對糊 = all-triplets (no self-draw required) = 3 fan
  if (isAllTriplets) fan = Math.max(fan, isSelfDraw ? 8 : 3);

  // Pure flush 清一色 (one suit only, no honours)
  const isPureFlush = allTiles.every(t => {
    for (const s of SUITS) if (t.key.startsWith(s)) return true;
    return false;
  }) && allTiles.map(t => SUITS.find(s => t.key.startsWith(s))).every((s,_,a) => s === a[0]);
  if (isPureFlush) fan = Math.max(fan, 7);

  // Half flush 混一色 (one suit + honours)
  const suits = new Set(allTiles.filter(t => isSuit(t)).map(t => SUITS.find(s => t.key.startsWith(s))));
  const hasHonours = allTiles.some(t => isHonour(t));
  if (!isPureFlush && suits.size === 1 && hasHonours) fan = Math.max(fan, 3);

  // All honours 字一色
  if (allTiles.every(t => isHonour(t))) fan = Math.max(fan, 10);

  // All terminals & honours 么九
  if (allTiles.every(t => isTerminalOrHonour(t))) fan = Math.max(fan, 10);

  // Nine Gates 九子連環 (pure flush + 1112345678999 + one more of same suit)
  if (isPureFlush && melds.length === 0) {
    const nineGates = checkNineGates(allTiles);
    if (nineGates) fan = Math.max(fan, 10);
  }

  // Big three dragons 大三元 (three triplets of dragons)
  const dragonMelds = countDragonTriplets(allTiles, melds);
  if (dragonMelds === 3) fan = Math.max(fan, 8);
  // Small three dragons 小三元
  if (dragonMelds === 2 && cnt['chun'] >= 2 || dragonMelds === 2 && cnt['hatsu'] >= 2 || dragonMelds === 2 && cnt['haku'] >= 2) {
    // Two dragon triplets + one dragon pair
    const dragonKeys = ['chun','hatsu','haku'];
    const dragonTriples = dragonKeys.filter(k => {
      const inMeld = melds.some(m => m.tiles.every(t => t.key === k));
      if (inMeld) return true;
      return cnt[k] >= 3;
    }).length;
    const dragonPairs = dragonKeys.filter(k => cnt[k] === 2).length;
    if (dragonTriples === 2 && dragonPairs === 1) fan = Math.max(fan, 5);
  }

  // Big four winds 大四喜
  const windKeys = ['east','south','west','north'];
  const windTriples = windKeys.filter(k => {
    const inMeld = melds.some(m => m.tiles[0]?.key === k && m.tiles.length >= 3);
    return inMeld || cnt[k] >= 3;
  }).length;
  if (windTriples === 4) { fan = Math.max(fan, 13); }
  // Small four winds 小四喜
  else if (windTriples === 3 && windKeys.filter(k => cnt[k] === 2).length >= 1) {
    fan = Math.max(fan, 6);
  }

  // Eighteen arhats 十八羅漢 (4 kongs)
  const kongCount = melds.filter(m => m.type === 'kong').length;
  if (kongCount === 4) fan = Math.max(fan, 13);

  // Minimum chicken hand 雞糊
  if (fan < 3) fan = 3;

  // Modifiers
  let total = fan;

  // Self-draw 自摸 +1
  if (isSelfDraw) total += 1;

  // Seat wind triplet +1
  const seatWindKey = WINDS[seatWind];
  if (cnt[seatWindKey] >= 3 || melds.some(m => m.tiles[0]?.key === seatWindKey && m.tiles.length >= 3)) {
    total += 1;
  }

  // Round wind triplet +1
  const roundWindKey = WINDS[roundWind];
  if (roundWindKey !== seatWindKey && (cnt[roundWindKey] >= 3 || melds.some(m => m.tiles[0]?.key === roundWindKey && m.tiles.length >= 3))) {
    total += 1;
  }

  // Dragon triplets 箭刻 +1 each
  for (const dk of ['chun','hatsu','haku']) {
    if (cnt[dk] >= 3 || melds.some(m => m.tiles[0]?.key === dk && m.tiles.length >= 3)) {
      total += 1;
    }
  }

  const patterns = buildPatternList(fan, isSelfDraw, isSevenPair, isAllTriplets, isPureFlush, hasHonours && suits.size===1, allTiles, melds, seatWind, roundWind, kongCount);
  return { fan: total, patterns };
}

function checkAllTriplets(tiles, melds) {
  // All melds must be triplets/kongs; hand must form pair + triplets
  if (melds.some(m => m.type === 'chi')) return false;
  // Try to form pair + triplets from tiles
  const cnt = countKey(tiles);
  for (const key of Object.keys(cnt)) {
    if (cnt[key] >= 2) {
      let rem = [...tiles];
      let removed = 0;
      rem = rem.filter(t => { if (removed < 2 && t.key === key) { removed++; return false; } return true; });
      if (rem.every(t => true) && canFormOnlyTriplets(rem)) return true;
    }
  }
  return false;
}

function canFormOnlyTriplets(tiles) {
  if (tiles.length === 0) return true;
  if (tiles.length % 3 !== 0) return false;
  const cnt = countKey(tiles);
  for (const [key, v] of Object.entries(cnt)) {
    if (v < 3) return false;
    // Remove 3, recurse
    const rem = [...tiles];
    let removed = 0;
    const next = rem.filter(t => { if (removed < 3 && t.key === key) { removed++; return false; } return true; });
    return canFormOnlyTriplets(next);
  }
  return true;
}

function checkNineGates(tiles) {
  const cnt = countKey(tiles);
  const suit = SUITS.find(s => tiles[0]?.key.startsWith(s));
  if (!suit) return false;
  const base = { 1:3,2:1,3:1,4:1,5:1,6:1,7:1,8:1,9:3 };
  for (const [n, min] of Object.entries(base)) {
    if ((cnt[`${suit}${n}`] || 0) < min) return false;
  }
  return true;
}

function countDragonTriplets(allTiles, melds) {
  let count = 0;
  const cnt = countKey(allTiles);
  for (const dk of ['chun','hatsu','haku']) {
    if (cnt[dk] >= 3) count++;
  }
  return count;
}

function buildPatternList(fan, isSelfDraw, isSevenPair, isAllTriplets, isPureFlush, isHalfFlush, allTiles, melds, seatWind, roundWind, kongCount) {
  const p = [];
  if (fan >= 13 && melds.filter(m=>m.type==='kong').length===4) p.push('十八羅漢');
  else if (fan >= 13) {
    const cnt = countKey(allTiles);
    const keys = ['man1','man9','pin1','pin9','sou1','sou9','east','south','west','north','chun','hatsu','haku'];
    if (keys.every(k=>cnt[k])) p.push('十三么');
    else p.push('大四喜');
  }
  else if (fan >= 10) {
    if (allTiles.every(t=>isHonour(t))) p.push('字一色');
    else if (allTiles.every(t=>isTerminalOrHonour(t))) p.push('么九');
    else p.push('九子連環');
  }
  else if (fan >= 8 && !isSelfDraw) p.push('大三元');
  else if (fan >= 8) p.push('刻刻糊');
  else if (fan >= 7) p.push('清一色');
  else if (fan >= 6) p.push('小四喜');
  else if (fan >= 5) p.push('小三元');
  else if (isSevenPair) p.push('七對子');
  else if (isAllTriplets) p.push('對對糊');
  else if (isHalfFlush) p.push('混一色');
  else p.push('雞糊');
  if (isSelfDraw) p.push('自摸+1');
  return p;
}

export function fanToPoints(fan) {
  if (fan <= 3) return 8;
  if (fan === 4) return 16;
  if (fan === 5) return 24;
  if (fan === 6) return 32;
  if (fan === 7) return 48;
  if (fan === 8) return 64;
  if (fan === 9) return 96;
  if (fan <= 12) return 128;
  return 256;
}

// ─── Tenpai Tiles ─────────────────────────────────────────────────────────────

export function getTenpaiTiles(tiles, melds) {
  const results = [];
  const allKeys = [];
  for (const s of SUITS) for (let n = 1; n <= 9; n++) allKeys.push(`${s}${n}`);
  for (const h of HONOURS) allKeys.push(h);

  for (const key of allKeys) {
    const testTile = { id: -1, key };
    const testHand = [...tiles, testTile];
    if (checkWin(testHand, melds)) results.push(key);
  }
  return results;
}

// ─── Hand Analysis ────────────────────────────────────────────────────────────

export function analyzeHand(tiles, melds) {
  const shanten = calcShanten(tiles);
  const tenpai = shanten === 0 ? getTenpaiTiles(tiles, melds) : [];

  // Best discard: tile whose removal gives lowest shanten
  let bestDiscard = null;
  let bestShan = 99;
  for (const t of tiles) {
    const rem = tiles.filter((x, i) => x !== t || i !== tiles.indexOf(t));
    const s = calcShanten(rem);
    if (s < bestShan) { bestShan = s; bestDiscard = t; }
  }

  // Pattern hints
  const hints = [];
  const cnt = countKey(tiles);

  // Seven pairs possibility
  const pairs = Object.values(cnt).filter(v => v >= 2).length;
  if (pairs >= 4) hints.push('七對子方向');

  // All triplets possibility
  if (melds.every(m => m.type !== 'chi')) {
    const trips = Object.values(cnt).filter(v => v >= 3).length;
    if (trips >= 2) hints.push('對對糊方向');
  }

  // Dragon presence
  for (const dk of ['chun','hatsu','haku']) {
    if (cnt[dk] >= 2) hints.push(`${TILE_DISPLAY[dk]}對`);
  }

  // Flush possibility
  const suitTiles = tiles.filter(t => isSuit(t));
  if (suitTiles.length >= 8) {
    const s = new Set(suitTiles.map(t => SUITS.find(s => t.key.startsWith(s))));
    if (s.size === 1) hints.push('清一色方向');
  }

  let msg = '';
  if (shanten < 0) msg = '糊牌！';
  else if (shanten === 0) msg = `差一張！等 ${tenpai.length} 種`;
  else msg = `差 ${shanten} 步`;

  return { shanten, tenpai, bestDiscard, hints, msg };
}
