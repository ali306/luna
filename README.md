<p align="center">
<img width="128" height="128" alt="icon" src="https://github.com/user-attachments/assets/f42544d3-5c87-428a-9d34-4a07ac189705" />
</p>

<h1 align="center">Luna</h1>

<p align="center"> Cross-platform local desktop voice assistant built with Tauri.</p>

## Key Features

- Fully local processing with no cloud dependencies
- Push-to-talk recording (Space), text input mode (T), and keyboard shortcuts for seamless interaction
- Audio-reactive animation

## Demo

*Prompt: Hi!*

https://github.com/user-attachments/assets/796cad1c-d852-4783-96f8-17a3ca9d17df

*Prompt: How many calories are in an apple?*

https://github.com/user-attachments/assets/a72c8dbc-5a6b-4e8f-b50d-66e5238a5a06

*Prompt: What is the capital of New Zealand?*

https://github.com/user-attachments/assets/763618eb-5b72-4dd3-b600-108cbd810fa7

## Architecture

<img width="3841" height="2161" alt="Luna Architecture Light" src="https://github.com/user-attachments/assets/1e101cf6-48d1-402a-9579-6833e1d57bd6#gh-light-mode-only" />

<img width="3841" height="2161" alt="Luna Architecture Dark" src="https://github.com/user-attachments/assets/ef80b492-6698-4852-88a2-4efac236fb3d#gh-dark-mode-only" />

Luna is a Tauri (Rust) app, using FastAPI (Python) on the frontend. The backend uses OpenAI's [Whisper](https://github.com/openai/whisper) for STT, [Ollama](https://ollama.com/) for LLM integration and [Kokoro](https://huggingface.co/hexgrad/Kokoro-82M) for TTS

## Prerequisites

### Required Dependencies
- **Node.js** 18+ and **pnpm**
- **Python** 3.8+ and **uv**
- **Rust** and **Cargo**
- **Ollama** with Llama 3.2 model
- **FFmpeg**

> [!NOTE]
> Performance varies significantly based on hardware.

## Installation

### 1. Clone and Setup
```bash
git clone https://github.com/ali306/luna.git
cd luna
pnpm install
```

### 2. Install Python Dependencies
```bash
cd src-python
uv sync
```

### 3. Setup Ollama
Install Ollama from https://ollama.com/download, then pull the required model:
```bash
ollama pull llama3.2
```

### 4. Building

```bash
# Build Python sidecar
pnpm build:sidecar-darwin-intel    # macOS Intel
pnpm build:sidecar-darwin-arm      # macOS Apple Silicon
pnpm build:sidecar-windows         # Windows
pnpm build:sidecar-linux           # Linux

# Build Tauri application
pnpm build:app
```

## Development

```bash
# Start Python backend with uvicorn
pnpm dev:api

# Start frontend
pnpm dev
```

## Testing

```bash
# Run JavaScript/TypeScript tests
pnpm test

# Run Python tests
python3 -m pytest
```

## License

MIT License
