#!/usr/bin/env python3

import whisper
import logging
import os
import sys
from typing import Optional, Any
from fastapi import UploadFile

from config import (
    WHISPER_MODEL_SIZE,
    MAX_AUDIO_FILE_SIZE_BYTES,
    MAX_AUDIO_FILE_SIZE_MB,
    SUPPORTED_EXTENSIONS,
    SUPPORTED_MIME_TYPES,
    AUDIO_SIGNATURES,
    MIN_AUDIO_SIZE,
)
from exceptions import (
    WhisperModelError,
    WhisperTranscriptionError,
    AudioValidationError,
)
from utils.resource_utils import get_resource_path
from utils.audio_utils import process_audio_bytes
from state import app_state

logger = logging.getLogger(__name__)


class WhisperService:
    """Service for speech recognition using Whisper"""

    def __init__(self):
        self.model: Optional[Any] = None

    async def load_model(self):
        """Load the Whisper model"""
        try:
            logger.info("Loading Whisper model...")
            if getattr(sys, "frozen", False):
                whisper_assets_path = get_resource_path("whisper/assets")
                if os.path.exists(whisper_assets_path):
                    os.environ["WHISPER_ASSETS_PATH"] = whisper_assets_path

            self.model = whisper.load_model(WHISPER_MODEL_SIZE)
            app_state.whisper_model = self.model
            logger.info("Whisper model loaded successfully")
        except Exception as e:
            logger.error(f"Error loading Whisper model: {e}")
            raise WhisperModelError(
                f"Failed to load Whisper model ({WHISPER_MODEL_SIZE})",
                error_code="model_load_failed",
                original_error=e,
            )

    def _validate_audio(self, audio_file: UploadFile, audio_bytes: bytes) -> None:
        """Comprehensive audio validation for file format, size, and content"""
        # Validate file extension
        filename = (audio_file.filename or "").lower()
        if not any(filename.endswith(ext) for ext in SUPPORTED_EXTENSIONS):
            raise AudioValidationError(
                f"Unsupported file extension. Supported formats: {', '.join(SUPPORTED_EXTENSIONS)}",
                error_code="unsupported_extension",
            )

        # Validate MIME type (warning only)
        if (
            audio_file.content_type
            and audio_file.content_type not in SUPPORTED_MIME_TYPES
        ):
            logger.warning(
                f"Unexpected MIME type: {audio_file.content_type}, but filename suggests audio format"
            )

        # Validate content size and format
        if len(audio_bytes) == 0:
            raise AudioValidationError("Empty audio file", error_code="empty_file")

        if len(audio_bytes) < MIN_AUDIO_SIZE:
            raise AudioValidationError(
                "Audio file is too small to be valid", error_code="file_too_small"
            )

        if len(audio_bytes) > MAX_AUDIO_FILE_SIZE_BYTES:
            raise AudioValidationError(
                f"Audio content too large. Maximum size: {MAX_AUDIO_FILE_SIZE_MB}MB",
                error_code="content_too_large",
            )

        # Check for valid audio signatures
        header = audio_bytes[:32]
        is_valid_audio = any(signature in header for signature in AUDIO_SIGNATURES)

        if not is_valid_audio:
            logger.warning("Unknown audio format detected, proceeding with processing")

    async def transcribe_audio_file(self, audio_file: UploadFile) -> str:
        """Transcribe audio from uploaded file"""
        if not self.model:
            raise WhisperModelError(
                "Whisper model is not loaded", error_code="model_not_loaded"
            )

        # Read and validate audio file
        audio_bytes = await self._read_audio_file(audio_file)
        self._validate_audio(audio_file, audio_bytes)

        # Process audio and transcribe
        audio_np = await self._process_audio(audio_bytes)
        return self._transcribe_audio(audio_np)

    async def _read_audio_file(self, audio_file: UploadFile) -> bytes:
        """Read audio file content with error handling"""
        try:
            return await audio_file.read()
        except Exception as e:
            raise AudioValidationError(
                "Failed to read audio file",
                error_code="file_read_failed",
                original_error=e,
            )

    async def _process_audio(self, audio_bytes: bytes) -> Any:
        """Process audio bytes into numpy array"""
        try:
            audio_np = await process_audio_bytes(audio_bytes)
            if audio_np.size == 0:
                raise WhisperTranscriptionError(
                    "Could not process audio data - no audio content extracted",
                    error_code="empty_audio_data",
                )
            return audio_np
        except WhisperTranscriptionError:
            raise
        except Exception as e:
            raise WhisperTranscriptionError(
                "Failed to process audio bytes",
                error_code="audio_processing_failed",
                original_error=e,
            )

    def _transcribe_audio(self, audio_np: Any) -> str:
        """Perform actual transcription"""
        if not self.model:
            raise WhisperModelError(
                "Whisper model is not loaded", error_code="model_not_loaded"
            )

        try:
            result = self.model.transcribe(audio_np, fp16=False, language="en")
            return str(result.get("text", "")).strip()
        except Exception as e:
            raise WhisperTranscriptionError(
                "Whisper transcription failed",
                error_code="transcription_failed",
                original_error=e,
            )

    def is_loaded(self) -> bool:
        """Check if the Whisper model is loaded"""
        return self.model is not None

    def get_model_info(self) -> dict:
        """Get information about the loaded model"""
        return {
            "model_size": WHISPER_MODEL_SIZE,
            "status": "loaded" if self.is_loaded() else "not loaded",
        }


whisper_service = WhisperService()
