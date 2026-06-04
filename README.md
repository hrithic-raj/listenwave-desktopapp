# 🎵 ListenWave

> **Synchronized music listening for your local network. No accounts. No internet. Just music, together.**

ListenWave lets you host music from your computer and have everyone in the same office or home listen in perfect sync — through a lightweight desktop app that runs on Linux, macOS, and Windows.

![License: MIT](https://img.shields.io/badge/license-MIT-7c6af7?style=flat-square)
![Platform](https://img.shields.io/badge/platform-Linux%20%7C%20macOS%20%7C%20Windows-34d399?style=flat-square)
![Node](https://img.shields.io/badge/node-v18%2B-fb923c?style=flat-square)

---

## How It Works

```
Host Machine                        Guest Machines
┌─────────────────────┐             ┌──────────────────┐
│  ListenWave         │  LAN/WiFi   │  ListenWave      │
│  ├─ Audio Server    │◄───────────►│  ├─ Audio Stream │
│  ├─ Socket.IO       │             │  ├─ Sync Events  │
│  └─ mDNS Broadcast  │             │  └─ mDNS Browse  │
└─────────────────────┘             └──────────────────┘
```

1. The **host** creates a room with a password and loads local audio files
2. The host's machine streams audio over HTTP on the local network
3. **Guests** discover the room automatically (or join via IP) and connect
4. All playback — play, pause, skip, seek, queue changes — syncs to everyone in real time
5. The host can add files one by one or load an entire folder at once

---

## Features

- 🎵 Stream MP3, FLAC, WAV, OGG, M4A from the host's machine
- 🔄 Real-time sync — play, pause, seek, skip stays in sync for all listeners
- 📂 Add files or entire folders to the queue
- 🔀 Shuffle queue with one click
- ↕️ Drag and drop to reorder the queue (host only)
- 🔍 Auto-discover rooms on your WiFi via mDNS
- 🔌 Manual IP join as fallback (works on office networks)
- 👤 No accounts — just set a name, get an avatar
- 🖥️ Runs on Linux, macOS, Windows

---

## Requirements

| Requirement | Version |
|---|---|
| Node.js | v18 or higher |
| npm | v8 or higher |
| Network | All devices on the same WiFi |

---

## Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/yourusername/listenwave.git
cd listenwave
```

### 2. Install dependencies

```bash
npm install
```

### 3. Fix Electron binary (first time only)

Electron's postinstall script sometimes fails to download the binary silently. Run this after `npm install`:

```bash
mkdir -p ~/.cache/electron
node node_modules/electron/install.js
```

If it still fails, download manually:
- Go to: `https://github.com/electron/electron/releases`
- Download `electron-v36.x.x-linux-x64.zip` (or your platform/arch)
- Unzip it into `~/.cache/electron/`
- Run `node node_modules/electron/install.js` again

### 4. Start in development mode

```bash
npm start
```

This starts the React dev server and launches the Electron window simultaneously.

> ⚠️ Always use the **Electron window**, not the browser at `localhost:3000`. The app requires Electron APIs (file picker, audio server, mDNS) that don't exist in a browser.

---

## Platform-Specific Setup

### Linux (Arch, Fedora, Mint, Ubuntu)

**Open the required port:**

```bash
# Ubuntu / Mint (ufw)
sudo ufw allow 45678

# Fedora / RHEL (firewalld)
sudo firewall-cmd --add-port=45678/tcp --permanent
sudo firewall-cmd --reload

# Arch (iptables)
sudo iptables -A INPUT -p tcp --dport 45678 -j ACCEPT
```

**If AppImage doesn't run:**
```bash
chmod +x ListenWave-*.AppImage
./ListenWave-*.AppImage --no-sandbox
```

### macOS

```bash
# Install Node via Homebrew if not already installed
brew install node

# Then clone and run as normal
git clone https://github.com/yourusername/listenwave.git
cd listenwave
npm install
node node_modules/electron/install.js
npm start
```

macOS may ask for network permissions the first time — click **Allow**.

### Windows

1. Download and install Node.js from [nodejs.org](https://nodejs.org) (LTS version)
2. Open PowerShell or Command Prompt:

```powershell
git clone https://github.com/yourusername/listenwave.git
cd listenwave
npm install
node node_modules/electron/install.js
npm start
```

Windows Defender may ask to allow network access — click **Allow**.

---

## Using the App

### As Host

1. Launch ListenWave → enter your name
2. Go to **Create Room** → set a room name and password
3. Click **+ Files** to add individual audio files, or **+ Folder** to load an entire folder (scans recursively)
4. Press ▶ Play — the audio streams to everyone in the room
5. Use **⇄ Shuffle** to randomize the queue
6. Drag tracks in the queue panel to reorder them
7. Share your room name + password with friends on the same WiFi

**Finding your IP to share with guests:**

```bash
# Linux / macOS
ip addr show | grep "inet " | grep -v 127.0.0.1
# or
ifconfig | grep "inet " | grep -v 127.0.0.1

# Windows
ipconfig | findstr IPv4
```

### As Guest

1. Launch ListenWave → enter your name
2. Go to **Find Rooms** — rooms on your network appear automatically
3. Click a room → enter the password → **Join**
4. Music plays in sync with everyone else
5. You can control playback too — pause, skip, seek all sync to the room

**If the room doesn't appear automatically** (common on office/university networks that block mDNS):

1. Ask the host for their IP address
2. In Find Rooms → click **"Join by IP address manually"**
3. Enter the host IP (e.g. `192.168.1.5`), port `45678`, and password → **Connect**

---

## Building for Distribution

### macOS
```bash
npm run build:mac
# Output: dist/ListenWave-*.dmg
```

### Windows
```bash
npm run build:win
# Output: dist/ListenWave-Setup-*.exe
```

### Linux
```bash
npm run build:linux
# Output:
#   dist/ListenWave-*.AppImage   ← works on any distro
#   dist/listenwave_*.deb        ← Debian, Ubuntu, Mint
#   dist/listenwave-*.rpm        ← Fedora, RHEL, openSUSE
```

---

## Supported Audio Formats

| Format | Extension |
|---|---|
| MP3 | `.mp3` |
| FLAC | `.flac` |
| WAV | `.wav` |
| OGG Vorbis | `.ogg` |
| AAC / M4A | `.m4a`, `.aac` |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | Electron 36 |
| UI framework | React 18 |
| Styling | CSS custom properties (no framework) |
| Audio streaming | Express + Node.js HTTP range requests |
| Real-time sync | Socket.IO (WebSocket) |
| Room discovery | mDNS via `bonjour-service` |
| Audio metadata | `music-metadata` |

---

## Project Structure

```
listenwave/
├── electron/
│   ├── main.js          # Main process: audio server, IPC, mDNS, file I/O
│   └── preload.js       # Context bridge: exposes Electron APIs to React
├── src/
│   ├── App.js            # Page router (setup → lobby → room)
│   ├── index.js          # React entry point
│   ├── index.css         # Global styles and CSS variables
│   ├── components/
│   │   └── Avatar.js     # Letter avatar with deterministic color hash
│   └── pages/
│       ├── SetupPage.js  # Name entry screen
│       ├── LobbyPage.js  # Create room / browse rooms / manual join
│       └── RoomPage.js   # Player, queue, members panel, controls
├── public/
│   └── index.html
└── package.json
```

---

## Contributing

Contributions are welcome! Here's how to get started:

### Setting up for development

```bash
git clone https://github.com/yourusername/listenwave.git
cd listenwave
npm install
node node_modules/electron/install.js
npm start
```

### Project conventions

- **No UI framework** — styling uses CSS custom properties defined in `index.css`. Add new tokens there if needed.
- **Socket events** — all real-time events are defined in `electron/main.js` (server side) and handled in `RoomPage.js` (client side). If you add a new event, add it to both.
- **IPC bridge** — any new Electron API exposed to React must go through `preload.js` using `contextBridge`. Never enable `nodeIntegration`.
- **State refs** — `RoomPage` keeps `useRef` mirrors of queue and queueIndex so socket callbacks always read current values without stale closures. Follow this pattern for any new reactive state used inside socket handlers.

### Ideas for contributions

- [ ] Chat panel inside the room
- [ ] Album art extraction and display from audio metadata
- [ ] Queue persistence (save and reload playlists)
- [ ] Repeat one / repeat all toggle
- [ ] Dark/light theme toggle
- [ ] Keyboard shortcuts (space to play/pause, arrow keys to seek)
- [ ] Notification when someone joins the room
- [ ] Host transfer (pass host role to another member)
- [ ] Mobile companion web app (view-only listener)

### Submitting a pull request

1. Fork the repo and create a branch: `git checkout -b feature/your-feature`
2. Make your changes
3. Test on at least one platform
4. Open a pull request with a clear description of what changed and why

Please open an issue first for large changes so we can discuss the approach.

---

## Troubleshooting

**Electron won't start / binary missing**
```bash
rm -rf node_modules/electron
npm install electron@36 --save-dev
mkdir -p ~/.cache/electron
node node_modules/electron/install.js
```

**Room not showing in discovery**
→ mDNS is often blocked on office or university WiFi. Use **manual IP join** instead.

**Guests can't hear audio**
→ The host's firewall may be blocking port 45678. See platform-specific firewall instructions above.

**Audio cuts out or stutters**
→ This usually means the WiFi signal is weak. Move closer to the router, or switch to a wired connection on the host machine.

**`npm start` opens a browser instead of Electron**
→ Make sure `.env` exists in the project root with `BROWSER=none`. The app only works in Electron, not a browser tab.

**AppImage on Arch gives sandbox error**
```bash
./ListenWave-*.AppImage --no-sandbox
```

---

## License

MIT — free to use, modify, and distribute. See [LICENSE](LICENSE) for details.
