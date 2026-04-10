import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { initGame, drawTile, playerDiscard, aiTurn, playerClaimDiscard,
         runSimulation, PLAYER_NAMES, SEAT_WINDS } from './game/gameEngine.js'
import { tileKey, sortHand, getTenpaiTiles, calcShanten, analyzeHand,
         buildTileTracker, SUITS, WIND_ZH, DRAGON_ZH } from './game/tiles.js'
import { AI_STRATEGIES, STRATEGY_KEYS, detectWinType } from './ai/strategies.js'

// ─── Tile emoji maps ──────────────────────────────────────────────────────────
const SUIT_EMOJI = {
  bamboo:     ['🀐','🀑','🀒','🀓','🀔','🀕','🀖','🀗','🀘'],
  characters: ['🀇','🀈','🀉','🀊','🀋','🀌','🀍','🀎','🀏'],
  circles:    ['🀙','🀚','🀛','🀜','🀝','🀞','🀟','🀠','🀡'],
  winds:      ['🀀','🀁','🀂','🀃'],
  dragons:    ['🀄','🀅','🀆'],
}

function tileContent(tile) {
  if (tile.suit==='winds') return <span className="tile-sym wind">{WIND_ZH[tile.value]}</span>
  if (tile.suit==='dragons') {
    const cls=['dragon-red','dragon-green','dragon-white'][tile.value]
    return <span className={`tile-sym ${cls}`}>{DRAGON_ZH[tile.value]}</span>
  }
  const emoji = SUIT_EMOJI[tile.suit]?.[tile.value-1]||'?'
  return <span className={`tile-sym ${tile.suit}`}>{emoji}</span>
}

function getTileLabel(tile) {
  if (!tile) return ''
  if (tile.suit==='winds') return WIND_ZH[tile.value]
  if (tile.suit==='dragons') return DRAGON_ZH[tile.value]
  return `${tile.value}${{bamboo:'索',characters:'萬',circles:'筒'}[tile.suit]||''}`
}

// ─── MJ Tile component ────────────────────────────────────────────────────────
function MJTile({ tile, selected, onClick, isDrawn, isWait, inDiscard }) {
  const cls=['mj-tile',selected?'sel':'',isDrawn?'drawn':'',isWait?'wait':'',inDiscard?'in-discard':''].filter(Boolean).join(' ')
  return (
    <div className={cls} onClick={onClick} title={tileKey(tile)}>
      {!inDiscard
        ? <div className="tile-face">{tileContent(tile)}</div>
        : <div style={{fontSize:'13px',lineHeight:1}}>
            {SUIT_EMOJI[tile.suit]?.[SUITS.includes(tile.suit)?tile.value-1:tile.value]||(tile.suit==='winds'?WIND_ZH[tile.value]:DRAGON_ZH[tile.value])}
          </div>
      }
    </div>
  )
}

function TileBack({ small }) {
  return <div className="tile-back" style={small?{width:22,height:30}:{}}/>
}

