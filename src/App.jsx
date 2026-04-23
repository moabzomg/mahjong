import { useState, useEffect } from 'react';
import './index.css';
import {
  SUITS, HONOURS, WINDS, FLOWERS, TILE_EMOJI, TILE_DISPLAY,
  sortHand, analyzeHand, calcFan, fanToPoints, isFlower
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
const SUIT_FULL  = { man:'萬子', pin:'筒子', sou:'索子' };

// ─── Tile Component ───────────────────────────────────────────────────────────
function tileContent(key) {
  // Suits
  for (const s of SUITS) {
    if (key.startsWith(s)) {
      const num = parseInt(key.slice(s.length));
      return { num: `${num}`, suit: SUIT_LABEL[s], cls: s };
    }
  }
  // Flowers
  if (FLOWERS.includes(key)) {
    const idx = FLOWERS.indexOf(key);
    const isRed = idx >= 4;
    return { num: FLOWER_NAMES[key], suit: '', cls: isRed ? 'flower-red' : 'flower-green' };
  }
  // Honours
  const label = TILE_DISPLAY[key] || key;
  return { num: label, suit: '', cls: 'hon' };
}

function Tile({ tile, selected, drawn, small, inDiscard, onClick }) {
  const { num, suit, cls } = tileContent(tile.key);
  const cn = ['mj-tile', small&&'small', selected&&'sel', drawn&&'drawn', inDiscard&&'in-discard'].filter(Boolean).join(' ');
  return (
    <div className={cn} onClick={onClick} title={TILE_DISPLAY[tile.key] || tile.key}>
      <div className="tile-face">
        <span className={`tile-num ${cls}`}>{num}</span>
        {suit && <span className="tile-suit">{suit}</span>}
      </div>
    </div>
  );
}

function TileBack({ small }) {
  return <div className={`mj-tile back${small?' small':''}`}><div className="tile-face"/></div>;
}

// ─── Tile Tracker ─────────────────────────────────────────────────────────────
function TileTracker({ hand, discards, melds }) {
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
            return (
              <div key={key} className={`tracker-tile av-${r}`} title={`${TILE_DISPLAY[key]} 餘${r}張`}>
                <span className="tsym">{TILE_EMOJI[key]||TILE_DISPLAY[key]}</span>
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
function OpponentPanel({ player, hand, melds, discards, flowers, seatWind, isDealer, isTurn, debug }) {
  return (
    <div className="aip">
      <div className="opp-name">
        <span className="badge badge-wind">{WIND_LABELS[seatWind]}</span>
        {isDealer && <span className="badge badge-dealer">莊</span>}
        {isTurn && <span className="badge badge-turn">●</span>}
        <span>{player.name}</span>
        <span className="opp-remain">{hand.length}張</span>
        {flowers?.length>0 && (
          <div className="flower-row" style={{marginLeft:0}}>
            {flowers.map(f=>{
              const isRed=FLOWERS.indexOf(f.key)>=4;
              return <span key={f.id} className={`flower-badge ${isRed?'red':'green'}`} style={{fontSize:'0.6rem'}}>{FLOWER_NAMES[f.key]}</span>;
            })}
          </div>
        )}
      </div>
      {melds.length>0 && (
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
          ? hand.map(t=><Tile key={t.id} tile={t} small/>)
          : hand.map((_,i)=><TileBack key={i} small/>)
        }
      </div>
      <div className="opp-discards">
        {discards.map(t=><Tile key={t.id} tile={t} small inDiscard/>)}
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
        <span style={{fontSize:'0.75rem',color:'var(--dim)'}}>打出：</span>
        <Tile tile={tile}/>
      </div>
      <div className="claim-btns">
        {winClaim && <button className="claim-btn win" onClick={onWin}>胡！{winClaim.fan}番</button>}
        {canPong && <button className="claim-btn pong" onClick={onPong}>碰</button>}
        {chiOpts.map((c,i)=>(
          <button key={i} className="claim-btn chi" onClick={()=>onChi(c.tiles)}>
            上 {c.tiles.sort((a,b)=>{
              const n=t=>parseInt(t.key.replace(/[^0-9]/g,''))||0;
              return n(a)-n(b);
            }).map(t=>TILE_DISPLAY[t.key]).join('')}
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
        <div className="win-fan">{result.fan} 番</div>
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
  { name:'你',   isHuman:true,  strategy:'nash' },
  { name:'阿明', isHuman:false, strategy:'aggressive' },
  { name:'阿珍', isHuman:false, strategy:'defensive' },
  { name:'阿強', isHuman:false, strategy:'nash' },
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
        <button className="btn btn-gold" style={{fontSize:'0.95rem',padding:'9px 26px'}} onClick={()=>onStart(players,minFan)}>開始遊戲</button>
        <button className="btn btn-green" style={{fontSize:'0.95rem',padding:'9px 26px'}} onClick={()=>onSimulate(players.map(p=>({...p,isHuman:false})),simGames,minFan)}>開始模擬</button>
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
        <span className="sim-progress">{results.length} / {totalGames} 局{running?' 進行中…':' 完成'}</span>
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
                <td style={{color:'var(--dim)',fontSize:'0.68rem'}}>
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
      setSelectedTile(null);
    } else { setSelectedTile(tile); }
  }
  function handleDiscard(){
    if(!selectedTile) return;
    setHand(prev=>doDiscard(prev,humanIdx,selectedTile.id));
    setSelectedTile(null);
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
    const ns=advanceSession(hand);
    if(ns.round>=4||ns.handsPlayed>=16){ setHand({...hand,session:ns}); setScreen('summary'); return; }
    setHand(startHand(ns));
    setSelectedTile(null);
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

  // Positions relative to human: bottom=human, right=(h+1)%4, top=(h+2)%4, left=(h+3)%4
  const rightPi=(humanIdx+1)%4, topPi=(humanIdx+2)%4, leftPi=(humanIdx+3)%4;

  const humanHand=hands[humanIdx];
  const humanDrawnTile=currentPlayer===humanIdx?drawnTile:null;

  // Drawn tile always at the right: separate hand tiles (all except drawn) and drawn tile
  const handTiles = humanDrawnTile
    ? humanHand.filter(t=>t.id!==humanDrawnTile.id)
    : humanHand;
  const drawnTileObj = humanDrawnTile || null;

  const hint=(isHumanTurn&&phase==='discard')?analyzeHand(humanHand,melds[humanIdx]):null;

  return (
    <div className="app">
      {/* Header */}
      <div className="hdr">
        <span className="hdr-title">🀄 香港麻雀</span>
        <span className="hdr-info">
          {roundLabel}風圈 第{session.handsPlayed+1}局
          {' — 莊：'}<span>{players[dealer].name}</span>
          {' 剩牌：'}<span>{wall?.length||0}</span>
        </span>
        <div style={{marginLeft:'auto',display:'flex',gap:8,alignItems:'center'}}>
          <button
            className={`btn ${debug?'btn-purple':'btn-gray'}`}
            style={{fontSize:'0.72rem',padding:'3px 9px'}}
            onClick={()=>setDebug(d=>!d)}
          >{debug?'🔍 Debug 開':'🔍 Debug 關'}</button>
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
        {/* Top opponent */}
        <OpponentPanel player={players[topPi]} hand={hands[topPi]} melds={melds[topPi]} discards={discards[topPi]} flowers={flowers[topPi]} seatWind={seatWinds[topPi]} isDealer={topPi===dealer} isTurn={topPi===currentPlayer&&!result} debug={debug}/>
        {/* Left opponent */}
        <OpponentPanel player={players[leftPi]} hand={hands[leftPi]} melds={melds[leftPi]} discards={discards[leftPi]} flowers={flowers[leftPi]} seatWind={seatWinds[leftPi]} isDealer={leftPi===dealer} isTurn={leftPi===currentPlayer&&!result} debug={debug}/>
        {/* Right opponent */}
        <OpponentPanel player={players[rightPi]} hand={hands[rightPi]} melds={melds[rightPi]} discards={discards[rightPi]} flowers={flowers[rightPi]} seatWind={seatWinds[rightPi]} isDealer={rightPi===dealer} isTurn={rightPi===currentPlayer&&!result} debug={debug}/>

        {/* Center */}
        <div className="center">
          <div className="discards-grid">
            <div className="dpool">
              <div className="dpool-label">{players[topPi].name} 打出</div>
              <div className="dpool-tiles">{discards[topPi].map(t=><Tile key={t.id} tile={t} small inDiscard/>)}</div>
            </div>
            <div className="dpool">
              <div className="dpool-label">{players[rightPi].name} 打出</div>
              <div className="dpool-tiles">{discards[rightPi].map(t=><Tile key={t.id} tile={t} small inDiscard/>)}</div>
            </div>
            <div className="dpool">
              <div className="dpool-label">{players[leftPi].name} 打出</div>
              <div className="dpool-tiles">{discards[leftPi].map(t=><Tile key={t.id} tile={t} small inDiscard/>)}</div>
            </div>
            <div className="dpool">
              <div className="dpool-label">{players[humanIdx].name} 打出</div>
              <div className="dpool-tiles">{discards[humanIdx].map(t=><Tile key={t.id} tile={t} small inDiscard/>)}</div>
            </div>
          </div>

          <div className="wall-count">剩牌：<span>{wall?.length||0}</span> 張</div>

          <div className="game-log">
            {[...log].reverse().slice(0,15).map((e,i)=><div key={i} className="log-entry">{e}</div>)}
          </div>

          {phase==='claiming'&&claimPending&&(
            <ClaimPrompt
              claimPending={claimPending} players={players}
              onWin={()=>setHand(prev=>playerClaimWin(prev))}
              onPong={()=>setHand(prev=>playerPong(prev))}
              onChi={tiles=>setHand(prev=>playerChi(prev,tiles))}
              onPass={()=>setHand(prev=>playerPass(prev))}
            />
          )}
        </div>

        {/* Bottom — human */}
        <div className="bottom-area">
          <div className="hand-top">
            <span className="hand-label">{players[humanIdx].name}</span>
            <span className="badge badge-wind">{WIND_LABELS[seatWinds[humanIdx]]}</span>
            {humanIdx===dealer&&<span className="badge badge-dealer">莊</span>}
            <FlowerRow flowers={flowers[humanIdx]}/>
            {melds[humanIdx].length>0&&(
              <div className="melds-row">
                {melds[humanIdx].map((m,i)=>(
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

          {/* Hand rack: regular tiles + gap + drawn tile always at right */}
          <div className="hand-rack">
            {handTiles.map(t=>(
              <Tile key={t.id} tile={t}
                selected={selectedTile?.id===t.id}
                onClick={()=>handleTileClick(t)}/>
            ))}
            {drawnTileObj && <>
              <div className="drawn-gap"/>
              <Tile
                tile={drawnTileObj}
                drawn
                selected={selectedTile?.id===drawnTileObj.id}
                onClick={()=>handleTileClick(drawnTileObj)}/>
            </>}
          </div>

          {hint&&(
            <div className="hint-panel">
              <span className={`shanten-badge${hint.shanten===0?' tenpai':hint.shanten<0?' win':''}`}>{hint.msg}</span>
              {hint.bestDiscard&&<span className="hint-discard">建議打：<strong>{TILE_DISPLAY[hint.bestDiscard.key]}</strong></span>}
              {hint.hints.map((h,i)=><span key={i} className="hint-tag">{h}</span>)}
            </div>
          )}

          <TileTracker hand={humanHand} discards={discards} melds={melds}/>
        </div>
      </div>

      {result&&phase==='finished'&&<WinOverlay result={result} players={players} dealer={dealer} onNext={handleNextHand}/>}
    </div>
  );
}
