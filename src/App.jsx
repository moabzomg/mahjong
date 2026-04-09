import { useState, useEffect, useCallback, useRef } from 'react'
import { AI_STRATEGIES } from './ai/strategies.js'
import { initGame, drawTile, playerDiscard, aiTurn, playerClaimDiscard, PLAYER_NAMES } from './game/gameEngine.js'
import { tileSymbol, tileColor, tileLabel, tileKey, SUITS } from './game/tiles.js'

// ─── Tile Component ──────────────────────────────────────────────────────────
function Tile({ tile, onClick, selected, isDrawn, isTenpaiWait, small }) {
  const sym = tileSymbol(tile)
  const col = tileColor(tile)
  const label = SUITS.includes(tile.suit) ? tile.value : tileLabel(tile)
  const cls = ['tile', selected&&'selected', isDrawn&&'drawn-tile', isTenpaiWait&&'tenpai-wait', small&&'tile-small'].filter(Boolean).join(' ')
  return (
    <div className={cls} onClick={onClick} title={`${tile.suit} ${label}`}>
      <span className="tile-symbol">{sym}</span>
      <span className="tile-label" style={{color: col}}>{label}</span>
    </div>
  )
}

// ─── Setup Screen ────────────────────────────────────────────────────────────
function SetupScreen({ onStart }) {
  const stratKeys = Object.keys(AI_STRATEGIES)
  const [aiStrats, setAiStrats] = useState(['aggressive', 'defensive', 'greedy'])

  const setStrat = (playerIdx, strat) => {
    setAiStrats(prev => prev.map((s,i)=>i===playerIdx?strat:s))
  }

  return (
    <div className="setup-screen">
      <div className="setup-card">
        <div className="setup-title">🀄 麻将</div>
        <div className="setup-subtitle">Japanese Riichi Mahjong · 4-Player · Play vs AI</div>

        <div className="setup-section">
          <div className="setup-label">AI Opponents</div>
          <div className="ai-player-setup">
            {[0,1,2].map(i => (
              <div key={i} className="ai-player-row">
                <div className="ai-player-name">Seat {['East','South','West'][i]}</div>
                <div className="ai-strat-pills">
                  {stratKeys.map(k => (
                    <button
                      key={k}
                      className={`strat-pill${aiStrats[i]===k?' active':''}`}
                      onClick={() => setStrat(i, k)}
                    >
                      {AI_STRATEGIES[k].emoji} {AI_STRATEGIES[k].name.split(' ')[0]}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="setup-section">
          <div className="setup-label">AI Strategy Guide</div>
          <div className="strategy-grid">
            {stratKeys.map(k => {
              const s = AI_STRATEGIES[k]
              return (
                <div key={k} className="strategy-card">
                  <div className="strat-header">
                    <span className="strat-emoji">{s.emoji}</span>
                    <span className="strat-name">{s.name}</span>
                  </div>
                  <div className="strat-desc">{s.description}</div>
                </div>
              )
            })}
          </div>
        </div>

        <button className="btn btn-primary" style={{width:'100%',padding:'14px'}} onClick={()=>onStart(aiStrats)}>
          🀄 Start Game
        </button>
      </div>
    </div>
  )
}

// ─── Discard Pile ────────────────────────────────────────────────────────────
function DiscardPile({ tiles, label, lastDiscard, onClaimDiscard, canClaim }) {
  return (
    <div className="discard-pile">
      <div className="discard-pile-label">{label}</div>
      <div className="discard-tiles">
        {tiles.map((t,i) => {
          const isLast = lastDiscard && t.id === lastDiscard.id && i === tiles.length-1
          const isClaimable = isLast && canClaim
          return (
            <div
              key={t.id}
              className={`discard-tile${isLast?' last-discard':''}${isClaimable?' claimable':''}`}
              onClick={isClaimable ? onClaimDiscard : undefined}
              title={isClaimable ? 'Click to claim!' : undefined}
            >
              {tileSymbol(t)}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Win Overlay ─────────────────────────────────────────────────────────────
function WinOverlay({ state, onNewGame }) {
  const { winner, scores } = state
  const isDraw = winner === -1
  const winnerName = isDraw ? 'Nobody' : (winner === 0 ? 'You' : PLAYER_NAMES[winner])
  const emoji = isDraw ? '🤝' : winner === 0 ? '🏆' : AI_STRATEGIES[state.aiStrategies[winner-1]]?.emoji || '🎴'

  return (
    <div className="overlay">
      <div className="win-card">
        <div className="win-emoji">{emoji}</div>
        <div className="win-title">{isDraw ? 'Draw Game!' : winner===0 ? 'You Won!' : `${winnerName} Wins!`}</div>
        <div className="win-subtitle">
          {isDraw ? 'The wall was exhausted — no winner this round.' :
           winner===0 ? 'Excellent play! Your tiles aligned perfectly.' :
           `${PLAYER_NAMES[winner]} (${AI_STRATEGIES[state.aiStrategies[winner-1]]?.name}) claims victory.`}
        </div>
        <div className="win-scores">
          {scores.map((s,i) => (
            <div key={i} className="win-score-item">
              <div className="win-score-name">{i===0?'You':PLAYER_NAMES[i]}</div>
              <div className="win-score-val" style={{color: i===winner?'#f1c40f':'var(--gold-light)'}}>{s}</div>
            </div>
          ))}
        </div>
        <div style={{display:'flex',gap:'10px',justifyContent:'center'}}>
          <button className="btn btn-primary" onClick={onNewGame}>New Game</button>
        </div>
      </div>
    </div>
  )
}

// ─── Main App ────────────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState('setup') // setup | game
  const [state, setState] = useState(null)
  const [aiStrategies, setAiStrategies] = useState(['aggressive','defensive','greedy'])
  const [selectedTile, setSelectedTile] = useState(null)
  const logRef = useRef(null)

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [state?.log])

  const startGame = useCallback((strats) => {
    setAiStrategies(strats)
    const g = initGame(strats)
    setState(g)
    setScreen('game')
    setSelectedTile(null)
  }, [])

  // AI auto-play loop
  useEffect(() => {
    if (!state || state.phase === 'finished') return
    if (state.currentPlayer !== 0) {
      const timeout = setTimeout(() => {
        setState(prev => {
          if (!prev || prev.currentPlayer === 0) return prev
          let s = prev
          // Run AI turn(s) until it's player's turn or game ends
          s = aiTurn(s)
          return s
        })
      }, 600 + Math.random() * 400)
      return () => clearTimeout(timeout)
    }
    // Player's turn to draw
    if (state.currentPlayer === 0 && state.phase === 'draw' && !state.drawnTile) {
      const timeout = setTimeout(() => {
        setState(prev => prev && prev.phase === 'draw' && prev.currentPlayer === 0 ? drawTile(prev) : prev)
      }, 300)
      return () => clearTimeout(timeout)
    }
  }, [state])

  const handleTileClick = (tile) => {
    if (!state || state.currentPlayer !== 0 || state.phase !== 'discard') return
    if (selectedTile?.id === tile.id) {
      // Double-click = discard
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

  return (
    <div className="app">
      {state?.phase === 'finished' && (
        <WinOverlay state={state} onNewGame={() => startGame(aiStrategies)} />
      )}

      {/* Header */}
      <div className="header">
        <h1>🀄 麻将 Mahjong</h1>
        <div className="scores">
          {state?.scores.map((s,i) => (
            <div key={i} className={`score-pill${i===0?' you':''}`}>
              {i===0?'You':PLAYER_NAMES[i]}: {s}
            </div>
          ))}
        </div>
        <button className="btn btn-ghost" style={{fontSize:'0.75rem'}} onClick={()=>setScreen('setup')}>
          ⚙ Setup
        </button>
      </div>

      {/* Table */}
      <div className="table">
        {/* Top AI (player 2 - South) */}
        <div className="ai-panel top">
          <div>
            <div className="ai-name">{AI_STRATEGIES[state?.aiStrategies[1]]?.emoji} {PLAYER_NAMES[2]}</div>
            <div className="ai-strategy">{AI_STRATEGIES[state?.aiStrategies[1]]?.name}</div>
            <div className="ai-tile-count">{state?.hands[2]?.length} tiles</div>
          </div>
          <div className="ai-tiles-hidden">
            {state?.hands[2]?.map(t => <div key={t.id} className="ai-tile-back" />)}
          </div>
          <DiscardPile tiles={state?.discards[2]||[]} label="South discards" lastDiscard={null} canClaim={false} />
        </div>

        {/* Left AI (player 1 - East) */}
        <div className="ai-panel left">
          <div className="ai-name">{AI_STRATEGIES[state?.aiStrategies[0]]?.emoji} {PLAYER_NAMES[1]}</div>
          <div className="ai-strategy">{AI_STRATEGIES[state?.aiStrategies[0]]?.name}</div>
          <div className="ai-tile-count">{state?.hands[1]?.length} tiles</div>
          <div className="ai-tiles-hidden" style={{marginTop:'4px'}}>
            {state?.hands[1]?.map(t => <div key={t.id} className="ai-tile-back" />)}
          </div>
          <div style={{marginTop:'6px'}}>
            <DiscardPile tiles={state?.discards[1]||[]} label="East discards" lastDiscard={null} canClaim={false} />
          </div>
        </div>

        {/* Center */}
        <div className="center">
          <div className="center-info">
            <div className="wind-indicator">🀀</div>
            <div className="wall-count">Wall: {state?.wall?.length || 0} tiles</div>
            {state?.currentPlayer !== undefined && (
              <div style={{fontSize:'0.7rem',color:'var(--gold-light)',marginTop:'4px'}}>
                {isPlayerTurn ? '⭐ Your turn' : `${PLAYER_NAMES[state.currentPlayer]}'s turn`}
              </div>
            )}
          </div>

          <div className="discards-area">
            <DiscardPile
              tiles={state?.discards[0]||[]}
              label="Your discards"
              lastDiscard={null}
              canClaim={false}
            />
            <DiscardPile
              tiles={state?.discards[3]||[]}
              label="West discards"
              lastDiscard={state?.lastDiscard}
              onClaimDiscard={handleClaim}
              canClaim={canClaim}
            />
          </div>

          <div className="status-log" ref={logRef}>
            {state?.log?.slice(-20).map((entry,i) => (
              <div key={i} className="log-entry">{entry}</div>
            ))}
          </div>
        </div>

        {/* Right AI (player 3 - West) */}
        <div className="ai-panel right">
          <div className="ai-name">{AI_STRATEGIES[state?.aiStrategies[2]]?.emoji} {PLAYER_NAMES[3]}</div>
          <div className="ai-strategy">{AI_STRATEGIES[state?.aiStrategies[2]]?.name}</div>
          <div className="ai-tile-count">{state?.hands[3]?.length} tiles</div>
          <div className="ai-tiles-hidden" style={{marginTop:'4px'}}>
            {state?.hands[3]?.map(t => <div key={t.id} className="ai-tile-back" />)}
          </div>
          <div style={{marginTop:'6px'}}>
            <DiscardPile tiles={state?.discards[3]||[]} label="West discards" lastDiscard={state?.lastDiscard} onClaimDiscard={handleClaim} canClaim={canClaim} />
          </div>
        </div>

        {/* Bottom: Player hand */}
        <div className="player-area">
          <div className="player-label">
            Your Hand ({playerHand.length} tiles)
            {state?.tenpaiTiles?.length > 0 && (
              <span className="tenpai-badge">✨ Tenpai! Waiting for {state.tenpaiTiles.length} tile types</span>
            )}
            {canDiscard && !selectedTile && (
              <span style={{fontSize:'0.7rem',color:'rgba(245,240,232,0.5)'}}>
                — Click a tile to select, click again to discard
              </span>
            )}
          </div>
          <div className="player-hand">
            {playerHand.map((tile, i) => {
              const isDrawn = drawnTile && tile.id === drawnTile.id
              const isTenpai = state?.tenpaiTiles?.some(t => tileKey(t) === tileKey(tile))
              return (
                <Tile
                  key={tile.id}
                  tile={tile}
                  onClick={() => handleTileClick(tile)}
                  selected={selectedTile?.id === tile.id}
                  isDrawn={isDrawn}
                  isTenpaiWait={isTenpai}
                />
              )
            })}
          </div>
          <div className="actions">
            <button
              className="btn btn-danger"
              disabled={!selectedTile || !canDiscard}
              onClick={handleDiscard}
            >
              Discard Selected
            </button>
            {canClaim && (
              <button className="btn btn-success" onClick={handleClaim}>
                🀄 Claim Discard (Ron!)
              </button>
            )}
            <button className="btn btn-ghost" onClick={() => startGame(aiStrategies)}>
              New Game
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
