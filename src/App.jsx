import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { initGame, drawTile, playerDiscard, aiTurn, playerClaimDiscard, PLAYER_NAMES, SEAT_WINDS } from './game/gameEngine.js'
import { tileKey, sortHand, getTenpaiTiles, calcShanten, analyzeHand, buildTileTracker, SUITS, WIND_NAMES, WIND_ZH, DRAGON_ZH } from './game/tiles.js'

// ─── Tile face rendering ────────────────────────────────────────────────────
const SUIT_EMOJI = {
  bamboo:     ['🀐','🀑','🀒','🀓','🀔','🀕','🀖','🀗','🀘'],
  characters: ['🀇','🀈','🀉','🀊','🀋','🀌','🀍','🀎','🀏'],
  circles:    ['🀙','🀚','🀛','🀜','🀝','🀞','🀟','🀠','🀡'],
  winds:      ['🀀','🀁','🀂','🀃'],
  dragons:    ['🀄','🀅','🀆'],
}

function tileContent(tile) {
  if (tile.suit === 'winds') {
    return <span className="tile-sym wind">{WIND_ZH[tile.value]}</span>
  }
  if (tile.suit === 'dragons') {
    const cls = ['dragon-red','dragon-green','dragon-white'][tile.value]
    return <span className={`tile-sym ${cls}`}>{DRAGON_ZH[tile.value]}</span>
  }
  const emoji = SUIT_EMOJI[tile.suit]?.[tile.value - 1] || '?'
  return <span className={`tile-sym ${tile.suit}`}>{emoji}</span>
}

// ─── Authentic Mahjong Tile ─────────────────────────────────────────────────
function MJTile({ tile, selected, onClick, isDrawn, isWait, inDiscard, size }) {
  const cls = [
    'mj-tile',
    selected ? 'sel' : '',
    isDrawn ? 'drawn' : '',
    isWait ? 'wait' : '',
    inDiscard ? 'in-discard' : '',
  ].filter(Boolean).join(' ')

  return (
    <div className={cls} onClick={onClick} title={tileKey(tile)}>
      {!inDiscard ? (
        <div className="tile-face">{tileContent(tile)}</div>
      ) : (
        <div style={{fontSize:'13px',lineHeight:1}}>{SUIT_EMOJI[tile.suit]?.[SUITS.includes(tile.suit) ? tile.value-1 : tile.value] || (tile.suit==='winds'?WIND_ZH[tile.value]:DRAGON_ZH[tile.value])}</div>
      )}
    </div>
  )
}

// ─── Tile Back ──────────────────────────────────────────────────────────────
function TileBack({ small }) {
  return <div className="tile-back" style={small ? {width:22,height:30} : {}} />
}

