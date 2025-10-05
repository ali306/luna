#!/usr/bin/env python3

from fastapi import APIRouter, UploadFile, File, HTTPException, Response
from fastapi.responses import HTMLResponse

from exceptions import (
    WhisperError,
    WhisperModelError,
    WhisperTranscriptionError,
    AudioValidationError,
    OllamaError,
    OllamaConnectionError,
    OllamaResponseError,
)
from models.schemas import (
    ChatMessage,
    TranscriptionResponse,
    ChatResponse,
    HealthResponse,
    ConversationClearResponse,
)
from services.whisper_service import whisper_service
from services.ollama_service import ollama_service
from services.tts_service import tts_service
from utils.resource_utils import get_frontend_html
from config import WHISPER_MODEL_SIZE, OLLAMA_MODEL

router = APIRouter()


@router.get("/favicon.ico", include_in_schema=False)
async def favicon():
    """Handle favicon requests"""
    return Response(status_code=204)


@router.get("/", response_class=HTMLResponse)
async def get_frontend():
    """Serve the frontend HTML page"""
    html_content = get_frontend_html()
    return HTMLResponse(content=html_content)


@router.post("/api/transcribe", response_model=TranscriptionResponse)
async def transcribe_audio(audio_file: UploadFile = File(...)):
    """Transcribe uploaded audio file using Whisper"""
    try:
        transcription = await whisper_service.transcribe_audio_file(audio_file)
        return TranscriptionResponse(transcription=transcription)
    except AudioValidationError as e:
        if e.error_code in [
            "unsupported_extension",
            "file_too_large",
            "content_too_large",
        ]:
            status_code = 413 if "large" in e.error_code else 400
        else:
            status_code = 400
        raise HTTPException(status_code=status_code, detail=str(e))
    except WhisperModelError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except WhisperTranscriptionError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except WhisperError as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/chat", response_model=ChatResponse)
async def chat_completion(message: ChatMessage):
    """Process chat completion request using Ollama"""
    try:
        result = await ollama_service.chat_completion(message)
        return ChatResponse(response=result["response"])
    except OllamaConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except OllamaResponseError as e:
        status_code = 502 if "json_parse_error" in e.error_code else 500
        raise HTTPException(status_code=status_code, detail=str(e))
    except OllamaError as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/health", response_model=HealthResponse)
async def health_check():
    """Check the health status of all services"""
    try:
        # Check Ollama status
        ollama_status = await ollama_service.check_health()

        # Get service information
        whisper_info = whisper_service.get_model_info()
        tts_info = tts_service.get_engine_info()

        return HealthResponse(
            status="healthy",
            whisper_model=WHISPER_MODEL_SIZE,
            whisper_status=whisper_info["status"],
            ollama_status=ollama_status,
            ollama_model=OLLAMA_MODEL,
            tts_engine=tts_info["engine_type"],
            tts_status=tts_info["status"],
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Health check failed: {str(e)}")


@router.delete(
    "/api/conversation/{session_id}", response_model=ConversationClearResponse
)
async def clear_conversation(session_id: str):
    """Clear conversation history for a specific session"""
    result = ollama_service.clear_conversation(session_id)
    return ConversationClearResponse(status=result["status"], message=result["message"])
