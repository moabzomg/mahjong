import { useState, useEffect, useCallback } from 'react';
import './index.css';
import {
  SUITS, HONOURS, WINDS, FLOWERS, TILE_EMOJI, TILE_DISPLAY,
  sortHand, analyzeHand, calcFan, fanToPoints, isSuit, isHonour,
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

// ─── Tile SVG art — traditional HK Mahjong layouts ──────────────────────────
const CN_NUM = ['一','二','三','四','五','六','七','八','九'];
const HONOUR_COLOR = { east:'#1a6ea8',south:'#c0392b',west:'#27ae60',north:'#1a1a1a',chun:'#c0392b',hatsu:'#27ae60',haku:'#1a1a1a' };
const FLOWER_COLOR = { plum:'#c0392b',orchid:'#8e44ad',chrysanthemum:'#d35400',bamboo:'#27ae60',spring:'#27ae60',summer:'#d35400',autumn:'#c0392b',winter:'#2980b9' };

// Traditional 筒 dot colours per tile number (matches real HK tiles)
// 1=red, 2=blue/green, 3=red, 4=blue, 5=mixed, 6=blue, 7=red, 8=blue, 9=tri-colour
const PIN_DOT_COLORS = {
  1:  () => ['#c0392b'],
  2:  () => ['#1a6ea8','#27ae60'],
  3:  () => ['#c0392b','#1a6ea8','#27ae60'],  // diagonal: red TL, blue C, green BR
  4:  () => ['#1a6ea8','#1a6ea8','#27ae60','#27ae60'],
  5:  () => ['#1a6ea8','#27ae60','#c0392b','#1a6ea8','#27ae60'],
  6:  () => ['#1a6ea8','#1a6ea8','#27ae60','#27ae60','#c0392b','#c0392b'],
  7:  () => ['#1a6ea8','#1a6ea8','#1a6ea8','#27ae60','#27ae60','#27ae60','#c0392b'],  // 3L blue + 3R green + 1bot red
  8:  () => ['#1a6ea8','#27ae60','#1a6ea8','#27ae60','#c0392b','#1a6ea8','#27ae60','#c0392b'],  // alternating L/R
  9:  () => ['#c0392b','#1a6ea8','#27ae60','#c0392b','#1a6ea8','#27ae60','#c0392b','#1a6ea8','#27ae60'],
};

// Traditional dot positions — authentic HK mahjong layout
// 3-pin: diagonal TL→C→BR like a die
// 7-pin: 3 left col + 3 right col + 1 bottom centre
// 8-pin: 2 left col × 4 + 2 right col × 4
const PIN_POSITIONS = {
  1: [[50,50]],
  2: [[50,28],[50,72]],
  3: [[30,25],[50,50],[70,75]],          // diagonal: TL, centre, BR
  4: [[30,28],[70,28],[30,72],[70,72]],
  5: [[30,25],[70,25],[50,50],[30,75],[70,75]],
  6: [[30,22],[70,22],[30,50],[70,50],[30,78],[70,78]],
  7: [[30,18],[70,18],[30,44],[70,44],[30,70],[70,70],[50,84]],  // 3+3 cols + 1 bottom
  8: [[28,18],[72,18],[28,38],[72,38],[28,58],[72,58],[28,78],[72,78]],  // 2 cols of 4
  9: [[26,18],[50,18],[74,18],[26,50],[50,50],[74,50],[26,82],[50,82],[74,82]],
};

// Dot sizes: outer ring + inner fill
function PinDot({ cx, cy, r, color }) {
  const ringR = r * 0.38;
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="#e8e0c0" stroke={color} strokeWidth={r*0.22}/>
      <circle cx={cx} cy={cy} r={ringR} fill={color}/>
      <circle cx={cx - r*0.22} cy={cy - r*0.22} r={ringR*0.35} fill="rgba(255,255,255,0.55)"/>
    </g>
  );
}

function PinFace({ n, isSmall }) {
  const positions = PIN_POSITIONS[n] || [];
  const colors = PIN_DOT_COLORS[n] ? PIN_DOT_COLORS[n]() : [];
  const r = isSmall ? 8.5 : 10.5;
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" style={{display:'block'}}>
      {positions.map(([cx,cy],i) => (
        <PinDot key={i} cx={cx} cy={cy} r={r} color={colors[i] || colors[0] || '#1a6ea8'}/>
      ))}
    </svg>
  );
}

