import React from 'react';
import { getTileDisplay, SUITS } from '../game/engine.js';

const BAMBOO_PATTERNS = {
  1: [{ x: 50, y: 50, r: 14 }],
  2: [{ x: 50, y: 25 }, { x: 50, y: 75 }],
  3: [{ x: 50, y: 20 }, { x: 50, y: 50 }, { x: 50, y: 80 }],
  4: [{ x: 30, y: 30 }, { x: 70, y: 30 }, { x: 30, y: 70 }, { x: 70, y: 70 }],
  5: [{ x: 30, y: 25 }, { x: 70, y: 25 }, { x: 50, y: 50 }, { x: 30, y: 75 }, { x: 70, y: 75 }],
  6: [{ x: 30, y: 20 }, { x: 70, y: 20 }, { x: 30, y: 50 }, { x: 70, y: 50 }, { x: 30, y: 80 }, { x: 70, y: 80 }],
  7: [{ x: 30, y: 18 }, { x: 70, y: 18 }, { x: 50, y: 38 }, { x: 30, y: 58 }, { x: 70, y: 58 }, { x: 30, y: 78 }, { x: 70, y: 78 }],
  8: [{ x: 25, y: 18 }, { x: 50, y: 18 }, { x: 75, y: 18 }, { x: 25, y: 48 }, { x: 75, y: 48 }, { x: 25, y: 78 }, { x: 50, y: 78 }, { x: 75, y: 78 }],
  9: [{ x: 25, y: 15 }, { x: 50, y: 15 }, { x: 75, y: 15 }, { x: 25, y: 45 }, { x: 50, y: 45 }, { x: 75, y: 45 }, { x: 25, y: 75 }, { x: 50, y: 75 }, { x: 75, y: 75 }],
};

const CIRCLE_COLORS = ['#c0392b', '#2980b9', '#27ae60', '#8e44ad', '#e67e22', '#1abc9c', '#2c3e50', '#d35400', '#16a085'];

function BambooFace({ value }) {
  const dots = BAMBOO_PATTERNS[value] || [];
  return (
    <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}>
      {dots.map((d, i) => (
        <g key={i}>
          <rect x={d.x - 7} y={d.y - 14} width={14} height={28} rx={4} fill="#2d6a2d" />
          <rect x={d.x - 5} y={d.y - 2} width={10} height={3} rx={1} fill="#4a9a4a" />
          <rect x={d.x - 5} y={d.y - 8} width={10} height={3} rx={1} fill="#4a9a4a" />
        </g>
      ))}
    </svg>
  );
}

function CircleFace({ value }) {
  const dots = BAMBOO_PATTERNS[value] || [];
  const color = CIRCLE_COLORS[value - 1] || '#2980b9';
  return (
    <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}>
      {dots.map((d, i) => (
        <g key={i}>
          <circle cx={d.x} cy={d.y} r={10} fill={color} />
          <circle cx={d.x} cy={d.y} r={6} fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth={2} />
          <circle cx={d.x - 3} cy={d.y - 3} r={2} fill="rgba(255,255,255,0.4)" />
        </g>
      ))}
    </svg>
  );
}

