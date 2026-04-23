// ─── Tile Definitions ────────────────────────────────────────────────────────

export const SUITS = ['man', 'pin', 'sou']; // 萬 筒 索
export const HONOURS = ['east', 'south', 'west', 'north', 'chun', 'hatsu', 'haku']; // 東南西北中發白
export const WINDS = ['east', 'south', 'west', 'north'];
export const DRAGONS = ['chun', 'hatsu', 'haku'];
// Flowers: 1-4 = 梅蘭菊竹 (match seat wind 1-4), 5-8 = 春夏秋冬
export const FLOWERS = ['plum', 'orchid', 'chrysanthemum', 'bamboo', 'spring', 'summer', 'autumn', 'winter'];

export const TILE_DISPLAY = {
  man1:'1萬',man2:'2萬',man3:'3萬',man4:'4萬',man5:'5萬',man6:'6萬',man7:'7萬',man8:'8萬',man9:'9萬',
  pin1:'1筒',pin2:'2筒',pin3:'3筒',pin4:'4筒',pin5:'5筒',pin6:'6筒',pin7:'7筒',pin8:'8筒',pin9:'9筒',
  sou1:'1索',sou2:'2索',sou3:'3索',sou4:'4索',sou5:'5索',sou6:'6索',sou7:'7索',sou8:'8索',sou9:'9索',
  east:'東',south:'南',west:'西',north:'北',chun:'中',hatsu:'發',haku:'白',
  plum:'梅',orchid:'蘭',chrysanthemum:'菊',bamboo:'竹',spring:'春',summer:'夏',autumn:'秋',winter:'冬',
};

// Unicode emoji for tracker only
export const TILE_EMOJI = {
  man1:'🀇',man2:'🀈',man3:'🀉',man4:'🀊',man5:'🀋',man6:'🀌',man7:'🀍',man8:'🀎',man9:'🀏',
  pin1:'🀙',pin2:'🀚',pin3:'🀛',pin4:'🀜',pin5:'🀝',pin6:'🀞',pin7:'🀟',pin8:'🀠',pin9:'🀡',
  sou1:'🀐',sou2:'🀑',sou3:'🀒',sou4:'🀓',sou5:'🀔',sou6:'🀕',sou7:'🀖',sou8:'🀗',sou9:'🀘',
  east:'東',south:'南',west:'西',north:'北',chun:'中',hatsu:'發',haku:'白',
  plum:'梅',orchid:'蘭',chrysanthemum:'菊',bamboo:'竹',spring:'春',summer:'夏',autumn:'秋',winter:'冬',
};

let _uid = 0;
function makeTile(key) { return { id: _uid++, key }; }

export function buildWall() {
  _uid = 0;
  const tiles = [];
  for (const suit of SUITS)
    for (let n = 1; n <= 9; n++)
      for (let c = 0; c < 4; c++) tiles.push(makeTile(`${suit}${n}`));
  for (const h of HONOURS)
    for (let c = 0; c < 4; c++) tiles.push(makeTile(h));
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
    for (let i = 0; i < SUITS.length; i++)
      if (t.key.startsWith(SUITS[i])) return i * 10 + parseInt(t.key.slice(-1));
    const hi = HONOURS.indexOf(t.key);
    if (hi >= 0) return 30 + hi;
    return 40;
  };
  return [...tiles].sort((a, b) => order(a) - order(b));
}

// ─── Shanten Calculation ──────────────────────────────────────────────────────

function suitNumOf(tile) {
  for (let i = 0; i < SUITS.length; i++)
    if (tile.key.startsWith(SUITS[i])) return { suit: i, num: parseInt(tile.key.slice(-1)) };
  return null;
}

function countKey(tiles) {
  const cnt = {};
  for (const t of tiles) cnt[t.key] = (cnt[t.key] || 0) + 1;
  return cnt;
}

