#!/usr/bin/env python3

import asyncio
import json
import logging
import sys
from fastapi import WebSocket
from typing import Union

from models.schemas import (
    ChatMessage,
    TTSRequest,
    ChatWebSocketMessage,
    TTSWebSocketMessage,
    StopWebSocketMessage,
    ModeChangeWebSocketMessage,
    PingWebSocketMessage,
)
from services.ollama_service import ollama_service
from services.tts_service import tts_service
from state import app_state

logger = logging.getLogger(__name__)


class BaseMessageHandler:
    """Base class for message handlers"""

    @staticmethod
    async def send_error(websocket: WebSocket, error_message: str):
        """Send error message to client"""
        try:
            await websocket.send_text(
                json.dumps({"type": "error", "message": error_message})
            )
        except Exception as e:
            logger.error(f"Failed to send error message: {e}")


class ChatMessageHandler(BaseMessageHandler):
    """Handles chat messages"""

    @staticmethod
    async def handle(
        websocket: WebSocket, message: ChatWebSocketMessage, session_id: str
    ):
        """Handle chat message"""
        chat_message = ChatMessage(text=message.text, session_id=session_id)

        try:
            result = await ollama_service.chat_completion(chat_message)
            await websocket.send_text(
                json.dumps({"type": "chat_response", "response": result["response"]})
            )
        except Exception as e:
            logger.error(f"Chat error: {e}")
            await ChatMessageHandler.send_error(websocket, str(e))


class TTSMessageHandler(BaseMessageHandler):
    """Handles TTS messages"""

    @staticmethod
    async def handle(websocket: WebSocket, message: TTSWebSocketMessage):
        """Handle TTS message"""
        try:
            tts_request = TTSRequest(
                text=message.text, voice=message.voice, speed=message.speed
            )

            if tts_service.engine_type == "kokoro":
                task = asyncio.create_task(tts_service.kokoro_tts(tts_request, websocket))
                # Fire-and-forget: Add task done callback to handle exceptions
                task.add_done_callback(lambda t: None if t.exception() is None else logger.error(f"TTS task failed: {t.exception()}"))
            else:
                await TTSMessageHandler.send_error(websocket, "No TTS engine available")
        except Exception as e:
            logger.error(f"TTS error: {e}")
            await TTSMessageHandler.send_error(websocket, f"TTS error: {str(e)}")


class StopMessageHandler(BaseMessageHandler):
    """Handles stop playback messages"""

    @staticmethod
    def _immediate_stop():
        """Perform immediate synchronous stop operations"""
        if app_state.current_playback_process:
            try:
                if sys.platform in ["darwin", "linux"] and hasattr(
                    app_state.current_playback_process, "kill"
                ):
                    app_state.current_playback_process.kill()
                elif (
                    sys.platform == "win32"
                    and app_state.current_playback_process == "pygame_active"
                ):
                    import pygame

                    pygame.mixer.music.stop()
                    pygame.mixer.quit()
            except Exception as e:
                logger.error(f"Error stopping playback process: {e}")

        if app_state.current_playback_task:
            app_state.current_playback_task.cancel()

        app_state.current_playback_process = None
        app_state.current_playback_task = None

    @staticmethod
    async def handle(
        websocket: WebSocket, message: StopWebSocketMessage, session_id: str
    ):
        """Handle stop message"""
        StopMessageHandler._immediate_stop()

        try:
            await tts_service.stop_playback()
            app_state.current_mode[session_id] = "none"
            await websocket.send_text(
                json.dumps({"type": "stop", "message": "Playback stopped"})
            )
            logger.info(f"Stop request processed for session: {session_id}")
        except Exception as e:
            logger.error(f"Stop error: {e}")
            await StopMessageHandler.send_error(websocket, f"Stop error: {str(e)}")


class ModeChangeMessageHandler(BaseMessageHandler):
    """Handles mode change messages"""

    @staticmethod
    async def handle(
        websocket: WebSocket, message: ModeChangeWebSocketMessage, session_id: str
    ):
        """Handle mode change message"""
        try:
            mode = message.mode
            app_state.current_mode[session_id] = mode
            logger.info(f"Mode changed to {mode} for session: {session_id}")
            await websocket.send_text(
                json.dumps({"type": "mode_change", "message": f"Mode set to {mode}"})
            )
        except Exception as e:
            logger.error(f"Mode change error: {e}")
            await ModeChangeMessageHandler.send_error(
                websocket, f"Mode change error: {str(e)}"
            )


class PingMessageHandler(BaseMessageHandler):
    """Handles ping messages"""

    @staticmethod
    async def handle(websocket: WebSocket, message: PingWebSocketMessage):
        """Handle ping message"""
        await websocket.send_text(
            json.dumps({"type": "pong", "timestamp": message.timestamp})
        )
