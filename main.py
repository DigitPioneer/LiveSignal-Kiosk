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

from kiosk import server, watcher

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

    # HTTP server runs in a daemon thread so it shuts down when main exits
    server_thread = threading.Thread(
        target=server.run,
        args=(config, slides),
        daemon=True,
        name="http-server",
    )
    server_thread.start()

    # Watcher runs on the main thread (blocks until process is killed)
    try:
        watcher.run(config)
    except KeyboardInterrupt:
        logger.info("Shutting down.")


if __name__ == "__main__":
    main()
