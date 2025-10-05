#!/usr/bin/env python3

import pytest
import asyncio
import json
import time
from unittest.mock import Mock, AsyncMock, patch, MagicMock
from fastapi import WebSocketDisconnect

from api.websocket import WebSocketManager, websocket_manager
from api.message_validator import MessageValidator
from api.message_router import MessageRouter
from models.schemas import ChatMessage, TTSRequest


class TestWebSocketManager:
    """Test cases for WebSocketManager."""

    @pytest.mark.asyncio
    async def test_handle_websocket_connection_success(self, mock_websocket):
        """Test successful WebSocket connection handling."""
        mock_websocket.receive_text.side_effect = [
            json.dumps({"type": "ping", "timestamp": 123456}),
            WebSocketDisconnect(code=1000, reason="Normal closure"),
        ]

        with (
            patch("api.websocket.MessageValidator.validate_message") as mock_validate,
            patch(
                "api.websocket.MessageRouter.route_message", new_callable=AsyncMock
            ) as mock_route,
            patch(
                "api.websocket.WebSocketManager._cleanup_session",
                new_callable=AsyncMock,
            ) as mock_cleanup,
            patch("api.websocket.app_state") as mock_state,
            patch("time.time", return_value=1234567890),
        ):
            mock_state.current_mode = {}
            mock_validate.return_value = Mock(type="ping")

            manager = WebSocketManager()
            await manager.handle_websocket_connection(mock_websocket)

            mock_websocket.accept.assert_called_once()
            mock_validate.assert_called_once()
            mock_route.assert_called_once()
            mock_cleanup.assert_called_once()

            # Verify session was initialized
            session_id = f"ws_1234567890_{id(mock_websocket)}"
            assert mock_state.current_mode[session_id] == "none"

    @pytest.mark.asyncio
    async def test_handle_websocket_connection_json_decode_error(self, mock_websocket):
        """Test WebSocket connection with JSON decode error."""
        mock_websocket.receive_text.side_effect = [
            "invalid json",
            WebSocketDisconnect(code=1000, reason="Normal closure"),
        ]

        with (
            patch(
                "api.websocket.WebSocketManager._cleanup_session",
                new_callable=AsyncMock,
            ),
            patch("api.websocket.app_state") as mock_state,
        ):
            mock_state.current_mode = {}

            manager = WebSocketManager()
            await manager.handle_websocket_connection(mock_websocket)

            # Verify error message was sent
            mock_websocket.send_text.assert_called()
            sent_message = json.loads(mock_websocket.send_text.call_args[0][0])
            assert sent_message["type"] == "error"
            assert "Invalid JSON format" in sent_message["message"]

    @pytest.mark.asyncio
    async def test_handle_websocket_connection_receive_error(self, mock_websocket):
        """Test WebSocket connection with receive error."""
        mock_websocket.receive_text.side_effect = Exception("Connection error")

        with (
            patch(
                "api.websocket.WebSocketManager._cleanup_session",
                new_callable=AsyncMock,
            ),
            patch("api.websocket.app_state") as mock_state,
        ):
            mock_state.current_mode = {}

            manager = WebSocketManager()
            await manager.handle_websocket_connection(mock_websocket)

    @pytest.mark.asyncio
    async def test_handle_websocket_connection_general_error(self, mock_websocket):
        """Test WebSocket connection with general error."""
        mock_websocket.receive_text.side_effect = Exception("General error")

        with (
            patch(
                "api.websocket.WebSocketManager._cleanup_session",
                new_callable=AsyncMock,
            ),
            patch("api.websocket.app_state") as mock_state,
        ):
            mock_state.current_mode = {}

            manager = WebSocketManager()
            await manager.handle_websocket_connection(mock_websocket)

            # Should not try to send error message for receive_text failures
            # (inner exception handler only logs and breaks)
            mock_websocket.send_text.assert_not_called()

    @pytest.mark.asyncio
    async def test_message_validation_error(self, mock_websocket):
        """Test WebSocket connection with validation error."""
        mock_websocket.receive_text.side_effect = [
            json.dumps({"type": "invalid_type"}),
            WebSocketDisconnect(code=1000, reason="Normal closure"),
        ]

        with (
            patch("api.websocket.MessageValidator.validate_message") as mock_validate,
            patch(
                "api.websocket.WebSocketManager._cleanup_session",
                new_callable=AsyncMock,
            ),
            patch("api.websocket.app_state") as mock_state,
        ):
            mock_state.current_mode = {}
            from pydantic import ValidationError

            mock_validate.side_effect = ValueError("Unknown message type: invalid_type")

            manager = WebSocketManager()
            await manager.handle_websocket_connection(mock_websocket)

            # Verify error message was sent
            mock_websocket.send_text.assert_called()
            sent_message = json.loads(mock_websocket.send_text.call_args[0][0])
            assert sent_message["type"] == "error"
            assert "Invalid message format" in sent_message["message"]

    @pytest.mark.asyncio
    async def test_cleanup_session(self):
        """Test session cleanup."""
        session_id = "test_session"

        with (
            patch(
                "services.tts_service.tts_service.stop_playback", new_callable=AsyncMock
            ) as mock_stop,
            patch("api.websocket.app_state") as mock_state,
        ):
            mock_state.conversation_history = {
                session_id: [{"role": "user", "content": "test"}]
            }
            mock_state.current_mode = {session_id: "voice"}

            await WebSocketManager._cleanup_session(session_id)

            # Should stop playback
            mock_stop.assert_called_once()

            # Should clean up session data
            assert session_id not in mock_state.conversation_history
            assert session_id not in mock_state.current_mode

    @pytest.mark.asyncio
    async def test_cleanup_session_missing_data(self):
        """Test session cleanup when session data doesn't exist."""
        session_id = "nonexistent_session"

        with (
            patch(
                "services.tts_service.tts_service.stop_playback", new_callable=AsyncMock
            ) as mock_stop,
            patch("api.websocket.app_state") as mock_state,
        ):
            mock_state.conversation_history = {}
            mock_state.current_mode = {}

            # Should not raise exception
            await WebSocketManager._cleanup_session(session_id)

            mock_stop.assert_called_once()


