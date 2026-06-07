const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const { execSync, spawn } = require('child_process');

let mainWindow;
let hostServer = null;
let bonjourInstance = null;
let bonjourService = null;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// ─── yt-dlp helpers ───────────────────────────────────────────────────────────

function getYtdlpBin() {
  const candidates = ['yt-dlp', 'yt-dlp.exe'];
  for (const bin of candidates) {
    try { execSync(`${bin} --version`, { stdio: 'ignore' }); return bin; } catch {}
  }
  return null;
}

function checkYtdlp() {
  const bin = getYtdlpBin();
  return { available: !!bin, bin };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1160,
    height: 780,
    minWidth: 860,
    minHeight: 620,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#08080e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, '../public/icon.png'),
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
    // mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../build/index.html'));
  }

  mainWindow.on('closed', () => { mainWindow = null; stopHostServer(); });
}

// ─── HOST SERVER ──────────────────────────────────────────────────────────────

function startHostServer(roomName, password, hostName) {
  const express = require('express');
  const { Server } = require('socket.io');

  const expressApp = express();
  const httpServer = http.createServer(expressApp);
  const io = new Server(httpServer, { cors: { origin: '*' } });

  const PORT = 45678;
  const roomState = {
    roomName, password, hostName,
    members: [], currentTrack: null, queue: [],
    isPlaying: false, position: 0, positionTimestamp: Date.now(),
  };

  // ── Local audio stream ────────────────────────────────────────────────────
  expressApp.get('/audio', (req, res) => {
    const filePath = req.query.path;
    if (!filePath || !fs.existsSync(filePath)) return res.status(404).send('Not found');
    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes', 'Content-Length': chunkSize, 'Content-Type': 'audio/mpeg',
      });
      fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, { 'Content-Length': fileSize, 'Content-Type': 'audio/mpeg' });
      fs.createReadStream(filePath).pipe(res);
    }
  });

  // ── YouTube audio stream ──────────────────────────────────────────────────
  expressApp.get('/ytstream', (req, res) => {
    // console.log("Headers:", req.headers);
    
    const ytUrl = req.query.url;
    if (!ytUrl) return res.status(400).send('No URL');
    const bin = getYtdlpBin();
    if (!bin) return res.status(500).send('yt-dlp not installed');
    
    // res.setHeader('Content-Type', 'audio/mpeg');

    res.setHeader('Content-Type', 'audio/webm');

    res.setHeader('Transfer-Encoding', 'chunked');
    
    // const args = [
    //   '--no-playlist', '-f', 'bestaudio[ext=m4a]/bestaudio/best',
    //   '--audio-format', 'mp3', '-o', '-', '--quiet', ytUrl,
    // ];

    const args = [
      '--no-playlist',
      '-f',
      '18',
      '-o',
      '-',
      '--quiet',
      ytUrl,
    ];
    
    const proc = spawn(bin, args);
    proc.stdout.pipe(res);
    proc.stderr.on('data', d => console.error('[yt-dlp]', d.toString()));
    proc.on('error', err => { console.error('[yt-dlp spawn]', err); res.end(); });
    req.on('close', () => { try { proc.kill('SIGKILL'); } catch {} });
  });

  // ── Socket events ─────────────────────────────────────────────────────────
  io.on('connection', (socket) => {
    socket.on('join', ({ name, password: pw }) => {
      if (pw !== roomState.password) { socket.emit('error', { message: 'Wrong password' }); return; }
      const member = { id: socket.id, name };
      roomState.members.push(member);
      socket.join('room');
      socket.emit('joined', {
        roomState: {
          ...roomState,
          ytAvailable: !!getYtdlpBin(),
          position: roomState.isPlaying
            ? roomState.position + (Date.now() - roomState.positionTimestamp) / 1000
            : roomState.position,
        },
      });
      io.to('room').emit('members', roomState.members);
      mainWindow?.webContents.send('member-joined', member);
    });

    socket.on('disconnect', () => {
      roomState.members = roomState.members.filter(m => m.id !== socket.id);
      io.to('room').emit('members', roomState.members);
    });

    socket.on('play-track', ({ track, index, position }) => {
      roomState.currentTrack = track;
      roomState.isPlaying = true;
      roomState.position = position ?? 0;
      roomState.positionTimestamp = Date.now();
      io.to('room').emit('play-track', { track, index, position: roomState.position });
      mainWindow?.webContents.send('play-track', { track, index, position: roomState.position });
    });

    socket.on('play', ({ track, position }) => {
      if (track) roomState.currentTrack = track;
      roomState.isPlaying = true;
      roomState.position = position ?? roomState.position;
      roomState.positionTimestamp = Date.now();
      io.to('room').emit('play', { track: roomState.currentTrack, position: roomState.position });
      mainWindow?.webContents.send('playback-play', { track: roomState.currentTrack, position: roomState.position });
    });

    socket.on('pause', ({ position }) => {
      roomState.isPlaying = false;
      roomState.position = position ?? roomState.position;
      io.to('room').emit('pause', { position: roomState.position });
      mainWindow?.webContents.send('playback-pause', { position: roomState.position });
    });

    socket.on('seek', ({ position }) => {
      roomState.position = position;
      roomState.positionTimestamp = Date.now();
      io.to('room').emit('seek', { position });
    });

    socket.on('queue-update', ({ queue, currentTrack, currentIndex }) => {
      roomState.queue = queue;
      if (currentTrack !== undefined) roomState.currentTrack = currentTrack;
      io.to('room').emit('queue-update', { queue, currentTrack: roomState.currentTrack, currentIndex });
      mainWindow?.webContents.send('queue-update', { queue, currentTrack: roomState.currentTrack, currentIndex });
    });

    socket.on('volume', ({ volume }) => { socket.broadcast.to('room').emit('volume', { volume }); });

    socket.on('chat', ({ name, text, ts }) => { io.to('room').emit('chat', { name, text, ts }); });

    // Any member can request a YouTube search — host machine runs yt-dlp
    socket.on('yt-search', async ({ query, requestId }) => {
      const bin = getYtdlpBin();
      if (!bin) { socket.emit('yt-search-result', { requestId, error: 'yt-dlp not installed on host' }); return; }
      try {
        const raw = execSync(
          `${bin} "ytsearch8:${query.replace(/"/g, '')}" --dump-json --no-download --flat-playlist --quiet`,
          { timeout: 15000, maxBuffer: 1024 * 1024 * 4 }
        ).toString();
        const results = raw.trim().split('\n').map(line => {
          try {
            const d = JSON.parse(line);
            return {
              ytId: d.id,
              ytUrl: `https://www.youtube.com/watch?v=${d.id}`,
              title: d.title || 'Unknown',
              artist: d.uploader || d.channel || 'YouTube',
              duration: d.duration || 0,
              thumbnail: d.thumbnail || `https://i.ytimg.com/vi/${d.id}/hqdefault.jpg`,
            };
          } catch { return null; }
        }).filter(Boolean);
        socket.emit('yt-search-result', { requestId, results });
      } catch (e) {
        socket.emit('yt-search-result', { requestId, error: e.message });
      }
    });

    // Resolve a YouTube URL to track metadata
    socket.on('yt-resolve', async ({ url, requestId }) => {
      const bin = getYtdlpBin();
      if (!bin) { socket.emit('yt-resolve-result', { requestId, error: 'yt-dlp not installed on host' }); return; }
      try {
        const raw = execSync(
          `${bin} "${url}" --dump-json --no-download --quiet`,
          { timeout: 15000, maxBuffer: 1024 * 1024 * 2 }
        ).toString().trim().split('\n')[0];
        const d = JSON.parse(raw);
        socket.emit('yt-resolve-result', {
          requestId,
          track: {
            type: 'youtube',
            ytId: d.id,
            ytUrl: `https://www.youtube.com/watch?v=${d.id}`,
            title: d.title || 'Unknown',
            artist: d.uploader || d.channel || 'YouTube',
            duration: d.duration || 0,
            thumbnail: d.thumbnail || `https://i.ytimg.com/vi/${d.id}/hqdefault.jpg`,
          },
        });
      } catch (e) {
        socket.emit('yt-resolve-result', { requestId, error: 'Could not resolve URL' });
      }
    });
  });

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`ListenWave server running on port ${PORT}`);
    mainWindow?.webContents.send('server-started', { port: PORT });
    try {
      const { Bonjour } = require('bonjour-service');
      bonjourInstance = new Bonjour();
      bonjourService = bonjourInstance.publish({ name: roomName, type: 'listenwave', port: PORT, txt: { host: hostName, room: roomName } });
    } catch (e) { console.log('mDNS unavailable:', e.message); }
  });

  hostServer = httpServer;
  return PORT;
}

