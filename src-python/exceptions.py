#!/usr/bin/env python3

"""
Standardized exception classes for service layer error handling.
"""


class ServiceError(Exception):
    """Base exception for all service-level errors"""

    def __init__(
        self, message: str, error_code: str = None, original_error: Exception = None
    ):
        super().__init__(message)
        self.message = message
        self.error_code = error_code or self.__class__.__name__.lower()
        self.original_error = original_error


class TTSError(ServiceError):
    """TTS service specific errors"""

    pass


class TTSEngineUnavailableError(TTSError):
    """TTS engine is not loaded or available"""

    pass


class TTSPlaybackError(TTSError):
    """Audio playback related errors"""

    pass


class TTSGenerationError(TTSError):
    """Audio generation related errors"""

    pass


class OllamaError(ServiceError):
    """Ollama service specific errors"""

    pass


class OllamaConnectionError(OllamaError):
    """Ollama connection related errors"""

    pass


class OllamaResponseError(OllamaError):
    """Ollama response parsing errors"""

    pass


class WhisperError(ServiceError):
    """Whisper service specific errors"""

    pass


class WhisperModelError(WhisperError):
    """Whisper model loading/availability errors"""

    pass


class WhisperTranscriptionError(WhisperError):
    """Whisper transcription related errors"""

    pass


class AudioValidationError(WhisperError):
    """Audio file validation errors"""

    pass