export default function Tile({
  tile,
  size = 'md',
  selected = false,
  onClick,
  faceDown = false,
  highlighted = false,
  dimmed = false,
  style = {},
}) {
  if (!tile) return null;
  
  const display = getTileDisplay(tile);
  
  const sizes = {
    xs: { width: 28, height: 38, fontSize: 10, padding: 2 },
    sm: { width: 38, height: 52, fontSize: 13, padding: 3 },
    md: { width: 52, height: 72, fontSize: 18, padding: 4 },
    lg: { width: 68, height: 94, fontSize: 26, padding: 6 },
  };
  
  const s = sizes[size] || sizes.md;
  
  const baseStyle = {
    width: s.width,
    height: s.height,
    borderRadius: size === 'xs' ? 3 : 6,
    position: 'relative',
    cursor: onClick ? 'pointer' : 'default',
    flexShrink: 0,
    transition: 'all 0.15s ease',
    transform: selected ? 'translateY(-8px)' : 'translateY(0)',
    opacity: dimmed ? 0.5 : 1,
    userSelect: 'none',
    ...style,
  };
  
  if (faceDown) {
    return (
      <div style={{
        ...baseStyle,
        background: 'linear-gradient(135deg, #1a5c3a 0%, #0d3d25 100%)',
        border: '2px solid #c9a84c',
        boxShadow: '2px 3px 6px rgba(0,0,0,0.5), inset 1px 1px 0 rgba(201,168,76,0.2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: s.fontSize * 1.2,
      }}>
        <div style={{
          width: '70%',
          height: '70%',
          border: '1px solid rgba(201,168,76,0.4)',
          borderRadius: 3,
          background: 'repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(201,168,76,0.05) 3px, rgba(201,168,76,0.05) 6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'rgba(201,168,76,0.4)',
          fontSize: s.fontSize * 0.9,
        }}>
          🀄
        </div>
      </div>
    );
  }
  
  const glowColor = highlighted ? '#c9a84c' : selected ? '#e8c96a' : 'transparent';
  
  return (
    <div
      onClick={onClick}
      style={{
        ...baseStyle,
        background: 'linear-gradient(160deg, #fdf8f0 0%, #f0e8d4 50%, #e8dcc4 100%)',
        border: selected ? '2px solid #c9a84c' : highlighted ? '2px solid #e8c96a' : '1px solid #c8b89a',
        boxShadow: selected
          ? `2px 3px 8px rgba(0,0,0,0.4), 0 0 12px rgba(201,168,76,0.6)`
          : highlighted
          ? `2px 3px 8px rgba(0,0,0,0.3), 0 0 8px rgba(201,168,76,0.4)`
          : `2px 3px 6px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.8)`,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Top-left number for suited tiles */}
      {display.isNumeric && size !== 'xs' && (
        <div style={{
          position: 'absolute',
          top: 2,
          left: 3,
          fontSize: s.fontSize * 0.5,
          color: display.color,
          fontWeight: 700,
          lineHeight: 1,
          fontFamily: "'Noto Serif SC', serif",
        }}>
          {tile.value}
        </div>
      )}
      
      {/* Main face */}
      {tile.suit === SUITS.BAMBOO && size !== 'xs' ? (
        <BambooFace value={tile.value} />
      ) : tile.suit === SUITS.CIRCLE && size !== 'xs' ? (
        <CircleFace value={tile.value} />
      ) : (
        <div style={{
          fontSize: tile.suit === SUITS.CHARACTER ? s.fontSize * 1.1 : s.fontSize,
          color: display.color,
          fontWeight: 700,
          textAlign: 'center',
          lineHeight: 1,
          fontFamily: "'Noto Serif SC', serif",
          position: 'relative',
          zIndex: 1,
          textShadow: tile.suit === SUITS.DRAGON ? `0 0 8px ${display.color}40` : 'none',
        }}>
          {display.symbol}
        </div>
      )}
      
      {/* Suit indicator at bottom for bamboo/circle */}
      {display.isNumeric && size !== 'xs' && (
        <div style={{
          position: 'absolute',
          bottom: 2,
          right: 3,
          fontSize: s.fontSize * 0.5,
          color: display.color,
          opacity: 0.6,
          lineHeight: 1,
        }}>
          {tile.suit === SUITS.BAMBOO ? '竹' : tile.suit === SUITS.CIRCLE ? '筒' : '萬'}
        </div>
      )}
      
      {/* Xs size - just show number/symbol */}
      {size === 'xs' && (
        <div style={{
          fontSize: s.fontSize,
          color: display.color,
          fontWeight: 700,
          fontFamily: "'Noto Serif SC', serif",
        }}>
          {display.isNumeric ? tile.value : display.symbol}
        </div>
      )}
    </div>
  );
}