class TestWebSocketManagerGlobal:
    """Test cases for the global websocket_manager instance."""

    def test_global_instance_exists(self):
        """Test that global websocket_manager instance exists."""
        assert websocket_manager is not None
        assert isinstance(websocket_manager, WebSocketManager)


class TestWebSocketManagerEdgeCases:
    """Test edge cases and error conditions."""

    @pytest.mark.asyncio
    async def test_websocket_connection_with_closed_connection_error(
        self, mock_websocket
    ):
        """Test WebSocket connection when sending error message fails."""
        mock_websocket.receive_text.side_effect = Exception("General error")
        mock_websocket.send_text.side_effect = Exception("Connection closed")

        with (
            patch(
                "api.websocket.WebSocketManager._cleanup_session",
                new_callable=AsyncMock,
            ),
            patch("api.websocket.app_state") as mock_state,
        ):
            mock_state.current_mode = {}

            # Should not raise exception despite send error
            manager = WebSocketManager()
            await manager.handle_websocket_connection(mock_websocket)

    @pytest.mark.asyncio
    async def test_router_error_handling(self, mock_websocket):
        """Test error handling in message router."""
        mock_websocket.receive_text.side_effect = [
            json.dumps({"type": "chat", "text": "Hello"}),
            WebSocketDisconnect(code=1000, reason="Normal closure"),
        ]

        with (
            patch("api.websocket.MessageValidator.validate_message") as mock_validate,
            patch(
                "api.websocket.MessageRouter.route_message", new_callable=AsyncMock
            ) as mock_route,
            patch(
                "api.websocket.WebSocketManager._cleanup_session",
                new_callable=AsyncMock,
            ),
            patch("api.websocket.app_state") as mock_state,
        ):
            mock_state.current_mode = {}
            mock_validate.return_value = Mock(type="chat")
            mock_route.side_effect = Exception("Router error")

            manager = WebSocketManager()
            await manager.handle_websocket_connection(mock_websocket)

            # Should send error message
            mock_websocket.send_text.assert_called()
            sent_message = json.loads(mock_websocket.send_text.call_args[0][0])
            assert sent_message["type"] == "error"
            assert "Processing error" in sent_message["message"]
