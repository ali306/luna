#!/usr/bin/env python3

import numpy as np
import tempfile
from typing import Dict, List, Any


class TestData:
    """Test data factory for generating mock data for tests."""

    @staticmethod
    def create_sample_audio(
        duration: float = 1.0, sample_rate: int = 16000
    ) -> np.ndarray:
        """Create sample audio data for testing."""
        num_samples = int(duration * sample_rate)
        # Generate a simple sine wave
        t = np.linspace(0, duration, num_samples)
        frequency = 440  # A4 note
        audio = 0.3 * np.sin(2 * np.pi * frequency * t)
        return audio.astype(np.float32)

    @staticmethod
    def create_stereo_audio(
        duration: float = 1.0, sample_rate: int = 16000
    ) -> np.ndarray:
        """Create sample stereo audio data for testing."""
        num_samples = int(duration * sample_rate)
        t = np.linspace(0, duration, num_samples)

        # Left channel: 440Hz sine wave
        left = 0.3 * np.sin(2 * np.pi * 440 * t)
        # Right channel: 660Hz sine wave
        right = 0.3 * np.sin(2 * np.pi * 660 * t)

        stereo = np.column_stack((left, right))
        return stereo.astype(np.float32)

    @staticmethod
    def create_mock_upload_file(
        filename: str = "test.wav",
        content: bytes = b"fake_audio_data",
        content_type: str = "audio/wav",
    ):
        """Create a mock UploadFile for testing."""
        from unittest.mock import Mock, AsyncMock

        mock_file = Mock()
        mock_file.filename = filename
        mock_file.content_type = content_type
        mock_file.read = AsyncMock(return_value=content)
        return mock_file

    @staticmethod
    def create_websocket_messages() -> Dict[str, Any]:
        """Create sample WebSocket message data."""
        return {
            "ping": {"type": "ping", "timestamp": 1234567890},
            "pong": {"type": "pong", "timestamp": 1234567890},
            "chat": {"type": "chat", "text": "Hello, how are you?"},
            "tts": {
                "type": "tts",
                "text": "Hello world",
                "voice": "default",
                "speed": 1.0,
            },
            "stop": {"type": "stop"},
            "mode_change": {"type": "mode_change", "mode": "voice"},
            "error": {"type": "error", "message": "Test error message"},
            "chat_response": {
                "type": "chat_response",
                "response": "I'm doing well, thank you!",
            },
            "tts_complete": {"type": "tts_complete"},
            "audio_analysis": {
                "type": "audio_analysis",
                "duration": 2.5,
                "analysis": {"amplitude": [0.1, 0.2, 0.3, 0.2, 0.1]},
                "start_time": 1234567890.123,
                "estimated_start_delay": 0.3,
            },
        }

    @staticmethod
    def create_chat_messages() -> List[Dict[str, str]]:
        """Create sample chat message history."""
        return [
            {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user", "content": "Hello!"},
            {"role": "assistant", "content": "Hello! How can I help you today?"},
            {"role": "user", "content": "What's the weather like?"},
            {
                "role": "assistant",
                "content": "I don't have access to current weather data.",
            },
        ]

    @staticmethod
    def create_ollama_responses() -> Dict[str, Any]:
        """Create sample Ollama API responses."""
        return {
            "success": {
                "message": {"content": "This is a successful response from Ollama."}
            },
            "alternative_format": {
                "messages": [{"content": "Response in alternative format"}]
            },
            "error": {"error": "Model not found"},
            "empty_content": {"message": {"content": ""}},
            "no_content": {},
            "tags_response": {
                "models": [
                    {"name": "llama3.2", "size": 123456789},
                    {"name": "codellama", "size": 234567890},
                ]
            },
        }

    @staticmethod
    def create_whisper_responses() -> Dict[str, Any]:
        """Create sample Whisper model responses."""
        return {
            "success": {"text": "This is a successful transcription."},
            "empty_text": {"text": ""},
            "whitespace_text": {"text": "   \n\t  "},
            "long_transcription": {
                "text": "This is a very long transcription that might be returned by Whisper when processing a lengthy audio file with lots of speech content."
            },
            "special_characters": {
                "text": "Hello! How are you? I'm fine, thanks. What's new?"
            },
            "multilingual": {"text": "Hello, comment allez-vous? ¿Cómo estás?"},
        }

    @staticmethod
    def create_tts_audio_segments() -> List[np.ndarray]:
        """Create sample TTS audio segments."""
        segments = []
        for i in range(3):
            # Create different frequency segments
            duration = 0.5
            sample_rate = 24000
            num_samples = int(duration * sample_rate)
            t = np.linspace(0, duration, num_samples)
            frequency = 440 * (i + 1)  # Different frequencies
            audio = 0.3 * np.sin(2 * np.pi * frequency * t)
            segments.append(audio.astype(np.float32))
        return segments

    @staticmethod
    def create_temp_audio_file(audio_data: np.ndarray, sample_rate: int = 16000) -> str:
        """Create a temporary audio file for testing."""
        import soundfile as sf

        temp_file = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
        temp_filename = temp_file.name
        temp_file.close()

        sf.write(temp_filename, audio_data, sample_rate)
        return temp_filename

    @staticmethod
    def create_audio_analysis_data() -> Dict[str, Any]:
        """Create sample audio analysis data."""
        return {
            "amplitude": [0.1, 0.3, 0.5, 0.7, 0.5, 0.3, 0.1],
            "frequency": [440, 880, 1320, 1760, 1320, 880, 440],
            "duration": 2.5,
            "sample_rate": 16000,
            "rms": 0.35,
            "peak": 0.7,
            "zero_crossing_rate": 0.15,
        }

    @staticmethod
    def create_app_state_data() -> Dict[str, Any]:
        """Create sample application state data."""
        return {
            "conversation_history": {
                "session1": TestData.create_chat_messages(),
                "session2": [
                    {"role": "user", "content": "Test message"},
                    {"role": "assistant", "content": "Test response"},
                ],
            },
            "current_mode": {"session1": "voice", "session2": "text"},
            "model_info": {
                "whisper": {"model_size": "base", "status": "loaded"},
                "tts": {"engine_type": "kokoro", "status": "loaded"},
                "ollama": {"host": "http://localhost:11434", "model": "llama3.2"},
            },
        }

    @staticmethod
    def create_error_scenarios() -> Dict[str, Dict[str, Any]]:
        """Create various error scenarios for testing."""
        return {
            "network_timeout": {
                "exception": "TimeoutError",
                "message": "Request timed out",
            },
            "connection_refused": {
                "exception": "ConnectionRefusedError",
                "message": "Connection refused",
            },
            "file_not_found": {
                "exception": "FileNotFoundError",
                "message": "File not found",
            },
            "permission_denied": {
                "exception": "PermissionError",
                "message": "Permission denied",
            },
            "invalid_json": {
                "exception": "json.JSONDecodeError",
                "message": "Invalid JSON format",
            },
            "http_404": {"status_code": 404, "message": "Not found"},
            "http_500": {"status_code": 500, "message": "Internal server error"},
            "model_load_error": {
                "exception": "RuntimeError",
                "message": "Model failed to load",
            },
            "audio_processing_error": {
                "exception": "ValueError",
                "message": "Invalid audio format",
            },
        }

    @staticmethod
    def create_config_variations() -> Dict[str, Dict[str, Any]]:
        """Create various configuration scenarios for testing."""
        return {
            "development": {
                "WHISPER_MODEL_SIZE": "base",
                "OLLAMA_HOST": "http://localhost:11434",
                "OLLAMA_MODEL": "llama3.2",
                "PORT": 40000,
                "DEFAULT_TTS_VOICE": "am_echo",
            },
            "production": {
                "WHISPER_MODEL_SIZE": "large",
                "OLLAMA_HOST": "http://production-server:11434",
                "OLLAMA_MODEL": "llama3.2",
                "PORT": 8000,
                "DEFAULT_TTS_VOICE": "am_echo",
            },
            "testing": {
                "WHISPER_MODEL_SIZE": "tiny",
                "OLLAMA_HOST": "http://localhost:11434",
                "OLLAMA_MODEL": "test-model",
                "PORT": 40001,
                "DEFAULT_TTS_VOICE": "test_voice",
            },
        }


def sample_audio(duration: float = 1.0) -> np.ndarray:
    """Quick access to sample audio data."""
    return TestData.create_sample_audio(duration)


def websocket_message(msg_type: str) -> Dict[str, Any]:
    """Quick access to WebSocket messages."""
    messages = TestData.create_websocket_messages()
    return messages.get(msg_type, {})


def chat_history() -> List[Dict[str, str]]:
    """Quick access to chat message history."""
    return TestData.create_chat_messages()


def mock_file(filename: str = "test.wav") -> Any:
    """Quick access to mock upload file."""
    return TestData.create_mock_upload_file(filename)