export function calcShanten(tiles) {
  if (tiles.length === 0) return 8;
  const cnt = countKey(tiles);

  // Seven pairs
  const pairs = Object.values(cnt).filter(v => v >= 2).length;
  const shantenPairs = 6 - pairs;

  // Thirteen orphans
  const orphanKeys = ['man1','man9','pin1','pin9','sou1','sou9','east','south','west','north','chun','hatsu','haku'];
  const hasOrphan = orphanKeys.filter(k => cnt[k]);
  const hasPairAmongOrphans = hasOrphan.some(k => cnt[k] >= 2);
  const shantenOrphan = 13 - hasOrphan.length - (hasPairAmongOrphans ? 1 : 0);

  // Standard
  const shantenStd = calcShantenStandard(tiles);

  return Math.min(shantenPairs, shantenStd, shantenOrphan);
}

function calcShantenStandard(tiles) {
  const cnt = countKey(tiles);
  let best = 8;

  const tryPair = (pairKey) => {
    let rem = [...tiles];
    let removed = 0;
    rem = rem.filter(t => { if (removed < 2 && t.key === pairKey) { removed++; return false; } return true; });
    const melds = countMelds(rem);
    const needed = 4 - melds.complete;
    const partial = Math.min(melds.partial, needed);
    best = Math.min(best, 8 - 2 * melds.complete - partial);
  };

  const pairCandidates = Object.keys(cnt).filter(k => cnt[k] >= 2);
  if (pairCandidates.length === 0) {
    const melds = countMelds(tiles);
    const needed = 4 - melds.complete;
    const partial = Math.min(melds.partial, needed);
    best = 8 - 2 * melds.complete - partial + 1;
  } else {
    for (const pk of pairCandidates) tryPair(pk);
  }
  return best;
}

function countMelds(tiles) {
  let complete = 0, partial = 0;
  for (const suit of SUITS) {
    const nums = tiles.filter(t => t.key.startsWith(suit)).map(t => parseInt(t.key.slice(-1))).sort((a,b)=>a-b);
    const ex = extractMelds(nums);
    complete += ex.complete; partial += ex.partial;
  }
  const honourCnt = {};
  for (const t of tiles.filter(t => isHonour(t))) honourCnt[t.key] = (honourCnt[t.key]||0)+1;
  for (const v of Object.values(honourCnt)) {
    if (v >= 3) complete++; else if (v === 2) partial++;
  }
  return { complete, partial };
}

function extractMelds(nums) {
  const arr = [...nums];
  let complete = 0, partial = 0;
  let i = 0;
  while (i < arr.length) {
    if (i+2 < arr.length && arr[i]===arr[i+1] && arr[i]===arr[i+2]) { complete++; arr.splice(i,3); } else i++;
  }
  i = 0;
  while (i < arr.length) {
    const n = arr[i], j = arr.indexOf(n+1), k = arr.indexOf(n+2, j+1);
    if (j!==-1 && k!==-1) { complete++; arr.splice(k,1); arr.splice(j,1); arr.splice(i,1); } else i++;
  }
  i = 0;
  while (i < arr.length) {
    const n = arr[i];
    if (i+1<arr.length && arr[i+1]===n) { partial++; arr.splice(i,2); }
    else if (i+1<arr.length && (arr[i+1]===n+1||arr[i+1]===n+2)) { partial++; arr.splice(i,2); }
    else i++;
  }
  return { complete, partial };
}

// ─── Win Detection ────────────────────────────────────────────────────────────

export function checkWin(tiles, melds = []) {
  const meldTiles = melds.reduce((s, m) => s + (m.type === 'kong' ? 4 : 3), 0);
  const needed = 14 - meldTiles;
  if (tiles.length !== needed) return false;
  if (melds.length === 0 && isSevenPairs(tiles)) return true;
  if (melds.length === 0 && isThirteenOrphans(tiles)) return true;
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
  return keys.every(k => cnt[k] >= 1) && keys.some(k => cnt[k] >= 2);
}

function canFormStandard(tiles, meldCount) {
  const cnt = countKey(tiles);
  for (const key of Object.keys(cnt)) {
    if (cnt[key] >= 2) {
      const rem = [...tiles];
      let removed = 0;
      const withoutPair = rem.filter(t => { if (removed<2 && t.key===key){removed++;return false;} return true; });
      if (canFormMelds(withoutPair, 4 - meldCount)) return true;
    }
  }
  return false;
}

