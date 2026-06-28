#!/usr/bin/env bash
# =============================================================================
# LiveSignal Kiosk — Configure Chromium kiosk autostart
#
# Called by install.sh but can be run standalone.
# Detects the desktop environment and uses the right autostart mechanism.
# =============================================================================

set -euo pipefail

PROJECT_DIR="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
LAUNCH_SCRIPT="$PROJECT_DIR/scripts/launch-kiosk.sh"
chmod +x "$LAUNCH_SCRIPT"

# ── Detect desktop environment ────────────────────────────────────────────────
detect_de() {
    # Check environment variable first (set by login manager)
    if [ -n "${XDG_CURRENT_DESKTOP:-}" ]; then
        echo "$XDG_CURRENT_DESKTOP"
        return
    fi
    # Raspberry Pi OS (LXDE-pi session)
    if [ -d "$HOME/.config/lxsession/LXDE-pi" ]; then
        echo "LXDE-pi"; return
    fi
    # Standard LXDE
    if [ -d "$HOME/.config/lxsession/LXDE" ]; then
        echo "LXDE"; return
    fi
    echo "UNKNOWN"
}

DE="$(detect_de)"
echo "  Desktop environment: $DE"

# ── LXDE (Raspberry Pi OS and standard LXDE) ─────────────────────────────────
setup_lxde() {
    local session="${1:-LXDE-pi}"
    local dir="$HOME/.config/lxsession/$session"
    mkdir -p "$dir"
    local file="$dir/autostart"
    local entry="@bash $LAUNCH_SCRIPT"
    if grep -qF "launch-kiosk.sh" "$file" 2>/dev/null; then
        echo "  Already in $file — skipping."
    else
        echo "$entry" >> "$file"
        echo "  Added to $file"
    fi
}

# ── XDG .desktop autostart (GNOME, XFCE, KDE, etc.) ─────────────────────────
setup_xdg() {
    local dir="$HOME/.config/autostart"
    mkdir -p "$dir"
    local file="$dir/livesignal-kiosk.desktop"
    cat > "$file" <<EOF
[Desktop Entry]
Type=Application
Name=LiveSignal Kiosk
Exec=bash $LAUNCH_SCRIPT
Hidden=false
NoDisplay=false
X-GNOME-Autostart-enabled=true
EOF
    echo "  Created $file"
}

# ── Dispatch ──────────────────────────────────────────────────────────────────
case "$DE" in
    LXDE-pi)
        setup_lxde "LXDE-pi"
        ;;
    LXDE)
        setup_lxde "LXDE"
        ;;
    *GNOME*|*gnome*|Unity|KDE|XFCE|xfce|Budgie|Cinnamon)
        setup_xdg
        ;;
    *)
        echo "  Unknown DE ($DE). Trying LXDE-pi, then XDG..."
        if [ -d "$HOME/.config/lxsession/LXDE-pi" ]; then
            setup_lxde "LXDE-pi"
        elif [ -d "$HOME/.config/lxsession/LXDE" ]; then
            setup_lxde "LXDE"
        else
            setup_xdg
        fi
        ;;
esac
