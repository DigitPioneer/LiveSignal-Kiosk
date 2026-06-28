"""
Local HTTP server.

Serves the kiosk web page and a small JSON API so the browser can poll
for the current state (waiting vs. live) and load slides/config.
"""
import json
import logging
import mimetypes
import os
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Optional
from urllib.parse import urlparse

from kiosk import state

logger = logging.getLogger(__name__)

_config = {}
_slides = []


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
            self._json(_slides)

        elif path == "/api/config":
            d = _config.get("display", {})
            s = _config.get("server", {})
            self._json({
                "church_name": d.get("church_name", "Your Church"),
                "show_clock": d.get("show_clock", True),
                "slide_duration_seconds": d.get("slide_duration_seconds", 8),
                "background_color": d.get("background_color", "#0d1117"),
                "accent_color": d.get("accent_color", "#4a90d9"),
                "text_color": d.get("text_color", "#ffffff"),
            })

        elif path in ("/", "/index.html"):
            self._file(os.path.join("web", "index.html"))

        elif path.startswith("/assets/"):
            self._file(path[1:])  # strip leading /

        else:
            # Everything else: look in the web/ directory
            # e.g. /style.css → web/style.css
            self._file(os.path.join("web", path.lstrip("/")))

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