function canFormMelds(tiles, n) {
  if (n === 0) return tiles.length === 0;
  if (tiles.length === 0) return false;
  const sorted = [...tiles].sort((a,b) => {
    const o = t => {
      for (let i=0;i<SUITS.length;i++) if(t.key.startsWith(SUITS[i])) return i*100+parseInt(t.key.slice(-1));
      return HONOURS.indexOf(t.key)+400;
    };
    return o(a)-o(b);
  });
  const first = sorted[0];
  const matching = sorted.filter(t => t.key===first.key);
  if (matching.length >= 3) {
    const rem = sorted.filter(t => t.key!==first.key);
    const extra = matching.slice(3);
    if (canFormMelds([...rem,...extra], n-1)) return true;
  }
  const sn = suitNumOf(first);
  if (sn && sn.num <= 7) {
    const k1=`${SUITS[sn.suit]}${sn.num+1}`, k2=`${SUITS[sn.suit]}${sn.num+2}`;
    const i1=sorted.findIndex((t,i)=>i>0&&t.key===k1);
    const i2=sorted.findIndex((t,i)=>i>1&&t.key===k2);
    if (i1!==-1 && i2!==-1) {
      const rem=sorted.filter((_,i)=>i!==0&&i!==i1&&i!==i2);
      if (canFormMelds(rem, n-1)) return true;
    }
  }
  return false;
}

// ─── Fan Calculation ──────────────────────────────────────────────────────────
// Per HK rules: fan 1=4pts, fan 2=8, 3=16, 4=32, 5=48, 6=64, 7=96, 8=128, 9=192, 10=256
// Self-draw (自摸): winner gets triple from each other player

