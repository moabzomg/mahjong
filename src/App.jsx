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

// ─── Tile SVG art — authentic HK Mahjong ────────────────────────────────────
const CN_NUM = ['一','二','三','四','五','六','七','八','九'];
const HONOUR_COLOR = {
  east:'#1a6ea8', south:'#c0392b', west:'#27ae60', north:'#1a1a1a',
  chun:'#c0392b', hatsu:'#27ae60', haku:'#1a6ea8',
};
const FLOWER_COLOR = {
  plum:'#c0392b', orchid:'#8e44ad', chrysanthemum:'#d35400', bamboo:'#27ae60',
  spring:'#27ae60', summer:'#d35400', autumn:'#c0392b', winter:'#2980b9',
};

// ── 筒 (dots) ─────────────────────────────────────────────────────────────────
// Positions & colours both listed bottom→top, L→R per row
// 6筒: 2 parallel columns tightly packed — 3 rows × 2 cols
// 7筒: BOTTOM 4 red (2×2), TOP 3 green (row of 3) — 4 reds below, 3 greens above
// 8筒: 2 cols × 4 rows, all blue, tightly packed

const P_COL = {
  1: ['#c0392b'],
  2: ['#1a6ea8','#27ae60'],                                    // bottom blue, top green
  3: ['#1a6ea8','#c0392b','#27ae60'],                          // diagonal: BL blue, C red, TR green
  4: ['#1a6ea8','#27ae60','#27ae60','#1a6ea8'],                // BL blue,BR green / TL green,TR blue
  5: ['#1a6ea8','#27ae60','#c0392b','#27ae60','#1a6ea8'],      // BL,BR,C,TL,TR
  6: ['#c0392b','#c0392b','#c0392b','#c0392b','#27ae60','#27ae60'], // B-row red×2, M-row red×2, T-row green×2
  7: ['#c0392b','#c0392b','#c0392b','#c0392b','#27ae60','#27ae60','#27ae60'], // bottom 4 red, top 3 green
  8: ['#1a6ea8','#1a6ea8','#1a6ea8','#1a6ea8','#1a6ea8','#1a6ea8','#1a6ea8','#1a6ea8'],
  9: ['#27ae60','#27ae60','#27ae60','#c0392b','#c0392b','#c0392b','#1a6ea8','#1a6ea8','#1a6ea8'],
};

const P_POS = {
  1:  [[50,50]],
  2:  [[50,70],[50,30]],
  3:  [[32,74],[50,50],[68,26]],
  4:  [[32,70],[68,70],[32,30],[68,30]],
  5:  [[32,73],[68,73],[50,50],[32,27],[68,27]],
  // 6: 2 cols tightly packed, 3 rows
  6:  [[34,76],[66,76],[34,50],[66,50],[34,24],[66,24]],
  // 7: bottom 4 red = 2×2 grid, top 3 green = row of 3
  7:  [[34,76],[66,76],[34,54],[66,54],[26,26],[50,26],[74,26]],
  // 8: 2 cols × 4 rows, tightly packed
  8:  [[32,80],[68,80],[32,60],[68,60],[32,40],[68,40],[32,20],[68,20]],
  9:  [[26,80],[50,80],[74,80],[26,50],[50,50],[74,50],[26,20],[50,20],[74,20]],
};

function PinDot({ cx, cy, r, color }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="#ede8d0" stroke={color} strokeWidth={r*0.18}/>
      <circle cx={cx} cy={cy} r={r*0.44} fill={color}/>
      <circle cx={cx-r*0.2} cy={cy-r*0.2} r={r*0.14} fill="rgba(255,255,255,0.6)"/>
    </g>
  );
}
function PinFace({ n, isSmall }) {
  const pos = P_POS[n] || [], col = P_COL[n] || [];
  const r = isSmall ? 9 : 11;
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" style={{display:'block'}}>
      {pos.map(([cx,cy],i) => <PinDot key={i} cx={cx} cy={cy} r={r} color={col[i]||'#1a6ea8'}/>)}
    </svg>
  );
}

