import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  initGameSession, startHand, drawTile, playerDiscard, aiTurn,
  playerClaimDiscard, advanceSession, runSimulation, fanToPoints,
  PLAYER_NAMES, SEAT_WINDS, ROUND_NAMES, PLAYER
} from './game/gameEngine.js'
import { tileKey, sortHand, getTenpaiTiles, calcShanten, analyzeHand,
  buildTileTracker, calcFan, SUITS, WIND_ZH, DRAGON_ZH, FLOWER_ZH, getTileLabel } from './game/tiles.js'
import { AI_STRATEGIES, STRATEGY_KEYS } from './ai/strategies.js'

// ─── Tile Unicode maps ────────────────────────────────────────────────────────
const EMOJI = {
  bamboo:     ['🀐','🀑','🀒','🀓','🀔','🀕','🀖','🀗','🀘'],
  characters: ['🀇','🀈','🀉','🀊','🀋','🀌','🀍','🀎','🀏'],
  circles:    ['🀙','🀚','🀛','🀜','🀝','🀞','🀟','🀠','🀡'],
  winds:      ['🀀','🀁','🀂','🀃'],
  dragons:    ['🀄','🀅','🀆'],
}

// Flower tile display: 梅蘭菊竹 (black 1-4) + 春夏秋冬 (red 1-4)
const FLOWER_DISPLAY = [
  { char:'梅', color:'#2d6a2d', num:'1' },  // black suit 1
  { char:'蘭', color:'#2d6a2d', num:'2' },  // black suit 2
  { char:'菊', color:'#2d6a2d', num:'3' },  // black suit 3
  { char:'竹', color:'#2d6a2d', num:'4' },  // black suit 4
  { char:'春', color:'#cc1100', num:'一' }, // red season 1
  { char:'夏', color:'#cc1100', num:'二' }, // red season 2
  { char:'秋', color:'#cc1100', num:'三' }, // red season 3
  { char:'冬', color:'#cc1100', num:'四' }, // red season 4
]

function tileEmoji(tile) {
  if (!tile) return '?'
  if (tile.isFlower) {
    const f = FLOWER_DISPLAY[tile.value]
    return f ? f.char : '🌸'
  }
  const arr = EMOJI[tile.suit]
  const idx = SUITS.includes(tile.suit) ? tile.value - 1 : tile.value
  return arr?.[idx] || '?'
}

function tileContent(tile) {
  if (tile.suit === 'winds') return <span className="tile-sym wind">{WIND_ZH[tile.value]}</span>
  if (tile.suit === 'dragons') {
    const cls = ['dragon-red','dragon-green','dragon-white'][tile.value]
    return <span className={`tile-sym ${cls}`}>{DRAGON_ZH[tile.value]}</span>
  }
  if (tile.isFlower) {
    const f = FLOWER_DISPLAY[tile.value] || { char:'🌸', color:'#888', num:'' }
    return (
      <div className="flower-face">
        <span className="flower-char" style={{color: f.color}}>{f.char}</span>
        <span className="flower-num" style={{color: f.color}}>{f.num}</span>
      </div>
    )
  }
  return <span className={`tile-sym ${tile.suit}`}>{tileEmoji(tile)}</span>
}

// ─── MJ Tile ──────────────────────────────────────────────────────────────────
function MJTile({ tile, selected, onClick, isDrawn, isWait, inDiscard, size='normal' }) {
  if (!tile) return null
  const cls = [
    'mj-tile',
    tile.isFlower ? 'flower-tile' : '',
    selected ? 'sel' : '',
    isDrawn ? 'drawn' : '',
    isWait ? 'wait' : '',
    inDiscard ? 'in-discard' : '',
    size === 'large' ? 'large' : '',
  ].filter(Boolean).join(' ')

  return (
    <div className={cls} onClick={onClick} title={getTileLabel(tile)}>
      {inDiscard && size !== 'large'
        ? <div className="discard-face">{tileEmoji(tile)}</div>
        : <div className="tile-face">{tileContent(tile)}</div>
      }
    </div>
  )
}

function TileBack({ small }) {
  return <div className="tile-back" style={small ? {width:22,height:30} : {}}/>
}

// ─── Flower display (proper 梅蘭菊竹春夏秋冬) ──────────────────────────────────
function FlowerDisplay({ flowers }) {
  if (!flowers || flowers.length === 0) return null
  return (
    <div className="flower-row">
      {flowers.map((f, i) => {
        const fd = FLOWER_DISPLAY[f.value] || { char:'🌸', color:'#888', num:'' }
        return (
          <div key={i} className="flower-badge" title={FLOWER_ZH[f.value]} style={{borderColor: fd.color}}>
            <span className="fb-char" style={{color: fd.color}}>{fd.char}</span>
            <span className="fb-num" style={{color: fd.color}}>{fd.num}</span>
          </div>
        )
      })}
    </div>
  )
}

// ─── Meld display ─────────────────────────────────────────────────────────────
function MeldDisplay({ melds }) {
  if (!melds || melds.length === 0) return null
  const labels = { pong:'碰', kong:'槓', chi:'上' }
  return (
    <div className="melds-row">
      {melds.map((m, i) => (
        <div key={i} className={`meld-group meld-${m.type}`}>
          <div className="meld-type-lbl">{labels[m.type]||''}</div>
          {m.tiles.map(t => <MJTile key={t.id} tile={t} inDiscard/>)}
        </div>
      ))}
    </div>
  )
}

// ─── Discard Pool (larger, clearer) ──────────────────────────────────────────
function DiscardPool({ tiles, label, lastDiscard, canClaim, onClaim }) {
  return (
    <div className="dpool">
      <div className="dpool-lbl">{label}</div>
      <div className="dpool-tiles">
        {(tiles||[]).map((t, i) => {
          const isLast = lastDiscard && t.id === lastDiscard.id && i === tiles.length - 1
          const claimable = isLast && canClaim
          return (
            <MJTile key={t.id} tile={t} inDiscard
              onClick={claimable ? onClaim : undefined}
              selected={claimable} isWait={claimable}/>
          )
        })}
      </div>
    </div>
  )
}

