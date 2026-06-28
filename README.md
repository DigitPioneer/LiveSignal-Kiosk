# LiveSignal Kiosk

A Linux-based livestream kiosk for church TV displays.

When the device boots it shows a clean waiting screen with your church logo and rotating announcement slides. The moment your YouTube channel goes live it automatically switches to a full-screen embed player. When the stream ends it returns to the waiting screen — no one has to touch anything.

---

## How it works

```
Boot → Desktop auto-login
          │
          ├─ systemd:    python3 main.py   (HTTP server + YouTube watcher)
          │                   │
          │           serves http://localhost:8080
          │
          └─ Autostart: launch-kiosk.sh → Chromium kiosk → localhost:8080
```

The browser page polls `/api/state` every 30 seconds. The Python watcher uses
`yt-dlp` to check whether your YouTube channel is streaming. When it is, the
API returns the video ID and the page switches to a YouTube embed. When the
stream ends, the page returns to the slide show.

---

## Quick start

### Requirements

- Raspberry Pi OS Desktop, Ubuntu 22.04+, or any Debian-based Linux desktop
- Internet connection (for YouTube detection and livestream playback)
- Device connected to TV by HDMI

### 1 — Clone

```bash
cd ~
git clone https://github.com/YourOrg/LiveSignal-Kiosk.git
cd LiveSignal-Kiosk
```

### 2 — Configure

```bash
nano config.yaml     # set your YouTube URL and church name
nano slides.yaml     # add your announcement slides
```

### 3 — Add your logo

Copy your church logo to `assets/` and name it `logo.png` (or `logo.svg`).
A cross placeholder is included by default.

```bash
cp /path/to/yourlogo.png assets/logo.png
```

If you use `logo.png`, update the `<img src="…">` line in `web/index.html` to
`/assets/logo.png`.

### 4 — Install

```bash
bash scripts/install.sh
```

### 5 — Reboot

```bash
sudo reboot
```

For Raspberry Pi-specific steps, see [docs/raspberry-pi.md](docs/raspberry-pi.md).

---

## Configuration files

### `config.yaml` — main settings

```yaml
channel:
  live_url: "https://www.youtube.com/@YourChurch/live"
  check_interval_seconds: 60      # how often to poll YouTube

display:
  church_name: "Your Church Name"
  show_clock: true
  slide_duration_seconds: 8       # seconds per slide
  background_color: "#0d1117"
  accent_color: "#4a90d9"
  text_color: "#ffffff"

server:
  host: "127.0.0.1"
  port: 8080
```

### `slides.yaml` — announcement slides

```yaml
slides:
  - title: "Welcome!"
    body: |
      We're glad you're here.
      Join us after service.

  - title: "Sunday Service"
    body: "Every Sunday at 10:00 AM"
```

Add as many slides as you like. They rotate automatically on the waiting screen.
No code changes needed — just edit and save. The kiosk picks up changes within
30 seconds (or restart the backend service for immediate effect).

---

## Directory layout

```
LiveSignal-Kiosk/
├── config.yaml                 ← Edit this: YouTube URL, church name, colors
├── slides.yaml                 ← Edit this: announcement slides
├── main.py                     ← Python entry point (server + watcher)
├── kiosk/
│   ├── state.py                thread-safe state shared between server/watcher
│   ├── server.py               local HTTP server (serves page + API)
│   └── watcher.py              YouTube live-stream detector (yt-dlp)
├── web/
│   ├── index.html              kiosk page (waiting screen + live embed)
│   ├── style.css               TV-optimised styles
│   └── app.js                  slide rotation + state polling
├── assets/
│   └── logo.svg                ← Replace with your church logo
├── autostart/
│   ├── livesignal.service.template    systemd service reference
│   └── livesignal-kiosk.desktop.template  XDG autostart reference
├── scripts/
│   ├── install.sh              one-shot install
│   ├── update.sh               pull latest + restart service
│   ├── setup-autostart.sh      configure desktop autostart (called by install.sh)
│   └── launch-kiosk.sh         Chromium kiosk launcher (called by autostart)
└── docs/
    └── raspberry-pi.md         Raspberry Pi-specific setup guide
```

---

## Updating

Pull code changes and restart the backend:

```bash
bash scripts/update.sh
```

To update slides or config only, edit the YAML files. The kiosk page picks up
slide changes automatically. Config changes require a backend restart:

```bash
sudo systemctl restart livesignal
```

---

## Service management

```bash
# Status
sudo systemctl status livesignal

# Live logs
journalctl -u livesignal -f

# Restart backend
sudo systemctl restart livesignal

# Stop
sudo systemctl stop livesignal
```

---

## Troubleshooting

| Symptom | Check |
|---------|-------|
| Waiting screen never appears | `systemctl status livesignal` — check for Python/YAML errors |
| Never switches to live | Run `yt-dlp --print id "YOUR_LIVE_URL"` from the terminal while streaming |
| YouTube embed won't play | Channel may have embedding disabled; check YouTube Studio settings |
| Screen goes blank | Screensaver not disabled — re-run `scripts/install.sh` or add `xset -dpms` to autostart |
| Chromium crashes loop | Delete stale profile: `rm -rf /tmp/livesignal-chrome` |
| Wrong port | `config.yaml` server.port must match `scripts/launch-kiosk.sh` fallback |

---

## Customisation

| What | Where |
|------|-------|
| Colors | `config.yaml` → `display.*_color` |
| Font | `web/style.css` → `font-family` |
| Logo | Replace `assets/logo.svg` (update `web/index.html` src if changing format) |
| Layout | Edit `web/index.html` and `web/style.css` |
| Slide format | `slides.yaml` — title and body text, one entry per slide |

---

## Supported platforms

| Platform | Status |
|----------|--------|
| Raspberry Pi OS Desktop (Pi 4/5) | Primary target |
| Ubuntu 22.04+ Desktop | Supported |
| Debian 12 Desktop | Supported |
| Any Debian-based Linux with a desktop + Chromium | Should work |

> **Raspberry Pi 3B+** works but may struggle with 1080p live video. Lower
> YouTube quality in the embed URL by appending `&vq=hd720` to the embed src
> in `web/app.js`.
