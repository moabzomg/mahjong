import { useState, useEffect, useCallback } from 'react';
import './index.css';
import {
  SUITS, HONOURS, WINDS, FLOWERS, TILE_EMOJI, TILE_DISPLAY,
  sortHand, analyzeHand, calcFan, fanToPoints, isSuit, isHonour,
} from './game/tiles.js';
import {
  createSession, startHand, drawTile, doDiscard,
  aiTurn, playerClaimWin, playerPong, playerChi, playerPass, advanceSession,
  runOneGame
} from './game/gameEngine.js';
import { STRATEGIES } from './ai/strategies.js';

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
  3:  () => ['#c0392b','#1a6ea8','#27ae60'],
  4:  () => ['#1a6ea8','#1a6ea8','#27ae60','#27ae60'],
  5:  () => ['#1a6ea8','#27ae60','#c0392b','#1a6ea8','#27ae60'],
  6:  () => ['#1a6ea8','#1a6ea8','#27ae60','#27ae60','#c0392b','#c0392b'],
  7:  () => ['#1a6ea8','#27ae60','#1a6ea8','#27ae60','#c0392b','#c0392b','#1a6ea8'],
  8:  () => ['#1a6ea8','#1a6ea8','#27ae60','#27ae60','#c0392b','#c0392b','#1a6ea8','#27ae60'],
  9:  () => ['#c0392b','#1a6ea8','#27ae60','#c0392b','#1a6ea8','#27ae60','#c0392b','#1a6ea8','#27ae60'],
};