// Traditional 索 bamboo — each stick = tapered green bamboo with node rings
// Sou-1 is a special peacock/bird tile
// Bamboo stick positions — authentic HK mahjong layout
// 2-sou: single col of 2
// 3-sou: single col of 3
// 4-6: two columns
// 7-sou: 3+3 columns + 1 top centre
// 8-sou: 2 columns of 4
// 9-sou: 3 columns of 3
const SOU_POSITIONS = {
  2: [[50,30],[50,70]],
  3: [[50,20],[50,50],[50,80]],
  4: [[35,28],[65,28],[35,72],[65,72]],
  5: [[35,24],[65,24],[50,50],[35,76],[65,76]],
  6: [[35,21],[65,21],[35,50],[65,50],[35,79],[65,79]],
  7: [[50,16],[35,42],[65,42],[35,64],[65,64],[35,84],[65,84]],   // 1 top-centre + 3+3
  8: [[30,18],[70,18],[30,38],[70,38],[30,58],[70,58],[30,78],[70,78]],  // 2 cols of 4
  9: [[25,18],[50,18],[75,18],[25,50],[50,50],[75,50],[25,82],[50,82],[75,82]],  // 3 cols of 3
};

// Traditional bamboo stick colours: alternating green/red pattern
// Each entry is [stickColor, nodeColor]
// Per-tile bamboo colours indexed by stick number (0-based)
// Colour varies: green sticks with occasional red highlight
const SOUColors = [
  ['#2e8b3a','#1a5a22'], // 0: green
  ['#c0392b','#8a1a0a'], // 1: red
  ['#2e8b3a','#1a5a22'], // 2: green
  ['#c0392b','#8a1a0a'], // 3: red
  ['#2e8b3a','#1a5a22'], // 4: green
  ['#c0392b','#8a1a0a'], // 5: red
  ['#2e8b3a','#1a5a22'], // 6: green
  ['#c0392b','#8a1a0a'], // 7: red
  ['#2e8b3a','#1a5a22'], // 8: green
];

function BambooStick({ cx, cy, w, h, stickColor, nodeColor }) {
  return (
    <g transform={`translate(${cx},${cy})`}>
      {/* Main bamboo body */}
      <rect x={-w/2} y={-h/2} width={w} height={h} rx={w*0.45}
        fill={stickColor}/>
      {/* Node ring at center */}
      <rect x={-w/2-1} y={-1.5} width={w+2} height={3} rx={1.5}
        fill={nodeColor}/>
      {/* Highlight */}
      <rect x={-w/2+1.2} y={-h/2+2} width={w*0.28} height={h-4} rx={1}
        fill="rgba(255,255,255,0.28)"/>
    </g>
  );
}

function SouFace({ n, isSmall }) {
  const sw = isSmall ? 7 : 10;
  const sh = isSmall ? 18 : 26;

  if (n === 1) {
    // Sou-1: traditional peacock/bird on a bamboo branch
    return (
      <svg viewBox="0 0 100 100" width="100%" height="100%" style={{display:'block'}}>
        {/* Branch */}
        <line x1={30} y1={75} x2={70} y2={65} stroke="#5a3a10" strokeWidth={3} strokeLinecap="round"/>
        <line x1={50} y1={70} x2={50} y2={82} stroke="#5a3a10" strokeWidth={3} strokeLinecap="round"/>
        {/* Bird body */}
        <ellipse cx={50} cy={52} rx={16} ry={12} fill="#c0392b"/>
        {/* Wing */}
        <ellipse cx={42} cy={54} rx={10} ry={7} fill="#27ae60" transform="rotate(-15,42,54)"/>
        {/* Head */}
        <circle cx={62} cy={46} r={9} fill="#c0392b"/>
        {/* Eye */}
        <circle cx={65} cy={44} r={2.5} fill="white"/>
        <circle cx={65.8} cy={44} r={1.2} fill="#1a1a1a"/>
        {/* Beak */}
        <polygon points="70,46 76,44 70,48" fill="#d4a020"/>
        {/* Tail feathers */}
        <path d="M34,56 Q18,40 20,28" stroke="#27ae60" strokeWidth={3} fill="none" strokeLinecap="round"/>
        <path d="M34,58 Q14,50 12,40" stroke="#2980b9" strokeWidth={2.5} fill="none" strokeLinecap="round"/>
        <path d="M34,60 Q16,62 18,52" stroke="#c0392b" strokeWidth={2.5} fill="none" strokeLinecap="round"/>
      </svg>
    );
  }

  const positions = SOU_POSITIONS[n] || [];
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" style={{display:'block'}}>
      {positions.map(([cx,cy],i) => {
        const [stickColor, nodeColor] = SOUColors[i % SOUColors.length];
        return <BambooStick key={i} cx={cx} cy={cy} w={sw} h={sh} stickColor={stickColor} nodeColor={nodeColor}/>;
      })}
    </svg>
  );
}

