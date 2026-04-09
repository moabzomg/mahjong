import React, { useState } from 'react';
import { AI_STRATEGIES } from '../game/ai.js';

const MODES = [
  { id: 'vs-ai', label: 'Play vs AI', emoji: '🀄', desc: 'Take on three AI opponents with different strategies' },
  { id: 'ai-sim', label: 'AI Simulation', emoji: '🤖', desc: 'Watch four AI players battle it out automatically' },
];

export default function MenuScreen({ onStart }) {
  const [mode, setMode] = useState('vs-ai');
  const [aiStrategies, setAiStrategies] = useState([0, 1, 2]); // indices for AIs 1,2,3

  function setAiStrategy(aiIndex, stratIndex) {
    const newStrats = [...aiStrategies];
    newStrats[aiIndex] = stratIndex;
    setAiStrategies(newStrats);
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Background decorations */}
      <div style={{
        position: 'fixed',
        top: '-10%',
        right: '-5%',
        fontSize: 300,
        opacity: 0.03,
        transform: 'rotate(15deg)',
        pointerEvents: 'none',
        userSelect: 'none',
        lineHeight: 1,
      }}>🀄</div>
      <div style={{
        position: 'fixed',
        bottom: '-10%',
        left: '-5%',
        fontSize: 250,
        opacity: 0.03,
        transform: 'rotate(-15deg)',
        pointerEvents: 'none',
        userSelect: 'none',
        lineHeight: 1,
      }}>🎋</div>

      {/* Title */}
      <div style={{ textAlign: 'center', marginBottom: 40, animation: 'slideUp 0.6s ease-out' }}>
        <div style={{ fontSize: 56, marginBottom: 8 }}>🀄</div>
        <h1 style={{
          fontFamily: "'Cinzel Decorative', serif",
          fontSize: 'clamp(28px, 5vw, 48px)',
          fontWeight: 700,
          background: 'linear-gradient(135deg, #c9a84c, #e8c96a, #c9a84c)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          letterSpacing: '0.05em',
          marginBottom: 8,
          backgroundSize: '200%',
          animation: 'shimmer 3s linear infinite',
        }}>
          MAHJONG AI
        </h1>
        <p style={{
          color: 'rgba(245,240,232,0.5)',
          fontFamily: "'Crimson Pro', serif",
          fontStyle: 'italic',
          fontSize: 16,
          letterSpacing: '0.15em',
        }}>
          The Ancient Game of Tiles
        </p>
        <div style={{
          width: 80,
          height: 1,
          background: 'linear-gradient(90deg, transparent, #c9a84c, transparent)',
          margin: '16px auto 0',
        }} />
      </div>

      {/* Mode Selection */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 32, animation: 'slideUp 0.7s ease-out' }}>
        {MODES.map(m => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            style={{
              background: mode === m.id
                ? 'linear-gradient(135deg, rgba(201,168,76,0.25), rgba(201,168,76,0.1))'
                : 'rgba(255,255,255,0.04)',
              border: mode === m.id ? '1px solid rgba(201,168,76,0.6)' : '1px solid rgba(255,255,255,0.1)',
              borderRadius: 12,
              padding: '16px 24px',
              cursor: 'pointer',
              color: '#f5f0e8',
              textAlign: 'center',
              transition: 'all 0.2s ease',
              minWidth: 180,
              boxShadow: mode === m.id ? '0 0 20px rgba(201,168,76,0.2)' : 'none',
            }}
          >
            <div style={{ fontSize: 28, marginBottom: 6 }}>{m.emoji}</div>
            <div style={{ fontFamily: "'Cinzel Decorative', serif", fontSize: 13, fontWeight: 700, marginBottom: 4, color: mode === m.id ? '#e8c96a' : '#f5f0e8' }}>
              {m.label}
            </div>
            <div style={{ fontSize: 12, color: 'rgba(245,240,232,0.5)', fontFamily: "'Crimson Pro', serif" }}>
              {m.desc}
            </div>
          </button>
        ))}
      </div>

      {/* AI Strategy Selection */}
      <div style={{
        background: 'rgba(0,0,0,0.25)',
        borderRadius: 16,
        border: '1px solid rgba(201,168,76,0.2)',
        padding: '24px',
        marginBottom: 32,
        width: '100%',
        maxWidth: 680,
        animation: 'slideUp 0.8s ease-out',
      }}>
        <h3 style={{
          fontFamily: "'Cinzel Decorative', serif",
          fontSize: 13,
          color: '#c9a84c',
          letterSpacing: '0.1em',
          marginBottom: 20,
          textAlign: 'center',
        }}>
          {mode === 'vs-ai' ? 'CONFIGURE OPPONENTS' : 'CONFIGURE AI PLAYERS'}
        </h3>
        
        {(mode === 'vs-ai' ? [0, 1, 2] : [0, 1, 2]).map(aiIdx => (
          <div key={aiIdx} style={{ marginBottom: 16 }}>
            <div style={{
              fontSize: 12,
              color: 'rgba(245,240,232,0.5)',
              marginBottom: 8,
              fontFamily: "'Crimson Pro', serif",
              letterSpacing: '0.05em',
            }}>
              {mode === 'vs-ai'
                ? `Opponent ${aiIdx + 1} · ${['East AI', 'South AI', 'West AI'][aiIdx]}`
                : `Player ${aiIdx + 1} · ${['East AI', 'South AI', 'West AI'][aiIdx]}`}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {AI_STRATEGIES.map((strat, si) => (
                <button
                  key={si}
                  onClick={() => setAiStrategy(aiIdx, si)}
                  style={{
                    background: aiStrategies[aiIdx] === si
                      ? `linear-gradient(135deg, ${strat.color}30, ${strat.color}15)`
                      : 'rgba(255,255,255,0.04)',
                    border: aiStrategies[aiIdx] === si
                      ? `1px solid ${strat.color}80`
                      : '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 8,
                    padding: '8px 14px',
                    cursor: 'pointer',
                    color: aiStrategies[aiIdx] === si ? '#f5f0e8' : 'rgba(245,240,232,0.6)',
                    fontSize: 12,
                    fontFamily: "'Crimson Pro', serif",
                    transition: 'all 0.15s ease',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <span>{strat.emoji}</span>
                  <span style={{ fontWeight: aiStrategies[aiIdx] === si ? 600 : 400 }}>{strat.name}</span>
                </button>
              ))}
            </div>
          </div>
        ))}

        {/* Strategy Legend */}
        <div style={{
          marginTop: 16,
          paddingTop: 16,
          borderTop: '1px solid rgba(255,255,255,0.06)',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 8,
        }}>
          {AI_STRATEGIES.map((strat, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <span style={{ fontSize: 14 }}>{strat.emoji}</span>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: strat.color, fontFamily: "'Cinzel Decorative', serif", letterSpacing: '0.05em' }}>
                  {strat.name}
                </div>
                <div style={{ fontSize: 11, color: 'rgba(245,240,232,0.4)', fontFamily: "'Crimson Pro', serif", lineHeight: 1.3 }}>
                  {strat.description}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Start Button */}
      <button
        onClick={() => onStart({ mode, aiStrategies })}
        style={{
          background: 'linear-gradient(135deg, #c9a84c, #9a7a30)',
          border: 'none',
          borderRadius: 12,
          padding: '16px 56px',
          cursor: 'pointer',
          fontFamily: "'Cinzel Decorative', serif",
          fontSize: 16,
          fontWeight: 700,
          color: '#1a1a1a',
          letterSpacing: '0.1em',
          boxShadow: '0 4px 20px rgba(201,168,76,0.4), 0 2px 4px rgba(0,0,0,0.3)',
          transition: 'all 0.2s ease',
          animation: 'pulse-gold 2s ease-in-out infinite',
        }}
        onMouseEnter={e => e.target.style.transform = 'translateY(-2px)'}
        onMouseLeave={e => e.target.style.transform = 'translateY(0)'}
      >
        DEAL TILES
      </button>

      <div style={{
        marginTop: 20,
        fontSize: 12,
        color: 'rgba(245,240,232,0.3)',
        fontFamily: "'Crimson Pro', serif",
        textAlign: 'center',
      }}>
        Hong Kong Style · 麻將
      </div>
    </div>
  );
}
