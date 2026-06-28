# Raspberry Pi Setup Guide

This guide covers setting up LiveSignal Kiosk on a **Raspberry Pi** running
**Raspberry Pi OS Desktop** (Bookworm or Bullseye). For general Linux (Ubuntu,
Debian, mini-PC), see the main [README](../README.md).

---

## Hardware

| Item | Notes |
|------|-------|
| Raspberry Pi 4 (2 GB+ RAM) | Pi 3B+ works but YouTube HD may stutter |
| MicroSD card (16 GB+) | Class 10 / A1 or better |
| HDMI cable + TV | Pi 4 uses micro-HDMI |
| Power supply | Official Pi 4 USB-C adapter (5V 3A) |
| Ethernet cable *(recommended)* | Wi-Fi works but wired is more reliable for live video |

---

## 1. Flash Raspberry Pi OS Desktop

1. Download **Raspberry Pi Imager** from [raspberrypi.com/software](https://www.raspberrypi.com/software/).
2. Choose **Raspberry Pi OS (64-bit)** — full Desktop version.
3. In Imager settings (gear icon), enable:
   - SSH (optional but useful for remote maintenance)
   - Set hostname, username, and password
   - Configure Wi-Fi if not using Ethernet
4. Flash to the SD card and boot.

---

## 2. System updates

```bash
sudo apt update && sudo apt full-upgrade -y
sudo reboot
```

---

## 3. Enable auto-login to Desktop

```bash
sudo raspi-config
```

Navigate to: **System Options → Boot / Auto Login → Desktop Autologin**

This ensures the display starts automatically on boot (required for the kiosk).

---

## 4. Clone the repo

```bash
cd ~
git clone https://github.com/YourOrg/LiveSignal-Kiosk.git
cd LiveSignal-Kiosk
```

---

## 5. Configure

```bash
nano config.yaml
```

Set at minimum:
- `channel.live_url` — your YouTube channel's `/live` URL
- `display.church_name` — your church name

```bash
nano slides.yaml
```

Replace the example slides with your announcements.

---

## 6. Add your church logo

Replace `assets/logo.svg` with your logo file:

```bash
cp /path/to/your/logo.png assets/logo.png
```

Then update the `<img src="…">` in `web/index.html` to point to `logo.png`
instead of `logo.svg` (or keep SVG format if that's what your logo is).

---

## 7. Run the installer

```bash
bash scripts/install.sh
```

The installer will:
- Install `chromium-browser`, `python3-yaml`, `unclutter`
- Download `yt-dlp` to `/usr/local/bin/`
- Create and enable the `livesignal` systemd service
- Add Chromium to the LXDE desktop autostart
- Disable screensaver

---

## 8. Reboot

```bash
sudo reboot
```

After reboot you should see the waiting screen on the TV within about 30 seconds.

---

## Performance tips

| Setting | How to change |
|---------|--------------|
| GPU memory | `sudo raspi-config` → Performance → GPU Memory → set to 128 MB |
| Overscan | If black bars appear: `sudo raspi-config` → Display → Underscan |
| Resolution | `sudo raspi-config` → Display → Resolution → match your TV |
| Force HDMI | If TV not detected: add `hdmi_force_hotplug=1` to `/boot/config.txt` |

---

## Maintenance

### Update slides without rebooting

Edit `slides.yaml` and save. The browser polls the API every 30 seconds and
picks up changes automatically (no restart needed).

### Update config without rebooting

Edit `config.yaml`, then:

```bash
sudo systemctl restart livesignal
```

### Pull updates from GitHub

```bash
cd ~/LiveSignal-Kiosk
bash scripts/update.sh
```

### Check service logs

```bash
journalctl -u livesignal -f
```

### Restart the backend manually

```bash
sudo systemctl restart livesignal
```

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Black screen on boot | Check auto-login is enabled in `raspi-config` |
| "Backend not ready" in launch log | Check `systemctl status livesignal` — likely a Python or YAML error |
| Clock/slides show but never switches to live | Run `yt-dlp --print id URL` manually; verify URL is correct |
| YouTube embed shows "Video unavailable" | The channel may have embed disabled; use `controls=0` variant or check channel settings |
| Screen goes blank after a while | Run `xset -dpms` and check LXDE autostart has the xset lines |
| Chromium crashes in a loop | Check `/tmp/livesignal-chrome` for stale lock files: `rm -rf /tmp/livesignal-chrome` |
