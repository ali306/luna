#!/usr/bin/env python3

import pytest
import asyncio
from unittest.mock import Mock, AsyncMock, patch, MagicMock
import sys
from fastapi.testclient import TestClient

from main import app, load_models, lifespan


class TestMainApplication:
    """Test cases for the main FastAPI application."""

    def test_app_creation(self):
        """Test that the FastAPI app is created correctly."""
        assert app.title == "Voice Assistant API"
        assert app.version == "1.0.0"

    def test_cors_middleware(self):
        """Test that CORS middleware is configured."""
        # Check that CORS middleware exists in the middleware stack
        cors_middleware_found = False
        for middleware in app.user_middleware:
            if "CORSMiddleware" in str(middleware.cls):
                cors_middleware_found = True
                break
        assert cors_middleware_found

    @pytest.mark.asyncio
    async def test_load_models_success(self, mock_whisper_model, mock_kokoro_engine):
        """Test successful model loading."""
        with (
            patch(
                "services.whisper_service.whisper_service.load_model",
                new_callable=AsyncMock,
            ) as mock_whisper_load,
            patch("services.tts_service.tts_service.initialize_tts") as mock_tts_init,
        ):
            mock_whisper_load.return_value = None
            mock_tts_init.return_value = True

            # Should not raise any exception
            await load_models()

            mock_whisper_load.assert_called_once()
            mock_tts_init.assert_called_once()

    @pytest.mark.asyncio
    async def test_load_models_failure(self):
        """Test model loading failure handling."""
        with (
            patch(
                "services.whisper_service.whisper_service.load_model",
                new_callable=AsyncMock,
            ) as mock_whisper_load,
            patch("services.tts_service.tts_service.initialize_tts") as mock_tts_init,
        ):
            mock_whisper_load.side_effect = Exception("Model loading failed")

            # Should not raise exception, just log error
            await load_models()

            mock_whisper_load.assert_called_once()

    @pytest.mark.asyncio
    async def test_lifespan_context_manager(self):
        """Test the lifespan context manager."""
        mock_app = Mock()

        with patch("main.load_models", new_callable=AsyncMock) as mock_load:
            async with lifespan(mock_app):
                pass  # Test that context manager works

            mock_load.assert_called_once()


class TestWebSocketEndpoint:
    """Test cases for WebSocket endpoint."""

    @pytest.mark.asyncio
    async def test_websocket_endpoint(self, mock_websocket):
        """Test WebSocket endpoint connection handling."""
        with patch(
            "api.websocket.websocket_manager.handle_websocket_connection",
            new_callable=AsyncMock,
        ) as mock_handle:
            # Import the websocket endpoint function
            from main import websocket_endpoint

            await websocket_endpoint(mock_websocket)

            mock_handle.assert_called_once_with(mock_websocket)


