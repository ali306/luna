#!/usr/bin/env python3

import pytest
import sys
import numpy as np
import tempfile
import json
import asyncio
from unittest.mock import Mock, AsyncMock, patch, MagicMock, call

from services.tts_service import TTSService, tts_service
from models.schemas import TTSRequest
from exceptions import (
    TTSError,
    TTSEngineUnavailableError,
    TTSPlaybackError,
    TTSGenerationError,
)


class TestTTSService:
    """Test cases for TTSService."""

    def setup_method(self):
        """Set up test fixtures before each test method."""
        self.service = TTSService()

    def test_initialize_tts_success(self, mock_kokoro_engine):
        """Test successful TTS engine initialization."""
        with patch.object(self.service.tts_generator, "initialize_engine") as mock_init:
            self.service.initialize_tts()
            mock_init.assert_called_once()

    def test_initialize_tts_failure(self):
        """Test TTS initialization failure."""
        with patch.object(self.service.tts_generator, "initialize_engine") as mock_init:
            mock_init.side_effect = TTSEngineUnavailableError(
                "TTS engine could not be initialized"
            )

            with pytest.raises(
                TTSEngineUnavailableError, match="TTS engine could not be initialized"
            ):
                self.service.initialize_tts()

    @pytest.mark.asyncio
    async def test_process_and_play_audio_success(
        self, sample_audio_data, mock_websocket
    ):
        """Test successful audio processing and playback."""
        temp_filename = "/tmp/test.wav"

        with (
            patch(
                "services.audio_processor.AudioProcessor.process_audio_file",
                new_callable=AsyncMock,
            ) as mock_process,
            patch.object(
                self.service, "_play_audio_file_cancellable", new_callable=AsyncMock
            ) as mock_play,
            patch(
                "services.audio_processor.AudioProcessor.send_completion_signal",
                new_callable=AsyncMock,
            ) as mock_complete,
        ):
            mock_process.return_value = 2.5

            duration = await self.service._process_and_play_audio(
                temp_filename, 1234567890.0, mock_websocket
            )

            assert duration == 2.5
            mock_process.assert_called_once_with(
                temp_filename, 1234567890.0, mock_websocket
            )
            mock_play.assert_called_once_with(temp_filename)
            mock_complete.assert_called_once_with(mock_websocket)

    @pytest.mark.asyncio
    async def test_play_audio_file_cancellable_with_audio_player(self):
        """Test audio playback using the audio player."""
        filename = "/tmp/test.wav"

        with (
            patch.object(
                self.service.audio_player, "play_file", new_callable=AsyncMock
            ) as mock_play,
            patch("state.app_state") as mock_state,
        ):
            mock_state.playback_lock = asyncio.Lock()

            await self.service._play_audio_file_cancellable(filename)

            mock_play.assert_called_once_with(filename)

    @pytest.mark.asyncio
    async def test_play_audio_file_cancellable_success(self):
        """Test successful cancellable audio playback."""
        filename = "/tmp/test.wav"

        with (
            patch.object(
                self.service.audio_player, "play_file", new_callable=AsyncMock
            ) as mock_play,
            patch("state.app_state") as mock_state,
        ):
            mock_state.playback_lock = asyncio.Lock()

            await self.service._play_audio_file_cancellable(filename)

            mock_play.assert_called_once_with(filename)

    @pytest.mark.asyncio
    async def test_play_audio_file_cancellable_cancelled(self):
        """Test cancellable audio playback when cancelled."""
        filename = "/tmp/test.wav"

        with (
            patch.object(
                self.service.audio_player, "play_file", new_callable=AsyncMock
            ) as mock_play,
            patch("state.app_state") as mock_state,
        ):
            mock_state.playback_lock = asyncio.Lock()
            mock_play.side_effect = asyncio.CancelledError()

            with pytest.raises(asyncio.CancelledError):
                await self.service._play_audio_file_cancellable(filename)

    @pytest.mark.asyncio
    async def test_kokoro_tts_success(self, mock_websocket):
        """Test successful Kokoro TTS generation."""
        request = TTSRequest(text="Hello world", voice="default", speed=1.0)

        mock_audio_data = np.array([0.1, 0.2, 0.3], dtype=np.float32)

        with (
            patch.object(self.service.tts_generator, "generate_audio") as mock_generate,
            patch(
                "utils.temp_file_manager.TempFileManager.managed_temp_file"
            ) as mock_temp,
            patch.object(
                self.service, "_process_and_play_audio", new_callable=AsyncMock
            ) as mock_process,
            patch("state.app_state") as mock_state,
        ):
            mock_generate.return_value = mock_audio_data
            mock_temp.return_value.__enter__.return_value = "/tmp/test.wav"
            mock_process.return_value = 2.5
            mock_state.playback_lock = asyncio.Lock()

            result = await self.service.kokoro_tts(request, mock_websocket)

            assert result["status"] == "success"
            assert result["duration"] == 2.5

            mock_generate.assert_called_once_with(request)
            mock_process.assert_called_once()

    @pytest.mark.asyncio
    async def test_kokoro_tts_engine_not_available(self):
        """Test Kokoro TTS when engine is not available."""
        request = TTSRequest(text="Test", voice="default", speed=1.0)

        with patch.object(
            self.service.tts_generator, "generate_audio"
        ) as mock_generate:
            mock_generate.side_effect = TTSEngineUnavailableError(
                "TTS engine is not available"
            )

            with pytest.raises(
                TTSEngineUnavailableError, match="TTS engine is not available"
            ):
                await self.service.kokoro_tts(request)

    @pytest.mark.asyncio
    async def test_kokoro_tts_generation_error(self, mock_websocket):
        """Test Kokoro TTS generation error handling."""
        request = TTSRequest(text="Test", voice="default", speed=1.0)

        with (
            patch.object(self.service.tts_generator, "generate_audio") as mock_generate,
            patch(
                "services.audio_processor.AudioProcessor.send_error_and_complete",
                new_callable=AsyncMock,
            ) as mock_error,
            patch("state.app_state") as mock_state,
        ):
            mock_generate.side_effect = TTSGenerationError("Generation failed")
            mock_state.playback_lock = asyncio.Lock()

            with pytest.raises(TTSGenerationError, match="Generation failed"):
                await self.service.kokoro_tts(request, mock_websocket)

            mock_error.assert_called_once()

    @pytest.mark.asyncio
    async def test_kokoro_tts_unexpected_error(self, mock_websocket):
        """Test Kokoro TTS unexpected error handling."""
        request = TTSRequest(text="Test", voice="default", speed=1.0)

        with (
            patch.object(self.service.tts_generator, "generate_audio") as mock_generate,
            patch(
                "services.audio_processor.AudioProcessor.send_error_and_complete",
                new_callable=AsyncMock,
            ) as mock_error,
            patch("state.app_state") as mock_state,
        ):
            mock_generate.side_effect = Exception("Unexpected error")
            mock_state.playback_lock = asyncio.Lock()

            with pytest.raises(TTSError):
                await self.service.kokoro_tts(request, mock_websocket)

            mock_error.assert_called_once()

    @pytest.mark.asyncio
    async def test_stop_playback_success(self):
        """Test successful playback stopping."""
        from state import app_state

        with patch.object(
            self.service.audio_player, "stop_playback", new_callable=AsyncMock
        ) as mock_stop:
            app_state.current_playback_process = "dummy_process"
            app_state.current_playback_task = Mock()

            await self.service.stop_playback()

            mock_stop.assert_called_once()
            assert app_state.current_playback_process is None
            assert app_state.current_playback_task is None

    @pytest.mark.asyncio
    async def test_stop_playback_with_task_cancellation(self):
        """Test stop playback with task cancellation."""
        from state import app_state

        mock_task = Mock()

        with patch.object(
            self.service.audio_player, "stop_playback", new_callable=AsyncMock
        ) as mock_stop:
            app_state.current_playback_process = "dummy_process"
            app_state.current_playback_task = mock_task

            await self.service.stop_playback()

            mock_stop.assert_called_once()
            mock_task.cancel.assert_called_once()
            assert app_state.current_playback_process is None
            assert app_state.current_playback_task is None

    @pytest.mark.asyncio
    async def test_stop_playback_error_handling(self):
        """Test stop playback error handling."""
        with patch.object(
            self.service.audio_player, "stop_playback", new_callable=AsyncMock
        ) as mock_stop:
            mock_stop.side_effect = Exception("Stop failed")

            with pytest.raises(Exception, match="Stop failed"):
                await self.service.stop_playback()

    def test_is_available_true(self):
        """Test is_available returns True when engine is available."""
        with patch.object(self.service.tts_generator, "is_available") as mock_available:
            mock_available.return_value = True
            assert self.service.is_available() is True

    def test_is_available_false(self):
        """Test is_available returns False when engine is not available."""
        with patch.object(self.service.tts_generator, "is_available") as mock_available:
            mock_available.return_value = False
            assert self.service.is_available() is False

    def test_get_engine_info(self):
        """Test get_engine_info returns engine information."""
        expected_info = {"engine_type": "kokoro", "status": "loaded"}

        with patch.object(self.service.tts_generator, "get_engine_info") as mock_info:
            mock_info.return_value = expected_info
            info = self.service.get_engine_info()
            assert info == expected_info

    def test_engine_type_property(self):
        """Test engine_type property returns correct value."""
        with patch.object(self.service.tts_generator, "engine_type", "kokoro"):
            assert self.service.engine_type == "kokoro"


class TestTTSServiceGlobal:
    """Test cases for the global tts_service instance."""

    def test_global_instance_exists(self):
        """Test that global tts_service instance exists."""
        assert tts_service is not None
        assert isinstance(tts_service, TTSService)

    def test_global_instance_has_components(self):
        """Test that global tts_service has required components."""
        assert hasattr(tts_service, "tts_generator")
        assert hasattr(tts_service, "audio_player")
