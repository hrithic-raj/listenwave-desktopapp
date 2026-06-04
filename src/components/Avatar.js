import React from 'react';

const COLORS = [
  ['#7c6af7','#4c3f9f'],
  ['#f472b6','#9d174d'],
  ['#34d399','#065f46'],
  ['#fb923c','#9a3412'],
  ['#60a5fa','#1e40af'],
  ['#a78bfa','#5b21b6'],
  ['#f87171','#991b1b'],
  ['#fbbf24','#92400e'],
];

function getColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return COLORS[Math.abs(hash) % COLORS.length];
}

export default function Avatar({ name = '?', size = 38, style = {} }) {
  const letter = name.charAt(0).toUpperCase();
  const [fg, bg] = getColor(name);
  const fontSize = Math.round(size * 0.42);

  return (
    <div
      className="avatar"
      style={{
        width: size,
        height: size,
        background: `radial-gradient(circle at 35% 35%, ${fg}, ${bg})`,
        fontSize,
        color: '#fff',
        boxShadow: `0 0 0 1px ${fg}44`,
        ...style,
      }}
    >
      {letter}
    </div>
  );
}
