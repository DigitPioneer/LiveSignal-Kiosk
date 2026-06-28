#!/usr/bin/env bash
# =============================================================================
# LiveSignal Kiosk — Updater
#
# Pull the latest code from GitHub and restart the backend service.
# Run from the project root:
#   bash scripts/update.sh
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

GREEN='\033[0;32m'; BLUE='\033[0;34m'; NC='\033[0m'
info() { echo -e "${BLUE}[info]${NC} $*"; }
ok()   { echo -e "${GREEN}[ ok ]${NC} $*"; }

echo ""
echo "==========================================="
echo "  LiveSignal Kiosk — Updater"
echo "==========================================="
echo ""

cd "$PROJECT_DIR"

info "Pulling latest code from GitHub..."
git pull --ff-only

info "Updating yt-dlp..."
sudo yt-dlp -U 2>/dev/null || true

info "Restarting backend service..."
sudo systemctl restart livesignal

ok "Update complete. The kiosk will pick up changes on the next page refresh."
echo ""
echo "  If slides or config changed, reload Chromium:"
echo "  The kiosk page polls every 30 s automatically."
echo ""
