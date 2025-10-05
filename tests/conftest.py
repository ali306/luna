#!/usr/bin/env python3

import asyncio
import pytest
import sys
from unittest.mock import Mock, AsyncMock
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "src-python"))


@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for the test session."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
def mock_whisper_model():
    """Mock Whisper model for testing."""
    mock = Mock()
    mock.transcribe.return_value = {"text": "test transcription"}
    return mock


@pytest.fixture
def mock_kokoro_engine():
    """Mock Kokoro TTS engine for testing."""
    mock = Mock()
    mock.return_value = [("", "", [0.1, 0.2, 0.3])]  # Mock audio data
    return mock


@pytest.fixture
def mock_aiohttp_session():
    """Mock aiohttp session for testing."""
    mock_response = AsyncMock()
    mock_response.status = 200
    mock_response.json.return_value = {"message": {"content": "test response"}}
    mock_response.text.return_value = "success"

    # Create a mock that behaves like aiohttp response context manager
    class MockResponseContext:
        def __init__(self, response):
            self.response = response

        async def __aenter__(self):
            return self.response

        async def __aexit__(self, exc_type, exc_val, exc_tb):
            return None

    mock_session = AsyncMock()
    mock_session.post = Mock(return_value=MockResponseContext(mock_response))
    mock_session.get = Mock(return_value=MockResponseContext(mock_response))

    return mock_session


@pytest.fixture
def mock_aiohttp_session_with_response():
    """Factory fixture to create mock aiohttp session with custom response."""

    def _create_mock(response_data=None, status=200, text_data="success"):
        mock_response = AsyncMock()
        mock_response.status = status
        mock_response.json.return_value = response_data or {
            "message": {"content": "test response"}
        }
        mock_response.text.return_value = text_data

        # Create a mock that behaves like aiohttp response context manager
        class MockResponseContext:
            def __init__(self, response):
                self.response = response

            async def __aenter__(self):
                return self.response

            async def __aexit__(self, exc_type, exc_val, exc_tb):
                return None

        mock_session = AsyncMock()
        mock_session.post = Mock(return_value=MockResponseContext(mock_response))
        mock_session.get = Mock(return_value=MockResponseContext(mock_response))

        # Create a proper async context manager for the session
        mock_session_instance = AsyncMock()
        mock_session_instance.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session_instance.__aexit__ = AsyncMock(return_value=None)

        return mock_session_instance, mock_response

    return _create_mock


@pytest.fixture
def mock_upload_file():
    """Mock FastAPI UploadFile for testing."""
    mock_file = Mock()
    mock_file.filename = "test_audio.wav"
    mock_file.content_type = "audio/wav"
    mock_file.read = AsyncMock(return_value=b"fake_audio_data")
    return mock_file


@pytest.fixture
def sample_audio_data():
    """Sample audio data for testing."""
    import numpy as np

    return np.array([0.1, 0.2, 0.3, 0.4, 0.5], dtype=np.float32)


@pytest.fixture
def mock_websocket():
    """Mock WebSocket connection for testing."""
    mock_ws = AsyncMock()
    mock_ws.send_text = AsyncMock()
    mock_ws.receive_text = AsyncMock()
    mock_ws.accept = AsyncMock()
    mock_ws.close = AsyncMock()
    return mock_ws


@pytest.fixture(autouse=True)
def reset_app_state():
    """Reset application state before each test."""
    from state import app_state

    # Store original values
    original_values = {
        "whisper_model": app_state.whisper_model,
        "tts_engine": app_state.tts_engine,
        "tts_engine_type": app_state.tts_engine_type,
        "conversation_history": app_state.conversation_history.copy(),
        "current_playback_process": app_state.current_playback_process,
        "current_playback_task": app_state.current_playback_task,
    }

    # Reset to defaults
    app_state.whisper_model = None
    app_state.tts_engine = None
    app_state.tts_engine_type = None
    app_state.conversation_history = {}
    app_state.current_playback_process = None
    app_state.current_playback_task = None

    yield

    # Restore original values
    for key, value in original_values.items():
        setattr(app_state, key, value)


@pytest.fixture
def mock_process_manager():
    """Mock process manager for testing."""
    mock = Mock()
    mock.prevent_duplicate_execution.return_value = True
    mock.is_another_instance_running.return_value = False
    mock.create_pid_file.return_value = True
    mock.cleanup_pid_file.return_value = None
    return mock


@pytest.fixture
def mock_temp_file():
    """Mock temporary file for testing."""
    mock_file = Mock()
    mock_file.name = "/tmp/test_audio.wav"
    mock_file.__enter__ = Mock(return_value=mock_file)
    mock_file.__exit__ = Mock(return_value=None)
    return mock_file
