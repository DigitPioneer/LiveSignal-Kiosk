#!/usr/bin/env bash
# =============================================================================
# LiveSignal Kiosk — Silent boot setup
#
# Removes the Debian/Pi boot text and rainbow screen so the TV shows a
# clean black screen until Chromium opens.
#
# Run once (or re-run safely — it is idempotent):
#   bash scripts/setup-silent-boot.sh
#
# A reboot is required for changes to take effect.
# =============================================================================

set -euo pipefail

GREEN='\033[0;32m'; BLUE='\033[0;34m'; NC='\033[0m'
info() { echo -e "${BLUE}[info]${NC} $*"; }
ok()   { echo -e "${GREEN}[ ok ]${NC} $*"; }

# ── Detect boot file location (Bookworm: /boot/firmware, Bullseye: /boot) ────
if [ -f /boot/firmware/cmdline.txt ]; then
    BOOT_DIR="/boot/firmware"
else
    BOOT_DIR="/boot"
fi

CMDLINE="$BOOT_DIR/cmdline.txt"
CONFIGTXT="$BOOT_DIR/config.txt"

echo ""
echo "==========================================="
echo "  LiveSignal Kiosk — Silent Boot Setup"
echo "==========================================="
echo "  Boot dir: $BOOT_DIR"
echo ""

# ── 1. cmdline.txt — suppress kernel boot messages ───────────────────────────
info "Updating $CMDLINE ..."

current="$(cat "$CMDLINE")"
updated="$current"

add_param() {
    local param="$1"
    if ! echo "$updated" | grep -qw "$param"; then
        updated="$updated $param"
        echo "  + $param"
    else
        echo "  (already set) $param"
    fi
}

# quiet          — suppress most kernel log output
# loglevel=1     — only show critical errors
# logo.nologo    — hide the kernel Tux penguin logo
# vt.global_cursor_default=0  — hide blinking cursor on TTY
add_param "quiet"
add_param "loglevel=1"
add_param "logo.nologo"
add_param "vt.global_cursor_default=0"

if [ "$updated" != "$current" ]; then
    # Write back as a single line (cmdline.txt must be one line)
    echo "$updated" | tr -s ' ' | sudo tee "$CMDLINE" > /dev/null
    ok "cmdline.txt updated."
else
    ok "cmdline.txt already configured."
fi

# ── 2. config.txt — remove Pi rainbow/logo splash at power-on ────────────────
info "Updating $CONFIGTXT ..."

if ! grep -q "^disable_splash=1" "$CONFIGTXT" 2>/dev/null; then
    echo "disable_splash=1" | sudo tee -a "$CONFIGTXT" > /dev/null
    echo "  + disable_splash=1"
    ok "$CONFIGTXT updated."
else
    ok "disable_splash already set in $CONFIGTXT."
fi

# ── 3. .bash_profile — clear terminal before startx ──────────────────────────
# This blanks the TTY the instant auto-login fires, before X starts.
info "Patching ~/.bash_profile to clear TTY before startx..."
BASH_PROFILE="$HOME/.bash_profile"

if grep -q "startx" "$BASH_PROFILE" 2>/dev/null; then
    # Replace the existing startx line to add the clear-screen escape
    if ! grep -q "printf.*\\\\033\[2J" "$BASH_PROFILE" 2>/dev/null; then
        sudo sed -i "s|startx -- -nocursor|printf '\\\\033[2J\\\\033[H\\\\033[?25l'; exec startx -- -nocursor|" "$BASH_PROFILE"
        ok ".bash_profile updated."
    else
        ok ".bash_profile already clears screen."
    fi
else
    ok ".bash_profile has no startx line — skipping (only needed for Pi OS Lite)."
fi

echo ""
echo "==========================================="
echo -e "  ${GREEN}Silent boot configured!${NC}"
echo "==========================================="
echo ""
echo "  Reboot now to apply:  sudo reboot"
echo ""
