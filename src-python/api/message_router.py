#!/usr/bin/env python3

import logging
from fastapi import WebSocket
from typing import Union

from models.schemas import (
    ChatWebSocketMessage,
    TTSWebSocketMessage,
    StopWebSocketMessage,
    ModeChangeWebSocketMessage,
    PingWebSocketMessage,
)
from .message_handlers import (
    ChatMessageHandler,
    TTSMessageHandler,
    StopMessageHandler,
    ModeChangeMessageHandler,
    PingMessageHandler,
)

logger = logging.getLogger(__name__)


class MessageRouter:
    """Routes WebSocket messages to appropriate handlers"""

    def __init__(self):
        self._handlers = {
            "chat": ChatMessageHandler.handle,
            "tts": TTSMessageHandler.handle,
            "stop": StopMessageHandler.handle,
            "mode_change": ModeChangeMessageHandler.handle,
            "ping": PingMessageHandler.handle,
        }

    async def route_message(
        self,
        websocket: WebSocket,
        message: Union[
            ChatWebSocketMessage,
            TTSWebSocketMessage,
            StopWebSocketMessage,
            ModeChangeWebSocketMessage,
            PingWebSocketMessage,
        ],
        session_id: str,
    ):
        """Route message to appropriate handler"""
        message_type = message.type
        handler = self._handlers.get(message_type)

        if not handler:
            logger.error(f"No handler found for message type: {message_type}")
            return

        try:
            if message_type in ["chat", "stop", "mode_change"]:
                await handler(websocket, message, session_id)
            else:
                await handler(websocket, message)
        except Exception as e:
            logger.error(f"Handler error for {message_type}: {e}")
            raise
