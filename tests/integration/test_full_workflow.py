#!/usr/bin/env python3

import pytest
import json
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient

from main import app


@pytest.mark.integration
class TestFullWorkflow:
    """Integration tests for complete application workflows."""

    def setup_method(self):
        """Set up test client and common mocks."""
        self.client = TestClient(app)

    def test_complete_voice_assistant_workflow(self):
        """Test complete workflow: health check -> transcribe -> chat -> TTS."""

        # Mock all services
        with (
            patch(
                "services.ollama_service.ollama_service.check_health",
                new_callable=AsyncMock,
            ) as mock_ollama_health,
            patch(
                "services.whisper_service.whisper_service.get_model_info"
            ) as mock_whisper_info,
            patch("services.tts_service.tts_service.get_engine_info") as mock_tts_info,
            patch(
                "services.whisper_service.whisper_service.transcribe_audio_file",
                new_callable=AsyncMock,
            ) as mock_transcribe,
            patch(
                "services.ollama_service.ollama_service.chat_completion",
                new_callable=AsyncMock,
            ) as mock_chat,
        ):
            # Set up mock responses
            mock_ollama_health.return_value = "healthy"
            mock_whisper_info.return_value = {"status": "loaded"}
            mock_tts_info.return_value = {"engine_type": "kokoro", "status": "loaded"}
            mock_transcribe.return_value = "Hello, how are you today?"
            mock_chat.return_value = {
                "response": "I'm doing great! How can I help you?"
            }

            # Step 1: Check health
            health_response = self.client.get("/api/health")
            assert health_response.status_code == 200
            health_data = health_response.json()
            assert health_data["status"] == "healthy"
            assert health_data["whisper_status"] == "loaded"
            assert health_data["ollama_status"] == "healthy"
            assert health_data["tts_status"] == "loaded"

            # Step 2: Transcribe audio
            test_audio = ("audio.wav", b"fake_audio_data", "audio/wav")
            transcribe_response = self.client.post(
                "/api/transcribe", files={"audio_file": test_audio}
            )
            assert transcribe_response.status_code == 200
            transcription_data = transcribe_response.json()
            assert transcription_data["transcription"] == "Hello, how are you today?"

            # Step 3: Chat completion
            chat_data = {
                "text": transcription_data["transcription"],
                "session_id": "test_workflow",
            }
            chat_response = self.client.post("/api/chat", json=chat_data)
            assert chat_response.status_code == 200
            chat_result = chat_response.json()
            assert chat_result["response"] == "I'm doing great! How can I help you?"

            # Verify services were called in the right order with correct data
            mock_transcribe.assert_called_once()
            mock_chat.assert_called_once()

            # Verify chat was called with transcribed text
            chat_call_args = mock_chat.call_args[0][0]
            assert chat_call_args.text == "Hello, how are you today?"
            assert chat_call_args.session_id == "test_workflow"

    def test_error_recovery_workflow(self):
        """Test workflow with service failures and recovery."""

        with (
            patch(
                "services.ollama_service.ollama_service.check_health",
                new_callable=AsyncMock,
            ) as mock_ollama_health,
            patch(
                "services.whisper_service.whisper_service.get_model_info"
            ) as mock_whisper_info,
            patch("services.tts_service.tts_service.get_engine_info") as mock_tts_info,
            patch(
                "services.whisper_service.whisper_service.transcribe_audio_file",
                new_callable=AsyncMock,
            ) as mock_transcribe,
            patch(
                "services.ollama_service.ollama_service.chat_completion",
                new_callable=AsyncMock,
            ) as mock_chat,
        ):
            # Simulate unhealthy services initially
            mock_ollama_health.return_value = "unhealthy"
            mock_whisper_info.return_value = {"status": "not loaded"}
            mock_tts_info.return_value = {"engine_type": "none", "status": "not loaded"}

            # Health check should still succeed but show unhealthy services
            health_response = self.client.get("/api/health")
            assert health_response.status_code == 200
            health_data = health_response.json()
            assert health_data["ollama_status"] == "unhealthy"
            assert health_data["whisper_status"] == "not loaded"

            # Transcription should fail
            from fastapi import HTTPException

            mock_transcribe.side_effect = HTTPException(
                status_code=503, detail="Whisper model not loaded"
            )

            test_audio = ("audio.wav", b"fake_audio_data", "audio/wav")
            transcribe_response = self.client.post(
                "/api/transcribe", files={"audio_file": test_audio}
            )
            assert transcribe_response.status_code == 503

            # Chat should fail with OllamaConnectionError
            from exceptions import OllamaConnectionError

            mock_chat.side_effect = OllamaConnectionError("Ollama is not running")

            chat_data = {"text": "Test message", "session_id": "error_test"}
            chat_response = self.client.post("/api/chat", json=chat_data)
            assert chat_response.status_code == 503
            assert "Ollama is not running" in chat_response.json()["detail"]

            # Now simulate recovery - services become healthy
            mock_ollama_health.return_value = "healthy"
            mock_whisper_info.return_value = {"status": "loaded"}
            mock_tts_info.return_value = {"engine_type": "kokoro", "status": "loaded"}
            mock_transcribe.side_effect = None
            mock_transcribe.return_value = "Recovered transcription"
            mock_chat.side_effect = None
            mock_chat.return_value = {"response": "Service recovered successfully"}

            # Health check should now show healthy services
            health_response = self.client.get("/api/health")
            assert health_response.status_code == 200
            health_data = health_response.json()
            assert health_data["ollama_status"] == "healthy"
            assert health_data["whisper_status"] == "loaded"

            # Services should work again
            transcribe_response = self.client.post(
                "/api/transcribe", files={"audio_file": test_audio}
            )
            assert transcribe_response.status_code == 200

            chat_response = self.client.post("/api/chat", json=chat_data)
            assert chat_response.status_code == 200
            assert "recovered successfully" in chat_response.json()["response"]

    def test_session_management_workflow(self):
        """Test workflow with multiple sessions and conversation management."""

        with (
            patch(
                "services.ollama_service.ollama_service.chat_completion",
                new_callable=AsyncMock,
            ) as mock_chat,
            patch("state.app_state") as mock_state,
        ):
            # Set up mock state
            mock_state.conversation_history = {}

            # Simulate chat responses
            mock_chat.side_effect = [
                {"response": "Hello! I'm Luna. How can I help you?"},
                {"response": "The weather is quite nice today."},
                {"response": "Hi there! I'm Luna, your assistant."},
                {"response": "I can help with various tasks."},
            ]

            # Session 1: First conversation
            chat1_msg1 = {"text": "Hello", "session_id": "session_1"}
            response1 = self.client.post("/api/chat", json=chat1_msg1)
            assert response1.status_code == 200
            assert "Luna" in response1.json()["response"]

            chat1_msg2 = {"text": "What's the weather like?", "session_id": "session_1"}
            response2 = self.client.post("/api/chat", json=chat1_msg2)
            assert response2.status_code == 200
            assert "weather" in response2.json()["response"]

            # Session 2: Different conversation
            chat2_msg1 = {"text": "Hi", "session_id": "session_2"}
            response3 = self.client.post("/api/chat", json=chat2_msg1)
            assert response3.status_code == 200
            assert "Luna" in response3.json()["response"]

            chat2_msg2 = {"text": "What can you do?", "session_id": "session_2"}
            response4 = self.client.post("/api/chat", json=chat2_msg2)
            assert response4.status_code == 200
            assert "help" in response4.json()["response"]

            # Clear session 1
            with patch(
                "services.ollama_service.ollama_service.clear_conversation"
            ) as mock_clear:
                mock_clear.return_value = {
                    "status": "success",
                    "message": "Conversation history cleared",
                }

                clear_response = self.client.delete("/api/conversation/session_1")
                assert clear_response.status_code == 200
                assert clear_response.json()["status"] == "success"
                mock_clear.assert_called_once_with("session_1")

    @pytest.mark.asyncio
    async def test_websocket_full_workflow(self):
        """Test complete WebSocket workflow with multiple message types."""

        from api.websocket import WebSocketManager

        # Mock WebSocket and services
        mock_websocket = AsyncMock()
        mock_websocket.send_text = AsyncMock()
        mock_websocket.accept = AsyncMock()

        # Mock disconnect after processing messages
        messages = [
            json.dumps({"type": "ping", "timestamp": 123456}),
            json.dumps({"type": "mode_change", "mode": "voice"}),
            json.dumps({"type": "chat", "text": "Hello Luna"}),
            json.dumps({"type": "tts", "text": "Response text", "voice": "default"}),
            json.dumps({"type": "stop"}),
        ]

        from fastapi import WebSocketDisconnect

        mock_websocket.receive_text.side_effect = messages + [
            WebSocketDisconnect(code=1000)
        ]

        with (
            patch(
                "services.ollama_service.ollama_service.chat_completion",
                new_callable=AsyncMock,
            ) as mock_chat,
            patch("services.tts_service.tts_service.tts_generator") as mock_tts_gen,
            patch(
                "services.tts_service.tts_service.stop_playback", new_callable=AsyncMock
            ) as mock_stop,
            patch("state.app_state") as mock_state,
            patch("asyncio.create_task") as mock_create_task,
        ):
            # Mock the TTS generator's engine_type
            mock_tts_gen.engine_type = "kokoro"

            mock_state.current_mode = {}
            mock_state.conversation_history = {}
            mock_state.current_playback_process = None
            mock_state.current_playback_task = None

            mock_chat.return_value = {"response": "Hello! How can I help you?"}

            manager = WebSocketManager()
            await manager.handle_websocket_connection(mock_websocket)

            # Verify WebSocket was accepted
            mock_websocket.accept.assert_called_once()

            # Verify all messages were processed (should have multiple send_text calls)
            assert (
                mock_websocket.send_text.call_count >= 3
            )  # At least pong, mode_change, and chat_response

            # Verify services were called
            mock_chat.assert_called_once()
            mock_create_task.assert_called_once()  # For TTS task
            mock_stop.assert_called()  # For stop and cleanup

    def test_concurrent_requests_workflow(self):
        """Test workflow with concurrent requests to different endpoints."""
        import concurrent.futures

        with (
            patch(
                "services.ollama_service.ollama_service.check_health",
                new_callable=AsyncMock,
            ) as mock_health,
            patch(
                "services.whisper_service.whisper_service.get_model_info"
            ) as mock_whisper_info,
            patch("services.tts_service.tts_service.get_engine_info") as mock_tts_info,
            patch(
                "services.whisper_service.whisper_service.transcribe_audio_file",
                new_callable=AsyncMock,
            ) as mock_transcribe,
            patch(
                "services.ollama_service.ollama_service.chat_completion",
                new_callable=AsyncMock,
            ) as mock_chat,
        ):
            # Set up mock responses
            mock_health.return_value = "healthy"
            mock_whisper_info.return_value = {"status": "loaded"}
            mock_tts_info.return_value = {"engine_type": "kokoro", "status": "loaded"}

            def transcribe_request():
                mock_transcribe.return_value = "Concurrent transcription"
                test_audio = ("audio.wav", b"fake_audio_data", "audio/wav")
                return self.client.post(
                    "/api/transcribe", files={"audio_file": test_audio}
                )

            def chat_request(session_id):
                mock_chat.return_value = {"response": f"Response for {session_id}"}
                chat_data = {
                    "text": f"Message for {session_id}",
                    "session_id": session_id,
                }
                return self.client.post("/api/chat", json=chat_data)

            def health_request():
                return self.client.get("/api/health")

            # Run concurrent requests
            with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
                futures = []

                # Submit multiple concurrent requests
                futures.append(executor.submit(health_request))
                futures.append(executor.submit(transcribe_request))
                futures.append(executor.submit(chat_request, "session_1"))
                futures.append(executor.submit(chat_request, "session_2"))
                futures.append(executor.submit(health_request))

                # Wait for all requests to complete
                results = [
                    future.result()
                    for future in concurrent.futures.as_completed(futures)
                ]

                # Verify all requests succeeded
                for result in results:
                    assert result.status_code == 200

                # Verify services were called multiple times
                assert mock_health.call_count >= 2
                assert mock_transcribe.call_count >= 1
                assert mock_chat.call_count >= 2

    def test_frontend_serving_workflow(self):
        """Test frontend HTML serving workflow."""

        with patch("api.routes.get_frontend_html") as mock_get_html:
            mock_get_html.return_value = """
            <!DOCTYPE html>
            <html>
            <head><title>Luna Voice Assistant</title></head>
            <body>
                <div id="app">Voice Assistant Interface</div>
                <script>console.log('Frontend loaded');</script>
            </body>
            </html>
            """

            # Test root endpoint serves HTML
            response = self.client.get("/")
            assert response.status_code == 200
            assert "text/html" in response.headers["content-type"]
            assert "Luna Voice Assistant" in response.text
            assert "Voice Assistant Interface" in response.text

            # Test favicon endpoint
            favicon_response = self.client.get("/favicon.ico")
            assert favicon_response.status_code == 204

            mock_get_html.assert_called_once()


