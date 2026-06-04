import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import Avatar from '../components/Avatar';

function fmt(sec) {
  if (!sec || isNaN(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function RoomPage({ user, room, onLeave }) {
  const socketRef = useRef(null);
  const audioRef = useRef(new Audio());
  const [connected, setConnected] = useState(false);
  const [connError, setConnError] = useState('');
  const [members, setMembers] = useState([]);
  const [queue, setQueue] = useState([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [showQueue, setShowQueue] = useState(false);

  const currentTrack = queue[queueIndex] || null;
  const isHost = room.isHost;

  // ── Audio setup ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const audio = audioRef.current;
    audio.volume = volume;

    const onTimeUpdate = () => setPosition(audio.currentTime);
    const onDuration = () => setDuration(audio.duration);
    const onEnded = () => handleNext();

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onDuration);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onDuration);
      audio.removeEventListener('ended', onEnded);
      audio.pause();
    };
  }, []);

  useEffect(() => {
    audioRef.current.volume = volume;
  }, [volume]);

  // ── Socket.IO ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const url = `http://${room.host}:${room.port}`;
    const socket = io(url, { transports: ['websocket'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      setConnError('');
      socket.emit('join', { name: user.name, password: room.password });
    });

    socket.on('connect_error', () => {
      setConnError('Cannot connect to room. Check the host is running and you are on the same WiFi.');
    });

    socket.on('error', ({ message }) => setConnError(message));

    socket.on('joined', ({ roomState }) => {
      if (roomState.queue) setQueue(roomState.queue);
      if (roomState.currentTrack) {
        const idx = roomState.queue?.findIndex(t => t.path === roomState.currentTrack?.path);
        if (idx >= 0) setQueueIndex(idx);
      }
      setMembers(roomState.members || []);
      if (roomState.isPlaying && roomState.currentTrack) {
        loadAndPlay(roomState.currentTrack, roomState.position, url);
      }
    });

    socket.on('members', setMembers);

    socket.on('play', ({ track, position: pos }) => {
      loadAndPlay(track, pos, url);
    });

    socket.on('pause', ({ position: pos }) => {
      audioRef.current.pause();
      if (pos !== undefined) audioRef.current.currentTime = pos;
      setIsPlaying(false);
    });

    socket.on('seek', ({ position: pos }) => {
      audioRef.current.currentTime = pos;
      setPosition(pos);
    });

    socket.on('next', () => { doNext(); });
    socket.on('prev', () => { doPrev(); });

    socket.on('queue-update', ({ queue: q, currentTrack }) => {
      setQueue(q || []);
      if (currentTrack) {
        const idx = (q || []).findIndex(t => t.path === currentTrack.path);
        setQueueIndex(idx >= 0 ? idx : 0);
      }
    });

    socket.on('volume', ({ volume: v }) => {
      setVolume(v);
    });

    return () => { socket.disconnect(); };
  }, [room]);

  // IPC from host server (host machine events)
  useEffect(() => {
    if (!isHost) return;
    window.electron?.onPlaybackPlay(({ track, position: pos }) => {
      loadAndPlay(track, pos, `http://${room.host}:${room.port}`);
    });
    window.electron?.onPlaybackPause(({ position: pos }) => {
      audioRef.current.pause();
      if (pos !== undefined) audioRef.current.currentTime = pos;
      setIsPlaying(false);
    });
    window.electron?.onPlaybackNext(() => doNext());
    window.electron?.onPlaybackPrev(() => doPrev());
    return () => {
      ['playback-play','playback-pause','playback-next','playback-prev'].forEach(ch =>
        window.electron?.removeAllListeners(ch));
    };
  }, [isHost, queueIndex, queue]);

  const loadAndPlay = (track, pos, serverUrl) => {
    if (!track) return;
    const audio = audioRef.current;
    const url = `${serverUrl}/audio?path=${encodeURIComponent(track.path)}`;
    if (audio.src !== url) {
      audio.src = url;
      audio.load();
    }
    audio.currentTime = pos || 0;
    audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    setDuration(track.duration || 0);
  };

  // ── Controls ──────────────────────────────────────────────────────────────────
  const broadcast = useCallback((event, data) => {
    socketRef.current?.emit(event, data);
  }, []);

  const handlePlay = () => {
    if (!currentTrack) return;
    const pos = audioRef.current.currentTime;
    if (isHost) {
      loadAndPlay(currentTrack, pos, `http://${room.host}:${room.port}`);
    }
    broadcast('play', { track: currentTrack, position: pos });
    setIsPlaying(true);
  };

  const handlePause = () => {
    const pos = audioRef.current.currentTime;
    broadcast('pause', { position: pos });
    audioRef.current.pause();
    setIsPlaying(false);
  };

  const handleSeek = (e) => {
    const pos = parseFloat(e.target.value);
    audioRef.current.currentTime = pos;
    setPosition(pos);
    broadcast('seek', { position: pos });
  };

  const doNext = () => {
    setQueueIndex(i => {
      const next = Math.min(i + 1, queue.length - 1);
      if (queue[next] && isHost) {
        setTimeout(() => {
          loadAndPlay(queue[next], 0, `http://${room.host}:${room.port}`);
          broadcast('play', { track: queue[next], position: 0 });
        }, 0);
      }
      return next;
    });
  };

  const handleNext = () => { doNext(); broadcast('next'); };
  const doPrev = () => {
    if (audioRef.current.currentTime > 3) {
      audioRef.current.currentTime = 0;
      broadcast('seek', { position: 0 });
      return;
    }
    setQueueIndex(i => {
      const prev = Math.max(i - 1, 0);
      if (queue[prev] && isHost) {
        setTimeout(() => {
          loadAndPlay(queue[prev], 0, `http://${room.host}:${room.port}`);
          broadcast('play', { track: queue[prev], position: 0 });
        }, 0);
      }
      return prev;
    });
  };
  const handlePrev = () => { doPrev(); broadcast('prev'); };

  const playTrackAt = (index) => {
    const track = queue[index];
    if (!track) return;
    setQueueIndex(index);
    if (isHost) loadAndPlay(track, 0, `http://${room.host}:${room.port}`);
    broadcast('play', { track, position: 0 });
    setIsPlaying(true);
  };

  const handleVolumeChange = (e) => {
    const v = parseFloat(e.target.value);
    setVolume(v);
    broadcast('volume', { volume: v });
  };

  const addFiles = async () => {
    if (!isHost) return;
    const tracks = await window.electron?.pickFiles();
    if (!tracks?.length) return;
    const newQueue = [...queue, ...tracks];
    setQueue(newQueue);
    broadcast('queue-update', { queue: newQueue, currentTrack: currentTrack });
    if (newQueue.length === tracks.length) {
      playTrackAt(0);
    }
  };

  const removeTrack = (index) => {
    const newQueue = queue.filter((_, i) => i !== index);
    let newIndex = queueIndex;
    if (index < queueIndex) newIndex--;
    else if (index === queueIndex) newIndex = Math.min(queueIndex, newQueue.length - 1);
    setQueue(newQueue);
    setQueueIndex(Math.max(0, newIndex));
    broadcast('queue-update', { queue: newQueue, currentTrack: newQueue[newIndex] || null });
  };

  const handleLeave = async () => {
    if (isHost) await window.electron?.stopRoom();
    onLeave();
  };

  // Progress bar max
  const dur = duration || currentTrack?.duration || 1;

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>

      {/* Left sidebar - members */}
      <div style={{
        width: 220, flexShrink: 0,
        background: 'var(--bg2)', borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', padding: 16, gap: 4,
      }}>
        <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 12 }}>
          ◈ {room.name}
        </div>

        <div style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 600, marginBottom: 6 }}>
          LISTENERS · {members.length}
        </div>

        {members.map((m, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', borderRadius: 8 }}>
            <div style={{ position: 'relative' }}>
              <Avatar name={m.name} size={30} />
              {isPlaying && (
                <div style={{
                  position: 'absolute', bottom: -2, right: -2,
                  display: 'flex', gap: 1.5, alignItems: 'flex-end',
                  background: 'var(--bg2)', borderRadius: 3, padding: '1px 2px',
                }}>
                  {[0, 80, 160].map(delay => (
                    <div key={delay} style={{
                      width: 2, height: 6, background: 'var(--green)', borderRadius: 1,
                      animation: `wave 0.8s ease-in-out infinite`,
                      animationDelay: `${delay}ms`,
                    }} />
                  ))}
                </div>
              )}
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{m.name}</div>
              {m.name === user.name && <div style={{ fontSize: 11, color: 'var(--text3)' }}>You</div>}
            </div>
          </div>
        ))}

        <div style={{ flex: 1 }} />

        {connError && (
          <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 8, padding: 10, fontSize: 12, color: 'var(--red)' }}>
            {connError}
          </div>
        )}

        <button className="btn btn-ghost btn-sm" onClick={handleLeave} style={{ width: '100%' }}>
          ← Leave Room
        </button>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Top bar */}
        <div style={{
          padding: '12px 24px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: connected ? 'var(--green)' : 'var(--red)',
            boxShadow: connected ? '0 0 8px var(--green)' : 'none',
          }} />
          <span style={{ color: 'var(--text2)', fontSize: 13 }}>
            {connected ? `Connected · ${isHost ? 'Hosting' : 'Guest'}` : 'Connecting…'}
          </span>
          <div style={{ flex: 1 }} />
          {isHost && (
            <button className="btn btn-surface btn-sm" onClick={addFiles}>
              + Add Music
            </button>
          )}
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setShowQueue(!showQueue)}
            style={{ color: showQueue ? 'var(--accent2)' : undefined }}
          >
            ☰ Queue {queue.length > 0 && `(${queue.length})`}
          </button>
        </div>

        {/* Now playing + queue layout */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

          {/* Now playing */}
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            padding: 40, gap: 32,
          }}>
            {/* Album art placeholder */}
            <div style={{
              width: 200, height: 200, borderRadius: 20,
              background: currentTrack
                ? 'linear-gradient(135deg, var(--accent) 0%, var(--bg3) 100%)'
                : 'var(--surface)',
              border: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 64,
              boxShadow: isPlaying ? '0 0 60px rgba(124,106,247,0.3)' : 'none',
              transition: 'box-shadow 0.5s ease',
              animation: isPlaying ? 'pulse 2s ease-in-out infinite' : 'none',
            }}>
              {currentTrack ? '♫' : '🎵'}
            </div>

            {/* Track info */}
            <div style={{ textAlign: 'center', maxWidth: 360 }}>
              <div style={{
                fontSize: 22, fontWeight: 800, marginBottom: 6,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {currentTrack?.title || 'No track loaded'}
              </div>
              <div style={{ color: 'var(--text2)', fontSize: 15 }}>
                {currentTrack?.artist || (isHost ? 'Add music with "+ Add Music"' : 'Waiting for host…')}
              </div>
              {currentTrack?.album && (
                <div style={{ color: 'var(--text3)', fontSize: 13, marginTop: 4 }}>{currentTrack.album}</div>
              )}
            </div>

            {/* Progress */}
            <div style={{ width: '100%', maxWidth: 380 }}>
              <input
                type="range" min={0} max={dur} step={0.1} value={position}
                onChange={handleSeek}
                style={{ width: '100%', accentColor: 'var(--accent)' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--text3)', marginTop: 4 }}>
                <span>{fmt(position)}</span>
                <span>{fmt(dur)}</span>
              </div>
            </div>

            {/* Controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <button className="btn btn-icon" onClick={handlePrev} title="Previous">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/>
                </svg>
              </button>

              <button
                onClick={isPlaying ? handlePause : handlePlay}
                disabled={!currentTrack}
                style={{
                  width: 56, height: 56, borderRadius: '50%',
                  background: 'var(--accent)', border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontSize: 20,
                  boxShadow: '0 0 24px rgba(124,106,247,0.5)',
                  transition: 'all 0.15s', opacity: currentTrack ? 1 : 0.4,
                }}
              >
                {isPlaying ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                )}
              </button>

              <button className="btn btn-icon" onClick={handleNext} title="Next">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 18l8.5-6L6 6v12zm2.5-6 8.5 6V6z"/>
                  <path d="M16 6h2v12h-2z"/>
                </svg>
              </button>
            </div>

            {/* Volume */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', maxWidth: 280 }}>
              <svg width="16" height="16" fill="var(--text3)" viewBox="0 0 24 24">
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
              </svg>
              <input
                type="range" min={0} max={1} step={0.01} value={volume}
                onChange={handleVolumeChange}
                style={{ flex: 1, accentColor: 'var(--accent2)' }}
              />
              <svg width="16" height="16" fill="var(--text3)" viewBox="0 0 24 24">
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
              </svg>
            </div>
          </div>

          {/* Queue panel */}
          {showQueue && (
            <div style={{
              width: 320, borderLeft: '1px solid var(--border)',
              background: 'var(--bg2)', display: 'flex', flexDirection: 'column',
              overflow: 'hidden',
            }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 15 }}>
                Queue · {queue.length} tracks
              </div>
              <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>
                {queue.length === 0 && (
                  <div style={{ padding: 24, textAlign: 'center', color: 'var(--text3)', fontSize: 14 }}>
                    {isHost ? 'Add music with "+ Add Music"' : 'No tracks in queue yet'}
                  </div>
                )}
                {queue.map((track, i) => (
                  <div
                    key={i}
                    className={`track-item ${i === queueIndex ? 'active' : ''}`}
                    onClick={() => playTrackAt(i)}
                  >
                    <div style={{
                      width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                      background: i === queueIndex ? 'var(--accent)' : 'var(--surface)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, fontFamily: 'var(--mono)', color: i === queueIndex ? '#fff' : 'var(--text3)',
                    }}>
                      {i === queueIndex && isPlaying ? '♫' : i + 1}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="track-title" style={{
                        fontSize: 13, fontWeight: 600,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {track.title}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {track.artist}
                      </div>
                    </div>
                    <div style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>
                      {fmt(track.duration)}
                    </div>
                    {isHost && (
                      <button
                        onClick={e => { e.stopPropagation(); removeTrack(i); }}
                        style={{
                          background: 'none', border: 'none', color: 'var(--text3)',
                          cursor: 'pointer', fontSize: 16, padding: '0 2px',
                          lineHeight: 1,
                        }}
                      >×</button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