export function calcFan(tiles, melds, winTile, isSelfDraw, seatWind, roundWind, flowers) {
  const allTiles = [...tiles, ...melds.flatMap(m => m.tiles)];
  const cnt = countKey(allTiles);
  const patterns = [];
  let fan = 0;

  // ── Special hands ──
  // Thirteen orphans 十三么
  if (melds.length === 0 && isThirteenOrphans(tiles)) {
    return { fan: 99, patterns: ['十三么'] }; // 爆棚
  }

  // Seven pairs 七對子 — no extra fan, but counts as win
  const isSevenPair = melds.length === 0 && isSevenPairs(tiles);

  // All triplets 對對胡 (no chi melds, all triplets)
  const isAllTriplets = !isSevenPair && checkAllTriplets(tiles, melds);

  // 坎坎胡 = all triplets + no chi + self-draw
  const isKanKan = isAllTriplets && !melds.some(m=>m.type==='chi') && isSelfDraw;
  if (isKanKan) { fan = Math.max(fan, 7); patterns.push('坎坎胡'); }
  else if (isAllTriplets) { fan = Math.max(fan, 3); patterns.push('對對胡'); }

  // Pure flush 清一色
  const isPureFlush = allTiles.every(t=>isSuit(t)) &&
    (() => { const s=new Set(allTiles.map(t=>SUITS.find(x=>t.key.startsWith(x)))); return s.size===1; })();
  // Nine Gates 九子連環 (pure flush, concealed, 1112345678999 + 1 extra)
  if (isPureFlush && melds.length===0 && checkNineGates(allTiles)) {
    return { fan: 99, patterns: ['九子連環'] };
  }
  if (isPureFlush) { fan = Math.max(fan, 7); if(!patterns.length)patterns.push('清一色'); }

  // Half flush 混一色
  const suits = new Set(allTiles.filter(t=>isSuit(t)).map(t=>SUITS.find(s=>t.key.startsWith(s))));
  const hasHonours = allTiles.some(t=>isHonour(t));
  if (!isPureFlush && suits.size===1 && hasHonours) { fan=Math.max(fan,3); if(!patterns.length)patterns.push('混一色'); }

  // All honours 字一色
  if (allTiles.every(t=>isHonour(t))) { return { fan:99, patterns:['字一色'] }; }

  // All terminals & honours 全么九
  if (allTiles.every(t=>isTerminalOrHonour(t))) { return { fan:99, patterns:['全么九'] }; }

  // Big four winds 大四喜
  const windTriplets = WINDS.filter(k => cnt[k]>=3 || melds.some(m=>m.tiles[0]?.key===k&&m.tiles.length>=3));
  if (windTriplets.length===4) { return { fan:99, patterns:['大四喜'] }; }
  // Small four winds 小四喜
  else if (windTriplets.length===3 && WINDS.some(k=>cnt[k]===2&&!windTriplets.includes(k))) {
    fan=Math.max(fan,99); patterns.push('小四喜');
    return { fan:99, patterns:['小四喜'] };
  }

  // Big three dragons 大三元
  const dragonTriplets = DRAGONS.filter(k => cnt[k]>=3 || melds.some(m=>m.tiles[0]?.key===k&&m.tiles.length>=3));
  if (dragonTriplets.length===3) { return { fan:99, patterns:['大三元'] }; }
  // Small three dragons 小三元
  if (dragonTriplets.length===2 && DRAGONS.some(k=>cnt[k]===2&&!dragonTriplets.includes(k))) {
    fan=Math.max(fan,5); if(!patterns.length)patterns.push('小三元');
  }

  // Eighteen arhats 十八羅漢
  if (melds.filter(m=>m.type==='kong').length===4) { return { fan:99, patterns:['十八羅漢'] }; }

  // Plain hand 平胡 (+1 fan bonus, only sequences + pair, no honours in melds)
  const isPingHu = !isSevenPair && !isAllTriplets && !isPureFlush && !hasHonours &&
    melds.every(m=>m.type==='chi') && !allTiles.some(t=>isHonour(t));
  // (平胡 is a modifier, handled below)

  if (fan === 0) fan = 1; // Base: 1 fan

  // ── Modifiers (+fan) ──

  // 自摸 +1
  if (isSelfDraw) { fan+=1; patterns.push('自摸'); }

  // 平胡 +1 (all sequences, no honours)
  if (isPingHu) { fan+=1; patterns.push('平胡'); }

  // 無花 +1 (no flowers at all)
  if (!flowers || flowers.length===0) { fan+=1; patterns.push('無花'); }

  // 正花 +1 per matching seat flower (梅蘭菊竹 index 0-3 matches seat wind 0-3)
  if (flowers) {
    for (const f of flowers) {
      const fi = FLOWERS.indexOf(f.key);
      if (fi>=0 && fi<4 && fi===seatWind) { fan+=1; patterns.push(`正花(${TILE_DISPLAY[f.key]})`); }
    }
    // 一台花 +2: full set of 春夏秋冬 or 梅蘭菊竹
    const flowerKeys = flowers.map(f=>f.key);
    const hasSpring4 = ['spring','summer','autumn','winter'].every(k=>flowerKeys.includes(k));
    const hasBamboo4 = ['plum','orchid','chrysanthemum','bamboo'].every(k=>flowerKeys.includes(k));
    if (hasSpring4||hasBamboo4) { fan+=2; patterns.push('一台花'); }
  }

  // 門風 +1 (seat wind triplet)
  const seatWindKey = WINDS[seatWind];
  if (cnt[seatWindKey]>=3||melds.some(m=>m.tiles[0]?.key===seatWindKey&&m.tiles.length>=3)) {
    fan+=1; patterns.push(`門風(${TILE_DISPLAY[seatWindKey]})`);
  }

  // 圈風 +1 (round wind triplet, if different from seat)
  const roundWindKey = WINDS[roundWind];
  if (roundWindKey!==seatWindKey && (cnt[roundWindKey]>=3||melds.some(m=>m.tiles[0]?.key===roundWindKey&&m.tiles.length>=3))) {
    fan+=1; patterns.push(`圈風(${TILE_DISPLAY[roundWindKey]})`);
  }

  // 中發白 箭刻 +1 each
  for (const dk of DRAGONS) {
    if (cnt[dk]>=3||melds.some(m=>m.tiles[0]?.key===dk&&m.tiles.length>=3)) {
      fan+=1; patterns.push(`${TILE_DISPLAY[dk]}刻`);
    }
  }

  if (!patterns.length || patterns.every(p=>['自摸','平胡','無花'].includes(p))) {
    patterns.unshift('雞胡');
  }

  return { fan, patterns };
}

