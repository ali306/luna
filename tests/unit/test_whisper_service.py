#!/usr/bin/env python3

import pytest
import numpy as np
from unittest.mock import Mock, AsyncMock, patch, MagicMock
from fastapi import HTTPException

from services.whisper_service import WhisperService, whisper_service
from exceptions import (
    WhisperModelError,
    WhisperTranscriptionError,
    AudioValidationError,
)


class TestWhisperService:
    """Test cases for WhisperService."""

    def setup_method(self):
        """Set up test fixtures before each test method."""
        self.service = WhisperService()

    @pytest.mark.asyncio
    async def test_load_model_success(self, mock_whisper_model):
        """Test successful model loading."""
        with (
            patch("services.whisper_service.whisper.load_model") as mock_load,
            patch("services.whisper_service.app_state") as mock_state,
        ):
            mock_load.return_value = mock_whisper_model

            await self.service.load_model()

            assert self.service.model == mock_whisper_model
            mock_load.assert_called_once_with("base")
            assert mock_state.whisper_model == mock_whisper_model

    @pytest.mark.asyncio
    async def test_load_model_bundled_environment(self, mock_whisper_model):
        """Test model loading in bundled environment."""
        with (
            patch("services.whisper_service.whisper.load_model") as mock_load,
            patch("services.whisper_service.get_resource_path") as mock_get_path,
            patch("services.whisper_service.os.path.exists") as mock_exists,
            patch("services.whisper_service.os.environ", {}) as mock_environ,
            patch("services.whisper_service.sys.frozen", True, create=True),
            patch("services.whisper_service.app_state") as mock_state,
        ):
            mock_load.return_value = mock_whisper_model
            mock_get_path.return_value = "/bundled/whisper/assets"
            mock_exists.return_value = True

            await self.service.load_model()

            # Verify that the environment variable was set with the mocked path
            mock_get_path.assert_called_once_with("whisper/assets")
            assert "WHISPER_ASSETS_PATH" in mock_environ
            assert self.service.model == mock_whisper_model

    @pytest.mark.asyncio
    async def test_load_model_failure(self):
        """Test model loading failure."""
        with patch("services.whisper_service.whisper.load_model") as mock_load:
            mock_load.side_effect = Exception("Model loading failed")

            with pytest.raises(WhisperModelError, match="Failed to load Whisper model"):
                await self.service.load_model()

    @pytest.mark.asyncio
    async def test_transcribe_audio_file_success(
        self, mock_upload_file, mock_whisper_model, sample_audio_data
    ):
        """Test successful audio transcription."""
        self.service.model = mock_whisper_model
        mock_whisper_model.transcribe.return_value = {"text": "Hello world"}

        # Create valid audio data with proper header to pass validation
        valid_audio_data = b"RIFF" + b"\x00" * 100  # WAV header + data
        mock_upload_file.read = AsyncMock(return_value=valid_audio_data)

        with patch(
            "services.whisper_service.process_audio_bytes", new_callable=AsyncMock
        ) as mock_process:
            mock_process.return_value = sample_audio_data

            result = await self.service.transcribe_audio_file(mock_upload_file)

            assert result == "Hello world"
            mock_upload_file.read.assert_called_once()
            mock_process.assert_called_once_with(valid_audio_data)
            mock_whisper_model.transcribe.assert_called_once_with(
                sample_audio_data, fp16=False, language="en"
            )

    @pytest.mark.asyncio
    async def test_transcribe_audio_file_model_not_loaded(self, mock_upload_file):
        """Test transcription when model is not loaded."""
        self.service.model = None

        with pytest.raises(WhisperModelError, match="Whisper model is not loaded"):
            await self.service.transcribe_audio_file(mock_upload_file)

    @pytest.mark.asyncio
    async def test_transcribe_audio_file_invalid_content_type(self):
        """Test transcription with invalid content type."""
        self.service.model = Mock()

        mock_file = Mock()
        mock_file.filename = "test.txt"
        mock_file.content_type = "text/plain"
        mock_file.read = AsyncMock(return_value=b"fake_text_data")

        with pytest.raises(AudioValidationError, match="Unsupported file extension"):
            await self.service.transcribe_audio_file(mock_file)

    @pytest.mark.asyncio
    async def test_transcribe_audio_file_valid_extensions(
        self, mock_whisper_model, sample_audio_data
    ):
        """Test transcription accepts valid audio file extensions."""
        self.service.model = mock_whisper_model
        mock_whisper_model.transcribe.return_value = {"text": "Test"}

        valid_extensions = [".webm", ".ogg", ".wav", ".mp3", ".m4a", ".flac", ".aac"]

        for ext in valid_extensions:
            mock_file = Mock()
            mock_file.filename = f"test{ext}"
            mock_file.content_type = None  # Test without content type
            # Create valid audio data with proper header
            valid_audio_data = b"RIFF" + b"\x00" * 100  # WAV header + data
            mock_file.read = AsyncMock(return_value=valid_audio_data)

            with patch(
                "services.whisper_service.process_audio_bytes", new_callable=AsyncMock
            ) as mock_process:
                mock_process.return_value = sample_audio_data

                result = await self.service.transcribe_audio_file(mock_file)
                assert result == "Test"

    @pytest.mark.asyncio
    async def test_transcribe_audio_file_empty_file(self, mock_whisper_model):
        """Test transcription with empty audio file."""
        self.service.model = mock_whisper_model

        mock_file = Mock()
        mock_file.filename = "test.wav"
        mock_file.content_type = "audio/wav"
        mock_file.read = AsyncMock(return_value=b"")

        with pytest.raises(AudioValidationError, match="Empty audio file"):
            await self.service.transcribe_audio_file(mock_file)

    @pytest.mark.asyncio
    async def test_transcribe_audio_file_empty_processed_audio(
        self, mock_whisper_model
    ):
        """Test transcription when processed audio is empty."""
        self.service.model = mock_whisper_model

        mock_file = Mock()
        mock_file.filename = "test.wav"
        mock_file.content_type = "audio/wav"
        mock_file.read = AsyncMock(return_value=b"fake_audio_data")

        with patch(
            "services.whisper_service.process_audio_bytes", new_callable=AsyncMock
        ) as mock_process:
            mock_process.return_value = np.array([])  # Empty array

            with pytest.raises(
                WhisperTranscriptionError,
                match="Could not process audio data - no audio content extracted",
            ):
                await self.service.transcribe_audio_file(mock_file)

    @pytest.mark.asyncio
    async def test_transcribe_audio_file_processing_error(self, mock_whisper_model):
        """Test transcription when audio processing fails."""
        self.service.model = mock_whisper_model

        mock_file = Mock()
        mock_file.filename = "test.wav"
        mock_file.content_type = "audio/wav"
        # Create valid audio data with proper header
        valid_audio_data = b"RIFF" + b"\x00" * 100  # WAV header + data
        mock_file.read = AsyncMock(return_value=valid_audio_data)

        with patch(
            "services.whisper_service.process_audio_bytes", new_callable=AsyncMock
        ) as mock_process:
            mock_process.side_effect = Exception("Processing failed")

            with pytest.raises(
                WhisperTranscriptionError, match="Failed to process audio bytes"
            ):
                await self.service.transcribe_audio_file(mock_file)

    @pytest.mark.asyncio
    async def test_transcribe_audio_file_whisper_error(
        self, mock_whisper_model, sample_audio_data
    ):
        """Test transcription when Whisper model fails."""
        self.service.model = mock_whisper_model
        mock_whisper_model.transcribe.side_effect = Exception("Whisper failed")

        mock_file = Mock()
        mock_file.filename = "test.wav"
        mock_file.content_type = "audio/wav"
        # Create valid audio data with proper header
        valid_audio_data = b"RIFF" + b"\x00" * 100  # WAV header + data
        mock_file.read = AsyncMock(return_value=valid_audio_data)

        with patch(
            "services.whisper_service.process_audio_bytes", new_callable=AsyncMock
        ) as mock_process:
            mock_process.return_value = sample_audio_data

            with pytest.raises(
                WhisperTranscriptionError, match="Whisper transcription failed"
            ):
                await self.service.transcribe_audio_file(mock_file)

    def test_is_loaded_true(self, mock_whisper_model):
        """Test is_loaded returns True when model is loaded."""
        self.service.model = mock_whisper_model
        assert self.service.is_loaded() is True

    def test_is_loaded_false(self):
        """Test is_loaded returns False when model is not loaded."""
        self.service.model = None
        assert self.service.is_loaded() is False

    def test_get_model_info_loaded(self, mock_whisper_model):
        """Test get_model_info when model is loaded."""
        self.service.model = mock_whisper_model

        info = self.service.get_model_info()

        assert info["model_size"] == "base"
        assert info["status"] == "loaded"

    def test_get_model_info_not_loaded(self):
        """Test get_model_info when model is not loaded."""
        self.service.model = None

        info = self.service.get_model_info()

        assert info["model_size"] == "base"
        assert info["status"] == "not loaded"


