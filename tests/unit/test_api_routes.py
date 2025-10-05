#!/usr/bin/env python3

import pytest
from unittest.mock import Mock, AsyncMock, patch
from fastapi.testclient import TestClient
from fastapi import HTTPException

from api.routes import router
from models.schemas import ChatMessage, TTSRequest
from exceptions import OllamaConnectionError, AudioValidationError


class TestAPIRoutes:
    """Test cases for API routes."""

    def setup_method(self):
        """Set up test client."""
        from fastapi import FastAPI

        app = FastAPI()
        app.include_router(router)
        self.client = TestClient(app)

    def test_favicon_endpoint(self):
        """Test favicon endpoint returns 204."""
        response = self.client.get("/favicon.ico")
        assert response.status_code == 204

    def test_get_frontend_success(self):
        """Test frontend HTML endpoint."""
        with patch("api.routes.get_frontend_html") as mock_get_html:
            mock_get_html.return_value = "<html><body>Test Frontend</body></html>"

            response = self.client.get("/")

            assert response.status_code == 200
            assert response.headers["content-type"].startswith("text/html")
            assert "Test Frontend" in response.text
            mock_get_html.assert_called_once()

    def test_transcribe_audio_success(self, mock_upload_file):
        """Test successful audio transcription."""
        with patch(
            "services.whisper_service.whisper_service.transcribe_audio_file",
            new_callable=AsyncMock,
        ) as mock_transcribe:
            mock_transcribe.return_value = "Hello world"

            # Create test file
            test_file = ("test.wav", b"fake_audio_data", "audio/wav")

            response = self.client.post(
                "/api/transcribe", files={"audio_file": test_file}
            )

            assert response.status_code == 200
            data = response.json()
            assert data["transcription"] == "Hello world"
            mock_transcribe.assert_called_once()

    def test_transcribe_audio_no_file(self):
        """Test transcription without file."""
        response = self.client.post("/api/transcribe")

        assert response.status_code == 422  # Validation error

    def test_transcribe_audio_service_error(self):
        """Test transcription when service fails."""
        with patch(
            "services.whisper_service.whisper_service.transcribe_audio_file",
            new_callable=AsyncMock,
        ) as mock_transcribe:
            mock_transcribe.side_effect = HTTPException(
                status_code=500, detail="Transcription failed"
            )

            test_file = ("test.wav", b"fake_audio_data", "audio/wav")

            response = self.client.post(
                "/api/transcribe", files={"audio_file": test_file}
            )

            assert response.status_code == 500
            assert "Transcription failed" in response.json()["detail"]

    def test_chat_completion_success(self):
        """Test successful chat completion."""
        with patch(
            "services.ollama_service.ollama_service.chat_completion",
            new_callable=AsyncMock,
        ) as mock_chat:
            mock_chat.return_value = {"response": "Hello! How can I help you?"}

            message_data = {"text": "Hello", "session_id": "test_session"}

            response = self.client.post("/api/chat", json=message_data)

            assert response.status_code == 200
            data = response.json()
            assert data["response"] == "Hello! How can I help you?"

            # Verify service was called with correct message
            mock_chat.assert_called_once()
            call_args = mock_chat.call_args[0][0]
            assert isinstance(call_args, ChatMessage)
            assert call_args.text == "Hello"
            assert call_args.session_id == "test_session"

    def test_chat_completion_missing_text(self):
        """Test chat completion without text."""
        response = self.client.post("/api/chat", json={})

        assert response.status_code == 422  # Validation error

    def test_chat_completion_service_error(self):
        """Test chat completion when service fails."""
        with patch(
            "services.ollama_service.ollama_service.chat_completion",
            new_callable=AsyncMock,
        ) as mock_chat:
            mock_chat.side_effect = OllamaConnectionError("Ollama service unavailable")

            message_data = {"text": "Hello", "session_id": "test_session"}

            response = self.client.post("/api/chat", json=message_data)

            assert response.status_code == 503
            data = response.json()
            assert "Ollama service unavailable" in data["detail"]

    def test_health_check_success(self):
        """Test successful health check."""
        with (
            patch(
                "services.ollama_service.ollama_service.check_health",
                new_callable=AsyncMock,
            ) as mock_ollama_health,
            patch(
                "services.whisper_service.whisper_service.get_model_info"
            ) as mock_whisper_info,
            patch("services.tts_service.tts_service.get_engine_info") as mock_tts_info,
        ):
            mock_ollama_health.return_value = "healthy"
            mock_whisper_info.return_value = {"status": "loaded"}
            mock_tts_info.return_value = {"engine_type": "kokoro", "status": "loaded"}

            response = self.client.get("/api/health")

            assert response.status_code == 200
            data = response.json()

            assert data["status"] == "healthy"
            assert data["whisper_model"] == "base"
            assert data["whisper_status"] == "loaded"
            assert data["ollama_status"] == "healthy"
            assert data["ollama_model"] == "llama3.2"
            assert data["tts_engine"] == "kokoro"
            assert data["tts_status"] == "loaded"

    def test_health_check_unhealthy_services(self):
        """Test health check with unhealthy services."""
        with (
            patch(
                "services.ollama_service.ollama_service.check_health",
                new_callable=AsyncMock,
            ) as mock_ollama_health,
            patch(
                "services.whisper_service.whisper_service.get_model_info"
            ) as mock_whisper_info,
            patch("services.tts_service.tts_service.get_engine_info") as mock_tts_info,
        ):
            mock_ollama_health.return_value = "unhealthy"
            mock_whisper_info.return_value = {"status": "not loaded"}
            mock_tts_info.return_value = {"engine_type": "none", "status": "not loaded"}

            response = self.client.get("/api/health")

            assert response.status_code == 200
            data = response.json()

            assert data["status"] == "healthy"  # Overall status is still healthy
            assert data["ollama_status"] == "unhealthy"
            assert data["whisper_status"] == "not loaded"
            assert data["tts_engine"] == "none"
            assert data["tts_status"] == "not loaded"

    def test_clear_conversation_success(self):
        """Test successful conversation clearing."""
        with patch(
            "services.ollama_service.ollama_service.clear_conversation"
        ) as mock_clear:
            mock_clear.return_value = {
                "status": "success",
                "message": "Conversation history cleared",
            }

            response = self.client.delete("/api/conversation/test_session")

            assert response.status_code == 200
            data = response.json()

            assert data["status"] == "success"
            assert data["message"] == "Conversation history cleared"
            mock_clear.assert_called_once_with("test_session")

    def test_clear_conversation_not_found(self):
        """Test clearing conversation when session not found."""
        with patch(
            "services.ollama_service.ollama_service.clear_conversation"
        ) as mock_clear:
            mock_clear.return_value = {
                "status": "info",
                "message": "No conversation history found",
            }

            response = self.client.delete("/api/conversation/nonexistent_session")

            assert response.status_code == 200
            data = response.json()

            assert data["status"] == "info"
            assert data["message"] == "No conversation history found"

    def test_chat_completion_minimal_data(self):
        """Test chat completion with minimal valid data."""
        with patch(
            "services.ollama_service.ollama_service.chat_completion",
            new_callable=AsyncMock,
        ) as mock_chat:
            mock_chat.return_value = {"response": "Response"}

            # Only provide required text field
            message_data = {"text": "Hello"}

            response = self.client.post("/api/chat", json=message_data)

            assert response.status_code == 200

            # Verify session_id defaults to 'default'
            call_args = mock_chat.call_args[0][0]
            assert call_args.session_id == "default"

    def test_transcribe_audio_invalid_file_type(self):
        """Test transcription with invalid file type."""
        with patch(
            "services.whisper_service.whisper_service.transcribe_audio_file",
            new_callable=AsyncMock,
        ) as mock_transcribe:
            mock_transcribe.side_effect = AudioValidationError(
                "Unsupported file extension"
            )

            # Send text file instead of audio
            test_file = ("test.txt", b"Hello world", "text/plain")

            response = self.client.post(
                "/api/transcribe", files={"audio_file": test_file}
            )

            assert response.status_code == 400
            assert "Unsupported file extension" in response.json()["detail"]

    def test_health_check_service_exceptions(self):
        """Test health check when services throw exceptions."""
        with (
            patch(
                "services.ollama_service.ollama_service.check_health",
                new_callable=AsyncMock,
            ) as mock_ollama_health,
            patch(
                "services.whisper_service.whisper_service.get_model_info"
            ) as mock_whisper_info,
            patch("services.tts_service.tts_service.get_engine_info") as mock_tts_info,
        ):
            # Services can throw exceptions and health check should handle them gracefully
            mock_ollama_health.side_effect = Exception("Ollama error")
            mock_whisper_info.side_effect = Exception("Whisper error")
            mock_tts_info.side_effect = Exception("TTS error")

            # Health check should now handle exceptions and return HTTP 500
            response = self.client.get("/api/health")

            assert response.status_code == 500
            assert "Health check failed" in response.json()["detail"]

    def test_api_endpoints_cors_headers(self):
        """Test that API endpoints can handle CORS if middleware is present."""
        # This test verifies that endpoints don't break with CORS
        response = self.client.options("/api/health")
        # Options request should be handled by middleware, not reach our endpoint
        assert response.status_code in [200, 404, 405]  # Various possible responses

    def test_chat_completion_large_message(self):
        """Test chat completion with large message."""
        with patch(
            "services.ollama_service.ollama_service.chat_completion",
            new_callable=AsyncMock,
        ) as mock_chat:
            mock_chat.return_value = {"response": "Handled large message"}

            # Create a large message
            large_text = "Hello " * 1000
            message_data = {"text": large_text, "session_id": "test_session"}

            response = self.client.post("/api/chat", json=message_data)

            assert response.status_code == 200
            data = response.json()
            assert data["response"] == "Handled large message"

    def test_transcribe_audio_large_file(self):
        """Test transcription with large audio file."""
        with patch(
            "services.whisper_service.whisper_service.transcribe_audio_file",
            new_callable=AsyncMock,
        ) as mock_transcribe:
            mock_transcribe.return_value = "Large file transcribed"

            # Create large fake audio data
            large_audio_data = b"fake_audio" * 10000
            test_file = ("large_test.wav", large_audio_data, "audio/wav")

            response = self.client.post(
                "/api/transcribe", files={"audio_file": test_file}
            )

            assert response.status_code == 200
            data = response.json()
            assert data["transcription"] == "Large file transcribed"


