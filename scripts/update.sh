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

# If a previous stash pop left unresolved conflicts, stage them now so
# git is in a clean enough state to stash again.
UNMERGED=$(git diff --name-only --diff-filter=U 2>/dev/null || true)
if [ -n "$UNMERGED" ]; then
    info "Staging previously-conflicted files: $UNMERGED"
    git add $UNMERGED
fi

# Stash any local edits (config.yaml, slides.yaml, etc.) before pulling,
# then re-apply them on top of the new code.
STASHED=0
if ! git diff --quiet || ! git diff --cached --quiet; then
    info "Saving local changes before pull..."
    git stash
    STASHED=1
fi

info "Pulling latest code from GitHub..."
git pull --ff-only

if [ "$STASHED" = "1" ]; then
    info "Restoring local changes..."
    if git stash pop; then
        ok "Local changes restored."
    else
        echo ""
        echo "  WARNING: merge conflict in config.yaml or slides.yaml."
        echo "  Run 'git diff' to see the conflict markers, then:"
        echo "    nano config.yaml   # fix and save"
        echo "    git checkout -- slides.yaml  # or reset this file"
        echo ""
    fi
fi

info "Updating yt-dlp..."
sudo yt-dlp -U 2>/dev/null || true

info "Restarting backend service..."
sudo systemctl restart livesignal

ok "Update complete. The kiosk will pick up changes on the next page refresh."
echo ""
echo "  If slides or config changed, reload Chromium:"
echo "  The kiosk page polls every 30 s automatically."
echo ""