// ── 索 (bamboo) ───────────────────────────────────────────────────────────────
// Sticks are taller and packed tighter in viewBox
// Positions listed top→bottom, L→R
// 3索: 1 stick top-centre, 2 sticks bottom-row (L+R)
// 5索: index order: LT, RED-C, LB, RT, RB
// 6索: 2 cols × 3 rows, all green
// 7索: 1 red top-centre, then 3 pairs (L+R) in 3 rows = 7 total
// 8索: inverted-M top (∧) + M bottom (∨) — 4+4 sticks
// 9索: 3 cols × 3 rows, L=green, M=red, R=green
const S_COL = {
  2: ['#2e8b3a','#2e8b3a'],
  3: ['#2e8b3a','#2e8b3a','#2e8b3a'],
  4: ['#2e8b3a','#2e8b3a','#2e8b3a','#2e8b3a'],
  5: ['#2e8b3a','#c0392b','#2e8b3a','#2e8b3a','#2e8b3a'],
  6: ['#2e8b3a','#2e8b3a','#2e8b3a','#2e8b3a','#2e8b3a','#2e8b3a'],
  7: ['#c0392b','#2e8b3a','#2e8b3a','#2e8b3a','#2e8b3a','#2e8b3a','#2e8b3a'],
  8: ['#2e8b3a','#2e8b3a','#2e8b3a','#2e8b3a','#2e8b3a','#2e8b3a','#2e8b3a','#2e8b3a'],
  9: ['#2e8b3a','#c0392b','#2e8b3a','#2e8b3a','#c0392b','#2e8b3a','#2e8b3a','#c0392b','#2e8b3a'],
};
const S_POS = {
  2:  [[50,28],[50,72]],
  3:  [[50,16],[35,72],[65,72]],
  4:  [[35,26],[65,26],[35,74],[65,74]],
  5:  [[35,20],[50,50],[35,80],[65,20],[65,80]],
  6:  [[35,16],[65,16],[35,50],[65,50],[35,84],[65,84]],
  7:  [[50,11],[35,35],[65,35],[35,60],[65,60],[35,84],[65,84]],
  // 8: inverted-M (4 top) + M (4 bottom): outer-TL,inner-TL,inner-TR,outer-TR + mirror
  8:  [[24,14],[44,30],[56,30],[76,14],[24,86],[44,70],[56,70],[76,86]],
  9:  [[25,15],[50,15],[75,15],[25,50],[50,50],[75,50],[25,85],[50,85],[75,85]],
};

function BambooStick({ cx, cy, w, h, color }) {
  const dark = color==='#2e8b3a'?'#1a5a22':color==='#c0392b'?'#7a1208':'#0d3060';
  return (
    <g transform={`translate(${cx},${cy})`}>
      <rect x={-w/2} y={-h/2} width={w} height={h} rx={w*0.42} fill={color}/>
      <rect x={-w/2-0.6} y={-1} width={w+1.2} height={2} rx={1} fill={dark}/>
      <rect x={-w/2+1} y={-h/2+2} width={w*0.28} height={h-4} rx={0.7} fill="rgba(255,255,255,0.28)"/>
    </g>
  );
}

function SouFace({ n, isSmall }) {
  const sw = isSmall ? 8 : 11;
  const sh = isSmall ? 20 : 28;
  if (n === 1) {
    return (
      <svg viewBox="0 0 100 100" width="100%" height="100%" style={{display:'block'}}>
        <line x1={25} y1={78} x2={75} y2={70} stroke="#5a3a10" strokeWidth={3} strokeLinecap="round"/>
        <line x1={50} y1={74} x2={50} y2={86} stroke="#5a3a10" strokeWidth={2.5} strokeLinecap="round"/>
        <ellipse cx={48} cy={54} rx={15} ry={11} fill="#c0392b"/>
        <ellipse cx={38} cy={57} rx={11} ry={7} fill="#1a6ea8" transform="rotate(-12,38,57)"/>
        <circle cx={63} cy={46} r={9} fill="#c0392b"/>
        <circle cx={66} cy={43} r={2.5} fill="white"/>
        <circle cx={67} cy={43} r={1.2} fill="#111"/>
        <polygon points="71,46 78,43 71,49" fill="#d4a020"/>
        <path d="M33,58 Q15,42 17,26" stroke="#27ae60" strokeWidth={3} fill="none" strokeLinecap="round"/>
        <path d="M32,61 Q12,54 14,42" stroke="#2980b9" strokeWidth={2.5} fill="none" strokeLinecap="round"/>
        <path d="M34,63 Q16,66 18,55" stroke="#c0392b" strokeWidth={2.5} fill="none" strokeLinecap="round"/>
      </svg>
    );
  }
  const pos = S_POS[n] || [], col = S_COL[n] || [];
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" style={{display:'block'}}>
      {pos.map(([cx,cy],i) => <BambooStick key={i} cx={cx} cy={cy} w={sw} h={sh} color={col[i]||'#2e8b3a'}/>)}
    </svg>
  );
}

