#!/usr/bin/env bash
# =============================================================================
# LiveSignal Kiosk — Installer for Raspberry Pi OS Lite (no desktop)
#
# Installs a minimal X11 + Openbox environment, then sets up the kiosk.
# Run from the project root:
#   bash scripts/install-lite.sh
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
RUN_USER="$(whoami)"
HOME_DIR="$HOME"

GREEN='\033[0;32m'; BLUE='\033[0;34m'; NC='\033[0m'
info() { echo -e "${BLUE}[info]${NC} $*"; }
ok()   { echo -e "${GREEN}[ ok ]${NC} $*"; }

echo ""
echo "==========================================="
echo "  LiveSignal Kiosk — Lite Installer"
echo "==========================================="
echo "  Project: $PROJECT_DIR"
echo "  User:    $RUN_USER"
echo ""

# ── Step 1: System packages ───────────────────────────────────────────────────
info "Step 1/7 — Installing X11, Openbox, and Chromium..."
sudo apt-get update -qq
sudo apt-get install -y \
    xserver-xorg \
    x11-xserver-utils \
    xinit \
    openbox \
    chromium-browser \
    python3 \
    python3-yaml \
    curl \
    unclutter
ok "Packages installed."

# ── Step 2: yt-dlp ───────────────────────────────────────────────────────────
info "Step 2/7 — Installing yt-dlp..."
if command -v yt-dlp &>/dev/null; then
    sudo yt-dlp -U 2>/dev/null || true
else
    sudo curl -sSL \
        "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp" \
        -o /usr/local/bin/yt-dlp
    sudo chmod a+rx /usr/local/bin/yt-dlp
fi
ok "yt-dlp ready."

# ── Step 3: TTY1 auto-login ───────────────────────────────────────────────────
info "Step 3/7 — Enabling TTY1 auto-login for user '$RUN_USER'..."
sudo mkdir -p /etc/systemd/system/getty@tty1.service.d/
sudo tee /etc/systemd/system/getty@tty1.service.d/autologin.conf > /dev/null <<EOF
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin $RUN_USER --noclear %I \$TERM
EOF
sudo systemctl daemon-reload
ok "TTY1 auto-login configured."

# ── Step 4: .bash_profile — start X on TTY1 login ────────────────────────────
info "Step 4/7 — Configuring startx on login..."
BASH_PROFILE="$HOME_DIR/.bash_profile"
if ! grep -qF "startx" "$BASH_PROFILE" 2>/dev/null; then
    cat >> "$BASH_PROFILE" <<'PROFILE'

# LiveSignal Kiosk: start X server on TTY1
if [ -z "$DISPLAY" ] && [ "$(tty)" = "/dev/tty1" ]; then
    startx -- -nocursor 2>/tmp/xorg.log
fi
PROFILE
fi
ok ".bash_profile configured."

# ── Step 5: .xinitrc — launch Openbox ────────────────────────────────────────
info "Step 5/7 — Creating .xinitrc..."
cat > "$HOME_DIR/.xinitrc" <<'XINITRC'
#!/bin/bash
exec openbox-session
XINITRC
chmod +x "$HOME_DIR/.xinitrc"
ok ".xinitrc created."

# ── Step 6: Openbox autostart — kiosk launcher ───────────────────────────────
info "Step 6/7 — Configuring Openbox autostart..."
mkdir -p "$HOME_DIR/.config/openbox"
cat > "$HOME_DIR/.config/openbox/autostart" <<AUTOSTART
# Disable screensaver and DPMS
xset s off
xset s noblank
xset -dpms

# Hide mouse cursor after 1 second of inactivity
unclutter -idle 1 -root &

# Launch the kiosk (restarts Chromium if it crashes)
bash $PROJECT_DIR/scripts/launch-kiosk.sh &
AUTOSTART
ok "Openbox autostart configured."

# ── Step 7: systemd backend service ──────────────────────────────────────────
info "Step 7/7 — Setting up backend service..."
sudo tee /etc/systemd/system/livesignal.service > /dev/null <<EOF
[Unit]
Description=LiveSignal Kiosk Backend
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$RUN_USER
WorkingDirectory=$PROJECT_DIR
ExecStart=/usr/bin/python3 main.py
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=livesignal

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable livesignal
sudo systemctl restart livesignal
ok "Backend service enabled and started."

echo ""
echo "==========================================="
echo -e "  ${GREEN}Installation complete!${NC}"
echo "==========================================="
echo ""
echo "  Next steps:"
echo "  1. Verify config.yaml has your YouTube URL"
echo "  2. Verify slides.yaml has your announcements"
echo "  3. sudo reboot"
echo ""
echo "  After reboot, check backend logs with:"
echo "    journalctl -u livesignal -f"
echo ""