// ─── 記牌器 Tile Tracker ────────────────────────────────────────────────────
function TileTracker({ state }) {
  const tracker = useMemo(() => {
    if (!state) return {}
    return buildTileTracker(state.discards, state.wall)
  }, [state?.discards, state?.wall?.length])

  const suitRows = [
    { label:'萬 Characters', suit:'characters', vals:[1,2,3,4,5,6,7,8,9] },
    { label:'索 Bamboo',     suit:'bamboo',     vals:[1,2,3,4,5,6,7,8,9] },
    { label:'筒 Circles',    suit:'circles',    vals:[1,2,3,4,5,6,7,8,9] },
    { label:'字牌 Honours',  suit:'mixed',      keys:[
      ...['winds-0','winds-1','winds-2','winds-3'],
      ...['dragons-0','dragons-1','dragons-2']
    ]},
  ]

  return (
    <div className="tracker-panel">
      <div className="tracker-title">🀫 記牌器</div>
      {suitRows.map(row => (
        <div key={row.label} className="tracker-suit">
          <div className="tracker-suit-label">{row.label}</div>
          <div className="tracker-row">
            {row.suit !== 'mixed'
              ? row.vals.map(v => {
                  const k = `${row.suit}-${v}`
                  const info = tracker[k] || { gone:0, total:4 }
                  const avail = 4 - info.gone
                  return (
                    <div key={k} className={`tracker-tile avail-${avail}`} title={`${avail}/4 剩`}>
                      {v}
                      <span className="tracker-count">{avail}</span>
                    </div>
                  )
                })
              : row.keys.map(k => {
                  const info = tracker[k] || { gone:0, total:4 }
                  const avail = 4 - info.gone
                  const [suit, val] = k.split('-')
                  const lbl = suit==='winds' ? WIND_ZH[+val] : DRAGON_ZH[+val]
                  return (
                    <div key={k} className={`tracker-tile avail-${avail}`} title={`${avail}/4 剩`}>
                      {lbl}
                      <span className="tracker-count">{avail}</span>
                    </div>
                  )
                })
            }
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Hint Panel ─────────────────────────────────────────────────────────────
function HintPanel({ hand13, wallLength, discards }) {
  const [show, setShow] = useState(true)

  const analysis = useMemo(() => {
    if (!hand13 || hand13.length < 13) return null
    return analyzeHand(hand13, wallLength, discards)
  }, [hand13?.map(t=>t.id).join(','), wallLength])

  if (!analysis) return null
  const { shanten, hints, tenpai } = analysis

  const shantenCls = shanten === 0 ? 'shanten-0' : shanten === 1 ? 'shanten-1' : shanten === 2 ? 'shanten-2' : 'shanten-n'
  const shantenText = shanten === 0 ? '聽牌！' : `差 ${shanten} 步聽牌`

  const hintIcons = { tenpai:'🀄', 'discard-hint':'💡', pattern:'🎯', prob:'📊' }

  return (
    <div className="hint-panel">
      <div className="hint-title">
        💡 分析提示
        <span className={`shanten-badge ${shantenCls}`}>{shantenText}</span>
        <button className="hint-toggle" onClick={() => setShow(s=>!s)}>{show?'收起':'展開'}</button>
      </div>
      {show && (
        <>
          {hints.length === 0 && <div style={{fontSize:'.65rem',color:'rgba(250,247,240,.4)',fontStyle:'italic'}}>繼續摸牌…</div>}
          {hints.map((h, i) => (
            <div key={i} className="hint-item">
              <span className="hint-icon">{hintIcons[h.type] || '•'}</span>
              <span className="hint-text" dangerouslySetInnerHTML={{__html: h.msg.replace(/（(.+?)）/g,'<strong>（$1）</strong>')}} />
            </div>
          ))}
          {tenpai.length > 0 && (
            <div style={{marginTop:'6px',fontSize:'.6rem',color:'rgba(200,151,58,.6)'}}>
              等牌：{tenpai.map(t => {
                if (t.suit==='winds') return WIND_ZH[t.value]
                if (t.suit==='dragons') return DRAGON_ZH[t.value]
                return `${t.value}${({bamboo:'索',characters:'萬',circles:'筒'})[t.suit]}`
              }).join(' ')}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Discard Pool ────────────────────────────────────────────────────────────
function DiscardPool({ tiles, label, lastDiscard, canClaim, onClaim }) {
  return (
    <div className="dpool">
      <div className="dpool-lbl">{label}</div>
      <div className="dpool-tiles">
        {tiles.map((t, i) => {
          const isLast = lastDiscard && t.id === lastDiscard.id && i === tiles.length-1
          const isClaimable = isLast && canClaim
          return (
            <MJTile key={t.id} tile={t} inDiscard
              onClick={isClaimable ? onClaim : undefined}
              selected={isClaimable}
              isWait={isClaimable}
            />
          )
        })}
      </div>
    </div>
  )
}

// ─── Win Overlay ─────────────────────────────────────────────────────────────
function WinOverlay({ state, onNew }) {
  const { winner, scores } = state
  const isDraw = winner === -1
  return (
    <div className="overlay">
      <div className="win-card">
        <div className="win-em">{isDraw ? '🤝' : winner===0 ? '🏆' : '🎴'}</div>
        <div className="win-t">{isDraw ? '流局！' : winner===0 ? '你贏啦！' : `${PLAYER_NAMES[winner]} 贏！`}</div>
        <div className="win-s">{isDraw ? '牌墻摸完，今局流局。' : winner===0 ? '打得好！完美和牌！' : `${PLAYER_NAMES[winner]} 勝出。`}</div>
        <div className="win-scores">
          {scores.map((s,i) => (
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
function SetupScreen({ onStart }) {
  return (
    <div className="setup-screen">
      <div className="setup-card">
        <div className="setup-title">🀄 麻雀</div>
        <div className="setup-sub">廣東麻雀 · 四人局 · 智能 AI 對戰</div>
        <div className="setup-sec">
          <div className="setup-lbl">玩法介紹</div>
          <div className="rules-text">
            • 每人派 13 張牌，輪流摸牌打牌<br/>
            • 和牌：4 組（順子/刻子）+ 1 對將牌<br/>
            • 自摸：摸到和牌 +8 分；食炮：+16 分<br/>
            • 記牌器：追蹤剩餘張數，籌謀策略<br/>
            • 提示系統：實時分析最優打法<br/>
            • AI 採用智能策略，計算最佳捨牌
          </div>
        </div>
        <button className="btn btn-gold" style={{width:'100%',padding:'13px',fontSize:'.88rem',marginTop:'8px'}}
          onClick={onStart}>
          🀄 開局
        </button>
      </div>
    </div>
  )
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState('setup')
  const [state, setState] = useState(null)
  const [selectedTile, setSelectedTile] = useState(null)
  const logRef = useRef(null)

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [state?.log])

  const startGame = useCallback(() => {
    setState(initGame())
    setScreen('game')
    setSelectedTile(null)
  }, [])

  // AI loop
  useEffect(() => {
    if (!state || state.phase === 'finished') return
    if (state.currentPlayer !== 0) {
      const t = setTimeout(() => {
        setState(prev => prev && prev.currentPlayer !== 0 ? aiTurn(prev) : prev)
      }, 550 + Math.random() * 350)
      return () => clearTimeout(t)
    }
    if (state.currentPlayer === 0 && state.phase === 'draw' && !state.drawnTile) {
      const t = setTimeout(() => {
        setState(prev => prev && prev.phase==='draw' && prev.currentPlayer===0 ? drawTile(prev) : prev)
      }, 250)
      return () => clearTimeout(t)
    }
  }, [state])

  const handleTileClick = (tile) => {
    if (!state || state.currentPlayer !== 0 || state.phase !== 'discard') return
    if (selectedTile?.id === tile.id) {
      setState(prev => playerDiscard(prev, tile.id))
      setSelectedTile(null)
    } else {
      setSelectedTile(tile)
    }
  }

  const handleDiscard = () => {
    if (!selectedTile || !state) return
    setState(prev => playerDiscard(prev, selectedTile.id))
    setSelectedTile(null)
  }

  const handleClaim = () => {
    if (!state) return
    setState(prev => playerClaimDiscard(prev))
  }

  const canClaim = state && state.lastDiscardPlayer !== 0 && state.currentPlayer !== 0
    && state.phase === 'draw' && state.lastDiscard

  if (screen === 'setup') return <SetupScreen onStart={startGame} />

  const playerHand = state?.hands[0] || []
  const isPlayerTurn = state?.currentPlayer === 0
  const canDiscard = isPlayerTurn && state.phase === 'discard'
  const drawnTile = state?.drawnTile
  const hand13 = drawnTile ? playerHand.filter(t=>t.id!==drawnTile.id) : playerHand

  return (
    <div className="app">
      {state?.phase === 'finished' && <WinOverlay state={state} onNew={startGame} />}

      {/* Header */}
      <div className="hdr">
        <div className="hdr-title">🀄 麻雀</div>
        <div className="hdr-right">
          <button className="btn btn-ghost" style={{fontSize:'.7rem'}} onClick={startGame}>新局</button>
          <button className="btn btn-ghost" style={{fontSize:'.7rem'}} onClick={()=>setScreen('setup')}>⚙</button>
        </div>
      </div>

      {/* Scores */}
      <div className="scores">
        {state?.scores.map((s,i) => (
          <div key={i} className={`sc${i===state.currentPlayer?' cur':''}`}>
            <div className="sc-name">{PLAYER_NAMES[i]} {SEAT_WINDS[i]}</div>
            <div className="sc-sub">{state.hands[i]?.length} 張牌</div>
            <div className="sc-pts">{s>0?'+':''}{s}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="table">

        {/* Top — South (AI 2) */}
        <div className="aip top">
          <div>
            <div className="ai-label">{PLAYER_NAMES[2]} 南</div>
            <div className="ai-sub">智能 AI</div>
            <div className="ai-count">剩 {state?.hands[2]?.length} 張</div>
          </div>
          <div className="ai-rack">
            {state?.hands[2]?.map(t => <TileBack key={t.id} small />)}
          </div>
          <DiscardPool tiles={state?.discards[2]||[]} label="南家棄牌" lastDiscard={null} canClaim={false} />
        </div>

        {/* Left — East (AI 1) */}
        <div className="aip left">
          <div className="ai-label">{PLAYER_NAMES[1]} 東</div>
          <div className="ai-sub">智能 AI</div>
          <div className="ai-count">剩 {state?.hands[1]?.length} 張</div>
          <div className="ai-rack" style={{flexDirection:'column',marginTop:'4px'}}>
            {state?.hands[1]?.map(t => <TileBack key={t.id} small />)}
          </div>
          <DiscardPool tiles={state?.discards[1]||[]} label="東家棄牌" lastDiscard={null} canClaim={false} />
        </div>

        {/* Center */}
        <div className="center">
          <div className="center-top">
            <div className="wall-badge">
              <div className="wall-num">{state?.wall?.length ?? 0}</div>
              <div className="wall-lbl">剩餘張數</div>
            </div>
            <div className="turn-lbl">
              {isPlayerTurn ? '⭐ 輪到你' : `${PLAYER_NAMES[state?.currentPlayer]} 行牌`}
            </div>
          </div>

          <div className="discards-grid">
            <DiscardPool tiles={state?.discards[0]||[]} label="你嘅棄牌" lastDiscard={null} canClaim={false} />
            <DiscardPool tiles={state?.discards[3]||[]} label="西家棄牌"
              lastDiscard={state?.lastDiscard} canClaim={canClaim} onClaim={handleClaim} />
          </div>

          <div className="log" ref={logRef}>
            {state?.log?.slice(-20).map((e,i)=><div key={i} className="log-e">{e}</div>)}
          </div>
        </div>

        {/* Right — West (AI 3) */}
        <div className="aip right">
          <div className="ai-label">{PLAYER_NAMES[3]} 西</div>
          <div className="ai-sub">智能 AI</div>
          <div className="ai-count">剩 {state?.hands[3]?.length} 張</div>
          <div className="ai-rack" style={{flexDirection:'column',marginTop:'4px'}}>
            {state?.hands[3]?.map(t => <TileBack key={t.id} small />)}
          </div>
          <DiscardPool tiles={state?.discards[3]||[]} label="西家棄牌"
            lastDiscard={state?.lastDiscard} canClaim={canClaim} onClaim={handleClaim} />
        </div>

        {/* Player hand — bottom */}
        <div className="hand-area">
          <div className="hand-top">
            <div className="hand-title">你嘅手牌</div>
            <div className="hand-meta">共 {playerHand.length} 張</div>
            {state?.tenpaiTiles?.length > 0 && (
              <span className="tenpai-badge">✨ 聽牌！等 {state.tenpaiTiles.length} 種</span>
            )}
            {canDiscard && !selectedTile && (
              <span style={{fontSize:'.65rem',color:'rgba(250,247,240,.4)'}}>撳牌選擇，再撳打出</span>
            )}
          </div>

          {/* Straight-line hand rack */}
          <div className="hand-rack">
            {playerHand.map(tile => {
              const isDrawn = drawnTile && tile.id === drawnTile.id
              const isWait = state?.tenpaiTiles?.some(t => tileKey(t) === tileKey(tile))
              return (
                <MJTile key={tile.id} tile={tile}
                  selected={selectedTile?.id === tile.id}
                  isDrawn={isDrawn} isWait={isWait}
                  onClick={() => handleTileClick(tile)}
                />
              )
            })}
          </div>

          <div className="actions">
            <button className="btn btn-red" disabled={!selectedTile||!canDiscard} onClick={handleDiscard}>
              打出所選
            </button>
            {canClaim && (
              <button className="btn btn-green" onClick={handleClaim}>🀄 食炮！</button>
            )}
            <button className="btn btn-ghost" onClick={startGame} style={{marginLeft:'auto'}}>新局</button>
          </div>

          {/* Hint panel */}
          {isPlayerTurn && (
            <HintPanel hand13={hand13} wallLength={state?.wall?.length||0} discards={state?.discards||[]} />
          )}

          {/* Tile tracker */}
          <TileTracker state={state} />
        </div>
      </div>
    </div>
  )
}
