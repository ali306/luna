#!/usr/bin/env python3

import contextlib
import logging
import os
import tempfile
from typing import Optional

import numpy as np
import soundfile as sf

from config import TTS_SAMPLE_RATE
from exceptions import TTSGenerationError

logger = logging.getLogger(__name__)


class TempFileManager:
    """Manages temporary audio files for TTS operations"""

    @staticmethod
    def create_temp_audio_file(audio_data: np.ndarray) -> str:
        """Create a temporary audio file from numpy array"""
        try:
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as temp_file:
                temp_filename = temp_file.name
                sf.write(temp_filename, audio_data, TTS_SAMPLE_RATE)

            if not os.path.exists(temp_filename):
                raise TTSGenerationError(
                    "Temporary audio file was not created",
                    error_code="file_creation_failed",
                )

            return temp_filename

        except TTSGenerationError:
            raise
        except Exception as e:
            raise TTSGenerationError(
                "Failed to create temporary audio file",
                error_code="file_creation_error",
                original_error=e,
            )

    @staticmethod
    def cleanup_temp_file(filename: Optional[str]) -> None:
        """Safely remove a temporary file"""
        if filename and os.path.exists(filename):
            with contextlib.suppress(Exception):
                os.unlink(filename)
                logger.debug(f"Cleaned up temporary file: {filename}")

    @staticmethod
    @contextlib.contextmanager
    def managed_temp_file(audio_data: np.ndarray):
        """Context manager for temporary audio files with automatic cleanup"""
        temp_filename = None
        try:
            temp_filename = TempFileManager.create_temp_audio_file(audio_data)
            yield temp_filename
        finally:
            TempFileManager.cleanup_temp_file(temp_filename)
