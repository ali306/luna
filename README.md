<p align="center">
<img width="128" height="128" alt="icon" src="https://github.com/user-attachments/assets/f42544d3-5c87-428a-9d34-4a07ac189705" />
</p>

<h1 align="center">Luna</h1>

<p align="center"> Cross-platform local desktop voice assistant built with Tauri.</p>

## Key Features

- Fully local processing with no cloud dependencies
- Push-to-talk recording (Space), text input mode (T), and keyboard shortcuts for seamless interaction
- Audio-reactive animation
- Pure Rust backend

## Demo

*Prompt: Hi.*

https://github.com/user-attachments/assets/2f21e56a-6d9a-442a-8d94-ba597cca34aa

## Architecture

<img width="3841" height="2161" alt="Luna Architecture Light" src="https://github.com/user-attachments/assets/1e101cf6-48d1-402a-9579-6833e1d57bd6#gh-light-mode-only" />

<img width="3841" height="2161" alt="Luna Architecture Dark" src="https://github.com/user-attachments/assets/ef80b492-6698-4852-88a2-4efac236fb3d#gh-dark-mode-only" />

Luna is a Tauri app with a pure Rust backend and Svelte 5 frontend. The backend uses OpenAI's [Whisper](https://github.com/openai/whisper) for STT, [Ollama](https://ollama.com/) for LLM integration, and [Kokoro](https://huggingface.co/hexgrad/Kokoro-82M) for TTS. 

> [!NOTE]
> The backend has been migrated from FastAPI (Python) to pure Rust, and the frontend to Svelte 5.

## Prerequisites

### Required Dependencies
- **Node.js** 18+ and **pnpm**
- **Rust** and **Cargo**
- **Ollama** with a compatible model (default: gemma3:1b)
- **FFmpeg**
- **espeak-ng** (for text-to-speech phonemization)

> [!NOTE]
> Performance varies significantly based on hardware.

## Installation

### 1. Clone and Setup
```bash
git clone https://github.com/ali306/luna.git
cd luna
pnpm install
```

### 2. Download Models
Download the required models:
```bash
./download-models.sh
```

This will download:
- Kokoro TTS models (`model.onnx` and `af_heart.bin` voice file)
- Whisper STT models (base.en)

The files will be placed in `src-tauri/resources/`.

### 3. Setup Ollama
Install Ollama from https://ollama.com/download, then pull a model:
```bash
ollama pull gemma3:1b  # Default model
```

### 4. Install espeak-ng
espeak-ng is required for text-to-speech phonemization:

**macOS (Homebrew):**
```bash
brew install espeak-ng
```

**Linux (Debian/Ubuntu):**
```bash
sudo apt-get install espeak-ng
```

**Linux (Fedora/RHEL):**
```bash
sudo dnf install espeak-ng
```

**Windows:**
Download and install from https://github.com/espeak-ng/espeak-ng/releases


### 5. Building

```bash
pnpm build:app
```

> [!TIP]
> If you encounter issues building on macOS, try running:
> ```bash
> ./build-release-darwin.sh
> ```

## Development

```bash
pnpm tauri dev
```

## Configuration

```bash
export OLLAMA_HOST="http://localhost:11434"
export OLLAMA_MODEL="gemma3:1b"

export WHISPER_MODEL="base.en"

export LUNA_SERVER_PORT="40000"
```

## Testing

```bash
pnpm test
cargo test
```

## Troubleshooting

### espeak-ng Detection

If automatic detection fails, set the `ESPEAK_DATA_PATH` environment variable before running the application:

```bash
export ESPEAK_DATA_PATH=/path/to/espeak-ng-data    # macOS/Linux
set ESPEAK_DATA_PATH=C:\path\to\espeak-ng-data     # Windows
```

## License

MIT License
