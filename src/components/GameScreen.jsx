import React, { useState, useEffect, useCallback, useRef } from 'react';
import Tile from './Tile.jsx';
import PlayerHand from './PlayerHand.jsx';
import GameLog from './GameLog.jsx';
import { createInitialState, drawTile, discardTile, runAITurn, getAvailableClaims, claimTile, addLog } from '../game/gameState.js';
import { checkWin, canPung, canKong, canChow, getTenpaiTiles, sortHand, SUITS, tilesEqual } from '../game/engine.js';
import { AI_STRATEGIES, makeClaimDecision } from '../game/ai.js';

const AI_TURN_DELAY = 900;
const AI_CLAIM_DELAY = 600;

export default function GameScreen({ config, onBackToMenu }) {
  const [gameState, setGameState] = useState(() =>
    createInitialState(config.aiStrategies)
  );
  const [isSimulating, setIsSimulating] = useState(config.mode === 'ai-sim');
  const [claimOptions, setClaimOptions] = useState(null);
  const [winDialog, setWinDialog] = useState(null);
  const timerRef = useRef(null);

  const isSimMode = config.mode === 'ai-sim';
  const humanPlayer = gameState.players[0];
  const isHumanTurn = gameState.currentPlayer === 0 && !isSimMode;
  const needsDraw = gameState.currentPlayerNeedsDraw;

  // ───── SIMULATION LOOP ─────
  useEffect(() => {
    if (gameState.phase === 'won' || gameState.phase === 'draw') {
      setWinDialog({ winner: gameState.winner, winResult: gameState.winResult, phase: gameState.phase });
      return;
    }
    if (!isSimulating) return;
    if (claimOptions) return;

    timerRef.current = setTimeout(() => {
      setGameState(prev => {
        let next = prev;

        // Draw if needed
        if (next.currentPlayerNeedsDraw) {
          next = drawTile(next, next.currentPlayer);
          if (next.phase === 'draw' || next.phase === 'won') return next;
        }

        const player = next.players[next.currentPlayer];

        // Check win for current player
        const win = checkWin(player.hand, player.openMelds);
        if (win) {
          return addLog({
            ...next,
            phase: 'won',
            winner: next.currentPlayer,
            winResult: win,
          }, `🎉 ${player.name} wins by self-draw!`);
        }

        // Find best discard for this player
        const strategy = player.strategy || AI_STRATEGIES[1];
        const discard = getBestDiscardForPlayer(player.hand, player.openMelds, strategy);
        next = discardTile(next, next.currentPlayer, discard);

        // Check if any player can claim this discard
        const claims = getAvailableClaims(next, next.lastDiscard, next.lastDiscardBy);
        const winningClaim = claims.find(c => c.claims.includes('win'));
        if (winningClaim) {
          const winPlayer = winningClaim.playerIndex;
          const tile = next.lastDiscard;
          const hand = next.players[winPlayer].hand;
          const w = checkWin([...hand, tile], next.players[winPlayer].openMelds);
          return addLog({
            ...next,
            phase: 'won',
            winner: winPlayer,
            winResult: w,
          }, `🎉 ${next.players[winPlayer].name} wins by Ron!`);
        }

        // Check if any AI wants to claim
        const bestClaim = findBestClaim(claims, next);
        if (bestClaim) {
          setClaimOptions({ ...bestClaim, auto: true });
          return next;
        }

        // Move to next player
        const nextPlayer = (next.currentPlayer + 1) % 4;
        return { ...next, currentPlayer: nextPlayer, currentPlayerNeedsDraw: true };
      });
    }, AI_TURN_DELAY);

    return () => clearTimeout(timerRef.current);
  }, [gameState, isSimulating, claimOptions]);

  // ───── AUTO-CLAIM RESOLUTION ─────
  useEffect(() => {
    if (!claimOptions?.auto) return;
    timerRef.current = setTimeout(() => {
      setGameState(prev => {
        const { playerIndex, claimType, combo } = claimOptions;
        let next = claimTile(prev, playerIndex, claimType, combo);

        // After kong, player draws again
        if (claimType === 'kong') {
          next = drawTile(next, playerIndex);
        }

        // Player now needs to discard
        const player = next.players[playerIndex];
        const strategy = player.strategy || AI_STRATEGIES[1];
        const discard = getBestDiscardForPlayer(player.hand, player.openMelds, strategy);
        next = discardTile(next, playerIndex, discard);

        // Check win claims for this discard
        const newClaims = getAvailableClaims(next, next.lastDiscard, next.lastDiscardBy);
        const winClaim = newClaims.find(c => c.claims.includes('win'));
        if (winClaim) {
          const tile = next.lastDiscard;
          const w = checkWin([...next.players[winClaim.playerIndex].hand, tile], next.players[winClaim.playerIndex].openMelds);
          setClaimOptions(null);
          return addLog({ ...next, phase: 'won', winner: winClaim.playerIndex, winResult: w },
            `🎉 ${next.players[winClaim.playerIndex].name} wins by Ron!`);
        }

        const nextPlayer = (playerIndex + 1) % 4;
        setClaimOptions(null);
        return { ...next, currentPlayer: nextPlayer, currentPlayerNeedsDraw: true };
      });
    }, AI_CLAIM_DELAY);
    return () => clearTimeout(timerRef.current);
  }, [claimOptions]);

  // ───── HUMAN vs AI LOOP ─────
  useEffect(() => {
    if (isSimMode) return;
    if (gameState.phase === 'won' || gameState.phase === 'draw') {
      setWinDialog({ winner: gameState.winner, winResult: gameState.winResult, phase: gameState.phase });
      return;
    }
    if (claimOptions) return;
    if (gameState.currentPlayer === 0) return; // Human turn

    // AI turn
    timerRef.current = setTimeout(() => {
      setGameState(prev => {
        let next = prev;
        if (next.currentPlayerNeedsDraw) {
          next = drawTile(next, next.currentPlayer);
          if (next.phase !== 'playing') return next;
        }

        const player = next.players[next.currentPlayer];
        const win = checkWin(player.hand, player.openMelds);
        if (win) {
          return addLog({ ...next, phase: 'won', winner: next.currentPlayer, winResult: win },
            `🎉 ${player.name} wins by self-draw!`);
        }

        const strategy = player.strategy || AI_STRATEGIES[1];
        const discard = getBestDiscardForPlayer(player.hand, player.openMelds, strategy);
        next = discardTile(next, next.currentPlayer, discard);

        // Check if human or other AIs can claim
        const claims = getAvailableClaims(next, next.lastDiscard, next.lastDiscardBy);

        // Win claim for human
        const humanClaim = claims.find(c => c.playerIndex === 0 && c.claims.includes('win'));
        if (humanClaim) {
          const tile = next.lastDiscard;
          const w = checkWin([...next.players[0].hand, tile], next.players[0].openMelds);
          return addLog({ ...next, phase: 'won', winner: 0, winResult: w }, `🎉 You win by Ron!`);
        }

        // Check if human has claim options
        const humanOptions = claims.find(c => c.playerIndex === 0);
        if (humanOptions) {
          setClaimOptions({ playerIndex: 0, availableClaims: humanOptions.claims, isHumanChoice: true });
          return next;
        }

        // Check AI claims (skip human)
        const aiClaims = claims.filter(c => c.playerIndex !== 0);
        const bestAiClaim = findBestClaim(aiClaims, next);
        if (bestAiClaim) {
          setClaimOptions({ ...bestAiClaim, auto: true });
          return next;
        }

        const nextPlayer = (next.currentPlayer + 1) % 4;
        return { ...next, currentPlayer: nextPlayer, currentPlayerNeedsDraw: true };
      });
    }, AI_TURN_DELAY);

    return () => clearTimeout(timerRef.current);
  }, [gameState, isSimMode, claimOptions]);

  // ───── HUMAN DRAW ─────
  function handleHumanDraw() {
    if (!isHumanTurn || !needsDraw) return;
    setGameState(prev => drawTile(prev, 0));
  }

  // ───── HUMAN DISCARD ─────
  const [selectedTile, setSelectedTile] = useState(null);

  function handleTileClick(tile) {
    if (!isHumanTurn || needsDraw) return;
    if (selectedTile === tile) {
      // Discard it
      const hand = gameState.players[0].hand;
      const openMelds = gameState.players[0].openMelds;

      // Check if discarding creates a win for any opponent
      let next = discardTile(gameState, 0, tile);
      setSelectedTile(null);

      const claims = getAvailableClaims(next, next.lastDiscard, 0);
      const winClaim = claims.find(c => c.claims.includes('win'));
      if (winClaim) {
        const w = checkWin([...next.players[winClaim.playerIndex].hand, next.lastDiscard], next.players[winClaim.playerIndex].openMelds);
        next = addLog({ ...next, phase: 'won', winner: winClaim.playerIndex, winResult: w },
          `🎉 ${next.players[winClaim.playerIndex].name} wins by Ron!`);
        setGameState(next);
        return;
      }

      // AI claims
      const aiClaims = claims.filter(c => c.playerIndex !== 0);
      const bestAiClaim = findBestClaim(aiClaims, next);
      if (bestAiClaim) {
        setClaimOptions({ ...bestAiClaim, auto: true });
        setGameState(next);
        return;
      }

      next = { ...next, currentPlayer: 1, currentPlayerNeedsDraw: true };
      setGameState(next);
    } else {
      setSelectedTile(tile);
    }
  }

  // ───── HUMAN WIN DECLARATION ─────
  function handleDeclareWin() {
    const hand = gameState.players[0].hand;
    const win = checkWin(hand, gameState.players[0].openMelds);
    if (win) {
      setGameState(prev => addLog({ ...prev, phase: 'won', winner: 0, winResult: win }, '🎉 You declare Mahjong!'));
    }
  }

  // ───── HUMAN CLAIM ─────
  function handleHumanClaim(claimType) {
    if (claimType === 'pass') {
      setClaimOptions(null);
      setGameState(prev => {
        const nextPlayer = (prev.currentPlayer + 1) % 4;
        return { ...prev, currentPlayer: nextPlayer === 0 ? 1 : nextPlayer, currentPlayerNeedsDraw: true };
      });
      return;
    }

    const tile = gameState.lastDiscard;
    const hand = gameState.players[0].hand;

    if (claimType === 'chow') {
      const combos = canChow(hand, tile);
      if (combos.length > 0) {
        let next = claimTile(gameState, 0, 'chow', combos[0]);
        setClaimOptions(null);
        setGameState(next);
      }
      return;
    }

    let next = claimTile(gameState, 0, claimType, []);
    if (claimType === 'kong') next = drawTile(next, 0);
    setClaimOptions(null);
    setGameState(next);
  }

  // ───── HELPERS ─────
  const tenpaiTiles = (!isSimMode && isHumanTurn && !needsDraw)
    ? getTenpaiTiles(humanPlayer.hand, humanPlayer.openMelds)
    : [];

  const canDeclareWin = isHumanTurn && !needsDraw && checkWin(humanPlayer.hand, humanPlayer.openMelds);

  function newGame() {
    setWinDialog(null);
    setClaimOptions(null);
    setSelectedTile(null);
    setGameState(createInitialState(config.aiStrategies));
  }

  // Wall remaining
  const wallRemaining = Math.max(0, gameState.wall.length - 14 - gameState.wallIndex);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', padding: 12, maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={onBackToMenu} style={btnStyle('ghost')}>← Menu</button>
          <span style={{ fontFamily: "'Cinzel Decorative', serif", color: '#c9a84c', fontSize: 14 }}>
            {isSimMode ? '🤖 AI Simulation' : '🀄 Mahjong'} · Round {gameState.round}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ fontSize: 12, color: 'rgba(245,240,232,0.5)' }}>
            Wall: {wallRemaining} tiles
          </div>
          {isSimMode && (
            <button
              onClick={() => setIsSimulating(s => !s)}
              style={btnStyle(isSimulating ? 'danger' : 'gold')}
            >
              {isSimulating ? '⏸ Pause' : '▶ Resume'}
            </button>
          )}
          <button onClick={newGame} style={btnStyle('ghost')}>New Game</button>
        </div>
      </div>

      {/* Scores */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, justifyContent: 'center' }}>
        {gameState.players.map((p, i) => (
          <div key={i} style={{
            background: gameState.currentPlayer === i
              ? 'rgba(201,168,76,0.2)'
              : 'rgba(0,0,0,0.2)',
            border: gameState.currentPlayer === i
              ? '1px solid rgba(201,168,76,0.5)'
              : '1px solid rgba(255,255,255,0.07)',
            borderRadius: 8,
            padding: '6px 14px',
            textAlign: 'center',
            minWidth: 100,
            transition: 'all 0.3s',
          }}>
            <div style={{ fontSize: 11, color: 'rgba(245,240,232,0.5)', fontFamily: "'Crimson Pro', serif" }}>
              {p.isHuman ? '👤' : p.strategy?.emoji || '🤖'} {p.name}
            </div>
            <div style={{ fontSize: 13, color: '#c9a84c', fontWeight: 600 }}>
              {p.score} pts
            </div>
            {!p.isHuman && p.strategy && (
              <div style={{ fontSize: 10, color: p.strategy.color, fontFamily: "'Cinzel Decorative', serif" }}>
                {p.strategy.name}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Main Game Area */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 280px', gap: 12 }}>
        {/* Board */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Opponent hands */}
          {[1, 2, 3].map(idx => (
            <div key={idx} style={{
              background: gameState.currentPlayer === idx ? 'rgba(201,168,76,0.08)' : 'rgba(0,0,0,0.15)',
              borderRadius: 12,
              padding: '12px 16px',
              border: gameState.currentPlayer === idx ? '1px solid rgba(201,168,76,0.3)' : '1px solid rgba(255,255,255,0.05)',
              transition: 'all 0.3s',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontSize: 12, color: 'rgba(245,240,232,0.5)', fontFamily: "'Crimson Pro', serif" }}>
                  {gameState.players[idx].strategy?.emoji} {gameState.players[idx].name} ·{' '}
                  <span style={{ color: gameState.players[idx].strategy?.color || '#ccc' }}>
                    {gameState.players[idx].strategy?.name}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: 'rgba(245,240,232,0.3)' }}>
                  {gameState.players[idx].hand.length} tiles
                </div>
              </div>
              <PlayerHand
                player={gameState.players[idx]}
                isHuman={isSimMode}
                size="xs"
              />
            </div>
          ))}

          {/* Discard Pile */}
          <div style={{
            background: 'rgba(0,0,0,0.2)',
            borderRadius: 12,
            padding: '12px 16px',
            border: '1px solid rgba(255,255,255,0.06)',
            flex: 1,
          }}>
            <div style={{ fontSize: 12, color: 'rgba(245,240,232,0.4)', marginBottom: 8, fontFamily: "'Crimson Pro', serif" }}>
              Discard Pile · {gameState.discardPile.length} tiles
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, maxHeight: 130, overflowY: 'auto' }}>
              {gameState.discardPile.map((tile, i) => (
                <Tile
                  key={tile.id}
                  tile={tile}
                  size="xs"
                  highlighted={i === gameState.discardPile.length - 1}
                />
              ))}
            </div>
          </div>

          {/* Human Hand */}
          {!isSimMode && (
            <div style={{
              background: isHumanTurn ? 'rgba(201,168,76,0.1)' : 'rgba(0,0,0,0.2)',
              borderRadius: 12,
              padding: '16px',
              border: isHumanTurn ? '1px solid rgba(201,168,76,0.4)' : '1px solid rgba(255,255,255,0.05)',
              transition: 'all 0.3s',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontSize: 13, color: '#e8c96a', fontFamily: "'Cinzel Decorative', serif", letterSpacing: '0.05em' }}>
                  👤 Your Hand
                  {isHumanTurn && <span style={{ color: '#27ae60', marginLeft: 8, fontSize: 11 }}>● Your Turn</span>}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {isHumanTurn && needsDraw && (
                    <button onClick={handleHumanDraw} style={btnStyle('gold')}>
                      Draw Tile
                    </button>
                  )}
                  {canDeclareWin && (
                    <button onClick={handleDeclareWin} style={btnStyle('green')}>
                      🎉 Declare Win!
                    </button>
                  )}
                  {isHumanTurn && !needsDraw && selectedTile && (
                    <div style={{ fontSize: 11, color: 'rgba(245,240,232,0.5)', alignSelf: 'center' }}>
                      Click again to discard
                    </div>
                  )}
                </div>
              </div>

              <PlayerHand
                player={humanPlayer}
                isHuman={true}
                selectedTile={selectedTile}
                onTileClick={handleTileClick}
                canDiscard={isHumanTurn && !needsDraw}
                tenpaiTiles={tenpaiTiles}
                size="md"
              />

              {tenpaiTiles.length > 0 && !needsDraw && (
                <div style={{ marginTop: 8, fontSize: 11, color: '#c9a84c', fontFamily: "'Crimson Pro', serif" }}>
                  ✨ Tenpai! Waiting for: {tenpaiTiles.slice(0, 5).map(t => `${t.value}${t.suit[0].toUpperCase()}`).join(', ')}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <GameLog logs={gameState.logs} />

          {/* Current turn indicator */}
          <div style={{
            background: 'rgba(0,0,0,0.25)',
            borderRadius: 10,
            padding: '12px 16px',
            border: '1px solid rgba(201,168,76,0.15)',
          }}>
            <div style={{ fontSize: 11, color: 'rgba(245,240,232,0.4)', marginBottom: 4, fontFamily: "'Cinzel Decorative', serif", letterSpacing: '0.05em' }}>
              CURRENT TURN
            </div>
            <div style={{ fontSize: 15, color: '#e8c96a', fontWeight: 600 }}>
              {gameState.players[gameState.currentPlayer]?.name}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(245,240,232,0.4)', marginTop: 2 }}>
              Phase: {gameState.phase}
            </div>
          </div>

          {/* Strategy guide */}
          <div style={{
            background: 'rgba(0,0,0,0.2)',
            borderRadius: 10,
            padding: '12px 14px',
            border: '1px solid rgba(255,255,255,0.05)',
            flex: 1,
          }}>
            <div style={{ fontSize: 11, color: 'rgba(245,240,232,0.4)', marginBottom: 10, fontFamily: "'Cinzel Decorative', serif" }}>
              AI STRATEGIES
            </div>
            {AI_STRATEGIES.map((s, i) => (
              <div key={i} style={{ marginBottom: 8, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 14 }}>{s.emoji}</span>
                <div>
                  <div style={{ fontSize: 11, color: s.color, fontWeight: 600 }}>{s.name}</div>
                  <div style={{ fontSize: 10, color: 'rgba(245,240,232,0.35)', lineHeight: 1.3 }}>{s.description}</div>
                </div>
              </div>
            ))}
          </div>

          {!isSimMode && (
            <div style={{
              background: 'rgba(0,0,0,0.2)',
              borderRadius: 10,
              padding: '12px 14px',
              border: '1px solid rgba(255,255,255,0.05)',
              fontSize: 11,
              color: 'rgba(245,240,232,0.35)',
              fontFamily: "'Crimson Pro', serif",
              lineHeight: 1.6,
            }}>
              <strong style={{ color: 'rgba(245,240,232,0.5)' }}>How to play:</strong><br />
              1. Draw a tile on your turn<br />
              2. Click a tile to select, click again to discard<br />
              3. Highlighted tiles complete your hand<br />
              4. Form 4 melds + 1 pair to win
            </div>
          )}
        </div>
      </div>

      {/* Claim Window */}
      {claimOptions?.isHumanChoice && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 100, animation: 'fadeIn 0.2s ease',
        }}>
          <div style={{
            background: 'linear-gradient(135deg, #1a3d28, #0d2a1a)',
            border: '1px solid rgba(201,168,76,0.5)',
            borderRadius: 16, padding: 32,
            textAlign: 'center', minWidth: 320,
            boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
          }}>
            <div style={{ fontSize: 13, color: '#c9a84c', marginBottom: 8, fontFamily: "'Cinzel Decorative', serif" }}>
              CLAIM OPPORTUNITY
            </div>
            <div style={{ fontSize: 14, color: 'rgba(245,240,232,0.7)', marginBottom: 20 }}>
              {gameState.players[gameState.lastDiscardBy]?.name} discarded:
            </div>
            {gameState.lastDiscard && (
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
                <Tile tile={gameState.lastDiscard} size="lg" />
              </div>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
              {claimOptions.availableClaims.map(claim => (
                <button key={claim} onClick={() => handleHumanClaim(claim)} style={btnStyle('gold')}>
                  {claim === 'win' ? '🎉 Mahjong!' : claim === 'pung' ? '🔴 Pung' : claim === 'kong' ? '🟡 Kong' : '🟢 Chow'}
                </button>
              ))}
              <button onClick={() => handleHumanClaim('pass')} style={btnStyle('ghost')}>
                Pass
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Win Dialog */}
      {winDialog && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.8)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 200, animation: 'fadeIn 0.3s ease',
        }}>
          <div style={{
            background: 'linear-gradient(135deg, #1a3d28, #0d2a1a)',
            border: '2px solid #c9a84c',
            borderRadius: 20, padding: 40,
            textAlign: 'center', minWidth: 340,
            boxShadow: '0 20px 80px rgba(0,0,0,0.8), 0 0 40px rgba(201,168,76,0.3)',
            animation: 'winCelebrate 0.6s ease',
          }}>
            {winDialog.phase === 'draw' ? (
              <>
                <div style={{ fontSize: 48, marginBottom: 12 }}>🤝</div>
                <div style={{ fontFamily: "'Cinzel Decorative', serif", fontSize: 22, color: '#c9a84c', marginBottom: 8 }}>
                  Draw!
                </div>
                <div style={{ color: 'rgba(245,240,232,0.6)', marginBottom: 24 }}>Wall exhausted — no winner</div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
                <div style={{ fontFamily: "'Cinzel Decorative', serif", fontSize: 22, color: '#c9a84c', marginBottom: 8 }}>
                  {winDialog.winner === 0 ? 'You Win!' : `${gameState.players[winDialog.winner]?.name} Wins!`}
                </div>
                <div style={{ color: 'rgba(245,240,232,0.6)', marginBottom: 4 }}>
                  {winDialog.winResult?.sevenPairs ? '✨ Seven Pairs!' : '🏆 Mahjong!'}
                </div>
                {winDialog.winResult?.flowers?.length > 0 && (
                  <div style={{ color: '#9b59b6', marginBottom: 4, fontSize: 13 }}>
                    🌸 {winDialog.winResult.flowers.length} Flower{winDialog.winResult.flowers.length > 1 ? 's' : ''}
                  </div>
                )}
              </>
            )}
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 24 }}>
              <button onClick={newGame} style={btnStyle('gold')}>New Game</button>
              <button onClick={onBackToMenu} style={btnStyle('ghost')}>Menu</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ───── HELPERS ─────
function btnStyle(variant) {
  const base = {
    border: 'none',
    borderRadius: 8,
    padding: '8px 16px',
    cursor: 'pointer',
    fontFamily: "'Cinzel Decorative', serif",
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.05em',
    transition: 'all 0.15s ease',
  };
  if (variant === 'gold') return { ...base, background: 'linear-gradient(135deg, #c9a84c, #9a7a30)', color: '#1a1a1a' };
  if (variant === 'green') return { ...base, background: 'linear-gradient(135deg, #27ae60, #1a8a45)', color: '#fff' };
  if (variant === 'danger') return { ...base, background: 'rgba(192,57,43,0.3)', color: '#e74c3c', border: '1px solid rgba(192,57,43,0.4)' };
  return { ...base, background: 'rgba(255,255,255,0.07)', color: 'rgba(245,240,232,0.7)', border: '1px solid rgba(255,255,255,0.1)' };
}

function getBestDiscardForPlayer(hand, openMelds, strategy) {
  const { SUITS: S } = { SUITS };
  const scores = hand.map(tile => {
    let score = 0;
    const matching = hand.filter(t => tilesEqual(t, tile));
    score += matching.length * 3;
    if ([SUITS.BAMBOO, SUITS.CIRCLE, SUITS.CHARACTER].includes(tile.suit)) {
      const adj = hand.filter(t => t.suit === tile.suit && Math.abs(t.value - tile.value) <= 2);
      score += adj.length * 2;
    }
    if (strategy.name === 'Aggressive' && (tile.suit === SUITS.WIND || tile.suit === SUITS.DRAGON)) {
      score += matching.length >= 2 ? 5 : -2;
    }
    if (strategy.name === 'Chaos') score += (Math.random() - 0.5) * 4;
    return { tile, score };
  });
  scores.sort((a, b) => a.score - b.score);
  return scores[0]?.tile || hand[hand.length - 1];
}

function findBestClaim(claims, state) {
  for (const { playerIndex, claims: cs } of claims) {
    const player = state.players[playerIndex];
    const strategy = player.strategy || AI_STRATEGIES[1];
    const tile = state.lastDiscard;
    const decision = makeClaimDecision(player.hand, tile, player.openMelds, strategy, cs);
    if (decision.claim !== 'pass') {
      return {
        playerIndex,
        claimType: decision.claim,
        combo: decision.combo,
        auto: true,
      };
    }
  }
  return null;
}