class TestMainFunction:
    """Test cases for the main function."""

    def test_main_function_duplicate_execution(self, mock_process_manager):
        """Test main function prevents duplicate execution."""
        with (
            patch("main.process_manager", mock_process_manager),
            patch("main.logger") as mock_logger,
        ):
            mock_process_manager.prevent_duplicate_execution.return_value = False

            with pytest.raises(SystemExit) as exc_info:
                from main import main

                main()

            assert exc_info.value.code == 0

    def test_main_function_port_in_use(self, mock_process_manager):
        """Test main function when port is already in use."""
        with (
            patch("main.process_manager", mock_process_manager),
            patch("main.logger") as mock_logger,
        ):
            mock_process_manager.prevent_duplicate_execution.return_value = True
            mock_process_manager.is_another_instance_running.return_value = True

            with pytest.raises(SystemExit) as exc_info:
                from main import main

                main()

            assert exc_info.value.code == 0

    def test_main_function_pid_file_creation_failure(self, mock_process_manager):
        """Test main function when PID file creation fails."""
        with (
            patch("main.process_manager", mock_process_manager),
            patch("main.logger") as mock_logger,
        ):
            mock_process_manager.prevent_duplicate_execution.return_value = True
            mock_process_manager.is_another_instance_running.return_value = False
            mock_process_manager.create_pid_file.return_value = False

            with pytest.raises(SystemExit) as exc_info:
                from main import main

                main()

            assert exc_info.value.code == 1

    def test_main_function_bundled_mode(self, mock_process_manager):
        """Test main function in bundled mode (PyInstaller)."""
        with (
            patch("main.process_manager", mock_process_manager),
            patch("main.logger") as mock_logger,
            patch("main.uvicorn") as mock_uvicorn,
            patch("sys.frozen", True, create=True),
        ):
            mock_process_manager.prevent_duplicate_execution.return_value = True
            mock_process_manager.is_another_instance_running.return_value = False
            mock_process_manager.create_pid_file.return_value = True

            from main import main

            main()

            # Check that uvicorn.run was called with reload=False
            mock_uvicorn.run.assert_called_once()
            call_args = mock_uvicorn.run.call_args
            assert call_args[1]["reload"] == False

    def test_main_function_development_mode(self, mock_process_manager):
        """Test main function in development mode."""
        with (
            patch("main.process_manager", mock_process_manager),
            patch("main.logger") as mock_logger,
            patch("main.uvicorn") as mock_uvicorn,
        ):
            mock_process_manager.prevent_duplicate_execution.return_value = True
            mock_process_manager.is_another_instance_running.return_value = False
            mock_process_manager.create_pid_file.return_value = True

            # Ensure sys.frozen is not set
            if hasattr(sys, "frozen"):
                delattr(sys, "frozen")

            from main import main

            main()

            # Check that uvicorn.run was called with reload=True
            mock_uvicorn.run.assert_called_once()
            call_args = mock_uvicorn.run.call_args
            assert call_args[1]["reload"] == True

    def test_main_function_keyboard_interrupt(self, mock_process_manager):
        """Test main function handles keyboard interrupt."""
        with (
            patch("main.process_manager", mock_process_manager),
            patch("main.logger") as mock_logger,
            patch("main.uvicorn") as mock_uvicorn,
        ):
            mock_process_manager.prevent_duplicate_execution.return_value = True
            mock_process_manager.is_another_instance_running.return_value = False
            mock_process_manager.create_pid_file.return_value = True
            mock_uvicorn.run.side_effect = KeyboardInterrupt()

            with pytest.raises(SystemExit) as exc_info:
                from main import main

                main()

            assert exc_info.value.code == 0
            mock_process_manager.cleanup_pid_file.assert_called_once()

    def test_main_function_unexpected_error(self, mock_process_manager):
        """Test main function handles unexpected errors."""
        with (
            patch("main.process_manager", mock_process_manager),
            patch("main.logger") as mock_logger,
            patch("main.uvicorn") as mock_uvicorn,
        ):
            mock_process_manager.prevent_duplicate_execution.return_value = True
            mock_process_manager.is_another_instance_running.return_value = False
            mock_process_manager.create_pid_file.return_value = True
            mock_uvicorn.run.side_effect = Exception("Unexpected error")

            with pytest.raises(SystemExit) as exc_info:
                from main import main

                main()

            assert exc_info.value.code == 1
            mock_process_manager.cleanup_pid_file.assert_called_once()


class TestAppIntegration:
    """Integration tests for the FastAPI application."""

    def test_app_startup(self):
        """Test that the application starts up correctly."""
        client = TestClient(app)

        # Test that we can make a request to the favicon endpoint
        response = client.get("/favicon.ico")
        assert response.status_code == 204

    def test_health_endpoint_available(self):
        """Test that health endpoint is available."""
        client = TestClient(app)

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

            response = client.get("/api/health")
            assert response.status_code == 200

    def test_root_endpoint(self):
        """Test that root endpoint serves HTML."""
        with patch("utils.resource_utils.get_frontend_html") as mock_get_html:
            mock_get_html.return_value = "<html><body>Test</body></html>"

            client = TestClient(app)
            response = client.get("/")

            assert response.status_code == 200
            assert "text/html" in response.headers.get("content-type", "")