class TestAPIRoutesIntegration:
    """Integration tests for API routes with actual FastAPI app."""

    def test_route_registration(self):
        """Test that all expected routes are registered."""
        from fastapi import FastAPI

        app = FastAPI()
        app.include_router(router)

        # Check that routes exist
        route_paths = [route.path for route in app.routes]

        expected_paths = [
            "/favicon.ico",
            "/",
            "/api/transcribe",
            "/api/chat",
            "/api/health",
            "/api/conversation/{session_id}",
        ]

        for path in expected_paths:
            assert any(path in route_path for route_path in route_paths), (
                f"Route {path} not found"
            )

    def test_route_methods(self):
        """Test that routes have correct HTTP methods."""
        from fastapi import FastAPI

        app = FastAPI()
        app.include_router(router)

        method_mappings = {
            "/favicon.ico": ["GET"],
            "/": ["GET"],
            "/api/transcribe": ["POST"],
            "/api/chat": ["POST"],
            "/api/health": ["GET"],
            "/api/conversation/{session_id}": ["DELETE"],
        }

        for route in app.routes:
            if hasattr(route, "methods"):
                route_path = route.path
                if route_path in method_mappings:
                    expected_methods = method_mappings[route_path]
                    for method in expected_methods:
                        assert method in route.methods, (
                            f"Method {method} not found for route {route_path}"
                        )