function stopHostServer() {
  if (bonjourService) { try { bonjourService.stop(); } catch(e){} bonjourService = null; }
  if (bonjourInstance) { try { bonjourInstance.destroy(); } catch(e){} bonjourInstance = null; }
  if (hostServer) { try { hostServer.close(); } catch(e){} hostServer = null; }
}

// ─── AUDIO FILE HELPERS ───────────────────────────────────────────────────────

async function parseAudioFiles(filePaths) {
  const musicMetadata = require('music-metadata');
  const tracks = [];
  for (const filePath of filePaths) {
    if (!filePath) continue;
    try {
      const meta = await musicMetadata.parseFile(filePath);
      tracks.push({
        type: 'local',
        path: filePath,
        title: meta.common.title || path.basename(filePath, path.extname(filePath)),
        artist: meta.common.artist || 'Unknown Artist',
        album: meta.common.album || '',
        duration: meta.format.duration || 0,
      });
    } catch {
      tracks.push({
        type: 'local',
        path: filePath,
        title: path.basename(filePath, path.extname(filePath)),
        artist: 'Unknown Artist',
        album: '',
        duration: 0,
      });
    }
  }
  // Safety: remove any nulls that somehow slipped in
  return tracks.filter(t => t != null && t.path && t.title);
}

// ─── IPC HANDLERS ────────────────────────────────────────────────────────────