function ManFace({ n, isSmall }) {
  const sz = isSmall ? '0.72em' : '1.05em';
  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100%',gap:0,lineHeight:1}}>
      <span style={{fontSize:sz,fontWeight:800,color:'#1a6ea8'}}>{CN_NUM[n-1]}</span>
      <span style={{fontSize:sz,color:'#c0392b',fontWeight:800}}>萬</span>
    </div>
  );
}
function HonourFace({ tkey, isSmall }) {
  if (tkey === 'haku') {
    // 白板: blank white board with blue border frame
    const pad = isSmall ? 2 : 4;
    return (
      <svg viewBox="0 0 100 100" width="100%" height="100%" style={{display:'block'}}>
        <rect x={12} y={12} width={76} height={76} rx={6} fill="white" stroke="#1a6ea8" strokeWidth={5}/>
        <rect x={18} y={18} width={64} height={64} rx={3} fill="none" stroke="#1a6ea8" strokeWidth={2}/>
      </svg>
    );
  }
  return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100%'}}>
      <span style={{fontSize:isSmall?'.9em':'1.5em',fontWeight:900,color:HONOUR_COLOR[tkey]||'#333',lineHeight:1}}>{TILE_DISPLAY[tkey]||tkey}</span>
    </div>
  );
}
const FLOWER_META = {
  plum:         { ch:'梅', n:1, emoji:'🌸', isSeason:false },
  orchid:       { ch:'蘭', n:2, emoji:'🌺', isSeason:false },
  chrysanthemum:{ ch:'菊', n:3, emoji:'🌼', isSeason:false },
  bamboo:       { ch:'竹', n:4, emoji:'🎋', isSeason:false },
  spring:       { ch:'春', n:1, emoji:'🌱', isSeason:true },
  summer:       { ch:'夏', n:2, emoji:'☀️', isSeason:true },
  autumn:       { ch:'秋', n:3, emoji:'🍂', isSeason:true },
  winter:       { ch:'冬', n:4, emoji:'❄️', isSeason:true },
};

