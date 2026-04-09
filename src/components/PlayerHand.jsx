import React from 'react';
import Tile from './Tile.jsx';

export default function PlayerHand({
  player,
  isHuman,
  selectedTile,
  onTileClick,
  canDiscard,
  tenpaiTiles = [],
  size = 'md',
}) {
  const { hand, openMelds, flowers } = player;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
      {/* Open melds */}
      {openMelds.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
          {openMelds.map((meld, mi) => (
            <div key={mi} style={{
              display: 'flex',
              gap: 2,
              padding: '3px 6px',
              background: 'rgba(201,168,76,0.15)',
              borderRadius: 6,
              border: '1px solid rgba(201,168,76,0.3)',
            }}>
              {meld.tiles.map((t, ti) => (
                <Tile key={ti} tile={t} size={size === 'lg' ? 'sm' : 'xs'} />
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Hand tiles */}
      <div style={{ display: 'flex', gap: 3, flexWrap: isHuman ? 'wrap' : 'nowrap', justifyContent: 'center', alignItems: 'flex-end' }}>
        {hand.map((tile, i) => {
          const isSelected = selectedTile === tile;
          const isTenpai = tenpaiTiles.some(t => t.suit === tile.suit && t.value === tile.value);
          
          return (
            <Tile
              key={tile.id}
              tile={isHuman ? tile : undefined}
              faceDown={!isHuman}
              size={size}
              selected={isSelected}
              highlighted={isTenpai && canDiscard}
              onClick={isHuman && canDiscard ? () => onTileClick(tile) : undefined}
              style={{ animationDelay: `${i * 30}ms` }}
            />
          );
        })}
      </div>

      {/* Flowers */}
      {flowers.length > 0 && (
        <div style={{ display: 'flex', gap: 2 }}>
          {flowers.map((f, i) => (
            <Tile key={i} tile={f} size="xs" />
          ))}
        </div>
      )}
    </div>
  );
}
