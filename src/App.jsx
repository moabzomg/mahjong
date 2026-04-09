import { useState, useEffect, useCallback, useRef } from 'react'
import { AI_STRATEGIES } from './ai/strategies.js'
import { initGame, drawTile, playerDiscard, aiTurn, playerClaimDiscard } from './game/gameEngine.js'
import { tileSymbol, tileColor, tileLabel, tileKey, SUITS } from './game/tiles.js'
import { translations } from './i18n.js'

// ─── Language Context ─────────────────────────────────────────────────────────
function useLang() {
  const [lang, setLang] = useState('en')
  const T = translations[lang]
  const toggle = () => setLang(l => l === 'en' ? 'yue' : 'en')
  return { lang, T, toggle }
}

// ─── Language Toggle Button ───────────────────────────────────────────────────
function LangToggle({ lang, onToggle }) {
  return (
    <button className="btn lang-toggle" onClick={onToggle} title="切換語言 / Switch language">
      {lang === 'en' ? '粵語' : 'English'}
    </button>
  )
}

// ─── Tile Component ───────────────────────────────────────────────────────────
function Tile({ tile, onClick, selected, isDrawn, isTenpaiWait }) {
  const sym = tileSymbol(tile)
  const col = tileColor(tile)
  const label = SUITS.includes(tile.suit) ? tile.value : tileLabel(tile)
  const cls = ['tile', selected && 'selected', isDrawn && 'drawn-tile', isTenpaiWait && 'tenpai-wait'].filter(Boolean).join(' ')
  return (
    <div className={cls} onClick={onClick} title={`${tile.suit} ${label}`}>
      <span className="tile-symbol">{sym}</span>
      <span className="tile-label" style={{ color: col }}>{label}</span>
    </div>
  )
}