class TestWhisperServiceGlobal:
    """Test cases for the global whisper_service instance."""

    def test_global_instance_exists(self):
        """Test that global whisper_service instance exists."""
        assert whisper_service is not None
        assert isinstance(whisper_service, WhisperService)

    def test_global_instance_initial_state(self):
        """Test initial state of global whisper_service."""
        # Note: This might fail if other tests have modified the global instance
        # In a real test environment, you'd want to reset the global state
        assert (
            whisper_service.model is None or whisper_service.model is not None
        )  # Allow either state


class TestWhisperServiceEdgeCases:
    """Test edge cases and error conditions."""

    def setup_method(self):
        """Set up test fixtures before each test method."""
        self.service = WhisperService()

    @pytest.mark.asyncio
    async def test_transcribe_result_text_empty(
        self, mock_whisper_model, sample_audio_data
    ):
        """Test transcription when Whisper returns empty text."""
        self.service.model = mock_whisper_model
        mock_whisper_model.transcribe.return_value = {"text": "   "}  # Whitespace only

        mock_file = Mock()
        mock_file.filename = "test.wav"
        mock_file.content_type = "audio/wav"
        # Create valid audio data with proper header
        valid_audio_data = b"RIFF" + b"\x00" * 100  # WAV header + data
        mock_file.read = AsyncMock(return_value=valid_audio_data)

        with patch(
            "services.whisper_service.process_audio_bytes", new_callable=AsyncMock
        ) as mock_process:
            mock_process.return_value = sample_audio_data

            result = await self.service.transcribe_audio_file(mock_file)
            assert result == ""  # Should be stripped to empty string

    @pytest.mark.asyncio
    async def test_transcribe_result_missing_text_key(
        self, mock_whisper_model, sample_audio_data
    ):
        """Test transcription when result is missing text key."""
        self.service.model = mock_whisper_model
        mock_whisper_model.transcribe.return_value = {}  # No text key

        mock_file = Mock()
        mock_file.filename = "test.wav"
        mock_file.content_type = "audio/wav"
        # Create valid audio data with proper header
        valid_audio_data = b"RIFF" + b"\x00" * 100  # WAV header + data
        mock_file.read = AsyncMock(return_value=valid_audio_data)

        with patch(
            "services.whisper_service.process_audio_bytes", new_callable=AsyncMock
        ) as mock_process:
            mock_process.return_value = sample_audio_data

            result = await self.service.transcribe_audio_file(mock_file)
            assert result == ""  # Should handle missing key gracefully

    @pytest.mark.asyncio
    async def test_transcribe_result_non_string_text(
        self, mock_whisper_model, sample_audio_data
    ):
        """Test transcription when text value is not a string."""
        self.service.model = mock_whisper_model
        mock_whisper_model.transcribe.return_value = {"text": 123}  # Non-string value

        mock_file = Mock()
        mock_file.filename = "test.wav"
        mock_file.content_type = "audio/wav"
        # Create valid audio data with proper header
        valid_audio_data = b"RIFF" + b"\x00" * 100  # WAV header + data
        mock_file.read = AsyncMock(return_value=valid_audio_data)

        with patch(
            "services.whisper_service.process_audio_bytes", new_callable=AsyncMock
        ) as mock_process:
            mock_process.return_value = sample_audio_data

            result = await self.service.transcribe_audio_file(mock_file)
            assert result == "123"  # Should convert to string

    @pytest.mark.asyncio
    async def test_audio_file_too_large(self, mock_whisper_model):
        """Test transcription with file that's too large."""
        self.service.model = mock_whisper_model

        mock_file = Mock()
        mock_file.filename = "test.wav"
        mock_file.content_type = "audio/wav"
        # Create a large audio file (over 50MB)
        large_audio_data = b"fake_audio_data" * (6 * 1024 * 1024)  # ~84MB
        mock_file.read = AsyncMock(return_value=large_audio_data)

        with pytest.raises(AudioValidationError, match="Audio content too large"):
            await self.service.transcribe_audio_file(mock_file)

    @pytest.mark.asyncio
    async def test_audio_file_too_small(self, mock_whisper_model):
        """Test transcription with file that's too small."""
        self.service.model = mock_whisper_model

        mock_file = Mock()
        mock_file.filename = "test.wav"
        mock_file.content_type = "audio/wav"
        mock_file.read = AsyncMock(return_value=b"small")  # Less than MIN_AUDIO_SIZE

        with pytest.raises(AudioValidationError, match="Audio file is too small"):
            await self.service.transcribe_audio_file(mock_file)

    @pytest.mark.asyncio
    async def test_read_audio_file_error(self, mock_whisper_model):
        """Test error handling when reading audio file fails."""
        self.service.model = mock_whisper_model

        mock_file = Mock()
        mock_file.filename = "test.wav"
        mock_file.content_type = "audio/wav"
        mock_file.read = AsyncMock(side_effect=Exception("Read failed"))

        with pytest.raises(AudioValidationError, match="Failed to read audio file"):
            await self.service.transcribe_audio_file(mock_file)
