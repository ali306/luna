#!/usr/bin/env python3

# Prevents PyInstaller multiprocessing issues
import multiprocessing

multiprocessing.freeze_support()

import logging
import sys
import uvicorn
import warnings
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware

from config import PORT, ALLOWED_ORIGINS, WHISPER_MODEL_SIZE, OLLAMA_HOST, OLLAMA_MODEL
from exceptions import WhisperModelError, TTSEngineUnavailableError
from services.whisper_service import whisper_service
from services.tts_service import tts_service
from api.routes import router
from api.websocket import websocket_manager
from utils.process_manager import process_manager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

warnings.filterwarnings("ignore", category=FutureWarning)


async def load_models():
    """Load all required models and services"""
    try:
        try:
            await whisper_service.load_model()
        except WhisperModelError as e:
            logger.error(f"Whisper model loading failed: {e}")
        try:
            tts_service.initialize_tts()
        except TTSEngineUnavailableError as e:
            logger.error(f"TTS engine initialization failed: {e}")

        logger.info("Model loading completed")
    except Exception as e:
        logger.error(f"Unexpected error during model loading: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    try:
        await load_models()
    except Exception as e:
        logger.error(f"Failed to initialize models: {e}")
    yield
    logger.info("Shutting down...")


app = FastAPI(title="Voice Assistant API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket_manager.handle_websocket_connection(websocket)


def initialize_process_management():
    """Initialize process management and prevent duplicate execution"""
    if not process_manager.prevent_duplicate_execution():
        sys.exit(0)

    if process_manager.is_another_instance_running():
        logger.info("Another instance is already running. Exiting gracefully.")
        sys.exit(0)

    if not process_manager.create_pid_file():
        logger.error("Failed to create PID file. Exiting.")
        sys.exit(1)


def log_startup_info():
    """Log startup information and configuration"""
    logger.info("Starting Voice Assistant Server...")
    logger.info(f"Whisper Model: {WHISPER_MODEL_SIZE}")
    logger.info(f"Ollama Host: {OLLAMA_HOST}")
    logger.info(f"Ollama Model: {OLLAMA_MODEL}")
    logger.info("\nMake sure Ollama is running with the specified model!")
    logger.info(f"Server will be available at: http://localhost:{PORT}")


def detect_runtime_environment():
    """Detect runtime environment and return appropriate reload setting"""
    if getattr(sys, "frozen", False):
        logger.info("Running in bundled mode")
        return False
    else:
        logger.info("Running in development mode")
        return True


def start_server(reload_enabled):
    """Start the uvicorn server with the specified configuration"""
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=PORT,
        reload=reload_enabled,
        log_level="info",
        ws_ping_interval=None,
        ws_ping_timeout=None,
        loop="asyncio",
    )


def main():
    """Main entry point"""

    try:
        initialize_process_management()
        log_startup_info()
        reload_enabled = detect_runtime_environment()
        start_server(reload_enabled)
    except KeyboardInterrupt:
        logger.info("Received keyboard interrupt, shutting down gracefully...")
        process_manager.cleanup_pid_file()
        sys.exit(0)
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        process_manager.cleanup_pid_file()
        sys.exit(1)


if __name__ == "__main__":
    main()