// ─── Tile Tracker (using Unicode tile symbols) ────────────────────────────────
function TileTracker({ discards, melds }) {
  const tracker = useMemo(() =>
    buildTileTracker(discards||[[],[],[],[]], melds||[[],[],[],[]])
  , [JSON.stringify(discards?.map(d=>d.length)), JSON.stringify(melds?.map(m=>m.length))])

  const suitRows = [
    { label:'萬', suit:'characters', emojis: EMOJI.characters },
    { label:'索', suit:'bamboo',     emojis: EMOJI.bamboo },
    { label:'筒', suit:'circles',    emojis: EMOJI.circles },
  ]
  const honourKeys = [
    { k:'winds-0',   sym:'🀀', lbl:'東' },
    { k:'winds-1',   sym:'🀁', lbl:'南' },
    { k:'winds-2',   sym:'🀂', lbl:'西' },
    { k:'winds-3',   sym:'🀃', lbl:'北' },
    { k:'dragons-0', sym:'🀄', lbl:'中' },
    { k:'dragons-1', sym:'🀅', lbl:'發' },
    { k:'dragons-2', sym:'🀆', lbl:'白' },
  ]

  return (
    <div className="tracker-panel">
      <div className="tracker-title">🀫 記牌器</div>
      {suitRows.map(row => (
        <div key={row.suit} className="tracker-suit">
          <div className="tracker-suit-label">{row.label}</div>
          <div className="tracker-row">
            {row.emojis.map((em, vi) => {
              const k = `${row.suit}-${vi+1}`
              const avail = 4 - (tracker[k]?.gone || 0)
              return (
                <div key={k} className={`tracker-tile avail-${avail}`} title={`${vi+1}${row.label} — 剩 ${avail}/4`}>
                  <span className="tracker-sym">{em}</span>
                  <span className="tracker-count">{avail}</span>
                </div>
              )
            })}
          </div>
        </div>
      ))}
      <div className="tracker-suit">
        <div className="tracker-suit-label">字</div>
        <div className="tracker-row">
          {honourKeys.map(({ k, sym, lbl }) => {
            const avail = 4 - (tracker[k]?.gone || 0)
            return (
              <div key={k} className={`tracker-tile avail-${avail}`} title={`${lbl} — 剩 ${avail}/4`}>
                <span className="tracker-sym">{sym}</span>
                <span className="tracker-count">{avail}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Charts ───────────────────────────────────────────────────────────────────
function BarChart({ data, labels, colors, title, unit='' }) {
  const max = Math.max(...data.map(Math.abs), 1)
  return (
    <div className="sim-chart-block">
      {title && <div className="sim-chart-title">{title}</div>}
      <div className="sim-bar-chart">
        {data.map((v, i) => (
          <div key={i} className="sim-bar-col">
            <div className="sim-bar-val">{v > 0 ? '+' : ''}{v}{unit}</div>
            <div className="sim-bar-wrap">
              <div className="sim-bar" style={{ height:`${Math.abs(v)/max*100}%`, background:colors?.[i]||'#888', opacity:v<0?0.5:1 }}/>
            </div>
            <div className="sim-bar-lbl" style={{color:colors?.[i]||'#888'}}>{labels[i]}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Sparkline({ history, colors, labels, width=440, height=90 }) {
  if (!history || history.length < 2) return null
  const n = history[0].length
  const all = history.flat()
  const mn = Math.min(...all), mx = Math.max(...all, 1), range = mx - mn || 1
  const px = i => (i / (history.length - 1)) * width
  const py = v => height - 16 - ((v - mn) / range) * (height - 28)
  return (
    <div className="sim-chart-block" style={{gridColumn:'span 2'}}>
      <div className="sim-chart-title">分數走勢（最後一局）</div>
      <svg width={width} height={height} style={{display:'block',overflow:'visible'}}>
        <line x1={0} y1={py(0)} x2={width} y2={py(0)} stroke="rgba(255,255,255,.1)" strokeWidth="1" strokeDasharray="4"/>
        {Array.from({length:n}, (_, pi) => (
          <polyline key={pi}
            points={history.map((s,ti) => `${px(ti)},${py(s[pi]??0)}`).join(' ')}
            fill="none" stroke={colors?.[pi]||'#888'} strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round" opacity="0.9"/>
        ))}
        {labels.map((l, i) => (
          <g key={i}>
            <rect x={4+i*105} y={height-12} width={10} height={3} fill={colors?.[i]||'#888'} rx="2"/>
            <text x={18+i*105} y={height-4} fontSize="9" fill={colors?.[i]||'#888'}>{l}</text>
          </g>
        ))}
      </svg>
    </div>
  )
}

// ─── Win type bar chart ───────────────────────────────────────────────────────
function WinTypeChart({ allResults }) {
  const winTypes = allResults.flatMap(r => r.stats?.winTypes || [])
  if (winTypes.length === 0) return (
    <div className="sim-chart-block">
      <div className="sim-chart-title">牌型分佈</div>
      <div style={{fontSize:'.7rem',color:'rgba(250,247,240,.35)',padding:8}}>無糊牌記錄</div>
    </div>
  )
  const counts = {}
  for (const w of winTypes) counts[w.type] = (counts[w.type]||0)+1
  const entries = Object.entries(counts).sort((a,b)=>b[1]-a[1])
  const total = winTypes.length
  const clrs = ['#c8973a','#2a7a3b','#b5200d','#1a4fa0','#8e1f8e','#4a7a4a','#d63031','#0984e3']
  return (
    <div className="sim-chart-block" style={{gridColumn:'span 2'}}>
      <div className="sim-chart-title">牌型分佈（共 {total} 次糊牌）</div>
      {entries.map(([type,count], i) => (
        <div key={i} className="win-type-row">
          <div className="wt-bar-wrap">
            <div className="wt-bar" style={{width:`${count/total*100}%`, background:clrs[i%clrs.length]}}/>
          </div>
          <span className="wt-label">{type}</span>
          <span className="wt-count">{count}次 ({Math.round(count/total*100)}%)</span>
        </div>
      ))}
    </div>
  )
}

function FanDistChart({ allResults }) {
  const fans = allResults.flatMap(r => (r.stats?.winTypes||[]).map(w=>w.fan))
  if (!fans.length) return null
  const buckets = {'3':0,'4':0,'5':0,'6':0,'7':0,'8':0,'9-12':0,'13+':0}
  for (const f of fans) {
    if (f<=3) buckets['3']++
    else if (f===4) buckets['4']++
    else if (f===5) buckets['5']++
    else if (f===6) buckets['6']++
    else if (f===7) buckets['7']++
    else if (f===8) buckets['8']++
    else if (f<=12) buckets['9-12']++
    else buckets['13+']++
  }
  const data = Object.values(buckets)
  const labels = Object.keys(buckets).map(k=>`${k}番`)
  const clrs = data.map((_,i)=>`hsl(${180+i*22},65%,55%)`)
  return <BarChart title="番數分佈" data={data} labels={labels} colors={clrs}/>
}

// ─── Per-game log table ───────────────────────────────────────────────────────
function GameLogTable({ allResults, strategies }) {
  const [expanded, setExpanded] = useState(null)
  const colors = strategies.map(sk => AI_STRATEGIES[sk]?.color || '#888')
  const pnames = strategies.map(sk => AI_STRATEGIES[sk]?.name || sk)

  return (
    <div className="sim-chart-block" style={{gridColumn:'1 / -1'}}>
      <div className="sim-chart-title">逐局記錄（{allResults.length} 局）</div>
      <div className="game-log-table-wrap">
        <table className="game-log-table">
          <thead>
            <tr>
              <th>#</th>
              <th>勝者</th>
              <th>牌型</th>
              <th>番</th>
              <th>摸牌</th>
              <th>剩牌</th>
              {strategies.map((sk,i)=><th key={i} style={{color:colors[i]}}>{pnames[i]}</th>)}
              <th>詳情</th>
            </tr>
          </thead>
          <tbody>
            {allResults.map((r, gi) => {
              const winner = r.winner
              const isDraw = winner === -1
              const wt = r.stats?.winTypes?.[r.stats.winTypes.length-1]
              const isOpen = expanded === gi
              return (
                <>
                  <tr key={gi} className={isDraw?'draw-row':winner===0?'p0-row':''}>
                    <td style={{color:'rgba(250,247,240,.4)',fontSize:'.6rem'}}>{gi+1}</td>
                    <td>
                      {isDraw ? <span style={{color:'rgba(250,247,240,.4)'}}>流局</span>
                        : <span style={{color:colors[winner],fontWeight:700}}>
                            {winner===0?'你':pnames[winner]}
                          </span>
                      }
                    </td>
                    <td style={{fontSize:'.65rem'}}>{wt?.type||'—'}</td>
                    <td style={{fontSize:'.65rem',color:'var(--gold2)'}}>{wt?.fan||'—'}</td>
                    <td style={{fontSize:'.65rem'}}>{r.stats?.tilesDrawn?.reduce((a,b)=>a+b,0)||'—'}</td>
                    <td style={{fontSize:'.65rem'}}>{r.wall?.length??'—'}</td>
                    {strategies.map((_,i)=>(
                      <td key={i} style={{
                        color: (r.scores?.[i]||0)>=0 ? 'var(--green)' : 'var(--red)',
                        fontWeight:600, fontSize:'.68rem'
                      }}>
                        {(r.scores?.[i]||0)>0?'+':''}{r.scores?.[i]||0}
                      </td>
                    ))}
                    <td>
                      <button className="expand-btn" onClick={()=>setExpanded(isOpen?null:gi)}>
                        {isOpen?'▲':'▼'}
                      </button>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr key={`${gi}-detail`}>
                      <td colSpan={7+strategies.length} className="game-detail-row">
                        <div className="game-detail">
                          <div className="game-detail-grid">
                            <div><strong>摸牌 / 棄牌：</strong>
                              {strategies.map((sk,i)=>(
                                <span key={i} style={{color:colors[i],marginLeft:8}}>
                                  {pnames[i]} {r.stats?.tilesDrawn?.[i]||0}/{r.stats?.discardCount?.[i]||0}
                                </span>
                              ))}
                            </div>
                            <div><strong>牆剩：</strong> {r.wall?.length??'?'} 張</div>
                          </div>
                          <div className="game-log-scroll">
                            {(r.log||[]).map((l,li)=>(
                              <div key={li} className="game-log-line">{l}</div>
                            ))}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Strategy Ranking ─────────────────────────────────────────────────────────
function StratRanking({ rankings }) {
  if (!rankings || rankings.length === 0) return null
  return (
    <div className="strat-ranking-card">
      <div className="strat-ranking-title">🏆 策略排名（模擬結果）</div>
      {rankings.map((r, i) => {
        const s = AI_STRATEGIES[r.key]; if (!s) return null
        const m = ['🥇','🥈','🥉','4.','5.','6.','7.','8.','9.','10.','11.','12.'][i]||''
        return (
          <div key={r.key} className="strat-rank-row" style={{borderLeftColor:s.color}}>
            <span className="rank-medal">{m}</span>
            <span className="rank-emoji">{s.emoji}</span>
            <div className="rank-info">
              <div className="rank-name" style={{color:s.color}}>{s.fullName}</div>
              <div className="rank-theory">{s.theory}</div>
            </div>
            <div className="rank-stats">
              <div className="rank-wins">{r.wins}勝 ({Math.round(r.wins/Math.max(r.simCount,1)*100)}%)</div>
              <div className="rank-score" style={{color:r.avgScore>=0?'var(--green)':'var(--red)'}}>
                {r.avgScore>=0?'+':''}{r.avgScore}分
              </div>
            </div>
          </div>
        )
      })}
      <div className="strat-ranking-note">{rankings[0]?.simCount||0} 局模擬結果</div>
    </div>
  )
}

// ─── Simulation Progress ──────────────────────────────────────────────────────
function SimProgress({ progress, total, currentGame }) {
  const pct = total > 0 ? Math.round(progress/total*100) : 0
  return (
    <div className="sim-progress-screen">
      <div className="sim-progress-card">
        <div className="sim-progress-title">🎮 模擬進行中…</div>
        <div className="sim-progress-bar-wrap">
          <div className="sim-progress-bar" style={{width:`${pct}%`}}/>
        </div>
        <div className="sim-progress-text">{progress} / {total} 局 ({pct}%)</div>
        {currentGame && (
          <div className="sim-progress-log">
            {currentGame.log?.slice(-3).map((l,i)=><div key={i} style={{fontSize:'.62rem',opacity:.7}}>{l}</div>)}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Sim Dashboard ────────────────────────────────────────────────────────────
function SimDashboard({ simData, strategies, onBack, onRunMore }) {
  const [tab, setTab] = useState('overview')
  if (!simData) return null
  const { allResults, runs } = simData
  const pnames = strategies.map(sk => `${AI_STRATEGIES[sk]?.emoji}${AI_STRATEGIES[sk]?.name}`)
  const colors  = strategies.map(sk => AI_STRATEGIES[sk]?.color || '#888')
  const wins    = strategies.map((_, i) => allResults.filter(r=>r.winner===i).length)
  const draws   = allResults.filter(r=>r.winner===-1).length
  const avgScore  = strategies.map((_, i) => Math.round(allResults.reduce((s,r)=>s+(r.scores?.[i]||0),0)/Math.max(runs,1)))
  const avgDrawn  = strategies.map((_, i) => Math.round(allResults.reduce((s,r)=>s+(r.stats?.tilesDrawn?.[i]||0),0)/Math.max(runs,1)))
  const avgDiscard= strategies.map((_, i) => Math.round(allResults.reduce((s,r)=>s+(r.stats?.discardCount?.[i]||0),0)/Math.max(runs,1)))
  const last = allResults[allResults.length-1]
  const avgTurns = Math.round(allResults.reduce((s,r)=>s+(r.stats?.turns||0),0)/Math.max(runs,1))

  return (
    <div className="sim-dashboard">
      <div className="sim-dash-header">
        <div className="sim-dash-title">🎮 模擬結果</div>
        <div className="sim-dash-sub">
          {runs} 局完成 · {draws} 次流局（{Math.round(draws/Math.max(runs,1)*100)}%）· 平均 {avgTurns} 回合
        </div>
        <div className="sim-tabs">
          {['overview','games','charts'].map(t=>(
            <button key={t} className={`sim-tab${tab===t?' act':''}`} onClick={()=>setTab(t)}>
              {{overview:'📊 總覽', games:'📋 逐局', charts:'📈 圖表'}[t]}
            </button>
          ))}
        </div>
      </div>

      {tab === 'overview' && (
        <>
          {/* Summary stat cards */}
          <div className="sim-stat-cards">
            {strategies.map((sk, i) => {
              const s = AI_STRATEGIES[sk]
              const winPct = Math.round(wins[i]/Math.max(runs,1)*100)
              return (
                <div key={i} className="sim-stat-card" style={{borderTopColor:s?.color}}>
                  <div className="ssc-name" style={{color:s?.color}}>{s?.emoji} {s?.name}</div>
                  <div className="ssc-theory">{s?.theory}</div>
                  <div className="ssc-grid">
                    <div className="ssc-item"><span className="ssc-lbl">勝場</span><span className="ssc-val">{wins[i]}</span></div>
                    <div className="ssc-item"><span className="ssc-lbl">勝率</span><span className="ssc-val">{winPct}%</span></div>
                    <div className="ssc-item"><span className="ssc-lbl">平均分</span>
                      <span className="ssc-val" style={{color:avgScore[i]>=0?'var(--green)':'var(--red)'}}>
                        {avgScore[i]>=0?'+':''}{avgScore[i]}
                      </span>
                    </div>
                    <div className="ssc-item"><span className="ssc-lbl">平均摸牌</span><span className="ssc-val">{avgDrawn[i]}</span></div>
                  </div>
                  {/* Win rate bar */}
                  <div className="ssc-bar-wrap">
                    <div className="ssc-bar" style={{width:`${winPct}%`,background:s?.color}}/>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Score leaderboard */}
          <div className="sim-chart-block" style={{marginTop:10}}>
            <div className="sim-chart-title">策略排名</div>
            <table className="sim-table">
              <thead><tr><th>排名</th><th>策略</th><th>理論</th><th>勝場</th><th>勝率</th><th>平均分</th><th>平均摸牌</th><th>平均棄牌</th></tr></thead>
              <tbody>
                {strategies
                  .map((sk,i)=>({sk,i,wins:wins[i],avgScore:avgScore[i]}))
                  .sort((a,b)=>b.wins-a.wins||b.avgScore-a.avgScore)
                  .map(({sk,i},rank)=>{
                    const s=AI_STRATEGIES[sk]
                    return (
                      <tr key={i} className={wins[i]===Math.max(...wins)?'winner-row':''}>
                        <td style={{color:'var(--gold2)',fontWeight:700}}>
                          {['🥇','🥈','🥉'][rank]||`${rank+1}.`}
                        </td>
                        <td><span style={{color:s?.color}}>{s?.emoji} {s?.name}</span></td>
                        <td style={{fontSize:'.6rem',color:'rgba(250,247,240,.4)'}}>{s?.theory}</td>
                        <td style={{fontWeight:700}}>{wins[i]}</td>
                        <td>{Math.round(wins[i]/Math.max(runs,1)*100)}%</td>
                        <td style={{color:avgScore[i]>=0?'var(--green)':'var(--red)',fontWeight:600}}>
                          {avgScore[i]>=0?'+':''}{avgScore[i]}
                        </td>
                        <td>{avgDrawn[i]}</td>
                        <td>{avgDiscard[i]}</td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>

          <WinTypeChart allResults={allResults}/>
        </>
      )}

      {tab === 'games' && (
        <GameLogTable allResults={allResults} strategies={strategies}/>
      )}

      {tab === 'charts' && (
        <div className="sim-charts-grid">
          <BarChart title="勝場數" data={wins} labels={pnames} colors={colors}/>
          <BarChart title="平均得分" data={avgScore} labels={pnames} colors={colors} unit="分"/>
          <BarChart title="平均摸牌數" data={avgDrawn} labels={pnames} colors={colors}/>
          <BarChart title="平均棄牌數" data={avgDiscard} labels={pnames} colors={colors}/>
          <FanDistChart allResults={allResults}/>
          {last?.stats?.scoreHistory?.length>1 && (
            <Sparkline history={last.stats.scoreHistory} colors={colors} labels={pnames} width={440} height={90}/>
          )}
        </div>
      )}

      <div className="sim-actions">
        <button className="btn btn-gold" onClick={onRunMore}>再模擬 ×{runs}</button>
        <button className="btn btn-ghost" onClick={onBack}>← 返回設定</button>
      </div>
    </div>
  )
}

// ─── Hint Panel ───────────────────────────────────────────────────────────────
function HintPanel({ hand, melds, wallLength }) {
  const [show, setShow] = useState(true)
  const analysis = useMemo(() => {
    if (!hand || hand.length < 2) return null
    try { return analyzeHand(hand, melds||[], wallLength) }
    catch { return null }
  }, [hand.map(t=>t.id).join(','), wallLength])

  if (!analysis) return null
  const { shanten, tenpai, hints } = analysis
  const cls = shanten===0?'shanten-0':shanten===1?'shanten-1':shanten===2?'shanten-2':'shanten-n'
  const txt = shanten===0?'聽牌！':`差 ${shanten} 步`
  const icons = { tenpai:'🀄', discard:'💡', pattern:'🎯', prob:'📊' }

  return (
    <div className="hint-panel">
      <div className="hint-title">
        💡 分析提示
        <span className={`shanten-badge ${cls}`}>{txt}</span>
        <button className="hint-toggle" onClick={()=>setShow(s=>!s)}>{show?'收起':'展開'}</button>
      </div>
      {show && (
        <>
          {hints.map((h,i) => (
            <div key={i} className="hint-item">
              <span className="hint-icon">{icons[h.type]||'•'}</span>
              <span className="hint-text">{h.msg}</span>
            </div>
          ))}
          {tenpai.length > 0 && (
            <div style={{marginTop:6,fontSize:'.6rem',color:'rgba(200,151,58,.7)'}}>
              等牌：{tenpai.map(t=>getTileLabel(t)).join(' ')}
            </div>
          )}
          {hints.length === 0 && (
            <div style={{fontSize:'.65rem',color:'rgba(250,247,240,.3)',fontStyle:'italic'}}>繼續摸牌…</div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Win Overlay ──────────────────────────────────────────────────────────────
function WinOverlay({ handState, session, aiStrategies, onNextHand, onEndSession }) {
  const { winner, winFan, winLabels, isTsumo, scores, phase } = handState
  const isDraw   = winner === -1 || phase === 'exhausted'
  const isDealer = winner !== -1 && winner === session?.dealerSeat
  const pts      = winFan ? fanToPoints(winFan) : 0
  return (
    <div className="overlay">
      <div className="win-card">
        <div className="win-em">{isDraw?'🤝':winner===0?'🏆':'🎴'}</div>
        <div className="win-t">{isDraw?'流局！':winner===0?'你贏啦！':`${PLAYER_NAMES[winner]} 贏！`}</div>
        {!isDraw && winLabels?.length > 0 && (
          <div className="win-fan-display">
            <div className="win-fan-labels">{winLabels.join(' + ')}</div>
            <div className="win-fan-num">{winFan}番</div>
            <div className="win-fan-pts">{isTsumo?`各家付 ${pts} 分`:`出炮者付 ${pts} 分`}</div>
          </div>
        )}
        {isDraw && <div style={{fontSize:'.8rem',color:'rgba(250,247,240,.55)',marginBottom:12}}>牌墻摸完，流局</div>}
        {!isDraw && (
          <div style={{fontSize:'.75rem',color:isDealer?'var(--gold2)':'rgba(250,247,240,.55)',marginBottom:8}}>
            {isDealer?'⭐ 冧莊！莊家留位':'過莊，莊位輪移'}
          </div>
        )}
        <div className="win-scores">
          {scores.map((s,i) => (
            <div key={i} className={`ws${i===winner?' winner':''}`}>
              <div className="ws-name">{i===0?'你':PLAYER_NAMES[i]}</div>
              <div className="ws-val">{s>0?'+':''}{s}</div>
            </div>
          ))}
        </div>
        <div style={{display:'flex',gap:8}}>
          <button className="btn btn-gold" style={{flex:1,padding:10}} onClick={onNextHand}>下一局</button>
          {session && <button className="btn btn-ghost" style={{flex:1,padding:10}} onClick={onEndSession}>結束對局</button>}
        </div>
      </div>
    </div>
  )
}

// ─── Session Summary ──────────────────────────────────────────────────────────
function SessionSummary({ session, onNew }) {
  return (
    <div className="overlay">
      <div className="win-card" style={{maxWidth:500}}>
        <div className="win-em">🎊</div>
        <div className="win-t">對局結束！</div>
        <div style={{fontSize:'.8rem',color:'rgba(250,247,240,.6)',marginBottom:16}}>
          {session.totalHands} 局 · 四圈完畢
        </div>
        <div className="win-scores" style={{flexWrap:'wrap'}}>
          {session.sessionScores.map((s,i) => (
            <div key={i} className={`ws${s===Math.max(...session.sessionScores)?' winner':''}`}>
              <div className="ws-name">{i===0?'你':PLAYER_NAMES[i]}</div>
              <div className="ws-val">{s>0?'+':''}{s}</div>
            </div>
          ))}
        </div>
        <button className="btn btn-gold" onClick={onNew} style={{width:'100%',padding:10,marginTop:8}}>新對局</button>
      </div>
    </div>
  )
}

// ─── Setup Screen ─────────────────────────────────────────────────────────────
function SetupScreen({ onStart, onSimulate, rankings }) {
  const [strats, setStrats]   = useState(['nash','dragon','tortoise','tripletHunter'])
  const [simRuns, setSimRuns] = useState(10)
  const setS = (i,v) => setStrats(prev => prev.map((s,j)=>j===i?v:s))
  const sk = STRATEGY_KEYS

  return (
    <div className="setup-screen">
      <div className="setup-card">
        <div className="setup-title">🀄 香港麻雀</div>
        <div className="setup-sub">四圈局 · 三番起糊 · 12種AI策略</div>

        {rankings && <StratRanking rankings={rankings}/>}

        <div className="setup-sec">
          <div className="setup-lbl">AI 對手策略</div>
          {['東家 AI','南家 AI','西家 AI'].map((seat,i) => (
            <div key={i} className="strat-select-row">
              <span className="strat-seat">{seat}</span>
              <select className="strat-dropdown" value={strats[i+1]} onChange={e=>setS(i+1,e.target.value)}>
                {sk.map(k=><option key={k} value={k}>{AI_STRATEGIES[k].emoji} {AI_STRATEGIES[k].fullName}</option>)}
              </select>
            </div>
          ))}
        </div>

        <div className="setup-sec">
          <div className="setup-lbl">全部策略介紹</div>
          <div className="strat-cards-grid">
            {sk.map(k => {
              const s = AI_STRATEGIES[k]
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
          <div className="setup-lbl">全AI模擬</div>
          <div className="sim-strat-row">
            {[0,1,2,3].map(i => (
              <select key={i} className="strat-dropdown" value={strats[i]} onChange={e=>setS(i,e.target.value)}>
                {sk.map(k=><option key={k} value={k}>{AI_STRATEGIES[k].emoji} {AI_STRATEGIES[k].name}</option>)}
              </select>
            ))}
          </div>
          <div className="sim-runs-row">
            <span style={{fontSize:'.72rem',color:'rgba(200,151,58,.6)'}}>局數：</span>
            {[5,10,20,50].map(n=>(
              <button key={n} className={`sim-run-btn${simRuns===n?' act':''}`} onClick={()=>setSimRuns(n)}>{n}</button>
            ))}
          </div>
          <button className="btn btn-ghost" style={{width:'100%',marginTop:8}} onClick={()=>onSimulate(strats,simRuns)}>
            ▶ 開始模擬 ×{simRuns}
          </button>
        </div>

        <div style={{fontSize:'.65rem',color:'rgba(200,151,58,.45)',lineHeight:1.75,marginBottom:12}}>
          🀄 香港麻雀規則 · 三番起糊 · 莊家連莊/過莊 · 花牌補花（梅蘭菊竹春夏秋冬）· 自摸全付
        </div>
        <button className="btn btn-gold" style={{width:'100%',padding:13}} onClick={()=>onStart(strats.slice(1))}>
          🀄 開始對局（四圈）
        </button>
      </div>
    </div>
  )
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen]       = useState('setup')
  const [session, setSession]     = useState(null)
  const [handState, setHandState] = useState(null)
  const [aiStrats, setAiStrats]   = useState(['nash','dragon','tortoise'])
  const [simData, setSimData]     = useState(null)
  const [simStrats, setSimStrats] = useState(null)
  const [simRuns, setSimRuns]     = useState(10)
  const [simProgress, setSimProgress] = useState(null) // { done, total, currentGame }
  const [rankings, setRankings]   = useState(null)
  const [selectedTile, setSelectedTile] = useState(null)
  const [showSummary, setShowSummary]   = useState(false)
  const logRef = useRef(null)

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [handState?.log])

  const startSession = useCallback((strats) => {
    setAiStrats(strats)
    const sess = initGameSession(strats)
    setSession(sess)
    const hand = startHand(sess)
    setHandState(hand)
    setSelectedTile(null)
    setShowSummary(false)
    setScreen('game')
  }, [])

  // ── Async simulation with progress ─────────────────────────────────────────
  const handleSimulate = useCallback((strats, runs) => {
    setSimStrats(strats)
    setSimRuns(runs)
    setSimProgress({ done: 0, total: runs, currentGame: null })
    setScreen('progress')

    const allResults = []

    function runNext(i) {
      if (i >= runs) {
        // Done — compute rankings and show dashboard
        const rankMap = {}
        strats.forEach((sk, pi) => {
          if (!rankMap[sk]) rankMap[sk] = { key:sk, wins:0, totalScore:0, simCount:runs }
          rankMap[sk].wins += allResults.filter(r=>r.winner===pi).length
          rankMap[sk].totalScore += allResults.reduce((s,r)=>s+(r.scores?.[pi]||0),0)
        })
        const arr = Object.values(rankMap)
          .map(r => ({ ...r, avgScore: Math.round(r.totalScore/Math.max(runs,1)) }))
          .sort((a,b)=>b.wins-a.wins||b.avgScore-a.avgScore)
        setRankings(arr)
        setSimData({ allResults, runs })
        setSimProgress(null)
        setScreen('sim')
        return
      }
      // Run one game synchronously, then yield via setTimeout
      setTimeout(() => {
        const sim = runSimulation(strats)
        allResults.push(...(sim.results || []))
        const lastGame = (sim.results||[])[sim.results?.length-1] || null
        setSimProgress({ done: i+1, total: runs, currentGame: lastGame })
        runNext(i+1)
      }, 0)
    }

    runNext(0)
  }, [])

  // ── AI loop ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!handState) return
    if (handState.phase === 'finished' || handState.phase === 'exhausted') return
    if (handState.currentPlayer === PLAYER) return
    const t = setTimeout(() => {
      setHandState(prev => {
        if (!prev || prev.currentPlayer === PLAYER) return prev
        if (prev.phase === 'finished' || prev.phase === 'exhausted') return prev
        return aiTurn(prev)
      })
    }, 420 + Math.random() * 200)
    return () => clearTimeout(t)
  }, [handState?.currentPlayer, handState?.phase])

  // ── Player auto-draw ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!handState) return
    if (handState.currentPlayer !== PLAYER || handState.phase !== 'draw') return
    const t = setTimeout(() => {
      setHandState(prev => {
        if (!prev || prev.currentPlayer !== PLAYER || prev.phase !== 'draw') return prev
        return drawTile(prev)
      })
    }, 200)
    return () => clearTimeout(t)
  }, [handState?.currentPlayer, handState?.phase])

  const handleTileClick = tile => {
    if (!handState || handState.currentPlayer !== PLAYER || handState.phase !== 'discard') return
    if (selectedTile?.id === tile.id) {
      setHandState(prev => playerDiscard(prev, tile.id))
      setSelectedTile(null)
    } else {
      setSelectedTile(tile)
    }
  }

  const handleDiscard = () => {
    if (!selectedTile || !handState) return
    setHandState(prev => playerDiscard(prev, selectedTile.id))
    setSelectedTile(null)
  }
  const handleClaim = () => {
    if (!handState) return
    setHandState(prev => playerClaimDiscard(prev))
  }

  const handleNextHand = () => {
    if (!handState || !session) return
    const newSess = advanceSession(session, handState)
    if (newSess.phase === 'finished') { setSession(newSess); setShowSummary(true); return }
    setSession(newSess)
    setHandState(startHand(newSess))
    setSelectedTile(null)
  }

  const canClaim = !!(
    handState &&
    handState.phase === 'draw' &&
    handState.lastDiscard &&
    handState.lastDiscardPlayer !== PLAYER
  )

  // ── Routing ────────────────────────────────────────────────────────────────
  if (screen === 'progress') return (
    <SimProgress progress={simProgress?.done||0} total={simProgress?.total||1} currentGame={simProgress?.currentGame}/>
  )
  if (screen === 'sim') return (
    <SimDashboard simData={simData} strategies={simStrats}
      onBack={()=>setScreen('setup')} onRunMore={()=>handleSimulate(simStrats,simRuns)}/>
  )
  if (screen === 'setup') return (
    <SetupScreen onStart={startSession} onSimulate={handleSimulate} rankings={rankings}/>
  )

  // ── Game view ──────────────────────────────────────────────────────────────
  const isPlayerTurn = handState?.currentPlayer === PLAYER
  const canDiscard   = isPlayerTurn && handState?.phase === 'discard'
  const playerHand   = handState?.hands[PLAYER] || []
  const drawnTile    = handState?.drawnTile
  const isFinished   = handState?.phase === 'finished' || handState?.phase === 'exhausted'
  const tenpaiTiles  = handState?.tenpaiTiles || []

  return (
    <div className="app">
      {isFinished && (
        <WinOverlay handState={handState} session={session} aiStrategies={aiStrats}
          onNextHand={handleNextHand} onEndSession={()=>setShowSummary(true)}/>
      )}
      {showSummary && session && (
        <SessionSummary session={session} onNew={()=>setScreen('setup')}/>
      )}

      <div className="hdr">
        <div className="hdr-title">🀄 香港麻雀</div>
        <div style={{fontSize:'.7rem',color:'var(--gold2)',margin:'0 8px'}}>
          {session && `${ROUND_NAMES[session.round]} 第${session.totalHands+1}局 · 莊：${PLAYER_NAMES[session.dealerSeat]}`}
        </div>
        <div className="hdr-right">
          <button className="btn btn-ghost" style={{fontSize:'.7rem'}} onClick={()=>setScreen('setup')}>⚙</button>
        </div>
      </div>

      <div className="scores">
        {handState?.scores.map((s,i) => (
          <div key={i} className={`sc${i===handState.currentPlayer?' cur':''}${i===session?.dealerSeat?' dealer':''}`}>
            <div className="sc-name">{i===0?'你':PLAYER_NAMES[i]} {i===session?.dealerSeat?'⭐':''}</div>
            <div className="sc-sub">
              {i===0
                ? `${WIND_ZH[handState?.seatWinds?.[i]??i]}家`
                : `${AI_STRATEGIES[aiStrats[i-1]]?.emoji} ${AI_STRATEGIES[aiStrats[i-1]]?.name}`}
            </div>
            <div className="sc-pts">{s>0?'+':''}{s}</div>
            <FlowerDisplay flowers={handState?.flowers?.[i]||[]}/>
          </div>
        ))}
      </div>

      <div className="table">
        {/* Top — South (AI 2) */}
        <div className="aip top">
          <div>
            <div className="ai-label">{PLAYER_NAMES[2]} {WIND_ZH[handState?.seatWinds?.[2]||0]}</div>
            <div className="ai-sub">{AI_STRATEGIES[aiStrats[1]]?.emoji} {AI_STRATEGIES[aiStrats[1]]?.name}</div>
            <div className="ai-count">剩 {handState?.hands[2]?.length} 張</div>
          </div>
          <MeldDisplay melds={handState?.melds?.[2]||[]}/>
          <div className="ai-rack">{handState?.hands[2]?.map(t=><TileBack key={t.id} small/>)}</div>
          <DiscardPool tiles={handState?.discards?.[2]||[]} label="南家棄牌" lastDiscard={null} canClaim={false}/>
        </div>

        {/* Left — East (AI 1) */}
        <div className="aip left">
          <div className="ai-label">{PLAYER_NAMES[1]} {WIND_ZH[handState?.seatWinds?.[1]||0]}</div>
          <div className="ai-sub">{AI_STRATEGIES[aiStrats[0]]?.emoji} {AI_STRATEGIES[aiStrats[0]]?.name}</div>
          <div className="ai-count">剩 {handState?.hands[1]?.length} 張</div>
          <MeldDisplay melds={handState?.melds?.[1]||[]}/>
          <div className="ai-rack" style={{flexDirection:'column',marginTop:4}}>
            {handState?.hands[1]?.map(t=><TileBack key={t.id} small/>)}
          </div>
          <DiscardPool tiles={handState?.discards?.[1]||[]} label="東家棄牌" lastDiscard={null} canClaim={false}/>
        </div>

        {/* Center */}
        <div className="center">
          <div className="center-top">
            <div className="wall-badge">
              <div className="wall-num">{handState?.wall?.length??0}</div>
              <div className="wall-lbl">剩餘張數</div>
            </div>
            <div style={{textAlign:'center'}}>
              <div className="turn-lbl">{isPlayerTurn?'⭐ 輪到你':`${PLAYER_NAMES[handState?.currentPlayer||0]} 行牌`}</div>
              <div style={{fontSize:'.58rem',color:'rgba(200,151,58,.5)',marginTop:2}}>
                {session&&`${ROUND_NAMES[session.round]} · 莊連${session.dealerWins}次`}
              </div>
            </div>
          </div>
          <div className="discards-grid">
            <DiscardPool tiles={handState?.discards?.[0]||[]} label="你嘅棄牌" lastDiscard={null} canClaim={false}/>
            <DiscardPool tiles={handState?.discards?.[3]||[]} label="西家棄牌"
              lastDiscard={handState?.lastDiscard} canClaim={canClaim} onClaim={handleClaim}/>
          </div>
          <div className="log" ref={logRef}>
            {handState?.log?.slice(-20).map((e,i)=><div key={i} className="log-e">{e}</div>)}
          </div>
        </div>

        {/* Right — West (AI 3) */}
        <div className="aip right">
          <div className="ai-label">{PLAYER_NAMES[3]} {WIND_ZH[handState?.seatWinds?.[3]||0]}</div>
          <div className="ai-sub">{AI_STRATEGIES[aiStrats[2]]?.emoji} {AI_STRATEGIES[aiStrats[2]]?.name}</div>
          <div className="ai-count">剩 {handState?.hands[3]?.length} 張</div>
          <MeldDisplay melds={handState?.melds?.[3]||[]}/>
          <div className="ai-rack" style={{flexDirection:'column',marginTop:4}}>
            {handState?.hands[3]?.map(t=><TileBack key={t.id} small/>)}
          </div>
          <DiscardPool tiles={handState?.discards?.[3]||[]} label="西家棄牌"
            lastDiscard={handState?.lastDiscard} canClaim={canClaim} onClaim={handleClaim}/>
        </div>

        {/* Player hand */}
        <div className="hand-area">
          <div className="hand-top">
            <div className="hand-title">你嘅手牌 {WIND_ZH[handState?.seatWinds?.[PLAYER]||0]}家</div>
            <div className="hand-meta">{playerHand.length} 張</div>
            {tenpaiTiles.length > 0 && (
              <span className="tenpai-badge">✨ 聽牌！等 {tenpaiTiles.length} 種</span>
            )}
            {canDiscard && !selectedTile && (
              <span style={{fontSize:'.65rem',color:'rgba(250,247,240,.4)'}}>撳牌選擇，再撳打出</span>
            )}
          </div>
          <MeldDisplay melds={handState?.melds?.[PLAYER]||[]}/>
          <FlowerDisplay flowers={handState?.flowers?.[PLAYER]||[]}/>
          <div className="hand-rack">
            {playerHand.map(tile => {
              const isDrawn = drawnTile && tile.id === drawnTile.id
              const isWait  = tenpaiTiles.some(t=>tileKey(t)===tileKey(tile))
              return (
                <MJTile key={tile.id} tile={tile}
                  selected={selectedTile?.id===tile.id}
                  isDrawn={isDrawn} isWait={isWait}
                  onClick={()=>handleTileClick(tile)}/>
              )
            })}
          </div>
          <div className="actions">
            <button className="btn btn-red" disabled={!selectedTile||!canDiscard} onClick={handleDiscard}>打出所選</button>
            {canClaim && <button className="btn btn-green" onClick={handleClaim}>🀄 食炮！</button>}
            <button className="btn btn-ghost" onClick={()=>setScreen('setup')} style={{marginLeft:'auto'}}>⚙</button>
          </div>
          {isPlayerTurn && (
            <HintPanel hand={playerHand} melds={handState?.melds?.[PLAYER]||[]} wallLength={handState?.wall?.length||0}/>
          )}
          <TileTracker discards={handState?.discards||[[],[],[],[]]} melds={handState?.melds||[[],[],[],[]]}/>
        </div>
      </div>
    </div>
  )
}