function ManFace({ n, isSmall }) {
  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100%',gap:0,lineHeight:1}}>
      <span style={{fontSize:isSmall?'.82em':'1.28em',fontWeight:800,color:'#c0392b'}}>{CN_NUM[n-1]}</span>
      <span style={{fontSize:isSmall?'.48em':'.72em',color:'#7a2a00',fontWeight:700}}>萬</span>
    </div>
  );
}
function HonourFace({ tkey, isSmall }) {
  return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100%'}}>
      <span style={{fontSize:isSmall?'.9em':'1.5em',fontWeight:900,color:HONOUR_COLOR[tkey]||'#333',lineHeight:1}}>{TILE_DISPLAY[tkey]||tkey}</span>
    </div>
  );
}
// Flower metadata: [Chinese, number (1-4 per season/flower set), emoji]
const FLOWER_META = {
  plum:         { ch:'梅', n:1, emoji:'🌸' },
  orchid:       { ch:'蘭', n:2, emoji:'🌺' },
  chrysanthemum:{ ch:'菊', n:3, emoji:'🌼' },
  bamboo:       { ch:'竹', n:4, emoji:'🎋' },
  spring:       { ch:'春', n:1, emoji:'🌱' },
  summer:       { ch:'夏', n:2, emoji:'☀️' },
  autumn:       { ch:'秋', n:3, emoji:'🍂' },
  winter:       { ch:'冬', n:4, emoji:'❄️' },
};

