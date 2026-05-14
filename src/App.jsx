import { useState, useEffect, useCallback } from 'react';
import './index.css';
import {
  SUITS, HONOURS, WINDS, FLOWERS, TILE_EMOJI, TILE_DISPLAY,
  sortHand, analyzeHand, calcFan, fanToPoints, analyzeDanger,
} from './game/tiles.js';
import {
  createSession, startHand, drawTile, doDiscard,
  aiTurn, playerClaimWin, playerPong, playerKongFromDiscard, playerChi, playerPass, advanceSession,
  declareAnKong, declareAddKong, runOneGame
} from './game/gameEngine.js';
import { STRATEGIES, scanBestLane, LANE_LABELS } from './ai/strategies.js';

// ─── Constants ────────────────────────────────────────────────────────────────
const WIND_LABELS = ['東','南','西','北'];
const FLOWER_NAMES = { plum:'梅',orchid:'蘭',chrysanthemum:'菊',bamboo:'竹',spring:'春',summer:'夏',autumn:'秋',winter:'冬' };
const SUIT_LABEL = { man:'萬', pin:'筒', sou:'索' };

// ─── Tile SVG art ────────────────────────────────────────────────────────────
const CN_NUM = ['一','二','三','四','五','六','七','八','九'];
const HONOUR_COLOR = {
  east:'#1a1a1a', south:'#1a1a1a', west:'#1a1a1a', north:'#1a1a1a',
  chun:'#c0392b', hatsu:'#1a7a3c', haku:'#1a6ea8',
};
const FLOWER_COLOR = {
  plum:'#c0392b', orchid:'#8e44ad', chrysanthemum:'#d35400', bamboo:'#1a7a3c',
  spring:'#1a7a3c', summer:'#d35400', autumn:'#c0392b', winter:'#2980b9',
};

// ── 筒 (Pin / Dots) ──────────────────────────────────────────────────────────
// Positions from reference screenshots — EXACT pixel-matched:
// 2筒: one TL + one BR (diagonal)
// 3筒: BL + centre + TR (diagonal)
// 4筒: 2×2 corners
// 5筒: 4 corners + centre
// 6筒: 2 cols × 3 rows
// 7筒: 3 top + 2 mid + 2 bot
// 8筒: 2 × 4 rows
// 9筒: 3 × 3
const P_POS = {
  1: [[50,50]],
  2: [[33,30],[67,70]],
  3: [[26,74],[50,50],[74,26]],
  4: [[33,30],[67,30],[33,70],[67,70]],
  5: [[33,22],[67,22],[50,50],[33,78],[67,78]],
  6: [[33,18],[67,18],[33,50],[67,50],[33,82],[67,82]],
  7: [[26,18],[50,18],[74,18],[33,50],[67,50],[33,82],[67,82]],
  8: [[33,12],[67,12],[33,37],[67,37],[33,63],[67,63],[33,88],[67,88]],
  9: [[24,18],[50,18],[76,18],[24,50],[50,50],[76,50],[24,82],[50,82],[76,82]],
};
// Colours per dot — from handover doc spec (exact):
// 1筒: red centre mandala
// 2筒: bottom=blue top=green → [top-left=green, bottom-right=blue]
// 3筒: BL=blue, C=red, TR=green
// 4筒: TL=green, TR=blue, BL=blue, BR=green
// 5筒: TL=green, TR=blue, C=red, BL=blue, BR=green
// 6筒: top2=green, mid2=red, bot2=red (2 cols × 3 rows: top row green, others red)
// 7筒: 3 top green, 2 mid = TL-green/TR-red, 2 bot = TL-red/TR-green (complex)
//      Simplify: top3=green, then 4 below alternating
// 8筒: all blue
// 9筒: top row blue, mid row red, bot row green
const B='#1a6ea8', R='#c0392b', G='#1a7a3c';
const P_COL = {
  1: [R],
  2: [G, B],
  3: [B, R, G],
  4: [G, B, B, G],
  5: [G, B, R, B, G],
  6: [G, G, R, R, R, R],
  7: [G, G, G, G, R, R, G],
  8: [B, B, B, B, B, B, B, B],
  9: [B, B, B, R, R, R, G, G, G],
};

function PinDot({ cx, cy, r, color, is1Pin }) {
  if (is1Pin) {
    // 1筒 mandala: red outer → white → green → white → red centre
    return (
      <g>
        <circle cx={cx} cy={cy} r={r}       fill="#c0392b"/>
        <circle cx={cx} cy={cy} r={r*0.76}  fill="white"/>
        <circle cx={cx} cy={cy} r={r*0.58}  fill="#1a7a3c"/>
        <circle cx={cx} cy={cy} r={r*0.35}  fill="white"/>
        <circle cx={cx} cy={cy} r={r*0.18}  fill="#c0392b"/>
      </g>
    );
  }
  // Standard dot: coloured outer → white ring → coloured inner
  return (
    <g>
      <circle cx={cx} cy={cy} r={r}       fill={color}/>
      <circle cx={cx} cy={cy} r={r*0.65}  fill="white"/>
      <circle cx={cx} cy={cy} r={r*0.40}  fill={color}/>
    </g>
  );
}

function PinFace({ n, isSmall }) {
  const pos = P_POS[n] || [], col = P_COL[n] || [];
  // 1筒 gets a large mandala radius; others get standard dot radius
  const r = n === 1 ? (isSmall ? 32 : 40) : (isSmall ? 10 : 13);
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" style={{display:'block'}}>
      {pos.map(([cx,cy],i) => <PinDot key={i} cx={cx} cy={cy} r={r} color={col[i]||B} is1Pin={n===1}/>)}
    </svg>
  );
}

// ── 索 (Sou / Bamboo) ────────────────────────────────────────────────────────
// From screenshots: thin tall vertical green sticks, evenly spread across tile width
// Stick width ≈ 8-10% of tile, height ≈ 65-75% of tile
// Each stick: green rounded rect with a lighter left edge highlight + dark band in middle
// 1索: green bird facing right
// 8索: W (top) + M (bottom) arch shapes in thick green strokes

function BambooStick({ cx, cy, w, h, color }) {
  const isRed = color === '#c0392b';
  const dark = isRed ? '#7a1208' : '#0a3518';
  const light = 'rgba(255,255,255,0.35)';
  return (
    <g>
      {/* Main stick body */}
      <rect x={cx-w/2} y={cy-h/2} width={w} height={h} rx={w*0.38} ry={w*0.38} fill={color}/>
      {/* Left highlight stripe */}
      <rect x={cx-w/2+1} y={cy-h/2+3} width={w*0.28} height={h-6} rx={1} fill={light}/>
      {/* Dark band across middle (joint) */}
      <rect x={cx-w/2} y={cy-2} width={w} height={4} rx={2} fill={dark} opacity={0.55}/>
    </g>
  );
}

// 1索: green bird facing right with tail feathers
function Sou1Face() {
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" style={{display:'block'}}>
      <line x1={15} y1={82} x2={85} y2={80} stroke="#5a3a10" strokeWidth={3} strokeLinecap="round"/>
      <line x1={52} y1={81} x2={52} y2={92} stroke="#5a3a10" strokeWidth={2.5} strokeLinecap="round"/>
      {/* Body */}
      <ellipse cx={50} cy={60} rx={18} ry={13} fill="#1a7a3c"/>
      {/* Wing highlight */}
      <ellipse cx={38} cy={63} rx={13} ry={8} fill="#27ae60" transform="rotate(-10,38,63)"/>
      {/* Head */}
      <circle cx={68} cy={47} r={12} fill="#1a7a3c"/>
      {/* Eye */}
      <circle cx={72} cy={43} r={3.5} fill="white"/>
      <circle cx={73} cy={43} r={1.8} fill="#111"/>
      {/* Beak */}
      <polygon points="76,48 88,44 76,51" fill="#e8b84d"/>
      {/* Crest */}
      <path d="M65,37 Q61,23 66,16" stroke="#1a7a3c" strokeWidth={3.5} fill="none" strokeLinecap="round"/>
      <path d="M70,36 Q70,21 75,15" stroke="#27ae60" strokeWidth={2.5} fill="none" strokeLinecap="round"/>
      {/* Tail feathers */}
      <path d="M33,62 Q10,46 12,26" stroke="#1a7a3c" strokeWidth={4} fill="none" strokeLinecap="round"/>
      <path d="M31,67 Q8,58 10,42"  stroke="#27ae60" strokeWidth={3} fill="none" strokeLinecap="round"/>
      <path d="M33,72 Q12,74 14,62" stroke="#c0392b" strokeWidth={3} fill="none" strokeLinecap="round"/>
      <path d="M35,76 Q18,82 20,72" stroke="#e8b84d" strokeWidth={2.5} fill="none" strokeLinecap="round"/>
    </svg>
  );
}

