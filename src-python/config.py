#!/usr/bin/env python3


SYSTEM_PROMPT = "You are a helpful, concise voice assistant. Your name is Luna. Keep responses brief and conversational. Don't respond in bullet lists. Don't speak in third person. Don't use emojis."

WHISPER_MODEL_SIZE = "base"

OLLAMA_HOST = "http://localhost:11434"
OLLAMA_MODEL = "llama3.2"

PORT = 40000

ALLOWED_ORIGINS = [
    "http://localhost:1420",
    "http://127.0.0.1:1420",
    "https://tauri.localhost",
    "tauri://localhost",
    f"http://localhost:{PORT}",
    f"http://127.0.0.1:{PORT}",
]

DEFAULT_SAMPLE_RATE = 16000
CHUNK_DURATION = 0.0427
AUDIO_TIMEOUT = 60.0

DEFAULT_TTS_VOICE = "af_heart"
DEFAULT_TTS_SPEED = 1.0
TTS_SAMPLE_RATE = 24000

OLLAMA_TIMEOUT = 60
HEALTH_CHECK_TIMEOUT = 5
PROCESS_WAIT_TIMEOUT = 0.2
PLAYBACK_CHECK_INTERVAL = 0.1

ESTIMATED_START_DELAY = 0.3

MAX_AUDIO_FILE_SIZE_MB = 50
MAX_AUDIO_FILE_SIZE_BYTES = MAX_AUDIO_FILE_SIZE_MB * 1024 * 1024

SUPPORTED_EXTENSIONS = [".webm", ".ogg", ".wav", ".mp3", ".m4a", ".flac", ".aac"]
SUPPORTED_MIME_TYPES = [
    "audio/webm",
    "audio/ogg",
    "audio/wav",
    "audio/wave",
    "audio/x-wav",
    "audio/mpeg",
    "audio/mp3",
    "audio/mp4",
    "audio/x-m4a",
    "audio/flac",
    "audio/aac",
]

AUDIO_SIGNATURES = [
    b"RIFF",  # WAV files
    b"OggS",  # OGG files
    b"ID3",  # MP3 files with ID3 tags
    b"\xff\xfb",  # MP3 files without tags
    b"\xff\xfa",  # MP3 files without tags
    b"fLaC",  # FLAC files
    b"\x00\x00\x00\x20ftypM4A",  # M4A files (partial)
    b"webm",  # WebM files (check for webm in first 32 bytes)
    b"\x1a\x45\xdf\xa3",  # EBML header for WebM
]

MIN_AUDIO_SIZE = 12

OLLAMA_CONTEXT_SIZE = 2048
