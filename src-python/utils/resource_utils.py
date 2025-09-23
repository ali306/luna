#!/usr/bin/env python3

import os
import sys
from pathlib import Path


def get_resource_path(relative_path: str) -> str:
    """Get the absolute path to a resource file, works in both dev and bundled environments"""
    if getattr(sys, "frozen", False):
        # Running in a bundle (PyInstaller)
        base_path = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
    else:
        # Running in development
        # Navigate up from utils directory to src directory
        base_path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    return os.path.join(base_path, relative_path)


def setup_bundled_paths():
    """Configure environment paths for bundled deployment"""
    # Set spaCy model path
    spacy_model_path = get_resource_path("en_core_web_sm")
    if os.path.exists(spacy_model_path):
        os.environ["SPACY_MODEL_PATH"] = spacy_model_path

    # Find espeak data path
    bundled_paths = [
        get_resource_path("espeakng_loader/espeak-ng-data"),
        get_resource_path("espeak-ng-data"),
        get_resource_path("espeak-data"),
    ]

    system_paths = [
        "/usr/share/espeak-ng-data",
        "/usr/local/share/espeak-ng-data",
        "/opt/homebrew/share/espeak-ng-data",
    ]

    for path in bundled_paths + system_paths:
        if os.path.exists(path):
            os.environ["ESPEAK_DATA_PATH"] = path
            break


def get_frontend_html() -> str:
    """Get the frontend HTML content"""
    try:
        # Use pathlib for better path handling
        html_path = Path(get_resource_path("index.html"))
        if html_path.exists():
            return html_path.read_text(encoding="utf-8")
        else:
            raise FileNotFoundError("index.html not found")
    except FileNotFoundError:
        # Fallback HTML content
        html_content = """
<!DOCTYPE html>
<html>
<head>
    <title>Voice Assistant</title>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body>
    <h1>Voice Assistant Backend Running</h1>
    <p>The backend is running successfully!</p>
    <p>Please place your index.html file in the same directory as main.py</p>
    <ul>
        <li>API Health: <a href="/api/health">/api/health</a></li>
        <li>WebSocket endpoint: ws://localhost:40000/ws</li>
    </ul>
</body>
</html>
        """
        return html_content
