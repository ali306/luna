#!/usr/bin/env python3

from pydantic import BaseModel, Field, validator
from typing import Dict, List, Optional, Literal


class ChatMessage(BaseModel):
    text: str
    session_id: str = "default"


class TTSRequest(BaseModel):
    text: str
    voice: str = "default"
    speed: float = 1.0


class ChatResponse(BaseModel):
    response: str


class TranscriptionResponse(BaseModel):
    transcription: str


class TTSResponse(BaseModel):
    status: str
    message: str
    duration: Optional[float] = None


class HealthResponse(BaseModel):
    status: str
    whisper_model: str
    whisper_status: str
    ollama_status: str
    ollama_model: str
    tts_engine: str
    tts_status: str


class AudioAnalysisChunk(BaseModel):
    time: float
    volume: float
    bass: float
    low_mid: float
    high_mid: float
    high: float


class WebSocketMessageBase(BaseModel):
    type: Literal["chat", "tts", "stop", "mode_change", "ping"]
    timestamp: Optional[float] = None


class ChatWebSocketMessage(WebSocketMessageBase):
    type: Literal["chat"] = "chat"
    text: str = Field(..., min_length=1, max_length=5000)


class TTSWebSocketMessage(WebSocketMessageBase):
    type: Literal["tts"] = "tts"
    text: str = Field(..., min_length=1, max_length=5000)
    voice: str = Field(default="default", max_length=50)
    speed: float = Field(default=1.0, ge=0.1, le=3.0)


class StopWebSocketMessage(WebSocketMessageBase):
    type: Literal["stop"] = "stop"


class ModeChangeWebSocketMessage(WebSocketMessageBase):
    type: Literal["mode_change"] = "mode_change"
    mode: str = Field(..., pattern="^(idle|recording|processing|speaking|text)$")


class PingWebSocketMessage(WebSocketMessageBase):
    type: Literal["ping"] = "ping"


class WebSocketResponse(BaseModel):
    type: str
    timestamp: Optional[float] = None
    response: Optional[str] = None
    message: Optional[str] = None
    duration: Optional[float] = None
    analysis: Optional[List[AudioAnalysisChunk]] = None
    start_time: Optional[float] = None
    estimated_start_delay: Optional[float] = None


class ConversationClearResponse(BaseModel):
    status: str
    message: str
