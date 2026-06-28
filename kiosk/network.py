"""
Network utilities — WiFi detection and setup hotspot management.

On first boot with no WiFi configured, the kiosk starts a temporary
WiFi hotspot so a volunteer can open the admin panel and connect to
the church network without needing SSH or ethernet.
"""

import logging
import subprocess
import time
from typing import Optional

logger = logging.getLogger(__name__)

HOTSPOT_CON_NAME = "livesignal-hotspot"
DEFAULT_HOTSPOT_IP = "10.42.0.1"


def has_active_connection(retries: int = 1) -> bool:
    """Return True if a WiFi or Ethernet device is actually connected."""
    for _ in range(retries):
        try:
            r = subprocess.run(
                ["nmcli", "-t", "-f", "TYPE,STATE", "device"],
                capture_output=True, text=True, timeout=5,
            )
            for line in r.stdout.strip().splitlines():
                parts = line.split(":")
                if len(parts) >= 2 and parts[0].strip() in ("wifi", "ethernet"):
                    if parts[1].strip() == "connected":
                        return True
        except Exception:
            pass
        time.sleep(1)
    return False


def wait_for_connection(timeout: int = 15) -> bool:
    """Wait up to *timeout* seconds for a network connection to appear."""
    logger.info("Waiting up to %d s for network connection...", timeout)
    for i in range(timeout):
        if has_active_connection():
            logger.info("Network connected after %d s.", i)
            return True
        time.sleep(1)
    logger.info("No network connection after %d s.", timeout)
    return False


def start_hotspot(ssid: str, password: str) -> Optional[str]:
    """
    Create a WiFi access-point using NetworkManager.
    Returns the hotspot IP address on success, None on failure.
    """
    # Remove any stale hotspot connection first
    subprocess.run(
        ["sudo", "nmcli", "connection", "delete", HOTSPOT_CON_NAME],
        capture_output=True, timeout=10,
    )

    try:
        result = subprocess.run(
            [
                "sudo", "nmcli", "device", "wifi", "hotspot",
                "ifname", "wlan0",
                "ssid",   ssid,
                "password", password,
                "con-name", HOTSPOT_CON_NAME,
            ],
            capture_output=True, text=True, timeout=30,
        )
        if result.returncode != 0:
            logger.error("Hotspot start failed: %s", result.stderr.strip())
            return None

        ip = _get_hotspot_ip()
        logger.info("Hotspot '%s' started at %s", ssid, ip)
        return ip

    except Exception as exc:
        logger.error("Failed to start hotspot: %s", exc)
        return None


def stop_hotspot():
    """Tear down the setup hotspot."""
    try:
        subprocess.run(
            ["sudo", "nmcli", "connection", "down", HOTSPOT_CON_NAME],
            capture_output=True, timeout=10,
        )
        subprocess.run(
            ["sudo", "nmcli", "connection", "delete", HOTSPOT_CON_NAME],
            capture_output=True, timeout=10,
        )
        logger.info("Hotspot stopped.")
    except Exception as exc:
        logger.warning("Could not stop hotspot: %s", exc)


def _get_hotspot_ip() -> str:
    """Return the IP address assigned to the hotspot interface."""
    try:
        r = subprocess.run(
            ["nmcli", "-t", "-f", "IP4.ADDRESS", "connection", "show", HOTSPOT_CON_NAME],
            capture_output=True, text=True, timeout=10,
        )
        for line in r.stdout.strip().splitlines():
            if "IP4.ADDRESS" in line:
                # e.g. "IP4.ADDRESS[1]:10.42.0.1/24"
                return line.split(":")[-1].split("/")[0].strip()
    except Exception:
        pass
    return DEFAULT_HOTSPOT_IP
