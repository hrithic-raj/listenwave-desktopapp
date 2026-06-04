# 🎵 ListenWave

**Listen to music together over local WiFi.** No internet required for sync. No accounts. Just music.

---

## How It Works

- The **host** creates a room and loads local audio files (MP3, FLAC, WAV, OGG, M4A)
- The host's machine **streams the audio** to all guests over LAN
- Everyone controls playback — play, pause, skip, seek, volume
- Rooms are **auto-discovered** via mDNS on the same WiFi subnet
- Guests can also join by entering the host's IP manually

---

## Requirements

- **Node.js** v18+ ([nodejs.org](https://nodejs.org))
- **npm** v8+
- All devices on the **same WiFi network**

---

## Quick Start (Development)

```bash
# 1. Install dependencies
npm install

# 2. Run in development mode (opens Electron + React dev server)
npm start
```

---

## Build for Production

### macOS
```bash
npm run build:mac
# Output: dist/ListenWave-*.dmg
```

### Windows
```bash
npm run build:win
# Output: dist/ListenWave Setup *.exe
```

### Linux (Fedora / Arch / Mint)
```bash
npm run build:linux
# Output: dist/ListenWave-*.AppImage  (universal)
#         dist/listenwave_*.deb       (Debian/Ubuntu/Mint)
#         dist/listenwave-*.rpm       (Fedora/RHEL)
```

**For Arch Linux**, install the `.AppImage`:
```bash
chmod +x ListenWave-*.AppImage
./ListenWave-*.AppImage
```

Or use the AUR helper after packaging (advanced).

---

## Usage Guide

### As Host
1. Launch ListenWave → enter your name
2. Click **Create Room** → set a room name and password
3. Click **+ Add Music** to load audio files from your computer
4. Press Play — everyone in the room hears it!
5. Share your room name + password with friends on the same WiFi

### As Guest
1. Launch ListenWave → enter your name
2. Click **Find Rooms** — nearby rooms appear automatically
3. Click a room → enter the password → Join
4. You'll hear whatever the host plays, in sync
5. You can also pause, skip, or control volume (it affects your local audio)

### Manual Join (if auto-discovery fails)
1. Ask the host for their IP (shown in the room after creation, or check your router)
2. In Find Rooms → click "Join by IP address manually"
3. Enter the IP (e.g. `192.168.1.5`) and port `45678`

---

## Supported Audio Formats

| Format | Extension |
|--------|-----------|
| MP3    | `.mp3`    |
| FLAC   | `.flac`   |
| WAV    | `.wav`    |
| OGG    | `.ogg`    |
| M4A/AAC | `.m4a`, `.aac` |

---

## Network Requirements

- All devices must be on the **same WiFi subnet** (same router)
- Port **45678** must not be blocked by a firewall
- On Linux, you may need to allow the port:

```bash
# Ubuntu/Mint (ufw)
sudo ufw allow 45678

# Fedora (firewalld)
sudo firewall-cmd --add-port=45678/tcp --permanent
sudo firewall-cmd --reload
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Electron 25 |
| UI | React 18 |
| Styling | CSS Variables (custom) |
| Local audio server | Express + Node.js streams |
| Real-time sync | Socket.IO (WebSocket) |
| Room discovery | mDNS via `bonjour-service` |
| Audio metadata | `music-metadata` |

---

## Project Structure

```
listenwave/
├── electron/
│   ├── main.js        # Electron main process, host server, IPC
│   └── preload.js     # Context bridge for renderer ↔ main
├── src/
│   ├── App.js          # Page router
│   ├── index.js        # React entry
│   ├── index.css       # Global styles + design tokens
│   ├── components/
│   │   └── Avatar.js   # Name-initial avatar with color hash
│   └── pages/
│       ├── SetupPage.js  # Name entry
│       ├── LobbyPage.js  # Create / browse rooms
│       └── RoomPage.js   # Player, queue, members
├── public/
│   └── index.html
└── package.json
```

---

## Troubleshooting

**Room not showing up in discovery?**
→ mDNS may be blocked on your network. Use manual IP join instead.

**"Cannot connect to room"?**
→ Check host firewall allows port 45678. Verify both devices are on the same WiFi.

**Audio not playing for guests?**
→ The host's machine streams audio. Make sure the host has the files and is connected.

**AppImage won't run on Linux?**
```bash
chmod +x ListenWave-*.AppImage
./ListenWave-*.AppImage --no-sandbox
```

---

## License

MIT — build on it, hack it, share it.
