# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Note: Don't run build commands, I would do that and give you feedback.

## Architecture

### Three-tier Architecture
1. **Frontend (TypeScript/HTML)** - Audio recording, WebSocket communication, UI animations
2. **Python Backend (FastAPI)** - Speech recognition (Whisper), TTS engines, AI chat (Ollama), WebSocket server
3. **Tauri Desktop App (Rust)** - Native OS integration, sidecar process management, window management

### Communication Flow
- Frontend → Python: Audio upload via HTTP, WebSocket for real-time communication
- Python → Ollama: AI text generation via HTTP API
- Python → System: TTS playback and audio processing
- Rust: Manages Python sidecar as persistent background process

### Key Components

#### Python Backend (`src-python/main.py`)
- FastAPI server on port 40000
- Whisper speech recognition with configurable model size
- Multiple TTS engines: Kokoro (neural), pyttsx3 (cross-platform), system TTS
- Ollama integration for AI responses
- WebSocket support for real-time communication
- Thread pool for heavy operations
- Rate limiting and session management

#### Rust Desktop App (`src-tauri/src/lib.rs`)
- Persistent sidecar management with automatic cleanup
- Port availability checking and process lifecycle management
- Health checking via curl or port detection
- Cross-platform process killing and PID management

#### Build System
- PyInstaller for creating standalone Python executables
- Tauri for native desktop packaging
- Automated dependency bundling (language-tags, espeak-data, etc.)
- Cross-platform binary naming and distribution

## Style Guide

- Don't use emojis