// ─── Bar Chart ────────────────────────────────────────────────────────────────
function BarChart({ data, labels, colors, title, unit='' }) {
  const max=Math.max(...data.map(Math.abs),1)
  return (
    <div className="sim-chart-block">
      {title&&<div className="sim-chart-title">{title}</div>}
      <div className="sim-bar-chart">
        {data.map((v,i)=>(
          <div key={i} className="sim-bar-col">
            <div className="sim-bar-val">{v>0?'+':''}{v}{unit}</div>
            <div className="sim-bar-wrap">
              <div className="sim-bar" style={{height:`${Math.abs(v)/max*100}%`,background:colors?colors[i]:'#0984e3',opacity:v<0?0.5:1}}/>
            </div>
            <div className="sim-bar-lbl" style={{color:colors?colors[i]:'#0984e3'}}>{labels[i]}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Sparkline({ history, colors, labels, width=400, height=80 }) {
  if (!history||history.length<2) return null
  const n=history[0].length
  const allVals=history.flat()
  const mn=Math.min(...allVals),mx=Math.max(...allVals,1)
  const range=mx-mn||1
  const px=i=>(i/(history.length-1))*width
  const py=v=>height-((v-mn)/range)*(height-12)-6
  return (
    <div className="sim-chart-block">
      <div className="sim-chart-title">分數變化</div>
      <svg width={width} height={height} style={{display:'block',overflow:'visible'}}>
        {Array.from({length:n},(_,pi)=>(
          <polyline key={pi}
            points={history.map((snap,ti)=>`${px(ti)},${py(snap[pi]??0)}`).join(' ')}
            fill="none" stroke={colors?colors[pi]:'#0984e3'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.9"/>
        ))}
        {labels.map((l,i)=>(
          <g key={i}>
            <rect x={4+i*90} y={height-13} width={10} height={3} fill={colors?colors[i]:'#0984e3'} rx="2"/>
            <text x={18+i*90} y={height-6} fontSize="9" fill={colors?colors[i]:'#0984e3'}>{l}</text>
          </g>
        ))}
      </svg>
    </div>
  )
}

// ─── Win type donut (SVG) ─────────────────────────────────────────────────────
function WinTypeChart({ winTypes, players }) {
  if (!winTypes||winTypes.length===0) return <div className="sim-chart-block"><div className="sim-chart-title">牌型分佈</div><div style={{fontSize:'.7rem',color:'var(--ink3)',padding:8}}>流局，無牌型</div></div>
  const typeCounts={}
  for(const w of winTypes){ typeCounts[w.type]=(typeCounts[w.type]||0)+1 }
  const entries=Object.entries(typeCounts).sort((a,b)=>b[1]-a[1])
  const total=winTypes.length
  const typeColors=['#c8973a','#2a7a3b','#b5200d','#1a4fa0','#8e1f8e','#4a7a4a']
  return (
    <div className="sim-chart-block">
      <div className="sim-chart-title">牌型分佈</div>
      <div className="win-type-list">
        {entries.map(([type,count],i)=>(
          <div key={i} className="win-type-row">
            <div className="wt-bar-wrap">
              <div className="wt-bar" style={{width:`${count/total*100}%`,background:typeColors[i%typeColors.length]}}/>
            </div>
            <span className="wt-label">{type}</span>
            <span className="wt-count">{count}次 ({Math.round(count/total*100)}%)</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Strategy Ranking Card (shown on setup) ───────────────────────────────────
function StrategyRankingCard({ rankings }) {
  if (!rankings||rankings.length===0) return null
  return (
    <div className="strat-ranking-card">
      <div className="strat-ranking-title">🏆 策略排名（模擬結果）</div>
      <div className="strat-ranking-list">
        {rankings.map((r,i)=>{
          const s=AI_STRATEGIES[r.key]
          if(!s) return null
          const medal=['🥇','🥈','🥉','4.','5.','6.','7.','8.','9.','10.','11.','12.'][i]||''
          return (
            <div key={r.key} className="strat-rank-row" style={{borderLeftColor:s.color}}>
              <span className="rank-medal">{medal}</span>
              <span className="rank-emoji">{s.emoji}</span>
              <div className="rank-info">
                <div className="rank-name" style={{color:s.color}}>{s.fullName}</div>
                <div className="rank-theory">{s.theory}</div>
              </div>
              <div className="rank-stats">
                <div className="rank-wins">{r.wins}勝</div>
                <div className="rank-score" style={{color:r.avgScore>=0?'var(--green)':'var(--red)'}}>
                  {r.avgScore>=0?'+':''}{r.avgScore}分
                </div>
              </div>
            </div>
          )
        })}
      </div>
      <div className="strat-ranking-note">基於 {rankings[0]?.simCount||0} 局模擬</div>
    </div>
  )
}

// ─── Simulation Dashboard ─────────────────────────────────────────────────────
function SimDashboard({ results, strategies, onBack, onRunMore }) {
  if (!results||results.length===0) return null
  const runs=results.length
  const strats=strategies||[]
  const pnames=strats.map((sk,i)=>`${AI_STRATEGIES[sk]?.emoji||'?'}${AI_STRATEGIES[sk]?.name||sk}`)
  const colors=strats.map(sk=>AI_STRATEGIES[sk]?.color||'#888')

  // Aggregate
  const wins=strats.map((_,i)=>results.filter(r=>r.winner===i).length)
  const draws=results.filter(r=>r.winner===-1).length
  const avgScores=strats.map((_,i)=>Math.round(results.reduce((s,r)=>s+(r.scores[i]||0),0)/runs))
  const avgDrawn=strats.map((_,i)=>Math.round(results.reduce((s,r)=>s+(r.stats?.tilesDrawn[i]||0),0)/runs))
  const avgDiscard=strats.map((_,i)=>Math.round(results.reduce((s,r)=>s+(r.stats?.discardCount[i]||0),0)/runs))
  const avgTurns=Math.round(results.reduce((s,r)=>s+(r.stats?.turns||0),0)/runs)

  // Win types aggregated
  const allWinTypes=results.flatMap(r=>r.stats?.winTypes||[])

  // Last game sparkline
  const lastResult=results[results.length-1]

  return (
    <div className="sim-dashboard">
      <div className="sim-dash-header">
        <div className="sim-dash-title">🎮 模擬結果 ×{runs}</div>
        <div className="sim-dash-sub">平均 {avgTurns} 回合 · {draws} 次流局</div>
      </div>

      <div className="sim-charts-grid">
        <BarChart title="勝場數" data={wins} labels={pnames} colors={colors}/>
        <BarChart title="平均分數" data={avgScores} labels={pnames} colors={colors} unit="分"/>
        <BarChart title="平均摸牌" data={avgDrawn} labels={pnames} colors={colors}/>
        <BarChart title="平均棄牌" data={avgDiscard} labels={pnames} colors={colors}/>
      </div>

      <WinTypeChart winTypes={allWinTypes} players={pnames}/>

      {lastResult?.stats?.scoreHistory?.length>1 && (
        <Sparkline history={lastResult.stats.scoreHistory} colors={colors} labels={pnames} width={420} height={90}/>
      )}

      <div className="sim-table-wrap">
        <table className="sim-table">
          <thead><tr><th>策略</th><th>理論</th><th>勝場</th><th>勝率</th><th>平均分</th><th>平均摸牌</th></tr></thead>
          <tbody>
            {strats.map((sk,i)=>{
              const s=AI_STRATEGIES[sk]
              return (
                <tr key={i} className={wins[i]===Math.max(...wins)?'winner-row':''}>
                  <td><span style={{color:s?.color}}>{s?.emoji} {s?.name}</span></td>
                  <td style={{fontSize:'.62rem',color:'var(--ink3)'}}>{s?.theory}</td>
                  <td style={{fontWeight:700}}>{wins[i]}</td>
                  <td>{Math.round(wins[i]/runs*100)}%</td>
                  <td style={{color:avgScores[i]>=0?'var(--green)':'var(--red)',fontWeight:600}}>{avgScores[i]>=0?'+':''}{avgScores[i]}</td>
                  <td>{avgDrawn[i]}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="sim-actions">
        <button className="btn btn-gold" onClick={onRunMore}>再模擬 ×{runs}</button>
        <button className="btn btn-ghost" onClick={onBack}>← 返回</button>
      </div>
    </div>
  )
}

// ─── Discard Pool ─────────────────────────────────────────────────────────────
function DiscardPool({ tiles, label, lastDiscard, canClaim, onClaim }) {
  return (
    <div className="dpool">
      <div className="dpool-lbl">{label}</div>
      <div className="dpool-tiles">
        {tiles.map((t,i)=>{
          const isLast=lastDiscard&&t.id===lastDiscard.id&&i===tiles.length-1
          const claimable=isLast&&canClaim
          return <MJTile key={t.id} tile={t} inDiscard onClick={claimable?onClaim:undefined} selected={claimable} isWait={claimable}/>
        })}
      </div>
    </div>
  )
}

// ─── Tile Tracker 記牌器 ──────────────────────────────────────────────────────
function TileTracker({ state }) {
  const tracker=useMemo(()=>{
    if(!state) return {}
    return buildTileTracker(state.discards,state.wall)
  },[state?.discards,state?.wall?.length])

  const rows=[
    {label:'萬',suit:'characters',vals:[1,2,3,4,5,6,7,8,9]},
    {label:'索',suit:'bamboo',vals:[1,2,3,4,5,6,7,8,9]},
    {label:'筒',suit:'circles',vals:[1,2,3,4,5,6,7,8,9]},
    {label:'字',suit:'mixed',keys:['winds-0','winds-1','winds-2','winds-3','dragons-0','dragons-1','dragons-2']},
  ]

  return (
    <div className="tracker-panel">
      <div className="tracker-title">🀫 記牌器</div>
      {rows.map(row=>(
        <div key={row.label} className="tracker-suit">
          <div className="tracker-suit-label">{row.label}</div>
          <div className="tracker-row">
            {row.suit!=='mixed'
              ?row.vals.map(v=>{
                const k=`${row.suit}-${v}`
                const avail=4-(tracker[k]?.gone||0)
                return <div key={k} className={`tracker-tile avail-${avail}`} title={`${avail}/4 剩`}>{v}<span className="tracker-count">{avail}</span></div>
              })
              :row.keys.map(k=>{
                const avail=4-(tracker[k]?.gone||0)
                const[suit,val]=k.split('-')
                const lbl=suit==='winds'?WIND_ZH[+val]:DRAGON_ZH[+val]
                return <div key={k} className={`tracker-tile avail-${avail}`} title={`${avail}/4 剩`}>{lbl}<span className="tracker-count">{avail}</span></div>
              })
            }
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Hint Panel ───────────────────────────────────────────────────────────────
function HintPanel({ hand13, wallLength, discards }) {
  const [show,setShow]=useState(true)
  const analysis=useMemo(()=>{
    if(!hand13||hand13.length<13) return null
    return analyzeHand(hand13,wallLength,discards)
  },[hand13?.map(t=>t.id).join(','),wallLength])

  if(!analysis) return null
  const {shanten,hints,tenpai}=analysis
  const cls=shanten===0?'shanten-0':shanten===1?'shanten-1':shanten===2?'shanten-2':'shanten-n'
  const txt=shanten===0?'聽牌！':`差 ${shanten} 步`
  const icons={tenpai:'🀄','discard-hint':'💡',pattern:'🎯',prob:'📊'}

  return (
    <div className="hint-panel">
      <div className="hint-title">
        💡 分析提示
        <span className={`shanten-badge ${cls}`}>{txt}</span>
        <button className="hint-toggle" onClick={()=>setShow(s=>!s)}>{show?'收起':'展開'}</button>
      </div>
      {show&&(
        <>
          {hints.length===0&&<div style={{fontSize:'.65rem',color:'rgba(250,247,240,.4)',fontStyle:'italic'}}>繼續摸牌…</div>}
          {hints.map((h,i)=>(
            <div key={i} className="hint-item">
              <span className="hint-icon">{icons[h.type]||'•'}</span>
              <span className="hint-text">{h.msg}</span>
            </div>
          ))}
          {tenpai.length>0&&(
            <div style={{marginTop:'6px',fontSize:'.6rem',color:'rgba(200,151,58,.6)'}}>
              等牌：{tenpai.map(t=>getTileLabel(t)).join(' ')}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Win Overlay ──────────────────────────────────────────────────────────────
function WinOverlay({ state, aiStrategies, onNew }) {
  const {winner,scores}=state
  const isDraw=winner===-1
  return (
    <div className="overlay">
      <div className="win-card">
        <div className="win-em">{isDraw?'🤝':winner===0?'🏆':'🎴'}</div>
        <div className="win-t">{isDraw?'流局！':winner===0?'你贏啦！':`${PLAYER_NAMES[winner]} 贏！`}</div>
        <div className="win-s">
          {isDraw?'牌墻摸完，今局流局。':
           winner===0?`打得好！`:`${AI_STRATEGIES[aiStrategies[winner-1]]?.fullName||''} 勝出。`}
        </div>
        {state.stats?.winTypes?.length>0&&(
          <div style={{fontSize:'.7rem',color:'var(--gold2)',marginBottom:12}}>
            牌型：{state.stats.winTypes[state.stats.winTypes.length-1]?.type}
          </div>
        )}
        <div className="win-scores">
          {scores.map((s,i)=>(
            <div key={i} className={`ws${i===winner?' winner':''}`}>
              <div className="ws-name">{PLAYER_NAMES[i]}</div>
              <div className="ws-val">{s>0?'+':''}{s}</div>
            </div>
          ))}
        </div>
        <button className="btn btn-gold" onClick={onNew} style={{width:'100%',padding:'10px'}}>新局</button>
      </div>
    </div>
  )
}

// ─── Setup Screen ─────────────────────────────────────────────────────────────
function SetupScreen({ onStart, onSimulate, strategyRankings }) {
  const [selectedStrats,setSelectedStrats]=useState(['nash','dragon','tortoise','tripletHunter'])
  const [simMode,setSimMode]=useState(false)
  const [simRuns,setSimRuns]=useState(10)

  const sk=STRATEGY_KEYS
  const setStrat=(i,v)=>setSelectedStrats(prev=>prev.map((s,j)=>j===i?v:s))

  return (
    <div className="setup-screen">
      <div className="setup-card">
        <div className="setup-title">🀄 麻雀</div>
        <div className="setup-sub">廣東麻雀 · 12種AI策略 · 智能模擬</div>

        {strategyRankings&&<StrategyRankingCard rankings={strategyRankings}/>}

        <div className="setup-sec">
          <div className="setup-lbl">AI 對手策略</div>
          {['東','南','西'].map((seat,i)=>(
            <div key={i} className="strat-select-row">
              <span className="strat-seat">{seat}家 AI</span>
              <select className="strat-dropdown" value={selectedStrats[i+1]} onChange={e=>setStrat(i+1,e.target.value)}>
                {sk.map(k=><option key={k} value={k}>{AI_STRATEGIES[k].emoji} {AI_STRATEGIES[k].fullName}</option>)}
              </select>
            </div>
          ))}
        </div>

        <div className="setup-sec">
          <div className="setup-lbl">所有策略介紹</div>
          <div className="strat-cards-grid">
            {sk.map(k=>{
              const s=AI_STRATEGIES[k]
              return (
                <div key={k} className="strat-mini-card" style={{borderLeftColor:s.color}}>
                  <div className="smc-header">{s.emoji} <strong style={{color:s.color}}>{s.name}</strong> <span className="smc-theory">{s.theory}</span></div>
                  <div className="smc-desc">{s.desc}</div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="setup-sec sim-section">
          <div className="setup-lbl">模擬模式（全AI）</div>
          <div className="sim-strat-row">
            {[0,1,2,3].map(i=>(
              <select key={i} className="strat-dropdown" value={selectedStrats[i]} onChange={e=>setStrat(i,e.target.value)}>
                {sk.map(k=><option key={k} value={k}>{AI_STRATEGIES[k].emoji} {AI_STRATEGIES[k].name}</option>)}
              </select>
            ))}
          </div>
          <div className="sim-runs-row">
            <span style={{fontSize:'.72rem',color:'var(--ink3)'}}>模擬局數：</span>
            {[10,50,100,500].map(n=>(
              <button key={n} className={`sim-run-btn${simRuns===n?' act':''}`} onClick={()=>setSimRuns(n)}>{n}</button>
            ))}
          </div>
          <button className="btn btn-ghost" style={{width:'100%',marginTop:8}} onClick={()=>onSimulate(selectedStrats,simRuns)}>
            ▶ 開始模擬 ×{simRuns}
          </button>
        </div>

        <div className="setup-sec" style={{fontSize:'.67rem',color:'var(--ink3)',lineHeight:1.7,marginBottom:8}}>
          你（自摸/食炮 +8/+16）· 牌墻摸完流局 · 記牌器追蹤剩餘 · 提示系統分析最優打法
        </div>

        <button className="btn btn-gold" style={{width:'100%',padding:'13px'}} onClick={()=>onStart(selectedStrats.slice(1))}>
          🀄 開局（對戰 AI）
        </button>
      </div>
    </div>
  )
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [screen,setScreen]   =useState('setup')
  const [state,setState]     =useState(null)
  const [aiStrategies,setAiStrategies]=useState(['nash','dragon','tortoise'])
  const [simResults,setSimResults]=useState(null)
  const [simStrats,setSimStrats]=useState(null)
  const [simRuns,setSimRuns] =useState(10)
  const [rankings,setRankings]=useState(null)
  const [selectedTile,setSelectedTile]=useState(null)
  const logRef=useRef(null)

  useEffect(()=>{ if(logRef.current) logRef.current.scrollTop=logRef.current.scrollHeight },[state?.log])

  const startGame=useCallback((strats)=>{
    setAiStrategies(strats)
    setState(initGame(strats))
    setScreen('game')
    setSelectedTile(null)
  },[])

  const handleSimulate=useCallback((strats,runs)=>{
    const results=Array.from({length:runs},()=>runSimulation(strats))
    setSimResults(results)
    setSimStrats(strats)
    setSimRuns(runs)

    // Compute rankings
    const rankMap={}
    for(const sk of strats) {
      const idx=strats.indexOf(sk)
      if(!rankMap[sk]) rankMap[sk]={key:sk,wins:0,totalScore:0,simCount:runs}
      rankMap[sk].wins+=results.filter(r=>r.winner===idx).length
      rankMap[sk].totalScore+=results.reduce((s,r)=>s+(r.scores[idx]||0),0)
    }
    const rankArr=Object.values(rankMap).map(r=>({...r,avgScore:Math.round(r.totalScore/runs)}))
    rankArr.sort((a,b)=>b.wins-a.wins||b.avgScore-a.avgScore)
    setRankings(rankArr)
    setScreen('sim')
  },[])

  // AI loop
  useEffect(()=>{
    if(!state||state.phase==='finished') return
    if(state.currentPlayer!==0) {
      const t=setTimeout(()=>{
        setState(prev=>prev&&prev.currentPlayer!==0?aiTurn(prev):prev)
      },500+Math.random()*300)
      return ()=>clearTimeout(t)
    }
    if(state.currentPlayer===0&&state.phase==='draw'&&!state.drawnTile) {
      const t=setTimeout(()=>{
        setState(prev=>prev&&prev.phase==='draw'&&prev.currentPlayer===0?drawTile(prev):prev)
      },250)
      return ()=>clearTimeout(t)
    }
  },[state])

  const handleTileClick=tile=>{
    if(!state||state.currentPlayer!==0||state.phase!=='discard') return
    if(selectedTile?.id===tile.id){ setState(prev=>playerDiscard(prev,tile.id)); setSelectedTile(null) }
    else setSelectedTile(tile)
  }

  const handleDiscard=()=>{ if(!selectedTile||!state) return; setState(prev=>playerDiscard(prev,selectedTile.id)); setSelectedTile(null) }
  const handleClaim=()=>{ if(!state) return; setState(prev=>playerClaimDiscard(prev)) }

  const canClaim=state&&state.lastDiscardPlayer!==0&&state.currentPlayer!==0&&state.phase==='draw'&&state.lastDiscard

  if(screen==='sim') return (
    <SimDashboard results={simResults} strategies={simStrats}
      onBack={()=>setScreen('setup')}
      onRunMore={()=>handleSimulate(simStrats,simRuns)}/>
  )

  if(screen==='setup') return (
    <SetupScreen onStart={startGame} onSimulate={handleSimulate} strategyRankings={rankings}/>
  )

  const playerHand=state?.hands[0]||[]
  const isPlayerTurn=state?.currentPlayer===0
  const canDiscard=isPlayerTurn&&state.phase==='discard'
  const drawnTile=state?.drawnTile
  const hand13=drawnTile?playerHand.filter(t=>t.id!==drawnTile.id):playerHand

  return (
    <div className="app">
      {state?.phase==='finished'&&<WinOverlay state={state} aiStrategies={aiStrategies} onNew={()=>startGame(aiStrategies)}/>}

      <div className="hdr">
        <div className="hdr-title">🀄 麻雀</div>
        <div className="hdr-right">
          <button className="btn btn-ghost" style={{fontSize:'.7rem'}} onClick={()=>setScreen('setup')}>⚙ 設定</button>
          <button className="btn btn-ghost" style={{fontSize:'.7rem'}} onClick={()=>startGame(aiStrategies)}>新局</button>
        </div>
      </div>

      <div className="scores">
        {state?.scores.map((s,i)=>(
          <div key={i} className={`sc${i===state.currentPlayer?' cur':''}`}>
            <div className="sc-name">{PLAYER_NAMES[i]} {SEAT_WINDS[i]}</div>
            <div className="sc-sub">
              {i===0?'':`${AI_STRATEGIES[aiStrategies[i-1]]?.emoji} ${AI_STRATEGIES[aiStrategies[i-1]]?.name}`}
            </div>
            <div className="sc-pts">{s>0?'+':''}{s}</div>
          </div>
        ))}
      </div>

      <div className="table">
        {/* Top AI South */}
        <div className="aip top">
          <div>
            <div className="ai-label">{PLAYER_NAMES[2]} 南</div>
            <div className="ai-sub">{AI_STRATEGIES[aiStrategies[1]]?.emoji} {AI_STRATEGIES[aiStrategies[1]]?.name}</div>
            <div className="ai-count">剩 {state?.hands[2]?.length} 張</div>
          </div>
          <div className="ai-rack">{state?.hands[2]?.map(t=><TileBack key={t.id} small/>)}</div>
          <DiscardPool tiles={state?.discards[2]||[]} label="南家棄牌" lastDiscard={null} canClaim={false}/>
        </div>

        {/* Left AI East */}
        <div className="aip left">
          <div className="ai-label">{PLAYER_NAMES[1]} 東</div>
          <div className="ai-sub">{AI_STRATEGIES[aiStrategies[0]]?.emoji} {AI_STRATEGIES[aiStrategies[0]]?.name}</div>
          <div className="ai-count">剩 {state?.hands[1]?.length} 張</div>
          <div className="ai-rack" style={{flexDirection:'column',marginTop:4}}>
            {state?.hands[1]?.map(t=><TileBack key={t.id} small/>)}
          </div>
          <DiscardPool tiles={state?.discards[1]||[]} label="東家棄牌" lastDiscard={null} canClaim={false}/>
        </div>

        <div className="center">
          <div className="center-top">
            <div className="wall-badge">
              <div className="wall-num">{state?.wall?.length??0}</div>
              <div className="wall-lbl">剩餘張數</div>
            </div>
            <div className="turn-lbl">{isPlayerTurn?'⭐ 輪到你':`${PLAYER_NAMES[state?.currentPlayer]} 行牌`}</div>
          </div>
          <div className="discards-grid">
            <DiscardPool tiles={state?.discards[0]||[]} label="你嘅棄牌" lastDiscard={null} canClaim={false}/>
            <DiscardPool tiles={state?.discards[3]||[]} label="西家棄牌" lastDiscard={state?.lastDiscard} canClaim={canClaim} onClaim={handleClaim}/>
          </div>
          <div className="log" ref={logRef}>
            {state?.log?.slice(-20).map((e,i)=><div key={i} className="log-e">{e}</div>)}
          </div>
        </div>

        {/* Right AI West */}
        <div className="aip right">
          <div className="ai-label">{PLAYER_NAMES[3]} 西</div>
          <div className="ai-sub">{AI_STRATEGIES[aiStrategies[2]]?.emoji} {AI_STRATEGIES[aiStrategies[2]]?.name}</div>
          <div className="ai-count">剩 {state?.hands[3]?.length} 張</div>
          <div className="ai-rack" style={{flexDirection:'column',marginTop:4}}>
            {state?.hands[3]?.map(t=><TileBack key={t.id} small/>)}
          </div>
          <DiscardPool tiles={state?.discards[3]||[]} label="西家棄牌" lastDiscard={state?.lastDiscard} canClaim={canClaim} onClaim={handleClaim}/>
        </div>

        {/* Player hand */}
        <div className="hand-area">
          <div className="hand-top">
            <div className="hand-title">你嘅手牌</div>
            <div className="hand-meta">共 {playerHand.length} 張</div>
            {state?.tenpaiTiles?.length>0&&<span className="tenpai-badge">✨ 聽牌！等 {state.tenpaiTiles.length} 種</span>}
            {canDiscard&&!selectedTile&&<span style={{fontSize:'.65rem',color:'rgba(250,247,240,.4)'}}>撳牌選擇，再撳打出</span>}
          </div>

          <div className="hand-rack">
            {playerHand.map(tile=>{
              const isDrawn=drawnTile&&tile.id===drawnTile.id
              const isWait=state?.tenpaiTiles?.some(t=>tileKey(t)===tileKey(tile))
              return <MJTile key={tile.id} tile={tile} selected={selectedTile?.id===tile.id} isDrawn={isDrawn} isWait={isWait} onClick={()=>handleTileClick(tile)}/>
            })}
          </div>

          <div className="actions">
            <button className="btn btn-red" disabled={!selectedTile||!canDiscard} onClick={handleDiscard}>打出所選</button>
            {canClaim&&<button className="btn btn-green" onClick={handleClaim}>🀄 食炮！</button>}
            <button className="btn btn-ghost" onClick={()=>startGame(aiStrategies)} style={{marginLeft:'auto'}}>新局</button>
          </div>

          {isPlayerTurn&&<HintPanel hand13={hand13} wallLength={state?.wall?.length||0} discards={state?.discards||[]}/>}
          <TileTracker state={state}/>
        </div>
      </div>
    </div>
  )
}