ipcMain.handle('create-room', (_, { roomName, password, hostName }) => {
  try { stopHostServer(); const port = startHostServer(roomName, password, hostName); return { success: true, port }; }
  catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('stop-room', () => { stopHostServer(); return { success: true }; });

ipcMain.handle('browse-rooms', () => new Promise((resolve) => {
  const rooms = [];
  try {
    const { Bonjour } = require('bonjour-service');
    const b = new Bonjour();
    const browser = b.find({ type: 'listenwave' });
    browser.on('up', (service) => {
      rooms.push({ name: service.name, host: service.addresses?.[0] || service.host, port: service.port, txt: service.txt });
    });
    setTimeout(() => { browser.stop(); b.destroy(); resolve(rooms); }, 2500);
  } catch { resolve([]); }
}));

ipcMain.handle('pick-files', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Audio', extensions: ['mp3', 'flac', 'wav', 'ogg', 'm4a', 'aac'] }],
  });
  if (result.canceled) return [];
  return parseAudioFiles(result.filePaths);
});

ipcMain.handle('pick-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
  if (result.canceled) return [];
  const AUDIO_EXTS = new Set(['.mp3', '.flac', '.wav', '.ogg', '.m4a', '.aac']);
  const audioFiles = [];
  function scanDir(dir) {
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) scanDir(full);
        else if (AUDIO_EXTS.has(path.extname(entry.name).toLowerCase())) audioFiles.push(full);
      }
    } catch {}
  }
  scanDir(result.filePaths[0]);
  audioFiles.sort();
  return parseAudioFiles(audioFiles);
});

ipcMain.handle('get-local-ip', () => {
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  for (const name of Object.keys(nets))
    for (const net of nets[name])
      if (net.family === 'IPv4' && !net.internal) return net.address;
  return '127.0.0.1';
});

ipcMain.handle('check-ytdlp', () => checkYtdlp());

// ─── APP LIFECYCLE ────────────────────────────────────────────────────────────

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { stopHostServer(); if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
app.on('before-quit', stopHostServer);
