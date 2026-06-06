const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');

let mainWindow;
let hostServer = null;
let bonjourInstance = null;
let bonjourService = null;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0a0a0f',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, '../public/icon.png'),
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../build/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
    stopHostServer();
  });
}

// ─── HOST SERVER ─────────────────────────────────────────────────────────────

function startHostServer(roomName, password, hostName) {
  const express = require('express');
  const { Server } = require('socket.io');

  const expressApp = express();
  const httpServer = http.createServer(expressApp);
  const io = new Server(httpServer, { cors: { origin: '*' } });

  const PORT = 45678;
  const roomState = {
    roomName,
    password,
    hostName,
    members: [],
    currentTrack: null,
    queue: [],
    isPlaying: false,
    position: 0,
    positionTimestamp: Date.now(),
  };

  // Serve audio files
  expressApp.get('/audio', (req, res) => {
    const filePath = req.query.path;
    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(404).send('File not found');
    }
    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;
      const file = fs.createReadStream(filePath, { start, end });
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': 'audio/mpeg',
      });
      file.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': 'audio/mpeg',
      });
      fs.createReadStream(filePath).pipe(res);
    }
  });

  io.on('connection', (socket) => {
    socket.on('join', ({ name, password: pw }) => {
      if (pw !== roomState.password) {
        socket.emit('error', { message: 'Wrong password' });
        return;
      }
      const member = { id: socket.id, name };
      roomState.members.push(member);
      socket.join('room');
      socket.emit('joined', {
        roomState: {
          ...roomState,
          position: roomState.isPlaying
            ? roomState.position + (Date.now() - roomState.positionTimestamp) / 1000
            : roomState.position,
        },
      });
      io.to('room').emit('members', roomState.members);
      mainWindow?.webContents.send('member-joined', member);
    });

    socket.on('disconnect', () => {
      roomState.members = roomState.members.filter((m) => m.id !== socket.id);
      io.to('room').emit('members', roomState.members);
      mainWindow?.webContents.send('members-update', roomState.members);
    });

    // play-track: play a specific track by index - fixes next/prev sync issues
    socket.on('play-track', ({ track, index, position }) => {
      roomState.currentTrack = track;
      roomState.isPlaying = true;
      roomState.position = position ?? 0;
      roomState.positionTimestamp = Date.now();
      // Broadcast to ALL clients including sender
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
      mainWindow?.webContents.send('playback-seek', { position });
    });

    socket.on('queue-update', ({ queue, currentTrack, currentIndex }) => {
      roomState.queue = queue;
      if (currentTrack !== undefined) roomState.currentTrack = currentTrack;
      io.to('room').emit('queue-update', { queue, currentTrack: roomState.currentTrack, currentIndex });
      mainWindow?.webContents.send('queue-update', { queue, currentTrack: roomState.currentTrack, currentIndex });
    });

    socket.on('volume', ({ volume }) => {
      socket.broadcast.to('room').emit('volume', { volume });
    });

    // Chat — broadcast to everyone including sender so all see it instantly
    socket.on('chat', ({ name, text, ts }) => {
      io.to('room').emit('chat', { name, text, ts });
    });
  });

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`ListenWave server running on port ${PORT}`);
    mainWindow?.webContents.send('server-started', { port: PORT });

    try {
      const { Bonjour } = require('bonjour-service');
      bonjourInstance = new Bonjour();
      bonjourService = bonjourInstance.publish({
        name: roomName,
        type: 'listenwave',
        port: PORT,
        txt: { host: hostName, room: roomName },
      });
    } catch (e) {
      console.log('mDNS unavailable:', e.message);
    }
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
    try {
      const meta = await musicMetadata.parseFile(filePath);
      tracks.push({
        path: filePath,
        title: meta.common.title || path.basename(filePath, path.extname(filePath)),
        artist: meta.common.artist || 'Unknown Artist',
        album: meta.common.album || '',
        duration: meta.format.duration || 0,
      });
    } catch {
      tracks.push({
        path: filePath,
        title: path.basename(filePath, path.extname(filePath)),
        artist: 'Unknown Artist',
        album: '',
        duration: 0,
      });
    }
  }
  return tracks;
}

// ─── IPC HANDLERS ────────────────────────────────────────────────────────────

ipcMain.handle('create-room', (_, { roomName, password, hostName }) => {
  try {
    stopHostServer();
    const port = startHostServer(roomName, password, hostName);
    return { success: true, port };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('stop-room', () => {
  stopHostServer();
  return { success: true };
});

ipcMain.handle('browse-rooms', () => {
  return new Promise((resolve) => {
    const rooms = [];
    try {
      const { Bonjour } = require('bonjour-service');
      const b = new Bonjour();
      const browser = b.find({ type: 'listenwave' });
      browser.on('up', (service) => {
        rooms.push({
          name: service.name,
          host: service.addresses?.[0] || service.host,
          port: service.port,
          txt: service.txt,
        });
      });
      setTimeout(() => {
        browser.stop();
        b.destroy();
        resolve(rooms);
      }, 2500);
    } catch (e) {
      resolve([]);
    }
  });
});

ipcMain.handle('pick-files', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Audio', extensions: ['mp3', 'flac', 'wav', 'ogg', 'm4a', 'aac'] }],
  });
  if (result.canceled) return [];
  return parseAudioFiles(result.filePaths);
});

ipcMain.handle('pick-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
  });
  if (result.canceled) return [];

  const AUDIO_EXTS = new Set(['.mp3', '.flac', '.wav', '.ogg', '.m4a', '.aac']);
  const audioFiles = [];

  function scanDir(dir) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanDir(full);
        } else if (AUDIO_EXTS.has(path.extname(entry.name).toLowerCase())) {
          audioFiles.push(full);
        }
      }
    } catch (e) {}
  }

  scanDir(result.filePaths[0]);
  audioFiles.sort();
  return parseAudioFiles(audioFiles);
});

ipcMain.handle('get-local-ip', () => {
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return '127.0.0.1';
});

// ─── APP LIFECYCLE ────────────────────────────────────────────────────────────

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  stopHostServer();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('before-quit', stopHostServer);
