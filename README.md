# Luna

A cross-platform fully-local desktop voice assistant built with Tauri.

## Features

- **Speech Recognition** - High-quality speech-to-text using OpenAI Whisper
- **AI Conversations** - Powered by Ollama for local AI inference
- **Text-to-Speech** - Multiple TTS engines including Kokoro neural voice synthesis
- **Real-time Communication** - WebSocket-based streaming for responsive interactions
- **Cross-platform** - Native desktop app for Windows, macOS, and Linux
- **Local Processing** - All AI processing runs locally for privacy

## Architecture

**Three-tier architecture:**
- **Frontend** (TypeScript/HTML) - Audio recording, WebSocket communication, UI animations
- **Python Backend** (FastAPI) - Speech recognition, TTS engines, AI chat, WebSocket server
- **Tauri Desktop App** (Rust) - Native OS integration, sidecar process management

## Prerequisites

- Node.js and pnpm
- Python 3.8+
- Rust
- Ollama

## Quick Start

1. **Clone and install dependencies:**
   ```bash
   git clone <repository-url>
   cd luna
   pnpm install
   pip install -r requirements.txt
   ```

2. **Start development:**
   ```bash
   pnpm dev:api
   pnpm dev
   ```

3. **Build for production:**
   ```bash
   pnpm build:all
   ```

## Development Scripts

- `pnpm dev:api` - Run Python backend server
- `pnpm dev` - Run frontend development server
- `pnpm build:sidecar` - Build Python sidecar executable
- `pnpm build:app` - Build Tauri desktop application
- `pnpm build:all` - Build complete application

## Testing

**Python:**
```bash
pip install -r requirements-test.txt
python -m pytest
python -m pytest --cov=src-python
```

**Frontend:**
```bash
pnpm test
pnpm test:coverage
```

**Rust:**
```bash
cd src-tauri
cargo test
```

## Configuration

Configuration in `src-python/config.py`:

```python
PORT = 40000                    # Backend server port
WHISPER_MODEL_SIZE = "base"     # tiny, base, small, medium, large
OLLAMA_HOST = "http://localhost:11434"
OLLAMA_MODEL = "llama3.2"       # Your installed Ollama model
DEFAULT_TTS_VOICE = "af_heart"  # Kokoro TTS voice
```

## License

This project is licensed under the MIT License.
