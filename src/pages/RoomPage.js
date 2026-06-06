import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import Avatar from '../components/Avatar';

function fmt(sec) {
  if (!sec || isNaN(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function reorder(list, from, to) {
  const result = [...list];
  const [removed] = result.splice(from, 1);
  result.splice(to, 0, removed);
  return result;
}

function timeFmt(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ── Emoji picker data ─────────────────────────────────────────────────────────
const EMOJI_GROUPS = [
  { label: 'Smileys', emojis: ['😀','😂','😍','🥰','😎','🤩','😭','😅','🤔','😏','😴','🥳','😤','🤯','😇','🤗','😬','🙄','🥺','😈'] },
  { label: 'Music', emojis: ['🎵','🎶','🎸','🎹','🥁','🎺','🎻','🎤','🎧','🎼','🎷','🪗','🪘','🔊','📻','🎙','🎚','🎛','🎬','🎭'] },
  { label: 'Hands', emojis: ['👍','👎','👏','🙌','🤝','🤜','🤛','✊','👊','🤙','💪','🙏','👆','🖕','✌','🤞','🤟','🤘','👌','🤌'] },
  { label: 'Hearts', emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','💕','💞','💓','💗','💖','💘','💝','💟','♥️','❣️','💔','🫀'] },
  { label: 'Objects', emojis: ['🔥','✨','💫','⭐','🌟','💥','🎉','🎊','🎁','🏆','🥇','🎖','🏅','🌈','☀️','🌙','⚡','❄️','🌊','💎'] },
  { label: 'Food', emojis: ['🍕','🍔','🍟','🌮','🍣','🍜','🍩','🍪','🎂','🍦','☕','🧃','🥤','🍺','🍻','🥂','🍷','🧊','🫖','🧋'] },
];

function EmojiPicker({ onSelect }) {
  const [activeGroup, setActiveGroup] = useState(0);

  return (
    <div style={{
      position: 'absolute', bottom: '100%', right: 0, marginBottom: 8,
      background: 'var(--bg3)', border: '1px solid var(--border2)',
      borderRadius: 14, padding: 12, width: 280,
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      zIndex: 100,
    }}>
      {/* Group tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 10, overflowX: 'auto' }}>
        {EMOJI_GROUPS.map((g, i) => (
          <button key={i} onClick={() => setActiveGroup(i)} style={{
            background: activeGroup === i ? 'var(--surface2)' : 'transparent',
            border: 'none', borderRadius: 6, padding: '4px 8px',
            fontSize: 11, color: activeGroup === i ? 'var(--text)' : 'var(--text3)',
            cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'var(--font)',
          }}>
            {g.label}
          </button>
        ))}
      </div>
      {/* Emoji grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 2 }}>
        {EMOJI_GROUPS[activeGroup].emojis.map((e, i) => (
          <button key={i} onClick={() => onSelect(e)} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 18, padding: '3px', borderRadius: 6, lineHeight: 1,
            transition: 'background 0.1s',
          }}
            onMouseEnter={ev => ev.currentTarget.style.background = 'var(--surface)'}
            onMouseLeave={ev => ev.currentTarget.style.background = 'none'}
          >{e}</button>
        ))}
      </div>
    </div>
  );
}

// ── Chat message component ────────────────────────────────────────────────────
function ChatMessage({ msg, isOwn }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: isOwn ? 'row-reverse' : 'row',
      alignItems: 'flex-end',
      gap: 8,
      marginBottom: 12,
      padding: '0 12px',
    }}>
      {!isOwn && <Avatar name={msg.name} size={26} style={{ flexShrink: 0, marginBottom: 2 }} />}
      <div style={{ maxWidth: '72%' }}>
        {!isOwn && (
          <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 3, marginLeft: 2 }}>
            {msg.name}
          </div>
        )}
        <div style={{
          background: isOwn ? 'var(--accent)' : 'var(--surface)',
          border: `1px solid ${isOwn ? 'transparent' : 'var(--border)'}`,
          borderRadius: isOwn ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
          padding: '8px 12px',
          fontSize: 14,
          lineHeight: 1.5,
          wordBreak: 'break-word',
          color: isOwn ? '#fff' : 'var(--text)',
        }}>
          {msg.text}
        </div>
        <div style={{
          fontSize: 10, color: 'var(--text3)', marginTop: 3,
          textAlign: isOwn ? 'right' : 'left',
          fontFamily: 'var(--mono)',
          marginLeft: isOwn ? 0 : 2, marginRight: isOwn ? 2 : 0,
        }}>
          {timeFmt(msg.ts)}
        </div>
      </div>
    </div>
  );
}

// ── System message (join/leave/track change) ──────────────────────────────────
function SystemMessage({ text }) {
  return (
    <div style={{
      textAlign: 'center', padding: '4px 16px', marginBottom: 10,
      fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)',
    }}>
      {text}
    </div>
  );
}

export default function RoomPage({ user, room, onLeave }) {
  const socketRef = useRef(null);
  const audioRef = useRef(new Audio());
  const serverUrl = `http://${room.host}:${room.port}`;

  const [connected, setConnected] = useState(false);
  const [connError, setConnError] = useState('');
  const [members, setMembers] = useState([]);

  const [queue, setQueue] = useState([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const queueRef = useRef([]);
  const queueIndexRef = useRef(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);

  const [showQueue, setShowQueue] = useState(false);
  const [showChat, setShowChat] = useState(true);
  const [shuffle, setShuffle] = useState(false);
  const shuffleRef = useRef(false);

  const dragFrom = useRef(null);
  const [dragOver, setDragOver] = useState(null);
  const [loadingFolder, setLoadingFolder] = useState(false);

  // ── Chat state ────────────────────────────────────────────────────────────────
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const chatEndRef = useRef(null);
  const chatInputRef = useRef(null);
  const emojiPickerRef = useRef(null);

  const isHost = room.isHost;

  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { queueIndexRef.current = queueIndex; }, [queueIndex]);
  useEffect(() => { shuffleRef.current = shuffle; }, [shuffle]);

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Track unread when chat is hidden
  useEffect(() => {
    if (showChat) setUnreadCount(0);
  }, [showChat]);

  // Close emoji picker on outside click
  useEffect(() => {
    const handler = (e) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target)) {
        setShowEmoji(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

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

  const loadAndPlay = useCallback((track, pos) => {
    if (!track) return;
    const audio = audioRef.current;
    const url = `${serverUrl}/audio?path=${encodeURIComponent(track.path)}`;
    if (audio.src !== url) { audio.src = url; audio.load(); }
    audio.currentTime = pos || 0;
    setDuration(track.duration || 0);
    audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
  }, [serverUrl]);

  const advanceTrack = useCallback(() => {
    const q = queueRef.current;
    if (!q.length) return;
    let nextIndex;
    if (shuffleRef.current) {
      nextIndex = Math.floor(Math.random() * q.length);
    } else {
      nextIndex = queueIndexRef.current + 1;
      if (nextIndex >= q.length) return;
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
      setQueue(q); queueRef.current = q;
      setMembers(roomState.members || []);
      let idx = 0;
      if (roomState.currentTrack) {
        const found = q.findIndex(t => t.path === roomState.currentTrack?.path);
        if (found >= 0) idx = found;
      }
      setQueueIndex(idx); queueIndexRef.current = idx;
      if (roomState.isPlaying && roomState.currentTrack) {
        const syncPos = roomState.position + (Date.now() - roomState.positionTimestamp) / 1000;
        loadAndPlay(roomState.currentTrack, syncPos);
      }
      // System message
      setMessages(prev => [...prev, { type: 'system', text: `You joined the room`, ts: Date.now() }]);
    });

    socket.on('members', (updatedMembers) => {
      setMembers(prev => {
        const prevNames = new Set(prev.map(m => m.name));
        const newNames = new Set(updatedMembers.map(m => m.name));
        updatedMembers.forEach(m => {
          if (!prevNames.has(m.name) && m.name !== user.name) {
            setMessages(msgs => [...msgs, { type: 'system', text: `${m.name} joined`, ts: Date.now() }]);
          }
        });
        prev.forEach(m => {
          if (!newNames.has(m.name)) {
            setMessages(msgs => [...msgs, { type: 'system', text: `${m.name} left`, ts: Date.now() }]);
          }
        });
        return updatedMembers;
      });
    });

    socket.on('play-track', ({ track, index, position: pos }) => {
      setQueueIndex(index); queueIndexRef.current = index;
      loadAndPlay(track, pos || 0); setIsPlaying(true);
      setMessages(prev => [...prev, { type: 'system', text: `▶ Now playing: ${track.title}`, ts: Date.now() }]);
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

    socket.on('queue-update', ({ queue: q, currentTrack, currentIndex }) => {
      setQueue(q || []); queueRef.current = q || [];
      if (currentIndex !== undefined) { setQueueIndex(currentIndex); queueIndexRef.current = currentIndex; }
      else if (currentTrack) {
        const idx = (q || []).findIndex(t => t.path === currentTrack.path);
        if (idx >= 0) { setQueueIndex(idx); queueIndexRef.current = idx; }
      }
    });

    socket.on('volume', ({ volume: v }) => setVolume(v));

    // ── Chat ──────────────────────────────────────────────────────────────────
    socket.on('chat', (msg) => {
      setMessages(prev => [...prev, { type: 'chat', ...msg }]);
      setUnreadCount(prev => showChat ? 0 : prev + 1);
    });

    return () => { socket.disconnect(); };
  }, [room, serverUrl, loadAndPlay]); // eslint-disable-line

  // IPC for host
  useEffect(() => {
    if (!isHost) return;
    window.electron?.onPlayTrack(({ track, index, position: pos }) => {
      setQueueIndex(index); queueIndexRef.current = index;
      loadAndPlay(track, pos || 0);
    });
    window.electron?.onPlaybackPause(({ position: pos }) => {
      audioRef.current.pause();
      if (pos !== undefined) audioRef.current.currentTime = pos;
      setIsPlaying(false);
    });
    window.electron?.onQueueUpdate(({ queue: q, currentIndex }) => {
      setQueue(q || []); queueRef.current = q || [];
      if (currentIndex !== undefined) { setQueueIndex(currentIndex); queueIndexRef.current = currentIndex; }
    });
    return () => {
      ['play-track','playback-pause','queue-update'].forEach(ch =>
        window.electron?.removeAllListeners(ch));
    };
  }, [isHost, loadAndPlay]);

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
    let nextIndex = shuffleRef.current
      ? Math.floor(Math.random() * q.length)
      : Math.min(queueIndexRef.current + 1, q.length - 1);
    if (nextIndex === queueIndexRef.current && !shuffleRef.current) return;
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
    broadcast('queue-update', { queue: newQueue, currentTrack: newQueue[newIndex] || null, currentIndex: newIndex });
  };

  const addFiles = async () => {
    if (!isHost) return;
    const tracks = await window.electron?.pickFiles();
    if (!tracks?.length) return;
    const newQueue = [...queueRef.current, ...tracks];
    const newIndex = queueIndexRef.current;
    setQueue(newQueue); queueRef.current = newQueue;
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
      setQueue(newQueue); queueRef.current = newQueue;
      broadcastQueueUpdate(newQueue, newIndex);
      if (newQueue.length === tracks.length) playTrackAt(0);
    } finally { setLoadingFolder(false); }
  };

  const removeTrack = (index) => {
    const newQueue = queueRef.current.filter((_, i) => i !== index);
    let newIndex = queueIndexRef.current;
    if (index < newIndex) newIndex--;
    else if (index === newIndex) newIndex = Math.min(newIndex, newQueue.length - 1);
    newIndex = Math.max(0, newIndex);
    setQueue(newQueue); queueRef.current = newQueue;
    setQueueIndex(newIndex); queueIndexRef.current = newIndex;
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
      setQueue(newQueue); queueRef.current = newQueue;
      setQueueIndex(0); queueIndexRef.current = 0;
      broadcastQueueUpdate(newQueue, 0);
    }
  };

  // ── Drag and drop ─────────────────────────────────────────────────────────────
  const handleDragStart = (e, index) => { dragFrom.current = index; e.dataTransfer.effectAllowed = 'move'; };
  const handleDragOver = (e, index) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOver(index); };
  const handleDrop = (e, toIndex) => {
    e.preventDefault(); setDragOver(null);
    if (dragFrom.current === null || dragFrom.current === toIndex) return;
    const newQueue = reorder(queueRef.current, dragFrom.current, toIndex);
    let newIndex = queueIndexRef.current;
    if (dragFrom.current === newIndex) newIndex = toIndex;
    else if (dragFrom.current < newIndex && toIndex >= newIndex) newIndex--;
    else if (dragFrom.current > newIndex && toIndex <= newIndex) newIndex++;
    newIndex = Math.max(0, Math.min(newIndex, newQueue.length - 1));
    setQueue(newQueue); queueRef.current = newQueue;
    setQueueIndex(newIndex); queueIndexRef.current = newIndex;
    broadcastQueueUpdate(newQueue, newIndex);
    dragFrom.current = null;
  };
  const handleDragEnd = () => { setDragOver(null); dragFrom.current = null; };

  // ── Chat controls ─────────────────────────────────────────────────────────────
  const sendMessage = () => {
    const text = chatInput.trim();
    if (!text) return;
    broadcast('chat', { name: user.name, text, ts: Date.now() });
    setChatInput('');
    setShowEmoji(false);
    chatInputRef.current?.focus();
  };

  const handleChatKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleEmojiSelect = (emoji) => {
    setChatInput(prev => prev + emoji);
    chatInputRef.current?.focus();
  };

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
        width: 210, flexShrink: 0,
        background: 'var(--bg2)', borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', padding: 16, gap: 4,
      }}>
        <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 12 }}>
          ◈ {room.name}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 700, marginBottom: 6, letterSpacing: '0.08em' }}>
          LISTENERS · {members.length}
        </div>
        {members.map((m, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', borderRadius: 8 }}>
            <div style={{ position: 'relative' }}>
              <Avatar name={m.name} size={28} />
              {isPlaying && (
                <div style={{
                  position: 'absolute', bottom: -2, right: -2,
                  display: 'flex', gap: 1.5, alignItems: 'flex-end',
                  background: 'var(--bg2)', borderRadius: 3, padding: '1px 2px',
                }}>
                  {[0, 80, 160].map(d => (
                    <div key={d} style={{
                      width: 2, height: 5, background: 'var(--green)', borderRadius: 1,
                      animation: 'wave 0.8s ease-in-out infinite', animationDelay: `${d}ms`,
                    }} />
                  ))}
                </div>
              )}
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{m.name}</div>
              {m.name === user.name && <div style={{ fontSize: 10, color: 'var(--text3)' }}>You{isHost ? ' · Host' : ''}</div>}
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
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

        {/* Top bar */}
        <div style={{
          padding: '10px 20px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
          flexShrink: 0,
        }}>
          <div style={{
            width: 7, height: 7, borderRadius: '50%',
            background: connected ? 'var(--green)' : 'var(--red)',
            boxShadow: connected ? '0 0 8px var(--green)' : 'none',
          }} />
          <span style={{ color: 'var(--text2)', fontSize: 13 }}>
            {connected ? `${isHost ? 'Hosting' : 'Guest'}` : 'Connecting…'}
          </span>
          <div style={{ flex: 1 }} />
          {isHost && (
            <>
              <button className="btn btn-surface btn-sm" onClick={addFiles}>+ Files</button>
              <button className="btn btn-surface btn-sm" onClick={addFolder} disabled={loadingFolder}>
                {loadingFolder ? '⟳ Scanning…' : '+ Folder'}
              </button>
            </>
          )}
          <button className="btn btn-ghost btn-sm" onClick={handleShuffle}
            style={{ color: shuffle ? 'var(--accent2)' : 'var(--text2)', borderColor: shuffle ? 'var(--accent)' : undefined }}>
            ⇄ Shuffle
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowQueue(!showQueue)}
            style={{ color: showQueue ? 'var(--accent2)' : undefined }}>
            ☰ Queue {queue.length > 0 && `(${queue.length})`}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => { setShowChat(!showChat); setUnreadCount(0); }}
            style={{ color: showChat ? 'var(--accent2)' : undefined, position: 'relative' }}>
            💬 Chat
            {unreadCount > 0 && !showChat && (
              <span style={{
                position: 'absolute', top: -6, right: -6,
                background: 'var(--accent)', color: '#fff',
                borderRadius: '50%', width: 18, height: 18,
                fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700,
              }}>{unreadCount > 9 ? '9+' : unreadCount}</span>
            )}
          </button>
        </div>

        {/* Player + panels row */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

          {/* Now playing */}
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            padding: '28px 32px', gap: 22, minWidth: 0,
          }}>
            {/* Album art */}
            <div style={{
              width: 170, height: 170, borderRadius: 18, flexShrink: 0,
              background: currentTrack ? 'linear-gradient(135deg, var(--accent) 0%, var(--bg3) 100%)' : 'var(--surface)',
              border: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 54,
              boxShadow: isPlaying ? '0 0 50px rgba(124,106,247,0.3)' : 'none',
              transition: 'box-shadow 0.5s ease',
              animation: isPlaying ? 'pulse 2s ease-in-out infinite' : 'none',
            }}>
              {currentTrack ? '♫' : '🎵'}
            </div>

            {/* Track info */}
            <div style={{ textAlign: 'center', maxWidth: 300, width: '100%' }}>
              <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {currentTrack?.title || 'No track loaded'}
              </div>
              <div style={{ color: 'var(--text2)', fontSize: 13 }}>
                {currentTrack?.artist || (isHost ? 'Add music above' : 'Waiting for host…')}
              </div>
              {currentTrack?.album && <div style={{ color: 'var(--text3)', fontSize: 12, marginTop: 2 }}>{currentTrack.album}</div>}
              <div style={{ color: 'var(--text3)', fontSize: 11, fontFamily: 'var(--mono)', marginTop: 5 }}>
                {queue.length > 0 && `${queueIndex + 1} / ${queue.length}`}
              </div>
            </div>

            {/* Progress */}
            <div style={{ width: '100%', maxWidth: 320 }}>
              <input type="range" min={0} max={dur} step={0.1} value={position}
                onChange={handleSeek} style={{ width: '100%', accentColor: 'var(--accent)' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)', marginTop: 3 }}>
                <span>{fmt(position)}</span><span>{fmt(dur)}</span>
              </div>
            </div>

            {/* Controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <button className="btn btn-icon" onClick={handlePrev}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>
              </button>
              <button onClick={isPlaying ? handlePause : handlePlay} disabled={!currentTrack} style={{
                width: 52, height: 52, borderRadius: '50%', background: 'var(--accent)',
                border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', boxShadow: '0 0 20px rgba(124,106,247,0.5)', transition: 'all 0.15s',
                opacity: currentTrack ? 1 : 0.4,
              }}>
                {isPlaying
                  ? <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                  : <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                }
              </button>
              <button className="btn btn-icon" onClick={handleNext}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6h2v12h-2z"/></svg>
              </button>
            </div>

            {/* Volume */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', maxWidth: 240 }}>
              <svg width="13" height="13" fill="var(--text3)" viewBox="0 0 24 24">
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
              </svg>
              <input type="range" min={0} max={1} step={0.01} value={volume}
                onChange={handleVolumeChange} style={{ flex: 1, accentColor: 'var(--accent2)' }} />
              <svg width="13" height="13" fill="var(--text3)" viewBox="0 0 24 24">
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
              </svg>
            </div>
          </div>

          {/* ── Queue panel ── */}
          {showQueue && (
            <div style={{
              width: 280, borderLeft: '1px solid var(--border)',
              background: 'var(--bg2)', display: 'flex', flexDirection: 'column', overflow: 'hidden',
            }}>
              <div style={{ padding: '13px 14px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Queue · {queue.length}</span>
                <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 400 }}>drag to reorder</span>
              </div>
              <div style={{ flex: 1, overflow: 'auto', padding: 5 }}>
                {queue.length === 0 && (
                  <div style={{ padding: 20, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
                    {isHost ? 'Add with "+ Files" or "+ Folder"' : 'No tracks yet'}
                  </div>
                )}
                {queue.map((track, i) => (
                  <div key={`${track.path}-${i}`}
                    className={`track-item ${i === queueIndex ? 'active' : ''}`}
                    onClick={() => playTrackAt(i)}
                    draggable
                    onDragStart={e => handleDragStart(e, i)}
                    onDragOver={e => handleDragOver(e, i)}
                    onDrop={e => handleDrop(e, i)}
                    onDragEnd={handleDragEnd}
                    style={{
                      outline: dragOver === i ? '2px solid var(--accent)' : 'none',
                      opacity: dragFrom.current === i ? 0.4 : 1,
                      cursor: 'grab',
                    }}
                  >
                    <div style={{
                      width: 28, height: 28, borderRadius: 6, flexShrink: 0,
                      background: i === queueIndex ? 'var(--accent)' : 'var(--surface)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontFamily: 'var(--mono)', color: i === queueIndex ? '#fff' : 'var(--text3)',
                    }}>
                      {i === queueIndex && isPlaying ? '♫' : i + 1}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="track-title" style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {track.title}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {track.artist}
                      </div>
                    </div>
                    <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', flexShrink: 0 }}>
                      {fmt(track.duration)}
                    </div>
                    {isHost && (
                      <button onClick={e => { e.stopPropagation(); removeTrack(i); }}
                        style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 15, padding: '0 2px', lineHeight: 1, flexShrink: 0 }}
                      >×</button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Chat panel ── */}
          {showChat && (
            <div style={{
              width: 300, borderLeft: '1px solid var(--border)',
              background: 'var(--bg2)', display: 'flex', flexDirection: 'column', overflow: 'hidden',
            }}>
              {/* Chat header */}
              <div style={{ padding: '13px 16px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>💬 Chat</span>
                <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 400 }}>{members.length} online</span>
              </div>

              {/* Messages */}
              <div style={{ flex: 1, overflow: 'auto', padding: '10px 0' }}>
                {messages.length === 0 && (
                  <div style={{ padding: '30px 20px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
                    No messages yet. Say hello! 👋
                  </div>
                )}
                {messages.map((msg, i) => (
                  msg.type === 'system'
                    ? <SystemMessage key={i} text={msg.text} />
                    : <ChatMessage key={i} msg={msg} isOwn={msg.name === user.name} />
                ))}
                <div ref={chatEndRef} />
              </div>

              {/* Input area */}
              <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)', position: 'relative' }}>
                {showEmoji && (
                  <div ref={emojiPickerRef}>
                    <EmojiPicker onSelect={handleEmojiSelect} />
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                  <div style={{ flex: 1, position: 'relative' }}>
                    <textarea
                      ref={chatInputRef}
                      value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                      onKeyDown={handleChatKey}
                      placeholder="Message the room…"
                      rows={1}
                      maxLength={500}
                      style={{
                        width: '100%', resize: 'none',
                        background: 'var(--surface)', border: '1px solid var(--border)',
                        borderRadius: 10, padding: '8px 12px',
                        color: 'var(--text)', fontSize: 13, fontFamily: 'var(--font)',
                        outline: 'none', lineHeight: 1.5,
                        maxHeight: 80, overflowY: 'auto',
                        boxSizing: 'border-box',
                        transition: 'border-color 0.15s',
                      }}
                      onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                      onBlur={e => e.target.style.borderColor = 'var(--border)'}
                    />
                  </div>
                  <button
                    onClick={() => setShowEmoji(!showEmoji)}
                    style={{
                      background: showEmoji ? 'var(--surface2)' : 'var(--surface)',
                      border: `1px solid ${showEmoji ? 'var(--accent)' : 'var(--border)'}`,
                      borderRadius: 10, width: 36, height: 36,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', fontSize: 16, flexShrink: 0,
                      transition: 'all 0.15s',
                    }}
                    title="Emoji"
                  >😊</button>
                  <button
                    onClick={sendMessage}
                    disabled={!chatInput.trim()}
                    style={{
                      background: chatInput.trim() ? 'var(--accent)' : 'var(--surface)',
                      border: 'none', borderRadius: 10, width: 36, height: 36,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: chatInput.trim() ? 'pointer' : 'default',
                      color: chatInput.trim() ? '#fff' : 'var(--text3)',
                      flexShrink: 0, transition: 'all 0.15s',
                    }}
                    title="Send (Enter)"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                    </svg>
                  </button>
                </div>
                <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4, textAlign: 'right', fontFamily: 'var(--mono)' }}>
                  Enter to send · Shift+Enter new line
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
