const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  createRoom: (data) => ipcRenderer.invoke('create-room', data),
  stopRoom: () => ipcRenderer.invoke('stop-room'),
  browseRooms: () => ipcRenderer.invoke('browse-rooms'),
  pickFiles: () => ipcRenderer.invoke('pick-files'),
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  getLocalIp: () => ipcRenderer.invoke('get-local-ip'),

  onServerStarted: (cb) => ipcRenderer.on('server-started', (_, d) => cb(d)),
  onMemberJoined: (cb) => ipcRenderer.on('member-joined', (_, d) => cb(d)),
  onMembersUpdate: (cb) => ipcRenderer.on('members-update', (_, d) => cb(d)),
  onPlayTrack: (cb) => ipcRenderer.on('play-track', (_, d) => cb(d)),
  onPlaybackPlay: (cb) => ipcRenderer.on('playback-play', (_, d) => cb(d)),
  onPlaybackPause: (cb) => ipcRenderer.on('playback-pause', (_, d) => cb(d)),
  onPlaybackSeek: (cb) => ipcRenderer.on('playback-seek', (_, d) => cb(d)),
  onQueueUpdate: (cb) => ipcRenderer.on('queue-update', (_, d) => cb(d)),

  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
});