function FlowerFace({ tkey, isSmall }) {
  const meta = FLOWER_META[tkey] || { ch: tkey, n:'', emoji:'🌸' };
  const color = FLOWER_COLOR[tkey] || '#888';
  if (isSmall) {
    return (
      <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100%',gap:0,lineHeight:1}}>
        <span style={{fontSize:'0.7em',lineHeight:1}}>{meta.emoji}</span>
        <span style={{fontSize:'0.55em',fontWeight:800,color,lineHeight:1}}>{meta.ch}{meta.n}</span>
      </div>
    );
  }
  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100%',gap:1,lineHeight:1}}>
      <span style={{fontSize:'1.1em',lineHeight:1}}>{meta.emoji}</span>
      <span style={{fontSize:'0.6em',fontWeight:900,color,lineHeight:1}}>{meta.ch}{meta.n}</span>
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
function Tile({ tile, selected, drawn, small, inDiscard, highlighted, dimmed, hint, hintBest, onClick, onMouseEnter, onMouseLeave }) {
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
  ].filter(Boolean).join(' ');
  return (
    <div className={cn} onClick={onClick} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}
      title={TILE_DISPLAY[tile.key]||tile.key}>
      <TileFace tkey={tile.key} isSmall={small}/>
      {hintBest && <div className="hint-crown">★</div>}
      {hint && !hintBest && <div className="hint-dot"/>}
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
function OpponentPanel({ player, hand, melds, discards, flowers, seatWind, isDealer, isTurn, debug, highlightKey, seatIdx }) {
  return (
    <div className="aip">
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
    { name:'七對子', fan:3, desc:'七對牌糊牌（需七個不同對子）' },
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
function StrategyPanel({ tiles, melds, seatWind, roundWind, minFan, chosenLane, onChoose }) {
  const scan = tiles.length > 0 ? scanBestLane(tiles, melds, seatWind, roundWind, minFan) : null;
  const lanes = ['flush','triplet','value','dragon','winds','orphan','speed','sevenPairs'];
  return (
    <div className="strategy-panel">
      <div className="strategy-panel-title">牌路策略</div>
      {scan && (
        <div className="strategy-scan">
          <span style={{fontSize:'.68rem',color:'var(--dim)'}}>AI建議：</span>
          <span className="strategy-best-badge">{LANE_LABELS[scan.best]||scan.best}</span>
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
              onClick={()=>onChoose(lane)}>
              <span className="sl-name">{LANE_LABELS[lane]||lane}</span>
              <span className="sl-score">{score>0?'▲':score<0?'▼':'─'}</span>
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
  const [chosenLane, setChosenLane] = useState(null); // player's chosen strategy lane
  // Hover state: { tileKey } for cross-highlighting
  const [hoverKey, setHoverKey] = useState(null);
  // Tooltip state: { tile, discardInfo, x, y }
  const [tooltip, setTooltip] = useState(null);

  const humanIdx = hand ? hand.session.players.findIndex(p=>p.isHuman) : 0;

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
        <OpponentPanel player={players[topPi]} hand={hands[topPi]} melds={melds[topPi]} discards={discards[topPi]} flowers={flowers[topPi]} seatWind={seatWinds[topPi]} isDealer={topPi===dealer} isTurn={topPi===currentPlayer&&!result} debug={debug} highlightKey={hoverKey} seatIdx={topPi}/>
        <OpponentPanel player={players[leftPi]} hand={hands[leftPi]} melds={melds[leftPi]} discards={discards[leftPi]} flowers={flowers[leftPi]} seatWind={seatWinds[leftPi]} isDealer={leftPi===dealer} isTurn={leftPi===currentPlayer&&!result} debug={debug} highlightKey={hoverKey} seatIdx={leftPi}/>
        <OpponentPanel player={players[rightPi]} hand={hands[rightPi]} melds={melds[rightPi]} discards={discards[rightPi]} flowers={flowers[rightPi]} seatWind={seatWinds[rightPi]} isDealer={rightPi===dealer} isTurn={rightPi===currentPlayer&&!result} debug={debug} highlightKey={hoverKey} seatIdx={rightPi}/>

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
              {hand._canSelfDraw&&isHumanTurn&&(
                <button className="btn btn-red" onClick={handleSelfDraw}>自摸！</button>
              )}
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
              return (
                <div key={t.id} style={{position:'relative'}} className="tile-wrapper">
                  <Tile
                    tile={t}
                    selected={selectedTile?.id===t.id}
                    hint={isHint && !isHintBest}
                    hintBest={isHintBest}
                    highlighted={hoverKey===t.key}
                    onClick={()=>handleTileClick(t)}
                    onMouseEnter={(e)=>{
                      setHoverKey(t.key);
                      if(hint && da) setTooltip({tileId:t.id, discardInfo:da});
                    }}
                    onMouseLeave={()=>{ setHoverKey(null); setTooltip(null); }}
                  />
                  {tooltip?.tileId===t.id && (
                    <TenpaiTooltip discardInfo={tooltip.discardInfo} visible/>
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
                />
                {tooltip?.tileId===drawnTileObj.id && (
                  <TenpaiTooltip discardInfo={discardInfoMap[drawnTileObj.id]} visible/>
                )}
              </div>
            </>}
          </div>

          {/* Hint summary bar */}
          {hint&&(
            <div className="hint-panel">
              <span className={`shanten-badge${hint.shanten===0?' tenpai':hint.shanten<0?' win':''}`}>{hint.msg}</span>
              {hint.shanten===0&&(
                <span style={{fontSize:'.7rem',color:'var(--dim)'}}>
                  <span style={{color:'var(--gold)'}}>★</span> 打出可聽牌
                  {hint.tenpaiDetails.length>0&&<> · 等 <span style={{color:'#e74c3c'}}>{hint.totalRemaining}</span> 張</>}
                </span>
              )}
              {hint.shanten===1&&(
                <span style={{fontSize:'.7rem',color:'var(--dim)'}}>
                  <span style={{color:'var(--gold)'}}>★</span> 打出可差1步 · 懸停牌查看詳情
                </span>
              )}
              {hint.shanten>1&&(
                <span style={{fontSize:'.7rem',color:'var(--dim)'}}>懸停各牌查看打出後變化</span>
              )}
              {hint.hints.map((h,i)=><span key={i} className="hint-tag">{h}</span>)}
            </div>
          )}

          {/* Tenpai winning tiles display when in tenpai */}
          {hint?.shanten===0&&hint.tenpaiDetails.length>0&&(
            <div className="tenpai-bar">
              <span className="tenpai-bar-label">等牌：</span>
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