function FlowerFace({ tkey, isSmall }) {
  const meta = FLOWER_META[tkey] || { ch:tkey, n:'', emoji:'🌸', isSeason:false };
  const color = FLOWER_COLOR[tkey] || '#888';
  const numColor = meta.isSeason ? '#1a6ea8' : '#c0392b';
  const CN_NUMS = ['一','二','三','四'];
  const numCh = CN_NUMS[(meta.n||1)-1] || '';
  if (isSmall) {
    return (
      <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100%',gap:0,lineHeight:1,position:'relative'}}>
        <span style={{fontSize:'0.75em',lineHeight:1}}>{meta.emoji}</span>
        <span style={{fontSize:'0.5em',fontWeight:800,color,lineHeight:1}}>{meta.ch}</span>
        <span style={{position:'absolute',bottom:0,right:meta.isSeason?'auto':1,left:meta.isSeason?1:'auto',fontSize:'0.48em',fontWeight:900,color:numColor,lineHeight:1}}>{numCh}</span>
      </div>
    );
  }
  // Full size: season number on LEFT in blue, flower number on RIGHT in red
  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100%',gap:1,lineHeight:1,position:'relative'}}>
      {meta.isSeason && <span style={{position:'absolute',top:2,left:3,fontSize:'0.55em',fontWeight:900,color:numColor,lineHeight:1}}>{numCh}</span>}
      {!meta.isSeason && <span style={{position:'absolute',top:2,right:3,fontSize:'0.55em',fontWeight:900,color:numColor,lineHeight:1}}>{numCh}</span>}
      <span style={{fontSize:'1.15em',lineHeight:1}}>{meta.emoji}</span>
      <span style={{fontSize:'0.62em',fontWeight:900,color,lineHeight:1}}>{meta.ch}</span>
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
      {hintBest && <div className="hint-crown">★</div>}
      {hint && !hintBest && <div className="hint-dot"/>}
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
function TileTracker({ hand, discards, melds, highlightKey }) {
  const seen = {};
  const count = t => { seen[t.key]=(seen[t.key]||0)+1; };
  hand.forEach(count);
  discards.flat().forEach(count);
  melds.flat().flatMap(m=>m.tiles).forEach(count);
  const rem = key => 4-(seen[key]||0);
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
function OpponentPanel({ player, hand, melds, discards, flowers, seatWind, isDealer, isTurn, debug, highlightKey, seatIdx, flashClaim, flashType }) {
  const claimWord = flashClaim ? (flashType==='kong'?'槓！':flashType==='chi'?'上！':'碰！') : null;
  const claimColor = flashType==='kong'?'#8e44ad':flashType==='chi'?'#1a6ea8':'#c8973a';
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
      <div className="opp-tiles">
        {debug
          ? hand.map(t=><Tile key={t.id} tile={t} small highlighted={highlightKey===t.key}/>)
          : hand.map((_,i)=><TileBack key={i} small/>)
        }
      </div>
      <div className="opp-discards">
        {discards.map(t=><Tile key={t.id} tile={t} small inDiscard highlighted={highlightKey===t.key}/>)}
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
  const lanes = ['flush','halfFlush','triplet','pingHu','dragon','winds','orphan'];

  // Determine dominant suit for flush/halfFlush lanes
  const suitCt = { man:0, pin:0, sou:0 };
  for (const t of tiles) {
    for (const s of ['man','pin','sou']) if (t.key.startsWith(s) && /\d$/.test(t.key)) suitCt[s]++;
  }
  const domSuit = Object.entries(suitCt).sort((a,b)=>b[1]-a[1])[0]?.[0];

  function laneLabel(lane) {
    if ((lane==='flush'||lane==='halfFlush') && domSuit && suitCt[domSuit]>0) {
      return (LANE_LABELS[lane]||lane) + '(' + SUIT_CHARS[domSuit] + ')';
    }
    return LANE_LABELS[lane]||lane;
  }

  return (
    <div className="strategy-panel">
      <div className="strategy-panel-title">牌路策略</div>
      {scan && (
        <div className="strategy-scan">
          <span style={{fontSize:'.68rem',color:'var(--dim)'}}>建議：</span>
          <span className="strategy-best-badge">{laneLabel(scan.best)}</span>
        </div>
      )}
      <div className="strategy-lane-list">
        {lanes.map(lane=>{
          const score = scan?.ranked?.find(r=>r.lane===lane)?.score??0;
          const isChosen = chosenLane===lane;
          const isBest = scan?.best===lane;
          return (
            <button key={lane}
              className={`strategy-lane-btn${isChosen?' chosen':''}${isBest?' best':''}`}
              onClick={()=>onChoose(lane===chosenLane?null:lane)}>
              <span className="sl-name">{laneLabel(lane)}</span>
              <span className="sl-score" style={{color:score>20?'#27ae60':score<-20?'#e74c3c':'var(--dim)'}}>{score>0?'+'+score:score}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Setup Screen ─────────────────────────────────────────────────────────────
const DEFAULT_PLAYERS = [
  { name:'你',   isHuman:true,  strategy:'balanced' },
  { name:'阿明', isHuman:false, strategy:'flush' },
  { name:'阿珍', isHuman:false, strategy:'value' },
  { name:'阿強', isHuman:false, strategy:'balanced' },
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
                  <button key={k} className={`toggle-btn${p.strategy===k?' active':''}`} onClick={()=>upd(i,'strategy',k)}>{v.label}</button>
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
          <thead><tr><th>局</th>{players.map((p,i)=><th key={i}>{p.name}</th>)}<th>結果</th></tr></thead>
          <tbody>
            {results.slice(-20).reverse().map((r,idx)=>(
              <tr key={idx}>
                <td>{results.length-idx}</td>
                {r.finalScores.map((s,i)=><td key={i} style={{color:s>0?'#2ecc71':s<0?'#e74c3c':'inherit'}}>{s>0?'+':''}{s}</td>)}
                <td style={{color:'var(--dim)',fontSize:'.68rem'}}>
                  {r.hands.filter(h=>h.result?.type==='win').map(h=>`${players[h.result.winner].name}${h.result.isSelfDraw?'摸':'食'}${h.result.fan}番`).join(' · ')||'流局'}
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
  },[hand?.currentPlayer,hand?.phase,screen]);

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

      {/* Table */}
      <div className="table">
        <OpponentPanel player={players[topPi]} hand={hands[topPi]} melds={melds[topPi]} discards={discards[topPi]} flowers={flowers[topPi]} seatWind={seatWinds[topPi]} isDealer={topPi===dealer} isTurn={topPi===currentPlayer&&!result} debug={debug} highlightKey={hoverKey} seatIdx={topPi} flashClaim={claimAnnounce?.player===topPi} flashType={claimAnnounce?.type}/>
        <OpponentPanel player={players[leftPi]} hand={hands[leftPi]} melds={melds[leftPi]} discards={discards[leftPi]} flowers={flowers[leftPi]} seatWind={seatWinds[leftPi]} isDealer={leftPi===dealer} isTurn={leftPi===currentPlayer&&!result} debug={debug} highlightKey={hoverKey} seatIdx={leftPi} flashClaim={claimAnnounce?.player===leftPi} flashType={claimAnnounce?.type}/>
        <OpponentPanel player={players[rightPi]} hand={hands[rightPi]} melds={melds[rightPi]} discards={discards[rightPi]} flowers={flowers[rightPi]} seatWind={seatWinds[rightPi]} isDealer={rightPi===dealer} isTurn={rightPi===currentPlayer&&!result} debug={debug} highlightKey={hoverKey} seatIdx={rightPi} flashClaim={claimAnnounce?.player===rightPi} flashType={claimAnnounce?.type}/>

        <div className="center">
          <div className="discards-grid">
            {[topPi,rightPi,leftPi,humanIdx].map(pi=>(
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
          <div className="wall-count">剩牌：<span>{wall?.length||0}</span> 張</div>
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

        {/* Bottom — human */}
        <div className="bottom-area">
          <div className="hand-top">
            <span className="hand-label">{players[humanIdx].name}</span>
            <span className="badge badge-wind">{WIND_LABELS[seatWinds[humanIdx]]}</span>
            {humanIdx===dealer&&<span className="badge badge-dealer">莊</span>}
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
            <div style={{marginLeft:'auto',display:'flex',gap:6,alignItems:'center'}}>
              {hand._canSelfDraw&&isHumanTurn&&(()=>{
                const p=humanIdx;
                const {fan}=calcFan(hand.hands[p],hand.melds[p],hand.drawnTile,true,
                  hand.seatWinds[p],hand.session.round,hand.flowers[p]);
                const meetsMin = fan >= hand.session.minFan;
                return <button className={`btn ${meetsMin?'btn-red':'btn-gray'}`}
                  title={meetsMin?`自摸 ${fan}番`:`${fan}番 (需${hand.session.minFan}番)`}
                  onClick={handleSelfDraw}>自摸！{fan}番</button>;
              })()}
              <button className="btn btn-red"
                disabled={!selectedTile||!isHumanTurn||phase!=='discard'}
                onClick={handleDiscard}>打出所選</button>
            </div>
          </div>

          {/* Hand rack — always sorted, drawn tile always at right */}
          <div className="hand-rack" style={{position:'relative'}}>
            {handTilesNoDrawn.map(t=>{
              const da = discardInfoMap[t.id];
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
                  hint={hint && discardInfoMap[drawnTileObj.id]?.leadsToTenpai && !discardInfoMap[drawnTileObj.id]?.isBestDiscard}
                  hintBest={hint && discardInfoMap[drawnTileObj.id]?.isBestDiscard}
                  highlighted={hoverKey===drawnTileObj.key}
                  onClick={()=>handleTileClick(drawnTileObj)}
                  onMouseEnter={()=>{
                    setHoverKey(drawnTileObj.key);
                    const da=discardInfoMap[drawnTileObj.id];
                    if(hint&&da) setTooltip({tileId:drawnTileObj.id, discardInfo:da});
                  }}
                  onMouseLeave={()=>{ setHoverKey(null); setTooltip(null); }}
                  danger={dangerMap[drawnTileObj.key] ?? -1}
                />
                {tooltip?.tileId===drawnTileObj.id && (
                  <DangerTooltip dangerLevel={dangerMap[drawnTileObj.key]??-1} discardInfo={discardInfoMap[drawnTileObj.id]} visible/>
                )}
              </div>
            </>}
          </div>

          {/* Hint summary bar */}
          {hint&&(
            <div className="hint-panel">
              <span className={`shanten-badge${hint.shanten===0?' tenpai':hint.shanten<0?' win':''}`}>{hint.msg}</span>
              {/* Best discard recommendation */}
              {hint.shanten===0&&hint.discardAnalysis.length>0&&(()=>{
                const best = hint.discardAnalysis.filter(d=>d.isBestDiscard);
                const total = best.reduce((s,d)=>s+d.tenpai.reduce((a,w)=>a+w.remaining,0),0);
                return <span className="hint-best-text">
                  打 <strong>{best.map(d=>TILE_DISPLAY[d.tile.key]).join(' 或 ')}</strong>
                  {total>0&&<> · 等{total}張</>}
                </span>;
              })()}
              {hint.shanten===1&&hint.discardAnalysis.some(d=>d.leadsToTenpai)&&(()=>{
                const best = hint.discardAnalysis.filter(d=>d.isBestDiscard&&d.leadsToTenpai);
                if(!best.length) return null;
                const maxWins = Math.max(...best.map(d=>d.tenpai.reduce((s,w)=>s+w.remaining,0)));
                return <span className="hint-best-text">
                  打 <strong>{best.map(d=>TILE_DISPLAY[d.tile.key]).join(' 或 ')}</strong> 可聽牌 · 等{maxWins}張
                </span>;
              })()}
              {hint.shanten===1&&!hint.discardAnalysis.some(d=>d.leadsToTenpai)&&(()=>{
                const best = hint.discardAnalysis.filter(d=>d.isBestDiscard);
                return <span style={{fontSize:'.7rem',color:'var(--dim)'}}>
                  建議打 <strong style={{color:'var(--gold-lt)'}}>{best.map(d=>TILE_DISPLAY[d.tile.key]).join(' 或 ')}</strong>
                </span>;
              })()}
              {hint.shanten>1&&(()=>{
                const best = hint.discardAnalysis.filter(d=>d.isBestDiscard);
                return <span style={{fontSize:'.7rem',color:'var(--dim)'}}>
                  建議打 <strong style={{color:'var(--gold-lt)'}}>{best.map(d=>TILE_DISPLAY[d.tile.key]).join(' 或 ')}</strong>
                </span>;
              })()}
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
          <TileTracker hand={humanHand} discards={discards} melds={melds} highlightKey={hoverKey}/>
        </div>
      </div>

      {result&&phase==='finished'&&<WinOverlay result={result} players={players} dealer={dealer} hands={hands} melds={melds} flowers={flowers} seatWinds={seatWinds} onNext={handleNextHand}/>}
      {showRules&&<RulesTab onClose={()=>setShowRules(false)}/>}
    </div>
  );
}
