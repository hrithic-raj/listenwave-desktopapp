import React, { useState } from 'react';
import Avatar from '../components/Avatar';

export default function SetupPage({ onDone }) {
  const [name, setName] = useState('');

  const handle = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onDone({ name: trimmed });
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: '100%', gap: 32,
      padding: 32,
    }}>
      {/* Logo */}
      <div className="fade-up" style={{ textAlign: 'center', animationDelay: '0ms' }}>
        <div style={{
          fontSize: 13, fontFamily: 'var(--mono)', color: 'var(--accent)',
          letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 10,
        }}>
          ◈ ListenWave
        </div>
        <h1 style={{ fontSize: 42, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.1 }}>
          Music, Together.
        </h1>
        <p style={{ color: 'var(--text2)', marginTop: 10, fontSize: 15 }}>
          Play local music with everyone on your WiFi.
        </p>
      </div>

      {/* Card */}
      <div className="fade-up" style={{
        animationDelay: '80ms',
        background: 'var(--bg2)',
        border: '1px solid var(--border)',
        borderRadius: 20,
        padding: 32,
        width: '100%', maxWidth: 420,
        display: 'flex', flexDirection: 'column', gap: 24,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Avatar name={name || '?'} size={56} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{name || 'Your name'}</div>
            <div style={{ color: 'var(--text3)', fontSize: 13 }}>Your room identity</div>
          </div>
        </div>

        <div>
          <label style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 8, display: 'block', fontWeight: 600 }}>
            What should we call you?
          </label>
          <input
            className="input"
            placeholder="Enter your name…"
            value={name}
            maxLength={24}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handle()}
            autoFocus
          />
        </div>

        <button
          className="btn btn-primary btn-lg"
          onClick={handle}
          disabled={!name.trim()}
          style={{ width: '100%', opacity: name.trim() ? 1 : 0.5 }}
        >
          Continue →
        </button>
      </div>

      <div className="fade-up" style={{ animationDelay: '160ms', color: 'var(--text3)', fontSize: 12, fontFamily: 'var(--mono)' }}>
        No account. No login. Just music.
      </div>
    </div>
  );
}
