import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import Avatar from '../components/Avatar';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(sec) {
  if (!sec || isNaN(sec)) return '0:00';
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
function reorder(list, from, to) {
  const r = [...list]; const [rem] = r.splice(from, 1); r.splice(to, 0, rem); return r;
}
function timeFmt(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function isYtUrl(s) {
  return /youtube\.com\/watch|youtu\.be\//.test(s);
}

// ─── Emoji picker ─────────────────────────────────────────────────────────────
const EMOJI_GROUPS = [
  { label: 'Smileys', emojis: ['😀','😂','😍','🥰','😎','🤩','😭','😅','🤔','😏','😴','🥳','😤','🤯','😇','🤗','😬','🙄','🥺','😈'] },
  { label: 'Music',   emojis: ['🎵','🎶','🎸','🎹','🥁','🎺','🎻','🎤','🎧','🎼','🎷','🪗','🪘','🔊','📻','🎙','🎚','🎛','🎬','🎭'] },
  { label: 'Hands',   emojis: ['👍','👎','👏','🙌','🤝','🤜','🤛','✊','👊','🤙','💪','🙏','👆','✌','🤞','🤟','🤘','👌','🤌','🫶'] },
  { label: 'Hearts',  emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','💕','💞','💓','💗','💖','💘','💝','💟','♥️','❣️','💔','🫀'] },
  { label: 'Objects', emojis: ['🔥','✨','💫','⭐','🌟','💥','🎉','🎊','🎁','🏆','🥇','🎖','🏅','🌈','☀️','🌙','⚡','❄️','🌊','💎'] },
  { label: 'Food',    emojis: ['🍕','🍔','🍟','🌮','🍣','🍜','🍩','🍪','🎂','🍦','☕','🧃','🥤','🍺','🍻','🥂','🍷','🧊','🫖','🧋'] },
];

function EmojiPicker({ onSelect }) {
  const [g, setG] = useState(0);
  return (
    <div style={{ position:'absolute', bottom:'100%', right:0, marginBottom:8, background:'var(--bg3)', border:'1px solid var(--border2)', borderRadius:14, padding:12, width:280, boxShadow:'0 8px 32px rgba(0,0,0,0.5)', zIndex:100 }}>
      <div style={{ display:'flex', gap:4, marginBottom:10, overflowX:'auto' }}>
        {EMOJI_GROUPS.map((gr, i) => (
          <button key={i} onClick={() => setG(i)} style={{ background: g===i?'var(--surface2)':'transparent', border:'none', borderRadius:6, padding:'4px 8px', fontSize:11, color: g===i?'var(--text)':'var(--text3)', cursor:'pointer', whiteSpace:'nowrap', fontFamily:'var(--font)' }}>{gr.label}</button>
        ))}
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(10,1fr)', gap:2 }}>
        {EMOJI_GROUPS[g].emojis.map((e,i) => (
          <button key={i} onClick={() => onSelect(e)} style={{ background:'none', border:'none', cursor:'pointer', fontSize:18, padding:3, borderRadius:6, lineHeight:1 }}
            onMouseEnter={ev => ev.currentTarget.style.background='var(--surface)'}
            onMouseLeave={ev => ev.currentTarget.style.background='none'}
          >{e}</button>
        ))}
      </div>
    </div>
  );
}

// ─── Track type badge ──────────────────────────────────────────────────────────
function TrackBadge({ type }) {
  if (!type || type !== 'youtube') return null;
  return (
    <span style={{ fontSize:9, fontFamily:'var(--mono)', background:'rgba(255,0,0,0.15)', color:'#ff6b6b', border:'1px solid rgba(255,0,0,0.25)', borderRadius:4, padding:'1px 5px', letterSpacing:'0.05em', flexShrink:0 }}>YT</span>
  );
}

// ─── YouTube search panel ─────────────────────────────────────────────────────
function YtPanel({ serverUrl, onAdd, onClose, ytAvailable }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [added, setAdded] = useState(new Set());
  const socketRef = useRef(null);

  useEffect(() => {
    const s = io(serverUrl, { transports: ['websocket'] });
    socketRef.current = s;
    s.on('yt-search-result', ({ results: r, error: e, requestId }) => {
      if (requestId === 'panel') {
        setLoading(false);
        if (e) setError(e);
        else setResults(r || []);
      }
    });
    s.on('yt-resolve-result', ({ track, error: e, requestId }) => {
      if (requestId === 'resolve') {
        setLoading(false);
        if (e) setError('Could not resolve that URL');
        else { onAdd(track); setAdded(prev => new Set([...prev, track.ytId])); }
      }
    });
    return () => s.disconnect();
  }, [serverUrl]); // eslint-disable-line

  const doSearch = () => {
    if (!query.trim()) return;
    setError(''); setResults([]);
    if (isYtUrl(query.trim())) {
      setLoading(true);
      socketRef.current?.emit('yt-resolve', { url: query.trim(), requestId: 'resolve' });
    } else {
      setLoading(true);
      socketRef.current?.emit('yt-search', { query: query.trim(), requestId: 'panel' });
    }
  };

  const handleAdd = (track) => {
    onAdd(track);
    setAdded(prev => new Set([...prev, track.ytId]));
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
      {/* Header */}
      <div style={{ padding:'14px 16px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:10 }}>
        <span style={{ fontSize:16 }}>▶️</span>
        <span style={{ fontWeight:700, fontSize:14 }}>YouTube</span>
        <div style={{ flex:1 }} />
        <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--text3)', cursor:'pointer', fontSize:18, lineHeight:1, padding:'0 2px' }}>×</button>
      </div>

      {!ytAvailable && (
        <div style={{ margin:12, background:'rgba(251,146,60,0.1)', border:'1px solid rgba(251,146,60,0.3)', borderRadius:10, padding:12, fontSize:12, color:'#fb923c', lineHeight:1.6 }}>
          ⚠️ yt-dlp is not installed on the host machine. YouTube features are unavailable.<br/>
          See README for install instructions.
        </div>
      )}

      {/* Search input */}
      <div style={{ padding:12 }}>
        <div style={{ display:'flex', gap:8 }}>
          <input
            className="input"
            placeholder="Search or paste YouTube URL…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && doSearch()}
            disabled={!ytAvailable}
            style={{ flex:1, fontSize:13 }}
            autoFocus
          />
          <button className="btn btn-primary btn-sm" onClick={doSearch} disabled={!ytAvailable || !query.trim() || loading} style={{ flexShrink:0 }}>
            {loading ? '⟳' : '🔍'}
          </button>
        </div>
      </div>

      {/* Results */}
      <div style={{ flex:1, overflow:'auto', padding:'0 8px 8px' }}>
        {loading && (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:10, padding:24, color:'var(--text2)', fontSize:13 }}>
            <div style={{ width:16, height:16, border:'2px solid var(--accent)', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.7s linear infinite' }} />
            {isYtUrl(query) ? 'Resolving URL…' : 'Searching YouTube…'}
          </div>
        )}
        {error && <div style={{ padding:12, color:'var(--red)', fontSize:12, textAlign:'center' }}>{error}</div>}
        {!loading && results.map((r) => (
          <div key={r.ytId} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 6px', borderRadius:10, marginBottom:4, transition:'background 0.1s' }}
            onMouseEnter={ev => ev.currentTarget.style.background='var(--surface)'}
            onMouseLeave={ev => ev.currentTarget.style.background='transparent'}
          >
            {/* Thumbnail */}
            <div style={{ width:56, height:40, borderRadius:6, overflow:'hidden', flexShrink:0, background:'var(--surface)' }}>
              <img src={r.thumbnail} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} onError={e => e.target.style.display='none'} />
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:12, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginBottom:2 }}>{r.title}</div>
              <div style={{ fontSize:11, color:'var(--text3)', display:'flex', alignItems:'center', gap:6 }}>
                <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.artist}</span>
                <span style={{ flexShrink:0 }}>· {fmt(r.duration)}</span>
              </div>
            </div>
            <button
              onClick={() => handleAdd({ ...r, type: 'youtube' })}
              disabled={added.has(r.ytId)}
              style={{
                background: added.has(r.ytId) ? 'var(--surface)' : 'var(--accent)',
                border:'none', borderRadius:8, width:28, height:28,
                display:'flex', alignItems:'center', justifyContent:'center',
                cursor: added.has(r.ytId) ? 'default' : 'pointer',
                color: added.has(r.ytId) ? 'var(--text3)' : '#fff',
                fontSize:14, flexShrink:0, transition:'all 0.15s',
              }}
            >{added.has(r.ytId) ? '✓' : '+'}</button>
          </div>
        ))}
        {!loading && !error && results.length === 0 && query && (
          <div style={{ padding:20, textAlign:'center', color:'var(--text3)', fontSize:13 }}>No results. Try a different search.</div>
        )}
        {!loading && !error && results.length === 0 && !query && (
          <div style={{ padding:20, textAlign:'center', color:'var(--text3)', fontSize:13, lineHeight:1.7 }}>
            Search for any song, artist, or album.<br/>Or paste a YouTube URL directly.
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Chat message ─────────────────────────────────────────────────────────────
function ChatMessage({ msg, isOwn }) {
  return (
    <div style={{ display:'flex', flexDirection: isOwn?'row-reverse':'row', alignItems:'flex-end', gap:7, marginBottom:10, padding:'0 10px' }}>
      {!isOwn && <Avatar name={msg.name} size={24} style={{ flexShrink:0, marginBottom:2 }} />}
      <div style={{ maxWidth:'74%' }}>
        {!isOwn && <div style={{ fontSize:10, color:'var(--text3)', marginBottom:2, marginLeft:2 }}>{msg.name}</div>}
        <div style={{ background: isOwn?'var(--accent)':'var(--surface)', border:`1px solid ${isOwn?'transparent':'var(--border)'}`, borderRadius: isOwn?'12px 12px 3px 12px':'12px 12px 12px 3px', padding:'7px 11px', fontSize:13, lineHeight:1.5, wordBreak:'break-word', color: isOwn?'#fff':'var(--text)' }}>
          {msg.text}
        </div>
        <div style={{ fontSize:10, color:'var(--text3)', marginTop:2, textAlign: isOwn?'right':'left', fontFamily:'var(--mono)', marginLeft: isOwn?0:2, marginRight: isOwn?2:0 }}>{timeFmt(msg.ts)}</div>
      </div>
    </div>
  );
}

function SystemMsg({ text }) {
  return <div style={{ textAlign:'center', padding:'3px 16px', marginBottom:8, fontSize:10, color:'var(--text3)', fontFamily:'var(--mono)' }}>{text}</div>;
}

// ─── Main Room component ──────────────────────────────────────────────────────
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
  const [shuffle, setShuffle] = useState(false);
  const shuffleRef = useRef(false);

  // Panel state — only one right panel open at a time
  const [rightPanel, setRightPanel] = useState('chat'); // 'queue' | 'chat' | 'youtube' | null
  const [unread, setUnread] = useState(0);

  // Drag
  const dragFrom = useRef(null);
  const [dragOver, setDragOver] = useState(null);
  const [loadingFolder, setLoadingFolder] = useState(false);

  // YouTube
  const [ytAvailable, setYtAvailable] = useState(false);

  // Chat
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const chatEndRef = useRef(null);
  const chatInputRef = useRef(null);
  const emojiRef = useRef(null);

  const isHost = room.isHost;

  // Sync refs
  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { queueIndexRef.current = queueIndex; }, [queueIndex]);
  useEffect(() => { shuffleRef.current = shuffle; }, [shuffle]);

  // Auto-scroll chat
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => { if (rightPanel === 'chat') setUnread(0); }, [rightPanel]);

  // Close emoji on outside click
  useEffect(() => {
    const h = e => { if (emojiRef.current && !emojiRef.current.contains(e.target)) setShowEmoji(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // Check yt-dlp on mount
  useEffect(() => {
    window.electron?.checkYtdlp().then(r => setYtAvailable(r?.available || false));
  }, []);

  // ── Audio ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const audio = audioRef.current;
    audio.volume = volume;
    const onTime = () => setPosition(audio.currentTime);
    const onMeta = () => setDuration(audio.duration);
    const onEnd = () => advanceTrack();
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('ended', onEnd);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('ended', onEnd);
      audio.pause();
    };
  }, []); // eslint-disable-line

  useEffect(() => { audioRef.current.volume = volume; }, [volume]);

  const getAudioUrl = useCallback((track) => {
    if (!track) return '';
    if (track.type === 'youtube' && track.ytUrl) return `${serverUrl}/ytstream?url=${encodeURIComponent(track.ytUrl)}`;
    return `${serverUrl}/audio?path=${encodeURIComponent(track.path)}`;
  }, [serverUrl]);

  const loadAndPlay = useCallback((track, pos) => {
    if (!track || !track.type) return;
    const audio = audioRef.current;
    const url = getAudioUrl(track);
    if (audio.src !== url) { audio.src = url; audio.load(); }
    audio.currentTime = pos || 0;
    setDuration(track.duration || 0);
    audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
  }, [getAudioUrl]);

  const advanceTrack = useCallback(() => {
    const q = queueRef.current;
    if (!q.length) return;
    const nextIndex = shuffleRef.current
      ? Math.floor(Math.random() * q.length)
      : queueIndexRef.current + 1;
    if (!shuffleRef.current && nextIndex >= q.length) return;
    const nextTrack = q[nextIndex];
    setQueueIndex(nextIndex);
    loadAndPlay(nextTrack, 0);
    socketRef.current?.emit('play-track', { track: nextTrack, index: nextIndex, position: 0 });
  }, [loadAndPlay]);

  // ── Socket ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const socket = io(serverUrl, { transports: ['websocket'] });
    socketRef.current = socket;

    socket.on('connect', () => { setConnected(true); setConnError(''); socket.emit('join', { name: user.name, password: room.password }); });
    socket.on('connect_error', () => setConnError('Cannot connect. Check host is running and on same WiFi.'));
    socket.on('error', ({ message }) => setConnError(message));

    socket.on('joined', ({ roomState }) => {
      const q = (roomState.queue || []).filter(t => t && t.type);
      setQueue(q); queueRef.current = q;
      setMembers(roomState.members || []);
      let idx = 0;
      if (roomState.currentTrack) {
        const f = q.findIndex(t => (t.type === 'youtube' ? t.ytId : t.path) === (roomState.currentTrack.type === 'youtube' ? roomState.currentTrack.ytId : roomState.currentTrack.path));
        if (f >= 0) idx = f;
      }
      setQueueIndex(idx); queueIndexRef.current = idx;
      if (roomState.isPlaying && roomState.currentTrack) {
        const syncPos = roomState.position + (Date.now() - roomState.positionTimestamp) / 1000;
        loadAndPlay(roomState.currentTrack, syncPos);
      }
      setMessages(prev => [...prev, { type: 'system', text: 'You joined the room', ts: Date.now() }]);
    });

    socket.on('members', (updated) => {
      setMembers(prev => {
        const pn = new Set(prev.map(m => m.name)), nn = new Set(updated.map(m => m.name));
        updated.forEach(m => { if (!pn.has(m.name) && m.name !== user.name) setMessages(ms => [...ms, { type:'system', text:`${m.name} joined`, ts: Date.now() }]); });
        prev.forEach(m => { if (!nn.has(m.name)) setMessages(ms => [...ms, { type:'system', text:`${m.name} left`, ts: Date.now() }]); });
        return updated;
      });
    });

    socket.on('play-track', ({ track, index, position: pos }) => {
      setQueueIndex(index); queueIndexRef.current = index;
      loadAndPlay(track, pos || 0); setIsPlaying(true);
      setMessages(prev => [...prev, { type:'system', text:`▶ ${track.title}`, ts: Date.now() }]);
    });

    socket.on('play', ({ track, position: pos }) => { if (track) loadAndPlay(track, pos); setIsPlaying(true); });
    socket.on('pause', ({ position: pos }) => { audioRef.current.pause(); if (pos !== undefined) audioRef.current.currentTime = pos; setIsPlaying(false); });
    socket.on('seek', ({ position: pos }) => { audioRef.current.currentTime = pos; setPosition(pos); });

    socket.on('queue-update', ({ queue: q, currentTrack, currentIndex }) => {
      const safeQ = (q || []).filter(t => t && t.type);
      setQueue(safeQ); queueRef.current = safeQ;
      if (currentIndex !== undefined) { setQueueIndex(currentIndex); queueIndexRef.current = currentIndex; }
      else if (currentTrack) {
        const idx = (q || []).findIndex(t => (t.type==='youtube'?t.ytId:t.path) === (currentTrack.type==='youtube'?currentTrack.ytId:currentTrack.path));
        if (idx >= 0) { setQueueIndex(idx); queueIndexRef.current = idx; }
      }
    });

    socket.on('volume', ({ volume: v }) => setVolume(v));
    socket.on('chat', (msg) => {
      setMessages(prev => [...prev, { type:'chat', ...msg }]);
      setUnread(prev => rightPanel === 'chat' ? 0 : prev + 1);
    });

    return () => { socket.disconnect(); };
  }, [room, serverUrl, loadAndPlay]); // eslint-disable-line

  // IPC for host
  useEffect(() => {
    if (!isHost) return;
    window.electron?.onPlayTrack(({ track, index, position: pos }) => { setQueueIndex(index); queueIndexRef.current = index; loadAndPlay(track, pos||0); });
    window.electron?.onPlaybackPause(({ position: pos }) => { audioRef.current.pause(); if (pos!==undefined) audioRef.current.currentTime=pos; setIsPlaying(false); });
    window.electron?.onQueueUpdate(({ queue: q, currentIndex }) => { setQueue(q||[]); queueRef.current=q||[]; if(currentIndex!==undefined){setQueueIndex(currentIndex);queueIndexRef.current=currentIndex;} });
    return () => ['play-track','playback-pause','queue-update'].forEach(ch => window.electron?.removeAllListeners(ch));
  }, [isHost, loadAndPlay]);

  const broadcast = useCallback((event, data) => { socketRef.current?.emit(event, data); }, []);

  // ── Playback ───────────────────────────────────────────────────────────────
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
    audioRef.current.pause(); setIsPlaying(false);
    broadcast('pause', { position: pos });
  };
  const handleSeek = (e) => {
    const pos = parseFloat(e.target.value);
    audioRef.current.currentTime = pos; setPosition(pos);
    broadcast('seek', { position: pos });
  };
  const handleNext = () => {
    const q = queueRef.current; if (!q.length) return;
    const nextIndex = shuffleRef.current ? Math.floor(Math.random()*q.length) : Math.min(queueIndexRef.current+1, q.length-1);
    if (nextIndex === queueIndexRef.current && !shuffleRef.current) return;
    const track = q[nextIndex];
    setQueueIndex(nextIndex); loadAndPlay(track, 0);
    broadcast('play-track', { track, index: nextIndex, position: 0 });
  };
  const handlePrev = () => {
    const q = queueRef.current; if (!q.length) return;
    if (audioRef.current.currentTime > 3) { audioRef.current.currentTime=0; broadcast('seek',{position:0}); return; }
    const prevIndex = Math.max(queueIndexRef.current-1, 0);
    if (prevIndex === queueIndexRef.current) return;
    const track = q[prevIndex];
    setQueueIndex(prevIndex); loadAndPlay(track, 0);
    broadcast('play-track', { track, index: prevIndex, position: 0 });
  };
  const playTrackAt = (index) => {
    const track = queueRef.current[index]; if (!track) return;
    setQueueIndex(index); loadAndPlay(track, 0);
    broadcast('play-track', { track, index, position: 0 }); setIsPlaying(true);
  };
  const handleVolume = (e) => { const v=parseFloat(e.target.value); setVolume(v); broadcast('volume',{volume:v}); };

  // ── Queue management ───────────────────────────────────────────────────────
  const bcastQueue = (newQ, newIdx) => broadcast('queue-update', { queue: newQ, currentTrack: newQ[newIdx]||null, currentIndex: newIdx });

  const addFiles = async () => {
    if (!isHost) return;
    const tracks = await window.electron?.pickFiles();
    if (!tracks?.length) return;
    const safeNew = tracks.filter(t => t && t.type && t.path);
    if (!safeNew.length) return;
    const newQ = [...queueRef.current, ...safeNew];
    setQueue(newQ); queueRef.current = newQ;
    bcastQueue(newQ, queueIndexRef.current);
    if (newQ.length === safeNew.length) playTrackAt(0);
  };

  const addFolder = async () => {
    if (!isHost) return;
    setLoadingFolder(true);
    try {
      const tracks = await window.electron?.pickFolder();
      if (!tracks?.length) return;
      const safeNew = tracks.filter(t => t && t.type && t.path);
      if (!safeNew.length) return;
      const newQ = [...queueRef.current, ...safeNew];
      setQueue(newQ); queueRef.current = newQ;
      bcastQueue(newQ, queueIndexRef.current);
      if (newQ.length === safeNew.length) playTrackAt(0);
    } finally { setLoadingFolder(false); }
  };

  const addYtTrack = useCallback((track) => {
    const newQ = [...queueRef.current, track];
    setQueue(newQ); queueRef.current = newQ;
    bcastQueue(newQ, queueIndexRef.current);
    if (newQ.length === 1) playTrackAt(0);
  }, []); // eslint-disable-line

  const removeTrack = (index) => {
    const newQ = queueRef.current.filter((_,i)=>i!==index);
    let ni = queueIndexRef.current;
    if (index < ni) ni--; else if (index===ni) ni=Math.min(ni,newQ.length-1);
    ni = Math.max(0, ni);
    setQueue(newQ); queueRef.current=newQ; setQueueIndex(ni); queueIndexRef.current=ni;
    bcastQueue(newQ, ni);
  };

  const handleShuffle = () => {
    const newShuffle = !shuffle; setShuffle(newShuffle);
    if (newShuffle) {
      const cur = queueRef.current[queueIndexRef.current];
      const rest = queueRef.current.filter((_,i)=>i!==queueIndexRef.current);
      for (let i=rest.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[rest[i],rest[j]]=[rest[j],rest[i]];}
      const newQ = [cur, ...rest];
      setQueue(newQ); queueRef.current=newQ; setQueueIndex(0); queueIndexRef.current=0;
      bcastQueue(newQ, 0);
    }
  };

  // ── Drag ───────────────────────────────────────────────────────────────────
  const onDragStart = (e,i) => { dragFrom.current=i; e.dataTransfer.effectAllowed='move'; };
  const onDragOver = (e,i) => { e.preventDefault(); setDragOver(i); };
  const onDrop = (e,to) => {
    e.preventDefault(); setDragOver(null);
    if (dragFrom.current===null||dragFrom.current===to) return;
    const newQ = reorder(queueRef.current, dragFrom.current, to);
    let ni = queueIndexRef.current;
    if (dragFrom.current===ni) ni=to;
    else if (dragFrom.current<ni&&to>=ni) ni--;
    else if (dragFrom.current>ni&&to<=ni) ni++;
    ni = Math.max(0,Math.min(ni,newQ.length-1));
    setQueue(newQ); queueRef.current=newQ; setQueueIndex(ni); queueIndexRef.current=ni;
    bcastQueue(newQ,ni); dragFrom.current=null;
  };
  const onDragEnd = () => { setDragOver(null); dragFrom.current=null; };

  // ── Chat ───────────────────────────────────────────────────────────────────
  const sendMsg = () => {
    const text = chatInput.trim(); if (!text) return;
    broadcast('chat', { name: user.name, text, ts: Date.now() });
    setChatInput(''); setShowEmoji(false); chatInputRef.current?.focus();
  };

  const handleLeave = async () => { if (isHost) await window.electron?.stopRoom(); onLeave(); };

  const currentTrack = queue[queueIndex] || null;
  const dur = duration || currentTrack?.duration || 1;
  const togglePanel = (p) => setRightPanel(prev => prev === p ? null : p);

  return (
    <div style={{ display:'flex', height:'100%', overflow:'hidden', background:'var(--bg)' }}>

      {/* ── Left sidebar ── */}
      <div style={{ width:200, flexShrink:0, background:'var(--bg2)', borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column', padding:14, gap:4 }}>
        <div style={{ fontSize:10, fontFamily:'var(--mono)', color:'var(--accent)', letterSpacing:'0.18em', textTransform:'uppercase', marginBottom:14 }}>◈ ListenWave</div>

        {/* Room name */}
        <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'8px 12px', marginBottom:8 }}>
          <div style={{ fontSize:12, fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{room.name}</div>
          <div style={{ fontSize:10, color:'var(--text3)', marginTop:1 }}>{isHost ? '👑 Host' : '🎧 Guest'}</div>
        </div>

        <div style={{ fontSize:10, color:'var(--text3)', fontWeight:700, letterSpacing:'0.1em', marginBottom:4, marginTop:4 }}>LISTENERS · {members.length}</div>

        {members.map((m,i) => (
          <div key={i} style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 6px', borderRadius:8 }}>
            <div style={{ position:'relative' }}>
              <Avatar name={m.name} size={26} />
              {isPlaying && (
                <div style={{ position:'absolute', bottom:-2, right:-2, display:'flex', gap:1.5, alignItems:'flex-end', background:'var(--bg2)', borderRadius:3, padding:'1px 2px' }}>
                  {[0,80,160].map(d=><div key={d} style={{ width:2, height:5, background:'var(--green)', borderRadius:1, animation:'wave 0.8s ease-in-out infinite', animationDelay:`${d}ms` }}/>)}
                </div>
              )}
            </div>
            <div style={{ minWidth:0 }}>
              <div style={{ fontSize:12, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{m.name}</div>
              {m.name === user.name && <div style={{ fontSize:10, color:'var(--text3)' }}>You</div>}
            </div>
          </div>
        ))}

        <div style={{ flex:1 }} />

        {/* Connection status */}
        <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, color: connected?'var(--text3)':'var(--red)', marginBottom:4 }}>
          <div style={{ width:6, height:6, borderRadius:'50%', background: connected?'var(--green)':'var(--red)', boxShadow: connected?'0 0 6px var(--green)':'none' }}/>
          {connected ? 'Connected' : 'Disconnected'}
        </div>

        {connError && <div style={{ background:'rgba(248,113,113,0.1)', border:'1px solid rgba(248,113,113,0.3)', borderRadius:8, padding:8, fontSize:11, color:'var(--red)', marginBottom:4 }}>{connError}</div>}

        <button className="btn btn-ghost btn-sm" onClick={handleLeave} style={{ width:'100%' }}>← Leave</button>
      </div>

      {/* ── Center: player ── */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minWidth:0 }}>

        {/* Toolbar */}
        <div style={{ padding:'10px 18px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:7, flexShrink:0, background:'var(--bg2)' }}>
          {isHost && (
            <>
              <button className="btn btn-surface btn-sm" onClick={addFiles}>+ Files</button>
              <button className="btn btn-surface btn-sm" onClick={addFolder} disabled={loadingFolder}>{loadingFolder?'⟳ Scanning…':'+ Folder'}</button>
            </>
          )}
          <div style={{ flex:1 }}/>
          <button className="btn btn-ghost btn-sm" onClick={handleShuffle} style={{ color: shuffle?'var(--accent2)':'var(--text2)', borderColor: shuffle?'var(--accent)':undefined }}>⇄ Shuffle</button>

          {/* Panel toggles */}
          {[
            { id:'youtube', label:'▶️ YouTube', badge: null },
            { id:'queue',   label:`☰ Queue${queue.length?` (${queue.length})`:''}`, badge: null },
            { id:'chat',    label:'💬 Chat', badge: unread > 0 && rightPanel !== 'chat' ? unread : null },
          ].map(({ id, label, badge }) => (
            <button key={id} className="btn btn-ghost btn-sm" onClick={() => togglePanel(id)}
              style={{ color: rightPanel===id?'var(--accent2)':undefined, borderColor: rightPanel===id?'var(--accent)':undefined, position:'relative' }}>
              {label}
              {badge && (
                <span style={{ position:'absolute', top:-6, right:-6, background:'var(--accent)', color:'#fff', borderRadius:'50%', width:17, height:17, fontSize:9, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700 }}>
                  {badge > 9 ? '9+' : badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Player body */}
        <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:32, flexDirection:'column', gap:24, overflow:'hidden' }}>

          {/* Art + info */}
          <div style={{ display:'flex', alignItems:'center', gap:28 }}>
            {/* Album art / thumbnail */}
            <div style={{ width:160, height:160, borderRadius:18, overflow:'hidden', flexShrink:0, background: currentTrack?'linear-gradient(135deg,var(--accent),var(--bg3))':'var(--surface)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:48, boxShadow: isPlaying?'0 0 50px rgba(124,106,247,0.3)':'none', transition:'box-shadow 0.5s', animation: isPlaying?'pulse 2s ease-in-out infinite':'none', position:'relative' }}>
              {currentTrack?.type === 'youtube' && currentTrack?.thumbnail
                ? <img src={currentTrack.thumbnail} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                : (currentTrack ? '♫' : '🎵')
              }
              {currentTrack?.type === 'youtube' && currentTrack && (
                <div style={{ position:'absolute', bottom:6, right:6, background:'rgba(0,0,0,0.75)', borderRadius:4, padding:'2px 5px', fontSize:9, fontFamily:'var(--mono)', color:'#fff', fontWeight:700 }}>YT</div>
              )}
            </div>

            {/* Track info */}
            <div style={{ maxWidth:260 }}>
              <div style={{ fontSize:20, fontWeight:800, marginBottom:4, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', letterSpacing:'-0.02em' }}>
                {currentTrack?.title || 'Nothing playing'}
              </div>
              <div style={{ color:'var(--text2)', fontSize:14, marginBottom:3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {currentTrack?.artist || (isHost ? 'Add music above' : 'Waiting for host…')}
              </div>
              {currentTrack?.album && <div style={{ color:'var(--text3)', fontSize:12 }}>{currentTrack.album}</div>}
              {queue.length > 0 && (
                <div style={{ marginTop:6, display:'flex', alignItems:'center', gap:6 }}>
                  <TrackBadge type={currentTrack?.type} />
                  <span style={{ fontSize:11, color:'var(--text3)', fontFamily:'var(--mono)' }}>{queueIndex+1} / {queue.length}</span>
                </div>
              )}
            </div>
          </div>

          {/* Progress */}
          <div style={{ width:'100%', maxWidth:440 }}>
            <input type="range" min={0} max={dur} step={0.1} value={position} onChange={handleSeek} style={{ width:'100%', accentColor:'var(--accent)' }}/>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, fontFamily:'var(--mono)', color:'var(--text3)', marginTop:3 }}>
              <span>{fmt(position)}</span><span>{fmt(dur)}</span>
            </div>
          </div>

          {/* Controls row */}
          <div style={{ display:'flex', alignItems:'center', gap:20 }}>
            <button className="btn btn-icon" onClick={handlePrev} title="Previous">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>
            </button>
            <button onClick={isPlaying?handlePause:handlePlay} disabled={!currentTrack} style={{ width:54, height:54, borderRadius:'50%', background:'var(--accent)', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', boxShadow:'0 0 22px rgba(124,106,247,0.5)', transition:'all 0.15s', opacity: currentTrack?1:0.4 }}>
              {isPlaying
                ? <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                : <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              }
            </button>
            <button className="btn btn-icon" onClick={handleNext} title="Next">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6h2v12h-2z"/></svg>
            </button>
          </div>

          {/* Volume */}
          <div style={{ display:'flex', alignItems:'center', gap:8, width:'100%', maxWidth:240 }}>
            <svg width="12" height="12" fill="var(--text3)" viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>
            <input type="range" min={0} max={1} step={0.01} value={volume} onChange={handleVolume} style={{ flex:1, accentColor:'var(--accent2)' }}/>
            <svg width="12" height="12" fill="var(--text3)" viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
          </div>
        </div>
      </div>

      {/* ── Right panel ── */}
      {rightPanel && (
        <div style={{ width:300, borderLeft:'1px solid var(--border)', background:'var(--bg2)', display:'flex', flexDirection:'column', overflow:'hidden', flexShrink:0 }}>

          {/* Queue panel */}
          {rightPanel === 'queue' && (
            <>
              <div style={{ padding:'13px 14px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:13, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <span>Queue · {queue.length}</span>
                <span style={{ fontSize:10, color:'var(--text3)', fontWeight:400 }}>drag to reorder</span>
              </div>
              <div style={{ flex:1, overflow:'auto', padding:5 }}>
                {queue.length === 0 && (
                  <div style={{ padding:24, textAlign:'center', color:'var(--text3)', fontSize:13 }}>
                    {isHost ? 'Add with "+ Files", "+ Folder" or YouTube' : 'Queue is empty'}
                  </div>
                )}
                {queue.filter(t => t != null && t.type && (t.path || t.ytId)).map((track, i) => (
                  <div key={`${((track.type==='youtube')?track.ytId:track.path)||i}-${i}`}
                    className={`track-item ${i===queueIndex?'active':''}`}
                    onClick={() => playTrackAt(i)}
                    draggable onDragStart={e=>onDragStart(e,i)} onDragOver={e=>onDragOver(e,i)} onDrop={e=>onDrop(e,i)} onDragEnd={onDragEnd}
                    style={{ outline: dragOver===i?'2px solid var(--accent)':'none', opacity: dragFrom.current===i?0.4:1, cursor:'grab' }}
                  >
                    {/* Thumb / index */}
                    <div style={{ width:30, height:30, borderRadius:7, flexShrink:0, overflow:'hidden', background: i===queueIndex?'var(--accent)':'var(--surface)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                      {track.type==='youtube' && track.thumbnail
                        ? <img src={track.thumbnail} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
                        : <span style={{ fontSize:10, fontFamily:'var(--mono)', color: i===queueIndex?'#fff':'var(--text3)' }}>{i===queueIndex&&isPlaying?'♫':i+1}</span>
                      }
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div className="track-title" style={{ fontSize:12, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{track.title}</div>
                      <div style={{ fontSize:10, color:'var(--text3)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', display:'flex', alignItems:'center', gap:4 }}>
                        <TrackBadge type={track.type} />
                        <span>{track.artist}</span>
                      </div>
                    </div>
                    <span style={{ fontSize:10, fontFamily:'var(--mono)', color:'var(--text3)', flexShrink:0 }}>{fmt(track.duration)}</span>
                    {isHost && (
                      <button onClick={e=>{e.stopPropagation();removeTrack(i);}} style={{ background:'none', border:'none', color:'var(--text3)', cursor:'pointer', fontSize:15, padding:'0 2px', lineHeight:1, flexShrink:0 }}>×</button>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {/* YouTube panel */}
          {rightPanel === 'youtube' && (
            <YtPanel serverUrl={serverUrl} onAdd={addYtTrack} onClose={() => setRightPanel(null)} ytAvailable={ytAvailable} />
          )}

          {/* Chat panel */}
          {rightPanel === 'chat' && (
            <>
              <div style={{ padding:'13px 16px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:13, display:'flex', alignItems:'center', gap:8 }}>
                <span>💬 Chat</span>
                <span style={{ fontSize:10, color:'var(--text3)', fontWeight:400 }}>{members.length} online</span>
              </div>
              <div style={{ flex:1, overflow:'auto', padding:'10px 0' }}>
                {messages.length === 0 && (
                  <div style={{ padding:'30px 20px', textAlign:'center', color:'var(--text3)', fontSize:13 }}>No messages yet. Say hello! 👋</div>
                )}
                {messages.map((msg, i) =>
                  msg.type === 'system'
                    ? <SystemMsg key={i} text={msg.text} />
                    : <ChatMessage key={i} msg={msg} isOwn={msg.name === user.name} />
                )}
                <div ref={chatEndRef} />
              </div>
              <div style={{ padding:'10px 12px', borderTop:'1px solid var(--border)', position:'relative' }}>
                {showEmoji && <div ref={emojiRef}><EmojiPicker onSelect={e => { setChatInput(p => p+e); chatInputRef.current?.focus(); }} /></div>}
                <div style={{ display:'flex', gap:7, alignItems:'flex-end' }}>
                  <textarea ref={chatInputRef} value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMsg();}}} placeholder="Message the room…" rows={1} maxLength={500}
                    style={{ flex:1, resize:'none', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'7px 11px', color:'var(--text)', fontSize:13, fontFamily:'var(--font)', outline:'none', lineHeight:1.5, maxHeight:80, overflowY:'auto', boxSizing:'border-box', transition:'border-color 0.15s' }}
                    onFocus={e=>e.target.style.borderColor='var(--accent)'} onBlur={e=>e.target.style.borderColor='var(--border)'}
                  />
                  <button onClick={()=>setShowEmoji(!showEmoji)} style={{ background: showEmoji?'var(--surface2)':'var(--surface)', border:`1px solid ${showEmoji?'var(--accent)':'var(--border)'}`, borderRadius:9, width:34, height:34, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', fontSize:15, flexShrink:0 }}>😊</button>
                  <button onClick={sendMsg} disabled={!chatInput.trim()} style={{ background: chatInput.trim()?'var(--accent)':'var(--surface)', border:'none', borderRadius:9, width:34, height:34, display:'flex', alignItems:'center', justifyContent:'center', cursor: chatInput.trim()?'pointer':'default', color: chatInput.trim()?'#fff':'var(--text3)', flexShrink:0, transition:'all 0.15s' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                  </button>
                </div>
                <div style={{ fontSize:9, color:'var(--text3)', marginTop:4, textAlign:'right', fontFamily:'var(--mono)' }}>Enter to send · Shift+Enter new line</div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