// ─── Setup Screen ─────────────────────────────────────────────────────────────
function SetupScreen({ onStart, lang, onToggleLang }) {
  const T = translations[lang]
  const stratKeys = Object.keys(AI_STRATEGIES)
  const [aiStrats, setAiStrats] = useState(['aggressive', 'defensive', 'greedy'])
  const seats = [T.seatEast, T.seatSouth, T.seatWest]

  const setStrat = (i, strat) => setAiStrats(prev => prev.map((s, j) => j === i ? strat : s))

  return (
    <div className="setup-screen">
      <div className="setup-card">
        <div className="lang-toggle-row">
          <LangToggle lang={lang} onToggle={onToggleLang} />
        </div>
        <div className="setup-title">{T.setupTitle}</div>
        <div className="setup-subtitle">{T.setupSubtitle}</div>

        <div className="setup-section">
          <div className="setup-label">{T.aiOpponents}</div>
          <div className="ai-player-setup">
            {[0, 1, 2].map(i => (
              <div key={i} className="ai-player-row">
                <div className="ai-player-name">{seats[i]}</div>
                <div className="ai-strat-pills">
                  {stratKeys.map(k => (
                    <button
                      key={k}
                      className={`strat-pill${aiStrats[i] === k ? ' active' : ''}`}
                      onClick={() => setStrat(i, k)}
                    >
                      {AI_STRATEGIES[k].emoji} {T.strategies[k].name.split(' ')[0]}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="setup-section">
          <div className="setup-label">{T.strategyGuide}</div>
          <div className="strategy-grid">
            {stratKeys.map(k => (
              <div key={k} className="strategy-card">
                <div className="strat-header">
                  <span className="strat-emoji">{AI_STRATEGIES[k].emoji}</span>
                  <span className="strat-name">{T.strategies[k].name}</span>
                </div>
                <div className="strat-desc">{T.strategies[k].description}</div>
              </div>
            ))}
          </div>
        </div>

        <button className="btn btn-primary" style={{ width: '100%', padding: '14px' }} onClick={() => onStart(aiStrats)}>
          {T.startGame}
        </button>
      </div>
    </div>
  )
}

// ─── Discard Pile ─────────────────────────────────────────────────────────────
function DiscardPile({ tiles, label, lastDiscard, onClaimDiscard, canClaim, claimTooltip }) {
  return (
    <div className="discard-pile">
      <div className="discard-pile-label">{label}</div>
      <div className="discard-tiles">
        {tiles.map((t, i) => {
          const isLast = lastDiscard && t.id === lastDiscard.id && i === tiles.length - 1
          const isClaimable = isLast && canClaim
          return (
            <div
              key={t.id}
              className={`discard-tile${isLast ? ' last-discard' : ''}${isClaimable ? ' claimable' : ''}`}
              onClick={isClaimable ? onClaimDiscard : undefined}
              title={isClaimable ? claimTooltip : undefined}
            >
              {tileSymbol(t)}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Win Overlay ──────────────────────────────────────────────────────────────
function WinOverlay({ state, onNewGame, T }) {
  const { winner, scores } = state
  const isDraw = winner === -1
  const pnames = T.playerNames
  const winnerName = isDraw ? T.nobody : pnames[winner]
  const emoji = isDraw ? '🤝' : winner === 0 ? '🏆' : AI_STRATEGIES[state.aiStrategies[winner - 1]]?.emoji || '🎴'

  const title = isDraw ? T.drawGame : winner === 0 ? T.youWon : T.wins(winnerName)
  const subtitle = isDraw
    ? T.drawDesc
    : winner === 0
    ? T.youWonDesc
    : T.aiWonDesc(pnames[winner], T.strategies[state.aiStrategies[winner - 1]]?.name)

  return (
    <div className="overlay">
      <div className="win-card">
        <div className="win-emoji">{emoji}</div>
        <div className="win-title">{title}</div>
        <div className="win-subtitle">{subtitle}</div>
        <div className="win-scores">
          {scores.map((s, i) => (
            <div key={i} className="win-score-item">
              <div className="win-score-name">{pnames[i]}</div>
              <div className="win-score-val" style={{ color: i === winner ? '#f1c40f' : 'var(--gold-light)' }}>{s}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
          <button className="btn btn-primary" onClick={onNewGame}>{T.newGame}</button>
        </div>
      </div>
    </div>
  )
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const { lang, T, toggle: toggleLang } = useLang()
  const [screen, setScreen] = useState('setup')
  const [state, setState] = useState(null)
  const [aiStrategies, setAiStrategies] = useState(['aggressive', 'defensive', 'greedy'])
  const [selectedTile, setSelectedTile] = useState(null)
  const logRef = useRef(null)

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [state?.log])

  const startGame = useCallback((strats, currentT) => {
    const usedT = currentT || T
    setAiStrategies(strats)
    const g = initGame(strats, usedT)
    setState(g)
    setScreen('game')
    setSelectedTile(null)
  }, [T])

  // AI auto-play loop
  useEffect(() => {
    if (!state || state.phase === 'finished') return
    if (state.currentPlayer !== 0) {
      const timeout = setTimeout(() => {
        setState(prev => {
          if (!prev || prev.currentPlayer === 0) return prev
          return aiTurn(prev, T)
        })
      }, 600 + Math.random() * 400)
      return () => clearTimeout(timeout)
    }
    if (state.currentPlayer === 0 && state.phase === 'draw' && !state.drawnTile) {
      const timeout = setTimeout(() => {
        setState(prev => prev && prev.phase === 'draw' && prev.currentPlayer === 0 ? drawTile(prev, T) : prev)
      }, 300)
      return () => clearTimeout(timeout)
    }
  }, [state, T])

  const handleTileClick = (tile) => {
    if (!state || state.currentPlayer !== 0 || state.phase !== 'discard') return
    if (selectedTile?.id === tile.id) {
      setState(prev => playerDiscard(prev, tile.id, T))
      setSelectedTile(null)
    } else {
      setSelectedTile(tile)
    }
  }

  const handleDiscard = () => {
    if (!selectedTile || !state) return
    setState(prev => playerDiscard(prev, selectedTile.id, T))
    setSelectedTile(null)
  }

  const handleClaim = () => {
    if (!state) return
    setState(prev => playerClaimDiscard(prev, T))
  }

  const canClaim = state && state.lastDiscardPlayer !== 0 && state.currentPlayer !== 0
    && state.phase === 'draw' && state.lastDiscard

  if (screen === 'setup') {
    return <SetupScreen onStart={(strats) => startGame(strats, T)} lang={lang} onToggleLang={toggleLang} />
  }

  const pnames = T.playerNames
  const playerHand = state?.hands[0] || []
  const isPlayerTurn = state?.currentPlayer === 0
  const canDiscard = isPlayerTurn && state.phase === 'discard'
  const drawnTile = state?.drawnTile

  return (
    <div className="app">
      {state?.phase === 'finished' && (
        <WinOverlay state={state} onNewGame={() => startGame(aiStrategies, T)} T={T} />
      )}

      {/* Header */}
      <div className="header">
        <h1>{T.appTitle}</h1>
        <div className="scores">
          {state?.scores.map((s, i) => (
            <div key={i} className={`score-pill${i === 0 ? ' you' : ''}`}>
              {pnames[i]}: {s}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <LangToggle lang={lang} onToggle={toggleLang} />
          <button className="btn btn-ghost" style={{ fontSize: '0.75rem' }} onClick={() => setScreen('setup')}>
            {T.setup}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="table">
        {/* Top AI — South */}
        <div className="ai-panel top">
          <div>
            <div className="ai-name">{AI_STRATEGIES[state?.aiStrategies[1]]?.emoji} {pnames[2]}</div>
            <div className="ai-strategy">{T.strategies[state?.aiStrategies[1]]?.name}</div>
            <div className="ai-tile-count">{state?.hands[2]?.length} {T.tiles}</div>
          </div>
          <div className="ai-tiles-hidden">
            {state?.hands[2]?.map(t => <div key={t.id} className="ai-tile-back" />)}
          </div>
          <DiscardPile tiles={state?.discards[2] || []} label={T.southDiscards} lastDiscard={null} canClaim={false} claimTooltip={T.claimTooltip} />
        </div>

        {/* Left AI — East */}
        <div className="ai-panel left">
          <div className="ai-name">{AI_STRATEGIES[state?.aiStrategies[0]]?.emoji} {pnames[1]}</div>
          <div className="ai-strategy">{T.strategies[state?.aiStrategies[0]]?.name}</div>
          <div className="ai-tile-count">{state?.hands[1]?.length} {T.tiles}</div>
          <div className="ai-tiles-hidden" style={{ marginTop: '4px' }}>
            {state?.hands[1]?.map(t => <div key={t.id} className="ai-tile-back" />)}
          </div>
          <div style={{ marginTop: '6px' }}>
            <DiscardPile tiles={state?.discards[1] || []} label={T.eastDiscards} lastDiscard={null} canClaim={false} claimTooltip={T.claimTooltip} />
          </div>
        </div>

        {/* Center */}
        <div className="center">
          <div className="center-info">
            <div className="wind-indicator">🀀</div>
            <div className="wall-count">{T.wall}: {state?.wall?.length || 0} {T.tiles}</div>
            {state?.currentPlayer !== undefined && (
              <div style={{ fontSize: '0.7rem', color: 'var(--gold-light)', marginTop: '4px' }}>
                {isPlayerTurn ? T.yourTurn : T.turnOf(pnames[state.currentPlayer])}
              </div>
            )}
          </div>

          <div className="discards-area">
            <DiscardPile tiles={state?.discards[0] || []} label={T.yourDiscards} lastDiscard={null} canClaim={false} claimTooltip={T.claimTooltip} />
            <DiscardPile tiles={state?.discards[3] || []} label={T.westDiscards} lastDiscard={state?.lastDiscard} onClaimDiscard={handleClaim} canClaim={canClaim} claimTooltip={T.claimTooltip} />
          </div>

          <div className="status-log" ref={logRef}>
            {state?.log?.slice(-20).map((entry, i) => (
              <div key={i} className="log-entry">{entry}</div>
            ))}
          </div>
        </div>

        {/* Right AI — West */}
        <div className="ai-panel right">
          <div className="ai-name">{AI_STRATEGIES[state?.aiStrategies[2]]?.emoji} {pnames[3]}</div>
          <div className="ai-strategy">{T.strategies[state?.aiStrategies[2]]?.name}</div>
          <div className="ai-tile-count">{state?.hands[3]?.length} {T.tiles}</div>
          <div className="ai-tiles-hidden" style={{ marginTop: '4px' }}>
            {state?.hands[3]?.map(t => <div key={t.id} className="ai-tile-back" />)}
          </div>
          <div style={{ marginTop: '6px' }}>
            <DiscardPile tiles={state?.discards[3] || []} label={T.westDiscards} lastDiscard={state?.lastDiscard} onClaimDiscard={handleClaim} canClaim={canClaim} claimTooltip={T.claimTooltip} />
          </div>
        </div>

        {/* Player hand */}
        <div className="player-area">
          <div className="player-label">
            {T.yourHand(playerHand.length)}
            {state?.tenpaiTiles?.length > 0 && (
              <span className="tenpai-badge">{T.tenpai(state.tenpaiTiles.length)}</span>
            )}
            {canDiscard && !selectedTile && (
              <span style={{ fontSize: '0.7rem', color: 'rgba(245,240,232,0.5)' }}>
                {T.clickHint}
              </span>
            )}
          </div>
          <div className="player-hand">
            {playerHand.map((tile) => {
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
            <button className="btn btn-danger" disabled={!selectedTile || !canDiscard} onClick={handleDiscard}>
              {T.discardSelected}
            </button>
            {canClaim && (
              <button className="btn btn-success" onClick={handleClaim}>
                {T.claimDiscard}
              </button>
            )}
            <button className="btn btn-ghost" onClick={() => startGame(aiStrategies, T)}>
              {T.newGame}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
