#!/usr/bin/env bash
# =============================================================================
# LiveSignal Kiosk — Quick WiFi connect helper
#
# Use this when setting up a new device over ethernet.
# Run from the project root:
#
#   bash scripts/wifi-connect.sh "YourSSID" "YourPassword"
#
# For open (no password) networks:
#   bash scripts/wifi-connect.sh "YourSSID"
# =============================================================================

set -euo pipefail

SSID="${1:-}"
PASSWORD="${2:-}"

if [ -z "$SSID" ]; then
    echo "Usage: bash scripts/wifi-connect.sh \"SSID\" \"Password\""
    echo "       bash scripts/wifi-connect.sh \"SSID\"           (open network)"
    exit 1
fi

echo "Connecting to: $SSID"

if [ -n "$PASSWORD" ]; then
    nmcli device wifi connect "$SSID" password "$PASSWORD"
else
    nmcli device wifi connect "$SSID"
fi

echo ""
echo "Connected. Your IP address:"
hostname -I
echo ""
echo "You can now unplug the ethernet cable."
