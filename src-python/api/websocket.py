#!/usr/bin/env python3

import json
import logging
import time
from fastapi import WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from services.tts_service import tts_service
from state import app_state
from .message_validator import MessageValidator
from .message_router import MessageRouter

logger = logging.getLogger(__name__)


class WebSocketManager:
    """Manages WebSocket connections and message handling"""

    def __init__(self):
        self.message_router = MessageRouter()

    async def handle_websocket_connection(self, websocket: WebSocket):
        """Handle a WebSocket connection"""
        await websocket.accept()
        session_id = f"ws_{int(time.time())}_{id(websocket)}"
        logger.info(f"WebSocket connected: {session_id}")
        app_state.current_mode[session_id] = "none"

        try:
            while True:
                try:
                    data = await websocket.receive_text()
                    message_data = json.loads(data)
                    logger.debug(f"Received WebSocket message: {message_data}")
                except json.JSONDecodeError:
                    await self._send_error(websocket, "Invalid JSON format")
                    continue
                except Exception as e:
                    # Check if it's a WebSocket close code (expected disconnection)
                    if str(e) in ["1006", "1000", "1001", "1005"]:
                        logger.debug(f"WebSocket closed with code: {e}")
                    else:
                        logger.error(f"Error receiving WebSocket message: {e}")
                    break

                try:
                    validated_message = MessageValidator.validate_message(message_data)
                    await self.message_router.route_message(
                        websocket, validated_message, session_id
                    )
                except (ValidationError, ValueError) as e:
                    await self._send_error(
                        websocket, f"Invalid message format: {str(e)}"
                    )
                    continue
                except Exception as e:
                    logger.error(f"Error processing WebSocket message: {e}")
                    await self._send_error(websocket, f"Processing error: {str(e)}")

        except WebSocketDisconnect as e:
            logger.info(
                f"WebSocket disconnected: {session_id} (code: {e.code}, reason: {e.reason})"
            )
        except Exception as e:
            logger.error(f"WebSocket error for session {session_id}: {e}")
            try:
                await self._send_error(websocket, f"WebSocket error: {str(e)}")
            except Exception:
                pass
        finally:
            await self._cleanup_session(session_id)

    @staticmethod
    async def _send_error(websocket: WebSocket, error_message: str):
        """Send error message to client"""
        try:
            await websocket.send_text(
                json.dumps({"type": "error", "message": error_message})
            )
        except Exception as e:
            logger.error(f"Failed to send error message: {e}")

    @staticmethod
    async def _cleanup_session(session_id: str):
        """Clean up session data"""
        await tts_service.stop_playback()
        if session_id in app_state.conversation_history:
            del app_state.conversation_history[session_id]
        if session_id in app_state.current_mode:
            del app_state.current_mode[session_id]
        logger.info(f"Cleaned up session: {session_id}")


websocket_manager = WebSocketManager()