@pytest.mark.integration
class TestPerformanceWorkflow:
    """Performance and stress testing workflows."""

    def test_high_load_health_checks(self):
        """Test performance under high load of health check requests."""

        with (
            patch(
                "services.ollama_service.ollama_service.check_health",
                new_callable=AsyncMock,
            ) as mock_health,
            patch(
                "services.whisper_service.whisper_service.get_model_info"
            ) as mock_whisper_info,
            patch("services.tts_service.tts_service.get_engine_info") as mock_tts_info,
        ):
            mock_health.return_value = "healthy"
            mock_whisper_info.return_value = {"status": "loaded"}
            mock_tts_info.return_value = {"engine_type": "kokoro", "status": "loaded"}

            client = TestClient(app)

            # Make many rapid requests
            responses = []
            for i in range(20):
                response = client.get("/api/health")
                responses.append(response)

            # All requests should succeed
            for response in responses:
                assert response.status_code == 200
                data = response.json()
                assert data["status"] == "healthy"

    def test_large_message_handling(self):
        """Test handling of large messages."""

        with patch(
            "services.ollama_service.ollama_service.chat_completion",
            new_callable=AsyncMock,
        ) as mock_chat:
            mock_chat.return_value = {"response": "Handled large message successfully"}

            # Create a very large message
            large_text = "This is a test message. " * 1000  # ~23KB message
            chat_data = {"text": large_text, "session_id": "large_test"}

            client = TestClient(app)
            response = client.post("/api/chat", json=chat_data)

            assert response.status_code == 200
            data = response.json()
            assert "successfully" in data["response"]