function checkAllTriplets(tiles, melds) {
  if (melds.some(m=>m.type==='chi')) return false;
  const cnt = countKey(tiles);
  for (const key of Object.keys(cnt)) {
    if (cnt[key]>=2) {
      let rem=[...tiles], removed=0;
      rem=rem.filter(t=>{if(removed<2&&t.key===key){removed++;return false;}return true;});
      if (canFormOnlyTriplets(rem)) return true;
    }
  }
  return false;
}

function canFormOnlyTriplets(tiles) {
  if (tiles.length===0) return true;
  if (tiles.length%3!==0) return false;
  const cnt=countKey(tiles);
  for (const [key,v] of Object.entries(cnt)) {
    if (v<3) return false;
    const rem=[...tiles]; let rm=0;
    const next=rem.filter(t=>{if(rm<3&&t.key===key){rm++;return false;}return true;});
    return canFormOnlyTriplets(next);
  }
  return true;
}

function checkNineGates(tiles) {
  const cnt=countKey(tiles);
  const suit=SUITS.find(s=>tiles[0]?.key.startsWith(s));
  if(!suit) return false;
  const base={1:3,2:1,3:1,4:1,5:1,6:1,7:1,8:1,9:3};
  return Object.entries(base).every(([n,min])=>(cnt[`${suit}${n}`]||0)>=min);
}

// Per agames HK rules: 1番=4, 2番=8, 3番=16, 4番=32, 5番=48, 6番=64, 7番=96, 8番=128, 9番=192, 10番+=256
export function fanToPoints(fan) {
  if (fan >= 99) return 256; // 爆棚
  const table = [0,4,8,16,32,48,64,96,128,192,256];
  if (fan <= 10) return table[fan];
  return 256;
}

// ─── Tenpai ──────────────────────────────────────────────────────────────────

export function getTenpaiTiles(tiles, melds) {
  const results=[];
  const allKeys=[];
  for (const s of SUITS) for (let n=1;n<=9;n++) allKeys.push(`${s}${n}`);
  for (const h of HONOURS) allKeys.push(h);
  for (const key of allKeys) {
    if (checkWin([...tiles,{id:-1,key}], melds)) results.push(key);
  }
  return results;
}

// ─── Hand Analysis ────────────────────────────────────────────────────────────

export function analyzeHand(tiles, melds) {
  const shanten=calcShanten(tiles);
  const tenpai=shanten===0?getTenpaiTiles(tiles,melds):[];

  let bestDiscard=null, bestShan=99;
  for (const t of tiles) {
    const rem=tiles.filter((x,i)=>i!==tiles.indexOf(t));
    const s=calcShanten(rem);
    if(s<bestShan){bestShan=s;bestDiscard=t;}
  }

  const hints=[];
  const cnt=countKey(tiles);
  const pairs=Object.values(cnt).filter(v=>v>=2).length;
  if(pairs>=4) hints.push('七對子');
  if(melds.every(m=>m.type!=='chi')&&Object.values(cnt).filter(v=>v>=3).length>=2) hints.push('對對胡');
  for(const dk of DRAGONS) if(cnt[dk]>=2) hints.push(`${TILE_DISPLAY[dk]}對`);
  const suitTiles=tiles.filter(t=>isSuit(t));
  if(suitTiles.length>=8){const s=new Set(suitTiles.map(t=>SUITS.find(x=>t.key.startsWith(x))));if(s.size===1)hints.push('清一色');}

  let msg='';
  if(shanten<0) msg='胡牌！';
  else if(shanten===0) msg=`聽牌！等 ${tenpai.length} 種`;
  else msg=`差 ${shanten} 步`;

  return {shanten,tenpai,bestDiscard,hints,msg};
}
