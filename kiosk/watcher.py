"""
YouTube live-stream watcher.

Polls the configured channel URL with yt-dlp. When the channel goes live,
updates the shared state so the browser switches to the embed player.
When the stream ends, reverts to the waiting screen.
"""
import logging
import re
import subprocess
import time
from typing import Optional

from kiosk import state

logger = logging.getLogger(__name__)

_VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")


def _check_live(channel_url: str) -> Optional[str]:
    """Return the live video ID if the channel is streaming, else None."""
    try:
        result = subprocess.run(
            [
                "yt-dlp",
                "--quiet",
                "--no-warnings",
                "--skip-download",
                "--print", "id",
                "--print", "live_status",
                channel_url,
            ],
            capture_output=True,
            text=True,
            timeout=45,
        )
        if result.returncode != 0:
            return None

        lines = [ln.strip() for ln in result.stdout.splitlines() if ln.strip()]
        if len(lines) < 2:
            return None

        video_id, live_status = lines[0], lines[1]

        if live_status == "is_live" and _VIDEO_ID_RE.match(video_id):
            return video_id

    except FileNotFoundError:
        logger.error(
            "yt-dlp not found. Install it: "
            "sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp "
            "-o /usr/local/bin/yt-dlp && sudo chmod a+rx /usr/local/bin/yt-dlp"
        )
    except subprocess.TimeoutExpired:
        logger.warning("YouTube live check timed out after 45 s")
    except Exception as exc:
        logger.error("YouTube live check failed: %s", exc)

    return None


def run(config: dict):
    """Main watcher loop — runs forever, intended to be called from a thread."""
    channel_url = config.get("channel", {}).get(
        "live_url", "https://www.youtube.com/@YourChurch/live"
    )
    interval = config.get("channel", {}).get("check_interval_seconds", 60)

    current_status = "waiting"
    logger.info("Watcher started. Polling every %d s → %s", interval, channel_url)

    while True:
        video_id = _check_live(channel_url)

        if video_id and current_status != "live":
            logger.info("Stream is LIVE: %s", video_id)
            state.set_live(video_id)
            current_status = "live"
        elif not video_id and current_status != "waiting":
            logger.info("Stream ended — returning to waiting screen")
            state.set_waiting()
            current_status = "waiting"

        time.sleep(interval)