// 8索: W shape on top + M shape on bottom — bold thick green strokes
function Sou8Face({ isSmall }) {
  const g = '#1a7a3c';
  const sw = isSmall ? 5 : 8.5;
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" style={{display:'block'}}>
      <path d="M5,42 L22,8 L50,34 L78,8 L95,42"
        stroke={g} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      <path d="M5,58 L22,92 L50,66 L78,92 L95,58"
        stroke={g} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      <path d="M5,42 L22,8 L50,34 L78,8 L95,42"
        stroke="rgba(255,255,255,0.2)" strokeWidth={sw*0.35} strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      <path d="M5,58 L22,92 L50,66 L78,92 L95,58"
        stroke="rgba(255,255,255,0.2)" strokeWidth={sw*0.35} strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  );
}

// Sou stick grid layouts — cx spread evenly, cy always centred at 50
// Sticks are TALL (nearly full tile height) and THIN, spread horizontally
const S_POS = {
  2:  [[35,50],[65,50]],
  3:  [[25,50],[50,50],[75,50]],
  4:  [[35,28],[65,28],[35,72],[65,72]],
  5:  [[35,20],[65,20],[50,50],[35,80],[65,80]],
  6:  [[35,17],[65,17],[35,50],[65,50],[35,83],[65,83]],
  7:  [[50,12],[35,35],[65,35],[35,58],[65,58],[35,82],[65,82]],
  9:  [[25,17],[50,17],[75,17],[25,50],[50,50],[75,50],[25,83],[50,83],[75,83]],
};
const S_COL = {
  2: [GREEN, GREEN],
  3: [GREEN, GREEN, GREEN],
  4: [GREEN, GREEN, GREEN, GREEN],
  5: [GREEN, GREEN, RED,   GREEN, GREEN],
  6: [GREEN, GREEN, GREEN, GREEN, GREEN, GREEN],
  7: [RED,   GREEN, GREEN, GREEN, GREEN, GREEN, GREEN],
  9: [GREEN, GREEN, GREEN, GREEN, GREEN, GREEN, GREEN, GREEN, GREEN],
};

function SouFace({ n, isSmall }) {
  if (n===1) return <Sou1Face/>;
  if (n===8) return <Sou8Face isSmall={isSmall}/>;
  const pos = S_POS[n]||[], col = S_COL[n]||[];
  // Width: narrow sticks. Height: tall — fills most of the tile per row
  // Single-row tiles (2,3): sticks nearly full tile height
  // Multi-row tiles (4,5,6,7,9): shorter per stick to fit rows
  const rowCount = { 2:1, 3:1, 4:2, 5:3, 6:3, 7:4, 9:3 }[n] || 2;
  const sw = isSmall ? 6 : 10;
  const sh = isSmall
    ? Math.round(30 / rowCount)
    : Math.round(50 / rowCount);
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" style={{display:'block'}}>
      {pos.map(([cx,cy],i) => (
        <BambooStick key={i} cx={cx} cy={cy} w={sw} h={sh} color={col[i]||G}/>
      ))}
    </svg>
  );
}

// ── 萬 (Man) ─────────────────────────────────────────────────────────────────
// From screenshots: large bold black Chinese numeral, red 萬 below, both filling the tile
function ManFace({ n, isSmall }) {
  const numSz = isSmall ? '1.1em' : '1.7em';
  const wanSz = isSmall ? '0.72em' : '1.1em';
  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
      height:'100%',gap:0,lineHeight:1}}>
      <span style={{fontSize:numSz,fontWeight:900,color:'#1a1a1a',lineHeight:1.05}}>{CN_NUM[n-1]}</span>
      <span style={{fontSize:wanSz,fontWeight:900,color:'#c0392b',lineHeight:1}}>萬</span>
    </div>
  );
}

// ── Honour tiles ──────────────────────────────────────────────────────────────
// 白板: white tile with blue double-border rectangle only — no character
// Others: large bold character filling tile
function HonourFace({ tkey, isSmall }) {
  if (tkey === 'haku') {
    return (
      <svg viewBox="0 0 100 100" width="100%" height="100%" style={{display:'block'}}>
        <rect x={10} y={6} width={80} height={88} rx={5} fill="white" stroke="#1a6ea8" strokeWidth={6}/>
        <rect x={18} y={14} width={64} height={72} rx={3} fill="none" stroke="#1a6ea8" strokeWidth={3}/>
      </svg>
    );
  }
  const sz = isSmall ? '1.05em' : '1.65em';
  return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100%'}}>
      <span style={{fontSize:sz,fontWeight:900,color:HONOUR_COLOR[tkey]||'#1a1a1a',lineHeight:1}}>
        {TILE_DISPLAY[tkey]||tkey}
      </span>
    </div>
  );
}

const FLOWER_META = {
  plum:         { ch:'梅', n:'一', emoji:'🌸', isSeason:false },
  orchid:       { ch:'蘭', n:'二', emoji:'🌺', isSeason:false },
  chrysanthemum:{ ch:'菊', n:'三', emoji:'🌼', isSeason:false },
  bamboo:       { ch:'竹', n:'四', emoji:'🎋', isSeason:false },
  spring:       { ch:'春', n:'1', emoji:'🌱', isSeason:true },
  summer:       { ch:'夏', n:'2', emoji:'☀️', isSeason:true },
  autumn:       { ch:'秋', n:'3', emoji:'🍂', isSeason:true },
  winter:       { ch:'冬', n:'4', emoji:'❄️', isSeason:true },
};

function FlowerFace({ tkey, isSmall }) {
  const meta = FLOWER_META[tkey] || { ch:tkey, n:'', emoji:'🌸', isSeason:false };
  const color = FLOWER_COLOR[tkey] || '#888';
  // Flowers: number on right in red (梅一,蘭二,菊三,竹四)
  // Seasons: number on left in blue (春1,夏2,秋3,冬4)
  const numColor = meta.isSeason ? '#1a6ea8' : '#c0392b';

  if (isSmall) {
    return (
      <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
        height:'100%',lineHeight:1,position:'relative',overflow:'hidden'}}>
        <span style={{fontSize:'0.85em',lineHeight:1}}>{meta.emoji}</span>
        <div style={{display:'flex',alignItems:'center',gap:1,lineHeight:1}}>
          {meta.isSeason && <span style={{fontSize:'0.42em',fontWeight:900,color:numColor}}>{meta.n}</span>}
          <span style={{fontSize:'0.5em',fontWeight:800,color}}>{meta.ch}</span>
          {!meta.isSeason && <span style={{fontSize:'0.42em',fontWeight:900,color:numColor}}>{meta.n}</span>}
        </div>
      </div>
    );
  }
  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
      height:'100%',lineHeight:1,position:'relative'}}>
      <span style={{fontSize:'1.3em',lineHeight:1}}>{meta.emoji}</span>
      <div style={{display:'flex',alignItems:'center',gap:2,lineHeight:1,marginTop:1}}>
        {meta.isSeason && <span style={{fontSize:'0.5em',fontWeight:900,color:numColor,lineHeight:1}}>{meta.n}</span>}
        <span style={{fontSize:'0.65em',fontWeight:900,color,lineHeight:1}}>{meta.ch}</span>
        {!meta.isSeason && <span style={{fontSize:'0.5em',fontWeight:900,color:numColor,lineHeight:1}}>{meta.n}</span>}
      </div>
    </div>
  );
}
function TileFace({ tkey, isSmall }) {
  for (const s of SUITS) {
    if (tkey.startsWith(s) && /\d$/.test(tkey)) {
      const n = parseInt(tkey.slice(s.length));
      if (s==='man') return <ManFace n={n} isSmall={isSmall}/>;
      if (s==='pin') return <PinFace n={n} isSmall={isSmall}/>;
      if (s==='sou') return <SouFace n={n} isSmall={isSmall}/>;
    }
  }
  if (FLOWERS.includes(tkey)) return <FlowerFace tkey={tkey} isSmall={isSmall}/>;
  return <HonourFace tkey={tkey} isSmall={isSmall}/>;
}

// ─── Tile Component ───────────────────────────────────────────────────────────
function Tile({ tile, selected, drawn, small, inDiscard, highlighted, dimmed, hint, hintBest, danger, onClick, onMouseEnter, onMouseLeave }) {
  const dangerCls = danger===3?'danger-high':danger===2?'danger-mid':danger===0?'danger-safe':'';
  const cn = [
    'mj-tile',
    small&&'small',
    selected&&'sel',
    drawn&&'drawn',
    inDiscard&&'in-discard',
    highlighted&&'highlighted',
    dimmed&&'dimmed',
    hint&&'hint-tile',
    hintBest&&'hint-best',
    dangerCls,
  ].filter(Boolean).join(' ');
  return (
    <div className={cn} onClick={onClick} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}
      title={TILE_DISPLAY[tile.key]||tile.key}>
      <TileFace tkey={tile.key} isSmall={small}/>
      {hintBest && <div className="hint-banner hint-banner-best">建議打出</div>}
      {hint && !hintBest && <div className="hint-banner hint-banner-ok">打→聽牌</div>}
      {danger===3 && !small && <div className="danger-badge">⚠</div>}
      {danger===0 && !small && <div className="safe-badge">✓</div>}
    </div>
  );
}
function TileBack({ small }) {
  return (
    <div className={`mj-tile back${small?' small':''}`}>
      <svg viewBox="0 0 100 100" width="100%" height="100%" style={{display:'block',opacity:.28}}>
        <rect x={10} y={10} width={80} height={80} rx={6} fill="none" stroke="#c8973a" strokeWidth={3}/>
        <rect x={20} y={20} width={60} height={60} rx={4} fill="none" stroke="#c8973a" strokeWidth={1.5}/>
        <line x1={10} y1={10} x2={90} y2={90} stroke="#c8973a" strokeWidth={1} opacity={.4}/>
        <line x1={90} y1={10} x2={10} y2={90} stroke="#c8973a" strokeWidth={1} opacity={.4}/>
      </svg>
    </div>
  );
}

