"""
Thread-safe shared state between the watcher and HTTP server.
"""
import threading

_lock = threading.Lock()
_state = {"status": "waiting", "video_id": None, "setup": None}


def get():
    with _lock:
        return dict(_state)


def set_live(video_id: str):
    with _lock:
        _state["status"] = "live"
        _state["video_id"] = video_id
        _state["setup"] = None


def set_waiting():
    with _lock:
        _state["status"] = "waiting"
        _state["video_id"] = None
        _state["setup"] = None


def set_setup(ssid: str, password: str, ip: str):
    """Device is in hotspot/setup mode — no WiFi configured yet."""
    with _lock:
        _state["status"] = "setup"
        _state["video_id"] = None
        _state["setup"] = {"ssid": ssid, "password": password, "ip": ip}
