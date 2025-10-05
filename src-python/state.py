#!/usr/bin/env python3

import asyncio
import threading
from typing import Any, Dict, List, Optional


class AppState:
    """Global application state management"""

    def __init__(self):
        # Model instances
        self.whisper_model: Optional[Any] = None
        self.tts_engine: Optional[Any] = None
        self.tts_engine_type: Optional[str] = None

        # Conversation management
        self.conversation_history: Dict[str, List[Dict[str, str]]] = {}
        self.current_mode: Dict[str, str] = {}

        # Audio playback management
        self.current_playback_process: Optional[Any] = None
        self.current_playback_task: Optional[asyncio.Task] = None
        self.playback_lock = threading.Lock()

        # Process management
        self.pid_file: Optional[str] = None


app_state = AppState()
