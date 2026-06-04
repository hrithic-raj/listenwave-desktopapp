import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import Avatar from '../components/Avatar';

function fmt(sec) {
  if (!sec || isNaN(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ── Drag-and-drop reorder ──────────────────────────────────────────────────────
function reorder(list, from, to) {
  const result = [...list];
  const [removed] = result.splice(from, 1);
  result.splice(to, 0, removed);
  return result;
}

export default function RoomPage({ user, room, onLeave }) {
  const socketRef = useRef(null);
  const audioRef = useRef(new Audio());
  const serverUrl = `http://${room.host}:${room.port}`;

  const [connected, setConnected] = useState(false);
  const [connError, setConnError] = useState('');
  const [members, setMembers] = useState([]);

  // Queue & playback — keep in refs too so callbacks always see latest values
  const [queue, setQueue] = useState([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const queueRef = useRef([]);
  const queueIndexRef = useRef(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);

  const [showQueue, setShowQueue] = useState(true);
  const [shuffle, setShuffle] = useState(false);
  const shuffleRef = useRef(false);

  // Drag state
  const dragFrom = useRef(null);
  const [dragOver, setDragOver] = useState(null);

  // Loading state for folder scan
  const [loadingFolder, setLoadingFolder] = useState(false);

  const isHost = room.isHost;

  // Keep refs in sync
  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { queueIndexRef.current = queueIndex; }, [queueIndex]);
  useEffect(() => { shuffleRef.current = shuffle; }, [shuffle]);

  // ── Audio setup ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const audio = audioRef.current;
    audio.volume = volume;

    const onTimeUpdate = () => setPosition(audio.currentTime);
    const onLoaded = () => setDuration(audio.duration);
    const onEnded = () => advanceTrack();

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('ended', onEnded);
      audio.pause();
    };
  }, []); // eslint-disable-line

  useEffect(() => { audioRef.current.volume = volume; }, [volume]);

  // ── Core: load and play a track ───────────────────────────────────────────────
  const loadAndPlay = useCallback((track, pos) => {
    if (!track) return;
    const audio = audioRef.current;
    const url = `${serverUrl}/audio?path=${encodeURIComponent(track.path)}`;
    if (audio.src !== url) {
      audio.src = url;
      audio.load();
    }
    audio.currentTime = pos || 0;
    setDuration(track.duration || 0);
    audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
  }, [serverUrl]);

  // ── Advance to next track (auto or manual) ────────────────────────────────────
  const advanceTrack = useCallback(() => {
    const q = queueRef.current;
    if (!q.length) return;
    let nextIndex;
    if (shuffleRef.current) {
      nextIndex = Math.floor(Math.random() * q.length);
    } else {
      nextIndex = queueIndexRef.current + 1;
      if (nextIndex >= q.length) return; // end of queue
    }
    const nextTrack = q[nextIndex];
    setQueueIndex(nextIndex);
    loadAndPlay(nextTrack, 0);
    socketRef.current?.emit('play-track', { track: nextTrack, index: nextIndex, position: 0 });
  }, [loadAndPlay]);

  // ── Socket.IO ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const socket = io(serverUrl, { transports: ['websocket'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      setConnError('');
      socket.emit('join', { name: user.name, password: room.password });
    });

    socket.on('connect_error', () => {
      setConnError('Cannot connect. Check host is running and you are on the same WiFi.');
    });

    socket.on('error', ({ message }) => setConnError(message));

    socket.on('joined', ({ roomState }) => {
      const q = roomState.queue || [];
      setQueue(q);
      queueRef.current = q;
      setMembers(roomState.members || []);

      let idx = 0;
      if (roomState.currentTrack) {
        const found = q.findIndex(t => t.path === roomState.currentTrack?.path);
        if (found >= 0) idx = found;
      }
      setQueueIndex(idx);
      queueIndexRef.current = idx;

      if (roomState.isPlaying && roomState.currentTrack) {
        const syncPos = roomState.position + (Date.now() - roomState.positionTimestamp) / 1000;
        loadAndPlay(roomState.currentTrack, syncPos);
      }
    });

    socket.on('members', setMembers);

    // play-track: a specific track was selected (next/prev/click) — fixes display bug
    socket.on('play-track', ({ track, index, position: pos }) => {
      setQueueIndex(index);
      queueIndexRef.current = index;
      loadAndPlay(track, pos || 0);
      setIsPlaying(true);
    });

    socket.on('play', ({ track, position: pos }) => {
      if (track) loadAndPlay(track, pos);
      setIsPlaying(true);
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

    // queue-update: queue reordered, shuffled, or tracks added/removed
    socket.on('queue-update', ({ queue: q, currentTrack, currentIndex }) => {
      setQueue(q || []);
      queueRef.current = q || [];
      if (currentIndex !== undefined) {
        setQueueIndex(currentIndex);
        queueIndexRef.current = currentIndex;
      } else if (currentTrack) {
        const idx = (q || []).findIndex(t => t.path === currentTrack.path);
        if (idx >= 0) { setQueueIndex(idx); queueIndexRef.current = idx; }
      }
    });

    socket.on('volume', ({ volume: v }) => setVolume(v));

    return () => { socket.disconnect(); };
  }, [room, serverUrl, loadAndPlay]); // eslint-disable-line

  // IPC for host (events coming from other clients relayed through server)
  useEffect(() => {
    if (!isHost) return;
    window.electron?.onPlayTrack(({ track, index, position: pos }) => {
      setQueueIndex(index);
      queueIndexRef.current = index;
      loadAndPlay(track, pos || 0);
    });
    window.electron?.onPlaybackPause(({ position: pos }) => {
      audioRef.current.pause();
      if (pos !== undefined) audioRef.current.currentTime = pos;
      setIsPlaying(false);
    });
    window.electron?.onQueueUpdate(({ queue: q, currentIndex }) => {
      setQueue(q || []);
      queueRef.current = q || [];
      if (currentIndex !== undefined) { setQueueIndex(currentIndex); queueIndexRef.current = currentIndex; }
    });
    return () => {
      ['play-track', 'playback-pause', 'queue-update'].forEach(ch =>
        window.electron?.removeAllListeners(ch));
    };
  }, [isHost, loadAndPlay]);

  // ── Broadcast helper ──────────────────────────────────────────────────────────
  const broadcast = useCallback((event, data) => {
    socketRef.current?.emit(event, data);
  }, []);

  // ── Playback controls ─────────────────────────────────────────────────────────
  const handlePlay = () => {
    const track = queueRef.current[queueIndexRef.current];
    if (!track) return;
    const pos = audioRef.current.currentTime;
    loadAndPlay(track, pos);
    broadcast('play', { track, position: pos });
    setIsPlaying(true);
  };

  const handlePause = () => {
    const pos = audioRef.current.currentTime;
    audioRef.current.pause();
    setIsPlaying(false);
    broadcast('pause', { position: pos });
  };

  const handleSeek = (e) => {
    const pos = parseFloat(e.target.value);
    audioRef.current.currentTime = pos;
    setPosition(pos);
    broadcast('seek', { position: pos });
  };

  const handleNext = () => {
    const q = queueRef.current;
    if (!q.length) return;
    let nextIndex;
    if (shuffleRef.current) {
      nextIndex = Math.floor(Math.random() * q.length);
    } else {
      nextIndex = Math.min(queueIndexRef.current + 1, q.length - 1);
      if (nextIndex === queueIndexRef.current) return;
    }
    const track = q[nextIndex];
    setQueueIndex(nextIndex);
    loadAndPlay(track, 0);
    broadcast('play-track', { track, index: nextIndex, position: 0 });
  };

  const handlePrev = () => {
    const q = queueRef.current;
    if (!q.length) return;
    if (audioRef.current.currentTime > 3) {
      audioRef.current.currentTime = 0;
      broadcast('seek', { position: 0 });
      return;
    }
    const prevIndex = Math.max(queueIndexRef.current - 1, 0);
    if (prevIndex === queueIndexRef.current) return;
    const track = q[prevIndex];
    setQueueIndex(prevIndex);
    loadAndPlay(track, 0);
    broadcast('play-track', { track, index: prevIndex, position: 0 });
  };

  const playTrackAt = (index) => {
    const track = queueRef.current[index];
    if (!track) return;
    setQueueIndex(index);
    loadAndPlay(track, 0);
    broadcast('play-track', { track, index, position: 0 });
    setIsPlaying(true);
  };

  const handleVolumeChange = (e) => {
    const v = parseFloat(e.target.value);
    setVolume(v);
    broadcast('volume', { volume: v });
  };

  // ── Queue management ──────────────────────────────────────────────────────────
  const broadcastQueueUpdate = (newQueue, newIndex) => {
    broadcast('queue-update', {
      queue: newQueue,
      currentTrack: newQueue[newIndex] || null,
      currentIndex: newIndex,
    });
  };

  const addFiles = async () => {
    if (!isHost) return;
    const tracks = await window.electron?.pickFiles();
    if (!tracks?.length) return;
    const newQueue = [...queueRef.current, ...tracks];
    const newIndex = queueIndexRef.current;
    setQueue(newQueue);
    queueRef.current = newQueue;
    broadcastQueueUpdate(newQueue, newIndex);
    if (newQueue.length === tracks.length) playTrackAt(0);
  };

  const addFolder = async () => {
    if (!isHost) return;
    setLoadingFolder(true);
    try {
      const tracks = await window.electron?.pickFolder();
      if (!tracks?.length) return;
      const newQueue = [...queueRef.current, ...tracks];
      const newIndex = queueIndexRef.current;
      setQueue(newQueue);
      queueRef.current = newQueue;
      broadcastQueueUpdate(newQueue, newIndex);
      if (newQueue.length === tracks.length) playTrackAt(0);
    } finally {
      setLoadingFolder(false);
    }
  };

  const removeTrack = (index) => {
    const newQueue = queueRef.current.filter((_, i) => i !== index);
    let newIndex = queueIndexRef.current;
    if (index < newIndex) newIndex--;
    else if (index === newIndex) newIndex = Math.min(newIndex, newQueue.length - 1);
    newIndex = Math.max(0, newIndex);
    setQueue(newQueue);
    queueRef.current = newQueue;
    setQueueIndex(newIndex);
    queueIndexRef.current = newIndex;
    broadcastQueueUpdate(newQueue, newIndex);
  };

  const handleShuffle = () => {
    const newShuffle = !shuffle;
    setShuffle(newShuffle);
    if (newShuffle) {
      const current = queueRef.current[queueIndexRef.current];
      const rest = queueRef.current.filter((_, i) => i !== queueIndexRef.current);
      for (let i = rest.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [rest[i], rest[j]] = [rest[j], rest[i]];
      }
      const newQueue = [current, ...rest];
      setQueue(newQueue);
      queueRef.current = newQueue;
      setQueueIndex(0);
      queueIndexRef.current = 0;
      broadcastQueueUpdate(newQueue, 0);
    }
  };

  // ── Drag and drop queue reorder ────────────────────────────────────────────────
  const handleDragStart = (e, index) => {
    dragFrom.current = index;
    e.dataTransfer.effectAllowed = 'move';
  };
  const handleDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(index);
  };
  const handleDrop = (e, toIndex) => {
    e.preventDefault();
    setDragOver(null);
    if (dragFrom.current === null || dragFrom.current === toIndex) return;

    const newQueue = reorder(queueRef.current, dragFrom.current, toIndex);
    let newIndex = queueIndexRef.current;
    if (dragFrom.current === newIndex) {
      newIndex = toIndex;
    } else if (dragFrom.current < newIndex && toIndex >= newIndex) {
      newIndex--;
    } else if (dragFrom.current > newIndex && toIndex <= newIndex) {
      newIndex++;
    }
    newIndex = Math.max(0, Math.min(newIndex, newQueue.length - 1));

    setQueue(newQueue);
    queueRef.current = newQueue;
    setQueueIndex(newIndex);
    queueIndexRef.current = newIndex;
    broadcastQueueUpdate(newQueue, newIndex);
    dragFrom.current = null;
  };
  const handleDragEnd = () => { setDragOver(null); dragFrom.current = null; };

  const handleLeave = async () => {
    if (isHost) await window.electron?.stopRoom();
    onLeave();
  };

  const currentTrack = queue[queueIndex] || null;
  const dur = duration || currentTrack?.duration || 1;

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>

      {/* ── Left sidebar: members ── */}
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
                  {[0, 80, 160].map(d => (
                    <div key={d} style={{
                      width: 2, height: 6, background: 'var(--green)', borderRadius: 1,
                      animation: 'wave 0.8s ease-in-out infinite', animationDelay: `${d}ms`,
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

      {/* ── Main content ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Top bar */}
        <div style={{
          padding: '12px 24px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
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
            <>
              <button className="btn btn-surface btn-sm" onClick={addFiles}>
                + Files
              </button>
              <button className="btn btn-surface btn-sm" onClick={addFolder} disabled={loadingFolder}>
                {loadingFolder ? '⟳ Scanning…' : '+ Folder'}
              </button>
            </>
          )}

          <button
            className="btn btn-ghost btn-sm"
            onClick={handleShuffle}
            title="Shuffle queue"
            style={{
              color: shuffle ? 'var(--accent2)' : 'var(--text2)',
              borderColor: shuffle ? 'var(--accent)' : undefined,
            }}
          >
            ⇄ Shuffle
          </button>

          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setShowQueue(!showQueue)}
            style={{ color: showQueue ? 'var(--accent2)' : undefined }}
          >
            ☰ Queue {queue.length > 0 && `(${queue.length})`}
          </button>
        </div>

        {/* Player + queue */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

          {/* Now playing */}
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            padding: 40, gap: 28,
          }}>
            {/* Album art */}
            <div style={{
              width: 190, height: 190, borderRadius: 20,
              background: currentTrack
                ? 'linear-gradient(135deg, var(--accent) 0%, var(--bg3) 100%)'
                : 'var(--surface)',
              border: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 60,
              boxShadow: isPlaying ? '0 0 60px rgba(124,106,247,0.3)' : 'none',
              transition: 'box-shadow 0.5s ease',
              animation: isPlaying ? 'pulse 2s ease-in-out infinite' : 'none',
            }}>
              {currentTrack ? '♫' : '🎵'}
            </div>

            {/* Track info */}
            <div style={{ textAlign: 'center', maxWidth: 340, width: '100%' }}>
              <div style={{
                fontSize: 20, fontWeight: 800, marginBottom: 4,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {currentTrack?.title || 'No track loaded'}
              </div>
              <div style={{ color: 'var(--text2)', fontSize: 14 }}>
                {currentTrack?.artist || (isHost ? 'Add music above' : 'Waiting for host…')}
              </div>
              {currentTrack?.album && (
                <div style={{ color: 'var(--text3)', fontSize: 12, marginTop: 3 }}>{currentTrack.album}</div>
              )}
              <div style={{ color: 'var(--text3)', fontSize: 12, fontFamily: 'var(--mono)', marginTop: 6 }}>
                {queue.length > 0 && `${queueIndex + 1} / ${queue.length}`}
              </div>
            </div>

            {/* Progress bar */}
            <div style={{ width: '100%', maxWidth: 360 }}>
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

            {/* Playback controls */}
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
                  color: '#fff',
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
                  <path d="M6 18l8.5-6L6 6v12zM16 6h2v12h-2z"/>
                </svg>
              </button>
            </div>

            {/* Volume */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', maxWidth: 260 }}>
              <svg width="14" height="14" fill="var(--text3)" viewBox="0 0 24 24">
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
              </svg>
              <input type="range" min={0} max={1} step={0.01} value={volume}
                onChange={handleVolumeChange}
                style={{ flex: 1, accentColor: 'var(--accent2)' }}
              />
              <svg width="14" height="14" fill="var(--text3)" viewBox="0 0 24 24">
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
              </svg>
            </div>
          </div>

          {/* ── Queue panel ── */}
          {showQueue && (
            <div style={{
              width: 320, borderLeft: '1px solid var(--border)',
              background: 'var(--bg2)', display: 'flex', flexDirection: 'column',
              overflow: 'hidden',
            }}>
              <div style={{
                padding: '14px 16px', borderBottom: '1px solid var(--border)',
                fontWeight: 700, fontSize: 14,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <span>Queue · {queue.length}</span>
                <span style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 400 }}>
                  drag to reorder
                </span>
              </div>

              <div style={{ flex: 1, overflow: 'auto', padding: 6 }}>
                {queue.length === 0 && (
                  <div style={{ padding: 24, textAlign: 'center', color: 'var(--text3)', fontSize: 14 }}>
                    {isHost ? 'Add music with "+ Files" or "+ Folder"' : 'No tracks yet'}
                  </div>
                )}

                {queue.map((track, i) => (
                  <div
                    key={`${track.path}-${i}`}
                    className={`track-item ${i === queueIndex ? 'active' : ''}`}
                    onClick={() => playTrackAt(i)}
                    draggable={true}
                    onDragStart={(e) => handleDragStart(e, i)}
                    onDragOver={(e) => handleDragOver(e, i)}
                    onDrop={(e) => handleDrop(e, i)}
                    onDragEnd={handleDragEnd}
                    style={{
                      outline: dragOver === i ? '2px solid var(--accent)' : 'none',
                      opacity: dragFrom.current === i ? 0.4 : 1,
                      cursor: 'grab',
                    }}
                  >
                    {/* Index / playing indicator */}
                    <div style={{
                      width: 30, height: 30, borderRadius: 7, flexShrink: 0,
                      background: i === queueIndex ? 'var(--accent)' : 'var(--surface)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontFamily: 'var(--mono)',
                      color: i === queueIndex ? '#fff' : 'var(--text3)',
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
                      <div style={{ fontSize: 11, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {track.artist}
                      </div>
                    </div>

                    <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)', flexShrink: 0 }}>
                      {fmt(track.duration)}
                    </div>

                    {isHost && (
                      <button
                        onClick={e => { e.stopPropagation(); removeTrack(i); }}
                        style={{
                          background: 'none', border: 'none', color: 'var(--text3)',
                          cursor: 'pointer', fontSize: 16, padding: '0 2px', lineHeight: 1,
                          flexShrink: 0,
                        }}
                        title="Remove"
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
