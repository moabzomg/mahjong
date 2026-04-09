import React, { useRef, useEffect } from 'react';

export default function GameLog({ logs }) {
  const endRef = useRef(null);

  return (
    <div style={{
      background: 'rgba(0,0,0,0.3)',
      borderRadius: 8,
      border: '1px solid rgba(201,168,76,0.2)',
      padding: '8px 12px',
      height: 120,
      overflowY: 'auto',
      display: 'flex',
      flexDirection: 'column',
      gap: 2,
    }}>
      {logs.slice(0, 30).map((log, i) => (
        <div key={i} style={{
          fontSize: 12,
          color: i === 0 ? '#e8c96a' : 'rgba(245,240,232,0.6)',
          fontFamily: "'Crimson Pro', serif",
          lineHeight: 1.4,
          transition: 'color 0.5s ease',
        }}>
          {log}
        </div>
      ))}
    </div>
  );
}
