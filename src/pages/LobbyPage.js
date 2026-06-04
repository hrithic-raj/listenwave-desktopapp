import React, { useState, useEffect, useCallback } from 'react';
import Avatar from '../components/Avatar';

export default function LobbyPage({ user, onJoinRoom, onChangeUser }) {
  const [tab, setTab] = useState('browse'); // browse | create
  const [rooms, setRooms] = useState([]);
  const [scanning, setScanning] = useState(false);

  // Create room state
  const [roomName, setRoomName] = useState('');
  const [password, setPassword] = useState('');
  const [creating, setCreating] = useState(false);

  // Join state
  const [joinTarget, setJoinTarget] = useState(null);
  const [joinPassword, setJoinPassword] = useState('');
  const [joinError, setJoinError] = useState('');
  const [manualHost, setManualHost] = useState('');
  const [manualPort, setManualPort] = useState('45678');
  const [showManual, setShowManual] = useState(false);

  const scan = useCallback(async () => {
    setScanning(true);
    try {
      const found = await window.electron?.browseRooms() ?? [];
      setRooms(found);
    } catch {
      setRooms([]);
    } finally {
      setScanning(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'browse') scan();
  }, [tab, scan]);

  const createRoom = async () => {
    if (!roomName.trim() || !password.trim()) return;
    setCreating(true);
    try {
      const res = await window.electron?.createRoom({
        roomName: roomName.trim(),
        password: password.trim(),
        hostName: user.name,
      });
      if (res?.success) {
        const ip = await window.electron?.getLocalIp();
        onJoinRoom({
          name: roomName.trim(),
          password: password.trim(),
          host: ip || '127.0.0.1',
          port: res.port,
          isHost: true,
        });
      }
    } finally {
      setCreating(false);
    }
  };

  const attemptJoin = async (room) => {
    setJoinError('');
    onJoinRoom({
      name: room.name,
      host: room.host,
      port: room.port,
      password: joinPassword,
      isHost: false,
    });
  };

  const attemptManualJoin = () => {
    if (!manualHost.trim()) return;
    onJoinRoom({
      name: 'Room',
      host: manualHost.trim(),
      port: parseInt(manualPort) || 45678,
      password: joinPassword,
      isHost: false,
    });
  };

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Sidebar */}
      <div style={{
        width: 240, flexShrink: 0,
        background: 'var(--bg2)',
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        padding: 20, gap: 8,
      }}>
        <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 8 }}>
          ◈ ListenWave
        </div>

        {['browse', 'create'].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? 'var(--surface)' : 'transparent',
            border: tab === t ? '1px solid var(--border)' : '1px solid transparent',
            borderRadius: 10, padding: '10px 14px',
            color: tab === t ? 'var(--text)' : 'var(--text2)',
            fontFamily: 'var(--font)', fontWeight: 600, fontSize: 14,
            cursor: 'pointer', textAlign: 'left',
            display: 'flex', alignItems: 'center', gap: 10,
            transition: 'all 0.12s',
          }}>
            {t === 'browse' ? '⊞' : '+'} {t === 'browse' ? 'Find Rooms' : 'Create Room'}
          </button>
        ))}

        <div style={{ flex: 1 }} />

        {/* User card */}
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 12, padding: 12, display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <Avatar name={user.name} size={34} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user.name}
            </div>
            <button onClick={onChangeUser} style={{
              background: 'none', border: 'none', color: 'var(--text3)', fontSize: 12,
              cursor: 'pointer', fontFamily: 'var(--font)', padding: 0,
            }}>
              Change name
            </button>
          </div>
        </div>
      </div>

      {/* Main area */}
      <div style={{ flex: 1, overflow: 'auto', padding: 32 }}>

        {tab === 'browse' && (
          <div className="fade-up" style={{ maxWidth: 600 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <div>
                <h2 style={{ fontSize: 24, fontWeight: 800 }}>Rooms on your network</h2>
                <p style={{ color: 'var(--text2)', fontSize: 14, marginTop: 4 }}>Rooms hosted on your WiFi appear here automatically.</p>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={scan} disabled={scanning}>
                {scanning ? '⟳ Scanning…' : '⟳ Refresh'}
              </button>
            </div>

            {scanning && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--text2)', padding: '20px 0' }}>
                <div style={{ width: 18, height: 18, border: '2px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                Scanning your network…
              </div>
            )}

            {!scanning && rooms.length === 0 && (
              <div style={{
                background: 'var(--bg2)', border: '1px solid var(--border)',
                borderRadius: 16, padding: 40, textAlign: 'center',
              }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>🎵</div>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>No rooms found</div>
                <div style={{ color: 'var(--text2)', fontSize: 14 }}>Ask your host to create a room, or enter an IP manually below.</div>
              </div>
            )}

            {rooms.map((room, i) => (
              <div key={i} onClick={() => setJoinTarget(joinTarget?.name === room.name ? null : room)} style={{
                background: 'var(--bg2)', border: `1px solid ${joinTarget?.name === room.name ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 14, padding: 18, marginBottom: 10, cursor: 'pointer', transition: 'all 0.15s',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 42, height: 42, borderRadius: 10,
                    background: 'linear-gradient(135deg, var(--accent), var(--accent2))',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
                  }}>🎵</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700 }}>{room.name}</div>
                    <div style={{ color: 'var(--text2)', fontSize: 13, fontFamily: 'var(--mono)' }}>
                      {room.host} · {room.txt?.host}
                    </div>
                  </div>
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%', background: 'var(--green)',
                    boxShadow: '0 0 8px var(--green)',
                  }} />
                </div>

                {joinTarget?.name === room.name && (
                  <div style={{ marginTop: 16, display: 'flex', gap: 10 }} onClick={e => e.stopPropagation()}>
                    <input
                      className="input"
                      type="password"
                      placeholder="Enter room password…"
                      value={joinPassword}
                      onChange={e => setJoinPassword(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && attemptJoin(room)}
                      autoFocus
                    />
                    <button className="btn btn-primary" onClick={() => attemptJoin(room)}>Join</button>
                  </div>
                )}
              </div>
            ))}

            {/* Manual join */}
            <div style={{ marginTop: 24 }}>
              <button onClick={() => setShowManual(!showManual)} style={{
                background: 'none', border: 'none', color: 'var(--text3)', fontSize: 13,
                fontFamily: 'var(--font)', cursor: 'pointer',
              }}>
                {showManual ? '▲' : '▶'} Join by IP address manually
              </button>
              {showManual && (
                <div style={{
                  marginTop: 12, background: 'var(--bg2)', border: '1px solid var(--border)',
                  borderRadius: 14, padding: 18, display: 'flex', flexDirection: 'column', gap: 10,
                }}>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <input className="input" placeholder="Host IP (e.g. 192.168.1.5)" value={manualHost} onChange={e => setManualHost(e.target.value)} style={{ flex: 3 }} />
                    <input className="input" placeholder="Port" value={manualPort} onChange={e => setManualPort(e.target.value)} style={{ flex: 1 }} />
                  </div>
                  <input className="input" type="password" placeholder="Password" value={joinPassword} onChange={e => setJoinPassword(e.target.value)} />
                  <button className="btn btn-primary" onClick={attemptManualJoin}>Connect</button>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'create' && (
          <div className="fade-up" style={{ maxWidth: 480 }}>
            <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 6 }}>Create a Room</h2>
            <p style={{ color: 'var(--text2)', fontSize: 14, marginBottom: 28 }}>
              Host music from your computer. Everyone on the same WiFi can join.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 8, display: 'block', fontWeight: 600 }}>Room Name</label>
                <input className="input" placeholder="e.g. Chill Vibes, Study Room…" value={roomName} onChange={e => setRoomName(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 8, display: 'block', fontWeight: 600 }}>Password</label>
                <input className="input" type="password" placeholder="Share this with your friends" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && createRoom()} />
              </div>

              <div style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 12, padding: 14, fontSize: 13, color: 'var(--text2)',
                lineHeight: 1.6,
              }}>
                💡 As host, you can load local music files (MP3, FLAC, WAV, OGG) and everyone in the room will hear them in sync through your machine. Guests just need to connect.
              </div>

              <button
                className="btn btn-primary btn-lg"
                onClick={createRoom}
                disabled={!roomName.trim() || !password.trim() || creating}
                style={{ opacity: roomName.trim() && password.trim() ? 1 : 0.5 }}
              >
                {creating ? 'Starting…' : '🎵 Create Room'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
