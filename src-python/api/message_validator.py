#!/usr/bin/env python3

import logging
from typing import Union
from pydantic import ValidationError

from models.schemas import (
    ChatWebSocketMessage,
    TTSWebSocketMessage,
    StopWebSocketMessage,
    ModeChangeWebSocketMessage,
    PingWebSocketMessage,
)

logger = logging.getLogger(__name__)


class MessageValidator:
    """Handles validation of WebSocket messages"""

    @staticmethod
    def validate_message(
        message_data: dict,
    ) -> Union[
        ChatWebSocketMessage,
        TTSWebSocketMessage,
        StopWebSocketMessage,
        ModeChangeWebSocketMessage,
        PingWebSocketMessage,
    ]:
        """Validate and parse WebSocket message according to type"""
        msg_type = message_data.get("type")

        if msg_type == "chat":
            return ChatWebSocketMessage(**message_data)
        elif msg_type == "tts":
            return TTSWebSocketMessage(**message_data)
        elif msg_type == "stop":
            return StopWebSocketMessage(**message_data)
        elif msg_type == "mode_change":
            return ModeChangeWebSocketMessage(**message_data)
        elif msg_type == "ping":
            return PingWebSocketMessage(**message_data)
        else:
            raise ValueError(f"Unknown message type: {msg_type}")
