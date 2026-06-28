#!/usr/bin/env bash
# =============================================================================
# LiveSignal Kiosk — Kiosk launcher
#
# Called by the desktop autostart. Runs in the user's X11/Wayland session.
# Disables screensaver, hides cursor, waits for backend, then loops Chromium.
# =============================================================================

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT=8080

# Read port from config if python3 and pyyaml are available
if command -v python3 &>/dev/null; then
    MAYBE_PORT="$(python3 -c "
import yaml, sys
try:
    c = yaml.safe_load(open('$PROJECT_DIR/config.yaml'))
    print(c.get('server',{}).get('port', $PORT))
except: print($PORT)
" 2>/dev/null)"
    [ -n "$MAYBE_PORT" ] && PORT="$MAYBE_PORT"
fi

# ── Display settings ──────────────────────────────────────────────────────────
# Disable screensaver and screen blanking
xset s off    2>/dev/null || true
xset s noblank 2>/dev/null || true
xset -dpms    2>/dev/null || true

# Hide idle mouse cursor (unclutter may not be installed; fail silently)
if command -v unclutter &>/dev/null; then
    unclutter -idle 1 -root &
fi

# ── Wait for backend ──────────────────────────────────────────────────────────
echo "[kiosk] Waiting for backend on port $PORT..."
until curl -sf "http://localhost:$PORT/api/state" > /dev/null 2>&1; do
    sleep 1
done
echo "[kiosk] Backend ready."

# ── Find Chromium ─────────────────────────────────────────────────────────────
CHROMIUM=""
for cmd in chromium-browser chromium google-chrome google-chrome-stable; do
    if command -v "$cmd" &>/dev/null; then
        CHROMIUM="$cmd"
        break
    fi
done

if [ -z "$CHROMIUM" ]; then
    echo "[kiosk] ERROR: No Chromium browser found." >&2
    echo "[kiosk] Install with: sudo apt-get install chromium-browser" >&2
    exit 1
fi

CHROMIUM_FLAGS=(
    --kiosk
    --noerrdialogs
    --disable-infobars
    --disable-session-crashed-bubble
    --disable-features=TranslateUI
    --disable-pinch
    --overscroll-history-navigation=0
    --autoplay-policy=no-user-gesture-required
    --check-for-update-interval=31536000
    --user-data-dir=/tmp/livesignal-chrome
    # GPU / hardware video decode — reduces stream lag on Raspberry Pi
    --use-gl=egl
    --enable-gpu-rasterization
    --enable-zero-copy
    --disable-software-rasterizer
    --enable-features=VaapiVideoDecoder
    --ignore-gpu-blocklist
)

# ── Main loop: restart Chromium if it exits ───────────────────────────────────
echo "[kiosk] Starting Chromium..."
while true; do
    "$CHROMIUM" "${CHROMIUM_FLAGS[@]}" "http://localhost:$PORT" || true
    echo "[kiosk] Chromium exited. Restarting in 5 s..."
    sleep 5
done