// Traditional dot positions — standard mahjong layout
const PIN_POSITIONS = {
  1: [[50,50]],
  2: [[50,30],[50,70]],
  3: [[50,22],[50,50],[50,78]],
  4: [[31,30],[69,30],[31,70],[69,70]],
  5: [[31,27],[69,27],[50,50],[31,73],[69,73]],
  6: [[31,24],[69,24],[31,50],[69,50],[31,76],[69,76]],
  7: [[31,21],[69,21],[31,47],[69,47],[31,71],[69,71],[50,84]],
  8: [[25,21],[50,21],[75,21],[25,50],[75,50],[25,79],[50,79],[75,79]],
  9: [[25,19],[50,19],[75,19],[25,50],[50,50],[75,50],[25,81],[50,81],[75,81]],
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
const SOU_POSITIONS = {
  // single column
  2: [[50,30],[50,70]],
  3: [[50,21],[50,50],[50,79]],
  // two columns
  4: [[34,30],[66,30],[34,70],[66,70]],
  5: [[34,26],[66,26],[50,50],[34,74],[66,74]],
  6: [[34,23],[66,23],[34,50],[66,50],[34,77],[66,77]],
  7: [[34,19],[66,19],[34,45],[66,45],[34,69],[66,69],[50,83]],
  8: [[26,19],[50,19],[74,19],[26,50],[74,50],[26,81],[50,81],[74,81]],
  9: [[26,17],[50,17],[74,17],[26,50],[50,50],[74,50],[26,83],[50,83],[74,83]],
};

// Traditional bamboo stick colours: alternating green/red pattern
// Each entry is [stickColor, nodeColor]
const SOUColors = [
  ['#2e8b3a','#1a5a22'], // green
  ['#c0392b','#8a1a0a'], // red (1st of each column usually red)
  ['#2e8b3a','#1a5a22'],
  ['#2e8b3a','#1a5a22'],
  ['#c0392b','#8a1a0a'],
  ['#2e8b3a','#1a5a22'],
  ['#2e8b3a','#1a5a22'],
  ['#c0392b','#8a1a0a'],
  ['#2e8b3a','#1a5a22'],
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
function FlowerFace({ tkey, isSmall }) {
  return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100%'}}>
      <span style={{fontSize:isSmall?'.78em':'1.05em',fontWeight:900,color:FLOWER_COLOR[tkey]||'#888',lineHeight:1}}>{FLOWER_NAMES[tkey]||tkey}</span>
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
function OpponentPanel({ player, hand, melds, discards, flowers, seatWind, isDealer, isTurn, debug, highlightKey }) {
  return (
    <div className="aip">
      <div className="opp-name">
        <span className="badge badge-wind">{WIND_LABELS[seatWind]}</span>
        {isDealer&&<span className="badge badge-dealer">莊</span>}
        {isTurn&&<span className="badge badge-turn">●</span>}
        <span>{player.name}</span>
        <span className="opp-remain">{hand.length}張</span>
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
function WinOverlay({ result, players, dealer, onNext }) {
  if (!result) return null;
  if (result.type==='draw') return (
    <div className="overlay">
      <div className="win-card">
        <div className="win-title">流局</div>
        <div className="win-subtitle">剩牌摸完</div>
        <div className="win-dealer-badge lim">冧莊（莊家連莊）</div>
        <br/>
        <button className="btn btn-gold" onClick={onNext}>下一局</button>
      </div>
    </div>
  );
  const winner=players[result.winner];
  const isDealerWin=result.winner===dealer;
  return (
    <div className="overlay">
      <div className="win-card">
        <div className="win-title">{winner.name} 胡牌！</div>
        <div className="win-subtitle">{result.isSelfDraw?'自摸':`出沖 — ${players[result.loser]?.name||''} 包`}</div>
        <div className="win-patterns">
          {result.patterns?.map((p,i)=><span key={i} className="pattern-tag">{p}</span>)}
        </div>
        <div className="win-fan">{result.fan>=99?'爆棚':result.fan+' 番'}</div>
        <div className="win-pts">{result.points} 點 / 人</div>
        <div className={`win-dealer-badge ${isDealerWin?'lim':'pass'}`}>
          {isDealerWin?'冧莊（莊家連莊）':'過莊（換莊）'}
        </div>
        <br/>
        <button className="btn btn-gold" onClick={onNext}>下一局</button>
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
        <OpponentPanel player={players[topPi]} hand={hands[topPi]} melds={melds[topPi]} discards={discards[topPi]} flowers={flowers[topPi]} seatWind={seatWinds[topPi]} isDealer={topPi===dealer} isTurn={topPi===currentPlayer&&!result} debug={debug} highlightKey={hoverKey}/>
        <OpponentPanel player={players[leftPi]} hand={hands[leftPi]} melds={melds[leftPi]} discards={discards[leftPi]} flowers={flowers[leftPi]} seatWind={seatWinds[leftPi]} isDealer={leftPi===dealer} isTurn={leftPi===currentPlayer&&!result} debug={debug} highlightKey={hoverKey}/>
        <OpponentPanel player={players[rightPi]} hand={hands[rightPi]} melds={melds[rightPi]} discards={discards[rightPi]} flowers={flowers[rightPi]} seatWind={seatWinds[rightPi]} isDealer={rightPi===dealer} isTurn={rightPi===currentPlayer&&!result} debug={debug} highlightKey={hoverKey}/>

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
              {hint.shanten===0&&<span style={{fontSize:'.72rem',color:'var(--dim)'}}>★ = 最佳打出 · ● = 可聽牌</span>}
              {hint.shanten>0&&hint.discardAnalysis.filter(d=>d.isBestDiscard).length>0&&(
                <span style={{fontSize:'.72rem',color:'var(--dim)'}}>
                  ★ 建議打：{hint.discardAnalysis.filter(d=>d.isBestDiscard).map(d=>TILE_DISPLAY[d.tile.key]).join('、')}
                </span>
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

          <TileTracker hand={humanHand} discards={discards} melds={melds} highlightKey={hoverKey}/>
        </div>
      </div>

      {result&&phase==='finished'&&<WinOverlay result={result} players={players} dealer={dealer} onNext={handleNextHand}/>}
    </div>
  );
}
