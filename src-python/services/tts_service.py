#!/usr/bin/env python3

import asyncio
import logging
import time
from typing import Optional

from exceptions import TTSError
from models.schemas import TTSRequest
from services.audio_players import AudioPlayerFactory
from services.audio_processor import AudioProcessor
from services.tts_generator import TTSGenerator
from state import app_state
from utils.temp_file_manager import TempFileManager

logger = logging.getLogger(__name__)


class TTSService:
    """Service for Text-to-Speech functionality"""

    def __init__(self):
        self.tts_generator = TTSGenerator()
        self.audio_player = AudioPlayerFactory.create_player()

    def initialize_tts(self) -> None:
        """Initialize the TTS engine"""
        self.tts_generator.initialize_engine()

    async def _process_and_play_audio(
        self, temp_filename: str, start_time: float, websocket=None
    ) -> float:
        """Process audio file and play it"""
        duration = await AudioProcessor.process_audio_file(
            temp_filename, start_time, websocket
        )
        await self._play_audio_file_cancellable(temp_filename)
        await AudioProcessor.send_completion_signal(websocket)
        return duration

    async def _play_audio_file_cancellable(self, filename: str):
        """Wrapper to run audio playback in a cancellable task"""
        task = None
        try:
            task = asyncio.create_task(self.audio_player.play_file(filename))
            with app_state.playback_lock:
                app_state.current_playback_task = task

            await task

        except asyncio.CancelledError:
            logger.info("Audio playback was cancelled")
            if task and not task.done():
                task.cancel()
            raise
        finally:
            with app_state.playback_lock:
                app_state.current_playback_task = None
                app_state.current_playback_process = None

    async def kokoro_tts(self, request: TTSRequest, websocket=None) -> dict:
        """Generate speech using Kokoro TTS"""
        try:
            start_time = time.time()

            # Generate audio
            audio_data = self.tts_generator.generate_audio(request)

            # Create temporary file and process audio
            with TempFileManager.managed_temp_file(audio_data) as temp_filename:
                duration = await self._process_and_play_audio(
                    temp_filename, start_time, websocket
                )

            return {
                "status": "success",
                "message": "Kokoro TTS completed",
                "duration": duration,
            }

        except TTSError as e:
            await AudioProcessor.send_error_and_complete(
                websocket, f"TTS failed: {str(e)}"
            )
            raise
        except Exception as e:
            logger.error(f"Unexpected TTS error: {e}")
            tts_error = TTSError(
                "Unexpected TTS error occurred",
                error_code="unexpected_error",
                original_error=e,
            )
            await AudioProcessor.send_error_and_complete(
                websocket, f"TTS failed: {str(tts_error)}"
            )
            raise tts_error
        finally:
            with app_state.playback_lock:
                app_state.current_playback_process = None
                app_state.current_playback_task = None

    async def stop_playback(self):
        """Stop any current audio playback"""
        try:
            # Check if there was actually any playback to stop
            had_active_playback = (
                app_state.current_playback_process is not None
                or app_state.current_playback_task is not None
            )

            await self.audio_player.stop_playback()

            if app_state.current_playback_task:
                app_state.current_playback_task.cancel()

            app_state.current_playback_process = None
            app_state.current_playback_task = None

            if had_active_playback:
                logger.info("Playback stopped successfully")
        except Exception as e:
            logger.error(f"Error stopping playback: {e}")
            raise

    def is_available(self) -> bool:
        """Check if TTS engine is available"""
        return self.tts_generator.is_available()

    def get_engine_info(self) -> dict:
        """Get information about the TTS engine"""
        return self.tts_generator.get_engine_info()

    @property
    def engine_type(self) -> Optional[str]:
        """Get the current engine type for compatibility"""
        return self.tts_generator.engine_type


tts_service = TTSService()
