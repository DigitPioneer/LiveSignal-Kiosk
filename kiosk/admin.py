"""
Admin web server for LiveSignal Kiosk.

Listens on 0.0.0.0:8081 (all network interfaces) so it can be reached from
any device on the local network. Access at:

    http://<pi-ip-address>:8081/admin

Protected by a PIN set in config.yaml under admin.pin
"""

import base64
import json
import logging
import mimetypes
import os
import subprocess
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Optional
from urllib.parse import urlparse

import yaml

from kiosk import state

logger = logging.getLogger(__name__)

_config_path = "config.yaml"
_slides_path = "slides.yaml"
_admin_config = {}


# ── YAML helpers ──────────────────────────────────────────────────────────────

def _load_config() -> dict:
    with open(_config_path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def _save_config(data: dict):
    with open(_config_path, "w", encoding="utf-8") as f:
        yaml.dump(data, f, default_flow_style=False, allow_unicode=True, sort_keys=False)


def _load_slides() -> list:
    with open(_slides_path, "r", encoding="utf-8") as f:
        doc = yaml.safe_load(f) or {}
    return doc.get("slides", [])


def _save_slides(slides: list):
    with open(_slides_path, "w", encoding="utf-8") as f:
        yaml.dump(
            {"slides": slides},
            f,
            default_flow_style=False,
            allow_unicode=True,
            sort_keys=False,
        )


# ── Path helpers ──────────────────────────────────────────────────────────────

def _project_root() -> str:
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _safe_path(rel: str) -> Optional[str]:
    root = _project_root()
    target = os.path.realpath(os.path.join(root, rel.lstrip("/\\")))
    if not target.startswith(root):
        return None
    return target


# ── Request handler ───────────────────────────────────────────────────────────

class AdminHandler(BaseHTTPRequestHandler):

    # ── Auth ──────────────────────────────────────────────────────────────────

    def _check_auth(self) -> bool:
        expected = _admin_config.get("admin", {}).get("pin", "changeme")
        auth = self.headers.get("Authorization", "")
        if not auth.startswith("Basic "):
            return False
        try:
            decoded = base64.b64decode(auth[6:]).decode("utf-8")
            _, _, password = decoded.partition(":")
            return password == expected
        except Exception:
            return False

    def _require_auth(self) -> bool:
        if self._check_auth():
            return True
        self._json({"error": "Unauthorized"}, code=401)
        return False

    # ── Routing ───────────────────────────────────────────────────────────────

    def do_GET(self):
        path = urlparse(self.path).path

        # Serve the admin HTML/CSS/JS without auth so the login page loads
        if path in ("/admin", "/admin/"):
            self._file("web/admin/index.html")
            return
        if path.startswith("/admin/static/"):
            self._file("web/admin/" + path[len("/admin/static/"):])
            return

        # All API routes require auth
        if not self._require_auth():
            return

        if path == "/admin/api/status":
            self._json({
                "kiosk":   state.get(),
                "service": self._service_status(),
                "ip":      self._local_ip(),
            })

        elif path == "/admin/api/config":
            try:
                self._json(_load_config())
            except Exception as exc:
                self._json({"error": str(exc)}, code=500)

        elif path == "/admin/api/slides":
            try:
                self._json(_load_slides())
            except Exception as exc:
                self._json({"error": str(exc)}, code=500)

        elif path == "/admin/api/wifi/status":
            self._json(self._wifi_status())

        elif path == "/admin/api/wifi/scan":
            self._json(self._wifi_scan())

        elif path == "/admin/api/assets":
            self._json(self._list_assets())

        else:
            self.send_error(404)

    def do_POST(self):
        path = urlparse(self.path).path

        if not self._require_auth():
            return

        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length) if length else b""
        try:
            data = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            self._json({"error": "Invalid JSON"}, code=400)
            return

        if path == "/admin/api/config":
            try:
                _save_config(data)
                global _admin_config
                _admin_config = data
                self._json({"ok": True})
            except Exception as exc:
                self._json({"error": str(exc)}, code=500)

        elif path == "/admin/api/slides":
            try:
                _save_slides(data)
                self._json({"ok": True})
            except Exception as exc:
                self._json({"error": str(exc)}, code=500)

        elif path == "/admin/api/wifi/connect":
            ssid     = data.get("ssid", "").strip()
            password = data.get("password", "")
            if not ssid:
                self._json({"error": "ssid is required"}, code=400)
                return
            self._json(self._wifi_connect(ssid, password))

        elif path == "/admin/api/wifi/disconnect":
            self._json(self._wifi_disconnect())

        elif path == "/admin/api/assets/upload":
            filename  = data.get("filename", "")
            data_b64  = data.get("data", "")
            if not filename or not data_b64:
                self._json({"error": "filename and data are required"}, code=400)
                return
            self._json(self._save_asset(filename, data_b64))

        elif path == "/admin/api/system/restart":
            try:
                subprocess.run(
                    ["sudo", "systemctl", "restart", "livesignal"],
                    check=True, timeout=15,
                )
                self._json({"ok": True})
            except Exception as exc:
                self._json({"error": str(exc)}, code=500)

        elif path == "/admin/api/system/reboot":
            self._json({"ok": True})
            subprocess.Popen(["sudo", "shutdown", "-r", "now"])

        else:
            self.send_error(404)

    # ── WiFi ─────────────────────────────────────────────────────────────────

    def _wifi_status(self) -> dict:
        try:
            # Query device wifi to get the actual SSID, not the connection profile name
            r = subprocess.run(
                ["nmcli", "-t", "-f", "ACTIVE,SSID,DEVICE", "device", "wifi"],
                capture_output=True, text=True, timeout=10,
            )
            wifi = []
            for line in r.stdout.strip().splitlines():
                p = line.split(":")
                if len(p) >= 3 and p[0] == "yes" and p[1].strip():
                    wifi.append({"name": p[1], "device": p[2], "state": "connected"})
            return {"connected": bool(wifi), "connections": wifi, "ip": self._local_ip()}
        except FileNotFoundError:
            return {"connected": False, "error": "nmcli not found — is NetworkManager installed?"}
        except Exception as exc:
            return {"connected": False, "error": str(exc)}

    def _wifi_scan(self) -> list:
        try:
            subprocess.run(
                ["nmcli", "device", "wifi", "rescan"],
                capture_output=True, timeout=10,
            )
            r = subprocess.run(
                ["nmcli", "-t", "-f", "SSID,SIGNAL,SECURITY,IN-USE", "device", "wifi", "list"],
                capture_output=True, text=True, timeout=15,
            )
            seen = set()
            networks = []
            for line in r.stdout.strip().splitlines():
                p = line.split(":")
                if len(p) < 4:
                    continue
                ssid = p[0].strip()
                if not ssid or ssid in seen:
                    continue
                seen.add(ssid)
                networks.append({
                    "ssid":     ssid,
                    "signal":   int(p[1]) if p[1].isdigit() else 0,
                    "security": p[2] if p[2] else "Open",
                    "in_use":   p[3].strip() == "*",
                })
            networks.sort(key=lambda n: n["signal"], reverse=True)
            return networks
        except Exception as exc:
            logger.error("WiFi scan failed: %s", exc)
            return []

    def _wifi_connect(self, ssid: str, password: str) -> dict:
        try:
            cmd = ["nmcli", "device", "wifi", "connect", ssid]
            if password:
                cmd += ["password", password]
            r = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            if r.returncode == 0:
                return {"ok": True, "message": f"Connected to {ssid}"}
            msg = r.stderr.strip() or r.stdout.strip() or "Connection failed"
            return {"ok": False, "message": msg}
        except subprocess.TimeoutExpired:
            return {"ok": False, "message": "Connection timed out after 30 s"}
        except Exception as exc:
            return {"ok": False, "message": str(exc)}

    def _wifi_disconnect(self) -> dict:
        try:
            r = subprocess.run(
                ["nmcli", "device", "disconnect", "wlan0"],
                capture_output=True, text=True, timeout=10,
            )
            return {"ok": r.returncode == 0}
        except Exception as exc:
            return {"ok": False, "message": str(exc)}

    # ── Assets ────────────────────────────────────────────────────────────────

    def _list_assets(self) -> list:
        assets_dir = _safe_path("assets")
        if not assets_dir or not os.path.isdir(assets_dir):
            return []
        exts = {".jpg", ".jpeg", ".png", ".svg", ".webp", ".gif"}
        return sorted(
            f"assets/{f}"
            for f in os.listdir(assets_dir)
            if os.path.splitext(f)[1].lower() in exts
        )

    def _save_asset(self, filename: str, data_b64: str) -> dict:
        import re
        # Strip optional data-URI prefix
        data_b64 = re.sub(r"^data:[^;]+;base64,", "", data_b64)
        # Sanitise filename — no path traversal
        safe_name = os.path.basename(filename)
        if not safe_name:
            return {"error": "Invalid filename"}
        assets_dir = _safe_path("assets")
        if not assets_dir:
            return {"error": "Cannot resolve assets directory"}
        os.makedirs(assets_dir, exist_ok=True)
        dest = os.path.join(assets_dir, safe_name)
        with open(dest, "wb") as fh:
            fh.write(base64.b64decode(data_b64))
        return {"ok": True, "path": f"assets/{safe_name}"}

    # ── System ────────────────────────────────────────────────────────────────

    def _service_status(self) -> str:
        try:
            r = subprocess.run(
                ["systemctl", "is-active", "livesignal"],
                capture_output=True, text=True, timeout=5,
            )
            return r.stdout.strip()
        except Exception:
            return "unknown"

    def _local_ip(self) -> str:
        try:
            r = subprocess.run(["hostname", "-I"], capture_output=True, text=True, timeout=5)
            return r.stdout.strip().split()[0]
        except Exception:
            return "unknown"

    # ── HTTP helpers ──────────────────────────────────────────────────────────

    def _json(self, data, code: int = 200):
        body = json.dumps(data).encode()
        self.send_response(code)
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
            self.send_response(200)
            self.send_header("Content-Type", mime or "application/octet-stream")
            self.send_header("Content-Length", str(len(content)))
            self.end_headers()
            self.wfile.write(content)
        except FileNotFoundError:
            self.send_error(404)

    def log_message(self, fmt, *args):
        pass


# ── Server entry point ────────────────────────────────────────────────────────

def run(config: dict):
    global _admin_config
    _admin_config = config

    port = config.get("admin", {}).get("port", 8081)
    httpd = HTTPServer(("0.0.0.0", port), AdminHandler)
    logger.info("Admin UI listening on http://0.0.0.0:%d/admin", port)
    httpd.serve_forever()