// ─── Tenpai Tooltip ───────────────────────────────────────────────────────────
function TenpaiTooltip({ discardInfo, visible }) {
  if (!visible || !discardInfo) return null;
  const { shantenAfter, tenpai, leadsToTenpai } = discardInfo;
  if (!leadsToTenpai) {
    return (
      <div className="tenpai-tooltip">
        <div className="tt-title">打出後</div>
        <div className="tt-shanten">差 {shantenAfter} 步聽牌</div>
      </div>
    );
  }
  const total = tenpai.reduce((s,d)=>s+d.remaining,0);
  return (
    <div className="tenpai-tooltip">
      <div className="tt-title">聽牌！共 <span className="tt-total">{total}</span> 張</div>
      <div className="tt-wins">
        {tenpai.map(d=>(
          <div key={d.key} className={`tt-win-tile ${d.remaining===0?'tt-dead':''}`}>
            <div className="tt-win-face">
              <TileFace tkey={d.key} isSmall/>
            </div>
            <span className="tt-win-name">{TILE_DISPLAY[d.key]}</span>
            <span className="tt-win-cnt">{d.remaining}張</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Danger Tooltip ─────────────────────────────────────────────────────────
const DANGER_LABELS = ['✓ 安全（已打出）','≈ 相對安全（筋牌）','? 不明','⚠ 危險（可能出沖）'];
const DANGER_COLORS = ['#27ae60','#f39c12','#aaa','#e74c3c'];
function DangerTooltip({ dangerLevel, discardInfo, visible }) {
  if (!visible || dangerLevel < 0) return null;
  return (
    <div className="tenpai-tooltip" style={{minWidth:130}}>
      <div style={{color:DANGER_COLORS[dangerLevel]||'#aaa',fontWeight:700,fontSize:'.75rem',marginBottom:4}}>
        {DANGER_LABELS[dangerLevel]||'不明'}
      </div>
      {discardInfo?.leadsToTenpai && (
        <div style={{fontSize:'.65rem',color:'#27ae60'}}>
          打出可聽牌 · {discardInfo.tenpai.reduce((s,d)=>s+d.remaining,0)}張
        </div>
      )}
      {discardInfo && !discardInfo.leadsToTenpai && discardInfo.shantenAfter!==undefined && (
        <div style={{fontSize:'.65rem',color:'var(--dim)'}}>
          打出後差{discardInfo.shantenAfter}步
        </div>
      )}
    </div>
  );
}

// ─── Tile Tracker ─────────────────────────────────────────────────────────────
function TileTracker({ hand, discards, melds, highlightKey, debug, wall }) {
  // In debug mode: show tiles remaining in wall only
  // In normal mode: show 4 minus what we've seen (hand + discards + melds)
  const seen = {};
  const count = t => { seen[t.key]=(seen[t.key]||0)+1; };
  hand.forEach(count);
  discards.flat().forEach(count);
  melds.flat().flatMap(m=>m.tiles).forEach(count);
  // Wall count per key
  const wallCount = {};
  if (debug && wall) {
    for (const t of wall) wallCount[t.key]=(wallCount[t.key]||0)+1;
  }
  const rem = key => debug && wall
    ? Math.max(0, wallCount[key]||0)
    : Math.max(0, 4-(seen[key]||0));
  const rows = [
    ...SUITS.map(s=>({ label:SUIT_LABEL[s], tiles:Array.from({length:9},(_,i)=>`${s}${i+1}`) })),
    { label:'字', tiles:HONOURS },
  ];
  return (
    <div className="tracker-panel">
      <div className="tracker-title">剩牌追蹤</div>
      {rows.map(row=>(
        <div key={row.label} className="tracker-suit-row">
          <span className="tracker-slbl">{row.label}</span>
          {row.tiles.map(key=>{
            const r=rem(key);
            const isHl = highlightKey===key;
            return (
              <div key={key} className={`tracker-tile av-${r}${isHl?' tracker-hl':''}`}
                title={`${TILE_DISPLAY[key]} 餘${r}張`}
                style={{position:'relative', overflow:'visible'}}>
                <TileFace tkey={key} isSmall/>
                <span className="tcnt">{r}</span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ─── Flower Row ───────────────────────────────────────────────────────────────
function FlowerRow({ flowers }) {
  if (!flowers?.length) return null;
  return (
    <div className="flower-row">
      {flowers.map(f=>{
        const isRed=FLOWERS.indexOf(f.key)>=4;
        return <span key={f.id} className={`flower-badge ${isRed?'red':'green'}`}>{FLOWER_NAMES[f.key]}</span>;
      })}
    </div>
  );
}

// ─── Opponent Panel ───────────────────────────────────────────────────────────
function OpponentPanel({ player, hand, melds, discards, flowers, seatWind, isDealer, isTurn, debug, highlightKey, seatIdx, flashClaim, flashType, rowMode }) {
  const claimWord = flashClaim ? (flashType==='kong'?'槓！':flashType==='chi'?'上！':'碰！') : null;
  const claimColor = flashType==='kong'?'#8e44ad':flashType==='chi'?'#1a6ea8':'#c8973a';

  if (rowMode) {
    return (
      <div className={`player-row player-row--opp${isTurn?' player-row--active':''}`} style={{position:'relative'}}>
        {claimWord && (
          <div className="claim-word-overlay" style={{color:claimColor}}>{claimWord}</div>
        )}
        <div className="prow-meta">
          <span className="badge badge-wind">{WIND_LABELS[seatWind]}</span>
          {isDealer&&<span className="badge badge-dealer">莊</span>}
          {isTurn&&<span className="badge badge-turn">●</span>}
          <span className="prow-name">{player.name}</span>
          <span className="opp-remain">{hand.length}張</span>
          {debug&&!player.isHuman&&<span className="badge badge-debug" style={{fontSize:'.6rem'}}>{LANE_LABELS[player.strategy]||player.strategy}</span>}
          {flowers?.length>0&&<div className="flower-row" style={{marginLeft:0}}>
            {flowers.map(f=>{const isRed=FLOWERS.indexOf(f.key)>=4;return <span key={f.id} className={`flower-badge ${isRed?'red':'green'}`} style={{fontSize:'.6rem'}}>{FLOWER_NAMES[f.key]}</span>;})}
          </div>}
          {melds.length>0&&(
            <div className="melds-row" style={{marginLeft:4}}>
              {melds.map((m,i)=>(
                <div key={i} className="meld-group">
                  {m.tiles.map(t=><Tile key={t.id} tile={t} small/>)}
                  <span className="meld-label">{m.type==='chi'?'上':m.type==='pong'?'碰':'槓'}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className={debug ? "prow-tiles opp-tiles-debug" : "prow-tiles"}>
          {debug
            ? hand.map(t=><Tile key={t.id} tile={t} small highlighted={highlightKey===t.key}/>)
            : hand.map((_,i)=><TileBack key={i} small/>)
          }
        </div>
      </div>
    );
  }

  return (
    <div className="aip" style={{position:'relative'}}>
      {claimWord && (
        <div className="claim-word-overlay" style={{color:claimColor}}>
          {claimWord}
        </div>
      )}
      <div className="opp-name">
        <span className="badge badge-wind">{WIND_LABELS[seatWind]}</span>
        {isDealer&&<span className="badge badge-dealer">莊</span>}
        {isTurn&&<span className="badge badge-turn">●</span>}
        <span>{player.name}</span>
        <span className="opp-remain">{hand.length}張</span>
        {debug&&!player.isHuman&&<span className="badge badge-debug" style={{fontSize:'.6rem'}}>{LANE_LABELS[player.strategy]||player.strategy}</span>}
        {flowers?.length>0&&<div className="flower-row" style={{marginLeft:0}}>
          {flowers.map(f=>{const isRed=FLOWERS.indexOf(f.key)>=4;return <span key={f.id} className={`flower-badge ${isRed?'red':'green'}`} style={{fontSize:'.6rem'}}>{FLOWER_NAMES[f.key]}</span>;})}
        </div>}
      </div>
      {melds.length>0&&(
        <div className="melds-row">
          {melds.map((m,i)=>(
            <div key={i} className="meld-group">
              {m.tiles.map(t=><Tile key={t.id} tile={t} small/>)}
              <span className="meld-label">{m.type==='chi'?'上':m.type==='pong'?'碰':'槓'}</span>
            </div>
          ))}
        </div>
      )}
      <div className={debug ? "opp-tiles opp-tiles-debug" : "opp-tiles"}>
        {debug
          ? hand.map(t=><Tile key={t.id} tile={t} small highlighted={highlightKey===t.key}/>)
          : hand.map((_,i)=><TileBack key={i} small/>)
        }
      </div>
      <div className="opp-discards">
        {discards.map(t=>(
          <Tile key={t.id} tile={t} small inDiscard highlighted={highlightKey===t.key}
            onMouseEnter={()=>setHoverKey&&setHoverKey(t.key)}
            onMouseLeave={()=>setHoverKey&&setHoverKey(null)}/>
        ))}
      </div>
    </div>
  );
}

// ─── Claim Prompt ─────────────────────────────────────────────────────────────
function ClaimPrompt({ claimPending, players, onWin, onPong, onChi, onPass }) {
  if (!claimPending) return null;
  const { claims, tile, claimingHuman } = claimPending;
  const mine = claims.filter(c=>c.player===claimingHuman);
  const winClaim = mine.find(c=>c.type==='win');
  const canPong = mine.some(c=>c.type==='pong');
  const chiOpts = mine.filter(c=>c.type==='chi');
  return (
    <div className="claim-prompt">
      <h3>選擇操作</h3>
      <div style={{display:'flex',alignItems:'center',gap:6}}>
        <span style={{fontSize:'.75rem',color:'var(--dim)'}}>打出：</span>
        <Tile tile={tile}/>
      </div>
      <div className="claim-btns">
        {winClaim&&<button className="claim-btn win" onClick={onWin}>胡！{winClaim.fan}番</button>}
        {canPong&&<button className="claim-btn pong" onClick={onPong}>碰</button>}
        {chiOpts.map((c,i)=>(
          <button key={i} className="claim-btn chi" onClick={()=>onChi(c.tiles)}>
            上 {sortHand(c.tiles).map(t=>TILE_DISPLAY[t.key]).join('')}
          </button>
        ))}
        <button className="claim-btn pass" onClick={onPass}>過</button>
      </div>
    </div>
  );
}

// ─── Win Overlay ──────────────────────────────────────────────────────────────
// ─── Tenpai Discard Prompt ────────────────────────────────────────────────────
// Shows when the player is 1 step from tenpai: which tiles to discard, 
// what they wait for, and how many winning tiles remain
function TenpaiDiscardPrompt({ discardAnalysis, hoverTileId, hoverKey, onHoverKey }) {
  const tenpaiDiscards = discardAnalysis.filter(d => d.leadsToTenpai);
  if (tenpaiDiscards.length === 0) return null;

  // Find best: most total winning tiles
  const best = tenpaiDiscards.reduce((a,b) =>
    b.tenpai.reduce((s,x)=>s+x.remaining,0) > a.tenpai.reduce((s,x)=>s+x.remaining,0) ? b : a,
    tenpaiDiscards[0]
  );

  return (
    <div className="tenpai-discard-prompt">
      <div className="tdp-header">
        <span className="tdp-title">🎯 打出以下牌可聽牌</span>
        <span className="tdp-subtitle">懸停查看等牌詳情</span>
      </div>
      <div className="tdp-options">
        {tenpaiDiscards.map(d => {
          const total = d.tenpai.reduce((s,x)=>s+x.remaining,0);
          const isBest = d.tile.id === best.tile.id;
          const isHovered = hoverTileId === d.tile.id;
          return (
            <div key={d.tile.id}
              className={`tdp-option${isBest?' tdp-best':''}${isHovered?' tdp-hovered':''}`}
              onMouseEnter={()=>onHoverKey(d.tile.key)}
              onMouseLeave={()=>onHoverKey(null)}>
              <div className="tdp-discard-tile">
                <TileFace tkey={d.tile.key} isSmall/>
              </div>
              <div className="tdp-discard-info">
                <span className="tdp-tile-name">{TILE_DISPLAY[d.tile.key]}</span>
                {isBest && <span className="tdp-best-badge">最佳</span>}
                <span className="tdp-win-count">{total}張可糊</span>
              </div>
              {isHovered && (
                <div className="tdp-win-detail">
                  {d.tenpai.map(w => (
                    <div key={w.key} className={`tdp-win-tile-item${w.remaining===0?' tdp-dead':''}`}
                      onMouseEnter={()=>onHoverKey(w.key)}>
                      <div style={{width:22,height:28}}><TileFace tkey={w.key} isSmall/></div>
                      <span style={{fontSize:'.55rem',color:'var(--text)'}}>{TILE_DISPLAY[w.key]}</span>
                      <span style={{fontSize:'.6rem',color:w.remaining>0?'#c8973a':'#e74c3c',fontWeight:700}}>{w.remaining}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WinOverlay({ result, players, dealer, hands, melds, flowers, seatWinds, onNext }) {
  if (!result) return null;
  if (result.type==='draw') return (
    <div className="overlay">
      <div className="win-card" style={{maxWidth:600}}>
        <div className="win-title">流局</div>
        <div className="win-subtitle">剩牌摸完</div>
        <div className="win-dealer-badge lim">冧莊（莊家連莊）</div>
        <div style={{marginTop:16,fontSize:'0.82rem',color:'var(--dim)'}}>各家手牌：</div>
        <div className="reveal-all-hands">
          {players.map((p,i)=>(
            <div key={i} className="reveal-player">
              <div className="reveal-name">{p.name}</div>
              <div className="reveal-tiles">
                {sortHand(hands[i]).map(t=><div key={t.id} style={{width:26,height:34}}><TileFace tkey={t.key} isSmall/></div>)}
                {melds[i].map((m,mi)=>m.tiles.map(t=><div key={t.id} style={{width:26,height:34,opacity:0.7}}><TileFace tkey={t.key} isSmall/></div>))}
              </div>
            </div>
          ))}
        </div>
        <br/>
        <button className="btn btn-gold" onClick={onNext}>下一局</button>
      </div>
    </div>
  );
  const winner=players[result.winner];
  const isDealerWin=result.winner===dealer;
  const winnerHand = sortHand(hands[result.winner]);
  const winnerMelds = melds[result.winner];
  return (
    <div className="overlay">
      <div className="win-card" style={{maxWidth:640}}>
        <div className="win-title">{winner.name} 糊牌！</div>
        <div className="win-subtitle">{result.isSelfDraw?'自摸':`出沖 — ${players[result.loser]?.name||''} 包`}</div>
        {/* Winner's winning hand enlarged */}
        <div className="win-hand-display">
          {winnerHand.map(t=>(
            <div key={t.id} className="win-tile-large">
              <TileFace tkey={t.key} isSmall={false}/>
            </div>
          ))}
          {winnerMelds.length>0&&<div className="win-hand-gap"/>}
          {winnerMelds.map((m,mi)=>(
            <div key={mi} className="win-meld-group">
              {m.tiles.map(t=><div key={t.id} className="win-tile-large win-tile-meld"><TileFace tkey={t.key} isSmall={false}/></div>)}
              <span className="meld-label">{m.type==='chi'?'上':m.type==='pong'?'碰':'槓'}</span>
            </div>
          ))}
        </div>
        <div className="win-patterns">
          {result.patterns?.map((p,i)=><span key={i} className="pattern-tag">{p}</span>)}
        </div>
        <div className="win-fan">{result.fan>=99?'爆棚':result.fan+' 番'}</div>
        <div className="win-pts">{result.points} 點 / 人</div>
        <div className={`win-dealer-badge ${isDealerWin?'lim':'pass'}`}>
          {isDealerWin?'冧莊（莊家連莊）':'過莊（換莊）'}
        </div>
        {/* Reveal all other players' hands */}
        <div style={{marginTop:12,fontSize:'0.75rem',color:'var(--dim)',textAlign:'left'}}>各家手牌：</div>
        <div className="reveal-all-hands">
          {players.map((p,i)=>{
            if(i===result.winner) return null;
            return (
              <div key={i} className="reveal-player">
                <div className="reveal-name">{p.name}</div>
                <div className="reveal-tiles">
                  {sortHand(hands[i]).map(t=><div key={t.id} style={{width:24,height:32}}><TileFace tkey={t.key} isSmall/></div>)}
                  {melds[i].map((m,mi)=>m.tiles.map(t=><div key={`${mi}-${t.id}`} style={{width:24,height:32,opacity:0.7}}><TileFace tkey={t.key} isSmall/></div>))}
                </div>
              </div>
            );
          })}
        </div>
        <br/>
        <button className="btn btn-gold" onClick={onNext}>下一局</button>
      </div>
    </div>
  );
}


// ─── Rules Tab ────────────────────────────────────────────────────────────────
const RULES_DATA = [
  { cat:'基本役型', items:[
    { name:'雞糊', fan:1, desc:'最基本糊法，無任何特殊役型' },
    { name:'平糊', fan:1, desc:'全上牌（順子）糊牌，無字牌、無刻子' },
  ]},
  { cat:'自摸加番', items:[
    { name:'自摸', fan:'+1', desc:'從牌墙摸到糊牌，每人付點' },
    { name:'無花', fan:'+1', desc:'手中無任何花牌' },
    { name:'正花', fan:'+1', desc:'摸到自己座位對應的花（梅蘭菊竹/春夏秋冬）' },
    { name:'一台花', fan:'+2', desc:'集齊四季（春夏秋冬）或四花（梅蘭菊竹）' },
  ]},
  { cat:'役牌（字牌刻子）', items:[
    { name:'門風', fan:'+1', desc:'自己座位風牌的刻子（東南西北）' },
    { name:'圈風', fan:'+1', desc:'本局圈風牌的刻子（與門風不同時才算）' },
    { name:'中刻', fan:'+1', desc:'三張中（紅中）' },
    { name:'發刻', fan:'+1', desc:'三張發（青發）' },
    { name:'白刻', fan:'+1', desc:'三張白（白板）' },
  ]},
  { cat:'一般役型', items:[
    { name:'混一色', fan:3, desc:'一種花色＋字牌組成糊牌' },
    { name:'對對胡', fan:3, desc:'全部刻子（碰）加一對將' },
  ]},
  { cat:'高番役型', items:[
    { name:'小三元', fan:5, desc:'兩種箭牌（中發白）刻子＋一種箭牌對' },
    { name:'清一色', fan:7, desc:'全部同一花色（萬/筒/索）糊牌' },
    { name:'坎坎胡', fan:7, desc:'全刻子＋自摸糊牌' },
  ]},
  { cat:'爆棚（最高）', items:[
    { name:'十三么', fan:'爆棚', desc:'一九字牌各一張加一對，十三種不同牌' },
    { name:'大三元', fan:'爆棚', desc:'中發白三種箭牌全部刻子' },
    { name:'小四喜', fan:'爆棚', desc:'三種風牌刻子＋一種風牌對' },
    { name:'大四喜', fan:'爆棚', desc:'東南西北四種風牌全部刻子' },
    { name:'字一色', fan:'爆棚', desc:'全部字牌（風牌＋箭牌）糊牌' },
    { name:'全么九', fan:'爆棚', desc:'全部一九字牌糊牌' },
    { name:'九子連環', fan:'爆棚', desc:'同一花色1112345678999加一張' },
    { name:'十八羅漢', fan:'爆棚', desc:'四槓子（四個槓）糊牌' },
  ]},
  { cat:'番數積分表', items:[
    { name:'1番', fan:'4點', desc:'每家付4點' },
    { name:'2番', fan:'8點', desc:'每家付8點' },
    { name:'3番', fan:'16點', desc:'每家付16點' },
    { name:'4番', fan:'32點', desc:'每家付32點' },
    { name:'5番', fan:'48點', desc:'每家付48點' },
    { name:'6番', fan:'64點', desc:'每家付64點' },
    { name:'7番', fan:'96點', desc:'每家付96點' },
    { name:'8番', fan:'128點', desc:'每家付128點' },
    { name:'9番', fan:'192點', desc:'每家付192點' },
    { name:'10番+', fan:'256點', desc:'每家付256點（上限）' },
  ]},
];

function RulesTab({ onClose }) {
  const [openCat, setOpenCat] = useState(null);
  return (
    <div className="overlay" style={{alignItems:'flex-start',paddingTop:20,overflowY:'auto'}}>
      <div style={{background:'linear-gradient(145deg,#193824,#0d1f14)',border:'2px solid var(--gold)',borderRadius:14,padding:'20px 24px',maxWidth:560,width:'92%',margin:'0 auto'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
          <span style={{fontSize:'1.1rem',fontWeight:700,color:'var(--gold)'}}>🀄 糊牌規則與番數</span>
          <button className="btn btn-gray" onClick={onClose}>關閉</button>
        </div>
        {RULES_DATA.map(cat=>(
          <div key={cat.cat} style={{marginBottom:10}}>
            <div className="rules-cat-hdr" onClick={()=>setOpenCat(openCat===cat.cat?null:cat.cat)}>
              <span>{cat.cat}</span>
              <span>{openCat===cat.cat?'▲':'▼'}</span>
            </div>
            {openCat===cat.cat&&(
              <div className="rules-items">
                {cat.items.map(item=>(
                  <div key={item.name} className="rules-item">
                    <span className="rules-name">{item.name}</span>
                    <span className="rules-fan">{item.fan}</span>
                    <span className="rules-desc">{item.desc}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Strategy Panel (for human player) ───────────────────────────────────────
const SUIT_NAMES = { man:'萬子', pin:'筒子', sou:'索子' };
const SUIT_CHARS = { man:'萬', pin:'筒', sou:'索' };

function StrategyPanel({ tiles, melds, seatWind, roundWind, minFan, chosenLane, onChoose }) {
  const scan = tiles.length > 0 ? scanBestLane(tiles, melds, seatWind, roundWind, minFan) : null;

  const suitCt = { man:0, pin:0, sou:0 };
  for (const t of tiles) {
    for (const s of ['man','pin','sou']) if (t.key.startsWith(s) && /\d$/.test(t.key)) suitCt[s]++;
  }
  const domSuit = Object.entries(suitCt).sort((a,b)=>b[1]-a[1])[0]?.[0] || 'man';
  const suitChar = SUIT_CHARS[domSuit] || '';

  const ALL_LANES = ['flush','halfFlush','allHonours','triplet','pingHu','orphan','defensive'];

  function laneLabel(lane) {
    if (lane==='flush')      return `清一色(${suitChar})`;
    if (lane==='halfFlush')  return `混一色(${suitChar})`;
    if (lane==='allHonours') return '字一色';
    return LANE_LABELS[lane] || lane;
  }

  // Rank: positive score first, then zero, then negative — no numbers shown
  const laneOrder = scan
    ? [...ALL_LANES].sort((a,b) => {
        const sa = scan.ranked?.find(r=>r.lane===a)?.score ?? -999;
        const sb = scan.ranked?.find(r=>r.lane===b)?.score ?? -999;
        return sb - sa;
      })
    : ALL_LANES;

  const bestLane = scan?.best;

  return (
    <div className="strategy-panel">
      <div className="strategy-panel-title">牌路策略</div>
      <div className="strategy-lane-list">
        {laneOrder.map((lane) => {
          const isChosen = chosenLane===lane;
          const isBest = bestLane===lane;
          const score = scan?.ranked?.find(r=>r.lane===lane)?.score ?? -999;
          const isViable = score >= 0;
          return (
            <button key={lane}
              className={`strategy-lane-btn${isChosen?' chosen':''}${isBest?' best':''}${!isViable?' dim':''}`}
              onClick={()=>onChoose(lane===chosenLane?null:lane)}>
              {isBest && <span className="sl-rank-best">推</span>}
              <span className="sl-name">{laneLabel(lane)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Setup Screen ─────────────────────────────────────────────────────────────
const DEFAULT_PLAYERS = [
  { name:'你',   isHuman:true,  strategy:'auto' },
  { name:'阿明', isHuman:false, strategy:'auto' },
  { name:'阿珍', isHuman:false, strategy:'auto' },
  { name:'阿強', isHuman:false, strategy:'auto' },
];
function SetupScreen({ onStart, onSimulate }) {
  const [players, setPlayers] = useState(DEFAULT_PLAYERS.map(p=>({...p})));
  const [minFan, setMinFan] = useState(3);
  const [simGames, setSimGames] = useState(30);
  const upd=(i,f,v)=>setPlayers(ps=>ps.map((p,idx)=>idx===i?{...p,[f]:v}:p));
  return (
    <div className="setup-screen">
      <div className="setup-title">🀄 香港麻雀</div>
      <div className="setup-subtitle">Hong Kong Mahjong</div>
      <div className="setup-grid">
        {players.map((p,i)=>(
          <div key={i} className="setup-card">
            <h3>玩家 {i+1}（{WIND_LABELS[i]}位）</h3>
            <input type="text" value={p.name} onChange={e=>upd(i,'name',e.target.value)} placeholder="名稱"/>
            <div className="toggle-row">
              <button className={`toggle-btn${p.isHuman?' active':''}`} onClick={()=>upd(i,'isHuman',true)}>真人</button>
              <button className={`toggle-btn${!p.isHuman?' active':''}`} onClick={()=>upd(i,'isHuman',false)}>電腦</button>
            </div>
            {!p.isHuman&&<>
              <div className="toggle-row" style={{marginTop:6}}>
                {Object.entries(STRATEGIES).map(([k,v])=>(
                  <button key={k} className={`toggle-btn${p.strategy===k?' active':''}`}
                    onClick={()=>upd(i,'strategy',k)} title={v.desc}>{v.label}</button>
                ))}
              </div>
              <div className="strategy-desc">{STRATEGIES[p.strategy]?.desc}</div>
            </>}
          </div>
        ))}
      </div>
      <div className="setup-options">
        <div className="option-row">
          <input type="checkbox" id="mf" checked={minFan>=3} onChange={e=>setMinFan(e.target.checked?3:1)}/>
          <label htmlFor="mf">三番起胡（標準港式規則）</label>
        </div>
        <div className="option-row">
          <label>模擬局數：</label>
          <input type="range" min={5} max={200} value={simGames} onChange={e=>setSimGames(Number(e.target.value))}/>
          <span className="slider-val">{simGames}</span>
        </div>
      </div>
      <div style={{display:'flex',gap:12}}>
        <button className="btn btn-gold" style={{fontSize:'.95rem',padding:'9px 26px'}} onClick={()=>onStart(players,minFan)}>開始遊戲</button>
        <button className="btn btn-green" style={{fontSize:'.95rem',padding:'9px 26px'}} onClick={()=>onSimulate(players.map(p=>({...p,isHuman:false})),simGames,minFan)}>開始模擬</button>
      </div>
    </div>
  );
}

// ─── Simulation ───────────────────────────────────────────────────────────────
function SimLive({ players, totalGames, minFan, onBack }) {
  const [results, setResults] = useState([]);
  const [running, setRunning] = useState(true);
  useEffect(()=>{
    let cancelled=false; let done=0; const all=[];
    function next(){
      if(cancelled||done>=totalGames){if(!cancelled)setRunning(false);return;}
      all.push(runOneGame(players,minFan)); done++;
      setResults([...all]);
      setTimeout(next,0);
    }
    next();
    return()=>{cancelled=true;};
  },[]);
  const totals=players.map((_,i)=>({wins:0,score:0}));
  for(const r of results){
    for(let i=0;i<4;i++)totals[i].score+=r.finalScores[i];
    for(const h of r.hands)if(h.result?.type==='win')totals[h.result.winner].wins++;
  }
  const ranked=[...totals.map((t,i)=>({...t,i}))].sort((a,b)=>b.score-a.score);
  return (
    <div className="sim-live">
      <div className="sim-header">
        <span className="sim-title">模擬結果</span>
        <span className="sim-progress">{results.length}/{totalGames} 局{running?' 進行中…':' 完成'}</span>
        <button className="btn btn-gray" style={{marginLeft:'auto'}} onClick={onBack}>返回設定</button>
      </div>
      <div className="sim-stats-row">
        {ranked.map((t,rank)=>(
          <div key={t.i} className="sim-stat-card">
            <div className="sim-stat-name">{players[t.i].name}</div>
            <div className="sim-stat-score">{t.score>0?'+':''}{t.score}</div>
            <div className="sim-stat-wins">胡牌 {t.wins} 局</div>
            <div className="sim-ranking">第 {rank+1} 名</div>
          </div>
        ))}
      </div>
      {results.length>0&&(
        <table className="sim-table">
          <thead><tr><th>圈局</th>{players.map((p,i)=><th key={i}>{p.name}</th>)}<th>結果</th></tr></thead>
          <tbody>
            {results.slice(-20).reverse().map((r,idx)=>(
              <tr key={idx}>
                <td><span className="sim-round-label">{r.roundLabel||`第${results.length-idx}局`}</span></td>
                {r.finalScores.map((s,i)=><td key={i} style={{color:s>0?'#2ecc71':s<0?'#e74c3c':'inherit'}}>{s>0?'+':''}{s}</td>)}
                <td style={{color:'var(--dim)',fontSize:'.68rem'}}>
                  {r.hands?.filter(h=>h.result?.type==='win').map(h=>`${players[h.result.winner]?.name||''}${h.result.isSelfDraw?'摸':'食'}${h.result.fan>=99?'爆棚':h.result.fan+'番'}`).join(' · ')||'流局'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─── Main Game ────────────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState('setup');
  const [hand, setHand] = useState(null);
  const [selectedTile, setSelectedTile] = useState(null);
  const [simConfig, setSimConfig] = useState(null);
  const [debug, setDebug] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [chosenLane, setChosenLane] = useState(null);
  const [claimAnnounce, setClaimAnnounce] = useState(null); // {player, type, key}
  // Hover state: { tileKey } for cross-highlighting
  const [hoverKey, setHoverKey] = useState(null);
  // Tooltip state: { tile, discardInfo, x, y }
  const [tooltip, setTooltip] = useState(null);

  const humanIdx = hand ? hand.session.players.findIndex(p=>p.isHuman) : 0;

  // Watch for new claims and show big word
  useEffect(()=>{
    if(!hand?.lastClaimPlayer==null || !hand?.lastClaimType) return;
    const p = hand.lastClaimPlayer;
    const t = hand.lastClaimType;
    if(p==null) return;
    setClaimAnnounce({player:p, type:t, key: `${p}-${t}-${hand.turnCount||0}`});
    const timer = setTimeout(()=>setClaimAnnounce(null), 1400);
    return()=>clearTimeout(timer);
  },[hand?.lastClaimPlayer, hand?.lastClaimType, hand?.turnCount]);

  // AI loop
  useEffect(()=>{
    if(!hand||screen!=='game'||hand.phase==='finished'||hand.phase==='claiming') return;
    const p=hand.currentPlayer;
    if(hand.session.players[p].isHuman) return;
    const t=setTimeout(()=>{
      setHand(prev=>{
        if(!prev||prev.phase==='finished'||prev.phase==='claiming'||prev.currentPlayer!==p) return prev;
        return aiTurn(prev);
      });
    },420);
    return()=>clearTimeout(t);
  },[hand?.currentPlayer,hand?.phase,hand?.turnCount,screen]);

  // Human draw
  useEffect(()=>{
    if(!hand||screen!=='game'||hand.phase!=='draw') return;
    if(!hand.session.players[hand.currentPlayer].isHuman) return;
    setHand(prev=>{
      if(!prev||prev.phase!=='draw'||!prev.session.players[prev.currentPlayer].isHuman) return prev;
      return drawTile(prev,prev.currentPlayer);
    });
  },[hand?.currentPlayer,hand?.phase]);

  function handleStart(players,minFan){
    setHand(startHand(createSession(players,minFan)));
    setSelectedTile(null);
    setScreen('game');
  }
  function handleSimulate(players,games,minFan){ setSimConfig({players,games,minFan}); setScreen('sim'); }

  function handleTileClick(tile){
    if(!hand||hand.phase!=='discard'||hand.currentPlayer!==humanIdx||hand.result) return;
    if(selectedTile?.id===tile.id){
      setHand(prev=>doDiscard(prev,humanIdx,tile.id));
      setSelectedTile(null); setTooltip(null);
    } else { setSelectedTile(tile); }
  }
  function handleDiscard(){
    if(!selectedTile) return;
    setHand(prev=>doDiscard(prev,humanIdx,selectedTile.id));
    setSelectedTile(null); setTooltip(null);
  }
  function handleSelfDraw(){
    setHand(prev=>{
      if(!prev||!prev._canSelfDraw) return prev;
      const p=humanIdx;
      const {fan,patterns}=calcFan(prev.hands[p],prev.melds[p],prev.drawnTile,true,prev.seatWinds[p],prev.session.round,prev.flowers[p]);
      if(fan<prev.session.minFan) return prev;
      const pts=fanToPoints(fan);
      const scores=[...prev.session.scores];
      for(let i=0;i<4;i++){if(i!==p)scores[i]-=pts;}
      scores[p]+=pts*3;
      return {...prev,session:{...prev.session,scores},phase:'finished',
        result:{type:'win',winner:p,fan,patterns,isSelfDraw:true,loser:null,points:pts}};
    });
  }
  function handleNextHand(){
    if(!hand) return;
    setTooltip(null); setHoverKey(null); setSelectedTile(null);
    const ns=advanceSession(hand);
    if(ns.round>=4||ns.handsPlayed>=16){ setHand({...hand,session:ns}); setScreen('summary'); return; }
    setHand(startHand(ns));
  }

  // ── Screens ──
  if(screen==='setup') return <SetupScreen onStart={handleStart} onSimulate={handleSimulate}/>;
  if(screen==='sim'&&simConfig) return <SimLive players={simConfig.players} totalGames={simConfig.games} minFan={simConfig.minFan} onBack={()=>setScreen('setup')}/>;
  if(screen==='summary'&&hand){
    const scores=hand.session.scores;
    const ranked=hand.session.players.map((p,i)=>({...p,score:scores[i],i})).sort((a,b)=>b.score-a.score);
    return (
      <div className="session-summary">
        <div className="summary-card">
          <div className="summary-title">🏆 最終結果</div>
          {ranked.map((p,rank)=>(
            <div key={p.i} className={`summary-row${rank===0?' winner':''}`}>
              <span className="rank">#{rank+1}</span>
              <span className="name">{p.name}</span>
              <span className="score">{p.score>0?'+':''}{p.score}</span>
            </div>
          ))}
          <br/>
          <button className="btn btn-gold" onClick={()=>setScreen('setup')}>返回</button>
        </div>
      </div>
    );
  }
  if(!hand) return null;

  const {session,hands,melds,discards,flowers,seatWinds,currentPlayer,drawnTile,phase,claimPending,result,log,wall}=hand;
  const {players,dealer}=session;
  const isHumanTurn=currentPlayer===humanIdx&&!result;
  const roundLabel=['東','南','西','北'][session.round]||'東';
  const rightPi=(humanIdx+1)%4, topPi=(humanIdx+2)%4, leftPi=(humanIdx+3)%4;

  const humanHand = sortHand(hands[humanIdx]); // Always sorted
  const humanMelds = melds[humanIdx];
  const humanDrawnTile = currentPlayer===humanIdx ? drawnTile : null;

  // Drawn tile always at right: separate sorted hand from drawn tile
  const handTilesNoDrawn = humanDrawnTile ? humanHand.filter(t=>t.id!==humanDrawnTile.id) : humanHand;
  const drawnTileObj = humanDrawnTile || null;

  // Build allSeen for tenpai analysis (all discards)
  const allSeenDiscards = discards.flat();

  // Hint analysis — always run when it's human's discard turn
  const hint = (isHumanTurn && phase==='discard')
    ? analyzeHand(humanHand, humanMelds, allSeenDiscards)
    : null;
  // Danger tile analysis — warn player about dangerous discards
  const dangerMap = (isHumanTurn && phase==='discard') ? analyzeDanger(
    humanHand,
    [melds[rightPi], melds[topPi], melds[leftPi]],
    [discards[rightPi], discards[topPi], discards[leftPi]],
    wall?.length || 0
  ) : {};

  // Hint debug: show chosen lane analysis
  const chosenLaneInfo = chosenLane && hint ? (() => {
    const suitCt = { man:0,pin:0,sou:0 };
    for (const t of humanHand) for (const s of ['man','pin','sou']) if (t.key.startsWith(s)&&/\d$/.test(t.key)) suitCt[s]++;
    const dom = Object.entries(suitCt).sort((a,b)=>b[1]-a[1])[0]?.[0];
    return { domSuit: dom };
  })() : null;

  // Build per-tile discard info map for tooltip
  const discardInfoMap = hint ? Object.fromEntries(hint.discardAnalysis.map(d=>[d.tile.id, d])) : {};

  // Lane-aware best discard: override isBestDiscard based on active strategy lane
  const laneAwareDiscardMap = (() => {
    if (!hint) return discardInfoMap;
    const scan = (() => { try { return scanBestLane(humanHand, humanMelds, seatWinds[humanIdx], session.round, session.minFan); } catch(e){return null;} })();
    const lane = chosenLane || scan?.best;
    if (!lane) return discardInfoMap;

    // Count how many of each key exist in hand (for triplet logic)
    const keyCounts = {};
    for (const t of humanHand) keyCounts[t.key] = (keyCounts[t.key]||0) + 1;

    // Count how many of each key are still available in wall+unseen (for 對對糊 viability)
    const seenKeys = {};
    for (const t of [...discards.flat(), ...melds.flat().flatMap(m=>m.tiles||[])]) {
      seenKeys[t.key] = (seenKeys[t.key]||0) + 1;
    }

    return Object.fromEntries(Object.entries(discardInfoMap).map(([id, d]) => {
      const key = d.tile.key;
      const isSuitTile = ['man','pin','sou'].some(s => key.startsWith(s));
      const isTargetSuit = scan?.targetSuitKey && key.startsWith(scan.targetSuitKey);
      let shouldDiscard = d.isBestDiscard;

      if (lane === 'flush') {
        // Keep target suit only — discard everything else
        shouldDiscard = !isTargetSuit;
      } else if (lane === 'halfFlush') {
        // Discard non-target suit tiles (but keep honours)
        shouldDiscard = isSuitTile && !isTargetSuit;
      } else if (lane === 'triplet') {
        // 對對糊: keep pairs/triplets, discard singletons and tiles
        // where forming a triplet is impossible (all 4 seen already)
        const myCount = keyCounts[key] || 0;
        const totalSeen = seenKeys[key] || 0;
        const remaining = 4 - totalSeen; // how many of this tile left unseen
        if (myCount >= 2) {
          // Have a pair or triplet — KEEP (don't mark as discard)
          shouldDiscard = false;
        } else {
          // Singleton — discard if we can't get another (remaining < 2 means can't form pair)
          // or if it's a tile that has no partner possible
          shouldDiscard = remaining < 2 || myCount < 2;
        }
      }

      return [id, {
        ...d,
        isBestDiscard: shouldDiscard && (d.shantenAfter <= (hint.shanten + 1))
      }];
    }));
  })();

  return (
    <div className="app" onClick={()=>setTooltip(null)}>
      {/* Header */}
      <div className="hdr">
        <span className="hdr-title">🀄 香港麻雀</span>
        <span className="hdr-info">
          {roundLabel}風圈 第{session.handsPlayed+1}局 — 莊：<span>{players[dealer].name}</span>
          {' '}剩牌：<span>{wall?.length||0}</span>
        </span>
        <div style={{marginLeft:'auto',display:'flex',gap:8,alignItems:'center'}}>
          <button className="btn btn-gray" style={{fontSize:'.72rem',padding:'3px 9px'}} onClick={()=>setShowRules(true)}>📖 規則</button>
          <button className={`btn ${debug?'btn-purple':'btn-gray'}`} style={{fontSize:'.72rem',padding:'3px 9px'}}
            onClick={()=>setDebug(d=>!d)}>{debug?'🔍 Debug 開':'🔍 Debug 關'}</button>
          <button className="btn btn-gray" onClick={()=>setScreen('setup')}>返回</button>
        </div>
      </div>

      {/* Scores */}
      <div className="scores">
        {players.map((p,i)=>(
          <div key={i} className={`score-cell${i===currentPlayer?' active':''}${i===dealer?' dealer-cell':''}`}>
            <span className="badge badge-wind">{WIND_LABELS[seatWinds[i]]}</span>
            {i===dealer&&<span className="badge badge-dealer">莊</span>}
            <span className="sc-name">{p.name}</span>
            <span className="sc-score">{session.scores[i]>0?'+':''}{session.scores[i]}</span>
          </div>
        ))}
      </div>

      {/* Table — vertical rows layout */}
      <div className="table-rows">

        {/* Sidebar: log + discard pools + claim prompt */}
        <div className="rows-sidebar">
          <div className="wall-count">剩牌：<span>{wall?.length||0}</span> 張</div>
          <div className="discards-grid">
            {[humanIdx,topPi,rightPi,leftPi].map(pi=>(
              <div key={pi} className="dpool">
                <div className="dpool-label">{players[pi].name} 打出</div>
                <div className="dpool-tiles">
                  {discards[pi].map(t=>(
                    <Tile key={t.id} tile={t} small inDiscard
                      highlighted={hoverKey===t.key}
                      onMouseEnter={()=>setHoverKey(t.key)}
                      onMouseLeave={()=>setHoverKey(null)}/>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="game-log">
            {[...log].reverse().slice(0,15).map((e,i)=><div key={i} className="log-entry">{e}</div>)}
          </div>
          {phase==='claiming'&&claimPending&&(
            <ClaimPrompt claimPending={claimPending} players={players}
              onWin={()=>setHand(prev=>playerClaimWin(prev))}
              onPong={()=>setHand(prev=>playerPong(prev))}
              onChi={tiles=>setHand(prev=>playerChi(prev,tiles))}
              onPass={()=>setHand(prev=>playerPass(prev))}/>
          )}
        </div>

        {/* Main column: 4 player rows */}
        <div className="rows-main">

          {/* Row 0 — Human (top) */}
          <div className={`player-row player-row--human${humanIdx===currentPlayer&&!result?' player-row--active':''}`}>
            <div className="prow-meta">
              <span className="badge badge-wind">{WIND_LABELS[seatWinds[humanIdx]]}</span>
              {humanIdx===dealer&&<span className="badge badge-dealer">莊</span>}
              {humanIdx===currentPlayer&&!result&&<span className="badge badge-turn">●</span>}
              <span className="prow-name">{players[humanIdx].name}</span>
              <FlowerRow flowers={flowers[humanIdx]}/>
              {humanMelds.length>0&&(
                <div className="melds-row">
                  {humanMelds.map((m,i)=>(
                    <div key={i} className="meld-group">
                      {m.tiles.map(t=><Tile key={t.id} tile={t} small/>)}
                      <span className="meld-label">{m.type==='chi'?'上':m.type==='pong'?'碰':'槓'}</span>
                    </div>
                  ))}
                </div>
              )}
              <div style={{marginLeft:'auto',display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
                {/* 自摸 button */}
                {hand._canSelfDraw&&isHumanTurn&&(()=>{
                  const p=humanIdx;
                  const {fan}=calcFan(hand.hands[p],hand.melds[p],hand.drawnTile,true,
                    hand.seatWinds[p],hand.session.round,hand.flowers[p]);
                  const meetsMin = fan >= hand.session.minFan;
                  return <button className={`btn-zimo${meetsMin?' zimo-ok':' zimo-nok'}`}
                    title={meetsMin?`自摸 ${fan}番！`:` ${fan}番 (需${hand.session.minFan}番起糊)`}
                    onClick={handleSelfDraw}>
                    🀄 自摸！{fan}番
                  </button>;
                })()}
                {/* 暗槓 */}
                {isHumanTurn&&phase==='discard'&&(()=>{
                  const cnt={};
                  for(const t of humanHand) cnt[t.key]=(cnt[t.key]||0)+1;
                  const kongKeys=Object.entries(cnt).filter(([,v])=>v>=4).map(([k])=>k);
                  if(kongKeys.length===0) return null;
                  return kongKeys.map(key=>(
                    <button key={key} className="btn btn-purple"
                      onClick={()=>setHand(prev=>declareAnKong(prev,humanIdx,key))}>
                      暗槓 {TILE_DISPLAY[key]||key}
                    </button>
                  ));
                })()}
                {/* 加槓 */}
                {isHumanTurn&&phase==='discard'&&(()=>{
                  const addKongOptions=[];
                  for(const m of humanMelds){
                    if(m.type==='pong'){
                      const extra=humanHand.find(t=>t.key===m.tiles[0]?.key);
                      if(extra) addKongOptions.push({key:m.tiles[0]?.key, tileId:extra.id});
                    }
                  }
                  if(addKongOptions.length===0) return null;
                  return addKongOptions.map(opt=>(
                    <button key={opt.tileId} className="btn btn-purple"
                      onClick={()=>setHand(prev=>declareAddKong(prev,humanIdx,opt.tileId))}>
                      加槓 {TILE_DISPLAY[opt.key]||opt.key}
                    </button>
                  ));
                })()}
                <button className="btn btn-red"
                  disabled={!selectedTile||!isHumanTurn||phase!=='discard'}
                  onClick={handleDiscard}>打出所選</button>
              </div>
            </div>
          {/* human hand rack rendered below prow-meta */}

          {/* Hand rack — always sorted, drawn tile always at right */}
          <div className="hand-rack" style={{position:'relative'}}>
            {handTilesNoDrawn.map(t=>{
              const da = laneAwareDiscardMap[t.id];
              const isHintBest = hint && da?.isBestDiscard;
              const isHint = hint && da?.leadsToTenpai;
              const dLevel = dangerMap[t.key] ?? -1;
              return (
                <div key={t.id} style={{position:'relative'}} className="tile-wrapper">
                  <Tile
                    tile={t}
                    selected={selectedTile?.id===t.id}
                    hint={isHint && !isHintBest}
                    hintBest={isHintBest}
                    danger={dLevel}
                    highlighted={hoverKey===t.key}
                    onClick={()=>handleTileClick(t)}
                    onMouseEnter={()=>{
                      setHoverKey(t.key);
                      if(hint && da) setTooltip({tileId:t.id, discardInfo:da});
                    }}
                    onMouseLeave={()=>{ setHoverKey(null); setTooltip(null); }}
                  />
                  {tooltip?.tileId===t.id && (
                    <DangerTooltip dangerLevel={dLevel} discardInfo={da} visible/>
                  )}
                </div>
              );
            })}
            {drawnTileObj&&<>
              <div className="drawn-gap"/>
              <div style={{position:'relative'}} className="tile-wrapper">
                <Tile
                  tile={drawnTileObj}
                  drawn
                  selected={selectedTile?.id===drawnTileObj.id}
                  hint={hint && laneAwareDiscardMap[drawnTileObj.id]?.leadsToTenpai && !laneAwareDiscardMap[drawnTileObj.id]?.isBestDiscard}
                  hintBest={hint && laneAwareDiscardMap[drawnTileObj.id]?.isBestDiscard}
                  highlighted={hoverKey===drawnTileObj.key}
                  onClick={()=>handleTileClick(drawnTileObj)}
                  onMouseEnter={()=>{
                    setHoverKey(drawnTileObj.key);
                    const da=laneAwareDiscardMap[drawnTileObj.id];
                    if(hint&&da) setTooltip({tileId:drawnTileObj.id, discardInfo:da});
                  }}
                  onMouseLeave={()=>{ setHoverKey(null); setTooltip(null); }}
                  danger={dangerMap[drawnTileObj.key] ?? -1}
                />
                {tooltip?.tileId===drawnTileObj.id && (
                  <DangerTooltip dangerLevel={dangerMap[drawnTileObj.key]??-1} discardInfo={laneAwareDiscardMap[drawnTileObj.id]} visible/>
                )}
              </div>
            </>}
          </div>

          {/* Hint summary bar — strategy-based, no long tile name lists */}
          {hint&&(
            <div className="hint-panel">
              <span className={`shanten-badge${hint.shanten===0?' tenpai':hint.shanten<0?' win':''}`}>{hint.msg}</span>
              {/* Strategy guidance based on chosen lane */}
              {(()=>{
                const scan = hint && humanHand.length>0
                  ? (() => { try { return scanBestLane(humanHand, humanMelds, seatWinds[humanIdx], session.round, session.minFan); } catch(e){return null;} })()
                  : null;
                const lane = chosenLane || scan?.best;
                const suitLabel = scan?.targetSuitLabel || '';
                if (!lane || !scan) return null;
                // Build guidance text based on lane
                const guidance = {
                  flush:      `建議：清一色(${suitLabel}) — 留${suitLabel}，打其他`,
                  halfFlush:  `建議：混一色(${suitLabel}) — 留${suitLabel}及字牌`,
                  allHonours: '建議：字一色 — 留字牌，打數牌',
                  triplet:    '建議：對對胡 — 留對子，碰刻子',
                  pingHu:     '建議：平糊 — 留順子，打字牌',
                  orphan:     '建議：十三么 — 留一九字牌',
                  defensive:  '建議：保守 — 打已出現的安全牌',
                  auto:       `建議：${LANE_LABELS[lane]||lane}`,
                }[lane] || `建議：${LANE_LABELS[lane]||lane}`;
                if (!guidance) return null;
                return <span className="hint-strategy-text">{guidance}</span>;
              })()}
              {/* Tenpai count when listening */}
              {hint.shanten===0&&hint.totalRemaining>0&&(
                <span className="hint-wait-count">等 <strong>{hint.totalRemaining}</strong> 張</span>
              )}
              {/* Show marker legend */}
              {hint.shanten>=0&&(
                <span className="hint-legend">
                  <span className="hint-crown-small">★</span>打出可進步
                  {hint.shanten===1&&hint.discardAnalysis.some(d=>d.leadsToTenpai)&&
                    <> · <span className="hint-dot-small">●</span>打出可聽牌</>}
                </span>
              )}
              {hint.hints.map((h,i)=><span key={i} className="hint-tag">{h}</span>)}
            </div>
          )}

          {/* Danger legend — show when any dangerous tiles exist */}
          {isHumanTurn && phase==='discard' && Object.values(dangerMap).some(v=>v>=2) && (
            <div className="danger-legend">
              <span style={{color:'var(--dim)',fontWeight:600}}>出沖風險：</span>
              <div className="dl-item"><div className="dl-dot" style={{background:'#e74c3c'}}/><span>⚠ 高危</span></div>
              <div className="dl-item"><div className="dl-dot" style={{background:'#f39c12'}}/><span>? 不明</span></div>
              <div className="dl-item"><div className="dl-dot" style={{background:'#27ae60'}}/><span>✓ 安全</span></div>
              <span style={{color:'var(--dim)',marginLeft:'auto'}}>懸停查看詳情</span>
            </div>
          )}

          {/* If currently tenpai (14 tiles drawn, shanten=0): show waiting tiles */}
          {hint?.shanten===0&&hint.tenpaiDetails.length>0&&(
            <div className="tenpai-bar">
              <span className="tenpai-bar-label">已聽牌 · 等：</span>
              <div className="tenpai-bar-tiles">
                {hint.tenpaiDetails.map(d=>(
                  <div key={d.key} className={`tenpai-win-item ${d.remaining===0?'dead':''}`}
                    onMouseEnter={()=>setHoverKey(d.key)} onMouseLeave={()=>setHoverKey(null)}>
                    <div className="tenpai-win-tile">
                      <TileFace tkey={d.key} isSmall/>
                    </div>
                    <span className="tenpai-win-info">{TILE_DISPLAY[d.key]}<br/>{d.remaining}張</span>
                  </div>
                ))}
              </div>
              <span className="tenpai-total">共 {hint.totalRemaining} 張</span>
            </div>
          )}

          {/* Tenpai-on-discard prompt */}
          {hint&&hint.shanten===1&&hint.discardAnalysis.some(d=>d.leadsToTenpai)&&(
            <TenpaiDiscardPrompt
              discardAnalysis={hint.discardAnalysis}
              hoverTileId={tooltip?.tileId}
              onHoverKey={setHoverKey}
            />
          )}

          {/* Strategy panel */}
          <StrategyPanel
            tiles={humanHand} melds={humanMelds}
            seatWind={seatWinds[humanIdx]} roundWind={session.round}
            minFan={session.minFan} chosenLane={chosenLane}
            onChoose={setChosenLane}/>
          <TileTracker hand={humanHand} discards={discards} melds={melds} highlightKey={hoverKey} debug={debug} wall={wall}/>
          </div>{/* end player-row--human */}

          {/* Rows 1-3 — Opponents */}
          {[topPi, rightPi, leftPi].map(pi=>(
            <OpponentPanel key={pi}
              player={players[pi]} hand={hands[pi]} melds={melds[pi]}
              discards={discards[pi]} flowers={flowers[pi]}
              seatWind={seatWinds[pi]} isDealer={pi===dealer}
              isTurn={pi===currentPlayer&&!result}
              debug={debug} highlightKey={hoverKey} seatIdx={pi}
              flashClaim={claimAnnounce?.player===pi}
              flashType={claimAnnounce?.type}
              rowMode/>
          ))}

        </div>{/* end rows-main */}
      </div>{/* end table-rows */}

      {result&&phase==='finished'&&<WinOverlay result={result} players={players} dealer={dealer} hands={hands} melds={melds} flowers={flowers} seatWinds={seatWinds} onNext={handleNextHand}/>}
      {showRules&&<RulesTab onClose={()=>setShowRules(false)}/>}
    </div>
  );
}
