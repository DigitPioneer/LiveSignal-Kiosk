#!/usr/bin/env bash
# =============================================================================
# LiveSignal Kiosk — Installer
#
# Run once from the project root:
#   bash scripts/install.sh
#
# Tested on: Raspberry Pi OS Desktop, Ubuntu 22.04+, Debian 12+
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
RUN_USER="$(whoami)"

# ── Colours ───────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; BLUE='\033[0;34m'; RED='\033[0;31m'; NC='\033[0m'
info()  { echo -e "${BLUE}[info]${NC} $*"; }
ok()    { echo -e "${GREEN}[ ok ]${NC} $*"; }
error() { echo -e "${RED}[error]${NC} $*" >&2; }

echo ""
echo "==========================================="
echo "  LiveSignal Kiosk — Installer"
echo "==========================================="
echo "  Project: $PROJECT_DIR"
echo "  User:    $RUN_USER"
echo ""

# ── Step 1: System packages ───────────────────────────────────────────────────
info "Step 1/5 — Installing system packages..."
sudo apt-get update -qq
sudo apt-get install -y \
    python3 \
    python3-yaml \
    chromium-browser \
    curl \
    unclutter
ok "System packages installed."

# ── Step 2: yt-dlp ───────────────────────────────────────────────────────────
info "Step 2/5 — Installing yt-dlp..."
YT_DLP_BIN="/usr/local/bin/yt-dlp"
if command -v yt-dlp &>/dev/null; then
    info "yt-dlp already present — updating..."
    sudo yt-dlp -U 2>/dev/null || true
else
    sudo curl -sSL \
        "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp" \
        -o "$YT_DLP_BIN"
    sudo chmod a+rx "$YT_DLP_BIN"
fi
ok "yt-dlp ready at $YT_DLP_BIN"

# ── Step 3: systemd backend service ──────────────────────────────────────────
info "Step 3/5 — Setting up systemd backend service..."
SERVICE_FILE="/etc/systemd/system/livesignal.service"
sudo bash -c "cat > $SERVICE_FILE" <<EOF
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

# ── Step 4: Chromium kiosk autostart ─────────────────────────────────────────
info "Step 4/5 — Configuring Chromium autostart..."
bash "$SCRIPT_DIR/setup-autostart.sh" "$PROJECT_DIR"
ok "Kiosk display autostart configured."

# ── Step 5: Display tweaks ────────────────────────────────────────────────────
info "Step 5/5 — Disabling screensaver/blanking in LXDE autostart (if applicable)..."
LXDE_AUTOSTART="$HOME/.config/lxsession/LXDE-pi/autostart"
if [ -d "$(dirname "$LXDE_AUTOSTART")" ]; then
    for xset_cmd in "@xset s off" "@xset s noblank" "@xset -dpms"; do
        grep -qF "$xset_cmd" "$LXDE_AUTOSTART" 2>/dev/null || echo "$xset_cmd" >> "$LXDE_AUTOSTART"
    done
    ok "LXDE screensaver disabled."
fi

echo ""
echo "==========================================="
echo -e "  ${GREEN}Installation complete!${NC}"
echo "==========================================="
echo ""
echo "  Next steps:"
echo "  1. Edit config.yaml  — set your YouTube channel URL and church name"
echo "  2. Edit slides.yaml  — add your announcement slides"
echo "  3. Replace assets/logo.svg with your church logo (PNG or SVG)"
echo "  4. Reboot: sudo reboot"
echo ""
