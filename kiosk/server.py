"""
Local HTTP server.

Serves the kiosk web page and a small JSON API so the browser can poll
for the current state (waiting vs. live) and load slides/config.
"""
import json
import logging
import mimetypes
import os
import subprocess
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Optional
from urllib.parse import urlparse

import yaml

from kiosk import network, state

logger = logging.getLogger(__name__)

_config = {}
_slides = []  # fallback only; slides are re-read from disk on each request


def _project_root() -> str:
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _safe_path(rel: str) -> Optional[str]:
    """Resolve a relative path and ensure it stays inside the project root."""
    root = _project_root()
    target = os.path.realpath(os.path.join(root, rel.lstrip("/\\")))
    if not target.startswith(root):
        return None
    return target


class KioskHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        path = urlparse(self.path).path

        if path == "/api/state":
            self._json(state.get())

        elif path == "/api/slides":
            # Read from disk every time so admin edits appear without restart
            try:
                slides_path = os.path.join(_project_root(), "slides.yaml")
                with open(slides_path, "r", encoding="utf-8") as fh:
                    doc = yaml.safe_load(fh) or {}
                self._json(doc.get("slides", _slides))
            except Exception:
                self._json(_slides)

        elif path == "/api/config":
            d = _config.get("display", {})
            self._json({
                "church_name": d.get("church_name", "Your Church"),
                "show_clock": d.get("show_clock", True),
                "slide_duration_seconds": d.get("slide_duration_seconds", 8),
                "background_color": d.get("background_color", "#0d1117"),
                "accent_color": d.get("accent_color", "#4a90d9"),
                "text_color": d.get("text_color", "#ffffff"),
            })

        elif path == "/setup/wifi/scan":
            subprocess.run(
                ["sudo", "nmcli", "device", "wifi", "rescan"],
                capture_output=True, timeout=12,
            )
            self._json(self._scan_wifi())

        elif path == "/setup/wifi/status":
            self._json({"connected": network.has_active_connection()})

        elif path in ("/", "/index.html"):
            self._file(os.path.join("web", "index.html"))

        elif path.startswith("/assets/"):
            self._file(path[1:])  # strip leading /

        else:
            # Everything else: look in the web/ directory
            # e.g. /style.css → web/style.css
            self._file(os.path.join("web", path.lstrip("/")))

    def do_POST(self):
        path = urlparse(self.path).path
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length) if length else b""
        try:
            data = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            self._json({"ok": False, "message": "Invalid JSON"})
            return

        if path == "/setup/wifi/connect":
            ssid = data.get("ssid", "").strip()
            password = data.get("password", "")
            self._json(self._connect_wifi(ssid, password))

        elif path == "/setup/config":
            self._json(self._save_setup_config(data))

        else:
            self.send_error(404)

    def _scan_wifi(self) -> list:
        try:
            r = subprocess.run(
                ["nmcli", "--terse", "--escape", "yes",
                 "--fields", "SSID,SIGNAL,SECURITY,IN-USE",
                 "device", "wifi", "list"],
                capture_output=True, text=True, timeout=15,
            )
            seen: set = set()
            networks = []
            for line in r.stdout.strip().splitlines():
                # Split from right so SSIDs containing colons are kept intact
                # Line format: SSID:SIGNAL:SECURITY:IN-USE
                p = line.rsplit(":", 3)
                if len(p) < 4:
                    continue
                ssid = p[0].replace("\\:", ":").strip()
                if not ssid or ssid in seen:
                    continue
                seen.add(ssid)
                try:
                    signal = int(p[1])
                except ValueError:
                    signal = 0
                security = p[2].strip()
                in_use = p[3].strip() == "*"
                networks.append({
                    "ssid": ssid,
                    "signal": signal,
                    "security": security or "Open",
                    "in_use": in_use,
                })
            networks.sort(key=lambda n: (-int(n["in_use"]), -n["signal"]))
            return networks
        except Exception as exc:
            logger.error("WiFi scan failed: %s", exc)
            return []

    def _connect_wifi(self, ssid: str, password: str) -> dict:
        try:
            cmd = ["sudo", "nmcli", "device", "wifi", "connect", ssid]
            if password:
                cmd += ["password", password]
            r = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            if r.returncode == 0:
                network.stop_hotspot()
                state.set_waiting()
                return {"ok": True}
            msg = (r.stderr.strip() or r.stdout.strip() or "Connection failed").split("\n")[0]
            return {"ok": False, "message": msg}
        except subprocess.TimeoutExpired:
            return {"ok": False, "message": "Connection timed out — wrong password?"}
        except Exception as exc:
            return {"ok": False, "message": str(exc)}

    def _save_setup_config(self, data: dict) -> dict:
        global _config
        try:
            config_path = os.path.join(_project_root(), "config.yaml")
            with open(config_path, "r", encoding="utf-8") as f:
                cfg = yaml.safe_load(f) or {}
            if data.get("church_name"):
                cfg.setdefault("display", {})["church_name"] = data["church_name"].strip()
            if data.get("live_url"):
                cfg.setdefault("channel", {})["live_url"] = data["live_url"].strip()
            if data.get("admin_pin"):
                cfg.setdefault("admin", {})["pin"] = data["admin_pin"].strip()
            with open(config_path, "w", encoding="utf-8") as f:
                yaml.dump(cfg, f, default_flow_style=False, allow_unicode=True, sort_keys=False)
            _config = cfg
            state.set_waiting()
            return {"ok": True}
        except Exception as exc:
            logger.error("Config save failed: %s", exc)
            return {"ok": False, "message": str(exc)}

    def _json(self, data):
        body = json.dumps(data).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _file(self, rel_path: str):
        safe = _safe_path(rel_path)
        if safe is None:
            self.send_error(403)
            return
        try:
            with open(safe, "rb") as fh:
                content = fh.read()
            mime, _ = mimetypes.guess_type(safe)
            if mime is None:
                mime = "application/octet-stream"
            self.send_response(200)
            self.send_header("Content-Type", mime)
            self.send_header("Content-Length", str(len(content)))
            self.end_headers()
            self.wfile.write(content)
        except FileNotFoundError:
            self.send_error(404)

    def log_message(self, fmt, *args):
        pass  # suppress per-request access logs


def run(config: dict, slides: list):
    global _config, _slides
    _config = config
    _slides = slides

    host = config.get("server", {}).get("host", "127.0.0.1")
    port = config.get("server", {}).get("port", 8080)

    httpd = HTTPServer((host, port), KioskHandler)
    logger.info("HTTP server listening on http://%s:%d", host, port)
    httpd.serve_forever()
