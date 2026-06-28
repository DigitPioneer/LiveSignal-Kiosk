#!/usr/bin/env python3
"""
LiveSignal Kiosk — entry point.

Run from the project root:
    python3 main.py

The script loads config.yaml and slides.yaml, then starts:
  - An HTTP server (serves the kiosk web page + API)
  - A YouTube watcher loop (updates shared state when stream starts/ends)
"""
import logging
import sys
import threading

try:
    import yaml
except ImportError:
    sys.exit(
        "PyYAML is required. Install it with:\n"
        "  sudo apt-get install python3-yaml\n"
        "  # or: pip3 install pyyaml"
    )

from kiosk import admin, network, server, state, watcher

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("livesignal")


def load_yaml(path: str):
    try:
        with open(path, "r", encoding="utf-8") as fh:
            return yaml.safe_load(fh) or {}
    except FileNotFoundError:
        logger.error("File not found: %s", path)
        sys.exit(1)
    except yaml.YAMLError as exc:
        logger.error("YAML parse error in %s: %s", path, exc)
        sys.exit(1)


def main():
    config = load_yaml("config.yaml")
    slides_doc = load_yaml("slides.yaml")
    slides = slides_doc.get("slides", []) if isinstance(slides_doc, dict) else []

    # Kiosk HTTP server (localhost only — Chromium uses this)
    threading.Thread(
        target=server.run, args=(config, slides), daemon=True, name="kiosk-server"
    ).start()

    # Admin HTTP server (all interfaces — accessible from the local network)
    threading.Thread(
        target=admin.run, args=(config,), daemon=True, name="admin-server"
    ).start()

    # ── Network check: start setup hotspot if no WiFi ─────────────────────────
    # Give the system a moment to finish bringing up any existing connection
    if not network.wait_for_connection(timeout=15):
        setup_cfg = config.get("setup", {})
        hotspot_ssid = setup_cfg.get("hotspot_ssid", "LiveSignal-Setup")
        hotspot_pass = setup_cfg.get("hotspot_password", "livesignal")

        logger.info("No network — starting setup hotspot '%s'", hotspot_ssid)
        hotspot_ip = network.start_hotspot(hotspot_ssid, hotspot_pass)

        if hotspot_ip:
            state.set_setup(hotspot_ssid, hotspot_pass, hotspot_ip)
            logger.info(
                "Setup mode active. Connect to '%s' then open http://%s:8081/admin",
                hotspot_ssid, hotspot_ip,
            )
        else:
            logger.warning("Hotspot failed — continuing without setup mode")
    else:
        logger.info("Network connected — starting in normal mode")

    # YouTube watcher runs on the main thread (blocks until process is killed)
    try:
        watcher.run(config)
    except KeyboardInterrupt:
        logger.info("Shutting down.")


if __name__ == "__main__":
    main()
